import { describe, expect, it } from "vitest";
import {
  DERIVATION_MODEL,
  deriveActivitySummary,
  isValidCompletedDate,
  MAX_PUBLISHED_ACTIVITIES,
  MAX_PUBLISHED_POINTS,
  publishedActivityCollection,
  publishedFeature,
  previewActivityCompletion,
  routeDistanceMeters,
} from "./domain";
import type { CompletedActivity, MultiLineCoordinates } from "./types";

const oneKilometer: MultiLineCoordinates = [[[7.15, 51.25], [7.15, 51.259]]];
const runId = "49f3344a-e58b-4f6a-a874-84e3815620e6";

describe("activity derivation", () => {
  it("accepts only real ISO calendar dates", () => {
    expect(isValidCompletedDate("2026-08-20")).toBe(true);
    expect(isValidCompletedDate("2026-02-30")).toBe(false);
    expect(isValidCompletedDate("")).toBe(false);
  });

  it("previews completion without creating activity identity fields", () => {
    const preview = previewActivityCompletion(
      { geometry: oneKilometer },
      "2026-08-20",
      "walking"
    );
    expect(preview).not.toHaveProperty("id");
    expect(preview).not.toHaveProperty("completedAt");
  });

  it("uses the demo walking speed and rounds disclosure values", () => {
    const summary = deriveActivitySummary({
      activityType: "walking",
      geometry: oneKilometer,
    });
    expect(summary.durationSource).toBe("default-speed");
    expect(summary.derivationModel).toBe(DERIVATION_MODEL);
    expect(summary.activeMinutes % 5).toBe(0);
    expect(summary.activeMinutes).toBeGreaterThan(0);
    expect("estimatedSteps" in summary && summary.estimatedSteps % 100).toBe(0);
  });

  it("keeps a historical OSRM duration source and omits walking-only fields for cycling", () => {
    const summary = deriveActivitySummary({
      activityType: "cycling",
      geometry: oneKilometer,
      durationMinutes: 12.6,
      durationSource: "osrm",
    });
    expect(summary.activeMinutes).toBe(15);
    expect(summary.durationSource).toBe("osrm");
    expect(summary).toHaveProperty("averageSpeedKmh");
    expect(summary).not.toHaveProperty("estimatedSteps");
    expect(summary).not.toHaveProperty("averagePaceMinutesPerKm");
  });

  it("calculates line distance with the haversine model", () => {
    expect(routeDistanceMeters(oneKilometer)).toBeGreaterThan(990);
    expect(routeDistanceMeters(oneKilometer)).toBeLessThan(1015);
  });
});

describe("published snapshot", () => {
  it("emits exactly one schema 2.0 MultiLineString feature", () => {
    const summary = deriveActivitySummary({ activityType: "walking", geometry: oneKilometer });
    const activity: CompletedActivity = {
      id: "activity-1",
      draftId: "draft-1",
      name: "Samba-Trasse",
      activityType: "walking",
      geometry: oneKilometer,
      completedDate: "2026-08-20",
      completedAt: "2026-08-20T10:00:00.000Z",
      activitySummary: summary,
    };
    const feature = publishedFeature(activity, runId);
    expect(feature.type).toBe("Feature");
    expect(feature.geometry).toEqual({ type: "MultiLineString", coordinates: oneKilometer });
    expect(Object.keys(feature.properties).sort()).toEqual(
      ["activitySummary", "activityType", "completedDate", "scenarioRunId", "schemaVersion", "source"].sort()
    );
    expect(feature.properties).toMatchObject({
      schemaVersion: "2.0",
      source: "solid-tours",
      scenarioRunId: runId,
    });
    expect(() => publishedFeature(activity, "49f3344a-e58b-1f6a-a874-84e3815620e6")).toThrow(
      /scenarioRunId/
    );
  });

  it("revalidates Pod state and rederives the public summary before publishing", () => {
    const activity: CompletedActivity = {
      id: "activity-1",
      draftId: "draft-1",
      name: "Private name",
      activityType: "walking",
      geometry: oneKilometer,
      completedDate: "2026-08-20",
      completedAt: "2026-08-20T10:00:00.000Z",
      activitySummary: {
        distanceMeters: 999_999,
        activeMinutes: 15,
        durationSource: "default-speed",
        derivationModel: "solid-tours-demo-v1",
        averagePaceMinutesPerKm: 999,
        estimatedSteps: 999_900,
      },
    };
    const feature = publishedFeature(activity, runId);
    expect(feature.properties.activitySummary.distanceMeters).toBe(1000);
    expect("estimatedSteps" in feature.properties.activitySummary && feature.properties.activitySummary.estimatedSteps).toBe(1300);

    expect(() => publishedFeature({ ...activity, completedDate: "2026-02-30" }, runId)).toThrow(
      /Abschlussdatum/
    );
  });

  it("publishes historical OSRM provenance without relabelling its stored duration", () => {
    const activity: CompletedActivity = {
      id: "activity-legacy-osrm",
      draftId: "draft-legacy-osrm",
      name: "Historical route",
      activityType: "cycling",
      geometry: oneKilometer,
      completedDate: "2026-08-20",
      completedAt: "2026-08-20T10:00:00.000Z",
      activitySummary: {
        distanceMeters: 1000,
        activeMinutes: 15,
        durationSource: "osrm",
        derivationModel: "solid-tours-demo-v1",
        averageSpeedKmh: 4,
      },
    };

    const published = publishedFeature(activity, runId);
    expect(published.properties.activitySummary.durationSource).toBe("osrm");
    expect(published.properties.activitySummary.activeMinutes).toBe(15);
  });

  it("rounds 2.25 km to about 3,000 walking steps", () => {
    const geometry: MultiLineCoordinates = [[[7.15, 51.25], [7.15, 51.27024]]];
    const summary = deriveActivitySummary({ activityType: "walking", geometry });
    expect(summary.distanceMeters).toBe(2300);
    expect("estimatedSteps" in summary && summary.estimatedSteps).toBe(3000);
  });

  it("emits one privacy-redacted schema 3.0 collection for all completed activities", () => {
    const walking: CompletedActivity = {
      id: "private-activity-1",
      draftId: "private-draft-1",
      name: "Private walking name",
      activityType: "walking",
      geometry: oneKilometer,
      completedDate: "2026-08-20",
      completedAt: "2026-08-20T10:00:00.000Z",
      activitySummary: deriveActivitySummary({ activityType: "walking", geometry: oneKilometer }),
    };
    const cycling: CompletedActivity = {
      ...walking,
      id: "private-activity-2",
      draftId: "private-draft-2",
      name: "Private cycling name",
      activityType: "cycling",
      completedDate: "2026-08-21",
      activitySummary: deriveActivitySummary({ activityType: "cycling", geometry: oneKilometer }),
    };

    const collection = publishedActivityCollection([walking, cycling], runId);

    expect(collection.type).toBe("FeatureCollection");
    expect(collection.properties).toEqual({
      schemaVersion: "3.0",
      source: "solid-tours",
      scenarioRunId: runId,
      donationScope: "all-completed-activities",
      activityCount: 2,
    });
    expect(collection.features).toHaveLength(2);
    expect(Object.keys(collection.features[0].properties).sort()).toEqual(
      ["activitySummary", "activityType", "completedDate"].sort()
    );
    const serialized = JSON.stringify(collection);
    expect(serialized).not.toContain("private-activity");
    expect(serialized).not.toContain("private-draft");
    expect(serialized).not.toContain("Private walking name");
    expect(serialized).not.toContain("completedAt");
  });

  it("fails before publication when a bulk snapshot exceeds its limits", () => {
    const activity: CompletedActivity = {
      id: "activity-1",
      draftId: "draft-1",
      name: "Tour",
      activityType: "walking",
      geometry: oneKilometer,
      completedDate: "2026-08-20",
      completedAt: "2026-08-20T10:00:00.000Z",
      activitySummary: deriveActivitySummary({ activityType: "walking", geometry: oneKilometer }),
    };
    expect(() => publishedActivityCollection([], runId)).toThrow(/mindestens eine/);
    expect(() =>
      publishedActivityCollection(Array.from({ length: MAX_PUBLISHED_ACTIVITIES + 1 }, () => activity), runId)
    ).toThrow(/höchstens 100/);

    const tooManyPoints = Array.from(
      { length: MAX_PUBLISHED_POINTS + 1 },
      (_, index) => [7.15 + index * 0.000001, 51.25] as [number, number]
    );
    expect(() =>
      publishedActivityCollection(
        [{ ...activity, geometry: [tooManyPoints] }],
        runId
      )
    ).toThrow(/Routenpunkte/);
  });
});
