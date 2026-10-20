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

  // Netlify projects may store the service-account JSON as one secret rather
  // than three separate variables. Support both formats so every function uses
  // the same, predictable Firebase Admin configuration.
  let serviceAccount: Record<string, any> = {};
  const serviceAccountJson =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT ||
    process.env.FIREBASE_SERVICE_ACCOUNT ||
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (serviceAccountJson) {
    try {
      // Some deployment dashboards store JSON secrets as base64 to preserve
      // newlines. Accept either representation without logging credential data.
      let parsed: unknown;
      try {
        parsed = JSON.parse(serviceAccountJson);
      } catch {
        parsed = JSON.parse(Buffer.from(serviceAccountJson, "base64").toString("utf8"));
      }
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) serviceAccount = parsed as Record<string, any>;
      else throw new Error("Invalid service-account object");
    } catch {
      console.error("Firebase service-account JSON is invalid; check the Netlify secret format.");
      return null;
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || serviceAccount.project_id || serviceAccount.projectId;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL || process.env.FIREBASE_ADMIN_CLIENT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL || serviceAccount.client_email || serviceAccount.clientEmail;
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY || process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.GOOGLE_PRIVATE_KEY || serviceAccount.private_key || serviceAccount.privateKey;
  const privateKey = typeof rawPrivateKey === "string" ? rawPrivateKey.replace(/\\n/g, "\n") : "";

  if (!projectId || !clientEmail || !privateKey) {
    console.error("Firebase Admin configuration is incomplete. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY, or set FIREBASE_SERVICE_ACCOUNT_JSON to the complete service-account JSON. Do not use VITE_ variables for private credentials.");
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
  const databaseId = process.env.FIREBASE_DATABASE_ID || process.env.VITE_FIREBASE_DATABASE_ID || "ai-studio-jaystarblissdyna-085e16ac-52ee-43ae-9c0c-52f6db7f8f7c";
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

