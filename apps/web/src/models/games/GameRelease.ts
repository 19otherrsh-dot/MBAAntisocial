import mongoose, { Schema, type Model, type Types } from 'mongoose';

/**
 * A published build, stored in the database so a CDN-hosted build can go live
 * without a redeploy. The newest active release overrides the catalog entry
 * and any manifest shipped under public/game-builds.
 */
export interface IGameRelease {
  _id: Types.ObjectId;
  game: string;
  /** The full manifest as validated by `gameManifestSchema`. */
  manifest: Record<string, unknown>;
  active: boolean;
  publishedBy?: Types.ObjectId;
  notes: string;
  createdAt: Date;
}

type GameReleaseModel = Model<IGameRelease>;

const GameReleaseSchema = new Schema<IGameRelease, GameReleaseModel>(
  {
    game: { type: String, required: true },
    manifest: { type: Schema.Types.Mixed, required: true },
    active: { type: Boolean, default: true },
    publishedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    notes: { type: String, default: '', maxlength: 500 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

GameReleaseSchema.index({ game: 1, active: 1, createdAt: -1 });

const GameRelease = (mongoose.models.GameRelease as GameReleaseModel) || mongoose.model<IGameRelease, GameReleaseModel>('GameRelease', GameReleaseSchema);

export default GameRelease;
