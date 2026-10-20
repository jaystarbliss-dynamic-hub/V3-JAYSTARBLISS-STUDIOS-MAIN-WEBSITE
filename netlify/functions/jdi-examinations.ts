import type { Handler } from "@netlify/functions";
import { adminAuth, adminDb } from "../../api/_lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { normalizeQuestions, isAssessmentStudentRole } from "../../api/_lib/jdi-assessment.js";

const json = (statusCode: number, body: Record<string, unknown>) => ({ statusCode, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }, body: JSON.stringify(body) });
const bearer = (event: any) => { const value = event.headers?.authorization || event.headers?.Authorization || ""; return value.startsWith("Bearer ") ? value.slice(7) : ""; };
const hashCode = (salt: string, code: string) => createHash("sha256").update(salt + ":" + code).digest("hex");
const constantEqual = (a: string, b: string) => { const aa = Buffer.from(a, "hex"), bb = Buffer.from(b, "hex"); return aa.length === bb.length && timingSafeEqual(aa, bb); };
const norm = (value: unknown) => String(value || "").trim().toUpperCase();
const normaliseClass = (value: unknown) => {
  const label = String(value || "").trim().toLowerCase();
  const aliases: Record<string, string> = {
    "primary 1": "year 1", "primary 2": "year 2", "primary 3": "year 3",
    "primary 4": "year 4", "primary 5": "year 5", "primary 6": "year 6",
    "nursery 1": "nursery 1", "nursery 2": "nursery 2", "nursery 3": "nursery 3",
    "ss1": "ss 1", "ss2": "ss 2", "ss3": "ss 3"
  };
  return aliases[label] || label;
};
const staffRoles = ["TUTOR", "STAFF", "INSTRUCTOR"];
const adminRoles = ["SUPER_ADMIN", "SUPERADMIN", "ADMIN"];
async function caller(event: any) {
  const token = bearer(event); if (!token) throw new Error("AUTH");
  const decoded = await adminAuth.verifyIdToken(token);
  const snap = await adminDb.collection("users").doc(decoded.uid).get();
  if (!snap.exists) throw new Error("PROFILE");
  const user = snap.data() || {};
  if (["DISABLED", "SUSPENDED", "BANNED"].includes(norm(user.accountStatus || user.status))) throw new Error("INACTIVE");
  return { uid: decoded.uid, role: norm(user.role), user };
}
async function getStudent(uid: string) {
  for (const collectionName of ["students", "individualStudents"]) { const direct = await adminDb.collection(collectionName).doc(uid).get(); if (direct.exists) return { id: direct.id, data: direct.data() || {} }; }
  for (const collectionName of ["students", "individualStudents"]) {
    const q = await adminDb.collection(collectionName).where("firebaseUid", "==", uid).limit(1).get();
    if (!q.empty) return { id: q.docs[0].id, data: q.docs[0].data() };
    const q2 = await adminDb.collection(collectionName).where("userId", "==", uid).limit(1).get();
    if (!q2.empty) return { id: q2.docs[0].id, data: q2.docs[0].data() };
  }
  return null;
}
function studentSafe(exam: any) {
  const { passcodeHash, passcodeSalt, questions, answerKey, createdBy, studentIds, studentUids, ...safe } = exam;
  return { ...safe, questions: Array.isArray(questions) ? questions.map((q: any) => { const { correctOptionIds, acceptedAnswers, answer, explanation, ...studentQuestion } = q; return studentQuestion; }) : [] };
}
function tutorSafe(exam: any) {
  const { passcodeHash, passcodeSalt, passcode, studentUids, answerKey, ...safe } = exam;
  return { ...safe, questions: Array.isArray(exam.questions) ? exam.questions : [] };
}
async function permittedSchool(callerInfo: any, schoolId: string) {
  if (adminRoles.includes(callerInfo.role)) return true;
  if (callerInfo.role === "SCHOOL") return String(callerInfo.user.schoolId || callerInfo.uid) === schoolId;
  if (staffRoles.includes(callerInfo.role)) {
    const profileSchoolIds = [
      callerInfo.user.schoolId, callerInfo.user.school_id,
      ...(Array.isArray(callerInfo.user.schoolIds) ? callerInfo.user.schoolIds : []),
      ...(Array.isArray(callerInfo.user.assignedSchoolIds) ? callerInfo.user.assignedSchoolIds : [])
    ].filter(Boolean).map(String);
    if (profileSchoolIds.includes(schoolId)) return true;
    const access = await adminDb.collection("staffSchoolAccess").doc(callerInfo.uid).get();
    const data = access.exists ? (access.data() || {}) : {};
    const accessSchoolIds = [data.schoolId, ...(Array.isArray(data.schoolIds) ? data.schoolIds : [])].filter(Boolean).map(String);
    return accessSchoolIds.includes(schoolId);
  }
  return false;
}
export const handler: Handler = async (event) => {
  try {
    const c = await caller(event);
    const method = event.httpMethod || "GET";
    const path = String(event.path || "");
    if (method === "GET" && path.endsWith("/student-examinations")) {
      if (!isAssessmentStudentRole(c.role)) return json(403, { error: "Student access required." });
      const student = await getStudent(c.uid);
      if (!student) return json(200, { exams: [] });
      const schoolId = String(student.data.schoolId || student.data.school_id || student.data.schoolDocId || "");
      const [schoolExams, individualById, individualByUid] = await Promise.all([
        schoolId ? adminDb.collection("jdiExams").where("schoolId", "==", schoolId).limit(100).get() : Promise.resolve(null),
        adminDb.collection("jdiExams").where("studentIds", "array-contains", student.id).limit(100).get(),
        adminDb.collection("jdiExams").where("studentUids", "array-contains", c.uid).limit(100).get()
      ]);
      const examDocs = new Map<string, any>();
      for (const snap of [schoolExams, individualById, individualByUid]) snap?.docs.forEach(d => examDocs.set(d.id, d));
      const now = Date.now();
      const rows = Array.from(examDocs.values()).map(doc => { const raw = doc.data(); const metadata: any = { ...studentSafe(raw) }; delete metadata.questions; return { id: doc.id, ...metadata, _targetStudentIds: Array.isArray(raw.studentIds) ? raw.studentIds.map(String) : [], _targetStudentUids: Array.isArray(raw.studentUids) ? raw.studentUids.map(String) : [] }; }).filter((exam: any) => {
        const individual = exam.audienceType === "individual";
        const directlyAssigned = exam._targetStudentIds.includes(student.id) || exam._targetStudentUids.includes(c.uid);
        const classes = Array.isArray(exam.classIds) && exam.classIds.length ? exam.classIds.map(normaliseClass) : [normaliseClass(exam.targetClass || "all")];
        const classId = normaliseClass(student.data.classId || student.data.class_id || student.data.classLevel || student.data.className || student.data.class || "");
        const schoolEligible = Boolean(schoolId && exam.schoolId === schoolId && (classes.includes("all") || classes.includes(classId)));
        return (individual ? directlyAssigned : schoolEligible) && exam.status !== "draft" && exam.status !== "archived";
      }).map((exam: any) => {
        const from = exam.availableFrom ? new Date(exam.availableFrom).getTime() : 0;
        const until = exam.availableUntil ? new Date(exam.availableUntil).getTime() : Number.MAX_SAFE_INTEGER;
        const status = exam.status === "completed" || now >= until ? "completed" : (now < from || exam.status === "scheduled") ? "upcoming" : exam.status === "active" ? "active" : "upcoming";
        const { _targetStudentIds, _targetStudentUids, ...safeExam } = exam;
        return { ...safeExam, status };
      });
      const attemptsSnap = await adminDb.collection("jdiExamAttempts").where("studentId", "==", student.id).limit(200).get(); const attemptsByExam: Record<string, any> = {}; for (const attemptDoc of attemptsSnap.docs) { const a = attemptDoc.data(); const current = attemptsByExam[String(a.examId)]; if (!current || (a.startedAt?.toMillis?.() || 0) > (current.startedAtMs || 0)) attemptsByExam[String(a.examId)] = { attemptId: attemptDoc.id, attemptStatus: a.status, score: a.releasedAt ? a.score : undefined, releasedAt: a.releasedAt || undefined, startedAtMs: a.startedAt?.toMillis?.() || 0 }; } const withAttempts = rows.map((exam: any) => { const a = attemptsByExam[String(exam.id)]; if (!a) return exam; const { startedAtMs, ...safeAttempt } = a; return { ...exam, ...safeAttempt }; }); return json(200, { exams: withAttempts });
    }
    if (method === "POST" && path.endsWith("/examination-passcode")) {
      if (!isAssessmentStudentRole(c.role)) return json(403, { error: "Student access required." });
      if (String(event.body || "").length > 20000) return json(413, { error: "Request too large." });
      const body = JSON.parse(event.body || "{}");
      const examId = String(body.examId || "").trim(), passcode = String(body.passcode || "").trim();
      if (!examId || !passcode || passcode.length > 128) return json(400, { error: "Enter the examination passcode." });
      const student = await getStudent(c.uid);
      if (!student) return json(403, { error: "This account is not assigned to a student record." });
      const ref = adminDb.collection("jdiExams").doc(examId);
      const examSnap = await ref.get();
      if (!examSnap.exists) return json(403, { error: "The passcode could not be validated for this examination." });
      const exam = examSnap.data() || {};
      const now = Date.now();
      const from = exam.availableFrom ? new Date(exam.availableFrom).getTime() : 0;
      const until = exam.availableUntil ? new Date(exam.availableUntil).getTime() : Number.MAX_SAFE_INTEGER;
      const schoolId = String(student.data.schoolId || student.data.school_id || student.data.schoolDocId || "");
      const classes = Array.isArray(exam.classIds) && exam.classIds.length ? exam.classIds.map(normaliseClass) : [normaliseClass(exam.targetClass || "all")];
      const classId = normaliseClass(student.data.classId || student.data.class_id || student.data.classLevel || student.data.className || student.data.class || "");
      const assigned = exam.audienceType === "individual" ? ((Array.isArray(exam.studentIds) && exam.studentIds.map(String).includes(student.id)) || (Array.isArray(exam.studentUids) && exam.studentUids.map(String).includes(c.uid))) : (exam.schoolId === schoolId && (classes.includes("all") || classes.includes(classId)));
      const active = exam.status === "active" && now >= from && now < until;
      const validHash = typeof exam.passcodeHash === "string" && typeof exam.passcodeSalt === "string";
      const candidate = validHash ? hashCode(exam.passcodeSalt, passcode) : "";
      const validCode = validHash && constantEqual(candidate, exam.passcodeHash);
      const throttleRef = adminDb.collection("jdiPasscodeAttempts").doc(c.uid + "_" + examId); const throttleDecision = await adminDb.runTransaction(async tx => { const snap = await tx.get(throttleRef); const data = snap.data() || {}; const nowMs = Date.now(); const oldStart = Number(data.windowStart || 0); const count = nowMs - oldStart > 15 * 60 * 1000 ? 0 : Number(data.failedCount || 0); if (count >= 5) return { blocked: true }; if (!validCode) { tx.set(throttleRef, { windowStart: count === 0 ? nowMs : oldStart || nowMs, failedCount: count + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true }); } else if (assigned && active && snap.exists) tx.delete(throttleRef); return { blocked: false }; });
      if (throttleDecision.blocked) return json(429, { error: "Too many incorrect attempts. Wait 15 minutes before trying again." });
      if (!assigned || !active || !validCode) return json(403, { error: "The passcode could not be validated for this examination." });
      const legacyAttemptId = createHash("sha256").update(examId + ":" + student.id).digest("hex");
      const legacyAttempt = await adminDb.collection("jdiExamAttempts").doc(legacyAttemptId).get();
      if (legacyAttempt.exists) {
        const legacy = legacyAttempt.data() || {};
        if (legacy.status === "in_progress" && legacy.studentUid === c.uid && new Date(legacy.deadlineAt).getTime() > now) return json(200, { attemptId: legacyAttemptId, resumed: true });
      }
      const legacyAttemptsUsed = legacyAttempt.exists ? 1 : 0;
      const lockId = createHash("sha256").update(examId + ":" + student.id).digest("hex");
      const lockRef = adminDb.collection("jdiAttemptLimits").doc(lockId);
      const attemptId = randomBytes(16).toString("hex");
      const attemptRef = adminDb.collection("jdiExamAttempts").doc(attemptId);
      const duration = Math.min(300, Math.max(1, Number(exam.durationMinutes || 30)));
      const questions = Array.isArray(exam.questions) ? exam.questions : [];
      const shuffle = <T,>(items: T[]) => { const copy = [...items]; for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; } return copy; };
      const questionOrder = exam.shuffleQuestions === true ? shuffle(questions.map((q: any) => String(q.id))) : questions.map((q: any) => String(q.id));
      const optionOrderMap: Record<string, string[]> = {};
      for (const q of questions) { const ids = Array.isArray(q.options) ? q.options.map((o: any) => String(o.id)) : []; optionOrderMap[String(q.id)] = exam.shuffleOptions === true ? shuffle(ids) : ids; }
      const attempt = { examId, studentId: student.id, studentUid: c.uid, schoolId, status: "in_progress", startedAt: FieldValue.serverTimestamp(), deadlineAt: new Date(now + duration * 60000).toISOString(), answers: {}, questionOrder, optionOrderMap, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
      let resumed = false; let finalAttemptId = attemptId;
      await adminDb.runTransaction(async tx => {
        const [lockSnap, existingExam] = await Promise.all([tx.get(lockRef), tx.get(ref)]);
        const currentExam=existingExam.data()||{};const currentFrom=currentExam.availableFrom?Date.parse(String(currentExam.availableFrom)):0;const currentUntil=currentExam.availableUntil?Date.parse(String(currentExam.availableUntil)):Number.MAX_SAFE_INTEGER;if(!existingExam.exists||currentExam.status!=="active"||!Number.isFinite(currentFrom)||!Number.isFinite(currentUntil)||Date.now()<currentFrom||Date.now()>=currentUntil)throw new Error("INACTIVE_EXAM");
        const lock = lockSnap.data() || {};
        const maxAttempts = Math.min(10, Math.max(1, Number(existingExam.data()?.maxAttempts || 1)));
        if (lock.activeAttemptId) {
          const activeRef = adminDb.collection("jdiExamAttempts").doc(String(lock.activeAttemptId));
          const activeSnap = await tx.get(activeRef);
          const active = activeSnap.data() || {};
          if (activeSnap.exists && active.status === "in_progress" && active.studentUid === c.uid && new Date(active.deadlineAt).getTime() > Date.now()) {
            resumed = true; finalAttemptId = activeRef.id; return;
          }
        }
        const usedAttempts = Math.max(Number(lock.attemptCount || 0), legacyAttemptsUsed);
        if (usedAttempts >= maxAttempts) throw new Error("ATTEMPT_LIMIT");
        tx.create(attemptRef, attempt);
        tx.set(lockRef, { examId, studentId: student.id, studentUid: c.uid, schoolId, attemptCount: usedAttempts + 1, activeAttemptId: attemptId, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      });
      return json(200, { attemptId: finalAttemptId, resumed });
    }
    if (method === "GET" && path.endsWith("/tutor-examinations")) {
      if (!staffRoles.includes(c.role) && !adminRoles.includes(c.role)) return json(403, { error: "Only tutors and Super Admins can access examination authoring data." });
      const requestedSchoolId = event.queryStringParameters?.schoolId;
      const schoolId = adminRoles.includes(c.role) && requestedSchoolId === "" ? "" : String(requestedSchoolId || c.user.schoolId || "");
      let exams:any;
      const docs=new Map<string,any>();
      if (schoolId) {
        if (!(await permittedSchool(c, schoolId))) return json(403, { error: "You do not have access to this school." });
        const schoolExams=await adminDb.collection("jdiExams").where("schoolId", "==", schoolId).limit(100).get();
        schoolExams.docs.forEach((d:any)=>docs.set(d.id,d));
      }
      if (adminRoles.includes(c.role) && !schoolId) {
        // The platform admin workspace can load the cross-school inventory when no school filter is selected.
        const allExams=await adminDb.collection("jdiExams").limit(200).get();
        allExams.docs.forEach((d:any)=>docs.set(d.id,d));
      } else if (adminRoles.includes(c.role)) {
        const individualExams=await adminDb.collection("jdiExams").where("audienceType", "==", "individual").limit(100).get();
        individualExams.docs.forEach((d:any)=>docs.set(d.id,d));
      } else if (staffRoles.includes(c.role)) {
        const individualExams=await adminDb.collection("jdiExams").where("createdBy", "==", c.uid).limit(100).get();
        individualExams.docs.filter((d:any)=>d.data().audienceType==="individual").forEach((d:any)=>docs.set(d.id,d));
      }
      const result:any={exams:Array.from(docs.values()).map((d:any)=>({id:d.id,...tutorSafe(d.data())}))};
      if(String(event.queryStringParameters?.includeStudents||"") === "true" && (staffRoles.includes(c.role)||adminRoles.includes(c.role))){
        const [individuals,schoolStudents]=await Promise.all([
          adminDb.collection("individualStudents").limit(500).get(),
          adminDb.collection("students").limit(500).get()
        ]);
        const studentMap=new Map<string,any>();const canViewSchoolRoster=Boolean(schoolId&&await permittedSchool(c,schoolId));
        for(const snap of [individuals,schoolStudents])for(const d of snap.docs){
          const s=d.data();const linkedSchool=String(s.schoolId||s.school_id||s.schoolDocId||"");
          const assigned=[s.tutorId,s.staffId,s.assignedTutorId,s.assignedStaffId,s.instructorId].map((v:any)=>String(v||"")).includes(c.uid);
          const visible=adminRoles.includes(c.role)||assigned||(canViewSchoolRoster&&linkedSchool===schoolId);
          if(visible)studentMap.set(d.id,{id:d.id,name:String(s.fullName||s.studentName||s.name||"Student"),className:String(s.className||s.classLevel||s.classId||s.class||""),schoolId:linkedSchool});
        }
        result.students=Array.from(studentMap.values()).slice(0,500);
      }
      return json(200,result);
    }
    if (method === "POST" && path.endsWith("/tutor-examinations")) {
      if (String(event.body || "").length > 500000) return json(413, { error: "Examination draft is too large." });
      if (!staffRoles.includes(c.role) && !adminRoles.includes(c.role)) return json(403, { error: "Only authorised tutors and Super Admins can create examinations." });
      const body = JSON.parse(event.body || "{}");
      let schoolId = String(body.schoolId || c.user.schoolId || "").trim();
      const audienceType = body.audienceType === "individual" ? "individual" : "school";
      const studentIds: string[] = audienceType === "individual" && Array.isArray(body.studentIds) ? [...new Set<string>(body.studentIds.map((v:any)=>String(v).trim()).filter((v:string)=>Boolean(v)))].slice(0,200) : [];
      const studentUids: string[] = [];
      if (audienceType === "school") {
        if (!schoolId || !(await permittedSchool(c, schoolId))) return json(403, { error: "You do not have access to this school." });
      } else {
        if (!studentIds.length) return json(400, { error: "Select at least one individually enrolled student." });
        if (adminRoles.includes(c.role)) {
          for (const studentId of studentIds) {
            let record:any=null;
            for (const name of ["individualStudents","students"]) { const snap=await adminDb.collection(name).doc(studentId).get(); if(snap.exists){record=snap.data()||{};break;} }
            if(!record)return json(404,{error:"Student record not found: "+studentId});
            const uid=String(record.firebaseUid||record.userId||record.uid||studentId);
            if(!(await adminDb.collection("users").doc(uid).get()).exists)return json(409,{error:"Each targeted student must have an active portal account: "+studentId});
            studentUids.push(uid);
          }
        } else {
          if (!staffRoles.includes(c.role)) return json(403, { error: "Only authorised tutors and Super Admins can create individual examinations." });
          for (const studentId of studentIds) {
            let record:any=null;
            for (const name of ["individualStudents","students"]) { const snap=await adminDb.collection(name).doc(studentId).get(); if(snap.exists){record=snap.data()||{};break;} }
            if(!record)return json(404,{error:"Student record not found: "+studentId});
            const assignedToTutor=[record.tutorId,record.staffId,record.assignedTutorId,record.assignedStaffId,record.instructorId].map((v:any)=>String(v||"")).includes(c.uid);
            const linkedSchool=String(record.schoolId||record.school_id||"");
            const hasSchoolAccess=Boolean(linkedSchool&&await permittedSchool(c,linkedSchool));
            if(!assignedToTutor&&!hasSchoolAccess)return json(403,{error:"You are not authorised to assign an examination to student "+studentId});
            const uid=String(record.firebaseUid||record.userId||record.uid||studentId);
            if(!(await adminDb.collection("users").doc(uid).get()).exists)return json(409,{error:"Each targeted student must have an active portal account: "+studentId});
            studentUids.push(uid);
          }
        }
        schoolId = "";
      }
      const title = String(body.title || "").trim(), subject = String(body.subject || "").trim();
      const seriesName = String(body.seriesName || "").trim().slice(0, 160);
      const courseName = String(body.courseName || "").trim().slice(0, 160);
      const learningVideoUrl = String(body.learningVideoUrl || "").trim().slice(0, 2000);
      if (learningVideoUrl) { try { const url = new URL(learningVideoUrl); if (!["http:", "https:"].includes(url.protocol)) throw new Error("URL"); } catch { return json(400, { error: "Learning video URL must be a valid http or https link." }); } }
      const questions = Array.isArray(body.questions) ? body.questions : [];
      const durationMinutes = Number(body.durationMinutes || 30);
      if (!title || !subject || !questions.length || questions.length > 200 || !Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 300) return json(400, { error: "Provide a title, subject, 1–200 questions and a whole-number duration from 1 to 300 minutes." });
      const normalized = normalizeQuestions(questions, body.gradingMode === "manual" ? "manual" : "automatic");
      if (normalized.error) return json(400, { error: normalized.error });

      const requestedMaxAttempts = Number(body.maxAttempts ?? 1);
      if (!Number.isInteger(requestedMaxAttempts) || requestedMaxAttempts < 1 || requestedMaxAttempts > 10) return json(400, { error: "Maximum attempts must be an integer from 1 to 10." });
      const fromTime = body.availableFrom ? new Date(String(body.availableFrom)).getTime() : null; const untilTime = body.availableUntil ? new Date(String(body.availableUntil)).getTime() : null;
      if ((fromTime !== null && !Number.isFinite(fromTime)) || (untilTime !== null && !Number.isFinite(untilTime)) || (fromTime !== null && untilTime !== null && untilTime <= fromTime)) return json(400, { error: "The examination closing time must be after its opening time." });
      const passcode = String(body.passcode || randomBytes(8).toString("hex").toUpperCase());
      if (passcode.length < 6 || passcode.length > 128) return json(400, { error: "Passcodes must be between 6 and 128 characters." });
      const salt = randomBytes(16).toString("hex");
      const status = body.status === "active" ? "active" : body.status === "scheduled" ? "scheduled" : "draft";
      if(status === "scheduled" && fromTime === null) return json(400, { error: "Scheduled examinations need an opening date and time." });
      const maxAttempts = requestedMaxAttempts;
      const payload = { schoolId, audienceType, studentIds: audienceType === "individual" ? studentIds : [], studentUids: audienceType === "individual" ? [...new Set(studentUids)] : [], classIds: Array.isArray(body.classIds) ? body.classIds.map(String).slice(0, 100) : [], title, subject, seriesName, courseName, learningVideoUrl: learningVideoUrl || null, instructions: String(body.instructions || "").slice(0, 5000), questions: normalized.questions, durationMinutes, maxAttempts, shuffleQuestions: body.shuffleQuestions === true, shuffleOptions: body.shuffleOptions === true, gradingMode: body.gradingMode === "manual" ? "manual" : "automatic", availableFrom: body.availableFrom ? String(body.availableFrom) : null, availableUntil: body.availableUntil ? String(body.availableUntil) : null, status, passcodeSalt: salt, passcodeHash: hashCode(salt, passcode), createdBy: c.uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
      const saved = await adminDb.collection("jdiExams").add(payload);
      return json(201, { exam: { id: saved.id, title, subject, status, durationMinutes, questionCount: questions.length }, passcode });
    }
    return json(404, { error: "Examination endpoint not found." });
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH") return json(401, { error: "Authentication required." });
    if (error instanceof Error && error.message === "PROFILE") return json(403, { error: "Portal profile not found." });
    if (error instanceof Error && error.message === "INACTIVE") return json(403, { error: "Your account is not active." });
    if (error instanceof Error && error.message === "INACTIVE_EXAM") return json(409, { error: "This examination is no longer active." });
    if (error instanceof Error && error.message === "ATTEMPT_EXISTS") return json(409, { error: "An attempt for this examination has already been submitted." });
    if (error instanceof Error && error.message === "ATTEMPT_LIMIT") return json(409, { error: "You have used all allowed attempts for this examination." });
    console.error("JDI examination handler failed", error);
    return json(500, { error: "Unable to process the examination request." });
  }
};
