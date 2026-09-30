/**
 * Shared jsdom helpers for the UI tests. Mounts the real `index.html` markup
 * so the tests exercise the same ids, roles and labels the player sees, and
 * replaces the 2D canvas context (jsdom has none) with a recording stub so
 * the HUD's minimap / preview drawing can run and be asserted on.
 */
import { vi } from "vitest";
import html from "../../index.html?raw";

const bodyMarkup = html.slice(html.indexOf("<body>") + "<body>".length, html.lastIndexOf("</body>"));

export type CanvasStub = Record<string, ReturnType<typeof vi.fn>> & {
  /** Every text drawn on this canvas since the last reset, in order. */
  texts: () => string[];
};

/** A permissive CanvasRenderingContext2D stand-in that records calls. */
export function createCanvasStub(): CanvasStub {
  const fns = new Map<string, ReturnType<typeof vi.fn>>();
  const props: Record<string, unknown> = {};
  const target = {
    texts: () => (fns.get("fillText")?.mock.calls ?? []).map((c) => String(c[0])),
  } as CanvasStub;
  return new Proxy(target, {
    get(t, key: string) {
      if (key === "texts") return t.texts;
      if (key in props) return props[key];
      if (!fns.has(key)) fns.set(key, vi.fn());
      return fns.get(key);
    },
    set(_t, key: string, value) {
      props[key] = value;
      return true;
    },
  });
}

/** Renders index.html's body into the document and stubs every 2D context. */
export function mountApp(): { canvases: Map<string, CanvasStub> } {
  document.body.innerHTML = bodyMarkup;
  // Script tags do not run when set through innerHTML; drop them for clarity.
  for (const s of document.querySelectorAll("script")) s.remove();
  const canvases = new Map<string, CanvasStub>();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (
    this: HTMLCanvasElement,
    kind: string,
  ) {
    if (kind !== "2d") return null;
    const id = this.id || "anonymous";
    if (!canvases.has(id)) canvases.set(id, createCanvasStub());
    return canvases.get(id) as unknown as CanvasRenderingContext2D;
  });
  return { canvases };
}

export function byId<T extends HTMLElement = HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing from index.html`);
  return el as T;
}

/** Dispatches a keydown on window the way the browser would for `code`. */
export function pressKey(
  code: string,
  init: { shiftKey?: boolean; repeat?: boolean } = {},
): KeyboardEvent {
  const ev = new KeyboardEvent("keydown", {
    code,
    shiftKey: init.shiftKey ?? false,
    repeat: init.repeat ?? false,
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(ev);
  return ev;
}

export function isShown(el: HTMLElement): boolean {
  return el.classList.contains("show");
}
