import Campus from '@/models/Campus';
import User from '@/models/User';

/**
 * Cross-campus mentoring (§6.1 V3) needs three yeses: the mentor opted in, the
 * junior's campus allows cross-campus mentors, and the mentor's campus does.
 */
export async function campusAllowsCrossMentors(campus: string): Promise<boolean> {
  const row = await Campus.findOne({ name: campus }).select('settings.crossCampusMentors status').lean();
  return row ? row.settings?.crossCampusMentors !== false && row.status !== 'suspended' : true;
}

export async function crossCampusMentorIds(viewerCampus: string): Promise<string[]> {
  if (!(await campusAllowsCrossMentors(viewerCampus))) return [];
  const blocked = await Campus.find({ 'settings.crossCampusMentors': false }).select('name').lean();
  const mentors = await User.find({
    campus: { $nin: [viewerCampus, ...blocked.map((c) => c.name)] },
    'mentorProfile.crossCampus': true,
    'mentorProfile.acceptingBookings': true,
    suspendedAt: { $exists: false },
  })
    .select('_id')
    .limit(500)
    .lean();
  return mentors.map((m) => String(m._id));
}

export async function canBookAcross(menteeCampus: string, mentorId: string): Promise<boolean> {
  const mentor = await User.findById(mentorId).select('campus mentorProfile.crossCampus').lean();
  if (!mentor?.mentorProfile?.crossCampus) return false;
  const [mine, theirs] = await Promise.all([campusAllowsCrossMentors(menteeCampus), campusAllowsCrossMentors(mentor.campus)]);
  return mine && theirs;
}
