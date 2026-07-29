import {
  RANKS,
  SUITS,
  cardPoints,
  type Card,
  type Rank,
  type Suit
} from "./cards.js";
import {
  analyzeGuanDanPlay,
  beatsGuanDan,
  type GuanDanCombo
} from "./guandan.js";
import {
  analyzeShengJiPlay,
  shengJiEffectiveSuit,
  shengJiFollowError,
  shengJiPairsInSuit,
  shengJiStrength,
  shengJiTractorsInSuit,
  shengJiWinningPlayIndex,
  type ShengJiGroup
} from "./shengji.js";
import type {
  GuanDanPublicState,
  PlayRecommendation,
  Player,
  PublicGameState,
  Seat,
  ShengJiPublicState
} from "../shared/types.js";

export interface BestPlayContext {
  hand: readonly Card[];
  state: PublicGameState;
  seat: Seat;
  players: ReadonlyArray<Pick<Player, "seat" | "team" | "cardsLeft"> | null>;
}

interface GuanDanCandidate {
  cards: Card[];
  combo: GuanDanCombo;
}

const GUAN_DAN_RANKS: Card["rank"][] = [...RANKS, "BJ", "RJ"];

function cardKey(cards: readonly Card[]): string {
  return cards
    .map((card) => card.id)
    .sort()
    .join("|");
}

function rankWindows(length: number): Rank[][] {
  const windows: Rank[][] = [];
  for (let start = 0; start <= RANKS.length - length; start += 1) {
    windows.push(RANKS.slice(start, start + length) as Rank[]);
  }
  if (length === 5) windows.push(["A", "2", "3", "4", "5"]);
  return windows;
}

function buildNeededCards(
  groups: Map<Card["rank"], Card[]>,
  needs: Array<[Card["rank"], number]>,
  wilds: readonly Card[]
): Card[] | null {
  const cards: Card[] = [];
  let wildCount = 0;
  for (const [rank, count] of needs) {
    const available = groups.get(rank) ?? [];
    cards.push(...available.slice(0, count));
    wildCount += Math.max(0, count - available.length);
  }
  if (wildCount > wilds.length) return null;
  return [...cards, ...wilds.slice(0, wildCount)];
}

/**
 * Generates every common Guan Dan shape without enumerating arbitrary hand
 * subsets. Heart level cards are supplied only when a natural rank is missing;
 * analyzeGuanDanPlay remains the final authority on whether the shape is valid.
 */
export function guanDanPlayCandidates(
  hand: readonly Card[],
  levelRank: Rank
): GuanDanCandidate[] {
  const wilds = hand.filter((card) => card.suit === "hearts" && card.rank === levelRank);
  const fixed = hand.filter((card) => !wilds.includes(card));
  const groups = new Map<Card["rank"], Card[]>();
  for (const card of fixed) groups.set(card.rank, [...(groups.get(card.rank) ?? []), card]);

  const candidates = new Map<string, GuanDanCandidate>();
  const add = (cards: Card[] | null): void => {
    if (!cards?.length) return;
    const combo = analyzeGuanDanPlay(cards, levelRank);
    if (!combo) return;
    const key = cardKey(cards);
    const prior = candidates.get(key);
    if (!prior || (combo.bombPower ?? 0) > (prior.combo.bombPower ?? 0)) {
      candidates.set(key, { cards, combo });
    }
  };

  for (const card of hand) add([card]);

  for (const rank of GUAN_DAN_RANKS) {
    const available = groups.get(rank)?.length ?? 0;
    for (const count of [2, 3]) {
      add(buildNeededCards(groups, [[rank, count]], wilds));
    }
    if (rank !== "BJ" && rank !== "RJ") {
      for (let count = 4; count <= available + wilds.length; count += 1) {
        add(buildNeededCards(groups, [[rank, count]], wilds));
      }
    }
  }

  for (const tripleRank of GUAN_DAN_RANKS) {
    for (const pairRank of GUAN_DAN_RANKS) {
      if (tripleRank === pairRank) continue;
      add(
        buildNeededCards(
          groups,
          [
            [tripleRank, 3],
            [pairRank, 2]
          ],
          wilds
        )
      );
    }
  }

  for (const ranks of rankWindows(5)) {
    add(buildNeededCards(groups, ranks.map((rank) => [rank, 1]), wilds));
  }
  for (const ranks of rankWindows(3)) {
    add(buildNeededCards(groups, ranks.map((rank) => [rank, 2]), wilds));
  }
  for (const ranks of rankWindows(2)) {
    add(buildNeededCards(groups, ranks.map((rank) => [rank, 3]), wilds));
  }

  for (const suit of SUITS) {
    const suitedGroups = new Map<Card["rank"], Card[]>();
    for (const card of fixed) {
      if (card.suit !== suit) continue;
      suitedGroups.set(card.rank, [...(suitedGroups.get(card.rank) ?? []), card]);
    }
    const suitedWilds = suit === "hearts" ? wilds : [];
    for (const ranks of rankWindows(5)) {
      add(buildNeededCards(suitedGroups, ranks.map((rank) => [rank, 1]), suitedWilds));
    }
  }

  add(hand.filter((card) => card.suit === "joker"));
  return [...candidates.values()];
}

function playerIsUrgent(context: BestPlayContext): boolean {
  const ownTeam = context.players[context.seat]?.team ?? (context.seat % 2);
  return context.players.some(
    (player) => player && player.team !== ownTeam && player.cardsLeft > 0 && player.cardsLeft <= 2
  );
}

function guanDanFragmentPenalty(hand: readonly Card[], cards: readonly Card[], levelRank: Rank): number {
  const wildIds = new Set(
    hand
      .filter((card) => card.suit === "hearts" && card.rank === levelRank)
      .map((card) => card.id)
  );
  const handCounts = new Map<Card["rank"], number>();
  const selectedCounts = new Map<Card["rank"], number>();
  for (const card of hand) {
    if (!wildIds.has(card.id)) handCounts.set(card.rank, (handCounts.get(card.rank) ?? 0) + 1);
  }
  for (const card of cards) {
    if (!wildIds.has(card.id)) {
      selectedCounts.set(card.rank, (selectedCounts.get(card.rank) ?? 0) + 1);
    }
  }
  let penalty = 0;
  for (const [rank, selected] of selectedCounts) {
    const held = handCounts.get(rank) ?? 0;
    if (held >= 2 && selected < held) penalty += Math.min(45, (held - selected) * 12);
  }
  return penalty;
}

function guanDanCandidateScore(
  candidate: GuanDanCandidate,
  context: BestPlayContext,
  urgent: boolean,
  contest: boolean
): number {
  const state = context.state as GuanDanPublicState;
  const wildCount = candidate.cards.filter(
    (card) => card.suit === "hearts" && card.rank === state.levelRank
  ).length;
  const isBomb = candidate.combo.bombPower !== undefined;
  let score =
    candidate.combo.strength * 3 +
    wildCount * 150 +
    guanDanFragmentPenalty(context.hand, candidate.cards, state.levelRank);

  if (isBomb) score += urgent ? 120 : 720;
  if (!state.currentPlay) score -= candidate.combo.size * (urgent ? 48 : 34);
  if (candidate.combo.type === "single" && !state.currentPlay) score += 18;
  if (candidate.cards.length === context.hand.length) score -= 10_000;
  if (urgent) score -= candidate.cards.length * 14;
  if (contest) score -= candidate.combo.strength * 12;
  return score;
}

function recommendGuanDan(context: BestPlayContext): PlayRecommendation | null {
  const state = context.state as GuanDanPublicState;
  if (state.phase !== "playing" || state.turn !== context.seat) return null;
  const currentCombo = state.currentPlay
    ? analyzeGuanDanPlay(state.currentPlay.cards, state.levelRank)
    : null;
  // An opponent whose winning play just emptied (or nearly emptied) their hand
  // passes the lead to their partner unless this play is beaten, so answer with
  // real strength instead of the cheapest counter.
  const contest = Boolean(
    state.currentPlay &&
      state.currentPlay.seat % 2 !== context.seat % 2 &&
      (context.players[state.currentPlay.seat]?.cardsLeft ?? Number.MAX_SAFE_INTEGER) <= 2
  );
  const urgent = playerIsUrgent(context) || contest;
  const candidates = guanDanPlayCandidates(context.hand, state.levelRank)
    .filter(({ combo }) => !currentCombo || beatsGuanDan(combo, currentCombo))
    .sort(
      (a, b) =>
        guanDanCandidateScore(a, context, urgent, contest) -
          guanDanCandidateScore(b, context, urgent, contest) ||
        cardKey(a.cards).localeCompare(cardKey(b.cards))
    );

  if (state.currentPlay && state.currentPlay.seat % 2 === context.seat % 2) {
    const finishingPlay = candidates.find((candidate) => candidate.cards.length === context.hand.length);
    if (!finishingPlay) {
      return {
        action: "pass",
        cardIds: [],
        label: "Let your partner hold the lead",
        reason: "Passing protects your stronger combinations while your teammate is winning.",
        confidence: "strong"
      };
    }
  }

  if (!candidates.length) {
    return state.currentPlay
      ? {
          action: "pass",
          cardIds: [],
          label: "No clean play — pass",
          reason: `Your hand cannot beat the current ${currentCombo?.label.toLowerCase() ?? "play"}.`,
          confidence: "strong"
        }
      : null;
  }

  const onlyCostlyBombs =
    Boolean(state.currentPlay) &&
    !urgent &&
    candidates.every(
      (candidate) =>
        candidate.combo.bombPower !== undefined && candidate.cards.length !== context.hand.length
    );
  if (onlyCostlyBombs) {
    return {
      action: "pass",
      cardIds: [],
      label: "Save the bomb",
      reason: "A bomb can win here, but the opponent is not close enough to going out to justify it.",
      confidence: "situational"
    };
  }

  const choice = candidates[0];
  const usesWild = choice.cards.some(
    (card) => card.suit === "hearts" && card.rank === state.levelRank
  );
  const reason =
    choice.cards.length === context.hand.length
      ? "This valid play empties your hand."
      : choice.combo.bombPower !== undefined
        ? "An opponent is nearly out, so spending this bomb is worth the control."
        : state.currentPlay
          ? contest
            ? `An opponent is going out — this strong ${choice.combo.label.toLowerCase()} fights to keep their team from taking the lead.`
            : `This is the lowest-cost ${choice.combo.label.toLowerCase()} that wins without spending a bomb${
                usesWild ? "; it uses a marked heart-level wild" : ""
              }.`
          : `Moves ${choice.cards.length} card${choice.cards.length === 1 ? "" : "s"} while preserving bombs and marked wilds where possible.`;
  return {
    action: "play",
    cardIds: choice.cards.map((card) => card.id),
    label: state.currentPlay ? `Answer with ${choice.combo.label}` : `Lead ${choice.combo.label}`,
    reason,
    confidence: choice.combo.bombPower !== undefined || usesWild ? "situational" : "strong"
  };
}

function shengJiLowOrder(cards: readonly Card[], state: ShengJiPublicState): Card[] {
  return [...cards].sort(
    (a, b) =>
      cardPoints(a) - cardPoints(b) ||
      shengJiStrength(a, state.trumpSuit, state.levelRank) -
        shengJiStrength(b, state.trumpSuit, state.levelRank) ||
      a.id.localeCompare(b.id)
  );
}

function shengJiPointOrder(cards: readonly Card[], state: ShengJiPublicState): Card[] {
  return [...cards].sort(
    (a, b) =>
      cardPoints(b) - cardPoints(a) ||
      shengJiStrength(a, state.trumpSuit, state.levelRank) -
        shengJiStrength(b, state.trumpSuit, state.levelRank) ||
      a.id.localeCompare(b.id)
  );
}

function addShengJiCandidate(store: Map<string, Card[]>, cards: readonly Card[]): void {
  if (cards.length) store.set(cardKey(cards), [...cards]);
}

function shengJiLeadCandidates(hand: readonly Card[], state: ShengJiPublicState): Card[][] {
  const candidates = new Map<string, Card[]>();
  const suits = [...SUITS, "trump"] as Array<Suit | "trump">;
  for (const suit of suits) {
    for (const tractor of shengJiTractorsInSuit(
      hand,
      suit,
      state.trumpSuit,
      state.levelRank
    )) {
      addShengJiCandidate(candidates, tractor);
    }
    for (const pair of shengJiPairsInSuit(hand, suit, state.trumpSuit, state.levelRank)) {
      addShengJiCandidate(candidates, pair);
    }
  }
  for (const card of hand) addShengJiCandidate(candidates, [card]);
  return [...candidates.values()];
}

function shengJiFollowCandidates(
  hand: readonly Card[],
  state: ShengJiPublicState,
  lead: ShengJiGroup
): Card[][] {
  const candidates = new Map<string, Card[]>();
  const inSuit = hand.filter(
    (card) =>
      shengJiEffectiveSuit(card, state.trumpSuit, state.levelRank) === lead.effectiveSuit
  );
  if (inSuit.length >= lead.size) {
    if (lead.pattern === "tractor") {
      for (const tractor of shengJiTractorsInSuit(
        hand,
        lead.effectiveSuit,
        state.trumpSuit,
        state.levelRank,
        lead.size
      )) {
        addShengJiCandidate(candidates, tractor);
      }
    }
    if (lead.pattern === "pair") {
      for (const pair of shengJiPairsInSuit(
        hand,
        lead.effectiveSuit,
        state.trumpSuit,
        state.levelRank
      )) {
        addShengJiCandidate(candidates, pair);
      }
    }
    if (!candidates.size) {
      addShengJiCandidate(candidates, shengJiLowOrder(inSuit, state).slice(0, lead.size));
      addShengJiCandidate(candidates, shengJiPointOrder(inSuit, state).slice(0, lead.size));
      addShengJiCandidate(
        candidates,
        [...inSuit]
          .sort(
            (a, b) =>
              shengJiStrength(b, state.trumpSuit, state.levelRank) -
              shengJiStrength(a, state.trumpSuit, state.levelRank)
          )
          .slice(0, lead.size)
      );
    }
  } else {
    const remaining = hand.filter((card) => !inSuit.some((led) => led.id === card.id));
    const needed = lead.size - inSuit.length;
    addShengJiCandidate(candidates, [
      ...inSuit,
      ...shengJiLowOrder(remaining, state).slice(0, needed)
    ]);
    addShengJiCandidate(candidates, [
      ...inSuit,
      ...shengJiPointOrder(remaining, state).slice(0, needed)
    ]);
    addShengJiCandidate(candidates, [
      ...inSuit,
      ...[...remaining]
        .sort(
          (a, b) =>
            shengJiStrength(b, state.trumpSuit, state.levelRank) -
            shengJiStrength(a, state.trumpSuit, state.levelRank)
        )
        .slice(0, needed)
    ]);
  }
  return [...candidates.values()].filter(
    (cards) =>
      shengJiFollowError(
        hand,
        cards,
        lead,
        state.trumpSuit,
        state.levelRank
      ) === null
  );
}

function shengJiLeadScore(
  cards: readonly Card[],
  state: ShengJiPublicState,
  handSize: number
): number {
  const group = analyzeShengJiPlay(cards, state.trumpSuit, state.levelRank)!;
  const points = cards.reduce((total, card) => total + cardPoints(card), 0);
  const trumpPenalty = group.effectiveSuit === "trump" ? 80 : 0;
  // The final lead decides who banks the trick (and the kitty for defenders),
  // so strength beats economy when this play empties the hand.
  if (cards.length === handSize) return -1000 - group.topStrength * 4;
  return points * 18 + trumpPenalty + group.topStrength * 2 - cards.length * 36;
}

function recommendShengJi(context: BestPlayContext): PlayRecommendation | null {
  const state = context.state as ShengJiPublicState;
  if (state.phase === "roundOver" || state.turn !== context.seat) return null;

  if (state.phase === "burying") {
    if (context.hand.length < 8) return null;
    const cards = [...context.hand]
      .sort(
        (a, b) =>
          Number(shengJiEffectiveSuit(a, state.trumpSuit, state.levelRank) === "trump") -
            Number(shengJiEffectiveSuit(b, state.trumpSuit, state.levelRank) === "trump") ||
          cardPoints(a) - cardPoints(b) ||
          shengJiStrength(a, state.trumpSuit, state.levelRank) -
            shengJiStrength(b, state.trumpSuit, state.levelRank) ||
          a.id.localeCompare(b.id)
      )
      .slice(0, 8);
    return {
      action: "bury",
      cardIds: cards.map((card) => card.id),
      label: "Bury 8 low-risk cards",
      reason: "Keeps trump and point cards whenever the hand gives you a safer choice.",
      confidence: "strong"
    };
  }

  if (state.trick.length === 0) {
    const candidates = shengJiLeadCandidates(context.hand, state).sort(
      (a, b) =>
        shengJiLeadScore(a, state, context.hand.length) -
          shengJiLeadScore(b, state, context.hand.length) ||
        cardKey(a).localeCompare(cardKey(b))
    );
    const choice = candidates[0];
    if (!choice) return null;
    const group = analyzeShengJiPlay(choice, state.trumpSuit, state.levelRank)!;
    return {
      action: "play",
      cardIds: choice.map((card) => card.id),
      label:
        group.pattern === "tractor"
          ? `Lead a ${group.pairCount}-pair tractor`
          : `Lead a ${group.pattern}`,
      reason: `Moves ${choice.length} low-risk card${choice.length === 1 ? "" : "s"} while saving trump and exposed points where possible.`,
      confidence: group.effectiveSuit === "trump" ? "situational" : "strong"
    };
  }

  const lead = analyzeShengJiPlay(state.trick[0].cards, state.trumpSuit, state.levelRank);
  if (!lead) return null;
  const candidates = shengJiFollowCandidates(context.hand, state, lead);
  if (!candidates.length) return null;
  const winnerBefore = shengJiWinningPlayIndex(
    state.trick,
    state.trumpSuit,
    state.levelRank
  );
  const partnerWinning =
    winnerBefore >= 0 && state.trick[winnerBefore].seat % 2 === context.seat % 2;
  const tablePoints = state.trick
    .flatMap((play) => play.cards)
    .reduce((total, card) => total + cardPoints(card), 0);
  const urgent = playerIsUrgent(context);
  // The last tricks decide who banks the remaining points (and, for the
  // defenders, the multiplied kitty), so card economy stops mattering there.
  const endgame = context.hand.length <= lead.size * 2;
  const opponentFollows = Array.from(
    { length: 3 - state.trick.length },
    (_, offset) => (context.seat + offset + 1) % 4
  ).some((seat) => seat % 2 !== context.seat % 2);

  const score = (cards: Card[]): number => {
    const selectedPoints = cards.reduce((total, card) => total + cardPoints(card), 0);
    const wins = shengJiWinningPlayIndex(
      [...state.trick, { seat: context.seat, cards }],
      state.trumpSuit,
      state.levelRank
    ) === state.trick.length;
    const strength = cards.reduce(
      (total, card) => total + shengJiStrength(card, state.trumpSuit, state.levelRank),
      0
    );
    const trumpUsed = cards.filter(
      (card) => shengJiEffectiveSuit(card, state.trumpSuit, state.levelRank) === "trump"
    ).length;
    // Endgame with an opponent still to act: take the trick with the strongest
    // winner so it cannot be cheaply overtaken.
    if (endgame && opponentFollows && wins) return -900 - strength * 6;
    if (partnerWinning) return strength - selectedPoints * 34 + (wins ? 30 : 0);
    const worthWinning = tablePoints + selectedPoints >= 10 || urgent || endgame;
    return strength + trumpUsed * 12 + (wins ? (worthWinning ? -520 : 18) : 0);
  };
  candidates.sort(
    (a, b) => score(a) - score(b) || cardKey(a).localeCompare(cardKey(b))
  );
  const choice = candidates[0];
  const selectedPoints = choice.reduce((total, card) => total + cardPoints(card), 0);
  const wins = shengJiWinningPlayIndex(
    [...state.trick, { seat: context.seat, cards: choice }],
    state.trumpSuit,
    state.levelRank
  ) === state.trick.length;
  const group = analyzeShengJiPlay(choice, state.trumpSuit, state.levelRank);
  return {
    action: "play",
    cardIds: choice.map((card) => card.id),
    label: partnerWinning && selectedPoints
      ? `Feed ${selectedPoints} points to your partner`
      : wins
        ? "Take this trick"
        : `Follow with ${group?.pattern ?? `${choice.length} cards`}`,
    reason: partnerWinning
      ? selectedPoints
        ? "Your teammate is currently winning, so this safely sheds point cards."
        : "Your teammate is currently winning, so this keeps your stronger cards in reserve."
      : wins
        ? `Winning protects ${tablePoints + selectedPoints} table point${tablePoints + selectedPoints === 1 ? "" : "s"}.`
        : "This is the lowest-cost legal follow and preserves stronger trump for a better moment.",
    confidence: partnerWinning || wins ? "strong" : "situational"
  };
}

export function recommendBestPlay(context: BestPlayContext): PlayRecommendation | null {
  if (context.hand.length === 0) return null;
  return context.state.kind === "guandan"
    ? recommendGuanDan(context)
    : recommendShengJi(context);
}
