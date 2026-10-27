/**
 * Education-loan and budget arithmetic. Pure, so the web and native apps show
 * the same numbers.
 */

export interface LoanTerms {
  principal: number;
  /** Annual rate, percent (e.g. 10.5). */
  annualRate: number;
  tenureMonths: number;
  /**
   * Course period plus grace, when interest accrues but no EMI is due. Indian
   * education loans usually capitalise simple interest over this period.
   */
  moratoriumMonths?: number;
  /** Pay the interest during moratorium instead of letting it capitalise. */
  payInterestDuringMoratorium?: boolean;
}

export interface LoanSchedule {
  emi: number;
  /** Principal when repayment starts (after any capitalised interest). */
  repaymentPrincipal: number;
  moratoriumInterest: number;
  totalInterest: number;
  totalPaid: number;
}

/** Standard reducing-balance EMI. */
export function emi(principal: number, annualRate: number, months: number): number {
  if (principal <= 0 || months <= 0) return 0;
  const r = annualRate / 12 / 100;
  if (r === 0) return principal / months;
  const f = (1 + r) ** months;
  return (principal * r * f) / (f - 1);
}

export function loanSchedule(terms: LoanTerms): LoanSchedule {
  const moratorium = Math.max(0, terms.moratoriumMonths ?? 0);
  // Simple interest during the moratorium, as most Indian lenders compute it.
  const moratoriumInterest = terms.principal * (terms.annualRate / 100) * (moratorium / 12);
  const capitalised = terms.payInterestDuringMoratorium ? 0 : moratoriumInterest;
  const repaymentPrincipal = terms.principal + capitalised;
  const monthly = emi(repaymentPrincipal, terms.annualRate, terms.tenureMonths);
  const repaid = monthly * terms.tenureMonths;
  const totalPaid = repaid + (terms.payInterestDuringMoratorium ? moratoriumInterest : 0);
  return {
    emi: round2(monthly),
    repaymentPrincipal: round2(repaymentPrincipal),
    moratoriumInterest: round2(moratoriumInterest),
    totalInterest: round2(totalPaid - terms.principal),
    totalPaid: round2(totalPaid),
  };
}

/** Months to repay with a fixed monthly amount; Infinity if it never covers interest. */
export function monthsToRepay(principal: number, annualRate: number, monthlyPayment: number): number {
  const r = annualRate / 12 / 100;
  if (monthlyPayment <= 0) return Infinity;
  if (r === 0) return Math.ceil(principal / monthlyPayment);
  if (monthlyPayment <= principal * r) return Infinity;
  return Math.ceil(-Math.log(1 - (r * principal) / monthlyPayment) / Math.log(1 + r));
}

export const EXPENSE_CATEGORIES = ['food', 'rent', 'travel', 'books', 'fun', 'shopping', 'health', 'subscriptions', 'loan', 'other'] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_CATEGORY_META: Record<ExpenseCategory, { label: string; emoji: string }> = {
  food: { label: 'Food', emoji: '🍜' },
  rent: { label: 'Rent & hostel', emoji: '🏠' },
  travel: { label: 'Travel', emoji: '🚕' },
  books: { label: 'Books & courses', emoji: '📚' },
  fun: { label: 'Going out', emoji: '🎉' },
  shopping: { label: 'Shopping', emoji: '🛍️' },
  health: { label: 'Health', emoji: '💊' },
  subscriptions: { label: 'Subscriptions', emoji: '📺' },
  loan: { label: 'Loan & EMI', emoji: '🏦' },
  other: { label: 'Other', emoji: '•' },
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
