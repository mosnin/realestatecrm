-- Property "Analyze" feature: web-research + LLM structuring.
--
-- A realtor opens a Property (or types an address) and clicks "Analyze". The
-- server researches THAT specific property on the open web (Tavily search +
-- Firecrawl scrape of Zillow/Redfin/Realtor.com/county records), an LLM
-- structures the grounded evidence into the Property columns, and the result is
-- saved here.
--
-- Two new columns on Property:
--   * `analysis`   — the full structured result: the per-field findings (each
--                    with the source URL it came from), the prose summary, and
--                    the list of sources consulted. JSONB so the shape can grow
--                    without a migration. NULL until the first Analyze run.
--   * `analyzedAt` — when the most recent Analyze run completed. Drives the
--                    "Analyzed <date>" label + the re-analyze affordance in the
--                    UI. NULL until the first run.
--
-- The found field VALUES (beds/baths/sqft/yearBuilt/listPrice/…) are written
-- into the existing Property columns by the pipeline, and ONLY into columns that
-- are currently empty — human-entered values are never overwritten. This
-- migration only adds the two storage columns; no existing column changes.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, safe to re-run.

ALTER TABLE "Property"
  ADD COLUMN IF NOT EXISTS "analysis"   JSONB,
  ADD COLUMN IF NOT EXISTS "analyzedAt" TIMESTAMPTZ;
