import type { Actor } from '@/lib/api/handler';

export interface SearchResult {
  id: string;
  type: string;
  title: string;
  subtitle?: string;
  href: string;
}

/**
 * One searchable domain. Each module contributes a provider; the search route
 * fans out to all of them in parallel. Providers must scope to the actor's
 * campus themselves — search is not a way around campus scoping.
 */
export interface SearchProvider {
  type: string;
  label: string;
  /** Campus Edition only? Providers for campus data say so. */
  campusOnly: boolean;
  search(actor: Actor, pattern: RegExp, limit: number): Promise<SearchResult[]>;
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
