import type { Handler } from "@netlify/functions";
import { adminAuth, adminDb } from "../../api/_lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  normalizeQuestions,
  isAssessmentStudentRole,
  canAuthorOrMutateExam,
  canManageExamRecord,
  classesMatch,
  normalizeClassName,
  normalizeClassList,
  computeExamMaxScore,
  calculateScorePercentage,
  resolvePartnerSchoolName,
  normalizeDeliveryMode,
  validateExamCreationPayload,
  isStudentEligibleForWork,
  isAttemptResultReleased,
} from "../../api/_lib/jdi-assessment.js";

let cachedStudentExamSnapshots: { expiresAt: number; docs: any[] } | null = null;

const json = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});

const bearer = (event: any) => {
  const value = event.headers?.authorization || event.headers?.Authorization || "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
};

const hashCode = (salt: string, code: string) =>
  createHash("sha256")
    .update(salt + ":" + code.trim().toUpperCase())
    .digest("hex");

const hashLegacyExact = (salt: string, code: string) =>
  createHash("sha256")
    .update(salt + ":" + code)
    .digest("hex");

const constantEqual = (a: string, b: string) => {
  const aa = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return aa.length === bb.length && timingSafeEqual(aa, bb);
};

const norm = (value: unknown) => String(value || "").trim().toUpperCase();
const staffRoles = ["TUTOR", "STAFF", "INSTRUCTOR", "TEACHER", "FACULTY"];
const adminRoles = [
  "SUPER_ADMIN",
  "SUPERADMIN",
  "ADMIN",
  "CONTENT_ADMIN",
  "EDUCATION_ADMIN",
  "SERVICES_ADMIN",
  "MARKETING_ADMIN",
  "SUPPORT_ADMIN",
];

async function caller(event: any) {
  const token = bearer(event);
  if (!token) throw new Error("AUTH");
  const decoded = await adminAuth.verifyIdToken(token);
  const snap = await adminDb.collection("users").doc(decoded.uid).get();
  if (!snap.exists) throw new Error("PROFILE");
  const user = snap.data() || {};
  if (["DISABLED", "SUSPENDED", "BANNED"].includes(norm(user.accountStatus || user.status))) {
    throw new Error("INACTIVE");
  }
  return { uid: decoded.uid, email: String(decoded.email || user.email || "").toLowerCase(), role: norm(user.role), user };
}

async function getStudent(uid: string, userDoc?: Record<string, any>): Promise<{ id: string; data: Record<string, any> } | null> {
  const studentDocId = String(userDoc?.studentDocId || "").trim();
  const mergeStudentFields = (primary: Record<string, any>, secondary: Record<string, any> = {}): Record<string, any> => ({
    ...secondary,
    ...primary,
    schoolId: primary.schoolId || secondary.schoolId || userDoc?.schoolId || "",
    schoolName: primary.schoolName || secondary.schoolName || userDoc?.schoolName || "",
    class:
      primary.class ||
      primary.className ||
      primary.grade ||
      secondary.class ||
      secondary.className ||
      secondary.grade ||
      userDoc?.class ||
      userDoc?.className ||
      "",
    fullName:
      primary.fullName ||
      primary.studentName ||
      primary.name ||
      secondary.fullName ||
      secondary.studentName ||
      secondary.name ||
      userDoc?.fullName ||
      userDoc?.name ||
      "",
  });

  if (studentDocId) {
    const [indSnap, stdSnap] = await Promise.all([
      adminDb.collection("individualStudents").doc(studentDocId).get().catch(() => null),
      adminDb.collection("students").doc(studentDocId).get().catch(() => null),
    ]);
    if (stdSnap?.exists || indSnap?.exists) {
      return {
        id: studentDocId,
        data: mergeStudentFields(stdSnap?.data() || {}, indSnap?.data() || {}),
      };
    }
  }
  for (const collectionName of ["students", "individualStudents"]) {
    const direct = await adminDb.collection(collectionName).doc(uid).get();
    if (direct.exists) return { id: direct.id, data: mergeStudentFields(direct.data() || {}) };
  }
  for (const collectionName of ["students", "individualStudents"]) {
    const q = await adminDb.collection(collectionName).where("firebaseUid", "==", uid).limit(1).get();
    if (!q.empty) return { id: q.docs[0].id, data: mergeStudentFields(q.docs[0].data()) };
    const q2 = await adminDb.collection(collectionName).where("userId", "==", uid).limit(1).get();
    if (!q2.empty) return { id: q2.docs[0].id, data: mergeStudentFields(q2.docs[0].data()) };
  }
  if (userDoc && isAssessmentStudentRole(userDoc.role)) {
    return { id: studentDocId || uid, data: userDoc };
  }
  return null;
}

async function resolveSchoolNameById(schoolId: string, fallback = ""): Promise<string> {
  if (!schoolId) return resolvePartnerSchoolName(fallback);
  try {
    const snap = await adminDb.collection("schools").doc(schoolId).get();
    if (snap.exists) {
      const data = snap.data() || {};
      return resolvePartnerSchoolName(data.name, data.schoolName, data.institutionName, fallback);
    }
    const byCode = await adminDb.collection("schools").where("schoolCode", "==", schoolId).limit(1).get();
    if (!byCode.empty) {
      const data = byCode.docs[0].data() || {};
      return resolvePartnerSchoolName(data.name, data.schoolName, data.institutionName, fallback);
    }
  } catch (err) {
    console.warn("Could not resolve school name for", schoolId, err);
  }
  return resolvePartnerSchoolName(fallback);
}

async function resolveTutorSchoolIds(callerInfo: any): Promise<string[]> {
  const ids = new Set<string>();
  const direct = String(callerInfo.user?.schoolId || callerInfo.user?.school_id || "").trim();
  if (direct) ids.add(direct);
  if (Array.isArray(callerInfo.user?.schoolIds)) {
    callerInfo.user.schoolIds.forEach((s: any) => {
      if (s) ids.add(String(s).trim());
    });
  }
  if (Array.isArray(callerInfo.user?.assignedSchools)) {
    callerInfo.user.assignedSchools.forEach((s: any) => {
      const sid = typeof s === "string" ? s : s?.id || s?.schoolId;
      if (sid) ids.add(String(sid).trim());
    });
  }
  try {
    const access = await adminDb.collection("staffSchoolAccess").doc(callerInfo.uid).get();
    if (access.exists) {
      const data = access.data() || {};
      if (data.schoolId) ids.add(String(data.schoolId).trim());
      if (Array.isArray(data.schoolIds)) {
        data.schoolIds.forEach((s: any) => {
          if (s) ids.add(String(s).trim());
        });
      }
    }
  } catch {
    // ignore
  }
  try {
    const schoolsSnap = await adminDb.collection("schools").limit(200).get();
    schoolsSnap.docs.forEach(doc => {
      const sd = doc.data() || {};
      const matchDirect =
        sd.tutorId === callerInfo.uid ||
        sd.assignedTutorId === callerInfo.uid ||
        sd.assignedStaffId === callerInfo.uid ||
        sd.staffId === callerInfo.uid;
      const matchAssignedTutors =
        Array.isArray(sd.assignedTutors) &&
        sd.assignedTutors.some((t: any) =>
          typeof t === "string"
            ? t === callerInfo.uid
            : [t?.id, t?.uid, t?.tutorId].map((x: any) => String(x || "")).includes(callerInfo.uid)
        );
      const matchAssignedStaff =
        Array.isArray(sd.assignedStaff) &&
        sd.assignedStaff.some((t: any) =>
          typeof t === "string"
            ? t === callerInfo.uid
            : [t?.id, t?.uid, t?.staffId].map((x: any) => String(x || "")).includes(callerInfo.uid)
        );
      const matchTutors =
        Array.isArray(sd.tutors) &&
        sd.tutors.some((t: any) =>
          typeof t === "string"
            ? t === callerInfo.uid
            : [t?.id, t?.uid, t?.tutorId].map((x: any) => String(x || "")).includes(callerInfo.uid) ||
              (callerInfo.email && String(t?.email || "").toLowerCase() === callerInfo.email)
        );
      if (matchDirect || matchAssignedTutors || matchAssignedStaff || matchTutors) {
        ids.add(doc.id);
      }
    });
  } catch {
    // ignore
  }
  return Array.from(ids).filter(Boolean);
}

async function permittedSchool(callerInfo: any, schoolId: string): Promise<boolean> {
  if (!schoolId) return false;
  if (adminRoles.includes(callerInfo.role)) return true;
  if (["SCHOOL", "SCHOOL_ADMIN"].includes(callerInfo.role)) {
    return String(callerInfo.user.schoolId || callerInfo.user.school_id || callerInfo.uid) === schoolId;
  }
  if (staffRoles.includes(callerInfo.role)) {
    const assigned = await resolveTutorSchoolIds(callerInfo);
    return assigned.includes(schoolId);
  }
  return false;
}

function studentSafe(exam: any) {
  const { passcodeHash, passcodeSalt, passcode, questions, answerKey, createdBy, studentIds, studentUids, ...safe } = exam;
  const normalizedClasses = normalizeClassList(exam.classIds?.length ? exam.classIds : exam.targetClass ? [exam.targetClass] : []);
  return {
    ...safe,
    classIds: normalizedClasses,
    targetClass: normalizedClasses[0] || normalizeClassName(exam.targetClass || "") || "",
    maxScore: computeExamMaxScore(exam),
    questionCount: Array.isArray(questions) ? questions.length : Number(exam.questionCount || 0),
    questions: Array.isArray(questions)
      ? questions.map((q: any) => {
          const { correctOptionIds, acceptedAnswers, answer, explanation, ...studentQuestion } = q;
          return studentQuestion;
        })
      : [],
  };
}

function tutorSafe(exam: any, callerInfo: any, schoolNameMap: Map<string, string>) {
  const { passcodeHash, passcodeSalt, studentUids, answerKey, ...safe } = exam;
  const canSeePasscode =
    adminRoles.includes(callerInfo.role) ||
    String(exam.createdBy || exam.tutorId || "") === callerInfo.uid ||
    staffRoles.includes(callerInfo.role);
  const normalizedClasses = normalizeClassList(exam.classIds?.length ? exam.classIds : exam.targetClass ? [exam.targetClass] : []);
  const resolvedSchoolName = resolvePartnerSchoolName(
    schoolNameMap.get(String(exam.schoolId || "")),
    exam.schoolName
  );
  return {
    ...safe,
    schoolName: resolvedSchoolName || (exam.audienceType === "individual" ? "Individual Learners" : ""),
    classIds: normalizedClasses,
    targetClass: normalizedClasses[0] || normalizeClassName(exam.targetClass || "") || "",
    maxScore: computeExamMaxScore(exam),
    questionCount: Array.isArray(exam.questions) ? exam.questions.length : Number(exam.questionCount || 0),
    passcode: canSeePasscode ? String(exam.passcode || "") : undefined,
    questions: Array.isArray(exam.questions) ? exam.questions : [],
  };
}

async function notifyStudentsOfPublishedExam(examId: string, examData: Record<string, any>) {
  const status = String(examData.status || "draft");
  if (status !== "scheduled" && status !== "active") return;

  const recipients = new Set<string>();
  const schoolId = String(examData.schoolId || "").trim();
  const targetClasses = normalizeClassList(
    Array.isArray(examData.classIds) && examData.classIds.length
      ? examData.classIds
      : examData.targetClass
        ? [examData.targetClass]
        : []
  );

  if (examData.audienceType === "individual") {
    if (Array.isArray(examData.studentUids)) {
      examData.studentUids.forEach((uid: any) => {
        if (uid) recipients.add(String(uid).trim());
      });
    }
    if (Array.isArray(examData.studentIds)) {
      examData.studentIds.forEach((sid: any) => {
        if (sid) recipients.add(String(sid).trim());
      });
    }
  } else if (schoolId) {
    for (const coll of ["individualStudents", "students"]) {
      try {
        const snap = await adminDb.collection(coll).where("schoolId", "==", schoolId).limit(500).get();
        snap.docs.forEach(doc => {
          const d = doc.data() || {};
          const studentClass = d.class || d.className || d.grade || d.classLevel || d.classId || "";
          if (classesMatch(studentClass, targetClasses, { allowEmptyTarget: true })) {
            const uid = String(d.firebaseUid || d.userId || d.uid || doc.id).trim();
            if (uid) recipients.add(uid);
            recipients.add(doc.id);
          }
        });
      } catch (err) {
        console.warn("Failed to query students for exam notification", coll, err);
      }
    }
  }

  const recipientList = Array.from(recipients).filter(Boolean);
  if (!recipientList.length) return;

  const classLabel = targetClasses.length ? targetClasses.join(", ") : "All Assigned Learners";
  const dateLabel = examData.availableFrom
    ? new Date(String(examData.availableFrom)).toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Now Available";

  const title =
    status === "active"
      ? `Assessment Now Active: ${examData.title}`
      : `Upcoming Assessment Scheduled: ${examData.title}`;
  const message = `${examData.title} (${examData.subject || "General"} • ${classLabel}) is ${
    status === "active" ? "now open for attempts" : `scheduled for ${dateLabel}`
  }.`;

  for (let offset = 0; offset < recipientList.length; offset += 50) {
    const chunk = recipientList.slice(offset, offset + 50);
    await Promise.all(
      chunk.map(async uid => {
        const dedupeId = createHash("sha256")
          .update(`exam-publish:${examId}:${status}:${uid}`)
          .digest("hex");
        const notifRef = adminDb.collection("jdiNotifications").doc(dedupeId);
        await adminDb
          .runTransaction(async tx => {
            const existing = await tx.get(notifRef);
            if (existing.exists) return;
            tx.create(notifRef, {
              recipientUid: uid,
              type: status === "active" ? "exam_active" : "exam_scheduled",
              title,
              message,
              examId,
              examTitle: examData.title,
              subject: examData.subject || "",
              className: classLabel,
              schoolId: schoolId || null,
              schoolName: examData.schoolName || null,
              availableFrom: examData.availableFrom || null,
              availableUntil: examData.availableUntil || null,
              status,
              isRead: false,
              createdAt: FieldValue.serverTimestamp(),
            });
          })
          .catch(() => undefined);
      })
    );
  }
}

export const handler: Handler = async event => {
  try {
    const c = await caller(event);
    const method = event.httpMethod || "GET";
    const path = String(event.path || "");

    if (method === "GET" && path.endsWith("/student-examinations")) {
      if (!isAssessmentStudentRole(c.role)) return json(403, { error: "Student access required." });
      const student = await getStudent(c.uid, c.user);
      if (!student) return json(200, { exams: [] });

      const schoolId = String(
        student.data.schoolId || student.data.school_id || student.data.schoolDocId || c.user.schoolId || ""
      ).trim();
      const studentClassRaw = String(
        student.data.class ||
          student.data.className ||
          student.data.grade ||
          student.data.classLevel ||
          student.data.classId ||
          student.data.class_id ||
          c.user.class ||
          c.user.className ||
          ""
      ).trim();
      const studentClassNormalized = normalizeClassName(studentClassRaw);

      // Reuse the bounded exam catalogue briefly across warm function invocations.
      // Without this cache, every student opening the exam page re-reads up to 300 exam docs.
      let examSnapshots = cachedStudentExamSnapshots && cachedStudentExamSnapshots.expiresAt > Date.now()
        ? cachedStudentExamSnapshots.docs
        : null;
      if (!examSnapshots) {
        const [jdiSnap, schoolExamsSnap, legacyExamsSnap] = await Promise.all([
          adminDb.collection("jdiExams").limit(100).get().catch(() => null),
          adminDb.collection("schoolExams").limit(100).get().catch(() => null),
          adminDb.collection("exams").limit(100).get().catch(() => null),
        ]);
        examSnapshots = [jdiSnap, schoolExamsSnap, legacyExamsSnap].flatMap((snap: any) => snap?.docs || []);
        cachedStudentExamSnapshots = { expiresAt: Date.now() + 60_000, docs: examSnapshots };
      }

      const examDocs = new Map<string, any>();
      for (const d of examSnapshots) {
        examDocs.set(d.id, d);
      }

      const resolvedSchoolName = schoolId
        ? await resolveSchoolNameById(schoolId, student.data.schoolName || c.user.schoolName || "")
        : "";

      const schoolAliases = new Set<string>([schoolId, resolvedSchoolName].filter(Boolean));
      if (schoolId) {
        try {
          const schDoc = await adminDb.collection("schools").doc(schoolId).get();
          if (schDoc.exists) {
            const sd = schDoc.data() || {};
            [schDoc.id, sd.schoolId, sd.code, sd.schoolCode, sd.name, sd.schoolName]
              .map(v => String(v || "").trim())
              .filter(Boolean)
              .forEach(v => schoolAliases.add(v));
          }
        } catch {
          // ignore
        }
      }

      const now = Date.now();
      const rows = Array.from(examDocs.values())
        .map(doc => {
          const raw = doc.data() || {};
          const metadata: any = { ...studentSafe(raw) };
          delete metadata.questions;
          return {
            id: doc.id,
            ...metadata,
            schoolName: resolvePartnerSchoolName(raw.schoolName, resolvedSchoolName),
            _raw: raw,
            _rawStatus: String(raw.status || "draft"),
          };
        })
        .filter((exam: any) =>
          isStudentEligibleForWork(
            {
              id: student.id,
              uid: c.uid,
              schoolId,
              schoolAliases: Array.from(schoolAliases),
              schoolName: resolvedSchoolName,
              class: studentClassNormalized || studentClassRaw,
            },
            exam._raw
          )
        )
        .map((exam: any) => {
          const from = exam.availableFrom ? new Date(exam.availableFrom).getTime() : 0;
          const until = exam.availableUntil ? new Date(exam.availableUntil).getTime() : Number.MAX_SAFE_INTEGER;
          const status =
            exam._rawStatus === "completed" || (Number.isFinite(until) && now >= until)
              ? "completed"
              : (Number.isFinite(from) && from > 0 && now < from) || exam._rawStatus === "scheduled"
                ? "upcoming"
                : exam._rawStatus === "active"
                  ? "active"
                  : "upcoming";
          const { _raw, _rawStatus, ...safeExam } = exam;
          return { ...safeExam, rawStatus: _rawStatus, status };
        });

      const [attemptsByStudentId, attemptsByUid] = await Promise.all([
        adminDb.collection("jdiExamAttempts").where("studentId", "==", student.id).limit(100).get(),
        c.uid !== student.id
          ? adminDb.collection("jdiExamAttempts").where("studentUid", "==", c.uid).limit(100).get()
          : Promise.resolve({ docs: [] as any[] }),
      ]);

      const attemptsByExam: Record<string, any> = {};
      for (const attemptDoc of [...attemptsByStudentId.docs, ...attemptsByUid.docs]) {
        const a = attemptDoc.data() || {};
        const current = attemptsByExam[String(a.examId)];
        const startedMs = a.startedAt?.toMillis?.() || (a.startedAt ? new Date(a.startedAt).getTime() : 0) || 0;
        if (!current || startedMs >= (current.startedAtMs || 0)) {
          const examDoc = examDocs.get(String(a.examId))?.data() || {};
          const maxScore = computeExamMaxScore(examDoc, a);
          const released = isAttemptResultReleased(a);
          const resolvedReleasedAt = a.releasedAt?.toDate
            ? a.releasedAt.toDate().toISOString()
            : a.releasedAt || (released ? (a.updatedAt?.toDate ? a.updatedAt.toDate().toISOString() : a.updatedAt || a.submittedAt || new Date().toISOString()) : undefined);
          attemptsByExam[String(a.examId)] = {
            attemptId: attemptDoc.id,
            attemptStatus: a.status,
            score: released ? a.score : undefined,
            maxScore,
            percentage: released && typeof a.score === "number" ? calculateScorePercentage(a.score, maxScore) : undefined,
            releasedAt: released ? resolvedReleasedAt : undefined,
            resultReleased: released,
            startedAtMs: startedMs,
          };
        }
      }

      const withAttempts = rows.map((exam: any) => {
        const a = attemptsByExam[String(exam.id)];
        if (!a) return exam;
        const { startedAtMs, ...safeAttempt } = a;
        return { ...exam, ...safeAttempt };
      });

      return json(200, {
        exams: withAttempts,
        studentClass: studentClassNormalized || studentClassRaw,
        schoolId,
        schoolName: resolvedSchoolName,
      });
    }

    if (method === "POST" && path.endsWith("/examination-passcode")) {
      if (!isAssessmentStudentRole(c.role)) return json(403, { error: "Student access required." });
      if (String(event.body || "").length > 20000) return json(413, { error: "Request too large." });
      const body = JSON.parse(event.body || "{}");
      const examId = String(body.examId || "").trim();
      const passcode = String(body.passcode || "").trim();
      if (!examId || !passcode || passcode.length > 128) {
        return json(400, { error: "Enter the assessment passcode." });
      }
      const student = await getStudent(c.uid, c.user);
      if (!student) return json(403, { error: "This account is not assigned to a student record." });

      let ref = adminDb.collection("jdiExams").doc(examId);
      let examSnap = await ref.get();
      if (!examSnap.exists) {
        ref = adminDb.collection("schoolExams").doc(examId);
        examSnap = await ref.get();
      }
      if (!examSnap.exists) return json(403, { error: "The passcode could not be validated for this assessment." });
      const exam = examSnap.data() || {};
      const now = Date.now();
      const from = exam.availableFrom ? new Date(exam.availableFrom).getTime() : 0;
      const until = exam.availableUntil ? new Date(exam.availableUntil).getTime() : Number.MAX_SAFE_INTEGER;
      const schoolId = String(
        student.data.schoolId || student.data.school_id || student.data.schoolDocId || c.user.schoolId || ""
      ).trim();
      const studentClass = String(
        student.data.class ||
          student.data.className ||
          student.data.grade ||
          student.data.classLevel ||
          student.data.classId ||
          student.data.class_id ||
          c.user.class ||
          ""
      ).trim();

      const studentSchoolName = schoolId
        ? await resolveSchoolNameById(schoolId, student.data.schoolName || c.user.schoolName || "")
        : "";
      const assigned = isStudentEligibleForWork(
        {
          id: student.id,
          uid: c.uid,
          schoolId,
          schoolName: studentSchoolName,
          class: studentClass,
        },
        exam
      );

      const active =
        exam.status === "active" &&
        (!Number.isFinite(from) || now >= from) &&
        (!Number.isFinite(until) || now < until);

      const validHash = typeof exam.passcodeHash === "string" && typeof exam.passcodeSalt === "string";
      const candidateUpper = validHash ? hashCode(exam.passcodeSalt, passcode) : "";
      const candidateExact = validHash ? hashLegacyExact(exam.passcodeSalt, passcode) : "";
      const hashMatched =
        validHash &&
        (constantEqual(candidateUpper, exam.passcodeHash) || constantEqual(candidateExact, exam.passcodeHash));
      const directMatched =
        !validHash &&
        typeof exam.passcode === "string" &&
        exam.passcode.trim().toUpperCase() === passcode.toUpperCase();
      const validCode = hashMatched || directMatched;

      const throttleRef = adminDb.collection("jdiPasscodeAttempts").doc(c.uid + "_" + examId);
      const throttleDecision = await adminDb.runTransaction(async tx => {
        const snap = await tx.get(throttleRef);
        const data = snap.data() || {};
        const nowMs = Date.now();
        const oldStart = Number(data.windowStart || 0);
        const count = nowMs - oldStart > 15 * 60 * 1000 ? 0 : Number(data.failedCount || 0);
        if (count >= 5) return { blocked: true };
        if (!validCode) {
          tx.set(
            throttleRef,
            {
              windowStart: count === 0 ? nowMs : oldStart || nowMs,
              failedCount: count + 1,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        } else if (assigned && active && snap.exists) {
          tx.delete(throttleRef);
        }
        return { blocked: false };
      });

      if (throttleDecision.blocked) {
        return json(429, { error: "Too many incorrect attempts. Wait 15 minutes before trying again." });
      }
      if (!assigned || !active || !validCode) {
        return json(403, { error: "The passcode could not be validated for this assessment." });
      }

      const resolvedDeliveryMode = normalizeDeliveryMode(exam.deliveryMode, exam);
      const externalUrl = String(exam.externalUrl || exam.url || exam.link || "").trim();

      // For external link examinations, verify passcode and return the external URL directly without creating native attempt locks
      if (resolvedDeliveryMode === "EXTERNAL_LINK" && externalUrl) {
        return json(200, {
          unlocked: true,
          deliveryMode: "EXTERNAL_LINK",
          externalUrl,
        });
      }

      const legacyAttemptId = createHash("sha256")
        .update(examId + ":" + student.id)
        .digest("hex");
      const legacyAttempt = await adminDb.collection("jdiExamAttempts").doc(legacyAttemptId).get();
      if (legacyAttempt.exists) {
        const legacy = legacyAttempt.data() || {};
        if (
          legacy.status === "in_progress" &&
          legacy.studentUid === c.uid &&
          new Date(legacy.deadlineAt).getTime() > now
        ) {
          return json(200, { attemptId: legacyAttemptId, resumed: true, deliveryMode: "NATIVE" });
        }
      }
      const legacyAttemptsUsed = legacyAttempt.exists ? 1 : 0;
      const lockId = createHash("sha256")
        .update(examId + ":" + student.id)
        .digest("hex");
      const lockRef = adminDb.collection("jdiAttemptLimits").doc(lockId);
      const attemptId = randomBytes(16).toString("hex");
      const attemptRef = adminDb.collection("jdiExamAttempts").doc(attemptId);
      const duration = Math.min(300, Math.max(1, Number(exam.durationMinutes || 30)));
      const questions = Array.isArray(exam.questions) ? exam.questions : [];
      const shuffle = <T,>(items: T[]) => {
        const copy = [...items];
        for (let i = copy.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
      };
      const questionOrder =
        exam.shuffleQuestions === true
          ? shuffle(questions.map((q: any) => String(q.id)))
          : questions.map((q: any) => String(q.id));
      const optionOrderMap: Record<string, string[]> = {};
      for (const q of questions) {
        const ids = Array.isArray(q.options) ? q.options.map((o: any) => String(o.id)) : [];
        optionOrderMap[String(q.id)] = exam.shuffleOptions === true ? shuffle(ids) : ids;
      }

      const resolvedSchoolName = await resolveSchoolNameById(
        schoolId || String(exam.schoolId || ""),
        exam.schoolName || student.data.schoolName || ""
      );
      const studentFullName = String(
        student.data.fullName ||
          student.data.studentName ||
          student.data.name ||
          [student.data.firstName, student.data.lastName].filter(Boolean).join(" ") ||
          c.user.name ||
          c.user.fullName ||
          "Student"
      ).trim();
      const canonicalStudentClass = normalizeClassName(studentClass) || studentClass;
      const maxScore = computeExamMaxScore(exam);

      const attempt = {
        examId,
        examTitle: String(exam.title || "Assessment"),
        subject: String(exam.subject || "General"),
        studentId: student.id,
        studentUid: c.uid,
        studentName: studentFullName,
        className: canonicalStudentClass,
        schoolId: schoolId || String(exam.schoolId || ""),
        schoolName: resolvedSchoolName,
        status: "in_progress",
        maxScore,
        questionsSnapshot: questions,
        startedAt: FieldValue.serverTimestamp(),
        deadlineAt: new Date(now + duration * 60000).toISOString(),
        answers: {},
        questionOrder,
        optionOrderMap,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      let resumed = false;
      let finalAttemptId = attemptId;
      await adminDb.runTransaction(async tx => {
        const [lockSnap, existingExam] = await Promise.all([tx.get(lockRef), tx.get(ref)]);
        const currentExam = existingExam.data() || {};
        const currentFrom = currentExam.availableFrom ? Date.parse(String(currentExam.availableFrom)) : 0;
        const currentUntil = currentExam.availableUntil
          ? Date.parse(String(currentExam.availableUntil))
          : Number.MAX_SAFE_INTEGER;
        if (
          !existingExam.exists ||
          currentExam.status !== "active" ||
          (Number.isFinite(currentFrom) && Date.now() < currentFrom) ||
          (Number.isFinite(currentUntil) && Date.now() >= currentUntil)
        ) {
          throw new Error("INACTIVE_EXAM");
        }
        const lock = lockSnap.data() || {};
        const maxAttempts = Math.min(10, Math.max(1, Number(existingExam.data()?.maxAttempts || 1)));
        if (lock.activeAttemptId) {
          const activeRef = adminDb.collection("jdiExamAttempts").doc(String(lock.activeAttemptId));
          const activeSnap = await tx.get(activeRef);
          const activeData = activeSnap.data() || {};
          if (
            activeSnap.exists &&
            activeData.status === "in_progress" &&
            activeData.studentUid === c.uid &&
            new Date(activeData.deadlineAt).getTime() > Date.now()
          ) {
            resumed = true;
            finalAttemptId = activeRef.id;
            return;
          }
        }
        const usedAttempts = Math.max(Number(lock.attemptCount || 0), legacyAttemptsUsed);
        if (usedAttempts >= maxAttempts) throw new Error("ATTEMPT_LIMIT");
        tx.create(attemptRef, attempt);
        tx.set(
          lockRef,
          {
            examId,
            studentId: student.id,
            studentUid: c.uid,
            schoolId: schoolId || String(exam.schoolId || ""),
            attemptCount: usedAttempts + 1,
            activeAttemptId: attemptId,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      });
      return json(200, { attemptId: finalAttemptId, resumed, deliveryMode: "NATIVE" });
    }

    if (method === "GET" && path.endsWith("/tutor-examinations")) {
      if (!canAuthorOrMutateExam(c.role)) {
        return json(403, { error: "Only authorised tutors and Super Admins can access assessment authoring data." });
      }
      const requestedSchoolId = event.queryStringParameters?.schoolId;
      const schoolId =
        adminRoles.includes(c.role) && requestedSchoolId === ""
          ? ""
          : String(requestedSchoolId || "").trim();

      const docs = new Map<string, any>();
      if (schoolId) {
        if (!(await permittedSchool(c, schoolId))) {
          return json(403, { error: "You do not have access to this school." });
        }
        const [schoolExams, schoolSpecificExams] = await Promise.all([
          adminDb.collection("jdiExams").where("schoolId", "==", schoolId).limit(150).get(),
          adminDb.collection("schoolExams").where("schoolId", "==", schoolId).limit(150).get(),
        ]);
        for (const snap of [schoolExams, schoolSpecificExams]) {
          snap.docs.forEach((d: any) => docs.set(d.id, d));
        }
      } else if (adminRoles.includes(c.role)) {
        const [allExams, allSchoolExams] = await Promise.all([
          adminDb.collection("jdiExams").limit(250).get(),
          adminDb.collection("schoolExams").limit(250).get(),
        ]);
        for (const snap of [allExams, allSchoolExams]) {
          snap.docs.forEach((d: any) => docs.set(d.id, d));
        }
      } else if (staffRoles.includes(c.role)) {
        const tutorSchoolIds = await resolveTutorSchoolIds(c);
        const [byCreatedBy, byTutorId, ...schoolSnaps] = await Promise.all([
          adminDb.collection("jdiExams").where("createdBy", "==", c.uid).limit(150).get(),
          adminDb.collection("jdiExams").where("tutorId", "==", c.uid).limit(150).get(),
          ...tutorSchoolIds.slice(0, 10).map(sid =>
            adminDb.collection("jdiExams").where("schoolId", "==", sid).limit(100).get()
          ),
        ]);
        const [schoolByCreatedBy, schoolByTutorId, ...schoolScopedSnaps] = await Promise.all([
          adminDb.collection("schoolExams").where("createdBy", "==", c.uid).limit(100).get(),
          adminDb.collection("schoolExams").where("tutorId", "==", c.uid).limit(100).get(),
          ...tutorSchoolIds.slice(0, 10).map(sid =>
            adminDb.collection("schoolExams").where("schoolId", "==", sid).limit(100).get()
          ),
        ]);
        for (const snap of [byCreatedBy, byTutorId, ...schoolSnaps, schoolByCreatedBy, schoolByTutorId, ...schoolScopedSnaps]) {
          snap.docs.forEach((d: any) => docs.set(d.id, d));
        }
      }

      const referencedSchoolIds = Array.from(
        new Set(
          Array.from(docs.values())
            .map((d: any) => String(d.data()?.schoolId || "").trim())
            .filter(Boolean)
        )
      );
      const schoolNameMap = new Map<string, string>();
      await Promise.all(
        referencedSchoolIds.map(async sid => {
          const sName = await resolveSchoolNameById(sid);
          if (sName) schoolNameMap.set(sid, sName);
        })
      );

      const examRows = Array.from(docs.values())
        .map((d: any) => ({
          id: d.id,
          ...tutorSafe(d.data(), c, schoolNameMap),
        }))
        .sort((a: any, b: any) => {
          const ta = a.updatedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
          const tb = b.updatedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
          return tb - ta;
        });

      const result: any = { exams: examRows };

      if (String(event.queryStringParameters?.includeStudents || "") === "true") {
        const tutorSchoolIds = staffRoles.includes(c.role) ? await resolveTutorSchoolIds(c) : [];
        const allowedSchoolIds = schoolId ? [schoolId] : tutorSchoolIds;
        const [individuals, schoolStudents] = await Promise.all([
          adminDb.collection("individualStudents").limit(500).get(),
          adminDb.collection("students").limit(500).get(),
        ]);
        const studentMap = new Map<string, any>();
        for (const snap of [individuals, schoolStudents]) {
          for (const d of snap.docs) {
            const s = d.data() || {};
            const linkedSchool = String(s.schoolId || s.school_id || s.schoolDocId || "").trim();
            const assigned = [s.tutorId, s.staffId, s.assignedTutorId, s.assignedStaffId, s.instructorId]
              .map((v: any) => String(v || ""))
              .includes(c.uid);
            const visible =
              adminRoles.includes(c.role) ||
              assigned ||
              (linkedSchool && allowedSchoolIds.includes(linkedSchool));
            if (visible) {
              const rawClass = String(s.className || s.classLevel || s.classId || s.class || s.grade || "").trim();
              studentMap.set(d.id, {
                id: d.id,
                name: String(s.fullName || s.studentName || s.name || "Student"),
                className: normalizeClassName(rawClass) || rawClass,
                schoolId: linkedSchool,
              });
            }
          }
        }
        result.students = Array.from(studentMap.values()).slice(0, 500);
      }
      return json(200, result);
    }

    if (method === "POST" && path.endsWith("/tutor-examinations")) {
      if (String(event.body || "").length > 500000) {
        return json(413, { error: "Assessment draft is too large." });
      }
      if (!canAuthorOrMutateExam(c.role)) {
        return json(403, { error: "Only authorised tutors and Super Admins can create or edit assessments." });
      }
      const body = JSON.parse(event.body || "{}");
      const requestedExamId = String(body.examId || body.id || "").trim();

      let existingDoc: any = null;
      if (requestedExamId) {
        const existingSnap = await adminDb.collection("jdiExams").doc(requestedExamId).get();
        if (existingSnap.exists) {
          existingDoc = existingSnap.data() || {};
          if (!canManageExamRecord(existingDoc, c.uid, c.role)) {
            return json(403, { error: "You can only edit or republish assessments that you created." });
          }
        }
      }

      let schoolId = String(body.schoolId ?? existingDoc?.schoolId ?? c.user.schoolId ?? "").trim();
      const audienceType = body.audienceType === "individual" ? "individual" : "school";
      const studentIds: string[] =
        audienceType === "individual" && Array.isArray(body.studentIds)
          ? [...new Set<string>(body.studentIds.map((v: any) => String(v).trim()).filter(Boolean))].slice(0, 200)
          : [];
      const studentUids: string[] = [];

      if (audienceType === "school") {
        if (!schoolId || !(await permittedSchool(c, schoolId))) {
          return json(403, { error: "You do not have access to this school." });
        }
      } else {
        if (!studentIds.length) {
          return json(400, { error: "Select at least one individually enrolled student." });
        }
        for (const studentId of studentIds) {
          let record: any = null;
          for (const name of ["individualStudents", "students"]) {
            const snap = await adminDb.collection(name).doc(studentId).get();
            if (snap.exists) {
              record = snap.data() || {};
              break;
            }
          }
          if (!record) return json(404, { error: "Student record not found: " + studentId });
          if (!adminRoles.includes(c.role)) {
            const assignedToTutor = [
              record.tutorId,
              record.staffId,
              record.assignedTutorId,
              record.assignedStaffId,
              record.instructorId,
            ]
              .map((v: any) => String(v || ""))
              .includes(c.uid);
            const linkedSchool = String(record.schoolId || record.school_id || "");
            const hasSchoolAccess = Boolean(linkedSchool && (await permittedSchool(c, linkedSchool)));
            if (!assignedToTutor && !hasSchoolAccess) {
              return json(403, { error: "You are not authorised to assign an assessment to student " + studentId });
            }
          }
          const uid = String(record.firebaseUid || record.userId || record.uid || studentId);
          studentUids.push(uid);
        }
        schoolId = "";
      }

      const seriesName = String(body.seriesName || "").trim().slice(0, 160);
      const courseName = String(body.courseName || "").trim().slice(0, 160);
      const learningVideoUrl = String(body.learningVideoUrl || "").trim().slice(0, 2000);
      if (learningVideoUrl) {
        try {
          const url = new URL(learningVideoUrl);
          if (!["http:", "https:"].includes(url.protocol)) throw new Error("URL");
        } catch {
          return json(400, { error: "Learning video URL must be a valid http or https link." });
        }
      }

      const validatedExam = validateExamCreationPayload(body, existingDoc);
      if ("error" in validatedExam && validatedExam.error) {
        return json(400, { error: validatedExam.error });
      }

      const {
        deliveryMode,
        title,
        subject,
        description,
        externalUrl,
        questions: normalizedQuestions,
        questionCount,
        maxScore: computedMaxScore,
        durationMinutes,
        gradingMode,
      } = validatedExam as Exclude<typeof validatedExam, { error: string }>;

      const requestedMaxAttempts = Number(body.maxAttempts ?? existingDoc?.maxAttempts ?? 1);
      if (!Number.isInteger(requestedMaxAttempts) || requestedMaxAttempts < 1 || requestedMaxAttempts > 10) {
        return json(400, { error: "Maximum attempts must be an integer from 1 to 10." });
      }

      const fromTime = body.availableFrom ? new Date(String(body.availableFrom)).getTime() : null;
      const untilTime = body.availableUntil ? new Date(String(body.availableUntil)).getTime() : null;
      if (
        (fromTime !== null && !Number.isFinite(fromTime)) ||
        (untilTime !== null && !Number.isFinite(untilTime)) ||
        (fromTime !== null && untilTime !== null && untilTime <= fromTime)
      ) {
        return json(400, { error: "The assessment closing time must be after its opening time." });
      }

      const rawPasscode = String(body.passcode || existingDoc?.passcode || randomBytes(4).toString("hex").toUpperCase()).trim();
      if (rawPasscode.length < 6 || rawPasscode.length > 128) {
        return json(400, { error: "Passcodes must be between 6 and 128 characters." });
      }
      const passcode = rawPasscode.toUpperCase();
      const salt = randomBytes(16).toString("hex");
      const status =
        body.status === "active"
          ? "active"
          : body.status === "scheduled"
            ? "scheduled"
            : body.status === "completed"
              ? "completed"
              : body.status === "archived"
                ? "archived"
                : "draft";
      if (status === "scheduled" && fromTime === null) {
        return json(400, { error: "Scheduled assessments need an opening date and time." });
      }

      const normalizedClassIds =
        audienceType === "school"
          ? normalizeClassList(
              Array.isArray(body.classIds) && body.classIds.length
                ? body.classIds
                : body.targetClass
                  ? [body.targetClass]
                  : existingDoc?.classIds || []
            )
          : [];

      const resolvedSchoolName =
        audienceType === "school"
          ? await resolveSchoolNameById(schoolId, body.schoolName || existingDoc?.schoolName || "")
          : "Individual Learners";

      const maxScore = deliveryMode === "EXTERNAL_LINK" ? 0 : computedMaxScore;
      const targetDocId =
        requestedExamId && /^[a-zA-Z0-9_-]{4,120}$/.test(requestedExamId)
          ? requestedExamId
          : adminDb.collection("jdiExams").doc().id;
      const targetRef = adminDb.collection("jdiExams").doc(targetDocId);

      // If updating an existing exam that already has attempts, preserve a snapshot of the previous questions/maxScore on those attempts
      if (existingDoc) {
        const existingAttempts = await adminDb
          .collection("jdiExamAttempts")
          .where("examId", "==", targetDocId)
          .limit(200)
          .get();
        if (!existingAttempts.empty) {
          const priorQuestions = Array.isArray(existingDoc.questions) ? existingDoc.questions : [];
          const priorMaxScore = computeExamMaxScore(existingDoc);
          const batch = adminDb.batch();
          let needsCommit = false;
          existingAttempts.docs.forEach(aDoc => {
            const aData = aDoc.data() || {};
            if (!Array.isArray(aData.questionsSnapshot) || !aData.questionsSnapshot.length) {
              batch.update(aDoc.ref, {
                questionsSnapshot: priorQuestions,
                maxScore: aData.maxScore || priorMaxScore,
              });
              needsCommit = true;
            }
          });
          if (needsCommit) await batch.commit().catch(() => undefined);
        }
      }

      const payload: Record<string, any> = {
        schoolId,
        schoolName: resolvedSchoolName,
        audienceType,
        studentIds: audienceType === "individual" ? studentIds : [],
        studentUids: audienceType === "individual" ? [...new Set(studentUids)] : [],
        classIds: normalizedClassIds,
        targetClass: normalizedClassIds[0] || (audienceType === "school" ? "All Classes" : "Individual"),
        title,
        subject,
        description,
        instructions: description,
        deliveryMode,
        externalUrl: deliveryMode === "EXTERNAL_LINK" ? externalUrl : "",
        url: deliveryMode === "EXTERNAL_LINK" ? externalUrl : "",
        seriesName,
        courseName,
        learningVideoUrl: learningVideoUrl || null,
        questions: deliveryMode === "EXTERNAL_LINK" ? [] : normalizedQuestions,
        questionCount: deliveryMode === "EXTERNAL_LINK" ? 0 : questionCount,
        maxScore,
        durationMinutes,
        maxAttempts: requestedMaxAttempts,
        shuffleQuestions: body.shuffleQuestions === true,
        shuffleOptions: body.shuffleOptions === true,
        gradingMode,
        availableFrom: body.availableFrom ? String(body.availableFrom) : null,
        availableUntil: body.availableUntil ? String(body.availableUntil) : null,
        status,
        passcode,
        passcodeSalt: salt,
        passcodeHash: hashCode(salt, passcode),
        tutorId: existingDoc?.tutorId || existingDoc?.createdBy || c.uid,
        tutorName: String(body.tutorName || existingDoc?.tutorName || c.user.name || c.user.fullName || "Faculty Tutor"),
        createdBy: existingDoc?.createdBy || c.uid,
        updatedBy: c.uid,
        updatedAt: FieldValue.serverTimestamp(),
        ...(existingDoc ? {} : { createdAt: FieldValue.serverTimestamp() }),
        ...(status === "active" || status === "scheduled" ? { publishedAt: FieldValue.serverTimestamp() } : {}),
      };

      await targetRef.set(payload, { merge: true });

      //Also mirror metadata safely to schoolExams for backward compatibility if schoolId is present
      if (schoolId) {
        const { passcodeHash: _ph, passcodeSalt: _ps, ...schoolMirror } = payload;
        await adminDb
          .collection("schoolExams")
          .doc(targetDocId)
          .set({ ...schoolMirror, id: targetDocId }, { merge: true })
          .catch(() => undefined);
      }

      if (status === "scheduled" || status === "active") {
        await notifyStudentsOfPublishedExam(targetDocId, payload).catch(err =>
          console.warn("Student exam notification warning:", err)
        );
      }

      return json(existingDoc ? 200 : 201, {
        updated: Boolean(existingDoc),
        exam: {
          id: targetDocId,
          title,
          subject,
          status,
          deliveryMode,
          externalUrl: deliveryMode === "EXTERNAL_LINK" ? externalUrl : "",
          schoolId,
          schoolName: resolvedSchoolName,
          classIds: normalizedClassIds,
          durationMinutes,
          questionCount: deliveryMode === "EXTERNAL_LINK" ? 0 : questionCount,
          maxScore,
        },
        passcode,
      });
    }


    return json(404, { error: "Assessment endpoint not found." });
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH") return json(401, { error: "Authentication required." });
    if (error instanceof Error && error.message === "PROFILE") return json(403, { error: "Portal profile not found." });
    if (error instanceof Error && error.message === "INACTIVE") return json(403, { error: "Your account is not active." });
    if (error instanceof Error && error.message === "INACTIVE_EXAM")
      return json(409, { error: "This assessment is no longer active." });
    if (error instanceof Error && error.message === "ATTEMPT_EXISTS")
      return json(409, { error: "An attempt for this assessment has already been submitted." });
    if (error instanceof Error && error.message === "ATTEMPT_LIMIT")
      return json(409, { error: "You have used all allowed attempts for this assessment." });
    console.error("JDI assessment handler failed", error);
    return json(200, { fallback: true, exams: [], error: "Server handler unavailable; using client resolver." });
  }
};
