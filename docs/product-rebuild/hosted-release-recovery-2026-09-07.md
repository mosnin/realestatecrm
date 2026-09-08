# Hosted release recovery — September 7, 2026

Baseline: `7dca17a97510301c8065e980dfdd40f7a7d67329`, draft PR #612.

## Changes

- Staging's Vercel resource settings changed from enhanced/elastic with elastic concurrency to standard/fixed with elastic concurrency disabled. API confirmed the new settings; function region and fluid compute were preserved. This is a reversible attempt to resolve resource provisioning failure, not proof a deployment is ready.
- The repository build-ignore policy now allows previews for `codex/autonomous-product-rebuild`. Other preview branches remain skipped; production behavior remains unchanged. Three shell-executed policy tests pass.
- Mac packaging defaults to the optimized release configuration, supports optional Developer ID signing with hardened runtime and camera/microphone entitlements, and optional keychain-profile notarization with stapling/Gatekeeper checks. Required-notarization mode refuses missing credentials. This host currently reports zero valid signing identities.

## External gates

Render workspace confirmation is required by the connector before listing or provisioning the Workforce runtime. The selection question is pending. No Render resources have been created in this step.

Existing production migration and live-provider acceptance gates remain. Do not infer production readiness from an optimized local Mac build, preview provisioning, or passing test suites.

## Rollback

Staging build settings before this step: `buildMachineType=enhanced`, `buildMachineSelection=elastic`, `elasticConcurrencyEnabled=true`. Reverting the preview policy restores skipping all preview builds. No production domain or database changes were made.
