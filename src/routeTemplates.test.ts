import { describe, expect, it } from "vitest";
import {
  ROUTE_TEMPLATE_IDENTIFIER_PREFIX,
  adoptCatalogedRoute,
  availableCatalogedRoutes,
  catalogedRouteFromSnapshot,
  createRouteTemplateSnapshot,
  isDraftEligibleForCatalogPublication,
  parseRouteTemplateSnapshot,
  type CatalogedRoute,
} from "./routeTemplates";

const ROUTE_TEMPLATE_ID = "49f3344a-e58b-4f6a-a874-84e3815620e6";
const GEOMETRY = [
  [
    [7.101, 51.201],
    [7.111, 51.211],
    [7.121, 51.221],
  ],
] as [number, number][][];

describe("public route templates", () => {
  it("creates a minimal snapshot without private draft metadata", () => {
    const snapshot = createRouteTemplateSnapshot(
      { name: "  Wuppertal ridge route  ", geometry: GEOMETRY },
      ROUTE_TEMPLATE_ID
    );

    expect(snapshot).toEqual({
      type: "Feature",
      geometry: { type: "MultiLineString", coordinates: GEOMETRY },
      properties: {
        schemaVersion: "1.0",
        source: "solid-tours-route-template",
        routeTemplateId: ROUTE_TEMPLATE_ID,
        name: "Wuppertal ridge route",
      },
    });
    expect(JSON.stringify(snapshot)).not.toMatch(
      /tourId|draftId|webId|contact|routeSource|createdAt|updatedAt|duration/i
    );

    GEOMETRY[0][0][0] = 8;
    expect(snapshot.geometry.coordinates[0][0][0]).toBe(7.101);
    GEOMETRY[0][0][0] = 7.101;
  });

  it("accepts only the exact public schema and matching Catalog identifier", () => {
    const snapshot = createRouteTemplateSnapshot(
      { name: "Samba trail", geometry: GEOMETRY },
      ROUTE_TEMPLATE_ID
    );
    const identifier = `${ROUTE_TEMPLATE_IDENTIFIER_PREFIX}${ROUTE_TEMPLATE_ID}`;

    expect(parseRouteTemplateSnapshot(snapshot, identifier)).toEqual(snapshot);
    expect(() =>
      parseRouteTemplateSnapshot(snapshot, `${ROUTE_TEMPLATE_IDENTIFIER_PREFIX}8db47d3b-8a4f-4a74-b086-77c1c7630bf7`)
    ).toThrow(/passen nicht zusammen/);
    expect(() =>
      parseRouteTemplateSnapshot({
        ...snapshot,
        properties: { ...snapshot.properties, creatorWebId: "https://pod.example/alice#me" },
      })
    ).toThrow(/ung.*ltiges Format/);
    expect(() =>
      parseRouteTemplateSnapshot({
        ...snapshot,
        privateDescription: "must never become public",
      })
    ).toThrow(/ung.*ltiges Format/);
  });

  it("rejects invalid IDs, names, geometry, and oversized point sets", () => {
    expect(() =>
      createRouteTemplateSnapshot({ name: "Route", geometry: GEOMETRY }, "not-a-uuid")
    ).toThrow(/ID/);
    expect(() =>
      createRouteTemplateSnapshot({ name: "   ", geometry: GEOMETRY }, ROUTE_TEMPLATE_ID)
    ).toThrow(/Routenname/);
    expect(() =>
      createRouteTemplateSnapshot(
        { name: "Broken", geometry: [[[7.1, 51.2]]] },
        ROUTE_TEMPLATE_ID
      )
    ).toThrow(/mindestens zwei/);

    const tooManyPoints = Array.from({ length: 20_001 }, (_, index) => [
      7 + index / 1_000_000,
      51,
    ] as [number, number]);
    expect(() =>
      createRouteTemplateSnapshot(
        { name: "Too detailed", geometry: [tooManyPoints] },
        ROUTE_TEMPLATE_ID
      )
    ).toThrow(/20.*000 Punkte/);
  });

  it("turns a Catalog result into a deep-copied private draft with a new identity", () => {
    const snapshot = createRouteTemplateSnapshot(
      { name: "Nordbahntrasse", geometry: GEOMETRY },
      ROUTE_TEMPLATE_ID
    );
    const route = catalogedRouteFromSnapshot(
      {
        identifier: `${ROUTE_TEMPLATE_IDENTIFIER_PREFIX}${ROUTE_TEMPLATE_ID}`,
        description: "Public reusable route template from City Tours.",
        publisher: "Hannah Mueller",
        creatorWebId: "https://pod.example/hannah/profile/card#me",
        datasetUrl: "https://pod.example/hannah/catalog/ds/route.ttl#it",
        distributionUrl: "https://pod.example/hannah/solid-tours/public/cataloged-routes/route.geojson",
      },
      snapshot
    );

    const draft = adoptCatalogedRoute(route);
    expect(draft.id).not.toBe(ROUTE_TEMPLATE_ID);
    expect(draft).toMatchObject({
      name: "Nordbahntrasse",
      routeSource: "geojson",
      geometry: GEOMETRY,
    });
    expect(draft.createdAt).toBe(draft.updatedAt);
    expect(Number.isNaN(new Date(draft.createdAt).getTime())).toBe(false);

    route.geometry[0][0][0] = 9;
    expect(draft.geometry[0][0][0]).toBe(7.101);
  });

  it("keeps a private identity while retaining only stable Catalog provenance", () => {
    const route: CatalogedRoute = {
      routeTemplateId: ROUTE_TEMPLATE_ID,
      identifier: `${ROUTE_TEMPLATE_IDENTIFIER_PREFIX}${ROUTE_TEMPLATE_ID}`,
      name: "Shared route",
      description: "Public route",
      publisher: "Other Pod user",
      creatorWebId: "https://pod.example/other/profile/card#me",
      datasetUrl: "https://pod.example/other/catalog/ds/route.ttl#it",
      distributionUrl: "https://pod.example/other/routes/route.geojson",
      geometry: GEOMETRY,
      distanceMeters: 1_500,
    };

    const adopted = adoptCatalogedRoute(route);
    expect(adopted).toMatchObject({
      adoptedFromCatalog: {
        routeTemplateId: route.routeTemplateId,
        datasetUrl: route.datasetUrl,
        distributionUrl: route.distributionUrl,
      },
    });
    expect(adopted).not.toMatchObject({
      id: route.routeTemplateId,
      publisher: route.publisher,
      creatorWebId: route.creatorWebId,
    });
  });

  it("removes an adopted Catalog entry by stable identity, even when display metadata changes", () => {
    const route: CatalogedRoute = {
      routeTemplateId: ROUTE_TEMPLATE_ID,
      identifier: `${ROUTE_TEMPLATE_IDENTIFIER_PREFIX}${ROUTE_TEMPLATE_ID}`,
      name: "Shared route",
      description: "Public route",
      publisher: "Original publisher",
      datasetUrl: "https://pod.example/publisher/catalog/ds/route.ttl#it",
      distributionUrl: "https://pod.example/publisher/routes/route.geojson",
      geometry: GEOMETRY,
      distanceMeters: 1_500,
    };
    const adopted = adoptCatalogedRoute(route);
    const renamedResult = { ...route, name: "Renamed route", publisher: "Updated publisher" };

    expect(availableCatalogedRoutes([renamedResult], [adopted])).toEqual([]);
    expect(
      availableCatalogedRoutes(
        [
          {
            ...renamedResult,
            datasetUrl: "https://pod.example/other/catalog/ds/route.ttl#it",
            distributionUrl: "https://pod.example/other/routes/route.geojson",
          },
        ],
        [adopted]
      )
    ).toHaveLength(1);
  });

  it("does not offer routes published by the current WebID or retained in its publication state", () => {
    const ownWebId = "https://pod.example/hannah/profile/card#me";
    const route: CatalogedRoute = {
      routeTemplateId: ROUTE_TEMPLATE_ID,
      identifier: `${ROUTE_TEMPLATE_IDENTIFIER_PREFIX}${ROUTE_TEMPLATE_ID}`,
      name: "Rundweg A2 Ronsdorfer Talsperre",
      description: "Public route",
      publisher: "Hannah Mueller",
      creatorWebId: ownWebId,
      datasetUrl: "https://pod.example/hannah/catalog/ds/route.ttl#it",
      distributionUrl: `https://pod.example/hannah/solid-tours/public/cataloged-routes/${ROUTE_TEMPLATE_ID}.geojson`,
      geometry: GEOMETRY,
      distanceMeters: 1_500,
    };
    const publication = {
      routeTemplateId: route.routeTemplateId,
      catalogDatasetUrl: route.datasetUrl,
      resourceUrl: route.distributionUrl,
    };

    expect(
      availableCatalogedRoutes([route], [], { currentWebId: ownWebId })
    ).toEqual([]);
    expect(
      availableCatalogedRoutes([{ ...route, creatorWebId: undefined }], [], {
        currentWebId: ownWebId,
        ownPublications: [publication],
      })
    ).toEqual([]);
    expect(
      availableCatalogedRoutes([{ ...route, creatorWebId: undefined }], [], {
        currentWebId: ownWebId,
        currentPodRoot: "https://pod.example/hannah/",
      })
    ).toEqual([]);
    expect(
      availableCatalogedRoutes(
        [
          {
            ...route,
            creatorWebId: "https://pod.example/other/profile/card#me",
            datasetUrl: "https://pod.example/other/catalog/ds/route.ttl#it",
            distributionUrl: "https://pod.example/other/routes/route.geojson",
          },
        ],
        [],
        { currentWebId: ownWebId, ownPublications: [publication] }
      )
    ).toHaveLength(1);
  });

  it("marks adopted routes and their copies as ineligible for republication", () => {
    const route: CatalogedRoute = {
      routeTemplateId: ROUTE_TEMPLATE_ID,
      identifier: `${ROUTE_TEMPLATE_IDENTIFIER_PREFIX}${ROUTE_TEMPLATE_ID}`,
      name: "Shared route",
      description: "Public route",
      publisher: "Other Pod user",
      datasetUrl: "https://pod.example/other/catalog/ds/route.ttl#it",
      distributionUrl: "https://pod.example/other/routes/route.geojson",
      geometry: GEOMETRY,
      distanceMeters: 1_500,
    };
    const adopted = adoptCatalogedRoute(route);
    const adoptedCopy = {
      ...adopted,
      id: "69020722-f94e-4d99-9aac-37b33d5607c7",
    };

    expect(isDraftEligibleForCatalogPublication(adopted)).toBe(false);
    expect(isDraftEligibleForCatalogPublication(adoptedCopy)).toBe(false);
    expect(isDraftEligibleForCatalogPublication({ adoptedFromCatalog: undefined })).toBe(true);
  });

  it("recognizes an unambiguous legacy adoption without guessing between duplicate Catalog entries", () => {
    const route: CatalogedRoute = {
      routeTemplateId: ROUTE_TEMPLATE_ID,
      identifier: `${ROUTE_TEMPLATE_IDENTIFIER_PREFIX}${ROUTE_TEMPLATE_ID}`,
      name: "Legacy copied route",
      description: "Public route",
      publisher: "Publisher",
      datasetUrl: "https://pod.example/publisher/catalog/ds/route.ttl#it",
      distributionUrl: "https://pod.example/publisher/routes/route.geojson",
      geometry: GEOMETRY,
      distanceMeters: 1_500,
    };
    const legacyDraft = {
      id: "8db47d3b-8a4f-4a74-b086-77c1c7630bf7",
      name: route.name,
      routeSource: "geojson" as const,
      geometry: GEOMETRY,
      createdAt: "2026-08-20T12:00:00.000Z",
      updatedAt: "2026-08-20T12:00:00.000Z",
    };

    expect(availableCatalogedRoutes([route], [legacyDraft])).toEqual([]);

    const ambiguousCopy: CatalogedRoute = {
      ...route,
      routeTemplateId: "69020722-f94e-4d99-9aac-37b33d5607c7",
      identifier: "solid-tours-route-template-69020722-f94e-4d99-9aac-37b33d5607c7",
      datasetUrl: "https://pod.example/other/catalog/ds/route.ttl#it",
      distributionUrl: "https://pod.example/other/routes/route.geojson",
    };
    expect(availableCatalogedRoutes([route, ambiguousCopy], [legacyDraft])).toEqual([
      route,
      ambiguousCopy,
    ]);
    expect(
      availableCatalogedRoutes(
        [route, ambiguousCopy],
        [legacyDraft, adoptCatalogedRoute(route)]
      )
    ).toEqual([ambiguousCopy]);
  });
});
