# Local Codex OAuth

Create a dedicated MCP connection in Chippi's existing team settings and use its public client ID. The local plugin never needs its client secret. Sign-in uses the existing Clerk account and consent screen, which names the full team workspace and its read-only CRM permissions. The client may receive the callback only on literal loopback at a non-privileged port and `/oauth/callback`.

The code is bound to the client, exact redirect, PKCE S256, team and optional existing state nonce. New codes are stored hashed. An atomic DELETE RETURNING consumes the code once; mismatched requests do not consume it. Existing legacy codes can finish their five-minute lifetime. Token redemption and every subsequent MCP call recheck the parent connection and its expiry.

Access lasts one hour. There is no refresh grant in this product flow; sign in again after expiry. OAuth sign-out revokes that access token without deleting the team's API key. A team administrator can revoke the parent connection to end all derived access. The revocation table is private to the service role and scoped to the signed token's team.

Deploy migration `20260918000000_mcp_oauth_revocation.sql` before the routes. Missing revocation storage fails closed for OAuth JWTs; native API-key authentication remains available. Metadata now advertises public PKCE and revocation. The client must continue sending state at code exchange because this product's existing nonce contract requires it.

Verification is local: focused HTTP/auth tests, full unit suite, and TypeScript. The concurrent-redemption fixture models atomic database consumption; hosted PostgreSQL and real Clerk account consent still require live acceptance. The existing consent layout is retained; copy now names the actual connection and says access was approved rather than prematurely claiming the client is connected.
