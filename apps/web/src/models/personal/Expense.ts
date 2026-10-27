import mongoose, { Schema, type Model, type Types } from 'mongoose';
import { EXPENSE_CATEGORIES } from '@mba/shared/money';

export interface IExpense {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  amount: number;
  category: (typeof EXPENSE_CATEGORIES)[number];
  note: string;
  /** YYYY-MM-DD. */
  day: string;
  createdAt: Date;
}

type ExpenseModel = Model<IExpense>;

const ExpenseSchema = new Schema<IExpense, ExpenseModel>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true, min: 0.01, max: 10_000_000 },
    category: { type: String, enum: EXPENSE_CATEGORIES, default: 'other' },
    note: { type: String, default: '', trim: true, maxlength: 120 },
    day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ExpenseSchema.index({ user: 1, day: -1 });

const Expense = (mongoose.models.Expense as ExpenseModel) || mongoose.model<IExpense, ExpenseModel>('Expense', ExpenseSchema);
export default Expense;
