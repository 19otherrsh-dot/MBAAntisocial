import type { DefaultSession } from 'next-auth';
import type { UserRole } from '@/lib/constants';

/**
 * Fields the app puts on the session. Declaring them here removes the need for
 * `session.user as Record<string, unknown>` casts at every call site.
 */
interface AppUserFields {
  id: string;
  campus: string;
  batch: string;
  year: 1 | 2;
  role: UserRole;
  onboardedAt: string | null;
}

declare module 'next-auth' {
  interface Session {
    user: AppUserFields & DefaultSession['user'];
  }

  // Empty bodies are the point: these declarations exist to widen the library's
  // interfaces via declaration merging, not to add members of their own.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface User extends Partial<AppUserFields> {}
}

/**
 * The JWT interface is declared in `@auth/core/jwt`; `next-auth/jwt` only
 * re-exports it, and augmenting a re-export does not reach the original
 * declaration. Without this the base `Record<string, unknown>` index signature
 * wins and every token field reads back as `unknown`.
 */
declare module '@auth/core/jwt' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface JWT extends AppUserFields {}
}

export {};
