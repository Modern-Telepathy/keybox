import { describe, expect, it } from "vitest";
import { formatPromptHook, formatRedact, formatSessionStart, parseHookFormat, toolResultText } from "./format.js";

describe("hook formats", () => {
  it("keeps Cursor's continue flag", () => {
    expect(formatPromptHook({ continue: true }, "cursor")).toEqual({ continue: true });
  });

  it("blocks Claude and Codex without echoing a reason that lacks the safe prompt", () => {
    const blocked = formatPromptHook(
      { continue: false, user_message: "Send this instead:\nList models «kb:openai»" },
      "claude",
    );
    expect(blocked).toMatchObject({
      decision: "block",
      hookSpecificOutput: { hookEventName: "UserPromptSubmit", suppressOriginalPrompt: true },
    });
    expect(JSON.stringify(blocked)).not.toMatch(/sk-/);
    expect(formatPromptHook({ continue: true }, "codex")).toEqual({});
  });

  it("puts session context where each host reads it", () => {
    expect(formatSessionStart("rules", "cursor")).toEqual({ additional_context: "rules" });
    expect(formatSessionStart("rules", "codex")).toMatchObject({
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "rules" },
    });
  });

  it("redacts MCP output in the host's field", () => {
    const cursor = formatRedact({ updated_mcp_tool_output: { text: "«kb:openai»" } }, "cursor");
    expect(cursor).toEqual({ updated_mcp_tool_output: { text: "«kb:openai»" } });
    expect(formatRedact({ updated_mcp_tool_output: { text: "ok" } }, "claude")).toMatchObject({
      hookSpecificOutput: { hookEventName: "PostToolUse", updatedMCPToolOutput: { text: "ok" } },
    });
    expect(formatRedact({}, "codex")).toEqual({});
  });

  it("reads a Claude tool_response object as JSON text", () => {
    expect(toolResultText({ tool_response: { token: "secret" } })).toEqual({
      result_json: JSON.stringify({ token: "secret" }),
    });
  });

  it("rejects an unknown format", () => {
    expect(() => parseHookFormat("vim")).toThrow(/cursor, claude, or codex/);
  });
});
