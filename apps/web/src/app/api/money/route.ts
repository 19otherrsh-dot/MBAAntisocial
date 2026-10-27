import { z } from 'zod';
import { Types } from 'mongoose';
import { EXPENSE_CATEGORIES, loanSchedule } from '@mba/shared/money';
import { route, ok } from '@/lib/api/handler';
import MoneyProfile from '@/models/personal/MoneyProfile';
import Expense from '@/models/personal/Expense';
import User from '@/models/User';
import { dayKeyIn } from '@/server/modules/academics/service';

const querySchema = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() });

/** Budget, this month's spending by category, six-month trend, and the loan picture. */
export const GET = route({ feature: 'budget', query: querySchema }, async ({ actor, query }) => {
  const user = await User.findById(actor.id).select('timezone').lean();
  const today = dayKeyIn(new Date(), user?.timezone || 'Asia/Kolkata');
  const month = query.month ?? today.slice(0, 7);
  const sixMonthsAgo = new Date(`${month}-01T00:00:00Z`);
  sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 5);
  const fromDay = sixMonthsAgo.toISOString().slice(0, 10);

  const [profile, expenses, trend] = await Promise.all([
    MoneyProfile.findOne({ user: actor.id }).lean(),
    Expense.find({ user: actor.id, day: { $gte: `${month}-01`, $lte: `${month}-31` } }).sort({ day: -1, createdAt: -1 }).lean(),
    Expense.aggregate<{ _id: string; total: number }>([
      { $match: { user: new Types.ObjectId(actor.id), day: { $gte: fromDay } } },
      { $group: { _id: { $substrBytes: ['$day', 0, 7] }, total: { $sum: '$amount' } } },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const byCategory = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c, 0]));
  for (const e of expenses) byCategory[e.category] += e.amount;
  const spent = expenses.reduce((n, e) => n + e.amount, 0);
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const isCurrent = month === today.slice(0, 7);
  const dayOfMonth = isCurrent ? Number(today.slice(8, 10)) : daysInMonth;
  const budget = profile?.monthlyBudget ?? 0;

  return ok({
    month,
    profile: profile
      ? { currency: profile.currency, monthlyIncome: profile.monthlyIncome, monthlyBudget: profile.monthlyBudget, categoryBudgets: Object.fromEntries(profile.categoryBudgets ?? new Map()), loan: profile.loan ?? null }
      : null,
    summary: {
      spent: Math.round(spent),
      byCategory,
      budget,
      remaining: budget ? Math.round(budget - spent) : null,
      dailyAverage: Math.round(spent / Math.max(1, dayOfMonth)),
      // Straight-line projection for the current month only.
      projected: isCurrent ? Math.round((spent / Math.max(1, dayOfMonth)) * daysInMonth) : Math.round(spent),
      safeToSpendPerDay: budget && isCurrent ? Math.max(0, Math.round((budget - spent) / Math.max(1, daysInMonth - dayOfMonth + 1))) : null,
    },
    trend: trend.map((t) => ({ month: t._id, total: Math.round(t.total) })),
    expenses: expenses.map((e) => ({ _id: String(e._id), amount: e.amount, category: e.category, note: e.note, day: e.day })),
    loan: profile?.loan ? loanSchedule(profile.loan) : null,
  });
});

const profileSchema = z.object({
  monthlyIncome: z.number().min(0).max(10_000_000).optional(),
  monthlyBudget: z.number().min(0).max(10_000_000).optional(),
  categoryBudgets: z.record(z.enum(EXPENSE_CATEGORIES), z.number().min(0).max(10_000_000)).optional(),
  loan: z
    .object({
      principal: z.number().min(0).max(100_000_000),
      annualRate: z.number().min(0).max(40),
      tenureMonths: z.number().int().min(1).max(360),
      moratoriumMonths: z.number().int().min(0).max(72).default(0),
      payInterestDuringMoratorium: z.boolean().default(false),
      lender: z.string().trim().max(60).default(''),
    })
    .nullable()
    .optional(),
});

export const PUT = route({ feature: 'budget', body: profileSchema, rateLimit: 'write' }, async ({ actor, body }) => {
  const set: Record<string, unknown> = {};
  const unset: Record<string, ''> = {};
  if (body.monthlyIncome !== undefined) set.monthlyIncome = body.monthlyIncome;
  if (body.monthlyBudget !== undefined) set.monthlyBudget = body.monthlyBudget;
  if (body.categoryBudgets) set.categoryBudgets = body.categoryBudgets;
  if (body.loan === null) unset.loan = '';
  else if (body.loan) set.loan = body.loan;
  await MoneyProfile.updateOne({ user: actor.id }, { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) }, { upsert: true });
  return ok({ ok: true });
});
