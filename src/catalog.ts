import {
  discoverPublicDatasets,
  ensurePublicCatalogReadiness,
  getCatalogReadiness,
  getPublicRegistryPresets,
  publishPublicDataset,
  publishRestrictedDataset,
  removeDataset,
  updatePublicDataset,
} from "@hoelk-f/semantic-data-catalog/catalog-api";
import {
  addUrl,
  createThing,
  getSolidDataset,
  getStringByLocaleAll,
  getStringEnglish,
  getStringNoLocale,
  getThing,
  getThingAll,
  getUrl,
  getUrlAll,
  removeAll,
  saveSolidDatasetAt,
  setStringNoLocale,
  setThing,
  setUrl,
} from "@inrupt/solid-client";
import {
  ROUTE_TEMPLATE_IDENTIFIER_PREFIX,
  ROUTE_TEMPLATE_THEME,
  catalogedRouteFromSnapshot,
  parseRouteTemplateSnapshot,
  type CatalogedRoute,
  type RouteTemplateSnapshot,
} from "./routeTemplates";

type SolidFetch = typeof fetch;

type CatalogSession = {
  info: { isLoggedIn: boolean; webId: string };
  fetch: SolidFetch;
};

const catalogSession = (webId: string, fetcher: SolidFetch): CatalogSession => ({
  info: { isLoggedIn: true, webId },
  fetch: fetcher,
});

const FOAF_NAME = "http://xmlns.com/foaf/0.1/name";
const VCARD_FN = "http://www.w3.org/2006/vcard/ns#fn";
const VCARD_HAS_EMAIL = "http://www.w3.org/2006/vcard/ns#hasEmail";
const VCARD_EMAIL = "http://www.w3.org/2006/vcard/ns#email";
const VCARD_VALUE = "http://www.w3.org/2006/vcard/ns#value";
const VCARD_TYPE = "http://www.w3.org/2006/vcard/ns#type";

const normalizeProfileEmail = (value: string): string => {
  const normalized = value.trim().replace(/^mailto:/i, "");
  if (!normalized || normalized.includes(":") || /\s/.test(normalized)) return "";
  const at = normalized.indexOf("@");
  if (at <= 0 || at !== normalized.lastIndexOf("@") || at === normalized.length - 1) {
    return "";
  }
  return normalized;
};

const profileString = (
  thing: NonNullable<ReturnType<typeof getThing>>,
  predicate: string
): string => {
  const direct = getStringNoLocale(thing, predicate) || getStringEnglish(thing, predicate);
  if (direct) return direct;
  for (const values of getStringByLocaleAll(thing, predicate).values()) {
    if (values[0]) return values[0];
  }
  return "";
};

export type CatalogProfileMetadata = {
  publisher: string;
  contactEmail: string;
};

const normalizePublisher = (value: string): string => {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > 160 || /[\u0000-\u001f\u007f]/.test(normalized)) {
    return "";
  }
  return normalized;
};

const profileEmail = (
  profileDataset: Awaited<ReturnType<typeof getSolidDataset>>,
  profile: NonNullable<ReturnType<typeof getThing>>
): string => {
  // Match the Profile Manager's supported Solid/vCard representations. A
  // vcard:hasEmail value can either be mailto: directly or reference an email
  // Thing whose vcard:value is the mailto: IRI. Older profiles can use the
  // direct vcard:email predicate instead.
  for (const emailReference of getUrlAll(profile, VCARD_HAS_EMAIL) || []) {
    if (emailReference.toLowerCase().startsWith("mailto:")) {
      const email = normalizeProfileEmail(emailReference);
      if (email) return email;
      continue;
    }

    // solid-client resolves a profile reference such as <#email-1> against
    // the profile document before returning it from getUrlAll.
    const emailThing = getThing(profileDataset, emailReference);
    const email = emailThing
      ? normalizeProfileEmail(getUrl(emailThing, VCARD_VALUE) || "")
      : "";
    if (email) return email;
  }

  for (const directEmail of getUrlAll(profile, VCARD_EMAIL) || []) {
    const email = normalizeProfileEmail(directEmail);
    if (email) return email;
  }

  return "";
};

export async function loadCatalogProfileMetadata(
  webId: string,
  fetcher: SolidFetch
): Promise<CatalogProfileMetadata> {
  const fallback = { publisher: "", contactEmail: "" };
  try {
    const profileDataset = await getSolidDataset(webId.split("#")[0], { fetch: fetcher });
    const profile =
      getThing(profileDataset, webId) ||
      getThingAll(profileDataset).find((thing) => thing.url === webId);
    if (!profile) return fallback;
    const publisher = normalizePublisher(
      profileString(profile, VCARD_FN) || profileString(profile, FOAF_NAME)
    );
    const contactEmail = profileEmail(profileDataset, profile);
    return { publisher, contactEmail };
  } catch {
    return fallback;
  }
}

export async function saveCatalogProfileMetadata({
  webId,
  publisher,
  contactEmail,
  fetcher,
}: {
  webId: string;
  publisher: string;
  contactEmail: string;
  fetcher: SolidFetch;
}): Promise<CatalogProfileMetadata> {
  const normalizedPublisher = normalizePublisher(publisher);
  const normalizedEmail = normalizeProfileEmail(contactEmail);
  if (!normalizedPublisher) throw new Error("Der öffentliche Publisher-Name ist ungültig.");
  if (!normalizedEmail || normalizedEmail.length > 254) {
    throw new Error("Die öffentliche Kontakt-E-Mail ist ungültig.");
  }

  const current = await loadCatalogProfileMetadata(webId, fetcher);
  if (
    current.publisher === normalizedPublisher &&
    current.contactEmail === normalizedEmail
  ) {
    return current;
  }

  const profileUrl = webId.split("#")[0];
  let profileDataset = await getSolidDataset(profileUrl, { fetch: fetcher });
  let profile =
    getThing(profileDataset, webId) ||
    getThingAll(profileDataset).find((thing) => thing.url === webId) ||
    createThing({ url: webId });
  profile = removeAll(profile, VCARD_FN);
  profile = setStringNoLocale(profile, VCARD_FN, normalizedPublisher);
  profile = removeAll(profile, VCARD_HAS_EMAIL);
  profile = removeAll(profile, VCARD_EMAIL);

  const emailNodeUrl = `${profileUrl}#email-solid-tours-${crypto.randomUUID()}`;
  let emailNode = createThing({ url: emailNodeUrl });
  emailNode = setUrl(emailNode, VCARD_VALUE, `mailto:${normalizedEmail}`);
  emailNode = setStringNoLocale(emailNode, VCARD_TYPE, "Work");
  profileDataset = setThing(profileDataset, emailNode);
  profile = addUrl(profile, VCARD_HAS_EMAIL, emailNodeUrl);
  profileDataset = setThing(profileDataset, profile);
  await saveSolidDatasetAt(profileUrl, profileDataset, { fetch: fetcher });

  const verified = await loadCatalogProfileMetadata(webId, fetcher);
  if (
    verified.publisher !== normalizedPublisher ||
    verified.contactEmail !== normalizedEmail
  ) {
    throw new Error("Die öffentlichen Profilmetadaten konnten nicht verifiziert werden.");
  }
  return verified;
}

const requireCatalogProfileMetadata = (
  profile: CatalogProfileMetadata
): CatalogProfileMetadata => {
  if (!profile.publisher || !profile.contactEmail) {
    throw new Error(
      "Für öffentliche Katalogeinträge müssen im Solid-Profil ein Publisher-Name und eine Kontakt-E-Mail hinterlegt sein."
    );
  }
  return profile;
};

export type CatalogPublication = {
  datasetIdentifier: string;
  catalogDatasetUrl: string;
  catalogRecordUrl?: string;
};

export function catalogPublicationReference(
  podRoot: string,
  scenarioRunId: string
): Pick<CatalogPublication, "datasetIdentifier" | "catalogDatasetUrl"> {
  const normalizedPodRoot = podRoot.endsWith("/") ? podRoot : `${podRoot}/`;
  const datasetIdentifier = `solid-tours-activity-${scenarioRunId}`;
  return {
    datasetIdentifier,
    catalogDatasetUrl: `${normalizedPodRoot}catalog/ds/${datasetIdentifier}.ttl#it`,
  };
}

export async function publishCatalogEntry({
  podRoot,
  webId,
  scenarioRunId,
  resourceUrl,
  fetcher,
}: {
  podRoot?: string;
  webId: string;
  scenarioRunId: string;
  resourceUrl: string;
  fetcher: SolidFetch;
}): Promise<CatalogPublication> {
  const datasetIdentifier = `solid-tours-activity-${scenarioRunId}`;
  const profile = requireCatalogProfileMetadata(
    await loadCatalogProfileMetadata(webId, fetcher)
  );
  let result: Awaited<ReturnType<typeof publishRestrictedDataset>>;
  try {
    result = await publishRestrictedDataset(catalogSession(webId, fetcher), {
      // Newer Catalog API versions can use the resolved storage root directly.
      // Older versions ignore this extension, but City Tours no longer rejects
      // valid WebID/Pod layouts before giving the Catalog API a chance to work.
      podRoot,
      identifier: datasetIdentifier,
      title: "Completed tours health-data donation",
      description:
        "Restricted City Tours routes with their derived activity summaries.",
      distributionUrl: resourceUrl,
      mediaType: "application/geo+json",
      publisher: profile.publisher,
      publisherWebId: webId,
      contactPoint: profile.contactEmail,
      creatorWebId: webId,
      includeCreator: true,
      theme: "mobility",
      // The worker discovers donors through Dataspace registries. Publishing
      // without one would create an apparently successful but unreachable run.
      requireDiscoverableRegistry: true,
    });
  } catch (error) {
    if ((error as { code?: string })?.code === "discoverable-registry-required") {
      throw new Error(
        "Für die Gesundheitsdatenspende muss im Solid-Profil eine öffentliche Dataspace-Registry konfiguriert sein."
      );
    }
    throw error;
  }
  return {
    datasetIdentifier,
    catalogDatasetUrl: result.datasetUrl,
    catalogRecordUrl: result.recordUrl,
  };
}

export async function removeCatalogEntry({
  podRoot,
  webId,
  datasetIdentifier,
  catalogDatasetUrl,
  fetcher,
}: {
  podRoot?: string;
  webId: string;
  datasetIdentifier: string;
  catalogDatasetUrl?: string;
  fetcher: SolidFetch;
}): Promise<void> {
  await removeDataset(catalogSession(webId, fetcher), {
    identifier: datasetIdentifier,
    datasetUrl: catalogDatasetUrl,
    podRoot,
  });
}

const ROUTE_TEMPLATE_MEDIA_TYPE = "application/geo+json";
const ROUTE_TEMPLATE_MAX_BYTES = 2 * 1024 * 1024;
const ROUTE_TEMPLATE_FETCH_TIMEOUT_MS = 8_000;
export const MAX_CATALOG_ROUTE_CANDIDATES = 50;
export const CATALOG_ROUTE_FETCH_CONCURRENCY = 6;

export type CatalogRouteDiscoveryFailure = {
  code: "invalid-catalog-url" | "route-template-rejected";
  identifier: string;
  datasetUrl: string;
  distributionUrl: string;
  message: string;
};

export type CatalogRouteDiscoveryReport = {
  candidateCount: number;
  processedCount: number;
  truncatedCount: number;
  failures: readonly CatalogRouteDiscoveryFailure[];
};

export type CatalogedRouteDiscovery = CatalogedRoute[] & {
  readonly discoveryReport: CatalogRouteDiscoveryReport;
};

const loopbackHost = (hostname: string): boolean =>
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname === "[::1]" ||
  hostname === "::1";

const currentApplicationOrigin = (): string | undefined => {
  if (typeof globalThis.location === "undefined") return undefined;
  return globalThis.location.origin;
};

const loopbackApplicationOrigin = (origin: string | undefined): boolean => {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password &&
      loopbackHost(url.hostname)
    );
  } catch {
    return false;
  }
};

const publicRouteUrl = (
  value: string,
  label: string,
  applicationOrigin: string | undefined
): URL => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} ist ungültig.`);
  }
  const localHttp =
    url.protocol === "http:" &&
    loopbackHost(url.hostname) &&
    loopbackApplicationOrigin(applicationOrigin);
  if (
    (url.protocol !== "https:" && !localHttp) ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new Error(`${label} ist nicht als öffentliche HTTPS-Resource zulässig.`);
  }
  return url;
};

async function loadPublicRouteTemplate(
  distributionUrl: string,
  expectedIdentifier: string,
  anonymousFetch: SolidFetch,
  applicationOrigin: string | undefined
): Promise<RouteTemplateSnapshot> {
  const url = publicRouteUrl(
    distributionUrl,
    "Die Routenvorlagen-URL",
    applicationOrigin
  );
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ROUTE_TEMPLATE_FETCH_TIMEOUT_MS);
  try {
    const response = await anonymousFetch(url.href, {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
      headers: { Accept: ROUTE_TEMPLATE_MEDIA_TYPE },
    });
    if (response.url && new URL(response.url).href !== url.href) {
      throw new Error("Die Routenvorlage antwortete für ein anderes Ziel.");
    }
    if (!response.ok) {
      throw new Error(`Die Routenvorlage konnte nicht geladen werden (${response.status}).`);
    }
    const contentLength = Number(response.headers.get("Content-Length") || "0");
    if (Number.isFinite(contentLength) && contentLength > ROUTE_TEMPLATE_MAX_BYTES) {
      throw new Error("Die Routenvorlage ist größer als 2 MiB.");
    }
    const contentType = response.headers.get("Content-Type")?.toLowerCase() || "";
    if (
      contentType &&
      !contentType.includes("application/geo+json") &&
      !contentType.includes("application/json")
    ) {
      throw new Error("Die Routenvorlage besitzt keinen unterstützten GeoJSON-Medientyp.");
    }
    const body = await response.text();
    if (new TextEncoder().encode(body).byteLength > ROUTE_TEMPLATE_MAX_BYTES) {
      throw new Error("Die Routenvorlage ist größer als 2 MiB.");
    }
    return parseRouteTemplateSnapshot(JSON.parse(body), expectedIdentifier);
  } finally {
    clearTimeout(timeout);
  }
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index], index);
    }
  };
  const workerCount = Math.min(Math.max(1, concurrency), values.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

const failureMessage = (reason: unknown): string =>
  reason instanceof Error && reason.message
    ? reason.message
    : "Die Routenvorlage konnte nicht sicher verarbeitet werden.";

const attachDiscoveryReport = (
  routes: CatalogedRoute[],
  report: CatalogRouteDiscoveryReport
): CatalogedRouteDiscovery => {
  const immutableReport = Object.freeze({
    ...report,
    failures: Object.freeze(report.failures.map((failure) => Object.freeze({ ...failure }))),
  });
  Object.defineProperty(routes, "discoveryReport", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: immutableReport,
  });
  return routes as CatalogedRouteDiscovery;
};

export function getCatalogedRouteDiscoveryReport(
  routes: readonly CatalogedRoute[]
): CatalogRouteDiscoveryReport | null {
  return (
    routes as Partial<Pick<CatalogedRouteDiscovery, "discoveryReport">>
  ).discoveryReport || null;
}

export async function loadRouteCatalogReadiness({
  podRoot,
  webId,
  fetcher,
}: {
  podRoot?: string;
  webId: string;
  fetcher: SolidFetch;
}) {
  return getCatalogReadiness(catalogSession(webId, fetcher), { podRoot });
}

export type PublicRegistryOption = {
  id: string;
  label: string;
  url: string;
};

export function loadPublicRegistryOptions(): PublicRegistryOption[] {
  return getPublicRegistryPresets();
}

export async function ensureRouteCatalogReadiness({
  podRoot,
  webId,
  registryUrl,
  fetcher,
}: {
  podRoot?: string;
  webId: string;
  registryUrl: string;
  fetcher: SolidFetch;
}) {
  return ensurePublicCatalogReadiness(catalogSession(webId, fetcher), {
    podRoot,
    registryUrl,
    catalogTitle: "City Tours Catalog",
  });
}

export async function publishRouteTemplateCatalogEntry({
  podRoot,
  webId,
  snapshot,
  resourceUrl,
  fetcher,
}: {
  podRoot?: string;
  webId: string;
  snapshot: RouteTemplateSnapshot;
  resourceUrl: string;
  fetcher: SolidFetch;
}): Promise<CatalogPublication> {
  const profile = requireCatalogProfileMetadata(
    await loadCatalogProfileMetadata(webId, fetcher)
  );
  const datasetIdentifier = `${ROUTE_TEMPLATE_IDENTIFIER_PREFIX}${snapshot.properties.routeTemplateId}`;
  const result = await publishPublicDataset(catalogSession(webId, fetcher), {
    podRoot,
    identifier: datasetIdentifier,
    title: snapshot.properties.name,
    description: "Public reusable route template from City Tours.",
    distributionUrl: resourceUrl,
    mediaType: ROUTE_TEMPLATE_MEDIA_TYPE,
    publisher: profile.publisher,
    publisherWebId: webId,
    contactPoint: profile.contactEmail,
    creatorWebId: webId,
    includeCreator: true,
    theme: ROUTE_TEMPLATE_THEME,
    requireDiscoverableRegistry: true,
  });
  return {
    datasetIdentifier,
    catalogDatasetUrl: result.datasetUrl,
    catalogRecordUrl: result.recordUrl,
  };
}

export async function updateRouteTemplateCatalogEntry({
  podRoot,
  webId,
  snapshot,
  resourceUrl,
  catalogDatasetUrl,
  publishedAt,
  operationId,
  fetcher,
}: {
  podRoot?: string;
  webId: string;
  snapshot: RouteTemplateSnapshot;
  resourceUrl: string;
  catalogDatasetUrl: string;
  publishedAt: string;
  operationId: string;
  fetcher: SolidFetch;
}): Promise<CatalogPublication> {
  const profile = requireCatalogProfileMetadata(
    await loadCatalogProfileMetadata(webId, fetcher)
  );
  const datasetIdentifier = `${ROUTE_TEMPLATE_IDENTIFIER_PREFIX}${snapshot.properties.routeTemplateId}`;
  const result = await updatePublicDataset(catalogSession(webId, fetcher), {
    podRoot,
    datasetUrl: catalogDatasetUrl,
    issued: publishedAt,
    operationId,
    identifier: datasetIdentifier,
    title: snapshot.properties.name,
    description: "Public reusable route template from City Tours.",
    distributionUrl: resourceUrl,
    mediaType: ROUTE_TEMPLATE_MEDIA_TYPE,
    publisher: profile.publisher,
    publisherWebId: webId,
    contactPoint: profile.contactEmail,
    creatorWebId: webId,
    includeCreator: true,
    theme: ROUTE_TEMPLATE_THEME,
    requireDiscoverableRegistry: true,
  });
  if (result.datasetUrl !== catalogDatasetUrl) {
    throw new Error("Der Katalog antwortete mit einer unerwarteten Routenvorlagen-Referenz.");
  }
  return {
    datasetIdentifier,
    catalogDatasetUrl: result.datasetUrl,
    catalogRecordUrl: result.recordUrl,
  };
}

export async function discoverCatalogedRoutes({
  podRoot,
  webId,
  fetcher,
  anonymousFetch = fetch,
  applicationOrigin = currentApplicationOrigin(),
}: {
  podRoot?: string;
  webId: string;
  fetcher: SolidFetch;
  anonymousFetch?: SolidFetch;
  applicationOrigin?: string;
}): Promise<CatalogedRouteDiscovery> {
  const metadata = await discoverPublicDatasets(catalogSession(webId, fetcher), {
    podRoot,
    identifierPrefix: ROUTE_TEMPLATE_IDENTIFIER_PREFIX,
    mediaType: ROUTE_TEMPLATE_MEDIA_TYPE,
    theme: ROUTE_TEMPLATE_THEME,
  });
  const candidates = metadata.slice(0, MAX_CATALOG_ROUTE_CANDIDATES);
  const discovered = await mapWithConcurrency(
    candidates,
    CATALOG_ROUTE_FETCH_CONCURRENCY,
    async (entry): Promise<
      | { route: CatalogedRoute; failure?: never }
      | { route?: never; failure: CatalogRouteDiscoveryFailure }
    > => {
      try {
        publicRouteUrl(
          entry.datasetUrl.split("#")[0],
          "Die Katalog-URL",
          applicationOrigin
        );
      } catch (reason) {
        return {
          failure: {
            code: "invalid-catalog-url",
            identifier: entry.identifier,
            datasetUrl: entry.datasetUrl,
            distributionUrl: entry.distributionUrl,
            message: failureMessage(reason),
          },
        };
      }
      try {
        const snapshot = await loadPublicRouteTemplate(
          entry.distributionUrl,
          entry.identifier,
          anonymousFetch,
          applicationOrigin
        );
        return {
          route: catalogedRouteFromSnapshot(
            {
              identifier: entry.identifier,
              description: entry.description,
              publisher: entry.publisher,
              ...(entry.creatorWebId ? { creatorWebId: entry.creatorWebId } : {}),
              datasetUrl: entry.datasetUrl,
              distributionUrl: entry.distributionUrl,
            },
            snapshot
          ),
        };
      } catch (reason) {
        return {
          failure: {
            code: "route-template-rejected",
            identifier: entry.identifier,
            datasetUrl: entry.datasetUrl,
            distributionUrl: entry.distributionUrl,
            message: failureMessage(reason),
          },
        };
      }
    }
  );
  const unique = new Map<string, CatalogedRoute>();
  const failures: CatalogRouteDiscoveryFailure[] = [];
  for (const result of discovered) {
    if (result.route) unique.set(result.route.datasetUrl, result.route);
    else failures.push(result.failure);
  }
  const routes = [...unique.values()].sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
  );
  return attachDiscoveryReport(routes, {
    candidateCount: metadata.length,
    processedCount: candidates.length,
    truncatedCount: metadata.length - candidates.length,
    failures,
  });
}
