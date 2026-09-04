// Tiny bootstrap — Three.js game bundle loads only after user interaction.

// Cloudflare Web Analytics — production only. The site token is a public
// identifier embedded in every page, not a secret.
if (import.meta.env.PROD) {
  const beacon = document.createElement("script");
  beacon.type = "module";
  beacon.src = "https://static.cloudflareinsights.com/beacon.min.js";
  beacon.dataset.cfBeacon = '{"token": "cd156fbf0fd24da0a12e58fdb4e63828"}';
  document.head.appendChild(beacon);
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
