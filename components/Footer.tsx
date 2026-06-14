'use client';

export default function Footer() {
  const track = () => {
    fetch('/api/track', { method: 'POST' }).catch(() => {});
  };
  return (
    <footer className="mt-12 border-t-4 border-ink bg-cobalt-deep text-white">
      <div className="mx-auto max-w-6xl px-4 py-6 flex flex-col sm:flex-row gap-4 items-center justify-between text-sm">
        <div className="opacity-90">
          Data sourced via{' '}
          <a
            href="https://tomba.io/data-sourcing"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-neon"
          >
            Tomba
          </a>{' '}
          for research purposes. Emails are pattern-inferred and may be unverified.
        </div>
        <a
          href="https://orthogonal.com"
          target="_blank"
          rel="noreferrer"
          onClick={track}
          className="font-display text-neon text-lg whitespace-nowrap hover:translate-x-[-2px] transition-transform"
        >
          ⚡ Powered by orthogonal.com →
        </a>
      </div>
    </footer>
  );
}
