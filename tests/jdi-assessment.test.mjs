import test from "node:test";
import assert from "node:assert/strict";
import {
  CANONICAL_CLASSES,
  normalizeClassName,
  isCanonicalClass,
  normalizeClassList,
  expandGradeRange,
  classesMatch,
  canAuthorOrMutateExam,
  canManageExamRecord,
  resolveExamDeletionMode,
  resolvePartnerSchoolName,
  resolveAttemptQuestions,
  computeExamMaxScore,
  calculateScorePercentage,
  formatScoreSummary,
  normalizeQuestions,
  gradeAnswers,
  recalculateAttemptForUpdatedExam,
  schoolSafeQuestion,
  schoolSafeQuestionResult,
  attemptBelongsToLinkedChild,
  isAssessmentStudentRole,
  answersForFinalization,
  normalizeDeliveryMode,
  validateExternalExamUrl,
  validateExamCreationPayload,
  WORK_TYPES,
  normalizeWorkType,
  validateWorkTypeTransition,
  normalizeRecipientTargets,
  isStudentEligibleForWork,
  parseBulkStudentText,
  validateBulkStudentRows,
  buildAttendanceRecordKey,
  createAgreementVersionSnapshot,
  canAccessAgreement,
  isAttemptResultReleased,
  canViewOrPrintAttemptResult,
  getWorkTypeLabels,
  isAttemptOverdueForExpiry,
  isExamPastEffectiveDeadline,
  resolveCanonicalExamStatus,
  mergeExamRecordByPrecedence,
  buildDefaultAssessmentLayout,
  normalizeAssessmentLayout,
  resolveAssessmentLayout,
  shuffleArrayWithRng,
  generateAttemptOrdering,
  buildQuestionContextMap,
  canPauseAssessmentWorkType,
} from "../api/_lib/jdi-assessment.js";

const objective = (overrides = {}) => ({
  id: "q1",
  type: "single_choice",
  prompt: "Pick one",
  points: 2,
  options: [
    { id: "a", text: "A" },
    { id: "b", text: "B" },
  ],
  correctOptionIds: ["a"],
  ...overrides,
});

test("normalizes question IDs and deduplicates answer keys before persistence", () => {
  const result = normalizeQuestions([objective({ correctOptionIds: ["a", "a"] })]);
  assert.equal(result.error, undefined);
  assert.deepEqual(result.questions[0].correctOptionIds, ["a"]);
  assert.equal(result.maxScore, 2);
});

test("rejects duplicate question IDs and unknown correct-option IDs", () => {
  assert.match(normalizeQuestions([objective(), objective()]).error, /unique/);
  assert.match(
    normalizeQuestions([objective({ correctOptionIds: ["missing"] })]).error,
    /existing options/
  );
});

test("requires a marking key for automatic objective grading but permits manual marking", () => {
  assert.match(normalizeQuestions([objective({ correctOptionIds: [] })]).error, /correct answer/);
  assert.equal(
    normalizeQuestions([objective({ correctOptionIds: [] })], "manual").error,
    undefined
  );
});

test("enforces objective option limits, true/false shape, and bounded points", () => {
  assert.match(
    normalizeQuestions([objective({ options: [{ id: "a", text: "A" }] })]).error,
    /options/
  );
  assert.match(
    normalizeQuestions([
      objective({
        type: "true_false",
        options: [
          { id: "a", text: "A" },
          { id: "b", text: "B" },
          { id: "c", text: "C" },
        ],
      }),
    ]).error,
    /exactly 2/
  );
  assert.match(normalizeQuestions([objective({ points: 1001 })]).error, /marks/);
});

test("grades exact objective answers and never awards credit for partial multiple choice", () => {
  const exam = {
    gradingMode: "automatic",
    questions: [
      objective(),
      objective({ id: "q2", type: "multiple_choice", correctOptionIds: ["a", "b"], points: 3 }),
    ],
  };
  assert.equal(gradeAnswers(exam, { q1: "a", q2: ["a"] }).score, 2);
  assert.equal(gradeAnswers(exam, { q1: "a", q2: ["b", "a"] }).score, 5);
});

test("computes exact denominator and percentage for 1 out of 3 without defaulting to 100", () => {
  const exam = {
    gradingMode: "automatic",
    questions: [
      objective({ id: "q1", points: 1, correctOptionIds: ["a"] }),
      objective({ id: "q2", points: 1, correctOptionIds: ["b"] }),
      objective({ id: "q3", points: 1, correctOptionIds: ["a"] }),
    ],
  };
  const graded = gradeAnswers(exam, { q1: "a", q2: "a", q3: "b" });
  assert.equal(graded.score, 1);
  assert.equal(graded.maxScore, 3);
  assert.equal(graded.percentage, 33.33);
  assert.equal(computeExamMaxScore(exam), 3);

  const summary = formatScoreSummary(1, 3);
  assert.equal(summary.score, 1);
  assert.equal(summary.maxScore, 3);
  assert.equal(summary.percentage, 33.33);
  assert.equal(summary.display, "1 / 3 (33.33%)");
  assert.equal(calculateScorePercentage(2, 3), 66.67);
});

test("grades short answers case-insensitively and sends essays to manual review", () => {
  const exam = {
    questions: [
      { id: "short", type: "short_answer", points: 1, acceptedAnswers: ["Ohm"] },
      { id: "essay", type: "essay", points: 4 },
    ],
  };
  const result = gradeAnswers(exam, { short: "  OHM ", essay: "written response" });
  assert.equal(result.score, 1);
  assert.equal(result.maxScore, 5);
  assert.equal(result.autoGraded, false);
  assert.equal(result.questionResults[1].manualReview, true);
});

test("manual grading never auto-awards marks", () => {
  const result = gradeAnswers({ gradingMode: "manual", questions: [objective()] }, { q1: "a" });
  assert.equal(result.score, 0);
  assert.equal(result.autoGraded, false);
  assert.equal(result.questionResults[0].manualReview, true);
});

test("school report projections omit answer keys, explanations, and submitted answer text", () => {
  const question = schoolSafeQuestion({
    id: "q",
    prompt: "Question",
    type: "single_choice",
    points: 2,
    options: [{ id: "a", text: "A" }],
    correctOptionIds: ["a"],
    acceptedAnswers: ["secret"],
    explanation: "teacher-only",
  });
  assert.deepEqual(Object.keys(question).sort(), ["id", "options", "points", "prompt", "type"]);
  assert.equal("correctOptionIds" in question, false);
  assert.equal("acceptedAnswers" in question, false);
  const result = schoolSafeQuestionResult({
    questionId: "q",
    answer: "private response",
    correct: true,
    manualReview: false,
    pointsAwarded: 2,
    maxPoints: 2,
  });
  assert.equal(result.correct, true);
  assert.equal("answer" in result, false);
});

test("parent result lookup requires both matching learner record ID and learner UID", () => {
  const child = { id: "child-a", studentUid: "student-uid-a" };
  assert.equal(
    attemptBelongsToLinkedChild({ studentId: "child-a", studentUid: "student-uid-a" }, child),
    true
  );
  assert.equal(
    attemptBelongsToLinkedChild({ studentId: "child-a", studentUid: "student-uid-b" }, child),
    false
  );
  assert.equal(
    attemptBelongsToLinkedChild({ studentId: "child-b", studentUid: "student-uid-a" }, child),
    false
  );
  assert.equal(attemptBelongsToLinkedChild({ studentId: "child-a" }, child), false);
});

test("assessment access accepts school and individual learner role aliases", () => {
  assert.equal(isAssessmentStudentRole("STUDENT"), true);
  assert.equal(isAssessmentStudentRole("student"), true);
  assert.equal(isAssessmentStudentRole("INDIVIDUAL_STUDENT"), true);
  assert.equal(isAssessmentStudentRole("individualstudent"), true);
  assert.equal(isAssessmentStudentRole("PARENT"), false);
  assert.equal(isAssessmentStudentRole("TUTOR"), false);
});

test("expired attempt finalization uses persisted answers, not late client payload", () => {
  const saved = { q1: "a" };
  assert.deepEqual(answersForFinalization(saved, { q1: "b" }, true), saved);
  assert.deepEqual(answersForFinalization(saved, { q1: "b" }, false), { q1: "b" });
  assert.deepEqual(answersForFinalization(saved, undefined, false), saved);
});

test("canonical class standardisation maps legacy Nigerian/British classes to Early Years, Grade 1..12, University (Undergraduate), and Graduate (BSc, HND, ND, etc.)", () => {
  assert.equal(CANONICAL_CLASSES.length, 15);
  assert.equal(CANONICAL_CLASSES[0], "Early Years");
  assert.equal(CANONICAL_CLASSES[12], "Grade 12");
  assert.equal(CANONICAL_CLASSES[13], "University (Undergraduate)");
  assert.equal(CANONICAL_CLASSES[14], "Graduate (BSc, HND, ND, etc.)");

  assert.equal(normalizeClassName("Nursery 2"), "Early Years");
  assert.equal(normalizeClassName("KG 1"), "Early Years");
  assert.equal(normalizeClassName("Reception"), "Early Years");
  assert.equal(normalizeClassName("Primary 1"), "Grade 1");
  assert.equal(normalizeClassName("Basic 5"), "Grade 5");
  assert.equal(normalizeClassName("Year 6"), "Grade 6");
  assert.equal(normalizeClassName("JSS 1"), "Grade 7");
  assert.equal(normalizeClassName("JSS 2"), "Grade 8");
  assert.equal(normalizeClassName("JSS 3"), "Grade 9");
  assert.equal(normalizeClassName("SS 1"), "Grade 10");
  assert.equal(normalizeClassName("SSS 2"), "Grade 11");
  assert.equal(normalizeClassName("SS 3"), "Grade 12");
  assert.equal(normalizeClassName("Undergraduate / University Student"), "University (Undergraduate)");
  assert.equal(normalizeClassName("University(Under graduate)"), "University (Undergraduate)");
  assert.equal(normalizeClassName("Graduate (Bsc, HND, ND etc)"), "Graduate (BSc, HND, ND, etc.)");
  assert.equal(normalizeClassName("Adult / Professional Tech Learner"), "Graduate (BSc, HND, ND, etc.)");
  assert.equal(normalizeClassName("Grade 5, Grade 5"), "Grade 5");
  assert.equal(isCanonicalClass("Grade 5"), true);
  assert.equal(isCanonicalClass("University (Undergraduate)"), true);
  assert.equal(isCanonicalClass("Graduate (BSc, HND, ND, etc.)"), true);

  assert.deepEqual(normalizeClassList(["Primary 4", "JSS 1", "Grade 4", "Year 4"]), ["Grade 4", "Grade 7"]);
  assert.equal(classesMatch("Primary 5", ["Grade 5"]), true);
  assert.equal(classesMatch("Grade 8", ["JSS 2"]), true);
  assert.equal(classesMatch("Grade 4", ["Grade 5"]), false);
  assert.equal(classesMatch("Grade 4", ["all"]), true);
});

test("partner school name resolution filters out Jaystarbliss system placeholders", () => {
  assert.equal(
    resolvePartnerSchoolName(
      "Jaystarbliss",
      "Jaystarbliss Dynamic Institute Partner School",
      "Greenfield Royal Academy"
    ),
    "Greenfield Royal Academy"
  );
  assert.equal(
    resolvePartnerSchoolName("Jaystarbliss Dynamic Institute", "JDI", "Crown Heights School"),
    "Crown Heights School"
  );
});

test("exam lifecycle permissions, tutor ownership, and safe delete vs archive rules", () => {
  assert.equal(canAuthorOrMutateExam("TUTOR"), true);
  assert.equal(canAuthorOrMutateExam("STAFF"), true);
  assert.equal(canAuthorOrMutateExam("ADMIN"), true);
  assert.equal(canAuthorOrMutateExam("SCHOOL"), false);
  assert.equal(canAuthorOrMutateExam("SCHOOL_ADMIN"), false);
  assert.equal(canAuthorOrMutateExam("STUDENT"), false);

  const exam = { id: "exam-1", createdBy: "tutor-1", schoolId: "sch-a" };
  assert.equal(
    canManageExamRecord({
      uid: "tutor-1",
      role: "TUTOR",
      exam,
      assignedSchoolIds: ["sch-a"],
    }),
    true
  );
  // Unrelated tutor at a different school cannot manage
  assert.equal(
    canManageExamRecord({
      uid: "tutor-2",
      role: "TUTOR",
      exam,
      assignedSchoolIds: ["sch-b"],
    }),
    false
  );
  // Unrelated tutor at the SAME school cannot manage another tutor's assessment
  assert.equal(
    canManageExamRecord({
      uid: "tutor-2",
      role: "TUTOR",
      exam,
      assignedSchoolIds: ["sch-a"],
    }),
    false
  );
  // Explicitly permitted collaborator tutor can manage
  assert.equal(
    canManageExamRecord({
      uid: "tutor-2",
      role: "TUTOR",
      exam: { ...exam, authorizedTutorIds: ["tutor-2"] },
      assignedSchoolIds: ["sch-a"],
    }),
    true
  );
  // Platform Administrator can manage assessments created by any tutor
  assert.equal(
    canManageExamRecord({
      uid: "admin-1",
      role: "ADMIN",
      exam,
      assignedSchoolIds: [],
    }),
    true
  );
  assert.equal(
    canManageExamRecord({
      uid: "school-admin-1",
      role: "SCHOOL",
      exam,
      assignedSchoolIds: ["sch-a"],
    }),
    false
  );

  // Manual reopen supersedes past availableUntil / dueDate without erasing original deadline fields
  const pastExam = {
    id: "exam-past",
    status: "active",
    availableUntil: "2026-01-10T12:00:00.000Z",
    dueDate: "2026-01-10",
  };
  const checkNowMs = new Date("2026-02-01T10:00:00.000Z").getTime();
  assert.equal(isExamPastEffectiveDeadline(pastExam, checkNowMs), true);

  const reopenedPastExam = {
    ...pastExam,
    manuallyReopenedAt: "2026-01-25T09:00:00.000Z",
  };
  assert.equal(isExamPastEffectiveDeadline(reopenedPastExam, checkNowMs), false);
  assert.equal(reopenedPastExam.availableUntil, "2026-01-10T12:00:00.000Z");
  assert.equal(reopenedPastExam.dueDate, "2026-01-10");

  assert.equal(resolveExamDeletionMode(0), "delete");
  assert.equal(resolveExamDeletionMode(3), "archive");

  const snapQuestions = [{ id: "q1", prompt: "Snapshot Q", points: 1 }];
  const liveQuestions = [
    { id: "q1", prompt: "Updated Q1", points: 2 },
    { id: "q2", prompt: "Updated Q2", points: 2 },
  ];
  assert.deepEqual(
    resolveAttemptQuestions(
      { questions: liveQuestions },
      { questionsSnapshot: snapQuestions }
    ),
    snapQuestions
  );
});

test("resolves examination delivery mode and preserves existing external-link exams with zero native questions", () => {
  assert.equal(normalizeDeliveryMode("EXTERNAL_LINK"), "EXTERNAL_LINK");
  assert.equal(normalizeDeliveryMode("external"), "EXTERNAL_LINK");
  assert.equal(normalizeDeliveryMode("google_forms"), "EXTERNAL_LINK");
  assert.equal(normalizeDeliveryMode("NATIVE"), "NATIVE");
  assert.equal(
    normalizeDeliveryMode({
      externalUrl: "https://docs.google.com/forms/d/e/1FAIpQLSc/viewform",
      questions: [],
    }),
    "EXTERNAL_LINK"
  );
  assert.equal(
    normalizeDeliveryMode({
      deliveryMode: "NATIVE",
      questions: [objective()],
    }),
    "NATIVE"
  );
});

test("validates external examination URLs and allows External Link exam creation without duration or native questions", () => {
  assert.equal(
    validateExternalExamUrl("https://docs.google.com/forms/d/e/1FAIpQLSe/viewform").valid,
    true
  );
  assert.equal(validateExternalExamUrl("ftp://invalid.example.com").valid, false);
  assert.equal(validateExternalExamUrl("").valid, false);

  const validExternal = validateExamCreationPayload({
    deliveryMode: "EXTERNAL_LINK",
    title: "Mid-Term Robotics Assessment",
    description: "Complete the external Google Form carefully.",
    subject: "Robotics & Coding",
    externalUrl: "https://docs.google.com/forms/d/e/1FAIpQLSe/viewform",
    passcode: "JDI-2026",
    schoolId: "sch-1",
    classIds: ["Grade 8"],
    status: "published",
  });
  assert.equal(validExternal.error, undefined);
  assert.equal(validExternal.deliveryMode, "EXTERNAL_LINK");
  assert.equal(validExternal.durationMinutes, 0);
  assert.equal(validExternal.hasTimeLimit, false);
  assert.equal(validExternal.maxScore, 0);
  assert.deepEqual(validExternal.questions, []);
  assert.deepEqual(validExternal.classIds, ["Grade 8"]);

  const missingUrlExternal = validateExamCreationPayload({
    deliveryMode: "EXTERNAL_LINK",
    title: "Mid-Term Robotics Assessment",
    subject: "Robotics & Coding",
    externalUrl: "",
    passcode: "JDI-2026",
    schoolId: "sch-1",
    classIds: ["Grade 8"],
    status: "published",
  });
  assert.match(missingUrlExternal.error, /valid external URL/i);
});

test("validates Native examination creation: allows empty drafts, requires questions when publishing, and supports dropdown questions", () => {
  const emptyNativeDraft = validateExamCreationPayload({
    deliveryMode: "NATIVE",
    title: "Draft Python Assessment",
    subject: "Python Programming",
    passcode: "JDI-PY01",
    schoolId: "sch-1",
    classIds: ["Grade 10"],
    durationMinutes: 45,
    questions: [],
    status: "draft",
  });
  assert.equal(emptyNativeDraft.error, undefined);
  assert.equal(emptyNativeDraft.deliveryMode, "NATIVE");
  assert.deepEqual(emptyNativeDraft.questions, []);

  const emptyNativePublished = validateExamCreationPayload({
    deliveryMode: "NATIVE",
    title: "Published Python Assessment",
    subject: "Python Programming",
    passcode: "JDI-PY01",
    schoolId: "sch-1",
    classIds: ["Grade 10"],
    durationMinutes: 45,
    questions: [],
    status: "published",
  });
  assert.match(emptyNativePublished.error, /At least 1 valid question/i);

  const dropdownNativePublished = validateExamCreationPayload({
    deliveryMode: "NATIVE",
    title: "Published Dropdown Assessment",
    subject: "Web Development",
    passcode: "JDI-WEB1",
    schoolId: "sch-1",
    classIds: ["Grade 9"],
    durationMinutes: 30,
    questions: [
      objective({
        id: "q_drop",
        type: "dropdown",
        options: [
          { id: "A", text: "HTML" },
          { id: "B", text: "CSS" },
        ],
        correctOptionIds: ["A"],
      }),
    ],
    status: "published",
  });
  assert.equal(dropdownNativePublished.error, undefined);
  assert.equal(dropdownNativePublished.questions.length, 1);
  assert.equal(dropdownNativePublished.maxScore, 2);
});

test("normalizes unified work types and blocks unsafe workType transitions when attempts exist", () => {
  assert.deepEqual(WORK_TYPES, ["ASSIGNMENT", "ACTIVITY", "TEST", "EXAMINATION"]);
  assert.equal(normalizeWorkType("assignment"), "ASSIGNMENT");
  assert.equal(normalizeWorkType("practice"), "ACTIVITY");
  assert.equal(normalizeWorkType("quiz"), "TEST");
  assert.equal(normalizeWorkType("cbt"), "EXAMINATION");
  assert.equal(normalizeWorkType(undefined), "EXAMINATION");

  assert.equal(
    validateWorkTypeTransition({ currentType: "EXAMINATION", nextType: "TEST", attemptCount: 0 }).allowed,
    true
  );
  const blockedTransition = validateWorkTypeTransition({
    currentType: "EXAMINATION",
    nextType: "ACTIVITY",
    attemptCount: 2,
  });
  assert.equal(blockedTransition.allowed, false);
  assert.match(blockedTransition.reason, /already has 2 recorded student submission/i);
});

test("normalizes recipient targeting and enforces school/class vs private learner eligibility", () => {
  const schoolTarget = normalizeRecipientTargets({
    recipientMode: "SCHOOL_CLASS",
    schoolId: "sch-safari",
    classIds: ["Primary 5", "Grade 6"],
  });
  assert.equal(schoolTarget.recipientMode, "SCHOOL_CLASS");
  assert.deepEqual(schoolTarget.schoolIds, ["sch-safari"]);
  assert.deepEqual(schoolTarget.classIds, ["Grade 5", "Grade 6"]);

  assert.equal(
    isStudentEligibleForWork({
      work: schoolTarget,
      studentId: "stu-1",
      studentSchoolId: "sch-safari",
      studentClass: "Grade 5",
    }),
    true
  );
  assert.equal(
    isStudentEligibleForWork({
      work: schoolTarget,
      studentId: "stu-2",
      studentSchoolId: "sch-other",
      studentClass: "Grade 5",
    }),
    false
  );

  const privateTarget = normalizeRecipientTargets({
    recipientMode: "PRIVATE_LEARNERS",
    targetStudentIds: ["priv-1", "priv-2"],
  });
  assert.equal(
    isStudentEligibleForWork({
      work: privateTarget,
      studentId: "priv-1",
      studentSchoolId: "",
      studentClass: "Grade 8",
    }),
    true
  );
  assert.equal(
    isStudentEligibleForWork({
      work: privateTarget,
      studentId: "priv-3",
      studentSchoolId: "",
      studentClass: "Grade 8",
    }),
    false
  );
});

test("parses and validates bulk student onboarding records from pipe and CSV text", () => {
  const rawText = [
    "Full Name | Class | Programme",
    "Ada Johnson | Grade 5 | Digital Literacy",
    "Samuel Bello | JSS 1 | Robotics & Coding",
    "Ada Johnson | Basic 5 | Digital Literacy",
    "Invalid Row OnlyName",
  ].join("\n");

  const parsed = parseBulkStudentText(rawText);
  assert.equal(parsed.length, 4);

  const validated = validateBulkStudentRows(parsed, [{ fullName: "Existing Learner", className: "Grade 5" }]);
  assert.equal(validated.validCount, 2);
  assert.equal(validated.invalidCount, 2);
  assert.equal(validated.rows[0].className, "Grade 5");
  assert.equal(validated.rows[1].className, "Grade 7");
  assert.equal(validated.rows[2].valid, false); // Duplicate of Ada Johnson in Grade 5
});

test("builds session-aware attendance record keys so multiple classes on the same day do not collide", () => {
  const morningKey = buildAttendanceRecordKey({
    studentId: "stu-10",
    date: "2026-10-27T09:00:00.000Z",
    scheduleId: "sched-morning",
  });
  const afternoonKey = buildAttendanceRecordKey({
    studentId: "stu-10",
    date: "2026-10-27T14:00:00.000Z",
    scheduleId: "sched-afternoon",
  });
  const legacyKey = buildAttendanceRecordKey({
    studentId: "stu-10",
    date: "2026-10-27",
  });

  assert.notEqual(morningKey, afternoonKey);
  assert.equal(morningKey, "sched-morning__stu-10__2026-10-27");
  assert.equal(legacyKey, "legacy__stu-10__2026-10-27");
});

test("creates immutable agreement version snapshots and enforces strict recipient access boundaries", () => {
  const snap1 = createAgreementVersionSnapshot({
    versionNumber: 1,
    title: "2026 School Partnership Contract",
    category: "CONTRACT",
    status: "SHARED",
    content: "Terms and conditions v1",
    effectiveDate: "2026-09-01",
    expiryDate: "2027-07-31",
    createdBy: "admin-1",
    createdAt: "2026-08-15T10:00:00.000Z",
  });

  assert.equal(snap1.immutable, true);
  assert.equal(snap1.versionNumber, 1);
  assert.equal(snap1.category, "CONTRACT");

  const agreement = {
    id: "agr-1",
    status: "SHARED",
    recipientType: "SCHOOL",
    schoolId: "sch-safari",
  };

  // Draft agreements are hidden from recipients
  assert.equal(
    canAccessAgreement({
      agreement: { ...agreement, status: "DRAFT" },
      uid: "school-user-1",
      role: "SCHOOL",
      schoolId: "sch-safari",
    }),
    false
  );

  // Authorised school can access shared agreement
  assert.equal(
    canAccessAgreement({
      agreement,
      uid: "school-user-1",
      role: "SCHOOL",
      schoolId: "sch-safari",
    }),
    true
  );

  // Unrelated school cannot access agreement
  assert.equal(
    canAccessAgreement({
      agreement,
      uid: "other-school-user",
      role: "SCHOOL",
      schoolId: "sch-other",
    }),
    false
  );
});

test("isStudentEligibleForWork handles both (student, exam) and (exam, student) argument orders, school aliases, and excludes drafts", () => {
  const publishedTest = {
    id: "test-grade-5",
    title: "Grade 5 Coding Test",
    workType: "TEST",
    deliveryMode: "NATIVE",
    status: "active",
    schoolId: "sch-doc-id-123",
    schoolName: "Safari Explorer Montessori School",
    targetClass: "Grade 5",
    classIds: ["Grade 5"],
    questions: [{ id: "q1", prompt: "What is HTML?", points: 2 }],
  };

  const studentWithAlias = {
    id: "stu-101",
    uid: "uid-101",
    schoolId: "SAFARI-CODE-01",
    schoolAliases: ["SAFARI-CODE-01", "sch-doc-id-123"],
    schoolName: "Safari Explorer Montessori School",
    class: "Basic 5",
  };

  // Standard (student, workItem) call order
  assert.equal(isStudentEligibleForWork(studentWithAlias, publishedTest), true);

  // Reversed (workItem, student) call order
  assert.equal(isStudentEligibleForWork(publishedTest, studentWithAlias), true);

  // Student in different class should not see Grade 5 test
  assert.equal(
    isStudentEligibleForWork({ ...studentWithAlias, class: "Grade 8" }, publishedTest),
    false
  );

  // Draft and archived exams must never be visible to students
  assert.equal(
    isStudentEligibleForWork(studentWithAlias, { ...publishedTest, status: "draft" }),
    false
  );
  assert.equal(
    isStudentEligibleForWork(studentWithAlias, { ...publishedTest, status: "archived" }),
    false
  );
});

test("enforces tutor-controlled result release before students, parents, or school admins can view or print results, while auto-releasing immediate automatic grading", () => {
  const inProgressAttempt = {
    id: "att-1",
    status: "in_progress",
    score: 8,
    maxScore: 10,
  };
  const submittedUnreleasedAttempt = {
    id: "att-2",
    status: "submitted",
    autoGraded: true,
    score: 9,
    maxScore: 10,
    releasedAt: null,
    resultReleased: false,
  };
  const releasedViaTimestampAttempt = {
    id: "att-3",
    status: "submitted",
    autoGraded: true,
    score: 9,
    maxScore: 10,
    releasedAt: "2026-10-27T12:00:00.000Z",
  };
  const releasedViaBooleanAttempt = {
    id: "att-4",
    status: "graded",
    score: 10,
    maxScore: 10,
    resultReleased: true,
  };

  assert.equal(isAttemptResultReleased(null), false);
  assert.equal(isAttemptResultReleased(inProgressAttempt), false);
  assert.equal(isAttemptResultReleased(submittedUnreleasedAttempt), false);
  assert.equal(isAttemptResultReleased(releasedViaTimestampAttempt), true);
  assert.equal(isAttemptResultReleased(releasedViaBooleanAttempt), true);

  // Part 1: When exam is configured for automatic grading + immediate release, auto-graded submitted attempts are immediately released
  const autoGradeImmediateExam = {
    gradingMode: "automatic",
    releaseGradesPolicy: "immediate",
  };
  assert.equal(isAttemptResultReleased(submittedUnreleasedAttempt, autoGradeImmediateExam), true);
  assert.equal(
    canViewOrPrintAttemptResult(submittedUnreleasedAttempt, "STUDENT", autoGradeImmediateExam),
    true
  );

  // In-progress attempts cannot be printed even by tutors/admins
  assert.equal(canViewOrPrintAttemptResult(inProgressAttempt, "TUTOR"), false);
  assert.equal(canViewOrPrintAttemptResult(inProgressAttempt, "ADMIN"), false);
  assert.equal(canViewOrPrintAttemptResult(inProgressAttempt, "STUDENT"), false);
  assert.equal(canViewOrPrintAttemptResult(inProgressAttempt, "SCHOOL"), false);

  // Submitted but UNRELEASED attempts (without automatic immediate exam config):
  // Students, Individual Students, School Admins, and Parents are strictly blocked from viewing/printing scores
  for (const restrictedRole of ["STUDENT", "INDIVIDUAL_STUDENT", "SCHOOL", "SCHOOL_ADMIN", "PARENT"]) {
    assert.equal(
      canViewOrPrintAttemptResult(submittedUnreleasedAttempt, restrictedRole),
      false,
      `Role ${restrictedRole} must not print/view unreleased attempt results`
    );
  }

  // Tutors and Platform Admins can review submitted attempts in the grading/release workflow
  for (const staffRole of ["TUTOR", "STAFF", "INSTRUCTOR", "ADMIN", "SUPER_ADMIN"]) {
    assert.equal(
      canViewOrPrintAttemptResult(submittedUnreleasedAttempt, staffRole),
      true,
      `Role ${staffRole} can inspect submitted attempt during grading`
    );
  }

  // Once tutor releases the result, Students, School Admins, and Parents can view and print
  for (const role of ["STUDENT", "INDIVIDUAL_STUDENT", "SCHOOL", "SCHOOL_ADMIN", "PARENT", "TUTOR", "ADMIN"]) {
    assert.equal(canViewOrPrintAttemptResult(releasedViaTimestampAttempt, role), true);
    assert.equal(canViewOrPrintAttemptResult(releasedViaBooleanAttempt, role), true);
  }
});

test("enforces optional time limits, mandatory passcodes for tests/examinations, scheduled activation, and learningResources", () => {
  // Part 2: Untimed assessment should have hasTimeLimit: false and durationMinutes: null
  const untimedAssignment = validateExamCreationPayload({
    deliveryMode: "NATIVE",
    workType: "ASSIGNMENT",
    title: "Untimed Python Assignment",
    subject: "Python",
    hasTimeLimit: false,
    durationMinutes: null,
    hasPasscode: false,
    passcode: "",
    schoolId: "sch-1",
    classIds: ["Grade 6"],
    questions: [objective()],
    status: "active",
  });
  assert.equal(untimedAssignment.error, undefined);
  assert.equal(untimedAssignment.hasTimeLimit, false);
  assert.equal(untimedAssignment.durationMinutes, null);
  assert.equal(untimedAssignment.hasPasscode, false);

  // Part 3: TEST and EXAMINATION must require a passcode when publishing
  const testWithoutPasscode = validateExamCreationPayload({
    deliveryMode: "NATIVE",
    workType: "TEST",
    title: "Mid-Term Test Without Passcode",
    subject: "Robotics",
    hasPasscode: false,
    passcode: "",
    schoolId: "sch-1",
    classIds: ["Grade 6"],
    questions: [objective()],
    status: "active",
  });
  assert.match(testWithoutPasscode.error, /passcode is required/i);

  // Part 4 & 7: Scheduled examination with future availableFrom and structured learningResources
  const futureIso = new Date(Date.now() + 86400_000).toISOString();
  const scheduledExam = validateExamCreationPayload({
    deliveryMode: "NATIVE",
    workType: "EXAMINATION",
    title: "Scheduled Final Exam",
    subject: "Computer Science",
    passcode: "EXAM-2026",
    hasTimeLimit: true,
    durationMinutes: 60,
    activationMode: "SCHEDULE_LATER",
    availableFrom: futureIso,
    schoolId: "sch-1",
    classIds: ["Grade 10"],
    deliverables: "Answer all 20 questions carefully.",
    learningResources: [
      {
        title: "Introduction to Computer Networks",
        instructions: "Watch carefully before starting.",
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      },
    ],
    questions: [objective()],
    status: "scheduled",
  });
  assert.equal(scheduledExam.error, undefined);
  assert.equal(scheduledExam.status, "scheduled");
  assert.equal(scheduledExam.hasPasscode, true);
  assert.equal(scheduledExam.hasTimeLimit, true);
  assert.equal(scheduledExam.durationMinutes, 60);
  assert.equal(scheduledExam.learningResources.length, 1);
  assert.equal(scheduledExam.learningResources[0].title, "Introduction to Computer Networks");
});

test("preserves exact workType labels (Test, Activity, Assignment, Examination) throughout student and tutor workflows", () => {
  const testLabels = getWorkTypeLabels("TEST");
  assert.equal(testLabels.code, "TEST");
  assert.equal(testLabels.singular, "Test");
  assert.equal(testLabels.plural, "Tests");
  assert.equal(testLabels.submitCta, "Submit Test");
  assert.equal(testLabels.startCta, "Start Test");
  assert.equal(testLabels.resumeCta, "Resume Test");
  assert.equal(testLabels.unlockAndStartCta, "Unlock & Start Test");
  assert.equal(testLabels.publishCta, "Publish Test");

  const activityLabels = getWorkTypeLabels("ACTIVITY");
  assert.equal(activityLabels.code, "ACTIVITY");
  assert.equal(activityLabels.singular, "Activity");
  assert.equal(activityLabels.plural, "Activities");
  assert.equal(activityLabels.submitCta, "Submit Activity");
  assert.equal(activityLabels.startCta, "Start Activity");
  assert.equal(activityLabels.publishCta, "Publish Activity");

  const assignmentLabels = getWorkTypeLabels("ASSIGNMENT");
  assert.equal(assignmentLabels.code, "ASSIGNMENT");
  assert.equal(assignmentLabels.singular, "Assignment");
  assert.equal(assignmentLabels.plural, "Assignments");
  assert.equal(assignmentLabels.submitCta, "Submit Assignment");
  assert.equal(assignmentLabels.startCta, "Start Assignment");
  assert.equal(assignmentLabels.publishCta, "Publish Assignment");

  const examLabels = getWorkTypeLabels("EXAMINATION");
  assert.equal(examLabels.code, "EXAMINATION");
  assert.equal(examLabels.singular, "Examination");
  assert.equal(examLabels.plural, "Examinations");
  assert.equal(examLabels.submitCta, "Submit Examination");
  assert.equal(examLabels.startCta, "Start Examination");
  assert.equal(examLabels.publishCta, "Publish Examination");
});

test("never prematurely expires an active 15-minute test started on or near its due date and supports limitOneAttempt=false retakes", () => {
  const nowMs = new Date("2026-11-13T14:30:00.000Z").getTime();
  const startedAtIso = new Date(nowMs - 60_000).toISOString(); // Started 1 minute ago
  const deadlineAtIso = new Date(nowMs + 14 * 60_000).toISOString(); // 14 minutes remaining

  const timedTestOnDueDate = {
    id: "test-15min",
    workType: "TEST",
    hasTimeLimit: true,
    durationMinutes: 15,
    dueDate: "2026-11-13",
    availableUntil: "2026-11-13",
  };

  const activeAttempt = {
    id: "att-live",
    status: "in_progress",
    startedAt: startedAtIso,
    deadlineAt: deadlineAtIso,
  };

  // Must NOT expire while 14 minutes remain on the attempt countdown
  assert.equal(isAttemptOverdueForExpiry(activeAttempt, timedTestOnDueDate, nowMs), false);

  // Even if deadlineAt was omitted on the attempt document, startedAt + durationMinutes keeps it alive
  assert.equal(
    isAttemptOverdueForExpiry(
      { id: "att-no-deadline-field", status: "in_progress", startedAt: startedAtIso },
      timedTestOnDueDate,
      nowMs
    ),
    false
  );

  // Once 16 minutes have elapsed, it must expire
  assert.equal(
    isAttemptOverdueForExpiry(activeAttempt, timedTestOnDueDate, nowMs + 16 * 60_000),
    true
  );

  // Verify limitOneAttempt=false persists maxAttempts > 1 for student retakes
  const retakeEnabledTest = validateExamCreationPayload({
    deliveryMode: "NATIVE",
    workType: "TEST",
    title: "Retakeable 15-Min Test",
    subject: "Robotics",
    passcode: "TEST-15M",
    hasTimeLimit: true,
    durationMinutes: 15,
    limitOneAttempt: false,
    schoolId: "sch-1",
    classIds: ["Grade 6"],
    questions: [objective()],
    status: "active",
  });
  assert.equal(retakeEnabledTest.error, undefined);
  assert.equal(retakeEnabledTest.limitOneAttempt, false);
  assert.equal(retakeEnabledTest.maxAttempts, 10);
});

test("expands canonical grade ranges inclusively in either order and normalizes legacy aliases", () => {
  assert.deepEqual(expandGradeRange("Grade 3", "Grade 6"), [
    "Grade 3",
    "Grade 4",
    "Grade 5",
    "Grade 6",
  ]);
  // Reversed order still expands cleanly in canonical order
  assert.deepEqual(expandGradeRange("Grade 6", "Grade 3"), [
    "Grade 3",
    "Grade 4",
    "Grade 5",
    "Grade 6",
  ]);
  // Legacy aliases expand properly
  assert.deepEqual(expandGradeRange("Primary 5", "JSS 1"), [
    "Grade 5",
    "Grade 6",
    "Grade 7",
  ]);
});

test("enforces grade-range + multi-programme intersection and explicit student exclusions", () => {
  const targetedExam = normalizeRecipientTargets({
    recipientMode: "SCHOOL_CLASS",
    schoolId: "sch-alpha",
    gradeTargetMode: "RANGE",
    gradeRange: { from: "Grade 5", to: "Grade 8" },
    targetProgramIds: ["prog-web-dev", "prog-robotics"],
    targetProgramTitles: ["Web Development", "Robotics"],
    excludedStudentIds: ["stu-excluded-1"],
  });

  assert.equal(targetedExam.gradeTargetMode, "RANGE");
  assert.deepEqual(targetedExam.gradeRange, { from: "Grade 5", to: "Grade 8" });
  assert.deepEqual(targetedExam.classIds, ["Grade 5", "Grade 6", "Grade 7", "Grade 8"]);
  assert.deepEqual(targetedExam.targetProgramIds, ["prog-web-dev", "prog-robotics"]);
  assert.deepEqual(targetedExam.excludedStudentIds, ["stu-excluded-1"]);

  const publishedWork = { ...targetedExam, status: "active" };

  // Matches school + grade inside range + matching programme -> ELIGIBLE
  assert.equal(
    isStudentEligibleForWork(
      {
        id: "stu-ok",
        uid: "uid-ok",
        schoolId: "sch-alpha",
        class: "Grade 7",
        selectedProgramIds: ["prog-robotics"],
      },
      publishedWork
    ),
    true
  );

  // Matches school + grade inside range, but WRONG programme -> BLOCKED (intersection rule)
  assert.equal(
    isStudentEligibleForWork(
      {
        id: "stu-wrong-prog",
        uid: "uid-wrong-prog",
        schoolId: "sch-alpha",
        class: "Grade 7",
        selectedProgramIds: ["prog-typing"],
      },
      publishedWork
    ),
    false
  );

  // Matches school + matching programme, but grade OUTSIDE range -> BLOCKED (intersection rule)
  assert.equal(
    isStudentEligibleForWork(
      {
        id: "stu-out-of-range",
        uid: "uid-out-of-range",
        schoolId: "sch-alpha",
        class: "Grade 9",
        selectedProgramIds: ["prog-web-dev"],
      },
      publishedWork
    ),
    false
  );

  // Explicitly excluded student matches school + grade + programme -> BLOCKED (highest precedence)
  assert.equal(
    isStudentEligibleForWork(
      {
        id: "stu-excluded-1",
        uid: "uid-excluded-1",
        schoolId: "sch-alpha",
        class: "Grade 6",
        selectedProgramIds: ["prog-web-dev"],
      },
      publishedWork
    ),
    false
  );
});

test("resolveCanonicalExamStatus marks past legacy external-link CBT assessments as completed and preserves explicit drafts", () => {
  const nowMs = new Date("2026-11-25T12:00:00.000Z").getTime();

  // 1. Legacy external-link CBT assessment with missing status -> completed
  const legacyExternalMissingStatus = {
    id: "ext-legacy-1",
    title: "Term 1 Google Forms CBT",
    deliveryMode: "EXTERNAL_LINK",
    externalUrl: "https://docs.google.com/forms/d/e/1FAIpQLSe/viewform",
  };
  assert.equal(resolveCanonicalExamStatus(legacyExternalMissingStatus, nowMs), "completed");

  // 2. Legacy external-link CBT assessment marked draft with recorded attempts -> completed
  const legacyExternalDraftWithAttempts = {
    id: "ext-legacy-2",
    title: "Past External CBT With Attempts",
    deliveryMode: "EXTERNAL_LINK",
    externalUrl: "https://docs.google.com/forms/d/e/1FAIpQLSe/viewform",
    status: "draft",
    attemptCount: 5,
  };
  assert.equal(resolveCanonicalExamStatus(legacyExternalDraftWithAttempts, nowMs), "completed");

  // 3. Past external-link CBT assessment created > 12h ago without future deadline or manual reopen -> completed
  const pastExternalActive = {
    id: "ext-legacy-3",
    title: "Last Month External CBT",
    deliveryMode: "EXTERNAL_LINK",
    externalUrl: "https://docs.google.com/forms/d/e/1FAIpQLSe/viewform",
    status: "active",
    createdAt: "2026-10-15T09:00:00.000Z",
  };
  assert.equal(resolveCanonicalExamStatus(pastExternalActive, nowMs), "completed");

  // 4. External-link CBT assessment manually reopened by tutor/admin -> active
  const reopenedExternal = {
    ...pastExternalActive,
    manuallyReopenedAt: "2026-11-25T10:00:00.000Z",
  };
  assert.equal(resolveCanonicalExamStatus(reopenedExternal, nowMs), "active");

  // 5. Newly authored draft assessment with 0 attempts -> remains draft and strictly hidden from students
  const genuineDraft = {
    id: "draft-new-1",
    title: "Unpublished Tutor Draft",
    deliveryMode: "NATIVE",
    status: "draft",
    attemptCount: 0,
    schoolId: "sch-alpha",
    classIds: ["Grade 5"],
  };
  assert.equal(resolveCanonicalExamStatus(genuineDraft, nowMs), "draft");
  assert.equal(
    isStudentEligibleForWork(
      { id: "stu-1", uid: "uid-1", schoolId: "sch-alpha", class: "Grade 5" },
      genuineDraft
    ),
    false
  );
});

test("mergeExamRecordByPrecedence enforces jdiExams > schoolExams > exams so stale schoolExams records never overwrite jdiExams status", () => {
  const nowMs = new Date("2026-11-25T12:00:00.000Z").getTime();

  const jdiClosedRecord = {
    id: "exam-sync-1",
    title: "Mid-Term Robotics CBT",
    status: "completed",
    closedAt: "2026-11-20T15:00:00.000Z",
    schoolId: "sch-1",
    classIds: ["Grade 6"],
  };

  const staleSchoolExamRecord = {
    id: "exam-sync-1",
    title: "Mid-Term Robotics CBT",
    status: "active",
    schoolId: "sch-1",
    classIds: ["Grade 6"],
  };

  // Even if jdiExams is loaded first and schoolExams is merged second, jdiExams status wins
  const mergedJdiFirst = mergeExamRecordByPrecedence(
    mergeExamRecordByPrecedence(null, jdiClosedRecord, "jdiExams", nowMs),
    staleSchoolExamRecord,
    "schoolExams",
    nowMs
  );
  assert.equal(mergedJdiFirst.status, "completed");

  // And if schoolExams is loaded first and jdiExams is merged second, jdiExams status also wins
  const mergedSchoolFirst = mergeExamRecordByPrecedence(
    mergeExamRecordByPrecedence(null, staleSchoolExamRecord, "schoolExams", nowMs),
    jdiClosedRecord,
    "jdiExams",
    nowMs
  );
  assert.equal(mergedSchoolFirst.status, "completed");

  // If jdiExams has status "draft" and schoolExams has stale "active", merged record stays "draft" and is hidden from students
  const jdiDraftRecord = {
    id: "exam-draft-sync",
    title: "Draft CBT",
    status: "draft",
    schoolId: "sch-1",
    classIds: ["Grade 6"],
  };
  const mergedDraft = mergeExamRecordByPrecedence(
    mergeExamRecordByPrecedence(null, jdiDraftRecord, "jdiExams", nowMs),
    { ...jdiDraftRecord, status: "active" },
    "schoolExams",
    nowMs
  );
  assert.equal(mergedDraft.status, "draft");
  assert.equal(
    isStudentEligibleForWork(
      { id: "stu-1", uid: "uid-1", schoolId: "sch-1", class: "Grade 6" },
      mergedDraft
    ),
    false
  );
});

test("recalculateAttemptForUpdatedExam automatically updates submitted scores, maxScore, percentage, and questionsSnapshot when point values change (active or inactive)", () => {
  const initialQuestions = [
    objective({ id: "q1", points: 2, correctOptionIds: ["a"] }),
    objective({ id: "q2", points: 2, correctOptionIds: ["b"] }),
    objective({ id: "q3", points: 2, correctOptionIds: ["a"] }),
    objective({ id: "q4", points: 2, correctOptionIds: ["b"] }),
  ];

  // Student got 3 of 4 right when each MCQ was 2 pts -> 6/8 (75%)
  const initialGrading = gradeAnswers({ gradingMode: "automatic", questions: initialQuestions }, {
    q1: "a",
    q2: "b",
    q3: "b", // wrong
    q4: "b",
  });
  assert.equal(initialGrading.score, 6);
  assert.equal(initialGrading.maxScore, 8);
  assert.equal(initialGrading.percentage, 75);

  const submittedAttempt = {
    id: "att-1",
    status: "submitted",
    submittedAt: "2026-11-20T10:00:00.000Z",
    answers: { q1: "a", q2: "b", q3: "b", q4: "b" },
    score: initialGrading.score,
    maxScore: initialGrading.maxScore,
    percentage: initialGrading.percentage,
    questionResults: initialGrading.questionResults,
    questionsSnapshot: initialQuestions,
  };

  // Tutor updates an INACTIVE ("completed") exam: sets uniform MCQ points from 2 -> 1
  const updatedInactiveExam = {
    id: "exam-1",
    status: "completed",
    gradingMode: "automatic",
    questions: initialQuestions.map(q => ({ ...q, points: 1 })),
  };

  const recalcUniform = recalculateAttemptForUpdatedExam(updatedInactiveExam, submittedAttempt);
  assert.equal(recalcUniform.skipped, false);
  assert.equal(recalcUniform.changed, true);
  assert.equal(recalcUniform.isSubmitted, true);
  assert.equal(recalcUniform.score, 3);
  assert.equal(recalcUniform.maxScore, 4);
  assert.equal(recalcUniform.percentage, 75);
  assert.deepEqual(
    recalcUniform.questionResults.map(r => [r.questionId, r.pointsAwarded, r.maxPoints]),
    [
      ["q1", 1, 1],
      ["q2", 1, 1],
      ["q3", 0, 1],
      ["q4", 1, 1],
    ]
  );
  // questionsSnapshot must also be updated so computeExamMaxScore agrees with the new denominator
  assert.equal(computeExamMaxScore(updatedInactiveExam, recalcUniform), 4);

  // Idempotent when re-run against the already-updated attempt
  const secondPass = recalculateAttemptForUpdatedExam(updatedInactiveExam, {
    ...submittedAttempt,
    score: recalcUniform.score,
    maxScore: recalcUniform.maxScore,
    percentage: recalcUniform.percentage,
    questionResults: recalcUniform.questionResults,
    questionsSnapshot: recalcUniform.questionsSnapshot,
  });
  assert.equal(secondPass.changed, false);

  // Changing individual question weight (q1 -> 5 pts, q3 -> 1 pt) changes percentage accurately
  const weightedExam = {
    id: "exam-1",
    status: "active",
    gradingMode: "automatic",
    questions: [
      objective({ id: "q1", points: 5, correctOptionIds: ["a"] }),
      objective({ id: "q2", points: 1, correctOptionIds: ["b"] }),
      objective({ id: "q3", points: 1, correctOptionIds: ["a"] }),
      objective({ id: "q4", points: 3, correctOptionIds: ["b"] }),
    ],
  };
  const recalcWeighted = recalculateAttemptForUpdatedExam(weightedExam, submittedAttempt);
  assert.equal(recalcWeighted.changed, true);
  assert.equal(recalcWeighted.score, 9); // 5 + 1 + 0 + 3
  assert.equal(recalcWeighted.maxScore, 10);
  assert.equal(recalcWeighted.percentage, 90);
});

test("recalculateAttemptForUpdatedExam preserves manual essay grades on mixed exams, handles legacy attempts without raw answers, and syncs in-progress snapshots without fabricating scores", () => {
  const mixedExamUpdated = {
    id: "exam-mixed",
    status: "completed",
    gradingMode: "manual", // forced manual because of the essay
    questions: [
      objective({ id: "mcq1", points: 1, correctOptionIds: ["a"] }),
      objective({ id: "mcq2", points: 1, correctOptionIds: ["b"] }),
      { id: "essay1", type: "essay", prompt: "Explain loops", points: 10 },
    ],
  };

  // Previously MCQs were 2 pts each (student got mcq1 right = 2/2, mcq2 wrong = 0/2) and tutor graded essay 8/10 -> 10/14
  const mixedAttempt = {
    id: "att-mixed",
    status: "graded",
    submittedAt: "2026-11-20T11:00:00.000Z",
    answers: { mcq1: "a", mcq2: "a", essay1: "Loops repeat instructions." },
    score: 10,
    maxScore: 14,
    percentage: 71.43,
    questionResults: [
      { questionId: "mcq1", correct: true, manualReview: false, pointsAwarded: 2, maxPoints: 2, gradedByTutor: true },
      { questionId: "mcq2", correct: false, manualReview: false, pointsAwarded: 0, maxPoints: 2, gradedByTutor: true },
      { questionId: "essay1", manualReview: false, pointsAwarded: 8, maxPoints: 10, gradedByTutor: true },
    ],
  };

  const recalcMixed = recalculateAttemptForUpdatedExam(mixedExamUpdated, mixedAttempt);
  assert.equal(recalcMixed.changed, true);
  assert.equal(recalcMixed.score, 9); // 1 + 0 + 8 (essay untouched)
  assert.equal(recalcMixed.maxScore, 12); // 1 + 1 + 10
  assert.equal(recalcMixed.percentage, 75);

  // If the essay's max points is lowered from 10 -> 5, essay 8/10 scales proportionally to 4/5 (never exceeds max)
  const loweredEssayExam = {
    ...mixedExamUpdated,
    questions: [
      objective({ id: "mcq1", points: 1, correctOptionIds: ["a"] }),
      objective({ id: "mcq2", points: 1, correctOptionIds: ["b"] }),
      { id: "essay1", type: "essay", prompt: "Explain loops", points: 5 },
    ],
  };
  const recalcLoweredEssay = recalculateAttemptForUpdatedExam(loweredEssayExam, mixedAttempt);
  assert.equal(recalcLoweredEssay.score, 5); // 1 + 0 + 4
  assert.equal(recalcLoweredEssay.maxScore, 7); // 1 + 1 + 5
  assert.equal(recalcLoweredEssay.questionResults[2].pointsAwarded, 4);
  assert.equal(recalcLoweredEssay.questionResults[2].maxPoints, 5);

  // Legacy attempt missing raw `answers` map still rescales using prevRes.correct
  const legacyAttempt = {
    id: "att-legacy",
    status: "submitted",
    submittedAt: "2026-10-01T09:00:00.000Z",
    answers: {},
    score: 4,
    maxScore: 4,
    percentage: 100,
    questionResults: [
      { questionId: "mcq1", correct: true, manualReview: false, pointsAwarded: 2, maxPoints: 2 },
      { questionId: "mcq2", correct: true, manualReview: false, pointsAwarded: 2, maxPoints: 2 },
    ],
  };
  const legacyRecalc = recalculateAttemptForUpdatedExam(
    {
      id: "exam-legacy",
      gradingMode: "automatic",
      questions: [
        objective({ id: "mcq1", points: 5, correctOptionIds: ["a"] }),
        objective({ id: "mcq2", points: 5, correctOptionIds: ["b"] }),
      ],
    },
    legacyAttempt
  );
  assert.equal(legacyRecalc.changed, true);
  assert.equal(legacyRecalc.score, 10);
  assert.equal(legacyRecalc.maxScore, 10);
  assert.equal(legacyRecalc.percentage, 100);

  // In-progress attempt should sync maxScore/questionsSnapshot ONLY and never set score/percentage
  const inProgressAttempt = {
    id: "att-ip",
    status: "in_progress",
    maxScore: 4,
    questionsSnapshot: [
      objective({ id: "mcq1", points: 2, correctOptionIds: ["a"] }),
      objective({ id: "mcq2", points: 2, correctOptionIds: ["b"] }),
    ],
  };
  const ipRecalc = recalculateAttemptForUpdatedExam(
    {
      id: "exam-ip",
      gradingMode: "automatic",
      questions: [
        objective({ id: "mcq1", points: 1, correctOptionIds: ["a"] }),
        objective({ id: "mcq2", points: 1, correctOptionIds: ["b"] }),
      ],
    },
    inProgressAttempt
  );
  assert.equal(ipRecalc.isSubmitted, false);
  assert.equal(ipRecalc.changed, true);
  assert.equal(ipRecalc.maxScore, 2);
  assert.equal(ipRecalc.score, undefined);
  assert.equal(ipRecalc.questionsSnapshot[0].points, 1);
});

// ────────────────────────────────────────────────────────────────────────────
// Assessment Layout v1, Comprehension Groups, Randomization & Pause Policy
// ────────────────────────────────────────────────────────────────────────────

const createSeededRng = (seed = 42) => {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

test("buildDefaultAssessmentLayout & resolveAssessmentLayout provide backward-compatible fallback for legacy flat exams", () => {
  const legacyQuestions = [
    objective({ id: "q1", prompt: "First" }),
    objective({ id: "q2", prompt: "Second" }),
    { id: "q3", type: "short_answer", prompt: "Explain", points: 3 },
  ];

  const fallback = buildDefaultAssessmentLayout(legacyQuestions);
  assert.equal(fallback.version, 1);
  assert.equal(fallback.sections.length, 1);
  assert.equal(fallback.sections[0].id, "sec_1");
  assert.deepEqual(
    fallback.sections[0].items.map((it) => ({ kind: it.kind, questionId: it.questionId })),
    [
      { kind: "question", questionId: "q1" },
      { kind: "question", questionId: "q2" },
      { kind: "question", questionId: "q3" },
    ]
  );

  // Legacy exam without assessmentLayout resolves cleanly to the same single-section structure
  const resolved = resolveAssessmentLayout({ id: "legacy-1", questions: legacyQuestions }, legacyQuestions);
  assert.equal(resolved.version, 1);
  assert.equal(resolved.sections.length, 1);
  assert.deepEqual(
    resolved.sections[0].items.map((it) => it.questionId),
    ["q1", "q2", "q3"]
  );
});

test("normalizeAssessmentLayout & validateExamCreationPayload validate sections, comprehension passages, zero-mark content blocks, and reject malformed schemas", () => {
  const questions = [
    objective({ id: "q1", points: 2, prompt: "Standalone 1" }),
    objective({ id: "q2", points: 3, prompt: "Passage Q1" }),
    objective({ id: "q3", points: 5, prompt: "Passage Q2" }),
    { id: "q4", type: "essay", points: 10, prompt: "Final essay" },
  ];

  const validLayout = {
    version: 1,
    sections: [
      {
        id: "sec_a",
        title: "Section A — Warmup",
        description: "Answer all questions carefully.",
        items: [
          {
            id: "inst_1",
            kind: "content",
            blockType: "instruction",
            title: "General Instructions",
            body: "Read every line carefully.\nNo calculators permitted.",
          },
          { id: "item_q1", kind: "question", questionId: "q1" },
        ],
      },
      {
        id: "sec_b",
        title: "Section B — Reading Comprehension",
        items: [
          {
            id: "comp_1",
            kind: "comprehension",
            title: "Passage I: Solar Microgrids",
            body: "Paragraph 1.\n\nParagraph 2.",
            questionIds: ["q2", "q3"],
          },
          {
            id: "txt_1",
            kind: "content",
            blockType: "text",
            title: "Essay Guidance",
            body: "Write at least two clear paragraphs.",
          },
          { id: "item_q4", kind: "question", questionId: "q4" },
        ],
      },
    ],
  };

  const normalized = normalizeAssessmentLayout(validLayout, questions);
  assert.equal(normalized.error, undefined);
  assert.equal(normalized.layout.version, 1);
  assert.equal(normalized.layout.sections.length, 2);
  assert.deepEqual(normalized.layout.sections[1].items[0].questionIds, ["q2", "q3"]);

  // Full exam payload validation confirms non-graded blocks carry 0 marks and never alter questionCount or maxScore
  const examValidation = validateExamCreationPayload({
    title: "Term 2 Comprehension & Logic",
    subject: "English & Critical Thinking",
    passcode: "JDI-COMP2",
    schoolId: "sch-1",
    classIds: ["Grade 8"],
    durationMinutes: 45,
    status: "published",
    workType: "EXAMINATION",
    deliveryMode: "NATIVE",
    questions,
    assessmentLayout: validLayout,
  });
  assert.equal(examValidation.error, undefined);
  assert.equal(examValidation.questions.length, 4);
  assert.equal(examValidation.maxScore, 20);
  assert.equal(computeExamMaxScore({ questions: examValidation.questions }), 20);
  assert.equal(examValidation.assessmentLayout.sections.length, 2);

  // Rejects unknown questionId
  const unknownQ = normalizeAssessmentLayout(
    {
      version: 1,
      sections: [{ id: "sec_1", title: "", items: [{ id: "i1", kind: "question", questionId: "missing_q" }] }],
    },
    questions
  );
  assert.match(unknownQ.error || "", /unknown question ID/i);

  // Rejects unknown questionId inside comprehension group
  const unknownCompQ = normalizeAssessmentLayout(
    {
      version: 1,
      sections: [
        {
          id: "sec_1",
          title: "",
          items: [{ id: "c1", kind: "comprehension", title: "P", body: "Text", questionIds: ["q2", "ghost"] }],
        },
      ],
    },
    questions
  );
  assert.match(unknownCompQ.error || "", /unknown question ID/i);

  // Rejects duplicate questionId across standalone + comprehension
  const dupQ = normalizeAssessmentLayout(
    {
      version: 1,
      sections: [
        {
          id: "sec_1",
          title: "",
          items: [
            { id: "i1", kind: "question", questionId: "q2" },
            { id: "c1", kind: "comprehension", title: "P", body: "Text", questionIds: ["q2"] },
          ],
        },
      ],
    },
    questions
  );
  assert.match(dupQ.error || "", /more than once/i);

  // Rejects unsupported item kind
  const badKind = normalizeAssessmentLayout(
    {
      version: 1,
      sections: [{ id: "sec_1", title: "", items: [{ id: "x1", kind: "video_embed" }] }],
    },
    questions
  );
  assert.match(badKind.error || "", /unsupported assessment layout item kind/i);

  // Rejects invalid content blockType
  const badBlockType = normalizeAssessmentLayout(
    {
      version: 1,
      sections: [
        { id: "sec_1", title: "", items: [{ id: "x2", kind: "content", blockType: "html_script", body: "Hi" }] },
      ],
    },
    questions
  );
  assert.match(badBlockType.error || "", /unsupported content block type/i);
});

test("generateAttemptOrdering keeps comprehension passages attached, restricts shuffles to safe boundaries, preserves option grading, and replays identically from snapshot", () => {
  const questions = [
    objective({
      id: "s1",
      points: 2,
      options: [
        { id: "optA", text: "Alpha" },
        { id: "optB", text: "Beta" },
        { id: "optC", text: "Gamma" },
        { id: "optD", text: "Delta" },
      ],
      correctOptionIds: ["optB"],
    }),
    objective({ id: "s2", points: 2, correctOptionIds: ["a"] }),
    objective({ id: "s3", points: 2, correctOptionIds: ["b"] }),
    objective({ id: "c1", points: 3, correctOptionIds: ["a"] }),
    objective({ id: "c2", points: 3, correctOptionIds: ["b"] }),
    objective({ id: "c3", points: 3, correctOptionIds: ["a"] }),
    objective({ id: "t1", points: 2, correctOptionIds: ["a"] }),
    objective({ id: "t2", points: 2, correctOptionIds: ["b"] }),
  ];

  const layout = {
    version: 1,
    sections: [
      {
        id: "sec_1",
        title: "Section 1",
        items: [
          { id: "i_s1", kind: "question", questionId: "s1" },
          { id: "i_s2", kind: "question", questionId: "s2" },
          { id: "i_s3", kind: "question", questionId: "s3" },
          { id: "note_1", kind: "content", blockType: "instruction", title: "Note", body: "Read passage next." },
          {
            id: "comp_main",
            kind: "comprehension",
            title: "Passage A",
            body: "A long comprehension text.",
            questionIds: ["c1", "c2", "c3"],
          },
        ],
      },
      {
        id: "sec_2",
        title: "Section 2",
        items: [
          { id: "i_t1", kind: "question", questionId: "t1" },
          { id: "i_t2", kind: "question", questionId: "t2" },
        ],
      },
    ],
  };

  const exam = {
    id: "exam-rand",
    shuffleQuestions: true,
    shuffleOptions: true,
    questions,
    assessmentLayout: layout,
  };

  // Run multiple seeds to verify boundary invariants never break
  for (let seed = 1; seed <= 10; seed += 1) {
    const ordering = generateAttemptOrdering(exam, questions, createSeededRng(seed));
    assert.equal(ordering.questionOrder.length, 8);

    // First 3 questions MUST stay within the Section 1 standalone run {s1, s2, s3}
    assert.deepEqual([...ordering.questionOrder.slice(0, 3)].sort(), ["s1", "s2", "s3"]);

    // Next 3 questions MUST stay within comprehension group {c1, c2, c3} and match questionOrderByGroup
    const compOrder = ordering.questionOrder.slice(3, 6);
    assert.deepEqual([...compOrder].sort(), ["c1", "c2", "c3"]);
    assert.deepEqual(ordering.questionOrderByGroup.comp_main, compOrder);

    // Final 2 questions MUST stay within Section 2 {t1, t2}
    assert.deepEqual([...ordering.questionOrder.slice(6, 8)].sort(), ["t1", "t2"]);

    // Instruction block stays anchored at index 3 of Section 1, right before comprehension at index 4
    const sec1Items = ordering.assessmentLayoutSnapshot.sections[0].items;
    assert.equal(sec1Items[3].kind, "content");
    assert.equal(sec1Items[3].id, "note_1");
    assert.equal(sec1Items[4].kind, "comprehension");
    assert.deepEqual(sec1Items[4].questionIds, compOrder);

    // Option shuffling preserves all stable option IDs and grading still scores optB as correct
    assert.deepEqual([...ordering.optionOrderMap.s1].sort(), ["optA", "optB", "optC", "optD"]);
  }

  // Deterministic replay: same seed yields identical ordering, and persisted snapshot resolves identically on reload
  const runA = generateAttemptOrdering(exam, questions, createSeededRng(1337));
  const runB = generateAttemptOrdering(exam, questions, createSeededRng(1337));
  assert.deepEqual(runA, runB);

  // Confirm shuffled options grade accurately against original correctOptionIds
  const graded = gradeAnswers(
    { gradingMode: "automatic", questions },
    {
      s1: "optB",
      s2: "a",
      s3: "b",
      c1: "a",
      c2: "b",
      c3: "a",
      t1: "a",
      t2: "b",
    }
  );
  assert.equal(graded.score, 19);
  assert.equal(graded.maxScore, 19);
  assert.equal(graded.percentage, 100);

  // Reloading from attempt snapshot produces the exact frozen layout & order
  const reloadedLayout = resolveAssessmentLayout(
    { assessmentLayoutSnapshot: runA.assessmentLayoutSnapshot },
    questions
  );
  assert.deepEqual(reloadedLayout, runA.assessmentLayoutSnapshot);

  // shuffleArrayWithRng does not mutate input array
  const src = [1, 2, 3, 4];
  const shuffled = shuffleArrayWithRng(src, createSeededRng(7));
  assert.deepEqual(src, [1, 2, 3, 4]);
  assert.deepEqual([...shuffled].sort(), [1, 2, 3, 4]);
});

test("buildQuestionContextMap maps linked comprehension questions to their parent passage and isolates standalone questions", () => {
  const layout = {
    version: 1,
    sections: [
      {
        id: "sec_1",
        title: "Part I",
        items: [
          { id: "c_intro", kind: "content", blockType: "instruction", title: "Directions", body: "Read carefully." },
          { id: "i_q1", kind: "question", questionId: "q1" },
          { id: "c_pass", kind: "content", blockType: "text", title: "Context", body: "Before passage." },
          {
            id: "comp_1",
            kind: "comprehension",
            title: "The Water Cycle",
            body: "Evaporation and condensation.",
            questionIds: ["q2", "q3"],
          },
        ],
      },
    ],
  };

  const ctxMap = buildQuestionContextMap(layout);
  assert.equal(ctxMap.q1.comprehension, null);
  assert.equal(ctxMap.q1.section.id, "sec_1");
  assert.equal(ctxMap.q1.precedingContentBlocks.length, 1);
  assert.equal(ctxMap.q1.precedingContentBlocks[0].id, "c_intro");

  assert.equal(ctxMap.q2.comprehension.id, "comp_1");
  assert.equal(ctxMap.q2.comprehensionQuestionIndex, 0);
  assert.equal(ctxMap.q2.comprehensionQuestionTotal, 2);
  assert.equal(ctxMap.q2.precedingContentBlocks.length, 1);
  assert.equal(ctxMap.q2.precedingContentBlocks[0].id, "c_pass");

  assert.equal(ctxMap.q3.comprehension.id, "comp_1");
  assert.equal(ctxMap.q3.comprehensionQuestionIndex, 1);
  assert.equal(ctxMap.q3.comprehensionQuestionTotal, 2);
  assert.equal(ctxMap.q3.precedingContentBlocks.length, 0);
});

test("canPauseAssessmentWorkType allows pausing only for ASSIGNMENT and ACTIVITY and forbids TEST and EXAMINATION", () => {
  assert.equal(canPauseAssessmentWorkType("ASSIGNMENT"), true);
  assert.equal(canPauseAssessmentWorkType("ACTIVITY"), true);
  assert.equal(canPauseAssessmentWorkType("assignment"), true);
  assert.equal(canPauseAssessmentWorkType(" activity "), true);

  assert.equal(canPauseAssessmentWorkType("TEST"), false);
  assert.equal(canPauseAssessmentWorkType("EXAMINATION"), false);
  assert.equal(canPauseAssessmentWorkType("test"), false);
  assert.equal(canPauseAssessmentWorkType("examination"), false);
  assert.equal(canPauseAssessmentWorkType(""), false);
  assert.equal(canPauseAssessmentWorkType(undefined), false);
});





