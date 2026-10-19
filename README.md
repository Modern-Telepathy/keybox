# Keybox

Seal a secret for Cursor, VS Code, Claude, or Codex. The agent can **spend** it. The model never **reads** it.

There is no `get_secret` tool.

## What is new

Other vaults ask you to add keys *before* the chat. Keybox is built for the moment you already pasted one:

1. **Highlight → ⌘⌥L** (macOS) or **Keybox: Seal Key** replaces the selection with `«kb:openai»`.
2. On Cursor, Claude Code, and Codex, a hook **blocks the turn** if a raw key is still in the prompt and shows the safe prompt. VS Code and Claude Desktop have no send-time hook, so seal before you send.

## Install

```bash
npm install
npm run build
npm test
node dist/cli.js install cursor
node dist/cli.js install vscode
node dist/cli.js install claude
node dist/cli.js install codex
```

`node dist/cli.js install all` registers every host. `install-cursor` remains an alias for `install cursor`.

| Host | What the installer writes | Send-time hook |
| --- | --- | --- |
| Cursor | `~/.cursor/plugins/local/keybox`, the editor extension, user hooks | Yes |
| VS Code | `~/.vscode/extensions/keybox.keybox-0.1.0`, `~/.copilot/mcp-config.json`, user `mcp.json` | No — seal first |
| Claude Code | `~/.claude.json` MCP server, `~/.claude/settings.json` hooks, skill | Yes. The local session file can still store the submitted prompt |
| Claude Desktop | desktop `claude_desktop_config.json` MCP server | No — seal first |
| Codex | `~/.codex/config.toml`, `~/.codex/hooks.json`, skill | Yes |

On macOS the installer compiles `keybox-hotkey` and asks for Accessibility. That shortcut seals the frontmost selection, including chat fields that are not a normal editor. Windows and Linux skip the hotkey. In Cursor and VS Code, an editor selection also binds **⌘⌥L** / **Ctrl+Alt+L** to Keybox: Seal Key.

Reload the app after installing. The command is `~/.keybox/bin/keybox` (`keybox.cmd` on Windows). Add that directory to your PATH if you want to run `keybox` from any terminal.

## Use

Highlight a key in the agent composer (or in any editor) and press **⌘⌥L**.

```text
List my models «kb:openai»
```

The agent calls Keybox `http_request`. Keybox attaches the header and redacts the response. By default the host must be on that secret's allowlist. To let the agent call any HTTPS URL — still without ever seeing the key — use the **Keybox** item in the status bar (bottom right), Cursor Settings → **Keybox: Open Spend**, or:

```bash
keybox config open-spend on
```

```bash
keybox list
keybox allow openai api.openai.com
keybox config open-spend off
keybox revoke openai
```

Session grants expire in 12 hours. `keybox seal --clipboard --keep` stores a durable item.

## What the agent can see

Names, hosts, expiry. Never the value.

## Status

One vault, installed per host. Cursor, Claude Code, and Codex block a raw key on submit. VS Code and Claude Desktop seal before you send.
