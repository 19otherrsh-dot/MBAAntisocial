import mongoose, { Schema, type Model, type Types } from 'mongoose';

/**
 * An anonymous course or professor review.
 *
 * This is the one place the product publishes unsigned free text about a named,
 * identifiable private individual, which is the highest-harm shape user content
 * can take. §11 permits anonymity only with reporting and moderation tooling in
 * place, so the design here is the same one used for anonymous interview
 * questions: **the author is recorded but never published.**
 *
 * That distinction is the whole point. Readers see no name, so the candour that
 * makes a review worth writing survives. Moderators can still act on a
 * defamatory post, and a review can still be taken down — neither of which is
 * possible if nothing is stored, which is what "fully anonymous" would actually
 * mean.
 */
export interface IWhisper {
  _id: Types.ObjectId;
  /** Never serialised to any client. Exists so moderation is possible at all. */
  author: Types.ObjectId;
  campus: string;

  targetName: string;
  targetType: 'course' | 'professor';

  rating: number;
  difficulty: number;
  workload: number;
  content: string;

  hiddenAt?: Date;
  hiddenBy?: Types.ObjectId;
  hiddenReason: string;

  createdAt: Date;
}

type WhisperModel = Model<IWhisper>;

const WhisperSchema = new Schema<IWhisper, WhisperModel>(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    campus: { type: String, required: true },

    targetName: { type: String, required: true, trim: true, maxlength: 100 },
    targetType: { type: String, required: true, enum: ['course', 'professor'] },

    rating: { type: Number, required: true, min: 1, max: 5 },
    difficulty: { type: Number, required: true, min: 1, max: 5 },
    workload: { type: Number, required: true, min: 1, max: 5 },
    content: { type: String, required: true, trim: true, maxlength: 2000 },

    hiddenAt: { type: Date },
    hiddenBy: { type: Schema.Types.ObjectId, ref: 'User' },
    hiddenReason: { type: String, default: '', maxlength: 500 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

WhisperSchema.index({ campus: 1, targetName: 1, hiddenAt: 1 });
WhisperSchema.index({ campus: 1, createdAt: -1 });

/**
 * One review per person per target.
 *
 * Without this, a single anonymous account can post fifty reviews of a
 * professor it dislikes and move the average on its own — the review becomes a
 * brigading tool rather than a signal.
 */
WhisperSchema.index({ author: 1, campus: 1, targetName: 1 }, { unique: true });

const Whisper =
  (mongoose.models.Whisper as WhisperModel) ||
  mongoose.model<IWhisper, WhisperModel>('Whisper', WhisperSchema);

export default Whisper;
