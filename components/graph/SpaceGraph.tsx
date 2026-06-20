'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';

import { CATEGORY_COLOR, type Category, type GraphData, type GNodeData } from './types';

export interface SpaceGraphHandle {
  resetView: () => void;
}

interface GNode {
  id: string;
  category: Category;
  size: number;
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

// 3D centroid directions per category → each starburst sits at its own angle + depth.
const CENTROID: Record<Exclude<Category, 'company'>, [number, number, number]> = {
  people: [1, 0.4, 0.25],
  departments: [-0.95, 0.15, 0.3],
  competitors: [0.15, -0.55, -1],
  funding: [-0.35, 1, -0.45],
  tech: [0.65, -0.25, 0.95],
};
const CENTROID_DIST = 95;

const SENIORITY: Record<string, number> = {
  founder: 1, owner: 1, 'c-suite': 0.95, cxo: 0.95, partner: 0.8, vp: 0.78,
  director: 0.62, head: 0.58, principal: 0.5, senior: 0.46, manager: 0.46,
  mid: 0.38, entry: 0.32, junior: 0.32,
};
const CAP = { people: 18, competitors: 16, departments: 14, funding: 8, tech: 12 };
const r = (m: number) => 2.2 + m * 4;

function buildGraph(d: GraphData): { nodes: GNode[]; links: GLink[] } {
  const nodes: GNode[] = [];
  const links: GLink[] = [];

  nodes.push({
    id: 'company',
    category: 'company',
    size: 8,
    color: CATEGORY_COLOR.company,
    data: { kind: 'company', category: 'company', label: d.company?.name ?? d.domain, sub: d.domain, company: d.company ?? undefined },
    fx: 0,
    fy: 0,
    fz: 0,
  });

  // One starburst per category: company → hub (short), hub → satellites (medium).
  const cluster = (category: Exclude<Category, 'company'>, items: GNode[]) => {
    if (!items.length) return;
    items.forEach((n) => nodes.push(n));
    const hub = items[0].id;
    links.push({ source: 'company', target: hub, color: items[0].color, dist: 52 });
    for (let i = 1; i < items.length; i++)
      links.push({ source: hub, target: items[i].id, color: items[i].color, dist: 16 });
  };

  // people (by seniority desc → hub = most senior)
  const people = (d.decisionMakers ?? [])
    .slice(0, CAP.people)
    .map((p, i): GNode => {
      const m = SENIORITY[(p.seniority ?? '').toLowerCase()] ?? 0.4;
      return {
        id: `person-${i}`, category: 'people', size: r(m), color: CATEGORY_COLOR.people,
        data: { kind: 'person', category: 'people', label: p.name, sub: p.title ?? p.headline ?? undefined, person: p },
      };
    })
    .sort((a, b) => b.size - a.size);
  cluster('people', people);

  // departments (by headcount desc → hub = largest)
  const depts = d.workforce?.departments ?? [];
  const maxCount = Math.max(1, ...depts.map((x) => x.count));
  const department = [...depts]
    .sort((a, b) => b.count - a.count)
    .slice(0, CAP.departments)
    .map((dep, i): GNode => ({
      id: `dept-${i}`, category: 'departments', size: r(Math.log(dep.count + 1) / Math.log(maxCount + 1)),
      color: CATEGORY_COLOR.departments,
      data: { kind: 'department', category: 'departments', label: dep.name, sub: `${dep.count.toLocaleString()} people`, department: dep },
    }));
  cluster('departments', department);

  // competitors
  const competitor = (d.competitors ?? []).slice(0, CAP.competitors).map((c, i): GNode => ({
    id: `comp-${i}`, category: 'competitors', size: 3.1, color: CATEGORY_COLOR.competitors,
    data: { kind: 'competitor', category: 'competitors', label: c.name || c.domain, sub: c.domain, competitor: c },
  }));
  cluster('competitors', competitor);

  // funding rounds (magenta) — real time-ordered events
  const funding = (d.company?.fundingRounds ?? []).slice(0, CAP.funding).map((rd, i): GNode => ({
    id: `fund-${i}`, category: 'funding', size: 3.4, color: CATEGORY_COLOR.funding,
    data: { kind: 'fundingRound', category: 'funding', label: rd.type ?? 'Round', sub: rd.amount ?? undefined, round: rd },
  }));
  cluster('funding', funding);

  // tech stack (seafoam) — individual tools
  const tech = (d.company?.tech ?? []).slice(0, CAP.tech).map((t, i): GNode => ({
    id: `tech-${i}`, category: 'tech', size: 2.4, color: CATEGORY_COLOR.tech,
    data: { kind: 'tech', category: 'tech', label: t, tech: t },
  }));
  cluster('tech', tech);

  return { nodes, links };
}

// --- custom d3-force-3d clustering force (tight starbursts at varied depth) ---
function clusterForce() {
  let nodes: GNode[] = [];
  const STRENGTH = 0.14;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const force = (alpha: number) => {
    for (const n of nodes as any[]) {
      const c = CENTROID[(n as GNode).category as Exclude<Category, 'company'>];
      if (!c) continue;
      n.vx += (c[0] * CENTROID_DIST - n.x) * STRENGTH * alpha;
      n.vy += (c[1] * CENTROID_DIST - n.y) * STRENGTH * alpha;
      n.vz += (c[2] * CENTROID_DIST - n.z) * STRENGTH * alpha;
    }
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  force.initialize = (n: any[]) => (nodes = n);
  return force;
}

// soft glowing glass sphere + additive halo (bloom does the rest)
function nodeObject(node: GNode): THREE.Object3D {
  const g = new THREE.Group();
  g.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(node.size, 22, 22),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(node.color).multiplyScalar(0.45),
        emissive: new THREE.Color(node.color),
        emissiveIntensity: node.category === 'company' ? 1.4 : 0.9,
        roughness: 0.35,
        metalness: 0.0,
      }),
    ),
  );
  g.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(node.size * 1.7, 16, 16),
      new THREE.MeshBasicMaterial({
        color: node.color,
        transparent: true,
        opacity: node.category === 'company' ? 0.22 : 0.12,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    ),
  );
  return g;
}

const linkColorFn = (l: GLink) => l.color;
const nodeLabelFn = (n: GNode) => {
  const key = n.data.sub ? `<div style="color:#8aa">${escapeHtml(n.data.sub)}</div>` : '';
  return `<div style="font-family:var(--font-mono),monospace;font-size:11px;letter-spacing:.04em;background:rgba(6,10,16,.92);border:1px solid rgba(120,180,255,.3);padding:5px 9px;white-space:nowrap"><div style="color:#eaf1ff">${escapeHtml(n.data.label)}</div>${key}</div>`;
};
function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

function SpaceGraphInner(
  {
    data,
    onSelect,
    hidden,
  }: {
    data: GraphData;
    onSelect: (d: GNodeData | null) => void;
    hidden: Set<Category>;
  },
  ref: React.Ref<SpaceGraphHandle>,
) {
  const wrapRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fg = useRef<any>(null);
  const fitted = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [size, setSize] = useState(() => ({ w: 0, h: 0 }));

  const graph = useMemo(
    () => buildGraph(data),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.domain, data.company, data.competitors, data.decisionMakers, data.workforce],
  );

  useImperativeHandle(ref, () => ({
    resetView: () => {
      fitted.current = false;
      fg.current?.zoomToFit(700, 80);
    },
  }));

  // size to container
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const apply = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setSize((s) => (Math.abs(s.w - w) < 1 && Math.abs(s.h - h) < 1 ? s : { w, h }));
    };
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    apply();
    return () => ro.disconnect();
  }, []);

  // forces, bloom, radar floor, idle auto-rotate
  useEffect(() => {
    const inst = fg.current;
    if (!inst) return;
    fitted.current = false;

    inst.d3Force('charge')?.strength(-90);
    inst.d3Force('link')?.distance((l: GLink) => l.dist).strength(0.8);
    inst.d3Force('cluster', clusterForce());

    (async () => {
      try {
        const { UnrealBloomPass } = await import('three/examples/jsm/postprocessing/UnrealBloomPass.js');
        const bloom = new UnrealBloomPass(new THREE.Vector2(size.w || 1200, size.h || 800), 1.6, 0.75, 0.05);
        inst.postProcessingComposer().addPass(bloom);
      } catch {
        /* graph still renders without bloom */
      }
    })();

    // faint concentric "radar" rings on the ground plane (decorative depth cue)
    const radar = new THREE.Group();
    for (const rad of [70, 120, 175, 235]) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(rad - 0.4, rad + 0.4, 96),
        new THREE.MeshBasicMaterial({ color: 0x2dd4bf, transparent: true, opacity: 0.08, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -45;
      radar.add(ring);
    }
    inst.scene().add(radar);

    const controls = inst.controls();
    if (controls) {
      controls.minDistance = 60;
      controls.maxDistance = 600;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.4;
      const pause = () => {
        controls.autoRotate = false;
        if (idleTimer.current) clearTimeout(idleTimer.current);
        idleTimer.current = setTimeout(() => (controls.autoRotate = true), 4000);
      };
      controls.addEventListener('start', pause);
    }

    return () => {
      inst.scene()?.remove(radar);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  const handleEngineStop = useCallback(() => {
    if (fitted.current) return;
    fitted.current = true;
    fg.current?.zoomToFit(700, 80);
  }, []);

  const onNodeClick = useCallback((node: GNode) => onSelect(node.data), [onSelect]);

  // legend visibility (no sim restart — just toggles object visibility)
  const nodeVisible = useMemo(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => (n: any) => !hidden.has(n.category),
    [hidden],
  );
  const linkVisible = useMemo(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => (l: any) => !hidden.has(l.source?.category) && !hidden.has(l.target?.category),
    [hidden],
  );

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden">
      {size.w > 0 && (
        <ForceGraph3D
          ref={fg}
          width={size.w}
          height={size.h}
          graphData={graph}
          backgroundColor="#050608"
          showNavInfo={false}
          controlType="orbit"
          nodeThreeObject={nodeObject as never}
          nodeLabel={nodeLabelFn as never}
          nodeVisibility={nodeVisible as never}
          linkVisibility={linkVisible as never}
          linkColor={linkColorFn as never}
          linkOpacity={0.34}
          linkWidth={0.5}
          enableNodeDrag={false}
          warmupTicks={40}
          cooldownTicks={140}
          onEngineStop={handleEngineStop}
          onNodeClick={onNodeClick as never}
          onBackgroundClick={() => onSelect(null)}
        />
      )}
    </div>
  );
}

const SpaceGraph = forwardRef(SpaceGraphInner);
export default SpaceGraph;
