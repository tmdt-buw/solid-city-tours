import {
  addMockResourceAclTo,
  getResourceAcl,
  mockFileFrom,
  setAgentResourceAccess,
  setPublicResourceAccess,
} from "@inrupt/solid-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const solidClientNetworkMocks = vi.hoisted(() => ({
  getResourceInfoWithAcl: vi.fn(),
  saveAclFor: vi.fn(),
}));

vi.mock("@inrupt/solid-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@inrupt/solid-client")>();
  return {
    ...actual,
    getResourceInfoWithAcl: solidClientNetworkMocks.getResourceInfoWithAcl,
    saveAclFor: solidClientNetworkMocks.saveAclFor,
  };
});

import { assertOwnerOnlyAcl, setOwnerOnlyResourceAccess } from "./ownerAcl";

const resourceUrl = "https://pod.example/hannah/solid-tours/runs/run/activity.geojson";
const aclUrl = `${resourceUrl}.acl`;
const ownerWebId = "https://pod.example/hannah/profile/card#me";
const workerWebId = "https://pod.example/worker/profile/card#me";
const ownerAccess = { read: true, append: false, write: true, control: true };
const publicRead = { read: true, append: false, write: false, control: false };

const resourceWithAcl = ({
  publicAccess,
  workerAccess = false,
}: {
  publicAccess: boolean;
  workerAccess?: boolean;
}) => {
  const resource = addMockResourceAclTo(mockFileFrom(resourceUrl));
  let acl = setAgentResourceAccess(getResourceAcl(resource), ownerWebId, ownerAccess);
  if (workerAccess) acl = setAgentResourceAccess(acl, workerWebId, publicRead);
  if (publicAccess) acl = setPublicResourceAccess(acl, publicRead);
  const normalizedAcl = {
    ...acl,
    internal_resourceInfo: { ...acl.internal_resourceInfo, sourceIri: aclUrl },
  };
  return {
    ...resource,
    internal_resourceInfo: {
      ...resource.internal_resourceInfo,
      aclUrl,
      linkedResources: { ...resource.internal_resourceInfo.linkedResources, acl: [aclUrl] },
    },
    internal_acl: { ...resource.internal_acl, resourceAcl: normalizedAcl },
  };
};

const withAclTarget = (
  resource: ReturnType<typeof resourceWithAcl>,
  targetAclUrl: string,
  internalAclSource = targetAclUrl
) => {
  const existingAcl = getResourceAcl(resource);
  return {
    ...resource,
    internal_resourceInfo: {
      ...resource.internal_resourceInfo,
      aclUrl: targetAclUrl,
      linkedResources: {
        ...resource.internal_resourceInfo.linkedResources,
        acl: [targetAclUrl],
      },
    },
    internal_acl: {
      ...resource.internal_acl,
      resourceAcl: {
        ...existingAcl,
        internal_resourceInfo: {
          ...existingAcl.internal_resourceInfo,
          sourceIri: internalAclSource,
        },
      },
    },
  };
};

describe("owner-only ACL persistence", () => {
  beforeEach(() => {
    solidClientNetworkMocks.getResourceInfoWithAcl.mockReset();
    solidClientNetworkMocks.saveAclFor.mockReset();
  });

  it("replaces stale Worker/public grants with a PUT and verifies owner-only after a stale read", async () => {
    const initialPublicResource = resourceWithAcl({
      publicAccess: true,
      workerAccess: true,
    });
    const verifiedOwnerOnlyResource = resourceWithAcl({ publicAccess: false });
    const authenticatedFetch = vi.fn<
      (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    >(async (_input, init) =>
      new Response(null, {
        status: 200,
        headers: init?.method === "HEAD" ? { ETag: '"acl-v1"' } : undefined,
      })
    );
    let readCount = 0;

    solidClientNetworkMocks.getResourceInfoWithAcl.mockImplementation(
      async (_url, options) => {
        await options.fetch(resourceUrl, {
          method: "GET",
          headers: { Accept: "text/turtle" },
        });
        readCount += 1;
        // Model the ACL shape that caused reset to fail and one stale read after PUT.
        return readCount <= 2 ? initialPublicResource : verifiedOwnerOnlyResource;
      }
    );

    // The old PATCH-based implementation left this Worker rule in place.
    // This is the exact assertion/error observed during reset.
    expect(() =>
      assertOwnerOnlyAcl(getResourceAcl(initialPublicResource), ownerWebId)
    ).toThrow("Die Resource-ACL ist nicht ausschließlich für den Owner freigegeben.");

    await expect(
      setOwnerOnlyResourceAccess(resourceUrl, ownerWebId, authenticatedFetch)
    ).resolves.toBeUndefined();

    expect(authenticatedFetch).toHaveBeenCalledTimes(5);
    for (const [, init] of authenticatedFetch.mock.calls) {
      expect(init?.cache).toBe("no-store");
      const headers = new Headers(init?.headers);
      expect(headers.get("Cache-Control")).toBe("no-cache");
      expect(headers.get("Pragma")).toBe("no-cache");
    }
    const putCall = authenticatedFetch.mock.calls.find(
      ([input, init]) => input.toString() === aclUrl && init?.method === "PUT"
    );
    expect(putCall).toBeDefined();
    expect(putCall?.[1]?.redirect).toBe("error");
    expect(new Headers(putCall?.[1]?.headers).get("Content-Type")).toBe("text/turtle");
    expect(new Headers(putCall?.[1]?.headers).get("If-Match")).toBe('"acl-v1"');
    expect(putCall?.[1]?.body).toContain(ownerWebId);
    expect(putCall?.[1]?.body).not.toContain(workerWebId);
    expect(putCall?.[1]?.body).not.toContain("http://xmlns.com/foaf/0.1/Agent");
    expect(solidClientNetworkMocks.saveAclFor).not.toHaveBeenCalled();
  });

  it("refuses to send the ACL document to a cross-origin Link rel=acl target", async () => {
    const resource = resourceWithAcl({ publicAccess: true, workerAccess: true });
    const foreignAclUrl = "https://attacker.example/captured-acl";
    const foreignLinkedResource = withAclTarget(resource, foreignAclUrl);
    solidClientNetworkMocks.getResourceInfoWithAcl.mockResolvedValue(foreignLinkedResource);
    const authenticatedFetch = vi.fn<typeof fetch>();

    await expect(
      setOwnerOnlyResourceAccess(resourceUrl, ownerWebId, authenticatedFetch)
    ).rejects.toThrow("Die Resource-ACL verweist auf ein unzulässiges oder verändertes Ziel.");
    expect(authenticatedFetch).not.toHaveBeenCalled();
  });

  it("propagates an ACL PUT 404 instead of treating the data resource as missing", async () => {
    const resource = resourceWithAcl({ publicAccess: true, workerAccess: true });
    solidClientNetworkMocks.getResourceInfoWithAcl.mockResolvedValue(resource);
    const authenticatedFetch = vi.fn<typeof fetch>(async (_input, init) => {
      if (init?.method === "HEAD") {
        return new Response(null, { status: 200, headers: { ETag: '"acl-v1"' } });
      }
      if (init?.method === "PUT") return new Response(null, { status: 404 });
      return new Response(null, { status: 200 });
    });

    await expect(
      setOwnerOnlyResourceAccess(resourceUrl, ownerWebId, authenticatedFetch)
    ).rejects.toThrow("Die Resource-ACL konnte nicht vollständig ersetzt werden (404).");
    expect(solidClientNetworkMocks.getResourceInfoWithAcl).toHaveBeenCalledTimes(1);
  });

  it("propagates an ACL HEAD 404 when an explicit ACL was initially loaded", async () => {
    const resource = resourceWithAcl({ publicAccess: true, workerAccess: true });
    solidClientNetworkMocks.getResourceInfoWithAcl.mockResolvedValue(resource);
    const authenticatedFetch = vi.fn<typeof fetch>(async (_input, init) =>
      new Response(null, { status: init?.method === "HEAD" ? 404 : 200 })
    );

    await expect(
      setOwnerOnlyResourceAccess(resourceUrl, ownerWebId, authenticatedFetch)
    ).rejects.toThrow("Die zuvor geladene Resource-ACL ist nicht mehr vorhanden (404).");
    expect(
      authenticatedFetch.mock.calls.filter(([, init]) => init?.method === "PUT")
    ).toHaveLength(0);
  });

  it("rejects a changed same-origin ACL target during verification without retrying", async () => {
    const initialResource = resourceWithAcl({ publicAccess: true, workerAccess: true });
    const changedAclUrl = `${resourceUrl}.wac`;
    const changedTargetResource = withAclTarget(
      resourceWithAcl({ publicAccess: false }),
      changedAclUrl
    );
    solidClientNetworkMocks.getResourceInfoWithAcl
      .mockResolvedValueOnce(initialResource)
      .mockResolvedValue(changedTargetResource);
    const authenticatedFetch = vi.fn<typeof fetch>(async () =>
      new Response(null, { status: 200 })
    );

    await expect(
      setOwnerOnlyResourceAccess(resourceUrl, ownerWebId, authenticatedFetch)
    ).rejects.toThrow("Die Resource-ACL verweist auf ein unzulässiges oder verändertes Ziel.");
    expect(solidClientNetworkMocks.getResourceInfoWithAcl).toHaveBeenCalledTimes(2);
  });

  it("rejects a changed resource source during verification without retrying", async () => {
    const initialResource = resourceWithAcl({ publicAccess: true, workerAccess: true });
    const verifiedResource = resourceWithAcl({ publicAccess: false });
    const changedSourceResource = {
      ...verifiedResource,
      internal_resourceInfo: {
        ...verifiedResource.internal_resourceInfo,
        sourceIri: `${resourceUrl}?different-source`,
      },
    };
    solidClientNetworkMocks.getResourceInfoWithAcl
      .mockResolvedValueOnce(initialResource)
      .mockResolvedValue(changedSourceResource);
    const authenticatedFetch = vi.fn<typeof fetch>(async () =>
      new Response(null, { status: 200 })
    );

    await expect(
      setOwnerOnlyResourceAccess(resourceUrl, ownerWebId, authenticatedFetch)
    ).rejects.toThrow(
      "Die geladene Resource-Source entspricht nicht der angefragten Resource."
    );
    expect(solidClientNetworkMocks.getResourceInfoWithAcl).toHaveBeenCalledTimes(2);
  });

  it("rejects an ACL self-link before sending authenticated ACL traffic", async () => {
    const selfLinkedResource = withAclTarget(
      resourceWithAcl({ publicAccess: true, workerAccess: true }),
      resourceUrl
    );
    solidClientNetworkMocks.getResourceInfoWithAcl.mockResolvedValue(selfLinkedResource);
    const authenticatedFetch = vi.fn<typeof fetch>();

    await expect(
      setOwnerOnlyResourceAccess(resourceUrl, ownerWebId, authenticatedFetch)
    ).rejects.toThrow("Die Resource-ACL verweist auf ein unzulässiges oder verändertes Ziel.");
    expect(authenticatedFetch).not.toHaveBeenCalled();
  });

  it("rejects an internally inconsistent ACL source before PUT", async () => {
    const inconsistentResource = withAclTarget(
      resourceWithAcl({ publicAccess: true, workerAccess: true }),
      aclUrl,
      `${aclUrl}?different-source`
    );
    solidClientNetworkMocks.getResourceInfoWithAcl.mockResolvedValue(inconsistentResource);
    const authenticatedFetch = vi.fn<typeof fetch>();

    await expect(
      setOwnerOnlyResourceAccess(resourceUrl, ownerWebId, authenticatedFetch)
    ).rejects.toThrow(
      "Die interne Resource-ACL stimmt nicht mit Resource und Link rel=acl überein."
    );
    expect(authenticatedFetch).not.toHaveBeenCalled();
  });

  it.each([
    `https://user:password@pod.example/hannah/solid-tours/runs/run/activity.acl`,
    `${aclUrl}#authorization`,
  ])("rejects credentialed or fragmented ACL target %s", async (unsafeAclUrl) => {
    const unsafeResource = withAclTarget(
      resourceWithAcl({ publicAccess: true, workerAccess: true }),
      unsafeAclUrl
    );
    solidClientNetworkMocks.getResourceInfoWithAcl.mockResolvedValue(unsafeResource);
    const authenticatedFetch = vi.fn<typeof fetch>();

    await expect(
      setOwnerOnlyResourceAccess(resourceUrl, ownerWebId, authenticatedFetch)
    ).rejects.toThrow("Die Resource-ACL-URL ist unzulässig.");
    expect(authenticatedFetch).not.toHaveBeenCalled();
  });

  it("propagates a redirect failure during verification without retrying", async () => {
    const initialResource = resourceWithAcl({ publicAccess: true, workerAccess: true });
    const verifiedResource = resourceWithAcl({ publicAccess: false });
    let resourceReadCount = 0;
    solidClientNetworkMocks.getResourceInfoWithAcl.mockImplementation(
      async (_url, options) => {
        resourceReadCount += 1;
        await options.fetch(resourceUrl, { method: "GET", redirect: "follow" });
        return resourceReadCount === 1 ? initialResource : verifiedResource;
      }
    );
    const authenticatedFetch = vi.fn<typeof fetch>(async (input, init) => {
      if (input.toString() === resourceUrl && resourceReadCount === 2) {
        expect(init?.redirect).toBe("error");
        throw new TypeError("Redirect bei ACL-Verifikation abgelehnt");
      }
      return new Response(null, { status: 200 });
    });

    await expect(
      setOwnerOnlyResourceAccess(resourceUrl, ownerWebId, authenticatedFetch)
    ).rejects.toThrow("Redirect bei ACL-Verifikation abgelehnt");
    expect(solidClientNetworkMocks.getResourceInfoWithAcl).toHaveBeenCalledTimes(2);
  });

  it("propagates a verification 404 without retrying or treating it as absence", async () => {
    const initialResource = resourceWithAcl({ publicAccess: true, workerAccess: true });
    const verification404 = Object.assign(new Error("Verification resource GET 404"), {
      statusCode: 404,
    });
    solidClientNetworkMocks.getResourceInfoWithAcl
      .mockResolvedValueOnce(initialResource)
      .mockRejectedValue(verification404);
    const authenticatedFetch = vi.fn<typeof fetch>(async () =>
      new Response(null, { status: 200 })
    );

    await expect(
      setOwnerOnlyResourceAccess(resourceUrl, ownerWebId, authenticatedFetch)
    ).rejects.toBe(verification404);
    expect(solidClientNetworkMocks.getResourceInfoWithAcl).toHaveBeenCalledTimes(2);
  });

  it("fails closed when every verification read still contains the Worker grant", async () => {
    const dirtyResource = resourceWithAcl({ publicAccess: false, workerAccess: true });
    solidClientNetworkMocks.getResourceInfoWithAcl.mockResolvedValue(dirtyResource);
    const authenticatedFetch = vi.fn<typeof fetch>(async () =>
      new Response(null, { status: 200 })
    );

    await expect(
      setOwnerOnlyResourceAccess(resourceUrl, ownerWebId, authenticatedFetch)
    ).rejects.toThrow("Die Resource-ACL ist nicht ausschließlich für den Owner freigegeben.");

    expect(solidClientNetworkMocks.getResourceInfoWithAcl).toHaveBeenCalledTimes(4);
    expect(
      authenticatedFetch.mock.calls.filter(([, init]) => init?.method === "PUT")
    ).toHaveLength(1);
  });
});
