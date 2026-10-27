import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z, type ZodType } from 'zod';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongodb';
import { ApiError, toErrorResponse } from './errors';
import { consume, type RateLimitName, clientIdentifier } from './rate-limit';
import { MENTOR_ROLES, MODERATOR_ROLES, STAFF_ROLES, type UserRole } from '@/lib/constants';

/** The authenticated caller, resolved once per request. */
export interface Actor {
  id: string;
  name: string;
  email: string;
  campus: string;
  batch: string;
  year: 1 | 2;
  role: UserRole;
  canMentor: boolean;
  canModerate: boolean;
  canReadReport: boolean;
}

export interface RouteContext<TBody, TQuery> {
  request: NextRequest;
  actor: Actor;
  body: TBody;
  query: TQuery;
  params: Record<string, string>;
}

interface RouteOptions<TBody, TQuery> {
  /** Schema for the JSON request body. Omit for methods without one. */
  body?: ZodType<TBody>;
  /** Schema applied to URL search params. */
  query?: ZodType<TQuery>;
  /** Throttle bucket, keyed on the caller's user id. */
  rateLimit?: RateLimitName;
  /** Restrict the route to roles able to host sessions. */
  requireMentor?: boolean;
  /** Restrict the route to moderators and admins. */
  requireModerator?: boolean;
  /** Restrict the route to institute staff reading the campus report. */
  requireStaff?: boolean;
}

type Handler<TBody, TQuery> = (
  ctx: RouteContext<TBody, TQuery>
) => Promise<NextResponse | Response>;

type NextRouteArgs = { params: Promise<Record<string, string>> };

/**
 * Wraps an authenticated route handler with the concerns every route in this
 * app needs: session resolution, role gating, DB connection, body and query
 * validation, throttling, and uniform error serialisation. Handlers below this
 * line can assume a valid `actor` and parsed input, and may `throw ApiError`.
 */
export function route<TBody = undefined, TQuery = undefined>(
  options: RouteOptions<TBody, TQuery>,
  handler: Handler<TBody, TQuery>
) {
  return async (request: NextRequest, routeArgs?: NextRouteArgs): Promise<Response> => {
    try {
      const session = await auth();
      if (!session?.user?.id) throw ApiError.unauthorized();

      const actor: Actor = {
        id: session.user.id,
        name: session.user.name ?? '',
        email: session.user.email ?? '',
        campus: session.user.campus,
        batch: session.user.batch,
        year: session.user.year,
        role: session.user.role,
        canMentor: MENTOR_ROLES.includes(session.user.role),
        canModerate: MODERATOR_ROLES.includes(session.user.role),
        canReadReport: STAFF_ROLES.includes(session.user.role),
      };

      if (options.requireMentor && !actor.canMentor) {
        throw ApiError.forbidden('Only seniors, alumni, and staff can do this.');
      }
      if (options.requireModerator && !actor.canModerate) {
        throw ApiError.forbidden('Moderator access required.');
      }
      if (options.requireStaff && !actor.canReadReport) {
        throw ApiError.forbidden('This report is limited to institute staff.');
      }

      // Throttle on identity so one account cannot burn a shared IP's budget.
      if (options.rateLimit) consume(options.rateLimit, actor.id);

      /*
       * Input is validated before the database is touched. A malformed request
       * should cost a schema parse, not a connection from the pool — and it
       * means a validation failure reports as 422 even when the database is
       * unreachable, rather than being masked by a connection error.
       */
      const body = options.body ? await parseBody(request, options.body) : (undefined as TBody);
      const query = options.query
        ? parseQuery(request, options.query)
        : (undefined as TQuery);

      await connectDB();

      const params = routeArgs ? await routeArgs.params : {};

      return await handler({ request, actor, body, query, params });
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

/**
 * Same wrapper for routes that must work without a session (registration).
 * Throttling keys on client IP since there is no user yet.
 */
export function publicRoute<TBody = undefined, TQuery = undefined>(
  options: Omit<RouteOptions<TBody, TQuery>, 'requireMentor' | 'requireModerator'>,
  handler: (ctx: Omit<RouteContext<TBody, TQuery>, 'actor'>) => Promise<NextResponse | Response>
) {
  return async (request: NextRequest, routeArgs?: NextRouteArgs): Promise<Response> => {
    try {
      if (options.rateLimit) consume(options.rateLimit, clientIdentifier(request));

      // Validate before connecting, as in `route` above.
      const body = options.body ? await parseBody(request, options.body) : (undefined as TBody);
      const query = options.query ? parseQuery(request, options.query) : (undefined as TQuery);

      await connectDB();

      const params = routeArgs ? await routeArgs.params : {};

      return await handler({ request, body, query, params });
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

async function parseBody<T>(request: NextRequest, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw ApiError.badRequest('Expected a JSON body.');
  }
  return schema.parse(raw);
}

function parseQuery<T>(request: NextRequest, schema: ZodType<T>): T {
  const searchParams = new URL(request.url).searchParams;
  const raw: Record<string, string> = {};
  for (const [key, value] of searchParams) raw[key] = value;
  return schema.parse(raw);
}

/** Shorthand for a successful JSON response. */
export function ok<T>(data: T, init?: ResponseInit): NextResponse<T> {
  return NextResponse.json(data, init);
}

export function created<T>(data: T): NextResponse<T> {
  return NextResponse.json(data, { status: 201 });
}

/** Reusable cursor-free pagination inputs. */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(500).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type Pagination = z.infer<typeof paginationSchema>;

export function paginate({ page, limit }: Pagination) {
  return { skip: (page - 1) * limit, limit };
}

export function pageMeta({ page, limit }: Pagination, total: number) {
  return { page, limit, total, hasMore: page * limit < total };
}
