import { NextRequest, NextResponse } from 'next/server';
import { getBrokerMemberContext } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { getSpaceByOwnerId } from '@/lib/space';
import { z } from 'zod';

const TEMPLATE_NOTE_TITLE = '[BROKER_TEMPLATES]';

const templateSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(100),
  category: z.enum(['follow-up', 'intro', 'closing', 'tour-invite']),
  body: z.string().min(1).max(5000),
});

type Template = {
  id: string;
  name: string;
  category: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * Helper: find or create the special Note that stores templates as JSON in content.
 */
async function getOrCreateTemplateNote(spaceId: string) {
  const { data: existing } = await supabase
    .from('Note')
    .select('id, content')
    .eq('spaceId', spaceId)
    .eq('title', TEMPLATE_NOTE_TITLE)
    .maybeSingle();

  if (existing) return existing;

  const { data: created, error } = await supabase
    .from('Note')
    .insert({
      spaceId,
      title: TEMPLATE_NOTE_TITLE,
      content: '[]',
      sortOrder: -1,
    })
    .select('id, content')
    .single();

  if (error) throw error;
  return created;
}

function parseTemplates(content: string): Template[] {
  try {
    return JSON.parse(content || '[]');
  } catch {
    return [];
  }
}

/**
 * GET /api/broker/templates — list all templates
 */
export async function GET() {
  const ctx = await getBrokerMemberContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const space = await getSpaceByOwnerId(ctx.brokerage.ownerId);
    if (!space) {
      return NextResponse.json({ error: 'Broker space not found' }, { status: 500 });
    }

    const note = await getOrCreateTemplateNote(space.id);
    const templates = parseTemplates(note.content);

    return NextResponse.json(templates);
  } catch (error) {
    console.error('[templates] GET error', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/**
 * POST /api/broker/templates — create a new template
 */
export async function POST(req: NextRequest) {
  const ctx = await getBrokerMemberContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = templateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid data', issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const space = await getSpaceByOwnerId(ctx.brokerage.ownerId);
    if (!space) {
      return NextResponse.json({ error: 'Broker space not found' }, { status: 500 });
    }

    const note = await getOrCreateTemplateNote(space.id);
    const templates = parseTemplates(note.content);
    const now = new Date().toISOString();

    const newTemplate: Template = {
      id: crypto.randomUUID(),
      name: parsed.data.name,
      category: parsed.data.category,
      body: parsed.data.body,
      createdAt: now,
      updatedAt: now,
    };

    templates.unshift(newTemplate);

    const { error: updateError } = await supabase
      .from('Note')
      .update({ content: JSON.stringify(templates), updatedAt: now })
      .eq('id', note.id);

    if (updateError) throw updateError;

    return NextResponse.json(newTemplate, { status: 201 });
  } catch (error) {
    console.error('[templates] POST error', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/broker/templates — update a template
 */
export async function PATCH(req: NextRequest) {
  const ctx = await getBrokerMemberContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = templateSchema.extend({ id: z.string().uuid() }).safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid data', issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const space = await getSpaceByOwnerId(ctx.brokerage.ownerId);
    if (!space) {
      return NextResponse.json({ error: 'Broker space not found' }, { status: 500 });
    }

    const note = await getOrCreateTemplateNote(space.id);
    const templates = parseTemplates(note.content);
    const idx = templates.findIndex((t) => t.id === parsed.data.id);

    if (idx === -1) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const now = new Date().toISOString();
    templates[idx] = {
      ...templates[idx],
      name: parsed.data.name,
      category: parsed.data.category,
      body: parsed.data.body,
      updatedAt: now,
    };

    const { error: updateError } = await supabase
      .from('Note')
      .update({ content: JSON.stringify(templates), updatedAt: now })
      .eq('id', note.id);

    if (updateError) throw updateError;

    return NextResponse.json(templates[idx]);
  } catch (error) {
    console.error('[templates] PATCH error', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/broker/templates — delete a template by id (query param)
 */
export async function DELETE(req: NextRequest) {
  const ctx = await getBrokerMemberContext();
  if (!ctx) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const templateId = req.nextUrl.searchParams.get('id');
  if (!templateId) {
    return NextResponse.json({ error: 'id query param required' }, { status: 400 });
  }

  try {
    const space = await getSpaceByOwnerId(ctx.brokerage.ownerId);
    if (!space) {
      return NextResponse.json({ error: 'Broker space not found' }, { status: 500 });
    }

    const note = await getOrCreateTemplateNote(space.id);
    const templates = parseTemplates(note.content);
    const filtered = templates.filter((t) => t.id !== templateId);

    if (filtered.length === templates.length) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const now = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('Note')
      .update({ content: JSON.stringify(filtered), updatedAt: now })
      .eq('id', note.id);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[templates] DELETE error', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
