import { existsSync, readFileSync } from "node:fs";
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

  if (raw) {
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
      }
    }
  }

  // Check if GOOGLE_APPLICATION_CREDENTIALS is a file path
  const gacPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (gacPath && typeof gacPath === "string") {
    try {
      if (existsSync(gacPath)) {
        const fileContent = readFileSync(gacPath, "utf8");
        const parsed = JSON.parse(fileContent);
        if (parsed && typeof parsed === "object") return parsed;
      }
    } catch (err) {
      console.warn("Could not read GOOGLE_APPLICATION_CREDENTIALS file path:", err);
    }
  }

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
  const projectId = "jaystarbliss-studios";
  const configuredProjectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    serviceAccount.project_id ||
    serviceAccount.projectId;
  if (configuredProjectId && configuredProjectId !== projectId) {
    console.warn("[firebase-admin] Ignoring project ID override that differs from the browser project.");
  }
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
  let privateKey = typeof rawPrivateKey === "string" ? rawPrivateKey.replace(/\\n/g, "\n").trim() : "";
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.slice(1, -1).replace(/\\n/g, "\n").trim();
  }
  if (privateKey.startsWith("'") && privateKey.endsWith("'")) {
    privateKey = privateKey.slice(1, -1).replace(/\\n/g, "\n").trim();
  }

  if (projectId && clientEmail && privateKey) {
    try {
      cachedApp = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
      return cachedApp;
    } catch (err) {
      console.error("Could not initialize Firebase Admin SDK with cert:", err instanceof Error ? err.message : String(err));
    }
  }

  // Fallback initialization only if running with explicit ADC file or matching GCP project
  const hasAmbientGcpCreds = Boolean(
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.FIREBASE_CONFIG ||
    process.env.GOOGLE_CLOUD_PROJECT === "jaystarbliss-studios"
  );
  if (hasAmbientGcpCreds) {
    try {
      cachedApp = initializeApp({ projectId: projectId || "jaystarbliss-studios" });
      return cachedApp;
    } catch (err) {
      console.warn("Firebase Admin ambient init warning:", err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  return null;
}

export function getAdminAuth(): Auth | null {
  if (cachedAuth) return cachedAuth;
  const app = getAdminApp();
  if (!app) return null;
  cachedAuth = getAuth(app);
  return cachedAuth;
}

let cachedDefaultDb: Firestore | null = null;
let cachedLegacyNamedDb: Firestore | null = null;
export const DEFAULT_DATABASE_ID = "(default)";
export const LEGACY_NAMED_DATABASE_ID = "ai-studio-jaystarblissdyna-085e16ac-52ee-43ae-9c0c-52f6db7f8f7c";

let activeRequestDatabaseId: string | null = null;

export function normalizeDatabaseId(_raw?: string | null): string {
  return DEFAULT_DATABASE_ID;
}

export function applyRequestDatabaseHeader(_headers?: Record<string, string | undefined> | null): string {
  activeRequestDatabaseId = DEFAULT_DATABASE_ID;
  return DEFAULT_DATABASE_ID;
}

export function getDefaultAdminDb(): Firestore | null {
  if (cachedDefaultDb) return cachedDefaultDb;
  const app = getAdminApp();
  if (!app) return null;
  cachedDefaultDb = getFirestore(app);
  return cachedDefaultDb;
}

export function getLegacyNamedAdminDb(): Firestore | null {
  if (cachedLegacyNamedDb) return cachedLegacyNamedDb;
  const app = getAdminApp();
  if (!app) return null;
  try {
    cachedLegacyNamedDb = getFirestore(app, LEGACY_NAMED_DATABASE_ID);
    return cachedLegacyNamedDb;
  } catch {
    return null;
  }
}

export function getAdminDb(_preferredDbId?: string | null): Firestore | null {
  if (cachedDb) return cachedDb;
  cachedDb = getDefaultAdminDb();
  return cachedDb;
}

export function getAdminDatabases(): Firestore[] {
  const primary = getDefaultAdminDb();
  return primary ? [primary] : [];
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

export const hasAdminAuth = (): boolean => getAdminAuth() !== null;
export const hasAdminDb = (): boolean => getAdminDb() !== null;


