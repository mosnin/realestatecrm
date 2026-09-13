import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { registerPublicClient } from "@/lib/mcp/public-client";
export async function POST(req: NextRequest) {
  const { allowed } = await checkRateLimit(
    `mcp:registration:${getClientIp(req)}`,
    10,
    60,
  );
  if (!allowed)
    return NextResponse.json({ error: "rate_limit_exceeded" }, { status: 429 });
  try {
    const raw = await req.text();
    if (raw.length > 16384) throw new Error("request too large");
    const p = JSON.parse(raw);
    if (
      !p ||
      typeof p.client_name !== "string" ||
      !Array.isArray(p.redirect_uris) ||
      p.redirect_uris.some((u: unknown) => typeof u !== "string") ||
      (p.token_endpoint_auth_method &&
        p.token_endpoint_auth_method !== "none") ||
      (p.grant_types &&
        (!Array.isArray(p.grant_types) ||
          !p.grant_types.includes("authorization_code") ||
          p.grant_types.some((g: unknown) => g !== "authorization_code" && g !== "refresh_token"))) ||
      (p.response_types &&
        (!Array.isArray(p.response_types) ||
          p.response_types.some((r: unknown) => r !== "code")))
    )
      throw new Error("invalid metadata");
    const clientId = await registerPublicClient(p.client_name, p.redirect_uris);
    return NextResponse.json(
      {
        client_id: clientId,
        client_name: p.client_name,
        redirect_uris: p.redirect_uris,
        // Registration returns the supported subset. Refresh is not advertised
        // until durable refresh rotation is implemented.
        grant_types: ["authorization_code"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        scope: "crm:read",
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "invalid_client_metadata" },
      { status: 400 },
    );
  }
}
