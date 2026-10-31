import { z } from 'zod';
import { env } from '@/lib/env';
import NewsItem, { NEWS_CATEGORIES } from '@/models/career/NewsItem';
import { QuizDay } from '@/models/career/Quiz';
import { container } from '../../container';
import { QUIZ_SYSTEM, quizSchema } from '../ai/prompts';
import { bankQuizFor } from './bank';
import { DEFAULT_FEEDS, fetchFeed, type FeedEntry } from './rss';

export function istDay(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

const briefSchema = z.object({
  stories: z.array(
    z.object({
      index: z.number().int().describe('Index of the story in the input list'),
      summary: z.string().describe('Two or three sentences, plain and factual'),
      whyItMatters: z.string().describe('One or two sentences on why an MBA candidate should care'),
      gdAngle: z.string().describe('A debatable question this raises, phrased for a group discussion'),
      category: z.enum(NEWS_CATEGORIES),
      tags: z.array(z.string()).max(4),
    })
  ),
});

const BRIEF_SYSTEM = `You curate a five-minute daily business briefing for Indian MBA students preparing for placement interviews and group discussions.
From the headlines given, pick the 6–8 that matter most for business, economy, markets, policy, and technology — skip crime, celebrity, sport, and duplicates.
Summaries use only what the headline and description say; never add figures that are not there.`;

/**
 * Pulls the feeds, keeps stories not seen before, and has the assistant pick
 * and summarise the day's set. Without an AI key, the newest headlines are
 * stored with their feed descriptions so the page still works.
 */
export async function refreshBriefing(now = new Date()) {
  const feeds = env.NEWS_FEEDS ? env.NEWS_FEEDS.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_FEEDS;
  const settled = await Promise.allSettled(feeds.map((f) => fetchFeed(f)));
  const entries: FeedEntry[] = settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  const failedFeeds = settled.filter((r) => r.status === 'rejected').length;
  const since = new Date(now.getTime() - 36 * 60 * 60_000);
  const fresh = entries.filter((e) => e.publishedAt >= since);
  const known = new Set((await NewsItem.find({ url: { $in: fresh.map((e) => e.url) } }).select('url').lean()).map((n) => n.url));
  const candidates = fresh.filter((e) => !known.has(e.url)).slice(0, 40);
  const day = istDay(now);
  if (candidates.length === 0) return { day, added: 0, failedFeeds };

  const { ai } = container();
  let rows: Array<Record<string, unknown>> = [];
  if (ai.configured) {
    try {
      const picked = await ai.structured({
        system: BRIEF_SYSTEM,
        prompt: candidates.map((c, i) => `[${i}] ${c.title} — ${c.description} (${c.source})`).join('\n'),
        schema: briefSchema,
        effort: 'low',
        maxTokens: 6000,
        userId: 'system',
        feature: 'briefing',
      });
      rows = picked.stories
        .filter((s) => candidates[s.index])
        .map((s) => ({ ...candidates[s.index], day, summary: s.summary, whyItMatters: s.whyItMatters, gdAngle: s.gdAngle, category: s.category, tags: s.tags }));
    } catch (error) {
      console.error('[briefing] summarising failed, storing headlines only:', error);
    }
  }
  if (rows.length === 0) rows = candidates.slice(0, 8).map((c) => ({ ...c, day, summary: c.description, whyItMatters: '', gdAngle: '', category: 'business', tags: [] }));
  const result = await NewsItem.insertMany(rows, { ordered: false }).catch((e: { insertedDocs?: unknown[] }) => e.insertedDocs ?? []);
  return { day, added: Array.isArray(result) ? result.length : 0, failedFeeds };
}

/** Today's quiz: generated from the briefing when possible, from the bank otherwise. */
export async function ensureQuiz(day = istDay()) {
  const existing = await QuizDay.findOne({ day }).lean();
  if (existing) return existing;
  const { ai } = container();
  const news = await NewsItem.find({ day }).sort({ publishedAt: -1 }).limit(8).lean();
  let questions = bankQuizFor(day);
  let source: 'ai' | 'bank' = 'bank';
  if (ai.configured && news.length >= 4) {
    try {
      const generated = await ai.structured({
        system: QUIZ_SYSTEM,
        prompt: `Write exactly five questions from this briefing:\n\n${news.map((n) => `- ${n.title}: ${n.summary}`).join('\n')}`,
        schema: quizSchema,
        effort: 'low',
        maxTokens: 4000,
        userId: 'system',
        feature: 'quiz',
      });
      if (generated.questions.length >= 5) {
        questions = generated.questions.slice(0, 5);
        source = 'ai';
      }
    } catch (error) {
      console.error('[quiz] generation failed, using the bank:', error);
    }
  }
  try {
    return (await QuizDay.create({ day, questions, source })).toObject();
  } catch {
    // Another request created it first.
    return (await QuizDay.findOne({ day }).lean())!;
  }
}
