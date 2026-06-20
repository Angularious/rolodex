'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, Html } from '@react-three/drei';
import * as THREE from 'three';

import type { GraphData, GNodeData } from './types';
import GraphPanel, { type RevealState } from './GraphPanel';
import type { DecisionMaker } from '@/lib/types';
import type { RevealFn } from '@/components/EmployeesTab';

// ---------------------------------------------------------------------------
// Planet descriptors built from the (settled) report data.
// ---------------------------------------------------------------------------
interface Planet {
  id: string;
  size: number;
  color: string;
  data: GNodeData;
}
interface RingDef {
  key: string;
  label: string;
  color: string;
  radius: number;
  speed: number;
  planets: Planet[];
}

const COLOR = {
  company: '#cfe0ff',
  people: '#5b8cff',
  departments: '#2dd4bf',
  competitors: '#c084fc',
  tech: '#94a3b8',
  funding: '#fbbf24',
  more: '#64748b',
};

const SENIORITY: Record<string, number> = {
  founder: 0.78, owner: 0.78, 'c-suite': 0.74, cxo: 0.74, partner: 0.62, vp: 0.6,
  director: 0.52, head: 0.5, principal: 0.46, senior: 0.42, manager: 0.42, mid: 0.36,
  entry: 0.32, junior: 0.32,
};
const personSize = (p: DecisionMaker) => SENIORITY[(p.seniority ?? '').toLowerCase()] ?? 0.4;

const CAP = { people: 18, competitors: 18, departments: 14 };

function buildRings(d: GraphData): { rings: RingDef[]; tech: Planet | null; funding: Planet | null } {
  // people (decision-makers)
  const peoplePlanets: Planet[] = [];
  if (d.decisionMakers?.length) {
    d.decisionMakers.slice(0, CAP.people).forEach((p, i) =>
      peoplePlanets.push({
        id: `person-${i}`,
        size: personSize(p),
        color: COLOR.people,
        data: { kind: 'person', label: p.name, sub: p.title ?? p.headline ?? undefined, person: p },
      }),
    );
    const extra = d.decisionMakers.length - peoplePlanets.length;
    if (extra > 0)
      peoplePlanets.push({
        id: 'person-more',
        size: 0.34,
        color: COLOR.more,
        data: { kind: 'more', label: `+${extra} more`, more: { category: 'people', count: extra } },
      });
  }

  // competitors
  const compPlanets: Planet[] = [];
  if (d.competitors?.length) {
    d.competitors.slice(0, CAP.competitors).forEach((c, i) =>
      compPlanets.push({
        id: `competitor-${i}`,
        size: 0.5,
        color: COLOR.competitors,
        data: { kind: 'competitor', label: c.name || c.domain, sub: c.domain, competitor: c },
      }),
    );
    const extra = d.competitors.length - compPlanets.length;
    if (extra > 0)
      compPlanets.push({
        id: 'competitor-more',
        size: 0.34,
        color: COLOR.more,
        data: { kind: 'more', label: `+${extra} more`, more: { category: 'competitors', count: extra } },
      });
  }

  // departments (size by headcount, log-scaled)
  const depts = d.workforce?.departments ?? [];
  const maxCount = Math.max(1, ...depts.map((x) => x.count));
  const deptPlanets: Planet[] = depts.slice(0, CAP.departments).map((dep, i) => ({
    id: `department-${i}`,
    size: 0.34 + 0.55 * (Math.log(dep.count + 1) / Math.log(maxCount + 1)),
    color: COLOR.departments,
    data: {
      kind: 'department',
      label: dep.name,
      sub: `${dep.count.toLocaleString()} people`,
      department: dep,
    },
  }));

  const rings: RingDef[] = [
    { key: 'departments', label: 'DEPARTMENTS', color: COLOR.departments, radius: 9, speed: 0.05, planets: deptPlanets },
    { key: 'people', label: 'DECISION-MAKERS', color: COLOR.people, radius: 14.5, speed: -0.035, planets: peoplePlanets },
    { key: 'competitors', label: 'COMPETITORS', color: COLOR.competitors, radius: 20, speed: 0.028, planets: compPlanets },
  ].filter((r) => r.planets.length);

  const tech = d.company?.tech?.length
    ? {
        id: 'tech',
        size: 0.7,
        color: COLOR.tech,
        data: { kind: 'tech', label: 'Tech Stack', sub: `${d.company.tech.length} tools`, tech: d.company.tech } as GNodeData,
      }
    : null;

  const hasFunding = !!(d.company?.fundingTotal || d.company?.fundingRounds?.length);
  const funding = hasFunding
    ? {
        id: 'funding',
        size: 1,
        color: COLOR.funding,
        data: {
          kind: 'funding',
          label: 'Funding',
          sub: d.company?.fundingTotal ?? undefined,
          company: d.company ?? undefined,
        } as GNodeData,
      }
    : null;

  return { rings, tech, funding };
}

// ---------------------------------------------------------------------------
// 3D primitives
// ---------------------------------------------------------------------------
function PlanetMesh({
  planet,
  position,
  selected,
  onSelect,
}: {
  planet: Planet;
  position: [number, number, number];
  selected: boolean;
  onSelect: (d: GNodeData) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const active = hovered || selected;
  return (
    <group position={position}>
      <mesh
        scale={active ? 1.35 : 1}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(planet.data);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = 'auto';
        }}
      >
        <sphereGeometry args={[planet.size, 28, 28]} />
        <meshStandardMaterial
          color={planet.color}
          emissive={planet.color}
          emissiveIntensity={active ? 0.9 : 0.3}
          roughness={0.45}
          metalness={0.1}
        />
      </mesh>
      {active && (
        <Html center distanceFactor={26} className="pointer-events-none" zIndexRange={[30, 0]}>
          <div className="gspace-label">
            <div className="gspace-label-name">{planet.data.label}</div>
            {planet.data.sub && <div className="gspace-label-sub">{planet.data.sub}</div>}
          </div>
        </Html>
      )}
    </group>
  );
}

function Ring({
  ring,
  selectedId,
  onSelect,
}: {
  ring: RingDef;
  selectedId: string | null;
  onSelect: (id: string, d: GNodeData) => void;
}) {
  const spin = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (spin.current) spin.current.rotation.y += ring.speed * dt;
  });
  const n = ring.planets.length;
  return (
    <group>
      {/* faint orbit ring in the XZ plane */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[ring.radius - 0.03, ring.radius + 0.03, 160]} />
        <meshBasicMaterial color={ring.color} transparent opacity={0.14} side={THREE.DoubleSide} />
      </mesh>
      {/* static hub label at the ring edge */}
      <Html position={[ring.radius + 0.6, 0.4, 0]} className="pointer-events-none" distanceFactor={34}>
        <div className="gspace-hub" style={{ color: ring.color }}>
          {ring.label} · {n}
        </div>
      </Html>
      {/* rotating planets */}
      <group ref={spin}>
        {ring.planets.map((p, i) => {
          const a = (i / n) * Math.PI * 2;
          const pos: [number, number, number] = [
            Math.cos(a) * ring.radius,
            0,
            Math.sin(a) * ring.radius,
          ];
          return (
            <PlanetMesh
              key={p.id}
              planet={p}
              position={pos}
              selected={selectedId === p.id}
              onSelect={(d) => onSelect(p.id, d)}
            />
          );
        })}
      </group>
    </group>
  );
}

function Sun({ label, onClick }: { label: string; onClick: () => void }) {
  const core = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (core.current) core.current.rotation.y += 0.12 * dt;
  });
  return (
    <group>
      <pointLight position={[0, 0, 0]} intensity={2.4} distance={120} color="#bcd4ff" />
      <mesh
        ref={core}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = 'auto')}
      >
        <sphereGeometry args={[2.4, 48, 48]} />
        <meshStandardMaterial color={COLOR.company} emissive={COLOR.company} emissiveIntensity={1.1} roughness={0.3} />
      </mesh>
      {/* halo shell */}
      <mesh>
        <sphereGeometry args={[3.3, 32, 32]} />
        <meshBasicMaterial color="#6d8fff" transparent opacity={0.12} side={THREE.BackSide} />
      </mesh>
      <Html center position={[0, 3.4, 0]} className="pointer-events-none" distanceFactor={30}>
        <div className="gspace-sun">{label}</div>
      </Html>
    </group>
  );
}

function TechPlanet({
  tech,
  selectedId,
  onSelect,
}: {
  tech: Planet;
  selectedId: string | null;
  onSelect: (id: string, d: GNodeData) => void;
}) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (g.current) g.current.rotation.y += 0.06 * dt;
  });
  return (
    <group ref={g}>
      <PlanetMesh planet={tech} position={[5.5, 0, 0]} selected={selectedId === 'tech'} onSelect={(d) => onSelect('tech', d)} />
    </group>
  );
}

function FundingBox({
  funding,
  selectedId,
  onSelect,
}: {
  funding: Planet;
  selectedId: string | null;
  onSelect: (id: string, d: GNodeData) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const active = hovered || selectedId === 'funding';
  return (
    <group position={[0, 7.5, 0]}>
      <mesh
        scale={active ? 1.2 : 1}
        onClick={(e) => {
          e.stopPropagation();
          onSelect('funding', funding.data);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = 'auto';
        }}
      >
        <boxGeometry args={[2.4, 1.4, 0.4]} />
        <meshStandardMaterial color={COLOR.funding} emissive={COLOR.funding} emissiveIntensity={active ? 0.7 : 0.32} roughness={0.5} />
      </mesh>
      <Html center distanceFactor={30} className="pointer-events-none">
        <div className="gspace-hub" style={{ color: COLOR.funding }}>
          FUNDING{funding.data.sub ? ` · ${funding.data.sub}` : ''}
        </div>
      </Html>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Scene + wrapper
// ---------------------------------------------------------------------------
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
  const { rings, tech, funding } = useMemo(() => buildRings(data), [data]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<GNodeData | null>(null);
  const [revealMap, setRevealMap] = useState<Record<string, RevealState>>({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controls = useRef<any>(null);

  const select = useCallback((id: string, d: GNodeData) => {
    setSelectedId(id);
    setSelected(d);
  }, []);

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

  const resetView = () => controls.current?.reset?.();

  return (
    <div className="graph-blue relative h-[78vh] min-h-[520px] w-full border border-line overflow-hidden bg-[#04050a]">
      <Canvas camera={{ position: [0, 13, 30], fov: 52 }} dpr={[1, 2]}>
        <color attach="background" args={['#04050a']} />
        <ambientLight intensity={0.45} />
        <Stars radius={140} depth={70} count={4500} factor={4} saturation={0} fade speed={0.4} />

        <Sun label={data.company?.name ?? data.domain} onClick={resetView} />
        {rings.map((r) => (
          <Ring key={r.key} ring={r} selectedId={selectedId} onSelect={select} />
        ))}
        {tech && <TechPlanet tech={tech} selectedId={selectedId} onSelect={select} />}
        {funding && <FundingBox funding={funding} selectedId={selectedId} onSelect={select} />}

        <OrbitControls
          ref={controls}
          makeDefault
          enablePan
          minDistance={8}
          maxDistance={70}
          target={[0, 0, 0]}
          autoRotate
          autoRotateSpeed={0.25}
        />
      </Canvas>

      {/* overlay controls */}
      <div className="absolute bottom-4 left-4 z-10 flex flex-col gap-1.5">
        <button
          onClick={resetView}
          className="px-2.5 h-8 grid place-items-center border border-line bg-ink-2/90 text-cream-dim hover:text-cream hover:border-accent/50 font-mono text-[0.7rem]"
        >
          ⤢ Reset
        </button>
      </div>
      <div className="absolute bottom-4 right-4 z-10 font-mono text-[0.6rem] text-muted/70 pointer-events-none">
        drag to orbit · scroll to zoom · click a body
      </div>

      <GraphPanel
        data={selected}
        onClose={() => {
          setSelected(null);
          setSelectedId(null);
        }}
        reveal={reveal}
        revealState={(p) => revealMap[keyOf(p)]}
        onSearchCompany={onSearchCompany}
        onSwitchToTable={onSwitchToTable}
      />
    </div>
  );
}
