/**
 * Hardcoded dummy data for the backend-free /demo-app/people surface.
 *
 * Mirrors the prop shapes the real contacts surface feeds its components:
 *   - DemoClient matches the `Client` type inside components/contacts/contact-table.tsx
 *   - the deal/stage rows match DealMetricRow / StageMetricRow from lib/deal-metrics.ts
 *
 * No backend: these arrays stand in for the /api/contacts fetch and the
 * read-only Deal/DealStage query the real page runs. Realtor is Jordan Rivera
 * of Rivera Residential.
 */

import type { DealMetricRow, StageMetricRow } from '@/lib/deal-metrics';

export type DemoClient = {
  id: string;
  name: string;
  type: 'QUALIFICATION' | 'TOUR' | 'APPLICATION';
  phone: string | null;
  email: string | null;
  budget: number | null;
  preferences: string | null;
  properties: string[];
  createdAt: string;
  address: string | null;
  notes: string | null;
  tags: string[];
  followUpAt: string | null;
  leadType: 'rental' | 'buyer';
  leadScore: number | null;
};

// Anchored to the project "today" (2026-06-04) so relative dates stay stable.
const NOW = new Date('2026-06-04T12:00:00Z');
function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString();
}
function daysAhead(n: number): string {
  return new Date(NOW.getTime() + n * 86_400_000).toISOString();
}

export const DEMO_CONTACTS: DemoClient[] = [
  {
    id: 'c-sarah-chen',
    name: 'Sarah Chen',
    type: 'APPLICATION',
    phone: '(415) 555-0142',
    email: 'sarah.chen@gmail.com',
    budget: 1250000,
    preferences: '3 bed near Noe Valley, walkable',
    properties: ['Noe Valley Victorian'],
    createdAt: daysAgo(2),
    address: '1820 Sanchez St, San Francisco, CA',
    notes: 'Pre-approved. Ready to write an offer this week.',
    tags: ['new-lead', 'first-time-buyer'],
    followUpAt: daysAhead(1),
    leadType: 'buyer',
    leadScore: 86,
  },
  {
    id: 'c-priya-patel',
    name: 'Priya Patel',
    type: 'TOUR',
    phone: '408-555-0199',
    email: 'priya.patel@outlook.com',
    budget: 4200,
    preferences: '2 bed loft, in-unit laundry, parking',
    properties: ['SoMa Loft 4B', 'Mission Live-Work'],
    createdAt: daysAgo(4),
    address: '500 Folsom St, San Francisco, CA',
    notes: 'Relocating for work, wants to tour two units Saturday.',
    tags: ['new-lead', 'relocating'],
    followUpAt: daysAhead(3),
    leadType: 'rental',
    leadScore: 79,
  },
  {
    id: 'c-tom-nguyen',
    name: 'Tom Nguyen',
    type: 'QUALIFICATION',
    phone: '(650) 555-0177',
    email: 'tom.nguyen@gmail.com',
    budget: 980000,
    preferences: 'Townhome, low HOA, good schools',
    properties: [],
    createdAt: daysAgo(1),
    address: 'Daly City, CA',
    notes: 'Strong intent. Needs help understanding the loan options.',
    tags: ['new-lead'],
    followUpAt: daysAgo(1),
    leadType: 'buyer',
    leadScore: 72,
  },
  {
    id: 'c-marcus-webb',
    name: 'Marcus Webb',
    type: 'TOUR',
    phone: '415.555.0123',
    email: 'marcus.webb@proton.me',
    budget: 3600,
    preferences: '1 bed, dog-friendly, near transit',
    properties: ['Hayes Valley Studio'],
    createdAt: daysAgo(9),
    address: 'Hayes Valley, San Francisco, CA',
    notes: 'Comparing a few neighborhoods before committing.',
    tags: ['dog-owner'],
    followUpAt: daysAhead(6),
    leadType: 'rental',
    leadScore: 61,
  },
  {
    id: 'c-emily-carter',
    name: 'Emily Carter',
    type: 'QUALIFICATION',
    phone: '(925) 555-0188',
    email: 'emily.carter@yahoo.com',
    budget: 1450000,
    preferences: '4 bed single-family, yard',
    properties: [],
    createdAt: daysAgo(12),
    address: 'Walnut Creek, CA',
    notes: 'Selling current home first, timeline is flexible.',
    tags: ['move-up-buyer'],
    followUpAt: daysAhead(10),
    leadType: 'buyer',
    leadScore: 55,
  },
  {
    id: 'c-olivia-brooks',
    name: 'Olivia Brooks',
    type: 'TOUR',
    phone: '510-555-0166',
    email: 'olivia.brooks@gmail.com',
    budget: 2900,
    preferences: 'Studio or 1 bed, budget-conscious',
    properties: ['Oakland Lakeside 2A'],
    createdAt: daysAgo(15),
    address: 'Oakland, CA',
    notes: 'Lease ends end of summer, no rush yet.',
    tags: ['student'],
    followUpAt: null,
    leadType: 'rental',
    leadScore: 48,
  },
  {
    id: 'c-diego-romero',
    name: 'Diego Romero',
    type: 'QUALIFICATION',
    phone: '(415) 555-0150',
    email: 'diego.romero@gmail.com',
    budget: 750000,
    preferences: 'Condo, fixer is fine',
    properties: [],
    createdAt: daysAgo(28),
    address: 'San Francisco, CA',
    notes: 'Just starting to look, very early.',
    tags: [],
    followUpAt: null,
    leadType: 'buyer',
    leadScore: 34,
  },
  {
    id: 'c-hannah-kim',
    name: 'Hannah Kim',
    type: 'APPLICATION',
    phone: '650.555.0131',
    email: 'hannah.kim@gmail.com',
    budget: 5200,
    preferences: '3 bed family rental, near park',
    properties: ['Sunset District Home'],
    createdAt: daysAgo(6),
    address: 'Outer Sunset, San Francisco, CA',
    notes: 'Application submitted, awaiting references.',
    tags: ['family'],
    followUpAt: daysAhead(2),
    leadType: 'rental',
    leadScore: 68,
  },
  {
    id: 'c-james-okafor',
    name: 'James Okafor',
    type: 'TOUR',
    phone: '(408) 555-0145',
    email: 'james.okafor@gmail.com',
    budget: 1100000,
    preferences: '2 bed condo, downtown, gym',
    properties: ['Downtown Tower 18C'],
    createdAt: daysAgo(7),
    address: 'San Jose, CA',
    notes: 'Investor profile, may want a second unit later.',
    tags: ['investor'],
    followUpAt: daysAhead(4),
    leadType: 'buyer',
    leadScore: 64,
  },
  {
    id: 'c-laura-mendes',
    name: 'Laura Mendes',
    type: 'QUALIFICATION',
    phone: '415-555-0109',
    email: 'laura.mendes@gmail.com',
    budget: 3300,
    preferences: '1 bed, quiet street, natural light',
    properties: [],
    createdAt: daysAgo(20),
    address: 'Bernal Heights, San Francisco, CA',
    notes: 'Wants to see what comes on the market this month.',
    tags: [],
    followUpAt: null,
    leadType: 'rental',
    leadScore: 41,
  },
  {
    id: 'c-kevin-doyle',
    name: 'Kevin Doyle',
    type: 'QUALIFICATION',
    phone: '(707) 555-0172',
    email: 'kevin.doyle@gmail.com',
    budget: 620000,
    preferences: 'Starter home, commuter rail nearby',
    properties: [],
    createdAt: daysAgo(34),
    address: 'Petaluma, CA',
    notes: 'Saving for a larger down payment, long horizon.',
    tags: [],
    followUpAt: null,
    leadType: 'buyer',
    leadScore: 29,
  },
  {
    id: 'c-natalie-ross',
    name: 'Natalie Ross',
    type: 'TOUR',
    phone: '510.555.0118',
    email: 'natalie.ross@gmail.com',
    budget: 4800,
    preferences: '2 bed, rooftop access, modern',
    properties: ['Emeryville Modern 7D'],
    createdAt: daysAgo(3),
    address: 'Emeryville, CA',
    notes: 'Toured one unit, liked it, wants a second look.',
    tags: ['new-lead'],
    followUpAt: daysAhead(5),
    leadType: 'rental',
    leadScore: 58,
  },
];

// ── Performance-strip data ──────────────────────────────────────────────────
// Stand-ins for Jordan's read-only Deal / DealStage query. Numbers chosen so
// the three metrics render real values rather than the calm empty states:
//   - avg time to close: mean of (closedAt - createdAt) over won deals
//   - conversion rate: won / (won + lost)
//   - biggest bottleneck: active deals stalling longest, by stage

export const DEMO_STAGES: StageMetricRow[] = [
  { id: 's-qualifying', name: 'Qualifying' },
  { id: 's-touring', name: 'Touring' },
  { id: 's-offer', name: 'Offer' },
  { id: 's-closing', name: 'Closing' },
];

export const DEMO_DEALS: DealMetricRow[] = [
  // Won deals — drive avg time-to-close and conversion.
  {
    id: 'd-1',
    status: 'won',
    stageId: 's-closing',
    createdAt: daysAgo(70),
    closedAt: daysAgo(28),
  },
  {
    id: 'd-2',
    status: 'won',
    stageId: 's-closing',
    createdAt: daysAgo(55),
    closedAt: daysAgo(19),
  },
  {
    id: 'd-3',
    status: 'won',
    stageId: 's-closing',
    createdAt: daysAgo(48),
    closedAt: daysAgo(10),
  },
  // Lost deal — pulls conversion below 100%.
  {
    id: 'd-4',
    status: 'lost',
    stageId: 's-offer',
    createdAt: daysAgo(60),
    closedAt: daysAgo(30),
  },
  // Active deals — feed the bottleneck. Touring holds the oldest cohort.
  {
    id: 'd-5',
    status: 'active',
    stageId: 's-touring',
    createdAt: daysAgo(31),
    stageChangedAt: daysAgo(24),
  },
  {
    id: 'd-6',
    status: 'active',
    stageId: 's-touring',
    createdAt: daysAgo(26),
    stageChangedAt: daysAgo(21),
  },
  {
    id: 'd-7',
    status: 'active',
    stageId: 's-qualifying',
    createdAt: daysAgo(9),
    stageChangedAt: daysAgo(5),
  },
  {
    id: 'd-8',
    status: 'active',
    stageId: 's-offer',
    createdAt: daysAgo(14),
    stageChangedAt: daysAgo(6),
  },
];
