import React, { useEffect, useMemo, useState } from 'react';
import { 
  BookOpen, Code, CheckCircle2, ExternalLink, Award, Layers, 
  Loader2, PlayCircle, ClipboardList, Flag, GraduationCap,
  Calendar, Check, UserCheck, ArrowRight, FileText, Upload, Eye,
  Download, Printer, X, Plus, AlertCircle, Send, Folder, FolderOpen,
  FolderTree, ChevronRight, ChevronDown, Lock, Clock, Compass, CreditCard
} from 'lucide-react';
import { collection, doc, getDoc, getDocs, query, setDoc, where, addDoc, serverTimestamp } from 'firebase/firestore';
import { Link, useSearchParams } from 'react-router-dom';
import { db, auth } from '../../lib/firebase';
import SEO from '../../components/ui/SEO';
import { getEffectiveAuth } from '../../utils/impersonation';
import { useToast } from '../../contexts/ToastContext';
import {
  type ProgramRecord,
  fetchAllProgramsMap,
} from '../../lib/programHierarchy';
import { getPortalCache, setPortalCache } from '../../lib/portalDataCache';
import {
  type ProgrammeEnrollmentRecord,
  PAYABLE_ENROLLMENT_STATUSES,
  fetchStudentProgrammeEnrollments,
  resolveStudentPortalEligibility,
} from '../../lib/programmeEnrollments';
import PortalProgramExplorer from '../../components/portal/PortalProgramExplorer';
import {
  type ComputedProgramNodeProgress,
  type StudentPathwayProgressSummary,
  type PriorLearningRecognitionType,
  calculateStudentPathwayProgress,
  fetchStudentAttendanceRecords,
  fetchStudentProgressRecords,
  fetchStudentPriorLearningRecognitions,
  submitPriorLearningRecognition,
} from '../../lib/learningPathwayEngine';
import { SyllabusTopicsList } from '../../components/portal/SyllabusTopicsList';
import learningJourneyHeroArt from '../../assets/images/learning_journey_hero_1795350254449.jpg';

interface CourseModule { 
  id: string; 
  stage: number; 
  stageName: string; 
  title: string; 
  seriesName?: string;
  description: string; 
  topics: string[]; 
  lessonsCount: number; 
  completedLessons: number; 
  progressPercent?: number;
  completedTopics?: string[];
  duration: string; 
  badgeUnlocked: boolean; 
  activeLessonUrl?: string; 
  activeLessonTitle?: string;
  instructor?: string;
  curriculumPdfUrl?: string;
  curriculumTitle?: string;
  curriculumSummary?: string;
}

const normalizeTopics = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.filter(v => typeof v === 'string' && v.trim()).map(v => v.trim());
  if (typeof value === 'string') return value.split(/\n|,/).map(v => v.trim()).filter(Boolean);
  return [];
};

const progressCount = (data: Record<string, any>) => {
  const explicit = [data.completedLessons, data.lessonsCompleted, data.progress?.completedLessons].map(Number).find(Number.isFinite);
  const ids = Array.isArray(data.completedLessonIds) ? data.completedLessonIds.length : 0;
  const mapCount = data.lessonProgress && typeof data.lessonProgress === 'object'
    ? Object.values(data.lessonProgress).filter((item: any) => item === true || Number(item?.progress ?? item) >= 100).length 
    : 0;
  return Math.max(0, Number(explicit ?? 0), ids, mapCount);
};

const normalizeActiveLesson = (data: Record<string, any>) => {
  const lesson = data.activeLesson;
  const url = String(data.activeLessonUrl || data.lessonUrl || (lesson && typeof lesson === 'object' ? lesson.url : '') || '').trim();
  const title = String(data.activeLessonTitle || (lesson && typeof lesson === 'object' ? lesson.title : '') || 'Active lesson').trim();
  return url ? { activeLessonUrl: url, activeLessonTitle: title || 'Active lesson' } : {};
};

const toModule = (id: string, data: Record<string, any>, index: number): CourseModule => {
  const lessons = Number(data.lessonsCount ?? (Array.isArray(data.lessons) ? data.lessons.length : 0));
  const stageNum = Number(data.stageNumber ?? data.stage ?? index + 1);
  const stageName = data.stageName || (data.seriesName ? `${data.seriesName} • Stage ${stageNum}` : `Stage ${stageNum}`);
  
  return {
    id,
    stage: stageNum,
    stageName,
    seriesName: data.seriesName || '',
    title: data.title || data.name || 'Untitled Course',
    description: data.shortDescription || data.description || 'Curriculum details and modules for this stage.',
    topics: normalizeTopics(data.topics ?? data.curriculum ?? data.modules),
    lessonsCount: Number.isFinite(lessons) ? Math.max(0, lessons) : 0,
    completedLessons: 0,
    duration: data.duration || data.durationLabel || 'Term-based',
    badgeUnlocked: false,
    instructor: data.assignedTutors?.[0]?.tutorName || data.instructor || '',
    curriculumPdfUrl: data.curriculumPdfUrl || data.syllabusUrl || data.documentUrl || data.fileUrl || '',
    curriculumTitle: data.curriculumTitle || data.title || 'Curriculum Syllabus Document',
    curriculumSummary: data.curriculumSummary || data.shortDescription || '',
    ...normalizeActiveLesson(data)
  };
};

export const PortalCourses: React.FC = () => {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'tracks' | 'explore'>(() =>
    searchParams.get('tab') === 'explore' ||
    searchParams.get('programId') ||
    searchParams.get('programSlug')
      ? 'explore'
      : 'tracks'
  );
  const [studentEligibility, setStudentEligibility] = useState<
    ReturnType<typeof resolveStudentPortalEligibility>
  >({
    registrationType: 'individual',
    isParentManagedChild: false,
    canSelfDiscoverAndEnroll: false,
    isSchoolStudent: false,
  });
  const [studentProfileMeta, setStudentProfileMeta] = useState<{
    uid: string;
    studentDocId: string;
    name: string;
    email: string;
    schoolId: string;
    schoolName: string;
  }>({
    uid: '',
    studentDocId: '',
    name: 'Student',
    email: '',
    schoolId: '',
    schoolName: '',
  });
  const [selfFundedEnrollments, setSelfFundedEnrollments] = useState<ProgrammeEnrollmentRecord[]>([]);
  const [modules, setModules] = useState<CourseModule[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [studentTrackTitle, setStudentTrackTitle] = useState('');
  
  // Curriculum Reader Modal
  const [readingCurriculum, setReadingCurriculum] = useState<CourseModule | null>(null);

  // Curriculum Upload Modal (for Tutors and Admins)
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [curriculumForm, setCurriculumForm] = useState({
    title: '',
    pdfUrl: '',
    summary: '',
    topicsText: '',
    notifyUsers: true
  });
  const [uploading, setUploading] = useState(false);
  const [canManageCurriculum, setCanManageCurriculum] = useState(false);

  // Phase 5 Recursive Pathway State
  const [programsMap, setProgramsMap] = useState<Map<string, ProgramRecord>>(new Map());
  const [pathwaySummary, setPathwaySummary] = useState<StudentPathwayProgressSummary | null>(null);
  const [resolvedStudentId, setResolvedStudentId] = useState<string>('');
  const [resolvedStudentName, setResolvedStudentName] = useState<string>('Student');
  const [expandedBranchIds, setExpandedBranchIds] = useState<Set<string>>(new Set());

  // Student Request Prior-Learning Recognition Modal
  const [priorRequestNode, setPriorRequestNode] = useState<ComputedProgramNodeProgress | null>(null);
  const [priorReqType, setPriorReqType] = useState<PriorLearningRecognitionType>('PRIOR_COMPLETION');
  const [priorReqEvidence, setPriorReqEvidence] = useState('');
  const [priorReqNotes, setPriorReqNotes] = useState('');
  const [submittingPriorReq, setSubmittingPriorReq] = useState(false);

  const loadCourses = async () => {
    const cachedCourses = getPortalCache<{
      modules: CourseModule[];
      studentTrackTitle: string;
      studentEligibility: ReturnType<typeof resolveStudentPortalEligibility>;
      studentProfileMeta: {
        uid: string;
        studentDocId: string;
        name: string;
        email: string;
        schoolId: string;
        schoolName: string;
      };
      resolvedStudentId: string;
      resolvedStudentName: string;
      selfFundedEnrollments: ProgrammeEnrollmentRecord[];
    }>('portal_courses_snapshot', 'student', 10 * 60 * 1000);

    if (cachedCourses?.data && Array.isArray(cachedCourses.data.modules)) {
      const snap = cachedCourses.data;
      setModules(snap.modules);
      setSelectedId((prev) =>
        prev && snap.modules.some((m) => m.id === prev) ? prev : snap.modules[0]?.id || ''
      );
      if (snap.studentTrackTitle) setStudentTrackTitle(snap.studentTrackTitle);
      if (snap.studentEligibility) setStudentEligibility(snap.studentEligibility);
      if (snap.studentProfileMeta) setStudentProfileMeta(snap.studentProfileMeta);
      if (snap.resolvedStudentId) setResolvedStudentId(snap.resolvedStudentId);
      if (snap.resolvedStudentName) setResolvedStudentName(snap.resolvedStudentName);
      if (Array.isArray(snap.selfFundedEnrollments)) setSelfFundedEnrollments(snap.selfFundedEnrollments);
      setLoading(false);
    } else {
      setLoading(true);
    }

    setMessage('');
    try {
      const effective = getEffectiveAuth();
      const studentDocId = effective.effectiveStudentDocId || sessionStorage.getItem('studentDocId');
      const currentUser = auth.currentUser;
      const currentUid = effective.effectiveUid || currentUser?.uid;

      // 1. Resolve student profile and assigned program names
      let studentRecord: any = null;
      if (studentDocId) {
        const s1 = await getDoc(doc(db, 'individualStudents', studentDocId)).catch(() => null);
        if (s1?.exists()) studentRecord = s1.data();
        else {
          const s2 = await getDoc(doc(db, 'students', studentDocId)).catch(() => null);
          if (s2?.exists()) studentRecord = s2.data();
        }
      }
      if (!studentRecord && currentUid) {
        const uSnap = await getDoc(doc(db, 'users', currentUid)).catch(() => null);
        if (uSnap?.exists()) studentRecord = uSnap.data();
      }

      // Collect all assigned program names / identifiers for this student
      const assignedNames = new Set<string>();
      if (studentRecord) {
        if (studentRecord.plan) assignedNames.add(studentRecord.plan.toLowerCase().trim());
        if (studentRecord.track) assignedNames.add(studentRecord.track.toLowerCase().trim());
        if (studentRecord.programName) assignedNames.add(studentRecord.programName.toLowerCase().trim());
        if (studentRecord.programTitle) assignedNames.add(studentRecord.programTitle.toLowerCase().trim());
        if (Array.isArray(studentRecord.subjects)) {
          studentRecord.subjects.forEach((s: string) => s && assignedNames.add(s.toLowerCase().trim()));
        }
        if (Array.isArray(studentRecord.enrolledPrograms)) {
          studentRecord.enrolledPrograms.forEach((p: string) => p && assignedNames.add(p.toLowerCase().trim()));
        }
        
        // School offerings are not automatically student enrolments. Include a
        // school programme only when it is explicitly assigned to this student
        // or to the student's class; never expose every school offering by default.
        if (studentRecord.schoolId) {
          try {
            const schDoc = await getDoc(doc(db, 'schools', studentRecord.schoolId));
            const schoolPrograms = schDoc.exists() && Array.isArray(schDoc.data().programs) ? schDoc.data().programs : [];
            const studentClass = String(studentRecord.class || studentRecord.classLevel || studentRecord.grade || '').trim().toLowerCase();
            const studentIds = [studentDocId, currentUid, studentRecord.id, studentRecord.studentId].filter(Boolean).map(String);
            schoolPrograms.forEach((prog: any) => {
              const name = String(prog.name || prog.title || prog.programName || '').trim();
              if (!name) return;
              const explicitStudentIds = [prog.studentIds, prog.assignedStudentIds, prog.enrolledStudentIds]
                .filter(Array.isArray).flat().map(String);
              const classes = [prog.assignedClasses, prog.classLevels, prog.classes]
                .filter(Array.isArray).flat().map((value: any) => String(value).trim().toLowerCase());
              const assignedToStudent = studentIds.some(id => explicitStudentIds.includes(id));
              const assignedToClass = Boolean(studentClass) && classes.some((value: string) => value === studentClass);
              if (prog.assignedToAllStudents === true || assignedToStudent || assignedToClass) {
                assignedNames.add(name.toLowerCase());
              }
            });
          } catch (e) {
            console.warn('School programme assignment lookup in courses:', e);
          }
        }
      }

      const primaryTrack =
        studentRecord?.plan ||
        studentRecord?.track ||
        studentRecord?.programName ||
        'Pending Programme Confirmation';
      setStudentTrackTitle(primaryTrack);

      const effectiveStudentId = String(
        studentDocId || studentRecord?.id || currentUid || ''
      ).trim();
      const eligibility = resolveStudentPortalEligibility({
        registrationType:
          studentRecord?.registrationType ||
          sessionStorage.getItem('studentRegistrationType'),
        registrationSource:
          studentRecord?.registrationSource ||
          sessionStorage.getItem('studentRegistrationSource'),
        parentId:
          studentRecord?.parentId ||
          sessionStorage.getItem('parentId') ||
          sessionStorage.getItem('studentParentId'),
        parentUid: studentRecord?.parentUid,
        schoolId:
          studentRecord?.schoolId ||
          sessionStorage.getItem('schoolId'),
        isIndependent: studentRecord?.isIndependent,
      });
      setStudentEligibility(eligibility);
      if (eligibility.isParentManagedChild) {
        setActiveTab('tracks');
      }

      const resolvedName =
        studentRecord?.fullName ||
        studentRecord?.studentName ||
        studentRecord?.name ||
        currentUser?.displayName ||
        sessionStorage.getItem('userName') ||
        'Student';
      const resolvedEmail =
        studentRecord?.email ||
        currentUser?.email ||
        sessionStorage.getItem('userEmail') ||
        '';
      setStudentProfileMeta({
        uid: currentUid || '',
        studentDocId: effectiveStudentId,
        name: resolvedName,
        email: resolvedEmail,
        schoolId: String(studentRecord?.schoolId || sessionStorage.getItem('schoolId') || ''),
        schoolName: String(studentRecord?.schoolName || sessionStorage.getItem('schoolName') || ''),
      });

      setResolvedStudentId(effectiveStudentId);
      setResolvedStudentName(resolvedName);

      // 2. Fetch full recursive programme hierarchy + student progress + prior-learning recognitions + attendance + self-funded enrolments
      const studentIdKeys = Array.from(
        new Set([effectiveStudentId, currentUid, studentRecord?.studentId].filter(Boolean) as string[])
      );
      const [allProgramsMap, progressRecs, priorRecs, attendanceRecs, selfEnrollments] = await Promise.all([
        fetchAllProgramsMap(),
        effectiveStudentId ? fetchStudentProgressRecords(effectiveStudentId) : Promise.resolve([]),
        effectiveStudentId
          ? fetchStudentPriorLearningRecognitions(effectiveStudentId)
          : Promise.resolve([]),
        studentIdKeys.length > 0
          ? fetchStudentAttendanceRecords(studentIdKeys).catch(() => [])
          : Promise.resolve([]),
        currentUid && eligibility.canSelfDiscoverAndEnroll
          ? fetchStudentProgrammeEnrollments(currentUid).catch(() => [])
          : Promise.resolve([]),
      ]);

      setProgramsMap(allProgramsMap);
      setSelfFundedEnrollments(selfEnrollments);

      // Expand all visible nodes by default
      const allIds = new Set<string>();
      allProgramsMap.forEach((p) => allIds.add(p.id));
      setExpandedBranchIds(allIds);

      const computedSummary = calculateStudentPathwayProgress({
        studentRecord: studentRecord || {
          selectedProgramIds: Array.from(assignedNames),
        },
        programsMap: allProgramsMap,
        progressRecords: progressRecs,
        priorLearningRecords: priorRecs,
        attendanceRecords: attendanceRecs,
      });
      setPathwaySummary(computedSummary);

      // 3. Populate CourseModule cards strictly from the student's resolved pathway units
      const programMap = new Map<string, CourseModule>();
      let idxCounter = 0;
      for (const node of computedSummary.flatUnitsMap.values()) {
        const countsAsUnit =
          node.isDirectlyEnrolledScope &&
          !node.isContainer &&
          (node.children.length === 0 || node.isHybrid);
        if (!countsAsUnit) continue;

        const p = node.program;
        const mod = toModule(p.id, p, idxCounter++);
        mod.stageName = node.breadcrumbPath || mod.stageName;
        mod.lessonsCount = node.totalLessons || mod.lessonsCount || 8;
        mod.completedLessons = Math.round((node.selfProgress / 100) * mod.lessonsCount);
        mod.progressPercent = node.selfProgress;
        mod.completedTopics = node.completedTopics || [];
        mod.badgeUnlocked =
          node.selfStatus === 'COMPLETED' || node.selfStatus === 'PRIOR_LEARNING_APPROVED';
        programMap.set(p.id, mod);
      }

      const list = Array.from(programMap.values());
      setModules(list);
      setSelectedId((prev) =>
        prev && list.some((m) => m.id === prev) ? prev : list[0]?.id || ''
      );

      setPortalCache(
        'portal_courses_snapshot',
        {
          modules: list,
          studentTrackTitle: primaryTrack,
          studentEligibility: eligibility,
          studentProfileMeta: {
            uid: currentUid || '',
            studentDocId: effectiveStudentId,
            name: resolvedName,
            email: resolvedEmail,
            schoolId: String(studentRecord?.schoolId || sessionStorage.getItem('schoolId') || ''),
            schoolName: String(studentRecord?.schoolName || sessionStorage.getItem('schoolName') || ''),
          },
          resolvedStudentId: effectiveStudentId,
          resolvedStudentName: resolvedName,
          selfFundedEnrollments: selfEnrollments,
        },
        { roleHint: 'student' }
      );

      if (!list.length) {
        setMessage('No course tracks are currently assigned to your student profile.');
      }
    } catch (e) {
      console.error('Course loading failed:', e);
      setMessage('Course data could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    const checkCurriculumAccess = async () => {
      const user = auth.currentUser;
      if (!user) { if (active) setCanManageCurriculum(false); return; }
      try {
        const [userSnap, adminSnap, tokenResult] = await Promise.all([
          getDoc(doc(db, 'users', user.uid)).catch(() => null),
          getDoc(doc(db, 'admins', user.uid)).catch(() => null),
          user.getIdTokenResult().catch(() => null)
        ]);
        const role = String(userSnap?.data()?.role || sessionStorage.getItem('userRole') || '').toLowerCase();
        const isTutor = ['staff', 'tutor', 'instructor', 'teacher'].includes(role);
        const isAdmin = ['admin', 'super_admin', 'superadmin'].includes(role) ||
          Boolean(adminSnap?.exists()) || tokenResult?.claims?.super_admin === true ||
          user.email?.toLowerCase() === 'johnrufai242@gmail.com';
        if (active) setCanManageCurriculum(isTutor || isAdmin);
      } catch (error) {
        console.warn('Program curriculum permission check failed:', error);
        if (active) setCanManageCurriculum(false);
      }
    };
    void checkCurriculumAccess();
    void loadCourses();
    return () => { active = false; };
  }, []);

  const selectedModule = useMemo(() => modules.find(m => m.id === selectedId) || null, [modules, selectedId]);

  // Open upload curriculum modal
  const handleOpenCurriculumModal = (mod: CourseModule) => {
    if (!canManageCurriculum) { toast.error('Only tutors and the super admin can update program curriculum.'); return; }
    setCurriculumForm({
      title: mod.curriculumTitle || `${mod.title} Curriculum Syllabus`,
      pdfUrl: mod.curriculumPdfUrl || '',
      summary: mod.curriculumSummary || mod.description || '',
      topicsText: mod.topics.join('\n'),
      notifyUsers: true
    });
    setShowUploadModal(true);
  };

  // Save Curriculum to Firestore and dispatch notifications
  const handleSaveCurriculum = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageCurriculum) { toast.error('Only tutors and the super admin can update program curriculum.'); return; }
    if (!selectedModule) return;
    if (!curriculumForm.pdfUrl.trim() && !curriculumForm.topicsText.trim()) {
      toast.error('Please enter a curriculum document/drive link or syllabus topics.');
      return;
    }

    setUploading(true);
    try {
      const parsedTopics = curriculumForm.topicsText.split('\n').map(t => t.trim()).filter(Boolean);
      const programRef = doc(db, 'programs', selectedModule.id);

      const updateData = {
        curriculumPdfUrl: curriculumForm.pdfUrl.trim(),
        curriculumTitle: curriculumForm.title.trim(),
        curriculumSummary: curriculumForm.summary.trim(),
        curriculum: parsedTopics,
        topics: parsedTopics,
        updatedAt: serverTimestamp()
      };

      await setDoc(programRef, updateData, { merge: true });

      // Dispatch notification to students & school partners if requested
      if (curriculumForm.notifyUsers) {
        await addDoc(collection(db, 'notifications'), {
          title: `New Curriculum Uploaded: ${selectedModule.title}`,
          message: `The syllabus and curriculum guide for "${selectedModule.title}" has been updated. You can read the curriculum document in your course portal.`,
          type: 'RESOURCE_UPLOAD',
          programId: selectedModule.id,
          programTitle: selectedModule.title,
          fileUrl: curriculumForm.pdfUrl.trim(),
          createdAt: serverTimestamp(),
          read: false
        }).catch(() => undefined);
      }

      toast.success(`Curriculum for "${selectedModule.title}" uploaded & synced successfully!`);
      setShowUploadModal(false);
      await loadCourses();
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to upload curriculum: ' + (err?.message || 'Error occurred'));
    } finally {
      setUploading(false);
    }
  };

  const overallProgressPct = useMemo(() => {
    if (pathwaySummary) return Math.min(100, Math.max(0, Math.round(pathwaySummary.overallProgress || 0)));
    if (!modules.length) return 0;
    const sum = modules.reduce((acc, m) => {
      const p =
        typeof m.progressPercent === 'number'
          ? m.progressPercent
          : m.lessonsCount > 0
          ? Math.round((m.completedLessons / m.lessonsCount) * 100)
          : 0;
      return acc + p;
    }, 0);
    return Math.round(sum / modules.length);
  }, [pathwaySummary, modules]);

  const completedUnitsCount = pathwaySummary
    ? pathwaySummary.completedRequiredUnits
    : modules.filter((m) => (m.progressPercent ?? 0) >= 100 || m.badgeUnlocked).length;
  const totalUnitsCount = pathwaySummary ? pathwaySummary.totalRequiredUnits : modules.length;

  const nextMilestoneText = useMemo(() => {
    if (!modules.length) return 'Await programme confirmation';
    const nextIncomplete = modules.find(
      (m) => (m.progressPercent ?? 0) < 100 && !m.badgeUnlocked
    );
    if (!nextIncomplete) return 'All assigned learning units completed';
    if (completedUnitsCount === 0 && overallProgressPct === 0) {
      return 'Complete your first learning unit';
    }
    return `Advance ${nextIncomplete.title}`;
  }, [modules, completedUnitsCount, overallProgressPct]);

  const rootProgrammeTitle =
    pathwaySummary?.rootBranches?.[0]?.program?.title || studentTrackTitle || 'Technology Programme';

  const [showPathwayTree, setShowPathwayTree] = useState(false);

  const ringRadius = 26;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - overallProgressPct / 100);

  return (
    <div className="space-y-4 sm:space-y-6 pb-8 sm:pb-12">
      <SEO 
        title="Learning & Tracks | Jaystarbliss Studios" 
        description="Explore your assigned Jaystarbliss learning tracks, monitor syllabus milestones, and advance through your programme." 
        noindex={true}
      />

      {/* ============================================================== */}
      {/* 1. HERO BANNER — YOUR LEARNING JOURNEY                         */}
      {/* ============================================================== */}
      <header className="relative rounded-2xl sm:rounded-3xl overflow-hidden border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#09090B] shadow-2xs">
        <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">
          <img
            src={learningJourneyHeroArt}
            alt=""
            aria-hidden="true"
            className="absolute right-0 top-0 h-full w-full md:w-[60%] object-cover object-right opacity-25 md:opacity-95 dark:opacity-25 md:dark:opacity-45"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-white via-white/95 to-white/10 dark:from-[#09090B] dark:via-[#09090B]/92 dark:to-[#09090B]/20" />
        </div>

        <div className="relative z-10 px-4 sm:px-7 py-5 sm:py-8 flex flex-col justify-between gap-4">
          <div className="space-y-2 max-w-xl">
            <div className="inline-flex items-center gap-2 text-xs font-bold text-[#B91C1C] dark:text-red-400">
              <GraduationCap size={16} className="shrink-0" />
              <span>Learning &amp; Tracks</span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-[#14284B] dark:text-white leading-tight">
              Your Learning Journey
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-zinc-400 leading-relaxed max-w-md">
              Explore your learning tracks, track your syllabus progress, and achieve more.
            </p>
          </div>

          {studentEligibility.canSelfDiscoverAndEnroll && (
            <div
              className="inline-flex self-start rounded-xl p-1 bg-slate-100/90 dark:bg-[#141418]/90 border border-slate-200 dark:border-zinc-800"
              role="tablist"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'tracks'}
                onClick={() => {
                  setActiveTab('tracks');
                  const next = new URLSearchParams(searchParams);
                  next.delete('tab');
                  next.delete('programId');
                  next.delete('programSlug');
                  setSearchParams(next, { replace: true });
                }}
                className={`inline-flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-colors cursor-pointer ${
                  activeTab === 'tracks'
                    ? 'bg-[#B91C1C] text-white shadow-xs'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-[#14284B] dark:hover:text-white'
                }`}
              >
                <BookOpen size={13} />
                <span>My Learning Tracks</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'explore'}
                onClick={() => {
                  setActiveTab('explore');
                  const next = new URLSearchParams(searchParams);
                  next.set('tab', 'explore');
                  setSearchParams(next, { replace: true });
                }}
                className={`inline-flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold transition-colors cursor-pointer ${
                  activeTab === 'explore'
                    ? 'bg-[#B91C1C] text-white shadow-xs'
                    : 'text-slate-600 dark:text-zinc-400 hover:text-[#14284B] dark:hover:text-white'
                }`}
              >
                <Compass size={13} />
                <span>Explore Programmes</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ============================================================== */}
      {/* 2. HORIZONTAL PROGRESS, PROGRAMME & MILESTONE SUMMARY BAR      */}
      {/* ============================================================== */}
      {activeTab === 'tracks' && !loading && (
        <section
          aria-label="Overall progress summary"
          className="rounded-2xl bg-white dark:bg-[#111114] border border-slate-200 dark:border-zinc-800 p-4 sm:p-5 shadow-2xs"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-4 lg:gap-0 lg:divide-x divide-slate-200 dark:divide-zinc-800 items-center">
            {/* Overall Progress Ring + Bar */}
            <div className="sm:col-span-2 lg:col-span-4 flex items-center gap-3.5 sm:gap-4 lg:pr-5">
              <div className="relative w-14 h-14 sm:w-16 sm:h-16 shrink-0 flex items-center justify-center">
                <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90" aria-hidden="true">
                  <circle
                    cx="32"
                    cy="32"
                    r={ringRadius}
                    fill="none"
                    strokeWidth="5.5"
                    className="stroke-slate-100 dark:stroke-zinc-800"
                  />
                  <circle
                    cx="32"
                    cy="32"
                    r={ringRadius}
                    fill="none"
                    strokeWidth="5.5"
                    strokeLinecap="round"
                    strokeDasharray={ringCircumference}
                    strokeDashoffset={ringOffset}
                    className="stroke-[#B91C1C] transition-all duration-700 ease-out"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-xs sm:text-sm font-extrabold text-[#14284B] dark:text-white tabular-nums">
                  {overallProgressPct}%
                </span>
              </div>

              <div className="flex-1 min-w-0 space-y-1.5">
                <p className="text-xs sm:text-sm font-bold text-[#14284B] dark:text-white">
                  Overall Progress
                </p>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400 tabular-nums">
                  {completedUnitsCount} of {totalUnitsCount} required units completed
                </p>
                <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#B91C1C] transition-all duration-700"
                    style={{ width: `${overallProgressPct}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Enrolled Programme */}
            <div className="lg:col-span-3 lg:px-5 flex items-start gap-2.5 min-w-0">
              <BookOpen size={17} className="text-[#B91C1C] shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">
                  Enrolled Programme
                </p>
                <p className="text-xs sm:text-sm font-bold text-[#14284B] dark:text-white truncate mt-0.5">
                  {rootProgrammeTitle}
                </p>
              </div>
            </div>

            {/* Next Milestone */}
            <div className="lg:col-span-3 lg:px-5 flex items-start gap-2.5 min-w-0">
              <Calendar size={17} className="text-[#B91C1C] shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">
                  Next Milestone
                </p>
                <p className="text-xs sm:text-sm font-bold text-[#14284B] dark:text-white truncate mt-0.5">
                  {nextMilestoneText}
                </p>
              </div>
            </div>

            {/* Primary Scratch IDE CTA */}
            <div className="sm:col-span-2 lg:col-span-2 lg:pl-5 flex lg:justify-end">
              <a
                href="https://scratch.mit.edu"
                target="_blank"
                rel="noreferrer"
                className="w-full lg:w-auto min-h-[40px] inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-bold shadow-xs transition-colors whitespace-nowrap"
              >
                <Code size={14} />
                <span>Launch Scratch IDE</span>
                <ChevronRight size={14} />
              </a>
            </div>
          </div>
        </section>
      )}

      {/* Approved Self-Funded Enrolments Awaiting Payment Strip */}
      {studentEligibility.canSelfDiscoverAndEnroll &&
        selfFundedEnrollments.some((e) =>
          PAYABLE_ENROLLMENT_STATUSES.has(e.enrollmentStatus)
        ) && (
          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5 text-xs">
              <div className="font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                <CreditCard size={15} />
                <span>Approved Programme Ready for Payment</span>
              </div>
              <p className="text-emerald-800/90 dark:text-emerald-300/90">
                {(() => {
                  const firstPayable = selfFundedEnrollments.find((e) =>
                    PAYABLE_ENROLLMENT_STATUSES.has(e.enrollmentStatus)
                  )!;
                  return `${firstPayable.programTitle} is approved — outstanding balance ₦${Number(
                    firstPayable.remainingBalance || firstPayable.approvedFee || 0
                  ).toLocaleString()}.`;
                })()}
              </p>
            </div>
            <Link
              to={`/portal/student/payments?enrollmentId=${encodeURIComponent(
                selfFundedEnrollments.find((e) =>
                  PAYABLE_ENROLLMENT_STATUSES.has(e.enrollmentStatus)
                )!.id
              )}`}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shrink-0"
            >
              <CreditCard size={13} />
              <span>Continue to Payment</span>
            </Link>
          </div>
        )}

      {/* ============================================================== */}
      {/* 3. MAIN CONTENT: EXPLORE TAB OR MASTER-DETAIL TRACKS           */}
      {/* ============================================================== */}
      {studentEligibility.canSelfDiscoverAndEnroll && activeTab === 'explore' ? (
        <PortalProgramExplorer
          mode="student"
          initialProgramId={searchParams.get('programId')}
          initialProgramSlug={searchParams.get('programSlug')}
          studentContext={{
            studentUid: studentProfileMeta.uid,
            studentDocId: studentProfileMeta.studentDocId || null,
            studentName: studentProfileMeta.name,
            studentEmail: studentProfileMeta.email || null,
            studentOriginType:
              studentEligibility.registrationType === 'school' ? 'school' : 'individual',
            schoolId: studentProfileMeta.schoolId || null,
            schoolName: studentProfileMeta.schoolName || null,
            existingEnrollments: selfFundedEnrollments,
            onEnrollmentSubmitted: () => {
              if (studentProfileMeta.uid) {
                void fetchStudentProgrammeEnrollments(studentProfileMeta.uid)
                  .then(setSelfFundedEnrollments)
                  .catch(() => undefined);
              }
            },
          }}
        />
      ) : loading ? (
        <div className="flex items-center justify-center py-20 text-slate-500 dark:text-zinc-400 text-sm">
          <Loader2 className="animate-spin mr-2 text-[#B91C1C]" size={20} /> Loading your learning tracks…
        </div>
      ) : message && !modules.length ? (
        <div className="p-8 sm:p-12 text-center rounded-2xl border border-dashed border-slate-200 dark:border-zinc-800 text-sm text-slate-500 dark:text-zinc-400 bg-white dark:bg-[#111114] space-y-3">
          <BookOpen size={30} className="mx-auto text-slate-400 dark:text-zinc-500" />
          <p className="font-bold text-[#14284B] dark:text-white">{message}</p>
          <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-md mx-auto">
            Contact your institution administrator or tutor to assign your curriculum track.
          </p>
          {studentEligibility.canSelfDiscoverAndEnroll && (
            <button
              type="button"
              onClick={() => setActiveTab('explore')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-bold cursor-pointer"
            >
              <Compass size={14} />
              <span>Explore Available Programmes</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-5 sm:space-y-6">
          {/* MASTER-DETAIL 2-COLUMN TRACKS WORKSPACE */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* LEFT COLUMN: Your Learning Tracks Selector */}
            <aside className="lg:col-span-5 xl:col-span-4 space-y-3">
              <div className="rounded-2xl bg-white dark:bg-[#111114] border border-slate-200 dark:border-zinc-800 px-4 py-3.5 flex items-center justify-between gap-2 shadow-2xs">
                <div className="flex items-center gap-2 min-w-0">
                  <Layers size={16} className="text-[#B91C1C] shrink-0" />
                  <h2 className="text-sm font-bold text-[#14284B] dark:text-white truncate">
                    Your Learning Tracks
                  </h2>
                </div>
                <span className="text-xs font-bold text-[#B91C1C] dark:text-red-400 tabular-nums shrink-0">
                  {modules.length} {modules.length === 1 ? 'Track' : 'Tracks'}
                </span>
              </div>

              <div className="space-y-3">
                {modules.map((mod, idx) => {
                  const progress =
                    typeof mod.progressPercent === 'number'
                      ? Math.min(100, Math.max(0, Math.round(mod.progressPercent)))
                      : mod.lessonsCount > 0
                      ? Math.round((mod.completedLessons / mod.lessonsCount) * 100)
                      : 0;
                  const isSelected = selectedId === mod.id;
                  const isCodingTrack = /cod|program|dev|scratch|web|python|js/i.test(mod.title);

                  return (
                    <button
                      key={mod.id}
                      type="button"
                      onClick={() => setSelectedId(mod.id)}
                      className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer flex items-center gap-3.5 ${
                        isSelected
                          ? 'border-[#B91C1C] bg-red-50/40 dark:bg-[#B91C1C]/10 shadow-sm'
                          : 'border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#111114] hover:border-slate-300 dark:hover:border-zinc-700'
                      }`}
                    >
                      {/* Track Icon Tile */}
                      <div
                        className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                          isSelected
                            ? 'bg-red-100/80 dark:bg-[#B91C1C]/20 text-[#B91C1C] dark:text-red-400'
                            : 'bg-slate-100 dark:bg-[#18181B] text-[#14284B] dark:text-zinc-300'
                        }`}
                      >
                        {isCodingTrack || idx % 2 === 1 ? (
                          <Code size={22} />
                        ) : (
                          <BookOpen size={22} />
                        )}
                      </div>

                      {/* Track Content */}
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="font-bold text-sm text-[#14284B] dark:text-white truncate">
                              {mod.title}
                            </h3>
                            <p className="text-[11px] sm:text-xs text-slate-500 dark:text-zinc-400 line-clamp-2 mt-0.5 leading-snug">
                              {mod.description}
                            </p>
                          </div>
                          <span
                            className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                              isSelected
                                ? 'bg-[#B91C1C] text-white'
                                : 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400'
                            }`}
                          >
                            <ChevronRight size={15} />
                          </span>
                        </div>

                        <div className="flex items-center gap-2.5 pt-1">
                          <div className="flex-1 h-1.5 rounded-full bg-slate-200/80 dark:bg-zinc-800 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#B91C1C] transition-all duration-500"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-bold text-[#14284B] dark:text-zinc-200 tabular-nums shrink-0">
                            {progress}%
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* RIGHT COLUMN: Selected Track Detail Card */}
            {selectedModule && (
              <article className="lg:col-span-7 xl:col-span-8 bg-white dark:bg-[#111114] rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden shadow-2xs flex flex-col">
                {/* Brand Crimson-Navy Visual Hero Strip */}
                <div className="relative bg-gradient-to-br from-[#7F1D1D] via-[#991B1B] to-[#14284B] p-5 sm:p-7 text-white overflow-hidden">
                  {/* Subtle Geometric Code Motif on Right */}
                  <div
                    aria-hidden="true"
                    className="hidden sm:flex absolute right-6 top-1/2 -translate-y-1/2 w-36 h-24 rounded-2xl border border-white/15 bg-[#09090B]/35 backdrop-blur-xs items-center justify-center shadow-2xl rotate-[-3deg]"
                  >
                    <Code size={42} className="text-white/90" />
                  </div>
                  <div
                    aria-hidden="true"
                    className="absolute -right-10 -bottom-12 w-48 h-48 rounded-full bg-white/5 blur-2xl"
                  />

                  <div className="relative z-10 max-w-lg space-y-2">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-bold uppercase tracking-wider text-red-100/90">
                      <span>{selectedModule.stageName}</span>
                      <span>·</span>
                      <span>{selectedModule.duration}</span>
                      {selectedModule.badgeUnlocked && (
                        <>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1 text-white">
                            <Award size={12} /> Certified
                          </span>
                        </>
                      )}
                    </div>

                    <h2 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-white leading-tight">
                      {selectedModule.title}
                    </h2>

                    <p className="text-xs sm:text-sm text-white/85 leading-relaxed">
                      {selectedModule.description}
                    </p>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-4 sm:p-6 space-y-5 flex-1">
                  {/* About this Track + Faculty Lead */}
                  <div className="space-y-2 pb-4 border-b border-slate-100 dark:border-zinc-800">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm sm:text-base font-bold text-[#14284B] dark:text-white flex items-center gap-2">
                        <FileText size={16} className="text-[#B91C1C]" />
                        <span>About this Track</span>
                      </h3>
                      {selectedModule.instructor && (
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-zinc-300">
                          <UserCheck size={14} className="text-[#B91C1C]" />
                          <span>Faculty Lead: {selectedModule.instructor}</span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-zinc-300 leading-relaxed">
                      {selectedModule.curriculumSummary || selectedModule.description}
                    </p>
                  </div>

                  {/* Official Curriculum PDF Strip */}
                  {(selectedModule.curriculumPdfUrl || canManageCurriculum) && (
                    <div className="p-3.5 sm:p-4 rounded-xl bg-slate-50 dark:bg-[#18181B] border border-slate-200/80 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-white dark:bg-[#111114] border border-slate-200 dark:border-zinc-700 text-[#14284B] dark:text-zinc-200 flex items-center justify-center shrink-0">
                          <FileText size={17} />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs sm:text-sm font-bold text-[#14284B] dark:text-white truncate">
                            {selectedModule.curriculumTitle || `${selectedModule.title} Syllabus Guide`}
                          </h4>
                          <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                            {selectedModule.curriculumPdfUrl
                              ? 'Official syllabus PDF and milestone checklist ready to read.'
                              : 'No PDF linked yet. Tutors and admins can upload a curriculum guide.'}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {selectedModule.curriculumPdfUrl && (
                          <button
                            type="button"
                            onClick={() => setReadingCurriculum(selectedModule)}
                            className="px-3.5 py-2 bg-[#14284B] hover:bg-[#1E3A6D] dark:bg-zinc-800 dark:hover:bg-zinc-700 text-white rounded-xl text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Eye size={13} />
                            <span>Read Syllabus</span>
                          </button>
                        )}
                        {canManageCurriculum && (
                          <button
                            type="button"
                            onClick={() => handleOpenCurriculumModal(selectedModule)}
                            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-200 hover:border-[#B91C1C] hover:text-[#B91C1C] text-xs font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Upload size={13} />
                            <span>{selectedModule.curriculumPdfUrl ? 'Update' : 'Upload PDF'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* What You'll Learn / Structured Vertical Syllabus Topics */}
                  <div>
                    {selectedModule.topics.length ? (
                      <SyllabusTopicsList
                        topics={selectedModule.topics}
                        overallProgress={
                          typeof selectedModule.progressPercent === 'number'
                            ? selectedModule.progressPercent
                            : selectedModule.lessonsCount
                            ? Math.round((selectedModule.completedLessons / selectedModule.lessonsCount) * 100)
                            : 0
                        }
                        completedTopics={selectedModule.completedTopics || []}
                        heading="What You'll Learn"
                        collapsedLimit={6}
                      />
                    ) : (
                      <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-zinc-800 text-xs text-slate-500 dark:text-zinc-400">
                        Structured syllabus topics and practical laboratory exercises are active for this track.
                      </div>
                    )}
                  </div>

                  {/* Primary Action Footer */}
                  <div className="pt-4 border-t border-slate-100 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to="/portal/student/assignments"
                        className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-zinc-800 px-3 text-xs font-bold text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-900 transition-colors"
                      >
                        <ClipboardList size={14} className="text-[#B91C1C]" />
                        <span>Deliverables</span>
                      </Link>
                      <Link
                        to="/portal/student/milestones"
                        className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-zinc-800 px-3 text-xs font-bold text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-900 transition-colors"
                      >
                        <Flag size={14} className="text-[#B91C1C]" />
                        <span>Milestones</span>
                      </Link>
                    </div>

                    {selectedModule.activeLessonUrl ? (
                      <a
                        href={selectedModule.activeLessonUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full sm:w-auto min-h-[42px] px-5 py-2.5 bg-[#B91C1C] hover:bg-[#991B1B] text-white font-bold text-xs sm:text-sm rounded-xl inline-flex items-center justify-center gap-2 shadow-sm transition-colors"
                      >
                        <PlayCircle size={16} />
                        <span>{selectedModule.activeLessonTitle || 'Start Learning'}</span>
                        <ExternalLink size={12} />
                      </a>
                    ) : selectedModule.curriculumPdfUrl ? (
                      <button
                        type="button"
                        onClick={() => setReadingCurriculum(selectedModule)}
                        className="w-full sm:w-auto min-h-[42px] px-5 py-2.5 bg-[#B91C1C] hover:bg-[#991B1B] text-white font-bold text-xs sm:text-sm rounded-xl inline-flex items-center justify-center gap-2 shadow-sm transition-colors cursor-pointer"
                      >
                        <PlayCircle size={16} />
                        <span>Start Learning</span>
                      </button>
                    ) : (
                      <a
                        href="https://scratch.mit.edu"
                        target="_blank"
                        rel="noreferrer"
                        className="w-full sm:w-auto min-h-[42px] px-5 py-2.5 bg-[#B91C1C] hover:bg-[#991B1B] text-white font-bold text-xs sm:text-sm rounded-xl inline-flex items-center justify-center gap-2 shadow-sm transition-colors"
                      >
                        <PlayCircle size={16} />
                        <span>Start Learning</span>
                      </a>
                    )}
                  </div>
                </div>
              </article>
            )}
          </div>

          {/* ============================================================== */}
          {/* 4. FULL PROGRAMME PATHWAY TREE & PRIOR-LEARNING RECOGNITION    */}
          {/* ============================================================== */}
          {pathwaySummary && pathwaySummary.rootBranches.length > 0 && (
            <section className="bg-white dark:bg-[#111114] rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden shadow-2xs">
              <button
                type="button"
                onClick={() => setShowPathwayTree((prev) => !prev)}
                className="w-full px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-left hover:bg-slate-50/70 dark:hover:bg-zinc-900/40 transition-colors cursor-pointer"
              >
                <div className="min-w-0">
                  <h2 className="text-sm sm:text-base font-bold text-[#14284B] dark:text-white flex items-center gap-2">
                    <FolderTree size={17} className="text-[#B91C1C] shrink-0" />
                    <span>Programme Pathway &amp; Prior-Learning Credits</span>
                  </h2>
                  <p className="text-[11px] sm:text-xs text-slate-500 dark:text-zinc-400 mt-0.5 tabular-nums">
                    Full curriculum tree ({pathwaySummary.completedRequiredUnits} of {pathwaySummary.totalRequiredUnits} required units)
                    {pathwaySummary.priorLearningApprovedUnits > 0
                      ? ` · ${pathwaySummary.priorLearningApprovedUnits} Prior-Learning Credit(s) Approved`
                      : ''}
                  </p>
                </div>

                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#B91C1C] dark:text-red-400 shrink-0">
                  <span>{showPathwayTree ? 'Hide Pathway Tree' : 'View Full Pathway'}</span>
                  {showPathwayTree ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </span>
              </button>

              {showPathwayTree && (
                <div className="px-4 sm:px-6 pb-5 pt-2 border-t border-slate-100 dark:border-zinc-800 space-y-1.5 overflow-x-auto">
                  {(() => {
                    const renderStudentNode = (node: ComputedProgramNodeProgress): React.ReactNode => {
                      const p = node.program;
                      const hasChildren = node.children.length > 0;
                      const isExpanded = expandedBranchIds.has(p.id);
                      const countsOwnUnit =
                        node.isDirectlyEnrolledScope &&
                        !node.isContainer &&
                        (node.children.length === 0 || node.isHybrid);
                      const pct = hasChildren && !countsOwnUnit ? node.aggregateProgress : node.selfProgress;
                      const status = hasChildren && !countsOwnUnit ? node.status : node.selfStatus;

                      return (
                        <div key={p.id} className="select-none">
                          <div
                            onClick={() => {
                              if (countsOwnUnit) setSelectedId(p.id);
                              else if (hasChildren) {
                                setExpandedBranchIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(p.id)) next.delete(p.id);
                                  else next.add(p.id);
                                  return next;
                                });
                              }
                            }}
                            className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-wrap items-center justify-between gap-2.5 mb-1.5 ${
                              selectedId === p.id
                                ? 'border-[#B91C1C] bg-red-50/35 dark:bg-[#B91C1C]/10'
                                : 'border-slate-200/80 dark:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-900/60'
                            }`}
                            style={{ marginLeft: `${Math.min(node.depth, 6) * 14}px` }}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              {hasChildren ? (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedBranchIds((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(p.id)) next.delete(p.id);
                                      else next.add(p.id);
                                      return next;
                                    });
                                  }}
                                  className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-500"
                                >
                                  {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                                </button>
                              ) : (
                                <span className="w-4 text-center text-slate-300 dark:text-zinc-600">•</span>
                              )}

                              {hasChildren || node.isContainer ? (
                                isExpanded ? (
                                  <FolderOpen size={15} className="text-[#B91C1C] shrink-0" />
                                ) : (
                                  <Folder size={15} className="text-[#B91C1C] shrink-0" />
                                )
                              ) : (
                                <BookOpen size={14} className="text-[#14284B] dark:text-zinc-300 shrink-0" />
                              )}

                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                  <span className="text-xs font-bold text-[#14284B] dark:text-white">
                                    {p.title}
                                  </span>
                                  {status === 'PRIOR_LEARNING_APPROVED' ? (
                                    <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                                      · Prior Learning Approved
                                    </span>
                                  ) : status === 'COMPLETED' ? (
                                    <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                                      · Completed
                                    </span>
                                  ) : status === 'CURRENT' ? (
                                    <span className="text-[11px] font-bold text-[#B91C1C] dark:text-red-400">
                                      · Currently Learning
                                    </span>
                                  ) : status === 'LOCKED' ? (
                                    <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 inline-flex items-center gap-1">
                                      · <Lock size={10} /> Locked (Requires{' '}
                                      {node.missingPrerequisites.map((m) => m.title).join(', ')})
                                    </span>
                                  ) : (
                                    <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                                      · {status === 'OPTIONAL' ? 'Optional' : 'Upcoming'}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2.5 shrink-0 tabular-nums">
                              <span className="text-xs font-bold text-slate-700 dark:text-zinc-300">
                                {pct}%
                              </span>
                              {countsOwnUnit &&
                                node.selfStatus !== 'COMPLETED' &&
                                node.selfStatus !== 'PRIOR_LEARNING_APPROVED' &&
                                node.priorLearningRecord?.status !== 'PENDING' && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPriorRequestNode(node);
                                      setPriorReqEvidence('');
                                      setPriorReqNotes('');
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-zinc-800 text-[#14284B] dark:text-zinc-200 border border-slate-200 dark:border-zinc-700 text-[10px] font-bold hover:border-[#B91C1C] hover:text-[#B91C1C] cursor-pointer"
                                  >
                                    Request Credit
                                  </button>
                                )}
                              {node.priorLearningRecord?.status === 'PENDING' && (
                                <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                                  Credit Pending
                                </span>
                              )}
                            </div>
                          </div>

                          {hasChildren && isExpanded && (
                            <div>{node.children.map((c) => renderStudentNode(c))}</div>
                          )}
                        </div>
                      );
                    };
                    return pathwaySummary.rootBranches.map((r) => renderStudentNode(r));
                  })()}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* ══ MODAL: STUDENT REQUEST PRIOR-LEARNING RECOGNITION ══ */}
      {priorRequestNode && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!priorRequestNode || !resolvedStudentId) return;
              setSubmittingPriorReq(true);
              try {
                await submitPriorLearningRecognition({
                  studentId: resolvedStudentId,
                  studentName: resolvedStudentName,
                  program: priorRequestNode.program,
                  programsMap,
                  recognitionType: priorReqType,
                  evidenceReference: priorReqEvidence,
                  verificationNotes: priorReqNotes,
                  actorUid: auth.currentUser?.uid || resolvedStudentId,
                  actorName: resolvedStudentName,
                  actorRole: 'STUDENT',
                  approveImmediately: false,
                });
                toast.success(
                  `Submitted Prior-Learning Recognition request for "${priorRequestNode.program.title}". Your tutor or administrator will verify it.`
                );
                setPriorRequestNode(null);
                await loadCourses();
              } catch (err: any) {
                toast.error(err?.message || 'Could not submit prior-learning request.');
              } finally {
                setSubmittingPriorReq(false);
              }
            }}
            className="bg-white dark:bg-[#111114] rounded-2xl border border-slate-200 dark:border-zinc-800 max-w-lg w-full p-5 sm:p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-black text-[#14284B] dark:text-white flex items-center gap-2">
                  <Award size={18} className="text-[#B91C1C]" />
                  <span>Request Prior-Learning Recognition</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                  Unit: <strong>{priorRequestNode.breadcrumbPath}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPriorRequestNode(null)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                How did you complete this unit?
              </label>
              <select
                value={priorReqType}
                onChange={(e) => setPriorReqType(e.target.value as PriorLearningRecognitionType)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-zinc-700 rounded-xl text-xs font-bold bg-white dark:bg-[#18181B] dark:text-white"
              >
                <option value="PRIOR_COMPLETION">Completed Previously</option>
                <option value="PORTFOLIO_VERIFIED">Built Practical Project / Portfolio</option>
                <option value="ASSESSMENT_PASSED">Ready for Placement Assessment</option>
                <option value="CREDIT_TRANSFER">Completed at Previous School / Academy</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                Project Link / Certificate / Evidence *
              </label>
              <input
                type="text"
                required
                value={priorReqEvidence}
                onChange={(e) => setPriorReqEvidence(e.target.value)}
                placeholder="Paste link to your project, GitHub repo, or certificate..."
                className="w-full px-3 py-2 border border-slate-300 dark:border-zinc-700 rounded-xl text-xs bg-white dark:bg-[#18181B] dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1">
                Summary of What You Know *
              </label>
              <textarea
                rows={2}
                required
                value={priorReqNotes}
                onChange={(e) => setPriorReqNotes(e.target.value)}
                placeholder="Briefly describe the concepts and projects you have already built..."
                className="w-full p-2.5 border border-slate-300 dark:border-zinc-700 rounded-xl text-xs bg-white dark:bg-[#18181B] dark:text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPriorRequestNode(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingPriorReq}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
              >
                <Send size={13} />
                <span>{submittingPriorReq ? 'Submitting...' : 'Submit for Tutor Verification'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ══ INTERACTIVE CURRICULUM READER MODAL ══ */}
      {readingCurriculum && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#111114] rounded-2xl border border-gray-200 dark:border-zinc-800 w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-zinc-800 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1.5 text-[11px] font-bold">
                  <span className="text-[#B91C1C] dark:text-red-400 uppercase tracking-wider">
                    Official Curriculum Reader
                  </span>
                  <span className="text-slate-400 dark:text-zinc-500">
                    · {readingCurriculum.stageName}
                  </span>
                </div>
                <h2 className="text-lg sm:text-xl font-black text-[#14284B] dark:text-white">
                  {readingCurriculum.curriculumTitle || readingCurriculum.title}
                </h2>
              </div>

              <button
                onClick={() => setReadingCurriculum(null)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 text-xs sm:text-sm custom-scrollbar">
              {readingCurriculum.curriculumSummary && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-300">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-1">Overview</h4>
                  <p className="leading-relaxed">{readingCurriculum.curriculumSummary}</p>
                </div>
              )}

              {/* Topics Breakdown */}
              {readingCurriculum.topics.length > 0 && (
                <SyllabusTopicsList
                  topics={readingCurriculum.topics}
                  overallProgress={
                    typeof readingCurriculum.progressPercent === 'number'
                      ? readingCurriculum.progressPercent
                      : readingCurriculum.lessonsCount
                      ? Math.round((readingCurriculum.completedLessons / readingCurriculum.lessonsCount) * 100)
                      : 0
                  }
                  completedTopics={readingCurriculum.completedTopics || []}
                  heading="Curriculum Syllabus Topics"
                  defaultExpanded={true}
                />
              )}

              {/* If Google Drive or Web PDF Link */}
              {readingCurriculum.curriculumPdfUrl && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h5 className="font-bold text-[#14284B] dark:text-white text-sm">Full Curriculum PDF / Document Link</h5>
                    <p className="text-xs text-slate-600 dark:text-zinc-400 mt-0.5 font-mono truncate max-w-md">
                      {readingCurriculum.curriculumPdfUrl}
                    </p>
                  </div>
                  <a
                    href={readingCurriculum.curriculumPdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-[#14284B] hover:bg-[#1E3A6A] text-white rounded-xl text-xs font-bold transition-colors inline-flex items-center gap-1.5 shrink-0"
                  >
                    <span>Open in Full Viewer</span>
                    <ExternalLink size={13} />
                  </a>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:p-6 border-t border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#09090B] flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-xs text-slate-500 dark:text-zinc-400">
                Official syllabus authorized for Jaystarbliss Studio learners.
              </span>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex-1 sm:flex-none px-4 py-2.5 bg-white dark:bg-[#18181B] border border-slate-200 dark:border-zinc-700 rounded-xl text-xs font-bold text-slate-700 dark:text-zinc-200 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Printer size={14} /> Print Syllabus
                </button>
                {readingCurriculum.curriculumPdfUrl && (
                  <a
                    href={readingCurriculum.curriculumPdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    download
                    className="flex-1 sm:flex-none px-4 py-2.5 bg-[#B91C1C] hover:bg-[#991B1B] text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2"
                  >
                    <Download size={14} /> Download PDF
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══ UPLOAD / UPDATE CURRICULUM MODAL ══ */}
      {showUploadModal && selectedModule && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#111114] rounded-2xl border border-slate-200 dark:border-zinc-800 w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-zinc-800 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-[#14284B] dark:text-white">
                  Upload / Link Program Curriculum
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                  Attach curriculum documents and syllabus units for <strong>{selectedModule.title}</strong>.
                </p>
              </div>

              <button
                onClick={() => setShowUploadModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveCurriculum} className="p-5 sm:p-6 overflow-y-auto space-y-4 flex-1 custom-scrollbar text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-zinc-300 mb-1">Curriculum Title</label>
                <input
                  required
                  type="text"
                  value={curriculumForm.title}
                  onChange={e => setCurriculumForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g. Weekend Coding 2026 Core Curriculum"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-zinc-800 rounded-xl text-xs text-slate-900 dark:text-white outline-hidden focus:border-[#B91C1C]"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-zinc-300 mb-1">
                  Curriculum PDF / Google Drive Document Link
                </label>
                <input
                  type="url"
                  value={curriculumForm.pdfUrl}
                  onChange={e => setCurriculumForm(prev => ({ ...prev, pdfUrl: e.target.value }))}
                  placeholder="https://drive.google.com/... or https://..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-zinc-800 rounded-xl text-xs text-slate-900 dark:text-white outline-hidden focus:border-[#B91C1C] font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-zinc-300 mb-1">Short Description / Overview</label>
                <textarea
                  rows={3}
                  value={curriculumForm.summary}
                  onChange={e => setCurriculumForm(prev => ({ ...prev, summary: e.target.value }))}
                  placeholder="Brief description of the skills, technologies, and term goals covered in this curriculum..."
                  className="w-full p-2.5 bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-zinc-800 rounded-xl text-xs text-slate-900 dark:text-white outline-hidden focus:border-[#B91C1C] resize-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-zinc-300 mb-1">
                  Syllabus Units &amp; Topics (One item per line)
                </label>
                <textarea
                  rows={4}
                  value={curriculumForm.topicsText}
                  onChange={e => setCurriculumForm(prev => ({ ...prev, topicsText: e.target.value }))}
                  placeholder="Unit 1: Computational Thinking&#10;Unit 2: Algorithms & Loops&#10;Unit 3: Capstone Game Project"
                  className="w-full p-2.5 bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-zinc-800 rounded-xl text-xs text-slate-900 dark:text-white outline-hidden focus:border-[#B91C1C] resize-none font-mono"
                />
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={curriculumForm.notifyUsers}
                    onChange={e => setCurriculumForm(prev => ({ ...prev, notifyUsers: e.target.checked }))}
                    className="rounded border-zinc-700 text-[#B91C1C] focus:ring-[#B91C1C]"
                  />
                  <span className="text-slate-700 dark:text-zinc-300 font-bold text-xs">
                    Notify enrolled students &amp; schools about this curriculum update
                  </span>
                </label>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={uploading}
                  className="w-full py-2.5 bg-[#B91C1C] hover:bg-[#991B1B] text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {uploading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  <span>Save Curriculum &amp; Publish</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PortalCourses;
