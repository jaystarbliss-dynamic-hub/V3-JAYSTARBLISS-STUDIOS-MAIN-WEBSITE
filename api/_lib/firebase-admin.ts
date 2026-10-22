import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let cachedApp: App | null = null;
let cachedAuth: Auth | null = null;
let cachedDb: Firestore | null = null;

export function getAdminApp(): App | null {
  if (cachedApp) return cachedApp;
  if (getApps().length > 0) {
    cachedApp = getApps()[0];
    return cachedApp;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  try {
    cachedApp = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
    return cachedApp;
  } catch (err) {
    console.warn("Could not initialize Firebase Admin SDK:", err);
    return null;
  }
}

export function getAdminAuth(): Auth | null {
  if (cachedAuth) return cachedAuth;
  const app = getAdminApp();
  if (!app) return null;
  cachedAuth = getAuth(app);
  return cachedAuth;
}

export function getAdminDb(): Firestore | null {
  if (cachedDb) return cachedDb;
  const app = getAdminApp();
  if (!app) return null;
  // Match the named Firestore database used by the browser client. Without this fallback,
  // server-side student login and portal APIs silently query the default database instead.
  const databaseId = process.env.FIREBASE_DATABASE_ID || "ai-studio-jaystarblissdyna-085e16ac-52ee-43ae-9c0c-52f6db7f8f7c";
  cachedDb = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
  return cachedDb;
}

// Proxied exports for backwards compatibility without crashing on import
export const adminAuth = new Proxy({} as Auth, {
  get(_, prop) {
    const auth = getAdminAuth();
    if (!auth) {
      throw new Error("Firebase Admin Auth is not configured. Please set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.");
    }
    const val = (auth as any)[prop];
    return typeof val === "function" ? val.bind(auth) : val;
  }
});

export const adminDb = new Proxy({} as Firestore, {
  get(_, prop) {
    const db = getAdminDb();
    if (!db) {
      throw new Error("Firebase Admin Firestore is not configured. Please set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.");
    }
    const val = (db as any)[prop];
    return typeof val === "function" ? val.bind(db) : val;
  }
});

