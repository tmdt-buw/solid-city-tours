import { act, createElement } from "react";
import { createRoot, Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StandaloneLogin, {
  normalizeSolidIssuer,
  CITY_TOURS_PROVIDERS,
} from "./StandaloneLogin";
import type { ToursLanguage } from "./i18n";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function enterValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("StandaloneLogin", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function renderLogin(
    onLogin = vi.fn(),
    options: {
      busy?: boolean;
      error?: string;
      defaultIssuer?: string;
      language?: ToursLanguage;
    } = {}
  ) {
    act(() => {
      root.render(
        // Avoid JSX so the test remains covered by the repository's *.test.ts pattern.
        createElement(StandaloneLogin, {
          onLogin,
          busy: options.busy,
          error: options.error,
          defaultIssuer: options.defaultIssuer,
          language: options.language || "de",
          onLanguageChange: vi.fn(),
        })
      );
    });
    return onLogin;
  }

  it("uses the recommended TMDT provider by default", () => {
    const onLogin = renderLogin();
    const submit = container.querySelector<HTMLButtonElement>(".city-tours-login__submit")!;

    act(() => submit.click());

    expect(onLogin).toHaveBeenCalledWith(CITY_TOURS_PROVIDERS[0].url);
    expect(container.querySelector("[aria-pressed='true']")?.textContent).toContain(
      "TMDT Solid"
    );
  });

  it("matches the catalog login copy without account or demo explanations", () => {
    renderLogin();

    expect(container.querySelector(".city-tours-login__title")?.textContent).toBe(
      "City Tours"
    );
    expect(container.textContent).not.toContain("Alle Solid-Konten");
    expect(container.textContent).not.toContain("Urban Data Explorer");
    expect(container.textContent).not.toContain("Demo-Konto");
    const languageControl = container.querySelector(
      ".city-tours-login__actions .city-tours-login__language .language-toggle"
    );
    expect(languageControl).not.toBeNull();
    expect(languageControl?.closest(".city-tours-login__actions")).not.toBeNull();
    expect(container.querySelector(".city-tours-login__hero .city-tours-login__language")).toBeNull();
    expect(
      container.querySelector(".city-tours-login > .city-tours-login__language")
    ).toBeNull();
    expect(languageControl?.parentElement?.nextElementSibling).toBe(
      container.querySelector(".city-tours-login__submit")
    );
    const loginIcon = container.querySelector(
      ".city-tours-login__submit .fa-right-from-bracket"
    );
    expect(loginIcon).not.toBeNull();
    expect(loginIcon?.tagName.toLowerCase()).toBe("svg");
    expect(container.querySelector(".city-tours-login i.fa-solid")).toBeNull();
  });

  it("disables login and announces an invalid custom issuer", () => {
    renderLogin();
    const input = container.querySelector<HTMLInputElement>("input[type='url']")!;

    act(() => {
      enterValue(input, "kein-issuer");
    });

    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(container.querySelector(".city-tours-login__validation")?.getAttribute("role")).toBe(
      "alert"
    );
    expect(container.querySelector<HTMLButtonElement>(".city-tours-login__submit")?.disabled).toBe(
      true
    );
  });

  it("normalizes and submits a valid custom issuer", () => {
    const onLogin = renderLogin();
    const input = container.querySelector<HTMLInputElement>("input[type='url']")!;

    act(() => {
      enterValue(input, " https://pods.example/ ");
    });
    act(() => container.querySelector<HTMLButtonElement>(".city-tours-login__submit")!.click());

    expect(onLogin).toHaveBeenCalledWith("https://pods.example");
  });

  it("shows errors and prevents interaction while a login is pending", () => {
    renderLogin(vi.fn(), { busy: true, error: "Anmeldung fehlgeschlagen" });

    expect(container.querySelector("[role='alert']")?.textContent).toContain(
      "Anmeldung fehlgeschlagen"
    );
    expect(container.querySelector<HTMLButtonElement>(".city-tours-login__submit")?.disabled).toBe(
      true
    );
    expect(container.querySelector<HTMLButtonElement>(".city-tours-login__submit")?.textContent).toContain(
      "Weiterleitung"
    );
  });
});

describe("normalizeSolidIssuer", () => {
  it("accepts HTTPS and local HTTP issuers", () => {
    expect(normalizeSolidIssuer("https://solid.example/issuer/")).toBe(
      "https://solid.example/issuer"
    );
    expect(normalizeSolidIssuer("http://localhost:3000/")).toBe("http://localhost:3000");
  });

  it("rejects unsupported or ambiguous addresses", () => {
    expect(normalizeSolidIssuer("solid.example")).toBeNull();
    expect(normalizeSolidIssuer("ftp://solid.example")).toBeNull();
    expect(normalizeSolidIssuer("http://solid.example")).toBeNull();
    expect(normalizeSolidIssuer("https://user:secret@solid.example")).toBeNull();
    expect(normalizeSolidIssuer("https://solid.example?issuer=other")).toBeNull();
    expect(normalizeSolidIssuer("https://solid.example/#fragment")).toBeNull();
  });
});
