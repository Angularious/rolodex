'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

import type { GraphData, GNodeData } from './types';
import GraphPanel, { type RevealState } from './GraphPanel';
import type { DecisionMaker } from '@/lib/types';
import type { RevealFn } from '@/components/EmployeesTab';

type Category = 'company' | 'people' | 'departments' | 'competitors' | 'tech' | 'funding' | 'more';

interface GNode {
  id: string;
  category: Category;
  label: string;
  sub?: string;
  size: number; // world-radius of the icosahedron
  color: string;
  data: GNodeData;
  fx?: number;
  fy?: number;
  fz?: number;
}
interface GLink {
  source: string;
  target: string;
  color: string;
  dist: number;
}

const COLOR: Record<Category, string> = {
  company: '#eaf1ff',
  people: '#5b8cff',
  departments: '#34d399',
  competitors: '#c084fc',
  tech: '#94a3b8',
  funding: '#fbbf24',
  more: '#64748b',
};

// Loose category "centroid" directions (unit-ish vectors) the clustering force
// biases toward — gives 3D grouping without ring/angle math.
const CENTROID: Partial<Record<Category, [number, number, number]>> = {
  people: [1, 0.25, 0.1],
  departments: [-0.7, -0.4, 0.55],
  competitors: [0.15, -0.25, -1],
  tech: [-0.85, 0.6, -0.15],
  funding: [0.1, 1, 0.25],
};
const CENTROID_DIST = 70;

const SENIORITY: Record<string, number> = {
  founder: 1, owner: 1, 'c-suite': 0.95, cxo: 0.95, partner: 0.8, vp: 0.78,
  director: 0.62, head: 0.58, principal: 0.5, senior: 0.46, manager: 0.46,
  mid: 0.38, entry: 0.32, junior: 0.32,
};
const CAP = { people: 18, competitors: 16, departments: 14 };

// node world-radius from a 0..1 metric
const radius = (metric: number) => 2.4 + metric * 4.2;

function buildGraph(d: GraphData): { nodes: GNode[]; links: GLink[] } {
  const nodes: GNode[] = [];
  const links: GLink[] = [];
  const add = (n: GNode, dist: number) => {
    nodes.push(n);
    links.push({ source: 'company', target: n.id, color: n.color, dist });
  };

  nodes.push({
    id: 'company',
    category: 'company',
    label: d.company?.name ?? d.domain,
    sub: d.domain,
    size: 8,
    color: COLOR.company,
    data: { kind: 'company', label: d.company?.name ?? d.domain, sub: d.domain, company: d.company ?? undefined },
    fx: 0,
    fy: 0,
    fz: 0, // pin the anchor at the origin
  });

  // decision-makers (size by seniority; tighter links)
  (d.decisionMakers ?? []).slice(0, CAP.people).forEach((p, i) => {
    const m = SENIORITY[(p.seniority ?? '').toLowerCase()] ?? 0.4;
    add(
      {
        id: `person-${i}`,
        category: 'people',
        label: p.name,
        sub: p.title ?? p.headline ?? undefined,
        size: radius(m),
        color: COLOR.people,
        data: { kind: 'person', label: p.name, sub: p.title ?? p.headline ?? undefined, person: p },
      },
      28 + (1 - m) * 22,
    );
  });
  if ((d.decisionMakers?.length ?? 0) > CAP.people)
    add(moreNode('people', d.decisionMakers!.length - CAP.people), 30);

  // departments (size by headcount, log-scaled)
  const depts = d.workforce?.departments ?? [];
  const maxCount = Math.max(1, ...depts.map((x) => x.count));
  depts.slice(0, CAP.departments).forEach((dep, i) => {
    const m = Math.log(dep.count + 1) / Math.log(maxCount + 1);
    add(
      {
        id: `department-${i}`,
        category: 'departments',
        label: dep.name,
        sub: `${dep.count.toLocaleString()} people`,
        size: radius(m),
        color: COLOR.departments,
        data: { kind: 'department', label: dep.name, sub: `${dep.count.toLocaleString()} people`, department: dep },
      },
      34 + (1 - m) * 24,
    );
  });
  if (depts.length > CAP.departments) add(moreNode('departments', depts.length - CAP.departments), 38);

  // competitors (uniform mid-size; longer links so they sit further out)
  (d.competitors ?? []).slice(0, CAP.competitors).forEach((c, i) => {
    add(
      {
        id: `competitor-${i}`,
        category: 'competitors',
        label: c.name || c.domain,
        sub: c.domain,
        size: radius(0.45),
        color: COLOR.competitors,
        data: { kind: 'competitor', label: c.name || c.domain, sub: c.domain, competitor: c },
      },
      82,
    );
  });
  if ((d.competitors?.length ?? 0) > CAP.competitors)
    add(moreNode('competitors', d.competitors!.length - CAP.competitors), 82);

  // tech (single)
  if (d.company?.tech?.length)
    add(
      {
        id: 'tech',
        category: 'tech',
        label: 'Tech Stack',
        sub: `${d.company.tech.length} tools`,
        size: radius(0.7),
        color: COLOR.tech,
        data: { kind: 'tech', label: 'Tech Stack', sub: `${d.company.tech.length} tools`, tech: d.company.tech },
      },
      40,
    );

  // funding (gold)
  if (d.company?.fundingTotal || d.company?.fundingRounds?.length)
    add(
      {
        id: 'funding',
        category: 'funding',
        label: 'Funding',
        sub: d.company.fundingTotal ?? undefined,
        size: radius(0.85),
        color: COLOR.funding,
        data: { kind: 'funding', label: 'Funding', sub: d.company.fundingTotal ?? undefined, company: d.company },
      },
      30,
    );

  return { nodes, links };
}

function moreNode(category: 'people' | 'competitors' | 'departments', count: number): GNode {
  return {
    id: `${category}-more`,
    category: 'more',
    label: `+${count} more`,
    size: radius(0.3),
    color: COLOR.more,
    data: { kind: 'more', label: `+${count} more`, more: { category, count } },
  };
}

// --- custom d3-force-3d clustering force: bias same-category nodes toward a centroid ---
function clusterForce() {
  let nodes: GNode[] = [];
  const STRENGTH = 0.09;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const force = (alpha: number) => {
    for (const n of nodes as any[]) {
      const c = CENTROID[(n as GNode).category as Category];
      if (!c) continue;
      n.vx += (c[0] * CENTROID_DIST - n.x) * STRENGTH * alpha;
      n.vy += (c[1] * CENTROID_DIST - n.y) * STRENGTH * alpha;
      n.vz += (c[2] * CENTROID_DIST - n.z) * STRENGTH * alpha;
    }
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  force.initialize = (n: any[]) => {
    nodes = n;
  };
  return force;
}

function nodeObject(node: GNode): THREE.Object3D {
  const group = new THREE.Group();
  const detail = node.category === 'company' ? 2 : node.size > 4 ? 1 : 0;
  const geo = new THREE.IcosahedronGeometry(node.size, detail);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(node.color).multiplyScalar(0.35),
      emissive: new THREE.Color(node.color),
      emissiveIntensity: node.category === 'company' ? 1.1 : 0.75,
      roughness: 0.3,
      metalness: 0.1,
    }),
  );
  const wire = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color: node.color, wireframe: true, transparent: true, opacity: 0.22 }),
  );
  wire.scale.setScalar(1.03);
  group.add(mesh, wire);
  return group;
}

function keyOf(p: DecisionMaker) {
  return p.linkedin || p.name;
}

export default function SpaceGraph({
  data,
  onReveal,
  onSearchCompany,
  onSwitchToTable,
}: {
  data: GraphData;
  onReveal: RevealFn;
  onSearchCompany: (domain: string) => void;
  onSwitchToTable: () => void;
}) {
  const graph = useMemo(() => buildGraph(data), [data]);
  const wrapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fg = useRef<any>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [selected, setSelected] = useState<GNodeData | null>(null);
  const [revealMap, setRevealMap] = useState<Record<string, RevealState>>({});

  // size to container
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // forces, bloom, starfield, idle auto-rotate — once the instance exists
  useEffect(() => {
    const inst = fg.current;
    if (!inst) return;

    // forces
    inst.d3Force('charge')?.strength(-140);
    inst.d3Force('link')?.distance((l: GLink) => l.dist).strength(0.7);
    inst.d3Force('cluster', clusterForce());

    // bloom — the "glowing data construct" look
    try {
      const bloom = new UnrealBloomPass(new THREE.Vector2(size.w || 1200, size.h || 800), 1.3, 0.65, 0.08);
      inst.postProcessingComposer().addPass(bloom);
    } catch {
      /* composer not ready — skip bloom */
    }

    // far starfield (not part of the simulation; fixed-size points)
    const N = 2200;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 700 + Math.random() * 800;
      const t = Math.random() * Math.PI * 2;
      const p = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(p) * Math.cos(t);
      pos[i * 3 + 1] = r * Math.sin(p) * Math.sin(t);
      pos[i * 3 + 2] = r * Math.cos(p);
    }
    const sGeo = new THREE.BufferGeometry();
    sGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(
      sGeo,
      new THREE.PointsMaterial({ color: 0x8fb8ff, size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0.7 }),
    );
    inst.scene().add(stars);

    // idle auto-rotate via OrbitControls; pause while the user interacts
    const controls = inst.controls();
    if (controls) {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.45;
      const pause = () => {
        controls.autoRotate = false;
        if (idleTimer.current) clearTimeout(idleTimer.current);
        idleTimer.current = setTimeout(() => (controls.autoRotate = true), 4000);
      };
      controls.addEventListener('start', pause);
    }

    return () => {
      inst.scene()?.remove(stars);
      sGeo.dispose();
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  const reveal = useCallback(
    async (p: DecisionMaker) => {
      const k = keyOf(p);
      setRevealMap((m) => (m[k]?.loading || m[k]?.tried ? m : { ...m, [k]: { loading: true, tried: false, email: null, phone: null } }));
      try {
        const r = await onReveal({ linkedin: p.linkedin });
        setRevealMap((m) => ({ ...m, [k]: { loading: false, tried: true, email: r.email, phone: r.phone ?? null } }));
      } catch {
        setRevealMap((m) => ({ ...m, [k]: { loading: false, tried: true, email: null, phone: null } }));
      }
    },
    [onReveal],
  );

  const onNodeClick = useCallback((node: GNode) => {
    setSelected(node.data);
    // fly the camera to frame the clicked node
    const inst = fg.current;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const n = node as any;
    if (inst && typeof n.x === 'number') {
      const d = 40;
      const r = Math.hypot(n.x, n.y, n.z) || 1;
      inst.cameraPosition(
        { x: n.x * (1 + d / r), y: n.y * (1 + d / r), z: n.z * (1 + d / r) },
        { x: n.x, y: n.y, z: n.z },
        900,
      );
    }
  }, []);

  return (
    <div ref={wrapRef} className="graph-blue relative h-full w-full bg-[#020308]">
      {size.w > 0 && (
        <ForceGraph3D
          ref={fg}
          width={size.w}
          height={size.h}
          graphData={graph}
          backgroundColor="#020308"
          showNavInfo={false}
          controlType="orbit"
          nodeThreeObject={nodeObject as never}
          nodeLabel={((n: GNode) => `<span style="font-family:monospace;font-size:11px">${n.label}</span>`) as never}
          linkColor={((l: GLink) => l.color) as never}
          linkOpacity={0.3}
          linkWidth={0.4}
          linkDirectionalParticles={2}
          linkDirectionalParticleWidth={1.1}
          linkDirectionalParticleSpeed={0.006}
          linkDirectionalParticleColor={((l: GLink) => l.color) as never}
          enableNodeDrag={false}
          warmupTicks={40}
          cooldownTicks={120}
          onEngineStop={() => fg.current?.zoomToFit(700, 90)}
          onNodeClick={onNodeClick as never}
        />
      )}

      <div className="absolute bottom-4 right-4 z-10 font-mono text-[0.6rem] text-muted/70 pointer-events-none">
        drag to orbit · scroll to zoom · click a node
      </div>

      <GraphPanel
        data={selected}
        onClose={() => setSelected(null)}
        reveal={reveal}
        revealState={(p) => revealMap[keyOf(p)]}
        onSearchCompany={onSearchCompany}
        onSwitchToTable={onSwitchToTable}
      />
    </div>
  );
}
