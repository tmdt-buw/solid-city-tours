import { describe, expect, it } from "vitest";
import {
  datePlaceholder,
  formatDate,
  formatGermanDate,
  parseDate,
  parseGermanDate,
} from "./dateUtils";

describe("German date formatting", () => {
  it("formats strict ISO dates as DD.MM.YYYY", () => {
    expect(formatGermanDate("2026-08-21")).toBe("21.08.2026");
    expect(formatGermanDate("2000-02-29")).toBe("29.02.2000");
  });

  it("parses strict German dates as ISO dates", () => {
    expect(parseGermanDate("21.08.2026")).toBe("2026-08-21");
    expect(parseGermanDate("29.02.2024")).toBe("2024-02-29");
  });

  it.each([
    "2026-02-29",
    "1900-02-29",
    "2100-02-29",
    "2026-04-31",
    "2026-00-12",
    "2026-13-01",
    "2026-01-00",
    "0000-01-01",
    "2026-8-21",
    "21.08.2026",
    " 2026-08-21",
  ])("rejects invalid or non-strict ISO input %s", (value) => {
    expect(() => formatGermanDate(value)).toThrow(
      "Ungültiges Datum. Erwartet wird JJJJ-MM-TT mit einem existierenden Kalenderdatum."
    );
  });

  it.each([
    "29.02.2026",
    "29.02.1900",
    "31.04.2026",
    "00.08.2026",
    "21.00.2026",
    "21.13.2026",
    "01.01.0000",
    "2.08.2026",
    "21.8.2026",
    "2026-08-21",
    "21.08.2026 ",
  ])("rejects invalid or non-strict German input %s", (value) => {
    expect(() => parseGermanDate(value)).toThrow(
      "Ungültiges Datum. Erwartet wird TT.MM.JJJJ mit einem existierenden Kalenderdatum."
    );
  });

  it("handles Gregorian leap-year boundaries without JavaScript date rollover", () => {
    expect(formatGermanDate("2000-02-29")).toBe("29.02.2000");
    expect(parseGermanDate("28.02.1900")).toBe("1900-02-28");
    expect(() => parseGermanDate("29.02.1900")).toThrow(/Ungültiges Datum/);
  });
});

describe("localized date presentation", () => {
  it("preserves the required DD.MM.YYYY value format in both languages", () => {
    expect(formatDate("2026-08-21", "en")).toBe("21.08.2026");
    expect(formatDate("2026-08-21", "de")).toBe("21.08.2026");
    expect(parseDate("21.08.2026", "en")).toBe("2026-08-21");
    expect(parseDate("21.08.2026", "de")).toBe("2026-08-21");
    expect(datePlaceholder("en")).toBe("DD.MM.YYYY");
    expect(datePlaceholder("de")).toBe("TT.MM.JJJJ");
  });
});
