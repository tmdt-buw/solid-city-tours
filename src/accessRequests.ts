import {
  createAclFromFallbackAcl,
  createContainerAt,
  createThing,
  getContainedResourceUrlAll,
  getFileWithAcl,
  getPublicResourceAccess,
  getResourceAcl,
  getSolidDataset,
  getSolidDatasetWithAcl,
  getStringNoLocale,
  getThing,
  getThingAll,
  getUrl,
  getUrlAll,
  hasAccessibleAcl,
  hasFallbackAcl,
  hasResourceAcl,
  removeAll,
  saveAclFor,
  saveSolidDatasetAt,
  setAgentResourceAccess,
  setDatetime,
  setStringNoLocale,
  setThing,
  setUrl,
  setPublicResourceAccess,
} from "@inrupt/solid-client";

type SolidFetch = typeof fetch;
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const LDP_INBOX = "http://www.w3.org/ns/ldp#inbox";
const SDM = "https://w3id.org/solid-dataspace-manager#";
const ACCESS_REQUEST = `${SDM}AccessRequest`;
const errorStatus = (error: any) => error?.statusCode || error?.response?.status || error?.status;

const noCache = (fetcher: SolidFetch): SolidFetch =>
  ((input: RequestInfo | URL, init: RequestInit = {}) =>
    fetcher(input, {
      ...init,
      cache: "no-store",
      headers: { ...(init.headers || {}), "Cache-Control": "no-cache" },
    })) as SolidFetch;

export async function resolveSolidInbox(
  webId: string,
  fetcher: SolidFetch
): Promise<string | null> {
  const profile = await getSolidDataset(webId, { fetch: fetcher });
  const person = getThing(profile, webId);
  return person ? getUrl(person, LDP_INBOX) : null;
}

const normalizePodRoot = (value: string): string => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Der private Solid Pod ist für die Inbox-Einrichtung nicht verfügbar.");
  }
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("Der private Solid Pod ist für die Inbox-Einrichtung nicht verfügbar.");
  }
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  return url.href;
};

const solidToursInboxContext = (webId: string, podRoot: string) => {
  let identity: URL;
  try {
    identity = new URL(webId);
  } catch {
    throw new Error("Die authentifizierte Solid-WebID ist ungültig.");
  }
  if (
    (identity.protocol !== "https:" && identity.protocol !== "http:") ||
    identity.username ||
    identity.password ||
    identity.search ||
    !identity.hash
  ) {
    throw new Error("Die authentifizierte Solid-WebID ist ungültig.");
  }
  return {
    inboxUrl: `${normalizePodRoot(podRoot)}inbox/`,
    profileUrl: webId.split("#")[0],
  };
};

const inboxAcl = async (inboxUrl: string, fetcher: SolidFetch) => {
  const resource = await getSolidDatasetWithAcl(inboxUrl, { fetch: fetcher });
  if (hasResourceAcl(resource)) {
    const acl = getResourceAcl(resource);
    if (acl) return { resource, acl };
  }
  if (hasAccessibleAcl(resource) && hasFallbackAcl(resource)) {
    return { resource, acl: createAclFromFallbackAcl(resource) };
  }
  throw new Error("Die Solid-Inbox-ACL ist nicht mit Control-Zugriff erreichbar.");
};

export async function getSolidToursInboxReadiness({
  webId,
  podRoot,
  fetcher,
}: {
  webId: string;
  podRoot: string;
  fetcher: SolidFetch;
}): Promise<{ configured: boolean; inboxUrl: string }> {
  const { inboxUrl } = solidToursInboxContext(webId, podRoot);
  let linkedInbox: string | null;
  try {
    linkedInbox = await resolveSolidInbox(webId, fetcher);
  } catch (error) {
    if (errorStatus(error) === 404) return { configured: false, inboxUrl };
    throw error;
  }
  if (linkedInbox !== inboxUrl) return { configured: false, inboxUrl };

  try {
    const { acl } = await inboxAcl(inboxUrl, fetcher);
    const publicAccess = getPublicResourceAccess(acl) || {};
    return {
      configured:
        publicAccess.read === false &&
        publicAccess.append === true &&
        publicAccess.write === false &&
        publicAccess.control === false,
      inboxUrl,
    };
  } catch {
    // A missing or inaccessible explicit ACL is repairable through the
    // consented setup action. Do not silently treat inherited access as ready.
    return { configured: false, inboxUrl };
  }
}

export async function ensureSolidToursInbox({
  webId,
  podRoot,
  fetcher,
}: {
  webId: string;
  podRoot: string;
  fetcher: SolidFetch;
}): Promise<string> {
  const { inboxUrl, profileUrl } = solidToursInboxContext(webId, podRoot);
  try {
    await getSolidDataset(inboxUrl, { fetch: fetcher });
  } catch (error) {
    if (errorStatus(error) !== 404) throw error;
    try {
      await createContainerAt(inboxUrl, { fetch: fetcher });
    } catch (createError) {
      if (!new Set([409, 412]).has(Number(errorStatus(createError)))) throw createError;
    }
  }

  const current = await inboxAcl(inboxUrl, fetcher);
  const updatedAcl = setPublicResourceAccess(current.acl, {
    read: false,
    append: true,
    write: false,
    control: false,
  });
  await saveAclFor(current.resource, updatedAcl, { fetch: fetcher });

  const verified = await inboxAcl(inboxUrl, fetcher);
  const publicAccess = getPublicResourceAccess(verified.acl) || {};
  if (
    publicAccess.read !== false ||
    publicAccess.append !== true ||
    publicAccess.write !== false ||
    publicAccess.control !== false
  ) {
    throw new Error("Die Solid-Inbox besitzt keine verifizierte öffentliche Append-only-ACL.");
  }

  const profile = await getSolidDataset(profileUrl, { fetch: fetcher });
  let person = getThing(profile, webId) || createThing({ url: webId });
  person = removeAll(person, LDP_INBOX);
  person = setUrl(person, LDP_INBOX, inboxUrl);
  await saveSolidDatasetAt(profileUrl, setThing(profile, person), { fetch: fetcher });

  const savedProfile = await getSolidDataset(profileUrl, { fetch: fetcher });
  const savedPerson = getThing(savedProfile, webId);
  if (!savedPerson || getUrl(savedPerson, LDP_INBOX) !== inboxUrl) {
    throw new Error("Die Solid-Inbox konnte nicht im Solid-Profil verifiziert werden.");
  }
  return inboxUrl;
}

async function revokeAgent(url: string, agentWebId: string, fetcher: SolidFetch): Promise<void> {
  try {
    const resource = await getFileWithAcl(url, { fetch: fetcher });
    let acl;
    if (hasResourceAcl(resource)) acl = getResourceAcl(resource);
    else if (hasAccessibleAcl(resource) && hasFallbackAcl(resource)) {
      acl = createAclFromFallbackAcl(resource);
    }
    else throw new Error("Die ACL des Szenario-Snapshots ist nicht zugänglich.");
    const revoked = setAgentResourceAccess(acl, agentWebId, {
      read: false,
      append: false,
      write: false,
      control: false,
    });
    await saveAclFor(resource, revoked, { fetch: fetcher });
  } catch (error) {
    if (errorStatus(error) !== 404) throw error;
  }
}

const escapeLiteral = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "\\n");

function revocationDecision(request: ScenarioRequest, ownerWebId: string, archivedAt: string): string {
  return [
    `@prefix sdm: <${SDM}>.`,
    "@prefix dct: <http://purl.org/dc/terms/>.",
    "@prefix as: <https://www.w3.org/ns/activitystreams#>.",
    "@prefix xsd: <http://www.w3.org/2001/XMLSchema#>.",
    "",
    "<> a sdm:AccessDecision, as:Offer;",
    `  dct:created "${archivedAt}"^^xsd:dateTime;`,
    '  sdm:decision "revoked";',
    `  sdm:requesterWebId <${request.requesterWebId}>;`,
    `  sdm:decidedBy <${ownerWebId}>;`,
    `  sdm:decidedAt "${archivedAt}"^^xsd:dateTime;`,
    `  sdm:archivedAt "${archivedAt}"^^xsd:dateTime;`,
    `  sdm:scenarioRunId "${escapeLiteral(request.scenarioRunId)}";`,
    `  sdm:requestId "${escapeLiteral(request.requestId)}";`,
    `  sdm:datasetIdentifier "${escapeLiteral(request.datasetIdentifier)}";`,
    `  sdm:datasetAccessUrl <${request.datasetAccessUrl}>;`,
    '  sdm:applicationId "environmental-monitoring";',
    '  sdm:decisionComment "Scenario reset in Solid Tours.";',
    "  .",
  ].join("\n");
}

type ScenarioRequest = {
  resourceUrl: string;
  scenarioRunId: string;
  requesterWebId: string;
  datasetAccessUrl: string;
  datasetIdentifier: string;
  requestId: string;
  dataset: Awaited<ReturnType<typeof getSolidDataset>>;
  thing: ReturnType<typeof getThingAll>[number];
};

async function notifyRequester(
  request: ScenarioRequest,
  ownerWebId: string,
  archivedAt: string,
  fetcher: SolidFetch
): Promise<void> {
  try {
    const inbox = await resolveSolidInbox(request.requesterWebId, fetcher);
    if (!inbox) return;
    const response = await fetcher(inbox, {
      method: "POST",
      headers: {
        "Content-Type": "text/turtle",
        Slug: `access-decision-${request.datasetIdentifier}-${Date.now()}`,
      },
      body: revocationDecision(request, ownerWebId, archivedAt),
    });
    if (!response.ok) console.warn("Requester inbox rejected the revocation decision.", response.status);
  } catch (error) {
    console.warn("Requester could not be notified about scenario reset.", error);
  }
}

export async function revokeAndArchiveScenarioAccess({
  ownerWebId,
  scenarioRunId,
  resourceUrl,
  fetcher,
}: {
  ownerWebId: string;
  scenarioRunId: string;
  resourceUrl: string;
  fetcher: SolidFetch;
}): Promise<number> {
  const authenticatedFetch = noCache(fetcher);
  const inbox = await resolveSolidInbox(ownerWebId, authenticatedFetch);
  if (!inbox) throw new Error("Die Solid-Inbox konnte nicht aufgelöst werden.");
  const container = await getSolidDataset(inbox, { fetch: authenticatedFetch });
  const candidates = getContainedResourceUrlAll(container);
  const matches: ScenarioRequest[] = [];

  for (const candidate of candidates) {
    try {
      const dataset = await getSolidDataset(candidate, { fetch: authenticatedFetch });
      const thing = getThing(dataset, candidate) || getThingAll(dataset)[0];
      if (!thing || !getUrlAll(thing, RDF_TYPE).includes(ACCESS_REQUEST)) continue;
      const run = getStringNoLocale(thing, `${SDM}scenarioRunId`) || "";
      const applicationId = getStringNoLocale(thing, `${SDM}applicationId`) || "";
      const target = getUrl(thing, `${SDM}datasetAccessUrl`) || "";
      const requesterWebId = getUrl(thing, `${SDM}requesterWebId`) || "";
      if (
        run !== scenarioRunId ||
        applicationId !== "environmental-monitoring" ||
        target !== resourceUrl ||
        !requesterWebId
      ) {
        continue;
      }
      matches.push({
        resourceUrl: candidate,
        scenarioRunId: run,
        requesterWebId,
        datasetAccessUrl: target,
        datasetIdentifier: getStringNoLocale(thing, `${SDM}datasetIdentifier`) || "",
        requestId: getStringNoLocale(thing, `${SDM}requestId`) || "",
        dataset,
        thing,
      });
    } catch (error) {
      console.warn("Inbox resource could not be inspected during reset.", candidate, error);
    }
  }

  const archivedAt = new Date().toISOString();
  for (const request of matches) {
    await revokeAgent(resourceUrl, request.requesterWebId, authenticatedFetch);
    let updated = setStringNoLocale(request.thing, `${SDM}status`, "revoked");
    updated = setDatetime(updated, `${SDM}decidedAt`, new Date(archivedAt));
    updated = setDatetime(updated, `${SDM}archivedAt`, new Date(archivedAt));
    updated = setUrl(updated, `${SDM}decidedBy`, ownerWebId);
    updated = setStringNoLocale(updated, `${SDM}decisionComment`, "Scenario reset in Solid Tours.");
    await saveSolidDatasetAt(request.resourceUrl, setThing(request.dataset, updated), {
      fetch: authenticatedFetch,
    });
    await notifyRequester(request, ownerWebId, archivedAt, authenticatedFetch);
  }
  return matches.length;
}
