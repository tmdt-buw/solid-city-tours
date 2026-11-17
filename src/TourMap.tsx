import { CYCLING_CATALOG_URL, CYCLING_SOURCE_PAGE, CYCLING_LICENSE_URL } from "./municipalCyclingRoutes";
import { useEffect, useRef } from "react";
import L, { type LatLngExpression, type LeafletMouseEvent } from "leaflet";
import "leaflet/dist/leaflet.css";
import { initializeOnce } from "./mapLifecycle";
import wuppertalDistricts from "./wuppertalDistricts.json";
import { translate, type ToursLanguage } from "./i18n";
import { routeDistanceMeters } from "./domain";
import type { Coordinate, MultiLineCoordinates, TourDraft } from "./types";
import type { CatalogedRoute } from "./routeTemplates";
const WUPPERTAL: LatLngExpression = [51.2562, 7.1508];
const distanceLabel = (geometry: MultiLineCoordinates, language: ToursLanguage) => `${(routeDistanceMeters(geometry) / 1000).toLocaleString(language, { maximumFractionDigits: 1 })} km`;

const position = ([longitude, latitude]: Coordinate): LatLngExpression => [latitude, longitude];

export default function TourMap({
  geometry,
  routeId,
  fitRequest,
  savedRoutes,
  catalogPreview,
  editable,
  onPoint,
  onSelectRoute,
  language,
}: {
  geometry: MultiLineCoordinates;
  routeId: string;
  fitRequest: number;
  savedRoutes: TourDraft[];
  catalogPreview: CatalogedRoute | null;
  editable: boolean;
  onPoint: (point: Coordinate) => void;
  onSelectRoute: (draftId: string) => void;
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
  const onSelectRouteRef = useRef(onSelectRoute);
  onSelectRouteRef.current = onSelectRoute;
  const editableRef = useRef(editable);
  editableRef.current = editable;

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

    // Same district geometry as Urban Data Explorer. Keep the background
    // separate from route overlays so switching tours cannot remove it.
    wuppertalDistricts.features.forEach((district) => {
      L.polygon(
        district.geometry.coordinates.map((ring) =>
          ring.map(([longitude, latitude]): LatLngExpression => [latitude, longitude])
        ),
        {
          color: "white",
          weight: 2,
          opacity: 1,
          fillColor: "#bdbaba",
          fillOpacity: 0.45,
          interactive: false,
          className: "city-district",
        }
      ).addTo(map);
    });

    const handleClick = (event: LeafletMouseEvent) => {
      if (editableRef.current) {
        onPointRef.current([event.latlng.lng, event.latlng.lat]);
      }
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

    const municipalAttribution = `<a href="${CYCLING_SOURCE_PAGE}" target="_blank" rel="noreferrer">Radrouten © Stadt Wuppertal</a> · <a href="${CYCLING_LICENSE_URL}" target="_blank" rel="noreferrer">CC BY 4.0</a>`;
    map.attributionControl?.removeAttribution(municipalAttribution);
    if (catalogPreview?.datasetUrl === CYCLING_CATALOG_URL || savedRoutes.some(route => route.adoptedFromCatalog?.datasetUrl === CYCLING_CATALOG_URL)) {
      map.attributionControl?.addAttribution(municipalAttribution);
    }
    overlay.clearLayers();
    savedRoutes.forEach((savedRoute) => {
      savedRoute.geometry
        .filter((line) => line.length >= 2)
        .forEach((line) => {
          L.polyline(line.map(position), {
            color: "#174ea6",
            opacity: .72,
            weight: 5,
            smoothFactor: 1.5,
            lineCap: "round",
            lineJoin: "round",
            bubblingMouseEvents: false,
          })
            .on("click", () => onSelectRouteRef.current(savedRoute.id))
            .addTo(overlay);
        });
    });
    geometry
      .filter((line) => line.length >= 2)
      .forEach((line) => {
        L.polyline(line.map(position), {
          color: "#d97706",
          opacity: .96,
          weight: 7,
          smoothFactor: 1.5,
          lineCap: "round",
          lineJoin: "round",
          interactive: true,
          bubblingMouseEvents: false,
        }).addTo(overlay);
      });

    const currentPoints = geometry.flat();
    // Show the first point immediately; only endpoints, never thousands of vertex dots.
    const endpoints = currentPoints.length > 1 ? [currentPoints[0], currentPoints.at(-1)!] : currentPoints;
    endpoints.forEach((point, index) => L.circleMarker(position(point), {
      radius: 6, color: "#ffffff", weight: 2, fillColor: index ? "#10284a" : "#d97706",
      fillOpacity: 1, interactive: false,
    }).addTo(overlay));

    if (catalogPreview) {
      const tooltip = document.createElement("div");
      tooltip.className = "catalog-route-tooltip";
      const name = document.createElement("strong");
      name.textContent = catalogPreview.name;
      const publisher = document.createElement("span");
      publisher.textContent = `${translate(language, "publishedBy")}: ${catalogPreview.publisher}`;
      const distance = document.createElement("span");
      distance.textContent = `${translate(language, "distance")}: ${distanceLabel(
        catalogPreview.geometry,
        language
      )}`;
      tooltip.append(name, publisher, distance);
      catalogPreview.geometry
        .filter((line) => line.length >= 2)
        .forEach((line) => {
          L.polyline(line.map(position), {
            color: "#00a6a6",
            opacity: 1,
            weight: 8,
            dashArray: "12 8",
            smoothFactor: 1.5,
            lineCap: "round",
            lineJoin: "round",
            bubblingMouseEvents: false,
          })
            .bindTooltip(tooltip.cloneNode(true) as HTMLElement, {
              sticky: true,
              className: "catalog-route-leaflet-tooltip",
            })
            .addTo(overlay);
        });
    }

  }, [catalogPreview, geometry, language, savedRoutes]);

  const fitGeometry = useRef(geometry);
  fitGeometry.current = geometry;
  // Fit only on explicit selection or request, preserving the view while drawing.
  // https://leafletjs.com/reference.html#map-fitbounds
  useEffect(() => {
    const points = catalogPreview?.geometry.flat() || fitGeometry.current.flat();
    if (points.length && mapRef.current) {
      mapRef.current.invalidateSize({ pan: false });
      mapRef.current.fitBounds(L.latLngBounds(points.map(position)), { padding: [32, 32], maxZoom: 16 });
    }
  }, [routeId, catalogPreview?.routeTemplateId, catalogPreview?.datasetUrl, fitRequest]);

  return <div ref={containerRef} className={`tour-map${editable ? " is-drawing" : ""}`}
    aria-label={translate(language, editable ? "keyboardDrawingHint" : "tourMap")}
    onKeyDown={(event) => {
      // Leaflet handles arrow-key panning; Enter adds its current center without a pointer.
      if (event.key !== "Enter" || !editableRef.current || !mapRef.current || event.target !== event.currentTarget) return;
      event.preventDefault();
      const center = mapRef.current.getCenter();
      onPointRef.current([center.lng, center.lat]);
    }} />;
}
