import { BrandLogo } from '@/components/brand-logo';
import { CheckIcon } from 'lucide-react';

interface ShellCustomization {
  accentColor?: string;
  darkMode?: boolean;
  headerBgColor?: string | null;
  headerGradient?: string | null;
  font?: string;
  bio?: string | null;
  socialLinks?: Record<string, string> | null;
  footerLinks?: { label: string; url: string }[];
}

interface PublicPageShellProps {
  logoUrl: string | null;
  businessName: string;
  agentName: string;
  agentPhone: string | null;
  agentPhoto: string | null;
  pageTitle: string;
  pageIntro?: string;
  trustLine: string;
  customization?: ShellCustomization;
  children: React.ReactNode;
}

const FONT_CLASS_MAP: Record<string, string> = {
  system: '',
  sans: 'font-sans',
  serif: 'font-serif',
  mono: 'font-mono',
};

// Social platform SVG icons (inline, no external dependency)
function SocialIcon({ platform }: { platform: string }) {
  const size = 15;
  switch (platform.toLowerCase()) {
    case 'linkedin':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
        </svg>
      );
    case 'instagram':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
        </svg>
      );
    case 'facebook':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
        </svg>
      );
    default:
      return null;
  }
}

export function PublicPageShell({
  logoUrl,
  businessName,
  agentName,
  agentPhone,
  agentPhoto,
  pageTitle,
  pageIntro,
  trustLine,
  customization,
  children,
}: PublicPageShellProps) {
  const fontClass = FONT_CLASS_MAP[customization?.font || 'system'] || '';
  const darkClass = customization?.darkMode ? 'dark' : '';

  const headerStyle: React.CSSProperties = {};
  if (customization?.headerGradient) {
    headerStyle.background = customization.headerGradient;
  } else if (customization?.headerBgColor) {
    headerStyle.backgroundColor = customization.headerBgColor;
  }

  const accentColor = customization?.accentColor || '#ff964f';
  const hasSocial = customization?.socialLinks && Object.values(customization.socialLinks).some(Boolean);

  return (
    <div
      className={`min-h-screen bg-muted dark:bg-background ${fontClass} ${darkClass}`.trim()}
      style={{ '--intake-accent': accentColor } as React.CSSProperties}
    >
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header className="bg-card border-b border-border" style={headerStyle}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14 sm:h-16">
            {/* Left: agent branding */}
            <div className="flex items-center gap-3 min-w-0">
              {agentPhoto && (
                <div className="relative flex-shrink-0">
                  <img
                    src={agentPhoto}
                    alt={agentName}
                    width={36}
                    height={36}
                    loading="eager"
                    decoding="async"
                    className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover ring-2 ring-blue-500 ring-offset-2 ring-offset-background"
                  />
                  <span className="absolute -right-0.5 -bottom-0.5 inline-flex size-3.5 items-center justify-center rounded-full bg-blue-500 ring-1.5 ring-background">
                    <CheckIcon className="size-2 text-white" />
                  </span>
                </div>
              )}
              <div className="min-w-0">
                {logoUrl ? (
                  <img src={logoUrl} alt={businessName} width={112} height={28} loading="eager" decoding="async" className="h-6 sm:h-7 object-contain" />
                ) : (
                  <span className="text-sm sm:text-base font-semibold text-foreground truncate block">
                    {businessName}
                  </span>
                )}
              </div>
              {/* Social icons inline with branding */}
              {hasSocial && (
                <div className="hidden sm:flex items-center gap-1.5 ml-1">
                  {Object.entries(customization!.socialLinks!).map(([platform, url]) =>
                    url ? (
                      <a
                        key={platform}
                        href={url as string}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground/60 hover:text-foreground transition-colors"
                        title={platform}
                      >
                        <SocialIcon platform={platform} />
                      </a>
                    ) : null
                  )}
                </div>
              )}
            </div>

            {/* Right: powered by Chippi (subtle) */}
            <div className="flex items-center gap-1 flex-shrink-0 opacity-50 hover:opacity-80 transition-opacity">
              <span className="text-[10px] text-muted-foreground hidden sm:inline">Powered by</span>
              <BrandLogo className="h-3.5 sm:h-4" />
            </div>
          </div>
        </div>
      </header>

      {/* ── Thin accent line ─────────────────────────────────────────────── */}
      <div className="h-0.5" style={{ backgroundColor: accentColor }} />

      {/* ── Page content ─────────────────────────────────────────────────── */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="space-y-5">
          {/* Agent bio (if bio exists) — no photo/name since header already shows them */}
          {customization?.bio && (
            <p className="text-sm text-muted-foreground">{customization.bio}</p>
          )}

          {/* Title area */}
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
              {pageTitle}
            </h1>
            {pageIntro && (
              <p className="text-sm text-muted-foreground mt-1 max-w-lg">{pageIntro}</p>
            )}
          </div>

          {/* Main content */}
          {children}
        </div>

        {/* Footer links */}
        {customization?.footerLinks && customization.footerLinks.length > 0 && (
          <div className="flex items-center justify-center gap-4 mt-6">
            {customization.footerLinks.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                {link.label}
              </a>
            ))}
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-[11px] text-muted-foreground/50 mt-10 pb-6">
          {trustLine}
        </p>
      </main>
    </div>
  );
}

/**
 * Minimal branded wrapper for secondary pages (status, tour manage).
 */
export function PublicPageMinimalShell({
  logoUrl,
  businessName,
  children,
}: {
  logoUrl?: string | null;
  businessName: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-muted dark:bg-background flex flex-col">
      <header className="bg-card border-b border-border">
        <div className="max-w-lg mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2 min-w-0">
              {logoUrl ? (
                <img src={logoUrl} alt={businessName} className="h-6 object-contain" />
              ) : (
                <span className="text-sm font-semibold text-foreground truncate">{businessName}</span>
              )}
            </div>
            <div className="flex items-center gap-1 flex-shrink-0 opacity-50">
              <span className="text-[10px] text-muted-foreground hidden sm:inline">Powered by</span>
              <BrandLogo className="h-3.5" />
            </div>
          </div>
        </div>
      </header>
      <div className="h-0.5 bg-primary" />
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        {children}
      </div>
    </div>
  );
}
