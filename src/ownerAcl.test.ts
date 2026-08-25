import {
  addMockResourceAclTo,
  createThing,
  getAgentDefaultAccessAll,
  getAgentResourceAccessAll,
  getGroupResourceAccessAll,
  getPublicResourceAccess,
  getResourceAcl,
  getThingAll,
  getUrlAll,
  mockFileFrom,
  mockContainerFrom,
  setAgentDefaultAccess,
  setAgentResourceAccess,
  setGroupResourceAccess,
  setPublicResourceAccess,
  setThing,
  setUrl,
} from "@inrupt/solid-client";
import { describe, expect, it } from "vitest";
import {
  assertOwnerOnlyAcl,
  assertOwnerPublicReadAcl,
  createOwnerOnlyAcl,
  createOwnerPublicReadAcl,
} from "./ownerAcl";

const resourceUrl = "https://pod.example/laura/solid-tours/runs/run/activity.geojson";
const ownerWebId = "https://pod.example/laura/profile/card#me";
const foreignWebId = "https://pod.example/worker/profile/card#me";
const groupUrl = "https://pod.example/groups#monitoring";
const access = { read: true, append: false, write: false, control: false };
const ACL = "http://www.w3.org/ns/auth/acl#";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

describe("owner-only WebACL", () => {
  it("starts from an empty resource ACL and drops inherited or stale grants", () => {
    const resource = addMockResourceAclTo(mockFileFrom(resourceUrl));
    let dirtyAcl = getResourceAcl(resource);
    dirtyAcl = setAgentResourceAccess(dirtyAcl, foreignWebId, access);
    dirtyAcl = setAgentDefaultAccess(dirtyAcl, foreignWebId, access);
    dirtyAcl = setGroupResourceAccess(dirtyAcl, groupUrl, access);
    dirtyAcl = setPublicResourceAccess(dirtyAcl, access);
    let authenticatedRule = createThing({ url: `${resourceUrl}.acl#authenticated` });
    authenticatedRule = setUrl(authenticatedRule, RDF_TYPE, `${ACL}Authorization`);
    authenticatedRule = setUrl(authenticatedRule, `${ACL}agentClass`, `${ACL}AuthenticatedAgent`);
    authenticatedRule = setUrl(authenticatedRule, `${ACL}accessTo`, resourceUrl);
    authenticatedRule = setUrl(authenticatedRule, `${ACL}mode`, `${ACL}Read`);
    authenticatedRule = setUrl(authenticatedRule, `${ACL}origin`, "https://app.example");
    dirtyAcl = setThing(dirtyAcl, authenticatedRule);
    expect(() => assertOwnerOnlyAcl(dirtyAcl, ownerWebId)).toThrow();

    const ownerOnlyAcl = createOwnerOnlyAcl(resource, ownerWebId);
    expect(getAgentResourceAccessAll(ownerOnlyAcl)).toEqual({
      [ownerWebId]: { read: true, append: true, write: true, control: true },
    });
    expect(getAgentDefaultAccessAll(ownerOnlyAcl)).toEqual({});
    expect(getGroupResourceAccessAll(ownerOnlyAcl)).toEqual({});
    expect(getPublicResourceAccess(ownerOnlyAcl)).toEqual({
      read: false,
      append: false,
      write: false,
      control: false,
    });
    expect(
      getThingAll(ownerOnlyAcl).flatMap((rule) => getUrlAll(rule, `${ACL}agentClass`))
    ).toEqual([]);
    expect(
      getThingAll(ownerOnlyAcl).flatMap((rule) => getUrlAll(rule, `${ACL}origin`))
    ).toEqual([]);
    expect(() => assertOwnerOnlyAcl(ownerOnlyAcl, ownerWebId)).not.toThrow();
  });

  it("rejects authenticated-agent, foreign-default and origin-restricted rules independently", () => {
    const resource = addMockResourceAclTo(mockFileFrom(resourceUrl));
    const ownerOnlyAcl = createOwnerOnlyAcl(resource, ownerWebId);

    let authenticatedRule = createThing({ url: `${resourceUrl}.acl#authenticated-only` });
    authenticatedRule = setUrl(authenticatedRule, RDF_TYPE, `${ACL}Authorization`);
    authenticatedRule = setUrl(authenticatedRule, `${ACL}agentClass`, `${ACL}AuthenticatedAgent`);
    authenticatedRule = setUrl(authenticatedRule, `${ACL}accessTo`, resourceUrl);
    authenticatedRule = setUrl(authenticatedRule, `${ACL}mode`, `${ACL}Read`);
    expect(() =>
      assertOwnerOnlyAcl(setThing(ownerOnlyAcl, authenticatedRule), ownerWebId)
    ).toThrow("Die Resource-ACL enthält eine fremde oder geerbte Freigaberegel.");

    expect(() =>
      assertOwnerOnlyAcl(
        setAgentDefaultAccess(ownerOnlyAcl, foreignWebId, access),
        ownerWebId
      )
    ).toThrow("Die Resource-ACL enthält unerwartete Default-Agent-Rechte.");

    let originRule = createThing({ url: `${resourceUrl}.acl#origin-only` });
    originRule = setUrl(originRule, RDF_TYPE, `${ACL}Authorization`);
    originRule = setUrl(originRule, `${ACL}agent`, ownerWebId);
    originRule = setUrl(originRule, `${ACL}origin`, "https://app.example");
    originRule = setUrl(originRule, `${ACL}accessTo`, resourceUrl);
    originRule = setUrl(originRule, `${ACL}mode`, `${ACL}Read`);
    expect(() => assertOwnerOnlyAcl(setThing(ownerOnlyAcl, originRule), ownerWebId)).toThrow(
      "Die Resource-ACL enthält eine fremde oder geerbte Freigaberegel."
    );
  });

  it("fails closed for an invalid owner WebID", () => {
    const resource = addMockResourceAclTo(mockFileFrom(resourceUrl));
    expect(() => createOwnerOnlyAcl(resource, "not-a-webid")).toThrow(/Owner-WebID/);
  });

  it("sets an owner-only default on the run container before child files are created", () => {
    const container = addMockResourceAclTo(
      mockContainerFrom("https://pod.example/laura/solid-tours/runs/run/")
    );
    const acl = createOwnerOnlyAcl(container, ownerWebId, { includeDefault: true });
    expect(getAgentDefaultAccessAll(acl)).toEqual({
      [ownerWebId]: { read: true, append: true, write: true, control: true },
    });
    expect(() => assertOwnerOnlyAcl(acl, ownerWebId, { includeDefault: true })).not.toThrow();
  });

  it("gives the discovery marker only owner-full and public-read access", () => {
    const resource = addMockResourceAclTo(mockFileFrom(resourceUrl));
    let dirtyAcl = getResourceAcl(resource);
    dirtyAcl = setAgentResourceAccess(dirtyAcl, foreignWebId, access);
    dirtyAcl = setGroupResourceAccess(dirtyAcl, groupUrl, access);

    const markerAcl = createOwnerPublicReadAcl(resource, ownerWebId);
    expect(getAgentResourceAccessAll(markerAcl)).toEqual({
      [ownerWebId]: { read: true, append: true, write: true, control: true },
    });
    expect(getGroupResourceAccessAll(markerAcl)).toEqual({});
    expect(getPublicResourceAccess(markerAcl)).toEqual({
      read: true,
      append: false,
      write: false,
      control: false,
    });
    expect(() => assertOwnerPublicReadAcl(markerAcl, ownerWebId)).not.toThrow();
  });
});
