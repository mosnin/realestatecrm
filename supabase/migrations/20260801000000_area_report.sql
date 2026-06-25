-- Property IQ: Area intelligence reports.
--
-- "Property Analyze" researches ONE address's facts. Property IQ researches the
-- AREA the property sits in (schools, safety, walkability, local market, lifestyle)
-- and that intelligence is shared by every property in the same area. So instead
-- of re-researching (and re-paying for) the same neighborhood per-property, we
-- cache it once per (space, area) here and reuse it.
--
-- areaKey is a normalized handle (see lib/areas.ts):
--   * ZIP when known        → "zip:78704"
--   * otherwise city+state   → "city:austin-tx"
-- so two properties in the same ZIP resolve to the same report.
--
-- intelligence — the full structured result (per-field findings with source URLs,
--   the prose summary, the sources consulted). JSONB so the shape can grow without
--   a migration, exactly like Property.analysis.
-- generatedAt / expiresAt — drive the "researched <date>" label and the TTL refresh
--   (area data moves slowly; the store treats a report past expiresAt as stale and
--   re-researches on next request).
--
-- Tenancy: space-scoped like every other table. UNIQUE (spaceId, areaKey) makes the
-- store's upsert the single source of truth per area per workspace.
--
-- Idempotent: CREATE ... IF NOT EXISTS, safe to re-run.

CREATE TABLE IF NOT EXISTS "AreaReport" (
  "id"           TEXT        PRIMARY KEY,
  "spaceId"      TEXT        NOT NULL REFERENCES "Space"("id") ON DELETE CASCADE,
  "areaKey"      TEXT        NOT NULL,
  "label"        TEXT        NOT NULL,
  "city"         TEXT,
  "stateRegion"  TEXT,
  "postalCode"   TEXT,
  "intelligence" JSONB       NOT NULL DEFAULT '{}'::jsonb,
  "generatedAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "expiresAt"    TIMESTAMPTZ,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One canonical report per area per space (drives upsert ON CONFLICT).
CREATE UNIQUE INDEX IF NOT EXISTS "AreaReport_space_area_key"
  ON "AreaReport" ("spaceId", "areaKey");

-- Lookups by space for any future "browse my researched areas" view.
CREATE INDEX IF NOT EXISTS "AreaReport_space_generated_idx"
  ON "AreaReport" ("spaceId", "generatedAt" DESC);
