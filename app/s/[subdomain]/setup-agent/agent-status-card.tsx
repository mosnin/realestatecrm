'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Phone, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import type { RetellAgentRecord } from '@/lib/types/retell';

interface AgentStatusCardProps {
  agent: RetellAgentRecord;
  subdomain: string;
}

export function AgentStatusCard({ agent, subdomain }: AgentStatusCardProps) {
  const statusConfig = {
    ACTIVE: {
      label: 'Live',
      variant: 'default' as const,
      icon: CheckCircle2,
      color: 'text-green-600',
    },
    ERROR: {
      label: 'Error',
      variant: 'destructive' as const,
      icon: AlertCircle,
      color: 'text-red-600',
    },
    INACTIVE: {
      label: 'Inactive',
      variant: 'secondary' as const,
      icon: AlertCircle,
      color: 'text-muted-foreground',
    },
  };

  const status = statusConfig[agent.status];
  const StatusIcon = status.icon;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <StatusIcon size={20} className={status.color} />
            Your AI Agent
          </CardTitle>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
        <CardDescription>
          Agent created on{' '}
          {new Date(agent.createdAt).toLocaleDateString('en-US', {
            dateStyle: 'medium',
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Phone Number</p>
            <p className="font-mono font-medium">{agent.phoneNumber}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Telephony</p>
            <p className="font-medium">
              {agent.telephonyType === 'RETELL_MANAGED'
                ? 'Retell Managed'
                : 'Twilio'}
            </p>
          </div>
          {agent.market && (
            <div>
              <p className="text-muted-foreground">Market</p>
              <p className="font-medium">{agent.market}</p>
            </div>
          )}
          {agent.brokerageName && (
            <div>
              <p className="text-muted-foreground">Brokerage</p>
              <p className="font-medium">{agent.brokerageName}</p>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              window.location.href = `tel:${agent.phoneNumber}`;
            }}
          >
            <Phone size={14} className="mr-2" />
            Test Call
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={`/s/${subdomain}/leads`}>
              <ExternalLink size={14} className="mr-2" />
              View Leads
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
