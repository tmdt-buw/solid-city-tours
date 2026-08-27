import { beforeEach, describe, expect, it, vi } from "vitest";

const catalogApiMocks = vi.hoisted(() => ({
  publishRestrictedDataset: vi.fn(),
  removeDataset: vi.fn(),
}));

vi.mock("@hoelk-f/semantic-data-catalog/catalog-api", () => ({
  publishRestrictedDataset: catalogApiMocks.publishRestrictedDataset,
  removeDataset: catalogApiMocks.removeDataset,
}));

const solidClientMocks = vi.hoisted(() => ({
  getSolidDataset: vi.fn(),
}));

vi.mock("@inrupt/solid-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@inrupt/solid-client")>();
  return { ...actual, getSolidDataset: solidClientMocks.getSolidDataset };
});

import {
  catalogPublicationReference,
  publishCatalogEntry,
  removeCatalogEntry,
} from "./catalog";
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

describe("Solid Tours catalog publication", () => {
  beforeEach(() => {
    catalogApiMocks.publishRestrictedDataset.mockReset();
    catalogApiMocks.removeDataset.mockReset();
    solidClientMocks.getSolidDataset.mockReset();
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

  it("omits the contact point when the profile has no valid email", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const otherWebId = "https://pod.example/alex/profile/card#me";
    solidClientMocks.getSolidDataset.mockRejectedValue(new Error("profile unavailable"));

    await publishCatalogEntry({
      webId: otherWebId,
      scenarioRunId: "run-2",
      resourceUrl: "https://pod.example/alex/solid-tours/runs/run-2/activity.geojson",
      fetcher,
    });

    expect(catalogApiMocks.publishRestrictedDataset).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        contactPoint: undefined,
        publisherWebId: otherWebId,
        creatorWebId: otherWebId,
      })
    );
    const publicationInput = catalogApiMocks.publishRestrictedDataset.mock.calls[0]?.[1];
    expect(publicationInput).not.toHaveProperty("contactPointWebId");
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

    await expect(
      publishCatalogEntry({
        podRoot: "https://storage.example/alex/",
        webId: "https://identity.example/alex#me",
        scenarioRunId: "run-3",
        resourceUrl:
          "https://storage.example/alex/solid-tours/runs/run-3/activity.geojson",
        fetcher: vi.fn<typeof fetch>(),
      })
    ).rejects.toThrow(/öffentliche Dataspace-Registry/);
  });
});
