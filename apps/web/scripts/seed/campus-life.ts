import Event from '../../src/models/campus/Event';
import type { Types } from 'mongoose';
import Club, { type ClubRole } from '../../src/models/campus/Club';
import ClubApplication from '../../src/models/campus/ClubApplication';
import Listing from '../../src/models/campus/Listing';
import LostItem from '../../src/models/campus/LostItem';
import MessMenu from '../../src/models/campus/MessMenu';
import MessRating from '../../src/models/campus/MessRating';
import Team from '../../src/models/campus/Team';
import HubServer from '../../src/models/hub/HubServer';
import { addMember, createServer } from '../../src/server/modules/hub/service';
import type { SeedContext } from './index';

function monday(): string {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

const WEEK_MENU = [
  { breakfast: ['Poha', 'Boiled eggs', 'Tea / coffee'], lunch: ['Rajma', 'Jeera rice', 'Roti', 'Salad'], snacks: ['Samosa', 'Chai'], dinner: ['Paneer butter masala', 'Naan', 'Dal tadka', 'Gulab jamun'] },
  { breakfast: ['Idli', 'Sambar', 'Coconut chutney'], lunch: ['Chole', 'Rice', 'Roti', 'Raita'], snacks: ['Bread pakora'], dinner: ['Egg curry / Aloo gobi', 'Rice', 'Roti'] },
  { breakfast: ['Aloo paratha', 'Curd'], lunch: ['Kadhi pakora', 'Rice', 'Bhindi'], snacks: ['Pav bhaji'], dinner: ['Chicken curry / Mix veg', 'Roti', 'Kheer'] },
  { breakfast: ['Upma', 'Banana'], lunch: ['Dal makhani', 'Rice', 'Roti', 'Papad'], snacks: ['Maggi'], dinner: ['Veg biryani', 'Mirchi ka salan', 'Raita'] },
  { breakfast: ['Masala dosa', 'Chutney'], lunch: ['Sambar rice', 'Curd rice', 'Poriyal'], snacks: ['Vada pav'], dinner: ['Fish fry / Paneer tikka', 'Roti', 'Dal'] },
  { breakfast: ['Chole bhature'], lunch: ['Pulao', 'Dal', 'Aloo jeera'], snacks: ['Cake', 'Coffee'], dinner: ['Pizza night', 'Garlic bread'] },
  { breakfast: ['Puri bhaji', 'Jalebi'], lunch: ['Special thali'], snacks: ['Bhel puri'], dinner: ['Khichdi', 'Kadhi', 'Papad'] },
];

export async function run({ campus, users, at }: SeedContext): Promise<string> {
  const oldClubs = await Club.find({ campus }).select('_id hubServer').lean();
  const oldTeams = await Team.find({ campus }).select('hubServer').lean();
  await Promise.all([
    Event.deleteMany({ campus }),
    Club.deleteMany({ campus }),
    ClubApplication.deleteMany({ club: { $in: oldClubs.map((c) => c._id) } }),
    Listing.deleteMany({ campus }),
    LostItem.deleteMany({ campus }),
    MessMenu.deleteMany({ campus }),
    MessRating.deleteMany({ campus }),
    Team.deleteMany({ campus }),
    HubServer.deleteMany({ _id: { $in: [...oldClubs, ...oldTeams].flatMap((x) => (x.hubServer ? [x.hubServer] : [])) } }),
  ]);

  const u = (prefix: string) => users.find((x) => x.email.startsWith(`${prefix}@`))!;
  const [ananya, rohit, priya, karthik, sneha, arjun, meera, devansh, tanvi] = ['ananya', 'rohit', 'priya', 'karthik', 'sneha', 'arjun', 'meera', 'devansh', 'tanvi'].map(u);
  if (!ananya || !sneha) return 'skipped (seed users missing)';

  const clubSeeds = [
    { name: 'Finance & Investment Club', slug: 'finclub', tagline: 'Stock pitches every Friday, valuation bootcamps, and the annual trading game.', category: 'professional', official: true, lead: arjun, members: [devansh, sneha, rohit], recruiting: { open: true, questions: ['Pitch one stock in three sentences.', 'What would you want to run at the club this year?'], note: 'We pick 6 first-years this round.' } },
    { name: 'Consulting Club', slug: 'consult', tagline: 'Case prep pairs, firm talks, and the casebook.', category: 'professional', official: true, lead: ananya, members: [priya, sneha, tanvi], recruiting: { open: false, questions: [], note: '' } },
    { name: 'Dramatics Society', slug: 'drama', tagline: 'Two productions a year and improv on Thursdays.', category: 'cultural', official: true, lead: meera, members: [karthik], recruiting: { open: true, questions: [], note: 'Just turn up on Thursday.' } },
    { name: 'Sunday Runners', slug: 'runners', tagline: '5k around campus, 6:30am, every Sunday. All paces welcome.', category: 'sports', official: false, lead: devansh, members: [meera, arjun], recruiting: { open: true, questions: [], note: '' } },
  ] as const;

  const clubs: Array<InstanceType<typeof Club>> = [];
  for (const seed of clubSeeds) {
    if (!seed.lead) continue;
    const members: Array<{ user: Types.ObjectId; role: ClubRole; title: string; joinedAt: Date }> = [{ user: seed.lead._id, role: 'lead', title: 'President', joinedAt: new Date() }, ...seed.members.filter(Boolean).map((m, i) => ({ user: m._id, role: (i === 0 ? 'core' : 'member') as ClubRole, title: i === 0 ? 'Events' : '', joinedAt: new Date() }))];
    const club = await Club.create({
      campus,
      name: seed.name,
      slug: seed.slug,
      tagline: seed.tagline,
      description: `${seed.tagline}\n\nEveryone is welcome at open sessions. Members get the club's resources, early access to events, and a seat at the planning table.`,
      category: seed.category,
      official: seed.official,
      members,
      memberCount: members.length,
      recruitment: { open: seed.recruiting.open, questions: [...seed.recruiting.questions], note: seed.recruiting.note, deadline: seed.recruiting.open ? at(10, 23, 59) : undefined },
      budget: seed.slug === 'finclub' ? { allocated: 150000, entries: [{ label: 'Trading game prizes', amount: 25000, kind: 'expense', at: new Date(), by: seed.lead._id }, { label: 'Sponsor: brokerage partner', amount: 40000, kind: 'income', at: new Date(), by: seed.lead._id }] } : { allocated: 0, entries: [] },
      tasks: seed.slug === 'finclub' ? [{ title: 'Book the auditorium for the trading game', assignee: devansh?._id, done: false, createdBy: seed.lead._id }, { title: 'Draft sponsor deck', done: true, createdBy: seed.lead._id }] : [],
    });
    const server = await createServer({ campus, ownerId: String(seed.lead._id), name: seed.name, kind: 'club', visibility: 'request', description: seed.tagline, linkedEntity: { kind: 'club', id: club._id } });
    for (const m of members.slice(1)) await addMember(String(server._id), String(m.user), { silent: true });
    club.hubServer = server._id;
    await club.save();
    clubs.push(club);
  }
  if (tanvi) await ClubApplication.create({ club: clubs[0]._id, user: tanvi._id, answers: ['Long Titan: jewellery is a moat with a brand on it.', 'A sector deep-dive series with alumni.'] });

  const code = () => String(Math.floor(1000 + Math.random() * 9000));
  const going = (...people: Array<{ _id: unknown } | undefined>) => people.filter(Boolean).map((p) => ({ user: p!._id, status: 'going', at: new Date(), checkedIn: false }));
  await Event.insertMany([
    { campus, title: 'Fireside chat: life as a PE associate', description: 'An alum two years into private equity on deal hours, what they wish they knew, and how recruiting really works.', category: 'career', club: clubs[0]?._id, host: arjun._id, startAt: at(2, 18), endAt: at(2, 19, 30), venue: 'Auditorium', capacity: 120, checkInCode: code(), rsvps: going(arjun, sneha, devansh, rohit), goingCount: 4 },
    { campus, title: 'Case prep marathon', description: 'Pairs, timers, and seniors floating around to give feedback. Bring a partner or get matched.', category: 'workshop', club: clubs[1]?._id, host: ananya._id, startAt: at(4, 10), endAt: at(4, 16), venue: 'Classroom block C', capacity: 40, checkInCode: code(), rsvps: going(ananya, priya, sneha, tanvi), goingCount: 4 },
    { campus, title: 'Improv night', description: 'No script, no stress. Watch or jump in.', category: 'social', club: clubs[2]?._id, host: meera._id, startAt: at(1, 20), endAt: at(1, 22), venue: 'Student activity centre', capacity: 0, checkInCode: code(), rsvps: going(meera, karthik), goingCount: 2 },
    { campus, title: 'Sunday 5k', description: 'Meet at the main gate. Water at the halfway point.', category: 'sports', club: clubs[3]?._id, host: devansh._id, startAt: at(5, 6, 30), endAt: at(5, 7, 30), venue: 'Main gate', capacity: 0, checkInCode: code(), rsvps: going(devansh, meera, arjun), goingCount: 3 },
    { campus, title: 'Diwali night', description: 'Food stalls, music, and the section dance-off.', category: 'fest', host: karthik._id, startAt: at(9, 19), endAt: at(9, 23), venue: 'Central lawns', capacity: 0, checkInCode: code(), rsvps: going(karthik, sneha, meera, priya, arjun), goingCount: 5 },
  ]);

  await Listing.insertMany([
    { campus, seller: priya._id, title: 'Kotler — Marketing Management (16th ed.)', description: 'Lightly highlighted in chapters 1–8. Saves you a trip to the library queue.', category: 'books', price: 450, condition: 'good' },
    { campus, seller: karthik._id, title: 'Hero Sprint cycle', description: 'Gears work, new tyres last month. Lock included.', category: 'cycles', price: 3200, condition: 'good', boostedUntil: at(2, 23) },
    { campus, seller: rohit._id, title: 'Room cooler (Symphony 40L)', description: 'Survived one Ahmedabad summer with honours.', category: 'electronics', price: 4000, condition: 'like-new', interested: [sneha._id] },
    { campus, seller: meera._id, title: 'Two tickets: Coldplay, Ahmedabad', description: 'Can’t make it. Selling at face value, not a rupee more.', category: 'tickets', price: 6500, negotiable: false, condition: 'new' },
    { campus, seller: ananya._id, title: 'Casebooks bundle (free)', description: 'Five years of casebooks, annotated. Pay it forward.', category: 'books', price: 0, condition: 'fair' },
  ]);

  await LostItem.insertMany([
    { campus, reporter: tanvi._id, kind: 'lost', title: 'Black Casio FX-991 calculator', description: 'Name sticker on the back.', location: 'Library, 2nd floor', when: at(-1, 15) },
    { campus, reporter: devansh._id, kind: 'found', title: 'Grey hoodie (M)', description: 'Left on the bench after football.', location: 'Sports complex', when: at(-2, 19) },
  ]);

  const weekStart = monday();
  await MessMenu.create({ campus, mess: 'Main mess', weekStart, days: WEEK_MENU, updatedBy: ananya._id });
  const today = new Date().toISOString().slice(0, 10);
  await MessRating.insertMany(
    [sneha, arjun, meera, priya].filter(Boolean).flatMap((p, i) => [
      { campus, mess: 'Main mess', user: p._id, day: today, meal: 'breakfast', rating: 3 + (i % 2) },
      { campus, mess: 'Main mess', user: p._id, day: today, meal: 'lunch', rating: 4 - (i % 3 === 0 ? 1 : 0) },
    ])
  );

  const teamSeeds = [
    { name: 'Team Alpha — Strategy Cup', purpose: 'Going for the national strategy case comp. We have strategy and finance covered.', captain: sneha, members: [tanvi], openRoles: ['Design / decks', 'Data & Excel'], looking: true },
    { name: 'Product Pioneers', purpose: 'Building a product teardown for the PM challenge.', captain: devansh, members: [meera, karthik], openRoles: ['UX research'], looking: true },
  ];
  for (const seed of teamSeeds) {
    if (!seed.captain) continue;
    const members = [seed.captain, ...seed.members.filter(Boolean)];
    const team = await Team.create({ campus, name: seed.name, purpose: seed.purpose, captain: seed.captain._id, members: members.map((m) => ({ user: m._id, joinedAt: new Date() })), maxSize: 4, openRoles: seed.openRoles, lookingForMembers: seed.looking });
    const server = await createServer({ campus, ownerId: String(seed.captain._id), name: seed.name, kind: 'team', visibility: 'invite', description: seed.purpose.slice(0, 140), linkedEntity: { kind: 'team', id: team._id } });
    for (const m of members.slice(1)) await addMember(String(server._id), String(m._id), { silent: true });
    team.hubServer = server._id;
    await team.save();
  }
  return `${clubs.length} clubs, 5 events, 5 listings, mess menu, 2 teams`;
}
