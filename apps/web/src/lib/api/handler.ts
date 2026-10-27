import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { z, type ZodType } from 'zod';
import { auth } from '@/lib/auth';
import connectDB from '@/lib/mongodb';
import { ApiError, toErrorResponse } from './errors';
import { consume, type RateLimitName, clientIdentifier } from './rate-limit';
import {
  CAMPUS_ADMIN_ROLES,
  MENTOR_ROLES,
  MODERATOR_ROLES,
  STAFF_ROLES,
  type UserRole,
} from '@/lib/constants';
import { env } from '@/lib/env';
import { featureAvailable, type FeatureKey, type CampusStatus } from '@mba/shared/campus';
import { campusEdition } from '@/server/modules/campus/service';
import { verifyAccessToken, type SessionUser } from '@/server/modules/auth/service';
import { safeEqual } from '@/server/crypto';

/** The authenticated caller, resolved once per request. */
export interface Actor {
  id: string;
  name: string;
  email: string;
  campus: string;
  campusSlug: string;
  campusStatus: CampusStatus;
  edition: 'open' | 'campus' | 'none';
  batch: string;
  year: 1 | 2;
  role: UserRole;
  verified: boolean;
  /** How the request authenticated: a browser session or a native-app bearer token. */
  via: 'session' | 'bearer';
  canMentor: boolean;
  canModerate: boolean;
  canReadReport: boolean;
  canAdminCampus: boolean;
  isPlatformAdmin: boolean;
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
  /** Restrict the route to campus administrators (and platform admins). */
  requireCampusAdmin?: boolean;
  /** Restrict the route to platform administrators. */
  requirePlatformAdmin?: boolean;
  /**
   * The product surface this route serves. Campus-Edition surfaces answer 403
   * until the caller's campus has unlocked (PRD §15).
   */
  feature?: FeatureKey;
  /**
   * Routes an unverified account may still call: its own profile, resending the
   * verification email, onboarding. Everything else needs a proven address.
   */
  allowUnverified?: boolean;
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
      const actor = await resolveActor(request);
      if (!actor) throw ApiError.unauthorized();

      if (!actor.verified && !options.allowUnverified) {
        throw new ApiError(403, 'email_unverified', 'Confirm your institute email first — check your inbox.');
      }
      if (actor.edition === 'none' && !options.allowUnverified) {
        throw new ApiError(403, 'campus_suspended', 'Your campus is paused on MBAAntisocial.');
      }
      if (options.feature && !featureAvailable(options.feature, actor.edition)) {
        throw new ApiError(
          403,
          'campus_locked',
          'This unlocks when enough of your campus joins. Invite your batch and seniors to get there sooner.'
        );
      }
      if (options.requirePlatformAdmin && !actor.isPlatformAdmin) {
        throw ApiError.forbidden('Platform administrators only.');
      }
      if (options.requireCampusAdmin && !actor.canAdminCampus) {
        throw ApiError.forbidden('Campus administrators only.');
      }

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
      if (options.rateLimit) await consume(options.rateLimit, actor.id);

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
      if (options.rateLimit) await consume(options.rateLimit, clientIdentifier(request));

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

/**
 * Resolves the caller from a native-app bearer token or the browser session.
 * Bearer is checked first so a WebView carrying both behaves like the app.
 */
async function resolveActor(request: NextRequest): Promise<Actor | null> {
  let user: SessionUser | null = null;
  let via: Actor['via'] = 'session';

  const header = request.headers.get('authorization');
  if (header?.startsWith('Bearer ')) {
    user = await verifyAccessToken(header.slice(7).trim());
    via = 'bearer';
    if (!user) return null;
  } else {
    const session = await auth();
    if (!session?.user?.id) return null;
    user = {
      id: session.user.id,
      name: session.user.name ?? '',
      email: session.user.email ?? '',
      image: session.user.image ?? null,
      campus: session.user.campus,
      batch: session.user.batch,
      year: session.user.year,
      role: session.user.role,
      onboardedAt: session.user.onboardedAt,
      verified: session.user.verified ?? false,
    };
  }

  await connectDB();
  const edition = await campusEdition(user.campus);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    campus: user.campus,
    campusSlug: edition.slug,
    campusStatus: edition.status,
    // Platform admins see every surface, whatever their own campus has unlocked.
    edition: user.role === 'admin' ? 'campus' : edition.edition,
    batch: user.batch,
    year: user.year,
    role: user.role,
    verified: user.verified,
    via,
    canMentor: MENTOR_ROLES.includes(user.role),
    canModerate: MODERATOR_ROLES.includes(user.role),
    canReadReport: STAFF_ROLES.includes(user.role),
    canAdminCampus: CAMPUS_ADMIN_ROLES.includes(user.role),
    isPlatformAdmin: user.role === 'admin',
  };
}

/**
 * Service-to-service routes (apps/realtime → web). Authenticated by a shared
 * secret in `x-internal-secret`, compared in constant time.
 */
export function internalRoute<TBody = undefined>(
  options: { body?: ZodType<TBody> },
  handler: (ctx: { request: NextRequest; body: TBody; params: Record<string, string> }) => Promise<Response>
) {
  return async (request: NextRequest, routeArgs?: NextRouteArgs): Promise<Response> => {
    try {
      const provided = request.headers.get('x-internal-secret') ?? '';
      if (!provided || !safeEqual(provided, env.internalApiSecret)) throw ApiError.unauthorized('Unknown caller.');
      const body = options.body ? await parseBody(request, options.body) : (undefined as TBody);
      await connectDB();
      const params = routeArgs ? await routeArgs.params : {};
      return await handler({ request, body, params });
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

/**
 * Scheduled jobs. Vercel Cron and the docker worker both send
 * `Authorization: Bearer $CRON_SECRET`. Without a configured secret the routes
 * only answer in development, so production can never run them unauthenticated.
 */
export function cronRoute(handler: (ctx: { request: NextRequest }) => Promise<Response>) {
  return async (request: NextRequest): Promise<Response> => {
    try {
      const secret = env.CRON_SECRET;
      const header = request.headers.get('authorization') ?? '';
      if (secret) {
        if (!safeEqual(header, `Bearer ${secret}`)) throw ApiError.unauthorized('Bad cron credentials.');
      } else if (env.isProduction) {
        throw new ApiError(503, 'cron_disabled', 'Set CRON_SECRET to enable scheduled jobs.');
      }
      await connectDB();
      return await handler({ request });
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
