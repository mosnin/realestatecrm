/**
 * Theme-aware Clerk appearance config.
 * Warm cream & gold palette matching the Chippi design system.
 */
export function clerkAuthAppearance(isDark: boolean) {
  const primary = isDark ? '#D4B87A' : '#B8963E';
  const background = isDark ? '#1A1816' : '#F2EAE1';
  const card = isDark ? '#2A2622' : '#FFFFFF';
  const foreground = isDark ? '#F5F0EB' : '#1A1612';
  const mutedFg = isDark ? '#A39889' : '#8C7E70';
  const border = isDark ? '#3A3530' : '#DDD4C8';
  const destructive = isDark ? '#E05050' : '#C94040';

  return {
    variables: {
      colorPrimary: primary,
      colorBackground: background,
      colorInputBackground: card,
      colorText: foreground,
      colorTextSecondary: mutedFg,
      colorInputText: foreground,
      colorNeutral: foreground,
      borderRadius: '0.75rem',
      fontFamily: 'var(--font-geist-sans)',
    },
    elements: {
      rootBox: 'w-full',
      card: 'shadow-none border-0 p-0 w-full gap-5',
      headerTitle: 'hidden',
      headerSubtitle: 'hidden',
      header: 'hidden',
      socialButtonsBlockButton: `border bg-transparent hover:opacity-80 transition-opacity font-medium`,
      socialButtonsBlockButton__google: `border-[${border}] text-[${foreground}]`,
      socialButtonsBlockButtonText: 'font-medium text-sm',
      dividerLine: `bg-[${border}]`,
      dividerText: `text-[${mutedFg}] text-xs`,
      formFieldLabel: `text-sm font-medium text-[${foreground}]`,
      formFieldInput: `border-[${border}] bg-[${card}] text-[${foreground}] placeholder:text-[${mutedFg}] focus:ring-1 focus:ring-[${primary}]`,
      formButtonPrimary: `bg-[${primary}] hover:opacity-90 transition-opacity text-white font-medium rounded-full`,
      footerActionText: `text-[${mutedFg}] text-sm`,
      footerActionLink: `text-[${primary}] hover:opacity-80 font-medium`,
      footer: `bg-transparent`,
      identityPreviewText: `text-[${foreground}]`,
      identityPreviewEditButton: `text-[${primary}]`,
      formFieldErrorText: `text-[${destructive}] text-xs`,
      alertText: 'text-sm',
      cardBox: `bg-[${background}]`,
    },
  } as const;
}
