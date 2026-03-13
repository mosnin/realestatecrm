/**
 * Theme-aware Clerk appearance config.
 * Called at render time so it picks up the correct dark/light values.
 */
export function clerkAuthAppearance(isDark: boolean) {
  // Match globals.css token values exactly
  const primary = isDark ? '#14b8a6' : '#0d9488';
  const background = isDark ? '#121314' : '#f5f6f8';
  const card = isDark ? '#1f2023' : '#ffffff';
  const foreground = isDark ? '#f1f3f5' : '#0f1117';
  const mutedFg = isDark ? '#9ca3af' : '#6b7280';
  const border = isDark ? '#32353a' : '#e4e6ea';
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
      // Social buttons
      socialButtonsBlockButton: `border bg-transparent hover:opacity-80 transition-opacity font-medium`,
      socialButtonsBlockButton__google: `border-[${border}] text-[${foreground}]`,
      socialButtonsBlockButtonText: 'font-medium text-sm',
      // Divider
      dividerLine: `bg-[${border}]`,
      dividerText: `text-[${mutedFg}] text-xs`,
      // Form fields
      formFieldLabel: `text-sm font-medium text-[${foreground}]`,
      formFieldInput: `border-[${border}] bg-[${card}] text-[${foreground}] placeholder:text-[${mutedFg}] focus:ring-1 focus:ring-[${primary}]`,
      // Buttons
      formButtonPrimary: `bg-[${primary}] hover:opacity-90 transition-opacity text-white font-medium`,
      // Footer
      footerActionText: `text-[${mutedFg}] text-sm`,
      footerActionLink: `text-[${primary}] hover:opacity-80 font-medium`,
      footer: `bg-transparent`,
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
