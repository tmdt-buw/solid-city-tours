import { beforeEach, describe, expect, it, vi } from "vitest";

const solidClientMocks = vi.hoisted(() => ({
  deleteFile: vi.fn(),
  getResourceInfoWithAcl: vi.fn(),
}));

vi.mock("@inrupt/solid-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@inrupt/solid-client")>();
  return {
    ...actual,
    deleteFile: solidClientMocks.deleteFile,
    getResourceInfoWithAcl: solidClientMocks.getResourceInfoWithAcl,
  };
});

import {
  clearPublishedMarker,
  deleteActivity,
  loadActivityMasterSnapshot,
} from "./solidStorage";

const activity = {
  id: "49f3344a-e58b-4f6a-a874-84e3815620e6",
  draftId: "0c8744e7-3bd1-4968-8e57-460ff3b828dc",
  name: "Wuppertaler Runde",
  activityType: "walking" as const,
  geometry: [[[7.1, 51.2], [7.2, 51.3]]] as [[number, number][]],
  completedDate: "2026-08-20",
  completedAt: "2026-08-20T13:00:00.000Z",
  activitySummary: {
    distanceMeters: 13_100,
    activeMinutes: 175,
    durationSource: "default-speed" as const,
    derivationModel: "solid-tours-demo-v1" as const,
    averagePaceMinutesPerKm: 13.4,
    estimatedSteps: 17_500,
  },
};

const activityFeature = {
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

describe("published marker deletion", () => {
  beforeEach(() => {
    solidClientMocks.deleteFile.mockReset();
    solidClientMocks.getResourceInfoWithAcl.mockReset();
  });

  it("treats an exactly fetched marker 404 as already reset", async () => {
    const podRoot = "https://pod.example/hannah/";
    const scenarioRunId = "49f3344a-e58b-4f6a-a874-84e3815620e6";
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 404 }));

    await expect(
      clearPublishedMarker(podRoot, scenarioRunId, fetcher)
    ).resolves.toBeUndefined();

    expect(fetcher).toHaveBeenCalledWith(
      `${podRoot}solid-tours/public/current-run.json`,
      expect.objectContaining({ cache: "no-store", redirect: "error" })
    );
    expect(solidClientMocks.deleteFile).not.toHaveBeenCalled();
    expect(solidClientMocks.getResourceInfoWithAcl).not.toHaveBeenCalled();
  });

  it("deletes a private completed-activity master resource by its activity id", async () => {
    const podRoot = "https://pod.example/hannah/";
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));

    await expect(
      deleteActivity(podRoot, activity.id, '"activity-v1"', fetcher)
    ).resolves.toBeUndefined();

    expect(fetcher).toHaveBeenCalledWith(
      `${podRoot}solid-tours/activities/${activity.id}.geojson`,
      expect.objectContaining({
        method: "DELETE",
        redirect: "error",
        headers: expect.objectContaining({ "If-Match": '"activity-v1"' }),
      })
    );
    expect(solidClientMocks.deleteFile).not.toHaveBeenCalled();
  });

  it("loads and verifies the full private master together with its strong ETag", async () => {
    const podRoot = "https://pod.example/hannah/";
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify(activityFeature), {
        status: 200,
        headers: { "Content-Type": "application/geo+json", ETag: '"activity-v1"' },
      })
    );

    await expect(
      loadActivityMasterSnapshot(podRoot, activity, fetcher)
    ).resolves.toEqual({ etag: '"activity-v1"' });
  });

  it("fails closed when the master changed before conditional DELETE", async () => {
    const podRoot = "https://pod.example/hannah/";
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 412 }));

    await expect(
      deleteActivity(podRoot, activity.id, '"activity-v1"', fetcher)
    ).rejects.toMatchObject({ name: "ActivityMasterConflictError", kind: "changed" });
  });
});
