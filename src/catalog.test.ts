import { beforeEach, describe, expect, it, vi } from "vitest";

const catalogApiMocks = vi.hoisted(() => ({
  discoverPublicDatasets: vi.fn(),
  ensurePublicCatalogReadiness: vi.fn(),
  getCatalogReadiness: vi.fn(),
  getPublicRegistryPresets: vi.fn(),
  publishPublicDataset: vi.fn(),
  updatePublicDataset: vi.fn(),
  publishRestrictedDataset: vi.fn(),
  removeDataset: vi.fn(),
}));

vi.mock("@hoelk-f/semantic-data-catalog/catalog-api", () => ({
  discoverPublicDatasets: catalogApiMocks.discoverPublicDatasets,
  ensurePublicCatalogReadiness: catalogApiMocks.ensurePublicCatalogReadiness,
  getCatalogReadiness: catalogApiMocks.getCatalogReadiness,
  getPublicRegistryPresets: catalogApiMocks.getPublicRegistryPresets,
  publishPublicDataset: catalogApiMocks.publishPublicDataset,
  updatePublicDataset: catalogApiMocks.updatePublicDataset,
  publishRestrictedDataset: catalogApiMocks.publishRestrictedDataset,
  removeDataset: catalogApiMocks.removeDataset,
}));

const solidClientMocks = vi.hoisted(() => ({
  getSolidDataset: vi.fn(),
  saveSolidDatasetAt: vi.fn(),
}));

vi.mock("@inrupt/solid-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@inrupt/solid-client")>();
  return { ...actual, getSolidDataset: solidClientMocks.getSolidDataset, saveSolidDatasetAt: solidClientMocks.saveSolidDatasetAt };
});

import {
  CATALOG_ROUTE_FETCH_CONCURRENCY,
  MAX_CATALOG_ROUTE_CANDIDATES,
  catalogPublicationReference,
  discoverCatalogedRoutes,
  ensureRouteCatalogReadiness,
  getCatalogedRouteDiscoveryReport,
  loadPublicRegistryOptions,
  loadRouteCatalogReadiness,
  loadCatalogProfileMetadata,
  publishCatalogEntry,
  publishRouteTemplateCatalogEntry,
  updateRouteTemplateCatalogEntry,
  removeCatalogEntry,
  saveCatalogProfileMetadata,
} from "./catalog";
import {
  ROUTE_TEMPLATE_IDENTIFIER_PREFIX,
  ROUTE_TEMPLATE_THEME,
  createRouteTemplateSnapshot,
} from "./routeTemplates";
import {
  addUrl,
  createSolidDataset,
  createThing,
  setStringNoLocale,
  setThing,
  setUrl,
} from "@inrupt/solid-client";

const HANNAH_WEB_ID =
  "https://solid-community-server.tmdt.info/sscon/profile/card#me";

describe("City Tours catalog publication", () => {
  beforeEach(() => {
    catalogApiMocks.discoverPublicDatasets.mockReset();
    catalogApiMocks.ensurePublicCatalogReadiness.mockReset();
    catalogApiMocks.getCatalogReadiness.mockReset();
    catalogApiMocks.getPublicRegistryPresets.mockReset();
    catalogApiMocks.publishPublicDataset.mockReset();
    catalogApiMocks.updatePublicDataset.mockReset();
    catalogApiMocks.publishRestrictedDataset.mockReset();
    catalogApiMocks.removeDataset.mockReset();
    solidClientMocks.getSolidDataset.mockReset();
    solidClientMocks.saveSolidDatasetAt.mockReset();
    catalogApiMocks.publishRestrictedDataset.mockResolvedValue({
      identifier: "solid-tours-activity-run-1",
      datasetUrl:
        "https://solid-community-server.tmdt.info/sscon/catalog/ds/solid-tours-activity-run-1.ttl#it",
      recordUrl:
        "https://solid-community-server.tmdt.info/sscon/catalog/records/solid-tours-activity-run-1.ttl",
      distributionUrl:
        "https://solid-community-server.tmdt.info/sscon/solid-tours/runs/run-1/activity.geojson",
    });
  });

  it("keeps community templates available when the municipal source fails", async () => {
    catalogApiMocks.discoverPublicDatasets.mockResolvedValue([]);
    solidClientMocks.getSolidDataset.mockRejectedValue(new Error("municipal source offline"));
    const routes = await discoverCatalogedRoutes({ webId: HANNAH_WEB_ID, fetcher: vi.fn(), includeMunicipalRoutes: true });
    expect(routes).toEqual([]);
    expect(getCatalogedRouteDiscoveryReport(routes)?.failures).toEqual([
      expect.objectContaining({ code: "source-unavailable", identifier: "Radrouten Wuppertal" }),
    ]);
  });

  it("keeps municipal suggestions available when community discovery fails", async () => {
    const catalogUrl = "https://solid-community-server.tmdt.info/gesundestal/catalog/ds/e6fe12d6-4690-4986-812b-02155a8f03fc.ttl#it";
    const distributionUrl = "https://solid-community-server.tmdt.info/gesundestal/public/opendata/radrouten-wuppertal/routes.json";
    const dcat = "http://www.w3.org/ns/dcat#";
    const dataset = setThing(setThing(createSolidDataset(),
      setUrl(createThing({ url: catalogUrl }), `${dcat}distribution`, `${catalogUrl}-dist`)),
      setUrl(createThing({ url: `${catalogUrl}-dist` }), `${dcat}downloadURL`, distributionUrl));
    solidClientMocks.getSolidDataset.mockResolvedValue(dataset);
    catalogApiMocks.discoverPublicDatasets.mockRejectedValue(new Error("community registry offline"));
    const anonymousFetch = vi.fn(async () => new Response(JSON.stringify({ type: "FeatureCollection", features: [
      { type: "Feature", properties: { ROUTE: "Sambatrasse" }, geometry: { type: "LineString", coordinates: [[7.1, 51.2], [7.11, 51.21]] } },
    ] }), { headers: { "Content-Type": "application/json" } }));
    const routes = await discoverCatalogedRoutes({ webId: HANNAH_WEB_ID, fetcher: vi.fn(), anonymousFetch, includeMunicipalRoutes: true });
    expect(routes.map(route => route.name)).toEqual(["Sambatrasse"]);
    expect(getCatalogedRouteDiscoveryReport(routes)?.failures).toEqual([
      expect.objectContaining({ code: "source-unavailable", identifier: "City Tours" }),
    ]);
  });

  it("writes explicitly confirmed vCard profile metadata and verifies it", async () => {
    const webId = "https://pod.example/alice/profile/card#me";
    let persisted = setThing(createSolidDataset(), createThing({ url: webId }));
    solidClientMocks.getSolidDataset.mockImplementation(async () => persisted);
    solidClientMocks.saveSolidDatasetAt.mockImplementation(async (_url, dataset) => {
      persisted = dataset;
      return dataset;
    });
    const fetcher = vi.fn<typeof fetch>();

    await expect(saveCatalogProfileMetadata({
      webId,
      publisher: " Alice Example ",
      contactEmail: "alice@example.org",
      fetcher,
    })).resolves.toEqual({ publisher: "Alice Example", contactEmail: "alice@example.org" });

    await expect(loadCatalogProfileMetadata(webId, fetcher)).resolves.toEqual({
      publisher: "Alice Example",
      contactEmail: "alice@example.org",
    });
    expect(solidClientMocks.saveSolidDatasetAt).toHaveBeenCalledTimes(1);
    expect(solidClientMocks.saveSolidDatasetAt).toHaveBeenCalledWith(webId.split("#")[0], expect.anything(), { fetch: fetcher });
  });

  it("publishes the profile name, creator WebID, and linked profile email", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const profileDocument = HANNAH_WEB_ID.split("#")[0];
    const emailNodeUrl = `${profileDocument}#email-1785314969040-0`;
    let profile = createSolidDataset();
    let person = createThing({ url: HANNAH_WEB_ID });
    person = setStringNoLocale(
      person,
      "http://www.w3.org/2006/vcard/ns#fn",
      "Hannah Mueller"
    );
    // Solid-client has already resolved the profile's relative
    // <#email-1785314969040-0> reference to this absolute URL.
    person = setUrl(
      person,
      "http://www.w3.org/2006/vcard/ns#hasEmail",
      emailNodeUrl
    );
    profile = setThing(profile, person);
    let emailNode = createThing({ url: emailNodeUrl });
    emailNode = setUrl(
      emailNode,
      "http://www.w3.org/2006/vcard/ns#value",
      "mailto:hannah.mueller@sscon-praesentation.de"
    );
    profile = setThing(profile, emailNode);
    solidClientMocks.getSolidDataset.mockResolvedValue(profile);

    await publishCatalogEntry({
      webId: HANNAH_WEB_ID,
      scenarioRunId: "run-1",
      resourceUrl:
        "https://solid-community-server.tmdt.info/sscon/solid-tours/runs/run-1/activity.geojson",
      fetcher,
    });

    expect(catalogApiMocks.publishRestrictedDataset).toHaveBeenCalledWith(
      {
        info: { isLoggedIn: true, webId: HANNAH_WEB_ID },
        fetch: fetcher,
      },
      expect.objectContaining({
        identifier: "solid-tours-activity-run-1",
        publisher: "Hannah Mueller",
        publisherWebId: HANNAH_WEB_ID,
        contactPoint: "hannah.mueller@sscon-praesentation.de",
        creatorWebId: HANNAH_WEB_ID,
        includeCreator: true,
        requireDiscoverableRegistry: true,
      })
    );
    const publicationInput = catalogApiMocks.publishRestrictedDataset.mock.calls[0]?.[1];
    expect(publicationInput).not.toHaveProperty("contactPointWebId");
    expect(solidClientMocks.getSolidDataset).toHaveBeenCalledWith(
      "https://solid-community-server.tmdt.info/sscon/profile/card",
      { fetch: fetcher }
    );
  });

  it.each([
    "http://www.w3.org/2006/vcard/ns#hasEmail",
    "http://www.w3.org/2006/vcard/ns#email",
  ])("supports direct mailto values from %s", async (emailPredicate) => {
    const fetcher = vi.fn<typeof fetch>();
    const otherWebId = "https://pod.example/alex/profile/card#me";
    let profile = createSolidDataset();
    let person = createThing({ url: otherWebId });
    person = setStringNoLocale(person, "http://xmlns.com/foaf/0.1/name", "Alex Example");
    person = addUrl(
      person,
      emailPredicate,
      "mailto:alex@example.org"
    );
    profile = setThing(profile, person);
    solidClientMocks.getSolidDataset.mockResolvedValue(profile);

    await publishCatalogEntry({
      webId: otherWebId,
      scenarioRunId: "run-2",
      resourceUrl: "https://pod.example/alex/solid-tours/runs/run-2/activity.geojson",
      fetcher,
    });

    expect(catalogApiMocks.publishRestrictedDataset).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        contactPoint: "alex@example.org",
        creatorWebId: otherWebId,
      })
    );
  });

  it("fails closed when the profile has no valid public identity metadata", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const otherWebId = "https://pod.example/alex/profile/card#me";
    solidClientMocks.getSolidDataset.mockRejectedValue(new Error("profile unavailable"));

    await expect(publishCatalogEntry({
      webId: otherWebId,
      scenarioRunId: "run-2",
      resourceUrl: "https://pod.example/alex/solid-tours/runs/run-2/activity.geojson",
      fetcher,
    })).rejects.toThrow(/Publisher-Name.*Kontakt-E-Mail/);
    expect(catalogApiMocks.publishRestrictedDataset).not.toHaveBeenCalled();
  });

  it("derives the response-loss cleanup reference from the resolved Pod root", () => {
    expect(
      catalogPublicationReference(
        "https://solid-community-server.tmdt.info/sscon",
        "49f3344a-e58b-4f6a-a874-84e3815620e6"
      )
    ).toEqual({
      datasetIdentifier:
        "solid-tours-activity-49f3344a-e58b-4f6a-a874-84e3815620e6",
      catalogDatasetUrl:
        "https://solid-community-server.tmdt.info/sscon/catalog/ds/solid-tours-activity-49f3344a-e58b-4f6a-a874-84e3815620e6.ttl#it",
    });
  });

  it("forwards the resolved storage Pod root instead of rejecting non-CSS WebID layouts", async () => {
    const fetcher = vi.fn<typeof fetch>();
    let profile = createSolidDataset();
    let person = createThing({ url: HANNAH_WEB_ID });
    person = setStringNoLocale(person, "http://www.w3.org/2006/vcard/ns#fn", "Hannah Mueller");
    person = addUrl(person, "http://www.w3.org/2006/vcard/ns#email", "mailto:hannah@example.org");
    profile = setThing(profile, person);
    solidClientMocks.getSolidDataset.mockResolvedValue(profile);
    await publishCatalogEntry({
      podRoot: "https://pod.example/other/",
      webId: HANNAH_WEB_ID,
      scenarioRunId: "run-1",
      resourceUrl:
        "https://solid-community-server.tmdt.info/sscon/solid-tours/runs/run-1/activity.geojson",
      fetcher,
    });
    expect(catalogApiMocks.publishRestrictedDataset).toHaveBeenCalledWith(
      expect.objectContaining({ fetch: fetcher }),
      expect.objectContaining({ podRoot: "https://pod.example/other/" })
    );
  });

  it("uses the resolved storage Pod root when removing a Catalog entry", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await removeCatalogEntry({
      podRoot: "https://storage.example/alex/",
      webId: "https://identity.example/profile/alex#me",
      datasetIdentifier: "solid-tours-activity-run-2",
      catalogDatasetUrl:
        "https://storage.example/alex/catalog/ds/solid-tours-activity-run-2.ttl#it",
      fetcher,
    });

    expect(catalogApiMocks.removeDataset).toHaveBeenCalledWith(
      {
        info: {
          isLoggedIn: true,
          webId: "https://identity.example/profile/alex#me",
        },
        fetch: fetcher,
      },
      {
        identifier: "solid-tours-activity-run-2",
        datasetUrl:
          "https://storage.example/alex/catalog/ds/solid-tours-activity-run-2.ttl#it",
        podRoot: "https://storage.example/alex/",
      }
    );
  });

  it("turns a missing public registry into an actionable publish error", async () => {
    catalogApiMocks.publishRestrictedDataset.mockRejectedValueOnce(
      Object.assign(new Error("registry required"), {
        code: "discoverable-registry-required",
      })
    );
    const identityWebId = "https://identity.example/alex#me";
    let profile = createSolidDataset();
    let person = createThing({ url: identityWebId });
    person = setStringNoLocale(person, "http://www.w3.org/2006/vcard/ns#fn", "Alex Example");
    person = addUrl(person, "http://www.w3.org/2006/vcard/ns#email", "mailto:alex@example.org");
    profile = setThing(profile, person);
    solidClientMocks.getSolidDataset.mockResolvedValue(profile);

    await expect(
      publishCatalogEntry({
        podRoot: "https://storage.example/alex/",
        webId: identityWebId,
        scenarioRunId: "run-3",
        resourceUrl:
          "https://storage.example/alex/solid-tours/runs/run-3/activity.geojson",
        fetcher: vi.fn<typeof fetch>(),
      })
    ).rejects.toThrow(/öffentliche Dataspace-Registry/);
  });
});

describe("City Tours public route Catalog", () => {
  const routeTemplateId = "49f3344a-e58b-4f6a-a874-84e3815620e6";
  const identifier = `${ROUTE_TEMPLATE_IDENTIFIER_PREFIX}${routeTemplateId}`;
  const podRoot = "https://pod.example/hannah/";
  const webId = `${podRoot}profile/card#me`;
  const resourceUrl = `${podRoot}solid-tours/public/cataloged-routes/${routeTemplateId}.geojson`;
  const datasetUrl = `${podRoot}catalog/ds/${identifier}.ttl#it`;
  const snapshot = createRouteTemplateSnapshot(
    { name: "Nordbahntrasse", geometry: [[[7.1, 51.2], [7.2, 51.3]]] },
    routeTemplateId
  );

  beforeEach(() => {
    catalogApiMocks.discoverPublicDatasets.mockReset();
    catalogApiMocks.ensurePublicCatalogReadiness.mockReset();
    catalogApiMocks.getCatalogReadiness.mockReset();
    catalogApiMocks.getPublicRegistryPresets.mockReset();
    catalogApiMocks.publishPublicDataset.mockReset();
    catalogApiMocks.updatePublicDataset.mockReset();
    catalogApiMocks.publishRestrictedDataset.mockReset();
    catalogApiMocks.removeDataset.mockReset();
    solidClientMocks.getSolidDataset.mockReset();
  });

  it("publishes a public GeoJSON dataset with route-template metadata and profile identity", async () => {
    let profile = createSolidDataset();
    let person = createThing({ url: webId });
    person = setStringNoLocale(person, "http://www.w3.org/2006/vcard/ns#fn", "Hannah Mueller");
    person = addUrl(
      person,
      "http://www.w3.org/2006/vcard/ns#email",
      "mailto:hannah.mueller@sscon-praesentation.de"
    );
    profile = setThing(profile, person);
    solidClientMocks.getSolidDataset.mockResolvedValue(profile);
    catalogApiMocks.publishPublicDataset.mockResolvedValue({
      identifier,
      datasetUrl,
      recordUrl: `${podRoot}catalog/records/${identifier}.ttl`,
      distributionUrl: resourceUrl,
    });
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      publishRouteTemplateCatalogEntry({
        podRoot,
        webId,
        snapshot,
        resourceUrl,
        fetcher,
      })
    ).resolves.toEqual({
      datasetIdentifier: identifier,
      catalogDatasetUrl: datasetUrl,
      catalogRecordUrl: `${podRoot}catalog/records/${identifier}.ttl`,
    });

    expect(catalogApiMocks.publishPublicDataset).toHaveBeenCalledWith(
      { info: { isLoggedIn: true, webId }, fetch: fetcher },
      {
        podRoot,
        identifier,
        title: "Nordbahntrasse",
        description: "Public reusable route template from City Tours.",
        distributionUrl: resourceUrl,
        mediaType: "application/geo+json",
        publisher: "Hannah Mueller",
        publisherWebId: webId,
        contactPoint: "hannah.mueller@sscon-praesentation.de",
        creatorWebId: webId,
        includeCreator: true,
        theme: ROUTE_TEMPLATE_THEME,
        requireDiscoverableRegistry: true,
      }
    );
  });

  it("updates the exact existing route-template dataset without publishing a replacement", async () => {
    let profile = createSolidDataset();
    let person = createThing({ url: webId });
    person = setStringNoLocale(person, "http://www.w3.org/2006/vcard/ns#fn", "Hannah Mueller");
    person = addUrl(
      person,
      "http://www.w3.org/2006/vcard/ns#email",
      "mailto:hannah.mueller@sscon-praesentation.de"
    );
    profile = setThing(profile, person);
    solidClientMocks.getSolidDataset.mockResolvedValue(profile);
    catalogApiMocks.updatePublicDataset.mockResolvedValue({
      identifier,
      datasetUrl,
      recordUrl: `${podRoot}catalog/records/${identifier}.ttl`,
      distributionUrl: resourceUrl,
    });
    const fetcher = vi.fn<typeof fetch>();
    const publishedAt = "2026-08-20T14:00:00.000Z";
    const operationId = "9be23928-bff4-49ad-981d-2a6d48fc3c20";

    await expect(
      updateRouteTemplateCatalogEntry({
        podRoot,
        webId,
        snapshot,
        resourceUrl,
        catalogDatasetUrl: datasetUrl,
        publishedAt,
        operationId,
        fetcher,
      })
    ).resolves.toEqual({
      datasetIdentifier: identifier,
      catalogDatasetUrl: datasetUrl,
      catalogRecordUrl: `${podRoot}catalog/records/${identifier}.ttl`,
    });

    expect(catalogApiMocks.updatePublicDataset).toHaveBeenCalledWith(
      { info: { isLoggedIn: true, webId }, fetch: fetcher },
      expect.objectContaining({
        podRoot,
        datasetUrl,
        issued: publishedAt,
        operationId,
        identifier,
        title: "Nordbahntrasse",
        distributionUrl: resourceUrl,
      })
    );
    expect(catalogApiMocks.publishPublicDataset).not.toHaveBeenCalled();
    expect(catalogApiMocks.removeDataset).not.toHaveBeenCalled();
  });

  it("checks Catalog and public-registry readiness for the resolved Pod", async () => {
    catalogApiMocks.getCatalogReadiness.mockResolvedValue({
      catalogConfigured: true,
      publicRegistries: ["https://registry.example/public/"],
    });
    const fetcher = vi.fn<typeof fetch>();

    await expect(loadRouteCatalogReadiness({ podRoot, webId, fetcher })).resolves.toEqual({
      catalogConfigured: true,
      publicRegistries: ["https://registry.example/public/"],
    });
    expect(catalogApiMocks.getCatalogReadiness).toHaveBeenCalledWith(
      { info: { isLoggedIn: true, webId }, fetch: fetcher },
      { podRoot }
    );
  });

  it("exposes registry presets and configures the explicitly selected one", async () => {
    const registry = {
      id: "test",
      label: "Test",
      url: "https://registry.example/public/test",
    };
    catalogApiMocks.getPublicRegistryPresets.mockReturnValue([registry]);
    expect(loadPublicRegistryOptions()).toEqual([registry]);

    catalogApiMocks.ensurePublicCatalogReadiness.mockResolvedValue({
      catalogConfigured: true,
      publicRegistries: [registry.url],
      selectedRegistry: registry.url,
    });
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      ensureRouteCatalogReadiness({
        podRoot,
        webId,
        registryUrl: registry.url,
        fetcher,
      })
    ).resolves.toMatchObject({ catalogConfigured: true });
    expect(catalogApiMocks.ensurePublicCatalogReadiness).toHaveBeenCalledWith(
      { info: { isLoggedIn: true, webId }, fetch: fetcher },
      {
        podRoot,
        registryUrl: registry.url,
        catalogTitle: "City Tours Catalog",
      }
    );
  });

  it("discovers metadata while downloading and validating route geometry anonymously", async () => {
    const invalidTemplateId = "8db47d3b-8a4f-4a74-b086-77c1c7630bf7";
    const invalidIdentifier = `${ROUTE_TEMPLATE_IDENTIFIER_PREFIX}${invalidTemplateId}`;
    const invalidResourceUrl = `https://pod.example/other/routes/${invalidTemplateId}.geojson`;
    catalogApiMocks.discoverPublicDatasets.mockResolvedValue([
      {
        identifier,
        title: "Ignored metadata title",
        description: "Reusable route",
        publisher: "Hannah Mueller",
        creatorWebId: webId,
        datasetUrl,
        distributionUrl: resourceUrl,
        mediaType: "application/geo+json",
        theme: ROUTE_TEMPLATE_THEME,
      },
      {
        identifier: invalidIdentifier,
        title: "Invalid route",
        description: "Must be skipped",
        publisher: "Other user",
        datasetUrl: `https://pod.example/other/catalog/${invalidIdentifier}.ttl#it`,
        distributionUrl: invalidResourceUrl,
        mediaType: "application/geo+json",
        theme: ROUTE_TEMPLATE_THEME,
      },
    ]);
    const anonymousFetch = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url === resourceUrl) {
        return new Response(JSON.stringify(snapshot), {
          status: 200,
          headers: { "Content-Type": "application/geo+json" },
        });
      }
      return new Response(
        JSON.stringify({
          ...createRouteTemplateSnapshot(
            { name: "Invalid route", geometry: [[[7.3, 51.3], [7.4, 51.4]]] },
            invalidTemplateId
          ),
          privateWebId: "https://pod.example/other/profile/card#me",
        }),
        { status: 200, headers: { "Content-Type": "application/geo+json" } }
      );
    });
    const fetcher = vi.fn<typeof fetch>();

    const routes = await discoverCatalogedRoutes({
      podRoot,
      webId,
      fetcher,
      anonymousFetch,
    });

    expect(catalogApiMocks.discoverPublicDatasets).toHaveBeenCalledWith(
      { info: { isLoggedIn: true, webId }, fetch: fetcher },
      {
        podRoot,
        identifierPrefix: ROUTE_TEMPLATE_IDENTIFIER_PREFIX,
        mediaType: "application/geo+json",
        theme: ROUTE_TEMPLATE_THEME,
      }
    );
    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({
      routeTemplateId,
      identifier,
      name: "Nordbahntrasse",
      publisher: "Hannah Mueller",
      creatorWebId: webId,
      datasetUrl,
      distributionUrl: resourceUrl,
    });
    expect(routes[0].distanceMeters).toBeGreaterThan(0);
    expect(getCatalogedRouteDiscoveryReport(routes)).toMatchObject({
      candidateCount: 2,
      processedCount: 2,
      truncatedCount: 0,
      failures: [
        expect.objectContaining({
          code: "route-template-rejected",
          identifier: invalidIdentifier,
          distributionUrl: invalidResourceUrl,
        }),
      ],
    });
    expect(anonymousFetch).toHaveBeenCalledWith(
      resourceUrl,
      expect.objectContaining({
        method: "GET",
        credentials: "omit",
        cache: "no-store",
        redirect: "error",
        headers: { Accept: "application/geo+json" },
      })
    );
  });

  it("skips insecure, oversized, or Catalog-mismatched public resources", async () => {
    catalogApiMocks.discoverPublicDatasets.mockResolvedValue([
      {
        identifier,
        title: "Insecure",
        description: "",
        publisher: "Unknown",
        datasetUrl,
        distributionUrl: "http://pod.example/public/route.geojson",
        mediaType: "application/geo+json",
        theme: ROUTE_TEMPLATE_THEME,
      },
      {
        identifier,
        title: "Oversized",
        description: "",
        publisher: "Unknown",
        datasetUrl: `${podRoot}catalog/ds/oversized.ttl#it`,
        distributionUrl: resourceUrl,
        mediaType: "application/geo+json",
        theme: ROUTE_TEMPLATE_THEME,
      },
      {
        identifier: `${ROUTE_TEMPLATE_IDENTIFIER_PREFIX}8db47d3b-8a4f-4a74-b086-77c1c7630bf7`,
        title: "Mismatched",
        description: "",
        publisher: "Unknown",
        datasetUrl: `${podRoot}catalog/ds/mismatch.ttl#it`,
        distributionUrl: `${podRoot}public/mismatch.geojson`,
        mediaType: "application/geo+json",
        theme: ROUTE_TEMPLATE_THEME,
      },
    ]);
    const anonymousFetch = vi.fn<typeof fetch>(async (input) => {
      if (String(input) === resourceUrl) {
        return new Response(JSON.stringify(snapshot), {
          status: 200,
          headers: {
            "Content-Type": "application/geo+json",
            "Content-Length": String(2 * 1024 * 1024 + 1),
          },
        });
      }
      return new Response(JSON.stringify(snapshot), {
        status: 200,
        headers: { "Content-Type": "application/geo+json" },
      });
    });

    await expect(
      discoverCatalogedRoutes({
        podRoot,
        webId,
        fetcher: vi.fn<typeof fetch>(),
        anonymousFetch,
      })
    ).resolves.toEqual([]);
    expect(anonymousFetch).toHaveBeenCalledTimes(2);
  });

  it("allows loopback HTTP only when the application origin is itself loopback", async () => {
    const loopbackResourceUrl = `http://127.0.0.1:3000/routes/${routeTemplateId}.geojson`;
    catalogApiMocks.discoverPublicDatasets.mockResolvedValue([
      {
        identifier,
        title: "Loopback route",
        description: "",
        publisher: "Developer",
        datasetUrl,
        distributionUrl: loopbackResourceUrl,
        mediaType: "application/geo+json",
        theme: ROUTE_TEMPLATE_THEME,
      },
    ]);
    const anonymousFetch = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify(snapshot), {
        status: 200,
        headers: { "Content-Type": "application/geo+json" },
      })
    );
    const common = {
      podRoot,
      webId,
      fetcher: vi.fn<typeof fetch>(),
      anonymousFetch,
    };

    const productionRoutes = await discoverCatalogedRoutes({
      ...common,
      applicationOrigin: "https://solid-tours.example",
    });
    expect(productionRoutes).toHaveLength(0);
    expect(anonymousFetch).not.toHaveBeenCalled();
    expect(getCatalogedRouteDiscoveryReport(productionRoutes)?.failures).toEqual([
      expect.objectContaining({ code: "route-template-rejected", identifier }),
    ]);

    const localRoutes = await discoverCatalogedRoutes({
      ...common,
      applicationOrigin: "http://localhost:5173",
    });
    expect(localRoutes).toHaveLength(1);
    expect(anonymousFetch).toHaveBeenCalledTimes(1);
    expect(getCatalogedRouteDiscoveryReport(localRoutes)?.failures).toEqual([]);
  });

  it("caps Catalog candidates and downloads them with bounded concurrency", async () => {
    const candidateCount = MAX_CATALOG_ROUTE_CANDIDATES + 7;
    const entries = Array.from({ length: candidateCount }, (_, index) => {
      const id = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
      return {
        identifier: `${ROUTE_TEMPLATE_IDENTIFIER_PREFIX}${id}`,
        title: `Route ${index}`,
        description: "",
        publisher: "Catalog user",
        datasetUrl: `https://pod.example/user-${index}/catalog/ds/route.ttl#it`,
        distributionUrl: `https://pod.example/user-${index}/route.geojson`,
        mediaType: "application/geo+json",
        theme: ROUTE_TEMPLATE_THEME,
        snapshot: createRouteTemplateSnapshot(
          { name: `Route ${index}`, geometry: [[[7.1, 51.2], [7.2, 51.3]]] },
          id
        ),
      };
    });
    catalogApiMocks.discoverPublicDatasets.mockResolvedValue(
      entries.map(({ snapshot: _snapshot, ...entry }) => entry)
    );
    const snapshots = new Map(entries.map((entry) => [entry.distributionUrl, entry.snapshot]));
    let active = 0;
    let maximumActive = 0;
    const anonymousFetch = vi.fn<typeof fetch>(async (input) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return new Response(JSON.stringify(snapshots.get(String(input))), {
        status: 200,
        headers: { "Content-Type": "application/geo+json" },
      });
    });

    const routes = await discoverCatalogedRoutes({
      podRoot,
      webId,
      fetcher: vi.fn<typeof fetch>(),
      anonymousFetch,
      applicationOrigin: "https://solid-tours.example",
    });

    expect(routes).toHaveLength(MAX_CATALOG_ROUTE_CANDIDATES);
    expect(anonymousFetch).toHaveBeenCalledTimes(MAX_CATALOG_ROUTE_CANDIDATES);
    expect(maximumActive).toBeGreaterThan(1);
    expect(maximumActive).toBeLessThanOrEqual(CATALOG_ROUTE_FETCH_CONCURRENCY);
    expect(getCatalogedRouteDiscoveryReport(routes)).toEqual({
      candidateCount,
      processedCount: MAX_CATALOG_ROUTE_CANDIDATES,
      truncatedCount: 7,
      failures: [],
    });
  });
});
