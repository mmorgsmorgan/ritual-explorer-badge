// Tier + visual derivation for the badge page. Pure functions, no UI deps.

import type { EngagedDapp } from './types';

export type Tier = 'Onlooker' | 'Initiate' | 'Practitioner' | 'Devotee' | 'Ritualist';

export interface TierStyle {
  tier: Tier;
  /** Tailwind gradient classes for the hero background. */
  heroGradient: string;
  /** Tailwind text color for tier name on hero. */
  heroText: string;
  /** Tailwind ring color for the seal. */
  sealRing: string;
  /** Tailwind background for the dApp chip in the tier color. */
  chip: string;
}

export function tierFor(dappCount: number): TierStyle {
  if (dappCount >= 20) {
    return {
      tier: 'Ritualist',
      heroGradient:
        'from-amber-200 via-orange-300 to-amber-500 dark:from-amber-700 dark:via-orange-800 dark:to-amber-950',
      heroText: 'text-amber-950 dark:text-amber-50',
      sealRing: 'ring-amber-900/40 dark:ring-amber-100/40',
      chip: 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200',
    };
  }
  if (dappCount >= 10) {
    return {
      tier: 'Devotee',
      heroGradient:
        'from-violet-300 via-fuchsia-400 to-violet-600 dark:from-violet-800 dark:via-fuchsia-900 dark:to-violet-950',
      heroText: 'text-violet-950 dark:text-violet-50',
      sealRing: 'ring-violet-900/40 dark:ring-violet-100/40',
      chip: 'bg-violet-100 text-violet-900 dark:bg-violet-900/30 dark:text-violet-200',
    };
  }
  if (dappCount >= 5) {
    return {
      tier: 'Practitioner',
      heroGradient:
        'from-emerald-300 via-teal-400 to-emerald-600 dark:from-emerald-800 dark:via-teal-900 dark:to-emerald-950',
      heroText: 'text-emerald-950 dark:text-emerald-50',
      sealRing: 'ring-emerald-900/40 dark:ring-emerald-100/40',
      chip: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200',
    };
  }
  if (dappCount >= 1) {
    return {
      tier: 'Initiate',
      heroGradient:
        'from-sky-300 via-indigo-400 to-sky-600 dark:from-sky-800 dark:via-indigo-900 dark:to-sky-950',
      heroText: 'text-sky-950 dark:text-sky-50',
      sealRing: 'ring-sky-900/40 dark:ring-sky-100/40',
      chip: 'bg-sky-100 text-sky-900 dark:bg-sky-900/30 dark:text-sky-200',
    };
  }
  return {
    tier: 'Onlooker',
    heroGradient:
      'from-zinc-200 via-zinc-300 to-zinc-400 dark:from-zinc-700 dark:via-zinc-800 dark:to-zinc-900',
    heroText: 'text-zinc-900 dark:text-zinc-50',
    sealRing: 'ring-zinc-900/40 dark:ring-zinc-100/40',
    chip: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  };
}

/**
 * Deterministic dApp accent color. The same dApp gets the same hue across
 * page loads. Built from a hash of the dApp URL so it's stable.
 */
export function dappAccent(url: string): { bg: string; text: string } {
  let h = 0;
  for (let i = 0; i < url.length; i++) h = (h * 31 + url.charCodeAt(i)) >>> 0;
  // 12 hue-rotation buckets so cards visually distinguish but don't clash.
  const hues: Array<{ bg: string; text: string }> = [
    { bg: 'bg-rose-500/15',    text: 'text-rose-700 dark:text-rose-300' },
    { bg: 'bg-orange-500/15',  text: 'text-orange-700 dark:text-orange-300' },
    { bg: 'bg-amber-500/15',   text: 'text-amber-700 dark:text-amber-300' },
    { bg: 'bg-lime-500/15',    text: 'text-lime-700 dark:text-lime-300' },
    { bg: 'bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-300' },
    { bg: 'bg-teal-500/15',    text: 'text-teal-700 dark:text-teal-300' },
    { bg: 'bg-cyan-500/15',    text: 'text-cyan-700 dark:text-cyan-300' },
    { bg: 'bg-sky-500/15',     text: 'text-sky-700 dark:text-sky-300' },
    { bg: 'bg-indigo-500/15',  text: 'text-indigo-700 dark:text-indigo-300' },
    { bg: 'bg-violet-500/15',  text: 'text-violet-700 dark:text-violet-300' },
    { bg: 'bg-fuchsia-500/15', text: 'text-fuchsia-700 dark:text-fuchsia-300' },
    { bg: 'bg-pink-500/15',    text: 'text-pink-700 dark:text-pink-300' },
  ];
  return hues[h % hues.length];
}

/**
 * Earliest first-interaction across all engaged dApps — the "member since" date.
 */
export function memberSince(dapps: EngagedDapp[]): string | null {
  if (dapps.length === 0) return null;
  let earliest = dapps[0].firstInteraction;
  for (const d of dapps) {
    if (d.firstInteraction < earliest) earliest = d.firstInteraction;
  }
  return earliest;
}

export function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function fmtMonthYear(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
  });
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Days since timestamp (clamped to 0). Used for "X days ago" labels.
 */
export function daysAgo(iso: string): number {
  const diffMs = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(diffMs / 86_400_000));
}
