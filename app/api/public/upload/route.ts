import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { getSpaceFromSubdomain } from '@/lib/space';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
]);

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const subdomain = formData.get('subdomain') as string | null;
    const category = (formData.get('category') as string | null) ?? 'document';

    if (!file || !subdomain) {
      return NextResponse.json(
        { error: 'file and subdomain are required' },
        { status: 400 }
      );
    }

    // Verify workspace exists so anonymous actors can't use arbitrary paths
    const space = await getSpaceFromSubdomain(subdomain);
    if (!space) {
      return NextResponse.json({ error: 'Space not found' }, { status: 404 });
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: 'Unsupported file type. Upload JPEG, PNG, WEBP, HEIC, or PDF.' },
        { status: 415 }
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: 'File exceeds the 10 MB limit.' },
        { status: 413 }
      );
    }

    // Sanitise filename and build a deterministic storage path
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
    const path = `applications/${space.id}/${category}/${Date.now()}_${safeName}`;

    const blob = await put(path, file, { access: 'public' });

    return NextResponse.json({
      url: blob.url,
      name: file.name,
      size: file.size,
      type: file.type,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
