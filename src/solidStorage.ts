import {
  createContainerAt,
  deleteContainer,
  deleteFile,
  getContainedResourceUrlAll,
  getPodUrlAll,
  getSolidDataset,
  overwriteFile,
} from "@inrupt/solid-client";
import { draftFeature, isUuidV4 } from "./domain";
import { validateToursState } from "./stateValidation";
import {
  setOwnerOnlyResourceAccess,
  setOwnerPublicReadResourceAccess,
} from "./ownerAcl";
import type { CompletedActivity, PublishedSnapshot, TourDraft, ToursState } from "./types";

type SolidFetch = typeof fetch;

export const EMPTY_STATE: ToursState = {
  schemaVersion: 1,
  drafts: [],
  activities: [],
  activeRun: null,
};

const normalizeContainer = (url: string) => (url.endsWith("/") ? url : `${url}/`);

function derivePodRoot(webId: string): string {
  const url = new URL(webId);
  const path = url.pathname.replace(/\/+$/, "");
  if (path.endsWith("/profile/card")) {
    return normalizeContainer(`${url.origin}${path.slice(0, -"/profile/card".length)}`);
  }
  const firstSegment = path.split("/").filter(Boolean)[0];
  return normalizeContainer(firstSegment ? `${url.origin}/${firstSegment}` : url.origin);
}

export async function resolvePodRoot(webId: string, fetcher: SolidFetch): Promise<string> {
  try {
    const podUrls = await getPodUrlAll(webId, { fetch: fetcher });
    if (podUrls.length) return normalizeContainer(podUrls[0]);
  } catch {
    // The CSS-style WebID fallback below keeps the fixed demo usable.
  }
  return derivePodRoot(webId);
}

const errorStatus = (error: any) => error?.statusCode || error?.response?.status || error?.status;

async function resourceExistsAtExactUrl(url: string, fetcher: SolidFetch): Promise<boolean> {
  const expectedUrl = new URL(url);
  if (
    (expectedUrl.protocol !== "https:" && expectedUrl.protocol !== "http:") ||
    expectedUrl.username ||
    expectedUrl.password ||
    expectedUrl.hash
  ) {
    throw new Error("Die zu prüfende Resource-URL ist unzulässig.");
  }
  const response = await fetcher(expectedUrl.href, {
    method: "HEAD",
    cache: "no-store",
    redirect: "error",
    headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
  });
  if (response.url && new URL(response.url).href !== expectedUrl.href) {
    throw new Error("Die Resource-Prüfung antwortete für ein anderes Ziel.");
  }
  // This is the only 404 that an "if present" operation may interpret as
  // absence: the direct, redirect-free HEAD of the data resource itself.
  if (response.status === 404) return false;
  if (!response.ok) {
    throw new Error(`Die Resource konnte nicht geprüft werden (${response.status}).`);
  }
  return true;
}

export async function ensureContainer(url: string, fetcher: SolidFetch): Promise<void> {
  try {
    await getSolidDataset(url, { fetch: fetcher });
  } catch (error) {
    if (errorStatus(error) !== 404) throw error;
    await createContainerAt(url, { fetch: fetcher });
  }
}

export function storageUrls(podRoot: string) {
  const tours = `${podRoot}solid-tours/`;
  return {
    tours,
    drafts: `${tours}drafts/`,
    activities: `${tours}activities/`,
    runs: `${tours}runs/`,
    public: `${tours}public/`,
    state: `${tours}state.json`,
    interests: `${tours}interests.ttl`,
    marker: `${tours}public/current-run.json`,
  };
}

export function storageAclPlan(podRoot: string) {
  const urls = storageUrls(podRoot);
  return {
    containers: [urls.tours, urls.drafts, urls.activities, urls.runs, urls.public],
    masterResources: [urls.state, urls.interests],
    containedResourceContainers: [urls.drafts, urls.activities],
    publicResources: [urls.marker],
  } as const;
}

function isDirectChild(containerUrl: string, candidateUrl: string): boolean {
  try {
    const container = new URL(normalizeContainer(containerUrl));
    const candidate = new URL(candidateUrl);
    if (
      candidate.origin !== container.origin ||
      candidate.search ||
      candidate.hash ||
      !candidate.pathname.startsWith(container.pathname)
    ) {
      return false;
    }
    const relativePath = candidate.pathname.slice(container.pathname.length);
    return Boolean(relativePath) && !relativePath.includes("/") && !relativePath.endsWith(".acl");
  } catch {
    return false;
  }
}

export async function setOwnerOnlyIfPresent(
  url: string,
  ownerWebId: string,
  fetcher: SolidFetch,
  options: { includeDefault?: boolean } = {}
): Promise<void> {
  if (!(await resourceExistsAtExactUrl(url, fetcher))) return;
  await setOwnerOnlyResourceAccess(url, ownerWebId, fetcher, options);
}

export async function setOwnerPublicReadIfPresent(
  url: string,
  ownerWebId: string,
  fetcher: SolidFetch
): Promise<void> {
  if (!(await resourceExistsAtExactUrl(url, fetcher))) return;
  await setOwnerPublicReadResourceAccess(url, ownerWebId, fetcher);
}

async function secureContainedPrivateResources(
  containerUrl: string,
  ownerWebId: string,
  fetcher: SolidFetch
): Promise<void> {
  const container = await getSolidDataset(containerUrl, { fetch: fetcher });
  for (const resourceUrl of getContainedResourceUrlAll(container)) {
    if (!isDirectChild(containerUrl, resourceUrl)) {
      throw new Error(`Unsichere enthaltene Resource-URL in ${containerUrl}.`);
    }
    await setOwnerOnlyResourceAccess(resourceUrl, ownerWebId, fetcher);
  }
}

export async function ensureStorage(
  podRoot: string,
  ownerWebId: string,
  fetcher: SolidFetch
): Promise<void> {
  const aclPlan = storageAclPlan(podRoot);
  for (const url of aclPlan.containers) {
    await ensureContainer(url, fetcher);
    // Each container gets an explicit owner-only ACL and owner-only defaults. This
    // prevents a newly created private child from ever inheriting an ancestor grant.
    await setOwnerOnlyResourceAccess(url, ownerWebId, fetcher, { includeDefault: true });
  }

  // Existing resources may carry explicit ACLs that do not change when their parent
  // default changes. Remove those stale grants before state or private data is read.
  for (const resourceUrl of aclPlan.masterResources) {
    await setOwnerOnlyIfPresent(resourceUrl, ownerWebId, fetcher);
  }
  for (const containerUrl of aclPlan.containedResourceContainers) {
    await secureContainedPrivateResources(containerUrl, ownerWebId, fetcher);
  }
  for (const resourceUrl of aclPlan.publicResources) {
    await setOwnerPublicReadIfPresent(resourceUrl, ownerWebId, fetcher);
  }
}

async function writeBlob(
  url: string,
  body: string,
  contentType: string,
  fetcher: SolidFetch
): Promise<void> {
  await overwriteFile(url, new Blob([body], { type: contentType }), {
    contentType,
    fetch: fetcher,
  });
}

async function putOwnerOnlyBlob(
  url: string,
  body: string,
  contentType: string,
  ownerWebId: string,
  fetcher: SolidFetch
): Promise<void> {
  // Strip an existing explicit grant before replacing its contents. New files inherit
  // only the owner-only default established by ensureStorage.
  await setOwnerOnlyIfPresent(url, ownerWebId, fetcher);
  await writeBlob(url, body, contentType, fetcher);
  await setOwnerOnlyResourceAccess(url, ownerWebId, fetcher);
}

export async function putPrivateJson(
  url: string,
  value: unknown,
  ownerWebId: string,
  fetcher: SolidFetch
) {
  await putOwnerOnlyBlob(
    url,
    `${JSON.stringify(value, null, 2)}\n`,
    "application/json",
    ownerWebId,
    fetcher
  );
}

export async function putPrivateGeoJson(
  url: string,
  value: unknown,
  ownerWebId: string,
  fetcher: SolidFetch
) {
  await putOwnerOnlyBlob(
    url,
    `${JSON.stringify(value, null, 2)}\n`,
    "application/geo+json",
    ownerWebId,
    fetcher
  );
}

export async function putPublicJson(
  url: string,
  value: unknown,
  ownerWebId: string,
  fetcher: SolidFetch
) {
  await setOwnerOnlyIfPresent(url, ownerWebId, fetcher);
  await writeBlob(url, `${JSON.stringify(value, null, 2)}\n`, "application/json", fetcher);
  await setOwnerPublicReadResourceAccess(url, ownerWebId, fetcher);
}

export type StateSnapshot = {
  state: ToursState;
  etag: string | null;
};

type CachedStateVersion =
  | { exists: false; etag: null; fingerprint: string }
  | { exists: true; etag: string | null; fingerprint: string };

// Every state writer in this browser tab shares the version learned by the
// latest authenticated read/write for that exact Pod resource. Separate tabs
// still carry their own older ETag and therefore fail with 412 instead of
// overwriting each other.
const stateVersionByUrl = new Map<string, CachedStateVersion>();

const stateFingerprint = (state: ToursState): string => JSON.stringify(state);

function strongEtag(response: Response): string | null {
  const etag = response.headers.get("ETag")?.trim() || null;
  if (
    !etag ||
    etag.toUpperCase().startsWith("W/") ||
    !etag.startsWith('"') ||
    !etag.endsWith('"') ||
    /[\r\n]/.test(etag)
  ) {
    return null;
  }
  return etag;
}

function assertExactResponseUrl(response: Response, expectedUrl: string, operation: string): void {
  if (response.url && new URL(response.url).href !== new URL(expectedUrl).href) {
    throw new Error(`${operation} antwortete für ein anderes Ziel.`);
  }
}

export async function loadStateSnapshot(
  podRoot: string,
  fetcher: SolidFetch
): Promise<StateSnapshot> {
  const stateUrl = storageUrls(podRoot).state;
  const response = await fetcher(stateUrl, {
    headers: { Accept: "application/json", "Cache-Control": "no-cache" },
    cache: "no-store",
    redirect: "error",
  });
  assertExactResponseUrl(response, stateUrl, "Die Solid-Tours-Statusabfrage");
  if (response.status === 404) {
    const emptyState = { ...EMPTY_STATE, drafts: [], activities: [] };
    stateVersionByUrl.set(stateUrl, {
      exists: false,
      etag: null,
      fingerprint: stateFingerprint(emptyState),
    });
    return { state: emptyState, etag: null };
  }
  if (!response.ok) throw new Error(`Solid-Tours-Status konnte nicht geladen werden (${response.status}).`);
  const state = await response.json();
  const snapshot = {
    state: validateToursState(podRoot, { ...state, activeRun: state.activeRun || null }),
    etag: strongEtag(response),
  };
  stateVersionByUrl.set(stateUrl, {
    exists: true,
    etag: snapshot.etag,
    fingerprint: stateFingerprint(snapshot.state),
  });
  return snapshot;
}

export async function loadState(podRoot: string, fetcher: SolidFetch): Promise<ToursState> {
  return (await loadStateSnapshot(podRoot, fetcher)).state;
}

export class StateConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StateConflictError";
  }
}

export function isStateConflictError(error: unknown): error is StateConflictError {
  return error instanceof StateConflictError;
}

export async function saveState(
  podRoot: string,
  state: ToursState,
  baseState: ToursState,
  ownerWebId: string,
  fetcher: SolidFetch
) {
  const stateUrl = storageUrls(podRoot).state;
  const validatedBaseState = validateToursState(podRoot, baseState);
  let version = stateVersionByUrl.get(stateUrl);
  if (!version) {
    await loadStateSnapshot(podRoot, fetcher);
    version = stateVersionByUrl.get(stateUrl);
  }
  if (!version) throw new Error("Der Solid-Tours-Status konnte nicht versioniert werden.");
  if (version.fingerprint !== stateFingerprint(validatedBaseState)) {
    throw new StateConflictError(
      "Der lokale Solid-Tours-Stand ist veraltet. Lade den aktuellen Pod-Stand neu, bevor du die Aktion wiederholst."
    );
  }
  if (version.exists && !version.etag) {
    throw new Error(
      "Der Pod liefert keinen starken Versionsnachweis. Der Solid-Tours-Status wurde nicht geändert."
    );
  }
  await writeStateConditionally(
    podRoot,
    state,
    version.exists
      ? { "If-Match": version.etag as string }
      : { "If-None-Match": "*" },
    ownerWebId,
    fetcher
  );
}

export async function saveStateIfUnchanged(
  podRoot: string,
  state: ToursState,
  expectedEtag: string,
  ownerWebId: string,
  fetcher: SolidFetch
): Promise<StateSnapshot> {
  if (
    !expectedEtag ||
    expectedEtag.toUpperCase().startsWith("W/") ||
    !expectedEtag.startsWith('"') ||
    !expectedEtag.endsWith('"') ||
    /[\r\n]/.test(expectedEtag)
  ) {
    throw new Error(
      "Der Pod liefert keinen starken Versionsnachweis. Die Aktivität wurde vorsichtshalber nicht geändert."
    );
  }
  return writeStateConditionally(
    podRoot,
    state,
    { "If-Match": expectedEtag },
    ownerWebId,
    fetcher
  );
}

async function reconcileStateWrite(
  podRoot: string,
  expectedState: ToursState,
  ownerWebId: string,
  fetcher: SolidFetch,
  originalError: unknown
): Promise<StateSnapshot> {
  try {
    const current = await loadStateSnapshot(podRoot, fetcher);
    if (JSON.stringify(current.state) !== JSON.stringify(expectedState) || !current.etag) {
      throw new Error("Der aktuelle Pod-Status entspricht nicht dem beabsichtigten Update.");
    }
    // A lost response or a post-write ACL error may still follow a committed
    // PUT. Reassert and strictly verify owner-only ACL before accepting it.
    await setOwnerOnlyResourceAccess(storageUrls(podRoot).state, ownerWebId, fetcher);
    return current;
  } catch (reconciliationError) {
    throw new AggregateError(
      [originalError, reconciliationError],
      "Das Solid-Tours-Status-Update konnte nicht eindeutig bestätigt werden. Lade Solid Tours neu."
    );
  }
}

async function writeStateConditionally(
  podRoot: string,
  state: ToursState,
  condition: { "If-Match": string } | { "If-None-Match": "*" },
  ownerWebId: string,
  fetcher: SolidFetch
): Promise<StateSnapshot> {
  const validatedState = validateToursState(podRoot, state);
  const stateUrl = storageUrls(podRoot).state;
  await setOwnerOnlyIfPresent(stateUrl, ownerWebId, fetcher);

  let response: Response;
  try {
    response = await fetcher(stateUrl, {
      method: "PUT",
      cache: "no-store",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        ...condition,
      },
      body: `${JSON.stringify(validatedState, null, 2)}\n`,
    });
    assertExactResponseUrl(response, stateUrl, "Das Solid-Tours-Status-Update");
  } catch (writeError) {
    return reconcileStateWrite(podRoot, validatedState, ownerWebId, fetcher, writeError);
  }

  if (response.status === 409 || response.status === 412) {
    // Observe the remote state, but keep its ETag inseparably bound to that
    // state fingerprint. A retry with stale UI state must abort before PUT.
    await loadStateSnapshot(podRoot, fetcher).catch(() => undefined);
    throw new StateConflictError(
      "Der Solid-Tours-Status wurde zwischenzeitlich geändert. Die Aktion wurde nicht gespeichert."
    );
  }
  if (!response.ok) {
    return reconcileStateWrite(
      podRoot,
      validatedState,
      ownerWebId,
      fetcher,
      new Error(`Solid-Tours-Status konnte nicht gespeichert werden (${response.status}).`)
    );
  }

  try {
    await setOwnerOnlyResourceAccess(stateUrl, ownerWebId, fetcher);
    const verified = await loadStateSnapshot(podRoot, fetcher);
    if (JSON.stringify(verified.state) !== JSON.stringify(validatedState) || !verified.etag) {
      throw new Error(
        "Das Solid-Tours-Status-Update konnte nicht mit einer eindeutigen Version bestätigt werden."
      );
    }
    return verified;
  } catch (postWriteError) {
    return reconcileStateWrite(podRoot, validatedState, ownerWebId, fetcher, postWriteError);
  }
}

export async function saveDraft(
  podRoot: string,
  draft: TourDraft,
  ownerWebId: string,
  fetcher: SolidFetch
) {
  await putPrivateGeoJson(
    `${storageUrls(podRoot).drafts}${draft.id}.geojson`,
    draftFeature(draft),
    ownerWebId,
    fetcher
  );
}

type PrivateGeoJsonSnapshot = { etag: string };

export class PrivateResourceConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrivateResourceConflictError";
  }
}

async function reconcilePrivateGeoJsonWrite(
  resourceUrl: string,
  value: unknown,
  ownerWebId: string,
  fetcher: SolidFetch,
  label: string,
  originalError: unknown
): Promise<PrivateGeoJsonSnapshot> {
  try {
    const reconciled = await loadExpectedPrivateGeoJson(resourceUrl, value, fetcher, label);
    await setOwnerOnlyResourceAccess(resourceUrl, ownerWebId, fetcher);
    return reconciled;
  } catch (reconciliationError) {
    throw new AggregateError(
      [originalError, reconciliationError],
      `${label} konnte nicht eindeutig gespeichert werden.`
    );
  }
}

async function loadExpectedPrivateGeoJson(
  resourceUrl: string,
  expected: unknown,
  fetcher: SolidFetch,
  label: string
): Promise<PrivateGeoJsonSnapshot> {
  const response = await fetcher(resourceUrl, {
    headers: { Accept: "application/geo+json", "Cache-Control": "no-cache" },
    cache: "no-store",
    redirect: "error",
  });
  assertExactResponseUrl(response, resourceUrl, `${label}-Abfrage`);
  if (response.status === 404) throw new Error(`${label} ist nicht mehr vorhanden.`);
  if (!response.ok) throw new Error(`${label} konnte nicht geladen werden (${response.status}).`);
  if (JSON.stringify(await response.json()) !== JSON.stringify(expected)) {
    throw new Error(`${label} wurde zwischenzeitlich verändert.`);
  }
  const etag = strongEtag(response);
  if (!etag) throw new Error(`${label} besitzt keinen starken Versionsnachweis.`);
  return { etag };
}

const DRAFT_FEATURE_KEYS = new Set(["type", "geometry", "properties"]);
const DRAFT_GEOMETRY_KEYS = new Set(["type", "coordinates"]);
const DRAFT_PROPERTY_KEYS = new Set([
  "schemaVersion",
  "source",
  "tourId",
  "name",
  "activityType",
  "routeSource",
  "durationMinutes",
  "durationSource",
  "createdAt",
  "updatedAt",
]);

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const containsOnlyKeys = (value: Record<string, unknown>, allowed: Set<string>) =>
  Object.keys(value).every((key) => allowed.has(key));

/**
 * Convert a draft master written by an older Solid Tours version to the
 * current neutral-route representation used by state hydration.
 *
 * This is deliberately strict: only fields ever written by Solid Tours are
 * accepted. A changed name, geometry, timestamp or unknown property still
 * fails the comparison below, so this compatibility path cannot overwrite a
 * concurrent or foreign edit.
 */
function canonicalStoredDraftFeature(value: unknown): ReturnType<typeof draftFeature> | null {
  if (!isPlainRecord(value) || !containsOnlyKeys(value, DRAFT_FEATURE_KEYS)) return null;
  if (value.type !== "Feature" || !isPlainRecord(value.geometry) || !isPlainRecord(value.properties)) {
    return null;
  }
  if (
    !containsOnlyKeys(value.geometry, DRAFT_GEOMETRY_KEYS) ||
    !containsOnlyKeys(value.properties, DRAFT_PROPERTY_KEYS) ||
    value.geometry.type !== "MultiLineString"
  ) {
    return null;
  }

  const properties = value.properties;
  if (properties.schemaVersion !== "1.0" || properties.source !== "solid-tours") return null;
  if (
    properties.activityType !== undefined &&
    properties.activityType !== "walking" &&
    properties.activityType !== "cycling"
  ) {
    return null;
  }
  const hasDuration = properties.durationMinutes !== undefined;
  const hasDurationSource = properties.durationSource !== undefined;
  if (hasDuration !== hasDurationSource) return null;
  if (
    hasDuration &&
    (typeof properties.durationMinutes !== "number" ||
      !Number.isFinite(properties.durationMinutes) ||
      properties.durationMinutes <= 0 ||
      !new Set(["osrm", "gpx", "default-speed"]).has(String(properties.durationSource)))
  ) {
    return null;
  }

  try {
    const normalized = validateToursState("https://solid-tours.invalid/pod/", {
      schemaVersion: 1,
      drafts: [
        {
          id: properties.tourId,
          name: properties.name,
          activityType: properties.activityType,
          routeSource: properties.routeSource,
          geometry: value.geometry.coordinates,
          durationMinutes: properties.durationMinutes,
          durationSource: properties.durationSource,
          createdAt: properties.createdAt,
          updatedAt: properties.updatedAt,
        },
      ],
      activities: [],
      activeRun: null,
    }).drafts[0];
    return draftFeature(normalized);
  } catch {
    return null;
  }
}

async function writePrivateGeoJsonConditionally(
  resourceUrl: string,
  value: unknown,
  expectedEtag: string | null,
  ownerWebId: string,
  fetcher: SolidFetch,
  label: string
): Promise<PrivateGeoJsonSnapshot> {
  await setOwnerOnlyIfPresent(resourceUrl, ownerWebId, fetcher);
  let response: Response;
  try {
    response = await fetcher(resourceUrl, {
      method: "PUT",
      cache: "no-store",
      redirect: "error",
      headers: {
        "Content-Type": "application/geo+json",
        "Cache-Control": "no-cache",
        ...(expectedEtag ? { "If-Match": expectedEtag } : { "If-None-Match": "*" }),
      },
      body: `${JSON.stringify(value, null, 2)}\n`,
    });
    assertExactResponseUrl(response, resourceUrl, `${label}-Update`);
  } catch (writeError) {
    return reconcilePrivateGeoJsonWrite(
      resourceUrl,
      value,
      ownerWebId,
      fetcher,
      label,
      writeError
    );
  }
  if (response.status === 409 || response.status === 412) {
    throw new PrivateResourceConflictError(`${label} wurde zwischenzeitlich verändert.`);
  }
  if (!response.ok) {
    return reconcilePrivateGeoJsonWrite(
      resourceUrl,
      value,
      ownerWebId,
      fetcher,
      label,
      new Error(`${label} konnte nicht gespeichert werden (${response.status}).`)
    );
  }
  try {
    await setOwnerOnlyResourceAccess(resourceUrl, ownerWebId, fetcher);
    return await loadExpectedPrivateGeoJson(resourceUrl, value, fetcher, label);
  } catch (postWriteError) {
    return reconcilePrivateGeoJsonWrite(
      resourceUrl,
      value,
      ownerWebId,
      fetcher,
      label,
      postWriteError
    );
  }
}

export async function loadDraftMasterSnapshot(
  podRoot: string,
  draft: TourDraft,
  fetcher: SolidFetch
): Promise<PrivateGeoJsonSnapshot> {
  const resourceUrl = `${storageUrls(podRoot).drafts}${draft.id}.geojson`;
  const response = await fetcher(resourceUrl, {
    headers: { Accept: "application/geo+json", "Cache-Control": "no-cache" },
    cache: "no-store",
    redirect: "error",
  });
  assertExactResponseUrl(response, resourceUrl, "Der private Tourentwurf-Abfrage");
  if (response.status === 404) throw new Error("Der private Tourentwurf ist nicht mehr vorhanden.");
  if (!response.ok) {
    throw new Error(`Der private Tourentwurf konnte nicht geladen werden (${response.status}).`);
  }
  const stored = canonicalStoredDraftFeature(await response.json());
  if (!stored || JSON.stringify(stored) !== JSON.stringify(draftFeature(draft))) {
    throw new Error("Der private Tourentwurf wurde zwischenzeitlich geändert.");
  }
  const etag = strongEtag(response);
  if (!etag) throw new Error("Der private Tourentwurf besitzt keinen starken Versionsnachweis.");
  return { etag };
}

export async function saveDraftConditionally(
  podRoot: string,
  draft: TourDraft,
  expectedEtag: string | null,
  ownerWebId: string,
  fetcher: SolidFetch
): Promise<PrivateGeoJsonSnapshot> {
  return writePrivateGeoJsonConditionally(
    `${storageUrls(podRoot).drafts}${draft.id}.geojson`,
    draftFeature(draft),
    expectedEtag,
    ownerWebId,
    fetcher,
    "Der private Tourentwurf"
  );
}

export async function deleteDraft(
  podRoot: string,
  draftId: string,
  expectedEtag: string,
  fetcher: SolidFetch
): Promise<void> {
  const resourceUrl = `${storageUrls(podRoot).drafts}${draftId}.geojson`;
  let deleteError: unknown = null;
  try {
    const response = await fetcher(resourceUrl, {
      method: "DELETE",
      cache: "no-store",
      redirect: "error",
      headers: { "Cache-Control": "no-cache", "If-Match": expectedEtag },
    });
    assertExactResponseUrl(response, resourceUrl, "Das Löschen des Tourentwurfs");
    if (response.status === 409 || response.status === 412) {
      throw new Error("Der private Tourentwurf wurde zwischenzeitlich verändert.");
    }
    if (response.status !== 404 && !response.ok) {
      throw new Error(`Der private Tourentwurf konnte nicht gelöscht werden (${response.status}).`);
    }
  } catch (error) {
    deleteError = error;
  }
  if (!(await resourceExistsAtExactUrl(resourceUrl, fetcher))) return;
  throw deleteError || new Error("Das Löschen des privaten Tourentwurfs wurde nicht bestätigt.");
}

const escapeLiteral = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "\\n");

export async function saveActivity(
  podRoot: string,
  activity: CompletedActivity,
  ownerWebId: string,
  fetcher: SolidFetch
): Promise<void> {
  const feature = completedActivityFeature(activity);
  await putPrivateGeoJson(
    `${storageUrls(podRoot).activities}${activity.id}.geojson`,
    feature,
    ownerWebId,
    fetcher
  );
}

export async function saveActivityConditionally(
  podRoot: string,
  activity: CompletedActivity,
  ownerWebId: string,
  fetcher: SolidFetch
): Promise<PrivateGeoJsonSnapshot> {
  return writePrivateGeoJsonConditionally(
    `${storageUrls(podRoot).activities}${activity.id}.geojson`,
    completedActivityFeature(activity),
    null,
    ownerWebId,
    fetcher,
    "Die private Aktivität"
  );
}

function completedActivityFeature(activity: CompletedActivity) {
  return {
    type: "Feature",
    geometry: { type: "MultiLineString", coordinates: activity.geometry },
    properties: {
      schemaVersion: "1.0",
      source: "solid-tours",
      activityId: activity.id,
      draftId: activity.draftId,
      name: activity.name,
      activityType: activity.activityType,
      completedDate: activity.completedDate,
      completedAt: activity.completedAt,
      activitySummary: activity.activitySummary,
    },
  };
}

export type ActivityMasterSnapshot = {
  etag: string;
};

export class ActivityMasterConflictError extends Error {
  readonly kind: "missing" | "changed" | "version";

  constructor(message: string, kind: "missing" | "changed" | "version") {
    super(message);
    this.name = "ActivityMasterConflictError";
    this.kind = kind;
  }
}

export function isActivityMasterConflictError(
  error: unknown
): error is ActivityMasterConflictError {
  return error instanceof ActivityMasterConflictError;
}

export async function loadActivityMasterSnapshot(
  podRoot: string,
  activity: CompletedActivity,
  fetcher: SolidFetch
): Promise<ActivityMasterSnapshot> {
  const resourceUrl = `${storageUrls(podRoot).activities}${activity.id}.geojson`;
  const response = await fetcher(resourceUrl, {
    headers: { Accept: "application/geo+json", "Cache-Control": "no-cache" },
    cache: "no-store",
    redirect: "error",
  });
  assertExactResponseUrl(response, resourceUrl, "Die Aktivitätsabfrage");
  if (response.status === 404) {
    throw new ActivityMasterConflictError(
      "Die private Aktivität ist nicht mehr vorhanden. Die Löschung wurde abgebrochen.",
      "missing"
    );
  }
  if (!response.ok) {
    throw new Error(`Die private Aktivität konnte nicht geladen werden (${response.status}).`);
  }
  const stored = await response.json();
  if (JSON.stringify(stored) !== JSON.stringify(completedActivityFeature(activity))) {
    throw new ActivityMasterConflictError(
      "Die private Aktivität wurde zwischenzeitlich verändert. Die Löschung wurde abgebrochen.",
      "changed"
    );
  }
  const etag = strongEtag(response);
  if (!etag) {
    throw new ActivityMasterConflictError(
      "Die private Aktivität besitzt keinen starken Versionsnachweis. Die Löschung wurde abgebrochen.",
      "version"
    );
  }
  return { etag };
}

export async function deleteActivity(
  podRoot: string,
  activityId: string,
  expectedEtag: string,
  fetcher: SolidFetch
): Promise<void> {
  if (
    !expectedEtag ||
    expectedEtag.toUpperCase().startsWith("W/") ||
    !expectedEtag.startsWith('"') ||
    !expectedEtag.endsWith('"') ||
    /[\r\n]/.test(expectedEtag)
  ) {
    throw new ActivityMasterConflictError(
      "Die private Aktivität besitzt keinen starken Versionsnachweis.",
      "version"
    );
  }
  const resourceUrl = `${storageUrls(podRoot).activities}${activityId}.geojson`;
  const response = await fetcher(resourceUrl, {
    method: "DELETE",
    cache: "no-store",
    redirect: "error",
    headers: { "Cache-Control": "no-cache", "If-Match": expectedEtag },
  });
  assertExactResponseUrl(response, resourceUrl, "Das Löschen der privaten Aktivität");
  if (response.status === 404) return;
  if (response.status === 409 || response.status === 412) {
    throw new ActivityMasterConflictError(
      "Die private Aktivität wurde zwischenzeitlich verändert. Sie wurde nicht gelöscht.",
      "changed"
    );
  }
  if (!response.ok) {
    throw new Error(`Die private Aktivität konnte nicht gelöscht werden (${response.status}).`);
  }
}

export async function activityMasterExists(
  podRoot: string,
  activityId: string,
  fetcher: SolidFetch
): Promise<boolean> {
  return resourceExistsAtExactUrl(
    `${storageUrls(podRoot).activities}${activityId}.geojson`,
    fetcher
  );
}

export async function ensureActivityMaster(
  podRoot: string,
  activity: CompletedActivity,
  ownerWebId: string,
  fetcher: SolidFetch
): Promise<void> {
  try {
    await saveActivity(podRoot, activity, ownerWebId, fetcher);
    return;
  } catch (writeError) {
    const resourceUrl = `${storageUrls(podRoot).activities}${activity.id}.geojson`;
    try {
      const response = await fetcher(resourceUrl, {
        headers: { Accept: "application/geo+json", "Cache-Control": "no-cache" },
        cache: "no-store",
        redirect: "error",
      });
      assertExactResponseUrl(response, resourceUrl, "Die Aktivitätsprüfung");
      if (!response.ok) {
        throw new Error(`Die private Aktivität konnte nicht geprüft werden (${response.status}).`);
      }
      const stored = await response.json();
      if (JSON.stringify(stored) !== JSON.stringify(completedActivityFeature(activity))) {
        throw new Error("Die wiederhergestellte private Aktivität enthält unerwartete Daten.");
      }
      await setOwnerOnlyResourceAccess(resourceUrl, ownerWebId, fetcher);
      return;
    } catch (verificationError) {
      throw new AggregateError(
        [writeError, verificationError],
        "Die private Aktivität konnte nicht sicher wiederhergestellt werden."
      );
    }
  }
}

export const GENERIC_INTERESTS = [
  "Outdoor activities",
  "Movement/Fitness",
  "Nature",
  "Regional exploration",
  "Sustainable mobility",
] as const;

export async function saveInterestsIfMissing(
  podRoot: string,
  webId: string,
  fetcher: SolidFetch
): Promise<void> {
  const url = storageUrls(podRoot).interests;
  const existing = await fetcher(url, {
    cache: "no-store",
    headers: { Accept: "text/turtle", "Cache-Control": "no-cache" },
  });
  if (existing.ok) return;
  if (existing.status !== 404) {
    throw new Error(`Interessen konnten nicht geprüft werden (${existing.status}).`);
  }

  const interests = GENERIC_INTERESTS.map(
    (interest) => `  <https://schema.org/keywords> "${escapeLiteral(interest)}"`
  ).join(" ;\n");
  const turtle = [
    "@prefix schema: <https://schema.org/> .",
    "@prefix dct: <http://purl.org/dc/terms/> .",
    "",
    "<#profile> a schema:Person ;",
    `  schema:sameAs <${webId}> ;`,
    `${interests} ;`,
    '  dct:source "solid-tours" .',
    "",
  ].join("\n");
  await putOwnerOnlyBlob(url, turtle, "text/turtle", webId, fetcher);
}

export type RunSnapshot = {
  resourceUrl: string;
  manifestUrl: string;
  runContainerUrl: string;
};

export function runManifestTurtle(
  scenarioRunId: string,
  resourceUrl: string,
  createdAt: string
): string {
  return [
    "@prefix tour: <https://w3id.org/solid-tours#> .",
    "@prefix dcat: <http://www.w3.org/ns/dcat#> .",
    "@prefix dct: <http://purl.org/dc/terms/> .",
    "@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .",
    "",
    "<#run> a tour:ScenarioRun ;",
    `  tour:scenarioRunId "${escapeLiteral(scenarioRunId)}" ;`,
    `  dct:created "${createdAt}"^^xsd:dateTime ;`,
    `  dcat:distribution <${resourceUrl}> ;`,
    '  dct:format "application/geo+json" .',
    "",
  ].join("\n");
}

export async function saveRunSnapshot(
  podRoot: string,
  scenarioRunId: string,
  snapshot: PublishedSnapshot,
  ownerWebId: string,
  fetcher: SolidFetch
): Promise<RunSnapshot> {
  const runContainerUrl = `${storageUrls(podRoot).runs}${scenarioRunId}/`;
  await ensureContainer(runContainerUrl, fetcher);
  await setOwnerOnlyResourceAccess(runContainerUrl, ownerWebId, fetcher, {
    includeDefault: true,
  });
  const resourceUrl = `${runContainerUrl}activity.geojson`;
  const manifestUrl = `${runContainerUrl}manifest.ttl`;
  const createdAt = new Date().toISOString();
  const manifest = runManifestTurtle(scenarioRunId, resourceUrl, createdAt);
  try {
    await putPrivateGeoJson(resourceUrl, snapshot, ownerWebId, fetcher);
    await putOwnerOnlyBlob(manifestUrl, manifest, "text/turtle", ownerWebId, fetcher);
    return { resourceUrl, manifestUrl, runContainerUrl };
  } catch (error) {
    await safeDelete(manifestUrl, fetcher).catch(() => undefined);
    await safeDelete(resourceUrl, fetcher).catch(() => undefined);
    await safeDeleteContainer(runContainerUrl, fetcher).catch(() => undefined);
    throw error;
  }
}

export type PublishedMarker = {
  schemaVersion: 1;
  source: "solid-tours";
  status: "published";
  scenarioRunId: string;
  datasetIdentifier: string;
  catalogDatasetUrl: string;
  distributionUrl: string;
  publishedAt: string;
};

export type PublishedMarkerSnapshot =
  | { marker: null; etag: null }
  | { marker: PublishedMarker; etag: string };

type PublishedMarkerInput = Omit<PublishedMarker, "schemaVersion" | "source" | "status">;

const publishedMarker = (marker: PublishedMarkerInput): PublishedMarker => ({
  schemaVersion: 1,
  source: "solid-tours",
  status: "published",
  ...marker,
});

function validatePublishedMarker(value: unknown): PublishedMarker {
  const marker = value as Record<string, unknown> | null;
  if (
    !marker ||
    marker.schemaVersion !== 1 ||
    marker.source !== "solid-tours" ||
    marker.status !== "published" ||
    !isUuidV4(marker.scenarioRunId) ||
    typeof marker.datasetIdentifier !== "string" ||
    typeof marker.catalogDatasetUrl !== "string" ||
    typeof marker.distributionUrl !== "string" ||
    typeof marker.publishedAt !== "string"
  ) {
    throw new Error("Der veroeffentlichte Szenariomarker hat ein ungueltiges Format.");
  }
  return {
    schemaVersion: 1,
    source: "solid-tours",
    status: "published",
    scenarioRunId: marker.scenarioRunId,
    datasetIdentifier: marker.datasetIdentifier,
    catalogDatasetUrl: marker.catalogDatasetUrl,
    distributionUrl: marker.distributionUrl,
    publishedAt: marker.publishedAt,
  };
}

export async function loadPublishedMarkerSnapshot(
  podRoot: string,
  fetcher: SolidFetch
): Promise<PublishedMarkerSnapshot> {
  const markerUrl = storageUrls(podRoot).marker;
  const response = await fetcher(markerUrl, {
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
    cache: "no-store",
    redirect: "error",
  });
  assertExactResponseUrl(response, markerUrl, "Die Szenariomarker-Abfrage");
  if (response.status === 404) return { marker: null, etag: null };
  if (!response.ok) {
    throw new Error(`Der Szenariomarker konnte nicht geladen werden (${response.status}).`);
  }
  const etag = strongEtag(response);
  if (!etag) {
    throw new Error("Der Szenariomarker besitzt keinen starken Versionsnachweis.");
  }
  return { marker: validatePublishedMarker(await response.json()), etag };
}

const samePublishedMarker = (left: PublishedMarker, right: PublishedMarker) =>
  JSON.stringify(left) === JSON.stringify(right);

async function reconcilePublishedMarkerWrite(
  podRoot: string,
  expectedMarker: PublishedMarker,
  ownerWebId: string,
  fetcher: SolidFetch,
  originalError: unknown
): Promise<PublishedMarkerSnapshot & { marker: PublishedMarker; etag: string }> {
  try {
    const current = await loadPublishedMarkerSnapshot(podRoot, fetcher);
    if (!current.marker || !samePublishedMarker(current.marker, expectedMarker)) {
      throw new Error("Der aktuelle Szenariomarker entspricht nicht dem beabsichtigten Update.");
    }
    await setOwnerPublicReadResourceAccess(storageUrls(podRoot).marker, ownerWebId, fetcher);
    const verified = await loadPublishedMarkerSnapshot(podRoot, fetcher);
    if (!verified.marker || !samePublishedMarker(verified.marker, expectedMarker)) {
      throw new Error("Der Szenariomarker konnte nicht eindeutig bestaetigt werden.");
    }
    return verified;
  } catch (reconciliationError) {
    throw new AggregateError(
      [originalError, reconciliationError],
      "Das Szenariomarker-Update konnte nicht eindeutig bestaetigt werden."
    );
  }
}

export async function writePublishedMarker(
  podRoot: string,
  marker: PublishedMarkerInput,
  ownerWebId: string,
  fetcher: SolidFetch
): Promise<PublishedMarkerSnapshot & { marker: PublishedMarker; etag: string }> {
  const expectedMarker = publishedMarker(marker);
  validatePublishedMarker(expectedMarker);
  const markerUrl = storageUrls(podRoot).marker;
  const current = await loadPublishedMarkerSnapshot(podRoot, fetcher);
  if (current.marker && current.marker.scenarioRunId !== marker.scenarioRunId) {
    throw new Error("Ein anderer Szenariolauf besitzt bereits den oeffentlichen Marker.");
  }
  const condition: Record<string, string> = current.marker
    ? { "If-Match": current.etag }
    : { "If-None-Match": "*" };

  let response: Response;
  try {
    response = await fetcher(markerUrl, {
      method: "PUT",
      cache: "no-store",
      redirect: "error",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        ...condition,
      },
      body: `${JSON.stringify(expectedMarker, null, 2)}\n`,
    });
    assertExactResponseUrl(response, markerUrl, "Das Szenariomarker-Update");
  } catch (writeError) {
    return reconcilePublishedMarkerWrite(
      podRoot,
      expectedMarker,
      ownerWebId,
      fetcher,
      writeError
    );
  }

  if (!response.ok) {
    return reconcilePublishedMarkerWrite(
      podRoot,
      expectedMarker,
      ownerWebId,
      fetcher,
      new Error(`Der Szenariomarker konnte nicht gespeichert werden (${response.status}).`)
    );
  }

  try {
    await setOwnerPublicReadResourceAccess(markerUrl, ownerWebId, fetcher);
    const verified = await loadPublishedMarkerSnapshot(podRoot, fetcher);
    if (!verified.marker || !samePublishedMarker(verified.marker, expectedMarker)) {
      throw new Error("Der Szenariomarker konnte nicht eindeutig bestaetigt werden.");
    }
    return verified;
  } catch (postWriteError) {
    return reconcilePublishedMarkerWrite(
      podRoot,
      expectedMarker,
      ownerWebId,
      fetcher,
      postWriteError
    );
  }
}

export async function clearPublishedMarker(
  podRoot: string,
  expectedScenarioRunId: string,
  fetcher: SolidFetch
): Promise<void> {
  if (!isUuidV4(expectedScenarioRunId)) {
    throw new Error("Die erwartete Szenariolauf-Kennung ist ungueltig.");
  }
  const markerUrl = storageUrls(podRoot).marker;
  const errors: unknown[] = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const snapshot = await loadPublishedMarkerSnapshot(podRoot, fetcher);
    if (!snapshot.marker || snapshot.marker.scenarioRunId !== expectedScenarioRunId) return;

    try {
      const response = await fetcher(markerUrl, {
        method: "DELETE",
        cache: "no-store",
        redirect: "error",
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
          "If-Match": snapshot.etag,
        },
      });
      assertExactResponseUrl(response, markerUrl, "Das Szenariomarker-Loeschen");
      if (!response.ok && response.status !== 404) {
        errors.push(
          new Error(`Der Szenariomarker konnte nicht geloescht werden (${response.status}).`)
        );
      }
    } catch (error) {
      errors.push(error);
    }

    const reconciled = await loadPublishedMarkerSnapshot(podRoot, fetcher);
    if (!reconciled.marker || reconciled.marker.scenarioRunId !== expectedScenarioRunId) return;
    errors.push(new Error("Der eigene Szenariomarker ist weiterhin vorhanden."));
  }
  throw new AggregateError(
    errors,
    "Der eigene Szenariomarker konnte nach mehreren Versuchen nicht geloescht werden."
  );
}

export async function safeDelete(url: string, fetcher: SolidFetch): Promise<void> {
  try {
    await deleteFile(url, { fetch: fetcher });
  } catch (error) {
    if (errorStatus(error) !== 404) throw error;
  }
}

export async function safeDeleteContainer(url: string, fetcher: SolidFetch): Promise<void> {
  try {
    await deleteContainer(url, { fetch: fetcher });
  } catch (error) {
    if (errorStatus(error) !== 404) throw error;
  }
}
