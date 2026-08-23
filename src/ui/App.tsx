import { GameOverScreen } from './GameOverScreen';
import { GameScreen } from './GameScreen';
import { SetupScreen } from './SetupScreen';
import { useGameStore } from './store';

export function App() {
  const [ui, dispatch] = useGameStore();

  return (
    <div className="app">
      {!ui.game ? (
        <SetupScreen
          defaults={ui.setup}
          onStart={(options) => dispatch({ type: 'newGame', options })}
        />
      ) : ui.game.result !== 'ongoing' ? (
        <GameOverScreen game={ui.game} dispatch={dispatch} />
      ) : (
        <GameScreen ui={ui} dispatch={dispatch} />
      )}
    </div>
  );
}
