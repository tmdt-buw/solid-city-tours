import { flushSync } from "react-dom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const leafletMocks = vi.hoisted(() => {
  const map = {
    fitBounds: vi.fn(),
    invalidateSize: vi.fn(),
    getCenter: vi.fn(() => ({ lng: 7.15, lat: 51.25 })),
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
  const routeLayers: Array<{
    options: Record<string, unknown>;
    addTo: ReturnType<typeof vi.fn>;
    bindTooltip: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    click: ReturnType<typeof vi.fn>;
  }> = [];
  const dispatchMapClick = (event: unknown) => {
    const registration = (map.on.mock.calls as unknown[][]).find(
      ([eventName]) => eventName === "click"
    );
    const handler = registration?.[1] as ((event: unknown) => void) | undefined;
    handler?.(event);
  };
  const createRouteLayer = (options: Record<string, unknown> = {}) => {
    const clickHandlers: Array<(event: unknown) => void> = [];
    const layer = {
      options,
      addTo: vi.fn(),
      bindTooltip: vi.fn(),
      on: vi.fn(),
      click: vi.fn(),
    };
    layer.addTo.mockReturnValue(layer);
    layer.bindTooltip.mockReturnValue(layer);
    layer.on.mockImplementation((eventName: string, handler: (event: unknown) => void) => {
      if (eventName === "click") clickHandlers.push(handler);
      return layer;
    });
    layer.click.mockImplementation((event: unknown) => {
      // Leaflet's SVG renderer lets clicks pass through non-interactive paths.
      // Interactive paths receive the event and only bubble to the map when
      // bubblingMouseEvents has not explicitly been disabled.
      if (options.interactive === false) {
        dispatchMapClick(event);
        return layer;
      }
      clickHandlers.forEach((handler) => handler(event));
      if (options.bubblingMouseEvents !== false) dispatchMapClick(event);
      return layer;
    });
    routeLayers.push(layer);
    return layer;
  };
  const zoomControl = { addTo: vi.fn(), remove: vi.fn() };
  zoomControl.addTo.mockReturnValue(zoomControl);
  const circleMarkerFactory = vi.fn(
    (_coordinates: unknown, options: Record<string, unknown> = {}) => createRouteLayer(options)
  );
  const polylineFactory = vi.fn(
    (_coordinates: unknown, options: Record<string, unknown> = {}) => createRouteLayer(options)
  );

  return {
    map,
    overlay,
    tileLayer,
    routeLayers,
    zoomControl,
    circleMarkerFactory,
    polylineFactory,
    zoomControlFactory: vi.fn(() => zoomControl),
    mapFactory: vi.fn(() => map),
  };
});

vi.mock("leaflet", () => ({
  default: {
    circleMarker: leafletMocks.circleMarkerFactory,
    control: { zoom: leafletMocks.zoomControlFactory },
    latLngBounds: vi.fn((points) => points),
    layerGroup: vi.fn(() => leafletMocks.overlay),
    map: leafletMocks.mapFactory,
    polyline: leafletMocks.polylineFactory,
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
  loadDraftMasterResourceSnapshot: vi.fn(),
  loadPublicRouteTemplateResourceSnapshot: vi.fn(),
  loadCityToursOnboarding: vi.fn(),
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
  savePublicRouteTemplate: vi.fn(),
  updatePublicRouteTemplateConditionally: vi.fn(),
  saveRunSnapshot: vi.fn(),
  saveCityToursOnboarding: vi.fn(),
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
    loadDraftMasterResourceSnapshot: podNetworkMocks.loadDraftMasterResourceSnapshot,
    loadPublicRouteTemplateResourceSnapshot:
      podNetworkMocks.loadPublicRouteTemplateResourceSnapshot,
    loadCityToursOnboarding: podNetworkMocks.loadCityToursOnboarding,
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
    savePublicRouteTemplate: podNetworkMocks.savePublicRouteTemplate,
    updatePublicRouteTemplateConditionally:
      podNetworkMocks.updatePublicRouteTemplateConditionally,
    saveRunSnapshot: podNetworkMocks.saveRunSnapshot,
    saveCityToursOnboarding: podNetworkMocks.saveCityToursOnboarding,
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
  publishRouteTemplateCatalogEntry: vi.fn(),
  updateRouteTemplateCatalogEntry: vi.fn(),
  discoverCatalogedRoutes: vi.fn(),
  ensureRouteCatalogReadiness: vi.fn(),
  getCatalogedRouteDiscoveryReport: vi.fn((): import("./catalog").CatalogRouteDiscoveryReport | null => null),
  loadPublicRegistryOptions: vi.fn(),
  loadRouteCatalogReadiness: vi.fn(),
  loadCatalogProfileMetadata: vi.fn(),
  saveCatalogProfileMetadata: vi.fn(),
  removeCatalogEntry: vi.fn(),
}));

const accessRequestMocks = vi.hoisted(() => ({
  ensureCityToursInbox: vi.fn(),
  getCityToursInboxReadiness: vi.fn(),
  resolveSolidInbox: vi.fn(),
  revokeAndArchiveScenarioAccess: vi.fn(),
}));

vi.mock("./accessRequests", () => accessRequestMocks);

vi.mock("./catalog", () => catalogMocks);

import App from "./App";
import RawCityToursEmbed, {
  type CityToursEmbedProps,
} from "./embed/CityToursEmbed";
import { localStateKeyForIdentity } from "./localStorage";
import { StateConflictError } from "./solidStorage";
import type { CityToursSession } from "./embedAuth";
import type { ActiveRun, RouteCatalogPublication, TourDraft } from "./types";
import { TOURS_LANGUAGE_EVENT, TOURS_LANGUAGE_STORAGE_KEY } from "./i18n";
import {
  ROUTE_TEMPLATE_IDENTIFIER_PREFIX,
  createRouteTemplateSnapshot,
} from "./routeTemplates";
import { validateLocalToursState } from "./stateValidation";

// The pre-existing integration suite asserts the German product copy. Keep
// those behavioral tests explicit while dedicated language-contract tests
// below exercise the new English default and controlled embed switching.
const CityToursEmbed = (props: CityToursEmbedProps) =>
  createElement(RawCityToursEmbed, { language: "de", ...props });

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
  catalogPublications: [],
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

function requestAndConfirmDonation(container: HTMLElement, selector = ".publish") {
  flushSync(() => container.querySelector<HTMLButtonElement>(selector)!.click());
  const confirm = container.querySelector<HTMLButtonElement>('[data-testid="donation-confirmation-submit"]');
  expect(confirm).not.toBeNull();
  confirm!.click();
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

async function acceptCityToursOnboarding(container: HTMLElement): Promise<void> {
  await waitForDom(() => {
    expect(container.querySelector(".tours-onboarding")).not.toBeNull();
  });
  act(() => {
    container
      .querySelectorAll<HTMLInputElement>('.tours-onboarding input[type="checkbox"]')
      .forEach((checkbox) => checkbox.click());
    const registry = container.querySelector<HTMLInputElement>(
      '.tours-onboarding input[type="radio"]'
    );
    if (registry && !registry.checked) registry.click();
  });
  const submit = container.querySelector<HTMLButtonElement>(
    ".tours-onboarding button.primary"
  )!;
  expect(submit.disabled).toBe(false);
  await act(async () => submit.click());
}

describe("City Tours app shells", () => {
  let container: HTMLDivElement;
  let root: Root;

  it("imports a file directly into an untouched initial editor", async () => {
    act(() => root.render(createElement(CityToursEmbed, {})));
    await waitForDom(() => expect(container.querySelector('input[type="file"]')).not.toBeNull());
    const content = JSON.stringify({ type: "Feature", properties: { name: "Erster Import" }, geometry: { type: "LineString", coordinates: [[7.1, 51.2], [7.2, 51.3]] } });
    const file = new File([content], "first.geojson");
    Object.defineProperty(file, "text", { value: async () => content });
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    expect(container.querySelector<HTMLInputElement>(".form-grid input")!.value).toBe("Erster Import");
    expect(container.querySelector("dialog")).toBeNull();
    expect(container.querySelector(".workspace-error")).toBeNull();
    await act(async () => container.querySelector<HTMLButtonElement>(".save-draft-button")!.click());
    expect(JSON.parse(window.localStorage.getItem(localStateKeyForIdentity(null))!).drafts).toHaveLength(1);
  });

  const firstCatalogRoute = {
    routeTemplateId: "69020722-f94e-4d99-9aac-37b33d5607c7",
    identifier: "solid-tours-route-template-69020722-f94e-4d99-9aac-37b33d5607c7",
    name: "Katalogroute", description: "Eine Vorlage", publisher: "Tour Publisher",
    datasetUrl: "https://pods.example/publisher/catalog/ds/route.ttl#it",
    distributionUrl: "https://pods.example/publisher/public/route.geojson",
    geometry: [[[7.3, 51.3], [7.4, 51.4]]], distanceMeters: 12000,
  };

  it("adopts the first catalog route into an empty library and selects the saved private copy", async () => {
    catalogMocks.discoverCatalogedRoutes.mockResolvedValue([firstCatalogRoute]);
    act(() => root.render(createElement(CityToursEmbed, { webId: NON_HANNAH_WEB_ID })));
    await waitForDom(() => expect(container.querySelector(".catalog-adopt")).not.toBeNull());
    await act(async () => container.querySelector<HTMLButtonElement>(".catalog-adopt")!.click());
    await waitForDom(() => expect(container.querySelector(".draft-item")).not.toBeNull());
    expect(container.querySelector(".edit-draft-button")).not.toBeNull();
    expect(container.querySelector("dialog")).toBeNull();
    expect(podNetworkMocks.saveDraftConditionally).toHaveBeenCalledOnce();
    const saved = podNetworkMocks.saveDraftConditionally.mock.calls[0][1];
    expect(saved.adoptedFromCatalog.datasetUrl).toBe(firstCatalogRoute.datasetUrl);
    expect(saved.id).not.toBe(firstCatalogRoute.routeTemplateId);
    expect(saved.durationMinutes).toBeUndefined();
    expect(container.querySelector(".catalog-route-list .empty")?.textContent).toContain("bereits");
    expect(catalogMocks.publishRouteTemplateCatalogEntry).not.toHaveBeenCalled();
  });

  it("keeps an explicit catalog preview open when focus and pointer move to the map", async () => {
    catalogMocks.discoverCatalogedRoutes.mockResolvedValue([firstCatalogRoute]);
    act(() => root.render(createElement(CityToursEmbed, { webId: NON_HANNAH_WEB_ID })));
    await waitForDom(() => expect(container.querySelector(".catalog-preview")).not.toBeNull());
    act(() => container.querySelector<HTMLButtonElement>(".catalog-preview")!.click());
    const preview = container.querySelector<HTMLElement>(".catalog-route-item")!;
    act(() => {
      preview.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: container.querySelector(".tour-map") }));
      container.querySelector<HTMLButtonElement>(".fit-route-button")!.focus();
    });
    expect(preview.classList.contains("is-previewed")).toBe(true);
    expect(container.querySelector(".map-preview-label")?.textContent).toContain("Katalogroute");
    act(() => container.querySelector<HTMLButtonElement>(".map-preview-label button")!.click());
    expect(preview.classList.contains("is-previewed")).toBe(false);
  });

  it("reports catalog failures locally and allows retry without losing the editor", async () => {
    catalogMocks.discoverCatalogedRoutes.mockRejectedValueOnce(new Error("Offline")).mockResolvedValue([firstCatalogRoute]);
    act(() => root.render(createElement(CityToursEmbed, { webId: NON_HANNAH_WEB_ID })));
    await waitForDom(() => expect(container.querySelector(".catalog-status [role='alert']")?.textContent).toContain("Der Katalog konnte nicht aktualisiert werden"));
    expect(container.querySelector(".workspace-error")).toBeNull();
    expect(container.querySelector(".catalog-route-list .empty")?.textContent).not.toContain("Keine öffentlichen");
    await act(async () => container.querySelector<HTMLButtonElement>(".catalog-retry")!.click());
    await waitForDom(() => expect(container.querySelector(".catalog-adopt")).not.toBeNull());
    expect(container.querySelector(".catalog-status [role='alert']")).toBeNull();
  });

  it("discloses partial catalog loading while leaving usable templates available", async () => {
    catalogMocks.discoverCatalogedRoutes.mockResolvedValue([firstCatalogRoute]);
    catalogMocks.getCatalogedRouteDiscoveryReport.mockReturnValue({ candidateCount: 55, processedCount: 50, truncatedCount: 5, failures: [{ identifier: "broken", datasetUrl: "https://example.org/broken", distributionUrl: "https://example.org/file", code: "route-template-rejected", message: "Bad template" }] });
    act(() => root.render(createElement(CityToursEmbed, { webId: NON_HANNAH_WEB_ID })));
    await waitForDom(() => expect(container.querySelector(".catalog-status summary")?.textContent).toContain("1 Einträge"));
    expect(container.querySelector(".catalog-status summary")?.textContent).toContain("5 über dem Ladelimit");
    expect(container.querySelector<HTMLButtonElement>(".catalog-adopt")!.disabled).toBe(false);
  });

  it("shows the first point, keeps the map view stable while drawing, and restores a cleared route", async () => {
    act(() => root.render(createElement(CityToursEmbed, {})));
    await waitForDom(() => expect(container.querySelector(".tour-map")).not.toBeNull());
    const handleClick = leafletMocks.map.on.mock.calls.find(([name]) => name === "click")![1];
    const fitted = leafletMocks.map.fitBounds.mock.calls.length;
    act(() => handleClick({ latlng: { lng: 7.15, lat: 51.25 } }));
    expect(leafletMocks.circleMarkerFactory).toHaveBeenLastCalledWith([51.25, 7.15], expect.any(Object));
    act(() => handleClick({ latlng: { lng: 7.17, lat: 51.27 } }));
    expect(leafletMocks.map.fitBounds).toHaveBeenCalledTimes(fitted);
    act(() => container.querySelector<HTMLButtonElement>(".map-tool-button--danger")!.click());
    expect(container.querySelector(".map-stats")?.textContent).toContain("0,0 km");
    act(() => container.querySelector<HTMLButtonElement>(".map-tool-button")!.click());
    expect(container.querySelector(".map-stats")?.textContent).not.toContain("0,0 km");
    act(() => container.querySelector<HTMLButtonElement>(".fit-route-button")!.click());
    expect(leafletMocks.map.fitBounds).toHaveBeenCalledTimes(fitted + 1);
    act(() => container.querySelector<HTMLElement>(".tour-map")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
    expect(leafletMocks.map.getCenter).toHaveBeenCalled();
  });

  it("saves dirty work before continuing to a fresh draft and warns only while dirty", async () => {
    window.localStorage.setItem(localStateKeyForIdentity(null), JSON.stringify(localStateWithActivity));
    act(() => root.render(createElement(CityToursEmbed, {})));
    await waitForDom(() => expect(container.querySelector(".edit-draft-button")).not.toBeNull());
    act(() => container.querySelector<HTMLButtonElement>(".edit-draft-button")!.click());
    const input = container.querySelector<HTMLInputElement>(".form-grid input")!;
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Gespeicherte Änderung"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    const before = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(before);
    expect(before.defaultPrevented).toBe(true);
    act(() => container.querySelector<HTMLButtonElement>('[aria-label="Neue Tour"]')!.click());
    await act(async () => container.querySelector<HTMLButtonElement>(".confirm-dialog .primary")!.click());
    await waitForDom(() => expect(input.value).toBe("Neue Tour in Wuppertal"));
    expect(JSON.parse(window.localStorage.getItem(localStateKeyForIdentity(null))!).drafts[0].name).toBe("Gespeicherte Änderung");
    const after = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });

  it("keeps focus in a confirmation and returns it on Escape", async () => {
    window.localStorage.setItem(localStateKeyForIdentity(null), JSON.stringify(localStateWithActivity));
    act(() => root.render(createElement(CityToursEmbed, {})));
    await waitForDom(() => expect(container.querySelector(".tour-completion .primary")).not.toBeNull());
    const trigger = container.querySelector<HTMLButtonElement>(".tour-completion .primary")!;
    trigger.focus();
    act(() => trigger.click());
    const dialog = container.querySelector<HTMLDialogElement>("dialog")!;
    expect(dialog.contains(document.activeElement)).toBe(true);
    const first = dialog.querySelector<HTMLInputElement>("input")!;
    first.focus();
    act(() => first.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true })));
    expect(dialog.contains(document.activeElement)).toBe(true);
    act(() => dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    expect(container.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    delete window.__CITY_TOURS_CONFIG__;
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
    podNetworkMocks.loadDraftMasterResourceSnapshot.mockReset();
    podNetworkMocks.loadPublicRouteTemplateResourceSnapshot.mockReset();
    podNetworkMocks.loadCityToursOnboarding.mockReset();
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
    podNetworkMocks.savePublicRouteTemplate.mockReset();
    podNetworkMocks.updatePublicRouteTemplateConditionally.mockReset();
    podNetworkMocks.saveRunSnapshot.mockReset();
    podNetworkMocks.saveCityToursOnboarding.mockReset();
    podNetworkMocks.saveState.mockReset();
    podNetworkMocks.saveStateIfUnchanged.mockReset();
    podNetworkMocks.writePublishedMarker.mockReset();
    podNetworkMocks.resolvePodRoot.mockResolvedValue("https://pods.example/alex/");
    podNetworkMocks.ensureStorage.mockResolvedValue(undefined);
    podNetworkMocks.loadCityToursOnboarding.mockResolvedValue({
      schemaVersion: 2,
      app: "solid-tours",
      appSpecificAcceptedAt: "2026-08-20T12:00:00.000Z",
      publicPublishingAcceptedAt: "2026-08-20T12:00:00.000Z",
      publicRegistryUrl: "https://registry.example/research",
      standaloneAcceptedAt: "2026-08-20T12:00:00.000Z",
    });
    podNetworkMocks.loadState.mockResolvedValue({
      schemaVersion: 1,
      drafts: [],
      activities: [],
      catalogPublications: [],
      activeRun: null,
    });
    podNetworkMocks.loadDraftMasterSnapshot.mockResolvedValue({ etag: '"draft-v1"' });
    podNetworkMocks.saveDraftConditionally.mockResolvedValue({ etag: '"draft-v2"' });
    podNetworkMocks.saveActivityConditionally.mockResolvedValue({ etag: '"activity-new"' });
    podNetworkMocks.deleteDraft.mockResolvedValue(undefined);
    podNetworkMocks.saveInterestsIfMissing.mockResolvedValue(undefined);
    podNetworkMocks.savePublicRouteTemplate.mockImplementation(
      async (podRoot: string, snapshot: { properties: { routeTemplateId: string } }) =>
        `${podRoot}solid-tours/public/cataloged-routes/${snapshot.properties.routeTemplateId}.geojson`
    );
    catalogMocks.publishCatalogEntry.mockReset();
    catalogMocks.publishRouteTemplateCatalogEntry.mockReset();
    catalogMocks.updateRouteTemplateCatalogEntry.mockReset();
    catalogMocks.discoverCatalogedRoutes.mockReset();
    catalogMocks.discoverCatalogedRoutes.mockResolvedValue([]);
    catalogMocks.ensureRouteCatalogReadiness.mockReset();
    catalogMocks.ensureRouteCatalogReadiness.mockResolvedValue({
      catalogConfigured: true,
      publicRegistries: ["https://registry.example/research"],
      selectedRegistry: "https://registry.example/research",
    });
    catalogMocks.getCatalogedRouteDiscoveryReport.mockReset();
    catalogMocks.getCatalogedRouteDiscoveryReport.mockReturnValue(null);
    catalogMocks.loadPublicRegistryOptions.mockReset();
    catalogMocks.loadPublicRegistryOptions.mockReturnValue([
      {
        id: "research",
        label: "Research registry",
        url: "https://registry.example/research",
      },
    ]);
    catalogMocks.loadRouteCatalogReadiness.mockReset();
    catalogMocks.loadRouteCatalogReadiness.mockResolvedValue({
      catalogConfigured: true,
      publicRegistries: ["https://registry.example/research"],
    });
    catalogMocks.loadCatalogProfileMetadata.mockReset();
    catalogMocks.loadCatalogProfileMetadata.mockResolvedValue({ publisher: "Alex Example", contactEmail: "alex@example.org" });
    catalogMocks.saveCatalogProfileMetadata.mockReset();
    catalogMocks.saveCatalogProfileMetadata.mockImplementation(async ({ publisher, contactEmail }) => ({ publisher, contactEmail }));
    catalogMocks.removeCatalogEntry.mockReset();
    accessRequestMocks.revokeAndArchiveScenarioAccess.mockReset();
    accessRequestMocks.revokeAndArchiveScenarioAccess.mockResolvedValue(0);
    accessRequestMocks.ensureCityToursInbox.mockReset();
    accessRequestMocks.ensureCityToursInbox.mockResolvedValue(
      "https://pods.example/alex/inbox/"
    );
    accessRequestMocks.getCityToursInboxReadiness.mockReset();
    accessRequestMocks.getCityToursInboxReadiness.mockResolvedValue({
      configured: true,
      inboxUrl: "https://pods.example/alex/inbox/",
    });
    accessRequestMocks.resolveSolidInbox.mockReset();
    accessRequestMocks.resolveSolidInbox.mockResolvedValue(
      "https://pods.example/alex/inbox/"
    );
    leafletMocks.mapFactory.mockClear();
    leafletMocks.zoomControlFactory.mockClear();
    leafletMocks.zoomControl.remove.mockClear();
    leafletMocks.map.on.mockClear();
    leafletMocks.map.remove.mockClear();
    leafletMocks.routeLayers.length = 0;
    leafletMocks.circleMarkerFactory.mockClear();
    leafletMocks.polylineFactory.mockClear();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows a localized accessible loading state while a Pod state is resolving", async () => {
    podNetworkMocks.resolvePodRoot.mockReturnValue(new Promise<string>(() => undefined));

    act(() =>
      root.render(
        createElement(CityToursEmbed, {
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
    expect(status?.textContent).toContain("City Tours");
    expect(status?.textContent).toContain("Dein persönlicher Tourenbereich wird geladen …");
    expect(status?.tagName).toBe("MAIN");
    expect(status?.getAttribute("aria-busy")).toBe("true");
    const message = status?.querySelector<HTMLElement>('[role="status"]');
    expect(message?.getAttribute("aria-live")).toBe("polite");
    expect(message?.textContent).toBe("Dein persönlicher Tourenbereich wird geladen …");
    expect(status?.querySelector(".tours-loading-mark .fa-route")).not.toBeNull();
    const progress = status?.querySelector<HTMLElement>('[role="progressbar"]');
    expect(progress?.getAttribute("aria-label")).toBe(
      "Dein persönlicher Tourenbereich wird geladen …"
    );
    expect(progress?.hasAttribute("aria-valuenow")).toBe(false);
    expect(container.querySelector(".tours-loading-spinner")).toBeNull();
    expect(container.querySelector(".language-toggle")).toBeNull();
    expect(container.querySelector(".loading-route")).toBeNull();
    expect(container.querySelector(".route-workspace")).toBeNull();
  });

  it("shows only the login shell when the standalone app has no session", async () => {
    act(() => root.render(createElement(App)));

    await waitForDom(() => {
      expect(container.querySelector(".city-tours-login")).not.toBeNull();
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
      expect(container.querySelector(".city-tours-login")).not.toBeNull();
    });

    expect(container.textContent).toContain("Suggested providers");
    expect(container.querySelector(".city-tours-app")?.getAttribute("lang")).toBe("en");
    const languageSelect = container.querySelector<HTMLSelectElement>(
      ".language-toggle__select"
    )!;
    act(() => {
      languageSelect.value = "de";
      languageSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(container.textContent).toContain("Vorgeschlagene Anbieter");
    expect(container.querySelector(".city-tours-app")?.getAttribute("lang")).toBe("de");
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

  it("sets up private standalone storage without public side effects, then configures sharing explicitly", async () => {
    podNetworkMocks.loadCityToursOnboarding.mockResolvedValue(null);
    catalogMocks.loadRouteCatalogReadiness.mockResolvedValue({ catalogConfigured: false, publicRegistries: [] });
    accessRequestMocks.getCityToursInboxReadiness.mockResolvedValue({ configured: false });
    act(() => root.render(createElement(App, { webIdOverride: NON_HANNAH_WEB_ID })));
    await acceptCityToursOnboarding(container);
    await waitForDom(() => expect(container.querySelector(".route-workspace")).not.toBeNull());
    expect(podNetworkMocks.ensureStorage).toHaveBeenCalledOnce();
    expect(catalogMocks.saveCatalogProfileMetadata).not.toHaveBeenCalled();
    expect(accessRequestMocks.ensureCityToursInbox).not.toHaveBeenCalled();
    expect(catalogMocks.ensureRouteCatalogReadiness).not.toHaveBeenCalled();
    expect(podNetworkMocks.saveCityToursOnboarding.mock.calls[0][1]).toMatchObject({ schemaVersion: 3 });
    expect(podNetworkMocks.saveCityToursOnboarding.mock.calls[0][1].publicPublishingAcceptedAt).toBeUndefined();
    act(() => container.querySelector<HTMLButtonElement>(".sharing-panel > .primary")!.click());
    await acceptCityToursOnboarding(container);
    await waitForDom(() => expect(container.querySelector(".route-workspace")).not.toBeNull());
    expect(catalogMocks.saveCatalogProfileMetadata).toHaveBeenCalledOnce();
    expect(accessRequestMocks.ensureCityToursInbox).toHaveBeenCalledOnce();
    expect(catalogMocks.ensureRouteCatalogReadiness).toHaveBeenCalledOnce();
    expect(catalogMocks.saveCatalogProfileMetadata.mock.invocationCallOrder[0]).toBeLessThan(accessRequestMocks.ensureCityToursInbox.mock.invocationCallOrder[0]);
    expect(accessRequestMocks.ensureCityToursInbox.mock.invocationCallOrder[0]).toBeLessThan(catalogMocks.ensureRouteCatalogReadiness.mock.invocationCallOrder[0]);
    expect(podNetworkMocks.saveCityToursOnboarding.mock.calls.at(-1)![1]).toMatchObject({ schemaVersion: 2, publicRegistryUrl: "https://registry.example/research" });
    expect(catalogMocks.publishCatalogEntry).not.toHaveBeenCalled();
  });

  it.each(["inbox", "registry", "profile"])("keeps private tours available when publishing %s readiness is missing", async (missing) => {
    if (missing === "inbox") accessRequestMocks.getCityToursInboxReadiness.mockResolvedValue({ configured: false });
    if (missing === "registry") catalogMocks.loadRouteCatalogReadiness.mockResolvedValue({ catalogConfigured: false, publicRegistries: [] });
    if (missing === "profile") catalogMocks.loadCatalogProfileMetadata.mockResolvedValue({ publisher: "", contactEmail: "" });
    act(() => root.render(createElement(CityToursEmbed, { webId: NON_HANNAH_WEB_ID })));
    await waitForDom(() => expect(container.querySelector(".route-workspace")).not.toBeNull());
    expect(podNetworkMocks.ensureStorage).toHaveBeenCalledOnce();
    act(() => container.querySelector<HTMLButtonElement>(".sharing-panel > .primary")!.click());
    await waitForDom(() => expect(container.querySelector(".tours-onboarding--embedded")).not.toBeNull());
    act(() => container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((box) => box.click()));
    expect(container.querySelector<HTMLButtonElement>(".tours-onboarding button.primary")!.disabled).toBe(true);
    expect(catalogMocks.ensureRouteCatalogReadiness).not.toHaveBeenCalled();
    expect(catalogMocks.publishCatalogEntry).not.toHaveBeenCalled();
    expect(container.querySelector('a[href="/profile"], a[href="/"]')).not.toBeNull();
  });

  it("accepts private embedded setup with no public acknowledgement", async () => {
    podNetworkMocks.loadCityToursOnboarding.mockResolvedValue(null);
    act(() => root.render(createElement(CityToursEmbed, { webId: NON_HANNAH_WEB_ID })));
    await acceptCityToursOnboarding(container);
    await waitForDom(() => expect(container.querySelector(".route-workspace")).not.toBeNull());
    expect(accessRequestMocks.ensureCityToursInbox).not.toHaveBeenCalled();
    expect(catalogMocks.ensureRouteCatalogReadiness).not.toHaveBeenCalled();
    expect(podNetworkMocks.saveCityToursOnboarding.mock.calls[0][1]).toMatchObject({ schemaVersion: 3 });
    expect(podNetworkMocks.saveCityToursOnboarding.mock.calls[0][1].publicPublishingAcceptedAt).toBeUndefined();
  });

  it("uses Pod storage and shows the standalone shell for an arbitrary Solid login", async () => {
    act(() => root.render(createElement(App, { webIdOverride: NON_HANNAH_WEB_ID })));

    await waitForDom(() => {
      expect(container.querySelector(".route-workspace")).not.toBeNull();
    });

    expect(container.querySelector(".city-tours-login")).toBeNull();
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

    expect(workspace.querySelector(".workspace-nav")).not.toBeNull();
    expect(workspace.querySelector(".mobile-view-toggle")).not.toBeNull();
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
    expect(container.querySelector(".city-tours-login .language-toggle")).toBeNull();
    const actions = container.querySelector(".app-header .header-actions")!;
    expect(actions.children[0]?.classList.contains("header-user")).toBe(true);
    expect(actions.children[1]?.classList.contains("language-toggle")).toBe(true);
    expect(actions.children[2]?.classList.contains("header-logout")).toBe(true);
    expect(actions.textContent).toContain(NON_HANNAH_WEB_ID);
    expect(container.querySelector(".app-footer .footer-version")?.textContent).toContain(
      "City Tours"
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
        expect(container.querySelector(".city-tours-login")).not.toBeNull();
      });

      vi.useFakeTimers();
      await act(async () => {
        container.querySelector<HTMLButtonElement>(".city-tours-login__submit")!.click();
        await Promise.resolve();
      });

      expect(bridgeLogin).toHaveBeenCalledWith("https://solid-community-server.tmdt.info");
      expect(container.querySelector<HTMLButtonElement>(".city-tours-login__submit")?.disabled).toBe(
        false
      );

      act(() => vi.advanceTimersByTime(20_000));
      expect(container.querySelector(".city-tours-login__error")).toBeNull();
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
        createElement(CityToursEmbed, {
          webId: NON_HANNAH_WEB_ID,
          demoWebId: HANNAH_WEB_ID,
        })
      )
    );

    await waitForDom(() => {
      expect(container.querySelector(".route-workspace")).not.toBeNull();
      expect(container.textContent).toContain("Wuppertaler Runde");
    });

    expect(container.querySelector(".city-tours-app--embedded")).not.toBeNull();
    expect(container.querySelector(".city-tours-login")).toBeNull();
    expect(container.querySelector(".app-header")).toBeNull();
    expect(container.querySelector(".app-footer")).toBeNull();
    expect(container.querySelector(".scenario-card")).toBeNull();
    expect(container.querySelector(".publish")).not.toBeNull();
    expect(container.querySelector(".header-reset")).toBeNull();
    expect(container.querySelector(".sample-routes")).toBeNull();
    expect(container.querySelector(".map-hint")).toBeNull();
    expect(container.textContent).not.toContain("Beispielrouten zum Importieren");
    expect(container.textContent).not.toContain("Route zeichnen");
    expect(container.textContent).toContain("Spende vorbereiten");
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
      (button) => button.textContent === "Als absolviert eintragen"
    );
    expect(completeButton).toBeDefined();
    const myToursCard = Array.from(container.querySelectorAll<HTMLElement>(".list-card")).find(
      (card) => card.querySelector("h2")?.textContent === "Meine Touren"
    );
    expect(myToursCard).toBeDefined();
    const tourCompletion = container.querySelector(".panel-section--planner .tour-completion");
    expect(tourCompletion).not.toBeNull();
    expect(tourCompletion!.lastElementChild).toBe(completeButton);
    expect(container.querySelector(".panel-section--planner .edit-draft-button")?.textContent).toBe(
      "Route bearbeiten"
    );
    expect(container.querySelector(".map-stage > .map-stats")).not.toBeNull();
    expect(container.querySelector(".planner-panel .map-stats")).toBeNull();
    expect(container.querySelector(".map-edit-toolbar")).toBeNull();
    expect(container.textContent).toContain("20.08.2026");
    act(() => completeButton!.click());
    const completedDateInput = container.querySelector<HTMLInputElement>(".completion-date-field input")!;
    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!;
      valueSetter.call(completedDateInput, "19.08.2026");
      completedDateInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelector("dialog[open]")).not.toBeNull();
    expect(container.querySelector(".confirm-dialog")).not.toBeNull();
    expect(container.querySelector(".city-tours-app--modal-open")).not.toBeNull();
    expect(completedDateInput.value).toBe("19.08.2026");
    const dialogSave = container.querySelector<HTMLButtonElement>(".confirm-dialog .primary")!;
    expect(dialogSave.textContent).toBe("Speichern");
    expect(dialogSave.disabled).toBe(true);
    expect(container.querySelectorAll<HTMLInputElement>('input[name="completion-activity"]:checked')).toHaveLength(0);
    expect(container.querySelectorAll(".activity-item")).toHaveLength(1);
    expect(container.textContent).not.toContain("Lokal");
  });

  it("stores a private cleanup reference before publishing a route template", async () => {
    const podRoot = "https://pods.example/alex/";
    const managerFetch = vi.fn(async () => new Response(null, { status: 204 }));
    let authoritative = {
      ...localStateWithActivity,
      catalogPublications: [] as RouteCatalogPublication[],
    };
    let stateVersion = 1;
    podNetworkMocks.resolvePodRoot.mockResolvedValue(podRoot);
    podNetworkMocks.loadState.mockResolvedValue(localStateWithActivity);
    podNetworkMocks.loadStateSnapshot.mockImplementation(async () => ({
      state: authoritative,
      etag: `"state-v${stateVersion}"`,
    }));
    podNetworkMocks.saveStateIfUnchanged.mockImplementation(
      async (_root, nextState) => {
        authoritative = nextState;
        stateVersion += 1;
        return { state: nextState, etag: `"state-v${stateVersion}"` };
      }
    );
    catalogMocks.publishRouteTemplateCatalogEntry.mockImplementation(
      async ({ snapshot }) => {
        const datasetIdentifier = `solid-tours-route-template-${snapshot.properties.routeTemplateId}`;
        return {
          datasetIdentifier,
          catalogDatasetUrl: `${podRoot}catalog/ds/${datasetIdentifier}.ttl#it`,
        };
      }
    );

    act(() =>
      root.render(
        createElement(CityToursEmbed, {
          webId: NON_HANNAH_WEB_ID,
          session: {
            info: { isLoggedIn: true, webId: NON_HANNAH_WEB_ID },
            fetch: managerFetch,
          },
        })
      )
    );
    await waitForDom(() => expect(container.querySelector(".catalog-index")).not.toBeNull());
    await act(async () => container.querySelector<HTMLButtonElement>(".catalog-index")!.click());
    await act(async () =>
      container.querySelector<HTMLButtonElement>(".confirm-dialog--catalog .primary")!.click()
    );

    await waitForDom(() => expect(podNetworkMocks.saveStateIfUnchanged).toHaveBeenCalledTimes(2));
    expect(catalogMocks.publishRouteTemplateCatalogEntry).toHaveBeenCalledOnce();
    expect(
      podNetworkMocks.saveStateIfUnchanged.mock.invocationCallOrder[0]
    ).toBeLessThan(podNetworkMocks.savePublicRouteTemplate.mock.invocationCallOrder[0]);
    const stagedState = podNetworkMocks.saveStateIfUnchanged.mock.calls[0][1];
    expect(stagedState.catalogPublications).toHaveLength(1);
    expect(stagedState.catalogPublications[0]).toEqual(
      expect.objectContaining({
        phase: "publishing",
        sourceDraftId: localStateWithActivity.drafts[0].id,
        sourceDraftUpdatedAt: localStateWithActivity.drafts[0].updatedAt,
      })
    );
    expect(authoritative.catalogPublications[0]).toEqual(
      expect.objectContaining({ phase: "published" })
    );
  });

  it.each(["publishing", "removing"] as const)(
    "fails closed when editing a route whose catalog publication is %s",
    async (phase) => {
      const podRoot = "https://pods.example/alex/";
      const managerFetch = vi.fn(async () => new Response(null, { status: 204 }));
      const routeTemplateId = "69020722-f94e-4d99-9aac-37b33d5607c7";
      const datasetIdentifier = `solid-tours-route-template-${routeTemplateId}`;
      const publication: RouteCatalogPublication = {
        phase,
        phaseChangedAt: new Date().toISOString(),
        routeTemplateId,
        sourceDraftId: localStateWithActivity.drafts[0].id,
        sourceDraftUpdatedAt: localStateWithActivity.drafts[0].updatedAt,
        resourceUrl: `${podRoot}solid-tours/public/cataloged-routes/${routeTemplateId}.geojson`,
        datasetIdentifier,
        catalogDatasetUrl: `${podRoot}catalog/ds/${datasetIdentifier}.ttl#it`,
        publishedAt: "2026-08-20T14:00:00.000Z",
      };
      podNetworkMocks.resolvePodRoot.mockResolvedValue(podRoot);
      podNetworkMocks.loadState.mockResolvedValue({
        ...localStateWithActivity,
        catalogPublications: [publication],
      });

      act(() =>
        root.render(
          createElement(CityToursEmbed, {
            webId: NON_HANNAH_WEB_ID,
            session: {
              info: { isLoggedIn: true, webId: NON_HANNAH_WEB_ID },
              fetch: managerFetch,
            },
          })
        )
      );
      await waitForDom(() => expect(container.querySelector(".edit-draft-button")).not.toBeNull());

      const editButton = container.querySelector<HTMLButtonElement>(".edit-draft-button")!;
      expect(editButton.disabled).toBe(true);

      // Exercise the handler guard independently of the declarative disabled
      // state, as a stale DOM or scripted invocation must not bypass it. React
      // suppresses delegated click events from its Fiber props even after only
      // the native flag is cleared, so invoke the bound handler explicitly.
      editButton.disabled = false;
      const reactPropsKey = Object.getOwnPropertyNames(editButton).find((key) =>
        key.startsWith("__reactProps$")
      );
      expect(reactPropsKey).toBeDefined();
      const reactProps = (
        editButton as unknown as Record<string, { onClick?: () => void }>
      )[reactPropsKey!];
      expect(reactProps.onClick).toBeTypeOf("function");
      act(() => reactProps.onClick!());

      await waitForDom(() => {
        expect(container.querySelector(".workspace-error")?.textContent).toContain(
          "Die Routenvorlage ist erst nach Abschluss der laufenden Katalogaktion wieder bearbeitbar."
        );
      });
      expect(container.querySelector(".save-draft-button")).toBeNull();
      expect(container.querySelector<HTMLInputElement>(".form-grid input")?.disabled).toBe(true);
      expect(podNetworkMocks.loadStateSnapshot).not.toHaveBeenCalled();
      expect(podNetworkMocks.saveDraftConditionally).not.toHaveBeenCalled();
    }
  );

  it("updates an indexed route only after explicit save while preserving every public identifier", async () => {
    const podRoot = "https://pods.example/alex/";
    const managerFetch = vi.fn(async () => new Response(null, { status: 204 }));
    const routeTemplateId = "69020722-f94e-4d99-9aac-37b33d5607c7";
    const datasetIdentifier = `solid-tours-route-template-${routeTemplateId}`;
    const resourceUrl = `${podRoot}solid-tours/public/cataloged-routes/${routeTemplateId}.geojson`;
    const catalogDatasetUrl = `${podRoot}catalog/ds/${datasetIdentifier}.ttl#it`;
    const publication: RouteCatalogPublication = {
      phase: "published",
      phaseChangedAt: "2026-08-20T14:00:00.000Z",
      routeTemplateId,
      sourceDraftId: localStateWithActivity.drafts[0].id,
      sourceDraftUpdatedAt: localStateWithActivity.drafts[0].updatedAt,
      resourceUrl,
      datasetIdentifier,
      catalogDatasetUrl,
      publishedAt: "2026-08-20T14:00:00.000Z",
    };
    let authoritative = {
      ...localStateWithActivity,
      catalogPublications: [publication],
    };
    let stateVersion = 1;
    const previousPublicSnapshot = createRouteTemplateSnapshot(
      localStateWithActivity.drafts[0] as unknown as TourDraft,
      routeTemplateId
    );
    const previousResourceSnapshot = {
      resourceUrl,
      snapshot: previousPublicSnapshot,
      etag: '"route-v1"',
    };

    podNetworkMocks.resolvePodRoot.mockResolvedValue(podRoot);
    podNetworkMocks.loadState.mockResolvedValue(authoritative);
    podNetworkMocks.loadStateSnapshot.mockImplementation(async () => ({
      state: authoritative,
      etag: `"state-v${stateVersion}"`,
    }));
    podNetworkMocks.saveStateIfUnchanged.mockImplementation(async (_root, nextState) => {
      authoritative = nextState;
      stateVersion += 1;
      return { state: nextState, etag: `"state-v${stateVersion}"` };
    });
    podNetworkMocks.loadPublicRouteTemplateResourceSnapshot.mockResolvedValue(
      previousResourceSnapshot
    );
    podNetworkMocks.loadDraftMasterResourceSnapshot.mockResolvedValue({
      draft: localStateWithActivity.drafts[0],
      etag: '"draft-v1"',
    });
    podNetworkMocks.updatePublicRouteTemplateConditionally.mockImplementation(
      async (_root, _resourceUrl, _templateId, nextSnapshot) => ({
        previous: previousResourceSnapshot,
        current: {
          resourceUrl,
          snapshot: nextSnapshot,
          etag: '"route-v2"',
        },
      })
    );
    catalogMocks.updateRouteTemplateCatalogEntry.mockResolvedValue({
      datasetIdentifier,
      catalogDatasetUrl,
      catalogRecordUrl: `${podRoot}catalog/records/${datasetIdentifier}.ttl`,
    });

    act(() =>
      root.render(
        createElement(CityToursEmbed, {
          webId: NON_HANNAH_WEB_ID,
          session: {
            info: { isLoggedIn: true, webId: NON_HANNAH_WEB_ID },
            fetch: managerFetch,
          },
        })
      )
    );
    await waitForDom(() => expect(container.querySelector(".edit-draft-button")).not.toBeNull());

    const mapClickRegistration = leafletMocks.map.on.mock.calls.find(
      ([eventName]) => eventName === "click"
    )!;
    act(() =>
      mapClickRegistration[1]({ latlng: { lng: 7.24, lat: 51.29 } })
    );
    expect(container.querySelector(".workspace-error")).toBeNull();

    act(() => container.querySelector<HTMLButtonElement>(".edit-draft-button")!.click());
    expect(container.querySelector(".public-route-edit-hint")?.textContent).toContain(
      "Katalogeintrag aktualisiert"
    );
    const nameInput = container.querySelector<HTMLInputElement>(".form-grid input")!;
    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!;
      valueSetter.call(nameInput, "Aktualisierte Wuppertaler Runde");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(podNetworkMocks.updatePublicRouteTemplateConditionally).not.toHaveBeenCalled();
    expect(catalogMocks.updateRouteTemplateCatalogEntry).not.toHaveBeenCalled();
    expect(podNetworkMocks.saveDraftConditionally).not.toHaveBeenCalled();

    await act(async () =>
      container.querySelector<HTMLButtonElement>(".save-draft-button")!.click()
    );
    await waitForDom(() => expect(container.querySelector(".edit-draft-button")).not.toBeNull());

    const stagedUpdate = podNetworkMocks.saveStateIfUnchanged.mock.calls[0][1]
      .catalogPublications[0] as RouteCatalogPublication;
    expect(stagedUpdate).toEqual(
      expect.objectContaining({
        phase: "updating",
        pendingUpdate: expect.objectContaining({
          operationId: expect.any(String),
          leaseId: expect.any(String),
          draft: expect.objectContaining({ name: "Aktualisierte Wuppertaler Runde" }),
        }),
      })
    );
    expect(
      podNetworkMocks.saveStateIfUnchanged.mock.invocationCallOrder[0]
    ).toBeLessThan(
      podNetworkMocks.updatePublicRouteTemplateConditionally.mock.invocationCallOrder[0]
    );

    expect(podNetworkMocks.updatePublicRouteTemplateConditionally).toHaveBeenCalledWith(
      podRoot,
      resourceUrl,
      routeTemplateId,
      expect.objectContaining({
        properties: expect.objectContaining({
          routeTemplateId,
          name: "Aktualisierte Wuppertaler Runde",
        }),
      }),
      NON_HANNAH_WEB_ID,
      expect.any(Function),
      previousResourceSnapshot
    );
    expect(catalogMocks.updateRouteTemplateCatalogEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        podRoot,
        webId: NON_HANNAH_WEB_ID,
        resourceUrl,
        catalogDatasetUrl,
        publishedAt: publication.publishedAt,
        operationId: expect.any(String),
        snapshot: expect.objectContaining({
          properties: expect.objectContaining({ routeTemplateId }),
        }),
      })
    );
    expect(authoritative.catalogPublications[0]).toEqual(
      expect.objectContaining({
        phase: "published",
        routeTemplateId,
        resourceUrl,
        datasetIdentifier,
        catalogDatasetUrl,
        sourceDraftUpdatedAt: authoritative.drafts[0].updatedAt,
      })
    );
    expect(authoritative.drafts[0].name).toBe("Aktualisierte Wuppertaler Runde");
    expect(authoritative.catalogPublications[0].pendingUpdate).toBeUndefined();
    expect(catalogMocks.removeCatalogEntry).not.toHaveBeenCalled();
  });

  it("resumes a stale published-route update after reload without replacing public identities", async () => {
    const podRoot = "https://pods.example/alex/";
    const managerFetch = vi.fn(async () => new Response(null, { status: 204 }));
    const routeTemplateId = "69020722-f94e-4d99-9aac-37b33d5607c7";
    const datasetIdentifier = `solid-tours-route-template-${routeTemplateId}`;
    const resourceUrl = `${podRoot}solid-tours/public/cataloged-routes/${routeTemplateId}.geojson`;
    const catalogDatasetUrl = `${podRoot}catalog/ds/${datasetIdentifier}.ttl#it`;
    const baselineDraft = localStateWithActivity.drafts[0] as unknown as TourDraft;
    const pendingDraft: TourDraft = {
      ...baselineDraft,
      name: "Recovered Wuppertal route",
      updatedAt: "2026-08-20T15:00:00.000Z",
    };
    const operationId = "9be23928-bff4-49ad-981d-2a6d48fc3c20";
    const publication: RouteCatalogPublication = {
      phase: "updating",
      phaseChangedAt: "2026-08-20T15:00:00.000Z",
      routeTemplateId,
      sourceDraftId: baselineDraft.id,
      sourceDraftUpdatedAt: baselineDraft.updatedAt,
      resourceUrl,
      datasetIdentifier,
      catalogDatasetUrl,
      publishedAt: "2026-08-20T14:00:00.000Z",
      pendingUpdate: {
        operationId,
        leaseId: "f8b321a2-f550-4e90-8f39-09e80eced0b3",
        draft: pendingDraft,
      },
    };
    let authoritative = {
      ...localStateWithActivity,
      drafts: [baselineDraft],
      catalogPublications: [publication],
    };
    let stateVersion = 1;
    const targetPublicSnapshot = createRouteTemplateSnapshot(pendingDraft, routeTemplateId);

    podNetworkMocks.resolvePodRoot.mockResolvedValue(podRoot);
    podNetworkMocks.loadState.mockResolvedValue(authoritative);
    podNetworkMocks.loadStateSnapshot.mockImplementation(async () => ({
      state: authoritative,
      etag: `"state-v${stateVersion}"`,
    }));
    podNetworkMocks.saveStateIfUnchanged.mockImplementation(async (_root, nextState) => {
      authoritative = nextState;
      stateVersion += 1;
      return { state: nextState, etag: `"state-v${stateVersion}"` };
    });
    podNetworkMocks.loadPublicRouteTemplateResourceSnapshot.mockResolvedValue({
      resourceUrl,
      snapshot: targetPublicSnapshot,
      etag: '"route-v2"',
    });
    podNetworkMocks.loadDraftMasterResourceSnapshot.mockResolvedValue({
      draft: pendingDraft,
      etag: '"draft-v2"',
    });
    catalogMocks.updateRouteTemplateCatalogEntry.mockResolvedValue({
      datasetIdentifier,
      catalogDatasetUrl,
      catalogRecordUrl: `${podRoot}catalog/records/${datasetIdentifier}.ttl`,
    });

    act(() =>
      root.render(
        createElement(CityToursEmbed, {
          webId: NON_HANNAH_WEB_ID,
          session: {
            info: { isLoggedIn: true, webId: NON_HANNAH_WEB_ID },
            fetch: managerFetch,
          },
        })
      )
    );
    await waitForDom(() => expect(container.querySelector(".edit-draft-button")).not.toBeNull());
    expect(container.querySelector<HTMLButtonElement>(".edit-draft-button")!.disabled).toBe(false);

    act(() => container.querySelector<HTMLButtonElement>(".edit-draft-button")!.click());
    await waitForDom(() => expect(authoritative.catalogPublications[0].phase).toBe("published"));
    await waitForDom(() => expect(container.querySelector(".save-draft-button")).not.toBeNull());

    expect(authoritative.drafts[0]).toEqual(pendingDraft);
    expect(authoritative.catalogPublications[0]).toEqual(
      expect.objectContaining({
        phase: "published",
        routeTemplateId,
        resourceUrl,
        datasetIdentifier,
        catalogDatasetUrl,
        sourceDraftUpdatedAt: pendingDraft.updatedAt,
      })
    );
    expect(authoritative.catalogPublications[0].pendingUpdate).toBeUndefined();
    expect(podNetworkMocks.updatePublicRouteTemplateConditionally).not.toHaveBeenCalled();
    expect(podNetworkMocks.saveDraftConditionally).not.toHaveBeenCalled();
    expect(catalogMocks.updateRouteTemplateCatalogEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        catalogDatasetUrl,
        operationId,
        publishedAt: publication.publishedAt,
        resourceUrl,
        snapshot: targetPublicSnapshot,
      })
    );
  });

  it("rolls public route writes back when the final authoritative reservation disappeared", async () => {
    const podRoot = "https://pods.example/alex/";
    const managerFetch = vi.fn(async () => new Response(null, { status: 204 }));
    let authoritative = {
      ...localStateWithActivity,
      catalogPublications: [] as RouteCatalogPublication[],
    };
    let etag = '"state-v1"';
    podNetworkMocks.resolvePodRoot.mockResolvedValue(podRoot);
    podNetworkMocks.loadState.mockResolvedValue(localStateWithActivity);
    podNetworkMocks.loadStateSnapshot.mockImplementation(async () => ({ state: authoritative, etag }));
    podNetworkMocks.saveStateIfUnchanged.mockImplementation(async (_root, nextState) => {
      authoritative = nextState;
      etag = '"state-v2"';
      return { state: nextState, etag };
    });
    catalogMocks.publishRouteTemplateCatalogEntry.mockImplementation(async ({ snapshot }) => {
      const datasetIdentifier = `solid-tours-route-template-${snapshot.properties.routeTemplateId}`;
      // Simulate another tab/manual edit removing Tab A's private reservation
      // while its public catalog request is in flight.
      authoritative = { ...authoritative, catalogPublications: [] };
      etag = '"state-v3"';
      return {
        datasetIdentifier,
        catalogDatasetUrl: `${podRoot}catalog/ds/${datasetIdentifier}.ttl#it`,
      };
    });

    act(() =>
      root.render(
        createElement(CityToursEmbed, {
          webId: NON_HANNAH_WEB_ID,
          session: {
            info: { isLoggedIn: true, webId: NON_HANNAH_WEB_ID },
            fetch: managerFetch,
          },
        })
      )
    );
    await waitForDom(() => expect(container.querySelector(".catalog-index")).not.toBeNull());
    await act(async () => container.querySelector<HTMLButtonElement>(".catalog-index")!.click());
    await act(async () =>
      container.querySelector<HTMLButtonElement>(".confirm-dialog--catalog .primary")!.click()
    );

    await waitForDom(() => expect(podNetworkMocks.safeDelete).toHaveBeenCalledOnce());
    expect(catalogMocks.removeCatalogEntry).toHaveBeenCalledOnce();
    expect(podNetworkMocks.setOwnerOnlyIfPresent).toHaveBeenCalledOnce();
    expect(authoritative.catalogPublications).toHaveLength(0);
    expect(podNetworkMocks.saveStateIfUnchanged).toHaveBeenCalledOnce();
  });

  it("claims published-route cleanup before performing external deletes", async () => {
    const podRoot = "https://pods.example/alex/";
    const managerFetch = vi.fn(async () => new Response(null, { status: 204 }));
    const publication: RouteCatalogPublication = {
      phase: "published",
      phaseChangedAt: "2026-08-20T14:00:00.000Z",
      routeTemplateId: "69020722-f94e-4d99-9aac-37b33d5607c7",
      sourceDraftId: localStateWithActivity.drafts[0].id,
      sourceDraftUpdatedAt: localStateWithActivity.drafts[0].updatedAt,
      resourceUrl: `${podRoot}solid-tours/public/cataloged-routes/69020722-f94e-4d99-9aac-37b33d5607c7.geojson`,
      datasetIdentifier: "solid-tours-route-template-69020722-f94e-4d99-9aac-37b33d5607c7",
      catalogDatasetUrl: `${podRoot}catalog/ds/solid-tours-route-template-69020722-f94e-4d99-9aac-37b33d5607c7.ttl#it`,
      publishedAt: "2026-08-20T14:00:00.000Z",
    };
    let authoritative = {
      ...localStateWithActivity,
      catalogPublications: [publication],
    };
    let stateVersion = 1;
    podNetworkMocks.resolvePodRoot.mockResolvedValue(podRoot);
    podNetworkMocks.loadState.mockResolvedValue(authoritative);
    podNetworkMocks.loadStateSnapshot.mockImplementation(async () => ({
      state: authoritative,
      etag: `"state-v${stateVersion}"`,
    }));
    podNetworkMocks.saveStateIfUnchanged.mockImplementation(async (_root, nextState) => {
      authoritative = nextState;
      stateVersion += 1;
      return { state: nextState, etag: `"state-v${stateVersion}"` };
    });

    act(() =>
      root.render(
        createElement(CityToursEmbed, {
          webId: NON_HANNAH_WEB_ID,
          session: {
            info: { isLoggedIn: true, webId: NON_HANNAH_WEB_ID },
            fetch: managerFetch,
          },
        })
      )
    );
    await waitForDom(() => expect(container.querySelector(".catalog-remove")).not.toBeNull());
    await act(async () => container.querySelector<HTMLButtonElement>(".catalog-remove")!.click());
    await act(async () =>
      container.querySelector<HTMLButtonElement>(".confirm-dialog--danger .danger")!.click()
    );

    await waitForDom(() => expect(authoritative.catalogPublications).toHaveLength(0));
    expect(podNetworkMocks.saveStateIfUnchanged.mock.calls[0][1].catalogPublications[0].phase).toBe(
      "removing"
    );
    expect(podNetworkMocks.saveStateIfUnchanged.mock.invocationCallOrder[0]).toBeLessThan(
      catalogMocks.removeCatalogEntry.mock.invocationCallOrder[0]
    );
    expect(podNetworkMocks.saveStateIfUnchanged).toHaveBeenCalledTimes(2);
  });

  it("retains a removing handle when external cleanup is only partially successful", async () => {
    const podRoot = "https://pods.example/alex/";
    const managerFetch = vi.fn(async () => new Response(null, { status: 204 }));
    const publication: RouteCatalogPublication = {
      phase: "published",
      phaseChangedAt: "2026-08-20T14:00:00.000Z",
      routeTemplateId: "69020722-f94e-4d99-9aac-37b33d5607c7",
      sourceDraftId: localStateWithActivity.drafts[0].id,
      sourceDraftUpdatedAt: localStateWithActivity.drafts[0].updatedAt,
      resourceUrl: `${podRoot}solid-tours/public/cataloged-routes/69020722-f94e-4d99-9aac-37b33d5607c7.geojson`,
      datasetIdentifier: "solid-tours-route-template-69020722-f94e-4d99-9aac-37b33d5607c7",
      catalogDatasetUrl: `${podRoot}catalog/ds/solid-tours-route-template-69020722-f94e-4d99-9aac-37b33d5607c7.ttl#it`,
      publishedAt: "2026-08-20T14:00:00.000Z",
    };
    let authoritative = { ...localStateWithActivity, catalogPublications: [publication] };
    podNetworkMocks.resolvePodRoot.mockResolvedValue(podRoot);
    podNetworkMocks.loadState.mockResolvedValue(authoritative);
    podNetworkMocks.loadStateSnapshot.mockImplementation(async () => ({
      state: authoritative,
      etag: '"state-v1"',
    }));
    podNetworkMocks.saveStateIfUnchanged.mockImplementation(async (_root, nextState) => {
      authoritative = nextState;
      return { state: nextState, etag: '"state-v2"' };
    });
    catalogMocks.removeCatalogEntry.mockRejectedValue(new TypeError("catalog unavailable"));

    act(() =>
      root.render(
        createElement(CityToursEmbed, {
          webId: NON_HANNAH_WEB_ID,
          session: {
            info: { isLoggedIn: true, webId: NON_HANNAH_WEB_ID },
            fetch: managerFetch,
          },
        })
      )
    );
    await waitForDom(() => expect(container.querySelector(".catalog-remove")).not.toBeNull());
    await act(async () => container.querySelector<HTMLButtonElement>(".catalog-remove")!.click());
    await act(async () =>
      container.querySelector<HTMLButtonElement>(".confirm-dialog--danger .danger")!.click()
    );

    await waitForDom(() =>
      expect(container.querySelector(".workspace-error")?.textContent).toContain(
        "nicht vollständig entfernt"
      )
    );
    expect(authoritative.catalogPublications[0].phase).toBe("removing");
    expect(podNetworkMocks.setOwnerOnlyIfPresent).toHaveBeenCalledOnce();
    expect(podNetworkMocks.safeDelete).toHaveBeenCalledOnce();
    expect(podNetworkMocks.saveStateIfUnchanged).toHaveBeenCalledOnce();
  });

  it("blocks Tab B unpublish while Tab A still owns the publishing lease", async () => {
    const podRoot = "https://pods.example/alex/";
    const managerFetch = vi.fn(async () => new Response(null, { status: 204 }));
    const publication: RouteCatalogPublication = {
      phase: "published",
      phaseChangedAt: "2026-08-20T14:00:00.000Z",
      routeTemplateId: "69020722-f94e-4d99-9aac-37b33d5607c7",
      sourceDraftId: localStateWithActivity.drafts[0].id,
      sourceDraftUpdatedAt: localStateWithActivity.drafts[0].updatedAt,
      resourceUrl: `${podRoot}solid-tours/public/cataloged-routes/69020722-f94e-4d99-9aac-37b33d5607c7.geojson`,
      datasetIdentifier: "solid-tours-route-template-69020722-f94e-4d99-9aac-37b33d5607c7",
      catalogDatasetUrl: `${podRoot}catalog/ds/solid-tours-route-template-69020722-f94e-4d99-9aac-37b33d5607c7.ttl#it`,
      publishedAt: "2026-08-20T14:00:00.000Z",
    };
    const renderedState = { ...localStateWithActivity, catalogPublications: [publication] };
    const authoritativeState = {
      ...renderedState,
      catalogPublications: [
        { ...publication, phase: "publishing" as const, phaseChangedAt: new Date().toISOString() },
      ],
    };
    podNetworkMocks.resolvePodRoot.mockResolvedValue(podRoot);
    podNetworkMocks.loadState.mockResolvedValue(renderedState);
    podNetworkMocks.loadStateSnapshot.mockResolvedValue({
      state: authoritativeState,
      etag: '"state-v2"',
    });

    act(() =>
      root.render(
        createElement(CityToursEmbed, {
          webId: NON_HANNAH_WEB_ID,
          session: {
            info: { isLoggedIn: true, webId: NON_HANNAH_WEB_ID },
            fetch: managerFetch,
          },
        })
      )
    );
    await waitForDom(() => expect(container.querySelector(".catalog-remove")).not.toBeNull());
    await act(async () => container.querySelector<HTMLButtonElement>(".catalog-remove")!.click());
    await act(async () =>
      container.querySelector<HTMLButtonElement>(".confirm-dialog--danger .danger")!.click()
    );

    await waitForDom(() =>
      expect(container.querySelector(".workspace-error")?.textContent).toContain(
        "gerade veröffentlicht"
      )
    );
    expect(catalogMocks.removeCatalogEntry).not.toHaveBeenCalled();
    expect(podNetworkMocks.setOwnerOnlyIfPresent).not.toHaveBeenCalled();
    expect(podNetworkMocks.safeDelete).not.toHaveBeenCalled();
    expect(podNetworkMocks.saveStateIfUnchanged).not.toHaveBeenCalled();
  });

  it("does not duplicate cleanup already claimed by another tab", async () => {
    const podRoot = "https://pods.example/alex/";
    const managerFetch = vi.fn(async () => new Response(null, { status: 204 }));
    const publication: RouteCatalogPublication = {
      phase: "published",
      phaseChangedAt: "2026-08-20T14:00:00.000Z",
      routeTemplateId: "69020722-f94e-4d99-9aac-37b33d5607c7",
      sourceDraftId: localStateWithActivity.drafts[0].id,
      sourceDraftUpdatedAt: localStateWithActivity.drafts[0].updatedAt,
      resourceUrl: `${podRoot}solid-tours/public/cataloged-routes/69020722-f94e-4d99-9aac-37b33d5607c7.geojson`,
      datasetIdentifier: "solid-tours-route-template-69020722-f94e-4d99-9aac-37b33d5607c7",
      catalogDatasetUrl: `${podRoot}catalog/ds/solid-tours-route-template-69020722-f94e-4d99-9aac-37b33d5607c7.ttl#it`,
      publishedAt: "2026-08-20T14:00:00.000Z",
    };
    const renderedState = { ...localStateWithActivity, catalogPublications: [publication] };
    const authoritativeState = {
      ...renderedState,
      catalogPublications: [
        { ...publication, phase: "removing" as const, phaseChangedAt: new Date().toISOString() },
      ],
    };
    podNetworkMocks.resolvePodRoot.mockResolvedValue(podRoot);
    podNetworkMocks.loadState.mockResolvedValue(renderedState);
    podNetworkMocks.loadStateSnapshot.mockResolvedValue({
      state: authoritativeState,
      etag: '"state-v2"',
    });

    act(() =>
      root.render(
        createElement(CityToursEmbed, {
          webId: NON_HANNAH_WEB_ID,
          session: {
            info: { isLoggedIn: true, webId: NON_HANNAH_WEB_ID },
            fetch: managerFetch,
          },
        })
      )
    );
    await waitForDom(() => expect(container.querySelector(".catalog-remove")).not.toBeNull());
    await act(async () => container.querySelector<HTMLButtonElement>(".catalog-remove")!.click());
    await act(async () =>
      container.querySelector<HTMLButtonElement>(".confirm-dialog--danger .danger")!.click()
    );

    await waitForDom(() =>
      expect(container.querySelector(".workspace-error")?.textContent).toContain(
        "anderen Tab entfernt"
      )
    );
    expect(catalogMocks.removeCatalogEntry).not.toHaveBeenCalled();
    expect(podNetworkMocks.safeDelete).not.toHaveBeenCalled();
    expect(podNetworkMocks.saveStateIfUnchanged).not.toHaveBeenCalled();
  });

  it.each(["publishing", "removing"] as const)(
    "recovers a stale %s reservation after a crashed tab",
    async (phase) => {
      const podRoot = "https://pods.example/alex/";
      const managerFetch = vi.fn(async () => new Response(null, { status: 204 }));
      const publication: RouteCatalogPublication = {
        phase,
        phaseChangedAt: new Date(Date.now() - 16 * 60 * 1000).toISOString(),
        routeTemplateId: "69020722-f94e-4d99-9aac-37b33d5607c7",
        sourceDraftId: localStateWithActivity.drafts[0].id,
        sourceDraftUpdatedAt: localStateWithActivity.drafts[0].updatedAt,
        resourceUrl: `${podRoot}solid-tours/public/cataloged-routes/69020722-f94e-4d99-9aac-37b33d5607c7.geojson`,
        datasetIdentifier: "solid-tours-route-template-69020722-f94e-4d99-9aac-37b33d5607c7",
        catalogDatasetUrl: `${podRoot}catalog/ds/solid-tours-route-template-69020722-f94e-4d99-9aac-37b33d5607c7.ttl#it`,
        publishedAt: "2026-08-20T14:00:00.000Z",
      };
      let authoritative = { ...localStateWithActivity, catalogPublications: [publication] };
      let stateVersion = 1;
      podNetworkMocks.resolvePodRoot.mockResolvedValue(podRoot);
      podNetworkMocks.loadState.mockResolvedValue(authoritative);
      podNetworkMocks.loadStateSnapshot.mockImplementation(async () => ({
        state: authoritative,
        etag: `"state-v${stateVersion}"`,
      }));
      podNetworkMocks.saveStateIfUnchanged.mockImplementation(async (_root, nextState) => {
        authoritative = nextState;
        stateVersion += 1;
        return { state: nextState, etag: `"state-v${stateVersion}"` };
      });

      act(() =>
        root.render(
          createElement(CityToursEmbed, {
            webId: NON_HANNAH_WEB_ID,
            session: {
              info: { isLoggedIn: true, webId: NON_HANNAH_WEB_ID },
              fetch: managerFetch,
            },
          })
        )
      );
      await waitForDom(() => expect(container.querySelector(".catalog-remove")).not.toBeNull());
      await act(async () => container.querySelector<HTMLButtonElement>(".catalog-remove")!.click());
      await act(async () =>
        container.querySelector<HTMLButtonElement>(".confirm-dialog--danger .danger")!.click()
      );

      await waitForDom(() => expect(authoritative.catalogPublications).toHaveLength(0));
      expect(catalogMocks.removeCatalogEntry).toHaveBeenCalledOnce();
      if (phase === "publishing") {
        expect(
          podNetworkMocks.saveStateIfUnchanged.mock.calls[0][1].catalogPublications[0].phase
        ).toBe("removing");
        expect(podNetworkMocks.saveStateIfUnchanged).toHaveBeenCalledTimes(2);
      } else {
        expect(podNetworkMocks.saveStateIfUnchanged).toHaveBeenCalledOnce();
      }
    }
  );

  it("keeps a deterministic cleanup handle when a public route write loses its response", async () => {
    const podRoot = "https://pods.example/alex/";
    const managerFetch = vi.fn(async () => new Response(null, { status: 204 }));
    let authoritative = localStateWithActivity;
    let etag = '"state-v1"';
    podNetworkMocks.resolvePodRoot.mockResolvedValue(podRoot);
    podNetworkMocks.loadState.mockResolvedValue(localStateWithActivity);
    podNetworkMocks.loadStateSnapshot.mockImplementation(async () => ({
      state: authoritative,
      etag,
    }));
    podNetworkMocks.saveStateIfUnchanged.mockImplementation(
      async (_root, nextState) => {
        authoritative = nextState;
        etag = etag === '"state-v1"' ? '"state-v2"' : '"state-v3"';
        return { state: nextState, etag };
      }
    );
    podNetworkMocks.savePublicRouteTemplate.mockRejectedValue(
      new TypeError("public PUT response lost")
    );

    act(() =>
      root.render(
        createElement(CityToursEmbed, {
          webId: NON_HANNAH_WEB_ID,
          session: {
            info: { isLoggedIn: true, webId: NON_HANNAH_WEB_ID },
            fetch: managerFetch,
          },
        })
      )
    );
    await waitForDom(() => expect(container.querySelector(".catalog-index")).not.toBeNull());
    await act(async () => container.querySelector<HTMLButtonElement>(".catalog-index")!.click());
    await act(async () =>
      container.querySelector<HTMLButtonElement>(".confirm-dialog--catalog .primary")!.click()
    );

    await waitForDom(() => expect(podNetworkMocks.safeDelete).toHaveBeenCalledOnce());
    const stagedPublication = podNetworkMocks.saveStateIfUnchanged.mock.calls[0][1]
      .catalogPublications[0];
    expect(podNetworkMocks.safeDelete).toHaveBeenCalledWith(
      stagedPublication.resourceUrl,
      expect.any(Function)
    );
    expect(catalogMocks.removeCatalogEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        datasetIdentifier: stagedPublication.datasetIdentifier,
        catalogDatasetUrl: stagedPublication.catalogDatasetUrl,
      })
    );
    await waitForDom(() => expect(authoritative.catalogPublications).toHaveLength(0));
  });

  it("blocks draft deletion when another tab cataloged the route after the dialog opened", async () => {
    const podRoot = "https://pods.example/alex/";
    const managerFetch = vi.fn(async () => new Response(null, { status: 204 }));
    const publication = {
      phase: "published" as const,
      phaseChangedAt: "2026-08-20T14:00:00.000Z",
      routeTemplateId: "69020722-f94e-4d99-9aac-37b33d5607c7",
      sourceDraftId: localStateWithActivity.drafts[0].id,
      sourceDraftUpdatedAt: localStateWithActivity.drafts[0].updatedAt,
      resourceUrl: `${podRoot}solid-tours/public/cataloged-routes/69020722-f94e-4d99-9aac-37b33d5607c7.geojson`,
      datasetIdentifier: "solid-tours-route-template-69020722-f94e-4d99-9aac-37b33d5607c7",
      catalogDatasetUrl: `${podRoot}catalog/ds/solid-tours-route-template-69020722-f94e-4d99-9aac-37b33d5607c7.ttl#it`,
      publishedAt: "2026-08-20T14:00:00.000Z",
    };
    podNetworkMocks.resolvePodRoot.mockResolvedValue(podRoot);
    podNetworkMocks.loadState.mockResolvedValue(localStateWithActivity);
    podNetworkMocks.loadStateSnapshot.mockResolvedValue({
      state: { ...localStateWithActivity, catalogPublications: [publication] },
      etag: '"state-v2"',
    });

    act(() =>
      root.render(
        createElement(CityToursEmbed, {
          webId: NON_HANNAH_WEB_ID,
          session: {
            info: { isLoggedIn: true, webId: NON_HANNAH_WEB_ID },
            fetch: managerFetch,
          },
        })
      )
    );
    await waitForDom(() => expect(container.querySelector(".draft-item .delete-link")).not.toBeNull());
    await act(async () =>
      container.querySelector<HTMLButtonElement>(".draft-item .delete-link")!.click()
    );
    await confirmDeleteDialog(container);

    await waitForDom(() =>
      expect(container.querySelector(".workspace-error")?.textContent).toContain(
        "öffentlichen Routenkatalog"
      )
    );
    expect(podNetworkMocks.deleteDraft).not.toHaveBeenCalled();
    expect(podNetworkMocks.saveStateIfUnchanged).not.toHaveBeenCalled();
  });

  it("keeps embed state while following controlled English and German language props", async () => {
    podNetworkMocks.loadState.mockResolvedValue(localStateWithActivity);
    const props = {
      webId: NON_HANNAH_WEB_ID,
      demoWebId: HANNAH_WEB_ID,
    };

    act(() =>
      root.render(createElement(RawCityToursEmbed, { ...props, language: "en" }))
    );
    await waitForDom(() => expect(container.textContent).toContain("Tour planner"));

    expect(container.querySelector(".language-toggle")).toBeNull();
    expect(container.querySelector(".map-legend")?.textContent).toContain("Current tour");
    expect(leafletMocks.zoomControlFactory).toHaveBeenLastCalledWith({
      position: "topleft",
      zoomInTitle: "Zoom in",
      zoomOutTitle: "Zoom out",
    });
    expect(container.querySelector(".completion-date-field input")).toBeNull();
    act(() => {
      window.dispatchEvent(
        new CustomEvent(TOURS_LANGUAGE_EVENT, { detail: { language: "de" } })
      );
    });
    expect(container.textContent).toContain("Tour planner");
    act(() => container.querySelector<HTMLButtonElement>(".edit-draft-button")!.click());
    const nameInput = container.querySelector<HTMLInputElement>(".form-grid input")!;
    act(() => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!;
      valueSetter.call(nameInput, "Hannah's custom route");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>(".save-draft-button")!.click();
    });
    await waitForDom(() => expect(container.querySelector(".edit-draft-button")).not.toBeNull());
    const completeButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button")
    ).find((button) => button.textContent === "Record activity")!;
    act(() => completeButton.click());
    expect(container.querySelector(".confirm-dialog")?.textContent).toContain(
      "Save this tour as completed?"
    );
    expect(container.querySelector(".confirm-dialog .language-toggle")).toBeNull();

    act(() =>
      root.render(createElement(RawCityToursEmbed, { ...props, language: "de" }))
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
    expect(container.querySelector<HTMLInputElement>(".completion-date-field input")?.placeholder).toBe(
      "TT.MM.JJJJ"
    );
  });

  it("marks invalid English date input without depending on German error copy", async () => {
    podNetworkMocks.loadState.mockResolvedValue(localStateWithActivity);
    act(() => root.render(createElement(RawCityToursEmbed, { webId: NON_HANNAH_WEB_ID, language: "en" })));
    await waitForDom(() => expect(container.querySelector(".tour-completion .primary")).not.toBeNull());
    act(() => container.querySelector<HTMLButtonElement>(".tour-completion .primary")!.click());
    const dateInput = container.querySelector<HTMLInputElement>(".completion-date-field input")!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(dateInput, "31.02.2026");
      dateInput.dispatchEvent(new Event("input", { bubbles: true }));
      container.querySelector<HTMLInputElement>('input[value="walking"]')!.click();
    });
    act(() => container.querySelector<HTMLButtonElement>(".confirm-dialog .primary")!.click());
    expect(dateInput.getAttribute("aria-invalid")).toBe("true");
    expect(dateInput.getAttribute("aria-describedby")).toBe("completion-date-error");
    expect(container.querySelector("#completion-date-error")?.textContent).toContain("Invalid date");
    expect(container.querySelector("dialog[open]")).not.toBeNull();
    expect(podNetworkMocks.saveActivityConditionally).not.toHaveBeenCalled();
  });

  it("does not translate a user-entered name that equals a generated default", async () => {
    act(() =>
      root.render(
        createElement(RawCityToursEmbed, {
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
        createElement(RawCityToursEmbed, {
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

  it("keeps undo available after clearing the route", async () => {
    act(() =>
      root.render(
        createElement(CityToursEmbed, {
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
    expect(container.querySelector(".map-edit-toolbar")).not.toBeNull();
    const undo = container.querySelector<HTMLButtonElement>(".map-tool-button")!;
    expect(undo.disabled).toBe(false);
    act(() => undo.click());
    expect(clearButton!.disabled).toBe(false);
  });

  it("renders smooth routes without per-vertex dots and uses map clicks for selection in view mode", async () => {
    const secondDraft = {
      ...localStateWithActivity.drafts[0],
      id: "8db47d3b-8a4f-4a74-b086-77c1c7630bf7",
      name: "Nordbahntrasse",
      geometry: [Array.from({ length: 80 }, (_, index) => [
        7.1 + index * 0.0005,
        51.2 + index * 0.0002,
      ])],
    };
    const twoRouteState = {
      ...localStateWithActivity,
      drafts: [localStateWithActivity.drafts[0], secondDraft],
    };
    expect(validateLocalToursState(twoRouteState).drafts).toHaveLength(2);
    window.localStorage.setItem(
      localStateKeyForIdentity(null),
      JSON.stringify(twoRouteState)
    );

    act(() => root.render(createElement(CityToursEmbed, {})));
    await waitForDom(() => expect(container.querySelectorAll(".draft-item")).toHaveLength(2));

    expect(leafletMocks.circleMarkerFactory).toHaveBeenCalled();
    expect(leafletMocks.circleMarkerFactory.mock.calls.length).toBeLessThan(10);
    expect(leafletMocks.polylineFactory.mock.calls).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          expect.any(Array),
          expect.objectContaining({
            smoothFactor: 1.5,
            lineCap: "round",
            lineJoin: "round",
            bubblingMouseEvents: false,
          }),
        ]),
      ])
    );

    const mapClickRegistration = leafletMocks.map.on.mock.calls.find(
      ([eventName]) => eventName === "click"
    )!;
    const handleMapClick = mapClickRegistration[1] as (event: {
      latlng: { lng: number; lat: number };
    }) => void;
    const renderCountBeforeViewClick = leafletMocks.polylineFactory.mock.calls.length;
    act(() => handleMapClick({ latlng: { lng: 7.25, lat: 51.3 } }));
    expect(leafletMocks.polylineFactory).toHaveBeenCalledTimes(renderCountBeforeViewClick);
    expect(container.querySelector(".workspace-error")).toBeNull();

    const selectableRouteLayer = leafletMocks.routeLayers.find(
      (layer) =>
        layer.options.color === "#174ea6" &&
        layer.on.mock.calls.some(([eventName]) => eventName === "click")
    );
    expect(selectableRouteLayer).toBeDefined();
    act(() =>
      selectableRouteLayer!.click({ latlng: { lng: 7.2, lat: 51.24 } })
    );
    expect(container.querySelector<HTMLInputElement>(".form-grid input")?.value).toBe(
      "Nordbahntrasse"
    );
    expect(
      container.querySelector<HTMLButtonElement>('.list-item[aria-current="true"]')?.textContent
    ).toContain("Nordbahntrasse");
    expect(container.querySelector(".workspace-error")).toBeNull();

    act(() => container.querySelector<HTMLButtonElement>(".edit-draft-button")!.click());
    const activeRouteLayer = [...leafletMocks.routeLayers]
      .reverse()
      .find((layer) => layer.options.color === "#d97706");
    expect(activeRouteLayer?.options).toEqual(
      expect.objectContaining({
        interactive: true,
        bubblingMouseEvents: false,
      })
    );
    const renderCountBeforeActiveRouteClick = leafletMocks.polylineFactory.mock.calls.length;
    act(() =>
      activeRouteLayer!.click({ latlng: { lng: 7.22, lat: 51.26 } })
    );
    expect(leafletMocks.polylineFactory).toHaveBeenCalledTimes(
      renderCountBeforeActiveRouteClick
    );

    const renderCountBeforeEditClick = leafletMocks.polylineFactory.mock.calls.length;
    act(() => handleMapClick({ latlng: { lng: 7.26, lat: 51.31 } }));
    expect(leafletMocks.polylineFactory.mock.calls.length).toBeGreaterThan(
      renderCountBeforeEditClick
    );
    act(() => container.querySelector<HTMLButtonElement>(".cancel-edit-button")!.click());
    expect(container.querySelector<HTMLInputElement>(".form-grid input")?.value).toBe(
      "Nordbahntrasse"
    );
    expect(container.querySelector(".edit-draft-button")).not.toBeNull();
    expect(podNetworkMocks.saveDraftConditionally).not.toHaveBeenCalled();
  });

  it("keeps unsaved editor changes when a route import is attempted", async () => {
    window.localStorage.setItem(
      localStateKeyForIdentity(null),
      JSON.stringify(localStateWithActivity)
    );
    act(() => root.render(createElement(CityToursEmbed, {})));
    await waitForDom(() => expect(container.querySelector(".edit-draft-button")).not.toBeNull());

    act(() => container.querySelector<HTMLButtonElement>(".edit-draft-button")!.click());
    const nameInput = container.querySelector<HTMLInputElement>(".form-grid input")!;
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!;
    act(() => {
      valueSetter.call(nameInput, "Ungespeicherte Änderungen");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const routeFile = new File(
      [
        JSON.stringify({
          type: "Feature",
          properties: { name: "Importierte Route" },
          geometry: {
            type: "LineString",
            coordinates: [[7.3, 51.3], [7.4, 51.4]],
          },
        }),
      ],
      "imported-route.geojson",
      { type: "application/geo+json" }
    );
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(fileInput, "files", {
      configurable: true,
      value: [routeFile],
    });
    await act(async () => {
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await waitForDom(() => {
      expect(container.querySelector(".confirm-dialog")?.textContent).toContain("Ungespeicherte Änderungen");
      expect(container.querySelector(".confirm-dialog")?.textContent).toContain("Verwerfen und weiter");
    });
    expect(container.querySelector<HTMLInputElement>(".form-grid input")?.value).toBe(
      "Ungespeicherte Änderungen"
    );
    expect(container.querySelectorAll(".draft-item")).toHaveLength(1);
    expect(
      JSON.parse(window.localStorage.getItem(localStateKeyForIdentity(null))!).drafts
    ).toEqual(localStateWithActivity.drafts);
  });

  it("keeps unsaved editor changes when duplicating a stored route is attempted", async () => {
    window.localStorage.setItem(
      localStateKeyForIdentity(null),
      JSON.stringify(localStateWithActivity)
    );
    act(() => root.render(createElement(CityToursEmbed, {})));
    await waitForDom(() => expect(container.querySelector(".edit-draft-button")).not.toBeNull());

    act(() => container.querySelector<HTMLButtonElement>(".edit-draft-button")!.click());
    const nameInput = container.querySelector<HTMLInputElement>(".form-grid input")!;
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!;
    act(() => {
      valueSetter.call(nameInput, "Ungespeicherte Änderungen");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const duplicateButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>(".draft-actions button")
    ).find((button) => button.textContent === "Duplizieren")!;
    await act(async () => duplicateButton.click());

    await waitForDom(() => {
      expect(container.querySelector(".confirm-dialog")?.textContent).toContain("Ungespeicherte Änderungen");
      expect(container.querySelector(".confirm-dialog")?.textContent).toContain("Verwerfen und weiter");
    });
    expect(container.querySelector<HTMLInputElement>(".form-grid input")?.value).toBe(
      "Ungespeicherte Änderungen"
    );
    expect(container.querySelectorAll(".draft-item")).toHaveLength(1);
    expect(
      JSON.parse(window.localStorage.getItem(localStateKeyForIdentity(null))!).drafts
    ).toEqual(localStateWithActivity.drafts);
  });

  it("keeps unsaved editor changes when adopting a catalog route is attempted", async () => {
    const managerFetch = vi.fn(async () => new Response(null, { status: 204 }));
    podNetworkMocks.loadState.mockResolvedValue(localStateWithActivity);
    catalogMocks.discoverCatalogedRoutes.mockResolvedValue([
      {
        routeTemplateId: "69020722-f94e-4d99-9aac-37b33d5607c7",
        identifier: "solid-tours-route-template-69020722-f94e-4d99-9aac-37b33d5607c7",
        name: "Katalogroute",
        description: "Öffentliche Teststrecke",
        publisher: "Tour Publisher",
        datasetUrl: "https://pods.example/publisher/catalog/ds/route.ttl#it",
        distributionUrl: "https://pods.example/publisher/public/route.geojson",
        geometry: [[[7.3, 51.3], [7.4, 51.4]]],
        distanceMeters: 12_000,
      },
    ]);
    act(() =>
      root.render(
        createElement(CityToursEmbed, {
          webId: NON_HANNAH_WEB_ID,
          session: {
            info: { isLoggedIn: true, webId: NON_HANNAH_WEB_ID },
            fetch: managerFetch,
          },
        })
      )
    );
    await waitForDom(() => {
      expect(container.querySelector(".edit-draft-button")).not.toBeNull();
      expect(container.querySelector(".catalog-adopt")).not.toBeNull();
    });

    act(() => container.querySelector<HTMLButtonElement>(".edit-draft-button")!.click());
    const nameInput = container.querySelector<HTMLInputElement>(".form-grid input")!;
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!;
    act(() => {
      valueSetter.call(nameInput, "Ungespeicherte Änderungen");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () =>
      container.querySelector<HTMLButtonElement>(".catalog-adopt")!.click()
    );

    await waitForDom(() => {
      expect(container.querySelector(".confirm-dialog")?.textContent).toContain("Ungespeicherte Änderungen");
      expect(container.querySelector(".confirm-dialog")?.textContent).toContain("Verwerfen und weiter");
    });
    expect(container.querySelector<HTMLInputElement>(".form-grid input")?.value).toBe(
      "Ungespeicherte Änderungen"
    );
    expect(container.querySelectorAll(".draft-item")).toHaveLength(1);
    expect(podNetworkMocks.saveDraftConditionally).not.toHaveBeenCalled();
    expect(podNetworkMocks.saveState).not.toHaveBeenCalled();
  });

  it("removes a Catalog route immediately after adopting it and persists its stable identity", async () => {
    const managerFetch = vi.fn(async () => new Response(null, { status: 204 }));
    const catalogRoute = {
      routeTemplateId: "69020722-f94e-4d99-9aac-37b33d5607c7",
      identifier: "solid-tours-route-template-69020722-f94e-4d99-9aac-37b33d5607c7",
      name: "Katalogroute",
      description: "Ã–ffentliche Teststrecke",
      publisher: "Tour Publisher",
      datasetUrl: "https://pods.example/publisher/catalog/ds/route.ttl#it",
      distributionUrl: "https://pods.example/publisher/public/route.geojson",
      geometry: [[[7.3, 51.3], [7.4, 51.4]]] as [[number, number][]],
      distanceMeters: 12_000,
    };
    podNetworkMocks.loadState.mockResolvedValue(localStateWithActivity);
    catalogMocks.discoverCatalogedRoutes.mockResolvedValue([catalogRoute]);
    act(() =>
      root.render(
        createElement(CityToursEmbed, {
          webId: NON_HANNAH_WEB_ID,
          session: {
            info: { isLoggedIn: true, webId: NON_HANNAH_WEB_ID },
            fetch: managerFetch,
          },
        })
      )
    );
    await waitForDom(() => expect(container.querySelector(".catalog-adopt")).not.toBeNull());

    await act(async () => container.querySelector<HTMLButtonElement>(".catalog-adopt")!.click());

    await waitForDom(() => {
      expect(container.querySelector(".catalog-route-item")).toBeNull();
      expect(container.querySelectorAll(".draft-item")).toHaveLength(2);
    });
    const adoptedDraftItem = Array.from(
      container.querySelectorAll<HTMLElement>(".draft-item")
    ).find((item) => item.textContent?.includes(catalogRoute.name));
    expect(adoptedDraftItem).toBeDefined();
    expect(adoptedDraftItem?.querySelector(".catalog-index")).toBeNull();
    expect(podNetworkMocks.saveDraftConditionally).toHaveBeenCalledTimes(1);
    expect(podNetworkMocks.saveDraftConditionally.mock.calls[0][1]).toMatchObject({
      adoptedFromCatalog: {
        routeTemplateId: catalogRoute.routeTemplateId,
        datasetUrl: catalogRoute.datasetUrl,
        distributionUrl: catalogRoute.distributionUrl,
      },
    });
    expect(podNetworkMocks.saveState.mock.calls[0][1].drafts[0]).toMatchObject({
      adoptedFromCatalog: {
        routeTemplateId: catalogRoute.routeTemplateId,
        datasetUrl: catalogRoute.datasetUrl,
        distributionUrl: catalogRoute.distributionUrl,
      },
    });
  });

  it("keeps an adopted Catalog route hidden after Pod state is reloaded", async () => {
    const managerFetch = vi.fn(async () => new Response(null, { status: 204 }));
    const catalogRoute = {
      routeTemplateId: "69020722-f94e-4d99-9aac-37b33d5607c7",
      identifier: "solid-tours-route-template-69020722-f94e-4d99-9aac-37b33d5607c7",
      name: "Renamed catalog route",
      description: "Ã–ffentliche Teststrecke",
      publisher: "Updated Publisher",
      datasetUrl: "https://pods.example/publisher/catalog/ds/route.ttl#it",
      distributionUrl: "https://pods.example/publisher/public/route.geojson",
      geometry: [[[7.3, 51.3], [7.4, 51.4]]] as [[number, number][]],
      distanceMeters: 12_000,
    };
    podNetworkMocks.loadState.mockResolvedValue({
      ...localStateWithActivity,
      drafts: [
        {
          id: "8db47d3b-8a4f-4a74-b086-77c1c7630bf7",
          name: "Original catalog route name",
          routeSource: "geojson",
          geometry: catalogRoute.geometry,
          adoptedFromCatalog: {
            routeTemplateId: catalogRoute.routeTemplateId,
            datasetUrl: catalogRoute.datasetUrl,
            distributionUrl: catalogRoute.distributionUrl,
          },
          createdAt: "2026-08-20T12:00:00.000Z",
          updatedAt: "2026-08-20T12:00:00.000Z",
        },
      ],
    });
    catalogMocks.discoverCatalogedRoutes.mockResolvedValue([catalogRoute]);

    act(() =>
      root.render(
        createElement(CityToursEmbed, {
          webId: NON_HANNAH_WEB_ID,
          session: {
            info: { isLoggedIn: true, webId: NON_HANNAH_WEB_ID },
            fetch: managerFetch,
          },
        })
      )
    );

    await waitForDom(() => {
      expect(container.querySelector(".catalog-routes-card")).not.toBeNull();
      expect(container.querySelector(".catalog-route-item")).toBeNull();
      expect(container.querySelector(".catalog-route-list .empty")).not.toBeNull();
    });
  });

  it("does not offer the current Pod's indexed route as a Catalog adoption", async () => {
    const podRoot = "https://pods.example/alex/";
    const managerFetch = vi.fn(async () => new Response(null, { status: 204 }));
    const routeTemplateId = "69020722-f94e-4d99-9aac-37b33d5607c7";
    const datasetIdentifier = `${ROUTE_TEMPLATE_IDENTIFIER_PREFIX}${routeTemplateId}`;
    const publication: RouteCatalogPublication = {
      phase: "published",
      phaseChangedAt: "2026-08-20T14:00:00.000Z",
      routeTemplateId,
      sourceDraftId: localStateWithActivity.drafts[0].id,
      sourceDraftUpdatedAt: localStateWithActivity.drafts[0].updatedAt,
      resourceUrl: `${podRoot}solid-tours/public/cataloged-routes/${routeTemplateId}.geojson`,
      datasetIdentifier,
      catalogDatasetUrl: `${podRoot}catalog/ds/${datasetIdentifier}.ttl#it`,
      publishedAt: "2026-08-20T14:00:00.000Z",
    };
    podNetworkMocks.resolvePodRoot.mockResolvedValue(podRoot);
    podNetworkMocks.loadState.mockResolvedValue({
      ...localStateWithActivity,
      catalogPublications: [publication],
    });
    catalogMocks.discoverCatalogedRoutes.mockResolvedValue([
      {
        routeTemplateId,
        identifier: datasetIdentifier,
        name: "Rundweg A2 Ronsdorfer Talsperre",
        description: "Public route",
        publisher: "Hannah Mueller",
        // Older aggregated Catalog records can omit creatorWebId. The private
        // publication URLs still identify this as the current Pod's route.
        datasetUrl: publication.catalogDatasetUrl,
        distributionUrl: publication.resourceUrl,
        geometry: localStateWithActivity.drafts[0].geometry,
        distanceMeters: 13_100,
      },
    ]);

    act(() =>
      root.render(
        createElement(CityToursEmbed, {
          webId: NON_HANNAH_WEB_ID,
          session: {
            info: { isLoggedIn: true, webId: NON_HANNAH_WEB_ID },
            fetch: managerFetch,
          },
        })
      )
    );

    await waitForDom(() => {
      expect(container.querySelector(".catalog-routes-card")).not.toBeNull();
      expect(container.querySelector(".catalog-route-item")).toBeNull();
      expect(container.querySelector(".catalog-route-list .empty")).not.toBeNull();
    });
    expect(container.querySelector(".catalog-remove")).not.toBeNull();
  });

  it("adopts one ambiguous legacy match and keeps the other Catalog entry available", async () => {
    const managerFetch = vi.fn(async () => new Response(null, { status: 204 }));
    const geometry = [[[7.3, 51.3], [7.4, 51.4]]] as [[number, number][]];
    const firstRoute = {
      routeTemplateId: "69020722-f94e-4d99-9aac-37b33d5607c7",
      identifier: "solid-tours-route-template-69020722-f94e-4d99-9aac-37b33d5607c7",
      name: "Legacy duplicate",
      description: "Public test route",
      publisher: "Publisher A",
      datasetUrl: "https://pods.example/a/catalog/ds/route.ttl#it",
      distributionUrl: "https://pods.example/a/public/route.geojson",
      geometry,
      distanceMeters: 12_000,
    };
    const secondRoute = {
      ...firstRoute,
      routeTemplateId: "79020722-f94e-4d99-9aac-37b33d5607c7",
      identifier: "solid-tours-route-template-79020722-f94e-4d99-9aac-37b33d5607c7",
      publisher: "Publisher B",
      datasetUrl: "https://pods.example/b/catalog/ds/route.ttl#it",
      distributionUrl: "https://pods.example/b/public/route.geojson",
    };
    podNetworkMocks.loadState.mockResolvedValue({
      ...localStateWithActivity,
      drafts: [{
        id: "8db47d3b-8a4f-4a74-b086-77c1c7630bf7",
        name: firstRoute.name,
        routeSource: "geojson",
        geometry,
        createdAt: "2026-08-20T12:00:00.000Z",
        updatedAt: "2026-08-20T12:00:00.000Z",
      }],
    });
    catalogMocks.discoverCatalogedRoutes.mockResolvedValue([
      firstRoute,
      secondRoute,
    ]);

    act(() =>
      root.render(
        createElement(CityToursEmbed, {
          webId: NON_HANNAH_WEB_ID,
          session: {
            info: { isLoggedIn: true, webId: NON_HANNAH_WEB_ID },
            fetch: managerFetch,
          },
        })
      )
    );
    await waitForDom(() => {
      expect(container.querySelectorAll(".catalog-adopt")).toHaveLength(2);
    });

    await act(async () =>
      container.querySelectorAll<HTMLButtonElement>(".catalog-adopt")[0].click()
    );

    await waitForDom(() => {
      expect(podNetworkMocks.saveDraftConditionally).toHaveBeenCalledOnce();
      expect(container.querySelectorAll(".catalog-route-item")).toHaveLength(1);
    });
    expect(podNetworkMocks.saveDraftConditionally.mock.calls[0][1]).toMatchObject({
      adoptedFromCatalog: {
        routeTemplateId: firstRoute.routeTemplateId,
        datasetUrl: firstRoute.datasetUrl,
        distributionUrl: firstRoute.distributionUrl,
      },
    });
    expect(container.querySelector(".catalog-route-item")?.textContent).toContain(
      "Publisher B"
    );
  });

  it("never sends a routing request when points are drawn", async () => {
    const runtimeFetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));
    try {
      act(() =>
        root.render(
          createElement(CityToursEmbed, {
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
    podNetworkMocks.loadState.mockResolvedValue(localStateWithActivity);
    act(() => root.render(createElement(RawCityToursEmbed, { webId: NON_HANNAH_WEB_ID, language: "de" })));
    await waitForDom(() => expect(container.querySelector(".tour-completion .primary")).not.toBeNull());
    act(() => container.querySelector<HTMLButtonElement>(".tour-completion .primary")!.click());
    const dateInput = container.querySelector<HTMLInputElement>(".completion-date-field input")!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(dateInput, "31.02.2026");
      dateInput.dispatchEvent(new Event("input", { bubbles: true }));
      container.querySelector<HTMLInputElement>('input[value="walking"]')!.click();
    });
    act(() => container.querySelector<HTMLButtonElement>(".confirm-dialog .primary")!.click());
    expect(dateInput.getAttribute("aria-invalid")).toBe("true");
    expect(dateInput.getAttribute("aria-describedby")).toBe("completion-date-error");
    expect(container.querySelector("#completion-date-error")?.textContent).toContain("TT.MM.JJJJ");
    expect(container.querySelector("dialog[open]")).not.toBeNull();
    expect(podNetworkMocks.saveActivityConditionally).not.toHaveBeenCalled();
  });

  it("does not show a success notification after saving a completed tour", async () => {
    podNetworkMocks.loadState.mockResolvedValue(localStateWithActivity);
    act(() =>
      root.render(
        createElement(CityToursEmbed, {
          webId: NON_HANNAH_WEB_ID,
          demoWebId: HANNAH_WEB_ID,
        })
      )
    );

    await waitForDom(() => {
      expect(container.querySelectorAll(".activity-item")).toHaveLength(1);
    });

    const completeButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "Als absolviert eintragen"
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
        createElement(CityToursEmbed, {
          webId: NON_HANNAH_WEB_ID,
          demoWebId: HANNAH_WEB_ID,
        })
      )
    );

    await waitForDom(() => {
      expect(container.querySelectorAll(".activity-item")).toHaveLength(1);
    });
    const completeButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent === "Als absolviert eintragen"
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
      const session: CityToursSession = {
        info: { isLoggedIn: true, webId: HANNAH_WEB_ID },
        fetch: managerFetch,
      };

      act(() => {
        root.render(
          mode === "embed"
            ? createElement(CityToursEmbed, {
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
      expect(container.querySelector(".confirm-dialog:not(.completion-loading-card)")).toBeNull();
      expect(container.querySelector(".city-tours-app--modal-open")).not.toBeNull();
      expect(container.querySelector(`.city-tours-app--${mode === "embed" ? "embedded" : "standalone"}`)).not.toBeNull();

      await act(async () => {
        resolveActivity({ etag: '"activity-new"' });
      });
      await waitForDom(() => {
        expect(container.querySelector('[data-testid="completion-loading-overlay"]')).toBeNull();
        expect(container.querySelectorAll(".activity-item")).toHaveLength(2);
      });
      expect(container.querySelector(".city-tours-app--modal-open")).toBeNull();
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
        createElement(CityToursEmbed, {
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
      expect(container.querySelector(".workspace-error")?.textContent).toContain(
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
        createElement(CityToursEmbed, {
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
        createElement(CityToursEmbed, {
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
      new StateConflictError("Der City-Tours-Status wurde zwischenzeitlich geändert.")
    );

    act(() =>
      root.render(
        createElement(CityToursEmbed, {
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
      expect(container.querySelector(".workspace-error")?.textContent).toContain(
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
      new StateConflictError("Der City-Tours-Status wurde zwischenzeitlich geändert.")
    );

    act(() =>
      root.render(
        createElement(CityToursEmbed, {
          webId: HANNAH_WEB_ID,
          demoWebId: HANNAH_WEB_ID,
          session: {
            info: { isLoggedIn: true, webId: HANNAH_WEB_ID },
            fetch: managerFetch,
          },
        })
      )
    );
    await waitForDom(() => expect(container.querySelector(".edit-draft-button")).not.toBeNull());
    act(() => container.querySelector<HTMLButtonElement>(".edit-draft-button")!.click());
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
        createElement(CityToursEmbed, {
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
        createElement(CityToursEmbed, {
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
        createElement(CityToursEmbed, {
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
        createElement(CityToursEmbed, {
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
    expect(container.querySelector(".workspace-error")).toBeNull();
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
        createElement(CityToursEmbed, {
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
      expect(container.querySelector(".workspace-error")?.textContent).toContain(
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
        createElement(CityToursEmbed, {
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
        createElement(CityToursEmbed, {
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
        createElement(CityToursEmbed, {
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
      expect(container.querySelector(".workspace-error")?.textContent).toContain(
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
        createElement(CityToursEmbed, {
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
      expect(container.querySelector(".workspace-error")?.textContent).toContain(
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
        createElement(CityToursEmbed, {
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
        createElement(CityToursEmbed, {
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
      expect(container.querySelector(".workspace-error")?.textContent).toContain(
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

  it("shows dismissible action errors beside the planner without covering map controls", async () => {
    act(() =>
      root.render(
        createElement(CityToursEmbed, {
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
      expect(container.querySelector(".workspace-error")?.textContent).toContain(
        "Die Tour braucht mindestens zwei Punkte."
      );
    });
    const overlay = container.querySelector(".workspace-error")!;
    expect(overlay.getAttribute("role")).toBe("alert");
    expect(overlay.closest(".planner-scroll")).not.toBeNull();
    expect(overlay.closest(".map-stage")).toBeNull();
    expect(container.querySelector(".tours-shell > .notice")).toBeNull();
    const close = overlay.querySelector<HTMLButtonElement>('[aria-label="Fehlermeldung schließen"]')!;
    act(() => close.click());
    expect(container.querySelector(".workspace-error")).toBeNull();
  });

  it("keeps the deprecated demo-WebID prop compatible without gating Pod access", async () => {
    act(() =>
      root.render(
        createElement(CityToursEmbed, {
          webId: NON_HANNAH_WEB_ID,
          demoWebId: "not-a-webid",
        })
      )
    );

    await waitForDom(() => expect(container.querySelector(".route-workspace")).not.toBeNull());
    expect(container.querySelector(".workspace-error")).toBeNull();
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
        createElement(CityToursEmbed, {
          webId: HANNAH_WEB_ID,
          demoWebId: HANNAH_WEB_ID,
          session: managerSession,
        })
      )
    );

    await waitForDom(() => {
      expect(container.querySelector(".publish")).not.toBeNull();
    });

    expect(container.textContent).toContain("Spende vorbereiten");
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
        createElement(CityToursEmbed, {
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
    const managerSession: CityToursSession = {
      info: { isLoggedIn: true, webId: HANNAH_WEB_ID },
      fetch: hannahFetch,
    };

    act(() =>
      root.render(
        createElement(CityToursEmbed, {
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
        createElement(CityToursEmbed, {
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
          createElement(CityToursEmbed, {
            webId: HANNAH_WEB_ID,
            demoWebId: HANNAH_WEB_ID,
            session: {
              info: { isLoggedIn: true, webId: HANNAH_WEB_ID },
              fetch: firstFetch,
            },
          })
        );
        secondRoot.render(
          createElement(CityToursEmbed, {
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
        requestAndConfirmDonation(container);
        requestAndConfirmDonation(secondContainer);
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
          createElement(CityToursEmbed, {
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
      act(() => requestAndConfirmDonation(container));
      await waitForDom(() => expect(catalogMocks.publishCatalogEntry).toHaveBeenCalledOnce());

      const firstRunId = authoritativeRun()!.scenarioRunId;
      expect(authoritativeRun()?.phase).toBe("publishing");
      act(() =>
        resetRoot.render(
          createElement(CityToursEmbed, {
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
      await act(async () => requestAndConfirmDonation(resetContainer, ".health-donation-actions .danger"));
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
        expect(container.querySelector(".workspace-error")).not.toBeNull();
      });
      expect(authoritativeState.activeRun).toBeNull();
      expect(podNetworkMocks.clearPublishedMarker).toHaveBeenCalledWith(
        podRoot,
        firstRunId,
        expect.any(Function)
      );

      await act(async () => requestAndConfirmDonation(resetContainer));
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
      new StateConflictError("Der City-Tours-Status wurde zwischenzeitlich geändert.")
    );

    act(() =>
      root.render(
        createElement(CityToursEmbed, {
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
    await act(async () => requestAndConfirmDonation(container));

    await waitForDom(() => {
      expect(container.querySelector(".workspace-error")?.textContent).toContain(
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
        createElement(CityToursEmbed, {
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
    await act(async () => requestAndConfirmDonation(container));

    await waitForDom(() => {
      expect(container.querySelector(".workspace-error")?.textContent).toContain(
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
        createElement(CityToursEmbed, {
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
    await act(async () => requestAndConfirmDonation(container));

    await waitForDom(() => {
      expect(container.querySelector(".workspace-error")?.textContent).toContain("unvollst");
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
        createElement(CityToursEmbed, {
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
    await act(async () => requestAndConfirmDonation(container));

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
        createElement(CityToursEmbed, {
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
        "Spende vorbereiten"
      );
    });

    expect(container.querySelectorAll(".activity-item")).toHaveLength(2);
    expect(container.querySelectorAll(".publish")).toHaveLength(1);
    expect(container.querySelector(".activity-item .publish")).toBeNull();
    expect(container.querySelector(".health-donation-actions > .publish")).not.toBeNull();

    await act(async () => {
      requestAndConfirmDonation(container);
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
        "Spende widerrufen"
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
        createElement(CityToursEmbed, {
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
        "Spende widerrufen"
      );
    });

    await act(async () => {
      requestAndConfirmDonation(container, ".health-donation-actions .danger");
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
        new StateConflictError("Der City-Tours-Status wurde zwischenzeitlich geändert.")
      )
      .mockImplementationOnce(async (_root, nextState) => ({
        state: nextState,
        etag: '"state-v4"',
      }));

    act(() =>
      root.render(
        createElement(CityToursEmbed, {
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
    await act(async () => requestAndConfirmDonation(container, ".health-donation-actions .danger"));

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
