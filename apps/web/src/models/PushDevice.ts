import mongoose, { Schema, type Model, type Types } from 'mongoose';

/**
 * A device that can receive push: a browser's Web Push subscription or a
 * native app's Expo push token. Dead targets are pruned when a send reports
 * them gone.
 */
export interface IPushDevice {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  kind: 'web' | 'expo';
  /** Web Push endpoint, or the Expo token. Unique across all users. */
  target: string;
  keys?: { p256dh: string; auth: string };
  platform: string;
  lastSeenAt: Date;
  createdAt: Date;
}

type PushDeviceModel = Model<IPushDevice>;

const PushDeviceSchema = new Schema<IPushDevice, PushDeviceModel>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: ['web', 'expo'], required: true },
    target: { type: String, required: true, maxlength: 1000 },
    keys: { p256dh: { type: String }, auth: { type: String } },
    platform: { type: String, default: '', maxlength: 60 },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

PushDeviceSchema.index({ target: 1 }, { unique: true });
PushDeviceSchema.index({ user: 1, kind: 1 });

const PushDevice =
  (mongoose.models.PushDevice as PushDeviceModel) ||
  mongoose.model<IPushDevice, PushDeviceModel>('PushDevice', PushDeviceSchema);

export default PushDevice;
