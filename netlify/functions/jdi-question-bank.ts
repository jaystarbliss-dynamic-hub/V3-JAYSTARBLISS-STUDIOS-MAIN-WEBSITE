import type { Handler } from "@netlify/functions";
import { adminAuth, adminDb } from "../../api/_lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

const json = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});
const norm = (value: unknown) => String(value || "").trim().toUpperCase();
const adminRoles = ["SUPER_ADMIN", "SUPERADMIN", "ADMIN"];
const tutorRoles = ["TUTOR", "STAFF", "INSTRUCTOR"];

async function caller(event: any) {
  const header = event.headers?.authorization || event.headers?.Authorization || "";
  if (!header.startsWith("Bearer ")) throw new Error("AUTH");
  const token = await adminAuth.verifyIdToken(header.slice(7));
  const profile = await adminDb.collection("users").doc(token.uid).get();
  if (!profile.exists) throw new Error("PROFILE");
  const user = profile.data() || {};
  if (["DISABLED", "SUSPENDED", "BANNED"].includes(norm(user.accountStatus || user.status))) throw new Error("INACTIVE");
  return { uid: token.uid, role: norm(user.role), user };
}

async function canAccessSchool(c: any, schoolId: string) {
  if (adminRoles.includes(c.role)) return true;
  if (c.role === "SCHOOL") return String(c.user.schoolId || c.uid) === schoolId;
  if (!tutorRoles.includes(c.role)) return false;
  const profileSchoolIds = [c.user.schoolId, c.user.school_id]
    .concat(Array.isArray(c.user.schoolIds) ? c.user.schoolIds : [])
    .concat(Array.isArray(c.user.assignedSchoolIds) ? c.user.assignedSchoolIds : [])
    .filter(Boolean).map(String);
  if (profileSchoolIds.includes(schoolId)) return true;
  const snap = await adminDb.collection("staffSchoolAccess").doc(c.uid).get();
  const access = snap.exists ? (snap.data() || {}) : {};
  const accessSchoolIds = [access.schoolId]
    .concat(Array.isArray(access.schoolIds) ? access.schoolIds : [])
    .concat(Array.isArray(access.assignedSchoolIds) ? access.assignedSchoolIds : [])
    .filter(Boolean).map(String);
  return accessSchoolIds.includes(schoolId);
}

function validateQuestion(value: any) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const id = String(value.id || "").trim().slice(0, 120);
  const prompt = String(value.prompt || "").trim();
  const type = String(value.type || "single_choice");
  const allowed = ["single_choice", "multiple_choice", "true_false", "short_answer", "essay"];
  if (!prompt || prompt.length > 5000 || !allowed.includes(type)) return null;
  const options = Array.isArray(value.options) ? value.options.slice(0, 10).map((o: any, i: number) => ({
    id: String(o?.id || i).slice(0, 80),
    text: String(o?.text || "").trim().slice(0, 1000),
  })) : [];
  if (["single_choice", "multiple_choice", "true_false"].includes(type) && (options.length < 2 || new Set(options.map((o: any) => o.id)).size !== options.length)) return null;
  const optionIds = new Set(options.map((o: any) => o.id));
  const correctOptionIds = Array.isArray(value.correctOptionIds) ? [...new Set(value.correctOptionIds.map(String))].filter((x: string) => optionIds.has(x)).slice(0, 10) : [];
  if (["single_choice", "multiple_choice", "true_false"].includes(type) && !correctOptionIds.length) return null;
  if (["single_choice", "true_false"].includes(type) && correctOptionIds.length !== 1) return null;
  return {
    ...(id ? { id } : {}),
    prompt,
    type,
    options,
    correctOptionIds,
    acceptedAnswers: Array.isArray(value.acceptedAnswers) ? value.acceptedAnswers.map((x: unknown) => String(x).trim().slice(0, 500)).filter(Boolean).slice(0, 20) : [],
    points: Math.max(0, Math.min(1000, Number.isFinite(Number(value.points)) ? Number(value.points) : 1)),
    required: value.required !== false,
    topic: String(value.topic || "").trim().slice(0, 160),
    difficulty: ["easy", "medium", "hard"].includes(String(value.difficulty)) ? String(value.difficulty) : "medium",
  };
}

export const handler: Handler = async event => {
  try {
    const c = await caller(event);
    if (!adminRoles.includes(c.role) && !tutorRoles.includes(c.role)) return json(403, { error: "Only tutors and Super Admins can manage the question bank." });
    const method = event.httpMethod || "GET";
    const query = event.queryStringParameters || {};
    const schoolId = String(query.schoolId || c.user.schoolId || c.user.school_id || "").trim();
    if (!schoolId || !(await canAccessSchool(c, schoolId))) return json(403, { error: "You do not have access to this school's question bank." });

    if (method === "GET") {
      const snap = await adminDb.collection("jdiQuestionBank").where("schoolId", "==", schoolId).limit(500).get();
      const questions = snap.docs.map(d => ({ ...d.data(), bankId: d.id })).sort((a: any, b: any) => String(a.prompt || "").localeCompare(String(b.prompt || "")));
      return json(200, { questions });
    }
    if (method !== "POST") return json(405, { error: "Method not allowed." });
    if (String(event.body || "").length > 100000) return json(413, { error: "Request too large." });
    const body = JSON.parse(event.body || "{}");
    const action = String(body.action || "save");
    if (action === "delete") {
      const questionId = String(body.questionId || "").trim();
      if (!questionId) return json(400, { error: "Question ID is required." });
      const ref = adminDb.collection("jdiQuestionBank").doc(questionId);
      const snap = await ref.get();
      if (!snap.exists || String(snap.data()?.schoolId || "") !== schoolId) return json(404, { error: "Question not found." });
      await ref.delete();
      return json(200, { ok: true });
    }
    if (action !== "save") return json(400, { error: "Unknown question-bank action." });
    const question = validateQuestion(body.question);
    if (!question) return json(400, { error: "Check the question text, type, options and correct answer before saving." });
    const questionId = String(body.questionId || "").trim();
    if (questionId) {
      const ref = adminDb.collection("jdiQuestionBank").doc(questionId);
      const snap = await ref.get();
      if (!snap.exists || String(snap.data()?.schoolId || "") !== schoolId) return json(404, { error: "Question not found." });
      await ref.update({ ...question, updatedAt: FieldValue.serverTimestamp(), updatedBy: c.uid });
      return json(200, { ok: true, questionId });
    }
    const ref = adminDb.collection("jdiQuestionBank").doc();
    await ref.set({ ...question, schoolId, createdBy: c.uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return json(201, { ok: true, questionId: ref.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "AUTH") return json(401, { error: "Authentication required." });
    if (message === "PROFILE") return json(403, { error: "Portal profile not found." });
    if (message === "INACTIVE") return json(403, { error: "Your account is not active." });
    console.error("JDI question bank error", error);
    return json(500, { error: "Unable to process the question-bank request." });
  }
};
