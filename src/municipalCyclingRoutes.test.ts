import { describe, expect, it, vi } from "vitest";
import { CYCLING_CATALOG_URL, loadMunicipalCyclingRoutes, parseMunicipalCyclingRoutes } from "./municipalCyclingRoutes";
import { adoptCatalogedRoute, availableCatalogedRoutes, catalogRouteKey, isDraftEligibleForCatalogPublication } from "./routeTemplates";
import { completeTour, publishedActivityCollection } from "./domain";
import { validateLocalToursState } from "./stateValidation";

const url = "https://solid-community-server.tmdt.info/gesundestal/public/opendata/radrouten-wuppertal/routes.json";
const a = [7.1, 51.2], b = [7.11, 51.21], c = [7.12, 51.22], d = [7.13, 51.23];
const line = (name: string, coordinates: unknown = [a, b]) => ({ type: "Feature", properties: { ROUTE: name }, geometry: { type: "LineString", coordinates } });
const multi = (name: string, coordinates: unknown) => ({ ...line(name), geometry: { type: "MultiLineString", coordinates } });
const collection = (...features: unknown[]) => ({ type: "FeatureCollection", features });
const catalog = `@prefix dcat: <http://www.w3.org/ns/dcat#>.
<${CYCLING_CATALOG_URL}> dcat:distribution <#dist>.
<#dist> dcat:downloadURL <${url}>.`;

// These are source-adapter tests, not fixtures masquerading as recorded activities.
describe("municipal cycling suggestions", () => {
  it("retains all geometry, joins only exact endpoints and excludes networks, branches and gaps", () => {
    const routes = parseMunicipalCyclingRoutes(collection(
      line("Sambatrasse"), multi("R1", [[c, b], [a, b]]),
      line("NRW-NETZ"), line("Verbindung R2 R4a"), line("Deutsche Fußballroute NRW"),
      multi("R2", [[a, b], [c, d]]), multi("R3", [[a, b], [b, c], [b, d]]),
      line("R4", [null, b]), line("R4a", [[500000, 5600000], b]),
      line("R5", [[51.2, 7.1], b]),
    ), url);
    expect(routes.map(route => route.name)).toEqual(["R1", "Sambatrasse"]);
    expect(routes[0].geometry).toEqual([[c, b, a]]);
    expect(routes[1].geometry).toEqual([[a, b]]);
    expect(routes.every(route => route.category === "cycling")).toBe(true);
  });

  it("rejects disconnected closed loops and duplicate names without discarding other valid routes", () => {
    const routes = parseMunicipalCyclingRoutes(collection(
      multi("R2", [[a, b, a], [c, d, c]]), line("R1"), line("R1", [c, d]), line("Schwarzbachtrasse"),
    ), url);
    expect(routes.map(route => route.name)).toEqual(["Schwarzbachtrasse"]);
  });

  it("fails explicitly for the wrong CRS, empty sources and malformed collections", () => {
    expect(() => parseMunicipalCyclingRoutes({ ...collection(line("R1")), crs: { properties: { name: "EPSG:25832" } } }, url)).toThrow(/WGS84/);
    expect(() => parseMunicipalCyclingRoutes(collection(line("NRW-NETZ")), url)).toThrow(/No continuous/);
    expect(() => parseMunicipalCyclingRoutes(null, url)).toThrow(/Invalid/);
  });

  it("keeps stable per-route identities across source order, adoption, edits and reload", () => {
    const routes = parseMunicipalCyclingRoutes(collection(line("R1"), line("Sambatrasse")), url);
    const reordered = parseMunicipalCyclingRoutes(collection(line("Sambatrasse"), line("R1")), url);
    expect(reordered.map(catalogRouteKey)).toEqual(routes.map(catalogRouteKey));
    expect(new Set(routes.map(catalogRouteKey)).size).toBe(2);
    expect(routes[0].datasetUrl).toBe(routes[1].datasetUrl);
    const draft = adoptCatalogedRoute(routes[0]);
    draft.name = "My renamed cycling tour";
    const state = validateLocalToursState({ schemaVersion: 1, drafts: [draft], activities: [], catalogPublications: [], activeRun: null });
    expect(availableCatalogedRoutes(routes, state.drafts)).toEqual([routes[1]]);
    expect(state.activities).toEqual([]);
    expect(state.activeRun).toBeNull();
    expect(isDraftEligibleForCatalogPublication(state.drafts[0])).toBe(false);
    const activity = completeTour(state.drafts[0], "2026-10-01", "cycling");
    const donation = publishedActivityCollection([activity], "69020722-f94e-4d99-9aac-37b33d5607c7");
    expect(donation.features).toHaveLength(1);
    expect(donation.features[0].properties.activityType).toBe("cycling");
    expect(donation.features[0].geometry.coordinates).toEqual(routes[0].geometry);
  });

  it("reads the catalog distribution anonymously and preserves catalog provenance", async () => {
    const fetcher = vi.fn<typeof fetch>(async input => new Response(String(input).endsWith('.ttl') ? catalog : JSON.stringify(collection(line("Sambatrasse"))), {
      headers: { "Content-Type": String(input).endsWith('.ttl') ? "text/turtle" : "application/json" },
    }));
    const routes = await loadMunicipalCyclingRoutes(fetcher);
    expect(routes[0].datasetUrl).toBe(CYCLING_CATALOG_URL);
    expect(routes[0].distributionUrl).toBe(url);
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [, init] of fetcher.mock.calls) expect(init).toMatchObject({ credentials: "omit", redirect: "error" });
  });

  it("rejects failed requests, oversized data, wrong media types and foreign distributions", async () => {
    await expect(loadMunicipalCyclingRoutes(vi.fn(async () => new Response('', { status: 403 })))).rejects.toThrow(/403/);
    await expect(loadMunicipalCyclingRoutes(vi.fn(async () => new Response(' ', { headers: { 'Content-Length': '3000000' } })))).rejects.toThrow(/too large/);
    await expect(loadMunicipalCyclingRoutes(vi.fn(async () => new Response('x'.repeat(2 * 1024 * 1024 + 1))))).rejects.toThrow(/too large/);
    await expect(loadMunicipalCyclingRoutes(vi.fn(async () => new Response(catalog.replace(url, 'https://foreign.example/routes.json'), { headers: { 'Content-Type': 'text/turtle' } })))).rejects.toThrow(/No supported/);
    await expect(loadMunicipalCyclingRoutes(vi.fn(async input => new Response(String(input).endsWith('.ttl') ? catalog : '<html>error</html>', { headers: { 'Content-Type': String(input).endsWith('.ttl') ? 'text/turtle' : 'text/html' } })))).rejects.toThrow(/media type/);
  });
});
