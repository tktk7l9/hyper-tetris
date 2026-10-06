import { describe, expect, it } from "vitest";
import rules from "../public/_headers?raw";
import html from "../index.html?raw";

// public/_headers is the only place security headers are set (static assets on
// Workers, no Worker script). Pin the posture: nothing inline or external runs
// (scripts and styles alike), and the only third party is the analytics beacon.
function block(path: string): Record<string, string> {
  const lines = rules.split("\n");
  const start = lines.indexOf(path);
  expect(start, `rule block for ${path}`).toBeGreaterThanOrEqual(0);
  const headers: Record<string, string> = {};
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith("  ")) break;
    const [name, ...rest] = line.trim().split(": ");
    headers[name] = rest.join(": ");
  }
  return headers;
}

describe("public/_headers", () => {
  const site = block("/*");
  const csp = site["Content-Security-Policy"];

  it("keeps script and style sources strict (no inline, no eval, no wildcard)", () => {
    expect(csp).toContain("script-src 'self' https://static.cloudflareinsights.com;");
    expect(csp).toContain("style-src 'self';");
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
  });

  it("allows no cross-origin fetch beyond analytics", () => {
    expect(csp).toContain("connect-src 'self' https://cloudflareinsights.com;");
    expect(csp).toContain("img-src 'self' data: blob:;");
    expect(csp).toContain("font-src 'self' data:;");
    expect(csp).toContain("worker-src 'self' blob:;");
  });

  it("locks framing, navigation and plugins", () => {
    for (const directive of [
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ]) {
      expect(csp).toContain(directive);
    }
    expect(site["X-Frame-Options"]).toBe("DENY");
  });

  it("sets the remaining hardening headers", () => {
    expect(site["X-Content-Type-Options"]).toBe("nosniff");
    expect(site["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(site["Strict-Transport-Security"]).toBe("max-age=63072000; includeSubDomains; preload");
    expect(site["Cross-Origin-Opener-Policy"]).toBe("same-origin");
    expect(site["Permissions-Policy"]).toBe("camera=(), microphone=(), geolocation=()");
  });

  it("caches hashed Vite assets as immutable", () => {
    expect(block("/assets/*")["Cache-Control"]).toBe("public, max-age=31536000, immutable");
  });
});

describe("index.html", () => {
  // style-src has no 'unsafe-inline', so an inline <style> block or a
  // style="" attribute would be silently dropped by the browser.
  it("carries no inline style block or style attributes", () => {
    expect(html).not.toMatch(/<style[\s>]/);
    expect(html).not.toMatch(/\sstyle=/);
  });

  it("loads only the module entry as script", () => {
    const scripts = html.match(/<script[^>]*>/g) ?? [];
    expect(scripts).toEqual(['<script type="module" src="/src/boot.ts">']);
  });
});
