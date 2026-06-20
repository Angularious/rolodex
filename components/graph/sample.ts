// Static fixture for previewing the graph/table UI without spending credits.
// Loaded via `/?demo=1` (see app/page.tsx). Not real data — obviously fictional.

import type { Company, Competitor, DecisionMaker, Employee, Workforce } from '@/lib/types';

const DOMAIN = 'hyperion.demo';

const company: Company = {
  name: 'Hyperion (demo)',
  domain: DOMAIN,
  description: 'Fictional company used to preview the UI. No credits spent.',
  website: 'https://hyperion.demo',
  founded: '2014',
  size: '5K-10K',
  revenue: '500m-1b',
  type: 'private',
  industries: ['Software', 'Business Services'],
  categories: ['b2b', 'saas'],
  hqLocation: 'San Francisco, CA, US',
  logo: null,
  socials: { linkedin: 'https://www.linkedin.com/company/hyperion' },
  tech: [
    'React', 'Next.js', 'Node.js', 'TypeScript', 'PostgreSQL', 'Kubernetes', 'AWS',
    'Datadog', 'Snowflake', 'Salesforce', 'HubSpot', 'Segment', 'Stripe', 'Figma',
    'Slack', 'Notion', 'GitHub', 'Terraform', 'Kafka', 'Redis',
  ],
  fundingTotal: '$2.4B',
  fundingStage: 'series_e',
  fundingRounds: [
    { date: '2023-09-01', amount: '$1.2B', type: 'Series E', investors: 'Sequoia, a16z, Tiger Global' },
    { date: '2021-06-01', amount: '$600M', type: 'Series D', investors: 'Founders Fund, Greenoaks' },
    { date: '2019-03-01', amount: '$300M', type: 'Series C', investors: 'Accel' },
    { date: '2017-05-01', amount: '$80M', type: 'Series B', investors: 'Index Ventures' },
    { date: '2015-11-01', amount: '$18M', type: 'Series A', investors: 'Greylock' },
  ],
  stockSymbol: null,
};

const departments: { name: string; count: number }[] = [
  { name: 'Engineering', count: 8200 }, { name: 'Sales', count: 3100 },
  { name: 'Operations', count: 2600 }, { name: 'Support', count: 1900 },
  { name: 'Marketing', count: 1400 }, { name: 'Product', count: 1100 },
  { name: 'Finance', count: 900 }, { name: 'HR', count: 700 },
  { name: 'IT', count: 640 }, { name: 'Data', count: 540 },
  { name: 'Design', count: 480 }, { name: 'Research', count: 410 },
  { name: 'Legal', count: 320 }, { name: 'Consulting', count: 260 },
];

const workforce: Workforce = {
  total: 22550,
  range: '5K-10K',
  departments,
  history: [
    { date: '2023-01', total: 19800 },
    { date: '2024-01', total: 21200 },
    { date: '2025-01', total: 22550 },
  ],
};

const SENIORITIES = [
  'founder', 'c-suite', 'c-suite', 'vp', 'vp', 'director', 'director', 'director',
  'head', 'senior', 'senior', 'manager', 'manager', 'principal', 'senior', 'manager',
  'entry', 'director',
];
const TITLES = [
  'Co-Founder & CEO', 'Chief Technology Officer', 'Chief Revenue Officer',
  'VP Engineering', 'VP Marketing', 'Director of Product', 'Director of Sales',
  'Director of Operations', 'Head of Design', 'Senior Eng Manager',
  'Senior Account Executive', 'Engineering Manager', 'Marketing Manager',
  'Principal Engineer', 'Senior Recruiter', 'Finance Manager',
  'Sales Development Rep', 'Director of Data',
];
const NAMES = [
  'Ava Chen', 'Marcus Reyes', 'Priya Nair', 'Tom Becker', 'Sofia Russo', 'Liam OBrien',
  'Wei Zhang', 'Hana Kim', 'Diego Alvarez', 'Grace Okafor', 'Noah Schmidt', 'Yuki Tanaka',
  'Elena Petrova', 'Sam Whitfield', 'Aisha Malik', 'Ben Carter', 'Maya Lindqvist', 'Omar Haddad',
];
const decisionMakers: DecisionMaker[] = NAMES.map((name, i) => ({
  name,
  title: TITLES[i],
  headline: TITLES[i],
  location: 'United States',
  country: 'US',
  seniority: SENIORITIES[i],
  jobFunction: i % 3 === 0 ? 'Engineering' : i % 3 === 1 ? 'Sales' : 'Operations',
  linkedin: `https://www.linkedin.com/in/demo-${i}`,
  hasWorkEmail: i % 4 !== 0,
  hasPersonalEmail: i % 3 === 0,
  hasPhone: i % 5 === 0,
  email: null,
  phone: null,
}));

const COMPETITOR_NAMES = [
  'Nimbus', 'Vertex Systems', 'Quanta', 'Helios', 'Borealis', 'Meridian', 'Cobalt',
  'Atlas Cloud', 'Pulsar', 'Northstar', 'Lumen', 'Forge', 'Tessera', 'Onyx', 'Cirrus', 'Vanta Labs',
];
const competitors: Competitor[] = COMPETITOR_NAMES.map((name, i) => ({
  name,
  domain: `${name.toLowerCase().replace(/\s+/g, '')}.demo`,
  industries: i % 2 === 0 ? 'Software' : 'Business Services',
}));

const employees: Employee[] = decisionMakers.slice(0, 12).map((d, i) => ({
  ceId: `demo-${i}`,
  firstName: d.name.split(' ')[0],
  lastName: d.name.split(' ')[1] ?? '',
  fullName: d.name,
  title: d.title,
  department: departments[i % departments.length].name,
  seniority: d.seniority,
  linkedin: d.linkedin,
  country: 'US',
  location: 'United States',
  email: null,
}));

export const SAMPLE = { domain: DOMAIN, company, workforce, competitors, decisionMakers, employees };
