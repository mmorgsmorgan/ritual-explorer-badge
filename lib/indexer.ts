// Block-walking engagement indexer.
//
// Two consumers share this file:
//   1. The Vercel-Cron-pinged route at /api/cron/index — calls runIndexerOnce()
//      every minute to walk new blocks forward.
//   2. The backfill script at scripts/backfill.mts — calls processBlockRange()
//      directly to replay historical blocks in parallel.
//
// runIndexerOnce() does the cursor management; processBlockRange() is pure
// (no cursor reads or writes) so it can be reused.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getPublicClient } from './chain';
import { getSupabase } from './supabase';
import type { Database } from './supabase-types';

const INDEXER_NAME = 'engagement-indexer';
const MAX_BLOCKS_PER_TICK = 50;
const FLUSH_THRESHOLD = 500;

/**
 * Ritual Chain uses precompile addresses like 0x000…00fa8e to deliver
 * LLM/oracle callbacks. They look like normal txs in block.transactions but
 * aren't user activity. Filter by leading-zero count.
 */
function isPrecompile(addr: string): boolean {
  return /^0x0{30,}[0-9a-f]{0,10}$/.test(addr);
}

type EngagementRow = {
  user_address: string;
  contract_address: string;
  tx_hash: string;
  block_number: number;
  block_timestamp: string;
  value_wei: string;
};

async function flushBatch(
  db: SupabaseClient<Database>,
  batch: EngagementRow[],
): Promise<void> {
  const chunkSize = 500;
  for (let i = 0; i < batch.length; i += chunkSize) {
    const chunk = batch.slice(i, i + chunkSize);
    await withRetry(async () => {
      const { error } = await db.from('engagements').upsert(chunk, {
        onConflict: 'user_address,tx_hash,contract_address',
        ignoreDuplicates: true,
      });
      return error;
    });
  }
}

/**
 * Retry transient PostgREST/network failures (ETIMEDOUT, ECONNRESET, 5xx).
 * Supabase's fetch sometimes blips under sustained load; bouncing once or
 * twice almost always recovers.
 *
 * The callback returns a Supabase error (or null on success); a thrown
 * exception is also treated as a retryable network error.
 */
async function withRetry(
  fn: () => Promise<unknown>,
  attempts = 4,
): Promise<void> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    let err: unknown = null;
    try {
      err = await fn();
    } catch (e) {
      err = e;
    }
    if (!err) return;
    lastErr = err;
    const msg = String((err as { message?: string }).message ?? err);
    const retryable =
      /ETIMEDOUT|ECONNRESET|ENETUNREACH|EAI_AGAIN|fetch failed|5\d\d/i.test(msg);
    if (!retryable) throw err;
    if (i === attempts - 1) break;
    const wait = 500 * Math.pow(3, i); // 500ms, 1.5s, 4.5s
    console.warn(`[indexer] flush attempt ${i + 1} failed (${msg.slice(0, 80)}), retrying in ${wait}ms`);
    await new Promise((r) => setTimeout(r, wait));
  }
  throw lastErr;
}

/** Load the contract-address watch set from Supabase. */
export async function loadWatched(): Promise<Set<string>> {
  const db = getSupabase();
  const { data, error } = await db
    .from('dapp_contracts')
    .select('contract_address');
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.contract_address.toLowerCase()));
}

export interface ProcessRangeResult {
  blocksProcessed: number;
  txMatches: number;
  highest: number;
}

/**
 * Walk blocks [fromBlock, toBlock] inclusive, filter for engagements, upsert.
 * Pure: doesn't touch indexer_state. Caller manages the cursor.
 *
 * Parallelism controls how many blocks are fetched in flight at once. The
 * forward-walking indexer uses 1 (low load, predictable); the backfill uses
 * 10+ to mask RPC round-trip latency.
 */
export async function processBlockRange(
  fromBlock: number,
  toBlock: number,
  watched: Set<string>,
  options: {
    parallelism?: number;
    onProgress?: (highest: number) => void;
  } = {},
): Promise<ProcessRangeResult> {
  const parallelism = Math.max(1, options.parallelism ?? 1);
  const client = getPublicClient();
  const db = getSupabase();

  let pending: EngagementRow[] = [];
  let totalMatches = 0;
  let highest = fromBlock - 1;

  for (let chunkStart = fromBlock; chunkStart <= toBlock; chunkStart += parallelism) {
    const chunkEnd = Math.min(chunkStart + parallelism - 1, toBlock);
    const nums: number[] = [];
    for (let n = chunkStart; n <= chunkEnd; n++) nums.push(n);

    let blocks;
    try {
      blocks = await Promise.all(
        nums.map((n) =>
          client.getBlock({ blockNumber: BigInt(n), includeTransactions: true }),
        ),
      );
    } catch (err) {
      console.error(`[indexer] parallel fetch ${chunkStart}..${chunkEnd} failed:`, err);
      break;
    }

    for (const block of blocks) {
      const ts = new Date(Number(block.timestamp)).toISOString();
      for (const tx of block.transactions) {
        if (typeof tx === 'string') continue;
        const toAddr = tx.to?.toLowerCase();
        if (!toAddr || !watched.has(toAddr)) continue;

        const fromAddr = tx.from.toLowerCase();
        if (isPrecompile(fromAddr)) continue;
        if (watched.has(fromAddr)) continue;

        pending.push({
          user_address: fromAddr,
          contract_address: toAddr,
          tx_hash: tx.hash,
          block_number: Number(block.number),
          block_timestamp: ts,
          value_wei: tx.value.toString(),
        });
        totalMatches++;
      }
      const n = Number(block.number);
      if (n > highest) highest = n;
    }

    if (pending.length >= FLUSH_THRESHOLD) {
      await flushBatch(db, pending);
      pending = [];
    }

    options.onProgress?.(highest);
  }

  if (pending.length > 0) await flushBatch(db, pending);

  return {
    blocksProcessed: highest >= fromBlock ? highest - fromBlock + 1 : 0,
    txMatches: totalMatches,
    highest,
  };
}

export interface IndexerResult {
  from: number;
  to: number;
  blocksProcessed: number;
  txMatches: number;
  cursorBefore: number;
  cursorAfter: number;
  durationMs: number;
}

/** One forward-walking tick. Driven by /api/cron/index every minute. */
export async function runIndexerOnce(): Promise<IndexerResult> {
  const startedAt = Date.now();
  const client = getPublicClient();
  const db = getSupabase();

  const head = Number(await client.getBlockNumber());

  const { data: stateRow, error: stateErr } = await db
    .from('indexer_state')
    .select('last_block')
    .eq('name', INDEXER_NAME)
    .maybeSingle();
  if (stateErr) throw stateErr;

  if (!stateRow) {
    // Cold start: pin cursor to current head, don't replay history.
    await db.from('indexer_state').insert({
      name: INDEXER_NAME,
      last_block: head,
      last_checked_at: new Date().toISOString(),
    });
    return {
      from: head,
      to: head,
      blocksProcessed: 0,
      txMatches: 0,
      cursorBefore: head,
      cursorAfter: head,
      durationMs: Date.now() - startedAt,
    };
  }

  const last = Number(stateRow.last_block);
  if (head <= last) {
    await db
      .from('indexer_state')
      .update({ last_checked_at: new Date().toISOString() })
      .eq('name', INDEXER_NAME);
    return {
      from: last,
      to: last,
      blocksProcessed: 0,
      txMatches: 0,
      cursorBefore: last,
      cursorAfter: last,
      durationMs: Date.now() - startedAt,
    };
  }

  const watched = await loadWatched();

  if (watched.size === 0) {
    await db
      .from('indexer_state')
      .update({ last_block: head, last_checked_at: new Date().toISOString() })
      .eq('name', INDEXER_NAME);
    return {
      from: last,
      to: head,
      blocksProcessed: 0,
      txMatches: 0,
      cursorBefore: last,
      cursorAfter: head,
      durationMs: Date.now() - startedAt,
    };
  }

  const target = Math.min(last + MAX_BLOCKS_PER_TICK, head);
  const result = await processBlockRange(last + 1, target, watched);

  const newCursor = result.highest >= last + 1 ? result.highest : last;
  await db
    .from('indexer_state')
    .update({
      last_block: newCursor,
      last_checked_at: new Date().toISOString(),
    })
    .eq('name', INDEXER_NAME);

  return {
    from: last + 1,
    to: result.highest,
    blocksProcessed: result.blocksProcessed,
    txMatches: result.txMatches,
    cursorBefore: last,
    cursorAfter: newCursor,
    durationMs: Date.now() - startedAt,
  };
}
