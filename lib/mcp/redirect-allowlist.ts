/**
 * Single source of truth for which redirect_uri hosts the MCP OAuth flow will
 * hand an authorization code (or an access_denied error) back to.
 *
 * Both legs must agree or the check is worthless: the PKCE authorize route
 * (app/api/mcp/oauth/authorize) validates before ISSUING a code, and the
 * consent screen (app/authorize) validates before rendering the approve/deny
 * buttons — the Deny button navigates the browser straight to redirect_uri, so
 * an unvalidated value there is an open redirect that also leaks `state`, and
 * Approve would ship a live auth code to an attacker-controlled origin. This
 * helper keeps the allowlist from drifting between the two.
 */
export function isAllowedOAuthRedirect(redirectUri: string): boolean {
  try {
    const url = new URL(redirectUri);
    // OAuth codes are bearer-equivalent secrets — only ever return them over TLS.
    if (url.protocol !== 'https:' && !(process.env.NODE_ENV === 'development' && url.protocol === 'http:')) {
      return false;
    }
    const allowedHosts = ['claude.ai', 'www.claude.ai'];
    if (process.env.NODE_ENV === 'development') {
      allowedHosts.push('localhost');
    }
    return allowedHosts.some((h) => url.hostname === h);
  } catch {
    return false;
  }
}
