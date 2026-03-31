'use client';

import dynamic from 'next/dynamic';
import type { IntakeCustomization } from './application-form';

const ApplicationForm = dynamic(
  () => import('./application-form').then((m) => m.ApplicationForm),
  { ssr: false }
);

export function ApplicationFormLoader({
  slug,
  businessName,
  customization,
  brokerageId,
}: {
  slug: string;
  businessName: string;
  customization?: IntakeCustomization;
  brokerageId?: string;
}) {
  return <ApplicationForm slug={slug} businessName={businessName} customization={customization} brokerageId={brokerageId} />;
}
