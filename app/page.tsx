// Landing page — connect wallet → sign-in → green loading button.
//
// The whole flow lives in <ConnectScan>; this page just frames it.

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
        <p className="text-xs uppercase tracking-widest text-zinc-500">
          Ritual Chain · Step 1 · Sign In
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">
          Engagement Badge
        </h1>
        <p className="mt-3 max-w-md text-zinc-600 dark:text-zinc-400">
          Every dApp your wallet has touched on Ritual Chain. Connect, sign,
          scan.
        </p>
      </header>

      <section className="mt-10">
        <ConnectScan />
      </section>

      <section className="mt-12 text-sm">
        <button
          type="button"
          onClick={() => setShowLookup((v) => !v)}
          className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
        >
          {showLookup ? '× close' : 'or look up another address →'}
        </button>

        {showLookup && (
          <form
            onSubmit={submitLookup}
            className="mt-3 flex flex-col gap-2 sm:flex-row"
          >
            <input
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                if (error) setError(null);
              }}
              placeholder="0x…"
              className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-50"
            />
            <button
              type="submit"
              className="rounded-md border border-zinc-300 bg-white px-5 py-2 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-900"
            >
              View
            </button>
          </form>
        )}
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </section>

      <footer className="mt-auto pt-16 text-xs text-zinc-500">
        Tracking 84 community dApps across 70 verified contracts on Ritual
        Chain (id 1979).{' '}
        <Link
          href="https://docs.google.com/spreadsheets/d/1-71yrtMqSRCTAvmshY2K_wDSYproX7GQFybKwkC5IFM/edit"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-zinc-900 dark:hover:text-zinc-50"
        >
          Source list
        </Link>
        .
      </footer>
    </main>
  );
}
