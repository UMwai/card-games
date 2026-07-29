import type {
  CSSProperties,
  MouseEventHandler,
  PointerEventHandler
} from "react";
import { suitGlyph, type Card } from "../../games/cards";

interface Props {
  card: Card;
  selected?: boolean;
  compact?: boolean;
  faceDown?: boolean;
  wild?: boolean;
  index?: number;
  total?: number;
  mobileColumns?: number;
  handGroupOffset?: number;
  mobileGroupOffset?: number;
  mobileRowGroupGaps?: number;
  groupStart?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  onPointerDown?: PointerEventHandler<HTMLButtonElement>;
}

function JokerArtwork() {
  return (
    <span className="joker-artwork" aria-hidden="true">
      <svg viewBox="0 0 72 94" focusable="false">
        <path
          className="joker-halo"
          d="M36 4 43 14l12-2-2 12 11 7-9 8 4 12-12 1-5 11-10-7-10 7-5-11-12-1 4-12-9-8 11-7-2-12 12 2Z"
        />
        <path
          className="joker-hat"
          d="M17 38c1-14 6-23 15-28 1 8 3 14 6 19 3-10 8-16 16-19 2 12 1 22-4 31l-12 6-15-4Z"
        />
        <circle className="joker-accent" cx="17" cy="38" r="4" />
        <circle className="joker-accent" cx="32" cy="10" r="4" />
        <circle className="joker-accent" cx="54" cy="10" r="4" />
        <path
          className="joker-face"
          d="M23 38c6-5 18-6 27 1l-3 24c-3 9-17 13-23 1Z"
        />
        <path className="joker-detail" d="m27 47 6-2m8 1 5 2M29 58c4 5 10 6 15 1" />
        <path className="joker-collar" d="m24 64 12 8 11-9 10 12-21 14-22-13Z" />
        <circle className="joker-accent" cx="14" cy="76" r="4" />
        <circle className="joker-accent" cx="57" cy="75" r="4" />
      </svg>
      <span>JOKER</span>
    </span>
  );
}

export function CardFace({
  card,
  selected = false,
  compact = false,
  faceDown = false,
  wild = false,
  index = 0,
  total = 1,
  mobileColumns = 9,
  handGroupOffset = 0,
  mobileGroupOffset = 0,
  mobileRowGroupGaps = 0,
  groupStart = false,
  onClick,
  onPointerDown
}: Props) {
  const red = card.suit === "hearts" || card.suit === "diamonds" || card.rank === "RJ";
  const rank = card.rank === "BJ" ? "小王" : card.rank === "RJ" ? "大王" : card.rank;
  const spread = Math.min(38, Math.max(22, 900 / Math.max(total - 1, 1)));
  const handOffset = index * spread + handGroupOffset;
  const rotation = total > 1 ? (index - (total - 1) / 2) * Math.min(0.4, 8 / total) : 0;
  const rowColumns = Math.min(mobileColumns, Math.max(total, 1));
  const mobileRow = Math.floor(index / rowColumns);
  const mobileColumn = index % rowColumns;
  const mobileRowTotal = Math.min(rowColumns, total - mobileRow * rowColumns);
  const centeredColumn = mobileColumn + (rowColumns - mobileRowTotal) / 2;
  const mobileProgress = rowColumns > 1 ? centeredColumn / (rowColumns - 1) : 0.5;
  const mobileGapAdjustment =
    mobileGroupOffset * 0.5 - mobileProgress * mobileRowGroupGaps * 0.5;
  const style = {
    "--hand-x": `${handOffset}px`,
    "--card-rotate": `${rotation}deg`,
    "--card-z": index,
    "--mobile-left": `${mobileProgress * 100}%`,
    "--mobile-shift": `${mobileProgress * -54 + mobileGapAdjustment}px`,
    "--mobile-y": `${mobileRow * 47}px`
  } as CSSProperties;
  const spokenRank =
    card.rank === "BJ" ? "black joker" : card.rank === "RJ" ? "red joker" : card.rank;
  const spokenCard =
    card.suit === "joker" ? spokenRank : `${spokenRank} of ${card.suit}`;

  if (faceDown) {
    return (
      <div className={`playing-card card-back ${compact ? "compact" : ""}`} style={style} aria-hidden="true">
        <span>囍</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`playing-card ${red ? "red-card" : "black-card"} ${
        selected ? "selected" : ""
      } ${compact ? "compact" : ""} ${wild ? "wild-card" : ""} ${
        groupStart ? "sort-group-start" : ""
      }`}
      style={style}
      onClick={onClick}
      onPointerDown={onPointerDown}
      data-hand-card-id={compact ? undefined : card.id}
      aria-pressed={selected}
      aria-label={`${spokenCard}${wild ? ", marked heart-level wild card" : ""}${
        selected ? ", selected" : ""
      }`}
      aria-posinset={compact ? undefined : index + 1}
      aria-setsize={compact ? undefined : total}
      aria-hidden={compact || undefined}
      tabIndex={compact ? -1 : undefined}
    >
      <span className="card-corner">
        <b>{rank}</b>
        <i>{suitGlyph(card.suit)}</i>
      </span>
      {card.suit === "joker" ? (
        <JokerArtwork />
      ) : (
        <span className="card-center">{suitGlyph(card.suit)}</span>
      )}
      <span className="card-watermark">囍</span>
      <span className="selection-check" aria-hidden="true">
        ✓
      </span>
      {wild && (
        <span className="wild-badge">
          逢人配 <small>WILD</small>
        </span>
      )}
    </button>
  );
}
