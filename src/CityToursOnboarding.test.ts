import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CityToursOnboarding from "./CityToursOnboarding";
import type { ToursLanguage } from "./i18n";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

describe("CityToursOnboarding public metadata disclosure", () => {
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

  const renderOnboarding = (
    language: ToursLanguage,
    context: "embedded" | "standalone" = "embedded",
    infrastructureReady = true,
    profileReady = true,
    profilePublisher = "Hannah Mueller",
    profileContactEmail = "hannah@example.org"
  ) => {
    const onComplete = vi.fn();
    act(() => {
      root.render(
        createElement(CityToursOnboarding, {
          context,
          language,
          podRoot: "https://pod.example/alice/",
          registryOptions: [
            {
              id: "research",
              label: "Research registry",
              url: "https://registry.example/research",
            },
          ],
          configuredPublicRegistries: [],
          infrastructureReady,
          profileReady,
          profilePublisher,
          profileContactEmail,
          busy: false,
          onComplete,
        })
      );
    });
    return onComplete;
  };

  it("names publisher, creator WebID, and optional contact email in English", () => {
    renderOnboarding("en");

    const catalogItem = [...container.querySelectorAll(".tours-onboarding__check")].find(
      (item) => item.textContent?.includes("Public route catalog")
    );
    expect(catalogItem?.textContent).toContain("route name");
    expect(catalogItem?.textContent).toContain("publisher name");
    expect(catalogItem?.textContent).toContain("WebID as creator");
    expect(catalogItem?.textContent).toContain("contact email");

    const donationItem = [...container.querySelectorAll(".tours-onboarding__check")].find(
      (item) => item.textContent?.includes("Health data donation")
    );
    expect(donationItem?.textContent).toContain("public Catalog metadata");
    expect(donationItem?.textContent).toContain("WebID as creator");
    expect(donationItem?.textContent).toContain("contact email");
    expect(donationItem?.textContent).toContain("only contribution");
    expect(donationItem?.textContent).toContain("route can still be identifying");
  });

  it("names Publisher, Creator-WebID, and optional contact email in German", () => {
    renderOnboarding("de");

    const catalogItem = [...container.querySelectorAll(".tours-onboarding__check")].find(
      (item) => item.textContent?.includes("Öffentlicher Routenkatalog")
    );
    expect(catalogItem?.textContent).toContain("Tourname");
    expect(catalogItem?.textContent).toContain("Publisher-Namen");
    expect(catalogItem?.textContent).toContain("WebID als Creator");
    expect(catalogItem?.textContent).toContain("Kontakt-E-Mail");

    const donationItem = [...container.querySelectorAll(".tours-onboarding__check")].find(
      (item) => item.textContent?.includes("Gesundheitsdatenspende")
    );
    expect(donationItem?.textContent).toContain("öffentlichen Katalogmetadaten");
    expect(donationItem?.textContent).toContain("WebID als Creator");
    expect(donationItem?.textContent).toContain("Kontakt-E-Mail");
    expect(donationItem?.textContent).toContain("einzige Beitrag");
    expect(donationItem?.textContent).toContain("identifizierbar");
  });

  it("keeps embedded onboarding strictly app-specific", () => {
    const onComplete = renderOnboarding("en", "embedded");

    expect(container.textContent).toContain("Private tour space");
    expect(container.textContent).toContain("Derived activity values");
    expect(container.textContent).toContain("Public route catalog");
    expect(container.textContent).toContain("Health data donation");
    expect(container.textContent).not.toContain("Solid Inbox for access requests");
    expect(container.textContent).not.toContain("Public research registry");
    expect(container.textContent).not.toContain("Independent app setup");
    expect(container.textContent).not.toContain("Public Catalog identity");
    expect(container.querySelector('input[name="city-tours-publisher"]')).toBeNull();
    expect(container.querySelector('input[type="radio"]')).toBeNull();

    const submit = container.querySelector<HTMLButtonElement>("button.primary")!;
    act(() => {
      container
        .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
        .forEach((checkbox) => checkbox.click());
    });
    expect(submit.disabled).toBe(false);
    act(() => submit.click());
    expect(onComplete).toHaveBeenCalledWith({});
  });

  it("keeps standalone setup self-contained and explicitly selects infrastructure", () => {
    const onComplete = renderOnboarding("en", "standalone");

    expect(container.textContent).toContain("Solid Inbox for access requests");
    expect(container.textContent).toContain("Anyone may append access requests");
    expect(container.textContent).toContain("public read, write and control remain disabled");
    expect(container.textContent).toContain("Public research registry");
    expect(container.textContent).toContain("register your WebID there");
    expect(container.textContent).toContain("You do not need to complete the Dataspace Manager onboarding first");
    expect(container.textContent).toContain("Public Catalog identity");
    expect(container.querySelector<HTMLInputElement>('input[name="city-tours-publisher"]')?.value).toBe("Hannah Mueller");
    expect(container.querySelector<HTMLInputElement>('input[name="city-tours-contact-email"]')?.value).toBe("hannah@example.org");

    const submit = container.querySelector<HTMLButtonElement>("button.primary")!;
    expect(submit.disabled).toBe(true);
    act(() => {
      container
        .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
        .forEach((checkbox) => checkbox.click());
      container.querySelector<HTMLInputElement>('input[type="radio"]')!.click();
    });
    expect(submit.disabled).toBe(false);
    act(() => submit.click());
    expect(onComplete).toHaveBeenCalledWith({
      registryUrl: "https://registry.example/research",
      publisher: "Hannah Mueller",
      contactEmail: "hannah@example.org",
    });
  });

  it("blocks embedded consent when general Dataspace readiness is missing", () => {
    const onComplete = renderOnboarding("en", "embedded", false);
    act(() => {
      container
        .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
        .forEach((checkbox) => checkbox.click());
    });

    const submit = container.querySelector<HTMLButtonElement>("button.primary")!;
    expect(submit.disabled).toBe(true);
    expect(container.textContent).toContain("Complete the general Dataspace onboarding");
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("requires missing standalone profile metadata and submits entered values", () => {
    const onComplete = renderOnboarding("en", "standalone", true, true, "", "");
    const submit = container.querySelector<HTMLButtonElement>("button.primary")!;
    act(() => {
      container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((checkbox) => checkbox.click());
      container.querySelector<HTMLInputElement>('input[type="radio"]')!.click();
    });
    expect(submit.disabled).toBe(true);
    act(() => {
      const name = container.querySelector<HTMLInputElement>('input[name="city-tours-publisher"]')!;
      const email = container.querySelector<HTMLInputElement>('input[name="city-tours-contact-email"]')!;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(name, "Alice Example");
      name.dispatchEvent(new Event("input", { bubbles: true }));
      setter.call(email, "alice@example.org");
      email.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(submit.disabled).toBe(false);
    act(() => submit.click());
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
      publisher: "Alice Example",
      contactEmail: "alice@example.org",
    }));
  });

  it("blocks embedded consent with missing metadata without exposing profile inputs", () => {
    renderOnboarding("en", "embedded", true, false, "", "");
    expect(container.textContent).toContain("Complete your publisher name and contact email in Profile Manager");
    expect(container.querySelector('input[name="city-tours-publisher"]')).toBeNull();
    expect(container.querySelector<HTMLButtonElement>("button.primary")!.disabled).toBe(true);
  });
});
