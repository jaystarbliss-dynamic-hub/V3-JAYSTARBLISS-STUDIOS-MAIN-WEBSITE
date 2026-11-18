export type AcademicReportType =
  | 'SCHOOL_TERM'
  | 'SCHOOL_SESSION'
  | 'PRIVATE_PROGRAMME'
  | 'PRIVATE_ANNUAL';

export type AcademicEnrolmentCategory =
  | 'school'
  | 'private_parent'
  | 'private_individual';

export type AcademicTermKey = 'TERM_1' | 'TERM_2' | 'TERM_3';

export type AcademicPeriodStatus = 'UPCOMING' | 'ACTIVE' | 'REPORTING_OPEN' | 'CLOSED';

export interface AcademicTermConfig {
  termKey: AcademicTermKey;
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  status: AcademicPeriodStatus;
  notes?: string;
}

export interface AcademicPeriodRecord {
  id: string;
  periodCategory: 'SCHOOL_SESSION' | 'PRIVATE_PROGRAMME' | 'PRIVATE_ANNUAL';
  sessionName: string;
  schoolId?: string;
  schoolName?: string;
  studentId?: string;
  studentName?: string;
  programId?: string;
  programName?: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  status: AcademicPeriodStatus;
  terms: AcademicTermConfig[];
  notes?: string;
  createdBy: string;
  createdByName: string;
  updatedBy: string;
  updatedByName: string;
  createdAt: string;
  updatedAt: string;
}

export type CategoryAggregationMethod = 'TOTAL_MARKS' | 'PERCENTAGE_AVERAGE';

export type AcademicWorkSourceType =
  | 'ASSIGNMENT'
  | 'PROJECT'
  | 'ACTIVITY'
  | 'QUIZ'
  | 'TEST'
  | 'MID_TERM'
  | 'PRACTICAL'
  | 'EXAMINATION'
  | 'CUSTOM';

export interface GradingCategoryConfig {
  id: string;
  name: string;
  weight: number; // 0 - 100
  aggregationMethod: CategoryAggregationMethod;
  sourceWorkTypes: AcademicWorkSourceType[];
  enabled: boolean;
  description?: string;
}

export interface GradeBoundaryConfig {
  grade: string;
  minPercentage: number;
  maxPercentage: number;
  label: string;
  isPass: boolean;
}

export type MissingWorkPolicy =
  | 'FLAG_INCOMPLETE'
  | 'EXCLUDE'
  | 'ZERO_AFTER_DUE';

export type EmptyCategoryPolicy =
  | 'RETAIN_AND_FLAG'
  | 'REDISTRIBUTE_APPROVED';

export type SessionCalculationMethod =
  | 'EQUAL_TERM_WEIGHTS'
  | 'CUSTOM_TERM_WEIGHTS'
  | 'CUMULATIVE_SESSION';

export type GradingProfileScopeType =
  | 'SCHOOL'
  | 'CLASS'
  | 'PROGRAMME'
  | 'LEARNER_OVERRIDE';

export interface AcademicGradingProfile {
  id: string;
  name: string;
  description?: string;
  scopeType: GradingProfileScopeType;
  enrolmentTarget: 'SCHOOL' | 'PRIVATE' | 'ALL';
  schoolId?: string;
  schoolName?: string;
  className?: string;
  programId?: string;
  programName?: string;
  studentId?: string;
  studentName?: string;
  parentProfileId?: string;
  parentProfileName?: string;
  overrideReason?: string;
  version: number;
  categories: GradingCategoryConfig[];
  gradeBoundaries: GradeBoundaryConfig[];
  passMark: number;
  missingWorkPolicy: MissingWorkPolicy;
  emptyCategoryPolicy: EmptyCategoryPolicy;
  sessionCalculationMethod: SessionCalculationMethod;
  termWeights: {
    TERM_1: number;
    TERM_2: number;
    TERM_3: number;
  };
  includeAttendanceInGrade: boolean;
  attendanceWeight: number;
  isDefaultPreset?: boolean;
  createdBy: string;
  createdByName: string;
  updatedBy: string;
  updatedByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface AcademicEvidenceItem {
  canonicalWorkId: string;
  sourceCollection:
    | 'jdiExams'
    | 'schoolExams'
    | 'jdiExamAttempts'
    | 'assignments'
    | 'assignmentSubmissions'
    | 'academic_assessments';
  sourceId: string;
  examId?: string;
  attemptId?: string;
  assignmentId?: string;
  submissionId?: string;
  referenceNumber: string;
  title: string;
  subject: string;
  programName: string;
  workType: AcademicWorkSourceType;
  categoryId: string;
  categoryName: string;
  studentId: string;
  studentName: string;
  schoolId?: string;
  className?: string;
  rawEarnedMarks: number | null;
  maxAvailableMarks: number;
  normalizedPercentage: number | null;
  isUngraded: boolean;
  isReleased: boolean;
  status: 'GRADED' | 'PENDING_REVIEW' | 'MISSING' | 'UNGRADED_ACTIVITY' | 'EXCLUDED';
  includedInCalculation: boolean;
  exclusionReason?: string;
  completedAt: string | null;
  dueDate: string | null;
  termKey?: AcademicTermKey;
  tutorFeedback?: string;
}

export interface CategoryCalculationResult {
  categoryId: string;
  categoryName: string;
  aggregationMethod: CategoryAggregationMethod;
  configuredWeight: number;
  effectiveWeight: number;
  rawEarnedTotal: number;
  maxAvailableTotal: number;
  categoryPercentage: number | null;
  weightedContribution: number;
  includedCount: number;
  pendingCount: number;
  missingCount: number;
  excludedCount: number;
  isEmpty: boolean;
  items: AcademicEvidenceItem[];
}

export interface SubjectPerformanceSummary {
  subject: string;
  programName?: string;
  assessmentCount: number;
  rawEarnedTotal: number;
  maxAvailableTotal: number;
  averagePercentage: number;
  grade: string;
  classification: string;
}

export interface ProgrammePerformanceSummary {
  programId: string;
  programName: string;
  startDate?: string;
  completionDate?: string;
  status: string;
  tutorName?: string;
  assessmentCount: number;
  assignmentCount: number;
  completedMilestones: number;
  totalMilestones: number;
  overallPercentage: number | null;
  grade: string;
  classification: string;
  skillsAcquired: string[];
}

export interface AttendanceRecordItem {
  id: string;
  date: string;
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
  title?: string;
  notes?: string;
}

export interface AttendancePeriodSummary {
  totalSessions: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
  attendanceRate: number | null;
  records: AttendanceRecordItem[];
}

export interface MilestoneRecordItem {
  id: string;
  title: string;
  moduleName?: string;
  programName?: string;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING';
  completedAt?: string | null;
  skills?: string[];
  notes?: string;
}

export interface MilestonePeriodSummary {
  totalMilestones: number;
  completedCount: number;
  inProgressCount: number;
  pendingCount: number;
  completionRate: number | null;
  skillsAcquired: string[];
  items: MilestoneRecordItem[];
}

export interface TermComparisonItem {
  termKey: AcademicTermKey;
  termName: string;
  startDate: string;
  endDate: string;
  overallPercentage: number | null;
  grade: string;
  classification: string;
  gradedAssessmentCount: number;
  completedAssignmentCount: number;
  attendanceRate: number | null;
  configuredTermWeight: number;
  weightedAnnualContribution: number;
  deltaFromPreviousTerm: number | null;
  categoryResults: CategoryCalculationResult[];
}

export interface TutorReportRemarks {
  strengths: string;
  areasForImprovement: string;
  generalFeedback: string;
  nextStageRecommendation: string;
  completionRecommendation?: 'COMPLETED' | 'IN_PROGRESS' | 'NEEDS_EXTENDED_PRACTICE';
  certifiedCompleted?: boolean;
}

export interface ReportContentInclusionOptions {
  includeDetailedAssessments: boolean;
  includeAssignmentsAndProjects: boolean;
  includeActivities: boolean;
  includeAttendance: boolean;
  includeMilestones: boolean;
  includeTutorRemarks: boolean;
  includeSubjectBreakdown: boolean;
  includeGraphicalAnalysis: boolean;
}

export interface CalculationAuditBreakdown {
  totalRecordsInspected: number;
  includedRecordsCount: number;
  excludedRecordsCount: number;
  pendingReviewCount: number;
  missingWorkCount: number;
  ungradedActivitiesCount: number;
  weightRedistributed: boolean;
  redistributionApprovedBy?: string;
  redistributionReason?: string;
  categoryResults: CategoryCalculationResult[];
  includedItems: AcademicEvidenceItem[];
  excludedItems: AcademicEvidenceItem[];
  warnings: string[];
}

export interface AcademicPerformanceReportSnapshot {
  id: string;
  reportRef: string;
  normalizedRef: string;
  reportType: AcademicReportType;
  status: 'DRAFT' | 'REVIEWED' | 'ISSUED' | 'SUPERSEDED';
  version: number;
  supersedesReportId?: string | null;
  supersedesReportRef?: string | null;
  supersededByReportId?: string | null;
  correctionReason?: string | null;

  // Learner & Enrolment Identity
  studentId: string;
  studentName: string;
  studentCode?: string;
  studentEmail?: string;
  enrolmentCategory: AcademicEnrolmentCategory;
  enrolmentLabel: string;
  schoolId?: string;
  schoolName?: string;
  className: string;
  programId?: string;
  programName: string;
  programStartDate?: string;
  programCompletionDate?: string;
  assignedTutorId?: string;
  assignedTutorName?: string;
  parentId?: string;
  parentName?: string;

  // Academic Period
  periodId: string;
  periodLabel: string;
  sessionName: string;
  termKey?: AcademicTermKey;
  termName?: string;
  periodStartDate: string;
  periodEndDate: string;

  // Grading Profile Snapshot
  gradingProfileId: string;
  gradingProfileName: string;
  gradingProfileVersion: number;
  gradingProfileScope: GradingProfileScopeType;
  isLearnerOverride: boolean;
  gradingProfileSnapshot: AcademicGradingProfile;

  // Calculated Performance
  overallPercentage: number | null;
  overallGrade: string;
  classification: string;
  isPass: boolean;
  isComplete: boolean;
  calculationBreakdown: CalculationAuditBreakdown;
  termBreakdowns?: TermComparisonItem[];
  subjectBreakdowns: SubjectPerformanceSummary[];
  programmeBreakdowns: ProgrammePerformanceSummary[];
  attendanceSummary: AttendancePeriodSummary;
  milestoneSummary: MilestonePeriodSummary;
  tutorRemarks: TutorReportRemarks;
  includeOptions: ReportContentInclusionOptions;

  // Audit & Timestamps
  generatedBy: string;
  generatedByName: string;
  generatedByRole: string;
  generatedAt: string;
  issuedBy?: string | null;
  issuedByName?: string | null;
  issuedByRole?: string | null;
  issuedAt?: string | null;
  updatedAt: string;
}

export type LookupRecordClassification =
  | 'ASSESSMENT'
  | 'ASSESSMENT_ATTEMPT_REPORT'
  | 'SCHOOL_TERM_REPORT'
  | 'SCHOOL_SESSION_REPORT'
  | 'PRIVATE_PROGRAMME_REPORT'
  | 'PRIVATE_ANNUAL_REPORT';

export interface AcademicReferenceLookupItem {
  refNo: string;
  normalizedRef: string;
  recordType: LookupRecordClassification;
  recordTypeLabel: string;
  title: string;
  studentId?: string;
  studentName: string;
  enrolmentCategory: AcademicEnrolmentCategory | 'school_wide';
  enrolmentLabel: string;
  schoolId?: string;
  schoolName?: string;
  className: string;
  programName: string;
  periodLabel: string;
  generatedAt: string;
  status: string;
  scoreSummary: string;
  percentage: number | null;
  grade: string;
  version: number;
  sourceCollection: string;
  sourceId: string;
  examId?: string;
  attemptId?: string;
  reportSnapshot?: AcademicPerformanceReportSnapshot;
  rawAssessmentData?: Record<string, any>;
  rawAttemptData?: Record<string, any>;
}

export type AcademicAuditActionType =
  | 'PROFILE_CREATED'
  | 'PROFILE_UPDATED'
  | 'LEARNER_OVERRIDE_CREATED'
  | 'LEARNER_OVERRIDE_RESET'
  | 'WEIGHT_REDISTRIBUTION_APPROVED'
  | 'PERIOD_CONFIGURED'
  | 'REPORT_CALCULATED'
  | 'REPORT_PREVIEWED'
  | 'REPORT_ISSUED'
  | 'REPORT_CORRECTED_REISSUED'
  | 'REFERENCE_MIGRATED';

export interface AcademicAuditLogEntry {
  id: string;
  actionType: AcademicAuditActionType;
  actorUid: string;
  actorName: string;
  actorRole: string;
  schoolId?: string;
  studentId?: string;
  programId?: string;
  targetId: string;
  targetRef?: string;
  summary: string;
  reason?: string;
  previousConfig?: Record<string, any> | null;
  newConfig?: Record<string, any> | null;
  timestamp: string;
}

export interface ReportAuthorityContext {
  uid: string;
  email: string;
  name: string;
  role: string;
  isPlatformAdmin: boolean;
  isAuthorizedTutor: boolean;
  isSchoolAdmin: boolean;
  isParent: boolean;
  isStudent: boolean;
  canConfigureGradingAndIssueReports: boolean;
  authorizedSchoolIds: Set<string>;
  authorizedSchoolNames: Set<string>;
  authorizedStudentIds: Set<string>;
  authorizedClassesBySchool: Map<string, Set<string>>;
  parentLinkedStudentIds: Set<string>;
  ownStudentIds: Set<string>;
}
