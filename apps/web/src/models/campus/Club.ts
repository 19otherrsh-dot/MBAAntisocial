import mongoose, { Schema, type Model, type Types } from 'mongoose';

export const CLUB_CATEGORIES = ['professional', 'cultural', 'sports', 'social-impact', 'entrepreneurship', 'media', 'committee', 'hobby'] as const;
export type ClubCategory = (typeof CLUB_CATEGORIES)[number];
export type ClubRole = 'lead' | 'core' | 'member';

export interface IClub {
  _id: Types.ObjectId;
  campus: string;
  name: string;
  slug: string;
  tagline: string;
  description: string;
  category: ClubCategory;
  logo: string;
  /** Recognised by the campus team. */
  official: boolean;
  members: Array<{ user: Types.ObjectId; role: ClubRole; title: string; joinedAt: Date }>;
  recruitment: { open: boolean; deadline?: Date; questions: string[]; note: string };
  budget: { allocated: number; entries: Array<{ _id: Types.ObjectId; label: string; amount: number; kind: 'income' | 'expense'; at: Date; by: Types.ObjectId }> };
  tasks: Array<{ _id: Types.ObjectId; title: string; assignee?: Types.ObjectId; due?: Date; done: boolean; createdBy: Types.ObjectId }>;
  links: { instagram: string; linkedin: string; website: string };
  hubServer?: Types.ObjectId;
  memberCount: number;
  archivedAt?: Date;
  createdAt: Date;
}

type ClubModel = Model<IClub>;

const ClubSchema = new Schema<IClub, ClubModel>(
  {
    campus: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, lowercase: true, trim: true, maxlength: 80 },
    tagline: { type: String, default: '', maxlength: 140 },
    description: { type: String, default: '', maxlength: 4000 },
    category: { type: String, enum: CLUB_CATEGORIES, default: 'professional' },
    logo: { type: String, default: '', maxlength: 500 },
    official: { type: Boolean, default: false },
    members: [
      new Schema(
        {
          user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
          role: { type: String, enum: ['lead', 'core', 'member'], default: 'member' },
          title: { type: String, default: '', maxlength: 60 },
          joinedAt: { type: Date, default: Date.now },
        },
        { _id: false }
      ),
    ],
    recruitment: {
      open: { type: Boolean, default: false },
      deadline: { type: Date },
      questions: [{ type: String, maxlength: 300 }],
      note: { type: String, default: '', maxlength: 1000 },
    },
    budget: {
      allocated: { type: Number, default: 0, min: 0 },
      entries: [
        new Schema({
          label: { type: String, required: true, maxlength: 120 },
          amount: { type: Number, required: true, min: 0 },
          kind: { type: String, enum: ['income', 'expense'], required: true },
          at: { type: Date, default: Date.now },
          by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        }),
      ],
    },
    tasks: [
      new Schema({
        title: { type: String, required: true, maxlength: 200 },
        assignee: { type: Schema.Types.ObjectId, ref: 'User' },
        due: { type: Date },
        done: { type: Boolean, default: false },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      }),
    ],
    links: {
      instagram: { type: String, default: '', maxlength: 300 },
      linkedin: { type: String, default: '', maxlength: 300 },
      website: { type: String, default: '', maxlength: 300 },
    },
    hubServer: { type: Schema.Types.ObjectId, ref: 'HubServer' },
    memberCount: { type: Number, default: 0 },
    archivedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ClubSchema.index({ campus: 1, slug: 1 }, { unique: true });
ClubSchema.index({ campus: 1, archivedAt: 1, memberCount: -1 });
ClubSchema.index({ 'members.user': 1 });

const Club = (mongoose.models.Club as ClubModel) || mongoose.model<IClub, ClubModel>('Club', ClubSchema);
export default Club;
