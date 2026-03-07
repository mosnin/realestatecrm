'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  Phone,
  Bot,
  ArrowRight,
  ArrowLeft,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { createAgentAction } from './actions';

// Flat schema with conditional validation via superRefine
const telephonySchema = z
  .object({
    telephonyType: z.enum(['RETELL_MANAGED', 'TWILIO']),
    areaCode: z.string().optional(),
    twilioAccountSid: z.string().optional(),
    twilioAuthToken: z.string().optional(),
    twilioPhoneNumber: z.string().optional(),
    twilioFriendlyName: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.telephonyType === 'RETELL_MANAGED') {
      if (data.areaCode && !/^\d{3}$/.test(data.areaCode)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Must be a 3-digit area code',
          path: ['areaCode'],
        });
      }
    }
    if (data.telephonyType === 'TWILIO') {
      if (!data.twilioAccountSid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Account SID is required',
          path: ['twilioAccountSid'],
        });
      }
      if (!data.twilioAuthToken) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Auth Token is required',
          path: ['twilioAuthToken'],
        });
      }
      if (!data.twilioPhoneNumber || !/^\+1\d{10}$/.test(data.twilioPhoneNumber)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Must be E.164 format (e.g., +12125551234)',
          path: ['twilioPhoneNumber'],
        });
      }
    }
  });

const agentSchema = z.object({
  greeting: z.string().min(1, 'Greeting is required'),
  market: z.string().min(1, 'Primary market is required'),
  brokerageName: z.string().min(1, 'Brokerage name is required'),
});

type TelephonyData = z.infer<typeof telephonySchema>;
type AgentData = z.infer<typeof agentSchema>;

export function AgentSetupForm() {
  const [step, setStep] = useState<1 | 2>(1);
  const [telephonyData, setTelephonyData] = useState<TelephonyData | null>(
    null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{
    agentId: string;
    phoneNumber: string;
  } | null>(null);

  return (
    <div className="space-y-4">
      {/* Step indicators */}
      <div className="flex items-center gap-2 text-sm">
        <Badge variant={step === 1 ? 'default' : 'secondary'}>
          1. Telephony
        </Badge>
        <ArrowRight size={14} className="text-muted-foreground" />
        <Badge variant={step === 2 ? 'default' : 'secondary'}>
          2. Agent Setup
        </Badge>
      </div>

      {result ? (
        <SuccessCard agentId={result.agentId} phoneNumber={result.phoneNumber} />
      ) : step === 1 ? (
        <TelephonyStep
          onNext={(data) => {
            setTelephonyData(data);
            setStep(2);
          }}
        />
      ) : (
        <AgentStep
          onBack={() => setStep(1)}
          isSubmitting={isSubmitting}
          onSubmit={async (agentData) => {
            if (!telephonyData) return;
            setIsSubmitting(true);
            try {
              const res = await createAgentAction({
                ...telephonyData,
                ...agentData,
              });
              if (res.success) {
                setResult({
                  agentId: res.agentId,
                  phoneNumber: res.phoneNumber,
                });
                toast.success('Agent created successfully!');
              }
            } catch (error) {
              toast.error(
                error instanceof Error
                  ? error.message
                  : 'Failed to create agent'
              );
            } finally {
              setIsSubmitting(false);
            }
          }}
        />
      )}
    </div>
  );
}

function TelephonyStep({ onNext }: { onNext: (data: TelephonyData) => void }) {
  const [type, setType] = useState<'RETELL_MANAGED' | 'TWILIO'>(
    'RETELL_MANAGED'
  );
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TelephonyData>({
    resolver: zodResolver(telephonySchema),
    defaultValues: { telephonyType: 'RETELL_MANAGED' },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone size={20} />
          Choose Your Phone Setup
        </CardTitle>
        <CardDescription>
          Select how you want to connect a phone number to your AI agent.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onNext)} className="space-y-6">
          {/* Radio group */}
          <div className="space-y-3">
            <label className="flex items-start gap-3 p-4 border rounded-lg cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5 transition-colors">
              <input
                type="radio"
                value="RETELL_MANAGED"
                checked={type === 'RETELL_MANAGED'}
                {...register('telephonyType', {
                  onChange: (e) => setType(e.target.value),
                })}
                className="mt-1"
              />
              <div>
                <p className="font-medium text-sm">
                  Buy a Retell-managed number
                </p>
                <p className="text-xs text-muted-foreground">
                  Retell provisions and manages the number for you. Easiest
                  option.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-3 p-4 border rounded-lg cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5 transition-colors">
              <input
                type="radio"
                value="TWILIO"
                checked={type === 'TWILIO'}
                {...register('telephonyType', {
                  onChange: (e) => setType(e.target.value),
                })}
                className="mt-1"
              />
              <div>
                <p className="font-medium text-sm">
                  Connect my Twilio number
                </p>
                <p className="text-xs text-muted-foreground">
                  Use your existing Twilio account and phone number via SIP
                  trunking.
                </p>
              </div>
            </label>
          </div>

          {/* Conditional fields */}
          {type === 'RETELL_MANAGED' && (
            <div className="space-y-2">
              <Label htmlFor="areaCode">
                Preferred Area Code{' '}
                <span className="text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="areaCode"
                placeholder="212"
                maxLength={3}
                {...register('areaCode')}
              />
              {errors.areaCode && (
                <p className="text-sm text-destructive">
                  {errors.areaCode.message}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Leave blank for any available US number.
              </p>
            </div>
          )}

          {type === 'TWILIO' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="twilioAccountSid">Twilio Account SID</Label>
                <Input
                  id="twilioAccountSid"
                  placeholder="AC..."
                  {...register('twilioAccountSid')}
                />
                {errors.twilioAccountSid && (
                  <p className="text-sm text-destructive">
                    {errors.twilioAccountSid.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="twilioAuthToken">Auth Token</Label>
                <Input
                  id="twilioAuthToken"
                  type="password"
                  placeholder="Your Twilio auth token"
                  {...register('twilioAuthToken')}
                />
                {errors.twilioAuthToken && (
                  <p className="text-sm text-destructive">
                    {errors.twilioAuthToken.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="twilioPhoneNumber">Phone Number (E.164)</Label>
                <Input
                  id="twilioPhoneNumber"
                  placeholder="+12125551234"
                  {...register('twilioPhoneNumber')}
                />
                {errors.twilioPhoneNumber && (
                  <p className="text-sm text-destructive">
                    {errors.twilioPhoneNumber.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="twilioFriendlyName">
                  Friendly Name{' '}
                  <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="twilioFriendlyName"
                  placeholder="My Lead Line"
                  {...register('twilioFriendlyName')}
                />
              </div>
            </div>
          )}

          <Button type="submit" className="w-full">
            Continue to Agent Setup
            <ArrowRight size={16} className="ml-2" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function AgentStep({
  onBack,
  onSubmit,
  isSubmitting,
}: {
  onBack: () => void;
  onSubmit: (data: AgentData) => void;
  isSubmitting: boolean;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AgentData>({
    resolver: zodResolver(agentSchema),
    defaultValues: {
      greeting:
        'Hi, this is your AI real estate assistant. How can I help you today?',
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot size={20} />
          Customize Your Agent
        </CardTitle>
        <CardDescription>
          Personalize the AI agent for your market and brokerage.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="greeting">Greeting Message</Label>
            <Textarea
              id="greeting"
              rows={2}
              placeholder="Hi, this is [Your Realty] AI assistant..."
              {...register('greeting')}
            />
            {errors.greeting && (
              <p className="text-sm text-destructive">
                {errors.greeting.message}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              This is the first thing callers will hear.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="market">Primary Market / City</Label>
            <Input
              id="market"
              placeholder="e.g., Austin, TX"
              {...register('market')}
            />
            {errors.market && (
              <p className="text-sm text-destructive">
                {errors.market.message}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Used to personalize the agent's knowledge of local areas and
              neighborhoods.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="brokerageName">Brokerage Name</Label>
            <Input
              id="brokerageName"
              placeholder="e.g., Sunshine Realty Group"
              {...register('brokerageName')}
            />
            {errors.brokerageName && (
              <p className="text-sm text-destructive">
                {errors.brokerageName.message}
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              disabled={isSubmitting}
            >
              <ArrowLeft size={16} className="mr-2" />
              Back
            </Button>
            <Button type="submit" className="flex-1" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  Creating Agent...
                </>
              ) : (
                'Create My Custom Agent & Connect Number'
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function SuccessCard({
  agentId,
  phoneNumber,
}: {
  agentId: string;
  phoneNumber: string;
}) {
  return (
    <Card className="border-green-500/50 bg-green-500/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-green-600">
          <CheckCircle2 size={20} />
          Agent is Live!
        </CardTitle>
        <CardDescription>
          Your AI lead qualification agent is ready to take calls.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Phone Number</p>
            <p className="font-mono font-medium">{phoneNumber}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Agent ID</p>
            <p className="font-mono font-medium text-xs truncate">
              {agentId}
            </p>
          </div>
        </div>

        <div className="p-3 bg-muted/50 rounded-lg text-sm">
          <p className="font-medium mb-1">Next steps:</p>
          <ul className="space-y-1 text-muted-foreground list-disc list-inside">
            <li>Share this number on Zillow, Realtor.com, or your website</li>
            <li>Leads will be automatically qualified and scored</li>
            <li>Check the Leads dashboard for incoming qualified leads</li>
          </ul>
        </div>

        <Button
          variant="outline"
          onClick={() => {
            window.location.href = `tel:${phoneNumber}`;
          }}
        >
          <Phone size={16} className="mr-2" />
          Test Call Your Agent
        </Button>
      </CardContent>
    </Card>
  );
}
