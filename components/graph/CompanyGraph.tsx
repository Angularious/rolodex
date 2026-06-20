'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  useReactFlow,
  useNodesState,
  useEdgesState,
  type Edge,
} from 'reactflow';
import 'reactflow/dist/style.css';

import { buildGraph, type GraphData, type GNodeData } from './layout';
import { nodeTypes } from './nodes';
import GraphPanel, { type RevealState } from './GraphPanel';
import type { DecisionMaker } from '@/lib/types';
import type { RevealFn } from '@/components/EmployeesTab';

const EDGE_BASE: Partial<Edge> = {
  type: 'straight',
  style: { stroke: 'rgba(122,168,255,0.22)', strokeWidth: 1 },
};

function keyOf(p: DecisionMaker) {
  return p.linkedin || p.name;
}

function Flow({
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
  const rf = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selected, setSelected] = useState<GNodeData | null>(null);
  const [revealMap, setRevealMap] = useState<Record<string, RevealState>>({});

  // Rebuild only when the underlying data actually changes (sections stream in).
  const built = useMemo(
    () => buildGraph(data),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      data.domain,
      data.company,
      data.competitors,
      data.competitorsLoading,
      data.decisionMakers,
      data.decisionMakersLoading,
      data.workforce,
      data.workforceLoading,
    ],
  );

  // Merge into RF state, preserving any positions the user has dragged.
  const idSig = useRef('');
  useEffect(() => {
    setNodes((cur) => {
      const byId = new Map(cur.map((n) => [n.id, n]));
      return built.nodes.map((n) => {
        const ex = byId.get(n.id);
        return ex ? { ...n, position: ex.position } : n;
      });
    });
    setEdges(built.edges.map((e) => ({ ...e, ...EDGE_BASE })));

    // Re-fit only when the node SET changes (a section streamed in) — not while
    // the user is panning/dragging/zooming an unchanged graph.
    const sig = built.nodes.map((n) => n.id).join('|');
    if (sig !== idSig.current) {
      idSig.current = sig;
      setTimeout(() => rf.fitView({ duration: 400, padding: 0.25 }), 60);
    }
  }, [built, setNodes, setEdges, rf]);

  const reveal = useCallback(
    async (p: DecisionMaker) => {
      const k = keyOf(p);
      setRevealMap((m) => {
        if (m[k]?.loading || m[k]?.tried) return m;
        return { ...m, [k]: { loading: true, tried: false, email: null, phone: null } };
      });
      try {
        const r = await onReveal({ linkedin: p.linkedin });
        setRevealMap((m) => ({ ...m, [k]: { loading: false, tried: true, email: r.email, phone: r.phone ?? null } }));
      } catch {
        setRevealMap((m) => ({ ...m, [k]: { loading: false, tried: true, email: null, phone: null } }));
      }
    },
    [onReveal],
  );

  // Highlight (animate) the edges of the hovered node.
  const setHover = useCallback(
    (id: string | null) =>
      setEdges((es) => es.map((e) => ({ ...e, animated: !!id && (e.source === id || e.target === id) }))),
    [setEdges],
  );

  const onNodeClick = useCallback(
    (_: unknown, node: { id: string; data: GNodeData }) => {
      setSelected(node.data);
      if (node.id === 'company') rf.fitView({ duration: 500, padding: 0.2 });
    },
    [rf],
  );

  return (
    <div className="graph-blue absolute inset-0">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onNodeMouseEnter={(_, n) => setHover(n.id)}
        onNodeMouseLeave={() => setHover(null)}
        onPaneClick={() => setSelected(null)}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        nodesConnectable={false}
        elementsSelectable
        className="graph-canvas"
      >
        <ControlPanel />
      </ReactFlow>

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

function ControlPanel() {
  const rf = useReactFlow();
  const btn =
    'h-8 w-8 grid place-items-center border border-line bg-ink-2/90 text-cream-dim hover:text-cream hover:border-accent/50 font-mono text-sm';
  return (
    <div className="absolute bottom-4 left-4 z-10 flex flex-col gap-1.5">
      <button className={btn} title="Zoom in" onClick={() => rf.zoomIn({ duration: 200 })}>
        +
      </button>
      <button className={btn} title="Zoom out" onClick={() => rf.zoomOut({ duration: 200 })}>
        −
      </button>
      <button
        className={btn}
        title="Fit view"
        onClick={() => rf.fitView({ duration: 400, padding: 0.25 })}
      >
        ⤢
      </button>
    </div>
  );
}

export default function CompanyGraph(props: {
  data: GraphData;
  onReveal: RevealFn;
  onSearchCompany: (domain: string) => void;
  onSwitchToTable: () => void;
}) {
  return (
    <div className="relative h-[72vh] min-h-[480px] w-full border border-line bg-ink/30 overflow-hidden">
      <ReactFlowProvider>
        <Flow {...props} />
      </ReactFlowProvider>
    </div>
  );
}
