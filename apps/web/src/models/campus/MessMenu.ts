import mongoose, { Schema, type Model, type Types } from 'mongoose';

export const MEALS = ['breakfast', 'lunch', 'snacks', 'dinner'] as const;
export type Meal = (typeof MEALS)[number];

/** One mess's menu for one week (Monday start), plus ratings people leave. */
export interface IMessMenu {
  _id: Types.ObjectId;
  campus: string;
  mess: string;
  /** YYYY-MM-DD of the Monday. */
  weekStart: string;
  days: Array<Record<Meal, string[]>>;
  updatedBy?: Types.ObjectId;
}

type MessMenuModel = Model<IMessMenu>;

const DaySchema = new Schema(
  { breakfast: [{ type: String, maxlength: 60 }], lunch: [{ type: String, maxlength: 60 }], snacks: [{ type: String, maxlength: 60 }], dinner: [{ type: String, maxlength: 60 }] },
  { _id: false }
);

const MessMenuSchema = new Schema<IMessMenu, MessMenuModel>(
  {
    campus: { type: String, required: true },
    mess: { type: String, required: true, trim: true, maxlength: 60 },
    weekStart: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    days: { type: [DaySchema], validate: (v: unknown[]) => v.length === 7 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

MessMenuSchema.index({ campus: 1, mess: 1, weekStart: 1 }, { unique: true });

const MessMenu = (mongoose.models.MessMenu as MessMenuModel) || mongoose.model<IMessMenu, MessMenuModel>('MessMenu', MessMenuSchema);
export default MessMenu;
