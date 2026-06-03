import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/api-auth';
import { checkRateLimit } from '@/lib/rate-limit';
import { readJsonWithLimit, parseOrBadRequest, BODY_LIMITS } from '@/lib/validation';
import OpenAI from 'openai';

export const runtime = 'nodejs';

/** TTS input is truncated to 4096 chars below; cap the field before that so a
 *  multi-megabyte string can't be parsed into memory first. */
const speakBodySchema = z.object({
  text: z.string().min(1).max(8000),
});

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if (authResult instanceof NextResponse) return authResult;
  const { userId } = authResult;

  const { allowed } = await checkRateLimit(`voice:speak:${userId}`, 10, 60);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  try {
    const read = await readJsonWithLimit(req, BODY_LIMITS.smallJson);
    if (!read.ok) return read.response;
    const parsed = parseOrBadRequest(speakBodySchema, read.data);
    if (!parsed.ok) return parsed.response;
    const { text } = parsed.data;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OpenAI not configured' }, { status: 500 });
    }

    // Limit text length for TTS
    const truncated = text.slice(0, 4096);

    const openai = new OpenAI({ apiKey });

    const mp3 = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'nova',
      input: truncated,
      response_format: 'mp3',
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(buffer.length),
      },
    });
  } catch (err) {
    console.error('[speak] error:', err);
    return NextResponse.json({ error: 'Speech synthesis failed' }, { status: 500 });
  }
}
