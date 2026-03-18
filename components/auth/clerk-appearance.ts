/**
 * Theme-aware Clerk appearance config.
 * Most visual overrides are in globals.css (.cl-* selectors).
 * This config handles Clerk's variables and layout options.
 */
export function clerkAuthAppearance(isDark: boolean) {
  const primary = isDark ? '#14b8a6' : '#b45309';
  const foreground = isDark ? '#f1f3f5' : '#1c1917';

  return {
    variables: {
      colorPrimary: primary,
      colorNeutral: foreground,
      borderRadius: '0.5rem',
      fontFamily: 'var(--font-geist-sans), system-ui, sans-serif',
      fontSize: '0.875rem',
    },
    layout: {
      socialButtonsPlacement: 'top' as const,
      socialButtonsVariant: 'blockButton' as const,
    },
    elements: {
      rootBox: 'w-full',
      card: 'shadow-none border-0 p-0 w-full gap-4 bg-transparent',
      cardBox: 'shadow-none border-0 bg-transparent',
      header: 'hidden',
      headerTitle: 'hidden',
      headerSubtitle: 'hidden',
      footer: 'bg-transparent border-0 shadow-none mt-2',
      footerAction: 'bg-transparent',
    },
  } as const;
}
