import { isValidObjectId } from 'mongoose';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongodb';
import Event from '@/models/campus/Event';
import Club from '@/models/campus/Club';
import Team from '@/models/campus/Team';
import Tournament from '@/models/games/Tournament';
import CompanyPage from '@/models/career/CompanyPage';
import User from '@/models/User';
import { getGame } from '@/server/modules/games/registry';

/**
 * Tab titles for detail pages. Campus records are named only for a signed-in
 * viewer on the same campus, so a title never says more than the page would.
 * Anything unknown falls back to the section title (`null`).
 */
type Resolver = (id: string, campus: string) => Promise<string | null | undefined>;

const byId = (fn: (id: string, campus: string) => Promise<string | null | undefined>): Resolver => (id, campus) =>
  isValidObjectId(id) ? fn(id, campus) : Promise.resolve(null);

const RESOLVERS = {
  game: async (id) => (await getGame(id))?.title,
  event: byId(async (id, campus) => (await Event.findOne({ _id: id, campus }).select('title').lean())?.title),
  club: async (slug, campus) => (await Club.findOne({ slug, campus }).select('name').lean())?.name,
  team: byId(async (id, campus) => (await Team.findOne({ _id: id, campus }).select('name').lean())?.name),
  tournament: byId(async (id, campus) => (await Tournament.findOne({ _id: id, campus }).select('title').lean())?.title),
  company: async (key, campus) => (await CompanyPage.findOne({ key, campus }).select('name').lean())?.name,
  person: byId(async (id, campus) => (await User.findOne({ _id: id, campus, suspendedAt: { $exists: false } }).select('name').lean())?.name),
} satisfies Record<string, Resolver>;

export type TitleKind = keyof typeof RESOLVERS;

export async function detailTitle(kind: TitleKind, id: string): Promise<string | null> {
  try {
    const session = await auth();
    if (!session?.user?.campus) return null;
    await connectDB();
    return (await RESOLVERS[kind](decodeURIComponent(id), session.user.campus)) ?? null;
  } catch {
    return null;
  }
}
