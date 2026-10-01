import { getSolidDataset, getThing, getUrl, getUrlAll } from "@inrupt/solid-client";
import { isValidGeometry, MAX_PUBLISHED_POINTS, routeDistanceMeters } from "./domain";
import type { CatalogedRoute } from "./routeTemplates";
import type { Coordinate, MultiLineCoordinates } from "./types";

export const CYCLING_CATALOG_URL = "https://solid-community-server.tmdt.info/gesundestal/catalog/ds/e6fe12d6-4690-4986-812b-02155a8f03fc.ttl#it";
export const CYCLING_SOURCE_PAGE = "https://www.offenedaten-wuppertal.de/dataset/radrouten-wuppertal";
export const CYCLING_LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/";
const DISTRIBUTION_PREFIX = "https://solid-community-server.tmdt.info/gesundestal/public/opendata/radrouten-wuppertal/";
const MAX_BYTES = 2 * 1024 * 1024;
const DCAT = "http://www.w3.org/ns/dcat#";

// Stable local identities for individual municipal routes within ONE catalog dataset.
// Regional extracts, NRW-NETZ, connectors, diversions and proposed variants are not tours.
// These IDs must remain unchanged when the source file is reordered or refreshed.
const ROUTE_IDS: Readonly<Record<string, string>> = {
  "Bergbahntrasse": "4c168b49-fb35-45c2-ab74-ea3f0bf41fee",
  "Nordbahntrasse": "498145c1-64f1-41a8-aa1e-c34e20ba1b3f",
  "R1": "8ec5543d-1ef9-47d2-8b28-b5f90f7257a1",
  "R2": "c33b6a2c-ad34-419c-b7f4-22f800feb3d4",
  "R3": "d1e96b0e-0153-4dde-86c7-4c0a6506dc63",
  "R3a": "fabef4b5-3242-45f4-9dfe-00a3dc955061",
  "R4": "9ef29fa1-e985-47df-ba65-17bf353cdf5c",
  "R4a": "917f756b-351a-45b3-9f3b-1ec269809118",
  "R5": "44846fa4-7fda-4c3e-82eb-161a6693bddc",
  "R5a": "41d723c9-83ca-4c52-902a-e662fbed9f7b",
  "Sambatrasse": "7068cb15-0428-4f6e-99f1-67067f31702e",
  "Schwarzbachtrasse": "d2bf071f-a280-41eb-bba5-97770b6ffc65",
  "Veloroute1": "b8f6fee2-dc6a-4e00-86cb-46abaa2b669f",
};

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const endpointKey = (point: Coordinate) => `${point[0]},${point[1]}`;

/** Only join exact shared endpoints. Never bridge gaps or pick an arbitrary branch. */
function continuousRoute(lines: MultiLineCoordinates): MultiLineCoordinates | null {
  if (lines.length === 1) return lines.map(line => line.map(([x, y]) => [x, y]));
  const endpoints = new Map<string, number[]>();
  lines.forEach((line, index) => {
    for (const point of [line[0], line[line.length - 1]]) {
      const key = endpointKey(point);
      endpoints.set(key, [...(endpoints.get(key) || []), index]);
    }
  });
  if ([...endpoints.values()].some(indices => indices.length > 2)) return null;
  const ends = [...endpoints].filter(([, indices]) => indices.length === 1);
  if (ends.length !== 0 && ends.length !== 2) return null;
  let cursor = ends[0]?.[0] || endpointKey(lines[0][0]);
  const visited = new Set<number>();
  const joined: Coordinate[] = [];
  while (visited.size < lines.length) {
    const next = endpoints.get(cursor)?.find(index => !visited.has(index));
    if (next === undefined) return null;
    visited.add(next);
    const line = endpointKey(lines[next][0]) === cursor ? lines[next] : [...lines[next]].reverse();
    joined.push(...(joined.length ? line.slice(1) : line).map(([x, y]): Coordinate => [x, y]));
    cursor = endpointKey(line[line.length - 1]);
  }
  return [joined];
}

export function parseMunicipalCyclingRoutes(input: unknown, distributionUrl: string): CatalogedRoute[] {
  const collection = object(input);
  if (!collection || collection.type !== "FeatureCollection" || !Array.isArray(collection.features) || collection.features.length > 2000) {
    throw new Error("Invalid municipal cycling collection.");
  }
  const crs = object(collection.crs);
  const crsName = object(crs?.properties)?.name;
  if (collection.crs != null && !["urn:ogc:def:crs:OGC:1.3:CRS84", "urn:ogc:def:crs:EPSG::4326", "EPSG:4326"].includes(String(crsName))) {
    throw new Error("Municipal routes must use WGS84 coordinates.");
  }
  const names = new Map<string, number>();
  for (const item of collection.features) {
    const name = object(object(item)?.properties)?.ROUTE;
    if (typeof name === "string") names.set(name, (names.get(name) || 0) + 1);
  }
  const routes: CatalogedRoute[] = [];
  for (const item of collection.features) {
    const feature = object(item);
    const name = object(feature?.properties)?.ROUTE;
    const geometry = object(feature?.geometry);
    if (feature?.type !== "Feature" || typeof name !== "string" || !Object.hasOwn(ROUTE_IDS, name) || names.get(name) !== 1 || !geometry) continue;
    const lines = geometry.type === "LineString" ? [geometry.coordinates] : geometry.type === "MultiLineString" ? geometry.coordinates : null;
    if (!Array.isArray(lines) || lines.some(line => !Array.isArray(line) || line.some(point => !Array.isArray(point) || point.length !== 2))) continue;
    if (!isValidGeometry(lines as MultiLineCoordinates)) continue;
    const coordinates = lines as MultiLineCoordinates;
    if (coordinates.reduce((sum, line) => sum + line.length, 0) > MAX_PUBLISHED_POINTS) continue;
    // Reject projected/swapped coordinates and unexpected remote geometry for this local source.
    if (coordinates.some(line => line.some(([x, y]) => x < 6.9 || x > 7.4 || y < 51.1 || y > 51.4))) continue;
    const connected = continuousRoute(coordinates);
    if (!connected) continue;
    const distanceMeters = routeDistanceMeters(connected);
    if (!Number.isFinite(distanceMeters) || distanceMeters < 100) continue;
    routes.push({
      routeTemplateId: ROUTE_IDS[name], identifier: `wuppertal-cycling-${ROUTE_IDS[name]}`,
      name, description: "Radrouten Wuppertal", publisher: "Stadt Wuppertal",
      datasetUrl: CYCLING_CATALOG_URL, distributionUrl, geometry: connected, distanceMeters,
      category: "cycling",
    });
  }
  if (!routes.length) throw new Error("No continuous municipal cycling routes available.");
  return routes.sort((a, b) => a.name.localeCompare(b.name));
}

/** Follow the current distribution advertised by the existing public catalog entry. */
export async function loadMunicipalCyclingRoutes(anonymousFetch: typeof fetch = fetch): Promise<CatalogedRoute[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  const publicFetch: typeof fetch = async (input, init) => {
    const response = await anonymousFetch(input, { ...init, credentials: "omit", redirect: "error", signal: controller.signal });
    if (!response.ok) throw new Error(`Cycling source unavailable (${response.status}).`);
    if (Number(response.headers.get("Content-Length")) > MAX_BYTES) throw new Error("Cycling source too large.");
    // Limit actual bytes too, including chunked responses with no Content-Length.
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Empty cycling source.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) { await reader.cancel(); throw new Error("Cycling source too large."); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const bounded = new Response(bytes, { status: response.status, headers: response.headers });
    Object.defineProperty(bounded, "url", { value: response.url || String(input) });
    return bounded;
  };
  try {
    const dataset = await getSolidDataset(CYCLING_CATALOG_URL.split("#")[0], { fetch: publicFetch });
    const thing = getThing(dataset, CYCLING_CATALOG_URL);
    if (!thing) throw new Error("Cycling catalog entry missing.");
    const urls = getUrlAll(thing, `${DCAT}distribution`).flatMap(reference => {
      const distribution = getThing(dataset, reference);
      return distribution ? [getUrl(distribution, `${DCAT}downloadURL`)].filter((url): url is string => Boolean(url)) : [];
    });
    const distributionUrl = urls.find(value => {
      const url = new URL(value);
      return !url.username && !url.password && !url.hash && url.href.startsWith(DISTRIBUTION_PREFIX);
    });
    if (!distributionUrl) throw new Error("No supported public cycling distribution.");
    const response = await publicFetch(distributionUrl, { headers: { Accept: "application/geo+json, application/json" } });
    const contentType = response.headers.get("Content-Type") || "";
    if (!/application\/(geo\+json|json)/i.test(contentType)) throw new Error("Invalid cycling media type.");
    return parseMunicipalCyclingRoutes(await response.json(), distributionUrl);
  } finally { clearTimeout(timeout); }
}
