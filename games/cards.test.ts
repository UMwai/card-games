import { describe, expect, it } from "vitest";
import { createDoubleDeck, shuffle } from "./cards";

describe("shared card deck", () => {
  it("creates two complete, uniquely identified decks", () => {
    const cards = createDoubleDeck();
    expect(cards).toHaveLength(108);
    expect(new Set(cards.map((card) => card.id))).toHaveLength(108);
    expect(cards.filter((card) => card.suit === "joker")).toHaveLength(4);
  });

  it("does not mutate the source while shuffling", () => {
    const cards = createDoubleDeck();
    const original = cards.map((card) => card.id);
    const shuffled = shuffle(cards, () => 0.37);
    expect(cards.map((card) => card.id)).toEqual(original);
    expect(shuffled).not.toBe(cards);
  });
});
