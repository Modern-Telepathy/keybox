/**
 * A spend test never asserts the secret in the agent-facing result.
 * The mock server is the only place allowed to observe that the header arrived.
 */

import { createServer, type IncomingMessage } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sealSecret, setHosts, setOpenSpend } from "./vault.js";
import { spendHttp } from "./spend.js";

const previousHome = process.env.KEYBOX_HOME;
const FIXTURE = "sk-proj-test-key-do-not-use-in-prod-zzzz";

describe("spendHttp", () => {
  beforeEach(() => {
    process.env.KEYBOX_HOME = mkdtempSync(join(tmpdir(), "keybox-spend-"));
  });

  afterEach(() => {
    if (previousHome === undefined) delete process.env.KEYBOX_HOME;
    else process.env.KEYBOX_HOME = previousHome;
  });

  it("injects the secret on localhost and redacts it from the result", async () => {
    const seen: string[] = [];
    const server = await listen((req) => {
      seen.push(req.headers.authorization ?? "");
    }, { token: FIXTURE });

    try {
      const sealed = sealSecret(FIXTURE, { hosts: ["127.0.0.1"] });
      const result = await spendHttp({
        secret: sealed.handle,
        method: "GET",
        url: `${server.url}/whoami`,
      });

      expect(seen).toEqual([`Bearer ${FIXTURE}`]);
      expect(result.status).toBe(200);
      expect(JSON.stringify(result)).not.toContain(FIXTURE);
      expect(result.body).toEqual({ token: "***" });
    } finally {
      await server.close();
    }
  });

  it("refuses a host that was not allowed", async () => {
    sealSecret(FIXTURE, { name: "locked", hosts: ["api.openai.com"] });
    setHosts("locked", ["api.openai.com"]);
    await expect(
      spendHttp({ secret: "locked", method: "GET", url: "http://127.0.0.1:9/" }),
    ).rejects.toThrow(/not allowed/);
  });

  it("skips the host allowlist when open-spend is on", async () => {
    const seen: string[] = [];
    const server = await listen((req) => {
      seen.push(req.headers.authorization ?? "");
    }, { ok: true });

    try {
      sealSecret(FIXTURE, { name: "open", hosts: [] });
      setOpenSpend(true);
      const result = await spendHttp({
        secret: "open",
        method: "GET",
        url: `${server.url}/any`,
      });
      expect(seen[0]).toBe(`Bearer ${FIXTURE}`);
      expect(JSON.stringify(result)).not.toContain(FIXTURE);
    } finally {
      await server.close();
    }
  });
});

function listen(
  onRequest: (req: IncomingMessage) => void,
  body: unknown,
): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      onRequest(req);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(body));
    });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("expected TCP address"));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise((done, fail) => {
            server.close((error) => (error ? fail(error) : done()));
          }),
      });
    });
  });
}
