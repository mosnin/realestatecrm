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
  rentalFormConfig,
  buyerFormConfig,
  resumeToken,
}: {
  slug: string;
  spaceId?: string;
  businessName: string;
  customization?: IntakeCustomization;
  brokerageId?: string;
  /** @deprecated Use rentalFormConfig/buyerFormConfig instead */
  formConfig?: IntakeFormConfig | null;
  rentalFormConfig?: IntakeFormConfig | null;
  buyerFormConfig?: IntakeFormConfig | null;
  resumeToken?: string;
}) {
  // Dual form configs provided — use the new renderer with Getting Started step
  if (rentalFormConfig || buyerFormConfig) {
    return (
      <DynamicApplicationForm
        slug={slug}
        spaceId={spaceId}
        businessName={businessName}
        rentalFormConfig={rentalFormConfig}
        buyerFormConfig={buyerFormConfig}
        customization={customization}
        brokerageId={brokerageId}
        resumeToken={resumeToken}
      />
    );
  }

  // Legacy single form config — use the dynamic renderer (backwards compat)
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
