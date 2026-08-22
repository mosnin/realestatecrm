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
import {
  SupportingActionLink,
  SupportingOrientation,
  SupportingPage,
  SupportingWorkArea,
} from '../_components/supporting-page';

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
    <SupportingPage family="studio" width="wide">
      <SupportingOrientation
        family="studio"
        eyebrow="Studio / Campaign desk"
        title={<SplitReveal as="span" text="Turn one listing into a week of marketing" by="word" />}
        summary="Create the visual, write the caption, then schedule it without rebuilding the campaign in another tool."
        nextAction="Start with the property or story that needs attention this week, then carry the result through to Schedule."
        action={<SupportingActionLink href={`/s/${slug}/studio/create`}>Create campaign asset</SupportingActionLink>}
        layout="split"
      />

      <SupportingWorkArea className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
        <Link
          href={`/s/${slug}/studio/create`}
          className="group flex min-h-[25rem] flex-col justify-between rounded-[2rem] bg-foreground p-7 text-background transition-transform duration-200 hover:-translate-y-0.5 sm:p-9"
        >
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-background/60">Start here</p>
            <h2 className="font-title mt-4 max-w-lg text-3xl leading-tight tracking-[-0.04em]">Create the lead image people stop scrolling for.</h2>
          </div>
          <div className="flex items-end justify-between gap-6">
            <p className="max-w-sm text-sm leading-6 text-background/70">Describe the listing, neighborhood, or moment. Chippi creates a saved asset you can carry into the rest of Studio.</p>
            <span className="shrink-0 rounded-full border border-background/20 px-4 py-2 text-sm font-medium">Open Create</span>
          </div>
        </Link>

        <div className="border-y chippi-dashboard-divider divide-y chippi-dashboard-divider">
          {workflows.slice(1).map((w, index) => (
            <Link
              key={w.href}
              href={w.href}
              className="group flex min-h-[6.25rem] items-center justify-between gap-5 px-1 py-5 transition-colors hover:bg-foreground/[0.025]"
            >
              <div className="flex min-w-0 items-start gap-4">
                <span className="mt-0.5 text-xs tabular-nums text-muted-foreground">0{index + 2}</span>
                <div className="min-w-0">
                  <p className="text-base font-medium text-foreground">{w.title}</p>
                  <p className="mt-1 text-sm leading-5 text-muted-foreground">{w.subtitle}</p>
                </div>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground transition-colors group-hover:text-foreground">Open</span>
            </Link>
          ))}
        </div>
      </SupportingWorkArea>
    </SupportingPage>
  );
}
