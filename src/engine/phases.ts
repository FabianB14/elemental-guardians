import { CONFIG } from '../data/config';
import { DOOM_CARDS, DOOM_DECK_LIST } from '../data/doom';
import { TERRAIN_CARDS, TERRAIN_DECK_LIST } from '../data/terrain';
import type { Coord, DoomCardId, TerrainCardId } from '../data/types';
import { evilActingOrder, planEvilGod, planEvilUnit } from '../ai/evil';
import {
  allTiles,
  blockTiles,
  distance,
  idx,
  inBounds,
  isPassableDestination,
  livingUnits,
  sameCoord,
  tileAt,
  unitById,
} from './board';
import { resolveAttack } from './combat';
import { drawCards, overHandLimit } from './cards';
import {
  damageUnit,
  moveUnitTo,
  paintTerrain,
  pushEvent,
  unitLabel,
} from './effects';
import { Rng } from './rng';
import { spawnUnit } from './setup';
import { effectiveAtk, statusActive } from './stats';
import type { GameEvent, GameState, Unit } from './types';

// ------------------------------------------------------------ draw phase ---

/**
 * Draw Phase: every living guardian draws, then the deck-out loss check runs.
 * A guardian whose god is dead neither draws nor summons.
 */
export function runDrawPhase(state: GameState, events: GameEvent[]): void {
  pushEvent(events, state, {
    type: 'phase',
    text: `— Round ${state.round}: Draw Phase —`,
  });
  for (const guardian of state.guardians) {
    if (!godAlive(state, guardian.godId)) continue;
    drawCards(state, events, guardian, CONFIG.drawPerRound);
  }
  checkDeckOut(state, events);
}

export function godAlive(state: GameState, godId: number): boolean {
  const god = unitById(state, godId);
  return !!god && god.hp > 0;
}

/**
 * Loss check run at the start of every Draw Phase: every living guardian is
 * out of cards (deck and hand) AND the guardians control no troops.
 */
export function checkDeckOut(state: GameState, events: GameEvent[]): void {
  if (state.result !== 'ongoing') return;
  const living = state.guardians.filter((g) => godAlive(state, g.godId));
  if (living.length === 0) return; // handled by the god-death check
  const outOfCards = living.every((g) => g.deck.length === 0 && g.hand.length === 0);
  if (!outOfCards) return;
  const hasTroops = livingUnits(state).some((u) => u.faction === 'guardian' && !u.isGod);
  if (hasTroops) return;
  endGame(state, events, 'defeat', 'The guardians are out of cards and out of troops.');
}

// ------------------------------------------------------------ evil phase ---

export function runEvilPhase(state: GameState, events: GameEvent[]): void {
  pushEvent(events, state, { type: 'phase', text: `— Round ${state.round}: Evil Phase —` });
  const rng = new Rng(state.rngState);

  const count =
    state.guardianOrder.length + CONFIG.doomCardsPerRound[state.difficulty];
  for (let i = 0; i < count; i++) {
    if (state.result !== 'ongoing') break;
    resolveDoomCard(state, events, rng);
  }

  for (const actor of evilActingOrder(state)) {
    if (state.result !== 'ongoing') break;
    const unit = unitById(state, actor.id);
    if (!unit || unit.hp <= 0) continue;
    const plan = unit.isGod ? planEvilGod(state, unit) : planEvilUnit(state, unit);
    if (plan.moveTo) {
      const steps = distance(unit.pos, plan.moveTo);
      moveUnitTo(state, events, unit, plan.moveTo, steps, '');
    }
    if (plan.attackTargetId !== undefined) {
      const target = unitById(state, plan.attackTargetId);
      if (target && target.hp > 0) {
        resolveAttack(state, events, rng, unit, target);
      }
    }
  }

  state.rngState = rng.state;
  checkVictory(state, events);
}

function drawDoomCard(state: GameState, events: GameEvent[], rng: Rng): DoomCardId {
  if (state.doomDeck.length === 0) {
    state.doomDeck = rng.shuffle([...DOOM_DECK_LIST]);
    state.doomDiscard = [];
    state.doomReshuffles++;
    state.evilAtkBonus += CONFIG.corruptionRisingAtk;
    pushEvent(events, state, {
      type: 'escalation',
      text: `Corruption Rising! The Doom deck reshuffles — all evil units gain +${CONFIG.corruptionRisingAtk} ATK (total +${state.evilAtkBonus}).`,
    });
  }
  const card = state.doomDeck.shift()!;
  state.doomDiscard.push(card);
  state.stats.doomCardsResolved++;
  return card;
}

export function resolveDoomCard(state: GameState, events: GameEvent[], rng: Rng): void {
  const id = drawDoomCard(state, events, rng);
  const def = DOOM_CARDS[id];
  pushEvent(events, state, { type: 'doom', text: `Doom: ${def.name} — ${def.text}` });

  if (def.spawn) {
    for (let i = 0; i < def.spawn.count; i++) {
      spawnEvilUnit(state, events, def.spawn.unitDefId);
    }
    return;
  }

  switch (id) {
    case 'darkBolt': {
      const troops = livingUnits(state).filter((u) => u.faction === 'guardian' && !u.isGod);
      const target = troops.length > 0 ? nearestToEvil(state, troops) : undefined;
      if (target) {
        damageUnit(state, events, target, 2, 'Dark Bolt');
      } else {
        const gods = livingUnits(state).filter((u) => u.faction === 'guardian' && u.isGod);
        const god = gods.length > 0 ? nearestToEvil(state, gods) : undefined;
        if (god) damageUnit(state, events, god, 1, 'Dark Bolt');
      }
      break;
    }
    case 'creepingBlight': {
      const origin = blockNearestGuardians(state, 2);
      paintTerrain(state, events, blockTiles(state, origin, 2), 'blighted', 'Creeping Blight');
      break;
    }
    case 'siphon': {
      const troops = livingUnits(state).filter((u) => u.faction === 'guardian' && !u.isGod);
      if (troops.length === 0) break;
      const target = [...troops].sort((a, b) => {
        const atkDiff = effectiveAtk(state, b) - effectiveAtk(state, a);
        if (atkDiff !== 0) return atkDiff;
        return a.id - b.id;
      })[0]!;
      target.permAtk -= 1;
      target.permDef -= 1;
      pushEvent(events, state, {
        type: 'doom',
        unitId: target.id,
        text: `Siphon drains ${unitLabel(target)}: -1 ATK and -1 DEF, permanently.`,
      });
      break;
    }
    case 'massSummons': {
      for (const godId of state.evilGodIds) {
        const god = unitById(state, godId);
        if (!god || god.hp <= 0) continue;
        spawnEvilUnit(state, events, 'shadow-imp', god);
      }
      break;
    }
    case 'awakening': {
      state.evilAtkBonus += CONFIG.awakeningAtk;
      pushEvent(events, state, {
        type: 'escalation',
        text: `Awakening: all evil units gain +${CONFIG.awakeningAtk} ATK, permanently (total +${state.evilAtkBonus}).`,
      });
      break;
    }
    default:
      break;
  }
}

/** Closest unit in `candidates` to any evil god; ties by lowest unit id. */
function nearestToEvil(state: GameState, candidates: Unit[]): Unit | undefined {
  const gods = state.evilGodIds
    .map((id) => unitById(state, id))
    .filter((u): u is Unit => !!u && u.hp > 0);
  const anchors = gods.length > 0 ? gods : livingUnits(state).filter((u) => u.faction === 'evil');
  if (anchors.length === 0) return candidates[0];
  return [...candidates].sort((a, b) => {
    const distA = Math.min(...anchors.map((g) => distance(g.pos, a.pos)));
    const distB = Math.min(...anchors.map((g) => distance(g.pos, b.pos)));
    if (distA !== distB) return distA - distB;
    return a.id - b.id;
  })[0];
}

/**
 * Top-left corner of the `size`x`size` block closest to the guardians' units.
 * Deterministic: lowest total distance, then lowest tile index.
 */
export function blockNearestGuardians(state: GameState, size: number): Coord {
  const targets = livingUnits(state).filter((u) => u.faction === 'guardian');
  let best: Coord = { x: 0, y: state.height - size };
  let bestScore = Number.POSITIVE_INFINITY;
  for (let y = 0; y <= state.height - size; y++) {
    for (let x = 0; x <= state.width - size; x++) {
      const center = { x: x + (size - 1) / 2, y: y + (size - 1) / 2 };
      const score =
        targets.length === 0
          ? Math.abs(center.y - (state.height - 1))
          : targets.reduce((sum, u) => sum + distance(u.pos, center), 0);
      if (score < bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
  }
  return best;
}

/**
 * Evil summon placement: an empty tile adjacent to an evil god, round-robin
 * across the gods; otherwise the nearest empty tile to any shrine.
 */
export function spawnEvilUnit(
  state: GameState,
  events: GameEvent[],
  defId: string,
  forceGod?: Unit,
): Unit | undefined {
  const gods = state.evilGodIds
    .map((id) => unitById(state, id))
    .filter((u): u is Unit => !!u && u.hp > 0);
  const order = forceGod ? [forceGod] : rotate(gods, state.evilSpawnCursor);
  if (!forceGod && gods.length > 0) {
    state.evilSpawnCursor = (state.evilSpawnCursor + 1) % gods.length;
  }

  let pos: Coord | undefined;
  for (const god of order) {
    pos = adjacentEmpty(state, god.pos);
    if (pos) break;
  }
  pos ??= nearestEmptyToShrine(state);
  if (!pos) return undefined;

  const unit = spawnUnit(state, defId, pos, null);
  pushEvent(events, state, {
    type: 'summon',
    unitId: unit.id,
    pos: { ...pos },
    text: `${unitLabel(unit)} claws its way onto (${pos.x},${pos.y}).`,
  });
  return unit;
}

function rotate<T>(items: T[], offset: number): T[] {
  if (items.length === 0) return items;
  const shift = ((offset % items.length) + items.length) % items.length;
  return [...items.slice(shift), ...items.slice(0, shift)];
}

function adjacentEmpty(state: GameState, from: Coord): Coord | undefined {
  const options = [
    { x: from.x, y: from.y + 1 },
    { x: from.x + 1, y: from.y },
    { x: from.x - 1, y: from.y },
    { x: from.x, y: from.y - 1 },
  ];
  return options.find((pos) => inBounds(state, pos) && isPassableDestination(state, pos));
}

function nearestEmptyToShrine(state: GameState): Coord | undefined {
  const shrines = allTiles(state).filter((pos) => tileAt(state, pos)?.shrine);
  const anchors = shrines.length > 0 ? shrines : [{ x: 0, y: 0 }];
  const empties = allTiles(state).filter((pos) => isPassableDestination(state, pos));
  if (empties.length === 0) return undefined;
  return [...empties].sort((a, b) => {
    const distA = Math.min(...anchors.map((s) => distance(s, a)));
    const distB = Math.min(...anchors.map((s) => distance(s, b)));
    if (distA !== distB) return distA - distB;
    return idx(state, a) - idx(state, b);
  })[0];
}

// --------------------------------------------------------- terrain phase ---

export function runTerrainPhase(state: GameState, events: GameEvent[]): void {
  pushEvent(events, state, {
    type: 'phase',
    text: `— Round ${state.round}: Terrain Phase —`,
  });
  const rng = new Rng(state.rngState);

  if (state.terrainDeck.length === 0) {
    state.terrainDeck = rng.shuffle([...TERRAIN_DECK_LIST]);
    state.terrainDiscard = [];
    pushEvent(events, state, { type: 'terrain', text: 'The Terrain deck reshuffles.' });
  }
  const id = state.terrainDeck.shift()!;
  state.terrainDiscard.push(id);
  resolveTerrainCard(state, events, rng, id);

  // Ramparts last "until the next Terrain Phase".
  for (const tile of state.tiles) tile.blockedUntilRound = -1;

  state.rngState = rng.state;
  runCleanup(state, events);
}

export function resolveTerrainCard(
  state: GameState,
  events: GameEvent[],
  rng: Rng,
  id: TerrainCardId,
): void {
  const def = TERRAIN_CARDS[id];
  pushEvent(events, state, { type: 'terrain', text: `Terrain: ${def.name} — ${def.text}` });

  switch (id) {
    case 'volcanicSurge':
      paintTerrain(state, events, area3x3(state, randomCenter(state, rng)), 'volcanic', def.name);
      break;
    case 'galeFront':
      paintTerrain(state, events, area3x3(state, randomCenter(state, rng)), 'gale', def.name);
      break;
    case 'risingTide': {
      const tide = allTiles(state).filter((pos) => tileAt(state, pos)?.terrain === 'tide');
      if (tide.length === 0) {
        const origin = randomBlockOrigin(state, rng, 2);
        paintTerrain(state, events, blockTiles(state, origin, 2), 'tide', def.name);
      } else {
        const spread: Coord[] = [];
        for (const pos of allTiles(state)) {
          if (tileAt(state, pos)?.terrain === 'tide') continue;
          const touching = tide.some((t) => distance(t, pos) === 1);
          if (touching) spread.push(pos);
        }
        paintTerrain(state, events, spread, 'tide', def.name);
      }
      break;
    }
    case 'tectonicShift': {
      const origin = randomBlockOrigin(state, rng, 2);
      const tiles = blockTiles(state, origin, 2);
      paintTerrain(state, events, tiles, 'stone', def.name);
      for (const unit of livingUnits(state)) {
        if (unit.element === 'earth') continue;
        if (!tiles.some((t) => sameCoord(t, unit.pos))) continue;
        damageUnit(state, events, unit, 1, def.name);
      }
      break;
    }
    case 'withering': {
      const origin = blockNearestGuardians(state, 2);
      paintTerrain(state, events, blockTiles(state, origin, 2), 'blighted', def.name);
      break;
    }
    case 'stillness': {
      const blighted = allTiles(state).filter(
        (pos) => tileAt(state, pos)?.terrain === 'blighted' && !tileAt(state, pos)?.shrine,
      );
      paintTerrain(state, events, blighted, 'plains', def.name);
      break;
    }
  }
}

function area3x3(state: GameState, center: Coord): Coord[] {
  const tiles: Coord[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const pos = { x: center.x + dx, y: center.y + dy };
      if (inBounds(state, pos)) tiles.push(pos);
    }
  }
  return tiles;
}

function randomCenter(state: GameState, rng: Rng): Coord {
  return { x: rng.int(state.width), y: rng.int(state.height) };
}

function randomBlockOrigin(state: GameState, rng: Rng, size: number): Coord {
  return {
    x: rng.int(state.width - size + 1),
    y: rng.int(state.height - size + 1),
  };
}

// ---------------------------------------------------------------- cleanup ---

/** End-of-round: Burn ticks, expired statuses fall off, victory is re-checked. */
export function runCleanup(state: GameState, events: GameEvent[]): void {
  for (const unit of livingUnits(state)) {
    if (unit.statuses.some((s) => s.kind === 'burn' && statusActive(s, state.round))) {
      damageUnit(state, events, unit, 1, 'Burn');
    }
  }
  for (const unit of state.units) {
    unit.statuses = unit.statuses.filter(
      (s) => s.kind !== 'burn' && s.expiresRound > state.round,
    );
  }
  state.stats.cardsLeft = state.guardians.reduce(
    (sum, g) => sum + g.deck.length + g.hand.length,
    0,
  );
  checkVictory(state, events);
}

export function pendingDiscards(state: GameState): boolean {
  return state.guardians.some((g) => overHandLimit(g) > 0);
}

// ------------------------------------------------------- round advancing ---

export function startNextRound(state: GameState, events: GameEvent[]): void {
  state.round++;
  state.stats.rounds = state.round;
  state.combosUsedThisRound = [];
  for (const unit of state.units) {
    unit.tilesMovedThisTurn = 0;
    unit.attacksUsed = 0;
  }
  pushEvent(events, state, { type: 'round', text: `=== Round ${state.round} ===` });
  runDrawPhase(state, events);
}

/** Clears per-turn bookkeeping as the Action Phase opens. */
export function startActionPhase(state: GameState): void {
  for (const unit of state.units) {
    unit.tilesMovedThisTurn = 0;
    unit.attacksUsed = 0;
  }
}

// -------------------------------------------------------- victory / loss ---

export function checkVictory(state: GameState, events: GameEvent[]): void {
  if (state.result !== 'ongoing') return;

  const evilGodsAlive = state.evilGodIds.some((id) => godAlive(state, id));
  if (!evilGodsAlive) {
    endGame(state, events, 'victory', 'Every Evil God has been destroyed.');
    return;
  }
  const guardianGodsAlive = state.guardians.some((g) => godAlive(state, g.godId));
  if (!guardianGodsAlive) {
    endGame(state, events, 'defeat', 'Every Guardian God has fallen.');
    return;
  }
  if (state.round > CONFIG.maxRounds) {
    endGame(state, events, 'defeat', `The siege drags past round ${CONFIG.maxRounds}.`);
  }
}

export function endGame(
  state: GameState,
  events: GameEvent[],
  result: 'victory' | 'defeat',
  reason: string,
): void {
  state.result = result;
  state.phase = 'gameOver';
  pushEvent(events, state, {
    type: 'gameOver',
    text: `${result === 'victory' ? 'VICTORY' : 'DEFEAT'}: ${reason}`,
  });
}
