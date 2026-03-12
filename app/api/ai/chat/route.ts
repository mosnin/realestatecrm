import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { chatWithRAG } from '@/lib/ai';
import { getSpaceFromSlug } from '@/lib/space';
import { sql } from '@/lib/db';
import type { SpaceSetting } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { messages, slug } = await req.json();

    const space = await getSpaceFromSlug(slug);
    if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });

    // Save user message to DB
    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === 'user');
    if (lastUserMsg) {
      await sql`
        INSERT INTO "Message" ("id", "spaceId", "role", "content")
        VALUES (${crypto.randomUUID()}, ${space.id}, ${'user'}, ${lastUserMsg.content})
      `;
    }

    // Use per-space API key if set, otherwise fall back to env var
    const settingsRows = await sql`
      SELECT * FROM "SpaceSetting" WHERE "spaceId" = ${space.id}
    ` as SpaceSetting[];
    const settings = settingsRows[0] ?? null;
    const stream = await chatWithRAG(messages, space.id, space.name, (settings as any)?.anthropicApiKey);

    // Collect the full response text to save to DB (non-blocking)
    const [streamForResponse, streamForSave] = stream.tee();
    (async () => {
      const reader = streamForSave.getReader();
      let fullText = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += new TextDecoder().decode(value);
      }
      await sql`
        INSERT INTO "Message" ("id", "spaceId", "role", "content")
        VALUES (${crypto.randomUUID()}, ${space.id}, ${'assistant'}, ${fullText})
      `.catch(console.error);
    })();

    return new NextResponse(streamForResponse, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked'
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    return new NextResponse(`AI chat error: ${message}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}
