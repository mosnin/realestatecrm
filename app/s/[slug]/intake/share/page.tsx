import { notFound, redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { buildIntakeUrl } from '@/lib/intake';
import { Card, CardContent } from '@/components/ui/card';
import { SharePageClient } from './share-page-client';
import {
  ExternalLink,
  Share2,
} from 'lucide-react';
import type { Metadata } from 'next';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Share Intake Form -- ${slug} -- Chippi` };
}

export default async function IntakeSharePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { userId } = await auth();
  if (!userId) redirect('/login/realtor');

  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const intakeUrl = buildIntakeUrl(space.slug);

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Share Your Intake Form
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Share this link with prospective clients. They&apos;ll see a Getting Started step and then your custom form.
        </p>
      </div>

      {/* Intake link */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Share2 size={18} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold leading-tight">
                Your Intake Link
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Anyone with this link can submit an application
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-full px-2.5 py-1 flex-shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Live
            </span>
          </div>

          <div className="rounded-lg border border-border bg-muted/50 px-4 py-3 mb-4">
            <code className="text-sm font-mono text-foreground break-all select-all">
              {intakeUrl}
            </code>
          </div>

          <SharePageClient intakeUrl={intakeUrl} slug={space.slug} />
        </CardContent>
      </Card>

      {/* Embed code */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-base font-semibold mb-1">Embed on Your Website</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Copy the code below to embed the intake form directly on your website.
          </p>

          <div className="rounded-lg border border-border bg-muted/50 px-4 py-3 mb-3">
            <code className="text-xs font-mono text-foreground break-all select-all whitespace-pre-wrap">
              {`<iframe src="${intakeUrl}" width="100%" height="800" frameborder="0" style="border:none; border-radius:12px;"></iframe>`}
            </code>
          </div>

          <SharePageClient intakeUrl={intakeUrl} slug={space.slug} embedMode />
        </CardContent>
      </Card>

      {/* Social sharing */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-base font-semibold mb-1">Share on Social Media</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Post your intake link on social media to reach more prospective clients.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <a
              href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(intakeUrl)}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-card hover:bg-muted transition-colors text-sm font-medium"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-blue-600">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              Facebook
            </a>
            <a
              href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(intakeUrl)}&text=${encodeURIComponent('Looking for your next home? Submit your application here:')}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-card hover:bg-muted transition-colors text-sm font-medium"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              Twitter / X
            </a>
            <a
              href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(intakeUrl)}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-card hover:bg-muted transition-colors text-sm font-medium"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-blue-700">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
              </svg>
              LinkedIn
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card>
        <CardContent className="p-6">
          <h2 className="text-base font-semibold mb-3">How It Works</h2>
          <ol className="space-y-3 text-sm text-muted-foreground">
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                1
              </span>
              <span>
                Share the link above with prospective clients via text, email, social media, or your website.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                2
              </span>
              <span>
                They will see a &quot;Getting Started&quot; step where they choose whether they are renting or buying.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                3
              </span>
              <span>
                Based on their selection, they will be shown your custom Rental or Buyer intake form.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                4
              </span>
              <span>
                Once submitted, the lead appears in your dashboard with an automatically assigned lead score.
              </span>
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
