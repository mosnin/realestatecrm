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
      borderRadius: '0.75rem',
      fontFamily: 'var(--font-geist-sans), system-ui, sans-serif',
      fontSize: '0.875rem',
    },
    layout: {
      socialButtonsPlacement: 'top' as const,
      socialButtonsVariant: 'blockButton' as const,
    },
    elements: {
      rootBox: 'w-full overflow-visible',
      card: 'shadow-none border-0 p-0 w-full gap-4 bg-transparent overflow-visible',
      cardBox: 'shadow-none border-0 bg-transparent overflow-visible',
      header: 'hidden',
      headerTitle: 'hidden',
      headerSubtitle: 'hidden',
      footer: 'hidden',
      footerAction: 'hidden',
    },
  } as const;
}
