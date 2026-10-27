import mongoose, { Schema, type Model, type Types } from 'mongoose';

export interface IJargonTerm {
  _id: Types.ObjectId;
  term: string;
  key: string;
  plainEnglish: string;
  example: string;
  interviewTip: string;
  related: string[];
  category: 'finance' | 'strategy' | 'marketing' | 'operations' | 'economics' | 'tech' | 'hr' | 'general';
  source: 'curated' | 'ai';
  lookups: number;
}

type JargonTermModel = Model<IJargonTerm>;

const JargonTermSchema = new Schema<IJargonTerm, JargonTermModel>({
  term: { type: String, required: true, trim: true, maxlength: 80 },
  key: { type: String, required: true },
  plainEnglish: { type: String, required: true, maxlength: 600 },
  example: { type: String, default: '', maxlength: 600 },
  interviewTip: { type: String, default: '', maxlength: 600 },
  related: [{ type: String, maxlength: 80 }],
  category: { type: String, enum: ['finance', 'strategy', 'marketing', 'operations', 'economics', 'tech', 'hr', 'general'], default: 'general' },
  source: { type: String, enum: ['curated', 'ai'], default: 'curated' },
  lookups: { type: Number, default: 0 },
});

JargonTermSchema.index({ key: 1 }, { unique: true });
JargonTermSchema.index({ term: 'text', plainEnglish: 'text' });

const JargonTerm = (mongoose.models.JargonTerm as JargonTermModel) || mongoose.model<IJargonTerm, JargonTermModel>('JargonTerm', JargonTermSchema);
export default JargonTerm;
