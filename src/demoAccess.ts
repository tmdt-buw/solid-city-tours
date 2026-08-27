import {
  hasSolidPodAccess,
  storageModeForIdentity as storageModeForAuthenticatedIdentity,
  type ToursStorageMode,
} from "./storageMode";

export const DEFAULT_DEMO_WEB_ID =
  "https://solid-community-server.tmdt.info/sscon/profile/card#me";

export { hasSolidPodAccess };
export type { ToursStorageMode };

export type SolidToursRuntimeConfig = {
  demoWebId?: unknown;
};

declare global {
  interface Window {
    __SOLID_TOURS_CONFIG__?: SolidToursRuntimeConfig;
  }
}

export function validateDemoWebId(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw new Error("Die Demo-WebID-Konfiguration ist ungültig.");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Die Demo-WebID-Konfiguration ist ungültig.");
  }

  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash.length < 2 ||
    url.href !== value
  ) {
    throw new Error("Die Demo-WebID-Konfiguration ist ungültig.");
  }

  return value;
}

export function resolveDemoWebId(
  explicitWebId?: string | null,
  runtimeConfig: SolidToursRuntimeConfig | undefined =
    typeof window === "undefined" ? undefined : window.__SOLID_TOURS_CONFIG__
): string {
  const hasExplicitWebId = explicitWebId !== undefined && explicitWebId !== null;
  if (
    !hasExplicitWebId &&
    runtimeConfig !== undefined &&
    (runtimeConfig === null ||
      typeof runtimeConfig !== "object" ||
      Array.isArray(runtimeConfig) ||
      Object.keys(runtimeConfig).some((key) => key !== "demoWebId"))
  ) {
    throw new Error("Die Demo-WebID-Konfiguration ist ungültig.");
  }
  const configured =
    hasExplicitWebId ? explicitWebId : runtimeConfig?.demoWebId ?? DEFAULT_DEMO_WEB_ID;
  return validateDemoWebId(configured);
}

export function hasDemoPodAccess(
  authenticatedWebId: string | null | undefined,
  _configuredDemoWebId: string
): boolean {
  return hasSolidPodAccess(authenticatedWebId);
}

/** @deprecated Use storageModeForIdentity from ./storageMode. */
export function storageModeForIdentity(
  authenticatedWebId: string | null | undefined,
  _configuredDemoWebId?: string
): ToursStorageMode {
  return storageModeForAuthenticatedIdentity(authenticatedWebId);
}
