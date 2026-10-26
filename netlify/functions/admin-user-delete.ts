import type { Handler } from "@netlify/functions";
import { adminAuth, adminDb, getAdminDatabases, hasAdminAuth } from "../../api/_lib/firebase-admin";

const KNOWN_SUPER_ADMIN_EMAILS = new Set([
  "johnrufai242@gmail.com",
  "admin@jaystarbliss.com",
  "admin@jaystarbliss-studios.name.ng",
  "admin@jaystar.com"
]);

const PROTECTED_ACCOUNTS = new Set([
  "johnrufai242@gmail.com",
  "admin@jaystarbliss.com",
  "admin@jaystarbliss-studios.name.ng"
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
        console.error("Token verification failed for user deletion:", authErr);
        return json(401, { error: "Invalid or expired administrator session." });
      }
    }

    const dbs = getAdminDatabases();
    let callerData: Record<string, any> = {};

    if (callerUid) {
      for (const database of dbs) {
        try {
          const snap = await database.collection("users").doc(callerUid).get();
          if (snap.exists) {
            callerData = snap.data() || {};
            break;
          }
        } catch {}
      }
    }

    const callerRole = String(callerData.role || (isSuperAdminCaller ? "super_admin" : "")).toLowerCase();
    const callerStatus = String(callerData.accountStatus || "ACTIVE").toUpperCase();

    if (!isSuperAdminCaller && callerRole !== "super_admin") {
      return json(403, { error: "Only authorized Super Admins are permitted to permanently delete accounts." });
    }

    if (["DISABLED", "SUSPENDED", "BANNED"].includes(callerStatus)) {
      return json(403, { error: "Your administrator account has been restricted." });
    }

    const body = JSON.parse(event.body || "{}");
    const userId = String(body.userId || "").trim();

    if (!userId) {
      return json(400, { error: "Target userId is required for account deletion." });
    }

    if (callerUid && userId === callerUid) {
      return json(400, { error: "You cannot delete your own active Super Admin account." });
    }

    // Look up target record to inspect role and email
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

    const targetEmail = String(targetData.email || "").toLowerCase().trim();
    const targetRole = String(targetData.role || "").toLowerCase();

    if (PROTECTED_ACCOUNTS.has(targetEmail)) {
      return json(403, { error: "This primary Super Admin account is system-protected and cannot be deleted." });
    }

    // Safeguard: Do not delete the last remaining Super Admin
    if (targetRole === "super_admin" || targetRole === "admin" || KNOWN_SUPER_ADMIN_EMAILS.has(targetEmail)) {
      let superAdminCount = 0;
      for (const database of dbs) {
        try {
          const s1 = await database.collection("users").where("role", "in", ["super_admin", "SUPER_ADMIN", "admin", "ADMIN"]).get();
          superAdminCount = Math.max(superAdminCount, s1.size);
        } catch {}
      }
      if (superAdminCount <= 1) {
        return json(400, { error: "Cannot delete the only remaining Super Admin account in the institution." });
      }
    }

    let deletedRecordsCount = 0;
    const errors: string[] = [];

    // Delete records from Firestore across all databases
    for (const database of dbs) {
      const docsToDelete: FirebaseFirestore.DocumentReference[] = [];

      const queueDoc = (ref: FirebaseFirestore.DocumentReference) => {
        docsToDelete.push(ref);
      };

      const queueQuery = async (queryPromise: Promise<FirebaseFirestore.QuerySnapshot>) => {
        try {
          const snap = await queryPromise;
          snap.forEach((docSnap) => docsToDelete.push(docSnap.ref));
        } catch (queryErr: any) {
          errors.push(queryErr?.message || "Query failed");
        }
      };

      // Direct document IDs
      queueDoc(database.collection("users").doc(targetDocId));
      queueDoc(database.collection("admins").doc(targetDocId));
      queueDoc(database.collection("tutors").doc(targetDocId));
      queueDoc(database.collection("parents").doc(targetDocId));
      queueDoc(database.collection("students").doc(targetDocId));
      queueDoc(database.collection("individualStudents").doc(targetDocId));
      queueDoc(database.collection("staffSchoolAccess").doc(targetDocId));
      queueDoc(database.collection("staffWallets").doc(targetDocId));

      // Query-based related records
      const promises: Promise<any>[] = [
        queueQuery(database.collection("tutors").where("email", "==", targetEmail).get()),
        queueQuery(database.collection("tutor_applications").where("email", "==", targetEmail).get()),
        queueQuery(database.collection("tutor_applications").where("tutorId", "==", targetDocId).get()),
        queueQuery(database.collection("tutorApplications").where("email", "==", targetEmail).get()),
        queueQuery(database.collection("tutorSubjectApplications").where("tutorId", "==", targetDocId).get()),
        queueQuery(database.collection("tutor_subject_applications").where("tutorId", "==", targetDocId).get()),
        queueQuery(database.collection("parents").where("email", "==", targetEmail).get()),
        queueQuery(database.collection("students").where("userId", "==", targetDocId).get()),
        queueQuery(database.collection("students").where("firebaseUid", "==", targetDocId).get()),
        queueQuery(database.collection("students").where("parentId", "==", targetDocId).get()),
        queueQuery(database.collection("individualStudents").where("userId", "==", targetDocId).get()),
        queueQuery(database.collection("individualStudents").where("firebaseUid", "==", targetDocId).get()),
        queueQuery(database.collection("individualStudents").where("parentId", "==", targetDocId).get()),
        queueQuery(database.collection("individualStudents").where("email", "==", targetEmail).get()),
        queueQuery(database.collection("enrollments").where("studentUid", "==", targetDocId).get()),
        queueQuery(database.collection("enrollments").where("studentId", "==", targetDocId).get()),
        queueQuery(database.collection("enrollments").where("parentId", "==", targetDocId).get()),
        queueQuery(database.collection("enrollment_requests").where("parentId", "==", targetDocId).get()),
        queueQuery(database.collection("enrollment_requests").where("parentEmail", "==", targetEmail).get()),
        queueQuery(database.collection("enrollmentRequests").where("parentId", "==", targetDocId).get()),
        queueQuery(database.collection("student_requests").where("parentId", "==", targetDocId).get()),
        queueQuery(database.collection("student_requests").where("email", "==", targetEmail).get()),
        queueQuery(database.collection("jdiExamAttempts").where("studentUid", "==", targetDocId).get()),
        queueQuery(database.collection("jdiExamAttempts").where("studentId", "==", targetDocId).get()),
        queueQuery(database.collection("jdiNotifications").where("recipientUid", "==", targetDocId).get()),
        queueQuery(database.collection("notifications").where("recipientId", "==", targetDocId).get()),
        queueQuery(database.collection("supportTickets").where("userId", "==", targetDocId).get()),
        queueQuery(database.collection("supportChats").where("userId", "==", targetDocId).get()),
        queueQuery(database.collection("studentAchievements").where("studentId", "==", targetDocId).get()),
        queueQuery(database.collection("studentAchievements").where("userId", "==", targetDocId).get()),
        queueQuery(database.collection("certificates").where("studentId", "==", targetDocId).get()),
        queueQuery(database.collection("assignments").where("studentId", "==", targetDocId).get()),
        queueQuery(database.collection("assignments").where("tutorId", "==", targetDocId).get()),
        queueQuery(database.collection("submissions").where("studentId", "==", targetDocId).get()),
        queueQuery(database.collection("assessmentSubmissions").where("studentId", "==", targetDocId).get()),
      ];

      await Promise.allSettled(promises);

      // Deduplicate refs by path
      const uniqueRefsMap = new Map<string, FirebaseFirestore.DocumentReference>();
      for (const ref of docsToDelete) {
        uniqueRefsMap.set(ref.path, ref);
      }
      const uniqueRefs = Array.from(uniqueRefsMap.values());

      // Batched delete in chunks of 400
      const BATCH_SIZE = 400;
      for (let i = 0; i < uniqueRefs.length; i += BATCH_SIZE) {
        const batch = database.batch();
        const chunk = uniqueRefs.slice(i, i + BATCH_SIZE);
        for (const docRef of chunk) {
          batch.delete(docRef);
        }
        try {
          await batch.commit();
          deletedRecordsCount += chunk.length;
        } catch (batchErr: any) {
          console.error("Batch delete chunk error:", batchErr);
          // Try individual deletes if batch commit encounters an issue
          for (const docRef of chunk) {
            try {
              await docRef.delete();
              deletedRecordsCount++;
            } catch {}
          }
        }
      }

      // Preserved audit log (do NOT delete activityLogs)
      try {
        await database.collection("activityLogs").add({
          action: "USER_PERMANENTLY_DELETED",
          actorId: callerUid || "super_admin_session",
          actorEmail: callerEmail || null,
          actorRole: "super_admin",
          targetUserId: targetDocId,
          targetEmail: targetEmail || null,
          targetRole: targetRole || null,
          deletedRecordsCount,
          createdAt: new Date()
        });
      } catch (auditErr) {
        console.warn("Could not write audit log for user deletion:", auditErr);
      }
    }

    // Delete Firebase Auth account
    let authDeleted = false;
    if (hasAdminAuth()) {
      try {
        await adminAuth.deleteUser(targetDocId);
        authDeleted = true;
      } catch (authDelErr: any) {
        if (targetEmail) {
          try {
            const authUser = await adminAuth.getUserByEmail(targetEmail);
            await adminAuth.deleteUser(authUser.uid);
            authDeleted = true;
          } catch {
            // Target user was not present in Firebase Auth
          }
        }
      }
    }

    return json(200, {
      success: true,
      userId: targetDocId,
      targetEmail: targetEmail || null,
      deletedRecordsCount,
      authDeleted
    });
  } catch (error: any) {
    console.error("Super Admin user delete handler error:", error);
    const status = error?.statusCode || 500;
    const message = error?.message || "Unable to permanently delete user account.";
    return json(status, { error: message });
  }
};
