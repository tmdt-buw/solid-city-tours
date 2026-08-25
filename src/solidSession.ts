import { Session, handleIncomingRedirect } from "@inrupt/solid-client-authn-browser";

const STORAGE_PREFIX = "solid-tours:";
const storageKey = (key: string) => `${STORAGE_PREFIX}${key}`;

const sessionStorageWrapper = {
  get: async (key: string) =>
    typeof window === "undefined"
      ? undefined
      : window.sessionStorage.getItem(storageKey(key)) ?? undefined,
  set: async (key: string, value: string) => {
    if (typeof window !== "undefined") window.sessionStorage.setItem(storageKey(key), value);
  },
  delete: async (key: string) => {
    if (typeof window !== "undefined") window.sessionStorage.removeItem(storageKey(key));
  },
};

export type SolidSessionLike = InstanceType<typeof Session> & {
  handleIncomingRedirect?: (
    options?: string | { url?: string; restorePreviousSession?: boolean }
  ) => Promise<unknown>;
};

let currentSession: SolidSessionLike = new Session(
  {
    secureStorage: sessionStorageWrapper,
    insecureStorage: sessionStorageWrapper,
  },
  "solid-tours"
);
let restorePromise: Promise<void> | null = null;

export function getSession(): SolidSessionLike {
  return currentSession;
}

export function setSession(nextSession: SolidSessionLike): void {
  if (!nextSession) return;
  currentSession = nextSession;
  restorePromise = null;
}

export async function restoreSession(): Promise<void> {
  if (typeof window === "undefined") return;
  if (restorePromise) return restorePromise;

  restorePromise = (async () => {
    if (typeof currentSession.handleIncomingRedirect === "function") {
      await currentSession.handleIncomingRedirect({
        url: window.location.href,
        restorePreviousSession: true,
      });
      return;
    }
    await handleIncomingRedirect({ restorePreviousSession: true });
  })();

  try {
    await restorePromise;
  } finally {
    restorePromise = null;
  }
}

