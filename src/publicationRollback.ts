export type RollbackActions = {
  clearMarker: () => Promise<void>;
  removeCatalog?: () => Promise<void>;
  removeManifest: () => Promise<void>;
  removeResource: () => Promise<void>;
  removeContainer: () => Promise<void>;
};

export type RollbackResult = {
  fullyClean: boolean;
  errors: unknown[];
};

async function attempt(action: () => Promise<void>, errors: unknown[]): Promise<boolean> {
  try {
    await action();
    return true;
  } catch (error) {
    errors.push(error);
    return false;
  }
}

/**
 * Remove discovery references before deleting the private snapshot. If either the
 * marker or Catalog cleanup fails, the snapshot is deliberately retained so the
 * persisted ActiveRun can be reset again without leaving a dangling public URL.
 */
export async function rollbackPublishedScenario(
  actions: RollbackActions
): Promise<RollbackResult> {
  const errors: unknown[] = [];
  const markerCleared = await attempt(actions.clearMarker, errors);
  const catalogCleared = actions.removeCatalog
    ? await attempt(actions.removeCatalog, errors)
    : true;

  if (!markerCleared || !catalogCleared) {
    return { fullyClean: false, errors };
  }

  const manifestRemoved = await attempt(actions.removeManifest, errors);
  const resourceRemoved = await attempt(actions.removeResource, errors);
  const containerRemoved = await attempt(actions.removeContainer, errors);
  return {
    fullyClean: manifestRemoved && resourceRemoved && containerRemoved,
    errors,
  };
}
