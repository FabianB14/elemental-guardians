import { CONFIG } from '../data/config';
import type { Element } from '../data/types';
import { distance, reachableTiles, sameCoord, unitAt, unitById } from './board';
import { defOfCard, discardCard, findCard, overHandLimit, removeFromHand } from './cards';
import { inAttackRange, resolveAttack } from './combat';
import {
  IllegalActionError,
  healUnit,
  moveUnitTo,
  pushEvent,
  requireUnit,
  unitLabel,
} from './effects';
import {
  checkVictory,
  godAlive,
  pendingDiscards,
  runEvilPhase,
  runTerrainPhase,
  startActionPhase,
  startNextRound,
} from './phases';
import {
  comboCenterLegal,
  resolveCombo,
  resolvePowerCard,
  resolveUltimate,
} from './powers';
import { Rng } from './rng';
import { spawnUnit } from './setup';
import {
  effectiveMov,
  hasAbility,
  isFlying,
  maxAttacks,
} from './stats';
import type { Action, ApplyResult, GameEvent, GameState, Unit } from './types';

export { IllegalActionError } from './effects';

/**
 * The engine's single entry point: `applyAction(state, action)`.
 *
 * Pure with respect to its input: the incoming state is deep-cloned and the
 * clone mutated. All randomness comes from `state.rngState` via the seeded Rng,
 * so the same (state, action) pair always yields the same result.
 */
export function applyAction(state: GameState, action: Action): ApplyResult {
  const next: GameState = structuredClone(state);
  const events: GameEvent[] = [];

  if (next.phase === 'gameOver') {
    throw new IllegalActionError('The game is over.');
  }

  switch (action.type) {
    case 'endPhase':
      applyEndPhase(next, events);
      break;
    case 'summon':
      applySummon(next, events, action);
      break;
    case 'move':
      applyMove(next, events, action);
      break;
    case 'attack':
      applyAttack(next, events, action);
      break;
    case 'support':
      applySupport(next, events, action);
      break;
    case 'ultimate':
      applyUltimate(next, events, action);
      break;
    case 'playPower':
      applyPlayPower(next, events, action);
      break;
    case 'playCombo':
      applyPlayCombo(next, events, action);
      break;
    case 'discard':
      applyDiscard(next, events, action);
      break;
  }

  return { state: next, events };
}

// ------------------------------------------------------------ phase flow ---

function applyEndPhase(state: GameState, events: GameEvent[]): void {
  switch (state.phase) {
    case 'summon':
      state.phase = 'action';
      startActionPhase(state);
      pushEvent(events, state, {
        type: 'phase',
        text: `— Round ${state.round}: Action Phase —`,
      });
      break;
    case 'action':
      state.phase = 'evil';
      runEvilPhase(state, events);
      if (state.result !== 'ongoing') return;
      state.phase = 'terrain';
      runTerrainPhase(state, events);
      if (state.result !== 'ongoing') return;
      if (pendingDiscards(state)) {
        state.phase = 'discard';
        pushEvent(events, state, {
          type: 'phase',
          text: 'Hand limit exceeded — discard down to 8.',
        });
      } else {
        state.phase = 'summon';
        startNextRound(state, events);
        if (state.result === 'ongoing') {
          pushEvent(events, state, {
            type: 'phase',
            text: `— Round ${state.round}: Summon Phase —`,
          });
        }
      }
      break;
    case 'discard':
      if (pendingDiscards(state)) {
        throw new IllegalActionError('Discard down to the hand limit first.');
      }
      state.phase = 'summon';
      startNextRound(state, events);
      if (state.result === 'ongoing') {
        pushEvent(events, state, {
          type: 'phase',
          text: `— Round ${state.round}: Summon Phase —`,
        });
      }
      break;
    default:
      throw new IllegalActionError(`Cannot end phase ${state.phase} manually.`);
  }
}

// ---------------------------------------------------------------- summon ---

function applySummon(
  state: GameState,
  events: GameEvent[],
  action: Extract<Action, { type: 'summon' }>,
): void {
  requirePhase(state, 'summon');
  const guardian = requireGuardian(state, action.guardian);
  if (!godAlive(state, guardian.godId)) {
    throw new IllegalActionError(`${guardian.name} has fallen and cannot summon.`);
  }
  const card = findCard(guardian, action.cardId);
  if (!card) throw new IllegalActionError('That card is not in hand.');
  const def = defOfCard(card);
  if (def.kind !== 'summon') throw new IllegalActionError(`${def.name} is not a summon.`);

  // Cost: discard N *other* cards.
  const unique = new Set(action.discardCardIds);
  if (unique.size !== action.discardCardIds.length || unique.has(card.id)) {
    throw new IllegalActionError('Discards must be distinct cards other than the summon.');
  }
  if (action.discardCardIds.length !== def.cost) {
    throw new IllegalActionError(`${def.name} costs ${def.cost} discard${def.cost === 1 ? '' : 's'}.`);
  }
  for (const id of action.discardCardIds) {
    if (!findCard(guardian, id)) throw new IllegalActionError('Discard card not in hand.');
  }

  // Placement: within 2 of your god, or adjacent to your General.
  const god = requireUnit(state, guardian.godId);
  const general = state.units.find(
    (u) => u.owner === guardian.element && u.isGeneral && u.hp > 0,
  );
  const nearGod = distance(god.pos, action.pos) <= CONFIG.summonRangeFromGod;
  const nearGeneral =
    !!general && distance(general.pos, action.pos) <= CONFIG.summonRangeFromGeneral;
  if (!nearGod && !nearGeneral) {
    throw new IllegalActionError(
      'Summons must land within 2 tiles of your god or adjacent to your General.',
    );
  }
  if (unitAt(state, action.pos)) throw new IllegalActionError('That tile is occupied.');
  if (!sameCoord(action.pos, action.pos) || action.pos.x < 0) {
    throw new IllegalActionError('Bad position.');
  }

  for (const id of action.discardCardIds) {
    discardCard(guardian, removeFromHand(guardian, id));
  }
  discardCard(guardian, removeFromHand(guardian, card.id));

  const unit = spawnUnit(state, def.unitDefId, action.pos, guardian.element);
  pushEvent(events, state, {
    type: 'summon',
    unitId: unit.id,
    pos: { ...action.pos },
    text: `${guardian.name} summons ${unitLabel(unit)} at (${action.pos.x},${action.pos.y}), discarding ${def.cost}.`,
  });
}

// ------------------------------------------------------------------ move ---

function applyMove(
  state: GameState,
  events: GameEvent[],
  action: Extract<Action, { type: 'move' }>,
): void {
  requirePhase(state, 'action');
  const unit = requireGuardianUnit(state, action.unitId);
  if (unit.tilesMovedThisTurn > 0) {
    throw new IllegalActionError(`${unitLabel(unit)} has already moved this turn.`);
  }
  if (unit.attacksUsed > 0) {
    throw new IllegalActionError(`${unitLabel(unit)} cannot move after attacking.`);
  }
  const mov = effectiveMov(state, unit);
  const option = reachableTiles(state, unit.pos, mov, isFlying(unit)).find((t) =>
    sameCoord(t.pos, action.to),
  );
  if (!option) {
    throw new IllegalActionError(`${unitLabel(unit)} cannot reach (${action.to.x},${action.to.y}).`);
  }
  moveUnitTo(state, events, unit, action.to, option.cost, '');
}

// ---------------------------------------------------------------- attack ---

function applyAttack(
  state: GameState,
  events: GameEvent[],
  action: Extract<Action, { type: 'attack' }>,
): void {
  requirePhase(state, 'action');
  const attacker = requireGuardianUnit(state, action.attackerId);
  const target = requireUnit(state, action.targetId);
  if (target.faction === 'guardian') {
    throw new IllegalActionError('Guardians do not attack their own.');
  }
  if (attacker.attacksUsed >= maxAttacks(attacker)) {
    throw new IllegalActionError(`${unitLabel(attacker)} has no attacks left.`);
  }
  if (!inAttackRange(attacker, target)) {
    throw new IllegalActionError(`${unitLabel(target)} is out of range.`);
  }
  attacker.attacksUsed++;
  const rng = new Rng(state.rngState);
  resolveAttack(state, events, rng, attacker, target);
  state.rngState = rng.state;
  checkVictory(state, events);
}

// --------------------------------------------------------------- support ---

/** Mend / Cleanse: heal an adjacent ally instead of attacking. */
function applySupport(
  state: GameState,
  events: GameEvent[],
  action: Extract<Action, { type: 'support' }>,
): void {
  requirePhase(state, 'action');
  const unit = requireGuardianUnit(state, action.unitId);
  const ability = hasAbility(unit, 'healInstead');
  if (!ability) throw new IllegalActionError(`${unitLabel(unit)} cannot support.`);
  if (unit.attacksUsed >= maxAttacks(unit)) {
    throw new IllegalActionError(`${unitLabel(unit)} has already acted.`);
  }
  const target = requireUnit(state, action.targetId);
  if (target.faction !== 'guardian' || target.id === unit.id) {
    throw new IllegalActionError('Support targets an adjacent ally.');
  }
  if (distance(unit.pos, target.pos) !== 1) {
    throw new IllegalActionError('Support target must be adjacent.');
  }
  unit.attacksUsed++;
  if (ability.cleanse && target.statuses.length > 0) {
    const removed = target.statuses.shift()!;
    pushEvent(events, state, {
      type: 'status',
      unitId: target.id,
      text: `${unitLabel(unit)} cleanses ${removed.kind} from ${unitLabel(target)}.`,
    });
  }
  healUnit(state, events, target, ability.amount, unitLabel(unit));
}

// -------------------------------------------------------------- ultimate ---

function applyUltimate(
  state: GameState,
  events: GameEvent[],
  action: Extract<Action, { type: 'ultimate' }>,
): void {
  requirePhase(state, 'action');
  const unit = requireGuardianUnit(state, action.unitId);
  const rng = new Rng(state.rngState);
  resolveUltimate(
    state,
    events,
    (attacker, defender, splash) => {
      if (attacker.attacksUsed >= maxAttacks(attacker)) {
        throw new IllegalActionError(`${unitLabel(attacker)} has no attacks left.`);
      }
      if (!inAttackRange(attacker, defender)) {
        throw new IllegalActionError(`${unitLabel(defender)} is out of range.`);
      }
      attacker.attacksUsed++;
      resolveAttack(state, events, rng, attacker, defender, {
        splashTargets: splash,
        source: 'Tidal Crash',
      });
    },
    unit,
    action.targetId,
  );
  state.rngState = rng.state;
  checkVictory(state, events);
}

// ------------------------------------------------------------ power cards ---

function applyPlayPower(
  state: GameState,
  events: GameEvent[],
  action: Extract<Action, { type: 'playPower' }>,
): void {
  requirePhase(state, 'action');
  const guardian = requireGuardian(state, action.guardian);
  const card = findCard(guardian, action.cardId);
  if (!card) throw new IllegalActionError('That card is not in hand.');
  const def = defOfCard(card);
  if (def.kind !== 'power') {
    throw new IllegalActionError(`${def.name} cannot be played on its own.`);
  }

  const god = requireUnit(state, guardian.godId);
  const targetUnit =
    action.targetId !== undefined ? requireUnit(state, action.targetId) : undefined;

  // Range is measured from the casting god to the target (unit or tile).
  if (def.range !== null) {
    const anchor = targetUnit?.pos ?? action.pos;
    if (!anchor) throw new IllegalActionError(`${def.name} needs a target.`);
    if (distance(god.pos, anchor) > def.range) {
      throw new IllegalActionError(`${def.name} has range ${def.range} from your god.`);
    }
  }
  if (targetUnit) validatePowerTarget(def.target, targetUnit);

  pushEvent(events, state, {
    type: 'card',
    text: `${guardian.name} plays ${def.name}.`,
  });
  resolvePowerCard(state, events, def, god, targetUnit, action.pos);
  discardCard(guardian, removeFromHand(guardian, card.id));
  checkVictory(state, events);
}

function validatePowerTarget(
  kind: 'enemyUnit' | 'allyUnit' | 'allyUnitOrGod' | 'enemyTroop' | 'emptyTile',
  target: Unit,
): void {
  switch (kind) {
    case 'enemyUnit':
      if (target.faction !== 'evil') throw new IllegalActionError('Target must be an enemy.');
      break;
    case 'enemyTroop':
      if (target.faction !== 'evil' || target.isGod) {
        throw new IllegalActionError('Target must be an enemy troop.');
      }
      break;
    case 'allyUnit':
      if (target.faction !== 'guardian' || target.isGod) {
        throw new IllegalActionError('Target must be an allied troop or General.');
      }
      break;
    case 'allyUnitOrGod':
      if (target.faction !== 'guardian') {
        throw new IllegalActionError('Target must be an ally.');
      }
      break;
    case 'emptyTile':
      throw new IllegalActionError('This card targets a tile, not a unit.');
  }
}

// ---------------------------------------------------------------- combos ---

function applyPlayCombo(
  state: GameState,
  events: GameEvent[],
  action: Extract<Action, { type: 'playCombo' }>,
): void {
  requirePhase(state, 'action');

  // Both contributed cards must be in the named guardians' hands and must be
  // power cards or Prisms matching their claimed element role.
  for (const contribution of action.contributions) {
    const guardian = requireGuardian(state, contribution.guardian);
    const card = findCard(guardian, contribution.cardId);
    if (!card) throw new IllegalActionError('A contributed card is not in hand.');
    const def = defOfCard(card);
    if (def.kind === 'summon') {
      throw new IllegalActionError('Summon cards cannot fuel combos.');
    }
    if (def.kind === 'power' && def.element !== contribution.as) {
      throw new IllegalActionError(`${def.name} is not a ${contribution.as} card.`);
    }
    // Prism counts as any element.
  }
  if (
    action.contributions[0].guardian === action.contributions[1].guardian &&
    action.contributions[0].cardId === action.contributions[1].cardId
  ) {
    throw new IllegalActionError('A combo needs two distinct cards.');
  }
  if (!comboCenterLegal(state, action.contributions, action.center)) {
    throw new IllegalActionError(
      `The combo centre must be within ${CONFIG.comboRange} tiles of a contributing god.`,
    );
  }

  resolveCombo(
    state,
    events,
    action.combo,
    action.contributions,
    action.center,
    action.direction,
  );

  for (const contribution of action.contributions) {
    const guardian = requireGuardian(state, contribution.guardian);
    discardCard(guardian, removeFromHand(guardian, contribution.cardId));
  }
  checkVictory(state, events);
}

// --------------------------------------------------------------- discard ---

function applyDiscard(
  state: GameState,
  events: GameEvent[],
  action: Extract<Action, { type: 'discard' }>,
): void {
  if (state.phase !== 'discard' && state.phase !== 'summon' && state.phase !== 'action') {
    throw new IllegalActionError('Cannot discard right now.');
  }
  const guardian = requireGuardian(state, action.guardian);
  if (state.phase === 'discard') {
    const over = overHandLimit(guardian);
    if (action.cardIds.length > over) {
      throw new IllegalActionError(`Discard at most ${over} card${over === 1 ? '' : 's'}.`);
    }
  }
  for (const id of action.cardIds) {
    const card = findCard(guardian, id);
    if (!card) throw new IllegalActionError('Card not in hand.');
  }
  for (const id of action.cardIds) {
    discardCard(guardian, removeFromHand(guardian, id));
  }
  pushEvent(events, state, {
    type: 'discard',
    text: `${guardian.name} discards ${action.cardIds.length}.`,
  });
}

// ----------------------------------------------------------------- guards ---

function requirePhase(state: GameState, phase: GameState['phase']): void {
  if (state.phase !== phase) {
    throw new IllegalActionError(`That action belongs to the ${phase} phase (currently ${state.phase}).`);
  }
}

function requireGuardian(state: GameState, element: Element) {
  const guardian = state.guardians.find((g) => g.element === element);
  if (!guardian) throw new IllegalActionError(`No ${element} guardian in this game.`);
  return guardian;
}

function requireGuardianUnit(state: GameState, id: number): Unit {
  const unit = requireUnit(state, id);
  if (unit.faction !== 'guardian') {
    throw new IllegalActionError('You may only command guardian units.');
  }
  // Evil gods can't move; guardian gods can. A dead god's troops still act.
  const alive = unitById(state, id);
  if (!alive || alive.hp <= 0) throw new IllegalActionError('That unit is destroyed.');
  return unit;
}
