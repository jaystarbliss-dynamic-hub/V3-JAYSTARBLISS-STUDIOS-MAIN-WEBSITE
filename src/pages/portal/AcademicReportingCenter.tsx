import React, { useEffect, useMemo, useState } from 'react';
import {
  FileText,
  Search,
  Sliders,
  Calendar,
  Sparkles,
  CheckCircle2,
  History,
  Download,
  Archive,
  Plus,
  Trash2,
  AlertTriangle,
  Eye,
  RefreshCw,
  ShieldAlert,
  RotateCcw,
  Check,
  X,
} from 'lucide-react';
import {
  type AcademicAuditLogEntry,
  type AcademicGradingProfile,
  type AcademicPerformanceReportSnapshot,
  type AcademicPeriodRecord,
  type AcademicReportType,
  type AcademicTermKey,
  type AcademicWorkSourceType,
  type GradeBoundaryConfig,
  type GradingCategoryConfig,
  type ReportAuthorityContext,
  type ReportContentInclusionOptions,
  type ReportingLearnerDirectoryItem,
  type ReportingSchoolDirectoryItem,
  DEFAULT_JDI_CATEGORIES,
  DEFAULT_JDI_GRADE_BOUNDARIES,
  buildAndPreviewLearnerReport,
  createCorrectedReportVersion,
  downloadBulkOfficialReportsZip,
  fetchAcademicAuditLogs,
  fetchAcademicPeriods,
  fetchAcademicReports,
  fetchGradingProfiles,
  fetchReportingLearnersAndSchools,
  generateOfficialPerformanceReportPdf,
  getReportTypeLabel,
  issueOfficialReportsBatch,
  resetLearnerGradingOverride,
  resolveEffectiveGradingProfileForLearner,
  resolveReportAuthorityContext,
  saveAcademicPeriod,
  saveGradingProfile,
  saveReportSnapshot,
  validateCategoryWeights,
  validateGradeBoundaries,
} from '../../lib/academic-reporting';
import { ReferenceLookupPanel } from '../../components/academic-reporting/ReferenceLookupPanel';

type ReportingTabKey =
  | 'OVERVIEW'
  | 'LOOKUP'
  | 'PROFILES'
  | 'PERIODS'
  | 'GENERATE'
  | 'ISSUED'
  | 'HISTORY';

const ALL_WORK_TYPES: AcademicWorkSourceType[] = [
  'ASSIGNMENT',
  'PROJECT',
  'ACTIVITY',
  'PRACTICAL',
  'QUIZ',
  'TEST',
  'MID_TERM',
  'EXAMINATION',
];

export const AcademicReportingCenter: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ReportingTabKey>('OVERVIEW');
  const [authority, setAuthority] = useState<ReportAuthorityContext | null>(null);
  const [schools, setSchools] = useState<ReportingSchoolDirectoryItem[]>([]);
  const [learners, setLearners] = useState<ReportingLearnerDirectoryItem[]>([]);
  const [programmes, setProgrammes] = useState<string[]>([]);
  const [profiles, setProfiles] = useState<AcademicGradingProfile[]>([]);
  const [periods, setPeriods] = useState<AcademicPeriodRecord[]>([]);
  const [reports, setReports] = useState<AcademicPerformanceReportSnapshot[]>([]);
  const [auditLogs, setAuditLogs] = useState<AcademicAuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [bannerMessage, setBannerMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // ============================================================================
  // GRADING PROFILE BUILDER STATE
  // ============================================================================
  const [editingProfileId, setEditingProfileId] = useState<string>('');
  const [profName, setProfName] = useState('School Standard Grading Profile');
  const [profDesc, setProfDesc] = useState('');
  const [profScope, setProfScope] = useState<AcademicGradingProfile['scopeType']>('SCHOOL');
  const [profSchoolName, setProfSchoolName] = useState('');
  const [profClassName, setProfClassName] = useState('');
  const [profProgramName, setProfProgramName] = useState('');
  const [profStudentId, setProfStudentId] = useState('');
  const [profOverrideReason, setProfOverrideReason] = useState('');
  const [profPassMark, setProfPassMark] = useState<number>(45);
  const [profMissingPolicy, setProfMissingPolicy] =
    useState<AcademicGradingProfile['missingWorkPolicy']>('FLAG_INCOMPLETE');
  const [profEmptyCatPolicy, setProfEmptyCatPolicy] =
    useState<AcademicGradingProfile['emptyCategoryPolicy']>('RETAIN_AND_FLAG');
  const [profSessionMethod, setProfSessionMethod] =
    useState<AcademicGradingProfile['sessionCalculationMethod']>('EQUAL_TERM_WEIGHTS');
  const [profTermWeights, setProfTermWeights] = useState({
    TERM_1: 33.33,
    TERM_2: 33.33,
    TERM_3: 33.34,
  });
  const [profCategories, setProfCategories] = useState<GradingCategoryConfig[]>(
    DEFAULT_JDI_CATEGORIES.map((c) => ({ ...c }))
  );
  const [profBoundaries, setProfBoundaries] = useState<GradeBoundaryConfig[]>(
    DEFAULT_JDI_GRADE_BOUNDARIES.map((b) => ({ ...b }))
  );
  const [savingProfile, setSavingProfile] = useState(false);

  // ============================================================================
  // ACADEMIC PERIOD CONFIGURATION STATE
  // ============================================================================
  const [periodCategory, setPeriodCategory] =
    useState<AcademicPeriodRecord['periodCategory']>('SCHOOL_SESSION');
  const [periodSessionName, setPeriodSessionName] = useState('2026/2027 Academic Session');
  const [periodSchoolName, setPeriodSchoolName] = useState('');
  const [periodProgramName, setPeriodProgramName] = useState('');
  const [periodStartDate, setPeriodStartDate] = useState('2026-09-01');
  const [periodEndDate, setPeriodEndDate] = useState('2027-07-31');
  const [periodStatus, setPeriodStatus] =
    useState<AcademicPeriodRecord['status']>('REPORTING_OPEN');
  const [term1Start, setTerm1Start] = useState('2026-09-01');
  const [term1End, setTerm1End] = useState('2026-12-18');
  const [term2Start, setTerm2Start] = useState('2027-01-04');
  const [term2End, setTerm2End] = useState('2027-04-09');
  const [term3Start, setTerm3Start] = useState('2027-04-26');
  const [term3End, setTerm3End] = useState('2027-07-31');
  const [savingPeriod, setSavingPeriod] = useState(false);

  // ============================================================================
  // REPORT GENERATOR WORKFLOW STATE
  // ============================================================================
  const [genReportType, setGenReportType] = useState<AcademicReportType>('SCHOOL_TERM');
  const [genScopeMode, setGenScopeMode] = useState<'SINGLE_LEARNER' | 'SCHOOL_CLASS' | 'PROGRAMME'>(
    'SINGLE_LEARNER'
  );
  const [genSchoolName, setGenSchoolName] = useState('');
  const [genClassName, setGenClassName] = useState('');
  const [genProgramName, setGenProgramName] = useState('');
  const [genLearnerId, setGenLearnerId] = useState('');
  const [genPeriodId, setGenPeriodId] = useState('');
  const [genTermKey, setGenTermKey] = useState<AcademicTermKey>('TERM_1');
  const [genProfileId, setGenProfileId] = useState('');
  const [genApproveWeightRedistribution, setGenApproveWeightRedistribution] = useState(false);
  const [genRedistributionReason, setGenRedistributionReason] = useState('');
  const [genIncludeOptions, setGenIncludeOptions] = useState<ReportContentInclusionOptions>({
    includeDetailedAssessments: true,
    includeAssignmentsAndProjects: true,
    includeActivities: true,
    includeAttendance: true,
    includeMilestones: true,
    includeTutorRemarks: true,
    includeSubjectBreakdown: true,
    includeGraphicalAnalysis: true,
  });
  const [previewSnapshots, setPreviewSnapshots] = useState<AcademicPerformanceReportSnapshot[]>([]);
  const [calculatingPreviews, setCalculatingPreviews] = useState(false);
  const [issuingBatch, setIssuingBatch] = useState(false);
  const [activePreviewModal, setActivePreviewModal] =
    useState<AcademicPerformanceReportSnapshot | null>(null);

  // ============================================================================
  // ISSUED REPORTS & REISSUE FILTER STATE
  // ============================================================================
  const [filterReportType, setFilterReportType] = useState<string>('ALL');
  const [filterSchool, setFilterSchool] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterSearch, setFilterSearch] = useState<string>('');
  const [reissueTarget, setReissueTarget] = useState<AcademicPerformanceReportSnapshot | null>(
    null
  );
  const [reissueReason, setReissueReason] = useState('');
  const [reissueFeedback, setReissueFeedback] = useState('');
  const [reissuing, setReissuing] = useState(false);

  const loadWorkspaceData = async () => {
    setLoading(true);
    try {
      const authCtx = await resolveReportAuthorityContext();
      setAuthority(authCtx);

      if (!authCtx.canConfigureGradingAndIssueReports) {
        setLoading(false);
        return;
      }

      const [dir, loadedProfiles, loadedPeriods, loadedReports, loadedLogs] = await Promise.all([
        fetchReportingLearnersAndSchools(authCtx),
        fetchGradingProfiles(authCtx),
        fetchAcademicPeriods(authCtx),
        fetchAcademicReports({ includeDraftsAndSuperseded: true, authority: authCtx }),
        fetchAcademicAuditLogs(authCtx),
      ]);

      setSchools(dir.schools);
      setLearners(dir.learners);
      setProgrammes(dir.programmes);
      setProfiles(loadedProfiles);
      setPeriods(loadedPeriods);
      setReports(loadedReports);
      setAuditLogs(loadedLogs);

      if (!genPeriodId && loadedPeriods.length > 0) {
        setGenPeriodId(loadedPeriods[0].id);
      }
      if (!genProfileId && loadedProfiles.length > 0) {
        setGenProfileId(loadedProfiles[0].id);
      }
      if (!genLearnerId && dir.learners.length > 0) {
        setGenLearnerId(dir.learners[0].id);
      }
      if (!genSchoolName && dir.schools.length > 0) {
        setGenSchoolName(dir.schools[0].name);
      }
      if (!genProgramName && dir.programmes.length > 0) {
        setGenProgramName(dir.programmes[0]);
      }
    } catch (err: any) {
      setBannerMessage({
        type: 'error',
        text: err?.message || 'Failed to load Academic Reporting workspace.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkspaceData();
  }, []);

  // Load selected grading profile into editor
  const handleSelectProfileForEdit = (prof: AcademicGradingProfile) => {
    setEditingProfileId(prof.id);
    setProfName(prof.name);
    setProfDesc(prof.description || '');
    setProfScope(prof.scopeType);
    setProfSchoolName(prof.schoolName || '');
    setProfClassName(prof.className || '');
    setProfProgramName(prof.programName || '');
    setProfStudentId(prof.studentId || '');
    setProfOverrideReason(prof.overrideReason || '');
    setProfPassMark(prof.passMark);
    setProfMissingPolicy(prof.missingWorkPolicy);
    setProfEmptyCatPolicy(prof.emptyCategoryPolicy);
    setProfSessionMethod(prof.sessionCalculationMethod);
    setProfTermWeights(prof.termWeights || { TERM_1: 33.33, TERM_2: 33.33, TERM_3: 33.34 });
    setProfCategories(prof.categories.map((c) => ({ ...c })));
    setProfBoundaries(prof.gradeBoundaries.map((b) => ({ ...b })));
  };

  const weightCheck = useMemo(() => validateCategoryWeights(profCategories), [profCategories]);
  const boundaryCheck = useMemo(() => validateGradeBoundaries(profBoundaries), [profBoundaries]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authority) return;
    setSavingProfile(true);
    setBannerMessage(null);
    try {
      const targetLearner = learners.find((l) => l.id === profStudentId);
      const saved = await saveGradingProfile(
        {
          id: editingProfileId || undefined,
          name: profName,
          description: profDesc,
          scopeType: profScope,
          enrolmentTarget:
            profScope === 'PROGRAMME'
              ? 'PRIVATE'
              : profScope === 'SCHOOL' || profScope === 'CLASS'
              ? 'SCHOOL'
              : 'ALL',
          schoolId: profSchoolName || undefined,
          schoolName: profSchoolName || undefined,
          className: profClassName || undefined,
          programId: profProgramName
            ? profProgramName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
            : undefined,
          programName: profProgramName || undefined,
          studentId: profScope === 'LEARNER_OVERRIDE' ? profStudentId : undefined,
          studentName: profScope === 'LEARNER_OVERRIDE' ? targetLearner?.fullName : undefined,
          overrideReason: profScope === 'LEARNER_OVERRIDE' ? profOverrideReason : undefined,
          categories: profCategories,
          gradeBoundaries: profBoundaries,
          passMark: profPassMark,
          missingWorkPolicy: profMissingPolicy,
          emptyCategoryPolicy: profEmptyCatPolicy,
          sessionCalculationMethod: profSessionMethod,
          termWeights: profTermWeights,
        },
        authority
      );
      setBannerMessage({
        type: 'success',
        text: `Saved grading profile "${saved.name}" (Version v${saved.version}).`,
      });
      await loadWorkspaceData();
    } catch (err: any) {
      setBannerMessage({
        type: 'error',
        text: err?.message || 'Unable to save grading profile.',
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSavePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authority) return;
    setSavingPeriod(true);
    setBannerMessage(null);
    try {
      const saved = await saveAcademicPeriod(
        {
          periodCategory,
          sessionName: periodSessionName,
          schoolId: periodSchoolName || undefined,
          schoolName: periodSchoolName || undefined,
          programName: periodProgramName || undefined,
          startDate: periodStartDate,
          endDate: periodEndDate,
          status: periodStatus,
          terms:
            periodCategory === 'SCHOOL_SESSION'
              ? [
                  {
                    termKey: 'TERM_1',
                    name: 'First Term',
                    startDate: term1Start,
                    endDate: term1End,
                    status: 'REPORTING_OPEN',
                  },
                  {
                    termKey: 'TERM_2',
                    name: 'Second Term',
                    startDate: term2Start,
                    endDate: term2End,
                    status: 'ACTIVE',
                  },
                  {
                    termKey: 'TERM_3',
                    name: 'Third Term',
                    startDate: term3Start,
                    endDate: term3End,
                    status: 'UPCOMING',
                  },
                ]
              : [],
        },
        authority
      );
      setGenPeriodId(saved.id);
      setBannerMessage({
        type: 'success',
        text: `Saved academic period "${saved.sessionName}" (${saved.startDate} to ${saved.endDate}).`,
      });
      await loadWorkspaceData();
    } catch (err: any) {
      setBannerMessage({
        type: 'error',
        text: err?.message || 'Unable to save academic period.',
      });
    } finally {
      setSavingPeriod(false);
    }
  };

  // Eligible learners for current report generation selection
  const targetGenerationLearners = useMemo(() => {
    const isSchoolReport = genReportType === 'SCHOOL_TERM' || genReportType === 'SCHOOL_SESSION';
    const basePool = learners.filter((l) =>
      isSchoolReport ? l.enrolmentCategory === 'school' : l.enrolmentCategory !== 'school'
    );

    if (genScopeMode === 'SINGLE_LEARNER') {
      const chosen = basePool.find((l) => l.id === genLearnerId) || basePool[0];
      return chosen ? [chosen] : [];
    }
    if (genScopeMode === 'SCHOOL_CLASS') {
      return basePool.filter((l) => {
        const schoolOk =
          !genSchoolName || l.schoolName.toLowerCase() === genSchoolName.toLowerCase();
        const classOk = !genClassName || l.className.toLowerCase() === genClassName.toLowerCase();
        return schoolOk && classOk;
      });
    }
    if (genScopeMode === 'PROGRAMME') {
      return basePool.filter(
        (l) => !genProgramName || l.programName.toLowerCase() === genProgramName.toLowerCase()
      );
    }
    return basePool;
  }, [
    learners,
    genReportType,
    genScopeMode,
    genLearnerId,
    genSchoolName,
    genClassName,
    genProgramName,
  ]);

  const handleCalculateAndPreview = async () => {
    if (!authority) return;
    if (targetGenerationLearners.length === 0) {
      setBannerMessage({
        type: 'error',
        text: 'No eligible learners match the selected report type and cohort scope.',
      });
      return;
    }

    const activePeriod =
      periods.find((p) => p.id === genPeriodId) ||
      periods.find((p) =>
        genReportType === 'SCHOOL_TERM' || genReportType === 'SCHOOL_SESSION'
          ? p.periodCategory === 'SCHOOL_SESSION'
          : genReportType === 'PRIVATE_PROGRAMME'
          ? p.periodCategory === 'PRIVATE_PROGRAMME'
          : p.periodCategory === 'PRIVATE_ANNUAL'
      ) ||
      periods[0];

    if (!activePeriod) {
      setBannerMessage({
        type: 'error',
        text: 'Please select or configure an Academic Period first.',
      });
      return;
    }

    setCalculatingPreviews(true);
    setBannerMessage(null);
    try {
      const previews: AcademicPerformanceReportSnapshot[] = [];
      for (const learner of targetGenerationLearners) {
        const effectiveProfile = resolveEffectiveGradingProfileForLearner(
          learner,
          profiles,
          genProfileId
        );
        const snap = await buildAndPreviewLearnerReport({
          reportType: genReportType,
          learner,
          period: activePeriod,
          termKey: genReportType === 'SCHOOL_TERM' ? genTermKey : undefined,
          gradingProfile: effectiveProfile,
          includeOptions: genIncludeOptions,
          approveWeightRedistribution: genApproveWeightRedistribution,
          redistributionReason: genRedistributionReason || undefined,
          authority,
        });
        previews.push(snap);
      }
      setPreviewSnapshots(previews);
      setBannerMessage({
        type: 'success',
        text: `Calculated and previewed ${previews.length} official report(s). Review individual calculations and remarks below before issuing.`,
      });
    } catch (err: any) {
      setBannerMessage({
        type: 'error',
        text: err?.message || 'Error calculating performance reports.',
      });
    } finally {
      setCalculatingPreviews(false);
    }
  };

  const handleUpdatePreviewRemark = (
    reportId: string,
    field: keyof AcademicPerformanceReportSnapshot['tutorRemarks'],
    value: any
  ) => {
    setPreviewSnapshots((prev) =>
      prev.map((snap) =>
        snap.id === reportId
          ? {
              ...snap,
              tutorRemarks: {
                ...snap.tutorRemarks,
                [field]: value,
              },
            }
          : snap
      )
    );
  };

  const handleIssueOfficialReports = async (snapshotsToIssue: AcademicPerformanceReportSnapshot[]) => {
    if (!authority || snapshotsToIssue.length === 0) return;
    setIssuingBatch(true);
    setBannerMessage(null);
    try {
      const issued = await issueOfficialReportsBatch(snapshotsToIssue, authority);
      setPreviewSnapshots((prev) =>
        prev.map((p) => {
          const match = issued.find((i) => i.id === p.id);
          return match || p;
        })
      );
      setBannerMessage({
        type: 'success',
        text: `Officially issued ${issued.length} report(s). Stored references: ${issued
          .slice(0, 3)
          .map((i) => i.reportRef)
          .join(', ')}${issued.length > 3 ? '...' : ''}.`,
      });
      await loadWorkspaceData();
    } catch (err: any) {
      setBannerMessage({
        type: 'error',
        text: err?.message || 'Failed to issue official reports.',
      });
    } finally {
      setIssuingBatch(false);
    }
  };

  const handleSaveDraftSnapshot = async (snap: AcademicPerformanceReportSnapshot) => {
    if (!authority) return;
    try {
      const saved = await saveReportSnapshot(snap, 'DRAFT', authority);
      setPreviewSnapshots((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
      setBannerMessage({
        type: 'success',
        text: `Saved draft snapshot for ${saved.studentName} (${saved.reportRef}).`,
      });
      await loadWorkspaceData();
    } catch (err: any) {
      setBannerMessage({ type: 'error', text: err?.message || 'Failed to save draft.' });
    }
  };

  const handleConfirmReissue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authority || !reissueTarget || !reissueReason.trim()) return;
    setReissuing(true);
    setBannerMessage(null);
    try {
      const newVersion = await createCorrectedReportVersion({
        previousReport: reissueTarget,
        correctionReason: reissueReason.trim(),
        updatedTutorRemarks: reissueFeedback.trim()
          ? { generalFeedback: reissueFeedback.trim() }
          : undefined,
        authority,
      });
      setReissueTarget(null);
      setReissueReason('');
      setReissueFeedback('');
      setBannerMessage({
        type: 'success',
        text: `Issued corrected version v${newVersion.version} (${newVersion.reportRef}) for ${newVersion.studentName}.`,
      });
      await loadWorkspaceData();
      await generateOfficialPerformanceReportPdf(newVersion);
    } catch (err: any) {
      setBannerMessage({
        type: 'error',
        text: err?.message || 'Unable to issue corrected report.',
      });
    } finally {
      setReissuing(false);
    }
  };

  // KPI Metrics for Overview
  const kpiStats = useMemo(() => {
    const totalGenerated = reports.length;
    const issuedCount = reports.filter((r) => r.status === 'ISSUED').length;
    const draftReviewCount = reports.filter(
      (r) => r.status === 'DRAFT' || r.status === 'REVIEWED'
    ).length;
    const learnersCovered = new Set(reports.map((r) => r.studentId)).size;
    const schoolsCovered = new Set(
      reports.filter((r) => r.schoolName).map((r) => r.schoolName!.toLowerCase())
    ).size;
    const incompleteCount = reports.filter((r) => !r.isComplete && r.status !== 'SUPERSEDED').length;
    const supersededCount = reports.filter((r) => r.status === 'SUPERSEDED').length;

    return {
      totalGenerated,
      issuedCount,
      draftReviewCount,
      learnersCovered,
      schoolsCovered,
      incompleteCount,
      supersededCount,
    };
  }, [reports]);

  const filteredIssuedReports = useMemo(() => {
    return reports.filter((r) => {
      if (filterReportType !== 'ALL' && r.reportType !== filterReportType) return false;
      if (
        filterSchool !== 'ALL' &&
        (r.schoolName || 'Private Enrolment').toLowerCase() !== filterSchool.toLowerCase()
      ) {
        return false;
      }
      if (filterStatus !== 'ALL' && r.status !== filterStatus) return false;
      if (filterSearch.trim()) {
        const q = filterSearch.trim().toLowerCase();
        const hit =
          r.reportRef.toLowerCase().includes(q) ||
          r.studentName.toLowerCase().includes(q) ||
          r.programName.toLowerCase().includes(q) ||
          (r.schoolName || '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [reports, filterReportType, filterSchool, filterStatus, filterSearch]);

  if (loading) {
    return (
      <div className="p-8 text-center text-sm text-[#64748B] dark:text-slate-400">
        Loading Academic Performance, Grading & Official Reporting Centre...
      </div>
    );
  }

  // Strict RBAC guard for unauthorized roles (e.g., School Admins, Parents, Students)
  if (authority && !authority.canConfigureGradingAndIssueReports) {
    return (
      <div className="max-w-2xl mx-auto my-12 p-6 bg-white dark:bg-[#0F172A] border border-red-200 dark:border-red-900/50 rounded-xl text-center space-y-3">
        <ShieldAlert className="w-8 h-8 text-[#B91C1C] mx-auto" />
        <h2 className="text-lg font-bold text-[#0F172A] dark:text-white">
          Restricted Institutional Workspace
        </h2>
        <p className="text-xs text-[#475569] dark:text-slate-400 leading-relaxed">
          All authority over grading configuration, overall performance calculation, and official
          report generation belongs exclusively to Jaystarbliss Platform Administrators and
          Authorized Tutors. School Administrators, Parents, and Students can view and download
          officially released reports from their respective dashboard views.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Top Institutional Header */}
      <div className="bg-white dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-slate-800 rounded-xl p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-widest text-[#B91C1C]">
              JAYSTARBLISS DYNAMIC INSTITUTE • ACADEMIC GOVERNANCE
            </div>
            <h1 className="text-2xl font-bold text-[#0F172A] dark:text-white tracking-tight mt-1">
              Academic Performance, Grading & Official Reporting Centre
            </h1>
            <p className="text-xs text-[#475569] dark:text-slate-400 mt-1 max-w-3xl">
              Configure customizable weighted grading profiles, manage school three-term and private
              programme academic calendars, look up any assessment or official report by{' '}
              <span className="font-mono text-[#0F172A] dark:text-slate-200">JDI-*</span> reference
              number, and issue watermarked End-of-Term, End-of-Session, End-of-Programme, and
              Annual PDF reports.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('LOOKUP')}
              className="px-3.5 py-2 text-xs font-semibold text-[#0F172A] dark:text-white bg-[#F8FAFC] dark:bg-slate-800 hover:bg-[#E2E8F0] dark:hover:bg-slate-700 border border-[#CBD5E1] dark:border-slate-700 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Search className="w-3.5 h-3.5 text-[#B91C1C]" />
              Reference Lookup
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('GENERATE')}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-[#991B1B] rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Generate Official Reports
            </button>
          </div>
        </div>

        {/* 7-Section Navigation Tabs */}
        <div className="mt-6 pt-4 border-t border-[#E2E8F0] dark:border-slate-800 flex flex-wrap gap-1.5">
          {(
            [
              { key: 'OVERVIEW', label: '1. Report Overview', icon: FileText },
              { key: 'LOOKUP', label: '2. Reference Lookup', icon: Search },
              { key: 'PROFILES', label: '3. Grading Profiles', icon: Sliders },
              { key: 'PERIODS', label: '4. Academic Periods', icon: Calendar },
              { key: 'GENERATE', label: '5. Generate Reports', icon: Sparkles },
              { key: 'ISSUED', label: '6. Issued Reports', icon: CheckCircle2 },
              { key: 'HISTORY', label: '7. Report History & Audit', icon: History },
            ] as Array<{ key: ReportingTabKey; label: string; icon: React.ComponentType<any> }>
          ).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[#1E293B] text-white'
                    : 'text-[#475569] dark:text-slate-400 hover:bg-[#F8FAFC] dark:hover:bg-slate-800/60 hover:text-[#0F172A] dark:hover:text-white'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-[#64748B]'}`} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Feedback Banner */}
      {bannerMessage && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs ${
            bannerMessage.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50 text-emerald-800 dark:text-emerald-200'
              : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900/50 text-red-800 dark:text-red-200'
          }`}
        >
          <span className="font-medium">{bannerMessage.text}</span>
          <button
            type="button"
            onClick={() => setBannerMessage(null)}
            className="text-current opacity-70 hover:opacity-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ==========================================================================
          TAB 1: REPORT OVERVIEW
         ========================================================================== */}
      {activeTab === 'OVERVIEW' && (
        <div className="space-y-6">
          {/* Unified Divide-X KPI Strip */}
          <div className="bg-white dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-slate-800 rounded-xl shadow-xs overflow-hidden">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 divide-y sm:divide-y-0 sm:divide-x divide-[#E2E8F0] dark:divide-slate-800">
              <div className="p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
                  Reports Generated
                </div>
                <div className="text-2xl font-bold tabular-nums text-[#0F172A] dark:text-white mt-1">
                  {kpiStats.totalGenerated}
                </div>
                <div className="text-[11px] text-[#64748B] mt-0.5">All snapshots</div>
              </div>
              <div className="p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
                  Reports Released
                </div>
                <div className="text-2xl font-bold tabular-nums text-emerald-600 mt-1">
                  {kpiStats.issuedCount}
                </div>
                <div className="text-[11px] text-[#64748B] mt-0.5">Officially issued</div>
              </div>
              <div className="p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
                  Awaiting Review
                </div>
                <div className="text-2xl font-bold tabular-nums text-[#0F172A] dark:text-white mt-1">
                  {kpiStats.draftReviewCount}
                </div>
                <div className="text-[11px] text-[#64748B] mt-0.5">Draft snapshots</div>
              </div>
              <div className="p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
                  Learners Covered
                </div>
                <div className="text-2xl font-bold tabular-nums text-[#0F172A] dark:text-white mt-1">
                  {kpiStats.learnersCovered}
                </div>
                <div className="text-[11px] text-[#64748B] mt-0.5">
                  Of {learners.length} active
                </div>
              </div>
              <div className="p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
                  Schools Covered
                </div>
                <div className="text-2xl font-bold tabular-nums text-[#0F172A] dark:text-white mt-1">
                  {kpiStats.schoolsCovered}
                </div>
                <div className="text-[11px] text-[#64748B] mt-0.5">
                  Of {schools.length} partner schools
                </div>
              </div>
              <div className="p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
                  Incomplete Flagged
                </div>
                <div className="text-2xl font-bold tabular-nums text-amber-600 mt-1">
                  {kpiStats.incompleteCount}
                </div>
                <div className="text-[11px] text-[#64748B] mt-0.5">Missing category/work</div>
              </div>
              <div className="p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
                  Corrected Versions
                </div>
                <div className="text-2xl font-bold tabular-nums text-[#B91C1C] mt-1">
                  {kpiStats.supersededCount}
                </div>
                <div className="text-[11px] text-[#64748B] mt-0.5">Historical superseded</div>
              </div>
            </div>
          </div>

          {/* 4 Official Report Identities Summary Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {(
              [
                {
                  type: 'SCHOOL_TERM',
                  prefix: 'JDI-TRM-*',
                  title: 'End-of-Term Report (School)',
                  headingRule: 'Registered Partner School Name Heading',
                  desc: 'Evaluates Term 1, Term 2, or Term 3 school performance across weighted categories, subjects, attendance, and tutor remarks.',
                },
                {
                  type: 'SCHOOL_SESSION',
                  prefix: 'JDI-SES-*',
                  title: 'End-of-Session Report (School)',
                  headingRule: 'Registered Partner School Name Heading',
                  desc: 'Compares Term 1, Term 2, and Term 3 progression side-by-side and computes the annual session grade without double-counting.',
                },
                {
                  type: 'PRIVATE_PROGRAMME',
                  prefix: 'JDI-PRG-*',
                  title: 'End-of-Programme Report (Private)',
                  headingRule: 'JAYSTARBLISS DYNAMIC INSTITUTE Heading',
                  desc: 'Evaluates private parent-enrolled or individual learners at programme completion with practical skills, milestones, and certification status.',
                },
                {
                  type: 'PRIVATE_ANNUAL',
                  prefix: 'JDI-ANN-*',
                  title: 'End-of-Year Report (Private)',
                  headingRule: 'JAYSTARBLISS DYNAMIC INSTITUTE Heading',
                  desc: 'Summarises a private learner’s 1-year academic journey with programme-by-programme breakdowns and next learning objectives.',
                },
              ] as Array<{
                type: AcademicReportType;
                prefix: string;
                title: string;
                headingRule: string;
                desc: string;
              }>
            ).map((card) => (
              <div
                key={card.type}
                className="bg-white dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-bold text-[#B91C1C]">{card.prefix}</span>
                    <span className="text-[11px] text-[#64748B] font-medium">
                      {reports.filter((r) => r.reportType === card.type && r.status === 'ISSUED').length}{' '}
                      Issued
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-[#0F172A] dark:text-white mt-2">
                    {card.title}
                  </h3>
                  <div className="text-[11px] font-semibold text-[#1E293B] dark:text-slate-300 mt-1">
                    {card.headingRule}
                  </div>
                  <p className="text-xs text-[#64748B] dark:text-slate-400 mt-2 leading-relaxed">
                    {card.desc}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setGenReportType(card.type);
                    setActiveTab('GENERATE');
                  }}
                  className="mt-4 w-full py-2 text-xs font-semibold text-white bg-[#1E293B] hover:bg-[#0F172A] rounded-lg transition-colors cursor-pointer"
                >
                  Configure & Generate
                </button>
              </div>
            ))}
          </div>

          {/* Embedded Quick Reference Lookup */}
          <ReferenceLookupPanel
            authority={authority || undefined}
            compact
            onReportUpdated={loadWorkspaceData}
            onSelectReportForHistory={() => setActiveTab('HISTORY')}
          />
        </div>
      )}

      {/* ==========================================================================
          TAB 2: REFERENCE LOOKUP
         ========================================================================== */}
      {activeTab === 'LOOKUP' && (
        <ReferenceLookupPanel
          authority={authority || undefined}
          onReportUpdated={loadWorkspaceData}
          onSelectReportForHistory={() => setActiveTab('HISTORY')}
        />
      )}

      {/* ==========================================================================
          TAB 3: GRADING PROFILES (CUSTOMIZABLE GRADING CONFIGURATION BUILDER)
         ========================================================================== */}
      {activeTab === 'PROFILES' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Saved Profiles List */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0] dark:border-slate-800">
                <h3 className="text-sm font-bold text-[#0F172A] dark:text-white">
                  Saved Grading Profiles ({profiles.length})
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setEditingProfileId('');
                    setProfName('New Custom Grading Profile');
                    setProfDesc('');
                    setProfScope('SCHOOL');
                    setProfCategories(DEFAULT_JDI_CATEGORIES.map((c) => ({ ...c })));
                    setProfBoundaries(DEFAULT_JDI_GRADE_BOUNDARIES.map((b) => ({ ...b })));
                  }}
                  className="px-2.5 py-1.5 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-[#991B1B] rounded-md inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New Profile
                </button>
              </div>

              <div className="mt-3 space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
                {profiles.map((prof) => (
                  <div
                    key={prof.id}
                    onClick={() => handleSelectProfileForEdit(prof)}
                    className={`p-3.5 rounded-lg border transition-colors cursor-pointer ${
                      editingProfileId === prof.id
                        ? 'border-[#1E293B] bg-[#F8FAFC] dark:bg-slate-900'
                        : 'border-[#E2E8F0] dark:border-slate-800 hover:bg-[#F8FAFC] dark:hover:bg-slate-900/40'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-[#0F172A] dark:text-white">{prof.name}</span>
                      <span className="font-mono text-[11px] text-[#64748B]">v{prof.version}</span>
                    </div>
                    <div className="text-[11px] text-[#64748B] dark:text-slate-400 mt-1">
                      Scope: <strong className="text-[#0F172A] dark:text-slate-200">{prof.scopeType}</strong>
                      {prof.schoolName ? ` • ${prof.schoolName}` : ''}
                      {prof.className ? ` • ${prof.className}` : ''}
                      {prof.programName ? ` • ${prof.programName}` : ''}
                      {prof.studentName ? ` • Learner: ${prof.studentName}` : ''}
                    </div>
                    <div className="text-[11px] text-[#64748B] mt-1 tabular-nums">
                      {prof.categories.filter((c) => c.enabled).length} categories • Pass Mark:{' '}
                      {prof.passMark}% • Missing: {prof.missingWorkPolicy}
                    </div>

                    {prof.scopeType === 'LEARNER_OVERRIDE' && prof.studentId && (
                      <div className="mt-2 pt-2 border-t border-[#E2E8F0] dark:border-slate-800 flex items-center justify-between">
                        <span className="text-[10px] text-[#B91C1C] font-semibold">
                          Individual Learner Override
                        </span>
                        <button
                          type="button"
                          onClick={async (ev) => {
                            ev.stopPropagation();
                            await resetLearnerGradingOverride(prof.studentId!, authority || undefined);
                            setBannerMessage({
                              type: 'success',
                              text: `Reset individual grading override for ${prof.studentName}.`,
                            });
                            await loadWorkspaceData();
                          }}
                          className="text-[11px] font-semibold text-[#0F172A] dark:text-slate-200 hover:text-[#B91C1C] inline-flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Reset to Default
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Grading Profile Builder Form */}
          <form
            onSubmit={handleSaveProfile}
            className="lg:col-span-8 bg-white dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-slate-800 rounded-xl p-6 space-y-6"
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-[#E2E8F0] dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-[#0F172A] dark:text-white">
                  Grading Configuration Builder
                </h3>
                <p className="text-xs text-[#64748B] dark:text-slate-400">
                  Configure category weights (must total 100%), calculation rules, grade scale
                  boundaries, and missing-work policies.
                </p>
              </div>
              <button
                type="submit"
                disabled={savingProfile || !weightCheck.valid || !boundaryCheck.valid}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-[#991B1B] rounded-lg disabled:opacity-50 cursor-pointer shrink-0"
              >
                {savingProfile
                  ? 'Saving Profile...'
                  : editingProfileId && !editingProfileId.startsWith('preset_')
                  ? 'Save New Profile Version'
                  : 'Save Grading Profile'}
              </button>
            </div>

            {/* Scope & Identity */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                  Profile Name *
                </label>
                <input
                  type="text"
                  required
                  value={profName}
                  onChange={(e) => setProfName(e.target.value)}
                  className="w-full px-3 py-2 bg-[#F8FAFC] dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded-lg text-[#0F172A] dark:text-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                  Profile Scope *
                </label>
                <select
                  value={profScope}
                  onChange={(e) => setProfScope(e.target.value as any)}
                  className="w-full px-3 py-2 bg-[#F8FAFC] dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded-lg text-[#0F172A] dark:text-white"
                >
                  <option value="SCHOOL">Partner School Profile</option>
                  <option value="CLASS">School Class / Cohort Profile</option>
                  <option value="PROGRAMME">Private Programme Profile</option>
                  <option value="LEARNER_OVERRIDE">Individual Learner Override</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                  Minimum Pass Mark (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={profPassMark}
                  onChange={(e) => setProfPassMark(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-[#F8FAFC] dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded-lg text-[#0F172A] dark:text-white tabular-nums"
                />
              </div>

              {(profScope === 'SCHOOL' || profScope === 'CLASS') && (
                <div>
                  <label className="block font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                    Target Partner School
                  </label>
                  <select
                    value={profSchoolName}
                    onChange={(e) => setProfSchoolName(e.target.value)}
                    className="w-full px-3 py-2 bg-[#F8FAFC] dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded-lg text-[#0F172A] dark:text-white"
                  >
                    <option value="">All Partner Schools (Default)</option>
                    {schools.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {profScope === 'CLASS' && (
                <div>
                  <label className="block font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                    Target Class / Grade
                  </label>
                  <input
                    type="text"
                    value={profClassName}
                    onChange={(e) => setProfClassName(e.target.value)}
                    placeholder="e.g. Grade 6 or JSS 2"
                    className="w-full px-3 py-2 bg-[#F8FAFC] dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded-lg text-[#0F172A] dark:text-white"
                  />
                </div>
              )}

              {profScope === 'PROGRAMME' && (
                <div>
                  <label className="block font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                    Target Private Programme
                  </label>
                  <select
                    value={profProgramName}
                    onChange={(e) => setProfProgramName(e.target.value)}
                    className="w-full px-3 py-2 bg-[#F8FAFC] dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded-lg text-[#0F172A] dark:text-white"
                  >
                    <option value="">All Private Programmes</option>
                    {programmes.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {profScope === 'LEARNER_OVERRIDE' && (
                <>
                  <div>
                    <label className="block font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                      Target Individual Learner *
                    </label>
                    <select
                      required
                      value={profStudentId}
                      onChange={(e) => setProfStudentId(e.target.value)}
                      className="w-full px-3 py-2 bg-[#F8FAFC] dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded-lg text-[#0F172A] dark:text-white"
                    >
                      <option value="">Select Learner...</option>
                      {learners.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.fullName} ({l.schoolName || l.enrolmentLabel})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                      Override Justification / Pedagogical Reason *
                    </label>
                    <input
                      type="text"
                      required
                      value={profOverrideReason}
                      onChange={(e) => setProfOverrideReason(e.target.value)}
                      placeholder="e.g. Custom practical project weighting approved for accelerated robotics track"
                      className="w-full px-3 py-2 bg-[#F8FAFC] dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded-lg text-[#0F172A] dark:text-white"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Calculation Policies */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-[#F8FAFC] dark:bg-slate-900/60 border border-[#E2E8F0] dark:border-slate-800 rounded-lg text-xs">
              <div>
                <label className="block font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                  Missing Work Policy
                </label>
                <select
                  value={profMissingPolicy}
                  onChange={(e) => setProfMissingPolicy(e.target.value as any)}
                  className="w-full px-2.5 py-2 bg-white dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded-md text-[#0F172A] dark:text-white"
                >
                  <option value="FLAG_INCOMPLETE">
                    Flag report as incomplete for tutor review (Default)
                  </option>
                  <option value="EXCLUDE">Exclude missing work and flag in audit</option>
                  <option value="ZERO_AFTER_DUE">
                    Count overdue unsubmitted work as 0 after due date
                  </option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                  Empty Category Policy
                </label>
                <select
                  value={profEmptyCatPolicy}
                  onChange={(e) => setProfEmptyCatPolicy(e.target.value as any)}
                  className="w-full px-2.5 py-2 bg-white dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded-md text-[#0F172A] dark:text-white"
                >
                  <option value="RETAIN_AND_FLAG">
                    Do not redistribute silently — flag incomplete
                  </option>
                  <option value="REDISTRIBUTE_APPROVED">
                    Redistribute weights across populated categories
                  </option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                  3-Term Annual Session Method
                </label>
                <select
                  value={profSessionMethod}
                  onChange={(e) => setProfSessionMethod(e.target.value as any)}
                  className="w-full px-2.5 py-2 bg-white dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded-md text-[#0F172A] dark:text-white"
                >
                  <option value="EQUAL_TERM_WEIGHTS">
                    Equal Weighting across Terms 1, 2 & 3 (Default)
                  </option>
                  <option value="CUSTOM_TERM_WEIGHTS">Custom Term 1 / Term 2 / Term 3 Weights</option>
                  <option value="CUMULATIVE_SESSION">
                    Cumulative Session Calculation across all 3 terms
                  </option>
                </select>
              </div>
            </div>

            {/* Category Weights Table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#0F172A] dark:text-white">
                    Assessment Categories & Percentage Weights
                  </h4>
                  <p className="text-[11px] text-[#64748B]">
                    Total active weight must equal 100%. Current Total:{' '}
                    <strong
                      className={`tabular-nums ${
                        weightCheck.valid ? 'text-emerald-600' : 'text-[#B91C1C]'
                      }`}
                    >
                      {weightCheck.totalWeight.toFixed(2)}%
                    </strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setProfCategories((prev) => [
                      ...prev,
                      {
                        id: `cat_custom_${Date.now()}`,
                        name: 'Custom Evaluation Category',
                        weight: 0,
                        aggregationMethod: 'TOTAL_MARKS',
                        sourceWorkTypes: ['CUSTOM'],
                        enabled: true,
                      },
                    ])
                  }
                  className="px-2.5 py-1 text-xs font-semibold text-[#0F172A] dark:text-white bg-[#F8FAFC] dark:bg-slate-800 border border-[#CBD5E1] dark:border-slate-700 rounded-md inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Category
                </button>
              </div>

              {!weightCheck.valid && (
                <div className="mb-3 p-2.5 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 text-xs text-red-700 dark:text-red-300">
                  {weightCheck.error}
                </div>
              )}

              <div className="border border-[#E2E8F0] dark:border-slate-800 rounded-lg overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F8FAFC] dark:bg-slate-900 border-b border-[#E2E8F0] dark:border-slate-800 text-[#64748B]">
                    <tr>
                      <th className="py-2 px-3">Active</th>
                      <th className="py-2 px-3">Category Name</th>
                      <th className="py-2 px-3">Mapped Work Types</th>
                      <th className="py-2 px-3">Aggregation Method</th>
                      <th className="py-2 px-3">Weight (%)</th>
                      <th className="py-2 px-3 text-right">Remove</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
                    {profCategories.map((cat, idx) => (
                      <tr key={cat.id}>
                        <td className="py-2 px-3">
                          <input
                            type="checkbox"
                            checked={cat.enabled}
                            onChange={(e) => {
                              const next = [...profCategories];
                              next[idx] = { ...cat, enabled: e.target.checked };
                              setProfCategories(next);
                            }}
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={cat.name}
                            onChange={(e) => {
                              const next = [...profCategories];
                              next[idx] = { ...cat, name: e.target.value };
                              setProfCategories(next);
                            }}
                            className="w-full px-2 py-1 bg-[#F8FAFC] dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded text-xs"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex flex-wrap gap-1">
                            {ALL_WORK_TYPES.map((wt) => {
                              const active = cat.sourceWorkTypes.includes(wt);
                              return (
                                <button
                                  key={wt}
                                  type="button"
                                  onClick={() => {
                                    const nextTypes = active
                                      ? cat.sourceWorkTypes.filter((t) => t !== wt)
                                      : [...cat.sourceWorkTypes, wt];
                                    const next = [...profCategories];
                                    next[idx] = { ...cat, sourceWorkTypes: nextTypes };
                                    setProfCategories(next);
                                  }}
                                  className={`px-1.5 py-0.5 text-[10px] rounded border cursor-pointer ${
                                    active
                                      ? 'bg-[#1E293B] text-white border-[#1E293B]'
                                      : 'bg-transparent text-[#64748B] border-[#CBD5E1] dark:border-slate-700'
                                  }`}
                                >
                                  {wt}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          <select
                            value={cat.aggregationMethod}
                            onChange={(e) => {
                              const next = [...profCategories];
                              next[idx] = {
                                ...cat,
                                aggregationMethod: e.target.value as any,
                              };
                              setProfCategories(next);
                            }}
                            className="px-2 py-1 bg-[#F8FAFC] dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded text-xs"
                          >
                            <option value="TOTAL_MARKS">Total Marks Earned / Available</option>
                            <option value="PERCENTAGE_AVERAGE">Equal Average of Item %</option>
                          </select>
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step="0.5"
                            value={cat.weight}
                            onChange={(e) => {
                              const next = [...profCategories];
                              next[idx] = { ...cat, weight: Number(e.target.value) };
                              setProfCategories(next);
                            }}
                            className="w-20 px-2 py-1 bg-[#F8FAFC] dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded text-xs tabular-nums font-bold"
                          />
                        </td>
                        <td className="py-2 px-3 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              setProfCategories((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="p-1 text-[#64748B] hover:text-[#B91C1C]"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Grade Scale Boundaries Editor */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#0F172A] dark:text-white mb-2">
                Grade Scale Boundaries & Classification Labels
              </h4>
              {!boundaryCheck.valid && (
                <div className="mb-3 p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                  {boundaryCheck.error}
                </div>
              )}
              <div className="border border-[#E2E8F0] dark:border-slate-800 rounded-lg overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F8FAFC] dark:bg-slate-900 border-b border-[#E2E8F0] dark:border-slate-800 text-[#64748B]">
                    <tr>
                      <th className="py-2 px-3">Grade Letter</th>
                      <th className="py-2 px-3">Min %</th>
                      <th className="py-2 px-3">Max %</th>
                      <th className="py-2 px-3">Classification Label</th>
                      <th className="py-2 px-3">Passing Grade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
                    {profBoundaries.map((b, idx) => (
                      <tr key={idx}>
                        <td className="py-1.5 px-3">
                          <input
                            type="text"
                            value={b.grade}
                            onChange={(e) => {
                              const next = [...profBoundaries];
                              next[idx] = { ...b, grade: e.target.value };
                              setProfBoundaries(next);
                            }}
                            className="w-16 px-2 py-1 bg-[#F8FAFC] dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded font-bold"
                          />
                        </td>
                        <td className="py-1.5 px-3">
                          <input
                            type="number"
                            step="0.01"
                            value={b.minPercentage}
                            onChange={(e) => {
                              const next = [...profBoundaries];
                              next[idx] = { ...b, minPercentage: Number(e.target.value) };
                              setProfBoundaries(next);
                            }}
                            className="w-20 px-2 py-1 bg-[#F8FAFC] dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded tabular-nums"
                          />
                        </td>
                        <td className="py-1.5 px-3">
                          <input
                            type="number"
                            step="0.01"
                            value={b.maxPercentage}
                            onChange={(e) => {
                              const next = [...profBoundaries];
                              next[idx] = { ...b, maxPercentage: Number(e.target.value) };
                              setProfBoundaries(next);
                            }}
                            className="w-20 px-2 py-1 bg-[#F8FAFC] dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded tabular-nums"
                          />
                        </td>
                        <td className="py-1.5 px-3">
                          <input
                            type="text"
                            value={b.label}
                            onChange={(e) => {
                              const next = [...profBoundaries];
                              next[idx] = { ...b, label: e.target.value };
                              setProfBoundaries(next);
                            }}
                            className="w-full px-2 py-1 bg-[#F8FAFC] dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded"
                          />
                        </td>
                        <td className="py-1.5 px-3">
                          <input
                            type="checkbox"
                            checked={b.isPass}
                            onChange={(e) => {
                              const next = [...profBoundaries];
                              next[idx] = { ...b, isPass: e.target.checked };
                              setProfBoundaries(next);
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* ==========================================================================
          TAB 4: ACADEMIC PERIODS & CALENDAR MANAGEMENT
         ========================================================================== */}
      {activeTab === 'PERIODS' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-slate-800 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-[#0F172A] dark:text-white pb-3 border-b border-[#E2E8F0] dark:border-slate-800">
              Configured Academic Periods ({periods.length})
            </h3>
            <div className="space-y-2.5 max-h-[540px] overflow-y-auto">
              {periods.map((p) => (
                <div
                  key={p.id}
                  className="p-3.5 rounded-lg border border-[#E2E8F0] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-900/50 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#0F172A] dark:text-white">
                      {p.sessionName}
                    </span>
                    <span className="text-[11px] font-semibold text-[#B91C1C]">{p.status}</span>
                  </div>
                  <div className="text-[11px] text-[#64748B]">
                    Type: {p.periodCategory} • Window:{' '}
                    <span className="tabular-nums font-medium text-[#0F172A] dark:text-slate-200">
                      {p.startDate} to {p.endDate}
                    </span>
                  </div>
                  {p.terms && p.terms.length > 0 && (
                    <div className="pt-2 border-t border-[#E2E8F0] dark:border-slate-800 grid grid-cols-3 gap-2 text-[11px]">
                      {p.terms.map((t) => (
                        <div key={t.termKey}>
                          <div className="font-semibold text-[#0F172A] dark:text-slate-200">
                            {t.name}
                          </div>
                          <div className="text-[#64748B] tabular-nums">
                            {t.startDate} – {t.endDate}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <form
            onSubmit={handleSavePeriod}
            className="lg:col-span-7 bg-white dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-slate-800 rounded-xl p-6 space-y-5 text-xs"
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0] dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-[#0F172A] dark:text-white">
                  Configure Academic Session, Term & Programme Dates
                </h3>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Assessments, assignments, attendance, and milestones are matched to terms and
                  reporting periods using their actual completion or due dates.
                </p>
              </div>
              <button
                type="submit"
                disabled={savingPeriod}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-[#991B1B] rounded-lg cursor-pointer"
              >
                {savingPeriod ? 'Saving...' : 'Save Academic Period'}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                  Period Category *
                </label>
                <select
                  value={periodCategory}
                  onChange={(e) => setPeriodCategory(e.target.value as any)}
                  className="w-full px-3 py-2 bg-[#F8FAFC] dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded-lg text-[#0F172A] dark:text-white"
                >
                  <option value="SCHOOL_SESSION">
                    School Academic Session (Three Terms: Term 1, Term 2, Term 3)
                  </option>
                  <option value="PRIVATE_PROGRAMME">
                    Private Learner Programme Enrolment Window
                  </option>
                  <option value="PRIVATE_ANNUAL">
                    Private Learner 1-Year Annual Academic Window
                  </option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                  Session / Period Label *
                </label>
                <input
                  type="text"
                  required
                  value={periodSessionName}
                  onChange={(e) => setPeriodSessionName(e.target.value)}
                  placeholder="e.g. 2026/2027 Academic Session"
                  className="w-full px-3 py-2 bg-[#F8FAFC] dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded-lg text-[#0F172A] dark:text-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                  Overall Start Date *
                </label>
                <input
                  type="date"
                  required
                  value={periodStartDate}
                  onChange={(e) => setPeriodStartDate(e.target.value)}
                  className="w-full px-3 py-2 bg-[#F8FAFC] dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded-lg text-[#0F172A] dark:text-white tabular-nums"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                  Overall End Date *
                </label>
                <input
                  type="date"
                  required
                  value={periodEndDate}
                  onChange={(e) => setPeriodEndDate(e.target.value)}
                  className="w-full px-3 py-2 bg-[#F8FAFC] dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded-lg text-[#0F172A] dark:text-white tabular-nums"
                />
              </div>
            </div>

            {periodCategory === 'SCHOOL_SESSION' && (
              <div className="p-4 rounded-lg bg-[#F8FAFC] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 space-y-3">
                <div className="font-bold text-[#0F172A] dark:text-white">
                  Three-Term School Calendar Dates (Term 1, Term 2, Term 3)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-white dark:bg-slate-950 rounded border border-[#E2E8F0] dark:border-slate-800 space-y-2">
                    <div className="font-bold text-[#0F172A] dark:text-white">
                      First Term (TERM_1)
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#64748B]">Start Date</label>
                      <input
                        type="date"
                        value={term1Start}
                        onChange={(e) => setTerm1Start(e.target.value)}
                        className="w-full px-2 py-1 border border-[#CBD5E1] dark:border-slate-700 rounded bg-transparent tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#64748B]">End Date</label>
                      <input
                        type="date"
                        value={term1End}
                        onChange={(e) => setTerm1End(e.target.value)}
                        className="w-full px-2 py-1 border border-[#CBD5E1] dark:border-slate-700 rounded bg-transparent tabular-nums"
                      />
                    </div>
                  </div>

                  <div className="p-3 bg-white dark:bg-slate-950 rounded border border-[#E2E8F0] dark:border-slate-800 space-y-2">
                    <div className="font-bold text-[#0F172A] dark:text-white">
                      Second Term (TERM_2)
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#64748B]">Start Date</label>
                      <input
                        type="date"
                        value={term2Start}
                        onChange={(e) => setTerm2Start(e.target.value)}
                        className="w-full px-2 py-1 border border-[#CBD5E1] dark:border-slate-700 rounded bg-transparent tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#64748B]">End Date</label>
                      <input
                        type="date"
                        value={term2End}
                        onChange={(e) => setTerm2End(e.target.value)}
                        className="w-full px-2 py-1 border border-[#CBD5E1] dark:border-slate-700 rounded bg-transparent tabular-nums"
                      />
                    </div>
                  </div>

                  <div className="p-3 bg-white dark:bg-slate-950 rounded border border-[#E2E8F0] dark:border-slate-800 space-y-2">
                    <div className="font-bold text-[#0F172A] dark:text-white">
                      Third Term (TERM_3)
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#64748B]">Start Date</label>
                      <input
                        type="date"
                        value={term3Start}
                        onChange={(e) => setTerm3Start(e.target.value)}
                        className="w-full px-2 py-1 border border-[#CBD5E1] dark:border-slate-700 rounded bg-transparent tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#64748B]">End Date</label>
                      <input
                        type="date"
                        value={term3End}
                        onChange={(e) => setTerm3End(e.target.value)}
                        className="w-full px-2 py-1 border border-[#CBD5E1] dark:border-slate-700 rounded bg-transparent tabular-nums"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </form>
        </div>
      )}

      {/* ==========================================================================
          TAB 5: GENERATE REPORTS (9-STEP OFFICIAL REPORT WORKFLOW)
         ========================================================================== */}
      {activeTab === 'GENERATE' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-slate-800 rounded-xl p-6 space-y-5">
            <div className="pb-4 border-b border-[#E2E8F0] dark:border-slate-800">
              <h3 className="text-base font-bold text-[#0F172A] dark:text-white">
                Official Performance Report Generation Workflow
              </h3>
              <p className="text-xs text-[#64748B] mt-0.5">
                Select report type, learner or cohort scope, academic period, and grading profile to
                calculate, audit, review, and officially issue watermarked PDF reports.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
              {/* Step 1: Report Type */}
              <div>
                <label className="block font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                  1. Official Report Type *
                </label>
                <select
                  value={genReportType}
                  onChange={(e) => {
                    setGenReportType(e.target.value as AcademicReportType);
                    setPreviewSnapshots([]);
                  }}
                  className="w-full px-3 py-2 bg-[#F8FAFC] dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded-lg text-[#0F172A] dark:text-white font-medium"
                >
                  <option value="SCHOOL_TERM">
                    End-of-Term Report — School Learner (JDI-TRM)
                  </option>
                  <option value="SCHOOL_SESSION">
                    End-of-Session Report — School Learner (JDI-SES)
                  </option>
                  <option value="PRIVATE_PROGRAMME">
                    End-of-Programme Report — Private Learner (JDI-PRG)
                  </option>
                  <option value="PRIVATE_ANNUAL">
                    End-of-Year Report — Private Learner (JDI-ANN)
                  </option>
                </select>
              </div>

              {/* Step 2: Generation Scope */}
              <div>
                <label className="block font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                  2. Generation Scope *
                </label>
                <select
                  value={genScopeMode}
                  onChange={(e) => {
                    setGenScopeMode(e.target.value as any);
                    setPreviewSnapshots([]);
                  }}
                  className="w-full px-3 py-2 bg-[#F8FAFC] dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded-lg text-[#0F172A] dark:text-white"
                >
                  <option value="SINGLE_LEARNER">Single Individual Learner</option>
                  {(genReportType === 'SCHOOL_TERM' || genReportType === 'SCHOOL_SESSION') && (
                    <option value="SCHOOL_CLASS">School / Class Cohort Batch</option>
                  )}
                  {(genReportType === 'PRIVATE_PROGRAMME' ||
                    genReportType === 'PRIVATE_ANNUAL') && (
                    <option value="PROGRAMME">Private Programme Cohort Batch</option>
                  )}
                </select>
              </div>

              {/* Step 3: Target Learner / School / Programme */}
              {genScopeMode === 'SINGLE_LEARNER' && (
                <div>
                  <label className="block font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                    3. Select Learner *
                  </label>
                  <select
                    value={genLearnerId}
                    onChange={(e) => setGenLearnerId(e.target.value)}
                    className="w-full px-3 py-2 bg-[#F8FAFC] dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded-lg text-[#0F172A] dark:text-white"
                  >
                    {learners
                      .filter((l) =>
                        genReportType === 'SCHOOL_TERM' || genReportType === 'SCHOOL_SESSION'
                          ? l.enrolmentCategory === 'school'
                          : l.enrolmentCategory !== 'school'
                      )
                      .map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.fullName} ({l.schoolName || l.enrolmentLabel} • {l.className})
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {genScopeMode === 'SCHOOL_CLASS' && (
                <>
                  <div>
                    <label className="block font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                      3a. Partner School *
                    </label>
                    <select
                      value={genSchoolName}
                      onChange={(e) => setGenSchoolName(e.target.value)}
                      className="w-full px-3 py-2 bg-[#F8FAFC] dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded-lg text-[#0F172A] dark:text-white"
                    >
                      <option value="">All Authorized Partner Schools</option>
                      {schools.map((s) => (
                        <option key={s.id} value={s.name}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                      3b. Class / Grade Filter
                    </label>
                    <input
                      type="text"
                      value={genClassName}
                      onChange={(e) => setGenClassName(e.target.value)}
                      placeholder="All Classes (or e.g. Grade 6)"
                      className="w-full px-3 py-2 bg-[#F8FAFC] dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded-lg text-[#0F172A] dark:text-white"
                    />
                  </div>
                </>
              )}

              {genScopeMode === 'PROGRAMME' && (
                <div>
                  <label className="block font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                    3. Target Programme *
                  </label>
                  <select
                    value={genProgramName}
                    onChange={(e) => setGenProgramName(e.target.value)}
                    className="w-full px-3 py-2 bg-[#F8FAFC] dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded-lg text-[#0F172A] dark:text-white"
                  >
                    <option value="">All Private Programmes</option>
                    {programmes.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Step 4: Academic Period */}
              <div>
                <label className="block font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                  4. Academic Session / Period *
                </label>
                <select
                  value={genPeriodId}
                  onChange={(e) => setGenPeriodId(e.target.value)}
                  className="w-full px-3 py-2 bg-[#F8FAFC] dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded-lg text-[#0F172A] dark:text-white"
                >
                  {periods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sessionName} ({p.startDate} to {p.endDate})
                    </option>
                  ))}
                </select>
              </div>

              {/* Step 4b: Term Selection for End-of-Term Report */}
              {genReportType === 'SCHOOL_TERM' && (
                <div>
                  <label className="block font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                    4b. Select School Term *
                  </label>
                  <select
                    value={genTermKey}
                    onChange={(e) => setGenTermKey(e.target.value as AcademicTermKey)}
                    className="w-full px-3 py-2 bg-[#F8FAFC] dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded-lg text-[#0F172A] dark:text-white"
                  >
                    <option value="TERM_1">First Term (TERM_1)</option>
                    <option value="TERM_2">Second Term (TERM_2)</option>
                    <option value="TERM_3">Third Term (TERM_3)</option>
                  </select>
                </div>
              )}

              {/* Step 5: Grading Profile */}
              <div>
                <label className="block font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                  5. Active Grading Profile *
                </label>
                <select
                  value={genProfileId}
                  onChange={(e) => setGenProfileId(e.target.value)}
                  className="w-full px-3 py-2 bg-[#F8FAFC] dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded-lg text-[#0F172A] dark:text-white"
                >
                  {profiles.map((prof) => (
                    <option key={prof.id} value={prof.id}>
                      {prof.name} (v{prof.version} • {prof.scopeType})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Step 6: Content Inclusion Toggles & Empty-Category Redistribution Approval */}
            <div className="p-4 rounded-lg bg-[#F8FAFC] dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 space-y-3 text-xs">
              <div className="font-bold text-[#0F172A] dark:text-white">
                6. Report Content Sections & Empty-Category Weight Redistribution Policy
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {(
                  [
                    ['includeDetailedAssessments', 'Include Quizzes, Tests & Exams'],
                    ['includeAssignmentsAndProjects', 'Include Assignments & Projects'],
                    ['includeActivities', 'Include Practical & Studio Activities'],
                    ['includeAttendance', 'Include Attendance Summary'],
                    ['includeMilestones', 'Include Curriculum Milestones'],
                    ['includeTutorRemarks', 'Include Official Tutor Remarks'],
                    ['includeSubjectBreakdown', 'Include Subject / Module Table'],
                    ['includeGraphicalAnalysis', 'Include Term Progression Bar Chart'],
                  ] as Array<[keyof ReportContentInclusionOptions, string]>
                ).map(([key, label]) => (
                  <label key={key} className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={genIncludeOptions[key]}
                      onChange={(e) =>
                        setGenIncludeOptions((prev) => ({
                          ...prev,
                          [key]: e.target.checked,
                        }))
                      }
                    />
                    <span className="text-[#0F172A] dark:text-slate-200">{label}</span>
                  </label>
                ))}
              </div>

              <div className="pt-3 border-t border-[#E2E8F0] dark:border-slate-800 flex flex-col sm:flex-row sm:items-center gap-3">
                <label className="inline-flex items-center gap-2 cursor-pointer font-semibold text-[#0F172A] dark:text-white">
                  <input
                    type="checkbox"
                    checked={genApproveWeightRedistribution}
                    onChange={(e) => setGenApproveWeightRedistribution(e.target.checked)}
                  />
                  <span>
                    Explicitly approve weight redistribution if a learner has an empty grading
                    category
                  </span>
                </label>
                {genApproveWeightRedistribution && (
                  <input
                    type="text"
                    value={genRedistributionReason}
                    onChange={(e) => setGenRedistributionReason(e.target.value)}
                    placeholder="Reason for weight redistribution (logged in audit trail)..."
                    className="flex-1 px-3 py-1.5 bg-white dark:bg-slate-950 border border-[#CBD5E1] dark:border-slate-700 rounded-md text-xs"
                  />
                )}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-[#64748B]">
                Target Cohort:{' '}
                <strong className="text-[#0F172A] dark:text-white">
                  {targetGenerationLearners.length} learner(s)
                </strong>
              </div>
              <button
                type="button"
                onClick={handleCalculateAndPreview}
                disabled={calculatingPreviews || targetGenerationLearners.length === 0}
                className="px-5 py-2.5 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-[#991B1B] rounded-lg inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                {calculatingPreviews
                  ? 'Consolidating Records & Calculating Grades...'
                  : `7. Calculate & Preview Official Reports (${targetGenerationLearners.length})`}
              </button>
            </div>
          </div>

          {/* Step 7, 8 & 9: Calculated Report Previews, Audit Breakdown, Tutor Remarks & Batch Issuance */}
          {previewSnapshots.length > 0 && (
            <div className="bg-white dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-slate-800 rounded-xl p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-[#E2E8F0] dark:border-slate-800">
                <div>
                  <h4 className="text-base font-bold text-[#0F172A] dark:text-white">
                    8. Review Calculated Performance, Missing-Data Warnings & Tutor Remarks
                  </h4>
                  <p className="text-xs text-[#64748B]">
                    Verify each learner’s weighted score, inspect included/excluded records, edit
                    tutor remarks, and issue official reports.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {previewSnapshots.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        downloadBulkOfficialReportsZip(
                          previewSnapshots,
                          `JDI_${genReportType}_Cohort_Reports`
                        )
                      }
                      className="px-3.5 py-2 text-xs font-semibold text-[#0F172A] dark:text-white bg-[#F8FAFC] dark:bg-slate-800 border border-[#CBD5E1] dark:border-slate-700 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Archive className="w-3.5 h-3.5" />
                      Download Cohort ZIP ({previewSnapshots.length} PDFs)
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleIssueOfficialReports(previewSnapshots)}
                    disabled={issuingBatch}
                    className="px-4 py-2 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-[#991B1B] rounded-lg inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {issuingBatch
                      ? 'Issuing Official Reports...'
                      : `9. Issue & Release All (${previewSnapshots.length})`}
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {previewSnapshots.map((snap) => (
                  <div
                    key={snap.id}
                    className="p-4 rounded-xl border border-[#E2E8F0] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-900/40 space-y-3"
                  >
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-[#B91C1C]">
                            {snap.reportRef}
                          </span>
                          <span className="text-sm font-bold text-[#0F172A] dark:text-white">
                            {snap.studentName}
                          </span>
                          <span className="text-xs text-[#64748B]">
                            • {snap.schoolName ? `${snap.schoolName} (${snap.className})` : `${snap.enrolmentLabel} (${snap.programName})`}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#64748B] mt-0.5">
                          Profile: {snap.gradingProfileName} (v{snap.gradingProfileVersion}) •
                          Inspected: {snap.calculationBreakdown.totalRecordsInspected} records (
                          {snap.calculationBreakdown.includedRecordsCount} graded & included,{' '}
                          {snap.calculationBreakdown.pendingReviewCount} pending tutor review,{' '}
                          {snap.calculationBreakdown.missingWorkCount} missing)
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <div className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 text-xs font-bold tabular-nums text-[#0F172A] dark:text-white">
                          {snap.overallPercentage !== null
                            ? `${snap.overallPercentage.toFixed(1)}% • Grade ${snap.overallGrade} (${snap.classification})`
                            : 'Incomplete / Pending Grade'}
                        </div>

                        <button
                          type="button"
                          onClick={() => setActivePreviewModal(snap)}
                          className="px-2.5 py-1.5 text-xs font-medium text-[#0F172A] dark:text-slate-200 bg-white dark:bg-slate-800 border border-[#CBD5E1] dark:border-slate-700 rounded-md inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Audit Breakdown
                        </button>

                        <button
                          type="button"
                          onClick={() => generateOfficialPerformanceReportPdf(snap)}
                          className="px-2.5 py-1.5 text-xs font-semibold text-white bg-[#1E293B] hover:bg-[#0F172A] rounded-md inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Preview PDF
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSaveDraftSnapshot(snap)}
                          className="px-2.5 py-1.5 text-xs font-medium text-[#475569] dark:text-slate-300 bg-white dark:bg-slate-800 border border-[#CBD5E1] dark:border-slate-700 rounded-md cursor-pointer"
                        >
                          Save Draft
                        </button>

                        <button
                          type="button"
                          onClick={() => handleIssueOfficialReports([snap])}
                          disabled={issuingBatch || snap.status === 'ISSUED'}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-[#991B1B] rounded-md inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          <Check className="w-3.5 h-3.5" />
                          {snap.status === 'ISSUED' ? 'Issued' : 'Issue Official Report'}
                        </button>
                      </div>
                    </div>

                    {/* Warnings if incomplete or missing categories */}
                    {snap.calculationBreakdown.warnings.length > 0 && (
                      <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-xs text-amber-900 dark:text-amber-200 space-y-1">
                        {snap.calculationBreakdown.warnings.map((w, i) => (
                          <div key={i} className="flex items-start gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                            <span>{w}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Editable Tutor Remarks for this learner */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 text-xs">
                      <div>
                        <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                          Key Strengths Demonstrated
                        </label>
                        <input
                          type="text"
                          value={snap.tutorRemarks.strengths}
                          onChange={(e) =>
                            handleUpdatePreviewRemark(snap.id, 'strengths', e.target.value)
                          }
                          className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded-md"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                          General Tutor Feedback
                        </label>
                        <input
                          type="text"
                          value={snap.tutorRemarks.generalFeedback}
                          onChange={(e) =>
                            handleUpdatePreviewRemark(snap.id, 'generalFeedback', e.target.value)
                          }
                          className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded-md"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[#64748B] mb-1">
                          Next-Stage Recommendation
                        </label>
                        <input
                          type="text"
                          value={snap.tutorRemarks.nextStageRecommendation}
                          onChange={(e) =>
                            handleUpdatePreviewRemark(
                              snap.id,
                              'nextStageRecommendation',
                              e.target.value
                            )
                          }
                          className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded-md"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==========================================================================
          TAB 6: ISSUED REPORTS REGISTRY
         ========================================================================== */}
      {activeTab === 'ISSUED' && (
        <div className="bg-white dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-4 border-b border-[#E2E8F0] dark:border-slate-800">
            <div>
              <h3 className="text-base font-bold text-[#0F172A] dark:text-white">
                Official Reports Registry ({filteredIssuedReports.length})
              </h3>
              <p className="text-xs text-[#64748B]">
                Filter, download, or issue versioned corrections for generated performance reports.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <input
                type="text"
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                placeholder="Filter by Ref No, Learner, School..."
                className="px-3 py-1.5 bg-[#F8FAFC] dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded-lg"
              />
              <select
                value={filterReportType}
                onChange={(e) => setFilterReportType(e.target.value)}
                className="px-2.5 py-1.5 bg-[#F8FAFC] dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded-lg"
              >
                <option value="ALL">All Report Types</option>
                <option value="SCHOOL_TERM">School Term (JDI-TRM)</option>
                <option value="SCHOOL_SESSION">School Session (JDI-SES)</option>
                <option value="PRIVATE_PROGRAMME">Private Programme (JDI-PRG)</option>
                <option value="PRIVATE_ANNUAL">Private Annual (JDI-ANN)</option>
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-2.5 py-1.5 bg-[#F8FAFC] dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded-lg"
              >
                <option value="ALL">All Statuses</option>
                <option value="ISSUED">ISSUED</option>
                <option value="DRAFT">DRAFT</option>
                <option value="SUPERSEDED">SUPERSEDED</option>
              </select>

              {filteredIssuedReports.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    downloadBulkOfficialReportsZip(
                      filteredIssuedReports,
                      'JDI_Filtered_Academic_Reports'
                    )
                  }
                  className="px-3 py-1.5 font-semibold text-white bg-[#1E293B] hover:bg-[#0F172A] rounded-lg inline-flex items-center gap-1 cursor-pointer"
                >
                  <Archive className="w-3.5 h-3.5" />
                  Export ZIP ({filteredIssuedReports.length})
                </button>
              )}
            </div>
          </div>

          {filteredIssuedReports.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#64748B]">
              No generated reports match the active filter criteria.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#E2E8F0] dark:border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
                    <th className="py-2.5 px-3">Ref No</th>
                    <th className="py-2.5 px-3">Report Type</th>
                    <th className="py-2.5 px-3">Learner & Enrolment</th>
                    <th className="py-2.5 px-3">Period</th>
                    <th className="py-2.5 px-3">Score & Grade</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
                  {filteredIssuedReports.map((rpt) => (
                    <tr
                      key={rpt.id}
                      className="hover:bg-[#F8FAFC] dark:hover:bg-slate-900/50 transition-colors"
                    >
                      <td className="py-3 px-3 font-mono font-bold text-[#0F172A] dark:text-white whitespace-nowrap">
                        {rpt.reportRef}
                        <span className="ml-1.5 text-[10px] font-sans text-[#B91C1C]">
                          v{rpt.version}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-semibold text-[#0F172A] dark:text-white">
                        {getReportTypeLabel(rpt.reportType)}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-semibold text-[#0F172A] dark:text-white">
                          {rpt.studentName}
                        </div>
                        <div className="text-[11px] text-[#64748B]">
                          {rpt.schoolName
                            ? `${rpt.schoolName} • ${rpt.className}`
                            : `${rpt.enrolmentLabel} • ${rpt.programName}`}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div>{rpt.periodLabel}</div>
                        <div className="text-[11px] text-[#64748B] tabular-nums">
                          {(rpt.issuedAt || rpt.generatedAt).slice(0, 10)}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-bold tabular-nums text-[#0F172A] dark:text-white">
                        {rpt.overallPercentage !== null
                          ? `${rpt.overallPercentage.toFixed(1)}% (${rpt.overallGrade} • ${rpt.classification})`
                          : 'Incomplete'}
                      </td>
                      <td className="py-3 px-3">
                        <span className="inline-flex items-center gap-1.5 font-medium">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              rpt.status === 'ISSUED'
                                ? 'bg-emerald-600'
                                : rpt.status === 'SUPERSEDED'
                                ? 'bg-amber-500'
                                : 'bg-slate-400'
                            }`}
                          />
                          {rpt.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setActivePreviewModal(rpt)}
                            className="px-2.5 py-1.5 text-xs font-medium text-[#0F172A] dark:text-slate-200 bg-[#F8FAFC] dark:bg-slate-800 border border-[#CBD5E1] dark:border-slate-700 rounded-md inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Inspect
                          </button>
                          <button
                            type="button"
                            onClick={() => generateOfficialPerformanceReportPdf(rpt)}
                            className="px-2.5 py-1.5 text-xs font-semibold text-white bg-[#1E293B] hover:bg-[#0F172A] rounded-md inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            PDF
                          </button>
                          {rpt.status === 'ISSUED' && (
                            <button
                              type="button"
                              onClick={() => {
                                setReissueTarget(rpt);
                                setReissueFeedback(rpt.tutorRemarks?.generalFeedback || '');
                              }}
                              className="px-2.5 py-1.5 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-[#991B1B] rounded-md inline-flex items-center gap-1 cursor-pointer"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              Reissue
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ==========================================================================
          TAB 7: REPORT HISTORY & IMMUTABLE AUDIT TRAIL
         ========================================================================== */}
      {activeTab === 'HISTORY' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-slate-800 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-bold text-[#0F172A] dark:text-white">
              Immutable Academic Grading & Reporting Audit Trail ({auditLogs.length})
            </h3>
            <p className="text-xs text-[#64748B]">
              Tracks every grading profile creation/update, learner override, empty-category weight
              redistribution confirmation, report issuance, and versioned report correction.
            </p>

            {auditLogs.length === 0 ? (
              <div className="p-6 text-center text-xs text-[#64748B]">
                No audit log entries recorded yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#E2E8F0] dark:border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
                      <th className="py-2.5 px-3">Timestamp</th>
                      <th className="py-2.5 px-3">Action Type</th>
                      <th className="py-2.5 px-3">Actor & Role</th>
                      <th className="py-2.5 px-3">Reference / Target</th>
                      <th className="py-2.5 px-3">Audit Summary & Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
                    {auditLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="py-2.5 px-3 tabular-nums text-[#64748B] whitespace-nowrap">
                          {log.timestamp.replace('T', ' ').slice(0, 19)}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-semibold text-[#0F172A] dark:text-white">
                          {log.actionType}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-semibold text-[#0F172A] dark:text-white">
                            {log.actorName}
                          </span>{' '}
                          <span className="text-[#64748B]">({log.actorRole})</span>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[#B91C1C]">
                          {log.targetRef || log.targetId}
                        </td>
                        <td className="py-2.5 px-3 text-[#0F172A] dark:text-slate-200">
                          <div>{log.summary}</div>
                          {log.reason && (
                            <div className="text-[11px] text-[#64748B] mt-0.5">
                              Reason: {log.reason}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Calculation Audit & Report Snapshot Inspection Modal */}
      {activePreviewModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-slate-800 rounded-xl max-w-4xl w-full max-h-[88vh] overflow-y-auto p-6 shadow-xl space-y-5">
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#E2E8F0] dark:border-slate-800">
              <div>
                <div className="text-xs font-mono font-bold text-[#B91C1C]">
                  REF NO: {activePreviewModal.reportRef} • VERSION v{activePreviewModal.version} •{' '}
                  {activePreviewModal.status}
                </div>
                <h4 className="text-lg font-bold text-[#0F172A] dark:text-white mt-0.5">
                  {getReportTypeLabel(activePreviewModal.reportType)} —{' '}
                  {activePreviewModal.studentName}
                </h4>
                <p className="text-xs text-[#64748B]">
                  {activePreviewModal.periodLabel} • Grading Profile:{' '}
                  {activePreviewModal.gradingProfileName} (v
                  {activePreviewModal.gradingProfileVersion})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActivePreviewModal(null)}
                className="p-1 text-[#64748B] hover:text-[#0F172A]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Category Breakdown */}
            <div>
              <h5 className="text-xs font-bold uppercase tracking-wider text-[#64748B] mb-2">
                Weighted Category Calculation
              </h5>
              <div className="border border-[#E2E8F0] dark:border-slate-800 rounded-lg overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F8FAFC] dark:bg-slate-900 border-b border-[#E2E8F0] dark:border-slate-800 text-[#64748B]">
                    <tr>
                      <th className="py-2 px-3">Category</th>
                      <th className="py-2 px-3">Method</th>
                      <th className="py-2 px-3">Graded Items</th>
                      <th className="py-2 px-3">Raw Marks</th>
                      <th className="py-2 px-3">Category %</th>
                      <th className="py-2 px-3">Configured Wt</th>
                      <th className="py-2 px-3">Effective Wt</th>
                      <th className="py-2 px-3">Contribution</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
                    {activePreviewModal.calculationBreakdown.categoryResults.map((c) => (
                      <tr key={c.categoryId}>
                        <td className="py-2 px-3 font-semibold text-[#0F172A] dark:text-white">
                          {c.categoryName}
                        </td>
                        <td className="py-2 px-3 text-[#64748B]">{c.aggregationMethod}</td>
                        <td className="py-2 px-3 tabular-nums">{c.includedCount}</td>
                        <td className="py-2 px-3 tabular-nums">
                          {c.rawEarnedTotal} / {c.maxAvailableTotal}
                        </td>
                        <td className="py-2 px-3 tabular-nums font-semibold">
                          {c.categoryPercentage !== null ? `${c.categoryPercentage.toFixed(1)}%` : '—'}
                        </td>
                        <td className="py-2 px-3 tabular-nums">{c.configuredWeight.toFixed(1)}%</td>
                        <td className="py-2 px-3 tabular-nums">{c.effectiveWeight.toFixed(1)}%</td>
                        <td className="py-2 px-3 tabular-nums font-bold text-[#0F172A] dark:text-white">
                          {c.weightedContribution.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Included vs Excluded Items */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 rounded-lg border border-[#E2E8F0] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-900">
                <div className="font-bold text-[#0F172A] dark:text-white mb-2">
                  Included Graded Evidence ({activePreviewModal.calculationBreakdown.includedItems.length})
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {activePreviewModal.calculationBreakdown.includedItems.map((item) => (
                    <div
                      key={item.canonicalWorkId}
                      className="flex items-center justify-between py-1 border-b border-[#E2E8F0] dark:border-slate-800"
                    >
                      <div>
                        <span className="font-mono text-[11px] text-[#B91C1C] mr-1.5">
                          {item.referenceNumber}
                        </span>
                        <span className="font-medium text-[#0F172A] dark:text-white">
                          {item.title}
                        </span>
                      </div>
                      <span className="font-bold tabular-nums">
                        {item.rawEarnedMarks}/{item.maxAvailableMarks} ({item.normalizedPercentage}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3.5 rounded-lg border border-[#E2E8F0] dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-900">
                <div className="font-bold text-[#0F172A] dark:text-white mb-2">
                  Excluded / Pending / Missing Records (
                  {activePreviewModal.calculationBreakdown.excludedItems.length})
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {activePreviewModal.calculationBreakdown.excludedItems.map((item) => (
                    <div
                      key={item.canonicalWorkId}
                      className="py-1 border-b border-[#E2E8F0] dark:border-slate-800"
                    >
                      <div className="font-medium text-[#0F172A] dark:text-white">
                        {item.title} ({item.status})
                      </div>
                      <div className="text-[11px] text-[#64748B]">{item.exclusionReason}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-[#E2E8F0] dark:border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => generateOfficialPerformanceReportPdf(activePreviewModal)}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-[#991B1B] rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Download Official PDF ({activePreviewModal.reportRef})
              </button>
              <button
                type="button"
                onClick={() => setActivePreviewModal(null)}
                className="px-4 py-2 text-xs font-medium text-[#475569] border border-[#CBD5E1] rounded-lg cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reissue Modal from Issued Reports Tab */}
      {reissueTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmReissue}
            className="bg-white dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-slate-800 rounded-xl max-w-lg w-full p-6 shadow-xl space-y-4 text-xs"
          >
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-base font-bold text-[#0F172A] dark:text-white">
                  Issue Corrected Report Version (v{reissueTarget.version + 1})
                </h4>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Supersedes {reissueTarget.reportRef} (v{reissueTarget.version}) for{' '}
                  {reissueTarget.studentName}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReissueTarget(null)}
                className="p-1 text-[#64748B]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                Mandatory Correction Reason *
              </label>
              <input
                type="text"
                required
                value={reissueReason}
                onChange={(e) => setReissueReason(e.target.value)}
                placeholder="e.g. Updated project mark after late submission verification"
                className="w-full px-3 py-2 bg-[#F8FAFC] dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded-lg"
              />
            </div>

            <div>
              <label className="block font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                Updated Tutor Evaluation Summary
              </label>
              <textarea
                rows={3}
                value={reissueFeedback}
                onChange={(e) => setReissueFeedback(e.target.value)}
                className="w-full px-3 py-2 bg-[#F8FAFC] dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded-lg"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReissueTarget(null)}
                className="px-3.5 py-2 font-medium text-[#475569] border border-[#CBD5E1] rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={reissuing || !reissueReason.trim()}
                className="px-4 py-2 font-semibold text-white bg-[#B91C1C] hover:bg-[#991B1B] rounded-lg disabled:opacity-50 cursor-pointer"
              >
                {reissuing
                  ? 'Reissuing...'
                  : `Recalculate & Issue v${reissueTarget.version + 1}`}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default AcademicReportingCenter;
