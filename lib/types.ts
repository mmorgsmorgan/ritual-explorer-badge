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
export interface EngagedDapp {
  name: string;
  url: string;
  owner: string;
  contracts: string[];           // matched contract addresses
  txCount: number;
  firstInteraction: string;      // ISO timestamp
  lastInteraction: string;       // ISO timestamp
}

export interface ScanResult {
  address: string;
  totalEngagements: number;
  dapps: EngagedDapp[];
  indexerLastBlock: number;
  scannedAt: string;
}
