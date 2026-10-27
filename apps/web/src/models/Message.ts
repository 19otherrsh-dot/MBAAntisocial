import mongoose, { Schema, Document } from 'mongoose';

export interface IMessage extends Document {
  sender: mongoose.Types.ObjectId;
  receiver: mongoose.Types.ObjectId;
  content: string;
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    receiver: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
    read: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

MessageSchema.index({ sender: 1, receiver: 1 });
MessageSchema.index({ receiver: 1, read: 1 });

export default mongoose.models.Message || mongoose.model<IMessage>('Message', MessageSchema);
