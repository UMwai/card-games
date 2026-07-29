export const SUITS = ["clubs", "diamonds", "hearts", "spades"] as const;
export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"] as const;

export type Suit = (typeof SUITS)[number];
export type Rank = (typeof RANKS)[number];
export type JokerRank = "BJ" | "RJ";

export interface Card {
  id: string;
  suit: Suit | "joker";
  rank: Rank | JokerRank;
  deck: 0 | 1;
}

export function createDoubleDeck(): Card[] {
  const cards: Card[] = [];
  for (const deck of [0, 1] as const) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({ id: `${deck}-${suit}-${rank}`, suit, rank, deck });
      }
    }
    cards.push({ id: `${deck}-joker-BJ`, suit: "joker", rank: "BJ", deck });
    cards.push({ id: `${deck}-joker-RJ`, suit: "joker", rank: "RJ", deck });
  }
  return cards;
}

export function shuffle<T>(input: readonly T[], random = Math.random): T[] {
  const output = [...input];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [output[index], output[swap]] = [output[swap], output[index]];
  }
  return output;
}

export function rankIndex(rank: Card["rank"]): number {
  if (rank === "BJ") return 13;
  if (rank === "RJ") return 14;
  return RANKS.indexOf(rank);
}

export function cardPoints(card: Card): number {
  if (card.rank === "5") return 5;
  if (card.rank === "10" || card.rank === "K") return 10;
  return 0;
}

export function cardsById(cards: readonly Card[], ids: readonly string[]): Card[] {
  const wanted = new Set(ids);
  return cards.filter((card) => wanted.has(card.id));
}

export function removeCards(cards: readonly Card[], ids: readonly string[]): Card[] {
  const removed = new Set(ids);
  return cards.filter((card) => !removed.has(card.id));
}

export function hasCards(cards: readonly Card[], ids: readonly string[]): boolean {
  const owned = new Set(cards.map((card) => card.id));
  return ids.length === new Set(ids).size && ids.every((id) => owned.has(id));
}

export function suitGlyph(suit: Card["suit"]): string {
  return { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠", joker: "★" }[suit];
}

export function sortNatural(cards: readonly Card[]): Card[] {
  const suitOrder: Record<Card["suit"], number> = {
    clubs: 0,
    diamonds: 1,
    hearts: 2,
    spades: 3,
    joker: 4
  };
  return [...cards].sort(
    (a, b) => suitOrder[a.suit] - suitOrder[b.suit] || rankIndex(a.rank) - rankIndex(b.rank)
  );
}
