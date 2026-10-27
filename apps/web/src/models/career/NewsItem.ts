import mongoose, { Schema, type Model, type Types } from 'mongoose';

export const NEWS_CATEGORIES = ['business', 'economy', 'markets', 'policy', 'tech', 'global'] as const;

/** One story in the daily briefing, summarised for interview and GD prep. */
export interface INewsItem {
  _id: Types.ObjectId;
  url: string;
  title: string;
  source: string;
  publishedAt: Date;
  day: string;
  summary: string;
  whyItMatters: string;
  gdAngle: string;
  category: (typeof NEWS_CATEGORIES)[number];
  tags: string[];
  createdAt: Date;
}

type NewsItemModel = Model<INewsItem>;

const NewsItemSchema = new Schema<INewsItem, NewsItemModel>(
  {
    url: { type: String, required: true, maxlength: 1000 },
    title: { type: String, required: true, maxlength: 300 },
    source: { type: String, default: '', maxlength: 80 },
    publishedAt: { type: Date, required: true },
    day: { type: String, required: true },
    summary: { type: String, default: '', maxlength: 1200 },
    whyItMatters: { type: String, default: '', maxlength: 600 },
    gdAngle: { type: String, default: '', maxlength: 400 },
    category: { type: String, enum: NEWS_CATEGORIES, default: 'business' },
    tags: [{ type: String, maxlength: 30 }],
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

NewsItemSchema.index({ url: 1 }, { unique: true });
NewsItemSchema.index({ day: -1, publishedAt: -1 });

const NewsItem = (mongoose.models.NewsItem as NewsItemModel) || mongoose.model<INewsItem, NewsItemModel>('NewsItem', NewsItemSchema);
export default NewsItem;
