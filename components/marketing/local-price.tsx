'use client';

/**
 * Client-side currency localization for the STATIC marketing pages.
 *
 * The pages themselves are statically generated once per LANGUAGE; currency
 * varies per VISITOR (a Spanish page shows CLP in Chile, COP in Colombia), so
 * price amounts render through these small client components instead of being
 * baked into the HTML. The middleware resolves the visitor's country to a
 * currency and stores it in the `chippi_currency` cookie; these components
 * read that cookie after hydration and re-render the amount. Server render
 * and first paint show the USD base price — the honest fallback — and swap
 * to the local currency immediately on hydration.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CURRENCY_COOKIE,
  DEFAULT_CURRENCY,
  isCurrency,
  isLang,
  LANGS,
  LANG_LABELS,
  localizedPath,
  type Currency,
  type Lang,
} from '@/lib/i18n/markets';
import { formatUsdPriceIn, localizePrice, formatMoney } from '@/lib/i18n/currency';
import { PRICING_DICTS, fill } from '@/lib/i18n/dictionaries/pricing';

function readCurrencyCookie(): Currency {
  if (typeof document === 'undefined') return DEFAULT_CURRENCY;
  const raw = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${CURRENCY_COOKIE}=`))
    ?.split('=')[1];
  return isCurrency(raw) ? raw : DEFAULT_CURRENCY;
}

/** The visitor's display currency. USD until hydration (and for US/unknown). */
export function useDisplayCurrency(): Currency {
  const [currency, setCurrency] = useState<Currency>(DEFAULT_CURRENCY);
  useEffect(() => setCurrency(readCurrencyCookie()), []);
  return currency;
}

/**
 * A USD price point rendered in the visitor's currency, clean-rounded.
 * `multiplier` scales AFTER conversion+rounding so derived figures stay
 * exactly consistent with the shown base (yearly = 12 × the shown monthly).
 */
export function LocalPrice({
  usd,
  lang,
  multiplier = 1,
}: {
  usd: number;
  lang: Lang;
  multiplier?: number;
}) {
  const currency = useDisplayCurrency();
  return <>{formatMoney(localizePrice(usd, currency) * multiplier, currency, lang)}</>;
}

/**
 * A copy template whose {tokens} are USD price points, rendered with each
 * token replaced by the localized price string. Used for prose that mentions
 * prices (e.g. the brokerage-pricing FAQ answer).
 */
export function PriceText({
  template,
  tokens,
  lang,
  className,
}: {
  template: string;
  tokens: Record<string, number>;
  lang: Lang;
  className?: string;
}) {
  const currency = useDisplayCurrency();
  const values = Object.fromEntries(
    Object.entries(tokens).map(([k, usd]) => [k, formatUsdPriceIn(usd, currency, lang)]),
  );
  return <span className={className}>{fill(template, values)}</span>;
}

/**
 * Honest-UI disclosure: when the display currency isn't USD, say that billing
 * is in USD (checkout charges USD until Stripe currency_options ship — at
 * which point this note is removed rather than softened). Renders nothing
 * for USD visitors.
 */
export function CurrencyNote({ lang, className }: { lang: Lang; className?: string }) {
  const currency = useDisplayCurrency();
  if (currency === 'USD') return null;
  return (
    <p className={className}>{fill(PRICING_DICTS[lang].billedInUsdNote, { currency })}</p>
  );
}

/**
 * Minimal language switcher. Links carry `?hl=` so the middleware re-pins the
 * `chippi_lang` cookie — the explicit choice then wins over geo everywhere.
 */
export function LangSwitcher({ current, basePath }: { current: Lang; basePath: string }) {
  return (
    <nav aria-label="Language" className="flex items-center justify-center gap-3 text-[12px]">
      {LANGS.filter(isLang).map((l) => (
        <Link
          key={l}
          href={`${localizedPath(basePath, l)}?hl=${l}`}
          className={
            l === current
              ? 'font-medium text-white'
              : 'text-white/40 transition-colors hover:text-white/70'
          }
        >
          {LANG_LABELS[l]}
        </Link>
      ))}
    </nav>
  );
}
