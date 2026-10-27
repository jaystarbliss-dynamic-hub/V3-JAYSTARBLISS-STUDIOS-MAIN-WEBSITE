import React, { useEffect, useMemo, useState } from 'react';
import { 
  BookOpen, Code, CheckCircle2, ExternalLink, Award, Layers, 
  Loader2, PlayCircle, ClipboardList, Flag, GraduationCap,
  Calendar, Check, UserCheck, ArrowRight, FileText, Upload, Eye,
  Download, Printer, X, Plus, AlertCircle, Send
} from 'lucide-react';
import { collection, doc, getDoc, getDocs, query, setDoc, where, addDoc, serverTimestamp } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { db, auth } from '../../lib/firebase';
import SEO from '../../components/ui/SEO';
import { getEffectiveAuth } from '../../utils/impersonation';
import { useToast } from '../../contexts/ToastContext';

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

  const loadCourses = async () => {
    setLoading(true);
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

      const primaryTrack = studentRecord?.plan || studentRecord?.track || studentRecord?.programName || 'Assigned Learning Track';
      setStudentTrackTitle(primaryTrack);

      // 2. Fetch all published programs from Firestore
      const programMap = new Map<string, CourseModule>();
      const publishedSnap = await getDocs(query(collection(db, 'programs'), where('status', '==', 'PUBLISHED')));
      
      const allPublished = publishedSnap.docs.map((d, index) => toModule(d.id, d.data(), index));

      // 3. Filter strictly to programs assigned to this student (or matching their enrolled series)
      let relevantPrograms: CourseModule[] = [];

      if (assignedNames.size > 0) {
        relevantPrograms = allPublished.filter(prog => {
          const titleLow = prog.title.toLowerCase().trim();
          const seriesLow = (prog.seriesName || '').toLowerCase().trim();
          
          for (const name of assignedNames) {
            if (titleLow === name || titleLow.includes(name) || name.includes(titleLow)) return true;
            if (seriesLow && (seriesLow === name || seriesLow.includes(name) || name.includes(seriesLow))) return true;
          }
          return false;
        });

        // If a program belongs to a series, also pull in the sibling stages of that series in order
        const activeSeries = new Set<string>();
        relevantPrograms.forEach(p => {
          if (p.seriesName) activeSeries.add(p.seriesName.toLowerCase().trim());
        });

        if (activeSeries.size > 0) {
          allPublished.forEach(prog => {
            const sName = (prog.seriesName || '').toLowerCase().trim();
            if (sName && activeSeries.has(sName)) {
              if (!relevantPrograms.some(r => r.id === prog.id)) {
                relevantPrograms.push(prog);
              }
            }
          });
        }
      }

      // Never substitute a hardcoded/default programme when no programme is
      // assigned. An empty state is more accurate than showing unrelated courses.

      relevantPrograms.forEach(mod => programMap.set(mod.id, mod));

      // 4. Merge persistent student progress records
      if (currentUid || studentDocId) {
        const userQueryIds = [currentUid, studentDocId].filter(Boolean) as string[];
        
        for (const uid of userQueryIds) {
          for (const source of ['courseProgress', 'studentProgress']) {
            try {
              const snap = await getDocs(query(collection(db, source), where('userId', '==', uid)));
              snap.forEach(d => {
                const p = d.data();
                const courseId = p.courseId || p.programId || p.moduleId;
                if (!courseId || !programMap.has(courseId)) return;
                const current = programMap.get(courseId)!;
                const completed = progressCount(p);
                const bounded = current.lessonsCount ? Math.min(current.lessonsCount, completed) : completed;
                programMap.set(courseId, {
                  ...current,
                  completedLessons: Math.max(current.completedLessons, bounded),
                  badgeUnlocked: Boolean(p.badgeUnlocked || p.completed === true || (current.lessonsCount > 0 && bounded >= current.lessonsCount)),
                  ...normalizeActiveLesson(p)
                });
              });
            } catch (e) {
              console.warn(`${source} progress lookup error:`, e);
            }
          }
        }
      }

      // Sort strictly by stage number, then title
      const sortedPrograms = Array.from(programMap.values()).sort((a, b) => a.stage - b.stage || a.title.localeCompare(b.title));
      const uniqueTitles = new Map<string, CourseModule>();
      sortedPrograms.forEach(program => {
        const key = program.title.trim().toLowerCase().replace(/\s+/g, ' ');
        if (!uniqueTitles.has(key)) uniqueTitles.set(key, program);
      });
      const list = Array.from(uniqueTitles.values());
      setModules(list);
      setSelectedId(prev => prev && list.some(m => m.id === prev) ? prev : list[0]?.id || '');

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

  return (
    <div className="space-y-6">
      <SEO 
        title="Curriculum & Course Tracks | Jaystarbliss Studios" 
        description="View your assigned Jaystarbliss learning programs, curriculum stages, and recorded progress." 
        noindex={true}
      />

      {/* Compact Track & Scratch IDE Toolbar */}
      <div className="bg-white dark:bg-[#0c1220] rounded-2xl border border-gray-200/80 dark:border-slate-800 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <GraduationCap size={16} className="text-brand-red shrink-0" />
          <span>Active Track: <strong className="text-slate-900 dark:text-white font-bold">{studentTrackTitle}</strong></span>
        </div>

        <a 
          href="https://scratch.mit.edu" 
          target="_blank" 
          rel="noreferrer" 
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-slate-800 text-white text-xs font-bold rounded-xl shrink-0 shadow-xs hover:bg-slate-800 transition-colors"
        >
          <Code size={14} className="text-brand-red" /> Launch Scratch IDE <ExternalLink size={12} />
        </a>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-gray-500">
          <Loader2 className="animate-spin mr-2" size={22} /> Loading your assigned courses…
        </div>
      ) : message && !modules.length ? (
        <div className="p-12 text-center rounded-3xl border border-dashed border-gray-200 dark:border-slate-800 text-sm text-gray-500 bg-white dark:bg-[#0c1220]">
          <BookOpen size={32} className="mx-auto text-slate-400 mb-3" />
          <p className="font-bold text-slate-700 dark:text-slate-300">{message}</p>
          <p className="text-xs text-slate-400 mt-1">Contact your institution administrator or tutor to assign your curriculum track.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Sequential Stage Cards List */}
          <div className="space-y-3">
            <h2 className="text-xs font-black uppercase tracking-wider text-gray-400 px-1 flex items-center justify-between">
              <span>Assigned Curriculum Stages</span>
              <span className="text-[11px] font-bold text-brand-red">{modules.length} Stages</span>
            </h2>

            {modules.map((mod) => {
              const progress = mod.lessonsCount > 0 ? Math.round((mod.completedLessons / mod.lessonsCount) * 100) : 0;
              const isSelected = selectedId === mod.id;

              return (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => setSelectedId(mod.id)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-brand-red bg-white dark:bg-[#0c1220] shadow-md ring-2 ring-brand-red/20'
                      : 'border-gray-200/80 dark:border-slate-800 bg-white/70 dark:bg-[#0c1220]/60 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5 gap-2">
                    <span className="text-[11px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-red-50 dark:bg-red-950/40 text-brand-red border border-red-100 dark:border-red-900/30 truncate">
                      {mod.stageName}
                    </span>
                    {mod.badgeUnlocked && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                        <Award size={10} /> Certified
                      </span>
                    )}
                  </div>

                  <h3 className="font-bold text-sm text-gray-900 dark:text-white mb-2 line-clamp-1">
                    {mod.title}
                  </h3>

                  {mod.seriesName && (
                    <p className="text-[10px] text-slate-400 font-medium mb-2 truncate">
                      Series: {mod.seriesName}
                    </p>
                  )}

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-slate-400">
                      <span>{mod.lessonsCount ? `${mod.completedLessons} of ${mod.lessonsCount} lessons` : 'Syllabus modules active'}</span>
                      <span className="font-bold text-slate-700 dark:text-slate-300">{progress}%</span>
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div className="h-full bg-brand-red transition-all" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right: Selected Stage Syllabus & Details */}
          {selectedModule && (
            <div className="lg:col-span-2 bg-white dark:bg-[#0c1220] rounded-3xl border border-gray-200/80 dark:border-slate-800 p-6 sm:p-8 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <span className="px-3 py-1 bg-brand-red/10 text-brand-red font-black text-xs rounded-lg uppercase tracking-wider">
                    {selectedModule.stageName}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-slate-400 font-mono font-bold">
                    Duration: {selectedModule.duration}
                  </span>
                </div>

                <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-2 tracking-tight">
                  {selectedModule.title}
                </h2>

                {selectedModule.instructor && (
                  <div className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1 rounded-xl border border-emerald-200 dark:border-emerald-800">
                    <UserCheck size={13} /> Faculty Lead: {selectedModule.instructor}
                  </div>
                )}

                <p className="text-sm text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
                  {selectedModule.description}
                </p>

                {/* 📄 Dedicated Curriculum Document Banner / Preview Button */}
                <div className="mb-6 p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-600/10 dark:bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 mt-0.5">
                      <FileText size={20} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                        {selectedModule.curriculumTitle || `${selectedModule.title} Official Curriculum Document`}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {selectedModule.curriculumPdfUrl 
                          ? 'Complete syllabus, learning objectives, class timetable & milestone checklist available to read.'
                          : 'No external PDF document linked yet. Tutors and admins can upload or link the curriculum syllabus.'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {selectedModule.curriculumPdfUrl ? (
                      <button
                        type="button"
                        onClick={() => setReadingCurriculum(selectedModule)}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <Eye size={14} />
                        <span>Read Curriculum</span>
                      </button>
                    ) : (
                      <span className="px-3.5 py-2 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 text-xs font-bold">Curriculum not linked yet</span>
                    )}
                    {canManageCurriculum && (
                      <button
                        type="button"
                        onClick={() => handleOpenCurriculumModal(selectedModule)}
                        className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-brand-red hover:text-brand-red text-xs font-bold transition-colors inline-flex items-center gap-1.5"
                      >
                        <Upload size={14} />
                        <span>{selectedModule.curriculumPdfUrl ? 'Update Curriculum' : 'Upload Curriculum'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Core Subject Syllabus / Topics Grid */}
                <div className="space-y-3 mb-6">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-gray-400">
                      Stage Syllabus &amp; Core Topics ({selectedModule.topics.length} Units)
                    </h4>
                  </div>
                  {selectedModule.topics.length ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {selectedModule.topics.map((topic, i) => (
                        <div
                          key={`${topic}-${i}`}
                          className="p-3.5 rounded-xl border border-gray-100 dark:border-slate-800 bg-gray-50/70 dark:bg-slate-900/50 flex items-center gap-3 text-xs font-semibold text-gray-800 dark:text-gray-200"
                        >
                          <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                          <span className="truncate">{topic}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl border border-dashed border-gray-200 dark:border-slate-800 text-xs text-gray-500">
                      Curriculum topics and laboratory exercises are active for this stage.
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-6 border-t border-gray-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
                  <BookOpen size={16} className="text-brand-red" />
                  <span>
                    {selectedModule.lessonsCount
                      ? `${selectedModule.completedLessons}/${selectedModule.lessonsCount} lessons recorded`
                      : 'Structured stage milestones'}
                  </span>
                </div>

                {selectedModule.activeLessonUrl ? (
                  <a
                    href={selectedModule.activeLessonUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-5 py-2.5 bg-brand-red hover:bg-red-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-sm transition-all"
                  >
                    <PlayCircle size={15} /> {selectedModule.activeLessonTitle || 'Open Active Lesson'} <ExternalLink size={12} />
                  </a>
                ) : (
                  <div className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 px-4 py-2.5 text-xs font-bold text-slate-400">
                    <PlayCircle size={15} /> Stage Active in Laboratory
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2 pt-3 border-t border-slate-100 dark:border-slate-800/60">
                <Link to="/portal/student/assignments" className="min-h-10 inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 px-3.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                  <ClipboardList size={14} /> Deliverables &amp; Assignments
                </Link>
                <Link to="/portal/student/milestones" className="min-h-10 inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 px-3.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
                  <Flag size={14} /> Stage Milestones
                </Link>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ INTERACTIVE CURRICULUM READER MODAL ══ */}
      {readingCurriculum && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-200 dark:border-slate-800 w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-200 dark:border-slate-800 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="px-2.5 py-0.5 rounded-full bg-brand-red/10 text-brand-red text-[10px] font-black uppercase">
                    Official Curriculum Reader
                  </span>
                  <span className="text-xs text-slate-400 font-bold">
                    {readingCurriculum.stageName}
                  </span>
                </div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white">
                  {readingCurriculum.curriculumTitle || readingCurriculum.title}
                </h2>
              </div>

              <button
                onClick={() => setReadingCurriculum(null)}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs sm:text-sm custom-scrollbar">
              {readingCurriculum.curriculumSummary && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Overview</h4>
                  <p className="leading-relaxed">{readingCurriculum.curriculumSummary}</p>
                </div>
              )}

              {/* Topics Breakdown */}
              {readingCurriculum.topics.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
                    Curriculum Syllabus Topics ({readingCurriculum.topics.length} Core Modules)
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {readingCurriculum.topics.map((topic, i) => (
                      <div key={i} className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center gap-3">
                        <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{topic}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* If Google Drive or Web PDF Link */}
              {readingCurriculum.curriculumPdfUrl && (
                <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h5 className="font-bold text-indigo-950 dark:text-indigo-200 text-sm">Full Curriculum PDF / Document Link</h5>
                    <p className="text-xs text-indigo-700 dark:text-indigo-300 mt-0.5 font-mono truncate max-w-md">
                      {readingCurriculum.curriculumPdfUrl}
                    </p>
                  </div>
                  <a
                    href={readingCurriculum.curriculumPdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-colors inline-flex items-center gap-1.5 shrink-0"
                  >
                    <span>Open in Full Viewer</span>
                    <ExternalLink size={13} />
                  </a>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:p-6 border-t border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-950 flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-xs text-slate-500">
                Official syllabus authorized for Jaystarbliss Studio learners.
              </span>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex-1 sm:flex-none px-4 py-2.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-100 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Printer size={14} /> Print Syllabus
                </button>
                {readingCurriculum.curriculumPdfUrl && (
                  <a
                    href={readingCurriculum.curriculumPdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    download
                    className="flex-1 sm:flex-none px-4 py-2.5 bg-brand-red hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2"
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
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-200 dark:border-slate-800 w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-200 dark:border-slate-800 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-gray-900 dark:text-white">
                  Upload / Link Program Curriculum
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Attach curriculum documents and syllabus units for <strong>{selectedModule.title}</strong>.
                </p>
              </div>

              <button
                onClick={() => setShowUploadModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveCurriculum} className="p-6 overflow-y-auto space-y-4 flex-1 custom-scrollbar text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Curriculum Title</label>
                <input
                  required
                  type="text"
                  value={curriculumForm.title}
                  onChange={e => setCurriculumForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g. Weekend Coding 2026 Core Curriculum"
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl text-xs text-gray-900 dark:text-white outline-hidden focus:border-brand-red"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Curriculum PDF / Google Drive Document Link
                </label>
                <input
                  type="url"
                  value={curriculumForm.pdfUrl}
                  onChange={e => setCurriculumForm(prev => ({ ...prev, pdfUrl: e.target.value }))}
                  placeholder="https://drive.google.com/... or https://..."
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl text-xs text-gray-900 dark:text-white outline-hidden focus:border-brand-red font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Short Description / Overview</label>
                <textarea
                  rows={3}
                  value={curriculumForm.summary}
                  onChange={e => setCurriculumForm(prev => ({ ...prev, summary: e.target.value }))}
                  placeholder="Brief description of the skills, technologies, and term goals covered in this curriculum..."
                  className="w-full p-2.5 bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl text-xs text-gray-900 dark:text-white outline-hidden focus:border-brand-red resize-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Syllabus Units &amp; Topics (One item per line)
                </label>
                <textarea
                  rows={4}
                  value={curriculumForm.topicsText}
                  onChange={e => setCurriculumForm(prev => ({ ...prev, topicsText: e.target.value }))}
                  placeholder="Unit 1: Computational Thinking&#10;Unit 2: Algorithms & Loops&#10;Unit 3: Capstone Game Project"
                  className="w-full p-2.5 bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl text-xs text-gray-900 dark:text-white outline-hidden focus:border-brand-red resize-none font-mono"
                />
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={curriculumForm.notifyUsers}
                    onChange={e => setCurriculumForm(prev => ({ ...prev, notifyUsers: e.target.checked }))}
                    className="rounded border-slate-700 text-brand-red focus:ring-brand-red"
                  />
                  <span className="text-slate-700 dark:text-slate-300 font-bold text-xs">
                    Notify enrolled students &amp; schools about this curriculum update
                  </span>
                </label>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={uploading}
                  className="w-full py-2.5 bg-brand-red hover:bg-red-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md shadow-brand-red/20 cursor-pointer disabled:opacity-50"
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
