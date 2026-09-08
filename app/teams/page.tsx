import { auth } from '@clerk/nextjs/server';
import { redirect, notFound } from 'next/navigation';
import { TeamsClient } from './teams-client';
export default async function TeamsPage() {
  if (process.env.CHIPPI_WORKFORCE_ENABLED !== 'true') notFound();
  if (!(await auth()).userId) redirect('/login/realtor');
  return <TeamsClient />;
}
