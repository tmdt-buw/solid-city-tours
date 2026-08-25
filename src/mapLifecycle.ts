/**
 * React 19 development Strict Mode can replay ref attachment and effects.
 * Keep Leaflet initialization idempotent so the same DOM container is never
 * handed to a second Map instance before the first one has been cleaned up.
 */
export function initializeOnce<T>(current: T | null, initialize: () => T): T {
  return current ?? initialize();
}
