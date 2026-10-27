import { randomInt } from 'node:crypto';
import { Types } from 'mongoose';
import type { Actor } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { award } from '@/lib/gamification';
import { notify, notifyMany } from '@/lib/notifications';
import Event, { type IEvent } from '@/models/campus/Event';
import Club from '@/models/campus/Club';
import User from '@/models/User';
import { canManageClub } from './clubs';

const oid = (id: string) => new Types.ObjectId(id);

export async function loadEvent(id: string, campus: string) {
  if (!Types.ObjectId.isValid(id)) throw ApiError.notFound('That event does not exist.');
  const event = await Event.findOne({ _id: id, campus }).lean();
  if (!event) throw ApiError.notFound('That event does not exist.');
  return event;
}

export async function canManageEvent(event: Pick<IEvent, 'host' | 'club'>, actor: Actor): Promise<boolean> {
  if (String(event.host) === actor.id || actor.canModerate) return true;
  if (event.club) {
    const club = await Club.findById(event.club).select('members').lean();
    return Boolean(club && canManageClub(club, actor.id));
  }
  return false;
}

export function newCheckInCode() {
  return String(randomInt(0, 10_000)).padStart(4, '0');
}

export function viewEvent(event: IEvent, viewerId: string, canManage: boolean, people: Map<string, { name: string; image?: string }>) {
  const mine = event.rsvps.find((r) => String(r.user) === viewerId);
  const going = event.rsvps.filter((r) => r.status === 'going');
  return {
    _id: String(event._id),
    title: event.title,
    description: event.description,
    category: event.category,
    club: event.club ? String(event.club) : null,
    host: { _id: String(event.host), name: people.get(String(event.host))?.name ?? 'Host' },
    startAt: event.startAt,
    endAt: event.endAt,
    venue: event.venue,
    onlineUrl: mine?.status === 'going' || canManage ? event.onlineUrl : event.onlineUrl ? 'on-rsvp' : '',
    capacity: event.capacity,
    coverImage: event.coverImage,
    status: event.status,
    goingCount: going.length,
    interestedCount: event.rsvps.filter((r) => r.status === 'interested').length,
    waitlistCount: event.rsvps.filter((r) => r.status === 'waitlist').length,
    attendees: going.slice(0, 12).map((r) => ({ _id: String(r.user), name: people.get(String(r.user))?.name ?? 'Someone', image: people.get(String(r.user))?.image ?? '' })),
    mine: mine ? { status: mine.status, checkedIn: mine.checkedIn } : null,
    canManage,
    checkInCode: canManage ? event.checkInCode : undefined,
    checkedInCount: canManage ? event.rsvps.filter((r) => r.checkedIn).length : undefined,
  };
}

/**
 * Going / interested / not going. A full event puts "going" on the waitlist;
 * leaving a seat promotes the first person waiting and tells them.
 */
export async function rsvp(eventId: string, actor: Actor, status: 'going' | 'interested' | null) {
  const event = await loadEvent(eventId, actor.campus);
  if (event.status === 'cancelled') throw ApiError.conflict('This event was cancelled.');
  if (event.endAt < new Date()) throw ApiError.conflict('This event has already happened.');
  const previous = event.rsvps.find((r) => String(r.user) === actor.id);

  await Event.updateOne({ _id: event._id }, { $pull: { rsvps: { user: oid(actor.id) } } });
  let final: 'going' | 'interested' | 'waitlist' | null = status;
  if (status) {
    const going = await Event.findById(event._id).select('rsvps capacity').lean();
    const goingCount = going!.rsvps.filter((r) => r.status === 'going').length;
    if (status === 'going' && event.capacity > 0 && goingCount >= event.capacity) final = 'waitlist';
    await Event.updateOne({ _id: event._id }, { $push: { rsvps: { user: oid(actor.id), status: final, at: previous?.at ?? new Date(), checkedIn: previous?.checkedIn ?? false } } });
  }

  // A seat opened: promote the longest-waiting person.
  if (previous?.status === 'going' && final !== 'going' && event.capacity > 0) {
    const fresh = await Event.findById(event._id).select('rsvps title').lean();
    const next = fresh?.rsvps.filter((r) => r.status === 'waitlist').sort((a, b) => a.at.getTime() - b.at.getTime())[0];
    if (next) {
      await Event.updateOne({ _id: event._id, 'rsvps.user': next.user }, { $set: { 'rsvps.$.status': 'going' } });
      await notify({ user: next.user, kind: 'event_update', title: `A spot opened up: ${event.title}`, body: 'You are off the waitlist and going.', href: `/events/${event._id}`, entityType: 'Event', entity: event._id });
    }
  }
  await syncGoingCount(event._id);
  return final;
}

async function syncGoingCount(eventId: Types.ObjectId) {
  const event = await Event.findById(eventId).select('rsvps').lean();
  if (event) await Event.updateOne({ _id: eventId }, { $set: { goingCount: event.rsvps.filter((r) => r.status === 'going').length } });
}

/** Attendee checks in with the code shown at the venue, during the event window. */
export async function checkIn(eventId: string, actor: Actor, code: string) {
  const event = await loadEvent(eventId, actor.campus);
  const now = Date.now();
  if (now < event.startAt.getTime() - 30 * 60_000 || now > event.endAt.getTime() + 60 * 60_000) throw ApiError.conflict('Check-in opens 30 minutes before the event and closes an hour after.');
  if (code !== event.checkInCode) throw ApiError.unprocessable('That code does not match. Ask the organisers for it.');
  const hasRsvp = event.rsvps.some((r) => String(r.user) === actor.id);
  if (hasRsvp) await Event.updateOne({ _id: event._id, 'rsvps.user': oid(actor.id) }, { $set: { 'rsvps.$.checkedIn': true, 'rsvps.$.status': 'going' } });
  else await Event.updateOne({ _id: event._id }, { $push: { rsvps: { user: oid(actor.id), status: 'going', at: new Date(), checkedIn: true } } });
  await syncGoingCount(event._id);
  await award(actor.id, 'event_attended', { entityType: 'Event', entity: event._id });
  // The host earns once their event actually draws people in.
  await award(String(event.host), 'event_hosted', { entityType: 'Event', entity: event._id });
}

export async function cancelEvent(eventId: string, actor: Actor) {
  const event = await loadEvent(eventId, actor.campus);
  if (!(await canManageEvent(event, actor))) throw ApiError.forbidden('Only the organisers can cancel this.');
  await Event.updateOne({ _id: event._id }, { $set: { status: 'cancelled' } });
  await notifyMany(
    event.rsvps.map((r) => ({ user: r.user, kind: 'event_update' as const, title: `Cancelled: ${event.title}`, href: `/events/${event._id}`, actor: actor.id, entityType: 'Event', entity: event._id }))
  );
}

export async function peopleFor(ids: Array<Types.ObjectId | string>) {
  const users = await User.find({ _id: { $in: ids } }).select('name image').lean();
  return new Map(users.map((u) => [String(u._id), { name: u.name, image: u.image }]));
}
