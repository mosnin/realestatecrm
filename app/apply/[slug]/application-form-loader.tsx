'use client';

import dynamic from 'next/dynamic';
import { Sparkles } from 'lucide-react';
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

function AIChatToggle({ slug }: { slug: string }) {
  return (
    <div className="text-center mb-6">
      <a
        href={`/apply/${slug}/chat`}
        className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
      >
        <Sparkles size={13} />
        Chat with AI instead
        <span aria-hidden>→</span>
      </a>
    </div>
  );
}

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
      <div>
        <AIChatToggle slug={slug} />
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
      </div>
    );
  }

  // Legacy single form config — use the dynamic renderer (backwards compat)
  if (formConfig) {
    return (
      <div>
        <AIChatToggle slug={slug} />
        <DynamicApplicationForm
          slug={slug}
          spaceId={spaceId}
          businessName={businessName}
          formConfig={formConfig}
          customization={customization}
          brokerageId={brokerageId}
          resumeToken={resumeToken}
        />
      </div>
    );
  }

  // No form config (legacy) — use the existing hardcoded form
  return (
    <div>
      <AIChatToggle slug={slug} />
      <ApplicationForm
        slug={slug}
        businessName={businessName}
        customization={customization}
        brokerageId={brokerageId}
      />
    </div>
  );
}
