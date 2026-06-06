// User-facing scan: given a wallet address, return the dApps the indexer has
// observed them interacting with, aggregated by dapp.
//
// Two-pass query: (1) all engagements for the user, (2) joined dapp metadata
// for the distinct contract addresses they touched. Avoids depending on a
// declared FK between engagements.contract_address and dapp_contracts.

import { getSupabase } from './supabase';
import type { EngagedDapp, ScanResult } from './types';

export async function scanAddress(addressRaw: string): Promise<ScanResult> {
  const address = addressRaw.toLowerCase();
  const db = getSupabase();

  const { data: engagementRows, error: eErr } = await db
    .from('engagements')
    .select('contract_address, tx_hash, block_number, block_timestamp')
    .eq('user_address', address)
    .order('block_number', { ascending: false });

  if (eErr) throw eErr;

  const engagements = engagementRows ?? [];
  if (engagements.length === 0) {
    const { data: cursor } = await db
      .from('indexer_state')
      .select('last_block')
      .eq('name', 'engagement-indexer')
      .maybeSingle();
    return {
      address,
      totalEngagements: 0,
      dapps: [],
      indexerLastBlock: Number(cursor?.last_block ?? 0),
      scannedAt: new Date().toISOString(),
    };
  }

  // Distinct contracts the user touched.
  const touched = [...new Set(engagements.map((r) => r.contract_address))];

  // Resolve each contract → dapp.
  const { data: edges, error: cErr } = await db
    .from('dapp_contracts')
    .select('contract_address, dapps ( id, name, url, owner )')
    .in('contract_address', touched);
  if (cErr) throw cErr;

  // Map contract address → dapp(s). Most contracts belong to one dapp; a
  // small number are shared infra and belong to several.
  type DappRef = { id: string; name: string; url: string; owner: string | null };
  const dappByContract = new Map<string, DappRef[]>();
  for (const row of edges ?? []) {
    const dapps = Array.isArray(row.dapps) ? row.dapps : row.dapps ? [row.dapps] : [];
    if (dapps.length === 0) continue;
    const existing = dappByContract.get(row.contract_address) ?? [];
    for (const d of dapps) existing.push(d as DappRef);
    dappByContract.set(row.contract_address, existing);
  }

  // Aggregate engagements by dapp id.
  type Acc = EngagedDapp & { contractSet: Set<string> };
  const byDapp = new Map<string, Acc>();

  for (const row of engagements) {
    const dapps = dappByContract.get(row.contract_address);
    if (!dapps || dapps.length === 0) continue;
    for (const d of dapps) {
      let acc = byDapp.get(d.id);
      if (!acc) {
        acc = {
          name: d.name,
          url: d.url,
          owner: d.owner ?? '',
          contracts: [],
          contractSet: new Set<string>(),
          txCount: 0,
          firstInteraction: row.block_timestamp,
          lastInteraction: row.block_timestamp,
        };
        byDapp.set(d.id, acc);
      }
      acc.contractSet.add(row.contract_address);
      acc.txCount += 1;
      if (row.block_timestamp < acc.firstInteraction) {
        acc.firstInteraction = row.block_timestamp;
      }
      if (row.block_timestamp > acc.lastInteraction) {
        acc.lastInteraction = row.block_timestamp;
      }
    }
  }

  const dapps: EngagedDapp[] = [...byDapp.values()]
    .map(({ contractSet, ...rest }) => ({
      ...rest,
      contracts: [...contractSet],
    }))
    .sort((a, b) => b.txCount - a.txCount);

  const { data: cursor } = await db
    .from('indexer_state')
    .select('last_block')
    .eq('name', 'engagement-indexer')
    .maybeSingle();

  return {
    address,
    totalEngagements: engagements.length,
    dapps,
    indexerLastBlock: Number(cursor?.last_block ?? 0),
    scannedAt: new Date().toISOString(),
  };
}
