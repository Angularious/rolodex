// Shared data types + palette for the graph (HUD) view and its inspector.

import type { Company, Competitor, DecisionMaker, DeptCount, Employee, FundingRound, Workforce } from '@/lib/types';

// Gotham-style categories (clusters). Colors matched to the reference.
export type Category = 'company' | 'people' | 'departments' | 'competitors' | 'funding' | 'tech';

export const CATEGORY_COLOR: Record<Category, string> = {
  company: '#eaf6ff',
  people: '#2dd4bf', // teal — decision-makers
  departments: '#3b82f6', // blue — departments
  competitors: '#a855f7', // purple — competitors
  funding: '#ec4899', // magenta — funding rounds
  tech: '#5eead4', // seafoam — tech stack
};

export const CATEGORY_LABEL: Record<Exclude<Category, 'company'>, string> = {
  people: 'Decision-makers',
  departments: 'Departments',
  competitors: 'Competitors',
  funding: 'Funding rounds',
  tech: 'Tech stack',
};

export type NodeKind =
  | 'company'
  | 'competitor'
  | 'person'
  | 'department'
  | 'tech'
  | 'funding'
  | 'fundingRound'
  | 'more';

export interface GNodeData {
  kind: NodeKind;
  category: Category;
  label: string;
  sub?: string;
  company?: Company;
  competitor?: Competitor;
  person?: DecisionMaker;
  department?: DeptCount;
  tech?: string; // a single tool (tech nodes are individual now)
  round?: FundingRound;
  more?: { category: Category; count: number };
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
  employees: Employee[];
  employeesTotal: number;
}
