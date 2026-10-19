/**
 * Agent-facing surface. None of these tools return a secret value.
 * list/describe show names and policy. http_request spends. place writes
 * a sealed key into a fixed app store. revoke burns a session grant.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { parseHandleName } from "./core/types.js";
import { describeSecret, listPublicState, revokeSecret } from "./core/vault.js";
import { PLACE_TARGETS, placeSecret } from "./core/place.js";
import { spendHttp } from "./core/spend.js";

export async function startMcpServer(): Promise<void> {
  const server = new McpServer({ name: "keybox", version: "0.1.0" });

  server.tool(
    "list_secrets",
    "List sealed secrets the agent may spend. Returns names, hosts, expiry, and whether open-spend is on — never values.",
    {},
    async () => ({
      content: [{ type: "text", text: JSON.stringify(listPublicState(), null, 2) }],
    }),
  );

  server.tool(
    "describe_secret",
    "Describe one sealed secret by name or «kb:name» handle. Metadata only.",
    { name: z.string() },
    async ({ name }) => {
      const info = describeSecret(parseHandleName(name) ?? name);
      if (!info) {
        return { content: [{ type: "text", text: `No secret named ${name}.` }], isError: true };
      }
      return { content: [{ type: "text", text: JSON.stringify(info, null, 2) }] };
    },
  );

  server.tool(
    "http_request",
    "Spend a sealed secret: Keybox attaches the credential and calls the URL. Unless the user enabled open-spend, the host must be on that secret's allowlist. The response is redacted. The secret value is never returned.",
    {
      secret: z.string().describe("Secret name or «kb:name» handle"),
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]),
      url: z.string().url(),
      headers: z.record(z.string()).optional(),
      body: z.unknown().optional(),
    },
    async ({ secret, method, url, headers, body }) => {
      try {
        const result = await spendHttp({ secret, method, url, headers, body });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: message }], isError: true };
      }
    },
  );

  server.tool(
    "place_secret",
    "Write a sealed secret into a fixed app store. The value stays inside Keybox. Returns last-4 and length only. Target kosmos-openrouter installs the OpenRouter key into Agent Canvas and the Kosmos vault.",
    {
      secret: z.string().describe("Secret name or «kb:name» handle"),
      target: z.enum(PLACE_TARGETS),
    },
    async ({ secret, target }) => {
      try {
        const result = await placeSecret(secret, target);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: message }], isError: true };
      }
    },
  );

  server.tool(
    "revoke_secret",
    "Burn a sealed secret so it can no longer be spent. Does not return the value.",
    { name: z.string() },
    async ({ name }) => {
      const ok = revokeSecret(parseHandleName(name) ?? name);
      return { content: [{ type: "text", text: ok ? `Revoked ${name}.` : `No secret named ${name}.` }] };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
