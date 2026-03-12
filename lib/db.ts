import { neon } from '@neondatabase/serverless';

function createSql() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL environment variable is not set. ' +
      'Please add it to your Vercel project settings or .env.local file.'
    );
  }
  return neon(connectionString);
}

// Lazily create the neon query function on first use.
// We use a simple getter pattern instead of Proxy for maximum compatibility
// with Next.js RSC module evaluation.
let _sql: ReturnType<typeof neon> | undefined;
export function getSql() {
  if (!_sql) _sql = createSql();
  return _sql;
}

// Tagged-template helper: use as  sql`SELECT ...`
// This is a thin wrapper that forwards tagged-template calls to the neon driver.
export function sql(strings: TemplateStringsArray, ...values: unknown[]) {
  return getSql()(strings, ...values);
}
