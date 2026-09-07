import { notFound } from 'next/navigation';
import { getBrokerRecord } from '@/lib/broker-records';
import { BrokerRecordDetail } from '@/components/broker/record-detail';
import { attachPeopleWork } from '@/lib/people-work';
import { personAttention } from '@/lib/people-attention';
import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await getBrokerRecord('people', id);
  if (!record) notFound();
  const [person] = await attachPeopleWork([record]);
  const { data: activity, error } = await tenantTable(supabase, 'ContactActivity', { spaceId: person.spaceId }).select('id, type, content, createdAt').eq('contactId', id).order('createdAt', { ascending: false }).limit(30);
  if (error) throw error;
  return <BrokerRecordDetail title={person.name} back="/broker/people" fields={[
    {label:'Relationship', value:person.leadType}, {label:'Attention', value:personAttention(person).reason ?? 'No due follow-up flagged'},
    {label:'Follow-through', value:person.workUnavailable ? 'Follow-through status unavailable' : person.work ? `${person.work.label} · ${person.work.title}` : 'No unfinished commitment recorded'},
    {label:'Email', value:person.email}, {label:'Phone', value:person.phone},
    {label:'Follow-up due', value:person.followUpAt}, {label:'Last contact logged', value:person.lastContactedAt},
    {label:'Preferences', value:person.preferences}, {label:'Notes', value:person.notes},
  ]}><section className="space-y-3"><h2 className="font-medium">Recent activity</h2>{!activity?.length && <p className="text-sm text-muted-foreground">No activity recorded.</p>}{activity?.map((row: {id: string; type: string; content: string | null; createdAt: string}) => <article key={row.id} className="border-b py-3 text-sm"><p className="text-xs text-muted-foreground">{row.type} · {new Date(row.createdAt).toLocaleString()}</p><p className="mt-1 whitespace-pre-wrap">{row.content}</p></article>)}</section></BrokerRecordDetail>;
}
