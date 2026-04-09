import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';
import crypto from 'crypto';

export const runtime = 'nodejs';

/**
 * Upload endpoint for onboarding — works before a Space exists.
 * Files are stored under the Clerk user ID in the "branding" bucket.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { allowed } = await checkRateLimit(`upload:${userId}`, 10, 60);
  if (!allowed) return NextResponse.json({ error: 'Too many uploads' }, { status: 429 });

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as string; // 'logo' | 'photo' | 'broker_logo'

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (!['logo', 'photo', 'broker_logo'].includes(type)) {
      return NextResponse.json({ error: 'Invalid upload type' }, { status: 400 });
    }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Only PNG, JPEG, and WebP images are allowed' }, { status: 400 });
    }

    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'File must be under 2MB' }, { status: 400 });
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const fileName = `onboarding/${userId}/${type}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
    const bucket = 'branding';

    // Ensure bucket exists
    const { data: buckets } = await supabase.storage.listBuckets();
    if (!buckets?.find((b: { name: string }) => b.name === bucket)) {
      await supabase.storage.createBucket(bucket, { public: true });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(fileName, buffer, { contentType: file.type, upsert: true });

    if (uploadError) {
      console.error('[upload/onboarding] storage error:', uploadError);
      return NextResponse.json({ error: uploadError.message || 'Upload failed' }, { status: 500 });
    }

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
    return NextResponse.json({ url: urlData.publicUrl });
  } catch (err) {
    console.error('[upload/onboarding] error:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
