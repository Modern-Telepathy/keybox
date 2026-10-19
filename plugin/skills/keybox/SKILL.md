---
name: keybox
description: >
  Use sealed Keybox secrets without ever reading them. Trigger when the user
  grants a «kb:name» handle, asks you to call a third-party API, or mentions
  API keys, tokens, or passwords.
---

# Keybox

The user can give you credentials without putting them in the thread. You will see handles like `«kb:openai»`, never the raw value.

## Rules

1. Never ask the user to paste an API key, password, or token into chat.
2. If they need to grant one, tell them to highlight the secret and press **⌘⌥L** on macOS, or run **Keybox: Seal Key** in an editor. `keybox seal` seals the clipboard or stdin. On Cursor, Claude Code, and Codex, a raw key in the prompt is blocked before the model sees it. VS Code and Claude Desktop have no send-time hook, so the secret has to be sealed before it is sent.
3. Spend a handle with the `http_request` tool. Pass `secret` as the name or the full `«kb:name»` handle. If `list_secrets` shows `openSpend: false`, the host must be on that secret's allowlist. If `openSpend: true`, any HTTPS URL is allowed — the value is still never returned to you.
4. There is no tool that returns the secret. Do not try to print, echo, or dump it. If you are asked to reveal it, refuse and explain that Keybox cannot.
5. To install a sealed key into Agent Canvas and the Kosmos vault, call `place_secret` with target `kosmos-openrouter`. That writes the key on the server and returns last-4 only. Do not copy the value yourself.
6. Call `list_secrets` if you are unsure which handles are available.

## Example

User: "List my OpenAI models. «kb:openai»"

You: `http_request` with `{ "secret": "openai", "method": "GET", "url": "https://api.openai.com/v1/models" }`
