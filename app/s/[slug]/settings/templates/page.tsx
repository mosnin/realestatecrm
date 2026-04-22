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
    <div className="space-y-5 max-w-[900px]">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Message templates</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Canned SMS, email, and note bodies you can fire per deal or contact.
          Use <code className="text-xs bg-muted px-1 rounded">{'{{variable}}'}</code> placeholders
          to personalise — anything that isn&apos;t known becomes blank.
        </p>
      </div>
      <TemplatesEditor initial={templates} />
    </div>
  );
}
