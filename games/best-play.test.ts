import { describe, expect, it } from "vitest";
import type { Card, Rank, Suit } from "./cards";
import {
  guanDanPlayCandidates,
  recommendBestPlay,
  type BestPlayContext
} from "./best-play";
import { analyzeGuanDanPlay } from "./guandan";
import {
  analyzeShengJiPlay,
  shengJiFollowError
} from "./shengji";
import type {
  GuanDanPublicState,
  PlayedCards,
  Seat,
  ShengJiPublicState
} from "../shared/types";

let cardCounter = 0;
function card(
  rank: Card["rank"],
  suit: Card["suit"] = "clubs",
  deck: 0 | 1 = (cardCounter % 2) as 0 | 1
): Card {
  cardCounter += 1;
  return { id: `hint-test-${cardCounter}`, rank, suit, deck };
}

function players(counts: [number, number, number, number] = [12, 12, 12, 12]) {
  return counts.map((cardsLeft, seat) => ({
    seat: seat as Seat,
    team: (seat % 2) as 0 | 1,
    cardsLeft
  }));
}

function guanDanState(
  currentPlay: PlayedCards | null = null,
  levelRank: Rank = "2",
  turn: Seat = 0
): GuanDanPublicState {
  return {
    kind: "guandan",
    phase: "playing",
    turn,
    leader: currentPlay?.seat ?? turn,
    levelRank,
    teamLevels: [levelRank, levelRank],
    currentPlay,
    passes: 0,
    finishOrder: [],
    lastAction: "",
    roundNumber: 1
  };
}

function shengJiState(options?: {
  phase?: ShengJiPublicState["phase"];
  turn?: Seat;
  trumpSuit?: Suit;
  levelRank?: Rank;
  trick?: PlayedCards[];
}): ShengJiPublicState {
  return {
    kind: "shengji",
    phase: options?.phase ?? "playing",
    turn: options?.turn ?? 0,
    dealer: 0,
    trumpSuit: options?.trumpSuit ?? "spades",
    levelRank: options?.levelRank ?? "2",
    teamLevels: ["2", "2"],
    trick: options?.trick ?? [],
    trickNumber: 1,
    defenderPoints: 0,
    buriedCount: 0,
    lastAction: ""
  };
}

function context(
  hand: Card[],
  state: BestPlayContext["state"],
  seat: Seat = 0,
  counts?: [number, number, number, number]
): BestPlayContext {
  return { hand, state, seat, players: players(counts) };
}

describe("best-play advisor", () => {
  it("enumerates wildcard sequences and the four-joker bomb without treating jokers as fuel", () => {
    const wildStraight = [
      card("3"),
      card("4", "diamonds"),
      card("5", "spades"),
      card("6"),
      card("2", "hearts")
    ];
    const jokers = [
      card("BJ", "joker", 0),
      card("BJ", "joker", 1),
      card("RJ", "joker", 0),
      card("RJ", "joker", 1)
    ];
    const candidates = guanDanPlayCandidates([...wildStraight, ...jokers], "2");
    expect(
      candidates.some(({ combo, cards }) => combo.type === "straight" && cards.length === 5)
    ).toBe(true);
    expect(candidates.some(({ combo }) => combo.type === "jokerBomb")).toBe(true);
    expect(
      candidates.some(
        ({ combo, cards }) =>
          combo.type === "bomb" && cards.some((candidate) => candidate.suit === "joker")
      )
    ).toBe(false);
  });

  it("leads a useful pair instead of shedding a random single", () => {
    const hand = [card("3"), card("3", "spades"), card("8"), card("9")];
    const hint = recommendBestPlay(context(hand, guanDanState()));
    expect(hint?.action).toBe("play");
    expect(analyzeGuanDanPlay(
      hand.filter((candidate) => hint?.cardIds.includes(candidate.id)),
      "2"
    )?.type).toBe("pair");
  });

  it("answers with the cheapest ordinary shape and conserves a bomb", () => {
    const current = [card("8"), card("8", "spades")];
    const hand = [
      card("9"),
      card("9", "spades"),
      card("3"),
      card("3", "spades"),
      card("3", "diamonds"),
      card("3", "hearts"),
      card("4")
    ];
    const hint = recommendBestPlay(
      context(hand, guanDanState({ seat: 1, cards: current, label: "Pair" }))
    );
    expect(hint?.action).toBe("play");
    expect(analyzeGuanDanPlay(
      hand.filter((candidate) => hint?.cardIds.includes(candidate.id)),
      "2"
    )?.type).toBe("pair");
  });

  it("suggests passing instead of spending the only bomb until an opponent is nearly out", () => {
    const current = [card("A"), card("A", "spades")];
    const hand = [
      card("3"),
      card("3", "spades"),
      card("3", "diamonds"),
      card("3", "hearts"),
      card("4")
    ];
    const state = guanDanState({ seat: 1, cards: current, label: "Pair" });
    expect(recommendBestPlay(context(hand, state))?.action).toBe("pass");
    expect(recommendBestPlay(context(hand, state, 0, [4, 2, 7, 8]))?.action).toBe("play");
  });

  it("passes when a partner owns the current Guan Dan lead", () => {
    const current = [card("7")];
    const hand = [card("8"), card("9")];
    const hint = recommendBestPlay(
      context(hand, guanDanState({ seat: 2, cards: current, label: "Single" }))
    );
    expect(hint?.action).toBe("pass");
    expect(hint?.label).toMatch(/partner/i);
  });

  it("selects a conservative eight-card Sheng Ji bury", () => {
    const hand = [
      card("3", "clubs"),
      card("4", "clubs"),
      card("6", "diamonds"),
      card("7", "diamonds"),
      card("8", "hearts"),
      card("9", "hearts"),
      card("J", "clubs"),
      card("Q", "diamonds"),
      card("5", "clubs"),
      card("K", "hearts"),
      card("A", "spades"),
      card("RJ", "joker")
    ];
    const state = shengJiState({ phase: "burying", trumpSuit: "spades", levelRank: "2" });
    const hint = recommendBestPlay(context(hand, state));
    const selected = hand.filter((candidate) => hint?.cardIds.includes(candidate.id));
    expect(hint?.action).toBe("bury");
    expect(selected).toHaveLength(8);
    expect(selected.some((candidate) => candidate.suit === "joker")).toBe(false);
    expect(selected.some((candidate) => candidate.suit === "spades")).toBe(false);
  });

  it("obeys a forced pair follow and returns a server-legal selection", () => {
    const leadCards = [card("5", "clubs", 0), card("5", "clubs", 1)];
    const hand = [
      card("7", "clubs", 0),
      card("7", "clubs", 1),
      card("8", "clubs"),
      card("9", "clubs"),
      card("A", "spades")
    ];
    const state = shengJiState({
      trick: [{ seat: 3, cards: leadCards, label: "pair" }]
    });
    const hint = recommendBestPlay(context(hand, state));
    const selected = hand.filter((candidate) => hint?.cardIds.includes(candidate.id));
    const lead = analyzeShengJiPlay(leadCards, state.trumpSuit, state.levelRank)!;
    expect(analyzeShengJiPlay(selected, state.trumpSuit, state.levelRank)?.pattern).toBe("pair");
    expect(shengJiFollowError(hand, selected, lead, state.trumpSuit, state.levelRank)).toBeNull();
  });

  it("feeds point cards when a Sheng Ji partner is already winning", () => {
    const trick = [
      { seat: 2 as Seat, cards: [card("Q", "clubs")], label: "single" },
      { seat: 3 as Seat, cards: [card("J", "clubs")], label: "single" }
    ];
    const hand = [card("K", "clubs"), card("3", "clubs")];
    const state = shengJiState({ turn: 0, trick });
    const hint = recommendBestPlay(context(hand, state));
    const selected = hand.find((candidate) => hint?.cardIds.includes(candidate.id));
    expect(selected?.rank).toBe("K");
    expect(hint?.label).toMatch(/10 points/i);
  });

  it("takes a point-bearing Sheng Ji trick when a clean winner is available", () => {
    const trick = [{ seat: 0 as Seat, cards: [card("K", "clubs")], label: "single" }];
    const hand = [card("A", "clubs"), card("3", "clubs")];
    const state = shengJiState({ turn: 1, trick });
    const hint = recommendBestPlay(context(hand, state, 1));
    const selected = hand.find((candidate) => hint?.cardIds.includes(candidate.id));
    expect(selected?.rank).toBe("A");
    expect(hint?.label).toMatch(/take/i);
  });

  it("is deterministic for identical visible state", () => {
    const hand = [card("4"), card("4", "spades"), card("7"), card("8")];
    const input = context(hand, guanDanState());
    expect(recommendBestPlay(input)).toEqual(recommendBestPlay(input));
  });
});
