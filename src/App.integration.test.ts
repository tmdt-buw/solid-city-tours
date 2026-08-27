import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const leafletMocks = vi.hoisted(() => {
  const map = {
    fitBounds: vi.fn(),
    invalidateSize: vi.fn(),
    off: vi.fn(),
    on: vi.fn(),
    remove: vi.fn(),
    setView: vi.fn(),
  };
  map.setView.mockReturnValue(map);

  const overlay = {
    addTo: vi.fn(),
    clearLayers: vi.fn(),
  };
  overlay.addTo.mockReturnValue(overlay);

  const tileLayer = { addTo: vi.fn() };
  tileLayer.addTo.mockReturnValue(tileLayer);
  const routeLayer = { addTo: vi.fn() };
  routeLayer.addTo.mockReturnValue(routeLayer);
  const zoomControl = { addTo: vi.fn(), remove: vi.fn() };
  zoomControl.addTo.mockReturnValue(zoomControl);

  return {
    map,
    overlay,
    tileLayer,
    routeLayer,
    zoomControl,
    zoomControlFactory: vi.fn(() => zoomControl),
    mapFactory: vi.fn(() => map),
  };
});

vi.mock("leaflet", () => ({
  default: {
    circleMarker: vi.fn(() => leafletMocks.routeLayer),
    control: { zoom: leafletMocks.zoomControlFactory },
    latLngBounds: vi.fn((points) => points),
    layerGroup: vi.fn(() => leafletMocks.overlay),
    map: leafletMocks.mapFactory,
    polyline: vi.fn(() => leafletMocks.routeLayer),
    tileLayer: vi.fn(() => leafletMocks.tileLayer),
  },
}));

const sessionMocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  restoreSession: vi.fn(async () => undefined),
  session: {
    info: { webId: null as string | null },
  },
}));

vi.mock("./solidSession", () => ({
  getSession: () => ({
    ...sessionMocks.session,
    fetch: sessionMocks.fetch,
    login: sessionMocks.login,
    logout: sessionMocks.logout,
  }),
  restoreSession: sessionMocks.restoreSession,
}));

const podNetworkMocks = vi.hoisted(() => ({
  activityMasterExists: vi.fn(),
  resolvePodRoot: vi.fn(),
  ensureStorage: vi.fn(),
  ensureActivityMaster: vi.fn(),
  loadState: vi.fn(),
  loadActivityMasterSnapshot: vi.fn(),
  loadDraftMasterSnapshot: vi.fn(),
  loadStateSnapshot: vi.fn(),
  clearPublishedMarker: vi.fn(),
  deleteActivity: vi.fn(),
  deleteDraft: vi.fn(),
  safeDelete: vi.fn(),
  safeDeleteContainer: vi.fn(),
  setOwnerOnlyIfPresent: vi.fn(),
  saveActivity: vi.fn(),
  saveActivityConditionally: vi.fn(),
  saveDraftConditionally: vi.fn(),
  saveInterestsIfMissing: vi.fn(),
  saveRunSnapshot: vi.fn(),
  saveState: vi.fn(),
  saveStateIfUnchanged: vi.fn(),
  writePublishedMarker: vi.fn(),
}));

vi.mock("./solidStorage", async () => {
  const actual = await vi.importActual<typeof import("./solidStorage")>("./solidStorage");
  return {
    ...actual,
    activityMasterExists: podNetworkMocks.activityMasterExists,
    resolvePodRoot: podNetworkMocks.resolvePodRoot,
    ensureStorage: podNetworkMocks.ensureStorage,
    ensureActivityMaster: podNetworkMocks.ensureActivityMaster,
    loadState: podNetworkMocks.loadState,
    loadActivityMasterSnapshot: podNetworkMocks.loadActivityMasterSnapshot,
    loadDraftMasterSnapshot: podNetworkMocks.loadDraftMasterSnapshot,
    loadStateSnapshot: podNetworkMocks.loadStateSnapshot,
    clearPublishedMarker: podNetworkMocks.clearPublishedMarker,
    deleteActivity: podNetworkMocks.deleteActivity,
    deleteDraft: podNetworkMocks.deleteDraft,
    safeDelete: podNetworkMocks.safeDelete,
    safeDeleteContainer: podNetworkMocks.safeDeleteContainer,
    setOwnerOnlyIfPresent: podNetworkMocks.setOwnerOnlyIfPresent,
    saveActivity: podNetworkMocks.saveActivity,
    saveActivityConditionally: podNetworkMocks.saveActivityConditionally,
    saveDraftConditionally: podNetworkMocks.saveDraftConditionally,
    saveInterestsIfMissing: podNetworkMocks.saveInterestsIfMissing,
    saveRunSnapshot: podNetworkMocks.saveRunSnapshot,
    saveState: podNetworkMocks.saveState,
    saveStateIfUnchanged: podNetworkMocks.saveStateIfUnchanged,
    writePublishedMarker: podNetworkMocks.writePublishedMarker,
  };
});

const catalogMocks = vi.hoisted(() => ({
  catalogPublicationReference: vi.fn((podRoot: string, scenarioRunId: string) => {
    const normalizedPodRoot = podRoot.endsWith("/") ? podRoot : `${podRoot}/`;
    const datasetIdentifier = `solid-tours-activity-${scenarioRunId}`;
    return {
      datasetIdentifier,
      catalogDatasetUrl: `${normalizedPodRoot}catalog/ds/${datasetIdentifier}.ttl#it`,
    };
  }),
  publishCatalogEntry: vi.fn(),
  removeCatalogEntry: vi.fn(),
}));

const accessRequestMocks = vi.hoisted(() => ({
  revokeAndArchiveScenarioAccess: vi.fn(),
}));

vi.mock("./accessRequests", () => accessRequestMocks);

vi.mock("./catalog", () => catalogMocks);

import App from "./App";
import RawSolidToursEmbed, {
  type SolidToursEmbedProps,
} from "./embed/SolidToursEmbed";
import { localStateKeyForIdentity } from "./localStorage";
import { StateConflictError } from "./solidStorage";
import type { SolidToursSession } from "./embedAuth";
import type { ActiveRun } from "./types";
import { TOURS_LANGUAGE_EVENT, TOURS_LANGUAGE_STORAGE_KEY } from "./i18n";

// The pre-existing integration suite asserts the German product copy. Keep
// those behavioral tests explicit while dedicated language-contract tests
// below exercise the new English default and controlled embed switching.
const SolidToursEmbed = (props: SolidToursEmbedProps) =>
  createElement(RawSolidToursEmbed, { language: "de", ...props });

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const NON_HANNAH_WEB_ID = "https://pods.example/alex/profile/card#me";
const HANNAH_WEB_ID =
  "https://solid-community-server.tmdt.info/sscon/profile/card#me";

const localStateWithActivity = {
  schemaVersion: 1,
  drafts: [
    {
      id: "0c8744e7-3bd1-4968-8e57-460ff3b828dc",
      name: "Wuppertaler Runde",
      activityType: "walking",
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
      name: "Wuppertaler Runde",
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
  activeRun: null,
};

const podStateWithTwoActivities = {
  ...localStateWithActivity,
  activities: [
    ...localStateWithActivity.activities,
    {
      ...localStateWithActivity.activities[0],
      id: "8db47d3b-8a4f-4a74-b086-77c1c7630bf7",
      name: "Nordbahntrasse",
      activityType: "cycling" as const,
      completedDate: "2026-08-21",
      completedAt: "2026-08-21T13:00:00.000Z",
      activitySummary: {
        distanceMeters: 13_100,
        activeMinutes: 55,
        durationSource: "default-speed" as const,
        derivationModel: "solid-tours-demo-v1" as const,
        averageSpeedKmh: 14.3,
      },
    },
  ],
};

async function waitForDom(assertion: () => void): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
  }
  throw lastError;
}

async function confirmDeleteDialog(container: HTMLElement): Promise<void> {
  await waitForDom(() => {
    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="delete-confirmation-submit"]'
    );
    expect(button).not.toBeNull();
    expect(button?.disabled).toBe(false);
  });
  await act(async () => {
    container
      .querySelector<HTMLButtonElement>('[data-testid="delete-confirmation-submit"]')!
      .click();
  });
}

describe("Solid Tours app shells", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    delete window.__SOLID_TOURS_CONFIG__;
    sessionMocks.session.info.webId = null;
    sessionMocks.fetch.mockReset();
    sessionMocks.login.mockReset();
    sessionMocks.logout.mockReset();
    sessionMocks.restoreSession.mockClear();
    podNetworkMocks.resolvePodRoot.mockReset();
    podNetworkMocks.ensureStorage.mockReset();
    podNetworkMocks.ensureActivityMaster.mockReset();
    podNetworkMocks.loadState.mockReset();
    podNetworkMocks.loadActivityMasterSnapshot.mockReset();
    podNetworkMocks.loadDraftMasterSnapshot.mockReset();
    podNetworkMocks.loadStateSnapshot.mockReset();
    podNetworkMocks.activityMasterExists.mockReset();
    podNetworkMocks.clearPublishedMarker.mockReset();
    podNetworkMocks.deleteActivity.mockReset();
    podNetworkMocks.deleteDraft.mockReset();
    podNetworkMocks.safeDelete.mockReset();
    podNetworkMocks.safeDeleteContainer.mockReset();
    podNetworkMocks.setOwnerOnlyIfPresent.mockReset();
    podNetworkMocks.saveActivity.mockReset();
    podNetworkMocks.saveActivityConditionally.mockReset();
    podNetworkMocks.saveDraftConditionally.mockReset();
    podNetworkMocks.saveInterestsIfMissing.mockReset();
    podNetworkMocks.saveRunSnapshot.mockReset();
    podNetworkMocks.saveState.mockReset();
    podNetworkMocks.saveStateIfUnchanged.mockReset();
    podNetworkMocks.writePublishedMarker.mockReset();
    podNetworkMocks.resolvePodRoot.mockResolvedValue("https://pods.example/alex/");
    podNetworkMocks.ensureStorage.mockResolvedValue(undefined);
    podNetworkMocks.loadState.mockResolvedValue({
      schemaVersion: 1,
      drafts: [],
      activities: [],
      activeRun: null,
    });
    podNetworkMocks.loadDraftMasterSnapshot.mockResolvedValue({ etag: '"draft-v1"' });
    podNetworkMocks.saveDraftConditionally.mockResolvedValue({ etag: '"draft-v2"' });
    podNetworkMocks.saveActivityConditionally.mockResolvedValue({ etag: '"activity-new"' });
    podNetworkMocks.deleteDraft.mockResolvedValue(undefined);
    podNetworkMocks.saveInterestsIfMissing.mockResolvedValue(undefined);
    catalogMocks.publishCatalogEntry.mockReset();
    catalogMocks.removeCatalogEntry.mockReset();
    accessRequestMocks.revokeAndArchiveScenarioAccess.mockReset();
    accessRequestMocks.revokeAndArchiveScenarioAccess.mockResolvedValue(0);
    leafletMocks.mapFactory.mockClear();
    leafletMocks.zoomControlFactory.mockClear();
    leafletMocks.zoomControl.remove.mockClear();
    leafletMocks.map.on.mockClear();
    leafletMocks.map.remove.mockClear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows the same plain loading treatment as embedded external apps while a Pod state is resolving", async () => {
    podNetworkMocks.resolvePodRoot.mockReturnValue(new Promise<string>(() => undefined));

    act(() =>
      root.render(
        createElement(SolidToursEmbed, {
          webId: HANNAH_WEB_ID,
          demoWebId: HANNAH_WEB_ID,
          session: {
            info: { isLoggedIn: true, webId: HANNAH_WEB_ID },
            fetch: sessionMocks.fetch,
          },
        })
      )
    );

    await waitForDom(() => {
      expect(container.querySelector(".tours-loading")).not.toBeNull();
    });

    const status = container.querySelector<HTMLElement>(".tours-loading");
    expect(status?.textContent).toBe("Wird geladen …");
    expect(status?.tagName).toBe("P");
    expect(container.querySelector(".tours-loading-spinner")).toBeNull();
    expect(container.querySelector(".language-toggle")).toBeNull();
    expect(status?.textContent).not.toContain("Solid Tours");
    expect(container.querySelector(".loading-route")).toBeNull();
    expect(container.querySelector(".route-workspace")).toBeNull();
  });

  it("shows only the login shell when the standalone app has no session", async () => {
    act(() => root.render(createElement(App)));

    await waitForDom(() => {
      expect(container.querySelector(".solid-tours-login")).not.toBeNull();
    });

    expect(container.querySelector(".route-workspace")).toBeNull();
    expect(container.querySelector(".app-header")).toBeNull();
    expect(container.querySelector(".app-footer")).toBeNull();
    expect(leafletMocks.mapFactory).not.toHaveBeenCalled();
    expect(sessionMocks.restoreSession).toHaveBeenCalledOnce();
    expect(sessionMocks.fetch).not.toHaveBeenCalled();
    expect(podNetworkMocks.resolvePodRoot).not.toHaveBeenCalled();
  });

  it("starts the standalone login in English and persists its language switch", async () => {
    act(() => root.render(createElement(App)));

    await waitForDom(() => {
      expect(container.querySelector(".solid-tours-login")).not.toBeNull();
    });

    expect(container.textContent).toContain("Suggested providers");
    expect(container.querySelector(".solid-tours-app")?.getAttribute("lang")).toBe("en");
    const languageSelect = container.querySelector<HTMLSelectElement>(
      ".language-toggle__select"
    )!;
    act(() => {
      languageSelect.value = "de";
      languageSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(container.textContent).toContain("Vorgeschlagene Anbieter");
    expect(container.querySelector(".solid-tours-app")?.getAttribute("lang")).toBe("de");
    expect(window.localStorage.getItem(TOURS_LANGUAGE_STORAGE_KEY)).toBe("de");

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: TOURS_LANGUAGE_STORAGE_KEY,
          newValue: "en",
        })
      );
    });
    expect(container.textContent).toContain("Suggested providers");
  });

  it("uses Pod storage and shows the standalone shell for an arbitrary Solid login", async () => {
    act(() => root.render(createElement(App, { webIdOverride: NON_HANNAH_WEB_ID })));

    await waitForDom(() => {
      expect(container.querySelector(".route-workspace")).not.toBeNull();
    });

    expect(container.querySelector(".solid-tours-login")).toBeNull();
    expect(container.querySelector(".app-header")).not.toBeNull();
    expect(container.querySelector(".app-footer")).not.toBeNull();
    expect(container.querySelector(".scenario-card")).toBeNull();
    expect(container.querySelector(".publish")).toBeNull();
    expect(container.querySelector(".header-reset")).toBeNull();
    expect(sessionMocks.restoreSession).toHaveBeenCalledOnce();
    expect(podNetworkMocks.resolvePodRoot).toHaveBeenCalledWith(
      NON_HANNAH_WEB_ID,
      expect.any(Function)
    );
    expect(podNetworkMocks.ensureStorage).toHaveBeenCalled();
    expect(leafletMocks.mapFactory).toHaveBeenCalledOnce();
  });

  it("places the scrollable planner beside the map inside the shared workspace", async () => {
    act(() => root.render(createElement(App, { webIdOverride: NON_HANNAH_WEB_ID })));

    await waitForDom(() => {
      expect(container.querySelector(".route-workspace")).not.toBeNull();
    });

    const workspace = container.querySelector<HTMLElement>(".route-workspace")!;
    const planner = workspace.querySelector<HTMLElement>(":scope > .planner-panel");
    const mapStage = workspace.querySelector<HTMLElement>(":scope > .map-stage");

    expect(workspace.children).toHaveLength(2);
    expect(mapStage?.classList.contains("map-stage")).toBe(true);
    expect(mapStage?.querySelector(":scope > .tour-map")).not.toBeNull();
    expect(planner?.parentElement).toBe(workspace);
    expect(mapStage?.previousElementSibling).toBe(planner);
    expect(planner?.querySelector(":scope > .planner-scroll")).not.toBeNull();
    expect(planner?.textContent).toContain("Tour planner");
    expect(mapStage?.querySelector(":scope > .map-stats")).not.toBeNull();
    expect(mapStage?.querySelector(":scope > .map-legend")).not.toBeNull();
  });

  it("shows the language switch in the authenticated standalone header", async () => {
    act(() => root.render(createElement(App, { webIdOverride: NON_HANNAH_WEB_ID })));

    await waitForDom(() => {
      expect(container.querySelector(".route-workspace")).not.toBeNull();
    });

    expect(container.textContent).toContain("Tour planner");
    expect(container.querySelector(".app-header .language-toggle")).not.toBeNull();
    expect(container.querySelector(".solid-tours-login .language-toggle")).toBeNull();
    const actions = container.querySelector(".app-header .header-actions")!;
    expect(actions.children[0]?.classList.contains("header-user")).toBe(true);
    expect(actions.children[1]?.classList.contains("language-toggle")).toBe(true);
    expect(actions.children[2]?.classList.contains("header-logout")).toBe(true);
    expect(actions.textContent).toContain(NON_HANNAH_WEB_ID);
    expect(container.querySelector(".app-footer .footer-version")?.textContent).toContain(
      "Solid Tours"
    );
  });

  it("clears the redirect watchdog when a host login resolves", async () => {
    const originalParent = window.parent;
    const bridgeLogin = vi.fn(async () => undefined);
    const parentWindow = {
      location: { origin: window.location.origin },
      __SOLID_DATASPACE_AUTH__: {
        isReady: true,
        getState: () => ({ isLoggedIn: false, webId: null }),
        getFetch: () => window.fetch.bind(window),
        login: bridgeLogin,
      },
    };
    Object.defineProperty(window, "parent", {
      configurable: true,
      value: parentWindow,
    });

    try {
      act(() => root.render(createElement(App)));
      await waitForDom(() => {
        expect(container.querySelector(".solid-tours-login")).not.toBeNull();
      });

      vi.useFakeTimers();
      await act(async () => {
        container.querySelector<HTMLButtonElement>(".solid-tours-login__submit")!.click();
        await Promise.resolve();
      });

      expect(bridgeLogin).toHaveBeenCalledWith("https://solid-community-server.tmdt.info");
      expect(container.querySelector<HTMLButtonElement>(".solid-tours-login__submit")?.disabled).toBe(
        false
      );

      act(() => vi.advanceTimersByTime(20_000));
      expect(container.querySelector(".solid-tours-login__error")).toBeNull();
    } finally {
      vi.useRealTimers();
      Object.defineProperty(window, "parent", {
        configurable: true,
        value: originalParent,
      });
    }
  });

  it("renders an arbitrary authenticated embed from its Pod without standalone chrome", async () => {
    podNetworkMocks.loadState.mockResolvedValue(localStateWithActivity);

    act(() =>
      root.render(
        createElement(SolidToursEmbed, {
          webId: NON_HANNAH_WEB_ID,
          demoWebId: HANNAH_WEB_ID,
        })
      )
    );

    await waitForDom(() => {
      expect(container.querySelector(".route-workspace")).not.toBeNull();
      expect(container.textContent).toContain("Wuppertaler Runde");
    });

    expect(container.querySelector(".solid-tours-app--embedded")).not.toBeNull();
    expect(container.querySelector(".solid-tours-login")).toBeNull();
    expect(container.querySelector(".app-header")).toBeNull();
    expect(container.querySelector(".app-footer")).toBeNull();
    expect(container.querySelector(".scenario-card")).toBeNull();
    expect(container.querySelector(".publish")).not.toBeNull();
    expect(container.querySelector(".header-reset")).toBeNull();
    expect(container.querySelector(".sample-routes")).toBeNull();
    expect(container.querySelector(".map-hint")).toBeNull();
    expect(container.textContent).not.toContain("Beispielrouten zum Importieren");
    expect(container.textContent).not.toContain("Route zeichnen");
    expect(container.textContent).toContain("Gesundheitsdatenspende freigeben");
    expect(container.textContent).not.toContain("Szenario zurücksetzen");
    expect(container.textContent).not.toContain("Lokal");
    expect(container.textContent).not.toContain("Route & Aktivität");
    expect(container.textContent).not.toContain("Tourenübersicht");
    expect(container.textContent).not.toContain("Quelle");
    expect(container.textContent).not.toContain("Straßenrouting");
    expect(container.textContent).not.toContain("OSRM");
    expect(container.textContent).not.toContain("Aktivitätswerte werden aus der Route berechnet");
    expect(container.textContent).not.toContain("aus der geplanten Route berechnet");
    expect(container.querySelector(".panel-section--planner select")).toBeNull();
    expect(container.querySelector(".planner-route")).toBeNull();
    expect(sessionMocks.restoreSession).not.toHaveBeenCalled();
    expect(sessionMocks.fetch).not.toHaveBeenCalled();
    expect(podNetworkMocks.resolvePodRoot).toHaveBeenCalledWith(
      NON_HANNAH_WEB_ID,
      expect.any(Function)
    );
    expect(leafletMocks.mapFactory).toHaveBeenCalledOnce();

    const completeButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "Tour gemacht"
    );
    expect(completeButton).toBeDefined();
    const myToursCard = Array.from(container.querySelectorAll<HTMLElement>(".list-card")).find(
      (card) => card.querySelector("h2")?.textContent === "Meine Touren"
    );
    expect(myToursCard).toBeDefined();
    const tourCompletion = myToursCard!.querySelector(".tour-completion");
    expect(myToursCard!.lastElementChild).toBe(tourCompletion);
    expect(tourCompletion!.lastElementChild).toBe(completeButton);
    expect(container.querySelector(".panel-section--planner .primary")).toBeNull();
    expect(container.querySelector(".panel-section--planner .save-draft-button")?.textContent).toBe(
      "Entwurf speichern"
    );
    expect(container.querySelector(".map-stage > .map-stats")).not.toBeNull();
    expect(container.querySelector(".planner-panel .map-stats")).toBeNull();
    expect(container.querySelector(".map-edit-toolbar")).not.toBeNull();
    expect(container.textContent).toContain("20.08.2026");
    const completedDateInput = myToursCard!.querySelector<HTMLInputElement>(".tour-completion input")!;
    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!;
      valueSetter.call(completedDateInput, "19.08.2026");
      completedDateInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => completeButton!.click());
    expect(container.querySelector(".modal-backdrop")).not.toBeNull();
    expect(container.querySelector(".confirm-dialog")).not.toBeNull();
    expect(container.querySelector(".solid-tours-app--modal-open")).not.toBeNull();
    expect(container.querySelector(".confirm-dialog")?.textContent).toContain("19.08.2026");
    const dialogSave = container.querySelector<HTMLButtonElement>(".confirm-dialog .primary")!;
    expect(dialogSave.textContent).toBe("Speichern");
    expect(dialogSave.disabled).toBe(true);
    expect(container.querySelectorAll<HTMLInputElement>('input[name="completion-activity"]:checked')).toHaveLength(0);
    expect(container.querySelectorAll(".activity-item")).toHaveLength(1);
    expect(container.textContent).not.toContain("Lokal");
  });

  it("keeps embed state while following controlled English and German language props", async () => {
    podNetworkMocks.loadState.mockResolvedValue(localStateWithActivity);
    const props = {
      webId: NON_HANNAH_WEB_ID,
      demoWebId: HANNAH_WEB_ID,
    };

    act(() =>
      root.render(createElement(RawSolidToursEmbed, { ...props, language: "en" }))
    );
    await waitForDom(() => expect(container.textContent).toContain("Tour planner"));

    expect(container.querySelector(".language-toggle")).toBeNull();
    expect(container.querySelector(".map-legend")?.textContent).toContain("Current tour");
    expect(leafletMocks.zoomControlFactory).toHaveBeenLastCalledWith({
      position: "topleft",
      zoomInTitle: "Zoom in",
      zoomOutTitle: "Zoom out",
    });
    expect(container.querySelector<HTMLInputElement>(".tour-completion input")?.placeholder).toBe(
      "DD.MM.YYYY"
    );
    act(() => {
      window.dispatchEvent(
        new CustomEvent(TOURS_LANGUAGE_EVENT, { detail: { language: "de" } })
      );
    });
    expect(container.textContent).toContain("Tour planner");
    const nameInput = container.querySelector<HTMLInputElement>(".form-grid input")!;
    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!;
      valueSetter.call(nameInput, "Hannah's custom route");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const completeButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button")
    ).find((button) => button.textContent === "Tour completed")!;
    act(() => completeButton.click());
    expect(container.querySelector(".confirm-dialog")?.textContent).toContain(
      "Save this tour as completed?"
    );
    expect(container.querySelector(".confirm-dialog .language-toggle")).toBeNull();

    act(() =>
      root.render(createElement(RawSolidToursEmbed, { ...props, language: "de" }))
    );

    expect(container.textContent).toContain("Tourenplaner");
    expect(container.querySelector(".confirm-dialog")?.textContent).toContain(
      "Diese Tour als gemacht speichern?"
    );
    expect(container.querySelector(".map-legend")?.textContent).toContain("Aktuelle Tour");
    expect(leafletMocks.zoomControl.remove).toHaveBeenCalledOnce();
    expect(leafletMocks.zoomControlFactory).toHaveBeenLastCalledWith({
      position: "topleft",
      zoomInTitle: "Vergrößern",
      zoomOutTitle: "Verkleinern",
    });
    expect(container.querySelector(".language-toggle")).toBeNull();
    expect(container.querySelector<HTMLInputElement>(".form-grid input")?.value).toBe(
      "Hannah's custom route"
    );
    expect(container.querySelector<HTMLInputElement>(".tour-completion input")?.placeholder).toBe(
      "TT.MM.JJJJ"
    );
  });

  it("marks invalid English date input without depending on German error copy", async () => {
    window.localStorage.setItem(
      localStateKeyForIdentity(NON_HANNAH_WEB_ID),
      JSON.stringify(localStateWithActivity)
    );
    act(() =>
      root.render(
        createElement(RawSolidToursEmbed, {
          webId: NON_HANNAH_WEB_ID,
          demoWebId: HANNAH_WEB_ID,
          language: "en",
        })
      )
    );
    await waitForDom(() => expect(container.textContent).toContain("Tour planner"));

    const dateInput = container.querySelector<HTMLInputElement>(".tour-completion input")!;
    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!;
      valueSetter.call(dateInput, "31.02.2026");
      dateInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const completeButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button")
    ).find((button) => button.textContent === "Tour completed")!;
    act(() => completeButton.click());

    expect(dateInput.getAttribute("aria-invalid")).toBe("true");
    expect(dateInput.getAttribute("aria-describedby")).toBe("map-error-message");
    expect(container.querySelector(".map-error-overlay")?.textContent).toContain(
      "Invalid date"
    );
  });

  it("does not translate a user-entered name that equals a generated default", async () => {
    act(() =>
      root.render(
        createElement(RawSolidToursEmbed, {
          webId: NON_HANNAH_WEB_ID,
          demoWebId: HANNAH_WEB_ID,
          language: "en",
        })
      )
    );
    await waitForDom(() => expect(container.textContent).toContain("Tour planner"));

    const nameInput = container.querySelector<HTMLInputElement>(".form-grid input")!;
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!;
    act(() => {
      valueSetter.call(nameInput, "User route");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
      valueSetter.call(nameInput, "New tour in Wuppertal");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    act(() =>
      root.render(
        createElement(RawSolidToursEmbed, {
          webId: NON_HANNAH_WEB_ID,
          demoWebId: HANNAH_WEB_ID,
          language: "de",
        })
      )
    );
    expect(container.querySelector<HTMLInputElement>(".form-grid input")?.value).toBe(
      "New tour in Wuppertal"
    );
  });

  it("shows map editing actions only while the current route contains points", async () => {
    act(() =>
      root.render(
        createElement(SolidToursEmbed, {
          webId: NON_HANNAH_WEB_ID,
          demoWebId: HANNAH_WEB_ID,
        })
      )
    );

    await waitForDom(() => {
      expect(container.querySelector(".route-workspace")).not.toBeNull();
    });
    expect(container.querySelector(".map-edit-toolbar")).toBeNull();

    const clickRegistration = leafletMocks.map.on.mock.calls.find(
      ([eventName]) => eventName === "click"
    );
    expect(clickRegistration).toBeDefined();
    const handleMapClick = clickRegistration![1] as (event: {
      latlng: { lng: number; lat: number };
    }) => void;
    act(() => handleMapClick({ latlng: { lng: 7.15, lat: 51.26 } }));
    expect(container.querySelector(".map-edit-toolbar")).not.toBeNull();

    const clearButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".map-edit-toolbar button")
    ).find((button) => button.textContent === "Route leeren");
    expect(clearButton).toBeDefined();
    act(() => clearButton!.click());
    expect(container.querySelector(".map-edit-toolbar")).toBeNull();
  });

  it("never sends a routing request when points are drawn", async () => {
    const runtimeFetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));
    try {
      act(() =>
        root.render(
          createElement(SolidToursEmbed, {
            webId: NON_HANNAH_WEB_ID,
            demoWebId: HANNAH_WEB_ID,
          })
        )
      );
      await waitForDom(() => {
        expect(container.querySelector(".route-workspace")).not.toBeNull();
      });

      const clickRegistration = leafletMocks.map.on.mock.calls.find(
        ([eventName]) => eventName === "click"
      )!;
      const handleMapClick = clickRegistration[1] as (event: {
        latlng: { lng: number; lat: number };
      }) => void;
      act(() => {
        handleMapClick({ latlng: { lng: 7.15, lat: 51.26 } });
        handleMapClick({ latlng: { lng: 7.16, lat: 51.27 } });
      });

      expect(runtimeFetch).not.toHaveBeenCalled();
      expect(container.textContent).not.toContain("Straßenrouting");
      expect(container.querySelector(".planner-route")).toBeNull();
    } finally {
      runtimeFetch.mockRestore();
    }
  });

  it("blocks completion for an invalid German calendar date", async () => {
    window.localStorage.setItem(
      localStateKeyForIdentity(NON_HANNAH_WEB_ID),
      JSON.stringify(localStateWithActivity)
    );
    act(() =>
      root.render(
        createElement(SolidToursEmbed, {
          webId: NON_HANNAH_WEB_ID,
          demoWebId: HANNAH_WEB_ID,
        })
      )
    );

    await waitForDom(() => {
      expect(container.querySelector(".tour-completion input")).not.toBeNull();
    });
    const dateInput = container.querySelector<HTMLInputElement>(".tour-completion input")!;
    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!;
      valueSetter.call(dateInput, "31.02.2026");
      dateInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const completeButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "Tour gemacht"
    )!;
    act(() => completeButton.click());

    expect(container.querySelector(".modal-backdrop")).toBeNull();
    expect(dateInput.getAttribute("aria-invalid")).toBe("true");
    expect(container.querySelector(".map-error-overlay")?.textContent).toContain("TT.MM.JJJJ");
    expect(container.querySelector(".map-error-overlay")?.getAttribute("role")).toBe("alert");
  });

  it("does not show a success notification after saving a completed tour", async () => {
    podNetworkMocks.loadState.mockResolvedValue(localStateWithActivity);
    act(() =>
      root.render(
        createElement(SolidToursEmbed, {
          webId: NON_HANNAH_WEB_ID,
          demoWebId: HANNAH_WEB_ID,
        })
      )
    );

    await waitForDom(() => {
      expect(container.querySelectorAll(".activity-item")).toHaveLength(1);
    });

    const completeButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "Tour gemacht"
    )!;
    act(() => completeButton.click());
    act(() => {
      container.querySelector<HTMLInputElement>('input[name="completion-activity"][value="walking"]')!.click();
    });
    const saveButton = container.querySelector<HTMLButtonElement>(".confirm-dialog .primary")!;
    expect(saveButton.disabled).toBe(false);
    await act(async () => saveButton.click());

    await waitForDom(() => {
      expect(container.querySelectorAll(".activity-item")).toHaveLength(2);
    });
    expect(container.querySelector(".activity-item")?.textContent).toContain("Schritte");
    expect(container.querySelector(".notice")).toBeNull();
    expect(container.textContent).not.toContain("Tour als absolvierte Aktivität gespeichert.");
    expect(container.textContent).not.toContain(
      "Tour als absolvierte Aktivität privat in Hannahs Pod gespeichert."
    );
  });

  it("creates a cycling activity only after cycling is explicitly selected", async () => {
    podNetworkMocks.loadState.mockResolvedValue(localStateWithActivity);
    act(() =>
      root.render(
        createElement(SolidToursEmbed, {
          webId: NON_HANNAH_WEB_ID,
          demoWebId: HANNAH_WEB_ID,
        })
      )
    );

    await waitForDom(() => {
      expect(container.querySelectorAll(".activity-item")).toHaveLength(1);
    });
    const completeButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "Tour gemacht"
    )!;
    act(() => completeButton.click());

    const saveButton = container.querySelector<HTMLButtonElement>(".confirm-dialog .primary")!;
    expect(saveButton.disabled).toBe(true);
    act(() => {
      container.querySelector<HTMLInputElement>('input[name="completion-activity"][value="cycling"]')!.click();
    });
    expect(saveButton.disabled).toBe(false);
    expect(container.querySelector(".activity-preview")?.textContent).toContain("Geschwindigkeit");

    await act(async () => saveButton.click());
    await waitForDom(() => {
      expect(container.querySelectorAll(".activity-item")).toHaveLength(2);
    });

    const newestActivity = container.querySelector(".activity-item")!;
    expect(newestActivity.textContent).toContain("km/h");
    expect(newestActivity.textContent).not.toContain("Schritte");
    expect(podNetworkMocks.saveActivityConditionally).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ activityType: "cycling" }),
      NON_HANNAH_WEB_ID,
      expect.any(Function)
    );
    expect(podNetworkMocks.saveState).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        activities: expect.arrayContaining([
          expect.objectContaining({ activityType: "cycling" }),
        ]),
      }),
      expect.anything(),
      NON_HANNAH_WEB_ID,
      expect.any(Function)
    );
  });

  it.each([
    { mode: "embed", activityType: "walking", iconClass: "fa-person-walking" },
    { mode: "standalone", activityType: "cycling", iconClass: "fa-bicycle" },
  ] as const)(
    "shows the $activityType completion journey while the $mode Pod write is pending",
    async ({ mode, activityType, iconClass }) => {
      const podRoot = "https://solid-community-server.tmdt.info/sscon/";
      const managerFetch = vi.fn(async () => new Response(null, { status: 204 }));
      let resolveActivity!: (value: { etag: string }) => void;
      const pendingActivity = new Promise<{ etag: string }>((resolve) => {
        resolveActivity = resolve;
      });
      window.localStorage.setItem(TOURS_LANGUAGE_STORAGE_KEY, "de");
      podNetworkMocks.resolvePodRoot.mockResolvedValue(podRoot);
      podNetworkMocks.ensureStorage.mockResolvedValue(undefined);
      podNetworkMocks.loadState.mockResolvedValue(localStateWithActivity);
      podNetworkMocks.saveState.mockResolvedValue(undefined);
      podNetworkMocks.saveActivityConditionally.mockReturnValue(pendingActivity);
      const session: SolidToursSession = {
        info: { isLoggedIn: true, webId: HANNAH_WEB_ID },
        fetch: managerFetch,
      };

      act(() => {
        root.render(
          mode === "embed"
            ? createElement(SolidToursEmbed, {
                webId: HANNAH_WEB_ID,
                demoWebId: HANNAH_WEB_ID,
                session,
              })
            : createElement(App, {
                demoWebIdOverride: HANNAH_WEB_ID,
                session,
              })
        );
      });

      await waitForDom(() => {
        expect(container.querySelector(".tour-completion .primary")).not.toBeNull();
      });
      act(() => {
        container.querySelector<HTMLButtonElement>(".tour-completion .primary")!.click();
      });
      act(() => {
        container
          .querySelector<HTMLInputElement>(
            `input[name="completion-activity"][value="${activityType}"]`
          )!
          .click();
      });
      act(() => {
        container.querySelector<HTMLButtonElement>(".confirm-dialog .primary")!.click();
      });

      await waitForDom(() => {
        expect(podNetworkMocks.saveActivityConditionally).toHaveBeenCalledOnce();
        expect(container.querySelector('[data-testid="completion-loading-overlay"]')).not.toBeNull();
      });
      const loadingCard = container.querySelector<HTMLElement>(".completion-loading-card")!;
      expect(loadingCard.dataset.activityType).toBe(activityType);
      expect(loadingCard.getAttribute("aria-busy")).toBe("true");
      expect(loadingCard.querySelector(`.${iconClass}`)).not.toBeNull();
      expect(loadingCard.textContent).toContain("Gemachte Tour wird gespeichert");
      expect(loadingCard.querySelector('[role="progressbar"]')?.hasAttribute("aria-valuenow")).toBe(
        false
      );
      expect(container.querySelector(".confirm-dialog")).toBeNull();
      expect(container.querySelector(".solid-tours-app--modal-open")).not.toBeNull();
      expect(container.querySelector(`.solid-tours-app--${mode === "embed" ? "embedded" : "standalone"}`)).not.toBeNull();

      await act(async () => {
        resolveActivity({ etag: '"activity-new"' });
      });
      await waitForDom(() => {
        expect(container.querySelector('[data-testid="completion-loading-overlay"]')).toBeNull();
        expect(container.querySelectorAll(".activity-item")).toHaveLength(2);
      });
      expect(container.querySelector(".solid-tours-app--modal-open")).toBeNull();
    }
  );

  it("clears the completion journey and reports a failed Pod activity write", async () => {
    const podRoot = "https://solid-community-server.tmdt.info/sscon/";
    const managerFetch = vi.fn(async () => new Response(null, { status: 204 }));
    let rejectActivity!: (reason: Error) => void;
    const pendingActivity = new Promise<{ etag: string }>((_resolve, reject) => {
      rejectActivity = reject;
    });
    podNetworkMocks.resolvePodRoot.mockResolvedValue(podRoot);
    podNetworkMocks.ensureStorage.mockResolvedValue(undefined);
    podNetworkMocks.loadState.mockResolvedValue(localStateWithActivity);
    podNetworkMocks.saveState.mockResolvedValue(undefined);
    podNetworkMocks.saveActivityConditionally.mockReturnValue(pendingActivity);

    act(() =>
      root.render(
        createElement(SolidToursEmbed, {
          webId: HANNAH_WEB_ID,
          demoWebId: HANNAH_WEB_ID,
          session: {
            info: { isLoggedIn: true, webId: HANNAH_WEB_ID },
            fetch: managerFetch,
          },
        })
      )
    );
    await waitForDom(() => {
      expect(container.querySelector(".tour-completion .primary")).not.toBeNull();
    });
    act(() => container.querySelector<HTMLButtonElement>(".tour-completion .primary")!.click());
    act(() => {
      container
        .querySelector<HTMLInputElement>('input[name="completion-activity"][value="walking"]')!
        .click();
    });
    act(() => container.querySelector<HTMLButtonElement>(".confirm-dialog .primary")!.click());
    await waitForDom(() => {
      expect(container.querySelector('[data-testid="completion-loading-overlay"]')).not.toBeNull();
    });

    await act(async () => {
      rejectActivity(new Error("Die private Aktivität konnte nicht gespeichert werden."));
    });
    await waitForDom(() => {
      expect(container.querySelector('[data-testid="completion-loading-overlay"]')).toBeNull();
      expect(container.querySelector(".map-error-overlay")?.textContent).toContain(
        "Die private Aktivität konnte nicht gespeichert werden."
      );
    });
    expect(container.querySelectorAll(".activity-item")).toHaveLength(1);
  });

  it("deletes a completed activity from guest-local history after confirmation", async () => {
    window.localStorage.setItem(
      localStateKeyForIdentity(null),
      JSON.stringify(localStateWithActivity)
    );
    act(() =>
      root.render(
        createElement(SolidToursEmbed, {
          webId: null,
        })
      )
    );

    await waitForDom(() => {
      expect(container.querySelectorAll(".activity-item")).toHaveLength(1);
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".activity-delete")!.click();
    });
    await waitForDom(() => {
      expect(container.querySelector('[data-testid="delete-confirmation-dialog"]')?.textContent).toContain(
        "Gemachte Tour löschen?"
      );
    });
    await confirmDeleteDialog(container);

    await waitForDom(() => {
      expect(container.querySelectorAll(".activity-item")).toHaveLength(0);
    });
    const stored = JSON.parse(
      window.localStorage.getItem(localStateKeyForIdentity(null))!
    );
    expect(stored.activities).toEqual([]);
    expect(stored.drafts).toHaveLength(1);
    expect(podNetworkMocks.deleteActivity).not.toHaveBeenCalled();
  });

  it("re-reads Hannah's state and commits draft removal before conditional master deletion", async () => {
    const podRoot = "https://solid-community-server.tmdt.info/sscon/";
    const managerFetch = vi.fn(async () => new Response(null, { status: 204 }));
    const remoteDraft = {
      ...localStateWithActivity.drafts[0],
      id: "8db47d3b-8a4f-4a74-b086-77c1c7630bf7",
      name: "Parallel gespeicherte Tour",
    };
    const remoteState = {
      ...localStateWithActivity,
      drafts: [...localStateWithActivity.drafts, remoteDraft],
    };
    podNetworkMocks.resolvePodRoot.mockResolvedValue(podRoot);
    podNetworkMocks.ensureStorage.mockResolvedValue(undefined);
    podNetworkMocks.loadState.mockResolvedValue(localStateWithActivity);
    podNetworkMocks.loadStateSnapshot.mockResolvedValue({
      state: remoteState,
      etag: '"state-v1"',
    });
    podNetworkMocks.saveStateIfUnchanged.mockImplementation(
      async (_root, nextState) => ({ state: nextState, etag: '"state-v2"' })
    );

    act(() =>
      root.render(
        createElement(SolidToursEmbed, {
          webId: HANNAH_WEB_ID,
          demoWebId: HANNAH_WEB_ID,
          session: {
            info: { isLoggedIn: true, webId: HANNAH_WEB_ID },
            fetch: managerFetch,
          },
        })
      )
    );
    await waitForDom(() => expect(container.querySelector(".draft-item .delete-link")).not.toBeNull());
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".draft-item .delete-link")!.click();
    });
    await confirmDeleteDialog(container);

    await waitForDom(() => {
      expect(container.querySelectorAll(".draft-item")).toHaveLength(1);
      expect(container.querySelector(".draft-item")?.textContent).toContain(
        "Parallel gespeicherte Tour"
      );
    });
    expect(podNetworkMocks.loadDraftMasterSnapshot).toHaveBeenCalledWith(
      podRoot,
      localStateWithActivity.drafts[0],
      expect.any(Function)
    );
    expect(podNetworkMocks.saveStateIfUnchanged).toHaveBeenCalledWith(
      podRoot,
      expect.objectContaining({ drafts: [remoteDraft] }),
      '"state-v1"',
      HANNAH_WEB_ID,
      expect.any(Function)
    );
    expect(podNetworkMocks.deleteDraft).toHaveBeenCalledWith(
      podRoot,
      localStateWithActivity.drafts[0].id,
      '"draft-v1"',
      expect.any(Function)
    );
    expect(podNetworkMocks.saveStateIfUnchanged.mock.invocationCallOrder[0]).toBeLessThan(
      podNetworkMocks.deleteDraft.mock.invocationCallOrder[0]
    );
  });

  it("removes a staged duplicate when its state CAS conflicts", async () => {
    const podRoot = "https://solid-community-server.tmdt.info/sscon/";
    const managerFetch = vi.fn(async () => new Response(null, { status: 204 }));
    const concurrentState = {
      ...localStateWithActivity,
      drafts: [
        ...localStateWithActivity.drafts,
        {
          ...localStateWithActivity.drafts[0],
          id: "8db47d3b-8a4f-4a74-b086-77c1c7630bf7",
          name: "Remote Tour",
        },
      ],
    };
    podNetworkMocks.resolvePodRoot.mockResolvedValue(podRoot);
    podNetworkMocks.ensureStorage.mockResolvedValue(undefined);
    podNetworkMocks.loadState.mockResolvedValue(localStateWithActivity);
    podNetworkMocks.loadStateSnapshot.mockResolvedValue({
      state: concurrentState,
      etag: '"state-v2"',
    });
    podNetworkMocks.saveState.mockRejectedValue(
      new StateConflictError("Der Solid-Tours-Status wurde zwischenzeitlich geändert.")
    );

    act(() =>
      root.render(
        createElement(SolidToursEmbed, {
          webId: HANNAH_WEB_ID,
          demoWebId: HANNAH_WEB_ID,
          session: {
            info: { isLoggedIn: true, webId: HANNAH_WEB_ID },
            fetch: managerFetch,
          },
        })
      )
    );
    await waitForDom(() => expect(container.querySelector(".draft-item .ghost")).not.toBeNull());
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".draft-item .ghost")!.click();
    });

    await waitForDom(() => {
      expect(container.querySelector(".map-error-overlay")?.textContent).toContain(
        "zwischenzeitlich geändert"
      );
      expect(container.textContent).toContain("Remote Tour");
    });
    const stagedDraft = podNetworkMocks.saveDraftConditionally.mock.calls[0][1];
    expect(podNetworkMocks.saveDraftConditionally.mock.calls[0][2]).toBeNull();
    expect(podNetworkMocks.deleteDraft).toHaveBeenCalledWith(
      podRoot,
      stagedDraft.id,
      '"draft-v2"',
      expect.any(Function)
    );
    expect(podNetworkMocks.saveState.mock.invocationCallOrder[0]).toBeLessThan(
      podNetworkMocks.deleteDraft.mock.invocationCallOrder[0]
    );
    expect(podNetworkMocks.loadDraftMasterSnapshot).not.toHaveBeenCalled();
  });

  it("restores an updated draft master against the staged ETag after a state conflict", async () => {
    const podRoot = "https://solid-community-server.tmdt.info/sscon/";
    const managerFetch = vi.fn(async () => new Response(null, { status: 204 }));
    podNetworkMocks.resolvePodRoot.mockResolvedValue(podRoot);
    podNetworkMocks.ensureStorage.mockResolvedValue(undefined);
    podNetworkMocks.loadState.mockResolvedValue(localStateWithActivity);
    podNetworkMocks.loadStateSnapshot.mockResolvedValue({
      state: localStateWithActivity,
      etag: '"state-v2"',
    });
    podNetworkMocks.saveDraftConditionally
      .mockResolvedValueOnce({ etag: '"draft-v2"' })
      .mockResolvedValueOnce({ etag: '"draft-v3"' });
    podNetworkMocks.saveState.mockRejectedValue(
      new StateConflictError("Der Solid-Tours-Status wurde zwischenzeitlich geändert.")
    );

    act(() =>
      root.render(
        createElement(SolidToursEmbed, {
          webId: HANNAH_WEB_ID,
          demoWebId: HANNAH_WEB_ID,
          session: {
            info: { isLoggedIn: true, webId: HANNAH_WEB_ID },
            fetch: managerFetch,
          },
        })
      )
    );
    await waitForDom(() => expect(container.querySelector(".save-draft-button")).not.toBeNull());
    const nameInput = container.querySelector<HTMLInputElement>(".panel-section--planner input")!;
    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      valueSetter.call(nameInput, "Lokal geänderte Tour");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".save-draft-button")!.click();
    });

    await waitForDom(() => {
      expect(podNetworkMocks.saveDraftConditionally).toHaveBeenCalledTimes(2);
    });
    expect(podNetworkMocks.saveDraftConditionally.mock.calls[0][1].name).toBe(
      "Lokal geänderte Tour"
    );
    expect(podNetworkMocks.saveDraftConditionally.mock.calls[0][2]).toBe('"draft-v1"');
    expect(podNetworkMocks.saveDraftConditionally).toHaveBeenLastCalledWith(
      podRoot,
      localStateWithActivity.drafts[0],
      '"draft-v2"',
      HANNAH_WEB_ID,
      expect.any(Function)
    );
    expect(podNetworkMocks.deleteDraft).not.toHaveBeenCalled();
  });

  it("removes a staged draft if the authenticated identity changes before state CAS", async () => {
    const podRoot = "https://solid-community-server.tmdt.info/sscon/";
    const managerFetch = vi.fn(async () => new Response(null, { status: 204 }));
    const otherFetch = vi.fn(async () => new Response(null, { status: 204 }));
    let resolveWrite!: (snapshot: { etag: string }) => void;
    const pendingWrite = new Promise<{ etag: string }>((resolve) => {
      resolveWrite = resolve;
    });
    podNetworkMocks.resolvePodRoot.mockResolvedValue(podRoot);
    podNetworkMocks.ensureStorage.mockResolvedValue(undefined);
    podNetworkMocks.loadState.mockResolvedValue(localStateWithActivity);
    podNetworkMocks.saveDraftConditionally.mockReturnValue(pendingWrite);

    act(() =>
      root.render(
        createElement(SolidToursEmbed, {
          webId: HANNAH_WEB_ID,
          demoWebId: HANNAH_WEB_ID,
          session: {
            info: { isLoggedIn: true, webId: HANNAH_WEB_ID },
            fetch: managerFetch,
          },
        })
      )
    );
    await waitForDom(() => expect(container.querySelector(".draft-item .ghost")).not.toBeNull());
    act(() => container.querySelector<HTMLButtonElement>(".draft-item .ghost")!.click());
    await waitForDom(() => expect(podNetworkMocks.saveDraftConditionally).toHaveBeenCalledOnce());
    const stagedId = podNetworkMocks.saveDraftConditionally.mock.calls[0][1].id;

    act(() =>
      root.render(
        createElement(SolidToursEmbed, {
          webId: NON_HANNAH_WEB_ID,
          demoWebId: HANNAH_WEB_ID,
          session: {
            info: { isLoggedIn: true, webId: NON_HANNAH_WEB_ID },
            fetch: otherFetch,
          },
        })
      )
    );
    await act(async () => resolveWrite({ etag: '"draft-staged"' }));

    await waitForDom(() => expect(podNetworkMocks.deleteDraft).toHaveBeenCalledOnce());
    expect(podNetworkMocks.deleteDraft).toHaveBeenCalledWith(
      podRoot,
      stagedId,
      '"draft-staged"',
      expect.any(Function)
    );
    expect(podNetworkMocks.saveState).not.toHaveBeenCalled();
  });

  it("re-reads the user's Pod state, preserves remote additions and conditionally updates state before DELETE", async () => {
    const podRoot = "https://solid-community-server.tmdt.info/sscon/";
    const managerFetch = vi.fn(async () => new Response(null, { status: 204 }));
    podNetworkMocks.resolvePodRoot.mockResolvedValue(podRoot);
    podNetworkMocks.ensureStorage.mockResolvedValue(undefined);
    podNetworkMocks.loadState.mockResolvedValue(localStateWithActivity);
    podNetworkMocks.loadStateSnapshot.mockResolvedValue({
      state: podStateWithTwoActivities,
      etag: '"state-v1"',
    });
    podNetworkMocks.saveStateIfUnchanged.mockImplementation(
      async (_root, nextState) => ({ state: nextState, etag: '"state-v2"' })
    );
    podNetworkMocks.loadActivityMasterSnapshot.mockResolvedValue({
      etag: '"activity-v1"',
    });
    podNetworkMocks.deleteActivity.mockResolvedValue(undefined);
    podNetworkMocks.activityMasterExists.mockResolvedValue(false);

    act(() =>
      root.render(
        createElement(SolidToursEmbed, {
          webId: HANNAH_WEB_ID,
          demoWebId: HANNAH_WEB_ID,
          session: {
            info: { isLoggedIn: true, webId: HANNAH_WEB_ID },
            fetch: managerFetch,
          },
        })
      )
    );

    await waitForDom(() => {
      expect(container.querySelectorAll(".activity-item")).toHaveLength(1);
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".activity-delete")!.click();
    });
    await confirmDeleteDialog(container);

    await waitForDom(() => {
      expect(container.querySelectorAll(".activity-item")).toHaveLength(1);
      expect(container.querySelector(".activity-item")?.textContent).toContain("Nordbahntrasse");
    });
    expect(podNetworkMocks.deleteActivity).toHaveBeenCalledWith(
      podRoot,
      localStateWithActivity.activities[0].id,
      '"activity-v1"',
      expect.any(Function)
    );
    expect(podNetworkMocks.saveStateIfUnchanged).toHaveBeenCalledWith(
      podRoot,
      expect.objectContaining({
        activities: [podStateWithTwoActivities.activities[1]],
        activeRun: null,
      }),
      '"state-v1"',
      HANNAH_WEB_ID,
      expect.any(Function)
    );
    const callOrder = [
      podNetworkMocks.loadStateSnapshot,
      podNetworkMocks.saveStateIfUnchanged,
      podNetworkMocks.deleteActivity,
      podNetworkMocks.activityMasterExists,
    ].map((mock) => mock.mock.invocationCallOrder[0]);
    expect(callOrder).toEqual([...callOrder].sort((left, right) => left - right));
    expect(podNetworkMocks.saveState).not.toHaveBeenCalled();
  });

  it("accepts an ambiguous DELETE error only after verifying that the master is absent", async () => {
    const podRoot = "https://solid-community-server.tmdt.info/sscon/";
    const managerFetch = vi.fn(async () => new Response(null, { status: 204 }));
    podNetworkMocks.resolvePodRoot.mockResolvedValue(podRoot);
    podNetworkMocks.ensureStorage.mockResolvedValue(undefined);
    podNetworkMocks.loadState.mockResolvedValue(localStateWithActivity);
    podNetworkMocks.loadStateSnapshot.mockResolvedValue({
      state: localStateWithActivity,
      etag: '"state-v1"',
    });
    podNetworkMocks.saveStateIfUnchanged.mockResolvedValue({
      state: { ...localStateWithActivity, activities: [] },
      etag: '"state-v2"',
    });
    podNetworkMocks.loadActivityMasterSnapshot.mockResolvedValue({
      etag: '"activity-v1"',
    });
    podNetworkMocks.deleteActivity.mockRejectedValue(
      new TypeError("Network response was lost after DELETE")
    );
    podNetworkMocks.activityMasterExists.mockResolvedValue(false);

    act(() =>
      root.render(
        createElement(SolidToursEmbed, {
          webId: HANNAH_WEB_ID,
          demoWebId: HANNAH_WEB_ID,
          session: {
            info: { isLoggedIn: true, webId: HANNAH_WEB_ID },
            fetch: managerFetch,
          },
        })
      )
    );

    await waitForDom(() => {
      expect(container.querySelector(".activity-delete")).not.toBeNull();
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".activity-delete")!.click();
    });
    await confirmDeleteDialog(container);

    await waitForDom(() => {
      expect(container.querySelectorAll(".activity-item")).toHaveLength(0);
    });
    expect(podNetworkMocks.activityMasterExists).toHaveBeenCalledWith(
      podRoot,
      localStateWithActivity.activities[0].id,
      expect.any(Function)
    );
    expect(podNetworkMocks.saveStateIfUnchanged).toHaveBeenCalledOnce();
    expect(container.querySelector(".map-error-overlay")).toBeNull();
  });

  it("verifies the full master before rolling state back when DELETE cannot be verified", async () => {
    const podRoot = "https://solid-community-server.tmdt.info/sscon/";
    const managerFetch = vi.fn(async () => new Response(null, { status: 204 }));
    podNetworkMocks.resolvePodRoot.mockResolvedValue(podRoot);
    podNetworkMocks.ensureStorage.mockResolvedValue(undefined);
    podNetworkMocks.loadState.mockResolvedValue(localStateWithActivity);
    podNetworkMocks.loadStateSnapshot.mockResolvedValue({
      state: localStateWithActivity,
      etag: '"state-v1"',
    });
    podNetworkMocks.saveStateIfUnchanged
      .mockResolvedValueOnce({
        state: { ...localStateWithActivity, activities: [] },
        etag: '"state-v2"',
      })
      .mockResolvedValueOnce({ state: localStateWithActivity, etag: '"state-v3"' });
    podNetworkMocks.loadActivityMasterSnapshot.mockResolvedValue({
      etag: '"activity-v1"',
    });
    podNetworkMocks.deleteActivity.mockRejectedValue(new TypeError("DELETE failed"));
    podNetworkMocks.activityMasterExists.mockRejectedValue(new TypeError("HEAD failed"));

    act(() =>
      root.render(
        createElement(SolidToursEmbed, {
          webId: HANNAH_WEB_ID,
          demoWebId: HANNAH_WEB_ID,
          session: {
            info: { isLoggedIn: true, webId: HANNAH_WEB_ID },
            fetch: managerFetch,
          },
        })
      )
    );

    await waitForDom(() => {
      expect(container.querySelector(".activity-delete")).not.toBeNull();
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".activity-delete")!.click();
    });
    await confirmDeleteDialog(container);

    await waitForDom(() => {
      expect(container.querySelector(".map-error-overlay")?.textContent).toContain(
        "vorherige Pod-Zustand wiederhergestellt"
      );
    });
    expect(podNetworkMocks.loadActivityMasterSnapshot).toHaveBeenCalledWith(
      podRoot,
      localStateWithActivity.activities[0],
      expect.any(Function)
    );
    expect(podNetworkMocks.saveStateIfUnchanged).toHaveBeenCalledTimes(2);
    expect(podNetworkMocks.saveStateIfUnchanged).toHaveBeenLastCalledWith(
      podRoot,
      localStateWithActivity,
      '"state-v2"',
      HANNAH_WEB_ID,
      expect.any(Function)
    );
    expect(
      podNetworkMocks.loadActivityMasterSnapshot.mock.invocationCallOrder.at(-1)!
    ).toBeLessThan(podNetworkMocks.saveStateIfUnchanged.mock.invocationCallOrder[1]);
    expect(container.querySelectorAll(".activity-item")).toHaveLength(1);
  });

  it("withdraws the active donation before deleting its final completed activity", async () => {
    const podRoot = "https://solid-community-server.tmdt.info/sscon/";
    const scenarioRunId = "7a64c06e-793f-4ab2-85af-fb8bfbd7ae77";
    const activityId = localStateWithActivity.activities[0].id;
    const activeState = {
      ...localStateWithActivity,
      activeRun: {
        phase: "published" as const,
        scenarioRunId,
        activityIds: [activityId],
        resourceUrl: `${podRoot}solid-tours/runs/${scenarioRunId}/activity.geojson`,
        manifestUrl: `${podRoot}solid-tours/runs/${scenarioRunId}/manifest.ttl`,
        runContainerUrl: `${podRoot}solid-tours/runs/${scenarioRunId}/`,
        datasetIdentifier: `solid-tours-activity-${scenarioRunId}`,
        catalogDatasetUrl: `${podRoot}catalog/ds/solid-tours-activity-${scenarioRunId}.ttl#it`,
        publishedAt: "2026-08-21T12:00:00.000Z",
      },
    };
    const managerFetch = vi.fn(async () => new Response(null, { status: 204 }));
    podNetworkMocks.resolvePodRoot.mockResolvedValue(podRoot);
    podNetworkMocks.ensureStorage.mockResolvedValue(undefined);
    // The rendered state is stale and has no active run; the mandatory remote
    // reread must still discover and protect the published activity.
    podNetworkMocks.loadState.mockResolvedValue(localStateWithActivity);
    let persistedState = activeState;
    let stateVersion = 2;
    podNetworkMocks.loadStateSnapshot.mockImplementation(async () => ({
      state: persistedState,
      etag: `"state-v${stateVersion}"`,
    }));
    podNetworkMocks.saveStateIfUnchanged.mockImplementation(async (_root, nextState) => {
      persistedState = nextState;
      stateVersion += 1;
      return { state: nextState, etag: `"state-v${stateVersion}"` };
    });
    podNetworkMocks.loadActivityMasterSnapshot.mockResolvedValue({
      etag: '"activity-v1"',
    });
    podNetworkMocks.deleteActivity.mockResolvedValue(undefined);
    podNetworkMocks.activityMasterExists.mockResolvedValue(false);

    act(() =>
      root.render(
        createElement(SolidToursEmbed, {
          webId: HANNAH_WEB_ID,
          demoWebId: HANNAH_WEB_ID,
          session: {
            info: { isLoggedIn: true, webId: HANNAH_WEB_ID },
            fetch: managerFetch,
          },
        })
      )
    );

    await waitForDom(() => {
      expect(container.querySelector(".activity-delete")).not.toBeNull();
    });
    act(() => {
      container.querySelector<HTMLButtonElement>(".activity-delete")!.click();
    });
    await confirmDeleteDialog(container);
    await confirmDeleteDialog(container);

    await waitForDom(() => {
      expect(container.querySelectorAll(".activity-item")).toHaveLength(0);
    });
    expect(podNetworkMocks.setOwnerOnlyIfPresent).toHaveBeenCalledWith(
      activeState.activeRun.resourceUrl,
      HANNAH_WEB_ID,
      expect.any(Function)
    );
    expect(podNetworkMocks.clearPublishedMarker).toHaveBeenCalledWith(
      podRoot,
      scenarioRunId,
      expect.any(Function)
    );
    expect(accessRequestMocks.revokeAndArchiveScenarioAccess).toHaveBeenCalledWith(
      expect.objectContaining({ scenarioRunId, resourceUrl: activeState.activeRun.resourceUrl })
    );
    expect(catalogMocks.removeCatalogEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        datasetIdentifier: activeState.activeRun.datasetIdentifier,
        catalogDatasetUrl: activeState.activeRun.catalogDatasetUrl,
      })
    );
    expect(podNetworkMocks.deleteActivity).toHaveBeenCalledWith(
      podRoot,
      activityId,
      '"activity-v1"',
      expect.any(Function)
    );
    expect(podNetworkMocks.saveRunSnapshot).not.toHaveBeenCalled();
    expect(catalogMocks.publishCatalogEntry).not.toHaveBeenCalled();
    expect(podNetworkMocks.writePublishedMarker).not.toHaveBeenCalled();
    expect(persistedState).toEqual(
      expect.objectContaining({ activities: [], activeRun: null })
    );
  });

  it("replaces an active donation with a new run after deleting one of several completed activities", async () => {
    const podRoot = "https://solid-community-server.tmdt.info/sscon/";
    const oldScenarioRunId = "7a64c06e-793f-4ab2-85af-fb8bfbd7ae77";
    const oldRunContainerUrl = `${podRoot}solid-tours/runs/${oldScenarioRunId}/`;
    const oldRun: ActiveRun = {
      phase: "published",
      scenarioRunId: oldScenarioRunId,
      activityIds: podStateWithTwoActivities.activities.map((activity) => activity.id),
      resourceUrl: `${oldRunContainerUrl}activity.geojson`,
      manifestUrl: `${oldRunContainerUrl}manifest.ttl`,
      runContainerUrl: oldRunContainerUrl,
      datasetIdentifier: `solid-tours-activity-${oldScenarioRunId}`,
      catalogDatasetUrl: `${podRoot}catalog/ds/solid-tours-activity-${oldScenarioRunId}.ttl#it`,
      publishedAt: "2026-08-21T12:00:00.000Z",
    };
    const activeState = { ...podStateWithTwoActivities, activeRun: oldRun };
    const managerFetch = vi.fn(async () => new Response(null, { status: 204 }));
    let persistedState = activeState;
    let stateVersion = 1;
    let newScenarioRunId = "";

    podNetworkMocks.resolvePodRoot.mockResolvedValue(podRoot);
    podNetworkMocks.ensureStorage.mockResolvedValue(undefined);
    podNetworkMocks.loadState.mockResolvedValue(activeState);
    podNetworkMocks.loadStateSnapshot.mockImplementation(async () => ({
      state: persistedState,
      etag: `"state-v${stateVersion}"`,
    }));
    podNetworkMocks.saveStateIfUnchanged.mockImplementation(async (_root, nextState) => {
      persistedState = nextState;
      stateVersion += 1;
      return { state: nextState, etag: `"state-v${stateVersion}"` };
    });
    podNetworkMocks.saveState.mockImplementation(async (_root, nextState) => {
      persistedState = nextState;
      stateVersion += 1;
    });
    podNetworkMocks.loadActivityMasterSnapshot.mockResolvedValue({
      etag: '"activity-v1"',
    });
    podNetworkMocks.deleteActivity.mockResolvedValue(undefined);
    podNetworkMocks.activityMasterExists.mockResolvedValue(false);
    podNetworkMocks.saveRunSnapshot.mockImplementation(async (_root, scenarioRunId) => {
      newScenarioRunId = scenarioRunId;
      const runContainerUrl = `${podRoot}solid-tours/runs/${scenarioRunId}/`;
      return {
        resourceUrl: `${runContainerUrl}activity.geojson`,
        manifestUrl: `${runContainerUrl}manifest.ttl`,
        runContainerUrl,
      };
    });
    catalogMocks.publishCatalogEntry.mockImplementation(async ({ scenarioRunId }) => {
      const datasetIdentifier = `solid-tours-activity-${scenarioRunId}`;
      return {
        datasetIdentifier,
        catalogDatasetUrl: `${podRoot}catalog/ds/${datasetIdentifier}.ttl#it`,
      };
    });
    podNetworkMocks.writePublishedMarker.mockResolvedValue(undefined);

    act(() =>
      root.render(
        createElement(SolidToursEmbed, {
          webId: HANNAH_WEB_ID,
          demoWebId: HANNAH_WEB_ID,
          session: {
            info: { isLoggedIn: true, webId: HANNAH_WEB_ID },
            fetch: managerFetch,
          },
        })
      )
    );

    await waitForDom(() => {
      expect(container.querySelectorAll(".activity-item")).toHaveLength(2);
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".activity-delete")!.click();
    });
    await confirmDeleteDialog(container);

    await waitForDom(() => {
      expect(podNetworkMocks.writePublishedMarker).toHaveBeenCalledOnce();
      expect(container.querySelectorAll(".activity-item")).toHaveLength(1);
    });

    expect(newScenarioRunId).toMatch(/^[0-9a-f-]{36}$/);
    expect(newScenarioRunId).not.toBe(oldScenarioRunId);
    expect(podNetworkMocks.setOwnerOnlyIfPresent).toHaveBeenCalledWith(
      oldRun.resourceUrl,
      HANNAH_WEB_ID,
      expect.any(Function)
    );
    expect(accessRequestMocks.revokeAndArchiveScenarioAccess).toHaveBeenCalledWith({
      ownerWebId: HANNAH_WEB_ID,
      scenarioRunId: oldScenarioRunId,
      resourceUrl: oldRun.resourceUrl,
      fetcher: expect.any(Function),
    });
    expect(catalogMocks.removeCatalogEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        datasetIdentifier: oldRun.datasetIdentifier,
        catalogDatasetUrl: oldRun.catalogDatasetUrl,
      })
    );
    expect(podNetworkMocks.deleteActivity).toHaveBeenCalledWith(
      podRoot,
      podStateWithTwoActivities.activities[0].id,
      '"activity-v1"',
      expect.any(Function)
    );
    expect(podNetworkMocks.saveRunSnapshot).toHaveBeenCalledWith(
      podRoot,
      newScenarioRunId,
      expect.objectContaining({
        type: "FeatureCollection",
        properties: expect.objectContaining({ activityCount: 1 }),
        features: [
          expect.objectContaining({
            properties: expect.objectContaining({ activityType: "cycling" }),
          }),
        ],
      }),
      HANNAH_WEB_ID,
      expect.any(Function)
    );
    const publishedPayload = podNetworkMocks.saveRunSnapshot.mock.calls[0][2];
    expect(JSON.stringify(publishedPayload)).not.toContain(
      podStateWithTwoActivities.activities[0].id
    );
    expect(JSON.stringify(publishedPayload)).not.toContain(
      podStateWithTwoActivities.activities[0].name
    );
    expect(catalogMocks.publishCatalogEntry).toHaveBeenCalledWith(
      expect.objectContaining({ scenarioRunId: newScenarioRunId })
    );
    expect(podNetworkMocks.writePublishedMarker).toHaveBeenCalledWith(
      podRoot,
      expect.objectContaining({ scenarioRunId: newScenarioRunId }),
      HANNAH_WEB_ID,
      expect.any(Function)
    );
    expect(persistedState).toEqual(
      expect.objectContaining({
        activities: [podStateWithTwoActivities.activities[1]],
        activeRun: expect.objectContaining({
          phase: "published",
          scenarioRunId: newScenarioRunId,
          activityIds: [podStateWithTwoActivities.activities[1].id],
        }),
      })
    );

    const oldCleanupOrder = [
      podNetworkMocks.setOwnerOnlyIfPresent,
      podNetworkMocks.clearPublishedMarker,
      accessRequestMocks.revokeAndArchiveScenarioAccess,
      catalogMocks.removeCatalogEntry,
      podNetworkMocks.safeDeleteContainer,
    ].map((mock) => mock.mock.invocationCallOrder[0]);
    expect(Math.max(...oldCleanupOrder)).toBeLessThan(
      podNetworkMocks.deleteActivity.mock.invocationCallOrder[0]
    );
    expect(podNetworkMocks.deleteActivity.mock.invocationCallOrder[0]).toBeLessThan(
      podNetworkMocks.saveRunSnapshot.mock.invocationCallOrder[0]
    );
  });

  it("aborts before mutation when the Pod state has no strong ETag", async () => {
    const podRoot = "https://solid-community-server.tmdt.info/sscon/";
    const managerFetch = vi.fn(async () => new Response(null, { status: 204 }));
    podNetworkMocks.resolvePodRoot.mockResolvedValue(podRoot);
    podNetworkMocks.ensureStorage.mockResolvedValue(undefined);
    podNetworkMocks.loadState.mockResolvedValue(localStateWithActivity);
    podNetworkMocks.loadStateSnapshot.mockResolvedValue({
      state: localStateWithActivity,
      etag: null,
    });

    act(() =>
      root.render(
        createElement(SolidToursEmbed, {
          webId: HANNAH_WEB_ID,
          demoWebId: HANNAH_WEB_ID,
          session: {
            info: { isLoggedIn: true, webId: HANNAH_WEB_ID },
            fetch: managerFetch,
          },
        })
      )
    );
    await waitForDom(() => {
      expect(container.querySelector(".activity-delete")).not.toBeNull();
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".activity-delete")!.click();
    });
    await confirmDeleteDialog(container);

    await waitForDom(() => {
      expect(container.querySelector(".map-error-overlay")?.textContent).toContain(
        "keinen starken Versionsnachweis"
      );
    });
    expect(podNetworkMocks.saveStateIfUnchanged).not.toHaveBeenCalled();
    expect(podNetworkMocks.deleteActivity).not.toHaveBeenCalled();
    expect(container.querySelectorAll(".activity-item")).toHaveLength(1);
  });

  it("aborts when the targeted activity changed in the Pod since it was rendered", async () => {
    const podRoot = "https://solid-community-server.tmdt.info/sscon/";
    const managerFetch = vi.fn(async () => new Response(null, { status: 204 }));
    const changedState = {
      ...localStateWithActivity,
      activities: [
        { ...localStateWithActivity.activities[0], name: "Remote geänderte Tour" },
      ],
    };
    podNetworkMocks.resolvePodRoot.mockResolvedValue(podRoot);
    podNetworkMocks.ensureStorage.mockResolvedValue(undefined);
    podNetworkMocks.loadState.mockResolvedValue(localStateWithActivity);
    podNetworkMocks.loadStateSnapshot.mockResolvedValue({
      state: changedState,
      etag: '"state-v2"',
    });

    act(() =>
      root.render(
        createElement(SolidToursEmbed, {
          webId: HANNAH_WEB_ID,
          demoWebId: HANNAH_WEB_ID,
          session: {
            info: { isLoggedIn: true, webId: HANNAH_WEB_ID },
            fetch: managerFetch,
          },
        })
      )
    );
    await waitForDom(() => {
      expect(container.querySelector(".activity-delete")).not.toBeNull();
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".activity-delete")!.click();
    });
    await confirmDeleteDialog(container);

    await waitForDom(() => {
      expect(container.querySelector(".map-error-overlay")?.textContent).toContain(
        "zwischenzeitlich verändert"
      );
      expect(container.querySelector(".activity-item")?.textContent).toContain(
        "Remote geänderte Tour"
      );
    });
    expect(podNetworkMocks.saveStateIfUnchanged).not.toHaveBeenCalled();
    expect(podNetworkMocks.deleteActivity).not.toHaveBeenCalled();
  });

  it("surfaces a critical fail-closed rollback error after an auth switch without touching the new identity", async () => {
    const podRoot = "https://solid-community-server.tmdt.info/sscon/";
    const managerFetch = vi.fn(async () => new Response(null, { status: 204 }));
    const otherFetch = vi.fn(async () => new Response(null, { status: 204 }));
    let rejectDelete!: (reason: unknown) => void;
    const pendingDelete = new Promise<void>((_resolve, reject) => {
      rejectDelete = reject;
    });
    podNetworkMocks.resolvePodRoot.mockResolvedValue(podRoot);
    podNetworkMocks.ensureStorage.mockResolvedValue(undefined);
    podNetworkMocks.loadState.mockResolvedValue(localStateWithActivity);
    podNetworkMocks.loadStateSnapshot.mockResolvedValue({
      state: localStateWithActivity,
      etag: '"state-v1"',
    });
    podNetworkMocks.saveStateIfUnchanged.mockResolvedValue({
      state: { ...localStateWithActivity, activities: [] },
      etag: '"state-v2"',
    });
    podNetworkMocks.loadActivityMasterSnapshot
      .mockResolvedValueOnce({ etag: '"activity-v1"' })
      .mockRejectedValueOnce(new Error("Master verification failed"));
    podNetworkMocks.deleteActivity.mockReturnValue(pendingDelete);
    podNetworkMocks.activityMasterExists.mockRejectedValue(new TypeError("HEAD unavailable"));

    act(() =>
      root.render(
        createElement(SolidToursEmbed, {
          webId: HANNAH_WEB_ID,
          demoWebId: HANNAH_WEB_ID,
          session: {
            info: { isLoggedIn: true, webId: HANNAH_WEB_ID },
            fetch: managerFetch,
          },
        })
      )
    );
    await waitForDom(() => {
      expect(container.querySelector(".activity-delete")).not.toBeNull();
    });
    act(() => {
      container.querySelector<HTMLButtonElement>(".activity-delete")!.click();
    });
    await confirmDeleteDialog(container);
    await waitForDom(() => {
      expect(podNetworkMocks.deleteActivity).toHaveBeenCalledOnce();
    });

    act(() =>
      root.render(
        createElement(SolidToursEmbed, {
          webId: NON_HANNAH_WEB_ID,
          demoWebId: HANNAH_WEB_ID,
          session: {
            info: { isLoggedIn: true, webId: NON_HANNAH_WEB_ID },
            fetch: otherFetch,
          },
        })
      )
    );
    await act(async () => {
      rejectDelete(new TypeError("DELETE response lost"));
      await pendingDelete.catch(() => undefined);
    });

    await waitForDom(() => {
      expect(container.querySelector(".map-error-overlay")?.textContent).toContain(
        "fail-closed ohne Aktivitätsverweis belassen"
      );
    });
    expect(podNetworkMocks.loadActivityMasterSnapshot).toHaveBeenCalledWith(
      podRoot,
      localStateWithActivity.activities[0],
      expect.any(Function)
    );
    expect(podNetworkMocks.saveStateIfUnchanged).toHaveBeenCalledOnce();
    expect(
      window.localStorage.getItem(localStateKeyForIdentity(NON_HANNAH_WEB_ID))
    ).toBeNull();
  });

  it("shows action errors as a dismissible map overlay without reserving planner space", async () => {
    act(() =>
      root.render(
        createElement(SolidToursEmbed, {
          webId: NON_HANNAH_WEB_ID,
          demoWebId: HANNAH_WEB_ID,
        })
      )
    );

    await waitForDom(() => {
      expect(container.querySelector(".save-draft-button")).not.toBeNull();
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".save-draft-button")!.click();
    });

    await waitForDom(() => {
      expect(container.querySelector(".map-error-overlay")?.textContent).toContain(
        "Die Tour braucht mindestens zwei Punkte."
      );
    });
    const overlay = container.querySelector(".map-error-overlay")!;
    expect(overlay.getAttribute("role")).toBe("alert");
    expect(overlay.closest(".map-stage")).not.toBeNull();
    expect(container.querySelector(".tours-shell > .notice")).toBeNull();
    const close = overlay.querySelector<HTMLButtonElement>('[aria-label="Fehlermeldung schließen"]')!;
    act(() => close.click());
    expect(container.querySelector(".map-error-overlay")).toBeNull();
  });

  it("keeps the deprecated demo-WebID prop compatible without gating Pod access", async () => {
    act(() =>
      root.render(
        createElement(SolidToursEmbed, {
          webId: NON_HANNAH_WEB_ID,
          demoWebId: "not-a-webid",
        })
      )
    );

    await waitForDom(() => expect(container.querySelector(".route-workspace")).not.toBeNull());
    expect(container.querySelector(".map-error-overlay")).toBeNull();
    expect(podNetworkMocks.resolvePodRoot).toHaveBeenCalledWith(
      NON_HANNAH_WEB_ID,
      expect.any(Function)
    );
  });

  it("uses the injected Manager session fetch to resolve the user's Pod in the embed", async () => {
    const podRoot = "https://solid-community-server.tmdt.info/sscon/";
    const managerFetch = vi.fn(async () => new Response(null, { status: 204 }));
    podNetworkMocks.resolvePodRoot.mockImplementation(
      async (webId: string, fetcher: typeof fetch) => {
        await fetcher(webId);
        return podRoot;
      }
    );
    podNetworkMocks.ensureStorage.mockResolvedValue(undefined);
    podNetworkMocks.loadState.mockResolvedValue(localStateWithActivity);

    const managerSession = {
      info: { isLoggedIn: true, webId: HANNAH_WEB_ID },
      fetch: managerFetch,
    };

    act(() =>
      root.render(
        createElement(SolidToursEmbed, {
          webId: HANNAH_WEB_ID,
          demoWebId: HANNAH_WEB_ID,
          session: managerSession,
        })
      )
    );

    await waitForDom(() => {
      expect(container.querySelector(".publish")).not.toBeNull();
    });

    expect(container.textContent).toContain("Gesundheitsdatenspende freigeben");
    expect(container.querySelector(".scenario-card")).toBeNull();
    expect(container.textContent).not.toContain("Environmental Monitoring");
    expect(container.textContent).not.toContain("Bereit zum Veröffentlichen");
    expect(container.textContent).not.toContain("Aktivitätsverlauf");

    expect(managerFetch).toHaveBeenCalledWith(HANNAH_WEB_ID, undefined);
    expect(sessionMocks.fetch).not.toHaveBeenCalled();
    expect(podNetworkMocks.resolvePodRoot).toHaveBeenCalledWith(
      HANNAH_WEB_ID,
      expect.any(Function)
    );
    const injectedFetch = podNetworkMocks.resolvePodRoot.mock.calls[0][1];
    expect(podNetworkMocks.ensureStorage).toHaveBeenCalledWith(
      podRoot,
      HANNAH_WEB_ID,
      injectedFetch
    );
    expect(podNetworkMocks.loadState).toHaveBeenCalledWith(podRoot, injectedFetch);

    act(() =>
      root.render(
        createElement(SolidToursEmbed, {
          webId: HANNAH_WEB_ID,
          demoWebId: HANNAH_WEB_ID,
          session: managerSession,
        })
      )
    );
    await act(async () => Promise.resolve());

    expect(podNetworkMocks.resolvePodRoot).toHaveBeenCalledOnce();
  });

  it("pins and guards an operation fetch when the same session object switches identity", async () => {
    const podRoot = "https://solid-community-server.tmdt.info/sscon/";
    const hannahFetch = vi.fn(async () => new Response(null, { status: 204 }));
    const otherFetch = vi.fn(async () => new Response(null, { status: 204 }));
    let firstIdentityOperationFetch!: typeof fetch;
    podNetworkMocks.resolvePodRoot.mockImplementation(async (webId, fetcher) => {
      if (webId === HANNAH_WEB_ID) firstIdentityOperationFetch = fetcher;
      await fetcher(webId);
      return podRoot;
    });
    podNetworkMocks.ensureStorage.mockResolvedValue(undefined);
    podNetworkMocks.loadState.mockResolvedValue(localStateWithActivity);
    const managerSession: SolidToursSession = {
      info: { isLoggedIn: true, webId: HANNAH_WEB_ID },
      fetch: hannahFetch,
    };

    act(() =>
      root.render(
        createElement(SolidToursEmbed, {
          webId: HANNAH_WEB_ID,
          demoWebId: HANNAH_WEB_ID,
          session: managerSession,
        })
      )
    );
    await waitForDom(() => expect(container.querySelector(".publish")).not.toBeNull());

    managerSession.info = { isLoggedIn: true, webId: NON_HANNAH_WEB_ID };
    managerSession.fetch = otherFetch;
    act(() =>
      root.render(
        createElement(SolidToursEmbed, {
          webId: NON_HANNAH_WEB_ID,
          demoWebId: HANNAH_WEB_ID,
          session: managerSession,
        })
      )
    );
    await act(async () => Promise.resolve());

    await expect(firstIdentityOperationFetch(`${podRoot}solid-tours/state.json`)).rejects.toThrow(
      /Solid-Sitzung hat sich geaendert/
    );
    expect(hannahFetch).toHaveBeenCalledOnce();
    expect(otherFetch).toHaveBeenCalledOnce();
  });

  it("allows only one of two parallel tabs past the publish-intent reservation", async () => {
    const podRoot = "https://solid-community-server.tmdt.info/sscon/";
    const firstFetch = vi.fn(async () => new Response(null, { status: 204 }));
    const secondFetch = vi.fn(async () => new Response(null, { status: 204 }));
    let authoritativeState: typeof podStateWithTwoActivities & { activeRun: ActiveRun | null } = {
      ...podStateWithTwoActivities,
      activeRun: null,
    };
    podNetworkMocks.resolvePodRoot.mockResolvedValue(podRoot);
    podNetworkMocks.ensureStorage.mockResolvedValue(undefined);
    podNetworkMocks.loadState.mockResolvedValue(podStateWithTwoActivities);
    podNetworkMocks.saveState.mockImplementation(async (_root, nextState) => {
      if (authoritativeState.activeRun) {
        throw new StateConflictError("publish intent already reserved");
      }
      authoritativeState = nextState;
    });
    podNetworkMocks.saveRunSnapshot.mockImplementation(async (_root, scenarioRunId) => {
      const runContainerUrl = `${podRoot}solid-tours/runs/${scenarioRunId}/`;
      return {
        resourceUrl: `${runContainerUrl}activity.geojson`,
        manifestUrl: `${runContainerUrl}manifest.ttl`,
        runContainerUrl,
      };
    });
    catalogMocks.publishCatalogEntry.mockImplementation(async ({ scenarioRunId }) => {
      const datasetIdentifier = `solid-tours-activity-${scenarioRunId}`;
      return {
        datasetIdentifier,
        catalogDatasetUrl: `${podRoot}catalog/ds/${datasetIdentifier}.ttl#it`,
      };
    });
    podNetworkMocks.writePublishedMarker.mockResolvedValue(undefined);
    podNetworkMocks.saveStateIfUnchanged.mockImplementation(async (_root, nextState) => {
      authoritativeState = nextState;
      return { state: nextState, etag: '"state-published"' };
    });
    podNetworkMocks.loadStateSnapshot.mockImplementation(async () => ({
      state: authoritativeState,
      etag: '"state-reserved"',
    }));

    const secondContainer = document.createElement("div");
    document.body.append(secondContainer);
    const secondRoot = createRoot(secondContainer);
    try {
      act(() => {
        root.render(
          createElement(SolidToursEmbed, {
            webId: HANNAH_WEB_ID,
            demoWebId: HANNAH_WEB_ID,
            session: {
              info: { isLoggedIn: true, webId: HANNAH_WEB_ID },
              fetch: firstFetch,
            },
          })
        );
        secondRoot.render(
          createElement(SolidToursEmbed, {
            webId: HANNAH_WEB_ID,
            demoWebId: HANNAH_WEB_ID,
            session: {
              info: { isLoggedIn: true, webId: HANNAH_WEB_ID },
              fetch: secondFetch,
            },
          })
        );
      });
      await waitForDom(() => {
        expect(container.querySelector(".publish")).not.toBeNull();
        expect(secondContainer.querySelector(".publish")).not.toBeNull();
      });

      act(() => {
        container.querySelector<HTMLButtonElement>(".publish")!.click();
        secondContainer.querySelector<HTMLButtonElement>(".publish")!.click();
      });
      await waitForDom(() => {
        expect(catalogMocks.publishCatalogEntry).toHaveBeenCalledOnce();
        expect(podNetworkMocks.writePublishedMarker).toHaveBeenCalledOnce();
        expect(podNetworkMocks.clearPublishedMarker).toHaveBeenCalledOnce();
      });

      const winnerRunId = podNetworkMocks.saveState.mock.calls[0]?.[1].activeRun.scenarioRunId;
      const loserRunId = podNetworkMocks.saveState.mock.calls[1]?.[1].activeRun.scenarioRunId;
      expect(winnerRunId).not.toBe(loserRunId);
      expect(podNetworkMocks.saveRunSnapshot).toHaveBeenCalledOnce();
      expect(podNetworkMocks.saveRunSnapshot).toHaveBeenCalledWith(
        podRoot,
        winnerRunId,
        expect.anything(),
        HANNAH_WEB_ID,
        expect.any(Function)
      );
      expect(catalogMocks.publishCatalogEntry).toHaveBeenCalledWith(
        expect.objectContaining({ scenarioRunId: winnerRunId })
      );
      expect(podNetworkMocks.clearPublishedMarker).toHaveBeenCalledWith(
        podRoot,
        loserRunId,
        expect.any(Function)
      );
      expect(catalogMocks.removeCatalogEntry).not.toHaveBeenCalled();
      expect(podNetworkMocks.saveStateIfUnchanged).toHaveBeenCalledOnce();
      expect(podNetworkMocks.saveStateIfUnchanged).toHaveBeenCalledWith(
        podRoot,
        expect.objectContaining({
          activeRun: expect.objectContaining({
            scenarioRunId: winnerRunId,
            phase: "published",
          }),
        }),
        '"state-reserved"',
        HANNAH_WEB_ID,
        expect.any(Function)
      );
      expect(podNetworkMocks.saveState.mock.invocationCallOrder[0]).toBeLessThan(
        catalogMocks.publishCatalogEntry.mock.invocationCallOrder[0]
      );
    } finally {
      act(() => secondRoot.unmount());
      secondContainer.remove();
    }
  });

  it("fences a late publisher behind reset and leaves no ghost before the next publish", async () => {
    const podRoot = "https://solid-community-server.tmdt.info/sscon/";
    const firstFetch = vi.fn(async () => new Response(null, { status: 204 }));
    const resetFetch = vi.fn(async () => new Response(null, { status: 204 }));
    let authoritativeState: typeof podStateWithTwoActivities & { activeRun: ActiveRun | null } = {
      ...podStateWithTwoActivities,
      activeRun: null,
    };
    const authoritativeRun = () => authoritativeState.activeRun as unknown as ActiveRun | null;
    let stateVersion = 1;
    let markerRunId: string | null = null;
    let catalogRunId: string | null = null;
    let releaseFirstCatalog!: () => void;
    const firstCatalogGate = new Promise<void>((resolve) => {
      releaseFirstCatalog = resolve;
    });
    let catalogPublishCount = 0;

    podNetworkMocks.resolvePodRoot.mockResolvedValue(podRoot);
    podNetworkMocks.ensureStorage.mockResolvedValue(undefined);
    podNetworkMocks.loadState.mockImplementation(async () => authoritativeState);
    podNetworkMocks.loadStateSnapshot.mockImplementation(async () => ({
      state: authoritativeState,
      etag: `"state-v${stateVersion}"`,
    }));
    podNetworkMocks.saveState.mockImplementation(async (_root, nextState) => {
      if (authoritativeState.activeRun) {
        throw new StateConflictError("publish intent already reserved");
      }
      authoritativeState = nextState;
      stateVersion += 1;
    });
    podNetworkMocks.saveStateIfUnchanged.mockImplementation(
      async (_root, nextState, expectedEtag) => {
        if (expectedEtag !== `"state-v${stateVersion}"`) {
          throw new StateConflictError("phase fence changed");
        }
        authoritativeState = nextState;
        stateVersion += 1;
        return { state: nextState, etag: `"state-v${stateVersion}"` };
      }
    );
    podNetworkMocks.saveRunSnapshot.mockImplementation(async (_root, scenarioRunId) => {
      const runContainerUrl = `${podRoot}solid-tours/runs/${scenarioRunId}/`;
      return {
        resourceUrl: `${runContainerUrl}activity.geojson`,
        manifestUrl: `${runContainerUrl}manifest.ttl`,
        runContainerUrl,
      };
    });
    catalogMocks.publishCatalogEntry.mockImplementation(async ({ scenarioRunId }) => {
      catalogPublishCount += 1;
      if (catalogPublishCount === 1) await firstCatalogGate;
      catalogRunId = scenarioRunId;
      const datasetIdentifier = `solid-tours-activity-${scenarioRunId}`;
      return {
        datasetIdentifier,
        catalogDatasetUrl: `${podRoot}catalog/ds/${datasetIdentifier}.ttl#it`,
      };
    });
    catalogMocks.removeCatalogEntry.mockImplementation(async ({ datasetIdentifier }) => {
      const scenarioRunId = String(datasetIdentifier).replace("solid-tours-activity-", "");
      if (catalogRunId === scenarioRunId) catalogRunId = null;
    });
    podNetworkMocks.writePublishedMarker.mockImplementation(async (_root, value) => {
      markerRunId = value.scenarioRunId;
    });
    podNetworkMocks.clearPublishedMarker.mockImplementation(
      async (_root, expectedScenarioRunId) => {
        if (markerRunId === expectedScenarioRunId) markerRunId = null;
      }
    );

    const resetContainer = document.createElement("div");
    document.body.append(resetContainer);
    const resetRoot = createRoot(resetContainer);
    try {
      act(() =>
        root.render(
          createElement(SolidToursEmbed, {
            webId: HANNAH_WEB_ID,
            demoWebId: HANNAH_WEB_ID,
            session: {
              info: { isLoggedIn: true, webId: HANNAH_WEB_ID },
              fetch: firstFetch,
            },
          })
        )
      );
      await waitForDom(() => expect(container.querySelector(".publish")).not.toBeNull());
      act(() => container.querySelector<HTMLButtonElement>(".publish")!.click());
      await waitForDom(() => expect(catalogMocks.publishCatalogEntry).toHaveBeenCalledOnce());

      const firstRunId = authoritativeRun()!.scenarioRunId;
      expect(authoritativeRun()?.phase).toBe("publishing");
      act(() =>
        resetRoot.render(
          createElement(SolidToursEmbed, {
            webId: HANNAH_WEB_ID,
            demoWebId: HANNAH_WEB_ID,
            session: {
              info: { isLoggedIn: true, webId: HANNAH_WEB_ID },
              fetch: resetFetch,
            },
          })
        )
      );
      await waitForDom(() => expect(resetContainer.querySelector(".danger")).not.toBeNull());
      await act(async () => resetContainer.querySelector<HTMLButtonElement>(".danger")!.click());
      await waitForDom(() => {
        expect(authoritativeState.activeRun).toBeNull();
        expect(resetContainer.querySelector(".publish")).not.toBeNull();
      });
      expect(podNetworkMocks.saveStateIfUnchanged.mock.calls[0]?.[1].activeRun.phase).toBe(
        "resetting"
      );
      expect(podNetworkMocks.saveStateIfUnchanged.mock.invocationCallOrder[0]).toBeLessThan(
        podNetworkMocks.setOwnerOnlyIfPresent.mock.invocationCallOrder[0]
      );

      await act(async () => {
        releaseFirstCatalog();
        await firstCatalogGate;
      });
      await waitForDom(() => {
        expect(markerRunId).toBeNull();
        expect(catalogRunId).toBeNull();
        expect(container.querySelector(".map-error-overlay")).not.toBeNull();
      });
      expect(authoritativeState.activeRun).toBeNull();
      expect(podNetworkMocks.clearPublishedMarker).toHaveBeenCalledWith(
        podRoot,
        firstRunId,
        expect.any(Function)
      );

      await act(async () => resetContainer.querySelector<HTMLButtonElement>(".publish")!.click());
      await waitForDom(() => {
        expect(authoritativeRun()?.phase).toBe("published");
        expect(catalogMocks.publishCatalogEntry).toHaveBeenCalledTimes(2);
      });
      const nextRunId = authoritativeRun()!.scenarioRunId;
      expect(nextRunId).not.toBe(firstRunId);
      expect(markerRunId).toBe(nextRunId);
      expect(catalogRunId).toBe(nextRunId);
    } finally {
      act(() => resetRoot.unmount());
      resetContainer.remove();
    }
  });

  it("adopts fresh Pod state without inventing a recovery run after a fully rolled-back publish CAS conflict", async () => {
    const podRoot = "https://solid-community-server.tmdt.info/sscon/";
    const managerFetch = vi.fn(async () => new Response(null, { status: 204 }));
    const remoteDraft = {
      ...localStateWithActivity.drafts[0],
      id: "8db47d3b-8a4f-4a74-b086-77c1c7630bf7",
      name: "Remote nach Publish-Konflikt",
    };
    const concurrentState = {
      ...podStateWithTwoActivities,
      drafts: [...podStateWithTwoActivities.drafts, remoteDraft],
    };
    podNetworkMocks.resolvePodRoot.mockResolvedValue(podRoot);
    podNetworkMocks.ensureStorage.mockResolvedValue(undefined);
    podNetworkMocks.loadState.mockResolvedValue(podStateWithTwoActivities);
    podNetworkMocks.loadStateSnapshot.mockResolvedValue({
      state: concurrentState,
      etag: '"state-v2"',
    });
    podNetworkMocks.saveRunSnapshot.mockImplementation(async (_root, scenarioRunId) => ({
      resourceUrl: `${podRoot}solid-tours/runs/${scenarioRunId}/activity.geojson`,
      manifestUrl: `${podRoot}solid-tours/runs/${scenarioRunId}/manifest.ttl`,
      runContainerUrl: `${podRoot}solid-tours/runs/${scenarioRunId}/`,
    }));
    catalogMocks.publishCatalogEntry.mockImplementation(async ({ scenarioRunId }) => ({
      datasetIdentifier: `solid-tours-activity-${scenarioRunId}`,
      catalogDatasetUrl: `${podRoot}catalog/ds/solid-tours-activity-${scenarioRunId}.ttl#it`,
    }));
    podNetworkMocks.saveState.mockRejectedValue(
      new StateConflictError("Der Solid-Tours-Status wurde zwischenzeitlich geändert.")
    );

    act(() =>
      root.render(
        createElement(SolidToursEmbed, {
          webId: HANNAH_WEB_ID,
          demoWebId: HANNAH_WEB_ID,
          session: {
            info: { isLoggedIn: true, webId: HANNAH_WEB_ID },
            fetch: managerFetch,
          },
        })
      )
    );
    await waitForDom(() => expect(container.querySelector(".publish")).not.toBeNull());
    await act(async () => container.querySelector<HTMLButtonElement>(".publish")!.click());

    await waitForDom(() => {
      expect(container.querySelector(".map-error-overlay")?.textContent).toContain(
        "vollständig zurückgerollt"
      );
      expect(container.textContent).toContain("Remote nach Publish-Konflikt");
    });
    expect(container.querySelector(".danger")).toBeNull();
    expect(podNetworkMocks.saveState).toHaveBeenCalledOnce();
    expect(podNetworkMocks.saveStateIfUnchanged).not.toHaveBeenCalled();
  });

  it("clears the exact persisted run after marker failure and reports a complete rollback", async () => {
    const podRoot = "https://solid-community-server.tmdt.info/sscon/";
    const managerFetch = vi.fn(async () => new Response(null, { status: 204 }));
    let persistedState: typeof podStateWithTwoActivities & { activeRun: ActiveRun | null } = {
      ...podStateWithTwoActivities,
      activeRun: null,
    };
    podNetworkMocks.resolvePodRoot.mockResolvedValue(podRoot);
    podNetworkMocks.ensureStorage.mockResolvedValue(undefined);
    podNetworkMocks.loadState.mockResolvedValue(podStateWithTwoActivities);
    podNetworkMocks.saveRunSnapshot.mockImplementation(async (_root, scenarioRunId) => ({
      resourceUrl: `${podRoot}solid-tours/runs/${scenarioRunId}/activity.geojson`,
      manifestUrl: `${podRoot}solid-tours/runs/${scenarioRunId}/manifest.ttl`,
      runContainerUrl: `${podRoot}solid-tours/runs/${scenarioRunId}/`,
    }));
    catalogMocks.publishCatalogEntry.mockImplementation(async ({ scenarioRunId }) => ({
      datasetIdentifier: `solid-tours-activity-${scenarioRunId}`,
      catalogDatasetUrl: `${podRoot}catalog/ds/solid-tours-activity-${scenarioRunId}.ttl#it`,
    }));
    podNetworkMocks.saveState.mockImplementation(async (_root, nextState) => {
      persistedState = nextState;
    });
    podNetworkMocks.writePublishedMarker.mockRejectedValue(new TypeError("marker PUT failed"));
    podNetworkMocks.loadStateSnapshot.mockImplementation(async () => ({
      state: persistedState,
      etag: '"state-v2"',
    }));
    podNetworkMocks.saveStateIfUnchanged.mockImplementation(
      async (_root, nextState) => ({ state: nextState, etag: '"state-v3"' })
    );

    act(() =>
      root.render(
        createElement(SolidToursEmbed, {
          webId: HANNAH_WEB_ID,
          demoWebId: HANNAH_WEB_ID,
          session: {
            info: { isLoggedIn: true, webId: HANNAH_WEB_ID },
            fetch: managerFetch,
          },
        })
      )
    );
    await waitForDom(() => expect(container.querySelector(".publish")).not.toBeNull());
    await act(async () => container.querySelector<HTMLButtonElement>(".publish")!.click());

    await waitForDom(() => {
      expect(container.querySelector(".map-error-overlay")?.textContent).toContain(
        "vollständig zurückgerollt"
      );
    });
    expect(podNetworkMocks.saveStateIfUnchanged).toHaveBeenCalledWith(
      podRoot,
      expect.objectContaining({ activeRun: null }),
      '"state-v2"',
      HANNAH_WEB_ID,
      expect.any(Function)
    );
    expect(container.querySelector(".danger")).toBeNull();
    expect(container.querySelector(".publish")).not.toBeNull();
  });

  it("retries partial response-loss recovery with fresh CAS state and deterministic Catalog cleanup", async () => {
    const podRoot = "https://solid-community-server.tmdt.info/sscon/";
    const managerFetch = vi.fn(async () => new Response(null, { status: 204 }));
    let scenarioRunId = "";
    const remoteDraftOne = {
      ...podStateWithTwoActivities.drafts[0],
      id: "7a64c06e-793f-4ab2-85af-fb8bfbd7ae77",
      name: "Parallel eins",
    };
    const remoteDraftTwo = {
      ...podStateWithTwoActivities.drafts[0],
      id: "6c2ca7cf-acde-4fc4-8ab0-96c116088097",
      name: "Parallel zwei",
    };
    const concurrentOne = {
      ...podStateWithTwoActivities,
      drafts: [...podStateWithTwoActivities.drafts, remoteDraftOne],
    };
    const concurrentTwo = {
      ...concurrentOne,
      drafts: [...concurrentOne.drafts, remoteDraftTwo],
    };
    podNetworkMocks.resolvePodRoot.mockResolvedValue(podRoot);
    podNetworkMocks.ensureStorage.mockResolvedValue(undefined);
    podNetworkMocks.loadState.mockResolvedValue(podStateWithTwoActivities);
    podNetworkMocks.saveRunSnapshot.mockImplementation(async (_root, runId) => {
      scenarioRunId = runId;
      const runContainerUrl = `${podRoot}solid-tours/runs/${runId}/`;
      return {
        resourceUrl: `${runContainerUrl}activity.geojson`,
        manifestUrl: `${runContainerUrl}manifest.ttl`,
        runContainerUrl,
      };
    });
    catalogMocks.publishCatalogEntry.mockRejectedValue(new TypeError("publish response lost"));
    catalogMocks.removeCatalogEntry.mockRejectedValue(new TypeError("Catalog cleanup unavailable"));
    podNetworkMocks.loadStateSnapshot
      .mockResolvedValueOnce({ state: podStateWithTwoActivities, etag: '"state-v2"' })
      .mockResolvedValueOnce({ state: concurrentOne, etag: '"state-v3"' })
      .mockResolvedValueOnce({ state: concurrentTwo, etag: '"state-v4"' });
    podNetworkMocks.saveStateIfUnchanged
      .mockRejectedValueOnce(new StateConflictError("parallel edit one"))
      .mockRejectedValueOnce(new StateConflictError("parallel edit two"))
      .mockImplementationOnce(async (_root, nextState) => ({
        state: nextState,
        etag: '"state-v5"',
      }));

    act(() =>
      root.render(
        createElement(SolidToursEmbed, {
          webId: HANNAH_WEB_ID,
          demoWebId: HANNAH_WEB_ID,
          session: {
            info: { isLoggedIn: true, webId: HANNAH_WEB_ID },
            fetch: managerFetch,
          },
        })
      )
    );
    await waitForDom(() => expect(container.querySelector(".publish")).not.toBeNull());
    await act(async () => container.querySelector<HTMLButtonElement>(".publish")!.click());

    await waitForDom(() => {
      expect(container.querySelector(".map-error-overlay")?.textContent).toContain("unvollst");
      expect(container.querySelector(".danger")).not.toBeNull();
    });
    const datasetIdentifier = `solid-tours-activity-${scenarioRunId}`;
    expect(catalogMocks.removeCatalogEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        datasetIdentifier,
        catalogDatasetUrl: `${podRoot}catalog/ds/${datasetIdentifier}.ttl#it`,
      })
    );
    expect(podNetworkMocks.clearPublishedMarker).toHaveBeenCalledWith(
      podRoot,
      scenarioRunId,
      expect.any(Function)
    );
    expect(podNetworkMocks.safeDelete).not.toHaveBeenCalled();
    expect(podNetworkMocks.saveStateIfUnchanged).toHaveBeenCalledTimes(3);
    expect(podNetworkMocks.saveStateIfUnchanged.mock.calls[2]?.[1]).toEqual(
      expect.objectContaining({
        drafts: concurrentTwo.drafts,
        activeRun: expect.objectContaining({ scenarioRunId, datasetIdentifier }),
      })
    );
  });

  it("rolls back its own marker when authoritative state changed after the marker write", async () => {
    const podRoot = "https://solid-community-server.tmdt.info/sscon/";
    const managerFetch = vi.fn(async () => new Response(null, { status: 204 }));
    const otherRunId = "7a64c06e-793f-4ab2-85af-fb8bfbd7ae77";
    const otherRunContainerUrl = `${podRoot}solid-tours/runs/${otherRunId}/`;
    const otherDatasetIdentifier = `solid-tours-activity-${otherRunId}`;
    const otherState = {
      ...podStateWithTwoActivities,
      activeRun: {
        scenarioRunId: otherRunId,
        activityIds: podStateWithTwoActivities.activities.map((activity) => activity.id),
        resourceUrl: `${otherRunContainerUrl}activity.geojson`,
        manifestUrl: `${otherRunContainerUrl}manifest.ttl`,
        runContainerUrl: otherRunContainerUrl,
        datasetIdentifier: otherDatasetIdentifier,
        catalogDatasetUrl: `${podRoot}catalog/ds/${otherDatasetIdentifier}.ttl#it`,
        publishedAt: "2026-08-21T12:00:00.000Z",
      },
    };
    let ownRunId = "";
    podNetworkMocks.resolvePodRoot.mockResolvedValue(podRoot);
    podNetworkMocks.ensureStorage.mockResolvedValue(undefined);
    podNetworkMocks.loadState.mockResolvedValue(podStateWithTwoActivities);
    podNetworkMocks.saveRunSnapshot.mockImplementation(async (_root, scenarioRunId) => {
      ownRunId = scenarioRunId;
      const runContainerUrl = `${podRoot}solid-tours/runs/${scenarioRunId}/`;
      return {
        resourceUrl: `${runContainerUrl}activity.geojson`,
        manifestUrl: `${runContainerUrl}manifest.ttl`,
        runContainerUrl,
      };
    });
    catalogMocks.publishCatalogEntry.mockImplementation(async ({ scenarioRunId }) => {
      const datasetIdentifier = `solid-tours-activity-${scenarioRunId}`;
      return {
        datasetIdentifier,
        catalogDatasetUrl: `${podRoot}catalog/ds/${datasetIdentifier}.ttl#it`,
      };
    });
    podNetworkMocks.saveState.mockResolvedValue(undefined);
    podNetworkMocks.writePublishedMarker.mockResolvedValue(undefined);
    podNetworkMocks.loadStateSnapshot.mockResolvedValue({
      state: otherState,
      etag: '"state-other"',
    });

    act(() =>
      root.render(
        createElement(SolidToursEmbed, {
          webId: HANNAH_WEB_ID,
          demoWebId: HANNAH_WEB_ID,
          session: {
            info: { isLoggedIn: true, webId: HANNAH_WEB_ID },
            fetch: managerFetch,
          },
        })
      )
    );
    await waitForDom(() => expect(container.querySelector(".publish")).not.toBeNull());
    await act(async () => container.querySelector<HTMLButtonElement>(".publish")!.click());

    await waitForDom(() => expect(container.querySelector(".danger")).not.toBeNull());
    expect(podNetworkMocks.writePublishedMarker).toHaveBeenCalledOnce();
    expect(podNetworkMocks.clearPublishedMarker).toHaveBeenCalledWith(
      podRoot,
      ownRunId,
      expect.any(Function)
    );
    expect(podNetworkMocks.saveStateIfUnchanged).not.toHaveBeenCalled();
  });

  it("publishes all completed Hannah activities through one bulk health-data donation action", async () => {
    const podRoot = "https://solid-community-server.tmdt.info/sscon/";
    const managerFetch = vi.fn(async () => new Response(null, { status: 204 }));
    let resourceUrl = "";
    let manifestUrl = "";
    let runContainerUrl = "";
    let catalogDatasetUrl = "";
    let committedState: (typeof podStateWithTwoActivities & { activeRun: ActiveRun }) | null = null;

    podNetworkMocks.resolvePodRoot.mockResolvedValue(podRoot);
    podNetworkMocks.ensureStorage.mockResolvedValue(undefined);
    podNetworkMocks.loadState.mockResolvedValue(podStateWithTwoActivities);
    podNetworkMocks.saveRunSnapshot.mockImplementation(async (_root, scenarioRunId) => {
      runContainerUrl = `${podRoot}solid-tours/runs/${scenarioRunId}/`;
      resourceUrl = `${runContainerUrl}activity.geojson`;
      manifestUrl = `${runContainerUrl}manifest.ttl`;
      return { resourceUrl, manifestUrl, runContainerUrl };
    });
    podNetworkMocks.saveState.mockImplementation(async (_root, nextState) => {
      committedState = nextState;
    });
    podNetworkMocks.loadStateSnapshot.mockImplementation(async () => ({
      state: committedState!,
      etag: '"state-v2"',
    }));
    podNetworkMocks.writePublishedMarker.mockResolvedValue(undefined);
    catalogMocks.publishCatalogEntry.mockImplementation(async ({ scenarioRunId }) => {
      const datasetIdentifier = `solid-tours-activity-${scenarioRunId}`;
      catalogDatasetUrl = `${podRoot}catalog/ds/${datasetIdentifier}.ttl#it`;
      return { datasetIdentifier, catalogDatasetUrl };
    });

    act(() =>
      root.render(
        createElement(SolidToursEmbed, {
          webId: HANNAH_WEB_ID,
          demoWebId: HANNAH_WEB_ID,
          session: {
            info: { isLoggedIn: true, webId: HANNAH_WEB_ID },
            fetch: managerFetch,
          },
        })
      )
    );

    await waitForDom(() => {
      expect(container.querySelector<HTMLButtonElement>(".publish")?.textContent).toBe(
        "Gesundheitsdatenspende freigeben"
      );
    });

    expect(container.querySelectorAll(".activity-item")).toHaveLength(2);
    expect(container.querySelectorAll(".publish")).toHaveLength(1);
    expect(container.querySelector(".activity-item .publish")).toBeNull();
    expect(container.querySelector(".health-donation-actions > .publish")).not.toBeNull();

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".publish")!.click();
    });

    await waitForDom(() => {
      expect(podNetworkMocks.writePublishedMarker).toHaveBeenCalledOnce();
    });

    expect(podNetworkMocks.saveRunSnapshot).toHaveBeenCalledWith(
      podRoot,
      expect.stringMatching(/^[0-9a-f-]{36}$/),
      expect.objectContaining({
        type: "FeatureCollection",
        properties: expect.objectContaining({
          schemaVersion: "3.0",
          source: "solid-tours",
          donationScope: "all-completed-activities",
          activityCount: 2,
        }),
        features: expect.arrayContaining([
          expect.objectContaining({
            properties: expect.objectContaining({ activityType: "walking" }),
          }),
          expect.objectContaining({
            properties: expect.objectContaining({ activityType: "cycling" }),
          }),
        ]),
      }),
      HANNAH_WEB_ID,
      expect.any(Function)
    );
    expect(catalogMocks.publishCatalogEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        podRoot,
        webId: HANNAH_WEB_ID,
        resourceUrl,
        fetcher: expect.any(Function),
      })
    );
    expect(podNetworkMocks.saveState).toHaveBeenCalledWith(
      podRoot,
      expect.objectContaining({
        activeRun: expect.objectContaining({
          activityIds: podStateWithTwoActivities.activities.map((activity) => activity.id),
          catalogDatasetUrl,
        }),
      }),
      podStateWithTwoActivities,
      HANNAH_WEB_ID,
      expect.any(Function)
    );
    const publishedPayload = podNetworkMocks.saveRunSnapshot.mock.calls[0][2];
    const serializedPayload = JSON.stringify(publishedPayload);
    expect(serializedPayload).not.toContain("Wuppertaler Runde");
    expect(serializedPayload).not.toContain("Nordbahntrasse");
    expect(serializedPayload).not.toContain("draftId");
    expect(serializedPayload).not.toContain("activityId");
    expect(serializedPayload).not.toContain(HANNAH_WEB_ID);
    expect(serializedPayload).not.toContain("hannah.mueller@sscon-praesentation.de");

    await waitForDom(() => {
      expect(container.querySelector(".health-donation-actions")?.textContent).toContain(
        "Gesundheitsdatenspende zurücksetzen"
      );
    });
    expect(container.querySelector(".notice")).toBeNull();
  });

  it("revokes the snapshot and removes its marker before archiving requests", async () => {
    const podRoot = "https://solid-community-server.tmdt.info/sscon/";
    const scenarioRunId = "49f3344a-e58b-4f6a-a874-84e3815620e6";
    const runContainerUrl = `${podRoot}solid-tours/runs/${scenarioRunId}/`;
    const resourceUrl = `${runContainerUrl}activity.geojson`;
    const manifestUrl = `${runContainerUrl}manifest.ttl`;
    const datasetIdentifier = `solid-tours-activity-${scenarioRunId}`;
    const catalogDatasetUrl = `${podRoot}catalog/ds/${datasetIdentifier}.ttl#it`;
    const managerFetch = vi.fn(async () => new Response(null, { status: 204 }));
    const activeState = {
      ...podStateWithTwoActivities,
      activeRun: {
        scenarioRunId,
        activityIds: podStateWithTwoActivities.activities.map((activity) => activity.id),
        resourceUrl,
        manifestUrl,
        runContainerUrl,
        datasetIdentifier,
        catalogDatasetUrl,
        publishedAt: "2026-08-21T12:00:00.000Z",
      },
    };

    podNetworkMocks.resolvePodRoot.mockResolvedValue(podRoot);
    podNetworkMocks.ensureStorage.mockResolvedValue(undefined);
    podNetworkMocks.loadState.mockResolvedValue(activeState);
    let persistedState = activeState;
    let stateVersion = 1;
    podNetworkMocks.loadStateSnapshot.mockImplementation(async () => ({
      state: persistedState,
      etag: `"state-v${stateVersion}"`,
    }));
    podNetworkMocks.saveStateIfUnchanged.mockImplementation(async (_root, nextState) => {
      persistedState = nextState;
      stateVersion += 1;
      return { state: nextState, etag: `"state-v${stateVersion}"` };
    });

    act(() =>
      root.render(
        createElement(SolidToursEmbed, {
          webId: HANNAH_WEB_ID,
          demoWebId: HANNAH_WEB_ID,
          session: {
            info: { isLoggedIn: true, webId: HANNAH_WEB_ID },
            fetch: managerFetch,
          },
        })
      )
    );

    await waitForDom(() => {
      expect(container.querySelector<HTMLButtonElement>(".danger")?.textContent).toBe(
        "Gesundheitsdatenspende zurücksetzen"
      );
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>(".danger")!.click();
    });

    await waitForDom(() => {
      expect(podNetworkMocks.saveStateIfUnchanged).toHaveBeenLastCalledWith(
        podRoot,
        expect.objectContaining({
          activities: podStateWithTwoActivities.activities,
          activeRun: null,
        }),
        '"state-v2"',
        HANNAH_WEB_ID,
        expect.any(Function)
      );
    });

    expect(podNetworkMocks.setOwnerOnlyIfPresent).toHaveBeenCalledWith(
      resourceUrl,
      HANNAH_WEB_ID,
      expect.any(Function)
    );
    expect(accessRequestMocks.revokeAndArchiveScenarioAccess).toHaveBeenCalledWith({
      ownerWebId: HANNAH_WEB_ID,
      scenarioRunId,
      resourceUrl,
      fetcher: expect.any(Function),
    });
    expect(podNetworkMocks.clearPublishedMarker).toHaveBeenCalledWith(
      podRoot,
      scenarioRunId,
      expect.any(Function)
    );
    expect(catalogMocks.removeCatalogEntry).toHaveBeenCalledWith(
      expect.objectContaining({ datasetIdentifier, catalogDatasetUrl })
    );
    expect(podNetworkMocks.safeDelete).toHaveBeenNthCalledWith(
      1,
      manifestUrl,
      expect.any(Function)
    );
    expect(podNetworkMocks.safeDelete).toHaveBeenNthCalledWith(
      2,
      resourceUrl,
      expect.any(Function)
    );
    expect(podNetworkMocks.safeDeleteContainer).toHaveBeenCalledWith(
      runContainerUrl,
      expect.any(Function)
    );

    const cleanupOrder = [
      podNetworkMocks.setOwnerOnlyIfPresent,
      podNetworkMocks.clearPublishedMarker,
      accessRequestMocks.revokeAndArchiveScenarioAccess,
      catalogMocks.removeCatalogEntry,
      podNetworkMocks.safeDelete,
      podNetworkMocks.safeDeleteContainer,
    ].map((mock) => mock.mock.invocationCallOrder[0]);
    expect(cleanupOrder).toEqual([...cleanupOrder].sort((left, right) => left - right));
    expect(podNetworkMocks.saveStateIfUnchanged.mock.invocationCallOrder[0]).toBeLessThan(
      podNetworkMocks.setOwnerOnlyIfPresent.mock.invocationCallOrder[0]
    );
    expect(podNetworkMocks.loadStateSnapshot).toHaveBeenCalledTimes(2);
    expect(podNetworkMocks.loadStateSnapshot.mock.invocationCallOrder[0]).toBeLessThan(
      podNetworkMocks.setOwnerOnlyIfPresent.mock.invocationCallOrder[0]
    );
    expect(podNetworkMocks.safeDeleteContainer.mock.invocationCallOrder[0]).toBeLessThan(
      podNetworkMocks.loadStateSnapshot.mock.invocationCallOrder[1]
    );
    expect(podNetworkMocks.safeDeleteContainer.mock.invocationCallOrder[0]).toBeLessThan(
      podNetworkMocks.saveStateIfUnchanged.mock.invocationCallOrder[1]
    );
    expect(podNetworkMocks.saveState).not.toHaveBeenCalled();
  });

  it("retries reset against a fresh same-run state and preserves concurrent drafts", async () => {
    const podRoot = "https://solid-community-server.tmdt.info/sscon/";
    const scenarioRunId = "49f3344a-e58b-4f6a-a874-84e3815620e6";
    const runContainerUrl = `${podRoot}solid-tours/runs/${scenarioRunId}/`;
    const activeRun: ActiveRun = {
      phase: "published",
      scenarioRunId,
      activityIds: podStateWithTwoActivities.activities.map((activity) => activity.id),
      resourceUrl: `${runContainerUrl}activity.geojson`,
      manifestUrl: `${runContainerUrl}manifest.ttl`,
      runContainerUrl,
      datasetIdentifier: `solid-tours-activity-${scenarioRunId}`,
      catalogDatasetUrl: `${podRoot}catalog/ds/solid-tours-activity-${scenarioRunId}.ttl#it`,
      publishedAt: "2026-08-21T12:00:00.000Z",
    };
    const activeState = { ...podStateWithTwoActivities, activeRun };
    const concurrentDraftA = {
      ...localStateWithActivity.drafts[0],
      id: "8db47d3b-8a4f-4a74-b086-77c1c7630bf7",
      name: "Parallel A",
    };
    const concurrentDraftB = {
      ...localStateWithActivity.drafts[0],
      id: "7a64c06e-793f-4ab2-85af-fb8bfbd7ae77",
      name: "Parallel B",
    };
    const firstFinalState = {
      ...activeState,
      drafts: [...activeState.drafts, concurrentDraftA],
      activeRun: { ...activeRun, phase: "resetting" as const },
    };
    const retryState = {
      ...activeState,
      drafts: [...firstFinalState.drafts, concurrentDraftB],
      activeRun: { ...activeRun, phase: "resetting" as const },
    };
    const managerFetch = vi.fn(async () => new Response(null, { status: 204 }));
    podNetworkMocks.resolvePodRoot.mockResolvedValue(podRoot);
    podNetworkMocks.ensureStorage.mockResolvedValue(undefined);
    podNetworkMocks.loadState.mockResolvedValue(activeState);
    podNetworkMocks.loadStateSnapshot
      .mockResolvedValueOnce({ state: activeState, etag: '"state-v1"' })
      .mockResolvedValueOnce({ state: firstFinalState, etag: '"state-v2"' })
      .mockResolvedValueOnce({ state: retryState, etag: '"state-v3"' });
    podNetworkMocks.saveStateIfUnchanged
      .mockImplementationOnce(async (_root, nextState) => ({
        state: nextState,
        etag: '"state-v2"',
      }))
      .mockRejectedValueOnce(
        new StateConflictError("Der Solid-Tours-Status wurde zwischenzeitlich geändert.")
      )
      .mockImplementationOnce(async (_root, nextState) => ({
        state: nextState,
        etag: '"state-v4"',
      }));

    act(() =>
      root.render(
        createElement(SolidToursEmbed, {
          webId: HANNAH_WEB_ID,
          demoWebId: HANNAH_WEB_ID,
          session: {
            info: { isLoggedIn: true, webId: HANNAH_WEB_ID },
            fetch: managerFetch,
          },
        })
      )
    );
    await waitForDom(() => expect(container.querySelector(".danger")).not.toBeNull());
    await act(async () => container.querySelector<HTMLButtonElement>(".danger")!.click());

    await waitForDom(() => expect(podNetworkMocks.saveStateIfUnchanged).toHaveBeenCalledTimes(3));
    expect(podNetworkMocks.saveStateIfUnchanged).toHaveBeenLastCalledWith(
      podRoot,
      expect.objectContaining({
        activeRun: null,
        drafts: retryState.drafts,
      }),
      '"state-v3"',
      HANNAH_WEB_ID,
      expect.any(Function)
    );
    expect(container.textContent).toContain("Parallel B");
    expect(container.querySelector(".danger")).toBeNull();
    expect(podNetworkMocks.setOwnerOnlyIfPresent).toHaveBeenCalledOnce();
    expect(catalogMocks.removeCatalogEntry).toHaveBeenCalledOnce();
  });
});
