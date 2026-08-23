import { useState } from 'react';
import { ELEMENT_COLORS, GUARDIAN_NAMES } from '../data/config';
import type { Difficulty, Element } from '../data/types';
import type { SetupOptions } from '../engine/setup';

const ALL: Element[] = ['fire', 'water', 'wind', 'earth'];

export function SetupScreen(props: {
  defaults: SetupOptions;
  onStart: (options: SetupOptions) => void;
}) {
  const [guardians, setGuardians] = useState<Element[]>(props.defaults.guardians);
  const [difficulty, setDifficulty] = useState<Difficulty>(
    props.defaults.difficulty ?? 'normal',
  );
  const [seed, setSeed] = useState('');
  const [map, setMap] = useState<'default' | 'random'>(props.defaults.map ?? 'default');

  const toggle = (element: Element) =>
    setGuardians((current) =>
      current.includes(element)
        ? current.filter((e) => e !== element)
        : [...current, element],
    );

  const start = () => {
    if (guardians.length === 0) return;
    const options: SetupOptions = { guardians, difficulty, map };
    const trimmed = seed.trim();
    if (trimmed) options.seed = /^\d+$/.test(trimmed) ? Number(trimmed) : trimmed;
    else options.seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    props.onStart(options);
  };

  return (
    <div className="setup">
      <h1>Elemental Guardians</h1>
      <p className="tagline">
        Defend the universe from the corrupted siblings. Destroy every Evil God to win.
      </p>

      <fieldset>
        <legend>Guardians (1–4)</legend>
        <div className="guardian-picks">
          {ALL.map((element) => (
            <div
              key={element}
              role="button"
              className={`guardian-pick ${guardians.includes(element) ? 'selected' : ''}`}
              style={{ color: ELEMENT_COLORS[element] }}
              onClick={() => toggle(element)}
            >
              <div className="orb">{element[0]!.toUpperCase()}</div>
              <div style={{ color: 'var(--text)' }}>{GUARDIAN_NAMES[element]}</div>
              <small style={{ color: 'var(--muted)', textTransform: 'capitalize' }}>
                {element}
              </small>
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Difficulty</legend>
        <div className="radio-row">
          {(['normal', 'hard'] as const).map((level) => (
            <button
              key={level}
              className={difficulty === level ? 'selected' : ''}
              onClick={() => setDifficulty(level)}
            >
              {level === 'normal' ? 'Normal' : 'Hard (+1 Doom card)'}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Battlefield</legend>
        <div className="row">
          <div className="radio-row">
            <button className={map === 'default' ? 'selected' : ''} onClick={() => setMap('default')}>
              Fixed map
            </button>
            <button className={map === 'random' ? 'selected' : ''} onClick={() => setMap('random')}>
              Seeded random
            </button>
          </div>
          <label>
            Seed{' '}
            <input
              type="text"
              placeholder="(random)"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
            />
          </label>
        </div>
      </fieldset>

      <button className="primary" disabled={guardians.length === 0} onClick={start}>
        Begin the Defense
      </button>
    </div>
  );
}
