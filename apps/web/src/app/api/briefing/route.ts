import { z } from 'zod';
import { route, ok } from '@/lib/api/handler';
import { award } from '@/lib/gamification';
import NewsItem from '@/models/career/NewsItem';
import { istDay } from '@/server/modules/briefing/service';

const querySchema = z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

/** The day's briefing (or the most recent one), plus the days available. */
export const GET = route({ feature: 'news', query: querySchema }, async ({ query }) => {
  const latest = await NewsItem.findOne().sort({ day: -1 }).select('day').lean();
  const day = query.day ?? latest?.day ?? istDay();
  const [items, days] = await Promise.all([
    NewsItem.find({ day }).sort({ publishedAt: -1 }).limit(12).lean(),
    NewsItem.distinct('day'),
  ]);
  return ok({
    day,
    today: istDay(),
    days: (days as string[]).sort().reverse().slice(0, 14),
    items: items.map((n) => ({ _id: String(n._id), title: n.title, url: n.url, source: n.source, publishedAt: n.publishedAt, summary: n.summary, whyItMatters: n.whyItMatters, gdAngle: n.gdAngle, category: n.category, tags: n.tags })),
  });
});

/** Finishing the briefing counts toward the daily habit. */
export const POST = route({ feature: 'news', rateLimit: 'write' }, async ({ actor }) => {
  const result = await award(actor.id, 'news_read');
  return ok({ points: result.awarded ? result.amount : 0 });
});
