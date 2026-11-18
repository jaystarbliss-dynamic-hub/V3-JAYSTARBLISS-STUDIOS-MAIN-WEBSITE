import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_JDI_CATEGORIES,
  DEFAULT_JDI_GRADE_BOUNDARIES,
  allocateReportReferenceNumber,
  calculatePeriodAcademicPerformance,
  calculateSessionThreeTermPerformance,
  createStarterGradingProfiles,
  deduplicateCanonicalEvidence,
  normalizeReferenceCode,
  normalizeScoreToPercentage,
  resolveGradeFromBoundaries,
   validateCategoryWeights,
  validateGradeBoundaries,
} from '../src/lib/academic-reporting/gradingEngine.ts';

const emptyAttendance = {
  totalSessions: 10,
  presentCount: 9,
  absentCount: 1,
  lateCount: 0,
  excusedCount: 0,
  attendanceRate: 90,
  records: [],
};

const emptyMilestones = {
  totalMilestones: 4,
  completedCount: 4,
  inProgressCount: 0,
  pendingCount: 0,
  completionRate: 100,
  skillsAcquired: ['Autonomous Sensor Logic', 'Python Control Structures'],
  items: [],
};

test('1. Score normalization converts different maximum marks to accurate percentages and rejects invalid denominators', () => {
  const s1 = normalizeScoreToPercentage(18, 20);
  assert.equal(s1.valid, true);
  assert.equal(s1.earned, 18);
  assert.equal(s1.max, 20);
  assert.equal(s1.percentage, 90);

  const s2 = normalizeScoreToPercentage(25, 50);
  assert.equal(s2.valid, true);
  assert.equal(s2.percentage, 50);

  const invalidMax = normalizeScoreToPercentage(15, 0);
  assert.equal(invalidMax.valid, false);
  assert.equal(invalidMax.percentage, null);

  const nullEarned = normalizeScoreToPercentage(null, 100);
  assert.equal(nullEarned.valid, false);
  assert.equal(nullEarned.percentage, null);
});

test('2. Canonical evidence deduplicator prevents double-counting across mirrored collections and multiple attempts', () => {
  const items = [
    // Mirrored assignment record in `assignments` (ungraded placeholder)
    {
      canonicalWorkId: 'work_exam_robotics_101',
      sourceCollection: 'assignments',
      sourceId: 'assign_1',
      referenceNumber: 'JDI-ASSIGN1',
      title: 'Robotics Sensor Quiz',
      subject: 'Robotics',
      programName: 'Developers',
      workType: 'QUIZ',
      categoryId: '',
      categoryName: '',
      studentId: 'stu_1',
      studentName: 'Ada Lovelace',
      rawEarnedMarks: null,
      maxAvailableMarks: 20,
      normalizedPercentage: null,
      isUngraded: false,
      isReleased: false,
      status: 'MISSING',
      includedInCalculation: false,
      completedAt: '2026-10-01T10:00:00.000Z',
      dueDate: '2026-10-05T10:00:00.000Z',
    },
    // Earlier attempt in `jdiExamAttempts`
    {
      canonicalWorkId: 'work_exam_robotics_101',
      sourceCollection: 'jdiExamAttempts',
      sourceId: 'att_1',
      referenceNumber: 'JDI-ATT1',
      title: 'Robotics Sensor Quiz',
      subject: 'Robotics',
      programName: 'Developers',
      workType: 'QUIZ',
      categoryId: '',
      categoryName: '',
      studentId: 'stu_1',
      studentName: 'Ada Lovelace',
      rawEarnedMarks: 14,
      maxAvailableMarks: 20,
      normalizedPercentage: 70,
      isUngraded: false,
      isReleased: true,
      status: 'GRADED',
      includedInCalculation: false,
      completedAt: '2026-10-02T10:00:00.000Z',
      dueDate: '2026-10-05T10:00:00.000Z',
    },
    // Latest released attempt in `jdiExamAttempts`
    {
      canonicalWorkId: 'work_exam_robotics_101',
      sourceCollection: 'jdiExamAttempts',
      sourceId: 'att_2',
      referenceNumber: 'JDI-ATT2',
      title: 'Robotics Sensor Quiz',
      subject: 'Robotics',
      programName: 'Developers',
      workType: 'QUIZ',
      categoryId: '',
      categoryName: '',
      studentId: 'stu_1',
      studentName: 'Ada Lovelace',
      rawEarnedMarks: 18,
      maxAvailableMarks: 20,
      normalizedPercentage: 90,
      isUngraded: false,
      isReleased: true,
      status: 'GRADED',
      includedInCalculation: false,
      completedAt: '2026-10-03T10:00:00.000Z',
      dueDate: '2026-10-05T10:00:00.000Z',
    },
  ];

  const deduped = deduplicateCanonicalEvidence(items);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].sourceId, 'att_2');
  assert.equal(deduped[0].rawEarnedMarks, 18);
  assert.equal(deduped[0].normalizedPercentage, 90);
});

test('3. Category weight validation enforces 100% total and grade boundary validation rejects overlaps', () => {
  const validWeights = validateCategoryWeights(DEFAULT_JDI_CATEGORIES);
  assert.equal(validWeights.valid, true);
  assert.equal(validWeights.totalWeight, 100);

  const invalidWeights = validateCategoryWeights([
    { ...DEFAULT_JDI_CATEGORIES[0], weight: 50 },
    { ...DEFAULT_JDI_CATEGORIES[1], weight: 20 },
  ]);
  assert.equal(invalidWeights.valid, false);

  const validBoundaries = validateGradeBoundaries(DEFAULT_JDI_GRADE_BOUNDARIES);
  assert.equal(validBoundaries.valid, true);

  const overlappingBoundaries = validateGradeBoundaries([
    { grade: 'A', minPercentage: 70, maxPercentage: 100, label: 'Distinction', isPass: true },
    { grade: 'B', minPercentage: 60, maxPercentage: 75, label: 'Overlap', isPass: true },
    { grade: 'F', minPercentage: 0, maxPercentage: 59.99, label: 'Fail', isPass: false },
  ]);
  assert.equal(overlappingBoundaries.valid, false);
});

test('4. Pending submissions and ungraded activities are never converted to zero', () => {
  const profile = createStarterGradingProfiles()[0];
  const evidence = [
    {
      canonicalWorkId: 'w_1',
      sourceCollection: 'jdiExamAttempts',
      sourceId: 'a_1',
      referenceNumber: 'JDI-111',
      title: 'Graded Final Exam',
      subject: 'Robotics',
      programName: 'Developers',
      workType: 'EXAMINATION',
      categoryId: '',
      categoryName: '',
      studentId: 'stu_1',
      studentName: 'Ada Lovelace',
      rawEarnedMarks: 36,
      maxAvailableMarks: 40,
      normalizedPercentage: 90,
      isUngraded: false,
      isReleased: true,
      status: 'GRADED',
      includedInCalculation: false,
      completedAt: '2026-10-15T10:00:00.000Z',
      dueDate: '2026-10-20T10:00:00.000Z',
    },
    {
      canonicalWorkId: 'w_2',
      sourceCollection: 'assignmentSubmissions',
      sourceId: 'sub_1',
      referenceNumber: 'JDI-222',
      title: 'Submitted Project Awaiting Tutor Marking',
      subject: 'Robotics',
      programName: 'Developers',
      workType: 'PROJECT',
      categoryId: '',
      categoryName: '',
      studentId: 'stu_1',
      studentName: 'Ada Lovelace',
      rawEarnedMarks: null,
      maxAvailableMarks: 50,
      normalizedPercentage: null,
      isUngraded: false,
      isReleased: false,
      status: 'PENDING_REVIEW',
      includedInCalculation: false,
      completedAt: '2026-10-16T10:00:00.000Z',
      dueDate: '2026-10-20T10:00:00.000Z',
    },
    {
      canonicalWorkId: 'w_3',
      sourceCollection: 'assignments',
      sourceId: 'act_1',
      referenceNumber: 'JDI-333',
      title: 'Ungraded Class Lab Participation',
      subject: 'Robotics',
      programName: 'Developers',
      workType: 'ACTIVITY',
      categoryId: '',
      categoryName: '',
      studentId: 'stu_1',
      studentName: 'Ada Lovelace',
      rawEarnedMarks: null,
      maxAvailableMarks: 0,
      normalizedPercentage: null,
      isUngraded: true,
      isReleased: true,
      status: 'UNGRADED_ACTIVITY',
      includedInCalculation: false,
      completedAt: '2026-10-16T10:00:00.000Z',
      dueDate: '2026-10-20T10:00:00.000Z',
    },
  ];

  const calc = calculatePeriodAcademicPerformance({
    evidenceItems: evidence,
    profile,
    periodStartDate: '2026-09-01',
    periodEndDate: '2026-12-18',
    attendanceSummary: emptyAttendance,
    milestoneSummary: emptyMilestones,
    approveWeightRedistribution: false,
  });

  // Pending review and ungraded activities are excluded from numerical denominator, never turned into 0
  assert.equal(calc.calculationBreakdown.includedRecordsCount, 1);
  assert.equal(calc.calculationBreakdown.pendingReviewCount, 1);
  assert.equal(calc.calculationBreakdown.ungradedActivitiesCount, 1);
  assert.equal(calc.isComplete, false);
  // Without weight redistribution approval, the 40% exam category contributes 90% * 0.40 = 36%
  assert.equal(calc.overallPercentage, 36);

  // When weight redistribution is explicitly approved, the populated exam category scales to 100% -> 90%
  const redistributed = calculatePeriodAcademicPerformance({
    evidenceItems: [evidence[0]],
    profile,
    periodStartDate: '2026-09-01',
    periodEndDate: '2026-12-18',
    attendanceSummary: emptyAttendance,
    milestoneSummary: emptyMilestones,
    approveWeightRedistribution: true,
    redistributionApprovedBy: 'Academic Admin',
  });
  assert.equal(redistributed.calculationBreakdown.weightRedistributed, true);
  assert.equal(redistributed.overallPercentage, 90);
  assert.equal(redistributed.overallGrade, 'A');
});

test('5. Three-Term End-of-Session calculation preserves Term 1, Term 2, and Term 3 separately and computes annual score', () => {
  const profile = {
    ...createStarterGradingProfiles()[0],
    emptyCategoryPolicy: 'REDISTRIBUTE_APPROVED',
  };

  const terms = [
    { termKey: 'TERM_1', name: 'First Term', startDate: '2026-09-01', endDate: '2026-12-18', status: 'CLOSED' },
    { termKey: 'TERM_2', name: 'Second Term', startDate: '2027-01-04', endDate: '2027-04-09', status: 'CLOSED' },
    { termKey: 'TERM_3', name: 'Third Term', startDate: '2027-04-26', endDate: '2027-07-31', status: 'REPORTING_OPEN' },
  ];

  const sessionEvidence = [
    {
      canonicalWorkId: 't1_exam',
      sourceCollection: 'jdiExamAttempts',
      sourceId: 'att_t1',
      referenceNumber: 'JDI-T1',
      title: 'Term 1 Final Exam',
      subject: 'Robotics',
      programName: 'Developers',
      workType: 'EXAMINATION',
      categoryId: '',
      categoryName: '',
      studentId: 'stu_1',
      studentName: 'Ada Lovelace',
      rawEarnedMarks: 70,
      maxAvailableMarks: 100,
      normalizedPercentage: 70,
      isUngraded: false,
      isReleased: true,
      status: 'GRADED',
      includedInCalculation: false,
      completedAt: '2026-11-20T10:00:00.000Z',
      dueDate: '2026-11-20T10:00:00.000Z',
    },
    {
      canonicalWorkId: 't2_exam',
      sourceCollection: 'jdiExamAttempts',
      sourceId: 'att_t2',
      referenceNumber: 'JDI-T2',
      title: 'Term 2 Final Exam',
      subject: 'Robotics',
      programName: 'Developers',
      workType: 'EXAMINATION',
      categoryId: '',
      categoryName: '',
      studentId: 'stu_1',
      studentName: 'Ada Lovelace',
      rawEarnedMarks: 80,
      maxAvailableMarks: 100,
      normalizedPercentage: 80,
      isUngraded: false,
      isReleased: true,
      status: 'GRADED',
      includedInCalculation: false,
      completedAt: '2027-03-15T10:00:00.000Z',
      dueDate: '2027-03-15T10:00:00.000Z',
    },
    {
      canonicalWorkId: 't3_exam',
      sourceCollection: 'jdiExamAttempts',
      sourceId: 'att_t3',
      referenceNumber: 'JDI-T3',
      title: 'Term 3 Final Exam',
      subject: 'Robotics',
      programName: 'Developers',
      workType: 'EXAMINATION',
      categoryId: '',
      categoryName: '',
      studentId: 'stu_1',
      studentName: 'Ada Lovelace',
      rawEarnedMarks: 90,
      maxAvailableMarks: 100,
      normalizedPercentage: 90,
      isUngraded: false,
      isReleased: true,
      status: 'GRADED',
      includedInCalculation: false,
      completedAt: '2027-06-20T10:00:00.000Z',
      dueDate: '2027-06-20T10:00:00.000Z',
    },
  ];

  const sessionOut = calculateSessionThreeTermPerformance({
    evidenceItems: sessionEvidence,
    profile,
    terms,
    sessionStartDate: '2026-09-01',
    sessionEndDate: '2027-07-31',
    attendanceByTerm: {
      TERM_1: emptyAttendance,
      TERM_2: emptyAttendance,
      TERM_3: emptyAttendance,
    },
    overallAttendance: emptyAttendance,
    milestoneSummary: emptyMilestones,
    approveWeightRedistribution: true,
  });

  assert.equal(sessionOut.termBreakdowns.length, 3);
  assert.equal(sessionOut.termBreakdowns[0].overallPercentage, 70);
  assert.equal(sessionOut.termBreakdowns[1].overallPercentage, 80);
  assert.equal(sessionOut.termBreakdowns[1].deltaFromPreviousTerm, 10);
  assert.equal(sessionOut.termBreakdowns[2].overallPercentage, 90);
  assert.equal(sessionOut.termBreakdowns[2].deltaFromPreviousTerm, 10);
  // Equal weighting across 70%, 80%, 90% -> 80%
  assert.equal(Math.round(sessionOut.overallPercentage), 80);
  assert.equal(sessionOut.overallGrade, 'A');
});

test('6. Reference allocation & normalization preserves existing JDI-* references and generates deterministic prefixes', () => {
  assert.equal(normalizeReferenceCode('  jdi-bxi45efvxw26 '), 'JDI-BXI45EFVXW26');

  const preserved = allocateReportReferenceNumber({
    existingRef: 'JDI-BXI45EFVXW26',
    reportType: 'SCHOOL_TERM',
    studentId: 'stu_1',
    periodId: 'per_1',
  });
  assert.equal(preserved, 'JDI-BXI45EFVXW26');

  const termRef1 = allocateReportReferenceNumber({
    reportType: 'SCHOOL_TERM',
    studentId: 'stu_1',
    periodId: 'per_2026',
    termKey: 'TERM_1',
    version: 1,
  });
  const termRef2 = allocateReportReferenceNumber({
    reportType: 'SCHOOL_TERM',
    studentId: 'stu_1',
    periodId: 'per_2026',
    termKey: 'TERM_1',
    version: 1,
  });
  assert.equal(termRef1, termRef2);
  assert.equal(termRef1.startsWith('JDI-TRM-'), true);

  const sessionRef = allocateReportReferenceNumber({
    reportType: 'SCHOOL_SESSION',
    studentId: 'stu_1',
    periodId: 'per_2026',
  });
  assert.equal(sessionRef.startsWith('JDI-SES-'), true);

  const progRef = allocateReportReferenceNumber({
    reportType: 'PRIVATE_PROGRAMME',
    studentId: 'stu_2',
    periodId: 'per_prog',
  });
  assert.equal(progRef.startsWith('JDI-PRG-'), true);

  const annRef = allocateReportReferenceNumber({
    reportType: 'PRIVATE_ANNUAL',
    studentId: 'stu_2',
    periodId: 'per_ann',
  });
  assert.equal(annRef.startsWith('JDI-ANN-'), true);
});
