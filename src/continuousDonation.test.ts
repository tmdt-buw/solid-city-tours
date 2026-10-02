import { beforeEach, describe, expect, it, vi } from "vitest";
import { donationNeedsSync, legacyContinuousDonationAllowed, synchronizeContinuousDonation } from "./continuousDonation";
import { deriveActivitySummary, publishedActivityCollection } from "./domain";
import { loadPublishedMarkerSnapshot, loadStateSnapshot, saveStateIfUnchanged } from "./solidStorage";
import type { ActiveRun, CompletedActivity, ToursState } from "./types";

vi.mock("./solidStorage", async () => ({
  ...await vi.importActual<typeof import("./solidStorage")>("./solidStorage"),
  loadPublishedMarkerSnapshot: vi.fn(), loadStateSnapshot: vi.fn(), saveStateIfUnchanged: vi.fn(),
}));
const podRoot = "https://pod.example/laura/";
const webId = `${podRoot}profile/card#me`;
const runId = "49f3344a-e58b-4f6a-a874-84e3815620e6";
const geometry: CompletedActivity["geometry"] = [[[7.15, 51.25], [7.15, 51.259]]];
const activity = (id: string): CompletedActivity => ({
  id, draftId: "8db47d3b-8a4f-4a74-b086-77c1c7630bf7", name: "Tour", geometry,
  activityType: "walking", completedDate: "2026-10-02", completedAt: "2026-10-02T10:00:00.000Z",
  activitySummary: deriveActivitySummary({ activityType: "walking", geometry }),
});
const first = activity("0c8744e7-3bd1-4968-8e57-460ff3b828dc");
const second = activity("1c8744e7-3bd1-4968-8e57-460ff3b828dc");
const run: ActiveRun = {
  phase: "published", donationMode: "continuous", scenarioRunId: runId, activityIds: [first.id],
  runContainerUrl: `${podRoot}solid-tours/runs/${runId}/`,
  resourceUrl: `${podRoot}solid-tours/runs/${runId}/activity.geojson`,
  manifestUrl: `${podRoot}solid-tours/runs/${runId}/manifest.ttl`,
  datasetIdentifier: `solid-tours-activity-${runId}`,
  catalogDatasetUrl: `${podRoot}catalog/ds/solid-tours-activity-${runId}.ttl#it`,
  publishedAt: "2026-10-01T12:00:00.000Z",
};
let state: ToursState;
let body: unknown;
let version: number;
let resourceStatus: number;
let conflict: boolean;
let markerMode: "continuous" | undefined;
let lostResponse: boolean;
let fetcher: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  state = { schemaVersion: 1, drafts: [], catalogPublications: [], activities: [second, first], activeRun: { ...run } };
  body = publishedActivityCollection([first], runId, "continuous");
  version = 1; resourceStatus = 200; conflict = false; markerMode = "continuous"; lostResponse = false;
  vi.mocked(loadStateSnapshot).mockImplementation(async () => ({ state, etag: '"state-v1"' }));
  vi.mocked(loadPublishedMarkerSnapshot).mockImplementation(async () => ({ etag: '"marker-v1"', marker: {
    schemaVersion: 1, source: "solid-tours", status: "published", scenarioRunId: runId,
    datasetIdentifier: run.datasetIdentifier, catalogDatasetUrl: run.catalogDatasetUrl,
    distributionUrl: run.resourceUrl, publishedAt: run.publishedAt,
    ...(markerMode ? { donationMode: markerMode } : {}),
  } }));
  vi.mocked(saveStateIfUnchanged).mockImplementation(async (_root, updated) => ({ state: updated, etag: '"state-v2"' }));
  fetcher = vi.fn(async (input, init = {}) => {
    const url = String(input);
    if (url.endsWith("/current-run.json") && init.method === "PUT") {
      expect(init.headers["If-Match"]).toBe('"marker-v1"');
      markerMode = "continuous";
      return new Response(null, { status: 204 });
    }
    expect(url).toBe(run.resourceUrl); // ACL / container writes are forbidden here.
    if (init.method === "PUT") {
      expect(init.headers["If-Match"]).toBe(`"v${version}"`);
      if (conflict) return new Response(null, { status: 412 });
      body = JSON.parse(init.body); version++;
      if (lostResponse) { lostResponse = false; throw new Error("Connection lost after PUT"); }
      return new Response(null, { status: 204 });
    }
    return new Response(JSON.stringify(body), { status: resourceStatus, headers: { ETag: `"v${version}"` } });
  });
});
const sync = (allowLegacy = false) => synchronizeContinuousDonation({ podRoot, webId, run, fetcher, allowLegacy });

describe("continuous donation", () => {
  it("adds new activities at the same address, preserves ACLs and saves with the observed state ETag", async () => {
    const updated = await sync();
    expect(updated.activeRun?.scenarioRunId).toBe(runId);
    expect(updated.activeRun?.activityIds).toEqual([second.id, first.id]);
    expect(updated.activeRun?.lastSyncedAt).toBeTruthy();
    expect(body).toMatchObject({ properties: { donationMode: "continuous", activityCount: 2 } });
    expect(saveStateIfUnchanged).toHaveBeenCalledWith(podRoot, updated, '"state-v1"', webId, fetcher);
    expect(donationNeedsSync(updated)).toBe(false);
  });
  it("detects incomplete work and never silently migrates other accounts", async () => {
    expect(donationNeedsSync(state)).toBe(true);
    delete state.activeRun!.donationMode;
    expect(donationNeedsSync(state)).toBe(false);
    expect(donationNeedsSync(state, true)).toBe(true);
    await expect(sync()).rejects.toThrow(/revoked/);
    expect(fetcher.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
  });
  it("upgrades only authorized legacy donations without changing the resource address", async () => {
    delete state.activeRun!.donationMode; markerMode = undefined;
    const updated = await sync(true);
    expect(updated.activeRun?.donationMode).toBe("continuous");
    expect(updated.activeRun?.resourceUrl).toBe(run.resourceUrl);
    expect(markerMode).toBe("continuous");
  });
  it.each([404, 403])("does not recreate a missing or inaccessible resource (%s)", async status => {
    resourceStatus = status;
    await expect(sync()).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(saveStateIfUnchanged).not.toHaveBeenCalled();
  });
  it("does not overwrite concurrent updates or claim they were saved", async () => {
    conflict = true;
    await expect(sync()).rejects.toThrow(/412/);
    expect(saveStateIfUnchanged).not.toHaveBeenCalled();
  });
  it("stops before writing when a concurrent revocation has started", async () => {
    state.activeRun!.phase = "resetting";
    await expect(sync()).rejects.toThrow(/revoked/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("retries a lost response without duplicate activity publication", async () => {
    lostResponse = true;
    await expect(sync()).rejects.toThrow(/Connection lost/);
    expect(saveStateIfUnchanged).not.toHaveBeenCalled();
    const updated = await sync();
    expect(updated.activeRun?.activityIds).toHaveLength(2);
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(1);
  });
  it("allows only exact configured legacy WebIDs", () => {
    const configWindow = window as Window & { __APP_CONFIG__?: unknown };
    configWindow.__APP_CONFIG__ = { cityToursLegacyContinuousWebIds: [webId] };
    expect(legacyContinuousDonationAllowed(webId)).toBe(true);
    expect(legacyContinuousDonationAllowed(`${webId}-other`)).toBe(false);
    delete configWindow.__APP_CONFIG__;
    expect(legacyContinuousDonationAllowed(webId)).toBe(false);
  });
});
