import { route, ok } from '@/lib/api/handler';
import { peopleQuerySchema, searchPeople } from '@/server/modules/admin/people';

export const GET = route({ requirePlatformAdmin: true, query: peopleQuerySchema, rateLimit: 'search' }, async ({ query }) =>
  ok({ people: await searchPeople(query, null) })
);
