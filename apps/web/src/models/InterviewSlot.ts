import mongoose, { Schema, type Model, type Types } from 'mongoose';
import {
  SESSION_TYPES,
  SLOT_STATUSES,
  RATING_MIN,
  RATING_MAX,
  type SessionType,
  type SlotStatus,
} from '@/lib/constants';

/**
 * A rubric response. Scores are stored as a map so the criteria in
 * `constants.ts` can grow without a migration, while `comments` carries the
 * part that actually changes behaviour.
 */
export interface RubricFeedback {
  scores: Map<string, number>;
  comments: string;
  submittedAt: Date;
}

export interface IInterviewSlot {
  _id: Types.ObjectId;
  mentor: Types.ObjectId;
  /** Denormalised so slot queries filter by campus without joining users. */
  campus: string;

  /**
   * Absolute instants rather than a date plus "HH:mm" strings. Overlap checks,
   * notice-period arithmetic, and reminder scheduling all become simple
   * comparisons, and the value is unambiguous across time zones.
   */
  startAt: Date;
  endAt: Date;

  sessionType: SessionType;
  /** Optional prep context the mentor wants before the call. */
  notes: string;
  meetingLink: string;

  status: SlotStatus;
  bookedBy?: Types.ObjectId;
  bookedAt?: Date;
  /** Junior's context for the session, captured at booking time. */
  bookingNote: string;

  cancelledBy?: Types.ObjectId;
  cancelledAt?: Date;
  cancellationReason: string;
  /** True when cancelled inside the notice window. */
  wasLateCancellation: boolean;

  /** Audit trail for reschedules, so a serial rescheduler is visible. */
  rescheduleHistory: Array<{ from: Date; to: Date; by: Types.ObjectId; at: Date }>;

  completedAt?: Date;
  mentorFeedback?: RubricFeedback;
  menteeFeedback?: RubricFeedback;

  createdAt: Date;
  updatedAt: Date;
}

type InterviewSlotModel = Model<IInterviewSlot>;

const rubricFeedbackSchema = new Schema<RubricFeedback>(
  {
    scores: {
      type: Map,
      of: { type: Number, min: RATING_MIN, max: RATING_MAX },
      required: true,
    },
    comments: { type: String, default: '', maxlength: 2000 },
    submittedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const InterviewSlotSchema = new Schema<IInterviewSlot, InterviewSlotModel>(
  {
    mentor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    campus: { type: String, required: true },

    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },

    sessionType: { type: String, enum: SESSION_TYPES, required: true },
    notes: { type: String, default: '', maxlength: 500 },
    meetingLink: { type: String, default: '', maxlength: 500 },

    status: { type: String, enum: SLOT_STATUSES, default: 'available' },
    bookedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    bookedAt: { type: Date },
    bookingNote: { type: String, default: '', maxlength: 500 },

    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
    cancelledAt: { type: Date },
    cancellationReason: { type: String, default: '', maxlength: 500 },
    wasLateCancellation: { type: Boolean, default: false },

    rescheduleHistory: [
      {
        _id: false,
        from: { type: Date, required: true },
        to: { type: Date, required: true },
        by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        at: { type: Date, default: Date.now },
      },
    ],

    completedAt: { type: Date },
    mentorFeedback: { type: rubricFeedbackSchema },
    menteeFeedback: { type: rubricFeedbackSchema },
  },
  { timestamps: true }
);

InterviewSlotSchema.pre('validate', async function ensureOrdering() {
  if (this.endAt <= this.startAt) {
    throw new Error('A slot must end after it starts.');
  }
});

// Browse: open slots on a campus, soonest first.
InterviewSlotSchema.index({ campus: 1, status: 1, startAt: 1 });
// "My slots" and mentor overlap checks.
InterviewSlotSchema.index({ mentor: 1, startAt: 1 });
// "My bookings".
InterviewSlotSchema.index({ bookedBy: 1, startAt: -1 });

const InterviewSlot =
  (mongoose.models.InterviewSlot as InterviewSlotModel) ||
  mongoose.model<IInterviewSlot, InterviewSlotModel>('InterviewSlot', InterviewSlotSchema);

export default InterviewSlot;
