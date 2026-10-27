import { route, ok } from '@/lib/api/handler';
import { peopleQuerySchema, searchPeople } from '@/server/modules/admin/people';

/** People on the caller's campus, to assign roles. */
export const GET = route({ requireCampusAdmin: true, query: peopleQuerySchema, rateLimit: 'search' }, async ({ actor, query }) =>
  ok({ people: await searchPeople(query, actor.campus) })
);
