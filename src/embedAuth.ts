export type SolidFetch = typeof globalThis.fetch;

/**
 * Minimal host contract required by the embedded application. Keeping this
 * structural avoids coupling a host to City Tours' installed auth SDK copy.
 */
export type CityToursSession = {
  info?: {
    isLoggedIn?: boolean;
    webId?: string | null;
  };
  fetch: SolidFetch;
};
