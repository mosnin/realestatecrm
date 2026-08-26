'use client';

import { useClerk, useUser } from '@clerk/nextjs';
import { LogOut, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';

const HEADER_ICON_BTN =
  'h-8 w-8 flex items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground/70 hover:text-foreground hover:bg-foreground/[0.04] transition-colors';

export function accountInitials(input: {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}): string {
  const fromName = [input.firstName?.[0], input.lastName?.[0]]
    .filter(Boolean)
    .join('')
    .toUpperCase();
  if (fromName) return fromName;
  const fromEmail = input.email?.trim().charAt(0);
  return fromEmail ? fromEmail.toUpperCase() : 'U';
}

/**
 * Header account cluster — avatar + mail + sign-out as icon buttons.
 * Email and "Sign out" stay out of the chrome; labels live in title/aria.
 */
export function HeaderAccountIcons() {
  const { user } = useUser();
  const { signOut, openUserProfile } = useClerk();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const initials = accountInitials({
    firstName: user?.firstName,
    lastName: user?.lastName,
    email,
  });

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => openUserProfile()}
        aria-label="Account"
        title="Account"
        className={cn(HEADER_ICON_BTN, 'overflow-hidden p-0')}
      >
        {user?.imageUrl ? (
          <img src={user.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-[11px] font-semibold text-foreground/80">{initials}</span>
        )}
      </button>
      {email && (
        <button
          type="button"
          onClick={() => openUserProfile()}
          aria-label={`Email ${email}`}
          title={email}
          className={HEADER_ICON_BTN}
        >
          <Mail size={14} strokeWidth={1.75} />
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          void signOut({ redirectUrl: '/login/realtor' });
        }}
        aria-label="Sign out"
        title="Sign out"
        className={HEADER_ICON_BTN}
      >
        <LogOut size={14} strokeWidth={1.75} />
      </button>
    </div>
  );
}
