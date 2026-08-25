import { describe, expect, it } from "vitest";
import { getParticleDirection, isForegroundParticle } from "./LoginParticleCloud";

describe("LoginParticleCloud depth occlusion", () => {
  it("hides points on the rear hemisphere", () => {
    expect(isForegroundParticle(0.3)).toBe(true);
    expect(isForegroundParticle(-0.04)).toBe(true);
    expect(isForegroundParticle(-0.041)).toBe(false);
  });

  it("uses the catalog's asymmetric self-node clustering", () => {
    const clusteredDirection = getParticleDirection(35, 96);
    expect(clusteredDirection.x).toBeGreaterThan(0);
    expect(clusteredDirection.y).toBeLessThan(0);
    expect(
      Math.hypot(
        clusteredDirection.x,
        clusteredDirection.y,
        clusteredDirection.z
      )
    ).toBeCloseTo(1, 8);
  });
});
