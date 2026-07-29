import type { Card, Rank, Suit } from "../games/cards.js";
import type { AvatarId } from "./avatars.js";

export type GameKind = "shengji" | "guandan";
export type RoomMode = "solo" | "friends";
export type Seat = 0 | 1 | 2 | 3;

export interface Player {
  id: string;
  name: string;
  avatar: AvatarId;
  seat: Seat;
  isBot: boolean;
  connected: boolean;
  team: 0 | 1;
  cardsLeft: number;
}

export interface PlayedCards {
  seat: Seat;
  cards: Card[];
  label?: string;
}

export interface GuanDanPublicState {
  kind: "guandan";
  phase: "playing" | "roundOver" | "matchOver";
  turn: Seat;
  leader: Seat;
  levelRank: Rank;
  teamLevels: [Rank, Rank];
  currentPlay: PlayedCards | null;
  passes: number;
  finishOrder: Seat[];
  lastAction: string;
  roundNumber: number;
  winnerTeam?: 0 | 1;
}

export interface ShengJiPublicState {
  kind: "shengji";
  phase: "burying" | "playing" | "roundOver";
  turn: Seat;
  dealer: Seat;
  trumpSuit: Suit;
  levelRank: Rank;
  teamLevels: [Rank, Rank];
  trick: PlayedCards[];
  trickNumber: number;
  defenderPoints: number;
  buriedCount: number;
  lastAction: string;
  winnerTeam?: 0 | 1;
}

export type PublicGameState = GuanDanPublicState | ShengJiPublicState;

export interface RoomView {
  code: string;
  game: GameKind;
  mode: RoomMode;
  hostSeat: Seat;
  yourSeat: Seat;
  players: Array<Player | null>;
  status: "lobby" | "playing" | "finished";
  hand: Card[];
  gameState: PublicGameState | null;
  joinUrl: string;
  createdAt: number;
}

export type ClientAction =
  | { type: "play"; cardIds: string[] }
  | { type: "pass" }
  | { type: "bury"; cardIds: string[] }
  | { type: "nextRound" };

export interface PlayRecommendation {
  action: "play" | "pass" | "bury";
  cardIds: string[];
  label: string;
  reason: string;
  confidence: "strong" | "situational";
}

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export interface CreateRoomRequest {
  game: GameKind;
  mode: RoomMode;
  playerName: string;
  avatar?: AvatarId;
}
