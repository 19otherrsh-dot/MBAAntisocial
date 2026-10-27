import mongoose, { Schema, type Model, type Types } from 'mongoose';

export const GD_STATUSES = ['forming', 'scheduled', 'live', 'completed', 'cancelled'] as const;
export type GdStatus = (typeof GD_STATUSES)[number];

/**
 * A group-discussion practice room (§6.1 V2: 4–8 people, auto-matched). Either
 * hosted by a senior who moderates, or formed automatically from the queue.
 */
export interface GdParticipantFeedback {
  user: Types.ObjectId;
  scores: Map<string, number>;
  comment: string;
}

export interface IGdSession {
  _id: Types.ObjectId;
  campus: string;
  topic: string;
  /** Optional context the moderator shares in advance. */
  brief: string;
  startAt: Date;
  durationMinutes: number;
  capacity: number;
  moderator?: Types.ObjectId;
  participants: Types.ObjectId[];
  status: GdStatus;
  /** How it came to exist. */
  origin: 'hosted' | 'matched';
  meetingLink: string;
  meetingProvider: string;
  feedback: GdParticipantFeedback[];
  createdAt: Date;
  updatedAt: Date;
}

type GdSessionModel = Model<IGdSession>;

const GdSessionSchema = new Schema<IGdSession, GdSessionModel>(
  {
    campus: { type: String, required: true },
    topic: { type: String, required: true, trim: true, maxlength: 240 },
    brief: { type: String, default: '', maxlength: 2000 },
    startAt: { type: Date, required: true },
    durationMinutes: { type: Number, default: 30, min: 10, max: 120 },
    capacity: { type: Number, default: 8, min: 4, max: 10 },
    moderator: { type: Schema.Types.ObjectId, ref: 'User' },
    participants: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    status: { type: String, enum: GD_STATUSES, default: 'scheduled' },
    origin: { type: String, enum: ['hosted', 'matched'], default: 'hosted' },
    meetingLink: { type: String, default: '', maxlength: 1000 },
    meetingProvider: { type: String, default: '' },
    feedback: [
      {
        _id: false,
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        scores: { type: Map, of: Number },
        comment: { type: String, default: '', maxlength: 1000 },
      },
    ],
  },
  { timestamps: true }
);

GdSessionSchema.index({ campus: 1, status: 1, startAt: 1 });
GdSessionSchema.index({ participants: 1, startAt: -1 });

const GdSession =
  (mongoose.models.GdSession as GdSessionModel) || mongoose.model<IGdSession, GdSessionModel>('GdSession', GdSessionSchema);

export default GdSession;
