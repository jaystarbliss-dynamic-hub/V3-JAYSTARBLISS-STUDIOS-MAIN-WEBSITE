import type { Handler } from "@netlify/functions";
import { adminAuth, adminDb } from "../../api/_lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import {
  answersForFinalization,
  gradeAnswers,
  isAssessmentStudentRole,
  computeExamMaxScore,
  calculateScorePercentage,
  resolvePartnerSchoolName,
  resolveAttemptQuestions,
  normalizeClassName,
} from "../../api/_lib/jdi-assessment.js";

const json = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});

async function user(event: any) {
  const h = event.headers?.authorization || event.headers?.Authorization || "";
  if (!h.startsWith("Bearer ")) throw new Error("AUTH");
  const token = await adminAuth.verifyIdToken(h.slice(7));
  const p = await adminDb.collection("users").doc(token.uid).get();
  if (!p.exists) throw new Error("PROFILE");
  const data = p.data() || {};
  if (["DISABLED", "SUSPENDED", "BANNED"].includes(String(data.accountStatus || data.status || "").toUpperCase())) {
    throw new Error("INACTIVE");
  }
  return { uid: token.uid, role: String(data.role || "").toUpperCase(), data };
}

async function studentFor(uid: string, userData?: Record<string, any>) {
  const studentDocId = String(userData?.studentDocId || "").trim();
  if (studentDocId) {
    for (const name of ["individualStudents", "students"]) {
      const snap = await adminDb.collection(name).doc(studentDocId).get();
      if (snap.exists) return { id: snap.id, data: snap.data() || {} };
    }
  }
  for (const name of ["individualStudents", "students"]) {
    const direct = await adminDb.collection(name).doc(uid).get();
    if (direct.exists) return { id: direct.id, data: direct.data() || {} };
  }
  for (const name of ["individualStudents", "students"]) {
    for (const field of ["firebaseUid", "userId"]) {
      const q = await adminDb.collection(name).where(field, "==", uid).limit(1).get();
      if (!q.empty) return { id: q.docs[0].id, data: q.docs[0].data() };
    }
  }
  if (userData && isAssessmentStudentRole(userData.role)) {
    return { id: studentDocId || uid, data: userData };
  }
  return null;
}

function safeQuestion(q: any) {
  const { correctOptionIds, acceptedAnswers, answer, explanation, ...rest } = q;
  return rest;
}

async function resolveSchoolName(schoolId: string, ...fallbacks: unknown[]): Promise<string> {
  if (schoolId) {
    try {
      const snap = await adminDb.collection("schools").doc(schoolId).get();
      if (snap.exists) {
        const sd = snap.data() || {};
        return resolvePartnerSchoolName(sd.name, sd.schoolName, sd.institutionName, ...fallbacks);
      }
    } catch {
      // ignore
    }
  }
  return resolvePartnerSchoolName(...fallbacks);
}

async function notifyStaff(a: any, exam: any, attemptId: string) {
  const recipients = new Set<string>();
  if (exam.createdBy) recipients.add(String(exam.createdBy));
  const schoolId = String(a.schoolId || exam.schoolId || "");
  if (schoolId) {
    const users = await adminDb
      .collection("users")
      .where("schoolId", "==", schoolId)
      .limit(100)
      .get()
      .catch(() => null);
    if (users) {
      users.docs.forEach(d => {
        const role = String(d.data().role || "").toUpperCase();
        if (["SCHOOL", "SCHOOL_ADMIN"].includes(role)) recipients.add(d.id);
      });
    }
  } else {
    let student = await adminDb.collection("individualStudents").doc(String(a.studentId || "")).get();
    if (!student.exists) {
      student = await adminDb.collection("students").doc(String(a.studentId || "")).get();
    }
    const parentId = String(student.data()?.parentId || student.data()?.guardianId || "");
    if (parentId) recipients.add(parentId);
  }
  recipients.delete(String(a.studentUid || ""));
  const batch = adminDb.batch();
  recipients.forEach(uid => {
    const ref = adminDb.collection("jdiNotifications").doc();
    batch.set(ref, {
      recipientUid: uid,
      isRead: false,
      type: "exam_submitted",
      title: "Examination attempt submitted",
      message: String(exam.title || "An examination") + " was submitted or timed out.",
      examId: a.examId,
      attemptId,
      schoolId: schoolId || null,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  if (recipients.size) await batch.commit();
}

export const handler: Handler = async event => {
  try {
    const c = await user(event);
    if (!isAssessmentStudentRole(c.role)) return json(403, { error: "Student access required." });
    const path = String(event.path || "");
    const method = event.httpMethod || "GET";

    if (method === "GET" && path.endsWith("/examination-attempt")) {
      const student = await studentFor(c.uid, c.data);
      if (!student) return json(403, { error: "Student record not found." });
      const id = String(event.queryStringParameters?.attemptId || "");
      if (!id) return json(400, { error: "Attempt ID required." });
      const ref = adminDb.collection("jdiExamAttempts").doc(id);
      const snap = await ref.get();
      if (!snap.exists) return json(404, { error: "Attempt not found." });
      const a = snap.data() || {};
      if (a.studentUid !== c.uid && a.studentId !== student.id) {
        return json(403, { error: "Not authorised." });
      }
      const examSnap = await adminDb.collection("jdiExams").doc(String(a.examId)).get();
      if (!examSnap.exists) return json(404, { error: "Examination not found." });
      const exam = examSnap.data() || {};

      const effectiveQuestions = resolveAttemptQuestions(exam, a);
      const maxScore = computeExamMaxScore(exam, a);
      const schoolId = String(a.schoolId || exam.schoolId || student.data.schoolId || "");
      const schoolName = await resolveSchoolName(schoolId, a.schoolName, exam.schoolName, student.data.schoolName);
      const studentName = String(
        a.studentName ||
          student.data.fullName ||
          student.data.studentName ||
          student.data.name ||
          c.data.name ||
          c.data.fullName ||
          "Student"
      );
      const rawClass = String(
        a.className ||
          student.data.class ||
          student.data.className ||
          student.data.grade ||
          student.data.classLevel ||
          (Array.isArray(exam.classIds) ? exam.classIds[0] : "") ||
          ""
      );
      const className = normalizeClassName(rawClass) || rawClass;

      const deadline = new Date(a.deadlineAt).getTime();
      if (a.status === "in_progress" && (!Number.isFinite(deadline) || Date.now() >= deadline)) {
        const expiry = await adminDb.runTransaction(async tx => {
          const currentSnap = await tx.get(ref);
          if (!currentSnap.exists) return { kind: "missing" as const };
          const current = currentSnap.data() || {};
          if (current.studentUid !== c.uid && current.studentId !== student.id) return { kind: "owner" as const };
          if (current.status !== "in_progress") return { kind: "closed" as const, current };
          const currentDeadline = new Date(current.deadlineAt).getTime();
          if (Number.isFinite(currentDeadline) && Date.now() < currentDeadline) {
            return { kind: "active" as const, current };
          }
          const grading = gradeAnswers({ ...exam, questions: effectiveQuestions }, current.answers || {});
          tx.update(ref, {
            status: "expired",
            ...grading,
            schoolName,
            studentName,
            className,
            deadlineAt: FieldValue.delete(),
            submittedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          return { kind: "expired" as const, current, grading };
        });
        if (expiry.kind === "missing") return json(404, { error: "Attempt not found." });
        if (expiry.kind === "owner") return json(403, { error: "Not authorised." });
        if (expiry.kind === "expired") {
          await notifyStaff(expiry.current, exam, id).catch(err =>
            console.warn("JDI staff notification failed", err)
          );
        }
        if (expiry.kind === "active") {
          return json(409, { error: "The examination timer has not expired yet." });
        }
        const latest = expiry.kind === "closed" ? expiry.current : { ...expiry.current, status: "expired" };
        return json(200, {
          attempt: {
            id,
            examId: a.examId,
            studentId: student.id,
            studentName,
            className,
            schoolId,
            schoolName,
            status: String(latest.status || "expired"),
            deadlineAt: latest.deadlineAt,
            score: latest.releasedAt ? latest.score : undefined,
            maxScore,
            percentage:
              latest.releasedAt && typeof latest.score === "number"
                ? calculateScorePercentage(latest.score, maxScore)
                : undefined,
            releasedAt: latest.releasedAt || undefined,
          },
          exam: {
            id: a.examId,
            title: exam.title,
            subject: exam.subject,
            schoolId,
            schoolName,
            classIds: exam.classIds || [],
            maxScore,
          },
          questions: [],
        });
      }

      const submitted = ["submitted", "expired", "graded"].includes(String(a.status));
      const released = Boolean(a.releasedAt);
      const safeQuestions = effectiveQuestions.map(safeQuestion);
      const questionById = new Map(safeQuestions.map((q: any) => [String(q.id), q]));
      const orderedQuestions = Array.isArray(a.questionOrder)
        ? a.questionOrder.map((qid: string) => questionById.get(String(qid))).filter(Boolean)
        : safeQuestions;
      const displayedQuestions = orderedQuestions.map((q: any) => {
        const order = a.optionOrderMap?.[String(q.id)];
        if (!Array.isArray(order) || !Array.isArray(q.options)) return q;
        const byOptionId = new Map(q.options.map((option: any) => [String(option.id), option]));
        return {
          ...q,
          options: [
            ...order.map((oid: string) => byOptionId.get(String(oid))).filter(Boolean),
            ...q.options.filter((option: any) => !order.includes(String(option.id))),
          ],
        };
      });

      const resultQuestions = released
        ? effectiveQuestions.map((q: any) => ({
            id: q.id,
            type: q.type,
            prompt: q.prompt,
            points: Number(q.points ?? 1),
            options: Array.isArray(q.options) ? q.options : [],
            correctOptionIds: Array.isArray(q.correctOptionIds) ? q.correctOptionIds : [],
            acceptedAnswers: Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers : [],
            explanation: String(q.explanation || ""),
          }))
        : [];

      const releasedAtIso = a.releasedAt?.toDate ? a.releasedAt.toDate().toISOString() : a.releasedAt || undefined;
      const submittedAtIso = a.submittedAt?.toDate ? a.submittedAt.toDate().toISOString() : a.submittedAt || undefined;

      return json(200, {
        attempt: {
          id,
          examId: a.examId,
          studentId: student.id,
          studentName,
          className,
          schoolId,
          schoolName,
          status: a.status,
          deadlineAt: a.deadlineAt,
          submittedAt: submittedAtIso,
          answers: released ? a.answers || {} : submitted ? undefined : a.answers || {},
          score: released ? a.score : undefined,
          maxScore,
          percentage:
            released && typeof a.score === "number" ? calculateScorePercentage(a.score, maxScore) : undefined,
          releasedAt: released ? releasedAtIso : undefined,
          feedback: released ? String(a.feedback || "") : undefined,
          questionResults: released && Array.isArray(a.questionResults) ? a.questionResults : undefined,
          manualMarks: released && Array.isArray(a.manualMarks) ? a.manualMarks : undefined,
        },
        exam: {
          id: a.examId,
          title: exam.title,
          subject: exam.subject,
          schoolId,
          schoolName,
          classIds: exam.classIds || [],
          instructions: exam.instructions,
          durationMinutes: exam.durationMinutes,
          maxScore,
        },
        questions: released ? resultQuestions : submitted ? [] : displayedQuestions,
      });
    }

    if (method === "POST" && path.endsWith("/examination-attempt")) {
      if (String(event.body || "").length > 1000000) {
        return json(413, { error: "Answer payload is too large. Save shorter answers and try again." });
      }
      const student = await studentFor(c.uid, c.data);
      const body = JSON.parse(event.body || "{}");
      const id = String(body.attemptId || "");
      const action = String(body.action || "");
      if (!id) return json(400, { error: "Attempt ID required." });
      const ref = adminDb.collection("jdiExamAttempts").doc(id);
      const snap = await ref.get();
      if (!snap.exists) return json(404, { error: "Attempt not found." });
      const a = snap.data() || {};
      if (a.studentUid !== c.uid && (!student || a.studentId !== student.id)) {
        return json(403, { error: "Not authorised." });
      }
      if (a.status !== "in_progress") {
        return json(409, { error: "This examination attempt is no longer editable." });
      }
      const deadline = new Date(a.deadlineAt).getTime();
      const examSnap = await adminDb.collection("jdiExams").doc(String(a.examId)).get();
      if (!examSnap.exists) return json(404, { error: "Examination not found." });
      const exam = examSnap.data() || {};
      const effectiveQuestions = resolveAttemptQuestions(exam, a);

      if (!Number.isFinite(deadline) || Date.now() >= deadline) {
        const expiry = await adminDb.runTransaction(async tx => {
          const currentSnap = await tx.get(ref);
          if (!currentSnap.exists) return { kind: "missing" as const };
          const current = currentSnap.data() || {};
          if (current.studentUid !== c.uid && (!student || current.studentId !== student.id)) {
            return { kind: "owner" as const };
          }
          if (current.status !== "in_progress") {
            return { kind: "closed" as const, status: String(current.status || "closed") };
          }
          const currentDeadline = new Date(current.deadlineAt).getTime();
          if (Number.isFinite(currentDeadline) && Date.now() < currentDeadline) return { kind: "active" as const };
          const grading = gradeAnswers({ ...exam, questions: effectiveQuestions }, current.answers || {});
          tx.update(ref, {
            status: "expired",
            ...grading,
            deadlineAt: FieldValue.delete(),
            submittedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          return { kind: "expired" as const, grading, attempt: current };
        });
        if (expiry.kind === "missing") return json(404, { error: "Attempt not found." });
        if (expiry.kind === "owner") return json(403, { error: "Not authorised." });
        if (expiry.kind === "active") return json(409, { error: "The examination timer has not expired yet." });
        if (expiry.kind === "expired") {
          await notifyStaff(expiry.attempt, exam, id).catch(err =>
            console.warn("JDI staff notification failed", err)
          );
        }
        return json(409, {
          error:
            expiry.kind === "closed"
              ? "This examination attempt is already closed."
              : "Time has expired. Your attempt has been closed.",
          status: expiry.kind === "expired" ? "expired" : expiry.status,
          autoGraded: expiry.kind === "expired" ? expiry.grading.autoGraded : undefined,
        });
      }

      if (action === "save") {
        const answers = body.answers;
        if (!answers || typeof answers !== "object" || Array.isArray(answers) || Object.keys(answers).length > 200) {
          return json(400, { error: "Invalid answers." });
        }
        const allowedQuestionIds = new Set(effectiveQuestions.map((q: any) => String(q.id)));
        if (Object.keys(answers).some(key => !allowedQuestionIds.has(key))) {
          return json(400, { error: "Answers contain an unknown question ID." });
        }
        const clean: Record<string, string | string[]> = {};
        for (const [key, value] of Object.entries(answers)) {
          if (typeof value === "string") clean[key] = value.slice(0, 10000);
          else if (Array.isArray(value) && value.length <= 20 && value.every(v => typeof v === "string")) {
            clean[key] = value.map(v => v.slice(0, 500));
          } else return json(400, { error: "Invalid answer format." });
        }
        const saveResult = await adminDb.runTransaction(async tx => {
          const currentSnap = await tx.get(ref);
          if (!currentSnap.exists) return "missing";
          const current = currentSnap.data() || {};
          if (current.studentUid !== c.uid && (!student || current.studentId !== student.id)) return "owner";
          if (current.status !== "in_progress") return "closed";
          const currentDeadline = new Date(current.deadlineAt).getTime();
          if (!Number.isFinite(currentDeadline) || Date.now() >= currentDeadline) return "expired";
          tx.update(ref, { answers: clean, updatedAt: FieldValue.serverTimestamp() });
          return "ok";
        });
        if (saveResult === "missing") return json(404, { error: "Attempt not found." });
        if (saveResult === "owner") return json(403, { error: "Not authorised." });
        if (saveResult === "closed") return json(409, { error: "This examination attempt is no longer editable." });
        if (saveResult === "expired") {
          return json(409, {
            error: "The examination time has expired. Submit is no longer available.",
            status: "expired",
          });
        }
        return json(200, { ok: true });
      }

      if (action === "expire" && Date.now() < deadline) {
        return json(403, { error: "The examination timer has not expired yet." });
      }

      if (action === "submit" || action === "expire") {
        const requestedAnswers =
          body.answers && typeof body.answers === "object" && !Array.isArray(body.answers) ? body.answers : null;
        if (requestedAnswers) {
          const allowedQuestionIds = new Set(effectiveQuestions.map((q: any) => String(q.id)));
          if (
            Object.keys(requestedAnswers).length > 200 ||
            Object.keys(requestedAnswers).some(key => !allowedQuestionIds.has(key)) ||
            Object.values(requestedAnswers).some((v: any) =>
              typeof v === "string"
                ? v.length > 10000
                : !(Array.isArray(v) && v.length <= 20 && v.every((item: any) => typeof item === "string" && item.length <= 500))
            ) ||
            Object.values(requestedAnswers).some((v: any) => typeof v !== "string" && !Array.isArray(v))
          ) {
            return json(400, {
              error: "Invalid answers payload. Text answers are limited to 10,000 characters and selected options to 20 entries.",
            });
          }
        }
        const submission = await adminDb.runTransaction(async tx => {
          const currentSnap = await tx.get(ref);
          if (!currentSnap.exists) return { kind: "missing" as const };
          const current = currentSnap.data() || {};
          if (current.studentUid !== c.uid && (!student || current.studentId !== student.id)) {
            return { kind: "owner" as const };
          }
          if (current.status !== "in_progress") {
            return { kind: "closed" as const, status: String(current.status || "closed") };
          }
          const currentDeadline = new Date(current.deadlineAt).getTime();
          const deadlinePassed = !Number.isFinite(currentDeadline) || Date.now() >= currentDeadline;
          const finalAnswers = answersForFinalization(current.answers, requestedAnswers, deadlinePassed);
          if (deadlinePassed) {
            const grading = gradeAnswers({ ...exam, questions: effectiveQuestions }, finalAnswers);
            tx.update(ref, {
              answers: finalAnswers,
              status: "expired",
              ...grading,
              deadlineAt: FieldValue.delete(),
              submittedAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });
            return { kind: "expired" as const, grading, attempt: current };
          }
          if (action === "expire") return { kind: "active" as const };
          const grading = gradeAnswers({ ...exam, questions: effectiveQuestions }, finalAnswers);
          tx.update(ref, {
            answers: finalAnswers,
            ...grading,
            status: "submitted",
            deadlineAt: FieldValue.delete(),
            submittedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          return { kind: "submitted" as const, grading, attempt: current };
        });
        if (submission.kind === "missing") return json(404, { error: "Attempt not found." });
        if (submission.kind === "owner") return json(403, { error: "Not authorised." });
        if (submission.kind === "closed") {
          return json(409, { error: "This examination attempt is already closed.", status: submission.status });
        }
        if (submission.kind === "active") {
          return json(403, { error: "The examination timer has not expired yet." });
        }
        if (submission.kind === "expired") {
          await notifyStaff(submission.attempt, exam, id).catch(err =>
            console.warn("JDI staff notification failed", err)
          );
          return json(200, { ok: true, status: "expired", autoGraded: submission.grading.autoGraded });
        }
        const examRef = adminDb.collection("jdiExams").doc(String(a.examId));
        await examRef.collection("events").add({
          type: "attempt_submitted",
          attemptId: id,
          studentId: a.studentId,
          schoolId: a.schoolId,
          createdAt: FieldValue.serverTimestamp(),
        });
        await notifyStaff(submission.attempt, exam, id).catch(err =>
          console.warn("JDI staff notification failed", err)
        );
        return json(200, {
          ok: true,
          status: "submitted",
          autoGraded: submission.grading.autoGraded,
          score: submission.grading.autoGraded ? submission.grading.score : undefined,
          maxScore: submission.grading.maxScore,
        });
      }
      return json(400, { error: "Unknown action." });
    }
    return json(404, { error: "Examination attempt endpoint not found." });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "AUTH") return json(401, { error: "Authentication required." });
    if (msg === "PROFILE") return json(403, { error: "Portal profile not found." });
    if (msg === "INACTIVE") return json(403, { error: "Account is inactive." });
    console.error("JDI attempt handler failed", e);
    return json(500, { error: "Unable to process this examination attempt." });
  }
};
