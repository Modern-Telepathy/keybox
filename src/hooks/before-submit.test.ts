import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleBeforeSubmit } from "./before-submit.js";

const previousHome = process.env.KEYBOX_HOME;

describe("beforeSubmitPrompt backstop", () => {
  beforeEach(() => {
    process.env.KEYBOX_HOME = mkdtempSync(join(tmpdir(), "keybox-test-"));
  });

  afterEach(() => {
    if (previousHome === undefined) delete process.env.KEYBOX_HOME;
    else process.env.KEYBOX_HOME = previousHome;
  });

  it("lets a clean prompt through", () => {
    expect(handleBeforeSubmit({ prompt: "List my models with «kb:openai»" })).toEqual({ continue: true });
  });

  it("blocks a raw key and returns a handle the user can paste", () => {
    const key = "sk-proj-abcdefghijklmnopqrstuvwxyz123456";
    const result = handleBeforeSubmit({ prompt: `List models ${key}` });
    expect(result.continue).toBe(false);
    expect(result.user_message).toMatch(/«kb:openai»/);
  });
});
