/**
 * Theme-aware Clerk appearance config.
 * Called at render time so it picks up the correct dark/light values.
 */
export function clerkAuthAppearance(isDark: boolean) {
  const primary = isDark ? '#14b8a6' : '#b45309';
  const background = isDark ? '#121314' : '#ffffff';
  const card = isDark ? '#1f2023' : '#ffffff';
  const foreground = isDark ? '#f1f3f5' : '#1c1917';
  const mutedFg = isDark ? '#9ca3af' : '#78716c';
  const border = isDark ? '#32353a' : '#e5e5e5';
  const destructive = isDark ? '#ef4444' : '#dc2626';

  return {
    variables: {
      colorPrimary: primary,
      colorBackground: background,
      colorInputBackground: card,
      colorText: foreground,
      colorTextSecondary: mutedFg,
      colorInputText: foreground,
      colorNeutral: foreground,
      borderRadius: '0.5rem',
      fontFamily: 'var(--font-geist-sans)',
    },
    elements: {
      rootBox: 'w-full',
      card: 'shadow-none border-0 p-0 w-full gap-5',
      headerTitle: 'hidden',
      headerSubtitle: 'hidden',
      header: 'hidden',
      // Social buttons — clean outlined style
      socialButtonsBlockButton: `border border-[${border}] bg-transparent hover:bg-neutral-50 transition-colors font-medium rounded-lg`,
      socialButtonsBlockButtonText: 'font-medium text-sm',
      // Divider
      dividerLine: `bg-[${border}]`,
      dividerText: `text-[${mutedFg}] text-xs`,
      // Form fields — bottom-border style to match screenshot
      formFieldLabel: `text-sm font-medium text-[${mutedFg}]`,
      formFieldInput: `border-[${border}] bg-transparent text-[${foreground}] placeholder:text-[${mutedFg}] focus:ring-1 focus:ring-[${primary}] rounded-lg`,
      // Primary button — dark, full-width
      formButtonPrimary: `bg-[${foreground}] hover:opacity-90 transition-opacity text-white font-medium rounded-lg`,
      // Footer links
      footerActionText: `text-[${mutedFg}] text-sm`,
      footerActionLink: `text-[${foreground}] hover:opacity-80 font-semibold underline underline-offset-4`,
      footer: 'bg-transparent',
      // Identity preview
      identityPreviewText: `text-[${foreground}]`,
      identityPreviewEditButton: `text-[${primary}]`,
      // Error/alert
      formFieldErrorText: `text-[${destructive}] text-xs`,
      alertText: 'text-sm',
      // Card background
      cardBox: `bg-[${background}]`,
    },
  } as const;
}
