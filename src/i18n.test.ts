import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TOURS_LANGUAGE,
  localizeUserFacingMessage,
  normalizeToursLanguage,
  publishToursLanguage,
  readStoredToursLanguage,
  translate,
  TOURS_LANGUAGE_EVENT,
  TOURS_LANGUAGE_STORAGE_KEY,
  writeStoredToursLanguage,
} from "./i18n";

describe("City Tours language contract", () => {
  afterEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("defaults to English and normalizes regional language values", () => {
    expect(DEFAULT_TOURS_LANGUAGE).toBe("en");
    expect(normalizeToursLanguage(null)).toBe("en");
    expect(normalizeToursLanguage("en_GB")).toBe("en");
    expect(normalizeToursLanguage("de-DE")).toBe("de");
  });

  it("uses URL language before the shared Dataspace storage preference", () => {
    window.localStorage.setItem(TOURS_LANGUAGE_STORAGE_KEY, "de");
    window.history.replaceState({}, "", "/city-tours/?language=en-GB");

    expect(readStoredToursLanguage()).toBe("en");
  });

  it("persists standalone changes under the shared Dataspace key", () => {
    const listener = vi.fn();
    window.addEventListener(TOURS_LANGUAGE_EVENT, listener);
    writeStoredToursLanguage("de");

    expect(window.localStorage.getItem("solid-dataspace.language")).toBe("de");
    expect(readStoredToursLanguage()).toBe("de");
    expect(listener).not.toHaveBeenCalled();

    publishToursLanguage("en");
    expect(listener).toHaveBeenCalledOnce();
    expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({ language: "en" });
    window.removeEventListener(TOURS_LANGUAGE_EVENT, listener);
  });

  it("localizes known UI errors without exposing German copy in English", () => {
    expect(
      localizeUserFacingMessage("Die Tour braucht mindestens zwei Punkte.", "en")
    ).toBe("The tour needs at least two points.");
    expect(
      localizeUserFacingMessage("Die Tour braucht mindestens zwei Punkte.", "de")
    ).toBe("Die Tour braucht mindestens zwei Punkte.");
    expect(
      localizeUserFacingMessage(
        "Unsichere enthaltene Resource-URL in https://pod.example/container/.",
        "en"
      )
    ).toBe("The action could not be completed safely. Please try again.");
    expect(
      localizeUserFacingMessage(
        "Das unterbrochene Routenvorlagen-Update konnte noch nicht abgeschlossen werden. Der gespeicherte Zielstand kann erneut fortgesetzt werden.",
        "en"
      )
    ).toBe(
      "The interrupted route-template update could not be completed yet. Its saved target state can be resumed again."
    );
    expect(
      localizeUserFacingMessage(
        "Die Routenvorlage ist erst nach Abschluss der laufenden Katalogaktion wieder bearbeitbar.",
        "en"
      )
    ).toBe(
      "The route template can be edited again after the current catalog operation has finished."
    );
    expect(
      localizeUserFacingMessage(
        "Eine aus dem Routenkatalog übernommene Tour kann nicht erneut katalogisiert werden.",
        "en"
      )
    ).toBe("A route adopted from the route catalog cannot be cataloged again.");
  });

  it("discloses all public Catalog identity metadata before route publication", () => {
    const english = translate("en", "indexRoutesQuestion", { count: 3 });
    expect(english).toContain("route name");
    expect(english).toContain("publisher name");
    expect(english).toContain("WebID as creator");
    expect(english).toContain("contact email");

    const german = translate("de", "indexRoutesQuestion", { count: 3 });
    expect(german).toContain("Tourname");
    expect(german).toContain("Publisher-Namen");
    expect(german).toContain("WebID als Creator");
    expect(german).toContain("Kontakt-E-Mail");
  });
});
