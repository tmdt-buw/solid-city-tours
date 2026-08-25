import type {
  ActivitySummary,
  ActivityType,
  CompletedActivity,
  Coordinate,
  DurationSource,
  MultiLineCoordinates,
  PublishedActivityCollection,
  PublishedFeature,
  TourDraft,
} from "./types";

const EARTH_RADIUS_METERS = 6_371_008.8;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isUuidV4 = (value: unknown): value is string =>
  typeof value === "string" && UUID_PATTERN.test(value);
export const DERIVATION_MODEL = "solid-tours-demo-v1" as const;
export const WALKING_STEP_LENGTH_METERS = 0.75;
export const DEFAULT_SPEED_KMH = { walking: 4.5, cycling: 15 } as const;
export const MAX_PUBLISHED_ACTIVITIES = 100;
export const MAX_PUBLISHED_POINTS = 20_000;
export const MAX_PUBLISHED_BYTES = 2 * 1024 * 1024;

export const createId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16);
    return (token === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
};

const radians = (degrees: number) => (degrees * Math.PI) / 180;

export function pointDistanceMeters(a: Coordinate, b: Coordinate): number {
  const lat1 = radians(a[1]);
  const lat2 = radians(b[1]);
  const deltaLat = lat2 - lat1;
  const deltaLon = radians(b[0] - a[0]);
  const sinLat = Math.sin(deltaLat / 2);
  const sinLon = Math.sin(deltaLon / 2);
  const haversine =
    sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

export function routeDistanceMeters(geometry: MultiLineCoordinates): number {
  return Math.round(
    geometry.reduce(
      (total, line) =>
        total +
        line
          .slice(1)
          .reduce(
            (lineTotal, point, index) => lineTotal + pointDistanceMeters(line[index], point),
            0
          ),
      0
    )
  );
}

export function isValidGeometry(geometry: MultiLineCoordinates): boolean {
  return (
    Array.isArray(geometry) &&
    geometry.length > 0 &&
    geometry.every(
      (line) =>
        Array.isArray(line) &&
        line.length >= 2 &&
        line.every(
          ([longitude, latitude]) =>
            Number.isFinite(longitude) &&
            Number.isFinite(latitude) &&
            longitude >= -180 &&
            longitude <= 180 &&
            latitude >= -90 &&
            latitude <= 90
        )
    )
  );
}

const oneDecimal = (value: number) => Math.round(value * 10) / 10;
const roundTo = (value: number, step: number) => Math.round(value / step) * step;

export function defaultDurationMinutes(
  activityType: ActivityType,
  geometry: MultiLineCoordinates
): number {
  const distanceKilometers = routeDistanceMeters(geometry) / 1000;
  return (distanceKilometers / DEFAULT_SPEED_KMH[activityType]) * 60;
}

export function deriveActivitySummary(
  draft: Pick<TourDraft, "geometry" | "durationMinutes" | "durationSource"> & {
    activityType: ActivityType;
  }
): ActivitySummary {
  if (!isValidGeometry(draft.geometry)) {
    throw new Error("Die Tour benötigt mindestens zwei gültige Punkte.");
  }

  const rawDistanceMeters = routeDistanceMeters(draft.geometry);
  if (rawDistanceMeters <= 0) throw new Error("Die Tourdistanz muss größer als null sein.");
  const distanceMeters = Math.max(100, roundTo(rawDistanceMeters, 100));

  const suppliedDuration =
    draft.durationMinutes && Number.isFinite(draft.durationMinutes) && draft.durationMinutes > 0
      ? draft.durationMinutes
      : undefined;
  const rawMinutes = suppliedDuration ?? defaultDurationMinutes(draft.activityType, draft.geometry);
  const durationSource: DurationSource = suppliedDuration
    ? draft.durationSource || "default-speed"
    : "default-speed";
  const activeMinutes = Math.max(5, roundTo(rawMinutes, 5));
  const base = {
    distanceMeters,
    activeMinutes,
    durationSource,
    derivationModel: DERIVATION_MODEL,
  };

  if (draft.activityType === "walking") {
    return {
      ...base,
      averagePaceMinutesPerKm: oneDecimal(activeMinutes / (rawDistanceMeters / 1000)),
      estimatedSteps: Math.max(100, roundTo(rawDistanceMeters / WALKING_STEP_LENGTH_METERS, 100)),
    };
  }

  return {
    ...base,
    averageSpeedKmh: oneDecimal((rawDistanceMeters / 1000) / (activeMinutes / 60)),
  };
}

export function isValidCompletedDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

export function previewActivityCompletion(
  draft: Pick<TourDraft, "geometry" | "durationMinutes" | "durationSource">,
  completedDate: string,
  activityType: ActivityType
): ActivitySummary {
  if (!isValidCompletedDate(completedDate)) {
    throw new Error("Wähle ein gültiges Abschlussdatum.");
  }
  return deriveActivitySummary({ ...draft, activityType });
}

export function completeTour(
  draft: TourDraft,
  completedDate: string,
  activityType: ActivityType
): CompletedActivity {
  if (!isValidCompletedDate(completedDate)) {
    throw new Error("Wähle ein gültiges Abschlussdatum.");
  }
  return {
    id: createId(),
    draftId: draft.id,
    name: draft.name,
    activityType,
    geometry: draft.geometry.map((line) => line.map(([longitude, latitude]) => [longitude, latitude])),
    completedDate,
    completedAt: new Date().toISOString(),
    activitySummary: deriveActivitySummary({ ...draft, activityType }),
  };
}

export function publishedFeature(
  activity: CompletedActivity,
  scenarioRunId: string
): PublishedFeature {
  if (!isUuidV4(scenarioRunId)) {
    throw new Error("Die scenarioRunId ist für die Veröffentlichung ungültig.");
  }
  if (activity.activityType !== "walking" && activity.activityType !== "cycling") {
    throw new Error("Die Aktivitätsart ist für die Veröffentlichung ungültig.");
  }
  if (!isValidCompletedDate(activity.completedDate)) {
    throw new Error("Das Abschlussdatum ist für die Veröffentlichung ungültig.");
  }
  const source = activity.activitySummary?.durationSource;
  if (source !== "osrm" && source !== "gpx" && source !== "default-speed") {
    throw new Error("Die Dauerquelle ist für die Veröffentlichung ungültig.");
  }
  const storedMinutes = activity.activitySummary?.activeMinutes;
  if (
    !Number.isInteger(storedMinutes) ||
    storedMinutes <= 0 ||
    storedMinutes > 10_080 ||
    storedMinutes % 5 !== 0
  ) {
    throw new Error("Die gespeicherte Aktivitätsdauer ist für die Veröffentlichung ungültig.");
  }
  const geometry = activity.geometry.map((line) =>
    line.map(([longitude, latitude]) => [longitude, latitude] as Coordinate)
  );
  const activitySummary = deriveActivitySummary({
    activityType: activity.activityType,
    geometry,
    durationMinutes: storedMinutes,
    durationSource: source,
  });
  return {
    type: "Feature",
    geometry: {
      type: "MultiLineString",
      coordinates: geometry,
    },
    properties: {
      schemaVersion: "2.0",
      source: "solid-tours",
      scenarioRunId,
      activityType: activity.activityType,
      completedDate: activity.completedDate,
      activitySummary,
    },
  };
}

export function publishedActivityCollection(
  activities: CompletedActivity[],
  scenarioRunId: string
): PublishedActivityCollection {
  if (!isUuidV4(scenarioRunId)) {
    throw new Error("Die scenarioRunId ist für die Veröffentlichung ungültig.");
  }
  if (activities.length === 0) {
    throw new Error("Für die Gesundheitsdatenspende ist mindestens eine gemachte Tour erforderlich.");
  }
  if (activities.length > MAX_PUBLISHED_ACTIVITIES) {
    throw new Error(
      `Für eine Gesundheitsdatenspende können höchstens ${MAX_PUBLISHED_ACTIVITIES} gemachte Touren veröffentlicht werden.`
    );
  }

  const features = activities.map((activity) => {
    const feature = publishedFeature(activity, scenarioRunId);
    return {
      type: "Feature" as const,
      geometry: feature.geometry,
      properties: {
        activityType: feature.properties.activityType,
        completedDate: feature.properties.completedDate,
        activitySummary: feature.properties.activitySummary,
      },
    };
  });

  const collection: PublishedActivityCollection = {
    type: "FeatureCollection",
    properties: {
      schemaVersion: "3.0",
      source: "solid-tours",
      scenarioRunId,
      donationScope: "all-completed-activities",
      activityCount: features.length,
    },
    features,
  };
  const pointCount = features.reduce(
    (total, feature) =>
      total + feature.geometry.coordinates.reduce((featureTotal, line) => featureTotal + line.length, 0),
    0
  );
  if (pointCount > MAX_PUBLISHED_POINTS) {
    throw new Error(
      `Die Gesundheitsdatenspende darf höchstens ${MAX_PUBLISHED_POINTS.toLocaleString("de-DE")} Routenpunkte enthalten.`
    );
  }
  if (new TextEncoder().encode(JSON.stringify(collection)).byteLength > MAX_PUBLISHED_BYTES) {
    throw new Error("Die Gesundheitsdatenspende darf höchstens 2 MiB groß sein.");
  }
  return collection;
}

export function draftFeature(draft: TourDraft) {
  return {
    type: "Feature" as const,
    geometry: { type: "MultiLineString" as const, coordinates: draft.geometry },
    properties: {
      schemaVersion: "1.0",
      source: "solid-tours",
      tourId: draft.id,
      name: draft.name,
      routeSource: draft.routeSource,
      durationMinutes: draft.durationMinutes,
      durationSource: draft.durationSource,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
    },
  };
}
