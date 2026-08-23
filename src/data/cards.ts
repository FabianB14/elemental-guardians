import { CONFIG } from './config';
import { GUARDIAN_GENERALS, GUARDIAN_TROOPS, unitDef } from './units';
import type { CardDef, Element, PowerCardDef, PrismCardDef, SummonCardDef } from './types';

/**
 * Power cards, two types per guardian, split 4/3 by CONFIG.powerSplit.
 * `range` is measured (Manhattan) from the casting guardian's god;
 * null means the card may be aimed anywhere on the board.
 */
export const POWER_CARDS: Record<string, PowerCardDef> = {
  fireball: {
    id: 'fireball',
    name: 'Fireball',
    kind: 'power',
    element: 'fire',
    cost: 0,
    target: 'enemyUnit',
    range: 3,
    effect: { kind: 'damage', amount: 2 },
    text: '2 damage to an enemy within 3 tiles of your god.',
  },
  overheat: {
    id: 'overheat',
    name: 'Overheat',
    kind: 'power',
    element: 'fire',
    cost: 0,
    target: 'allyUnit',
    range: null,
    effect: { kind: 'buff', stat: 'atk', amount: 2, durationRounds: 0 },
    text: 'An allied unit gets +2 ATK this round.',
  },
  gust: {
    id: 'gust',
    name: 'Gust',
    kind: 'power',
    element: 'wind',
    cost: 0,
    target: 'allyUnit',
    range: null,
    effect: { kind: 'moveUnit', tiles: 2, teleport: false },
    text: 'An allied unit immediately moves up to 2 tiles.',
  },
  slipstream: {
    id: 'slipstream',
    name: 'Slipstream',
    kind: 'power',
    element: 'wind',
    cost: 0,
    target: 'allyUnit',
    range: null,
    effect: { kind: 'moveUnit', tiles: 3, teleport: true },
    text: 'Teleport an allied unit to an empty tile within 3.',
  },
  'healing-tide': {
    id: 'healing-tide',
    name: 'Healing Tide',
    kind: 'power',
    element: 'water',
    cost: 0,
    target: 'allyUnitOrGod',
    range: null,
    effect: { kind: 'heal', amount: 2 },
    text: 'Heal any allied unit or god 2.',
  },
  riptide: {
    id: 'riptide',
    name: 'Riptide',
    kind: 'power',
    element: 'water',
    cost: 0,
    target: 'enemyTroop',
    range: 5,
    effect: { kind: 'moveUnit', tiles: 2, teleport: false },
    text: 'Move an enemy troop 2 tiles.',
  },
  stoneskin: {
    id: 'stoneskin',
    name: 'Stoneskin',
    kind: 'power',
    element: 'earth',
    cost: 0,
    target: 'allyUnit',
    range: null,
    effect: { kind: 'buff', stat: 'def', amount: 2, durationRounds: 0 },
    text: 'An allied unit gets +2 DEF this round.',
  },
  rampart: {
    id: 'rampart',
    name: 'Rampart',
    kind: 'power',
    element: 'earth',
    cost: 0,
    target: 'emptyTile',
    range: 5,
    effect: { kind: 'blockTile' },
    text: 'An empty tile becomes impassable until the next Terrain Phase.',
  },
};

export const PRISM_CARD: PrismCardDef = {
  id: 'prism',
  name: 'Prism',
  kind: 'prism',
  element: 'prism',
  cost: 0,
  text: 'Wild. Counts as a power card of any element for combos only. No standalone effect.',
};

/** The two power types each guardian runs, in 4/3 order. */
export const GUARDIAN_POWERS: Record<Element, readonly [string, string]> = {
  fire: ['fireball', 'overheat'],
  wind: ['gust', 'slipstream'],
  water: ['healing-tide', 'riptide'],
  earth: ['stoneskin', 'rampart'],
};

/** Summon cards are derived from unit defs so stats stay in one place. */
export const SUMMON_CARDS: Record<string, SummonCardDef> = Object.fromEntries(
  ([] as string[])
    .concat(...Object.values(GUARDIAN_TROOPS), Object.values(GUARDIAN_GENERALS))
    .map((unitId) => {
      const def = unitDef(unitId);
      const card: SummonCardDef = {
        id: `summon-${unitId}`,
        name: def.name,
        kind: 'summon',
        element: def.element as Element,
        cost: def.cost,
        unitDefId: unitId,
        text: def.text ?? '',
      };
      return [card.id, card];
    }),
);

export const CARDS: Record<string, CardDef> = {
  ...SUMMON_CARDS,
  ...POWER_CARDS,
  [PRISM_CARD.id]: PRISM_CARD,
};

export function cardDef(id: string): CardDef {
  const def = CARDS[id];
  if (!def) throw new Error(`Unknown card def: ${id}`);
  return def;
}

/**
 * The 30-card deck list for a guardian, as an unshuffled array of card def ids.
 * 20 troops (4x each of 5) + 1 General + 7 power (4/3) + 2 Prism.
 */
export function deckList(element: Element): string[] {
  const list: string[] = [];
  for (const troopId of GUARDIAN_TROOPS[element]) {
    for (let i = 0; i < CONFIG.troopCopies; i++) list.push(`summon-${troopId}`);
  }
  list.push(`summon-${GUARDIAN_GENERALS[element]}`);
  const [powerA, powerB] = GUARDIAN_POWERS[element];
  for (let i = 0; i < CONFIG.powerSplit[0]; i++) list.push(powerA);
  for (let i = 0; i < CONFIG.powerSplit[1]; i++) list.push(powerB);
  for (let i = 0; i < CONFIG.prismCopies; i++) list.push(PRISM_CARD.id);
  return list;
}
