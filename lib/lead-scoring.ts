import OpenAI from 'openai';
import { z } from 'zod';
import type { ApplicationData, LeadScoreDetails } from '@/lib/types';

export type LeadScoringResult = {
  scoringStatus: 'scored' | 'failed' | 'pending';
  leadScore: number | null;
  scoreLabel: string;
  scoreSummary: string | null;
  scoreDetails: LeadScoreDetails | null;
};

// ── Zod schema for the structured AI response ──
const scoreDetailsSchema = z.object({
  score: z.number(),
  priorityTier: z.enum(['hot', 'warm', 'cold', 'unqualified']),
  qualificationStatus: z.string(),
  readinessStatus: z.string(),
  confidence: z.number(),
  summary: z.string(),
  explanationTags: z.array(z.string()),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  riskFlags: z.array(z.string()),
  missingInformation: z.array(z.string()),
  recommendedNextAction: z.string(),
  leadState: z.string(),
});

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY missing');
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function buildScoringPrompt(input: {
  name: string;
  email: string | null;
  phone: string;
  budget: number | null;
  applicationData: ApplicationData | null;
}) {
  const app = input.applicationData;
  const lines = [
    'You are scoring a U.S. renter leasing lead for a real estate agent.',
    'Answer: "Is this lead worth acting on right now, and why?"',
    '',
    'Score 0-100 where higher = higher follow-up priority.',
    'Priority tier rules: hot (75-100), warm (45-74), cold (20-44), unqualified (0-19).',
    '',
    'Score using these grounded criteria:',
    '- Rent affordability: income vs target rent (3x rent rule)',
    '- Move-in timing urgency',
    '- Employment stability',
    '- Household size fit',
    '- Rental history quality (evictions, late payments, violations)',
    '- Document and application completeness',
    '- Screening flags (bankruptcy, outstanding balances)',
    '- Pet considerations',
    '- Consistency of answers',
    '',
    'APPLICANT DATA:',
    `Name: ${input.name}`,
    `Email: ${input.email ?? 'N/A'}`,
    `Phone: ${input.phone}`,
  ];

  if (app) {
    lines.push('');
    lines.push('--- APPLICATION DETAILS ---');
    if (app.propertyAddress) lines.push(`Property: ${app.propertyAddress}`);
    if (app.unitType) lines.push(`Unit type: ${app.unitType}`);
    if (app.targetMoveInDate) lines.push(`Target move-in: ${app.targetMoveInDate}`);
    if (app.monthlyRent != null) lines.push(`Monthly rent: $${app.monthlyRent}`);
    if (app.leaseTermPreference) lines.push(`Lease term: ${app.leaseTermPreference}`);
    if (app.numberOfOccupants != null) lines.push(`Occupants: ${app.numberOfOccupants}`);
    if (app.dateOfBirth) lines.push(`DOB: ${app.dateOfBirth}`);

    lines.push('');
    lines.push('CURRENT LIVING:');
    if (app.currentAddress) lines.push(`Address: ${app.currentAddress}`);
    if (app.currentHousingStatus) lines.push(`Status: ${app.currentHousingStatus}`);
    if (app.currentMonthlyPayment != null) lines.push(`Current payment: $${app.currentMonthlyPayment}/mo`);
    if (app.lengthOfResidence) lines.push(`Length: ${app.lengthOfResidence}`);
    if (app.reasonForMoving) lines.push(`Reason for moving: ${app.reasonForMoving}`);

    lines.push('');
    lines.push('HOUSEHOLD:');
    if (app.adultsOnApplication != null) lines.push(`Adults: ${app.adultsOnApplication}`);
    if (app.childrenOrDependents != null) lines.push(`Children/dependents: ${app.childrenOrDependents}`);
    if (app.coRenters) lines.push(`Co-renters: ${app.coRenters}`);

    lines.push('');
    lines.push('INCOME:');
    if (app.employmentStatus) lines.push(`Employment: ${app.employmentStatus}`);
    if (app.employerOrSource) lines.push(`Employer/source: ${app.employerOrSource}`);
    if (app.monthlyGrossIncome != null) lines.push(`Monthly gross income: $${app.monthlyGrossIncome}`);
    if (app.additionalIncome != null) lines.push(`Additional income: $${app.additionalIncome}`);

    lines.push('');
    lines.push('RENTAL HISTORY:');
    if (app.currentLandlordName) lines.push(`Current landlord: ${app.currentLandlordName} ${app.currentLandlordPhone ?? ''}`);
    if (app.previousLandlordName) lines.push(`Previous landlord: ${app.previousLandlordName} ${app.previousLandlordPhone ?? ''}`);
    if (app.currentRentPaid != null) lines.push(`Rent paid: $${app.currentRentPaid}/mo`);
    if (app.latePayments != null) lines.push(`Late payments: ${app.latePayments ? 'Yes' : 'No'}`);
    if (app.leaseViolations != null) lines.push(`Lease violations: ${app.leaseViolations ? 'Yes' : 'No'}`);
    if (app.permissionToContactReferences != null) lines.push(`Permission to contact refs: ${app.permissionToContactReferences ? 'Yes' : 'No'}`);

    lines.push('');
    lines.push('SCREENING:');
    if (app.priorEvictions != null) lines.push(`Prior evictions: ${app.priorEvictions ? 'Yes' : 'No'}`);
    if (app.outstandingBalances != null) lines.push(`Outstanding balances: ${app.outstandingBalances ? 'Yes' : 'No'}`);
    if (app.bankruptcy != null) lines.push(`Bankruptcy: ${app.bankruptcy ? 'Yes' : 'No'}`);
    if (app.smoking != null) lines.push(`Smoking: ${app.smoking ? 'Yes' : 'No'}`);
    if (app.hasPets != null) lines.push(`Pets: ${app.hasPets ? 'Yes' : 'No'}${app.petDetails ? ` (${app.petDetails})` : ''}`);

    if (app.additionalNotes) {
      lines.push('');
      lines.push(`NOTES: ${app.additionalNotes}`);
    }

    const totalFields = 30;
    const filled = [
      app.propertyAddress, app.unitType, app.targetMoveInDate, app.monthlyRent,
      app.leaseTermPreference, app.numberOfOccupants, app.dateOfBirth,
      app.currentAddress, app.currentHousingStatus, app.currentMonthlyPayment,
      app.lengthOfResidence, app.reasonForMoving,
      app.adultsOnApplication, app.childrenOrDependents,
      app.employmentStatus, app.employerOrSource, app.monthlyGrossIncome,
      app.currentLandlordName, app.currentRentPaid,
      app.priorEvictions, app.outstandingBalances, app.bankruptcy,
      app.smoking, app.hasPets,
      app.consentToScreening, app.truthfulnessCertification, app.electronicSignature,
      app.emergencyContactName, app.coRenters, app.additionalIncome,
    ].filter((v) => v != null && v !== '').length;
    lines.push('');
    lines.push(`APPLICATION COMPLETENESS: ${Math.round((filled / totalFields) * 100)}% (${filled}/${totalFields} fields)`);
  } else {
    if (input.budget != null) lines.push(`Monthly budget: $${input.budget}`);
    lines.push('APPLICATION COMPLETENESS: Minimal (basic contact info only)');
  }

  return lines.join('\n');
}

function tierToLabel(tier: string): 'hot' | 'warm' | 'cold' | 'unscored' {
  if (tier === 'hot') return 'hot';
  if (tier === 'warm') return 'warm';
  if (tier === 'cold' || tier === 'unqualified') return 'cold';
  return 'unscored';
}

export async function scoreLeadApplication(input: {
  contactId: string;
  name: string;
  email: string | null;
  phone: string;
  budget: number | null;
  applicationData: ApplicationData | null;
}): Promise<LeadScoringResult> {
  console.info('[lead-scoring] start', { contactId: input.contactId });

  try {
    const openai = getOpenAIClient();
    const prompt = buildScoringPrompt(input);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'lead_scoring',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              score: { type: 'number' },
              priorityTier: { type: 'string', enum: ['hot', 'warm', 'cold', 'unqualified'] },
              qualificationStatus: { type: 'string' },
              readinessStatus: { type: 'string' },
              confidence: { type: 'number' },
              summary: { type: 'string' },
              explanationTags: { type: 'array', items: { type: 'string' } },
              strengths: { type: 'array', items: { type: 'string' } },
              weaknesses: { type: 'array', items: { type: 'string' } },
              riskFlags: { type: 'array', items: { type: 'string' } },
              missingInformation: { type: 'array', items: { type: 'string' } },
              recommendedNextAction: { type: 'string' },
              leadState: { type: 'string' },
            },
            required: [
              'score', 'priorityTier', 'qualificationStatus', 'readinessStatus',
              'confidence', 'summary', 'explanationTags', 'strengths', 'weaknesses',
              'riskFlags', 'missingInformation', 'recommendedNextAction', 'leadState',
            ],
          },
        },
      },
      messages: [
        {
          role: 'system',
          content: [
            'You are a lead qualification assistant for a real estate rental CRM.',
            'Evaluate the renter applicant and return structured JSON.',
            'All assessments must be grounded in the actual application answers provided.',
            'Do not guess or fabricate information. If data is missing, note it in missingInformation.',
            'Keep summary under 200 characters. Keep all string arrays concise (max 5 items each).',
            'leadState must be one of: high_priority_qualified_renter, qualified_low_urgency, incomplete_application, needs_additional_info, likely_unqualified.',
          ].join(' '),
        },
        { role: 'user', content: prompt },
      ],
    });

    const raw = response.choices?.[0]?.message?.content;
    if (!raw) {
      console.error('[lead-scoring] empty model response', { contactId: input.contactId });
      return failedResult();
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch (error) {
      console.error('[lead-scoring] invalid JSON', { contactId: input.contactId, error });
      return failedResult();
    }

    const parsed = scoreDetailsSchema.safeParse(parsedJson);
    if (!parsed.success) {
      console.error('[lead-scoring] schema validation failed', {
        contactId: input.contactId,
        issues: parsed.error.issues,
      });
      return failedResult();
    }

    const details = parsed.data;
    const clampedScore = Math.max(0, Math.min(100, Math.round(details.score)));
    const clampedConfidence = Math.max(0, Math.min(1, details.confidence));

    console.info('[lead-scoring] success', {
      contactId: input.contactId,
      score: clampedScore,
      tier: details.priorityTier,
      leadState: details.leadState,
    });

    return {
      scoringStatus: 'scored',
      leadScore: clampedScore,
      scoreLabel: tierToLabel(details.priorityTier),
      scoreSummary: details.summary.slice(0, 300),
      scoreDetails: {
        ...details,
        score: clampedScore,
        confidence: clampedConfidence,
      },
    };
  } catch (error) {
    console.error('[lead-scoring] provider call failed', { contactId: input.contactId, error });
    return failedResult();
  }
}

function failedResult(): LeadScoringResult {
  return {
    scoringStatus: 'failed',
    leadScore: null,
    scoreLabel: 'unscored',
    scoreSummary: 'Scoring unavailable right now. Lead saved successfully.',
    scoreDetails: null,
  };
}
