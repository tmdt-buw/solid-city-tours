import { validateLocalToursState } from "./stateValidation";
import type { ToursState } from "./types";

// Persisted key retained across the City Tours rename.
export const LOCAL_STATE_KEY = "solid-tours:local-state:v1";

export const localStateKeyForIdentity = (webId: string | null | undefined): string =>
  webId ? `${LOCAL_STATE_KEY}:webid:${encodeURIComponent(webId)}` : `${LOCAL_STATE_KEY}:guest`;

export type LocalStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const emptyState = (): ToursState => ({
  schemaVersion: 1,
  drafts: [],
  activities: [],
  catalogPublications: [],
  activeRun: null,
});

const browserStorage = (): LocalStorageLike | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export function loadLocalToursState(
  storage: LocalStorageLike | null = browserStorage(),
  key = LOCAL_STATE_KEY
): ToursState {
  if (!storage) return emptyState();
  const serialized = storage.getItem(key);
  if (serialized === null) return emptyState();

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error("Der gespeicherte City-Tours-Verlauf ist beschädigt.");
  }
  return validateLocalToursState(parsed);
}

export function saveLocalToursState(
  state: ToursState,
  storage: LocalStorageLike | null = browserStorage(),
  key = LOCAL_STATE_KEY
): void {
  if (!storage) throw new Error("Der Browserspeicher ist nicht verfügbar.");
  const validated = validateLocalToursState(state);
  storage.setItem(key, JSON.stringify(validated));
}

export function loadLocalToursStateForIdentity(
  webId: string | null | undefined,
  storage: LocalStorageLike | null = browserStorage()
): ToursState {
  if (!storage) return emptyState();
  const identityKey = localStateKeyForIdentity(webId);
  if (storage.getItem(identityKey) !== null) {
    return loadLocalToursState(storage, identityKey);
  }

  // City Tours originally used one unscoped browser key. The first
  // authenticated account claims that history once; deleting the old key
  // keeps every account that signs in afterwards isolated.
  if (webId && storage.getItem(LOCAL_STATE_KEY) !== null) {
    const legacyState = loadLocalToursState(storage, LOCAL_STATE_KEY);
    saveLocalToursState(legacyState, storage, identityKey);
    storage.removeItem(LOCAL_STATE_KEY);
    return legacyState;
  }
  return emptyState();
}

export function saveLocalToursStateForIdentity(
  state: ToursState,
  webId: string | null | undefined,
  storage: LocalStorageLike | null = browserStorage()
): void {
  saveLocalToursState(state, storage, localStateKeyForIdentity(webId));
}
