import { beforeEach, describe, expect, it } from "vitest";
import {
  registerPublicClient,
  resolvePublicClient,
} from "@/lib/mcp/public-client";
const callback = "http://127.0.0.1:49152/callback/abcdefgh1234";
beforeEach(() => {
  process.env.MCP_JWT_SECRET = "test-key-with-at-least-thirty-two-characters";
});
describe("public MCP registration", () => {
  it("issues a separate installation identity without account credentials", async () => {
    const a = await registerPublicClient("Codex", [callback]);
    const b = await registerPublicClient("Codex", [callback]);
    expect(a).not.toBe(b);
    expect(await resolvePublicClient(a, callback)).toEqual({ name: "Codex" });
  });
  it("binds the full callback including host, port and path", async () => {
    const id = await registerPublicClient("Codex", [callback]);
    for (const uri of [
      callback.replace("49152", "49153"),
      callback.replace("127.0.0.1", "localhost"),
      callback.replace("abcdefgh1234", "abcdefgh5678"),
      "https://attacker.example/callback",
    ])
      expect(await resolvePublicClient(id, uri)).toBeNull();
  });
  it("rejects forged client metadata", async () => {
    const id = await registerPublicClient("Codex", [callback]);
    const parts = id.split(".");
    parts[1] = Buffer.from(
      JSON.stringify({ redirectUris: ["https://attacker.example"] }),
    ).toString("base64url");
    expect(await resolvePublicClient(parts.join("."), callback)).toBeNull();
  });
  it("rejects unsafe or oversized registration", async () => {
    for (const uris of [
      [],
      ["https://attacker.example/callback"],
      ["http://127.0.0.1:49152/callback/abcdefgh1234?forward=1"],
    ])
      await expect(registerPublicClient("Codex", uris)).rejects.toThrow();
    await expect(
      registerPublicClient("x".repeat(101), [callback]),
    ).rejects.toThrow();
  });
});
