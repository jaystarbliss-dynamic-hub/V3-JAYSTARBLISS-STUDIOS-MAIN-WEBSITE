import type { Handler } from "@netlify/functions";
import { adminAuth, adminDb } from "../../api/_lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { createHash, randomBytes } from "node:crypto";
import {
  schoolSafeQuestion,
  schoolSafeQuestionResult,
  canAuthorOrMutateExam,
  canManageExamRecord,
  resolveExamDeletionMode,
  classesMatch,
  normalizeClassName,
  normalizeClassList,
  computeExamMaxScore,
  calculateScorePercentage,
  resolvePartnerSchoolName,
  resolveAttemptQuestions,
  normalizeQuestions,
  normalizeDeliveryMode,
  validateExternalExamUrl,
} from "../../api/_lib/jdi-assessment.js";

const json = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});

const norm = (v: unknown) => String(v || "").trim().toUpperCase();

async function authUser(event: any) {
  const h = event.headers?.authorization || event.headers?.Authorization || "";
  if (!h.startsWith("Bearer ")) throw new Error("AUTH");
  const d = await adminAuth.verifyIdToken(h.slice(7));
  const s = await adminDb.collection("users").doc(d.uid).get();
  if (!s.exists) throw new Error("PROFILE");
  const u = s.data() || {};
  if (["DISABLED", "SUSPENDED", "BANNED"].includes(norm(u.status || u.accountStatus))) {
    throw new Error("INACTIVE");
  }
  return { uid: d.uid, email: String(d.email || u.email || "").toLowerCase(), role: norm(u.role), user: u };
}

const admins = [
  "SUPER_ADMIN",
  "SUPERADMIN",
  "ADMIN",
  "CONTENT_ADMIN",
  "EDUCATION_ADMIN",
  "SERVICES_ADMIN",
  "MARKETING_ADMIN",
  "SUPPORT_ADMIN",
];
const tutors = ["TUTOR", "STAFF", "INSTRUCTOR", "TEACHER", "FACULTY"];
const schoolRoles = ["SCHOOL", "SCHOOL_ADMIN", "SCHOOLADMIN"];

const statusTransitions: Record<string, string[]> = {
  draft: ["draft", "scheduled", "active", "archived"],
  scheduled: ["draft", "scheduled", "active", "completed", "archived"],
  active: ["scheduled", "active", "completed", "archived"],
  completed: ["scheduled", "active", "completed", "archived"],
  archived: ["draft", "scheduled", "archived"],
};

async function resolveCallerSchoolAliases(c: any): Promise<{ primaryId: string; name: string; aliases: string[] }> {
  const aliases = new Set<string>();
  let primaryId = String(c.user?.schoolId || c.user?.school_id || c.user?.schoolDocId || "").trim();
  let schoolName = resolvePartnerSchoolName(c.user?.schoolName);

  if (primaryId) aliases.add(primaryId);

  const ownSchool = await adminDb.collection("schools").doc(c.uid).get().catch(() => null);
  if (ownSchool?.exists) {
    if (!primaryId) primaryId = ownSchool.id;
    aliases.add(ownSchool.id);
    const sd = ownSchool.data() || {};
    schoolName = resolvePartnerSchoolName(sd.name, sd.schoolName, schoolName);
    if (sd.schoolId) aliases.add(String(sd.schoolId).trim());
    if (sd.schoolCode) aliases.add(String(sd.schoolCode).trim());
  }

  for (const candidateId of Array.from(aliases)) {
    const snap = await adminDb.collection("schools").doc(candidateId).get().catch(() => null);
    if (snap?.exists) {
      primaryId = snap.id;
      aliases.add(snap.id);
      const sd = snap.data() || {};
      schoolName = resolvePartnerSchoolName(sd.name, sd.schoolName, schoolName);
      if (sd.schoolId) aliases.add(String(sd.schoolId).trim());
      if (sd.schoolCode) aliases.add(String(sd.schoolCode).trim());
    }
  }

  if (c.email || c.uid) {
    const queries = [
      c.email ? adminDb.collection("schools").where("email", "==", c.email).limit(3).get() : Promise.resolve({ docs: [] as any[] }),
      c.email ? adminDb.collection("schools").where("contactEmail", "==", c.email).limit(3).get() : Promise.resolve({ docs: [] as any[] }),
      adminDb.collection("schools").where("adminUid", "==", c.uid).limit(3).get(),
      adminDb.collection("schools").where("firebaseUid", "==", c.uid).limit(3).get(),
    ];
    const snaps = await Promise.all(queries.map(q => q.catch(() => ({ docs: [] as any[] }))));
    for (const snap of snaps) {
      for (const doc of snap.docs) {
        if (!primaryId) primaryId = doc.id;
        aliases.add(doc.id);
        const sd = doc.data() || {};
        schoolName = resolvePartnerSchoolName(sd.name, sd.schoolName, schoolName);
        if (sd.schoolId) aliases.add(String(sd.schoolId).trim());
        if (sd.schoolCode) aliases.add(String(sd.schoolCode).trim());
      }
    }
  }

  return {
    primaryId: primaryId || c.uid,
    name: schoolName,
    aliases: Array.from(aliases).filter(Boolean),
  };
}

async function resolveTutorSchoolIds(c: any): Promise<string[]> {
  const ids = new Set<string>();
  const direct = String(c.user?.schoolId || c.user?.school_id || "").trim();
  if (direct) ids.add(direct);
  if (Array.isArray(c.user?.schoolIds)) {
    c.user.schoolIds.forEach((s: any) => {
      if (s) ids.add(String(s).trim());
    });
  }
  try {
    const s = await adminDb.collection("staffSchoolAccess").doc(c.uid).get();
    if (s.exists) {
      const d = s.data() || {};
      if (d.schoolId) ids.add(String(d.schoolId).trim());
      if (Array.isArray(d.schoolIds)) {
        d.schoolIds.forEach((sid: any) => {
          if (sid) ids.add(String(sid).trim());
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
        sd.tutorId === c.uid ||
        sd.assignedTutorId === c.uid ||
        sd.assignedStaffId === c.uid ||
        sd.staffId === c.uid;
      const matchAssignedTutors =
        Array.isArray(sd.assignedTutors) &&
        sd.assignedTutors.some((t: any) =>
          typeof t === "string"
            ? t === c.uid
            : [t?.id, t?.uid, t?.tutorId].map((x: any) => String(x || "")).includes(c.uid)
        );
      const matchAssignedStaff =
        Array.isArray(sd.assignedStaff) &&
        sd.assignedStaff.some((t: any) =>
          typeof t === "string"
            ? t === c.uid
            : [t?.id, t?.uid, t?.staffId].map((x: any) => String(x || "")).includes(c.uid)
        );
      const matchTutors =
        Array.isArray(sd.tutors) &&
        sd.tutors.some((t: any) =>
          typeof t === "string"
            ? t === c.uid
            : [t?.id, t?.uid, t?.tutorId].map((x: any) => String(x || "")).includes(c.uid) ||
              (c.email && String(t?.email || "").toLowerCase() === c.email)
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

async function canSchool(c: any, schoolId: string): Promise<boolean> {
  if (!schoolId) return false;
  if (admins.includes(c.role)) return true;
  if (schoolRoles.includes(c.role)) {
    const resolved = await resolveCallerSchoolAliases(c);
    return resolved.aliases.includes(schoolId) || resolved.primaryId === schoolId;
  }
  if (tutors.includes(c.role)) {
    const tutorSchools = await resolveTutorSchoolIds(c);
    return tutorSchools.includes(schoolId);
  }
  return false;
}

async function canManageExam(c: any, exam: any): Promise<boolean> {
  if (!canAuthorOrMutateExam(c.role)) return false;
  if (admins.includes(c.role)) return true;
  const tutorSchools = tutors.includes(c.role) ? await resolveTutorSchoolIds(c) : [];
  if (!canManageExamRecord(exam, c.uid, c.role, tutorSchools)) return false;
  const schoolId = String(exam.schoolId || "").trim();
  if (schoolId) return canSchool(c, schoolId);
  return true;
}

async function notify(uids: string[], payload: any, dedupeKey?: string) {
  const recipients = [...new Set(uids.map(uid => String(uid || "").trim()).filter(Boolean))];
  if (!recipients.length) return;
  if (dedupeKey) {
    for (let offset = 0; offset < recipients.length; offset += 50) {
      await Promise.all(
        recipients.slice(offset, offset + 50).map(async uid => {
          const id = createHash("sha256")
            .update(dedupeKey + ":" + uid)
            .digest("hex");
          const notificationRef = adminDb.collection("jdiNotifications").doc(id);
          await adminDb
            .runTransaction(async tx => {
              const existing = await tx.get(notificationRef);
              if (existing.exists) return;
              tx.create(notificationRef, {
                ...payload,
                recipientUid: uid,
                isRead: false,
                createdAt: FieldValue.serverTimestamp(),
              });
            })
            .catch(() => undefined);
        })
      );
    }
    return;
  }
  for (let offset = 0; offset < recipients.length; offset += 400) {
    const batch = adminDb.batch();
    for (const uid of recipients.slice(offset, offset + 400)) {
      const ref = adminDb.collection("jdiNotifications").doc();
      batch.set(ref, {
        ...payload,
        recipientUid: uid,
        isRead: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }
}

async function collectEligibleExamRecipients(exam: any): Promise<string[]> {
  const recipients = new Set<string>();
  if (exam.audienceType === "individual") {
    if (Array.isArray(exam.studentUids)) exam.studentUids.forEach((u: any) => recipients.add(String(u || "")));
    if (Array.isArray(exam.studentIds)) exam.studentIds.forEach((s: any) => recipients.add(String(s || "")));
  } else {
    const schoolId = String(exam.schoolId || "").trim();
    const targetClasses = normalizeClassList(
      Array.isArray(exam.classIds) && exam.classIds.length
        ? exam.classIds
        : exam.targetClass
          ? [exam.targetClass]
          : []
    );
    if (schoolId) {
      for (const coll of ["individualStudents", "students"]) {
        const snap = await adminDb
          .collection(coll)
          .where("schoolId", "==", schoolId)
          .limit(500)
          .get()
          .catch(() => ({ docs: [] as any[] }));
        snap.docs.forEach(d => {
          const data = d.data() || {};
          const rawClass = data.class || data.className || data.grade || data.classLevel || data.classId || "";
          if (classesMatch(rawClass, targetClasses, { allowEmptyTarget: true })) {
            const uid = String(data.firebaseUid || data.userId || data.uid || d.id).trim();
            if (uid) recipients.add(uid);
            recipients.add(d.id);
          }
        });
      }
      const schoolUsers = await adminDb
        .collection("users")
        .where("schoolId", "==", schoolId)
        .limit(50)
        .get()
        .catch(() => null);
      schoolUsers?.docs.forEach(d => {
        const role = String(d.data().role || "").toUpperCase();
        if (schoolRoles.includes(role)) recipients.add(d.id);
      });
    }
  }
  if (exam.createdBy) recipients.add(String(exam.createdBy));
  return Array.from(recipients).filter(Boolean);
}

export const handler: Handler = async event => {
  try {
    const c = await authUser(event);
    const method = event.httpMethod || "GET";
    const body = event.body ? JSON.parse(event.body || "{}") : {};
    const action = String(body.action || "");

    if (method === "GET") {
      const examId = String(event.queryStringParameters?.examId || "").trim();
      const requestedSchoolId = String(event.queryStringParameters?.schoolId || "").trim();

      let targetSchoolIds: string[] = [];
      const examDocMap = new Map<string, any>();

      if (schoolRoles.includes(c.role)) {
        const resolvedSchool = await resolveCallerSchoolAliases(c);
        if (requestedSchoolId && !resolvedSchool.aliases.includes(requestedSchoolId)) {
          return json(403, { error: "Not authorised for this school." });
        }
        targetSchoolIds = resolvedSchool.aliases.length ? resolvedSchool.aliases : [resolvedSchool.primaryId];
        for (const sid of targetSchoolIds.slice(0, 10)) {
          const snap = await adminDb.collection("jdiExams").where("schoolId", "==", sid).limit(150).get();
          snap.docs.forEach((d: any) => examDocMap.set(d.id, d));
        }
      } else if (admins.includes(c.role)) {
        if (requestedSchoolId) {
          targetSchoolIds = [requestedSchoolId];
          const snap = await adminDb.collection("jdiExams").where("schoolId", "==", requestedSchoolId).limit(200).get();
          snap.docs.forEach((d: any) => examDocMap.set(d.id, d));
        } else {
          const snap = await adminDb.collection("jdiExams").limit(250).get();
          snap.docs.forEach((d: any) => examDocMap.set(d.id, d));
        }
      } else if (tutors.includes(c.role)) {
        const tutorSchools = await resolveTutorSchoolIds(c);
        if (requestedSchoolId) {
          if (!tutorSchools.includes(requestedSchoolId)) {
            return json(403, { error: "Not authorised for this school." });
          }
          targetSchoolIds = [requestedSchoolId];
        } else {
          targetSchoolIds = tutorSchools;
        }
        for (const sid of targetSchoolIds.slice(0, 10)) {
          const snap = await adminDb.collection("jdiExams").where("schoolId", "==", sid).limit(150).get();
          snap.docs.forEach((d: any) => examDocMap.set(d.id, d));
        }
        const [ownCreated, ownTutor] = await Promise.all([
          adminDb.collection("jdiExams").where("createdBy", "==", c.uid).limit(150).get(),
          adminDb.collection("jdiExams").where("tutorId", "==", c.uid).limit(150).get(),
        ]);
        for (const snap of [ownCreated, ownTutor]) {
          snap.docs.forEach((d: any) => {
            if (!requestedSchoolId || String(d.data()?.schoolId || "") === requestedSchoolId) {
              examDocMap.set(d.id, d);
            }
          });
        }
      } else {
        return json(403, { error: "Not authorised to view examination history." });
      }

      let examDocs = Array.from(examDocMap.values());
      if (examId) examDocs = examDocs.filter(d => d.id === examId);

      // Resolve authoritative school names from schools/{schoolId}
      const schoolIdsToResolve = new Set<string>(targetSchoolIds);
      const examMap: Record<string, any> = {};
      for (const d of examDocs) {
        const ed = d.data() || {};
        examMap[d.id] = ed;
        if (ed.schoolId) schoolIdsToResolve.add(String(ed.schoolId).trim());
      }

      const schoolNameMap = new Map<string, string>();
      await Promise.all(
        Array.from(schoolIdsToResolve)
          .filter(Boolean)
          .map(async sid => {
            const snap = await adminDb.collection("schools").doc(sid).get().catch(() => null);
            if (snap?.exists) {
              const sd = snap.data() || {};
              const resolved = resolvePartnerSchoolName(sd.name, sd.schoolName, sd.institutionName);
              if (resolved) schoolNameMap.set(sid, resolved);
            }
          })
      );

      const attemptMap = new Map<string, any>();
      for (const sid of targetSchoolIds.slice(0, 10)) {
        const attempts = await adminDb.collection("jdiExamAttempts").where("schoolId", "==", sid).limit(500).get();
        attempts.docs.forEach((d: any) => attemptMap.set(d.id, d));
      }
      if (examDocs.length > 0 && examDocs.length <= 30) {
        const examAttempts = await Promise.all(
          examDocs.map((d: any) =>
            adminDb.collection("jdiExamAttempts").where("examId", "==", d.id).limit(300).get()
          )
        );
        examAttempts.forEach(s => s.docs.forEach((d: any) => attemptMap.set(d.id, d)));
      }
      const attemptDocs = Array.from(attemptMap.values());

      // Resolve student names & canonical classes from both individualStudents and students
      const studentMap: Record<string, { name: string; className: string; schoolId: string; schoolName: string }> = {};
      for (const sid of targetSchoolIds.slice(0, 10)) {
        for (const coll of ["individualStudents", "students"]) {
          const students = await adminDb
            .collection(coll)
            .where("schoolId", "==", sid)
            .limit(500)
            .get()
            .catch(() => ({ docs: [] as any[] }));
          for (const d of students.docs) {
            const s = d.data() || {};
            const rawClass = String(s.class || s.className || s.grade || s.classLevel || s.classId || "").trim();
            studentMap[d.id] = {
              name: String(
                s.fullName || s.studentName || s.name || [s.firstName, s.lastName].filter(Boolean).join(" ") || "Student"
              ),
              className: normalizeClassName(rawClass) || rawClass,
              schoolId: String(s.schoolId || sid),
              schoolName: resolvePartnerSchoolName(schoolNameMap.get(String(s.schoolId || sid)), s.schoolName),
            };
          }
        }
      }

      const missingStudentIds = new Set<string>();
      for (const e of Object.values(examMap) as any[]) {
        for (const id of Array.isArray(e.studentIds) ? e.studentIds : []) {
          if (!studentMap[String(id)]) missingStudentIds.add(String(id));
        }
      }
      for (const aDoc of attemptDocs) {
        const sid = String(aDoc.data()?.studentId || "").trim();
        if (sid && !studentMap[sid]) missingStudentIds.add(sid);
      }

      for (const studentId of Array.from(missingStudentIds).slice(0, 200)) {
        if (studentMap[studentId]) continue;
        let snap = await adminDb.collection("individualStudents").doc(studentId).get().catch(() => null);
        if (!snap?.exists) snap = await adminDb.collection("students").doc(studentId).get().catch(() => null);
        if (!snap?.exists) snap = await adminDb.collection("users").doc(studentId).get().catch(() => null);
        if (snap?.exists) {
          const s = snap.data() || {};
          const rawClass = String(s.class || s.className || s.grade || s.classLevel || s.classId || "").trim();
          const stuSchoolId = String(s.schoolId || s.school_id || "").trim();
          if (stuSchoolId && !schoolNameMap.has(stuSchoolId)) {
            const schSnap = await adminDb.collection("schools").doc(stuSchoolId).get().catch(() => null);
            if (schSnap?.exists) {
              const sd = schSnap.data() || {};
              const resolved = resolvePartnerSchoolName(sd.name, sd.schoolName);
              if (resolved) schoolNameMap.set(stuSchoolId, resolved);
            }
          }
          studentMap[studentId] = {
            name: String(
              s.fullName || s.studentName || s.name || [s.firstName, s.lastName].filter(Boolean).join(" ") || "Student"
            ),
            className: normalizeClassName(rawClass) || rawClass,
            schoolId: stuSchoolId,
            schoolName: resolvePartnerSchoolName(schoolNameMap.get(stuSchoolId), s.schoolName),
          };
        }
      }

      const allowedExamIdSet = new Set(examDocs.map(d => d.id));
      const rows = attemptDocs
        .filter(d => {
          const a = d.data() || {};
          if (examId && a.examId !== examId) return false;
          return allowedExamIdSet.has(String(a.examId));
        })
        .map(d => {
          const a = d.data() || {};
          const student = studentMap[String(a.studentId)] || { name: "", className: "", schoolId: "", schoolName: "" };
          const e = examMap[String(a.examId)] || {};
          const effectiveQuestions = resolveAttemptQuestions(e, a);
          const maxScore = computeExamMaxScore(e, a);
          const resolvedSchoolId = String(a.schoolId || e.schoolId || student.schoolId || "");
          const resolvedSchoolName = resolvePartnerSchoolName(
            schoolNameMap.get(resolvedSchoolId),
            a.schoolName,
            e.schoolName,
            student.schoolName
          );
          const resolvedClassName =
            normalizeClassName(a.className || student.className || (Array.isArray(e.classIds) ? e.classIds[0] : "")) ||
            a.className ||
            student.className ||
            "";

          const schoolCanViewFinal =
            schoolRoles.includes(c.role) &&
            (a.status === "graded" || ((a.status === "submitted" || a.status === "expired") && a.autoGraded === true));
          const canSeeScore = Boolean(
            a.releasedAt || tutors.includes(c.role) || admins.includes(c.role) || schoolCanViewFinal
          );
          const numericScore = canSeeScore && typeof a.score === "number" ? Number(a.score) : undefined;
          const percentage =
            numericScore !== undefined && maxScore > 0 ? calculateScorePercentage(numericScore, maxScore) : undefined;

          const row: any = {
            id: d.id,
            examId: a.examId,
            examTitle: e.title || a.examTitle || "Examination",
            subject: e.subject || a.subject || "General",
            schoolId: resolvedSchoolId,
            schoolName: resolvedSchoolName,
            studentId: a.studentId,
            studentName: a.studentName || student.name || "Student",
            className: resolvedClassName,
            status: a.status,
            score: numericScore,
            maxScore,
            percentage,
            submittedAt: a.submittedAt?.toDate ? a.submittedAt.toDate().toISOString() : a.submittedAt || null,
            deadlineAt: a.deadlineAt || null,
            releasedAt: a.releasedAt?.toDate ? a.releasedAt.toDate().toISOString() : a.releasedAt || null,
            autoGraded: a.autoGraded,
          };

          if (tutors.includes(c.role) || admins.includes(c.role)) {
            row.feedback = String(a.feedback || "");
            row.answers = a.answers || {};
            row.questionResults = Array.isArray(a.questionResults) ? a.questionResults : [];
            row.manualMarks = Array.isArray(a.manualMarks) ? a.manualMarks : [];
            row.questions = effectiveQuestions.map((q: any) => ({
              id: q.id,
              prompt: q.prompt,
              points: Number(q.points ?? 1),
              type: q.type,
              options: Array.isArray(q.options) ? q.options : [],
              correctOptionIds: Array.isArray(q.correctOptionIds) ? q.correctOptionIds : [],
              acceptedAnswers: Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers : [],
              explanation: q.explanation || "",
            }));
          } else if (a.releasedAt || schoolCanViewFinal) {
            row.feedback = a.releasedAt ? String(a.feedback || "") : "";
            row.questionResults = Array.isArray(a.questionResults)
              ? a.questionResults.map(schoolSafeQuestionResult)
              : [];
            row.questions = effectiveQuestions.map(schoolSafeQuestion);
          }
          return row;
        });

      let auditEvents: any[] = [];
      if (examId && allowedExamIdSet.has(examId)) {
        const events = await adminDb
          .collection("jdiExams")
          .doc(examId)
          .collection("events")
          .orderBy("createdAt", "desc")
          .limit(100)
          .get()
          .catch(() => null);
        auditEvents = (events?.docs || [])
          .map(d => {
            const e = d.data();
            const base: any = {
              id: d.id,
              type: e.type,
              createdAt: e.createdAt?.toDate ? e.createdAt.toDate().toISOString() : String(e.createdAt || ""),
              actorUid: e.actorUid || "",
            };
            if (tutors.includes(c.role) || admins.includes(c.role)) return { ...e, ...base };
            return {
              ...base,
              ...(e.reason ? { reason: e.reason } : {}),
              ...(e.regradedAttemptCount !== undefined ? { regradedAttemptCount: e.regradedAttemptCount } : {}),
            };
          })
          .filter(
            e =>
              tutors.includes(c.role) ||
              admins.includes(c.role) ||
              e.type === "result_released" ||
              e.type === "answer_key_corrected"
          );
      }

      return json(200, {
        exams: examDocs.map(d => {
          const e = d.data() || {};
          const sid = String(e.schoolId || "");
          const resolvedSchoolName = resolvePartnerSchoolName(schoolNameMap.get(sid), e.schoolName);
          const normalizedClassIds = normalizeClassList(
            Array.isArray(e.classIds) && e.classIds.length ? e.classIds : e.targetClass ? [e.targetClass] : []
          );
          const maxScore = computeExamMaxScore(e);
          const item: any = {
            id: d.id,
            title: e.title,
            subject: e.subject,
            status: e.status,
            schoolId: sid,
            schoolName: resolvedSchoolName,
            durationMinutes: e.durationMinutes,
            classIds: normalizedClassIds,
            targetClass: normalizedClassIds[0] || normalizeClassName(e.targetClass || "") || "",
            audienceType: e.audienceType || "school",
            studentIds: e.studentIds || [],
            maxScore,
            questionCount: Array.isArray(e.questions) ? e.questions.length : Number(e.questionCount || 0),
            passcode: e.passcode || undefined, // Authorised school admin, owning tutor, and admin can see passcode to distribute to students
            createdBy: e.createdBy || e.tutorId || "",
            tutorId: e.tutorId || e.createdBy || "",
            tutorName: e.tutorName || "",
            createdAt: e.createdAt,
            availableFrom: e.availableFrom,
            availableUntil: e.availableUntil,
          };
          if (tutors.includes(c.role) || admins.includes(c.role)) {
            item.questions = Array.isArray(e.questions)
              ? e.questions.map((q: any) => ({
                  id: q.id,
                  prompt: q.prompt,
                  points: Number(q.points ?? 1),
                  type: q.type,
                  options: Array.isArray(q.options) ? q.options : [],
                  correctOptionIds: Array.isArray(q.correctOptionIds) ? q.correctOptionIds : [],
                  acceptedAnswers: Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers : [],
                }))
              : [];
          } else {
            item.questions = Array.isArray(e.questions) ? e.questions.map(schoolSafeQuestion) : [];
          }
          return item;
        }),
        attempts: rows,
        auditEvents,
      });
    }

    if (method === "POST") {
      if (!canAuthorOrMutateExam(c.role)) {
        return json(403, { error: "School accounts have read-only access to examinations and reports." });
      }
      const examId = String(body.examId || "").trim();
      if (!examId) return json(400, { error: "Examination ID is required." });
      const ref = adminDb.collection("jdiExams").doc(examId);
      const snap = await ref.get();
      if (!snap.exists) return json(404, { error: "Examination not found." });
      const exam = snap.data() || {};
      if (!(await canManageExam(c, exam))) {
        return json(403, { error: "Not authorised to manage this examination." });
      }

      if (action === "delete") {
        const forceDelete = body.forceDelete === true;
        const attemptsSnap = await adminDb
          .collection("jdiExamAttempts")
          .where("examId", "==", examId)
          .limit(5)
          .get();
        const mode = forceDelete ? "delete" : resolveExamDeletionMode(attemptsSnap.size);
        if (mode === "delete") {
          await ref.delete();
          await adminDb.collection("schoolExams").doc(examId).delete().catch(() => undefined);
          return json(200, { ok: true, examId, mode: "deleted", deleted: true, attemptCount: attemptsSnap.size });
        } else {
          await ref.update({
            status: "archived",
            archivedAt: FieldValue.serverTimestamp(),
            archivedBy: c.uid,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: c.uid,
          });
          await adminDb
            .collection("schoolExams")
            .doc(examId)
            .update({ status: "archived", updatedAt: FieldValue.serverTimestamp() })
            .catch(() => undefined);
          return json(200, {
            ok: true,
            examId,
            mode: "archived",
            archived: true,
            attemptCount: attemptsSnap.size,
            message: "Examination has student attempts and was archived to preserve historical records.",
          });
        }
      }

      if (action === "update" || action === "republish") {
        const updates = body.updates || body;
        if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
          return json(400, { error: "Provide valid examination settings." });
        }

        const attemptsSnap = await adminDb
          .collection("jdiExamAttempts")
          .where("examId", "==", examId)
          .limit(200)
          .get();

        // Preserve historical attempts with a snapshot before applying structural updates
        if (!attemptsSnap.empty && updates.questions !== undefined) {
          const priorQuestions = Array.isArray(exam.questions) ? exam.questions : [];
          const priorMaxScore = computeExamMaxScore(exam);
          const batch = adminDb.batch();
          let hasUpdates = false;
          attemptsSnap.docs.forEach(aDoc => {
            const aData = aDoc.data() || {};
            if (!Array.isArray(aData.questionsSnapshot) || !aData.questionsSnapshot.length) {
              batch.update(aDoc.ref, {
                questionsSnapshot: priorQuestions,
                maxScore: aData.maxScore || priorMaxScore,
              });
              hasUpdates = true;
            }
          });
          if (hasUpdates) await batch.commit().catch(() => undefined);
        }

        const patch: any = { updatedAt: FieldValue.serverTimestamp(), updatedBy: c.uid };
        if (updates.title !== undefined) {
          const value = String(updates.title).trim();
          if (!value || value.length > 200) return json(400, { error: "Title must be 1–200 characters." });
          patch.title = value;
        }
        if (updates.subject !== undefined) {
          const value = String(updates.subject).trim();
          if (!value || value.length > 120) return json(400, { error: "Subject must be 1–120 characters." });
          patch.subject = value;
        }
        if (updates.instructions !== undefined) patch.instructions = String(updates.instructions).slice(0, 5000);
        if (updates.seriesName !== undefined) patch.seriesName = String(updates.seriesName).trim().slice(0, 160);
        if (updates.courseName !== undefined) patch.courseName = String(updates.courseName).trim().slice(0, 160);
        if (updates.learningVideoUrl !== undefined) {
          const value = String(updates.learningVideoUrl || "").trim();
          if (value) {
            try {
              const url = new URL(value);
              if (!["http:", "https:"].includes(url.protocol)) throw new Error("URL");
            } catch {
              return json(400, { error: "Learning video URL must be a valid http or https link." });
            }
          }
          patch.learningVideoUrl = value || null;
        }
        if (updates.durationMinutes !== undefined) {
          const value = Number(updates.durationMinutes);
          if (!Number.isInteger(value) || value < 1 || value > 300) {
            return json(400, { error: "Duration must be a whole number from 1 to 300 minutes." });
          }
          patch.durationMinutes = value;
        }
        if (updates.maxAttempts !== undefined) {
          const value = Number(updates.maxAttempts);
          if (!Number.isInteger(value) || value < 1 || value > 10) {
            return json(400, { error: "Maximum attempts must be an integer from 1 to 10." });
          }
          patch.maxAttempts = value;
        }
        if (updates.shuffleQuestions !== undefined) {
          patch.shuffleQuestions = Boolean(updates.shuffleQuestions);
        }
        if (updates.shuffleOptions !== undefined) {
          patch.shuffleOptions = Boolean(updates.shuffleOptions);
        }
        if (updates.gradingMode !== undefined) {
          if (!["automatic", "manual"].includes(String(updates.gradingMode))) {
            return json(400, { error: "Invalid grading mode." });
          }
          patch.gradingMode = String(updates.gradingMode);
        }
        if (updates.status !== undefined) {
          const nextStatus = String(updates.status);
          if (!["draft", "scheduled", "active", "completed", "archived"].includes(nextStatus)) {
            return json(400, { error: "Invalid examination status." });
          }
          patch.status = nextStatus;
        }
        if (updates.classIds !== undefined) {
          if (!Array.isArray(updates.classIds) || updates.classIds.length > 100) {
            return json(400, { error: "Invalid class assignment." });
          }
          const normClasses = normalizeClassList(updates.classIds);
          patch.classIds = normClasses;
          patch.targetClass = normClasses[0] || "";
        }

        const nextAvailableFrom =
          updates.availableFrom !== undefined ? (updates.availableFrom ? String(updates.availableFrom) : null) : exam.availableFrom || null;
        const nextAvailableUntil =
          updates.availableUntil !== undefined ? (updates.availableUntil ? String(updates.availableUntil) : null) : exam.availableUntil || null;
        const fromTime = nextAvailableFrom ? Date.parse(nextAvailableFrom) : null;
        const untilTime = nextAvailableUntil ? Date.parse(nextAvailableUntil) : null;
        if (
          (fromTime !== null && !Number.isFinite(fromTime)) ||
          (untilTime !== null && !Number.isFinite(untilTime)) ||
          (fromTime !== null && untilTime !== null && untilTime <= fromTime)
        ) {
          return json(400, {
            error: "The examination closing time must be after its opening time, and both dates must be valid.",
          });
        }
        if (String(patch.status ?? exam.status ?? "draft") === "scheduled" && !nextAvailableFrom) {
          return json(400, { error: "Scheduled examinations need an opening date and time." });
        }
        if (updates.availableFrom !== undefined) patch.availableFrom = nextAvailableFrom;
        if (updates.availableUntil !== undefined) patch.availableUntil = nextAvailableUntil;

        if (updates.passcode !== undefined) {
          const code = String(updates.passcode).trim().toUpperCase();
          if (code.length < 6 || code.length > 128) {
            return json(400, { error: "Passcode must be 6–128 characters." });
          }
          const salt = randomBytes(16).toString("hex");
          patch.passcode = code;
          patch.passcodeSalt = salt;
          patch.passcodeHash = createHash("sha256")
            .update(salt + ":" + code)
            .digest("hex");
        }

        if (updates.questions !== undefined) {
          const mode = String(updates.gradingMode || exam.gradingMode || "automatic");
          const normalized = normalizeQuestions(updates.questions, mode);
          if (normalized.error) return json(400, { error: normalized.error });
          patch.questions = normalized.questions;
          patch.questionCount = normalized.questions.length;
          patch.maxScore = normalized.maxScore;
        }

        await ref.update(patch);

        const mergedExam = { ...exam, ...patch };
        if (mergedExam.status === "scheduled" || mergedExam.status === "active") {
          const recipients = await collectEligibleExamRecipients(mergedExam);
          const classLabel = Array.isArray(mergedExam.classIds) && mergedExam.classIds.length
            ? mergedExam.classIds.join(", ")
            : "Assigned Class";
          await notify(
            recipients,
            {
              type: mergedExam.status === "active" ? "exam_active" : "exam_scheduled",
              title: `Examination ${mergedExam.status === "active" ? "Active" : "Scheduled"}: ${mergedExam.title}`,
              message: `${mergedExam.title} (${mergedExam.subject || "General"} • ${classLabel}) is ${mergedExam.status}.`,
              examId,
            },
            `exam-publish:${examId}:${mergedExam.status}`
          );
        }

        return json(200, {
          ok: true,
          examId,
          updatedFields: Object.keys(patch).filter(k => !["updatedAt", "updatedBy"].includes(k)),
        });
      }

      if (action === "correctAnswerKey") {
        const questionId = String(body.questionId || "").trim();
        const reason = String(body.reason || "").trim();
        if (!questionId || reason.length < 5 || reason.length > 1000) {
          return json(400, { error: "Select a question and provide a correction reason (5–1000 characters)." });
        }
        const questions = Array.isArray(exam.questions) ? exam.questions.map((q: any) => ({ ...q })) : [];
        const index = questions.findIndex((q: any) => String(q.id) === questionId);
        if (index < 0) return json(404, { error: "Question not found." });
        const q = questions[index];
        const oldKey = {
          correctOptionIds: Array.isArray(q.correctOptionIds) ? q.correctOptionIds : [],
          acceptedAnswers: Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers : [],
        };
        if (["single_choice", "multiple_choice", "true_false"].includes(String(q.type))) {
          if (!Array.isArray(body.correctOptionIds) || !body.correctOptionIds.length) {
            return json(400, { error: "Provide at least one correct option ID." });
          }
          const ids = [...new Set(body.correctOptionIds.map(String))];
          const valid = new Set((Array.isArray(q.options) ? q.options : []).map((o: any) => String(o.id)));
          if (ids.some((id: string) => !valid.has(id)) || (q.type === "single_choice" && ids.length !== 1)) {
            return json(400, { error: "Correct option IDs must match this question's options." });
          }
          q.correctOptionIds = ids;
        } else if (q.type === "short_answer") {
          if (!Array.isArray(body.acceptedAnswers) || !body.acceptedAnswers.some((v: any) => String(v).trim())) {
            return json(400, { error: "Provide at least one accepted short answer." });
          }
          q.acceptedAnswers = body.acceptedAnswers
            .map((v: any) => String(v).trim().slice(0, 500))
            .filter(Boolean)
            .slice(0, 20);
        } else {
          return json(409, {
            error: "Essay questions require manual grading; an answer-key correction cannot regrade them automatically.",
          });
        }
        questions[index] = q;
        const maxScore = computeExamMaxScore({ questions });
        await ref.update({
          questions,
          maxScore,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: c.uid,
        });

        const attemptSnap = await adminDb.collection("jdiExamAttempts").where("examId", "==", examId).get();
        const changed: Array<{ id: string; studentUid: string; oldScore: number; newScore: number; released: boolean }> = [];
        const batchWrites: any[] = [];
        for (const attemptDoc of attemptSnap.docs) {
          const a = attemptDoc.data();
          if (
            !["submitted", "expired", "graded"].includes(String(a.status)) ||
            a.autoGraded !== true ||
            (Array.isArray(a.manualMarks) && a.manualMarks.length)
          ) {
            continue;
          }
          const answers = a.answers || {};
          let score = 0;
          const results: any[] = [];
          for (const question of questions) {
            const answer = answers[question.id];
            let correct = false;
            let points = 0;
            if (["single_choice", "multiple_choice", "true_false"].includes(String(question.type))) {
              const expected = (Array.isArray(question.correctOptionIds) ? question.correctOptionIds : [])
                .map(String)
                .sort();
              const actual = (Array.isArray(answer) ? answer : [String(answer || "")]).map(String).sort();
              correct =
                expected.length > 0 &&
                expected.length === actual.length &&
                expected.every((v: string, i: number) => v === actual[i]);
            } else if (question.type === "short_answer") {
              const normAnswer = (value: any) => String(value || "").trim().toLowerCase();
              correct =
                Array.isArray(question.acceptedAnswers) &&
                question.acceptedAnswers.some((v: string) => normAnswer(v) === normAnswer(answer));
            }
            const maxPts = Math.max(0, Number(question.points ?? 1) || 0);
            if (correct) {
              points = maxPts;
              score += points;
            }
            results.push({
              questionId: question.id,
              ...(answer === undefined ? {} : { answer }),
              correct,
              pointsAwarded: points,
              maxPoints: maxPts,
            });
          }
          changed.push({
            id: attemptDoc.id,
            studentUid: String(a.studentUid || ""),
            oldScore: Number(a.score || 0),
            newScore: score,
            released: Boolean(a.releasedAt),
          });
          batchWrites.push({
            ref: attemptDoc.ref,
            data: {
              score,
              maxScore,
              percentage: calculateScorePercentage(score, maxScore),
              questionResults: results,
              regradedAt: FieldValue.serverTimestamp(),
              regradedBy: c.uid,
              updatedAt: FieldValue.serverTimestamp(),
            },
          });
        }
        for (let i = 0; i < batchWrites.length; i += 400) {
          const batch = adminDb.batch();
          batchWrites.slice(i, i + 400).forEach(w => batch.update(w.ref, w.data));
          await batch.commit();
        }
        const auditRef = ref.collection("events").doc();
        await auditRef.set({
          type: "answer_key_corrected",
          questionId,
          reason,
          actorUid: c.uid,
          oldAnswerKey: oldKey,
          newAnswerKey: { correctOptionIds: q.correctOptionIds || [], acceptedAnswers: q.acceptedAnswers || [] },
          regradedAttemptCount: changed.length,
          attempts: changed.map(a => ({
            attemptId: a.id,
            studentUid: a.studentUid,
            oldScore: a.oldScore,
            newScore: a.newScore,
            released: a.released,
          })),
          createdAt: FieldValue.serverTimestamp(),
        });
        const affectedReleased = changed.filter(a => a.released);
        const schoolRecipients = new Set<string>();
        if (exam.createdBy) schoolRecipients.add(String(exam.createdBy));
        if (String(exam.schoolId || "")) {
          const schoolUsers = await adminDb
            .collection("users")
            .where("schoolId", "==", String(exam.schoolId))
            .limit(100)
            .get()
            .catch(() => null);
          schoolUsers?.docs.forEach(d => {
            if (schoolRoles.includes(String(d.data().role || "").toUpperCase())) schoolRecipients.add(d.id);
          });
        }
        for (const a of affectedReleased) {
          const recipients = [a.studentUid, ...schoolRecipients].filter(Boolean);
          const attemptData = attemptSnap.docs.find(d => d.id === a.id)?.data() || {};
          let studentRecord = await adminDb.collection("individualStudents").doc(String(attemptData.studentId || "")).get();
          if (!studentRecord.exists) {
            studentRecord = await adminDb.collection("students").doc(String(attemptData.studentId || "")).get();
          }
          const parentId = String(studentRecord.data()?.parentId || studentRecord.data()?.guardianId || "");
          if (parentId) recipients.push(parentId);
          await notify(recipients, {
            type: "exam_result_corrected",
            title: "Examination result corrected",
            message:
              "A correction was made to the answer key for " +
              String(exam.title || "an examination") +
              ". The affected result has been recalculated.",
            examId,
            attemptId: a.id,
          });
        }
        return json(200, {
          ok: true,
          questionId,
          regradedAttempts: changed.length,
          releasedResultsUpdated: affectedReleased.length,
          auditId: auditRef.id,
        });
      }

      if (action === "grade") {
        const attemptId = String(body.attemptId || "");
        const aRef = adminDb.collection("jdiExamAttempts").doc(attemptId);
        const aSnap = await aRef.get();
        if (!aSnap.exists || aSnap.data()?.examId !== examId) return json(404, { error: "Attempt not found." });
        const attemptData = aSnap.data() || {};
        if (!["submitted", "expired", "graded"].includes(String(attemptData.status))) {
          return json(409, { error: "The student must submit or time out before grading." });
        }
        const reason = String(body.reason || "").trim();
        const feedback = String(body.feedback || "").trim().slice(0, 4000);
        if (reason.length < 5 || reason.length > 1000) {
          return json(400, { error: "Provide a grading reason (5–1000 characters)." });
        }
        const marks = body.marks;
        if (!marks || typeof marks !== "object" || Array.isArray(marks)) {
          return json(400, { error: "Provide marks by question ID." });
        }
        if (Object.values(marks).some((value: any) => !Number.isFinite(Number(value)) || Number(value) < 0)) {
          return json(400, { error: "Marks must be finite non-negative numbers." });
        }
        const gradingQuestions = resolveAttemptQuestions(exam, attemptData);
        const validIds = new Set(gradingQuestions.map((q: any) => String(q.id)));
        if (Object.keys(marks).some(key => !validIds.has(key))) {
          return json(400, { error: "Marks contain an unknown question ID." });
        }
        const missingMarks = gradingQuestions.filter(
          (q: any) => !Object.prototype.hasOwnProperty.call(marks, String(q.id))
        );
        if (missingMarks.length) {
          return json(409, {
            error:
              "Grade every question before finalizing this result. Missing marks for question(s): " +
              missingMarks.map((q: any) => String(q.id)).join(", "),
          });
        }
        for (const q of gradingQuestions) {
          const mark = Number(marks[q.id]);
          const max = Math.max(0, Number(q.points ?? 1) || 0);
          if (!Number.isFinite(mark) || mark < 0 || mark > max) {
            return json(400, { error: "Each mark must be finite and between 0 and the question maximum." });
          }
        }
        let score = 0;
        let maxScore = 0;
        const result: any[] = [];
        for (const q of gradingQuestions) {
          const max = Math.max(0, Number(q.points ?? 1) || 0);
          const mark = Number(marks[q.id]);
          score += mark;
          maxScore += max;
          result.push({ questionId: q.id, pointsAwarded: mark, maxPoints: max });
        }
        const finalScore = Number(score.toFixed(2));
        const finalMaxScore = Number(maxScore.toFixed(2));
        const percentage = calculateScorePercentage(finalScore, finalMaxScore);
        const priorScore = Number(attemptData.score || 0);
        const auditRef = ref.collection("events").doc();
        const gradingBatch = adminDb.batch();
        gradingBatch.set(auditRef, {
          type: "attempt_manually_graded",
          attemptId,
          actorUid: c.uid,
          reason,
          feedback,
          previousScore: priorScore,
          newScore: finalScore,
          maxScore: finalMaxScore,
          manualMarks: result,
          createdAt: FieldValue.serverTimestamp(),
        });
        gradingBatch.update(aRef, {
          manualMarks: result,
          questionResults: result,
          score: finalScore,
          maxScore: finalMaxScore,
          percentage,
          gradingReason: reason,
          feedback,
          gradingAuditId: auditRef.id,
          gradedBy: c.uid,
          gradedAt: FieldValue.serverTimestamp(),
          releasedAt: FieldValue.delete(),
          releasedBy: FieldValue.delete(),
          status: "graded",
          updatedAt: FieldValue.serverTimestamp(),
        });
        await gradingBatch.commit();
        return json(200, { ok: true, score: finalScore, maxScore: finalMaxScore, percentage, auditId: auditRef.id });
      }

      if (action === "release") {
        const attemptId = String(body.attemptId || "");
        const aRef = adminDb.collection("jdiExamAttempts").doc(attemptId);
        const aSnap = await aRef.get();
        if (!aSnap.exists || aSnap.data()?.examId !== examId) return json(404, { error: "Attempt not found." });
        const a = aSnap.data() || {};
        if (!["submitted", "expired", "graded"].includes(String(a.status))) {
          return json(409, { error: "Attempt must be submitted before releasing results." });
        }
        if (a.autoGraded === false && a.status !== "graded") {
          return json(409, { error: "Manually graded questions must be marked before releasing this result." });
        }
        const resultRecipients = [String(a.studentUid || "")];
        if (exam.createdBy) resultRecipients.push(String(exam.createdBy));
        let studentRecord = await adminDb.collection("individualStudents").doc(String(a.studentId || "")).get();
        if (!studentRecord.exists) {
          studentRecord = await adminDb.collection("students").doc(String(a.studentId || "")).get();
        }
        const parentId = String(studentRecord.data()?.parentId || studentRecord.data()?.guardianId || "");
        if (parentId) resultRecipients.push(parentId);
        if (String(exam.schoolId || "")) {
          const schoolUsers = await adminDb
            .collection("users")
            .where("schoolId", "==", String(exam.schoolId))
            .limit(50)
            .get()
            .catch(() => null);
          schoolUsers?.docs.forEach(d => {
            const role = String(d.data().role || "").toUpperCase();
            if (schoolRoles.includes(role)) resultRecipients.push(d.id);
          });
        }
        const notificationPayload = {
          type: "exam_result_released",
          title: "Examination result released",
          message: "The result for " + String(exam.title || "an examination") + " has been released.",
          examId,
          attemptId,
        };
        const releaseAudit = ref.collection("events").doc();
        const releaseResult = await adminDb.runTransaction(async tx => {
          const currentSnap = await tx.get(aRef);
          if (!currentSnap.exists || currentSnap.data()?.examId !== examId) return { kind: "missing" as const };
          const current = currentSnap.data() || {};
          if (current.releasedAt) return { kind: "unchanged" as const, auditId: String(current.releaseAuditId || "") };
          if (
            !["submitted", "expired", "graded"].includes(String(current.status)) ||
            (current.autoGraded === false && current.status !== "graded")
          ) {
            return { kind: "not-ready" as const };
          }
          const maxScore = computeExamMaxScore(exam, current);
          tx.set(releaseAudit, {
            type: "result_released",
            attemptId,
            actorUid: c.uid,
            score: current.score ?? null,
            maxScore,
            createdAt: FieldValue.serverTimestamp(),
          });
          tx.update(aRef, {
            maxScore,
            releasedAt: FieldValue.serverTimestamp(),
            releasedBy: c.uid,
            releaseAuditId: releaseAudit.id,
            updatedAt: FieldValue.serverTimestamp(),
          });
          return { kind: "released" as const, auditId: releaseAudit.id };
        });
        if (releaseResult.kind === "missing") return json(404, { error: "Attempt not found." });
        if (releaseResult.kind === "not-ready") {
          return json(409, { error: "Manually graded questions must be marked before releasing this result." });
        }
        await notify(resultRecipients, notificationPayload, "result-release:" + examId + ":" + attemptId);
        return json(200, {
          ok: true,
          unchanged: releaseResult.kind === "unchanged",
          auditId: releaseResult.auditId || undefined,
        });
      }

      if (action === "activate") {
        const status = String(body.status || "active");
        if (!["active", "scheduled", "completed", "archived", "draft"].includes(status)) {
          return json(400, { error: "Invalid status." });
        }
        const currentStatus = String(exam.status || "draft");
        if (!(statusTransitions[currentStatus] || []).includes(status)) {
          return json(409, {
            error: "This examination status transition is not allowed.",
          });
        }
        const unchanged = currentStatus === status;
        if (!unchanged) {
          const statusEvent = ref.collection("events").doc();
          const statusBatch = adminDb.batch();
          statusBatch.update(ref, {
            status,
            updatedAt: FieldValue.serverTimestamp(),
            updatedBy: c.uid,
          });
          statusBatch.set(statusEvent, {
            type: "exam_status_changed",
            status,
            actorUid: c.uid,
            previousStatus: currentStatus,
            createdAt: FieldValue.serverTimestamp(),
          });
          await statusBatch.commit();
        }
        const recipients = await collectEligibleExamRecipients(exam);
        await notify(
          recipients,
          {
            type: "exam_status_changed",
            title: "Examination updated",
            message: String(exam.title || "An examination") + " is now " + status + ".",
            examId,
          },
          `exam-status:${examId}:${status}`
        );
        return json(200, { ok: true, status, unchanged });
      }

      return json(404, { error: "Unknown examination management action." });
    }

    return json(405, { error: "Method not allowed." });
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    if (m === "AUTH") return json(401, { error: "Authentication required." });
    if (m === "PROFILE") return json(403, { error: "Portal profile not found." });
    if (m === "INACTIVE") return json(403, { error: "Account is inactive." });
    console.error("JDI exam management error", e);
    return json(500, { error: "Unable to complete examination management request." });
  }
};
