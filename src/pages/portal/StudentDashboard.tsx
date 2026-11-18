import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Award,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  ExternalLink,
  FileText,
  Link as LinkIcon,
  Loader2,
  Lock,
  Radio,
  Send,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
  updateDoc,
} from 'firebase/firestore';
import { auth, db, getAllClientDatabases } from '../../lib/firebase';
import SEO from '../../components/ui/SEO';
import {
  StudentAnalyticsVisualizer,
  type LearningProgressItem,
  type StudentGradeRecord,
} from '../../components/portal/StudentAnalyticsVisualizer';
import { TypingMastersAcademyCard } from '../../components/portal/TypingMastersAcademyCard';
import { useToast } from '../../contexts/ToastContext';
import {
  calculateGradeLetter,
  calculateScorePercentage,
  computeExamMaxScore,
  isAttemptResultReleased,
  isStudentEligibleForWork,
  normalizeWorkType,
} from '../../lib/classes';
import {
  doesScheduleMatchStudent,
  resolveFullStudentEnrollmentContext,
} from '../../lib/scheduleEngine';
import {
  type LinkedLearnerProfile,
  fetchAssignmentsForLearner,
} from '../../lib/academicSyncEngine';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
} from 'recharts';

interface StudentInfo {
  id?: string;
  fullName?: string;
  name?: string;
  username?: string;
  email?: string;
  parentId?: string;
  parentEmail?: string;
  accessCode?: string;
  passcode?: string;
  class?: string;
  grade?: string;
  schoolId?: string;
  schoolName?: string;
  schoolCode?: string;
  school?: string;
  plan?: string;
  track?: string;
  subjects?: string[];
  schedule?: string;
  status?: string;
  notes?: string;
}

interface ProgramModule {
  id: string;
  title: string;
  stageName: string;
  stageNumber: number;
  trackName: string;
  completed: boolean;
  completionDate?: string;
  score?: string;
  competencies: string[];
  instructor: string;
}

interface ResourceItem {
  id: string;
  title: string;
  url?: string;
  fileUrl?: string;
  type?: string;
  docType?: string;
  description?: string;
  subject?: string;
  targetClass?: string;
  class?: string;
  classLevel?: string;
  assignedClasses?: string[];
  schoolId?: string;
  schoolName?: string;
  school?: string;
  isClassSpecific?: boolean;
  dateAdded?: string;
  createdAt?: string;
}

interface LinkItem {
  id: string;
  title: string;
  url: string;
  platform?: string;
  description?: string;
  meetingTime?: string;
}

interface ExamItem {
  id: string;
  title: string;
  link?: string;
  url?: string;
  subject?: string;
  workType?: string;
  status?: string;
  dueDate?: string;
  duration?: string;
  durationMinutes?: number;
  targetClass?: string;
  class?: string;
  passcodeProtected?: boolean;
}

interface DynamicMilestone {
  id: string;
  title: string;
  description?: string;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED';
  dueDate?: string;
  completedAt?: string;
  position?: number;
}

interface DynamicAssignment {
  id: string;
  title: string;
  instructions?: string;
  tutorName?: string;
  studentName?: string;
  dueDate?: string;
  status: string;
  grade?: number;
  feedback?: string;
  submissionText?: string;
  submissionUrl?: string;
  submittedAt?: string;
  reviewedAt?: string;
  reviewStatus?: string;
  resourceUrl?: string;
  resourceTitle?: string;
}

const stableCredentialId = (studentKey: string, moduleId: string) => {
  let hash = 0;
  const source = `${studentKey}:${moduleId}`;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + source.charCodeAt(index)) >>> 0;
  }
  return `JDS-CERT-${hash.toString(36).toUpperCase().padStart(7, '0').slice(-7)}`;
};

const formatDate = (value?: string) => {
  if (!value) return 'No deadline set';
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return value;
  }
};

export const StudentDashboard: React.FC = () => {
  const toast = useToast();

  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [modules, setModules] = useState<ProgramModule[]>([]);
  const [, setClassResources] = useState<ResourceItem[]>([]);
  const [, setGeneralResources] = useState<ResourceItem[]>([]);
  const [, setPersonalResources] = useState<ResourceItem[]>([]);
  const [, setPersonalLinks] = useState<LinkItem[]>([]);
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [releasedGrades, setReleasedGrades] = useState<StudentGradeRecord[]>([]);
  const [studentSchedules, setStudentSchedules] = useState<any[]>([]);
  const [dynamicMilestones, setDynamicMilestones] = useState<DynamicMilestone[]>([]);
  const [studentAssignments, setStudentAssignments] = useState<DynamicAssignment[]>([]);
  const [curriculumTopics, setCurriculumTopics] = useState<string[]>([]);
  const [enrolledProgramName, setEnrolledProgramName] = useState<string>('');
  const [isEdclubAllowed, setIsEdclubAllowed] = useState<boolean>(false);
  const [, setHasResourcesAllowed] = useState<boolean>(true);
  const [programDetails, setProgramDetails] = useState<{
    hasStages: boolean;
    stageNumber?: number;
    stageName?: string;
    seriesName?: string;
    nextProgramTitle?: string;
  }>({ hasStages: false });

  // Assignment Google Link Submission Modal
  const [submittingAssignment, setSubmittingAssignment] = useState<DynamicAssignment | null>(null);
  const [submissionGoogleUrl, setSubmissionGoogleUrl] = useState('');
  const [submissionNotes, setSubmissionNotes] = useState('');
  const [isSubmittingLink, setIsSubmittingLink] = useState(false);

  const [loading, setLoading] = useState(true);

  const fetchStudentData = async () => {
    setLoading(true);
    try {
      const authUser = auth.currentUser;
      const lookupUid = authUser?.uid;
      const studentUsername = sessionStorage.getItem('studentUsername');
      const studentAccessCode = sessionStorage.getItem('studentAccessCode');
      const cachedStudentId = sessionStorage.getItem('studentDocId');
      const cachedClass = sessionStorage.getItem('studentClass');

      let studentRecord: StudentInfo | null = null;
      let studentId = cachedStudentId || '';

      // 1. Direct document query if ID available (merge students + individualStudents so partial stubs never mask school/class)
      if (cachedStudentId) {
        try {
          const [directDoc, indivDoc] = await Promise.all([
            getDoc(doc(db, 'students', cachedStudentId)).catch(() => null),
            getDoc(doc(db, 'individualStudents', cachedStudentId)).catch(() => null),
          ]);
          if (directDoc?.exists() || indivDoc?.exists()) {
            const stdData = (directDoc?.exists() ? directDoc.data() : {}) as Record<string, any>;
            const indData = (indivDoc?.exists() ? indivDoc.data() : {}) as Record<string, any>;
            studentRecord = {
              id: cachedStudentId,
              ...indData,
              ...stdData,
              schoolId: stdData.schoolId || indData.schoolId || sessionStorage.getItem('schoolId') || '',
              schoolName: stdData.schoolName || indData.schoolName || sessionStorage.getItem('schoolName') || '',
              class: stdData.class || stdData.grade || indData.class || indData.grade || cachedClass || '',
              fullName: stdData.fullName || stdData.name || indData.fullName || indData.name || '',
            } as StudentInfo;
          }
        } catch (e) {
          console.warn('Direct studentDoc lookup warning:', e);
        }
      }

      // 2. Query collections by username / accessCode / uid
      if (!studentRecord) {
        const queryList: any[] = [];
        if (lookupUid) {
          queryList.push(query(collection(db, 'students'), where('firebaseUid', '==', lookupUid), limit(1)));
          queryList.push(query(collection(db, 'individualStudents'), where('firebaseUid', '==', lookupUid), limit(1)));
          queryList.push(query(collection(db, 'students'), where('userId', '==', lookupUid), limit(1)));
          queryList.push(query(collection(db, 'individualStudents'), where('userId', '==', lookupUid), limit(1)));
        }
        if (studentUsername) {
          queryList.push(query(collection(db, 'students'), where('username', '==', studentUsername), limit(1)));
          queryList.push(query(collection(db, 'individualStudents'), where('username', '==', studentUsername), limit(1)));
        }
        if (studentAccessCode) {
          queryList.push(query(collection(db, 'students'), where('accessCode', '==', studentAccessCode), limit(1)));
          queryList.push(query(collection(db, 'individualStudents'), where('accessCode', '==', studentAccessCode), limit(1)));
        }

        const snapshots = await Promise.all(queryList.map((q) => getDocs(q).catch(() => null)));
        for (const snap of snapshots) {
          if (snap && !snap.empty) {
            const targetDoc = snap.docs[0];
            studentRecord = { id: targetDoc.id, ...(targetDoc.data() as object) } as StudentInfo;
            studentId = targetDoc.id;
            break;
          }
        }
      }

      // 3. Fallback to session credentials
      if (!studentRecord) {
        const sessionName = sessionStorage.getItem('studentName') || sessionStorage.getItem('userName');
        const sessionEmail = sessionStorage.getItem('studentEmail') || authUser?.email || '';
        const sessionSchool = sessionStorage.getItem('studentSchoolName') || sessionStorage.getItem('schoolName') || '';
        const sessionSchoolId = sessionStorage.getItem('studentSchoolId') || sessionStorage.getItem('schoolId') || '';
        const sessionClass = sessionStorage.getItem('studentClass') || '';
        const sessionPlan = sessionStorage.getItem('studentPlan') || '';

        if (sessionName || sessionEmail || lookupUid) {
          studentRecord = {
            id: cachedStudentId || lookupUid || 'session-student',
            fullName: sessionName || 'Student',
            name: sessionName || 'Student',
            email: sessionEmail,
            schoolName: sessionSchool,
            schoolId: sessionSchoolId,
            class: sessionClass,
            plan: sessionPlan
          };
        }
      }

      if (!studentRecord) {
        setStudent(null);
        setLoading(false);
        return;
      }

      // Resolve school name & school info dynamically
      if (!studentRecord.schoolName && studentRecord.school) {
        studentRecord.schoolName = studentRecord.school;
      }
      if (!studentRecord.schoolName && sessionStorage.getItem('studentSchoolName')) {
        studentRecord.schoolName = sessionStorage.getItem('studentSchoolName') || '';
      }
      if (!studentRecord.schoolId && sessionStorage.getItem('studentSchoolId')) {
        studentRecord.schoolId = sessionStorage.getItem('studentSchoolId') || '';
      }

      let progName = (studentRecord as any).programName || (studentRecord as any).program || studentRecord.plan || (studentRecord as any).track || '';
      let edclubAccess = false;
      let resAccess = true;

      const assignedProgramsList: string[] = Array.from(new Set([
        studentRecord.plan,
        (studentRecord as any).track,
        (studentRecord as any).programName,
        (studentRecord as any).programTitle,
        ...(Array.isArray((studentRecord as any).enrolledPrograms) ? (studentRecord as any).enrolledPrograms : []),
        ...(Array.isArray(studentRecord.subjects) ? studentRecord.subjects : []),
        ...(Array.isArray((studentRecord as any).plans) ? (studentRecord as any).plans : []),
        ...(Array.isArray((studentRecord as any).programs) ? (studentRecord as any).programs : [])
      ])).filter(Boolean).map(s => String(s).trim().toLowerCase());

      // If student belongs to a school, inspect the school's configured programs & details
      if (studentRecord.schoolId) {
        try {
          const schDoc = await getDoc(doc(db, 'schools', studentRecord.schoolId));
          if (schDoc.exists()) {
            const schData = schDoc.data();
            if (schData.name && !studentRecord.schoolName) {
              studentRecord.schoolName = schData.name;
            }
            sessionStorage.setItem('studentSchoolName', schData.name || studentRecord.schoolName || '');
            sessionStorage.setItem('studentSchoolId', studentRecord.schoolId);

            const schPrograms: any[] = Array.isArray(schData.programs) ? schData.programs : [];
            if (schPrograms.length > 0) {
              const studentProgId = (studentRecord as any).programId || (studentRecord as any).assignedProgramId;
              schPrograms.forEach(p => {
                const pName = String(p.name || p.title || '').trim().toLowerCase();
                const isAssigned = (studentProgId && p.id === studentProgId) ||
                  assignedProgramsList.length === 0 ||
                  assignedProgramsList.some(ap => ap === pName || ap.includes(pName) || pName.includes(ap));

                if (isAssigned) {
                  if (!progName) progName = p.name;
                  if (p.hasEdclub === true || p.hasEdClub === true || pName.includes('digital literacy') || pName.includes('typing')) {
                    edclubAccess = true;
                  }
                  if (p.hasResources !== false) {
                    resAccess = true;
                  }
                }
              });

              if (!progName) {
                const explicitGeneral = schPrograms.find(p => p.isGeneralProgram === true);
                if (explicitGeneral) {
                  progName = explicitGeneral.name || explicitGeneral.title || '';
                  if (explicitGeneral.hasEdclub || String(explicitGeneral.name || '').toLowerCase().includes('digital literacy')) {
                    edclubAccess = true;
                  }
                }
              }
            }
          }
        } catch (e) {
          console.warn('School lookup notice in student dashboard:', e);
        }
      } else if (studentRecord.schoolName) {
        // Query school by name
        try {
          const schQuery = query(collection(db, 'schools'), where('name', '==', studentRecord.schoolName), limit(1));
          const schSnap = await getDocs(schQuery);
          if (!schSnap.empty) {
            const schDoc = schSnap.docs[0];
            const schData = schDoc.data();
            studentRecord.schoolId = schDoc.id;
            sessionStorage.setItem('studentSchoolId', schDoc.id);
            sessionStorage.setItem('studentSchoolName', schData.name || studentRecord.schoolName);
            if (Array.isArray(schData.programs) && schData.programs.length > 0 && !progName) {
              const explicitGen = schData.programs.find((p: any) => p.isGeneralProgram === true);
              if (explicitGen) {
                progName = explicitGen.name || explicitGen.title || '';
              }
            }
          }
        } catch (e) {
          console.warn('School by name query notice:', e);
        }
      }

      // Query programs collection to determine if program is multi-stage or standalone
      let matchedProgramDoc: any = null;
      const selectedIds: string[] = Array.isArray((studentRecord as any).selectedProgramIds)
        ? (studentRecord as any).selectedProgramIds
        : Array.isArray((studentRecord as any).assignedTrackIds)
        ? (studentRecord as any).assignedTrackIds
        : [];
      try {
        const progsSnap = await getDocs(collection(db, 'programs')).catch(() => ({ docs: [] } as any));
        progsSnap.docs.forEach((d: any) => {
          const p = d.data();
          const pTitle = String(p.title || p.name || '').trim().toLowerCase();
          const isIdMatch = selectedIds.includes(d.id) || (studentRecord as any).programId === d.id;
          const isMatch =
            isIdMatch ||
            assignedProgramsList.some(ap => ap === pTitle || ap.includes(pTitle) || pTitle.includes(ap)) ||
            (progName && (pTitle === progName.toLowerCase().trim() || pTitle.includes(progName.toLowerCase().trim()) || progName.toLowerCase().trim().includes(pTitle)));
          if (isMatch) {
            if (!matchedProgramDoc) matchedProgramDoc = p;
            if (!progName) progName = p.title || p.name || '';
            if (p.hasEdclub === true || p.hasEdClub === true || pTitle.includes('digital literacy') || pTitle.includes('typing')) {
              edclubAccess = true;
            }
          }
        });
      } catch (e) {
        console.warn('Programs lookup error:', e);
      }

      const isDigitalLitOrTyping = assignedProgramsList.some(ap => 
        ap.includes('digital literacy') || 
        ap.includes('digitalliteracy') || 
        ap.includes('typing') || 
        ap.includes('edclub') || 
        ap.includes('keyboard')
      ) || String(progName || '').toLowerCase().includes('digital literacy') || String(studentRecord.plan || '').toLowerCase().includes('digital literacy');

      if (!edclubAccess && isDigitalLitOrTyping) {
        edclubAccess = true;
      }

      const resolvedProgramTitle =
        progName ||
        studentRecord.plan ||
        (studentRecord as any).track ||
        'Pending Programme Confirmation';
      setEnrolledProgramName(resolvedProgramTitle);
      setIsEdclubAllowed(edclubAccess);
      setHasResourcesAllowed(resAccess);

      setStudent(studentRecord);

      // Determine Stages Configuration:
      const hasSeries = Boolean(
        matchedProgramDoc?.seriesName ||
        matchedProgramDoc?.hasStages ||
        (matchedProgramDoc?.stageNumber && Number(matchedProgramDoc.stageNumber) > 1)
      );

      setProgramDetails({
        hasStages: hasSeries,
        stageNumber: matchedProgramDoc?.stageNumber ? Number(matchedProgramDoc.stageNumber) : undefined,
        stageName: matchedProgramDoc?.stageName || undefined,
        seriesName: matchedProgramDoc?.seriesName || undefined,
        nextProgramTitle: matchedProgramDoc?.nextProgramTitle || undefined,
      });

      // Weekly curriculum topics from program definition (if set by admin/tutor)
      if (Array.isArray(matchedProgramDoc?.curriculum) && matchedProgramDoc.curriculum.length > 0) {
        setCurriculumTopics(matchedProgramDoc.curriculum);
      } else {
        setCurriculumTopics([]);
      }

      const assignedClass = (studentRecord.class || studentRecord.grade || cachedClass || '').trim();
      const currentStudentId = studentId;
      const currentUid = authUser?.uid;

      // 1. Fetch Dynamic Milestones from Firestore
      const milestoneList: DynamicMilestone[] = [];
      try {
        const milestoneQueries = [
          getDocs(query(collection(db, 'milestones'), where('targetType', '==', 'STUDENT'), where('targetId', '==', currentStudentId))),
          ...(currentUid ? [getDocs(query(collection(db, 'milestones'), where('studentUserId', '==', currentUid)))] : []),
          ...(studentRecord.schoolId ? [getDocs(query(collection(db, 'milestones'), where('targetType', '==', 'SCHOOL'), where('targetId', '==', studentRecord.schoolId)))] : [])
        ];
        const milestoneSnaps = await Promise.all(milestoneQueries.map(q => q.catch(() => ({ docs: [] } as any))));
        const seenMilestones = new Set<string>();
        milestoneSnaps.forEach(snap => {
          snap.docs?.forEach((d: any) => {
            if (!seenMilestones.has(d.id)) {
              seenMilestones.add(d.id);
              const data = d.data();
              milestoneList.push({
                id: d.id,
                title: data.title || 'Curriculum Milestone',
                description: data.description,
                status: data.status || 'NOT_STARTED',
                dueDate: data.dueDate?.toDate ? data.dueDate.toDate().toISOString() : data.dueDate,
                completedAt: data.completedAt?.toDate ? data.completedAt.toDate().toISOString() : data.completedAt,
                position: Number(data.position) || 0,
              });
            }
          });
        });
        milestoneList.sort((a, b) => (a.position || 0) - (b.position || 0));
      } catch (mErr) {
        console.warn('Milestones fetch warning:', mErr);
      }
      setDynamicMilestones(milestoneList);

      // 2. Fetch Real Assignments from Unified Academic Sync Engine + Firestore & Netlify Functions
      const assignmentList: DynamicAssignment[] = [];
      const seenAssignments = new Set<string>();
      try {
        const learnerProfileForSync: LinkedLearnerProfile = {
          id: currentStudentId || currentUid || 'student',
          studentUid: currentUid || '',
          allIds: Array.from(new Set([currentStudentId, currentUid].filter(Boolean) as string[])),
          fullName: studentRecord.fullName || studentRecord.name || 'Student',
          username: studentRecord.username,
          email: studentRecord.email,
          className: assignedClass || 'Grade 1',
          schoolId: studentRecord.schoolId || '',
          schoolAliases: [
            studentRecord.schoolId,
            studentRecord.schoolCode,
            studentRecord.schoolName,
            studentRecord.school,
          ]
            .map((v) => String(v || '').trim())
            .filter(Boolean),
          schoolName: studentRecord.schoolName || studentRecord.school || '',
          programName: resolvedProgramTitle,
          isSchoolStudent: Boolean(studentRecord.schoolId || studentRecord.schoolName),
          source: studentRecord.schoolId ? 'students' : 'individualStudents',
        };

        const syncedList = await fetchAssignmentsForLearner(learnerProfileForSync).catch(() => []);
        syncedList.forEach((a) => {
          if (!seenAssignments.has(a.id)) {
            seenAssignments.add(a.id);
            assignmentList.push({
              id: a.id,
              title: a.title,
              instructions: a.instructions,
              tutorName: a.tutorName,
              studentName: a.studentName,
              dueDate: a.dueDate || undefined,
              status: a.status === 'PENDING' || a.status === 'OVERDUE' ? 'PUBLISHED' : a.status,
              grade: a.grade ?? undefined,
              feedback: a.feedback || undefined,
              submissionText: a.submissionText || undefined,
              submissionUrl: a.submissionUrl || undefined,
              submittedAt: a.submittedAt || undefined,
              reviewedAt: a.reviewedAt || undefined,
              reviewStatus: a.reviewStatus || undefined,
              resourceUrl: a.resourceUrl || undefined,
              resourceTitle: a.resourceTitle || undefined,
            });
          }
        });

        const token = await authUser?.getIdToken();
        if (token) {
          const assRes = await fetch('/.netlify/functions/academic-assignments', {
            headers: { Authorization: `Bearer ${token}` }
          }).catch(() => null);
          if (assRes && assRes.ok) {
            const assData = await assRes.json().catch(() => ({}));
            if (Array.isArray(assData.assignments)) {
              assData.assignments.forEach((a: any) => {
                if (!seenAssignments.has(a.id)) {
                  seenAssignments.add(a.id);
                  assignmentList.push(a);
                }
              });
            }
          }
        }
      } catch (aErr) {
        console.warn('Assignments fetch warning:', aErr);
      }
      setStudentAssignments(assignmentList);

      // 3. Resources & Schedules
      let personalResourceResults: any[] = [];
      let personalLinkResults: any[] = [];
      let resourceSnapshot: any = { docs: [] };
      let examSnapshot: any = { docs: [] };

      try {
        const pResQueries = currentStudentId || currentUid
          ? [
              getDocs(query(collection(db, 'personalResources'), where('studentId', '==', currentStudentId))).catch(() => ({ docs: [] } as any)),
              ...(currentUid
                ? [getDocs(query(collection(db, 'personalResources'), where('userId', '==', currentUid))).catch(() => ({ docs: [] } as any))]
                : []),
            ]
          : [];

        const pLinkQueries = currentStudentId || currentUid
          ? [
              getDocs(query(collection(db, 'personalLinks'), where('studentId', '==', currentStudentId))).catch(() => ({ docs: [] } as any)),
              ...(currentUid
                ? [getDocs(query(collection(db, 'personalLinks'), where('userId', '==', currentUid))).catch(() => ({ docs: [] } as any))]
                : []),
              ...(studentRecord.schoolId
                ? [getDocs(query(collection(db, 'personalLinks'), where('schoolId', '==', studentRecord.schoolId))).catch(() => ({ docs: [] } as any))]
                : []),
            ]
          : [];

        const [pRes, pLink, rSnap, eSnap, jdiExamsSnap, schoolExamsSnap] = await Promise.all([
          Promise.all(pResQueries),
          Promise.all(pLinkQueries),
          getDocs(query(collection(db, 'resources'), limit(25))).catch(() => ({ docs: [] } as any)),
          getDocs(query(collection(db, 'exams'), limit(50))).catch(() => ({ docs: [] } as any)),
          getDocs(collection(db, 'jdiExams')).catch(() => ({ docs: [] } as any)),
          getDocs(collection(db, 'schoolExams')).catch(() => ({ docs: [] } as any)),
        ]);

        personalResourceResults = pRes;
        personalLinkResults = pLink;
        resourceSnapshot = rSnap;
        examSnapshot = {
          docs: [
            ...(jdiExamsSnap.docs || []),
            ...(schoolExamsSnap.docs || []),
            ...(eSnap.docs || []),
          ],
        };
      } catch (rErr) {
        console.warn('Resources & schedules fetch warning:', rErr);
      }

      const personalResourceMap = new Map<string, ResourceItem>();
      personalResourceResults.forEach((snap) => {
        snap?.docs?.forEach?.((item: any) => personalResourceMap.set(item.id, { id: item.id, ...item.data() } as ResourceItem)) ||
        snap?.forEach?.((item: any) => personalResourceMap.set(item.id, { id: item.id, ...item.data() } as ResourceItem));
      });
      setPersonalResources(Array.from(personalResourceMap.values()));

      const personalLinkMap = new Map<string, LinkItem>();
      personalLinkResults.forEach((snap) => {
        snap?.docs?.forEach?.((item: any) => personalLinkMap.set(item.id, { id: item.id, ...item.data() } as LinkItem)) ||
        snap?.forEach?.((item: any) => personalLinkMap.set(item.id, { id: item.id, ...item.data() } as LinkItem));
      });
      setPersonalLinks(Array.from(personalLinkMap.values()));

      const classList: ResourceItem[] = [];
      const generalList: ResourceItem[] = [];

      const isUniversalResource = (item: any) => {
        const itemClasses: string[] = Array.isArray(item.assignedClasses) 
          ? item.assignedClasses 
          : (item.targetClass ? [item.targetClass] : (item.class ? [item.class] : []));
        const cl = (item.classLevel || item.gradeLevel || '').toLowerCase().trim();
        const category = (item.category || '').toLowerCase().trim();

        if (category === 'both' || category === 'universal' || category === 'general' || category === 'all') return true;
        if (itemClasses.some(c => ['all classes', 'all', 'general', 'universal'].includes(c.toLowerCase().trim()))) return true;
        if (cl === 'all classes' || cl === 'all' || cl === 'general' || cl === 'universal' || (!cl && itemClasses.length === 0)) return true;
        return false;
      };

      const isItemForClass = (item: any) => {
        if (!assignedClass) return false;
        const target = assignedClass.toLowerCase().trim();
        const itemClasses: string[] = Array.isArray(item.assignedClasses) 
          ? item.assignedClasses 
          : (item.targetClass ? [item.targetClass] : (item.class ? [item.class] : []));
        
        if (itemClasses.length > 0) {
          return itemClasses.some(c => {
            const lc = c.toLowerCase().trim();
            return lc === target || lc.includes(target) || target.includes(lc);
          });
        }

        const cl = (item.classLevel || item.gradeLevel || '').toLowerCase().trim();
        if (cl && cl !== 'all classes' && cl !== 'all' && cl !== 'general') {
          return cl === target || cl.includes(target) || target.includes(cl);
        }

        return false;
      };

      (resourceSnapshot.docs || []).forEach((resourceDoc: any) => {
        const item = { id: resourceDoc.id, ...resourceDoc.data() } as ResourceItem;
        if (isItemForClass(item)) {
          classList.push({ ...item, isClassSpecific: true });
        } else if (isUniversalResource(item)) {
          generalList.push({ ...item, isClassSpecific: false });
        }
      });

      const activeSchoolId = studentRecord.schoolId || sessionStorage.getItem('schoolId') || studentRecord.school;
      try {
        const schoolResourceSnap = await getDocs(
          activeSchoolId
            ? query(collection(db, 'schoolResources'), where('schoolId', '==', activeSchoolId), limit(50))
            : query(collection(db, 'schoolResources'), limit(50))
        ).catch(() => ({ docs: [] } as any));

        schoolResourceSnap.docs?.forEach((resourceDoc: any) => {
          const item = { id: resourceDoc.id, ...resourceDoc.data() } as ResourceItem;
          if (!activeSchoolId || !item.schoolId || item.schoolId === activeSchoolId || item.schoolName === studentRecord?.schoolName || item.school === studentRecord?.school) {
            const isMatch = isItemForClass(item);
            const isUniv = isUniversalResource(item);
            if (isMatch) {
              if (!classList.some((resource) => resource.id === item.id)) {
                classList.push({ ...item, isClassSpecific: true });
              }
            } else if (isUniv) {
              if (!generalList.some((resource) => resource.id === item.id)) {
                generalList.push({ ...item, isClassSpecific: false });
              }
            }
          }
        });
      } catch (error) {
        console.warn('School resource lookup failed:', error);
      }

      setClassResources(classList);
      setGeneralResources(generalList);

      const examMap = new Map<string, ExamItem>();
      const rawExamLookup = new Map<string, any>();
      const studentSchoolAliases = [
        activeSchoolId,
        studentRecord.schoolId,
        studentRecord.schoolCode,
        studentRecord.schoolName,
        studentRecord.school,
        sessionStorage.getItem('schoolId'),
        sessionStorage.getItem('schoolName'),
      ]
        .map((v) => String(v || '').trim())
        .filter(Boolean);

      (examSnapshot.docs || []).forEach((examDoc: any) => {
        const raw = examDoc.data() || {};
        rawExamLookup.set(examDoc.id, { id: examDoc.id, ...raw });
        if (
          isStudentEligibleForWork(
            {
              id: currentStudentId,
              uid: currentUid,
              schoolId: activeSchoolId || '',
              schoolAliases: studentSchoolAliases,
              schoolName: studentRecord?.schoolName || '',
              class: assignedClass,
            },
            raw
          )
        ) {
          examMap.set(examDoc.id, {
            id: examDoc.id,
            ...raw,
            workType: normalizeWorkType(raw.workType, raw),
          } as ExamItem);
        }
      });
      setExams(Array.from(examMap.values()));

      // Load released exam/test attempts for analytics grade trends
      try {
        const allDbs = getAllClientDatabases();
        const attemptSnaps = await Promise.all(
          allDbs.map((inst) =>
            getDocs(collection(inst, 'jdiExamAttempts')).catch(() => ({ docs: [] } as any))
          )
        );
        const gradesMap = new Map<string, StudentGradeRecord>();
        attemptSnaps.forEach((snap: any) => {
          snap?.docs?.forEach?.((ad: any) => {
            const a = ad.data() || {};
            const matchesStudent =
              (currentUid && (a.studentUid === currentUid || a.studentId === currentUid)) ||
              (currentStudentId && a.studentId === currentStudentId);
            if (!matchesStudent) return;
            const parentExam = rawExamLookup.get(String(a.examId || '')) || {};
            if (!isAttemptResultReleased(a, parentExam)) return;
            const maxScore = computeExamMaxScore(parentExam, a);
            const rawScore = typeof a.score === 'number' ? a.score : Number(a.score || 0);
            const percentage =
              typeof a.percentage === 'number' && Number.isFinite(a.percentage)
                ? Math.round(a.percentage)
                : calculateScorePercentage(rawScore, maxScore);
            const dateVal =
              typeof a.releasedAt?.toDate === 'function'
                ? a.releasedAt.toDate().toISOString()
                : typeof a.submittedAt?.toDate === 'function'
                ? a.submittedAt.toDate().toISOString()
                : String(a.releasedAt || a.submittedAt || a.updatedAt || '');
            gradesMap.set(ad.id, {
              id: ad.id,
              date: dateVal,
              assessment: String(parentExam.title || a.examTitle || 'Assessment'),
              subject: String(parentExam.subject || a.subject || resolvedProgramTitle || 'General'),
              grade: percentage,
              score: rawScore,
              maxScore,
              tier: calculateGradeLetter(percentage),
              workType: normalizeWorkType(parentExam.workType || a.workType, parentExam),
            });
          });
        });
        setReleasedGrades(Array.from(gradesMap.values()));
      } catch (gErr) {
        console.warn('Student released grades lookup notice:', gErr);
        setReleasedGrades([]);
      }

      // Student verified modules (for certificates)
      try {
        const moduleQueries = [
          getDocs(query(collection(db, 'studentModules'), where('studentId', '==', currentStudentId))).catch(() => ({ docs: [] } as any)),
          ...(currentUid
            ? [getDocs(query(collection(db, 'studentModules'), where('studentId', '==', currentUid))).catch(() => ({ docs: [] } as any))]
            : []),
        ];
        const moduleMap = new Map<string, ProgramModule>();
        const moduleSnapshots = await Promise.all(moduleQueries);
        moduleSnapshots.forEach((snap: any) => {
          snap?.docs?.forEach?.((moduleDoc: any) => {
            const data = moduleDoc.data();
            if (
              data.studentId === currentStudentId ||
              data.studentId === currentUid ||
              data.studentUsername === studentUsername
            ) {
              moduleMap.set(moduleDoc.id, {
                id: moduleDoc.id,
                title: data.title || 'Module',
                stageName: data.stageName || `Stage ${Number(data.stageNumber) || 1}`,
                stageNumber: Number(data.stageNumber) || 1,
                trackName: data.trackName || 'Learning Track',
                completed: Boolean(data.completed),
                completionDate: data.completionDate || '',
                score: data.score || '',
                competencies: Array.isArray(data.competencies) ? data.competencies : [],
                instructor: data.instructor || '',
              });
            }
          });
        });
        setModules(Array.from(moduleMap.values()).sort((a, b) => a.stageNumber - b.stageNumber));
      } catch (error) {
        console.warn('Student module lookup failed:', error);
        setModules([]);
      }

      // Class schedules (combining Netlify API + Firestore classSchedules with full school, cohort, and program interlinking)
      try {
        const schId = (studentRecord?.schoolId || '').trim();
        const schName = (studentRecord?.schoolName || studentRecord?.school || '').trim().toLowerCase();
        const studentClass = (studentRecord?.class || studentRecord?.grade || cachedClass || '').trim().toLowerCase();
        const sName = (studentRecord?.fullName || studentRecord?.name || '').trim().toLowerCase();
        const sEmail = (studentRecord?.email || '').trim().toLowerCase();
        const pEmail = (studentRecord?.parentEmail || '').trim().toLowerCase();
        const pId = studentRecord?.parentId;
        const currentProg = resolvedProgramTitle.toLowerCase().trim();

        const [schSnap, netlifySchedules] = await Promise.all([
          getDocs(collection(db, 'classSchedules')).catch(() => ({ docs: [] } as any)),
          authUser?.getIdToken().then((token: string | null | undefined) => 
            token ? fetch(`/.netlify/functions/class-schedules?schoolId=${encodeURIComponent(schId)}&studentId=${encodeURIComponent(currentStudentId)}`, {
              headers: { Authorization: `Bearer ${token}` }
            }).then(r => r.ok ? r.json() : { schedules: [] }).catch(() => ({ schedules: [] })) : { schedules: [] }
          ).catch(() => ({ schedules: [] }))
        ]);

        const combinedRaw = [
          ...(Array.isArray(netlifySchedules?.schedules) ? netlifySchedules.schedules : []),
          ...schSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }))
        ];

        const enrollmentCtx = await resolveFullStudentEnrollmentContext(lookupUid || currentStudentId);
        if (currentStudentId) enrollmentCtx.ids.add(currentStudentId);
        if (sEmail) enrollmentCtx.emails.add(sEmail);
        if (sName) enrollmentCtx.names.add(sName);
        if (schId && !enrollmentCtx.schoolId) {
          enrollmentCtx.schoolId = schId;
          enrollmentCtx.isSchoolStudent = true;
        }
        if (schName && !enrollmentCtx.schoolName) {
          enrollmentCtx.schoolName = schName;
          enrollmentCtx.isSchoolStudent = true;
        }
        if (currentProg) enrollmentCtx.programNames.add(currentProg);
        if (pId) enrollmentCtx.parentIds.add(String(pId));
        if (pEmail) enrollmentCtx.parentEmails.add(pEmail);

        const seenScheduleIds = new Set<string>();
        const filtered = combinedRaw.filter((r: any) => {
          if (!r || !r.id || seenScheduleIds.has(r.id)) return false;
          seenScheduleIds.add(r.id);
          return doesScheduleMatchStudent(r, enrollmentCtx);
        });

        setStudentSchedules(filtered);
      } catch (err) {
        console.warn('Student class schedules fetch error:', err);
      }

    } catch (error) {
      console.error('Error loading student dashboard:', error);
      toast.error('Some student dashboard data could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudentData();
  }, []);

  // Real Dynamic Milestone Calculations
  const completedMilestonesCount = useMemo(() => {
    return dynamicMilestones.filter(m => m.status === 'COMPLETED').length;
  }, [dynamicMilestones]);

  const curriculumScorePercentage = useMemo(() => {
    if (dynamicMilestones.length === 0) return 0;
    return Math.round((completedMilestonesCount / dynamicMilestones.length) * 100);
  }, [dynamicMilestones.length, completedMilestonesCount]);

  // Real Dynamic Assignment Statistics
  const assignmentStats = useMemo(() => {
    let completed = 0;
    let inProgress = 0;
    let pending = 0;

    studentAssignments.forEach((a) => {
      const s = String(a.status || a.reviewStatus || '').toUpperCase();
      if (s === 'COMPLETED' || s === 'REVIEWED' || s === 'GRADED') {
        completed++;
      } else if (['SUBMITTED', 'IN_PROGRESS', 'AWAITING_REVIEW', 'RESUBMISSION_REQUIRED'].includes(s)) {
        inProgress++;
      } else {
        pending++;
      }
    });

    const total = studentAssignments.length;
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const chartData = [
      { name: 'Completed', value: completed, color: '#1E293B' },
      { name: 'In Progress', value: inProgress, color: '#B91C1C' },
      { name: 'Pending', value: pending, color: '#94A3B8' },
    ].filter(item => item.value > 0);

    return { completed, inProgress, pending, total, rate, chartData };
  }, [studentAssignments]);

  const analyticsLearningTracks = useMemo<LearningProgressItem[]>(() => {
    if (modules.length > 0) {
      const trackMap = new Map<string, { total: number; done: number }>();
      modules.forEach((m) => {
        const name = m.trackName || enrolledProgramName || 'Learning Track';
        const cur = trackMap.get(name) || { total: 0, done: 0 };
        cur.total += 1;
        if (m.completed) cur.done += 1;
        trackMap.set(name, cur);
      });
      return Array.from(trackMap.entries()).map(([subject, counts]) => ({
        subject,
        modulesDone: counts.done,
        modulesTotal: counts.total,
        progress: counts.total > 0 ? Math.round((counts.done / counts.total) * 100) : 0,
      }));
    }
    if (dynamicMilestones.length > 0 && enrolledProgramName) {
      return [
        {
          subject: enrolledProgramName,
          modulesDone: completedMilestonesCount,
          modulesTotal: dynamicMilestones.length,
          progress: curriculumScorePercentage,
        },
      ];
    }
    return [];
  }, [modules, dynamicMilestones, enrolledProgramName, completedMilestonesCount, curriculumScorePercentage]);

  const enrolledSubjectNames = useMemo(() => {
    const set = new Set<string>();
    (student?.subjects || []).forEach((s) => s && set.add(s));
    if (enrolledProgramName && enrolledProgramName !== 'Pending Programme Confirmation') {
      set.add(enrolledProgramName);
    }
    releasedGrades.forEach((g) => g.subject && set.add(g.subject));
    return Array.from(set);
  }, [student?.subjects, enrolledProgramName, releasedGrades]);

  // Real-time comparison for Live vs Upcoming classes
  const scheduleAnalysis = useMemo(() => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    let liveSession: any = null;
    const upcoming: any[] = [];

    studentSchedules.forEach((s) => {
      const date = s.date || '';
      const startTime = s.startTime || '';
      const endTime = s.endTime || '';
      const explicitStatus = String(s.status || '').toUpperCase();

      if (['COMPLETED', 'ATTENDED', 'CANCELLED', 'ABSENT'].includes(explicitStatus)) {
        return;
      }

      let formattedDate = date;
      if (date) {
        try {
          const d = new Date(date + 'T00:00:00');
          const day = d.getDate();
          const suffix = (day >= 11 && day <= 13) ? 'th' : ['th', 'st', 'nd', 'rd', 'th', 'th', 'th', 'th', 'th', 'th'][day % 10];
          const dayName = d.toLocaleDateString('en-NG', { weekday: 'long' });
          formattedDate = `${dayName}, ${day}${suffix} ${d.toLocaleDateString('en-NG', { month: 'long' })} ${d.getFullYear()}`;
        } catch {
          formattedDate = date;
        }
      }

      if (date < todayStr) {
        return;
      }

      if (date === todayStr) {
        if (startTime && endTime) {
          if (currentTimeStr >= startTime && currentTimeStr <= endTime) {
            liveSession = { ...s, formattedDate, isLive: true };
            return;
          }
          if (currentTimeStr > endTime) {
            return;
          }
        } else if (explicitStatus === 'ONGOING') {
          liveSession = { ...s, formattedDate, isLive: true };
          return;
        }
      }

      upcoming.push({ ...s, formattedDate, isLive: false });
    });

    upcoming.sort((a, b) => {
      const cmpDate = (a.date || '').localeCompare(b.date || '');
      if (cmpDate !== 0) return cmpDate;
      return (a.startTime || '').localeCompare(b.startTime || '');
    });

    return { liveSession, upcoming: upcoming.slice(0, 3) };
  }, [studentSchedules]);

  // Submit Google Link for an assignment
  const handleOpenSubmitModal = (assignment: DynamicAssignment) => {
    setSubmittingAssignment(assignment);
    setSubmissionGoogleUrl(assignment.submissionUrl || '');
    setSubmissionNotes(assignment.submissionText || '');
  };

  const handleSubmitGoogleAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submittingAssignment) return;
    const url = submissionGoogleUrl.trim();
    if (!url) {
      toast.error('Please enter your Google Drive / Docs / Project link.');
      return;
    }

    setIsSubmittingLink(true);
    try {
      const user = auth.currentUser;
      const token = await user?.getIdToken();
      let submittedSuccessfully = false;

      if (token) {
        const res = await fetch('/.netlify/functions/academic-assignments', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            action: 'submit',
            assignmentId: submittingAssignment.id,
            submissionUrl: url,
            submissionText: submissionNotes.trim()
          })
        }).catch(() => null);

        if (res && res.ok) {
          submittedSuccessfully = true;
        }
      }

      // Firestore direct update fallback
      if (!submittedSuccessfully) {
        const docRef = doc(db, 'assignments', submittingAssignment.id);
        await updateDoc(docRef, {
          submissionUrl: url,
          submissionText: submissionNotes.trim(),
          submittedAt: new Date().toISOString(),
          status: 'SUBMITTED',
          reviewStatus: 'AWAITING_REVIEW',
          updatedAt: new Date().toISOString()
        });
        submittedSuccessfully = true;
      }

      toast.success('Assignment submitted with your Google link! Your tutor has been notified for review.');
      setSubmittingAssignment(null);
      setSubmissionGoogleUrl('');
      setSubmissionNotes('');
      await fetchStudentData();
    } catch (err: any) {
      console.error('Assignment submission error:', err);
      toast.error(err?.message || 'Failed to submit assignment link. Please try again.');
    } finally {
      setIsSubmittingLink(false);
    }
  };

  const schoolDisplayName = student?.schoolName || student?.school || sessionStorage.getItem('studentSchoolName');

  if (loading) {
    return (
      <div className="min-h-[360px] flex items-center justify-center p-8">
        <div className="text-center">
          <div
            className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-gray-200 border-t-brand-red dark:border-slate-800 dark:border-t-brand-red"
            aria-hidden="true"
          />
          <p className="mt-4 text-sm font-medium text-gray-600 dark:text-slate-300">
            Loading your learning workspace…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-interface space-y-6 md:space-y-8 bg-transparent text-slate-900 dark:text-slate-100">
      <SEO
        title="Student Workspace Dashboard"
        description="A focused overview of your learning progress, programme assignment and class analytics."
        noindex={true}
      />

      {!student ? (
        <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 p-8 text-center shadow-xs">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-red/10 text-brand-red">
            <Lock size={26} aria-hidden="true" />
          </div>
          <h1 className="mt-4 text-xl font-black text-slate-900 dark:text-white">Student profile not available</h1>
          <p className="mx-auto mt-2 max-w-lg text-sm text-slate-500 dark:text-slate-400">
            Your portal session is active, but a student record could not be located. Please sign in again or contact an administrator.
          </p>
          <Link to="/portal" className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-red px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700">
            Return to Portal <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </section>
      ) : (
        <>
          {/* Concise Institutional Workspace Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <h1 className="text-lg sm:text-xl font-bold text-[#1E293B] dark:text-white tracking-tight">
                {student.fullName || student.name || 'Student'}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {enrolledProgramName || student.plan || 'Enrolled Track'}
                {(student.class || student.grade) ? ` · ${student.class || student.grade}` : ''}
                {schoolDisplayName ? ` · ${schoolDisplayName}` : ' · Private Learner'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Link
                to="/portal/student/assessments"
                className="min-h-9 px-3.5 py-2 rounded-lg bg-[#B91C1C] hover:bg-red-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <span>Assessments</span>
                <ArrowRight size={13} aria-hidden="true" />
              </Link>
              <Link
                to="/portal/student/assignments"
                className="min-h-9 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-[#1E293B] dark:text-slate-200 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
              >
                <span>Assignments</span>
              </Link>
            </div>
          </div>

          {/* Active Live Class Banner */}
          {scheduleAnalysis.liveSession && (
            <div className="rounded-xl bg-[#1E293B] border border-[#B91C1C]/60 p-5 text-white">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-1 text-xs">
                    <span className="inline-flex items-center gap-1.5 font-bold uppercase tracking-wider text-red-300">
                      <Radio size={13} aria-hidden="true" /> Live Class in Session
                    </span>
                    <span className="text-slate-400" aria-hidden="true">·</span>
                    <span className="text-slate-200 font-medium">
                      {scheduleAnalysis.liveSession.formattedDate || 'Today'}
                    </span>
                  </div>
                  <h2 className="text-base sm:text-lg font-bold text-white">
                    {scheduleAnalysis.liveSession.title || scheduleAnalysis.liveSession.programName || 'Live Classroom Session'}
                  </h2>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-300">
                    {scheduleAnalysis.liveSession.startTime && (
                      <span className="font-mono tabular-nums inline-flex items-center gap-1">
                        <Clock size={12} aria-hidden="true" />
                        {scheduleAnalysis.liveSession.startTime} – {scheduleAnalysis.liveSession.endTime}
                      </span>
                    )}
                    {scheduleAnalysis.liveSession.tutorName && (
                      <span className="inline-flex items-center gap-1">
                        <UserCheck size={13} className="text-red-300" aria-hidden="true" />
                        Instructor: {scheduleAnalysis.liveSession.tutorName}
                      </span>
                    )}
                  </div>
                </div>

                {scheduleAnalysis.liveSession.meetingLink && (
                  <a
                    href={scheduleAnalysis.liveSession.meetingLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#B91C1C] px-5 py-2 text-xs font-bold text-white hover:bg-red-800 transition-colors shrink-0"
                  >
                    Join Live Room <ExternalLink size={14} aria-hidden="true" />
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Programme & Deliverables Overview */}
          <section className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 sm:p-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-7 space-y-5">
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-[#1E293B] dark:text-white tracking-tight">
                    {enrolledProgramName || student.plan || 'Digital Literacy'}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {student.class || student.grade ? `Class Cohort: ${student.class || student.grade}` : 'Standard Curriculum Track'}
                    {(student.schoolName || schoolDisplayName) ? ` · ${student.schoolName || schoolDisplayName}` : ''}
                  </p>
                </div>

                {/* Divided Metrics Strip */}
                <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40">
                  <div className="p-4">
                    <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      Curriculum Progress
                    </p>
                    <p className="text-xl font-bold text-[#1E293B] dark:text-white mt-1 tabular-nums">
                      {dynamicMilestones.length > 0 ? `${curriculumScorePercentage}%` : '—'}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                      {dynamicMilestones.length > 0
                        ? `${completedMilestonesCount} of ${dynamicMilestones.length} milestones`
                        : 'No milestones set yet'}
                    </p>
                  </div>
                  <div className="p-4">
                    <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      Assigned Tasks
                    </p>
                    <p className="text-xl font-bold text-[#1E293B] dark:text-white mt-1 tabular-nums">
                      {assignmentStats.total}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                      {assignmentStats.completed} verified complete
                    </p>
                  </div>
                  <div className="p-4">
                    <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      Current Stage
                    </p>
                    <p className="text-base font-bold text-[#1E293B] dark:text-white mt-1 truncate">
                      {programDetails.hasStages
                        ? (programDetails.stageName || `Stage ${programDetails.stageNumber || 1}`)
                        : (student.class || student.grade || 'Standard Track')}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      {programDetails.hasStages
                        ? (programDetails.nextProgramTitle ? `Next: ${programDetails.nextProgramTitle}` : 'Series Track')
                        : 'Enrolled Course'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Deliverables Donut Overview */}
              <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 p-4 sm:p-5 flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#1E293B] dark:text-white">
                    Deliverables Summary
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Assignment completion across current tasks
                  </p>
                </div>

                <div className="h-44 w-full relative flex items-center justify-center my-2">
                  {assignmentStats.total === 0 ? (
                    <div className="text-center p-4">
                      <ClipboardList size={26} className="mx-auto text-slate-400 mb-1.5" aria-hidden="true" />
                      <p className="text-xs font-bold text-[#1E293B] dark:text-white">No active assignments</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Tasks assigned by your tutor will appear here.
                      </p>
                    </div>
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={assignmentStats.chartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={48}
                            outerRadius={68}
                            paddingAngle={3}
                            dataKey="value"
                          >
                            {assignmentStats.chartData.map((entry, index) => (
                              <Cell key={`donut-${index}`} fill={entry.color} stroke="transparent" />
                            ))}
                          </Pie>
                          <RechartsTooltip
                            content={({ active, payload }: any) => {
                              if (active && payload && payload.length) {
                                const d = payload[0];
                                return (
                                  <div className="bg-[#1E293B] text-white border border-slate-700 rounded-lg p-2.5 text-xs shadow-lg">
                                    <p className="font-semibold flex items-center gap-1.5">
                                      <span className="w-2 h-2 rounded-xs inline-block" style={{ backgroundColor: d.payload.color }} />
                                      {d.name}: <span className="font-mono font-bold tabular-nums">{d.value}</span>
                                    </p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-2xl font-bold text-[#1E293B] dark:text-white tabular-nums leading-none">
                          {assignmentStats.rate}%
                        </span>
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mt-1">
                          Completed
                        </span>
                      </div>
                    </>
                  )}
                </div>

                <div className="grid grid-cols-3 divide-x divide-slate-200 dark:divide-slate-800 border-t border-slate-200 dark:border-slate-800 pt-2.5 text-center">
                  <div>
                    <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Done</p>
                    <p className="text-xs font-bold text-[#1E293B] dark:text-white font-mono tabular-nums">
                      {assignmentStats.completed}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-[#B91C1C]">In Progress</p>
                    <p className="text-xs font-bold text-[#1E293B] dark:text-white font-mono tabular-nums">
                      {assignmentStats.inProgress}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Pending</p>
                    <p className="text-xs font-bold text-[#1E293B] dark:text-white font-mono tabular-nums">
                      {assignmentStats.pending}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Dynamic Curriculum Progression Path */}
            {curriculumTopics.length > 0 && (
              <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    Syllabus Topics ({curriculumTopics.length} Weekly Topics)
                  </span>
                  <Link
                    to="/portal/student/assignments"
                    className="text-xs font-semibold text-[#B91C1C] hover:underline inline-flex items-center gap-1"
                  >
                    View Topics <ArrowRight size={11} aria-hidden="true" />
                  </Link>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                  {curriculumTopics.map((topic, idx) => (
                    <span key={`topic-${idx}`} className="inline-flex items-center gap-1.5">
                      <span className="font-mono font-bold text-[#B91C1C] tabular-nums">
                        {String(idx + 1).padStart(2, '0')}.
                      </span>
                      <span>{topic}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Academic Analytics Visualizer (Real Data) */}
          <StudentAnalyticsVisualizer
            studentName={student.fullName || student.name || 'Student'}
            studentClass={student.class || student.grade || 'Standard Track'}
            enrolledSubjects={enrolledSubjectNames}
            completedModulesCount={modules.filter((m) => m.completed).length}
            totalModulesCount={modules.length}
            learningTracks={analyticsLearningTracks}
            assignments={studentAssignments}
            gradeRecords={releasedGrades}
            milestones={dynamicMilestones}
          />

          {/* Assigned Assessments & Work */}
          <section className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-5 sm:px-6 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-[#1E293B] dark:text-white tracking-tight flex items-center gap-2">
                  <FileText size={17} className="text-[#B91C1C]" aria-hidden="true" />
                  <span>Assigned Assessments &amp; Work ({exams.length})</span>
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Class tests, formal assessments, and activities assigned to your class or account.
                </p>
              </div>
              <Link
                to="/portal/student/assessments"
                className="text-xs font-semibold text-[#B91C1C] inline-flex items-center gap-1 hover:underline shrink-0"
              >
                Open Assessments &amp; Work <ArrowRight size={13} aria-hidden="true" />
              </Link>
            </div>

            {exams.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-xs font-bold text-[#1E293B] dark:text-white">No active assessments right now</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Any test, quiz, activity, or assessment assigned to your class will appear here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {exams.slice(0, 6).map((ex) => (
                  <div
                    key={ex.id}
                    className="px-5 py-3.5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-[#1E293B] dark:text-white truncate">
                        {ex.title}
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-semibold text-[#B91C1C] uppercase">
                          {ex.workType || 'EXAMINATION'}
                        </span>
                        <span className="mx-1.5" aria-hidden="true">·</span>
                        <span>{ex.subject || 'Technology'}</span>
                        {ex.targetClass && (
                          <>
                            <span className="mx-1.5" aria-hidden="true">·</span>
                            <span>{ex.targetClass}</span>
                          </>
                        )}
                        {ex.durationMinutes ? (
                          <>
                            <span className="mx-1.5" aria-hidden="true">·</span>
                            <span className="tabular-nums">{ex.durationMinutes} mins</span>
                          </>
                        ) : null}
                      </p>
                    </div>
                    <Link
                      to="/portal/student/assessments"
                      className="min-h-8 px-3.5 py-1.5 rounded-lg bg-[#B91C1C] hover:bg-red-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors self-start sm:self-auto shrink-0"
                    >
                      <span>
                        Open {ex.workType ? ex.workType.charAt(0).toUpperCase() + ex.workType.slice(1).toLowerCase() : 'Assessment'}
                      </span>
                      <ArrowRight size={12} aria-hidden="true" />
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Active Assignments & Google Link Submission */}
          <section className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-5 sm:px-6 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-[#1E293B] dark:text-white tracking-tight flex items-center gap-2">
                  <ClipboardList size={17} className="text-[#B91C1C]" aria-hidden="true" />
                  <span>Active Assignments &amp; Tasks ({studentAssignments.length})</span>
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Submit completed homework, practical drills, or Google Drive project links for tutor review.
                </p>
              </div>
              <Link
                to="/portal/student/assignments"
                className="text-xs font-semibold text-[#B91C1C] inline-flex items-center gap-1 hover:underline shrink-0"
              >
                All Assignments <ArrowRight size={13} aria-hidden="true" />
              </Link>
            </div>

            {studentAssignments.length === 0 ? (
              <div className="p-8 text-center">
                <ClipboardList size={26} className="mx-auto text-slate-400 mb-1.5" aria-hidden="true" />
                <p className="text-xs font-bold text-[#1E293B] dark:text-white">No assignments currently assigned</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Tasks and projects assigned by your instructor will appear here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {studentAssignments.map((a) => {
                  const statusUpper = String(a.status || a.reviewStatus || '').toUpperCase();
                  const isSubmitted = ['SUBMITTED', 'AWAITING_REVIEW'].includes(statusUpper);
                  const isCompleted = ['COMPLETED', 'REVIEWED', 'GRADED'].includes(statusUpper);
                  const isResubmit = statusUpper === 'RESUBMISSION_REQUIRED';

                  return (
                    <div
                      key={a.id}
                      className="px-5 py-4 sm:px-6 flex flex-col lg:flex-row lg:items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <div className="min-w-0 space-y-1 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-bold text-[#1E293B] dark:text-white truncate">
                            {a.title}
                          </h3>
                          <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-semibold ${
                              isCompleted
                                ? 'text-[#1E293B] dark:text-slate-200'
                                : isResubmit
                                ? 'text-[#B91C1C]'
                                : 'text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {isCompleted ? (
                              <CheckCircle2 size={12} aria-hidden="true" />
                            ) : isSubmitted ? (
                              <Clock size={12} aria-hidden="true" />
                            ) : (
                              <AlertCircle size={12} className="text-[#B91C1C]" aria-hidden="true" />
                            )}
                            {isCompleted
                              ? 'Completed'
                              : isSubmitted
                              ? 'Under Review'
                              : isResubmit
                              ? 'Resubmission Requested'
                              : 'Active Task'}
                          </span>
                          {a.dueDate && (
                            <>
                              <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
                              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                                Due {formatDate(a.dueDate)}
                              </span>
                            </>
                          )}
                        </div>

                        {a.instructions && (
                          <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                            {a.instructions}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                          {a.tutorName && (
                            <span className="inline-flex items-center gap-1">
                              <UserCheck size={12} className="text-[#B91C1C]" aria-hidden="true" />
                              Assigned by <strong className="text-[#1E293B] dark:text-slate-200">{a.tutorName}</strong>
                            </span>
                          )}
                          {a.submissionUrl && (
                            <a
                              href={a.submissionUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[#1E293B] dark:text-slate-200 font-semibold hover:text-[#B91C1C] hover:underline truncate max-w-xs"
                            >
                              <LinkIcon size={12} aria-hidden="true" />
                              <span className="truncate">{a.submissionUrl}</span>
                            </a>
                          )}
                        </div>

                        {a.feedback && (
                          <p className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2 mt-1.5">
                            <strong>Tutor Feedback:</strong> {a.feedback}
                            {a.grade !== undefined && <span className="font-mono tabular-nums"> ({a.grade}/100)</span>}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        {a.resourceUrl && (
                          <a
                            href={a.resourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="min-h-8 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1"
                          >
                            <FileText size={12} aria-hidden="true" />
                            <span>{a.resourceTitle || 'Resource'}</span>
                          </a>
                        )}

                        {isCompleted ? (
                          <span className="text-xs font-semibold text-[#1E293B] dark:text-slate-200 inline-flex items-center gap-1">
                            <CheckCircle2 size={13} aria-hidden="true" /> Verified
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenSubmitModal(a)}
                            className="min-h-8 px-3.5 py-1.5 rounded-lg bg-[#B91C1C] hover:bg-red-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Upload size={12} aria-hidden="true" />
                            <span>{isSubmitted ? 'Update Link' : 'Submit Google Link'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Typing Masters Academy Workspace */}
          {isEdclubAllowed && (
            <TypingMastersAcademyCard
              studentName={student.fullName || student.name || 'Student'}
              studentClass={student.class || student.grade}
              schoolId={student.schoolId}
              isAllowed={true}
              enrolledProgramName={enrolledProgramName || student.plan || 'Digital Literacy Junior'}
            />
          )}

          {/* Upcoming Class Schedule */}
          <section className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-5 sm:px-6 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-[#1E293B] dark:text-white tracking-tight flex items-center gap-2">
                  <Calendar size={17} className="text-[#B91C1C]" aria-hidden="true" />
                  <span>Upcoming Class Schedule</span>
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Upcoming virtual classrooms, timetable sessions, and tutor schedules.
                </p>
              </div>
              <div className="flex items-center gap-4 shrink-0">
                <Link
                  to="/portal/student/calendar"
                  className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-[#B91C1C] inline-flex items-center gap-1 transition-colors"
                >
                  <Calendar size={12} aria-hidden="true" /> Timetable
                </Link>
                <Link
                  to="/portal/student/live-classrooms"
                  className="text-xs font-semibold text-[#B91C1C] inline-flex items-center gap-1 hover:underline"
                >
                  All Live Classes <ArrowRight size={13} aria-hidden="true" />
                </Link>
              </div>
            </div>

            {scheduleAnalysis.upcoming.length > 0 ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {scheduleAnalysis.upcoming.map((occ: any) => (
                  <div
                    key={occ.id}
                    className="px-5 py-3.5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-[#1E293B] dark:text-white truncate">
                        {occ.title || occ.programName || 'Class Session'}
                      </h3>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-semibold text-[#B91C1C]">
                          {occ.formattedDate || occ.date}
                        </span>
                        {occ.startTime && (
                          <>
                            <span className="mx-1.5" aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              {occ.startTime} – {occ.endTime}
                            </span>
                          </>
                        )}
                        <span className="mx-1.5" aria-hidden="true">·</span>
                        <span>{occ.classLevel || 'Assigned Cohort'}</span>
                        {occ.tutorName && (
                          <>
                            <span className="mx-1.5" aria-hidden="true">·</span>
                            <span>Faculty: {occ.tutorName}</span>
                          </>
                        )}
                      </p>
                    </div>
                    <div className="shrink-0">
                      {occ.meetingLink ? (
                        <a
                          href={occ.meetingLink}
                          target="_blank"
                          rel="noreferrer"
                          className="min-h-8 px-3.5 py-1.5 rounded-lg bg-[#1E293B] hover:bg-[#B91C1C] text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
                        >
                          Join Room <ExternalLink size={12} aria-hidden="true" />
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">Link available at start</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center">
                <Calendar size={26} className="mx-auto text-slate-400" aria-hidden="true" />
                <p className="mt-2 text-xs font-bold text-[#1E293B] dark:text-white">No upcoming class sessions scheduled</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Upcoming timetable sessions will appear here once published by your instructor.
                </p>
                <Link
                  to="/portal/student/calendar"
                  className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#B91C1C] hover:underline"
                >
                  View Full Schedule <ArrowRight size={12} aria-hidden="true" />
                </Link>
              </div>
            )}
          </section>

          {/* Curriculum Milestones & Recent Activity Feeds */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-[#1E293B] dark:text-white tracking-tight">
                    Curriculum Milestones
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Target milestones calibrated by your instructor.
                  </p>
                </div>
                <Link
                  to="/portal/student/milestones"
                  className="text-xs font-semibold text-[#B91C1C] inline-flex items-center gap-1 hover:underline shrink-0"
                >
                  All Milestones <ArrowRight size={13} aria-hidden="true" />
                </Link>
              </div>

              {dynamicMilestones.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-xs font-bold text-[#1E293B] dark:text-white">No milestones published yet</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Your tutor will publish term milestones dynamically for your programme.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto custom-scrollbar">
                  {dynamicMilestones.map((m, idx) => (
                    <div key={m.id} className="px-5 py-3.5 flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <span className="mt-0.5 text-xs font-mono font-bold text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                          {m.status === 'COMPLETED' ? (
                            <CheckCircle2 size={15} className="text-[#1E293B] dark:text-slate-200" aria-hidden="true" />
                          ) : (
                            `${String(idx + 1).padStart(2, '0')}.`
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[#1E293B] dark:text-white">{m.title}</p>
                          {m.description && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                              {m.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <span
                        className={`text-[11px] font-semibold shrink-0 ${
                          m.status === 'COMPLETED'
                            ? 'text-[#1E293B] dark:text-slate-200'
                            : m.status === 'IN_PROGRESS'
                            ? 'text-[#B91C1C]'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {m.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-[#1E293B] dark:text-white tracking-tight">
                    Recent Learning Activity
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Verified module completions recorded for your account.
                  </p>
                </div>
                <Award size={16} className="text-[#B91C1C]" aria-hidden="true" />
              </div>

              {modules.filter((m) => m.completed).length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-xs font-bold text-[#1E293B] dark:text-white">No completed activity yet</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Completed modules will appear here chronologically once verified by your tutor.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {modules
                    .filter((m) => m.completed)
                    .slice(0, 6)
                    .map((module) => (
                      <div key={module.id} className="px-5 py-3.5 flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <CheckCircle2
                            size={15}
                            className="mt-0.5 text-[#1E293B] dark:text-slate-200 shrink-0"
                            aria-hidden="true"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-[#1E293B] dark:text-white truncate">
                              {module.title}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              {module.trackName} · {module.stageName}
                            </p>
                          </div>
                        </div>
                        <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                          {module.completionDate ? formatDate(module.completionDate) : 'Completed'}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </section>
          </div>

          {/* Modal: Submit Assignment via Google Link */}
          {submittingAssignment && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-bold text-[#1E293B] dark:text-white">
                      Submit Assignment Work
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {submittingAssignment.title}
                    </p>
                  </div>
                  <button
                    onClick={() => setSubmittingAssignment(null)}
                    type="button"
                    className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
                    aria-label="Close"
                  >
                    <X size={18} />
                  </button>
                </div>

                <form onSubmit={handleSubmitGoogleAssignment} className="space-y-4">
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300">
                    <p className="font-bold text-[#1E293B] dark:text-white flex items-center gap-1.5 mb-1">
                      <LinkIcon size={14} className="text-[#B91C1C]" aria-hidden="true" /> Google Link Submission
                    </p>
                    <p className="leading-relaxed">
                      Share your Google Docs, Google Drive, Slides, or project URL below and ensure sharing is set to{' '}
                      <em>&ldquo;Anyone with the link can view&rdquo;</em>.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Google Drive / Docs / Project URL *
                    </label>
                    <input
                      required
                      type="url"
                      value={submissionGoogleUrl}
                      onChange={(e) => setSubmissionGoogleUrl(e.target.value)}
                      placeholder="https://docs.google.com/... or https://drive.google.com/..."
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm font-mono text-[#1E293B] dark:text-white focus:ring-2 focus:ring-[#B91C1C] outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                      Optional Notes or Message to Tutor
                    </label>
                    <textarea
                      rows={3}
                      value={submissionNotes}
                      onChange={(e) => setSubmissionNotes(e.target.value)}
                      placeholder="Any additional explanations or questions for your instructor..."
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm text-[#1E293B] dark:text-white focus:ring-2 focus:ring-[#B91C1C] outline-none resize-y"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={() => setSubmittingAssignment(null)}
                      className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingLink}
                      className="px-5 py-2 rounded-lg bg-[#B91C1C] hover:bg-red-800 text-white text-xs font-bold inline-flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                    >
                      {isSubmittingLink ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                      <span>{isSubmittingLink ? 'Submitting…' : 'Submit to Tutor'}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default StudentDashboard;
