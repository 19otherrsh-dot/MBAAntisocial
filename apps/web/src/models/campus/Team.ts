import mongoose, { Schema, type Model, type Types } from 'mongoose';

/** A competition or project team, with a hub server as its workspace. */
export interface ITeam {
  _id: Types.ObjectId;
  campus: string;
  name: string;
  purpose: string;
  comp?: Types.ObjectId;
  captain: Types.ObjectId;
  members: Array<{ user: Types.ObjectId; joinedAt: Date }>;
  maxSize: number;
  openRoles: string[];
  lookingForMembers: boolean;
  requests: Array<{ user: Types.ObjectId; note: string; at: Date }>;
  hubServer?: Types.ObjectId;
  archivedAt?: Date;
  createdAt: Date;
}

type TeamModel = Model<ITeam>;

const TeamSchema = new Schema<ITeam, TeamModel>(
  {
    campus: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    purpose: { type: String, default: '', maxlength: 1000 },
    comp: { type: Schema.Types.ObjectId, ref: 'CaseComp' },
    captain: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    members: [new Schema({ user: { type: Schema.Types.ObjectId, ref: 'User', required: true }, joinedAt: { type: Date, default: Date.now } }, { _id: false })],
    maxSize: { type: Number, default: 4, min: 2, max: 12 },
    openRoles: [{ type: String, maxlength: 40 }],
    lookingForMembers: { type: Boolean, default: true },
    requests: [new Schema({ user: { type: Schema.Types.ObjectId, ref: 'User', required: true }, note: { type: String, default: '', maxlength: 500 }, at: { type: Date, default: Date.now } }, { _id: false })],
    hubServer: { type: Schema.Types.ObjectId, ref: 'HubServer' },
    archivedAt: { type: Date },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

TeamSchema.index({ campus: 1, lookingForMembers: 1, createdAt: -1 });
TeamSchema.index({ 'members.user': 1 });

const Team = (mongoose.models.Team as TeamModel) || mongoose.model<ITeam, TeamModel>('Team', TeamSchema);
export default Team;
