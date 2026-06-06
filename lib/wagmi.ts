// Wagmi config — single source of truth for the wallet stack.
//
// We reuse lib/chain.ts's ritualChain definition so the RPC endpoint and
// chain id can never drift between the read client (lib/chain.ts, server) and
// the write client (this file, browser).
//
// WalletConnect projectId is optional in dev; in production set
// NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID to a real id from cloud.walletconnect.com
// so mobile wallets work.

import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { ritualChain } from './chain';

export const wagmiConfig = getDefaultConfig({
  appName: 'Ritual Engagement Badge',
  projectId:
    process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'ritual-badge-dev',
  chains: [ritualChain],
  ssr: true,
});
