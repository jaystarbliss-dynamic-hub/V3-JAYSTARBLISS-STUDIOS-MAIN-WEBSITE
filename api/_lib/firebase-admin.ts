import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let cachedApp: App | null = null;
let cachedAuth: Auth | null = null;
let cachedDb: Firestore | null = null;

function readServiceAccount(): Record<string, any> {
  const raw =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT ||
    process.env.FIREBASE_SERVICE_ACCOUNT ||
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, any>;
  } catch {
    // Some deployment dashboards store JSON secrets as base64.
    try {
      const parsed: unknown = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, any>;
    } catch {
      console.error("Firebase Admin service-account secret is invalid JSON/base64.");
      return {};
    }
  }
  console.error("Firebase Admin service-account secret must contain a JSON object.");
  return {};
}

export function getAdminApp(): App | null {
  if (cachedApp) return cachedApp;
  const existing = getApps().find((app) => app.name === "[DEFAULT]");
  if (existing) {
    cachedApp = existing;
    return cachedApp;
  }

  const serviceAccount = readServiceAccount();
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    serviceAccount.project_id ||
    serviceAccount.projectId;
  const clientEmail =
    process.env.FIREBASE_CLIENT_EMAIL ||
    process.env.FIREBASE_ADMIN_CLIENT_EMAIL ||
    process.env.GOOGLE_CLIENT_EMAIL ||
    serviceAccount.client_email ||
    serviceAccount.clientEmail;
  const rawPrivateKey =
    process.env.FIREBASE_PRIVATE_KEY ||
    process.env.FIREBASE_ADMIN_PRIVATE_KEY ||
    process.env.GOOGLE_PRIVATE_KEY ||
    serviceAccount.private_key ||
    serviceAccount.privateKey;
  const privateKey = typeof rawPrivateKey === "string" ? rawPrivateKey.replace(/\\n/g, "\n") : "";

  if (!projectId || !clientEmail || !privateKey) {
    console.error(
      "Firebase Admin configuration is incomplete. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY, or provide a complete FIREBASE_SERVICE_ACCOUNT_JSON secret."
    );
    return null;
  }

  try {
    cachedApp = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
    return cachedApp;
  } catch (err) {
    console.error("Could not initialize Firebase Admin SDK:", err instanceof Error ? err.message : String(err));
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
  // The browser uses this named database. Keep an explicit server-side override.
  const databaseId =
    process.env.FIREBASE_DATABASE_ID ||
    process.env.VITE_FIREBASE_DATABASE_ID ||
    "ai-studio-jaystarblissdyna-085e16ac-52ee-43ae-9c0c-52f6db7f8f7c";
  cachedDb = getFirestore(app, databaseId);
  return cachedDb;
}

// Proxied exports preserve compatibility with existing API and Netlify function imports.
export const adminAuth = new Proxy({} as Auth, {
  get(_, prop) {
    const auth = getAdminAuth();
    if (!auth) {
      throw new Error("Firebase Admin Auth is not configured. Check the Netlify Firebase Admin environment variables.");
    }
    const val = (auth as any)[prop];
    return typeof val === "function" ? val.bind(auth) : val;
  }
});

export const adminDb = new Proxy({} as Firestore, {
  get(_, prop) {
    const db = getAdminDb();
    if (!db) {
      throw new Error("Firebase Admin Firestore is not configured. Check the Netlify Firebase Admin environment variables.");
    }
    const val = (db as any)[prop];
    return typeof val === "function" ? val.bind(db) : val;
  }
});
