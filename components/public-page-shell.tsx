import { BrandLogo } from '@/components/brand-logo';

interface PublicPageShellProps {
  logoUrl: string | null;
  businessName: string;
  agentName: string;
  agentPhone: string | null;
  agentPhoto: string | null;
  pageTitle: string;
  pageIntro?: string;
  trustLine: string;
  children: React.ReactNode;
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
  children,
}: PublicPageShellProps) {
  return (
    <div className="min-h-screen bg-[#f5f5f7] dark:bg-background">
      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <header className="bg-white dark:bg-card border-b border-border">
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
              {logoUrl ? (
                <img src={logoUrl} alt={businessName} width={112} height={28} loading="eager" decoding="async" className="h-6 sm:h-7 object-contain" />
              ) : (
                <span className="text-sm sm:text-base font-semibold text-foreground truncate">
                  {businessName}
                </span>
              )}
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
      <div className="h-1 bg-primary" />

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
    <div className="min-h-screen bg-[#f5f5f7] dark:bg-background flex flex-col">
      {/* ── Top bar ────────────────────────────────────────────────────── */}
      <header className="bg-white dark:bg-card border-b border-border">
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
