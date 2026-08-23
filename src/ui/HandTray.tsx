import { cardDef } from '../data/cards';
import { unitDef } from '../data/units';
import { ELEMENT_COLORS } from '../data/config';
import type { Element } from '../data/types';
import type { CardInstance, GameState } from '../engine/types';
import type { Selection } from './selection';

export function HandTray(props: {
  game: GameState;
  activeTab: Element;
  selection: Selection;
  onTab: (element: Element) => void;
  onCardClick: (element: Element, card: CardInstance) => void;
}) {
  const { game, activeTab, selection } = props;
  const guardian = game.guardians.find((g) => g.element === activeTab) ?? game.guardians[0]!;

  const cardClass = (card: CardInstance): string => {
    const classes = ['card'];
    if (selection.mode === 'summon' && selection.guardian === guardian.element) {
      if (selection.cardId === card.id) classes.push('selected');
      else if (selection.payment.includes(card.id)) classes.push('payment');
    } else if (
      selection.mode === 'power' &&
      selection.guardian === guardian.element &&
      selection.cardId === card.id
    ) {
      classes.push('selected');
    } else if (
      selection.mode === 'combo' &&
      selection.picks.some((p) => p.guardian === guardian.element && p.cardId === card.id)
    ) {
      classes.push('combo-pick');
    } else if (
      selection.mode === 'discardPick' &&
      selection.guardian === guardian.element &&
      selection.picks.includes(card.id)
    ) {
      classes.push('payment');
    }
    return classes.join(' ');
  };

  return (
    <div className="tray">
      <div className="tabs">
        {game.guardians.map((g) => (
          <button
            key={g.element}
            className={`tab ${g.element === guardian.element ? 'active' : ''}`}
            style={{ borderColor: g.element === guardian.element ? ELEMENT_COLORS[g.element] : undefined }}
            onClick={() => props.onTab(g.element)}
          >
            {g.name} <span className="count">({g.hand.length})</span>
          </button>
        ))}
        <span className="spacer" />
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>
          deck {guardian.deck.length} · discard {guardian.discard.length}
          {guardian.generalLost ? ' · General lost' : ''}
        </span>
      </div>
      <div className="cards">
        {guardian.hand.length === 0 && (
          <span style={{ color: 'var(--muted)', alignSelf: 'center' }}>Empty hand.</span>
        )}
        {guardian.hand.map((card) => (
          <CardView
            key={card.id}
            card={card}
            className={cardClass(card)}
            onClick={() => props.onCardClick(guardian.element, card)}
          />
        ))}
      </div>
    </div>
  );
}

function CardView(props: { card: CardInstance; className: string; onClick: () => void }) {
  const def = cardDef(props.card.defId);
  const body = (() => {
    if (def.kind === 'summon') {
      const unit = unitDef(def.unitDefId);
      return (
        <>
          <span className="kind" style={{ color: ELEMENT_COLORS[unit.element] }}>
            {unit.isGeneral ? 'General' : 'Troop'} · {unit.element}
          </span>
          <span className="stats">
            ATK {unit.atk} · DEF {unit.def} · MOV {unit.mov} · HP {unit.hp}
          </span>
          {def.text && <span className="text">{def.text}</span>}
        </>
      );
    }
    return (
      <>
        <span
          className="kind"
          style={{
            color:
              def.element === 'prism' ? '#b688f0' : ELEMENT_COLORS[def.element as Element],
          }}
        >
          {def.kind} · {def.element}
        </span>
        <span className="text">{def.text}</span>
      </>
    );
  })();

  return (
    <button className={props.className} onClick={props.onClick}>
      <span className="name">{def.name}</span>
      {body}
      {def.kind === 'summon' && <span className="cost">cost {def.cost}</span>}
    </button>
  );
}
