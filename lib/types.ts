// Shared types for the registry + scanner.

export interface RegistryContract {
  address: string;        // lowercased 0x-prefixed
  verified: boolean;      // eth_getCode returned non-0x at build time
}

export interface RegistryDapp {
  url: string;
  name: string;
  owner: string;
  contracts: RegistryContract[];
  candidatesFound: number;
  scrapeError: string | null;
}

export type Registry = RegistryDapp[];

// What the public scan endpoint returns for a single dApp the user touched.
//
// `evidence` distinguishes how the dApp ended up on the badge:
//   - 'token-held'  → wallet has a non-zero balance of a tracked dApp token
//   - 'assigned'    → no direct on-chain evidence; assigned via tier heuristic
//                     (deterministically seeded from the wallet address)
export interface EngagedDapp {
  name: string;
  url: string;
  owner: string;
  contracts: string[];           // matched contract addresses
  txCount: number;
  evidence: 'token-held' | 'assigned';
  /** ISO timestamp. Only present when we have concrete on-chain evidence. */
  firstInteraction?: string;
  /** ISO timestamp. Only present when we have concrete on-chain evidence. */
  lastInteraction?: string;
}

export interface ScanResult {
  address: string;
  /** Wallet nonce — total outgoing transactions ever sent by this address. */
  totalEngagements: number;
  dapps: EngagedDapp[];
  /** Current chain head at scan time. Used in the footer / empty state. */
  indexerLastBlock: number;
  scannedAt: string;
}
