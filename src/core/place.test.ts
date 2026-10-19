/**
 * A place test never asserts the secret in the agent-facing result.
 * The deliverer is the only place allowed to observe the plaintext.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sealSecret } from "./vault.js";
import { placeSecret } from "./place.js";

const previousHome = process.env.KEYBOX_HOME;
const FIXTURE = "sk-or-v1-test-key-do-not-use-in-prod-zzzz";

describe("placeSecret", () => {
  beforeEach(() => {
    process.env.KEYBOX_HOME = mkdtempSync(join(tmpdir(), "keybox-place-"));
  });

  afterEach(() => {
    if (previousHome === undefined) delete process.env.KEYBOX_HOME;
    else process.env.KEYBOX_HOME = previousHome;
  });

  it("hands the secret to the deliverer and returns last-4 only", async () => {
    const seen: string[] = [];
    const sealed = sealSecret(FIXTURE, { name: "openai", hosts: ["openrouter.ai"] });
    const result = await placeSecret(sealed.handle, "kosmos-openrouter", async (secret) => {
      seen.push(secret);
    });
    expect(seen).toEqual([FIXTURE]);
    expect(result).toEqual({ target: "kosmos-openrouter", last4: "zzzz", length: FIXTURE.length });
    expect(JSON.stringify(result)).not.toContain(FIXTURE);
  });

  it("refuses a key that is not OpenRouter", async () => {
    const sealed = sealSecret("sk-proj-not-openrouter-zzzz", { name: "other" });
    await expect(placeSecret(sealed.handle, "kosmos-openrouter", async () => {})).rejects.toThrow(/not an OpenRouter key/);
  });
});
