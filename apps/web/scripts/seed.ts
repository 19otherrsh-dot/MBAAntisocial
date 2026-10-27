/**
 * Seeds a demonstrable campus.
 *
 * The core loop needs both sides of a marketplace to be visible, so an empty
 * database makes the product impossible to evaluate. This creates one campus
 * with seniors who have published slots, juniors who have booked some, a
 * resource library, a competition calendar, and a feed with real threads.
 *
 *   npm run seed          # wipes the seeded campus and rebuilds it
 *
 * Every account uses the same password, printed at the end.
 */

import 'dotenv/config';
import mongoose from 'mongoose';
import connectDB from '../src/lib/mongodb';
import User from '../src/models/User';
import InterviewSlot from '../src/models/InterviewSlot';
import Task from '../src/models/Task';
import Resource from '../src/models/Resource';
import Post from '../src/models/Post';
import CaseComp from '../src/models/CaseComp';
import LedgerEntry from '../src/models/LedgerEntry';
import Notification from '../src/models/Notification';
import Report from '../src/models/Report';
import Application, { companyKeyOf } from '../src/models/Application';
import InterviewQuestion from '../src/models/InterviewQuestion';

const CAMPUS = 'IIM Ahmedabad';
const BATCH = '2025-27';
const PASSWORD = 'seedpassword123';
const STAFF_EMAIL = 'placements@iima.ac.in';

const DAY = 86_400_000;
const HOUR = 3_600_000;

/** Days from now, at a given local hour. */
function at(daysFromNow: number, hour: number, minute = 0): Date {
  const date = new Date(Date.now() + daysFromNow * DAY);
  date.setHours(hour, minute, 0, 0);
  return date;
}

const SENIORS = [
  {
    name: 'Ananya Raghavan',
    email: 'ananya@iima.ac.in',
    headline: 'Consulting summers · blunt about resumes',
    companies: ['McKinsey'],
    specializations: ['Consulting', 'Analytics'],
    bio: 'Second year, consulting summers. I will push on your structuring until it holds up. Bring a resume you have actually sent somewhere.',
    karma: 720,
    hosted: 14,
  },
  {
    name: 'Rohit Menon',
    email: 'rohit@iima.ac.in',
    headline: 'Product · ex-engineer, so I know the pivot story',
    companies: ['Flipkart'],
    specializations: ['Product', 'Analytics'],
    bio: 'Made the engineering-to-product jump. Happy to talk through how to tell that story without sounding rehearsed.',
    karma: 410,
    hosted: 8,
  },
  {
    name: 'Priya Deshmukh',
    email: 'priya@iima.ac.in',
    headline: 'Marketing · brand and consumer goods',
    companies: ['Unilever'],
    specializations: ['Marketing', 'General Management'],
    bio: 'Consumer goods summers. I run marketing PIs the way they actually run them — including the questions nobody prepares for.',
    karma: 560,
    hosted: 11,
  },
  {
    name: 'Karthik Iyer',
    email: 'karthik@iima.ac.in',
    headline: 'Finance · IB summers, will be direct',
    companies: ['Goldman Sachs'],
    specializations: ['Finance'],
    bio: 'Investment banking summers. Technicals, valuation, and the fit questions people underestimate.',
    karma: 300,
    hosted: 6,
  },
];

const JUNIORS = [
  { name: 'Sneha Kulkarni', email: 'sneha@iima.ac.in', specializations: ['Consulting'] },
  { name: 'Arjun Bhatia', email: 'arjun@iima.ac.in', specializations: ['Finance', 'Analytics'] },
  { name: 'Meera Nair', email: 'meera@iima.ac.in', specializations: ['Marketing'] },
  { name: 'Devansh Shah', email: 'devansh@iima.ac.in', specializations: ['Product'] },
  { name: 'Tanvi Rao', email: 'tanvi@iima.ac.in', specializations: ['Consulting', 'Sustainability'] },
];

async function seed() {
  await connectDB();
  console.log(`Connected to ${mongoose.connection.name}`);

  const emails = [...SENIORS, ...JUNIORS].map((person) => person.email).concat(STAFF_EMAIL);

  // Scoped to the seeded campus so a shared database is not destroyed.
  const existing = await User.find({ email: { $in: emails } }).select('_id').lean();
  const existingIds = existing.map((user) => user._id);

  if (existingIds.length > 0) {
    console.log(`Clearing ${existingIds.length} existing seed accounts and their data…`);
    await Promise.all([
      InterviewSlot.deleteMany({ mentor: { $in: existingIds } }),
      Task.deleteMany({ user: { $in: existingIds } }),
      Resource.deleteMany({ author: { $in: existingIds } }),
      Post.deleteMany({ author: { $in: existingIds } }),
      LedgerEntry.deleteMany({ user: { $in: existingIds } }),
      Notification.deleteMany({ user: { $in: existingIds } }),
      Report.deleteMany({ reporter: { $in: existingIds } }),
      Application.deleteMany({ user: { $in: existingIds } }),
      InterviewQuestion.deleteMany({ contributor: { $in: existingIds } }),
      User.deleteMany({ _id: { $in: existingIds } }),
    ]);
  }
  await CaseComp.deleteMany({ source: 'curated' });

  /*
   * Created one at a time rather than with insertMany, because the password
   * hashing hook is a `pre('save')` middleware that insertMany bypasses — the
   * accounts would be written with plaintext passwords that never match.
   */
  const seniors = [];
  for (const [index, person] of SENIORS.entries()) {
    seniors.push(
      await User.create({
        name: person.name,
        email: person.email,
        password: PASSWORD,
        campus: CAMPUS,
        batch: '2024-26',
        year: 2,
        role: index === 0 ? 'moderator' : 'mentor',
        bio: person.bio,
        specializations: person.specializations,
        mentorProfile: {
          acceptingBookings: true,
          offers: ['mock_interview', 'resume_review', 'general_qa'],
          weeklyCapacity: 4,
          headline: person.headline,
          companies: person.companies,
        },
        karma: person.karma,
        points: 180 + index * 40,
        streak: 12 - index * 2,
        longestStreak: 24 - index,
        sessionsHosted: person.hosted,
        mentorRating: { sum: person.hosted * 4.6, count: person.hosted },
        leaderboardOptIn: true,
        badges: person.hosted >= 5 ? ['first_mock', 'mocks_hosted_5'] : ['first_mock'],
        honorCodeAcceptedAt: new Date(),
        onboardedAt: new Date(),
      })
    );
  }

  const juniors = [];
  for (const [index, person] of JUNIORS.entries()) {
    juniors.push(
      await User.create({
        name: person.name,
        email: person.email,
        password: PASSWORD,
        campus: CAMPUS,
        batch: BATCH,
        year: 1,
        role: 'student',
        specializations: person.specializations,
        points: 90 + index * 25,
        karma: index * 15,
        streak: 5 + index,
        longestStreak: 9 + index,
        sessionsAttended: index % 3,
        leaderboardOptIn: index % 2 === 0,
        honorCodeAcceptedAt: index < 3 ? new Date() : undefined,
        onboardedAt: new Date(),
      })
    );
  }

  /*
   * A placement-office account. Deliberately not a moderator: staff read the
   * campus report and moderate nothing, and the two permissions are separate
   * so granting one cannot grant the other.
   */
  const staff = await User.create({
    name: 'Placement Office',
    email: STAFF_EMAIL,
    password: PASSWORD,
    campus: CAMPUS,
    batch: 'Staff',
    year: 2,
    role: 'placement_office',
    bio: 'Institute placement cell.',
    leaderboardOptIn: false,
    onboardedAt: new Date(),
  });

  console.log(
    `Created ${seniors.length} seniors, ${juniors.length} juniors, and 1 staff account (${staff.email}).`
  );

  // ── Slots: a mix of open, booked, and completed with real feedback ────────
  const slots = [];

  for (const [index, mentor] of seniors.entries()) {
    // Two open slots each, spread across the coming week.
    for (const offset of [2 + index, 5 + index]) {
      const startAt = at(offset, 18 + (index % 3));
      slots.push({
        mentor: mentor._id,
        campus: CAMPUS,
        startAt,
        endAt: new Date(startAt.getTime() + 45 * 60_000),
        sessionType: index % 2 === 0 ? 'mock_interview' : 'resume_review',
        notes:
          index % 2 === 0
            ? 'Bring a resume you have actually submitted. I will run a full PI and stop you where a panel would.'
            : 'Send nothing in advance — we will read it together and rewrite two bullets live.',
        meetingLink: 'https://meet.google.com/seed-demo-room',
        status: 'available',
      });
    }
  }

  // One confirmed booking, so the "my bookings" view is not empty.
  const bookedStart = at(1, 19);
  slots.push({
    mentor: seniors[0]._id,
    campus: CAMPUS,
    startAt: bookedStart,
    endAt: new Date(bookedStart.getTime() + 45 * 60_000),
    sessionType: 'mock_interview',
    notes: 'Full consulting PI. Expect a case and a why-consulting that I will not let you rehearse.',
    meetingLink: 'https://meet.google.com/seed-demo-room',
    status: 'booked',
    bookedBy: juniors[0]._id,
    bookedAt: new Date(Date.now() - 2 * DAY),
    bookingNote:
      'Targeting consulting. I fall apart on guesstimates and my "why MBA" still sounds scripted.',
  });

  // One completed session carrying both sides of the rubric.
  const doneStart = at(-3, 18);
  slots.push({
    mentor: seniors[2]._id,
    campus: CAMPUS,
    startAt: doneStart,
    endAt: new Date(doneStart.getTime() + 45 * 60_000),
    sessionType: 'mock_interview',
    notes: 'Marketing PI.',
    meetingLink: 'https://meet.google.com/seed-demo-room',
    status: 'completed',
    bookedBy: juniors[2]._id,
    bookedAt: new Date(Date.now() - 6 * DAY),
    completedAt: new Date(doneStart.getTime() + HOUR),
    bookingNote: 'Marketing roles, mostly consumer goods. Nervous about brand-positioning questions.',
    mentorFeedback: {
      scores: new Map([
        ['preparedness', 4],
        ['structure', 3],
        ['communication', 4],
        ['depth', 3],
      ]),
      comments:
        'Strong on the brand you chose and you clearly read up on the category. Where it fell over: every answer started with a story and got to the point about ninety seconds late. Lead with the answer, then justify it. Also, when I asked why that positioning over the obvious alternative, you defended rather than compared — compare.',
      submittedAt: new Date(doneStart.getTime() + 2 * HOUR),
    },
    menteeFeedback: {
      scores: new Map([
        ['usefulness', 5],
        ['candour', 5],
        ['preparedness', 4],
      ]),
      comments:
        'Genuinely the most useful forty-five minutes of my term. She did not soften anything, which is exactly what I needed two weeks out. The point about leading with the answer has already changed how I write my prep notes.',
      submittedAt: new Date(doneStart.getTime() + 3 * HOUR),
    },
  });

  await InterviewSlot.insertMany(slots);
  console.log(`Created ${slots.length} slots.`);

  // ── Resources ────────────────────────────────────────────────────────────
  const resources = [
    {
      author: seniors[2]._id,
      title: 'Marketing Management — complete term notes',
      description:
        'Every session up to the endterm, including the two cases she actually tested on. Cleaned up after the exam.',
      course: 'Marketing Management',
      professor: 'Prof. Iyer',
      term: 'Term II',
      kind: 'class_notes',
      fileType: 'pdf',
      fileSize: 4_200_000,
      tags: ['endterm', 'cases', 'frameworks'],
      upvoteCount: 63,
      downloads: 214,
    },
    {
      author: seniors[3]._id,
      title: 'Corporate Finance — past papers, 2021 to 2024',
      description:
        'Four years of endterms with worked solutions for the numericals. Questions repeat more than you would think.',
      course: 'Corporate Finance',
      professor: 'Prof. Banerjee',
      term: 'Term III',
      kind: 'past_paper',
      fileType: 'pdf',
      fileSize: 8_100_000,
      tags: ['past-papers', 'valuation', 'numericals'],
      upvoteCount: 91,
      downloads: 340,
    },
    {
      author: seniors[0]._id,
      title: 'Guesstimate patterns that actually come up',
      description:
        'Twelve guesstimates from real consulting PIs at this campus, with the structure that worked and the one that did not.',
      course: 'Placement Prep',
      professor: '',
      term: 'Term II',
      kind: 'summary',
      fileType: 'pdf',
      fileSize: 1_400_000,
      tags: ['consulting', 'guesstimates', 'interviews'],
      upvoteCount: 128,
      downloads: 502,
    },
    {
      author: seniors[1]._id,
      title: 'Operations Management — session slides',
      description: 'Circulated deck, reordered to match the way the course was actually taught.',
      course: 'Operations Management',
      professor: 'Prof. Kulkarni',
      term: 'Term I',
      kind: 'slide_deck',
      fileType: 'pptx',
      fileSize: 12_600_000,
      tags: ['slides', 'supply-chain'],
      upvoteCount: 34,
      downloads: 97,
    },
  ];

  await Resource.insertMany(
    resources.map((resource) => ({
      ...resource,
      campus: CAMPUS,
      fileUrl: 'https://drive.google.com/file/d/seed-demo-resource/view',
      fileName: `${resource.title}.${resource.fileType}`,
      honorCodeAffirmed: true,
    }))
  );
  console.log(`Created ${resources.length} resources.`);

  // ── Competitions ─────────────────────────────────────────────────────────
  await CaseComp.insertMany([
    {
      title: 'Nestlé Ideas Cup 2026',
      host: 'Nestlé India',
      description:
        'Consumer goods case challenge. National finals in Gurgaon, with PPI opportunities for finalists.',
      category: 'marketing',
      registrationDeadline: at(11, 23, 59),
      eventDate: at(28, 9),
      prizePool: '₹5,00,000',
      teamSize: '3 members',
      eligibility: 'First-year MBA/PGDM students',
      url: 'https://example.com/nestle-ideas-cup',
      source: 'curated',
      campuses: [],
    },
    {
      title: 'Bain Business Case Challenge',
      host: 'Bain & Company',
      description:
        'Strategy case competition. Finalists interview directly for summer internship roles.',
      category: 'consulting',
      registrationDeadline: at(6, 23, 59),
      eventDate: at(20, 9),
      prizePool: '₹3,00,000 + PPI',
      teamSize: '2-3 members',
      eligibility: 'First-year students only',
      url: 'https://example.com/bain-case-challenge',
      source: 'curated',
      campuses: [],
    },
    {
      title: 'Deutsche Bank Quant Challenge',
      host: 'Deutsche Bank',
      description: 'Quantitative finance and markets simulation, run over a single weekend.',
      category: 'finance',
      registrationDeadline: at(19, 23, 59),
      prizePool: '₹2,00,000',
      teamSize: '2 members',
      eligibility: 'All years',
      url: 'https://example.com/db-quant',
      source: 'curated',
      campuses: [],
    },
    {
      title: 'Godrej LOUD',
      host: 'Godrej Industries',
      description:
        'Pitch a personal dream rather than a business case. Winners get funding and a summer internship.',
      category: 'general',
      registrationDeadline: at(3, 23, 59),
      prizePool: '₹1,50,000 + internship',
      teamSize: 'Individual',
      eligibility: 'First-year students',
      url: 'https://example.com/godrej-loud',
      source: 'curated',
      campuses: [],
    },
  ]);
  console.log('Created 4 competitions.');

  // ── Tasks ────────────────────────────────────────────────────────────────
  const tasks = [
    {
      user: juniors[0]._id,
      title: 'Marketing case submission',
      course: 'Marketing Management',
      type: 'assignment',
      priority: 'high',
      dueAt: at(1, 23, 59),
    },
    {
      user: juniors[0]._id,
      title: 'Read business news',
      type: 'daily',
      priority: 'medium',
      recurrence: 'daily',
      isTemplate: true,
    },
    {
      user: juniors[0]._id,
      title: 'Finance problem set 4',
      course: 'Corporate Finance',
      type: 'assignment',
      priority: 'medium',
      dueAt: at(4, 23, 59),
    },
    {
      user: juniors[0]._id,
      title: 'Stats quiz revision',
      course: 'Quantitative Methods',
      type: 'exam',
      priority: 'high',
      dueAt: at(-1, 23, 59),
    },
    {
      user: juniors[0]._id,
      title: 'Ops reading — chapters 4 and 5',
      course: 'Operations Management',
      type: 'assignment',
      priority: 'low',
      status: 'completed',
      completedAt: new Date(Date.now() - DAY),
      completedOnTime: true,
      dueAt: at(-2, 23, 59),
    },
  ];

  await Task.insertMany(tasks);
  console.log(`Created ${tasks.length} tasks for ${JUNIORS[0].name}.`);

  // ── Feed ─────────────────────────────────────────────────────────────────
  const posts = [
    {
      author: juniors[1]._id,
      content:
        'Does anyone actually understand what Prof. Banerjee wants in the WACC question, or are we all just guessing consistently enough that it looks like understanding?',
      category: 'ask',
      comments: [
        {
          author: seniors[3]._id,
          content:
            'He wants the assumptions stated before the number. Half the marks are for saying which cost of equity model you picked and why. The arithmetic is almost incidental.',
          markedUseful: true,
          createdAt: new Date(Date.now() - 20 * HOUR),
        },
        {
          author: juniors[3]._id,
          content: 'This would have saved me eleven marks last term.',
          markedUseful: false,
          createdAt: new Date(Date.now() - 18 * HOUR),
        },
      ],
      commentCount: 2,
      resolvedAt: new Date(Date.now() - 17 * HOUR),
      createdAt: new Date(Date.now() - DAY),
    },
    {
      author: seniors[0]._id,
      content:
        'Opening four mock interview slots for next week. Consulting-focused, forty-five minutes each, and I will be direct rather than encouraging. If you want someone to tell you it went well, book somebody else.',
      category: 'general',
      commentCount: 0,
      createdAt: new Date(Date.now() - 8 * HOUR),
    },
    {
      author: juniors[4]._id,
      content:
        'Reminder that the Godrej LOUD deadline is in three days and it is a single individual pitch, not a team case. Genuinely the lowest-effort-to-upside thing on the calendar right now.',
      category: 'event',
      commentCount: 0,
      createdAt: new Date(Date.now() - 4 * HOUR),
    },
    {
      author: juniors[2]._id,
      content:
        'Did a mock with Priya yesterday. Came out slightly demolished and with the clearest set of notes I have had all term. Recommend, if you can take it.',
      category: 'general',
      commentCount: 0,
      createdAt: new Date(Date.now() - 2 * HOUR),
    },
  ];

  await Post.insertMany(
    posts.map((post) => ({ ...post, campus: CAMPUS, batch: BATCH, links: [] }))
  );
  console.log(`Created ${posts.length} posts.`);

  // ── Placement pipeline ───────────────────────────────────────────────────
  const bainRounds = [
    { type: 'shortlist', outcome: 'cleared', offsetDays: -21, questionsLogged: 0 },
    { type: 'case', outcome: 'cleared', offsetDays: -9, questionsLogged: 2 },
    { type: 'final', outcome: 'pending', offsetDays: 4, questionsLogged: 0 },
  ] as const;

  const pipelines = [
    {
      user: juniors[0]._id,
      company: 'Bain & Company',
      role: 'Associate Consultant — Summer Internship',
      track: 'consulting',
      source: 'campus',
      stage: 'in_process',
      appliedAt: new Date(Date.now() - 24 * DAY),
      rounds: bainRounds.map((round) => ({
        type: round.type,
        label: '',
        scheduledAt: at(round.offsetDays, 10),
        outcome: round.outcome,
        notes: '',
        questionsLogged: round.questionsLogged,
        completedAt: round.outcome === 'pending' ? undefined : at(round.offsetDays, 11),
        intelPromptedAt: round.questionsLogged > 0 ? at(round.offsetDays, 12) : undefined,
      })),
    },
    {
      user: juniors[0]._id,
      company: 'Asian Paints',
      role: 'Management Trainee — Sales',
      track: 'marketing',
      source: 'campus',
      stage: 'rejected',
      appliedAt: new Date(Date.now() - 30 * DAY),
      closedAt: new Date(Date.now() - 12 * DAY),
      rounds: [
        {
          type: 'group_discussion',
          label: '',
          scheduledAt: at(-14, 14),
          outcome: 'cleared',
          notes: '',
          questionsLogged: 1,
          completedAt: at(-14, 15),
          intelPromptedAt: at(-14, 16),
        },
        {
          type: 'hr',
          label: '',
          scheduledAt: at(-12, 11),
          outcome: 'rejected',
          notes: 'Fumbled the "why sales, not consulting" question. Fair enough.',
          questionsLogged: 1,
          completedAt: at(-12, 12),
          intelPromptedAt: at(-12, 13),
        },
      ],
    },
    {
      user: juniors[0]._id,
      company: 'Flipkart',
      role: 'APM — Summer Internship',
      track: 'product',
      source: 'campus',
      stage: 'applied',
      appliedAt: new Date(Date.now() - 3 * DAY),
      rounds: [],
    },
    {
      user: juniors[1]._id,
      company: 'Goldman Sachs',
      role: 'Investment Banking Summer Analyst',
      track: 'finance',
      source: 'campus',
      stage: 'offer',
      appliedAt: new Date(Date.now() - 40 * DAY),
      closedAt: new Date(Date.now() - 5 * DAY),
      rounds: [
        {
          type: 'aptitude',
          label: '',
          scheduledAt: at(-25, 10),
          outcome: 'cleared',
          notes: '',
          questionsLogged: 0,
          completedAt: at(-25, 12),
        },
        {
          type: 'technical',
          label: '',
          scheduledAt: at(-11, 15),
          outcome: 'cleared',
          notes: '',
          questionsLogged: 2,
          completedAt: at(-11, 16),
          intelPromptedAt: at(-11, 17),
        },
      ],
    },
  ];

  await Application.insertMany(
    pipelines.map((entry) => ({
      ...entry,
      campus: CAMPUS,
      companyKey: companyKeyOf(entry.company),
      notes: '',
    }))
  );
  console.log(`Created ${pipelines.length} tracked applications.`);

  // ── Interview intel ──────────────────────────────────────────────────────
  const intel = [
    {
      contributor: seniors[0]._id,
      company: 'Bain & Company',
      role: 'Associate Consultant',
      track: 'consulting',
      roundType: 'case',
      question:
        'A regional dairy cooperative has flat revenue for three years while the category grew 8%. Walk me through how you would find out why.',
      guidance:
        'Do not jump to a framework name. He wanted the split first — is it volume or price, then which channel, then which SKU. I started with "let me think about the 4Ps" and watched his face fall.',
      difficulty: 'brutal',
      askedAt: at(-190, 10),
      upvoteCount: 34,
      anonymous: false,
    },
    {
      contributor: seniors[0]._id,
      company: 'Bain & Company',
      role: 'Associate Consultant',
      track: 'consulting',
      roundType: 'case',
      question: 'Size the market for electric two-wheelers in tier-two Indian cities.',
      guidance:
        'Segmentation logic before arithmetic. Households, then two-wheeler penetration, then the electric share, then replacement cycle. He interrupted twice to ask why each number was reasonable — have a reason ready for every single one.',
      difficulty: 'standard',
      askedAt: at(-188, 11),
      upvoteCount: 41,
      anonymous: false,
    },
    {
      contributor: juniors[0]._id,
      company: 'Bain & Company',
      role: 'Associate Consultant',
      track: 'consulting',
      roundType: 'final',
      question:
        'Tell me about a time your analysis was right and nobody acted on it. What did you do next?',
      guidance:
        'This is a fit question wearing a case question costume. They are testing whether you sulk or re-frame. I talked about the analysis for two minutes and about the follow-up for twenty seconds — invert that ratio.',
      difficulty: 'standard',
      askedAt: at(-9, 11),
      upvoteCount: 12,
      anonymous: false,
    },
    {
      contributor: juniors[2]._id,
      company: 'Asian Paints',
      role: 'Management Trainee — Sales',
      track: 'marketing',
      roundType: 'hr',
      question: 'Why sales and not consulting, given everything on your resume points at consulting?',
      guidance:
        'They ask this at Asian Paints every single year and they can tell when the answer was written that morning. Have a real reason involving something you actually did, not a story about "wanting ground-level exposure".',
      difficulty: 'brutal',
      askedAt: at(-12, 12),
      upvoteCount: 27,
      anonymous: true,
    },
    {
      contributor: juniors[2]._id,
      company: 'Asian Paints',
      role: 'Management Trainee — Sales',
      track: 'marketing',
      roundType: 'group_discussion',
      question:
        'Should quick-commerce platforms be held to the same safety standards as physical retail?',
      guidance:
        'Twelve people, eight minutes. Getting in early mattered more than being right. The two who spoke last never got a word in regardless of what they had prepared.',
      difficulty: 'standard',
      askedAt: at(-14, 15),
      upvoteCount: 19,
      anonymous: false,
    },
    {
      contributor: seniors[3]._id,
      company: 'Goldman Sachs',
      role: 'Investment Banking Summer Analyst',
      track: 'finance',
      roundType: 'technical',
      question:
        'Two companies, identical EBITDA, one trades at twice the multiple. Give me five reasons, then tell me which is most likely.',
      guidance:
        'Listing five is the easy half. Committing to one and defending it is the actual test. Growth rate is usually the right answer for Indian mid-caps, but say why.',
      difficulty: 'standard',
      askedAt: at(-175, 15),
      upvoteCount: 38,
      anonymous: false,
    },
    {
      contributor: juniors[1]._id,
      company: 'Goldman Sachs',
      role: 'Investment Banking Summer Analyst',
      track: 'finance',
      roundType: 'technical',
      question: 'Walk me through a DCF for a company with negative free cash flow for four years.',
      guidance:
        'They are checking whether you understand terminal value or just memorised the formula. Be ready for "what if the terminal value is 90% of your valuation — is that a problem?" It is, and you should say so.',
      difficulty: 'brutal',
      askedAt: at(-11, 16),
      upvoteCount: 22,
      anonymous: false,
    },
    {
      contributor: seniors[1]._id,
      company: 'Flipkart',
      role: 'APM',
      track: 'product',
      roundType: 'case',
      question:
        'Returns on our fashion vertical are running at 30%. You have one quarter and no budget. What do you do?',
      guidance:
        'The constraint is the question. Anything requiring spend gets cut off immediately. Sizing guidance, better imagery, review prompts — the cheap levers are what they want to hear you reason about.',
      difficulty: 'standard',
      askedAt: at(-160, 14),
      upvoteCount: 29,
      anonymous: false,
    },
  ];

  await InterviewQuestion.insertMany(
    intel.map((entry) => ({
      ...entry,
      campus: CAMPUS,
      companyKey: companyKeyOf(entry.company),
      tags: [],
      verified: true,
      upvotes: [],
    }))
  );
  console.log(`Created ${intel.length} interview questions.`);

  console.log('\n─────────────────────────────────────────');
  console.log('Seed complete.\n');
  console.log(`Campus:   ${CAMPUS}`);
  console.log(`Password: ${PASSWORD}   (every account)\n`);
  console.log(`Placement office:  ${STAFF_EMAIL}   (campus report)`);
  console.log(`Senior/moderator:  ${SENIORS[0].email}`);
  console.log(`Senior (mentor):   ${SENIORS[2].email}`);
  console.log(`Junior (busiest):  ${JUNIORS[0].email}`);
  console.log('─────────────────────────────────────────\n');

  await mongoose.disconnect();
}

seed().catch(async (error) => {
  console.error('\nSeed failed:', error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
