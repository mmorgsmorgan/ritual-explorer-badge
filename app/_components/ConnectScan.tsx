'use client';

// Page 1 — landing connect + sign-in flow.
//
// Sequence:
//   1. Idle:   ConnectButton.
//   2. Sign-in: prompt sign-message ("I'm here").
//   3. Loading: green "button" with internal progress bar fills 0→100% over
//      ~10s. Meanwhile, /api/scan/<address> fires speculatively + we prefetch
//      /scan and /badge/<address>. Bar gates on both timer AND scan ready, so
//      it can't lie about completion.
//   4. When full → router.push('/scan').

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAccount, useDisconnect, useSignMessage } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useQuery } from '@tanstack/react-query';
import type { ScanResult } from '@/lib/types';

type Phase = 'idle' | 'signing' | 'loading';

const LOADING_DURATION_MS = 10_000;
const TICK_MS = 80;

function buildChallenge(address: string) {
  return `Ritual Engagement Badge

I confirm I control this address:
${address.toLowerCase()}

Issued: ${new Date().toISOString().slice(0, 10)}`;
}

export function ConnectScan() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { signMessageAsync, isPending: signing } = useSignMessage();

  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [signedAt, setSignedAt] = useState<number | null>(null);
  const [signError, setSignError] = useState<string | null>(null);

  // Speculative scan: fires the instant we have an address, regardless of phase.
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

  // Warm the next routes so the transitions are instant.
  useEffect(() => {
    if (!address) return;
    router.prefetch('/scan');
    router.prefetch(`/badge/${address.toLowerCase()}`);
  }, [address, router]);

  // Trigger signing as soon as the wallet connects.
  useEffect(() => {
    if (!isConnected) {
      setPhase('idle');
      setProgress(0);
      setSignedAt(null);
      return;
    }
    if (phase === 'idle' && address) setPhase('signing');
  }, [isConnected, address, phase]);

  // Drive the green-button fill animation during 'loading'.
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
      if (next >= 100) {
        router.push('/scan');
        return;
      }
      timer = setTimeout(tick, TICK_MS);
    }
    tick();
    return () => clearTimeout(timer!);
  }, [phase, signedAt, scanQuery.data, router]);

  async function handleSign() {
    if (!address) return;
    setSignError(null);
    try {
      await signMessageAsync({ message: buildChallenge(address) });
      setSignedAt(Date.now());
      setPhase('loading');
    } catch (err) {
      const msg = (err as Error).message ?? 'sign rejected';
      setSignError(msg.includes('User reject') ? 'Signature declined.' : msg);
    }
  }

  function handleReset() {
    disconnect();
    setPhase('idle');
    setProgress(0);
    setSignedAt(null);
    setSignError(null);
  }

  if (!isConnected) {
    return (
      <div className="rounded-2xl border border-zinc-200 p-6 dark:border-zinc-800">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Connect your wallet to see your engagement badge.
        </p>
        <div className="mt-4">
          <ConnectButton
            chainStatus="none"
            showBalance={false}
            accountStatus="address"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-200 p-6 dark:border-zinc-800">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-xs text-zinc-500">
          {address!.slice(0, 6)}…{address!.slice(-4)}
        </span>
        <button
          onClick={handleReset}
          className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-50"
        >
          disconnect
        </button>
      </div>

      {phase === 'signing' && (
        <div className="mt-6">
          <h2 className="text-lg font-medium">Sign to enter</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            One free off-chain signature — no gas, no transaction.
          </p>
          <button
            onClick={handleSign}
            disabled={signing}
            className="mt-5 w-full rounded-xl bg-emerald-500 px-6 py-4 text-base font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-600 disabled:opacity-50"
          >
            {signing ? 'Waiting for wallet…' : 'Sign In'}
          </button>
          {signError && (
            <p className="mt-2 text-sm text-red-600">{signError}</p>
          )}
        </div>
      )}

      {phase === 'loading' && (
        <div className="mt-6">
          <h2 className="text-lg font-medium">Reading the chain</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Mapping your address across Ritual Chain.
          </p>
          <GreenLoadingButton
            progress={progress}
            label={
              scanQuery.data
                ? `${scanQuery.data.dapps.length} dApps · ${scanQuery.data.totalEngagements} tx`
                : 'Scanning…'
            }
          />
        </div>
      )}
    </div>
  );
}

/**
 * A button-shaped progress indicator: a green fill that slides left→right
 * across a pill, with the live label centered on top.
 */
export function GreenLoadingButton({
  progress,
  label,
}: {
  progress: number;
  label: string;
}) {
  return (
    <div className="relative mt-5 h-14 w-full overflow-hidden rounded-xl bg-emerald-100 shadow-inner dark:bg-emerald-950/40">
      <div
        className="absolute inset-y-0 left-0 bg-emerald-500 transition-[width] duration-100 ease-linear"
        style={{ width: `${progress}%` }}
      />
      <div className="absolute inset-0 flex items-center justify-between px-5 text-sm font-semibold">
        <span className="text-emerald-950 mix-blend-difference dark:text-emerald-50">
          {label}
        </span>
        <span className="tabular-nums text-emerald-950 mix-blend-difference dark:text-emerald-50">
          {Math.floor(progress)}%
        </span>
      </div>
    </div>
  );
}
