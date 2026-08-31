-- ============================================================================
-- merge_contacts: fold InboxThread rows instead of a blind contactId UPDATE
-- ============================================================================
-- InboxThread has UNIQUE ("spaceId", "contactId") — one thread per contact.
-- The generic FK re-point (`UPDATE InboxThread SET contactId = survivor`)
-- raises unique_violation when BOTH the survivor and a duplicate already have
-- a thread (the common case: any inbound/outbound capture creates one). The
-- whole merge transaction then rolls back and the realtor cannot merge two
-- people who have both been messaged.
--
-- Same shape as the existing DealContact special-case: exclude the table from
-- the generic loop, then fold explicitly (move messages onto the survivor
-- thread, merge rollup, delete the duplicate thread; or re-point when the
-- survivor has no thread yet).
--
-- CREATE OR REPLACE of merge_contacts. Idempotent. Privileges restated.
-- ============================================================================

CREATE OR REPLACE FUNCTION merge_contacts(
  p_survivor_id    text,
  p_duplicate_ids  text[],
  p_space_id       text,
  p_actor_clerk_id text DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_survivor        "Contact"%ROWTYPE;
  v_dup             "Contact"%ROWTYPE;
  v_dup_id          text;
  v_dup_ids         text[];
  v_merged          text[] := ARRAY[]::text[];
  v_fk              record;
  v_repointed       jsonb  := '{}'::jsonb;
  v_count           bigint;
  v_total           bigint;
  v_sql             text;
  v_updates         jsonb  := '{}'::jsonb;
  v_tags            text[];
  v_props           text[];
  v_survivor_thread record;
  v_dup_thread      record;
  v_moved_msgs      bigint;
BEGIN
  -- ── Validate inputs ──────────────────────────────────────────────────────
  IF p_survivor_id IS NULL OR p_space_id IS NULL THEN
    RAISE EXCEPTION 'survivor id and space id are required';
  END IF;

  -- De-dupe the input, drop NULLs, and drop the survivor if it snuck into the
  -- duplicates list (can never merge a contact into itself).
  SELECT COALESCE(array_agg(DISTINCT d), ARRAY[]::text[])
    INTO v_dup_ids
    FROM unnest(p_duplicate_ids) AS d
   WHERE d IS NOT NULL AND d <> p_survivor_id;

  -- Cap group size — a single merge folds at most 50 duplicates. Keeps the
  -- per-dup loop and the audit payload bounded.
  IF array_length(v_dup_ids, 1) > 50 THEN
    RAISE EXCEPTION 'Too many duplicates in one merge (max 50, got %)',
      array_length(v_dup_ids, 1);
  END IF;

  -- ── Lock + verify the survivor is in this space ──────────────────────────
  SELECT * INTO v_survivor
    FROM "Contact"
   WHERE id = p_survivor_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Survivor contact % not found', p_survivor_id;
  END IF;
  IF v_survivor."spaceId" <> p_space_id THEN
    -- Space-scoping guard: never touch a contact outside the caller's space.
    RAISE EXCEPTION 'Survivor contact % is not in space %', p_survivor_id, p_space_id;
  END IF;

  -- Nothing to do (no duplicates, or they were all already merged away).
  IF v_dup_ids IS NULL OR array_length(v_dup_ids, 1) IS NULL THEN
    RETURN json_build_object(
      'survivorId', p_survivor_id,
      'merged', ARRAY[]::text[],
      'repointed', '{}'::jsonb,
      'alreadyMerged', true
    );
  END IF;

  -- ── Pre-flight: every PRESENT duplicate must be in this space ────────────
  -- A duplicate that no longer exists is fine (idempotent re-run). But a
  -- duplicate that exists in ANOTHER space is a hard error — we refuse the
  -- whole merge rather than silently skip it, because a cross-space id in the
  -- payload signals a bug or an attack, not a benign no-op.
  FOR v_dup IN
    SELECT * FROM "Contact" WHERE id = ANY(v_dup_ids) FOR UPDATE
  LOOP
    IF v_dup."spaceId" <> p_space_id THEN
      RAISE EXCEPTION 'Duplicate contact % is not in space % (cross-space merge refused)',
        v_dup.id, p_space_id;
    END IF;
  END LOOP;

  -- ── InboxThread (UNIQUE spaceId+contactId) ───────────────────────────────
  -- Must run BEFORE the generic FK loop: a blind contactId UPDATE collides
  -- when both sides already have a thread. Folding here also updates
  -- InboxMessage.contactId, so the later generic pass is a no-op for those
  -- rows. Guarded: inbox tables may be absent on an older deployment.
  IF to_regclass('"InboxThread"') IS NOT NULL AND to_regclass('"InboxMessage"') IS NOT NULL THEN
    SELECT * INTO v_survivor_thread
      FROM "InboxThread"
     WHERE "spaceId" = p_space_id AND "contactId" = p_survivor_id;

    FOR v_dup_thread IN
      SELECT * FROM "InboxThread"
       WHERE "spaceId" = p_space_id AND "contactId" = ANY(v_dup_ids)
    LOOP
      IF v_survivor_thread.id IS NOT NULL THEN
        UPDATE "InboxMessage"
           SET "threadId" = v_survivor_thread.id,
               "contactId" = p_survivor_id
         WHERE "threadId" = v_dup_thread.id;
        GET DIAGNOSTICS v_moved_msgs = ROW_COUNT;

        UPDATE "InboxThread"
           SET "lastMessageAt" = GREATEST("lastMessageAt", v_dup_thread."lastMessageAt"),
               "lastDirection" = CASE
                 WHEN v_dup_thread."lastMessageAt" > "lastMessageAt"
                   THEN v_dup_thread."lastDirection"
                 ELSE "lastDirection"
               END,
               "unreadCount" = "unreadCount" + COALESCE(v_dup_thread."unreadCount", 0),
               "status" = CASE
                 WHEN "status" = 'open' OR v_dup_thread.status = 'open' THEN 'open'
                 ELSE "status"
               END,
               "updatedAt" = now()
         WHERE id = v_survivor_thread.id;

        DELETE FROM "InboxThread" WHERE id = v_dup_thread.id;

        SELECT * INTO v_survivor_thread
          FROM "InboxThread"
         WHERE id = v_survivor_thread.id;

        v_total := COALESCE((v_repointed ->> '"InboxThread".contactId')::bigint, 0) + 1;
        v_repointed := v_repointed || jsonb_build_object('"InboxThread".contactId', v_total);
        IF v_moved_msgs > 0 THEN
          v_total := COALESCE((v_repointed ->> '"InboxMessage".contactId')::bigint, 0) + v_moved_msgs;
          v_repointed := v_repointed || jsonb_build_object('"InboxMessage".contactId', v_total);
        END IF;
      ELSE
        UPDATE "InboxThread"
           SET "contactId" = p_survivor_id, "updatedAt" = now()
         WHERE id = v_dup_thread.id;
        GET DIAGNOSTICS v_count = ROW_COUNT;

        UPDATE "InboxMessage"
           SET "contactId" = p_survivor_id
         WHERE "threadId" = v_dup_thread.id;
        GET DIAGNOSTICS v_moved_msgs = ROW_COUNT;

        SELECT * INTO v_survivor_thread
          FROM "InboxThread"
         WHERE id = v_dup_thread.id;

        IF v_count > 0 THEN
          v_total := COALESCE((v_repointed ->> '"InboxThread".contactId')::bigint, 0) + v_count;
          v_repointed := v_repointed || jsonb_build_object('"InboxThread".contactId', v_total);
        END IF;
        IF v_moved_msgs > 0 THEN
          v_total := COALESCE((v_repointed ->> '"InboxMessage".contactId')::bigint, 0) + v_moved_msgs;
          v_repointed := v_repointed || jsonb_build_object('"InboxMessage".contactId', v_total);
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- ── Discover every FK column that points at "Contact"(id) ────────────────
  -- Generic re-point: ANY table with a foreign key onto Contact (now or added
  -- later) is handled, so a future contact-referencing table can never be
  -- silently orphaned by this merge. Special-cased below: DealContact (composite
  -- PK collisions) is excluded here and handled explicitly; InboxThread
  -- (unique space+contact) is folded above; soft-link tables (no FK) are
  -- also handled explicitly.
  -- NOTE: filter on the REFERENCING table (con.conrelid), never the referenced
  -- one (con.confrelid) — confrelid is ALWAYS "Contact" here, so filtering on it
  -- would exclude every row. We skip:
  --   * "Contact" itself  → its only self-FK is mergedIntoId (our audit
  --     breadcrumb); re-pointing it generically is wrong and pointless.
  --   * "DealContact"     → composite PK, handled explicitly below.
  --   * "InboxThread"     → unique (spaceId, contactId), folded above.
  -- Single-column FKs only (array_length(conkey,1)=1); all Contact FKs are.
  FOR v_fk IN
    SELECT
      con.conrelid::regclass::text AS tbl,
      att.attname                  AS col
    FROM pg_constraint con
    JOIN pg_class      ref ON ref.oid = con.confrelid
    JOIN pg_class      rel ON rel.oid = con.conrelid
    JOIN pg_attribute  att ON att.attrelid = con.conrelid
                          AND att.attnum = con.conkey[1]
    WHERE con.contype = 'f'
      AND ref.relname = 'Contact'
      AND array_length(con.conkey, 1) = 1
      AND rel.relname NOT IN ('Contact', 'DealContact', 'InboxThread')
  LOOP
    -- Re-point this table's contact column from any duplicate to the survivor.
    v_sql := format(
      'UPDATE %s SET %I = %L WHERE %I = ANY(%L)',
      v_fk.tbl, v_fk.col, p_survivor_id, v_fk.col, v_dup_ids
    );
    EXECUTE v_sql;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
      v_total := COALESCE((v_repointed ->> (v_fk.tbl || '.' || v_fk.col))::bigint, 0) + v_count;
      v_repointed := v_repointed || jsonb_build_object(v_fk.tbl || '.' || v_fk.col, v_total);
    END IF;
  END LOOP;

  -- ── DealContact (composite PK dealId+contactId) ──────────────────────────
  -- A straight UPDATE would violate the PK if a deal already links both the
  -- survivor and a duplicate. Insert the missing (deal, survivor) links first,
  -- then delete every duplicate link. ON CONFLICT DO NOTHING handles the
  -- already-linked case.
  INSERT INTO "DealContact" ("dealId", "contactId")
  SELECT DISTINCT dc."dealId", p_survivor_id
    FROM "DealContact" dc
   WHERE dc."contactId" = ANY(v_dup_ids)
  ON CONFLICT ("dealId", "contactId") DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    v_repointed := v_repointed || jsonb_build_object('"DealContact".contactId', v_count);
  END IF;

  DELETE FROM "DealContact" WHERE "contactId" = ANY(v_dup_ids);

  -- ── Soft-link tables (contactId stored, NO FK constraint) ────────────────
  -- These won't show up in the pg_constraint scan, so re-point them by name.
  -- IF-table-exists guards keep the function valid on databases where a given
  -- feature migration hasn't run yet.
  IF to_regclass('"CallLog"') IS NOT NULL THEN
    UPDATE "CallLog" SET "contactId" = p_survivor_id
     WHERE "contactId" = ANY(v_dup_ids) AND "spaceId" = p_space_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
      v_repointed := v_repointed || jsonb_build_object('"CallLog".contactId', v_count);
    END IF;
  END IF;

  IF to_regclass('"SignatureRequest"') IS NOT NULL THEN
    UPDATE "SignatureRequest" SET "contactId" = p_survivor_id
     WHERE "contactId" = ANY(v_dup_ids) AND "spaceId" = p_space_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
      v_repointed := v_repointed || jsonb_build_object('"SignatureRequest".contactId', v_count);
    END IF;
  END IF;

  -- ── Merge field values: survivor wins, blanks filled from a duplicate ─────
  -- Walk duplicates oldest-first so the earliest non-null value wins a blank.
  -- Tags + properties are UNIONED across survivor and all duplicates.
  v_tags  := COALESCE(v_survivor.tags, ARRAY[]::text[]);
  v_props := COALESCE(v_survivor.properties, ARRAY[]::text[]);

  FOR v_dup IN
    SELECT * FROM "Contact"
     WHERE id = ANY(v_dup_ids)
     ORDER BY "createdAt" ASC
  LOOP
    -- Scalar text/number fields: fill ONLY if the survivor's is still blank.
    -- We accumulate into v_survivor so successive duplicates can fill different
    -- gaps. NULLIF(...,'') treats empty strings as blank too.
    v_survivor.email       := COALESCE(NULLIF(v_survivor.email, ''), NULLIF(v_dup.email, ''));
    v_survivor.phone       := COALESCE(NULLIF(v_survivor.phone, ''), NULLIF(v_dup.phone, ''));
    v_survivor.address     := COALESCE(NULLIF(v_survivor.address, ''), NULLIF(v_dup.address, ''));
    v_survivor.notes       := COALESCE(NULLIF(v_survivor.notes, ''), NULLIF(v_dup.notes, ''));
    v_survivor.preferences := COALESCE(NULLIF(v_survivor.preferences, ''), NULLIF(v_dup.preferences, ''));
    v_survivor.budget      := COALESCE(v_survivor.budget, v_dup.budget);
    v_survivor."followUpAt"      := COALESCE(v_survivor."followUpAt", v_dup."followUpAt");
    v_survivor."lastContactedAt" := COALESCE(v_survivor."lastContactedAt", v_dup."lastContactedAt");
    v_survivor."sourceLabel"     := COALESCE(NULLIF(v_survivor."sourceLabel", ''), NULLIF(v_dup."sourceLabel", ''));
    v_survivor."source"          := COALESCE(v_survivor."source", v_dup."source");
    v_survivor."sourceDetail"    := COALESCE(NULLIF(v_survivor."sourceDetail", ''), NULLIF(v_dup."sourceDetail", ''));
    v_survivor."leadScore"       := COALESCE(v_survivor."leadScore", v_dup."leadScore");
    v_survivor."scoreLabel"      := COALESCE(NULLIF(v_survivor."scoreLabel", ''), NULLIF(v_dup."scoreLabel", ''));
    v_survivor."scoreSummary"    := COALESCE(NULLIF(v_survivor."scoreSummary", ''), NULLIF(v_dup."scoreSummary", ''));
    v_survivor."scoreDetails"    := COALESCE(v_survivor."scoreDetails", v_dup."scoreDetails");
    v_survivor."applicationData" := COALESCE(v_survivor."applicationData", v_dup."applicationData");

    -- Union tags + properties.
    v_tags  := ARRAY(SELECT DISTINCT unnest(v_tags  || COALESCE(v_dup.tags, ARRAY[]::text[])));
    v_props := ARRAY(SELECT DISTINCT unnest(v_props || COALESCE(v_dup.properties, ARRAY[]::text[])));

    -- Tombstone the duplicate with a forward pointer BEFORE deleting it, so an
    -- observer mid-transaction (or a crash) sees where it went.
    UPDATE "Contact" SET "mergedIntoId" = p_survivor_id WHERE id = v_dup.id;
    v_merged := v_merged || v_dup.id;
  END LOOP;

  -- Persist the merged survivor. statusPortalToken / applicationRef are
  -- deliberately NOT copied from duplicates — they are per-contact unique
  -- tokens (statusPortalToken has a UNIQUE constraint) and the survivor keeps
  -- its own.
  UPDATE "Contact"
     SET email           = v_survivor.email,
         phone           = v_survivor.phone,
         address         = v_survivor.address,
         notes           = v_survivor.notes,
         preferences     = v_survivor.preferences,
         budget          = v_survivor.budget,
         "followUpAt"      = v_survivor."followUpAt",
         "lastContactedAt" = v_survivor."lastContactedAt",
         "sourceLabel"     = v_survivor."sourceLabel",
         "source"          = v_survivor."source",
         "sourceDetail"    = v_survivor."sourceDetail",
         "leadScore"       = v_survivor."leadScore",
         "scoreLabel"      = v_survivor."scoreLabel",
         "scoreSummary"    = v_survivor."scoreSummary",
         "scoreDetails"    = v_survivor."scoreDetails",
         "applicationData" = v_survivor."applicationData",
         tags            = v_tags,
         properties      = v_props,
         "updatedAt"     = now()
   WHERE id = p_survivor_id;

  -- ── Audit row (best-effort within the txn) ───────────────────────────────
  -- Records WHO merged WHAT into the survivor, with the per-table re-point
  -- counts. Lives in the same AuditLog table the API audit() helper writes to.
  IF to_regclass('"AuditLog"') IS NOT NULL THEN
    INSERT INTO "AuditLog" (id, "clerkId", action, resource, "resourceId", "spaceId", metadata)
    VALUES (
      gen_random_uuid()::text,
      p_actor_clerk_id,
      'UPDATE',
      'Contact',
      p_survivor_id,
      p_space_id,
      jsonb_build_object(
        'op', 'merge',
        'survivorId', p_survivor_id,
        'mergedIds', v_merged,
        'repointed', v_repointed
      )
    );
  END IF;

  -- ── Delete the duplicates LAST ───────────────────────────────────────────
  -- Every reference has been re-pointed; deleting now cannot orphan anything.
  -- If any statement above had failed, we'd have aborted before reaching here
  -- and the duplicates would still be intact.
  DELETE FROM "Contact" WHERE id = ANY(v_merged);

  RETURN json_build_object(
    'survivorId', p_survivor_id,
    'merged', v_merged,
    'repointed', v_repointed,
    'alreadyMerged', (array_length(v_merged, 1) IS NULL)
  );
END;
$$;

REVOKE ALL ON FUNCTION merge_contacts(text, text[], text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION merge_contacts(text, text[], text, text) FROM authenticated;
REVOKE ALL ON FUNCTION merge_contacts(text, text[], text, text) FROM anon;
GRANT EXECUTE ON FUNCTION merge_contacts(text, text[], text, text) TO service_role;
