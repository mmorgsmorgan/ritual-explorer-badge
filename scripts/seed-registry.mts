// Seed Supabase from data/registry.json.
//
// Run with: npm run registry:seed
//
// Idempotent: uses ON CONFLICT semantics on `url` for dapps and on
// (dapp_id, contract_address) for dapp_contracts.

// Load .env.local first — tsx (unlike `next dev`) doesn't auto-load env files.
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

import { loadRegistry, flatten } from '../lib/registry';
import { getSupabase } from '../lib/supabase';

async function main() {
  const registry = await loadRegistry();
  const db = getSupabase();

  console.log(`Seeding ${registry.length} dApps...`);

  // Upsert dapps first; collect the url → id map.
  const dappRows = registry.map((d) => ({
    name: d.name,
    url: d.url,
    owner: d.owner ?? null,
  }));

  const { data: upserted, error: dErr } = await db
    .from('dapps')
    .upsert(dappRows, { onConflict: 'url' })
    .select('id, url');
  if (dErr) throw dErr;

  const idByUrl = new Map<string, string>();
  for (const row of upserted ?? []) {
    idByUrl.set(row.url as string, row.id as string);
  }

  // Flatten verified contracts → dapp_contracts rows.
  const edges = flatten(registry);
  const contractRows = edges
    .map(({ address, dapp }) => {
      const dappId = idByUrl.get(dapp.url);
      if (!dappId) return null;
      return { dapp_id: dappId, contract_address: address };
    })
    .filter((r): r is { dapp_id: string; contract_address: string } => r !== null);

  if (contractRows.length > 0) {
    const { error: cErr } = await db
      .from('dapp_contracts')
      .upsert(contractRows, {
        onConflict: 'dapp_id,contract_address',
        ignoreDuplicates: true,
      });
    if (cErr) throw cErr;
  }

  console.log(
    `Seeded ${dappRows.length} dapps and ${contractRows.length} contract edges.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
