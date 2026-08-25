import { describe, expect, it } from "vitest";
import {
  DEFAULT_DEMO_WEB_ID,
  hasDemoPodAccess,
  resolveDemoWebId,
  storageModeForIdentity,
  validateDemoWebId,
} from "./demoAccess";

describe("demo Pod access gate", () => {
  it("uses Hannah's configured demo WebID by default", () => {
    expect(DEFAULT_DEMO_WEB_ID).toBe(
      "https://solid-community-server.tmdt.info/sscon/profile/card#me"
    );
    expect(resolveDemoWebId(null, undefined)).toBe(DEFAULT_DEMO_WEB_ID);
  });

  it("grants access only for an exact WebID match", () => {
    expect(hasDemoPodAccess(DEFAULT_DEMO_WEB_ID, DEFAULT_DEMO_WEB_ID)).toBe(true);
    expect(
      hasDemoPodAccess(
        "https://solid-community-server.tmdt.info/another-user/profile/card#me",
        DEFAULT_DEMO_WEB_ID
      )
    ).toBe(false);
    expect(hasDemoPodAccess(`${DEFAULT_DEMO_WEB_ID}/`, DEFAULT_DEMO_WEB_ID)).toBe(false);
    expect(hasDemoPodAccess(null, DEFAULT_DEMO_WEB_ID)).toBe(false);
  });

  it("switches from Hannah's Pod mode back to isolated local mode", () => {
    const otherWebId = "https://pod.example/other/profile/card#me";
    expect(
      [DEFAULT_DEMO_WEB_ID, otherWebId, null].map((webId) =>
        storageModeForIdentity(webId, DEFAULT_DEMO_WEB_ID)
      )
    ).toEqual(["demo-pod", "local", "local"]);
  });

  it("accepts a canonical HTTPS WebID supplied by the host", () => {
    const configured = "https://pod.example/hannah/profile/card#me";
    expect(resolveDemoWebId(configured)).toBe(configured);
    expect(resolveDemoWebId(null, { demoWebId: configured })).toBe(configured);
  });

  it("fails closed for malformed runtime configuration", () => {
    expect(() =>
      resolveDemoWebId(null, { demoWebId: DEFAULT_DEMO_WEB_ID, unexpected: true } as never)
    ).toThrow(/Demo-WebID-Konfiguration/);
    expect(() => resolveDemoWebId(null, "invalid" as never)).toThrow(
      /Demo-WebID-Konfiguration/
    );
  });

  it.each([
    "",
    " https://pod.example/hannah/profile/card#me",
    "http://pod.example/hannah/profile/card#me",
    "https://pod.example/hannah/profile/card",
    "https://pod.example/hannah/profile/card?user=hannah#me",
    "https://user:secret@pod.example/hannah/profile/card#me",
    "not-a-url",
  ])("rejects invalid or ambiguous configuration %j", (configured) => {
    expect(() => validateDemoWebId(configured)).toThrow(/Demo-WebID-Konfiguration/);
  });
});
