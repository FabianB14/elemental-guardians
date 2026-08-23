import { cardDef, deckList } from '../data/cards';
import { CONFIG } from '../data/config';
import type { CardDef, Element } from '../data/types';
import { pushEvent } from './effects';
import type { Rng } from './rng';
import type { CardInstance, GameEvent, GameState, GuardianState } from './types';

/** Builds a guardian's 30-card deck as uniquely-identified instances. */
export function buildDeck(element: Element): CardInstance[] {
  return deckList(element).map((defId, index) => ({
    id: `${element}-${index}`,
    defId,
  }));
}

export function defOfCard(card: CardInstance): CardDef {
  return cardDef(card.defId);
}

export function findCard(
  guardian: GuardianState,
  cardId: string,
): CardInstance | undefined {
  return guardian.hand.find((c) => c.id === cardId);
}

export function removeFromHand(guardian: GuardianState, cardId: string): CardInstance {
  const index = guardian.hand.findIndex((c) => c.id === cardId);
  if (index < 0) throw new Error(`Card ${cardId} is not in ${guardian.element}'s hand.`);
  return guardian.hand.splice(index, 1)[0]!;
}

export function discardCard(guardian: GuardianState, card: CardInstance): void {
  guardian.discard.push(card);
}

/**
 * Draws up to `count` cards. Decks never reshuffle: running out is how the
 * guardians lose, so an empty deck simply draws nothing.
 */
export function drawCards(
  state: GameState,
  events: GameEvent[],
  guardian: GuardianState,
  count: number,
): number {
  let drawn = 0;
  for (let i = 0; i < count; i++) {
    const card = guardian.deck.shift();
    if (!card) break;
    guardian.hand.push(card);
    drawn++;
  }
  pushEvent(events, state, {
    type: 'draw',
    amount: drawn,
    text:
      drawn > 0
        ? `${guardian.name} draws ${drawn} (hand ${guardian.hand.length}, deck ${guardian.deck.length}).`
        : `${guardian.name} has no cards left to draw.`,
  });
  return drawn;
}

export function dealOpeningHand(
  guardian: GuardianState,
  rng: Rng,
): void {
  rng.shuffle(guardian.deck);
  for (let i = 0; i < CONFIG.openingHandSize; i++) {
    const card = guardian.deck.shift();
    if (card) guardian.hand.push(card);
  }
}

export function overHandLimit(guardian: GuardianState): number {
  return Math.max(0, guardian.hand.length - CONFIG.handLimit);
}
