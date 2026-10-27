import Course from '../../src/models/academics/Course';
import ClassSlot from '../../src/models/academics/ClassSlot';
import AttendanceMark from '../../src/models/academics/AttendanceMark';
import MoneyProfile from '../../src/models/personal/MoneyProfile';
import Expense from '../../src/models/personal/Expense';
import CheckIn from '../../src/models/personal/CheckIn';
import User from '../../src/models/User';
import type { SeedContext } from './index';

const dayKey = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const weekday = (offset: number) => (new Date(Date.now() + offset * 86_400_000).getUTCDay() + 6) % 7;

/** A first-year's term: courses, timetable, attendance, grades, a budget, and check-ins. */
export async function run({ users }: SeedContext): Promise<string> {
  const sneha = users.find((u) => u.email.startsWith('sneha@'));
  if (!sneha) return 'skipped';
  const id = sneha._id;
  await Promise.all([Course.deleteMany({ user: id }), ClassSlot.deleteMany({ user: id }), AttendanceMark.deleteMany({ user: id }), MoneyProfile.deleteMany({ user: id }), Expense.deleteMany({ user: id }), CheckIn.deleteMany({ user: id })]);
  await User.updateOne({ _id: id }, { $set: { 'academicSettings.currentTerm': 'Term 3', 'academicSettings.gradeScale': '4.33' } });

  const courses = await Course.insertMany([
    { user: id, term: 'Term 3', code: 'FIN-301', name: 'Corporate Finance', professor: 'Prof. Mehta', credits: 3, color: '#5b4bdb', plannedSessions: 26, components: [{ name: 'Quizzes', weight: 20, score: 16, max: 20 }, { name: 'Mid-term', weight: 30, score: 21, max: 30 }, { name: 'Final', weight: 50, max: 100 }] },
    { user: id, term: 'Term 3', code: 'MKT-302', name: 'Marketing Strategy', professor: 'Prof. Iyer', credits: 3, color: '#d9480f', plannedSessions: 24, components: [{ name: 'Group project', weight: 40, score: 34, max: 40 }, { name: 'Class participation', weight: 20, score: 15, max: 20 }, { name: 'End-term', weight: 40, max: 100 }] },
    { user: id, term: 'Term 3', code: 'OPS-303', name: 'Operations Management', professor: 'Prof. Rao', credits: 3, color: '#0c8599', plannedSessions: 24, components: [{ name: 'Case write-ups', weight: 30, score: 22, max: 30 }, { name: 'Final', weight: 70, max: 100 }] },
    { user: id, term: 'Term 3', code: 'OB-304', name: 'Organisational Behaviour', professor: 'Prof. Das', credits: 1.5, color: '#2b8a3e', plannedSessions: 12, components: [] },
    { user: id, term: 'Term 2', code: 'ECO-201', name: 'Macroeconomics', credits: 3, color: '#6741d9', grade: 'A-' },
    { user: id, term: 'Term 2', code: 'ACC-202', name: 'Financial Accounting', credits: 3, color: '#a61e4d', grade: 'B+' },
  ]);
  const [fin, mkt, ops, ob] = courses;
  const slots = await ClassSlot.insertMany([
    { user: id, course: fin._id, day: 0, start: '09:00', end: '10:30', room: 'C-12' },
    { user: id, course: fin._id, day: 3, start: '09:00', end: '10:30', room: 'C-12' },
    { user: id, course: mkt._id, day: 0, start: '11:00', end: '12:30', room: 'C-14' },
    { user: id, course: mkt._id, day: 2, start: '14:00', end: '15:30', room: 'C-14' },
    { user: id, course: ops._id, day: 1, start: '09:00', end: '10:30', room: 'D-03' },
    { user: id, course: ops._id, day: 4, start: '11:00', end: '12:30', room: 'D-03' },
    { user: id, course: ob._id, day: 2, start: '09:00', end: '10:30', room: 'Seminar hall' },
    { user: id, course: ob._id, day: weekday(0), start: '16:00', end: '17:00', room: 'Seminar hall' },
  ]);
  // Six weeks of history: mostly present, a few misses, a lot of them in marketing.
  const marks = [];
  for (let offset = -42; offset < 0; offset += 1) {
    for (const s of slots.filter((x) => x.day === weekday(offset))) {
      const roll = (offset * 7 + s.day * 13) % 10;
      const missed = String(s.course) === String(mkt._id) ? roll < 3 : roll === 0;
      marks.push({ user: id, course: s.course, day: dayKey(offset), slot: s._id, status: missed ? 'absent' : 'present' });
    }
  }
  await AttendanceMark.insertMany(marks);

  await MoneyProfile.create({ user: id, monthlyIncome: 25000, monthlyBudget: 18000, categoryBudgets: { food: 7000, travel: 3000, fun: 3000 }, loan: { principal: 2_300_000, annualRate: 9.85, tenureMonths: 120, moratoriumMonths: 30, payInterestDuringMoratorium: false, lender: 'SBI Scholar' } });
  const spends = [
    ['food', 420, 'Dinner at Ashram Road'], ['travel', 180, 'Auto to the station'], ['food', 95, 'Night canteen'], ['books', 650, 'Case pack'], ['fun', 900, 'Movie + snacks'],
    ['subscriptions', 199, 'Music'], ['food', 1200, 'Section dinner'], ['travel', 2400, 'Train home'], ['shopping', 1500, 'Formal shoes'], ['food', 300, 'Coffee run'],
  ] as const;
  await Expense.insertMany(spends.map(([category, amount, note], i) => ({ user: id, category, amount, note, day: dayKey(-i * 2) })));
  for (let m = 1; m <= 4; m += 1) await Expense.create({ user: id, category: 'food', amount: 9000 + m * 1300, note: 'Monthly total (imported)', day: dayKey(-30 * m - 3) });

  await CheckIn.insertMany(
    Array.from({ length: 12 }, (_, i) => ({ user: id, day: dayKey(-i - 1), mood: [4, 3, 4, 2, 3, 4, 5, 3, 3, 4, 2, 4][i], energy: [3, 3, 4, 2, 3, 4, 4, 3, 2, 4, 2, 3][i], sleepHours: [7, 6, 6.5, 5, 6, 7, 8, 6, 5.5, 7, 5, 7][i], stressors: i % 3 === 0 ? ['placements'] : i % 4 === 0 ? ['academics', 'sleep'] : [] }))
  );
  return '6 courses, timetable, 6 weeks of attendance, budget, loan, 12 check-ins';
}
