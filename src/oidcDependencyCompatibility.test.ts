import { describe, expect, it } from "vitest";
import packageLock from "../package-lock.json";
import packageManifest from "../package.json";

type LockedPackage = { version?: string };
type PackageLock = { packages: Record<string, LockedPackage> };

describe("Solid OIDC dependency compatibility", () => {
  it("keeps the browser auth client and its coupled packages on 2.3.0", () => {
    const lock = packageLock as unknown as PackageLock;

    expect(packageManifest.dependencies["@inrupt/solid-client-authn-browser"]).toBe("2.3.0");
    expect(packageManifest.dependencies["@inrupt/oidc-client-ext"]).toBe("2.3.0");
    expect(packageManifest.dependencies["@inrupt/solid-client-authn-core"]).toBe("2.3.0");
    expect(packageManifest.overrides).toEqual({
      "@inrupt/oidc-client-ext": "2.3.0",
      "@inrupt/solid-client-authn-core": "2.3.0",
    });
    expect(lock.packages["node_modules/@inrupt/oidc-client-ext"]?.version).toBe("2.3.0");
    expect(lock.packages["node_modules/@inrupt/solid-client-authn-core"]?.version).toBe(
      "2.3.0"
    );
  });
});
