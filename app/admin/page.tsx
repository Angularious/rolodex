'use client';

import { useEffect, useState } from 'react';

interface AdminData {
  persistent: boolean;
  spend: { spent: number; cap: number; ratio: number; overCap: boolean; warn: boolean };
  totals: { searches: number; errorRate: number; conversions: number };
  searchesByDay: { day: string; count: number }[];
  topDomains: { domain: string; count: number }[];
  recent: {
    ts: number;
    domain: string;
    cost: number;
    durationMs: number;
    success: boolean;
  }[];
}

export default function AdminPage() {
  const [key, setKey] = useState('');
  const [data, setData] = useState<AdminData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const k = url.searchParams.get('key');
    if (k) {
      setKey(k);
      load(k);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async (k: string) => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin?key=${encodeURIComponent(k)}`);
      if (!res.ok) {
        setErr(res.status === 401 ? 'Wrong password.' : 'Failed to load.');
        setData(null);
        return;
      }
      setData((await res.json()) as AdminData);
    } catch {
      setErr('Network error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="border-b-4 border-ink bg-neon">
        <div className="mx-auto max-w-5xl px-4 py-3 font-display text-2xl">📊 ADMIN — COMPANY INTEL</div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load(key);
          }}
          className="retro-panel p-4 flex gap-3 max-w-md"
        >
          <input
            className="retro-input"
            type="password"
            placeholder="Admin password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <button className="retro-btn" disabled={loading}>
            {loading ? '…' : 'Unlock'}
          </button>
        </form>

        {err && <div className="retro-panel-flat p-3 my-4 bg-[#fff7c2] text-signal font-bold">{err}</div>}

        {data && (
          <div className="mt-6 space-y-6">
            {!data.persistent && (
              <div className="retro-panel-flat p-3 bg-[#fff7c2] text-sm">
                ⚠ Using in-memory store (no Upstash configured). Stats reset on redeploy and are
                per-instance.
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <Stat label="Searches (recent)" value={String(data.totals.searches)} />
              <Stat label="Error rate" value={`${data.totals.errorRate}%`} />
              <Stat label="Conversions" value={String(data.totals.conversions)} />
            </div>

            <div className="retro-panel-flat p-4">
              <h2 className="font-display text-xl mb-2">Daily spend</h2>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="font-display text-3xl text-cobalt">${data.spend.spent.toFixed(2)}</span>
                <span className="text-slate">/ ${data.spend.cap.toFixed(2)} cap</span>
                {data.spend.overCap && <span className="badge badge-red">AT CAPACITY</span>}
                {!data.spend.overCap && data.spend.warn && <span className="badge badge-yellow">80%+</span>}
              </div>
              <div className="h-4 border-2 border-ink rounded overflow-hidden bg-white">
                <div
                  className={data.spend.overCap ? 'h-full bg-signal' : 'h-full bg-cobalt'}
                  style={{ width: `${Math.min(100, Math.round(data.spend.ratio * 100))}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="retro-panel-flat p-4">
                <h2 className="font-display text-xl mb-2">Top domains</h2>
                {data.topDomains.length === 0 && <p className="text-slate text-sm">No data yet.</p>}
                <ul className="space-y-1">
                  {data.topDomains.map((d) => (
                    <li key={d.domain} className="flex justify-between text-sm">
                      <span className="truncate">{d.domain}</span>
                      <span className="font-bold">{d.count}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="retro-panel-flat p-4">
                <h2 className="font-display text-xl mb-2">Searches by day</h2>
                {data.searchesByDay.length === 0 && <p className="text-slate text-sm">No data yet.</p>}
                <ul className="space-y-1">
                  {data.searchesByDay.map((d) => (
                    <li key={d.day} className="flex justify-between text-sm">
                      <span>{d.day}</span>
                      <span className="font-bold">{d.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="retro-panel-flat p-4 overflow-x-auto">
              <h2 className="font-display text-xl mb-2">Recent searches</h2>
              <table className="retro-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Domain</th>
                    <th>Cost</th>
                    <th>Duration</th>
                    <th>OK</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((e, i) => (
                    <tr key={i}>
                      <td>{new Date(e.ts).toLocaleString()}</td>
                      <td>{e.domain}</td>
                      <td>${e.cost.toFixed(2)}</td>
                      <td>{(e.durationMs / 1000).toFixed(1)}s</td>
                      <td>{e.success ? '✓' : '✗'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="retro-panel-flat p-3 text-center">
      <div className="font-display text-3xl text-cobalt">{value}</div>
      <div className="text-[0.7rem] uppercase tracking-wide text-slate font-bold">{label}</div>
    </div>
  );
}
