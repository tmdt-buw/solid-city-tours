import { describe, expect, it } from "vitest";
import {
  completeOnboardingRecord,
  onboardingCompleteFor,
  parseSolidToursOnboardingRecord,
} from "./appOnboarding";

const APP_ACCEPTED_AT = "2026-08-28T08:00:00.000Z";
const STANDALONE_ACCEPTED_AT = "2026-08-28T08:05:00.000Z";
const REGISTRY_URL = "https://registry.example/research";

describe("Solid Tours app onboarding record", () => {
  it("records app-specific public setup consent for the embedded context", () => {
    const record = completeOnboardingRecord(
      null,
      "embedded",
      REGISTRY_URL,
      APP_ACCEPTED_AT
    );

    expect(record).toEqual({
      schemaVersion: 2,
      app: "solid-tours",
      appSpecificAcceptedAt: APP_ACCEPTED_AT,
      publicPublishingAcceptedAt: APP_ACCEPTED_AT,
      publicRegistryUrl: REGISTRY_URL,
    });
    expect(onboardingCompleteFor(record, "embedded")).toBe(true);
    expect(onboardingCompleteFor(record, "standalone")).toBe(false);
  });

  it("records the standalone acknowledgement without replacing prior consent", () => {
    const embedded = completeOnboardingRecord(
      null,
      "embedded",
      REGISTRY_URL,
      APP_ACCEPTED_AT
    );
    const standalone = completeOnboardingRecord(
      embedded,
      "standalone",
      REGISTRY_URL,
      STANDALONE_ACCEPTED_AT
    );

    expect(standalone).toEqual({
      schemaVersion: 2,
      app: "solid-tours",
      appSpecificAcceptedAt: APP_ACCEPTED_AT,
      publicPublishingAcceptedAt: APP_ACCEPTED_AT,
      publicRegistryUrl: REGISTRY_URL,
      standaloneAcceptedAt: STANDALONE_ACCEPTED_AT,
    });
    expect(onboardingCompleteFor(standalone, "embedded")).toBe(true);
    expect(onboardingCompleteFor(standalone, "standalone")).toBe(true);
  });

  it("completes both layers when standalone onboarding is accepted first", () => {
    const record = completeOnboardingRecord(
      null,
      "standalone",
      REGISTRY_URL,
      STANDALONE_ACCEPTED_AT
    );

    expect(record.appSpecificAcceptedAt).toBe(STANDALONE_ACCEPTED_AT);
    expect(record.publicPublishingAcceptedAt).toBe(STANDALONE_ACCEPTED_AT);
    expect(record.standaloneAcceptedAt).toBe(STANDALONE_ACCEPTED_AT);
    expect(onboardingCompleteFor(record, "standalone")).toBe(true);
  });

  it("requires the exact schema, canonical timestamps and canonical registry URL", () => {
    const valid = {
      schemaVersion: 2,
      app: "solid-tours",
      appSpecificAcceptedAt: APP_ACCEPTED_AT,
      publicPublishingAcceptedAt: APP_ACCEPTED_AT,
      publicRegistryUrl: REGISTRY_URL,
      standaloneAcceptedAt: STANDALONE_ACCEPTED_AT,
    };
    expect(parseSolidToursOnboardingRecord(valid)).toEqual(valid);
    expect(parseSolidToursOnboardingRecord({ ...valid, app: "other-app" })).toBeNull();
    expect(parseSolidToursOnboardingRecord({ ...valid, schemaVersion: 3 })).toBeNull();
    expect(
      parseSolidToursOnboardingRecord({ ...valid, appSpecificAcceptedAt: "2026-08-28" })
    ).toBeNull();
    expect(
      parseSolidToursOnboardingRecord({ ...valid, publicRegistryUrl: `${REGISTRY_URL}/` })
    ).toBeNull();
    expect(parseSolidToursOnboardingRecord({ ...valid, unexpected: true })).toBeNull();
  });

  it("does not consider missing, legacy or malformed records complete", () => {
    expect(onboardingCompleteFor(null, "embedded")).toBe(false);
    expect(onboardingCompleteFor(null, "standalone")).toBe(false);
    expect(
      parseSolidToursOnboardingRecord({
        schemaVersion: 1,
        app: "solid-tours",
        appSpecificAcceptedAt: APP_ACCEPTED_AT,
      })
    ).toBeNull();
    expect(
      onboardingCompleteFor(
        parseSolidToursOnboardingRecord({
          schemaVersion: 2,
          app: "solid-tours",
          appSpecificAcceptedAt: "not-a-date",
          publicPublishingAcceptedAt: APP_ACCEPTED_AT,
          publicRegistryUrl: REGISTRY_URL,
        }),
        "embedded"
      )
    ).toBe(false);
  });

  it("turns an unsupported future record into an unaccepted but repairable state", () => {
    const unsupported = parseSolidToursOnboardingRecord({
      schemaVersion: 3,
      app: "solid-tours",
      appSpecificAcceptedAt: APP_ACCEPTED_AT,
      publicPublishingAcceptedAt: APP_ACCEPTED_AT,
      publicRegistryUrl: REGISTRY_URL,
      newConsentModel: "unknown-to-this-client",
    });

    expect(unsupported).toBeNull();
    expect(onboardingCompleteFor(unsupported, "embedded")).toBe(false);

    const repaired = completeOnboardingRecord(
      unsupported,
      "embedded",
      REGISTRY_URL,
      STANDALONE_ACCEPTED_AT
    );
    expect(parseSolidToursOnboardingRecord(repaired)).toEqual(repaired);
    expect(onboardingCompleteFor(repaired, "embedded")).toBe(true);
  });

  it("records renewed public consent when the selected registry changes", () => {
    const original = completeOnboardingRecord(
      null,
      "embedded",
      REGISTRY_URL,
      APP_ACCEPTED_AT
    );
    const changed = completeOnboardingRecord(
      original,
      "embedded",
      "https://registry.example/other",
      STANDALONE_ACCEPTED_AT
    );

    expect(changed.appSpecificAcceptedAt).toBe(APP_ACCEPTED_AT);
    expect(changed.publicPublishingAcceptedAt).toBe(STANDALONE_ACCEPTED_AT);
    expect(changed.publicRegistryUrl).toBe("https://registry.example/other");
  });

  it("rejects unsafe registry URLs before creating a record", () => {
    expect(() =>
      completeOnboardingRecord(
        null,
        "embedded",
        "https://user:secret@registry.example/research",
        APP_ACCEPTED_AT
      )
    ).toThrow(/Research-Registry/);
  });
});
