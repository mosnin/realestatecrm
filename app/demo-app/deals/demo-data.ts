/**
 * Hardcoded dummy pipeline for the backend-free /demo-app/deals walkthrough.
 *
 * Shapes match the real board exactly: stages are `DealStage & { deals }`, and
 * each deal is `Deal & { stage, dealContacts }` - the same `DealWithRelations`
 * the kanban column and card consume. No network, no Supabase, no auth.
 *
 * Dates are anchored to a fixed "today" (2026-06-04) so the health dots and
 * "closing this month" math read the same on every render. Pure data.
 */

import type { Deal, DealStage, Contact, DealContact } from '@/lib/types';

export type DemoDealContact = DealContact & {
  contact: Pick<Contact, 'id' | 'name'>;
};

export type DemoDeal = Deal & {
  stage: DealStage;
  dealContacts: DemoDealContact[];
};

export type DemoStageWithDeals = DealStage & { deals: DemoDeal[] };

const SPACE_ID = 'demo-space';
const PIPELINE_ID = 'demo-pipeline';

/** Anchor "now" for the demo so deal health is deterministic. */
const NOW = new Date('2026-06-04T09:00:00');
function daysFromNow(days: number): Date {
  const d = new Date(NOW);
  d.setDate(d.getDate() + days);
  return d;
}

// ── Stages ──────────────────────────────────────────────────────────────────
const STAGE_DEFS: Array<Pick<DealStage, 'id' | 'name' | 'color' | 'position'>> = [
  { id: 'stage-new', name: 'New', color: '#6366f1', position: 0 },
  { id: 'stage-qualified', name: 'Qualified', color: '#3b82f6', position: 1 },
  { id: 'stage-touring', name: 'Touring', color: '#14b8a6', position: 2 },
  { id: 'stage-offer', name: 'Offer', color: '#f97316', position: 3 },
  { id: 'stage-closing', name: 'Closing', color: '#22c55e', position: 4 },
];

function makeStage(def: (typeof STAGE_DEFS)[number]): DealStage {
  return {
    id: def.id,
    spaceId: SPACE_ID,
    name: def.name,
    color: def.color,
    position: def.position,
    pipelineType: 'sales',
    pipelineId: PIPELINE_ID,
    kind: null,
  };
}

const STAGES: Record<string, DealStage> = Object.fromEntries(
  STAGE_DEFS.map((d) => [d.id, makeStage(d)]),
);

// ── Cast (linked contacts) ───────────────────────────────────────────────────
function contact(id: string, name: string): Pick<Contact, 'id' | 'name'> {
  return { id, name };
}
const CAST = {
  sarah: contact('c-sarah', 'Sarah Chen'),
  priya: contact('c-priya', 'Priya Patel'),
  tom: contact('c-tom', 'Tom Nguyen'),
  marcus: contact('c-marcus', 'Marcus Webb'),
  emily: contact('c-emily', 'Emily Carter'),
  diego: contact('c-diego', 'Diego Romero'),
};

// ── Deal builder ─────────────────────────────────────────────────────────────
interface DealSeed {
  id: string;
  stageId: string;
  title: string;
  address: string;
  value: number;
  priority: Deal['priority'];
  closeInDays: number | null;
  /** Days since the deal entered its current stage - drives health dots. */
  inStageDays: number;
  commissionRate?: number | null;
  nextAction?: string | null;
  nextActionInDays?: number | null;
  contacts: Array<{ c: Pick<Contact, 'id' | 'name'>; role: DealContact['role'] }>;
}

function buildDeal(seed: DealSeed, position: number): DemoDeal {
  const stage = STAGES[seed.stageId];
  const closeDate = seed.closeInDays == null ? null : daysFromNow(seed.closeInDays);
  const nextActionDueAt =
    seed.nextActionInDays == null ? null : daysFromNow(seed.nextActionInDays);
  return {
    id: seed.id,
    spaceId: SPACE_ID,
    title: seed.title,
    description: null,
    value: seed.value,
    address: seed.address,
    priority: seed.priority,
    closeDate,
    stageId: seed.stageId,
    position,
    status: 'active',
    stageChangedAt: daysFromNow(-seed.inStageDays),
    followUpAt: null,
    commissionRate: seed.commissionRate ?? 2.5,
    probability: null,
    milestones: [],
    nextAction: seed.nextAction ?? null,
    nextActionDueAt,
    wonLostReason: null,
    wonLostNote: null,
    propertyId: null,
    createdAt: daysFromNow(-seed.inStageDays - 5),
    updatedAt: daysFromNow(-seed.inStageDays),
    stage,
    dealContacts: seed.contacts.map(({ c, role }) => ({
      dealId: seed.id,
      contactId: c.id,
      role,
      contact: c,
    })),
  };
}

const SEEDS: DealSeed[] = [
  // New
  {
    id: 'deal-1',
    stageId: 'stage-new',
    title: 'Chen family home search',
    address: '1420 Pine St',
    value: 685000,
    priority: 'MEDIUM',
    closeInDays: null,
    inStageDays: 2,
    nextAction: 'Send intro packet',
    nextActionInDays: 1,
    contacts: [{ c: CAST.sarah, role: 'buyer' }],
  },
  {
    id: 'deal-2',
    stageId: 'stage-new',
    title: 'Romero downtown condo',
    address: '88 Harbor View Apt 12C',
    value: 412000,
    priority: 'LOW',
    closeInDays: null,
    inStageDays: 4,
    contacts: [{ c: CAST.diego, role: 'buyer' }],
  },
  // Qualified
  {
    id: 'deal-3',
    stageId: 'stage-qualified',
    title: 'Patel move-up purchase',
    address: '305 Maple Grove Rd',
    value: 940000,
    priority: 'HIGH',
    closeInDays: null,
    inStageDays: 9,
    nextAction: 'Confirm pre-approval letter',
    nextActionInDays: 2,
    contacts: [{ c: CAST.priya, role: 'buyer' }],
  },
  {
    id: 'deal-4',
    stageId: 'stage-qualified',
    title: 'Webb investment duplex',
    address: '17 Larkspur Ave',
    value: 1250000,
    priority: 'MEDIUM',
    closeInDays: null,
    inStageDays: 18,
    contacts: [{ c: CAST.marcus, role: 'buyer' }],
  },
  // Touring
  {
    id: 'deal-5',
    stageId: 'stage-touring',
    title: 'Carter first home',
    address: '642 Birchwood Ln',
    value: 525000,
    priority: 'HIGH',
    closeInDays: null,
    inStageDays: 6,
    nextAction: 'Book Saturday showing block',
    nextActionInDays: 1,
    contacts: [{ c: CAST.emily, role: 'buyer' }],
  },
  {
    id: 'deal-6',
    stageId: 'stage-touring',
    title: 'Nguyen waterfront search',
    address: '9 Seacliff Terrace',
    value: 1080000,
    priority: 'MEDIUM',
    closeInDays: null,
    inStageDays: 33,
    contacts: [{ c: CAST.tom, role: 'buyer' }],
  },
  // Offer
  {
    id: 'deal-7',
    stageId: 'stage-offer',
    title: 'Chen offer on Pine St',
    address: '1420 Pine St',
    value: 685000,
    priority: 'HIGH',
    closeInDays: 21,
    inStageDays: 3,
    commissionRate: 2.75,
    nextAction: 'Counter at 672k',
    nextActionInDays: 0,
    contacts: [
      { c: CAST.sarah, role: 'buyer' },
      { c: CAST.marcus, role: 'listing_agent' },
    ],
  },
  {
    id: 'deal-8',
    stageId: 'stage-offer',
    title: 'Patel offer on Maple Grove',
    address: '305 Maple Grove Rd',
    value: 940000,
    priority: 'HIGH',
    closeInDays: 12,
    inStageDays: 5,
    commissionRate: 3,
    contacts: [{ c: CAST.priya, role: 'buyer' }],
  },
  // Closing
  {
    id: 'deal-9',
    stageId: 'stage-closing',
    title: 'Carter closing on Birchwood',
    address: '642 Birchwood Ln',
    value: 525000,
    priority: 'HIGH',
    closeInDays: 8,
    inStageDays: 4,
    commissionRate: 2.5,
    nextAction: 'Final walkthrough Thursday',
    nextActionInDays: 3,
    contacts: [
      { c: CAST.emily, role: 'buyer' },
      { c: CAST.diego, role: 'lender' },
    ],
  },
  {
    id: 'deal-10',
    stageId: 'stage-closing',
    title: 'Webb duplex closing',
    address: '17 Larkspur Ave',
    value: 1250000,
    priority: 'MEDIUM',
    closeInDays: 25,
    inStageDays: 7,
    commissionRate: 2.25,
    contacts: [{ c: CAST.marcus, role: 'buyer' }],
  },
];

function dealsForStage(stageId: string): DemoDeal[] {
  return SEEDS.filter((s) => s.stageId === stageId).map((s, i) => buildDeal(s, i));
}

export const DEMO_STAGES: DemoStageWithDeals[] = STAGE_DEFS.map((def) => ({
  ...STAGES[def.id],
  deals: dealsForStage(def.id),
}));

/** Stages with deals stripped - the shape PipelineSummary expects. */
export const DEMO_SUMMARY_STAGES: Array<DealStage & { deals: Deal[] }> =
  DEMO_STAGES.map((s) => ({ ...s, deals: s.deals }));
