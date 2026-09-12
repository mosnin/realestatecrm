'use client';
import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export function DashboardViewToggle({ kind, id }: { kind: 'personal' | 'brokerage'; id: string }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const basePath = `/workforce/${kind}/${encodeURIComponent(id)}`;
  const [workforceHref, setWorkforceHref] = useState(basePath + '/app');
  const enabled = process.env.NEXT_PUBLIC_CHIPPI_WORKFORCE_ENABLED === 'true';
  useEffect(() => {
    if (!enabled) return;
    try {
      const saved = sessionStorage.getItem(`chippi:workforce:${basePath}`);
      setWorkforceHref(saved?.startsWith(basePath + '/app') ? saved : basePath + '/app');
      sessionStorage.setItem(`chippi:crm:${kind}:${id}`, pathname + (search.size ? `?${search}` : '')); } catch {}
  }, [enabled, kind, id, pathname, search, basePath]);
  if (!enabled || !id) return null;
  return <nav aria-label="Dashboard view" className="mx-2 mt-3 grid grid-cols-2 rounded-lg bg-muted p-1 text-sm">
    <span aria-current="page" className="rounded-md bg-background px-3 py-1.5 text-center font-medium">CRM</span>
    <a className="rounded-md px-3 py-1.5 text-center text-muted-foreground hover:bg-background hover:text-foreground" href={workforceHref}>Workforce</a>
  </nav>;
}
