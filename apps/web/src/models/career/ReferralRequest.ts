import mongoose, { Schema, type Model, type Types } from 'mongoose';

/**
 * A junior asking an alum (who opted in) for a referral. Bounded on both
 * sides: a junior holds a few open requests at a time, and an alum never sees
 * more than their stated monthly capacity of open asks.
 */
export interface IReferralRequest {
  _id: Types.ObjectId;
  campus: string;
  requester: Types.ObjectId;
  alum: Types.ObjectId;
  company: string;
  role: string;
  jobUrl: string;
  note: string;
  resumeUrl: string;
  priority: boolean;
  status: 'pending' | 'accepted' | 'referred' | 'declined' | 'withdrawn' | 'expired';
  response: string;
  respondedAt?: Date;
  createdAt: Date;
}

type ReferralRequestModel = Model<IReferralRequest>;

const ReferralRequestSchema = new Schema<IReferralRequest, ReferralRequestModel>(
  {
    campus: { type: String, required: true },
    requester: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    alum: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    company: { type: String, required: true, trim: true, maxlength: 120 },
    role: { type: String, required: true, trim: true, maxlength: 120 },
    jobUrl: { type: String, default: '', maxlength: 500 },
    note: { type: String, default: '', maxlength: 1500 },
    resumeUrl: { type: String, default: '', maxlength: 500 },
    priority: { type: Boolean, default: false },
    status: { type: String, enum: ['pending', 'accepted', 'referred', 'declined', 'withdrawn', 'expired'], default: 'pending' },
    response: { type: String, default: '', maxlength: 1000 },
    respondedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ReferralRequestSchema.index({ alum: 1, status: 1, priority: -1, createdAt: 1 });
ReferralRequestSchema.index({ requester: 1, status: 1 });
ReferralRequestSchema.index({ requester: 1, alum: 1, company: 1, status: 1 });

const ReferralRequest =
  (mongoose.models.ReferralRequest as ReferralRequestModel) || mongoose.model<IReferralRequest, ReferralRequestModel>('ReferralRequest', ReferralRequestSchema);
export default ReferralRequest;
