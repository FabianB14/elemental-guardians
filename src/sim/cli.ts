/**
 * Headless autoplay: runs N seeded games with the scripted guardian bot and
 * reports win rates for balance tuning.
 *
 *   npm run sim -- --games 50 --guardians fire,water --difficulty hard --seed 7
 */
import type { Difficulty, Element } from '../data/types';
import { createGame } from '../engine/setup';
import { botPlay } from './bot';

interface SimArgs {
  games: number;
  guardians: Element[];
  difficulty: Difficulty;
  seed: number;
  map: 'default' | 'random';
}

function parseArgs(argv: string[]): SimArgs {
  const args: SimArgs = {
    games: 20,
    guardians: ['fire', 'water'],
    difficulty: 'normal',
    seed: 1,
    map: 'default',
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case '--games':
        args.games = Number(value);
        i++;
        break;
      case '--guardians':
        args.guardians = (value ?? '').split(',').filter(Boolean) as Element[];
        i++;
        break;
      case '--difficulty':
        args.difficulty = value === 'hard' ? 'hard' : 'normal';
        i++;
        break;
      case '--seed':
        args.seed = Number(value);
        i++;
        break;
      case '--map':
        args.map = value === 'random' ? 'random' : 'default';
        i++;
        break;
      default:
        break;
    }
  }
  return args;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  let wins = 0;
  let losses = 0;
  let totalRounds = 0;
  let totalKills = 0;
  let totalLosses = 0;
  const reasons = new Map<string, number>();

  const started = Date.now();
  for (let i = 0; i < args.games; i++) {
    const seed = (args.seed + i * 7919) >>> 0;
    const final = botPlay(
      createGame({
        guardians: args.guardians,
        difficulty: args.difficulty,
        seed,
        map: args.map,
      }),
    );
    if (final.result === 'victory') wins++;
    else losses++;
    totalRounds += final.stats.rounds;
    totalKills += final.stats.guardianKills;
    totalLosses += final.stats.guardianLosses;
    const key = `${final.result} r${final.stats.rounds}`;
    reasons.set(key, (reasons.get(key) ?? 0) + 1);
    process.stdout.write(
      `game ${String(i + 1).padStart(3)} seed=${seed} → ${final.result} in ${final.stats.rounds} rounds ` +
        `(kills ${final.stats.guardianKills}, losses ${final.stats.guardianLosses})\n`,
    );
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log('—'.repeat(60));
  console.log(
    `${args.games} games | ${args.guardians.join('+')} | ${args.difficulty} | map=${args.map}`,
  );
  console.log(
    `wins ${wins} (${((wins / args.games) * 100).toFixed(0)}%) · losses ${losses} · ` +
      `avg rounds ${(totalRounds / args.games).toFixed(1)} · ` +
      `avg kills ${(totalKills / args.games).toFixed(1)} · ` +
      `avg troop losses ${(totalLosses / args.games).toFixed(1)} · ${elapsed}s`,
  );
}

main();
