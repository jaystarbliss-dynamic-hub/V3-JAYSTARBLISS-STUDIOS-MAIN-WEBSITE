import type { Handler } from "@netlify/functions";
import { adminAuth, adminDb, getAdminDatabases, hasAdminAuth } from "../../api/_lib/firebase-admin";

const ADMIN_ROLES = new Set([
  "super_admin",
  "admin",
  "cms_admin",
  "academic_admin",
  "finance_admin",
  "content_admin",
  "education_admin",
  "services_admin"
]);

const ROLE_ALIASES: Record<string, string> = {
  USER: "user",
  STUDENT: "student",
  PARENT: "parent",
  TUTOR: "staff",
  STAFF: "staff",
  INSTRUCTOR: "staff",
  FACULTY: "staff",
  SCHOOL: "school",
  SCHOOL_ADMIN: "school",
  CMS_ADMIN: "cms_admin",
  CONTENT_ADMIN: "cms_admin",
  ACADEMIC_ADMIN: "academic_admin",
  EDUCATION_ADMIN: "academic_admin",
  FINANCE_ADMIN: "finance_admin",
  SERVICES_ADMIN: "services_admin",
  SUPER_ADMIN: "super_admin",
  ADMIN: "super_admin"
};

const KNOWN_SUPER_ADMIN_EMAILS = new Set([
  "johnrufai242@gmail.com",
  "admin@jaystarbliss.com",
  "admin@jaystarbliss-studios.name.ng",
  "admin@jaystar.com"
]);

const json = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body)
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
    let isSuperAdminCaller = false;

    if (hasAdminAuth()) {
      try {
        const decoded = await adminAuth.verifyIdToken(token);
        callerUid = decoded.uid;
        callerEmail = String(decoded.email || "").toLowerCase().trim();
        isSuperAdminCaller = KNOWN_SUPER_ADMIN_EMAILS.has(callerEmail) || decoded.admin === true || decoded.role === "super_admin";
      } catch (authErr: any) {
        console.error("Token verification failed:", authErr);
        return json(401, { error: "Invalid or expired administrator session." });
      }
    } else {
      console.warn("Firebase Admin Auth unavailable, falling back to permissive admin check");
    }

    // Resolve caller record across databases
    let callerData: Record<string, any> = {};
    const dbs = getAdminDatabases();

    if (callerUid) {
      for (const database of dbs) {
        try {
          const snap = await database.collection("users").doc(callerUid).get();
          if (snap.exists) {
            callerData = snap.data() || {};
            break;
          }
        } catch {
          // Non-fatal database retry
        }
      }
    }

    const callerRole = String(callerData.role || (isSuperAdminCaller ? "super_admin" : "")).toLowerCase();
    const callerStatus = String(callerData.accountStatus || "ACTIVE").toUpperCase();

    if (!isSuperAdminCaller && (!ADMIN_ROLES.has(callerRole) || ["DISABLED", "SUSPENDED", "BANNED"].includes(callerStatus))) {
      return json(403, { error: "Administrator permissions are required." });
    }

    const body = JSON.parse(event.body || "{}");
    const userId = String(body.userId || "").trim();
    const requestedRole = String(body.role || "").trim().toUpperCase();
    const role = ROLE_ALIASES[requestedRole] || requestedRole.toLowerCase();

    if (!userId || !role) {
      return json(400, { error: "A valid userId and role are required." });
    }

    if (callerUid && userId === callerUid && role !== "super_admin") {
      return json(400, { error: "You cannot remove your own administrator role." });
    }

    // Look up target record across all databases
    let targetData: Record<string, any> = {};
    let targetDocId = userId;
    let targetFound = false;

    for (const database of dbs) {
      try {
        const snap = await database.collection("users").doc(userId).get();
        if (snap.exists) {
          targetData = snap.data() || {};
          targetFound = true;
          break;
        }
      } catch {}
    }

    if (!targetFound) {
      // Check if userId is an email address
      for (const database of dbs) {
        try {
          const qSnap = await database.collection("users").where("email", "==", userId.toLowerCase()).limit(1).get();
          if (!qSnap.empty) {
            targetDocId = qSnap.docs[0].id;
            targetData = qSnap.docs[0].data() || {};
            targetFound = true;
            break;
          }
        } catch {}
      }
    }

    const targetRole = String(targetData.role || "").toLowerCase();
    const targetStatus = String(targetData.accountStatus || "ACTIVE").toUpperCase();
    let targetEmail = String(targetData.email || "").toLowerCase().trim();

    if ((role === "super_admin" || targetRole === "super_admin") && !isSuperAdminCaller && callerRole !== "super_admin") {
      return json(403, { error: "Only a Super Admin can create or modify Super Admin access." });
    }

    if (
      ["cms_admin", "academic_admin", "finance_admin", "content_admin", "education_admin", "services_admin"].includes(role) &&
      !isSuperAdminCaller &&
      callerRole !== "super_admin"
    ) {
      return json(403, { error: "Only a Super Admin can assign administrative roles." });
    }

    // Attempt Firebase Auth user synchronization if Admin Auth is available
    let authUid = targetDocId;
    let authUpdated = false;

    if (hasAdminAuth()) {
      try {
        const targetAuth = await adminAuth.getUser(targetDocId);
        targetEmail = targetAuth.email || targetEmail;
        authUid = targetAuth.uid;
        await adminAuth.setCustomUserClaims(authUid, { role }).catch(() => null);
        authUpdated = true;
      } catch (authLookupErr: any) {
        if (targetEmail) {
          try {
            const targetAuth = await adminAuth.getUserByEmail(targetEmail);
            authUid = targetAuth.uid;
            await adminAuth.setCustomUserClaims(authUid, { role }).catch(() => null);
            authUpdated = true;
          } catch {
            // Target does not have a Firebase Auth account yet
          }
        }
      }
    }

    const now = new Date();

    // Persist to all active Firestore databases
    for (const database of dbs) {
      try {
        await database.collection("users").doc(targetDocId).set(
          { role, updatedAt: now },
          { merge: true }
        );

        if (authUid && authUid !== targetDocId) {
          await database.collection("users").doc(authUid).set(
            { role, updatedAt: now },
            { merge: true }
          );
        }

        if (role === "staff") {
          await database.collection("tutors").doc(targetDocId).set(
            {
              role: "staff",
              status: "ACTIVE",
              email: targetEmail || null,
              name: targetData.name || targetData.fullName || "",
              updatedAt: now
            },
            { merge: true }
          );

          if (authUid && authUid !== targetDocId) {
            await database.collection("tutors").doc(authUid).set(
              {
                role: "staff",
                status: "ACTIVE",
                email: targetEmail || null,
                name: targetData.name || targetData.fullName || "",
                updatedAt: now
              },
              { merge: true }
            );
          }

          // Approve any matching pending tutor application records
          if (targetEmail) {
            try {
              const appSnap = await database.collection("tutor_applications").where("email", "==", targetEmail).get();
              for (const appDoc of appSnap.docs) {
                await appDoc.ref.set({ status: "approved", approvedAt: now, tutorId: targetDocId }, { merge: true });
              }
            } catch {}
          }
        } else if (role === "parent") {
          await database.collection("parents").doc(targetDocId).set(
            {
              role: "parent",
              email: targetEmail || null,
              name: targetData.name || targetData.fullName || "",
              updatedAt: now
            },
            { merge: true }
          );
        } else if (role === "student") {
          await database.collection("individualStudents").doc(targetDocId).set(
            {
              role: "student",
              email: targetEmail || null,
              fullName: targetData.name || targetData.fullName || "",
              updatedAt: now
            },
            { merge: true }
          );
        } else if (role === "school") {
          await database.collection("schools").doc(targetDocId).set(
            { updatedAt: now },
            { merge: true }
          );
        } else if (role.includes("admin")) {
          await database.collection("admins").doc(targetDocId).set(
            {
              uid: targetDocId,
              email: targetEmail || null,
              name: targetData.name || targetData.fullName || "",
              role,
              status: targetStatus,
              updatedAt: now
            },
            { merge: true }
          );
        } else {
          // If revoked from admin, remove from admins collection
          try {
            await database.collection("admins").doc(targetDocId).delete();
          } catch {}
        }

        // Write audit log entry
        await database.collection("activityLogs").add({
          action: "USER_ROLE_CHANGED",
          actorId: callerUid || "admin_session",
          actorEmail: callerEmail || null,
          actorRole: callerRole,
          targetUserId: targetDocId,
          targetEmail: targetEmail || null,
          previousRole: targetRole,
          nextRole: role,
          authUpdated,
          createdAt: now
        });
      } catch (dbErr) {
        console.error("Database update error for db instance:", dbErr);
      }
    }

    return json(200, {
      success: true,
      userId: targetDocId,
      role,
      email: targetEmail || null,
      authUpdated
    });
  } catch (error: any) {
    console.error("Admin role change handler error:", error);
    const status = error?.statusCode || 500;
    const message = error?.message || "Unable to update the user role securely.";
    return json(status, { error: message });
  }
};
