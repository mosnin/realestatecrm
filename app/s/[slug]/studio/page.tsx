import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getSpaceFromSlug } from '@/lib/space';
import {
  H1,
  TITLE_FONT,
  BODY_MUTED,
  PAGE_RHYTHM,
  SECTION_LABEL,
} from '@/lib/typography';
import { cn } from '@/lib/utils';
import { SplitReveal, StaggerReveal } from '@/components/motion';
import { RealtorPage } from '../_components/realtor-page';

export const dynamic = 'force-dynamic';

/**
 * Studio landing — the home that explains what Studio is.
 *
 * Previously this route redirected straight to /create, which dropped the
 * realtor into a tool with zero context. Now it's the canonical realtor
 * page (muted greeting → serif H1 → status sentence) followed by a flat
 * grid of the five Studio workflows. Each card is a Link to a sub-route.
 *
 * Cards are paper-flat: hairline border, muted hover, no shadow. Matches
 * the canonical card vocabulary on the rest of the realtor surface.
 */
export default async function StudioPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const space = await getSpaceFromSlug(slug);
  if (!space) notFound();

  const workflows = [
    {
      href: `/s/${slug}/studio/create`,
      title: 'Create',
      subtitle: 'Type a prompt, get a hero photo for your post.',
    },
    {
      href: `/s/${slug}/studio/compose`,
      title: 'Compose',
      subtitle: 'Upload an image, get a social-ready caption.',
    },
    {
      href: `/s/${slug}/studio/library`,
      title: 'Library',
      subtitle: 'Re-use, duplicate, schedule from past work.',
    },
    {
      href: `/s/${slug}/studio/schedule`,
      title: 'Schedule',
      subtitle: 'Pick a time, Chippi posts when you are not online.',
    },
    {
      href: `/s/${slug}/studio/brand`,
      title: 'Brand',
      subtitle: 'Logo, colors, fonts — applied to every generation.',
    },
  ] as const;

  return (
    <RealtorPage width="content" className={cn(PAGE_RHYTHM)}>
      <header className="space-y-1.5">
        <p className={BODY_MUTED}>Studio.</p>
        <h1 className={H1} style={TITLE_FONT}>
          <SplitReveal as="span" text="Make your listings shine" by="word" />
        </h1>
        <p className={BODY_MUTED}>
          AI-generated photos, captions, and scheduled posts — all in one
          workflow.
        </p>
      </header>

      <section className="space-y-4">
        <p className={SECTION_LABEL}>Workflows</p>
        <StaggerReveal className="chippi-dashboard-panel overflow-hidden rounded-[1.75rem] divide-y chippi-dashboard-divider px-5 sm:px-7">
          {workflows.map((w) => {
            return (
              <Link
                key={w.href}
                href={w.href}
                className={cn(
                  'group flex items-center justify-between gap-5 px-1 py-4',
                  'transition-colors duration-150 hover:bg-foreground/[0.025]',
                )}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{w.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {w.subtitle}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground transition-colors group-hover:text-foreground">
                  Open
                </span>
              </Link>
            );
          })}
        </StaggerReveal>
      </section>
    </RealtorPage>
  );
}
