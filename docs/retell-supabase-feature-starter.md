# `app/dashboard/connect-number/page.tsx`

```tsx
import { ConnectNumberForm } from '@/components/retell/connect-number-form';
import { PhoneCall } from 'lucide-react';

export default function ConnectNumberPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <PhoneCall className="h-8 w-8 text-primary" /> Connect Your Lead Line
        </h1>
        <p className="text-muted-foreground">
          Miami Beach moves fast. Connect a number and let your AI agent qualify
          inbound calls and SMS 24/7.
        </p>
      </div>

      <ConnectNumberForm />
    </div>
  );
}
```

---

# `components/retell/connect-number-form.tsx`

```tsx
'use client';

import { useState, useTransition } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { connectRetellManagedNumber, connectTwilioNumberAndCreateAgent } from '@/lib/actions/retell-number-actions';

export function ConnectNumberForm() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [areaCode, setAreaCode] = useState('305');

  const [accountSid, setAccountSid] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [friendlyName, setFriendlyName] = useState('Miami Beach Lead Line');

  function resetMessages() {
    setError(null);
    setSuccess(null);
  }

  function onBuyAndConnect() {
    resetMessages();
    startTransition(async () => {
      const result = await connectRetellManagedNumber({ areaCode });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(
        `Connected ${result.phoneNumber}. Your AI agent is live on this number! Inbound calls/SMS will be qualified automatically.`
      );
    });
  }

  function onConnectTwilio() {
    resetMessages();
    startTransition(async () => {
      const result = await connectTwilioNumberAndCreateAgent({
        accountSid,
        authToken,
        phoneNumber,
        friendlyName
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(
        `Connected ${result.phoneNumber}. Your AI agent is live on this number! Inbound calls/SMS will be qualified automatically.`
      );
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Phone Setup</CardTitle>
        <CardDescription>
          Pick the fastest option for your team.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs defaultValue="retell" className="w-full">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="retell">Buy via Retell</TabsTrigger>
            <TabsTrigger value="twilio">Bring Twilio Number</TabsTrigger>
          </TabsList>

          <TabsContent value="retell" className="mt-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="areaCode">US Area Code</Label>
              <Input
                id="areaCode"
                value={areaCode}
                onChange={(e) => setAreaCode(e.target.value)}
                placeholder="305"
                maxLength={3}
              />
              <p className="text-xs text-muted-foreground">
                Default is 305 for Miami/Miami Beach inventory.
              </p>
            </div>
            <Button onClick={onBuyAndConnect} disabled={pending} className="w-full">
              {pending ? 'Working...' : 'Buy & Connect Number'}
            </Button>
          </TabsContent>

          <TabsContent value="twilio" className="mt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="accountSid">Twilio Account SID</Label>
                <Input
                  id="accountSid"
                  value={accountSid}
                  onChange={(e) => setAccountSid(e.target.value)}
                  placeholder="ACxxxxxxxxxxxxxxxx"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="authToken">Twilio Auth Token</Label>
                <Input
                  id="authToken"
                  type="password"
                  value={authToken}
                  onChange={(e) => setAuthToken(e.target.value)}
                  placeholder="••••••••••"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phoneNumber">Phone Number (E.164)</Label>
                <Input
                  id="phoneNumber"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+13055551234"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="friendlyName">Friendly Name (Optional)</Label>
                <Input
                  id="friendlyName"
                  value={friendlyName}
                  onChange={(e) => setFriendlyName(e.target.value)}
                  placeholder="South Beach Lead Line"
                />
              </div>
            </div>

            <Button onClick={onConnectTwilio} disabled={pending} className="w-full">
              {pending ? 'Connecting...' : 'Connect Twilio Number & Create Retell Agent'}
            </Button>
          </TabsContent>
        </Tabs>

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Could not connect number</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert>
            <AlertTitle>Setup complete 🎉</AlertTitle>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
```

---

# `app/dashboard/leads/page.tsx`

```tsx
import { LeadsTable } from '@/components/retell/leads-table';

export default function LeadsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Qualified Leads</h1>
        <p className="text-muted-foreground">
          Real-time pipeline from your AI call/SMS qualification flow.
        </p>
      </div>

      <LeadsTable />
    </div>
  );
}
```

---

# `components/retell/leads-table.tsx`

```tsx
'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { useRealtimeLeads } from '@/hooks/use-realtime-leads';
import { formatDistanceToNow } from 'date-fns';

function scoreBadge(score: 'HOT' | 'WARM' | 'COLD') {
  switch (score) {
    case 'HOT':
      return 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400';
    case 'WARM':
      return 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400';
    default:
      return 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400';
  }
}

export function LeadsTable() {
  const { leads, loading } = useRealtimeLeads();

  const sorted = useMemo(
    () => [...leads].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)),
    [leads]
  );

  if (loading) {
    return <Card><CardContent className="py-10 text-sm text-muted-foreground">Loading leads...</CardContent></Card>;
  }

  if (sorted.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-sm text-muted-foreground">
          No qualified leads yet – promote your number! 🏝️
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="rounded-md border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Lead Phone</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Score</TableHead>
            <TableHead>Intent</TableHead>
            <TableHead>Budget</TableHead>
            <TableHead>Timeline</TableHead>
            <TableHead>Preferred Areas</TableHead>
            <TableHead>Transcript Summary</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((lead) => (
            <TableRow key={lead.id}>
              <TableCell className="font-medium">{lead.lead_phone_number}</TableCell>
              <TableCell>
                {formatDistanceToNow(new Date(lead.created_at), { addSuffix: true })}
              </TableCell>
              <TableCell>
                <Badge className={scoreBadge(lead.qualification_score)}>
                  {lead.qualification_score}
                </Badge>
              </TableCell>
              <TableCell>{lead.intent}</TableCell>
              <TableCell>{lead.budget_range ?? '—'}</TableCell>
              <TableCell>{lead.timeline ?? '—'}</TableCell>
              <TableCell>{lead.preferred_areas?.join(', ') || '—'}</TableCell>
              <TableCell className="max-w-[260px] truncate">{lead.transcript_summary || '—'}</TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-2">
                  <Button size="sm" variant="secondary">View Details</Button>
                  <Button size="sm" variant="outline">Add to CRM</Button>
                  <Button size="sm">Call Back</Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

---

# `hooks/use-realtime-leads.ts`

```tsx
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { toast } from 'sonner';
import type { Lead } from '@/types/lead';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export function useRealtimeLeads() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    (async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (!active) return;
      if (!error && data) setLeads(data as Lead[]);
      setLoading(false);
    })();

    const channel = supabase
      .channel('public:leads')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'leads' },
        (payload) => {
          const newLead = payload.new as Lead;
          setLeads((prev) => [newLead, ...prev]);

          if (newLead.qualification_score === 'HOT') {
            toast.success(
              `New Hot Lead from ${newLead.lead_phone_number}! Budget: ${newLead.budget_range ?? 'Unknown'}`
            );
          } else {
            toast(
              `New ${newLead.qualification_score} lead from ${newLead.lead_phone_number}`
            );
          }
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  return { leads, loading };
}
```

---

# `types/lead.ts`

```ts
export type LeadScore = 'HOT' | 'WARM' | 'COLD';
export type LeadIntent = 'BUYER' | 'SELLER' | 'RENTER' | 'OTHER';

export interface Lead {
  id: string;
  user_id: string;
  call_id: string;
  retell_agent_id: string;
  lead_phone_number: string;
  qualification_score: LeadScore;
  intent: LeadIntent;
  budget_range: string | null;
  timeline: string | null;
  preferred_areas: string[] | null;
  transcript_summary: string | null;
  full_transcript: string | null;
  analysis_json: Record<string, unknown> | null;
  created_at: string;
}
```

---

# `lib/actions/retell-number-actions.ts`

```ts
'use server';

import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { auth } from '@clerk/nextjs/server';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const twilioSchema = z.object({
  accountSid: z.string().min(10),
  authToken: z.string().min(10),
  phoneNumber: z.string().regex(/^\+[1-9]\d{7,14}$/, 'Must be E.164 format'),
  friendlyName: z.string().optional()
});

const retellBuySchema = z.object({
  areaCode: z.string().regex(/^\d{3}$/)
});

type ActionResult =
  | { ok: true; phoneNumber: string }
  | { ok: false; error: string };

export async function connectRetellManagedNumber(input: {
  areaCode: string;
}): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: 'Unauthorized' };

  const parsed = retellBuySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  try {
    // 1) Buy number from Retell by area code
    const buyRes = await fetch('https://api.retellai.com/v2/phone-numbers/purchase', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RETELL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ country: 'US', area_code: parsed.data.areaCode })
    });

    if (!buyRes.ok) {
      return { ok: false, error: `Retell number purchase failed (${buyRes.status})` };
    }

    const bought = await buyRes.json();

    // 2) Create agent clone/template
    const agentRes = await fetch('https://api.retellai.com/v2/agents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RETELL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        template_id: process.env.RETELL_REAL_ESTATE_AGENT_TEMPLATE_ID,
        metadata: { user_id: userId, market: 'miami-beach' }
      })
    });

    if (!agentRes.ok) {
      return { ok: false, error: `Retell agent creation failed (${agentRes.status})` };
    }

    const agent = await agentRes.json();

    // 3) Bind number -> agent
    const bindRes = await fetch(`https://api.retellai.com/v2/phone-numbers/${bought.phone_number_id}/assign-agent`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RETELL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ agent_id: agent.agent_id })
    });

    if (!bindRes.ok) {
      return { ok: false, error: `Failed to assign number to agent (${bindRes.status})` };
    }

    await supabaseAdmin.from('user_phone_agents').insert({
      user_id: userId,
      retell_agent_id: agent.agent_id,
      phone_number: bought.e164_phone_number
    });

    return { ok: true, phoneNumber: bought.e164_phone_number };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unexpected server error'
    };
  }
}

export async function connectTwilioNumberAndCreateAgent(input: {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
  friendlyName?: string;
}): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: 'Unauthorized' };

  const parsed = twilioSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };

  try {
    // 1) Import Twilio number into Retell SIP trunking
    const importRes = await fetch('https://api.retellai.com/v2/phone-numbers/import-twilio', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RETELL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        twilio_account_sid: parsed.data.accountSid,
        twilio_auth_token: parsed.data.authToken,
        phone_number: parsed.data.phoneNumber,
        friendly_name: parsed.data.friendlyName
      })
    });

    if (!importRes.ok) {
      return { ok: false, error: `Twilio import failed (${importRes.status})` };
    }

    const imported = await importRes.json();

    // 2) Create dedicated realtor agent
    const agentRes = await fetch('https://api.retellai.com/v2/agents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RETELL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        template_id: process.env.RETELL_REAL_ESTATE_AGENT_TEMPLATE_ID,
        metadata: { user_id: userId, market: 'miami-beach' }
      })
    });

    if (!agentRes.ok) {
      return { ok: false, error: `Retell agent creation failed (${agentRes.status})` };
    }

    const agent = await agentRes.json();

    // 3) Bind number to new agent
    const bindRes = await fetch(`https://api.retellai.com/v2/phone-numbers/${imported.phone_number_id}/assign-agent`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RETELL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ agent_id: agent.agent_id })
    });

    if (!bindRes.ok) {
      return { ok: false, error: `Failed to assign number to agent (${bindRes.status})` };
    }

    await supabaseAdmin.from('user_phone_agents').insert({
      user_id: userId,
      retell_agent_id: agent.agent_id,
      phone_number: parsed.data.phoneNumber
    });

    return { ok: true, phoneNumber: parsed.data.phoneNumber };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unexpected server error'
    };
  }
}
```

---

# `app/api/retell-webhook/route.ts`

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type RetellWebhookEvent = 'call_started' | 'call_ended' | 'call_analyzed';

type RetellPayload = {
  event: RetellWebhookEvent;
  call: {
    call_id: string;
    from_number?: string;
    agent_id?: string;
    transcript?: string;
    transcript_summary?: string;
    variables?: Record<string, string | number | boolean | null>;
    analysis?: Record<string, unknown>;
  };
};

function verifyRetellSignature(rawBody: string, signature: string | null) {
  // Replace with official Retell SDK method when installed:
  // retell.webhooks.verify(rawBody, signature, process.env.RETELL_WEBHOOK_SECRET)
  return !!signature && signature.length > 10 && rawBody.length > 2;
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get('x-retell-signature');
  const rawBody = await req.text();

  if (!verifyRetellSignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
  }

  const payload = JSON.parse(rawBody) as RetellPayload;

  if (payload.event !== 'call_ended' && payload.event !== 'call_analyzed') {
    return NextResponse.json({ received: true, ignored: true });
  }

  const call = payload.call;
  const agentId = call.agent_id;
  if (!agentId) {
    return NextResponse.json({ error: 'Missing agent_id' }, { status: 400 });
  }

  const { data: mapping, error: mappingErr } = await supabaseAdmin
    .from('user_phone_agents')
    .select('user_id, retell_agent_id')
    .eq('retell_agent_id', agentId)
    .single();

  if (mappingErr || !mapping) {
    return NextResponse.json({ error: 'Unknown agent mapping' }, { status: 404 });
  }

  const scoreRaw = String(call.variables?.score ?? call.variables?.qualification_score ?? 'COLD').toUpperCase();
  const score = scoreRaw === 'HOT' || scoreRaw === 'WARM' ? scoreRaw : 'COLD';

  const intentRaw = String(call.variables?.intent ?? 'OTHER').toUpperCase();
  const intent = ['BUYER', 'SELLER', 'RENTER'].includes(intentRaw) ? intentRaw : 'OTHER';

  const preferredAreas = String(call.variables?.preferred_areas ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

  const insertPayload = {
    user_id: mapping.user_id,
    call_id: call.call_id,
    retell_agent_id: mapping.retell_agent_id,
    lead_phone_number: call.from_number ?? 'Unknown',
    qualification_score: score,
    intent,
    budget_range: String(call.variables?.budget ?? call.variables?.budget_range ?? '' || '') || null,
    timeline: String(call.variables?.timeline ?? '' || '') || null,
    preferred_areas: preferredAreas.length ? preferredAreas : null,
    transcript_summary: call.transcript_summary ?? null,
    full_transcript: call.transcript ?? null,
    analysis_json: call.analysis ?? null
  };

  const { error: insertErr } = await supabaseAdmin.from('leads').insert(insertPayload);

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
```

---

# `supabase/migrations/20260601000000_create_retell_leads.sql`

```sql
create table if not exists public.user_phone_agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  retell_agent_id text not null unique,
  phone_number text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  call_id text not null unique,
  retell_agent_id text not null,
  lead_phone_number text not null,
  qualification_score text not null check (qualification_score in ('HOT', 'WARM', 'COLD')),
  intent text not null check (intent in ('BUYER', 'SELLER', 'RENTER', 'OTHER')),
  budget_range text,
  timeline text,
  preferred_areas text[],
  transcript_summary text,
  full_transcript text,
  analysis_json jsonb,
  created_at timestamptz not null default now()
);

create index if not exists leads_user_id_created_at_idx
  on public.leads (user_id, created_at desc);

alter table public.leads enable row level security;
alter table public.user_phone_agents enable row level security;

create policy "Users can read their own leads"
  on public.leads for select
  using (auth.uid() = user_id);

create policy "Service role can insert leads"
  on public.leads for insert
  with check (true);
```

---

# `lib/retell/metadata-example.ts`

```ts
/**
 * Always include tenant metadata when creating Retell agents/calls so
 * webhook processing can map events back to the Realtor account.
 */
export const retellAgentCreateExample = {
  template_id: process.env.RETELL_REAL_ESTATE_AGENT_TEMPLATE_ID,
  metadata: {
    user_id: 'uuid-of-realtor',
    tenant_slug: 'miami-beach-team',
    market: 'miami-beach'
  }
};

export const retellOutboundCallCreateExample = {
  to_number: '+13055551234',
  agent_id: 'agent_xxx',
  metadata: {
    user_id: 'uuid-of-realtor',
    source: 'crm-manual-dial'
  }
};
```

---

# `Notes`

```txt
Required env vars:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- RETELL_API_KEY
- RETELL_WEBHOOK_SECRET
- RETELL_REAL_ESTATE_AGENT_TEMPLATE_ID

Optional UX enhancements:
- Use `Dialog` for "View Details" transcript drill-down.
- Add virtualized rows for high-volume teams.
- Add optimistic "Add to CRM" action writing into `contacts` table.
```
