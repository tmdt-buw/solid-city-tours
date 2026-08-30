import {
  createId,
  isUuidV4,
  isValidGeometry,
  MAX_PUBLISHED_BYTES,
  MAX_PUBLISHED_POINTS,
  routeDistanceMeters,
} from "./domain";
import type {
  AdoptedCatalogRouteReference,
  MultiLineCoordinates,
  RouteCatalogPublication,
  TourDraft,
} from "./types";

export const ROUTE_TEMPLATE_SOURCE = "solid-tours-route-template" as const;
export const ROUTE_TEMPLATE_SCHEMA_VERSION = "1.0" as const;
export const ROUTE_TEMPLATE_IDENTIFIER_PREFIX = "solid-tours-route-template-";
export const ROUTE_TEMPLATE_THEME = "https://w3id.org/solid-tours/theme/route-template";

export type RouteTemplateSnapshot = {
  type: "Feature";
  geometry: {
    type: "MultiLineString";
    coordinates: MultiLineCoordinates;
  };
  properties: {
    schemaVersion: typeof ROUTE_TEMPLATE_SCHEMA_VERSION;
    source: typeof ROUTE_TEMPLATE_SOURCE;
    routeTemplateId: string;
    name: string;
  };
};

export type CatalogedRoute = {
  routeTemplateId: string;
  identifier: string;
  name: string;
  description: string;
  publisher: string;
  creatorWebId?: string;
  datasetUrl: string;
  distributionUrl: string;
  geometry: MultiLineCoordinates;
  distanceMeters: number;
};

const ownKeysOnly = (value: Record<string, unknown>, allowed: readonly string[]) =>
  Object.keys(value).every((key) => allowed.includes(key));

const cloneGeometry = (geometry: MultiLineCoordinates): MultiLineCoordinates =>
  geometry.map((line) => line.map(([longitude, latitude]) => [longitude, latitude]));

export const catalogRouteReference = (
  route: Pick<CatalogedRoute, "routeTemplateId" | "datasetUrl" | "distributionUrl">
): AdoptedCatalogRouteReference => ({
  routeTemplateId: route.routeTemplateId,
  datasetUrl: route.datasetUrl,
  distributionUrl: route.distributionUrl,
});

/**
 * Match a persisted adoption to a current catalog result without relying on
 * mutable display metadata such as title or publisher.
 */
export const isSameCatalogRouteReference = (
  reference: AdoptedCatalogRouteReference,
  route: Pick<CatalogedRoute, "routeTemplateId" | "datasetUrl" | "distributionUrl">
): boolean =>
  reference.routeTemplateId === route.routeTemplateId &&
  (reference.datasetUrl === route.datasetUrl ||
    reference.distributionUrl === route.distributionUrl);

type PublishedCatalogRouteReference = Pick<
  RouteCatalogPublication,
  "routeTemplateId" | "catalogDatasetUrl" | "resourceUrl"
>;

const isSamePublishedCatalogRoute = (
  publication: PublishedCatalogRouteReference,
  route: Pick<CatalogedRoute, "routeTemplateId" | "datasetUrl" | "distributionUrl">
): boolean =>
  isSameCatalogRouteReference(
    {
      routeTemplateId: publication.routeTemplateId,
      datasetUrl: publication.catalogDatasetUrl,
      distributionUrl: publication.resourceUrl,
    },
    route
  );

const sameWebId = (left: string | null | undefined, right: string | null | undefined) => {
  if (!left || !right) return false;
  try {
    return new URL(left).href === new URL(right).href;
  } catch {
    return false;
  }
};

const resourceIsWithinContainer = (
  resourceUrl: string,
  containerUrl: string
): boolean => {
  try {
    const resource = new URL(resourceUrl);
    const container = new URL(containerUrl);
    return (
      resource.origin === container.origin &&
      resource.pathname.startsWith(container.pathname)
    );
  } catch {
    return false;
  }
};

const routeBelongsToPod = (
  route: Pick<CatalogedRoute, "datasetUrl" | "distributionUrl">,
  podRoot: string | null | undefined
): boolean => {
  if (!podRoot) return false;
  try {
    const normalizedPodRoot = new URL(podRoot.endsWith("/") ? podRoot : `${podRoot}/`);
    return (
      resourceIsWithinContainer(
        route.distributionUrl,
        new URL("solid-tours/public/cataloged-routes/", normalizedPodRoot).href
      ) ||
      resourceIsWithinContainer(
        route.datasetUrl,
        new URL("catalog/ds/", normalizedPodRoot).href
      )
    );
  } catch {
    return false;
  }
};

/**
 * A copied Catalog route keeps its public provenance but must never be
 * published as a new Catalog route by the adopting Pod.
 */
export const isDraftEligibleForCatalogPublication = (
  draft: Pick<TourDraft, "adoptedFromCatalog">
): boolean => !draft.adoptedFromCatalog;

export type CatalogRouteAvailabilityContext = {
  currentWebId?: string | null;
  currentPodRoot?: string | null;
  ownPublications?: readonly PublishedCatalogRouteReference[];
};

/**
 * Return only catalog entries that have not already been copied into the
 * private tour list.
 *
 * Drafts written before adoption provenance existed are handled
 * conservatively. An exact GeoJSON name/geometry match suppresses a route
 * only when that content identifies one catalog entry unambiguously; an
 * ambiguous legacy match remains visible instead of guessing its identity.
 */
export function availableCatalogedRoutes(
  routes: readonly CatalogedRoute[],
  drafts: readonly TourDraft[],
  {
    currentWebId = null,
    currentPodRoot = null,
    ownPublications = [],
  }: CatalogRouteAvailabilityContext = {}
): CatalogedRoute[] {
  const belongsToCurrentPod = (route: CatalogedRoute): boolean =>
    sameWebId(route.creatorWebId, currentWebId) ||
    routeBelongsToPod(route, currentPodRoot) ||
    ownPublications.some((publication) =>
      isSamePublishedCatalogRoute(publication, route)
    );
  const explicitlyAdopted = (route: CatalogedRoute): boolean =>
    drafts.some(
      (draft) =>
        draft.adoptedFromCatalog &&
        isSameCatalogRouteReference(draft.adoptedFromCatalog, route)
    );

  const remainingRoutes = routes.filter(
    (route) => !belongsToCurrentPod(route) && !explicitlyAdopted(route)
  );
  const legacyDrafts = drafts.filter(
    (draft) => !draft.adoptedFromCatalog && draft.routeSource === "geojson"
  );
  if (legacyDrafts.length === 0) return remainingRoutes;

  const legacyCatalogCandidates = new Map<
    string,
    Array<{ route: CatalogedRoute; geometryKey: string }>
  >();
  // Determine legacy ambiguity against the complete discovery result. Removing
  // an explicitly adopted entry first could otherwise make an originally
  // ambiguous legacy copy look unique and hide a different Catalog entry.
  for (const route of routes) {
    const candidates = legacyCatalogCandidates.get(route.name) || [];
    candidates.push({ route, geometryKey: JSON.stringify(route.geometry) });
    legacyCatalogCandidates.set(route.name, candidates);
  }
  const legacyMatches = new Set<string>();
  for (const draft of legacyDrafts) {
    const draftGeometryKey = JSON.stringify(draft.geometry);
    const matches = (legacyCatalogCandidates.get(draft.name) || []).filter(
      (candidate) => candidate.geometryKey === draftGeometryKey
    );
    if (matches.length === 1) {
      legacyMatches.add(matches[0].route.datasetUrl);
    }
  }

  return remainingRoutes.filter((route) => !legacyMatches.has(route.datasetUrl));
}

const validateRouteTemplateSize = (value: RouteTemplateSnapshot): void => {
  const points = value.geometry.coordinates.reduce((total, line) => total + line.length, 0);
  if (points > MAX_PUBLISHED_POINTS) {
    throw new Error(`Eine katalogisierte Route darf h\u00f6chstens ${MAX_PUBLISHED_POINTS} Punkte enthalten.`);
  }
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > MAX_PUBLISHED_BYTES) {
    throw new Error("Eine katalogisierte Route darf h\u00f6chstens 2 MiB gro\u00df sein.");
  }
};

export function createRouteTemplateSnapshot(
  draft: Pick<TourDraft, "name" | "geometry">,
  routeTemplateId = createId()
): RouteTemplateSnapshot {
  if (!isUuidV4(routeTemplateId)) throw new Error("Die Routenvorlagen-ID ist ung\u00fcltig.");
  const name = draft.name.trim();
  if (!name || name.length > 160) throw new Error("Der \u00f6ffentliche Routenname ist ung\u00fcltig.");
  if (!isValidGeometry(draft.geometry)) throw new Error("Die Route braucht mindestens zwei g\u00fcltige Punkte.");
  const snapshot: RouteTemplateSnapshot = {
    type: "Feature",
    geometry: { type: "MultiLineString", coordinates: cloneGeometry(draft.geometry) },
    properties: {
      schemaVersion: ROUTE_TEMPLATE_SCHEMA_VERSION,
      source: ROUTE_TEMPLATE_SOURCE,
      routeTemplateId,
      name,
    },
  };
  validateRouteTemplateSize(snapshot);
  return snapshot;
}

export function parseRouteTemplateSnapshot(
  input: unknown,
  expectedIdentifier?: string
): RouteTemplateSnapshot {
  const value = input as Record<string, unknown> | null;
  if (!value || !ownKeysOnly(value, ["type", "geometry", "properties"]) || value.type !== "Feature") {
    throw new Error("Die katalogisierte Route hat ein ung\u00fcltiges Format.");
  }
  const geometry = value.geometry as Record<string, unknown> | null;
  const properties = value.properties as Record<string, unknown> | null;
  if (
    !geometry ||
    !ownKeysOnly(geometry, ["type", "coordinates"]) ||
    geometry.type !== "MultiLineString" ||
    !properties ||
    !ownKeysOnly(properties, ["schemaVersion", "source", "routeTemplateId", "name"]) ||
    properties.schemaVersion !== ROUTE_TEMPLATE_SCHEMA_VERSION ||
    properties.source !== ROUTE_TEMPLATE_SOURCE ||
    !isUuidV4(properties.routeTemplateId) ||
    typeof properties.name !== "string" ||
    !properties.name.trim() ||
    properties.name !== properties.name.trim() ||
    properties.name.length > 160 ||
    !isValidGeometry(geometry.coordinates as MultiLineCoordinates)
  ) {
    throw new Error("Die katalogisierte Route hat ein ung\u00fcltiges Format.");
  }
  const identifier = `${ROUTE_TEMPLATE_IDENTIFIER_PREFIX}${properties.routeTemplateId}`;
  if (expectedIdentifier && identifier !== expectedIdentifier) {
    throw new Error("Katalogeintrag und Routenvorlage passen nicht zusammen.");
  }
  const snapshot = createRouteTemplateSnapshot(
    { name: properties.name, geometry: geometry.coordinates as MultiLineCoordinates },
    properties.routeTemplateId
  );
  validateRouteTemplateSize(snapshot);
  return snapshot;
}

export function adoptCatalogedRoute(route: CatalogedRoute): TourDraft {
  const now = new Date().toISOString();
  return {
    id: createId(),
    name: route.name,
    routeSource: "geojson",
    geometry: cloneGeometry(route.geometry),
    adoptedFromCatalog: catalogRouteReference(route),
    createdAt: now,
    updatedAt: now,
  };
}

export function catalogedRouteFromSnapshot(
  metadata: Omit<CatalogedRoute, "routeTemplateId" | "name" | "geometry" | "distanceMeters">,
  snapshot: RouteTemplateSnapshot
): CatalogedRoute {
  return {
    ...metadata,
    routeTemplateId: snapshot.properties.routeTemplateId,
    name: snapshot.properties.name,
    geometry: cloneGeometry(snapshot.geometry.coordinates),
    distanceMeters: routeDistanceMeters(snapshot.geometry.coordinates),
  };
}
