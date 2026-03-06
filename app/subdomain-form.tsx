'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createSubdomainAction } from '@/app/actions';

type CreateState = {
  error?: string;
  success?: boolean;
  subdomain?: string;
};

export function SubdomainForm() {
  const [state, action, isPending] = useActionState<CreateState, FormData>(
    createSubdomainAction,
    {}
  );

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="subdomain">Workspace name</Label>
        <Input
          id="subdomain"
          name="subdomain"
          placeholder="your-workspace"
          defaultValue={state?.subdomain}
          className="w-full"
          required
        />
        <p className="text-xs text-muted-foreground">
          This is used as your internal workspace identifier.
        </p>
      </div>

      {state?.error && <div className="text-sm text-destructive">{state.error}</div>}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? 'Creating...' : 'Create Workspace'}
      </Button>
    </form>
  );
}
