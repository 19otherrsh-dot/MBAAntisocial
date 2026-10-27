import mongoose, { Schema, type Model, type Types } from 'mongoose';

export const WIKI_SECTIONS = ['overview', 'process', 'roles', 'prep', 'culture'] as const;
export type WikiSection = (typeof WIKI_SECTIONS)[number];

/** A campus's shared, editable notes on one recruiter. Every edit is kept. */
export interface ICompanyPage {
  _id: Types.ObjectId;
  campus: string;
  key: string;
  name: string;
  website: string;
  sector: string;
  sections: Record<WikiSection, string>;
  revisions: Array<{ editor: Types.ObjectId; section: WikiSection; summary: string; previous: string; at: Date }>;
  updatedAt: Date;
  createdAt: Date;
}

type CompanyPageModel = Model<ICompanyPage>;

const CompanyPageSchema = new Schema<ICompanyPage, CompanyPageModel>(
  {
    campus: { type: String, required: true },
    key: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    website: { type: String, default: '', maxlength: 300 },
    sector: { type: String, default: '', maxlength: 60 },
    sections: {
      overview: { type: String, default: '', maxlength: 8000 },
      process: { type: String, default: '', maxlength: 8000 },
      roles: { type: String, default: '', maxlength: 8000 },
      prep: { type: String, default: '', maxlength: 8000 },
      culture: { type: String, default: '', maxlength: 8000 },
    },
    revisions: [
      new Schema(
        {
          editor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
          section: { type: String, required: true },
          summary: { type: String, default: '', maxlength: 200 },
          previous: { type: String, default: '', maxlength: 8000 },
          at: { type: Date, default: Date.now },
        },
        { _id: false }
      ),
    ],
  },
  { timestamps: true }
);

CompanyPageSchema.index({ campus: 1, key: 1 }, { unique: true });
CompanyPageSchema.index({ campus: 1, updatedAt: -1 });

const CompanyPage = (mongoose.models.CompanyPage as CompanyPageModel) || mongoose.model<ICompanyPage, CompanyPageModel>('CompanyPage', CompanyPageSchema);
export default CompanyPage;
