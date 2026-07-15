'use client';

/**
 * Client island for the public home-value lead magnet. Renders the address
 * form, POSTs to /api/public/home-value/[slug], and shows the honest result —
 * a value range when the CMA can defend one, or a plain "we couldn't estimate
 * this address" state otherwise. It NEVER fabricates a number: the range is
 * rendered only when `estimate.hasEstimate` is true.
 */

import { useState } from 'react';
import {
  SurfaceCard,
  SurfaceCardHeader,
  StatusPill,
} from '@/components/ui/surface-card';
import type { HomeValueResponse } from '@/lib/leads/home-value';

const ACCENT = '#F25A00';

function formatUsd(n: number | null): string {
  if (n == null) return '—';
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

type Status = 'idle' | 'loading' | 'done' | 'error';

export function HomeValueClient({
  slug,
  businessName,
  agentName,
  darkMode,
}: {
  slug: string;
  businessName: string;
  agentName: string;
  darkMode: boolean;
}) {
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [stateRegion, setStateRegion] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [beds, setBeds] = useState('');
  const [baths, setBaths] = useState('');
  const [squareFeet, setSquareFeet] = useState('');

  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<HomeValueResponse | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('loading');
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/public/home-value/${encodeURIComponent(slug)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          city: city || undefined,
          stateRegion: stateRegion || undefined,
          name: name || undefined,
          email,
          phone: phone || undefined,
          beds: beds ? Number(beds) : undefined,
          baths: baths ? Number(baths) : undefined,
          squareFeet: squareFeet ? Number(squareFeet) : undefined,
        }),
      });
      if (res.status === 429) {
        setStatus('error');
        setErrorMsg("You've made a few requests already — please try again in a little while.");
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setStatus('error');
        setErrorMsg(data?.error ?? 'Something went wrong. Please try again.');
        return;
      }
      const data = (await res.json()) as HomeValueResponse;
      setResult(data);
      setStatus('done');
    } catch {
      setStatus('error');
      setErrorMsg('Network error. Please try again.');
    }
  }

  const inputClass =
    'w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm ' +
    'text-foreground placeholder:text-muted-foreground/70 ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--hv-accent)]/40';

  return (
    <div
      className={darkMode ? 'dark' : ''}
      style={{ ['--hv-accent' as string]: ACCENT }}
    >
      <main className="min-h-screen bg-muted/40 px-4 py-10 sm:py-16">
        <div className="mx-auto w-full max-w-xl space-y-6">
          <header className="text-center">
            <span
              className="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold text-white"
              style={{ backgroundColor: ACCENT }}
            >
              Free home valuation
            </span>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground">
              What&apos;s my home worth?
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Enter your address for an estimated value range from {agentName} at {businessName}.
            </p>
          </header>

          {status !== 'done' && (
            <SurfaceCard>
              <SurfaceCardHeader title="Your home" />
              <form className="mt-5 space-y-4" onSubmit={onSubmit}>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground" htmlFor="hv-address">
                    Street address
                  </label>
                  <input
                    id="hv-address"
                    className={inputClass}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="123 Main St"
                    required
                    minLength={5}
                    autoComplete="street-address"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground" htmlFor="hv-city">
                      City
                    </label>
                    <input
                      id="hv-city"
                      className={inputClass}
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      autoComplete="address-level2"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground" htmlFor="hv-state">
                      State / region
                    </label>
                    <input
                      id="hv-state"
                      className={inputClass}
                      value={stateRegion}
                      onChange={(e) => setStateRegion(e.target.value)}
                      autoComplete="address-level1"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground" htmlFor="hv-beds">
                      Beds
                    </label>
                    <input
                      id="hv-beds"
                      type="number"
                      min={0}
                      className={inputClass}
                      value={beds}
                      onChange={(e) => setBeds(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground" htmlFor="hv-baths">
                      Baths
                    </label>
                    <input
                      id="hv-baths"
                      type="number"
                      min={0}
                      className={inputClass}
                      value={baths}
                      onChange={(e) => setBaths(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground" htmlFor="hv-sqft">
                      Sq ft
                    </label>
                    <input
                      id="hv-sqft"
                      type="number"
                      min={0}
                      className={inputClass}
                      value={squareFeet}
                      onChange={(e) => setSquareFeet(e.target.value)}
                    />
                  </div>
                </div>

                <hr className="border-border" />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground" htmlFor="hv-name">
                      Your name
                    </label>
                    <input
                      id="hv-name"
                      className={inputClass}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-foreground" htmlFor="hv-phone">
                      Phone
                    </label>
                    <input
                      id="hv-phone"
                      className={inputClass}
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      autoComplete="tel"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-foreground" htmlFor="hv-email">
                    Email (where we&apos;ll send your estimate)
                  </label>
                  <input
                    id="hv-email"
                    type="email"
                    className={inputClass}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    autoComplete="email"
                  />
                </div>

                {status === 'error' && errorMsg && (
                  <p className="text-sm text-red-600 dark:text-red-400">{errorMsg}</p>
                )}

                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
                  style={{ backgroundColor: ACCENT }}
                >
                  {status === 'loading' ? 'Estimating…' : 'Get my estimate'}
                </button>
                <p className="text-center text-xs text-muted-foreground">
                  By submitting, you agree to be contacted by {agentName} about your home.
                </p>
              </form>
            </SurfaceCard>
          )}

          {status === 'done' && result && (
            <SurfaceCard>
              <SurfaceCardHeader
                title="Your estimated value"
                action={<StatusPill>{result.estimate.dataSourceLabel}</StatusPill>}
              />
              <p className="mt-1 text-sm text-muted-foreground">{result.address}</p>

              {result.estimate.hasEstimate ? (
                <div className="mt-5">
                  <div
                    className="rounded-2xl px-5 py-6 text-center text-white"
                    style={{
                      background: `linear-gradient(135deg, #FF9500 0%, ${ACCENT} 100%)`,
                    }}
                  >
                    <p className="text-xs font-medium uppercase tracking-wider text-white/85">
                      Estimated value range
                    </p>
                    <p
                      className="mt-2 text-3xl font-semibold tracking-tight tabular-nums"
                      style={{ fontFamily: 'var(--font-title)' }}
                    >
                      {formatUsd(result.estimate.low)} – {formatUsd(result.estimate.high)}
                    </p>
                    {result.estimate.estimatedValue != null && (
                      <p className="mt-1 text-sm text-white/85">
                        Midpoint estimate {formatUsd(result.estimate.estimatedValue)}
                      </p>
                    )}
                  </div>
                  <p className="mt-4 text-sm text-muted-foreground">
                    This range is derived from {result.estimate.dataSourceLabel} using{' '}
                    {result.estimate.compCount} comparable{result.estimate.compCount === 1 ? '' : 's'}{' '}
                    near your home. It&apos;s an automated estimate, not an appraisal —{' '}
                    {agentName} can prepare a precise, walk-through valuation for your home.
                  </p>
                </div>
              ) : (
                <div className="mt-5 rounded-2xl bg-muted/60 px-5 py-6">
                  <p className="text-sm font-medium text-foreground">
                    We couldn&apos;t generate a reliable estimate for this address.
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    There wasn&apos;t enough recent market data near your home to stand behind a
                    number — so we won&apos;t guess. {agentName} will reach out and can prepare an
                    accurate valuation for you directly.
                  </p>
                </div>
              )}

              <div className="mt-5 rounded-2xl bg-muted/60 px-4 py-3 text-sm text-foreground">
                Thanks — your request is in. {agentName} will follow up shortly.
              </div>
            </SurfaceCard>
          )}
        </div>
      </main>
    </div>
  );
}
