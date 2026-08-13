import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260908200000_durable_schedule_occurrence_steps.sql'),
  'utf8',
);

describe('durable occurrence SQL transition contract', () => {
  it('gives a persisted cancellation request precedence over completed and retry outcomes', () => {
    const functionBody = migration.match(
      /CREATE OR REPLACE FUNCTION finish_schedule_occurrence\([\s\S]*?\n\$\$;/,
    )?.[0];

    expect(functionBody).toBeDefined();
    const cancellationBranch = functionBody!.indexOf('current_row."cancellationRequestedAt" IS NOT NULL OR p_outcome = \'cancelled\'');
    const completedBranch = functionBody!.indexOf("ELSIF p_outcome = 'completed' THEN");
    const retryBranch = functionBody!.indexOf("ELSIF p_outcome = 'retryable_failure' AND");

    expect(cancellationBranch).toBeGreaterThanOrEqual(0);
    expect(cancellationBranch).toBeLessThan(completedBranch);
    expect(cancellationBranch).toBeLessThan(retryBranch);
  });
});
