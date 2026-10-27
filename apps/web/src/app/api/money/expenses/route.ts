import { z } from 'zod';
import { EXPENSE_CATEGORIES } from '@mba/shared/money';
import { route, created } from '@/lib/api/handler';
import Expense from '@/models/personal/Expense';

const schema = z.object({
  amount: z.number().positive().max(10_000_000),
  category: z.enum(EXPENSE_CATEGORIES).default('other'),
  note: z.string().trim().max(120).default(''),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const POST = route({ feature: 'budget', body: schema, rateLimit: 'write' }, async ({ actor, body }) => {
  const expense = await Expense.create({ ...body, user: actor.id });
  return created({ expense: { _id: String(expense._id), amount: expense.amount, category: expense.category, note: expense.note, day: expense.day } });
});
