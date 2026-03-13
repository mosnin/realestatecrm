'use client';

import { SignIn } from '@clerk/nextjs';
import { useTheme } from '@/components/theme-provider';
import { clerkAuthAppearance } from './clerk-appearance';

export function ThemedSignIn(props: Omit<React.ComponentProps<typeof SignIn>, 'appearance'>) {
  const { theme } = useTheme();
  return <SignIn {...props} appearance={clerkAuthAppearance(theme === 'dark')} />;
}
