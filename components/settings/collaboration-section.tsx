import Link from 'next/link';

export function CollaborationSection({ teamsEnabled }: { teamsEnabled: boolean }) {
  return <section className="space-y-4 border-t border-border/60 pt-8" aria-labelledby="collaboration-title">
    <div><h2 id="collaboration-title" className="text-base font-medium">Work with others</h2><p className="mt-2 text-sm text-muted-foreground">Add people when you need to collaborate. Your personal workspace and clients stay where they are.</p></div>
    <div className="flex flex-wrap gap-3">
      {teamsEnabled && <Link href="/teams?mode=create" className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">Create a team</Link>}
      {teamsEnabled && <Link href="/teams?mode=join" className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">Join a team</Link>}
      <Link href="/brokerage" className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">Create or join a brokerage</Link>
    </div>
  </section>;
}
