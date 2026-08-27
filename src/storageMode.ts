export type ToursStorageMode = "local" | "solid-pod";

/**
 * Authenticated Solid identities use their own Pod. Browser-local storage is
 * reserved for sessions that do not have an authenticated WebID.
 */
export function hasSolidPodAccess(
  authenticatedWebId: string | null | undefined
): boolean {
  if (typeof authenticatedWebId !== "string" || authenticatedWebId.trim() !== authenticatedWebId) {
    return false;
  }
  try {
    const webId = new URL(authenticatedWebId);
    return (
      (webId.protocol === "https:" || webId.protocol === "http:") &&
      !webId.username &&
      !webId.password
    );
  } catch {
    return false;
  }
}

export function storageModeForIdentity(
  authenticatedWebId: string | null | undefined
): ToursStorageMode {
  return hasSolidPodAccess(authenticatedWebId) ? "solid-pod" : "local";
}
