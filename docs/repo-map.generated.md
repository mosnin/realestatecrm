# Repo Map (generated)

> **Do not edit by hand.** Regenerate with `python3 scripts/gen_repo_map.py`.
> Derived from the source tree, `vercel.json`, `supabase/schema.sql`, and the
> two agent tool catalogs. CI fails if this file is stale. The *meaning* of each
> system (purpose, fragile seams) lives in `SYSTEMS.md` / `SEAMS.md`, not here.

## At a glance

- **Page routes:** 223
- **API endpoints:** 440
- **Cron jobs:** 3
- **DB tables:** 153  ·  **RPCs:** 66  ·  **migrations:** 270
- **Agent tools — TS (lib/ai-tools):** 82 declared, 82 wired into `ALL_TOOLS`
- **Agent tools — Python (agent/):** 63 declared

## Page routes (Surfaces)

**(root)** (1)

- `/`

**[lang]** (2)

- `/[lang]`
- `/[lang]/pricing`

**admin** (19)

- `/admin`
- `/admin/agent-stats`
- `/admin/announcements`
- `/admin/audit-log`
- `/admin/billing`
- `/admin/broadcast`
- `/admin/brokerages`
- `/admin/brokerages/[id]`
- `/admin/cohorts`
- `/admin/form-analytics`
- `/admin/invitations`
- `/admin/invite-codes`
- `/admin/observability`
- `/admin/scoring-health`
- `/admin/security`
- `/admin/spaces`
- `/admin/support`
- `/admin/users`
- `/admin/users/[userId]`

**agents** (1)

- `/agents`

**apply** (5)

- `/apply/[slug]`
- `/apply/[slug]/chat`
- `/apply/[slug]/privacy`
- `/apply/[slug]/status`
- `/apply/b/[brokerageId]`

**auth** (1)

- `/auth/redirect`

**authorize** (1)

- `/authorize`

**billing-required** (1)

- `/billing-required`

**bio** (1)

- `/bio`

**book** (2)

- `/book/[slug]`
- `/book/[slug]/embed`

**broker** (36)

- `/broker`
- `/broker/activity`
- `/broker/agent-activity`
- `/broker/analytics`
- `/broker/billing`
- `/broker/brief`
- `/broker/chippi`
- `/broker/commissions`
- `/broker/deals`
- `/broker/floor`
- `/broker/forecast`
- `/broker/import-export`
- `/broker/integrations`
- `/broker/invitations`
- `/broker/leaderboard`
- `/broker/leads`
- `/broker/members`
- `/broker/messages`
- `/broker/my-leads`
- `/broker/people`
- `/broker/pipeline`
- `/broker/profitability`
- `/broker/properties`
- `/broker/realtors`
- `/broker/realtors/[userId]`
- `/broker/reviews`
- `/broker/reviews/[id]`
- `/broker/routines`
- `/broker/settings`
- `/broker/settings/auto-assignment`
- `/broker/settings/form-builder`
- `/broker/settings/mcp`
- `/broker/settings/profile`
- `/broker/settings/routing-rules`
- `/broker/templates`
- `/broker/usage`

**brokerage** (1)

- `/brokerage`

**brokerages** (1)

- `/brokerages`

**capture** (1)

- `/capture`

**careers** (1)

- `/careers`

**chippi** (1)

- `/chippi`

**clients** (9)

- `/clients`
- `/clients/applications/[contactId]`
- `/clients/book`
- `/clients/dashboard`
- `/clients/deals/[id]`
- `/clients/login`
- `/clients/reset`
- `/clients/signup`
- `/clients/verify`

**cma** (1)

- `/cma/[token]`

**company** (1)

- `/company`

**deals** (1)

- `/deals`

**demo** (1)

- `/demo`

**dev** (1)

- `/dev/chippi-workbench`

**files** (1)

- `/files`

**help** (1)

- `/help`

**integrations** (3)

- `/integrations`
- `/integrations/callback`
- `/integrations/callback/brokerage`

**invite** (3)

- `/invite/[token]`
- `/invite/[token]/sign-in`
- `/invite/[token]/sign-up`

**join** (1)

- `/join/[code]`

**legal** (6)

- `/legal`
- `/legal/acceptable-use`
- `/legal/cookies`
- `/legal/dpa`
- `/legal/privacy`
- `/legal/terms`

**login** (2)

- `/login/broker/[[...sign-in]]`
- `/login/realtor/[[...sign-in]]`

**offboarded** (1)

- `/offboarded`

**p** (2)

- `/p/[slug]`
- `/p/[slug]/home-value`

**packet** (1)

- `/packet/[token]`

**people** (1)

- `/people`

**pricing** (1)

- `/pricing`

**privacy** (1)

- `/privacy`

**properties** (1)

- `/properties`

**realtors** (1)

- `/realtors`

**research** (1)

- `/research`

**s** (98)

- `/s/[slug]`
- `/s/[slug]/affiliate`
- `/s/[slug]/agent`
- `/s/[slug]/agents`
- `/s/[slug]/agents/[agentId]`
- `/s/[slug]/agents/new`
- `/s/[slug]/ai`
- `/s/[slug]/analytics`
- `/s/[slug]/analytics/clients`
- `/s/[slug]/analytics/form-traffic`
- `/s/[slug]/analytics/leads`
- `/s/[slug]/analytics/pipeline`
- `/s/[slug]/analytics/tours`
- `/s/[slug]/automations`
- `/s/[slug]/automations/routines`
- `/s/[slug]/automations/settings`
- `/s/[slug]/automations/workflows`
- `/s/[slug]/billing`
- `/s/[slug]/calendar`
- `/s/[slug]/calls`
- `/s/[slug]/chippi`
- `/s/[slug]/chippi/activity`
- `/s/[slug]/chippi/approvals`
- `/s/[slug]/chippi/brief`
- `/s/[slug]/chippi/drafts`
- `/s/[slug]/chippi/full-day`
- `/s/[slug]/chippi/history`
- `/s/[slug]/chippi/inbox`
- `/s/[slug]/chippi/integrations`
- `/s/[slug]/chippi/log`
- `/s/[slug]/chippi/memory`
- `/s/[slug]/chippi/tasks`
- `/s/[slug]/chippi/tasks/[taskId]`
- `/s/[slug]/chippi/today`
- `/s/[slug]/chippi/triggers`
- `/s/[slug]/cma`
- `/s/[slug]/commissions`
- `/s/[slug]/communication`
- `/s/[slug]/configure`
- `/s/[slug]/contacts`
- `/s/[slug]/contacts/[id]`
- `/s/[slug]/deals`
- `/s/[slug]/deals/[id]`
- `/s/[slug]/deals/new`
- `/s/[slug]/documents`
- `/s/[slug]/drip`
- `/s/[slug]/email`
- `/s/[slug]/email/[id]`
- `/s/[slug]/files`
- `/s/[slug]/follow-ups`
- `/s/[slug]/form-analytics`
- `/s/[slug]/inbox`
- `/s/[slug]/intake`
- `/s/[slug]/intake/analytics`
- `/s/[slug]/intake/customize`
- `/s/[slug]/intake/share`
- `/s/[slug]/intake/tracking`
- `/s/[slug]/integrations`
- `/s/[slug]/leads`
- `/s/[slug]/leads/[id]`
- `/s/[slug]/messages`
- `/s/[slug]/offers`
- `/s/[slug]/profile`
- `/s/[slug]/profile-page`
- `/s/[slug]/properties`
- `/s/[slug]/properties/[id]`
- `/s/[slug]/properties/commissions`
- `/s/[slug]/properties/new`
- `/s/[slug]/reviews`
- `/s/[slug]/reviews/[id]`
- `/s/[slug]/routines`
- `/s/[slug]/settings`
- `/s/[slug]/settings/appearance`
- `/s/[slug]/settings/brokerage`
- `/s/[slug]/settings/browser-control`
- `/s/[slug]/settings/content`
- `/s/[slug]/settings/form-fields`
- `/s/[slug]/settings/integrations`
- `/s/[slug]/settings/legal`
- `/s/[slug]/settings/notifications`
- `/s/[slug]/settings/profile`
- `/s/[slug]/settings/templates`
- `/s/[slug]/settings/tracking`
- `/s/[slug]/studio`
- `/s/[slug]/studio/brand`
- `/s/[slug]/studio/compose`
- `/s/[slug]/studio/create`
- `/s/[slug]/studio/edit`
- `/s/[slug]/studio/library`
- `/s/[slug]/studio/schedule`
- `/s/[slug]/support`
- `/s/[slug]/swarm`
- `/s/[slug]/swarm/[runId]`
- `/s/[slug]/sync`
- `/s/[slug]/tours`
- `/s/[slug]/whatsapp`
- `/s/[slug]/whatsapp/[id]`
- `/s/[slug]/workflows`

**setup** (1)

- `/setup`

**sign-in** (1)

- `/sign-in/[[...sign-in]]`

**sign-up** (1)

- `/sign-up/[[...sign-up]]`

**status** (1)

- `/status`

**studio** (1)

- `/studio`

**subscribe** (1)

- `/subscribe`

**terms** (1)

- `/terms`

**tour** (1)

- `/tour/[token]`

**trial** (1)

- `/trial`

## API endpoints

**/api/ably** (1)

- `/api/ably/token`

**/api/account** (2)

- `/api/account/delete`
- `/api/account/export`

**/api/admin** (27)

- `/api/admin/actions`
- `/api/admin/agent-stats`
- `/api/admin/announcements`
- `/api/admin/announcements/[id]`
- `/api/admin/billing`
- `/api/admin/broadcast`
- `/api/admin/brokerages`
- `/api/admin/brokerages/[id]`
- `/api/admin/dlq`
- `/api/admin/dlq/[eventId]`
- `/api/admin/invitations`
- `/api/admin/invitations/[id]`
- `/api/admin/invite-codes`
- `/api/admin/mailchimp/sync`
- `/api/admin/memberships`
- `/api/admin/memberships/[id]`
- `/api/admin/observability`
- `/api/admin/scoring/bulk-retry`
- `/api/admin/scoring/retry`
- `/api/admin/storage-selftest`
- `/api/admin/support`
- `/api/admin/triggers/backfill`
- `/api/admin/triggers/test-fire`
- `/api/admin/users/[id]/delete`
- `/api/admin/users/[id]/export`
- `/api/admin/users/[id]/profile`
- `/api/admin/users/[id]/role`

**/api/affiliate** (1)

- `/api/affiliate`

**/api/agent** (52)

- `/api/agent/active-runs`
- `/api/agent/activity`
- `/api/agent/activity/[id]/reverse`
- `/api/agent/approvals`
- `/api/agent/artifacts`
- `/api/agent/artifacts/[artifactId]`
- `/api/agent/artifacts/[artifactId]/download`
- `/api/agent/brief/[contactId]`
- `/api/agent/brief/sections`
- `/api/agent/briefing`
- `/api/agent/briefing/test`
- `/api/agent/contact-context/[contactId]`
- `/api/agent/contact/[id]`
- `/api/agent/deal/[id]`
- `/api/agent/directive`
- `/api/agent/draft-stats`
- `/api/agent/drafts`
- `/api/agent/drafts/[id]`
- `/api/agent/drafts/batch-approve`
- `/api/agent/drafts/feedback`
- `/api/agent/events`
- `/api/agent/goals`
- `/api/agent/goals/[id]`
- `/api/agent/inbound`
- `/api/agent/insights`
- `/api/agent/memory`
- `/api/agent/memory/[id]`
- `/api/agent/morning`
- `/api/agent/portfolio`
- `/api/agent/priority`
- `/api/agent/questions`
- `/api/agent/questions/[id]`
- `/api/agent/quick-draft`
- `/api/agent/rescore-contact`
- `/api/agent/run-now`
- `/api/agent/runs`
- `/api/agent/send`
- `/api/agent/settings`
- `/api/agent/stream`
- `/api/agent/tasks`
- `/api/agent/tasks/[taskId]`
- `/api/agent/tasks/[taskId]/status`
- `/api/agent/today`
- `/api/agent/trigger`
- `/api/agent/trigger/config`
- `/api/agent/trigger/events`
- `/api/agent/trigger/events/summary`
- `/api/agent/trigger/health`
- `/api/agent/trigger/ops`
- `/api/agent/trigger/ops/summary`
- `/api/agent/trigger/replay`
- `/api/agent/usage`

**/api/ai** (22)

- `/api/ai/attachments`
- `/api/ai/attachments/[id]`
- `/api/ai/broker-conversations`
- `/api/ai/broker-conversations/[id]`
- `/api/ai/broker-messages`
- `/api/ai/broker-task`
- `/api/ai/broker-task/resume/[pausedRunId]`
- `/api/ai/conversations`
- `/api/ai/conversations/[id]`
- `/api/ai/health`
- `/api/ai/messages`
- `/api/ai/realtime-delegate`
- `/api/ai/realtime-session`
- `/api/ai/speak`
- `/api/ai/stop`
- `/api/ai/task`
- `/api/ai/task/resume/[pausedRunId]`
- `/api/ai/transcribe`
- `/api/ai/turn-status`
- `/api/ai/turns`
- `/api/ai/turns/[turnId]`
- `/api/ai/warmup`

**/api/ai-profile** (1)

- `/api/ai-profile`

**/api/applications** (9)

- `/api/applications/[id]/message`
- `/api/applications/[id]/status`
- `/api/applications/compare`
- `/api/applications/pdf`
- `/api/applications/portal`
- `/api/applications/portal/message`
- `/api/applications/portal/tour-request`
- `/api/applications/portal/tour/[tourId]/respond`
- `/api/applications/status`

**/api/areas** (1)

- `/api/areas/analyze`

**/api/auth** (1)

- `/api/auth/me`

**/api/billing** (6)

- `/api/billing/cancel`
- `/api/billing/checkout`
- `/api/billing/checkout-value`
- `/api/billing/credits/checkout`
- `/api/billing/portal`
- `/api/billing/redeem-invite`

**/api/brief** (1)

- `/api/brief/unsubscribe`

**/api/broker** (48)

- `/api/broker/activity`
- `/api/broker/agent-activity`
- `/api/broker/assign-lead`
- `/api/broker/billing/cancel`
- `/api/broker/billing/portal`
- `/api/broker/commissions/export`
- `/api/broker/commissions/ledger/[id]`
- `/api/broker/contacts`
- `/api/broker/create`
- `/api/broker/export`
- `/api/broker/form-config`
- `/api/broker/form-config/push`
- `/api/broker/integrations`
- `/api/broker/integrations/[id]`
- `/api/broker/integrations/connect/[toolkit]`
- `/api/broker/invitations/[id]`
- `/api/broker/invite`
- `/api/broker/invite/bulk`
- `/api/broker/join`
- `/api/broker/join-code`
- `/api/broker/lead-note`
- `/api/broker/leads/[id]`
- `/api/broker/leads/export`
- `/api/broker/leads/import`
- `/api/broker/members/[id]`
- `/api/broker/members/[id]/offboard`
- `/api/broker/members/[id]/role`
- `/api/broker/mentions`
- `/api/broker/morning`
- `/api/broker/notifications`
- `/api/broker/profile`
- `/api/broker/properties`
- `/api/broker/properties/[id]/assign`
- `/api/broker/realtors/[userId]`
- `/api/broker/reviews`
- `/api/broker/reviews/[id]`
- `/api/broker/reviews/[id]/comments`
- `/api/broker/routines`
- `/api/broker/routines/[id]`
- `/api/broker/routing-rules`
- `/api/broker/routing-rules/[id]`
- `/api/broker/settings`
- `/api/broker/stats`
- `/api/broker/team-activity`
- `/api/broker/templates`
- `/api/broker/templates/[id]`
- `/api/broker/templates/[id]/publish`
- `/api/broker/unassign-lead`

**/api/brokerages** (1)

- `/api/brokerages/leads`

**/api/browser** (3)

- `/api/browser/frame-check`
- `/api/browser/proxy`
- `/api/browser/search`

**/api/browser-control** (14)

- `/api/browser-control/actions`
- `/api/browser-control/frame`
- `/api/browser-control/headless/complete`
- `/api/browser-control/headless/frame`
- `/api/browser-control/headless/poll`
- `/api/browser-control/headless/start`
- `/api/browser-control/headless/status`
- `/api/browser-control/headless/stop`
- `/api/browser-control/link/[id]`
- `/api/browser-control/link/[id]/rotate`
- `/api/browser-control/pair/code`
- `/api/browser-control/pair/redeem`
- `/api/browser-control/poll`
- `/api/browser-control/status`

**/api/calendar** (1)

- `/api/calendar/events`

**/api/calls** (2)

- `/api/calls`
- `/api/calls/[id]`

**/api/cards** (2)

- `/api/cards/[type]/[id]`
- `/api/cards/contact/[id]`

**/api/chippi** (5)

- `/api/chippi/activity`
- `/api/chippi/approvals`
- `/api/chippi/post-tour`
- `/api/chippi/post-tour/execute`
- `/api/chippi/transcribe`

**/api/clients** (13)

- `/api/clients/auth/login`
- `/api/clients/auth/logout`
- `/api/clients/auth/request-reset`
- `/api/clients/auth/resend`
- `/api/clients/auth/reset`
- `/api/clients/auth/signup`
- `/api/clients/auth/verify`
- `/api/clients/book`
- `/api/clients/deals`
- `/api/clients/deals/[id]`
- `/api/clients/documents`
- `/api/clients/info-request`
- `/api/clients/messages`

**/api/cma** (4)

- `/api/cma`
- `/api/cma/[id]`
- `/api/cma/narrative`
- `/api/cma/packet/[id]`

**/api/contacts** (14)

- `/api/contacts`
- `/api/contacts/[id]`
- `/api/contacts/[id]/activity`
- `/api/contacts/[id]/client-documents`
- `/api/contacts/[id]/client-messages`
- `/api/contacts/[id]/email`
- `/api/contacts/[id]/info-request`
- `/api/contacts/[id]/rescore`
- `/api/contacts/[id]/timeline`
- `/api/contacts/bulk`
- `/api/contacts/duplicates`
- `/api/contacts/import`
- `/api/contacts/merge`
- `/api/contacts/parse`

**/api/cron** (25)

- `/api/cron/agent-run-reconcile`
- `/api/cron/agent-sweep`
- `/api/cron/agent-tasks`
- `/api/cron/broker-routines`
- `/api/cron/broker-weekly-report`
- `/api/cron/cleanup`
- `/api/cron/conversation-turn-recovery`
- `/api/cron/daily-briefing`
- `/api/cron/deal-checklist-reminders`
- `/api/cron/draft-outcomes`
- `/api/cron/extraction-backfill`
- `/api/cron/follow-up-reminders`
- `/api/cron/lead-sla`
- `/api/cron/next-moves`
- `/api/cron/notification-digest`
- `/api/cron/review-nudge`
- `/api/cron/routines`
- `/api/cron/scheduled-messages`
- `/api/cron/seat-reconcile`
- `/api/cron/storage-gc`
- `/api/cron/sweep-paused-runs`
- `/api/cron/tour-reminders`
- `/api/cron/work-session-action-recovery`
- `/api/cron/workflows`
- `/api/cron/workspace-run-recovery`

**/api/custom-agents** (2)

- `/api/custom-agents`
- `/api/custom-agents/[id]`

**/api/deals** (15)

- `/api/deals`
- `/api/deals/[id]`
- `/api/deals/[id]/activity`
- `/api/deals/[id]/checklist`
- `/api/deals/[id]/checklist/[itemId]`
- `/api/deals/[id]/checklist/shift`
- `/api/deals/[id]/commission-splits`
- `/api/deals/[id]/commission-splits/[splitId]`
- `/api/deals/[id]/contacts/[contactId]`
- `/api/deals/[id]/documents`
- `/api/deals/[id]/documents/[docId]`
- `/api/deals/[id]/next-move`
- `/api/deals/[id]/review-request`
- `/api/deals/bulk`
- `/api/deals/reorder`

**/api/diagnostics** (1)

- `/api/diagnostics/background`

**/api/documents** (2)

- `/api/documents`
- `/api/documents/[id]`

**/api/drip** (5)

- `/api/drip/enroll`
- `/api/drip/enroll/[id]`
- `/api/drip/sequences`
- `/api/drip/sequences/[id]`
- `/api/drip/tick`

**/api/email** (4)

- `/api/email`
- `/api/email/[id]`
- `/api/email/send`
- `/api/email/star`

**/api/esign** (2)

- `/api/esign/[id]`
- `/api/esign/send`

**/api/files** (4)

- `/api/files`
- `/api/files/[id]`
- `/api/files/documents`
- `/api/files/documents/[id]`

**/api/form-analytics** (1)

- `/api/form-analytics`

**/api/form-config** (4)

- `/api/form-config`
- `/api/form-config/optimize`
- `/api/form-config/optimize/score-preview`
- `/api/form-config/templates`

**/api/form-draft** (2)

- `/api/form-draft`
- `/api/form-draft/send-link`

**/api/health** (1)

- `/api/health`

**/api/inngest** (1)

- `/api/inngest`

**/api/integrations** (6)

- `/api/integrations`
- `/api/integrations/[id]`
- `/api/integrations/connect/[toolkit]`
- `/api/integrations/follow-up-boss`
- `/api/integrations/health`
- `/api/integrations/kvcore`

**/api/internal** (14)

- `/api/internal/area-research`
- `/api/internal/automations/create`
- `/api/internal/integrations/execute`
- `/api/internal/integrations/search`
- `/api/internal/messages/send`
- `/api/internal/notify`
- `/api/internal/plugins/call`
- `/api/internal/studio/edit`
- `/api/internal/studio/generate`
- `/api/internal/swarm-runs/launch`
- `/api/internal/workspace-runs/callback`
- `/api/internal/workspace-runs/launch-claim`
- `/api/internal/workspace-runs/tasks/callback`
- `/api/internal/workspace-runs/tasks/launch-claim`

**/api/invitations** (1)

- `/api/invitations/[token]`

**/api/leads** (1)

- `/api/leads/first-touch`

**/api/mcp** (3)

- `/api/mcp`
- `/api/mcp/oauth/authorize`
- `/api/mcp/oauth/token`

**/api/mcp-keys** (2)

- `/api/mcp-keys`
- `/api/mcp-keys/[id]`

**/api/message-templates** (2)

- `/api/message-templates`
- `/api/message-templates/[id]`

**/api/messages** (9)

- `/api/messages/attachment`
- `/api/messages/channels`
- `/api/messages/channels/[id]/messages`
- `/api/messages/channels/[id]/read`
- `/api/messages/channels/[id]/typing`
- `/api/messages/dm`
- `/api/messages/presence`
- `/api/messages/token`
- `/api/messages/upload`

**/api/notes** (2)

- `/api/notes`
- `/api/notes/[id]`

**/api/notification-preferences** (1)

- `/api/notification-preferences`

**/api/notifications** (1)

- `/api/notifications`

**/api/offers** (3)

- `/api/offers`
- `/api/offers/[id]`
- `/api/offers/[id]/transition`

**/api/onboarding** (1)

- `/api/onboarding`

**/api/packet** (1)

- `/api/packet/[token]/documents/[docId]`

**/api/pipelines** (2)

- `/api/pipelines`
- `/api/pipelines/[id]`

**/api/platform** (2)

- `/api/platform/announcements`
- `/api/platform/announcements/dismiss`

**/api/plugins** (2)

- `/api/plugins`
- `/api/plugins/[id]`

**/api/profile-page** (3)

- `/api/profile-page`
- `/api/profile-page/cover-photo`
- `/api/profile-page/profile-photo`

**/api/properties** (5)

- `/api/properties`
- `/api/properties/[id]`
- `/api/properties/[id]/analyze`
- `/api/properties/[id]/packets`
- `/api/properties/[id]/packets/[packetId]`

**/api/public** (4)

- `/api/public/apply`
- `/api/public/apply/brokerage`
- `/api/public/home-value/[slug]`
- `/api/public/intake-chat`

**/api/push** (1)

- `/api/push/subscribe`

**/api/reviews** (1)

- `/api/reviews/[campaignId]`

**/api/routines** (2)

- `/api/routines`
- `/api/routines/[id]`

**/api/saved-views** (1)

- `/api/saved-views`

**/api/search** (1)

- `/api/search`

**/api/settings** (2)

- `/api/settings/language`
- `/api/settings/tracking`

**/api/skills** (2)

- `/api/skills`
- `/api/skills/[id]`

**/api/space** (2)

- `/api/space/[slug]/reviews`
- `/api/space/[slug]/reviews/[id]`

**/api/spaces** (1)

- `/api/spaces`

**/api/stages** (3)

- `/api/stages`
- `/api/stages/[id]`
- `/api/stages/reorder`

**/api/studio** (6)

- `/api/studio/brand`
- `/api/studio/edit`
- `/api/studio/generate`
- `/api/studio/library`
- `/api/studio/recent-job`
- `/api/studio/schedule`

**/api/support** (1)

- `/api/support`

**/api/swarm** (4)

- `/api/swarm`
- `/api/swarm/[runId]`
- `/api/swarm/[runId]/cancel`
- `/api/swarm/[runId]/stream`

**/api/sync** (1)

- `/api/sync`

**/api/tours** (16)

- `/api/tours`
- `/api/tours/[id]`
- `/api/tours/[id]/prep`
- `/api/tours/available`
- `/api/tours/book`
- `/api/tours/convert`
- `/api/tours/feedback`
- `/api/tours/gcal`
- `/api/tours/manage`
- `/api/tours/overrides`
- `/api/tours/overrides/[id]`
- `/api/tours/properties`
- `/api/tours/properties/[id]`
- `/api/tours/reminders`
- `/api/tours/waitlist`
- `/api/tours/waitlist/notify`

**/api/triggers** (1)

- `/api/triggers/events`

**/api/upload** (2)

- `/api/upload`
- `/api/upload/onboarding`

**/api/vectorize** (1)

- `/api/vectorize/sync`

**/api/webhooks** (4)

- `/api/webhooks/clerk`
- `/api/webhooks/composio`
- `/api/webhooks/stripe`
- `/api/webhooks/telnyx-voice`

**/api/whatsapp** (3)

- `/api/whatsapp`
- `/api/whatsapp/[id]`
- `/api/whatsapp/send`

**/api/work-sessions** (4)

- `/api/work-sessions`
- `/api/work-sessions/[id]`
- `/api/work-sessions/[id]/actions`
- `/api/work-sessions/[id]/artifact`

**/api/worker** (1)

- `/api/worker/execute`

**/api/workflows** (11)

- `/api/workflows`
- `/api/workflows/[id]`
- `/api/workflows/[id]/runs`
- `/api/workflows/[id]/test-run`
- `/api/workflows/[id]/test-step`
- `/api/workflows/[id]/webhook`
- `/api/workflows/connected-apps`
- `/api/workflows/generate`
- `/api/workflows/runs`
- `/api/workflows/sample-trigger`
- `/api/workflows/trigger-options`

**/api/workspace-runs** (4)

- `/api/workspace-runs/[id]`
- `/api/workspace-runs/[id]/files/[fileId]`
- `/api/workspace-runs/[id]/files/[fileId]/workbench`
- `/api/workspace-runs/[id]/tasks`

## Cron jobs (vercel.json)

| Path | Schedule |
|------|----------|
| `/api/cron/conversation-turn-recovery` | `*/5 * * * *` |
| `/api/cron/work-session-action-recovery` | `*/5 * * * *` |
| `/api/cron/workspace-run-recovery` | `*/5 * * * *` |

## Inbound webhooks

- `/api/webhooks/clerk`
- `/api/webhooks/composio`
- `/api/webhooks/stripe`
- `/api/webhooks/telnyx-voice`

## Agent tool catalogs

Two hand-maintained catalogs. A new agent verb must be added in **both** or
the runtimes diverge — this table makes the drift visible.

- **In both runtimes (18):** `add_property`, `ask_realtor`, `create_automation`, `create_deal`, `create_plan`, `delete_contact`, `delete_deal`, `delete_property`, `delete_tour`, `find_stuck_deals`, `generate_studio_image`, `get_weather`, `list_plugins`, `read_attachment`, `request_deal_review`, `research_area`, `send_property_packet`, `use_plugin`

- **TS only (64):** `add_checklist_item`, `add_person`, `analyze_property_values`, `analyze_realtor`, `archive_person`, `assign_lead_to_realtor`, `attach_file_to_property`, `attach_property_to_deal`, `block_time`, `browser_task`, `cancel_tour`, `check_availability`, `clear_followup`, `continue_workspace_run`, `control_browser`, `delegate_task`, `draft_contingency`, `draft_counter_offer`, `draft_email`, `draft_offer`, `draft_sms`, `find_comparable_properties`, `find_deal`, `find_overdue_followups`, `find_person`, `find_property`, `find_quiet_hot_persons`, `find_tours`, `get_recent_events`, `inspect_workbook`, `list_contacts`, `list_files`, `log_call`, `log_email_sent`, `log_meeting`, `log_sms_sent`, `mark_deal_lost`, `mark_deal_won`, `mark_person_cold`, `mark_person_hot`, `merge_persons`, `move_deal_stage`, `note_on_deal`, `note_on_person`, `note_on_property`, `open_spreadsheet_in_workbench`, `pipeline_summary`, `propose_tour_times`, `read_file`, `read_spreadsheet`, `recall_history`, `reschedule_tour`, `schedule_tour`, `send_email`, `send_sms`, `set_followup`, `start_work_session`, `summarize_document`, `summarize_realtor`, `update_deal_close_date`, `update_deal_probability`, `update_deal_value`, `update_property_status`, `workspace_stats`

- **Python only (45):** `add_intake_question`, `advance_deal_stage`, `analyze_portfolio`, `audit_response_times`, `book_tour`, `call_integration_tool`, `change_member_role`, `commission_report`, `create_contact`, `draft_message`, `edit_studio_image`, `find_at_risk_agents`, `find_breached_leads`, `find_contacts`, `find_deals`, `find_integration_tool`, `find_unassigned_leads`, `flag_deal_for_broker_review`, `generate_priority_list`, `get_contact_activity`, `get_intake_form`, `log_activity_run`, `manage_goal`, `manage_routines`, `message_teammate`, `offboard_member`, `outcome`, `process_inbound_message`, `read_realtor_morning_story`, `realtor_performance`, `reassign_lead`, `recall_docs`, `recall_memory`, `remove_intake_question`, `route_lead`, `save_intake_form`, `send_email_now`, `send_sms_now`, `send_team_announcement`, `set_routing_rule`, `store_memory`, `team_health`, `update_contact`, `update_deal`, `update_intake_question`

## Data model (supabase/schema.sql)

**Tables (153):** `AIUserProfile`, `AffiliateAccount`, `AgentActionProposal`, `AgentActivityLog`, `AgentDraft`, `AgentEventInbox`, `AgentGoal`, `AgentJobRun`, `AgentMemory`, `AgentOutbox`, `AgentPausedRun`, `AgentQuestion`, `AgentRunArtifact`, `AgentRunEvent`, `AgentRunLedger`, `AgentSettings`, `AgentTask`, `AgentTrajectory`, `Announcement`, `AnnouncementDismissal`, `AppKnowledgeDoc`, `AppNotification`, `ApplicationMessage`, `ApplicationStatusUpdate`, `AreaReport`, `Artifact`, `ArtifactVersion`, `Attachment`, `AuditLog`, `Brief`, `BriefTipHistory`, `BrokerConversation`, `BrokerMessage`, `BrokerNotification`, `BrokerRoutine`, `Brokerage`, `BrokerageChatConversation`, `BrokerageChatMessage`, `BrokerageIntegrationConnection`, `BrokerageMembership`, `BrokerageRemoval`, `BrokerageTemplate`, `BrowserAction`, `BrowserLink`, `BrowserPairingCode`, `BrowserSession`, `CalendarEvent`, `CalendarEventMirror`, `CalendarNote`, `CallLog`, `Channel`, `ChannelMember`, `ChannelMessage`, `ChatUsage`, `ClientAuthCode`, `ClientDocument`, `ClientInfoRequest`, `ClientMessage`, `ClientUser`, `CmaReport`, `CommissionLedger`, `CommissionSplit`, `Contact`, `ContactDocument`, `Conversation`, `CreditLot`, `CreditTxn`, `CustomAgent`, `CustomPlugin`, `DeadLetterEvent`, `Deal`, `DealActivity`, `DealChecklistItem`, `DealContact`, `DealDocument`, `DealReviewComment`, `DealReviewRequest`, `DealRoutingRule`, `DealStage`, `DisabledSpace`, `DocumentEmbedding`, `DripEnrollment`, `DripSequence`, `EmailBroadcast`, `ExecutionStep`, `File`, `FormAnalyticsEvent`, `FormDraft`, `GoalDecomposition`, `GoogleCalendarToken`, `InboxMessage`, `InboxThread`, `IntegrationConnection`, `IntegrationEvent`, `IntegrationTrigger`, `Invitation`, `InviteCode`, `InviteCodeRedemption`, `McpApiKey`, `McpAuthCode`, `Message`, `MessageTemplate`, `MessagingConsent`, `MessagingSuppression`, `Note`, `NotificationPreference`, `NotificationState`, `Offer`, `OfferEvent`, `Pipeline`, `ProfilePage`, `Property`, `PropertyPacket`, `PushSubscription`, `ReviewCampaign`, `Routine`, `SavedView`, `ScheduleOccurrence`, `ScheduleOccurrenceStep`, `ScheduledMessage`, `SignatureRequest`, `Space`, `SpaceSetting`, `StudioBrand`, `StudioGeneration`, `StudioPost`, `SupportTicket`, `SwarmEvent`, `SwarmMember`, `SwarmRun`, `TaskCheckpoint`, `TaskDependency`, `TelemetryEvent`, `Tour`, `TourAvailabilityOverride`, `TourFeedback`, `TourPropertyProfile`, `TourWaitlist`, `User`, `UserSkill`, `WorkSession`, `WorkSessionAction`, `Workflow`, `WorkflowRun`, `WorkflowRunStep`, `WorkspaceRun`, `WorkspaceRunEvent`, `WorkspaceRunFile`, `WorkspaceRunLaunchReceipt`, `WorkspaceRunTask`, `WorkspaceRunTaskEvent`, `WorkspaceRunTaskFile`, `WorkspaceRunTaskPlanClaim`

**RPCs (66):** `accept_workspace_launch`, `accept_workspace_run_task_launch`, `append_agent_run_event`, `book_tour_atomic`, `broker_routine_set_next_run`, `cancel_workspace_run_and_session`, `cancel_workspace_run_task`, `charge_credits_for_chat_usage`, `claim_agent_job`, `claim_schedule_occurrence`, `claim_schedule_occurrence_step`, `claim_work_session_phase`, `claim_workspace_launch`, `claim_workspace_run_task_launch`, `cleanup_agent_data`, `count_runs_per_workflow`, `create_brokerage_with_owner`, `create_space_with_defaults`, `current_user_internal_id`, `drip_sequence_set_updated_at`, `enqueue_reserved_workspace_run_task_with_plan`, `enqueue_workspace_run_task`, `enqueue_workspace_run_task_with_plan`, `enqueue_workspace_run_task_with_program`, `ensure_agent_settings_for_space`, `fail_empty_work_session_artifact`, `fail_stale_accepted_workspace_launch`, `finish_agent_job`, `finish_schedule_occurrence`, `finish_schedule_occurrence_step`, `finish_workspace_run_and_session`, `finish_workspace_run_task`, `grant_credits`, `heartbeat_agent_job`, `heartbeat_schedule_occurrence`, `heartbeat_schedule_occurrence_step`, `list_workspace_run_recovery_candidates`, `match_agent_memory`, `match_documents`, `match_documents_hybrid`, `materialize_schedule_occurrence`, `merge_contacts`, `normalize_invite_code`, `offboard_brokerage_member`, `patch_work_session_phase`, `public`, `purge_credit_rows_for_account`, `record_workspace_launch_receipt`, `record_workspace_run_event`, `record_workspace_run_task_event`, `redeem_invite_code_atomic`, `refund_credit_txn`, `release_workspace_run_task_plan`, `reorder_deal`, `reserve_workspace_run_task_plan`, `resolve_billing_account_for_space`, `routine_next_run_at`, `routine_set_next_run`, `scheduled_message_set_updated_at`, `search_knowledge_docs`, `spend_credits`, `stamp_brief_enabled_at`, `sync_commission_ledger`, `update_updated_at_column`, `validate_agent_job_child`, `workflow_set_updated_at`

**Migrations:** 270 (latest: `20260917000000_deal_contract_dates.sql`)

## External services

- Clerk — auth / sessions  (`@clerk/nextjs`)
- Composio — integration toolkits → agent tools  (`@composio/core`)
- Inngest — durable workflows  (`inngest`)
- OpenAI Agents SDK — TS chat runtime  (`@openai/agents`)
- OpenAI — scoring, embeddings, Agents SDK  (`openai`)
- Resend — email  (`resend`)
- Sentry — error monitoring  (`@sentry/nextjs`)
- Stripe — billing  (`stripe`)
- Supabase — Postgres + pgvector  (`@supabase/supabase-js`)
- Svix — webhook signature verification  (`svix`)
- Telnyx — SMS + voice  (`telnyx`)
- Upstash Redis — queue / dedupe / locks / cache  (`@upstash/redis`)
- Vercel Analytics  (`@vercel/analytics`)
- FirstPromoter — affiliate tracking  (`FIRST_PROMOTER_*`)
- Google Calendar — OAuth tour sync  (`GOOGLE_CLIENT_*`)
- Modal — Python agent sandbox (agent/modal_app.py)  (`MODAL_*`)
- Wasabi — S3-compatible file storage  (`WASABI_*`)
- Web Push (VAPID) — browser notifications  (`VAPID_*`)
- fal.ai — Studio image/video generation  (`FAL_KEY`)
