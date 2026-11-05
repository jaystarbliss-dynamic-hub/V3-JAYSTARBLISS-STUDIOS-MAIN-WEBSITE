import type { Handler } from "@netlify/functions";
import { randomBytes } from "node:crypto";
import { adminAuth, adminDb } from "../../api/_lib/firebase-admin";

const ADMIN_ROLES = new Set(["super_admin", "cms_admin", "academic_admin", "finance_admin", "content_admin", "education_admin", "services_admin"]);
const ROLE_ALIASES: Record<string, string> = {
  SUPER_ADMIN: "super_admin",
  CMS_ADMIN: "cms_admin",
  ACADEMIC_ADMIN: "academic_admin",
  FINANCE_ADMIN: "finance_admin",
  CONTENT_ADMIN: "cms_admin",
  EDUCATION_ADMIN: "academic_admin",
  SERVICES_ADMIN: "services_admin",
  STUDENT: "student",
  PARENT: "parent",
  TUTOR: "staff",
  STAFF: "staff",
  SCHOOL: "school",
  USER: "user"
};

const json = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body)
});

const getToken = (event: any) => {
  const header = event.headers?.authorization || event.headers?.Authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
};

const getTemporaryPassword = () => {
  const raw = randomBytes(18).toString("base64url");
  return `Jb!${raw.slice(0, 18)}9#`;
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error: "Method Not Allowed" });

  try {
    const token = getToken(event);
    if (!token) return json(401, { error: "Authentication required." });

    const decoded = await adminAuth.verifyIdToken(token);
    const caller = (await adminDb.collection("users").doc(decoded.uid).get()).data() || {};
    const callerRole = String(caller.role || "").toLowerCase();

    if (!ADMIN_ROLES.has(callerRole)) {
      return json(403, { error: "Administrator permissions are required." });
    }

    const body = JSON.parse(event.body || "{}");
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const requestedRole = String(body.role || "USER").toUpperCase();
    const role = ROLE_ALIASES[requestedRole];
    const forcePasswordReset = body.forcePasswordReset !== false;

    if (!name || !email || !email.includes("@") || !role) {
      return json(400, { error: "Valid name, email, and role are required." });
    }

    if (requestedRole === "SUPER_ADMIN" && callerRole !== "super_admin") {
      return json(403, { error: "Only a Super Admin can create another Super Admin." });
    }

    if (["CONTENT_ADMIN", "EDUCATION_ADMIN", "SERVICES_ADMIN"].includes(requestedRole) && callerRole !== "super_admin") {
      return json(403, { error: "Only a Super Admin can assign administrative roles." });
    }

    const existingByProfile = await adminDb.collection("users").where("email", "==", email).limit(1).get();
    if (!existingByProfile.empty) {
      return json(409, { error: "A user profile with this email already exists." });
    }

    let user;
    const temporaryPassword = getTemporaryPassword();
    try {
      user = await adminAuth.createUser({
        email,
        password: temporaryPassword,
        displayName: name,
        emailVerified: false,
        disabled: false
      });
    } catch (error: any) {
      if (error?.code === "auth/email-already-exists") {
        return json(409, { error: "A Firebase Auth account with this email already exists." });
      }
      throw error;
    }

    const now = new Date();
    const baseProfile = {
      email,
      name,
      role,
      accountStatus: "ACTIVE",
      forcePasswordReset,
      createdAt: now,
      updatedAt: now
    };

    try {
      await adminDb.collection("users").doc(user.uid).set(baseProfile);

      if (role === "parent") {
        await adminDb.collection("parents").doc(user.uid).set({ ...baseProfile, children: [] }, { merge: true });
      } else if (role === "student") {
        const selectedProgramIds = Array.isArray(body.selectedProgramIds)
          ? body.selectedProgramIds.map((x: unknown) => String(x || "").trim()).filter(Boolean)
          : [];
        const requestedPlan = String(body.plan || body.programName || "").trim();
        const hasExplicitProgram = selectedProgramIds.length > 0 || Boolean(requestedPlan);
        await adminDb.collection("individualStudents").doc(user.uid).set({
          fullName: name,
          email,
          status: "ACTIVE",
          accountStatus: "ACTIVE",
          firebaseUid: user.uid,
          forcePasswordReset,
          selectedProgramIds,
          assignedProgramIds: selectedProgramIds,
          assignedTrackIds: selectedProgramIds,
          pathwayStatus: hasExplicitProgram ? "CONFIGURED" : "PENDING_PROGRAMME_CONFIRMATION",
          plan: hasExplicitProgram ? requestedPlan || null : null,
          track: hasExplicitProgram ? requestedPlan || null : "Pending Programme Confirmation",
          createdAt: now,
          updatedAt: now
        }, { merge: true });
      } else if (role === "school") {
        await adminDb.collection("schools").doc(user.uid).set({
          name,
          email,
          adminUid: user.uid,
          status: "ACTIVE",
          accountStatus: "ACTIVE",
          forcePasswordReset,
          createdAt: now,
          updatedAt: now
        }, { merge: true });
      } else if (role === "staff") {
        await adminDb.collection("tutors").doc(user.uid).set({
          name,
          email,
          role: "staff",
          status: "ACTIVE",
          accountStatus: "ACTIVE",
          forcePasswordReset,
          createdAt: now,
          updatedAt: now
        }, { merge: true });
      }

      if (ADMIN_ROLES.has(role)) {
        await adminDb.collection("admins").doc(user.uid).set({
          uid: user.uid,
          email,
          name,
          role,
          status: "ACTIVE",
          createdAt: now,
          updatedAt: now
        }, { merge: true });
      }
    } catch (error) {
      try { await adminAuth.deleteUser(user.uid); } catch (cleanupError) { console.error("Admin onboarding rollback failed:", cleanupError); }
      throw error;
    }

    return json(201, {
      success: true,
      uid: user.uid,
      role,
      name,
      email,
      temporaryPassword,
      forcePasswordReset,
      note: "Share the temporary password securely. The user should replace it immediately after first sign-in."
    });
  } catch (error) {
    console.error("Admin onboarding error:", error);
    return json(500, { error: "Unable to onboard user securely." });
  }
};
