import {
  createSolidDataset,
  createThing,
  setStringNoLocale,
  setThing,
  setUrl,
} from "@inrupt/solid-client";
import { describe, expect, it, vi } from "vitest";

const solidClientMocks = vi.hoisted(() => ({
  getSolidDataset: vi.fn(),
}));

vi.mock("@inrupt/solid-client", async () => {
  const actual = await vi.importActual<typeof import("@inrupt/solid-client")>(
    "@inrupt/solid-client"
  );
  return { ...actual, getSolidDataset: solidClientMocks.getSolidDataset };
});

import { loadSolidProfileSummary } from "./solidProfile";

const WEB_ID = "https://pod.example/hannah/profile/card#me";
const FOAF_NAME = "http://xmlns.com/foaf/0.1/name";
const VCARD_HAS_PHOTO = "http://www.w3.org/2006/vcard/ns#hasPhoto";
const VCARD_VALUE = "http://www.w3.org/2006/vcard/ns#value";

describe("loadSolidProfileSummary", () => {
  it("reads the profile name and a linked profile photo", async () => {
    const photoThingUrl = "https://pod.example/hannah/profile/card#photo";
    let dataset = createSolidDataset();
    let person = createThing({ url: WEB_ID });
    person = setStringNoLocale(person, FOAF_NAME, "Hannah Müller");
    person = setUrl(person, VCARD_HAS_PHOTO, photoThingUrl);
    dataset = setThing(dataset, person);
    let photo = createThing({ url: photoThingUrl });
    photo = setUrl(photo, VCARD_VALUE, "https://pod.example/hannah/photo.jpg");
    dataset = setThing(dataset, photo);
    solidClientMocks.getSolidDataset.mockResolvedValue(dataset);

    await expect(loadSolidProfileSummary(WEB_ID, vi.fn())).resolves.toEqual({
      name: "Hannah Müller",
      photoUrl: "https://pod.example/hannah/photo.jpg",
    });
  });

  it("falls back safely when the profile cannot be read", async () => {
    solidClientMocks.getSolidDataset.mockRejectedValue(new Error("unavailable"));
    await expect(loadSolidProfileSummary(WEB_ID, vi.fn())).resolves.toEqual({
      name: "Solid User",
    });
  });
});
