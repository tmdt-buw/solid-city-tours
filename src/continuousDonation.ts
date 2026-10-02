import { publishedActivityCollection } from "./domain";
import { loadPublishedMarkerSnapshot, loadStateSnapshot, saveStateIfUnchanged, storageUrls } from "./solidStorage";
import { validateActiveRun } from "./stateValidation";
import type { ActiveRun, ToursState } from "./types";
import type { SolidFetch } from "./embedAuth";

export function legacyContinuousDonationAllowed(webId: string): boolean {
  const config = typeof window === "undefined" ? undefined :
    (window as Window & { __APP_CONFIG__?: { cityToursLegacyContinuousWebIds?: unknown } }).__APP_CONFIG__;
  const ids = config?.cityToursLegacyContinuousWebIds;
  return Array.isArray(ids) && ids.includes(webId);
}

export function donationNeedsSync(state: ToursState, allowLegacy = false): boolean {
  const run = state.activeRun;
  return Boolean(run?.phase === "published" && state.activities.length &&
    (run.donationMode === "continuous" || allowLegacy) &&
    (run.donationMode !== "continuous" || run.activityIds.length !== state.activities.length ||
      state.activities.some(activity => !run.activityIds.includes(activity.id))));
}

function strongEtag(response: Response): string {
  const etag = response.headers.get("etag") || "";
  if (!/^"[^"\r\n]+"$/.test(etag)) throw new Error("Donation resource has no strong ETag.");
  return etag;
}

function checkResponse(response: Response, url: string): void {
  if (!response.ok || (response.url && response.url !== url)) {
    throw new Error(`Donation synchronization failed (${response.status}).`);
  }
}

/** Updates the existing restricted resource, preserving its ACL and access request.
 * Read resource BEFORE state; If-Match prevents stale tabs from overwriting a newer
 * donation or recreating a deleted donation. Never create/grant an ACL here.
 */
export async function synchronizeContinuousDonation({ podRoot, webId, run, fetcher, allowLegacy = false }: {
  podRoot: string; webId: string; run: ActiveRun; fetcher: SolidFetch; allowLegacy?: boolean;
}): Promise<ToursState> {
  run = validateActiveRun(podRoot, run);
  const resource = await fetcher(run.resourceUrl, { cache: "no-store", redirect: "error" });
  checkResponse(resource, run.resourceUrl);
  const etag = strongEtag(resource);
  const existing = await resource.json();
  const snapshot = await loadStateSnapshot(podRoot, fetcher);
  const current = snapshot.state.activeRun;
  if (!current || current.scenarioRunId !== run.scenarioRunId || current.phase !== "published" ||
      (!allowLegacy && current.donationMode !== "continuous")) {
    throw new Error("Donation changed or was revoked. Synchronization stopped.");
  }
  if (!snapshot.etag) throw new Error("Donation state has no strong ETag.");
  const payload = publishedActivityCollection(snapshot.state.activities, current.scenarioRunId, "continuous");
  const marker = await loadPublishedMarkerSnapshot(podRoot, fetcher);
  if (!marker.marker || marker.marker.scenarioRunId !== current.scenarioRunId ||
      marker.marker.distributionUrl !== current.resourceUrl || !marker.etag) {
    throw new Error("Donation marker changed or was revoked.");
  }
  // Upgrade only explicitly authorized prototype donors; fresh donations already
  // carry this mode from their first access request.
  if (marker.marker.donationMode !== "continuous") {
    if (!allowLegacy) throw new Error("Continuous donation was not authorized.");
    const markerUrl = storageUrls(podRoot).marker;
    checkResponse(await fetcher(markerUrl, {
      method: "PUT", redirect: "error", headers: { "Content-Type": "application/json", "If-Match": marker.etag },
      body: JSON.stringify({ ...marker.marker, donationMode: "continuous" }),
    }), markerUrl);
  }
  if (JSON.stringify(existing) !== JSON.stringify(payload)) {
    checkResponse(await fetcher(current.resourceUrl, {
      method: "PUT", redirect: "error", headers: { "Content-Type": "application/geo+json", "If-Match": etag },
      body: JSON.stringify(payload),
    }), current.resourceUrl);
  }
  const verified = await fetcher(current.resourceUrl, { cache: "no-store", redirect: "error" });
  checkResponse(verified, current.resourceUrl);
  if (JSON.stringify(await verified.json()) !== JSON.stringify(payload)) {
    throw new Error("Donation was changed concurrently; retry required.");
  }
  const updated: ToursState = { ...snapshot.state, activeRun: { ...current,
    donationMode: "continuous", activityIds: snapshot.state.activities.map(activity => activity.id),
    lastSyncedAt: new Date().toISOString(),
  } };
  return (await saveStateIfUnchanged(podRoot, updated, snapshot.etag, webId, fetcher)).state;
}
