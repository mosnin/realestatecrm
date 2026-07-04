import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getBrokerMemberContext } from '@/lib/permissions';
import { checkRateLimit } from '@/lib/rate-limit';
import { uploadObject, buildKey } from '@/lib/storage';

export const runtime = 'nodejs';

// Attachments can be documents or images — the stuff a broker actually shares
// with an agent (a contract PDF, a flyer, a screenshot). Kept to a sane set +
// a 15 MB cap. Stored PRIVATE; downloaded via the gated signed-URL route.
const ALLOWED = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const MAX_SIZE = 15 * 1024 * 1024;

/**
 * POST /api/messages/upload — upload a file to attach to a message. Gated on
 * brokerage membership. Returns { fileId, name, size, contentType } — the
 * caller puts that in a message's `attachments`. The object is PRIVATE; it's
 * fetched later through GET /api/messages/attachment (membership-checked +
 * short-lived signed URL).
 */
export async function POST(req: NextRequest) {
  const ctx = await getBrokerMemberContext();
  if (!ctx) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { allowed } = await checkRateLimit(`msg-upload:${ctx.dbUserId}`, 20, 60);
  if (!allowed) return NextResponse.json({ error: 'Too many uploads' }, { status: 429 });

  let file: File | null = null;
  try {
    const form = await req.formData();
    file = form.get('file') as File | null;
  } catch {
    return NextResponse.json({ error: 'Invalid upload' }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File must be under 15MB' }, { status: 400 });
  }

  const safeName = (file.name || 'file').replace(/[^\w.\-]+/g, '_').slice(0, 120);
  const key = buildKey('messageAttachments', ctx.brokerage.id, `${crypto.randomUUID()}-${safeName}`);
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    await uploadObject({
      key,
      body: buffer,
      contentType: file.type,
      isPublic: false,
      contentDisposition: `attachment; filename="${safeName}"`,
    });
  } catch (err) {
    console.error('[messages/upload] storage error', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }

  return NextResponse.json({
    fileId: key,
    name: file.name || safeName,
    size: file.size,
    contentType: file.type,
  });
}
