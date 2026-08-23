/**
 * Tiny reducer-store glue between React and the engine.
 * All game rules live in the engine; this file only routes actions and
 * accumulates the event log.
 */
import { useReducer } from 'react';
import type { Element } from '../data/types';
import { IllegalActionError, applyAction } from '../engine/reducer';
import { playForEvent } from './sound';
import { createGame, type SetupOptions } from '../engine/setup';
import type { Action, GameEvent, GameState } from '../engine/types';

export interface UiState {
  game: GameState | null;
  log: GameEvent[];
  /** Most recent rules rejection, shown as a toast. */
  error: string | null;
  /** Most recent combat dice, for the dice toast. */
  lastDice: GameEvent | null;
  setup: SetupOptions;
}

export type UiAction =
  | { type: 'newGame'; options: SetupOptions }
  | { type: 'game'; action: Action }
  | { type: 'dismissError' }
  | { type: 'quit' };

export const DEFAULT_SETUP: SetupOptions = {
  guardians: ['fire', 'water'] as Element[],
  difficulty: 'normal',
  map: 'default',
};

export const initialUiState: UiState = {
  game: null,
  log: [],
  error: null,
  lastDice: null,
  setup: DEFAULT_SETUP,
};

export function uiReducer(state: UiState, action: UiAction): UiState {
  switch (action.type) {
    case 'newGame': {
      const game = createGame(action.options);
      return {
        game,
        log: [
          {
            type: 'round',
            round: 1,
            text: `=== Round 1 === The guardians take the field (seed ${game.seed}).`,
          },
        ],
        error: null,
        lastDice: null,
        setup: action.options,
      };
    }
    case 'game': {
      if (!state.game) return state;
      try {
        const { state: game, events } = applyAction(state.game, action.action);
        for (const event of events) playForEvent(event);
        const dice = [...events].reverse().find((e) => e.dice);
        return {
          ...state,
          game,
          log: [...state.log, ...events].slice(-400),
          error: null,
          lastDice: dice ?? state.lastDice,
        };
      } catch (error) {
        if (error instanceof IllegalActionError) {
          return { ...state, error: error.message };
        }
        throw error;
      }
    }
    case 'dismissError':
      return { ...state, error: null };
    case 'quit':
      return { ...initialUiState, setup: state.setup };
  }
}

export function useGameStore() {
  return useReducer(uiReducer, initialUiState);
}
