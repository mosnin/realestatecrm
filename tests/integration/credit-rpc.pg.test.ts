/**
 * Integration test for the credit-ledger Postgres RPCs (`grant_credits`,
 * `spend_credits`) against a REAL Postgres — not the TS mirror.
 *
 * WHY: the credit balance is money. The FIFO debit, the sourceId idempotency,
 * and the fail-closed-on-insufficient-balance behavior all live in plpgsql
 * (supabase/migrations/20260620…_credit_ledger.sql + 20260623…_credit_grant_
 * idempotency.sql). lib/billing/credits.ts mirrors the FIFO rule and is
 * unit-tested, but a mirror can drift from the SQL. This exercises the SQL.
 *
 * SKIPPED BY DEFAULT. It only runs when PG_INTEGRATION_URL points at a
 * throwaway Postgres 16, so normal `pnpm test` / CI never touches a database
 * and never needs the `pg` driver installed. `describe.skipIf` short-circuits
 * before the dynamic `import('pg')`, so an absent driver can't break collection.
 *
 * HOW TO RUN LOCALLY (Postgres must run as a non-root user):
 *
 *   initdb -D /tmp/pgcredit -U postgres --auth=trust
 *   pg_ctl  -D /tmp/pgcredit -o "-p 54330 -k /tmp" -l /tmp/pg.log start
 *   psql -h /tmp -p 54330 -U postgres -c 'CREATE DATABASE credittest;'
 *   pnpm add -D pg @types/pg            # the driver is intentionally not a dep
 *   PG_INTEGRATION_URL='postgres://postgres@/credittest?host=/tmp&port=54330' \
 *     npx vitest run tests/integration/credit-rpc.pg.test.ts
 *
 * The test loads the two credit migrations itself, so a bare `CREATE DATABASE`
 * is all the setup it needs. An operator without a Node/pg setup can prove the
 * same invariants with scripts/verify-credit-rpcs.sql via psql.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PG_URL = process.env.PG_INTEGRATION_URL;

const MIGRATIONS = [
  '20260620000000_credit_ledger.sql',
  '20260623000000_credit_grant_idempotency.sql',
];

// describe.skipIf(true) skips the whole block — including the dynamic import —
// so the `pg` driver only has to exist when PG_INTEGRATION_URL is set.
describe.skipIf(!PG_URL)('credit RPCs (real Postgres)', () => {
  // Typed loosely: `pg` is an optional, dynamically-imported dev dependency.
  let client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }>; end: () => Promise<void> };
  const ACCT = 'pgtest_acct';

  beforeAll(async () => {
    // `pg` is an OPTIONAL dev dependency, intentionally not in package.json (the
    // suite must install green without a Postgres driver). This block only runs
    // when PG_INTEGRATION_URL is set, where the operator has installed it.
    // @ts-expect-error — no types for the un-installed optional `pg` driver.
    const pg = await import('pg');
    const Client = (pg as any).default?.Client ?? (pg as any).Client;
    client = new Client({ connectionString: PG_URL });
    await (client as any).connect();

    const migrationsDir = join(process.cwd(), 'supabase', 'migrations');
    for (const file of MIGRATIONS) {
      const sql = readFileSync(join(migrationsDir, file), 'utf8');
      await client.query(sql);
    }
    // Isolate from any prior run.
    await client.query('DELETE FROM "CreditTxn" WHERE "accountId" = $1', [ACCT]);
    await client.query('DELETE FROM "CreditLot" WHERE "accountId" = $1', [ACCT]);
  });

  afterAll(async () => {
    if (!client) return;
    await client.query('DELETE FROM "CreditTxn" WHERE "accountId" = $1', [ACCT]).catch(() => {});
    await client.query('DELETE FROM "CreditLot" WHERE "accountId" = $1', [ACCT]).catch(() => {});
    await client.end().catch(() => {});
  });

  async function balance(): Promise<number> {
    const { rows } = await client.query(
      'SELECT COALESCE(SUM(remaining),0)::int AS bal FROM "CreditLot" WHERE "accountId" = $1 AND remaining > 0',
      [ACCT],
    );
    return rows[0].bal as number;
  }

  it('grant N then spend M leaves balance N - M', async () => {
    await client.query(
      `SELECT grant_credits('space', $1, 1000, 'monthly_grant', now() + interval '30 days', 'pgtest_inv_1')`,
      [ACCT],
    );
    const { rows } = await client.query(
      `SELECT * FROM spend_credits('space', $1, 300, 'chat_turn', NULL, NULL, '{}'::jsonb)`,
      [ACCT],
    );
    expect(rows[0].ok).toBe(true);
    expect(rows[0].balance).toBe(700);
    expect(await balance()).toBe(700);
  });

  it('re-granting the SAME sourceId does NOT double-grant', async () => {
    // Duplicate of pgtest_inv_1 — the partial unique index on (reason, sourceId)
    // makes the INSERT a no-op (ON CONFLICT DO NOTHING).
    await client.query(
      `SELECT grant_credits('space', $1, 1000, 'monthly_grant', now() + interval '30 days', 'pgtest_inv_1')`,
      [ACCT],
    );
    expect(await balance()).toBe(700); // unchanged
    const { rows } = await client.query('SELECT count(*)::int AS n FROM "CreditLot" WHERE "accountId" = $1', [ACCT]);
    expect(rows[0].n).toBe(1); // still one lot
  });

  it('spending more than the balance fails closed and leaves the balance intact', async () => {
    const { rows } = await client.query(
      `SELECT * FROM spend_credits('space', $1, 9999, 'chat_turn', NULL, NULL, '{}'::jsonb)`,
      [ACCT],
    );
    expect(rows[0].ok).toBe(false);
    expect(await balance()).toBe(700); // untouched
  });
});
