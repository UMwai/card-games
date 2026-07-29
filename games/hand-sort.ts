import { rankIndex, type Card, type Rank, type Suit } from "./cards.js";
import { shengJiEffectiveSuit, shengJiStrength } from "./shengji.js";
import type { GameKind } from "../shared/types.js";

export type HandSortMode = "smart" | "rank" | "suit";

export interface HandSortContext {
  game: GameKind;
  levelRank: Rank;
  trumpSuit?: Suit;
}

const SUIT_ORDER: Record<Card["suit"], number> = {
  spades: 0,
  hearts: 1,
  diamonds: 2,
  clubs: 3,
  joker: 4
};

function guanDanStrength(card: Card, levelRank: Rank): number {
  if (card.rank === "RJ") return 15;
  if (card.rank === "BJ") return 14;
  if (card.rank === levelRank) return 13;
  return rankIndex(card.rank);
}

function exactKey(card: Card): string {
  return `${card.suit}-${card.rank}`;
}

function guanDanSmartBucket(
  card: Card,
  cards: readonly Card[],
  levelRank: Rank
): number {
  if (card.suit === "hearts" && card.rank === levelRank) return 0;
  const jokerCount = cards.filter((candidate) => candidate.suit === "joker").length;
  if (card.suit === "joker" && jokerCount === 4) return 1;
  const count = cards.filter((candidate) => candidate.rank === card.rank).length;
  if (count >= 4) return 2;
  if (count === 3) return 3;
  if (count === 2) return 4;
  return 5;
}

export function handSortGroupKey(
  card: Card,
  cards: readonly Card[],
  mode: HandSortMode,
  context: HandSortContext
): string {
  if (mode === "rank") return `rank-${card.rank}`;
  if (mode === "suit") return `suit-${card.suit}`;
  if (context.game === "guandan") {
    return `guan-${guanDanSmartBucket(card, cards, context.levelRank)}`;
  }
  const trumpSuit = context.trumpSuit ?? "spades";
  const pair = cards.filter((candidate) => exactKey(candidate) === exactKey(card)).length >= 2;
  return `${shengJiEffectiveSuit(card, trumpSuit, context.levelRank)}-${pair ? "pair" : "single"}`;
}

function stableSort(cards: readonly Card[], compare: (a: Card, b: Card) => number): Card[] {
  return cards
    .map((card, index) => ({ card, index }))
    .sort((a, b) => compare(a.card, b.card) || a.index - b.index)
    .map(({ card }) => card);
}

export function sortHand(
  cards: readonly Card[],
  mode: HandSortMode,
  context: HandSortContext
): Card[] {
  if (mode === "suit") {
    return stableSort(
      cards,
      (a, b) =>
        SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] ||
        rankIndex(b.rank) - rankIndex(a.rank) ||
        a.deck - b.deck
    );
  }

  if (mode === "rank") {
    return stableSort(cards, (a, b) => {
      const aStrength =
        context.game === "guandan"
          ? guanDanStrength(a, context.levelRank)
          : shengJiStrength(a, context.trumpSuit ?? "spades", context.levelRank);
      const bStrength =
        context.game === "guandan"
          ? guanDanStrength(b, context.levelRank)
          : shengJiStrength(b, context.trumpSuit ?? "spades", context.levelRank);
      return bStrength - aStrength || SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] || a.deck - b.deck;
    });
  }

  if (context.game === "guandan") {
    return stableSort(
      cards,
      (a, b) =>
        guanDanSmartBucket(a, cards, context.levelRank) -
          guanDanSmartBucket(b, cards, context.levelRank) ||
        guanDanStrength(b, context.levelRank) - guanDanStrength(a, context.levelRank) ||
        SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] ||
        a.deck - b.deck
    );
  }

  const trumpSuit = context.trumpSuit ?? "spades";
  const exactCounts = new Map<string, number>();
  for (const card of cards) exactCounts.set(exactKey(card), (exactCounts.get(exactKey(card)) ?? 0) + 1);
  const effectiveSuitOrder: Record<Suit | "trump", number> = {
    trump: 0,
    spades: 1,
    hearts: 2,
    diamonds: 3,
    clubs: 4
  };
  return stableSort(cards, (a, b) => {
    const aSuit = shengJiEffectiveSuit(a, trumpSuit, context.levelRank);
    const bSuit = shengJiEffectiveSuit(b, trumpSuit, context.levelRank);
    const aPair = (exactCounts.get(exactKey(a)) ?? 0) >= 2 ? 0 : 1;
    const bPair = (exactCounts.get(exactKey(b)) ?? 0) >= 2 ? 0 : 1;
    return (
      effectiveSuitOrder[aSuit] - effectiveSuitOrder[bSuit] ||
      aPair - bPair ||
      shengJiStrength(b, trumpSuit, context.levelRank) -
        shengJiStrength(a, trumpSuit, context.levelRank) ||
      a.deck - b.deck
    );
  });
}
