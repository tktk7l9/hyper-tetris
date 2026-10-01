/**
 * Pure focus rules for the modal overlays (pause / help / game over), kept
 * free of the DOM so they can be unit-tested.
 */

export type DialogName = "help" | "pause" | "gameover";

export interface OpenDialogs {
  help: boolean;
  pause: boolean;
  gameover: boolean;
}

/**
 * The dialog that owns keyboard focus. Help can be opened on top of both
 * the pause and the game-over dialog, so it wins; pause and game over are
 * never shown together.
 */
export function activeDialog(open: OpenDialogs): DialogName | null {
  if (open.help) return "help";
  if (open.gameover) return "gameover";
  if (open.pause) return "pause";
  return null;
}

/**
 * Where Tab / Shift+Tab should move focus inside a dialog, or null to let the
 * browser handle it. Focus outside the dialog is pulled back in, and the ends
 * wrap around.
 */
export function tabTarget<T>(focusable: readonly T[], active: T | null, shift: boolean): T | null {
  if (focusable.length === 0) return null;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (active === null || !focusable.includes(active)) return shift ? last : first;
  if (shift && active === first) return last;
  if (!shift && active === last) return first;
  return null;
}
