import Club from '@/models/campus/Club';
import Event from '@/models/campus/Event';
import Listing from '@/models/campus/Listing';
import Team from '@/models/campus/Team';
import type { SearchProvider } from '../search/types';

const clubs: SearchProvider = {
  type: 'club',
  label: 'Clubs',
  campusOnly: true,
  async search(actor, pattern, limit) {
    const rows = await Club.find({ campus: actor.campus, archivedAt: { $exists: false }, name: pattern }).select('name slug tagline').limit(limit).lean();
    return rows.map((c) => ({ id: String(c._id), type: 'club', title: c.name, subtitle: c.tagline, href: `/clubs/${c.slug}` }));
  },
};

const events: SearchProvider = {
  type: 'event',
  label: 'Events',
  campusOnly: true,
  async search(actor, pattern, limit) {
    const rows = await Event.find({ campus: actor.campus, status: 'scheduled', endAt: { $gte: new Date() }, title: pattern }).select('title startAt').sort({ startAt: 1 }).limit(limit).lean();
    return rows.map((e) => ({ id: String(e._id), type: 'event', title: e.title, subtitle: e.startAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), href: `/events/${e._id}` }));
  },
};

const listings: SearchProvider = {
  type: 'listing',
  label: 'Marketplace',
  campusOnly: true,
  async search(actor, pattern, limit) {
    const rows = await Listing.find({ campus: actor.campus, status: 'active', title: pattern }).select('title price').limit(limit).lean();
    return rows.map((l) => ({ id: String(l._id), type: 'listing', title: l.title, subtitle: l.price ? `₹${l.price.toLocaleString('en-IN')}` : 'Free', href: `/marketplace?listing=${l._id}` }));
  },
};

const teams: SearchProvider = {
  type: 'team',
  label: 'Teams',
  campusOnly: true,
  async search(actor, pattern, limit) {
    const rows = await Team.find({ campus: actor.campus, archivedAt: { $exists: false }, name: pattern }).select('name lookingForMembers').limit(limit).lean();
    return rows.map((t) => ({ id: String(t._id), type: 'team', title: t.name, subtitle: t.lookingForMembers ? 'Looking for members' : 'Team', href: `/teams?team=${t._id}` }));
  },
};

export const campusLifeSearchProviders: SearchProvider[] = [clubs, events, listings, teams];
