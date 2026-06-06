// POST /api/cron/index — runs one indexer tick.
//
// Wire this up to Vercel Cron with `vercel.json`:
//   { "crons": [{ "path": "/api/cron/index", "schedule": "* * * * *" }] }
//
// Protected by CRON_SECRET. Vercel Cron auto-includes a bearer; in dev you can
// curl with `Authorization: Bearer ${CRON_SECRET}`.

import { NextRequest, NextResponse } from 'next/server';
import { runIndexerOnce } from '@/lib/indexer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization');
  return auth === `Bearer ${secret}`;
}

async function handle(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const result = await runIndexerOnce();
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error('[cron/index] failed:', err);
    return NextResponse.json(
      { ok: false, error: String((err as Error).message ?? err) },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
