import mongoose, { Schema, type Model, type Types } from 'mongoose';
import { RESOURCE_KINDS, type ResourceKind } from '@/lib/constants';

/**
 * A shared study resource — class notes, a summary, a past paper.
 *
 * Named `Resource` rather than `Note` because §6.5 scopes this module away from
 * current gradable submissions on academic-integrity grounds; `kind` has no
 * value representing one, so there is no path to upload work that is still
 * being marked.
 */
export interface IResource {
  _id: Types.ObjectId;
  author: Types.ObjectId;
  campus: string;

  title: string;
  description: string;
  course: string;
  professor: string;
  term: string;
  kind: ResourceKind;

  fileUrl: string;
  fileName: string;
  fileType: string;
  fileSize: number;

  tags: string[];
  upvotes: Types.ObjectId[];
  upvoteCount: number;
  downloads: number;

  version: number;
  versionHistory: Array<{
    version: number;
    fileUrl: string;
    fileName: string;
    fileSize: number;
    note: string;
    replacedAt: Date;
  }>;

  /** Uploader affirmed the sharing policy for this specific upload. */
  honorCodeAffirmed: boolean;

  hiddenAt?: Date;
  hiddenBy?: Types.ObjectId;
  hiddenReason: string;

  createdAt: Date;
  updatedAt: Date;
}

type ResourceModel = Model<IResource>;

const ResourceSchema = new Schema<IResource, ResourceModel>(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    campus: { type: String, required: true },

    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', maxlength: 1000 },
    course: { type: String, required: true, trim: true, maxlength: 100 },
    professor: { type: String, default: '', trim: true, maxlength: 100 },
    term: { type: String, required: true, trim: true, maxlength: 40 },
    kind: { type: String, enum: RESOURCE_KINDS, default: 'class_notes' },

    fileUrl: { type: String, required: true, maxlength: 2000 },
    fileName: { type: String, required: true, maxlength: 260 },
    fileType: { type: String, required: true, maxlength: 10 },
    fileSize: { type: Number, required: true, min: 0 },

    tags: [{ type: String, trim: true, lowercase: true, maxlength: 30 }],
    upvotes: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    // Maintained alongside the array so sorting by popularity is an index scan
    // rather than an aggregation over every document.
    upvoteCount: { type: Number, default: 0, min: 0 },
    downloads: { type: Number, default: 0, min: 0 },

    version: { type: Number, default: 1, min: 1 },
    versionHistory: [
      {
        _id: false,
        version: { type: Number, required: true },
        fileUrl: { type: String, required: true },
        fileName: { type: String, default: '' },
        fileSize: { type: Number, default: 0 },
        note: { type: String, default: '', maxlength: 300 },
        replacedAt: { type: Date, default: Date.now },
      },
    ],

    honorCodeAffirmed: { type: Boolean, required: true },

    hiddenAt: { type: Date },
    hiddenBy: { type: Schema.Types.ObjectId, ref: 'User' },
    hiddenReason: { type: String, default: '', maxlength: 500 },
  },
  { timestamps: true }
);

ResourceSchema.index({ campus: 1, course: 1, createdAt: -1 });
ResourceSchema.index({ campus: 1, upvoteCount: -1 });
ResourceSchema.index({ author: 1, createdAt: -1 });
ResourceSchema.index(
  { title: 'text', description: 'text', course: 'text', tags: 'text' },
  { weights: { title: 10, course: 6, tags: 4, description: 1 }, name: 'resource_search' }
);

const Resource =
  (mongoose.models.Resource as ResourceModel) ||
  mongoose.model<IResource, ResourceModel>('Resource', ResourceSchema);

export default Resource;
