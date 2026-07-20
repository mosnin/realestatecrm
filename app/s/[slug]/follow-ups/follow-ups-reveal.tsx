'use client';

/**
 * Tiny client island so the follow-ups surface gets a calm entrance without
 * touching `components/follow-ups/follow-ups-view.tsx` (owned by another
 * team) or converting the server page to a client component.
 */

import type { ComponentProps } from 'react';
import { Reveal } from '@/components/motion';
import { FollowUpsView } from '@/components/follow-ups/follow-ups-view';

type FollowUpsViewProps = ComponentProps<typeof FollowUpsView>;

export function FollowUpsReveal(props: FollowUpsViewProps) {
  return (
    <Reveal variant="rise">
      <FollowUpsView {...props} />
    </Reveal>
  );
}
