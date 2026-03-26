import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { requireContactAccess } from '@/lib/api-auth';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

/**
 * POST — Upload a document for a contact.
 * Stores metadata in ContactDocument table. In production, the file binary
 * would go to S3/R2. For now we store a base64 data URL as the storageKey
 * (suitable for small files and MVP).
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const contactId = formData.get('contactId') as string;
  const file = formData.get('file') as File;
  const uploadedBy = (formData.get('uploadedBy') as string) || 'agent';

  if (!contactId || !file) {
    return NextResponse.json({ error: 'contactId and file required' }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'File type not supported' }, { status: 400 });
  }

  // Validate file magic numbers to prevent MIME spoofing
  const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const isPdf = header[0] === 0x25 && header[1] === 0x50 && header[2] === 0x44 && header[3] === 0x46; // %PDF
  const isJpeg = header[0] === 0xFF && header[1] === 0xD8;
  const isPng = header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47;
  const isWebp = header[8 - 4] === 0x57 && header[8 - 3] === 0x45 && header[8 - 2] === 0x42 && header[8 - 1] === 0x50; // WEBP at offset 8
  const isDoc = header[0] === 0xD0 && header[1] === 0xCF; // OLE2 (DOC)
  const isDocx = header[0] === 0x50 && header[1] === 0x4B; // ZIP (DOCX)
  if (!isPdf && !isJpeg && !isPng && !isWebp && !isDoc && !isDocx) {
    return NextResponse.json({ error: 'File content does not match declared type' }, { status: 400 });
  }

  // Verify access — guest uploads are restricted to recently-created public
  // intake contacts to prevent arbitrary file uploads to any contact.
  let resolvedSpaceId: string;
  if (uploadedBy === 'guest') {
    const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: guestContact } = await supabase
      .from('Contact')
      .select('spaceId')
      .eq('id', contactId)
      .contains('tags', ['application-link'])
      .gte('createdAt', thirtyMinAgo)
      .maybeSingle();
    if (!guestContact) {
      return NextResponse.json({ error: 'Contact not found or upload window expired' }, { status: 404 });
    }
    resolvedSpaceId = guestContact.spaceId;
  } else {
    const auth = await requireContactAccess(contactId);
    if (auth instanceof NextResponse) return auth;

    const { data: authedContact } = await supabase
      .from('Contact')
      .select('spaceId')
      .eq('id', contactId)
      .single();
    if (!authedContact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
    }
    resolvedSpaceId = authedContact.spaceId;
  }

  // Store file as base64 data URL (MVP approach — replace with S3 in production)
  const buffer = await file.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  const storageKey = `data:${file.type};base64,${base64}`;

  const { data: doc, error } = await supabase
    .from('ContactDocument')
    .insert({
      contactId,
      spaceId: resolvedSpaceId,
      fileName: file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 255),
      fileType: file.type,
      fileSize: file.size,
      storageKey,
      uploadedBy,
    })
    .select('id, fileName, fileType, fileSize, createdAt')
    .single();

  if (error) throw error;

  return NextResponse.json(doc, { status: 201 });
}

/**
 * GET — List documents for a contact.
 */
export async function GET(req: NextRequest) {
  const contactId = req.nextUrl.searchParams.get('contactId');
  if (!contactId) return NextResponse.json({ error: 'contactId required' }, { status: 400 });

  const auth = await requireContactAccess(contactId);
  if (auth instanceof NextResponse) return auth;

  const { data: docs } = await supabase
    .from('ContactDocument')
    .select('id, fileName, fileType, fileSize, uploadedBy, createdAt')
    .eq('contactId', contactId)
    .order('createdAt', { ascending: false });

  return NextResponse.json(docs ?? []);
}
