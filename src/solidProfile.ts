import {
  getSolidDataset,
  getStringByLocaleAll,
  getStringEnglish,
  getStringNoLocale,
  getThing,
  getThingAll,
  getUrl,
} from "@inrupt/solid-client";
import type { SolidFetch } from "./embedAuth";

const FOAF_NAME = "http://xmlns.com/foaf/0.1/name";
const FOAF_IMG = "http://xmlns.com/foaf/0.1/img";
const VCARD_FN = "http://www.w3.org/2006/vcard/ns#fn";
const VCARD_HAS_PHOTO = "http://www.w3.org/2006/vcard/ns#hasPhoto";
const VCARD_VALUE = "http://www.w3.org/2006/vcard/ns#value";
const VCARD_URL = "http://www.w3.org/2006/vcard/ns#url";

export type SolidProfileSummary = {
  name: string;
  photoUrl?: string;
};

const profileString = (
  profile: NonNullable<ReturnType<typeof getThing>>,
  predicate: string
): string => {
  const direct =
    getStringNoLocale(profile, predicate) || getStringEnglish(profile, predicate);
  if (direct) return direct;
  for (const localized of getStringByLocaleAll(profile, predicate).values()) {
    if (localized[0]) return localized[0];
  }
  return "";
};

const profilePhotoUrl = (
  profileDataset: Awaited<ReturnType<typeof getSolidDataset>>,
  profile: NonNullable<ReturnType<typeof getThing>>
): string => {
  const reference =
    getUrl(profile, VCARD_HAS_PHOTO) || getUrl(profile, FOAF_IMG) || "";
  if (!reference) return "";

  const photoThing = getThing(profileDataset, reference);
  return photoThing
    ? getUrl(photoThing, VCARD_VALUE) || getUrl(photoThing, VCARD_URL) || reference
    : reference;
};

export async function loadSolidProfileSummary(
  webId: string,
  fetcher: SolidFetch
): Promise<SolidProfileSummary> {
  const fallback: SolidProfileSummary = { name: "Solid User" };
  try {
    const profileDataset = await getSolidDataset(webId.split("#")[0], {
      fetch: fetcher,
    });
    const profile =
      getThing(profileDataset, webId) ||
      getThingAll(profileDataset).find((thing) => thing.url === webId);
    if (!profile) return fallback;

    const name =
      profileString(profile, FOAF_NAME) || profileString(profile, VCARD_FN);
    const photoUrl = profilePhotoUrl(profileDataset, profile);
    return {
      name: name || fallback.name,
      ...(photoUrl ? { photoUrl } : {}),
    };
  } catch {
    return fallback;
  }
}
