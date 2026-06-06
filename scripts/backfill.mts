// Historical backfill. Walks a chosen block range in parallel and writes
// any matching engagements. Doesn't move the forward cursor backward — if the
// range ends past the current cursor, the cursor advances; otherwise it's
// left alone.
//
// Usage:
//   npm run backfill                    # 7 days back
//   npm run backfill -- --days 30       # 30 days back
//   npm run backfill -- --start-block 28000000  # explicit start
//   BACKFILL_PARALLELISM=20 npm run backfill    # crank concurrency

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

import { getPublicClient } from '../lib/chain';
import { getSupabase } from '../lib/supabase';
import { loadWatched, processBlockRange } from '../lib/indexer';

const RITUAL_BLOCK_SECONDS = 12;
const PARALLELISM = Number(process.env.BACKFILL_PARALLELISM ?? 10);
const CHUNK_LOG_BLOCKS = 200; // log a progress line every N blocks

function parseArgs(): { days?: number; startBlock?: number } {
  const args = process.argv.slice(2);
  let days: number | undefined;
  let startBlock: number | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--days') days = Number(args[++i]);
    else if (args[i] === '--start-block') startBlock = Number(args[++i]);
  }
  if (days === undefined && startBlock === undefined) days = 7;
  return { days, startBlock };
}

async function main() {
  const { days, startBlock: startOverride } = parseArgs();
  const client = getPublicClient();
  const db = getSupabase();

  const head = Number(await client.getBlockNumber());
  const start =
    startOverride ??
    Math.max(0, head - Math.floor((days! * 86400) / RITUAL_BLOCK_SECONDS));

  const totalBlocks = head - start + 1;
  console.log(`Backfill: blocks ${start} → ${head} (${totalBlocks} blocks)`);

  const watched = await loadWatched();
  console.log(`Watching ${watched.size} contracts, parallelism=${PARALLELISM}`);

  if (watched.size === 0) {
    console.error('No contracts in dapp_contracts. Run `npm run registry:seed` first.');
    process.exit(1);
  }

  let totalMatches = 0;
  const startTime = Date.now();
  let cursor = start;

  while (cursor <= head) {
    const chunkEnd = Math.min(cursor + CHUNK_LOG_BLOCKS - 1, head);
    const result = await processBlockRange(cursor, chunkEnd, watched, {
      parallelism: PARALLELISM,
    });
    totalMatches += result.txMatches;

    const elapsed = (Date.now() - startTime) / 1000;
    const done = chunkEnd - start + 1;
    const pct = ((done / totalBlocks) * 100).toFixed(1);
    const rate = elapsed > 0 ? done / elapsed : 0;
    const etaSec = rate > 0 ? Math.round((totalBlocks - done) / rate) : 0;
    console.log(
      `[${pct}%] ${cursor}..${chunkEnd}: +${result.txMatches} (Σ ${totalMatches}). ${rate.toFixed(1)} blk/s, ETA ${etaSec}s`,
    );
    cursor = chunkEnd + 1;
  }

  // Advance the forward cursor if the backfill reached past it.
  const { data: stateRow } = await db
    .from('indexer_state')
    .select('last_block')
    .eq('name', 'engagement-indexer')
    .maybeSingle();
  const currentCursor = Number(stateRow?.last_block ?? 0);
  if (head > currentCursor) {
    await db.from('indexer_state').upsert({
      name: 'engagement-indexer',
      last_block: head,
      last_checked_at: new Date().toISOString(),
    });
    console.log(`Cursor advanced ${currentCursor} → ${head}`);
  }

  const totalSec = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log(
    `\nDone. ${totalMatches} engagements written across ${totalBlocks} blocks in ${totalSec}s`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
