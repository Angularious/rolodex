'use client';

// Circuit-schematic drill-down view. Self-contained visual identity (pure black,
// neon orthogonal line-art, monospace) — deliberately NOT themed like the rest of
// the site. Plain SVG with computed coordinates + a CSS-transform "camera"; no
// force simulation, no Three.js. Fed by the same in-memory report as the table
// view (no new fetch).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GraphData } from '@/components/graph/types';
import type { Employee } from '@/lib/types';
import type { RevealFn } from '@/components/EmployeesTab';
import {
  buildBuses,
  busRect,
  trunk,
  grid,
  cameraFor,
  ROOT,
  VIEW,
  CENTER,
  CAT_SLOT_MOBILE,
  type Bus,
  type SubNode,
  type OutDir,
} from './geometry';

const FONT = 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)';
const TRACE = '#cfdcea'; // neutral trunk/trace color
const MIN_SCALE = 0.6;
const MAX_SCALE = 3.0;
const PAN_LIMIT = VIEW * 0.5; // max pan offset — keeps circuit board in view

function getInitials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase();
}

interface RevealState { loading: boolean; tried: boolean; email: string | null; phone: string | null; }

// ---------------------------------------------------------------------------
// Small SVG primitives
// ---------------------------------------------------------------------------
function Corners({ x, y, w, h, len = 14, color, sw = 2 }: { x: number; y: number; w: number; h: number; len?: number; color: string; sw?: number }) {
  const L = len;
  const seg = (d: string) => <path d={d} stroke={color} strokeWidth={sw} fill="none" strokeLinecap="square" />;
  return (
    <g>
      {seg(`M ${x} ${y + L} L ${x} ${y} L ${x + L} ${y}`)}
      {seg(`M ${x + w - L} ${y} L ${x + w} ${y} L ${x + w} ${y + L}`)}
      {seg(`M ${x + w} ${y + h - L} L ${x + w} ${y + h} L ${x + w - L} ${y + h}`)}
      {seg(`M ${x + L} ${y + h} L ${x} ${y + h} L ${x} ${y + h - L}`)}
    </g>
  );
}

function ArrowHead({ x, y, dir, color }: { x: number; y: number; dir: OutDir; color: string }) {
  const s = 9;
  const pts =
    dir === 'left' ? `${x},${y} ${x + s},${y - s} ${x + s},${y + s}`
    : dir === 'right' ? `${x},${y} ${x - s},${y - s} ${x - s},${y + s}`
    : dir === 'up' ? `${x},${y} ${x - s},${y + s} ${x + s},${y + s}`
    : `${x},${y} ${x - s},${y - s} ${x + s},${y - s}`;
  return <polygon points={pts} fill={color} />;
}

function Chevron({ x, y, dir, color }: { x: number; y: number; dir: OutDir; color: string }) {
  const s = 5;
  const d =
    dir === 'down' ? `M ${x - s} ${y - s} L ${x} ${y} L ${x + s} ${y - s}`
    : `M ${x - s} ${y - s} L ${x} ${y} L ${x - s} ${y + s}`;
  return <path d={d} stroke={color} strokeWidth={1.6} fill="none" opacity={0.85} />;
}

// chip glyph centered in a sub-node
function Chip({ cx, cy, color }: { cx: number; cy: number; color: string }) {
  return (
    <g stroke={color} strokeWidth={1.4} fill="none" opacity={0.9}>
      <rect x={cx - 7} y={cy - 7} width={14} height={14} />
      <line x1={cx - 7} y1={cy} x2={cx - 11} y2={cy} />
      <line x1={cx + 7} y1={cy} x2={cx + 11} y2={cy} />
      <line x1={cx} y1={cy - 7} x2={cx} y2={cy - 11} />
      <line x1={cx} y1={cy + 7} x2={cx} y2={cy + 11} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Sub-node chip in a cluster grid
// ---------------------------------------------------------------------------
function GridChip({ x, y, color, node, active, onClick }: { x: number; y: number; color: string; node: SubNode; active: boolean; onClick: () => void }) {
  const S = 52;
  const TAP = 72; // invisible hit area — larger for touch
  const label = node.label.length > 16 ? node.label.slice(0, 15) + '…' : node.label;
  const hasPerson = node.kind === 'employee';
  const initials = hasPerson ? getInitials(node.label) : null;
  return (
    <g style={{ cursor: 'pointer' }} onClick={onClick} className="circ-chip">
      {/* larger invisible rect for touch targets */}
      <rect x={x - TAP / 2} y={y - TAP / 2} width={TAP} height={TAP} fill="transparent" />
      <rect x={x - S / 2} y={y - S / 2} width={S} height={S} fill={active ? color : '#05070b'} opacity={active ? 0.16 : 0.9} />
      <Corners x={x - S / 2} y={y - S / 2} w={S} h={S} len={11} color={color} sw={active ? 2.4 : 1.6} />
      {initials ? (
        <g>
          <circle cx={x} cy={y} r={18} fill={color} opacity={0.15} />
          <circle cx={x} cy={y} r={18} stroke={color} strokeWidth={1.4} fill="none" opacity={0.7} />
          <text x={x} y={y + 5} textAnchor="middle" fontFamily={FONT} fontSize={13} fontWeight="600" fill={color} opacity={0.9}>
            {initials}
          </text>
        </g>
      ) : (
        <Chip cx={x} cy={y} color={color} />
      )}
      <text x={x} y={y + S / 2 + 16} textAnchor="middle" fontFamily={FONT} fontSize={12} fill={TRACE} opacity={0.85}>
        {label}
      </text>
    </g>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
export default function CircuitGraph({
  data,
  onReveal,
  onSearchCompany,
  onSwitchToTable,
}: {
  data: GraphData;
  onReveal: RevealFn;
  onSearchCompany: (domain: string) => void;
  onSwitchToTable?: () => void;
}) {
  // Detect mobile viewport to switch to two-column layout (< 768px).
  // Initialized synchronously (ssr:false component) to avoid a layout flash.
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const buses = useMemo(() => buildBuses(data, isMobile ? CAT_SLOT_MOBILE : undefined), [data, isMobile]);
  const [focused, setFocused] = useState<Bus | null>(null);
  const [selected, setSelected] = useState<{ node: SubNode; color: string } | null>(null);
  const [revealMap, setRevealMap] = useState<Record<string, RevealState>>({});

  // User-controlled pan/zoom for touch (on top of the camera transform).
  const [userTransform, setUserTransform] = useState({ tx: 0, ty: 0, scale: 1 });
  const utRef = useRef({ tx: 0, ty: 0, scale: 1 });
  const svgRef = useRef<SVGSVGElement>(null);

  // Non-passive touch listeners for pan + pinch-to-zoom, plus desktop wheel zoom.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;

    let lastSingle: { x: number; y: number } | null = null;
    let lastDist: number | null = null;
    let lastMid: { x: number; y: number } | null = null;

    // Convert CSS pixels to SVG user units.
    function svgFactor(): number {
      const r = el!.getBoundingClientRect();
      return r.width > 0 ? VIEW / r.width : 1;
    }

    // Apply incremental pan in SVG units with clamping.
    function applyPan(dx: number, dy: number) {
      const { tx, ty, scale } = utRef.current;
      utRef.current = {
        scale,
        tx: Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, tx + dx)),
        ty: Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, ty + dy)),
      };
      setUserTransform({ ...utRef.current });
    }

    // Zoom to a specific SVG-space point (cx, cy) by factor k.
    // Model: transform-origin is CENTER, so display pos = CENTER + (p - CENTER)*s + tx.
    // To keep (cx,cy) fixed: newTx = tx + (cx - CENTER)*(s - newS).
    function applyZoom(cx: number, cy: number, k: number) {
      const { tx, ty, scale } = utRef.current;
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * k));
      const newTx = Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, tx + (cx - CENTER) * (scale - newScale)));
      const newTy = Math.max(-PAN_LIMIT, Math.min(PAN_LIMIT, ty + (cy - CENTER) * (scale - newScale)));
      utRef.current = { tx: newTx, ty: newTy, scale: newScale };
      setUserTransform({ ...utRef.current });
    }

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        lastSingle = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        lastDist = null;
        lastMid = null;
      } else if (e.touches.length === 2) {
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        lastDist = Math.hypot(dx, dy);
        lastMid = { x: (e.touches[0].clientX + e.touches[1].clientX) / 2, y: (e.touches[0].clientY + e.touches[1].clientY) / 2 };
        lastSingle = null;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const f = svgFactor();
      if (e.touches.length === 1 && lastSingle) {
        const dx = (e.touches[0].clientX - lastSingle.x) * f;
        const dy = (e.touches[0].clientY - lastSingle.y) * f;
        applyPan(dx, dy);
        lastSingle = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2 && lastDist !== null && lastMid) {
        const dx = e.touches[1].clientX - e.touches[0].clientX;
        const dy = e.touches[1].clientY - e.touches[0].clientY;
        const newDist = Math.hypot(dx, dy);
        const k = Math.max(0.9, Math.min(1.1, newDist / lastDist));
        const r = el!.getBoundingClientRect();
        const newMid = { x: (e.touches[0].clientX + e.touches[1].clientX) / 2, y: (e.touches[0].clientY + e.touches[1].clientY) / 2 };
        const cx = (newMid.x - r.left) * f;
        const cy = (newMid.y - r.top) * f;
        applyZoom(cx, cy, k);
        lastDist = newDist;
        lastMid = newMid;
      }
    };

    const onTouchEnd = () => {
      lastSingle = null;
      lastDist = null;
      lastMid = null;
    };

    // Desktop: scroll wheel zooms toward cursor position.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const f = svgFactor();
      const r = el!.getBoundingClientRect();
      const cx = (e.clientX - r.left) * f;
      const cy = (e.clientY - r.top) * f;
      const k = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      applyZoom(cx, cy, k);
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('wheel', onWheel);
    };
  }, []);

  const cam = cameraFor(focused?.slot ?? null, isMobile);

  const stats = useMemo(() => {
    const nodes = 1 + buses.reduce((s, b) => s + b.count, 0);
    const links = buses.length + buses.reduce((s, b) => s + b.count, 0);
    return { nodes, links, buses: buses.length };
  }, [buses]);

  const resetUserTransform = useCallback(() => {
    const zero = { tx: 0, ty: 0, scale: 1 };
    utRef.current = zero;
    setUserTransform(zero);
  }, []);

  // Reset to root view and restore default zoom/pan.
  const reset = useCallback(() => {
    setFocused(null);
    setSelected(null);
    resetUserTransform();
  }, [resetUserTransform]);

  // Toggle bus focus: tap once to drill in, tap again (or ROOT) to return.
  const focusBus = useCallback((b: Bus) => {
    setFocused((cur) => (cur?.cat === b.cat ? null : b));
    setSelected(null);
    resetUserTransform();
  }, [resetUserTransform]);

  const reveal = useCallback(
    async (id: string, payload: { ceId?: string | null; linkedin?: string | null }) => {
      setRevealMap((m) => (m[id]?.loading || m[id]?.tried ? m : { ...m, [id]: { loading: true, tried: false, email: null, phone: null } }));
      try {
        const res = await onReveal(payload);
        setRevealMap((m) => ({ ...m, [id]: { loading: false, tried: true, email: res.email, phone: res.phone ?? null } }));
      } catch {
        setRevealMap((m) => ({ ...m, [id]: { loading: false, tried: true, email: null, phone: null } }));
      }
    },
    [onReveal],
  );

  const company = data.company;
  const rootLabel = company?.name || data.domain;

  return (
    <div className="absolute inset-0 overflow-hidden bg-black/15 text-white" style={{ fontFamily: FONT }}>
      {/* ---------------- schematic ---------------- */}
      <svg ref={svgRef} viewBox={`0 0 ${VIEW} ${VIEW}`} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full" style={{ touchAction: 'none' }}>
        <defs>
          <filter id="cglow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <pattern id="cgrid" width="44" height="44" patternUnits="userSpaceOnUse">
            <path d="M 44 0 L 0 0 0 44" fill="none" stroke="#0e1626" strokeWidth="1" />
          </pattern>
        </defs>

        <rect x={0} y={0} width={VIEW} height={VIEW} fill="url(#cgrid)" opacity={0.5} />

        {/* User pan/zoom layer (touch-driven, resets on bus focus change) */}
        <g style={{ transform: `translate(${userTransform.tx}px, ${userTransform.ty}px) scale(${userTransform.scale})`, transformOrigin: `${CENTER}px ${CENTER}px` }}>
        <g
          style={{
            transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.scale})`,
            transformOrigin: '0 0',
            transition: 'transform 0.7s cubic-bezier(.4,0,.2,1)',
          }}
        >
          {/* trunks + bus boxes */}
          {buses.map((b) => {
            const r = busRect(b.slot);
            const t = trunk(b.slot);
            const isFocus = focused?.cat === b.cat;
            const dim = focused && !isFocus ? 0.32 : 1;
            return (
              <g key={b.cat} style={{ opacity: dim, transition: 'opacity 0.5s' }}>
                {/* trunk trace */}
                {t.double ? (
                  <g filter="url(#cglow)">
                    <line x1={t.from.x} y1={t.from.y - 3} x2={t.to.x} y2={t.to.y - 3} stroke={TRACE} strokeWidth={2.4} />
                    <line x1={t.from.x} y1={t.from.y + 3} x2={t.to.x} y2={t.to.y + 3} stroke={TRACE} strokeWidth={2.4} />
                  </g>
                ) : (
                  <path d={t.path} stroke={TRACE} strokeWidth={2.4} fill="none" filter="url(#cglow)" />
                )}
                {t.ticks.map((tk, i) => (
                  <line key={i} x1={tk.x1} y1={tk.y1} x2={tk.x2} y2={tk.y2} stroke={TRACE} strokeWidth={1.2} opacity={0.6} />
                ))}
                {t.dots.map((d, i) => (
                  <circle key={i} cx={d.x} cy={d.y} r={3.4} fill={TRACE} />
                ))}
                {t.vias.map((v, i) => (
                  <circle key={i} cx={v.x} cy={v.y} r={5} fill="#05070b" stroke={TRACE} strokeWidth={1.6} />
                ))}
                <ArrowHead x={t.arrow.x} y={t.arrow.y} dir={t.arrow.dir} color={TRACE} />

                {/* bus box */}
                <g style={{ cursor: 'pointer' }} onClick={() => focusBus(b)}>
                  <rect x={r.x} y={r.y} width={r.w} height={r.h} fill="#05070b" stroke={b.color} strokeWidth={isFocus ? 2.4 : 1.4} filter={isFocus ? 'url(#cglow)' : undefined} opacity={0.96} />
                  <Corners x={r.x - 5} y={r.y - 5} w={r.w + 10} h={r.h + 10} len={14} color={b.color} sw={1.6} />
                  <text x={r.cx} y={r.cy + 5} textAnchor="middle" fontFamily={FONT} fontSize={15} letterSpacing="1" fill={b.color}>
                    {b.title} · {b.count.toLocaleString()}
                  </text>
                  {/* outer connector terminal */}
                  <rect
                    x={(b.slot === 'left' || b.slot === 'bottomLeft' || b.slot === 'mLeft1' || b.slot === 'mLeft2' || b.slot === 'mLeft3' ? r.x - 12 : r.x + r.w + 2)}
                    y={r.cy - 5}
                    width={10}
                    height={10}
                    fill={b.color}
                  />
                </g>
              </g>
            );
          })}

          {/* focused cluster grid — tap a chip to open detail panel, tap again to close */}
          {focused && <ClusterGrid key={focused.cat} bus={focused} onPick={(node) => setSelected((s) => s?.node.id === node.id ? null : { node, color: focused.color })} selectedId={selected?.node.id ?? null} />}

          {/* root node — always tappable: resets view (unfocus + restore zoom/pan) */}
          <g style={{ cursor: 'pointer' }} onClick={reset}>
            {/* invisible extended tap target */}
            <rect x={ROOT.x - ROOT.s / 2 - 20} y={ROOT.y - ROOT.s / 2 - 20} width={ROOT.s + 40} height={ROOT.s + 40} fill="transparent" />
            <rect x={ROOT.x - ROOT.s / 2} y={ROOT.y - ROOT.s / 2} width={ROOT.s} height={ROOT.s} fill="#05070b" stroke="#ffffff" strokeWidth={2} filter="url(#cglow)" />
            <Corners x={ROOT.x - ROOT.s / 2 - 7} y={ROOT.y - ROOT.s / 2 - 7} w={ROOT.s + 14} h={ROOT.s + 14} len={20} color="#ffffff" sw={2.4} />
            {/* chip logo */}
            <g stroke="#eaf1ff" strokeWidth={3} fill="none" strokeLinejoin="round" filter="url(#cglow)">
              <path d={`M ${ROOT.x - 30} ${ROOT.y + 22} L ${ROOT.x} ${ROOT.y - 28} L ${ROOT.x + 30} ${ROOT.y + 22} Z`} />
              <path d={`M ${ROOT.x - 14} ${ROOT.y + 22} L ${ROOT.x} ${ROOT.y - 2} L ${ROOT.x + 14} ${ROOT.y + 22}`} />
            </g>
            <text x={ROOT.x} y={ROOT.y + ROOT.s / 2 + 30} textAnchor="middle" fontFamily={FONT} fontSize={24} letterSpacing="1" fill="#ffffff">
              {rootLabel.toUpperCase()}
            </text>
            <text x={ROOT.x} y={ROOT.y + ROOT.s / 2 + 52} textAnchor="middle" fontFamily={FONT} fontSize={13} letterSpacing="2" fill="#6b7a90">
              PRIMARY ORIGIN · {data.domain}
            </text>
          </g>
        </g>
        {/* close user pan/zoom layer */}
        </g>
      </svg>

      {/* ---------------- chrome overlays (fixed, do not pan) ---------------- */}

      {/* breadcrumb */}
      <div className="absolute top-5 left-1/2 -translate-x-1/2 flex items-center gap-2 text-[0.72rem] tracking-[0.22em]">
        <button onClick={reset} className={focused ? 'text-[#8aa0bd] hover:text-white' : 'text-white'}>
          ROOT
        </button>
        {focused && (
          <>
            <span className="text-[#3b4a60]">/</span>
            <span style={{ color: focused.color }}>{focused.title}</span>
          </>
        )}
      </div>

      {/* right detail panel */}
      <DetailPanel
        selected={selected}
        onClose={() => setSelected(null)}
        onSearchCompany={onSearchCompany}
        reveal={reveal}
        revealMap={revealMap}
      />
    </div>
  );
}

function StatRow({ k, v, accent }: { k: string; v: string; accent: string }) {
  return (
    <div className="flex justify-between items-baseline py-1 text-[0.78rem]">
      <span style={{ color: accent }}>{k}</span>
      <span className="text-[#cfdcea]">{v}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cluster grid (rendered only for the focused bus)
// ---------------------------------------------------------------------------
function ClusterGrid({ bus, onPick, selectedId }: { bus: Bus; onPick: (n: SubNode) => void; selectedId: string | null }) {
  const g = useMemo(() => grid(bus), [bus]);
  return (
    <g className="circ-fade-in">
      <path d={g.busTrace} stroke={bus.color} strokeWidth={1.6} strokeDasharray="3 4" fill="none" opacity={0.8} />
      {g.rail && <path d={g.rail} stroke={bus.color} strokeWidth={1.8} fill="none" opacity={0.8} />}
      <rect x={g.terminal.x - 5} y={g.terminal.y - 5} width={10} height={10} fill={bus.color} />
      {g.stubs.map((d, i) => (
        <path key={`s${i}`} d={d} stroke={bus.color} strokeWidth={1.6} fill="none" opacity={0.75} />
      ))}
      {g.depthLines.map((d, i) => (
        <path key={`d${i}`} d={d} stroke={bus.color} strokeWidth={1.6} fill="none" opacity={0.75} />
      ))}
      {g.chevrons.map((c, i) => (
        <Chevron key={`c${i}`} x={c.x} y={c.y} dir={c.dir} color={bus.color} />
      ))}
      {g.nodes.map((gn) => (
        <GridChip key={gn.node.id} x={gn.x} y={gn.y} color={bus.color} node={gn.node} active={selectedId === gn.node.id} onClick={() => onPick(gn.node)} />
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Right-side detail panel — terminal-style readout
// ---------------------------------------------------------------------------
function PRow({ k, v }: { k: string; v: React.ReactNode }) {
  if (v == null || v === '') return null;
  return (
    <div className="flex justify-between gap-3 py-1 text-[0.78rem]">
      <span className="text-[#5b6b82] tracking-[0.12em]">{k}</span>
      <span className="text-[#cfdcea] text-right break-words">{v}</span>
    </div>
  );
}

function DetailPanel({
  selected,
  onClose,
  onSearchCompany,
  reveal,
  revealMap,
}: {
  selected: { node: SubNode; color: string } | null;
  onClose: () => void;
  onSearchCompany: (domain: string) => void;
  reveal: (id: string, payload: { ceId?: string | null; linkedin?: string | null }) => void;
  revealMap: Record<string, RevealState>;
}) {
  const open = !!selected;
  const node = selected?.node;
  const color = selected?.color ?? '#22d3ee';

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return (
    <div
      className={`fixed z-50 bg-[#050a12] overflow-y-auto ${isMobile ? 'bottom-0 left-0 right-0 rounded-t-lg border-t' : 'sm:absolute sm:top-0 sm:right-0 sm:h-full sm:w-[360px] border-l'}`}
      style={{
        borderColor: '#1c2940',
        height: isMobile ? '65vh' : undefined,
        transform: open ? 'translate(0)' : isMobile ? 'translateY(100%)' : 'translateX(100%)',
        transition: 'transform 0.45s cubic-bezier(.4,0,.2,1)',
      }}
    >
      {node && (
        <div className="p-5" style={{ fontFamily: FONT }}>
          <div className="flex items-start justify-between gap-2 pb-3 mb-3 border-b" style={{ borderColor: '#1c2940' }}>
            <div className="min-w-0">
              <div className="text-[0.62rem] tracking-[0.28em]" style={{ color }}>
                {kindLabel(node.kind)}
              </div>
              <div className="text-lg text-white break-words leading-tight mt-1">{node.label}</div>
              {node.sub && <div className="text-[0.74rem] text-[#8aa0bd] mt-0.5">{node.sub}</div>}
            </div>
            <button onClick={onClose} className="text-[#5b6b82] hover:text-white">✕</button>
          </div>

          {node.kind === 'employee' && node.employee && <EmployeeBody emp={node.employee} id={node.id} color={color} reveal={reveal} st={revealMap[node.id]} />}
          {node.kind === 'department' && node.department && (
            <div>
              <PRow k="HEADCOUNT" v={node.department.count.toLocaleString()} />
              {node.department.delta != null && node.department.delta !== 0 && (
                <PRow k="GROWTH" v={`${node.department.delta > 0 ? '+' : ''}${node.department.delta.toLocaleString()}`} />
              )}
            </div>
          )}
          {node.kind === 'competitor' && node.competitor && (
            <div>
              <PRow k="DOMAIN" v={node.competitor.domain} />
              <PRow k="INDUSTRY" v={node.competitor.industries} />
              <button
                onClick={() => onSearchCompany(node.competitor!.domain)}
                className="mt-4 w-full text-[0.74rem] tracking-[0.12em] border px-3 py-2 hover:bg-white/5"
                style={{ borderColor: color, color }}
              >
                RUN REPORT →
              </button>
            </div>
          )}
          {node.kind === 'tech' && <PRow k="TECHNOLOGY" v={node.tech} />}
          {node.kind === 'funding' && node.round && (
            <div>
              <PRow k="ROUND" v={node.round.type} />
              <PRow k="AMOUNT" v={node.round.amount} />
              <PRow k="VALUATION" v={node.round.valuation} />
              <PRow k="DATE" v={node.round.date} />
              <PRow k="INVESTORS" v={node.round.investors} />
            </div>
          )}

          <div className="border-t mt-4 pt-3 text-[0.7rem] text-[#5b6b82] flex items-center gap-2" style={{ borderColor: '#1c2940' }}>
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} /> SOURCE · ORTHOGONAL · LIVE
          </div>
        </div>
      )}
    </div>
  );
}

function kindLabel(k: SubNode['kind']): string {
  return { employee: 'EMPLOYEE', department: 'DEPARTMENT', competitor: 'COMPETITOR', tech: 'TECHNOLOGY', funding: 'FUNDING ROUND' }[k];
}

function RevealBlock({ id, color, ceId, linkedin, reveal, st, noContact, inlineEmail }: { id: string; color: string; ceId?: string | null; linkedin?: string | null; reveal: (id: string, p: { ceId?: string | null; linkedin?: string | null }) => void; st?: RevealState; noContact?: boolean; inlineEmail?: string | null }) {
  const got = st?.email || st?.phone;
  return (
    <div className="mt-4">
      {got ? (
        <div className="text-[0.76rem] space-y-1">
          {st?.email && <div style={{ color }} className="break-all">{st.email}</div>}
          {st?.phone && <div style={{ color }}>{st.phone}</div>}
        </div>
      ) : inlineEmail ? (
        // Tomba filler row: a pattern-derived address, free but unverified. Show
        // it labeled, and still offer Enrich to verify deliverability / add phone.
        <div className="text-[0.76rem] space-y-1">
          <div style={{ color }} className="break-all">{inlineEmail}</div>
          <div className="text-[0.6rem] tracking-[0.18em] text-[#5b6b82]">UNVERIFIED · LIKELY MATCH</div>
          {st?.tried ? (
            <div className="text-[0.68rem] text-[#5b6b82]">NO VERIFIED CONTACT FOUND.</div>
          ) : (
            <button
              onClick={() => reveal(id, { ceId, linkedin })}
              disabled={st?.loading}
              className="mt-2 w-full text-[0.72rem] tracking-[0.12em] border px-3 py-2 hover:bg-white/5 disabled:opacity-50"
              style={{ borderColor: color, color }}
            >
              {st?.loading ? 'VERIFYING…' : 'VERIFY / ADD PHONE →'}
            </button>
          )}
        </div>
      ) : st?.tried ? (
        <div className="text-[0.72rem] text-[#5b6b82]">NO CONTACT FOUND.</div>
      ) : noContact ? (
        <div className="text-[0.72rem] text-[#5b6b82] border px-3 py-2" style={{ borderColor: '#1c2940' }}>NO CONTACT ON FILE.</div>
      ) : (
        <button
          onClick={() => reveal(id, { ceId, linkedin })}
          disabled={st?.loading}
          className="w-full text-[0.74rem] tracking-[0.12em] border px-3 py-2 hover:bg-white/5 disabled:opacity-50"
          style={{ borderColor: color, color }}
        >
          {st?.loading ? 'ENRICHING…' : 'ENRICH CONTACT →'}
        </button>
      )}
    </div>
  );
}

function InitialsAvatar({ name, color }: { name: string; color: string }) {
  return (
    <div
      className="w-16 h-16 flex items-center justify-center text-lg font-mono font-bold mb-3 shrink-0"
      style={{ background: `${color}1a`, border: `1px solid ${color}50`, color, fontFamily: FONT }}
    >
      {getInitials(name)}
    </div>
  );
}

function EmployeeBody({ emp, id, color, reveal, st }: { emp: Employee; id: string; color: string; reveal: (id: string, p: { ceId?: string | null; linkedin?: string | null }) => void; st?: RevealState }) {
  return (
    <div>
      <InitialsAvatar name={emp.fullName} color={color} />
      <PRow k="TITLE" v={emp.title} />
      <PRow k="DEPARTMENT" v={emp.department} />
      <PRow k="SENIORITY" v={emp.seniority} />
      <PRow k="LOCATION" v={emp.location} />
      {emp.startedAt && <PRow k="SINCE" v={emp.startedAt.slice(0, 4)} />}
      {emp.linkedin && (
        <a href={emp.linkedin} target="_blank" rel="noreferrer" className="inline-block mt-3 text-[0.72rem]" style={{ color }}>
          LINKEDIN ↗
        </a>
      )}
      <RevealBlock id={id} color={color} ceId={emp.ceId} linkedin={emp.linkedin} reveal={reveal} st={st} inlineEmail={emp.emailUnverified ? emp.email : null} />
    </div>
  );
}
