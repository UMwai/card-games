import { describe, expect, it } from "vitest";
import { ZODIAC_AVATARS, avatarForSeat, isAvatarId } from "./avatars";

describe("zodiac avatars", () => {
  it("provides all 12 unique Chinese zodiac choices in order", () => {
    expect(ZODIAC_AVATARS).toHaveLength(12);
    expect(new Set(ZODIAC_AVATARS.map((avatar) => avatar.id))).toHaveLength(12);
    expect(ZODIAC_AVATARS.map((avatar) => avatar.id)).toEqual([
      "rat",
      "ox",
      "tiger",
      "rabbit",
      "dragon",
      "snake",
      "horse",
      "goat",
      "monkey",
      "rooster",
      "dog",
      "pig"
    ]);
  });

  it("validates IDs and provides a wrapping seat fallback", () => {
    expect(isAvatarId("dragon")).toBe(true);
    expect(isAvatarId("cat")).toBe(false);
    expect(avatarForSeat(11)).toBe("pig");
    expect(avatarForSeat(12)).toBe("rat");
  });
});
