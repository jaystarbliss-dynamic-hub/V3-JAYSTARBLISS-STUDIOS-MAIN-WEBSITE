import test from "node:test";
import assert from "node:assert/strict";
import {
  CANONICAL_CLASSES,
  normalizeClassName,
  isCanonicalClass,
  normalizeClassList,
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
  assert.equal(
    canManageExamRecord({
      uid: "tutor-2",
      role: "TUTOR",
      exam,
      assignedSchoolIds: ["sch-b"],
    }),
    false
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

test("enforces tutor-controlled result release before students, parents, or school admins can view or print results", () => {
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

  // In-progress attempts cannot be printed even by tutors/admins
  assert.equal(canViewOrPrintAttemptResult(inProgressAttempt, "TUTOR"), false);
  assert.equal(canViewOrPrintAttemptResult(inProgressAttempt, "ADMIN"), false);
  assert.equal(canViewOrPrintAttemptResult(inProgressAttempt, "STUDENT"), false);
  assert.equal(canViewOrPrintAttemptResult(inProgressAttempt, "SCHOOL"), false);

  // Submitted but UNRELEASED attempts:
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
