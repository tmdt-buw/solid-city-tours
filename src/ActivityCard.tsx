import { useMemo } from "react";
import { formatDate } from "./dateUtils";
import FontAwesomeIcon from "./FontAwesomeIcon";
import { translate, type ToursLanguage } from "./i18n";
import type { CompletedActivity, MultiLineCoordinates } from "./types";

function routePreview(geometry: MultiLineCoordinates) {
  let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
  for (const line of geometry) for (const [longitude, latitude] of line) {
    west = Math.min(west, longitude); east = Math.max(east, longitude);
    south = Math.min(south, latitude); north = Math.max(north, latitude);
  }
  if (!Number.isFinite(west)) return null;
  const longitudeScale = Math.max(.01, Math.cos((north + south) / 2 * Math.PI / 180));
  const width = (east - west) * longitudeScale, height = north - south;
  const scale = Math.min(88 / (width || 1e-9), 68 / (height || 1e-9));
  const project = ([longitude, latitude]: number[]) => [
    62 + ((longitude - west) * longitudeScale - width / 2) * scale,
    52 - (latitude - south - height / 2) * scale,
  ];
  // A small preview needs only a bounded sample. Keep segment breaks and ends.
  const lines = geometry.filter(line => line.length).map(line => {
    const stride = Math.max(1, Math.ceil(line.length / 240));
    return line.filter((_, index) => index % stride === 0 || index === line.length - 1)
      .map(point => project(point).map(value => value.toFixed(2)).join(",")).join(" ");
  });
  const first = geometry.find(line => line.length)?.[0];
  return { lines, start: first ? project(first) : null };
}

function dateLabel(date: string, language: ToursLanguage) {
  const now = new Date();
  const localDate = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  if (date === localDate(now)) return translate(language, "today");
  now.setDate(now.getDate() - 1);
  return date === localDate(now) ? translate(language, "yesterday") : formatDate(date, language);
}

export default function ActivityCard({ activity, language, busy, onDelete }: {
  activity: CompletedActivity;
  language: ToursLanguage;
  busy: boolean;
  onDelete: () => void;
}) {
  const preview = useMemo(() => routePreview(activity.geometry), [activity.geometry]);
  const t = (key: Parameters<typeof translate>[1]) => translate(language, key);
  const locale = language === "de" ? "de-DE" : "en-US";
  const summary = activity.activitySummary;
  const metrics = [
    `${(summary.distanceMeters / 1000).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`,
    `${summary.activeMinutes.toLocaleString(locale)} ${t("minutesShort")}`,
    "estimatedSteps" in summary
      ? `${t("approximately")} ${summary.estimatedSteps.toLocaleString(locale)} ${language === "en" ? t("steps").toLowerCase() : t("steps")}`
      : `${t("averageSpeed")} ${summary.averageSpeedKmh.toLocaleString(locale, { maximumFractionDigits: 1 })} km/h`,
  ];

  return <article className="activity-item">
    <div className="activity-route-preview" aria-hidden="true">
      {preview ? <svg viewBox="0 0 124 104" focusable="false">
        {preview.lines.map((points, index) => <polyline key={index} points={points} />)}
        {preview.start && <circle cx={preview.start[0]} cy={preview.start[1]} r="3.5" />}
      </svg> : <FontAwesomeIcon icon="route" />}
    </div>
    <div className="activity-content">
      <div className="activity-meta">
        <time dateTime={activity.completedDate} title={formatDate(activity.completedDate, language)}>{dateLabel(activity.completedDate, language)}</time>
        <span className="activity-kind"><FontAwesomeIcon icon={activity.activityType === "walking" ? "person-walking" : "bicycle"} />{t(activity.activityType === "walking" ? "walking" : "cycling")}</span>
      </div>
      <strong className="activity-title">{activity.name}</strong>
      <div className="activity-metrics">{metrics.map((metric, index) => <span key={index}>{metric}</span>)}</div>
      <small className="estimate-label">{t(summary.durationSource === "gpx" ? "gpxAndEstimatedValues" : "estimatedValues")}</small>
    </div>
    <button type="button" className="activity-delete" disabled={busy} onClick={onDelete}
      title={t("delete")} aria-label={`${t("delete")}: ${activity.name}`}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5" />
      </svg>
    </button>
  </article>;
}
