import { describe, expect, it } from "vitest";
import { validateActiveRun, validateToursState } from "./stateValidation";

const podRoot = "https://pod.example/laura/";
const scenarioRunId = "49f3344a-e58b-4f6a-a874-84e3815620e6";
const activityId = "0c8744e7-3bd1-4968-8e57-460ff3b828dc";
const runContainerUrl = `${podRoot}solid-tours/runs/${scenarioRunId}/`;
const activeRun = {
  scenarioRunId,
  activityIds: [activityId],
  resourceUrl: `${runContainerUrl}activity.geojson`,
  manifestUrl: `${runContainerUrl}manifest.ttl`,
  runContainerUrl,
  datasetIdentifier: `solid-tours-activity-${scenarioRunId}`,
  catalogDatasetUrl: `${podRoot}catalog/ds/solid-tours-activity-${scenarioRunId}.ttl#it`,
  publishedAt: "2026-08-20T12:00:00.000Z",
};

describe("destructive state validation", () => {
  it("accepts only deterministically derived run resources", () => {
    expect(validateActiveRun(podRoot, activeRun)).toEqual({ ...activeRun, phase: "published" });
  });

  it("migrates a legacy single-activity run so it can still be reset", () => {
    const { activityIds: _activityIds, ...base } = activeRun;
    expect(validateActiveRun(podRoot, { ...base, activityId })).toEqual({
      ...activeRun,
      phase: "published",
    });
  });

  it.each(["publishing", "published", "resetting"] as const)(
    "accepts the %s run phase",
    (phase) => {
      expect(validateActiveRun(podRoot, { ...activeRun, phase }).phase).toBe(phase);
    }
  );

  it("rejects an unknown run phase", () => {
    expect(() => validateActiveRun(podRoot, { ...activeRun, phase: "unknown" })).toThrow(
      /Publish-Phase/
    );
  });

  it("hydrates a legacy state with the canonical bulk activityIds field", () => {
    const { activityIds: _activityIds, ...base } = activeRun;
    const state = {
      schemaVersion: 1,
      drafts: [],
      activities: [
        {
          id: activityId,
          draftId: "8db47d3b-8a4f-4a74-b086-77c1c7630bf7",
          name: "Legacy tour",
          activityType: "walking",
          geometry: [[[7.1, 51.2], [7.2, 51.3]]],
          completedDate: "2026-08-20",
          completedAt: "2026-08-20T13:00:00.000Z",
          activitySummary: {
            distanceMeters: 13_100,
            activeMinutes: 175,
            durationSource: "default-speed",
            derivationModel: "solid-tours-demo-v1",
            averagePaceMinutesPerKm: 13.4,
            estimatedSteps: 17_500,
          },
        },
      ],
      activeRun: { ...base, activityId },
    };

    expect(validateToursState(podRoot, state).activeRun?.activityIds).toEqual([activityId]);
  });

  it("migrates legacy OSRM/activity drafts to neutral routes without changing private activities", () => {
    const completedActivity = {
      id: activityId,
      draftId: "8db47d3b-8a4f-4a74-b086-77c1c7630bf7",
      name: "Legacy bike tour",
      activityType: "cycling",
      geometry: [[[7.1, 51.2], [7.2, 51.3]]],
      completedDate: "2026-08-20",
      completedAt: "2026-08-20T13:00:00.000Z",
      activitySummary: {
        distanceMeters: 13_100,
        activeMinutes: 55,
        durationSource: "osrm",
        derivationModel: "solid-tours-demo-v1",
        averageSpeedKmh: 14.3,
      },
    };
    const migrated = validateToursState(podRoot, {
      schemaVersion: 1,
      drafts: [
        {
          id: completedActivity.draftId,
          name: "Legacy route",
          activityType: "cycling",
          routeSource: "osrm",
          geometry: completedActivity.geometry,
          durationMinutes: 55,
          durationSource: "osrm",
          createdAt: "2026-08-20T12:00:00.000Z",
          updatedAt: "2026-08-20T12:00:00.000Z",
        },
      ],
      activities: [completedActivity],
      activeRun: null,
    });

    expect(migrated.drafts[0]).toEqual({
      id: completedActivity.draftId,
      name: "Legacy route",
      routeSource: "drawn",
      geometry: completedActivity.geometry,
      createdAt: "2026-08-20T12:00:00.000Z",
      updatedAt: "2026-08-20T12:00:00.000Z",
    });
    expect(migrated.activities[0]).toEqual(completedActivity);
  });

  it("rejects a manipulated deletion target before reset", () => {
    expect(() =>
      validateActiveRun(podRoot, {
        ...activeRun,
        resourceUrl: "https://pod.example/laura/private/unrelated.geojson",
      })
    ).toThrow(/resourceUrl/);
  });
});
