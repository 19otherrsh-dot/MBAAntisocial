'use client';

import { useMemo, useState } from 'react';
import { Landmark, Plus, Settings2, Trash2, Wallet } from 'lucide-react';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_META, loanSchedule, type ExpenseCategory } from '@mba/shared/money';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { Input, Switch } from '@/components/ui/Field';
import { Banner, Stat } from '@/components/ui/Display';
import { useToast } from '@/components/ui/Toast';
import { useApiQuery } from '@/lib/client/hooks';
import { api, errorMessage } from '@/lib/client/api';
import { cn, formatDate } from '@/lib/utils';
import ps from '@/components/personal/personal.module.css';
import styles from '../app.module.css';

interface Loan { principal: number; annualRate: number; tenureMonths: number; moratoriumMonths: number; payInterestDuringMoratorium: boolean; lender: string }
interface MoneyData {
  month: string;
  profile: { currency: string; monthlyIncome: number; monthlyBudget: number; categoryBudgets: Partial<Record<ExpenseCategory, number>>; loan: Loan | null } | null;
  summary: { spent: number; byCategory: Record<ExpenseCategory, number>; budget: number; remaining: number | null; dailyAverage: number; projected: number; safeToSpendPerDay: number | null };
  trend: Array<{ month: string; total: number }>;
  expenses: Array<{ _id: string; amount: number; category: ExpenseCategory; note: string; day: string }>;
  loan: { emi: number; repaymentPrincipal: number; moratoriumInterest: number; totalInterest: number; totalPaid: number } | null;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const todayKey = () => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

export default function MoneyPage() {
  const toast = useToast();
  const { data, refetch } = useApiQuery<MoneyData>('/api/money');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('food');
  const [note, setNote] = useState('');
  const [day, setDay] = useState(todayKey);
  const [adding, setAdding] = useState(false);
  const [settings, setSettings] = useState<null | 'budget' | 'loan'>(null);

  const add = async () => {
    const value = Number(amount);
    if (!value || value <= 0) return;
    setAdding(true);
    try {
      await api.post('/api/money/expenses', { amount: value, category, note, day });
      setAmount('');
      setNote('');
      refetch();
    } catch (caught) {
      toast.error('Could not add it', errorMessage(caught));
    } finally {
      setAdding(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await api.delete(`/api/money/expenses/${id}`);
      refetch();
    } catch (caught) {
      toast.error('Could not delete', errorMessage(caught));
    }
  };

  const s = data?.summary;
  const maxCategory = useMemo(() => Math.max(1, ...EXPENSE_CATEGORIES.map((c) => Math.max(s?.byCategory[c] ?? 0, data?.profile?.categoryBudgets[c] ?? 0))), [s, data]);
  const maxTrend = Math.max(1, ...(data?.trend.map((t) => t.total) ?? [0]));

  return (
    <div className="stack gap-5">
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.pageTitle}>Money</h1>
          <p className={styles.pageSubtitle}>Track spending against a budget, and see exactly what your education loan will cost. Private to you.</p>
        </div>
        <div className="row gap-2">
          <Button variant="ghost" icon={<Settings2 size={15} />} onClick={() => setSettings('budget')}>Budget</Button>
          <Button variant="ghost" icon={<Landmark size={15} />} onClick={() => setSettings('loan')}>Loan</Button>
        </div>
      </div>

      {!data || !s ? (
        <div className="skeleton" style={{ height: 360 }} />
      ) : (
        <>
          <div className="row gap-5 wrap">
            <Stat value={inr(s.spent)} label="Spent this month" meta={s.budget ? `of ${inr(s.budget)}` : 'no budget set'} />
            {s.remaining !== null && <Stat value={inr(s.remaining)} label={s.remaining >= 0 ? 'Left' : 'Over budget'} tone={s.remaining >= 0 ? undefined : 'rose'} />}
            {s.safeToSpendPerDay !== null && <Stat value={inr(s.safeToSpendPerDay)} label="Safe per day" meta="for the rest of the month" />}
            <Stat value={inr(s.projected)} label="On track for" meta={`${inr(s.dailyAverage)}/day so far`} />
          </div>
          {s.budget > 0 && s.projected > s.budget && (
            <Banner variant="warning" title="Heading over budget">At this pace you will spend {inr(s.projected - s.budget)} more than planned this month.</Banner>
          )}

          <form className={ps.quickAdd} onSubmit={(e) => { e.preventDefault(); void add(); }}>
            <div style={{ width: 120 }}><Input label="Amount (₹)" type="number" inputMode="decimal" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div style={{ flex: '1 1 180px' }}><Input label="Note" optional placeholder="Dinner at Ashram Road" value={note} onChange={(e) => setNote(e.target.value)} /></div>
            <div style={{ width: 160 }}><Input label="Date" type="date" value={day} max={todayKey()} onChange={(e) => setDay(e.target.value)} /></div>
            <Button type="submit" icon={<Plus size={15} />} loading={adding} disabled={!amount}>Add</Button>
            <div className={ps.chips} style={{ flexBasis: '100%' }} role="radiogroup" aria-label="Category">
              {EXPENSE_CATEGORIES.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={category === c} className={cn(ps.chip, category === c && ps.chipOn)} onClick={() => setCategory(c)}>
                  {EXPENSE_CATEGORY_META[c].emoji} {EXPENSE_CATEGORY_META[c].label}
                </button>
              ))}
            </div>
          </form>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--s-5)' }}>
            <section className={styles.section}>
              <div className={styles.sectionHead}>By category</div>
              <div className={ps.bars}>
                {EXPENSE_CATEGORIES.filter((c) => s.byCategory[c] > 0 || data.profile?.categoryBudgets[c]).map((c) => {
                  const spent = s.byCategory[c];
                  const cap = data.profile?.categoryBudgets[c];
                  return (
                    <div key={c} className={ps.barRow} title={`${EXPENSE_CATEGORY_META[c].label}: ${inr(spent)}${cap ? ` of ${inr(cap)}` : ''}`}>
                      <span className="truncate">{EXPENSE_CATEGORY_META[c].emoji} {EXPENSE_CATEGORY_META[c].label}</span>
                      <div className={ps.barTrack}>
                        <div className={cn(ps.barFill, cap !== undefined && spent > cap && ps.barOver)} style={{ width: `${(spent / maxCategory) * 100}%` }} />
                        {cap ? <span className={ps.budgetMark} style={{ left: `${(cap / maxCategory) * 100}%` }} aria-hidden /> : null}
                      </div>
                      <span className={ps.barValue}>
                        {inr(spent)}
                        {cap ? <span className="sr-only"> of a {inr(cap)} budget</span> : null}
                      </span>
                    </div>
                  );
                })}
                {s.spent === 0 && <p className="dim" style={{ fontSize: 'var(--t-sm)' }}>Nothing logged this month yet.</p>}
              </div>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHead}>Last six months</div>
              {data.trend.length === 0 ? <p className="dim" style={{ fontSize: 'var(--t-sm)' }}>Your monthly totals will show here.</p> : (
                <div className={ps.trend} role="list" aria-label="Monthly spending">
                  {data.trend.map((t) => (
                    <div key={t.month} role="listitem" className={cn(ps.trendCol, t.month === data.month && ps.trendCurrent)} aria-label={`${t.month}: ${inr(t.total)}`}>
                      <span className={ps.trendValue}>{inr(t.total)}</span>
                      <div className={ps.trendBar} style={{ height: `${Math.max(2, (t.total / maxTrend) * 100)}%` }} />
                      <span className={ps.trendLabel}>{new Date(`${t.month}-01`).toLocaleDateString('en-IN', { month: 'short' })}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {data.loan && data.profile?.loan && (
            <section className={styles.section}>
              <div className={styles.sectionHead}><Landmark size={15} /> Education loan{data.profile.loan.lender ? ` · ${data.profile.loan.lender}` : ''}</div>
              <div className="row gap-5 wrap">
                <Stat value={inr(data.loan.emi)} label="Monthly EMI" meta={`${data.profile.loan.tenureMonths} months at ${data.profile.loan.annualRate}%`} />
                <Stat value={inr(data.loan.totalInterest)} label="Total interest" />
                {data.loan.moratoriumInterest > 0 && <Stat value={inr(data.loan.moratoriumInterest)} label="Moratorium interest" meta={data.profile.loan.payInterestDuringMoratorium ? 'paid as you go' : 'added to the loan'} />}
              </div>
              {!data.profile.loan.payInterestDuringMoratorium && data.loan.moratoriumInterest > 0 && (
                <p className="muted" style={{ fontSize: 'var(--t-sm)' }}>
                  Paying the moratorium interest as it accrues would cut your EMI to {inr(loanSchedule({ ...data.profile.loan, payInterestDuringMoratorium: true }).emi)} and save {inr(data.loan.totalPaid - loanSchedule({ ...data.profile.loan, payInterestDuringMoratorium: true }).totalPaid)} overall.
                </p>
              )}
            </section>
          )}

          <section className={styles.section}>
            <div className={styles.sectionHead}><Wallet size={15} /> This month</div>
            <div className={ps.list}>
              {data.expenses.length === 0 && <p className="dim" style={{ fontSize: 'var(--t-sm)' }}>No expenses yet.</p>}
              {data.expenses.map((e) => (
                <div key={e._id} className={ps.listRow}>
                  <span style={{ width: 24 }}>{EXPENSE_CATEGORY_META[e.category].emoji}</span>
                  <span style={{ flex: 1, minWidth: 0 }} className="truncate">{e.note || EXPENSE_CATEGORY_META[e.category].label}</span>
                  <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>{formatDate(e.day)}</span>
                  <strong style={{ width: 90, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{inr(e.amount)}</strong>
                  <button aria-label="Delete expense" className="dim" onClick={() => remove(e._id)}><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {settings === 'budget' && data && <BudgetDialog data={data} onClose={() => setSettings(null)} onSaved={() => { setSettings(null); refetch(); }} />}
      {settings === 'loan' && data && <LoanDialog loan={data.profile?.loan ?? null} onClose={() => setSettings(null)} onSaved={() => { setSettings(null); refetch(); }} />}
    </div>
  );
}

function BudgetDialog({ data, onClose, onSaved }: { data: MoneyData; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [income, setIncome] = useState(String(data.profile?.monthlyIncome || ''));
  const [budget, setBudget] = useState(String(data.profile?.monthlyBudget || ''));
  const [caps, setCaps] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(data.profile?.categoryBudgets ?? {}).map(([k, v]) => [k, String(v)])));
  const save = async () => {
    try {
      await api.put('/api/money', {
        monthlyIncome: Number(income) || 0,
        monthlyBudget: Number(budget) || 0,
        categoryBudgets: Object.fromEntries(Object.entries(caps).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)])),
      });
      onSaved();
    } catch (caught) {
      toast.error('Could not save', errorMessage(caught));
    }
  };
  return (
    <Dialog open onClose={onClose} title="Monthly budget" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save}>Save</Button></>}>
      <div className="row gap-3 wrap">
        <Input label="Monthly income / allowance (₹)" type="number" min={0} value={income} onChange={(e) => setIncome(e.target.value)} />
        <Input label="Monthly budget (₹)" type="number" min={0} value={budget} onChange={(e) => setBudget(e.target.value)} />
      </div>
      <span className="dim" style={{ fontSize: 'var(--t-xs)' }}>Optional caps per category</span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        {EXPENSE_CATEGORIES.map((c) => (
          <Input key={c} label={`${EXPENSE_CATEGORY_META[c].emoji} ${EXPENSE_CATEGORY_META[c].label}`} type="number" min={0} value={caps[c] ?? ''} onChange={(e) => setCaps({ ...caps, [c]: e.target.value })} />
        ))}
      </div>
    </Dialog>
  );
}

function LoanDialog({ loan, onClose, onSaved }: { loan: Loan | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({
    principal: String(loan?.principal ?? ''),
    annualRate: String(loan?.annualRate ?? '10.5'),
    tenureMonths: String(loan?.tenureMonths ?? '120'),
    moratoriumMonths: String(loan?.moratoriumMonths ?? '30'),
    payInterestDuringMoratorium: loan?.payInterestDuringMoratorium ?? false,
    lender: loan?.lender ?? '',
  });
  const numbers = { principal: Number(form.principal) || 0, annualRate: Number(form.annualRate) || 0, tenureMonths: Math.max(1, Number(form.tenureMonths) || 1), moratoriumMonths: Number(form.moratoriumMonths) || 0, payInterestDuringMoratorium: form.payInterestDuringMoratorium };
  const preview = numbers.principal > 0 ? loanSchedule(numbers) : null;
  const save = async (clear = false) => {
    try {
      await api.put('/api/money', { loan: clear ? null : { ...numbers, lender: form.lender } });
      onSaved();
    } catch (caught) {
      toast.error('Could not save', errorMessage(caught));
    }
  };
  return (
    <Dialog open onClose={onClose} title="Education loan" description="Simple interest accrues during the moratorium (course + grace period) and is usually added to the loan."
      footer={<>{loan && <Button variant="ghost" onClick={() => save(true)}>Remove loan</Button>}<Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={() => save()} disabled={!preview}>Save</Button></>}>
      <div className="row gap-3 wrap">
        <Input label="Loan amount (₹)" type="number" min={0} value={form.principal} onChange={(e) => setForm({ ...form, principal: e.target.value })} />
        <Input label="Interest rate (% a year)" type="number" step="0.05" min={0} value={form.annualRate} onChange={(e) => setForm({ ...form, annualRate: e.target.value })} />
      </div>
      <div className="row gap-3 wrap">
        <Input label="Repayment months" type="number" min={1} value={form.tenureMonths} onChange={(e) => setForm({ ...form, tenureMonths: e.target.value })} />
        <Input label="Moratorium months" type="number" min={0} value={form.moratoriumMonths} onChange={(e) => setForm({ ...form, moratoriumMonths: e.target.value })} />
        <Input label="Lender" optional value={form.lender} onChange={(e) => setForm({ ...form, lender: e.target.value })} />
      </div>
      <Switch checked={form.payInterestDuringMoratorium} onChange={(v) => setForm({ ...form, payInterestDuringMoratorium: v })} label="I pay the interest during the moratorium" />
      {preview && (
        <Banner variant="info" title={`EMI ${inr(preview.emi)} a month`}>
          Total interest {inr(preview.totalInterest)} · you repay {inr(preview.totalPaid)} in all{preview.moratoriumInterest > 0 && !form.payInterestDuringMoratorium ? ` · repayment starts on ${inr(preview.repaymentPrincipal)}` : ''}.
        </Banner>
      )}
    </Dialog>
  );
}
