import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Award,
  Bell,
  Calendar,
  CheckCircle2,
  Clock,
  Code2,
  Download,
  ExternalLink,
  FileText,
  Lock,
  Radio,
  Trophy,
  UserCheck,
  Video,
  X,
  Send,
  Loader2,
  Upload,
  Link as LinkIcon,
  BookOpen,
  ClipboardList,
  AlertCircle,
  School
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
  serverTimestamp
} from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import SEO from '../../components/ui/SEO';
import { AchievementBadgeGrid } from '../../components/ecosystem/AchievementBadge';
import { DashboardGreeting } from '../../components/portal/DashboardGreeting';
import { StudentAnalyticsVisualizer } from '../../components/portal/StudentAnalyticsVisualizer';
import { ResourceListView } from '../../components/portal/ResourceListView';
import { TypingMastersAcademyCard } from '../../components/portal/TypingMastersAcademyCard';
import { useToast } from '../../contexts/ToastContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { getEffectiveAuth } from '../../utils/impersonation';
import { isStudentClassMatch } from '../../utils/classMatching';
import { isStudentEligibleForWork, normalizeWorkType } from '../../lib/classes';
import {
  generateModuleCertificatePdf,
  type ModuleCertificateData,
} from '../../lib/certificatePdfGenerator';
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

const normalizeStr = (v?: any) => String(v || '').trim().toLowerCase();

export const StudentDashboard: React.FC = () => {
  const toast = useToast();
  const { unreadCount } = useNotifications();

  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [modules, setModules] = useState<ProgramModule[]>([]);
  const [classResources, setClassResources] = useState<ResourceItem[]>([]);
  const [generalResources, setGeneralResources] = useState<ResourceItem[]>([]);
  const [personalResources, setPersonalResources] = useState<ResourceItem[]>([]);
  const [personalLinks, setPersonalLinks] = useState<LinkItem[]>([]);
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [studentSchedules, setStudentSchedules] = useState<any[]>([]);
  const [dynamicMilestones, setDynamicMilestones] = useState<DynamicMilestone[]>([]);
  const [studentAssignments, setStudentAssignments] = useState<DynamicAssignment[]>([]);
  const [curriculumTopics, setCurriculumTopics] = useState<string[]>([]);
  const [enrolledProgramName, setEnrolledProgramName] = useState<string>('');
  const [isEdclubAllowed, setIsEdclubAllowed] = useState<boolean>(false);
  const [hasResourcesAllowed, setHasResourcesAllowed] = useState<boolean>(true);
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
  const [selectedModuleForCert, setSelectedModuleForCert] = useState<ProgramModule | null>(null);
  const [certStudentName, setCertStudentName] = useState('');
  const [generatingCert, setGeneratingCert] = useState(false);

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
                const general = schPrograms.find(p => p.isGeneralProgram) || schPrograms[0];
                if (general) {
                  progName = general.name;
                  if (general.hasEdclub || String(general.name || '').toLowerCase().includes('digital literacy')) {
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
              progName = schData.programs[0].name;
            }
          }
        } catch (e) {
          console.warn('School by name query notice:', e);
        }
      }

      // Query programs collection to determine if program is multi-stage or standalone
      let matchedProgramDoc: any = null;
      try {
        const progsSnap = await getDocs(collection(db, 'programs')).catch(() => ({ docs: [] } as any));
        progsSnap.docs.forEach((d: any) => {
          const p = d.data();
          const pTitle = String(p.title || p.name || '').trim().toLowerCase();
          const isMatch = assignedProgramsList.some(ap => ap === pTitle || ap.includes(pTitle) || pTitle.includes(ap)) ||
            (progName && (pTitle === progName.toLowerCase().trim() || pTitle.includes(progName.toLowerCase().trim()) || progName.toLowerCase().trim().includes(pTitle)));
          if (isMatch && !matchedProgramDoc) {
            matchedProgramDoc = p;
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

      const resolvedProgramTitle = progName || (isDigitalLitOrTyping ? 'Digital Literacy Junior' : (studentRecord.schoolName ? 'Digital Literacy Junior' : (studentRecord.plan || 'Digital Literacy Junior')));
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

      // 2. Fetch Real Assignments from Firestore & Netlify Functions
      const assignmentList: DynamicAssignment[] = [];
      const seenAssignments = new Set<string>();
      try {
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

        const directAssignmentSnaps = await Promise.all([
          getDocs(query(collection(db, 'assignments'), where('studentId', '==', currentStudentId))).catch(() => ({ docs: [] } as any)),
          ...(currentUid ? [getDocs(query(collection(db, 'assignments'), where('studentUserId', '==', currentUid))).catch(() => ({ docs: [] } as any))] : []),
          ...(currentUid ? [getDocs(query(collection(db, 'assignments'), where('userId', '==', currentUid))).catch(() => ({ docs: [] } as any))] : [])
        ]);

        directAssignmentSnaps.forEach(snap => {
          snap.docs?.forEach((d: any) => {
            if (!seenAssignments.has(d.id)) {
              seenAssignments.add(d.id);
              const data = d.data();
              assignmentList.push({
                id: d.id,
                title: data.title || 'Assignment Task',
                instructions: data.instructions || data.description,
                tutorName: data.tutorName || data.assignedBy,
                studentName: data.studentName,
                dueDate: data.dueDate?.toDate ? data.dueDate.toDate().toISOString() : data.dueDate,
                status: data.status || 'PUBLISHED',
                grade: data.grade,
                feedback: data.feedback,
                submissionText: data.submissionText,
                submissionUrl: data.submissionUrl,
                submittedAt: data.submittedAt?.toDate ? data.submittedAt.toDate().toISOString() : data.submittedAt,
                reviewedAt: data.reviewedAt?.toDate ? data.reviewedAt.toDate().toISOString() : data.reviewedAt,
                reviewStatus: data.reviewStatus,
                resourceUrl: data.resourceUrl,
                resourceTitle: data.resourceTitle
              });
            }
          });
        });
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

        const seenScheduleIds = new Set<string>();
        const filtered = combinedRaw.filter((r: any) => {
          if (!r || !r.id || seenScheduleIds.has(r.id)) return false;
          seenScheduleIds.add(r.id);

          // Direct student assignment
          if (r.studentId && (r.studentId === currentStudentId || r.studentId === lookupUid)) return true;
          if (r.studentEmail && sEmail && r.studentEmail.toLowerCase() === sEmail) return true;
          if (r.studentName && sName && r.studentName.toLowerCase() === sName) return true;
          if (pId && r.parentId && r.parentId === pId) return true;
          if (pEmail && r.parentEmail && r.parentEmail.toLowerCase() === pEmail) return true;

          const rSchId = (r.schoolId || '').trim();
          const rSchName = (r.schoolName || '').trim().toLowerCase();

          // 1. If student belongs to a school, the schedule MUST belong to their school
          if (schId || schName) {
            const isSchoolMatch = (schId && rSchId === schId) ||
              (schName && rSchName && (rSchName === schName || rSchName.includes(schName) || schName.includes(rSchName)));
            if (!isSchoolMatch) return false;
          }

          // 2. Class Level Strict Filtering (e.g. Primary 4A only sees Primary 4A)
          const isClassMatch = isStudentClassMatch(studentClass, r.classLevel, r.classLevels);
          if (!isClassMatch) return false;

          // 3. Program matching (if student is enrolled in a program, check match)
          if (currentProg) {
            const rProgName = String(r.programName || r.title || '').trim().toLowerCase();
            const isProgramMatch = !rProgName || rProgName === currentProg || rProgName.includes(currentProg) || currentProg.includes(rProgName);
            if (!isProgramMatch && r.targetType !== 'ALL') {
              return false;
            }
          }

          return true;
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
      if (s === 'COMPLETED' || s === 'REVIEWED') {
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
      { name: 'Completed', value: completed, color: '#10B981' },
      { name: 'In Progress', value: inProgress, color: '#38BDF8' },
      { name: 'Pending', value: pending, color: '#F59E0B' },
    ].filter(item => item.value > 0);

    return { completed, inProgress, pending, total, rate, chartData };
  }, [studentAssignments]);

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

  const handleDownloadCertificate = (module: ProgramModule, customName?: string) => {
    if (!module.completed) return;
    const studentName = (customName || certStudentName || student?.fullName || '').trim();
    if (!studentName) {
      toast.error('Enter the student name before generating the certificate.');
      return;
    }

    setGeneratingCert(true);
    try {
      const credentialId = stableCredentialId(student?.username || student?.accessCode || student?.id || 'student', module.id);
      const certificate: ModuleCertificateData = {
        studentName,
        studentId: student?.username || student?.accessCode || student?.id || undefined,
        moduleTitle: module.title,
        moduleStage: module.stageName,
        programTrack: module.trackName,
        competencies: module.competencies,
        issueDate: module.completionDate || undefined,
        credentialId,
        instructorName: module.instructor || undefined,
      };

      generateModuleCertificatePdf(certificate);
      toast.success(`Certificate for “${module.title}” generated successfully.`);
      setSelectedModuleForCert(null);
    } catch (error) {
      console.error('Certificate generation failed:', error);
      toast.error('Failed to generate the certificate PDF.');
    } finally {
      setGeneratingCert(false);
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
          <DashboardGreeting
            name={student.fullName || undefined}
            role="Student"
            subtitle={schoolDisplayName ? `${schoolDisplayName} • ${enrolledProgramName || student.plan || 'Digital Literacy Junior'}` : "Your learning overview, kept focused on the things that matter most."}
          />

          {/* 🔴 ACTIVE LIVE CLASS BANNER (If Active Today and In Session) */}
          {scheduleAnalysis.liveSession && (
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-950 via-slate-900 to-emerald-950 border-2 border-emerald-500/80 p-5 text-white shadow-lg animate-fade-in">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 py-0.5 text-[10px] font-black uppercase text-white shadow-xs">
                      <Radio size={12} className="animate-spin" /> LIVE CLASS IN SESSION
                    </span>
                    <span className="text-xs text-emerald-300 font-bold">
                      {scheduleAnalysis.liveSession.formattedDate || 'Today'}
                    </span>
                  </div>
                  <h3 className="text-lg font-black text-white">
                    {scheduleAnalysis.liveSession.title || scheduleAnalysis.liveSession.programName || 'Live Classroom Session'}
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-300 font-medium">
                    {scheduleAnalysis.liveSession.startTime && (
                      <span>⏰ {scheduleAnalysis.liveSession.startTime} – {scheduleAnalysis.liveSession.endTime}</span>
                    )}
                    {scheduleAnalysis.liveSession.tutorName && (
                      <span className="flex items-center gap-1">
                        <UserCheck size={13} className="text-brand-red" />
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
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-black text-white hover:bg-emerald-700 shadow-md shadow-emerald-900/40 transition shrink-0"
                  >
                    Join Live Room Now <ExternalLink size={14} />
                  </a>
                )}
              </div>
            </div>
          )}

          {/* 🚀 LEADER PANEL: CURRENT PROGRAMME & PROGRESS OVERVIEW (Light & pleasant in light mode, dark & rich in dark mode) */}
          <section 
            className="relative overflow-hidden rounded-3xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white p-6 sm:p-7 shadow-sm border border-slate-200/90 dark:border-slate-800"
          >
            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              {/* Left Column (7 cols): Current Program, Class Cohort & Milestone Stats */}
              <div className="lg:col-span-7 space-y-4">
                <div className="space-y-1">
                  <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight leading-snug">
                    {enrolledProgramName || student.plan || 'Digital Literacy Junior'}
                  </h2>
                  <p className="text-sm sm:text-base font-bold text-slate-600 dark:text-slate-300">
                    {student.class || student.grade ? `Class Cohort: ${student.class || student.grade}` : 'Standard Curriculum Track'}
                    {(student.schoolName || schoolDisplayName) ? ` • ${student.schoolName || schoolDisplayName}` : ''}
                  </p>
                </div>

                {/* Quick Dynamic Milestones Progress Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                  <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/60 p-3.5 shadow-xs">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Curriculum Score</p>
                    <p className="text-xl font-black text-slate-900 dark:text-white mt-0.5">{curriculumScorePercentage}%</p>
                    <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                      {dynamicMilestones.length > 0 
                        ? `${completedMilestonesCount} of ${dynamicMilestones.length} Milestones`
                        : 'No milestones set yet'}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/60 p-3.5 shadow-xs">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Active Tasks</p>
                    <p className="text-xl font-black text-slate-900 dark:text-white mt-0.5">{assignmentStats.total}</p>
                    <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                      {assignmentStats.completed} Completed
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/60 p-3.5 shadow-xs col-span-2 sm:col-span-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Current Stage</p>
                    <p className="text-base sm:text-lg font-black text-slate-900 dark:text-white mt-0.5 truncate">
                      {programDetails.hasStages
                        ? (programDetails.stageName || `Stage ${programDetails.stageNumber || 1}`)
                        : (student.class || student.grade || 'Standard Track')}
                    </p>
                    <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                      {programDetails.hasStages ? (programDetails.nextProgramTitle ? `Next: ${programDetails.nextProgramTitle}` : 'Series Program') : 'Enrolled Course'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Right Column (5 cols): Recharts Donut Chart for Active Assignment Completion */}
              <div className="lg:col-span-5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/60 p-4 sm:p-5 flex flex-col justify-between shadow-xs">
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
                      Progress Overview &amp; Deliverables
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Real-time assignment submission velocity
                    </p>
                  </div>
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/30">
                    Live
                  </span>
                </div>

                <div className="h-44 w-full relative flex items-center justify-center my-1">
                  {assignmentStats.total === 0 ? (
                    <div className="text-center p-4">
                      <ClipboardList size={28} className="mx-auto text-slate-400 mb-1" />
                      <p className="text-xs font-bold text-slate-700 dark:text-white">No active assignments</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Tasks assigned by your tutor will display here.</p>
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
                            paddingAngle={4}
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
                                  <div className="bg-slate-900 text-white border border-slate-700 rounded-xl p-2.5 text-xs shadow-xl">
                                    <p className="font-bold flex items-center gap-1.5">
                                      <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: d.payload.color }} />
                                      {d.name}: <span className="font-mono font-black">{d.value}</span>
                                    </p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      {/* Donut Center Completion Rate */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white font-mono leading-none">
                          {assignmentStats.rate}%
                        </span>
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300 mt-1">
                          Completed
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Donut Legend Breakdown Pills */}
                <div className="grid grid-cols-3 gap-1.5 pt-1 text-center">
                  <div className="p-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-700/50">
                    <p className="text-[9px] font-bold text-emerald-700 dark:text-emerald-300 uppercase">Done</p>
                    <p className="text-xs font-black text-slate-900 dark:text-white font-mono">{assignmentStats.completed}</p>
                  </div>
                  <div className="p-1.5 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-700/50">
                    <p className="text-[9px] font-bold text-sky-700 dark:text-sky-300 uppercase">In Progress</p>
                    <p className="text-xs font-black text-slate-900 dark:text-white font-mono">{assignmentStats.inProgress}</p>
                  </div>
                  <div className="p-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-700/50">
                    <p className="text-[9px] font-bold text-amber-700 dark:text-amber-300 uppercase">Pending</p>
                    <p className="text-xs font-black text-slate-900 dark:text-white font-mono">{assignmentStats.pending}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Dynamic Curriculum Progression Path (Only rendered if actual topics/syllabus exist) */}
            {curriculumTopics.length > 0 && (
              <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700/70">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Curriculum Stage Progression Path ({curriculumTopics.length} Weekly Topics)
                  </span>
                  <Link 
                    to="/portal/student/assignments" 
                    className="text-[10px] font-bold text-red-600 dark:text-red-400 hover:underline inline-flex items-center gap-1"
                  >
                    View All Topics <ArrowRight size={10} />
                  </Link>
                </div>
                <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
                  {curriculumTopics.map((topic, idx) => (
                    <div 
                      key={`topic-${idx}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/80 text-xs font-bold text-slate-800 dark:text-slate-200 shrink-0 shadow-xs"
                    >
                      <span className="w-4 h-4 rounded-full bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-300 flex items-center justify-center text-[10px] font-black">
                        W{idx + 1}
                      </span>
                      <span className="truncate max-w-[140px]">{topic}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* 🧪 ASSIGNED TESTS, EXAMINATIONS & ASSESSMENTS SECTION */}
          <section className="rounded-2xl bg-white dark:bg-slate-900 p-5 sm:p-6 border border-slate-200/90 dark:border-slate-800 shadow-xs">
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <FileText size={18} className="text-brand-red" /> Assigned Tests, Examinations &amp; Assessments ({exams.length})
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Class tests, formal examinations, and interactive learning activities assigned to your class or account.
                </p>
              </div>
              <Link
                to="/portal/student/assessments"
                className="text-xs font-black text-brand-red inline-flex items-center gap-1 hover:underline"
              >
                Open Assessments &amp; Work <ArrowRight size={13} />
              </Link>
            </div>

            {exams.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-5 text-center space-y-1.5">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">No active tests or examinations right now</p>
                <p className="text-[11px] text-slate-500">
                  Any test, quiz, activity, or examination assigned to your class will appear here and in your Assessments &amp; Work tab.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {exams.slice(0, 6).map((ex) => (
                  <div
                    key={ex.id}
                    className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-4 flex flex-col justify-between shadow-xs hover:border-brand-red/40 transition-colors gap-3"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1 rounded-md bg-red-50 dark:bg-red-950/60 px-2 py-0.5 text-[9px] font-black uppercase text-brand-red dark:text-red-300">
                          {ex.workType || 'ASSESSMENT'}
                        </span>
                        {ex.targetClass && (
                          <span className="text-[10px] font-bold text-slate-500">
                            {ex.targetClass}
                          </span>
                        )}
                      </div>
                      <h4 className="mt-2 text-sm font-black text-slate-900 dark:text-white line-clamp-1">
                        {ex.title}
                      </h4>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {ex.subject || 'Computer Technology'}
                        {ex.durationMinutes ? ` • ${ex.durationMinutes} mins` : ''}
                      </p>
                    </div>
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                        Assigned to your class
                      </span>
                      <Link
                        to="/portal/student/assessments"
                        className="px-3.5 py-1.5 rounded-xl bg-brand-red hover:bg-red-700 text-white text-xs font-black inline-flex items-center gap-1.5 transition-all shadow-xs"
                      >
                        <span>Open Assessment</span>
                        <ArrowRight size={12} />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 📝 ACTIVE ASSIGNMENTS & GOOGLE LINK SUBMISSION SECTION */}
          <section className="rounded-2xl bg-white dark:bg-slate-900 p-5 sm:p-6 border border-slate-200/90 dark:border-slate-800 shadow-xs">
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <ClipboardList size={18} className="text-brand-red" /> Active Assignments &amp; Tasks ({studentAssignments.length})
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Submit your completed homework, practical drills, or Google Drive / Docs project links for tutor review.
                </p>
              </div>
              <Link
                to="/portal/student/assignments"
                className="text-xs font-black text-brand-red inline-flex items-center gap-1 hover:underline"
              >
                All Assignments <ArrowRight size={13} />
              </Link>
            </div>

            {studentAssignments.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center space-y-1.5">
                <ClipboardList size={30} className="mx-auto text-slate-400" />
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">No assignments currently assigned</p>
                <p className="text-[11px] text-slate-500">When your instructor assigns an active task or project, it will appear here with an instant Google Link upload button.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {studentAssignments.map((a) => {
                  const isSubmitted = ['SUBMITTED', 'AWAITING_REVIEW'].includes(a.status || a.reviewStatus || '');
                  const isCompleted = ['COMPLETED', 'REVIEWED'].includes(a.status || a.reviewStatus || '');
                  const isResubmit = a.status === 'RESUBMISSION_REQUIRED' || a.reviewStatus === 'RESUBMISSION_REQUIRED';

                  return (
                    <div
                      key={a.id}
                      className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-4 flex flex-col justify-between shadow-xs hover:border-brand-red/40 transition-colors gap-3"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[9px] font-black uppercase ${
                            isCompleted
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : isSubmitted
                              ? 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300'
                              : isResubmit
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                              : 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
                          }`}>
                            {isCompleted ? <CheckCircle2 size={10} /> : isSubmitted ? <Clock size={10} /> : <AlertCircle size={10} />}
                            {isCompleted ? 'Completed' : isSubmitted ? 'Under Review' : isResubmit ? 'Resubmission Requested' : 'Active Task'}
                          </span>
                          {a.dueDate && (
                            <span className="text-[10px] font-bold text-slate-500 font-mono">
                              Due: {formatDate(a.dueDate)}
                            </span>
                          )}
                        </div>

                        <h4 className="mt-2 text-sm font-black text-slate-900 dark:text-white line-clamp-1">
                          {a.title}
                        </h4>
                        {a.instructions && (
                          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                            {a.instructions}
                          </p>
                        )}
                        {a.tutorName && (
                          <p className="mt-1.5 text-[11px] text-slate-500 flex items-center gap-1">
                            <UserCheck size={12} className="text-brand-red shrink-0" />
                            Assigned by: <strong className="text-slate-700 dark:text-slate-300">{a.tutorName}</strong>
                          </p>
                        )}

                        {a.submissionUrl && (
                          <div className="mt-2 text-[11px] flex items-center gap-1.5 text-sky-600 dark:text-sky-400 font-bold truncate">
                            <LinkIcon size={12} className="shrink-0" />
                            <a href={a.submissionUrl} target="_blank" rel="noreferrer" className="hover:underline truncate">
                              {a.submissionUrl}
                            </a>
                          </div>
                        )}

                        {a.feedback && (
                          <div className="mt-2 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 text-[11px] text-emerald-900 dark:text-emerald-300">
                            <strong>Tutor Feedback:</strong> {a.feedback}
                            {a.grade !== undefined && <span> (Score: {a.grade}/100)</span>}
                          </div>
                        )}
                      </div>

                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                        {isCompleted ? (
                          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 size={13} /> Verified by Tutor
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenSubmitModal(a)}
                            className="px-3.5 py-1.5 rounded-xl bg-brand-red hover:bg-red-700 text-white text-xs font-black inline-flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                          >
                            <Upload size={12} />
                            <span>{isSubmitted ? 'Update Google Link' : 'Submit Google Link'}</span>
                          </button>
                        )}

                        {a.resourceUrl && (
                          <a
                            href={a.resourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white inline-flex items-center gap-1"
                          >
                            <FileText size={12} /> {a.resourceTitle || 'Resource'}
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ⌨️ TYPING MASTERS ACADEMY & EDCLUB WORKSPACE */}
          {isEdclubAllowed && (
            <TypingMastersAcademyCard
              studentName={student.fullName || student.name || 'Student'}
              studentClass={student.class || student.grade}
              schoolId={student.schoolId}
              isAllowed={true}
              enrolledProgramName={enrolledProgramName || student.plan || 'Digital Literacy Junior'}
            />
          )}

          {/* 📅 UPCOMING CLASS SCHEDULE & TIMETABLE WIDGET */}
          <section className="rounded-2xl bg-white dark:bg-slate-900 p-5 sm:p-6 border border-slate-200/90 dark:border-slate-800 shadow-xs">
            <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Calendar size={18} className="text-brand-red" /> Upcoming Class Schedule
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Your upcoming virtual classrooms, timetable sessions, and tutor schedules.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Link
                  to="/portal/student/calendar"
                  className="text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-brand-red dark:hover:text-brand-red inline-flex items-center gap-1 transition-colors"
                >
                  <Calendar size={12} /> Timetable
                </Link>
                <Link
                  to="/portal/student/live-classrooms"
                  className="text-xs font-black text-brand-red inline-flex items-center gap-1 hover:underline"
                >
                  All Live Classes <ArrowRight size={13} />
                </Link>
              </div>
            </div>

            {scheduleAnalysis.upcoming.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {scheduleAnalysis.upcoming.map((occ: any) => (
                  <div
                    key={occ.id}
                    className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900/70 p-4 flex flex-col justify-between shadow-xs hover:border-brand-red/40 transition-colors"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1 rounded-md bg-brand-red/10 px-2 py-0.5 text-[9px] font-black uppercase text-brand-red">
                          <Calendar size={10} /> UPCOMING
                        </span>
                        {occ.startTime && (
                          <span className="text-[10px] font-bold text-slate-500 font-mono">
                            ⏰ {occ.startTime} – {occ.endTime}
                          </span>
                        )}
                      </div>
                      <h4 className="mt-2.5 text-xs sm:text-sm font-black text-slate-900 dark:text-white line-clamp-1">
                        {occ.title || occ.programName || 'Class Session'}
                      </h4>
                      <p className="mt-0.5 text-[11px] font-bold text-brand-red dark:text-red-400">
                        {occ.formattedDate || occ.date}
                      </p>
                      {occ.tutorName && (
                        <p className="mt-1.5 text-[11px] text-slate-500 flex items-center gap-1 font-medium">
                          <UserCheck size={12} className="text-brand-red shrink-0" />
                          Faculty: <strong className="text-slate-700 dark:text-slate-300 font-bold">{occ.tutorName}</strong>
                        </p>
                      )}
                    </div>

                    <div className="mt-4 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400">
                        {occ.classLevel ? `Cohort: ${occ.classLevel}` : 'Assigned Cohort'}
                      </span>
                      {occ.meetingLink ? (
                        <a
                          href={occ.meetingLink}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[10px] font-black inline-flex items-center gap-1 hover:bg-emerald-500 hover:text-white transition-all"
                        >
                          Join Room <ExternalLink size={10} />
                        </a>
                      ) : (
                        <span className="text-[10px] font-medium text-slate-400">Link on start</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center">
                <Calendar size={28} className="mx-auto text-slate-400 dark:text-slate-500" />
                <p className="mt-2 text-xs font-bold text-slate-800 dark:text-slate-200">No upcoming class sessions scheduled today</p>
                <p className="mt-0.5 text-[11px] text-slate-500">Your upcoming weekly timetable and sessions will appear here once timetabled by your instructor.</p>
                <Link
                  to="/portal/student/calendar"
                  className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-brand-red hover:underline"
                >
                  View Full Schedule <ArrowRight size={12} />
                </Link>
              </div>
            )}
          </section>

          {/* 📊 ROADMAP MILESTONES & RECENT ACTIVITIES */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="rounded-2xl bg-white dark:bg-slate-900 p-5 sm:p-6 border border-slate-200/90 dark:border-slate-800 shadow-xs">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">Curriculum Milestones</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Target milestones calibrated by your instructor.</p>
                </div>
                <Link to="/portal/student/milestones" className="text-xs font-bold text-brand-red inline-flex items-center gap-1">
                  All Milestones <ArrowRight size={13} />
                </Link>
              </div>

              {dynamicMilestones.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center">
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">No milestones published yet</p>
                  <p className="mt-1 text-[11px] text-slate-500">Your tutor will publish term milestones dynamically for your program.</p>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
                  {dynamicMilestones.map((m, idx) => (
                    <div key={m.id} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                        m.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}>
                        {m.status === 'COMPLETED' ? <CheckCircle2 size={14} /> : <span className="text-[10px] font-black">{idx + 1}</span>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-900 dark:text-white">{m.title}</p>
                        {m.description && <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{m.description}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl bg-white dark:bg-slate-900 p-5 sm:p-6 border border-slate-200/90 dark:border-slate-800 shadow-xs">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">Recent Learning Activity</h2>
                  <p className="mt-0.5 text-xs text-slate-500">Verified activity recorded for your account.</p>
                </div>
                <Award size={16} className="text-brand-red" aria-hidden="true" />
              </div>

              {modules.filter(m => m.completed).length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center">
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">No completed activity yet</p>
                  <p className="mt-1 text-[11px] text-slate-500">Completed milestones and assignments will appear here once approved by your tutor.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {modules.filter(m => m.completed).slice(0, 5).map(module => (
                    <div key={module.id} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/50">
                      <Award size={15} className="mt-0.5 text-emerald-600" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 dark:text-white">{module.title}</p>
                        <p className="text-[10px] text-slate-500">{module.completionDate ? `Completed ${formatDate(module.completionDate)}` : 'Completed'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* 🚀 MODAL: SUBMIT ASSIGNMENT VIA GOOGLE LINK */}
          {submittingAssignment && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-black text-slate-900 dark:text-white">Submit Assignment Work</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{submittingAssignment.title}</p>
                  </div>
                  <button
                    onClick={() => setSubmittingAssignment(null)}
                    type="button"
                    className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
                    aria-label="Close"
                  >
                    <X size={18} />
                  </button>
                </div>

                <form onSubmit={handleSubmitGoogleAssignment} className="space-y-4">
                  <div className="p-3.5 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs text-blue-900 dark:text-blue-200">
                    <p className="font-bold flex items-center gap-1.5 mb-1">
                      <LinkIcon size={14} /> Google Link Submission
                    </p>
                    <p className="leading-relaxed">
                      Upload or share your Google Docs, Google Drive file, Google Slides presentation, or public project URL below. Make sure link sharing is set to <em>"Anyone with the link can view"</em>.
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
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2.5 text-sm font-mono text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-red outline-none"
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
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3.5 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-red outline-none resize-y"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={() => setSubmittingAssignment(null)}
                      className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingLink}
                      className="px-5 py-2.5 rounded-xl bg-brand-red hover:bg-red-700 text-white text-xs font-black inline-flex items-center gap-2 shadow-md shadow-red-900/20 disabled:opacity-50"
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
