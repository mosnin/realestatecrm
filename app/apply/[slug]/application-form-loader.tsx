'use client';

import dynamic from 'next/dynamic';
import type { IntakeCustomization } from './application-form';
import type { IntakeFormConfig } from '@/lib/types';

const ApplicationForm = dynamic(
  () => import('./application-form').then((m) => m.ApplicationForm),
  { ssr: false },
);

const DynamicApplicationForm = dynamic(
  () => import('./dynamic-application-form').then((m) => m.DynamicApplicationForm),
  { ssr: false },
);

export function ApplicationFormLoader({
  slug,
  spaceId,
  businessName,
  customization,
  brokerageId,
  formConfig,
  resumeToken,
}: {
  slug: string;
  spaceId?: string;
  businessName: string;
  customization?: IntakeCustomization;
  brokerageId?: string;
  formConfig?: IntakeFormConfig | null;
  resumeToken?: string;
}) {
  // Dynamic form config provided — use the new renderer
  if (formConfig) {
    return (
      <DynamicApplicationForm
        slug={slug}
        spaceId={spaceId}
        businessName={businessName}
        formConfig={formConfig}
        customization={customization}
        brokerageId={brokerageId}
        resumeToken={resumeToken}
      />
    );
  }

  // No form config (legacy) — use the existing hardcoded form
  return (
    <ApplicationForm
      slug={slug}
      businessName={businessName}
      customization={customization}
      brokerageId={brokerageId}
    />
  );
}
