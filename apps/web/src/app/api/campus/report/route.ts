import { z } from 'zod';
import { route, ok } from '@/lib/api/handler';
import connectDB from '@/lib/mongodb';
import { buildCampusReport, reportToCsv } from '@/lib/report';

const querySchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
});

/**
 * The aggregate campus report, for institute staff.
 *
 * Scoped to the caller's own campus — there is no parameter for choosing
 * another one, so a staff account at one institute cannot read a second. Every
 * breakdown inside is subject to the disclosure floor in `lib/report.ts`.
 */
export const GET = route({ query: querySchema, requireStaff: true, rateLimit: 'report' }, async ({ actor, query }) => {
  await connectDB();

  const report = await buildCampusReport(actor.campus);

  if (query.format === 'csv') {
    const stamp = report.generatedAt.slice(0, 10);
    const filename = `${actor.campus.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${stamp}.csv`;

    return new Response(reportToCsv(report), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        // A report is a snapshot of live figures; never let a proxy serve
        // yesterday's numbers to someone making a decision on them.
        'Cache-Control': 'no-store',
      },
    });
  }

  return ok({ report });
});
