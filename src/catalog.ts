import {
  publishRestrictedDataset,
  removeDataset,
} from "@hoelk-f/semantic-data-catalog/catalog-api";
import {
  getSolidDataset,
  getStringByLocaleAll,
  getStringEnglish,
  getStringNoLocale,
  getThing,
  getThingAll,
  getUrl,
  getUrlAll,
} from "@inrupt/solid-client";

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
  contactEmail?: string;
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
  const fallback = { publisher: "Solid Pod User" };
  try {
    const profileDataset = await getSolidDataset(webId.split("#")[0], { fetch: fetcher });
    const profile =
      getThing(profileDataset, webId) ||
      getThingAll(profileDataset).find((thing) => thing.url === webId);
    if (!profile) return fallback;
    const publisher = profileString(profile, FOAF_NAME) || profileString(profile, VCARD_FN);
    const contactEmail = profileEmail(profileDataset, profile);
    return {
      publisher: publisher || fallback.publisher,
      ...(contactEmail ? { contactEmail } : {}),
    };
  } catch {
    return fallback;
  }
}

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
  const profile = await loadCatalogProfileMetadata(webId, fetcher);
  let result: Awaited<ReturnType<typeof publishRestrictedDataset>>;
  try {
    result = await publishRestrictedDataset(catalogSession(webId, fetcher), {
      // Newer Catalog API versions can use the resolved storage root directly.
      // Older versions ignore this extension, but Solid Tours no longer rejects
      // valid WebID/Pod layouts before giving the Catalog API a chance to work.
      podRoot,
      identifier: datasetIdentifier,
      title: "Completed tours health-data donation",
      description:
        "Restricted Solid Tours routes with their derived activity summaries.",
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
