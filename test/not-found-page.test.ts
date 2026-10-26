import page from "../public/404.html?raw";
import rules from "../public/_headers?raw";
import { describe, expect, it } from "vitest";

// wrangler.jsonc sets assets.not_found_handling = "404-page", so Workers serves
// public/404.html (copied into dist) with status 404 for every unknown path.
// Without it the response is an empty body that browsers may treat as a
// download, leaving the visitor with no page and no way back (SHIG 59, 60).
describe("public/404.html", () => {
  it("is a complete Japanese HTML document", () => {
    expect(page.startsWith("<!doctype html>")).toBe(true);
    expect(page).toMatch(/<html lang="ja">/);
    expect(page).toMatch(/<meta charset="utf-8">/);
    expect(page).toMatch(/<meta name="viewport" content="width=device-width, initial-scale=1">/);
    expect(page).toMatch(/<title>[^<]+<\/title>/);
  });

  it("says the page is missing and links back to the top page", () => {
    expect(page).toMatch(/<main>[\s\S]*<h1>ページが見つかりません<\/h1>[\s\S]*<\/main>/);
    expect(page).toMatch(/<a class="home" href="\/">[^<]+<\/a>/);
  });

  it("stays within the strict CSP: no inline style or script, only /404.css", () => {
    expect(page).not.toMatch(/<script/i);
    expect(page).not.toMatch(/<style/i);
    expect(page).not.toMatch(/\sstyle=/i);
    expect(page).not.toMatch(/\son[a-z]+=/i);
    expect(page).toMatch(/<link rel="stylesheet" href="\/404.css">/);
    expect(rules).toMatch(/^\/\*$/m);
  });
});
