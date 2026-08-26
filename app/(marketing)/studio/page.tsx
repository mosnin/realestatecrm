/**
 * `/studio` is paused until an operator opts back in with
 * NEXT_PUBLIC_CHIPPI_STUDIO_ENABLED=true. Keep the route so old links
 * do not advertise a surface that is off.
 */

import { PageHero } from '@/components/marketing/site/page-hero';

export const metadata = {
  title: 'Studio · Chippi',
  description: 'Chippi Studio is paused.',
};

export default function StudioPausedPage() {
  return (
    <PageHero
      eyebrow="Studio"
      title="Studio is paused."
      sub="The content studio is off for now. Listing flyers, generated posts, and scheduled social publishes are not available."
      primaryCta={{ label: 'Back to the agent story', href: '/realtors' }}
    />
  );
}
