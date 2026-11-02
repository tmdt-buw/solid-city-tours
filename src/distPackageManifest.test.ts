import { describe, expect, it } from "vitest";
import { createDistPackageManifest } from "../build-config/distPackageManifest";

describe("library package manifest", () => {
  it("describes only the files and runtime dependencies shipped in dist", () => {
    const manifest = JSON.parse(
      createDistPackageManifest({
        name: "@example/city-tours",
        version: "1.2.3",
        license: "Apache-2.0",
        publishConfig: { registry: "https://npm.pkg.github.com" },
        peerDependencies: { react: "^18", "react-dom": "^18" },
        dependencies: {
          "@hoelk-f/semantic-data-catalog": "0.8.62",
          "@inrupt/oidc-client-ext": "5.0.3",
          "@inrupt/solid-client": "1.30.2",
          "@inrupt/solid-client-authn-browser": "5.0.3",
          "@inrupt/solid-client-authn-core": "5.0.3",
          leaflet: "^1.9.4",
          react: "18.3.1",
          "react-dom": "18.3.1",
          "build-only-package": "9.9.9",
        },
      })
    );

    expect(manifest).toMatchObject({
      name: "@example/city-tours",
      version: "1.2.3",
      main: "./index.cjs",
      module: "./index.js",
      exports: {
        "./embed": { import: "./index.js", require: "./index.cjs" },
        "./embed.css": "./embed.css",
      },
      publishConfig: { registry: "https://npm.pkg.github.com" },
    });
    expect(manifest.dependencies).not.toHaveProperty("build-only-package");
    expect(manifest.dependencies).not.toHaveProperty("react");
    expect(manifest.dependencies).not.toHaveProperty("react-dom");
    expect(manifest.dependencies).not.toHaveProperty("react-leaflet");
    expect(manifest.dependencies).toMatchObject({
      "@inrupt/oidc-client-ext": "5.0.3",
      "@inrupt/solid-client-authn-browser": "5.0.3",
      "@inrupt/solid-client-authn-core": "5.0.3",
    });
    expect(manifest.peerDependencies).toEqual({ react: "^18", "react-dom": "^18" });
  });
});
