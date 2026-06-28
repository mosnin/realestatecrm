-- Performance: stop RLS policies re-evaluating auth functions per row.
--
-- The advisor flagged 14 authenticated-path RLS policies that call auth.uid()/
-- auth.jwt() once PER ROW. Wrapping the call in a scalar subquery —
-- (select auth.jwt()) — makes Postgres evaluate it ONCE per query (an InitPlan)
-- instead, a large win on big tables. This is the exact fix Supabase documents
-- (database-linter 0003_auth_rls_initplan) and is SEMANTICALLY IDENTICAL: same
-- expression, same result, only the evaluation count changes.
--
-- Each USING expression below is the live policy definition (pulled from
-- pg_get_expr) with only the auth.* calls wrapped — nothing else changed. These
-- policies gate the authenticated/realtime read path; the app's service-role
-- access bypasses RLS entirely and is unaffected. Validated against prod via a
-- rolled-back transaction before commit.

ALTER POLICY "user: own row only" ON public."User"
  USING (("clerkId" = ((select auth.uid()))::text));
ALTER POLICY "realtime_authenticated_contact_select" ON public."Contact"
  USING (("spaceId" IN ( SELECT s.id
   FROM ("Space" s
     JOIN "User" u ON ((u.id = s."ownerId")))
  WHERE (u."clerkId" = ((select auth.jwt()) ->> 'sub'::text)))));
ALTER POLICY "realtime_authenticated_deal_select" ON public."Deal"
  USING (("spaceId" IN ( SELECT s.id
   FROM ("Space" s
     JOIN "User" u ON ((u.id = s."ownerId")))
  WHERE (u."clerkId" = ((select auth.jwt()) ->> 'sub'::text)))));
ALTER POLICY "realtime_authenticated_dealstage_select" ON public."DealStage"
  USING (("spaceId" IN ( SELECT s.id
   FROM ("Space" s
     JOIN "User" u ON ((u.id = s."ownerId")))
  WHERE (u."clerkId" = ((select auth.jwt()) ->> 'sub'::text)))));
ALTER POLICY "realtime_authenticated_tour_select" ON public."Tour"
  USING (("spaceId" IN ( SELECT s.id
   FROM ("Space" s
     JOIN "User" u ON ((u.id = s."ownerId")))
  WHERE (u."clerkId" = ((select auth.jwt()) ->> 'sub'::text)))));
ALTER POLICY "integration_connection_authenticated_select" ON public."IntegrationConnection"
  USING (("spaceId" IN ( SELECT s.id
   FROM ("Space" s
     JOIN "User" u ON ((u.id = s."ownerId")))
  WHERE (u."clerkId" = ((select auth.jwt()) ->> 'sub'::text)))));
ALTER POLICY "integration_trigger_authenticated_select" ON public."IntegrationTrigger"
  USING (("connectionId" IN ( SELECT ic.id
   FROM (("IntegrationConnection" ic
     JOIN "Space" s ON ((s.id = ic."spaceId")))
     JOIN "User" u ON ((u.id = s."ownerId")))
  WHERE (u."clerkId" = ((select auth.jwt()) ->> 'sub'::text)))));
ALTER POLICY "brokerage_integration_connection_authenticated_select" ON public."BrokerageIntegrationConnection"
  USING (("brokerageId" IN ( SELECT m."brokerageId"
   FROM ("BrokerageMembership" m
     JOIN "User" u ON ((u.id = m."userId")))
  WHERE ((u."clerkId" = ((select auth.jwt()) ->> 'sub'::text)) AND (m.role = ANY (ARRAY['broker_owner'::text, 'broker_admin'::text]))))));
ALTER POLICY "integration_event_authenticated_select" ON public."IntegrationEvent"
  USING (("spaceId" IN ( SELECT s.id
   FROM ("Space" s
     JOIN "User" u ON ((u.id = s."ownerId")))
  WHERE (u."clerkId" = ((select auth.jwt()) ->> 'sub'::text)))));
ALTER POLICY "saved_view_authenticated_select" ON public."SavedView"
  USING (("spaceId" IN ( SELECT s.id
   FROM ("Space" s
     JOIN "User" u ON ((u.id = s."ownerId")))
  WHERE (u."clerkId" = ((select auth.jwt()) ->> 'sub'::text)))));
ALTER POLICY "notification_preference_authenticated_select" ON public."NotificationPreference"
  USING (("spaceId" IN ( SELECT s.id
   FROM ("Space" s
     JOIN "User" u ON ((u.id = s."ownerId")))
  WHERE (u."clerkId" = ((select auth.jwt()) ->> 'sub'::text)))));
ALTER POLICY "inbox_thread_authenticated_select" ON public."InboxThread"
  USING (("spaceId" IN ( SELECT s.id
   FROM ("Space" s
     JOIN "User" u ON ((u.id = s."ownerId")))
  WHERE (u."clerkId" = ((select auth.jwt()) ->> 'sub'::text)))));
ALTER POLICY "inbox_message_authenticated_select" ON public."InboxMessage"
  USING (("spaceId" IN ( SELECT s.id
   FROM ("Space" s
     JOIN "User" u ON ((u.id = s."ownerId")))
  WHERE (u."clerkId" = ((select auth.jwt()) ->> 'sub'::text)))));
ALTER POLICY "invite_redemption_authenticated_select" ON public."InviteCodeRedemption"
  USING (("spaceId" IN ( SELECT s.id
   FROM ("Space" s
     JOIN "User" u ON ((u.id = s."ownerId")))
  WHERE (u."clerkId" = ((select auth.jwt()) ->> 'sub'::text)))));
