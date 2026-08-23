import { AuthPageLayout } from '@/components/auth/auth-page-layout';
import { ThemedSignIn } from '@/components/auth/clerk-sign-in';
import Link from 'next/link';
import type { Metadata } from 'next';
import { BODY_MUTED, QUIET_LINK } from '@/lib/typography';
import { cn } from '@/lib/utils';
import { cookies } from 'next/headers';
import { AUTH_DICTS } from '@/lib/i18n/dictionaries/auth';
import { isLang, LANG_COOKIE } from '@/lib/i18n/markets';

export const metadata: Metadata = { title: 'Broker Sign In — Chippi' };

export default async function BrokerSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>;
}) {
  const { redirect_url } = await searchParams;
  const cookieLang = (await cookies()).get(LANG_COOKIE)?.value;
  const lang = isLang(cookieLang) ? cookieLang : 'en';
  const copy = AUTH_DICTS[lang].brokerPage;
  // '/join/' kept in parity with the realtor sign-in / sign-up allowlists so
  // a brokerage join-code redirect survives this entry point too.
  const SAFE_PREFIXES = ['/s/', '/broker', '/admin', '/invite/', '/join/', '/subscribe', '/billing-required', '/authorize'];
  const safeInviteRedirect = redirect_url
    && SAFE_PREFIXES.some(p => redirect_url.startsWith(p))
    && !redirect_url.includes('..')
    ? redirect_url
    : null;
  const postSignInUrl = safeInviteRedirect ?? '/auth/redirect?intent=broker';
  const signUpUrl = safeInviteRedirect
    ? `/sign-up?intent=broker&redirect_url=${encodeURIComponent(safeInviteRedirect)}`
    : '/sign-up?intent=broker';

  return (
    <AuthPageLayout
      variant="broker"
      heading={copy.heading}
      lang={lang}
    >
      <div className="w-full space-y-4">
        <ThemedSignIn
          routing="path"
          path="/login/broker"
          forceRedirectUrl={postSignInUrl}
          signUpUrl={signUpUrl}
        />
        <p className={cn(BODY_MUTED, 'text-center')}>
          {copy.newAccount}{' '}
          <Link href={signUpUrl} className={cn(QUIET_LINK, 'underline underline-offset-4')}>
            {copy.action}
          </Link>
        </p>
      </div>
    </AuthPageLayout>
  );
}
