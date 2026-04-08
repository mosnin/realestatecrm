import type { IntakeFormConfig } from './types';

function id() {
  return crypto.randomUUID();
}

export const RENTAL_TEMPLATE: IntakeFormConfig = {
  version: 1,
  leadType: 'rental',
  sections: [
    {
      id: id(),
      title: 'About You',
      description: 'Basic contact information',
      position: 0,
      questions: [
        {
          id: id(),
          type: 'text',
          label: 'Full Name',
          placeholder: 'Jane Doe',
          required: true,
          position: 0,
          system: true,
        },
        {
          id: id(),
          type: 'email',
          label: 'Email Address',
          placeholder: 'name@example.com',
          required: true,
          position: 1,
          system: true,
        },
        {
          id: id(),
          type: 'phone',
          label: 'Phone Number',
          placeholder: '(555) 123-4567',
          required: true,
          position: 2,
          system: true,
        },
      ],
    },
    {
      id: id(),
      title: 'Rental Details',
      description: 'Tell us about your ideal rental',
      position: 1,
      questions: [
        {
          id: id(),
          type: 'date',
          label: 'Desired Move-in Date',
          required: true,
          position: 0,
        },
        {
          id: id(),
          type: 'number',
          label: 'Monthly Budget',
          placeholder: '2000',
          required: true,
          position: 1,
        },
        {
          id: id(),
          type: 'select',
          label: 'Number of Bedrooms',
          required: true,
          position: 2,
          options: [
            { value: 'studio', label: 'Studio' },
            { value: '1br', label: '1 Bedroom' },
            { value: '2br', label: '2 Bedrooms' },
            { value: '3br', label: '3 Bedrooms' },
            { value: '4br+', label: '4+ Bedrooms' },
          ],
        },
        {
          id: id(),
          type: 'select',
          label: 'Lease Length',
          required: false,
          position: 3,
          options: [
            { value: 'month_to_month', label: 'Month-to-month' },
            { value: '6_months', label: '6 months' },
            { value: '12_months', label: '12 months' },
            { value: '24_months', label: '24 months' },
          ],
        },
      ],
    },
    {
      id: id(),
      title: 'Background',
      description: 'Employment and rental history',
      position: 2,
      questions: [
        {
          id: id(),
          type: 'text',
          label: 'Current Employer',
          placeholder: 'Company name',
          required: false,
          position: 0,
        },
        {
          id: id(),
          type: 'number',
          label: 'Annual Income',
          placeholder: '60000',
          required: false,
          position: 1,
        },
        {
          id: id(),
          type: 'radio',
          label: 'Have you been evicted before?',
          required: true,
          position: 2,
          options: [
            { value: 'no', label: 'No' },
            { value: 'yes', label: 'Yes' },
          ],
        },
        {
          id: id(),
          type: 'textarea',
          label: 'Additional Notes',
          placeholder: 'Anything else you would like us to know?',
          required: false,
          position: 3,
        },
      ],
    },
  ],
};

export const BUYER_TEMPLATE: IntakeFormConfig = {
  version: 1,
  leadType: 'buyer',
  sections: [
    {
      id: id(),
      title: 'About You',
      description: 'Basic contact information',
      position: 0,
      questions: [
        {
          id: id(),
          type: 'text',
          label: 'Full Name',
          placeholder: 'Jane Doe',
          required: true,
          position: 0,
          system: true,
        },
        {
          id: id(),
          type: 'email',
          label: 'Email Address',
          placeholder: 'name@example.com',
          required: true,
          position: 1,
          system: true,
        },
        {
          id: id(),
          type: 'phone',
          label: 'Phone Number',
          placeholder: '(555) 123-4567',
          required: true,
          position: 2,
          system: true,
        },
      ],
    },
    {
      id: id(),
      title: 'Budget & Pre-Approval',
      description: 'Your financial details',
      position: 1,
      questions: [
        {
          id: id(),
          type: 'number',
          label: 'Maximum Budget',
          placeholder: '500000',
          required: true,
          position: 0,
        },
        {
          id: id(),
          type: 'radio',
          label: 'Pre-approved for a mortgage?',
          required: true,
          position: 1,
          options: [
            { value: 'yes', label: 'Yes' },
            { value: 'no', label: 'No' },
            { value: 'in_progress', label: 'In progress' },
          ],
        },
        {
          id: id(),
          type: 'number',
          label: 'Down Payment Amount',
          placeholder: '100000',
          required: false,
          position: 2,
        },
      ],
    },
    {
      id: id(),
      title: 'Property Preferences',
      description: 'What are you looking for?',
      position: 2,
      questions: [
        {
          id: id(),
          type: 'select',
          label: 'Property Type',
          required: true,
          position: 0,
          options: [
            { value: 'single_family', label: 'Single Family Home' },
            { value: 'condo', label: 'Condo / Apartment' },
            { value: 'townhouse', label: 'Townhouse' },
            { value: 'multi_family', label: 'Multi-Family' },
            { value: 'land', label: 'Land' },
          ],
        },
        {
          id: id(),
          type: 'select',
          label: 'Bedrooms',
          required: true,
          position: 1,
          options: [
            { value: '1', label: '1+' },
            { value: '2', label: '2+' },
            { value: '3', label: '3+' },
            { value: '4', label: '4+' },
            { value: '5', label: '5+' },
          ],
        },
        {
          id: id(),
          type: 'text',
          label: 'Preferred Neighborhoods',
          placeholder: 'Downtown, Midtown, etc.',
          required: false,
          position: 2,
        },
        {
          id: id(),
          type: 'select',
          label: 'Timeline',
          required: true,
          position: 3,
          options: [
            { value: 'asap', label: 'As soon as possible' },
            { value: '1_3_months', label: '1-3 months' },
            { value: '3_6_months', label: '3-6 months' },
            { value: '6_plus', label: '6+ months' },
            { value: 'just_browsing', label: 'Just browsing' },
          ],
        },
        {
          id: id(),
          type: 'textarea',
          label: 'Additional Notes',
          placeholder: 'Any must-haves, deal-breakers, or other details?',
          required: false,
          position: 4,
        },
      ],
    },
  ],
};

export const BLANK_TEMPLATE: IntakeFormConfig = {
  version: 1,
  leadType: 'general',
  sections: [
    {
      id: id(),
      title: 'Contact Information',
      description: 'Basic contact details',
      position: 0,
      questions: [
        {
          id: id(),
          type: 'text',
          label: 'Full Name',
          placeholder: 'Jane Doe',
          required: true,
          position: 0,
          system: true,
        },
        {
          id: id(),
          type: 'email',
          label: 'Email Address',
          placeholder: 'name@example.com',
          required: true,
          position: 1,
          system: true,
        },
        {
          id: id(),
          type: 'phone',
          label: 'Phone Number',
          placeholder: '(555) 123-4567',
          required: true,
          position: 2,
          system: true,
        },
      ],
    },
  ],
};

export const TEMPLATES = {
  rental: { label: 'Rental', config: RENTAL_TEMPLATE },
  buyer: { label: 'Buyer', config: BUYER_TEMPLATE },
  blank: { label: 'Blank', config: BLANK_TEMPLATE },
} as const;

export type TemplateName = keyof typeof TEMPLATES;
