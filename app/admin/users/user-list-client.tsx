'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Search, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type UserRow = {
  id: string;
  name: string | null;
  email: string;
  onboard: boolean;
  createdAt: string;
  onboardingCurrentStep: number;
  space: { slug: string; name: string; emoji: string } | null;
};

const filters = [
  { value: 'all', label: 'All' },
  { value: 'onboarded', label: 'Onboarded' },
  { value: 'not-onboarded', label: 'Not onboarded' },
  { value: 'has-space', label: 'Has workspace' },
  { value: 'no-space', label: 'No workspace' },
] as const;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function UserListClient({
  users,
  query,
  filter,
  resultCount,
}: {
  users: UserRow[];
  query: string;
  filter: string;
  resultCount: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(query);

  function navigate(newQuery?: string, newFilter?: string) {
    const params = new URLSearchParams();
    const q = newQuery ?? search;
    const f = newFilter ?? filter;
    if (q) params.set('q', q);
    if (f && f !== 'all') params.set('filter', f);
    startTransition(() => {
      router.push(`/admin/users?${params.toString()}`);
    });
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    navigate(search);
  }

  function clearSearch() {
    setSearch('');
    navigate('', filter);
  }

  return (
    <div className="space-y-4">
      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearch} className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, or slug..."
              className="pl-9 pr-8"
            />
            {search && (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <Button type="submit" size="sm" disabled={isPending}>
            Search
          </Button>
        </form>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => navigate(search, f.value)}
            className={cn(
              'text-xs font-medium px-3 py-1.5 rounded-full border transition-colors',
              filter === f.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-muted-foreground border-border hover:bg-muted'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Result count */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground border-b border-border pb-3">
        <span>
          <strong className="text-foreground font-semibold">
            {resultCount}
          </strong>{' '}
          {resultCount === 1 ? 'user' : 'users'}
        </span>
        {isPending && (
          <span className="text-xs text-muted-foreground animate-pulse">
            Loading...
          </span>
        )}
      </div>

      {/* User list */}
      {users.length === 0 ? (
        <Card>
          <CardContent className="px-5 py-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <Users size={20} className="text-muted-foreground" />
            </div>
            <p className="font-semibold text-foreground mb-1">No users found</p>
            <p className="text-sm text-muted-foreground">
              {query
                ? 'Try a different search term.'
                : 'No users match the current filter.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {users.map((user) => (
            <Link key={user.id} href={`/admin/users/${user.id}`}>
              <div className="rounded-xl border border-border bg-card px-4 py-3 hover:shadow-sm transition-all duration-150">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary flex-shrink-0">
                      {(user.name || user.email || '?')
                        .split(' ')
                        .map((n: string) => n[0])
                        .join('')
                        .toUpperCase()
                        .slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {user.name || 'No name'}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {user.email}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {user.space && (
                      <span className="hidden sm:inline-flex text-[10px] font-medium text-primary bg-primary/10 rounded-full px-2 py-0.5 max-w-[100px] truncate">
                        {user.space.emoji} {user.space.slug}
                      </span>
                    )}
                    <span
                      className={`inline-flex text-[10px] font-semibold rounded-full px-2 py-0.5 ${
                        user.onboard
                          ? 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/15'
                          : 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/15'
                      }`}
                    >
                      {user.onboard ? 'Onboarded' : `Step ${user.onboardingCurrentStep}`}
                    </span>
                    <span className="hidden sm:inline text-xs text-muted-foreground">
                      {timeAgo(user.createdAt)}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
