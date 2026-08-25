import { describe, expect, it, vi } from "vitest";
import { initializeOnce } from "./mapLifecycle";

describe("Leaflet map lifecycle", () => {
  it("does not initialize a container twice when mounting is replayed", () => {
    const map = { remove: vi.fn() };
    const initialize = vi.fn(() => map);

    const first = initializeOnce(null, initialize);
    const replayed = initializeOnce(first, initialize);

    expect(replayed).toBe(first);
    expect(initialize).toHaveBeenCalledTimes(1);
  });
});
