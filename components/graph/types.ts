// Shared data types for the graph/space view + its inspector panel.

import type { Company, Competitor, DecisionMaker, Workforce } from '@/lib/types';

export type NodeKind =
  | 'company'
  | 'competitor'
  | 'person'
  | 'department'
  | 'tech'
  | 'funding'
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

// Snapshot of the Report fields the graph needs (page passes these structurally).
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
