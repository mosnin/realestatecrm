import Link from 'next/link';

export const metadata = { title: 'Workspace unavailable — Chippi' };

export default function WorkspaceUnavailablePage() {
  return <main className="mx-auto max-w-lg px-6 py-20">
    <h1 className="text-xl font-semibold">This brokerage is unavailable</h1>
    <p className="mt-3 text-sm text-muted-foreground">Your access may have changed, or the workspace could not be loaded. Reopen an available brokerage or return to your workspace.</p>
    <div className="mt-6 flex flex-wrap gap-4">
      <Link href="/broker/brief?choose=1" className="text-sm underline">Open an available brokerage</Link>
      <Link href="/auth/redirect?intent=realtor" className="text-sm underline">Open my workspace</Link>
    </div>
  </main>;
}
