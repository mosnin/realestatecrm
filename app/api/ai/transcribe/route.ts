import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-auth';
import { checkRateLimit } from '@/lib/rate-limit';
import OpenAI from 'openai';

export const runtime = 'nodejs';

/** Audio MIME allowlist. Whisper accepts these container/codec types; anything
 *  else is rejected before we read the file into memory or call OpenAI. The
 *  MediaRecorder API in the browser produces webm/ogg/mp4; mp3/wav/m4a cover
 *  uploaded clips. */
const ALLOWED_AUDIO_MIME = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/m4a',
  'audio/x-m4a',
]);

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { allowed } = await checkRateLimit(`voice:transcribe:${userId}`, 5, 60);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI not configured' }, { status: 500 });
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ error: 'invalid form data' }, { status: 400 });
    }
    const audioFile = formData.get('audio');
    if (!(audioFile instanceof File)) return NextResponse.json({ error: 'No audio file' }, { status: 400 });

    // Validate file size (max 25MB per Whisper limit)
    if (audioFile.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: 'Audio file too large' }, { status: 400 });
    }
    if (audioFile.size === 0) {
      return NextResponse.json({ error: 'empty audio file' }, { status: 400 });
    }

    // MIME allowlist — reject non-audio uploads (and disguised payloads by
    // declared type) before reading the file or calling OpenAI. Browsers
    // sometimes append a codecs= suffix (e.g. "audio/webm;codecs=opus");
    // match on the base type.
    const baseMime = (audioFile.type || '').split(';')[0].trim().toLowerCase();
    if (!ALLOWED_AUDIO_MIME.has(baseMime)) {
      return NextResponse.json({ error: 'unsupported audio format' }, { status: 415 });
    }

    const openai = new OpenAI({ apiKey });

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      response_format: 'text',
    });

    return NextResponse.json({ text: transcription });
  } catch (err) {
    console.error('[transcribe] error:', err);
    return NextResponse.json({ error: 'Transcription failed' }, { status: 500 });
  }
}
