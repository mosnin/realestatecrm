import { describe, it, expect } from 'vitest';
import { tierToLabel, scoreDetailsSchema } from '@/lib/lead-scoring';

describe('tierToLabel', () => {
  it('maps hot to hot', () => {
    expect(tierToLabel('hot')).toBe('hot');
  });

  it('maps warm to warm', () => {
    expect(tierToLabel('warm')).toBe('warm');
  });

  it('maps cold to cold', () => {
    expect(tierToLabel('cold')).toBe('cold');
  });

  it('maps unqualified to cold', () => {
    expect(tierToLabel('unqualified')).toBe('cold');
  });

  it('maps unknown tier to unscored', () => {
    expect(tierToLabel('something-else')).toBe('unscored');
    expect(tierToLabel('')).toBe('unscored');
  });
});

const validScoreDetails = {
  score: 82,
  priorityTier: 'hot' as const,
  qualificationStatus: 'Fully qualified',
  readinessStatus: 'Ready to move',
  confidence: 0.9,
  summary: 'Strong applicant with stable income',
  explanationTags: ['high-income', 'good-history'],
  strengths: ['Stable employment', '3x rent ratio'],
  weaknesses: [],
  riskFlags: [],
  missingInformation: [],
  recommendedNextAction: 'Schedule showing',
  leadState: 'high_priority_qualified_renter',
};

describe('scoreDetailsSchema', () => {
  it('validates a complete valid object', () => {
    const result = scoreDetailsSchema.safeParse(validScoreDetails);
    expect(result.success).toBe(true);
  });

  it('rejects missing required fields', () => {
    const { score: _, ...withoutScore } = validScoreDetails;
    const result = scoreDetailsSchema.safeParse(withoutScore);
    expect(result.success).toBe(false);
  });

  it('rejects invalid priorityTier enum', () => {
    const result = scoreDetailsSchema.safeParse({ ...validScoreDetails, priorityTier: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('accepts all valid priorityTier values', () => {
    for (const tier of ['hot', 'warm', 'cold', 'unqualified']) {
      const result = scoreDetailsSchema.safeParse({ ...validScoreDetails, priorityTier: tier });
      expect(result.success).toBe(true);
    }
  });
});
