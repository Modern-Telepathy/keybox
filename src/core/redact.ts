/**
 * Last line of defense: if a spend response (or any hook payload) echoes a
 * known secret, strip it before the model can see it. We also mask common
 * encodings so a base64 copy of the same key does not slip through.
 */

export function redactSecrets(text: string, secrets: string[]): string {
  let next = text;
  for (const secret of secrets) {
    if (!secret) continue;
    next = next.split(secret).join("***");
    const b64 = Buffer.from(secret, "utf8").toString("base64");
    if (b64.length > 8) next = next.split(b64).join("***");
    const encoded = encodeURIComponent(secret);
    if (encoded !== secret) next = next.split(encoded).join("***");
  }
  return next;
}

export function redactJson(value: unknown, secrets: string[]): unknown {
  if (typeof value === "string") return redactSecrets(value, secrets);
  if (Array.isArray(value)) return value.map((item) => redactJson(item, secrets));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] = redactJson(child, secrets);
    }
    return out;
  }
  return value;
}
