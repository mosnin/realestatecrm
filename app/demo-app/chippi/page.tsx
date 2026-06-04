/**
 * /demo-app/chippi - backend-free clone of the realtor Chippi home.
 *
 * Renders the EXACT same UI as app/s/[slug]/chippi/page.tsx by reusing the
 * real ChippiWorkspace component, but every value the production page reads
 * from auth + Supabase is replaced with hardcoded demo data (see
 * ./demo-data). No auth(), no Supabase, no fetch on render. The result is a
 * fully-formed "morning replay" conversation showing Chippi having already
 * scored leads, drafted replies, and booked a tour for Jordan Rivera.
 *
 * The page is wrapped by app/demo-app/layout.tsx (sidebar + header chrome),
 * so this file renders ONLY the workspace content, matching the production
 * page's returned tree.
 */

import { ChippiWorkspace } from '@/components/chippi/chippi-workspace';
import {
  DEMO_SLUG,
  DEMO_CONVERSATION_ID,
  DEMO_CONVERSATIONS,
  DEMO_MESSAGES,
} from './demo-data';

export default function DemoChippiPage() {
  return (
    <div className="flex h-full flex-col">
      <ChippiWorkspace
        slug={DEMO_SLUG}
        view="workspace"
        initialMessages={DEMO_MESSAGES}
        initialConversations={DEMO_CONVERSATIONS}
        initialConversationId={DEMO_CONVERSATION_ID}
        showConnectBanner={false}
        skills={[]}
      />
    </div>
  );
}
