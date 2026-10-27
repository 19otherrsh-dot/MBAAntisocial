import mongoose, { Schema, type Model, type Types } from 'mongoose';

/**
 * "Match me into a GD": a person and the windows they can make. When enough
 * people share a window, the matcher forms a session and removes their entries.
 */
export interface IGdQueueEntry {
  _id: Types.ObjectId;
  campus: string;
  user: Types.ObjectId;
  /** Start of each hour-long window the person can make. */
  windows: Date[];
  track: string;
  createdAt: Date;
}

type GdQueueEntryModel = Model<IGdQueueEntry>;

const GdQueueEntrySchema = new Schema<IGdQueueEntry, GdQueueEntryModel>(
  {
    campus: { type: String, required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    windows: [{ type: Date }],
    track: { type: String, default: '', maxlength: 40 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

GdQueueEntrySchema.index({ campus: 1, user: 1 }, { unique: true });
GdQueueEntrySchema.index({ campus: 1, windows: 1 });

const GdQueueEntry =
  (mongoose.models.GdQueueEntry as GdQueueEntryModel) ||
  mongoose.model<IGdQueueEntry, GdQueueEntryModel>('GdQueueEntry', GdQueueEntrySchema);

export default GdQueueEntry;
