import { readAllRows } from '@/lib/read-all-rows';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getBrokerRecord } from '@/lib/broker-records';
import { BrokerRecordDetail } from '@/components/broker/record-detail';
import { dealHealth, inferNextAction } from '@/lib/deals/health';
import { supabase } from '@/lib/supabase';
import { tenantTable } from '@/lib/tenant-db';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deal = await getBrokerRecord('deals', id);
  if (!deal) notFound();
  const checklist = await readAllRows<any>((from,to) => tenantTable(supabase, 'DealChecklistItem', { spaceId: deal.spaceId }).select('*').eq('dealId', id).order('position').order('id').range(from,to));
  const record = { ...deal, checklist: checklist ?? [] };
  const health = dealHealth(record);
  return <BrokerRecordDetail title={deal.title} back="/broker/deals" fields={[
    {label:'Status',value:deal.status}, {label:'Needs attention',value:health.reason || 'No flagged issues'},
    {label:'Next action',value:inferNextAction(record)?.label}, {label:'Property address',value:deal.address},
    {label:'Expected closing',value:deal.closeDate}, {label:'Actually closed',value:deal.closedAt},
    {label:'Inspection deadline',value:deal.inspectionDeadline}, {label:'Earnest money due',value:deal.earnestDueAt},
    {label:'Transaction value',value:deal.value == null ? null : `$${Number(deal.value).toLocaleString()}`},
  ]}><section><h2 className="font-medium">Closing checklist</h2>{!checklist?.length && <p className="mt-2 text-sm">No checklist recorded. Readiness is unverified.</p>}{checklist?.map((item: {id:string;label:string;completedAt:string|null;dueAt:string|null}) => <p key={item.id} className="border-b py-3 text-sm">{item.label} · {item.completedAt ? 'Completed' : item.dueAt ? `Due ${new Date(item.dueAt).toLocaleString()}` : 'No deadline set'}</p>)}</section><Link href="/broker/reviews" className="text-sm underline">Open deal reviews</Link></BrokerRecordDetail>;
}
