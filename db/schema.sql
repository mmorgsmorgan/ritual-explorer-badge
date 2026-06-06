-- Ritual Explorer Badge — Supabase schema
--
-- Three tables drive everything:
--   1. dapps           — the registry (loaded from data/registry.json on deploy/seed)
--   2. dapp_contracts  — flattened contract→dapp lookup (one row per contract address)
--   3. engagements     — every (user_address, contract_address, tx_hash) tuple
--                        the chain indexer has observed
--
-- We also keep one row of indexer cursor state.

create extension if not exists pgcrypto;

create table if not exists dapps (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  url             text not null,
  owner           text,
  created_at      timestamptz not null default now(),
  unique (url)
);

-- One row per (dapp, contract). A dapp can own multiple contracts; a contract
-- address can belong to multiple dapps (rare, but possible — shared infra).
-- We treat the (dapp_id, contract_address) pair as the natural key.
create table if not exists dapp_contracts (
  dapp_id          uuid not null references dapps(id) on delete cascade,
  contract_address text not null,
  primary key (dapp_id, contract_address)
);

-- Index for "which dapps touch this contract" — hot path for the indexer.
create index if not exists dapp_contracts_address_idx
  on dapp_contracts (contract_address);

-- Every observed interaction. Unique on (user, tx_hash, contract) so we never
-- double-count if the indexer re-processes a block.
create table if not exists engagements (
  id               bigserial primary key,
  user_address     text not null,                    -- lowercased
  contract_address text not null,                    -- lowercased
  tx_hash          text not null,
  block_number     bigint not null,
  block_timestamp  timestamptz not null,
  value_wei        text not null default '0',        -- bigint as text (Postgres numeric is fine too)
  observed_at      timestamptz not null default now(),
  unique (user_address, tx_hash, contract_address)
);

-- Hot read path: "all engagements for user X, newest first"
create index if not exists engagements_user_idx
  on engagements (user_address, block_number desc);

-- Cursor state for the chain indexer. Mirrors ritual-agent-wallet's
-- packages/service/src/events/chain-indexer.ts pattern but lives in Postgres.
create table if not exists indexer_state (
  name             text primary key,                 -- 'engagement-indexer'
  last_block       bigint not null default 0,
  last_checked_at  timestamptz not null default now()
);
