import { Types } from 'mongoose';
import User from '@/models/User';
import Task from '@/models/Task';
import Application from '@/models/Application';
import Contact from '@/models/Contact';
import LedgerEntry from '@/models/LedgerEntry';
import Notification from '@/models/Notification';
import Message from '@/models/Message';
import Post from '@/models/Post';
import RoomMessage from '@/models/RoomMessage';
import StudyRoom from '@/models/StudyRoom';
import Job from '@/models/Job';
import Resource from '@/models/Resource';
import Whisper from '@/models/Whisper';
import Bounty from '@/models/Bounty';
import Report from '@/models/Report';
import InterviewQuestion from '@/models/InterviewQuestion';
import InterviewSlot from '@/models/InterviewSlot';
import CaseComp from '@/models/CaseComp';

/**
 * Account export and deletion — the data-subject rights a commercial product
 * owes its users (India's DPDP Act, and GDPR for anyone abroad).
 */

/** Everything stored about one person, as plain JSON. Secrets are excluded. */
export async function exportAccount(userId: string) {
  const id = new Types.ObjectId(userId);
  const [
    user,
    tasks,
    applications,
    contacts,
    ledger,
    notifications,
    messages,
    posts,
    questions,
    resources,
    whispers,
    jobs,
    bounties,
    slots,
    reports,
  ] = await Promise.all([
    User.findById(id).lean(),
    Task.find({ user: id }).lean(),
    Application.find({ user: id }).lean(),
    Contact.find({ owner: id }).lean(),
    LedgerEntry.find({ user: id }).sort({ createdAt: 1 }).lean(),
    Notification.find({ user: id }).lean(),
    Message.find({ $or: [{ sender: id }, { receiver: id }] }).sort({ createdAt: 1 }).lean(),
    Post.find({ author: id }).lean(),
    InterviewQuestion.find({ contributor: id }).lean(),
    Resource.find({ author: id }).lean(),
    Whisper.find({ author: id }).lean(),
    Job.find({ author: id }).lean(),
    Bounty.find({ $or: [{ owner: id }, { slotsFilled: id }] }).lean(),
    InterviewSlot.find({ $or: [{ mentor: id }, { bookedBy: id }] }).lean(),
    Report.find({ reporter: id }).lean(),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    // The password hash and pending email tokens are `select: false`, so they
    // are not in this document at all.
    account: user,
    tasks,
    applications,
    contacts,
    ledger,
    notifications,
    messages,
    posts,
    interviewQuestions: questions,
    resources,
    courseReviews: whispers,
    opportunities: jobs,
    splits: bounties,
    sessions: slots,
    reportsFiled: reports,
  };
}

/**
 * Deletes an account and what belongs to it.
 *
 * Personal records go entirely. Two kinds of contribution are kept, because
 * they were given to the campus rather than kept for oneself, and removing
 * them would take something from other people: interview questions stay, made
 * anonymous; anonymous offer reports were never linked to the account at all.
 * Everything else that names the person is deleted or detached.
 */
export async function deleteAccount(userId: string): Promise<void> {
  const id = new Types.ObjectId(userId);

  // Sessions: open slots go, and live bookings are released for the other side.
  const now = new Date();
  await InterviewSlot.updateMany(
    { bookedBy: id, status: 'booked', startAt: { $gt: now } },
    { $set: { status: 'available' }, $unset: { bookedBy: 1, bookedAt: 1 } }
  );
  await InterviewSlot.deleteMany({ $or: [{ mentor: id }, { bookedBy: id }] });

  await Promise.all([
    Task.deleteMany({ user: id }),
    Application.deleteMany({ user: id }),
    Contact.deleteMany({ owner: id }),
    LedgerEntry.deleteMany({ user: id }),
    Notification.deleteMany({ $or: [{ user: id }, { actor: id }] }),
    Message.deleteMany({ $or: [{ sender: id }, { receiver: id }] }),
    Post.deleteMany({ author: id }),
    Post.updateMany({ 'comments.author': id }, { $pull: { comments: { author: id } } }),
    RoomMessage.deleteMany({ author: id }),
    StudyRoom.deleteMany({ createdBy: id }),
    Job.deleteMany({ author: id }),
    Resource.deleteMany({ author: id }),
    Whisper.deleteMany({ author: id }),
    Bounty.deleteMany({ owner: id }),
    Bounty.updateMany({ slotsFilled: id }, { $pull: { slotsFilled: id }, $set: { status: 'open' } }),
    Report.deleteMany({ $or: [{ reporter: id }, { target: id }] }),
    CaseComp.updateMany({ savedBy: id }, { $pull: { savedBy: id } }),
    // Kept for the campus, without the name.
    InterviewQuestion.updateMany({ contributor: id }, { $set: { anonymous: true } }),
  ]);

  // Upvotes they gave: remove them and correct the counts.
  for (const Model of [InterviewQuestion, Resource] as const) {
    const voted = await (Model as typeof Resource).find({ upvotes: id }).select('_id').lean();
    for (const doc of voted) {
      await (Model as typeof Resource).updateOne({ _id: doc._id }, { $pull: { upvotes: id }, $inc: { upvoteCount: -1 } });
    }
  }

  await User.deleteOne({ _id: id });
}
