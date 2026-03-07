'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  Phone,
  CheckCircle2,
  Radio,
  Loader2,
  ChevronRight,
  ChevronLeft,
  PhoneCall
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Progress } from '@/components/ui/progress';
import { createAgentAction } from '@/app/s/[subdomain]/setup-agent/actions';
import type { AgentConfig } from '@/lib/types';

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const step1RetellSchema = z.object({
  telephonyType: z.literal('RETELL_MANAGED'),
  areaCode: z
    .string()
    .regex(/^\d{3}$/, 'Area code must be exactly 3 digits (e.g. 415)')
});

const step1TwilioSchema = z.object({
  telephonyType: z.literal('TWILIO'),
  twilioAccountSid: z
    .string()
    .min(1, 'Account SID is required')
    .startsWith('AC', 'Account SID must start with "AC"'),
  twilioAuthToken: z.string().min(1, 'Auth Token is required'),
  twilioPhoneNumber: z
    .string()
    .regex(/^\+1[2-9]\d{9}$/, 'Must be a valid US E.164 number (e.g. +14155551234)'),
  twilioFriendlyName: z.string().optional()
});

const step1Schema = z.discriminatedUnion('telephonyType', [
  step1RetellSchema,
  step1TwilioSchema
]);

const step2Schema = z.object({
  greetingText: z.string().min(10, 'Greeting must be at least 10 characters'),
  primaryMarket: z.string().min(2, 'Primary market is required (e.g. San Francisco, CA)'),
  brokerageName: z.string().min(2, 'Brokerage name is required')
});

const fullSchema = step2Schema.and(
  z.object({
    telephonyType: z.enum(['RETELL_MANAGED', 'TWILIO']),
    areaCode: z.string().optional(),
    twilioAccountSid: z.string().optional(),
    twilioAuthToken: z.string().optional(),
    twilioPhoneNumber: z.string().optional(),
    twilioFriendlyName: z.string().optional()
  })
);

type FormValues = z.infer<typeof fullSchema>;

// ─── Props ────────────────────────────────────────────────────────────────────

interface AgentSetupFormProps {
  subdomain: string;
  spaceId: string;
}

// ─── Success view ─────────────────────────────────────────────────────────────

function AgentSuccessView({
  phoneNumber,
  agentId,
  brokerageName
}: {
  phoneNumber: string;
  agentId: string;
  brokerageName: string;
}) {
  return (
    <Card className="max-w-lg mx-auto">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
          <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
        </div>
        <CardTitle className="text-2xl">Your Agent Is Live!</CardTitle>
        <CardDescription>
          {brokerageName}&apos;s AI voice agent is ready to qualify leads 24/7.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Phone Number</span>
            <Badge variant="default" className="font-mono text-base px-3 py-1">
              {phoneNumber}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-green-200">
              Live
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Agent ID</span>
            <span className="text-xs font-mono text-muted-foreground">{agentId.slice(0, 16)}…</span>
          </div>
        </div>

        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-900/20 p-4">
          <p className="text-sm font-medium text-blue-900 dark:text-blue-300 mb-1">
            Next steps
          </p>
          <ul className="text-sm text-blue-800 dark:text-blue-400 space-y-1 list-disc list-inside">
            <li>Share your number on Zillow, Realtor.com, and your website</li>
            <li>Add <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">/api/retell-webhook</code> as your Retell webhook URL</li>
            <li>Leads will appear in your <strong>Leads</strong> dashboard automatically</li>
          </ul>
        </div>

        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={() => window.open(`tel:${phoneNumber}`)}
        >
          <PhoneCall className="h-4 w-4" />
          Test Call Your Agent
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Main form ────────────────────────────────────────────────────────────────

export function AgentSetupForm({ subdomain, spaceId }: AgentSetupFormProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [isPending, startTransition] = useTransition();
  const [successData, setSuccessData] = useState<{
    phoneNumber: string;
    agentId: string;
    brokerageName: string;
  } | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(fullSchema),
    defaultValues: {
      telephonyType: 'RETELL_MANAGED',
      areaCode: '',
      greetingText: "Hi, this is your AI assistant. How can I help you today?",
      primaryMarket: '',
      brokerageName: ''
    }
  });

  const telephonyType = form.watch('telephonyType');

  const validateStep1 = async () => {
    const values = form.getValues();
    const parseResult = step1Schema.safeParse(
      telephonyType === 'RETELL_MANAGED'
        ? { telephonyType: 'RETELL_MANAGED', areaCode: values.areaCode }
        : {
            telephonyType: 'TWILIO',
            twilioAccountSid: values.twilioAccountSid,
            twilioAuthToken: values.twilioAuthToken,
            twilioPhoneNumber: values.twilioPhoneNumber,
            twilioFriendlyName: values.twilioFriendlyName
          }
    );

    if (!parseResult.success) {
      // Zod v4 uses .issues; fall back to .errors for older versions
      const issues = (parseResult.error as any).issues ?? (parseResult.error as any).errors ?? [];
      issues.forEach((e: { path: (string | number)[]; message: string }) => {
        const field = e.path[e.path.length - 1] as any;
        form.setError(field, { message: e.message });
      });
      return false;
    }
    return true;
  };

  const handleNext = async () => {
    const valid = await validateStep1();
    if (valid) setStep(2);
  };

  const onSubmit = (values: FormValues) => {
    startTransition(async () => {
      const config: AgentConfig = {
        telephonyType: values.telephonyType,
        areaCode: values.areaCode,
        twilioAccountSid: values.twilioAccountSid,
        twilioAuthToken: values.twilioAuthToken,
        twilioPhoneNumber: values.twilioPhoneNumber,
        twilioFriendlyName: values.twilioFriendlyName,
        greetingText: values.greetingText,
        primaryMarket: values.primaryMarket,
        brokerageName: values.brokerageName
      };

      const result = await createAgentAction(subdomain, config);

      if (result.success) {
        toast.success('Agent created successfully!', {
          description: `Your number ${result.phoneNumber} is now live.`
        });
        setSuccessData({
          phoneNumber: result.phoneNumber,
          agentId: result.agentId,
          brokerageName: values.brokerageName
        });
      } else {
        toast.error('Failed to create agent', { description: result.error });
      }
    });
  };

  if (successData) {
    return (
      <AgentSuccessView
        phoneNumber={successData.phoneNumber}
        agentId={successData.agentId}
        brokerageName={successData.brokerageName}
      />
    );
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      {/* Step progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Step {step} of 2</span>
          <span className="text-muted-foreground">
            {step === 1 ? 'Phone Number Setup' : 'Agent Customization'}
          </span>
        </div>
        <Progress value={step === 1 ? 50 : 100} />
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* ── Step 1: Telephony ── */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5" />
                Choose Your Phone Number
              </CardTitle>
              <CardDescription>
                Your AI agent needs a dedicated phone number to receive calls and SMS.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <RadioGroup
                value={telephonyType}
                onValueChange={(v) =>
                  form.setValue('telephonyType', v as 'RETELL_MANAGED' | 'TWILIO')
                }
                className="gap-4"
              >
                {/* Option A: Retell-managed */}
                <Label
                  htmlFor="retell-managed"
                  className={`flex cursor-pointer items-start gap-4 rounded-lg border p-4 transition-colors ${
                    telephonyType === 'RETELL_MANAGED'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <RadioGroupItem value="RETELL_MANAGED" id="retell-managed" className="mt-1" />
                  <div className="space-y-1">
                    <p className="font-medium leading-none">Buy a Retell-managed number</p>
                    <p className="text-sm text-muted-foreground">
                      Get a new US number instantly. Fastest setup — no Twilio account needed.
                    </p>
                  </div>
                </Label>

                {/* Option B: Twilio */}
                <Label
                  htmlFor="twilio"
                  className={`flex cursor-pointer items-start gap-4 rounded-lg border p-4 transition-colors ${
                    telephonyType === 'TWILIO'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <RadioGroupItem value="TWILIO" id="twilio" className="mt-1" />
                  <div className="space-y-1">
                    <p className="font-medium leading-none">Connect my Twilio number</p>
                    <p className="text-sm text-muted-foreground">
                      Use an existing Twilio number via SIP trunking. Requires Twilio credentials.
                    </p>
                  </div>
                </Label>
              </RadioGroup>

              {/* Conditional fields */}
              {telephonyType === 'RETELL_MANAGED' && (
                <div className="space-y-2">
                  <Label htmlFor="areaCode">
                    Preferred area code{' '}
                    <span className="text-muted-foreground font-normal">(3 digits)</span>
                  </Label>
                  <Input
                    id="areaCode"
                    placeholder="e.g. 415"
                    maxLength={3}
                    {...form.register('areaCode')}
                  />
                  {form.formState.errors.areaCode && (
                    <p className="text-sm text-destructive">
                      {form.formState.errors.areaCode.message}
                    </p>
                  )}
                </div>
              )}

              {telephonyType === 'TWILIO' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="twilioAccountSid">Twilio Account SID</Label>
                    <Input
                      id="twilioAccountSid"
                      placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                      {...form.register('twilioAccountSid')}
                    />
                    {form.formState.errors.twilioAccountSid && (
                      <p className="text-sm text-destructive">
                        {form.formState.errors.twilioAccountSid.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="twilioAuthToken">Auth Token</Label>
                    <Input
                      id="twilioAuthToken"
                      type="password"
                      placeholder="Your Twilio Auth Token"
                      {...form.register('twilioAuthToken')}
                    />
                    {form.formState.errors.twilioAuthToken && (
                      <p className="text-sm text-destructive">
                        {form.formState.errors.twilioAuthToken.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="twilioPhoneNumber">
                      Phone Number{' '}
                      <span className="text-muted-foreground font-normal">(E.164 format)</span>
                    </Label>
                    <Input
                      id="twilioPhoneNumber"
                      placeholder="+14155551234"
                      {...form.register('twilioPhoneNumber')}
                    />
                    {form.formState.errors.twilioPhoneNumber && (
                      <p className="text-sm text-destructive">
                        {form.formState.errors.twilioPhoneNumber.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="twilioFriendlyName">
                      Friendly Name{' '}
                      <span className="text-muted-foreground font-normal">(optional)</span>
                    </Label>
                    <Input
                      id="twilioFriendlyName"
                      placeholder="Main Office Line"
                      {...form.register('twilioFriendlyName')}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Step 2: Agent customization ── */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Radio className="h-5 w-5" />
                Customize Your AI Agent
              </CardTitle>
              <CardDescription>
                Personalize how your agent introduces itself and which market it focuses on.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="brokerageName">Brokerage Name</Label>
                <Input
                  id="brokerageName"
                  placeholder="e.g. Bay Area Realty Group"
                  {...form.register('brokerageName')}
                />
                {form.formState.errors.brokerageName && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.brokerageName.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="primaryMarket">Primary Market / City</Label>
                <Input
                  id="primaryMarket"
                  placeholder="e.g. San Francisco, CA"
                  {...form.register('primaryMarket')}
                />
                <p className="text-xs text-muted-foreground">
                  Used to personalise the agent&apos;s knowledge and conversation focus.
                </p>
                {form.formState.errors.primaryMarket && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.primaryMarket.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="greetingText">Agent Greeting</Label>
                <Input
                  id="greetingText"
                  placeholder='Hi, this is [Brokerage] AI assistant. How can I help?'
                  {...form.register('greetingText')}
                />
                <p className="text-xs text-muted-foreground">
                  The first thing your agent says when answering a call.
                </p>
                {form.formState.errors.greetingText && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.greetingText.message}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Navigation buttons */}
        <div className="flex gap-3">
          {step === 2 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep(1)}
              className="flex-1 gap-2"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
          )}

          {step === 1 ? (
            <Button
              type="button"
              onClick={handleNext}
              className="flex-1 gap-2"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={isPending}
              className="flex-1 gap-2"
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating Your Agent…
                </>
              ) : (
                <>
                  <Phone className="h-4 w-4" />
                  Create My Agent &amp; Connect Number
                </>
              )}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
