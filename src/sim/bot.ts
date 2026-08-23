/**
 * A simple scripted guardian bot for headless autoplay.
 *
 * Deterministic: choices depend only on the state, with ties broken by ids.
 * It is intentionally basic — its job is smoke-testing balance, not brilliance.
 */
import { cardDef } from '../data/cards';
import type { Element } from '../data/types';
import {
  distance,
  livingUnits,
  reachableTiles,
  unitById,
} from '../engine/board';
import { inAttackRange } from '../engine/combat';
import { overHandLimit } from '../engine/cards';
import { godAlive } from '../engine/phases';
import { comboFor } from '../engine/powers';
import { applyAction } from '../engine/reducer';
import {
  attackRange,
  effectiveMov,
  hasAbility,
  isFlying,
  maxAttacks,
} from '../engine/stats';
import type { Action, GameState, Unit } from '../engine/types';

/** Runs one full round (summon → action → endPhase → discard) via the bot. */
export function botStep(state: GameState): GameState {
  switch (state.phase) {
    case 'summon':
      return applyAction(botSummonPhase(state), { type: 'endPhase' }).state;
    case 'action':
      return applyAction(botActionPhase(state), { type: 'endPhase' }).state;
    case 'discard':
      return applyAction(botDiscardPhase(state), { type: 'endPhase' }).state;
    default:
      return state;
  }
}

/** Plays a whole game to completion. Returns the final state. */
export function botPlay(state: GameState, maxSteps = 1000): GameState {
  let current = state;
  for (let i = 0; i < maxSteps && current.result === 'ongoing'; i++) {
    current = botStep(current);
  }
  return current;
}

function trySafe(state: GameState, action: Action): GameState {
  try {
    return applyAction(state, action).state;
  } catch {
    return state;
  }
}

// ---------------------------------------------------------------- summon ---

function botSummonPhase(state: GameState): GameState {
  let current = state;
  for (const element of current.guardianOrder) {
    let playing = true;
    while (playing) {
      playing = false;
      const guardian = current.guardians.find((g) => g.element === element)!;
      if (!godAlive(current, guardian.godId)) break;

      // Cheapest summon we can afford while keeping one card in reserve.
      const summons = guardian.hand
        .filter((c) => cardDef(c.defId).kind === 'summon')
        .sort((a, b) => cardDef(a.defId).cost - cardDef(b.defId).cost || a.id.localeCompare(b.id));
      const card = summons.find(
        (c) => cardDef(c.defId).cost <= guardian.hand.length - 2,
      );
      if (!card) break;
      const def = cardDef(card.defId);
      if (def.kind !== 'summon') break;

      const god = unitById(current, guardian.godId)!;
      const pos = summonSpot(current, god);
      if (!pos) break;

      // Discard the highest-cost other summons first, hoarding power cards.
      const fodder = guardian.hand
        .filter((c) => c.id !== card.id)
        .sort((a, b) => {
          const costDiff = cardDef(b.defId).cost - cardDef(a.defId).cost;
          if (costDiff !== 0) return costDiff;
          return a.id.localeCompare(b.id);
        })
        .slice(0, def.cost)
        .map((c) => c.id);
      if (fodder.length < def.cost) break;

      const next = trySafe(current, {
        type: 'summon',
        guardian: element,
        cardId: card.id,
        discardCardIds: fodder,
        pos,
      });
      if (next !== current) {
        current = next;
        playing = true;
      }
    }
  }
  return current;
}

/** First empty tile within 2 of the god, preferring the enemy-facing side. */
function summonSpot(state: GameState, god: Unit) {
  const options: { x: number; y: number }[] = [];
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (Math.abs(dx) + Math.abs(dy) === 0 || Math.abs(dx) + Math.abs(dy) > 2) continue;
      options.push({ x: god.pos.x + dx, y: god.pos.y + dy });
    }
  }
  const legal = options.filter(
    (pos) =>
      pos.x >= 0 &&
      pos.y >= 0 &&
      pos.x < state.width &&
      pos.y < state.height &&
      !livingUnits(state).some((u) => u.pos.x === pos.x && u.pos.y === pos.y),
  );
  // Toward the enemy: lowest y first, then lowest x.
  return legal.sort((a, b) => a.y - b.y || a.x - b.x)[0];
}

// ---------------------------------------------------------------- action ---

function botActionPhase(state: GameState): GameState {
  let current = state;

  // Move + attack with every guardian unit, in id order.
  const ids = livingUnits(current)
    .filter((u) => u.faction === 'guardian')
    .sort((a, b) => a.id - b.id)
    .map((u) => u.id);

  for (const id of ids) {
    current = botUnitTurn(current, id);
    if (current.result !== 'ongoing') return current;
  }

  // Fire off damage powers and any available combo.
  for (const element of current.guardianOrder) {
    current = botPlayPowers(current, element);
    if (current.result !== 'ongoing') return current;
  }
  current = botPlayCombo(current);
  return current;
}

function botUnitTurn(state: GameState, unitId: number): GameState {
  let current = state;
  let unit = unitById(current, unitId);
  if (!unit || unit.hp <= 0) return current;

  const enemies = () => livingUnits(current).filter((u) => u.faction === 'evil');

  // Ultimate: fire Inferno/Quake when 2+ enemies are close; Tidal Crash on a
  // clustered target; skip Cyclone (situational).
  const ultimate = hasAbility(unit, 'ultimate');
  if (ultimate && !unit.ultimateUsed && ultimate.id !== 'cyclone') {
    const nearby = enemies().filter((e) => distance(e.pos, unit!.pos) <= 2);
    if (ultimate.id === 'tidalCrash') {
      const target = enemies().find(
        (e) =>
          inAttackRange(unit!, e) &&
          enemies().some((o) => o.id !== e.id && distance(o.pos, e.pos) === 1),
      );
      if (target) {
        current = trySafe(current, { type: 'ultimate', unitId, targetId: target.id });
      }
    } else if (nearby.length >= 2) {
      current = trySafe(current, { type: 'ultimate', unitId });
    }
    unit = unitById(current, unitId);
    if (!unit || unit.hp <= 0 || current.result !== 'ongoing') return current;
  }

  // Attack if something is already in range.
  let target = pickBotTarget(current, unit);
  if (!target) {
    // Move toward the nearest enemy (gods stay home unless healthy).
    const goal = nearestEnemy(current, unit);
    if (goal && (!unit.isGod || unit.hp > unit.maxHp / 2)) {
      const mov = effectiveMov(current, unit);
      const dest = bestApproach(current, unit, goal, mov);
      if (dest) current = trySafe(current, { type: 'move', unitId, to: dest });
      unit = unitById(current, unitId);
      if (!unit || unit.hp <= 0) return current;
    }
    target = pickBotTarget(current, unit);
  }

  // Support units heal a wounded neighbour instead of feebly attacking.
  if (hasAbility(unit, 'healInstead')) {
    const patient = livingUnits(current)
      .filter(
        (u) =>
          u.faction === 'guardian' &&
          u.id !== unitId &&
          u.hp < u.maxHp &&
          distance(u.pos, unit!.pos) === 1,
      )
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.id - b.id)[0];
    if (patient) {
      return trySafe(current, { type: 'support', unitId, targetId: patient.id });
    }
  }

  for (let swing = 0; swing < maxAttacks(unit) && target; swing++) {
    current = trySafe(current, { type: 'attack', attackerId: unitId, targetId: target.id });
    if (current.result !== 'ongoing') return current;
    unit = unitById(current, unitId);
    if (!unit || unit.hp <= 0) return current;
    target = pickBotTarget(current, unit);
  }
  return current;
}

function pickBotTarget(state: GameState, unit: Unit | undefined): Unit | undefined {
  if (!unit || unit.hp <= 0 || unit.attacksUsed >= maxAttacks(unit)) return undefined;
  const reach = attackRange(unit);
  return livingUnits(state)
    .filter((u) => u.faction === 'evil' && distance(u.pos, unit.pos) <= reach)
    .sort((a, b) => {
      const godDiff = (a.isGod ? 0 : 1) - (b.isGod ? 0 : 1); // gods first: win faster
      if (godDiff !== 0) return godDiff;
      if (a.hp !== b.hp) return a.hp - b.hp;
      return a.id - b.id;
    })[0];
}

function nearestEnemy(state: GameState, unit: Unit): Unit | undefined {
  return livingUnits(state)
    .filter((u) => u.faction === 'evil')
    .sort((a, b) => {
      const distDiff = distance(a.pos, unit.pos) - distance(b.pos, unit.pos);
      if (distDiff !== 0) return distDiff;
      return a.id - b.id;
    })[0];
}

function bestApproach(state: GameState, unit: Unit, goal: Unit, mov: number) {
  const startDist = distance(unit.pos, goal.pos);
  const options = reachableTiles(state, unit.pos, mov, isFlying(unit))
    .map((t) => ({ pos: t.pos, cost: t.cost, dist: distance(t.pos, goal.pos) }))
    .filter((t) => t.dist < startDist)
    .sort(
      (a, b) =>
        a.dist - b.dist ||
        a.cost - b.cost ||
        a.pos.y * state.width + a.pos.x - (b.pos.y * state.width + b.pos.x),
    );
  return options[0]?.pos;
}

// ---------------------------------------------------------------- powers ---

function botPlayPowers(state: GameState, element: Element): GameState {
  let current = state;
  let keepGoing = true;
  while (keepGoing) {
    keepGoing = false;
    const guardian = current.guardians.find((g) => g.element === element)!;
    const god = unitById(current, guardian.godId);
    if (!god || god.hp <= 0) return current;

    for (const card of [...guardian.hand]) {
      const def = cardDef(card.defId);
      if (def.kind !== 'power') continue;
      let next = current;
      if (def.effect.kind === 'damage') {
        const target = livingUnits(current)
          .filter(
            (u) =>
              u.faction === 'evil' &&
              (def.range === null || distance(u.pos, god.pos) <= def.range),
          )
          .sort((a, b) => a.hp - b.hp || a.id - b.id)[0];
        if (target) {
          next = trySafe(current, {
            type: 'playPower',
            guardian: element,
            cardId: card.id,
            targetId: target.id,
          });
        }
      } else if (def.effect.kind === 'heal') {
        const healAmount = def.effect.amount;
        const patient = livingUnits(current)
          .filter((u) => u.faction === 'guardian' && u.hp <= u.maxHp - healAmount)
          .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.id - b.id)[0];
        if (patient) {
          next = trySafe(current, {
            type: 'playPower',
            guardian: element,
            cardId: card.id,
            targetId: patient.id,
          });
        }
      }
      // Buffs/moves/blocks: hoarded for combos; the bot keeps it simple.
      if (next !== current) {
        current = next;
        keepGoing = true;
        break;
      }
      if (current.result !== 'ongoing') return current;
    }
  }
  return current;
}

function botPlayCombo(state: GameState): GameState {
  // Find any two power/prism cards of different elements across hands.
  const holders: { element: Element; cardId: string; as: Element[] }[] = [];
  for (const guardian of state.guardians) {
    const god = unitById(state, guardian.godId);
    if (!god || god.hp <= 0) continue;
    for (const card of guardian.hand) {
      const def = cardDef(card.defId);
      if (def.kind === 'power') {
        holders.push({ element: guardian.element, cardId: card.id, as: [def.element as Element] });
      } else if (def.kind === 'prism') {
        holders.push({
          element: guardian.element,
          cardId: card.id,
          as: ['fire', 'water', 'wind', 'earth'],
        });
      }
    }
  }

  // Densest enemy cluster within combo range of a god.
  for (let i = 0; i < holders.length; i++) {
    for (let j = i + 1; j < holders.length; j++) {
      const a = holders[i]!;
      const b = holders[j]!;
      for (const asA of a.as) {
        for (const asB of b.as) {
          if (asA === asB) continue;
          const combo = comboFor(asA, asB);
          if (!combo) continue;
          if (combo.shape.kind !== 'area') continue; // bot only aims areas
          if (state.combosUsedThisRound.includes(combo.id)) continue;
          const center = bestComboCenter(state);
          if (!center) continue;
          const next = trySafe(state, {
            type: 'playCombo',
            combo: combo.id,
            contributions: [
              { guardian: a.element, cardId: a.cardId, as: asA },
              { guardian: b.element, cardId: b.cardId, as: asB },
            ],
            center,
          });
          if (next !== state) return next;
        }
      }
    }
  }
  return state;
}

/** Centre with the most evil units in its 3x3, needing at least 2. */
function bestComboCenter(state: GameState) {
  const enemies = livingUnits(state).filter((u) => u.faction === 'evil');
  let best: { x: number; y: number } | undefined;
  let bestCount = 1;
  for (const enemy of enemies) {
    const count = enemies.filter(
      (o) =>
        Math.abs(o.pos.x - enemy.pos.x) <= 1 && Math.abs(o.pos.y - enemy.pos.y) <= 1,
    ).length;
    if (count > bestCount) {
      bestCount = count;
      best = { ...enemy.pos };
    }
  }
  return best;
}

// --------------------------------------------------------------- discard ---

function botDiscardPhase(state: GameState): GameState {
  let current = state;
  for (const element of current.guardianOrder) {
    const guardian = current.guardians.find((g) => g.element === element)!;
    const over = overHandLimit(guardian);
    if (over <= 0) continue;
    // Ditch the highest-cost summons first.
    const ids = [...guardian.hand]
      .sort((a, b) => {
        const costDiff = cardDef(b.defId).cost - cardDef(a.defId).cost;
        if (costDiff !== 0) return costDiff;
        return a.id.localeCompare(b.id);
      })
      .slice(0, over)
      .map((c) => c.id);
    current = trySafe(current, { type: 'discard', guardian: element, cardIds: ids });
  }
  return current;
}
