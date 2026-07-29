import { describe, expect, it } from "vitest";
import type { Card } from "./cards";
import {
  analyzeShengJiPlay,
  chooseShengJiBotAction,
  createShengJiState,
  playShengJiAction,
  shengJiEffectiveSuit,
  shengJiPublicState
} from "./shengji";

let cardCounter = 0;
function card(rank: Card["rank"], suit: Card["suit"] = "clubs", deck: 0 | 1 = 0): Card {
  return { id: `shengji-test-${cardCounter++}`, rank, suit, deck };
}

function seededRandom(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

describe("Sheng Ji engine", () => {
  it("deals two complete decks with two jokers per deck", () => {
    const state = createShengJiState(seededRandom(18), { dealer: 0 });
    const dealtCards = state.hands.flat();

    expect(dealtCards).toHaveLength(108);
    expect(dealtCards.filter((card) => card.suit === "joker")).toHaveLength(4);
    expect(state.hands.map((hand) => hand.length)).toEqual([33, 25, 25, 25]);
    expect(state.kitty).toHaveLength(8);
  });

  it("treats jokers, all level cards, and the declared suit as trump", () => {
    expect(shengJiEffectiveSuit(card("RJ", "joker"), "spades", "6")).toBe("trump");
    expect(shengJiEffectiveSuit(card("6", "clubs"), "spades", "6")).toBe("trump");
    expect(shengJiEffectiveSuit(card("A", "spades"), "spades", "6")).toBe("trump");
    expect(shengJiEffectiveSuit(card("A", "clubs"), "spades", "6")).toBe("clubs");
  });

  it("recognizes pairs and tractors from duplicated deck cards", () => {
    const pair = [card("7", "clubs", 0), card("7", "clubs", 1)];
    const tractor = [...pair, card("8", "clubs", 0), card("8", "clubs", 1)];
    expect(analyzeShengJiPlay(pair, "spades", "2")?.pattern).toBe("pair");
    expect(analyzeShengJiPlay(tractor, "spades", "2")?.pattern).toBe("tractor");
  });

  it("publishes all four plays until the next trick starts", () => {
    const state = createShengJiState(seededRandom(24), { dealer: 0 });
    const openingCards = [
      card("3", "clubs"),
      card("4", "clubs"),
      card("5", "clubs"),
      card("6", "clubs")
    ];
    const nextCards = [
      card("7", "diamonds"),
      card("8", "diamonds"),
      card("9", "diamonds"),
      card("10", "diamonds")
    ];
    state.hands = openingCards.map((opening, seat) => [
      opening,
      nextCards[seat]
    ]) as typeof state.hands;
    state.phase = "playing";
    state.turn = 0;

    openingCards.forEach((opening, seat) => {
      const result = playShengJiAction(state, seat as 0 | 1 | 2 | 3, {
        type: "play",
        cardIds: [opening.id]
      });
      expect(result.ok, result.error).toBe(true);
    });

    expect(state.trick).toEqual([]);
    expect(state.lastTrick).toHaveLength(4);
    expect(shengJiPublicState(state).lastTrick.flatMap((play) => play.cards)).toHaveLength(4);

    const nextLeader = state.turn;
    const nextCard = state.hands[nextLeader][0];
    const result = playShengJiAction(state, nextLeader, {
      type: "play",
      cardIds: [nextCard.id]
    });
    expect(result.ok, result.error).toBe(true);
    expect(state.lastTrick).toEqual([]);
    expect(state.trick).toHaveLength(1);
  });

  it("plays a complete all-bot round, including burying and scoring", () => {
    const random = seededRandom(87);
    const state = createShengJiState(random, { dealer: 0 });
    let actions = 0;
    while (state.phase !== "roundOver" && actions < 600) {
      const seat = state.turn;
      const action = chooseShengJiBotAction(state, seat);
      const result = playShengJiAction(state, seat, action, random);
      expect(result.ok, result.error).toBe(true);
      actions += 1;
    }
    expect(state.phase).toBe("roundOver");
    expect(state.buried).toHaveLength(8);
    expect(state.hands.every((hand) => hand.length === 0)).toBe(true);
    expect(state.defenderPoints).toBeGreaterThanOrEqual(0);
    expect(actions).toBeLessThan(600);
  });
});
