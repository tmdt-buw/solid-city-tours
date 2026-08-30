export type ToursLanguage = "en" | "de";

export const DEFAULT_TOURS_LANGUAGE: ToursLanguage = "en";
export const TOURS_LANGUAGE_STORAGE_KEY = "solid-dataspace.language";
export const TOURS_LANGUAGE_EVENT = "solid-dataspace-language-change";

export function normalizeToursLanguage(value: string | null | undefined): ToursLanguage {
  return value?.trim().toLowerCase().startsWith("de") ? "de" : DEFAULT_TOURS_LANGUAGE;
}

export function readStoredToursLanguage(): ToursLanguage {
  if (typeof window === "undefined") return DEFAULT_TOURS_LANGUAGE;
  try {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("lang") || params.get("language");
    if (requested) return normalizeToursLanguage(requested);
    return normalizeToursLanguage(window.localStorage.getItem(TOURS_LANGUAGE_STORAGE_KEY));
  } catch {
    return DEFAULT_TOURS_LANGUAGE;
  }
}

export function writeStoredToursLanguage(language: ToursLanguage): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TOURS_LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Language selection remains active in memory when browser storage is blocked.
  }
}

export function publishToursLanguage(language: ToursLanguage): void {
  writeStoredToursLanguage(language);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(TOURS_LANGUAGE_EVENT, { detail: { language } })
    );
  }
}

const translations = {
  loading: {
    en: "Loading your personal tour space …",
    de: "Dein persönlicher Tourenbereich wird geladen …",
  },
  tagline: { en: "Plan tours · Derive activities", de: "Touren planen · Aktivitäten ableiten" },
  demoPodSession: { en: "Solid Pod", de: "Solid Pod" },
  solidConnected: { en: "Solid connected", de: "Solid verbunden" },
  logout: { en: "Log out", de: "Abmelden" },
  workspace: { en: "Solid Tours workspace", de: "Solid Tours Arbeitsbereich" },
  tourPlanner: { en: "Tour planner", de: "Tourenplaner" },
  newTour: { en: "New tour", de: "Neue Tour" },
  defaultTourName: { en: "New tour in Wuppertal", de: "Neue Tour in Wuppertal" },
  tourName: { en: "Tour name", de: "Tourname" },
  routeMode: { en: "Route mode", de: "Routenmodus" },
  drawFreely: { en: "Draw freely", de: "Frei zeichnen" },
  importRoute: { en: "GPX / GeoJSON", de: "GPX / GeoJSON" },
  importedTour: { en: "Imported tour", de: "Importierte Tour" },
  importedGpxTour: { en: "Imported GPX tour", de: "Importierte GPX-Tour" },
  saveDraft: { en: "Save draft", de: "Entwurf speichern" },
  saveChanges: { en: "Save changes", de: "Änderungen speichern" },
  cancelEditing: { en: "Cancel editing", de: "Bearbeitung abbrechen" },
  publicRouteEditHint: {
    en: "Saving updates this route and its existing public catalog entry.",
    de: "Beim Speichern werden diese Route und ihr bestehender öffentlicher Katalogeintrag aktualisiert.",
  },
  myTours: { en: "My tours", de: "Meine Touren" },
  noSavedTours: { en: "No tours saved yet.", de: "Noch keine Tour gespeichert." },
  duplicate: { en: "Duplicate", de: "Duplizieren" },
  delete: { en: "Delete", de: "Löschen" },
  completedOn: { en: "Completed on", de: "Absolviert am" },
  tourDone: { en: "Tour completed", de: "Tour gemacht" },
  completedTours: { en: "Completed tours", de: "Gemachte Touren" },
  noCompletedTours: {
    en: "“Tour completed” creates an activity here.",
    de: "„Tour gemacht“ legt hier eine Aktivität an.",
  },
  resetDonation: { en: "Reset health data donation", de: "Gesundheitsdatenspende zurücksetzen" },
  shareDonation: { en: "Share health data donation", de: "Gesundheitsdatenspende freigeben" },
  tourMap: { en: "Tour map", de: "Tourenkarte" },
  routeInformation: { en: "Route information", de: "Routeninformationen" },
  distance: { en: "Distance", de: "Distanz" },
  duration: { en: "Duration", de: "Dauer" },
  minutesShort: { en: "min", de: "Min." },
  closeError: { en: "Close error message", de: "Fehlermeldung schließen" },
  editRoute: { en: "Edit route", de: "Route bearbeiten" },
  selectRoute: { en: "Select {name}", de: "{name} auswählen" },
  selectedRoute: { en: "Selected route: {name}", de: "Ausgewählte Route: {name}" },
  undoLastPoint: { en: "Undo last point", de: "Letzten Punkt zurücknehmen" },
  undoPoint: { en: "Undo point", de: "Punkt zurück" },
  clearEntireRoute: { en: "Clear entire route", de: "Route vollständig leeren" },
  clearRoute: { en: "Clear route", de: "Route leeren" },
  zoomIn: { en: "Zoom in", de: "Vergrößern" },
  zoomOut: { en: "Zoom out", de: "Verkleinern" },
  mapLegend: { en: "Map legend", de: "Kartenlegende" },
  routes: { en: "Routes", de: "Routen" },
  currentTour: { en: "Current tour", de: "Aktuelle Tour" },
  savedTour: { en: "Saved tour", de: "Gespeicherte Tour" },
  catalogPreview: { en: "Catalog preview", de: "Katalogvorschau" },
  catalogedTours: { en: "Cataloged tours", de: "Katalogisierte Touren" },
  noCatalogedTours: {
    en: "No public route templates found.",
    de: "Keine öffentlichen Routenvorlagen gefunden.",
  },
  loadingCatalog: { en: "Loading route catalog…", de: "Routenkatalog wird geladen …" },
  addToMyTours: { en: "Add to my tours", de: "Zu meinen Touren hinzufügen" },
  publishedBy: { en: "Published by", de: "Veröffentlicht von" },
  indexRoute: { en: "Index", de: "Indizieren" },
  removeFromCatalog: { en: "Remove from catalog", de: "Aus Katalog entfernen" },
  indexUncatalogedTours: {
    en: "Index uncataloged tours",
    de: "Nicht katalogisierte Touren indizieren",
  },
  cataloged: { en: "Cataloged", de: "Katalogisiert" },
  catalogOutdated: {
    en: "Public snapshot differs",
    de: "Öffentlicher Snapshot weicht ab",
  },
  publicRouteCatalog: { en: "Public route catalog", de: "Öffentlicher Routenkatalog" },
  indexRoutesTitle: { en: "Publish route templates?", de: "Routenvorlagen veröffentlichen?" },
  indexRoutesQuestion: {
    en: "Publish {count} route(s) as reusable public templates? Each route name becomes a public Catalog title; exact coordinates, start and destination will be visible and copyable by anyone. Public Catalog metadata also includes your publisher name, your WebID as creator and, when available in your Solid profile, your contact email.",
    de: "{count} Route(n) als wiederverwendbare öffentliche Vorlagen veröffentlichen? Jeder Tourname wird zu einem öffentlichen Katalogtitel; exakte Koordinaten, Start und Ziel sind danach für alle sichtbar und kopierbar. Die öffentlichen Katalogmetadaten enthalten außerdem deinen Publisher-Namen, deine WebID als Creator und, sofern im Solid-Profil vorhanden, deine Kontakt-E-Mail.",
  },
  removeCatalogRouteTitle: {
    en: "Remove route template?",
    de: "Routenvorlage entfernen?",
  },
  removeCatalogRouteQuestion: {
    en: "Remove “{name}” from the public route catalog? Existing private copies remain with their users.",
    de: "„{name}“ aus dem öffentlichen Routenkatalog entfernen? Bereits übernommene private Kopien bleiben bei ihren Nutzern.",
  },
  publishPublicly: { en: "Publish publicly", de: "Öffentlich veröffentlichen" },
  confirmCompletion: { en: "Confirm completion", de: "Abschluss bestätigen" },
  saveCompletedQuestion: {
    en: "Save this tour as completed?",
    de: "Diese Tour als gemacht speichern?",
  },
  route: { en: "Route", de: "Route" },
  howCompleted: { en: "How did you complete the tour?", de: "Wie hast du die Tour gemacht?" },
  walking: { en: "Walking", de: "Zu Fuß" },
  cycling: { en: "Cycling", de: "Fahrrad" },
  calculated: { en: "Calculated", de: "Berechnet" },
  steps: { en: "Steps", de: "Schritte" },
  approximately: { en: "approx.", de: "ca." },
  averagePace: { en: "Avg. pace", de: "Ø Pace" },
  averageSpeed: { en: "Avg. speed", de: "Ø Geschwindigkeit" },
  minutesPerKm: { en: "min/km", de: "Min./km" },
  cancel: { en: "Cancel", de: "Abbrechen" },
  save: { en: "Save", de: "Speichern" },
  savingCompletedTour: {
    en: "Saving completed tour…",
    de: "Gemachte Tour wird gespeichert …",
  },
  copySuffix: { en: "copy", de: "Kopie" },
  draftDeleteQuestion: {
    en: "Delete the draft “{name}”?",
    de: "Entwurf „{name}“ wirklich löschen?",
  },
  activityDeleteQuestion: {
    en: "Delete the completed tour “{name}”?",
    de: "Gemachte Tour „{name}“ wirklich löschen?",
  },
  activityDeleteAndReplaceDonationQuestion: {
    en: "Delete the completed tour \u201c{name}\u201d? This revokes the current health data donation. Any remaining completed tours will be published again as a new donation, and Environmental Monitoring must request access again.",
    de: "Gemachte Tour \u201e{name}\u201c wirklich l\u00f6schen? Dadurch wird die aktuelle Gesundheitsdatenspende widerrufen. Verbleibende gemachte Touren werden automatisch als neue Spende ver\u00f6ffentlicht; Environmental Monitoring muss den Zugriff erneut anfragen.",
  },
  confirmDeletion: { en: "Confirm deletion", de: "L\u00f6schen best\u00e4tigen" },
  deleteDraftTitle: { en: "Delete draft?", de: "Entwurf l\u00f6schen?" },
  deleteCompletedTourTitle: {
    en: "Delete completed tour?",
    de: "Gemachte Tour l\u00f6schen?",
  },
  deleteAndReplaceDonation: {
    en: "Delete & replace donation",
    de: "L\u00f6schen & Spende erneuern",
  },
  replacementPublishFailed: {
    en: "The previous health data donation was revoked and the tour was deleted, but the remaining tours could not be published again. You can share the health data donation again.",
    de: "Die bisherige Gesundheitsdatenspende wurde widerrufen und die Tour gel\u00f6scht, aber die verbleibenden Touren konnten nicht erneut ver\u00f6ffentlicht werden. Du kannst die Gesundheitsdatenspende erneut freigeben.",
  },
  language: { en: "Language", de: "Sprache" },
  english: { en: "English", de: "Englisch" },
  german: { en: "German", de: "Deutsch" },
  routeIllustration: {
    en: "A stylized hiking route through the hills of Wuppertal.",
    de: "Eine stilisierte Wanderroute durch die Hügel von Wuppertal.",
  },
  illustrationTagline: {
    en: "PLAN. EXPERIENCE. SHARE ON YOUR TERMS.",
    de: "PLANE. ERLEBE. TEILE SELBSTBESTIMMT.",
  },
  signInWithSolid: { en: "Sign in with Solid", de: "Mit Solid anmelden" },
  chooseProvider: { en: "Choose your Pod provider", de: "Wähle deinen Pod-Anbieter" },
  loginDescription: {
    en: "Sign in with your Solid account to keep tours private in your Pod and share a health data donation on your terms.",
    de: "Melde dich mit deinem Solid-Konto an, um Touren privat in deinem Pod zu speichern und eine Gesundheitsdatenspende selbstbestimmt freizugeben.",
  },
  suggestedProviders: { en: "Suggested providers", de: "Vorgeschlagene Anbieter" },
  recommendedForDemo: { en: "Recommended", de: "Empfohlen" },
  publicCommunityServer: { en: "Public community server", de: "Öffentlicher Community-Server" },
  customIssuer: { en: "Custom issuer", de: "Eigener Issuer" },
  customIssuerPlaceholder: {
    en: "https://your-pod-provider.example",
    de: "https://mein-pod-anbieter.example",
  },
  clearCustomIssuer: { en: "Clear custom issuer", de: "Eigenen Issuer leeren" },
  returnToProviders: { en: "Return to provider selection", de: "Zur Anbieterauswahl zurückkehren" },
  invalidIssuer: {
    en: "Enter an HTTPS address. HTTP is allowed only for development servers on this device.",
    de: "Bitte gib eine HTTPS-Adresse ein. HTTP ist ausschließlich für Entwicklungsserver auf diesem Gerät erlaubt.",
  },
  secureRedirect: {
    en: "You will be redirected to your Pod provider’s secure sign-in page.",
    de: "Du wirst zur sicheren Anmeldung deines Pod-Anbieters weitergeleitet.",
  },
  redirecting: { en: "Redirecting…", de: "Weiterleitung…" },
  login: { en: "Login", de: "Anmelden" },
} as const;

export type ToursTranslationKey = keyof typeof translations;

export function translate(
  language: ToursLanguage,
  key: ToursTranslationKey,
  values: Record<string, string | number> = {}
): string {
  return Object.entries(values).reduce(
    (message, [name, value]) => message.replaceAll(`{${name}}`, String(value)),
    translations[key][language] as string
  );
}

const germanToEnglishErrors = new Map<string, string>([
  ["Die Solid-Sitzung hat sich geaendert. Die alte Aktion wurde abgebrochen.", "The Solid session changed. The previous action was cancelled."],
  ["Die Solid-Sitzung hat sich geändert. Bitte wiederhole die Aktion.", "The Solid session changed. Please repeat the action."],
  ["Die Solid-Sitzung konnte nicht wiederhergestellt werden. Bitte melde dich erneut an.", "The Solid session could not be restored. Please sign in again."],
  ["Die angeforderte WebID stimmt nicht mit der Solid-Sitzung ueberein.", "The requested WebID does not match the Solid session."],
  ["Der gespeicherte Verlauf konnte nicht geladen werden.", "The saved activity history could not be loaded."],
  ["Solid Tours konnte nicht geladen werden.", "Solid Tours could not be loaded."],
  ["Die Aktion ist fehlgeschlagen.", "The action failed."],
  ["Gib der Tour einen Namen.", "Enter a name for the tour."],
  ["Die Tour braucht mindestens zwei Punkte.", "The tour needs at least two points."],
  ["Die Tour benötigt mindestens zwei gültige Punkte.", "The tour needs at least two valid points."],
  ["Die Tourdistanz muss größer als null sein.", "The tour distance must be greater than zero."],
  ["Wähle ein gültiges Abschlussdatum.", "Choose a valid completion date."],
  ["Wähle Zu Fuß oder Fahrrad aus.", "Choose Walking or Cycling."],
  ["Bitte gib ein gültiges Datum ein.", "Enter a valid date."],
  ["Restricted Publish ist für dieses Konto nicht verfügbar.", "Restricted publishing is not available for this account."],
  ["Setze zuerst den aktiven Szenariolauf zurück.", "Reset the active scenario run first."],
  ["Der Pod-Snapshot antwortete mit unerwarteten Resource-Adressen.", "The Pod snapshot returned unexpected resource addresses."],
  ["Der Katalog antwortete mit einer unerwarteten Dataset-Referenz.", "The catalog returned an unexpected dataset reference."],
  ["Veröffentlichung unvollständig; der Lauf bleibt für einen erneuten Reset erhalten.", "Publishing is incomplete; the run remains available for another reset."],
  ["Veröffentlichung fehlgeschlagen und wurde vollständig zurückgerollt.", "Publishing failed and was fully rolled back."],
  ["Diese Tour ist Teil der aktiven Gesundheitsdatenspende. Setze die Gesundheitsdatenspende zuerst zurück.", "This tour is part of the active health data donation. Reset the donation first."],
  ["Die Weiterleitung zum Solid Provider wurde nicht gestartet. Bitte versuche es erneut.", "The redirect to the Solid provider did not start. Please try again."],
  ["Die Datei enthält kein gültiges GeoJSON.", "The file does not contain valid GeoJSON."],
  ["GeoJSON muss mindestens eine LineString-Geometrie enthalten.", "GeoJSON must contain at least one LineString geometry."],
  ["Die GPX-Datei ist ungültig.", "The GPX file is invalid."],
  ["GPX enthält keinen nutzbaren Track.", "The GPX file does not contain a usable track."],
  ["Unterstützt werden GPX-, GeoJSON- und JSON-Dateien.", "Supported file types are GPX, GeoJSON and JSON."],
  ["Der gespeicherte Solid-Tours-Verlauf ist beschädigt.", "The saved Solid Tours history is corrupted."],
  ["Der Browserspeicher ist nicht verfügbar.", "Browser storage is unavailable."],
  ["Die Demo-WebID-Konfiguration ist ungültig.", "The demo WebID configuration is invalid."],
  ["Die authentifizierte Solid-WebID ist ungültig.", "The authenticated Solid WebID is invalid."],
  ["Der private Solid Pod ist für diese Aktion nicht verfügbar.", "The private Solid Pod is unavailable for this action."],
  ["Entferne die Tour vor dem Bearbeiten aus dem öffentlichen Routenkatalog.", "Remove the tour from the public route catalog before editing it."],
  ["Speichere oder verwirf zuerst die aktuellen Änderungen.", "Save or cancel the current changes first."],
  ["Speichere die Route, bevor du sie als gemacht markierst.", "Save the route before marking it as completed."],
  ["Die Routenvorlage wird gerade in einem anderen Tab aktualisiert.", "The route template is currently being updated in another tab."],
  ["Die Routenvorlage ist erst nach Abschluss der laufenden Katalogaktion wieder bearbeitbar.", "The route template can be edited again after the current catalog operation has finished."],
  ["Das unterbrochene Routenvorlagen-Update enthält keinen sicher wiederaufnehmbaren Zielstand.", "The interrupted route-template update does not contain a target state that can be resumed safely."],
  ["Das Routenvorlagen-Update wurde zwischenzeitlich übernommen.", "The route-template update was taken over in the meantime."],
  ["Das unterbrochene Routenvorlagen-Update konnte noch nicht abgeschlossen werden. Der gespeicherte Zielstand kann erneut fortgesetzt werden.", "The interrupted route-template update could not be completed yet. Its saved target state can be resumed again."],
  ["Das ältere unterbrochene Update kann nicht automatisch fortgesetzt werden. Die gespeicherte Katalogreferenz kann sicher entfernt werden.", "This older interrupted update cannot be resumed automatically. Its saved Catalog reference can be removed safely."],
  ["Der wiederaufgenommene Tourentwurf fehlt im Pod-Status.", "The resumed tour draft is missing from the Pod state."],
  ["Der private Tourentwurf wurde zwischenzeitlich verändert.", "The private tour draft changed in the meantime."],
  ["Die veröffentlichte Route konnte nicht vollständig aktualisiert werden. Deine Änderungen bleiben im Editor erhalten.", "The published route could not be updated completely. Your changes remain in the editor."],
  ["Die Route oder ihre Katalogveröffentlichung wurde zwischenzeitlich geändert. Der aktuelle Stand wurde neu geladen.", "The route or its catalog publication changed in the meantime. The latest state was loaded."],
  ["Der Pod liefert keinen starken Versionsnachweis für das Routenvorlagen-Update.", "The Pod did not provide a strong version identifier for the route-template update."],
  ["Die öffentliche Routenvorlage weicht vom gespeicherten privaten Stand ab.", "The public route template differs from the saved private state."],
  ["Die öffentliche Routenvorlage wurde zwischenzeitlich verändert.", "The public route template changed in the meantime."],
  ["Die öffentliche Routenvorlage entspricht nicht dem beabsichtigten Update.", "The public route template does not match the intended update."],
  ["Die öffentliche Routenvorlage wurde während der ACL-Prüfung verändert.", "The public route template changed during access verification."],
  ["Das Update der öffentlichen Routenvorlage konnte nicht eindeutig bestätigt werden.", "The public route-template update could not be confirmed unambiguously."],
  ["Der Katalog antwortete mit einer unerwarteten Routenvorlagen-Referenz.", "The catalog returned an unexpected route-template reference."],
  ["Das Routenvorlagen-Update wurde parallel verändert und konnte nicht abgeschlossen werden.", "The route-template update changed concurrently and could not be completed."],
  ["Das Routenvorlagen-Update konnte nicht atomar abgeschlossen werden.", "The route-template update could not be completed atomically."],
  ["Die Tour wurde zwischenzeitlich im öffentlichen Routenkatalog veröffentlicht. Entferne sie dort zuerst.", "The tour was published in the public route catalog in the meantime. Remove it there first."],
  ["Eine aus dem Routenkatalog übernommene Tour kann nicht erneut katalogisiert werden.", "A route adopted from the route catalog cannot be cataloged again."],
  ["Die öffentliche Research-Registry ist ungültig.", "The public research registry is invalid."],
  ["Der Onboarding-Zeitpunkt ist ungültig.", "The onboarding timestamp is invalid."],
  ["Die öffentliche Research-Registry konnte nicht sicher eingerichtet werden.", "The public research registry could not be set up safely."],
  ["Vervollständige zuerst deinen Publisher-Namen und deine Kontakt-E-Mail im Profile Manager oder im allgemeinen Dataspace-Onboarding.", "Complete your publisher name and contact email in Profile Manager or the general Dataspace onboarding first."],
  ["Publisher-Name und Kontakt-E-Mail müssen für öffentliche Katalogeinträge angegeben werden.", "A publisher name and contact email are required for public Catalog entries."],
  ["Der öffentliche Publisher-Name ist ungültig.", "The public publisher name is invalid."],
  ["Die öffentliche Kontakt-E-Mail ist ungültig.", "The public contact email is invalid."],
  ["Die öffentlichen Profilmetadaten konnten nicht verifiziert werden.", "The public profile metadata could not be verified."],
  ["Für öffentliche Katalogeinträge müssen im Solid-Profil ein Publisher-Name und eine Kontakt-E-Mail hinterlegt sein.", "A publisher name and contact email must be present in the Solid profile for public Catalog entries."],
  ["Schließe zuerst das allgemeine Dataspace-Onboarding ab, damit eine öffentliche Research-Registry und eine öffentliche Append-only-Solid-Inbox eingerichtet sind.", "Complete the general Dataspace onboarding first so that a public research registry and a public append-only Solid Inbox are configured."],
  ["Die Solid-Inbox-ACL ist nicht mit Control-Zugriff erreichbar.", "The Solid Inbox ACL is not reachable with Control access."],
  ["Die Solid-Inbox besitzt keine verifizierte öffentliche Append-only-ACL.", "The Solid Inbox does not have a verified public append-only ACL."],
  ["Die Solid-Inbox konnte nicht im Solid-Profil verifiziert werden.", "The Solid Inbox could not be verified in the Solid profile."],
  ["Einige Einträge des öffentlichen Routenkatalogs konnten nicht sicher geladen werden.", "Some entries in the public route catalog could not be loaded safely."],
  ["Für die Gesundheitsdatenspende muss im Solid-Profil eine öffentliche Dataspace-Registry konfiguriert sein.", "A public Dataspace registry must be configured in the Solid profile before sharing a health data donation."],
  ["Die Solid-Inbox konnte nicht aufgelöst werden.", "The Solid Inbox could not be resolved."],
  ["Die ACL des Szenario-Snapshots ist nicht zugänglich.", "The scenario snapshot ACL is not accessible."],
  ["Die Resource-ACL ist nicht ausschließlich für den Owner freigegeben.", "The resource ACL does not grant access exclusively to the owner."],
  ["Die Resource-ACL enthält weiterhin Gruppenrechte.", "The resource ACL still contains group permissions."],
  ["Die Resource-ACL enthält weiterhin öffentliche Rechte.", "The resource ACL still contains public permissions."],
  ["Die Resource-ACL ist nicht mit Control-Zugriff erreichbar.", "The resource ACL is not accessible with Control permission."],
  ["Die Owner-WebID ist ungültig.", "The owner WebID is invalid."],
  ["Der Solid-Tours-Status hat ein ungültiges oder unbekanntes Format.", "The Solid Tours state has an invalid or unknown format."],
  ["Der gespeicherte Solid-Tours-Status darf keinen veröffentlichten Szenariolauf enthalten.", "The saved Solid Tours state must not contain a published scenario run."],
]);

const germanMessagePattern = /(?:\b(?:Die|Der|Das|Ein|Eine|Bitte|Wähle|Setze|Gib|Für|Veröffentlichung|Löschen|Interessen|Szenariolauf|Aktivität|Tourentwurf|Anmeldung|Unsichere|enthaltene)\b|[äöüßÄÖÜ]|\b(?:konnte|nicht|ungültig|geändert|gelöscht|zurückgesetzt|vorhanden|fehlgeschlagen)\b)/;

export function localizeUserFacingMessage(
  message: string | null | undefined,
  language: ToursLanguage
): string | null {
  if (!message) return null;
  if (language === "de") {
    if (germanMessagePattern.test(message)) return message;
    return "Die Aktion ist fehlgeschlagen.";
  }

  const exact = germanToEnglishErrors.get(message);
  if (exact) return exact;

  const invalidGermanDate = /^Ungültiges Datum\. Erwartet wird (.+) mit einem existierenden Kalenderdatum\.$/.exec(message);
  if (invalidGermanDate) return `Invalid date. Enter an existing calendar date in ${invalidGermanDate[1]} format.`;

  const statusTranslations: Array<[RegExp, string]> = [
    [/^Solid-Tours-Status konnte nicht geladen werden \((\d+)\)\.$/, "The Solid Tours state could not be loaded ($1)."],
    [/^Die private Aktivität konnte nicht (geladen|gelöscht|geprüft) werden \((\d+)\)\.$/, "The private activity request failed ($2)."],
    [/^Die Resource konnte nicht geprüft werden \((\d+)\)\.$/, "The resource could not be verified ($1)."],
    [/^Die Resource-ACL konnte nicht geprüft werden \((\d+)\)\.$/, "The resource ACL could not be verified ($1)."],
  ];
  for (const [pattern, replacement] of statusTranslations) {
    if (pattern.test(message)) return message.replace(pattern, replacement);
  }

  return germanMessagePattern.test(message) ? "The action could not be completed safely. Please try again." : message;
}
