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
}: {
  slug: string;
  businessName: string;
  customization?: IntakeCustomization;
}) {
  return <ApplicationForm slug={slug} businessName={businessName} customization={customization} />;
}
