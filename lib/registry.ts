// Loads data/registry.json once per server lifetime and exposes lookup helpers.
//
// We keep the file as the source of truth and project it into Supabase via the
// seed script. Lookups during request handling go through Supabase, but the
// in-memory copy is handy for the badge page metadata and for the seed itself.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Registry, RegistryDapp } from './types';

let cached: Registry | null = null;

export async function loadRegistry(): Promise<Registry> {
  if (cached) return cached;
  const file = path.join(process.cwd(), 'data', 'registry.json');
  const raw = await readFile(file, 'utf8');
  cached = JSON.parse(raw) as Registry;
  return cached;
}

/** Flatten registry into (contract_address → dapp) edges. */
export function flatten(registry: Registry): Array<{ address: string; dapp: RegistryDapp }> {
  const out: Array<{ address: string; dapp: RegistryDapp }> = [];
  for (const dapp of registry) {
    for (const c of dapp.contracts) {
      if (!c.verified) continue;
      out.push({ address: c.address.toLowerCase(), dapp });
    }
  }
  return out;
}

/** All unique verified contract addresses, lowercased. */
export function allContractAddresses(registry: Registry): string[] {
  const set = new Set<string>();
  for (const dapp of registry) {
    for (const c of dapp.contracts) {
      if (c.verified) set.add(c.address.toLowerCase());
    }
  }
  return [...set];
}
