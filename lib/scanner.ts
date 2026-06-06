// Heuristic engagement scanner.
//
// Ritual's RPC has no "transactions by address" endpoint, and we can't afford
// to walk every block per page load. Instead we derive a credible engagement
// profile from two cheap signals:
//
//   1. Wallet nonce (eth_getTransactionCount) — overall activity
//   2. balanceOf on every tracked dApp contract — which dApp tokens the wallet
//      actually holds. This is concrete on-chain evidence.
//
// The nonce maps to a tier (txCount → N dApp credits). Held-token dApps fill
// the credit slots first. Any remaining slots are filled deterministically
// from the rest of the registry, ordered by sha256(wallet|dapp.url) so the
// assignment is reproducible per wallet but differs between wallets.

import { createHash } from 'node:crypto';
import { parseAbi } from 'viem';
import { getPublicClient } from './chain';
import { getSupabase } from './supabase';
import type { EngagedDapp, ScanResult } from './types';

const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
]);

/** txCount → number of dApp credits awarded. */
export function tierFor(txCount: number): number {
  if (txCount === 0) return 0;
  if (txCount <= 4) return 1;
  if (txCount <= 10) return 3;
  if (txCount <= 25) return 5;
  if (txCount <= 50) return 8;
  if (txCount <= 100) return 12;
  return 16;
}

function stableScore(wallet: string, dappUrl: string): number {
  const h = createHash('sha256').update(`${wallet}|${dappUrl}`).digest();
  return h.readUInt32BE(0);
}

type DappRef = {
  id: string;
  name: string;
  url: string;
  owner: string | null;
};
type ContractRow = {
  contract: `0x${string}`;
  dapps: DappRef[];
};

async function loadRegistry(): Promise<ContractRow[]> {
  const db = getSupabase();
  const { data, error } = await db
    .from('dapp_contracts')
    .select('contract_address, dapps ( id, name, url, owner )');
  if (error) throw error;
  return (data ?? []).flatMap((row) => {
    const dapps = Array.isArray(row.dapps)
      ? row.dapps
      : row.dapps
        ? [row.dapps]
        : [];
    if (dapps.length === 0) return [];
    return [
      {
        contract: row.contract_address.toLowerCase() as `0x${string}`,
        dapps: dapps as DappRef[],
      },
    ];
  });
}

export async function scanAddress(addressRaw: string): Promise<ScanResult> {
  const wallet = addressRaw.toLowerCase() as `0x${string}`;
  const client = getPublicClient();

  const [txCountBig, head, registry] = await Promise.all([
    client.getTransactionCount({ address: wallet }),
    client.getBlockNumber(),
    loadRegistry(),
  ]);
  const txCount = Number(txCountBig);
  const indexerLastBlock = Number(head);

  // Aggregate per-contract dApp refs and the unique contract set.
  const dappsByContract = new Map<`0x${string}`, DappRef[]>();
  const allDapps = new Map<string, DappRef>(); // url → dapp
  const contractsByDappUrl = new Map<string, Set<`0x${string}`>>();

  for (const row of registry) {
    const existing = dappsByContract.get(row.contract) ?? [];
    existing.push(...row.dapps);
    dappsByContract.set(row.contract, existing);
    for (const d of row.dapps) {
      allDapps.set(d.url, d);
      let set = contractsByDappUrl.get(d.url);
      if (!set) {
        set = new Set();
        contractsByDappUrl.set(d.url, set);
      }
      set.add(row.contract);
    }
  }
  const uniqueContracts = [...dappsByContract.keys()];

  // Probe balanceOf in parallel. Non-ERC-20 contracts revert; treat as null.
  const balances = await Promise.all(
    uniqueContracts.map(async (contract) => {
      try {
        const bal = (await client.readContract({
          address: contract,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [wallet],
        })) as bigint;
        return { contract, balance: bal };
      } catch {
        return { contract, balance: null as bigint | null };
      }
    }),
  );

  const zero = BigInt(0);
  const heldContracts = new Set(
    balances
      .filter((b) => b.balance !== null && b.balance > zero)
      .map((b) => b.contract),
  );

  // dApps with concrete evidence: at least one of their contracts is held.
  const evidenceDappUrls = new Set<string>();
  for (const contract of heldContracts) {
    const dapps = dappsByContract.get(contract) ?? [];
    for (const d of dapps) evidenceDappUrls.add(d.url);
  }

  const target = tierFor(txCount);

  const evidenceList = [...evidenceDappUrls]
    .map((url) => allDapps.get(url)!)
    .sort((a, b) => a.name.localeCompare(b.name));

  const filler = [...allDapps.values()]
    .filter((d) => !evidenceDappUrls.has(d.url))
    .sort((a, b) => stableScore(wallet, a.url) - stableScore(wallet, b.url));

  const chosen = [...evidenceList, ...filler].slice(0, target);

  // Build EngagedDapp entries. Per-dApp txCount is unknown without history;
  // we use 1 for evidence dApps (we know they received the token at least
  // once) and 0 for purely assigned credits.
  const dapps: EngagedDapp[] = chosen.map((d) => {
    const isEvidence = evidenceDappUrls.has(d.url);
    const contracts = [...(contractsByDappUrl.get(d.url) ?? [])].filter((c) =>
      isEvidence ? heldContracts.has(c) : true,
    );
    return {
      name: d.name,
      url: d.url,
      owner: d.owner ?? '',
      contracts,
      txCount: isEvidence ? 1 : 0,
      evidence: isEvidence ? 'token-held' : 'assigned',
    };
  });

  return {
    address: wallet,
    totalEngagements: txCount,
    dapps,
    indexerLastBlock,
    scannedAt: new Date().toISOString(),
  };
}
