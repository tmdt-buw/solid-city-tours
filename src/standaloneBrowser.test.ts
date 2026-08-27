import { describe, expect, it } from "vitest";

import { isSafariBrowser, markSafariBrowser } from "./standaloneBrowser";

const APPLE_VENDOR = "Apple Computer, Inc.";

describe("standalone Safari detection", () => {
  it.each([
    [
      "macOS Safari",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15",
      APPLE_VENDOR,
      true,
    ],
    [
      "iOS Safari",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
      APPLE_VENDOR,
      true,
    ],
    [
      "macOS Chrome",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      "Google Inc.",
      false,
    ],
    [
      "iOS Chrome",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0 Mobile/15E148 Safari/604.1",
      APPLE_VENDOR,
      false,
    ],
    [
      "iOS Firefox",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/129.0 Mobile/15E148 Safari/605.1.15",
      APPLE_VENDOR,
      false,
    ],
    [
      "iOS Edge",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) EdgiOS/128.0 Mobile/15E148 Safari/605.1.15",
      APPLE_VENDOR,
      false,
    ],
    [
      "iOS Opera",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) OPiOS/4.3 Mobile/15E148 Safari/9537.53",
      APPLE_VENDOR,
      false,
    ],
    [
      "Android browser",
      "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36",
      APPLE_VENDOR,
      false,
    ],
  ])("classifies %s", (_name, userAgent, vendor, expected) => {
    expect(isSafariBrowser({ userAgent, vendor })).toBe(expected);
  });

  it("marks and clears only the standalone document root", () => {
    document.documentElement.classList.remove("browser-safari");

    expect(
      markSafariBrowser(document, {
        vendor: APPLE_VENDOR,
        userAgent:
          "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/17.6 Safari/605.1.15",
      })
    ).toBe(true);
    expect(document.documentElement.classList.contains("browser-safari")).toBe(true);

    expect(
      markSafariBrowser(document, {
        vendor: "Google Inc.",
        userAgent:
          "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/128 Safari/537.36",
      })
    ).toBe(false);
    expect(document.documentElement.classList.contains("browser-safari")).toBe(false);
  });
});
