import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { NotesClient } from './notes-client';
import type { Metadata } from 'next';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Notes — ${slug}` };
}

export default async function NotesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const { data: notes } = await supabase
    .from('Note')
    .select('id, title, icon, sortOrder, updatedAt')
    .eq('spaceId', space.id)
    .order('sortOrder', { ascending: true });

  // Fetch mentions data (contacts and deals for @ mentions)
  const [{ data: contacts }, { data: deals }] = await Promise.all([
    supabase.from('Contact').select('id, name, email, type').eq('spaceId', space.id).limit(100),
    supabase.from('Deal').select('id, title, address').eq('spaceId', space.id).limit(50),
  ]);

  return (
    <NotesClient
      slug={slug}
      initialNotes={notes ?? []}
      contacts={(contacts ?? []) as any[]}
      deals={(deals ?? []) as any[]}
    />
  );
}
