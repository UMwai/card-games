import { describe, expect, it } from "vitest";
import type { Card } from "./cards";
import { handSortGroupKey, sortHand } from "./hand-sort";

let nextId = 0;
function card(rank: Card["rank"], suit: Card["suit"], deck: 0 | 1 = 0): Card {
  return { id: `sort-${nextId++}`, rank, suit, deck };
}

describe("hand sorting", () => {
  it("groups Guan Dan wilds, bombs, sets, then singles in smart mode", () => {
    const hand = [
      card("4", "clubs"),
      card("9", "clubs"),
      card("9", "diamonds"),
      card("9", "hearts"),
      card("9", "spades"),
      card("7", "clubs"),
      card("7", "hearts"),
      card("2", "hearts")
    ];
    const sorted = sortHand(hand, "smart", { game: "guandan", levelRank: "2" });
    expect(sorted[0].rank).toBe("2");
    expect(sorted.slice(1, 5).every((item) => item.rank === "9")).toBe(true);
    expect(sorted.slice(5, 7).every((item) => item.rank === "7")).toBe(true);
  });

  it("groups equal Guan Dan ranks regardless of suit", () => {
    const hand = [card("K", "clubs"), card("4", "spades"), card("K", "hearts")];
    const sorted = sortHand(hand, "rank", { game: "guandan", levelRank: "2" });
    expect(sorted.slice(0, 2).map((item) => item.rank)).toEqual(["K", "K"]);
  });

  it("keeps classic suits together in suit mode", () => {
    const hand = [card("3", "clubs"), card("A", "spades"), card("4", "spades"), card("K", "hearts")];
    const sorted = sortHand(hand, "suit", { game: "guandan", levelRank: "2" });
    expect(sorted.map((item) => item.suit)).toEqual(["spades", "spades", "hearts", "clubs"]);
  });

  it("puts Sheng Ji trump first and keeps exact pairs adjacent", () => {
    const hand = [
      card("8", "clubs", 0),
      card("A", "diamonds"),
      card("8", "clubs", 1),
      card("6", "hearts"),
      card("BJ", "joker")
    ];
    const sorted = sortHand(hand, "smart", {
      game: "shengji",
      levelRank: "6",
      trumpSuit: "spades"
    });
    expect(sorted.slice(0, 2).map((item) => item.rank)).toEqual(["BJ", "6"]);
    const pairIndexes = sorted
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.rank === "8")
      .map(({ index }) => index);
    expect(pairIndexes[1] - pairIndexes[0]).toBe(1);
  });

  it("exposes stable visual group boundaries for smart layouts", () => {
    const hand = [
      card("2", "hearts"),
      card("9", "clubs"),
      card("9", "diamonds"),
      card("9", "hearts"),
      card("9", "spades"),
      card("7", "clubs"),
      card("7", "hearts"),
      card("4", "clubs")
    ];
    const context = { game: "guandan" as const, levelRank: "2" as const };
    const sorted = sortHand(hand, "smart", context);
    expect(sorted.map((item) => handSortGroupKey(item, sorted, "smart", context))).toEqual([
      "guan-0",
      "guan-2",
      "guan-2",
      "guan-2",
      "guan-2",
      "guan-4",
      "guan-4",
      "guan-5"
    ]);
  });
});
