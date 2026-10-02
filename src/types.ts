export type Coordinate = [longitude: number, latitude: number];
export type MultiLineCoordinates = Coordinate[][];

export type ActivityType = "walking" | "cycling";
export type RouteSource = "drawn" | "gpx" | "geojson";
// `osrm` remains part of persisted completed-activity provenance so historical
// records are not relabelled. New routes and activities never create this value.
export type DurationSource = "osrm" | "gpx" | "default-speed";

export type WalkingSummary = {
  distanceMeters: number;
  activeMinutes: number;
  durationSource: DurationSource;
  derivationModel: "solid-tours-demo-v1";
  averagePaceMinutesPerKm: number;
  estimatedSteps: number;
};

export type CyclingSummary = {
  distanceMeters: number;
  activeMinutes: number;
  durationSource: DurationSource;
  derivationModel: "solid-tours-demo-v1";
  averageSpeedKmh: number;
};

export type ActivitySummary = WalkingSummary | CyclingSummary;

/**
 * Stable provenance for a route copied from the public route catalog.
 *
 * The private draft keeps its own UUID and remains fully editable. These
 * public identifiers are retained only so the same catalog entry is not
 * offered for adoption again, including after the app is reloaded.
 */
export type AdoptedCatalogRouteReference = {
  routeTemplateId: string;
  datasetUrl: string;
  distributionUrl: string;
};

export type TourDraft = {
  id: string;
  name: string;
  routeSource: RouteSource;
  geometry: MultiLineCoordinates;
  durationMinutes?: number;
  durationSource?: DurationSource;
  adoptedFromCatalog?: AdoptedCatalogRouteReference;
  createdAt: string;
  updatedAt: string;
};

export type CompletedActivity = {
  id: string;
  draftId: string;
  name: string;
  activityType: ActivityType;
  geometry: MultiLineCoordinates;
  completedDate: string;
  completedAt: string;
  activitySummary: ActivitySummary;
};

export type ActiveRun = {
  donationMode?: "continuous";
  lastSyncedAt?: string;
  phase: "publishing" | "published" | "resetting";
  scenarioRunId: string;
  activityIds: string[];
  resourceUrl: string;
  manifestUrl: string;
  runContainerUrl: string;
  datasetIdentifier: string;
  catalogDatasetUrl: string;
  publishedAt: string;
};

export type RouteCatalogPublication = {
  phase: "publishing" | "published" | "updating" | "removing";
  phaseChangedAt: string;
  routeTemplateId: string;
  sourceDraftId: string;
  sourceDraftUpdatedAt: string;
  resourceUrl: string;
  datasetIdentifier: string;
  catalogDatasetUrl: string;
  publishedAt: string;
  pendingUpdate?: {
    operationId: string;
    leaseId: string;
    draft: TourDraft;
  };
};

export type ToursState = {
  schemaVersion: 1;
  drafts: TourDraft[];
  activities: CompletedActivity[];
  catalogPublications: RouteCatalogPublication[];
  activeRun: ActiveRun | null;
};

export type PublishedFeature = {
  type: "Feature";
  geometry: {
    type: "MultiLineString";
    coordinates: MultiLineCoordinates;
  };
  properties: {
    schemaVersion: "2.0";
    source: "solid-tours";
    scenarioRunId: string;
    activityType: ActivityType;
    completedDate: string;
    activitySummary: ActivitySummary;
  };
};

export type PublishedActivityFeature = {
  type: "Feature";
  geometry: {
    type: "MultiLineString";
    coordinates: MultiLineCoordinates;
  };
  properties: {
    activityType: ActivityType;
    completedDate: string;
    activitySummary: ActivitySummary;
  };
};

export type PublishedActivityCollection = {
  type: "FeatureCollection";
  properties: {
    schemaVersion: "3.0";
    source: "solid-tours";
    scenarioRunId: string;
    donationScope: "all-completed-activities";
    donationMode?: "continuous";
    activityCount: number;
  };
  features: PublishedActivityFeature[];
};

export type PublishedSnapshot = PublishedFeature | PublishedActivityCollection;
