'use client';

import { useState, useEffect } from 'react';
import { TemplatesEditor } from '@/components/settings/templates-editor';
import type { MessageTemplate } from '@/lib/message-templates';
import { BODY_MUTED } from '@/lib/typography';

/**
 * Client-side wrapper that pulls existing templates and mounts the editor.
 * Lives inside the Integrations page so message templates sit next to the
 * integrations that send them.
 */
export function TemplatesSection() {
  const [templates, setTemplates] = useState<MessageTemplate[] | null>(null);

  useEffect(() => {
    fetch('/api/message-templates')
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setTemplates(Array.isArray(data) ? data : data.templates ?? []))
      .catch(() => setTemplates([]));
  }, []);

  if (templates === null) {
    return <div className="h-40 bg-foreground/[0.04] rounded-md animate-pulse" />;
  }

  return (
    <div className="space-y-4">
      <p className={BODY_MUTED}>
        Canned SMS, email, and note bodies you can fire per deal or contact. Use{' '}
        <code className="text-xs bg-foreground/[0.06] px-1 rounded">{'{{variable}}'}</code> placeholders to personalize — anything unknown becomes blank.
      </p>
      <TemplatesEditor initial={templates} />
    </div>
  );
}
