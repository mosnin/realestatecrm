/**
 * GET /api/cron/extraction-backfill
 *
 * Hourly tick (offset). Text extraction (lib/extraction/extract.ts) runs at
 * UPLOAD time for chat attachments, but any Attachment uploaded BEFORE that
 * shipped is stuck at extractionStatus='pending' with extractedText=null
 * forever — nothing ever retried them, so the read_attachment tool can never
 * serve their content. This backfills those rows: fetch the stored bytes, run
 * the same extractor, and write the result.
 *
 * Read-only for the realtor: this only writes the extractedText /
 * extractionStatus columns on Attachment. It never sends email or SMS.
 *
 * Auth: Bearer ${CRON_SECRET}, fail-closed (unset secret → 500).
 * Disable: set CRON_EXTRACTION_BACKFILL_DISABLED=1.
 *
 * Bounded: ≤50 rows per tick, oldest first, so the overflow is picked up on
 * the next tick. Best-effort per row — one failure never aborts the batch.
 * Two distinct failure modes are handled differently:
 *   - bytes can't be fetched (signing / storage / network) → leave the row
 *     'pending' so a later tick retries once storage is reachable again.
 *   - the extractor genuinely can't parse the bytes → mark 'failed' (terminal),
 *     so we don't re-download it every hour forever.
 *
 * spaceId scoping is not required — Attachment.id is globally unique and this
 * is a system-wide backfill — but spaceId is carried in logs for diagnosis.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSignedDownloadUrl } from '@/lib/storage';
import { extractAttachmentText } from '@/lib/extraction/extract';
import { monitorCron } from '@/lib/cron-monitor';

export const runtime = 'nodejs';
// Up to 50 downloads + parses per tick; each is typically sub-second but a
// large PDF/XLSX can take a few seconds. 300s is comfortable headroom and
// mirrors the other document-touching crons.
export const maxDuration = 300;

// Don't let one tick download an unbounded number of files — the overflow is
// picked up on the next tick (oldest-created first).
const MAX_PER_TICK = 50;
// Parallel downloads + parses in flight at once.
const MAX_CONCURRENCY = 4;
// Short-lived signed URL — just long enough to fetch the bytes this tick.
const SIGN_TTL_SECONDS = 300;

interface PendingAttachment {
  id: string;
  spaceId: string;
  storagePath: string;
  filename: string;
  mimeType: string;
}

async function handler(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/extraction-backfill] CRON_SECRET is not set — rejecting request');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  if (req.headers.get('Authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (process.env.CRON_EXTRACTION_BACKFILL_DISABLED) {
    console.log('[cron/extraction-backfill] CRON_EXTRACTION_BACKFILL_DISABLED is set — skipping tick');
    return NextResponse.json({ status: 'disabled' });
  }

  const startedAt = Date.now();

  // ── 1. Pending attachments with bytes to fetch, oldest first ────────────
  const { data: pendingRows, error: pendingErr } = await supabase
    .from('Attachment')
    .select('id, spaceId, storagePath, filename, mimeType')
    .eq('extractionStatus', 'pending')
    .not('storagePath', 'is', null)
    .order('createdAt', { ascending: true })
    .limit(MAX_PER_TICK);
  if (pendingErr) {
    console.error('[cron/extraction-backfill] Failed to load pending attachments', pendingErr);
    return NextResponse.json({ error: 'DB query failed' }, { status: 500 });
  }

  const pending = ((pendingRows ?? []) as PendingAttachment[]).filter((r) => r.storagePath);
  if (pending.length === 0) {
    return NextResponse.json({
      pending: 0,
      done: 0,
      failed: 0,
      skipped: 0,
      fetchSkipped: 0,
      durationMs: Date.now() - startedAt,
    });
  }

  // ── 2. Backfill with bounded concurrency ────────────────────────────────
  let done = 0;
  let failed = 0;
  let skipped = 0;
  // Rows whose bytes we couldn't fetch — left 'pending' for a later retry.
  let fetchSkipped = 0;
  let cursor = 0;

  async function fetchBytes(row: PendingAttachment): Promise<Buffer | null> {
    try {
      const url = await getSignedDownloadUrl(row.storagePath, SIGN_TTL_SECONDS);
      const res = await fetch(url);
      if (!res.ok) {
        console.warn('[cron/extraction-backfill] byte fetch non-2xx — leaving pending', {
          id: row.id,
          spaceId: row.spaceId,
          status: res.status,
        });
        return null;
      }
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      console.warn('[cron/extraction-backfill] byte fetch failed — leaving pending', {
        id: row.id,
        spaceId: row.spaceId,
      }, err);
      return null;
    }
  }

  async function worker() {
    while (cursor < pending.length) {
      const row = pending[cursor++];

      const buffer = await fetchBytes(row);
      if (!buffer) {
        // Can't read the bytes right now — do NOT mark anything. Leave the row
        // 'pending' so the next tick retries once storage is reachable.
        fetchSkipped++;
        continue;
      }

      // extractAttachmentText never throws — a parser failure returns
      // status 'failed', an unsupported type returns 'skipped'. Both are
      // terminal, so writing them stops us re-downloading the row forever.
      const extraction = await extractAttachmentText(buffer, row.mimeType, row.filename);

      const { error: updateErr } = await supabase
        .from('Attachment')
        .update({
          extractedText: extraction.text,
          extractionStatus: extraction.status,
        })
        .eq('id', row.id);
      if (updateErr) {
        // The write failed — leave the row 'pending' (nothing was persisted)
        // so a later tick retries. Don't count it as a terminal outcome.
        console.error('[cron/extraction-backfill] update failed — leaving pending', {
          id: row.id,
          spaceId: row.spaceId,
        }, updateErr);
        fetchSkipped++;
        continue;
      }

      if (extraction.status === 'done') done++;
      else if (extraction.status === 'failed') failed++;
      else skipped++;
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENCY, pending.length) }, () => worker()),
  );

  const summary = {
    pending: pending.length,
    done,
    failed,
    skipped,
    fetchSkipped,
    durationMs: Date.now() - startedAt,
  };
  console.log('[cron/extraction-backfill] Tick complete', summary);
  return NextResponse.json(summary);
}

export const GET = monitorCron('extraction-backfill', { crontab: '15 * * * *' }, handler);
