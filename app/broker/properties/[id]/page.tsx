import { notFound } from 'next/navigation';
import { getBrokerRecord } from '@/lib/broker-records';
import { BrokerRecordDetail } from '@/components/broker/record-detail';
import { formatPropertyAddress, formatPropertyFacts } from '@/lib/properties';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const property = await getBrokerRecord('properties', id);
  if (!property) notFound();
  return <BrokerRecordDetail title={formatPropertyAddress(property)} back="/broker/properties" fields={[
    {label:'Listing status',value:property.listingStatus}, {label:'Saved price',value:property.listPrice == null ? null : `$${Number(property.listPrice).toLocaleString()}`},
    {label:'Specifications',value:formatPropertyFacts(property)}, {label:'MLS number',value:property.mlsNumber},
    {label:'Research',value:property.analysis?.sources?.length ? 'Web evidence saved; availability not verified' : 'No saved evidence'},
    {label:'Notes',value:property.notes},
  ]}><p className="text-sm text-muted-foreground">Assignment is managed in the brokerage property pool.</p>{property.analysis?.sources?.map((source: {url:string;title:string}) => <p key={source.url} className="text-sm">{source.title}</p>)}</BrokerRecordDetail>;
}
