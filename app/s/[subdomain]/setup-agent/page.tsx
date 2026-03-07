import { notFound } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSubdomain } from '@/lib/space';
import { db } from '@/lib/db';
import { AgentSetupForm } from '@/components/agent/AgentSetupForm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Phone, PhoneCall } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Setup AI Agent — Real Estate CRM'
};

export default async function SetupAgentPage({
  params
}: {
  params: Promise<{ subdomain: string }>;
}) {
  const { subdomain } = await params;
  const { userId } = await auth();
  if (!userId) return null; // middleware handles redirect

  const space = await getSpaceFromSubdomain(subdomain);
  if (!space) notFound();

  // Check if an agent is already configured for this space
  const existingAgent = await db.retellAgent.findUnique({
    where: { spaceId: space.id }
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">AI Agent Setup</h2>
        <p className="text-muted-foreground">
          Configure your personal AI voice agent to qualify inbound leads 24/7.
        </p>
      </div>

      {existingAgent ? (
        // ── Already configured — show status card ──
        <Card className="max-w-lg">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <CardTitle>Agent Active</CardTitle>
                <CardDescription>
                  {existingAgent.brokerageName} — {existingAgent.primaryMarket}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Phone Number</span>
                <Badge variant="default" className="font-mono">
                  {existingAgent.phoneNumber}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge
                  className={
                    existingAgent.status === 'ACTIVE'
                      ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200'
                      : existingAgent.status === 'ERROR'
                      ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200'
                      : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200'
                  }
                >
                  {existingAgent.status === 'ACTIVE'
                    ? 'Live'
                    : existingAgent.status === 'ERROR'
                    ? 'Error'
                    : 'Pending'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Telephony</span>
                <span className="text-sm">
                  {existingAgent.telephonyType === 'RETELL_MANAGED' ? 'Retell Managed' : 'Twilio'}
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-900/20 p-4">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-300 mb-1">
                Webhook URL
              </p>
              <code className="text-xs text-blue-700 dark:text-blue-400 break-all">
                {process.env.NEXT_PUBLIC_APP_URL ??
                  `https://${subdomain}.${process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'yourdomain.com'}`}
                /api/retell-webhook
              </code>
              <p className="text-xs text-blue-600 dark:text-blue-500 mt-1">
                Set this URL in your Retell dashboard under Webhook settings.
              </p>
            </div>

            <Button
              variant="outline"
              className="w-full gap-2"
              asChild
            >
              <a href={`tel:${existingAgent.phoneNumber}`}>
                <PhoneCall className="h-4 w-4" />
                Test Call Your Agent
              </a>
            </Button>
          </CardContent>
        </Card>
      ) : (
        // ── Not configured — show setup wizard ──
        <AgentSetupForm subdomain={subdomain} spaceId={space.id} />
      )}
    </div>
  );
}
