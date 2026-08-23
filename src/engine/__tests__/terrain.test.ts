import { describe, expect, it } from 'vitest';
import { idx } from '../board';
import { resolveTerrainCard } from '../phases';
import { Rng } from '../rng';
import { effectiveAtk, effectiveDef, effectiveMov } from '../stats';
import type { GameEvent, GameState, Unit } from '../types';
import { newGame, place } from './helpers';
import { unitDef } from '../../data/units';
import type { TerrainType } from '../../data/types';

const base = (defId: string) => unitDef(defId);

function onTerrain(state: GameState, unit: Unit, terrain: TerrainType) {
  state.tiles[idx(state, unit.pos)]!.terrain = terrain;
}

describe('terrain modifiers', () => {
  it('Volcanic: Fire +1 ATK, Water -1 ATK, others unchanged', () => {
    const state = newGame(['fire', 'water', 'wind', 'earth']);
    const fire = place(state, 'fire-ogre', { x: 1, y: 5 }, 'fire');
    const water = place(state, 'water-trident', { x: 3, y: 5 }, 'water');
    const wind = place(state, 'wind-griffin', { x: 5, y: 5 }, 'wind');
    for (const unit of [fire, water, wind]) onTerrain(state, unit, 'volcanic');
    expect(effectiveAtk(state, fire)).toBe(base('fire-ogre').atk + 1);
    expect(effectiveAtk(state, water)).toBe(base('water-trident').atk - 1);
    expect(effectiveAtk(state, wind)).toBe(base('wind-griffin').atk);
  });

  it('Tide: Water +1 ATK, Fire -1 ATK', () => {
    const state = newGame(['fire', 'water']);
    const fire = place(state, 'fire-ogre', { x: 1, y: 5 }, 'fire');
    const water = place(state, 'water-trident', { x: 3, y: 5 }, 'water');
    onTerrain(state, fire, 'tide');
    onTerrain(state, water, 'tide');
    expect(effectiveAtk(state, fire)).toBe(base('fire-ogre').atk - 1);
    expect(effectiveAtk(state, water)).toBe(base('water-trident').atk + 1);
  });

  it('Gale: Wind +1 MOV, Earth -1 MOV (min 1)', () => {
    const state = newGame(['wind', 'earth']);
    const wind = place(state, 'wind-unicorn', { x: 1, y: 5 }, 'wind');
    const dwarf = place(state, 'earth-dwarf', { x: 3, y: 5 }, 'earth'); // MOV 1
    onTerrain(state, wind, 'gale');
    onTerrain(state, dwarf, 'gale');
    expect(effectiveMov(state, wind)).toBe(base('wind-unicorn').mov + 1);
    expect(effectiveMov(state, dwarf)).toBe(1); // floored at 1
  });

  it('Stone: Earth +1 DEF, Wind -1 ATK', () => {
    const state = newGame(['wind', 'earth']);
    const earth = place(state, 'earth-treant', { x: 1, y: 5 }, 'earth');
    const wind = place(state, 'wind-unicorn', { x: 3, y: 5 }, 'wind');
    onTerrain(state, earth, 'stone');
    onTerrain(state, wind, 'stone');
    expect(effectiveDef(state, earth)).toBe(base('earth-treant').def + 1);
    expect(effectiveAtk(state, wind)).toBe(base('wind-unicorn').atk - 1);
  });

  it('Blighted: all guardian troops -1 DEF; gods and evil untouched', () => {
    const state = newGame(['fire']);
    const troop = place(state, 'fire-ogre', { x: 1, y: 5 }, 'fire');
    const imp = place(state, 'shadow-imp', { x: 3, y: 5 });
    onTerrain(state, troop, 'blighted');
    onTerrain(state, imp, 'blighted');
    expect(effectiveDef(state, troop)).toBe(base('fire-ogre').def - 1);
    expect(effectiveDef(state, imp)).toBe(base('shadow-imp').def);
    const godUnit = state.units.find((u) => u.isGod && u.faction === 'guardian')!;
    onTerrain(state, godUnit, 'blighted');
    expect(effectiveDef(state, godUnit)).toBe(3);
  });

  it('Plains: no effect', () => {
    const state = newGame(['fire']);
    const troop = place(state, 'fire-ogre', { x: 1, y: 5 }, 'fire');
    onTerrain(state, troop, 'plains');
    expect(effectiveAtk(state, troop)).toBe(base('fire-ogre').atk);
    expect(effectiveDef(state, troop)).toBe(base('fire-ogre').def);
    expect(effectiveMov(state, troop)).toBe(base('fire-ogre').mov);
  });

  it('Flying ignores terrain MOV penalties', () => {
    const state = newGame(['earth']);
    const pegasus = place(state, 'earth-pegasus', { x: 1, y: 5 }, 'earth'); // flying, earth
    onTerrain(state, pegasus, 'gale'); // earth -1 MOV would apply
    expect(effectiveMov(state, pegasus)).toBe(base('earth-pegasus').mov);
  });

  it('unit terrain riders: Pixie on Gale, Kelpie on Tide', () => {
    const state = newGame(['wind', 'water']);
    const pixie = place(state, 'wind-pixie', { x: 1, y: 5 }, 'wind');
    onTerrain(state, pixie, 'gale');
    // +1 element bonus and +1 rider
    expect(effectiveMov(state, pixie)).toBe(base('wind-pixie').mov + 2);
    const kelpie = place(state, 'water-kelpie', { x: 3, y: 5 }, 'water');
    onTerrain(state, kelpie, 'tide');
    expect(effectiveAtk(state, kelpie)).toBe(base('water-kelpie').atk + 2); // +1 element +1 rider
    expect(effectiveMov(state, kelpie)).toBe(base('water-kelpie').mov + 1);
  });
});

describe('terrain cards', () => {
  function run(state: GameState, id: Parameters<typeof resolveTerrainCard>[3]) {
    const events: GameEvent[] = [];
    resolveTerrainCard(state, events, new Rng(1), id);
    return events;
  }

  function count(state: GameState, terrain: TerrainType): number {
    return state.tiles.filter((t) => t.terrain === terrain).length;
  }

  it('Volcanic Surge paints up to 3x3 volcanic', () => {
    const state = newGame(['fire']);
    const before = count(state, 'volcanic');
    run(state, 'volcanicSurge');
    expect(count(state, 'volcanic')).toBeGreaterThan(before - 9);
    expect(count(state, 'volcanic')).toBeGreaterThanOrEqual(4); // clipped at worst corner
  });

  it('Rising Tide seeds 2x2 when no tide exists, else spreads', () => {
    const state = newGame(['fire']);
    for (const tile of state.tiles) if (tile.terrain === 'tide') tile.terrain = 'plains';
    run(state, 'risingTide');
    expect(count(state, 'tide')).toBe(4);
    const seeded = count(state, 'tide');
    run(state, 'risingTide');
    expect(count(state, 'tide')).toBeGreaterThan(seeded);
  });

  it('Gale Front paints gale', () => {
    const state = newGame(['fire']);
    const before = count(state, 'gale');
    run(state, 'galeFront');
    expect(count(state, 'gale')).toBeGreaterThanOrEqual(before);
  });

  it('Tectonic Shift paints 2x2 stone and hits non-Earth units standing there', () => {
    const state = newGame(['fire']);
    // Cover the whole board in guinea pigs? No — place one on the known block.
    // Rng(1) picks a deterministic origin; find it by dry-running on a scratch state.
    const scratch = structuredClone(state);
    run(scratch, 'tectonicShift');
    const stoneIdx = scratch.tiles.findIndex((t, i) => t.terrain === 'stone' && state.tiles[i]!.terrain !== 'stone');
    expect(stoneIdx).toBeGreaterThanOrEqual(0);
    const pos = { x: stoneIdx % state.width, y: Math.floor(stoneIdx / state.width) };
    const ogre = place(state, 'fire-ogre', pos, 'fire');
    const hpBefore = ogre.hp;
    run(state, 'tectonicShift');
    expect(ogre.hp).toBe(hpBefore - 1);
  });

  it('Tectonic Shift spares Earth units', () => {
    const state = newGame(['earth']);
    const scratch = structuredClone(state);
    run(scratch, 'tectonicShift');
    const stoneIdx = scratch.tiles.findIndex((t, i) => t.terrain === 'stone' && state.tiles[i]!.terrain !== 'stone');
    const pos = { x: stoneIdx % state.width, y: Math.floor(stoneIdx / state.width) };
    const dwarf = place(state, 'earth-dwarf', pos, 'earth');
    run(state, 'tectonicShift');
    expect(dwarf.hp).toBe(dwarf.maxHp);
  });

  it('Withering blights a 2x2 near the guardians', () => {
    const state = newGame(['fire']);
    const before = count(state, 'blighted');
    run(state, 'withering');
    expect(count(state, 'blighted')).toBeGreaterThan(before);
  });

  it('Stillness clears all Blighted to Plains (shrines excepted)', () => {
    const state = newGame(['fire']);
    state.tiles[idx(state, { x: 4, y: 4 })]!.terrain = 'blighted';
    run(state, 'stillness');
    const blighted = state.tiles.filter((t) => t.terrain === 'blighted');
    expect(blighted.every((t) => t.shrine)).toBe(true);
  });
});
