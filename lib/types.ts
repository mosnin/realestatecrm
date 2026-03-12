// Database model types — replaces Prisma generated types

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
  createdAt: Date;
  updatedAt: Date;
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
  createdAt: Date;
  updatedAt: Date;
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

export type Message = {
  id: string;
  spaceId: string;
  role: string;
  content: string;
  createdAt: Date;
};
