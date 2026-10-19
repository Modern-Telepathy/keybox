/**
 * Cursor/VS Code half of Keybox. Seal lives on the selection command and
 * the macOS hotkey. Open-spend is a status-bar toggle plus a Settings
 * checkbox; both write through to the vault so the MCP server sees them.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext): void {
  const bar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 80);
  bar.command = "keybox.toggleOpenSpend";
  bar.name = "Keybox open spend";
  context.subscriptions.push(bar);

  let writingVault = false;

  const refresh = async (): Promise<boolean> => {
    const enabled = await readOpenSpend(context);
    paintBar(bar, enabled);
    writingVault = true;
    await vscode.workspace.getConfiguration("keybox").update("openSpend", enabled, vscode.ConfigurationTarget.Global);
    writingVault = false;
    return enabled;
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("keybox.sealSelection", () => sealSelection(context)),
    vscode.commands.registerCommand("keybox.sealClipboard", () => runKeybox(context, ["seal", "--clipboard"])),
    vscode.commands.registerCommand("keybox.toggleOpenSpend", async () => {
      const next = !(await readOpenSpend(context));
      if (next) {
        const pick = await vscode.window.showWarningMessage(
          "Open spend lets the agent call any HTTPS URL with your sealed keys. The model still cannot read the values.",
          { modal: true },
          "Turn on",
        );
        if (pick !== "Turn on") return;
      }
      await runKeybox(context, ["config", "open-spend", next ? "on" : "off"]);
      await refresh();
      void vscode.window.showInformationMessage(next ? "Keybox: open spend on" : "Keybox: host allowlist on");
    }),
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (writingVault || !event.affectsConfiguration("keybox.openSpend")) return;
      const enabled = vscode.workspace.getConfiguration("keybox").get<boolean>("openSpend") ?? false;
      await runKeybox(context, ["config", "open-spend", enabled ? "on" : "off"]);
      paintBar(bar, enabled);
    }),
  );

  void refresh();
}

export function deactivate(): void {}

function paintBar(bar: vscode.StatusBarItem, openSpend: boolean): void {
  bar.text = openSpend ? "$(unlock) Keybox · any URL" : "$(lock) Keybox";
  bar.tooltip = openSpend
    ? "Open spend is on. Click to limit spends to allowed hosts."
    : "Host allowlist is on. Click to let the agent spend at any HTTPS URL.";
  bar.backgroundColor = openSpend ? new vscode.ThemeColor("statusBarItem.warningBackground") : undefined;
  bar.show();
}

async function readOpenSpend(context: vscode.ExtensionContext): Promise<boolean> {
  try {
    const raw = (await runKeybox(context, ["config"])).trim();
    const parsed = JSON.parse(raw) as { openSpend?: boolean };
    return Boolean(parsed.openSpend);
  } catch {
    return false;
  }
}

async function sealSelection(context: vscode.ExtensionContext): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (editor && !editor.selection.isEmpty) {
    const raw = editor.document.getText(editor.selection);
    const handle = (await runKeybox(context, ["seal", "--stdin", "--name", guessName(raw)], raw)).trim();
    if (!handle) return;
    await editor.edit((edit) => edit.replace(editor.selection, handle));
    void vscode.window.showInformationMessage(`Sealed as ${handle}`);
    return;
  }

  try {
    const handle = (await runKeybox(context, ["seal", "--selection"])).trim();
    void vscode.window.showInformationMessage(`Sealed as ${handle}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`Keybox could not seal the selection. ${message}`);
  }
}

async function runKeybox(context: vscode.ExtensionContext, args: string[], stdin?: string): Promise<string> {
  const cli = resolveCli(context);
  const command = cli.endsWith(".js") ? "node" : cli;
  const commandArgs = cli.endsWith(".js") ? [cli, ...args] : args;
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, { timeout: 10_000 });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || "keybox failed"));
    });
    child.stdin.end(stdin ?? "");
  });
}

function resolveCli(context: vscode.ExtensionContext): string {
  const configured = vscode.workspace.getConfiguration("keybox").get<string>("cliPath");
  if (configured) return configured;
  const shim = join(homedir(), ".keybox", "bin", "keybox");
  if (existsSync(shim)) return shim;
  const sibling = join(dirname(context.extensionPath), "dist", "cli.js");
  if (existsSync(sibling)) return sibling;
  return "keybox";
}

function guessName(raw: string): string {
  if (raw.includes("sk-ant-")) return "anthropic";
  if (raw.startsWith("sk-")) return "openai";
  if (raw.startsWith("ghp_") || raw.startsWith("github_pat_")) return "github";
  if (raw.startsWith("sk_")) return "stripe";
  return "secret";
}
