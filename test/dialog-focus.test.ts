import { describe, expect, it } from "vitest";
import { activeDialog, tabTarget } from "../src/render/dialog-focus.js";

describe("activeDialog", () => {
  it("returns null when no dialog is open", () => {
    expect(activeDialog({ help: false, pause: false, gameover: false })).toBeNull();
  });

  it("picks the single open dialog", () => {
    expect(activeDialog({ help: false, pause: true, gameover: false })).toBe("pause");
    expect(activeDialog({ help: false, pause: false, gameover: true })).toBe("gameover");
  });

  it("gives help priority when it is opened on top of game over", () => {
    expect(activeDialog({ help: true, pause: false, gameover: true })).toBe("help");
  });

  it("gives help priority when it is opened from the pause dialog", () => {
    expect(activeDialog({ help: true, pause: true, gameover: false })).toBe("help");
  });
});

describe("tabTarget", () => {
  const buttons = ["resume", "help", "restart"];

  it("does nothing when the dialog has no focusable element", () => {
    expect(tabTarget([], null, false)).toBeNull();
  });

  it("pulls focus from outside the dialog to the first or last button", () => {
    expect(tabTarget(buttons, null, false)).toBe("resume");
    expect(tabTarget(buttons, "hud", false)).toBe("resume");
    expect(tabTarget(buttons, "hud", true)).toBe("restart");
  });

  it("wraps from the last button to the first and back", () => {
    expect(tabTarget(buttons, "restart", false)).toBe("resume");
    expect(tabTarget(buttons, "resume", true)).toBe("restart");
  });

  it("leaves moves between inner buttons to the browser", () => {
    expect(tabTarget(buttons, "resume", false)).toBeNull();
    expect(tabTarget(buttons, "help", true)).toBeNull();
  });

  it("keeps focus on a lone button", () => {
    expect(tabTarget(["close"], "close", false)).toBe("close");
    expect(tabTarget(["close"], "close", true)).toBe("close");
  });
});
