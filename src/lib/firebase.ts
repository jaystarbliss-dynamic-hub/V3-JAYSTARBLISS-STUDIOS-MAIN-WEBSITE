import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  initializeFirestore, 
  getFirestore, 
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache
} from "firebase/firestore";
import { 
  getAuth, 
  initializeAuth, 
  browserLocalPersistence, 
  browserSessionPersistence, 
  indexedDBLocalPersistence, 
  inMemoryPersistence,
  browserPopupRedirectResolver
} from "firebase/auth";
import { getStorage } from "firebase/storage";

const envDbId = typeof import.meta !== "undefined" ? (import.meta as any).env?.VITE_FIREBASE_DATABASE_ID : "";
export const DEFAULT_DATABASE_ID = "(default)";
export const LEGACY_NAMED_DATABASE_ID = "ai-studio-jaystarblissdyna-085e16ac-52ee-43ae-9c0c-52f6db7f8f7c";
export const ACTIVE_DB_STORAGE_KEY = "jaystar_active_database_id";

function resolveInitialDatabaseId(): string {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const saved = window.localStorage.getItem(ACTIVE_DB_STORAGE_KEY)?.trim();
      if (saved === DEFAULT_DATABASE_ID || saved === LEGACY_NAMED_DATABASE_ID) {
        return saved;
      }
    }
  } catch {
    // ignore storage access errors
  }
  if (envDbId && String(envDbId).trim()) {
    return String(envDbId).trim();
  }
  return DEFAULT_DATABASE_ID;
}

export const ACTIVE_DATABASE_ID = resolveInitialDatabaseId();
export const STANDBY_DATABASE_ID =
  ACTIVE_DATABASE_ID === DEFAULT_DATABASE_ID ? LEGACY_NAMED_DATABASE_ID : DEFAULT_DATABASE_ID;
const PRIMARY_DATABASE_ID = ACTIVE_DATABASE_ID;

export function getActiveDatabaseId(): string {
  return ACTIVE_DATABASE_ID;
}

export function setActiveDatabaseId(nextDbId: string, reload = true): void {
  const normalized =
    nextDbId === LEGACY_NAMED_DATABASE_ID ? LEGACY_NAMED_DATABASE_ID : DEFAULT_DATABASE_ID;
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(ACTIVE_DB_STORAGE_KEY, normalized);
      // Clear cached banner/CMS session keys so the switched database loads fresh state
      if (window.sessionStorage) {
        window.sessionStorage.removeItem("jaystar_marquee_banner_v1");
      }
    }
  } catch {
    // ignore storage errors
  }
  if (reload && typeof window !== "undefined") {
    window.location.reload();
  }
}

// Coordinate Client + Server Database Selection:
// Automatically attach x-jaystar-database-id header to same-origin /.netlify/functions/* and /api/* requests
if (typeof window !== "undefined" && typeof window.fetch === "function" && !(window as any).__jaystarFetchPatched) {
  const originalFetch = window.fetch.bind(window);
  (window as any).__jaystarFetchPatched = true;
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const urlStr =
        typeof input === "string"
          ? input
          : input instanceof URL
          ? input.toString()
          : input?.url || "";
      const isInternalApi =
        urlStr.startsWith("/.netlify/functions/") ||
        urlStr.startsWith("/api/") ||
        (typeof window.location !== "undefined" &&
          urlStr.startsWith(window.location.origin) &&
          (urlStr.includes("/.netlify/functions/") || urlStr.includes("/api/")));
      if (isInternalApi) {
        const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
        if (!headers.has("x-jaystar-database-id")) {
          const activeId =
            (typeof window.localStorage !== "undefined" &&
              window.localStorage.getItem(ACTIVE_DB_STORAGE_KEY)?.trim()) ||
            ACTIVE_DATABASE_ID;
          headers.set("x-jaystar-database-id", activeId);
        }
        return originalFetch(input, { ...init, headers });
      }
    } catch {
      // fall through to original fetch
    }
    return originalFetch(input, init);
  };
}

const firebaseConfig = {
  apiKey: "AIzaSyD_lq2Z4qBrZZkzYmEMPPMtCKQmfSx2rkY",
  authDomain: "jaystarbliss-studios.firebaseapp.com",
  projectId: "jaystarbliss-studios",
  storageBucket: "jaystarbliss-studios.firebasestorage.app",
  messagingSenderId: "885364100276",
  appId: "1:885364100276:web:1159c4cbd9159aaa0e1be1",
  firestoreDatabaseId: PRIMARY_DATABASE_ID
};

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

function createFirestoreInstance(databaseId: string): ReturnType<typeof getFirestore> {
  const targetId = databaseId === DEFAULT_DATABASE_ID ? undefined : databaseId;
  try {
    return initializeFirestore(
      app,
      {
        experimentalAutoDetectLongPolling: true,
        localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
      },
      targetId
    );
  } catch {
    try {
      return initializeFirestore(
        app,
        {
          experimentalAutoDetectLongPolling: true,
          localCache: memoryLocalCache(),
        },
        targetId
      );
    } catch {
      return targetId ? getFirestore(app, targetId) : getFirestore(app);
    }
  }
}

// Initialize primary Firestore with persistent IndexedDB cache (fallback to memory cache in restricted contexts)
const db: ReturnType<typeof getFirestore> = createFirestoreInstance(PRIMARY_DATABASE_ID);

// Keep defaultDb aliased to the active primary database so all reads/writes target the selected database
const defaultDb = db;

let standbyDbInstance: ReturnType<typeof getFirestore> | null = null;
export function getStandbyFirestore(): ReturnType<typeof getFirestore> {
  if (!standbyDbInstance) {
    standbyDbInstance = createFirestoreInstance(STANDBY_DATABASE_ID);
  }
  return standbyDbInstance;
}

export function getFirestoreById(databaseId: string): ReturnType<typeof getFirestore> {
  if (databaseId === ACTIVE_DATABASE_ID) return db;
  return getStandbyFirestore();
}

export const getClientDatabases = () => [db];

export const getAllClientDatabases = () => {
  const standby = getStandbyFirestore();
  return standby && standby !== db ? [db, standby] : [db];
};

// Initialize Auth with multi-tier persistence (localStorage -> indexedDB -> sessionStorage -> memory)
// Note: browserPopupRedirectResolver is passed on-demand to signInWithPopup to avoid eager COOP window.closed checks
let auth: ReturnType<typeof getAuth>;
try {
  auth = initializeAuth(app, {
    persistence: [
      browserLocalPersistence,
      indexedDBLocalPersistence,
      browserSessionPersistence,
      inMemoryPersistence
    ]
  });
} catch {
  auth = getAuth(app);
}

const storage = getStorage(app);

export { app, db, defaultDb, auth, storage, firebaseConfig, browserPopupRedirectResolver };



