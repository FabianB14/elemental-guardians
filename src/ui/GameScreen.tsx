import { useEffect, useMemo, useRef, useState } from 'react';
import { cardDef } from '../data/cards';
import type { Coord, Element } from '../data/types';
import { unitById } from '../engine/board';
import { requireUltimate } from '../engine/powers';
import { overHandLimit } from '../engine/cards';
import type { Action, CardInstance, ComboId, GameEvent, GameState, Unit } from '../engine/types';
import { Board, EMPTY_HIGHLIGHTS, type BoardHighlights } from './Board';
import { HandTray } from './HandTray';
import { Inspector } from './Inspector';
import { DiceToast, LogPanel } from './LogPanel';
import {
  NO_SELECTION,
  attackTargetsFor,
  comboCenters,
  comboDirectionTiles,
  comboPreviewTiles,
  moveTilesFor,
  powerTargets,
  powerTiles,
  resolveComboPick,
  summonPaymentReady,
  summonTiles,
  supportTargetsFor,
  type Selection,
} from './selection';
import type { UiAction, UiState } from './store';

const PHASE_HINTS: Record<string, string> = {
  summon: 'Pick a summon card, click cards to pay its cost, then click a gold tile. End Phase when ready.',
  action: 'Click a unit to move/attack. Power cards and combos are played from the tray.',
  discard: 'Over the hand limit — select cards to discard, then confirm.',
};

export function GameScreen(props: { ui: UiState; dispatch: (a: UiAction) => void }) {
  const game = props.ui.game!;
  const { dispatch } = props;
  const [selection, setSelection] = useState<Selection>(NO_SELECTION);
  const [activeTab, setActiveTab] = useState<Element>(game.guardianOrder[0]!);
  const [pendingUltimate, setPendingUltimate] = useState<number | null>(null);
  const [recentlyHit, setRecentlyHit] = useState<Set<number>>(new Set());
  const lastLogLength = useRef(0);

  const send = (action: Action) => dispatch({ type: 'game', action });

  // Flash damaged tokens whenever new damage events arrive.
  useEffect(() => {
    const fresh = props.ui.log.slice(lastLogLength.current);
    lastLogLength.current = props.ui.log.length;
    const hit = new Set<number>();
    for (const event of fresh) {
      if (event.type === 'damage' && event.unitId !== undefined) hit.add(event.unitId);
    }
    if (hit.size > 0) {
      setRecentlyHit(hit);
      const timer = setTimeout(() => setRecentlyHit(new Set()), 400);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [props.ui.log]);

  // Reset transient selection when the phase changes.
  useEffect(() => {
    setSelection(NO_SELECTION);
    setPendingUltimate(null);
  }, [game.phase, game.round]);

  const selectedUnit =
    selection.mode === 'unit' ? (unitById(game, selection.unitId) ?? null) : null;

  const highlights: BoardHighlights = useMemo(() => {
    const h: BoardHighlights = { ...EMPTY_HIGHLIGHTS };
    if (pendingUltimate !== null) {
      const unit = unitById(game, pendingUltimate);
      if (unit) h.attack = attackTargetsFor(game, unit).map((u) => u.pos);
      return h;
    }
    switch (selection.mode) {
      case 'unit': {
        const unit = unitById(game, selection.unitId);
        if (!unit || unit.hp <= 0 || unit.faction !== 'guardian') break;
        h.move = moveTilesFor(game, unit);
        h.attack = attackTargetsFor(game, unit).map((u) => u.pos);
        h.target = supportTargetsFor(game, unit).map((u) => u.pos);
        break;
      }
      case 'summon':
        if (summonPaymentReady(game, selection)) {
          h.place = summonTiles(game, selection.guardian);
        }
        break;
      case 'power': {
        if (selection.targetId === undefined) {
          const def = cardOf(game, selection.guardian, selection.cardId);
          if (def?.kind === 'power' && def.target === 'emptyTile') {
            h.place = powerTiles(game, selection.guardian, selection.cardId);
          } else {
            h.target = powerTargets(game, selection.guardian, selection.cardId).map(
              (u) => u.pos,
            );
          }
        } else {
          h.place = powerTiles(game, selection.guardian, selection.cardId, selection.targetId);
        }
        break;
      }
      case 'combo': {
        if (!selection.center) {
          h.place = comboCenters(game, selection.picks);
        } else {
          const { combo } = resolveComboPick(game, selection.picks);
          if (combo?.shape.kind === 'line') {
            h.place = comboDirectionTiles(game, selection.center);
            h.area = [selection.center];
          } else {
            h.area = comboPreviewTiles(game, selection.picks, selection.center);
          }
        }
        break;
      }
      default:
        break;
    }
    return h;
  }, [game, selection, pendingUltimate]);

  // ------------------------------------------------------------- handlers ---

  const onUnitClick = (unit: Unit) => {
    if (pendingUltimate !== null) {
      if (unit.faction === 'evil') {
        send({ type: 'ultimate', unitId: pendingUltimate, targetId: unit.id });
        setPendingUltimate(null);
        setSelection(NO_SELECTION);
      }
      return;
    }
    switch (selection.mode) {
      case 'unit': {
        const actor = unitById(game, selection.unitId);
        if (actor && unit.faction === 'evil') {
          send({ type: 'attack', attackerId: actor.id, targetId: unit.id });
          return;
        }
        if (actor && unit.faction === 'guardian' && unit.id !== actor.id) {
          const supportable = supportTargetsFor(game, actor).some((u) => u.id === unit.id);
          if (supportable) {
            send({ type: 'support', unitId: actor.id, targetId: unit.id });
            setSelection(NO_SELECTION);
            return;
          }
        }
        setSelection(
          unit.id === selection.unitId ? NO_SELECTION : { mode: 'unit', unitId: unit.id },
        );
        return;
      }
      case 'power': {
        const def = cardOf(game, selection.guardian, selection.cardId);
        if (def?.kind !== 'power') return;
        if (def.effect.kind === 'moveUnit') {
          const legal = powerTargets(game, selection.guardian, selection.cardId);
          if (legal.some((u) => u.id === unit.id)) {
            setSelection({ ...selection, targetId: unit.id });
          }
          return;
        }
        send({
          type: 'playPower',
          guardian: selection.guardian,
          cardId: selection.cardId,
          targetId: unit.id,
        });
        setSelection(NO_SELECTION);
        return;
      }
      case 'combo': {
        onTileClick(unit.pos);
        return;
      }
      default:
        setSelection({ mode: 'unit', unitId: unit.id });
    }
  };

  const onTileClick = (pos: Coord) => {
    switch (selection.mode) {
      case 'unit': {
        const unit = unitById(game, selection.unitId);
        if (unit && unit.faction === 'guardian') {
          send({ type: 'move', unitId: unit.id, to: pos });
        }
        return;
      }
      case 'summon': {
        if (!summonPaymentReady(game, selection)) return;
        send({
          type: 'summon',
          guardian: selection.guardian,
          cardId: selection.cardId,
          discardCardIds: selection.payment,
          pos,
        });
        setSelection(NO_SELECTION);
        return;
      }
      case 'power': {
        const def = cardOf(game, selection.guardian, selection.cardId);
        if (def?.kind !== 'power') return;
        if (def.target === 'emptyTile' || selection.targetId !== undefined) {
          send({
            type: 'playPower',
            guardian: selection.guardian,
            cardId: selection.cardId,
            targetId: selection.targetId,
            pos,
          });
          setSelection(NO_SELECTION);
        }
        return;
      }
      case 'combo': {
        const { combo, roles } = resolveComboPick(game, selection.picks);
        if (!combo || !roles) return;
        if (!selection.center) {
          if (combo.shape.kind === 'line') {
            setSelection({ ...selection, center: pos });
            return;
          }
          playCombo(combo.id, roles, pos, undefined);
          return;
        }
        // Second click on a line combo: direction.
        const dir = {
          x: Math.sign(pos.x - selection.center.x),
          y: Math.sign(pos.y - selection.center.y),
        };
        if (Math.abs(dir.x) + Math.abs(dir.y) !== 1) return;
        playCombo(combo.id, roles, selection.center, dir);
        return;
      }
      default:
        setSelection(NO_SELECTION);
    }
  };

  const playCombo = (
    comboId: ComboId,
    roles: [Element, Element],
    center: Coord,
    direction: Coord | undefined,
  ) => {
    if (selection.mode !== 'combo') return;
    send({
      type: 'playCombo',
      combo: comboId,
      contributions: [
        { ...selection.picks[0]!, as: roles[0] },
        { ...selection.picks[1]!, as: roles[1] },
      ],
      center,
      direction,
    });
    setSelection(NO_SELECTION);
  };

  const onCardClick = (element: Element, card: CardInstance) => {
    const def = cardDef(card.defId);

    if (game.phase === 'discard') {
      const current =
        selection.mode === 'discardPick' && selection.guardian === element
          ? selection.picks
          : [];
      const picks = current.includes(card.id)
        ? current.filter((id) => id !== card.id)
        : [...current, card.id];
      setSelection({ mode: 'discardPick', guardian: element, picks });
      return;
    }

    if (game.phase === 'summon') {
      if (selection.mode === 'summon') {
        if (selection.cardId === card.id && selection.guardian === element) {
          setSelection(NO_SELECTION);
          return;
        }
        if (selection.guardian === element && def.kind !== 'summon') {
          // Toggle as payment.
          const payment = selection.payment.includes(card.id)
            ? selection.payment.filter((id) => id !== card.id)
            : [...selection.payment, card.id];
          const summonDef = cardOf(game, element, selection.cardId);
          const cost = summonDef?.kind === 'summon' ? summonDef.cost : 0;
          setSelection({ ...selection, payment: payment.slice(0, cost) });
          return;
        }
        if (selection.guardian === element && def.kind === 'summon') {
          // Either switch the summon, or use another summon card as payment.
          const summonDef = cardOf(game, element, selection.cardId);
          const cost = summonDef?.kind === 'summon' ? summonDef.cost : 0;
          if (selection.payment.length < cost && !selection.payment.includes(card.id)) {
            setSelection({ ...selection, payment: [...selection.payment, card.id] });
          } else {
            setSelection({ mode: 'summon', guardian: element, cardId: card.id, payment: [] });
          }
          return;
        }
      }
      if (def.kind === 'summon') {
        setSelection({ mode: 'summon', guardian: element, cardId: card.id, payment: [] });
      }
      return;
    }

    if (game.phase === 'action') {
      if (def.kind === 'summon') return; // summons are for the Summon Phase
      // Combo building: a second power/prism pick forms a combo attempt.
      if (selection.mode === 'power' || selection.mode === 'combo') {
        const picks =
          selection.mode === 'power'
            ? [{ guardian: selection.guardian, cardId: selection.cardId }]
            : selection.picks;
        const already = picks.some(
          (p) => p.guardian === element && p.cardId === card.id,
        );
        if (already) {
          setSelection(NO_SELECTION);
          return;
        }
        if (picks.length === 1) {
          const attempt = [...picks, { guardian: element, cardId: card.id }];
          const { combo } = resolveComboPick(game, attempt);
          if (combo) {
            setSelection({ mode: 'combo', picks: attempt });
            return;
          }
        }
      }
      if (def.kind === 'power') {
        setSelection({ mode: 'power', guardian: element, cardId: card.id });
      } else if (def.kind === 'prism') {
        // A prism alone starts a combo pick.
        setSelection({ mode: 'combo', picks: [{ guardian: element, cardId: card.id }] });
      }
    }
  };

  const onUltimate = (unit: Unit) => {
    try {
      const ultimate = requireUltimate(unit);
      if (ultimate.id === 'tidalCrash') {
        setPendingUltimate(unit.id);
        setSelection(NO_SELECTION);
      } else {
        send({ type: 'ultimate', unitId: unit.id });
      }
    } catch {
      /* no ultimate */
    }
  };

  const confirmDiscards = () => {
    if (selection.mode !== 'discardPick') return;
    send({ type: 'discard', guardian: selection.guardian, cardIds: selection.picks });
    setSelection(NO_SELECTION);
  };

  const overLimit = game.guardians
    .map((g) => ({ g, over: overHandLimit(g) }))
    .filter((x) => x.over > 0);

  const endPhaseLabel =
    game.phase === 'summon'
      ? 'End Summon Phase'
      : game.phase === 'action'
        ? 'End Action Phase (resolve Evil + Terrain)'
        : 'Continue';

  const comboInfo =
    selection.mode === 'combo' ? resolveComboPick(game, selection.picks) : null;

  return (
    <div className="game">
      <div className="phase-banner">
        <span className="round">Round {game.round}</span>
        <span className="phase">{game.phase} phase</span>
        <span className="hint">
          {selection.mode === 'combo' && comboInfo?.combo
            ? selection.center
              ? `${comboInfo.combo.name}: click an adjacent tile to aim the line.`
              : `${comboInfo.combo.name} ready — click a highlighted centre tile.`
            : selection.mode === 'combo'
              ? 'Pick a second power card of a different element to form a combo.'
              : pendingUltimate !== null
                ? 'Tidal Crash: click an enemy in range.'
                : (PHASE_HINTS[game.phase] ?? '')}
        </span>
        {game.phase === 'discard' &&
          overLimit.map(({ g, over }) => (
            <span key={g.element} style={{ color: 'var(--danger)' }}>
              {g.name}: discard {over}
            </span>
          ))}
        {selection.mode === 'discardPick' && (
          <button className="primary" onClick={confirmDiscards}>
            Discard {selection.picks.length}
          </button>
        )}
        {(selection.mode !== 'none' || pendingUltimate !== null) && (
          <button
            onClick={() => {
              setSelection(NO_SELECTION);
              setPendingUltimate(null);
            }}
          >
            Cancel
          </button>
        )}
        <button
          className="primary"
          disabled={game.phase === 'discard' && overLimit.length > 0}
          onClick={() => send({ type: 'endPhase' })}
        >
          {endPhaseLabel}
        </button>
        <button className="danger" onClick={() => dispatch({ type: 'quit' })}>
          Quit
        </button>
      </div>

      <div className="game-main">
        <div className="board-wrap">
          <Board
            game={game}
            selectedUnitId={selectedUnit?.id ?? null}
            highlights={highlights}
            recentlyHit={recentlyHit}
            onTileClick={onTileClick}
            onUnitClick={onUnitClick}
          />
        </div>
        <div className="side">
          <Inspector
            game={game}
            unit={selectedUnit}
            onUltimate={onUltimate}
            canAct={game.phase === 'action'}
          />
          <LogPanel log={props.ui.log} />
        </div>
      </div>

      <HandTray
        game={game}
        activeTab={activeTab}
        selection={selection}
        onTab={setActiveTab}
        onCardClick={onCardClick}
      />

      <div className="toasts">
        {props.ui.lastDice?.dice && <DiceToast event={props.ui.lastDice} />}
        {props.ui.error && (
          <div
            className="toast error"
            onClick={() => dispatch({ type: 'dismissError' })}
          >
            {props.ui.error}
          </div>
        )}
      </div>
    </div>
  );
}

function cardOf(game: GameState, element: Element, cardId: string) {
  const guardian = game.guardians.find((g) => g.element === element);
  const card = guardian?.hand.find((c) => c.id === cardId);
  return card ? cardDef(card.defId) : undefined;
}

export type { GameEvent };
