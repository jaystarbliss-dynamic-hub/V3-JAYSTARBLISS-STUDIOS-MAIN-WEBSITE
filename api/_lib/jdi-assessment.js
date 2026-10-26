/**
 * Pure assessment-domain validation, grading, class normalisation, and permission
 * helpers shared by request handlers, frontend utilities, and automated tests.
 * Keeping one implementation prevents score, denominator, or class-matching drift.
 */
const OBJECTIVE = new Set(["single_choice", "multiple_choice", "true_false", "dropdown"]);
const TYPES = new Set([...OBJECTIVE, "short_answer", "essay"]);

export const CANONICAL_CLASSES = [
  "Early Years",
  "Grade 1",
  "Grade 2",
  "Grade 3",
  "Grade 4",
  "Grade 5",
  "Grade 6",
  "Grade 7",
  "Grade 8",
  "Grade 9",
  "Grade 10",
  "Grade 11",
  "Grade 12",
  "University (Undergraduate)",
  "Graduate (BSc, HND, ND, etc.)",
];

const CANONICAL_CLASS_ORDER = new Map(CANONICAL_CLASSES.map((name, idx) => [name, idx]));

/**
 * Normalises any legacy or variant class/grade label into one of the 15 canonical
 * platform classes: Early Years, Grade 1 .. Grade 12, University (Undergraduate),
 * or Graduate (BSc, HND, ND, etc.).
 */
export function normalizeClassName(input, fallback = "") {
  const raw = String(input ?? "").trim();
  if (!raw) return fallback;

  const cleaned = raw.replace(/\s+/g, " ").trim();
  const lower = cleaned.toLowerCase();

  if (CANONICAL_CLASS_ORDER.has(cleaned)) return cleaned;

  for (const canonical of CANONICAL_CLASSES) {
    if (canonical.toLowerCase() === lower) return canonical;
  }

  // Handle comma-separated or duplicate lists passed into normalizeClassName (e.g. "Grade 5, Grade 5" or "Primary 5, Year 5")
  if (cleaned.includes(",")) {
    const parts = cleaned
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
    if (parts.length > 1 && !/^graduate\s*\(/i.test(cleaned)) {
      const uniqueNorms = [];
      const seen = new Set();
      for (const p of parts) {
        const n = normalizeClassName(p, "");
        if (n && !seen.has(n)) {
          seen.add(n);
          uniqueNorms.push(n);
        }
      }
      if (uniqueNorms.length === 1) return uniqueNorms[0];
      if (uniqueNorms.length > 1) return uniqueNorms.join(", ");
    }
  }

  // Early Years variants
  if (
    /^(early\s*years?|eyfs|nursery(\s*\d+)?|kg(\s*\d+)?|kindergarten(\s*\d+)?|pre[\s-]*school|pre[\s-]*kg|pre[\s-]*nursery|reception|creche|crèche|play\s*group|day\s*care|toddler|young\s*creators?)$/i.test(
      lower
    )
  ) {
    return "Early Years";
  }

  // Graduate (BSc, HND, ND, etc.) variants
  if (
    /\b(graduate|post\s*graduate|pgd|b\.?sc|b\.?eng|b\.?tech|b\.?ed|b\.?a\b|hnd|ond|\bnd\b|m\.?sc|m\.?eng|mba|phd|nysc|adult|professional)\b/i.test(
      lower
    ) &&
    !/\bunder\s*graduate\b/i.test(lower)
  ) {
    return "Graduate (BSc, HND, ND, etc.)";
  }

  // University (Undergraduate) variants
  if (
    /\b(university|under\s*graduate|undergrad|uni\s*student|college|tertiary|[1-5]00\s*level|[1-5]00l)\b/i.test(
      lower
    )
  ) {
    return "University (Undergraduate)";
  }

  // Embedded "(Grade X)" such as "JSS 1 (Grade 7)" or "10 years / Grade 5"
  const embeddedGradeMatch = lower.match(/\b(?:grade|grd)\s*0*(\d{1,2})\b/i);
  if (embeddedGradeMatch) {
    const num = Number(embeddedGradeMatch[1]);
    if (num >= 1 && num <= 12) return `Grade ${num}`;
  }

  // Direct Grade 1..12 or G1..G12
  const gradeMatch = lower.match(/^(?:grade|grd|g)\s*0*(\d{1,2})\b/i);
  if (gradeMatch) {
    const num = Number(gradeMatch[1]);
    if (num >= 1 && num <= 12) return `Grade ${num}`;
  }

  // Primary / Basic / Year / Class / Standard 1..12
  const primaryOrYearMatch = lower.match(/^(?:primary|pry|pri|basic|year|yr|class|std|standard|p|b|y)\s*0*(\d{1,2})\b/i);
  if (primaryOrYearMatch) {
    const num = Number(primaryOrYearMatch[1]);
    if (num >= 1 && num <= 12) return `Grade ${num}`;
  }

  // Junior Secondary (JSS 1..3 / JS 1..3 -> Grade 7..9)
  const jssMatch = lower.match(/\b(?:jss|js|junior\s*secondary(?:\s*school)?)\s*0*([1-3])\b/i);
  if (jssMatch) {
    const num = Number(jssMatch[1]);
    return `Grade ${num + 6}`;
  }

  // Senior Secondary (SS 1..3 / SSS 1..3 -> Grade 10..12)
  const ssMatch = lower.match(/\b(?:sss|ss|senior\s*secondary(?:\s*school)?)\s*0*([1-3])\b/i);
  if (ssMatch) {
    const num = Number(ssMatch[1]);
    return `Grade ${num + 9}`;
  }

  // Age-based fallback strings like "10 years" or "Age 8"
  const ageOnlyMatch = lower.match(/^(?:age\s*)?(\d{1,2})\s*(?:years?|yrs?|y\/o)?$/i);
  if (ageOnlyMatch) {
    const num = Number(ageOnlyMatch[1]);
    if (num >= 1 && num <= 12) return `Grade ${num}`;
    if (num >= 13 && num <= 17) return `Grade ${Math.min(12, num - 5)}`;
    if (num >= 18 && num <= 22) return "University (Undergraduate)";
    if (num > 22) return "Graduate (BSc, HND, ND, etc.)";
  }

  // Legacy generic placeholders ("General", "Cadet", "Student")
  if (/^(general|cadet|student|scholar|primary\s*\/\s*secondary)$/i.test(lower)) {
    return fallback || "Grade 1";
  }

  // Bare number "1" .. "12"
  if (/^\d{1,2}$/.test(lower)) {
    const num = Number(lower);
    if (num >= 1 && num <= 12) return `Grade ${num}`;
  }

  return fallback || cleaned;
}

export function isCanonicalClass(input) {
  const norm = normalizeClassName(input);
  return CANONICAL_CLASS_ORDER.has(norm);
}

export function normalizeClassList(input) {
  const splitTokens = value => {
    const s = String(value ?? "").trim();
    if (!s) return [];
    if (/^graduate\s*\(/i.test(s)) return [s];
    // Protect "Graduate (BSc, HND, ND, etc.)" before splitting on commas
    const protectedStr = s.replace(/Graduate\s*\([^)]+\)/gi, match => match.replace(/,/g, "__COMMA__"));
    return protectedStr
      .split(",")
      .map(part => part.replace(/__COMMA__/g, ",").trim())
      .filter(Boolean);
  };

  const list = Array.isArray(input)
    ? input.flatMap(item => splitTokens(item))
    : typeof input === "string" && input.trim()
      ? splitTokens(input)
      : [];
  const seen = new Set();
  const result = [];
  for (const item of list) {
    const norm = normalizeClassName(item);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      result.push(norm);
    }
  }
  return result.sort((a, b) => {
    const ia = CANONICAL_CLASS_ORDER.has(a) ? CANONICAL_CLASS_ORDER.get(a) : 999;
    const ib = CANONICAL_CLASS_ORDER.has(b) ? CANONICAL_CLASS_ORDER.get(b) : 999;
    if (ia !== ib) return ia - ib;
    return a.localeCompare(b, undefined, { numeric: true });
  });
}

export function formatNormalizedClassDisplay(input, fallback = "Grade 1") {
  const list = normalizeClassList(input);
  if (list.length > 0) return list.join(", ");
  return normalizeClassName(input, fallback) || fallback;
}

/**
 * Checks whether a student's class matches a list of target classes on an exam or schedule.
 * Supports legacy class labels on either side by comparing canonical class names.
 */
export function classesMatch(studentClass, targetClasses, options = {}) {
  const targets = Array.isArray(targetClasses)
    ? targetClasses.map(c => String(c ?? "").trim()).filter(Boolean)
    : typeof targetClasses === "string" && targetClasses.trim()
      ? [targetClasses.trim()]
      : [];

  if (targets.length === 0) {
    return options.allowEmptyTarget === true;
  }

  const rawStudent = String(studentClass ?? "").trim();
  if (!rawStudent) return false;

  const normStudent = normalizeClassName(rawStudent).toLowerCase();
  const rawStudentLower = rawStudent.toLowerCase();

  return targets.some(target => {
    const normTarget = normalizeClassName(target).toLowerCase();
    const rawTargetLower = target.toLowerCase();
    if (rawTargetLower === "all" || rawTargetLower === "all classes") return true;
    return normStudent === normTarget || rawStudentLower === rawTargetLower;
  });
}

export function isAssessmentStudentRole(role) {
  return new Set(["STUDENT", "INDIVIDUAL_STUDENT", "INDIVIDUALSTUDENT", "SCHOLAR", "CADET"]).has(
    String(role || "").trim().toUpperCase()
  );
}

export function isSchoolAdminRole(role) {
  return new Set(["SCHOOL", "SCHOOL_ADMIN", "SCHOOLADMIN"]).has(String(role || "").trim().toUpperCase());
}

export function isTutorRole(role) {
  return new Set(["TUTOR", "STAFF", "INSTRUCTOR", "TEACHER", "FACULTY"]).has(String(role || "").trim().toUpperCase());
}

export function isPlatformAdminRole(role) {
  return new Set([
    "ADMIN",
    "SUPER_ADMIN",
    "SUPERADMIN",
    "CONTENT_ADMIN",
    "EDUCATION_ADMIN",
    "SERVICES_ADMIN",
    "MARKETING_ADMIN",
    "SUPPORT_ADMIN",
  ]).has(String(role || "").trim().toUpperCase());
}

/**
 * School administrators are strictly read-only for examinations (cannot author, edit, publish, grade, or delete).
 */
export function canAuthorOrMutateExam(role) {
  if (isSchoolAdminRole(role)) return false;
  return isTutorRole(role) || isPlatformAdminRole(role);
}

/**
 * Verifies whether a tutor or admin can edit/republish/delete a specific examination record.
 */
export function canManageExamRecord(examOrOpts, callerUid, callerRole, assignedSchoolIds = []) {
  let exam = examOrOpts;
  let uid = callerUid;
  let role = callerRole;
  let schoolIds = assignedSchoolIds;
  if (
    examOrOpts &&
    typeof examOrOpts === "object" &&
    ("uid" in examOrOpts || "exam" in examOrOpts || "role" in examOrOpts) &&
    callerUid === undefined
  ) {
    exam = examOrOpts.exam;
    uid = examOrOpts.uid;
    role = examOrOpts.role;
    schoolIds = examOrOpts.assignedSchoolIds || [];
  }
  if (!exam || !uid) return false;
  if (isSchoolAdminRole(role)) return false;
  if (isPlatformAdminRole(role)) return true;
  if (!isTutorRole(role)) return false;
  const ownerId = String(exam.tutorId || exam.createdBy || "").trim();
  if (ownerId && ownerId === String(uid).trim()) return true;
  if (Array.isArray(schoolIds) && exam.schoolId) {
    return schoolIds.map(s => String(s).trim().toLowerCase()).includes(String(exam.schoolId).trim().toLowerCase());
  }
  return false;
}

/**
 * Determines whether deleting an exam should hard-delete the document (0 attempts)
 * or soft-delete / archive it (when 1 or more attempts exist so history is preserved).
 */
export function resolveExamDeletionMode(attemptCount) {
  const count = Number(attemptCount || 0);
  return count > 0 ? "archive" : "delete";
}

/**
 * Resolves the authoritative partner school name, filtering out platform brand fallbacks
 * such as "Jaystarbliss" or "Jaystarbliss Dynamic Institute Partner School".
 */
export function resolvePartnerSchoolName(...candidates) {
  const INVALID_SCHOOL_LABELS = new Set([
    "jaystarbliss",
    "jaystarbliss studios",
    "jaystarbliss dynamic institute",
    "jaystarbliss dynamic institute partner school",
    "jdi",
    "jdi partner school",
    "partner school",
    "partner school institution",
    "school portal",
    "school",
    "school-default",
    "default",
    "unassigned",
    "n/a",
    "none",
  ]);

  for (const candidate of candidates.flat()) {
    const clean = String(candidate ?? "").trim();
    if (!clean) continue;
    if (!INVALID_SCHOOL_LABELS.has(clean.toLowerCase())) {
      return clean;
    }
  }
  return "";
}

/**
 * Resolves the questions list that applies to an attempt (preferring the immutable
 * questionsSnapshot captured on the attempt if the exam was later edited).
 */
export function resolveAttemptQuestions(exam, attempt) {
  if (Array.isArray(attempt?.questionsSnapshot) && attempt.questionsSnapshot.length > 0) {
    return attempt.questionsSnapshot;
  }
  if (Array.isArray(attempt?.questions) && attempt.questions.length > 0 && attempt.questions[0]?.prompt) {
    return attempt.questions;
  }
  if (Array.isArray(exam?.questions) && exam.questions.length > 0) {
    return exam.questions;
  }
  return [];
}

/**
 * Computes the authoritative maximum score (denominator) for an examination or attempt.
 * Never defaults to 100 when questions or questionResults define the actual marks.
 */
export function computeExamMaxScore(exam, attempt) {
  const questions = resolveAttemptQuestions(exam, attempt);
  if (questions.length > 0) {
    const sum = questions.reduce(
      (acc, q) => acc + Math.max(0, Number(q?.points ?? q?.maxPoints ?? 1) || 0),
      0
    );
    if (sum > 0) return Number(sum.toFixed(2));
  }

  if (Array.isArray(attempt?.questionResults) && attempt.questionResults.length > 0) {
    const sum = attempt.questionResults.reduce(
      (acc, r) => acc + Math.max(0, Number(r?.maxPoints ?? r?.points ?? 0) || 0),
      0
    );
    if (sum > 0) return Number(sum.toFixed(2));
  }

  const explicitAttemptMax = Number(attempt?.maxScore);
  if (Number.isFinite(explicitAttemptMax) && explicitAttemptMax > 0) {
    return explicitAttemptMax;
  }

  const explicitExamMax = Number(exam?.maxScore);
  if (Number.isFinite(explicitExamMax) && explicitExamMax > 0) {
    return explicitExamMax;
  }

  return 0;
}

export function calculateScorePercentage(score, maxScore) {
  const numScore = Number(score);
  const numMax = Number(maxScore);
  if (!Number.isFinite(numScore) || !Number.isFinite(numMax) || numMax <= 0) {
    return 0;
  }
  const pct = (Math.max(0, numScore) / numMax) * 100;
  return Number(pct.toFixed(2));
}

export function calculateGradeLetter(percentage) {
  const pct = Number(percentage) || 0;
  if (pct >= 70) return "A";
  if (pct >= 60) return "B";
  if (pct >= 50) return "C";
  if (pct >= 45) return "D";
  if (pct >= 40) return "E";
  return "F";
}

export function formatScoreSummary(score, maxScore) {
  const validScore = typeof score === "number" && Number.isFinite(score) ? Number(score.toFixed(2)) : null;
  const validMax = typeof maxScore === "number" && Number.isFinite(maxScore) && maxScore > 0 ? Number(maxScore.toFixed(2)) : 0;
  if (validScore === null) {
    return {
      score: null,
      maxScore: validMax,
      percentage: null,
      percentageLabel: "Pending",
      fractionLabel: validMax > 0 ? `Pending / ${validMax}` : "Pending",
      summaryLabel: "Pending",
      display: "Pending",
      grade: "—",
    };
  }
  const percentage = validMax > 0 ? calculateScorePercentage(validScore, validMax) : 0;
  const pctFormatted = Number.isInteger(percentage) ? `${percentage}%` : `${percentage.toFixed(2).replace(/\.?0+$/, "")}%`;
  const fractionLabel = validMax > 0 ? `${validScore} / ${validMax}` : `${validScore}`;
  const summaryLabel = validMax > 0 ? `${fractionLabel} (${pctFormatted})` : `${validScore}`;
  return {
    score: validScore,
    maxScore: validMax,
    percentage,
    percentageLabel: pctFormatted,
    fractionLabel,
    summaryLabel,
    display: summaryLabel,
    grade: validMax > 0 ? calculateGradeLetter(percentage) : "—",
  };
}

export function normalizeQuestions(input, gradingMode = "automatic") {
  if (!Array.isArray(input) || input.length < 1 || input.length > 200) {
    return { error: "Provide between 1 and 200 questions." };
  }
  const ids = new Set();
  const questions = [];
  for (let index = 0; index < input.length; index += 1) {
    const raw = input[index];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "Each question must be an object." };
    const id = String(raw.id || `q${index + 1}`).trim();
    const prompt = String(raw.prompt || "").trim();
    const type = String(raw.type || "single_choice");
    const points = Number(raw.points ?? 1);
    if (!id || id.length > 120 || ids.has(id)) return { error: "Question IDs must be unique and no longer than 120 characters." };
    if (!prompt || prompt.length > 5000 || !TYPES.has(type)) return { error: "Each question needs valid text and a supported question type." };
    if (!Number.isFinite(points) || points <= 0 || points > 1000) return { error: "Question marks must be greater than 0 and at most 1000." };
    ids.add(id);

    const options = Array.isArray(raw.options) ? raw.options : [];
    const cleanOptions = options.map((option, optionIndex) => ({
      id: String(option?.id || optionIndex).trim(),
      text: String(option?.text || "").trim(),
    }));
    if (OBJECTIVE.has(type)) {
      if (
        cleanOptions.length < 2 ||
        cleanOptions.length > 10 ||
        (type === "true_false" && cleanOptions.length !== 2) ||
        cleanOptions.some(option => !option.id || option.id.length > 80 || !option.text || option.text.length > 1000) ||
        new Set(cleanOptions.map(option => option.id)).size !== cleanOptions.length
      ) {
        return { error: "Objective questions need valid, unique options (2–10; exactly 2 for true/false)." };
      }
    }
    const optionIds = new Set(cleanOptions.map(option => option.id));
    const providedCorrect = Array.isArray(raw.correctOptionIds) ? raw.correctOptionIds.map(String) : [];
    const correctOptionIds = [...new Set(providedCorrect)];
    if (OBJECTIVE.has(type)) {
      if (gradingMode !== "manual" && !correctOptionIds.length)
        return { error: "Automatically graded objective questions need at least one correct answer." };
      if (correctOptionIds.some(optionId => !optionIds.has(optionId)))
        return { error: "Correct answers must refer to existing options." };
      if ((type === "single_choice" || type === "true_false" || type === "dropdown") && correctOptionIds.length > 1)
        return { error: "Single-choice questions must have exactly one correct answer." };
    }
    const acceptedAnswers = Array.isArray(raw.acceptedAnswers)
      ? [
          ...new Set(
            raw.acceptedAnswers
              .map(value => String(value).trim())
              .filter(Boolean)
              .map(value => value.slice(0, 500))
          ),
        ].slice(0, 20)
      : [];
    questions.push({
      id,
      type,
      prompt,
      options: OBJECTIVE.has(type) ? cleanOptions : [],
      correctOptionIds: OBJECTIVE.has(type) ? correctOptionIds : [],
      acceptedAnswers: type === "short_answer" ? acceptedAnswers : [],
      points: Number(points.toFixed(2)),
      required: raw.required !== false,
      ...(raw.explanation ? { explanation: String(raw.explanation).trim().slice(0, 2000) } : {}),
    });
  }
  const maxScore = Number(questions.reduce((sum, q) => sum + Number(q.points || 0), 0).toFixed(2));
  return { questions, maxScore };
}

/**
 * Resolves the canonical examination delivery mode ("NATIVE" | "EXTERNAL_LINK").
 * Preserves existing external-link examinations even when they have 0 native questions.
 */
export function normalizeDeliveryMode(input, fallbackExam = null) {
  const examObj =
    input && typeof input === "object" && !Array.isArray(input) ? input : fallbackExam;
  const raw =
    typeof input === "string"
      ? input.trim().toUpperCase()
      : String(examObj?.deliveryMode ?? "").trim().toUpperCase();

  if (raw === "EXTERNAL_LINK" || raw === "EXTERNAL" || raw === "GOOGLE_FORMS" || raw === "GOOGLE_FORM") {
    return "EXTERNAL_LINK";
  }
  if (raw === "NATIVE" || raw === "INTERNAL" || raw === "JDI") {
    return "NATIVE";
  }
  if (examObj && typeof examObj === "object") {
    const fbMode = String(examObj.deliveryMode ?? "").trim().toUpperCase();
    if (fbMode === "EXTERNAL_LINK" || fbMode === "EXTERNAL") return "EXTERNAL_LINK";
    if (fbMode === "NATIVE") return "NATIVE";
    const hasQuestions = Array.isArray(examObj.questions) && examObj.questions.length > 0;
    const hasExternalUrl = Boolean(
      String(examObj.externalUrl || examObj.url || examObj.link || "").trim()
    );
    if (!hasQuestions && hasExternalUrl) return "EXTERNAL_LINK";
  }
  return "NATIVE";
}

/**
 * Validates an external examination / Google Forms URL.
 */
export function validateExternalExamUrl(input) {
  const raw = String(input ?? "").trim();
  if (!raw) {
    return { valid: false, error: "Provide a valid external URL (e.g., Google Forms link)." };
  }
  if (raw.length > 2000) {
    return { valid: false, error: "External examination URL must be at most 2000 characters." };
  }
  try {
    const parsed = new URL(raw);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { valid: false, error: "External examination URL must be a valid http:// or https:// URL." };
    }
    return { valid: true, url: parsed.toString() };
  } catch {
    return { valid: false, error: "Provide a valid external URL starting with http:// or https://." };
  }
}

/**
 * Validates examination creation/update payload for both EXTERNAL_LINK and NATIVE modes.
 * External-link examinations do not require duration, native questions, answer keys, or grading settings.
 */
export function validateExamCreationPayload(body = {}, existingDoc = null) {
  const deliveryMode = normalizeDeliveryMode(body.deliveryMode, body.deliveryMode ? existingDoc : body || existingDoc);
  const title = String(body.title ?? existingDoc?.title ?? "").trim();
  const subject = String(body.subject ?? existingDoc?.subject ?? "").trim();
  const description = String(body.description ?? body.instructions ?? existingDoc?.description ?? existingDoc?.instructions ?? "")
    .trim()
    .slice(0, 5000);
  const rawStatus = String(body.status || "").trim().toLowerCase();
  const status =
    rawStatus === "published"
      ? "active"
      : ["active", "scheduled", "completed", "archived", "draft"].includes(rawStatus)
      ? rawStatus
      : "draft";

  if (!title || title.length > 200) {
    return { error: "Provide an examination title (1–200 characters)." };
  }
  if (!subject || subject.length > 120) {
    return { error: "Provide an examination subject (1–120 characters)." };
  }

  const classIds = normalizeClassList(
    body.classIds || body.targetClass || body.className || existingDoc?.classIds || existingDoc?.targetClass || []
  );

  if (deliveryMode === "EXTERNAL_LINK") {
    const urlCandidate = body.externalUrl ?? body.url ?? existingDoc?.externalUrl ?? existingDoc?.url ?? "";
    const urlCheck = validateExternalExamUrl(urlCandidate);
    if (urlCheck.error) return { error: urlCheck.error };

    const rawDuration = body.durationMinutes !== undefined && body.durationMinutes !== null && body.durationMinutes !== ""
      ? Number(body.durationMinutes)
      : 0;
    const durationMinutes =
      rawDuration !== null && Number.isFinite(rawDuration) && rawDuration >= 1 && rawDuration <= 300
        ? Math.round(rawDuration)
        : 0;

    return {
      deliveryMode: "EXTERNAL_LINK",
      title,
      subject,
      description,
      externalUrl: urlCheck.url,
      classIds,
      questions: [],
      questionCount: 0,
      maxScore: 0,
      durationMinutes,
      gradingMode: "automatic",
      status,
    };
  }

  // NATIVE examination validation
  const durationMinutes = Number(body.durationMinutes ?? existingDoc?.durationMinutes ?? 30);
  if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 300) {
    return { error: "Provide a whole-number duration from 1 to 300 minutes." };
  }

  const rawQuestions = Array.isArray(body.questions) ? body.questions : [];
  const gradingMode = body.gradingMode === "manual" ? "manual" : "automatic";

  // Allow empty questions list only when saving as draft
  if (rawQuestions.length === 0 && status === "draft") {
    return {
      deliveryMode: "NATIVE",
      title,
      subject,
      description,
      externalUrl: String(body.externalUrl ?? existingDoc?.externalUrl ?? "").trim(),
      classIds,
      questions: [],
      questionCount: 0,
      maxScore: 0,
      durationMinutes,
      gradingMode,
      status,
    };
  }

  if (rawQuestions.length === 0) {
    return { error: "At least 1 valid question is required before publishing a native examination." };
  }

  const normalized = normalizeQuestions(rawQuestions, gradingMode);
  if (normalized.error) return { error: normalized.error };

  return {
    deliveryMode: "NATIVE",
    title,
    subject,
    description,
    externalUrl: String(body.externalUrl ?? existingDoc?.externalUrl ?? "").trim(),
    classIds,
    questions: normalized.questions,
    questionCount: normalized.questions.length,
    maxScore: normalized.maxScore,
    durationMinutes,
    gradingMode,
    status,
  };
}

export function gradeAnswers(exam, answers = {}) {
  let score = 0;
  let maxScore = 0;
  let autoGraded = exam?.gradingMode !== "manual";
  const questionResults = [];
  const questions = Array.isArray(exam?.questions) ? exam.questions : [];
  for (const question of questions) {
    const answer = answers?.[question.id];
    let correct = false;
    let manualReview = false;
    let pointsAwarded = 0;
    if (exam?.gradingMode === "manual") {
      autoGraded = false;
      manualReview = true;
    } else if (OBJECTIVE.has(String(question.type))) {
      const expected = [...new Set((Array.isArray(question.correctOptionIds) ? question.correctOptionIds : []).map(String))].sort();
      const actual = [...new Set((Array.isArray(answer) ? answer : [String(answer ?? "")]).map(String).filter(Boolean))].sort();
      if (!expected.length) {
        autoGraded = false;
        manualReview = true;
      } else {
        correct = expected.length === actual.length && expected.every((value, index) => value === actual[index]);
      }
    } else if (question.type === "short_answer" && Array.isArray(question.acceptedAnswers) && question.acceptedAnswers.length) {
      const normalize = value => String(value ?? "").trim().toLocaleLowerCase();
      correct = question.acceptedAnswers.some(value => normalize(value) === normalize(answer));
    } else {
      autoGraded = false;
      manualReview = true;
    }
    const maxPoints = Math.max(0, Math.min(1000, Number(question.points ?? 1) || 0));
    maxScore += maxPoints;
    if (correct) pointsAwarded = maxPoints;
    score += pointsAwarded;
    questionResults.push({
      questionId: question.id,
      ...(answer === undefined ? {} : { answer }),
      ...(manualReview ? {} : { correct }),
      manualReview,
      pointsAwarded,
      maxPoints,
    });
  }
  const finalScore = Number(score.toFixed(2));
  const finalMaxScore = Number(maxScore.toFixed(2));
  const percentage = calculateScorePercentage(finalScore, finalMaxScore);
  return { score: finalScore, maxScore: finalMaxScore, percentage, autoGraded, questionResults };
}

/** Safe projections for school-level reporting; never include answer keys or submitted response text. */
export function schoolSafeQuestion(question) {
  return {
    id: String(question?.id || ""),
    prompt: String(question?.prompt || ""),
    type: String(question?.type || ""),
    points: Math.max(0, Math.min(1000, Number(question?.points ?? 1) || 0)),
    options: Array.isArray(question?.options)
      ? question.options.map(option => ({
          id: String(option?.id || ""),
          text: String(option?.text || ""),
        }))
      : [],
  };
}

export function schoolSafeQuestionResult(result) {
  return {
    questionId: String(result?.questionId || ""),
    ...(typeof result?.correct === "boolean" ? { correct: result.correct } : {}),
    manualReview: result?.manualReview === true,
    pointsAwarded: Math.max(0, Number(result?.pointsAwarded) || 0),
    maxPoints: Math.max(0, Number(result?.maxPoints) || 0),
  };
}

/** Parent result lookup must bind the record ID to the child's verified portal UID. */
export function attemptBelongsToLinkedChild(attempt, child) {
  return Boolean(
    child?.id &&
      child?.studentUid &&
      attempt?.studentId &&
      attempt?.studentUid &&
      String(attempt.studentId) === String(child.id) &&
      String(attempt.studentUid) === String(child.studentUid)
  );
}

/** Finalize only answers that were persisted before the deadline. */
export function answersForFinalization(currentAnswers = {}, requestedAnswers, deadlinePassed = false) {
  return deadlinePassed ? currentAnswers || {} : requestedAnswers || currentAnswers || {};
}

