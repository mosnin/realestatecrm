// Database model types — replaces Prisma generated types

export type PlatformRole = 'user' | 'admin';
export type AccountType = 'realtor' | 'broker_only' | 'both';
export type MembershipRole = 'broker_owner' | 'broker_admin' | 'realtor_member';
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'cancelled';

export type User = {
  id: string;
  clerkId: string;
  email: string;
  name: string | null;
  avatar: string | null;
  bio: string | null;
  createdAt: Date;
  onboardingCurrentStep: number;
  onboardingStartedAt: Date | null;
  onboardingCompletedAt: Date | null;
  onboard: boolean;
  platformRole: PlatformRole;
  accountType: AccountType;
};

export type Brokerage = {
  id: string;
  name: string;
  ownerId: string;
  status: 'active' | 'suspended';
  websiteUrl: string | null;
  logoUrl: string | null;
  joinCode: string | null;
  privacyPolicyHtml: string | null;
  brokerageFormConfig: IntakeFormConfig | null;
  brokerageRentalFormConfig: IntakeFormConfig | null;
  brokerageBuyerFormConfig: IntakeFormConfig | null;
  brokerageRentalScoringModel: import('@/lib/scoring/scoring-model-types').ScoringModel | null;
  brokerageBuyerScoringModel: import('@/lib/scoring/scoring-model-types').ScoringModel | null;
  /**
   * Plan tier (V2 — lib/plans.ts). 'team' → 5 seats, 'team_plus' → 10. A
   * brokerage that hasn't subscribed may still carry a legacy/unset value in
   * the DB; anything outside {team, team_plus} is treated as "no active plan".
   */
  plan: 'team' | 'team_plus';
  /** Max members + pending invites. */
  seatLimit: number | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeSubscriptionStatus: 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'inactive';
  stripePeriodEnd: Date | null;
  createdAt: Date;
  // Intake trust signals — brokerage-level compliance text inherited by
  // /apply/b/[brokerageId]. Per-space SpaceSetting values take a back seat
  // when the intake is served via the brokerage variant.
  brokerageLicenseNumber: string | null;
  brokerageFairHousingNotice: string | null;
  brokerageShowEqualHousingMark: boolean;
  // Speed-to-lead SLA policy (added in 20260612000000_lead_sla.sql)
  slaEnabled: boolean;
  slaFirstResponseMinutes: number;
  slaEscalateMinutes: number;
  // E-sign close gate (added in 20260710000000_deal_require_signed_before_close.sql).
  // OFF by default: when true, a deal can't be closed (status -> 'won') while it
  // still has an in-progress SignatureRequest. Enforced in the deal PATCH route.
  requireSignedDocsBeforeClose: boolean;
};

export type BrokerageMembership = {
  id: string;
  brokerageId: string;
  userId: string;
  role: MembershipRole;
  invitedById: string | null;
  createdAt: Date;
  // Per-member broker profile (20260615000000). Owner/admin customize their
  // own profile within the brokerage. Null until the member fills it in.
  displayName?: string | null;
  title?: string | null;
  bio?: string | null;
  photoUrl?: string | null;
  phone?: string | null;
};

export type Invitation = {
  id: string;
  brokerageId: string;
  email: string;
  roleToAssign: 'broker_admin' | 'realtor_member';
  token: string;
  status: InvitationStatus;
  expiresAt: Date;
  invitedById: string | null;
  createdAt: Date;
};

export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'inactive';

export type Space = {
  id: string;
  slug: string;
  name: string;
  emoji: string;
  createdAt: Date;
  ownerId: string;
  brokerageId: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeSubscriptionStatus: SubscriptionStatus;
  stripePeriodEnd: string | null;
};

export type SpaceSetting = {
  id: string;
  spaceId: string;
  notifications: boolean;
  smsNotifications: boolean;
  notifyNewLeads: boolean;
  notifyTourBookings: boolean;
  notifyNewDeals: boolean;
  notifyFollowUps: boolean;
  // Daily brief settings (Phase B3 / B6)
  briefEnabled: boolean;
  briefHour: number;
  briefEmail: boolean;
  briefSms: boolean;
  briefEnabledAt: string | null;
  briefIntroSeenAt: string | null;
  unsubscribeToken: string | null;
  timezone: string;
  phoneNumber: string | null;
  myConnections: string | null;
  aiPersonalization: string | null;
  billingSettings: string | null;
  businessName: string | null;
  intakePageTitle: string | null;
  intakePageIntro: string | null;
  bio: string | null;
  socialLinks: { instagram?: string; linkedin?: string; facebook?: string } | null;
  intakeAccentColor: string | null;
  intakeBorderRadius: 'rounded' | 'sharp';
  intakeFont: 'system' | 'serif' | 'mono';
  intakeFooterLinks: { label: string; url: string }[] | null;
  // Visual customization
  intakeHeaderBgColor: string | null;
  intakeHeaderGradient: string | null;
  intakeDarkMode: boolean;
  intakeFaviconUrl: string | null;
  // Content customization
  intakeThankYouTitle: string | null;
  intakeThankYouMessage: string | null;
  intakeConfirmationEmail: string | null;
  intakeVideoUrl: string | null;
  intakeDisclaimerText: string | null;
  // Form field control
  intakeDisabledSteps: string[];
  intakeRequiredFields: string[];
  intakeCustomQuestions: { id: string; label: string; placeholder?: string; required?: boolean }[];
  intakeStepOrder: string[];
  // Legal & compliance
  privacyPolicyUrl: string | null;
  privacyPolicyHtml: string | null;
  consentCheckboxLabel: string | null;
  // Intake trust signals — realtor/brokerage-supplied compliance slots
  // rendered in the public intake footer. Chippi provides the slot;
  // the realtor fills the actual legal text.
  intakeLicenseNumber: string | null;
  intakeFairHousingNotice: string | null;
  intakeShowEqualHousingMark: boolean;
  // Dynamic form builder
  formConfig: IntakeFormConfig | null;
  formConfigSource: FormConfigSource;
  rentalFormConfig: IntakeFormConfig | null;
  buyerFormConfig: IntakeFormConfig | null;
  // AI-generated scoring models (stored separately from form config)
  rentalScoringModel: import('@/lib/scoring/scoring-model-types').ScoringModel | null;
  buyerScoringModel: import('@/lib/scoring/scoring-model-types').ScoringModel | null;
  // Tracking pixels
  trackingPixels: TrackingPixels | null;
};

export type TrackingPixels = {
  facebookPixelId?: string;
  tiktokPixelId?: string;
  googleAnalyticsId?: string;
  googleAdsId?: string;
  twitterPixelId?: string;
  linkedinPartnerId?: string;
  snapchatPixelId?: string;
  customHeadScript?: string;
};

export type Contact = {
  id: string;
  spaceId: string;
  name: string;
  email: string | null;
  phone: string | null;
  leadType: 'rental' | 'buyer' | 'seller';
  address: string | null;
  notes: string | null;
  budget: number | null;
  preferences: string | null;
  properties: string[];
  type: ClientType;
  tags: string[];
  leadScore: number | null;
  scoreLabel: string | null;
  scoreSummary: string | null;
  scoringStatus: string;
  scoreDetails: LeadScoreDetails | null;
  applicationData: ApplicationData | null;
  followUpAt: Date | null;
  lastContactedAt: Date | null;
  sourceLabel: string | null;
  stageChangedAt: Date | null;
  applicationStatus: string | null;
  applicationStatusNote: string | null;
  applicationRef: string | null;
  statusPortalToken: string | null;
  // Consent tracking (read-only after capture)
  consentGiven: boolean | null;
  consentTimestamp: Date | null;
  consentIp: string | null;
  consentPrivacyPolicyUrl: string | null;
  formConfigSnapshot: IntakeFormConfig | null;
  formLeadType: 'rental' | 'buyer' | 'seller' | null;
  /** Who sent this lead — free-form. Used for referral-fee tracking later. */
  referralSource: string | null;
  /**
   * Structured lead-source attribution — WHERE this lead came from. Stable enum
   * (see lib/lead-source.ts) captured at creation so the broker analytics
   * lead-source breakdown can group reliably. Distinct from the free-form
   * sourceLabel / referralSource above.
   */
  source: import('@/lib/lead-source').LeadSource | null;
  /** Free-form context for `source` (referral name, utm value, etc.). */
  sourceDetail: string | null;
  /** Hide this contact from the main People view until this date. */
  snoozedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ApplicationData = {
  // Step 1: Property Selection
  propertyAddress?: string;
  unitType?: string;
  targetMoveInDate?: string;
  monthlyRent?: number | string;
  leaseTermPreference?: string;
  numberOfOccupants?: number;
  // Step 2: Applicant Basics
  legalName: string;
  email?: string;
  phone?: string;
  dateOfBirth?: string;
  // Step 3: Current Living Situation
  currentAddress?: string;
  currentHousingStatus?: 'own' | 'rent' | 'rent-free' | '';
  currentMonthlyPayment?: number;
  lengthOfResidence?: string;
  reasonForMoving?: string;
  // Step 4: Household
  adultsOnApplication?: number;
  childrenOrDependents?: number;
  coRenters?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  // Step 5: Income
  employmentStatus?: 'employed' | 'self-employed' | 'unemployed' | 'retired' | 'student' | 'Full-time employed' | 'Self-employed' | 'Part-time employed' | 'Student' | 'Not currently employed' | '';
  employerOrSource?: string;
  monthlyGrossIncome?: number | string;
  additionalIncome?: number;
  // Step 6: Rental History
  currentLandlordName?: string;
  currentLandlordPhone?: string;
  previousLandlordName?: string;
  previousLandlordPhone?: string;
  currentRentPaid?: number;
  latePayments?: boolean;
  leaseViolations?: boolean;
  permissionToContactReferences?: boolean;
  // Step 7: Screening
  priorEvictions?: boolean;
  outstandingBalances?: boolean;
  bankruptcy?: boolean;
  backgroundAcknowledgment?: boolean;
  creditScore?: number;
  smoking?: boolean;
  hasPets?: boolean;
  petDetails?: string;
  // Step 8: Additional notes
  additionalNotes?: string;
  // Step 9: Consents
  consentToScreening?: boolean;
  truthfulnessCertification?: boolean;
  electronicSignature?: string;
  submittedAt?: string;
  completionPercentage?: number;
  completedSteps?: number[];
  // Buyer-specific fields
  preApprovalStatus?: 'yes' | 'no' | 'not-yet' | string;
  preApprovalLender?: string;
  preApprovalAmount?: string;
  propertyType?: string;
  bedrooms?: number | string;
  bathrooms?: number | string;
  mustHaves?: string | string[];
  firstTimeBuyer?: 'yes' | 'no' | string;
  buyerBudget?: number | string;
  housingSituation?: 'renting' | 'own-home' | 'family' | string;
  buyerTimeline?: 'asap' | '1-3mo' | '3-6mo' | 'exploring' | string;
};

export type LeadScoreDetails = {
  score: number;
  priorityTier: 'hot' | 'warm' | 'cold' | 'unqualified';
  qualificationStatus: string;
  readinessStatus: string;
  confidence: number;
  summary: string;
  explanationTags: string[];
  strengths: string[];
  weaknesses: string[];
  riskFlags: string[];
  missingInformation: string[];
  recommendedNextAction: string;
  leadState: string;
};

export type ClientType = 'QUALIFICATION' | 'TOUR' | 'APPLICATION';

export interface DealMilestone {
  id: string;           // crypto.randomUUID()
  label: string;        // e.g. "Inspection period ends"
  dueDate: string | null;   // ISO date string, nullable
  completed: boolean;
  completedAt: string | null; // ISO date string
}

export type Deal = {
  id: string;
  spaceId: string;
  title: string;
  description: string | null;
  value: number | null;
  address: string | null;
  priority: Priority;
  closeDate: Date | null;
  stageId: string;
  position: number;
  status: 'active' | 'won' | 'lost' | 'on_hold';
  /** Bumped whenever stageId changes; the Deal moved to its current stage at this instant. */
  stageChangedAt: Date | null;
  followUpAt: Date | null;
  commissionRate: number | null;
  probability: number | null;
  milestones: DealMilestone[];
  /** Realtor-authored "what's next" — shown prominently on the card and in the Today inbox. */
  nextAction: string | null;
  nextActionDueAt: Date | null;
  /** Captured when a deal is marked won or lost so we can learn from it later. */
  wonLostReason: string | null;
  wonLostNote: string | null;
  /**
   * Structured win/loss close-reason — stable enum key (see lib/close-reason.ts)
   * stamped on the won/lost transition so win/loss analysis can group reliably.
   * Distinct from the free-form wonLostReason above (which is kept for back-compat).
   */
  closeReason: import('@/lib/close-reason').CloseReason | null;
  /** Free-form context for `closeReason`. */
  closeReasonDetail: string | null;
  /** Nullable FK to Property. Deals without a linked property still work. */
  propertyId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type DealStageKind =
  | 'lead'
  | 'qualified'
  | 'active'
  | 'under_contract'
  | 'closing'
  | 'closed';

export type PropertyType =
  | 'single_family'
  | 'condo'
  | 'townhouse'
  | 'multi_family'
  | 'land'
  | 'commercial'
  | 'other';

export type PropertyListingStatus =
  | 'active'
  | 'pending'
  | 'sold'
  | 'off_market'
  | 'owned';

export interface PropertyPacket {
  id: string;
  spaceId: string;
  propertyId: string;
  name: string;
  token: string;
  includeDocumentIds: string[];
  expiresAt: string | null;
  viewCount: number;
  lastViewedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export interface Property {
  id: string;
  spaceId: string;
  address: string;
  unitNumber: string | null;
  city: string | null;
  stateRegion: string | null;
  postalCode: string | null;
  mlsNumber: string | null;
  propertyType: PropertyType | null;
  beds: number | null;
  baths: number | null;
  squareFeet: number | null;
  lotSizeSqft: number | null;
  yearBuilt: number | null;
  listPrice: number | null;
  listingStatus: PropertyListingStatus;
  listingUrl: string | null;
  photos: string[];
  notes: string | null;
  /** Brokerage pool: set when this property belongs to a brokerage's central
   *  pool (created by the broker). Null for a realtor's own property. */
  brokerageId?: string | null;
  /** Brokerage pool: the member realtor's Space this pool property is assigned
   *  to. Null = unassigned (sitting in the pool). */
  assignedSpaceId?: string | null;
  /** "Analyze" feature: the full structured web-research result (or null until
   *  the first run). See lib/property-analysis.ts for the pipeline. */
  analysis?: PropertyAnalysis | null;
  /** "Analyze" feature: when the most recent Analyze run completed. */
  analyzedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Property "Analyze" result shapes (plain data; client-safe) ──────────────
// The canonical pipeline lives in lib/property-analysis.ts (server-only). These
// shapes are defined here so both the server pipeline and client UI can share
// them without the UI importing a server-only module.

/** The Property fields the analysis may populate (grounded in web evidence). */
export interface AnalyzedFields {
  beds: number | null;
  baths: number | null;
  squareFeet: number | null;
  lotSizeSqft: number | null;
  yearBuilt: number | null;
  propertyType: string | null;
  listPrice: number | null;
  listingStatus: string | null;
  listingUrl: string | null;
  estimatedValue: number | null;
  lastSoldPrice: number | null;
  lastSoldDate: string | null;
  description: string | null;
  features: string[];
  hoaFee: string | null;
  propertyTaxes: string | null;
  photoUrls: string[];
}

/** Per-field provenance: which source URL each populated value came from. */
export type FieldSources = Partial<Record<keyof AnalyzedFields, string>>;

/** A source page consulted during an analysis run. */
export interface AnalysisSource {
  url: string;
  title: string;
}

/** The structured result persisted into Property.analysis. */
export interface PropertyAnalysis {
  fields: AnalyzedFields;
  fieldSources: FieldSources;
  summary: string;
  sources: AnalysisSource[];
  stats: { searchResults: number; scraped: number };
  analyzedAt: string;
}

export type DealActivity = {
  id: string;
  dealId: string;
  spaceId: string;
  type: 'note' | 'call' | 'email' | 'meeting' | 'follow_up' | 'stage_change' | 'status_change';
  content: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH';

export type Pipeline = {
  id: string;
  spaceId: string;
  name: string;
  color: string;
  emoji: string | null;
  position: number;
  createdAt: Date;
};

export type DealStage = {
  id: string;
  spaceId: string;
  name: string;
  color: string;
  position: number;
  pipelineType: string | null;
  pipelineId: string | null;
  /** Typed view of the stage. Null for custom user stages. */
  kind: DealStageKind | null;
};

export type DealContactRole =
  | 'buyer'
  | 'seller'
  | 'buyer_agent'
  | 'listing_agent'
  | 'co_agent'
  | 'lender'
  | 'title'
  | 'escrow'
  | 'inspector'
  | 'appraiser'
  | 'attorney'
  | 'other';

export type DealContact = {
  dealId: string;
  contactId: string;
  role: DealContactRole | null;
};

export type ContactActivity = {
  id: string;
  contactId: string;
  spaceId: string;
  type: 'note' | 'call' | 'email' | 'meeting' | 'follow_up';
  content: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};

/**
 * The list a SavedView belongs to. Matches the `entity` CHECK constraint in
 * 20260716000000_saved_views.sql.
 */
export type SavedViewEntity = 'contact' | 'deal';

/**
 * A named, persisted filter set for the contact or deal list. Server-backed via
 * /api/saved-views (table "SavedView"), space-scoped.
 *
 * `page` is the legacy client-only discriminant that predated the server table
 * (contact-table.tsx persisted views to localStorage keyed by `page`). It is
 * kept OPTIONAL so older localStorage payloads still parse; new code keys off
 * `entity`. `filters` is the opaque, client-owned re-hydration payload.
 */
export type SavedView = {
  id: string;
  spaceId?: string;
  userId?: string | null;
  entity?: SavedViewEntity;
  name: string;
  /** @deprecated legacy localStorage discriminant — prefer `entity`. */
  page?: 'contacts' | 'leads' | 'deals';
  filters: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
};

export type Message = {
  id: string;
  spaceId: string;
  conversationId: string | null;
  role: string;
  content: string;
  /**
   * Ordered list of rendered blocks (text + tool calls + permission
   * prompts) for messages produced by the on-demand agent. Null for
   * legacy plain-text messages — the client falls back to rendering
   * `content` as a single text block. See lib/ai-tools/blocks.ts.
   */
  blocks: unknown[] | null;
  createdAt: Date;
};

export type Conversation = {
  id: string;
  spaceId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  /** Last message content truncated to 60 chars, or null if no messages yet. */
  preview?: string | null;
};

export type TourStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';

export type Tour = {
  id: string;
  spaceId: string;
  contactId: string | null;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  propertyAddress: string | null;
  notes: string | null;
  startsAt: Date;
  endsAt: Date;
  status: TourStatus;
  googleEventId: string | null;
  reminder24SentAt: Date | null;
  reminder1hSentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Note = {
  id: string;
  spaceId: string;
  title: string;
  content: string;
  icon: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

// ── Form Builder Types ──

export type FormQuestionType =
  | 'text'
  | 'textarea'
  | 'email'
  | 'phone'
  | 'number'
  | 'select'
  | 'multi_select'
  | 'radio'
  | 'checkbox'
  | 'date';

export type FormLeadType = 'rental' | 'buyer' | 'general';

export type FormConfigSource = 'custom' | 'brokerage' | 'legacy';

export type FormQuestionOption = {
  value: string;
  label: string;
  scoreValue?: number;
};

export type FormQuestionValidation = {
  pattern?: string;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
};

export type FormQuestionScoring = {
  weight: number; // 0-10, 0 = informational only
  mappings?: { value: string; points: number }[];
};

export type FormQuestionVisibility = {
  questionId: string;
  operator: 'equals' | 'not_equals' | 'contains';
  value: string;
};

export type FormQuestion = {
  id: string; // stable UUID
  type: FormQuestionType;
  label: string;
  description?: string;
  placeholder?: string;
  required: boolean;
  position: number;
  system?: boolean; // true for name, email, phone -- can't be deleted
  options?: FormQuestionOption[];
  validation?: FormQuestionValidation;
  scoring?: FormQuestionScoring;
  visibleWhen?: FormQuestionVisibility;
};

export type FormSection = {
  id: string; // stable UUID
  title: string;
  description?: string;
  position: number;
  questions: FormQuestion[];
  visibleWhen?: FormQuestionVisibility;
};

export type IntakeFormConfig = {
  version: number;
  leadType: FormLeadType;
  sections: FormSection[];
};

export type FormSubmission = {
  formConfigVersion: number;
  formConfigSnapshot: IntakeFormConfig; // frozen copy of form at submission time
  answers: Record<string, string | string[] | number | boolean>;
};

// ── Form Analytics Types ──

export type FormAnalyticsEventType =
  | 'form_start'
  | 'step_view'
  | 'step_complete'
  | 'form_submit'
  | 'form_abandon';

export type FormAnalyticsEvent = {
  id: string;
  spaceId: string;
  sessionId: string;
  formConfigVersion: number | null;
  eventType: FormAnalyticsEventType;
  stepIndex: number | null;
  stepTitle: string | null;
  durationMs: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};

// ── Application Portal Types ──

export type ApplicationMessageSenderType = 'applicant' | 'realtor';

export type ApplicationMessage = {
  id: string;
  contactId: string;
  spaceId: string;
  senderType: ApplicationMessageSenderType;
  content: string;
  readAt: Date | null;
  createdAt: Date;
};

export type ApplicationStatusUpdate = {
  id: string;
  contactId: string;
  spaceId: string;
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  createdAt: Date;
};

export type ApplicationStatus =
  | 'received'
  | 'under_review'
  | 'tour_scheduled'
  | 'approved'
  | 'declined'
  | 'waitlisted';

// ── Integration Types ──
// The IntegrationConnection / IntegrationTrigger row shapes live next to
// their DB helpers (lib/integrations/connections.ts, .../triggers.ts). The
// event record is consumed more broadly (activity feed + agent context), so
// its type lives here alongside the other model types.

/** Lifecycle of a persisted connected-app event relative to dispatch. */
export type IntegrationEventStatus = 'captured' | 'dispatched' | 'skipped' | 'failed';

/**
 * One persisted Composio trigger delivery — the durable record behind the
 * activity feature. Written for every accepted delivery (even when dispatch
 * is later skipped or fails). Mirrors the "IntegrationEvent" table
 * (supabase/migrations/20260705000000_integration_event.sql).
 */
export type IntegrationEvent = {
  id: string;
  spaceId: string;
  connectionId: string;
  /** Null once the capturing trigger row is deleted (ON DELETE SET NULL). */
  triggerId: string | null;
  toolkit: string;
  /** The trigger slug, e.g. 'GMAIL_NEW_GMAIL_MESSAGE'. */
  eventType: string;
  title: string | null;
  /** from / sender / name, when the payload carries one. */
  actor: string | null;
  snippet: string | null;
  occurredAt: string;
  payload: Record<string, unknown> | null;
  status: IntegrationEventStatus;
  /** Modal draft correlation — populated by a follow-up, NULL on capture. */
  draftId: string | null;
  /** Composio's webhook delivery id; the idempotency anchor. */
  deliveryId: string | null;
  createdAt: string;
  updatedAt: string;
};

// ── Agent Run Ledger ──
// One row per autonomous-run DISPATCH (sweep / routine / run-now). The durable
// lifecycle record behind dispatch reliability + reconcile. Mirrors the
// "AgentRunLedger" table (supabase/migrations/20260709000000_agent_run_ledger.sql).
// The dispatch helpers live in lib/agent/run-ledger.ts; the row type lives here
// alongside the other model types (re-exported there for the helper's callers).

/** Lifecycle of one autonomous-run dispatch. See the migration header. */
export type AgentRunLedgerStatus = 'dispatched' | 'in_flight' | 'confirmed' | 'failed';

export type AgentRunLedger = {
  id: string;
  /** Generated at dispatch (crypto.randomUUID()); forwarded to Modal in the POST body. */
  runId: string;
  spaceId: string;
  /** Dispatch source: 'sweep' | 'routine' | 'run_now' | ... Free text in the DB. */
  trigger: string | null;
  status: AgentRunLedgerStatus;
  dispatchedAt: string;
  /** Set when reconcile confirms a run artifact appeared. */
  confirmedAt: string | null;
  /** Reason on status='failed' (Modal HTTP status, network error, or 'no_artifact'). */
  failureReason: string | null;
  /** Reserved for a future auto-retry path; always 0 today. */
  retryCount: number;
  createdAt: string;
  updatedAt: string;
};

// ── Agent profitability / ROI (broker analytics) ────────────────────────────
// Additive types for the per-agent profitability rollup. The aggregation logic
// lives in lib/agent-profitability.ts (pure, testable); these are the row
// shapes it consumes and produces. Money is derived from CommissionLedger rows,
// the brokerage's frozen money-of-record (see that file's header for the
// GCI/split/net derivation and why cost-per-lead is intentionally absent).

/** The minimal CommissionLedger shape the profitability rollup needs. */
export interface ProfitabilityLedgerRow {
  /** Producing agent (CommissionLedger.agentUserId). */
  agentUserId: string;
  /** Agent's commission slice in dollars. */
  agentAmount: number | null;
  /** Brokerage's commission slice in dollars — the house's NET on this deal. */
  brokerAmount: number | null;
  /** Referral payout in dollars (0 when none). */
  referralAmount: number | null;
  /** 'void' rows are excluded from all figures; 'paid'/'pending' both count. */
  status: 'pending' | 'paid' | 'void';
}

/** One agent the broker wants reported, with their lead volume. */
export interface AgentProfitabilityInput {
  agentUserId: string;
  name: string;
  email: string;
  /** Display role label (e.g. 'Realtor', 'Owner', 'Admin'). */
  role: string;
  /** Total leads (Contact count) acquired in the agent's space. */
  leads: number;
}

/** Per-agent profitability row. All dollar figures are USD, rounded to cents. */
export interface AgentProfitability {
  agentUserId: string;
  name: string;
  email: string;
  role: string;
  /** Leads acquired (Contact count in the agent's space). */
  leads: number;
  /** Won deals on the ledger (excludes voided rows). */
  dealsClosed: number;
  /** Gross commission income = agentShare + brokerageNet + referralShare. */
  gci: number;
  /** The agent's commission cut. */
  agentShare: number;
  /** What the brokerage keeps — the NET to the house. */
  brokerageNet: number;
  /** Commission paid out to referring parties. */
  referralShare: number;
  /** Brokerage net still pending payout. */
  pendingNet: number;
  /** Brokerage net already paid out. */
  paidNet: number;
  /**
   * Lead -> deal conversion as a 0–100 percentage (one decimal), or null when
   * the agent has no leads (no rate to report — distinct from a real 0%).
   */
  leadToDealRate: number | null;
  /**
   * Cost per lead in dollars. Always null today: no spend input exists in the
   * data model, and a money surface must not fabricate one. See costDataAvailable.
   */
  costPerLead: number | null;
  /** False until a real per-lead cost input exists; gates the cost-per-lead UI. */
  costDataAvailable: boolean;
}

/** Brokerage-wide totals across the per-agent profitability rows. */
export interface AgentProfitabilityTotals {
  /** Number of agents reported (the full roster passed in). */
  agentCount: number;
  /** Agents who closed at least one deal. */
  activeAgents: number;
  leads: number;
  dealsClosed: number;
  gci: number;
  agentShare: number;
  brokerageNet: number;
  referralShare: number;
  pendingNet: number;
  paidNet: number;
  /** Team lead -> deal conversion from summed leads/deals; null when no leads. */
  teamLeadToDealRate: number | null;
  /** Always null today — no spend input exists. */
  costPerLead: number | null;
  /** False until a real per-lead cost input exists. */
  costDataAvailable: boolean;
}
