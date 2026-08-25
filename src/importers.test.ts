import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { importGeoJson, importGpx, importRouteFile } from "./importers";

describe("route imports", () => {
  it("imports LineString GeoJSON as an activity-neutral route", () => {
    const result = importGeoJson(
      JSON.stringify({
        type: "Feature",
        geometry: { type: "LineString", coordinates: [[7.1, 51.2], [7.2, 51.3]] },
        properties: { name: "Nordbahntrasse", activityType: "cycling", activeMinutes: 99 },
      }),
      "fallback"
    );
    expect(result.name).toBe("Nordbahntrasse");
    expect(result).not.toHaveProperty("activityType");
    expect(result.durationMinutes).toBeUndefined();
    expect(result.durationSource).toBeUndefined();
  });

  it("imports GPX segments and trusted timestamps", () => {
    const result = importGpx(
      `<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Hardt</name><trkseg><trkpt lat="51.25" lon="7.14"><time>2026-08-20T10:00:00Z</time></trkpt><trkpt lat="51.26" lon="7.16"><time>2026-08-20T10:30:00Z</time></trkpt></trkseg></trk></gpx>`,
      "fallback"
    );
    expect(result.name).toBe("Hardt");
    expect(result.geometry).toHaveLength(1);
    expect(result.durationMinutes).toBe(30);
    expect(result.durationSource).toBe("gpx");
  });

  it("uses caller-provided localized names for otherwise unnamed imports", () => {
    const route = importRouteFile(
      ".gpx",
      `<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg><trkpt lat="51.25" lon="7.14"/><trkpt lat="51.26" lon="7.16"/></trkseg></trk></gpx>`,
      { importedTour: "Imported tour", importedGpxTour: "Imported GPX tour" }
    );

    expect(route.name).toBe("Imported tour");
  });

  it("rejects unsupported file types", () => {
    expect(() => importRouteFile("route.kml", "")).toThrow(/GPX/);
  });

  it.each([
    ["nordbahntrasse.geojson", "Radschnellweg Nordbahntrasse", "cycling", 2969577, 745],
    ["beyenburger-stausee-a2.geojson", "Beyenburger Stausee Rundweg A2", "walking", 303340, 323],
    ["ronsdorfer-talsperre-a2.geojson", "Rundweg A2 Ronsdorfer Talsperre", "walking", 551355, 343],
  ])("imports the real example track %s", (
    fileName,
    expectedName,
    _expectedActivityType,
    expectedRelationId,
    expectedPointCount
  ) => {
    const text = readFileSync(
      resolve("public", "example-routes", fileName),
      "utf8"
    );
    const result = importRouteFile(fileName, text);
    const properties = JSON.parse(text).features[0].properties;

    expect(result.name).toBe(expectedName);
    expect(result.routeSource).toBe("geojson");
    expect(result).not.toHaveProperty("activityType");
    expect(result.geometry).toHaveLength(1);
    expect(result.geometry.flat()).toHaveLength(expectedPointCount);
    expect(properties.osmRelationId).toBe(expectedRelationId);
    expect(properties.attribution).toBe("© OpenStreetMap contributors");
    expect(properties.licenseUrl).toBe("https://opendatacommons.org/licenses/odbl/1.0/");
  });
});
