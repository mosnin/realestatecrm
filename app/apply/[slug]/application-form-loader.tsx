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
  businessName,
  customization,
  brokerageId,
  formConfig,
}: {
  slug: string;
  businessName: string;
  customization?: IntakeCustomization;
  brokerageId?: string;
  formConfig?: IntakeFormConfig | null;
}) {
  // Dynamic form config provided — use the new renderer
  if (formConfig) {
    return (
      <DynamicApplicationForm
        slug={slug}
        businessName={businessName}
        formConfig={formConfig}
        customization={customization}
        brokerageId={brokerageId}
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
