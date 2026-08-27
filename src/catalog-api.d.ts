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

  export function removeDataset(
    session: RestrictedCatalogSession,
    reference: { identifier?: string; datasetUrl?: string; podRoot?: string }
  ): Promise<{ removed: true; identifier: string; datasetUrl: string }>;
}
