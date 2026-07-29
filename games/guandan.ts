import {
  RANKS,
  createDoubleDeck,
  hasCards,
  rankIndex,
  removeCards,
  shuffle,
  sortNatural,
  type Card,
  type Rank
} from "./cards.js";
import type { ClientAction, GuanDanPublicState, PlayedCards, Seat } from "../shared/types.js";

export type GuanDanComboType =
  | "single"
  | "pair"
  | "triple"
  | "fullHouse"
  | "straight"
  | "pairStraight"
  | "tripleStraight"
  | "bomb"
  | "straightFlush"
  | "jokerBomb";

export interface GuanDanCombo {
  type: GuanDanComboType;
  size: number;
  strength: number;
  label: string;
  bombPower?: number;
}

export interface GuanDanState {
  kind: "guandan";
  hands: [Card[], Card[], Card[], Card[]];
  phase: "playing" | "roundOver" | "matchOver";
  turn: Seat;
  leader: Seat;
  levelRank: Rank;
  declaringTeam: 0 | 1;
  teamLevels: [Rank, Rank];
  currentPlay: (PlayedCards & { combo: GuanDanCombo }) | null;
  tablePlays: PlayedCards[];
  passes: number;
  finishOrder: Seat[];
  lastAction: string;
  roundNumber: number;
  winnerTeam?: 0 | 1;
}

const COMBO_NAMES: Record<GuanDanComboType, string> = {
  single: "Single",
  pair: "Pair",
  triple: "Triple",
  fullHouse: "Full house",
  straight: "Straight",
  pairStraight: "Three pairs",
  tripleStraight: "Two triples",
  bomb: "Bomb",
  straightFlush: "Straight flush",
  jokerBomb: "Four jokers"
};

function groupByRank(cards: readonly Card[]): Map<Card["rank"], Card[]> {
  const grouped = new Map<Card["rank"], Card[]>();
  for (const card of cards) grouped.set(card.rank, [...(grouped.get(card.rank) ?? []), card]);
  return grouped;
}

function guandanStrength(rank: Card["rank"], levelRank: Rank): number {
  if (rank === "RJ") return 15;
  if (rank === "BJ") return 14;
  if (rank === levelRank) return 13;
  return rankIndex(rank);
}

function sequenceHigh(ranks: readonly Card["rank"][]): number | null {
  if (ranks.some((rank) => rank === "BJ" || rank === "RJ")) return null;
  const indexes = [...new Set(ranks.map(rankIndex))].sort((a, b) => a - b);
  if (indexes.length !== ranks.length) return null;
  if (indexes.length === 5 && indexes.join(",") === "0,1,2,3,12") return 3;
  for (let index = 1; index < indexes.length; index += 1) {
    if (indexes[index] !== indexes[0] + index) return null;
  }
  return indexes.at(-1) ?? null;
}

function analyzeFixed(cards: readonly Card[], levelRank: Rank): GuanDanCombo | null {
  const size = cards.length;
  if (size === 0) return null;
  const groups = [...groupByRank(cards).entries()];
  const counts = groups.map(([, group]) => group.length).sort((a, b) => b - a);
  const strength = Math.max(...cards.map((card) => guandanStrength(card.rank, levelRank)));

  if (
    size === 4 &&
    cards.every((card) => card.suit === "joker") &&
    cards.filter((card) => card.rank === "BJ").length === 2 &&
    cards.filter((card) => card.rank === "RJ").length === 2
  ) {
    return { type: "jokerBomb", size, strength: 99, bombPower: 2000, label: COMBO_NAMES.jokerBomb };
  }

  if (groups.length === 1 && size >= 4 && cards[0].suit !== "joker") {
    return {
      type: "bomb",
      size,
      strength,
      bombPower: size * 100 + strength,
      label: `${size}-card bomb`
    };
  }

  if (size === 5 && cards.every((card) => card.suit === cards[0].suit && card.suit !== "joker")) {
    const high = sequenceHigh(cards.map((card) => card.rank));
    if (high !== null) {
      return {
        type: "straightFlush",
        size,
        strength: high,
        bombPower: 550 + high,
        label: COMBO_NAMES.straightFlush
      };
    }
  }

  if (size === 1) return { type: "single", size, strength, label: COMBO_NAMES.single };
  if (size === 2 && counts[0] === 2) return { type: "pair", size, strength, label: COMBO_NAMES.pair };
  if (size === 3 && counts[0] === 3)
    return { type: "triple", size, strength, label: COMBO_NAMES.triple };

  if (size === 5 && counts.join(",") === "3,2") {
    const tripleRank = groups.find(([, group]) => group.length === 3)?.[0];
    return {
      type: "fullHouse",
      size,
      strength: guandanStrength(tripleRank!, levelRank),
      label: COMBO_NAMES.fullHouse
    };
  }

  if (size === 5 && groups.length === 5) {
    const high = sequenceHigh(groups.map(([rank]) => rank));
    if (high !== null) return { type: "straight", size, strength: high, label: COMBO_NAMES.straight };
  }

  if (size === 6 && groups.length === 3 && counts.every((count) => count === 2)) {
    const high = sequenceHigh(groups.map(([rank]) => rank));
    if (high !== null)
      return { type: "pairStraight", size, strength: high, label: COMBO_NAMES.pairStraight };
  }

  if (size === 6 && groups.length === 2 && counts.every((count) => count === 3)) {
    const high = sequenceHigh(groups.map(([rank]) => rank));
    if (high !== null)
      return { type: "tripleStraight", size, strength: high, label: COMBO_NAMES.tripleStraight };
  }
  return null;
}

function comboPriority(combo: GuanDanCombo): number {
  if (combo.bombPower !== undefined) return 10000 + combo.bombPower;
  return (
    {
      single: 1,
      pair: 2,
      triple: 3,
      fullHouse: 4,
      straight: 5,
      pairStraight: 6,
      tripleStraight: 7,
      bomb: 8,
      straightFlush: 9,
      jokerBomb: 10
    }[combo.type] * 100 +
    combo.strength
  );
}

export function analyzeGuanDanPlay(cards: readonly Card[], levelRank: Rank): GuanDanCombo | null {
  const wilds = cards.filter((card) => card.suit === "hearts" && card.rank === levelRank);
  if (wilds.length === 0 || (cards.length === 1 && wilds.length === 1)) return analyzeFixed(cards, levelRank);

  const fixedCards = cards.filter((card) => !wilds.includes(card));
  const candidates: GuanDanCombo[] = [];
  const assignments = (position: number, assigned: Rank[]): void => {
    if (position === wilds.length) {
      const substituted = [
        ...fixedCards,
        ...wilds.map((card, index) => ({ ...card, rank: assigned[index] }))
      ];
      const combo = analyzeFixed(substituted, levelRank);
      if (combo) candidates.push(combo);
      return;
    }
    for (const rank of RANKS) assignments(position + 1, [...assigned, rank]);
  };
  assignments(0, []);
  return candidates.sort((a, b) => comboPriority(b) - comboPriority(a))[0] ?? null;
}

export function beatsGuanDan(candidate: GuanDanCombo, current: GuanDanCombo): boolean {
  const candidateBomb = candidate.bombPower !== undefined;
  const currentBomb = current.bombPower !== undefined;
  if (candidateBomb || currentBomb) {
    if (!candidateBomb) return false;
    if (!currentBomb) return true;
    return candidate.bombPower! > current.bombPower!;
  }
  return (
    candidate.type === current.type &&
    candidate.size === current.size &&
    candidate.strength > current.strength
  );
}

export function createGuanDanState(
  random = Math.random,
  options?: {
    teamLevels?: [Rank, Rank];
    roundNumber?: number;
    startingSeat?: Seat;
    declaringTeam?: 0 | 1;
    previousFinish?: Seat[];
  }
): GuanDanState {
  const deck = shuffle(createDoubleDeck(), random);
  const hands: GuanDanState["hands"] = [[], [], [], []];
  deck.forEach((card, index) => hands[index % 4].push(card));
  hands.forEach((hand, index) => (hands[index as Seat] = sortNatural(hand)));
  const teamLevels = options?.teamLevels ?? ["2", "2"];
  const startingSeat = options?.startingSeat ?? (Math.floor(random() * 4) as Seat);
  const declaringTeam = options?.declaringTeam ?? ((startingSeat % 2) as 0 | 1);
  const levelRank = teamLevels[declaringTeam] ?? "2";
  const state: GuanDanState = {
    kind: "guandan",
    hands,
    phase: "playing",
    turn: startingSeat,
    leader: startingSeat,
    levelRank,
    declaringTeam,
    teamLevels,
    currentPlay: null,
    tablePlays: [],
    passes: 0,
    finishOrder: [],
    lastAction: "The cards are dealt. Lead any combination.",
    roundNumber: options?.roundNumber ?? 1
  };
  if (options?.previousFinish?.length === 4) applyAutomaticTribute(state, options.previousFinish);
  return state;
}

function nextActiveSeat(state: GuanDanState, seat: Seat): Seat {
  for (let offset = 1; offset <= 4; offset += 1) {
    const candidate = ((seat + offset) % 4) as Seat;
    if (state.hands[candidate].length > 0) return candidate;
  }
  return seat;
}

function levelUp(rank: Rank, amount: number): Rank {
  return RANKS[Math.min(RANKS.length - 1, RANKS.indexOf(rank) + amount)];
}

function finishRound(state: GuanDanState): void {
  while (state.finishOrder.length < 4) {
    const anchor = state.finishOrder.at(-1) ?? state.leader;
    const remaining = ([1, 2, 3, 4] as const)
      .map((offset) => ((anchor + offset) % 4) as Seat)
      .find((seat) => !state.finishOrder.includes(seat));
    if (remaining === undefined) break;
    state.finishOrder.push(remaining);
  }
  const first = state.finishOrder[0];
  const partnerPlace = state.finishOrder.indexOf(((first + 2) % 4) as Seat);
  const winningTeam = (first % 2) as 0 | 1;
  const advance = partnerPlace === 1 ? 3 : partnerPlace === 2 ? 2 : 1;
  const winsAtAce =
    state.declaringTeam === winningTeam && state.levelRank === "A" && partnerPlace <= 2;
  state.teamLevels[winningTeam] = levelUp(state.teamLevels[winningTeam], advance);
  state.winnerTeam = winningTeam;
  state.phase = winsAtAce ? "matchOver" : "roundOver";
  state.lastAction =
    partnerPlace === 1
      ? `Team ${winningTeam + 1} swept first and second — advance 3 levels.`
      : `Team ${winningTeam + 1} advances ${advance} level${advance > 1 ? "s" : ""}.`;
}

export function playGuanDanAction(
  state: GuanDanState,
  seat: Seat,
  action: ClientAction,
  random = Math.random
): { ok: boolean; error?: string } {
  if (action.type === "nextRound") {
    if (state.phase !== "roundOver") return { ok: false, error: "The round is not over yet." };
    const previousFinish = [...state.finishOrder];
    const next = createGuanDanState(random, {
      teamLevels: [...state.teamLevels],
      roundNumber: state.roundNumber + 1,
      startingSeat: previousFinish[3],
      declaringTeam: state.winnerTeam,
      previousFinish
    });
    Object.assign(state, next);
    return { ok: true };
  }

  if (state.phase !== "playing") return { ok: false, error: "This round has ended." };
  if (seat !== state.turn) return { ok: false, error: "Wait for your turn." };

  if (action.type === "pass") {
    if (!state.currentPlay) return { ok: false, error: "You cannot pass when leading." };
    state.tablePlays = state.tablePlays.filter((play) => play.seat !== seat);
    state.passes += 1;
    state.lastAction = `Seat ${seat + 1} passes.`;
    const activeCount = state.hands.filter((hand) => hand.length > 0).length;
    const passesNeeded = activeCount - (state.hands[state.leader].length > 0 ? 1 : 0);
    if (state.passes >= Math.max(1, passesNeeded)) {
      const partner = ((state.leader + 2) % 4) as Seat;
      const nextLeader =
        state.hands[state.leader].length > 0
          ? state.leader
          : state.hands[partner].length > 0
            ? partner
            : nextActiveSeat(state, state.leader);
      state.turn = nextLeader;
      state.leader = nextLeader;
      state.currentPlay = null;
      state.passes = 0;
      state.lastAction = `The table clears. Seat ${nextLeader + 1} leads.`;
    } else {
      state.turn = nextActiveSeat(state, seat);
    }
    return { ok: true };
  }

  if (action.type !== "play") return { ok: false, error: "That action is not used in Guan Dan." };
  if (!hasCards(state.hands[seat], action.cardIds))
    return { ok: false, error: "Those cards are not in your hand." };
  const selected = state.hands[seat].filter((card) => action.cardIds.includes(card.id));
  const combo = analyzeGuanDanPlay(selected, state.levelRank);
  if (!combo) return { ok: false, error: "That selection is not a valid Guan Dan combination." };
  if (state.currentPlay && !beatsGuanDan(combo, state.currentPlay.combo)) {
    return { ok: false, error: `Play a higher ${state.currentPlay.combo.label}, or use a bomb.` };
  }

  const startsNewTable = state.currentPlay === null;
  state.hands[seat] = removeCards(state.hands[seat], action.cardIds);
  state.currentPlay = { seat, cards: selected, combo, label: combo.label };
  state.tablePlays = [
    ...(!startsNewTable
      ? state.tablePlays.filter((play) => play.seat !== seat)
      : []),
    { seat, cards: selected, label: combo.label }
  ];
  state.leader = seat;
  state.passes = 0;
  state.lastAction = `Seat ${seat + 1} plays ${combo.label}.`;
  if (state.hands[seat].length === 0 && !state.finishOrder.includes(seat)) {
    state.finishOrder.push(seat);
    state.lastAction += ` They finish #${state.finishOrder.length}.`;
    const swept =
      state.finishOrder.length === 2 &&
      state.finishOrder[1] === (((state.finishOrder[0] + 2) % 4) as Seat);
    if (swept || state.finishOrder.length === 3) {
      finishRound(state);
      return { ok: true };
    }
  }
  state.turn = nextActiveSeat(state, seat);
  return { ok: true };
}

function lowestCards(hand: readonly Card[], count: number, levelRank: Rank): Card[] {
  return [...hand]
    .sort((a, b) => guandanStrength(a.rank, levelRank) - guandanStrength(b.rank, levelRank))
    .filter((card) => card.suit !== "joker" && card.rank !== levelRank)
    .slice(0, count);
}

function highestTributeCard(hand: readonly Card[], levelRank: Rank): Card | undefined {
  return [...hand]
    .filter((card) => !(card.suit === "hearts" && card.rank === levelRank))
    .sort((a, b) => guandanStrength(b.rank, levelRank) - guandanStrength(a.rank, levelRank))[0];
}

function exchangeOne(state: GuanDanState, loser: Seat, winner: Seat): void {
  const tribute = highestTributeCard(state.hands[loser], state.levelRank);
  const returned = lowestCards(state.hands[winner], 1, state.levelRank)[0];
  if (!tribute || !returned) return;
  state.hands[loser] = sortNatural([
    ...removeCards(state.hands[loser], [tribute.id]),
    returned
  ]);
  state.hands[winner] = sortNatural([
    ...removeCards(state.hands[winner], [returned.id]),
    tribute
  ]);
}

function applyAutomaticTribute(state: GuanDanState, finish: Seat[]): void {
  const first = finish[0];
  const second = finish[1];
  const fourth = finish[3];
  const firstTeam = first % 2;
  const redJokersHeldByLosers = state.hands
    .filter((_, seat) => seat % 2 !== firstTeam)
    .flat()
    .filter((card) => card.rank === "RJ").length;
  if (redJokersHeldByLosers === 2) {
    state.turn = fourth;
    state.leader = fourth;
    state.lastAction = "Double red jokers cancel tribute. Last place leads.";
    return;
  }
  if (second % 2 === firstTeam) {
    exchangeOne(state, fourth, first);
    exchangeOne(state, finish[2], second);
    state.lastAction = "Double tribute exchanged automatically. Last place leads.";
  } else {
    exchangeOne(state, fourth, first);
    state.lastAction = "Tribute exchanged automatically. Last place leads.";
  }
  state.turn = fourth;
  state.leader = fourth;
}

function candidatePlays(hand: readonly Card[], levelRank: Rank): Array<{ cards: Card[]; combo: GuanDanCombo }> {
  const result: Array<{ cards: Card[]; combo: GuanDanCombo }> = [];
  const groups = [...groupByRank(hand).values()];
  for (const card of hand) {
    const combo = analyzeGuanDanPlay([card], levelRank)!;
    result.push({ cards: [card], combo });
  }
  for (const group of groups) {
    for (const count of [2, 3]) {
      if (group.length >= count) {
        const cards = group.slice(0, count);
        const combo = analyzeGuanDanPlay(cards, levelRank);
        if (combo) result.push({ cards, combo });
      }
    }
    if (group.length >= 4) {
      for (let count = 4; count <= group.length; count += 1) {
        const cards = group.slice(0, count);
        const combo = analyzeGuanDanPlay(cards, levelRank);
        if (combo) result.push({ cards, combo });
      }
    }
  }
  const pairs = groups.filter((group) => group.length >= 2);
  const triples = groups.filter((group) => group.length >= 3);
  for (const triple of triples) {
    for (const pair of pairs) {
      if (triple[0].rank === pair[0].rank) continue;
      const cards = [...triple.slice(0, 3), ...pair.slice(0, 2)];
      const combo = analyzeGuanDanPlay(cards, levelRank);
      if (combo) result.push({ cards, combo });
    }
  }
  return result;
}

export function chooseGuanDanBotAction(state: GuanDanState, seat: Seat): ClientAction {
  const candidates = candidatePlays(state.hands[seat], state.levelRank)
    .filter(({ combo }) => !state.currentPlay || beatsGuanDan(combo, state.currentPlay.combo))
    .sort((a, b) => {
      const aBomb = a.combo.bombPower !== undefined ? 1 : 0;
      const bBomb = b.combo.bombPower !== undefined ? 1 : 0;
      return aBomb - bBomb || a.combo.size - b.combo.size || a.combo.strength - b.combo.strength;
    });
  if (state.currentPlay && state.currentPlay.seat % 2 === seat % 2) return { type: "pass" };
  const choice = candidates[0];
  return choice ? { type: "play", cardIds: choice.cards.map((card) => card.id) } : { type: "pass" };
}

export function guandanPublicState(state: GuanDanState): GuanDanPublicState {
  return {
    kind: "guandan",
    phase: state.phase,
    turn: state.turn,
    leader: state.leader,
    levelRank: state.levelRank,
    teamLevels: state.teamLevels,
    currentPlay: state.currentPlay
      ? {
          seat: state.currentPlay.seat,
          cards: state.currentPlay.cards,
          label: state.currentPlay.combo.label
        }
      : null,
    tablePlays: state.tablePlays.map(({ seat, cards, label }) => ({ seat, cards, label })),
    passes: state.passes,
    finishOrder: state.finishOrder,
    lastAction: state.lastAction,
    roundNumber: state.roundNumber,
    winnerTeam: state.winnerTeam
  };
}
