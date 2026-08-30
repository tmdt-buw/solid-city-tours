import { useMemo, useState } from "react";
import FontAwesomeIcon from "./FontAwesomeIcon";
import type { ToursLanguage } from "./i18n";
import type { SolidToursOnboardingContext } from "./appOnboarding";
import type { PublicRegistryOption } from "./catalog";
import "./SolidToursOnboarding.css";

type AppOnboardingProps = {
  context: SolidToursOnboardingContext;
  language: ToursLanguage;
  podRoot: string;
  registryOptions: PublicRegistryOption[];
  configuredPublicRegistries: string[];
  infrastructureReady: boolean;
  profileReady: boolean;
  profilePublisher: string;
  profileContactEmail: string;
  busy: boolean;
  onComplete: (setup: {
    registryUrl?: string;
    publisher?: string;
    contactEmail?: string;
  }) => void;
  onLogout?: () => void;
};

const copy = {
  en: {
    eyebrow: "SOLID TOURS SETUP",
    title: "Your tours, under your control",
    intro: "Before Solid Tours creates its private app space, choose how the app may work with your Pod.",
    privateTitle: "Private tour space",
    privateText: "Create owner-only folders for drafts, completed tours and app settings.",
    derivedTitle: "Derived activity values",
    derivedText: "Distance, time, pace and steps are calculated from the route. They are not sensor measurements.",
    inboxTitle: "Solid Inbox for access requests",
    inboxText: "Create or repair the Pod's inbox/ container and link it from your WebID profile. Anyone may append access requests, while public read, write and control remain disabled.",
    registryTitle: "Public research registry",
    registryText: "Switch your Solid profile to research mode, add the selected public registry, register your WebID there and prepare publicly readable Catalog resources. This makes your public Catalog entries discoverable.",
    catalogTitle: "Public route catalog",
    catalogText: "Only routes you explicitly index become public templates. The route name is published as the public Catalog title; exact coordinates, start and destination can then be copied by others. Public Catalog metadata also includes your publisher name, your WebID as creator and, when available in your Solid profile, your contact email.",
    donationTitle: "Health data donation",
    donationText: "A donation is a separate restricted snapshot. Environmental Monitoring must request read access. Its public Catalog metadata includes your publisher name, your WebID as creator and, when available in your Solid profile, your contact email. Public aggregates appear from two distinct WebIDs.",
    standaloneTitle: "Independent app setup",
    standaloneText: "Solid Tours performs these app-specific Pod changes itself. You do not need to complete the Dataspace Manager onboarding first.",
    registryChoice: "Public registry for Solid Tours",
    profileTitle: "Public Catalog identity",
    profileText: "After your confirmation, Solid Tours stores these values in your own WebID profile. They are published as the publisher and contact metadata of your public Catalog entries.",
    publisherLabel: "Publisher name",
    contactEmailLabel: "Contact email",
    profileRequired: "Enter a publisher name and a valid contact email.",
    profileManagerRequired: "Complete your publisher name and contact email in Profile Manager before setting up the embedded app.",
    configured: "Already configured",
    noRegistry: "No approved public research registry is available. Solid Tours cannot complete its public setup.",
    generalOnboardingRequired: "Complete the general Dataspace onboarding before setting up the embedded app.",
    confirm: "Set up Solid Tours",
    logout: "Log out",
    destination: "Private app location",
    required: "Select every acknowledgement to continue.",
  },
  de: {
    eyebrow: "SOLID TOURS EINRICHTUNG",
    title: "Deine Touren, unter deiner Kontrolle",
    intro: "Bevor Solid Tours seinen privaten App-Bereich anlegt, legst du fest, wie die App mit deinem Pod arbeiten darf.",
    privateTitle: "Privater Tourbereich",
    privateText: "Owner-only Ordner für Entwürfe, gemachte Touren und App-Einstellungen anlegen.",
    derivedTitle: "Abgeleitete Aktivitätswerte",
    derivedText: "Distanz, Zeit, Tempo und Schritte werden aus der Route berechnet. Es sind keine Sensormesswerte.",
    inboxTitle: "Solid-Inbox für Zugriffsanfragen",
    inboxText: "Den Container inbox/ im Pod anlegen oder reparieren und im WebID-Profil verlinken. Jeder darf Zugriffsanfragen anhängen; öffentliches Lesen, Schreiben und Control bleiben deaktiviert.",
    registryTitle: "Öffentliche Forschungs-Registry",
    registryText: "Das Solid-Profil in den Research-Modus schalten, die gewählte öffentliche Registry ergänzen, deine WebID dort registrieren und öffentlich lesbare Katalogressourcen vorbereiten. Dadurch werden deine öffentlichen Katalogeinträge auffindbar.",
    catalogTitle: "Öffentlicher Routenkatalog",
    catalogText: "Nur ausdrücklich von dir indizierte Routen werden öffentliche Vorlagen. Der Tourname wird als öffentlicher Katalogtitel veröffentlicht; exakte Koordinaten, Start und Ziel können dann von anderen kopiert werden. Die öffentlichen Katalogmetadaten enthalten außerdem deinen Publisher-Namen, deine WebID als Creator und, sofern im Solid-Profil vorhanden, deine Kontakt-E-Mail.",
    donationTitle: "Gesundheitsdatenspende",
    donationText: "Eine Spende ist ein separater Restricted Snapshot. Environmental Monitoring muss Lesezugriff anfragen. Die öffentlichen Katalogmetadaten enthalten deinen Publisher-Namen, deine WebID als Creator und, sofern im Solid-Profil vorhanden, deine Kontakt-E-Mail. Öffentliche Aggregate erscheinen ab zwei unterschiedlichen WebIDs.",
    standaloneTitle: "Eigenständige App-Einrichtung",
    standaloneText: "Solid Tours führt diese app-spezifischen Pod-Änderungen selbst aus. Du musst das Onboarding im Dataspace Manager dafür nicht zuerst abschließen.",
    registryChoice: "Öffentliche Registry für Solid Tours",
    profileTitle: "Öffentliche Katalogidentität",
    profileText: "Nach deiner Bestätigung speichert Solid Tours diese Werte in deinem eigenen WebID-Profil. Sie werden als Publisher- und Kontaktmetadaten deiner öffentlichen Katalogeinträge veröffentlicht.",
    publisherLabel: "Publisher-Name",
    contactEmailLabel: "Kontakt-E-Mail",
    profileRequired: "Gib einen Publisher-Namen und eine gültige Kontakt-E-Mail ein.",
    profileManagerRequired: "Vervollständige vor der Einrichtung der eingebetteten App deinen Publisher-Namen und deine Kontakt-E-Mail im Profile Manager.",
    configured: "Bereits konfiguriert",
    noRegistry: "Es ist keine freigegebene öffentliche Forschungs-Registry verfügbar. Solid Tours kann seine öffentliche Einrichtung nicht abschließen.",
    generalOnboardingRequired: "Schließe vor der Einrichtung der eingebetteten App das allgemeine Dataspace-Onboarding ab.",
    confirm: "Solid Tours einrichten",
    logout: "Abmelden",
    destination: "Privater App-Speicherort",
    required: "Bestätige alle Hinweise, um fortzufahren.",
  },
} as const;

export default function AppOnboarding({
  context,
  language,
  podRoot,
  registryOptions,
  configuredPublicRegistries,
  infrastructureReady,
  profileReady,
  profilePublisher,
  profileContactEmail,
  busy,
  onComplete,
  onLogout,
}: AppOnboardingProps) {
  const c = copy[language];
  const items = useMemo(
    () => [
      { key: "private", icon: "route" as const, title: c.privateTitle, text: c.privateText },
      { key: "derived", icon: "person-walking" as const, title: c.derivedTitle, text: c.derivedText },
      ...(context === "standalone"
        ? [
            { key: "inbox", icon: "route" as const, title: c.inboxTitle, text: c.inboxText },
            { key: "registry", icon: "route" as const, title: c.registryTitle, text: c.registryText },
          ]
        : []),
      { key: "catalog", icon: "route" as const, title: c.catalogTitle, text: c.catalogText },
      { key: "donation", icon: "bicycle" as const, title: c.donationTitle, text: c.donationText },
      ...(context === "standalone"
        ? [{ key: "dataspace", icon: "route" as const, title: c.standaloneTitle, text: c.standaloneText }]
        : []),
    ],
    [c, context]
  );
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const initiallyConfiguredRegistry = registryOptions.find((option) =>
    configuredPublicRegistries.includes(option.url)
  )?.url;
  const [selectedRegistry, setSelectedRegistry] = useState(
    initiallyConfiguredRegistry || ""
  );
  const [publisher, setPublisher] = useState(profilePublisher);
  const [contactEmail, setContactEmail] = useState(profileContactEmail);
  const normalizedPublisher = publisher.trim();
  const normalizedEmail = contactEmail.trim();
  const validPublisher = normalizedPublisher.length > 0 && normalizedPublisher.length <= 160 && !/[\u0000-\u001f\u007f]/.test(normalizedPublisher);
  const validEmail = normalizedEmail.length <= 254 && /^[^\s@:]+@[^\s@:]+\.[^\s@:]+$/.test(normalizedEmail);
  const complete =
    items.every((item) => accepted[item.key]) &&
    (context === "embedded" || Boolean(selectedRegistry)) &&
    (context === "embedded" ? infrastructureReady && profileReady : validPublisher && validEmail);

  return (
    <section className={`tours-onboarding tours-onboarding--${context}`} aria-labelledby="tours-onboarding-title">
      <header className="tours-onboarding__header">
        <span className="tours-onboarding__mark" aria-hidden="true"><FontAwesomeIcon icon="route" /></span>
        <div>
          <span className="tours-onboarding__eyebrow">{c.eyebrow}</span>
          <h1 id="tours-onboarding-title">{c.title}</h1>
          <p>{c.intro}</p>
        </div>
      </header>

      <div className="tours-onboarding__destination">
        <span>{c.destination}</span>
        <code>{`${podRoot}solid-tours/`}</code>
      </div>

      <div className="tours-onboarding__checks">
        {items.map((item, index) => (
          <label className={`tours-onboarding__check${accepted[item.key] ? " is-checked" : ""}`} key={item.key}>
            <input
              type="checkbox"
              checked={Boolean(accepted[item.key])}
              disabled={busy}
              onChange={(event) => setAccepted((current) => ({ ...current, [item.key]: event.target.checked }))}
            />
            <span className="tours-onboarding__check-icon" aria-hidden="true"><FontAwesomeIcon icon={item.icon} /></span>
            <span className="tours-onboarding__check-copy">
              <strong><span>{String(index + 1).padStart(2, "0")}</span>{item.title}</strong>
              <small>{item.text}</small>
            </span>
          </label>
        ))}
      </div>

      {context === "standalone" && (
        <fieldset className="tours-onboarding__profile-fields">
          <legend>{c.profileTitle}</legend>
          <p>{c.profileText}</p>
          <label>
            <span>{c.publisherLabel}</span>
            <input type="text" name="solid-tours-publisher" autoComplete="name" maxLength={160} required disabled={busy} value={publisher} onChange={(event) => setPublisher(event.target.value)} />
          </label>
          <label>
            <span>{c.contactEmailLabel}</span>
            <input type="email" name="solid-tours-contact-email" autoComplete="email" maxLength={254} required disabled={busy} value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} />
          </label>
          {(!validPublisher || !validEmail) && <p role="alert">{c.profileRequired}</p>}
        </fieldset>
      )}

      {context === "standalone" && (
        <fieldset className="tours-onboarding__registry-options">
          <legend>{c.registryChoice}</legend>
          {registryOptions.length > 0 ? (
            registryOptions.map((option) => (
              <label
                className={`tours-onboarding__registry-option${
                  selectedRegistry === option.url ? " is-selected" : ""
                }`}
                key={option.url}
              >
                <input
                  type="radio"
                  name="solid-tours-public-registry"
                  value={option.url}
                  checked={selectedRegistry === option.url}
                  disabled={busy}
                  onChange={() => setSelectedRegistry(option.url)}
                />
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.url}</small>
                </span>
                {configuredPublicRegistries.includes(option.url) && (
                  <em>{c.configured}</em>
                )}
              </label>
            ))
          ) : (
            <p role="alert">{c.noRegistry}</p>
          )}
        </fieldset>
      )}

      <footer className="tours-onboarding__actions">
        <p aria-live="polite">
          {context === "embedded" && !profileReady
            ? c.profileManagerRequired
            : !infrastructureReady && context === "embedded"
              ? c.generalOnboardingRequired
            : complete
              ? ""
              : c.required}
        </p>
        <div>
          {onLogout && <button type="button" className="ghost" disabled={busy} onClick={onLogout}>{c.logout}</button>}
          <button
            type="button"
            className="primary"
            disabled={busy || !complete}
            onClick={() =>
              onComplete(
                context === "standalone"
                  ? { registryUrl: selectedRegistry, publisher: normalizedPublisher, contactEmail: normalizedEmail }
                  : {}
              )
            }
          >
            {c.confirm}
          </button>
        </div>
      </footer>
    </section>
  );
}
