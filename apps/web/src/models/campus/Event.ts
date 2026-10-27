import mongoose, { Schema, type Model, type Types } from 'mongoose';

export const EVENT_CATEGORIES = ['talk', 'workshop', 'fest', 'sports', 'social', 'career', 'club', 'other'] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

export interface EventRsvp {
  user: Types.ObjectId;
  status: 'going' | 'interested' | 'waitlist';
  at: Date;
  checkedIn: boolean;
}

export interface IEvent {
  _id: Types.ObjectId;
  campus: string;
  title: string;
  description: string;
  category: EventCategory;
  club?: Types.ObjectId;
  host: Types.ObjectId;
  startAt: Date;
  endAt: Date;
  venue: string;
  onlineUrl: string;
  /** 0 means unlimited. */
  capacity: number;
  coverImage: string;
  rsvps: EventRsvp[];
  /** Four digits shown to the host; attendees enter it to check in. */
  checkInCode: string;
  status: 'scheduled' | 'cancelled';
  goingCount: number;
  createdAt: Date;
  updatedAt: Date;
}

type EventModel = Model<IEvent>;

const EventSchema = new Schema<IEvent, EventModel>(
  {
    campus: { type: String, required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: '', maxlength: 4000 },
    category: { type: String, enum: EVENT_CATEGORIES, default: 'other' },
    club: { type: Schema.Types.ObjectId, ref: 'Club' },
    host: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    venue: { type: String, default: '', trim: true, maxlength: 120 },
    onlineUrl: { type: String, default: '', trim: true, maxlength: 500 },
    capacity: { type: Number, default: 0, min: 0, max: 100_000 },
    coverImage: { type: String, default: '', maxlength: 500 },
    rsvps: [
      new Schema<EventRsvp>(
        {
          user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
          status: { type: String, enum: ['going', 'interested', 'waitlist'], required: true },
          at: { type: Date, default: Date.now },
          checkedIn: { type: Boolean, default: false },
        },
        { _id: false }
      ),
    ],
    checkInCode: { type: String, required: true },
    status: { type: String, enum: ['scheduled', 'cancelled'], default: 'scheduled' },
    goingCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

EventSchema.index({ campus: 1, status: 1, startAt: 1 });
EventSchema.index({ 'rsvps.user': 1, startAt: 1 });
EventSchema.index({ club: 1, startAt: -1 });

const Event = (mongoose.models.Event as EventModel) || mongoose.model<IEvent, EventModel>('Event', EventSchema);
export default Event;
