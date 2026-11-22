import React, { useState, useMemo } from 'react';
import {
  X,
  Building2,
  User,
  Users,
  Search,
  Check,
  GraduationCap,
  ShieldCheck,
  Filter,
  BookOpen,
  UserX,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import {
  CANONICAL_CLASSES,
  classifyStudentEnrolment,
  expandGradeRange,
  normalizeClassName,
} from '../../lib/classes';
import { buildProgramTree, type ProgramRecord, type ProgramTreeNode } from '../../lib/programHierarchy';

export interface RecipientSchool {
  id: string;
  name: string;
  code?: string;
}

export interface RecipientPrivateStudent {
  id: string;
  name: string;
  fullName?: string;
  className?: string;
  grade?: string;
  class?: string;
  email?: string;
  parentId?: string;
  parentName?: string;
  parentEmail?: string;
  schoolId?: string;
  schoolName?: string;
  studentType?: string;
  assignmentCategory?: string;
  privateSubType?: 'parent' | 'individual' | null;
  privateLabel?: string;
  plan?: string;
  track?: string;
}

export interface RecipientSelectionResult {
  recipientType: 'ALL' | 'SCHOOL' | 'PRIVATE';
  recipientMode: 'SCHOOL_CLASS' | 'PRIVATE_LEARNERS' | 'MULTI_TARGET';
  targetSchoolIds: string[];
  targetStudentIds: string[];
  excludedStudentIds: string[];
  classScopeMode: 'ALL' | 'SELECTED' | 'RANGE';
  gradeTargetMode: 'ALL' | 'SPECIFIC' | 'RANGE';
  gradeRange: { from: string; to: string } | null;
  selectedClasses: string[];
  targetProgramIds: string[];
  targetProgramTitles: string[];
}

interface RecipientSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  schools?: RecipientSchool[];
  availableSchools?: RecipientSchool[];
  privateStudents?: RecipientPrivateStudent[];
  availablePrivateStudents?: RecipientPrivateStudent[];
  schoolStudents?: RecipientPrivateStudent[];
  programsMap?: Map<string, ProgramRecord>;
  initialRecipientType?: 'ALL' | 'SCHOOL' | 'PRIVATE';
  initialSchoolIds?: string[];
  initialSelectedSchoolIds?: string[];
  initialStudentIds?: string[];
  initialSelectedStudentIds?: string[];
  initialExcludedStudentIds?: string[];
  initialClassScopeMode?: 'ALL' | 'SELECTED' | 'RANGE';
  initialGradeRange?: { from: string; to: string } | null;
  initialSelectedClasses?: string[];
  initialTargetProgramIds?: string[];
  isTutor?: boolean;
  onApply?: (result: RecipientSelectionResult) => void;
  onConfirm?: (result: RecipientSelectionResult) => void;
}

const EMPTY_STRING_ARRAY: string[] = [];
const EMPTY_STUDENT_ARRAY: RecipientPrivateStudent[] = [];

export const RecipientSelectorModal: React.FC<RecipientSelectorModalProps> = ({
  isOpen,
  onClose,
  schools: schoolsProp,
  availableSchools,
  privateStudents: privateStudentsProp,
  availablePrivateStudents,
  schoolStudents = EMPTY_STUDENT_ARRAY,
  programsMap,
  initialRecipientType,
  initialSchoolIds,
  initialSelectedSchoolIds,
  initialStudentIds,
  initialSelectedStudentIds,
  initialExcludedStudentIds = EMPTY_STRING_ARRAY,
  initialClassScopeMode = 'ALL',
  initialGradeRange = null,
  initialSelectedClasses = EMPTY_STRING_ARRAY,
  initialTargetProgramIds = EMPTY_STRING_ARRAY,
  onApply,
  onConfirm,
}) => {
  const schools = useMemo(() => schoolsProp || availableSchools || [], [schoolsProp, availableSchools]);
  const privateStudents = useMemo(
    () => privateStudentsProp || availablePrivateStudents || [],
    [privateStudentsProp, availablePrivateStudents]
  );
  const resolvedInitSchoolIds = useMemo(
    () => initialSchoolIds || initialSelectedSchoolIds || EMPTY_STRING_ARRAY,
    [initialSchoolIds, initialSelectedSchoolIds]
  );
  const resolvedInitStudentIds = useMemo(
    () => initialStudentIds || initialSelectedStudentIds || EMPTY_STRING_ARRAY,
    [initialStudentIds, initialSelectedStudentIds]
  );
  const resolvedInitType: 'ALL' | 'SCHOOL' | 'PRIVATE' = useMemo(() => {
    if (initialRecipientType) return initialRecipientType;
    if (resolvedInitStudentIds.length > 0 && resolvedInitSchoolIds.length === 0) return 'PRIVATE';
    if (resolvedInitSchoolIds.length > 0 && resolvedInitStudentIds.length === 0) return 'SCHOOL';
    return 'ALL';
  }, [initialRecipientType, resolvedInitSchoolIds, resolvedInitStudentIds]);

  const [recipientType, setRecipientType] = useState<'ALL' | 'SCHOOL' | 'PRIVATE'>(
    resolvedInitType
  );
  const [targetSchoolIds, setTargetSchoolIds] = useState<string[]>(resolvedInitSchoolIds);
  const [targetStudentIds, setTargetStudentIds] = useState<string[]>(resolvedInitStudentIds);
  const [excludedStudentIds, setExcludedStudentIds] = useState<string[]>(initialExcludedStudentIds);
  const [classScopeMode, setClassScopeMode] = useState<'ALL' | 'SELECTED' | 'RANGE'>(initialClassScopeMode);
  const [selectedClasses, setSelectedClasses] = useState<string[]>(initialSelectedClasses);
  const [gradeRangeFrom, setGradeRangeFrom] = useState<string>(
    initialGradeRange?.from || 'Grade 1'
  );
  const [gradeRangeTo, setGradeRangeTo] = useState<string>(
    initialGradeRange?.to || 'Grade 6'
  );
  const [targetProgramIds, setTargetProgramIds] = useState<string[]>(initialTargetProgramIds);
  const [programSearch, setProgramSearch] = useState('');
  const [expandedProgramIds, setExpandedProgramIds] = useState<Set<string>>(new Set());
  const [excludeSearch, setExcludeSearch] = useState('');
  const [showExcludeSection, setShowExcludeSection] = useState(initialExcludedStudentIds.length > 0);
  const [searchQuery, setSearchQuery] = useState('');
  const [privateCategoryFilter, setPrivateCategoryFilter] = useState<'ALL' | 'PARENT' | 'INDIVIDUAL'>('ALL');
  const [schoolStudentFilterMode, setSchoolStudentFilterMode] = useState<'ALL' | 'SELECTED'>(
    resolvedInitType === 'SCHOOL' && resolvedInitStudentIds.length > 0 ? 'SELECTED' : 'ALL'
  );
  const [schoolStudentSearch, setSchoolStudentSearch] = useState('');
  const prevOpenRef = React.useRef<boolean>(false);

  // Reset state strictly when modal transitions from closed to open
  React.useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      setRecipientType(resolvedInitType);
      setTargetSchoolIds(resolvedInitSchoolIds);
      setTargetStudentIds(resolvedInitStudentIds);
      setExcludedStudentIds(initialExcludedStudentIds);
      setClassScopeMode(initialClassScopeMode);
      setSelectedClasses(initialSelectedClasses);
      setGradeRangeFrom(initialGradeRange?.from || 'Grade 1');
      setGradeRangeTo(initialGradeRange?.to || 'Grade 6');
      setTargetProgramIds(initialTargetProgramIds);
      setProgramSearch('');
      setExcludeSearch('');
      setShowExcludeSection(initialExcludedStudentIds.length > 0);
      setSearchQuery('');
      setPrivateCategoryFilter('ALL');
      setSchoolStudentFilterMode(
        resolvedInitType === 'SCHOOL' && resolvedInitStudentIds.length > 0 ? 'SELECTED' : 'ALL'
      );
      setSchoolStudentSearch('');
    }
    prevOpenRef.current = isOpen;
  }, [
    isOpen,
    resolvedInitType,
    resolvedInitSchoolIds,
    resolvedInitStudentIds,
    initialExcludedStudentIds,
    initialClassScopeMode,
    initialGradeRange,
    initialSelectedClasses,
    initialTargetProgramIds,
  ]);

  const filteredSchools = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return schools;
    return schools.filter(
      (s) =>
        s.name.toLowerCase().includes(q) || (s.code && s.code.toLowerCase().includes(q))
    );
  }, [schools, searchQuery]);

  // Strictly filter privateStudents to ONLY genuine Parent-Enrolled or Individually-Enrolled private students
  const verifiedPrivateStudents = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<RecipientPrivateStudent & { resolvedSubType: 'parent' | 'individual'; resolvedLabel: string }> = [];

    for (const s of privateStudents) {
      if (!s || !s.id || seen.has(s.id)) continue;
      const classification = classifyStudentEnrolment({
        ...s,
        fullName: s.name || s.fullName,
        studentType: s.studentType || (s.privateSubType === 'parent' ? 'parent' : s.privateSubType === 'individual' ? 'personal' : ''),
      });
      const isExplicitPrivate =
        s.assignmentCategory === 'private' && (!s.schoolId || s.schoolId === 'private');
      if (classification.isSchool || (!classification.isPrivate && !isExplicitPrivate)) continue;
      seen.add(s.id);
      const resolvedSubType: 'parent' | 'individual' =
        s.privateSubType === 'parent' || classification.privateSubType === 'parent' || Boolean(s.parentId || s.parentName)
          ? 'parent'
          : 'individual';
      const resolvedLabel =
        resolvedSubType === 'parent' ? 'Parent-Enrolled Private' : 'Individual Private';
      list.push({
        ...s,
        name: s.name || s.fullName || 'Private Learner',
        resolvedSubType,
        resolvedLabel,
      });
    }
    return list;
  }, [privateStudents]);

  const filteredPrivateStudents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return verifiedPrivateStudents.filter((s) => {
      if (privateCategoryFilter === 'PARENT' && s.resolvedSubType !== 'parent') return false;
      if (privateCategoryFilter === 'INDIVIDUAL' && s.resolvedSubType !== 'individual') return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.grade && s.grade.toLowerCase().includes(q)) ||
        (s.email && s.email.toLowerCase().includes(q)) ||
        (s.parentName && s.parentName.toLowerCase().includes(q)) ||
        (s.parentEmail && s.parentEmail.toLowerCase().includes(q)) ||
        (s.plan && s.plan.toLowerCase().includes(q))
      );
    });
  }, [verifiedPrivateStudents, privateCategoryFilter, searchQuery]);

  const parentPrivateCount = useMemo(
    () => verifiedPrivateStudents.filter((s) => s.resolvedSubType === 'parent').length,
    [verifiedPrivateStudents]
  );
  const individualPrivateCount = useMemo(
    () => verifiedPrivateStudents.filter((s) => s.resolvedSubType === 'individual').length,
    [verifiedPrivateStudents]
  );

  // Filter schoolStudents matching selected Partner Schools & selected Classes
  const matchingSchoolStudents = useMemo(() => {
    if (targetSchoolIds.length === 0) return [];
    const selectedSchoolSet = new Set(targetSchoolIds.map((id) => id.toLowerCase()));
    const selectedSchoolNames = new Set(
      schools
        .filter((s) => targetSchoolIds.includes(s.id))
        .map((s) => s.name.trim().toLowerCase())
    );
    const q = schoolStudentSearch.trim().toLowerCase();

    return schoolStudents.filter((st) => {
      const stSchoolId = String(st.schoolId || '').trim().toLowerCase();
      const stSchoolName = String(st.schoolName || '').trim().toLowerCase();
      const matchesSchool =
        (stSchoolId && selectedSchoolSet.has(stSchoolId)) ||
        (stSchoolName && selectedSchoolNames.has(stSchoolName));
      if (!matchesSchool) return false;

      if (classScopeMode === 'SELECTED' && selectedClasses.length > 0) {
        const stGrade = String(st.grade || st.class || '').trim();
        if (!selectedClasses.includes(stGrade)) return false;
      }

      if (q) {
        return (
          st.name.toLowerCase().includes(q) ||
          (st.grade && st.grade.toLowerCase().includes(q)) ||
          (st.email && st.email.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [schoolStudents, targetSchoolIds, schools, classScopeMode, selectedClasses, schoolStudentSearch]);

  const expandedRangeClasses = useMemo(
    () => (classScopeMode === 'RANGE' ? expandGradeRange(gradeRangeFrom, gradeRangeTo) : []),
    [classScopeMode, gradeRangeFrom, gradeRangeTo]
  );

  const effectiveClasses = useMemo(
    () =>
      classScopeMode === 'RANGE'
        ? expandedRangeClasses
        : classScopeMode === 'SELECTED'
        ? selectedClasses
        : [],
    [classScopeMode, expandedRangeClasses, selectedClasses]
  );

  const programTreeRoots = useMemo(() => {
    if (!programsMap || programsMap.size === 0) return [] as ProgramTreeNode[];
    const tree = buildProgramTree(Array.from(programsMap.values()).filter((p) => !p.isArchived));
    const allRoots = [...tree.roots, ...tree.unassigned];
    const q = programSearch.trim().toLowerCase();
    if (!q) return allRoots;
    const filterRec = (nodes: ProgramTreeNode[]): ProgramTreeNode[] => {
      const out: ProgramTreeNode[] = [];
      for (const n of nodes) {
        const children = filterRec(n.children);
        if (
          n.program.title.toLowerCase().includes(q) ||
          n.breadcrumbPath.toLowerCase().includes(q) ||
          children.length > 0
        ) {
          out.push({ ...n, children });
        }
      }
      return out;
    };
    return filterRec(allRoots);
  }, [programsMap, programSearch]);

  // Candidate students for exclusion picker (within active scope)
  const excludableCandidates = useMemo(() => {
    const pool =
      recipientType === 'PRIVATE'
        ? verifiedPrivateStudents
        : recipientType === 'SCHOOL'
        ? matchingSchoolStudents
        : [...schoolStudents, ...verifiedPrivateStudents];
    const q = excludeSearch.trim().toLowerCase();
    const seen = new Set<string>();
    return pool.filter((st) => {
      if (!st.id || seen.has(st.id)) return false;
      seen.add(st.id);
      if (effectiveClasses.length > 0) {
        const stGrade = normalizeClassName(st.grade || st.className || st.class || '');
        if (stGrade && !effectiveClasses.includes(stGrade)) return false;
      }
      if (!q) return true;
      return (
        (st.name || st.fullName || '').toLowerCase().includes(q) ||
        (st.schoolName || '').toLowerCase().includes(q) ||
        (st.grade || st.className || '').toLowerCase().includes(q)
      );
    });
  }, [recipientType, verifiedPrivateStudents, matchingSchoolStudents, schoolStudents, effectiveClasses, excludeSearch]);

  if (!isOpen) return null;

  const toggleSchool = (id: string) => {
    setTargetSchoolIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleStudent = (id: string) => {
    setTargetStudentIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleExcludedStudent = (id: string) => {
    setExcludedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleProgram = (id: string) => {
    setTargetProgramIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleExpandProgram = (id: string) => {
    setExpandedProgramIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleClass = (cls: string) => {
    setSelectedClasses((prev) =>
      prev.includes(cls) ? prev.filter((item) => item !== cls) : [...prev, cls]
    );
  };

  const renderProgramOption = (node: ProgramTreeNode): React.ReactNode => {
    const p = node.program;
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedProgramIds.has(p.id) || Boolean(programSearch.trim());
    const checked = targetProgramIds.includes(p.id);

    return (
      <div key={p.id}>
        <div
          className={`flex items-center justify-between gap-2 px-3 py-2 text-xs transition-colors ${
            checked
              ? 'bg-red-50/70 dark:bg-red-950/25 text-slate-900 dark:text-white'
              : 'hover:bg-slate-50 dark:hover:bg-[#18181B] text-slate-700 dark:text-zinc-300'
          }`}
          style={{ paddingLeft: `${12 + Math.min(node.depth, 6) * 18}px` }}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggleExpandProgram(p.id)}
                className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                aria-label={isExpanded ? 'Collapse sub-programmes' : 'Expand sub-programmes'}
              >
                {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>
            ) : (
              <span className="w-4 text-center text-slate-300 dark:text-zinc-700">·</span>
            )}
            <button
              type="button"
              onClick={() => toggleProgram(p.id)}
              className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
            >
              <span
                className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 transition-colors ${
                  checked
                    ? 'bg-[#B91C1C] border-[#B91C1C] text-white'
                    : 'border-slate-300 dark:border-zinc-700'
                }`}
              >
                {checked && <Check size={11} />}
              </span>
              <span className="font-semibold truncate">{p.title}</span>
              {hasChildren && (
                <span className="text-[10px] text-slate-400 dark:text-zinc-500 shrink-0">
                  · {node.children.length} sub
                </span>
              )}
            </button>
          </div>
        </div>
        {hasChildren && isExpanded && (
          <div>{node.children.map((child) => renderProgramOption(child))}</div>
        )}
      </div>
    );
  };

  const handleApply = () => {
    const cleanSchoolIds =
      recipientType === 'ALL'
        ? schools.map((s) => s.id)
        : recipientType === 'SCHOOL'
        ? targetSchoolIds
        : [];

    const cleanStudentIds =
      recipientType === 'ALL'
        ? verifiedPrivateStudents.map((s) => s.id)
        : recipientType === 'PRIVATE'
        ? targetStudentIds.filter((id) => verifiedPrivateStudents.some((s) => s.id === id))
        : recipientType === 'SCHOOL' && schoolStudentFilterMode === 'SELECTED'
        ? targetStudentIds.filter((id) => matchingSchoolStudents.some((s) => s.id === id))
        : [];

    const computedRecipientMode: 'SCHOOL_CLASS' | 'PRIVATE_LEARNERS' | 'MULTI_TARGET' =
      recipientType === 'PRIVATE'
        ? 'PRIVATE_LEARNERS'
        : recipientType === 'ALL' || cleanSchoolIds.length > 1
        ? 'MULTI_TARGET'
        : 'SCHOOL_CLASS';

    const resolvedGradeRange =
      classScopeMode === 'RANGE' && expandedRangeClasses.length > 0
        ? {
            from: expandedRangeClasses[0],
            to: expandedRangeClasses[expandedRangeClasses.length - 1],
          }
        : null;

    const resolvedProgramTitles = targetProgramIds
      .map((pid) => programsMap?.get(pid)?.title || '')
      .filter(Boolean);

    const result: RecipientSelectionResult = {
      recipientType,
      recipientMode: computedRecipientMode,
      targetSchoolIds: cleanSchoolIds,
      targetStudentIds: cleanStudentIds,
      excludedStudentIds,
      classScopeMode,
      gradeTargetMode:
        classScopeMode === 'RANGE'
          ? 'RANGE'
          : classScopeMode === 'SELECTED'
          ? 'SPECIFIC'
          : 'ALL',
      gradeRange: resolvedGradeRange,
      selectedClasses: effectiveClasses,
      targetProgramIds,
      targetProgramTitles: resolvedProgramTitles,
    };

    if (onApply) onApply(result);
    if (onConfirm) onConfirm(result);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white dark:bg-[#111114] border border-slate-200 dark:border-zinc-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-zinc-800">
          <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
            Target Recipients, Grades &amp; Programmes
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Step 1: Recipient Category */}
          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">
              1. Recipient Audience Type
            </label>
            <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
              {[
                {
                  id: 'ALL' as const,
                  label: 'All Students',
                  sub: 'All Assigned Cohorts',
                  icon: Users,
                },
                {
                  id: 'SCHOOL' as const,
                  label: 'Partner Schools',
                  sub: `${schools.length} Available`,
                  icon: Building2,
                },
                {
                  id: 'PRIVATE' as const,
                  label: 'Private Students',
                  sub: `${verifiedPrivateStudents.length} Enrolled`,
                  icon: User,
                },
              ].map((tab) => {
                const Icon = tab.icon;
                const active = recipientType === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setRecipientType(tab.id);
                      setSearchQuery('');
                      if (tab.id !== 'SCHOOL') {
                        setSchoolStudentFilterMode('ALL');
                      }
                    }}
                    className={`p-2.5 sm:p-3 rounded-xl border text-left transition-all cursor-pointer flex items-start gap-2 sm:gap-2.5 ${
                      active
                        ? 'border-[#1E293B] dark:border-slate-300 bg-slate-50 dark:bg-slate-800/80 ring-1 ring-[#1E293B]/20'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    <div
                      className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        active
                          ? 'bg-[#1E293B] dark:bg-white text-white dark:text-[#1E293B]'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                      }`}
                    >
                      <Icon size={15} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] sm:text-xs font-black text-slate-900 dark:text-white truncate">
                        {tab.label}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">{tab.sub}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Specific School or Private Student Selection */}
          {recipientType === 'SCHOOL' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <label className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                  2. Choose Partner Schools ({targetSchoolIds.length} Selected)
                </label>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setTargetSchoolIds(schools.map((s) => s.id))}
                    className="text-[#B91C1C] dark:text-red-400 font-bold hover:underline cursor-pointer"
                  >
                    Select All
                  </button>
                  <span className="text-slate-300">·</span>
                  <button
                    type="button"
                    onClick={() => setTargetSchoolIds([])}
                    className="text-slate-500 font-semibold hover:underline cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter partner schools by name or code..."
                  className="w-full h-9 pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#1E293B] dark:focus:border-slate-400"
                />
              </div>

              <div className="max-h-44 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredSchools.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    No matching partner schools found.
                  </div>
                ) : (
                  filteredSchools.map((school) => {
                    const checked = targetSchoolIds.includes(school.id);
                    return (
                      <button
                        key={school.id}
                        type="button"
                        onClick={() => toggleSchool(school.id)}
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 cursor-pointer text-left transition-colors ${
                          checked
                            ? 'bg-slate-100/80 dark:bg-slate-800/60'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-4 h-4 rounded flex items-center justify-center border transition-colors shrink-0 ${
                              checked
                                ? 'bg-[#1E293B] border-[#1E293B] dark:bg-white dark:border-white text-white dark:text-[#1E293B]'
                                : 'border-slate-300 dark:border-slate-700'
                            }`}
                          >
                            {checked && <Check size={11} />}
                          </div>
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                            {school.name}
                          </span>
                        </div>
                        {school.code && (
                          <span className="text-[10px] font-mono text-slate-400 shrink-0 ml-2">
                            {school.code}
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {recipientType === 'PRIVATE' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                  2. Choose Private Learners ({targetStudentIds.length} Selected)
                </label>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() =>
                      setTargetStudentIds(filteredPrivateStudents.map((s) => s.id))
                    }
                    className="text-[#B91C1C] dark:text-red-400 font-bold hover:underline cursor-pointer"
                  >
                    Select Visible ({filteredPrivateStudents.length})
                  </button>
                  <span className="text-slate-300">·</span>
                  <button
                    type="button"
                    onClick={() => setTargetStudentIds([])}
                    className="text-slate-500 font-semibold hover:underline cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* Sub-filter between Parent-Enrolled Private and Individually-Enrolled Private */}
              <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl">
                {[
                  {
                    id: 'ALL' as const,
                    label: `All Private (${verifiedPrivateStudents.length})`,
                  },
                  {
                    id: 'PARENT' as const,
                    label: `Parent-Enrolled (${parentPrivateCount})`,
                  },
                  {
                    id: 'INDIVIDUAL' as const,
                    label: `Individual Private (${individualPrivateCount})`,
                  },
                ].map((subTab) => (
                  <button
                    key={subTab.id}
                    type="button"
                    onClick={() => setPrivateCategoryFilter(subTab.id)}
                    className={`flex-1 min-w-[110px] py-1.5 px-2.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                      privateCategoryFilter === subTab.id
                        ? 'bg-white dark:bg-slate-900 text-[#B91C1C] dark:text-red-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {subTab.label}
                  </button>
                ))}
              </div>

              <div className="relative">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search private students by name, parent, class, or email..."
                  className="w-full h-9 pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#1E293B] dark:focus:border-slate-400"
                />
              </div>

              <div className="max-h-56 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredPrivateStudents.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    No genuinely enrolled private students match this filter.
                  </div>
                ) : (
                  filteredPrivateStudents.map((student) => {
                    const checked = targetStudentIds.includes(student.id);
                    const isParent = student.resolvedSubType === 'parent';
                    return (
                      <button
                        key={student.id}
                        type="button"
                        onClick={() => toggleStudent(student.id)}
                        className={`w-full flex items-center justify-between px-3.5 py-2.5 cursor-pointer text-left transition-colors gap-2 ${
                          checked
                            ? 'bg-slate-100/80 dark:bg-slate-800/60'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-4 h-4 rounded flex items-center justify-center border transition-colors shrink-0 ${
                              checked
                                ? 'bg-[#1E293B] border-[#1E293B] dark:bg-white dark:border-white text-white dark:text-[#1E293B]'
                                : 'border-slate-300 dark:border-slate-700'
                            }`}
                          >
                            {checked && <Check size={11} />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                                {student.name}
                              </span>
                              <span
                                className={`text-[9px] font-black uppercase tracking-wider shrink-0 ${
                                  isParent
                                    ? 'text-[#1E293B] dark:text-slate-300'
                                    : 'text-[#B91C1C] dark:text-red-400'
                                }`}
                              >
                                · {isParent ? 'Parent-Enrolled' : 'Individual Private'}
                              </span>
                            </div>
                            {(student.parentName || student.plan || student.email) && (
                              <div className="text-[10px] text-slate-500 truncate mt-0.5">
                                {isParent && student.parentName
                                  ? `Parent: ${student.parentName}`
                                  : student.email || ''}
                                {student.plan ? ` · ${student.plan}` : ''}
                              </div>
                            )}
                          </div>
                        </div>
                        {student.grade && (
                          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 shrink-0">
                            {student.grade}
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Step 3: Class / Grade Filtering (Supports All, Specific Grades, or Grade Range) */}
          <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-zinc-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-zinc-500 flex items-center gap-1.5">
                <GraduationCap size={14} />
                <span>3. Grade / Class Scope</span>
              </label>

              <div className="inline-flex rounded-lg bg-slate-100 dark:bg-[#18181B] p-0.5">
                {(
                  [
                    { id: 'ALL', label: 'All Grades' },
                    { id: 'SELECTED', label: 'Specific Grade(s)' },
                    { id: 'RANGE', label: 'Grade Range' },
                  ] as const
                ).map((modeBtn) => (
                  <button
                    key={modeBtn.id}
                    type="button"
                    onClick={() => setClassScopeMode(modeBtn.id)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                      classScopeMode === modeBtn.id
                        ? 'bg-white dark:bg-[#09090B] text-slate-900 dark:text-white shadow-2xs'
                        : 'text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-white'
                    }`}
                  >
                    {modeBtn.label}
                  </button>
                ))}
              </div>
            </div>

            {classScopeMode === 'SELECTED' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-44 overflow-y-auto p-1">
                {CANONICAL_CLASSES.map((cls) => {
                  const active = selectedClasses.includes(cls);
                  return (
                    <button
                      key={cls}
                      type="button"
                      onClick={() => toggleClass(cls)}
                      className={`px-3 py-2 rounded-xl border text-left text-xs font-bold flex items-center justify-between transition-all cursor-pointer ${
                        active
                          ? 'border-[#1E293B] dark:border-zinc-400 bg-slate-100 dark:bg-[#18181B] text-[#1E293B] dark:text-white'
                          : 'border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-[#18181B]'
                      }`}
                    >
                      <span className="truncate">{cls}</span>
                      {active && <Check size={13} className="shrink-0 text-[#B91C1C] dark:text-red-400" />}
                    </button>
                  );
                })}
              </div>
            )}

            {classScopeMode === 'RANGE' && (
              <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-[#09090B] p-3.5 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                      From Grade
                    </span>
                    <select
                      value={gradeRangeFrom}
                      onChange={(e) => setGradeRangeFrom(e.target.value)}
                      className="mt-1 w-full h-9 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-[#111114] px-3 text-xs font-semibold text-slate-900 dark:text-white"
                    >
                      {CANONICAL_CLASSES.map((cls) => (
                        <option key={cls} value={cls}>
                          {cls}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                      To Grade
                    </span>
                    <select
                      value={gradeRangeTo}
                      onChange={(e) => setGradeRangeTo(e.target.value)}
                      className="mt-1 w-full h-9 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-[#111114] px-3 text-xs font-semibold text-slate-900 dark:text-white"
                    >
                      {CANONICAL_CLASSES.map((cls) => (
                        <option key={cls} value={cls}>
                          {cls}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="text-xs text-slate-600 dark:text-zinc-400">
                  Covers <strong className="text-slate-900 dark:text-white">{expandedRangeClasses.length}</strong> grade level{expandedRangeClasses.length === 1 ? '' : 's'}:{' '}
                  <span className="text-slate-700 dark:text-zinc-300 font-medium">
                    {expandedRangeClasses.join(', ')}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Step 4: Multi-Programme & Sub-Programme Targeting */}
          {programsMap && programsMap.size > 0 && (
            <div className="space-y-2.5 pt-3 border-t border-slate-100 dark:border-zinc-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-zinc-500 flex items-center gap-1.5">
                  <BookOpen size={13} />
                  <span>
                    4. Target Programmes / Sub-Programmes ({targetProgramIds.length || 'All'})
                  </span>
                </label>
                {targetProgramIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setTargetProgramIds([])}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white cursor-pointer"
                  >
                    Clear ({targetProgramIds.length})
                  </button>
                )}
              </div>

              <div className="relative">
                <Search
                  size={13}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={programSearch}
                  onChange={(e) => setProgramSearch(e.target.value)}
                  placeholder="Search programmes or sub-programmes..."
                  className="w-full h-9 pl-9 pr-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#09090B] text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#1E293B] dark:focus:border-zinc-500"
                />
              </div>

              <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#09090B] divide-y divide-slate-100 dark:divide-zinc-800/60">
                {programTreeRoots.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400">
                    No programmes match your search.
                  </div>
                ) : (
                  programTreeRoots.map((root) => renderProgramOption(root))
                )}
              </div>
            </div>
          )}

          {/* Step 5 (Optional for Partner Schools): Narrow down to specific students within selected school/class */}
          {recipientType === 'SCHOOL' && targetSchoolIds.length > 0 && schoolStudents.length > 0 && (
            <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-zinc-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-zinc-500 flex items-center gap-1.5">
                  <Filter size={13} />
                  <span>5. Student Scope Within Selected School</span>
                </label>

                <div className="inline-flex rounded-lg bg-slate-100 dark:bg-[#18181B] p-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSchoolStudentFilterMode('ALL');
                      setTargetStudentIds([]);
                    }}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                      schoolStudentFilterMode === 'ALL'
                        ? 'bg-white dark:bg-[#09090B] text-slate-900 dark:text-white shadow-2xs'
                        : 'text-slate-500 dark:text-zinc-400'
                    }`}
                  >
                    Entire Cohort
                  </button>
                  <button
                    type="button"
                    onClick={() => setSchoolStudentFilterMode('SELECTED')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                      schoolStudentFilterMode === 'SELECTED'
                        ? 'bg-white dark:bg-[#09090B] text-slate-900 dark:text-white shadow-2xs'
                        : 'text-slate-500 dark:text-zinc-400'
                    }`}
                  >
                    Specific Students ({matchingSchoolStudents.length})
                  </button>
                </div>
              </div>

              {schoolStudentFilterMode === 'SELECTED' && (
                <div className="space-y-2.5">
                  <div className="relative">
                    <Search
                      size={14}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="text"
                      value={schoolStudentSearch}
                      onChange={(e) => setSchoolStudentSearch(e.target.value)}
                      placeholder="Filter students in selected school..."
                      className="w-full h-8 pl-9 pr-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#09090B] text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#1E293B]"
                    />
                  </div>
                  <div className="max-h-40 overflow-y-auto border border-slate-200 dark:border-zinc-800 rounded-xl divide-y divide-slate-100 dark:divide-zinc-800/60">
                    {matchingSchoolStudents.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400">
                        No students found in the selected scope.
                      </div>
                    ) : (
                      matchingSchoolStudents.map((st) => {
                        const checked = targetStudentIds.includes(st.id);
                        return (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => toggleStudent(st.id)}
                            className={`w-full flex items-center justify-between px-3.5 py-2 cursor-pointer text-left transition-colors ${
                              checked
                                ? 'bg-slate-100/80 dark:bg-[#18181B]'
                                : 'hover:bg-slate-50 dark:hover:bg-[#18181B]/60'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className={`w-4 h-4 rounded flex items-center justify-center border transition-colors shrink-0 ${
                                  checked
                                    ? 'bg-[#1E293B] border-[#1E293B] dark:bg-white dark:border-white text-white dark:text-[#1E293B]'
                                    : 'border-slate-300 dark:border-zinc-700'
                                }`}
                              >
                                {checked && <Check size={11} />}
                              </div>
                              <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 truncate">
                                {st.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {st.schoolName && (
                                <span className="text-[10px] text-slate-400 truncate max-w-[120px]">
                                  {st.schoolName}
                                </span>
                              )}
                              {st.grade && (
                                <span className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400">
                                  {st.grade}
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 6: Exclude Specific Students */}
          {excludableCandidates.length > 0 && (
            <div className="space-y-2.5 pt-3 border-t border-slate-100 dark:border-zinc-800">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setShowExcludeSection((v) => !v)}
                  className="text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-zinc-500 hover:text-slate-800 dark:hover:text-white inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <UserX size={13} className={excludedStudentIds.length > 0 ? 'text-[#B91C1C]' : ''} />
                  <span>
                    Exclude Specific Students ({excludedStudentIds.length} Excluded)
                  </span>
                  {showExcludeSection ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>
                {excludedStudentIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setExcludedStudentIds([])}
                    className="text-xs font-semibold text-[#B91C1C] dark:text-red-400 hover:underline cursor-pointer"
                  >
                    Clear Exclusions
                  </button>
                )}
              </div>

              {showExcludeSection && (
                <div className="space-y-2">
                  <div className="relative">
                    <Search
                      size={13}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="text"
                      value={excludeSearch}
                      onChange={(e) => setExcludeSearch(e.target.value)}
                      placeholder="Search student to exclude from this assessment..."
                      className="w-full h-8 pl-9 pr-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#09090B] text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#B91C1C]"
                    />
                  </div>
                  <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#09090B] divide-y divide-slate-100 dark:divide-zinc-800/60">
                    {excludableCandidates.slice(0, 60).map((st) => {
                      const excluded = excludedStudentIds.includes(st.id);
                      return (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => toggleExcludedStudent(st.id)}
                          className={`w-full flex items-center justify-between px-3 py-2 text-left text-xs transition-colors cursor-pointer ${
                            excluded
                              ? 'bg-red-50/70 dark:bg-red-950/30 text-[#B91C1C] dark:text-red-300'
                              : 'hover:bg-slate-50 dark:hover:bg-[#18181B] text-slate-700 dark:text-zinc-300'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                                excluded
                                  ? 'bg-[#B91C1C] border-[#B91C1C] text-white'
                                  : 'border-slate-300 dark:border-zinc-700'
                              }`}
                            >
                              {excluded && <X size={10} />}
                            </span>
                            <span className="font-semibold truncate">{st.name || st.fullName}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 dark:text-zinc-500 shrink-0 ml-2">
                            {st.grade || st.className || ''}
                            {excluded ? ' · Excluded' : ''}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3.5 bg-slate-50 dark:bg-[#09090B] border-t border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400 truncate tabular-nums">
            <ShieldCheck size={14} className="text-[#1E293B] dark:text-zinc-300 shrink-0" />
            <span className="truncate">
              {recipientType === 'ALL'
                ? 'All cohorts'
                : recipientType === 'SCHOOL'
                ? `${targetSchoolIds.length} school(s)`
                : `${targetStudentIds.length} private learner(s)`}
              {classScopeMode === 'RANGE' && expandedRangeClasses.length > 0
                ? ` · ${expandedRangeClasses[0]}–${expandedRangeClasses[expandedRangeClasses.length - 1]}`
                : classScopeMode === 'SELECTED' && selectedClasses.length > 0
                ? ` · ${selectedClasses.length} grade(s)`
                : ''}
              {targetProgramIds.length > 0 ? ` · ${targetProgramIds.length} programme(s)` : ''}
              {excludedStudentIds.length > 0 ? ` · ${excludedStudentIds.length} excluded` : ''}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-zinc-800 text-xs font-bold text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-4 py-2 rounded-xl bg-[#B91C1C] hover:bg-red-800 text-white text-xs font-black shadow-xs transition-all cursor-pointer whitespace-nowrap"
            >
              Confirm Recipients
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
