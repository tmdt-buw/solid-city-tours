import { beforeEach, describe, expect, it, vi } from "vitest";

const ownerAclMocks = vi.hoisted(() => ({
  setOwnerOnlyResourceAccess: vi.fn(),
  setOwnerPublicReadResourceAccess: vi.fn(),
}));

vi.mock("./ownerAcl", () => ownerAclMocks);

import {
  clearPublishedMarker,
  loadPublishedMarkerSnapshot,
  storageUrls,
  writePublishedMarker,
  type PublishedMarker,
} from "./solidStorage";

const podRoot = "https://pod.example/hannah/";
const ownerWebId = `${podRoot}profile/card#me`;
const runId = "49f3344a-e58b-4f6a-a874-84e3815620e6";
const otherRunId = "7a64c06e-793f-4ab2-85af-fb8bfbd7ae77";

const markerInput = (scenarioRunId = runId) => ({
  scenarioRunId,
  datasetIdentifier: `solid-tours-activity-${scenarioRunId}`,
  catalogDatasetUrl: `${podRoot}catalog/ds/solid-tours-activity-${scenarioRunId}.ttl#it`,
  distributionUrl: `${podRoot}solid-tours/runs/${scenarioRunId}/activity.geojson`,
  publishedAt: "2026-08-21T12:00:00.000Z",
});

const marker = (scenarioRunId = runId): PublishedMarker => ({
  schemaVersion: 1,
  source: "solid-tours",
  status: "published",
  ...markerInput(scenarioRunId),
});

const markerResponse = (value: unknown, etag = '"marker-v1"') =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json", ETag: etag },
  });

describe("run-scoped published marker CAS", () => {
  beforeEach(() => {
    ownerAclMocks.setOwnerOnlyResourceAccess.mockReset();
    ownerAclMocks.setOwnerPublicReadResourceAccess.mockReset();
    ownerAclMocks.setOwnerPublicReadResourceAccess.mockResolvedValue(undefined);
  });

  it("creates only with If-None-Match and verifies the exact strong-ETag snapshot", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 201 }))
      .mockResolvedValueOnce(markerResponse(marker(), '"marker-v1"'));

    await expect(
      writePublishedMarker(podRoot, markerInput(), ownerWebId, fetcher)
    ).resolves.toEqual({ marker: marker(), etag: '"marker-v1"' });

    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      storageUrls(podRoot).marker,
      expect.objectContaining({ method: "PUT", cache: "no-store", redirect: "error" })
    );
    const putHeaders = new Headers(fetcher.mock.calls[1]?.[1]?.headers);
    expect(putHeaders.get("If-None-Match")).toBe("*");
    expect(putHeaders.get("If-Match")).toBeNull();
    expect(ownerAclMocks.setOwnerOnlyResourceAccess).not.toHaveBeenCalled();
    expect(ownerAclMocks.setOwnerPublicReadResourceAccess).toHaveBeenCalledOnce();
  });

  it("updates only the same run with its exact strong ETag", async () => {
    const previous = { ...marker(), publishedAt: "2026-08-21T11:00:00.000Z" };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(markerResponse(previous, '"marker-v1"'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(markerResponse(marker(), '"marker-v2"'));

    await writePublishedMarker(podRoot, markerInput(), ownerWebId, fetcher);

    const putHeaders = new Headers(fetcher.mock.calls[1]?.[1]?.headers);
    expect(putHeaders.get("If-Match")).toBe('"marker-v1"');
    expect(putHeaders.get("If-None-Match")).toBeNull();
  });

  it("never overwrites or changes ACLs for another run", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(markerResponse(marker(otherRunId)));

    await expect(
      writePublishedMarker(podRoot, markerInput(), ownerWebId, fetcher)
    ).rejects.toThrow(/anderer Szenariolauf/);

    expect(fetcher).toHaveBeenCalledOnce();
    expect(ownerAclMocks.setOwnerPublicReadResourceAccess).not.toHaveBeenCalled();
    expect(ownerAclMocks.setOwnerOnlyResourceAccess).not.toHaveBeenCalled();
  });

  it("reconciles a lost create response only from the exact marker and strong ETag", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockRejectedValueOnce(new TypeError("PUT response lost"))
      .mockResolvedValueOnce(markerResponse(marker(), '"marker-v1"'))
      .mockResolvedValueOnce(markerResponse(marker(), '"marker-v1"'));

    await expect(
      writePublishedMarker(podRoot, markerInput(), ownerWebId, fetcher)
    ).resolves.toEqual({ marker: marker(), etag: '"marker-v1"' });
    expect(ownerAclMocks.setOwnerPublicReadResourceAccess).toHaveBeenCalledOnce();
  });

  it("fails closed on malformed schema or a weak marker ETag", async () => {
    const malformed = { ...marker(), source: "other-app" };
    const malformedFetch = vi.fn<typeof fetch>().mockResolvedValueOnce(markerResponse(malformed));
    await expect(loadPublishedMarkerSnapshot(podRoot, malformedFetch)).rejects.toThrow(
      /ungueltiges Format/
    );

    const weakFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(markerResponse(marker(), 'W/"marker-v1"'));
    await expect(loadPublishedMarkerSnapshot(podRoot, weakFetch)).rejects.toThrow(
      /starken Versionsnachweis/
    );
  });

  it("deletes only its expected run with If-Match", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(markerResponse(marker(), '"marker-v1"'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));

    await expect(clearPublishedMarker(podRoot, runId, fetcher)).resolves.toBeUndefined();
    const deleteHeaders = new Headers(fetcher.mock.calls[1]?.[1]?.headers);
    expect(fetcher.mock.calls[1]?.[1]?.method).toBe("DELETE");
    expect(deleteHeaders.get("If-Match")).toBe('"marker-v1"');
  });

  it("leaves another run untouched and reconciles a lost own-run DELETE response", async () => {
    const otherFetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(markerResponse(marker(otherRunId)));
    await expect(clearPublishedMarker(podRoot, runId, otherFetcher)).resolves.toBeUndefined();
    expect(otherFetcher).toHaveBeenCalledOnce();

    const lostResponseFetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(markerResponse(marker(), '"marker-v1"'))
      .mockRejectedValueOnce(new TypeError("DELETE response lost"))
      .mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(
      clearPublishedMarker(podRoot, runId, lostResponseFetcher)
    ).resolves.toBeUndefined();
  });
});


it("round-trips continuous mode regardless of input property order", async () => {
  const value = { ...marker(), donationMode: "continuous" as const };
  const fetcher = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 404 }))
    .mockResolvedValueOnce(new Response(null, { status: 201 }))
    .mockResolvedValueOnce(markerResponse(value));
  const result = await writePublishedMarker(podRoot, { donationMode: "continuous", ...markerInput() }, ownerWebId, fetcher);
  expect(result.marker.donationMode).toBe("continuous");
});
