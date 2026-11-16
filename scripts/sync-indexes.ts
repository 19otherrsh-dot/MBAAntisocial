/**
 * Builds every index the schemas declare, and drops ones they no longer do.
 *
 * Mongoose builds indexes on first use, which is fine on a laptop but means a
 * production deploy can serve requests before the unique indexes that stop
 * double rewards exist. Run this once per deploy, before traffic:
 *
 *   npm run db:indexes
 */
import './load-env';
import mongoose from 'mongoose';
import connectDB from '../src/lib/mongodb';
import '../src/models/User';
import '../src/models/Application';
import '../src/models/Bounty';
import '../src/models/CaseComp';
import '../src/models/Contact';
import '../src/models/InterviewQuestion';
import '../src/models/InterviewSlot';
import '../src/models/Job';
import '../src/models/LedgerEntry';
import '../src/models/Message';
import '../src/models/Notification';
import '../src/models/Offer';
import '../src/models/Post';
import '../src/models/Report';
import '../src/models/Resource';
import '../src/models/RoomMessage';
import '../src/models/StudyRoom';
import '../src/models/Task';
import '../src/models/Whisper';

(async () => {
  await connectDB();
  for (const model of Object.values(mongoose.models)) {
    const dropped = await model.syncIndexes();
    console.log(`${model.modelName.padEnd(18)} ok${dropped.length ? ` (dropped ${dropped.join(', ')})` : ''}`);
  }
  await mongoose.disconnect();
})().catch(async (error) => {
  console.error('Index sync failed:', error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
