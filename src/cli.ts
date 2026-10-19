#!/usr/bin/env node
/**
 * User-facing CLI and hook entrypoint. `keybox mcp` is what Cursor launches.
 * `keybox seal --selection` is the highlight-to-seal command bound to ⌘⌥L.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { Command } from "commander";
import { startMcpServer } from "./mcp.js";
import { sealFrontmostSelection } from "./core/frontmost.js";
import { sealText, sealValue } from "./core/seal-text.js";
import { looksLikeSecret } from "./core/detect.js";
import { getSettings, listPublicSecrets, listPublicState, revokeSecret, setHosts, setOpenSpend } from "./core/vault.js";
import { PLACE_TARGETS, placeSecret } from "./core/place.js";
import { spendHttp } from "./core/spend.js";
import { handleBeforeSubmit } from "./hooks/before-submit.js";
import { handleRedactTool } from "./hooks/redact-tool.js";
import { handleSessionStart } from "./hooks/session-start.js";
import { installClaude } from "./install/claude.js";
import { installCodex } from "./install/codex.js";
import { installCursor } from "./install/cursor.js";
import { installVscode } from "./install/vscode.js";
import { formatPromptHook, formatRedact, formatSessionStart, parseHookFormat, toolResultText } from "./hooks/format.js";

const program = new Command();
program.name("keybox").description("Seal secrets. Agents spend them. Models never read them.").version("0.1.0");

program
  .command("mcp")
  .description("Start the MCP server (stdio)")
  .action(async () => {
    await startMcpServer();
  });

program
  .command("seal")
  .description("Seal a secret and print a «kb:name» handle")
  .option("--clipboard", "Seal the current clipboard")
  .option("--selection", "Seal the frontmost selection (Cursor composer)")
  .option("--stdin", "Seal stdin (or seal secret-shaped spans in a full prompt)")
  .option("--raw", "Treat all of stdin as one secret and print only the handle")
  .option("--name <name>", "Force the handle name")
  .option("--host <host>", "Allow this host", collect, [] as string[])
  .option("--keep", "Store as a durable vault item instead of a session grant")
  .action((opts: { clipboard?: boolean; selection?: boolean; stdin?: boolean; raw?: boolean; name?: string; host: string[]; keep?: boolean }) => {
    if (opts.selection) {
      const result = sealFrontmostSelection();
      process.stdout.write(`${result.handle}\n`);
      return;
    }
    if (opts.clipboard) {
      const value = execFileSync("pbpaste", { encoding: "utf8" });
      const sealed = sealValue(value, { name: opts.name, hosts: opts.host, ephemeral: !opts.keep });
      execFileSync("pbcopy", { input: sealed.handle });
      process.stdout.write(`${sealed.handle}\n`);
      return;
    }
    if (opts.stdin || !process.stdin.isTTY) {
      const text = readFileSync(0, "utf8");
      if (opts.raw || (looksLikeSecret(text.trim()) && !text.trim().includes("\n"))) {
        const sealed = sealValue(text, { name: opts.name, hosts: opts.host, ephemeral: !opts.keep });
        process.stdout.write(`${sealed.handle}\n`);
        return;
      }
      const { text: rewritten, seals } = sealText(text, !opts.keep);
      process.stdout.write(JSON.stringify({ text: rewritten, seals }, null, 2) + "\n");
      return;
    }
    program.error("Pass --selection, --clipboard, or pipe text on stdin.");
  });

program
  .command("list")
  .description("List sealed secret names (never values)")
  .action(() => {
    process.stdout.write(JSON.stringify(listPublicState(), null, 2) + "\n");
  });

program
  .command("config")
  .description("Show or change vault policy. The model never sees secret values either way.")
  .argument("[key]", "open-spend")
  .argument("[value]", "on | off")
  .action((key?: string, value?: string) => {
    if (!key) {
      process.stdout.write(JSON.stringify(getSettings(), null, 2) + "\n");
      return;
    }
    if (key !== "open-spend") program.error(`Unknown setting ${key}. Available: open-spend`);
    if (!value) {
      process.stdout.write(`open-spend: ${getSettings().openSpend ? "on" : "off"}\n`);
      return;
    }
    const enabled = ["on", "true", "1", "yes"].includes(value.toLowerCase());
    if (!enabled && !["off", "false", "0", "no"].includes(value.toLowerCase())) {
      program.error("Use: keybox config open-spend on|off");
    }
    setOpenSpend(enabled);
    if (enabled) {
      process.stdout.write(
        "open-spend: on\nAgents may spend sealed keys at any HTTPS URL. The model still cannot read the values. A confused agent could send a key to a host you did not intend.\n",
      );
      return;
    }
    process.stdout.write("open-spend: off\nSpend is limited to each secret's allowed hosts again.\n");
  });

program
  .command("revoke")
  .argument("<name>")
  .description("Burn a sealed secret")
  .action((name: string) => {
    process.stdout.write(revokeSecret(name) ? `Revoked ${name}.\n` : `No secret named ${name}.\n`);
  });

program
  .command("spend")
  .description("Spend a sealed handle against a URL (prints the redacted response)")
  .argument("<name>", "Secret name or «kb:name» handle")
  .argument("<method>", "GET | POST | PUT | PATCH | DELETE")
  .argument("<url>")
  .option("--body <json>", "JSON request body")
  .action(async (name: string, method: string, url: string, opts: { body?: string }) => {
    const verb = method.toUpperCase();
    if (!["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].includes(verb)) {
      program.error(`Unsupported method ${method}`);
    }
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    try {
      const result = await spendHttp({ secret: name, method: verb as "GET", url, body });
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    } catch (error) {
      program.error(error instanceof Error ? error.message : String(error));
    }
  });

program
  .command("place")
  .argument("<name>", "Secret name or «kb:name» handle")
  .argument("<target>", PLACE_TARGETS.join(" | "))
  .description("Write a sealed secret into a fixed app store. Prints last-4 only.")
  .action(async (name: string, target: string) => {
    try {
      const result = await placeSecret(name, target);
      process.stdout.write(JSON.stringify(result) + "\n");
    } catch (error) {
      program.error(error instanceof Error ? error.message : String(error));
    }
  });

program
  .command("allow")
  .argument("<name>")
  .argument("<host>")
  .description("Allow a secret to be spent against a host")
  .action((name: string, host: string) => {
    const current = listPublicSecrets().find((s) => s.name === name);
    const hosts = [...new Set([...(current?.hosts ?? []), host])];
    process.stdout.write(setHosts(name, hosts) ? `Allowed ${name} → ${hosts.join(", ")}\n` : `No secret named ${name}.\n`);
  });

program
  .command("install")
  .argument("<target>", "cursor | vscode | claude | codex | all")
  .description("Install Keybox for Cursor, VS Code, Claude, Codex, or all of them")
  .action((target: string) => {
    try {
      process.stdout.write(`${installTarget(target)}\n`);
    } catch (error) {
      program.error(error instanceof Error ? error.message : String(error));
    }
  });

program
  .command("install-cursor")
  .description("Install the Keybox Cursor plugin for this machine")
  .action(() => {
    process.stdout.write(`${installTarget("cursor")}\n`);
  });

program
  .command("hook")
  .argument("<name>", "before-submit | redact-tool | session-start")
  .option("--format <format>", "cursor | claude | codex", "cursor")
  .description("Host hook entrypoint (reads JSON on stdin)")
  .action((name: string, opts: { format?: string }) => {
    let format;
    try {
      format = parseHookFormat(opts.format);
    } catch (error) {
      program.error(error instanceof Error ? error.message : String(error));
      return;
    }
    const input = JSON.parse(readFileSync(0, "utf8") || "{}");
    let output: unknown;
    switch (name) {
      case "before-submit":
        output = formatPromptHook(handleBeforeSubmit(input), format);
        break;
      case "redact-tool":
        output = formatRedact(handleRedactTool(toolResultText(input)), format);
        break;
      case "session-start":
        output = formatSessionStart(handleSessionStart().additional_context, format);
        break;
      default:
        program.error(`Unknown hook ${name}`);
    }
    process.stdout.write(JSON.stringify(output) + "\n");
  });

function installTarget(target: string): string {
  switch (target) {
    case "cursor":
      return `Installed Cursor plugin at ${installCursor()}\nReload Cursor. Seal a selection with ⌘⌥L. The composer uses the macOS hotkey; an editor file also accepts Keybox: Seal Key.`;
    case "vscode":
      return `Installed the VS Code extension at ${installVscode()}\nReload VS Code. Keybox is in the Copilot MCP config and the VS Code user mcp.json. Seal with ⌘⌥L in an editor, or Keybox: Seal Key. VS Code has no send-time hook, so seal before you send.`;
    case "claude":
      return `Installed Claude Code hooks, the Claude Code skill, and the Claude Desktop MCP server.\nRestart both apps. Claude Code blocks a raw key on submit and redacts tool results. Claude Desktop has no prompt hook — seal with ⌘⌥L or keybox seal before you send. Claude Code can still store the submitted prompt in its local session file.`;
    case "codex":
      return `Installed Codex MCP, hooks, and skill under ~/.codex.\nRestart Codex. A raw key is blocked on submit, and tool results are redacted.`;
    case "all":
      installCursor();
      installVscode({ hotkey: false });
      installClaude({ hotkey: false });
      installCodex({ hotkey: false });
      return "Installed Keybox for Cursor, VS Code, Claude, and Codex.\nReload each app. Seal with ⌘⌥L on macOS, or Keybox: Seal Key in an editor.";
    default:
      throw new Error(`Unknown install target ${target}. Use cursor, vscode, claude, codex, or all.`);
  }
}

function collect(value: string, previous: string[]): string[] {
  return previous.concat(value);
}

void program.parseAsync(process.argv);
