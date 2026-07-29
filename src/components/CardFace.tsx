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
      <span className="card-center">{card.suit === "joker" ? rank : suitGlyph(card.suit)}</span>
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
