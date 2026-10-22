import type { Handler } from "@netlify/functions";
import { adminAuth, adminDb } from "../../api/_lib/firebase-admin";

const json = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body)
});

const bearer = (event: any) => {
  const value = event.headers?.authorization || event.headers?.Authorization || "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
};

const normalizeRole = (value: unknown) => String(value || "").trim().toLowerCase();
const isStudent = (profile: Record<string, any>) => normalizeRole(profile.role).includes("student");
const isBlocked = (profile: Record<string, any>) =>
  ["DISABLED", "SUSPENDED", "BANNED"].includes(String(profile.accountStatus || profile.status || "ACTIVE").toUpperCase());

export const handler: Handler = async event => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  try {
    const token = bearer(event);
    if (!token) return json(401, { error: "Authentication required." });

    const decoded = await adminAuth.verifyIdToken(token);
    const [userSnap, individualSnap, studentSnap, authUser] = await Promise.all([
      adminDb.collection("users").doc(decoded.uid).get(),
      adminDb.collection("individualStudents").doc(decoded.uid).get(),
      adminDb.collection("students").doc(decoded.uid).get(),
      adminAuth.getUser(decoded.uid)
    ]);

    if (authUser.disabled) return json(403, { error: "This student account is disabled in authentication." });

    const user = userSnap.exists ? userSnap.data() || {} : {};
    const directStudent = individualSnap.exists
      ? individualSnap.data() || {}
      : studentSnap.exists ? studentSnap.data() || {} : {};
    const studentId = String(user.studentDocId || user.studentId || user.individualStudentId || "").trim();

    let linkedStudent: Record<string, any> = {};
    if (studentId) {
      const [individualLinked, studentLinked] = await Promise.all([
        adminDb.collection("individualStudents").doc(studentId).get(),
        adminDb.collection("students").doc(studentId).get()
      ]);
      if (individualLinked.exists) linkedStudent = individualLinked.data() || {};
      else if (studentLinked.exists) linkedStudent = studentLinked.data() || {};
    }

    const profiles = [user, directStudent, linkedStudent].filter(profile => Object.keys(profile).length > 0);
    if (!profiles.some(isStudent)) return json(403, { error: "This email account is not registered as a student." });
    if (profiles.some(isBlocked)) return json(403, { error: "This student account is currently disabled." });
    if (profiles.some(profile => profile.portalAccessEnabled === false)) {
      return json(403, { error: "Student portal access is disabled for this account." });
    }

    const profile = Object.keys(linkedStudent).length ? linkedStudent : directStudent;
    const recordId = studentId || (Object.keys(directStudent).length ? decoded.uid : "");
    const schoolId = String(profile.schoolId || user.schoolId || "").trim();
    const parentId = String(profile.parentId || user.parentId || "").trim();
    const name = profile.fullName || profile.studentName || profile.name || user.fullName || user.name || authUser.displayName || "Student";

    return json(200, {
      role: "student",
      studentDocId: recordId,
      name,
      username: profile.username || user.username || "",
      class: profile.class || profile.grade || "",
      schoolId,
      schoolName: profile.schoolName || user.schoolName || "",
      parentId,
      isIndependent: profile.isIndependent === true || user.isIndependent === true || (!schoolId && !parentId)
    });
  } catch (error) {
    console.error("Authenticated student portal check failed:", error instanceof Error ? error.message : String(error));
    return json(500, { error: "Unable to verify this student account." });
  }
};
