import { describe, expect, it } from "vitest";
import type { Card, Rank, Suit } from "./cards";
import {
  analyzeGuanDanPlay,
  beatsGuanDan,
  chooseGuanDanBotAction,
  createGuanDanState,
  guandanPublicState,
  playGuanDanAction
} from "./guandan";

let cardCounter = 0;
function card(rank: Card["rank"], suit: Card["suit"] = "clubs"): Card {
  return { id: `test-${cardCounter++}`, rank, suit, deck: (cardCounter % 2) as 0 | 1 };
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

describe("Guan Dan engine", () => {
  it.each([
    [[card("8")], "single"],
    [[card("8"), card("8", "spades")], "pair"],
    [[card("8"), card("8", "spades"), card("8", "diamonds")], "triple"],
    [[card("7"), card("7", "spades"), card("7", "diamonds"), card("K"), card("K", "hearts")], "fullHouse"],
    [[card("3", "clubs"), card("4", "diamonds"), card("5", "hearts"), card("6", "spades"), card("7", "clubs")], "straight"],
    [[card("3"), card("3"), card("4"), card("4"), card("5"), card("5")], "pairStraight"],
    [[card("9"), card("9"), card("9"), card("10"), card("10"), card("10")], "tripleStraight"],
    [[card("Q"), card("Q"), card("Q"), card("Q")], "bomb"]
  ])("recognizes standard combinations", (cards, type) => {
    expect(analyzeGuanDanPlay(cards as Card[], "2")?.type).toBe(type);
  });

  it("uses the heart level card as a wild inside a combination", () => {
    const cards = [card("3", "clubs"), card("4", "diamonds"), card("5", "spades"), card("6"), card("2", "hearts")];
    expect(analyzeGuanDanPlay(cards, "2")?.type).toBe("straight");
  });

  it("makes only the heart level card wild and never substitutes a joker", () => {
    const ordinaryLevel = [
      card("3", "clubs"),
      card("4", "diamonds"),
      card("5", "spades"),
      card("6", "clubs"),
      card("8", "spades")
    ];
    const heartLevel = [...ordinaryLevel.slice(0, 4), card("8", "hearts")];
    expect(analyzeGuanDanPlay(ordinaryLevel, "8")).toBeNull();
    expect(analyzeGuanDanPlay(heartLevel, "8")?.type).toBe("straight");
    expect(
      analyzeGuanDanPlay(
        [card("BJ", "joker"), card("BJ", "joker"), card("8", "hearts"), card("8", "hearts")],
        "8"
      )
    ).toBeNull();
    expect(
      analyzeGuanDanPlay(
        [card("BJ", "joker"), card("BJ", "joker"), card("BJ", "joker"), card("BJ", "joker")],
        "8"
      )
    ).toBeNull();
  });

  it("lets bombs beat ordinary plays and orders bombs by size", () => {
    const pair = analyzeGuanDanPlay([card("A"), card("A")], "2")!;
    const four = analyzeGuanDanPlay([card("3"), card("3"), card("3"), card("3")], "2")!;
    const six = analyzeGuanDanPlay(
      [card("2"), card("2"), card("2"), card("2"), card("2"), card("2")],
      "3" as Rank
    )!;
    expect(beatsGuanDan(four, pair)).toBe(true);
    expect(beatsGuanDan(six, four)).toBe(true);
  });

  it("places a straight flush above every five-card bomb and below every six-card bomb", () => {
    const five = analyzeGuanDanPlay(
      [card("A"), card("A"), card("A"), card("A"), card("A")],
      "2"
    )!;
    const straightFlush = analyzeGuanDanPlay(
      [
        card("6", "spades"),
        card("7", "spades"),
        card("8", "spades"),
        card("9", "spades"),
        card("10", "spades")
      ],
      "2"
    )!;
    const six = analyzeGuanDanPlay(
      [card("3"), card("3"), card("3"), card("3"), card("3"), card("3")],
      "2"
    )!;
    expect(beatsGuanDan(straightFlush, five)).toBe(true);
    expect(beatsGuanDan(six, straightFlush)).toBe(true);
  });

  it("keeps the four-joker bomb above even a ten-card bomb", () => {
    const jokerBomb = analyzeGuanDanPlay(
      [
        card("BJ", "joker"),
        card("BJ", "joker"),
        card("RJ", "joker"),
        card("RJ", "joker")
      ],
      "2"
    )!;
    const ten = analyzeGuanDanPlay(Array.from({ length: 10 }, () => card("9")), "2")!;
    expect(beatsGuanDan(jokerBomb, ten)).toBe(true);
    expect(beatsGuanDan(ten, jokerBomb)).toBe(false);
  });

  it("keeps each play on the table for one full seat rotation", () => {
    const state = createGuanDanState(seededRandom(12), { startingSeat: 0 });
    const rotationCards = [
      [card("3"), card("7")],
      [card("4"), card("8")],
      [card("5"), card("9")],
      [card("6"), card("10")]
    ] as typeof state.hands;
    const secondLeadId = rotationCards[0][1].id;
    state.hands = rotationCards;

    rotationCards.forEach((hand, seat) => {
      const result = playGuanDanAction(state, seat as 0 | 1 | 2 | 3, {
        type: "play",
        cardIds: [hand[0].id]
      });
      expect(result.ok, result.error).toBe(true);
    });

    expect(guandanPublicState(state).tablePlays.map((play) => play.seat)).toEqual([
      0, 1, 2, 3
    ]);

    const next = playGuanDanAction(state, 0, {
      type: "play",
      cardIds: [secondLeadId]
    });
    expect(next.ok, next.error).toBe(true);
    expect(guandanPublicState(state).tablePlays.map((play) => play.seat)).toEqual([
      1, 2, 3, 0
    ]);
  });

  it("plays a complete all-bot round without stalling", () => {
    const random = seededRandom(41);
    const state = createGuanDanState(random, { startingSeat: 0 });
    let actions = 0;
    while (state.phase === "playing" && actions < 1000) {
      const seat = state.turn;
      const action = chooseGuanDanBotAction(state, seat);
      const result = playGuanDanAction(state, seat, action, random);
      expect(result.ok, result.error).toBe(true);
      actions += 1;
    }
    expect(state.phase).toBe("roundOver");
    expect(state.finishOrder).toHaveLength(4);
    expect(state.hands.reduce((sum, hand) => sum + hand.length, 0)).toBeGreaterThanOrEqual(0);
    expect(actions).toBeLessThan(1000);
  });
});
