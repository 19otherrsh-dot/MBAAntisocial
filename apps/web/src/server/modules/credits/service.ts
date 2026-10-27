import CreditTransaction, { type CreditReason } from '@/models/CreditTransaction';
import User from '@/models/User';
import { ApiError } from '@/lib/api/errors';
import { notify } from '@/lib/notifications';

/** What giving time earns, and what perks cost. */
export const CREDIT_EARN: Partial<Record<CreditReason, number>> = {
  session_hosted: 10,
  gd_moderated: 6,
  referral_given: 10,
};

export const CREDIT_COST: Partial<Record<CreditReason, number>> = {
  referral_priority: 15,
  listing_boost: 5,
  priority_booking: 8,
};

export const CREDIT_PERKS: Array<{ reason: CreditReason; label: string; blurb: string }> = [
  { reason: 'referral_priority', label: 'Priority referral request', blurb: 'Your request to an alum goes to the top of their list.' },
  { reason: 'priority_booking', label: 'Extra booking', blurb: 'Hold one more live mock booking than usual, for a week.' },
  { reason: 'listing_boost', label: 'Marketplace boost', blurb: 'Pin a listing to the top for three days.' },
];

/**
 * Credits for giving time. Idempotent per entity: completing the same session
 * twice cannot pay twice (unique index), and a duplicate is not an error.
 */
export async function earnCredits(userId: string, reason: CreditReason, entityId?: string, note = '') {
  const amount = CREDIT_EARN[reason];
  if (!amount) return 0;
  try {
    await CreditTransaction.create({ user: userId, amount, reason, entity: entityId, note });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return 0;
    throw error;
  }
  await User.updateOne({ _id: userId }, { $inc: { credits: amount } });
  await notify({
    user: userId,
    kind: 'credit_earned',
    title: `+${amount} credits`,
    body: 'Spend them on priority referrals, early booking, or a marketplace boost.',
    href: '/me',
  });
  return amount;
}

/**
 * Spends credits atomically: the balance check and the debit are one update,
 * so two concurrent spends cannot take the balance below zero.
 */
export async function spendCredits(userId: string, reason: CreditReason, entityId?: string) {
  const cost = CREDIT_COST[reason];
  if (!cost) throw ApiError.badRequest('That is not something credits can buy.');
  const updated = await User.findOneAndUpdate(
    { _id: userId, credits: { $gte: cost } },
    { $inc: { credits: -cost } },
    { new: true }
  ).select('credits');
  if (!updated) throw ApiError.unprocessable(`That needs ${cost} credits. Host a session to earn more.`);
  try {
    await CreditTransaction.create({ user: userId, amount: -cost, reason, entity: entityId });
  } catch (error) {
    // Already bought for this entity: refund the debit we just made.
    await User.updateOne({ _id: userId }, { $inc: { credits: cost } });
    if ((error as { code?: number }).code === 11000) throw ApiError.conflict('You already used credits on this.');
    throw error;
  }
  return updated.credits;
}

/** Whether the user holds an unexpired priority-booking perk. */
export async function hasPriorityBooking(userId: string): Promise<boolean> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return Boolean(await CreditTransaction.exists({ user: userId, reason: 'priority_booking', createdAt: { $gte: since } }));
}

export async function creditHistory(userId: string, limit = 30) {
  return CreditTransaction.find({ user: userId }).sort({ createdAt: -1 }).limit(limit).lean();
}
