'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, RotateCw, ExternalLink, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { normalizeBrowserUrl, browserUrlStorageKey } from './browser-url';

interface BrowserViewProps {
  slug: string;
  /** Mirrors RightPanel's isResizing — the iframe goes pointer-events:none
   *  during a divider drag so it doesn't swallow mousemove events. */
  isResizing?: boolean;
  className?: string;
}

// Many sites send X-Frame-Options / CSP frame-ancestors and will refuse to
// render in the iframe. That refusal is NOT reliably detectable from JS (the
// frame is cross-origin and Chrome even fires `load` on its error page), so
// after this window without a load event we surface an honest hint rather
// than pretending everything is fine.
const LOAD_HINT_TIMEOUT_MS = 5000;

interface NavState {
  stack: string[];
  index: number; // -1 = nothing browsed yet
}

/**
 * Minimal in-panel web view for the RightPanel "Browser" tab: a pill address
 * bar with back/forward/reload, a sandboxed iframe, and a permanent
 * "open in new tab" escape hatch for sites that block embedding.
 *
 * History is a local stack (cross-origin iframe history is inaccessible).
 * The last visited URL persists per space in localStorage, restored in an
 * effect after hydration — never in the useState initializer, which would
 * desync the server and client first paint (React #418).
 */
export function BrowserView({ slug, isResizing, className }: BrowserViewProps) {
  const [nav, setNav] = useState<NavState>({ stack: [], index: -1 });
  const [input, setInput] = useState('');
  const [invalid, setInvalid] = useState(false);
  // Bumped on reload / re-submit of the same URL so the iframe re-keys.
  const [frameNonce, setFrameNonce] = useState(0);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [showEmbedHint, setShowEmbedHint] = useState(false);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentUrl = nav.index >= 0 ? nav.stack[nav.index] : null;

  // Restore the last browsed URL after hydration (sidebar MORE_STORAGE_KEY idiom).
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(browserUrlStorageKey(slug));
      const normalized = stored ? normalizeBrowserUrl(stored) : null;
      if (normalized) {
        setNav({ stack: [normalized], index: 0 });
        setInput(normalized);
      }
    } catch {
      /* private mode — session-only state is fine */
    }
  }, [slug]);

  // Persist the current URL whenever navigation lands somewhere.
  useEffect(() => {
    if (!currentUrl) return;
    try {
      window.localStorage.setItem(browserUrlStorageKey(slug), currentUrl);
    } catch {
      /* private mode — session-only state is fine */
    }
  }, [currentUrl, slug]);

  // Per-navigation load tracking: reset the loaded flag, arm the honest-hint
  // timer, and clean up on the next navigation or unmount.
  useEffect(() => {
    if (!currentUrl) return;
    setFrameLoaded(false);
    setShowEmbedHint(false);
    hintTimerRef.current = setTimeout(() => setShowEmbedHint(true), LOAD_HINT_TIMEOUT_MS);
    return () => {
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    };
  }, [currentUrl, frameNonce]);

  const navigate = useCallback(
    (raw: string) => {
      const normalized = normalizeBrowserUrl(raw);
      if (!normalized) {
        setInvalid(true);
        return;
      }
      setInvalid(false);
      setInput(normalized);
      if (normalized === currentUrl) {
        // Re-submitting the current address acts as a reload.
        setFrameNonce((n) => n + 1);
        return;
      }
      const stack = [...nav.stack.slice(0, nav.index + 1), normalized];
      setNav({ stack, index: stack.length - 1 });
    },
    [nav, currentUrl],
  );

  const goBack = useCallback(() => {
    if (nav.index <= 0) return;
    const index = nav.index - 1;
    setNav({ stack: nav.stack, index });
    setInput(nav.stack[index]);
  }, [nav]);

  const goForward = useCallback(() => {
    if (nav.index >= nav.stack.length - 1) return;
    const index = nav.index + 1;
    setNav({ stack: nav.stack, index });
    setInput(nav.stack[index]);
  }, [nav]);

  const reload = useCallback(() => setFrameNonce((n) => n + 1), []);

  const handleFrameLoad = useCallback(() => {
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    setFrameLoaded(true);
  }, []);

  const handleFrameError = useCallback(() => {
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    setFrameLoaded(true);
    setShowEmbedHint(true);
  }, []);

  const canGoBack = nav.index > 0;
  const canGoForward = nav.index >= 0 && nav.index < nav.stack.length - 1;

  const ghostButton = (disabled?: boolean) =>
    cn(
      'flex items-center justify-center h-7 w-7 shrink-0 rounded-md transition-colors',
      disabled
        ? 'text-muted-foreground/30 cursor-default'
        : 'text-muted-foreground/70 hover:text-foreground hover:bg-foreground/[0.025]',
    );

  const addressField = (autoFocus: boolean) => (
    <form
      className="flex-1 min-w-0"
      onSubmit={(e) => {
        e.preventDefault();
        navigate(input);
      }}
    >
      <input
        type="text"
        inputMode="url"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        autoFocus={autoFocus}
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          setInvalid(false);
        }}
        placeholder="Enter URL"
        aria-label="Web address"
        aria-invalid={invalid || undefined}
        className={cn(
          'w-full h-7 rounded-full bg-foreground/[0.04] px-3.5 text-[12px] text-foreground',
          'placeholder:text-muted-foreground/60 outline-none transition-colors',
          'focus:bg-foreground/[0.07]',
          invalid && 'ring-1 ring-foreground/25',
        )}
      />
    </form>
  );

  // ── Empty state — nothing browsed yet ─────────────────────────────────────
  if (!currentUrl) {
    return (
      <div className={cn('flex flex-col h-full', className)}>
        <div className="flex-1 flex flex-col items-center justify-center px-8">
          <Globe size={22} strokeWidth={1.5} className="text-muted-foreground/40" aria-hidden />
          <p className="mt-3 text-[13px] text-muted-foreground">
            Enter a URL to browse alongside Chippi
          </p>
          <div className="mt-4 w-full max-w-sm flex">{addressField(true)}</div>
          <p
            aria-live="polite"
            className={cn(
              'mt-2 h-4 text-[11px] text-muted-foreground/70 transition-opacity',
              invalid ? 'opacity-100' : 'opacity-0',
            )}
          >
            That doesn&rsquo;t look like a web address.
          </p>
        </div>
      </div>
    );
  }

  // ── Browser chrome + frame ────────────────────────────────────────────────
  return (
    <div className={cn('flex flex-col h-full', className)}>
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border/60">
        <button type="button" onClick={goBack} disabled={!canGoBack} aria-label="Back" className={ghostButton(!canGoBack)}>
          <ArrowLeft size={13} />
        </button>
        <button type="button" onClick={goForward} disabled={!canGoForward} aria-label="Forward" className={ghostButton(!canGoForward)}>
          <ArrowRight size={13} />
        </button>
        <button type="button" onClick={reload} aria-label="Reload" className={ghostButton()}>
          <RotateCw size={12} />
        </button>
        <div className="flex-1 min-w-0 mx-1">{addressField(false)}</div>
        {/* Permanent corner escape hatch — embedding is best-effort, a real
            tab always works. */}
        <a
          href={currentUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open in new tab"
          title="Open in new tab"
          className={ghostButton()}
        >
          <ExternalLink size={13} />
        </a>
      </div>

      {(showEmbedHint || invalid) && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border/60 text-[11px] text-muted-foreground" aria-live="polite">
          {invalid ? (
            <span>That doesn&rsquo;t look like a web address.</span>
          ) : (
            <>
              <span className="truncate">
                Not loading? This site may block embedding.
              </span>
              <a
                href={currentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 font-medium text-foreground/80 hover:text-foreground underline underline-offset-2"
              >
                Open in new tab
              </a>
            </>
          )}
        </div>
      )}

      <div className="flex-1 relative min-h-0">
        {!frameLoaded && (
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-foreground/15 animate-pulse" aria-hidden />
        )}
        <iframe
          key={`${currentUrl}#${frameNonce}`}
          src={currentUrl}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          referrerPolicy="no-referrer"
          title="In-panel browser"
          className={cn('w-full h-full border-0 bg-background', isResizing && 'pointer-events-none')}
          onLoad={handleFrameLoad}
          onError={handleFrameError}
        />
      </div>
    </div>
  );
}
