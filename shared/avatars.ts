export const ZODIAC_AVATARS = [
  { id: "rat", label: "Rat", han: "鼠" },
  { id: "ox", label: "Ox", han: "牛" },
  { id: "tiger", label: "Tiger", han: "虎" },
  { id: "rabbit", label: "Rabbit", han: "兔" },
  { id: "dragon", label: "Dragon", han: "龙" },
  { id: "snake", label: "Snake", han: "蛇" },
  { id: "horse", label: "Horse", han: "马" },
  { id: "goat", label: "Goat", han: "羊" },
  { id: "monkey", label: "Monkey", han: "猴" },
  { id: "rooster", label: "Rooster", han: "鸡" },
  { id: "dog", label: "Dog", han: "狗" },
  { id: "pig", label: "Pig", han: "猪" }
] as const;

export type AvatarId = (typeof ZODIAC_AVATARS)[number]["id"];

const AVATAR_IDS = new Set<string>(ZODIAC_AVATARS.map((avatar) => avatar.id));

export function isAvatarId(value: unknown): value is AvatarId {
  return typeof value === "string" && AVATAR_IDS.has(value);
}

export function avatarForSeat(seat: number): AvatarId {
  const index = ((seat % ZODIAC_AVATARS.length) + ZODIAC_AVATARS.length) % ZODIAC_AVATARS.length;
  return ZODIAC_AVATARS[index].id;
}
