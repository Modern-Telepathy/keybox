/**
 * One seal decision, three hook dialects. Cursor wants continue/user_message.
 * Claude Code and Codex want decision/hookSpecificOutput. The secret value
 * never appears in either shape — callers pass the already rewritten prompt.
 */

export type HookFormat = "cursor" | "claude" | "codex";

export function parseHookFormat(value: string | undefined): HookFormat {
  if (value === undefined || value === "cursor" || value === "claude" || value === "codex") {
    return value ?? "cursor";
  }
  throw new Error(`Unknown hook format ${value}. Use cursor, claude, or codex.`);
}

export function formatPromptHook(
  result: { continue: boolean; user_message?: string },
  format: HookFormat,
): unknown {
  if (format === "cursor") return result;
  if (result.continue) return {};
  // suppressOriginalPrompt keeps the raw key out of the block message the
  // user sees. Claude Code can still store the submitted text in its local
  // session file; that limit belongs to the host, not the vault.
  return {
    decision: "block",
    reason: result.user_message ?? "Keybox sealed a secret in that prompt.",
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      suppressOriginalPrompt: true,
    },
  };
}

export function formatSessionStart(additionalContext: string, format: HookFormat): unknown {
  if (format === "cursor") return { additional_context: additionalContext };
  return {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext,
    },
  };
}

export function formatRedact(
  result: { updated_mcp_tool_output?: unknown },
  format: HookFormat,
): unknown {
  if (!result.updated_mcp_tool_output) return format === "cursor" ? result : {};
  if (format === "cursor") return result;
  return {
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      updatedMCPToolOutput: result.updated_mcp_tool_output,
    },
  };
}

/**
 * Cursor sends result_json or tool_output. Claude and Codex send tool_response
 * as either a string or an object. Normalize to the string the redactor parses.
 */
export function toolResultText(input: {
  tool_output?: unknown;
  result_json?: unknown;
  tool_response?: unknown;
}): { tool_output?: string; result_json?: string } {
  const response = input.tool_response ?? input.result_json ?? input.tool_output;
  if (response === undefined || response === null) return {};
  if (typeof response === "string") {
    return input.result_json !== undefined || input.tool_response !== undefined
      ? { result_json: response }
      : { tool_output: response };
  }
  return { result_json: JSON.stringify(response) };
}
