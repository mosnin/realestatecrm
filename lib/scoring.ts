import type { RentalApplication, RentalApplicant, QualScore } from '@/lib/types/application';

/**
 * Compute a qualification score for a rental application.
 * Scoring is transparent and explainable — each factor is documented.
 */
export function computeQualScore(
  app: Pick<RentalApplication, 'monthlyRent'>,
  applicant: Pick<
    RentalApplicant,
    | 'monthlyGrossIncome'
    | 'additionalIncome'
    | 'employmentStatus'
    | 'priorEvictions'
    | 'outstandingBalances'
    | 'latePayments'
    | 'leaseViolations'
    | 'backgroundConsent'
  >
): QualScore {
  let score = 0;

  // Rent-to-income ratio (primary affordability signal)
  const totalIncome =
    (applicant.monthlyGrossIncome ?? 0) + (applicant.additionalIncome ?? 0);
  if (app.monthlyRent && totalIncome > 0) {
    const ratio = totalIncome / app.monthlyRent;
    if (ratio >= 3) score += 3;
    else if (ratio >= 2.5) score += 2;
    else if (ratio >= 2) score += 1;
  }

  // Employment stability
  if (applicant.employmentStatus === 'FULL_TIME') score += 2;
  else if (
    applicant.employmentStatus === 'SELF_EMPLOYED' ||
    applicant.employmentStatus === 'PART_TIME'
  )
    score += 1;

  // Clean rental history (positive signals)
  if (applicant.priorEvictions === false) score += 2;
  if (applicant.outstandingBalances === false) score += 1;
  if (applicant.latePayments === 0) score += 1;
  if (applicant.leaseViolations === false) score += 1;

  // Background check consent given
  if (applicant.backgroundConsent === true) score += 1;

  // Red flags (negative signals)
  if (applicant.priorEvictions === true) score -= 3;
  if (applicant.outstandingBalances === true) score -= 2;

  if (score >= 7) return 'HOT';
  if (score >= 4) return 'WARM';
  return 'COLD';
}

/**
 * Generate a plain-English CRM summary from application data.
 * Keeps the explanation practical and easy for a realtor to scan.
 */
export function generateSummary(
  app: Pick<RentalApplication, 'monthlyRent' | 'targetMoveIn' | 'occupantCount'>,
  applicant: Pick<
    RentalApplicant,
    | 'legalName'
    | 'monthlyGrossIncome'
    | 'additionalIncome'
    | 'employmentStatus'
    | 'employerName'
    | 'priorEvictions'
    | 'outstandingBalances'
    | 'latePayments'
    | 'leaseViolations'
    | 'hasPets'
    | 'petDetails'
    | 'smokingDeclaration'
    | 'adultsOnApp'
    | 'children'
  >,
  qualScore: QualScore
): string {
  const parts: string[] = [];

  const name = applicant.legalName ?? 'Applicant';
  const totalIncome =
    (applicant.monthlyGrossIncome ?? 0) + (applicant.additionalIncome ?? 0);

  // Income & ratio
  if (totalIncome > 0) {
    const formattedIncome = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(totalIncome);

    if (app.monthlyRent && app.monthlyRent > 0) {
      const ratio = (totalIncome / app.monthlyRent).toFixed(1);
      parts.push(`${name} earns ${formattedIncome}/mo (${ratio}× rent ratio).`);
    } else {
      parts.push(`${name} earns ${formattedIncome}/mo.`);
    }
  } else {
    parts.push(`${name}.`);
  }

  // Employment
  const employmentLabels: Record<string, string> = {
    FULL_TIME: 'Full-time',
    PART_TIME: 'Part-time',
    SELF_EMPLOYED: 'Self-employed',
    UNEMPLOYED: 'Unemployed',
    RETIRED: 'Retired',
    STUDENT: 'Student',
    OTHER: 'Other income',
  };
  if (applicant.employmentStatus) {
    const label = employmentLabels[applicant.employmentStatus] ?? applicant.employmentStatus;
    if (applicant.employerName) {
      parts.push(`${label} at ${applicant.employerName}.`);
    } else {
      parts.push(`${label}.`);
    }
  }

  // Rental history
  if (applicant.priorEvictions === false) {
    parts.push('No prior evictions.');
  } else if (applicant.priorEvictions === true) {
    parts.push('Prior eviction on record.');
  }

  if (applicant.outstandingBalances === true) {
    parts.push('Has outstanding landlord balances.');
  }

  if (typeof applicant.latePayments === 'number') {
    if (applicant.latePayments === 0) {
      parts.push('No late payments.');
    } else {
      parts.push(
        `${applicant.latePayments} late payment${applicant.latePayments === 1 ? '' : 's'}.`
      );
    }
  }

  // Pets & smoking
  if (applicant.hasPets === true) {
    const petNote = applicant.petDetails ? ` (${applicant.petDetails})` : '';
    parts.push(`Has pets${petNote}.`);
  }
  if (applicant.smokingDeclaration === true) {
    parts.push('Smoker declared.');
  }

  // Household
  const occupants = app.occupantCount;
  if (occupants && occupants > 1) {
    parts.push(`${occupants} total occupants.`);
  }

  // Move-in date
  if (app.targetMoveIn) {
    const moveIn = new Date(app.targetMoveIn);
    const formatted = moveIn.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    parts.push(`Target move-in: ${formatted}.`);
  }

  // Score tag
  const scoreTags: Record<QualScore, string> = {
    HOT: 'Strong candidate.',
    WARM: 'Promising — review details.',
    COLD: 'Review carefully before proceeding.',
  };
  parts.push(scoreTags[qualScore]);

  return parts.join(' ');
}
