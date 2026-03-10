-- Move workspace identity from legacy "subdomain" naming to canonical "slug" naming.
ALTER TABLE "Space" RENAME COLUMN "subdomain" TO "slug";

DROP INDEX IF EXISTS "Space_subdomain_key";
CREATE UNIQUE INDEX "Space_slug_key" ON "Space"("slug");
