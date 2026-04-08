import { supabase } from '@/lib/supabase';
import type {
  IntakeFormConfig,
  FormQuestion,
} from '@/lib/types';

// ── Stable UUIDs for system fields (shared across all default configs) ──
const SYSTEM_NAME_ID = '00000000-0000-4000-a000-000000000001';
const SYSTEM_EMAIL_ID = '00000000-0000-4000-a000-000000000002';
const SYSTEM_PHONE_ID = '00000000-0000-4000-a000-000000000003';

// ── System field generator ──

/** Returns the three required system fields (name, email, phone) with system: true */
export function generateSystemFields(): FormQuestion[] {
  return [
    {
      id: SYSTEM_NAME_ID,
      type: 'text',
      label: 'Full Name',
      placeholder: 'Alex Johnson',
      required: true,
      position: 0,
      system: true,
      validation: { minLength: 1, maxLength: 120 },
    },
    {
      id: SYSTEM_EMAIL_ID,
      type: 'email',
      label: 'Email',
      placeholder: 'alex@email.com',
      required: true,
      position: 1,
      system: true,
      validation: { maxLength: 255 },
    },
    {
      id: SYSTEM_PHONE_ID,
      type: 'phone',
      label: 'Phone',
      placeholder: '(555) 123-4567',
      required: true,
      position: 2,
      system: true,
      validation: { maxLength: 40 },
    },
  ];
}

// ── Default Rental Form Config ──
// Maps the current hardcoded RENTAL_STEPS from application-form.tsx into IntakeFormConfig format

export const DEFAULT_RENTAL_FORM_CONFIG: IntakeFormConfig = {
  version: 1,
  leadType: 'rental',
  sections: [
    {
      id: '10000000-0000-4000-a000-000000000001',
      title: "Let's start with the basics",
      description: 'We just need a few details to get going.',
      position: 0,
      questions: generateSystemFields(),
    },
    {
      id: '10000000-0000-4000-a000-000000000002',
      title: 'When are you planning to move?',
      position: 1,
      questions: [
        {
          id: '10000000-0000-4000-b000-000000000001',
          type: 'radio',
          label: 'Move timing',
          required: true,
          position: 0,
          options: [
            { value: 'asap', label: 'ASAP (within 2 weeks)', scoreValue: 10 },
            { value: '30days', label: 'Within 30 days', scoreValue: 8 },
            { value: '1-2months', label: '1-2 months', scoreValue: 5 },
            { value: 'browsing', label: 'Just browsing', scoreValue: 2 },
          ],
          scoring: {
            weight: 8,
            mappings: [
              { value: 'asap', points: 10 },
              { value: '30days', points: 8 },
              { value: '1-2months', points: 5 },
              { value: 'browsing', points: 2 },
            ],
          },
        },
      ],
    },
    {
      id: '10000000-0000-4000-a000-000000000003',
      title: 'Where are you looking to live?',
      position: 2,
      questions: [
        {
          id: '10000000-0000-4000-b000-000000000002',
          type: 'text',
          label: 'Desired location',
          placeholder: 'e.g., Downtown Miami, Brickell',
          required: true,
          position: 0,
          scoring: { weight: 0 },
        },
      ],
    },
    {
      id: '10000000-0000-4000-a000-000000000004',
      title: "What's your monthly rent budget?",
      position: 3,
      questions: [
        {
          id: '10000000-0000-4000-b000-000000000003',
          type: 'radio',
          label: 'Monthly budget',
          required: true,
          position: 0,
          options: [
            { value: 'under_1500', label: 'Under $1,500' },
            { value: '1500_2000', label: '$1,500 - $2,000' },
            { value: '2000_2500', label: '$2,000 - $2,500' },
            { value: '2500_3500', label: '$2,500 - $3,500' },
            { value: '3500_plus', label: '$3,500+' },
          ],
          scoring: {
            weight: 6,
            mappings: [
              { value: 'under_1500', points: 4 },
              { value: '1500_2000', points: 6 },
              { value: '2000_2500', points: 7 },
              { value: '2500_3500', points: 8 },
              { value: '3500_plus', points: 10 },
            ],
          },
        },
      ],
    },
    {
      id: '10000000-0000-4000-a000-000000000005',
      title: "What's your estimated monthly income?",
      position: 4,
      questions: [
        {
          id: '10000000-0000-4000-b000-000000000004',
          type: 'radio',
          label: 'Monthly income',
          required: true,
          position: 0,
          options: [
            { value: 'under_2000', label: 'Under $2,000' },
            { value: '2000_3000', label: '$2,000 - $3,000' },
            { value: '3000_4000', label: '$3,000 - $4,000' },
            { value: '4000_6000', label: '$4,000 - $6,000' },
            { value: '6000_plus', label: '$6,000+' },
          ],
          scoring: {
            weight: 7,
            mappings: [
              { value: 'under_2000', points: 3 },
              { value: '2000_3000', points: 5 },
              { value: '3000_4000', points: 7 },
              { value: '4000_6000', points: 8 },
              { value: '6000_plus', points: 10 },
            ],
          },
        },
      ],
    },
    {
      id: '10000000-0000-4000-a000-000000000006',
      title: "What's your current work situation?",
      position: 5,
      questions: [
        {
          id: '10000000-0000-4000-b000-000000000005',
          type: 'radio',
          label: 'Employment status',
          required: true,
          position: 0,
          options: [
            { value: 'full-time', label: 'Full-time employed' },
            { value: 'self-employed', label: 'Self-employed' },
            { value: 'part-time', label: 'Part-time employed' },
            { value: 'student', label: 'Student' },
            { value: 'not-employed', label: 'Not currently employed' },
          ],
          scoring: {
            weight: 5,
            mappings: [
              { value: 'full-time', points: 10 },
              { value: 'self-employed', points: 8 },
              { value: 'part-time', points: 5 },
              { value: 'student', points: 4 },
              { value: 'not-employed', points: 2 },
            ],
          },
        },
      ],
    },
    {
      id: '10000000-0000-4000-a000-000000000007',
      title: 'Tell us about your household',
      position: 6,
      questions: [
        {
          id: '10000000-0000-4000-b000-000000000006',
          type: 'number',
          label: 'How many people will be living in the home?',
          placeholder: 'e.g., 2',
          required: true,
          position: 0,
          validation: { min: 1 },
          scoring: { weight: 0 },
        },
        {
          id: '10000000-0000-4000-b000-000000000007',
          type: 'radio',
          label: 'Do you have pets?',
          required: false,
          position: 1,
          options: [
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
          ],
          scoring: { weight: 0 },
        },
      ],
    },
    {
      id: '10000000-0000-4000-a000-000000000008',
      title: 'Anything we should know?',
      description: 'This step is optional. Share anything that might help.',
      position: 7,
      questions: [
        {
          id: '10000000-0000-4000-b000-000000000008',
          type: 'textarea',
          label: 'Additional notes',
          placeholder: 'Special requirements, preferences, questions...',
          required: false,
          position: 0,
          validation: { maxLength: 4000 },
          scoring: { weight: 0 },
        },
      ],
    },
    {
      id: '10000000-0000-4000-a000-000000000009',
      title: 'If you find the right place, are you ready to move forward?',
      position: 8,
      questions: [
        {
          id: '10000000-0000-4000-b000-000000000009',
          type: 'radio',
          label: 'Readiness level',
          required: true,
          position: 0,
          options: [
            { value: 'ready', label: 'Yes, ready now', scoreValue: 10 },
            { value: 'maybe', label: 'Maybe', scoreValue: 5 },
            { value: 'exploring', label: 'Just exploring', scoreValue: 2 },
          ],
          scoring: {
            weight: 9,
            mappings: [
              { value: 'ready', points: 10 },
              { value: 'maybe', points: 5 },
              { value: 'exploring', points: 2 },
            ],
          },
        },
      ],
    },
  ],
};

// ── Default Buyer Form Config ──
// Maps the current hardcoded BUYER_STEPS from application-form.tsx into IntakeFormConfig format

export const DEFAULT_BUYER_FORM_CONFIG: IntakeFormConfig = {
  version: 1,
  leadType: 'buyer',
  sections: [
    {
      id: '20000000-0000-4000-a000-000000000001',
      title: "Let's start with the basics",
      description: 'We just need a few details to get going.',
      position: 0,
      questions: generateSystemFields(),
    },
    {
      id: '20000000-0000-4000-a000-000000000002',
      title: "What's your budget?",
      position: 1,
      questions: [
        {
          id: '20000000-0000-4000-b000-000000000001',
          type: 'radio',
          label: 'Budget range',
          required: true,
          position: 0,
          options: [
            { value: 'under_200k', label: 'Under $200K' },
            { value: '200k_350k', label: '$200K - $350K' },
            { value: '350k_500k', label: '$350K - $500K' },
            { value: '500k_750k', label: '$500K - $750K' },
            { value: '750k_1m', label: '$750K - $1M' },
            { value: '1m_plus', label: '$1M+' },
          ],
          scoring: {
            weight: 6,
            mappings: [
              { value: 'under_200k', points: 4 },
              { value: '200k_350k', points: 6 },
              { value: '350k_500k', points: 7 },
              { value: '500k_750k', points: 8 },
              { value: '750k_1m', points: 9 },
              { value: '1m_plus', points: 10 },
            ],
          },
        },
      ],
    },
    {
      id: '20000000-0000-4000-a000-000000000003',
      title: 'Are you pre-approved for a mortgage?',
      position: 2,
      questions: [
        {
          id: '20000000-0000-4000-b000-000000000002',
          type: 'radio',
          label: 'Pre-approval status',
          required: false,
          position: 0,
          options: [
            { value: 'yes', label: 'Yes', scoreValue: 10 },
            { value: 'no', label: 'No', scoreValue: 3 },
            { value: 'not-yet', label: 'Not yet', scoreValue: 5 },
          ],
          scoring: {
            weight: 8,
            mappings: [
              { value: 'yes', points: 10 },
              { value: 'no', points: 3 },
              { value: 'not-yet', points: 5 },
            ],
          },
        },
        {
          id: '20000000-0000-4000-b000-000000000003',
          type: 'text',
          label: 'Lender name',
          placeholder: 'e.g., Chase, Wells Fargo',
          required: false,
          position: 1,
          visibleWhen: {
            questionId: '20000000-0000-4000-b000-000000000002',
            operator: 'equals',
            value: 'yes',
          },
          scoring: { weight: 0 },
        },
        {
          id: '20000000-0000-4000-b000-000000000004',
          type: 'text',
          label: 'Pre-approval amount',
          placeholder: 'e.g., $400,000',
          required: false,
          position: 2,
          visibleWhen: {
            questionId: '20000000-0000-4000-b000-000000000002',
            operator: 'equals',
            value: 'yes',
          },
          scoring: { weight: 0 },
        },
      ],
    },
    {
      id: '20000000-0000-4000-a000-000000000004',
      title: 'What type of property are you looking for?',
      position: 3,
      questions: [
        {
          id: '20000000-0000-4000-b000-000000000005',
          type: 'radio',
          label: 'Property type',
          required: true,
          position: 0,
          options: [
            { value: 'single-family', label: 'Single Family' },
            { value: 'condo', label: 'Condo / Apartment' },
            { value: 'townhouse', label: 'Townhouse' },
            { value: 'multi-family', label: 'Multi-Family' },
          ],
          scoring: { weight: 0 },
        },
        {
          id: '20000000-0000-4000-b000-000000000006',
          type: 'radio',
          label: 'Bedrooms needed',
          required: false,
          position: 1,
          options: [
            { value: '1', label: '1' },
            { value: '2', label: '2' },
            { value: '3', label: '3' },
            { value: '4', label: '4' },
            { value: '5+', label: '5+' },
          ],
          scoring: { weight: 0 },
        },
        {
          id: '20000000-0000-4000-b000-000000000007',
          type: 'radio',
          label: 'Bathrooms needed',
          required: false,
          position: 2,
          options: [
            { value: '1', label: '1' },
            { value: '2', label: '2' },
            { value: '3+', label: '3+' },
          ],
          scoring: { weight: 0 },
        },
      ],
    },
    {
      id: '20000000-0000-4000-a000-000000000005',
      title: 'Any must-haves?',
      description: 'Select all that apply.',
      position: 4,
      questions: [
        {
          id: '20000000-0000-4000-b000-000000000008',
          type: 'multi_select',
          label: 'Must-have features',
          required: false,
          position: 0,
          options: [
            { value: 'garage', label: 'Garage' },
            { value: 'yard', label: 'Yard' },
            { value: 'pool', label: 'Pool' },
            { value: 'updated-kitchen', label: 'Updated Kitchen' },
            { value: 'home-office', label: 'Home Office' },
            { value: 'storage', label: 'Storage' },
            { value: 'washer-dryer', label: 'Washer/Dryer' },
            { value: 'accessibility', label: 'Accessibility Features' },
          ],
          scoring: { weight: 0 },
        },
      ],
    },
    {
      id: '20000000-0000-4000-a000-000000000006',
      title: 'When do you want to close?',
      position: 5,
      questions: [
        {
          id: '20000000-0000-4000-b000-000000000009',
          type: 'radio',
          label: 'Timeline',
          required: true,
          position: 0,
          options: [
            { value: 'asap', label: 'ASAP (within 30 days)', scoreValue: 10 },
            { value: '1-3months', label: '1-3 months', scoreValue: 7 },
            { value: '3-6months', label: '3-6 months', scoreValue: 4 },
            { value: 'exploring', label: 'Just exploring', scoreValue: 2 },
          ],
          scoring: {
            weight: 8,
            mappings: [
              { value: 'asap', points: 10 },
              { value: '1-3months', points: 7 },
              { value: '3-6months', points: 4 },
              { value: 'exploring', points: 2 },
            ],
          },
        },
      ],
    },
    {
      id: '20000000-0000-4000-a000-000000000007',
      title: 'Tell us about you',
      position: 6,
      questions: [
        {
          id: '20000000-0000-4000-b000-000000000010',
          type: 'radio',
          label: 'Current housing situation',
          required: false,
          position: 0,
          options: [
            { value: 'renting', label: 'Currently renting' },
            { value: 'own', label: 'Own a home' },
            { value: 'family', label: 'Living with family' },
            { value: 'other', label: 'Other' },
          ],
          scoring: { weight: 0 },
        },
        {
          id: '20000000-0000-4000-b000-000000000011',
          type: 'radio',
          label: 'First-time buyer?',
          required: false,
          position: 1,
          options: [
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
          ],
          scoring: { weight: 0 },
        },
      ],
    },
    {
      id: '20000000-0000-4000-a000-000000000008',
      title: 'If you find the right place, are you ready to move forward?',
      position: 7,
      questions: [
        {
          id: '20000000-0000-4000-b000-000000000012',
          type: 'radio',
          label: 'Readiness level',
          required: true,
          position: 0,
          options: [
            { value: 'ready', label: 'Yes, ready now', scoreValue: 10 },
            { value: 'maybe', label: 'Maybe', scoreValue: 5 },
            { value: 'exploring', label: 'Just exploring', scoreValue: 2 },
          ],
          scoring: {
            weight: 9,
            mappings: [
              { value: 'ready', points: 10 },
              { value: 'maybe', points: 5 },
              { value: 'exploring', points: 2 },
            ],
          },
        },
      ],
    },
  ],
};

// ── Validation (delegates to the canonical Zod schema) ──

/** Re-export the canonical validation schema from form-config-schema.ts */
export { formConfigSchema } from '@/lib/form-config-schema';

/** Validate an unknown value as a valid IntakeFormConfig */
export function validateFormConfig(config: unknown) {
  return formConfigSchema.safeParse(config);
}

// ── Form config fetching with fallback chain ──

/**
 * Fetches the form config for a given space, with the following fallback chain:
 * 1. If SpaceSetting.formConfig is set and formConfigSource is 'custom', use it
 * 2. If formConfigSource is 'brokerage', fetch from the linked Brokerage.brokerageFormConfig
 * 3. Otherwise (formConfigSource is 'legacy' or formConfig is null), return null (legacy mode)
 */
export async function getFormConfig(
  spaceId: string
): Promise<IntakeFormConfig | null> {
  // Fetch the space setting with its form config
  const { data: setting, error: settingError } = await supabase
    .from('SpaceSetting')
    .select('"formConfig", "formConfigSource"')
    .eq('spaceId', spaceId)
    .single();

  if (settingError || !setting) {
    return null; // legacy mode
  }

  const source = setting.formConfigSource as string;

  // Custom form: use the space-level config directly
  if (source === 'custom' && setting.formConfig) {
    const result = formConfigSchema.safeParse(setting.formConfig);
    return result.success ? result.data : null;
  }

  // Brokerage-inherited form: fetch from the linked brokerage
  if (source === 'brokerage') {
    const { data: space } = await supabase
      .from('Space')
      .select('"brokerageId"')
      .eq('id', spaceId)
      .single();

    if (space?.brokerageId) {
      const { data: brokerage } = await supabase
        .from('Brokerage')
        .select('"brokerageFormConfig"')
        .eq('id', space.brokerageId)
        .single();

      if (brokerage?.brokerageFormConfig) {
        const result = formConfigSchema.safeParse(
          brokerage.brokerageFormConfig
        );
        return result.success ? result.data : null;
      }
    }

    // Brokerage config missing: fall back to legacy
    return null;
  }

  // Legacy mode (explicit or implicit)
  return null;
}

/**
 * Returns the appropriate default form config for a given lead type.
 * Used as fallback when getFormConfig returns null (legacy mode).
 */
export function getDefaultFormConfig(
  leadType: 'rental' | 'buyer'
): IntakeFormConfig {
  return leadType === 'buyer'
    ? DEFAULT_BUYER_FORM_CONFIG
    : DEFAULT_RENTAL_FORM_CONFIG;
}

// ── Snapshot for submissions ──

/**
 * Creates a deep-frozen copy of a form config for storing with submissions.
 * This ensures the form structure at the time of submission is preserved
 * even if the form is later modified.
 */
export function snapshotFormConfig(config: IntakeFormConfig): IntakeFormConfig {
  // Deep clone via structured clone (available in Node 17+ / all modern browsers)
  const snapshot: IntakeFormConfig = JSON.parse(JSON.stringify(config));
  return Object.freeze(snapshot) as IntakeFormConfig;
}
