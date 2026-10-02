import mongoose, { Schema, type Model, type Types } from 'mongoose';

export interface IRoomMessage {
  _id: Types.ObjectId;
  room: Types.ObjectId;
  author: Types.ObjectId;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

type RoomMessageModel = Model<IRoomMessage>;

const RoomMessageSchema = new Schema<IRoomMessage, RoomMessageModel>(
  {
    room: { type: Schema.Types.ObjectId, ref: 'StudyRoom', required: true, index: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: true }
);

// We want to fetch messages sorted by creation time efficiently
RoomMessageSchema.index({ room: 1, createdAt: 1 });

const RoomMessage =
  (mongoose.models.RoomMessage as RoomMessageModel) ||
  mongoose.model<IRoomMessage, RoomMessageModel>('RoomMessage', RoomMessageSchema);

export default RoomMessage;
