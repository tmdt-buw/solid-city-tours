import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L, {
  type LatLngExpression,
  type LeafletMouseEvent,
} from "leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

import FontAwesomeIcon from "./FontAwesomeIcon";
import {
  catalogPublicationReference,
  publishCatalogEntry,
  removeCatalogEntry,
} from "./catalog";
import { revokeAndArchiveScenarioAccess } from "./accessRequests";
import {
  completeTour,
  createId,
  isValidGeometry,
  previewActivityCompletion,
  publishedActivityCollection,
  routeDistanceMeters,
} from "./domain";
import { hasDemoPodAccess, resolveDemoWebId, storageModeForIdentity } from "./demoAccess";
import { importRouteFile } from "./importers";
import { datePlaceholder, formatDate, parseDate } from "./dateUtils";
import {
  loadLocalToursStateForIdentity,
  saveLocalToursStateForIdentity,
} from "./localStorage";
import { rollbackPublishedScenario } from "./publicationRollback";
import { getSession, restoreSession } from "./solidSession";
import {
  activityMasterExists,
  clearPublishedMarker,
  deleteActivity,
  deleteDraft,
  EMPTY_STATE,
  ensureStorage,
  isActivityMasterConflictError,
  isStateConflictError,
  loadActivityMasterSnapshot,
  loadDraftMasterSnapshot,
  loadState,
  loadStateSnapshot,
  resolvePodRoot,
  safeDelete,
  safeDeleteContainer,
  setOwnerOnlyIfPresent,
  saveActivityConditionally,
  saveDraftConditionally,
  saveInterestsIfMissing,
  saveRunSnapshot,
  saveState,
  saveStateIfUnchanged,
  storageUrls,
  type StateSnapshot,
  writePublishedMarker,
} from "./solidStorage";
import type {
  ActiveRun,
  ActivitySummary,
  ActivityType,
  CompletedActivity,
  Coordinate,
  MultiLineCoordinates,
  TourDraft,
  ToursState,
} from "./types";
import { validateActiveRun } from "./stateValidation";
import { initializeOnce } from "./mapLifecycle";
import StandaloneLogin from "./StandaloneLogin";
import LanguageToggle from "./LanguageToggle";
import {
  DEFAULT_TOURS_LANGUAGE,
  localizeUserFacingMessage,
  normalizeToursLanguage,
  publishToursLanguage,
  readStoredToursLanguage,
  TOURS_LANGUAGE_EVENT,
  translate,
  type ToursLanguage,
  type ToursTranslationKey,
} from "./i18n";
import { appVersion } from "./version";
import type { SolidFetch, SolidToursSession } from "./embedAuth";
import {
  loadSolidProfileSummary,
  type SolidProfileSummary,
} from "./solidProfile";

const AUTH_BRIDGE_KEY = "__SOLID_DATASPACE_AUTH__";
const DEFAULT_ISSUER = "https://solid-community-server.tmdt.info";
const WUPPERTAL: LatLngExpression = [51.2562, 7.1508];
const RECOVERY_STATE_CAS_ATTEMPTS = 3;
type BridgeState = { isLoggedIn: boolean; webId: string | null };
type DeleteConfirmation =
  | { kind: "draft"; item: TourDraft }
  | { kind: "activity"; item: CompletedActivity; donationReplacement: boolean };
type HostAuthBridge = {
  isReady?: boolean;
  getState: () => BridgeState;
  getFetch: () => SolidFetch;
  subscribe?: (callback: (state: BridgeState) => void) => () => void;
  login?: (issuer?: string) => Promise<void>;
  logout?: () => Promise<void>;
};

const sameBridgeState = (left: BridgeState, right: BridgeState) =>
  left.isLoggedIn === right.isLoggedIn && left.webId === right.webId;

const sameRunIgnoringPhase = (left: ActiveRun, right: ActiveRun): boolean => {
  const { phase: _leftPhase, ...leftIdentity } = left;
  const { phase: _rightPhase, ...rightIdentity } = right;
  return JSON.stringify(leftIdentity) === JSON.stringify(rightIdentity);
};

function guardFetchForAuthSnapshot(
  fetcher: SolidFetch,
  expected: BridgeState,
  current: () => BridgeState
): SolidFetch {
  const assertUnchanged = () => {
    if (!expected.isLoggedIn || !expected.webId || !sameBridgeState(current(), expected)) {
      throw new Error("Die Solid-Sitzung hat sich geaendert. Die alte Aktion wurde abgebrochen.");
    }
  };
  return (async (input, init) => {
    assertUnchanged();
    const response = await fetcher(input, init);
    assertUnchanged();
    return response;
  }) as SolidFetch;
}

async function persistRecoveryRunAfterPartialRollback({
  podRoot,
  recoveryRun,
  initialSnapshot,
  ownerWebId,
  fetcher,
  onObserved,
}: {
  podRoot: string;
  recoveryRun: ActiveRun;
  initialSnapshot: StateSnapshot;
  ownerWebId: string;
  fetcher: SolidFetch;
  onObserved: (snapshot: StateSnapshot) => void;
}): Promise<StateSnapshot> {
  let snapshot = initialSnapshot;
  for (let attempt = 0; attempt < RECOVERY_STATE_CAS_ATTEMPTS; attempt += 1) {
    onObserved(snapshot);
    const currentRun = snapshot.state.activeRun
      ? validateActiveRun(podRoot, snapshot.state.activeRun)
      : null;
    if (currentRun) {
      if (!sameRunIgnoringPhase(currentRun, recoveryRun)) {
        throw new Error(
          "Ein anderer Szenariolauf ist inzwischen aktiv. Der aktuelle Pod-Stand wurde uebernommen."
        );
      }
      return snapshot;
    }
    if (!snapshot.etag) {
      throw new Error(
        "Der unvollstaendige Szenariolauf konnte ohne starken Status-Versionsnachweis nicht gesichert werden."
      );
    }

    try {
      return await saveStateIfUnchanged(
        podRoot,
        { ...snapshot.state, activeRun: recoveryRun },
        snapshot.etag,
        ownerWebId,
        fetcher
      );
    } catch (error) {
      if (!isStateConflictError(error)) throw error;
      snapshot = await loadStateSnapshot(podRoot, fetcher);
      onObserved(snapshot);
      if (attempt === RECOVERY_STATE_CAS_ATTEMPTS - 1) {
        throw new AggregateError(
          [error],
          "Der unvollstaendige Szenariolauf konnte nach mehreren parallelen Statusaenderungen nicht gesichert werden."
        );
      }
    }
  }
  return snapshot;
}

export type ToursAppProps = {
  embedded?: boolean;
  webIdOverride?: string | null;
  demoWebIdOverride?: string | null;
  language?: string | null;
  session?: SolidToursSession | null;
};

function getHostBridge(): HostAuthBridge | null {
  if (typeof window === "undefined" || window.parent === window) return null;
  try {
    if (window.parent.location.origin !== window.location.origin) return null;
    const bridge = (window.parent as Window & Record<string, unknown>)[
      AUTH_BRIDGE_KEY
    ] as HostAuthBridge | undefined;
    return bridge?.isReady ? bridge : null;
  } catch {
    return null;
  }
}

const today = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};

const newDraft = (language: ToursLanguage = DEFAULT_TOURS_LANGUAGE): TourDraft => {
  const now = new Date().toISOString();
  return {
    id: createId(),
    name: translate(language, "defaultTourName"),
    routeSource: "drawn",
    geometry: [[]],
    createdAt: now,
    updatedAt: now,
  };
};

const position = ([longitude, latitude]: Coordinate): LatLngExpression => [latitude, longitude];

function TourMap({
  geometry,
  savedRoutes,
  onPoint,
  language,
}: {
  geometry: MultiLineCoordinates;
  savedRoutes: TourDraft[];
  onPoint: (point: Coordinate) => void;
  language: ToursLanguage;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const overlayRef = useRef<L.LayerGroup | null>(null);
  const zoomControlRef = useRef<L.Control.Zoom | null>(null);
  const zoomControlLanguageRef = useRef<ToursLanguage | null>(null);
  const languageRef = useRef(language);
  languageRef.current = language;
  const onPointRef = useRef(onPoint);
  onPointRef.current = onPoint;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = initializeOnce(mapRef.current, () =>
      L.map(container, { scrollWheelZoom: true, zoomControl: false }).setView(WUPPERTAL, 13)
    );
    mapRef.current = map;
    overlayRef.current = L.layerGroup().addTo(map);
    zoomControlRef.current = L.control.zoom({
      position: "topleft",
      zoomInTitle: translate(languageRef.current, "zoomIn"),
      zoomOutTitle: translate(languageRef.current, "zoomOut"),
    }).addTo(map);
    zoomControlLanguageRef.current = languageRef.current;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    const handleClick = (event: LeafletMouseEvent) => {
      onPointRef.current([event.latlng.lng, event.latlng.lat]);
    };
    map.on("click", handleClick);
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => map.invalidateSize({ pan: false }));
    resizeObserver?.observe(container);

    return () => {
      resizeObserver?.disconnect();
      map.off("click", handleClick);
      map.remove();
      if (mapRef.current === map) mapRef.current = null;
      overlayRef.current = null;
      zoomControlRef.current = null;
      zoomControlLanguageRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || zoomControlLanguageRef.current === language) return;
    zoomControlRef.current?.remove();
    zoomControlRef.current = L.control.zoom({
      position: "topleft",
      zoomInTitle: translate(language, "zoomIn"),
      zoomOutTitle: translate(language, "zoomOut"),
    }).addTo(map);
    zoomControlLanguageRef.current = language;
  }, [language]);

  useEffect(() => {
    const map = mapRef.current;
    const overlay = overlayRef.current;
    const container = containerRef.current;
    if (!map || !overlay || !container) return;

    overlay.clearLayers();
    savedRoutes.forEach((savedRoute) => {
      savedRoute.geometry
        .filter((line) => line.length >= 2)
        .forEach((line) => {
          L.polyline(line.map(position), {
            color: "#174ea6",
            opacity: .62,
            weight: 3,
          }).addTo(overlay);
        });
    });
    geometry
      .filter((line) => line.length >= 2)
      .forEach((line) => {
        L.polyline(line.map(position), {
          color: "#d97706",
          opacity: .96,
          weight: 6,
        }).addTo(overlay);
      });
    geometry.flat().forEach((point) => {
      L.circleMarker(position(point), {
        radius: 6,
        color: "#153c4d",
        fillColor: "#f6c85f",
        fillOpacity: 1,
      }).addTo(overlay);
    });

    const points = geometry.flat();
    if (points.length >= 2) {
      map.fitBounds(L.latLngBounds(points.map(position)), { padding: [24, 24] });
    }
  }, [geometry, savedRoutes]);

  return <div ref={containerRef} className="tour-map" />;
}

const numberLocale = (language: ToursLanguage) => (language === "de" ? "de-DE" : "en-US");

const distanceLabel = (geometry: MultiLineCoordinates, language: ToursLanguage) =>
  `${(routeDistanceMeters(geometry) / 1000).toLocaleString(numberLocale(language), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} km`;

function summaryText(activity: CompletedActivity, language: ToursLanguage) {
  const summary = activity.activitySummary;
  const base = `${(summary.distanceMeters / 1000).toLocaleString(numberLocale(language), {
    maximumFractionDigits: 1,
  })} km · ${summary.activeMinutes} ${translate(language, "minutesShort")}`;
  return "estimatedSteps" in summary
    ? `${base} · ${translate(language, "approximately")} ${summary.estimatedSteps.toLocaleString(numberLocale(language))} ${language === "en" ? translate(language, "steps").toLowerCase() : translate(language, "steps")}`
    : `${base} · ${translate(language, "averageSpeed")} ${summary.averageSpeedKmh.toLocaleString(numberLocale(language))} km/h`;
}

function CompletionLoadingOverlay({
  activityType,
  label,
}: {
  activityType: ActivityType;
  label: string;
}) {
  const icon = activityType === "cycling" ? "bicycle" : "person-walking";

  return (
    <div
      className="modal-backdrop completion-loading-backdrop"
      role="presentation"
      data-testid="completion-loading-overlay"
    >
      <section
        className={`completion-loading-card completion-loading-card--${activityType}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="completion-loading-title"
        aria-busy="true"
        data-activity-type={activityType}
      >
        <div className="completion-journey" aria-hidden="true">
          <svg viewBox="0 0 400 100" preserveAspectRatio="none">
            <path
              className="completion-route-shadow"
              d="M28 72 C58 72 61 39 92 39 C124 39 130 58 160 58 C195 58 198 30 232 30 C267 30 275 52 306 52 C342 52 348 29 372 29"
              pathLength="100"
            />
            <path
              className="completion-route-dash"
              d="M28 72 C58 72 61 39 92 39 C124 39 130 58 160 58 C195 58 198 30 232 30 C267 30 275 52 306 52 C342 52 348 29 372 29"
              pathLength="100"
            />
            <circle className="completion-route-point" cx="28" cy="72" r="5" />
            <circle
              className="completion-route-point completion-route-point--destination"
              cx="372"
              cy="29"
              r="7"
            />
          </svg>
          <span className="completion-traveller">
            <span className="completion-traveller-badge">
              <FontAwesomeIcon icon={icon} />
            </span>
          </span>
        </div>
        <strong
          id="completion-loading-title"
          className="completion-loading-label"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {label}
        </strong>
        <div className="completion-progress-rail" role="progressbar" aria-label={label}>
          <span />
        </div>
      </section>
    </div>
  );
}

export default function App({
  embedded = false,
  webIdOverride = null,
  demoWebIdOverride = null,
  language: languageProp = null,
  session: injectedSession = null,
}: ToursAppProps) {
  const [standaloneLanguage, setStandaloneLanguage] = useState<ToursLanguage>(() =>
    readStoredToursLanguage()
  );
  const language = embedded
    ? normalizeToursLanguage(languageProp)
    : standaloneLanguage;
  const languageRef = useRef(language);
  languageRef.current = language;
  const generatedDefaultDraftIds = useRef<Set<string>>(new Set());
  const createGeneratedDraft = useCallback(() => {
    const freshDraft = newDraft(languageRef.current);
    generatedDefaultDraftIds.current.add(freshDraft.id);
    return freshDraft;
  }, []);
  const t = (key: ToursTranslationKey, values?: Record<string, string | number>) =>
    translate(language, key, values);
  const changeStandaloneLanguage = (nextLanguage: ToursLanguage) => {
    setStandaloneLanguage(nextLanguage);
    publishToursLanguage(nextLanguage);
  };
  useEffect(() => {
    if (embedded || typeof window === "undefined") return;
    const applyExternalLanguage = (nextLanguage: string | null | undefined) => {
      setStandaloneLanguage(normalizeToursLanguage(nextLanguage));
    };
    const handleLanguageEvent = (event: Event) => {
      const detail = (event as CustomEvent<{ language?: string }>).detail;
      applyExternalLanguage(detail?.language);
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === "solid-dataspace.language") {
        applyExternalLanguage(event.newValue);
      }
    };
    window.addEventListener(TOURS_LANGUAGE_EVENT, handleLanguageEvent);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(TOURS_LANGUAGE_EVENT, handleLanguageEvent);
      window.removeEventListener("storage", handleStorage);
    };
  }, [embedded]);
  useEffect(() => {
    if (embedded || typeof document === "undefined") return;
    const previousLanguage = document.documentElement.lang;
    document.documentElement.lang = language;
    return () => {
      document.documentElement.lang = previousLanguage;
    };
  }, [embedded, language]);
  const demoConfiguration = useMemo(() => {
    try {
      return { webId: resolveDemoWebId(demoWebIdOverride), error: null };
    } catch {
      return {
        webId: null,
        error: "Die Demo-Pod-Konfiguration ist ungültig. Die Tourenplanung bleibt verfügbar.",
      };
    }
  }, [demoWebIdOverride]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authenticatedWebId, setAuthenticatedWebId] = useState<string | null>(null);
  const [authenticatedFetch, setAuthenticatedFetch] = useState<SolidFetch | null>(null);
  const [authenticatedProfile, setAuthenticatedProfile] =
    useState<SolidProfileSummary>({ name: "Solid User" });
  const [authenticatedPhotoSrc, setAuthenticatedPhotoSrc] =
    useState<string | null>(null);
  const [webId, setWebId] = useState<string | null>(null);
  const [solidFetch, setSolidFetch] = useState<SolidFetch | null>(null);
  const [podRoot, setPodRoot] = useState<string | null>(null);
  const [state, setState] = useState<ToursState>({ ...EMPTY_STATE, drafts: [], activities: [] });
  const [draft, setDraft] = useState<TourDraft>(() => createGeneratedDraft());
  const [completedDateInput, setCompletedDateInput] = useState(() => formatDate(today(), language));
  const [completedDateError, setCompletedDateError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [completionInProgress, setCompletionInProgress] = useState<ActivityType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [demoErrorDismissed, setDemoErrorDismissed] = useState(false);
  const [bridge, setBridge] = useState<HostAuthBridge | null>(null);
  const [completeConfirmation, setCompleteConfirmation] = useState<{
    completedDate: string;
    activityType: ActivityType | null;
    summary: ActivitySummary | null;
  } | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] =
    useState<DeleteConfirmation | null>(null);
  const authRevision = useRef(0);
  const completionOperationRevision = useRef(0);
  const demoPodAccessActive = useRef(false);
  const previousLanguageRef = useRef(language);

  useEffect(() => {
    const previousLanguage = previousLanguageRef.current;
    if (previousLanguage === language) return;
    setDraft((current) => {
      const isUnsaved = !state.drafts.some((storedDraft) => storedDraft.id === current.id);
      const wasGeneratedDefault =
        generatedDefaultDraftIds.current.has(current.id) &&
        current.name === translate(previousLanguage, "defaultTourName");
      return isUnsaved && wasGeneratedDefault
        ? { ...current, name: translate(language, "defaultTourName") }
        : current;
    });
    previousLanguageRef.current = language;
  }, [language, state.drafts]);

  const injectedSessionFetchSource = injectedSession?.fetch || null;
  const injectedSessionFetch = useMemo<SolidFetch | null>(() => {
    if (!injectedSession || !injectedSessionFetchSource) return null;
    const pinnedFetch = injectedSessionFetchSource;
    return (input, init) => pinnedFetch.call(injectedSession, input, init);
  }, [injectedSession, injectedSessionFetchSource]);

  const activateState = useCallback((stored: ToursState) => {
    setState(stored);
    const firstDraft = stored.drafts[0];
    setDraft(
      firstDraft
        ? {
            ...firstDraft,
            geometry: firstDraft.geometry.map((line) =>
              line.map(([longitude, latitude]) => [longitude, latitude])
            ),
          }
        : createGeneratedDraft()
    );
  }, [createGeneratedDraft]);

  const activateLocalMode = useCallback((identityWebId: string | null = null) => {
    demoPodAccessActive.current = false;
    completionOperationRevision.current += 1;
    setCompletionInProgress(null);
    setCompleteConfirmation(null);
    setDeleteConfirmation(null);
    setWebId(null);
    setSolidFetch(null);
    setPodRoot(null);
    try {
      activateState(loadLocalToursStateForIdentity(identityWebId));
    } catch (reason) {
      activateState({ ...EMPTY_STATE, drafts: [], activities: [] });
      setError(reason instanceof Error ? reason.message : "Der gespeicherte Verlauf konnte nicht geladen werden.");
    }
  }, [activateState]);

  const applyAuth = useCallback(async (auth: BridgeState, fetcher?: SolidFetch) => {
    const revision = ++authRevision.current;
    demoPodAccessActive.current = false;
    const authenticated = Boolean(auth.isLoggedIn && auth.webId);
    setIsAuthenticated(authenticated);
    setAuthenticatedWebId(authenticated ? auth.webId : null);
    setAuthenticatedFetch(authenticated && fetcher ? () => fetcher : null);
    setBusy(false);
    completionOperationRevision.current += 1;
    setCompletionInProgress(null);
    setError(null);
    setCompleteConfirmation(null);
    setDeleteConfirmation(null);

    if (
      !authenticated ||
      !auth.webId ||
      !fetcher ||
      !demoConfiguration.webId ||
      storageModeForIdentity(auth.webId, demoConfiguration.webId) !== "demo-pod"
    ) {
      activateLocalMode(auth.webId);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const root = await resolvePodRoot(auth.webId, fetcher);
      if (revision !== authRevision.current) return;
      await ensureStorage(root, auth.webId, fetcher);
      if (revision !== authRevision.current) return;
      const stored = await loadState(root, fetcher);
      if (revision !== authRevision.current) return;
      demoPodAccessActive.current = true;
      setWebId(auth.webId);
      setSolidFetch(() => fetcher);
      setPodRoot(root);
      activateState(stored);
    } catch (reason) {
      if (revision !== authRevision.current) return;
      activateLocalMode(auth.webId);
      setError(reason instanceof Error ? reason.message : "Solid Tours konnte nicht geladen werden.");
    } finally {
      if (revision === authRevision.current) setLoading(false);
    }
  }, [activateLocalMode, activateState, demoConfiguration.webId]);

  useEffect(() => {
    let cancelled = false;
    if (embedded || !isAuthenticated || !authenticatedWebId || !authenticatedFetch) {
      setAuthenticatedProfile({ name: "Solid User" });
      return () => {
        cancelled = true;
      };
    }

    setAuthenticatedProfile({ name: "Solid User" });
    void loadSolidProfileSummary(authenticatedWebId, authenticatedFetch).then((profile) => {
      if (!cancelled) setAuthenticatedProfile(profile);
    });
    return () => {
      cancelled = true;
    };
  }, [authenticatedFetch, authenticatedWebId, embedded, isAuthenticated]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setAuthenticatedPhotoSrc(null);
    if (embedded || !authenticatedFetch || !authenticatedProfile.photoUrl) {
      return () => {
        cancelled = true;
      };
    }

    void authenticatedFetch(authenticatedProfile.photoUrl)
      .then((response) => {
        if (!response.ok) throw new Error("Profile photo unavailable");
        return response.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setAuthenticatedPhotoSrc(objectUrl);
      })
      .catch(() => {
        // The authenticated identity remains visible when its photo is private
        // or unavailable.
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [authenticatedFetch, authenticatedProfile.photoUrl, embedded]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    const boot = async () => {
      const host = embedded ? null : getHostBridge();
      if (host) {
        setBridge(host);
        const applyHostAuth = async (auth: BridgeState) => {
          const hostFetch = host.getFetch();
          const guardedFetch = guardFetchForAuthSnapshot(hostFetch, auth, () => host.getState());
          await applyAuth(auth, guardedFetch);
        };
        if (!cancelled) await applyHostAuth(host.getState());
        unsubscribe = host.subscribe?.((next) => {
          if (!cancelled) void applyHostAuth(next);
        });
        return;
      }
      const session = injectedSession || getSession();
      let restoreError: string | null = null;
      if (!embedded) {
        try {
          await restoreSession();
        } catch {
          restoreError =
            "Die Solid-Sitzung konnte nicht wiederhergestellt werden. Bitte melde dich erneut an.";
        }
      }
      if (cancelled) return;
      const sessionWebId = session.info?.webId || null;
      if (webIdOverride && sessionWebId && webIdOverride !== sessionWebId) {
        await applyAuth({ isLoggedIn: false, webId: null });
        if (!cancelled) {
          setError("Die angeforderte WebID stimmt nicht mit der Solid-Sitzung ueberein.");
        }
        return;
      }
      const nextWebId = webIdOverride || sessionWebId;
      const auth = {
        isLoggedIn: Boolean(nextWebId && session.info?.isLoggedIn !== false),
        webId: nextWebId,
      };
      const sessionFetch = session.fetch;
      const pinnedFetch: SolidFetch =
        injectedSessionFetch || ((input, init) => sessionFetch.call(session, input, init));
      const fetcher = auth.isLoggedIn
        ? guardFetchForAuthSnapshot(pinnedFetch, auth, () => {
            const currentWebId = session.info?.webId || null;
            return {
              isLoggedIn: Boolean(currentWebId && session.info?.isLoggedIn !== false),
              webId: currentWebId,
            };
          })
        : pinnedFetch;
      await applyAuth(auth, fetcher);
      if (!cancelled && restoreError && !nextWebId) setError(restoreError);
    };
    void boot();
    return () => {
      cancelled = true;
      authRevision.current += 1;
      completionOperationRevision.current += 1;
      demoPodAccessActive.current = false;
      unsubscribe?.();
    };
  }, [applyAuth, embedded, injectedSession, injectedSessionFetch, webIdOverride]);

  const setFailure = (reason: unknown) => {
    setError(reason instanceof Error ? reason.message : "Die Aktion ist fehlgeschlagen.");
  };

  const mutate = async (
    action: () => Promise<void>,
    { reportAfterAuthChange = false }: { reportAfterAuthChange?: boolean } = {}
  ) => {
    const mutationRevision = authRevision.current;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (reason) {
      if (mutationRevision === authRevision.current || reportAfterAuthChange) setFailure(reason);
    } finally {
      if (mutationRevision === authRevision.current) setBusy(false);
    }
  };

  const demoPodConnected = Boolean(
    demoPodAccessActive.current &&
      webId &&
      solidFetch &&
      podRoot &&
      demoConfiguration.webId &&
      hasDemoPodAccess(webId, demoConfiguration.webId)
  );
  const renderedAuthRevision = authRevision.current;
  const assertCurrentAuthContext = () => {
    if (renderedAuthRevision !== authRevision.current) {
      throw new Error("Die Solid-Sitzung hat sich geändert. Bitte wiederhole die Aktion.");
    }
  };

  const persistStateForCurrentMode = async (
    next: ToursState,
    baseState: ToursState = state
  ) => {
    assertCurrentAuthContext();
    if (demoPodConnected && podRoot && solidFetch && webId) {
      await saveState(podRoot, next, baseState, webId, solidFetch);
      assertCurrentAuthContext();
      return;
    }
    saveLocalToursStateForIdentity(
      { ...next, activeRun: null },
      authenticatedWebId
    );
  };

  const updateDraft = <K extends keyof TourDraft>(key: K, value: TourDraft[K]) =>
    setDraft((current) => {
      generatedDefaultDraftIds.current.delete(current.id);
      return { ...current, [key]: value, updatedAt: new Date().toISOString() };
    });

  const addPoint = (point: Coordinate) => {
    setDraft((current) => {
      generatedDefaultDraftIds.current.delete(current.id);
      const lines = current.geometry.length ? current.geometry.map((line) => [...line]) : [[]];
      lines[lines.length - 1].push(point);
      return {
        ...current,
        routeSource: "drawn",
        geometry: lines,
        durationMinutes: undefined,
        durationSource: undefined,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const undoPoint = () => {
    setDraft((current) => {
      generatedDefaultDraftIds.current.delete(current.id);
      const lines = current.geometry.map((line) => [...line]);
      while (lines.length > 0 && lines.at(-1)?.length === 0) lines.pop();
      lines.at(-1)?.pop();
      while (lines.length > 1 && lines.at(-1)?.length === 0) lines.pop();
      if (lines.length === 0) lines.push([]);
      return {
        ...current,
        geometry: lines,
        durationMinutes: undefined,
        durationSource: undefined,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const clearRoute = () => {
    setDraft((current) => {
      generatedDefaultDraftIds.current.delete(current.id);
      return {
        ...current,
        geometry: [[]],
        durationMinutes: undefined,
        durationSource: undefined,
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const importFile = (file: File | undefined) => {
    if (!file) return;
    void mutate(async () => {
      const imported = importRouteFile(file.name, await file.text(), {
        importedTour: t("importedTour"),
        importedGpxTour: t("importedGpxTour"),
      });
      assertCurrentAuthContext();
      const now = new Date().toISOString();
      setDraft({
        id: createId(),
        name: imported.name,
        routeSource: imported.routeSource,
        geometry: imported.geometry,
        durationMinutes: imported.durationMinutes,
        durationSource: imported.durationSource,
        createdAt: now,
        updatedAt: now,
      });
    });
  };

  const persistDraft = async (candidate: TourDraft): Promise<ToursState> => {
    assertCurrentAuthContext();
    if (!candidate.name.trim()) throw new Error("Gib der Tour einen Namen.");
    if (!isValidGeometry(candidate.geometry)) throw new Error("Die Tour braucht mindestens zwei Punkte.");
    const normalized = { ...candidate, name: candidate.name.trim(), updatedAt: new Date().toISOString() };
    const previousDraft = state.drafts.find((item) => item.id === normalized.id) || null;
    let writtenDraft: { etag: string } | null = null;
    if (demoPodConnected && podRoot && solidFetch && webId) {
      const previousSnapshot = previousDraft
        ? await loadDraftMasterSnapshot(podRoot, previousDraft, solidFetch)
        : null;
      assertCurrentAuthContext();
      writtenDraft = await saveDraftConditionally(
        podRoot,
        normalized,
        previousSnapshot?.etag || null,
        webId,
        solidFetch
      );
    }
    const next: ToursState = {
      ...state,
      activeRun: demoPodConnected ? state.activeRun : null,
      drafts: [normalized, ...state.drafts.filter((item) => item.id !== normalized.id)],
    };
    let stateCommitted = false;
    try {
      if (demoPodConnected && podRoot && solidFetch && webId) {
        assertCurrentAuthContext();
        await saveState(podRoot, next, state, webId, solidFetch);
        stateCommitted = true;
        assertCurrentAuthContext();
      } else {
        await persistStateForCurrentMode(next, state);
        stateCommitted = true;
      }
    } catch (stateError) {
      if (!stateCommitted && writtenDraft && podRoot && solidFetch && webId) {
        try {
          if (previousDraft) {
            await saveDraftConditionally(
              podRoot,
              previousDraft,
              writtenDraft.etag,
              webId,
              solidFetch
            );
          } else {
            await deleteDraft(podRoot, normalized.id, writtenDraft.etag, solidFetch);
          }
        } catch (compensationError) {
          throw new AggregateError(
            [stateError, compensationError],
            "Der Tourentwurf konnte nach einem Statuskonflikt nicht sicher zurückgerollt werden. Lade Solid Tours neu."
          );
        }
      }
      if (
        !stateCommitted &&
        isStateConflictError(stateError) &&
        podRoot &&
        solidFetch &&
        renderedAuthRevision === authRevision.current
      ) {
        try {
          const authoritative = await loadStateSnapshot(podRoot, solidFetch);
          if (renderedAuthRevision === authRevision.current) setState(authoritative.state);
        } catch (reloadError) {
          throw new AggregateError(
            [stateError, reloadError],
            "Der Pod-Stand hat sich geändert und konnte nicht neu geladen werden. Lade Solid Tours neu."
          );
        }
      }
      throw stateError;
    }
    setDraft(normalized);
    setState(next);
    return next;
  };

  const handleSave = () =>
    mutate(async () => {
      await persistDraft(draft);
    });

  const handleComplete = async (activityType: ActivityType, completionDate: string) => {
    const operationRevision = ++completionOperationRevision.current;
    setCompletionInProgress(activityType);
    try {
      await mutate(async () => {
        assertCurrentAuthContext();
        const stateWithDraft = await persistDraft(draft);
        assertCurrentAuthContext();
        const storedDraft = stateWithDraft.drafts.find((item) => item.id === draft.id) || draft;
        const activity = completeTour(storedDraft, completionDate, activityType);
        let writtenActivity: { etag: string } | null = null;
        if (demoPodConnected && podRoot && solidFetch && webId) {
          await saveInterestsIfMissing(podRoot, webId, solidFetch);
          assertCurrentAuthContext();
          writtenActivity = await saveActivityConditionally(podRoot, activity, webId, solidFetch);
        }
        const next = {
          ...stateWithDraft,
          activities: [activity, ...stateWithDraft.activities],
        };
        let stateCommitted = false;
        try {
          if (demoPodConnected && podRoot && solidFetch && webId) {
            assertCurrentAuthContext();
            await saveState(podRoot, next, stateWithDraft, webId, solidFetch);
            stateCommitted = true;
            assertCurrentAuthContext();
          } else {
            await persistStateForCurrentMode(next, stateWithDraft);
            stateCommitted = true;
          }
        } catch (stateError) {
          if (!stateCommitted && writtenActivity && podRoot && solidFetch) {
            const compensationErrors: unknown[] = [];
            let deleteError: unknown = null;
            try {
              await deleteActivity(podRoot, activity.id, writtenActivity.etag, solidFetch);
            } catch (reason) {
              deleteError = reason;
            }
            try {
              if (await activityMasterExists(podRoot, activity.id, solidFetch)) {
                if (deleteError) compensationErrors.push(deleteError);
                compensationErrors.push(
                  new Error("Die neu angelegte private Aktivität ist weiterhin im Pod vorhanden.")
                );
              }
            } catch (verificationError) {
              if (deleteError) compensationErrors.push(deleteError);
              compensationErrors.push(verificationError);
            }
            if (compensationErrors.length > 0) {
              throw new AggregateError(
                [stateError, ...compensationErrors],
                "Die neue Aktivität konnte nach einem Statuskonflikt nicht sicher entfernt werden. Lade Solid Tours neu."
              );
            }
          }
          if (
            !stateCommitted &&
            isStateConflictError(stateError) &&
            podRoot &&
            solidFetch &&
            renderedAuthRevision === authRevision.current
          ) {
            try {
              const authoritative = await loadStateSnapshot(podRoot, solidFetch);
              if (renderedAuthRevision === authRevision.current) setState(authoritative.state);
            } catch (reloadError) {
              throw new AggregateError(
                [stateError, reloadError],
                "Der Pod-Stand hat sich geändert und konnte nicht neu geladen werden. Lade Solid Tours neu."
              );
            }
          }
          throw stateError;
        }
        setState(next);
      });
    } finally {
      if (operationRevision === completionOperationRevision.current) {
        setCompletionInProgress(null);
      }
    }
  };

  const confirmCompletion = () => {
    setError(null);
    try {
      if (!draft.name.trim()) throw new Error("Gib der Tour einen Namen.");
      let normalizedCompletedDate: string;
      try {
        normalizedCompletedDate = parseDate(completedDateInput, language);
      } catch (dateError) {
        const message =
          dateError instanceof Error ? dateError.message : "Bitte gib ein gültiges Datum ein.";
        setCompletedDateError(message);
        throw dateError;
      }
      setCompletedDateInput(formatDate(normalizedCompletedDate, language));
      setCompletedDateError(null);
      if (!isValidGeometry(draft.geometry)) {
        throw new Error("Die Tour braucht mindestens zwei Punkte.");
      }
      // No activity is preselected: the route only becomes walking or cycling
      // after the user makes that explicit choice in the confirmation dialog.
      setCompleteConfirmation({
        completedDate: normalizedCompletedDate,
        activityType: null,
        summary: null,
      });
    } catch (reason) {
      setFailure(reason);
    }
  };

  const selectCompletionActivity = (activityType: ActivityType) => {
    if (!completeConfirmation) return;
    try {
      const summary = previewActivityCompletion(
        draft,
        completeConfirmation.completedDate,
        activityType
      );
      setCompleteConfirmation((current) =>
        current ? { ...current, activityType, summary } : current
      );
    } catch (reason) {
      setFailure(reason);
    }
  };

  const publishActivities = async (baseState: ToursState): Promise<ToursState> => {
      assertCurrentAuthContext();
      if (!demoPodConnected || !podRoot || !solidFetch || !webId) {
        throw new Error("Restricted Publish ist für dieses Konto nicht verfügbar.");
      }
      if (baseState.activeRun) throw new Error("Setze zuerst den aktiven Szenariolauf zurück.");
      const scenarioRunId = createId();
      const snapshotPayload = publishedActivityCollection(baseState.activities, scenarioRunId);
      const runContainerUrl = `${storageUrls(podRoot).runs}${scenarioRunId}/`;
      const resourceUrl = `${runContainerUrl}activity.geojson`;
      const manifestUrl = `${runContainerUrl}manifest.ttl`;
      const catalogReference = catalogPublicationReference(podRoot, scenarioRunId);
      const publishedAt = new Date().toISOString();
      const recoveryRun: ActiveRun = {
        phase: "publishing",
        scenarioRunId,
        activityIds: baseState.activities.map((activity) => activity.id),
        resourceUrl,
        manifestUrl,
        runContainerUrl,
        ...catalogReference,
        publishedAt,
      };
      let publication: Awaited<ReturnType<typeof publishCatalogEntry>> | null = null;
      let catalogAttempted = false;
      try {
        const reservedState = { ...baseState, activeRun: recoveryRun };
        await saveState(podRoot, reservedState, baseState, webId, solidFetch);
        assertCurrentAuthContext();
        const snapshot = await saveRunSnapshot(
          podRoot,
          scenarioRunId,
          snapshotPayload,
          webId,
          solidFetch
        );
        assertCurrentAuthContext();
        if (
          snapshot.resourceUrl !== resourceUrl ||
          snapshot.manifestUrl !== manifestUrl ||
          snapshot.runContainerUrl !== runContainerUrl
        ) {
          throw new Error("Der Pod-Snapshot antwortete mit unerwarteten Resource-Adressen.");
        }
        catalogAttempted = true;
        publication = await publishCatalogEntry({
          podRoot,
          webId,
          scenarioRunId,
          resourceUrl,
          fetcher: solidFetch,
        });
        assertCurrentAuthContext();
        if (
          publication.datasetIdentifier !== catalogReference.datasetIdentifier ||
          publication.catalogDatasetUrl !== catalogReference.catalogDatasetUrl
        ) {
          throw new Error("Der Katalog antwortete mit einer unerwarteten Dataset-Referenz.");
        }
        await writePublishedMarker(
          podRoot,
          {
            scenarioRunId,
            ...catalogReference,
            distributionUrl: resourceUrl,
            publishedAt,
          },
          webId,
          solidFetch
        );
        assertCurrentAuthContext();
        const authoritativeAfterMarker = await loadStateSnapshot(podRoot, solidFetch);
        assertCurrentAuthContext();
        const authoritativeRun = authoritativeAfterMarker.state.activeRun
          ? validateActiveRun(podRoot, authoritativeAfterMarker.state.activeRun)
          : null;
        if (
          !authoritativeAfterMarker.etag ||
          JSON.stringify(authoritativeRun) !== JSON.stringify(recoveryRun)
        ) {
          throw new Error(
            "Der Szenariolauf ist nach dem Marker-Update nicht mehr der autoritative Pod-Stand."
          );
        }
        const committed = await saveStateIfUnchanged(
          podRoot,
          {
            ...authoritativeAfterMarker.state,
            activeRun: { ...recoveryRun, phase: "published" },
          },
          authoritativeAfterMarker.etag,
          webId,
          solidFetch
        );
        assertCurrentAuthContext();
        setState(committed.state);
        return committed.state;
      } catch (reason) {
        const catalogCleanupReference = publication || catalogReference;
        const rollback = await rollbackPublishedScenario({
          clearMarker: () => clearPublishedMarker(podRoot, scenarioRunId, solidFetch),
          removeCatalog: catalogAttempted
            ? () =>
                removeCatalogEntry({
                  podRoot,
                  webId,
                  datasetIdentifier: catalogCleanupReference.datasetIdentifier,
                  catalogDatasetUrl: catalogCleanupReference.catalogDatasetUrl,
                  fetcher: solidFetch,
                })
            : undefined,
          removeManifest: () => safeDelete(manifestUrl, solidFetch),
          removeResource: () => safeDelete(resourceUrl, solidFetch),
          removeContainer: () => safeDeleteContainer(runContainerUrl, solidFetch),
        });

        let recoveryRequired = !rollback.fullyClean;
        if (recoveryRun) {
          let authoritativeOnFailure: ToursState | null = null;
          let authoritativeRunNeedsCleanup = false;
          try {
            const currentSnapshot = await loadStateSnapshot(podRoot, solidFetch);
            authoritativeOnFailure = currentSnapshot.state;
            const currentRun = currentSnapshot.state.activeRun
              ? validateActiveRun(podRoot, currentSnapshot.state.activeRun)
              : null;
            const sameRun =
              currentRun !== null &&
              currentRun.phase !== "resetting" &&
              sameRunIgnoringPhase(currentRun, recoveryRun);
            authoritativeRunNeedsCleanup = sameRun;

            if (rollback.fullyClean) {
              // A state-CAS conflict means our run was never committed. Adopt
              // the authoritative state and never manufacture a local recovery
              // run. If our run was committed before a later failure, clear
              // exactly that run against a fresh ETag and preserve other edits.
              if (sameRun) {
                if (!currentSnapshot.etag) {
                  throw new Error(
                    "Der aktive Szenariolauf besitzt keinen starken Status-Versionsnachweis."
                  );
                }
                const cleared = await saveStateIfUnchanged(
                  podRoot,
                  { ...currentSnapshot.state, activeRun: null },
                  currentSnapshot.etag,
                  webId,
                  solidFetch
                );
                authoritativeOnFailure = cleared.state;
                authoritativeRunNeedsCleanup = false;
                if (renderedAuthRevision === authRevision.current) setState(cleared.state);
              } else if (renderedAuthRevision === authRevision.current) {
                setState(currentSnapshot.state);
              }
              recoveryRequired = false;
            } else {
              recoveryRequired = true;
              if (currentRun && !sameRun) {
                if (renderedAuthRevision === authRevision.current) {
                  setState(currentSnapshot.state);
                }
                throw new Error(
                  "Ein anderer Szenariolauf ist inzwischen aktiv. Der aktuelle Pod-Stand wurde übernommen."
                );
              }
              if (!currentRun) {
                if (!currentSnapshot.etag) {
                  throw new Error(
                    "Der unvollständige Szenariolauf konnte ohne starken Status-Versionsnachweis nicht gesichert werden."
                  );
                }
                const recovered = await persistRecoveryRunAfterPartialRollback({
                  podRoot,
                  recoveryRun,
                  initialSnapshot: currentSnapshot,
                  ownerWebId: webId,
                  fetcher: solidFetch,
                  onObserved: (snapshot) => {
                    authoritativeOnFailure = snapshot.state;
                  },
                });
                authoritativeOnFailure = recovered.state;
                if (renderedAuthRevision === authRevision.current) setState(recovered.state);
              } else if (renderedAuthRevision === authRevision.current) {
                setState(currentSnapshot.state);
              }
            }
          } catch (stateError) {
            rollback.errors.push(stateError);
            if (isStateConflictError(stateError)) {
              try {
                authoritativeOnFailure = (await loadStateSnapshot(podRoot, solidFetch)).state;
              } catch (reloadError) {
                rollback.errors.push(reloadError);
              }
            }
            if (
              authoritativeOnFailure &&
              renderedAuthRevision === authRevision.current
            ) {
              setState(authoritativeOnFailure);
            }
            // A fully cleaned publication that never committed state needs no
            // fictitious recovery run, even if reloading the UI state failed.
            recoveryRequired = authoritativeRunNeedsCleanup || !rollback.fullyClean;
          }
        }

        throw new AggregateError(
          [reason, ...rollback.errors],
          recoveryRequired
            ? "Veröffentlichung unvollständig; der Lauf bleibt für einen erneuten Reset erhalten."
            : "Veröffentlichung fehlgeschlagen und wurde vollständig zurückgerollt."
        );
      }
  };

  const publish = () =>
    mutate(async () => {
      await publishActivities(state);
    });

  const resetActiveRun = async (activeRun: ActiveRun): Promise<void> => {
      assertCurrentAuthContext();
      if (!demoPodConnected || !podRoot || !solidFetch || !webId) {
        throw new Error("Der aktive Szenariolauf kann ohne die verbundene Solid-Pod-Sitzung nicht zurueckgesetzt werden.");
      }
      activeRun = validateActiveRun(podRoot, activeRun);
      let resetSnapshot = await loadStateSnapshot(podRoot, solidFetch);
      assertCurrentAuthContext();
      let resetRun = resetSnapshot.state.activeRun
        ? validateActiveRun(podRoot, resetSnapshot.state.activeRun)
        : null;
      if (!resetRun) {
        setState(resetSnapshot.state);
        return;
      }
      if (!sameRunIgnoringPhase(resetRun, activeRun)) {
        setState(resetSnapshot.state);
        throw new Error(
          "Ein anderer Szenariolauf ist inzwischen aktiv. Der aktuelle Pod-Stand wurde übernommen."
        );
      }
      if (!resetSnapshot.etag) {
        throw new Error(
          "Der aktive Szenariolauf besitzt keinen starken Status-Versionsnachweis und wurde nicht zurückgesetzt."
        );
      }
      for (let attempt = 0; attempt < 3 && resetRun.phase !== "resetting"; attempt += 1) {
        if (!resetSnapshot.etag) {
          throw new Error(
            "Der aktive Szenariolauf besitzt keinen starken Status-Versionsnachweis."
          );
        }
        try {
          resetSnapshot = await saveStateIfUnchanged(
            podRoot,
            {
              ...resetSnapshot.state,
              activeRun: { ...resetRun, phase: "resetting" },
            },
            resetSnapshot.etag,
            webId,
            solidFetch
          );
          assertCurrentAuthContext();
          resetRun = validateActiveRun(podRoot, resetSnapshot.state.activeRun);
        } catch (stateError) {
          if (!isStateConflictError(stateError)) throw stateError;
          resetSnapshot = await loadStateSnapshot(podRoot, solidFetch);
          resetRun = resetSnapshot.state.activeRun
            ? validateActiveRun(podRoot, resetSnapshot.state.activeRun)
            : null;
          if (!resetRun) {
            if (renderedAuthRevision === authRevision.current) setState(resetSnapshot.state);
            return;
          }
          if (!sameRunIgnoringPhase(resetRun, activeRun)) {
            if (renderedAuthRevision === authRevision.current) setState(resetSnapshot.state);
            throw new Error(
              "Ein anderer Szenariolauf ist inzwischen aktiv. Der aktuelle Pod-Stand wurde uebernommen."
            );
          }
          if (resetRun.phase === "resetting") break;
          if (attempt === 2) {
            if (renderedAuthRevision === authRevision.current) setState(resetSnapshot.state);
            throw new AggregateError(
              [stateError],
              "Der Szenariolauf konnte nach mehreren parallelen Statusaenderungen nicht fuer den Reset reserviert werden."
            );
          }
        }
      }
      if (resetRun.phase !== "resetting") {
        throw new Error("Der Szenariolauf konnte nicht sicher fuer den Reset reserviert werden.");
      }
      if (renderedAuthRevision === authRevision.current) setState(resetSnapshot.state);
      // Revoke access to the actual donated data first, even if no matching Inbox
      // request can be found. The public marker may remain briefly, but it then only
      // points to an owner-only (or already missing) snapshot.
      await setOwnerOnlyIfPresent(resetRun.resourceUrl, webId, solidFetch);
      assertCurrentAuthContext();
      await clearPublishedMarker(podRoot, resetRun.scenarioRunId, solidFetch);
      assertCurrentAuthContext();
      await revokeAndArchiveScenarioAccess({
        ownerWebId: webId,
        scenarioRunId: resetRun.scenarioRunId,
        resourceUrl: resetRun.resourceUrl,
        fetcher: solidFetch,
      });
      assertCurrentAuthContext();
      await removeCatalogEntry({
        podRoot,
        webId,
        datasetIdentifier: resetRun.datasetIdentifier,
        catalogDatasetUrl: resetRun.catalogDatasetUrl,
        fetcher: solidFetch,
      });
      assertCurrentAuthContext();
      if (resetRun.manifestUrl) await safeDelete(resetRun.manifestUrl, solidFetch);
      await safeDelete(resetRun.resourceUrl, solidFetch);
      if (resetRun.runContainerUrl) await safeDeleteContainer(resetRun.runContainerUrl, solidFetch);
      let finalSnapshot = await loadStateSnapshot(podRoot, solidFetch);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        assertCurrentAuthContext();
        const finalRun = finalSnapshot.state.activeRun
          ? validateActiveRun(podRoot, finalSnapshot.state.activeRun)
          : null;
        if (!finalRun) {
          setState(finalSnapshot.state);
          return;
        }
        if (JSON.stringify(finalRun) !== JSON.stringify(resetRun)) {
          setState(finalSnapshot.state);
          throw new Error(
            "Ein anderer Szenariolauf ist inzwischen aktiv. Er wurde nicht verändert; der aktuelle Pod-Stand wurde übernommen."
          );
        }
        if (!finalSnapshot.etag) {
          setState(finalSnapshot.state);
          throw new Error(
            "Der aktive Szenariolauf besitzt keinen starken Status-Versionsnachweis. Er wurde nicht aus dem Status entfernt."
          );
        }
        try {
          const committed = await saveStateIfUnchanged(
            podRoot,
            { ...finalSnapshot.state, activeRun: null },
            finalSnapshot.etag,
            webId,
            solidFetch
          );
          assertCurrentAuthContext();
          setState(committed.state);
          return;
        } catch (stateError) {
          if (!isStateConflictError(stateError)) throw stateError;
          finalSnapshot = await loadStateSnapshot(podRoot, solidFetch);
          if (attempt === 2) {
            if (renderedAuthRevision === authRevision.current) setState(finalSnapshot.state);
            throw new AggregateError(
              [stateError],
              "Der Szenariolauf konnte nach mehreren parallelen Statusänderungen nicht entfernt werden. Der aktuelle Pod-Stand wurde übernommen."
            );
          }
        }
      }
  };

  const resetScenario = () =>
    mutate(async () => {
      if (!demoPodConnected || !podRoot || !solidFetch || !webId || !state.activeRun) return;
      await resetActiveRun(validateActiveRun(podRoot, state.activeRun));
    });

  const selectDraft = (selected: TourDraft) => {
    setDraft({ ...selected, geometry: selected.geometry.map((line) => [...line]) });
  };

  const duplicateDraft = (source: TourDraft) =>
    mutate(async () => {
      assertCurrentAuthContext();
      const timestamp = new Date().toISOString();
      const copy: TourDraft = {
        ...source,
        id: createId(),
        name: `${source.name} (${t("copySuffix")})`,
        geometry: source.geometry.map((line) => line.map(([longitude, latitude]) => [longitude, latitude])),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await persistDraft(copy);
    });

  const requestDraftRemoval = (item: TourDraft) => {
    setDeleteConfirmation({ kind: "draft", item });
  };

  const removeDraft = (item: TourDraft, confirmedThroughModal = false) => {
    if (!confirmedThroughModal) {
      requestDraftRemoval(item);
      return;
    }
    void mutate(async () => {
      assertCurrentAuthContext();
      if (demoPodConnected && podRoot && solidFetch && webId) {
        const remoteSnapshot = await loadStateSnapshot(podRoot, solidFetch);
        assertCurrentAuthContext();
        const remoteDraft = remoteSnapshot.state.drafts.find(
          (candidate) => candidate.id === item.id
        );
        if (!remoteDraft || JSON.stringify(remoteDraft) !== JSON.stringify(item)) {
          setState(remoteSnapshot.state);
          throw new Error(
            "Der Tourentwurf wurde im Pod zwischenzeitlich geändert. Der aktuelle Stand wurde neu geladen."
          );
        }
        if (!remoteSnapshot.etag) {
          throw new Error(
            "Der Pod liefert keinen starken Versionsnachweis. Der Tourentwurf wurde vorsichtshalber nicht gelöscht."
          );
        }
        const masterSnapshot = await loadDraftMasterSnapshot(podRoot, remoteDraft, solidFetch);
        assertCurrentAuthContext();
        const next = {
          ...remoteSnapshot.state,
          drafts: remoteSnapshot.state.drafts.filter(
            (candidate) => candidate.id !== item.id
          ),
        };
        const committedSnapshot = await saveStateIfUnchanged(
          podRoot,
          next,
          remoteSnapshot.etag,
          webId,
          solidFetch
        );
        try {
          assertCurrentAuthContext();
          await deleteDraft(podRoot, item.id, masterSnapshot.etag, solidFetch);
          assertCurrentAuthContext();
        } catch (deleteError) {
          const rollbackErrors: unknown[] = [];
          try {
            const survivingMaster = await loadDraftMasterSnapshot(
              podRoot,
              remoteDraft,
              solidFetch
            );
            if (survivingMaster.etag !== masterSnapshot.etag) {
              throw new Error("Der private Tourentwurf wurde parallel geändert.");
            }
            await saveStateIfUnchanged(
              podRoot,
              remoteSnapshot.state,
              committedSnapshot.etag || "",
              webId,
              solidFetch
            );
          } catch (rollbackError) {
            rollbackErrors.push(rollbackError);
          }
          if (renderedAuthRevision === authRevision.current) {
            try {
              const authoritative = await loadStateSnapshot(podRoot, solidFetch);
              if (renderedAuthRevision === authRevision.current) setState(authoritative.state);
            } catch (reloadError) {
              rollbackErrors.push(reloadError);
            }
          }
          throw new AggregateError(
            [deleteError, ...rollbackErrors],
            rollbackErrors.length > 0
              ? "Der Entwurf konnte nicht sicher gelöscht werden. Der Pod-Zustand wurde fail-closed belassen; lade Solid Tours neu."
              : "Der Entwurf wurde nicht gelöscht und der vorherige Pod-Zustand wiederhergestellt."
          );
        }
        setState(committedSnapshot.state);
        if (draft.id === item.id) {
          setDraft(committedSnapshot.state.drafts[0] || createGeneratedDraft());
        }
        return;
      }

      const next = {
        ...state,
        activeRun: null,
        drafts: state.drafts.filter((candidate) => candidate.id !== item.id),
      };
      await persistStateForCurrentMode(next, state);
      setState(next);
      if (draft.id === item.id) setDraft(next.drafts[0] || createGeneratedDraft());
    });
  };

  const requestActivityRemoval = (item: CompletedActivity) => {
    setDeleteConfirmation({
      kind: "activity",
      item,
      donationReplacement: Boolean(state.activeRun?.activityIds.includes(item.id)),
    });
  };

  const removeActivity = (
    item: CompletedActivity,
    acknowledgedDonationReplacement = false,
    confirmedThroughModal = false
  ) => {
    if (!confirmedThroughModal) {
      requestActivityRemoval(item);
      return;
    }
    void mutate(async () => {
      assertCurrentAuthContext();
      if (!demoPodConnected || !podRoot || !solidFetch || !webId) {
        const next = {
          ...state,
          activeRun: null,
          activities: state.activities.filter((candidate) => candidate.id !== item.id),
        };
        await persistStateForCurrentMode(next);
        setState(next);
        return;
      }

      // Bind the complete authenticated context before any remote read. A host
      // identity switch increments authRevision; the old mutation may then only
      // finish verification/compensation against this captured Pod and fetcher.
      const operationRevision = authRevision.current;
      const operationPodRoot = podRoot;
      const operationWebId = webId;
      const operationFetch = solidFetch;
      const assertOperationIdentity = () => {
        if (
          operationRevision !== authRevision.current ||
          !demoPodAccessActive.current
        ) {
          throw new Error(
            "Die Solid-Sitzung hat sich während des Löschens geändert. Der Vorgang wurde sicher abgebrochen."
          );
        }
      };

      let remoteSnapshot = await loadStateSnapshot(operationPodRoot, operationFetch);
      assertOperationIdentity();
      let remoteActivity = remoteSnapshot.state.activities.find(
        (candidate) => candidate.id === item.id
      );
      if (!remoteActivity) {
        setState(remoteSnapshot.state);
        throw new Error(
          "Die gemachte Tour wurde im Pod bereits geändert oder gelöscht. Der aktuelle Stand wurde neu geladen."
        );
      }
      if (JSON.stringify(remoteActivity) !== JSON.stringify(item)) {
        setState(remoteSnapshot.state);
        throw new Error(
          "Die gemachte Tour wurde im Pod zwischenzeitlich verändert. Der aktuelle Stand wurde neu geladen."
        );
      }
      let replacedDonation = false;
      const currentRun = remoteSnapshot.state.activeRun;
      if (currentRun?.activityIds.includes(item.id)) {
        if (!acknowledgedDonationReplacement) {
          setState(remoteSnapshot.state);
          setDeleteConfirmation({
            kind: "activity",
            item,
            donationReplacement: true,
          });
          return;
        }
        await resetActiveRun(validateActiveRun(operationPodRoot, currentRun));
        assertOperationIdentity();
        remoteSnapshot = await loadStateSnapshot(operationPodRoot, operationFetch);
        assertOperationIdentity();
        if (remoteSnapshot.state.activeRun) {
          setState(remoteSnapshot.state);
          throw new Error(
            "Während des Zurücksetzens wurde ein anderer Szenariolauf veröffentlicht. Die Tour wurde vorsichtshalber nicht gelöscht."
          );
        }
        remoteActivity = remoteSnapshot.state.activities.find(
          (candidate) => candidate.id === item.id
        );
        if (!remoteActivity) {
          setState(remoteSnapshot.state);
          throw new Error(
            "Die gemachte Tour wurde im Pod bereits geändert oder gelöscht. Der aktuelle Stand wurde neu geladen."
          );
        }
        if (JSON.stringify(remoteActivity) !== JSON.stringify(item)) {
          setState(remoteSnapshot.state);
          throw new Error(
            "Die gemachte Tour wurde im Pod zwischenzeitlich verändert. Der aktuelle Stand wurde neu geladen."
          );
        }
        replacedDonation = true;
      }
      if (!remoteSnapshot.etag) {
        throw new Error(
          "Der Pod liefert keinen starken Versionsnachweis. Die Aktivität wurde vorsichtshalber nicht geändert."
        );
      }
      const masterSnapshot = await loadActivityMasterSnapshot(
        operationPodRoot,
        remoteActivity,
        operationFetch
      );
      assertOperationIdentity();

      const next = {
        ...remoteSnapshot.state,
        activities: remoteSnapshot.state.activities.filter(
          (candidate) => candidate.id !== item.id
        ),
      };
      const committedSnapshot = await saveStateIfUnchanged(
        operationPodRoot,
        next,
        remoteSnapshot.etag,
        operationWebId,
        operationFetch
      );

      const compensate = async (causes: unknown[]): Promise<never> => {
        const compensationErrors: unknown[] = [];
        try {
          // Re-read the full private master and its strong ETag. Never restore
          // a state reference to a missing or concurrently changed resource.
          await loadActivityMasterSnapshot(
            operationPodRoot,
            remoteActivity,
            operationFetch
          );
        } catch (masterVerificationError) {
          compensationErrors.push(masterVerificationError);
        }
        // Never restore a state reference until the private master is known to
        // exist. On a failed restore the already committed state stays safely
        // without that reference.
        if (compensationErrors.length === 0) {
          try {
            await saveStateIfUnchanged(
              operationPodRoot,
              remoteSnapshot.state,
              committedSnapshot.etag || "",
              operationWebId,
              operationFetch
            );
          } catch (rollbackStateError) {
            compensationErrors.push(rollbackStateError);
          }
        }
        throw new AggregateError(
          [...causes, ...compensationErrors],
          compensationErrors.length > 0
            ? "Löschen konnte nicht sicher zurückgerollt werden. Der Pod-Zustand wurde fail-closed belassen; lade Solid Tours neu."
            : "Die Aktivität wurde nicht gelöscht und der vorherige Pod-Zustand wiederhergestellt."
        );
      };

      try {
        assertOperationIdentity();
      } catch (identityError) {
        await compensate([identityError]);
      }

      let deleteError: unknown = null;
      try {
        await deleteActivity(
          operationPodRoot,
          item.id,
          masterSnapshot.etag,
          operationFetch
        );
      } catch (reason) {
        if (isActivityMasterConflictError(reason)) {
          throw new AggregateError(
            [reason],
            "Die private Aktivität wurde parallel verändert. Der Pod-Zustand wurde fail-closed ohne Aktivitätsverweis belassen; lade Solid Tours neu."
          );
        }
        // A failed network response does not prove that DELETE was not applied.
        deleteError = reason;
      }

      let masterStillExists: boolean;
      try {
        masterStillExists = await activityMasterExists(
          operationPodRoot,
          item.id,
          operationFetch
        );
      } catch (verificationError) {
        // HEAD itself can fail after an ambiguously answered DELETE. A full GET
        // can still reconcile whether the expected version survived.
        try {
          await loadActivityMasterSnapshot(
            operationPodRoot,
            remoteActivity,
            operationFetch
          );
          masterStillExists = true;
        } catch (masterVerificationError) {
          if (
            isActivityMasterConflictError(masterVerificationError) &&
            masterVerificationError.kind === "missing"
          ) {
            masterStillExists = false;
          } else {
            throw new AggregateError(
              [deleteError, verificationError, masterVerificationError].filter(Boolean),
              "Das Ergebnis der privaten Löschung ist unklar. Der Pod-Zustand wurde fail-closed ohne Aktivitätsverweis belassen; lade Solid Tours neu."
            );
          }
        }
      }
      if (masterStillExists!) {
        try {
          await loadActivityMasterSnapshot(
            operationPodRoot,
            remoteActivity,
            operationFetch
          );
        } catch (masterConflict) {
          throw new AggregateError(
            [deleteError, masterConflict].filter(Boolean),
            "Die private Aktivität wurde parallel verändert. Der Pod-Zustand wurde fail-closed ohne Aktivitätsverweis belassen; lade Solid Tours neu."
          );
        }
        await compensate(
          deleteError
            ? [deleteError]
            : [new Error("Das Löschen der privaten Aktivität wurde nicht bestätigt.")]
        );
      }

      if (operationRevision !== authRevision.current || !demoPodAccessActive.current) {
        throw new Error(
          "Die Solid-Sitzung hat sich während des Löschens geändert. Die sichere Remote-Löschung wurde abgeschlossen."
        );
      }
      if (replacedDonation && committedSnapshot.state.activities.length > 0) {
        try {
          await publishActivities(committedSnapshot.state);
          assertOperationIdentity();
        } catch (publicationError) {
          if (
            publicationError instanceof Error &&
            publicationError.message.includes("Veröffentlichung unvollständig")
          ) {
            throw publicationError;
          }
          throw new AggregateError(
            [publicationError],
            t("replacementPublishFailed")
          );
        }
        return;
      }
      setState(committedSnapshot.state);
    }, { reportAfterAuthChange: true });
  };

  const confirmDeletion = () => {
    const confirmation = deleteConfirmation;
    if (!confirmation) return;
    setDeleteConfirmation(null);
    if (confirmation.kind === "draft") {
      removeDraft(confirmation.item, true);
      return;
    }
    removeActivity(
      confirmation.item,
      confirmation.donationReplacement,
      true
    );
  };

  const login = async (issuer = DEFAULT_ISSUER) => {
    setBusy(true);
    setError(null);
    const redirectWatchdog = window.setTimeout(() => {
      setBusy(false);
      setError(
        "Die Weiterleitung zum Solid Provider wurde nicht gestartet. Bitte versuche es erneut."
      );
    }, 20_000);
    try {
      try {
        window.localStorage.setItem("solid-tours:oidc-issuer", issuer);
      } catch {
        // A blocked browser store must not prevent the Solid redirect.
      }
      if (bridge?.login) {
        await bridge.login(issuer);
        window.clearTimeout(redirectWatchdog);
        setBusy(false);
        return;
      }
      await getSession().login({
        oidcIssuer: issuer,
        redirectUrl: `${window.location.origin}/solid-tours/`,
        clientName: "Solid Tours",
      });
    } catch (reason) {
      window.clearTimeout(redirectWatchdog);
      setFailure(reason);
      setBusy(false);
    }
  };

  const logout = async () => {
    setBusy(true);
    setError(null);
    try {
      if (bridge?.logout) await bridge.logout();
      else await getSession().logout({ logoutType: "app" });
      setIsAuthenticated(false);
      setAuthenticatedWebId(null);
      activateLocalMode(null);
      window.location.assign(`${window.location.origin}/solid-tours/`);
    } catch (reason) {
      setFailure(reason);
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div
        lang={language}
        className={`solid-tours-app solid-tours-app--loading ${
          embedded ? "solid-tours-app--embedded" : "solid-tours-app--standalone"
        }`}
      >
        <p className="tours-loading" role="status">
          {t("loading")}
        </p>
      </div>
    );
  }

  if (!embedded && !isAuthenticated) {
    let rememberedIssuer = DEFAULT_ISSUER;
    try {
      rememberedIssuer =
        window.localStorage.getItem("solid-tours:oidc-issuer") || DEFAULT_ISSUER;
    } catch {
      // Keep the configured default when storage is unavailable.
    }
    return (
      <div className="solid-tours-app solid-tours-app--login" lang={language}>
        <StandaloneLogin
          defaultIssuer={rememberedIssuer}
          busy={busy}
          error={error}
          language={language}
          onLanguageChange={changeStandaloneLanguage}
          onLogin={login}
        />
      </div>
    );
  }

  const mapRoutes = state.drafts.filter((item) => item.id !== draft.id);
  const editablePointCount = draft.geometry.reduce((count, line) => count + line.length, 0);
  const visibleError = localizeUserFacingMessage(
    error || (!demoErrorDismissed ? demoConfiguration.error : null),
    language
  );

  return (
    <div
      lang={language}
      className={`solid-tours-app ${
        embedded ? "solid-tours-app--embedded" : "solid-tours-app--standalone"
      }${completeConfirmation || deleteConfirmation || completionInProgress ? " solid-tours-app--modal-open" : ""}`}
    >
      {!embedded && (
        <header className="app-header">
          <div className="app-brand">
            <span className="app-brand-mark" aria-hidden="true">
              <FontAwesomeIcon icon="route" />
            </span>
            <strong>Solid Tours</strong>
          </div>
          <div className="header-actions">
            <div className="header-user" title={authenticatedWebId || undefined}>
              {authenticatedPhotoSrc ? (
                <img
                  className="header-user-avatar header-user-avatar--photo"
                  src={authenticatedPhotoSrc}
                  alt=""
                />
              ) : (
                <span className="header-user-avatar" aria-hidden="true">
                  <FontAwesomeIcon icon="circle-user" />
                </span>
              )}
              <span className="header-user-name">
                <strong>{authenticatedProfile.name}</strong>{" "}
                {authenticatedWebId && (
                  <span className="header-user-webid">({authenticatedWebId})</span>
                )}
              </span>
            </div>
            <LanguageToggle language={language} onChange={changeStandaloneLanguage} />
            <button className="header-logout" disabled={busy} onClick={logout}>
              <FontAwesomeIcon icon="right-from-bracket" />
              {t("logout")}
            </button>
          </div>
        </header>
      )}

      <main className="tours-shell">

        <section className="route-workspace" aria-label={t("workspace")}>
          <aside className="planner-panel">
            <div className="planner-scroll">
              <section className="panel-section panel-section--planner">
                <div className="section-heading">
                  <h1>{t("tourPlanner")}</h1>
                  <button
                    className="icon-button"
                    title={t("newTour")}
                    aria-label={t("newTour")}
                    onClick={() => {
                      setDraft(createGeneratedDraft());
                    }}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </button>
                </div>

                <div className="form-grid">
                  <label>
                    {t("tourName")}
                    <input value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} />
                  </label>
                </div>

                <div className="mode-row" aria-label={t("routeMode")}>
                  <button className="active" type="button">{t("drawFreely")}</button>
                  <label className="file-button">
                    {t("importRoute")}
                    <input
                      type="file"
                      accept=".gpx,.geojson,.json,application/gpx+xml,application/geo+json"
                      onChange={(event) => {
                        importFile(event.target.files?.[0]);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                </div>

                <button className="secondary save-draft-button" disabled={busy} onClick={handleSave}>{t("saveDraft")}</button>
              </section>

              <section className="panel-section list-card">
                <div className="section-heading">
                  <h2>{t("myTours")}</h2>
                  <strong className="count-badge">{state.drafts.length}</strong>
                </div>
                <div className="item-list">
                  {state.drafts.length === 0 && <p className="empty">{t("noSavedTours")}</p>}
                  {state.drafts.map((item) => (
                    <article className={`draft-item ${item.id === draft.id ? "draft-item--active" : ""}`} key={item.id}>
                      <button className="list-item" onClick={() => selectDraft(item)}>
                        <span>{item.name}</span>
                        <small>{distanceLabel(item.geometry, language)}</small>
                      </button>
                      <div className="draft-actions">
                        <button className="ghost" disabled={busy} onClick={() => duplicateDraft(item)}>{t("duplicate")}</button>
                        <button className="delete-link" disabled={busy} onClick={() => requestDraftRemoval(item)}>{t("delete")}</button>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="tour-completion">
                  <label>
                    {t("completedOn")}
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder={datePlaceholder(language)}
                      value={completedDateInput}
                      aria-invalid={completedDateError ? "true" : undefined}
                      aria-describedby={completedDateError && visibleError ? "map-error-message" : undefined}
                      onChange={(event) => {
                        const value = event.target.value;
                        setCompletedDateInput(value);
                        try {
                          parseDate(value, language);
                          setCompletedDateError(null);
                        } catch {
                          // Keep partial input editable; validation runs before completion.
                        }
                      }}
                      onBlur={() => {
                        try {
                          const normalized = parseDate(completedDateInput, language);
                          setCompletedDateInput(formatDate(normalized, language));
                          setCompletedDateError(null);
                          setError(null);
                        } catch (reason) {
                          const message =
                            reason instanceof Error ? reason.message : "Bitte gib ein gültiges Datum ein.";
                          setCompletedDateError(message);
                          setError(message);
                        }
                      }}
                    />
                  </label>
                  <button className="primary" disabled={busy} onClick={confirmCompletion}>{t("tourDone")}</button>
                </div>
              </section>

              <section className="panel-section list-card">
                <div className="section-heading">
                  <h2>{t("completedTours")}</h2>
                  <strong className="count-badge">{state.activities.length}</strong>
                </div>
                <div className="item-list">
                  {state.activities.length === 0 && (
                    <p className="empty">{t("noCompletedTours")}</p>
                  )}
                  {state.activities.map((activity) => (
                    <article className="activity-item" key={activity.id}>
                      <div>
                        <strong>{activity.name}</strong>
                        <small>{formatDate(activity.completedDate, language)} · {summaryText(activity, language)}</small>
                      </div>
                      <button
                        className="delete-link activity-delete"
                        disabled={busy}
                        onClick={() => requestActivityRemoval(activity)}
                      >
                        {t("delete")}
                      </button>
                    </article>
                  ))}
                </div>
                {demoPodConnected && state.activities.length > 0 && (
                  <div className="health-donation-actions">
                    {state.activeRun ? (
                      <button className="danger" disabled={busy} onClick={resetScenario}>
                        {t("resetDonation")}
                      </button>
                    ) : (
                      <button className="publish" disabled={busy} onClick={publish}>
                        {t("shareDonation")}
                      </button>
                    )}
                  </div>
                )}
              </section>
            </div>
          </aside>

          <section className="map-stage" aria-label={t("tourMap")}>
            <TourMap
              geometry={draft.geometry}
              savedRoutes={mapRoutes}
              onPoint={addPoint}
              language={language}
            />

            <aside className="map-stats" aria-label={t("routeInformation")}>
              <div><span>{t("distance")}</span><strong>{distanceLabel(draft.geometry, language)}</strong></div>
              <div><span>{t("duration")}</span><strong>{draft.durationMinutes ? `${Math.round(draft.durationMinutes)} ${t("minutesShort")}` : "–"}</strong></div>
            </aside>
            {visibleError && (
              <div className="map-error-overlay" role="alert" aria-live="assertive">
                <span id="map-error-message">{visibleError}</span>
                <button
                  type="button"
                  className="map-error-close"
                  aria-label={t("closeError")}
                  title={t("closeError")}
                  onClick={() => {
                    setError(null);
                    setDemoErrorDismissed(true);
                  }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m6 6 12 12M18 6 6 18" />
                  </svg>
                </button>
              </div>
            )}
            {editablePointCount > 0 && (
              <div className="map-edit-toolbar" role="toolbar" aria-label={t("editRoute")}>
                <button className="map-tool-button" disabled={busy} onClick={undoPoint} title={t("undoLastPoint")}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9 7 4 12l5 5M5 12h8a6 6 0 0 1 6 6" />
                  </svg>
                  <span>{t("undoPoint")}</span>
                </button>
                <button className="map-tool-button map-tool-button--danger" disabled={busy} onClick={clearRoute} title={t("clearEntireRoute")}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
                  </svg>
                  <span>{t("clearRoute")}</span>
                </button>
              </div>
            )}
            <aside className="map-legend" aria-label={t("mapLegend")}>
              <strong>{t("routes")}</strong>
              <span><i className="legend-line legend-line--current" />{t("currentTour")}</span>
              <span><i className="legend-line legend-line--saved" />{t("savedTour")}</span>
            </aside>
          </section>
        </section>

      {deleteConfirmation && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => {
            if (!busy) setDeleteConfirmation(null);
          }}
        >
          <section
            className="confirm-dialog confirm-dialog--danger"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-confirmation-title"
            aria-describedby="delete-confirmation-copy"
            data-testid="delete-confirmation-dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <span className="eyebrow">{t("confirmDeletion")}</span>
            <h2 id="delete-confirmation-title">
              {deleteConfirmation.kind === "draft"
                ? t("deleteDraftTitle")
                : t("deleteCompletedTourTitle")}
            </h2>
            <p id="delete-confirmation-copy" className="delete-confirmation-copy">
              {deleteConfirmation.kind === "draft"
                ? t("draftDeleteQuestion", { name: deleteConfirmation.item.name })
                : t(
                    deleteConfirmation.donationReplacement
                      ? "activityDeleteAndReplaceDonationQuestion"
                      : "activityDeleteQuestion",
                    { name: deleteConfirmation.item.name }
                  )}
            </p>
            <dl>
              <div>
                <dt>{t("route")}</dt>
                <dd>{deleteConfirmation.item.name}</dd>
              </div>
              {deleteConfirmation.kind === "activity" && (
                <div>
                  <dt>{t("completedOn")}</dt>
                  <dd>{formatDate(deleteConfirmation.item.completedDate, language)}</dd>
                </div>
              )}
            </dl>
            <div className="dialog-actions">
              <button
                className="ghost"
                disabled={busy}
                onClick={() => setDeleteConfirmation(null)}
              >
                {t("cancel")}
              </button>
              <button
                className="danger"
                disabled={busy}
                data-testid="delete-confirmation-submit"
                onClick={confirmDeletion}
              >
                {deleteConfirmation.kind === "activity" &&
                deleteConfirmation.donationReplacement
                  ? t("deleteAndReplaceDonation")
                  : t("delete")}
              </button>
            </div>
          </section>
        </div>
      )}

      {completeConfirmation && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setCompleteConfirmation(null)}>
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="complete-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <span className="eyebrow">{t("confirmCompletion")}</span>
            <h2 id="complete-title">{t("saveCompletedQuestion")}</h2>
            <dl>
              <div><dt>{t("route")}</dt><dd>{draft.name}</dd></div>
              <div><dt>{t("completedOn")}</dt><dd>{formatDate(completeConfirmation.completedDate, language)}</dd></div>
            </dl>
            <fieldset className="activity-choice">
              <legend>{t("howCompleted")}</legend>
              <div>
                <label className={completeConfirmation.activityType === "walking" ? "selected" : ""}>
                  <input
                    type="radio"
                    name="completion-activity"
                    value="walking"
                    checked={completeConfirmation.activityType === "walking"}
                    onChange={() => selectCompletionActivity("walking")}
                  />
                  {t("walking")}
                </label>
                <label className={completeConfirmation.activityType === "cycling" ? "selected" : ""}>
                  <input
                    type="radio"
                    name="completion-activity"
                    value="cycling"
                    checked={completeConfirmation.activityType === "cycling"}
                    onChange={() => selectCompletionActivity("cycling")}
                  />
                  {t("cycling")}
                </label>
              </div>
            </fieldset>
            {completeConfirmation.summary && (
              <dl className="activity-preview">
                <div>
                  <dt>{t("calculated")}</dt>
                  <dd>{(completeConfirmation.summary.distanceMeters / 1000).toLocaleString(numberLocale(language))} km · {completeConfirmation.summary.activeMinutes} {t("minutesShort")}</dd>
                </div>
                {"estimatedSteps" in completeConfirmation.summary && (
                  <div><dt>{t("steps")}</dt><dd>{t("approximately")} {completeConfirmation.summary.estimatedSteps.toLocaleString(numberLocale(language))}</dd></div>
                )}
                {"averagePaceMinutesPerKm" in completeConfirmation.summary ? (
                  <div><dt>{t("averagePace")}</dt><dd>{completeConfirmation.summary.averagePaceMinutesPerKm.toLocaleString(numberLocale(language))} {t("minutesPerKm")}</dd></div>
                ) : (
                  <div><dt>{t("averageSpeed")}</dt><dd>{completeConfirmation.summary.averageSpeedKmh.toLocaleString(numberLocale(language))} km/h</dd></div>
                )}
              </dl>
            )}
            <div className="dialog-actions">
              <button className="ghost" onClick={() => setCompleteConfirmation(null)}>{t("cancel")}</button>
              <button
                className="primary"
                disabled={!completeConfirmation.activityType || !completeConfirmation.summary}
                onClick={() => {
                  if (!completeConfirmation.activityType) {
                    setFailure(new Error("Wähle Zu Fuß oder Fahrrad aus."));
                    return;
                  }
                  const activityType = completeConfirmation.activityType;
                  const completionDate = completeConfirmation.completedDate;
                  setCompleteConfirmation(null);
                  void handleComplete(activityType, completionDate);
                }}
              >{t("save")}</button>
            </div>
          </section>
        </div>
      )}
      {completionInProgress && (
        <CompletionLoadingOverlay
          activityType={completionInProgress}
          label={t("savingCompletedTour")}
        />
      )}
      </main>
      {!embedded && (
        <footer className="app-footer">
          <div className="footer-logo-group" aria-label="Project partners">
            <img
              src="/semantic-data-catalog/assets/images/Logo_BUW.png"
              alt="Logo BUW"
              className="footer-logo footer-logo--buw"
            />
            <img
              src="/semantic-data-catalog/assets/images/Logo_TMDT.png"
              alt="Logo TMDT"
              className="footer-logo footer-logo--tmdt"
            />
          </div>
          <div className="footer-version">Solid Tours {appVersion}</div>
        </footer>
      )}
    </div>
  );
}
