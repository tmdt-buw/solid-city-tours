import type {
  Coordinate,
  DurationSource,
  MultiLineCoordinates,
  RouteSource,
} from "./types";
import { isValidGeometry } from "./domain";

export type ImportedRoute = {
  name: string;
  geometry: MultiLineCoordinates;
  routeSource: Extract<RouteSource, "gpx" | "geojson">;
  durationMinutes?: number;
  durationSource?: DurationSource;
};

export type ImportRouteLabels = {
  importedTour: string;
  importedGpxTour: string;
};

const coordinate = (value: unknown): Coordinate | null => {
  if (!Array.isArray(value) || value.length < 2) return null;
  const longitude = Number(value[0]);
  const latitude = Number(value[1]);
  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    return null;
  }
  return [longitude, latitude];
};

function geometryLines(geometry: any): MultiLineCoordinates {
  if (!geometry || typeof geometry !== "object") return [];
  if (geometry.type === "LineString") {
    const line = (geometry.coordinates || []).map(coordinate).filter(Boolean) as Coordinate[];
    return line.length >= 2 ? [line] : [];
  }
  if (geometry.type === "MultiLineString") {
    return (geometry.coordinates || [])
      .map((line: unknown[]) => line.map(coordinate).filter(Boolean) as Coordinate[])
      .filter((line: Coordinate[]) => line.length >= 2);
  }
  return [];
}

export function importGeoJson(text: string, fallbackName: string): ImportedRoute {
  let input: any;
  try {
    input = JSON.parse(text);
  } catch {
    throw new Error("Die Datei enthält kein gültiges GeoJSON.");
  }

  const features = input?.type === "FeatureCollection" ? input.features || [] : [input];
  const lines = features.flatMap((feature: any) =>
    geometryLines(feature?.type === "Feature" ? feature.geometry : feature)
  );
  if (!isValidGeometry(lines)) {
    throw new Error("GeoJSON muss mindestens eine LineString-Geometrie enthalten.");
  }

  const properties = features.find((feature: any) => feature?.properties)?.properties || {};

  return {
    name: String(properties.name || fallbackName || "Importierte Tour"),
    geometry: lines,
    routeSource: "geojson",
    durationMinutes: undefined,
    durationSource: undefined,
  };
}

const elements = (root: Document | Element, localName: string): Element[] =>
  Array.from(root.getElementsByTagNameNS("*", localName));

const pointFromElement = (element: Element): Coordinate | null => {
  const latitude = Number(element.getAttribute("lat"));
  const longitude = Number(element.getAttribute("lon"));
  return coordinate([longitude, latitude]);
};

export function importGpx(
  text: string,
  fallbackName: string,
  unnamedFallback = "Importierte GPX-Tour"
): ImportedRoute {
  const document = new DOMParser().parseFromString(text, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("Die GPX-Datei ist ungültig.");

  const segmentElements = elements(document, "trkseg");
  let timedPoints: Element[] = [];
  let lines = segmentElements
    .map((segment) => {
      const points = elements(segment, "trkpt");
      timedPoints.push(...points);
      return points.map(pointFromElement).filter(Boolean) as Coordinate[];
    })
    .filter((line) => line.length >= 2);

  if (!lines.length) {
    const routePoints = elements(document, "rtept");
    timedPoints = routePoints;
    const routeLine = routePoints.map(pointFromElement).filter(Boolean) as Coordinate[];
    if (routeLine.length >= 2) lines = [routeLine];
  }
  if (!isValidGeometry(lines)) throw new Error("GPX enthält keinen nutzbaren Track.");

  const timestamps = timedPoints
    .map((point) => elements(point, "time")[0]?.textContent || "")
    .map(Date.parse)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const elapsedMs = timestamps.length >= 2 ? timestamps.at(-1)! - timestamps[0] : 0;
  const name = elements(document, "name")[0]?.textContent?.trim() || fallbackName;

  return {
    name: name || unnamedFallback,
    geometry: lines,
    routeSource: "gpx",
    durationMinutes: elapsedMs > 0 ? elapsedMs / 60_000 : undefined,
    durationSource: elapsedMs > 0 ? "gpx" : undefined,
  };
}

export function importRouteFile(
  fileName: string,
  text: string,
  labels: ImportRouteLabels = {
    importedTour: "Importierte Tour",
    importedGpxTour: "Importierte GPX-Tour",
  }
): ImportedRoute {
  const baseName = fileName.replace(/\.(gpx|geojson|json)$/i, "") || labels.importedTour;
  if (/\.gpx$/i.test(fileName)) return importGpx(text, baseName, labels.importedGpxTour);
  if (/\.(geojson|json)$/i.test(fileName)) return importGeoJson(text, baseName);
  throw new Error("Unterstützt werden GPX-, GeoJSON- und JSON-Dateien.");
}
