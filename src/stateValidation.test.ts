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

  it("migrates legacy catalog publications to the published phase", () => {
    const routeTemplateId = "69020722-f94e-4d99-9aac-37b33d5607c7";
    const sourceDraftId = "8db47d3b-8a4f-4a74-b086-77c1c7630bf7";
    const datasetIdentifier = `solid-tours-route-template-${routeTemplateId}`;
    const publication = {
      routeTemplateId,
      sourceDraftId,
      sourceDraftUpdatedAt: "2026-08-20T12:00:00.000Z",
      resourceUrl: `${podRoot}solid-tours/public/cataloged-routes/${routeTemplateId}.geojson`,
      datasetIdentifier,
      catalogDatasetUrl: `${podRoot}catalog/ds/${datasetIdentifier}.ttl#it`,
      publishedAt: "2026-08-20T14:00:00.000Z",
    };

    const state = validateToursState(podRoot, {
      schemaVersion: 1,
      drafts: [],
      activities: [],
      catalogPublications: [publication],
      activeRun: null,
    });

    expect(state.catalogPublications).toEqual([
      {
        ...publication,
        phase: "published",
        phaseChangedAt: publication.publishedAt,
      },
    ]);
  });

  it.each(["publishing", "published", "updating", "removing"] as const)(
    "accepts the %s catalog publication phase",
    (phase) => {
      const routeTemplateId = "69020722-f94e-4d99-9aac-37b33d5607c7";
      const datasetIdentifier = `solid-tours-route-template-${routeTemplateId}`;
      const state = validateToursState(podRoot, {
        schemaVersion: 1,
        drafts: [],
        activities: [],
        catalogPublications: [
          {
            phase,
            routeTemplateId,
            sourceDraftId: "8db47d3b-8a4f-4a74-b086-77c1c7630bf7",
            sourceDraftUpdatedAt: "2026-08-20T12:00:00.000Z",
            resourceUrl: `${podRoot}solid-tours/public/cataloged-routes/${routeTemplateId}.geojson`,
            datasetIdentifier,
            catalogDatasetUrl: `${podRoot}catalog/ds/${datasetIdentifier}.ttl#it`,
            publishedAt: "2026-08-20T14:00:00.000Z",
          },
        ],
        activeRun: null,
      });
      expect(state.catalogPublications[0].phase).toBe(phase);
      expect(state.catalogPublications[0].phaseChangedAt).toBe(
        "2026-08-20T14:00:00.000Z"
      );
    }
  );

  it("preserves a valid resumable catalog update and binds it to its baseline draft", () => {
    const routeTemplateId = "69020722-f94e-4d99-9aac-37b33d5607c7";
    const sourceDraftId = "8db47d3b-8a4f-4a74-b086-77c1c7630bf7";
    const datasetIdentifier = `solid-tours-route-template-${routeTemplateId}`;
    const baseline = {
      id: sourceDraftId,
      name: "Old route",
      routeSource: "drawn",
      geometry: [[[7.1, 51.2], [7.2, 51.3]]],
      createdAt: "2026-08-20T11:00:00.000Z",
      updatedAt: "2026-08-20T12:00:00.000Z",
    };
    const pendingDraft = {
      ...baseline,
      name: "Updated route",
      updatedAt: "2026-08-20T15:00:00.000Z",
    };
    const publication = {
      phase: "updating",
      phaseChangedAt: "2026-08-20T15:00:00.000Z",
      routeTemplateId,
      sourceDraftId,
      sourceDraftUpdatedAt: baseline.updatedAt,
      resourceUrl: `${podRoot}solid-tours/public/cataloged-routes/${routeTemplateId}.geojson`,
      datasetIdentifier,
      catalogDatasetUrl: `${podRoot}catalog/ds/${datasetIdentifier}.ttl#it`,
      publishedAt: "2026-08-20T14:00:00.000Z",
      pendingUpdate: {
        operationId: "9be23928-bff4-49ad-981d-2a6d48fc3c20",
        leaseId: "f8b321a2-f550-4e90-8f39-09e80eced0b3",
        draft: pendingDraft,
      },
    };

    const state = validateToursState(podRoot, {
      schemaVersion: 1,
      drafts: [baseline],
      activities: [],
      catalogPublications: [publication],
      activeRun: null,
    });

    expect(state.catalogPublications[0].pendingUpdate).toEqual(publication.pendingUpdate);
    expect(() =>
      validateToursState(podRoot, {
        ...state,
        catalogPublications: [{ ...publication, phase: "published" }],
      })
    ).toThrow(/Format/);
    expect(() =>
      validateToursState(podRoot, {
        ...state,
        catalogPublications: [
          {
            ...publication,
            pendingUpdate: {
              ...publication.pendingUpdate,
              draft: { ...pendingDraft, createdAt: "2026-08-19T11:00:00.000Z" },
            },
          },
        ],
      })
    ).toThrow(/Katalogveröffentlichungen/);
  });

  it("rejects an unknown catalog publication phase", () => {
    const routeTemplateId = "69020722-f94e-4d99-9aac-37b33d5607c7";
    const datasetIdentifier = `solid-tours-route-template-${routeTemplateId}`;
    expect(() =>
      validateToursState(podRoot, {
        schemaVersion: 1,
        drafts: [],
        activities: [],
        catalogPublications: [
          {
            phase: "unknown",
            routeTemplateId,
            sourceDraftId: "8db47d3b-8a4f-4a74-b086-77c1c7630bf7",
            sourceDraftUpdatedAt: "2026-08-20T12:00:00.000Z",
            resourceUrl: `${podRoot}solid-tours/public/cataloged-routes/${routeTemplateId}.geojson`,
            datasetIdentifier,
            catalogDatasetUrl: `${podRoot}catalog/ds/${datasetIdentifier}.ttl#it`,
            publishedAt: "2026-08-20T14:00:00.000Z",
          },
        ],
        activeRun: null,
      })
    ).toThrow(/Format/);
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

  it("preserves valid adopted Catalog provenance across state hydration", () => {
    const draft = {
      id: "8db47d3b-8a4f-4a74-b086-77c1c7630bf7",
      name: "Adopted route",
      routeSource: "geojson",
      geometry: [[[7.1, 51.2], [7.2, 51.3]]],
      adoptedFromCatalog: {
        routeTemplateId: "69020722-f94e-4d99-9aac-37b33d5607c7",
        datasetUrl: "https://publisher.example/catalog/ds/route.ttl#it",
        distributionUrl: "https://publisher.example/routes/route.geojson",
      },
      createdAt: "2026-08-20T12:00:00.000Z",
      updatedAt: "2026-08-20T12:00:00.000Z",
    };

    const hydrated = validateToursState(podRoot, {
      schemaVersion: 1,
      drafts: [draft],
      activities: [],
      catalogPublications: [],
      activeRun: null,
    });
    expect(hydrated.drafts[0]).toEqual(draft);

    expect(() =>
      validateToursState(podRoot, {
        schemaVersion: 1,
        drafts: [
          {
            ...draft,
            adoptedFromCatalog: {
              ...draft.adoptedFromCatalog,
              datasetUrl: "not-an-absolute-url",
            },
          },
        ],
        activities: [],
        catalogPublications: [],
        activeRun: null,
      })
    ).toThrow(/Format/);
  });

  it("continues to hydrate legacy drafts that predate Catalog provenance", () => {
    const legacyDraft = {
      id: "8db47d3b-8a4f-4a74-b086-77c1c7630bf7",
      name: "Legacy adopted route",
      routeSource: "geojson",
      geometry: [[[7.1, 51.2], [7.2, 51.3]]],
      createdAt: "2026-08-20T12:00:00.000Z",
      updatedAt: "2026-08-20T12:00:00.000Z",
    };
    const hydrated = validateToursState(podRoot, {
      schemaVersion: 1,
      drafts: [legacyDraft],
      activities: [],
      catalogPublications: [],
      activeRun: null,
    });

    expect(hydrated.drafts[0]).toEqual(legacyDraft);
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
