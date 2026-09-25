import { beforeEach, describe, expect, it, vi } from "vitest";

const solidClientMocks = vi.hoisted(() => ({
  createContainerAt: vi.fn(),
  createThing: vi.fn(),
  getPublicResourceAccess: vi.fn(),
  getResourceAcl: vi.fn(),
  getSolidDataset: vi.fn(),
  getSolidDatasetWithAcl: vi.fn(),
  getThing: vi.fn(),
  getUrl: vi.fn(),
  hasAccessibleAcl: vi.fn(),
  hasFallbackAcl: vi.fn(),
  hasResourceAcl: vi.fn(),
  removeAll: vi.fn(),
  saveAclFor: vi.fn(),
  saveSolidDatasetAt: vi.fn(),
  setPublicResourceAccess: vi.fn(),
  setThing: vi.fn(),
  setUrl: vi.fn(),
}));

vi.mock("@inrupt/solid-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@inrupt/solid-client")>();
  return { ...actual, ...solidClientMocks };
});

import {
  ensureCityToursInbox,
  getCityToursInboxReadiness,
} from "./accessRequests";

const POD_ROOT = "https://pod.example/alice/";
const WEB_ID = `${POD_ROOT}profile/card#me`;
const PROFILE_URL = `${POD_ROOT}profile/card`;
const INBOX_URL = `${POD_ROOT}inbox/`;

const notFound = () => Object.assign(new Error("not found"), { statusCode: 404 });

describe("City Tours app-specific Inbox setup", () => {
  beforeEach(() => {
    Object.values(solidClientMocks).forEach((mock) => mock.mockReset());
    solidClientMocks.hasResourceAcl.mockReturnValue(true);
    solidClientMocks.hasAccessibleAcl.mockReturnValue(true);
    solidClientMocks.hasFallbackAcl.mockReturnValue(false);
    solidClientMocks.getResourceAcl.mockReturnValue({ kind: "resource-acl" });
    solidClientMocks.setPublicResourceAccess.mockReturnValue({
      kind: "append-only-acl",
    });
    solidClientMocks.getPublicResourceAccess.mockReturnValue({
      read: false,
      append: true,
      write: false,
      control: false,
    });
    solidClientMocks.getSolidDatasetWithAcl.mockResolvedValue({
      kind: "inbox-with-acl",
    });
    solidClientMocks.createContainerAt.mockResolvedValue({ kind: "inbox" });
    solidClientMocks.saveAclFor.mockResolvedValue(undefined);
    solidClientMocks.saveSolidDatasetAt.mockResolvedValue({ kind: "saved-profile" });
    solidClientMocks.createThing.mockReturnValue({ kind: "new-person" });
    solidClientMocks.removeAll.mockReturnValue({ kind: "person-without-inbox" });
    solidClientMocks.setUrl.mockReturnValue({ kind: "person-with-inbox" });
    solidClientMocks.setThing.mockReturnValue({ kind: "updated-profile" });
  });

  it("creates a missing Inbox, grants only public Append and links it in the profile", async () => {
    const profile = { kind: "profile" };
    const existingPerson = { kind: "person" };
    const savedPerson = { kind: "saved-person" };
    solidClientMocks.getSolidDataset
      .mockRejectedValueOnce(notFound())
      .mockResolvedValueOnce(profile)
      .mockResolvedValueOnce(profile);
    solidClientMocks.getThing
      .mockReturnValueOnce(existingPerson)
      .mockReturnValueOnce(savedPerson);
    solidClientMocks.getUrl.mockReturnValueOnce(INBOX_URL);

    await expect(
      ensureCityToursInbox({
        podRoot: POD_ROOT,
        webId: WEB_ID,
        fetcher: vi.fn<typeof fetch>(),
      })
    ).resolves.toBe(INBOX_URL);

    expect(solidClientMocks.createContainerAt).toHaveBeenCalledWith(INBOX_URL, {
      fetch: expect.any(Function),
    });
    expect(solidClientMocks.setPublicResourceAccess).toHaveBeenCalledWith(
      { kind: "resource-acl" },
      { read: false, append: true, write: false, control: false }
    );
    expect(solidClientMocks.saveAclFor).toHaveBeenCalledWith(
      { kind: "inbox-with-acl" },
      { kind: "append-only-acl" },
      { fetch: expect.any(Function) }
    );
    expect(solidClientMocks.removeAll).toHaveBeenCalledWith(
      existingPerson,
      "http://www.w3.org/ns/ldp#inbox"
    );
    expect(solidClientMocks.setUrl).toHaveBeenCalledWith(
      { kind: "person-without-inbox" },
      "http://www.w3.org/ns/ldp#inbox",
      INBOX_URL
    );
    expect(solidClientMocks.saveSolidDatasetAt).toHaveBeenCalledWith(
      PROFILE_URL,
      { kind: "updated-profile" },
      { fetch: expect.any(Function) }
    );
    expect(solidClientMocks.getSolidDatasetWithAcl).toHaveBeenCalledTimes(2);
    expect(solidClientMocks.getPublicResourceAccess).toHaveBeenCalledOnce();
  });

  it("checks Inbox readiness without mutating the Pod", async () => {
    solidClientMocks.getSolidDataset.mockResolvedValue({ kind: "profile" });
    solidClientMocks.getThing.mockReturnValue({ kind: "person" });
    solidClientMocks.getUrl.mockReturnValue(INBOX_URL);

    await expect(
      getCityToursInboxReadiness({
        podRoot: POD_ROOT,
        webId: WEB_ID,
        fetcher: vi.fn<typeof fetch>(),
      })
    ).resolves.toEqual({ configured: true, inboxUrl: INBOX_URL });

    expect(solidClientMocks.createContainerAt).not.toHaveBeenCalled();
    expect(solidClientMocks.saveAclFor).not.toHaveBeenCalled();
    expect(solidClientMocks.saveSolidDatasetAt).not.toHaveBeenCalled();
  });

  it("requires both the exact profile link and an exact public Append-only ACL", async () => {
    solidClientMocks.getSolidDataset.mockResolvedValue({ kind: "profile" });
    solidClientMocks.getThing.mockReturnValue({ kind: "person" });
    solidClientMocks.getUrl.mockReturnValue(`${POD_ROOT}other-inbox/`);

    await expect(
      getCityToursInboxReadiness({
        podRoot: POD_ROOT,
        webId: WEB_ID,
        fetcher: vi.fn<typeof fetch>(),
      })
    ).resolves.toEqual({ configured: false, inboxUrl: INBOX_URL });
    expect(solidClientMocks.getSolidDatasetWithAcl).not.toHaveBeenCalled();

    solidClientMocks.getUrl.mockReturnValue(INBOX_URL);
    solidClientMocks.getPublicResourceAccess.mockReturnValue({
      read: true,
      append: true,
      write: false,
      control: false,
    });
    await expect(
      getCityToursInboxReadiness({
        podRoot: POD_ROOT,
        webId: WEB_ID,
        fetcher: vi.fn<typeof fetch>(),
      })
    ).resolves.toEqual({ configured: false, inboxUrl: INBOX_URL });
  });

  it("fails setup if the saved ACL still exposes any permission besides Append", async () => {
    solidClientMocks.getSolidDataset
      .mockResolvedValueOnce({ kind: "inbox" })
      .mockResolvedValueOnce({ kind: "profile" });
    solidClientMocks.getPublicResourceAccess.mockReturnValue({
      read: true,
      append: true,
      write: false,
      control: false,
    });

    await expect(
      ensureCityToursInbox({
        podRoot: POD_ROOT,
        webId: WEB_ID,
        fetcher: vi.fn<typeof fetch>(),
      })
    ).rejects.toThrow(/Append-only-ACL/);
    expect(solidClientMocks.saveSolidDatasetAt).not.toHaveBeenCalled();
  });
});
