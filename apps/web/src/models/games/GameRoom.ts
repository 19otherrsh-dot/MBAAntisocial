import mongoose, { Schema, type Model, type Types } from 'mongoose';

/**
 * One table: a lobby that becomes a game. Seats are the source of truth for
 * who plays; a ticket is only ever minted for a seat (or a spectator) here.
 */
export type RoomStatus = 'lobby' | 'playing' | 'finished' | 'abandoned';

export interface RoomSeat {
  seat: number;
  user?: Types.ObjectId;
  isBot: boolean;
  ready: boolean;
  /** Socket presence as reported by the realtime service. */
  present: boolean;
  /** Walked out mid-game: counts as a resignation, no longer needed for consensus. */
  left: boolean;
  joinedAt: Date;
}

export interface ResultReport {
  user: Types.ObjectId;
  key: string;
  standings: Array<{ playerId: string; placement: number; score?: number }>;
  summary: string;
  durationSeconds?: number;
  at: Date;
}

export interface IGameRoom {
  _id: Types.ObjectId;
  campus: string;
  game: string;
  version: string;
  code: string;
  host: Types.ObjectId;
  status: RoomStatus;
  mode: 'online' | 'tournament';
  transport: 'webrtc' | 'relay' | 'dedicated';
  visibility: 'public' | 'private';
  /** Public lobbies on other campuses may be matched into. */
  crossCampus: boolean;
  maxPlayers: number;
  minPlayers: number;
  rated: boolean;
  seats: RoomSeat[];
  spectators: Types.ObjectId[];
  options: Record<string, string | number | boolean>;
  tournament?: Types.ObjectId;
  tournamentMatch?: string;
  reports: ResultReport[];
  result?: {
    standings: Array<{ playerId: string; placement: number; score?: number }>;
    summary: string;
    durationSeconds?: number;
    source: 'consensus' | 'server' | 'forfeit';
  };
  disputed: boolean;
  startedAt?: Date;
  finishedAt?: Date;
  lastActivityAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

type GameRoomModel = Model<IGameRoom>;

const StandingSchema = new Schema(
  { playerId: { type: String, required: true }, placement: { type: Number, required: true }, score: { type: Number } },
  { _id: false }
);

const GameRoomSchema = new Schema<IGameRoom, GameRoomModel>(
  {
    campus: { type: String, required: true },
    game: { type: String, required: true },
    version: { type: String, default: '' },
    code: { type: String, required: true },
    host: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['lobby', 'playing', 'finished', 'abandoned'], default: 'lobby' },
    mode: { type: String, enum: ['online', 'tournament'], default: 'online' },
    transport: { type: String, enum: ['webrtc', 'relay', 'dedicated'], required: true },
    visibility: { type: String, enum: ['public', 'private'], default: 'public' },
    crossCampus: { type: Boolean, default: false },
    maxPlayers: { type: Number, required: true },
    minPlayers: { type: Number, required: true },
    rated: { type: Boolean, default: true },
    seats: [
      new Schema<RoomSeat>(
        {
          seat: { type: Number, required: true },
          user: { type: Schema.Types.ObjectId, ref: 'User' },
          isBot: { type: Boolean, default: false },
          ready: { type: Boolean, default: false },
          present: { type: Boolean, default: false },
          left: { type: Boolean, default: false },
          joinedAt: { type: Date, default: Date.now },
        },
        { _id: false }
      ),
    ],
    spectators: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    options: { type: Schema.Types.Mixed, default: {} },
    tournament: { type: Schema.Types.ObjectId, ref: 'Tournament' },
    tournamentMatch: { type: String },
    reports: [
      new Schema<ResultReport>(
        {
          user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
          key: { type: String, required: true },
          standings: [StandingSchema],
          summary: { type: String, default: '', maxlength: 200 },
          durationSeconds: { type: Number },
          at: { type: Date, default: Date.now },
        },
        { _id: false }
      ),
    ],
    result: {
      type: new Schema(
        {
          standings: [StandingSchema],
          summary: { type: String, default: '' },
          durationSeconds: { type: Number },
          source: { type: String, enum: ['consensus', 'server', 'forfeit'], required: true },
        },
        { _id: false }
      ),
      required: false,
    },
    disputed: { type: Boolean, default: false },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    lastActivityAt: { type: Date, default: Date.now },
  },
  { timestamps: true, minimize: false }
);

// Codes are unique among live rooms only, so they can be reused later.
GameRoomSchema.index({ code: 1 }, { unique: true, partialFilterExpression: { status: { $in: ['lobby', 'playing'] } } });
GameRoomSchema.index({ campus: 1, game: 1, status: 1, visibility: 1 });
GameRoomSchema.index({ 'seats.user': 1, status: 1 });
GameRoomSchema.index({ status: 1, lastActivityAt: 1 });
GameRoomSchema.index({ tournament: 1, tournamentMatch: 1 });

const GameRoom = (mongoose.models.GameRoom as GameRoomModel) || mongoose.model<IGameRoom, GameRoomModel>('GameRoom', GameRoomSchema);

export default GameRoom;
