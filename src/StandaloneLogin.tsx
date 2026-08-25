import { FormEvent, useId, useMemo, useState } from "react";
import "./StandaloneLogin.css";
import FontAwesomeIcon from "./FontAwesomeIcon";
import LanguageToggle from "./LanguageToggle";
import LoginParticleCloud from "./LoginParticleCloud";
import {
  DEFAULT_TOURS_LANGUAGE,
  localizeUserFacingMessage,
  translate,
  type ToursLanguage,
} from "./i18n";

export interface SolidToursLoginProps {
  onLogin: (issuer: string) => void | Promise<void>;
  defaultIssuer?: string;
  busy?: boolean;
  error?: string | null;
  language?: ToursLanguage;
  onLanguageChange?: (language: ToursLanguage) => void;
}

interface Provider {
  label: string;
  url: string;
}

export const SOLID_TOURS_PROVIDERS: readonly Provider[] = [
  {
    label: "TMDT Solid",
    url: "https://solid-community-server.tmdt.info",
  },
  {
    label: "Solid Community",
    url: "https://solidcommunity.net",
  },
] as const;

/**
 * Accept an HTTP(S) Solid issuer while rejecting credentials, fragments and
 * query strings. HTTP remains available for local development providers.
 */
export function normalizeSolidIssuer(value: string): string | null {
  const candidate = value.trim();
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    const localHttp =
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]");
    if (
      (url.protocol !== "https:" && !localHttp) ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return null;
    }

    return url.href.replace(/\/$/, "");
  } catch {
    return null;
  }
}

export default function StandaloneLogin({
  onLogin,
  defaultIssuer = SOLID_TOURS_PROVIDERS[0].url,
  busy = false,
  error = null,
  language = DEFAULT_TOURS_LANGUAGE,
  onLanguageChange,
}: SolidToursLoginProps) {
  const defaultProvider = SOLID_TOURS_PROVIDERS.some((provider) => provider.url === defaultIssuer)
    ? defaultIssuer
    : SOLID_TOURS_PROVIDERS[0].url;
  const [selectedIssuer, setSelectedIssuer] = useState(defaultProvider);
  const [customIssuer, setCustomIssuer] = useState(
    defaultIssuer !== defaultProvider ? defaultIssuer : ""
  );
  const customInputId = useId();
  const customValue = customIssuer.trim();
  const normalizedCustomIssuer = useMemo(
    () => (customValue ? normalizeSolidIssuer(customValue) : null),
    [customValue]
  );
  const customIsInvalid = customValue.length > 0 && !normalizedCustomIssuer;
  const issuerToLogin = customValue ? normalizedCustomIssuer : selectedIssuer;
  const visibleError = localizeUserFacingMessage(error, language);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!issuerToLogin || busy) return;
    void onLogin(issuerToLogin);
  };

  return (
    <main className="solid-tours-login">
      <div className="solid-tours-login__stage">
        <section className="solid-tours-login__shell" aria-labelledby="solid-tours-login-title">
          <header className="solid-tours-login__hero">
            <div className="solid-tours-login__hero-left">
              <span className="solid-tours-login__brand-icon" aria-hidden="true">
                <FontAwesomeIcon icon="route" />
              </span>
              <h1 id="solid-tours-login-title" className="solid-tours-login__title">Solid Tours</h1>
            </div>
          </header>

          <LoginParticleCloud label="Solid Tours" />

          <form className="solid-tours-login__card" onSubmit={submit} noValidate>
          <fieldset className="solid-tours-login__fieldset" disabled={busy}>
            <legend className="solid-tours-login__legend">{translate(language, "suggestedProviders")}</legend>
            <div className="solid-tours-login__providers">
              {SOLID_TOURS_PROVIDERS.map((provider) => {
                const active = !customValue && selectedIssuer === provider.url;
                return (
                  <button
                    key={provider.url}
                    className={`solid-tours-login__provider${active ? " solid-tours-login__provider--active" : ""}`}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setSelectedIssuer(provider.url);
                      setCustomIssuer("");
                    }}
                  >
                    <span className="solid-tours-login__radio" aria-hidden="true" />
                    <span className="solid-tours-login__provider-copy">
                      <strong>{provider.label}</strong>
                      <span>{provider.url}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="solid-tours-login__custom">
            <label className="solid-tours-login__label" htmlFor={customInputId}>
              {translate(language, "customIssuer")}
            </label>
            <div className="solid-tours-login__input-wrap">
              <input
                id={customInputId}
                className={`solid-tours-login__input${customIsInvalid ? " solid-tours-login__input--invalid" : ""}`}
                type="url"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder={translate(language, "customIssuerPlaceholder")}
                value={customIssuer}
                disabled={busy}
                aria-invalid={customIsInvalid}
                aria-describedby={customIsInvalid ? `${customInputId}-error` : undefined}
                onChange={(event) => setCustomIssuer(event.target.value)}
              />
              {customValue && (
                <button
                  className="solid-tours-login__clear"
                  type="button"
                  aria-label={translate(language, "clearCustomIssuer")}
                  title={translate(language, "returnToProviders")}
                  disabled={busy}
                  onClick={() => setCustomIssuer("")}
                >
                  ×
                </button>
              )}
            </div>
            {customIsInvalid && (
              <p id={`${customInputId}-error`} className="solid-tours-login__validation" role="alert">
                {translate(language, "invalidIssuer")}
              </p>
            )}
          </div>

          {visibleError && (
            <div className="solid-tours-login__error" role="alert">
              <span aria-hidden="true">!</span>
              <p>{visibleError}</p>
            </div>
          )}

          <footer className="solid-tours-login__actions">
            {onLanguageChange && (
              <div className="solid-tours-login__language">
                <LanguageToggle language={language} onChange={onLanguageChange} />
              </div>
            )}
            <button
              className="solid-tours-login__submit"
              type="submit"
              disabled={!issuerToLogin || busy}
            >
              <FontAwesomeIcon icon="right-from-bracket" />
              {busy ? translate(language, "redirecting") : translate(language, "login")}
            </button>
          </footer>
          </form>
        </section>
      </div>
    </main>
  );
}
