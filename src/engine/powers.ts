import { COMBOS } from '../data/combos';
import { CONFIG } from '../data/config';
import type { ComboDef, ComboId, Coord, PowerCardDef } from '../data/types';
import { unitDef } from '../data/units';
import {
  areaTiles,
  distance,
  idx,
  inBounds,
  lineTiles,
  livingUnits,
  pushDirection,
  reachableTiles,
  sameCoord,
  unitAt,
} from './board';
import {
  IllegalActionError,
  applyStatus,
  damageUnit,
  healUnit,
  moveUnitTo,
  paintTerrain,
  pushEvent,
  pushUnit,
  requireUnit,
  unitLabel,
} from './effects';
import { isFlying } from './stats';
import type { ComboContribution, GameEvent, GameState, Unit } from './types';

/** Applies a single power card's effect. Legality is checked by the caller. */
export function resolvePowerCard(
  state: GameState,
  events: GameEvent[],
  def: PowerCardDef,
  caster: Unit,
  targetUnit: Unit | undefined,
  targetPos: Coord | undefined,
): void {
  const effect = def.effect;
  switch (effect.kind) {
    case 'damage': {
      const target = requireTarget(targetUnit, def);
      damageUnit(state, events, target, effect.amount, def.name);
      break;
    }
    case 'heal': {
      const target = requireTarget(targetUnit, def);
      healUnit(state, events, target, effect.amount, def.name);
      break;
    }
    case 'buff': {
      const target = requireTarget(targetUnit, def);
      applyStatus(state, events, target, {
        kind: effect.stat === 'atk' ? 'atkMod' : 'defMod',
        amount: effect.amount,
        delayRounds: 0,
        durationRounds: effect.durationRounds,
        source: def.name,
      });
      break;
    }
    case 'moveUnit': {
      const target = requireTarget(targetUnit, def);
      if (!targetPos) throw new IllegalActionError(`${def.name} needs a destination tile.`);
      if (!inBounds(state, targetPos) || unitAt(state, targetPos)) {
        throw new IllegalActionError(`${def.name}: destination must be an empty tile.`);
      }
      if (effect.teleport) {
        if (distance(target.pos, targetPos) > effect.tiles) {
          throw new IllegalActionError(
            `${def.name}: destination must be within ${effect.tiles} tiles of the target.`,
          );
        }
        moveUnitTo(state, events, target, targetPos, 0, def.name);
      } else {
        const option = reachableTiles(state, target.pos, effect.tiles, isFlying(target)).find(
          (t) => sameCoord(t.pos, targetPos),
        );
        if (!option) {
          throw new IllegalActionError(
            `${def.name}: destination must be reachable within ${effect.tiles} tiles.`,
          );
        }
        moveUnitTo(state, events, target, targetPos, option.cost, def.name);
      }
      break;
    }
    case 'blockTile': {
      if (!targetPos) throw new IllegalActionError(`${def.name} needs a target tile.`);
      const tile = state.tiles[idx(state, targetPos)];
      if (!tile) throw new IllegalActionError(`${def.name}: target is off the board.`);
      if (unitAt(state, targetPos)) {
        throw new IllegalActionError(`${def.name}: target tile must be empty.`);
      }
      tile.blockedUntilRound = state.round;
      pushEvent(events, state, {
        type: 'card',
        pos: { ...targetPos },
        text: `${def.name}: (${targetPos.x},${targetPos.y}) is impassable until the next Terrain Phase.`,
      });
      break;
    }
  }
  void caster;
}

function requireTarget(unit: Unit | undefined, def: PowerCardDef): Unit {
  if (!unit) throw new IllegalActionError(`${def.name} needs a target.`);
  return unit;
}

/** Tiles a combo covers, given its centre (and direction for line shapes). */
export function comboTiles(
  state: GameState,
  combo: ComboDef,
  center: Coord,
  direction?: Coord,
): Coord[] {
  switch (combo.shape.kind) {
    case 'area':
      return areaTiles(state, center, combo.shape.size);
    case 'single':
      return inBounds(state, center) ? [center] : [];
    case 'line': {
      const dir = direction ?? { x: 0, y: -1 };
      if (Math.abs(dir.x) + Math.abs(dir.y) !== 1) {
        throw new IllegalActionError('A line combo needs an orthogonal direction.');
      }
      return lineTiles(state, center, dir, combo.shape.length);
    }
  }
}

/** Validates and resolves a combo. Returns the tiles it covered. */
export function resolveCombo(
  state: GameState,
  events: GameEvent[],
  comboId: ComboId,
  contributions: [ComboContribution, ComboContribution],
  center: Coord,
  direction: Coord | undefined,
): Coord[] {
  const combo = COMBOS[comboId];
  if (!combo) throw new IllegalActionError(`Unknown combo: ${comboId}`);
  if (state.combosUsedThisRound.includes(comboId)) {
    throw new IllegalActionError(`${combo.name} has already been played this round.`);
  }
  const roles = contributions.map((c) => c.as);
  if (roles[0] === roles[1]) {
    throw new IllegalActionError('A combo needs two different elements.');
  }
  if (!combo.elements.includes(roles[0]!) || !combo.elements.includes(roles[1]!)) {
    throw new IllegalActionError(
      `${combo.name} needs ${combo.elements[0]} + ${combo.elements[1]}.`,
    );
  }

  const tiles = comboTiles(state, combo, center, direction);
  const targets = livingUnits(state).filter(
    (u) => u.faction === 'evil' && tiles.some((t) => sameCoord(t, u.pos)),
  );

  pushEvent(events, state, {
    type: 'combo',
    pos: { ...center },
    text: `${combo.name}! ${combo.text} (${targets.length} target${targets.length === 1 ? '' : 's'})`,
  });

  const effect = combo.effect;
  if (effect.paint) {
    paintTerrain(state, events, tiles, effect.paint, combo.name);
  }

  for (const target of targets) {
    if (effect.push) {
      const dir = direction ?? pushDirection(center, target.pos);
      pushUnit(state, events, target, dir, effect.push);
    }
    if (effect.damage) {
      damageUnit(state, events, target, effect.damage, combo.name);
    }
    if (target.hp <= 0) continue;
    if (effect.burn) {
      applyStatus(state, events, target, {
        kind: 'burn',
        delayRounds: 0,
        durationRounds: 0,
        source: combo.name,
      });
    }
    if (effect.root) {
      applyStatus(state, events, target, {
        kind: 'rooted',
        delayRounds: effect.root.delayRounds,
        durationRounds: 0,
        source: combo.name,
      });
    }
    for (const mod of effect.mods ?? []) {
      applyStatus(state, events, target, {
        kind: mod.kind,
        amount: mod.amount,
        delayRounds: mod.delayRounds,
        durationRounds: mod.durationRounds,
        source: combo.name,
      });
    }
  }

  state.combosUsedThisRound.push(comboId);
  state.stats.combosPlayed++;
  return tiles;
}

/** The combo centre must sit within CONFIG.comboRange of a contributing god. */
export function comboCenterLegal(
  state: GameState,
  contributions: readonly ComboContribution[],
  center: Coord,
): boolean {
  return contributions.some((contribution) => {
    const guardian = state.guardians.find((g) => g.element === contribution.guardian);
    if (!guardian) return false;
    const god = state.units.find((u) => u.id === guardian.godId);
    if (!god || god.hp <= 0) return false;
    return distance(god.pos, center) <= CONFIG.comboRange;
  });
}

/** Which combo (if any) a pair of element roles forms. */
export function comboFor(a: string, b: string): ComboDef | undefined {
  return Object.values(COMBOS).find(
    (combo) =>
      (combo.elements[0] === a && combo.elements[1] === b) ||
      (combo.elements[0] === b && combo.elements[1] === a),
  );
}

// ------------------------------------------------------------- ultimates ---

export function resolveUltimate(
  state: GameState,
  events: GameEvent[],
  rngAttack: (attacker: Unit, defender: Unit, splash: Unit[]) => void,
  unit: Unit,
  targetId: number | undefined,
): void {
  const ultimate = requireUltimate(unit);
  if (unit.ultimateUsed) {
    throw new IllegalActionError(`${unitLabel(unit)} has already used ${ultimate.name}.`);
  }
  const enemies = livingUnits(state).filter((u) => u.faction !== unit.faction);

  pushEvent(events, state, {
    type: 'card',
    unitId: unit.id,
    text: `${unitLabel(unit)} unleashes ${ultimate.name}: ${ultimate.description}`,
  });

  switch (ultimate.id) {
    case 'inferno': {
      for (const enemy of enemies.filter((e) => distance(e.pos, unit.pos) <= 2)) {
        damageUnit(state, events, enemy, 2, ultimate.name);
      }
      break;
    }
    case 'cyclone': {
      for (const enemy of enemies.filter((e) => distance(e.pos, unit.pos) === 1)) {
        pushUnit(state, events, enemy, pushDirection(unit.pos, enemy.pos), 2);
      }
      break;
    }
    case 'quake': {
      for (const enemy of enemies.filter((e) => distance(e.pos, unit.pos) <= 2)) {
        applyStatus(state, events, enemy, {
          kind: 'defMod',
          amount: -1,
          delayRounds: 0,
          durationRounds: 0,
          source: ultimate.name,
        });
        applyStatus(state, events, enemy, {
          kind: 'rooted',
          delayRounds: 0,
          durationRounds: 0,
          source: ultimate.name,
        });
      }
      break;
    }
    case 'tidalCrash': {
      if (targetId === undefined) {
        throw new IllegalActionError(`${ultimate.name} needs a target.`);
      }
      const target = requireUnit(state, targetId);
      const splash = enemies.filter(
        (e) => e.id !== target.id && distance(e.pos, target.pos) === 1,
      );
      rngAttack(unit, target, splash);
      break;
    }
  }
  unit.ultimateUsed = true;
}

export function requireUltimate(unit: Unit) {
  const ultimate = unitDef(unit.defId).abilities.find((a) => a.tag === 'ultimate');
  if (!ultimate || ultimate.tag !== 'ultimate') {
    throw new IllegalActionError(`${unitLabel(unit)} has no ultimate.`);
  }
  return ultimate;
}
