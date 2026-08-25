declare module "@hoelk-f/semantic-data-catalog/catalog-api" {
  export type RestrictedCatalogSession = {
    info: { isLoggedIn?: boolean; webId: string };
    fetch: typeof fetch;
  };

  export type RestrictedDatasetInput = {
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
    reference: { identifier?: string; datasetUrl?: string }
  ): Promise<{ removed: true; identifier: string; datasetUrl: string }>;
}
