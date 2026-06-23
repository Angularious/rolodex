// Shared data type for the graph (circuit) view and its inspector.

import type { Company, Competitor, Employee, Workforce } from '@/lib/types';

// Snapshot of the Report fields the graph needs (page passes these structurally).
export interface GraphData {
  domain: string;
  company: Company | null;
  competitors: Competitor[] | null;
  competitorsLoading: boolean;
  workforce: Workforce | null;
  workforceLoading: boolean;
  employees: Employee[];
  employeesTotal: number;
}
