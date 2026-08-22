import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireSpaceOwner } from '@/lib/api-auth';
import { supabase } from '@/lib/supabase';
import { readJsonWithLimit, BODY_LIMITS } from '@/lib/validation';
import { tenantTable } from '@/lib/tenant-db';

export const runtime = 'nodejs';

const MAX_SKILLS = 50;
const MAX_TITLE = 60;
const MAX_DESC = 160;
const MAX_PROMPT = 4000;

/**
 * GET  /api/skills?slug= — the caller's custom skills, newest first.
 * POST /api/skills       — create one: { slug, title, description?, prompt }.
 *
 * A skill is a reusable playbook prompt surfaced in the composer's "/" menu
 * alongside the built-in skills (same shape: title + description + prompt,
 * optional single {placeholder} that becomes the initial selection).
 */
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;

  const { data } = await tenantTable(supabase, 'UserSkill', { spaceId: auth.space.id })
    .select('id, title, description, prompt, enabled, createdAt')
    .order('createdAt', { ascending: false })
    .limit(MAX_SKILLS);
  return NextResponse.json({ skills: data ?? [] });
}

export async function POST(req: NextRequest) {
  const read = await readJsonWithLimit(req, BODY_LIMITS.smallJson);
  if (!read.ok) return read.response;
  const { slug, title, description, prompt } = (read.data ?? {}) as {
    slug?: string; title?: string; description?: string; prompt?: string;
  };
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
  const auth = await requireSpaceOwner(slug);
  if (auth instanceof NextResponse) return auth;

  const cleanTitle = typeof title === 'string' ? title.trim().slice(0, MAX_TITLE) : '';
  const cleanPrompt = typeof prompt === 'string' ? prompt.trim().slice(0, MAX_PROMPT) : '';
  if (!cleanTitle) return NextResponse.json({ error: 'Give the skill a name.' }, { status: 400 });
  if (cleanPrompt.length < 10) {
    return NextResponse.json({ error: 'Write the prompt the skill should run (at least 10 characters).' }, { status: 400 });
  }

  const { count } = await tenantTable(supabase, 'UserSkill', { spaceId: auth.space.id })
    .select('*', { count: 'exact', head: true });
  if ((count ?? 0) >= MAX_SKILLS) {
    return NextResponse.json({ error: `You've reached the limit of ${MAX_SKILLS} skills.` }, { status: 409 });
  }

  const { data, error } = await tenantTable(supabase, 'UserSkill', { spaceId: auth.space.id })
    .insert({
      id: crypto.randomUUID(),
      spaceId: auth.space.id,
      title: cleanTitle,
      description: typeof description === 'string' ? description.trim().slice(0, MAX_DESC) : '',
      prompt: cleanPrompt,
    })
    .select('id, title, description, prompt, enabled, createdAt')
    .single();
  if (error || !data) {
    return NextResponse.json({ error: 'Failed to create the skill.' }, { status: 500 });
  }
  return NextResponse.json({ skill: data }, { status: 201 });
}
