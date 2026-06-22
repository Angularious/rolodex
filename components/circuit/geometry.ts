// Pure layout math for the circuit-schematic view. No React, no DOM — given the
// loaded company data it produces fixed coordinates for an orthogonal SVG
// schematic (root → category "buses" → cluster grids) plus the camera
// transforms that drive the drill-down. This is a deterministic hand-laid-out
// layout, NOT a force simulation.

import type {
  Competitor,
  DecisionMaker,
  DeptCount,
  Employee,
  FundingRound,
} from '@/lib/types';
import type { GraphData } from '@/components/graph/types';

export type CircuitCat =
  | 'departments'
  | 'decisionMakers'
  | 'competitors'
  | 'employees'
  | 'tech'
  | 'funding';

export type SlotName = 'right' | 'left' | 'top' | 'bottom' | 'topRight' | 'bottomLeft';
export type OutDir = 'right' | 'left' | 'up' | 'down';

export type SubKind = 'department' | 'person' | 'competitor' | 'employee' | 'tech' | 'funding';

export interface SubNode {
  id: string;
  label: string;
  sub?: string | null;
  kind: SubKind;
  person?: DecisionMaker;
  employee?: Employee;
  department?: DeptCount;
  competitor?: Competitor;
  round?: FundingRound;
  tech?: string;
}

export interface Bus {
  cat: CircuitCat;
  title: string;
  count: number; // display count (may exceed rendered nodes, e.g. employees)
  color: string;
  slot: SlotName;
  nodes: SubNode[];
}

// ---------------------------------------------------------------------------
// Constants — a 1400×1400 square user-space; the SVG is scaled to fit.
// ---------------------------------------------------------------------------
export const VIEW = 1400;
export const CENTER = 700;
export const ROOT = { x: CENTER, y: CENTER, s: 156 };
const BUS_W = 264;
const BUS_H = 64;
const GRID_CAP = 30; // max sub-nodes rendered per cluster (count label stays real)

// Neon palette — saturated against pure black, mapped to existing data meaning.
export const CIRCUIT_COLOR: Record<CircuitCat, string> = {
  decisionMakers: '#3b82f6', // blue
  departments: '#22d3ee', // cyan
  competitors: '#ec4899', // magenta
  employees: '#34d399', // green
  tech: '#5eead4', // seafoam
  funding: '#f472b6', // pink
};

const CAT_TITLE: Record<CircuitCat, string> = {
  decisionMakers: 'DECISION-MAKERS',
  departments: 'DEPARTMENTS',
  competitors: 'COMPETITORS',
  employees: 'EMPLOYEE LIST',
  tech: 'TECH STACK',
  funding: 'FUNDING',
};

// Preferred slot per category — the core four land on the cardinals; tech/funding
// take the diagonals. departments→left, employees→right avoids squishing with
// the diagonal slots.
const CAT_SLOT: Record<CircuitCat, SlotName> = {
  decisionMakers: 'top',
  departments: 'left',
  competitors: 'bottom',
  employees: 'right',
  tech: 'topRight',
  funding: 'bottomLeft',
};

export const SLOT_POS: Record<SlotName, [number, number]> = {
  right: [1086, 700],
  left: [314, 700],
  top: [700, 300],
  bottom: [700, 1100],
  topRight: [1086, 348],
  bottomLeft: [314, 1052],
};

export const SLOT_OUT: Record<SlotName, OutDir> = {
  right: 'right',
  left: 'left',
  top: 'up',
  bottom: 'down',
  topRight: 'right',
  bottomLeft: 'left',
};

// ---------------------------------------------------------------------------
// Build the bus list from loaded data — only categories with data appear.
// ---------------------------------------------------------------------------
export function buildBuses(d: GraphData): Bus[] {
  const out: Bus[] = [];
  const push = (cat: CircuitCat, nodes: SubNode[], count = nodes.length) => {
    if (nodes.length) out.push({ cat, title: CAT_TITLE[cat], count, color: CIRCUIT_COLOR[cat], slot: CAT_SLOT[cat], nodes });
  };

  const dms = d.decisionMakers ?? [];
  push(
    'decisionMakers',
    dms.map((p, i) => ({ id: `dm-${i}`, label: p.name, sub: p.title ?? p.headline ?? null, kind: 'person', person: p })),
  );

  const depts = d.workforce?.departments ?? [];
  push(
    'departments',
    depts.map((dep, i) => ({ id: `dep-${i}`, label: dep.name, sub: `${dep.count.toLocaleString()}`, kind: 'department', department: dep })),
  );

  const comps = d.competitors ?? [];
  push(
    'competitors',
    comps.map((c, i) => ({ id: `cmp-${i}`, label: c.name || c.domain, sub: c.domain, kind: 'competitor', competitor: c })),
  );

  const emps = d.employees ?? [];
  push(
    'employees',
    emps.map((e, i) => ({ id: `emp-${i}`, label: e.fullName, sub: e.title ?? null, kind: 'employee', employee: e })),
    d.employeesTotal || emps.length,
  );

  const tech = d.company?.tech ?? [];
  push(
    'tech',
    tech.map((t, i) => ({ id: `tech-${i}`, label: t, kind: 'tech', tech: t })),
  );

  const funding = d.company?.fundingRounds ?? [];
  push(
    'funding',
    funding.map((r, i) => ({ id: `fund-${i}`, label: r.type ?? 'Round', sub: r.amount ?? null, kind: 'funding', round: r })),
  );

  return out;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------
export interface Rect { x: number; y: number; w: number; h: number; cx: number; cy: number; }

export function busRect(slot: SlotName): Rect {
  const [cx, cy] = SLOT_POS[slot];
  return { x: cx - BUS_W / 2, y: cy - BUS_H / 2, w: BUS_W, h: BUS_H, cx, cy };
}

interface Pt { x: number; y: number; }
const unit = (o: OutDir): Pt =>
  o === 'right' ? { x: 1, y: 0 } : o === 'left' ? { x: -1, y: 0 } : o === 'up' ? { x: 0, y: -1 } : { x: 0, y: 1 };
const perpOf = (o: OutDir): Pt => (o === 'right' || o === 'left' ? { x: 0, y: 1 } : { x: 1, y: 0 });

// Root box edge point facing a given outward direction.
function rootEdge(o: OutDir): Pt {
  const h = ROOT.s / 2;
  if (o === 'right') return { x: ROOT.x + h, y: ROOT.y };
  if (o === 'left') return { x: ROOT.x - h, y: ROOT.y };
  if (o === 'up') return { x: ROOT.x, y: ROOT.y - h };
  return { x: ROOT.x, y: ROOT.y + h };
}

// Bus box edge point facing the root (the inner side).
function busInner(slot: SlotName): Pt {
  const r = busRect(slot);
  switch (slot) {
    case 'right': return { x: r.x, y: r.cy };
    case 'left': return { x: r.x + r.w, y: r.cy };
    case 'top': return { x: r.cx, y: r.y + r.h };
    case 'bottom': return { x: r.cx, y: r.y };
    case 'topRight': return { x: r.x, y: r.cy }; // entered on the left, grid extends right
    case 'bottomLeft': return { x: r.x + r.w, y: r.cy }; // entered on the right, grid extends left
  }
}

export interface Trunk {
  path: string;
  from: Pt;
  to: Pt;
  double: boolean; // render as a parallel double-line with arrowheads (h cardinals)
  dots: Pt[]; // filled junction dots at bends
  vias: Pt[]; // hollow connector circles along the run
  ticks: { x1: number; y1: number; x2: number; y2: number }[]; // perpendicular texture
  arrow: { x: number; y: number; dir: OutDir }; // arrowhead into the bus
}

// Orthogonal trunk from the root to a bus box. Horizontal cardinals get the
// reference's double-arrow look; verticals get a stair-jog with round vias;
// diagonals get a clean L.
export function trunk(slot: SlotName): Trunk {
  const out = SLOT_OUT[slot];
  const s = rootEdge(out);
  const e = busInner(slot);
  const dots: Pt[] = [];
  const vias: Pt[] = [];
  const ticks: Trunk['ticks'] = [];

  if (slot === 'right' || slot === 'left') {
    const dir = slot === 'right' ? 1 : -1;
    // perpendicular texture ticks along the straight run
    const span = Math.abs(e.x - s.x);
    for (let t = 0.28; t < 0.9; t += 0.18) {
      const x = s.x + (e.x - s.x) * t;
      ticks.push({ x1: x, y1: s.y - 7, x2: x, y2: s.y + 7 });
    }
    return {
      path: `M ${s.x} ${s.y} L ${e.x} ${e.y}`,
      from: s,
      to: e,
      double: true,
      dots: [],
      vias: [{ x: s.x + dir * span * 0.5, y: s.y }],
      ticks,
      arrow: { x: e.x, y: e.y, dir: slot === 'right' ? 'left' : 'right' },
    };
  }

  if (slot === 'top' || slot === 'bottom') {
    const dir = slot === 'top' ? -1 : 1;
    const jogY1 = s.y + dir * 120;
    const jogY2 = s.y + dir * 230;
    const jogX = s.x - 34;
    dots.push({ x: s.x, y: jogY1 }, { x: jogX, y: jogY1 }, { x: jogX, y: jogY2 }, { x: s.x, y: jogY2 });
    vias.push({ x: s.x, y: (jogY2 + e.y) / 2 });
    return {
      path: `M ${s.x} ${s.y} L ${s.x} ${jogY1} L ${jogX} ${jogY1} L ${jogX} ${jogY2} L ${s.x} ${jogY2} L ${e.x} ${e.y}`,
      from: s,
      to: e,
      double: false,
      dots,
      vias,
      ticks,
      arrow: { x: e.x, y: e.y, dir: slot === 'top' ? 'down' : 'up' },
    };
  }

  // diagonals: out of the root's top/bottom edge (offset to clear the cardinal
  // trunk), vertical to the bus row, then horizontal into the bus side — a clean
  // L that stays in its quadrant and never crosses a cardinal bus box.
  const topR = slot === 'topRight';
  const start: Pt = { x: ROOT.x + (topR ? 46 : -46), y: topR ? ROOT.y - ROOT.s / 2 : ROOT.y + ROOT.s / 2 };
  dots.push({ x: start.x, y: e.y });
  vias.push({ x: start.x, y: (start.y + e.y) / 2 });
  return {
    path: `M ${start.x} ${start.y} L ${start.x} ${e.y} L ${e.x} ${e.y}`,
    from: start,
    to: e,
    double: false,
    dots,
    vias,
    ticks,
    arrow: { x: e.x, y: e.y, dir: topR ? 'right' : 'left' },
  };
}

export interface GridNode { x: number; y: number; node: SubNode; }
export interface Chevron { x: number; y: number; dir: OutDir; }
export interface Grid {
  nodes: GridNode[];
  rail: string; // perpendicular rail path
  busTrace: string; // dashed bus → rail connector
  terminal: Pt; // filled connector square on the bus outer edge
  stubs: string[]; // rail → first-depth node
  depthLines: string[]; // solid along-out connectors between depths
  chevrons: Chevron[]; // directional ticks on the rail
  truncated: number; // how many nodes were dropped past the cap
}

// Cluster grid for a focused bus: DEPTH chips deep along the outward axis,
// wrapping across SPAN ranks on the perpendicular axis.
export function grid(bus: Bus): Grid {
  const slot = bus.slot;
  const out = SLOT_OUT[slot];
  const u = unit(out);
  const p = perpOf(out);
  const r = busRect(slot);

  // bus outer edge (away from root)
  const edge: Pt =
    out === 'right' ? { x: r.x + r.w, y: r.cy }
    : out === 'left' ? { x: r.x, y: r.cy }
    : out === 'up' ? { x: r.cx, y: r.y }
    : { x: r.cx, y: r.y + r.h };

  const all = bus.nodes;
  const truncated = Math.max(0, all.length - GRID_CAP);
  const items = all.slice(0, GRID_CAP);
  const DEPTH = Math.min(3, items.length);
  const SPAN = Math.ceil(items.length / DEPTH);

  const STEP = 96;
  const GAP = 150; // bus edge → first depth node center
  const RAIL = 96; // bus edge → rail

  const at = (d: number, s: number): Pt => ({
    x: edge.x + u.x * (GAP + d * STEP) + p.x * (s - (SPAN - 1) / 2) * STEP,
    y: edge.y + u.y * (GAP + d * STEP) + p.y * (s - (SPAN - 1) / 2) * STEP,
  });

  const nodes: GridNode[] = [];
  const depthLines: string[] = [];
  const stubs: string[] = [];
  for (let s = 0; s < SPAN; s++) {
    for (let d = 0; d < DEPTH; d++) {
      const i = s * DEPTH + d;
      if (i >= items.length) break;
      const pos = at(d, s);
      nodes.push({ x: pos.x, y: pos.y, node: items[i] });
      if (d > 0) {
        const prev = at(d - 1, s);
        depthLines.push(`M ${prev.x} ${prev.y} L ${pos.x} ${pos.y}`);
      } else {
        // rail → first node
        const railPt = { x: edge.x + u.x * RAIL + p.x * (s - (SPAN - 1) / 2) * STEP, y: edge.y + u.y * RAIL + p.y * (s - (SPAN - 1) / 2) * STEP };
        stubs.push(`M ${railPt.x} ${railPt.y} L ${pos.x} ${pos.y}`);
      }
    }
  }

  // rail spanning all ranks at the RAIL offset
  const railA = { x: edge.x + u.x * RAIL + p.x * (0 - (SPAN - 1) / 2) * STEP, y: edge.y + u.y * RAIL + p.y * (0 - (SPAN - 1) / 2) * STEP };
  const railB = { x: edge.x + u.x * RAIL + p.x * (SPAN - 1 - (SPAN - 1) / 2) * STEP, y: edge.y + u.y * RAIL + p.y * (SPAN - 1 - (SPAN - 1) / 2) * STEP };
  const rail = SPAN > 1 ? `M ${railA.x} ${railA.y} L ${railB.x} ${railB.y}` : '';

  // chevrons between ranks on the rail (data-flow ticks)
  const chevrons: Chevron[] = [];
  const chevDir: OutDir = out === 'right' || out === 'left' ? 'down' : 'right';
  for (let s = 0; s < SPAN - 1; s++) {
    const a = { x: edge.x + u.x * RAIL + p.x * (s - (SPAN - 1) / 2) * STEP, y: edge.y + u.y * RAIL + p.y * (s - (SPAN - 1) / 2) * STEP };
    chevrons.push({ x: a.x + p.x * STEP * 0.5, y: a.y + p.y * STEP * 0.5, dir: chevDir });
  }

  const terminal = edge;
  const busTrace = `M ${edge.x} ${edge.y} L ${edge.x + u.x * RAIL} ${edge.y + u.y * RAIL}`;

  return { nodes, rail, busTrace, terminal, stubs, depthLines, chevrons, truncated };
}

// ---------------------------------------------------------------------------
// Camera — identity at root, pan+zoom toward a focused branch's cluster.
// ---------------------------------------------------------------------------
export function cameraFor(slot: SlotName | null): { tx: number; ty: number; scale: number } {
  if (!slot) return { tx: 0, ty: 0, scale: 1 };
  const [bx, by] = SLOT_POS[slot];
  const u = unit(SLOT_OUT[slot]);
  const off = 250; // push focus from the bus toward its grid
  const fx = bx + u.x * off;
  const fy = by + u.y * off;
  const scale = 1.32;
  return { tx: CENTER - scale * fx, ty: CENTER - scale * fy, scale };
}
