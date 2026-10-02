import mongoose, { Schema, type Model, type Types } from 'mongoose';

export interface IStudyRoom {
  _id: Types.ObjectId;
  title: string;
  topic: string;
  campus: string;
  isGlobal: boolean;
  createdBy: Types.ObjectId;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

type StudyRoomModel = Model<IStudyRoom>;

const StudyRoomSchema = new Schema<IStudyRoom, StudyRoomModel>(
  {
    title: { type: String, required: true, trim: true, maxlength: 100 },
    topic: { type: String, required: true, trim: true, maxlength: 50 },
    campus: { type: String, required: true, trim: true },
    isGlobal: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// TTL index to automatically delete rooms after expiration
StudyRoomSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
StudyRoomSchema.index({ campus: 1, isGlobal: 1 });

const StudyRoom =
  (mongoose.models.StudyRoom as StudyRoomModel) ||
  mongoose.model<IStudyRoom, StudyRoomModel>('StudyRoom', StudyRoomSchema);

export default StudyRoom;
