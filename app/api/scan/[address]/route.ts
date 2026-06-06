// GET /api/scan/:address — public, returns the engagement profile.

import { NextRequest, NextResponse } from 'next/server';
import { isAddress } from 'viem';
import { scanAddress } from '@/lib/scanner';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  if (!isAddress(address)) {
    return NextResponse.json({ error: 'invalid address' }, { status: 400 });
  }
  try {
    const result = await scanAddress(address);
    return NextResponse.json(result, {
      headers: {
        // Tiny CDN cache to absorb badge-page bursts. The scanner is ~70
        // balanceOf RPC calls per uncached miss; cheap to memoize briefly.
        'cache-control': 'public, s-maxage=30, stale-while-revalidate=60',
      },
    });
  } catch (err) {
    console.error('[api/scan] failed:', err);
    return NextResponse.json(
      { error: String((err as Error).message ?? err) },
      { status: 500 },
    );
  }
}
