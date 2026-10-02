import mongoose, { Schema, type Model, type Types } from 'mongoose';
import {
  POST_CATEGORIES,
  REACTION_KINDS,
  MAX_POST_LENGTH,
  MAX_COMMENT_LENGTH,
  type PostCategory,
  type ReactionKind,
} from '@/lib/constants';

export interface IComment {
  _id: Types.ObjectId;
  author: Types.ObjectId;
  content: string;
  /** OP can mark a reply as the one that actually answered the question. */
  markedUseful: boolean;
  hiddenAt?: Date;
  createdAt: Date;
}

export interface IPost {
  _id: Types.ObjectId;
  author: Types.ObjectId;
  campus: string;
  batch: string;

  content: string;
  category: PostCategory;
  /** Attached links, rendered as cards. No image host is wired up yet. */
  links: string[];

  /**
   * One array of voter ids per reaction kind, stored as a Map so a new kind in
   * `constants.ts` needs no schema change.
   */
  reactions: Map<ReactionKind, Types.ObjectId[]>;
  comments: IComment[];
  commentCount: number;

  /** Set when a post is answered, so "Ask" posts can be filtered to open ones. */
  resolvedAt?: Date;

  hiddenAt?: Date;
  hiddenBy?: Types.ObjectId;
  hiddenReason: string;

  createdAt: Date;
  updatedAt: Date;
}

type PostModel = Model<IPost>;

const CommentSchema = new Schema<IComment>(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true, trim: true, maxlength: MAX_COMMENT_LENGTH },
    markedUseful: { type: Boolean, default: false },
    hiddenAt: { type: Date },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const PostSchema = new Schema<IPost, PostModel>(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    campus: { type: String, required: true },
    batch: { type: String, default: '' },

    content: { type: String, required: true, trim: true, maxlength: MAX_POST_LENGTH },
    category: { type: String, enum: POST_CATEGORIES, default: 'general' },
    links: [{ type: String, maxlength: 2000 }],

    reactions: {
      type: Map,
      of: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      default: () => new Map(REACTION_KINDS.map((kind) => [kind, []])),
    },
    comments: { type: [CommentSchema], default: [] },
    commentCount: { type: Number, default: 0, min: 0 },

    resolvedAt: { type: Date },

    hiddenAt: { type: Date },
    hiddenBy: { type: Schema.Types.ObjectId, ref: 'User' },
    hiddenReason: { type: String, default: '', maxlength: 500 },
  },
  { timestamps: true }
);

// The feed read path: one campus, newest first, optionally by category.
PostSchema.index({ campus: 1, hiddenAt: 1, createdAt: -1 });
PostSchema.index({ campus: 1, category: 1, createdAt: -1 });
PostSchema.index({ author: 1, createdAt: -1 });

const Post =
  (mongoose.models.Post as PostModel) || mongoose.model<IPost, PostModel>('Post', PostSchema);

export default Post;
