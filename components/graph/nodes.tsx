'use client';

import { Handle, Position, type NodeProps } from 'reactflow';
import type { GNodeData } from './layout';

// One centered, invisible handle per node so straight "spoke" edges attach at
// the node center (endpoints hide behind the box → clean radial star).
const handleStyle: React.CSSProperties = {
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 1,
  height: 1,
  minWidth: 0,
  minHeight: 0,
  background: 'transparent',
  border: 0,
  opacity: 0,
  pointerEvents: 'none',
};

// Shared shell: flat, sharp corners, 1px border, mono. Color/extra via props.
function Shell({
  selected,
  children,
  className = '',
  source = false,
}: {
  selected?: boolean;
  children: React.ReactNode;
  className?: string;
  source?: boolean;
  accent?: boolean;
}) {
  return (
    <div
      className={`gnode rounded-none border bg-ink-2/90 backdrop-blur-sm px-3 py-2 transition-shadow ${
        selected ? 'gnode-selected' : ''
      } ${className}`}
    >
      <Handle type={source ? 'source' : 'target'} position={Position.Top} style={handleStyle} />
      {children}
    </div>
  );
}

function CompanyNode({ data, selected }: NodeProps<GNodeData>) {
  const c = data.company;
  return (
    <div
      className={`gnode gnode-company rounded-none border bg-ink-2/95 backdrop-blur px-4 py-3 ${
        selected ? 'gnode-selected' : ''
      }`}
    >
      <Handle type="source" position={Position.Top} style={handleStyle} />
      <div className="flex items-center gap-3">
        {c?.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.logo} alt="" className="h-8 w-8 rounded-none border border-line object-contain bg-ink" />
        ) : (
          <div className="h-8 w-8 rounded-none border border-accent/60 grid place-items-center font-mono text-accent-soft text-sm">
            {(data.label[0] ?? '?').toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <div className="font-display text-base leading-tight text-cream truncate max-w-[200px]">
            {data.label}
          </div>
          <div className="font-mono text-[0.68rem] text-accent-soft truncate">{data.sub}</div>
        </div>
      </div>
    </div>
  );
}

function PersonNode({ data, selected }: NodeProps<GNodeData>) {
  const p = data.person;
  const has = p && (p.hasWorkEmail || p.hasPersonalEmail || p.hasPhone || p.email);
  return (
    <Shell selected={selected} className="border-line min-w-[150px] max-w-[210px]">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[0.62rem] uppercase tracking-wider text-muted">Person</span>
        <span
          className={`h-1.5 w-1.5 rounded-none ${has ? 'bg-accent-soft' : 'bg-muted/50'}`}
          title={has ? 'contact available' : 'no contact on file'}
        />
      </div>
      <div className="font-display text-sm text-cream truncate">{data.label}</div>
      {data.sub && <div className="font-mono text-[0.66rem] text-cream-dim truncate">{data.sub}</div>}
    </Shell>
  );
}

function CompetitorNode({ data, selected }: NodeProps<GNodeData>) {
  return (
    <Shell selected={selected} className="border-line min-w-[140px] max-w-[200px]">
      <div className="font-mono text-[0.62rem] uppercase tracking-wider text-muted mb-0.5">Competitor</div>
      <div className="font-display text-sm text-cream truncate">{data.label}</div>
      {data.sub && <div className="font-mono text-[0.66rem] text-accent-soft truncate">{data.sub}</div>}
    </Shell>
  );
}

function DepartmentNode({ data, selected }: NodeProps<GNodeData>) {
  return (
    <Shell selected={selected} className="border-line min-w-[130px]">
      <div className="font-mono text-[0.62rem] uppercase tracking-wider text-muted mb-0.5">Dept</div>
      <div className="font-display text-sm text-cream truncate">{data.label}</div>
      <div className="font-mono text-[0.66rem] text-cream-dim">{data.sub}</div>
    </Shell>
  );
}

function TechNode({ data, selected }: NodeProps<GNodeData>) {
  return (
    <Shell selected={selected} className="border-line min-w-[130px]">
      <div className="font-mono text-[0.62rem] uppercase tracking-wider text-muted mb-0.5">Stack</div>
      <div className="font-display text-sm text-cream">{data.label}</div>
      <div className="font-mono text-[0.66rem] text-cream-dim">{data.sub}</div>
    </Shell>
  );
}

function PendingNode({ data }: NodeProps<GNodeData>) {
  return (
    <div className="gnode gnode-pending rounded-none border border-dashed border-line bg-ink-2/60 px-3 py-2">
      <Handle type="target" position={Position.Top} style={handleStyle} />
      <div className="flex items-center gap-2">
        <span className="gnode-spinner h-2 w-2 rounded-none bg-accent-soft" />
        <span className="font-mono text-[0.7rem] text-cream-dim">{data.label}</span>
      </div>
    </div>
  );
}

function MoreNode({ data, selected }: NodeProps<GNodeData>) {
  return (
    <Shell selected={selected} className="border-dashed border-line min-w-[80px]">
      <div className="font-mono text-[0.72rem] text-accent-soft text-center">{data.label}</div>
    </Shell>
  );
}

export const nodeTypes = {
  company: CompanyNode,
  person: PersonNode,
  competitor: CompetitorNode,
  department: DepartmentNode,
  tech: TechNode,
  pending: PendingNode,
  more: MoreNode,
};
