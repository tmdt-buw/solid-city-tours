import {
  createAclFromFallbackAcl,
  getContainedResourceUrlAll,
  getFileWithAcl,
  getResourceAcl,
  getSolidDataset,
  getStringNoLocale,
  getThing,
  getThingAll,
  getUrl,
  getUrlAll,
  hasAccessibleAcl,
  hasFallbackAcl,
  hasResourceAcl,
  saveAclFor,
  saveSolidDatasetAt,
  setAgentResourceAccess,
  setDatetime,
  setStringNoLocale,
  setThing,
  setUrl,
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

async function resolveInbox(webId: string, fetcher: SolidFetch): Promise<string | null> {
  const profile = await getSolidDataset(webId, { fetch: fetcher });
  const person = getThing(profile, webId);
  return person ? getUrl(person, LDP_INBOX) : null;
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
    const inbox = await resolveInbox(request.requesterWebId, fetcher);
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
  const inbox = await resolveInbox(ownerWebId, authenticatedFetch);
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
