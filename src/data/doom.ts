import type { DoomCardDef, DoomCardId } from './types';

/**
 * The Doom deck: 40 cards, shared by the whole evil faction, fully automated.
 * When it empties it reshuffles, and every reshuffle grants all evil units a
 * permanent +1 ATK ("Corruption Rising").
 */
export const DOOM_CARDS: Record<DoomCardId, DoomCardDef> = {
  spawnShadowImps: {
    id: 'spawnShadowImps',
    name: 'Shadow Swarm',
    text: 'Spawn 2 Shadow Imps.',
    spawn: { unitDefId: 'shadow-imp', count: 2 },
  },
  spawnVoidHounds: {
    id: 'spawnVoidHounds',
    name: 'Hunting Pack',
    text: 'Spawn 2 Void Hounds.',
    spawn: { unitDefId: 'void-hound', count: 2 },
  },
  spawnBlightOgre: {
    id: 'spawnBlightOgre',
    name: 'Blight Ogre',
    text: 'Spawn a Blight Ogre.',
    spawn: { unitDefId: 'blight-ogre', count: 1 },
  },
  spawnDreadWraith: {
    id: 'spawnDreadWraith',
    name: 'Dread Wraith',
    text: 'Spawn a Dread Wraith.',
    spawn: { unitDefId: 'dread-wraith', count: 1 },
  },
  spawnCorruptedGolem: {
    id: 'spawnCorruptedGolem',
    name: 'Corrupted Golem',
    text: 'Spawn a Corrupted Golem.',
    spawn: { unitDefId: 'corrupted-golem', count: 1 },
  },
  spawnChaosDrake: {
    id: 'spawnChaosDrake',
    name: 'Chaos Drake',
    text: 'Spawn a Chaos Drake.',
    spawn: { unitDefId: 'chaos-drake', count: 1 },
  },
  darkBolt: {
    id: 'darkBolt',
    name: 'Dark Bolt',
    text: '2 damage to the nearest guardian troop; if there are none, 1 damage to the nearest god.',
  },
  creepingBlight: {
    id: 'creepingBlight',
    name: 'Creeping Blight',
    text: 'A 2x2 area nearest the guardian units becomes Blighted.',
  },
  siphon: {
    id: 'siphon',
    name: 'Siphon',
    text: 'The highest-ATK guardian troop permanently gets -1 ATK and -1 DEF.',
  },
  massSummons: {
    id: 'massSummons',
    name: 'Mass Summons',
    text: 'Each evil god spawns a Shadow Imp.',
  },
  awakening: {
    id: 'awakening',
    name: 'Awakening',
    text: 'All evil units permanently gain +1 ATK.',
  },
};

/** The 40-card Doom deck, as an unshuffled list. */
export const DOOM_DECK_LIST: DoomCardId[] = [
  ...Array<DoomCardId>(6).fill('spawnShadowImps'),
  ...Array<DoomCardId>(5).fill('spawnVoidHounds'),
  ...Array<DoomCardId>(4).fill('spawnBlightOgre'),
  ...Array<DoomCardId>(4).fill('spawnDreadWraith'),
  ...Array<DoomCardId>(3).fill('spawnCorruptedGolem'),
  ...Array<DoomCardId>(4).fill('spawnChaosDrake'),
  ...Array<DoomCardId>(4).fill('darkBolt'),
  ...Array<DoomCardId>(3).fill('creepingBlight'),
  ...Array<DoomCardId>(3).fill('siphon'),
  ...Array<DoomCardId>(2).fill('massSummons'),
  ...Array<DoomCardId>(2).fill('awakening'),
];
