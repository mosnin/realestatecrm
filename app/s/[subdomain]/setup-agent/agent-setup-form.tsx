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

const telephonySchema = z.object({
  areaCode: z
    .string()
    .regex(/^\d{3}$/, 'Must be a 3-digit area code')
    .optional()
    .or(z.literal('')),
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
          1. Phone Number
        </Badge>
        <ArrowRight size={14} className="text-muted-foreground" />
        <Badge variant={step === 2 ? 'default' : 'secondary'}>
          2. Agent Setup
        </Badge>
      </div>

      {result ? (
        <SuccessCard
          agentId={result.agentId}
          phoneNumber={result.phoneNumber}
        />
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

function TelephonyStep({
  onNext,
}: {
  onNext: (data: TelephonyData) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TelephonyData>({
    resolver: zodResolver(telephonySchema),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone size={20} />
          Get Your AI Phone Number
        </CardTitle>
        <CardDescription>
          We'll provision a dedicated phone number for your AI lead
          qualification agent. Voice and SMS enabled.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onNext)} className="space-y-6">
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
              Enter a 3-digit US area code to get a local number, or leave
              blank for any available number.
            </p>
          </div>

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
          Your AI lead qualification agent is ready to take calls and SMS.
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
            <li>
              Check the Leads dashboard for incoming qualified leads
            </li>
            <li>
              View conversation transcripts in the History tab
            </li>
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
