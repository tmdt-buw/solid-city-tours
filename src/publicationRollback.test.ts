import { describe, expect, it, vi } from "vitest";
import { rollbackPublishedScenario } from "./publicationRollback";

const successful = () => vi.fn(async () => undefined);

describe("publication rollback", () => {
  it("retains the private snapshot when Catalog cleanup fails", async () => {
    const removeManifest = successful();
    const removeResource = successful();
    const removeContainer = successful();
    const result = await rollbackPublishedScenario({
      clearMarker: successful(),
      removeCatalog: vi.fn(async () => {
        throw new Error("catalog unavailable");
      }),
      removeManifest,
      removeResource,
      removeContainer,
    });

    expect(result.fullyClean).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(removeManifest).not.toHaveBeenCalled();
    expect(removeResource).not.toHaveBeenCalled();
    expect(removeContainer).not.toHaveBeenCalled();
  });

  it("removes the snapshot only after marker and Catalog references are gone", async () => {
    const calls: string[] = [];
    const action = (name: string) => vi.fn(async () => void calls.push(name));
    const result = await rollbackPublishedScenario({
      clearMarker: action("marker"),
      removeCatalog: action("catalog"),
      removeManifest: action("manifest"),
      removeResource: action("resource"),
      removeContainer: action("container"),
    });

    expect(result).toEqual({ fullyClean: true, errors: [] });
    expect(calls).toEqual(["marker", "catalog", "manifest", "resource", "container"]);
  });
});
