/**
 * GET /api/cron/storage-gc
 *
 * Daily sweep that diffs Wasabi against DB row references and removes
 * orphan objects. Pairs with inline `deleteObjectsBestEffort` calls in
 * Contact/Deal/Property DELETE handlers — the inline path is the fast
 * path, this sweeper catches anything that fell through (Wasabi 5xx
 * during the inline delete, historical rows from before the inline
 * fix shipped, race conditions on cascade deletes).
 *
 * Auth: Bearer ${CRON_SECRET} (matches the other crons).
 *
 * Safety design:
 *   - Per-tick cap so a single bad listing can't run for hours.
 *   - Skip objects modified in the last GRACE_MS window — a fresh upload
 *     whose DB row insert hasn't committed yet would otherwise look like
 *     an orphan and we'd self-inflict data loss.
 *   - Sweep one prefix per tick (round-robin via Redis cursor) so we
 *     stay under Vercel's function timeout even with millions of objects.
 *   - Idempotency: re-running is a no-op for already-clean prefixes.
 *   - Kill switch: set CRON_STORAGE_GC_DISABLED=1 to short-circuit.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { supabase } from '@/lib/supabase';
import {
  STORAGE_PREFIXES,
  listObjectsByPrefix,
  deleteObjectsBestEffort,
  publicUrlToKey,
} from '@/lib/storage';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';
export const maxDuration = 300;

const redis = new Redis({
  url: process.env.KV_REST_API_URL ?? '',
  token: process.env.KV_REST_API_TOKEN ?? '',
});

/** Don't touch objects modified in the last 10 minutes — a brand-new
 *  upload whose DB row hasn't landed yet would look like an orphan to
 *  us. 10 min is overkill for the normal path (DB insert lands in ms)
 *  but covers slow-failing inserts and lazy commits. */
const GRACE_MS = 10 * 60 * 1000;

/** Cap on objects examined per cron tick. Wasabi list pages are 1000;
 *  one page per tick is plenty and keeps us well under the function
 *  timeout even when every object requires a DB round-trip. */
const MAX_OBJECTS_PER_TICK = 1000;

/** Per-prefix cursor key for round-robin sweeping. The cursor tells the
 *  next tick where to resume so we visit every page over time. Resets
 *  when a page returns no continuation token. */
const CURSOR_KEY_PREFIX = 'storage-gc:cursor:';

/** Round-robin pointer across the prefixes we sweep — one prefix per
 *  tick. With daily cron, three prefixes get one sweep every three
 *  days; still fast enough to bound orphan PII lifetime to <1 week. */
const ROUND_ROBIN_KEY = 'storage-gc:rr';

/** Prefixes that own user data with a DB row referencing the storage
 *  key. Each entry pairs the prefix with the resolver that, given a
 *  batch of keys, returns the subset that have DB row references. The
 *  COMPLEMENT — keys we listed minus keys the resolver vouched for —
 *  are the orphans we delete. */
interface PrefixSpec {
  /** Bucket prefix string (e.g. 'contact-documents'). */
  prefix: string;
  /** Human label for logs. */
  label: string;
  /** Given a list of candidate object keys, return the subset that
   *  exists in the DB. Everything not in the returned set is an
   *  orphan and gets deleted. */
  referencedKeys: (candidates: string[]) => Promise<Set<string>>;
}

const PREFIX_SPECS: PrefixSpec[] = [
  {
    prefix: STORAGE_PREFIXES.contactDocuments,
    label: 'contact-documents',
    referencedKeys: async (candidates) => {
      const { data } = await supabase
        .from('ContactDocument')
        .select('storageKey')
        .in('storageKey', candidates);
      return new Set(
        ((data ?? []) as { storageKey: string }[])
          .map((r) => r.storageKey)
          .filter(Boolean),
      );
    },
  },
  {
    prefix: STORAGE_PREFIXES.dealDocuments,
    label: 'deal-documents',
    referencedKeys: async (candidates) => {
      const { data } = await supabase
        .from('DealDocument')
        .select('storagePath')
        .in('storagePath', candidates);
      return new Set(
        ((data ?? []) as { storagePath: string }[])
          .map((r) => r.storagePath)
          .filter(Boolean),
      );
    },
  },
  {
    prefix: STORAGE_PREFIXES.propertyPhotos,
    label: 'property-photos',
    referencedKeys: async (candidates) => {
      // Property.photos is a JSONB array of public URLs; we map every
      // candidate KEY back through getPublicUrl-shape and check if any
      // listed property contains the URL. Easier: pull every Property
      // row's photos array for any space that has at least one row
      // (Supabase doesn't have a clean "URL contains key" predicate),
      // build the reverse map, then check membership.
      const { data } = await supabase.from('Property').select('photos').limit(5000);
      const referenced = new Set<string>();
      for (const row of (data ?? []) as { photos: unknown }[]) {
        const urls = Array.isArray(row.photos)
          ? row.photos.filter(
              (u): u is string => typeof u === 'string' && u.length > 0,
            )
          : [];
        for (const url of urls) {
          const key = publicUrlToKey(url);
          if (key) referenced.add(key);
        }
      }
      // Restrict the returned set to the candidates we were asked
      // about so we don't carry the whole photo universe.
      return new Set(candidates.filter((k) => referenced.has(k)));
    },
  },
  {
    // Public profile cover image. Replacement-on-POST orphans the
    // previous object inline now, but historical replacements (pre-
    // inline-fix) plus any inline-cleanup misses survive in storage
    // — the sweeper catches them. The DELETE handler intentionally
    // keeps the object until the next upload so the realtor can
    // revert, so the active row's coverPhotoUrl is the only thing
    // we need to keep.
    prefix: STORAGE_PREFIXES.profileCover,
    label: 'profile-cover',
    referencedKeys: async (candidates) => {
      const { data } = await supabase
        .from('ProfilePage')
        .select('coverPhotoUrl')
        .in('coverPhotoUrl', candidates);
      return new Set(
        ((data ?? []) as { coverPhotoUrl: string }[])
          .map((r) => r.coverPhotoUrl)
          .filter(Boolean),
      );
    },
  },
  {
    prefix: STORAGE_PREFIXES.profilePhoto,
    label: 'profile-photo',
    referencedKeys: async (candidates) => {
      const { data } = await supabase
        .from('ProfilePage')
        .select('profilePhotoUrl')
        .in('profilePhotoUrl', candidates);
      return new Set(
        ((data ?? []) as { profilePhotoUrl: string }[])
          .map((r) => r.profilePhotoUrl)
          .filter(Boolean),
      );
    },
  },
];

interface SweepResult {
  prefix: string;
  scanned: number;
  orphansFound: number;
  orphansDeleted: number;
  failures: number;
  durationMs: number;
  nextCursor: string | null;
}

async function nextSpec(): Promise<{ spec: PrefixSpec; index: number }> {
  const rawIndex = await redis.get<number>(ROUND_ROBIN_KEY);
  const index = typeof rawIndex === 'number' ? rawIndex % PREFIX_SPECS.length : 0;
  await redis.set(ROUND_ROBIN_KEY, (index + 1) % PREFIX_SPECS.length);
  return { spec: PREFIX_SPECS[index], index };
}

async function sweepOnce(spec: PrefixSpec): Promise<SweepResult> {
  const started = Date.now();
  const cursorKey = `${CURSOR_KEY_PREFIX}${spec.prefix}`;
  const continuationToken = (await redis.get<string>(cursorKey)) ?? undefined;

  const listing = await listObjectsByPrefix({
    prefix: `${spec.prefix}/`,
    maxKeys: MAX_OBJECTS_PER_TICK,
    continuationToken,
  });

  // Skip the grace window — don't touch fresh uploads whose DB row may
  // not have committed yet.
  const cutoff = Date.now() - GRACE_MS;
  const candidates = listing.keys.filter(
    (k) => !k.lastModified || k.lastModified.getTime() < cutoff,
  );

  let orphansDeleted = 0;
  let failures = 0;
  let orphansFound = 0;

  if (candidates.length > 0) {
    const candidateKeys = candidates.map((c) => c.key);
    const referenced = await spec.referencedKeys(candidateKeys);
    const orphans = candidateKeys.filter((k) => !referenced.has(k));
    orphansFound = orphans.length;

    if (orphans.length > 0) {
      const res = await deleteObjectsBestEffort(orphans);
      orphansDeleted = res.ok;
      failures = res.failed.length;
      if (failures > 0) {
        logger.warn('[cron/storage-gc] partial delete failures', {
          prefix: spec.prefix,
          failed: res.failed.slice(0, 10).map((f) => f.key),
          failureCount: failures,
        });
      }
    }
  }

  // Advance the cursor for the next tick. If the listing wasn't
  // truncated we're at the end — clear the cursor so the next pass
  // restarts from the beginning of the prefix.
  if (listing.nextToken) {
    await redis.set(cursorKey, listing.nextToken);
  } else {
    await redis.del(cursorKey);
  }

  return {
    prefix: spec.prefix,
    scanned: listing.keys.length,
    orphansFound,
    orphansDeleted,
    failures,
    durationMs: Date.now() - started,
    nextCursor: listing.nextToken,
  };
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/storage-gc] CRON_SECRET not set — rejecting');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  const authHeader = req.headers.get('Authorization');
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (process.env.CRON_STORAGE_GC_DISABLED) {
    return NextResponse.json({ ok: true, disabled: true });
  }

  const { spec, index } = await nextSpec();
  try {
    const result = await sweepOnce(spec);
    logger.info('[cron/storage-gc] sweep complete', {
      label: spec.label,
      rrIndex: index,
      ...result,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error('[cron/storage-gc] sweep failed', { prefix: spec.prefix }, err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'sweep failed' },
      { status: 500 },
    );
  }
}
