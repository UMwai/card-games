import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent
} from "react";
import { recommendBestPlay } from "../../games/best-play";
import { suitGlyph } from "../../games/cards";
import {
  handSortGroupKey,
  sortHand,
  type HandSortMode
} from "../../games/hand-sort";
import { avatarForSeat } from "../../shared/avatars";
import type {
  ActionResult,
  ClientAction,
  PlayRecommendation,
  PlayedCards,
  Player,
  PublicGameState,
  RoomView,
  Seat
} from "../../shared/types";
import { CardFace } from "./CardFace";
import { AnimalAvatar } from "./AnimalAvatar";

interface Props {
  room: RoomView;
  onAction: (action: ClientAction) => Promise<ActionResult>;
  onInvite: () => void;
  onRules: () => void;
}

type TablePosition = "bottom" | "left" | "top" | "right";
type DragMode = "select" | "deselect";

interface HandCardLayout {
  groupStart: boolean;
  handGroupOffset: number;
  mobileGroupOffset: number;
  mobileRowGroupGaps: number;
}

function relativePosition(seat: Seat, yours: Seat): TablePosition {
  const relative = (seat - yours + 4) % 4;
  return (["bottom", "left", "top", "right"] as const)[relative];
}

function gamePlays(game: PublicGameState): PlayedCards[] {
  if (game.kind === "guandan") return game.currentPlay ? [game.currentPlay] : [];
  return game.trick;
}

function SeatBadge({
  player,
  position,
  active,
  dealer,
  finishPlace
}: {
  player: Player;
  position: TablePosition;
  active: boolean;
  dealer: boolean;
  finishPlace?: number;
}) {
  return (
    <div className={`seat-badge seat-${position} ${active ? "active-seat" : ""}`}>
      <div className="seat-avatar">
        <AnimalAvatar animal={player.avatar ?? avatarForSeat(player.seat)} size="seat" />
        <span className={`connection-dot ${player.connected ? "" : "offline"}`} />
      </div>
      <div className="seat-copy">
        <strong>{player.name}</strong>
        <small>
          Team {player.team + 1} · {player.cardsLeft} cards
        </small>
      </div>
      {player.isBot && <span className="seat-token">AI</span>}
      {dealer && <span className="seat-token dealer-token">庄</span>}
      {finishPlace && <span className="finish-medal">#{finishPlace}</span>}
    </div>
  );
}

function CenterPlay({
  play,
  position,
  wildRank
}: {
  play: PlayedCards;
  position: TablePosition;
  wildRank?: string;
}) {
  return (
    <div className={`center-play center-play-arrive play-${position}`}>
      <div className="mini-card-row">
        {play.cards.map((card, index) => (
          <CardFace
            key={card.id}
            card={card}
            compact
            wild={card.suit === "hearts" && card.rank === wildRank}
            index={index}
            total={play.cards.length}
          />
        ))}
      </div>
      {play.label && <span>{play.label}</span>}
    </div>
  );
}

function ScoreRibbon({ room }: { room: RoomView }) {
  const game = room.gameState;
  if (!game) return null;
  if (game.kind === "guandan") {
    return (
      <div className="score-ribbon">
        <span>Round {game.roundNumber}</span>
        <b>
          {game.teamLevels[0]} <i>—</i> {game.teamLevels[1]}
        </b>
        <span>Level {game.levelRank}</span>
      </div>
    );
  }
  return (
    <div className="score-ribbon">
      <span>Trick {game.trickNumber}</span>
      <b>
        {game.defenderPoints} <i>pts</i>
      </b>
      <span>
        {suitGlyph(game.trumpSuit)} · Level {game.levelRank}
      </span>
    </div>
  );
}

export function GameTable({ room, onAction, onInvite, onRules }: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [recommendation, setRecommendation] = useState<PlayRecommendation | null>(null);
  const [sortOpen, setSortOpen] = useState(false);
  const [dragSelecting, setDragSelecting] = useState(false);
  const [displayedPlays, setDisplayedPlays] = useState<PlayedCards[]>(() =>
    gamePlays(room.gameState!)
  );
  const [clearingTrick, setClearingTrick] = useState(false);
  const [portraitColumns, setPortraitColumns] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 369px) and (orientation: portrait)").matches
      ? 8
      : 9
  );
  const dragState = useRef<{
    active: boolean;
    pointerId: number;
    mode: DragMode;
    visited: Set<string>;
  }>({ active: false, pointerId: -1, mode: "select", visited: new Set() });
  const ignoredClickCard = useRef<string | null>(null);
  const [sortMode, setSortMode] = useState<HandSortMode>(() => {
    const saved = localStorage.getItem(`double-happiness:hand-sort:${room.game}`);
    return saved === "rank" || saved === "suit" ? saved : "smart";
  });
  const game = room.gameState!;
  const yourTurn = game.turn === room.yourSeat;
  const ownPlayer = room.players[room.yourSeat]!;

  useEffect(() => {
    const available = new Set(room.hand.map((card) => card.id));
    setSelectedIds((selected) => selected.filter((id) => available.has(id)));
    setRecommendation((current) =>
      current && current.cardIds.every((id) => available.has(id)) ? current : null
    );
  }, [room.hand]);

  useEffect(() => {
    const saved = localStorage.getItem(`double-happiness:hand-sort:${room.game}`);
    setSortMode(saved === "rank" || saved === "suit" ? saved : "smart");
  }, [room.game]);

  useEffect(() => {
    setRecommendation(null);
  }, [game.turn, game.lastAction]);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 369px) and (orientation: portrait)");
    const updateColumns = () => setPortraitColumns(query.matches ? 8 : 9);
    updateColumns();
    query.addEventListener("change", updateColumns);
    return () => query.removeEventListener("change", updateColumns);
  }, []);

  const sortContext = useMemo(
    () => ({
      game: room.game,
      levelRank: game.levelRank,
      trumpSuit: game.kind === "shengji" ? game.trumpSuit : undefined
    }),
    [room.game, game]
  );

  const sortedHand = useMemo(
    () => sortHand(room.hand, sortMode, sortContext),
    [room.hand, sortMode, sortContext]
  );

  const handLayout = useMemo<HandCardLayout[]>(() => {
    const keys = sortedHand.map((card) =>
      sortMode === "smart"
        ? handSortGroupKey(card, sortedHand, sortMode, sortContext)
        : "continuous"
    );
    let globalGaps = 0;
    const layout = sortedHand.map((_, index) => {
      const groupStart = index > 0 && keys[index] !== keys[index - 1];
      if (groupStart) globalGaps += 1;
      return {
        groupStart,
        handGroupOffset: globalGaps * 4,
        mobileGroupOffset: 0,
        mobileRowGroupGaps: 0
      };
    });
    for (let rowStart = 0; rowStart < sortedHand.length; rowStart += portraitColumns) {
      const rowEnd = Math.min(sortedHand.length, rowStart + portraitColumns);
      let rowGaps = 0;
      for (let index = rowStart + 1; index < rowEnd; index += 1) {
        if (keys[index] !== keys[index - 1]) rowGaps += 1;
      }
      let gapsBefore = 0;
      for (let index = rowStart; index < rowEnd; index += 1) {
        if (index > rowStart && keys[index] !== keys[index - 1]) gapsBefore += 1;
        layout[index].mobileGroupOffset = gapsBefore;
        layout[index].mobileRowGroupGaps = rowGaps;
      }
    }
    return layout;
  }, [portraitColumns, sortContext, sortMode, sortedHand]);

  const handRailWidth = useMemo(() => {
    if (!sortedHand.length) return 230;
    const spread = Math.min(38, Math.max(22, 900 / Math.max(sortedHand.length - 1, 1)));
    return Math.max(
      230,
      Math.ceil(
        (sortedHand.length - 1) * spread +
          handLayout.at(-1)!.handGroupOffset +
          86
      )
    );
  }, [handLayout, sortedHand.length]);

  const applyDragSelection = useCallback((cardId: string, mode: DragMode) => {
    const drag = dragState.current;
    if (drag.visited.has(cardId)) return;
    drag.visited.add(cardId);
    setRecommendation(null);
    setSelectedIds((selected) => {
      const alreadySelected = selected.includes(cardId);
      if (mode === "select" && !alreadySelected) return [...selected, cardId];
      if (mode === "deselect" && alreadySelected) {
        return selected.filter((id) => id !== cardId);
      }
      return selected;
    });
    if ("vibrate" in navigator) navigator.vibrate(8);
  }, []);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const drag = dragState.current;
      if (!drag.active || drag.pointerId !== event.pointerId) return;
      const target = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>("[data-hand-card-id]");
      const cardId = target?.dataset.handCardId;
      if (cardId) applyDragSelection(cardId, drag.mode);
      if (event.cancelable) event.preventDefault();
    };
    const finish = (event: PointerEvent) => {
      if (dragState.current.pointerId !== event.pointerId) return;
      dragState.current.active = false;
      setDragSelecting(false);
    };
    document.addEventListener("pointermove", move, { passive: false });
    document.addEventListener("pointerup", finish);
    document.addEventListener("pointercancel", finish);
    return () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", finish);
      document.removeEventListener("pointercancel", finish);
    };
  }, [applyDragSelection]);


  const changeSort = (mode: HandSortMode) => {
    setSortMode(mode);
    setSortOpen(false);
    localStorage.setItem(`double-happiness:hand-sort:${room.game}`, mode);
  };

  const tablePlays = useMemo(() => {
    if (game.kind === "guandan") return game.currentPlay ? [game.currentPlay] : [];
    return game.trick;
  }, [game]);

  useEffect(() => {
    if (tablePlays.length === 0 && displayedPlays.length > 0) {
      setClearingTrick(true);
      const timer = window.setTimeout(() => {
        setDisplayedPlays([]);
        setClearingTrick(false);
      }, 150);
      return () => window.clearTimeout(timer);
    }
    setDisplayedPlays(tablePlays);
    setClearingTrick(false);
  }, [tablePlays]);

  const act = async (action: ClientAction) => {
    const result = await onAction(action);
    if (result.ok) {
      setSelectedIds([]);
      setRecommendation(null);
    }
  };

  const askForHint = () => {
    const next = recommendBestPlay({
      hand: room.hand,
      state: game,
      seat: room.yourSeat,
      players: room.players
    });
    setRecommendation(next);
    setSelectedIds(next?.cardIds ?? []);
    setSortOpen(false);
  };

  const toggleCard = (cardId: string) => {
    setRecommendation(null);
    setSelectedIds((selected) =>
      selected.includes(cardId)
        ? selected.filter((id) => id !== cardId)
        : [...selected, cardId]
    );
  };

  const startCardDrag = (event: ReactPointerEvent<HTMLButtonElement>, cardId: string) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const landscapeTouch =
      event.pointerType !== "mouse" &&
      window.matchMedia("(orientation: landscape) and (max-height: 600px)").matches;
    if (landscapeTouch) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    const mode: DragMode = selectedIds.includes(cardId) ? "deselect" : "select";
    dragState.current = {
      active: true,
      pointerId: event.pointerId,
      mode,
      visited: new Set()
    };
    setDragSelecting(true);
    ignoredClickCard.current = cardId;
    applyDragSelection(cardId, mode);
  };

  const clickCard = (event: MouseEvent<HTMLButtonElement>, cardId: string) => {
    if (event.detail > 0 && ignoredClickCard.current === cardId) {
      ignoredClickCard.current = null;
      return;
    }
    toggleCard(cardId);
  };

  const clearSelection = () => {
    setSelectedIds([]);
    setRecommendation(null);
  };

  const playLabel =
    game.kind === "shengji" && game.phase === "burying"
      ? `Bury ${selectedIds.length}/8`
      : `Play ${selectedIds.length || ""}`.trim();
  const canPlay =
    yourTurn &&
    selectedIds.length > 0 &&
    (game.kind !== "shengji" || game.phase !== "burying" || selectedIds.length === 8);
  const roundOver = game.phase === "roundOver";
  const matchOver = game.kind === "guandan" && game.phase === "matchOver";
  const portraitRows = Math.max(1, Math.ceil(sortedHand.length / portraitColumns));
  const portraitZoneHeight = Math.max(226, 186 + (portraitRows - 1) * 47);
  const sortHint = (mode: HandSortMode) =>
    mode === "smart"
      ? game.kind === "guandan"
        ? "Wilds, bombs, sets, then singles"
        : "Trump, tractors, pairs, then singles"
      : mode === "rank"
        ? "Group matching ranks"
        : "Group classic suits";

  return (
    <main className={`game-shell ${room.game}`}>
      <header className="table-header">
        <a className="mini-brand" href="/" aria-label="Back to home">
          <span>囍</span>
          <div>
            <b>Double Happiness</b>
            <small>{room.game === "shengji" ? "Sheng Ji · 升级" : "Guan Dan · 掼蛋"}</small>
          </div>
        </a>
        <div className="room-chip">
          <small>Room</small>
          <b>{room.code}</b>
        </div>
        <nav>
          <button className="quiet-button" onClick={onRules}>
            Rules
          </button>
          <button className="gold-button compact-button" onClick={onInvite}>
            Invite friends
          </button>
        </nav>
      </header>

      <section
        className="table-stage"
        style={{ "--portrait-zone-height": `${portraitZoneHeight}px` } as CSSProperties}
      >
        <div className="felt-halo" />
        <ScoreRibbon room={room} />

        {room.players.map((player) =>
          player ? (
            <SeatBadge
              key={player.id}
              player={player}
              position={relativePosition(player.seat, room.yourSeat)}
              active={game.turn === player.seat}
              dealer={game.kind === "shengji" && game.dealer === player.seat}
              finishPlace={
                game.kind === "guandan" && game.finishOrder.includes(player.seat)
                  ? game.finishOrder.indexOf(player.seat) + 1
                  : undefined
              }
            />
          ) : null
        )}

        <div className={`center-table ${clearingTrick ? "clearing-trick" : ""}`}>
          <div className="center-mark">囍</div>
          {displayedPlays.map((play) => (
            <CenterPlay
              key={`${play.seat}-${play.cards.map((card) => card.id).join("-")}`}
              play={play}
              position={relativePosition(play.seat, room.yourSeat)}
              wildRank={game.kind === "guandan" ? game.levelRank : undefined}
            />
          ))}
          {displayedPlays.length === 0 && (
            <div className="empty-trick">
              <AnimalAvatar
                animal={room.players[game.turn]?.avatar ?? avatarForSeat(game.turn)}
                size="tiny"
              />
              <span>{yourTurn ? "Your lead" : `${room.players[game.turn]?.name ?? "Player"} is thinking`}</span>
              <i />
            </div>
          )}
        </div>

        <div className="action-callout" aria-live="polite">
          <span className={yourTurn ? "turn-flame" : ""} />
          {game.lastAction}
        </div>

        {recommendation && (
          <div
            className={`hint-callout hint-${recommendation.action}`}
            aria-live="polite"
            data-confidence={recommendation.confidence}
          >
            <span className="hint-spark" aria-hidden="true">
              ✦
            </span>
            <div>
              <b>{recommendation.label}</b>
              <small>{recommendation.reason}</small>
            </div>
            <button
              type="button"
              aria-label="Dismiss play hint"
              onClick={() => setRecommendation(null)}
            >
              ×
            </button>
          </div>
        )}

        {(roundOver || matchOver) && (
          <div className="round-curtain">
            <p className="eyebrow">{matchOver ? "Match complete" : "Round complete"}</p>
            <h2>Team {(game.winnerTeam ?? 0) + 1} takes it</h2>
            <p>{game.lastAction}</p>
            {!matchOver && (
              <button className="gold-button" onClick={() => act({ type: "nextRound" })}>
                Deal next round
              </button>
            )}
            {matchOver && (
              <a className="gold-button link-button" href="/">
                Return to the lobby
              </a>
            )}
          </div>
        )}

        <div className="hand-zone">
          <div className="hand-label">
            <span>
              {yourTurn ? "Your turn" : `Waiting for ${room.players[game.turn]?.name ?? "player"}`}
            </span>
            <b>
              <AnimalAvatar animal={ownPlayer.avatar ?? avatarForSeat(ownPlayer.seat)} size="tiny" />
              {ownPlayer.name} · Team {ownPlayer.team + 1} · {room.hand.length} cards
            </b>
            <small className="hand-gesture-note">Tap or drag across cards to select</small>
          </div>
          <div className="sort-tray" aria-label="Sort hand">
            <span>Sort</span>
            {(["smart", "rank", "suit"] as HandSortMode[]).map((mode) => (
              <button
                type="button"
                key={mode}
                className={sortMode === mode ? "active" : ""}
                onClick={() => changeSort(mode)}
                aria-pressed={sortMode === mode}
              >
                {mode}
              </button>
            ))}
          </div>
          <div className={`mobile-sort-control ${sortOpen ? "open" : ""}`}>
            <button
              type="button"
              className="mobile-sort-toggle"
              aria-expanded={sortOpen}
              aria-controls="mobile-sort-menu"
              onClick={() => setSortOpen((open) => !open)}
            >
              <span>Sort</span>
              <b>{sortMode}</b>
              <i aria-hidden="true">{sortOpen ? "×" : "↕"}</i>
            </button>
            {sortOpen && (
              <div className="mobile-sort-menu" id="mobile-sort-menu" role="menu">
                {(["smart", "rank", "suit"] as HandSortMode[]).map((mode) => (
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={sortMode === mode}
                    className={sortMode === mode ? "active" : ""}
                    key={mode}
                    onClick={() => changeSort(mode)}
                  >
                    <b>{mode}</b>
                    <small>{sortHint(mode)}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div
            className="hand-scroll"
            role="group"
            aria-label={`Your ${room.hand.length}-card hand. Tap or drag across cards to select combinations.`}
          >
            <div
              className={`player-hand ${dragSelecting ? "drag-selecting" : ""}`}
              style={{ width: `${handRailWidth}px` }}
            >
              {sortedHand.map((card, index) => (
                <CardFace
                  key={card.id}
                  card={card}
                  selected={selectedIds.includes(card.id)}
                  wild={game.kind === "guandan" && card.suit === "hearts" && card.rank === game.levelRank}
                  index={index}
                  total={sortedHand.length}
                  mobileColumns={portraitColumns}
                  groupStart={handLayout[index].groupStart}
                  handGroupOffset={handLayout[index].handGroupOffset}
                  mobileGroupOffset={handLayout[index].mobileGroupOffset}
                  mobileRowGroupGaps={handLayout[index].mobileRowGroupGaps}
                  onPointerDown={(event) => startCardDrag(event, card.id)}
                  onClick={(event) => clickCard(event, card.id)}
                />
              ))}
            </div>
          </div>
          <div className="sr-only selection-status" aria-live="polite" aria-atomic="true">
            {selectedIds.length
              ? `${selectedIds.length} card${selectedIds.length === 1 ? "" : "s"} selected.`
              : "No cards selected."}
          </div>
          <div className="game-actions">
            <button
              className="quiet-button hint-button"
              disabled={!yourTurn || roundOver || matchOver}
              onClick={askForHint}
              aria-label="Suggest best play"
            >
              <span aria-hidden="true">✦</span> Hint
            </button>
            <button
              className="quiet-button clear-button"
              disabled={!selectedIds.length}
              onClick={clearSelection}
              aria-label="Clear selected cards"
            >
              Clear
            </button>
            {game.kind === "guandan" && (
              <button
                className={`quiet-button pass-button ${
                  recommendation?.action === "pass" ? "hinted" : ""
                }`}
                disabled={!yourTurn || !game.currentPlay}
                onClick={() => act({ type: "pass" })}
                aria-label="Pass this play"
              >
                Pass
              </button>
            )}
            <button
              className="gold-button play-button"
              disabled={!canPlay || roundOver || matchOver}
              onClick={() =>
                act(
                  game.kind === "shengji" && game.phase === "burying"
                    ? { type: "bury", cardIds: selectedIds }
                    : { type: "play", cardIds: selectedIds }
                )
              }
            >
              {playLabel}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
