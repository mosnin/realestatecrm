/**
 * Shared client-side types for the drip sequences UI. Mirror the API's
 * response shapes (app/api/drip/**) and the engine's validated step shape
 * (lib/drip/schema.ts's DripStep) — kept as a parallel local type rather than
 * importing lib/drip/schema.ts's server-shaped exports so this file has zero
 * server-only surface and stays trivially importable from any client
 * component.
 */

export type DripChannel = 'email' | 'sms';

export interface DripStepUI {
  dayOffset: number;
  channel: DripChannel;
  instruction: string;
}

export interface DripSequenceUI {
  id: string;
  name: string;
  steps: DripStepUI[];
  active: boolean;
  createdAt: string;
  updatedAt?: string;
}

export type DripEnrollmentStatus = 'enrolled' | 'completed' | 'stopped';

export interface DripEnrollmentUI {
  id: string;
  sequenceId: string;
  contactId: string;
  contactName: string | null;
  contactEmail: string | null;
  enrolledAt: string;
  currentStep: number;
  status: DripEnrollmentStatus;
  stopReason: string | null;
  createdAt: string;
}

export interface EnrollmentCounts {
  enrolled: number;
  completed: number;
  stopped: number;
}

export function emptyCounts(): EnrollmentCounts {
  return { enrolled: 0, completed: 0, stopped: 0 };
}
