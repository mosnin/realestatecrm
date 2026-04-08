import type { IntakeFormConfig } from './types';

function id() {
  return crypto.randomUUID();
}

// ─────────────────────────────────────────────────────────────────────────────
// RENTAL TEMPLATE — matches the legacy rental intake form in application-form.tsx
// ─────────────────────────────────────────────────────────────────────────────

export const RENTAL_TEMPLATE: IntakeFormConfig = {
  version: 1,
  leadType: 'rental',
  sections: [
    // ── 1. Getting Started ──
    {
      id: id(),
      title: 'Getting Started',
      description: 'What are you looking for?',
      position: 0,
      questions: [
        {
          id: id(),
          type: 'radio',
          label: 'What are you looking for?',
          required: true,
          position: 0,
          options: [
            { value: 'rental', label: "I'm looking to rent" },
            { value: 'buyer', label: "I'm looking to buy" },
          ],
        },
      ],
    },

    // ── 2. Basics ──
    {
      id: id(),
      title: 'Basics',
      description: 'We just need a few details to get going.',
      position: 1,
      questions: [
        {
          id: 'name',
          type: 'text',
          label: 'Full Name',
          placeholder: 'Alex Johnson',
          required: true,
          position: 0,
          system: true,
        },
        {
          id: 'email',
          type: 'email',
          label: 'Email',
          placeholder: 'alex@email.com',
          required: true,
          position: 1,
          system: true,
        },
        {
          id: 'phone',
          type: 'phone',
          label: 'Phone',
          placeholder: '(555) 123-4567',
          required: true,
          position: 2,
          system: true,
        },
      ],
    },

    // ── 3. Move Timing ──
    {
      id: id(),
      title: 'Move Timing',
      position: 2,
      questions: [
        {
          id: id(),
          type: 'radio',
          label: 'When are you planning to move?',
          required: true,
          position: 0,
          scoring: { weight: 8 },
          options: [
            { value: 'asap', label: 'ASAP (within 2 weeks)' },
            { value: '30days', label: 'Within 30 days' },
            { value: '1-2months', label: '1-2 months' },
            { value: 'browsing', label: 'Just browsing' },
          ],
        },
      ],
    },

    // ── 4. Location ──
    {
      id: id(),
      title: 'Location',
      position: 3,
      questions: [
        {
          id: id(),
          type: 'text',
          label: 'Where are you looking to live?',
          placeholder: 'e.g., Downtown Miami, Brickell',
          required: true,
          position: 0,
        },
      ],
    },

    // ── 5. Budget ──
    {
      id: id(),
      title: 'Budget',
      position: 4,
      questions: [
        {
          id: id(),
          type: 'radio',
          label: "What's your monthly rent budget?",
          required: true,
          position: 0,
          scoring: {
            weight: 6,
            mappings: [
              { value: 'under_1500', points: 2 },
              { value: '1500_2000', points: 4 },
              { value: '2000_2500', points: 6 },
              { value: '2500_3500', points: 8 },
              { value: '3500_plus', points: 10 },
            ],
          },
          options: [
            { value: 'under_1500', label: 'Under $1,500' },
            { value: '1500_2000', label: '$1,500 - $2,000' },
            { value: '2000_2500', label: '$2,000 - $2,500' },
            { value: '2500_3500', label: '$2,500 - $3,500' },
            { value: '3500_plus', label: '$3,500+' },
          ],
        },
      ],
    },

    // ── 6. Income ──
    {
      id: id(),
      title: 'Income',
      position: 5,
      questions: [
        {
          id: id(),
          type: 'radio',
          label: "What's your estimated monthly income?",
          required: true,
          position: 0,
          scoring: { weight: 7 },
          options: [
            { value: 'under_2000', label: 'Under $2,000' },
            { value: '2000_3000', label: '$2,000 - $3,000' },
            { value: '3000_4000', label: '$3,000 - $4,000' },
            { value: '4000_6000', label: '$4,000 - $6,000' },
            { value: '6000_plus', label: '$6,000+' },
          ],
        },
      ],
    },

    // ── 7. Employment ──
    {
      id: id(),
      title: 'Employment',
      position: 6,
      questions: [
        {
          id: id(),
          type: 'radio',
          label: "What's your current work situation?",
          required: true,
          position: 0,
          scoring: { weight: 5 },
          options: [
            { value: 'full-time', label: 'Full-time employed' },
            { value: 'self-employed', label: 'Self-employed' },
            { value: 'part-time', label: 'Part-time employed' },
            { value: 'student', label: 'Student' },
            { value: 'not-employed', label: 'Not currently employed' },
          ],
        },
      ],
    },

    // ── 8. Household ──
    {
      id: id(),
      title: 'Household',
      position: 7,
      questions: [
        {
          id: id(),
          type: 'number',
          label: 'How many people will be living in the home?',
          placeholder: 'e.g., 2',
          required: true,
          position: 0,
          validation: { min: 1 },
        },
        {
          id: id(),
          type: 'radio',
          label: 'Do you have pets?',
          required: false,
          position: 1,
          options: [
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
          ],
        },
      ],
    },

    // ── 9. Additional Info ──
    {
      id: id(),
      title: 'Additional Info',
      description: 'This step is optional. Share anything that might help.',
      position: 8,
      questions: [
        {
          id: id(),
          type: 'textarea',
          label: 'Anything we should know?',
          placeholder: 'Special requirements, preferences, questions...',
          required: false,
          position: 0,
        },
      ],
    },

    // ── 10. Ready? ──
    {
      id: id(),
      title: 'Ready?',
      position: 9,
      questions: [
        {
          id: id(),
          type: 'radio',
          label: 'If you find the right place, are you ready to move forward?',
          required: true,
          position: 0,
          scoring: { weight: 9 },
          options: [
            { value: 'ready', label: 'Yes, ready now', scoreValue: 10 },
            { value: 'maybe', label: 'Maybe', scoreValue: 5 },
            { value: 'exploring', label: 'Just exploring', scoreValue: 2 },
          ],
        },
      ],
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// BUYER TEMPLATE — matches the legacy buyer intake form in application-form.tsx
// ─────────────────────────────────────────────────────────────────────────────

export const BUYER_TEMPLATE: IntakeFormConfig = {
  version: 1,
  leadType: 'buyer',
  sections: [
    // ── 1. Getting Started ──
    {
      id: id(),
      title: 'Getting Started',
      description: 'What are you looking for?',
      position: 0,
      questions: [
        {
          id: id(),
          type: 'radio',
          label: 'What are you looking for?',
          required: true,
          position: 0,
          options: [
            { value: 'rental', label: "I'm looking to rent" },
            { value: 'buyer', label: "I'm looking to buy" },
          ],
        },
      ],
    },

    // ── 2. Basics ──
    {
      id: id(),
      title: 'Basics',
      description: 'We just need a few details to get going.',
      position: 1,
      questions: [
        {
          id: 'name',
          type: 'text',
          label: 'Full Name',
          placeholder: 'Alex Johnson',
          required: true,
          position: 0,
          system: true,
        },
        {
          id: 'email',
          type: 'email',
          label: 'Email',
          placeholder: 'alex@email.com',
          required: true,
          position: 1,
          system: true,
        },
        {
          id: 'phone',
          type: 'phone',
          label: 'Phone',
          placeholder: '(555) 123-4567',
          required: true,
          position: 2,
          system: true,
        },
      ],
    },

    // ── 3. Budget ──
    {
      id: id(),
      title: 'Budget',
      position: 2,
      questions: [
        {
          id: id(),
          type: 'radio',
          label: "What's your budget?",
          required: true,
          position: 0,
          scoring: { weight: 6 },
          options: [
            { value: 'under_200k', label: 'Under $200K' },
            { value: '200k_350k', label: '$200K - $350K' },
            { value: '350k_500k', label: '$350K - $500K' },
            { value: '500k_750k', label: '$500K - $750K' },
            { value: '750k_1m', label: '$750K - $1M' },
            { value: '1m_plus', label: '$1M+' },
          ],
        },
      ],
    },

    // ── 4. Pre-Approval ──
    {
      id: id(),
      title: 'Pre-Approval',
      position: 3,
      questions: [
        {
          id: 'preApproval',
          type: 'radio',
          label: 'Are you pre-approved for a mortgage?',
          required: false,
          position: 0,
          scoring: { weight: 8 },
          options: [
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
            { value: 'not-yet', label: 'Not yet' },
          ],
        },
        {
          id: id(),
          type: 'text',
          label: 'Lender name',
          placeholder: 'e.g., Chase, Wells Fargo',
          required: false,
          position: 1,
          visibleWhen: { questionId: 'preApproval', operator: 'equals', value: 'yes' },
        },
        {
          id: id(),
          type: 'text',
          label: 'Pre-approval amount',
          placeholder: 'e.g., $400,000',
          required: false,
          position: 2,
          visibleWhen: { questionId: 'preApproval', operator: 'equals', value: 'yes' },
        },
      ],
    },

    // ── 5. Property ──
    {
      id: id(),
      title: 'Property',
      position: 4,
      questions: [
        {
          id: id(),
          type: 'radio',
          label: 'What type of property are you looking for?',
          required: true,
          position: 0,
          options: [
            { value: 'single-family', label: 'Single Family' },
            { value: 'condo', label: 'Condo / Apartment' },
            { value: 'townhouse', label: 'Townhouse' },
            { value: 'multi-family', label: 'Multi-Family' },
          ],
        },
        {
          id: id(),
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
        },
        {
          id: id(),
          type: 'radio',
          label: 'Bathrooms needed',
          required: false,
          position: 2,
          options: [
            { value: '1', label: '1' },
            { value: '2', label: '2' },
            { value: '3+', label: '3+' },
          ],
        },
      ],
    },

    // ── 6. Must-Haves ──
    {
      id: id(),
      title: 'Must-Haves',
      description: 'Select all that apply.',
      position: 5,
      questions: [
        {
          id: id(),
          type: 'multi_select',
          label: 'Any must-haves?',
          required: false,
          position: 0,
          options: [
            { value: 'garage', label: 'Garage' },
            { value: 'yard', label: 'Yard' },
            { value: 'pool', label: 'Pool' },
            { value: 'updated_kitchen', label: 'Updated Kitchen' },
            { value: 'home_office', label: 'Home Office' },
            { value: 'storage', label: 'Storage' },
            { value: 'washer_dryer', label: 'Washer/Dryer' },
            { value: 'accessibility', label: 'Accessibility Features' },
          ],
        },
      ],
    },

    // ── 7. Timeline ──
    {
      id: id(),
      title: 'Timeline',
      position: 6,
      questions: [
        {
          id: id(),
          type: 'radio',
          label: 'When do you want to close?',
          required: true,
          position: 0,
          scoring: { weight: 8 },
          options: [
            { value: 'asap', label: 'ASAP (within 30 days)' },
            { value: '1-3months', label: '1-3 months' },
            { value: '3-6months', label: '3-6 months' },
            { value: 'exploring', label: 'Just exploring' },
          ],
        },
      ],
    },

    // ── 8. About You ──
    {
      id: id(),
      title: 'About You',
      position: 7,
      questions: [
        {
          id: id(),
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
        },
        {
          id: id(),
          type: 'radio',
          label: 'First-time buyer?',
          required: false,
          position: 1,
          options: [
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
          ],
        },
      ],
    },

    // ── 9. Ready? ──
    {
      id: id(),
      title: 'Ready?',
      position: 8,
      questions: [
        {
          id: id(),
          type: 'radio',
          label: 'If you find the right place, are you ready to move forward?',
          required: true,
          position: 0,
          scoring: { weight: 9 },
          options: [
            { value: 'ready', label: 'Yes, ready now', scoreValue: 10 },
            { value: 'maybe', label: 'Maybe', scoreValue: 5 },
            { value: 'exploring', label: 'Just exploring', scoreValue: 2 },
          ],
        },
      ],
    },
  ],
};

export const TEMPLATES = {
  rental: { label: 'Rental Application', config: RENTAL_TEMPLATE },
  buyer: { label: 'Buyer Inquiry', config: BUYER_TEMPLATE },
} as const;

export type TemplateName = keyof typeof TEMPLATES;
