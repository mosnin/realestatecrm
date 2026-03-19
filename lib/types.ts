// Database model types — replaces Prisma generated types

export type PlatformRole = 'user' | 'admin';
export type MembershipRole = 'broker_owner' | 'broker_manager' | 'realtor_member';
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
};

export type Brokerage = {
  id: string;
  name: string;
  ownerId: string;
  status: 'active' | 'suspended';
  websiteUrl: string | null;
  logoUrl: string | null;
  joinCode: string | null;
  createdAt: Date;
};

export type BrokerageMembership = {
  id: string;
  brokerageId: string;
  userId: string;
  role: MembershipRole;
  invitedById: string | null;
  createdAt: Date;
};

export type Invitation = {
  id: string;
  brokerageId: string;
  email: string;
  roleToAssign: 'broker_manager' | 'realtor_member';
  token: string;
  status: InvitationStatus;
  expiresAt: Date;
  invitedById: string | null;
  createdAt: Date;
};

export type Space = {
  id: string;
  slug: string;
  name: string;
  emoji: string;
  createdAt: Date;
  ownerId: string;
};

export type SpaceSetting = {
  id: string;
  spaceId: string;
  notifications: boolean;
  timezone: string;
  phoneNumber: string | null;
  myConnections: string | null;
  aiPersonalization: string | null;
  billingSettings: string | null;
  anthropicApiKey: string | null;
  businessName: string | null;
  intakePageTitle: string | null;
  intakePageIntro: string | null;
};

export type Contact = {
  id: string;
  spaceId: string;
  name: string;
  email: string | null;
  phone: string | null;
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
  createdAt: Date;
  updatedAt: Date;
};

export type ApplicationData = {
  // Step 1: Property Selection
  propertyAddress?: string;
  unitType?: string;
  targetMoveInDate?: string;
  monthlyRent?: number;
  leaseTermPreference?: string;
  numberOfOccupants?: number;
  // Step 2: Applicant Basics
  legalName: string;
  email?: string;
  phone: string;
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
  employmentStatus?: 'employed' | 'self-employed' | 'unemployed' | 'retired' | 'student' | '';
  employerOrSource?: string;
  monthlyGrossIncome?: number;
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
  followUpAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

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

export type DealStage = {
  id: string;
  spaceId: string;
  name: string;
  color: string;
  position: number;
};

export type DealContact = {
  dealId: string;
  contactId: string;
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

export type SavedView = {
  id: string;
  name: string;
  page: 'contacts' | 'leads';
  filters: Record<string, unknown>;
};

export type Message = {
  id: string;
  spaceId: string;
  conversationId: string | null;
  role: string;
  content: string;
  createdAt: Date;
};

export type Conversation = {
  id: string;
  spaceId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
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
  createdAt: Date;
  updatedAt: Date;
};
