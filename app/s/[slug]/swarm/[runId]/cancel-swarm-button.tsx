'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface CancelSwarmButtonProps {
  runId: string;
  slug: string;
}

export async function cancelSwarmFromMonitor(
  runId: string,
  refresh: () => void,
  fetcher: typeof fetch = fetch,
): Promise<'cancelled' | 'terminal'> {
  const response = await fetcher(`/api/swarm/${runId}/cancel`, { method: 'POST' });
  if (response.ok) {
    refresh();
    return 'cancelled';
  }
  if (response.status === 409) {
    refresh();
    return 'terminal';
  }
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  throw new Error(body.error ?? 'Failed to cancel.');
}

export function CancelSwarmButton({ runId, slug: _slug }: CancelSwarmButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleCancel() {
    setLoading(true);
    try {
      const outcome = await cancelSwarmFromMonitor(runId, () => router.refresh());
      if (outcome === 'terminal') {
        toast.info('This task already finished. Refreshing its result.');
      } else {
        toast.success('Swarm cancelled.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={loading}
          className="flex-shrink-0"
        >
          {loading ? 'Cancelling…' : 'Cancel'}
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this swarm?</AlertDialogTitle>
          <AlertDialogDescription>
            No new specialist phase will start. A model call already in progress may finish
            before Chippi reaches the cancellation boundary, but its result will not replace
            the cancelled run. Work completed earlier will remain visible.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep running</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleCancel}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Cancel swarm
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
