import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  BookOpen, Search, Download, Bookmark, 
  Eye, CheckCircle2, Copy, Printer, 
  X, Terminal, Loader2, Zap, Users,
  Plus, Check, School, GraduationCap,
  FileText, ExternalLink, HelpCircle, Layers,
  ChevronRight, AlertCircle, Calendar, Mail
} from 'lucide-react';
import { collection, getDocs, getDoc, doc, setDoc, addDoc, query, where, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { useToast } from '../../contexts/ToastContext';
import SEO from '../../components/ui/SEO';
import { ResourceListView } from '../../components/portal/ResourceListView';
import { triggerResourceNotification } from '../../utils/resourceTracking';

export interface ResourceDocument {
  id: string;
  title: string;
  category: 'student' | 'school' | 'both' | 'staff' | 'all';
  subject: string;
  classLevel: string;
  docType:
    | 'PDF'
    | 'Document'
    | 'Image'
    | 'Video'
    | 'External Link'
    | 'Lesson Note'
    | 'Syllabus'
    | 'Practical Worksheet'
    | 'Cheatsheet'
    | 'Past Exam';
  description: string;
  fileUrl?: string;
  fileSize?: string;
  downloadCount?: number;
  term?: string;
  author?: string;
  assignedClasses?: string[];
  classInstructions?: string;
  schoolId?: string;
  schoolName?: string;
  isClassAssigned?: boolean;
  content?: {
    overview: string;
    learningObjectives: string[];
    keyConcepts: { heading: string; detail: string; codeSnippet?: string }[];
    practiceExercises: string[];
    furtherReading?: string;
  };
  tags?: string[];
  dateAdded?: string;
  isFeatured?: boolean;
}

interface ResourceLibraryProps {
  role?: 'student' | 'school' | 'staff' | 'parent' | 'all';
}

const STANDARD_SCHOOL_CLASSES = [
  'All Classes',
  'Creche & Early Years',
  'Nursery 1',
  'Nursery 2',
  'KG 1',
  'KG 2',
  'Primary 1',
  'Primary 2',
  'Primary 3',
  'Primary 4',
  'Primary 5',
  'Primary 6',
  'JSS 1',
  'JSS 2',
  'JSS 3',
  'SSS 1',
  'SSS 2',
  'SSS 3',
  'Grade 1',
  'Grade 2',
  'Grade 3',
  'Grade 4',
  'Grade 5',
  'Grade 6',
  'Grade 7',
  'Grade 8',
  'Grade 9',
  'Grade 10',
  'Grade 11',
  'Grade 12'
];

const CLASS_LEVELS = [
  'All Classes',
  'Primary / Elementary (Grades 1-5)',
  'JSS 1-3 / Junior Secondary',
  'SSS 1-3 / Senior Secondary',
  'Foundational Science & Technology (Ages 10-13)',
  'Creative Coding (Ages 7-10)',
  'Foundational (Ages 6-8)',
  'Partner School Programmes (All Batches)'
];

const SUBJECTS = [
  'All Subjects',
  'Computer Science & ICT',
  'Python Programming',
  'Web Development (React & Tailwind)',
  'Hardware & Electronics',
  'Scratch & Visual Logic',
  'Digital Literacy & Safety',
  'UI/UX & Creative Design',
  'Data Structures & Algorithms'
];

const DOC_TYPES = [
  'All Types',
  'Lesson Note',
  'PDF',
  'Document',
  'Image',
  'Video',
  'External Link',
  'Syllabus',
  'Practical Worksheet',
  'Cheatsheet',
  'Past Exam'
];

// Helper to check if student class matches assigned classes or classLevel
const checkClassMatch = (targetClass: string, assignedClasses?: string[], classLevel?: string): boolean => {
  if (!targetClass) return true;
  const tc = targetClass.trim().toLowerCase();
  
  if (assignedClasses && Array.isArray(assignedClasses) && assignedClasses.length > 0) {
    if (assignedClasses.some(c => c.toLowerCase() === 'all classes' || c.toLowerCase() === 'all' || c.toLowerCase() === 'general')) {
      return true;
    }
    return assignedClasses.some(c => {
      const cc = c.trim().toLowerCase();
      return cc === tc || cc.includes(tc) || tc.includes(cc);
    });
  }

  if (classLevel) {
    const cl = classLevel.trim().toLowerCase();
    if (cl === 'all classes' || cl === 'all') return true;
    return cl.includes(tc) || tc.includes(cl);
  }

  return true;
};

const getDocTypeBadge = (type?: string) => {
  switch (type) {
    case 'Syllabus':
      return 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800';
    case 'Lesson Note':
      return 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800';
    case 'Practical Worksheet':
      return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
    case 'Cheatsheet':
      return 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800';
    case 'Past Exam':
      return 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border-rose-200 dark:border-rose-800';
    default:
      return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700';
  }
};

export const ResourceLibrary: React.FC<ResourceLibraryProps> = ({ role = 'all' }) => {
  const { toast } = useToast();
  const [resources, setResources] = useState<ResourceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [canManageCurriculum, setCanManageCurriculum] = useState(false);

  useEffect(() => {
    let active = true;
    const resolveCurriculumPermission = async () => {
      if (role !== 'staff' || !auth.currentUser) {
        if (active) setCanManageCurriculum(false);
        return;
      }
      try {
        const uid = auth.currentUser.uid;
        const [userSnap, adminSnap] = await Promise.all([
          getDoc(doc(db, 'users', uid)).catch(() => null),
          getDoc(doc(db, 'admins', uid)).catch(() => null)
        ]);
        const userRole = String(userSnap?.data()?.role || '').toLowerCase();
        const isTutor = ['tutor', 'instructor'].includes(userRole);
        const isSuperAdmin = Boolean(adminSnap?.exists()) || Boolean((await auth.currentUser.getIdTokenResult()).claims.super_admin);
        if (active) setCanManageCurriculum(isTutor || isSuperAdmin);
      } catch (error) {
        console.warn('Curriculum upload permission check failed:', error);
        if (active) setCanManageCurriculum(false);
      }
    };
    void resolveCurriculumPermission();
    return () => { active = false; };
  }, [role]);

  // Student Session Context
  const [studentInfo, setStudentInfo] = useState<{
    docId: string;
    studentClass: string;
    schoolId: string;
    schoolName: string;
    programId?: string;
    programName?: string;
    hasResources?: boolean;
  }>({
    docId: sessionStorage.getItem('studentDocId') || '',
    studentClass: sessionStorage.getItem('studentClass') || '',
    schoolId: sessionStorage.getItem('schoolId') || '',
    schoolName: sessionStorage.getItem('schoolName') || '',
    programId: sessionStorage.getItem('studentProgramId') || '',
    programName: sessionStorage.getItem('studentProgramName') || '',
    hasResources: true
  });

  // School Session Context
  const schoolId = sessionStorage.getItem('schoolId') || '';
  const schoolName = sessionStorage.getItem('schoolName') || 'Institutional Partner';

  // Bookmarks
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('jaystarbliss_bookmarked_resources');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Active Document Reader Modal
  const [previewDoc, setPreviewDoc] = useState<ResourceDocument | null>(null);

  // Class Assignment Modal State
  const [assignModalDoc, setAssignModalDoc] = useState<ResourceDocument | null>(null);
  const [assignSelectedClasses, setAssignSelectedClasses] = useState<string[]>([]);
  const [assignInstructions, setAssignInstructions] = useState('');
  const [customClassInput, setCustomClassInput] = useState('');
  const [savingAssignment, setSavingAssignment] = useState(false);

  // New Resource Upload Modal State (for tutors, school admins & super admins)
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [authorisedSchools, setAuthorisedSchools] = useState<{ id: string; name: string }[]>([]);
  const [privateLearners, setPrivateLearners] = useState<{ id: string; name: string; class: string }[]>([]);
  const [uploadForm, setUploadForm] = useState({
    title: '',
    subject: 'Computer Science & ICT',
    docType: 'Lesson Note' as ResourceDocument['docType'],
    classLevel: 'All Classes',
    assignedClasses: ['All Classes'],
    audienceMode: 'SCHOOL_CLASS' as 'SCHOOL_CLASS' | 'PRIVATE_LEARNERS',
    targetSchoolId: '',
    targetStudentIds: [] as string[],
    description: '',
    fileUrl: '',
    classInstructions: ''
  });
  const [uploadSubmitting, setUploadSubmitting] = useState(false);

  // Load authorised schools and private learners for tutors/staff
  useEffect(() => {
    if (role !== 'staff' && role !== 'school') return;
    let mounted = true;
    const loadTargets = async () => {
      try {
        const uid = auth.currentUser?.uid || '';
        if (!uid) return;
        const [schoolsSnap, indSnap] = await Promise.all([
          getDocs(collection(db, 'schools')).catch(() => ({ docs: [] } as any)),
          getDocs(query(collection(db, 'individualStudents'), where('tutorId', '==', uid))).catch(
            () => ({ docs: [] } as any)
          ),
        ]);
        const mySchools = schoolsSnap.docs
          .map((d: any) => ({ id: d.id, ...d.data() }))
          .filter((s: any) => {
            if (role === 'school') return s.id === schoolId;
            return (
              s.tutorId === uid ||
              s.assignedTutorId === uid ||
              (Array.isArray(s.assignedTutors) &&
                s.assignedTutors.some((t: any) => String(t?.id || t?.tutorId || t || '') === uid)) ||
              (Array.isArray(s.assignedStaff) &&
                s.assignedStaff.some((t: any) => String(t?.id || t?.uid || t || '') === uid))
            );
          })
          .map((s: any) => ({ id: s.id, name: s.name || s.schoolName || 'Partner School' }));
        const learners = indSnap.docs.map((d: any) => {
          const sd = d.data() || {};
          return {
            id: d.id,
            name: sd.fullName || sd.studentName || sd.name || 'Private Learner',
            class: sd.class || sd.grade || 'Private',
          };
        });
        if (mounted) {
          setAuthorisedSchools(mySchools);
          setPrivateLearners(learners);
        }
      } catch {
        // Ignore target lookup error
      }
    };
    void loadTargets();
    return () => {
      mounted = false;
    };
  }, [role, schoolId]);

  // Fetch Firestore resources dynamically
  const fetchFirestoreResources = useCallback(async () => {
    try {
      setLoading(true);
      const currentUid = auth.currentUser?.uid || '';
      const sDocId = sessionStorage.getItem('studentDocId') || '';
      const sClass = sessionStorage.getItem('studentClass') || '';
      const sSchoolId = sessionStorage.getItem('schoolId') || '';
      const sSchoolName = sessionStorage.getItem('schoolName') || '';

      setStudentInfo({
        docId: sDocId,
        studentClass: sClass,
        schoolId: sSchoolId,
        schoolName: sSchoolName
      });

      let dbItems: ResourceDocument[] = [];

      if (role === 'school') {
        const [resSnap, schoolResSnap] = await Promise.all([
          getDocs(collection(db, 'resources')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'schoolResources')).catch(() => ({ docs: [] }))
        ]);

        const rawList = [...resSnap.docs, ...schoolResSnap.docs];
        const seenIds = new Set<string>();

        dbItems = rawList.map(dDoc => {
          const d = dDoc.data();
          const docId = dDoc.id;
          seenIds.add(docId);
          return {
            id: docId,
            title: d.title || 'Curriculum Resource',
            category: (d.category as any) || 'school',
            subject: d.subject || d.subjectTrack || 'Computer Science & ICT',
            classLevel: d.classLevel || d.gradeLevel || 'All Classes',
            docType: (d.type as any) || (d.docType as any) || 'Lesson Note',
            description: d.description || 'Institutional lesson plan, worksheet or syllabus.',
            fileUrl: d.fileUrl || d.url || '',
            fileSize: d.fileSize || 'PDF Document',
            author: d.author || d.instructor || 'Jaystarbliss Tutors',
            assignedClasses: Array.isArray(d.assignedClasses) ? d.assignedClasses : (d.targetClass ? [d.targetClass] : (d.class ? [d.class] : [])),
            classInstructions: d.classInstructions || d.instructions || '',
            schoolId: d.schoolId || sSchoolId,
            schoolName: d.schoolName || sSchoolName,
            dateAdded: d.timestamp?.toDate ? d.timestamp.toDate().toISOString() : (d.assignedAt?.toDate ? d.assignedAt.toDate().toISOString() : (d.dateAdded || d.createdAt || '')),
            tags: d.tags || ['Curriculum Resource'],
            content: d.content
          };
        });
      } else if (role === 'staff') {
        const [resSnap, staffSnap, schoolResSnap] = await Promise.all([
          getDocs(collection(db, 'resources')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'staffGeneralResources')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'schoolResources')).catch(() => ({ docs: [] }))
        ]);

        const staffMap = new Map<string, ResourceDocument>();
        [...resSnap.docs, ...staffSnap.docs, ...schoolResSnap.docs].forEach(dDoc => {
          if (staffMap.has(dDoc.id)) return;
          const d = dDoc.data();
          staffMap.set(dDoc.id, {
            id: dDoc.id,
            title: d.title || 'Teaching Resource',
            category: 'staff',
            subject: d.subject || d.subjectTrack || 'General',
            classLevel: d.classLevel || d.gradeLevel || 'All Classes',
            docType: (d.type as any) || (d.docType as any) || 'Lesson Note',
            description: d.description || 'Teaching material and curriculum resources.',
            fileUrl: d.fileUrl || d.url || '',
            fileSize: d.fileSize || 'Document',
            author: d.author || d.instructor || 'Jaystarbliss Studios',
            assignedClasses: Array.isArray(d.assignedClasses) ? d.assignedClasses : (d.targetClass ? [d.targetClass] : []),
            classInstructions: d.classInstructions || '',
            dateAdded: d.timestamp?.toDate ? d.timestamp.toDate().toISOString() : (d.dateAdded || d.createdAt || ''),
            tags: d.tags || ['Teaching Material'],
            content: d.content
          });
        });
        dbItems = Array.from(staffMap.values());
      } else if (role === 'student') {
        // Resolve student program and permissions
        let studentProgramId = '';
        let studentProgramName = 'General Programme';
        let studentHasResources = true;

        if (sDocId) {
          try {
            const [sSnap, iSnap] = await Promise.all([
              getDoc(doc(db, 'students', sDocId)).catch(() => null),
              getDoc(doc(db, 'individualStudents', sDocId)).catch(() => null)
            ]);
            const sData = sSnap?.exists() ? sSnap.data() : (iSnap?.exists() ? iSnap.data() : null);
            if (sData) {
              studentProgramId = sData.programId || sData.assignedProgramId || '';
              studentProgramName = sData.programName || sData.program || sData.plan || sData.track || 'General Programme';
            }
          } catch (e) {
            console.warn('Student record fetch notice:', e);
          }
        }

        // If school is present, resolve school programs
        if (sSchoolId) {
          try {
            const schDoc = await getDoc(doc(db, 'schools', sSchoolId));
            if (schDoc.exists()) {
              const schData = schDoc.data();
              const schPrograms: any[] = Array.isArray(schData.programs) ? schData.programs : [];
              if (schPrograms.length > 0) {
                let matched = schPrograms.find(p => p.id === studentProgramId || (p.name && p.name.toLowerCase() === studentProgramName.toLowerCase()));
                if (!matched) {
                  // Fall back to school general program
                  matched = schPrograms.find(p => p.isGeneralProgram) || schPrograms[0];
                }
                if (matched) {
                  studentProgramId = matched.id || studentProgramId;
                  studentProgramName = matched.name || studentProgramName;
                  studentHasResources = matched.hasResources !== false;
                }
              }
            }
          } catch (e) {
            console.warn('School lookup notice:', e);
          }
        }

        setStudentInfo(prev => ({
          ...prev,
          programId: studentProgramId,
          programName: studentProgramName,
          hasResources: studentHasResources
        }));

        // Students can access:
        // 1. All curriculum resources uploaded by Admin
        // 2. All school resources uploaded for their affiliated school (with class & program assignments)
        // 3. Personal resources assigned to this student
        const fetchPromises: Promise<any>[] = [
          getDocs(collection(db, 'resources')).catch(() => ({ docs: [] }))
        ];

        if (sSchoolId) {
          fetchPromises.push(
            getDocs(query(collection(db, 'schoolResources'), where('schoolId', '==', sSchoolId))).catch(() => 
              getDocs(collection(db, 'schoolResources')).catch(() => ({ docs: [] }))
            )
          );
        } else {
          fetchPromises.push(getDocs(collection(db, 'schoolResources')).catch(() => ({ docs: [] })));
        }

        let learnerIds = [sDocId, currentUid].filter(Boolean);
        if (learnerIds.length > 0) {
          learnerIds.forEach(id => {
            fetchPromises.push(
              getDocs(query(collection(db, 'personalResources'), where('studentId', '==', id))).catch(() => ({ docs: [] }))
            );
          });
        }

        const results = await Promise.all(fetchPromises);
        const allFetchedDocs: any[] = [];
        results.forEach(res => {
          if (res?.docs) allFetchedDocs.push(...res.docs);
        });

        const seenMap = new Map<string, ResourceDocument>();

        allFetchedDocs.forEach(dDoc => {
          const d = dDoc.data();
          const docId = dDoc.id;
          if (seenMap.has(docId)) return;

          // Scope check: School scoping
          const rSchoolId = d.assignedSchoolId || d.schoolId || '';
          if (rSchoolId && rSchoolId !== 'all') {
            if (!sSchoolId || rSchoolId !== sSchoolId) {
              return; // Not for this student's school
            }
          }

          // Scope check: Programme scoping
          const rProgId = d.assignedProgramId || d.programId || '';
          const rProgName = d.assignedProgramName || '';
          if (rProgId && rProgId !== 'all') {
            const matchesProgId = studentProgramId && (rProgId === studentProgramId);
            const matchesProgName = studentProgramName && (
              rProgName.toLowerCase() === studentProgramName.toLowerCase() ||
              studentProgramName.toLowerCase().includes(rProgName.toLowerCase()) ||
              rProgName.toLowerCase().includes(studentProgramName.toLowerCase())
            );
            if (!matchesProgId && !matchesProgName) {
              return; // Exclude because student is on a different program!
            }
          }

          const assignedClasses: string[] = Array.isArray(d.assignedClasses) 
            ? d.assignedClasses 
            : (d.targetClass ? [d.targetClass] : (d.class ? [d.class] : []));

          const isClassAssigned = sClass ? checkClassMatch(sClass, assignedClasses, d.classLevel || d.gradeLevel) : true;

          seenMap.set(docId, {
            id: docId,
            title: d.title || 'Learning Resource',
            category: (d.category as any) || (d.schoolId ? 'school' : 'student'),
            subject: d.subject || d.subjectTrack || 'Computer Science & ICT',
            classLevel: d.classLevel || d.gradeLevel || 'All Classes',
            docType: (d.type as any) || (d.docType as any) || 'Lesson Note',
            description: d.description || 'Lesson materials, practical exercises and guides.',
            fileUrl: d.fileUrl || d.url || '',
            fileSize: d.fileSize || 'PDF Document',
            author: d.author || d.instructor || 'Jaystarbliss Tutors',
            assignedClasses,
            classInstructions: d.classInstructions || d.instructions || '',
            schoolId: d.schoolId || '',
            schoolName: d.schoolName || '',
            isClassAssigned,
            dateAdded: d.timestamp?.toDate ? d.timestamp.toDate().toISOString() : (d.assignedAt?.toDate ? d.assignedAt.toDate().toISOString() : (d.dateAdded || d.createdAt || '')),
            tags: d.tags || ['Study Material'],
            content: d.content
          });
        });

        dbItems = Array.from(seenMap.values());
      } else {
        // Parent or general visitor
        let learnerIds = [sDocId, currentUid].filter(Boolean);
        if (role === 'parent' && currentUid) {
          try {
            const childSnap = await getDocs(query(collection(db, 'individualStudents'), where('parentId', '==', currentUid)));
            learnerIds = [...new Set([...learnerIds, ...childSnap.docs.map(d => d.id)])];
          } catch {}
        }

        const [resSnap, schoolResSnap, ...personalDocs] = await Promise.all([
          getDocs(collection(db, 'resources')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'schoolResources')).catch(() => ({ docs: [] })),
          ...learnerIds.map(id => getDocs(query(collection(db, 'personalResources'), where('studentId', '==', id))).catch(() => ({ docs: [] })))
        ]);

        const combined = [...resSnap.docs, ...schoolResSnap.docs, ...personalDocs.flatMap((p: any) => p.docs || [])];
        const seenMap = new Map<string, ResourceDocument>();

        combined.forEach(dDoc => {
          const d = dDoc.data();
          if (seenMap.has(dDoc.id)) return;
          seenMap.set(dDoc.id, {
            id: dDoc.id,
            title: d.title || 'Curriculum Resource',
            category: (d.category as any) || 'student',
            subject: d.subject || d.subjectTrack || 'Computer Science & ICT',
            classLevel: d.classLevel || d.gradeLevel || 'All Classes',
            docType: (d.type as any) || (d.docType as any) || 'Lesson Note',
            description: d.description || 'Reference notes, syllabus, or worksheet.',
            fileUrl: d.fileUrl || d.url || '',
            fileSize: d.fileSize || 'PDF Document',
            author: d.author || d.instructor || 'Jaystarbliss Tutors',
            assignedClasses: Array.isArray(d.assignedClasses) ? d.assignedClasses : [],
            classInstructions: d.classInstructions || '',
            schoolId: d.schoolId || '',
            schoolName: d.schoolName || '',
            dateAdded: d.timestamp?.toDate ? d.timestamp.toDate().toISOString() : (d.dateAdded || d.createdAt || ''),
            tags: d.tags || ['Study Material'],
            content: d.content
          });
        });

        dbItems = Array.from(seenMap.values());
      }

      setResources(dbItems);
    } catch (err) {
      console.warn('Could not fetch resources:', err);
      setResources([]);
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    fetchFirestoreResources();
  }, [fetchFirestoreResources]);

  // Handle bookmark toggle
  const toggleBookmark = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setBookmarkedIds(prev => {
      const updated = prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id];
      try {
        localStorage.setItem('jaystarbliss_bookmarked_resources', JSON.stringify(updated));
      } catch (err) {
        console.warn('Failed to save bookmark locally', err);
      }
      return updated;
    });
  };

  // Open Class Assignment Modal for a resource
  const handleOpenAssignModal = (docItem: ResourceDocument, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setAssignModalDoc(docItem);
    setAssignSelectedClasses(docItem.assignedClasses && docItem.assignedClasses.length > 0 ? [...docItem.assignedClasses] : ['All Classes']);
    setAssignInstructions(docItem.classInstructions || '');
    setCustomClassInput('');
  };

  // Toggle class selection inside modal
  const toggleClassSelection = (cls: string) => {
    if (cls === 'All Classes') {
      if (assignSelectedClasses.includes('All Classes')) {
        setAssignSelectedClasses([]);
      } else {
        setAssignSelectedClasses(['All Classes']);
      }
      return;
    }

    setAssignSelectedClasses(prev => {
      const withoutAll = prev.filter(c => c !== 'All Classes');
      if (withoutAll.includes(cls)) {
        const next = withoutAll.filter(c => c !== cls);
        return next.length === 0 ? ['All Classes'] : next;
      } else {
        return [...withoutAll, cls];
      }
    });
  };

  // Add custom class label
  const handleAddCustomClass = (e: React.FormEvent) => {
    e.preventDefault();
    const val = customClassInput.trim();
    if (!val) return;
    if (!assignSelectedClasses.includes(val)) {
      setAssignSelectedClasses(prev => [...prev.filter(c => c !== 'All Classes'), val]);
    }
    setCustomClassInput('');
  };

  // Save Class Assignment to Firestore
  const handleSaveClassAssignment = async () => {
    if (role !== 'school' && !canManageCurriculum) {
      toast.error('Only school administrators, tutors, and the super admin can manage resource assignments.');
      return;
    }
    if (!assignModalDoc) return;
    if (assignSelectedClasses.length === 0) {
      toast.error('Please select at least one target class or choose "All Classes".');
      return;
    }

    setSavingAssignment(true);
    try {
      const activeSchoolId = schoolId || studentInfo.schoolId || 'default_school';
      const activeSchoolName = schoolName || studentInfo.schoolName || 'School Institution';

      // 1. Update in schoolResources collection
      const schoolResRef = doc(db, 'schoolResources', assignModalDoc.id);
      
      const payload = {
        title: assignModalDoc.title,
        description: assignModalDoc.description,
        fileUrl: assignModalDoc.fileUrl || '',
        subject: assignModalDoc.subject,
        docType: assignModalDoc.docType,
        category: 'school',
        schoolId: activeSchoolId,
        schoolName: activeSchoolName,
        assignedClasses: assignSelectedClasses,
        classInstructions: assignInstructions.trim(),
        assignedAt: serverTimestamp(),
        assignedBy: auth.currentUser?.email || 'School Administrator'
      };

      await setDoc(schoolResRef, payload, { merge: true });

      // Automatically dispatch notification to assigned students & classes
      void triggerResourceNotification({
        title: assignModalDoc.title,
        description: assignInstructions.trim() || assignModalDoc.description,
        subject: assignModalDoc.subject,
        assignedClasses: assignSelectedClasses,
        docType: assignModalDoc.docType,
        schoolId: activeSchoolId,
        schoolName: activeSchoolName,
        uploaderName: auth.currentUser?.email || 'School Administrator',
        targetRole: 'student'
      });

      // Optimistically update local state
      setResources(prev => prev.map(item => {
        if (item.id === assignModalDoc.id) {
          return {
            ...item,
            assignedClasses: assignSelectedClasses,
            classInstructions: assignInstructions.trim(),
            schoolId: activeSchoolId,
            schoolName: activeSchoolName
          };
        }
        return item;
      }));

      toast.success(`Lesson "${assignModalDoc.title}" successfully assigned to ${assignSelectedClasses.join(', ')}!`);
      setAssignModalDoc(null);
    } catch (err: any) {
      console.error('Error assigning classes:', err);
      toast.error('Failed to update class assignment: ' + (err?.message || 'Permission denied'));
    } finally {
      setSavingAssignment(false);
    }
  };

  // Upload New School or Tutor Resource
  const handleCreateSchoolResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (role !== 'school' && !canManageCurriculum) {
      toast.error('Only school administrators, tutors, and the super admin can upload learning resources.');
      return;
    }
    if (!uploadForm.title.trim()) {
      toast.error('Please enter a resource title.');
      return;
    }
    const requiresUrl = ['External Link', 'PDF', 'Document', 'Image', 'Video'].includes(uploadForm.docType);
    if (requiresUrl && !uploadForm.fileUrl.trim()) {
      toast.error(`Please provide a valid URL for this ${uploadForm.docType}.`);
      return;
    }
    if (uploadForm.audienceMode === 'PRIVATE_LEARNERS' && uploadForm.targetStudentIds.length === 0) {
      toast.error('Please select at least one private learner to receive this resource.');
      return;
    }

    setUploadSubmitting(true);
    try {
      const selectedSch = authorisedSchools.find((s) => s.id === uploadForm.targetSchoolId);
      const activeSchoolId =
        uploadForm.audienceMode === 'PRIVATE_LEARNERS'
          ? ''
          : uploadForm.targetSchoolId || schoolId || studentInfo.schoolId || 'default_school';
      const activeSchoolName =
        uploadForm.audienceMode === 'PRIVATE_LEARNERS'
          ? 'Private Learners'
          : selectedSch?.name || schoolName || studentInfo.schoolName || 'School Institution';

      if (uploadForm.audienceMode === 'PRIVATE_LEARNERS') {
        for (const studentId of uploadForm.targetStudentIds) {
          await addDoc(collection(db, 'personalResources'), {
            studentId,
            title: uploadForm.title.trim(),
            subject: uploadForm.subject,
            docType: uploadForm.docType,
            type: uploadForm.docType,
            classLevel: 'Private Learner',
            description: uploadForm.description.trim() || 'Targeted learning material.',
            fileUrl: uploadForm.fileUrl.trim(),
            url: uploadForm.fileUrl.trim(),
            classInstructions: uploadForm.classInstructions.trim(),
            category: 'student',
            assignedAt: serverTimestamp(),
            assignedBy: auth.currentUser?.email || 'Tutor',
          });
        }
      } else {
        const newDoc = {
          title: uploadForm.title.trim(),
          subject: uploadForm.subject,
          docType: uploadForm.docType,
          type: uploadForm.docType,
          classLevel: uploadForm.classLevel,
          assignedClasses: uploadForm.assignedClasses,
          description: uploadForm.description.trim() || 'School curriculum lesson material.',
          fileUrl: uploadForm.fileUrl.trim(),
          url: uploadForm.fileUrl.trim(),
          classInstructions: uploadForm.classInstructions.trim(),
          category: 'school',
          schoolId: activeSchoolId,
          schoolName: activeSchoolName,
          assignedAt: serverTimestamp(),
          assignedBy: auth.currentUser?.email || 'Educator',
        };

        await addDoc(collection(db, 'schoolResources'), newDoc);

        void triggerResourceNotification({
          title: uploadForm.title.trim(),
          description: uploadForm.description.trim() || uploadForm.classInstructions.trim(),
          subject: uploadForm.subject,
          classLevel: uploadForm.classLevel,
          assignedClasses: uploadForm.assignedClasses,
          docType: uploadForm.docType,
          schoolId: activeSchoolId,
          schoolName: activeSchoolName,
          uploaderName: auth.currentUser?.email || 'Educator',
          targetRole: 'student',
        });
      }

      toast.success(`Resource "${uploadForm.title}" published & assigned successfully!`);
      setIsUploadModalOpen(false);
      setUploadForm({
        title: '',
        subject: 'Computer Science & ICT',
        docType: 'Lesson Note',
        classLevel: 'All Classes',
        assignedClasses: ['All Classes'],
        audienceMode: 'SCHOOL_CLASS',
        targetSchoolId: '',
        targetStudentIds: [],
        description: '',
        fileUrl: '',
        classInstructions: '',
      });

      fetchFirestoreResources();
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to publish resource: ' + (err?.message || 'Error occurred'));
    } finally {
      setUploadSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <SEO 
        title="Resource Library & Syllabi Hub | Jaystarbliss Studios" 
        description="Search, view and download lesson notes, curriculum syllabi, and coding worksheets for students and school educators."
        noindex={true}
      />

      {/* Compact Action & Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 sm:p-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200">
            <BookOpen size={14} className="text-brand-red" />
            <span>Total Resources:</span>
            <span className="font-mono font-black text-brand-red">{resources.length}</span>
          </div>
          {role === 'student' && studentInfo.studentClass && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-xs font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
              <GraduationCap size={14} />
              <span>Class: {studentInfo.studentClass}</span>
              {studentInfo.schoolName && <span className="opacity-80">• {studentInfo.schoolName}</span>}
            </div>
          )}
        </div>

        {(role === 'school' || canManageCurriculum) && (
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="px-4 py-2.5 bg-brand-red hover:bg-red-700 text-white rounded-xl font-bold text-xs flex items-center gap-2 shadow-xs transition-all cursor-pointer"
          >
            <Plus size={15} />
            <span>{role === 'school' ? 'Upload School Resource' : 'New Lesson Plan'}</span>
          </button>
        )}
      </div>

      {/* Main Results Container (List Format with Filters, Recency & Unread Indicators) */}
      {role === 'student' && studentInfo.hasResources === false ? (
        <div className="p-8 sm:p-12 rounded-3xl bg-slate-900/60 dark:bg-slate-950/80 border border-slate-800 text-center space-y-4 filter grayscale-[30%]">
          <div className="w-16 h-16 rounded-3xl bg-slate-800 text-amber-400 flex items-center justify-center mx-auto border border-slate-700">
            <BookOpen size={28} />
          </div>
          <h2 className="text-xl font-black text-slate-200">
            Resource Library Not Included in Current Track
          </h2>
          <p className="max-w-md mx-auto text-xs text-slate-400 leading-relaxed">
            Your enrolled program track (<strong>{studentInfo.programName || 'Enrolled Track'}</strong>) is configured without access to the general digital resource repository. 
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold">
            <span>🔒 Locked by Institutional Curriculum Settings</span>
          </div>
        </div>
      ) : loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-center">
          <Loader2 className="animate-spin text-brand-red mb-3" size={32} />
          <p className="text-xs text-gray-500 font-medium">Syncing curriculum and school class assignments from Firestore...</p>
        </div>
      ) : (
        <ResourceListView
          resources={resources}
          role={role}
          studentClass={studentInfo.studentClass}
          bookmarkedIds={bookmarkedIds}
          onBookmark={(resId, e) => toggleBookmark(resId, e)}
          onAssign={(res) => {
            const docItem = resources.find(r => r.id === res.id);
            if (docItem) handleOpenAssignModal(docItem);
          }}
          onPreview={(res) => {
            const docItem = resources.find(r => r.id === res.id);
            if (docItem) setPreviewDoc(docItem);
          }}
          showAssignButton={role === 'school' || canManageCurriculum}
          emptyMessage="No curriculum resources found for your enrolled program track. Lessons and study notes uploaded by educators will appear here."
        />
      )}

      {/* ══ ASSIGN RESOURCE TO CLASS MODAL (FOR SCHOOL ADMINISTRATORS) ══ */}
      {assignModalDoc && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-200 dark:border-slate-800 w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Header */}
            <div className="p-6 border-b border-gray-200 dark:border-slate-800 flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-brand-red/10 text-brand-red text-[10px] font-black uppercase tracking-wider mb-2">
                  <Users size={12} />
                  <span>Institutional Class Delivery</span>
                </div>
                <h3 className="text-lg font-black text-gray-900 dark:text-white">
                  Assign Lesson Plan to Classes
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate max-w-md">
                  {assignModalDoc.title}
                </p>
              </div>

              <button
                onClick={() => setAssignModalDoc(null)}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar text-xs">
              
              {/* Resource Meta Box */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase text-slate-400">Subject Track</div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">{assignModalDoc.subject}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase text-slate-400">Doc Type</div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">{assignModalDoc.docType}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase text-slate-400">Default Grade</div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">{assignModalDoc.classLevel}</div>
                </div>
              </div>

              {/* Class Selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <GraduationCap size={15} className="text-brand-red" />
                    <span>Select Target Class(es)</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setAssignSelectedClasses(['All Classes'])}
                      className="text-[11px] font-bold text-sky-600 hover:underline cursor-pointer"
                    >
                      All Classes
                    </button>
                    <span className="text-slate-300 dark:text-slate-700">|</span>
                    <button
                      type="button"
                      onClick={() => setAssignSelectedClasses([])}
                      className="text-[11px] font-bold text-slate-500 hover:underline cursor-pointer"
                    >
                      Clear All
                    </button>
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">
                  Students registered under the selected classes will see this lesson plan in their portal dashboard.
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1 custom-scrollbar">
                  {STANDARD_SCHOOL_CLASSES.map(cls => {
                    const isSelected = assignSelectedClasses.includes(cls);
                    return (
                      <button
                        key={cls}
                        type="button"
                        onClick={() => toggleClassSelection(cls)}
                        className={`p-2 rounded-xl text-left font-semibold text-xs transition-all flex items-center justify-between border cursor-pointer ${
                          isSelected 
                            ? 'bg-brand-red text-white border-brand-red shadow-2xs' 
                            : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                        }`}
                      >
                        <span className="truncate">{cls}</span>
                        {isSelected && <Check size={14} className="shrink-0 ml-1" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Class Name Adder */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Add Custom Class Label (e.g. Basic 4 Diamond, Year 8 Alpha)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customClassInput}
                    onChange={(e) => setCustomClassInput(e.target.value)}
                    placeholder="Enter custom class name..."
                    className="flex-1 px-3 py-2 bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl text-xs text-gray-900 dark:text-white outline-hidden focus:border-brand-red"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomClass}
                    className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                  >
                    Add Class
                  </button>
                </div>
              </div>

              {/* Currently Selected Summary */}
              <div>
                <div className="text-[11px] font-bold text-slate-500 mb-1.5">
                  Selected Classes ({assignSelectedClasses.length}):
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {assignSelectedClasses.map(c => (
                    <span
                      key={c}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-50 dark:bg-red-950/40 text-brand-red border border-red-200 dark:border-red-900/60 font-bold text-xs"
                    >
                      <span>{c}</span>
                      <button
                        type="button"
                        onClick={() => toggleClassSelection(c)}
                        className="hover:text-red-800 cursor-pointer"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Class Instructions / Homework Note */}
              <div>
                <label className="block text-xs font-bold text-slate-900 dark:text-white mb-1.5">
                  Class Instructions &amp; Homework Note (Optional)
                </label>
                <textarea
                  rows={3}
                  value={assignInstructions}
                  onChange={(e) => setAssignInstructions(e.target.value)}
                  placeholder="e.g., Read Sections 1 & 2 and complete the Scratch coding assignment before Thursday's practical lab."
                  className="w-full p-3 bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl text-xs text-gray-900 dark:text-white placeholder-gray-400 outline-hidden focus:border-brand-red resize-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 sm:p-6 border-t border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-950 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setAssignModalDoc(null)}
                className="px-4 py-2.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={savingAssignment}
                onClick={handleSaveClassAssignment}
                className="px-5 py-2.5 bg-brand-red hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-brand-red/20 flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {savingAssignment ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>Saving Assignment...</span>
                  </>
                ) : (
                  <>
                    <Check size={15} />
                    <span>Confirm &amp; Assign to Classes</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ UPLOAD NEW SCHOOL RESOURCE MODAL ══ */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-200 dark:border-slate-800 w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-gray-200 dark:border-slate-800 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-gray-900 dark:text-white">
                  Publish Institutional Lesson Plan
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Upload learning materials and assign them directly to your school classes.
                </p>
              </div>

              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateSchoolResource} className="p-6 overflow-y-auto space-y-4 flex-1 custom-scrollbar text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Resource Title *</label>
                <input
                  required
                  type="text"
                  value={uploadForm.title}
                  onChange={e => setUploadForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g., Introduction to Python Loops & Data Types"
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl text-xs text-gray-900 dark:text-white outline-hidden focus:border-brand-red"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Subject Track</label>
                  <select
                    value={uploadForm.subject}
                    onChange={e => setUploadForm(prev => ({ ...prev, subject: e.target.value }))}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl text-xs text-gray-900 dark:text-white outline-hidden focus:border-brand-red"
                  >
                    {SUBJECTS.filter(s => s !== 'All Subjects').map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Resource Type</label>
                  <select
                    value={uploadForm.docType}
                    onChange={e => setUploadForm(prev => ({ ...prev, docType: e.target.value as any }))}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl text-xs text-gray-900 dark:text-white outline-hidden focus:border-brand-red"
                  >
                    {DOC_TYPES.filter(d => d !== 'All Types').map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {uploadForm.docType === 'External Link'
                    ? 'External Resource URL * (No file upload required)'
                    : uploadForm.docType === 'Image'
                    ? 'Image URL *'
                    : uploadForm.docType === 'Video'
                    ? 'Video / Stream URL *'
                    : uploadForm.docType === 'Lesson Note'
                    ? 'Optional Attachment / Reference URL'
                    : 'Document / PDF URL *'}
                </label>
                <input
                  required={uploadForm.docType !== 'Lesson Note'}
                  type="url"
                  value={uploadForm.fileUrl}
                  onChange={e => setUploadForm(prev => ({ ...prev, fileUrl: e.target.value }))}
                  placeholder="https://..."
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl text-xs text-gray-900 dark:text-white outline-hidden focus:border-brand-red font-mono"
                />
              </div>

              {/* Audience Targeting: School/Class vs Private Learners */}
              {role === 'staff' && (
                <div className="space-y-2 pt-1">
                  <label className="block font-bold text-slate-700 dark:text-slate-300">
                    Authorised Target Audience
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setUploadForm(prev => ({ ...prev, audienceMode: 'SCHOOL_CLASS' }))}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold cursor-pointer ${
                        uploadForm.audienceMode === 'SCHOOL_CLASS'
                          ? 'bg-brand-red text-white border-brand-red'
                          : 'bg-gray-50 dark:bg-slate-950 border-gray-200 dark:border-slate-800'
                      }`}
                    >
                      School &amp; Class
                    </button>
                    <button
                      type="button"
                      onClick={() => setUploadForm(prev => ({ ...prev, audienceMode: 'PRIVATE_LEARNERS' }))}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold cursor-pointer ${
                        uploadForm.audienceMode === 'PRIVATE_LEARNERS'
                          ? 'bg-brand-red text-white border-brand-red'
                          : 'bg-gray-50 dark:bg-slate-950 border-gray-200 dark:border-slate-800'
                      }`}
                    >
                      Private Learner(s)
                    </button>
                  </div>
                </div>
              )}

              {uploadForm.audienceMode === 'PRIVATE_LEARNERS' ? (
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Select Private Learner(s)
                  </label>
                  {privateLearners.length === 0 ? (
                    <p className="text-[11px] text-slate-500">No private learners assigned to your account.</p>
                  ) : (
                    <div className="max-h-32 overflow-y-auto space-y-1.5 p-2 rounded-xl border border-gray-200 dark:border-slate-800">
                      {privateLearners.map(lr => {
                        const checked = uploadForm.targetStudentIds.includes(lr.id);
                        return (
                          <label key={lr.id} className="flex items-center gap-2 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                setUploadForm(prev => ({
                                  ...prev,
                                  targetStudentIds: checked
                                    ? prev.targetStudentIds.filter(id => id !== lr.id)
                                    : [...prev.targetStudentIds, lr.id],
                                }))
                              }
                            />
                            <span className="font-semibold">{lr.name}</span>
                            <span className="text-[10px] text-slate-400">({lr.class})</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {role === 'staff' && authorisedSchools.length > 0 && (
                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Authorised School
                      </label>
                      <select
                        value={uploadForm.targetSchoolId}
                        onChange={e => setUploadForm(prev => ({ ...prev, targetSchoolId: e.target.value }))}
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl text-xs text-gray-900 dark:text-white outline-hidden focus:border-brand-red"
                      >
                        <option value="">All Authorised Schools</option>
                        {authorisedSchools.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className={role === 'staff' && authorisedSchools.length > 0 ? '' : 'sm:col-span-2'}>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Assign to Class</label>
                    <select
                      value={uploadForm.assignedClasses[0] || 'All Classes'}
                      onChange={e => setUploadForm(prev => ({ ...prev, assignedClasses: [e.target.value] }))}
                      className="w-full px-3 py-2 bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl text-xs text-gray-900 dark:text-white outline-hidden focus:border-brand-red"
                    >
                      {STANDARD_SCHOOL_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Description / Lesson Summary</label>
                <textarea
                  rows={2}
                  value={uploadForm.description}
                  onChange={e => setUploadForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Brief summary of topics covered..."
                  className="w-full p-2.5 bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl text-xs text-gray-900 dark:text-white outline-hidden focus:border-brand-red resize-none"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Class Instructions (Optional)</label>
                <textarea
                  rows={2}
                  value={uploadForm.classInstructions}
                  onChange={e => setUploadForm(prev => ({ ...prev, classInstructions: e.target.value }))}
                  placeholder="Notes or prep instructions for students..."
                  className="w-full p-2.5 bg-gray-50 dark:bg-slate-950 border border-gray-200 dark:border-slate-800 rounded-xl text-xs text-gray-900 dark:text-white outline-hidden focus:border-brand-red resize-none"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={uploadSubmitting}
                  className="w-full py-2.5 bg-brand-red hover:bg-red-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md shadow-brand-red/20 cursor-pointer disabled:opacity-50"
                >
                  {uploadSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                  <span>Publish &amp; Assign Resource</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══ INTERACTIVE DOCUMENT READER MODAL ══ */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-gray-200 dark:border-slate-800 w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-200 dark:border-slate-800 flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${getDocTypeBadge(previewDoc.docType)}`}>
                    {previewDoc.docType}
                  </span>
                  <span className="text-xs font-semibold text-gray-500">
                    {previewDoc.classLevel}
                  </span>
                  {previewDoc.assignedClasses && previewDoc.assignedClasses.length > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold border border-emerald-200 dark:border-emerald-800/60">
                      Assigned: {previewDoc.assignedClasses.join(', ')}
                    </span>
                  )}
                </div>
                <h2 className="text-lg sm:text-xl font-black text-gray-900 dark:text-white">
                  {previewDoc.title}
                </h2>
              </div>

              <button
                onClick={() => setPreviewDoc(null)}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs sm:text-sm custom-scrollbar">
              {previewDoc.classInstructions && (
                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider text-amber-700 dark:text-amber-400">
                    <BookOpen size={14} /> Class Instructions from School
                  </div>
                  <p className="text-xs leading-relaxed">{previewDoc.classInstructions}</p>
                </div>
              )}

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1.5">Overview</h4>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                  {previewDoc.content?.overview || previewDoc.description}
                </p>
              </div>

              {previewDoc.content?.learningObjectives && previewDoc.content.learningObjectives.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Key Objectives</h4>
                  <ul className="space-y-2">
                    {previewDoc.content.learningObjectives.map((obj, i) => (
                      <li key={i} className="flex items-start gap-2 text-gray-700 dark:text-gray-300">
                        <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                        <span>{obj}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {previewDoc.content?.keyConcepts && previewDoc.content.keyConcepts.length > 0 && (
                <div className="space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">Core Curriculum Modules</h4>
                  {previewDoc.content.keyConcepts.map((concept, i) => (
                    <div key={i} className="p-4 bg-gray-50 dark:bg-slate-950 rounded-2xl border border-gray-200/80 dark:border-slate-800/80 space-y-2">
                      <h5 className="font-bold text-gray-900 dark:text-white">{concept.heading}</h5>
                      <p className="text-gray-600 dark:text-gray-400 text-xs leading-relaxed">{concept.detail}</p>
                      {concept.codeSnippet && (
                        <pre className="p-3 bg-slate-900 text-emerald-400 rounded-xl font-mono text-[11px] overflow-x-auto">
                          {concept.codeSnippet}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {previewDoc.content?.practiceExercises && previewDoc.content.practiceExercises.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Hands-on Exercises</h4>
                  <div className="space-y-2">
                    {previewDoc.content.practiceExercises.map((ex, i) => (
                      <div key={i} className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-50/50 dark:bg-blue-950/20 text-blue-900 dark:text-blue-200 border border-blue-100 dark:border-blue-900/40">
                        <Terminal size={15} className="text-blue-600 shrink-0 mt-0.5" />
                        <span className="text-xs">{ex}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:p-6 border-t border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-950 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>Subject: <strong className="text-gray-700 dark:text-gray-300">{previewDoc.subject}</strong></span>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex-1 sm:flex-none px-4 py-2.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-xs font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-100 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Printer size={14} /> Print Document
                </button>
                {previewDoc.fileUrl && (
                  <a
                    href={previewDoc.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 sm:flex-none px-4 py-2.5 bg-brand-red hover:bg-red-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2"
                  >
                    <Download size={14} /> Download File
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResourceLibrary;
