import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import type { MessageTemplate } from '@/lib/message-templates';
import { TemplatesEditor } from '@/components/settings/templates-editor';

export const dynamic = 'force-dynamic';

export default async function TemplatesSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const { data } = await supabase
    .from('MessageTemplate')
    .select('*')
    .eq('spaceId', space.id)
    .order('updatedAt', { ascending: false });

  const templates = (data ?? []) as MessageTemplate[];

  return (
    <div className="space-y-8 max-w-[900px]">
      <div className="space-y-3">
        <h2
          className="text-2xl tracking-tight text-foreground"
          style={{ fontFamily: 'var(--font-title)' }}
        >
          Message templates
        </h2>
        <p className="text-sm text-muted-foreground">
          Canned SMS, email, and note bodies you can fire per deal or contact. Use{' '}
          <code className="text-xs bg-foreground/[0.06] px-1 rounded">{'{{variable}}'}</code> placeholders to
          personalize — anything unknown becomes blank.
        </p>
      </div>
      <TemplatesEditor initial={templates} />
    </div>
  );
}
