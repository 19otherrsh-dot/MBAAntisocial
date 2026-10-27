import mongoose, { Schema, type Model, type Types } from 'mongoose';
import { DEFAULT_RATING } from '@mba/shared/games';

/** One player's standing in one game. Ratings are per game, never pooled. */
export interface IGameRating {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  game: string;
  campus: string;
  rating: number;
  peak: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  lastPlayedAt?: Date;
}

type GameRatingModel = Model<IGameRating>;

const GameRatingSchema = new Schema<IGameRating, GameRatingModel>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    game: { type: String, required: true },
    campus: { type: String, required: true },
    rating: { type: Number, default: DEFAULT_RATING },
    peak: { type: Number, default: DEFAULT_RATING },
    gamesPlayed: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    draws: { type: Number, default: 0 },
    lastPlayedAt: { type: Date },
  },
  { timestamps: false }
);

GameRatingSchema.index({ user: 1, game: 1 }, { unique: true });
GameRatingSchema.index({ game: 1, campus: 1, rating: -1 });
GameRatingSchema.index({ game: 1, rating: -1 });

const GameRating = (mongoose.models.GameRating as GameRatingModel) || mongoose.model<IGameRating, GameRatingModel>('GameRating', GameRatingSchema);

export default GameRating;
