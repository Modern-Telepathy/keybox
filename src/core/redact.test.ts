import { describe, expect, it } from "vitest";
import { redactJson, redactSecrets } from "./redact.js";

describe("redact", () => {
  const secret = "sk-proj-abcdefghijklmnopqrstuvwxyz";

  it("strips plaintext, base64, and url-encoded copies", () => {
    const encoded = encodeURIComponent(secret);
    const b64 = Buffer.from(secret).toString("base64");
    const text = `plain=${secret} enc=${encoded} b64=${b64}`;
    expect(redactSecrets(text, [secret])).toBe("plain=*** enc=*** b64=***");
  });

  it("walks JSON without touching unrelated fields", () => {
    const out = redactJson({ ok: true, token: secret, nested: { token: secret } }, [secret]);
    expect(out).toEqual({ ok: true, token: "***", nested: { token: "***" } });
  });
});
