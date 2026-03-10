import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { getSpaceFromSlug } from '@/lib/space';
import { ApplicationForm } from './application-form';
import { Clock, Users, FileText, ArrowRight } from 'lucide-react';

export default async function PublicApplyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const settings = await db.spaceSetting.findUnique({
    where: { spaceId: space.id },
    select: { intakePageTitle: true, intakePageIntro: true, businessName: true }
  });

  const pageTitle = settings?.intakePageTitle || `Apply with ${space.name}`;
  const pageIntro =
    settings?.intakePageIntro ||
    "Share your rental preferences and we'll follow up with next steps.";
  const businessName = settings?.businessName || space.name;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      {/* Header */}
      <div className="border-b border-border/50 bg-background/80 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-sm">
            {space.emoji}
          </div>
          <span className="text-sm font-medium text-muted-foreground">{businessName}</span>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-2xl mx-auto px-4 py-10 md:py-14">
        <div className="space-y-8">
          {/* Title section */}
          <div className="text-center space-y-3">
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
              {pageTitle}
            </h1>
            <p className="text-muted-foreground text-sm md:text-base max-w-md mx-auto leading-relaxed">
              {pageIntro}
            </p>
          </div>

          {/* Form */}
          <ApplicationForm slug={slug} businessName={businessName} />

          {/* Value section */}
          <div className="pt-6 border-t border-border/50">
            <p className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider mb-5">
              How it works
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex flex-col items-center text-center px-3 py-4 rounded-xl bg-card border border-border/60">
                <div className="w-9 h-9 rounded-full bg-primary/8 flex items-center justify-center mb-3">
                  <Clock size={16} className="text-primary" />
                </div>
                <p className="text-sm font-medium text-foreground mb-1">Quick review</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Your info is reviewed promptly so you hear back faster
                </p>
              </div>
              <div className="flex flex-col items-center text-center px-3 py-4 rounded-xl bg-card border border-border/60">
                <div className="w-9 h-9 rounded-full bg-primary/8 flex items-center justify-center mb-3">
                  <Users size={16} className="text-primary" />
                </div>
                <p className="text-sm font-medium text-foreground mb-1">Personal follow-up</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  A real agent reviews your details and reaches out directly
                </p>
              </div>
              <div className="flex flex-col items-center text-center px-3 py-4 rounded-xl bg-card border border-border/60">
                <div className="w-9 h-9 rounded-full bg-primary/8 flex items-center justify-center mb-3">
                  <FileText size={16} className="text-primary" />
                </div>
                <p className="text-sm font-medium text-foreground mb-1">Organized process</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  No lost emails or missed calls — everything stays on track
                </p>
              </div>
            </div>
          </div>

          {/* Footer trust line */}
          <p className="text-center text-xs text-muted-foreground/70 pt-2">
            Your information is shared only with {businessName} and used solely for rental inquiries.
          </p>
        </div>
      </div>
    </div>
  );
}
