import type { ComboDef, ComboId } from './types';

/**
 * Combos: two power cards of different elements played together as one action.
 * The individual card effects are replaced by the combo. Once each per round.
 * Prism counts as any element.
 */
export const COMBOS: Record<ComboId, ComboDef> = {
  firestorm: {
    id: 'firestorm',
    name: 'Firestorm',
    elements: ['fire', 'wind'],
    shape: { kind: 'area', size: 3 },
    effect: { damage: 2 },
    text: '2 damage to all enemies in a 3x3 area.',
  },
  meteor: {
    id: 'meteor',
    name: 'Meteor',
    elements: ['fire', 'earth'],
    shape: { kind: 'single' },
    effect: { damage: 3, paint: 'volcanic' },
    text: '3 damage to one unit; its tile becomes Volcanic.',
  },
  scaldingMist: {
    id: 'scaldingMist',
    name: 'Scalding Mist',
    elements: ['fire', 'water'],
    shape: { kind: 'area', size: 3 },
    effect: { damage: 1, burn: true },
    text: 'Enemies in a 3x3 area take 1 and gain Burn.',
  },
  frostTyphoon: {
    id: 'frostTyphoon',
    name: 'Frost Typhoon',
    elements: ['water', 'wind'],
    shape: { kind: 'area', size: 3 },
    effect: {
      mods: [{ kind: 'atkMod', amount: -1, delayRounds: 0, durationRounds: 0 }],
      root: { delayRounds: 1 },
    },
    text: 'Enemies in a 3x3 area get -1 ATK and are Rooted next round.',
  },
  mudslide: {
    id: 'mudslide',
    name: 'Mudslide',
    elements: ['water', 'earth'],
    shape: { kind: 'line', length: 4 },
    effect: { damage: 1, push: 2 },
    text: 'Enemies in a 4-tile line are pushed 2 tiles and take 1 damage.',
  },
  sandstorm: {
    id: 'sandstorm',
    name: 'Sandstorm',
    elements: ['wind', 'earth'],
    shape: { kind: 'area', size: 3 },
    effect: {
      mods: [{ kind: 'rollMod', amount: -1, delayRounds: 1, durationRounds: 0 }],
    },
    text: 'Enemies in a 3x3 area get -1 on all attack and defence rolls next round.',
  },
};

export const COMBO_LIST: ComboDef[] = Object.values(COMBOS);
