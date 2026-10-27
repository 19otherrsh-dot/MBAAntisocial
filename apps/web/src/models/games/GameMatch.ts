import mongoose, { Schema, type Model, type Types } from 'mongoose';

/** A finished game, kept for history and stats after the room is gone. */
export interface IGameMatch {
  _id: Types.ObjectId;
  room?: Types.ObjectId;
  game: string;
  campus: string;
  mode: 'online' | 'tournament' | 'bot' | 'local';
  rated: boolean;
  players: Array<{
    user?: Types.ObjectId;
    isBot: boolean;
    placement: number;
    score?: number;
    ratingBefore?: number;
    ratingAfter?: number;
  }>;
  summary: string;
  durationSeconds?: number;
  source: 'consensus' | 'server' | 'forfeit' | 'self';
  tournament?: Types.ObjectId;
  finishedAt: Date;
}

type GameMatchModel = Model<IGameMatch>;

const GameMatchSchema = new Schema<IGameMatch, GameMatchModel>({
  room: { type: Schema.Types.ObjectId, ref: 'GameRoom' },
  game: { type: String, required: true },
  campus: { type: String, required: true },
  mode: { type: String, enum: ['online', 'tournament', 'bot', 'local'], required: true },
  rated: { type: Boolean, default: false },
  players: [
    new Schema(
      {
        user: { type: Schema.Types.ObjectId, ref: 'User' },
        isBot: { type: Boolean, default: false },
        placement: { type: Number, required: true },
        score: { type: Number },
        ratingBefore: { type: Number },
        ratingAfter: { type: Number },
      },
      { _id: false }
    ),
  ],
  summary: { type: String, default: '', maxlength: 200 },
  durationSeconds: { type: Number },
  source: { type: String, enum: ['consensus', 'server', 'forfeit', 'self'], required: true },
  tournament: { type: Schema.Types.ObjectId, ref: 'Tournament' },
  finishedAt: { type: Date, default: Date.now },
});

GameMatchSchema.index({ room: 1 }, { unique: true, partialFilterExpression: { room: { $exists: true } } });
GameMatchSchema.index({ 'players.user': 1, finishedAt: -1 });
GameMatchSchema.index({ game: 1, campus: 1, finishedAt: -1 });

const GameMatch = (mongoose.models.GameMatch as GameMatchModel) || mongoose.model<IGameMatch, GameMatchModel>('GameMatch', GameMatchSchema);

export default GameMatch;
