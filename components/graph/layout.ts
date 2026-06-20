// Builds React Flow nodes/edges from the live (streaming) company Report.
// Pure function of the current data, so the graph fills in as sections resolve:
// each category shows a pulsing "pending" node while loading, then real nodes.

import type { Node, Edge } from 'reactflow';
import type { Company, Competitor, DecisionMaker, Workforce } from '@/lib/types';

export type NodeKind =
  | 'company'
  | 'competitor'
  | 'person'
  | 'department'
  | 'tech'
  | 'pending'
  | 'more';

export interface GNodeData {
  kind: NodeKind;
  label: string;
  sub?: string;
  company?: Company;
  competitor?: Competitor;
  person?: DecisionMaker;
  department?: { name: string; count: number };
  tech?: string[];
  more?: { category: 'people' | 'competitors' | 'departments'; count: number };
}

export type GNode = Node<GNodeData>;

// Snapshot of the Report fields the graph needs (structural — page passes these).
export interface GraphData {
  domain: string;
  company: Company | null;
  competitors: Competitor[] | null;
  competitorsLoading: boolean;
  decisionMakers: DecisionMaker[] | null;
  decisionMakersLoading: boolean;
  workforce: Workforce | null;
  workforceLoading: boolean;
}

// Per-category caps so the first ring stays readable; overflow → a "+N more" node.
const CAP = { people: 8, competitors: 10, departments: 12 };
const RADIUS = 360;

// Category base angles (deg, 0 = right, clockwise on screen): people right,
// departments bottom, competitors left, tech top.
const ANGLE = { people: 0, departments: 90, competitors: 180, tech: 270 };

const rad = (deg: number) => (deg * Math.PI) / 180;
const at = (deg: number, r: number): { x: number; y: number } => ({
  x: Math.round(Math.cos(rad(deg)) * r),
  y: Math.round(Math.sin(rad(deg)) * r),
});

// Fan `n` items around a base angle. One item sits on the base; more spread out
// symmetrically, widening the arc (and pushing radius out a touch) as n grows.
function arc(n: number, base: number, radius: number): { x: number; y: number }[] {
  if (n <= 1) return [at(base, radius)];
  const step = Math.min(20, 150 / (n - 1));
  const spread = step * (n - 1);
  return Array.from({ length: n }, (_, i) => {
    const deg = base - spread / 2 + i * step;
    const r = radius + (i % 2) * 26; // slight zig so labels don't collide
    return at(deg, r);
  });
}

export function buildGraph(d: GraphData): { nodes: GNode[]; edges: Edge[] } {
  const nodes: GNode[] = [];
  const edges: Edge[] = [];

  // --- center company node (shows immediately; skeleton until profile lands) ---
  nodes.push({
    id: 'company',
    type: 'company',
    position: { x: 0, y: 0 },
    data: {
      kind: 'company',
      label: d.company?.name ?? d.domain,
      sub: d.domain,
      company: d.company ?? undefined,
    },
    draggable: true,
  });

  // type/style come from defaultEdgeOptions in CompanyGraph (straight spokes).
  const link = (id: string) => edges.push({ id: `e-${id}`, source: 'company', target: id });

  const place = (
    items: GNodeData[],
    category: keyof typeof ANGLE,
    radius = RADIUS,
  ) => {
    const pos = arc(items.length, ANGLE[category], radius);
    items.forEach((data, i) => {
      const id = `${category}-${i}`;
      nodes.push({ id, type: data.kind, position: pos[i], data, draggable: true });
      link(id);
    });
  };

  // --- decision-makers (people, right) ---
  if (d.decisionMakers && d.decisionMakers.length) {
    const shown = d.decisionMakers.slice(0, CAP.people);
    const items: GNodeData[] = shown.map((p) => ({
      kind: 'person',
      label: p.name,
      sub: p.title ?? p.headline ?? undefined,
      person: p,
    }));
    const extra = d.decisionMakers.length - shown.length;
    if (extra > 0)
      items.push({ kind: 'more', label: `+${extra} more`, more: { category: 'people', count: extra } });
    place(items, 'people');
  } else if (d.decisionMakersLoading) {
    place([{ kind: 'pending', label: 'Finding decision-makers…' }], 'people');
  }

  // --- competitors (left) ---
  if (d.competitors && d.competitors.length) {
    const shown = d.competitors.slice(0, CAP.competitors);
    const items: GNodeData[] = shown.map((c) => ({
      kind: 'competitor',
      label: c.name || c.domain,
      sub: c.domain,
      competitor: c,
    }));
    const extra = d.competitors.length - shown.length;
    if (extra > 0)
      items.push({ kind: 'more', label: `+${extra} more`, more: { category: 'competitors', count: extra } });
    place(items, 'competitors');
  } else if (d.competitorsLoading) {
    place([{ kind: 'pending', label: 'Scanning competitors…' }], 'competitors');
  }

  // --- departments (bottom) ---
  const depts = d.workforce?.departments ?? [];
  if (depts.length) {
    const shown = depts.slice(0, CAP.departments);
    const items: GNodeData[] = shown.map((dep) => ({
      kind: 'department',
      label: dep.name,
      sub: `${dep.count.toLocaleString()} people`,
      department: dep,
    }));
    const extra = depts.length - shown.length;
    if (extra > 0)
      items.push({ kind: 'more', label: `+${extra} more`, more: { category: 'departments', count: extra } });
    place(items, 'departments');
  } else if (d.workforceLoading) {
    place([{ kind: 'pending', label: 'Mapping workforce…' }], 'departments');
  }

  // --- tech stack (top, single node) ---
  const tech = d.company?.tech ?? [];
  if (tech.length) {
    place(
      [{ kind: 'tech', label: 'Tech Stack', sub: `${tech.length} tools`, tech }],
      'tech',
      RADIUS - 60,
    );
  }

  return { nodes, edges };
}
