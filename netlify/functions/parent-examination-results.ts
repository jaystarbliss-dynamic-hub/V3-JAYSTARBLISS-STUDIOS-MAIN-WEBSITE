import type { Handler } from "@netlify/functions";
import { adminAuth, adminDb } from "../../api/_lib/firebase-admin";
import {
  attemptBelongsToLinkedChild,
  computeExamMaxScore,
  calculateScorePercentage,
  resolvePartnerSchoolName,
  normalizeClassName,
} from "../../api/_lib/jdi-assessment.js";

const json = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});
const bearer = (event: any) => {
  const header = event.headers?.authorization || event.headers?.Authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
};
const iso = (value: any): string | undefined => {
  if (!value) return undefined;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};
const nameOf = (student: any) =>
  String(
    student.fullName ||
      student.studentName ||
      student.name ||
      [student.firstName, student.lastName].filter(Boolean).join(" ") ||
      "Learner"
  );
const blocked = (value: unknown) =>
  ["DISABLED", "SUSPENDED", "BANNED"].includes(String(value || "").trim().toUpperCase());

async function linkedChildren(parentUid: string, parentEmail?: string) {
  const found = new Map<
    string,
    { id: string; name: string; className: string; schoolId: string; schoolName: string; studentUid: string; source: string }
  >();
  const registerDoc = (doc: any, collectionName: string) => {
    const data = doc.data();
    const existing = found.get(doc.id);
    const rawClass = String(data.className || data.class || data.grade || data.classLevel || existing?.className || "");
    found.set(doc.id, {
      id: doc.id,
      name: nameOf(data) !== "Learner" ? nameOf(data) : existing?.name || "Learner",
      className: normalizeClassName(rawClass) || rawClass,
      schoolId: String(data.schoolId || data.school_id || existing?.schoolId || ""),
      schoolName: resolvePartnerSchoolName(data.schoolName, existing?.schoolName),
      studentUid: String(data.firebaseUid || data.userId || data.uid || existing?.studentUid || "").trim(),
      source: collectionName,
    });
  };
  for (const collectionName of ["individualStudents", "students"]) {
    for (const field of ["parentId", "guardianId", "parentUid", "parentUserId", "parentFirebaseUid"]) {
      const snap = await adminDb.collection(collectionName).where(field, "==", parentUid).limit(100).get();
      snap.forEach(doc => registerDoc(doc, collectionName));
    }
    if (parentEmail) {
      for (const field of ["parentEmail", "guardianEmail"]) {
        const snap = await adminDb.collection(collectionName).where(field, "==", parentEmail.toLowerCase()).limit(100).get();
        snap.forEach(doc => registerDoc(doc, collectionName));
      }
    }
  }
  return found;
}

export const handler: Handler = async event => {
  try {
    if (event.httpMethod !== "GET") {
      return {
        ...json(405, { error: "Method not allowed." }),
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store", Allow: "GET" },
      };
    }
    const token = bearer(event);
    if (!token) return json(401, { error: "Please sign in again." });
    const decoded = await adminAuth.verifyIdToken(token);
    const userSnap = await adminDb.collection("users").doc(decoded.uid).get();
    if (!userSnap.exists) return json(403, { error: "Portal profile not found." });
    const user = userSnap.data() || {};
    if (String(user.role || "").trim().toUpperCase() !== "PARENT") {
      return json(403, { error: "Parent access is required." });
    }
    if (blocked(user.accountStatus || user.status)) {
      return json(403, { error: "This account is not active." });
    }

    const parentEmail = String(decoded.email || user.email || "").toLowerCase().trim();
    const children = await linkedChildren(decoded.uid, parentEmail);
    if (!children.size) return json(200, { children: [], results: [] });

    const attemptsById = new Map<string, any>();
    for (const [childId, child] of children.entries()) {
      const snapById = await adminDb.collection("jdiExamAttempts").where("studentId", "==", childId).limit(200).get();
      snapById.forEach(doc => {
        const attempt = doc.data();
        if (!attempt.releasedAt && !attempt.resultReleased && attempt.status !== "graded") return;
        attemptsById.set(doc.id, { id: doc.id, ...attempt, resolvedChildId: childId });
      });
      if (child.studentUid && child.studentUid !== childId) {
        const snapByUid = await adminDb.collection("jdiExamAttempts").where("studentUid", "==", child.studentUid).limit(200).get();
        snapByUid.forEach(doc => {
          const attempt = doc.data();
          if (!attempt.releasedAt && !attempt.resultReleased && attempt.status !== "graded") return;
          attemptsById.set(doc.id, { id: doc.id, ...attempt, resolvedChildId: childId });
        });
      }
    }

    const schoolNameCache = new Map<string, string>();
    const results = await Promise.all(
      [...attemptsById.values()].map(async attempt => {
        const examId = String(attempt.examId || "");
        if (!examId) return null;
        let examSnap = await adminDb.collection("jdiExams").doc(examId).get();
        if (!examSnap.exists) {
          examSnap = await adminDb.collection("schoolExams").doc(examId).get();
        }
        if (!examSnap.exists) return null;
        const exam = examSnap.data() || {};
        const child = children.get(String(attempt.resolvedChildId || attempt.studentId));
        if (!child) return null;

        const schoolId = String(attempt.schoolId || exam.schoolId || child.schoolId || "").trim();
        let resolvedSchoolName = schoolNameCache.get(schoolId) || "";
        if (schoolId && !resolvedSchoolName) {
          const sSnap = await adminDb.collection("schools").doc(schoolId).get().catch(() => null);
          if (sSnap?.exists) {
            const sd = sSnap.data() || {};
            resolvedSchoolName = resolvePartnerSchoolName(sd.name, sd.schoolName, sd.institutionName);
            if (resolvedSchoolName) schoolNameCache.set(schoolId, resolvedSchoolName);
          }
        }
        const schoolName = resolvePartnerSchoolName(
          resolvedSchoolName,
          attempt.schoolName,
          exam.schoolName,
          child.schoolName
        );

        const rawScore = attempt.score;
        const score = rawScore === null || rawScore === undefined || rawScore === "" ? NaN : Number(rawScore);
        const maxScore = computeExamMaxScore(exam, attempt);
        const percentage =
          Number.isFinite(score) && maxScore > 0 ? calculateScorePercentage(score, maxScore) : undefined;

        return {
          attemptId: attempt.id,
          examId,
          studentId: child.id,
          studentName: child.name,
          className: child.className,
          schoolId,
          schoolName,
          title: String(exam.title || "Examination"),
          subject: String(exam.subject || ""),
          status: String(attempt.status || "submitted"),
          ...(Number.isFinite(score) ? { score } : {}),
          ...(maxScore > 0 ? { maxScore } : {}),
          ...(percentage !== undefined ? { percentage } : {}),
          submittedAt: iso(attempt.submittedAt),
          releasedAt: iso(attempt.releasedAt),
          feedback: String(attempt.feedback || ""),
        };
      })
    );
    results.sort((a, b) => String(b?.releasedAt || "").localeCompare(String(a?.releasedAt || "")));
    return json(200, {
      children: [...children.values()]
        .map(child => ({ id: child.id, name: child.name, className: child.className, schoolName: child.schoolName }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      results: results.filter(Boolean),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load examination results.";
    if (message.includes("Firebase ID token") || message.includes("auth/")) {
      return json(401, { error: "Please sign in again." });
    }
    console.error("Parent examination results failed", error);
    return json(500, { error: "Unable to load examination results right now." });
  }
};
