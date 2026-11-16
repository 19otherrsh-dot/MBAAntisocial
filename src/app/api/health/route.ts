import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import connectDB from '@/lib/mongodb';

/**
 * Liveness and readiness for load balancers and uptime monitors.
 *
 * Public and cheap: one database ping, no user data. Answers 503 when the
 * database is unreachable so an orchestrator can route around this instance.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const started = Date.now();
  try {
    await connectDB();
    await mongoose.connection.db?.admin().ping();
    return NextResponse.json(
      { status: 'ok', db: 'ok', latencyMs: Date.now() - started, uptimeSeconds: Math.round(process.uptime()) },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return NextResponse.json(
      { status: 'degraded', db: 'unreachable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
