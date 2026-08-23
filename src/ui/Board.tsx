import { ELEMENT_COLORS } from '../data/config';
import { TERRAIN_COLORS } from '../data/terrain';
import type { Coord } from '../data/types';
import { unitAt } from '../engine/board';
import { defOf } from '../engine/stats';
import type { GameState, Unit } from '../engine/types';
import { inSet, tileKey } from './selection';

export interface BoardHighlights {
  move: Coord[];
  attack: Coord[];
  place: Coord[];
  target: Coord[];
  area: Coord[];
}

export const EMPTY_HIGHLIGHTS: BoardHighlights = {
  move: [],
  attack: [],
  place: [],
  target: [],
  area: [],
};

export function Board(props: {
  game: GameState;
  selectedUnitId: number | null;
  highlights: BoardHighlights;
  recentlyHit: Set<number>;
  onTileClick: (pos: Coord) => void;
  onUnitClick: (unit: Unit) => void;
}) {
  const { game, highlights } = props;
  const rows = [];
  for (let y = 0; y < game.height; y++) {
    for (let x = 0; x < game.width; x++) {
      const pos = { x, y };
      const tile = game.tiles[y * game.width + x]!;
      const unit = unitAt(game, pos);
      const classes = ['tile'];
      if (tile.shrine) classes.push('shrine');
      if (tile.blockedUntilRound >= game.round) classes.push('blocked');
      if (inSet(highlights.move, pos)) classes.push('hl-move', 'clickable');
      if (inSet(highlights.attack, pos)) classes.push('hl-attack', 'clickable');
      if (inSet(highlights.place, pos)) classes.push('hl-place', 'clickable');
      if (inSet(highlights.target, pos)) classes.push('hl-target', 'clickable');
      if (inSet(highlights.area, pos)) classes.push('hl-area');
      if (unit) classes.push('clickable');

      rows.push(
        <div
          key={tileKey(pos)}
          className={classes.join(' ')}
          style={{ background: TERRAIN_COLORS[tile.terrain] }}
          onClick={() => {
            if (unit) props.onUnitClick(unit);
            else props.onTileClick(pos);
          }}
          title={`(${x},${y}) ${tile.terrain}${tile.shrine ? ' shrine' : ''}`}
        >
          {tile.terrain !== 'plains' && !unit && (
            <span className="terrain-tag">{tile.terrain.slice(0, 3)}</span>
          )}
          {unit && (
            <Token
              unit={unit}
              selected={props.selectedUnitId === unit.id}
              justHit={props.recentlyHit.has(unit.id)}
            />
          )}
        </div>,
      );
    }
  }

  return (
    <div
      className="board"
      style={{ gridTemplateColumns: `repeat(${game.width}, auto)` }}
    >
      {rows}
    </div>
  );
}

function Token(props: { unit: Unit; selected: boolean; justHit: boolean }) {
  const { unit } = props;
  const def = defOf(unit);
  const color = ELEMENT_COLORS[unit.element];
  const classes = ['token'];
  if (unit.isGod) classes.push('god');
  if (unit.faction === 'evil') classes.push('evil');
  if (props.selected) classes.push('selected');
  if (props.justHit) classes.push('just-hit');
  return (
    <div
      className={classes.join(' ')}
      style={{ background: color }}
      title={`${def.name} — HP ${unit.hp}/${unit.maxHp}`}
    >
      <span>{def.initials}</span>
      <div className="hp">
        {unit.maxHp <= 5 ? (
          Array.from({ length: unit.maxHp }, (_, i) => (
            <i key={i} style={{ opacity: i < unit.hp ? 1 : 0.25 }} />
          ))
        ) : (
          <span>
            {unit.hp}/{unit.maxHp}
          </span>
        )}
      </div>
      {unit.isGeneral && <span className="badge">G</span>}
      {unit.statuses.length > 0 && (
        <span className="badge" style={{ left: -6, right: 'auto', background: '#b688f0' }}>
          {unit.statuses.length}
        </span>
      )}
    </div>
  );
}
