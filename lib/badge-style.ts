// Tier + visual derivation for the badge page. Pure functions, no UI deps.
//
// The five tiers map to escalating "ritual intensity" expressed through the
// gothic palette: from cold sepia (Onlooker) through smoky crimson (Initiate /
// Practitioner) to the lavender-cross-and-crimson-crown apex (Devotee /
// Ritualist) that mirrors the reference image's hero.

export type Tier = 'Onlooker' | 'Initiate' | 'Practitioner' | 'Devotee' | 'Ritualist';

export interface TierStyle {
  tier: Tier;
  /** Tailwind gradient classes for the hero background. */
  heroGradient: string;
  /** Tailwind text color for tier name on hero. */
  heroText: string;
  /** Tailwind ring color for the seal. */
  sealRing: string;
}

export function tierFor(dappCount: number): TierStyle {
  if (dappCount >= 20) {
    // Apex — full ritual: crimson crown over lavender cross.
    return {
      tier: 'Ritualist',
      heroGradient:
        'from-crimson via-crimson-deep to-armor',
      heroText: 'text-bone',
      sealRing: 'ring-crimson-glow/70',
    };
  }
  if (dappCount >= 10) {
    // Devotee — lavender ascendant.
    return {
      tier: 'Devotee',
      heroGradient:
        'from-lavender/30 via-armor-soft to-crimson-deep/60',
      heroText: 'text-bone',
      sealRing: 'ring-lavender/60',
    };
  }
  if (dappCount >= 5) {
    // Practitioner — armor with stronger crimson presence.
    return {
      tier: 'Practitioner',
      heroGradient:
        'from-crimson-deep/70 via-armor-soft to-armor',
      heroText: 'text-bone',
      sealRing: 'ring-crimson/50',
    };
  }
  if (dappCount >= 1) {
    // Initiate — smoky crimson trace.
    return {
      tier: 'Initiate',
      heroGradient:
        'from-crimson-deep/40 via-armor-soft to-armor',
      heroText: 'text-bone',
      sealRing: 'ring-crimson-deep/60',
    };
  }
  // Onlooker — cold parchment haze.
  return {
    tier: 'Onlooker',
    heroGradient:
      'from-sepia/40 via-armor-soft to-armor',
    heroText: 'text-bone-muted',
    sealRing: 'ring-sepia/60',
  };
}

/**
 * Deterministic dApp accent color. The same dApp gets the same hue across
 * page loads — built from a hash of the dApp URL so it's stable. Eight gothic
 * hues that all read against the armor surface.
 */
export function dappAccent(url: string): { bg: string; text: string } {
  let h = 0;
  for (let i = 0; i < url.length; i++) h = (h * 31 + url.charCodeAt(i)) >>> 0;
  const hues: Array<{ bg: string; text: string }> = [
    { bg: 'bg-crimson/15',      text: 'text-crimson-glow' },
    { bg: 'bg-crimson-deep/30', text: 'text-crimson-glow' },
    { bg: 'bg-lavender/15',     text: 'text-lavender' },
    { bg: 'bg-lavender-soft',   text: 'text-lavender' },
    { bg: 'bg-sepia/30',        text: 'text-bone-muted' },
    { bg: 'bg-armor-soft',      text: 'text-bone' },
    { bg: 'bg-bone/10',         text: 'text-bone' },
    { bg: 'bg-crimson-glow/15', text: 'text-crimson-glow' },
  ];
  return hues[h % hues.length];
}

export function shortAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
