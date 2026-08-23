import type { GameState } from '../engine/types';
import type { UiAction } from './store';

export function GameOverScreen(props: {
  game: GameState;
  dispatch: (a: UiAction) => void;
}) {
  const { game } = props;
  const victory = game.result === 'victory';
  return (
    <div className="gameover">
      <h1 className={victory ? 'victory' : 'defeat'}>
        {victory ? 'VICTORY' : 'DEFEAT'}
      </h1>
      <p>
        {victory
          ? 'The corrupted siblings are cast down. The universe endures.'
          : 'The blight consumes all. The guardians have fallen.'}
      </p>
      <div className="stats">
        <span>Rounds survived</span>
        <b>{game.stats.rounds}</b>
        <span>Evil units destroyed</span>
        <b>{game.stats.guardianKills}</b>
        <span>Guardian losses</span>
        <b>{game.stats.guardianLosses}</b>
        <span>Doom cards resolved</span>
        <b>{game.stats.doomCardsResolved}</b>
        <span>Combos unleashed</span>
        <b>{game.stats.combosPlayed}</b>
        <span>Cards remaining</span>
        <b>{game.stats.cardsLeft}</b>
        <span>Seed</span>
        <b>{game.seed}</b>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <button className="primary" onClick={() => props.dispatch({ type: 'quit' })}>
          Back to Setup
        </button>
      </div>
    </div>
  );
}
