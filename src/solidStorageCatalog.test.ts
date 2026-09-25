import { beforeEach, describe, expect, it, vi } from "vitest";

const solidClientMocks = vi.hoisted(() => ({
  overwriteFile: vi.fn(),
}));

const ownerAclMocks = vi.hoisted(() => ({
  setOwnerOnlyResourceAccess: vi.fn(),
  setOwnerPublicReadResourceAccess: vi.fn(),
}));

vi.mock("@inrupt/solid-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@inrupt/solid-client")>();
  return { ...actual, overwriteFile: solidClientMocks.overwriteFile };
});

vi.mock("./ownerAcl", () => ownerAclMocks);

import { completeOnboardingRecord } from "./appOnboarding";
import { draftFeature } from "./domain";
import { createRouteTemplateSnapshot } from "./routeTemplates";
import {
  PublicRouteTemplateConflictError,
  loadDraftMasterResourceSnapshot,
  loadCityToursOnboarding,
  savePublicRouteTemplate,
  saveCityToursOnboarding,
  storageUrls,
  updatePublicRouteTemplateConditionally,
} from "./solidStorage";

const POD_ROOT = "https://pod.example/alice/";
const WEB_ID = `${POD_ROOT}profile/card#me`;
const ROUTE_TEMPLATE_ID = "49f3344a-e58b-4f6a-a874-84e3815620e6";
const PRIVATE_DRAFT = {
  id: "8db47d3b-8a4f-4a74-b086-77c1c7630bf7",
  name: "Private Nordbahntrasse",
  routeSource: "drawn" as const,
  geometry: [[[7.1, 51.2], [7.2, 51.3]]] as [[number, number][]],
  createdAt: "2026-08-20T12:00:00.000Z",
  updatedAt: "2026-08-28T08:00:00.000Z",
};

const responseAt = (url: string, body: BodyInit | null, init: ResponseInit) => {
  const response = new Response(body, init);
  Object.defineProperty(response, "url", { value: url });
  return response;
};

const readBlobText = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", () => reject(reader.error));
    reader.readAsText(blob);
  });

describe("City Tours onboarding storage", () => {
  beforeEach(() => {
    solidClientMocks.overwriteFile.mockReset();
    ownerAclMocks.setOwnerOnlyResourceAccess.mockReset();
    ownerAclMocks.setOwnerPublicReadResourceAccess.mockReset();
    solidClientMocks.overwriteFile.mockResolvedValue({});
    ownerAclMocks.setOwnerOnlyResourceAccess.mockResolvedValue(undefined);
    ownerAclMocks.setOwnerPublicReadResourceAccess.mockResolvedValue(undefined);
  });

  it("treats an exact 404 as not onboarded without provisioning anything", async () => {
    const onboardingUrl = storageUrls(POD_ROOT).onboarding;
    const fetcher = vi.fn<typeof fetch>(async () =>
      responseAt(onboardingUrl, null, { status: 404 })
    );

    await expect(loadCityToursOnboarding(POD_ROOT, fetcher)).resolves.toBeNull();
    expect(fetcher).toHaveBeenCalledWith(onboardingUrl, {
      headers: { Accept: "application/json", "Cache-Control": "no-cache" },
      cache: "no-store",
      redirect: "error",
    });
    expect(solidClientMocks.overwriteFile).not.toHaveBeenCalled();
    expect(ownerAclMocks.setOwnerOnlyResourceAccess).not.toHaveBeenCalled();
  });

  it("loads only a valid record from the exact private onboarding URL", async () => {
    const onboardingUrl = storageUrls(POD_ROOT).onboarding;
    const record = completeOnboardingRecord(
      null,
      "standalone",
      "https://registry.example/research",
      "2026-08-28T08:05:00.000Z"
    );
    const fetcher = vi.fn<typeof fetch>(async () =>
      responseAt(onboardingUrl, JSON.stringify(record), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await expect(loadCityToursOnboarding(POD_ROOT, fetcher)).resolves.toEqual(record);

    const redirectedFetcher = vi.fn<typeof fetch>(async () =>
      responseAt("https://attacker.example/onboarding.json", JSON.stringify(record), {
        status: 200,
      })
    );
    await expect(
      loadCityToursOnboarding(POD_ROOT, redirectedFetcher)
    ).rejects.toThrow(/anderes Ziel/);

    const extendedFetcher = vi.fn<typeof fetch>(async () =>
      responseAt(onboardingUrl, JSON.stringify({ ...record, admin: true }), { status: 200 })
    );
    await expect(
      loadCityToursOnboarding(POD_ROOT, extendedFetcher)
    ).resolves.toBeNull();
  });

  it("returns an unaccepted repair state for newer or malformed private records", async () => {
    const onboardingUrl = storageUrls(POD_ROOT).onboarding;
    const newerFetcher = vi.fn<typeof fetch>(async () =>
      responseAt(
        onboardingUrl,
        JSON.stringify({
          schemaVersion: 3,
          app: "solid-tours",
          appSpecificAcceptedAt: "2026-08-28T08:00:00.000Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const malformedFetcher = vi.fn<typeof fetch>(async () =>
      responseAt(onboardingUrl, "{not valid JSON", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    await expect(loadCityToursOnboarding(POD_ROOT, newerFetcher)).resolves.toBeNull();
    await expect(loadCityToursOnboarding(POD_ROOT, malformedFetcher)).resolves.toBeNull();
    expect(solidClientMocks.overwriteFile).not.toHaveBeenCalled();
    expect(ownerAclMocks.setOwnerOnlyResourceAccess).not.toHaveBeenCalled();
  });

  it("still fails closed on a Pod error instead of bypassing onboarding", async () => {
    const onboardingUrl = storageUrls(POD_ROOT).onboarding;
    const fetcher = vi.fn<typeof fetch>(async () =>
      responseAt(onboardingUrl, "unavailable", { status: 503 })
    );

    await expect(loadCityToursOnboarding(POD_ROOT, fetcher)).rejects.toThrow(/503/);
  });

  it("stores the onboarding record owner-only", async () => {
    const onboardingUrl = storageUrls(POD_ROOT).onboarding;
    const record = completeOnboardingRecord(
      null,
      "embedded",
      "https://registry.example/research",
      "2026-08-28T08:00:00.000Z"
    );
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 404 }));

    await saveCityToursOnboarding(POD_ROOT, record, WEB_ID, fetcher);

    expect(fetcher).toHaveBeenCalledWith(
      onboardingUrl,
      expect.objectContaining({ method: "HEAD", redirect: "error", cache: "no-store" })
    );
    expect(solidClientMocks.overwriteFile).toHaveBeenCalledWith(
      onboardingUrl,
      expect.any(Blob),
      expect.objectContaining({ contentType: "application/json", fetch: fetcher })
    );
    const blob = solidClientMocks.overwriteFile.mock.calls[0][1] as Blob;
    await expect(readBlobText(blob).then(JSON.parse)).resolves.toEqual(record);
    expect(ownerAclMocks.setOwnerOnlyResourceAccess).toHaveBeenCalledWith(
      onboardingUrl,
      WEB_ID,
      fetcher
    );
    expect(ownerAclMocks.setOwnerPublicReadResourceAccess).not.toHaveBeenCalled();
  });

  it("rejects an invalid onboarding record before reading or writing the Pod", async () => {
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      saveCityToursOnboarding(
        POD_ROOT,
        {
          schemaVersion: 2,
          app: "solid-tours",
          appSpecificAcceptedAt: "not-an-iso-timestamp",
          publicPublishingAcceptedAt: "2026-08-28T08:00:00.000Z",
          publicRegistryUrl: "https://registry.example/research",
        },
        WEB_ID,
        fetcher
      )
    ).rejects.toThrow(/ung.*ltiges Format/);
    expect(fetcher).not.toHaveBeenCalled();
    expect(solidClientMocks.overwriteFile).not.toHaveBeenCalled();
  });
});

describe("private draft-master storage", () => {
  it("loads the canonical draft and strong ETag only from its deterministic URL", async () => {
    const resourceUrl = `${storageUrls(POD_ROOT).drafts}${PRIVATE_DRAFT.id}.geojson`;
    const fetcher = vi.fn<typeof fetch>(async () =>
      responseAt(resourceUrl, JSON.stringify(draftFeature(PRIVATE_DRAFT)), {
        status: 200,
        headers: {
          "Content-Type": "application/geo+json",
          ETag: '"draft-v1"',
        },
      })
    );

    await expect(
      loadDraftMasterResourceSnapshot(POD_ROOT, PRIVATE_DRAFT.id, fetcher)
    ).resolves.toEqual({ draft: PRIVATE_DRAFT, etag: '"draft-v1"' });
    expect(fetcher).toHaveBeenCalledWith(resourceUrl, {
      headers: { Accept: "application/geo+json", "Cache-Control": "no-cache" },
      cache: "no-store",
      redirect: "error",
    });
  });

  it("round-trips stable Catalog adoption provenance in the private draft master", async () => {
    const adoptedDraft = {
      ...PRIVATE_DRAFT,
      routeSource: "geojson" as const,
      adoptedFromCatalog: {
        routeTemplateId: ROUTE_TEMPLATE_ID,
        datasetUrl: "https://publisher.example/catalog/ds/route.ttl#it",
        distributionUrl: "https://publisher.example/routes/route.geojson",
      },
    };
    const resourceUrl = `${storageUrls(POD_ROOT).drafts}${adoptedDraft.id}.geojson`;
    const fetcher = vi.fn<typeof fetch>(async () =>
      responseAt(resourceUrl, JSON.stringify(draftFeature(adoptedDraft)), {
        status: 200,
        headers: { ETag: '"draft-v1"' },
      })
    );

    await expect(
      loadDraftMasterResourceSnapshot(POD_ROOT, adoptedDraft.id, fetcher)
    ).resolves.toEqual({ draft: adoptedDraft, etag: '"draft-v1"' });
  });

  it("rejects invalid or mismatching UUIDs and redirected responses", async () => {
    const resourceUrl = `${storageUrls(POD_ROOT).drafts}${PRIVATE_DRAFT.id}.geojson`;
    const untouchedFetcher = vi.fn<typeof fetch>();
    await expect(
      loadDraftMasterResourceSnapshot(POD_ROOT, "../state", untouchedFetcher)
    ).rejects.toThrow(/Tourentwurfs-ID.*ungültig/);
    expect(untouchedFetcher).not.toHaveBeenCalled();

    const otherDraft = {
      ...PRIVATE_DRAFT,
      id: "a45efb25-ca2e-4f65-b793-f5e9806021bf",
    };
    const mismatchingFetcher = vi.fn<typeof fetch>(async () =>
      responseAt(resourceUrl, JSON.stringify(draftFeature(otherDraft)), {
        status: 200,
        headers: { ETag: '"draft-v1"' },
      })
    );
    await expect(
      loadDraftMasterResourceSnapshot(POD_ROOT, PRIVATE_DRAFT.id, mismatchingFetcher)
    ).rejects.toThrow(/ungültiges oder unerwartetes Format/);

    const redirectedFetcher = vi.fn<typeof fetch>(async () =>
      responseAt(
        "https://attacker.example/draft.geojson",
        JSON.stringify(draftFeature(PRIVATE_DRAFT)),
        { status: 200, headers: { ETag: '"draft-v1"' } }
      )
    );
    await expect(
      loadDraftMasterResourceSnapshot(POD_ROOT, PRIVATE_DRAFT.id, redirectedFetcher)
    ).rejects.toThrow(/anderes Ziel/);
  });

  it("rejects extended GeoJSON and missing strong version evidence", async () => {
    const resourceUrl = `${storageUrls(POD_ROOT).drafts}${PRIVATE_DRAFT.id}.geojson`;
    const feature = draftFeature(PRIVATE_DRAFT);
    const extendedFetcher = vi.fn<typeof fetch>(async () =>
      responseAt(
        resourceUrl,
        JSON.stringify({
          ...feature,
          properties: { ...feature.properties, privateNote: "unexpected" },
        }),
        { status: 200, headers: { ETag: '"draft-v1"' } }
      )
    );
    await expect(
      loadDraftMasterResourceSnapshot(POD_ROOT, PRIVATE_DRAFT.id, extendedFetcher)
    ).rejects.toThrow(/ungültiges oder unerwartetes Format/);

    const weakEtagFetcher = vi.fn<typeof fetch>(async () =>
      responseAt(resourceUrl, JSON.stringify(feature), {
        status: 200,
        headers: { ETag: 'W/"draft-v1"' },
      })
    );
    await expect(
      loadDraftMasterResourceSnapshot(POD_ROOT, PRIVATE_DRAFT.id, weakEtagFetcher)
    ).rejects.toThrow(/starken Versionsnachweis/);
  });
});

describe("public route-template storage", () => {
  beforeEach(() => {
    solidClientMocks.overwriteFile.mockReset();
    ownerAclMocks.setOwnerOnlyResourceAccess.mockReset();
    ownerAclMocks.setOwnerPublicReadResourceAccess.mockReset();
    solidClientMocks.overwriteFile.mockResolvedValue({});
    ownerAclMocks.setOwnerOnlyResourceAccess.mockResolvedValue(undefined);
    ownerAclMocks.setOwnerPublicReadResourceAccess.mockResolvedValue(undefined);
  });

  it("writes the minimal snapshot to the deterministic public resource and grants read only", async () => {
    const snapshot = createRouteTemplateSnapshot(
      {
        name: "Nordbahntrasse",
        geometry: [[[7.1, 51.2], [7.2, 51.3]]],
      },
      ROUTE_TEMPLATE_ID
    );
    const resourceUrl = `${storageUrls(POD_ROOT).routeTemplates}${ROUTE_TEMPLATE_ID}.geojson`;
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));

    await expect(
      savePublicRouteTemplate(POD_ROOT, snapshot, WEB_ID, fetcher)
    ).resolves.toBe(resourceUrl);

    expect(ownerAclMocks.setOwnerOnlyResourceAccess).toHaveBeenCalledWith(
      resourceUrl,
      WEB_ID,
      fetcher,
      {}
    );
    expect(solidClientMocks.overwriteFile).toHaveBeenCalledWith(
      resourceUrl,
      expect.any(Blob),
      expect.objectContaining({ contentType: "application/geo+json", fetch: fetcher })
    );
    const blob = solidClientMocks.overwriteFile.mock.calls[0][1] as Blob;
    await expect(readBlobText(blob).then(JSON.parse)).resolves.toEqual(snapshot);
    expect(ownerAclMocks.setOwnerPublicReadResourceAccess).toHaveBeenCalledWith(
      resourceUrl,
      WEB_ID,
      fetcher
    );

    const privateCall = ownerAclMocks.setOwnerOnlyResourceAccess.mock.invocationCallOrder[0];
    const writeCall = solidClientMocks.overwriteFile.mock.invocationCallOrder[0];
    const publicCall = ownerAclMocks.setOwnerPublicReadResourceAccess.mock.invocationCallOrder[0];
    expect(privateCall).toBeLessThan(writeCall);
    expect(writeCall).toBeLessThan(publicCall);
  });

  it("updates the exact existing template with If-Match and returns rollback snapshots", async () => {
    const previousSnapshot = createRouteTemplateSnapshot(
      {
        name: "Nordbahntrasse",
        geometry: [[[7.1, 51.2], [7.2, 51.3]]],
      },
      ROUTE_TEMPLATE_ID
    );
    const nextSnapshot = createRouteTemplateSnapshot(
      {
        name: "Nordbahntrasse, geglättet",
        geometry: [[[7.1, 51.2], [7.15, 51.25], [7.2, 51.3]]],
      },
      ROUTE_TEMPLATE_ID
    );
    const resourceUrl = `${storageUrls(POD_ROOT).routeTemplates}${ROUTE_TEMPLATE_ID}.geojson`;
    let stored = previousSnapshot;
    let etag = '"route-v1"';
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe(resourceUrl);
      if (init?.method === "PUT") {
        expect(new Headers(init.headers).get("If-Match")).toBe('"route-v1"');
        expect(new Headers(init.headers).get("Content-Type")).toBe(
          "application/geo+json"
        );
        stored = JSON.parse(String(init.body));
        etag = '"route-v2"';
        return responseAt(resourceUrl, null, { status: 204 });
      }
      return responseAt(resourceUrl, JSON.stringify(stored), {
        status: 200,
        headers: {
          "Content-Type": "application/geo+json",
          ETag: etag,
        },
      });
    });

    await expect(
      updatePublicRouteTemplateConditionally(
        POD_ROOT,
        resourceUrl,
        ROUTE_TEMPLATE_ID,
        nextSnapshot,
        WEB_ID,
        fetcher
      )
    ).resolves.toEqual({
      previous: {
        resourceUrl,
        snapshot: previousSnapshot,
        etag: '"route-v1"',
      },
      current: {
        resourceUrl,
        snapshot: nextSnapshot,
        etag: '"route-v2"',
      },
    });

    const putCall = fetcher.mock.calls.find(([, init]) => init?.method === "PUT");
    expect(putCall).toBeDefined();
    expect(JSON.parse(String(putCall?.[1]?.body))).toEqual(nextSnapshot);
    expect(ownerAclMocks.setOwnerOnlyResourceAccess).not.toHaveBeenCalled();
    expect(ownerAclMocks.setOwnerPublicReadResourceAccess).toHaveBeenCalledOnce();
    expect(ownerAclMocks.setOwnerPublicReadResourceAccess).toHaveBeenCalledWith(
      resourceUrl,
      WEB_ID,
      fetcher
    );
    expect(
      fetcher.mock.invocationCallOrder[
        fetcher.mock.calls.findIndex(([, init]) => init?.method === "PUT")
      ]
    ).toBeLessThan(ownerAclMocks.setOwnerPublicReadResourceAccess.mock.invocationCallOrder[0]);
  });

  it("rejects a non-deterministic URL or mismatching route ID before touching the Pod", async () => {
    const snapshot = createRouteTemplateSnapshot(
      {
        name: "Nordbahntrasse",
        geometry: [[[7.1, 51.2], [7.2, 51.3]]],
      },
      ROUTE_TEMPLATE_ID
    );
    const fetcher = vi.fn<typeof fetch>();

    await expect(
      updatePublicRouteTemplateConditionally(
        POD_ROOT,
        `${storageUrls(POD_ROOT).routeTemplates}other.geojson`,
        ROUTE_TEMPLATE_ID,
        snapshot,
        WEB_ID,
        fetcher
      )
    ).rejects.toThrow(/erwarteten Resource/);
    await expect(
      updatePublicRouteTemplateConditionally(
        POD_ROOT,
        `${storageUrls(POD_ROOT).routeTemplates}${ROUTE_TEMPLATE_ID}.geojson`,
        "not-a-route-template-id",
        snapshot,
        WEB_ID,
        fetcher
      )
    ).rejects.toThrow(/Routenvorlagen-ID/);

    expect(fetcher).not.toHaveBeenCalled();
    expect(ownerAclMocks.setOwnerOnlyResourceAccess).not.toHaveBeenCalled();
    expect(ownerAclMocks.setOwnerPublicReadResourceAccess).not.toHaveBeenCalled();
  });

  it("fails closed before PUT when the existing snapshot or ETag is not authoritative", async () => {
    const otherRouteTemplateId = "69020722-f94e-4d99-9aac-37b33d5607c7";
    const wrongSnapshot = createRouteTemplateSnapshot(
      {
        name: "Fremde Route",
        geometry: [[[7.1, 51.2], [7.2, 51.3]]],
      },
      otherRouteTemplateId
    );
    const nextSnapshot = createRouteTemplateSnapshot(
      {
        name: "Nordbahntrasse neu",
        geometry: [[[7.1, 51.2], [7.2, 51.3]]],
      },
      ROUTE_TEMPLATE_ID
    );
    const resourceUrl = `${storageUrls(POD_ROOT).routeTemplates}${ROUTE_TEMPLATE_ID}.geojson`;
    const wrongSnapshotFetcher = vi.fn<typeof fetch>(async () =>
      responseAt(resourceUrl, JSON.stringify(wrongSnapshot), {
        status: 200,
        headers: { ETag: '"route-v1"' },
      })
    );
    const weakEtagFetcher = vi.fn<typeof fetch>(async () =>
      responseAt(resourceUrl, JSON.stringify(nextSnapshot), {
        status: 200,
        headers: { ETag: 'W/"route-v1"' },
      })
    );

    await expect(
      updatePublicRouteTemplateConditionally(
        POD_ROOT,
        resourceUrl,
        ROUTE_TEMPLATE_ID,
        nextSnapshot,
        WEB_ID,
        wrongSnapshotFetcher
      )
    ).rejects.toThrow(/passen nicht zusammen/);
    await expect(
      updatePublicRouteTemplateConditionally(
        POD_ROOT,
        resourceUrl,
        ROUTE_TEMPLATE_ID,
        nextSnapshot,
        WEB_ID,
        weakEtagFetcher
      )
    ).rejects.toThrow(/starken Versionsnachweis/);

    expect(
      wrongSnapshotFetcher.mock.calls.some(([, init]) => init?.method === "PUT")
    ).toBe(false);
    expect(weakEtagFetcher.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(
      false
    );
    expect(ownerAclMocks.setOwnerPublicReadResourceAccess).not.toHaveBeenCalled();
  });

  it.each([409, 412])("treats a %i response as an update conflict", async (status) => {
    const previousSnapshot = createRouteTemplateSnapshot(
      {
        name: "Nordbahntrasse",
        geometry: [[[7.1, 51.2], [7.2, 51.3]]],
      },
      ROUTE_TEMPLATE_ID
    );
    const nextSnapshot = createRouteTemplateSnapshot(
      {
        name: "Nordbahntrasse neu",
        geometry: [[[7.1, 51.2], [7.2, 51.3]]],
      },
      ROUTE_TEMPLATE_ID
    );
    const resourceUrl = `${storageUrls(POD_ROOT).routeTemplates}${ROUTE_TEMPLATE_ID}.geojson`;
    const fetcher = vi.fn<typeof fetch>(async (_input, init) =>
      init?.method === "PUT"
        ? responseAt(resourceUrl, null, { status })
        : responseAt(resourceUrl, JSON.stringify(previousSnapshot), {
            status: 200,
            headers: { ETag: '"route-v1"' },
          })
    );

    await expect(
      updatePublicRouteTemplateConditionally(
        POD_ROOT,
        resourceUrl,
        ROUTE_TEMPLATE_ID,
        nextSnapshot,
        WEB_ID,
        fetcher
      )
    ).rejects.toBeInstanceOf(PublicRouteTemplateConflictError);
    expect(ownerAclMocks.setOwnerOnlyResourceAccess).not.toHaveBeenCalled();
    expect(ownerAclMocks.setOwnerPublicReadResourceAccess).not.toHaveBeenCalled();
  });

  it("rejects a PUT response from another target and never changes the ACL", async () => {
    const previousSnapshot = createRouteTemplateSnapshot(
      {
        name: "Nordbahntrasse",
        geometry: [[[7.1, 51.2], [7.2, 51.3]]],
      },
      ROUTE_TEMPLATE_ID
    );
    const nextSnapshot = createRouteTemplateSnapshot(
      {
        name: "Nordbahntrasse neu",
        geometry: [[[7.1, 51.2], [7.2, 51.3]]],
      },
      ROUTE_TEMPLATE_ID
    );
    const resourceUrl = `${storageUrls(POD_ROOT).routeTemplates}${ROUTE_TEMPLATE_ID}.geojson`;
    const fetcher = vi.fn<typeof fetch>(async (_input, init) =>
      init?.method === "PUT"
        ? responseAt("https://attacker.example/route.geojson", null, { status: 204 })
        : responseAt(resourceUrl, JSON.stringify(previousSnapshot), {
            status: 200,
            headers: { ETag: '"route-v1"' },
          })
    );

    await expect(
      updatePublicRouteTemplateConditionally(
        POD_ROOT,
        resourceUrl,
        ROUTE_TEMPLATE_ID,
        nextSnapshot,
        WEB_ID,
        fetcher
      )
    ).rejects.toThrow(/anderes Ziel/);
    expect(ownerAclMocks.setOwnerOnlyResourceAccess).not.toHaveBeenCalled();
    expect(ownerAclMocks.setOwnerPublicReadResourceAccess).not.toHaveBeenCalled();
  });

  it("does not grant or rewrite ACLs when the written content cannot be verified", async () => {
    const previousSnapshot = createRouteTemplateSnapshot(
      {
        name: "Nordbahntrasse",
        geometry: [[[7.1, 51.2], [7.2, 51.3]]],
      },
      ROUTE_TEMPLATE_ID
    );
    const nextSnapshot = createRouteTemplateSnapshot(
      {
        name: "Nordbahntrasse neu",
        geometry: [[[7.1, 51.2], [7.2, 51.3]]],
      },
      ROUTE_TEMPLATE_ID
    );
    const resourceUrl = `${storageUrls(POD_ROOT).routeTemplates}${ROUTE_TEMPLATE_ID}.geojson`;
    const fetcher = vi.fn<typeof fetch>(async (_input, init) =>
      init?.method === "PUT"
        ? responseAt(resourceUrl, null, { status: 204 })
        : responseAt(resourceUrl, JSON.stringify(previousSnapshot), {
            status: 200,
            headers: { ETag: '"route-v1"' },
          })
    );

    await expect(
      updatePublicRouteTemplateConditionally(
        POD_ROOT,
        resourceUrl,
        ROUTE_TEMPLATE_ID,
        nextSnapshot,
        WEB_ID,
        fetcher
      )
    ).rejects.toThrow(/nicht eindeutig bestätigt/);
    expect(ownerAclMocks.setOwnerOnlyResourceAccess).not.toHaveBeenCalled();
    expect(ownerAclMocks.setOwnerPublicReadResourceAccess).not.toHaveBeenCalled();
  });

  it("reconciles a lost PUT response and supports a conditional rollback", async () => {
    const previousSnapshot = createRouteTemplateSnapshot(
      {
        name: "Nordbahntrasse",
        geometry: [[[7.1, 51.2], [7.2, 51.3]]],
      },
      ROUTE_TEMPLATE_ID
    );
    const nextSnapshot = createRouteTemplateSnapshot(
      {
        name: "Nordbahntrasse neu",
        geometry: [[[7.1, 51.2], [7.15, 51.25], [7.2, 51.3]]],
      },
      ROUTE_TEMPLATE_ID
    );
    const resourceUrl = `${storageUrls(POD_ROOT).routeTemplates}${ROUTE_TEMPLATE_ID}.geojson`;
    let stored = previousSnapshot;
    let etag = '"route-v1"';
    let loseFirstPutResponse = true;
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === "PUT") {
        expect(new Headers(init.headers).get("If-Match")).toBe(etag);
        stored = JSON.parse(String(init.body));
        etag = etag === '"route-v1"' ? '"route-v2"' : '"route-v3"';
        if (loseFirstPutResponse) {
          loseFirstPutResponse = false;
          throw new TypeError("response lost");
        }
        return responseAt(resourceUrl, null, { status: 204 });
      }
      return responseAt(resourceUrl, JSON.stringify(stored), {
        status: 200,
        headers: { ETag: etag },
      });
    });

    const updated = await updatePublicRouteTemplateConditionally(
      POD_ROOT,
      resourceUrl,
      ROUTE_TEMPLATE_ID,
      nextSnapshot,
      WEB_ID,
      fetcher
    );
    expect(updated.previous.etag).toBe('"route-v1"');
    expect(updated.current.etag).toBe('"route-v2"');

    const restored = await updatePublicRouteTemplateConditionally(
      POD_ROOT,
      resourceUrl,
      ROUTE_TEMPLATE_ID,
      updated.previous.snapshot,
      WEB_ID,
      fetcher,
      updated.current
    );
    expect(restored.previous).toEqual(updated.current);
    expect(restored.current).toEqual({
      resourceUrl,
      snapshot: previousSnapshot,
      etag: '"route-v3"',
    });
    expect(ownerAclMocks.setOwnerOnlyResourceAccess).not.toHaveBeenCalled();
    expect(ownerAclMocks.setOwnerPublicReadResourceAccess).toHaveBeenCalledTimes(2);
  });

  it("blocks rollback when expectedCurrent no longer matches the live resource", async () => {
    const currentSnapshot = createRouteTemplateSnapshot(
      {
        name: "Parallel geändert",
        geometry: [[[7.1, 51.2], [7.2, 51.3]]],
      },
      ROUTE_TEMPLATE_ID
    );
    const rollbackSnapshot = createRouteTemplateSnapshot(
      {
        name: "Nordbahntrasse",
        geometry: [[[7.1, 51.2], [7.2, 51.3]]],
      },
      ROUTE_TEMPLATE_ID
    );
    const resourceUrl = `${storageUrls(POD_ROOT).routeTemplates}${ROUTE_TEMPLATE_ID}.geojson`;
    const fetcher = vi.fn<typeof fetch>(async () =>
      responseAt(resourceUrl, JSON.stringify(currentSnapshot), {
        status: 200,
        headers: { ETag: '"route-v3"' },
      })
    );

    await expect(
      updatePublicRouteTemplateConditionally(
        POD_ROOT,
        resourceUrl,
        ROUTE_TEMPLATE_ID,
        rollbackSnapshot,
        WEB_ID,
        fetcher,
        {
          resourceUrl,
          snapshot: currentSnapshot,
          etag: '"route-v2"',
        }
      )
    ).rejects.toBeInstanceOf(PublicRouteTemplateConflictError);
    expect(fetcher.mock.calls.some(([, init]) => init?.method === "PUT")).toBe(false);
    expect(ownerAclMocks.setOwnerPublicReadResourceAccess).not.toHaveBeenCalled();
  });
});
