'use client';

import dynamic from 'next/dynamic';

const ApplicationForm = dynamic(
  () => import('./application-form').then((m) => m.ApplicationForm),
  { ssr: false }
);

export function ApplicationFormLoader({ slug, businessName }: { slug: string; businessName: string }) {
  return <ApplicationForm slug={slug} businessName={businessName} />;
}
