import { ZODIAC_AVATARS, type AvatarId } from "../../shared/avatars";
import { AnimalAvatar } from "./AnimalAvatar";

export function ZodiacPicker({
  value,
  onChange,
  label = "Choose your zodiac avatar"
}: {
  value: AvatarId;
  onChange: (avatar: AvatarId) => void;
  label?: string;
}) {
  return (
    <div className="zodiac-picker" role="group" aria-label={label}>
      {ZODIAC_AVATARS.map((avatar) => (
        <button
          type="button"
          className={`zodiac-option ${value === avatar.id ? "selected" : ""}`}
          key={avatar.id}
          onClick={() => onChange(avatar.id)}
          aria-pressed={value === avatar.id}
          aria-label={`${avatar.label} zodiac avatar`}
          title={`${avatar.label} · ${avatar.han}`}
        >
          <AnimalAvatar animal={avatar.id} size="seat" />
          <span>{avatar.label}</span>
          <small>{avatar.han}</small>
        </button>
      ))}
    </div>
  );
}
