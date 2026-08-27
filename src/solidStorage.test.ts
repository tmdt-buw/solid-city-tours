import { beforeEach, describe, expect, it, vi } from "vitest";

const ownerAclMocks = vi.hoisted(() => ({
  setOwnerOnlyResourceAccess: vi.fn(),
  setOwnerPublicReadResourceAccess: vi.fn(),
}));

vi.mock("./ownerAcl", () => ownerAclMocks);

import {
  GENERIC_INTERESTS,
  deriveCssPodRoot,
  loadDraftMasterSnapshot,
  loadStateSnapshot,
  PrivateResourceConflictError,
  resolvePodRoot,
  saveDraftConditionally,
  saveState,
  saveStateIfUnchanged,
  storageAclPlan,
  runManifestTurtle,
  setOwnerOnlyIfPresent,
  setOwnerPublicReadIfPresent,
  storageUrls,
} from "./solidStorage";
import { draftFeature } from "./domain";

describe("private Pod layout", () => {
  beforeEach(() => {
    ownerAclMocks.setOwnerOnlyResourceAccess.mockReset();
    ownerAclMocks.setOwnerPublicReadResourceAccess.mockReset();
    ownerAclMocks.setOwnerOnlyResourceAccess.mockResolvedValue(undefined);
    ownerAclMocks.setOwnerPublicReadResourceAccess.mockResolvedValue(undefined);
  });

  it("keeps Tours data below solid-tours and never writes Health App files", () => {
    const urls = storageUrls("https://pod.example/laura/");
    expect(Object.values(urls).every((url) => url.startsWith("https://pod.example/laura/solid-tours/"))).toBe(true);
    expect(Object.keys(urls).some((key) => key.toLowerCase().includes("health"))).toBe(false);
  });

  it("derives only unambiguous CSS profile/card Pod roots", () => {
    expect(
      deriveCssPodRoot("https://id.example/users/alice/profile/card#me")
    ).toBe("https://id.example/users/alice/");
    expect(deriveCssPodRoot("https://id.example/profile/card#me")).toBe(
      "https://id.example/"
    );
    expect(() =>
      deriveCssPodRoot("https://id.example/users/alice#me")
    ).toThrow(/private Solid Pod/);
    expect(() =>
      deriveCssPodRoot("https://id.example/users/bob/profile#me")
    ).toThrow(/private Solid Pod/);
  });

  it("uses a discovered external Pod root instead of deriving it from the WebID", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const resolver = vi
      .fn()
      .mockResolvedValue(["https://storage.example/alice"]);

    await expect(
      resolvePodRoot("https://identity.example/alice#me", fetcher, resolver)
    ).resolves.toBe("https://storage.example/alice/");
    expect(resolver).toHaveBeenCalledWith(
      "https://identity.example/alice#me",
      { fetch: fetcher }
    );
  });

  it("fails closed when Pod discovery fails instead of guessing a CSS path", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const resolver = vi.fn().mockRejectedValue(new Error("profile unavailable"));

    await expect(
      resolvePodRoot(
        "https://identity.example/alice/profile/card#me",
        fetcher,
        resolver
      )
    ).rejects.toThrow(/private Solid Pod/);
  });

  it("accepts the CSS fallback only after successful discovery without storage links", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const resolver = vi.fn().mockResolvedValue([]);

    await expect(
      resolvePodRoot(
        "https://identity.example/alice/profile/card#me",
        fetcher,
        resolver
      )
    ).resolves.toBe("https://identity.example/alice/");
    await expect(
      resolvePodRoot("https://identity.example/alice#me", fetcher, resolver)
    ).rejects.toThrow(/private Solid Pod/);
  });

  it("rejects unsafe Pod roots returned by profile discovery", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const resolver = vi
      .fn()
      .mockResolvedValue(["https://user:secret@storage.example/alice/"]);

    await expect(
      resolvePodRoot("https://identity.example/alice#me", fetcher, resolver)
    ).rejects.toThrow(/private Solid Pod/);
  });

  it("creates a private run manifest that points only to the GeoJSON snapshot", () => {
    const turtle = runManifestTurtle(
      "49f3344a-e58b-4f6a-a874-84e3815620e6",
      "https://pod.example/laura/solid-tours/runs/49f3344a-e58b-4f6a-a874-84e3815620e6/activity.geojson",
      "2026-08-20T12:00:00.000Z"
    );
    expect(turtle).toContain("tour:ScenarioRun");
    expect(turtle).toContain("activity.geojson");
    expect(turtle).not.toContain("Laura");
  });

  it("uses the fixed generic interest vocabulary", () => {
    expect(GENERIC_INTERESTS).toEqual([
      "Outdoor activities",
      "Movement/Fitness",
      "Nature",
      "Regional exploration",
      "Sustainable mobility",
    ]);
  });

  it("applies owner-only defaults and explicit ACLs to every private storage class", () => {
    const root = "https://pod.example/laura/";
    const urls = storageUrls(root);
    expect(storageAclPlan(root)).toEqual({
      containers: [urls.tours, urls.drafts, urls.activities, urls.runs, urls.public],
      masterResources: [urls.state, urls.interests],
      containedResourceContainers: [urls.drafts, urls.activities],
      publicResources: [urls.marker],
    });
    expect(storageAclPlan(root).masterResources).not.toContain(urls.marker);
  });

  it("swallows only a direct 404 from the data-resource existence probe", async () => {
    const resourceUrl = "https://pod.example/hannah/solid-tours/state.json";
    const ownerWebId = "https://pod.example/hannah/profile/card#me";
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 404 }));

    await expect(
      setOwnerOnlyIfPresent(resourceUrl, ownerWebId, fetcher)
    ).resolves.toBeUndefined();
    expect(ownerAclMocks.setOwnerOnlyResourceAccess).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledWith(
      resourceUrl,
      expect.objectContaining({ method: "HEAD", cache: "no-store", redirect: "error" })
    );
  });

  it("propagates an ACL-stage 404 after the data resource was found", async () => {
    const resourceUrl = "https://pod.example/hannah/solid-tours/state.json";
    const ownerWebId = "https://pod.example/hannah/profile/card#me";
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));
    const acl404 = Object.assign(new Error("ACL PUT 404"), { statusCode: 404 });
    ownerAclMocks.setOwnerOnlyResourceAccess.mockRejectedValue(acl404);

    await expect(setOwnerOnlyIfPresent(resourceUrl, ownerWebId, fetcher)).rejects.toBe(
      acl404
    );
    expect(ownerAclMocks.setOwnerOnlyResourceAccess).toHaveBeenCalledTimes(1);
  });

  it("also propagates marker ACL-stage 404 responses", async () => {
    const markerUrl = "https://pod.example/hannah/solid-tours/public/current-run.json";
    const ownerWebId = "https://pod.example/hannah/profile/card#me";
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 200 }));
    const acl404 = Object.assign(new Error("Marker ACL GET 404"), { statusCode: 404 });
    ownerAclMocks.setOwnerPublicReadResourceAccess.mockRejectedValue(acl404);

    await expect(
      setOwnerPublicReadIfPresent(markerUrl, ownerWebId, fetcher)
    ).rejects.toBe(acl404);
    expect(ownerAclMocks.setOwnerPublicReadResourceAccess).toHaveBeenCalledTimes(1);
  });

  it("loads a strong state ETag for an authenticated conditional update", async () => {
    const podRoot = "https://pod.example/hannah/";
    const state = { schemaVersion: 1 as const, drafts: [], activities: [], activeRun: null };
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify(state), {
        status: 200,
        headers: { "Content-Type": "application/json", ETag: '"state-v1"' },
      })
    );

    await expect(loadStateSnapshot(podRoot, fetcher)).resolves.toEqual({
      state,
      etag: '"state-v1"',
    });
    expect(fetcher).toHaveBeenCalledWith(
      `${podRoot}solid-tours/state.json`,
      expect.objectContaining({ cache: "no-store", redirect: "error" })
    );
  });

  it("accepts a legacy activity-specific draft master when it canonically matches the neutral route", async () => {
    const podRoot = "https://pod.example/hannah/";
    const draft = {
      id: "8db47d3b-8a4f-4a74-b086-77c1c7630bf7",
      name: "Legacy bike route",
      routeSource: "drawn" as const,
      geometry: [[[7.1, 51.2], [7.2, 51.3]]] as [[number, number][]],
      createdAt: "2026-08-20T12:00:00.000Z",
      updatedAt: "2026-08-20T12:00:00.000Z",
    };
    const legacyMaster = {
      type: "Feature",
      geometry: { type: "MultiLineString", coordinates: draft.geometry },
      properties: {
        schemaVersion: "1.0",
        source: "solid-tours",
        tourId: draft.id,
        name: draft.name,
        activityType: "cycling",
        routeSource: "osrm",
        durationMinutes: 55,
        durationSource: "osrm",
        createdAt: draft.createdAt,
        updatedAt: draft.updatedAt,
      },
    };
    const fetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify(legacyMaster), {
        status: 200,
        headers: { "Content-Type": "application/geo+json", ETag: '"legacy-draft-v1"' },
      })
    );

    await expect(loadDraftMasterSnapshot(podRoot, draft, fetcher)).resolves.toEqual({
      etag: '"legacy-draft-v1"',
    });
  });

  it("still rejects a changed or extended legacy draft master", async () => {
    const podRoot = "https://pod.example/hannah/";
    const draft = {
      id: "8db47d3b-8a4f-4a74-b086-77c1c7630bf7",
      name: "Expected route",
      routeSource: "drawn" as const,
      geometry: [[[7.1, 51.2], [7.2, 51.3]]] as [[number, number][]],
      createdAt: "2026-08-20T12:00:00.000Z",
      updatedAt: "2026-08-20T12:00:00.000Z",
    };
    const legacyMaster = {
      type: "Feature",
      geometry: { type: "MultiLineString", coordinates: draft.geometry },
      properties: {
        schemaVersion: "1.0",
        source: "solid-tours",
        tourId: draft.id,
        name: "Concurrently changed route",
        activityType: "cycling",
        routeSource: "osrm",
        durationMinutes: 55,
        durationSource: "osrm",
        createdAt: draft.createdAt,
        updatedAt: draft.updatedAt,
      },
    };
    const changedFetcher = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify(legacyMaster), {
        status: 200,
        headers: { "Content-Type": "application/geo+json", ETag: '"legacy-draft-v2"' },
      })
    );
    const extendedFetcher = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          ...legacyMaster,
          properties: { ...legacyMaster.properties, privateNote: "must not be overwritten" },
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/geo+json", ETag: '"legacy-draft-v2"' },
        }
      )
    );

    await expect(loadDraftMasterSnapshot(podRoot, draft, changedFetcher)).rejects.toThrow(
      /zwischenzeitlich geändert/
    );
    await expect(loadDraftMasterSnapshot(podRoot, draft, extendedFetcher)).rejects.toThrow(
      /zwischenzeitlich geändert/
    );
  });

  it("updates state with If-Match and verifies the resulting state and ETag", async () => {
    const podRoot = "https://pod.example/hannah/";
    const ownerWebId = `${podRoot}profile/card#me`;
    const state = { schemaVersion: 1 as const, drafts: [], activities: [], activeRun: null };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(state), {
          status: 200,
          headers: { "Content-Type": "application/json", ETag: '"state-v2"' },
        })
      );

    await expect(
      saveStateIfUnchanged(podRoot, state, '"state-v1"', ownerWebId, fetcher)
    ).resolves.toEqual({ state, etag: '"state-v2"' });

    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      `${podRoot}solid-tours/state.json`,
      expect.objectContaining({
        method: "PUT",
        redirect: "error",
        headers: expect.objectContaining({ "If-Match": '"state-v1"' }),
      })
    );
    expect(ownerAclMocks.setOwnerOnlyResourceAccess).toHaveBeenCalledTimes(2);
  });

  it("aborts a conditional state update on a concurrent ETag conflict", async () => {
    const podRoot = "https://pod.example/hannah/";
    const ownerWebId = `${podRoot}profile/card#me`;
    const state = { schemaVersion: 1 as const, drafts: [], activities: [], activeRun: null };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 412 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(state), {
          status: 200,
          headers: { "Content-Type": "application/json", ETag: '"state-v2"' },
        })
      );

    await expect(
      saveStateIfUnchanged(podRoot, state, '"state-v1"', ownerWebId, fetcher)
    ).rejects.toThrow(/zwischenzeitlich geändert/);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(ownerAclMocks.setOwnerOnlyResourceAccess).toHaveBeenCalledTimes(1);
  });

  it("reconciles a lost PUT response when the intended state was committed server-side", async () => {
    const podRoot = "https://pod.example/reconciled/";
    const ownerWebId = `${podRoot}profile/card#me`;
    const state = { schemaVersion: 1 as const, drafts: [], activities: [], activeRun: null };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockRejectedValueOnce(new TypeError("response lost"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(state), {
          status: 200,
          headers: { "Content-Type": "application/json", ETag: '"state-v2"' },
        })
      );

    await expect(
      saveStateIfUnchanged(podRoot, state, '"state-v1"', ownerWebId, fetcher)
    ).resolves.toEqual({ state, etag: '"state-v2"' });
    expect(ownerAclMocks.setOwnerOnlyResourceAccess).toHaveBeenCalledTimes(2);
  });

  it("creates an initially missing state only with If-None-Match", async () => {
    const podRoot = "https://pod.example/new-state/";
    const ownerWebId = `${podRoot}profile/card#me`;
    const state = { schemaVersion: 1 as const, drafts: [], activities: [], activeRun: null };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(state), {
          status: 200,
          headers: { "Content-Type": "application/json", ETag: '"state-v1"' },
        })
      );

    await expect(saveState(podRoot, state, state, ownerWebId, fetcher)).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenNthCalledWith(
      3,
      `${podRoot}solid-tours/state.json`,
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({ "If-None-Match": "*" }),
      })
    );
  });

  it("uses the cached per-Pod ETag for ordinary state writers", async () => {
    const podRoot = "https://pod.example/existing-state/";
    const ownerWebId = `${podRoot}profile/card#me`;
    const state = { schemaVersion: 1 as const, drafts: [], activities: [], activeRun: null };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(state), {
          status: 200,
          headers: { "Content-Type": "application/json", ETag: '"state-v1"' },
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(state), {
          status: 200,
          headers: { "Content-Type": "application/json", ETag: '"state-v2"' },
        })
      );

    await loadStateSnapshot(podRoot, fetcher);
    await expect(saveState(podRoot, state, state, ownerWebId, fetcher)).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenNthCalledWith(
      3,
      `${podRoot}solid-tours/state.json`,
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({ "If-Match": '"state-v1"' }),
      })
    );
  });

  it("does not reuse a refreshed ETag for a second save based on stale UI state after 412", async () => {
    const podRoot = "https://pod.example/stale-after-conflict/";
    const ownerWebId = `${podRoot}profile/card#me`;
    const base = { schemaVersion: 1 as const, drafts: [], activities: [], activeRun: null };
    const draftA = {
      id: "0c8744e7-3bd1-4968-8e57-460ff3b828dc",
      name: "Lokaler Entwurf",
      routeSource: "drawn" as const,
      geometry: [[[7.1, 51.2], [7.2, 51.3]]] as [[number, number][]],
      createdAt: "2026-08-20T12:00:00.000Z",
      updatedAt: "2026-08-20T12:00:00.000Z",
    };
    const draftB = {
      ...draftA,
      id: "8db47d3b-8a4f-4a74-b086-77c1c7630bf7",
      name: "Paralleler Entwurf",
    };
    const staleTarget = { ...base, drafts: [draftA] };
    const concurrentState = { ...base, drafts: [draftB] };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(base), {
          status: 200,
          headers: { "Content-Type": "application/json", ETag: '"state-v1"' },
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 412 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(concurrentState), {
          status: 200,
          headers: { "Content-Type": "application/json", ETag: '"state-v2"' },
        })
      );

    await loadStateSnapshot(podRoot, fetcher);
    await expect(
      saveState(podRoot, staleTarget, base, ownerWebId, fetcher)
    ).rejects.toThrow(/zwischenzeitlich geändert/);
    await expect(
      saveState(podRoot, staleTarget, base, ownerWebId, fetcher)
    ).rejects.toThrow(/lokale Solid-Tours-Stand ist veraltet/);

    const puts = fetcher.mock.calls.filter(([, init]) => init?.method === "PUT");
    expect(puts).toHaveLength(1);
    expect(new Headers(puts[0][1]?.headers).get("If-Match")).toBe('"state-v1"');
  });

  it("fails a second overlapping mutation that was derived from the first mutation's old base", async () => {
    const podRoot = "https://pod.example/overlapping-writers/";
    const ownerWebId = `${podRoot}profile/card#me`;
    const base = { schemaVersion: 1 as const, drafts: [], activities: [], activeRun: null };
    const draft = {
      id: "0c8744e7-3bd1-4968-8e57-460ff3b828dc",
      name: "Erster Entwurf",
      routeSource: "drawn" as const,
      geometry: [[[7.1, 51.2], [7.2, 51.3]]] as [[number, number][]],
      createdAt: "2026-08-20T12:00:00.000Z",
      updatedAt: "2026-08-20T12:00:00.000Z",
    };
    const firstTarget = { ...base, drafts: [draft] };
    const secondTarget = { ...base, drafts: [{ ...draft, name: "Zweiter Entwurf" }] };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(base), {
          status: 200,
          headers: { "Content-Type": "application/json", ETag: '"state-v1"' },
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(firstTarget), {
          status: 200,
          headers: { "Content-Type": "application/json", ETag: '"state-v2"' },
        })
      );

    await loadStateSnapshot(podRoot, fetcher);
    await expect(
      saveState(podRoot, firstTarget, base, ownerWebId, fetcher)
    ).resolves.toBeUndefined();
    await expect(
      saveState(podRoot, secondTarget, base, ownerWebId, fetcher)
    ).rejects.toThrow(/lokale Solid-Tours-Stand ist veraltet/);

    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(1);
  });

  it("treats a create-only 412 as a definitive private-resource conflict", async () => {
    const podRoot = "https://pod.example/private-create-conflict/";
    const ownerWebId = `${podRoot}profile/card#me`;
    const draft = {
      id: "0c8744e7-3bd1-4968-8e57-460ff3b828dc",
      name: "Gleicher Inhalt, fremde Ressource",
      routeSource: "drawn" as const,
      geometry: [[[7.1, 51.2], [7.2, 51.3]]] as [[number, number][]],
      createdAt: "2026-08-20T12:00:00.000Z",
      updatedAt: "2026-08-20T12:00:00.000Z",
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 412 }));

    await expect(
      saveDraftConditionally(podRoot, draft, null, ownerWebId, fetcher)
    ).rejects.toBeInstanceOf(PrivateResourceConflictError);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      `${podRoot}solid-tours/drafts/${draft.id}.geojson`,
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({ "If-None-Match": "*" }),
      })
    );
    expect(ownerAclMocks.setOwnerOnlyResourceAccess).not.toHaveBeenCalled();
  });

  it("reconciles a committed private PUT after a transient post-write ACL error", async () => {
    const podRoot = "https://pod.example/private-post-write/";
    const ownerWebId = `${podRoot}profile/card#me`;
    const draft = {
      id: "8db47d3b-8a4f-4a74-b086-77c1c7630bf7",
      name: "Sicher verifizierter Entwurf",
      routeSource: "drawn" as const,
      geometry: [[[7.1, 51.2], [7.2, 51.3]]] as [[number, number][]],
      createdAt: "2026-08-20T12:00:00.000Z",
      updatedAt: "2026-08-20T12:00:00.000Z",
    };
    ownerAclMocks.setOwnerOnlyResourceAccess
      .mockRejectedValueOnce(new TypeError("ACL response lost"))
      .mockResolvedValueOnce(undefined);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(draftFeature(draft)), {
          status: 200,
          headers: { "Content-Type": "application/geo+json", ETag: '"draft-v1"' },
        })
      );

    await expect(
      saveDraftConditionally(podRoot, draft, null, ownerWebId, fetcher)
    ).resolves.toEqual({ etag: '"draft-v1"' });
    expect(ownerAclMocks.setOwnerOnlyResourceAccess).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
