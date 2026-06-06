'use client';

// Page 2 — /scan
//
// Big green SCAN button → user clicks → sign #2 → green progress bar fills →
// navigate to /badge/<address>.
//
// The first sign-in on / already fired the speculative scan, so by the time
// the user clicks SCAN here, the data is already cached in react-query.
// Bar #2 gates on both the cosmetic timer AND scan readiness — but the scan
// is almost always already done, so the bar just runs its cosmetic clock.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount, useSignMessage } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { GreenLoadingButton } from '../_components/ConnectScan';
import type { ScanResult } from '@/lib/types';

type Phase = 'ready' | 'signing' | 'loading';

const LOADING_DURATION_MS = 8_000;
const TICK_MS = 80;

function buildChallenge(address: string) {
  return `Ritual Engagement Badge — Scan

Confirm scan of:
${address.toLowerCase()}

Issued: ${new Date().toISOString().slice(0, 10)}`;
}

export default function ScanPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { signMessageAsync, isPending: signing } = useSignMessage();

  const [phase, setPhase] = useState<Phase>('ready');
  const [progress, setProgress] = useState(0);
  const [signedAt, setSignedAt] = useState<number | null>(null);
  const [signError, setSignError] = useState<string | null>(null);

  // Read the cached scan (warmed by page 1) — or fetch if the user
  // landed here directly without going through /.
  const scanQuery = useQuery<ScanResult>({
    queryKey: ['scan', address?.toLowerCase()],
    queryFn: async () => {
      const r = await fetch(`/api/scan/${address}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`scan failed: ${r.status}`);
      return r.json();
    },
    enabled: Boolean(address),
    staleTime: 30_000,
  });

  // Prefetch the reveal page so the final hop is instant.
  useEffect(() => {
    if (address) router.prefetch(`/badge/${address.toLowerCase()}`);
  }, [address, router]);

  // If the user arrived without a wallet (e.g. direct link), bounce home.
  useEffect(() => {
    if (!isConnected) router.replace('/');
  }, [isConnected, router]);

  // Bar #2 driver.
  useEffect(() => {
    if (phase !== 'loading' || signedAt === null) return;
    const start = signedAt;
    let timer: ReturnType<typeof setTimeout>;

    function tick() {
      const elapsed = Date.now() - start;
      const cosmetic = Math.min(100, (elapsed / LOADING_DURATION_MS) * 100);
      const scanDone = scanQuery.data !== undefined;
      const next = scanDone ? cosmetic : Math.min(99, cosmetic);
      setProgress(next);
      if (next >= 100 && address) {
        router.push(`/badge/${address.toLowerCase()}`);
        return;
      }
      timer = setTimeout(tick, TICK_MS);
    }
    tick();
    return () => clearTimeout(timer!);
  }, [phase, signedAt, scanQuery.data, address, router]);

  async function handleScan() {
    if (!address) return;
    setSignError(null);
    setPhase('signing');
    try {
      await signMessageAsync({ message: buildChallenge(address) });
      setSignedAt(Date.now());
      setPhase('loading');
    } catch (err) {
      const msg = (err as Error).message ?? 'sign rejected';
      setSignError(msg.includes('User reject') ? 'Signature declined.' : msg);
      setPhase('ready');
    }
  }

  if (!isConnected || !address) {
    // While the redirect effect runs, show nothing.
    return null;
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-6 py-16">
      <p className="text-xs uppercase tracking-widest text-zinc-500">
        Step 2 · Sign to scan
      </p>
      <h1 className="mt-2 text-center text-4xl font-semibold tracking-tight">
        Ready to scan
      </h1>
      <p className="mt-3 text-center text-zinc-600 dark:text-zinc-400">
        Confirm a signature to pull your full engagement footprint.
      </p>
      <p className="mt-4 font-mono text-xs text-zinc-500">
        {address.slice(0, 6)}…{address.slice(-4)}
      </p>

      <div className="mt-10 w-full">
        {phase === 'ready' || phase === 'signing' ? (
          <button
            onClick={handleScan}
            disabled={signing}
            className="w-full rounded-2xl bg-emerald-500 px-8 py-6 text-2xl font-bold uppercase tracking-wider text-white shadow-2xl shadow-emerald-500/40 transition hover:scale-[1.01] hover:bg-emerald-600 disabled:opacity-50"
          >
            {signing ? 'Waiting for wallet…' : 'Scan'}
          </button>
        ) : (
          <GreenLoadingButton
            progress={progress}
            label={
              scanQuery.data
                ? `${scanQuery.data.dapps.length} dApps · ${scanQuery.data.totalEngagements} tx`
                : 'Compiling…'
            }
          />
        )}
        {signError && (
          <p className="mt-3 text-center text-sm text-red-600">{signError}</p>
        )}
      </div>
    </main>
  );
}
