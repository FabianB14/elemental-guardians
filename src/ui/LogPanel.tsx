import { useEffect, useRef } from 'react';
import type { GameEvent } from '../engine/types';

export function LogPanel(props: { log: GameEvent[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight });
  }, [props.log.length]);

  return (
    <div className="log" ref={ref}>
      {props.log.map((event, i) => (
        <span key={i} className={`entry ${event.type}`}>
          {event.text}
        </span>
      ))}
    </div>
  );
}

export function DiceToast(props: { event: GameEvent }) {
  const dice = props.event.dice!;
  return (
    <div className="toast dice" key={props.event.text}>
      <span className="die">{dice.attackDie}</span>
      <span>+{dice.attackTotal - dice.attackDie} = {dice.attackTotal}</span>
      <span className="vs">vs</span>
      <span className="die def">{dice.defenseDie}</span>
      <span>+{dice.defenseTotal - dice.defenseDie} = {dice.defenseTotal}</span>
      <span className={`result-${dice.result}`}>
        {dice.result === 'hit' ? 'HIT' : dice.result === 'riposte' ? 'RIPOSTE' : 'TIE'}
      </span>
    </div>
  );
}
