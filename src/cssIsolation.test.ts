import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("City Tours embed styles", () => {
  it("keeps every application selector inside the City Tours root", () => {
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
          selector.startsWith(".city-tours-app") ||
          selector.startsWith(".browser-safari .city-tours-app")
      )
    ).toBe(true);
  });

  it("does not shrink text and targets with global viewport scaling", () => {
    for (const name of ["App.css", "StandaloneLogin.css", "standalone.css"]) {
      const css = readFileSync(resolve(process.cwd(), "src", name), "utf8");
      expect(css).not.toMatch(/zoom:\s*(?:\.7|0\.7|var\(--city-tours)/);
      expect(css).not.toMatch(/transform:\s*scale\(\.7/);
    }
  });

  it("keeps the completion journey scoped and provides a reduced-motion fallback", () => {
    const css = readFileSync(resolve(process.cwd(), "src/App.css"), "utf8");

    expect(css).toMatch(
      /\.city-tours-app \.completion-traveller\s*\{[^}]*animation:\s*city-tours-completion-travel/s
    );
    expect(css).toMatch(
      /\.city-tours-app \.completion-progress-rail > span\s*\{[^}]*animation:\s*city-tours-completion-progress/s
    );
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    expect(css).toMatch(
      /\.city-tours-app \.completion-traveller[^}]*\{[^}]*animation:\s*none/s
    );
  });

  it("keeps the boot loader scoped, indeterminate, and motion-safe", () => {
    const css = readFileSync(resolve(process.cwd(), "src/App.css"), "utf8");

    expect(css).toMatch(
      /\.city-tours-app \.tours-loading-rail > span\s*\{[^}]*animation:\s*city-tours-boot-progress/s
    );
    expect(css).toMatch(/@keyframes\s+city-tours-boot-progress/);
    expect(css).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.city-tours-app \.tours-loading-rail > span,[\s\S]*animation:\s*none/s
    );
  });

});
