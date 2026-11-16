/**
 * Behaviour that lives in the database: unique indexes, conditional updates,
 * and the campus scope on every query. Needs a throwaway MongoDB in
 * `TEST_MONGODB_URI` — the database is dropped before and after.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose, { Types } from 'mongoose';

const enabled = Boolean(process.env.TEST_MONGODB_URI);
const it = enabled ? test : test.skip;

// Loaded lazily so a skipped run never opens a connection.
let lib: {
  connectDB: typeof import('@/lib/mongodb').default;
  User: typeof import('@/models/User').default;
  InterviewSlot: typeof import('@/models/InterviewSlot').default;
  Bounty: typeof import('@/models/Bounty').default;
  LedgerEntry: typeof import('@/models/LedgerEntry').default;
  gamification: typeof import('@/lib/gamification');
  scheduling: typeof import('@/lib/scheduling');
  connections: typeof import('@/lib/connections');
};

before(async () => {
  if (!enabled) return;
  lib = {
    connectDB: (await import('@/lib/mongodb')).default,
    User: (await import('@/models/User')).default,
    InterviewSlot: (await import('@/models/InterviewSlot')).default,
    Bounty: (await import('@/models/Bounty')).default,
    LedgerEntry: (await import('@/models/LedgerEntry')).default,
    gamification: await import('@/lib/gamification'),
    scheduling: await import('@/lib/scheduling'),
    connections: await import('@/lib/connections'),
  };
  await lib.connectDB();
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.models).map((model) => model.syncIndexes()));
});

after(async () => {
  if (!enabled) return;
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

let seq = 0;
async function makeUser(overrides: Record<string, unknown> = {}) {
  seq += 1;
  return lib.User.create({
    name: `User ${seq}`,
    email: `user${seq}@iima.ac.in`,
    password: 'not-used-here-123',
    campus: 'IIM Ahmedabad',
    batch: '2025-27',
    year: 1,
    ...overrides,
  });
}

it('an award pays once per entity, however many times it is requested', async () => {
  const user = await makeUser();
  const entity = new Types.ObjectId();
  const results = await Promise.all(
    [0, 1, 2].map(() => lib.gamification.award(String(user._id), 'resource_shared', { entity }))
  );
  assert.equal(results.filter((result) => result.awarded).length, 1);
  const fresh = await lib.User.findById(user._id).lean();
  assert.equal(fresh?.karma, 30);
});

it('daily caps stop an action being farmed', async () => {
  const user = await makeUser();
  for (let i = 0; i < 5; i += 1) {
    await lib.gamification.award(String(user._id), 'post_created', { entity: new Types.ObjectId() });
  }
  const paid = await lib.LedgerEntry.countDocuments({ user: user._id, action: 'post_created' });
  assert.equal(paid, 3);
});

it('a streak milestone pays once, even when the streak passes it again', async () => {
  const user = await makeUser({ streak: 6, lastCheckInAt: new Date(Date.now() - 86_400_000) });
  const id = String(user._id);

  const first = await lib.gamification.recordCheckIn(id);
  assert.equal(first.milestone, 7);

  // Fall back to 6 and climb to 7 again: no second payout, no second banner.
  await lib.User.updateOne({ _id: user._id }, { streak: 6, lastCheckInAt: new Date(Date.now() - 86_400_000) });
  const again = await lib.gamification.recordCheckIn(id);
  assert.equal(again.streak, 7);
  assert.equal(again.milestone, undefined);
  assert.equal(await lib.LedgerEntry.countDocuments({ user: user._id, action: 'streak_milestone' }), 1);
});

it('a mentor’s weekly capacity is enforced', async () => {
  const mentor = await makeUser({ role: 'mentor', year: 2, mentorProfile: { weeklyCapacity: 1 } });
  const mentee = await makeUser();
  const start = new Date(Date.now() + 3 * 86_400_000);
  await lib.InterviewSlot.create({
    mentor: mentor._id,
    campus: 'IIM Ahmedabad',
    startAt: start,
    endAt: new Date(start.getTime() + 3_600_000),
    sessionType: 'mock_interview',
    status: 'booked',
    bookedBy: mentee._id,
  });
  await assert.rejects(
    lib.scheduling.assertMentorCapacity(String(mentor._id), new Date(start.getTime() + 2 * 3_600_000)),
    /fully booked/
  );
  // A different week is unaffected.
  await lib.scheduling.assertMentorCapacity(String(mentor._id), new Date(start.getTime() + 8 * 86_400_000));
});

it('a split cannot be overfilled by simultaneous claims', async () => {
  const owner = await makeUser();
  const claimers = await Promise.all([0, 1, 2, 3, 4].map(() => makeUser()));
  const bounty = await lib.Bounty.create({
    campus: 'IIM Ahmedabad',
    owner: owner._id,
    title: 'Cab to the airport',
    totalCost: 1200,
    slotsRequired: 3,
    slotsFilled: [owner._id],
  });

  // The same conditional update the claim route runs.
  const claim = (userId: Types.ObjectId) =>
    lib.Bounty.findOneAndUpdate(
      {
        _id: bounty._id,
        status: 'open',
        slotsFilled: { $ne: userId },
        $expr: { $lt: [{ $size: '$slotsFilled' }, '$slotsRequired'] },
      },
      [
        { $set: { slotsFilled: { $concatArrays: ['$slotsFilled', [userId]] } } },
        { $set: { status: { $cond: [{ $gte: [{ $size: '$slotsFilled' }, '$slotsRequired'] }, 'filled', 'open'] } } },
      ],
      { new: true, updatePipeline: true }
    );

  const results = await Promise.all(claimers.map((user) => claim(user._id)));
  assert.equal(results.filter(Boolean).length, 2);
  const final = await lib.Bounty.findById(bounty._id).lean();
  assert.equal(final?.slotsFilled.length, 3);
  assert.equal(final?.status, 'filled');
});

it('messaging never crosses campuses, even after a completed session', async () => {
  const here = await makeUser();
  const there = await makeUser({ campus: 'IIM Bangalore', email: `x${seq}@iimb.ac.in` });
  await lib.InterviewSlot.create({
    mentor: there._id,
    campus: 'IIM Bangalore',
    startAt: new Date(Date.now() - 86_400_000),
    endAt: new Date(Date.now() - 82_800_000),
    sessionType: 'general_qa',
    status: 'completed',
    bookedBy: here._id,
  });
  const check = await lib.connections.checkConnection(String(here._id), 'student', String(there._id));
  assert.equal(check.allowed, false);
});

it('messaging opens after a completed session on the same campus', async () => {
  const mentor = await makeUser({ role: 'mentor', year: 2 });
  const mentee = await makeUser();
  await lib.InterviewSlot.create({
    mentor: mentor._id,
    campus: 'IIM Ahmedabad',
    startAt: new Date(Date.now() - 86_400_000),
    endAt: new Date(Date.now() - 82_800_000),
    sessionType: 'mock_interview',
    status: 'completed',
    bookedBy: mentee._id,
  });
  const check = await lib.connections.checkConnection(String(mentee._id), 'student', String(mentor._id));
  assert.deepEqual(check, { allowed: true, reason: 'completed_session' });
});
