/**
 * Fetches every news feed with the app's own parser and reports what came
 * back. Run where the internet is reachable (CI's integrations workflow):
 *
 *   npm run check-feeds -w @mba/web            # the built-in list
 *   NEWS_FEEDS=https://a/rss,https://b/rss npm run check-feeds -w @mba/web
 *
 * Fails when fewer than half the feeds return any fresh story, which is when
 * the daily briefing would fall back to headlines from the curated bank.
 */
import { DEFAULT_FEEDS, fetchFeed } from '../src/server/modules/briefing/rss';

const feeds = process.env.NEWS_FEEDS ? process.env.NEWS_FEEDS.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_FEEDS;
const since = Date.now() - 36 * 60 * 60_000;

async function main() {
  let healthy = 0;
  for (const url of feeds) {
    try {
      const entries = await fetchFeed(url, 15_000);
      const fresh = entries.filter((e) => e.publishedAt.getTime() >= since);
      const sample = fresh[0] ?? entries[0];
      console.log(`${fresh.length > 0 ? '✓' : '✗'} ${url}\n    ${entries.length} stories, ${fresh.length} in the last 36 h${sample ? `; e.g. "${sample.title.slice(0, 80)}"` : ''}`);
      if (fresh.length > 0) healthy += 1;
    } catch (error) {
      console.log(`✗ ${url}\n    ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log(`\n${healthy} of ${feeds.length} feeds have fresh stories.`);
  if (healthy * 2 < feeds.length) process.exit(1);
}

void main();
