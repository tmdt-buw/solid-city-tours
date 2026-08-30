export type SolidToursOnboardingContext = "embedded" | "standalone";

export type SolidToursOnboardingRecord = {
  schemaVersion: 2;
  app: "solid-tours";
  appSpecificAcceptedAt: string;
  publicPublishingAcceptedAt: string;
  publicRegistryUrl: string;
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
export function parseSolidToursOnboardingRecord(
  input: unknown
): SolidToursOnboardingRecord | null {
  const value = input as Record<string, unknown> | null;
  if (
    !value ||
    value.schemaVersion !== 2 ||
    value.app !== "solid-tours" ||
    !validDateTime(value.appSpecificAcceptedAt) ||
    !validDateTime(value.publicPublishingAcceptedAt) ||
    !normalizePublicRegistryUrl(value.publicRegistryUrl) ||
    normalizePublicRegistryUrl(value.publicRegistryUrl) !== value.publicRegistryUrl ||
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
    schemaVersion: 2,
    app: "solid-tours",
    appSpecificAcceptedAt: value.appSpecificAcceptedAt,
    publicPublishingAcceptedAt: value.publicPublishingAcceptedAt,
    publicRegistryUrl: value.publicRegistryUrl,
    ...(value.standaloneAcceptedAt
      ? { standaloneAcceptedAt: value.standaloneAcceptedAt as string }
      : {}),
  };
}

export const onboardingCompleteFor = (
  record: SolidToursOnboardingRecord | null,
  context: SolidToursOnboardingContext
) =>
  Boolean(
    record?.appSpecificAcceptedAt &&
      record.publicPublishingAcceptedAt &&
      record.publicRegistryUrl &&
      (context === "embedded" || record.standaloneAcceptedAt)
  );

export function completeOnboardingRecord(
  current: SolidToursOnboardingRecord | null,
  context: SolidToursOnboardingContext,
  publicRegistryUrl: string,
  now = new Date().toISOString()
): SolidToursOnboardingRecord {
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
