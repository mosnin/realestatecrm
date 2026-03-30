import { BrandLogo } from '@/components/brand-logo';

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

  return (
    <div
      className={`min-h-screen bg-muted dark:bg-background ${fontClass} ${darkClass}`.trim()}
      style={{ '--intake-accent': accentColor } as React.CSSProperties}
    >
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header className="bg-card border-b border-border" style={headerStyle}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14 sm:h-16">
            {/* Left: realtor branding */}
            <div className="flex items-center gap-3 min-w-0">
              {agentPhoto ? (
                <img
                  src={agentPhoto}
                  alt={agentName}
                  width={36}
                  height={36}
                  loading="eager"
                  decoding="async"
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover flex-shrink-0"
                />
              ) : null}
              <div className="min-w-0">
                {logoUrl ? (
                  <img src={logoUrl} alt={businessName} width={112} height={28} loading="eager" decoding="async" className="h-6 sm:h-7 object-contain" />
                ) : (
                  <span className="text-sm sm:text-base font-semibold text-foreground truncate block">
                    {businessName}
                  </span>
                )}
                {customization?.bio && (
                  <p className="text-[11px] text-muted-foreground truncate max-w-[200px] sm:max-w-xs">
                    {customization.bio}
                  </p>
                )}
                {customization?.socialLinks && Object.keys(customization.socialLinks).length > 0 && (
                  <div className="flex gap-2 mt-0.5">
                    {Object.entries(customization.socialLinks).map(([platform, url]) =>
                      url ? (
                        <a
                          key={platform}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-muted-foreground hover:text-foreground capitalize"
                        >
                          {platform}
                        </a>
                      ) : null
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right: powered by Chippi */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-[11px] text-muted-foreground/70 hidden sm:inline">Powered by</span>
              <BrandLogo className="h-4 sm:h-5" />
            </div>
          </div>
        </div>
      </header>

      {/* ── Accent strip ─────────────────────────────────────────────────── */}
      <div className="h-1" style={{ backgroundColor: accentColor }} />

      {/* ── Page content ─────────────────────────────────────────────────── */}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="space-y-6">
          {/* Title area */}
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
              {pageTitle}
            </h1>
            {pageIntro && (
              <p className="text-sm text-muted-foreground mt-1 max-w-lg">
                {pageIntro}
              </p>
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
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                {link.label}
              </a>
            ))}
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-10 pb-6">
          {trustLine}
        </p>
      </main>
    </div>
  );
}

/**
 * Minimal branded wrapper for secondary pages (status, tour manage)
 * that don't need the full hero section.
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
      {/* ── Top bar ────────────────────────────────────────────────────── */}
      <header className="bg-card border-b border-border">
        <div className="max-w-lg mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            {/* Left: business name */}
            <div className="flex items-center gap-2 min-w-0">
              {logoUrl ? (
                <img src={logoUrl} alt={businessName} className="h-6 object-contain" />
              ) : (
                <span className="text-sm font-semibold text-foreground truncate">
                  {businessName}
                </span>
              )}
            </div>

            {/* Right: powered by */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <span className="text-[11px] text-muted-foreground/70 hidden sm:inline">Powered by</span>
              <BrandLogo className="h-4" />
            </div>
          </div>
        </div>
      </header>

      {/* ── Accent strip ───────────────────────────────────────────────── */}
      <div className="h-1 bg-primary" />

      {/* Centered content */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        {children}
      </div>
    </div>
  );
}
