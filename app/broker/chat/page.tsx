import { requireBroker } from '@/lib/permissions';
import { supabase } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { TeamChatClient } from './team-chat-client';
import type { ChatContact } from './team-chat-client';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Team Chat — Broker Dashboard' };

export default async function TeamChatPage() {
  let ctx;
  try {
    ctx = await requireBroker();
  } catch {
    redirect('/');
  }

  const { brokerage } = ctx;

  // Find the broker owner's space
  const { data: ownerSpace } = await supabase
    .from('Space')
    .select('id')
    .eq('ownerId', brokerage.ownerId)
    .maybeSingle();

  const brokerSpaceId = ownerSpace?.id ?? null;

  // Fetch contacts from the broker's space for @ mentions
  let contacts: ChatContact[] = [];
  if (brokerSpaceId) {
    const { data } = await supabase
      .from('Contact')
      .select('id, name, phone, email, scoreLabel')
      .eq('spaceId', brokerSpaceId)
      .order('createdAt', { ascending: false })
      .limit(50);
    contacts = (data ?? []) as ChatContact[];
  }

  return <TeamChatClient contacts={contacts} />;
}
