import { supabase } from '@/lib/supabase';
import { unscoped } from '@/lib/supabase-guard';
import { isRealtorConversation } from '@/lib/chat/conversation-access';

export interface AuthorizedRealtorConversation {
  conversation: {
    id: string;
    spaceId: string;
    title: string;
    mode?: 'chat' | 'work' | null;
    executionMode?: 'review' | 'autonomous' | null;
  };
  space: {
    id: string;
    ownerId: string;
  };
  dbUser: {
    id: string;
  };
}

/**
 * Authorize access to a realtor-surface conversation.
 *
 * This is intentionally a flat-query helper. Embedded `Space(ownerId)` joins
 * have been fragile in PostgREST because the embedded shape can be an object or
 * an array depending on FK inference; a missed shape branch can silently turn
 * an auth check into a false 403. Keeping this sequence explicit makes the
 * boundary easy to audit:
 *
 *   1. The Clerk user exists in our DB.
 *   2. The caller's owned Spaces are resolved.
 *   3. The conversation exists inside one of those owned Spaces.
 *   4. The conversation is not a reserved broker/team legacy row.
 */
export async function getAuthorizedRealtorConversation({
  clerkUserId,
  conversationId,
}: {
  clerkUserId: string;
  conversationId: string;
}): Promise<AuthorizedRealtorConversation | null> {
  const { data: dbUser, error: userErr } = await supabase
    .from('User')
    .select('id')
    .eq('clerkId', clerkUserId)
    .maybeSingle();
  if (userErr) throw userErr;
  if (!dbUser) return null;

  const { data: spaces, error: spacesErr } = await supabase
    .from('Space')
    .select('id, ownerId')
    .eq('ownerId', dbUser.id);
  if (spacesErr) throw spacesErr;
  const ownedSpaces = (spaces ?? []) as Array<{ id: string; ownerId: string }>;
  if (ownedSpaces.length === 0) return null;

  const { data: conversation, error: convErr } = await unscoped(
    supabase
      .from('Conversation')
      .select('id, spaceId, title, mode, executionMode')
      .eq('id', conversationId)
      .in('spaceId', ownedSpaces.map((space) => space.id)),
    'post-fetch: .in(spaceId, ownedSpaces) after Space.ownerId proof',
  ).maybeSingle();
  if (convErr) throw convErr;
  if (!conversation) return null;

  const space = ownedSpaces.find((candidate) => candidate.id === conversation.spaceId);
  if (!space) return null;

  if (!isRealtorConversation(conversation, space.id)) return null;

  return { conversation, space, dbUser };
}
