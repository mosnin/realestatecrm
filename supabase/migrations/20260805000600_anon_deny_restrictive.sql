-- Security + cleanup: make the anon deny policies RESTRICTIVE.
--
-- 20260805000400 added permissive `deny_anon_*_select USING(false)` policies.
-- But the "<x>: space owner only" policy is a PUBLIC, ALL-command policy, so it
-- is also evaluated for anon (it returns no rows for anon, since
-- current_user_internal_id() is null without a user JWT — so anon was already
-- denied in practice). Two permissive SELECT policies for the anon role,
-- however, (a) re-trip the advisor's multiple_permissive_policies and (b) leave
-- anon's denial *implicit* (it depends on the owner subquery being empty).
--
-- Converting the deny to RESTRICTIVE fixes both: a restrictive policy AND-combines,
-- so anon SELECT = (space-owner-check) AND (false) = denied, unconditionally and
-- explicitly — and restrictive policies don't count toward multiple_permissive,
-- so the anon warnings clear. Authenticated/service-role paths are untouched.

DROP POLICY IF EXISTS deny_anon_contact_select ON "Contact";
CREATE POLICY deny_anon_contact_select ON "Contact" AS RESTRICTIVE FOR SELECT TO anon USING (false);

DROP POLICY IF EXISTS deny_anon_deal_select ON "Deal";
CREATE POLICY deny_anon_deal_select ON "Deal" AS RESTRICTIVE FOR SELECT TO anon USING (false);

DROP POLICY IF EXISTS deny_anon_dealstage_select ON "DealStage";
CREATE POLICY deny_anon_dealstage_select ON "DealStage" AS RESTRICTIVE FOR SELECT TO anon USING (false);

DROP POLICY IF EXISTS deny_anon_tour_select ON "Tour";
CREATE POLICY deny_anon_tour_select ON "Tour" AS RESTRICTIVE FOR SELECT TO anon USING (false);
