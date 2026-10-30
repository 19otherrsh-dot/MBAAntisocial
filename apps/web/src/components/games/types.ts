import type { GameCategory, GameManifest, GameMode } from '@mba/shared/games';

export interface GameCardView {
  id: string;
  title: string;
  tagline: string;
  category: GameCategory;
  minPlayers: number;
  maxPlayers: number;
  modes: GameMode[];
  estimatedMinutes: number;
  thumbnail: string;
  playable: boolean;
  rated: boolean;
  openTables: number;
  me: { rating: number; played: number; wins: number } | null;
}

export interface SeatView {
  seat: number;
  user: { _id: string; name: string; image: string; rating: number | null } | null;
  isBot: boolean;
  ready: boolean;
  present: boolean;
  left: boolean;
}

export interface RoomView {
  _id: string;
  game: string;
  code: string;
  host: string;
  status: 'lobby' | 'playing' | 'finished' | 'abandoned';
  mode: 'online' | 'tournament';
  visibility: 'public' | 'private';
  crossCampus: boolean;
  campus: string;
  maxPlayers: number;
  minPlayers: number;
  rated: boolean;
  options: Record<string, string | number | boolean>;
  seats: SeatView[];
  spectatorCount: number;
  tournament?: string;
  /** The lobby opened by "Play again" after this game. */
  rematch?: string;
  result?: { standings: Array<{ playerId: string; placement: number; score?: number }>; summary: string; source: string };
  disputed: boolean;
  startedAt?: string;
  finishedAt?: string;
}

export interface GameDetail {
  game: GameManifest;
  playable: boolean;
  entryUrl: string | null;
  me: { rating: number; peak: number; played: number; wins: number; losses: number; draws: number } | null;
  leaderboard: Array<{ rank: number; user: { _id: string; name: string; image: string; campus: string }; rating: number; played: number; wins: number }>;
  history: Array<{ _id: string; mode: string; rated: boolean; placement: number | null; delta: number | null; opponents: string[]; summary: string; finishedAt: string }>;
  tables: RoomView[];
  tournaments: Array<{ _id: string; title: string; status: string; startsAt: string; entrants: number; maxEntrants: number }>;
}

/** Emoji art for games without a thumbnail yet. */
export const GAME_ART: Record<string, { emoji: string; tint: string }> = {
  ludo: { emoji: '🎲', tint: '#fff3bf' },
  chess: { emoji: '♟️', tint: '#e9ecef' },
  carrom: { emoji: '🎯', tint: '#ffe8cc' },
  'snakes-and-ladders': { emoji: '🐍', tint: '#d3f9d8' },
  checkers: { emoji: '⛀', tint: '#ffe3e3' },
  reversi: { emoji: '⚫', tint: '#d0ebff' },
  'four-in-a-row': { emoji: '🔴', tint: '#fff0f6' },
  'sea-battle': { emoji: '🚢', tint: '#d0ebff' },
  'dots-and-boxes': { emoji: '▦', tint: '#f3f0ff' },
  'crazy-eights': { emoji: '🃏', tint: '#fff4e6' },
  rummy: { emoji: '🂡', tint: '#e6fcf5' },
  hearts: { emoji: '♥️', tint: '#ffe3e3' },
  bluff: { emoji: '🤥', tint: '#f8f0fc' },
  'trade-empire': { emoji: '🏙️', tint: '#e7f5ff' },
  'market-maker': { emoji: '📈', tint: '#ebfbee' },
  'jargon-duel': { emoji: '💬', tint: '#f3f0ff' },
  'guesstimate-showdown': { emoji: '🧮', tint: '#fff9db' },
  'tic-tac-toe': { emoji: '⭕', tint: '#ecebff' },
  sudoku: { emoji: '🔢', tint: '#e3fafc' },
  'memory-match': { emoji: '🧠', tint: '#fff0f6' },
};

export function artFor(id: string) {
  return GAME_ART[id] ?? { emoji: '🎮', tint: '#f1f3f5' };
}
