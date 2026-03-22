import { Phone, Building2 } from 'lucide-react';

interface PublicPageShellProps {
  logoUrl: string | null;
  businessName: string;
  agentName: string;
  agentPhone: string | null;
  agentPhoto: string | null;
  pageTitle: string;
  pageIntro: string;
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
    <div className="min-h-screen bg-gradient-to-b from-accent/40 via-background to-background">
      {/* Header bar */}
      <header className="max-w-2xl mx-auto px-4 pt-6 pb-2">
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <img src={logoUrl} alt={businessName} className="h-8 object-contain" />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 size={16} className="text-primary" />
            </div>
          )}
          <span className="text-sm font-medium text-muted-foreground">{businessName}</span>
        </div>
      </header>

      {/* Hero section */}
      <div className="max-w-2xl mx-auto px-4 pt-6 pb-8">
        <div className="space-y-8">
          <div className="text-center space-y-5">
            {/* Agent card */}
            {(agentPhoto || agentName) && (
              <div className="flex flex-col items-center gap-3">
                {agentPhoto && (
                  <img
                    src={agentPhoto}
                    alt={agentName}
                    className="w-20 h-20 rounded-full object-cover ring-4 ring-background shadow-lg"
                  />
                )}
                <div className="space-y-1">
                  <p className="text-base font-semibold text-foreground">{agentName}</p>
                  {agentPhone && (
                    <a
                      href={`tel:${agentPhone}`}
                      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Phone size={12} />
                      {agentPhone}
                    </a>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                {pageTitle}
              </h1>
              <p className="text-muted-foreground text-sm md:text-base max-w-md mx-auto leading-relaxed">
                {pageIntro}
              </p>
            </div>
          </div>

          {/* Main content */}
          {children}

          {/* Footer trust line */}
          <p className="text-center text-xs text-muted-foreground pt-2 pb-6">
            {trustLine}
          </p>
        </div>
      </div>
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
    <div className="min-h-screen bg-gradient-to-b from-accent/40 via-background to-background flex flex-col">
      {/* Header bar */}
      <header className="max-w-md mx-auto w-full px-4 pt-6 pb-2">
        <div className="flex items-center justify-center gap-3">
          {logoUrl ? (
            <img src={logoUrl} alt={businessName} className="h-7 object-contain" />
          ) : (
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 size={14} className="text-primary" />
            </div>
          )}
          <span className="text-sm font-medium text-muted-foreground">{businessName}</span>
        </div>
      </header>

      {/* Centered content */}
      <div className="flex-1 flex items-center justify-center p-4">
        {children}
      </div>
    </div>
  );
}
