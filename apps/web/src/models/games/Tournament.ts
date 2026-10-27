import mongoose, { Schema, type Model, type Types } from 'mongoose';

export type TournamentStatus = 'registration' | 'running' | 'finished' | 'cancelled';

export interface TournamentMatchDoc {
  /** `r<round>-s<slot>` for brackets, `r<round>-<a>-<b>` for round robins. */
  key: string;
  round: number;
  slot: number;
  players: Array<Types.ObjectId | null>;
  room?: Types.ObjectId;
  winner?: Types.ObjectId | null;
  /** Round robin: placement per player in this match. */
  placements?: Array<{ user: Types.ObjectId; placement: number }>;
  status: 'pending' | 'ready' | 'playing' | 'done' | 'bye';
  deadline?: Date;
}

export interface ITournament {
  _id: Types.ObjectId;
  campus: string;
  game: string;
  title: string;
  description: string;
  format: 'single_elimination' | 'round_robin';
  status: TournamentStatus;
  createdBy: Types.ObjectId;
  entrants: Types.ObjectId[];
  maxEntrants: number;
  startsAt: Date;
  /** Minutes each match has before an absent player forfeits. */
  matchWindowMinutes: number;
  currentRound: number;
  matches: TournamentMatchDoc[];
  standings: Array<{ user: Types.ObjectId; points: number; played: number }>;
  winner?: Types.ObjectId;
  hubChannel?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

type TournamentModel = Model<ITournament>;

const TournamentSchema = new Schema<ITournament, TournamentModel>(
  {
    campus: { type: String, required: true },
    game: { type: String, required: true },
    title: { type: String, required: true, maxlength: 80 },
    description: { type: String, default: '', maxlength: 1000 },
    format: { type: String, enum: ['single_elimination', 'round_robin'], default: 'single_elimination' },
    status: { type: String, enum: ['registration', 'running', 'finished', 'cancelled'], default: 'registration' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    entrants: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    maxEntrants: { type: Number, default: 16, min: 2, max: 128 },
    startsAt: { type: Date, required: true },
    matchWindowMinutes: { type: Number, default: 30, min: 5, max: 7 * 24 * 60 },
    currentRound: { type: Number, default: 0 },
    matches: [
      new Schema<TournamentMatchDoc>(
        {
          key: { type: String, required: true },
          round: { type: Number, required: true },
          slot: { type: Number, required: true },
          players: [{ type: Schema.Types.ObjectId, ref: 'User' }],
          room: { type: Schema.Types.ObjectId, ref: 'GameRoom' },
          winner: { type: Schema.Types.ObjectId, ref: 'User' },
          placements: [new Schema({ user: { type: Schema.Types.ObjectId, ref: 'User' }, placement: Number }, { _id: false })],
          status: { type: String, enum: ['pending', 'ready', 'playing', 'done', 'bye'], default: 'pending' },
          deadline: { type: Date },
        },
        { _id: false }
      ),
    ],
    standings: [new Schema({ user: { type: Schema.Types.ObjectId, ref: 'User' }, points: Number, played: Number }, { _id: false })],
    winner: { type: Schema.Types.ObjectId, ref: 'User' },
    hubChannel: { type: Schema.Types.ObjectId, ref: 'HubChannel' },
  },
  { timestamps: true }
);

TournamentSchema.index({ campus: 1, status: 1, startsAt: 1 });
TournamentSchema.index({ entrants: 1, status: 1 });

const Tournament = (mongoose.models.Tournament as TournamentModel) || mongoose.model<ITournament, TournamentModel>('Tournament', TournamentSchema);

export default Tournament;
