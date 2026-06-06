// CLI for the heuristic scanner — runs lib/scanner.scanAddress and prints
// the result. Useful for sanity-checking what /badge/<address> will show.
//
// Usage:
//   npx tsx scripts/assign-dapps.mts <address>

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

import { scanAddress } from '../lib/scanner';

async function main() {
  const addrRaw = process.argv[2];
  if (!addrRaw || !/^0x[0-9a-fA-F]{40}$/.test(addrRaw)) {
    console.error('Usage: tsx scripts/assign-dapps.mts <address>');
    process.exit(1);
  }

  const result = await scanAddress(addrRaw);
  const evidence = result.dapps.filter((d) => d.evidence === 'token-held');

  console.log(`Wallet:                ${result.address}`);
  console.log(`Transactions (nonce):  ${result.totalEngagements}`);
  console.log(`Tokens held:           ${evidence.length} tracked dApp tokens`);
  console.log(`Credits awarded:       ${result.dapps.length}`);
  console.log('---');

  if (result.dapps.length === 0) {
    console.log('No dApps credited.');
    return;
  }

  for (const d of result.dapps) {
    const label = d.evidence === 'token-held' ? '✓ holds token' : '· assigned';
    console.log(`  ${label}  ${d.name.padEnd(28)} ${d.url}`);
  }
}

await main();
