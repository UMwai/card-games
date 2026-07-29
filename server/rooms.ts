import { randomBytes } from "node:crypto";
import type { Server, Socket } from "socket.io";
import {
  chooseGuanDanBotAction,
  createGuanDanState,
  guandanPublicState,
  playGuanDanAction,
  type GuanDanState
} from "../games/guandan.js";
import {
  chooseShengJiBotAction,
  createShengJiState,
  playShengJiAction,
  shengJiPublicState,
  type ShengJiState
} from "../games/shengji.js";
import { avatarForSeat, isAvatarId, type AvatarId } from "../shared/avatars.js";
import type {
  ActionResult,
  ClientAction,
  CreateRoomRequest,
  GameKind,
  Player,
  RoomMode,
  RoomView,
  Seat
} from "../shared/types.js";

type GameState = GuanDanState | ShengJiState;

interface RoomPlayer extends Player {
  token: string;
  socketId?: string;
}

interface Room {
  code: string;
  game: GameKind;
  mode: RoomMode;
  hostSeat: Seat;
  players: Array<RoomPlayer | null>;
  status: "lobby" | "playing" | "finished";
  state: GameState | null;
  createdAt: number;
  botTimer?: NodeJS.Timeout;
}

interface Ack<T> {
  (response: T): void;
}

const BOT_PROFILES: ReadonlyArray<{ name: string; avatar: AvatarId }> = [
  { name: "Lucky Rat", avatar: "rat" },
  { name: "Jade Ox", avatar: "ox" },
  { name: "Little Tiger", avatar: "tiger" },
  { name: "Moon Rabbit", avatar: "rabbit" }
];
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function cleanName(value: unknown): string {
  const name = String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 18);
  return name || "Guest";
}

function cleanAvatar(value: unknown, fallback: AvatarId): AvatarId {
  return isAvatarId(value) ? value : fallback;
}

function teamForSeat(seat: Seat): 0 | 1 {
  return (seat % 2) as 0 | 1;
}

function makeToken(): string {
  return randomBytes(18).toString("base64url");
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly socketMembership = new Map<string, { code: string; seat: Seat }>();

  constructor(
    private readonly io: Server,
    private readonly joinBaseUrl: () => string
  ) {}

  attach(socket: Socket): void {
    socket.on(
      "room:create",
      (request: CreateRoomRequest, ack: Ack<{ ok: boolean; room?: RoomView; token?: string; error?: string }>) => {
        try {
          const game: GameKind = request?.game === "guandan" ? "guandan" : "shengji";
          const mode: RoomMode = request?.mode === "friends" ? "friends" : "solo";
          const room = this.createRoom(
            game,
            mode,
            cleanName(request?.playerName),
            cleanAvatar(request?.avatar, "rat"),
            socket
          );
          const player = room.players[0]!;
          ack({ ok: true, room: this.viewFor(room, 0), token: player.token });
          if (mode === "solo") {
            this.fillBots(room);
            this.start(room);
          } else {
            this.broadcast(room);
          }
        } catch (error) {
          ack({ ok: false, error: error instanceof Error ? error.message : "Could not create room." });
        }
      }
    );

    socket.on(
      "room:join",
      (
        request: { code?: string; playerName?: string; avatar?: AvatarId; token?: string },
        ack: Ack<{ ok: boolean; room?: RoomView; token?: string; error?: string }>
      ) => {
        try {
          const room = this.requireRoom(request?.code);
          const player = this.joinRoom(
            room,
            cleanName(request?.playerName),
            request?.avatar,
            request?.token,
            socket
          );
          ack({ ok: true, room: this.viewFor(room, player.seat), token: player.token });
          this.broadcast(room);
        } catch (error) {
          ack({ ok: false, error: error instanceof Error ? error.message : "Could not join room." });
        }
      }
    );

    socket.on("room:fillBots", (ack: Ack<ActionResult>) => {
      const membership = this.socketMembership.get(socket.id);
      if (!membership) return ack({ ok: false, error: "Join a room first." });
      const room = this.rooms.get(membership.code)!;
      if (membership.seat !== room.hostSeat) return ack({ ok: false, error: "Only the host can add bots." });
      if (room.status !== "lobby") return ack({ ok: false, error: "The game has already started." });
      this.fillBots(room);
      this.broadcast(room);
      ack({ ok: true });
    });

    socket.on("room:start", (ack: Ack<ActionResult>) => {
      const membership = this.socketMembership.get(socket.id);
      if (!membership) return ack({ ok: false, error: "Join a room first." });
      const room = this.rooms.get(membership.code)!;
      if (membership.seat !== room.hostSeat) return ack({ ok: false, error: "Only the host can start." });
      if (room.players.some((player) => !player))
        return ack({ ok: false, error: "Four seats are required. Fill open seats with bots." });
      this.start(room);
      ack({ ok: true });
    });

    socket.on("game:action", (action: ClientAction, ack: Ack<ActionResult>) => {
      const membership = this.socketMembership.get(socket.id);
      if (!membership) return ack({ ok: false, error: "Join a room first." });
      const room = this.rooms.get(membership.code)!;
      if (!room.state || room.status !== "playing")
        return ack({ ok: false, error: "The game is not active." });
      const result =
        room.state.kind === "guandan"
          ? playGuanDanAction(room.state, membership.seat, action)
          : playShengJiAction(room.state, membership.seat, action);
      if (result.ok) {
        room.status =
          room.state.phase === "matchOver" ? "finished" : room.state.phase === "roundOver" ? "playing" : "playing";
        this.broadcast(room);
        this.scheduleBot(room);
      }
      ack(result);
    });

    socket.on("disconnect", () => this.disconnect(socket.id));
  }

  private createRoom(game: GameKind, mode: RoomMode, name: string, avatar: AvatarId, socket: Socket): Room {
    let code = "";
    do {
      code = Array.from({ length: 5 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join(
        ""
      );
    } while (this.rooms.has(code));
    const human: RoomPlayer = {
      id: randomBytes(8).toString("hex"),
      token: makeToken(),
      name,
      avatar,
      seat: 0,
      isBot: false,
      connected: true,
      team: 0,
      cardsLeft: 0,
      socketId: socket.id
    };
    const room: Room = {
      code,
      game,
      mode,
      hostSeat: 0,
      players: [human, null, null, null],
      status: "lobby",
      state: null,
      createdAt: Date.now()
    };
    this.rooms.set(code, room);
    this.socketMembership.set(socket.id, { code, seat: 0 });
    socket.join(code);
    return room;
  }

  private joinRoom(
    room: Room,
    name: string,
    avatar: AvatarId | undefined,
    token: string | undefined,
    socket: Socket
  ): RoomPlayer {
    const returning = token ? room.players.find((player) => player?.token === token) : undefined;
    if (returning && !returning.isBot) {
      if (returning.socketId && returning.socketId !== socket.id) {
        this.socketMembership.delete(returning.socketId);
      }
      returning.socketId = socket.id;
      returning.connected = true;
      returning.name = name || returning.name;
      returning.avatar = cleanAvatar(avatar, returning.avatar);
      this.socketMembership.set(socket.id, { code: room.code, seat: returning.seat });
      socket.join(room.code);
      return returning;
    }
    if (room.status !== "lobby") throw new Error("This game is already underway.");
    const openSeat = room.players.findIndex((player) => player === null);
    if (openSeat < 0) throw new Error("This room is full.");
    const seat = openSeat as Seat;
    const player: RoomPlayer = {
      id: randomBytes(8).toString("hex"),
      token: makeToken(),
      name,
      avatar: cleanAvatar(avatar, avatarForSeat(seat)),
      seat,
      isBot: false,
      connected: true,
      team: teamForSeat(seat),
      cardsLeft: 0,
      socketId: socket.id
    };
    room.players[seat] = player;
    this.socketMembership.set(socket.id, { code: room.code, seat });
    socket.join(room.code);
    return player;
  }

  private requireRoom(rawCode: unknown): Room {
    const code = String(rawCode ?? "").trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) throw new Error("Room not found. Check the five-character code.");
    return room;
  }

  private fillBots(room: Room): void {
    room.players.forEach((player, index) => {
      if (player) return;
      const seat = index as Seat;
      const profile = BOT_PROFILES[seat];
      room.players[seat] = {
        id: `bot-${room.code}-${seat}`,
        token: "",
        name: profile.name,
        avatar: profile.avatar,
        seat,
        isBot: true,
        connected: true,
        team: teamForSeat(seat),
        cardsLeft: 0
      };
    });
  }

  private start(room: Room): void {
    if (room.status !== "lobby" || room.players.some((player) => !player)) return;
    room.state = room.game === "guandan" ? createGuanDanState() : createShengJiState();
    room.status = "playing";
    this.broadcast(room);
    this.scheduleBot(room);
  }

  private scheduleBot(room: Room): void {
    if (room.botTimer) clearTimeout(room.botTimer);
    if (!room.state || room.status !== "playing") return;
    if (room.state.phase === "roundOver" || room.state.phase === "matchOver") return;
    const player = room.players[room.state.turn];
    if (!player?.isBot) return;
    room.botTimer = setTimeout(() => {
      if (!room.state || room.status !== "playing") return;
      const seat = room.state.turn;
      const active = room.players[seat];
      if (!active?.isBot) return;
      const action =
        room.state.kind === "guandan"
          ? chooseGuanDanBotAction(room.state, seat)
          : chooseShengJiBotAction(room.state, seat);
      if (room.state.kind === "guandan") playGuanDanAction(room.state, seat, action);
      else playShengJiAction(room.state, seat, action);
      this.broadcast(room);
      this.scheduleBot(room);
    }, 520);
  }

  private viewFor(room: Room, seat: Seat): RoomView {
    const hands = room.state?.hands;
    const players = room.players.map((player, index) =>
      player
        ? {
            id: player.id,
            name: player.name,
            avatar: player.avatar,
            seat: player.seat,
            isBot: player.isBot,
            connected: player.connected,
            team: player.team,
            cardsLeft: hands?.[index as Seat]?.length ?? 0
          }
        : null
    );
    return {
      code: room.code,
      game: room.game,
      mode: room.mode,
      hostSeat: room.hostSeat,
      yourSeat: seat,
      players,
      status: room.status,
      hand: hands?.[seat] ?? [],
      gameState: room.state
        ? room.state.kind === "guandan"
          ? guandanPublicState(room.state)
          : shengJiPublicState(room.state)
        : null,
      joinUrl: `${this.joinBaseUrl().replace(/\/$/, "")}/room/${room.code}`,
      createdAt: room.createdAt
    };
  }

  private broadcast(room: Room): void {
    for (const player of room.players) {
      if (!player?.socketId) continue;
      this.io.to(player.socketId).emit("room:state", this.viewFor(room, player.seat));
    }
  }

  private disconnect(socketId: string): void {
    const membership = this.socketMembership.get(socketId);
    if (!membership) return;
    const room = this.rooms.get(membership.code);
    const player = room?.players[membership.seat];
    if (player && !player.isBot) {
      player.connected = false;
      player.socketId = undefined;
      if (room) this.broadcast(room);
    }
    this.socketMembership.delete(socketId);
  }
}
