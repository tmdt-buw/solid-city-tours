declare module "@hoelk-f/semantic-data-catalog/catalog-api" {
  export type RestrictedCatalogSession = {
    info: { isLoggedIn?: boolean; webId: string };
    fetch: typeof fetch;
  };

  export type RestrictedDatasetInput = {
    /** Resolved Pod root; supported by newer Catalog API versions. */
    podRoot?: string;
    identifier: string;
    title?: string;
    description?: string;
    distributionUrl: string;
    mediaType?: string;
    publisher?: string;
    publisherWebId?: string;
    publisherUrl?: string;
    contactPoint?: string;
    contactPointWebId?: string;
    contactWebId?: string;
    contactPointUrl?: string;
    contactUrl?: string;
    creatorWebId?: string;
    includeCreator?: boolean;
    theme?: string;
    requireDiscoverableRegistry?: boolean;
    issued?: string;
    operationId?: string;
  };

  export function publishRestrictedDataset(
    session: RestrictedCatalogSession,
    input: RestrictedDatasetInput
  ): Promise<{
    identifier: string;
    datasetUrl: string;
    recordUrl?: string;
    distributionUrl: string;
  }>;

  export type PublicDatasetInput = RestrictedDatasetInput & {
    title: string;
    mediaType: string;
    theme: string;
  };

  export type DiscoveredPublicDataset = {
    identifier: string;
    title: string;
    description: string;
    publisher: string;
    creatorWebId?: string;
    datasetUrl: string;
    distributionUrl: string;
    mediaType: string;
    theme: string;
  };

  export function publishPublicDataset(
    session: RestrictedCatalogSession,
    input: PublicDatasetInput
  ): Promise<{
    identifier: string;
    datasetUrl: string;
    recordUrl?: string;
    distributionUrl: string;
  }>;

  export function updatePublicDataset(
    session: RestrictedCatalogSession,
    input: PublicDatasetInput & { datasetUrl: string; operationId?: string }
  ): Promise<{
    identifier: string;
    datasetUrl: string;
    recordUrl?: string;
    distributionUrl: string;
  }>;

  export function discoverPublicDatasets(
    session: RestrictedCatalogSession,
    options?: {
      podRoot?: string;
      identifierPrefix?: string;
      mediaType?: string;
      theme?: string;
    }
  ): Promise<DiscoveredPublicDataset[]>;

  export function getCatalogReadiness(
    session: RestrictedCatalogSession,
    options?: { podRoot?: string }
  ): Promise<{ catalogConfigured: boolean; publicRegistries: string[] }>;

  export type PublicRegistryPreset = {
    id: string;
    label: string;
    url: string;
  };

  export function getPublicRegistryPresets(): PublicRegistryPreset[];

  export function ensurePublicCatalogReadiness(
    session: RestrictedCatalogSession,
    options: {
      podRoot?: string;
      registryUrl: string;
      catalogTitle?: string;
    }
  ): Promise<{
    catalogConfigured: true;
    publicRegistries: string[];
    selectedRegistry: string;
  }>;

  export function removeDataset(
    session: RestrictedCatalogSession,
    reference: { identifier?: string; datasetUrl?: string; podRoot?: string }
  ): Promise<{ removed: true; identifier: string; datasetUrl: string }>;
}
