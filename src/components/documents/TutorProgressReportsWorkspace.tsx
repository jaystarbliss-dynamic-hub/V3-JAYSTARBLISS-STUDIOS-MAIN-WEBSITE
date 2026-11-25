import React, { useEffect, useMemo, useState } from 'react';
import {
  FileText,
  Plus,
  Send,
  Edit3,
  Eye,
  FileDown,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Search,
  RefreshCw,
  Building2,
  UserCheck,
  GraduationCap,
  ShieldCheck,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
} from 'lucide-react';
import { auth } from '../../lib/firebase';
import { getEffectiveAuth } from '../../utils/impersonation';
import { useToast } from '../../contexts/ToastContext';
import {
  buildPerformanceReportTemplate,
  sanitizeDocumentHtml,
  type PerformanceReportStructuredSections,
} from '../../lib/documents/documentTemplates';
import {
  exportStudioDocumentAsPdf,
  type OfficialStudioExportInput,
} from '../../lib/documents/documentExporter';
import {
  listTutorProgressReportsForTutor,
  saveTutorProgressReportDraft,
  sendTutorProgressReportToParent,
  type AuthorizedReportRecipientScope,
  type TutorProgressReportRecord,
} from '../../lib/documents/tutorProgressReportsService';
import { DocumentStudio } from './DocumentStudio';
import { FullPagePreviewModal } from './FullPagePreviewModal';

export interface AuthorizedSchoolOption {
  id: string;
  name: string;
  adminUid?: string;
  adminName?: string;
  adminEmail?: string;
}

export interface AuthorizedLearnerOption {
  id: string;
  uid?: string;
  studentCode?: string;
  name: string;
  enrolmentCategory?: 'SCHOOL' | 'PRIVATE' | 'school' | 'parent' | 'individual' | string;
  className?: string;
  programmeName?: string;
  schoolId?: string;
  schoolName?: string;
  schoolAdminUid?: string;
  schoolAdminName?: string;
  schoolAdminEmail?: string;
  parentId?: string;
  parentUid?: string;
  parentEmail?: string;
  parentName?: string;
}

interface TutorProgressReportsWorkspaceProps {
  learners: AuthorizedLearnerOption[];
  schools?: AuthorizedSchoolOption[];
  programmes?: string[];
  isAdmin?: boolean;
  defaultTutorName?: string;
  autoCreateTrigger?: number;
  onEditingChange?: (editing: boolean) => void;
}

function classifyLearnerType(learner: AuthorizedLearnerOption): 'SCHOOL' | 'PRIVATE' {
  const catUpper = String(learner.enrolmentCategory || '').trim().toUpperCase();
  if (catUpper === 'SCHOOL') return 'SCHOOL';
  if (catUpper === 'PRIVATE' || catUpper === 'PARENT' || catUpper === 'INDIVIDUAL') {
    return 'PRIVATE';
  }
  const sName = String(learner.schoolName || '').trim().toLowerCase();
  const hasRealSchool =
    Boolean(learner.schoolId || sName) &&
    sName !== 'private enrolment' &&
    sName !== 'jaystarbliss dynamic institute';
  return hasRealSchool ? 'SCHOOL' : 'PRIVATE';
}

export const TutorProgressReportsWorkspace: React.FC<TutorProgressReportsWorkspaceProps> = ({
  learners,
  schools = [],
  programmes = [],
  isAdmin = false,
  defaultTutorName,
  autoCreateTrigger = 0,
  onEditingChange,
}) => {
  const { toast } = useToast();
  const currentUser = auth.currentUser;
  const effectiveAuth = getEffectiveAuth();
  const tutorUid =
    effectiveAuth.effectiveUid || currentUser?.uid || sessionStorage.getItem('userId') || '';
  const tutorName =
    defaultTutorName ||
    effectiveAuth.effectiveName ||
    currentUser?.displayName ||
    sessionStorage.getItem('userName') ||
    currentUser?.email ||
    'Faculty Tutor';

  const [reports, setReports] = useState<TutorProgressReportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DRAFT' | 'SENT'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Full-Page Document Studio state
  const [editing, setEditing] = useState(false);
  const [activeReportId, setActiveReportId] = useState<string | undefined>(undefined);
  const [activeStatus, setActiveStatus] = useState<'DRAFT' | 'SENT'>('DRAFT');
  const [activeVersion, setActiveVersion] = useState<number>(1);
  const [activeVersions, setActiveVersions] = useState<TutorProgressReportRecord['versions']>([]);

  // Step 1 & Step 2: Structured Learner Selection State (School Learner vs Private Learner)
  const [learnerCategory, setLearnerCategory] = useState<'SCHOOL' | 'PRIVATE'>('SCHOOL');
  const [learnerSearchText, setLearnerSearchText] = useState<string>('');
  const [selectedSchoolKey, setSelectedSchoolKey] = useState<string>('');
  const [selectedClassKey, setSelectedClassKey] = useState<string>('');
  const [selectedProgrammeKey, setSelectedProgrammeKey] = useState<string>('ALL');
  const [selectedLearnerId, setSelectedLearnerId] = useState<string>('');

  // Step 3: Controlled Authorized Recipient Dropdown State
  const [recipientScope, setRecipientScope] =
    useState<AuthorizedReportRecipientScope>('PARENT_GUARDIAN');

  // Step 4: Report Details & Guided Performance Observation Fields
  const [title, setTitle] = useState<string>('');
  const [subjectOrProgramme, setSubjectOrProgramme] = useState<string>('');
  const [reportingPeriod, setReportingPeriod] = useState<string>('');
  const [reportDate, setReportDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [showGuidedSections, setShowGuidedSections] = useState<boolean>(false);
  const [structuredSections, setStructuredSections] =
    useState<PerformanceReportStructuredSections>({
      performanceIndicatorsSummary: '',
      learningObjectivesCovered: '',
      keyStrengths: '',
      areasForImprovement: '',
      tutorObservations: '',
      recommendationsAndNextSteps: '',
    });

  const [contentHtml, setContentHtml] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [showSendConfirm, setShowSendConfirm] = useState(false);
  const [amendmentNote, setAmendmentNote] = useState('');

  // Preview state from list
  const [previewDoc, setPreviewDoc] = useState<OfficialStudioExportInput | null>(null);

  useEffect(() => {
    onEditingChange?.(editing);
  }, [editing, onEditingChange]);

  const loadReports = async () => {
    if (!tutorUid && !isAdmin) return;
    setLoading(true);
    try {
      const list = await listTutorProgressReportsForTutor(tutorUid, isAdmin);
      setReports(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadReports();
  }, [tutorUid, isAdmin]);

  // Partition authorized learners into School Learners and Private Learners
  const schoolLearners = useMemo(
    () => learners.filter((l) => classifyLearnerType(l) === 'SCHOOL'),
    [learners]
  );

  const privateLearners = useMemo(
    () => learners.filter((l) => classifyLearnerType(l) === 'PRIVATE'),
    [learners]
  );

  // Authorized School Options for the tutor
  const availableSchools = useMemo(() => {
    const map = new Map<
      string,
      { key: string; id: string; name: string; adminUid?: string; adminName?: string; adminEmail?: string; learnerCount: number }
    >();

    for (const s of schools) {
      const key = s.id || s.name.toLowerCase();
      map.set(key, {
        key,
        id: s.id,
        name: s.name,
        adminUid: s.adminUid,
        adminName: s.adminName,
        adminEmail: s.adminEmail,
        learnerCount: 0,
      });
    }

    for (const l of schoolLearners) {
      const sName = (l.schoolName || '').trim();
      const sId = (l.schoolId || '').trim();
      if (!sName && !sId) continue;
      const existingEntry =
        (sId && map.get(sId)) ||
        Array.from(map.values()).find(
          (item) => item.name.toLowerCase() === sName.toLowerCase() || (sId && item.id === sId)
        );
      if (existingEntry) {
        existingEntry.learnerCount += 1;
        if (!existingEntry.adminUid && l.schoolAdminUid) existingEntry.adminUid = l.schoolAdminUid;
        if (!existingEntry.adminName && l.schoolAdminName) existingEntry.adminName = l.schoolAdminName;
        if (!existingEntry.adminEmail && l.schoolAdminEmail) existingEntry.adminEmail = l.schoolAdminEmail;
      } else {
        const key = sId || sName.toLowerCase();
        map.set(key, {
          key,
          id: sId,
          name: sName || 'Assigned Partner School',
          adminUid: l.schoolAdminUid,
          adminName: l.schoolAdminName,
          adminEmail: l.schoolAdminEmail,
          learnerCount: 1,
        });
      }
    }

    return Array.from(map.values())
      .filter((s) => s.learnerCount > 0 || schools.some((raw) => raw.id === s.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [schools, schoolLearners]);

  // Available Classes / Grades inside the currently selected Assigned School
  const availableClassesForSchool = useMemo(() => {
    if (!selectedSchoolKey) return [];
    const targetSchool = availableSchools.find((s) => s.key === selectedSchoolKey);
    const matchingLearners = schoolLearners.filter((l) => {
      if (!targetSchool) return false;
      if (targetSchool.id && l.schoolId && targetSchool.id === l.schoolId) return true;
      return (l.schoolName || '').trim().toLowerCase() === targetSchool.name.trim().toLowerCase();
    });
    const set = new Set<string>();
    matchingLearners.forEach((l) => {
      set.add((l.className || 'Unassigned Class').trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [selectedSchoolKey, availableSchools, schoolLearners]);

  // Available Programmes for Private Learners
  const availablePrivateProgrammes = useMemo(() => {
    const set = new Set<string>(programmes.filter(Boolean));
    privateLearners.forEach((l) => {
      if (l.programmeName?.trim()) set.add(l.programmeName.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [programmes, privateLearners]);

  // Filtered learners for the active category + school/class or programme + search query
  const filteredCategoryLearners = useMemo(() => {
    const basePool = learnerCategory === 'SCHOOL' ? schoolLearners : privateLearners;
    const q = learnerSearchText.trim().toLowerCase();

    return basePool.filter((l) => {
      // If user typed a search query, search across the entire active category (School or Private)
      if (q) {
        const hay = `${l.name} ${l.studentCode || ''} ${l.className || ''} ${l.schoolName || ''} ${
          l.programmeName || ''
        }`.toLowerCase();
        return hay.includes(q);
      }

      if (learnerCategory === 'SCHOOL') {
        if (selectedSchoolKey) {
          const targetSchool = availableSchools.find((s) => s.key === selectedSchoolKey);
          const matchesSchool =
            targetSchool &&
            ((targetSchool.id && l.schoolId === targetSchool.id) ||
              (l.schoolName || '').trim().toLowerCase() === targetSchool.name.trim().toLowerCase());
          if (!matchesSchool) return false;
        }
        if (selectedClassKey && selectedClassKey !== 'ALL') {
          const lClass = (l.className || 'Unassigned Class').trim();
          if (lClass !== selectedClassKey) return false;
        }
      } else {
        if (selectedProgrammeKey && selectedProgrammeKey !== 'ALL') {
          if ((l.programmeName || '').trim() !== selectedProgrammeKey) return false;
        }
      }
      return true;
    });
  }, [
    learnerCategory,
    schoolLearners,
    privateLearners,
    learnerSearchText,
    selectedSchoolKey,
    availableSchools,
    selectedClassKey,
    selectedProgrammeKey,
  ]);

  const selectedLearner = useMemo(
    () => learners.find((l) => l.id === selectedLearnerId) || null,
    [learners, selectedLearnerId]
  );

  // Verified Recipient Options derived strictly from the selected learner's database relationships
  const verifiedRecipientInfo = useMemo(() => {
    if (!selectedLearner) {
      return {
        hasParent: false,
        parentLabel: 'No Parent / Guardian Linked',
        hasSchoolAdmin: false,
        schoolAdminLabel: 'No School Administrator Linked',
        options: [] as Array<{ value: AuthorizedReportRecipientScope; label: string }>,
      };
    }

    const cat = classifyLearnerType(selectedLearner);
    const hasParent = Boolean(
      selectedLearner.parentUid ||
        selectedLearner.parentId ||
        selectedLearner.parentEmail ||
        selectedLearner.parentName
    );
    const parentLabel = hasParent
      ? `Parent / Guardian — ${selectedLearner.parentName || 'Linked Guardian'}${
          selectedLearner.parentEmail ? ` (${selectedLearner.parentEmail})` : ''
        }`
      : 'No Parent / Guardian linked to this learner record';

    const matchedSchool = availableSchools.find(
      (s) =>
        (selectedLearner.schoolId && s.id === selectedLearner.schoolId) ||
        (selectedLearner.schoolName &&
          s.name.toLowerCase() === selectedLearner.schoolName.toLowerCase())
    );
    const schoolAdminUid = selectedLearner.schoolAdminUid || matchedSchool?.adminUid || selectedLearner.schoolId || '';
    const schoolAdminName =
      selectedLearner.schoolAdminName ||
      matchedSchool?.adminName ||
      (selectedLearner.schoolName ? `${selectedLearner.schoolName} Administrator` : '');
    const schoolAdminEmail = selectedLearner.schoolAdminEmail || matchedSchool?.adminEmail || '';

    const hasSchoolAdmin =
      cat === 'SCHOOL' && Boolean(schoolAdminUid || schoolAdminEmail || selectedLearner.schoolName);
    const schoolAdminLabel = hasSchoolAdmin
      ? `School Administrator — ${schoolAdminName}${
          schoolAdminEmail ? ` (${schoolAdminEmail})` : ''
        }`
      : 'No School Administrator linked';

    const options: Array<{ value: AuthorizedReportRecipientScope; label: string }> = [];
    if (cat === 'SCHOOL') {
      if (hasParent) {
        options.push({ value: 'PARENT_GUARDIAN', label: parentLabel });
      }
      if (hasSchoolAdmin) {
        options.push({ value: 'SCHOOL_ADMIN', label: schoolAdminLabel });
      }
      if (hasParent && hasSchoolAdmin) {
        options.push({
          value: 'BOTH',
          label: `Both Parent / Guardian & School Administrator (${
            selectedLearner.parentName || 'Guardian'
          } + ${selectedLearner.schoolName || 'School Admin'})`,
        });
      }
    } else {
      // Private Learner: ONLY Parent / Guardian is ever permitted
      if (hasParent) {
        options.push({ value: 'PARENT_GUARDIAN', label: parentLabel });
      }
    }

    return {
      hasParent,
      parentLabel,
      hasSchoolAdmin,
      schoolAdminLabel,
      schoolAdminUid,
      schoolAdminName,
      schoolAdminEmail,
      options,
    };
  }, [selectedLearner, availableSchools]);

  // Keep recipientScope synchronized with available verified options whenever learner changes
  useEffect(() => {
    if (verifiedRecipientInfo.options.length === 0) return;
    const isCurrentValid = verifiedRecipientInfo.options.some((o) => o.value === recipientScope);
    if (!isCurrentValid) {
      setRecipientScope(verifiedRecipientInfo.options[0].value);
    }
  }, [verifiedRecipientInfo.options, recipientScope]);

  const formattedReportDateLabel = useMemo(() => {
    if (!reportDate) {
      return new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
    }
    const parsed = new Date(`${reportDate}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return reportDate;
    return parsed.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }, [reportDate]);

  const currentRecipientDisplayLabel = useMemo(() => {
    const matched = verifiedRecipientInfo.options.find((o) => o.value === recipientScope);
    if (matched) return matched.label;
    if (!selectedLearner) return 'Select a verified learner first';
    return verifiedRecipientInfo.hasParent
      ? verifiedRecipientInfo.parentLabel
      : 'No verified recipient linked to learner';
  }, [verifiedRecipientInfo, recipientScope, selectedLearner]);

  const applyLearnerSelection = (
    learner: AuthorizedLearnerOption,
    regenerateTemplate = true
  ) => {
    const cat = classifyLearnerType(learner);
    setLearnerCategory(cat);
    setSelectedLearnerId(learner.id);
    setSubjectOrProgramme(learner.programmeName || '');

    if (cat === 'SCHOOL') {
      const matchedSchool = availableSchools.find(
        (s) =>
          (learner.schoolId && s.id === learner.schoolId) ||
          (learner.schoolName && s.name.toLowerCase() === learner.schoolName.toLowerCase())
      );
      if (matchedSchool) {
        setSelectedSchoolKey(matchedSchool.key);
      }
      setSelectedClassKey((learner.className || 'Unassigned Class').trim());
    } else {
      setSelectedProgrammeKey(learner.programmeName?.trim() || 'ALL');
    }

    const nextPeriod =
      reportingPeriod.trim() ||
      `Performance Report — ${new Date().toLocaleDateString('en-GB', {
        month: 'long',
        year: 'numeric',
      })}`;
    setReportingPeriod(nextPeriod);
    setTitle(`${learner.name} — Performance & Progress Report`);

    if (regenerateTemplate) {
      const recipientGreeting =
        learner.parentName ||
        (cat === 'SCHOOL' && learner.schoolName
          ? `${learner.schoolName} Administration / Parent`
          : 'Parent / Guardian');
      setContentHtml(
        buildPerformanceReportTemplate({
          studentName: learner.name,
          studentClass: learner.className,
          programmeName: learner.programmeName,
          schoolName:
            cat === 'SCHOOL'
              ? learner.schoolName || 'Assigned Partner School'
              : 'Jaystarbliss Dynamic Institute (Private Enrolment)',
          tutorName,
          parentName: recipientGreeting,
          recipientName: recipientGreeting,
          reportingPeriod: nextPeriod,
          dateLabel: formattedReportDateLabel,
          structuredSections: {
            ...structuredSections,
            subjectOrProgramme: learner.programmeName || '',
            reportDate: formattedReportDateLabel,
          },
        })
      );
    }
  };

  const handleApplyGuidedSectionsToDocument = () => {
    if (!selectedLearner) {
      toast.error('Please select a verified learner first.');
      return;
    }
    const cat = classifyLearnerType(selectedLearner);
    const recipientGreeting =
      recipientScope === 'SCHOOL_ADMIN'
        ? verifiedRecipientInfo.schoolAdminName || `${selectedLearner.schoolName} Administrator`
        : recipientScope === 'BOTH'
        ? `${selectedLearner.parentName || 'Parent / Guardian'} & ${
            verifiedRecipientInfo.schoolAdminName || 'School Administrator'
          }`
        : selectedLearner.parentName || 'Parent / Guardian';

    const updatedHtml = buildPerformanceReportTemplate({
      studentName: selectedLearner.name,
      studentClass: selectedLearner.className,
      programmeName: subjectOrProgramme || selectedLearner.programmeName,
      schoolName:
        cat === 'SCHOOL'
          ? selectedLearner.schoolName || 'Assigned Partner School'
          : 'Jaystarbliss Dynamic Institute (Private Enrolment)',
      tutorName,
      parentName: recipientGreeting,
      recipientName: recipientGreeting,
      reportingPeriod,
      dateLabel: formattedReportDateLabel,
      structuredSections: {
        ...structuredSections,
        subjectOrProgramme: subjectOrProgramme || selectedLearner.programmeName,
        reportDate: formattedReportDateLabel,
      },
    });
    setContentHtml(updatedHtml);
    toast.success('Guided observations applied to the official A4 report document.');
  };

  const startNewReport = (preselectedLearner?: AuthorizedLearnerOption) => {
    const defaultCategory: 'SCHOOL' | 'PRIVATE' =
      preselectedLearner
        ? classifyLearnerType(preselectedLearner)
        : schoolLearners.length > 0
        ? 'SCHOOL'
        : 'PRIVATE';
    const initialLearner =
      preselectedLearner ||
      (defaultCategory === 'SCHOOL' ? schoolLearners[0] : privateLearners[0]) ||
      learners[0] ||
      null;

    setActiveReportId(undefined);
    setActiveStatus('DRAFT');
    setActiveVersion(1);
    setActiveVersions([]);
    setLearnerSearchText('');
    setStructuredSections({
      performanceIndicatorsSummary: '',
      learningObjectivesCovered: '',
      keyStrengths: '',
      areasForImprovement: '',
      tutorObservations: '',
      recommendationsAndNextSteps: '',
    });
    setReportDate(new Date().toISOString().slice(0, 10));
    setAmendmentNote('');

    if (initialLearner) {
      applyLearnerSelection(initialLearner, true);
    } else {
      setLearnerCategory(defaultCategory);
      setSelectedLearnerId('');
      const period = `Performance Report — ${new Date().toLocaleDateString('en-GB', {
        month: 'long',
        year: 'numeric',
      })}`;
      setReportingPeriod(period);
      setTitle('Student Performance & Progress Report');
      setContentHtml(
        buildPerformanceReportTemplate({
          tutorName,
          reportingPeriod: period,
          dateLabel: formattedReportDateLabel,
        })
      );
    }
    setEditing(true);
  };

  useEffect(() => {
    if (autoCreateTrigger > 0) {
      startNewReport();
    }
  }, [autoCreateTrigger]);

  const openExistingReport = (report: TutorProgressReportRecord) => {
    setActiveReportId(report.id);
    setActiveStatus(report.status);
    setActiveVersion(report.versionNumber || 1);
    setActiveVersions(report.versions || []);
    setLearnerSearchText('');
    const matched = learners.find((l) => l.id === report.studentId) || null;
    if (matched) {
      applyLearnerSelection(matched, false);
    } else {
      setLearnerCategory(report.learnerCategory || (report.schoolName ? 'SCHOOL' : 'PRIVATE'));
      setSelectedLearnerId(report.studentId || '');
    }
    setRecipientScope(report.recipientScope || 'PARENT_GUARDIAN');
    setSubjectOrProgramme(report.programmeName || matched?.programmeName || '');
    setReportingPeriod(report.reportingPeriod || '');
    setReportDate(report.reportDate || new Date().toISOString().slice(0, 10));
    setStructuredSections(
      report.structuredSections || {
        performanceIndicatorsSummary: '',
        learningObjectivesCovered: '',
        keyStrengths: '',
        areasForImprovement: '',
        tutorObservations: '',
        recommendationsAndNextSteps: '',
      }
    );
    setTitle(report.title || 'Student Progress Report');
    setContentHtml(sanitizeDocumentHtml(report.contentHtml || ''));
    setAmendmentNote('');
    setEditing(true);
  };

  const filteredReports = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return reports.filter((r) => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (q) {
        const hay = `${r.title} ${r.studentName} ${r.schoolName || ''} ${r.programmeName || ''} ${
          r.reportingPeriod || ''
        }`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [reports, statusFilter, searchQuery]);

  const buildDraftPayload = (html: string, saveSnapshot = false) => {
    const fallbackReport = activeReportId
      ? reports.find((r) => r.id === activeReportId)
      : undefined;
    const studentName = selectedLearner?.name || fallbackReport?.studentName || '';
    const effectiveStudentId = selectedLearner?.id || fallbackReport?.studentId || '';
    const cat = selectedLearner
      ? classifyLearnerType(selectedLearner)
      : fallbackReport?.learnerCategory || learnerCategory;

    return {
      id: activeReportId,
      title: title.trim() || `${studentName || 'Learner'} — Performance Report`,
      learnerCategory: cat,
      studentId: effectiveStudentId,
      studentUid: selectedLearner?.uid || fallbackReport?.studentUid || '',
      studentCode: selectedLearner?.studentCode || fallbackReport?.studentCode || '',
      studentName,
      studentClass: selectedLearner?.className || fallbackReport?.studentClass || '',
      programmeName:
        subjectOrProgramme.trim() ||
        selectedLearner?.programmeName ||
        fallbackReport?.programmeName ||
        '',
      schoolId:
        cat === 'SCHOOL' ? selectedLearner?.schoolId || fallbackReport?.schoolId || '' : '',
      schoolName:
        cat === 'SCHOOL' ? selectedLearner?.schoolName || fallbackReport?.schoolName || '' : '',
      schoolAdminUid:
        cat === 'SCHOOL'
          ? verifiedRecipientInfo.schoolAdminUid || fallbackReport?.schoolAdminUid || ''
          : '',
      schoolAdminName:
        cat === 'SCHOOL'
          ? verifiedRecipientInfo.schoolAdminName || fallbackReport?.schoolAdminName || ''
          : '',
      schoolAdminEmail:
        cat === 'SCHOOL'
          ? verifiedRecipientInfo.schoolAdminEmail || fallbackReport?.schoolAdminEmail || ''
          : '',
      parentId: selectedLearner?.parentId || fallbackReport?.parentId || '',
      parentUid: selectedLearner?.parentUid || fallbackReport?.parentUid || '',
      parentEmail: selectedLearner?.parentEmail || fallbackReport?.parentEmail || '',
      parentName: selectedLearner?.parentName || fallbackReport?.parentName || '',
      recipientScope,
      structuredSections: {
        ...structuredSections,
        subjectOrProgramme:
          subjectOrProgramme.trim() || selectedLearner?.programmeName || '',
        reportDate: formattedReportDateLabel,
      },
      reportDate,
      tutorUid,
      tutorName,
      reportingPeriod: reportingPeriod.trim(),
      contentHtml: html,
      saveVersionSnapshot: saveSnapshot,
    };
  };

  const handleSaveDraft = async (html: string, silent = false) => {
    if (!selectedLearner && !activeReportId) {
      if (!silent) toast.error('Please select a verified learner before saving.');
      return;
    }
    if (!silent) setSaving(true);
    try {
      const saved = await saveTutorProgressReportDraft(buildDraftPayload(html, !silent));
      setActiveReportId(saved.id);
      setActiveVersion(saved.versionNumber);
      setActiveVersions(saved.versions || []);
      setReports((prev) => {
        const exists = prev.some((r) => r.id === saved.id);
        return exists ? prev.map((r) => (r.id === saved.id ? saved : r)) : [saved, ...prev];
      });
      if (!silent) toast.success('Performance report draft saved.');
    } catch (err: any) {
      if (!silent) toast.error(err?.message || 'Unable to save performance report draft.');
    } finally {
      if (!silent) setSaving(false);
    }
  };

  const handleConfirmSendToParent = async () => {
    setSaving(true);
    try {
      const sent = await sendTutorProgressReportToParent({
        ...buildDraftPayload(contentHtml, false),
        amendmentNote: amendmentNote.trim() || undefined,
      });
      setActiveReportId(sent.id);
      setActiveStatus('SENT');
      setActiveVersion(sent.versionNumber);
      setActiveVersions(sent.versions || []);
      setShowSendConfirm(false);
      setAmendmentNote('');
      setReports((prev) => {
        const exists = prev.some((r) => r.id === sent.id);
        return exists ? prev.map((r) => (r.id === sent.id ? sent : r)) : [sent, ...prev];
      });
      const deliveredNames =
        sent.deliveredRecipients?.map((r) => r.name).join(' & ') ||
        sent.parentName ||
        'verified recipient';
      toast.success(
        activeStatus === 'SENT'
          ? `Amended performance report (v${sent.versionNumber}) published & delivered to ${deliveredNames}.`
          : `Official performance report published & sent to ${deliveredNames}.`
      );
    } catch (err: any) {
      toast.error(err?.message || 'Unable to publish performance report.');
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    const activeRecord = activeReportId ? reports.find((r) => r.id === activeReportId) : null;
    const learnerDisplayName =
      selectedLearner?.name || activeRecord?.studentName || 'Unselected Learner';
    const effectiveCategory = selectedLearner
      ? classifyLearnerType(selectedLearner)
      : activeRecord?.learnerCategory || learnerCategory;

    return (
      <div className="space-y-4">
        {/* Top Studio Navigation Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-[#111114] border border-slate-200 dark:border-zinc-800 rounded-2xl px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                void loadReports();
              }}
              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-200 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft size={14} />
              Back to Academic Reporting
            </button>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                Create Manual Performance Report — Official A4 Document Studio
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                {activeStatus === 'SENT'
                  ? 'Published report — saving changes & sending creates an audited version amendment'
                  : 'Select a verified School or Private learner, choose the authorized recipient, and draft on real multi-page A4 sheets'}
              </p>
            </div>
          </div>
        </div>

        <DocumentStudio
          documentId={activeReportId}
          title={title}
          onTitleChange={setTitle}
          contentHtml={contentHtml}
          onContentChange={setContentHtml}
          category="PERFORMANCE_REPORT"
          allowedCategories={['PERFORMANCE_REPORT']}
          versionNumber={activeVersion}
          versions={activeVersions}
          statusLabel={activeStatus}
          authorName={tutorName}
          recipientName={currentRecipientDisplayLabel}
          studentName={learnerDisplayName}
          studentClass={selectedLearner?.className || activeRecord?.studentClass}
          programmeName={
            subjectOrProgramme || selectedLearner?.programmeName || activeRecord?.programmeName
          }
          schoolName={
            effectiveCategory === 'SCHOOL'
              ? selectedLearner?.schoolName || activeRecord?.schoolName || 'Partner School'
              : 'Jaystarbliss Dynamic Institute (Private Learner)'
          }
          reportingPeriod={reportingPeriod}
          effectiveDate={formattedReportDateLabel}
          templateContext={{
            dateLabel: formattedReportDateLabel,
            structuredSections: {
              ...structuredSections,
              subjectOrProgramme: subjectOrProgramme || selectedLearner?.programmeName,
              reportDate: formattedReportDateLabel,
            },
          }}
          isBusy={saving}
          onSaveDraft={(html) => handleSaveDraft(html, false)}
          onAutosave={
            activeStatus === 'DRAFT' && Boolean(selectedLearner)
              ? (html) => handleSaveDraft(html, true)
              : undefined
          }
          onPrimarySubmit={async (html) => {
            if (!selectedLearner) {
              toast.error('Please select a verified learner before publishing.');
              return;
            }
            if (verifiedRecipientInfo.options.length === 0) {
              toast.error(
                'No verified Parent/Guardian or School Administrator recipient is linked to this learner.'
              );
              return;
            }
            setContentHtml(html);
            setShowSendConfirm(true);
          }}
          primarySubmitLabel={
            activeStatus === 'SENT' ? 'Publish Amended Report' : 'Publish & Send Report'
          }
          saveDraftLabel={activeStatus === 'SENT' ? 'Save Revision' : 'Save Draft'}
          headerSlot={
            <div className="space-y-4">
              {/* STEP 1: LEARNER CATEGORY TOGGLE (SCHOOL LEARNER vs PRIVATE LEARNER) + DIRECT NAME SEARCH */}
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-200/80 dark:border-zinc-800">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mr-1">
                    1. Learner Type:
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setLearnerCategory('SCHOOL');
                      setLearnerSearchText('');
                      const firstSchool = availableSchools[0]?.key || '';
                      setSelectedSchoolKey(firstSchool);
                      setSelectedClassKey('ALL');
                      const firstMatch = schoolLearners.find((l) => {
                        if (!firstSchool) return true;
                        const sObj = availableSchools.find((s) => s.key === firstSchool);
                        return (
                          sObj &&
                          ((sObj.id && l.schoolId === sObj.id) ||
                            (l.schoolName || '').toLowerCase() === sObj.name.toLowerCase())
                        );
                      });
                      if (firstMatch) applyLearnerSelection(firstMatch, !activeReportId);
                      else setSelectedLearnerId('');
                    }}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-2 border transition-colors cursor-pointer ${
                      learnerCategory === 'SCHOOL'
                        ? 'bg-[#0C2340] text-white border-[#0C2340]'
                        : 'bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <Building2 size={14} />
                    <span>School Learner ({schoolLearners.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setLearnerCategory('PRIVATE');
                      setLearnerSearchText('');
                      setSelectedProgrammeKey('ALL');
                      if (privateLearners[0]) {
                        applyLearnerSelection(privateLearners[0], !activeReportId);
                      } else {
                        setSelectedLearnerId('');
                      }
                    }}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-2 border transition-colors cursor-pointer ${
                      learnerCategory === 'PRIVATE'
                        ? 'bg-[#991B1B] text-white border-[#991B1B]'
                        : 'bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <UserCheck size={14} />
                    <span>Private Learner ({privateLearners.length})</span>
                  </button>
                </div>

                {/* Direct Learner Search within active category */}
                <div className="relative w-full lg:w-80">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="text"
                    value={learnerSearchText}
                    onChange={(e) => {
                      const q = e.target.value;
                      setLearnerSearchText(q);
                      if (q.trim()) {
                        const pool =
                          learnerCategory === 'SCHOOL' ? schoolLearners : privateLearners;
                        const hit = pool.find((l) =>
                          `${l.name} ${l.studentCode || ''} ${l.className || ''} ${
                            l.schoolName || ''
                          }`
                            .toLowerCase()
                            .includes(q.trim().toLowerCase())
                        );
                        if (hit && hit.id !== selectedLearnerId) {
                          applyLearnerSelection(hit, !activeReportId);
                        }
                      }
                    }}
                    placeholder={`Search ${
                      learnerCategory === 'SCHOOL' ? 'school' : 'private'
                    } learner by name or ID...`}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#991B1B]"
                  />
                </div>
              </div>

              {/* STEP 2: HIERARCHICAL LEARNER & RECIPIENT SELECTION GRID */}
              {learnerCategory === 'SCHOOL' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* 2A. Select Assigned School */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 mb-1">
                      2. Select Assigned School
                    </label>
                    <select
                      value={selectedSchoolKey}
                      onChange={(e) => {
                        const nextSchoolKey = e.target.value;
                        setSelectedSchoolKey(nextSchoolKey);
                        setSelectedClassKey('ALL');
                        const targetSchool = availableSchools.find((s) => s.key === nextSchoolKey);
                        const firstInSchool = schoolLearners.find(
                          (l) =>
                            targetSchool &&
                            ((targetSchool.id && l.schoolId === targetSchool.id) ||
                              (l.schoolName || '').toLowerCase() ===
                                targetSchool.name.toLowerCase())
                        );
                        if (firstInSchool) {
                          applyLearnerSelection(firstInSchool, !activeReportId);
                        } else {
                          setSelectedLearnerId('');
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-[#991B1B]"
                    >
                      <option value="">All Assigned Schools ({availableSchools.length})</option>
                      {availableSchools.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.name} ({s.learnerCount} learner{s.learnerCount === 1 ? '' : 's'})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 2B. Select Class / Grade */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 mb-1">
                      3. Select Class / Grade
                    </label>
                    <select
                      value={selectedClassKey}
                      onChange={(e) => {
                        const nextClass = e.target.value;
                        setSelectedClassKey(nextClass);
                        const targetSchool = availableSchools.find(
                          (s) => s.key === selectedSchoolKey
                        );
                        const firstInClass = schoolLearners.find((l) => {
                          const schoolMatch =
                            !targetSchool ||
                            (targetSchool.id && l.schoolId === targetSchool.id) ||
                            (l.schoolName || '').toLowerCase() === targetSchool.name.toLowerCase();
                          const classMatch =
                            nextClass === 'ALL' ||
                            !nextClass ||
                            (l.className || 'Unassigned Class').trim() === nextClass;
                          return schoolMatch && classMatch;
                        });
                        if (firstInClass) {
                          applyLearnerSelection(firstInClass, !activeReportId);
                        } else {
                          setSelectedLearnerId('');
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-[#991B1B]"
                    >
                      <option value="ALL">All Classes / Grades</option>
                      {availableClassesForSchool.map((cls) => (
                        <option key={cls} value={cls}>
                          {cls}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 2C. Select School Learner */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 mb-1">
                      4. Select School Learner ({filteredCategoryLearners.length})
                    </label>
                    <select
                      value={selectedLearnerId}
                      onChange={(e) => {
                        const found = learners.find((l) => l.id === e.target.value);
                        if (found) applyLearnerSelection(found, !activeReportId);
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-[#991B1B]"
                    >
                      {filteredCategoryLearners.length === 0 ? (
                        <option value="">No school learners match filter</option>
                      ) : (
                        filteredCategoryLearners.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                            {l.className ? ` • ${l.className}` : ''}
                            {l.studentCode ? ` (${l.studentCode})` : ''}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  {/* 2D. Controlled Recipient Dropdown (Parent/Guardian or School Admin) */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 mb-1">
                      5. Authorized Report Recipient
                    </label>
                    <select
                      value={recipientScope}
                      onChange={(e) =>
                        setRecipientScope(e.target.value as AuthorizedReportRecipientScope)
                      }
                      disabled={verifiedRecipientInfo.options.length === 0}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-bold text-[#0C2340] dark:text-zinc-100 focus:outline-none focus:border-[#991B1B] disabled:opacity-60"
                    >
                      {verifiedRecipientInfo.options.length === 0 ? (
                        <option value="PARENT_GUARDIAN">
                          No verified Parent or School Admin linked
                        </option>
                      ) : (
                        verifiedRecipientInfo.options.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Private 2A. Filter by Registered Programme (or All) */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 mb-1">
                      2. Filter by Registered Programme
                    </label>
                    <select
                      value={selectedProgrammeKey}
                      onChange={(e) => {
                        const nextProg = e.target.value;
                        setSelectedProgrammeKey(nextProg);
                        const firstInProg = privateLearners.find(
                          (l) =>
                            nextProg === 'ALL' || (l.programmeName || '').trim() === nextProg
                        );
                        if (firstInProg) {
                          applyLearnerSelection(firstInProg, !activeReportId);
                        } else {
                          setSelectedLearnerId('');
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-[#991B1B]"
                    >
                      <option value="ALL">
                        All Private Learners ({privateLearners.length})
                      </option>
                      {availablePrivateProgrammes.map((prog) => (
                        <option key={prog} value={prog}>
                          Programme: {prog}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Private 2B. Select Private Learner */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 mb-1">
                      3. Select Private Learner ({filteredCategoryLearners.length})
                    </label>
                    <select
                      value={selectedLearnerId}
                      onChange={(e) => {
                        const found = learners.find((l) => l.id === e.target.value);
                        if (found) applyLearnerSelection(found, !activeReportId);
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-[#991B1B]"
                    >
                      {filteredCategoryLearners.length === 0 ? (
                        <option value="">No private learners match filter</option>
                      ) : (
                        filteredCategoryLearners.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                            {l.programmeName ? ` • ${l.programmeName}` : ''}
                            {l.className ? ` (${l.className})` : ''}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  {/* Private 2C. Controlled Parent/Guardian Recipient Dropdown */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 mb-1">
                      4. Authorized Parent / Guardian Recipient
                    </label>
                    <select
                      value={recipientScope}
                      onChange={(e) =>
                        setRecipientScope(e.target.value as AuthorizedReportRecipientScope)
                      }
                      disabled={verifiedRecipientInfo.options.length === 0}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-bold text-[#0C2340] dark:text-zinc-100 focus:outline-none focus:border-[#991B1B] disabled:opacity-60"
                    >
                      {verifiedRecipientInfo.options.length === 0 ? (
                        <option value="PARENT_GUARDIAN">
                          No Parent / Guardian linked to this private learner
                        </option>
                      ) : (
                        verifiedRecipientInfo.options.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>
              )}

              {/* STEP 3: AUTO-POPULATED VERIFIED LEARNER & RECIPIENT SUMMARY STRIP */}
              {selectedLearner ? (
                <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
                    <span className="inline-flex items-center gap-1.5 font-bold text-[#0C2340] dark:text-white">
                      <ShieldCheck size={14} className="text-emerald-600 shrink-0" />
                      <span>Verified Learner:</span>
                      <span>{selectedLearner.name}</span>
                      {selectedLearner.studentCode && (
                        <span className="font-mono text-[11px] text-slate-500">
                          ({selectedLearner.studentCode})
                        </span>
                      )}
                    </span>

                    <span className="text-slate-600 dark:text-zinc-300">
                      <strong className="text-slate-500 dark:text-zinc-400">
                        {effectiveCategory === 'SCHOOL' ? 'School & Class:' : 'Enrolment & Level:'}
                      </strong>{' '}
                      {effectiveCategory === 'SCHOOL'
                        ? [selectedLearner.schoolName, selectedLearner.className]
                            .filter(Boolean)
                            .join(' • ')
                        : [
                            'Private Enrolment',
                            selectedLearner.className,
                            selectedLearner.programmeName,
                          ]
                            .filter(Boolean)
                            .join(' • ')}
                    </span>

                    <span className="text-slate-600 dark:text-zinc-300">
                      <strong className="text-slate-500 dark:text-zinc-400">Linked Guardian:</strong>{' '}
                      {verifiedRecipientInfo.hasParent ? (
                        <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                          {selectedLearner.parentName || 'Verified Parent'}
                          {selectedLearner.parentEmail ? ` (${selectedLearner.parentEmail})` : ''}
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 font-semibold inline-flex items-center gap-1">
                          <AlertTriangle size={12} /> Not Linked
                        </span>
                      )}
                    </span>
                  </div>

                  <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                    Identity fields are locked to verified portal records
                  </span>
                </div>
              ) : (
                <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/80 dark:bg-amber-950/30 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
                  <AlertTriangle size={14} className="shrink-0" />
                  <span>
                    No learner selected. Choose a School Learner or Private Learner above to
                    auto-populate verified student and recipient details.
                  </span>
                </div>
              )}

              {/* STEP 4: REPORT DETAILS & COLLAPSIBLE GUIDED PERFORMANCE BUILDER */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 mb-1">
                    Subject / Programme Covered
                  </label>
                  <input
                    type="text"
                    value={subjectOrProgramme}
                    onChange={(e) => setSubjectOrProgramme(e.target.value)}
                    placeholder="e.g. Robotics & Physical Computing"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#991B1B]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 mb-1">
                    Assessment Period / Duration
                  </label>
                  <input
                    type="text"
                    value={reportingPeriod}
                    onChange={(e) => setReportingPeriod(e.target.value)}
                    placeholder="e.g. Term 2 Progress Report • Weeks 1–6"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#991B1B]"
                  />
                </div>

                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-zinc-300 mb-1">
                      Report Date
                    </label>
                    <input
                      type="date"
                      value={reportDate}
                      onChange={(e) => setReportDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#991B1B]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowGuidedSections((prev) => !prev)}
                    className={`px-3 py-2 rounded-xl border text-xs font-bold inline-flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer ${
                      showGuidedSections
                        ? 'bg-[#0C2340] text-white border-[#0C2340]'
                        : 'bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-200 border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800'
                    }`}
                    title="Toggle Guided Observations & Performance Builder"
                  >
                    <SlidersHorizontal size={13} />
                    <span>Guided Sections</span>
                    {showGuidedSections ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                </div>
              </div>

              {/* Collapsible Guided Observations & Performance Builder */}
              {showGuidedSections && (
                <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/80 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                        Guided Performance &amp; Observations Builder
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                        Fill in any of these structured sections and click &ldquo;Apply to A4
                        Document&rdquo; to populate the official report layout below.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleApplyGuidedSectionsToDocument}
                      className="px-3.5 py-1.5 rounded-lg bg-[#991B1B] hover:bg-[#7F1D1D] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <GraduationCap size={13} />
                      <span>Apply to A4 Document</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                        Performance Indicators &amp; Executive Summary
                      </label>
                      <textarea
                        rows={2}
                        value={structuredSections.performanceIndicatorsSummary || ''}
                        onChange={(e) =>
                          setStructuredSections((prev) => ({
                            ...prev,
                            performanceIndicatorsSummary: e.target.value,
                          }))
                        }
                        placeholder="Summarize overall progress, assessment trajectory, and engagement..."
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-950 text-xs text-slate-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                        Learning Objectives &amp; Competencies Covered
                      </label>
                      <textarea
                        rows={2}
                        value={structuredSections.learningObjectivesCovered || ''}
                        onChange={(e) =>
                          setStructuredSections((prev) => ({
                            ...prev,
                            learningObjectivesCovered: e.target.value,
                          }))
                        }
                        placeholder="Core modules, technical concepts, or creative skills covered this period..."
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-950 text-xs text-slate-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                        Key Strengths &amp; Milestones (one bullet per line)
                      </label>
                      <textarea
                        rows={2}
                        value={structuredSections.keyStrengths || ''}
                        onChange={(e) =>
                          setStructuredSections((prev) => ({
                            ...prev,
                            keyStrengths: e.target.value,
                          }))
                        }
                        placeholder="e.g. Completed autonomous sensor challenge ahead of schedule"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-950 text-xs text-slate-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                        Areas for Improvement (one bullet per line)
                      </label>
                      <textarea
                        rows={2}
                        value={structuredSections.areasForImprovement || ''}
                        onChange={(e) =>
                          setStructuredSections((prev) => ({
                            ...prev,
                            areasForImprovement: e.target.value,
                          }))
                        }
                        placeholder="e.g. Debugging syntax errors independently before requesting hints"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-950 text-xs text-slate-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                        Tutor Observations, Conduct &amp; Practical Projects
                      </label>
                      <textarea
                        rows={2}
                        value={structuredSections.tutorObservations || ''}
                        onChange={(e) =>
                          setStructuredSections((prev) => ({
                            ...prev,
                            tutorObservations: e.target.value,
                          }))
                        }
                        placeholder="Classroom focus, collaboration, practical builds, and participation..."
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-950 text-xs text-slate-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                        Recommendations &amp; Next Steps (one item per line)
                      </label>
                      <textarea
                        rows={2}
                        value={structuredSections.recommendationsAndNextSteps || ''}
                        onChange={(e) =>
                          setStructuredSections((prev) => ({
                            ...prev,
                            recommendationsAndNextSteps: e.target.value,
                          }))
                        }
                        placeholder="e.g. Practice 30 minutes of weekly algorithm drills on the student portal"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-950 text-xs text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          }
        />

        {/* Send Confirmation Modal */}
        {showSendConfirm && (
          <div
            className="fixed inset-0 z-[85] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#111114] border border-slate-200 dark:border-zinc-800 shadow-2xl p-6 space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {activeStatus === 'SENT'
                    ? 'Send Amended Performance Report?'
                    : 'Publish & Send Official Performance Report?'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                  Learner: <strong>{learnerDisplayName}</strong> ({effectiveCategory} LEARNER)
                </p>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                  Authorized Recipient: <strong>{currentRecipientDisplayLabel}</strong>
                </p>
              </div>

              <p className="text-xs text-slate-600 dark:text-zinc-300 leading-relaxed">
                This will publish the report immediately in the official Jaystarbliss A4 format,
                record an immutable version snapshot (v
                {activeStatus === 'SENT' ? activeVersion + 1 : activeVersion}), and notify the
                selected authorized recipient(s).
              </p>

              {activeStatus === 'SENT' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                    Amendment Note (recorded in version history)
                  </label>
                  <input
                    type="text"
                    value={amendmentNote}
                    onChange={(e) => setAmendmentNote(e.target.value)}
                    placeholder="e.g. Updated project feedback after lab showcase"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#991B1B]"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setShowSendConfirm(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-semibold text-slate-700 dark:text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleConfirmSendToParent()}
                  className="px-4 py-2 rounded-xl bg-[#991B1B] hover:bg-[#7F1D1D] text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-60"
                >
                  <Send size={13} />
                  {saving ? 'Delivering...' : 'Confirm & Send'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-zinc-800">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Manual Tutor Performance &amp; Progress Reports
          </h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            Select an assigned School Learner or Private Learner, compose structured observations in
            the multi-page A4 Document Studio, and deliver to verified Parents/Guardians or School
            Administrators.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void loadReports()}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800"
            title="Refresh reports"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={() => startNewReport()}
            className="px-4 py-2.5 rounded-xl bg-[#991B1B] hover:bg-[#7F1D1D] text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus size={15} />
            Create Manual Performance Report
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
          {(['ALL', 'DRAFT', 'SENT'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                statusFilter === tab
                  ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab === 'ALL' ? `All (${reports.length})` : tab === 'DRAFT' ? 'Drafts' : 'Published & Sent'}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by learner, school, title, period..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#991B1B]"
          />
        </div>
      </div>

      {/* Reports Table */}
      {loading ? (
        <div className="py-12 text-center text-xs text-slate-500 dark:text-zinc-400">
          Loading progress reports...
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="p-10 rounded-2xl border-2 border-dashed border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#111114] text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-red-50 dark:bg-red-950/40 text-[#991B1B] dark:text-red-400 flex items-center justify-center mx-auto">
            <FileText size={22} />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            No manual tutor performance reports yet
          </h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-md mx-auto">
            Use the Official A4 Document Studio to draft personalized performance reports for your
            School or Private learners and deliver them to verified recipients.
          </p>
          <button
            type="button"
            onClick={() => startNewReport()}
            className="px-4 py-2 rounded-xl bg-[#991B1B] hover:bg-[#7F1D1D] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus size={14} /> Create First Performance Report
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#111114] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/70 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                  <th className="py-3 px-4">Report Title &amp; Period</th>
                  <th className="py-3 px-4">Learner &amp; Category</th>
                  <th className="py-3 px-4">Authorized Recipient</th>
                  <th className="py-3 px-4">Status &amp; Version</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                {filteredReports.map((rep) => {
                  const recipientSummary =
                    rep.deliveredRecipients && rep.deliveredRecipients.length > 0
                      ? rep.deliveredRecipients
                          .map((r) =>
                            r.role === 'SCHOOL_ADMIN'
                              ? `School Admin (${r.name})`
                              : `Parent (${r.name})`
                          )
                          .join(' & ')
                      : rep.recipientScope === 'SCHOOL_ADMIN'
                      ? `School Admin (${rep.schoolAdminName || rep.schoolName || 'School'})`
                      : rep.recipientScope === 'BOTH'
                      ? `Parent & School Admin`
                      : rep.parentName || rep.parentEmail || 'Parent / Guardian';

                  return (
                    <tr
                      key={rep.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-zinc-900/60 transition-colors"
                    >
                      <td className="py-3.5 px-4">
                        <p className="font-bold text-slate-900 dark:text-white">{rep.title}</p>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                          {rep.reportingPeriod || 'Progress Update'}
                        </p>
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-slate-800 dark:text-zinc-200">
                          {rep.studentName}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                          {[
                            rep.learnerCategory === 'SCHOOL' || rep.schoolName
                              ? rep.schoolName || 'School Learner'
                              : 'Private Learner',
                            rep.studentClass,
                            rep.programmeName,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </td>
                      <td className="py-3.5 px-4">
                        <p className="font-medium text-slate-700 dark:text-zinc-300">
                          {recipientSummary}
                        </p>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {rep.status === 'SENT' ? (
                            <CheckCircle2
                              size={13}
                              className="text-emerald-600 dark:text-emerald-400"
                            />
                          ) : (
                            <Clock size={13} className="text-amber-600 dark:text-amber-400" />
                          )}
                          <span
                            className={`font-bold uppercase text-[11px] ${
                              rep.status === 'SENT'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-amber-700 dark:text-amber-400'
                            }`}
                          >
                            {rep.status === 'SENT' ? 'Sent' : 'Draft'}
                          </span>
                          <span className="text-slate-400 dark:text-zinc-500 tabular-nums">
                            · v{rep.versionNumber || 1}
                          </span>
                        </div>
                        {rep.sentAt && (
                          <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5 tabular-nums">
                            {new Date(rep.sentAt).toLocaleDateString('en-GB')}
                          </p>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openExistingReport(rep)}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200 font-semibold inline-flex items-center gap-1"
                          >
                            <Edit3 size={12} />
                            <span>{rep.status === 'SENT' ? 'Amend' : 'Edit'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewDoc({
                                id: rep.id,
                                title: rep.title,
                                category: 'PERFORMANCE_REPORT',
                                contentHtml: rep.contentHtml,
                                versionNumber: rep.versionNumber,
                                status: rep.status,
                                authorName: rep.tutorName,
                                recipientName: recipientSummary,
                                studentName: rep.studentName,
                                studentClass: rep.studentClass,
                                programmeName: rep.programmeName,
                                schoolName: rep.schoolName,
                                reportingPeriod: rep.reportingPeriod,
                              })
                            }
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300"
                            title="Preview Official A4"
                          >
                            <Eye size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void exportStudioDocumentAsPdf({
                                id: rep.id,
                                title: rep.title,
                                category: 'PERFORMANCE_REPORT',
                                contentHtml: rep.contentHtml,
                                versionNumber: rep.versionNumber,
                                status: rep.status,
                                authorName: rep.tutorName,
                                recipientName: recipientSummary,
                                studentName: rep.studentName,
                                studentClass: rep.studentClass,
                                programmeName: rep.programmeName,
                                schoolName: rep.schoolName,
                                reportingPeriod: rep.reportingPeriod,
                              })
                            }
                            className="p-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800 text-[#991B1B] dark:text-red-400"
                            title="Download Official PDF"
                          >
                            <FileDown size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {previewDoc && (
        <FullPagePreviewModal
          isOpen={Boolean(previewDoc)}
          onClose={() => setPreviewDoc(null)}
          documentData={previewDoc}
        />
      )}
    </div>
  );
};

export default TutorProgressReportsWorkspace;
