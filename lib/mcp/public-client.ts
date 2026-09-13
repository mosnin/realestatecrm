import { SignJWT, jwtVerify } from "jose";
import { isAllowedOAuthRedirect } from "./redirect-allowlist";
const PREFIX = "chippi_dc_";
const audience = "chippi-mcp-client-registration";
function secret() {
  const value = process.env.MCP_JWT_SECRET;
  if (!value || value.length < 32)
    throw new Error("MCP OAuth is not configured");
  return new TextEncoder().encode(value);
}
export function isPublicClientId(id: string) {
  return id.startsWith(PREFIX);
}
export async function registerPublicClient(
  name: string,
  redirectUris: string[],
) {
  if (
    !name.trim() ||
    name.length > 100 ||
    redirectUris.length < 1 ||
    redirectUris.length > 5 ||
    redirectUris.some(
      (uri) => uri.length > 2048 || !isAllowedOAuthRedirect(uri),
    )
  )
    throw new Error("Invalid client metadata");
  return (
    PREFIX +
    (await new SignJWT({ name: name.trim(), redirectUris })
      .setProtectedHeader({ alg: "HS256", typ: "chippi-mcp-client" })
      .setAudience(audience)
      .setJti(crypto.randomUUID())
      .setIssuedAt()
      .setExpirationTime("365d")
      .sign(secret()))
  );
}
export async function resolvePublicClient(
  id: string,
  redirectUri: string,
): Promise<{ name: string } | null> {
  if (!isPublicClientId(id)) return null;
  try {
    const { payload, protectedHeader } = await jwtVerify(
      id.slice(PREFIX.length),
      secret(),
      { algorithms: ["HS256"], audience },
    );
    if (
      protectedHeader.typ !== "chippi-mcp-client" ||
      typeof payload.name !== "string" ||
      !Array.isArray(payload.redirectUris) ||
      !payload.redirectUris.includes(redirectUri) ||
      !isAllowedOAuthRedirect(redirectUri)
    )
      return null;
    return { name: payload.name };
  } catch {
    return null;
  }
}
