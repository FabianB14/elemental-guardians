import { describeStatus } from '../engine/effects';
import { statusActive } from '../engine/stats';
import {
  attackRange,
  defOf,
  effectiveAtk,
  effectiveDef,
  effectiveMov,
  maxAttacks,
} from '../engine/stats';
import type { GameState, Unit } from '../engine/types';

export function Inspector(props: {
  game: GameState;
  unit: Unit | null;
  onUltimate: (unit: Unit) => void;
  canAct: boolean;
}) {
  const { game, unit } = props;
  if (!unit) {
    return (
      <div className="inspector">
        <h3>Battlefield</h3>
        <div className="statline">
          Select a unit, or pick cards from the tray. Attack rolls are d6 + ATK vs d6 + DEF;
          the loser of a clash takes 1.
        </div>
      </div>
    );
  }
  const def = defOf(unit);
  const ultimate = def.abilities.find((a) => a.tag === 'ultimate');
  const statuses = unit.statuses.filter((s) => s.expiresRound >= game.round);
  return (
    <div className="inspector">
      <h3>
        {def.name}
        {unit.isGod ? ' (God)' : unit.isGeneral ? ' (General)' : ''}
      </h3>
      <div className="statline">
        <span>HP <b>{unit.hp}/{unit.maxHp}</b></span>
        <span>ATK <b>{effectiveAtk(game, unit)}</b></span>
        <span>DEF <b>{effectiveDef(game, unit)}</b></span>
        <span>MOV <b>{effectiveMov(game, unit)}</b></span>
        {attackRange(unit) > 1 && <span>RNG <b>{attackRange(unit)}</b></span>}
        {unit.faction === 'guardian' && game.phase === 'action' && (
          <span>
            attacks <b>{Math.max(0, maxAttacks(unit) - unit.attacksUsed)}</b>
          </span>
        )}
      </div>
      {def.text && <div className="ability">{def.text}</div>}
      {statuses.map((status, i) => (
        <span className="status-chip" key={i} title={status.source}>
          {describeStatus(status)}
          {statusActive(status, game.round) ? '' : ' (next round)'}
        </span>
      ))}
      {ultimate && ultimate.tag === 'ultimate' && unit.faction === 'guardian' && (
        <div style={{ marginTop: 8 }}>
          <button
            disabled={!props.canAct || unit.ultimateUsed || game.phase !== 'action'}
            onClick={() => props.onUltimate(unit)}
            title={ultimate.description}
          >
            {unit.ultimateUsed ? `${ultimate.name} (spent)` : `Unleash ${ultimate.name}`}
          </button>
        </div>
      )}
    </div>
  );
}
