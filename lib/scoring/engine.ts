/**
 * Chippi Proprietary Lead Scoring Engine
 *
 * Deterministic, weighted scoring system for renter leasing leads.
 * Produces consistent scores across runs — no LLM dependency for the score itself.
 *
 * Architecture:
 *   1. Each scoring category computes a 0-1 normalized sub-score
 *   2. Sub-scores are multiplied by configurable weights (summing to 1.0)
 *   3. Risk flags apply multiplicative penalties
 *   4. Final score is 0-100 with tier assignment
 *   5. AI enhancement (optional) adds qualitative summary + recommendations
 */

import type { ApplicationData } from '@/lib/types';

// ── Scoring weights — must sum to 1.0 ─────────────────────────────────────

export const DEFAULT_WEIGHTS = {
  creditScore: 0.20,
  affordability: 0.25,
  moveInUrgency: 0.10,
  employmentStability: 0.12,
  rentalHistory: 0.12,
  screeningFlags: 0.10,
  applicationCompleteness: 0.06,
  householdFit: 0.05,
} as const;

export type ScoringWeights = typeof DEFAULT_WEIGHTS;
export type ScoringCategory = keyof ScoringWeights;

// ── Category sub-score result ──────────────────────────────────────────────

export type CategoryResult = {
  category: ScoringCategory;
  rawScore: number; // 0-1 normalized
  weight: number;
  weightedScore: number; // rawScore * weight
  signals: string[]; // human-readable signals that influenced this score
};

// ── Risk penalty ───────────────────────────────────────────────────────────

export type RiskPenalty = {
  flag: string;
  multiplier: number; // 0-1, applied multiplicatively to final score
  description: string;
};

// ── Engine output ──────────────────────────────────────────────────────────

export type ScoringEngineResult = {
  score: number; // 0-100 integer
  priorityTier: 'hot' | 'warm' | 'cold' | 'unqualified';
  confidence: number; // 0-1 based on data completeness
  categories: CategoryResult[];
  riskPenalties: RiskPenalty[];
  strengths: string[];
  weaknesses: string[];
  riskFlags: string[];
  missingInformation: string[];
  dataCompleteness: number; // 0-1
};

// ── Range string parser ───────────────────────────────────────────────

/**
 * Parse a budget/income range string (e.g. "$1,500 - $2,000", "Under $1,500",
 * "$5,000+") into a numeric midpoint. Returns null if unparseable.
 */
export function parseRangeMidpoint(range: string): number | null {
  if (!range) return null;
  if (range.includes('+')) {
    const num = parseInt(range.replace(/[^0-9]/g, ''));
    return num || null;
  }
  if (range.toLowerCase().includes('under')) {
    const num = parseInt(range.replace(/[^0-9]/g, ''));
    return num ? num * 0.75 : null;
  }
  const nums = range.match(/[\d,]+/g)?.map(n => parseInt(n.replace(/,/g, ''))) || [];
  if (nums.length >= 2) return (nums[0] + nums[1]) / 2;
  if (nums.length === 1) return nums[0];
  return null;
}

/**
 * Resolve a value that may be a number or range string into a number.
 */
function resolveNumericValue(value: number | string | undefined | null): number {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  return parseRangeMidpoint(value) ?? 0;
}

// ── Tier thresholds ────────────────────────────────────────────────────────

const TIER_THRESHOLDS = {
  hot: 75,
  warm: 45,
  cold: 20,
} as const;

function assignTier(score: number): ScoringEngineResult['priorityTier'] {
  if (score >= TIER_THRESHOLDS.hot) return 'hot';
  if (score >= TIER_THRESHOLDS.warm) return 'warm';
  if (score >= TIER_THRESHOLDS.cold) return 'cold';
  return 'unqualified';
}

// ── Scoring input ──────────────────────────────────────────────────────────

export type ScoringInput = {
  name: string;
  email: string | null;
  phone: string;
  budget: number | null;
  applicationData: ApplicationData | null;
  leadType?: 'rental' | 'buyer';
};

// ═══════════════════════════════════════════════════════════════════════════
// Category scoring functions — each returns 0-1
// ═══════════════════════════════════════════════════════════════════════════

function scoreCreditScore(input: ScoringInput): CategoryResult {
  const app = input.applicationData;
  const signals: string[] = [];
  let rawScore = 0.5; // neutral if not provided

  const score = app?.creditScore;

  if (!score || typeof score !== 'number') {
    signals.push('Credit score not provided — using neutral baseline');
  } else if (score >= 780) {
    rawScore = 1.0;
    signals.push(`Exceptional credit score: ${score} (780+)`);
  } else if (score >= 750) {
    rawScore = 0.95;
    signals.push(`Excellent credit score: ${score} (750-779)`);
  } else if (score >= 720) {
    rawScore = 0.85;
    signals.push(`Very good credit score: ${score} (720-749)`);
  } else if (score >= 670) {
    rawScore = 0.70;
    signals.push(`Good credit score: ${score} (670-719)`);
  } else if (score >= 620) {
    rawScore = 0.50;
    signals.push(`Fair credit score: ${score} (620-669)`);
  } else if (score >= 580) {
    rawScore = 0.30;
    signals.push(`Below average credit score: ${score} (580-619)`);
  } else if (score >= 500) {
    rawScore = 0.15;
    signals.push(`Poor credit score: ${score} (500-579)`);
  } else {
    rawScore = 0.05;
    signals.push(`Very poor credit score: ${score} (below 500)`);
  }

  return {
    category: 'creditScore',
    rawScore,
    weight: DEFAULT_WEIGHTS.creditScore,
    weightedScore: rawScore * DEFAULT_WEIGHTS.creditScore,
    signals,
  };
}

function scoreAffordability(input: ScoringInput): CategoryResult {
  const app = input.applicationData;
  const signals: string[] = [];
  let rawScore = 0.3; // baseline for minimal data

  const income = resolveNumericValue(app?.monthlyGrossIncome);
  const additionalIncome = app?.additionalIncome ?? 0;
  const totalIncome = income + additionalIncome;
  const rent = resolveNumericValue(app?.monthlyRent) || (input.budget ?? 0);

  if (totalIncome > 0 && rent > 0) {
    const ratio = totalIncome / rent;

    if (ratio >= 4.0) {
      rawScore = 1.0;
      signals.push(`Strong income-to-rent ratio: ${ratio.toFixed(1)}x (≥4x target rent)`);
    } else if (ratio >= 3.0) {
      rawScore = 0.85;
      signals.push(`Meets 3x rent rule: ${ratio.toFixed(1)}x`);
    } else if (ratio >= 2.5) {
      rawScore = 0.6;
      signals.push(`Below 3x rent rule: ${ratio.toFixed(1)}x — marginal affordability`);
    } else if (ratio >= 2.0) {
      rawScore = 0.35;
      signals.push(`Significantly below 3x: ${ratio.toFixed(1)}x — high rent burden`);
    } else {
      rawScore = 0.1;
      signals.push(`Income-to-rent ratio ${ratio.toFixed(1)}x — likely unaffordable`);
    }

    if (additionalIncome > 0) {
      signals.push(`Additional income: $${additionalIncome.toLocaleString()}/mo`);
    }
  } else if (totalIncome > 0) {
    rawScore = 0.5;
    signals.push(`Income reported ($${totalIncome.toLocaleString()}/mo) but no target rent provided`);
  } else if (rent > 0) {
    rawScore = 0.25;
    signals.push(`Target rent $${rent.toLocaleString()}/mo but no income reported`);
  } else {
    rawScore = 0.15;
    signals.push('No income or rent data provided');
  }

  return {
    category: 'affordability',
    rawScore,
    weight: DEFAULT_WEIGHTS.affordability,
    weightedScore: rawScore * DEFAULT_WEIGHTS.affordability,
    signals,
  };
}

function scoreMoveInUrgency(input: ScoringInput): CategoryResult {
  const app = input.applicationData;
  const signals: string[] = [];
  let rawScore = 0.3;

  if (app?.targetMoveInDate) {
    const moveIn = app.targetMoveInDate;

    // Handle new simplified form values
    if (moveIn.toLowerCase() === 'asap') {
      rawScore = 1.0;
      signals.push('Immediate move-in: ASAP');
    } else if (moveIn.toLowerCase().includes('within 30') || moveIn.toLowerCase().includes('30 day')) {
      rawScore = 0.85;
      signals.push('Near-term: within 30 days');
    } else if (moveIn.toLowerCase().includes('1-2 month') || moveIn.toLowerCase().includes('1–2 month')) {
      rawScore = 0.6;
      signals.push('Medium-term: 1-2 months');
    } else if (moveIn.toLowerCase().includes('just browsing') || moveIn.toLowerCase().includes('browsing')) {
      rawScore = 0.15;
      signals.push('Just browsing — low urgency');
    } else {
      // Try parsing as a date (old form format)
      const target = new Date(moveIn);
      if (!isNaN(target.getTime())) {
        const now = new Date();
        const daysUntilMove = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (daysUntilMove <= 0) {
          rawScore = 0.95;
          signals.push('Immediate move-in needed (date has passed or is today)');
        } else if (daysUntilMove <= 14) {
          rawScore = 1.0;
          signals.push(`Urgent: moving in ${daysUntilMove} days`);
        } else if (daysUntilMove <= 30) {
          rawScore = 0.85;
          signals.push(`Near-term: moving in ${daysUntilMove} days (~1 month)`);
        } else if (daysUntilMove <= 60) {
          rawScore = 0.65;
          signals.push(`Medium-term: moving in ${daysUntilMove} days (~2 months)`);
        } else if (daysUntilMove <= 90) {
          rawScore = 0.45;
          signals.push(`Longer-term: moving in ${daysUntilMove} days (~3 months)`);
        } else {
          rawScore = 0.25;
          signals.push(`Far out: moving in ${daysUntilMove} days (${Math.round(daysUntilMove / 30)} months)`);
        }
      } else {
        rawScore = 0.4;
        signals.push(`Move-in timing: "${moveIn}"`);
      }
    }
  } else {
    signals.push('No move-in date provided');
  }

  if (app?.reasonForMoving) {
    const urgent = /evict|emergency|immediate|asap|must move|lease ending|notice/i;
    if (urgent.test(app.reasonForMoving)) {
      rawScore = Math.min(1.0, rawScore + 0.15);
      signals.push(`Urgent reason for moving: "${app.reasonForMoving}"`);
    }
  }

  return {
    category: 'moveInUrgency',
    rawScore,
    weight: DEFAULT_WEIGHTS.moveInUrgency,
    weightedScore: rawScore * DEFAULT_WEIGHTS.moveInUrgency,
    signals,
  };
}

function scoreEmploymentStability(input: ScoringInput): CategoryResult {
  const app = input.applicationData;
  const signals: string[] = [];
  let rawScore = 0.2;

  if (app?.employmentStatus) {
    const status = app.employmentStatus;
    switch (status) {
      case 'employed':
      case 'Full-time employed':
        rawScore = 0.9;
        signals.push(status === 'Full-time employed' ? 'Full-time employed' : 'Employed');
        if (app.employerOrSource) {
          rawScore = 1.0;
          signals.push(`Employer: ${app.employerOrSource}`);
        }
        break;
      case 'self-employed':
      case 'Self-employed':
        rawScore = 0.75;
        signals.push('Self-employed');
        if (app.employerOrSource) {
          signals.push(`Source: ${app.employerOrSource}`);
        }
        break;
      case 'Part-time employed':
        rawScore = 0.6;
        signals.push('Part-time employed');
        if (app.employerOrSource) {
          signals.push(`Employer: ${app.employerOrSource}`);
        }
        break;
      case 'retired':
        rawScore = 0.7;
        signals.push('Retired — fixed income likely');
        break;
      case 'student':
      case 'Student':
        rawScore = 0.4;
        signals.push('Student — may need co-signer or guarantor');
        break;
      case 'unemployed':
      case 'Not currently employed':
        rawScore = 0.15;
        signals.push(status === 'Not currently employed' ? 'Not currently employed — verify alternative income sources' : 'Unemployed — verify alternative income sources');
        break;
      default:
        rawScore = 0.3;
        signals.push(`Employment status: ${status}`);
    }
  } else {
    signals.push('Employment status not provided');
  }

  // Bonus for additional income streams
  if (app?.additionalIncome && app.additionalIncome > 0) {
    rawScore = Math.min(1.0, rawScore + 0.1);
    signals.push(`Additional income stream: $${app.additionalIncome}/mo`);
  }

  return {
    category: 'employmentStability',
    rawScore,
    weight: DEFAULT_WEIGHTS.employmentStability,
    weightedScore: rawScore * DEFAULT_WEIGHTS.employmentStability,
    signals,
  };
}

function scoreRentalHistory(input: ScoringInput): CategoryResult {
  const app = input.applicationData;
  const signals: string[] = [];
  let rawScore = 0.5; // neutral baseline

  if (!app) {
    signals.push('No application data — rental history unknown');
    return {
      category: 'rentalHistory',
      rawScore: 0.3,
      weight: DEFAULT_WEIGHTS.rentalHistory,
      weightedScore: 0.3 * DEFAULT_WEIGHTS.rentalHistory,
      signals,
    };
  }

  // Positive: landlord references provided
  let referencesProvided = 0;
  if (app.currentLandlordName) { referencesProvided++; signals.push('Current landlord reference provided'); }
  if (app.previousLandlordName) { referencesProvided++; signals.push('Previous landlord reference provided'); }
  if (referencesProvided === 2) rawScore = 0.8;
  else if (referencesProvided === 1) rawScore = 0.6;
  else signals.push('No landlord references provided');

  // Permission to contact
  if (app.permissionToContactReferences === true) {
    rawScore = Math.min(1.0, rawScore + 0.1);
    signals.push('Gave permission to contact references');
  } else if (app.permissionToContactReferences === false) {
    rawScore = Math.max(0, rawScore - 0.15);
    signals.push('Declined permission to contact references');
  }

  // Negative: late payments
  if (app.latePayments === true) {
    rawScore = Math.max(0, rawScore - 0.2);
    signals.push('History of late payments');
  } else if (app.latePayments === false) {
    rawScore = Math.min(1.0, rawScore + 0.05);
    signals.push('No late payment history');
  }

  // Negative: lease violations
  if (app.leaseViolations === true) {
    rawScore = Math.max(0, rawScore - 0.25);
    signals.push('Prior lease violations');
  } else if (app.leaseViolations === false) {
    rawScore = Math.min(1.0, rawScore + 0.05);
    signals.push('No lease violations');
  }

  // Length of residence stability
  if (app.lengthOfResidence) {
    const years = parseResidenceLength(app.lengthOfResidence);
    if (years >= 2) {
      rawScore = Math.min(1.0, rawScore + 0.1);
      signals.push(`Stable: ${app.lengthOfResidence} at current address`);
    } else if (years < 0.5) {
      signals.push(`Short tenure: ${app.lengthOfResidence} — possible frequent mover`);
    }
  }

  return {
    category: 'rentalHistory',
    rawScore: Math.max(0, Math.min(1.0, rawScore)),
    weight: DEFAULT_WEIGHTS.rentalHistory,
    weightedScore: Math.max(0, Math.min(1.0, rawScore)) * DEFAULT_WEIGHTS.rentalHistory,
    signals,
  };
}

function parseResidenceLength(value: string): number {
  const lower = value.toLowerCase();
  const yearMatch = lower.match(/(\d+)\s*(?:year|yr)/);
  const monthMatch = lower.match(/(\d+)\s*(?:month|mo)/);
  let years = 0;
  if (yearMatch) years += parseInt(yearMatch[1], 10);
  if (monthMatch) years += parseInt(monthMatch[1], 10) / 12;
  if (years === 0) {
    // Try bare number (assume months)
    const bare = parseInt(lower, 10);
    if (!isNaN(bare)) years = bare > 24 ? bare / 12 : bare / 12;
  }
  return years;
}

function scoreApplicationCompleteness(input: ScoringInput): CategoryResult {
  const app = input.applicationData;
  const signals: string[] = [];

  if (!app) {
    return {
      category: 'applicationCompleteness',
      rawScore: 0.1,
      weight: DEFAULT_WEIGHTS.applicationCompleteness,
      weightedScore: 0.1 * DEFAULT_WEIGHTS.applicationCompleteness,
      signals: ['No application data — basic contact info only'],
    };
  }

  const fields = [
    app.creditScore, app.propertyAddress, app.unitType, app.targetMoveInDate, app.monthlyRent,
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
  ];

  const totalFields = fields.length;
  const filled = fields.filter((v) => v != null && v !== '').length;
  const completeness = filled / totalFields;

  let rawScore: number;
  if (completeness >= 0.9) {
    rawScore = 1.0;
    signals.push(`Excellent: ${Math.round(completeness * 100)}% complete (${filled}/${totalFields})`);
  } else if (completeness >= 0.7) {
    rawScore = 0.75;
    signals.push(`Good: ${Math.round(completeness * 100)}% complete (${filled}/${totalFields})`);
  } else if (completeness >= 0.5) {
    rawScore = 0.5;
    signals.push(`Partial: ${Math.round(completeness * 100)}% complete (${filled}/${totalFields})`);
  } else {
    rawScore = 0.2;
    signals.push(`Incomplete: ${Math.round(completeness * 100)}% complete (${filled}/${totalFields})`);
  }

  // Bonus for consents
  if (app.consentToScreening && app.truthfulnessCertification && app.electronicSignature) {
    signals.push('All consents signed');
  }

  return {
    category: 'applicationCompleteness',
    rawScore,
    weight: DEFAULT_WEIGHTS.applicationCompleteness,
    weightedScore: rawScore * DEFAULT_WEIGHTS.applicationCompleteness,
    signals,
  };
}

function scoreHouseholdFit(input: ScoringInput): CategoryResult {
  const app = input.applicationData;
  const signals: string[] = [];
  let rawScore = 0.5; // neutral

  if (!app) {
    return {
      category: 'householdFit',
      rawScore: 0.4,
      weight: DEFAULT_WEIGHTS.householdFit,
      weightedScore: 0.4 * DEFAULT_WEIGHTS.householdFit,
      signals: ['No household data provided'],
    };
  }

  const occupants = app.numberOfOccupants ?? ((app.adultsOnApplication ?? 1) + (app.childrenOrDependents ?? 0));

  if (occupants > 0) {
    signals.push(`Total occupants: ${occupants}`);
    if (occupants <= 2) {
      rawScore = 0.9;
      signals.push('Small household — fits most unit types');
    } else if (occupants <= 4) {
      rawScore = 0.7;
      signals.push('Medium household — verify unit size compatibility');
    } else {
      rawScore = 0.4;
      signals.push('Large household — may need specific unit type');
    }
  }

  if (app.hasPets === true) {
    rawScore = Math.max(0, rawScore - 0.1);
    signals.push(`Has pets${app.petDetails ? `: ${app.petDetails}` : ''} — verify pet policy`);
  } else if (app.hasPets === false) {
    signals.push('No pets');
  }

  if (app.smoking === true) {
    rawScore = Math.max(0, rawScore - 0.15);
    signals.push('Smoker — verify smoking policy');
  }

  if (app.emergencyContactName) {
    signals.push('Emergency contact provided');
  }

  return {
    category: 'householdFit',
    rawScore: Math.max(0, Math.min(1.0, rawScore)),
    weight: DEFAULT_WEIGHTS.householdFit,
    weightedScore: Math.max(0, Math.min(1.0, rawScore)) * DEFAULT_WEIGHTS.householdFit,
    signals,
  };
}

function scoreScreeningFlags(input: ScoringInput): CategoryResult {
  const app = input.applicationData;
  const signals: string[] = [];
  let rawScore = 0.8; // assume clean unless flagged

  if (!app) {
    return {
      category: 'screeningFlags',
      rawScore: 0.4,
      weight: DEFAULT_WEIGHTS.screeningFlags,
      weightedScore: 0.4 * DEFAULT_WEIGHTS.screeningFlags,
      signals: ['No screening data — flags unknown'],
    };
  }

  // Each flag is a major deduction
  if (app.priorEvictions === true) {
    rawScore -= 0.4;
    signals.push('CRITICAL: Prior evictions reported');
  } else if (app.priorEvictions === false) {
    signals.push('No prior evictions');
  }

  if (app.bankruptcy === true) {
    rawScore -= 0.3;
    signals.push('WARNING: Bankruptcy history');
  } else if (app.bankruptcy === false) {
    signals.push('No bankruptcy');
  }

  if (app.outstandingBalances === true) {
    rawScore -= 0.25;
    signals.push('WARNING: Outstanding balances reported');
  } else if (app.outstandingBalances === false) {
    signals.push('No outstanding balances');
  }

  // Clean slate bonus
  if (app.priorEvictions === false && app.bankruptcy === false && app.outstandingBalances === false) {
    rawScore = 1.0;
    signals.push('Clean screening: no evictions, bankruptcy, or balances');
  }

  return {
    category: 'screeningFlags',
    rawScore: Math.max(0, Math.min(1.0, rawScore)),
    weight: DEFAULT_WEIGHTS.screeningFlags,
    weightedScore: Math.max(0, Math.min(1.0, rawScore)) * DEFAULT_WEIGHTS.screeningFlags,
    signals,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Risk penalties — multiplicative post-processing
// ═══════════════════════════════════════════════════════════════════════════

function computeRiskPenalties(input: ScoringInput): RiskPenalty[] {
  const app = input.applicationData;
  const penalties: RiskPenalty[] = [];

  if (!app) return penalties;

  // Very poor credit score = severe risk
  const creditScore = app.creditScore;
  if (typeof creditScore === 'number' && creditScore < 580 && app.priorEvictions === true) {
    penalties.push({
      flag: 'poor_credit_with_evictions',
      multiplier: 0.5,
      description: `Credit score ${creditScore} combined with prior evictions — very high risk profile`,
    });
  } else if (typeof creditScore === 'number' && creditScore < 500) {
    penalties.push({
      flag: 'very_poor_credit',
      multiplier: 0.7,
      description: `Credit score ${creditScore} (below 500) — severe credit risk`,
    });
  }

  // Eviction + outstanding balances = severe compound risk
  if (app.priorEvictions === true && app.outstandingBalances === true) {
    penalties.push({
      flag: 'compound_financial_risk',
      multiplier: 0.7,
      description: 'Prior evictions combined with outstanding balances — high risk profile',
    });
  }

  // Income way below threshold
  const income = resolveNumericValue(app.monthlyGrossIncome) + (app.additionalIncome ?? 0);
  const rent = resolveNumericValue(app.monthlyRent);
  if (income > 0 && rent > 0 && income / rent < 1.5) {
    penalties.push({
      flag: 'severe_affordability_gap',
      multiplier: 0.6,
      description: `Income-to-rent ratio below 1.5x ($${income}/$${rent}) — severe affordability risk`,
    });
  }

  // Refused screening consent
  if (app.consentToScreening === false) {
    penalties.push({
      flag: 'screening_consent_refused',
      multiplier: 0.5,
      description: 'Applicant declined screening consent — cannot verify background',
    });
  }

  return penalties;
}

// ═══════════════════════════════════════════════════════════════════════════
// Data completeness & confidence
// ═══════════════════════════════════════════════════════════════════════════

function computeDataCompleteness(input: ScoringInput): number {
  const app = input.applicationData;
  if (!app) return 0.1;

  // Weight critical fields higher for confidence calculation
  const criticalFields = [
    app.creditScore, app.monthlyGrossIncome, app.employmentStatus, app.monthlyRent,
    app.priorEvictions, app.outstandingBalances, app.bankruptcy,
    app.targetMoveInDate, app.currentLandlordName,
  ];
  const criticalFilled = criticalFields.filter((v) => v != null && v !== '').length;

  const secondaryFields = [
    app.propertyAddress, app.unitType, app.leaseTermPreference,
    app.currentAddress, app.currentHousingStatus, app.lengthOfResidence,
    app.reasonForMoving, app.adultsOnApplication, app.employerOrSource,
    app.additionalIncome, app.previousLandlordName, app.emergencyContactName,
    app.smoking, app.hasPets, app.consentToScreening,
  ];
  const secondaryFilled = secondaryFields.filter((v) => v != null && v !== '').length;

  // Critical fields count 2x for confidence
  const totalWeight = criticalFields.length * 2 + secondaryFields.length;
  const filledWeight = criticalFilled * 2 + secondaryFilled;

  return Math.min(1.0, filledWeight / totalWeight);
}

// ═══════════════════════════════════════════════════════════════════════════
// Collect strengths, weaknesses, risk flags, missing info
// ═══════════════════════════════════════════════════════════════════════════

function collectInsights(categories: CategoryResult[], penalties: RiskPenalty[], input: ScoringInput) {
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const riskFlags: string[] = [];
  const missingInformation: string[] = [];
  const app = input.applicationData;

  for (const cat of categories) {
    if (cat.rawScore >= 0.8) {
      const topSignal = cat.signals[0];
      if (topSignal) strengths.push(topSignal);
    }
    if (cat.rawScore <= 0.35) {
      const topSignal = cat.signals[0];
      if (topSignal) weaknesses.push(topSignal);
    }
  }

  for (const penalty of penalties) {
    riskFlags.push(penalty.description);
  }

  // Check for specific screening flags from category signals
  for (const cat of categories) {
    for (const sig of cat.signals) {
      if (sig.startsWith('CRITICAL:') || sig.startsWith('WARNING:')) {
        if (!riskFlags.includes(sig)) riskFlags.push(sig);
      }
    }
  }

  // Missing information
  if (!app) {
    missingInformation.push('Full application data');
  } else {
    if (!app.creditScore) missingInformation.push('Credit score');
    if (!app.monthlyGrossIncome) missingInformation.push('Monthly gross income');
    if (!app.employmentStatus) missingInformation.push('Employment status');
    if (!app.targetMoveInDate) missingInformation.push('Target move-in date');
    if (!app.monthlyRent && !input.budget) missingInformation.push('Target monthly rent');
    if (!app.currentLandlordName && !app.previousLandlordName) missingInformation.push('Landlord references');
    if (app.priorEvictions == null) missingInformation.push('Eviction history');
    if (app.bankruptcy == null) missingInformation.push('Bankruptcy status');
    if (app.outstandingBalances == null) missingInformation.push('Outstanding balances');
  }

  return {
    strengths: strengths.slice(0, 5),
    weaknesses: weaknesses.slice(0, 5),
    riskFlags: riskFlags.slice(0, 5),
    missingInformation: missingInformation.slice(0, 5),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Main scoring function
// ═══════════════════════════════════════════════════════════════════════════

export function computeLeadScore(input: ScoringInput): ScoringEngineResult {
  if (input.leadType === 'buyer') {
    return computeBuyerScore(input);
  }

  // 1. Compute all category sub-scores
  const categories: CategoryResult[] = [
    scoreCreditScore(input),
    scoreAffordability(input),
    scoreMoveInUrgency(input),
    scoreEmploymentStability(input),
    scoreRentalHistory(input),
    scoreApplicationCompleteness(input),
    scoreHouseholdFit(input),
    scoreScreeningFlags(input),
  ];

  // 2. Sum weighted scores → base score 0-1
  let baseScore = categories.reduce((sum, cat) => sum + cat.weightedScore, 0);

  // 3. Apply risk penalties multiplicatively
  const riskPenalties = computeRiskPenalties(input);
  for (const penalty of riskPenalties) {
    baseScore *= penalty.multiplier;
  }

  // 3b. Intent signal from lease term preference (new simplified form)
  const intent = input.applicationData?.leaseTermPreference;
  if (intent === 'Yes, ready now') {
    baseScore = Math.min(1.0, baseScore + 0.05); // hot signal boost
  } else if (intent === 'Just exploring') {
    baseScore *= 0.9; // slight dampening for exploratory leads
  }

  // 4. Scale to 0-100 and clamp
  const finalScore = Math.max(0, Math.min(100, Math.round(baseScore * 100)));

  // 5. Compute confidence from data completeness
  const dataCompleteness = computeDataCompleteness(input);
  const confidence = Math.round(dataCompleteness * 100) / 100;

  // 6. Collect human-readable insights
  const { strengths, weaknesses, riskFlags, missingInformation } = collectInsights(
    categories,
    riskPenalties,
    input,
  );

  return {
    score: finalScore,
    priorityTier: assignTier(finalScore),
    confidence,
    categories,
    riskPenalties,
    strengths,
    weaknesses,
    riskFlags,
    missingInformation,
    dataCompleteness,
  };
}
