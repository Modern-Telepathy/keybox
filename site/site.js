/**
 * Page behavior for the Keybox site: the seal demo, copy buttons, and
 * the size/checksum the packager writes next to the zip. The download
 * link and the install steps work with this script disabled.
 */

const secret = document.querySelector("#secret");
const note = document.querySelector("#composer-note");
const seal = document.querySelector("#seal-demo");
const sealLabel = document.querySelector("#seal-label");

const rawSecret = "sk-proj-EXAMPLE";
const handle = "«kb:openai»";
let sealed = false;

function paintSeal() {
  if (!secret || !note || !seal || !sealLabel) return;
  secret.textContent = sealed ? handle : rawSecret;
  secret.dataset.state = sealed ? "sealed" : "raw";
  note.textContent = sealed
    ? "Sealed. Send this. Keybox attaches the credential on the way out."
    : "The key is highlighted. Seal it before you send.";
  sealLabel.textContent = sealed ? "Show the key again" : "Seal selection";
  seal.setAttribute("aria-pressed", sealed ? "true" : "false");
  seal.classList.toggle("is-sealed", sealed);
}

seal?.addEventListener("click", () => {
  sealed = !sealed;
  paintSeal();
});

/**
 * Install instructions for every host stay in the page. The tabs only
 * choose which panel is visible. With this script off, every panel shows.
 */
const platformTabs = document.querySelectorAll(".platforms button");
const platformPanels = document.querySelectorAll(".platform-panel");

function showPlatform(id) {
  platformTabs.forEach((tab) => {
    tab.setAttribute("aria-selected", tab.getAttribute("data-platform") === id ? "true" : "false");
  });
  platformPanels.forEach((panel) => {
    panel.hidden = panel.getAttribute("data-platform") !== id;
  });
}

if (platformTabs.length > 0) showPlatform("cursor");
platformTabs.forEach((tab) => {
  tab.addEventListener("click", () => showPlatform(tab.getAttribute("data-platform") ?? "cursor"));
});

document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    const source = document.getElementById(button.getAttribute("data-copy") ?? "");
    const text = source?.textContent?.trim() ?? "";
    const previous = button.textContent;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "Copied";
    } catch {
      button.textContent = "Select to copy";
    }
    window.setTimeout(() => {
      button.textContent = previous;
    }, 1600);
  });
});

const version = document.body.dataset.version;
if (version) {
  fetch(`downloads/keybox-${version}.json`)
    .then((response) => (response.ok ? response.json() : null))
    .then((meta) => {
      if (!meta) return;
      const size = formatBytes(meta.bytes);
      document.querySelectorAll(".download-meta").forEach((node) => {
        node.textContent = `${meta.version} · ${size}`;
      });
      const checksum = document.querySelector("#checksum");
      if (checksum && meta.sha256) checksum.textContent = meta.sha256;
    })
    .catch(() => {
      // The zip link still works. The checksum file is linked in the page.
    });
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
