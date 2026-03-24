'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Send } from 'lucide-react';

export function InviteForm() {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'realtor_member' | 'broker_admin'>('realtor_member');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/broker/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), roleToAssign: role }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({
          type: 'success',
          text: data.duplicate ? `Invitation already sent to ${email}.` : `Invitation sent to ${email}.`,
        });
        setEmail('');
        // Refresh to show the new invite in the list
        if (!data.duplicate) window.location.reload();
      } else {
        setMessage({ type: 'error', text: data.error ?? 'Failed to send invitation.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
      <input
        type="email"
        required
        placeholder="colleague@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        disabled={loading}
        className="flex-1 h-9 rounded-lg border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
      />
      <select
        value={role}
        onChange={(e) => setRole(e.target.value as typeof role)}
        disabled={loading}
        className="h-9 rounded-lg border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
      >
        <option value="realtor_member">Realtor</option>
        <option value="broker_admin">Admin</option>
      </select>
      <Button type="submit" size="sm" disabled={loading} className="flex items-center gap-1.5">
        <Send size={14} />
        {loading ? 'Sending…' : 'Send invite'}
      </Button>
      {message && (
        <p
          className={`text-xs mt-1 sm:col-span-3 ${
            message.type === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
          }`}
        >
          {message.text}
        </p>
      )}
    </form>
  );
}
