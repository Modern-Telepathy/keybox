import { describe, expect, it } from "vitest";
import { detectSecrets, looksLikeSecret, replaceSecrets } from "./detect.js";
import { formatHandle, parseHandleName } from "./types.js";

describe("detectSecrets", () => {
  it("finds an OpenAI key and ignores surrounding prose", () => {
    const key = "sk-proj-abcdefghijklmnopqrstuvwxyz123456";
    const hits = detectSecrets(`Call the API with ${key} please`);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.raw).toBe(key);
    expect(hits[0]?.provider?.id).toBe("openai");
  });

  it("finds an Anthropic key instead of classifying it as OpenAI", () => {
    const key = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz1234";
    const hits = detectSecrets(key);
    expect(hits[0]?.provider?.id).toBe("anthropic");
  });

  it("does not treat an already-sealed handle as a secret", () => {
    const text = "Use «kb:openai» against api.openai.com";
    expect(detectSecrets(text)).toHaveLength(0);
  });

  it("skips short random strings", () => {
    expect(looksLikeSecret("hello-world")).toBe(false);
  });
});

describe("replaceSecrets", () => {
  it("rewrites right-to-left so offsets stay valid", () => {
    const a = "sk-proj-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const b = "ghp_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    const out = replaceSecrets(`A ${a} B ${b}`, (hit) => `«kb:${hit.provider?.id}»`);
    expect(out).toBe("A «kb:openai» B «kb:github»");
  });
});

describe("handles", () => {
  it("round-trips the three handle spellings", () => {
    expect(parseHandleName(formatHandle("openai"))).toBe("openai");
    expect(parseHandleName("[kb:openai]")).toBe("openai");
    expect(parseHandleName("kb://openai")).toBe("openai");
  });
});
