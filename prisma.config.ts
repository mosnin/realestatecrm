import { defineConfig } from "prisma/config";

// Neon provides two connection endpoints:
// - Pooled (via PgBouncer): used for app queries — does NOT support advisory locks
// - Direct (unpooled): used for migrations — supports advisory locks
//
// If DATABASE_URL_UNPOOLED is set, use it for migrations (directUrl).
// Otherwise, auto-derive it by removing "-pooler" from the pooled hostname.
function getDirectUrl(): string {
  if (process.env["DATABASE_URL_UNPOOLED"]) {
    return process.env["DATABASE_URL_UNPOOLED"];
  }
  const pooledUrl = process.env["DATABASE_URL"] ?? "";
  // Neon pooled URLs contain "-pooler" in the hostname, direct ones don't
  return pooledUrl.replace("-pooler.", ".");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"] ?? "",
    directUrl: getDirectUrl(),
  },
});
