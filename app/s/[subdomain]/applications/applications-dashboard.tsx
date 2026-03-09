'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Flame,
  ThermometerSun,
  Snowflake,
  ClipboardList,
  Copy,
  Check,
  Users,
  Calendar,
  DollarSign,
  PawPrint,
  FileText,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import type { RentalApplication, RentalApplicant, QualScore, ApplicationStatus } from '@/lib/types/application';
import { protocol, rootDomain } from '@/lib/utils';

interface ApplicationWithApplicant extends RentalApplication {
  applicants: RentalApplicant[];
}

interface Props {
  applications: ApplicationWithApplicant[];
  subdomain: string;
}

const scoreConfig: Record<
  QualScore,
  { label: string; icon: React.ComponentType<{ size?: number; className?: string }>; className: string }
> = {
  HOT: {
    label: 'Hot',
    icon: Flame,
    className: 'bg-red-500/10 text-red-600 border-red-500/20',
  },
  WARM: {
    label: 'Warm',
    icon: ThermometerSun,
    className: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
  },
  COLD: {
    label: 'Cold',
    icon: Snowflake,
    className: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  },
};

const statusConfig: Record<ApplicationStatus, { label: string; className: string }> = {
  DRAFT: { label: 'Draft', className: 'bg-muted text-muted-foreground' },
  IN_PROGRESS: { label: 'In Progress', className: 'bg-amber-500/10 text-amber-700' },
  SUBMITTED: { label: 'Submitted', className: 'bg-blue-500/10 text-blue-700' },
  UNDER_REVIEW: { label: 'Under Review', className: 'bg-purple-500/10 text-purple-700' },
  APPROVED: { label: 'Approved', className: 'bg-green-500/10 text-green-700' },
  REJECTED: { label: 'Rejected', className: 'bg-red-500/10 text-red-700' },
};

function formatRelativeTime(dateStr: string | Date) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function formatCurrency(amount: number | null | undefined) {
  if (!amount) return null;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Link copied');
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Button variant="outline" size="sm" onClick={handleCopy} className="shrink-0">
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? 'Copied' : 'Copy link'}
    </Button>
  );
}

function ApplicationCard({
  application,
  subdomain,
}: {
  application: ApplicationWithApplicant;
  subdomain: string;
}) {
  const primary = application.applicants[0];
  const qualScore = application.qualScore;
  const scoreInfo = qualScore ? scoreConfig[qualScore] : null;
  const statusInfo = statusConfig[application.status];

  const totalIncome =
    (primary?.monthlyGrossIncome ?? 0) + (primary?.additionalIncome ?? 0);
  const rentRatio =
    application.monthlyRent && totalIncome > 0
      ? (totalIncome / application.monthlyRent).toFixed(1)
      : null;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="pt-5 space-y-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold truncate">
              {primary?.legalName ?? 'Unnamed Applicant'}
            </p>
            {application.propertyAddress && (
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {application.propertyAddress}
                {application.unitType ? ` · ${application.unitType}` : ''}
              </p>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            {scoreInfo && (
              <Badge variant="outline" className={scoreInfo.className}>
                <scoreInfo.icon size={12} className="mr-1" />
                {scoreInfo.label}
              </Badge>
            )}
            <Badge className={statusInfo.className}>{statusInfo.label}</Badge>
          </div>
        </div>

        {/* Key signals grid */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          {totalIncome > 0 && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <DollarSign size={13} />
              <span>
                {formatCurrency(totalIncome)}/mo
                {rentRatio && (
                  <span className="text-foreground font-medium"> · {rentRatio}×</span>
                )}
              </span>
            </div>
          )}

          {application.targetMoveIn && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar size={13} />
              <span>
                {new Date(application.targetMoveIn).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}
              </span>
            </div>
          )}

          {(application.occupantCount ?? 0) > 0 && (
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Users size={13} />
              <span>{application.occupantCount} occupant{application.occupantCount !== 1 ? 's' : ''}</span>
            </div>
          )}

          {primary?.hasPets && (
            <div className="flex items-center gap-1.5 text-amber-600">
              <PawPrint size={13} />
              <span>
                {primary.petDetails ? primary.petDetails : 'Has pets'}
              </span>
            </div>
          )}
        </div>

        {/* Summary */}
        {application.summary && (
          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
            {application.summary}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-1 border-t border-border">
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(application.createdAt)}
          </span>
          <div className="flex gap-2">
            {application.contactId && (
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/s/${subdomain}/contacts/${application.contactId}`}>
                  <ExternalLink size={13} />
                  View contact
                </Link>
              </Button>
            )}
            <ApplicationDetailDialog application={application} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ApplicationDetailDialog({
  application,
}: {
  application: ApplicationWithApplicant;
}) {
  const primary = application.applicants[0];
  if (!primary) return null;

  const totalIncome =
    (primary.monthlyGrossIncome ?? 0) + (primary.additionalIncome ?? 0);
  const rentRatio =
    application.monthlyRent && totalIncome > 0
      ? (totalIncome / application.monthlyRent).toFixed(1)
      : null;

  const employmentLabels: Record<string, string> = {
    FULL_TIME: 'Full-time',
    PART_TIME: 'Part-time',
    SELF_EMPLOYED: 'Self-employed',
    UNEMPLOYED: 'Unemployed',
    RETIRED: 'Retired',
    STUDENT: 'Student',
    OTHER: 'Other',
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <FileText size={13} />
          Details
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{primary.legalName ?? 'Application Details'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* Property */}
          {application.propertyAddress && (
            <div>
              <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide mb-1.5">
                Property
              </p>
              <p>{application.propertyAddress}</p>
              {application.unitType && <p className="text-muted-foreground">{application.unitType}</p>}
              {application.monthlyRent && (
                <p className="text-muted-foreground">{formatCurrency(application.monthlyRent)}/mo</p>
              )}
              {application.targetMoveIn && (
                <p className="text-muted-foreground">
                  Move-in:{' '}
                  {new Date(application.targetMoveIn).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
              )}
              {application.leaseTerm && (
                <p className="text-muted-foreground">Lease: {application.leaseTerm}</p>
              )}
            </div>
          )}

          {/* Applicant basics */}
          <div>
            <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide mb-1.5">
              Applicant
            </p>
            {primary.email && <p>{primary.email}</p>}
            {primary.phone && <p>{primary.phone}</p>}
            {primary.currentAddress && (
              <p className="text-muted-foreground">Currently: {primary.currentAddress}</p>
            )}
            {primary.reasonForMoving && (
              <p className="text-muted-foreground">Reason: {primary.reasonForMoving}</p>
            )}
          </div>

          {/* Income */}
          {totalIncome > 0 && (
            <div>
              <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide mb-1.5">
                Income
              </p>
              <p>
                {formatCurrency(totalIncome)}/mo gross
                {rentRatio && (
                  <span className="text-muted-foreground"> ({rentRatio}× rent ratio)</span>
                )}
              </p>
              {primary.employmentStatus && (
                <p className="text-muted-foreground">
                  {employmentLabels[primary.employmentStatus]}
                  {primary.employerName ? ` · ${primary.employerName}` : ''}
                </p>
              )}
            </div>
          )}

          {/* Rental history signals */}
          <div>
            <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide mb-1.5">
              History signals
            </p>
            <div className="space-y-1">
              {primary.priorEvictions !== null && (
                <p className={primary.priorEvictions ? 'text-destructive' : 'text-muted-foreground'}>
                  {primary.priorEvictions ? '⚠ Prior eviction' : '✓ No prior evictions'}
                </p>
              )}
              {primary.outstandingBalances !== null && (
                <p className={primary.outstandingBalances ? 'text-destructive' : 'text-muted-foreground'}>
                  {primary.outstandingBalances ? '⚠ Outstanding landlord balances' : '✓ No outstanding balances'}
                </p>
              )}
              {typeof primary.latePayments === 'number' && (
                <p className={primary.latePayments > 0 ? 'text-amber-700' : 'text-muted-foreground'}>
                  {primary.latePayments === 0
                    ? '✓ No late payments'
                    : `${primary.latePayments} late payment${primary.latePayments !== 1 ? 's' : ''}`}
                </p>
              )}
            </div>
          </div>

          {/* Household */}
          {(application.occupantCount || primary.hasPets !== null || primary.smokingDeclaration !== null) && (
            <div>
              <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide mb-1.5">
                Occupancy
              </p>
              {application.occupantCount && (
                <p className="text-muted-foreground">{application.occupantCount} total occupants</p>
              )}
              {primary.adultsOnApp && (
                <p className="text-muted-foreground">{primary.adultsOnApp} adult{primary.adultsOnApp !== 1 ? 's' : ''} on application</p>
              )}
              {primary.hasPets && (
                <p className="text-amber-700">Has pets{primary.petDetails ? `: ${primary.petDetails}` : ''}</p>
              )}
              {primary.smokingDeclaration && (
                <p className="text-muted-foreground">Smoker declared</p>
              )}
            </div>
          )}

          {/* Summary */}
          {application.summary && (
            <div>
              <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide mb-1.5">
                Summary
              </p>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap bg-muted/50 rounded-lg p-3">
                {application.summary}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  className,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  className?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
          <Icon size={24} className={className ?? 'text-muted-foreground'} />
        </div>
      </CardContent>
    </Card>
  );
}

export function ApplicationsDashboard({ applications, subdomain }: Props) {
  const intakeUrl = `${protocol}://${rootDomain}/apply/${subdomain}`;

  const submitted = applications.filter((a) => a.status !== 'DRAFT');
  const hotCount = applications.filter((a) => a.qualScore === 'HOT').length;
  const warmCount = applications.filter((a) => a.qualScore === 'WARM').length;

  if (applications.length === 0) {
    return (
      <Card>
        <CardHeader className="text-center py-12">
          <ClipboardList size={48} className="mx-auto text-muted-foreground mb-4" />
          <CardTitle>No applications yet</CardTitle>
          <CardDescription className="max-w-sm mx-auto">
            Share your application link to start receiving structured renter applications.
          </CardDescription>
          <div className="mt-4 flex items-center gap-2 max-w-md mx-auto">
            <code className="text-xs bg-muted rounded px-3 py-2 flex-1 truncate text-left">
              {intakeUrl}
            </code>
            <CopyButton text={intakeUrl} />
          </div>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Intake link */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-sm font-medium shrink-0">Application link</p>
            <code className="text-xs bg-muted rounded px-3 py-1.5 flex-1 min-w-0 truncate">
              {intakeUrl}
            </code>
            <CopyButton text={intakeUrl} />
          </div>
        </CardContent>
      </Card>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryCard
          label="Total"
          value={submitted.length}
          icon={ClipboardList}
        />
        <SummaryCard
          label="Hot"
          value={hotCount}
          icon={Flame}
          className="text-red-600"
        />
        <SummaryCard
          label="Warm"
          value={warmCount}
          icon={ThermometerSun}
          className="text-orange-600"
        />
        <SummaryCard
          label="Approved"
          value={applications.filter((a) => a.status === 'APPROVED').length}
          icon={Check}
          className="text-green-600"
        />
      </div>

      {/* Application cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {applications.map((app) => (
          <ApplicationCard key={app.id} application={app} subdomain={subdomain} />
        ))}
      </div>
    </div>
  );
}
