// Tiny bootstrap — Three.js game bundle loads only after user interaction.

// Vercel Web Analytics — production only. Script + beacon are same-origin
// (/_vercel/insights/*), so the strict CSP (script-src/connect-src 'self') is
// unaffected. Skipped off Vercel: the Cloudflare Worker has no such endpoint,
// so injecting there would only 404 on every load.
if (import.meta.env.PROD && location.hostname.endsWith(".vercel.app")) {
  void import("@vercel/analytics").then(({ inject }) => inject());
}

let started = false;

async function startGame() {
  if (started) return;
  started = true;
  const screen = document.getElementById("start-screen");
  if (screen) screen.style.display = "none";
  await import("./main.js");
}

document.getElementById("start-btn")?.addEventListener("click", startGame);
document.addEventListener("keydown", startGame, { once: true });
window.addEventListener("touchstart", startGame, { once: true });
