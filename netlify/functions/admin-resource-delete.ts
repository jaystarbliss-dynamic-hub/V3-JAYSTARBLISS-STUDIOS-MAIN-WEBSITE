import type { Handler } from "@netlify/functions";
import { adminAuth, getAdminDatabases, hasAdminAuth } from "../../api/_lib/firebase-admin";

const ALLOWED_RESOURCE_COLLECTIONS = new Set([
  "resources",
  "schoolResources",
  "staffGeneralResources",
  "personalResources",
  "links",
  "schoolLinks",
  "personalLinks",
  "exams",
]);

const KNOWN_ADMIN_EMAILS = new Set([
  "johnrufai242@gmail.com",
  "admin@jaystarbliss.com",
  "admin@jaystarbliss-studios.name.ng",
  "admin@jaystar.com",
]);

const ADMIN_ROLES = new Set([
  "super_admin",
  "superadmin",
  "admin",
  "academic_admin",
  "academic_support_admin",
  "education_admin",
  "cms_admin",
  "content_admin",
  "services_admin",
  "marketing_admin",
  "support_admin",
  "finance_admin",
  "billing_admin",
  "director",
]);

const json = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const getToken = (event: any) => {
  const header = event.headers?.authorization || event.headers?.Authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  try {
    const token = getToken(event);
    if (!token) return json(401, { error: "Authentication required." });

    let callerUid = "";
    let callerEmail = "";
    let isVerifiedAdmin = false;

    if (hasAdminAuth()) {
      try {
        const decoded = await adminAuth.verifyIdToken(token);
        callerUid = decoded.uid;
        callerEmail = String(decoded.email || "").toLowerCase().trim();
        isVerifiedAdmin =
          KNOWN_ADMIN_EMAILS.has(callerEmail) ||
          decoded.admin === true ||
          decoded.isAdmin === true ||
          decoded.super_admin === true ||
          ADMIN_ROLES.has(String(decoded.role || "").toLowerCase().trim());
      } catch (authErr) {
        console.error("Token verification failed for resource deletion:", authErr);
        return json(401, { error: "Invalid or expired administrator session." });
      }
    } else {
      return json(503, { error: "Admin verification service unavailable." });
    }

    const dbs = getAdminDatabases();

    if (!isVerifiedAdmin && callerUid) {
      for (const database of dbs) {
        try {
          const [adminSnap, userSnap] = await Promise.all([
            database.collection("admins").doc(callerUid).get(),
            database.collection("users").doc(callerUid).get(),
          ]);
          if (adminSnap.exists) {
            isVerifiedAdmin = true;
            break;
          }
          if (userSnap.exists) {
            const role = String(userSnap.data()?.role || "").toLowerCase().trim();
            if (ADMIN_ROLES.has(role)) {
              isVerifiedAdmin = true;
              break;
            }
          }
        } catch {
          // Continue checking standby database
        }
      }
    }

    if (!isVerifiedAdmin) {
      return json(403, { error: "Only authorized administrators may delete this resource." });
    }

    const body = JSON.parse(event.body || "{}");
    const collectionName = String(body.collectionName || "").trim();
    const documentId = String(body.id || body.documentId || "").trim();

    if (!ALLOWED_RESOURCE_COLLECTIONS.has(collectionName)) {
      return json(400, { error: "Unsupported resource collection." });
    }

    if (!documentId || !/^[a-zA-Z0-9_-]{1,128}$/.test(documentId)) {
      return json(400, { error: "Invalid resource document ID." });
    }

    let deletedCount = 0;
    for (const database of dbs) {
      try {
        await database.collection(collectionName).doc(documentId).delete();
        deletedCount += 1;
      } catch (err) {
        console.warn(`Failed deleting ${collectionName}/${documentId} from a database instance:`, err);
      }
    }

    if (deletedCount === 0) {
      return json(500, { error: "Could not remove resource document from database." });
    }

    return json(200, {
      ok: true,
      collectionName,
      documentId,
      deletedCount,
    });
  } catch (error: any) {
    console.error("admin-resource-delete error:", error);
    return json(500, { error: error?.message || "Unexpected error deleting resource." });
  }
};
