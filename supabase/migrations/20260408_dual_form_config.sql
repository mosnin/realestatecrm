-- Migration: Split single formConfig into dual rental/buyer form configs
-- Date: 2026-04-08
-- Description: Replaces the single `formConfig` JSONB on SpaceSetting with
--   separate `rentalFormConfig` and `buyerFormConfig` columns. Same for Brokerage.
--   Adds `formLeadType` on Contact to record which path the applicant took.
--   Safely migrates existing formConfig data to rentalFormConfig.

-- ============================================================
-- SpaceSetting: split formConfig into rentalFormConfig + buyerFormConfig
-- ============================================================

ALTER TABLE "SpaceSetting"
  ADD COLUMN IF NOT EXISTS "rentalFormConfig" jsonb DEFAULT NULL;

ALTER TABLE "SpaceSetting"
  ADD COLUMN IF NOT EXISTS "buyerFormConfig" jsonb DEFAULT NULL;

-- Migrate existing formConfig to rentalFormConfig (most existing configs are rental)
UPDATE "SpaceSetting"
SET "rentalFormConfig" = "formConfig"
WHERE "formConfig" IS NOT NULL
  AND "rentalFormConfig" IS NULL;

-- ============================================================
-- Brokerage: split brokerageFormConfig into dual configs
-- ============================================================

ALTER TABLE "Brokerage"
  ADD COLUMN IF NOT EXISTS "brokerageRentalFormConfig" jsonb DEFAULT NULL;

ALTER TABLE "Brokerage"
  ADD COLUMN IF NOT EXISTS "brokerageBuyerFormConfig" jsonb DEFAULT NULL;

-- Migrate existing brokerageFormConfig to brokerageRentalFormConfig
UPDATE "Brokerage"
SET "brokerageRentalFormConfig" = "brokerageFormConfig"
WHERE "brokerageFormConfig" IS NOT NULL
  AND "brokerageRentalFormConfig" IS NULL;

-- ============================================================
-- Contact: record which form path the applicant took
-- ============================================================

ALTER TABLE "Contact"
  ADD COLUMN IF NOT EXISTS "formLeadType" text;

-- ============================================================
-- Indexes for the new columns
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_space_setting_rental_form_config
  ON "SpaceSetting" USING gin("rentalFormConfig") WHERE "rentalFormConfig" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_space_setting_buyer_form_config
  ON "SpaceSetting" USING gin("buyerFormConfig") WHERE "buyerFormConfig" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_brokerage_rental_form_config
  ON "Brokerage" USING gin("brokerageRentalFormConfig") WHERE "brokerageRentalFormConfig" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_brokerage_buyer_form_config
  ON "Brokerage" USING gin("brokerageBuyerFormConfig") WHERE "brokerageBuyerFormConfig" IS NOT NULL;
