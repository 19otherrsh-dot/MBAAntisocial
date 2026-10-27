import mongoose, { Schema, type Model, type Types } from 'mongoose';

/** Private budget settings and loan terms. Never shown to anyone else. */
export interface IMoneyProfile {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  currency: string;
  monthlyIncome: number;
  monthlyBudget: number;
  categoryBudgets: Map<string, number>;
  loan?: {
    principal: number;
    annualRate: number;
    tenureMonths: number;
    moratoriumMonths: number;
    payInterestDuringMoratorium: boolean;
    lender: string;
  };
}

type MoneyProfileModel = Model<IMoneyProfile>;

const MoneyProfileSchema = new Schema<IMoneyProfile, MoneyProfileModel>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  currency: { type: String, default: 'INR', maxlength: 3 },
  monthlyIncome: { type: Number, default: 0, min: 0 },
  monthlyBudget: { type: Number, default: 0, min: 0 },
  categoryBudgets: { type: Map, of: Number, default: {} },
  loan: {
    type: new Schema(
      {
        principal: { type: Number, min: 0, required: true },
        annualRate: { type: Number, min: 0, max: 40, required: true },
        tenureMonths: { type: Number, min: 1, max: 360, required: true },
        moratoriumMonths: { type: Number, min: 0, max: 72, default: 0 },
        payInterestDuringMoratorium: { type: Boolean, default: false },
        lender: { type: String, default: '', maxlength: 60 },
      },
      { _id: false }
    ),
    required: false,
  },
});

const MoneyProfile = (mongoose.models.MoneyProfile as MoneyProfileModel) || mongoose.model<IMoneyProfile, MoneyProfileModel>('MoneyProfile', MoneyProfileSchema);
export default MoneyProfile;
