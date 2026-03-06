import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { chatWithRAG } from '@/lib/ai';
import { getSpaceFromSubdomain } from '@/lib/space';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { messages, subdomain } = await req.json();

  const space = await getSpaceFromSubdomain(subdomain);
  if (!space) return NextResponse.json({ error: 'Space not found' }, { status: 404 });

  // Save user message to DB
  const lastUserMsg = [...messages].reverse().find((m: any) => m.role === 'user');
  if (lastUserMsg) {
    await db.message.create({
      data: { spaceId: space.id, role: 'user', content: lastUserMsg.content }
    });
  }

  // Use per-space API key if set, otherwise fall back to env var
  const settings = await db.spaceSetting.findUnique({ where: { spaceId: space.id } });
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
    await db.message
      .create({ data: { spaceId: space.id, role: 'assistant', content: fullText } })
      .catch(console.error);
  })();

  return new NextResponse(streamForResponse, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Transfer-Encoding': 'chunked'
    }
  });
}
