/**
 * A deliberately small RSS/Atom reader: titles, links, dates, descriptions.
 * Feeds are trusted publishers configured by the operator, and nothing here
 * is rendered as HTML — tags are stripped before anything is stored.
 */
/** Indian business publishers' public RSS feeds; override with NEWS_FEEDS. */
export const DEFAULT_FEEDS = [
  'https://www.thehindubusinessline.com/feeder/default.rss',
  'https://economictimes.indiatimes.com/rssfeedstopstories.cms',
  'https://www.livemint.com/rss/companies',
];

export interface FeedEntry {
  title: string;
  url: string;
  publishedAt: Date;
  description: string;
  source: string;
}

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();

function tag(block: string, name: string): string {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(block);
  return m ? decode(m[1]) : '';
}

export function parseFeed(xml: string, source: string): FeedEntry[] {
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  const out: FeedEntry[] = [];
  for (const block of items) {
    const title = tag(block, 'title');
    let url = tag(block, 'link');
    if (!url) url = /<link[^>]*href="([^"]+)"/i.exec(block)?.[1] ?? '';
    const date = tag(block, 'pubDate') || tag(block, 'published') || tag(block, 'updated') || tag(block, 'dc:date');
    const publishedAt = date ? new Date(date) : new Date();
    if (!title || !/^https?:\/\//.test(url) || Number.isNaN(publishedAt.getTime())) continue;
    out.push({ title: title.slice(0, 300), url: url.slice(0, 1000), publishedAt, description: (tag(block, 'description') || tag(block, 'summary')).slice(0, 800), source });
  }
  return out;
}

export async function fetchFeed(url: string, timeoutMs = 8000): Promise<FeedEntry[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'MBA-Antisocial-Briefing/1.0', Accept: 'application/rss+xml, application/atom+xml, text/xml' } });
    if (!res.ok) throw new Error(`${res.status}`);
    const text = (await res.text()).slice(0, 2_000_000);
    return parseFeed(text, new URL(url).hostname.replace(/^www\./, ''));
  } finally {
    clearTimeout(timer);
  }
}
