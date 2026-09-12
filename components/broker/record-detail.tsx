import Link from 'next/link';
export function BrokerRecordDetail({ title, back, fields, children }: { title: string; back: string; fields: { label: string; value: string | number | null | undefined }[]; children?: React.ReactNode }) {
  return <main className="mx-auto max-w-4xl space-y-5 px-4 py-6">
    <Link href={back} className="text-sm underline">Back to records</Link>
    <h1 className="text-2xl font-medium">{title}</h1>
    <dl className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">{fields.map(field => <div key={field.label}><dt className="text-xs text-muted-foreground">{field.label}</dt><dd className="mt-1 break-words text-sm">{field.value ?? 'Not recorded'}</dd></div>)}</dl>
    {children}
  </main>;
}
