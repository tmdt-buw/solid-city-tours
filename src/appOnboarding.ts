export type CityToursOnboardingContext = "embedded" | "standalone";

export type CityToursOnboardingRecord = {
  schemaVersion: 2 | 3;
  app: "solid-tours";
  appSpecificAcceptedAt: string;
  publicPublishingAcceptedAt?: string;
  publicRegistryUrl?: string;
  standaloneAcceptedAt?: string;
};

const validDateTime = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
};

const normalizePublicRegistryUrl = (value: unknown): string => {
  if (typeof value !== "string" || value.trim() !== value) return "";
  try {
    const url = new URL(value);
    const localHttp =
      url.protocol === "http:" &&
      new Set(["localhost", "127.0.0.1", "[::1]"]).has(url.hostname);
    if (
      (url.protocol !== "https:" && !localHttp) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return "";
    }
    return url.href.replace(/\/+$/, "");
  } catch {
    return "";
  }
};

/**
 * `null` deliberately represents both a missing acknowledgement and an
 * unsupported or damaged record. Neither state grants access or provisions
 * storage: the UI must show the current onboarding again and can replace the
 * private record only after the user explicitly accepts it.
 */
export function parseCityToursOnboardingRecord(
  input: unknown
): CityToursOnboardingRecord | null {
  const value = input as Record<string, unknown> | null;
  if (
    !value ||
    (value.schemaVersion !== 2 && value.schemaVersion !== 3) ||
    value.app !== "solid-tours" ||
    !validDateTime(value.appSpecificAcceptedAt) ||
    (value.schemaVersion === 2 && (!value.publicPublishingAcceptedAt || !value.publicRegistryUrl)) ||
    ((value.publicPublishingAcceptedAt !== undefined || value.publicRegistryUrl !== undefined) && (
      !validDateTime(value.publicPublishingAcceptedAt) || !normalizePublicRegistryUrl(value.publicRegistryUrl) ||
      normalizePublicRegistryUrl(value.publicRegistryUrl) !== value.publicRegistryUrl
    )) ||
    (value.standaloneAcceptedAt !== undefined && !validDateTime(value.standaloneAcceptedAt)) ||
    Object.keys(value).some(
      (key) =>
        ![
          "schemaVersion",
          "app",
          "appSpecificAcceptedAt",
          "publicPublishingAcceptedAt",
          "publicRegistryUrl",
          "standaloneAcceptedAt",
        ].includes(key)
    )
  ) {
    return null;
  }
  return {
    schemaVersion: value.schemaVersion,
    app: "solid-tours",
    appSpecificAcceptedAt: value.appSpecificAcceptedAt,
    ...(value.publicPublishingAcceptedAt ? {
      publicPublishingAcceptedAt: value.publicPublishingAcceptedAt as string,
      publicRegistryUrl: value.publicRegistryUrl as string,
    } : {}),
    ...(value.standaloneAcceptedAt
      ? { standaloneAcceptedAt: value.standaloneAcceptedAt as string }
      : {}),
  };
}

export const onboardingCompleteFor = (
  record: CityToursOnboardingRecord | null,
  context: CityToursOnboardingContext
) =>
  Boolean(
    record?.appSpecificAcceptedAt &&
      record.publicPublishingAcceptedAt &&
      record.publicRegistryUrl &&
      (context === "embedded" || record.standaloneAcceptedAt)
  );

export function completeOnboardingRecord(
  current: CityToursOnboardingRecord | null,
  context: CityToursOnboardingContext,
  publicRegistryUrl: string,
  now = new Date().toISOString()
): CityToursOnboardingRecord {
  const registryUrl = normalizePublicRegistryUrl(publicRegistryUrl);
  if (!registryUrl) throw new Error("Die öffentliche Research-Registry ist ungültig.");
  if (!validDateTime(now)) throw new Error("Der Onboarding-Zeitpunkt ist ungültig.");
  return {
    schemaVersion: 2,
    app: "solid-tours",
    appSpecificAcceptedAt: current?.appSpecificAcceptedAt || now,
    publicPublishingAcceptedAt:
      current?.publicRegistryUrl === registryUrl
        ? current.publicPublishingAcceptedAt
        : now,
    publicRegistryUrl: registryUrl,
    ...(context === "standalone" || current?.standaloneAcceptedAt
      ? { standaloneAcceptedAt: current?.standaloneAcceptedAt || now }
      : {}),
  };
}

/** Private consent never implies registry registration, profile changes or publishing. */
export const privateOnboardingCompleteFor = (record: CityToursOnboardingRecord | null, context: CityToursOnboardingContext) =>
  Boolean(record?.appSpecificAcceptedAt && (context === "embedded" || record.standaloneAcceptedAt));

export function completePrivateOnboardingRecord(current: CityToursOnboardingRecord | null, context: CityToursOnboardingContext, now = new Date().toISOString()): CityToursOnboardingRecord {
  if (!validDateTime(now)) throw new Error("Der Onboarding-Zeitpunkt ist ungültig.");
  return {
    ...current,
    schemaVersion: current?.schemaVersion || 3,
    app: "solid-tours",
    appSpecificAcceptedAt: current?.appSpecificAcceptedAt || now,
    ...(context === "standalone" || current?.standaloneAcceptedAt ? { standaloneAcceptedAt: current?.standaloneAcceptedAt || now } : {}),
  };
}
