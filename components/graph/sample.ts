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
  phone: '+1 415-555-0100',
  logo: null,
  socials: {
    linkedin: 'https://www.linkedin.com/company/hyperion',
    crunchbase: 'https://www.crunchbase.com/organization/hyperion',
    g2: 'https://www.g2.com/products/hyperion',
  },
  tech: [
    'React', 'Next.js', 'Node.js', 'TypeScript', 'PostgreSQL', 'Kubernetes', 'AWS',
    'Datadog', 'Snowflake', 'Salesforce', 'HubSpot', 'Segment', 'Stripe', 'Figma',
    'Slack', 'Notion', 'GitHub', 'Terraform', 'Kafka', 'Redis',
  ],
  keywords: [
    'workflow automation', 'data platform', 'analytics', 'b2b saas',
    'enterprise software', 'integrations', 'reporting', 'collaboration',
  ],
  fundingTotal: '$2.4B',
  fundingStage: 'series_e',
  fundingDate: '2023-09-01',
  fundingRounds: [
    { date: '2023-09-01', amount: '$1.2B', type: 'Series E', investors: 'Sequoia, a16z, Tiger Global', valuation: '$12B' },
    { date: '2021-06-01', amount: '$600M', type: 'Series D', investors: 'Founders Fund, Greenoaks', valuation: '$6B' },
    { date: '2019-03-01', amount: '$300M', type: 'Series C', investors: 'Accel', valuation: '$2.1B' },
    { date: '2017-05-01', amount: '$80M', type: 'Series B', investors: 'Index Ventures', valuation: '$600M' },
    { date: '2015-11-01', amount: '$18M', type: 'Series A', investors: 'Greylock', valuation: '$90M' },
  ],
  stockSymbol: null,
};

const departments: { name: string; count: number; delta: number }[] = [
  { name: 'Engineering', count: 8200, delta: 1400 }, { name: 'Sales', count: 3100, delta: 520 },
  { name: 'Operations', count: 2600, delta: 310 }, { name: 'Support', count: 1900, delta: -120 },
  { name: 'Marketing', count: 1400, delta: 180 }, { name: 'Product', count: 1100, delta: 240 },
  { name: 'Finance', count: 900, delta: 60 }, { name: 'HR', count: 700, delta: 40 },
  { name: 'IT', count: 640, delta: 30 }, { name: 'Data', count: 540, delta: 190 },
  { name: 'Design', count: 480, delta: 70 }, { name: 'Research', count: 410, delta: 110 },
  { name: 'Legal', count: 320, delta: 20 }, { name: 'Consulting', count: 260, delta: -15 },
];

const workforce: Workforce = {
  total: 22550,
  range: '5K-10K',
  departments,
  growthSince: '2023-01',
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
const SKILLS = [
  'Leadership', 'Strategy', 'Go-to-Market', 'SaaS', 'Product Management', 'Hiring',
  'Public Speaking', 'Analytics', 'Negotiation', 'Operations', 'Engineering', 'Design',
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
  photo: null, // fictional — initials fallback renders
  summary: `${TITLES[i]} at Hyperion. Fictional demo profile for previewing the UI — no real person.`,
  followers: 1200 + i * 317,
  industry: 'Software',
  skills: SKILLS.slice(i % 4, (i % 4) + 5),
  experience: [
    `${TITLES[i]} at Hyperion in 2021 - Present`,
    `Senior role at Acme Corp in 2017 - 2021`,
  ],
  education: [`B.S. Computer Science at Demo University in 2009 - 2013`],
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
  photo: null,
  startedAt: `${2015 + (i % 9)}-03-01`,
  email: null,
}));

export const SAMPLE = { domain: DOMAIN, company, workforce, competitors, decisionMakers, employees };
