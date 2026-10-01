// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getByRole } from "@testing-library/dom";
import userEvent from "@testing-library/user-event";
import { byId, mountApp } from "./dom.js";

const mainLoads = vi.fn();

async function boot(innerHeight = 1000) {
  Object.defineProperty(window, "innerHeight", { value: innerHeight, configurable: true });
  vi.resetModules();
  // The real bundle needs WebGL; count its loads instead of running it.
  vi.doMock("../../src/main.js", () => {
    mainLoads();
    return {};
  });
  await import("../../src/boot.js");
}

async function flush() {
  await new Promise((r) => setTimeout(r, 0));
}

describe("boot", () => {
  beforeEach(() => {
    mountApp();
    mainLoads.mockClear();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    // Drain the once-listeners so a previous test's boot cannot leak into the next.
    document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyX" }));
    window.dispatchEvent(new Event("touchstart"));
    vi.restoreAllMocks();
  });

  it("starts the game from the START button and loads the bundle once", async () => {
    await boot();
    const user = userEvent.setup();
    const screen = byId("start-screen");
    expect(screen.style.display).toBe("");
    expect(mainLoads).not.toHaveBeenCalled();

    await user.click(getByRole(document.body, "button", { name: "START GAME" }));
    await flush();
    expect(screen.style.display).toBe("none");
    expect(mainLoads).toHaveBeenCalledOnce();

    byId("start-btn").click();
    document.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }));
    await flush();
    expect(mainLoads).toHaveBeenCalledOnce();
  });

  it("starts on any key press", async () => {
    await boot();
    document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyQ" }));
    await flush();
    expect(byId("start-screen").style.display).toBe("none");
    expect(mainLoads).toHaveBeenCalledOnce();
  });

  it("starts on a touch anywhere", async () => {
    await boot();
    window.dispatchEvent(new Event("touchstart"));
    await flush();
    expect(byId("start-screen").style.display).toBe("none");
    expect(mainLoads).toHaveBeenCalledOnce();
  });

  it("survives a page without a start screen", async () => {
    byId("start-screen").remove();
    await boot();
    document.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyQ" }));
    await flush();
    expect(mainLoads).toHaveBeenCalledOnce();
  });

  it("collapses the key list on short screens and keeps it open on tall ones", async () => {
    await boot(939);
    expect(byId<HTMLDetailsElement>("panel-keys").open).toBe(false);
    mountApp();
    await boot(940);
    expect(byId<HTMLDetailsElement>("panel-keys").open).toBe(true);
  });

  it("injects the analytics beacon only in production", async () => {
    await boot();
    expect(document.querySelector("script[data-cf-beacon]")).toBeNull();
    vi.stubEnv("PROD", true);
    await boot();
    const beacon = document.querySelector<HTMLScriptElement>("script[data-cf-beacon]");
    expect(beacon?.src).toBe("https://static.cloudflareinsights.com/beacon.min.js");
    expect(beacon?.type).toBe("module");
    beacon?.remove();
  });
});
