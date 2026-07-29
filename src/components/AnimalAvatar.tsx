import type { AvatarId } from "../../shared/avatars";
import zodiacOne from "../assets/zodiac-01-rat-rabbit.jpg";
import zodiacTwo from "../assets/zodiac-02-dragon-goat.jpg";
import zodiacThree from "../assets/zodiac-03-monkey-pig.jpg";

const AVATAR_SPRITES: Record<AvatarId, { sheet: string; quadrant: 0 | 1 | 2 | 3 }> = {
  rat: { sheet: zodiacOne, quadrant: 0 },
  ox: { sheet: zodiacOne, quadrant: 1 },
  tiger: { sheet: zodiacOne, quadrant: 2 },
  rabbit: { sheet: zodiacOne, quadrant: 3 },
  dragon: { sheet: zodiacTwo, quadrant: 0 },
  snake: { sheet: zodiacTwo, quadrant: 1 },
  horse: { sheet: zodiacTwo, quadrant: 2 },
  goat: { sheet: zodiacTwo, quadrant: 3 },
  monkey: { sheet: zodiacThree, quadrant: 0 },
  rooster: { sheet: zodiacThree, quadrant: 1 },
  dog: { sheet: zodiacThree, quadrant: 2 },
  pig: { sheet: zodiacThree, quadrant: 3 }
};

export function AnimalAvatar({
  animal,
  size = "seat",
  className = ""
}: {
  animal: AvatarId;
  size?: "tiny" | "seat" | "cameo" | "hero";
  className?: string;
}) {
  const sprite = AVATAR_SPRITES[animal] ?? AVATAR_SPRITES.rat;
  return (
    <span
      className={`animal-avatar animal-${animal} animal-q${sprite.quadrant} animal-${size} ${className}`}
      aria-hidden="true"
    >
      <img src={sprite.sheet} alt="" />
    </span>
  );
}
