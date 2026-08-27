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
    expect(
      selectors.every(
        (selector) =>
          selector.startsWith(".solid-tours-app") ||
          selector.startsWith(".browser-safari .solid-tours-app")
      )
    ).toBe(true);
  });

  it("keeps the Manager embed inside its viewport while retaining planner scrolling", () => {
    const css = readFileSync(resolve(process.cwd(), "src/App.css"), "utf8");

    expect(css).toMatch(
      /\.solid-tours-app--embedded \.route-workspace\s*\{[^}]*height:\s*calc\(var\(--dataspace-scaled-vh, 100vh\) - 230px\)/s
    );
    expect(css).toMatch(
      /\.solid-tours-app--embedded:not\(\.solid-tours-app--modal-open\)\s*\{[^}]*overflow:\s*hidden[^}]*overflow:\s*clip/s
    );
    expect(css).toMatch(
      /\.solid-tours-app \.planner-scroll\s*\{[^}]*height:\s*100%[^}]*overflow-y:\s*auto/s
    );
  });

  it("keeps zoom for other browsers and disables it only for Safari standalone roots", () => {
    const css = readFileSync(resolve(process.cwd(), "src/App.css"), "utf8").replace(
      /\/\*[\s\S]*?\*\//g,
      ""
    );
    const loginCss = readFileSync(
      resolve(process.cwd(), "src/StandaloneLogin.css"),
      "utf8"
    ).replace(/\/\*[\s\S]*?\*\//g, "");
    const standaloneCss = readFileSync(
      resolve(process.cwd(), "src/standalone.css"),
      "utf8"
    ).replace(/\/\*[\s\S]*?\*\//g, "");

    expect(css).toMatch(/@media\s*\(min-width:\s*900px\)/);
    expect(css).toMatch(
      /\.solid-tours-app--standalone\s*\{[^}]*--solid-tours-standalone-scale:\s*\.7[^}]*--dataspace-scaled-vw:\s*calc\(100vw\s*\/\s*var\(--solid-tours-standalone-scale\)\)[^}]*--dataspace-scaled-vh:\s*calc\(100vh\s*\/\s*var\(--solid-tours-standalone-scale\)\)[^}]*--dataspace-scaled-vh:\s*calc\(100dvh\s*\/\s*var\(--solid-tours-standalone-scale\)\)[^}]*width:\s*var\(--dataspace-scaled-vw\)[^}]*height:\s*var\(--dataspace-scaled-vh\)[^}]*zoom:\s*var\(--solid-tours-standalone-scale\)/s
    );
    expect(css).toMatch(
      /\.browser-safari \.solid-tours-app--standalone\s*\{[^}]*--dataspace-scaled-vw:\s*100vw[^}]*--dataspace-scaled-vh:\s*100vh[^}]*--dataspace-scaled-vh:\s*100dvh[^}]*width:\s*100vw[^}]*height:\s*100vh[^}]*height:\s*100dvh[^}]*zoom:\s*normal/s
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
    expect(css).not.toMatch(
      /(?:\.solid-tours-app--standalone|\.browser-safari \.solid-tours-app--standalone)\s*\{[^}]*transform:\s*scale\(/s
    );
    expect(loginCss).not.toMatch(
      /(?:\.solid-tours-login|\.browser-safari \.solid-tours-login)\s*\{[^}]*transform:\s*scale\(/s
    );
    expect(standaloneCss).not.toMatch(/(^|[;{]\s*)zoom\s*:/m);
    expect(loginCss).toMatch(
      /\.solid-tours-login\s*\{[^}]*--solid-tours-login-layout-height:\s*100vh[^}]*--solid-tours-login-layout-height:\s*100dvh/s
    );
    expect(loginCss).toMatch(
      /\.solid-tours-login\s*\{[^}]*--solid-tours-login-scale:\s*\.7[^}]*--solid-tours-login-layout-width:\s*calc\(100vw\s*\/\s*var\(--solid-tours-login-scale\)\)[^}]*--solid-tours-login-layout-height:\s*calc\(100vh\s*\/\s*var\(--solid-tours-login-scale\)\)[^}]*--solid-tours-login-layout-height:\s*calc\(100dvh\s*\/\s*var\(--solid-tours-login-scale\)\)[^}]*width:\s*var\(--solid-tours-login-layout-width\)[^}]*min-height:\s*var\(--solid-tours-login-layout-height\)[^}]*zoom:\s*var\(--solid-tours-login-scale\)/s
    );
    expect(loginCss).toMatch(
      /\.browser-safari \.solid-tours-login\s*\{[^}]*--solid-tours-login-layout-width:\s*100vw[^}]*--solid-tours-login-layout-height:\s*100vh[^}]*--solid-tours-login-layout-height:\s*100dvh[^}]*width:\s*100vw[^}]*height:\s*100vh[^}]*height:\s*100dvh[^}]*min-height:\s*100vh[^}]*min-height:\s*100dvh[^}]*padding:\s*0 20px[^}]*overflow-y:\s*auto[^}]*zoom:\s*normal/s
    );
    expect(standaloneCss).toMatch(
      /@media\s*\(min-width:\s*900px\)\s*\{[\s\S]*html,\s*body,\s*#root\s*\{[^}]*height:\s*var\(--solid-tours-viewport-height\)[^}]*overflow:\s*hidden/s
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
