import { TERRAIN_MODIFIERS } from '../data/terrain';
import { unitDef } from '../data/units';
import type { Ability, Element, TerrainType, UnitDef } from '../data/types';
import { distance, livingUnits, tileAt } from './board';
import type { GameState, Status, Unit } from './types';

export function defOf(unit: Unit): UnitDef {
  return unitDef(unit.defId);
}

export function hasAbility<T extends Ability['tag']>(
  unit: Unit,
  tag: T,
): Extract<Ability, { tag: T }> | undefined {
  return defOf(unit).abilities.find((a) => a.tag === tag) as
    | Extract<Ability, { tag: T }>
    | undefined;
}

export function isFlying(unit: Unit): boolean {
  return hasAbility(unit, 'flying') !== undefined;
}

export function terrainUnder(state: GameState, unit: Unit): TerrainType {
  return tileAt(state, unit.pos)?.terrain ?? 'plains';
}

export function statusActive(status: Status, round: number): boolean {
  return status.startsRound <= round && round <= status.expiresRound;
}

export function activeStatuses(unit: Unit, round: number): Status[] {
  return unit.statuses.filter((s) => statusActive(s, round));
}

export function isRooted(unit: Unit, round: number): boolean {
  return activeStatuses(unit, round).some((s) => s.kind === 'rooted');
}

export function hasBurn(unit: Unit): boolean {
  return unit.statuses.some((s) => s.kind === 'burn');
}

function statusSum(unit: Unit, round: number, kind: Status['kind']): number {
  return activeStatuses(unit, round)
    .filter((s) => s.kind === kind)
    .reduce((sum, s) => sum + s.amount, 0);
}

interface TerrainDelta {
  atk: number;
  def: number;
  mov: number;
}

/** Terrain contribution for a unit standing on its current tile. */
export function terrainDelta(state: GameState, unit: Unit): TerrainDelta {
  const delta: TerrainDelta = { atk: 0, def: 0, mov: 0 };
  const terrain = terrainUnder(state, unit);
  const mod = TERRAIN_MODIFIERS[terrain];

  if (mod.byElement && unit.element !== 'shadow') {
    const byElement = mod.byElement[unit.element as Element];
    if (byElement) {
      delta.atk += byElement.atk ?? 0;
      delta.def += byElement.def ?? 0;
      delta.mov += byElement.mov ?? 0;
    }
  }
  if (mod.allGuardianTroops && unit.faction === 'guardian' && !unit.isGod) {
    delta.atk += mod.allGuardianTroops.atk ?? 0;
    delta.def += mod.allGuardianTroops.def ?? 0;
    delta.mov += mod.allGuardianTroops.mov ?? 0;
  }

  // Unit-specific terrain riders (Wind Pixie on Gale, Water Kelpie on Tide).
  const bonus = defOf(unit).abilities.find(
    (a): a is Extract<Ability, { tag: 'terrainBonus' }> =>
      a.tag === 'terrainBonus' && a.terrain === terrain,
  );
  if (bonus) {
    delta.atk += bonus.atk ?? 0;
    delta.def += bonus.def ?? 0;
    delta.mov += bonus.mov ?? 0;
  }
  return delta;
}

/** Sum of allied auras affecting `unit` (excluding the unit's own aura). */
function auraDelta(state: GameState, unit: Unit): TerrainDelta {
  const delta: TerrainDelta = { atk: 0, def: 0, mov: 0 };
  for (const other of livingUnits(state)) {
    if (other.id === unit.id) continue;
    if (other.faction !== unit.faction) continue;
    for (const ability of defOf(other).abilities) {
      if (ability.tag !== 'aura') continue;
      if (distance(other.pos, unit.pos) > ability.radius) continue;
      if (ability.element && unit.element !== ability.element) continue;
      if (ability.troopsOnly && unit.isGod) continue;
      delta.atk += ability.atk ?? 0;
      delta.def += ability.def ?? 0;
      delta.mov += ability.mov ?? 0;
    }
  }
  return delta;
}

/** Void Hound pack bonus and friends. */
function packDelta(state: GameState, unit: Unit): number {
  const pack = hasAbility(unit, 'packBonus');
  if (!pack) return 0;
  const near = livingUnits(state).some(
    (o) =>
      o.id !== unit.id &&
      o.faction === unit.faction &&
      o.defId === pack.defId &&
      distance(o.pos, unit.pos) === 1,
  );
  return near ? pack.atk : 0;
}

/** Frenzy / Gale Charge: bonus for having moved far enough this turn. */
function movedDelta(unit: Unit): number {
  const bonus = hasAbility(unit, 'movedBonus');
  if (!bonus) return 0;
  return unit.tilesMovedThisTurn >= bonus.minTiles ? bonus.atk : 0;
}

export function effectiveAtk(state: GameState, unit: Unit): number {
  const base = defOf(unit).atk;
  const factionBonus = unit.faction === 'evil' ? state.evilAtkBonus : 0;
  return (
    base +
    unit.permAtk +
    factionBonus +
    statusSum(unit, state.round, 'atkMod') +
    terrainDelta(state, unit).atk +
    auraDelta(state, unit).atk +
    packDelta(state, unit) +
    movedDelta(unit)
  );
}

export function effectiveDef(state: GameState, unit: Unit): number {
  const base = defOf(unit).def;
  return (
    base +
    unit.permDef +
    statusSum(unit, state.round, 'defMod') +
    terrainDelta(state, unit).def +
    auraDelta(state, unit).def
  );
}

/**
 * Effective MOV. Rooted units cannot move at all. Flying units ignore terrain
 * MOV penalties. Terrain penalties never take a unit below 1 MOV.
 */
export function effectiveMov(state: GameState, unit: Unit): number {
  if (isRooted(unit, state.round)) return 0;
  const base = defOf(unit).mov;
  const statusMod = statusSum(unit, state.round, 'movMod');
  const auraMod = auraDelta(state, unit).mov;
  const terrainMod = terrainDelta(state, unit).mov;

  let mov = base + statusMod + auraMod;
  if (!isFlying(unit) && terrainMod !== 0) {
    if (terrainMod < 0) mov = Math.max(1, mov + terrainMod);
    else mov += terrainMod;
  } else if (isFlying(unit) && terrainMod > 0) {
    mov += terrainMod;
  }
  return Math.max(0, mov);
}

/** Sandstorm-style modifier applied to every roll the unit makes. */
export function rollMod(state: GameState, unit: Unit): number {
  return statusSum(unit, state.round, 'rollMod');
}

/** How many attacks this unit is allowed in one Action Phase. */
export function maxAttacks(unit: Unit): number {
  if (hasAbility(unit, 'doubleAttack')) return 2;
  if (hasAbility(unit, 'doubleAttackIfStill') && unit.tilesMovedThisTurn === 0) return 2;
  return 1;
}

/** Attack reach in tiles (Manhattan). */
export function attackRange(unit: Unit): number {
  return hasAbility(unit, 'ranged')?.range ?? 1;
}
