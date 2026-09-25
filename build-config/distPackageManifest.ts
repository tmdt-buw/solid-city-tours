import type { Plugin } from "vite";

type SourcePackage = {
  name: string;
  version: string;
  license: string;
  publishConfig?: Record<string, string>;
  dependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
};

export function createDistPackageManifest(source: SourcePackage): string {
  const manifest = {
    name: source.name,
    version: source.version,
    license: source.license,
    type: "module",
    main: "./index.cjs",
    module: "./index.js",
    exports: {
      "./embed": { import: "./index.js", require: "./index.cjs" },
      "./embed.css": "./embed.css",
    },
    sideEffects: ["**/*.css"],
    publishConfig: source.publishConfig,
    peerDependencies: source.peerDependencies,
    dependencies: {
      "@hoelk-f/semantic-data-catalog":
        source.dependencies["@hoelk-f/semantic-data-catalog"],
      "@inrupt/oidc-client-ext": source.dependencies["@inrupt/oidc-client-ext"],
      "@inrupt/solid-client": source.dependencies["@inrupt/solid-client"],
      "@inrupt/solid-client-authn-browser":
        source.dependencies["@inrupt/solid-client-authn-browser"],
      "@inrupt/solid-client-authn-core":
        source.dependencies["@inrupt/solid-client-authn-core"],
      leaflet: source.dependencies.leaflet,
    },
  };

  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function distPackageManifestPlugin(source: SourcePackage): Plugin {
  return {
    name: "city-tours-dist-package-manifest",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "package.json",
        source: createDistPackageManifest(source),
      });
    },
  };
}
