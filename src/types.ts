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

export type TourDraft = {
  id: string;
  name: string;
  routeSource: RouteSource;
  geometry: MultiLineCoordinates;
  durationMinutes?: number;
  durationSource?: DurationSource;
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

export type ToursState = {
  schemaVersion: 1;
  drafts: TourDraft[];
  activities: CompletedActivity[];
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
    activityCount: number;
  };
  features: PublishedActivityFeature[];
};

export type PublishedSnapshot = PublishedFeature | PublishedActivityCollection;
