import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Solid Tours embed styles", () => {
  it("keeps every application selector inside the Solid Tours root", () => {
    const css = readFileSync(resolve(process.cwd(), "src/App.css"), "utf8").replace(
      /\/\*[\s\S]*?\*\//g,
      ""
    );
    const selectors = [...css.matchAll(/([^{}]+)\{/g)]
      .map((match) => match[1].trim())
      .filter(
        (selector) =>
          !selector.startsWith("@") &&
          selector !== "from" &&
          selector !== "to" &&
          !/^\d+(?:\.\d+)?%$/.test(selector)
      )
      .flatMap((selector) => selector.split(",").map((part) => part.trim()));

    expect(selectors.length).toBeGreaterThan(0);
    expect(selectors.every((selector) => selector.startsWith(".solid-tours-app"))).toBe(true);
  });

  it("keeps the Manager embed inside its viewport while retaining planner scrolling", () => {
    const css = readFileSync(resolve(process.cwd(), "src/App.css"), "utf8");

    expect(css).toMatch(
      /\.solid-tours-app--embedded \.route-workspace\s*\{[^}]*height:\s*calc\(var\(--dataspace-scaled-vh, 100vh\) - 230px\)/s
    );
    expect(css).toMatch(
      /\.solid-tours-app--embedded:not\(\.solid-tours-app--modal-open\)\s*\{[^}]*overflow:\s*clip/s
    );
    expect(css).toMatch(
      /\.solid-tours-app \.planner-scroll\s*\{[^}]*height:\s*100%[^}]*overflow-y:\s*auto/s
    );
  });

  it("uses the stack's desktop scale only for the standalone application", () => {
    const css = readFileSync(resolve(process.cwd(), "src/App.css"), "utf8").replace(
      /\/\*[\s\S]*?\*\//g,
      ""
    );

    expect(css).toMatch(/@media\s*\(min-width:\s*900px\)/);
    expect(css).toMatch(
      /\.solid-tours-app--standalone\s*\{[^}]*--solid-tours-standalone-scale:\s*\.7[^}]*--dataspace-scaled-vw:\s*calc\(100vw\s*\/\s*var\(--solid-tours-standalone-scale\)\)[^}]*--dataspace-scaled-vh:\s*calc\(100dvh\s*\/\s*var\(--solid-tours-standalone-scale\)\)[^}]*height:\s*var\(--dataspace-scaled-vh\)[^}]*zoom:\s*var\(--solid-tours-standalone-scale\)/s
    );
    expect(css).toMatch(
      /\.solid-tours-app--standalone\.solid-tours-app--loading,\s*\.solid-tours-app--standalone \.tours-loading\s*\{[^}]*min-height:\s*var\(--dataspace-scaled-vh\)/s
    );

    const embeddedDeclarations = [
      ...css.matchAll(/\.solid-tours-app--embedded[^,{]*\{([^}]*)\}/g),
    ].map((match) => match[1]);
    expect(embeddedDeclarations.length).toBeGreaterThan(0);
    expect(embeddedDeclarations.every((declarations) => !/\bzoom\s*:/.test(declarations))).toBe(
      true
    );
  });

  it("keeps the completion journey scoped and provides a reduced-motion fallback", () => {
    const css = readFileSync(resolve(process.cwd(), "src/App.css"), "utf8");

    expect(css).toMatch(
      /\.solid-tours-app \.completion-traveller\s*\{[^}]*animation:\s*solid-tours-completion-travel/s
    );
    expect(css).toMatch(
      /\.solid-tours-app \.completion-progress-rail > span\s*\{[^}]*animation:\s*solid-tours-completion-progress/s
    );
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    expect(css).toMatch(
      /\.solid-tours-app \.completion-traveller[^}]*\{[^}]*animation:\s*none/s
    );
  });

  it("keeps the planner and map as adjacent panes inside one clipped workspace", () => {
    const css = readFileSync(resolve(process.cwd(), "src/App.css"), "utf8");

    expect(css).toMatch(
      /\.solid-tours-app \.route-workspace\s*\{[^}]*display:\s*flex[^}]*position:\s*relative[^}]*isolation:\s*isolate[^}]*overflow:\s*hidden[^}]*padding:\s*12px[^}]*border-radius:\s*22px/s
    );
    expect(css).toMatch(
      /\.solid-tours-app \.map-stage\s*\{[^}]*height:\s*100%[^}]*flex:\s*1 1 auto[^}]*position:\s*relative/s
    );
    expect(css).toMatch(
      /\.solid-tours-app \.planner-panel\s*\{[^}]*width:\s*360px[^}]*flex:\s*0 0 360px[^}]*overflow:\s*hidden[^}]*border-right:/s
    );
    expect(css).not.toMatch(/\.solid-tours-app \.planner-panel\s*\{[^}]*(?:position:\s*absolute|backdrop-filter|box-shadow)/s);
    expect(css).toMatch(
      /\.solid-tours-app \.map-stats\s*\{[^}]*left:\s*64px/s
    );
    expect(css).toMatch(
      /\.solid-tours-app \.map-edit-toolbar\s*\{[^}]*left:\s*14px/s
    );
    expect(css).toMatch(
      /\.solid-tours-app--standalone\s*\{[^}]*height:\s*100dvh[^}]*overflow:\s*hidden/s
    );
    expect(css).not.toContain("--planner-overlay-width");
    expect(css).not.toContain("--planner-content-offset");
  });
});
