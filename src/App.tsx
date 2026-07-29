import { useEffect, useMemo, useState, type FormEvent } from "react";
import { QRCodeSVG } from "qrcode.react";
import { io } from "socket.io-client";
import { avatarForSeat, isAvatarId, type AvatarId } from "../shared/avatars";
import type {
  ActionResult,
  ClientAction,
  CreateRoomRequest,
  GameKind,
  RoomMode,
  RoomView
} from "../shared/types";
import { GameTable } from "./components/GameTable";
import { RulesSheet } from "./components/RulesSheet";
import { AnimalAvatar } from "./components/AnimalAvatar";
import { ZodiacPicker } from "./components/ZodiacPicker";

const socket = io({ autoConnect: false });

function roomCodeFromPath(): string | null {
  const match = window.location.pathname.match(/^\/room\/([A-Z0-9]{5})\/?$/i);
  return match?.[1]?.toUpperCase() ?? null;
}

function rememberIdentity(code: string, name: string, avatar: AvatarId, token: string) {
  localStorage.setItem("double-happiness:name", name);
  localStorage.setItem("double-happiness:avatar", avatar);
  localStorage.setItem(`double-happiness:token:${code}`, token);
}

function Brand() {
  return (
    <a className="brand" href="/">
      <span className="brand-seal">囍</span>
      <span>
        <b>Double Happiness</b>
        <small>双喜牌局</small>
      </span>
    </a>
  );
}

function Home({
  initialName,
  initialAvatar,
  onCreate,
  onJoin,
  busy
}: {
  initialName: string;
  initialAvatar: AvatarId;
  onCreate: (request: CreateRoomRequest) => void;
  onJoin: (code: string, name: string, avatar: AvatarId) => void;
  busy: boolean;
}) {
  const [name, setName] = useState(initialName);
  const [avatar, setAvatar] = useState<AvatarId>(initialAvatar);
  const [game, setGame] = useState<GameKind>("shengji");
  const [mode, setMode] = useState<RoomMode>("solo");
  const [joinCode, setJoinCode] = useState("");

  return (
    <main className="home-page">
      <header className="home-header">
        <Brand />
        <nav>
          <a href="#games">The games</a>
          <a href="#create">Open a table</a>
        </nav>
        <span className="local-first-pill">
          <i />
          Local-first
        </span>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">A card room for the people already in the room</p>
          <h1>
            Two classics.
            <br />
            <em>One table.</em>
          </h1>
          <p className="hero-deck">
            Play a full partnership game against three AI rivals—or turn your laptop into a private table
            friends can join with one scan.
          </p>
          <div className="hero-actions">
            <a className="gold-button link-button" href="#create">
              Open a table
            </a>
            <a className="text-link" href="#games">
              Meet the games <span>↓</span>
            </a>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="moon-disc" />
          <div className="hero-card hero-card-one">
            <small>升级</small>
            <b>♠</b>
            <span>A</span>
          </div>
          <div className="hero-card hero-card-two">
            <small>掼蛋</small>
            <b>♥</b>
            <span>级</span>
          </div>
          <div className="hero-card hero-card-three">
            <small>王牌</small>
            <b>囍</b>
            <span>★</span>
          </div>
          <AnimalAvatar animal="dragon" size="cameo" className="hero-animal hero-animal-one" />
          <AnimalAvatar animal="rabbit" size="cameo" className="hero-animal hero-animal-two" />
          <div className="orbit-copy">PARTNERS · TWO DECKS · FOUR SEATS ·</div>
        </div>
      </section>

      <section className="game-intro" id="games">
        <div className="section-heading">
          <p className="eyebrow">Choose your rhythm</p>
          <h2>Tricks or climbs?</h2>
          <p>Both games seat four in fixed partnerships. What happens after the deal is entirely different.</p>
        </div>
        <div className="game-editorial-grid">
          <article className="game-story shengji-story">
            <div className="story-number">01</div>
            <div className="story-suit">♠</div>
            <AnimalAvatar animal="horse" size="cameo" className="story-animal" />
            <div className="story-copy">
              <p>TRICK-TAKING · TRACTOR</p>
              <h3>Sheng Ji <span>升级</span></h3>
              <p>
                Read the trump, build tractors, protect the bottom. Every captured five, ten, and King pulls
                the score toward a change of power.
              </p>
              <ul>
                <li>108 cards · four jokers · 8-card kitty</li>
                <li>Level progression from 2 through Ace</li>
                <li>Singles, pairs, tractors, and ruffs</li>
              </ul>
            </div>
          </article>
          <article className="game-story guandan-story">
            <div className="story-number">02</div>
            <div className="story-suit">♥</div>
            <AnimalAvatar animal="tiger" size="cameo" className="story-animal" />
            <div className="story-copy">
              <p>CLIMBING · SHEDDING</p>
              <h3>Guan Dan <span>掼蛋</span></h3>
              <p>
                Shape a 27-card hand into runs, full houses, and bombs. Empty your hand early, then use every
                pass to help your partner finish.
              </p>
              <ul>
                <li>Heart-level wild cards</li>
                <li>Bombs, straight flushes, and four jokers</li>
                <li>Team placement and automatic tribute</li>
              </ul>
            </div>
          </article>
        </div>
      </section>

      <section className="create-section" id="create">
        <div className="create-heading">
          <p className="eyebrow">Your table, your pace</p>
          <h2>Deal in under a minute.</h2>
          <p>No accounts. No public lobby. Nothing leaves your local game server.</p>
        </div>
        <div className="create-console">
          <div className="console-step">
            <span>01</span>
            <label htmlFor="player-name">What should we call you?</label>
            <input
              id="player-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
              maxLength={18}
            />
          </div>
          <div className="console-step">
            <span>02</span>
            <label>Choose a game</label>
            <div className="segmented game-segment">
              <button className={game === "shengji" ? "selected" : ""} onClick={() => setGame("shengji")}>
                <i>♠</i>
                Sheng Ji
                <small>升级</small>
              </button>
              <button className={game === "guandan" ? "selected" : ""} onClick={() => setGame("guandan")}>
                <i>♥</i>
                Guan Dan
                <small>掼蛋</small>
              </button>
            </div>
          </div>
          <div className="console-step">
            <span>03</span>
            <label>Who’s playing?</label>
            <div className="segmented mode-segment">
              <button className={mode === "solo" ? "selected" : ""} onClick={() => setMode("solo")}>
                <b>One + three AI</b>
                <small>Start instantly</small>
              </button>
              <button className={mode === "friends" ? "selected" : ""} onClick={() => setMode("friends")}>
                <b>Nearby friends</b>
                <small>Share a QR code</small>
              </button>
            </div>
          </div>
          <div className="console-step zodiac-step">
            <span>04</span>
            <div className="zodiac-step-copy">
              <label>Choose your zodiac</label>
              <small>Your avatar follows you into every room.</small>
            </div>
            <ZodiacPicker value={avatar} onChange={setAvatar} />
          </div>
          <button
            className="launch-button"
            disabled={busy || !name.trim()}
            onClick={() => onCreate({ game, mode, playerName: name.trim(), avatar })}
          >
            <span>{busy ? "Shuffling…" : "Open the table"}</span>
            <i>→</i>
          </button>
        </div>

        <form
          className="join-strip"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim() && joinCode.trim()) onJoin(joinCode, name, avatar);
          }}
        >
          <div>
            <small>Already invited?</small>
            <b>Enter a room code</b>
          </div>
          <input
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))}
            placeholder="ABCDE"
            aria-label="Room code"
          />
          <button className="quiet-button" disabled={busy || joinCode.length !== 5 || !name.trim()}>
            Join table
          </button>
        </form>
      </section>

      <footer>
        <Brand />
        <p>Built for long tables, loud cousins, and one more round.</p>
        <span>Local room edition · House rules v1</span>
      </footer>
    </main>
  );
}

function JoinGate({
  code,
  initialName,
  initialAvatar,
  onJoin,
  busy
}: {
  code: string;
  initialName: string;
  initialAvatar: AvatarId;
  onJoin: (code: string, name: string, avatar: AvatarId) => void;
  busy: boolean;
}) {
  const [name, setName] = useState(initialName);
  const [avatar, setAvatar] = useState<AvatarId>(initialAvatar);
  return (
    <main className="join-page">
      <div className="join-paper">
        <Brand />
        <div className="invitation-seal">囍</div>
        <AnimalAvatar animal={avatar} size="cameo" className="join-animal" />
        <p className="eyebrow">You have a seat waiting</p>
        <h1>Join room {code}</h1>
        <p>Enter your table name. You’ll be seated opposite your partner.</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) onJoin(code, name, avatar);
          }}
        >
          <label htmlFor="join-name">Your name</label>
          <input
            id="join-name"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="How friends know you"
            maxLength={18}
          />
          <div className="join-zodiac">
            <label>Choose your zodiac</label>
            <ZodiacPicker value={avatar} onChange={setAvatar} />
          </div>
          <button className="gold-button" disabled={busy || !name.trim()}>
            {busy ? "Finding your seat…" : "Take my seat"}
          </button>
        </form>
        <a href="/" className="text-link">
          I need a different table
        </a>
      </div>
    </main>
  );
}

function RoomLobby({
  room,
  onFillBots,
  onStart,
  onInvite
}: {
  room: RoomView;
  onFillBots: () => void;
  onStart: () => void;
  onInvite: () => void;
}) {
  const isHost = room.yourSeat === room.hostSeat;
  const full = room.players.every(Boolean);
  return (
    <main className="waiting-page">
      <header className="home-header waiting-header">
        <Brand />
        <div className="room-chip">
          <small>Private room</small>
          <b>{room.code}</b>
        </div>
      </header>
      <section className="waiting-layout">
        <div className="waiting-copy">
          <p className="eyebrow">{room.game === "shengji" ? "Sheng Ji · 升级" : "Guan Dan · 掼蛋"}</p>
          <h1>Gather around.</h1>
          <p>
            Friends on the same Wi-Fi can scan the code or open the room link. Partners sit across from one
            another.
          </p>
          <div className="lobby-seats">
            {room.players.map((player, seat) => (
              <div className={`lobby-seat ${player ? "occupied" : ""}`} key={seat}>
                <span className="lobby-avatar">
                  {player ? (
                    <AnimalAvatar animal={player.avatar ?? avatarForSeat(seat)} size="seat" />
                  ) : (
                    <b>♧</b>
                  )}
                </span>
                <div>
                  <b>{player?.name ?? "Open seat"}</b>
                  <small>Team {(seat % 2) + 1} {player?.isBot ? "· AI" : ""}</small>
                </div>
                {player?.connected === false && <i>Reconnecting</i>}
              </div>
            ))}
          </div>
          <div className="lobby-actions">
            <button className="quiet-button" onClick={onInvite}>
              Show invite
            </button>
            {isHost && !full && (
              <button className="quiet-button" onClick={onFillBots}>
                Fill open seats with AI
              </button>
            )}
            {isHost && (
              <button className="gold-button" disabled={!full} onClick={onStart}>
                Deal the cards
              </button>
            )}
            {!isHost && <p className="host-note">Waiting for the host to deal…</p>}
          </div>
        </div>
        <button className="qr-poster" onClick={onInvite}>
          <AnimalAvatar animal="rabbit" size="tiny" className="qr-animal" />
          <QRCodeSVG value={room.joinUrl} size={210} bgColor="transparent" fgColor="#271b17" level="M" />
          <span>Scan to take a seat</span>
          <small>{room.joinUrl}</small>
        </button>
      </section>
    </main>
  );
}

function InviteModal({ room, onClose }: { room: RoomView; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(room.joinUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div className="modal-wash" onMouseDown={onClose}>
      <section className="invite-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <button className="icon-button close-button" onClick={onClose} aria-label="Close">
          ×
        </button>
        <div className="invite-qr">
          <QRCodeSVG value={room.joinUrl} size={235} bgColor="#f7efdc" fgColor="#4f1718" level="Q" />
        </div>
        <p className="eyebrow">Same Wi-Fi, one scan</p>
        <h2>Join room {room.code}</h2>
        <p>Point a phone camera at the code, or send the private link.</p>
        <button className="quiet-button copy-button" onClick={copy}>
          {copied ? "Link copied" : "Copy room link"}
        </button>
        <small className="network-hint">
          Keep this game server running and allow local-network access through your firewall.
        </small>
      </section>
    </div>
  );
}

export function App() {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [routeCode, setRouteCode] = useState(roomCodeFromPath());
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(socket.connected);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const initialName = useMemo(() => localStorage.getItem("double-happiness:name") ?? "", []);
  const initialAvatar = useMemo<AvatarId>(() => {
    const saved = localStorage.getItem("double-happiness:avatar");
    return isAvatarId(saved) ? saved : "rat";
  }, []);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onRoom = (next: RoomView) => setRoom(next);
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("room:state", onRoom);
    socket.connect();
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("room:state", onRoom);
    };
  }, []);

  useEffect(() => {
    if (!routeCode || !connected || room) return;
    const token = localStorage.getItem(`double-happiness:token:${routeCode}`);
    if (!token || !initialName) return;
    setBusy(true);
    socket.emit(
      "room:join",
      { code: routeCode, playerName: initialName, avatar: initialAvatar, token },
      (response: { ok: boolean; room?: RoomView; token?: string; error?: string }) => {
        setBusy(false);
        if (response.ok && response.room && response.token) {
          rememberIdentity(response.room.code, initialName, initialAvatar, response.token);
          setRoom(response.room);
        } else if (response.error) {
          localStorage.removeItem(`double-happiness:token:${routeCode}`);
          setToast(response.error);
        }
      }
    );
  }, [routeCode, connected, room, initialName, initialAvatar]);

  const navigateToRoom = (code: string) => {
    const normalized = code.trim().toUpperCase();
    window.history.pushState({}, "", `/room/${normalized}`);
    setRouteCode(normalized);
  };

  const createRoom = (request: CreateRoomRequest) => {
    setBusy(true);
    socket.emit(
      "room:create",
      request,
      (response: { ok: boolean; room?: RoomView; token?: string; error?: string }) => {
        setBusy(false);
        if (response.ok && response.room && response.token) {
          rememberIdentity(response.room.code, request.playerName, request.avatar ?? "rat", response.token);
          navigateToRoom(response.room.code);
          setRoom(response.room);
        } else setToast(response.error ?? "Could not open the table.");
      }
    );
  };

  const joinRoom = (code: string, name: string, avatar: AvatarId) => {
    const normalized = code.trim().toUpperCase();
    setBusy(true);
    const token = localStorage.getItem(`double-happiness:token:${normalized}`) ?? undefined;
    socket.emit(
      "room:join",
      { code: normalized, playerName: name.trim(), avatar, token },
      (response: { ok: boolean; room?: RoomView; token?: string; error?: string }) => {
        setBusy(false);
        if (response.ok && response.room && response.token) {
          rememberIdentity(response.room.code, name.trim(), avatar, response.token);
          navigateToRoom(response.room.code);
          setRoom(response.room);
        } else setToast(response.error ?? "Could not join that room.");
      }
    );
  };

  const simpleRoomEvent = (event: "room:fillBots" | "room:start") => {
    socket.emit(event, (result: ActionResult) => {
      if (!result.ok) setToast(result.error ?? "That did not work.");
    });
  };

  const gameAction = (action: ClientAction): Promise<ActionResult> =>
    new Promise((resolve) => {
      socket.emit("game:action", action, (result: ActionResult) => {
        if (!result.ok) setToast(result.error ?? "That play is not allowed.");
        resolve(result);
      });
    });

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3400);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  let content;
  if (room?.status === "playing" || room?.status === "finished") {
    content = (
      <GameTable
        room={room}
        onAction={gameAction}
        onInvite={() => setInviteOpen(true)}
        onRules={() => setRulesOpen(true)}
      />
    );
  } else if (room) {
    content = (
      <RoomLobby
        room={room}
        onFillBots={() => simpleRoomEvent("room:fillBots")}
        onStart={() => simpleRoomEvent("room:start")}
        onInvite={() => setInviteOpen(true)}
      />
    );
  } else if (routeCode) {
    content = (
      <JoinGate
        code={routeCode}
        initialName={initialName}
        initialAvatar={initialAvatar}
        onJoin={joinRoom}
        busy={busy}
      />
    );
  } else {
    content = (
      <Home
        initialName={initialName}
        initialAvatar={initialAvatar}
        onCreate={createRoom}
        onJoin={joinRoom}
        busy={busy}
      />
    );
  }

  return (
    <>
      {!connected && <div className="connection-banner">Reconnecting to the local card room…</div>}
      {content}
      {inviteOpen && room && <InviteModal room={room} onClose={() => setInviteOpen(false)} />}
      {rulesOpen && room && <RulesSheet game={room.game} onClose={() => setRulesOpen(false)} />}
      {toast && (
        <div className="toast" role="alert">
          <span>!</span>
          {toast}
        </div>
      )}
    </>
  );
}
