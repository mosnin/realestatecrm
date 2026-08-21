import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { getSpaceForUser } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
import { checkRateLimit } from '@/lib/rate-limit';
import crypto from 'crypto';
import { uploadObject, getPublicUrl, buildKey, deleteObject, publicUrlToKey } from '@/lib/storage';
import { sniffImageFormat, extensionFor, contentTypeFor } from '@/lib/storage/image-format';
import heicConvert from 'heic-convert';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { allowed } = await checkRateLimit(`upload:${userId}`, 10, 60);
  if (!allowed) return NextResponse.json({ error: 'Too many uploads' }, { status: 429 });

  const space = await getSpaceForUser(userId);
  if (!space) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as string; // 'logo' | 'photo' | 'favicon' | 'link-thumb' | 'property-photo'

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (!['logo', 'photo', 'favicon', 'link-thumb', 'property-photo'].includes(type)) {
      return NextResponse.json({ error: 'Invalid upload type' }, { status: 400 });
    }

    // Size cap on the RECEIVED bytes. Note: the hosting platform rejects
    // request bodies over ~4.5 MB before this handler ever runs, so the real
    // ceiling is enforced upstream — the client downscales images before
    // upload to stay well under it (see lib/image-normalize). This cap is a
    // secondary guard, generous enough not to reject a legitimate HEIC (which
    // the client can't shrink and sends at original size).
    const sizeCap = type === 'property-photo' ? 10 * 1024 * 1024 : 4 * 1024 * 1024;
    if (file.size > sizeCap) {
      const mb = Math.floor(sizeCap / (1024 * 1024));
      return NextResponse.json({ error: `That file is too large — keep it under ${mb}MB.` }, { status: 400 });
    }

    // Identify the image by its bytes, not its (spoofable / iOS-mislabeled)
    // declared type. Supports JPEG / PNG / WebP / GIF / HEIC.
    let buffer = Buffer.from(await file.arrayBuffer());
    const format = sniffImageFormat(new Uint8Array(buffer.subarray(0, 16)));
    if (!format) {
      return NextResponse.json(
        { error: "That doesn't look like a supported image. Use a JPEG, PNG, WebP, or an iPhone HEIC photo." },
        { status: 400 },
      );
    }

    let ext = extensionFor(format);
    let contentType = contentTypeFor(format);

    // HEIC (the iPhone default) can't be shown in a browser <img>, so transcode
    // it to JPEG here — the realtor never has to convert anything by hand.
    if (format === 'heic') {
      try {
        const jpeg = await heicConvert({ buffer, format: 'JPEG', quality: 0.85 });
        buffer = Buffer.from(jpeg);
        ext = 'jpg';
        contentType = 'image/jpeg';
      } catch (convertErr) {
        console.error('[upload] HEIC transcode failed:', convertErr);
        return NextResponse.json(
          { error: "Couldn't process that iPhone photo. Try again, or share it as a JPEG." },
          { status: 422 },
        );
      }
    }

    // Property photos go under the `property-photos/` prefix the storage-gc
    // sweeper already knows how to scan (it intersects Property.photos URLs
    // against listed keys). Branding assets (logo / photo / favicon /
    // link-thumb) stay under `onboarding/` — same key space as space-level
    // profile uploads. Both are public-read because they're embedded on
    // /apply, the property packet share page, and the public profile.
    const key = type === 'property-photo'
      ? buildKey(
          'propertyPhotos',
          space.id,
          `${crypto.randomUUID().slice(0, 8)}.${ext}`,
        )
      : buildKey(
          'onboarding',
          space.id,
          `${type}-${crypto.randomUUID().slice(0, 8)}.${ext}`,
        );

    try {
      await uploadObject({
        key,
        body: buffer,
        contentType,
        isPublic: true,
      });
    } catch (uploadError) {
      console.error('[upload] storage error:', uploadError);
      return NextResponse.json(
        { error: uploadError instanceof Error ? uploadError.message : 'Upload failed' },
        { status: 500 },
      );
    }
    const publicUrl = getPublicUrl(key);

    // Auto-save to SpaceSetting based on type. Capture the previous URL
    // FIRST so we can clean up the prior storage object — without this,
    // every logo/photo/favicon swap leaked 2 MB into permanent Wasabi
    // storage with no DB pointer back. link-thumb has no DB write here
    // (the caller persists it), so its old objects aren't reachable
    // from this route — the storage-gc cron would need to know about
    // them, which is out of scope for this fix.
    const fieldMap: Record<string, string> = {
      logo: 'logoUrl',
      photo: 'realtorPhotoUrl',
      favicon: 'intakeFaviconUrl',
    };
    const field = fieldMap[type];
    if (field) {
      const { data: existing } = await tenantTable(supabase, 'SpaceSetting', { spaceId: space.id })
        .select(field)
        .maybeSingle();
      const previousValue = (existing as Record<string, string | null> | null)?.[field] ?? null;

      await tenantTable(supabase, 'SpaceSetting', { spaceId: space.id })
        .upsert({ spaceId: space.id, [field]: publicUrl }, { onConflict: 'spaceId' });

      // Fire-and-forget the previous object cleanup. publicUrlToKey
      // returns null for URLs that don't match our bucket shape (e.g.
      // a Clerk-hosted URL or an external CDN someone pasted in) —
      // we skip those rather than guess.
      if (previousValue) {
        const previousKey = publicUrlToKey(previousValue);
        if (previousKey) {
          void deleteObject(previousKey).catch((err) =>
            console.warn('[upload] previous object delete failed', {
              spaceId: space.id,
              field,
              err: err instanceof Error ? err.message : String(err),
            }),
          );
        }
      }
    }

    return NextResponse.json({ url: publicUrl });
  } catch (err) {
    console.error('[upload] error:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
