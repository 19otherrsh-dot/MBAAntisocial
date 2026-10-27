import type { TodayCards } from '@/server/modules/today/service';

export type { TodayCards };

export interface TodayResponse {
  timeZone: string;
  dayKey: string;
  generatedAt: string;
  edition: 'open' | 'campus' | 'none';
  cards: Partial<TodayCards>;
  failed: string[];
}
