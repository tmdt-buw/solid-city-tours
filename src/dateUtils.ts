import type { ToursLanguage } from "./i18n";

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const GERMAN_DATE_PATTERN = /^(\d{2})\.(\d{2})\.(\d{4})$/;

const invalidDate = (expectedFormat: "JJJJ-MM-TT" | "TT.MM.JJJJ"): Error =>
  new Error(`Ungültiges Datum. Erwartet wird ${expectedFormat} mit einem existierenden Kalenderdatum.`);

const isLeapYear = (year: number): boolean =>
  year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);

const daysInMonth = (year: number, month: number): number => {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
};

const isRealCalendarDate = (year: number, month: number, day: number): boolean =>
  Number.isInteger(year) &&
  Number.isInteger(month) &&
  Number.isInteger(day) &&
  year >= 1 &&
  year <= 9999 &&
  month >= 1 &&
  month <= 12 &&
  day >= 1 &&
  day <= daysInMonth(year, month);

/** Formats a strict ISO calendar date (YYYY-MM-DD) as DD.MM.YYYY. */
export function formatGermanDate(isoDate: string): string {
  const match = ISO_DATE_PATTERN.exec(isoDate);
  if (!match) throw invalidDate("JJJJ-MM-TT");

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!isRealCalendarDate(year, month, day)) throw invalidDate("JJJJ-MM-TT");

  return `${dayText}.${monthText}.${yearText}`;
}

/** Parses a strict German calendar date (DD.MM.YYYY) as YYYY-MM-DD. */
export function parseGermanDate(germanDate: string): string {
  const match = GERMAN_DATE_PATTERN.exec(germanDate);
  if (!match) throw invalidDate("TT.MM.JJJJ");

  const [, dayText, monthText, yearText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!isRealCalendarDate(year, month, day)) throw invalidDate("TT.MM.JJJJ");

  return `${yearText}-${monthText}-${dayText}`;
}

/** Keeps the product's explicit DD.MM.YYYY presentation in English as well. */
export function formatEnglishDate(isoDate: string): string {
  return formatGermanDate(isoDate);
}

/** Parses the product's language-independent DD.MM.YYYY input. */
export function parseEnglishDate(englishDate: string): string {
  try {
    return parseGermanDate(englishDate);
  } catch {
    throw new Error("Invalid date. Enter an existing calendar date in DD.MM.YYYY format.");
  }
}

export const datePlaceholder = (language: ToursLanguage): string =>
  language === "de" ? "TT.MM.JJJJ" : "DD.MM.YYYY";

export const formatDate = (isoDate: string, language: ToursLanguage): string =>
  language === "de" ? formatGermanDate(isoDate) : formatEnglishDate(isoDate);

export const parseDate = (date: string, language: ToursLanguage): string =>
  language === "de" ? parseGermanDate(date) : parseEnglishDate(date);
