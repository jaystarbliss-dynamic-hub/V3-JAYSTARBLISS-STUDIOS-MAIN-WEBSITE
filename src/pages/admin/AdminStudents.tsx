import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  collection, deleteDoc, doc, getDocs, setDoc, addDoc, updateDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { db, auth, getStandbyFirestore } from '../../lib/firebase';
import { useToast } from '../../contexts/ToastContext';
import { startImpersonation } from '../../utils/impersonation';
import { 
  Users, UserPlus, Search, KeyRound, Copy, CheckCircle2, 
  Trash2, Send, RefreshCw, ShieldCheck, X, School, 
  GraduationCap, UserCheck, Download, Link as LinkIcon,
  Filter, ChevronDown, Plus, Settings, ChevronRight
} from 'lucide-react';
import { resolveRealName, formatTutorDropdownLabel } from '../../utils/userNames';
import { CANONICAL_CLASSES, formatNormalizedClassDisplay, normalizeClassName } from '../../lib/classes';
import { migrateAllFirestoreClasses } from '../../lib/classMigration';

export interface AssignedStudentTutor {
  tutorId: string;
  tutorName: string;
  tutorEmail?: string;
  role?: string;
  trackOrSubject?: string;
}

export interface UnifiedStudent {
  id: string;
  docSource: 'individualStudents' | 'students' | 'users';
  fullName: string;
  username: string;
  email: string;
  class: string;
  grade: string;
  track: string;
  subjects: string;
  schoolId: string;
  schoolName: string;
  parentId: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  tutorId: string;
  tutorName: string;
  tutorEmail: string;
  assignedTutors?: AssignedStudentTutor[];
  accountStatus: string;
  accessCode: string;
  accessCodeHash?: string;
  portalAccessEnabled: boolean;
  studentType: 'personal' | 'parent' | 'school';
  createdAt?: any;
  firebaseUid?: string;
}

interface Dispatch {
  id: string;
  collectionName: string;
  kind: 'resource' | 'link';
  studentId?: string;
  title?: string;
  description?: string;
  url?: string;
  fileUrl?: string;
  timestamp?: any;
}

interface Credentials {
  username: string;
  accessCode: string;
  portal: string;
  fullName: string;
  email?: string;
}


const AdminStudents: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Data State
  const [students, setStudents] = useState<UnifiedStudent[]>([]);
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [tutors, setTutors] = useState<{ id: string; name: string; email: string }[]>([]);
  const [parents, setParents] = useState<{ id: string; name: string; email: string; phone?: string }[]>([]);
  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'personal' | 'parent' | 'school'>('all');
  const [schoolFilter, setSchoolFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [tutorFilter, setTutorFilter] = useState('all');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [selectedSchoolView, setSelectedSchoolView] = useState<string | null>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) {
        setIsFilterOpen(false);
      }
    };
    if (isFilterOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isFilterOpen]);

  // Modals & Drawers
  const [showCreate, setShowCreate] = useState(false);
  const [managingStudent, setManagingStudent] = useState<UnifiedStudent | null>(null);
  const [inspectedStudent, setInspectedStudent] = useState<UnifiedStudent | null>(null);
  const [showResourceModal, setShowResourceModal] = useState(false);
  const [showSchoolExplorer, setShowSchoolExplorer] = useState(false);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [assigningTutorStudent, setAssigningTutorStudent] = useState<UnifiedStudent | null>(null);
  const [selectedTutorsList, setSelectedTutorsList] = useState<AssignedStudentTutor[]>([]);
  const [newMentorDraft, setNewMentorDraft] = useState({
    tutorId: '',
    role: 'Lead Mentor',
    trackOrSubject: ''
  });

  // Forms
  const [form, setForm] = useState({
    studentType: 'personal' as 'personal' | 'parent' | 'school',
    fullName: '',
    username: '',
    email: '',
    className: 'Grade 1',
    track: 'Technology & Hardware & Electronics Foundation',
    subjects: 'Coding, Mathematics, Hardware & Electronics',
    schoolId: '',
    parentId: '',
    tutorId: '',
    accessCode: ''
  });

  const [resourceForm, setResourceForm] = useState({
    studentId: '',
    type: 'resource' as 'resource' | 'link',
    title: '',
    url: '',
    description: ''
  });
  const [sendingResource, setSendingResource] = useState(false);

  // Get Auth Token for backend helper calls
  const getAuthToken = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) throw new Error('Your administrator session has expired.');
    return await user.getIdToken();
  }, []);

  // Main Unified Student Data Loader - Authoritative direct Firestore query
  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      void migrateAllFirestoreClasses().catch(() => undefined);
      // 1. Fetch from Firestore collections directly
      const [
        studentsSnap,
        individualStudentsSnap,
        usersSnap,
        schoolsSnap,
        parentsSnap,
        tutorsSnap,
        staffSnap,
        resSnap,
        linkSnap
      ] = await Promise.all([
        getDocs(collection(db, 'students')).catch((err) => { console.warn('Fetch students collection error:', err); return { docs: [] }; }),
        getDocs(collection(db, 'individualStudents')).catch((err) => { console.warn('Fetch individualStudents collection error:', err); return { docs: [] }; }),
        getDocs(collection(db, 'users')).catch((err) => { console.warn('Fetch users collection error:', err); return { docs: [] }; }),
        getDocs(collection(db, 'schools')).catch(() => ({ docs: [] })),
        getDocs(collection(db, 'parents')).catch(() => ({ docs: [] })),
        getDocs(collection(db, 'tutors')).catch(() => ({ docs: [] })),
        getDocs(collection(db, 'staff')).catch(() => ({ docs: [] })),
        getDocs(collection(db, 'personalResources')).catch(() => ({ docs: [] })),
        getDocs(collection(db, 'personalLinks')).catch(() => ({ docs: [] })),
      ]);

      const schoolMap = new Map<string, string>();
      const loadedSchools: { id: string; name: string }[] = [];
      schoolsSnap.docs.forEach((d: any) => {
        const data = d.data();
        const name = data.name || data.schoolName || d.id;
        schoolMap.set(d.id, name);
        if (!loadedSchools.some(s => s.id === d.id)) loadedSchools.push({ id: d.id, name });
      });
      setSchools(loadedSchools);

      const tutorMap = new Map<string, { id: string; name: string; email: string }>();

      // Load from tutors collection
      tutorsSnap.docs?.forEach((d: any) => {
        const data = d.data();
        const email = (data.email || '').toLowerCase().trim();
        const resolvedName = resolveRealName(data, email);
        const tObj = { id: d.id, name: resolvedName, email: data.email || '' };
        tutorMap.set(d.id, tObj);
        if (email) tutorMap.set(email, tObj);
      });

      // Load from staff collection
      staffSnap.docs?.forEach((d: any) => {
        const data = d.data();
        const email = (data.email || '').toLowerCase().trim();
        const resolvedName = resolveRealName(data, email);
        const tObj = { id: d.id, name: resolvedName, email: data.email || '' };
        if (!tutorMap.has(d.id)) tutorMap.set(d.id, tObj);
        if (email && !tutorMap.has(email)) tutorMap.set(email, tObj);
      });

      const loadedParents: { id: string; name: string; email: string; phone?: string }[] = [];
      const parentMap = new Map<string, { id: string; name: string; email: string; phone?: string }>();

      usersSnap.docs.forEach((d: any) => {
        const u = d.data();
        const role = String(u.role || '').toUpperCase();
        const email = (u.email || '').toLowerCase().trim();
        const resolvedName = resolveRealName(u, email, role === 'PARENT' ? 'Parent' : 'Instructor');

        if (['STAFF', 'TUTOR', 'INSTRUCTOR', 'TEACHER'].includes(role)) {
          const tObj = { id: d.id, name: resolvedName, email: u.email || '' };
          if (!tutorMap.has(d.id)) tutorMap.set(d.id, tObj);
          if (email && !tutorMap.has(email)) tutorMap.set(email, tObj);
        }
        if (['PARENT', 'GUARDIAN'].includes(role)) {
          const pObj = { id: d.id, name: resolvedName, email: u.email || '', phone: u.phone || u.phoneNumber };
          loadedParents.push(pObj);
          parentMap.set(d.id, pObj);
          if (email) parentMap.set(email, pObj);
        }
      });

      parentsSnap.docs.forEach((d: any) => {
        const p = d.data();
        const email = (p.email || '').toLowerCase().trim();
        const resolvedName = resolveRealName(p, email, 'Parent');
        const pObj = { id: d.id, name: resolvedName, email: p.email || '', phone: p.phone || p.phoneNumber };
        if (!parentMap.has(d.id)) {
          loadedParents.push(pObj);
          parentMap.set(d.id, pObj);
        }
      });

      // Deduplicate tutors by ID and sort alphabetically by Real Name
      const uniqueTutors = Array.from(
        new Map(Array.from(tutorMap.values()).map(t => [t.id, t])).values()
      ).sort((a, b) => a.name.localeCompare(b.name));

      setTutors(uniqueTutors);
      setParents(loadedParents);

      const mergedDispatches: Dispatch[] = [];
      resSnap.docs.forEach((item: any) => mergedDispatches.push({ id: item.id, collectionName: 'personalResources', kind: 'resource', ...item.data() }));
      linkSnap.docs.forEach((item: any) => mergedDispatches.push({ id: item.id, collectionName: 'personalLinks', kind: 'link', ...item.data() }));
      mergedDispatches.sort((a, b) => (b.timestamp?.toDate?.() || 0) - (a.timestamp?.toDate?.() || 0));
      setDispatches(mergedDispatches);

      // Aggregate all student records
      const studentMap = new Map<string, UnifiedStudent>();

      const normalizeStudent = (d: any, defaultSource: 'individualStudents' | 'students' | 'users'): UnifiedStudent => {
        const data = d.data ? d.data() : d;
        const id = d.id || data.id || `student_${Math.random().toString(36).slice(2, 8)}`;
        const schoolId = data.schoolId || data.school_id || '';
        const parentId = data.parentId || data.parentUid || data.parent_id || '';
        const tutorId = data.tutorId || data.assignedTutorId || data.assignedStaffId || data.staffId || '';

        const sName = data.schoolName || (schoolId ? schoolMap.get(schoolId) : '') || '';
        const pObj = parentId ? parentMap.get(parentId) : undefined;
        const pName = data.parentName || data.guardianName || pObj?.name || '';
        const pEmail = data.parentEmail || data.guardianEmail || pObj?.email || '';
        const pPhone = data.parentPhone || data.guardianPhone || data.phone || pObj?.phone || '';
        const tObj = tutorId ? tutorMap.get(tutorId) : undefined;
        const tName = data.tutorName || data.assignedTutorName || data.staffName || tObj?.name || '';
        const tEmail = data.tutorEmail || tObj?.email || '';

        let studentType: 'personal' | 'parent' | 'school' = 'personal';
        if (data.studentType === 'school' || schoolId) {
          studentType = 'school';
        } else if (data.studentType === 'parent' || parentId || pName || pEmail) {
          studentType = 'parent';
        } else if (data.studentType === 'personal') {
          studentType = 'personal';
        }

        const subjectsStr = Array.isArray(data.subjects)
          ? data.subjects.join(', ')
          : (data.subjects || data.track || data.course || '');

        const canonicalClass = formatNormalizedClassDisplay(
          data.class || data.className || data.grade || data.classLevel || data.studentAge,
          'Grade 1'
        );

        return {
          id,
          docSource: defaultSource,
          fullName: data.fullName || data.studentName || data.name || data.displayName || 'Student',
          username: data.username || data.studentUsername || (data.email ? data.email.split('@')[0] : `student_${id.slice(-4)}`),
          email: data.email || data.studentEmail || '',
          class: canonicalClass,
          grade: canonicalClass,
          track: data.track || data.learningTrack || data.program || data.course || '',
          subjects: subjectsStr,
          schoolId,
          schoolName: sName,
          parentId,
          parentName: pName,
          parentEmail: pEmail,
          parentPhone: pPhone,
          tutorId,
          tutorName: tName,
          tutorEmail: tEmail,
          assignedTutors: Array.isArray(data.assignedTutors) ? data.assignedTutors : (tutorId ? [{ tutorId, tutorName: tName, tutorEmail: tEmail }] : []),
          accountStatus: String(data.accountStatus || data.status || 'ACTIVE').toUpperCase(),
          accessCode: data.accessCode || data.passcode || data.code || '',
          accessCodeHash: data.accessCodeHash,
          portalAccessEnabled: data.portalAccessEnabled !== false && data.status !== 'SUSPENDED' && data.accountStatus !== 'SUSPENDED',
          studentType,
          createdAt: data.createdAt || data.timestamp || null,
          firebaseUid: data.firebaseUid || data.userId || (defaultSource === 'users' ? id : undefined)
        };
      };

      const normStr = (v: unknown) => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const findMatchingStudentKey = (candidate: UnifiedStudent, rawDocId: string, rawData: any): string | null => {
        if (studentMap.has(rawDocId)) return rawDocId;
        const sDocId = String(rawData?.studentDocId || rawData?.studentId || '').trim();
        if (sDocId && studentMap.has(sDocId)) return sDocId;

        const cUid = String(candidate.firebaseUid || rawData?.firebaseUid || rawData?.userId || '').trim();
        const cUname = normStr(rawData?.username || rawData?.studentUsername || '');
        const cEmail = normStr(candidate.email);
        const cName = normStr(rawData?.fullName || rawData?.studentName || rawData?.name || rawData?.displayName || '');
        const cSchool = normStr(candidate.schoolId);

        for (const [key, s] of studentMap.entries()) {
          if (cUid && (s.firebaseUid === cUid || key === cUid)) return key;
          if (sDocId && s.id === sDocId) return key;
          if (cUname && normStr(s.username) === cUname) return key;
          if (cEmail && normStr(s.email) === cEmail) return key;
          if (cName && cName !== 'student' && normStr(s.fullName) === cName) {
            if (!cSchool || !normStr(s.schoolId) || normStr(s.schoolId) === cSchool) {
              return key;
            }
          }
        }
        return null;
      };

      // 1. Process `students` collection
      studentsSnap.docs.forEach((d: any) => {
        const raw = d.data() || {};
        const hasIdentity = Boolean(raw.fullName || raw.studentName || raw.name || raw.username);
        if (!hasIdentity) return;
        const student = normalizeStudent(d, 'students');
        const existingKey = findMatchingStudentKey(student, d.id, raw);
        if (existingKey) {
          const prev = studentMap.get(existingKey)!;
          studentMap.set(existingKey, {
            ...student,
            ...prev,
            id: existingKey,
            firebaseUid: prev.firebaseUid || student.firebaseUid,
            accessCode: prev.accessCode || student.accessCode,
          });
        } else {
          studentMap.set(d.id, student);
        }
      });

      // 2. Process `individualStudents` collection
      individualStudentsSnap.docs.forEach((d: any) => {
        const raw = d.data() || {};
        const hasIdentity = Boolean(raw.fullName || raw.studentName || raw.name || raw.username);
        if (!hasIdentity) return;
        const student = normalizeStudent(d, 'individualStudents');
        const existingKey = findMatchingStudentKey(student, d.id, raw);
        if (existingKey) {
          const prev = studentMap.get(existingKey)!;
          studentMap.set(existingKey, {
            ...prev,
            ...student,
            id: existingKey,
            firebaseUid: student.firebaseUid || prev.firebaseUid,
            accessCode: student.accessCode || prev.accessCode,
            email: student.email || prev.email,
          });
        } else {
          studentMap.set(d.id, student);
        }
      });

      // 3. Process `users` collection for student roles
      usersSnap.docs.forEach((d: any) => {
        const u = d.data() || {};
        const role = String(u.role || '').toUpperCase();
        if (role === 'STUDENT' || role === 'CADET' || u.isStudent || u.studentProfile) {
          const student = normalizeStudent(d, 'users');
          const existingKey = findMatchingStudentKey(student, d.id, u);
          if (existingKey) {
            const prev = studentMap.get(existingKey)!;
            studentMap.set(existingKey, {
              ...prev,
              firebaseUid: d.id,
              email: prev.email || student.email,
              schoolId: prev.schoolId || student.schoolId,
              schoolName: prev.schoolName || student.schoolName,
            });
          } else if (u.fullName || u.studentName || u.name || u.username) {
            studentMap.set(d.id, student);
          }
        }
      });

      // 4. Process parent enrolled children if present (only when not already represented in studentMap)
      parentsSnap.docs.forEach((d: any) => {
        const p = d.data() || {};
        if (Array.isArray(p.children)) {
          p.children.forEach((child: any, idx: number) => {
            const childName = String(child.name || child.fullName || '').trim();
            if (!childName) return;
            const childId = child.id || `${d.id}_child_${idx}`;
            const draftChild: UnifiedStudent = {
              id: childId,
              docSource: 'students',
              fullName: childName,
              username: child.username || (child.email ? child.email.split('@')[0] : `child_${idx + 1}`),
              email: child.email || '',
              class: formatNormalizedClassDisplay(child.class || child.grade, 'Grade 1'),
              grade: formatNormalizedClassDisplay(child.grade || child.class, 'Grade 1'),
              track: child.track || child.program || '',
              subjects: Array.isArray(child.subjects) ? child.subjects.join(', ') : (child.subjects || 'Coding, Mathematics'),
              schoolId: child.schoolId || '',
              schoolName: child.schoolName || '',
              parentId: d.id,
              parentName: p.name || p.fullName || '',
              parentEmail: p.email || '',
              parentPhone: p.phone || '',
              tutorId: child.tutorId || '',
              tutorName: child.tutorName || '',
              tutorEmail: child.tutorEmail || '',
              accountStatus: 'ACTIVE',
              accessCode: child.accessCode || '',
              portalAccessEnabled: true,
              studentType: 'parent',
              createdAt: child.createdAt || p.createdAt || null
            };
            const existingKey = findMatchingStudentKey(draftChild, childId, child);
            if (existingKey) {
              const prev = studentMap.get(existingKey)!;
              studentMap.set(existingKey, {
                ...prev,
                parentId: prev.parentId || d.id,
                parentName: prev.parentName || p.name || p.fullName || '',
                parentEmail: prev.parentEmail || p.email || '',
                parentPhone: prev.parentPhone || p.phone || '',
              });
            } else {
              studentMap.set(childId, draftChild);
            }
          });
        }
      });

      const aggregatedList = Array.from(studentMap.values());
      aggregatedList.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
        if (timeA !== timeB) return timeB - timeA;
        return a.fullName.localeCompare(b.fullName);
      });

      setStudents(aggregatedList);
    } catch (error) {
      console.error('Unified student operations load error:', error);
      toast.error(error instanceof Error ? error.message : 'Unable to synchronize student directory.');
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadAllData();
  }, [loadAllData]);

  const schoolGroups = useMemo(() => {
    const map = new Map<string, { id: string; name: string; students: UnifiedStudent[] }>();
    schools.forEach(s => map.set(s.id, { id: s.id, name: s.name, students: [] }));
    students.filter(s => s.studentType === 'school' && s.schoolId).forEach(s => {
      const existing = map.get(s.schoolId);
      if (existing) existing.students.push(s);
      else map.set(s.schoolId, { id: s.schoolId, name: s.schoolName || s.schoolId, students: [s] });
    });
    return Array.from(map.values()).filter(s => s.students.length > 0).sort((a,b) => a.name.localeCompare(b.name));
  }, [schools, students]);

  const privateStudents = useMemo(() => students.filter(s => s.studentType === 'personal' || s.studentType === 'parent'), [students]);

  // Multi-Criteria Filtering
  const filteredStudents = useMemo(() => {
    return students.filter(student => {
      // Type Filter
      if (typeFilter !== 'all' && student.studentType !== typeFilter) {
        return false;
      }

      // School Filter
      if (schoolFilter !== 'all') {
        if (student.schoolId !== schoolFilter) return false;
      }

      // Status Filter
      if (statusFilter !== 'all') {
        const isSuspended = ['SUSPENDED', 'BANNED', 'DISABLED'].includes(student.accountStatus.toUpperCase());
        if (statusFilter === 'active' && isSuspended) return false;
        if (statusFilter === 'suspended' && !isSuspended) return false;
      }

      // Tutor Filter
      if (tutorFilter !== 'all') {
        if (tutorFilter === 'unassigned' && student.tutorId) return false;
        if (tutorFilter === 'assigned' && !student.tutorId) return false;
        if (tutorFilter !== 'assigned' && tutorFilter !== 'unassigned' && student.tutorId !== tutorFilter) return false;
      }

      // Search Query
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const matches = [
          student.fullName,
          student.username,
          student.email,
          student.class,
          student.grade,
          student.track,
          student.schoolName,
          student.parentName,
          student.parentEmail,
          student.tutorName,
          student.subjects
        ].some(val => String(val || '').toLowerCase().includes(q));
        if (!matches) return false;
      }

      return true;
    });
  }, [students, typeFilter, schoolFilter, statusFilter, tutorFilter, search]);

  // Statistics Counts
  const stats = useMemo(() => {
    return {
      total: students.length,
      personal: students.filter(s => s.studentType === 'personal').length,
      parent: students.filter(s => s.studentType === 'parent').length,
      school: students.filter(s => s.studentType === 'school').length,
      active: students.filter(s => !['SUSPENDED', 'BANNED', 'DISABLED'].includes(s.accountStatus.toUpperCase())).length
    };
  }, [students]);

  // Action: Create / Onboard Student
  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim() || !form.username.trim()) {
      toast.error('Student full name and username are required.');
      return;
    }

    setSaving(true);
    try {
      const subjectsArray = form.subjects.split(',').map(s => s.trim()).filter(Boolean);
      const cleanUsername = form.username.trim().toLowerCase().replace(/\s+/g, '');
      const generatedCode = form.accessCode.trim().toUpperCase() || `CADET-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

      // 1. Try server backend endpoint if available
      try {
        const idToken = await getAuthToken();
        const resp = await fetch('/api/admin-student-onboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({
            fullName: form.fullName.trim(),
            username: cleanUsername,
            email: form.email.trim() || undefined,
            class: normalizeClassName(form.className, 'Grade 1'),
            track: form.track.trim() || '',
            subjects: subjectsArray,
            schoolId: form.studentType === 'school' ? form.schoolId : undefined,
            parentId: form.studentType === 'parent' ? form.parentId : undefined,
            tutorId: form.tutorId || undefined,
            accessCode: generatedCode
          })
        });

        if (resp.ok) {
          const result = await resp.json();
          setCredentials({
            fullName: result.student.fullName,
            username: result.credentials.username,
            accessCode: result.credentials.accessCode,
            portal: result.credentials.portal || '/portal/student',
            email: form.email.trim()
          });
          toast.success('Student onboarded with official portal access pack!');
          setShowCreate(false);
          resetForm();
          await loadAllData();
          return;
        }
      } catch (backendErr) {
        console.warn('Backend student onboard fallback to Firestore client write:', backendErr);
      }

      // 2. Client-side Firestore creation
      const studentDocRef = doc(collection(db, 'individualStudents'));
      const now = new Date();
      const schoolObj = schools.find(s => s.id === form.schoolId);
      const parentObj = parents.find(p => p.id === form.parentId);
      const tutorObj = tutors.find(t => t.id === form.tutorId);

      let accessCodeHash = '';
      try {
        const msgBuffer = new TextEncoder().encode(generatedCode.toUpperCase());
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        accessCodeHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
      } catch {
        accessCodeHash = generatedCode.toLowerCase();
      }

      const canonicalStudentClass = normalizeClassName(form.className, 'Grade 1');
      const payload = {
        fullName: form.fullName.trim(),
        studentName: form.fullName.trim(),
        username: cleanUsername,
        email: form.email.trim() || null,
        class: canonicalStudentClass,
        grade: canonicalStudentClass,
        track: form.track.trim() || 'Technology & Coding',
        subjects: subjectsArray,
        schoolId: form.studentType === 'school' ? form.schoolId : null,
        schoolName: form.studentType === 'school' ? (schoolObj?.name || form.schoolId) : null,
        parentId: form.studentType === 'parent' ? form.parentId : null,
        parentName: form.studentType === 'parent' ? (parentObj?.name || null) : null,
        parentEmail: form.studentType === 'parent' ? (parentObj?.email || null) : null,
        tutorId: form.tutorId || null,
        tutorName: tutorObj?.name || null,
        tutorEmail: tutorObj?.email || null,
        assignedTutorId: form.tutorId || null,
        assignedStaffId: form.tutorId || null,
        accessCode: generatedCode,
        passcode: generatedCode,
        code: generatedCode,
        accessCodeHash,
        portalAccessEnabled: true,
        accountStatus: 'ACTIVE',
        status: 'ACTIVE',
        source: form.studentType === 'school' ? 'school_onboarding' : form.studentType === 'parent' ? 'parent_enrollment' : 'admin_direct',
        createdAt: now,
        updatedAt: now
      };

      const standbyDb = getStandbyFirestore();
      const userDocPayload = {
        uid: studentDocRef.id,
        studentDocId: studentDocRef.id,
        name: form.fullName.trim(),
        fullName: form.fullName.trim(),
        username: cleanUsername,
        role: 'STUDENT',
        schoolId: form.studentType === 'school' ? form.schoolId : null,
        schoolName: form.studentType === 'school' ? (schoolObj?.name || form.schoolId) : null,
        class: canonicalStudentClass,
        grade: canonicalStudentClass,
        accessCode: generatedCode,
        accessCodeHash,
        portalAccessEnabled: true,
        accountStatus: 'ACTIVE',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now
      };
      await Promise.all([
        setDoc(studentDocRef, payload, { merge: true }),
        setDoc(doc(db, 'students', studentDocRef.id), payload, { merge: true }),
        setDoc(doc(db, 'users', studentDocRef.id), userDocPayload, { merge: true }),
        setDoc(doc(standbyDb, 'individualStudents', studentDocRef.id), payload, { merge: true }).catch(() => null),
        setDoc(doc(standbyDb, 'students', studentDocRef.id), payload, { merge: true }).catch(() => null),
        setDoc(doc(standbyDb, 'users', studentDocRef.id), userDocPayload, { merge: true }).catch(() => null),
      ]);

      setCredentials({
        fullName: form.fullName.trim(),
        username: cleanUsername,
        accessCode: generatedCode,
        portal: '/portal/student',
        email: form.email.trim()
      });

      toast.success(`Student "${form.fullName}" added successfully.`);
      setShowCreate(false);
      resetForm();
      await loadAllData();
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to create student: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setForm({
      studentType: 'personal',
      fullName: '',
      username: '',
      email: '',
      className: 'Grade 1',
      track: 'Technology & Hardware & Electronics Foundation',
      subjects: 'Coding, Mathematics, Hardware & Electronics',
      schoolId: '',
      parentId: '',
      tutorId: '',
      accessCode: ''
    });
  };

  // Action: Issue / Re-issue Access Pack
  const issueCredentials = async (student: UnifiedStudent) => {
    setSaving(true);
    try {
      const generatedCode = `CADET-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;
      
      let accessCodeHash = '';
      try {
        const msgBuffer = new TextEncoder().encode(generatedCode.toUpperCase());
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        accessCodeHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
      } catch {
        accessCodeHash = generatedCode.toLowerCase();
      }

      const updatePayload = {
        accessCode: generatedCode,
        passcode: generatedCode,
        code: generatedCode,
        accessCodeHash,
        portalAccessEnabled: true,
        accountStatus: 'ACTIVE',
        status: 'ACTIVE',
        credentialIssuedAt: new Date().toISOString(),
        updatedAt: serverTimestamp()
      };

      const standbyDb = getStandbyFirestore();
      // Update in both students and individualStudents across active and standby databases
      await Promise.all([
        setDoc(doc(db, 'individualStudents', student.id), updatePayload, { merge: true }).catch(() => null),
        setDoc(doc(db, 'students', student.id), updatePayload, { merge: true }).catch(() => null),
        setDoc(doc(standbyDb, 'individualStudents', student.id), updatePayload, { merge: true }).catch(() => null),
        setDoc(doc(standbyDb, 'students', student.id), updatePayload, { merge: true }).catch(() => null),
        ...(student.firebaseUid
          ? [
              setDoc(doc(db, 'users', student.firebaseUid), updatePayload, { merge: true }).catch(() => null),
              setDoc(doc(standbyDb, 'users', student.firebaseUid), updatePayload, { merge: true }).catch(() => null),
            ]
          : []),
      ]);

      setCredentials({
        fullName: student.fullName,
        username: student.username,
        accessCode: generatedCode,
        portal: '/portal',
        email: student.email
      });

      toast.success(`New Access Pack (${generatedCode}) generated for ${student.fullName}!`);
      await loadAllData();
    } catch (err: any) {
      toast.error('Could not generate credentials: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Action: Open Assign Mentor Modal
  const openAssignMentorModal = (student: UnifiedStudent) => {
    setAssigningTutorStudent(student);
    if (Array.isArray(student.assignedTutors) && student.assignedTutors.length > 0) {
      setSelectedTutorsList(student.assignedTutors);
    } else if (student.tutorId) {
      setSelectedTutorsList([{
        tutorId: student.tutorId,
        tutorName: student.tutorName || 'Assigned Mentor',
        tutorEmail: student.tutorEmail || '',
        role: 'Lead Mentor',
        trackOrSubject: student.track || 'General'
      }]);
    } else {
      setSelectedTutorsList([]);
    }
    setNewMentorDraft({ tutorId: '', role: 'Lead Mentor', trackOrSubject: student.track || '' });
  };

  // Helper: Add mentor to list
  const handleAddMentorToStudent = () => {
    if (!newMentorDraft.tutorId) {
      toast.error('Please select a faculty mentor to add.');
      return;
    }
    const foundTutor = tutors.find(t => t.id === newMentorDraft.tutorId);
    if (!foundTutor) return;

    if (selectedTutorsList.some(item => item.tutorId === newMentorDraft.tutorId)) {
      toast.error('This mentor is already in the assigned list.');
      return;
    }

    const newMentorEntry: AssignedStudentTutor = {
      tutorId: foundTutor.id,
      tutorName: foundTutor.name,
      tutorEmail: foundTutor.email,
      role: newMentorDraft.role || 'Lead Mentor',
      trackOrSubject: newMentorDraft.trackOrSubject || assigningTutorStudent?.track || ''
    };

    setSelectedTutorsList([...selectedTutorsList, newMentorEntry]);
    setNewMentorDraft({ tutorId: '', role: 'Lead Mentor', trackOrSubject: '' });
  };

  // Helper: Remove mentor from list
  const handleRemoveMentorFromStudent = (tutorId: string) => {
    setSelectedTutorsList(selectedTutorsList.filter(item => item.tutorId !== tutorId));
  };

  // Action: Save Multi-Tutor Mentorship Assignment
  const handleAssignTutor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assigningTutorStudent) return;
    setSaving(true);
    try {
      const primaryTutor = selectedTutorsList[0] || null;
      const tId = primaryTutor ? primaryTutor.tutorId : null;
      const tName = primaryTutor ? primaryTutor.tutorName : null;
      const tEmail = primaryTutor ? (primaryTutor.tutorEmail || null) : null;

      const collectionTarget = assigningTutorStudent.docSource === 'students' ? 'students' : 'individualStudents';
      await updateDoc(doc(db, collectionTarget, assigningTutorStudent.id), {
        assignedTutors: selectedTutorsList,
        tutorId: tId,
        tutorName: tName,
        tutorEmail: tEmail,
        assignedTutorId: tId,
        assignedStaffId: tId,
        staffId: tId,
        updatedAt: serverTimestamp()
      });

      // Also update user doc if UID exists
      if (assigningTutorStudent.firebaseUid) {
        await updateDoc(doc(db, 'users', assigningTutorStudent.firebaseUid), {
          assignedTutors: selectedTutorsList,
          tutorId: tId,
          tutorName: tName,
          assignedStaffId: tId,
          updatedAt: serverTimestamp()
        }).catch(() => undefined);
      }

      toast.success(
        selectedTutorsList.length > 0 
          ? `Assigned ${selectedTutorsList.length} mentor(s) to ${assigningTutorStudent.fullName}.` 
          : `Unassigned mentors from ${assigningTutorStudent.fullName}.`
      );
      setAssigningTutorStudent(null);
      setSelectedTutorsList([]);
      await loadAllData();
    } catch (err: any) {
      toast.error('Failed to assign mentors: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Action: Toggle Status (Active / Suspended)
  const toggleStudentStatus = async (student: UnifiedStudent) => {
    const isSuspended = ['SUSPENDED', 'BANNED', 'DISABLED'].includes(student.accountStatus.toUpperCase());
    const nextStatus = isSuspended ? 'ACTIVE' : 'SUSPENDED';

    if (!window.confirm(`Are you sure you want to change ${student.fullName}'s status to ${nextStatus}?`)) return;

    try {
      const collectionTarget = student.docSource === 'students' ? 'students' : 'individualStudents';
      await updateDoc(doc(db, collectionTarget, student.id), {
        accountStatus: nextStatus,
        status: nextStatus,
        portalAccessEnabled: nextStatus === 'ACTIVE',
        updatedAt: serverTimestamp()
      });

      if (student.firebaseUid) {
        await updateDoc(doc(db, 'users', student.firebaseUid), {
          accountStatus: nextStatus,
          status: nextStatus,
          portalAccessEnabled: nextStatus === 'ACTIVE',
          updatedAt: serverTimestamp()
        }).catch(() => undefined);
      }

      toast.success(`Account status updated to ${nextStatus}.`);
      await loadAllData();
    } catch (err: any) {
      toast.error('Failed to update status: ' + err.message);
    }
  };

  // Action: Delete Student
  const deleteStudent = async (student: UnifiedStudent) => {
    if (!window.confirm(`Permanently delete ${student.fullName}? This action cannot be undone.`)) return;
    setSaving(true);
    try {
      const collectionTarget = student.docSource === 'students' ? 'students' : 'individualStudents';
      await deleteDoc(doc(db, collectionTarget, student.id));

      if (student.firebaseUid) {
        await deleteDoc(doc(db, 'users', student.firebaseUid)).catch(() => undefined);
      }

      // Cleanup linked dispatches
      const linked = dispatches.filter(item => item.studentId === student.id);
      await Promise.all(linked.map(item => deleteDoc(doc(db, item.collectionName, item.id)).catch(() => undefined)));

      toast.success(`Student record removed.`);
      await loadAllData();
    } catch (err: any) {
      toast.error('Failed to delete student: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Action: Send Personal Resource / Link
  const handleSendResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resourceForm.studentId || !resourceForm.title.trim() || !resourceForm.url.trim()) {
      toast.error('Please select a student and enter a title and URL.');
      return;
    }

    setSendingResource(true);
    try {
      const selectedStudent = students.find(s => s.id === resourceForm.studentId);
      const collectionName = resourceForm.type === 'link' ? 'personalLinks' : 'personalResources';
      const payload: any = {
        studentId: resourceForm.studentId,
        studentName: selectedStudent?.fullName || 'Student',
        title: resourceForm.title.trim(),
        description: resourceForm.description.trim(),
        timestamp: serverTimestamp(),
        createdAt: serverTimestamp()
      };

      if (resourceForm.type === 'link') {
        payload.url = resourceForm.url.trim();
        payload.platform = 'Live Link / Classroom';
      } else {
        payload.fileUrl = resourceForm.url.trim();
        payload.url = resourceForm.url.trim();
      }

      await addDoc(collection(db, collectionName), payload);
      toast.success(`Dispatched ${resourceForm.type} to ${selectedStudent?.fullName || 'student'}!`);
      setResourceForm({ studentId: '', type: 'resource', title: '', url: '', description: '' });
      setShowResourceModal(false);
      await loadAllData();
    } catch (err: any) {
      toast.error('Failed to send resource: ' + err.message);
    } finally {
      setSendingResource(false);
    }
  };

  // Action: Export Roster & Credentials to CSV
  const exportToCSV = () => {
    if (filteredStudents.length === 0) {
      toast.error('No student records to export.');
      return;
    }

    const headers = ['Full Name', 'Class', 'Programme', 'Username', 'Access Code', 'Email', 'Category', 'School', 'Parent Name', 'Parent Email', 'Assigned Mentor', 'Status', 'Portal URL'];
    const rows = filteredStudents.map(s => [
      `"${(s.fullName || '').replace(/"/g, '""')}"`,
      `"${(s.class || 'Grade 1').replace(/"/g, '""')}"`,
      `"${(s.track || 'Digital Literacy').replace(/"/g, '""')}"`,
      `"${(s.username || '').replace(/"/g, '""')}"`,
      `"${((s as any).accessCode || (s as any).passcode || (s as any).code || '').replace(/"/g, '""')}"`,
      `"${(s.email || '').replace(/"/g, '""')}"`,
      `"${(s.studentType || '').toUpperCase()}"`,
      `"${(s.schoolName || s.schoolId || 'None').replace(/"/g, '""')}"`,
      `"${(s.parentName || 'None').replace(/"/g, '""')}"`,
      `"${(s.parentEmail || 'None').replace(/"/g, '""')}"`,
      `"${(s.tutorName || 'Unassigned').replace(/"/g, '""')}"`,
      `"${s.accountStatus || 'ACTIVE'}"`,
      `"${window.location.origin}/portal"`
    ]);

    const csvText = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `jaystarbliss_student_credentials_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Student credentials & roster exported to CSV successfully.');
  };

  const copyToClipboard = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`);
  };

  return (
    <div className="space-y-5">
      {/* Top Command Header & Action Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/90 px-5 py-4 shadow-xs backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-2 w-2 rounded-full bg-brand-red" />
            <span className="text-[10px] font-black uppercase tracking-widest text-brand-red">
              Scholars &amp; Credentials Command Center
            </span>
          </div>
          <h1 className="mt-0.5 text-lg font-black text-slate-900 dark:text-white">
            Unified Student Roster &amp; 360° Inspector
          </h1>
          <p className="text-xs text-slate-500">
            Filter across school-affiliated, parent-enrolled, and personal scholars — inspect credentials, mentors, and dispatches side-by-side.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => loadAllData()}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-3.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-brand-red' : ''} aria-hidden="true" />
            Sync
          </button>

          <button
            type="button"
            onClick={() => setShowSchoolExplorer(prev => !prev)}
            className={`inline-flex min-h-10 items-center gap-2 rounded-xl border px-3.5 text-xs font-bold shadow-2xs transition-all cursor-pointer ${
              showSchoolExplorer
                ? 'border-emerald-600 bg-emerald-600 text-white'
                : 'border-slate-200/80 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200'
            }`}
          >
            <School size={14} />
            Schools ({schoolGroups.length})
          </button>

          <button
            type="button"
            onClick={() => setShowResourceModal(true)}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-brand-red/30 bg-brand-red/5 px-3.5 text-xs font-bold text-brand-red hover:bg-brand-red/10 dark:border-brand-red/40 dark:bg-brand-red/10 cursor-pointer"
          >
            <Send size={14} aria-hidden="true" />
            Dispatch Resource
          </button>

          <button
            type="button"
            onClick={exportToCSV}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200/80 bg-white px-3.5 text-xs font-bold text-slate-700 shadow-2xs hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 cursor-pointer"
          >
            <Download size={14} aria-hidden="true" />
            Export CSV
          </button>

          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-brand-red px-4 text-xs font-bold text-white shadow-md shadow-brand-red/20 hover:bg-red-700 transition-all cursor-pointer"
          >
            <UserPlus size={14} aria-hidden="true" />
            + Add Scholar
          </button>
        </div>
      </div>

      {/* Interactive KPI Filter Strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <button
          type="button"
          onClick={() => { setTypeFilter('all'); setStatusFilter('all'); }}
          className={`text-left rounded-2xl border p-3.5 transition-all cursor-pointer ${
            typeFilter === 'all' && statusFilter === 'all'
              ? 'border-slate-900 bg-slate-900 text-white shadow-md dark:border-white dark:bg-white dark:text-slate-900'
              : 'pro-surface border-slate-200/80 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/80'
          }`}
        >
          <p className={`text-[10px] font-extrabold uppercase tracking-wider ${typeFilter === 'all' && statusFilter === 'all' ? 'text-slate-300 dark:text-slate-600' : 'text-slate-500 dark:text-slate-400'}`}>
            All Scholars
          </p>
          <p className="mt-1 text-2xl font-black">{stats.total}</p>
        </button>

        <button
          type="button"
          onClick={() => setTypeFilter(typeFilter === 'school' ? 'all' : 'school')}
          className={`text-left rounded-2xl border p-3.5 transition-all cursor-pointer ${
            typeFilter === 'school'
              ? 'border-emerald-600 bg-emerald-600 text-white shadow-md'
              : 'pro-surface border-slate-200/80 hover:border-emerald-300 dark:border-slate-800 dark:bg-slate-900/80'
          }`}
        >
          <p className={`text-[10px] font-extrabold uppercase tracking-wider ${typeFilter === 'school' ? 'text-emerald-100' : 'text-emerald-600 dark:text-emerald-400'}`}>
            School Affiliated
          </p>
          <p className={`mt-1 text-2xl font-black ${typeFilter === 'school' ? 'text-white' : 'text-emerald-700 dark:text-emerald-300'}`}>{stats.school}</p>
        </button>

        <button
          type="button"
          onClick={() => setTypeFilter(typeFilter === 'parent' ? 'all' : 'parent')}
          className={`text-left rounded-2xl border p-3.5 transition-all cursor-pointer ${
            typeFilter === 'parent'
              ? 'border-sky-600 bg-sky-600 text-white shadow-md'
              : 'pro-surface border-slate-200/80 hover:border-sky-300 dark:border-slate-800 dark:bg-slate-900/80'
          }`}
        >
          <p className={`text-[10px] font-extrabold uppercase tracking-wider ${typeFilter === 'parent' ? 'text-sky-100' : 'text-sky-600 dark:text-sky-400'}`}>
            Parent Enrolled
          </p>
          <p className={`mt-1 text-2xl font-black ${typeFilter === 'parent' ? 'text-white' : 'text-sky-700 dark:text-sky-300'}`}>{stats.parent}</p>
        </button>

        <button
          type="button"
          onClick={() => setTypeFilter(typeFilter === 'personal' ? 'all' : 'personal')}
          className={`text-left rounded-2xl border p-3.5 transition-all cursor-pointer ${
            typeFilter === 'personal'
              ? 'border-purple-600 bg-purple-600 text-white shadow-md'
              : 'pro-surface border-slate-200/80 hover:border-purple-300 dark:border-slate-800 dark:bg-slate-900/80'
          }`}
        >
          <p className={`text-[10px] font-extrabold uppercase tracking-wider ${typeFilter === 'personal' ? 'text-purple-100' : 'text-purple-600 dark:text-purple-400'}`}>
            Personal / Direct
          </p>
          <p className={`mt-1 text-2xl font-black ${typeFilter === 'personal' ? 'text-white' : 'text-purple-700 dark:text-purple-300'}`}>{stats.personal}</p>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter(statusFilter === 'active' ? 'all' : 'active')}
          className={`col-span-2 md:col-span-1 text-left rounded-2xl border p-3.5 transition-all cursor-pointer ${
            statusFilter === 'active'
              ? 'border-brand-red bg-brand-red text-white shadow-md'
              : 'pro-surface border-slate-200/80 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/80'
          }`}
        >
          <p className={`text-[10px] font-extrabold uppercase tracking-wider ${statusFilter === 'active' ? 'text-red-100' : 'text-emerald-600 dark:text-emerald-400'}`}>
            Active Accounts
          </p>
          <p className={`mt-1 text-2xl font-black ${statusFilter === 'active' ? 'text-white' : 'text-slate-900 dark:text-white'}`}>{stats.active}</p>
        </button>
      </div>

      {/* On-Demand Partner School Explorer Drawer */}
      {showSchoolExplorer && (
        <div className="pro-surface rounded-2xl border border-emerald-200/80 p-5 dark:border-emerald-900/40 dark:bg-slate-900/90 animate-fadeIn">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm font-black text-slate-900 dark:text-white">Partner School &amp; Cohort Explorer</h2>
              <p className="text-xs text-slate-500 mt-0.5">Select any partner school to filter the main directory or inspect its onboarded students.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedSchoolView(selectedSchoolView === "__private__" ? null : "__private__")}
                className="min-h-9 rounded-xl border border-purple-200 bg-purple-50/70 dark:border-purple-800 dark:bg-purple-950/30 px-3 text-xs font-black text-purple-700 dark:text-purple-300 cursor-pointer"
              >
                {selectedSchoolView === "__private__" ? "Close Private List" : `Private Scholars (${privateStudents.length})`}
              </button>
              <button
                type="button"
                onClick={() => setShowSchoolExplorer(false)}
                className="min-h-9 rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                Hide Explorer
              </button>
            </div>
          </div>
          {selectedSchoolView === "__private__" ? (
            <div className="rounded-2xl border border-purple-200/70 dark:border-purple-900/40 overflow-hidden max-h-72 overflow-y-auto">
              <div className="px-4 py-2.5 bg-purple-50/60 dark:bg-purple-950/20 text-xs font-black text-purple-800 dark:text-purple-200">
                Private Scholars · Parent-Enrolled + Personal Direct
              </div>
              {privateStudents.length === 0 ? (
                <div className="p-5 text-xs text-slate-500">No private students found.</div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {privateStudents.map(s => (
                    <button
                      type="button"
                      key={s.id}
                      onClick={() => { setInspectedStudent(s); setSelectedSchoolView(null); }}
                      className="w-full text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 flex items-center justify-between gap-3 cursor-pointer"
                    >
                      <span>
                        <span className="block text-xs font-black text-slate-900 dark:text-white">{s.fullName}</span>
                        <span className="block text-[11px] text-slate-500">{s.studentType === "parent" ? "Parent-registered" : "Personal"} · {s.class}</span>
                      </span>
                      <ChevronRight size={14} className="text-slate-400" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {schoolGroups.map(s => {
                const isSelected = schoolFilter === s.id;
                return (
                  <button
                    type="button"
                    key={s.id}
                    onClick={() => {
                      setSchoolFilter(isSelected ? 'all' : s.id);
                      setTypeFilter(isSelected ? 'all' : 'school');
                    }}
                    className={`text-left rounded-2xl border p-3.5 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/80 dark:bg-emerald-950/40 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 dark:border-slate-800 hover:border-brand-red hover:bg-brand-red/5'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-black text-slate-900 dark:text-white truncate">{s.name}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">{s.students.length} scholars onboarded</p>
                      </div>
                      <span className={`rounded-lg px-2 py-0.5 text-[10px] font-black ${
                        isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}>
                        {isSelected ? 'Filtered' : 'Filter'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Visible Segmented Scope Bar + Inline Search & Quick Filters */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-2xs dark:border-slate-800 dark:bg-slate-900 space-y-3">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-2.5">
          {/* Segmented Category Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'all', label: 'All Scholars', count: stats.total },
              { id: 'school', label: 'School-Assigned', count: stats.school },
              { id: 'parent', label: 'Parent-Enrolled', count: stats.parent },
              { id: 'personal', label: 'Personal / Direct', count: stats.personal },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTypeFilter(tab.id as any)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black transition-all cursor-pointer ${
                  typeFilter === tab.id
                    ? 'bg-brand-red text-white shadow-xs'
                    : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/70 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-mono ${
                  typeFilter === tab.id ? 'bg-white/20 text-white' : 'bg-white dark:bg-slate-900 text-slate-500'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Inline Partner School & Mentor Dropdowns */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={schoolFilter}
              onChange={e => setSchoolFilter(e.target.value)}
              aria-label="Filter by Partner School"
              className="min-h-9 rounded-xl border border-slate-200/90 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 focus:border-brand-red focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 cursor-pointer"
            >
              <option value="all">All Schools &amp; Direct</option>
              {schools.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>

            <select
              value={tutorFilter}
              onChange={e => setTutorFilter(e.target.value)}
              aria-label="Filter by Assigned Mentor"
              className="min-h-9 rounded-xl border border-slate-200/90 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 focus:border-brand-red focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 cursor-pointer"
            >
              <option value="all">All Mentor Scopes</option>
              <option value="assigned">Assigned to Mentor</option>
              <option value="unassigned">Unassigned Only</option>
              {tutors.map(t => (
                <option key={t.id} value={t.id}>Mentor: {t.name}</option>
              ))}
            </select>

            {(typeFilter !== 'all' || schoolFilter !== 'all' || tutorFilter !== 'all' || statusFilter !== 'all' || search) && (
              <button
                type="button"
                onClick={() => {
                  setTypeFilter('all');
                  setSchoolFilter('all');
                  setTutorFilter('all');
                  setStatusFilter('all');
                  setSearch('');
                }}
                className="min-h-9 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-brand-red hover:bg-red-100 dark:border-red-900/40 dark:bg-red-950/30 cursor-pointer"
              >
                Reset ({filteredStudents.length})
              </button>
            )}
          </div>
        </div>

        {/* Search Input Row */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={15} aria-hidden="true" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search scholar by full name, @username, access code, school, parent guardian, or class..."
            className="w-full min-h-10 pl-9 pr-9 rounded-xl border border-slate-200/90 bg-slate-50/60 text-xs font-medium text-slate-900 placeholder-slate-400 focus:border-brand-red focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-red/20 dark:border-slate-800 dark:bg-slate-950/60 dark:text-white"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* MASTER-DETAIL SPLIT WORKSPACE: Left Directory Table + Right Docked 360° Scholar Inspector */}
      <div className={`grid grid-cols-1 gap-5 items-start ${inspectedStudent ? 'xl:grid-cols-[minmax(0,1fr)_390px]' : ''}`}>
        {/* Left: Main Student Directory Roster */}
        <section className="pro-surface overflow-hidden rounded-3xl border border-slate-200/80 shadow-xs dark:border-slate-800 dark:bg-slate-900/80">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white">Scholar Directory</h2>
              <p className="text-xs text-slate-500">
                Showing {filteredStudents.length} of {students.length} scholars · Click any scholar row to open the 360° Inspector.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-extrabold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {filteredStudents.length} Visible
              </span>
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center p-16 text-center">
              <RefreshCw className="h-8 w-8 animate-spin text-brand-red" />
              <p className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-300">Synchronizing student records...</p>
              <p className="text-xs text-slate-500">Aggregating personal students, parent registrations, and school rosters.</p>
            </div>
          ) : filteredStudents.length === 0 ? (
            <div className="p-16 text-center">
              <Users className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600" aria-hidden="true" />
              <p className="mt-3 text-base font-black text-slate-800 dark:text-slate-200">No scholars match your criteria</p>
              <p className="mt-1 text-xs text-slate-500">Try clearing filters or onboarding a new student.</p>
              <button
                type="button"
                onClick={() => {
                  setTypeFilter('all');
                  setSchoolFilter('all');
                  setStatusFilter('all');
                  setTutorFilter('all');
                  setSearch('');
                }}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-brand-red hover:bg-red-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Reset All Filters
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredStudents.map(student => {
                const isSuspended = ['SUSPENDED', 'BANNED', 'DISABLED'].includes(student.accountStatus.toUpperCase());
                const isInspected = inspectedStudent?.id === student.id;
                const mentorCount = Array.isArray(student.assignedTutors) && student.assignedTutors.length > 0
                  ? student.assignedTutors.length
                  : student.tutorName ? 1 : 0;
                const primaryMentorName = Array.isArray(student.assignedTutors) && student.assignedTutors.length > 0
                  ? student.assignedTutors[0].tutorName
                  : student.tutorName;

                return (
                  <div
                    key={student.id}
                    onClick={() => setInspectedStudent(student)}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 p-4 transition-all cursor-pointer ${
                      isInspected
                        ? 'bg-brand-red/5 border-l-4 border-l-brand-red dark:bg-brand-red/10'
                        : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    {/* Left: Avatar & Core Summary Info */}
                    <div className="flex min-w-0 items-start sm:items-center gap-3.5">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-red to-red-700 text-sm font-black text-white shadow-xs">
                        {(student.fullName || 'S').charAt(0).toUpperCase()}
                      </div>

                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="truncate text-sm font-black text-slate-900 dark:text-white">
                            {student.fullName}
                          </p>

                          {/* Category Badge */}
                          {student.studentType === 'school' ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                              <School size={11} />
                              {student.schoolName || 'School Student'}
                            </span>
                          ) : student.studentType === 'parent' ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-[10px] font-extrabold text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                              <Users size={11} />
                              Parent: {student.parentName || 'Enrolled'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-[10px] font-extrabold text-purple-700 dark:bg-purple-950/40 dark:text-purple-300">
                              <UserCheck size={11} />
                              Personal Learner
                            </span>
                          )}

                          {/* Mentor Pill */}
                          {mentorCount > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-purple-100/80 px-2 py-0.5 text-[10px] font-bold text-purple-800 dark:bg-purple-950/60 dark:text-purple-300">
                              <GraduationCap size={11} />
                              {primaryMentorName}{mentorCount > 1 ? ` +${mentorCount - 1}` : ''}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openAssignMentorModal(student);
                              }}
                              className="inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 px-2 py-0.5 text-[10px] font-bold text-slate-500 hover:border-purple-500 hover:text-purple-600 dark:border-slate-700 dark:text-slate-400"
                            >
                              + Assign Mentor
                            </button>
                          )}

                          {/* Status Badge */}
                          {isSuspended && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-black uppercase text-red-700 dark:bg-red-950/30 dark:text-red-300">
                              Suspended
                            </span>
                          )}
                        </div>

                        {/* Core Identifiers & Inline Credentials */}
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500">
                          <span className="font-mono font-bold text-slate-700 dark:text-slate-300">@{student.username}</span>
                          {student.accessCode && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(student.accessCode, `${student.fullName}'s Access Code`);
                              }}
                              className="inline-flex items-center gap-1 rounded-md bg-amber-50 border border-amber-200/80 px-1.5 py-0.5 font-mono text-[10px] font-black text-amber-800 hover:bg-amber-100 dark:bg-amber-950/30 dark:border-amber-800/50 dark:text-amber-300"
                              title="Click to copy Access Code"
                            >
                              <KeyRound size={10} />
                              {student.accessCode}
                              <Copy size={9} />
                            </button>
                          )}
                          {student.class && (
                            <span>· Class: <strong className="text-slate-700 dark:text-slate-200">{student.class}</strong></span>
                          )}
                          {student.track && (
                            <span className="hidden md:inline">· Track: <strong className="text-slate-700 dark:text-slate-200">{student.track}</strong></span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: Streamlined Actions */}
                    <div className="shrink-0 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setInspectedStudent(isInspected ? null : student)}
                        className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                          isInspected
                            ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                            : 'border border-slate-200/90 bg-white text-slate-700 hover:border-brand-red hover:text-brand-red dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200'
                        }`}
                      >
                        <span>{isInspected ? 'Inspecting' : '360° View'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          toast.info(`Directly viewing student dashboard for ${student.fullName}...`);
                          startImpersonation({
                            id: student.id,
                            uid: student.firebaseUid || student.id,
                            name: student.fullName,
                            email: student.email || student.parentEmail,
                            role: 'STUDENT',
                            schoolId: student.schoolId,
                            schoolName: student.schoolName,
                            studentDocId: student.id,
                            class: student.class || student.grade,
                            classLevel: student.class || student.grade,
                            phone: student.parentPhone
                          }, navigate);
                        }}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 px-3 py-1.5 text-xs font-bold text-white shadow-2xs transition-all cursor-pointer whitespace-nowrap"
                        title={`Directly log into ${student.fullName}'s student dashboard`}
                      >
                        <UserCheck size={13} />
                        <span className="hidden sm:inline">Log In As</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setManagingStudent(student)}
                        className="inline-flex min-h-9 items-center justify-center rounded-xl border border-slate-200/90 bg-white p-2 text-slate-600 hover:border-brand-red hover:text-brand-red dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 cursor-pointer"
                        title={`Full settings for ${student.fullName}`}
                      >
                        <Settings size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Right: Docked 360° Scholar Inspector Drawer */}
        {inspectedStudent && (
          <aside className="xl:sticky xl:top-20 rounded-3xl border border-slate-200/90 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900 space-y-4 animate-fadeIn">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3.5">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-red to-red-700 text-base font-black text-white">
                  {(inspectedStudent.fullName || 'S').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-black uppercase tracking-widest text-brand-red">360° Scholar Inspector</span>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white truncate">{inspectedStudent.fullName}</h3>
                  <p className="text-xs font-mono text-slate-500 truncate">@{inspectedStudent.username}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectedStudent(null)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                title="Close Inspector"
              >
                <X size={16} />
              </button>
            </div>

            {/* Credentials Card */}
            <div className="rounded-2xl border border-amber-200/80 bg-amber-50/50 p-3.5 dark:border-amber-900/40 dark:bg-amber-950/20 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-300">
                  Portal Login Credentials
                </span>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => issueCredentials(inspectedStudent)}
                  className="text-[11px] font-bold text-brand-red hover:underline cursor-pointer"
                >
                  Re-Issue Code
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => copyToClipboard(inspectedStudent.username, 'Username')}
                  className="flex items-center justify-between rounded-xl bg-white dark:bg-slate-900 px-2.5 py-2 border border-amber-200/60 dark:border-slate-800 text-left cursor-pointer"
                >
                  <div className="min-w-0">
                    <span className="block text-[9px] font-bold uppercase text-slate-400">Username</span>
                    <span className="block font-mono text-xs font-black text-slate-900 dark:text-white truncate">@{inspectedStudent.username}</span>
                  </div>
                  <Copy size={12} className="text-slate-400 shrink-0" />
                </button>
                <button
                  type="button"
                  onClick={() => inspectedStudent.accessCode && copyToClipboard(inspectedStudent.accessCode, 'Access Code')}
                  className="flex items-center justify-between rounded-xl bg-white dark:bg-slate-900 px-2.5 py-2 border border-amber-200/60 dark:border-slate-800 text-left cursor-pointer"
                >
                  <div className="min-w-0">
                    <span className="block text-[9px] font-bold uppercase text-slate-400">Access Code</span>
                    <span className="block font-mono text-xs font-black text-brand-red truncate">{inspectedStudent.accessCode || 'Not Set'}</span>
                  </div>
                  <Copy size={12} className="text-slate-400 shrink-0" />
                </button>
              </div>
            </div>

            {/* Quick Class & Affiliation Metadata */}
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/50">
                <span className="font-bold text-slate-500">Class / Grade</span>
                <select
                  value={normalizeClassName(inspectedStudent.class, 'Grade 1')}
                  onChange={async (e) => {
                    const nextClass = normalizeClassName(e.target.value, 'Grade 1');
                    setInspectedStudent(prev => prev ? { ...prev, class: nextClass, grade: nextClass } : null);
                    setStudents(prev => prev.map(s => s.id === inspectedStudent.id ? { ...s, class: nextClass, grade: nextClass } : s));
                    try {
                      await Promise.all([
                        updateDoc(doc(db, 'students', inspectedStudent.id), { class: nextClass, grade: nextClass }).catch(() => undefined),
                        updateDoc(doc(db, 'individualStudents', inspectedStudent.id), { class: nextClass, grade: nextClass }).catch(() => undefined),
                        updateDoc(doc(db, 'users', inspectedStudent.id), { class: nextClass, grade: nextClass }).catch(() => undefined),
                      ]);
                      toast.success(`Updated class to ${nextClass}`);
                    } catch {
                      toast.error('Failed to update class');
                    }
                  }}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs font-black text-slate-900 dark:text-white"
                >
                  {CANONICAL_CLASSES.map(cls => (
                    <option key={cls} value={cls}>{cls}</option>
                  ))}
                </select>
              </div>

              <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-950/50">
                <span className="block text-[10px] font-bold uppercase text-slate-400">Enrolment &amp; Guardian Link</span>
                <p className="mt-0.5 font-bold text-slate-900 dark:text-white">
                  {inspectedStudent.schoolName
                    ? `School: ${inspectedStudent.schoolName}`
                    : inspectedStudent.parentName
                      ? `Parent: ${inspectedStudent.parentName}`
                      : 'Personal / Direct Student'}
                </p>
                {(inspectedStudent.parentEmail || inspectedStudent.email) && (
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">
                    {inspectedStudent.parentEmail || inspectedStudent.email}
                  </p>
                )}
              </div>
            </div>

            {/* Assigned Mentors Quick Card */}
            <div className="rounded-2xl border border-purple-200/70 bg-purple-50/30 p-3.5 dark:border-purple-900/40 dark:bg-purple-950/20 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-purple-900 dark:text-purple-200">
                  Assigned Mentors
                </span>
                <button
                  type="button"
                  onClick={() => openAssignMentorModal(inspectedStudent)}
                  className="text-[11px] font-bold text-purple-700 dark:text-purple-300 hover:underline cursor-pointer"
                >
                  + Manage Mentors
                </button>
              </div>
              {Array.isArray(inspectedStudent.assignedTutors) && inspectedStudent.assignedTutors.length > 0 ? (
                <div className="space-y-1.5">
                  {inspectedStudent.assignedTutors.map((tm, idx) => (
                    <div key={idx} className="flex items-center justify-between rounded-xl bg-white dark:bg-slate-900 px-2.5 py-1.5 border border-purple-100 dark:border-purple-900/50 text-xs">
                      <span className="font-bold text-slate-900 dark:text-white truncate">{tm.tutorName}</span>
                      <span className="text-[10px] font-semibold text-purple-600 dark:text-purple-400">{tm.role || 'Mentor'}</span>
                    </div>
                  ))}
                </div>
              ) : inspectedStudent.tutorName ? (
                <div className="flex items-center justify-between rounded-xl bg-white dark:bg-slate-900 px-2.5 py-1.5 border border-purple-100 dark:border-purple-900/50 text-xs">
                  <span className="font-bold text-slate-900 dark:text-white truncate">{inspectedStudent.tutorName}</span>
                  <span className="text-[10px] font-semibold text-purple-600 dark:text-purple-400">Lead Mentor</span>
                </div>
              ) : (
                <p className="text-[11px] text-slate-500 italic">No mentor assigned yet.</p>
              )}
            </div>

            {/* Quick Inspector Action Buttons */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setResourceForm(prev => ({ ...prev, studentId: inspectedStudent.id }));
                  setShowResourceModal(true);
                }}
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-brand-red/30 bg-brand-red/5 px-3 text-xs font-bold text-brand-red hover:bg-brand-red/10 cursor-pointer"
              >
                <Send size={13} />
                Send Resource
              </button>
              <button
                type="button"
                onClick={() => setManagingStudent(inspectedStudent)}
                className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-200 cursor-pointer"
              >
                <Settings size={13} />
                Full Settings
              </button>
            </div>
          </aside>
        )}
      </div>

      {/* Compact Recent Dispatches Strip */}
      {dispatches.length > 0 && (
        <section className="pro-surface rounded-2xl border border-slate-200/80 p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900/80">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Recent Learning Resource Dispatches ({dispatches.length})
            </h2>
            <button
              type="button"
              onClick={() => setShowResourceModal(true)}
              className="text-xs font-bold text-brand-red hover:underline cursor-pointer"
            >
              + Dispatch New Resource
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-3">
            {dispatches.slice(0, 3).map((item, idx) => {
              const targetStudent = students.find(s => s.id === item.studentId);
              return (
                <div
                  key={`${item.collectionName}-${item.id}-${idx}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-950/50"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-brand-red/10 px-1.5 py-0.5 text-[9px] font-black uppercase text-brand-red">
                        {item.kind}
                      </span>
                      <p className="text-xs font-black text-slate-900 dark:text-white truncate">
                        {item.title || 'Untitled'}
                      </p>
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500 truncate">
                      To: <strong>{targetStudent?.fullName || 'Student'}</strong>
                    </p>
                  </div>
                  <a
                    href={item.url || item.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-white dark:bg-slate-900 px-2.5 py-1.5 text-[11px] font-bold text-brand-red border border-slate-200 dark:border-slate-800 hover:border-brand-red"
                  >
                    <LinkIcon size={11} />
                    Open
                  </a>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* MODAL: Send Personal Learning Resource */}
      {showResourceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 md:p-8">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-red/10 text-brand-red dark:bg-brand-red/20">
                  <Send size={18} aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-slate-900 dark:text-white">Dispatch Personal Learning Resource</h2>
                  <p className="text-xs text-slate-500">
                    Deliver an interactive class link, lesson sheet, or coding challenge directly to a scholar.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowResourceModal(false)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSendResource} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Target Scholar <span className="text-brand-red">*</span>
                  </label>
                  <select
                    value={resourceForm.studentId}
                    onChange={e => setResourceForm(prev => ({ ...prev, studentId: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-900 focus:border-brand-red focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                    required
                  >
                    <option value="">-- Choose from {students.length} scholars --</option>
                    {students.map(student => (
                      <option key={student.id} value={student.id}>
                        {student.fullName} (@{student.username})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Dispatch Format
                  </label>
                  <select
                    value={resourceForm.type}
                    onChange={e => setResourceForm(prev => ({ ...prev, type: e.target.value as 'resource' | 'link' }))}
                    className="w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-900 focus:border-brand-red focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                  >
                    <option value="resource">File / Curriculum Document (PDF, Slides)</option>
                    <option value="link">Live Classroom / Platform URL (Meet, Scratch)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Resource Title <span className="text-brand-red">*</span>
                </label>
                <input
                  type="text"
                  value={resourceForm.title}
                  onChange={e => setResourceForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g. Python Loops Workshop Guide or Google Meet workspace"
                  className="w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-900 focus:border-brand-red focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                  required
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  URL Link <span className="text-brand-red">*</span>
                </label>
                <input
                  type="url"
                  value={resourceForm.url}
                  onChange={e => setResourceForm(prev => ({ ...prev, url: e.target.value }))}
                  placeholder="https://drive.google.com/... or https://meet.google.com/..."
                  className="w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-900 focus:border-brand-red focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                  required
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Optional Instructions or Notes
                </label>
                <input
                  type="text"
                  value={resourceForm.description}
                  onChange={e => setResourceForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="e.g. Review exercises 1 through 4 before our Thursday live session."
                  className="w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-900 focus:border-brand-red focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowResourceModal(false)}
                  className="min-h-10 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingResource}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-brand-red px-5 text-xs font-bold text-white shadow-md shadow-brand-red/20 hover:bg-red-700 disabled:opacity-50"
                >
                  {sendingResource ? 'Dispatching...' : 'Dispatch to Scholar'}
                  <Send size={14} aria-hidden="true" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Onboard New Student / Student */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 md:p-8">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-slate-900 dark:text-white">Add Student / Student</h2>
                <p className="text-xs text-slate-500">
                  Onboard a new scholar with personalized credentials and course assignment.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateStudent} className="space-y-4">
              {/* Category Selector */}
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Student Category
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, studentType: 'personal' }))}
                    className={`rounded-xl p-2.5 text-center text-xs font-bold transition-all ${
                      form.studentType === 'personal'
                        ? 'border-2 border-purple-600 bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300'
                        : 'border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    Personal / Direct
                  </button>

                  <button
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, studentType: 'parent' }))}
                    className={`rounded-xl p-2.5 text-center text-xs font-bold transition-all ${
                      form.studentType === 'parent'
                        ? 'border-2 border-sky-600 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300'
                        : 'border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    Parent Enrolled
                  </button>

                  <button
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, studentType: 'school' }))}
                    className={`rounded-xl p-2.5 text-center text-xs font-bold transition-all ${
                      form.studentType === 'school'
                        ? 'border-2 border-emerald-600 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'border border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    School Student
                  </button>
                </div>
              </div>

              {/* Basic Details */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Full Name <span className="text-brand-red">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={form.fullName}
                    onChange={e => {
                      const val = e.target.value;
                      setForm(prev => ({
                        ...prev,
                        fullName: val,
                        username: prev.username || val.toLowerCase().replace(/[^a-z0-9]/g, '')
                      }));
                    }}
                    placeholder="e.g. David Johnson"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-medium text-slate-900 focus:border-brand-red focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Student Username <span className="text-brand-red">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={form.username}
                    onChange={e => setForm(prev => ({ ...prev, username: e.target.value.toLowerCase().replace(/\s+/g, '') }))}
                    placeholder="e.g. david.johnson"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-medium text-slate-900 focus:border-brand-red focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Email Address (Optional)
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="student@example.com"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-medium text-slate-900 focus:border-brand-red focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Class / Grade Level
                  </label>
                  <select
                    value={normalizeClassName(form.className, 'Grade 1')}
                    onChange={e => setForm(prev => ({ ...prev, className: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-medium text-slate-900 focus:border-brand-red focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    {CANONICAL_CLASSES.map(cls => (
                      <option key={cls} value={cls}>{cls}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* School or Parent Linker */}
              {form.studentType === 'school' && (
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Select Affiliated School <span className="text-brand-red">*</span>
                  </label>
                  <select
                    required
                    value={form.schoolId}
                    onChange={e => setForm(prev => ({ ...prev, schoolId: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-medium text-slate-900 focus:border-brand-red focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="">-- Choose School --</option>
                    {schools.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {form.studentType === 'parent' && (
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Link to Parent Account
                  </label>
                  <select
                    value={form.parentId}
                    onChange={e => setForm(prev => ({ ...prev, parentId: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-medium text-slate-900 focus:border-brand-red focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="">-- Select Parent or Leave Blank --</option>
                    {parents.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.email})</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Mentor Assignment */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Assign Faculty Mentor / Tutor (Optional)
                  </label>
                  <select
                    value={form.tutorId}
                    onChange={e => setForm(prev => ({ ...prev, tutorId: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-medium text-slate-900 focus:border-brand-red focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="">-- Unassigned (Assign Later) --</option>
                    {tutors.map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.email})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Custom Access Code (Optional)
                  </label>
                  <input
                    type="text"
                    value={form.accessCode}
                    onChange={e => setForm(prev => ({ ...prev, accessCode: e.target.value.toUpperCase() }))}
                    placeholder="Leave blank to auto-generate"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-medium text-slate-900 focus:border-brand-red focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white font-mono uppercase"
                  />
                </div>
              </div>

              {/* Track & Subjects */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Learning Track
                  </label>
                  <input
                    type="text"
                    value={form.track}
                    onChange={e => setForm(prev => ({ ...prev, track: e.target.value }))}
                    placeholder="e.g. Python & Hardware & Electronics Track"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-medium text-slate-900 focus:border-brand-red focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Subjects (Comma-separated)
                  </label>
                  <input
                    type="text"
                    value={form.subjects}
                    onChange={e => setForm(prev => ({ ...prev, subjects: e.target.value }))}
                    placeholder="Coding, Mathematics, Hardware & Electronics"
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-xs font-medium text-slate-900 focus:border-brand-red focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="min-h-11 flex-1 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-11 flex-1 rounded-xl bg-brand-red text-xs font-bold text-white shadow-md shadow-brand-red/20 hover:bg-red-700 disabled:opacity-50"
                >
                  {saving ? 'Creating Student...' : 'Onboard Student'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Manage Student & Operations Settings */}
      {managingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 md:p-8 space-y-6">
            
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-red to-red-700 text-lg font-black text-white shadow-xs">
                  {(managingStudent.fullName || 'C').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-black text-slate-900 dark:text-white truncate">
                      {managingStudent.fullName}
                    </h2>
                    {managingStudent.studentType === 'school' ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                        <School size={11} />
                        {managingStudent.schoolName || 'School Student'}
                      </span>
                    ) : managingStudent.studentType === 'parent' ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-[10px] font-extrabold text-sky-700 dark:bg-sky-950/40 dark:text-sky-300">
                        <Users size={11} />
                        Parent Enrolled
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-[10px] font-extrabold text-purple-700 dark:bg-purple-950/40 dark:text-purple-300">
                        <UserCheck size={11} />
                        Personal Student
                      </span>
                    )}
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase ${
                      ['SUSPENDED', 'BANNED', 'DISABLED'].includes(managingStudent.accountStatus.toUpperCase())
                        ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300' 
                        : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                    }`}>
                      <ShieldCheck size={11} />
                      {managingStudent.accountStatus}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500 font-mono">
                    @{managingStudent.username}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setManagingStudent(null)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                title="Close settings"
              >
                <X size={18} />
              </button>
            </div>

            {/* Profile & Academic Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Email */}
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/50">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Email Address</span>
                  {managingStudent.email && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(managingStudent.email, 'Email')}
                      className="text-slate-400 hover:text-brand-red p-1 rounded-md cursor-pointer"
                      title="Copy email"
                    >
                      <Copy size={13} />
                    </button>
                  )}
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-900 dark:text-white truncate">
                  {managingStudent.email || <span className="text-slate-400 italic font-normal">No email registered</span>}
                </p>
              </div>

              {/* Class & Track */}
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/50">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Class &amp; Learning Track</span>
                <div className="mt-1.5 flex items-center gap-2">
                  <select
                    value={normalizeClassName(managingStudent.class, 'Grade 1')}
                    onChange={async (e) => {
                      const nextClass = normalizeClassName(e.target.value, 'Grade 1');
                      setManagingStudent(prev => prev ? { ...prev, class: nextClass, grade: nextClass } : null);
                      setStudents(prev => prev.map(s => s.id === managingStudent.id ? { ...s, class: nextClass, grade: nextClass } : s));
                      try {
                        await Promise.all([
                          updateDoc(doc(db, 'students', managingStudent.id), { class: nextClass, grade: nextClass }).catch(() => undefined),
                          updateDoc(doc(db, 'individualStudents', managingStudent.id), { class: nextClass, grade: nextClass }).catch(() => undefined),
                          updateDoc(doc(db, 'users', managingStudent.id), { class: nextClass, grade: nextClass }).catch(() => undefined),
                        ]);
                        toast.success(`Updated class to ${nextClass}`);
                      } catch {
                        toast.error('Failed to update class');
                      }
                    }}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-brand-red"
                  >
                    {CANONICAL_CLASSES.map(cls => (
                      <option key={cls} value={cls}>{cls}</option>
                    ))}
                  </select>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">
                    · <strong>{managingStudent.track || 'Technology & Coding'}</strong>
                  </span>
                </div>
              </div>

              {/* School / Parent Info */}
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/50">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Affiliation &amp; Guardian</span>
                <p className="mt-1 text-xs font-semibold text-slate-900 dark:text-white truncate">
                  {managingStudent.schoolName 
                    ? `School: ${managingStudent.schoolName}` 
                    : managingStudent.parentName 
                      ? `Parent: ${managingStudent.parentName} (${managingStudent.parentEmail || managingStudent.parentPhone || 'No contact'})`
                      : 'Personal Direct Enrollment'}
                </p>
              </div>

              {/* Access Code */}
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/50">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Portal Access Code</span>
                  {managingStudent.accessCode && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(managingStudent.accessCode, 'Access Code')}
                      className="text-slate-400 hover:text-brand-red p-1 rounded-md cursor-pointer"
                      title="Copy access code"
                    >
                      <Copy size={13} />
                    </button>
                  )}
                </div>
                <p className="mt-1 font-mono text-xs font-bold text-brand-red dark:text-red-400 truncate">
                  {managingStudent.accessCode || <span className="text-slate-400 font-sans italic font-normal">Not generated yet</span>}
                </p>
              </div>
            </div>

            {/* Assigned Mentors Section */}
            <div className="rounded-2xl border border-purple-200/70 bg-purple-50/30 p-4 dark:border-purple-900/40 dark:bg-purple-950/20 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserCheck size={16} className="text-purple-600 dark:text-purple-400" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-purple-900 dark:text-purple-200">
                    Assigned Mentors {Array.isArray(managingStudent.assignedTutors) && managingStudent.assignedTutors.length > 0 ? `(${managingStudent.assignedTutors.length})` : managingStudent.tutorName ? '(1)' : '(0)'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const target = managingStudent;
                    setManagingStudent(null);
                    openAssignMentorModal(target);
                  }}
                  className="text-xs font-bold text-purple-700 dark:text-purple-300 hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <Plus size={13} />
                  <span>Manage Mentors</span>
                </button>
              </div>

              {Array.isArray(managingStudent.assignedTutors) && managingStudent.assignedTutors.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {managingStudent.assignedTutors.map((tm, idx) => (
                    <div key={idx} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-purple-100 dark:border-purple-900/50 shadow-2xs">
                      <div className="h-8 w-8 rounded-lg bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 flex items-center justify-center font-bold text-xs shrink-0">
                        {tm.tutorName.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {tm.tutorName}
                        </p>
                        <p className="text-[10px] text-purple-600 dark:text-purple-400 truncate">
                          {tm.role || 'Mentor'} {tm.trackOrSubject ? `• ${tm.trackOrSubject}` : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : managingStudent.tutorName ? (
                <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-purple-100 dark:border-purple-900/50">
                  <div className="h-8 w-8 rounded-lg bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 flex items-center justify-center font-bold text-xs shrink-0">
                    {managingStudent.tutorName.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {managingStudent.tutorName}
                    </p>
                    <p className="text-[10px] text-purple-600 dark:text-purple-400 truncate">
                      Lead Mentor
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                  No mentors currently assigned to this student. Click "Manage Mentors" above to assign faculty.
                </p>
              )}
            </div>

            {/* Actions Grid */}
            <div className="space-y-2.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Student Operations &amp; Actions</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* Send Resource */}
                <button
                  type="button"
                  onClick={() => {
                    const targetId = managingStudent.id;
                    setManagingStudent(null);
                    setResourceForm(prev => ({ ...prev, studentId: targetId }));
                    setShowResourceModal(true);
                  }}
                  className="flex items-center gap-3 p-3.5 rounded-2xl border border-slate-200 bg-white hover:border-brand-red hover:bg-brand-red/5 text-left transition-all dark:border-slate-800 dark:bg-slate-950/70 dark:hover:border-brand-red cursor-pointer"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-red/10 text-brand-red">
                    <Send size={15} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white">Send Resource</p>
                    <p className="text-[11px] text-slate-500 truncate">Dispatch link, meeting or material</p>
                  </div>
                </button>

                {/* Manage Mentors */}
                <button
                  type="button"
                  onClick={() => {
                    const target = managingStudent;
                    setManagingStudent(null);
                    openAssignMentorModal(target);
                  }}
                  className="flex items-center gap-3 p-3.5 rounded-2xl border border-slate-200 bg-white hover:border-purple-600 hover:bg-purple-50/50 text-left transition-all dark:border-slate-800 dark:bg-slate-950/70 dark:hover:border-purple-600 cursor-pointer"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                    <UserCheck size={15} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white">Manage Mentors</p>
                    <p className="text-[11px] text-slate-500 truncate">Assign lead coach or tutors</p>
                  </div>
                </button>

                {/* Access Pack */}
                <button
                  type="button"
                  disabled={saving}
                  onClick={async () => {
                    const target = managingStudent;
                    setManagingStudent(null);
                    await issueCredentials(target);
                  }}
                  className="flex items-center gap-3 p-3.5 rounded-2xl border border-slate-200 bg-white hover:border-amber-500 hover:bg-amber-50/50 text-left transition-all dark:border-slate-800 dark:bg-slate-950/70 dark:hover:border-amber-500 cursor-pointer disabled:opacity-50"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                    <KeyRound size={15} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white">Access Pack</p>
                    <p className="text-[11px] text-slate-500 truncate">Re-issue login passcode</p>
                  </div>
                </button>

                {/* Toggle Status (Suspend / Reactivate) */}
                <button
                  type="button"
                  onClick={async () => {
                    const target = managingStudent;
                    setManagingStudent(null);
                    await toggleStudentStatus(target);
                  }}
                  className="flex items-center gap-3 p-3.5 rounded-2xl border border-slate-200 bg-white hover:border-slate-400 hover:bg-slate-50 text-left transition-all dark:border-slate-800 dark:bg-slate-950/70 dark:hover:border-slate-600 cursor-pointer"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    <ShieldCheck size={15} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white">
                      {['SUSPENDED', 'BANNED', 'DISABLED'].includes(managingStudent.accountStatus.toUpperCase()) ? 'Reactivate Student' : 'Suspend Student'}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {['SUSPENDED', 'BANNED', 'DISABLED'].includes(managingStudent.accountStatus.toUpperCase()) ? 'Restore portal access' : 'Pause portal access'}
                    </p>
                  </div>
                </button>
              </div>

              {/* Danger Action: Delete Student */}
              <div className="pt-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={async () => {
                    const target = managingStudent;
                    setManagingStudent(null);
                    await deleteStudent(target);
                  }}
                  className="w-full flex items-center justify-between p-3.5 rounded-2xl border border-red-200/80 bg-red-50/50 hover:bg-red-100/70 text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:hover:bg-red-950/40 transition-all cursor-pointer disabled:opacity-50"
                >
                  <div className="flex items-center gap-2.5">
                    <Trash2 size={16} />
                    <div className="text-left">
                      <p className="text-xs font-bold">Delete Student Record</p>
                      <p className="text-[10px] text-red-600/80 dark:text-red-400">Permanently erase student record &amp; dispatches</p>
                    </div>
                  </div>
                  <span className="text-[11px] font-black uppercase tracking-wider text-red-700 dark:text-red-400">Delete</span>
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setManagingStudent(null)}
                className="min-h-10 px-5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
              >
                Close Settings
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL: Assign Tutor */}
      {assigningTutorStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-base font-black text-slate-900 dark:text-white">
                  Assign Faculty Mentors &amp; Instructors
                </h2>
                <p className="text-xs text-slate-500">
                  Assign one or multiple dedicated mentors for {assigningTutorStudent.fullName}.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAssigningTutorStudent(null)}
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAssignTutor} className="space-y-4">
              {/* Assigned Mentors List */}
              <div>
                <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Assigned Mentors ({selectedTutorsList.length})
                </label>
                {selectedTutorsList.length === 0 ? (
                  <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
                    No faculty mentors assigned yet. Add one below.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {selectedTutorsList.map((tm) => (
                      <div key={tm.tutorId} className="flex items-center justify-between p-3 rounded-2xl bg-purple-50/50 dark:bg-purple-950/30 border border-purple-200/60 dark:border-purple-800/60">
                        <div className="min-w-0">
                          <div className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                            <span>{tm.tutorName}</span>
                            <span className="px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 text-[10px] font-bold">
                              {tm.role || 'Lead Mentor'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {tm.tutorEmail} {tm.trackOrSubject ? `• ${tm.trackOrSubject}` : ''}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveMentorFromStudent(tm.tutorId)}
                          className="p-1.5 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-bold"
                          title="Remove this mentor"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add a Mentor to the Student */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="text-[11px] font-black uppercase text-slate-500 dark:text-slate-400">
                  + Add Faculty Mentor
                </div>
                <div className="space-y-2">
                  <select
                    value={newMentorDraft.tutorId}
                    onChange={e => setNewMentorDraft(prev => ({ ...prev, tutorId: e.target.value }))}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-900 focus:border-brand-red focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="">-- Select Instructor / Mentor --</option>
                    {tutors.map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.email})</option>
                    ))}
                  </select>

                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={newMentorDraft.role}
                      onChange={e => setNewMentorDraft(prev => ({ ...prev, role: e.target.value }))}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-900 focus:border-brand-red focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      <option value="Lead Mentor">Lead Mentor</option>
                      <option value="Hardware & Electronics Instructor">Hardware & Electronics Instructor</option>
                      <option value="Coding Coach">Coding Coach</option>
                      <option value="Mathematics Specialist">Mathematics Specialist</option>
                      <option value="AI &amp; Data Guide">AI &amp; Data Guide</option>
                      <option value="Project Advisor">Project Advisor</option>
                    </select>

                    <input
                      type="text"
                      value={newMentorDraft.trackOrSubject}
                      onChange={e => setNewMentorDraft(prev => ({ ...prev, trackOrSubject: e.target.value }))}
                      placeholder="Subject / Track focus"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-900 focus:border-brand-red focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleAddMentorToStudent}
                    className="w-full min-h-9 px-3 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-black dark:hover:bg-slate-700 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Plus size={13} />
                    <span>Attach Mentor to Roster</span>
                  </button>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAssigningTutorStudent(null)}
                  className="min-h-10 flex-1 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 dark:border-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-10 flex-1 rounded-xl bg-brand-red text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {saving ? 'Updating...' : `Save All (${selectedTutorsList.length}) Assignments`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: One-Time Access Pack */}
      {credentials && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 md:p-8">
            <div className="space-y-5">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 text-emerald-600 shrink-0" size={20} aria-hidden="true" />
                  <div>
                    <p className="text-sm font-black text-emerald-900 dark:text-emerald-200">
                      Access Pack for {credentials.fullName}
                    </p>
                    <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-300">
                      Copy these credentials and deliver them securely to the student or parent.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Student Username</p>
                    <p className="mt-0.5 truncate font-mono text-sm font-black text-slate-900 dark:text-white">
                      {credentials.username}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(credentials.username, 'Username')}
                    className="rounded-lg p-2 text-slate-500 hover:bg-white hover:text-brand-red dark:hover:bg-slate-800"
                    title="Copy username"
                  >
                    <Copy size={15} />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">Student Access Code</p>
                    <p className="mt-0.5 truncate font-mono text-sm font-black text-brand-red dark:text-red-400">
                      {credentials.accessCode}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(credentials.accessCode, 'Access Code')}
                    className="rounded-lg p-2 text-amber-700 hover:bg-white hover:text-brand-red dark:hover:bg-slate-800"
                    title="Copy access code"
                  >
                    <Copy size={15} />
                  </button>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Portal Login Path</p>
                    <p className="mt-0.5 truncate font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
                      /portal (Select Student Tab)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(`${window.location.origin}/portal`, 'Portal URL')}
                    className="rounded-lg p-2 text-slate-500 hover:bg-white hover:text-brand-red dark:hover:bg-slate-800"
                    title="Copy portal URL"
                  >
                    <Copy size={15} />
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setCredentials(null)}
                className="min-h-11 w-full rounded-xl bg-brand-red text-xs font-bold text-white shadow-md shadow-brand-red/20 hover:bg-red-700"
              >
                Done &amp; Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminStudents;
