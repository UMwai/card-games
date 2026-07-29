import {
  RANKS,
  SUITS,
  cardPoints,
  createDoubleDeck,
  hasCards,
  rankIndex,
  removeCards,
  shuffle,
  sortNatural,
  type Card,
  type Rank,
  type Suit
} from "./cards.js";
import type { ClientAction, PlayedCards, Seat, ShengJiPublicState } from "../shared/types.js";

export type ShengJiPattern = "single" | "pair" | "tractor";

export interface ShengJiGroup {
  pattern: ShengJiPattern;
  size: number;
  effectiveSuit: Suit | "trump";
  topStrength: number;
  pairCount: number;
}

export interface ShengJiState {
  kind: "shengji";
  hands: [Card[], Card[], Card[], Card[]];
  kitty: Card[];
  buried: Card[];
  phase: "burying" | "playing" | "roundOver";
  turn: Seat;
  dealer: Seat;
  nextDealer: Seat;
  trumpSuit: Suit;
  levelRank: Rank;
  teamLevels: [Rank, Rank];
  trick: Array<PlayedCards & { group: ShengJiGroup }>;
  trickNumber: number;
  defenderPoints: number;
  lastAction: string;
  winnerTeam?: 0 | 1;
  roundNumber: number;
}

export function shengJiEffectiveSuit(
  card: Card,
  trumpSuit: Suit,
  levelRank: Rank
): Suit | "trump" {
  if (card.suit === "joker" || card.rank === levelRank || card.suit === trumpSuit) return "trump";
  return card.suit;
}

export function shengJiStrength(card: Card, trumpSuit: Suit, levelRank: Rank): number {
  if (card.rank === "RJ") return 40;
  if (card.rank === "BJ") return 39;
  if (card.rank === levelRank && card.suit === trumpSuit) return 38;
  if (card.rank === levelRank) return 37;
  return rankIndex(card.rank);
}

function exactCardKey(card: Card): string {
  return `${card.suit}-${card.rank}`;
}

export function analyzeShengJiPlay(
  cards: readonly Card[],
  trumpSuit: Suit,
  levelRank: Rank
): ShengJiGroup | null {
  if (cards.length === 0) return null;
  const suits = new Set(cards.map((card) => shengJiEffectiveSuit(card, trumpSuit, levelRank)));
  if (suits.size !== 1) return null;
  const effectiveSuit = [...suits][0];
  const strengths = cards.map((card) => shengJiStrength(card, trumpSuit, levelRank));
  if (cards.length === 1) {
    return {
      pattern: "single",
      size: 1,
      effectiveSuit,
      topStrength: strengths[0],
      pairCount: 0
    };
  }
  if (cards.length === 2 && exactCardKey(cards[0]) === exactCardKey(cards[1])) {
    return {
      pattern: "pair",
      size: 2,
      effectiveSuit,
      topStrength: strengths[0],
      pairCount: 1
    };
  }
  if (cards.length >= 4 && cards.length % 2 === 0) {
    const grouped = new Map<string, Card[]>();
    for (const card of cards) grouped.set(exactCardKey(card), [...(grouped.get(exactCardKey(card)) ?? []), card]);
    if ([...grouped.values()].every((group) => group.length === 2)) {
      const pairStrengths = [...grouped.values()]
        .map((pair) => shengJiStrength(pair[0], trumpSuit, levelRank))
        .sort((a, b) => a - b);
      const consecutive = pairStrengths.every(
        (strength, index) => index === 0 || strength === pairStrengths[index - 1] + 1
      );
      if (consecutive) {
        return {
          pattern: "tractor",
          size: cards.length,
          effectiveSuit,
          topStrength: pairStrengths.at(-1)!,
          pairCount: cards.length / 2
        };
      }
    }
  }
  return null;
}

export function shengJiPairsInSuit(
  hand: readonly Card[],
  suit: Suit | "trump",
  trumpSuit: Suit,
  levelRank: Rank
): Card[][] {
  const grouped = new Map<string, Card[]>();
  for (const card of hand) {
    if (shengJiEffectiveSuit(card, trumpSuit, levelRank) !== suit) continue;
    grouped.set(exactCardKey(card), [...(grouped.get(exactCardKey(card)) ?? []), card]);
  }
  return [...grouped.values()].filter((group) => group.length >= 2).map((group) => group.slice(0, 2));
}

export function shengJiTractorsInSuit(
  hand: readonly Card[],
  suit: Suit | "trump",
  trumpSuit: Suit,
  levelRank: Rank,
  size?: number
): Card[][] {
  const pairs = shengJiPairsInSuit(hand, suit, trumpSuit, levelRank).sort(
    (a, b) =>
      shengJiStrength(a[0], trumpSuit, levelRank) - shengJiStrength(b[0], trumpSuit, levelRank)
  );
  const results: Card[][] = [];
  for (let start = 0; start < pairs.length; start += 1) {
    const run = [...pairs[start]];
    let prior = shengJiStrength(pairs[start][0], trumpSuit, levelRank);
    for (let index = start + 1; index < pairs.length; index += 1) {
      const strength = shengJiStrength(pairs[index][0], trumpSuit, levelRank);
      if (strength !== prior + 1) break;
      run.push(...pairs[index]);
      prior = strength;
      if (!size || run.length === size) results.push([...run]);
    }
    if (!size && run.length >= 4) results.push(run);
  }
  return results;
}

export function createShengJiState(
  random = Math.random,
  options?: {
    teamLevels?: [Rank, Rank];
    roundNumber?: number;
    dealer?: Seat;
  }
): ShengJiState {
  const deck = shuffle(createDoubleDeck(), random);
  const dealer = options?.dealer ?? (Math.floor(random() * 4) as Seat);
  const teamLevels = options?.teamLevels ?? ["2", "2"];
  const levelRank = teamLevels[dealer % 2];
  const hands: ShengJiState["hands"] = [[], [], [], []];
  deck.slice(0, 100).forEach((card, index) => hands[index % 4].push(card));
  const kitty = deck.slice(100);
  const dealerHand = hands[dealer];
  const matchingLevel = dealerHand.find(
    (card): card is Card & { suit: Suit } => card.rank === levelRank && card.suit !== "joker"
  );
  const trumpSuit =
    matchingLevel?.suit ??
    SUITS.map((suit) => ({
      suit,
      count: dealerHand.filter((card) => card.suit === suit).length
    })).sort((a, b) => b.count - a.count)[0].suit;
  hands[dealer] = sortNatural([...hands[dealer], ...kitty]);
  hands.forEach((hand, index) => {
    if (index !== dealer) hands[index as Seat] = sortNatural(hand);
  });
  return {
    kind: "shengji",
    hands,
    kitty,
    buried: [],
    phase: "burying",
    turn: dealer,
    dealer,
    nextDealer: ((dealer + 2) % 4) as Seat,
    trumpSuit,
    levelRank,
    teamLevels,
    trick: [],
    trickNumber: 1,
    defenderPoints: 0,
    lastAction: `Seat ${dealer + 1} declares ${trumpSuit} and must bury 8 cards.`,
    roundNumber: options?.roundNumber ?? 1
  };
}

export function shengJiFollowError(
  hand: readonly Card[],
  selected: readonly Card[],
  lead: ShengJiGroup,
  trumpSuit: Suit,
  levelRank: Rank
): string | null {
  if (selected.length !== lead.size) return `Follow with exactly ${lead.size} card${lead.size > 1 ? "s" : ""}.`;
  const handInSuit = hand.filter(
    (card) => shengJiEffectiveSuit(card, trumpSuit, levelRank) === lead.effectiveSuit
  );
  const selectedInSuit = selected.filter(
    (card) => shengJiEffectiveSuit(card, trumpSuit, levelRank) === lead.effectiveSuit
  );
  const requiredSuitCards = Math.min(lead.size, handInSuit.length);
  if (selectedInSuit.length !== requiredSuitCards) {
    return `You must play ${requiredSuitCards} ${lead.effectiveSuit} card${requiredSuitCards === 1 ? "" : "s"}.`;
  }
  if (handInSuit.length >= lead.size && lead.pattern === "pair") {
    const availablePair = shengJiPairsInSuit(
      hand,
      lead.effectiveSuit,
      trumpSuit,
      levelRank
    ).length;
    if (availablePair && analyzeShengJiPlay(selected, trumpSuit, levelRank)?.pattern !== "pair") {
      return "You have a pair in the led suit and must follow with a pair.";
    }
  }
  if (handInSuit.length >= lead.size && lead.pattern === "tractor") {
    const availableTractor = shengJiTractorsInSuit(
      hand,
      lead.effectiveSuit,
      trumpSuit,
      levelRank,
      lead.size
    ).length;
    if (
      availableTractor &&
      analyzeShengJiPlay(selected, trumpSuit, levelRank)?.pattern !== "tractor"
    ) {
      return "You have a matching tractor and must follow with it.";
    }
  }
  return null;
}

function fallbackShengJiGroup(
  play: PlayedCards,
  trumpSuit: Suit,
  levelRank: Rank
): ShengJiGroup {
  return (
    analyzeShengJiPlay(play.cards, trumpSuit, levelRank) ?? {
      pattern: "single",
      size: play.cards.length,
      effectiveSuit: shengJiEffectiveSuit(play.cards[0], trumpSuit, levelRank),
      topStrength: -1,
      pairCount: 0
    }
  );
}

export function shengJiWinningPlayIndex(
  trick: readonly PlayedCards[],
  trumpSuit: Suit,
  levelRank: Rank
): number {
  if (trick.length === 0) return -1;
  const lead = fallbackShengJiGroup(trick[0], trumpSuit, levelRank);
  let winner = 0;
  let winningGroup = lead;
  for (let index = 1; index < trick.length; index += 1) {
    const candidate = fallbackShengJiGroup(trick[index], trumpSuit, levelRank);
    const matchesShape = candidate.pattern === lead.pattern && candidate.size === lead.size;
    if (!matchesShape) continue;
    const candidateTrump = candidate.effectiveSuit === "trump";
    const winnerTrump = winningGroup.effectiveSuit === "trump";
    const sameLedSuit = candidate.effectiveSuit === lead.effectiveSuit;
    if (
      (candidateTrump && !winnerTrump) ||
      ((candidateTrump === winnerTrump || sameLedSuit) &&
        candidate.effectiveSuit === winningGroup.effectiveSuit &&
        candidate.topStrength > winningGroup.topStrength)
    ) {
      winner = index;
      winningGroup = candidate;
    }
  }
  return winner;
}

function isLegalFollower(state: ShengJiState, seat: Seat, selected: readonly Card[]): string | null {
  return shengJiFollowError(
    state.hands[seat],
    selected,
    state.trick[0].group,
    state.trumpSuit,
    state.levelRank
  );
}

function winningTrickIndex(state: ShengJiState): number {
  return shengJiWinningPlayIndex(state.trick, state.trumpSuit, state.levelRank);
}

function levelUp(rank: Rank, amount: number): Rank {
  return RANKS[Math.min(RANKS.length - 1, RANKS.indexOf(rank) + amount)];
}

function scoreRound(state: ShengJiState, lastWinner: Seat, lastGroup: ShengJiGroup): void {
  const dealerTeam = (state.dealer % 2) as 0 | 1;
  const defenderTeam = (1 - dealerTeam) as 0 | 1;
  if (lastWinner % 2 === defenderTeam) {
    const bottomPoints = state.buried.reduce((total, card) => total + cardPoints(card), 0);
    const multiplier =
      lastGroup.pattern === "single"
        ? 2
        : lastGroup.pattern === "pair"
          ? 4
          : 2 ** (lastGroup.pairCount + 1);
    state.defenderPoints += bottomPoints * multiplier;
  }
  const points = state.defenderPoints;
  let winnerTeam: 0 | 1;
  let advance: number;
  if (points < 80) {
    winnerTeam = dealerTeam;
    advance = points === 0 ? 3 : points < 40 ? 2 : 1;
    state.nextDealer = ((state.dealer + 2) % 4) as Seat;
  } else {
    winnerTeam = defenderTeam;
    advance = Math.max(0, Math.floor((points - 80) / 40));
    state.nextDealer = ((state.dealer + 1) % 4) as Seat;
  }
  state.teamLevels[winnerTeam] = levelUp(state.teamLevels[winnerTeam], advance);
  state.winnerTeam = winnerTeam;
  state.phase = "roundOver";
  state.lastAction = `Defenders finish with ${points} points. Team ${winnerTeam + 1} wins the round${
    advance ? ` and advances ${advance} level${advance === 1 ? "" : "s"}` : ""
  }.`;
}

export function playShengJiAction(
  state: ShengJiState,
  seat: Seat,
  action: ClientAction,
  random = Math.random
): { ok: boolean; error?: string } {
  if (action.type === "nextRound") {
    if (state.phase !== "roundOver") return { ok: false, error: "The round is not over yet." };
    const next = createShengJiState(random, {
      teamLevels: [...state.teamLevels],
      roundNumber: state.roundNumber + 1,
      dealer: state.nextDealer
    });
    Object.assign(state, next);
    return { ok: true };
  }
  if (seat !== state.turn) return { ok: false, error: "Wait for your turn." };

  if (state.phase === "burying") {
    if (action.type !== "bury") return { ok: false, error: "The dealer must bury 8 cards." };
    if (action.cardIds.length !== 8) return { ok: false, error: "Select exactly 8 cards for the kitty." };
    if (!hasCards(state.hands[seat], action.cardIds))
      return { ok: false, error: "Those cards are not in your hand." };
    state.buried = state.hands[seat].filter((card) => action.cardIds.includes(card.id));
    state.hands[seat] = removeCards(state.hands[seat], action.cardIds);
    state.phase = "playing";
    state.turn = state.dealer;
    state.lastAction = "The bottom is sealed. The dealer leads the first trick.";
    return { ok: true };
  }

  if (state.phase !== "playing") return { ok: false, error: "This round has ended." };
  if (action.type !== "play") return { ok: false, error: "Choose cards to play." };
  if (!hasCards(state.hands[seat], action.cardIds))
    return { ok: false, error: "Those cards are not in your hand." };
  const selected = state.hands[seat].filter((card) => action.cardIds.includes(card.id));
  let group = analyzeShengJiPlay(selected, state.trumpSuit, state.levelRank);
  if (state.trick.length === 0) {
    if (!group) return { ok: false, error: "Lead a single, exact pair, or consecutive pair tractor." };
  } else {
    const followerError = isLegalFollower(state, seat, selected);
    if (followerError) return { ok: false, error: followerError };
    // When a player is short in the led suit, a legal discard may mix suits and
    // therefore has no winning shape. Keep a deliberately non-matching group
    // so it can be recorded in the trick without ever beating the lead.
    group ??= {
      pattern: "single",
      size: selected.length,
      effectiveSuit: shengJiEffectiveSuit(selected[0], state.trumpSuit, state.levelRank),
      topStrength: -1,
      pairCount: 0
    };
  }
  state.hands[seat] = removeCards(state.hands[seat], action.cardIds);
  state.trick.push({ seat, cards: selected, group: group!, label: group!.pattern });
  state.lastAction = `Seat ${seat + 1} plays ${group.pattern}.`;

  if (state.trick.length < 4) {
    state.turn = ((seat + 1) % 4) as Seat;
    return { ok: true };
  }

  const winnerIndex = winningTrickIndex(state);
  const winner = state.trick[winnerIndex].seat;
  const trickPoints = state.trick
    .flatMap((play) => play.cards)
    .reduce((total, card) => total + cardPoints(card), 0);
  if (winner % 2 !== state.dealer % 2) state.defenderPoints += trickPoints;
  const lastGroup = state.trick[0].group;
  state.lastAction = `Seat ${winner + 1} takes trick ${state.trickNumber}${
    trickPoints ? ` with ${trickPoints} points` : ""
  }.`;
  state.trick = [];
  state.turn = winner;
  state.trickNumber += 1;
  if (state.hands.every((hand) => hand.length === 0)) scoreRound(state, winner, lastGroup);
  return { ok: true };
}

function lowestByStrength(cards: readonly Card[], state: ShengJiState): Card[] {
  return [...cards].sort(
    (a, b) =>
      shengJiStrength(a, state.trumpSuit, state.levelRank) -
        shengJiStrength(b, state.trumpSuit, state.levelRank) ||
      cardPoints(a) - cardPoints(b)
  );
}

export function chooseShengJiBotAction(state: ShengJiState, seat: Seat): ClientAction {
  const hand = state.hands[seat];
  if (state.phase === "burying") {
    const bury = [...hand].sort(
      (a, b) =>
        Number(shengJiEffectiveSuit(a, state.trumpSuit, state.levelRank) === "trump") -
          Number(shengJiEffectiveSuit(b, state.trumpSuit, state.levelRank) === "trump") ||
        cardPoints(a) - cardPoints(b) ||
        shengJiStrength(a, state.trumpSuit, state.levelRank) -
          shengJiStrength(b, state.trumpSuit, state.levelRank)
    );
    return { type: "bury", cardIds: bury.slice(0, 8).map((card) => card.id) };
  }

  if (state.trick.length === 0) {
    const allSuits = [...SUITS, "trump"] as Array<Suit | "trump">;
    for (const suit of allSuits) {
      const tractor = shengJiTractorsInSuit(hand, suit, state.trumpSuit, state.levelRank)[0];
      if (tractor) return { type: "play", cardIds: tractor.map((card) => card.id) };
    }
    const pairs = allSuits.flatMap((suit) =>
      shengJiPairsInSuit(hand, suit, state.trumpSuit, state.levelRank)
    );
    if (pairs.length) {
      const pair = pairs.sort(
        (a, b) =>
          shengJiStrength(a[0], state.trumpSuit, state.levelRank) -
          shengJiStrength(b[0], state.trumpSuit, state.levelRank)
      )[0];
      return { type: "play", cardIds: pair.map((card) => card.id) };
    }
    return { type: "play", cardIds: [lowestByStrength(hand, state)[0].id] };
  }

  const lead = state.trick[0].group;
  const inSuit = lowestByStrength(
    hand.filter(
      (card) => shengJiEffectiveSuit(card, state.trumpSuit, state.levelRank) === lead.effectiveSuit
    ),
    state
  );
  let selected: Card[] = [];
  if (inSuit.length >= lead.size) {
    if (lead.pattern === "tractor") {
      selected =
        shengJiTractorsInSuit(
          hand,
          lead.effectiveSuit,
          state.trumpSuit,
          state.levelRank,
          lead.size
        )[0] ?? [];
    }
    if (!selected.length && lead.pattern === "pair") {
      selected =
        shengJiPairsInSuit(hand, lead.effectiveSuit, state.trumpSuit, state.levelRank)[0] ?? [];
    }
    if (!selected.length) selected = inSuit.slice(0, lead.size);
  } else {
    selected = [...inSuit];
    const fillers = lowestByStrength(
      hand.filter((card) => !selected.some((chosen) => chosen.id === card.id)),
      state
    );
    selected.push(...fillers.slice(0, lead.size - selected.length));
  }
  return { type: "play", cardIds: selected.map((card) => card.id) };
}

export function shengJiPublicState(state: ShengJiState): ShengJiPublicState {
  return {
    kind: "shengji",
    phase: state.phase,
    turn: state.turn,
    dealer: state.dealer,
    trumpSuit: state.trumpSuit,
    levelRank: state.levelRank,
    teamLevels: state.teamLevels,
    trick: state.trick.map(({ seat, cards, label }) => ({ seat, cards, label })),
    trickNumber: state.trickNumber,
    defenderPoints: state.defenderPoints,
    buriedCount: state.buried.length,
    lastAction: state.lastAction,
    winnerTeam: state.winnerTeam
  };
}
