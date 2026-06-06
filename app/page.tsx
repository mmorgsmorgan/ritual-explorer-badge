// Landing page — connect wallet → sign-in → loading button.
//
// Gothic theme: ink background, crimson accents, lavender glow on focus,
// sepia haze bleeds through from globals.css. Single source of color truth
// is the @theme block in globals.css.

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { isAddress } from 'viem';
import { ConnectScan } from './_components/ConnectScan';

export default function Home() {
  const router = useRouter();
  const [showLookup, setShowLookup] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submitLookup(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!isAddress(trimmed)) {
      setError('Enter a valid 0x EVM address.');
      return;
    }
    router.push(`/badge/${trimmed.toLowerCase()}`);
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-6 py-16">
      <header>
        <p className="font-display text-[10px] uppercase tracking-[0.5em] text-crimson-glow">
          · Ritual Chain · Step 1 ·
        </p>
        <h1 className="mt-4 font-display text-5xl font-bold uppercase tracking-[0.08em] text-bone">
          Engagement
          <br />
          <span className="text-crimson">Badge</span>
        </h1>
        <p className="mt-5 max-w-md text-sm leading-relaxed text-bone-muted">
          A reading of every dApp your wallet has touched on Ritual Chain.
          Connect, sign, scan — the chain bears witness.
        </p>
      </header>

      <section className="mt-10">
        <ConnectScan />
      </section>

      <section className="mt-12 text-sm">
        <button
          type="button"
          onClick={() => setShowLookup((v) => !v)}
          className="font-display text-[11px] uppercase tracking-[0.3em] text-bone-muted transition-colors hover:text-bone"
        >
          {showLookup ? '× close' : 'or look up another address →'}
        </button>

        {showLookup && (
          <form
            onSubmit={submitLookup}
            className="mt-4 flex flex-col gap-2 sm:flex-row"
          >
            <input
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (error) setError(null);
              }}
              placeholder="0x…"
              className="flex-1 rounded-md border border-armor-edge bg-armor px-4 py-3 font-mono text-sm text-bone placeholder:text-bone-muted/60 transition focus:border-crimson focus:outline-none focus:glow-crimson"
            />
            <button
              type="submit"
              className="rounded-md border border-crimson/60 bg-crimson-deep/40 px-6 py-3 font-display text-xs uppercase tracking-[0.25em] text-bone transition hover:border-crimson hover:bg-crimson hover:glow-crimson"
            >
              View
            </button>
          </form>
        )}
        {error && <p className="mt-2 text-sm text-crimson-glow">{error}</p>}
      </section>

      <footer className="mt-auto pt-16 text-xs text-bone-muted">
        Tracking community dApps across verified contracts on Ritual Chain.{' '}
        <Link
          href="https://docs.google.com/spreadsheets/d/1-71yrtMqSRCTAvmshY2K_wDSYproX7GQFybKwkC5IFM/edit"
          target="_blank"
          rel="noreferrer"
          className="text-crimson-glow underline-offset-2 hover:underline"
        >
          Source list
        </Link>
        .
      </footer>
    </main>
  );
}
