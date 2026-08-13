import { redirect } from 'next/navigation';

/**
 * Brokerage default entry. Today is the default surface; legacy deep links
 * that carried a chat conversation or prompt keep working by moving to the
 * canonical Chippi route.
 */
export default async function BrokerHomePage({
  searchParams,
}: {
  searchParams: Promise<{ conversationId?: string; prompt?: string; prefill?: string }>;
}) {
  const { conversationId, prompt, prefill } = await searchParams;
  const query = new URLSearchParams();
  if (conversationId) query.set('conversationId', conversationId);
  if (prompt) query.set('prompt', prompt);
  if (prefill) query.set('prefill', prefill);

  const serialized = query.toString();
  redirect(serialized ? `/broker/chippi?${serialized}` : '/broker/brief');
}
