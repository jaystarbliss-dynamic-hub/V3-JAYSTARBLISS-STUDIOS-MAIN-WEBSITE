import type { Handler } from "@netlify/functions";
import { createHash } from "node:crypto";
import { adminAuth, adminDb } from "../../api/_lib/firebase-admin";

const normalizeUsername = (value: string) => value.toLowerCase().replace(/^@/, "").replace(/\s+/g, "");
const normalizeCode = (value: string) => value.trim().toUpperCase();
const hashAccessCode = (value: string) => createHash("sha256").update(normalizeCode(value)).digest("hex");
const isBlocked = (data: Record<string, any>) => ["SUSPENDED", "BANNED", "DISABLED"].includes(String(data.accountStatus || data.status || "ACTIVE").toUpperCase());

async function findStudent(identifier: string, db: FirebaseFirestore.Firestore) {
  const raw = identifier.trim();
  const email = raw.toLowerCase();
  const username = normalizeUsername(raw);
  const upperRaw = raw.toUpperCase();

  // 1. Search in individualStudents
  const byUsername = await db.collection("individualStudents").where("username", "==", username).limit(1).get();
  if (!byUsername.empty) return byUsername.docs[0];

  if (email.includes("@")) {
    const byEmail = await db.collection("individualStudents").where("email", "==", email).limit(1).get();
    if (!byEmail.empty) return byEmail.docs[0];
  }

  const byCode = await db.collection("individualStudents").where("accessCode", "==", upperRaw).limit(1).get();
  if (!byCode.empty) return byCode.docs[0];

  // Newer onboarding flows intentionally persist only a hash, not the plaintext
  // access code. Support access-code-as-identifier without weakening verification.
  const byCodeHash = await db.collection("individualStudents").where("accessCodeHash", "==", hashAccessCode(raw)).limit(1).get();
  if (!byCodeHash.empty) return byCodeHash.docs[0];

  try { 
    const byId = await db.collection("individualStudents").doc(raw).get(); 
    if (byId.exists) return byId; 
  } catch {}

  // 2. Search in students collection
  const legacyByUsername = await db.collection("students").where("username", "==", username).limit(1).get();
  if (!legacyByUsername.empty) return legacyByUsername.docs[0];

  if (email.includes("@")) {
    const legacyByEmail = await db.collection("students").where("email", "==", email).limit(1).get();
    if (!legacyByEmail.empty) return legacyByEmail.docs[0];
  }

  const legacyByCode = await db.collection("students").where("accessCode", "==", upperRaw).limit(1).get();
  if (!legacyByCode.empty) return legacyByCode.docs[0];

  const legacyByCodeHash = await db.collection("students").where("accessCodeHash", "==", hashAccessCode(raw)).limit(1).get();
  if (!legacyByCodeHash.empty) return legacyByCodeHash.docs[0];

  try { 
    const legacyById = await db.collection("students").doc(raw).get(); 
    if (legacyById.exists) return legacyById; 
  } catch {}

  return null;
}

async function getOrCreateUid(email: string | undefined, displayName: string, fallbackKey: string, preferredUid?: string) {
  if (preferredUid) {
    try { await adminAuth.getUser(preferredUid); return preferredUid; } catch {}
  }
  if (email) {
    try { return (await adminAuth.getUserByEmail(email)).uid; } catch {}
  }
  const safeKey = fallbackKey.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "record";
  const syntheticEmail = `portal-${safeKey}@${email ? "jdh-student.local" : "jdh-portal.local"}`;
  try { return (await adminAuth.getUserByEmail(syntheticEmail)).uid; } catch {}
  return (await adminAuth.createUser({ email: email || syntheticEmail, displayName })).uid;
}

const getExistingUserStatus = async (uid: string) => {
  const userSnap = await adminDb.collection("users").doc(uid).get();
  const data = userSnap.exists ? userSnap.data() || {} : {};
  return { exists: userSnap.exists, data };
};
const isAuthDisabled = (user: { disabled?: boolean }) => user.disabled === true;
const normaliseRole = (value: unknown) => String(value || "").trim().toLowerCase();

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
  try {
    const body = JSON.parse(event.body || "{}");
    const role = String(body.role || "").toLowerCase();
    const identifier = String(body.identifier || "").trim();
    const code = String(body.code || "").trim();
    if (!["student", "school"].includes(role) || !identifier || !code || code.length > 128) {
      return { statusCode: 400, body: JSON.stringify({ error: "Invalid login request." }) };
    }

    let uid = "";
    let profile: Record<string, any> = {};
    let response: Record<string, any> = {};

    if (role === "student") {
      const snap = await findStudent(identifier, adminDb);
      if (!snap) return { statusCode: 401, body: JSON.stringify({ error: "Invalid student credentials." }) };
      profile = snap.data() || {};

      const rawCode = code.trim();
      const suppliedCodeHashUpper = hashAccessCode(rawCode);
      const suppliedCodeHashExact = createHash("sha256").update(rawCode).digest("hex");
      const storedAccessHash = String(profile.accessCodeHash || "").trim().toLowerCase();
      const storedPasswordHash = String(profile.passwordHash || profile.customPasswordHash || "").trim().toLowerCase();
      const legacyCode = String(profile.accessCode || profile.passcode || profile.code || "").trim();

      const codeMatches =
        (storedPasswordHash && storedPasswordHash === suppliedCodeHashExact) ||
        (storedAccessHash && (storedAccessHash === suppliedCodeHashExact || storedAccessHash === suppliedCodeHashUpper)) ||
        (legacyCode && (legacyCode.toUpperCase() === rawCode.toUpperCase() || legacyCode === rawCode));

      if (!codeMatches || isBlocked(profile)) {
        return { statusCode: 401, body: JSON.stringify({ error: "Invalid student access code or credentials." }) };
      }

      if (profile.portalAccessEnabled === false) {
        return { statusCode: 403, body: JSON.stringify({ error: "Student portal access is disabled for this account." }) };
      }

      const tutorId = String(profile.tutorId || profile.staffId || profile.assignedTutorId || profile.assignedStaffId || profile.instructorId || "").trim();
      const schoolId = String(profile.schoolId || "").trim();

      uid = await getOrCreateUid(
        typeof profile.email === "string" && profile.email.includes("@") ? profile.email.toLowerCase() : undefined,
        String(profile.fullName || profile.studentName || profile.username || "Student"),
        `student-${snap.id}`,
        typeof profile.firebaseUid === "string" ? profile.firebaseUid : undefined
      );

      const existingUser = await getExistingUserStatus(uid);
      if (existingUser.exists) {
        const existingRole = normaliseRole(existingUser.data.role);
        const existingStudentDocId = String(existingUser.data.studentDocId || "").trim();
        const isStudentRole = existingRole === "student" || existingRole === "students" || existingRole.includes("student");
        if (existingRole && !isStudentRole && existingStudentDocId !== snap.id) {
          return { statusCode: 409, body: JSON.stringify({ error: "This identity is already linked to a different portal role. Ask an administrator to correct the account link." }) };
        }
        if (isStudentRole && existingStudentDocId && existingStudentDocId !== snap.id) {
          return { statusCode: 409, body: JSON.stringify({ error: "This student identity is already linked to another student record." }) };
        }
      }
      if (existingUser.exists && isBlocked(existingUser.data)) {
        return { statusCode: 401, body: JSON.stringify({ error: "This student account is currently disabled." }) };
      }

      const authUser = await adminAuth.getUser(uid);
      if (isAuthDisabled(authUser)) {
        return { statusCode: 401, body: JSON.stringify({ error: "This student account is disabled in authentication." }) };
      }

      const updates: Record<string, unknown> = { firebaseUid: uid, authEmail: authUser.email || null, portalAccessEnabled: true, updatedAt: new Date() };
      if (!storedAccessHash && legacyCode) updates.accessCodeHash = hashAccessCode(legacyCode);
      await snap.ref.set(updates, { merge: true });

      await adminDb.collection("users").doc(uid).set({
        email: authUser.email || null,
        name: profile.fullName || profile.studentName || profile.username || "Student",
        fullName: profile.fullName || profile.studentName || profile.username || "Student",
        role: "STUDENT",
        studentDocId: snap.id,
        schoolId: schoolId || null,
        schoolName: profile.schoolName || "",
        tutorId: tutorId || null,
        portalAccessEnabled: true,
        accountStatus: "ACTIVE",
        status: "ACTIVE",
        updatedAt: new Date()
      }, { merge: true });

      response = {
        role: "student",
        studentDocId: snap.id,
        name: profile.fullName || profile.studentName || profile.username,
        username: profile.username || "",
        class: profile.class || profile.grade || "",
        schoolId,
        tutorId,
        schoolName: profile.schoolName || ""
      };
    } else {
      const raw = identifier;
      const inputCode = normalizeCode(code);
      let schoolSnap: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot | null = null;
      if (raw.includes("@")) {
        const q = await adminDb.collection("schools").where("email", "==", raw.toLowerCase()).limit(1).get();
        if (!q.empty) schoolSnap = q.docs[0];
      }
      if (!schoolSnap) { try { const d = await adminDb.collection("schools").doc(raw).get(); if (d.exists) schoolSnap = d; } catch {} }
      if (!schoolSnap) { const q = await adminDb.collection("schools").where("schoolId", "==", raw).limit(1).get(); if (!q.empty) schoolSnap = q.docs[0]; }
      if (!schoolSnap) return { statusCode: 401, body: JSON.stringify({ error: "Invalid school credentials." }) };
      profile = schoolSnap.data() || {};
      const storedHash = String(profile.accessCodeHash || "").trim().toLowerCase();
      const legacyCode = String(profile.accessCode || "").trim().toUpperCase();
      const codeMatches = storedHash ? storedHash === hashAccessCode(inputCode) : !!legacyCode && legacyCode === inputCode;
      if (!codeMatches || isBlocked(profile)) return { statusCode: 401, body: JSON.stringify({ error: "Invalid school credentials." }) };
      const email = typeof profile.email === "string" && profile.email.includes("@") ? profile.email.toLowerCase() : undefined;
      uid = await getOrCreateUid(email, String(profile.name || "Partner School"), `school-${schoolSnap.id}`, String(profile.adminUid || profile.userId || "") || undefined);
      const existingUser = await getExistingUserStatus(uid);
      if (existingUser.exists) {
        const existingRole = normaliseRole(existingUser.data.role);
        const existingSchoolId = String(existingUser.data.schoolId || "").trim();
        if (existingRole && existingRole !== "school" && !existingRole.includes("school") && (existingSchoolId && existingSchoolId !== schoolSnap.id)) {
          return { statusCode: 409, body: JSON.stringify({ error: "This school identity is already linked to another portal account." }) };
        }
      }
      if (existingUser.exists && isBlocked(existingUser.data)) return { statusCode: 401, body: JSON.stringify({ error: "This school account is currently disabled." }) };
      const authUser = await adminAuth.getUser(uid);
      if (isAuthDisabled(authUser)) return { statusCode: 401, body: JSON.stringify({ error: "This school account is disabled in authentication." }) };
      const schoolUpdates: Record<string, unknown> = { updatedAt: new Date() };
      if (!storedHash && legacyCode) schoolUpdates.accessCodeHash = hashAccessCode(legacyCode);
      if (Object.keys(schoolUpdates).length > 1) await schoolSnap.ref.set(schoolUpdates, { merge: true });
      await adminDb.collection("users").doc(uid).set({
        email: email || authUser.email || null,
        name: profile.name || "Partner School",
        fullName: profile.name || "Partner School",
        role: "SCHOOL",
        schoolId: schoolSnap.id,
        schoolName: profile.name || "",
        accountStatus: "ACTIVE",
        status: "ACTIVE",
        updatedAt: new Date()
      }, { merge: true });
      response = { role: "school", schoolDocId: schoolSnap.id, schoolId: schoolSnap.id, name: profile.name || "Partner School" };
    }

    const customToken = await adminAuth.createCustomToken(uid, { role: response.role, schoolId: response.schoolId || "", tutorId: response.tutorId || "" });
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({ customToken, ...response })
    };
  } catch (error) {
    console.error("Portal access login error:", error);
    return { statusCode: 500, body: JSON.stringify({ error: "Unable to complete portal login." }) };
  }
};
