import { useMemo, useState } from "react";
import { CYCLING_SOURCE_PAGE, CYCLING_LICENSE_URL } from "./municipalCyclingRoutes";
import { catalogRouteKey, type CatalogedRoute } from "./routeTemplates";
import type { CatalogRouteDiscoveryReport } from "./catalog";
import { translate, type ToursLanguage } from "./i18n";

export default function RouteCatalog({ routes, discoveredCount, loading, error, report, previewId, busy, language, onPreview, onAdopt, onRetry }: {
  routes: CatalogedRoute[];
  discoveredCount: number;
  loading: boolean;
  error: string | null;
  report: CatalogRouteDiscoveryReport | null;
  previewId: string | null;
  busy: boolean;
  language: ToursLanguage;
  onPreview: (id: string | null) => void;
  onAdopt: (route: CatalogedRoute) => void;
  onRetry: () => void;
}) {
  const t = (key: Parameters<typeof translate>[1], values?: Record<string, string | number>) => translate(language, key, values);
  const [query, setQuery] = useState("");
  const [distance, setDistance] = useState("all");
  const [category, setCategory] = useState<"all" | "cycling">("all");
  const matches = useMemo(() => routes.filter((route) =>
    (category === "all" || route.category === "cycling") &&
    `${route.name} ${route.publisher}`.toLocaleLowerCase(language).includes(query.trim().toLocaleLowerCase(language)) &&
    (distance === "all" || (distance === "short" ? route.distanceMeters <= 5000 : route.distanceMeters > 5000))
  ), [routes, query, distance, language, category]);
  const incomplete = Boolean(report && (report.failures.length || report.truncatedCount));

  return <section className="panel-section list-card catalog-routes-card" aria-busy={loading}>
    <div className="section-heading"><h2>{t("catalogedTours")}</h2><strong className="count-badge">{matches.length}</strong></div>
    <div className="catalog-categories" role="group" aria-label={t("routeCategory")}>
      <button type="button" aria-pressed={category === "all"} onClick={() => setCategory("all")}>{t("allTours")}</button>
      <button type="button" aria-pressed={category === "cycling"} onClick={() => setCategory("cycling")}>{t("cyclingRoutes")}</button>
    </div>
    {category === "cycling" && <p className="help-text">{t("cyclingRoutesHint")}</p>}
    <div className="library-filters">
      <label>{t("searchRoutes")}<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <label>{t("distance")}<select value={distance} onChange={(event) => setDistance(event.target.value)}>
        <option value="all">{t("allDistances")}</option><option value="short">{t("upToFiveKm")}</option><option value="long">{t("overFiveKm")}</option>
      </select></label>
    </div>
    <div className="catalog-status" aria-live="polite">
      {loading && <p className="empty">{t("loadingCatalog")}</p>}
      {error && <p role="alert">{t("catalogLoadFailed")} {error}</p>}
      {incomplete && <details><summary>{t("catalogPartial", { failed: report!.failures.length, skipped: report!.truncatedCount })}</summary>
        <p>{t("catalogPartialHint")}</p>
        <ul>{report!.failures.map((failure, index) => <li key={`${failure.datasetUrl}-${index}`}>
          <strong>{failure.identifier}</strong>: {failure.code === "source-unavailable" ? t("catalogSourceUnavailable") : failure.code === "invalid-catalog-url" ? t("catalogInvalidAddress") : t("catalogInvalidTemplate")}
        </li>)}</ul>
      </details>}
      <button type="button" className="ghost catalog-retry" disabled={busy || loading} onClick={onRetry}>{t("refreshCatalog")}</button>
    </div>
    <div className="item-list catalog-route-list">
      {!loading && matches.length === 0 && <p className="empty">{t(
        routes.length ? "noMatchingTours" : discoveredCount ? "catalogAlreadyAvailable" : error || incomplete ? "catalogNoUsableRoutes" : "noCatalogedTours"
      )}</p>}
      {matches.map((route) => <article key={catalogRouteKey(route)} className={`catalog-route-item${previewId === catalogRouteKey(route) ? " is-previewed" : ""}`}>
        <div><strong>{route.name}</strong><small>{(route.distanceMeters / 1000).toLocaleString(language, { maximumFractionDigits: 1 })} km · {route.publisher}</small></div>
        {previewId === catalogRouteKey(route) && <p className="help-text">{t("catalogPreviewHint")}</p>}
        <div className="catalog-route-actions">
          <button type="button" className="ghost catalog-preview" aria-pressed={previewId === catalogRouteKey(route)} disabled={busy}
            onClick={() => onPreview(previewId === catalogRouteKey(route) ? null : catalogRouteKey(route))}>{t(previewId === catalogRouteKey(route) ? "closePreview" : "previewRoute")}</button>
          <button type="button" className="catalog-adopt" disabled={busy} onClick={() => onAdopt(route)}>{t("addToMyTours")}</button>
        </div>
      </article>)}
    </div>
    <details className="catalog-about"><summary>{t("aboutRouteCopies")}</summary><p className="help-text">{t("catalogCopyExplanation")}</p></details>
    {routes.some(route => route.category === "cycling") && <p className="catalog-source-credit">
      {t("cyclingDataSource")} <a href={CYCLING_SOURCE_PAGE} target="_blank" rel="noreferrer">Stadt Wuppertal</a>
      {" · "}<a href={CYCLING_LICENSE_URL} target="_blank" rel="noreferrer">CC BY 4.0</a>
    </p>}
  </section>;
}
