import { route, ok, created } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import connectDB from '@/lib/mongodb';
import Contact from '@/models/Contact';
import { createContactSchema, updateContactSchema } from '@/lib/validation';

/**
 * A user's private contact list.
 *
 * Every query filters on `owner` alongside the id, so a contact belonging to
 * someone else simply matches nothing — ownership is never a separate check
 * that could be forgotten.
 */
export const GET = route({}, async ({ actor }) => {
  await connectDB();

  // Oldest contact first: the top of this list is who is due a follow-up.
  const contacts = await Contact.find({ owner: actor.id }).sort({ lastContactedAt: 1 }).lean();

  return ok({ contacts: contacts.map((c) => ({ ...c, _id: String(c._id) })) });
});

// Validation goes through the wrapper rather than a manual `safeParse`, so a
// bad body produces the same 422 envelope as every other endpoint.
export const POST = route(
  { body: createContactSchema, rateLimit: 'write' },
  async ({ actor, body }) => {
    const contact = await Contact.create({
      ...body,
      owner: actor.id,
      campus: actor.campus,
      lastContactedAt: new Date(),
    });

    return created({ contact: { ...contact.toObject(), _id: String(contact._id) } });
  }
);

export const PATCH = route(
  { body: updateContactSchema, rateLimit: 'write' },
  async ({ actor, body }) => {
    const { contactId, bumpLastContacted, ...updates } = body;

    const contact = await Contact.findOne({ _id: contactId, owner: actor.id });
    if (!contact) {
      throw ApiError.notFound('That contact is not in your list.');
    }

    if (bumpLastContacted) contact.lastContactedAt = new Date();

    if (updates.name !== undefined) contact.name = updates.name;
    if (updates.company !== undefined) contact.company = updates.company;
    if (updates.role !== undefined) contact.role = updates.role;
    if (updates.status !== undefined) contact.status = updates.status;
    if (updates.notes !== undefined) contact.notes = updates.notes;

    await contact.save();

    return ok({ contact: { ...contact.toObject(), _id: String(contact._id) } });
  }
);
