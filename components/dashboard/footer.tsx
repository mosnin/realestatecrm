import Link from 'next/link';

export function DashboardFooter() {
  return (
    <footer className="pt-8 pb-1">
      <div className="border-t border-border/50 pt-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground/70">
        <p>© {new Date().getFullYear()} Chippi. All rights reserved.</p>
        <div className="flex items-center gap-4">
          <Link href="/terms" className="hover:text-foreground transition-colors">
            Terms of Service
          </Link>
          <Link href="/privacy" className="hover:text-foreground transition-colors">
            Privacy Policy
          </Link>
        </div>
      </div>
    </footer>
  );
}
