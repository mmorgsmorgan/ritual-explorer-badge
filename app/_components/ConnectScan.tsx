'use client';

// Page 1 — landing connect + sign-in flow.
//
// Sequence:
//   1. Idle:    ConnectButton.
//   2. Signing: crimson "Sign In" button prompts a sign-message ("I'm here").
//   3. Loading: lavender-glow progress bar fills 0→100% over ~10s. Meanwhile,
//      /api/scan/<address> fires speculatively and we prefetch /scan and
//      /badge/<address>. The bar gates on both the cosmetic timer AND scan
//      readiness so it can't lie about completion.
//   4. When full → router.push('/scan').

import { useEffect, useState } from 'react';
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

  // Drive the lavender-bar fill animation during 'loading'.
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
      <div className="rounded-2xl border border-armor-edge bg-armor/60 p-6 backdrop-blur-sm">
        <p className="text-sm text-bone-muted">
          Connect your wallet to consecrate your engagement badge.
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
    <div className="rounded-2xl border border-armor-edge bg-armor/60 p-6 backdrop-blur-sm">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-xs text-bone-muted">
          {address!.slice(0, 6)}…{address!.slice(-4)}
        </span>
        <button
          onClick={handleReset}
          className="font-display text-[10px] uppercase tracking-[0.25em] text-bone-muted transition-colors hover:text-crimson-glow"
        >
          disconnect
        </button>
      </div>

      {phase === 'signing' && (
        <div className="mt-6">
          <h2 className="font-display text-xl uppercase tracking-[0.15em] text-bone">
            Sign to enter
          </h2>
          <p className="mt-2 text-sm text-bone-muted">
            One free off-chain signature — no gas, no transaction.
          </p>
          <button
            onClick={handleSign}
            disabled={signing}
            className="mt-6 w-full rounded-xl border border-crimson bg-gradient-to-b from-crimson to-crimson-deep px-6 py-4 font-display text-base font-semibold uppercase tracking-[0.25em] text-bone transition glow-crimson hover:from-crimson-glow hover:to-crimson disabled:opacity-50"
          >
            {signing ? 'Waiting for wallet…' : 'Sign In'}
          </button>
          {signError && (
            <p className="mt-3 text-sm text-crimson-glow">{signError}</p>
          )}
        </div>
      )}

      {phase === 'loading' && (
        <div className="mt-6">
          <h2 className="font-display text-xl uppercase tracking-[0.15em] text-bone">
            Reading the chain
          </h2>
          <p className="mt-2 text-sm text-bone-muted">
            Mapping your address across Ritual Chain.
          </p>
          <RitualLoadingBar progress={progress} label="Loading…" />
        </div>
      )}
    </div>
  );
}

/**
 * Button-shaped lavender-glow progress bar. A bright purple/white fill slides
 * left→right across a dark armor pill, evoking the glowing cross sword from
 * the reference image.
 */
export function RitualLoadingBar({
  progress,
  label,
}: {
  progress: number;
  label: string;
}) {
  return (
    <div className="relative mt-6 h-14 w-full overflow-hidden rounded-xl border border-armor-edge bg-armor shadow-inner">
      <div
        className="absolute inset-y-0 left-0 bg-gradient-to-r from-lavender via-bone to-lavender transition-[width] duration-100 ease-linear"
        style={{
          width: `${progress}%`,
          boxShadow:
            '0 0 24px 2px rgba(192, 132, 252, 0.55), 0 0 80px -10px rgba(233, 213, 255, 0.65)',
        }}
      />
      <div className="absolute inset-0 flex items-center justify-between px-5 font-display text-xs uppercase tracking-[0.3em]">
        <span className="text-bone mix-blend-difference">{label}</span>
        <span className="tabular-nums text-bone mix-blend-difference">
          {Math.floor(progress)}%
        </span>
      </div>
    </div>
  );
}
