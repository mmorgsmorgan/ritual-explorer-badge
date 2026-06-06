// Server-rendered hosted badge page. Public, shareable URL.
//
// Gothic layout:
//   - Hero: tier-themed crimson/lavender gradient + circular seal with tier name
//   - Stats row: dApp count, transactions (nonce), tokens held
//   - dApp grid: armor-surface cards; emerald-replaced lavender chip for
//                token-held evidence, accent chip for assigned credits

import { isAddress } from 'viem';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { scanAddress } from '@/lib/scanner';
import type { ScanResult } from '@/lib/types';
import {
  tierFor,
  dappAccent,
  shortAddress,
} from '@/lib/badge-style';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface PageProps {
  params: Promise<{ address: string }>;
}

export async function generateMetadata({ params }: PageProps) {
  const { address } = await params;
  return {
    title: `Ritual Engagement Badge · ${shortAddress(address)}`,
    description: `dApps engaged on Ritual Chain by ${address}`,
  };
}

export default async function BadgePage({ params }: PageProps) {
  const { address } = await params;
  if (!isAddress(address)) notFound();

  let scan: ScanResult;
  try {
    scan = await scanAddress(address);
  } catch (err) {
    console.error('[badge] scan failed:', err);
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="font-display text-2xl uppercase tracking-[0.15em] text-bone">
          Ritual Engagement Badge
        </h1>
        <p className="mt-4 text-bone-muted">
          Couldn&apos;t load badge data for {shortAddress(address)}. The Ritual
          RPC may be unreachable.
        </p>
      </main>
    );
  }

  const style = tierFor(scan.dapps.length);
  const evidenceCount = scan.dapps.filter((d) => d.evidence === 'token-held').length;

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-16">
      {/* HERO */}
      <section
        className={`relative overflow-hidden rounded-3xl border border-armor-edge bg-gradient-to-br ${style.heroGradient} hero-grain px-6 py-12 shadow-2xl shadow-crimson-deep/30 sm:px-12`}
      >
        <Seal tier={style.tier} ringClass={style.sealRing} />

        <div className={`mt-8 ${style.heroText}`}>
          <p className="font-display text-[10px] uppercase tracking-[0.5em] text-crimson-glow">
            · Ritual Engagement Badge ·
          </p>
          <h1 className="mt-3 font-mono text-2xl font-semibold tracking-tight sm:text-3xl">
            {shortAddress(address)}
          </h1>
          <p className="mt-1 break-all font-mono text-[10px] opacity-60 sm:text-xs">
            {address}
          </p>
        </div>

        {/* Stats row inside hero */}
        <div className={`mt-8 grid grid-cols-3 gap-4 ${style.heroText}`}>
          <Stat label="dApps" value={String(scan.dapps.length)} />
          <Stat label="Transactions" value={String(scan.totalEngagements)} />
          <Stat label="Tokens Held" value={String(evidenceCount)} />
        </div>
      </section>

      {/* dApp grid */}
      <section className="mt-10">
        <h2 className="font-display text-xs uppercase tracking-[0.4em] text-bone-muted">
          · Engaged dApps ·
        </h2>

        {scan.dapps.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-armor-edge bg-armor/40 p-8 text-center text-sm text-bone-muted">
            No dApps credited yet. This wallet has sent {scan.totalEngagements}{' '}
            transaction{scan.totalEngagements === 1 ? '' : 's'} — interact with
            the chain to earn credits.
          </p>
        ) : (
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {scan.dapps.map((d) => {
              const accent = dappAccent(d.url);
              const isEvidence = d.evidence === 'token-held';
              return (
                <li
                  key={d.url}
                  className={`group rounded-2xl border bg-armor/60 p-5 backdrop-blur-sm transition ${
                    isEvidence
                      ? 'border-lavender/30 hover:border-lavender hover:glow-lavender'
                      : 'border-armor-edge hover:border-crimson/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate font-display text-base font-semibold uppercase tracking-wide text-bone hover:text-crimson-glow"
                      >
                        {d.name}
                      </a>
                      {d.owner && (
                        <p className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-bone-muted">
                          by {d.owner}
                        </p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-3 py-1 font-display text-[10px] uppercase tracking-[0.2em] ${
                        isEvidence
                          ? 'bg-lavender-soft text-lavender'
                          : `${accent.bg} ${accent.text}`
                      }`}
                    >
                      {isEvidence ? '✓ Token held' : 'Credited'}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="mt-10 text-center font-mono text-[11px] tracking-wider text-[#d4af37]">
        ------------------ BDH&apos;------------------------
      </p>

      <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-armor-edge pt-6 font-mono text-[11px] uppercase tracking-widest text-bone-muted">
        <span>Chain head · block {scan.indexerLastBlock.toLocaleString()}</span>
        <Link href="/" className="transition-colors hover:text-crimson-glow">
          ← Scan another address
        </Link>
      </footer>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-display text-[10px] uppercase tracking-[0.35em] opacity-70">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-bold tabular-nums sm:text-3xl">
        {value}
      </p>
    </div>
  );
}

/**
 * Circular tier seal — inline SVG, no image deps. Rotates the tier name
 * around the perimeter for a stamp / sigil feel. The bone fill on dark armor
 * echoes the bright cross on the reference figure's chest.
 */
function Seal({ tier, ringClass }: { tier: string; ringClass: string }) {
  const text = `· ${tier.toUpperCase()} · RITUAL ENGAGEMENT `;
  return (
    <div
      className={`inline-flex h-24 w-24 items-center justify-center rounded-full bg-ink/50 ring-2 backdrop-blur-sm ${ringClass} sm:h-28 sm:w-28`}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full text-bone">
        <defs>
          <path
            id="seal-circle"
            d="M 50,50 m -38,0 a 38,38 0 1,1 76,0 a 38,38 0 1,1 -76,0"
          />
        </defs>
        <text
          fontFamily="ui-monospace, monospace"
          fontSize="9"
          fontWeight="600"
          letterSpacing="0.5"
          fill="currentColor"
        >
          <textPath href="#seal-circle" startOffset="0">
            {text + text}
          </textPath>
        </text>
        <text
          x="50"
          y="55"
          textAnchor="middle"
          fontSize="14"
          fontWeight="800"
          fill="currentColor"
          fontFamily="var(--font-cinzel), serif"
        >
          {tier}
        </text>
      </svg>
    </div>
  );
}
