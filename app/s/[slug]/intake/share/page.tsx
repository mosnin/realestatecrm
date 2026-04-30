import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { getSpaceFromSlug } from '@/lib/space';
import { buildIntakeUrl } from '@/lib/intake';
import { IntakeLinkRow } from '../intake-link-row';
import { ArrowLeft } from 'lucide-react';
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
  const intakePath = `/apply/${space.slug}`;
  const embedSnippet = `<iframe src="${intakeUrl}" width="100%" height="800" frameborder="0" style="border:none; border-radius:12px;"></iframe>`;

  // UTM-tagged variants — same intake URL with a `?utm_source=…` suffix so
  // the realtor can see where each submission came from in analytics. The
  // applicant never sees these params; they pass through the intake form
  // and land on the contact record as tags.
  const utmVariants: { label: string; source: string }[] = [
    { label: 'Email campaign', source: 'email' },
    { label: 'SMS / text', source: 'sms' },
    { label: 'Social post', source: 'social' },
    { label: 'Paid ad', source: 'ads' },
  ];

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <h1
          className="text-3xl tracking-tight text-foreground"
          style={{ fontFamily: 'var(--font-title)' }}
        >
          Share
        </h1>
        <Link
          href={`/s/${slug}/intake`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150"
        >
          <ArrowLeft size={13} strokeWidth={1.75} />
          Overview
        </Link>
      </div>

      {/* Intake link */}
      <section className="rounded-xl border border-border/70 bg-background p-5 space-y-3">
        <div>
          <h2 className="text-sm font-medium text-foreground">Your intake link</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Anyone with this link can submit an application.
          </p>
        </div>
        <IntakeLinkRow url={intakeUrl} previewHref={intakePath} />
      </section>

      {/* Tracking variants */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-medium text-foreground">Tracking links</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            UTM-tagged versions for each channel — submissions are attributed in analytics.
          </p>
        </div>
        <div className="rounded-xl border border-border/70 bg-background overflow-hidden divide-y divide-border/70">
          {utmVariants.map((v) => {
            const tagged = `${intakeUrl}?utm_source=${v.source}`;
            return (
              <div key={v.source} className="px-5 py-4 space-y-2">
                <p className="text-xs text-muted-foreground">{v.label}</p>
                <IntakeLinkRow
                  url={tagged}
                  previewHref={`${intakePath}?utm_source=${v.source}`}
                />
              </div>
            );
          })}
        </div>
      </section>

      {/* Embed */}
      <section className="rounded-xl border border-border/70 bg-background p-5 space-y-3">
        <div>
          <h2 className="text-sm font-medium text-foreground">Embed on your site</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Drop this iframe into your website to host the form inline.
          </p>
        </div>
        <IntakeLinkRow
          url={intakeUrl}
          previewHref={intakePath}
          copyValue={embedSnippet}
          display={embedSnippet}
          hidePreview
        />
      </section>

      {/* Social */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-foreground">Share on social</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-border/70 rounded-xl overflow-hidden border border-border/70">
          <SocialLink
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(intakeUrl)}`}
            label="Facebook"
          />
          <SocialLink
            href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(intakeUrl)}&text=${encodeURIComponent('Looking for your next home? Submit your application here:')}`}
            label="Twitter / X"
          />
          <SocialLink
            href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(intakeUrl)}`}
            label="LinkedIn"
          />
        </div>
      </section>
    </div>
  );
}

function SocialLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="bg-background px-4 py-3 text-sm text-foreground text-center hover:bg-foreground/[0.04] active:bg-foreground/[0.045] transition-colors duration-150"
    >
      {label}
    </a>
  );
}
