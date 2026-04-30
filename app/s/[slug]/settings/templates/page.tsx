import { notFound } from 'next/navigation';
import { getSpaceFromSlug } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import type { MessageTemplate } from '@/lib/message-templates';
import { TemplatesEditor } from '@/components/settings/templates-editor';
import { H2, BODY_MUTED, SECTION_RHYTHM } from '@/lib/typography';

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
    <div className={`${SECTION_RHYTHM} max-w-[900px]`}>
      <div className="space-y-3">
        <h2 className={H2}>Message templates</h2>
        <p className={BODY_MUTED}>
          Canned SMS, email, and note bodies you can fire per deal or contact. Use{' '}
          <code className="text-xs bg-foreground/[0.06] px-1 rounded">{'{{variable}}'}</code> placeholders to
          personalize — anything unknown becomes blank.
        </p>
      </div>
      <TemplatesEditor initial={templates} />
    </div>
  );
}
