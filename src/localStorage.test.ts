import { describe, expect, it } from "vitest";
import {
  LOCAL_STATE_KEY,
  loadLocalToursState,
  loadLocalToursStateForIdentity,
  saveLocalToursState,
  saveLocalToursStateForIdentity,
} from "./localStorage";
import type { ToursState } from "./types";

const state: ToursState = {
  schemaVersion: 1,
  drafts: [
    {
      id: "0c8744e7-3bd1-4968-8e57-460ff3b828dc",
      name: "Local walk",
      routeSource: "drawn",
      geometry: [[[7.1, 51.2], [7.2, 51.3]]],
      createdAt: "2026-08-20T12:00:00.000Z",
      updatedAt: "2026-08-20T12:00:00.000Z",
    },
  ],
  activities: [
    {
      id: "49f3344a-e58b-4f6a-a874-84e3815620e6",
      draftId: "0c8744e7-3bd1-4968-8e57-460ff3b828dc",
      name: "Local walk",
      activityType: "walking",
      geometry: [[[7.1, 51.2], [7.2, 51.3]]],
      completedDate: "2026-08-20",
      completedAt: "2026-08-20T13:00:00.000Z",
      activitySummary: {
        distanceMeters: 13_100,
        activeMinutes: 175,
        durationSource: "default-speed",
        derivationModel: "solid-tours-demo-v1",
        averagePaceMinutesPerKm: 13.4,
        estimatedSteps: 17_500,
      },
    },
  ],
  catalogPublications: [],
  activeRun: null,
};

const memoryStorage = (initial?: string) => {
  let value = initial ?? null;
  return {
    getItem: (key: string) => (key === LOCAL_STATE_KEY ? value : null),
    setItem: (key: string, next: string) => {
      if (key === LOCAL_STATE_KEY) value = next;
    },
    removeItem: (key: string) => {
      if (key === LOCAL_STATE_KEY) value = null;
    },
  };
};

describe("browser-local tour state", () => {
  it("returns an empty local history when none exists", () => {
    expect(loadLocalToursState(memoryStorage())).toEqual({
      schemaVersion: 1,
      drafts: [],
      activities: [],
      catalogPublications: [],
      activeRun: null,
    });
  });

  it("round-trips drafts and completed activities without Pod information", () => {
    const storage = memoryStorage();
    saveLocalToursState(state, storage);
    expect(loadLocalToursState(storage)).toEqual(state);
  });

  it("isolates local histories by authenticated WebID", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
    };
    const alice = "https://pod.example/alice/profile/card#me";
    const bob = "https://pod.example/bob/profile/card#me";

    saveLocalToursStateForIdentity(state, alice, storage);

    expect(loadLocalToursStateForIdentity(alice, storage)).toEqual(state);
    expect(loadLocalToursStateForIdentity(bob, storage)).toEqual({
      schemaVersion: 1,
      drafts: [],
      activities: [],
      catalogPublications: [],
      activeRun: null,
    });
  });

  it("moves the legacy unscoped history to the first authenticated account only", () => {
    const values = new Map<string, string>([[LOCAL_STATE_KEY, JSON.stringify(state)]]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
    };
    const alice = "https://pod.example/alice/profile/card#me";
    const bob = "https://pod.example/bob/profile/card#me";

    expect(loadLocalToursStateForIdentity(alice, storage)).toEqual(state);
    expect(values.has(LOCAL_STATE_KEY)).toBe(false);
    expect(loadLocalToursStateForIdentity(bob, storage)).toEqual({
      schemaVersion: 1,
      drafts: [],
      activities: [],
      catalogPublications: [],
      activeRun: null,
    });
  });

  it("rejects malformed state and any published scenario run", () => {
    expect(() => loadLocalToursState(memoryStorage("not json"))).toThrow(/beschädigt/);
    expect(() =>
      saveLocalToursState(
        { ...state, activeRun: {} as ToursState["activeRun"] },
        memoryStorage()
      )
    ).toThrow(/gespeicherte City-Tours-Status/);
  });
});
