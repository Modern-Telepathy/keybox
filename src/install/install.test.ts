import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { platform, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { installClaude } from "./claude.js";
import { installCodex } from "./codex.js";
import { installCursor } from "./cursor.js";
import { mergeNestedHooks, mergeServerMap, setTomlKeyInTable, upsertTomlTable } from "./merge.js";
import { claudeDesktopConfig, vscodeUserMcp } from "./paths.js";
import { installVscode } from "./vscode.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function home(): string {
  return mkdtempSync(join(tmpdir(), "keybox-install-"));
}

const quiet = { hotkey: false, repoRoot };

describe("config merge", () => {
  it("keeps other MCP servers and other hooks", () => {
    const merged = mergeServerMap({ mcpServers: { other: { command: "other" } } }, "mcpServers", "keybox", {
      command: "node",
    });
    expect(merged.mcpServers).toMatchObject({ other: { command: "other" }, keybox: { command: "node" } });

    const hooks = mergeNestedHooks(
      { permissions: { allow: ["Bash"] }, hooks: { Stop: [{ hooks: [{ type: "command", command: "echo hi" }] }] } },
      [{ event: "UserPromptSubmit", command: "/keybox hook before-submit --format claude" }],
    );
    expect(hooks.permissions).toEqual({ allow: ["Bash"] });
    expect(hooks.hooks).toMatchObject({
      Stop: [{ hooks: [{ command: "echo hi" }] }],
      UserPromptSubmit: [{ hooks: [{ command: "/keybox hook before-submit --format claude" }] }],
    });
  });

  it("replaces a Keybox TOML table and leaves the next table alone", () => {
    const source = "[mcp_servers.other]\ncommand = \"other\"\n\n[mcp_servers.keybox]\ncommand = \"old\"\n\n[features]\nweb_search = true\n";
    const next = upsertTomlTable(source, "[mcp_servers.keybox]", ["command = \"node\""]);
    expect(next).toContain('command = "other"');
    expect(next).toContain('command = "node"');
    expect(next).not.toContain('command = "old"');
    const flagged = setTomlKeyInTable(next, "[features]", "hooks", "true");
    expect(flagged).toContain("web_search = true");
    expect(flagged).toContain("hooks = true");
  });

  it("points Claude Desktop and VS Code at the right files per OS", () => {
    expect(claudeDesktopConfig("/h", "darwin")).toBe("/h/Library/Application Support/Claude/claude_desktop_config.json");
    expect(claudeDesktopConfig("/h", "linux")).toBe("/h/.config/Claude/claude_desktop_config.json");
    expect(vscodeUserMcp("/h", "win32", "C:/App")).toBe("C:/App/Code/User/mcp.json");
  });
});

describe("host installers", () => {
  it("registers Cursor, VS Code, Claude, and Codex without removing a neighbor server", () => {
    const dir = home();
    const cursor = installCursor({ ...quiet, home: dir });
    expect(readFileSync(join(cursor, "mcp.json"), "utf8")).toContain('"mcp"');
    expect(readFileSync(join(dir, ".cursor", "hooks.json"), "utf8")).toContain("before-submit");
    expect(readFileSync(join(dir, ".cursor", "extensions", "keybox.keybox-0.1.0", "package.json"), "utf8")).toContain(
      "keybox.sealSelection",
    );

    installVscode({ ...quiet, home: dir });
    const copilot = JSON.parse(readFileSync(join(dir, ".copilot", "mcp-config.json"), "utf8"));
    expect(copilot.mcpServers.keybox.args).toContain("mcp");
    const profile = JSON.parse(readFileSync(vscodeUserMcp(dir, platform()), "utf8"));
    expect(profile.servers.keybox.type).toBe("stdio");

    const claudeHome = home();
    writeFileSyncSafe(join(claudeHome, ".claude.json"), JSON.stringify({ mcpServers: { other: { command: "stay" } } }));
    installClaude({ ...quiet, home: claudeHome, platform: "linux" });
    const claude = JSON.parse(readFileSync(join(claudeHome, ".claude.json"), "utf8"));
    expect(claude.mcpServers.other.command).toBe("stay");
    expect(claude.mcpServers.keybox.args).toContain("mcp");
    const settings = JSON.parse(readFileSync(join(claudeHome, ".claude", "settings.json"), "utf8"));
    expect(JSON.stringify(settings.hooks.UserPromptSubmit)).toContain("--format claude");
    expect(readFileSync(claudeDesktopConfig(claudeHome, "linux"), "utf8")).toContain("keybox");
    expect(readFileSync(join(claudeHome, ".claude", "skills", "keybox", "SKILL.md"), "utf8")).toContain("http_request");

    const codexHome = home();
    installCodex({ ...quiet, home: codexHome });
    const toml = readFileSync(join(codexHome, ".codex", "config.toml"), "utf8");
    expect(toml).toContain("[mcp_servers.keybox]");
    expect(toml).toContain("hooks = true");
    const codexHooks = JSON.parse(readFileSync(join(codexHome, ".codex", "hooks.json"), "utf8"));
    expect(JSON.stringify(codexHooks.hooks.PostToolUse)).toContain("--format codex");
  });
});

function writeFileSyncSafe(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}
