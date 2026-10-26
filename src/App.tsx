import StandaloneFooter from "./standalone/StandaloneFooter";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TourMap from "./TourMap";
import ActivityCard from "./ActivityCard";
import { donationNeedsSync, legacyContinuousDonationAllowed, synchronizeContinuousDonation } from "./continuousDonation";
import Modal from "./Modal";
import RouteCatalog from "./RouteCatalog";
import "./App.css";

import FontAwesomeIcon from "./FontAwesomeIcon";
import {
  catalogPublicationReference,
  discoverCatalogedRoutes,
  ensureRouteCatalogReadiness,
  getCatalogedRouteDiscoveryReport,
  loadCatalogProfileMetadata,
  loadPublicRegistryOptions,
  loadRouteCatalogReadiness,
  publishCatalogEntry,
  publishRouteTemplateCatalogEntry,
  updateRouteTemplateCatalogEntry,
  saveCatalogProfileMetadata,
  type CatalogProfileMetadata,
  type CatalogRouteDiscoveryReport,
  type PublicRegistryOption,
  removeCatalogEntry,
} from "./catalog";
import {
  ensureCityToursInbox,
  getCityToursInboxReadiness,
  revokeAndArchiveScenarioAccess,
} from "./accessRequests";
import {
  completeTour,
  createId,
  isValidGeometry,
  previewActivityCompletion,
  publishedActivityCollection,
  routeDistanceMeters,
} from "./domain";
import { hasSolidPodAccess, storageModeForIdentity } from "./storageMode";
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
  loadDraftMasterResourceSnapshot,
  loadPublicRouteTemplateResourceSnapshot,
  loadCityToursOnboarding,
  loadState,
  loadStateSnapshot,
  resolvePodRoot,
  safeDelete,
  safeDeleteContainer,
  setOwnerOnlyIfPresent,
  saveActivityConditionally,
  saveDraftConditionally,
  saveInterestsIfMissing,
  savePublicRouteTemplate,
  updatePublicRouteTemplateConditionally,
  saveRunSnapshot,
  saveCityToursOnboarding,
  saveState,
  saveStateIfUnchanged,
  storageUrls,
  type StateSnapshot,
  type PublicRouteTemplateUpdateResult,
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
import type { RouteCatalogPublication } from "./types";
import {
  adoptCatalogedRoute,
  catalogRouteKey,
  availableCatalogedRoutes,
  createRouteTemplateSnapshot,
  isDraftEligibleForCatalogPublication,
  type CatalogedRoute,
} from "./routeTemplates";
import { validateActiveRun } from "./stateValidation";
import StandaloneLogin from "./StandaloneLogin";
import LanguageToggle from "./LanguageToggle";
import CityToursOnboarding from "./CityToursOnboarding";
import {
  completeOnboardingRecord,
  completePrivateOnboardingRecord,
  privateOnboardingCompleteFor,
  onboardingCompleteFor,
  type CityToursOnboardingRecord,
} from "./appOnboarding";
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
import type { SolidFetch, CityToursSession } from "./embedAuth";
import {
  loadSolidProfileSummary,
  type SolidProfileSummary,
} from "./solidProfile";

const AUTH_BRIDGE_KEY = "__SOLID_DATASPACE_AUTH__";
const DEFAULT_ISSUER = "https://solid-community-server.tmdt.info";
const RECOVERY_STATE_CAS_ATTEMPTS = 3;
const CATALOG_PUBLICATION_LEASE_MS = 15 * 60 * 1000;
type PendingAction =
  | { kind: "import"; file: File }
  | { kind: "adopt"; route: CatalogedRoute }
  | { kind: "select" | "duplicate"; id: string }
  | { kind: "new" }
  | { kind: "logout" }
  | { kind: "public-setup" }
  | { kind: "leave"; href: string };
type WorkspaceSection = "tours" | "discover" | "activities" | "sharing";
type BridgeState = { isLoggedIn: boolean; webId: string | null };
type DeleteConfirmation =
  | { kind: "draft"; item: TourDraft }
  | { kind: "activity"; item: CompletedActivity; donationReplacement: boolean };
type CatalogConfirmation =
  | { kind: "index"; drafts: TourDraft[] }
  | { kind: "remove"; draft: TourDraft; publication: RouteCatalogPublication };
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
  /** @deprecated Pod access is available to every authenticated Solid identity. */
  demoWebIdOverride?: string | null;
  language?: string | null;
  session?: CityToursSession | null;
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

const cloneDraft = (draft: TourDraft): TourDraft => ({
  ...draft,
  geometry: draft.geometry.map((line) =>
    line.map(([longitude, latitude]) => [longitude, latitude])
  ),
});

const sameDraftContent = (left: TourDraft, right: TourDraft): boolean =>
  left.name === right.name &&
  left.routeSource === right.routeSource &&
  left.durationMinutes === right.durationMinutes &&
  left.durationSource === right.durationSource &&
  JSON.stringify(left.geometry) === JSON.stringify(right.geometry);

const sameStoredDraft = (left: TourDraft, right: TourDraft): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const samePendingUpdate = (
  publication: RouteCatalogPublication,
  operationId: string,
  leaseId: string,
  draft: TourDraft
): boolean =>
  publication.pendingUpdate?.operationId === operationId &&
  publication.pendingUpdate.leaseId === leaseId &&
  sameStoredDraft(publication.pendingUpdate.draft, draft);

const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const numberLocale = (language: ToursLanguage) => (language === "de" ? "de-DE" : "en-US");

const distanceLabel = (geometry: MultiLineCoordinates, language: ToursLanguage) =>
  `${(routeDistanceMeters(geometry) / 1000).toLocaleString(numberLocale(language), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} km`;

function CompletionLoadingOverlay({
  activityType,
  label,
}: {
  activityType: ActivityType;
  label: string;
}) {
  const icon = activityType === "cycling" ? "bicycle" : "person-walking";

  return (
    <Modal labelledBy="completion-loading-title" className={`completion-loading-card completion-loading-card--${activityType}`} busy onClose={() => {}} testId="completion-loading-overlay" activityType={activityType}>
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
    </Modal>
  );
}

export default function App({
  embedded = false,
  webIdOverride = null,
  demoWebIdOverride: _legacyDemoWebIdOverride = null,
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
  const [onboardingRecord, setOnboardingRecord] =
    useState<CityToursOnboardingRecord | null>(null);
  const [onboardingRequired, setOnboardingRequired] = useState(false);
  const [publicSetupRequired, setPublicSetupRequired] = useState(false);
  const [onboardingInfrastructureReady, setOnboardingInfrastructureReady] =
    useState(false);
  const [onboardingProfileReady, setOnboardingProfileReady] = useState(false);
  const [onboardingRegistryOptions, setOnboardingRegistryOptions] =
    useState<PublicRegistryOption[]>([]);
  const [onboardingPublicRegistries, setOnboardingPublicRegistries] =
    useState<string[]>([]);
  const [onboardingProfileMetadata, setOnboardingProfileMetadata] =
    useState<CatalogProfileMetadata>({ publisher: "", contactEmail: "" });
  const [draft, setDraft] = useState<TourDraft>(() => createGeneratedDraft());
  const [isEditing, setIsEditing] = useState(true);
  const [completedDateInput, setCompletedDateInput] = useState(() => formatDate(today(), language));
  const [completedDateError, setCompletedDateError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [completionInProgress, setCompletionInProgress] = useState<ActivityType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bridge, setBridge] = useState<HostAuthBridge | null>(null);
  const [completeConfirmation, setCompleteConfirmation] = useState<{
    completedDate: string;
    activityType: ActivityType | null;
    summary: ActivitySummary | null;
  } | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] =
    useState<DeleteConfirmation | null>(null);
  const [catalogConfirmation, setCatalogConfirmation] =
    useState<CatalogConfirmation | null>(null);
  const [catalogedRoutes, setCatalogedRoutes] = useState<CatalogedRoute[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogPreviewId, setCatalogPreviewId] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalogReport, setCatalogReport] = useState<CatalogRouteDiscoveryReport | null>(null);
  const catalogRequestRevision = useRef(0);
  const [activeSection, setActiveSection] = useState<WorkspaceSection>("tours");
  const [mobileMapOpen, setMobileMapOpen] = useState(false);
  const [tourQuery, setTourQuery] = useState("");
  const [tourSort, setTourSort] = useState("recent");
  const [fitRequest, setFitRequest] = useState(0);
  const [isDrawing, setIsDrawing] = useState(true);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [continuedAction, setContinuedAction] = useState<PendingAction | null>(null);
  const [donationConfirmation, setDonationConfirmation] = useState<"publish" | "reset" | null>(null);
  const [geometryHistory, setGeometryHistory] = useState<TourDraft[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => { setGeometryHistory([]); setIsDrawing(true); }, [draft.id, isEditing]);
  const availableCatalogRoutes = useMemo(
    () =>
      availableCatalogedRoutes(catalogedRoutes, state.drafts, {
        currentWebId: webId,
        currentPodRoot: podRoot,
        ownPublications: state.catalogPublications,
      }),
    [catalogedRoutes, podRoot, state.catalogPublications, state.drafts, webId]
  );
  const authRevision = useRef(0);
  const completionOperationRevision = useRef(0);
  const podAccessActive = useRef(false);
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
    if (firstDraft) {
      setDraft(cloneDraft(firstDraft));
      setIsEditing(false);
      return;
    }
    const freshDraft = createGeneratedDraft();
    setDraft(freshDraft);
    setIsEditing(true);
  }, [createGeneratedDraft]);

  const activateLocalMode = useCallback((identityWebId: string | null = null) => {
    podAccessActive.current = false;
    completionOperationRevision.current += 1;
    setCompletionInProgress(null);
    setCompleteConfirmation(null);
    setDeleteConfirmation(null);
    setCatalogConfirmation(null);
    setCatalogedRoutes([]);
    setCatalogPreviewId(null);
    setCatalogError(null);
    setCatalogReport(null);
    setPendingAction(null);
    setContinuedAction(null);
    setDonationConfirmation(null);
    catalogRequestRevision.current += 1;
    setOnboardingRecord(null);
    setPublicSetupRequired(false);
    setOnboardingRequired(false);
    setOnboardingInfrastructureReady(false);
    setOnboardingProfileReady(false);
    setOnboardingRegistryOptions([]);
    setOnboardingPublicRegistries([]);
    setOnboardingProfileMetadata({ publisher: "", contactEmail: "" });
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
    podAccessActive.current = false;
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
    setCatalogConfirmation(null);
    setCatalogedRoutes([]);
    setCatalogPreviewId(null);
    setCatalogError(null);
    setCatalogReport(null);
    setCatalogLoading(false);
    setPendingAction(null);
    setContinuedAction(null);
    setDonationConfirmation(null);
    catalogRequestRevision.current += 1;
    setOnboardingRecord(null);
    setPublicSetupRequired(false);
    setOnboardingRequired(false);
    setOnboardingInfrastructureReady(false);
    setOnboardingProfileReady(false);
    setOnboardingRegistryOptions([]);
    setOnboardingPublicRegistries([]);
    setOnboardingProfileMetadata({ publisher: "", contactEmail: "" });

    if (!authenticated || !auth.webId) {
      activateLocalMode(auth.webId);
      setLoading(false);
      return;
    }
    // Never expose or mutate another identity's previous state while a new Pod
    // is resolving. Authenticated sessions fail closed instead of silently
    // switching to browser-local storage.
    setWebId(null);
    setSolidFetch(null);
    setPodRoot(null);
    activateState({ ...EMPTY_STATE, drafts: [], activities: [] });
    if (!fetcher || storageModeForIdentity(auth.webId) !== "solid-pod") {
      setError("Die authentifizierte Solid-WebID ist ungültig.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const root = await resolvePodRoot(auth.webId, fetcher);
      if (revision !== authRevision.current) return;
      setWebId(auth.webId);
      setSolidFetch(() => fetcher);
      setPodRoot(root);
      const record = await loadCityToursOnboarding(root, fetcher);
      if (revision !== authRevision.current) return;
      setOnboardingRecord(record);
      const onboardingContext = embedded ? "embedded" : "standalone";
      const [catalogResult, inboxResult, profileResult] = await Promise.allSettled([
        loadRouteCatalogReadiness({ podRoot: root, webId: auth.webId, fetcher }),
        getCityToursInboxReadiness({
          podRoot: root,
          webId: auth.webId,
          fetcher,
        }),
        loadCatalogProfileMetadata(auth.webId, fetcher),
      ]);
      if (revision !== authRevision.current) return;
      const catalogReadiness = catalogResult.status === "fulfilled" ? catalogResult.value : { catalogConfigured: false, publicRegistries: [] };
      const inboxReadiness = inboxResult.status === "fulfilled" ? inboxResult.value : { configured: false };
      const profileMetadata = profileResult.status === "fulfilled" ? profileResult.value : { publisher: "", contactEmail: "" };
      const configuredRegistries = catalogReadiness.publicRegistries;
      const registryOptions = loadPublicRegistryOptions();
      const knownRegistryUrls = new Set(registryOptions.map((option) => option.url));
      const configuredOptions = configuredRegistries
        .filter((url) => !knownRegistryUrls.has(url))
        .map((url, index) => ({
          id: `configured-${index + 1}`,
          label: url,
          url,
        }));
      setOnboardingRegistryOptions([...registryOptions, ...configuredOptions]);
      setOnboardingPublicRegistries(configuredRegistries);
      setOnboardingProfileMetadata(profileMetadata);
      const infrastructureReady = Boolean(
        catalogReadiness.catalogConfigured &&
          configuredRegistries.length > 0 &&
          inboxReadiness.configured
      );
      const profileReady = Boolean(
        profileMetadata.publisher && profileMetadata.contactEmail
      );
      setOnboardingInfrastructureReady(infrastructureReady);
      setOnboardingProfileReady(profileReady);
      if (!privateOnboardingCompleteFor(record, onboardingContext)) {
        setOnboardingRequired(true);
        return;
      }
      await ensureStorage(root, auth.webId, fetcher);
      if (revision !== authRevision.current) return;
      const stored = await loadState(root, fetcher);
      if (revision !== authRevision.current) return;
      podAccessActive.current = true;
      setOnboardingRequired(false);
      activateState(stored);
    } catch (reason) {
      if (revision !== authRevision.current) return;
      setError(reason instanceof Error ? reason.message : "City Tours konnte nicht geladen werden.");
    } finally {
      if (revision === authRevision.current) setLoading(false);
    }
  }, [activateLocalMode, activateState, embedded]);

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
      podAccessActive.current = false;
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

  const podConnected = Boolean(
    podAccessActive.current &&
      webId &&
      solidFetch &&
      podRoot &&
      hasSolidPodAccess(webId)
  );
  const [donationSyncStatus, setDonationSyncStatus] = useState<"idle" | "syncing" | "error">("idle");
  const [donationRetry, setDonationRetry] = useState(0);
  const donationAttempt = useRef("");
  const donationSyncInFlight = useRef(false);
  useEffect(() => {
    const retry = () => setDonationRetry(value => value + 1);
    const timer = window.setInterval(retry, 60_000);
    window.addEventListener("online", retry);
    return () => { window.clearInterval(timer); window.removeEventListener("online", retry); };
  }, []);
  useEffect(() => {
    setDonationSyncStatus("idle");
    donationAttempt.current = "";
  }, [webId, state.activeRun?.scenarioRunId]);
  useEffect(() => {
    if (!podConnected || !podRoot || !webId || !solidFetch || loading || busy || donationSyncInFlight.current) return;
    const allowLegacy = legacyContinuousDonationAllowed(webId);
    if (!donationNeedsSync(state, allowLegacy)) return;
    const revision = authRevision.current;
    const attemptKey = JSON.stringify([revision, state.activeRun, state.activities.map(activity => activity.id), donationRetry]);
    if (donationAttempt.current === attemptKey) return;
    donationAttempt.current = attemptKey;
    donationSyncInFlight.current = true;
    setBusy(true);
    setDonationSyncStatus("syncing");
    const guardedFetch: SolidFetch = async (input, init) => {
      if (revision !== authRevision.current || !podAccessActive.current) throw new Error("Solid session changed.");
      const response = await solidFetch(input, init);
      if (revision !== authRevision.current || !podAccessActive.current) throw new Error("Solid session changed.");
      return response;
    };
    void synchronizeContinuousDonation({ podRoot, webId, run: state.activeRun!, fetcher: guardedFetch, allowLegacy })
      .then(updated => {
        if (revision !== authRevision.current) return;
        setState(updated);
        setDonationSyncStatus("idle");
      }).catch(() => {
        if (revision === authRevision.current) setDonationSyncStatus("error");
      }).finally(() => {
        donationSyncInFlight.current = false;
        if (revision === authRevision.current) setBusy(false);
      });
  }, [podConnected, podRoot, webId, solidFetch, loading, busy, state, donationRetry]);

  const refreshCatalogedRoutes = useCallback(async () => {
    if (!podConnected || !podRoot || !webId || !solidFetch) {
      setCatalogedRoutes([]);
      return;
    }
    const catalogAuthRevision = authRevision.current;
    const requestRevision = ++catalogRequestRevision.current;
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const routes = await discoverCatalogedRoutes({
        podRoot,
        webId,
        fetcher: solidFetch,
        anonymousFetch: (input, init) => globalThis.fetch(input, init),
        includeMunicipalRoutes: true,
      });
      if (catalogAuthRevision === authRevision.current && requestRevision === catalogRequestRevision.current) {
        setCatalogedRoutes(routes);
        setCatalogReport(getCatalogedRouteDiscoveryReport(routes));
      }
    } catch (reason) {
      if (catalogAuthRevision === authRevision.current && requestRevision === catalogRequestRevision.current) {
        setCatalogError(reason instanceof Error ? reason.message : translate(languageRef.current, "catalogLoadFailed"));
      }
    } finally {
      if (catalogAuthRevision === authRevision.current && requestRevision === catalogRequestRevision.current) setCatalogLoading(false);
    }
  }, [podConnected, podRoot, solidFetch, webId]);

  useEffect(() => {
    let cancelled = false;
    if (!podConnected) {
      setCatalogedRoutes([]);
      return () => {
        cancelled = true;
      };
    }
    void refreshCatalogedRoutes().catch((reason) => {
      if (!cancelled) {
        setCatalogedRoutes([]);
        setFailure(reason);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [podConnected, refreshCatalogedRoutes]);
  const renderedAuthRevision = authRevision.current;
  const assertCurrentAuthContext = () => {
    if (renderedAuthRevision !== authRevision.current) {
      throw new Error("Die Solid-Sitzung hat sich geändert. Bitte wiederhole die Aktion.");
    }
  };

  const completeAppOnboarding = ({
    registryUrl,
    publisher,
    contactEmail,
  }: {
    registryUrl?: string;
    publisher?: string;
    contactEmail?: string;
  } = {}) =>
    mutate(async () => {
      assertCurrentAuthContext();
      if (!webId || !solidFetch || !podRoot) {
        throw new Error("Der private Solid Pod ist für die Einrichtung nicht verfügbar.");
      }
      if (!publicSetupRequired) {
        const privateRecord = completePrivateOnboardingRecord(onboardingRecord, embedded ? "embedded" : "standalone");
        await ensureStorage(podRoot, webId, solidFetch);
        assertCurrentAuthContext();
        await saveCityToursOnboarding(podRoot, privateRecord, webId, solidFetch);
        assertCurrentAuthContext();
        const stored = await loadState(podRoot, solidFetch);
        assertCurrentAuthContext();
        podAccessActive.current = true;
        setOnboardingRecord(privateRecord);
        setOnboardingRequired(false);
        activateState(stored);
        return;
      }
      const context = embedded ? "embedded" : "standalone";
      let selectedRegistry: string;
      let publicRegistries: string[];
      if (embedded) {
        const [readiness, inboxReadiness, profileMetadata] = await Promise.all([
          loadRouteCatalogReadiness({ podRoot, webId, fetcher: solidFetch }),
          getCityToursInboxReadiness({ podRoot, webId, fetcher: solidFetch }),
          loadCatalogProfileMetadata(webId, solidFetch),
        ]);
        assertCurrentAuthContext();
        if (
          !readiness.catalogConfigured ||
          readiness.publicRegistries.length === 0 ||
          !inboxReadiness.configured
        ) {
          throw new Error(
            "Schließe zuerst das allgemeine Dataspace-Onboarding ab, damit eine öffentliche Research-Registry und eine öffentliche Append-only-Solid-Inbox eingerichtet sind."
          );
        }
        if (!profileMetadata.publisher || !profileMetadata.contactEmail) {
          throw new Error(
            "Vervollständige zuerst deinen Publisher-Namen und deine Kontakt-E-Mail im Profile Manager oder im allgemeinen Dataspace-Onboarding."
          );
        }
        selectedRegistry =
          (onboardingRecord?.publicRegistryUrl &&
          readiness.publicRegistries.includes(onboardingRecord.publicRegistryUrl)
            ? onboardingRecord.publicRegistryUrl
            : readiness.publicRegistries[0]);
        publicRegistries = readiness.publicRegistries;
      } else {
        if (!registryUrl) {
          throw new Error("Die öffentliche Research-Registry ist ungültig.");
        }
        if (!publisher || !contactEmail) {
          throw new Error(
            "Publisher-Name und Kontakt-E-Mail müssen für öffentliche Katalogeinträge angegeben werden."
          );
        }
        await saveCatalogProfileMetadata({
          webId,
          publisher,
          contactEmail,
          fetcher: solidFetch,
        });
        assertCurrentAuthContext();
        // Both operations update the WebID profile. Keep them sequential so
        // Catalog setup preserves the freshly linked ldp:inbox value.
        await ensureCityToursInbox({ podRoot, webId, fetcher: solidFetch });
        assertCurrentAuthContext();
        const readiness = await ensureRouteCatalogReadiness({
          podRoot,
          webId,
          registryUrl,
          fetcher: solidFetch,
        });
        assertCurrentAuthContext();
        if (
          !readiness.catalogConfigured ||
          !readiness.publicRegistries.includes(readiness.selectedRegistry)
        ) {
          throw new Error(
            "Die öffentliche Research-Registry konnte nicht sicher eingerichtet werden."
          );
        }
        selectedRegistry = readiness.selectedRegistry;
        publicRegistries = readiness.publicRegistries;
      }
      const record = completeOnboardingRecord(
        onboardingRecord,
        context,
        selectedRegistry
      );
      await ensureStorage(podRoot, webId, solidFetch);
      assertCurrentAuthContext();
      await saveCityToursOnboarding(podRoot, record, webId, solidFetch);
      assertCurrentAuthContext();
      // Public setup returns to the existing editor without replacing unsaved work.
      setPublicSetupRequired(false);
      setOnboardingRecord(record);
      setOnboardingRequired(false);
      setOnboardingInfrastructureReady(true);
      setOnboardingProfileReady(true);
      setOnboardingPublicRegistries(publicRegistries);
      void refreshCatalogedRoutes();
    });

  const persistStateForCurrentMode = async (
    next: ToursState,
    baseState: ToursState = state
  ) => {
    assertCurrentAuthContext();
    if (podConnected && podRoot && solidFetch && webId) {
      await saveState(podRoot, next, baseState, webId, solidFetch);
      assertCurrentAuthContext();
      return;
    }
    if (isAuthenticated) {
      throw new Error("Der private Solid Pod ist für diese Aktion nicht verfügbar.");
    }
    saveLocalToursStateForIdentity(
      { ...next, activeRun: null },
      authenticatedWebId
    );
  };

  const updateDraft = <K extends keyof TourDraft>(key: K, value: TourDraft[K]) => {
    if (!isEditing) return;
    setDraft((current) => {
      generatedDefaultDraftIds.current.delete(current.id);
      return { ...current, [key]: value, updatedAt: new Date().toISOString() };
    });
  };

  const addPoint = (point: Coordinate) => {
    if (!isEditing || !isDrawing || busy) return;
    setGeometryHistory((history) => [...history.slice(-99), cloneDraft(draft)]);
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
    if (!isEditing || busy || !geometryHistory.length) return;
    const previous = geometryHistory.at(-1)!;
    setDraft((current) => ({ ...current, geometry: previous.geometry,
      routeSource: previous.routeSource, durationMinutes: previous.durationMinutes,
      durationSource: previous.durationSource, updatedAt: new Date().toISOString() }));
    setGeometryHistory((history) => history.slice(0, -1));
  };

  const clearRoute = () => {
    if (!isEditing || busy) return;
    setGeometryHistory((history) => [...history.slice(-99), cloneDraft(draft)]);
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

  const importFile = (file: File | undefined, discardConfirmed = false) => {
    if (!file) return;
    if (!discardConfirmed && editorHasPendingChanges()) {
      setPendingAction({ kind: "import", file });
      return;
    }
    void mutate(async () => {
      const imported = importRouteFile(file.name, await file.text(), {
        importedTour: t("importedTour"),
        importedGpxTour: t("importedGpxTour"),
      });
      assertCurrentAuthContext();
      const now = new Date().toISOString();
      const importedDraft: TourDraft = {
        id: createId(),
        name: imported.name,
        routeSource: imported.routeSource,
        geometry: imported.geometry,
        durationMinutes: imported.durationMinutes,
        durationSource: imported.durationSource,
        createdAt: now,
        updatedAt: now,
      };
      setDraft(importedDraft);
      setIsEditing(true);
    });
  };

  const persistCatalogedDraft = async (
    normalized: TourDraft,
    previousDraft: TourDraft,
    renderedPublication: RouteCatalogPublication
  ): Promise<ToursState> => {
    if (!podConnected || !podRoot || !solidFetch || !webId) {
      throw new Error("Der private Solid Pod ist für diese Aktion nicht verfügbar.");
    }
    if (!publicSharingReady) throw new Error(t("publicSetup"));
    const resumingUpdate = renderedPublication.phase === "updating";
    if (!resumingUpdate && renderedPublication.phase !== "published") {
      throw new Error(
        "Die Routenvorlage ist erst nach Abschluss der laufenden Katalogaktion wieder bearbeitbar."
      );
    }
    if (resumingUpdate) {
      if (!catalogPhaseLeaseExpired(renderedPublication)) {
        throw new Error("Die Routenvorlage wird gerade in einem anderen Tab aktualisiert.");
      }
      if (
        !renderedPublication.pendingUpdate ||
        !sameStoredDraft(renderedPublication.pendingUpdate.draft, normalized)
      ) {
        throw new Error(
          "Das unterbrochene Routenvorlagen-Update enthält keinen sicher wiederaufnehmbaren Zielstand."
        );
      }
    }

    const remoteSnapshot = await loadStateSnapshot(podRoot, solidFetch);
    assertCurrentAuthContext();
    if (!remoteSnapshot.etag) {
      throw new Error(
        "Der Pod liefert keinen starken Versionsnachweis für das Routenvorlagen-Update."
      );
    }
    const authoritativeDraft = remoteSnapshot.state.drafts.find(
      (item) => item.id === normalized.id
    );
    const authoritativePublication = remoteSnapshot.state.catalogPublications.find(
      (publication) => publication.sourceDraftId === normalized.id
    );
    if (
      !authoritativeDraft ||
      JSON.stringify(authoritativeDraft) !== JSON.stringify(previousDraft) ||
      !authoritativePublication ||
      !sameCatalogPublication(authoritativePublication, renderedPublication)
    ) {
      setState(remoteSnapshot.state);
      throw new Error(
        "Die Route oder ihre Katalogveröffentlichung wurde zwischenzeitlich geändert. Der aktuelle Stand wurde neu geladen."
      );
    }
    if (authoritativePublication.phase !== renderedPublication.phase) {
      setState(remoteSnapshot.state);
      throw new Error("Die Routenvorlage wird gerade in einem anderen Tab aktualisiert.");
    }
    if (
      resumingUpdate &&
      (authoritativePublication.phaseChangedAt !== renderedPublication.phaseChangedAt ||
        !authoritativePublication.pendingUpdate ||
        authoritativePublication.pendingUpdate.operationId !==
          renderedPublication.pendingUpdate?.operationId ||
        !sameStoredDraft(authoritativePublication.pendingUpdate.draft, normalized))
    ) {
      setState(remoteSnapshot.state);
      throw new Error("Das Routenvorlagen-Update wurde zwischenzeitlich übernommen.");
    }

    const phaseChangedAt = new Date().toISOString();
    const operationId =
      authoritativePublication.pendingUpdate?.operationId || createId();
    const leaseId = createId();
    const claimedPublication: RouteCatalogPublication = {
      ...authoritativePublication,
      phase: "updating",
      phaseChangedAt,
      pendingUpdate: {
        operationId,
        leaseId,
        draft: cloneDraft(normalized),
      },
    };
    const claimedSnapshot = await saveStateIfUnchanged(
      podRoot,
      {
        ...remoteSnapshot.state,
        catalogPublications: remoteSnapshot.state.catalogPublications.map((publication) =>
          publication.routeTemplateId === claimedPublication.routeTemplateId
            ? claimedPublication
            : publication
        ),
      },
      remoteSnapshot.etag,
      webId,
      solidFetch
    );
    assertCurrentAuthContext();
    setState(claimedSnapshot.state);

    const previousPublicSnapshot = createRouteTemplateSnapshot(
      authoritativeDraft,
      claimedPublication.routeTemplateId
    );
    const nextPublicSnapshot = createRouteTemplateSnapshot(
      normalized,
      claimedPublication.routeTemplateId
    );
    let publicUpdate: PublicRouteTemplateUpdateResult | null = null;
    let catalogUpdateAttempted = false;
    let writtenDraft: { etag: string } | null = null;

    try {
      const observedPublic = await loadPublicRouteTemplateResourceSnapshot(
        podRoot,
        claimedPublication.resourceUrl,
        claimedPublication.routeTemplateId,
        solidFetch
      );
      assertCurrentAuthContext();
      const publicMatchesPrevious =
        JSON.stringify(observedPublic.snapshot) === JSON.stringify(previousPublicSnapshot);
      const publicMatchesNext =
        JSON.stringify(observedPublic.snapshot) === JSON.stringify(nextPublicSnapshot);
      if (!publicMatchesPrevious && !(resumingUpdate && publicMatchesNext)) {
        throw new Error(
          "Die öffentliche Routenvorlage weicht vom gespeicherten privaten Stand ab."
        );
      }
      if (publicMatchesPrevious) {
        publicUpdate = await updatePublicRouteTemplateConditionally(
          podRoot,
          claimedPublication.resourceUrl,
          claimedPublication.routeTemplateId,
          nextPublicSnapshot,
          webId,
          solidFetch,
          observedPublic
        );
        assertCurrentAuthContext();
      }

      catalogUpdateAttempted = true;
      const catalogUpdate = await updateRouteTemplateCatalogEntry({
        podRoot,
        webId,
        snapshot: nextPublicSnapshot,
        resourceUrl: claimedPublication.resourceUrl,
        catalogDatasetUrl: claimedPublication.catalogDatasetUrl,
        publishedAt: claimedPublication.publishedAt,
        operationId,
        fetcher: solidFetch,
      });
      assertCurrentAuthContext();
      if (
        catalogUpdate.datasetIdentifier !== claimedPublication.datasetIdentifier ||
        catalogUpdate.catalogDatasetUrl !== claimedPublication.catalogDatasetUrl
      ) {
        throw new Error("Der Katalog antwortete mit einer unerwarteten Routenvorlagen-Referenz.");
      }

      const privateSnapshot = await loadDraftMasterResourceSnapshot(
        podRoot,
        authoritativeDraft.id,
        solidFetch
      );
      assertCurrentAuthContext();
      const privateMatchesPrevious = sameStoredDraft(
        privateSnapshot.draft,
        authoritativeDraft
      );
      const privateMatchesNext = sameStoredDraft(privateSnapshot.draft, normalized);
      if (!privateMatchesPrevious && !(resumingUpdate && privateMatchesNext)) {
        throw new Error("Der private Tourentwurf wurde zwischenzeitlich verändert.");
      }
      if (privateMatchesPrevious) {
        writtenDraft = await saveDraftConditionally(
          podRoot,
          normalized,
          privateSnapshot.etag,
          webId,
          solidFetch
        );
        assertCurrentAuthContext();
      }

      for (let attempt = 0; attempt < RECOVERY_STATE_CAS_ATTEMPTS; attempt += 1) {
        const latest = await loadStateSnapshot(podRoot, solidFetch);
        assertCurrentAuthContext();
        const latestDraft = latest.state.drafts.find((item) => item.id === normalized.id);
        const latestPublication = latest.state.catalogPublications.find(
          (publication) => publication.routeTemplateId === claimedPublication.routeTemplateId
        );
        if (
          !latest.etag ||
          JSON.stringify(latestDraft) !== JSON.stringify(authoritativeDraft) ||
          !latestPublication ||
          latestPublication.phase !== "updating" ||
          latestPublication.phaseChangedAt !== phaseChangedAt ||
          !sameCatalogPublication(latestPublication, claimedPublication) ||
          !samePendingUpdate(latestPublication, operationId, leaseId, normalized)
        ) {
          throw new Error(
            "Das Routenvorlagen-Update wurde parallel verändert und konnte nicht abgeschlossen werden."
          );
        }
        const { pendingUpdate: _pendingUpdate, ...publicationWithoutPendingUpdate } =
          latestPublication;
        const finalizedPublication: RouteCatalogPublication = {
          ...publicationWithoutPendingUpdate,
          phase: "published",
          phaseChangedAt: new Date().toISOString(),
          sourceDraftUpdatedAt: normalized.updatedAt,
        };
        const nextState: ToursState = {
          ...latest.state,
          drafts: [
            normalized,
            ...latest.state.drafts.filter((item) => item.id !== normalized.id),
          ],
          catalogPublications: latest.state.catalogPublications.map((publication) =>
            publication.routeTemplateId === finalizedPublication.routeTemplateId
              ? finalizedPublication
              : publication
          ),
        };
        try {
          const committed = await saveStateIfUnchanged(
            podRoot,
            nextState,
            latest.etag,
            webId,
            solidFetch
          );
          assertCurrentAuthContext();
          setDraft(cloneDraft(normalized));
          setState(committed.state);
          try {
            await refreshCatalogedRoutes();
          } catch {
            // The authoritative update is complete; discovery retries later.
          }
          return committed.state;
        } catch (reason) {
          if (!isStateConflictError(reason) || attempt === RECOVERY_STATE_CAS_ATTEMPTS - 1) {
            throw reason;
          }
        }
      }
      throw new Error("Das Routenvorlagen-Update konnte nicht atomar abgeschlossen werden.");
    } catch (operationError) {
      if (resumingUpdate) {
        throw new AggregateError(
          [operationError],
          "Das unterbrochene Routenvorlagen-Update konnte noch nicht abgeschlossen werden. Der gespeicherte Zielstand kann erneut fortgesetzt werden."
        );
      }
      const compensationErrors: unknown[] = [];
      if (writtenDraft) {
        try {
          await saveDraftConditionally(
            podRoot,
            authoritativeDraft,
            writtenDraft.etag,
            webId,
            solidFetch
          );
        } catch (reason) {
          compensationErrors.push(reason);
        }
      }
      if (catalogUpdateAttempted) {
        try {
          await updateRouteTemplateCatalogEntry({
            podRoot,
            webId,
            snapshot: previousPublicSnapshot,
            resourceUrl: claimedPublication.resourceUrl,
            catalogDatasetUrl: claimedPublication.catalogDatasetUrl,
            publishedAt: claimedPublication.publishedAt,
            operationId,
            fetcher: solidFetch,
          });
        } catch (reason) {
          compensationErrors.push(reason);
        }
      }
      if (publicUpdate) {
        try {
          await updatePublicRouteTemplateConditionally(
            podRoot,
            claimedPublication.resourceUrl,
            claimedPublication.routeTemplateId,
            publicUpdate.previous.snapshot,
            webId,
            solidFetch,
            publicUpdate.current
          );
        } catch (reason) {
          compensationErrors.push(reason);
        }
      }

      if (compensationErrors.length === 0) {
        for (let attempt = 0; attempt < RECOVERY_STATE_CAS_ATTEMPTS; attempt += 1) {
          try {
            const latest = await loadStateSnapshot(podRoot, solidFetch);
            assertCurrentAuthContext();
            const latestPublication = latest.state.catalogPublications.find(
              (publication) => publication.routeTemplateId === claimedPublication.routeTemplateId
            );
            if (
              !latest.etag ||
              !latestPublication ||
              latestPublication.phase !== "updating" ||
              latestPublication.phaseChangedAt !== phaseChangedAt ||
              !sameCatalogPublication(latestPublication, claimedPublication) ||
              !samePendingUpdate(latestPublication, operationId, leaseId, normalized)
            ) {
              throw new Error("Der Aktualisierungsstatus wurde zwischenzeitlich verändert.");
            }
            const restored = await saveStateIfUnchanged(
              podRoot,
              {
                ...latest.state,
                catalogPublications: latest.state.catalogPublications.map((publication) => {
                  if (publication.routeTemplateId !== claimedPublication.routeTemplateId) {
                    return publication;
                  }
                  const {
                    pendingUpdate: _pendingUpdate,
                    ...publicationWithoutPendingUpdate
                  } = publication;
                  return {
                    ...publicationWithoutPendingUpdate,
                    phase: "published" as const,
                    phaseChangedAt: new Date().toISOString(),
                  };
                }),
              },
              latest.etag,
              webId,
              solidFetch
            );
            setState(restored.state);
            break;
          } catch (reason) {
            if (!isStateConflictError(reason) || attempt === RECOVERY_STATE_CAS_ATTEMPTS - 1) {
              compensationErrors.push(reason);
              break;
            }
          }
        }
      }

      if (compensationErrors.length > 0) {
        throw new AggregateError(
          [operationError, ...compensationErrors],
          "Die veröffentlichte Route konnte nicht vollständig aktualisiert werden. Deine Änderungen bleiben im Editor erhalten."
        );
      }
      throw operationError;
    }
  };

  const persistDraft = async (candidate: TourDraft): Promise<ToursState> => {
    assertCurrentAuthContext();
    if (!candidate.name.trim()) throw new Error("Gib der Tour einen Namen.");
    if (!isValidGeometry(candidate.geometry)) throw new Error("Die Tour braucht mindestens zwei Punkte.");
    const normalized = { ...candidate, name: candidate.name.trim(), updatedAt: new Date().toISOString() };
    const previousDraft = state.drafts.find((item) => item.id === normalized.id) || null;
    const existingPublication = state.catalogPublications.find(
      (publication) => publication.sourceDraftId === normalized.id
    );
    if (previousDraft && existingPublication) {
      const contentChanged = !sameDraftContent(previousDraft, normalized);
      if (contentChanged) {
        return persistCatalogedDraft(normalized, previousDraft, existingPublication);
      }
      // Completing an unchanged cataloged route must not rewrite its private
      // master merely to advance updatedAt.
      setDraft(cloneDraft(previousDraft));
      return state;
    }
    let writtenDraft: { etag: string } | null = null;
    if (podConnected && podRoot && solidFetch && webId) {
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
      activeRun: podConnected ? state.activeRun : null,
      drafts: [normalized, ...state.drafts.filter((item) => item.id !== normalized.id)],
    };
    let stateCommitted = false;
    try {
      if (podConnected && podRoot && solidFetch && webId) {
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
            "Der Tourentwurf konnte nach einem Statuskonflikt nicht sicher zurückgerollt werden. Lade City Tours neu."
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
            "Der Pod-Stand hat sich geändert und konnte nicht neu geladen werden. Lade City Tours neu."
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
      setIsEditing(false);
    });

  const handleComplete = async (activityType: ActivityType, completionDate: string) => {
    const operationRevision = ++completionOperationRevision.current;
    setCompletionInProgress(activityType);
    try {
      await mutate(async () => {
        assertCurrentAuthContext();
        const storedDraft = state.drafts.find((item) => item.id === draft.id);
        if (!storedDraft || (isEditing && !sameDraftContent(storedDraft, draft))) {
          throw new Error("Speichere die Route, bevor du sie als gemacht markierst.");
        }
        const stateWithDraft = state;
        const activity = completeTour(storedDraft, completionDate, activityType);
        let writtenActivity: { etag: string } | null = null;
        if (podConnected && podRoot && solidFetch && webId) {
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
          if (podConnected && podRoot && solidFetch && webId) {
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
                "Die neue Aktivität konnte nach einem Statuskonflikt nicht sicher entfernt werden. Lade City Tours neu."
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
                "Der Pod-Stand hat sich geändert und konnte nicht neu geladen werden. Lade City Tours neu."
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
      const normalizedCompletedDate = localDate(new Date());
      setCompletedDateInput(formatDate(normalizedCompletedDate, language));
      setCompletedDateError(null);
      const storedDraft = state.drafts.find((item) => item.id === draft.id);
      if (!storedDraft || (isEditing && !sameDraftContent(storedDraft, draft))) {
        throw new Error("Speichere die Route, bevor du sie als gemacht markierst.");
      }
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
      if (!publicSharingReady) throw new Error(t("publicSetup"));
      if (!podConnected || !podRoot || !solidFetch || !webId) {
        throw new Error("Restricted Publish ist für dieses Konto nicht verfügbar.");
      }
      if (baseState.activeRun) throw new Error("Setze zuerst den aktiven Szenariolauf zurück.");
      const scenarioRunId = createId();
      const snapshotPayload = publishedActivityCollection(baseState.activities, scenarioRunId, "continuous");
      const runContainerUrl = `${storageUrls(podRoot).runs}${scenarioRunId}/`;
      const resourceUrl = `${runContainerUrl}activity.geojson`;
      const manifestUrl = `${runContainerUrl}manifest.ttl`;
      const catalogReference = catalogPublicationReference(podRoot, scenarioRunId);
      const publishedAt = new Date().toISOString();
      const recoveryRun: ActiveRun = validateActiveRun(podRoot, {
        donationMode: "continuous",
        phase: "publishing",
        scenarioRunId,
        activityIds: baseState.activities.map((activity) => activity.id),
        resourceUrl,
        manifestUrl,
        runContainerUrl,
        ...catalogReference,
        publishedAt,
      });
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
            donationMode: "continuous",
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
      if (!podConnected || !podRoot || !solidFetch || !webId) {
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
      if (!podConnected || !podRoot || !solidFetch || !webId || !state.activeRun) return;
      await resetActiveRun(validateActiveRun(podRoot, state.activeRun));
    });

  const publicSharingReady = onboardingCompleteFor(onboardingRecord, embedded ? "embedded" : "standalone") &&
    onboardingInfrastructureReady && onboardingProfileReady && Boolean(onboardingRecord?.publicRegistryUrl && onboardingPublicRegistries.includes(onboardingRecord.publicRegistryUrl));
  const requestPublicSetup = () => {
    if (editorHasPendingChanges()) { setPendingAction({ kind: "public-setup" }); return; }
    setPublicSetupRequired(true);
  };
  const requestDonation = () => {
    if (!publicSharingReady) { requestPublicSetup(); return; }
    setDonationConfirmation("publish");
  };

  const requestCatalogIndex = (drafts: TourDraft[]) => {
    if (!publicSharingReady) { requestPublicSetup(); return; }
    const unpublished = drafts.filter(
      (candidate) =>
        isDraftEligibleForCatalogPublication(candidate) &&
        !state.catalogPublications.some(
          (publication) => publication.sourceDraftId === candidate.id
        )
    );
    if (unpublished.length > 0) setCatalogConfirmation({ kind: "index", drafts: unpublished });
  };

  const catalogPhaseLeaseExpired = (publication: RouteCatalogPublication) =>
    publication.phase !== "published" &&
    Date.now() - Date.parse(publication.phaseChangedAt) >= CATALOG_PUBLICATION_LEASE_MS;

  const requestCatalogRemoval = (item: TourDraft) => {
    const publication = state.catalogPublications.find(
      (candidate) => candidate.sourceDraftId === item.id
    );
    if (!publication) return;
    if (publication.phase === "publishing" && !catalogPhaseLeaseExpired(publication)) {
      setError("Die Routenvorlage wird gerade veröffentlicht. Versuche es nach Abschluss erneut.");
      return;
    }
    if (publication.phase === "updating" && !catalogPhaseLeaseExpired(publication)) {
      setError("Die Routenvorlage wird gerade in einem anderen Tab aktualisiert.");
      return;
    }
    if (publication.phase === "removing" && !catalogPhaseLeaseExpired(publication)) {
      setError("Die Routenvorlage wird bereits in einem anderen Tab entfernt.");
      return;
    }
    setCatalogConfirmation({ kind: "remove", draft: item, publication });
  };

  const sameCatalogPublication = (
    left: RouteCatalogPublication,
    right: RouteCatalogPublication
  ) =>
    left.routeTemplateId === right.routeTemplateId &&
    left.sourceDraftId === right.sourceDraftId &&
    left.sourceDraftUpdatedAt === right.sourceDraftUpdatedAt &&
    left.resourceUrl === right.resourceUrl &&
    left.datasetIdentifier === right.datasetIdentifier &&
    left.catalogDatasetUrl === right.catalogDatasetUrl &&
    left.publishedAt === right.publishedAt;

  const indexDraftsInCatalog = (requestedDrafts: TourDraft[]) =>
    mutate(async () => {
      assertCurrentAuthContext();
      if (!podConnected || !podRoot || !solidFetch || !webId) {
        throw new Error("Für die Katalogveröffentlichung ist ein verbundener Solid Pod erforderlich.");
      }
      const readiness = await loadRouteCatalogReadiness({ podRoot, webId, fetcher: solidFetch });
      if (!readiness.catalogConfigured || readiness.publicRegistries.length === 0) {
        throw new Error(
          "Für öffentliche Routenvorlagen müssen ein Katalog und eine öffentliche Research-Registry konfiguriert sein."
        );
      }
      const remoteSnapshot = await loadStateSnapshot(podRoot, solidFetch);
      assertCurrentAuthContext();
      if (!remoteSnapshot.etag) {
        throw new Error("Der Pod liefert keinen starken Versionsnachweis für den City-Tours-Status.");
      }
      const requestedIds = new Set(requestedDrafts.map((item) => item.id));
      const remoteDrafts = remoteSnapshot.state.drafts.filter((item) => requestedIds.has(item.id));
      if (
        remoteDrafts.length !== requestedIds.size ||
        remoteDrafts.some((item) => {
          const requested = requestedDrafts.find((candidate) => candidate.id === item.id);
          return !requested || JSON.stringify(requested) !== JSON.stringify(item);
        })
      ) {
        setState(remoteSnapshot.state);
        throw new Error("Mindestens eine Tour wurde im Pod geändert. Der aktuelle Stand wurde neu geladen.");
      }
      if (remoteDrafts.some((item) => !isDraftEligibleForCatalogPublication(item))) {
        setState(remoteSnapshot.state);
        throw new Error(
          "Eine aus dem Routenkatalog übernommene Tour kann nicht erneut katalogisiert werden."
        );
      }
      if (
        remoteSnapshot.state.catalogPublications.some((publication) =>
          requestedIds.has(publication.sourceDraftId)
        )
      ) {
        setState(remoteSnapshot.state);
        throw new Error("Mindestens eine Tour ist bereits im Katalog veröffentlicht.");
      }

      // Store deterministic cleanup handles privately before anything becomes
      // public. A browser/tab crash can therefore never leave a public route
      // without an unpublish action in the next City Tours session.
      const planned = remoteDrafts.map((item) => {
        const snapshot = createRouteTemplateSnapshot(item);
        const datasetIdentifier = `solid-tours-route-template-${snapshot.properties.routeTemplateId}`;
        const resourceUrl = `${podRoot}solid-tours/public/cataloged-routes/${snapshot.properties.routeTemplateId}.geojson`;
        const phaseChangedAt = new Date().toISOString();
        return {
          snapshot,
          publication: {
            phase: "publishing",
            phaseChangedAt,
            routeTemplateId: snapshot.properties.routeTemplateId,
            sourceDraftId: item.id,
            sourceDraftUpdatedAt: item.updatedAt,
            resourceUrl,
            datasetIdentifier,
            catalogDatasetUrl: `${podRoot}catalog/ds/${datasetIdentifier}.ttl#it`,
            publishedAt: phaseChangedAt,
          } satisfies RouteCatalogPublication,
        };
      });
      const staged = await saveStateIfUnchanged(
        podRoot,
        {
          ...remoteSnapshot.state,
          catalogPublications: [
            ...planned.map(({ publication }) => publication),
            ...remoteSnapshot.state.catalogPublications,
          ],
        },
        remoteSnapshot.etag,
        webId,
        solidFetch
      );
      assertCurrentAuthContext();
      setState(staged.state);

      const rollbackErrors: unknown[] = [];
      try {
        for (const { snapshot, publication: expectedPublication } of planned) {
          const resourceUrl = await savePublicRouteTemplate(
            podRoot,
            snapshot,
            webId,
            solidFetch
          );
          if (resourceUrl !== expectedPublication.resourceUrl) {
            throw new Error("Der Pod antwortete mit einer unerwarteten Routenvorlagen-Referenz.");
          }
          const publication = await publishRouteTemplateCatalogEntry({
            podRoot,
            webId,
            snapshot,
            resourceUrl,
            fetcher: solidFetch,
          });
          if (
            publication.datasetIdentifier !== expectedPublication.datasetIdentifier ||
            publication.catalogDatasetUrl !== expectedPublication.catalogDatasetUrl
          ) {
            throw new Error("Der Katalog antwortete mit einer unerwarteten Routenvorlagen-Referenz.");
          }
        }

        // The public writes above are not the commit point. Promote only the
        // exact private reservations made by this operation. If another tab or
        // a manual Pod edit removed/replaced one, the catch path below removes
        // every public side effect again.
        let finalized = false;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const latest = await loadStateSnapshot(podRoot, solidFetch);
          assertCurrentAuthContext();
          if (!latest.etag) {
            throw new Error(
              "Der Pod liefert keinen starken Versionsnachweis für den Katalogabschluss."
            );
          }
          const authoritative = planned.map(({ publication }) =>
            latest.state.catalogPublications.find(
              (candidate) => candidate.routeTemplateId === publication.routeTemplateId
            )
          );
          if (
            authoritative.some(
              (candidate, index) =>
                !candidate ||
                !sameCatalogPublication(candidate, planned[index].publication) ||
                !new Set(["publishing", "published"]).has(candidate.phase)
            )
          ) {
            setState(latest.state);
            throw new Error(
              "Die Katalogveröffentlichung wurde parallel abgebrochen und wird bereinigt."
            );
          }
          if (authoritative.every((candidate) => candidate?.phase === "published")) {
            setState(latest.state);
            finalized = true;
            break;
          }
          const next = {
            ...latest.state,
            catalogPublications: latest.state.catalogPublications.map((candidate) =>
              planned.some(
                ({ publication }) =>
                  sameCatalogPublication(candidate, publication)
              )
                ? {
                    ...candidate,
                    phase: "published" as const,
                    phaseChangedAt: new Date().toISOString(),
                  }
                : candidate
            ),
          };
          try {
            const committed = await saveStateIfUnchanged(
              podRoot,
              next,
              latest.etag,
              webId,
              solidFetch
            );
            assertCurrentAuthContext();
            setState(committed.state);
            finalized = true;
            break;
          } catch (finalizeError) {
            if (!isStateConflictError(finalizeError) || attempt === 2) {
              throw finalizeError;
            }
          }
        }
        if (!finalized) {
          throw new Error("Die Katalogveröffentlichung konnte nicht atomar abgeschlossen werden.");
        }
      } catch (operationError) {
        for (const { publication } of [...planned].reverse()) {
          try {
            await removeCatalogEntry({
              podRoot,
              webId,
              datasetIdentifier: publication.datasetIdentifier,
              catalogDatasetUrl: publication.catalogDatasetUrl,
              fetcher: solidFetch,
            });
          } catch (rollbackError) {
            rollbackErrors.push(rollbackError);
          }
          try {
            await setOwnerOnlyIfPresent(publication.resourceUrl, webId, solidFetch);
          } catch (rollbackError) {
            rollbackErrors.push(rollbackError);
          }
          try {
            await safeDelete(publication.resourceUrl, solidFetch);
          } catch (rollbackError) {
            rollbackErrors.push(rollbackError);
          }
        }
        if (rollbackErrors.length === 0) {
          for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
              const latest = await loadStateSnapshot(podRoot, solidFetch);
              assertCurrentAuthContext();
              if (!latest.etag) {
                throw new Error(
                  "Der Pod liefert keinen starken Versionsnachweis für die Katalog-Rückabwicklung."
                );
              }
              const remaining = latest.state.catalogPublications.filter(
                (publication) =>
                  !planned.some(
                    ({ publication: expected }) =>
                      sameCatalogPublication(publication, expected)
                  )
              );
              if (remaining.length === latest.state.catalogPublications.length) {
                setState(latest.state);
                break;
              }
              const reverted = await saveStateIfUnchanged(
                podRoot,
                { ...latest.state, catalogPublications: remaining },
                latest.etag,
                webId,
                solidFetch
              );
              assertCurrentAuthContext();
              setState(reverted.state);
              break;
            } catch (rollbackStateError) {
              if (attempt === 2 || !isStateConflictError(rollbackStateError)) {
                rollbackErrors.push(rollbackStateError);
                break;
              }
            }
          }
        } else {
          // A failed external cleanup stays explicitly recoverable. The
          // publication is never presented as successfully committed.
          for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
              const latest = await loadStateSnapshot(podRoot, solidFetch);
              assertCurrentAuthContext();
              if (!latest.etag) {
                throw new Error(
                  "Der Pod liefert keinen starken Versionsnachweis für die Katalogbereinigung."
                );
              }
              const next = {
                ...latest.state,
                catalogPublications: latest.state.catalogPublications.map((publication) =>
                  planned.some(({ publication: expected }) =>
                    sameCatalogPublication(publication, expected)
                  )
                    ? {
                        ...publication,
                        phase: "removing" as const,
                        phaseChangedAt: new Date().toISOString(),
                      }
                    : publication
                ),
              };
              const committed = await saveStateIfUnchanged(
                podRoot,
                next,
                latest.etag,
                webId,
                solidFetch
              );
              assertCurrentAuthContext();
              setState(committed.state);
              break;
            } catch (cleanupStateError) {
              if (attempt === 2 || !isStateConflictError(cleanupStateError)) {
                rollbackErrors.push(cleanupStateError);
                break;
              }
            }
          }
        }
        if (rollbackErrors.length > 0) {
          throw new AggregateError(
            [operationError, ...rollbackErrors],
            "Die Katalogveröffentlichung ist fehlgeschlagen und konnte nicht vollständig zurückgerollt werden. Die gespeicherte Referenz ermöglicht eine erneute Bereinigung über die Oberfläche."
          );
        }
        throw operationError;
      }
      try {
        await refreshCatalogedRoutes();
      } catch {
        // Publishing is complete; discovery will retry on the next load.
      }
    });

  const removeDraftFromCatalog = (
    item: TourDraft,
    expectedPublication: RouteCatalogPublication
  ) =>
    mutate(async () => {
      assertCurrentAuthContext();
      if (!podConnected || !podRoot || !solidFetch || !webId) {
        throw new Error("Für das Entfernen aus dem Katalog ist ein verbundener Solid Pod erforderlich.");
      }

      // Claim the cleanup in private state before deleting public resources.
      // A conflicting tab either observes `publishing` and must not interfere,
      // or loses this CAS and therefore never executes the external deletes.
      let claimedPublication: RouteCatalogPublication | null = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const remoteSnapshot = await loadStateSnapshot(podRoot, solidFetch);
        assertCurrentAuthContext();
        const publication = remoteSnapshot.state.catalogPublications.find(
          (candidate) => candidate.sourceDraftId === item.id
        );
        if (!publication) {
          setState(remoteSnapshot.state);
          return;
        }
        if (
          !sameCatalogPublication(publication, expectedPublication) ||
          !remoteSnapshot.etag
        ) {
          setState(remoteSnapshot.state);
          throw new Error("Die Katalogveröffentlichung wurde zwischenzeitlich geändert.");
        }
        if (publication.phase === "publishing" && !catalogPhaseLeaseExpired(publication)) {
          setState(remoteSnapshot.state);
          throw new Error(
            "Die Routenvorlage wird gerade veröffentlicht und kann noch nicht entfernt werden."
          );
        }
        if (publication.phase === "updating" && !catalogPhaseLeaseExpired(publication)) {
          setState(remoteSnapshot.state);
          throw new Error("Die Routenvorlage wird gerade in einem anderen Tab aktualisiert.");
        }
        if (publication.phase === "removing") {
          // Only a stale cleanup lease is recoverable. A fresh one belongs to
          // the tab that won the CAS and must not be duplicated.
          if (!catalogPhaseLeaseExpired(publication)) {
            setState(remoteSnapshot.state);
            throw new Error("Die Routenvorlage wird bereits in einem anderen Tab entfernt.");
          }
          claimedPublication = publication;
          setState(remoteSnapshot.state);
          break;
        }

        const removingPublication = {
          ...publication,
          phase: "removing" as const,
          phaseChangedAt: new Date().toISOString(),
        };
        try {
          const committed = await saveStateIfUnchanged(
            podRoot,
            {
              ...remoteSnapshot.state,
              catalogPublications: remoteSnapshot.state.catalogPublications.map(
                (candidate) =>
                  candidate.routeTemplateId === publication.routeTemplateId
                    ? removingPublication
                    : candidate
              ),
            },
            remoteSnapshot.etag,
            webId,
            solidFetch
          );
          assertCurrentAuthContext();
          setState(committed.state);
          claimedPublication = removingPublication;
          break;
        } catch (reason) {
          if (!isStateConflictError(reason) || attempt === 2) throw reason;
        }
      }

      if (!claimedPublication) {
        throw new Error("Die Katalogveröffentlichung konnte nicht zum Entfernen reserviert werden.");
      }

      const cleanupErrors: unknown[] = [];
      try {
        await removeCatalogEntry({
          podRoot,
          webId,
          datasetIdentifier: claimedPublication.datasetIdentifier,
          catalogDatasetUrl: claimedPublication.catalogDatasetUrl,
          fetcher: solidFetch,
        });
      } catch (reason) {
        cleanupErrors.push(reason);
      }
      try {
        await setOwnerOnlyIfPresent(claimedPublication.resourceUrl, webId, solidFetch);
      } catch (reason) {
        cleanupErrors.push(reason);
      }
      try {
        await safeDelete(claimedPublication.resourceUrl, solidFetch);
      } catch (reason) {
        cleanupErrors.push(reason);
      }
      assertCurrentAuthContext();
      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          cleanupErrors,
          "Die Routenvorlage konnte nicht vollständig entfernt werden. Die gespeicherte Referenz ermöglicht einen erneuten Bereinigungsversuch."
        );
      }

      // Dropping the cleanup handle is the final commit. Re-read the private
      // state and remove only the exact handle claimed above.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const latest = await loadStateSnapshot(podRoot, solidFetch);
        assertCurrentAuthContext();
        const authoritative = latest.state.catalogPublications.find(
          (candidate) => candidate.routeTemplateId === claimedPublication.routeTemplateId
        );
        if (!authoritative) {
          setState(latest.state);
          return;
        }
        if (
          !latest.etag ||
          authoritative.phase !== "removing" ||
          !sameCatalogPublication(authoritative, claimedPublication)
        ) {
          setState(latest.state);
          throw new Error("Die Katalogbereinigung wurde zwischenzeitlich geändert.");
        }
        try {
          const committed = await saveStateIfUnchanged(
            podRoot,
            {
              ...latest.state,
              catalogPublications: latest.state.catalogPublications.filter(
                (candidate) =>
                  candidate.routeTemplateId !== claimedPublication.routeTemplateId
              ),
            },
            latest.etag,
            webId,
            solidFetch
          );
          assertCurrentAuthContext();
          setState(committed.state);
          try {
            await refreshCatalogedRoutes();
          } catch {
            // Removal is complete; discovery will retry on the next load.
          }
          return;
        } catch (reason) {
          if (!isStateConflictError(reason) || attempt === 2) throw reason;
        }
      }
    });

  const adoptRouteFromCatalog = (route: CatalogedRoute, discardConfirmed = false) => {
    if (!discardConfirmed && editorHasPendingChanges()) {
      setPendingAction({ kind: "adopt", route });
      return;
    }
    mutate(async () => {
      if (!availableCatalogRoutes.some(
        (candidate) => catalogRouteKey(candidate) === catalogRouteKey(route)
      )) {
        setCatalogPreviewId(null);
        return;
      }
      const adopted = adoptCatalogedRoute(route);
      await persistDraft(adopted);
      setIsEditing(false);
      setActiveSection("tours");
      setCatalogPreviewId(null);
    });
  };

  const confirmCatalogAction = () => {
    const confirmation = catalogConfirmation;
    if (!confirmation) return;
    setCatalogConfirmation(null);
    if (confirmation.kind === "index") {
      indexDraftsInCatalog(confirmation.drafts);
    } else {
      removeDraftFromCatalog(confirmation.draft, confirmation.publication);
    }
  };

  const editorHasPendingChanges = (): boolean => {
    if (!isEditing) return false;
    const storedDraft = state.drafts.find((item) => item.id === draft.id);
    if (!storedDraft) return !generatedDefaultDraftIds.current.has(draft.id);
    return !sameDraftContent(storedDraft, draft);
  };

  const selectDraft = (selected: TourDraft, discardConfirmed = false) => {
    if (busy) return;
    if (selected.id === draft.id) { setActiveSection("tours"); return; }
    if (!discardConfirmed && editorHasPendingChanges()) {
      setPendingAction({ kind: "select", id: selected.id });
      return;
    }
    setActiveSection("tours");
    setCatalogPreviewId(null);
    setDraft(cloneDraft(selected));
    setIsEditing(false);
    setError(null);
  };

  const selectDraftById = (draftId: string) => {
    const selected = state.drafts.find((item) => item.id === draftId);
    if (selected) selectDraft(selected);
  };

  const beginDraftEditing = () => {
    const publication = state.catalogPublications.find(
      (candidate) => candidate.sourceDraftId === draft.id
    );
    if (publication && !publicSharingReady) { requestPublicSetup(); return; }
    if (publication?.phase === "updating") {
      if (!catalogPhaseLeaseExpired(publication)) {
        setError("Die Routenvorlage wird gerade in einem anderen Tab aktualisiert.");
        return;
      }
      const storedDraft = state.drafts.find((item) => item.id === draft.id);
      if (!storedDraft || !publication.pendingUpdate) {
        setError(
          "Das ältere unterbrochene Update kann nicht automatisch fortgesetzt werden. Die gespeicherte Katalogreferenz kann sicher entfernt werden."
        );
        return;
      }
      void mutate(async () => {
        const recoveredState = await persistCatalogedDraft(
          cloneDraft(publication.pendingUpdate!.draft),
          storedDraft,
          publication
        );
        const recoveredDraft = recoveredState.drafts.find(
          (item) => item.id === storedDraft.id
        );
        if (!recoveredDraft) {
          throw new Error("Der wiederaufgenommene Tourentwurf fehlt im Pod-Status.");
        }
        setDraft(cloneDraft(recoveredDraft));
        setIsEditing(true);
      });
      return;
    }
    if (publication && publication.phase !== "published") {
      setError(
        "Die Routenvorlage ist erst nach Abschluss der laufenden Katalogaktion wieder bearbeitbar."
      );
      return;
    }
    setIsEditing(true);
    setError(null);
  };

  const beginNewDraft = (discardConfirmed = false) => {
    if (busy) return;
    if (!discardConfirmed && editorHasPendingChanges()) {
      setPendingAction({ kind: "new" });
      return;
    }
    const freshDraft = createGeneratedDraft();
    setDraft(freshDraft);
    setIsEditing(true);
    setError(null);
  };

  const cancelDraftEditing = () => {
    const storedDraft = state.drafts.find((item) => item.id === draft.id);
    if (storedDraft) {
      setDraft(cloneDraft(storedDraft));
      setIsEditing(false);
    } else if (state.drafts[0]) {
      setDraft(cloneDraft(state.drafts[0]));
      setIsEditing(false);
    } else {
      const freshDraft = createGeneratedDraft();
      setDraft(freshDraft);
      setIsEditing(true);
    }
    setError(null);
  };

  const duplicateDraft = (source: TourDraft, discardConfirmed = false) => {
    if (!discardConfirmed && editorHasPendingChanges()) {
      setPendingAction({ kind: "duplicate", id: source.id });
      return;
    }
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
      setIsEditing(false);
    });
  };

  const requestDraftRemoval = (item: TourDraft) => {
    if (
      state.catalogPublications.some(
        (publication) => publication.sourceDraftId === item.id
      )
    ) {
      setError("Entferne die Tour zuerst aus dem öffentlichen Routenkatalog.");
      return;
    }
    setDeleteConfirmation({ kind: "draft", item });
  };

  const removeDraft = (item: TourDraft, confirmedThroughModal = false) => {
    if (!confirmedThroughModal) {
      requestDraftRemoval(item);
      return;
    }
    void mutate(async () => {
      assertCurrentAuthContext();
      if (podConnected && podRoot && solidFetch && webId) {
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
        if (
          remoteSnapshot.state.catalogPublications.some(
            (publication) => publication.sourceDraftId === item.id
          )
        ) {
          setState(remoteSnapshot.state);
          throw new Error(
            "Die Tour wurde zwischenzeitlich im öffentlichen Routenkatalog veröffentlicht. Entferne sie dort zuerst."
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
              ? "Der Entwurf konnte nicht sicher gelöscht werden. Der Pod-Zustand wurde fail-closed belassen; lade City Tours neu."
              : "Der Entwurf wurde nicht gelöscht und der vorherige Pod-Zustand wiederhergestellt."
          );
        }
        setState(committedSnapshot.state);
        if (draft.id === item.id) {
          const nextDraft = committedSnapshot.state.drafts[0];
          if (nextDraft) {
            setDraft(cloneDraft(nextDraft));
            setIsEditing(false);
          } else {
            const freshDraft = createGeneratedDraft();
            setDraft(freshDraft);
            setIsEditing(true);
          }
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
      if (draft.id === item.id) {
        const nextDraft = next.drafts[0];
        if (nextDraft) {
          setDraft(cloneDraft(nextDraft));
          setIsEditing(false);
        } else {
          const freshDraft = createGeneratedDraft();
          setDraft(freshDraft);
          setIsEditing(true);
        }
      }
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
      if (!podConnected || !podRoot || !solidFetch || !webId) {
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
          !podAccessActive.current
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
            ? "Löschen konnte nicht sicher zurückgerollt werden. Der Pod-Zustand wurde fail-closed belassen; lade City Tours neu."
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
            "Die private Aktivität wurde parallel verändert. Der Pod-Zustand wurde fail-closed ohne Aktivitätsverweis belassen; lade City Tours neu."
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
              "Das Ergebnis der privaten Löschung ist unklar. Der Pod-Zustand wurde fail-closed ohne Aktivitätsverweis belassen; lade City Tours neu."
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
            "Die private Aktivität wurde parallel verändert. Der Pod-Zustand wurde fail-closed ohne Aktivitätsverweis belassen; lade City Tours neu."
          );
        }
        await compensate(
          deleteError
            ? [deleteError]
            : [new Error("Das Löschen der privaten Aktivität wurde nicht bestätigt.")]
        );
      }

      if (operationRevision !== authRevision.current || !podAccessActive.current) {
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
      if (bridge?.login) {
        await bridge.login(issuer);
        window.clearTimeout(redirectWatchdog);
        setBusy(false);
        return;
      }
      await getSession().login({
        oidcIssuer: issuer,
        redirectUrl: `${window.location.origin}/city-tours/`,
        clientName: "City Tours",
      });
    } catch (reason) {
      window.clearTimeout(redirectWatchdog);
      setFailure(reason);
      setBusy(false);
    }
  };

  const logout = async (discardConfirmed = false) => {
    if (!discardConfirmed && editorHasPendingChanges()) { setPendingAction({ kind: "logout" }); return; }
    setBusy(true);
    setError(null);
    try {
      if (bridge?.logout) await bridge.logout();
      else await getSession().logout({ logoutType: "app" });
      setIsAuthenticated(false);
      setAuthenticatedWebId(null);
      activateLocalMode(null);
      window.location.assign(`${window.location.origin}/city-tours/`);
    } catch (reason) {
      setFailure(reason);
      setBusy(false);
    }
  };

  const hasPendingChanges = editorHasPendingChanges();
  useEffect(() => {
    if (!hasPendingChanges) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    // Register only while dirty; browsers control the native warning text.
    // https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event
    window.addEventListener("beforeunload", warn);
    const followLink = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element).closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download") || anchor.href === window.location.href) return;
      event.preventDefault(); event.stopPropagation();
      setPendingAction({ kind: "leave", href: anchor.href });
    };
    document.addEventListener("click", followLink, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", followLink, true); };
  }, [hasPendingChanges]);
  useEffect(() => {
    if (!continuedAction || busy) return;
    setContinuedAction(null);
    const intent = continuedAction;
    if (intent.kind === "import") importFile(intent.file, true);
    else if (intent.kind === "adopt") adoptRouteFromCatalog(intent.route, true);
    else if (intent.kind === "new") beginNewDraft(true);
    else if (intent.kind === "logout") { void logout(true); }
    else if (intent.kind === "public-setup") { cancelDraftEditing(); setPublicSetupRequired(true); }
    else if (intent.kind === "leave") { window.location.assign(intent.href); }
    else {
      const selected = state.drafts.find((item) => item.id === intent.id);
      if (selected) {
        if (intent.kind === "select") selectDraft(selected, true);
        else duplicateDraft(selected, true);
      }
    }
  }, [continuedAction, busy]);

  if (loading) {
    return (
      <div
        lang={language} translate="no"
        className={`city-tours-app city-tours-app--loading ${
          embedded ? "city-tours-app--embedded" : "city-tours-app--standalone"
        }`}
      >
        <main
          className="tours-loading"
          aria-busy="true"
        >
          <span className="tours-loading-mark" aria-hidden="true">
            <FontAwesomeIcon icon="route" />
          </span>
          <h1>City Tours</h1>
          <p role="status" aria-live="polite">{t("loading")}</p>
          <span
            className="tours-loading-rail"
            role="progressbar"
            aria-label={t("loading")}
          >
            <span />
          </span>
        </main>
      </div>
    );
  }

  if (!embedded && !isAuthenticated) {
    return (
      <div className="city-tours-app city-tours-app--login" data-standalone-shell lang={language} translate="no">
        <StandaloneLogin
          defaultIssuer={DEFAULT_ISSUER}
          busy={busy}
          error={error}
          language={language}
          onLanguageChange={changeStandaloneLanguage}
          onLogin={login}
        />
        <StandaloneFooter title="City Tours" version={appVersion} language={language} assetsBase={"/city-tours"} />
      </div>
    );
  }

  if ((onboardingRequired || publicSetupRequired) && isAuthenticated && podRoot) {
    return (
      <div
        className={`city-tours-app city-tours-app--onboarding ${
          embedded ? "city-tours-app--embedded" : "city-tours-app--standalone"
        }`}
        lang={language} translate="no"
      >
        <CityToursOnboarding
          key={publicSetupRequired ? "publishing" : "private"}
          mode={publicSetupRequired ? "publishing" : "private"}
          onCancel={publicSetupRequired ? () => { setPublicSetupRequired(false); setError(null); } : undefined}
          context={embedded ? "embedded" : "standalone"}
          language={language}
          podRoot={podRoot}
          registryOptions={onboardingRegistryOptions}
          configuredPublicRegistries={onboardingPublicRegistries}
          infrastructureReady={onboardingInfrastructureReady}
          profileReady={onboardingProfileReady}
          profilePublisher={onboardingProfileMetadata.publisher}
          profileContactEmail={onboardingProfileMetadata.contactEmail}
          busy={busy}
          onComplete={completeAppOnboarding}
          onLogout={embedded ? undefined : logout}
        />
        {error && (
          <div className="map-error-overlay tours-onboarding-error" role="alert">
            {localizeUserFacingMessage(error, language)}
          </div>
        )}
      </div>
    );
  }

  const mapRoutes = state.drafts.filter((item) => item.id !== draft.id);
  const visibleDrafts = state.drafts.filter((item) => item.name.toLocaleLowerCase(language).includes(tourQuery.trim().toLocaleLowerCase(language)))
    .sort((a, b) => tourSort === "name" ? a.name.localeCompare(b.name, language) : b.updatedAt.localeCompare(a.updatedAt));
  const catalogPreview =
    availableCatalogRoutes.find((route) => catalogRouteKey(route) === catalogPreviewId) || null;
  const uncatalogedDrafts = state.drafts.filter(
    (item) =>
      isDraftEligibleForCatalogPublication(item) &&
      !state.catalogPublications.some(
        (publication) => publication.sourceDraftId === item.id
      )
  );
  const activeDraftPublication = state.catalogPublications.find(
    (publication) => publication.sourceDraftId === draft.id
  );
  const editablePointCount = draft.geometry.reduce((count, line) => count + line.length, 0);
  const visibleError = localizeUserFacingMessage(error, language);

  return (
    <div
      lang={language} translate="no"
      className={`city-tours-app ${
        embedded ? "city-tours-app--embedded" : "city-tours-app--standalone"
      }${completeConfirmation || deleteConfirmation || catalogConfirmation || completionInProgress || pendingAction || donationConfirmation ? " city-tours-app--modal-open" : ""}`}
    >
      {!embedded && (
        <header className="app-header" data-standalone-header>
          <div className="app-brand" data-standalone-brand>
            <span className="app-brand-mark" data-standalone-icon aria-hidden="true">
              <FontAwesomeIcon icon="route" />
            </span>
            <strong>City Tours</strong>
          </div>
          <div className="header-actions" data-standalone-actions>
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
            <button className="header-logout" disabled={busy} onClick={() => { void logout(); }}>
              <FontAwesomeIcon icon="right-from-bracket" />
              {t("logout")}
            </button>
          </div>
        </header>
      )}

      <main className="tours-shell">

        <section className={`route-workspace${activeSection === "activities" ? " route-workspace--activities" : ""}${mobileMapOpen ? " is-map-open" : ""}`} aria-label={t("workspace")}>
          <nav className="workspace-nav" aria-label={t("workspace")}>
            {(["tours", "discover", "activities", "sharing"] as const).map((section) => <button key={section} type="button"
              aria-current={activeSection === section ? "page" : undefined}
              onClick={() => { setActiveSection(section); setMobileMapOpen(false); if (section !== "discover") setCatalogPreviewId(null); }}>
              {t(section === "tours" ? "myTours" : section === "discover" ? "discover" : section === "activities" ? "activities" : "sharing")}
            </button>)}
          </nav>
          <button className="mobile-view-toggle ghost" type="button" onClick={() => { setMobileMapOpen((value) => !value); if (!mobileMapOpen) setFitRequest((value) => value + 1); }}>{t(mobileMapOpen ? "showList" : "showMap")}</button>
          <aside className="planner-panel">
            <div className="planner-scroll">
              {visibleError && <div className="workspace-error" role="alert"><span>{visibleError}</span><button type="button" className="ghost" aria-label={t("closeError")} onClick={() => setError(null)}>×</button></div>}
              <div hidden={activeSection !== "tours"}>
              <section className="panel-section panel-section--planner">
                <div className="section-heading">
                  <h1>{t("tourPlanner")}</h1>
                  <button
                    className="icon-button"
                    title={t("newTour")}
                    aria-label={t("newTour")}
                    disabled={busy}
                    onClick={() => beginNewDraft()}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </button>
                </div>

                <div className="form-grid">
                  <label>
                    {t("tourName")}
                    <input
                      value={draft.name}
                      disabled={busy || !isEditing}
                      title={!isEditing ? t("editRoute") : undefined}
                      onChange={(event) => updateDraft("name", event.target.value)}
                    />
                  </label>
                </div>

                <div className="mode-row" aria-label={t("routeMode")}>
                  {isEditing && <button className={isDrawing && isEditing ? "active" : "ghost"} type="button" disabled={busy || !isEditing}
                    aria-pressed={isDrawing && isEditing} onClick={() => setIsDrawing((value) => !value)}>{t(isDrawing ? "finishDrawing" : "drawFreely")}</button>}
                  <button className="file-button" type="button" disabled={busy} onClick={() => fileInput.current?.click()}>{t("importRoute")}</button>
                  <input ref={fileInput} type="file" hidden accept=".gpx,.geojson,.json" onChange={(event) => { importFile(event.target.files?.[0]); event.target.value = ""; }} />
                </div>
                <p className="help-text">{t(isEditing ? "drawingHint" : "routePrivacyHint")}</p>
                <p className="save-status" role="status">{busy ? t("saving") : hasPendingChanges ? t("unsavedChanges") : state.drafts.some((item) => item.id === draft.id) ? t("savedPrivately") : t("startRoute")}</p>

                {isEditing ? (
                  <>
                    {activeDraftPublication && (
                      <p className="public-route-edit-hint">{t("publicRouteEditHint")}</p>
                    )}
                    <div className="editor-actions">
                      <button
                        className="secondary save-draft-button"
                        disabled={busy}
                        onClick={handleSave}
                      >
                        {state.drafts.some((item) => item.id === draft.id)
                          ? t("saveChanges")
                          : t("saveDraft")}
                      </button>
                      <button
                        className="ghost cancel-edit-button"
                        disabled={busy}
                        onClick={cancelDraftEditing}
                      >
                        {t("cancelEditing")}
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    className="secondary edit-draft-button"
                    disabled={
                      busy ||
                      activeDraftPublication?.phase === "publishing" ||
                      activeDraftPublication?.phase === "removing" ||
                      (activeDraftPublication?.phase === "updating" &&
                        !catalogPhaseLeaseExpired(activeDraftPublication))
                    }
                    onClick={beginDraftEditing}
                  >
                    {t("editRoute")}
                  </button>
                )}
                <div className="tour-completion">
                  <button className="primary" disabled={busy || !state.drafts.some((item) => item.id === draft.id) || hasPendingChanges || !isValidGeometry(draft.geometry)} onClick={confirmCompletion}>{t("tourDone")}</button>
                </div>
              </section>

              <section className="panel-section list-card">
                <div className="section-heading">
                  <h2>{t("myTours")}</h2>
                  <strong className="count-badge">{state.drafts.length}</strong>
                </div>
                {state.drafts.length > 0 && <div className="library-filters">
                  <label>{t("searchTours")}<input type="search" value={tourQuery} onChange={(event) => setTourQuery(event.target.value)} /></label>
                  <label>{t("sortTours")}<select value={tourSort} onChange={(event) => setTourSort(event.target.value)}><option value="recent">{t("recentFirst")}</option><option value="name">{t("nameOrder")}</option></select></label>
                </div>}
                <div className="item-list">
                  {state.drafts.length > 0 && visibleDrafts.length === 0 && <p className="empty">{t("noMatchingTours")}</p>}
                  {state.drafts.length === 0 && <p className="empty">{t("noSavedTours")}</p>}
                  {visibleDrafts.map((item) => {
                    const publication = state.catalogPublications.find(
                      (candidate) => candidate.sourceDraftId === item.id
                    );
                    return (
                      <article className={`draft-item ${item.id === draft.id ? "draft-item--active" : ""}`} key={item.id}>
                        <button
                          className="list-item"
                          disabled={busy}
                          aria-current={item.id === draft.id ? "true" : undefined}
                          aria-label={t("selectRoute", { name: item.name })}
                          onClick={() => selectDraft(item)}
                        >
                          <span>{item.name}</span>
                          <small>
                            {distanceLabel(item.geometry, language)}
                            {publication
                              ? ` · ${t(
                                  publication.sourceDraftUpdatedAt === item.updatedAt
                                    ? "cataloged"
                                    : "catalogOutdated"
                                )}`
                              : ` · ${t(item.adoptedFromCatalog ? "privateCopy" : "privateRoute")}`}
                          </small>
                        </button>
                        <div className="draft-actions draft-actions--catalog">
                          <button className="ghost" disabled={busy} onClick={() => duplicateDraft(item)}>{t("duplicate")}</button>
                          {podConnected && (
                            publication ? (
                              <button className="catalog-remove" disabled={busy} onClick={() => requestCatalogRemoval(item)}>{t("removeFromCatalog")}</button>
                            ) : isDraftEligibleForCatalogPublication(item) ? (
                              <button className="catalog-index" disabled={busy} onClick={() => requestCatalogIndex([item])}>{t("indexRoute")}</button>
                            ) : null
                          )}
                          <button className="delete-link" disabled={busy} onClick={() => requestDraftRemoval(item)}>{t("delete")}</button>
                        </div>
                      </article>
                    );
                  })}
                </div>
                {podConnected && uncatalogedDrafts.length > 1 && (
                  <button
                    className="catalog-bulk-button"
                    disabled={busy}
                    onClick={() => requestCatalogIndex(uncatalogedDrafts)}
                  >
                    {t("indexUncatalogedTours")}
                  </button>
                )}

              </section>

              </div>
              <div hidden={activeSection !== "discover"}>
                {podConnected && !onboardingPublicRegistries.length && <section className="panel-section"><p>{language === "de" ? "Der gemeinsame Katalog benötigt eine eingerichtete öffentliche Registry. Deinen privaten Tourbereich kannst du bereits nutzen." : "The shared catalog needs a configured public registry. Your private tour space is already available."}</p><button className="primary" disabled={busy} onClick={() => requestPublicSetup()}>{t("publicSetup")}</button></section>}
                {podConnected ? <RouteCatalog routes={availableCatalogRoutes} discoveredCount={catalogedRoutes.length}
                  loading={catalogLoading} error={catalogError ? localizeUserFacingMessage(catalogError, language) : null} report={catalogReport}
                  previewId={catalogPreviewId} busy={busy} language={language}
                  onPreview={(id) => { setCatalogPreviewId(id); if (id) setMobileMapOpen(true); }}
                  onAdopt={adoptRouteFromCatalog} onRetry={() => { void refreshCatalogedRoutes(); }} />
                  : <section className="panel-section"><h2>{t("discover")}</h2><p>{t("connectForCatalog")}</p></section>}
              </div>
              <div hidden={activeSection !== "activities"}>
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
                    <ActivityCard key={activity.id} activity={activity} language={language}
                      busy={busy} onDelete={() => requestActivityRemoval(activity)} />
                  ))}
                </div>
              </section>
              </div>
              <div hidden={activeSection !== "sharing"}>
                <section className="panel-section sharing-panel">
                  <h2>{t("sharing")}</h2>
                  {podConnected && !publicSharingReady && <button className="primary" disabled={busy} onClick={() => requestPublicSetup()}>{t("publicSetup")}</button>}
                  <p>{t("sharingIntro")}</p>
                  <h3>{t("publicRouteCatalog")}</h3>
                  {state.catalogPublications.length === 0 && <p className="empty">{t("noPublicRoutes")}</p>}
                  {state.catalogPublications.map((publication) => {
                    const item = state.drafts.find((entry) => entry.id === publication.sourceDraftId);
                    return item ? <article className="sharing-route" key={publication.routeTemplateId}><strong>{item.name}</strong>
                      <p>{t(publication.phase === "published" ? "publicRoute" : publication.phase === "publishing" ? "publishingRoute" : publication.phase === "updating" ? "updatingRoute" : "removingRoute")}</p>
                      <button className="ghost" disabled={busy} onClick={() => requestCatalogRemoval(item)}>{t("removeFromCatalog")}</button></article> : null;
                  })}
                  <h3>{t("donation")}</h3>
                  <p>{t("donationExplanation")}</p>
                  {state.activeRun && <div className="donation-status" role="status">
                    <strong>{t(state.activeRun.phase === "published" ? "donationPrepared" : state.activeRun.phase === "resetting" ? "donationResetting" : "donationPublishing")}</strong>
                    <p>{t("donationIncluded", { included: state.activeRun.activityIds.length, additional: state.activities.filter((activity) => !state.activeRun!.activityIds.includes(activity.id)).length })}</p>
                    <p>{t(state.activeRun.donationMode === "continuous" ? "donationContinuous" : "donationLegacy")}</p>
                    {donationSyncStatus === "syncing" && <p role="status">{t("donationSyncing")}</p>}
                    {donationSyncStatus === "error" && <div role="alert"><p>{t("donationSyncFailed")}</p><button type="button" className="ghost" disabled={busy} onClick={() => setDonationRetry(value => value + 1)}>{t("donationRetry")}</button></div>}
                    <p>{t("donationNextStep")}</p>
                    <a href="/notifications">{t("manageRequests")}</a>
                  </div>}
                  {podConnected && state.activities.length > 0 ? <div className="health-donation-actions">
                    {state.activeRun ? <button className="danger" disabled={busy} onClick={() => setDonationConfirmation("reset")}>{t("resetDonation")}</button>
                      : <button className="publish" disabled={busy} onClick={() => requestDonation()}>{t("shareDonation")}</button>}
                  </div> : <p className="empty">{t(podConnected ? "noDonationActivities" : "connectForCatalog")}</p>}
                </section>
              </div>
            </div>
          </aside>

          <section className="map-stage" aria-label={t("tourMap")}>
            <TourMap
              geometry={draft.geometry}
              routeId={draft.id}
              fitRequest={fitRequest}
              savedRoutes={mapRoutes}
              catalogPreview={catalogPreview}
              editable={isEditing && isDrawing && !busy && !catalogPreview && activeSection === "tours"}
              onPoint={addPoint}
              onSelectRoute={selectDraftById}
              language={language}
            />

            <aside className="map-stats" aria-label={t("routeInformation")}>
              <div><span>{t("distance")}</span><strong>{distanceLabel(catalogPreview?.geometry || draft.geometry, language)}</strong></div>
            </aside>
            {isEditing && activeSection === "tours" && (editablePointCount > 0 || geometryHistory.length > 0) && (
              <div className="map-edit-toolbar" role="toolbar" aria-label={t("editRoute")}>
                <button className="map-tool-button" disabled={busy || !geometryHistory.length} onClick={undoPoint} title={t("undoLastPoint")}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9 7 4 12l5 5M5 12h8a6 6 0 0 1 6 6" />
                  </svg>
                  <span>{t("undoPoint")}</span>
                </button>
                <button className="map-tool-button map-tool-button--danger" disabled={busy || !editablePointCount} onClick={clearRoute} title={t("clearEntireRoute")}>
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
              <span><i className="legend-line legend-line--catalog" />{t("catalogPreview")}</span>
            </aside>
          </section>
        </section>

      {catalogConfirmation && (
        <Modal labelledBy="catalog-confirmation-title" describedBy="catalog-confirmation-copy" className={`confirm-dialog ${catalogConfirmation.kind === "remove" ? "confirm-dialog--danger" : "confirm-dialog--catalog"}`} busy={busy} onClose={() => setCatalogConfirmation(null)}>
            <span className="eyebrow">{t("publicRouteCatalog")}</span>
            <h2 id="catalog-confirmation-title">
              {catalogConfirmation.kind === "index"
                ? t("indexRoutesTitle")
                : t("removeCatalogRouteTitle")}
            </h2>
            <p id="catalog-confirmation-copy">
              {catalogConfirmation.kind === "index"
                ? t("indexRoutesQuestion", { count: catalogConfirmation.drafts.length })
                : t("removeCatalogRouteQuestion", { name: catalogConfirmation.draft.name })}
            </p>
            {catalogConfirmation.kind === "index" && (
              <ul className="catalog-confirmation-list">
                {catalogConfirmation.drafts.map((item) => (
                  <li key={item.id}>{item.name}</li>
                ))}
              </ul>
            )}
            <div className="dialog-actions">
              <button className="ghost" disabled={busy} onClick={() => setCatalogConfirmation(null)}>
                {t("cancel")}
              </button>
              <button
                className={catalogConfirmation.kind === "remove" ? "danger" : "primary"}
                disabled={busy}
                onClick={confirmCatalogAction}
              >
                {catalogConfirmation.kind === "index" ? t("publishPublicly") : t("removeFromCatalog")}
              </button>
            </div>
        </Modal>
      )}

      {deleteConfirmation && (
        <Modal labelledBy="delete-confirmation-title" describedBy="delete-confirmation-copy" className={"confirm-dialog--danger"} busy={busy} onClose={() => setDeleteConfirmation(null)} testId="delete-confirmation-dialog">
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
        </Modal>
      )}

      {completeConfirmation && (
        <Modal labelledBy="complete-title" className={""} busy={busy} onClose={() => setCompleteConfirmation(null)}>
            <span className="eyebrow">{t("confirmCompletion")}</span>
            <h2 id="complete-title">{t("saveCompletedQuestion")}</h2>
            <dl>
              <div><dt>{t("route")}</dt><dd>{draft.name}</dd></div>

            </dl>
            <div className="completion-date-field">
                  <label>
                    {t("completedOn")}
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      placeholder={datePlaceholder(language)}
                      value={completedDateInput}
                      aria-invalid={completedDateError ? "true" : undefined}
                      aria-describedby={completedDateError ? "completion-date-error" : undefined}
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

                        } catch (reason) {
                          const message =
                            reason instanceof Error ? reason.message : "Bitte gib ein gültiges Datum ein.";
                          setCompletedDateError(message);

                        }
                      }}
                    />
                  </label>

              {completedDateError && <p id="completion-date-error" role="alert">{localizeUserFacingMessage(completedDateError, language)}</p>}
              <div className="date-shortcuts">{[0, 1].map((days) => <button type="button" className="ghost" key={days} onClick={() => { const date = new Date(); date.setDate(date.getDate() - days); setCompletedDateInput(formatDate(localDate(date), language)); setCompletedDateError(null); }}>{t(days ? "yesterday" : "today")}</button>)}</div>
            </div>
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
            <p className="help-text">{t("activityEstimatesExplanation")}</p>
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
                  let completionDate: string;
                  try { completionDate = parseDate(completedDateInput, language); }
                  catch (reason) { setCompletedDateError(reason instanceof Error ? reason.message : "Bitte gib ein gültiges Datum ein."); return; }
                  setCompleteConfirmation(null);
                  void handleComplete(activityType, completionDate);
                }}
              >{t("save")}</button>
            </div>
        </Modal>
      )}
      {pendingAction && <Modal labelledBy="pending-title" busy={busy} onClose={() => setPendingAction(null)}>
        <h2 id="pending-title">{t("unsavedChanges")}</h2><p>{t("pendingChangesQuestion")}</p>
        {activeDraftPublication && <p>{t("publicRouteEditHint")}</p>}
        {visibleError && <p role="alert">{visibleError}</p>}
        <div className="dialog-actions">
          <button className="ghost" disabled={busy} onClick={() => setPendingAction(null)}>{t("cancel")}</button>
          <button className="danger" disabled={busy} onClick={() => { if (pendingAction.kind === "leave" || pendingAction.kind === "logout") setIsEditing(false); setContinuedAction(pendingAction); setPendingAction(null); }}>{t("discardContinue")}</button>
          <button className="primary" disabled={busy || !draft.name.trim() || !isValidGeometry(draft.geometry)} onClick={() => { const action = pendingAction; void mutate(async () => { await persistDraft(draft); setIsEditing(false); setPendingAction(null); setContinuedAction(action); }); }}>{t("saveContinue")}</button>
        </div>
      </Modal>}
      {donationConfirmation && <Modal labelledBy="donation-title" busy={busy} onClose={() => setDonationConfirmation(null)}>
        <h2 id="donation-title">{t(donationConfirmation === "publish" ? "shareDonation" : "resetDonation")}</h2>
        <p>{t(donationConfirmation === "publish" ? "donationConsent" : "donationRevokeExplanation")}</p>
        {donationConfirmation === "publish" && <><p>{t("donationSnapshot", { count: state.activities.length })}</p><ul className="catalog-confirmation-list">{state.activities.map((activity) => <li key={activity.id}>{formatDate(activity.completedDate, language)} · {activity.name}</li>)}</ul></>}
        <div className="dialog-actions"><button className="ghost" onClick={() => setDonationConfirmation(null)}>{t("cancel")}</button><button className={donationConfirmation === "publish" ? "primary" : "danger"} data-testid="donation-confirmation-submit" onClick={() => { const action = donationConfirmation; setDonationConfirmation(null); if (action === "publish") void publish(); else void resetScenario(); }}>{t(donationConfirmation === "publish" ? "prepareDonation" : "revokeDonation")}</button></div>
      </Modal>}
      {completionInProgress && (
        <CompletionLoadingOverlay
          activityType={completionInProgress}
          label={t("savingCompletedTour")}
        />
      )}
      </main>
      {!embedded && (
        <StandaloneFooter className="app-footer" title="City Tours" version={appVersion} language={language} assetsBase={"/city-tours"} />
      )}
    </div>
  );
}
