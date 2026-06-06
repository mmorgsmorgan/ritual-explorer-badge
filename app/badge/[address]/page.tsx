// Server-rendered hosted badge page. Public, shareable URL.
//
// Layout:
//   - Hero: tier-themed gradient background + circular seal with tier name
//   - Stats row: dApp count, total interactions, member-since date
//   - dApp grid: cards with deterministic per-dApp accent colors

import { isAddress } from 'viem';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { scanAddress } from '@/lib/scanner';
import type { ScanResult } from '@/lib/types';
import {
  tierFor,
  dappAccent,
  memberSince,
  shortAddress,
  fmtMonthYear,
  fmtDate,
  daysAgo,
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
        <h1 className="text-2xl font-semibold">Ritual Engagement Badge</h1>
        <p className="mt-4 text-zinc-500">
          Couldn&apos;t load engagement data for {shortAddress(address)}. The
          indexer may not be running.
        </p>
      </main>
    );
  }

  const style = tierFor(scan.dapps.length);
  const since = memberSince(scan.dapps);

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-16">
      {/* HERO */}
      <section
        className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${style.heroGradient} px-6 py-12 shadow-xl sm:px-12`}
      >
        <Seal tier={style.tier} ringClass={style.sealRing} />

        <div className={`mt-8 ${style.heroText}`}>
          <p className="text-xs uppercase tracking-[0.3em] opacity-80">
            Ritual Engagement Badge
          </p>
          <h1 className="mt-2 font-mono text-2xl font-semibold tracking-tight sm:text-3xl">
            {shortAddress(address)}
          </h1>
          <p className="mt-1 break-all font-mono text-[10px] opacity-60 sm:text-xs">
            {address}
          </p>
        </div>

        {/* Stats row inside hero */}
        <div className={`mt-8 grid grid-cols-3 gap-4 ${style.heroText}`}>
          <Stat label="dApps" value={String(scan.dapps.length)} />
          <Stat label="Interactions" value={String(scan.totalEngagements)} />
          <Stat
            label="Since"
            value={since ? fmtMonthYear(since) : '—'}
          />
        </div>
      </section>

      {/* dApp grid */}
      <section className="mt-10">
        <h2 className="text-sm font-medium uppercase tracking-wider text-zinc-500">
          Engaged dApps
        </h2>

        {scan.dapps.length === 0 ? (
          <p className="mt-6 rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
            No engagements indexed yet. Either this address hasn&apos;t touched
            a tracked dApp, or the indexer hasn&apos;t reached the right blocks.
            <br />
            Indexer cursor: block {scan.indexerLastBlock.toLocaleString()}.
          </p>
        ) : (
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {scan.dapps.map((d) => {
              const accent = dappAccent(d.url);
              const lastDays = daysAgo(d.lastInteraction);
              return (
                <li
                  key={d.url}
                  className="rounded-2xl border border-zinc-200 bg-white p-5 transition hover:border-zinc-400 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-base font-semibold hover:underline"
                      >
                        {d.name}
                      </a>
                      {d.owner && (
                        <p className="mt-0.5 text-xs text-zinc-500">
                          by {d.owner}
                        </p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${accent.bg} ${accent.text}`}
                    >
                      {d.txCount} tx
                    </span>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <dt className="text-zinc-500">First</dt>
                      <dd className="mt-0.5 font-medium">
                        {fmtDate(d.firstInteraction)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500">Last</dt>
                      <dd className="mt-0.5 font-medium">
                        {lastDays === 0 ? 'today' : `${lastDays}d ago`}
                      </dd>
                    </div>
                  </dl>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 pt-6 text-xs text-zinc-500 dark:border-zinc-800">
        <span>
          Indexer cursor: block {scan.indexerLastBlock.toLocaleString()}
        </span>
        <Link href="/" className="hover:text-zinc-900 dark:hover:text-zinc-50">
          ← Scan another address
        </Link>
      </footer>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest opacity-70">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold tabular-nums sm:text-2xl">{value}</p>
    </div>
  );
}

/**
 * Circular tier seal — inline SVG, no image deps. Rotates the tier name
 * around the perimeter for a "stamp" feel.
 */
function Seal({ tier, ringClass }: { tier: string; ringClass: string }) {
  const text = `· ${tier.toUpperCase()} · RITUAL ENGAGEMENT `;
  return (
    <div
      className={`inline-flex h-24 w-24 items-center justify-center rounded-full bg-white/30 ring-2 backdrop-blur-sm ${ringClass} sm:h-28 sm:w-28`}
    >
      <svg viewBox="0 0 100 100" className="h-full w-full">
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
          fontFamily="system-ui, sans-serif"
        >
          {tier}
        </text>
      </svg>
    </div>
  );
}
