// Tiny bootstrap — Three.js game bundle loads only after user interaction.

import "./styles.css";

// Cloudflare Web Analytics — production only. The site token is a public
// identifier embedded in every page, not a secret.
if (import.meta.env.PROD) {
  const beacon = document.createElement("script");
  beacon.type = "module";
  beacon.src = "https://static.cloudflareinsights.com/beacon.min.js";
  beacon.dataset.cfBeacon = '{"token": "cd156fbf0fd24da0a12e58fdb4e63828"}'; // gitleaks:allow
  document.head.appendChild(beacon);
}

// The key list only fits beside the Hold panel on tall screens; elsewhere it
// starts collapsed and the player can open it.
const keysPanel = document.getElementById("panel-keys");
if (keysPanel instanceof HTMLDetailsElement && window.innerHeight < 940) {
  keysPanel.open = false;
}

let started = false;

async function startGame() {
  if (started) return;
  started = true;
  const screen = document.getElementById("start-screen");
  if (screen) screen.style.display = "none";
  try {
    await import("./main.js");
  } catch {
    showLoadFailure(screen);
  }
}

// A dropped connection, or an index.html that still points at a chunk a newer
// deploy removed, rejects the import. Browsers remember a failed module fetch,
// so retrying the import would fail again; bring the start screen back and
// turn START into a reload (fail-safe, escape hatch). `started` stays true so
// the original handlers do not re-run the broken import.
function showLoadFailure(screen: HTMLElement | null) {
  if (screen) screen.style.display = "";
  const hint = document.querySelector(".start-hint");
  if (hint) hint.textContent = "Could not load the game. Reload the page to try again.";
  const btn = document.getElementById("start-btn");
  if (btn) {
    btn.textContent = "RELOAD";
    btn.addEventListener("click", () => location.reload());
  }
}

document.getElementById("start-btn")?.addEventListener("click", startGame);
document.addEventListener("keydown", startGame, { once: true });
window.addEventListener("touchstart", startGame, { once: true });
