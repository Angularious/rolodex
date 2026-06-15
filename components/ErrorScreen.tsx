'use client';

import type { SearchError } from '@/lib/types';

const SCREENS: Record<
  SearchError['error'],
  { title: string; sub: (e: SearchError) => string; emoji: string }
> = {
  rate_limited: {
    emoji: '🪙',
    title: "YOU'RE OUT OF TOKENS",
    sub: (e) =>
      e.retryAfterSec
        ? `Insert more credits in ${formatRetry(e.retryAfterSec)}.`
        : 'Slow down a moment and try again shortly.',
  },
  capacity: {
    emoji: '🚧',
    title: 'DEMO AT CAPACITY',
    sub: () => "Today's free credits are spent. Come back tomorrow — or run it on your own Orthogonal key.",
  },
  invalid_domain: {
    emoji: '🚫',
    title: 'INVALID INPUT',
    sub: (e) => e.message || 'Try a company domain like brattle.com.',
  },
  not_found: {
    emoji: '👻',
    title: 'NO RECORDS',
    sub: (e) => e.message || "Tomba doesn't have data on this company.",
  },
  server_error: {
    emoji: '📺',
    title: 'SERVICE INTERRUPTED',
    sub: () => 'Something went sideways on our end. Try again shortly.',
  },
  bad_request: {
    emoji: '❓',
    title: 'BAD REQUEST',
    sub: (e) => e.message || 'That request did not look right.',
  },
};

function formatRetry(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.ceil(sec / 60);
  if (m < 60) return `${m} min`;
  return `${Math.ceil(m / 60)} hr`;
}

export default function ErrorScreen({ error, onReset }: { error: SearchError; onReset: () => void }) {
  const screen = SCREENS[error.error] ?? SCREENS.server_error;
  return (
    <div className="retro-panel pop-in p-8 my-6 text-center bg-ink-2/70">
      <div className="text-6xl mb-3">{screen.emoji}</div>
      <h2 className="font-display text-4xl text-accent-soft mb-2">{screen.title}</h2>
      <p className="opacity-90 max-w-md mx-auto mb-6">{screen.sub(error)}</p>
      <button className="retro-btn" onClick={onReset}>
        ◄ Insert Coin
      </button>
    </div>
  );
}
