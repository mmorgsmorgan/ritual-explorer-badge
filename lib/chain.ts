// Viem public client pointed at Ritual Chain (id 1979).
//
// This is the only place we configure the RPC. Override with
// NEXT_PUBLIC_RITUAL_RPC_URL for local testing against an alternate endpoint.

import { createPublicClient, http, defineChain } from 'viem';

const RPC_URL =
  process.env.NEXT_PUBLIC_RITUAL_RPC_URL || 'https://rpc.ritualfoundation.org';

export const ritualChain = defineChain({
  id: 1979,
  name: 'Ritual Chain',
  nativeCurrency: { name: 'Ritual', symbol: 'RITUAL', decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
  },
  blockExplorers: {
    default: {
      name: 'Ritual Explorer',
      url: 'https://explorer.ritualfoundation.org',
    },
  },
  testnet: true,
});

let cached: ReturnType<typeof createPublicClient> | null = null;

export function getPublicClient() {
  if (!cached) {
    cached = createPublicClient({
      chain: ritualChain,
      transport: http(RPC_URL, { batch: true }),
    });
  }
  return cached;
}
