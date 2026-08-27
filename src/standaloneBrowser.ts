export type BrowserIdentity = Pick<Navigator, "userAgent" | "vendor">;

const SAFARI_EXCLUSIONS =
  /Chrome|Chromium|CriOS|FxiOS|EdgiOS|OPR|OPiOS|Android/i;

export const isSafariBrowser = ({ userAgent, vendor }: BrowserIdentity): boolean =>
  /Apple/i.test(vendor) &&
  /Safari/i.test(userAgent) &&
  !SAFARI_EXCLUSIONS.test(userAgent);

export const markSafariBrowser = (
  targetDocument: Pick<Document, "documentElement">,
  browser: BrowserIdentity
): boolean => {
  const safari = isSafariBrowser(browser);
  targetDocument.documentElement.classList.toggle("browser-safari", safari);
  return safari;
};
