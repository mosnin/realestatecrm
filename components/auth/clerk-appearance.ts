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
  const inputBorder = isDark ? '#404348' : '#d4d4d4';
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
      colorTextOnPrimaryBackground: '#ffffff',
      colorDanger: destructive,
      borderRadius: '0.5rem',
      fontFamily: 'var(--font-geist-sans), system-ui, sans-serif',
      fontSize: '0.875rem',
    },
    layout: {
      socialButtonsPlacement: 'top' as const,
      socialButtonsVariant: 'blockButton' as const,
    },
    elements: {
      // Root container
      rootBox: 'w-full',

      // Card — strip all default chrome
      card: 'shadow-none !border-0 !border-none p-0 w-full gap-4 bg-transparent',
      cardBox: `!shadow-none !border-0 !border-none bg-transparent`,

      // Header — we show our own
      headerTitle: 'hidden',
      headerSubtitle: 'hidden',
      header: 'hidden',

      // Social buttons — clean outlined
      socialButtonsBlockButton: `!border !border-[${inputBorder}] !bg-transparent hover:!bg-neutral-50 transition-colors !font-medium !rounded-lg !shadow-none h-11`,
      socialButtonsBlockButtonText: '!font-medium !text-sm',
      socialButtonsBlockButtonArrow: 'hidden',
      socialButtonsProviderIcon: 'w-5 h-5',

      // Divider
      dividerLine: `!bg-[${border}]`,
      dividerText: `!text-[${mutedFg}] !text-xs`,
      dividerRow: 'my-3',

      // Form fields
      formFieldLabel: `!text-sm !font-medium !text-[${foreground}]`,
      formFieldInput: `!border !border-[${inputBorder}] !bg-transparent !text-[${foreground}] placeholder:!text-[${mutedFg}] focus:!ring-2 focus:!ring-[${primary}]/20 focus:!border-[${primary}] !rounded-lg !shadow-none !h-11 !text-sm`,
      formFieldLabelRow: 'mb-1',
      formFieldRow: 'mb-1',

      // Primary button — dark, full-width
      formButtonPrimary: `!bg-[${foreground}] hover:!opacity-90 transition-opacity !text-white !font-semibold !rounded-lg !shadow-none !h-11 !text-sm !border-0`,

      // Footer links
      footerActionText: `!text-[${mutedFg}] !text-sm`,
      footerActionLink: `!text-[${foreground}] hover:!opacity-80 !font-semibold !underline !underline-offset-4 !decoration-[${foreground}]/30`,
      footer: '!bg-transparent !border-0 !shadow-none mt-3',
      footerAction: '!bg-transparent',

      // Identity preview
      identityPreviewText: `!text-[${foreground}]`,
      identityPreviewEditButton: `!text-[${primary}]`,
      identityPreview: `!border !border-[${inputBorder}] !rounded-lg !bg-transparent !shadow-none`,

      // Error/alert
      formFieldErrorText: `!text-[${destructive}] !text-xs`,
      alertText: '!text-sm',
      alert: `!border !border-[${destructive}]/20 !bg-[${destructive}]/5 !rounded-lg !shadow-none`,

      // Internal card — strip borders from inner containers
      formContainer: 'gap-3',
      form: 'gap-3',
      main: '!shadow-none !border-0 gap-4',

      // OTP / verification inputs
      otpCodeFieldInput: `!border !border-[${inputBorder}] !rounded-lg !shadow-none`,

      // Alternative methods
      alternativeMethodsBlockButton: `!border !border-[${inputBorder}] !rounded-lg !shadow-none !bg-transparent hover:!bg-neutral-50`,
    },
  } as const;
}
