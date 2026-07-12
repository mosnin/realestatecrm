import 'server-only';
/**
 * Custom-plugin execution — ONE code path for every runtime. The TS chat
 * tool (lib/ai-tools/tools/use-plugin.ts) and the Modal/Python agent (via
 * /api/internal/plugins/call) both land here, so the SSRF posture and auth
 * handling can never drift between runtimes.
 *
 * Guards: assertPublicHttpTarget at call time, redirect:'manual',
 * getSafeDispatcher() (DNS-rebind TOCTOU), 15s timeout, 10KB response cap.
 * The stored auth header is attached here and never leaves the server.
 */

import { supabase } from '@/lib/supabase';
import { assertPublicHttpTarget, getSafeDispatcher } from '@/lib/net/ssrf-guard';

export type PluginCallResult =
  | { ok: true; plugin: string; status: number; body: string; httpOk: boolean }
  | { ok: false; error: string };

export async function callCustomPlugin(
  spaceId: string,
  pluginName: string,
  input?: string,
): Promise<PluginCallResult> {
  const { data: plugin } = await supabase
    .from('CustomPlugin')
    .select('name, url, method, authHeader, enabled')
    .eq('spaceId', spaceId)
    .eq('name', pluginName.trim().toLowerCase())
    .maybeSingle();

  if (!plugin) {
    return { ok: false, error: `No plugin named "${pluginName}". Check the Plugins page.` };
  }
  if (!plugin.enabled) {
    return { ok: false, error: `The "${plugin.name}" plugin is turned off. Enable it on the Plugins page.` };
  }

  const check = await assertPublicHttpTarget(plugin.url);
  if (!check.ok) {
    return { ok: false, error: `Plugin target rejected: ${check.reason}` };
  }

  const method = plugin.method === 'GET' ? 'GET' : 'POST';
  const headers: Record<string, string> = { 'User-Agent': 'chippi-plugin/1.0' };
  const auth = plugin.authHeader as { name?: string; value?: string } | null;
  if (auth?.name && auth.value) headers[auth.name] = auth.value;

  let url = plugin.url;
  let body: string | undefined;
  const cleanInput = (input ?? '').trim().slice(0, 4000);
  if (method === 'GET') {
    if (cleanInput) {
      const u = new URL(url);
      u.searchParams.set('input', cleanInput);
      url = u.toString();
    }
  } else {
    headers['Content-Type'] = 'application/json';
    if (cleanInput) {
      try {
        JSON.parse(cleanInput);
        body = cleanInput; // already a JSON document — pass through
      } catch {
        body = JSON.stringify({ input: cleanInput });
      }
    } else {
      body = '{}';
    }
  }

  try {
    const fetchInit: RequestInit & { dispatcher?: unknown } = {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(15_000),
      // Never follow redirects — the guard only vetted the initial host.
      redirect: 'manual',
      // Re-validate the resolved IP at connect time (DNS-rebind TOCTOU).
      dispatcher: getSafeDispatcher(),
    };
    const res = await fetch(url, fetchInit);
    const text = await res.text().then((t) => t.slice(0, 10_000));
    return { ok: true, plugin: plugin.name, status: res.status, body: text, httpOk: res.ok };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Couldn't reach "${plugin.name}": ${msg}` };
  }
}
