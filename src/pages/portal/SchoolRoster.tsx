import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { 
  AlertCircle, 
  GraduationCap, 
  Loader2, 
  Plus, 
  RefreshCw, 
  Search, 
  ShieldCheck, 
  UserRound, 
  UserX, 
  UserCheck, 
  ChevronRight, 
  Users, 
  KeyRound, 
  Copy, 
  Check, 
  Download, 
  FileText, 
  X,
  Edit3,
  BookOpen
} from 'lucide-react';
import { collection, doc, getDoc, getDocs, updateDoc, setDoc, query as fsQuery, where } from 'firebase/firestore';
import jsPDF from 'jspdf';
import SEO from '../../components/ui/SEO';
import { auth, db, getClientDatabases } from '../../lib/firebase';
import { useToast } from '../../contexts/ToastContext';
import { getEffectiveAuth } from '../../utils/impersonation';
import { CANONICAL_CLASSES, normalizeClassName, formatNormalizedClassDisplay } from '../../lib/classes';
import { migrateAllFirestoreClasses } from '../../lib/classMigration';

type Student = { 
  id: string; 
  collection: string; 
  fullName: string; 
  username: string; 
  email: string | null; 
  class: string; 
  track: string; 
  parentId: string | null; 
  tutorId: string | null; 
  staffId: string | null; 
  portalAccessEnabled: boolean; 
  accountStatus: string; 
  source: string; 
  subjects?: string[];
  enrolledPrograms?: string[];
  plans?: string[];
  programs?: string[];
  [key: string]: any;
};

type IssuedCredential = {
  studentId: string;
  studentName: string;
  username: string;
  accessCode: string;
  portal: string;
};

const SchoolRoster: React.FC = () => {
  const { toast } = useToast();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [filterTab, setFilterTab] = useState<'all' | 'classes' | 'tracks'>('all');
  const [selectedClass, setSelectedClass] = useState('All Classes');
  const [selectedTrack, setSelectedTrack] = useState('All Tracks');
  
  // Credential issuance state
  const [issuingStudent, setIssuingStudent] = useState<Student | null>(null);
  const [isIssuing, setIsIssuing] = useState(false);
  const [revealedCredential, setRevealedCredential] = useState<IssuedCredential | null>(null);
  const [copied, setCopied] = useState(false);

  // Student Edit & Program/Teacher Assignment State
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [editForm, setEditForm] = useState({
    fullName: '',
    class: '',
    selectedPrograms: [] as string[],
    customProgram: '',
    email: '',
    tutorId: '',
    tutorName: ''
  });
  const [schoolPrograms, setSchoolPrograms] = useState<Array<{ id: string; name: string }>>([]);
  const [schoolTutors, setSchoolTutors] = useState<Array<{ id: string; name: string }>>([]);
  const [savingStudent, setSavingStudent] = useState(false);

  const load = useCallback(async (silent = false) => {
    const effective = getEffectiveAuth();
    if (!auth.currentUser && !effective.isMasquerading) {
      setLoading(false);
      return;
    } 
    if (silent) setRefreshing(true);
    else setLoading(true); 

    try {
      await migrateAllFirestoreClasses().catch(() => null);
      let targetSchoolId = String(effective.effectiveSchoolId || sessionStorage.getItem('schoolId') || '').trim();
      let schoolNameCandidate = sessionStorage.getItem('schoolName') || localStorage.getItem('jaystar_cached_school_name') || '';
      let matchedSchoolDoc: { id: string; data: Record<string, any> } | null = null;

      // 1. Check if targetSchoolId directly matches a schools document
      if (targetSchoolId) {
        try {
          const directSnap = await getDoc(doc(db, 'schools', targetSchoolId));
          if (directSnap.exists()) {
            matchedSchoolDoc = { id: directSnap.id, data: directSnap.data() };
          }
        } catch (e) {
          console.warn('Direct school doc lookup warning:', e);
        }
      }

      // 2. Check current user profile in users/{effectiveUid}
      if (!matchedSchoolDoc && effective.effectiveUid) {
        try {
          const uSnap = await getDoc(doc(db, 'users', effective.effectiveUid));
          if (uSnap.exists()) {
            const uData = uSnap.data();
            const profileSchoolId = String(uData.schoolId || uData.school_id || uData.schoolDocId || '').trim();
            if (uData.schoolName) schoolNameCandidate = uData.schoolName;
            if (profileSchoolId) {
              targetSchoolId = profileSchoolId;
              const schSnap = await getDoc(doc(db, 'schools', profileSchoolId));
              if (schSnap.exists()) {
                matchedSchoolDoc = { id: schSnap.id, data: schSnap.data() };
              }
            }
          }
        } catch (e) {
          console.warn('User profile school lookup error:', e);
        }
      }

      // 3. Scan schools collection for matching ID, schoolCode, email, contactEmail, adminUid, firebaseUid, userId, or email prefix
      if (!matchedSchoolDoc) {
        try {
          const schoolsSnap = await getDocs(collection(db, 'schools'));
          const emailLower = String(effective.effectiveEmail || auth.currentUser?.email || '').toLowerCase().trim();
          const emailPrefix = emailLower.split('@')[0].replace(/student(s)?|explorer|lily/g, '').trim();

          const found = schoolsSnap.docs.find(d => {
            const sd = d.data();
            const docIdLower = d.id.toLowerCase();
            return (
              d.id === targetSchoolId ||
              d.id === effective.effectiveUid ||
              String(sd.schoolId || '').trim() === targetSchoolId ||
              String(sd.schoolCode || '').trim() === targetSchoolId ||
              (emailLower && String(sd.email || '').toLowerCase().trim() === emailLower) ||
              (emailLower && String(sd.contactEmail || '').toLowerCase().trim() === emailLower) ||
              sd.adminUid === effective.effectiveUid ||
              sd.firebaseUid === effective.effectiveUid ||
              sd.userId === effective.effectiveUid ||
              (emailLower && emailLower.startsWith(docIdLower)) ||
              (emailPrefix.length >= 4 && docIdLower.includes(emailPrefix))
            );
          });
          if (found) {
            matchedSchoolDoc = { id: found.id, data: found.data() };
            targetSchoolId = found.id;
            schoolNameCandidate = found.data().name || found.data().schoolName || schoolNameCandidate;
          }
        } catch (e) {
          console.warn('School collection lookup error:', e);
        }
      }

      if (matchedSchoolDoc) {
        targetSchoolId = matchedSchoolDoc.id;
        schoolNameCandidate = matchedSchoolDoc.data.name || matchedSchoolDoc.data.schoolName || schoolNameCandidate;
      }

      if (targetSchoolId) {
        sessionStorage.setItem('schoolId', targetSchoolId);
        localStorage.setItem('jaystar_cached_school_id', targetSchoolId);
      }
      if (schoolNameCandidate) {
        sessionStorage.setItem('schoolName', schoolNameCandidate);
        localStorage.setItem('jaystar_cached_school_name', schoolNameCandidate);
      }

      // Build comprehensive set of valid school ID aliases and names for this school
      const validSchoolIds = new Set<string>();
      if (targetSchoolId) validSchoolIds.add(targetSchoolId);
      if (matchedSchoolDoc) {
        validSchoolIds.add(matchedSchoolDoc.id);
        if (matchedSchoolDoc.data.schoolId) validSchoolIds.add(String(matchedSchoolDoc.data.schoolId).trim());
        if (matchedSchoolDoc.data.schoolCode) validSchoolIds.add(String(matchedSchoolDoc.data.schoolCode).trim());
        if (matchedSchoolDoc.data.adminUid) validSchoolIds.add(String(matchedSchoolDoc.data.adminUid).trim());
        if (matchedSchoolDoc.data.userId) validSchoolIds.add(String(matchedSchoolDoc.data.userId).trim());
        if (matchedSchoolDoc.data.firebaseUid) validSchoolIds.add(String(matchedSchoolDoc.data.firebaseUid).trim());
      }
      const cleanSchoolName = String(schoolNameCandidate || '').trim();
      const hasValidSchoolName = Boolean(cleanSchoolName && !['School Portal', 'school-default', 'Partner School Institution', 'Partner School'].includes(cleanSchoolName));

      const mergedByCanonicalId = new Map<string, { id: string; collection: string; data: Record<string, any> }>();

      const mergeRawRecord = (rawId: string, collName: string, data: Record<string, any>) => {
        if (!data || typeof data !== 'object') return;
        const role = String(data.role || '').toUpperCase();
        if (['SCHOOL', 'SCHOOL_ADMIN', 'ADMIN', 'SUPER_ADMIN', 'STAFF', 'TUTOR', 'INSTRUCTOR', 'PARENT'].includes(role)) {
          return;
        }
        const canonicalId = String(
          (collName === 'users' && data.studentDocId) ? data.studentDocId : rawId
        ).trim();
        if (!canonicalId) return;

        const existing = mergedByCanonicalId.get(canonicalId);
        if (!existing) {
          mergedByCanonicalId.set(canonicalId, {
            id: canonicalId,
            collection: collName === 'users' ? 'individualStudents' : collName,
            data: { ...data }
          });
        } else {
          // Merge non-empty fields, preferring individualStudents / students over users
          const combined: Record<string, any> = { ...existing.data };
          for (const [k, v] of Object.entries(data)) {
            if (v !== undefined && v !== null && v !== '') {
              if (combined[k] === undefined || combined[k] === null || combined[k] === '' || collName === 'individualStudents') {
                combined[k] = v;
              }
            }
          }
          const preferredCollection =
            collName === 'individualStudents' || existing.collection === 'individualStudents'
              ? 'individualStudents'
              : collName === 'students' || existing.collection === 'students'
                ? 'students'
                : existing.collection;
          mergedByCanonicalId.set(canonicalId, {
            id: canonicalId,
            collection: preferredCollection,
            data: combined
          });
        }
      };

      // 1. Try backend endpoint first
      if (!effective.isMasquerading && auth.currentUser) {
        try {
          const token = await auth.currentUser.getIdToken(true);
          const response = await fetch('/.netlify/functions/school-students' + (targetSchoolId ? `?schoolId=${encodeURIComponent(targetSchoolId)}` : ''), {
            headers: { Authorization: `Bearer ${token}` }
          });
          const result = await response.json().catch(() => ({}));
          if (response.ok && Array.isArray(result.students)) {
            result.students.forEach((s: any) => {
              const sId = String(s.schoolId || '').trim();
              const sName = String(s.schoolName || '').trim().toLowerCase();
              if (!targetSchoolId || validSchoolIds.has(sId) || (hasValidSchoolName && sName === cleanSchoolName.toLowerCase())) {
                mergeRawRecord(s.id || s.studentId, s.collection || 'individualStudents', s);
              }
            });
            if (result.schoolName) {
              sessionStorage.setItem('schoolName', result.schoolName);
            }
          }
        } catch {
          // Proceed to Firestore queries
        }
      }

      // 2. Always run direct Firestore queries across client databases and merge so no student is missed
      if (validSchoolIds.size > 0 || hasValidSchoolName) {
        try {
          const targetIdsList = Array.from(validSchoolIds).filter(Boolean);
          const clientDbs = getClientDatabases();
          const queryPromises: Array<Promise<{ collName: string; docs: any[] }>> = [];

          for (const clientDb of clientDbs) {
            for (const sId of targetIdsList) {
              for (const collName of ['individualStudents', 'students', 'users'] as const) {
                queryPromises.push(
                  getDocs(fsQuery(collection(clientDb, collName), where('schoolId', '==', sId)))
                    .then(snap => ({ collName, docs: snap.docs }))
                    .catch(() => ({ collName, docs: [] }))
                );
              }
            }
            if (hasValidSchoolName) {
              for (const collName of ['individualStudents', 'students', 'users'] as const) {
                queryPromises.push(
                  getDocs(fsQuery(collection(clientDb, collName), where('schoolName', '==', cleanSchoolName)))
                    .then(snap => ({ collName, docs: snap.docs }))
                    .catch(() => ({ collName, docs: [] }))
                );
              }
            }
          }

          const snapshots = await Promise.all(queryPromises);
          for (const { collName, docs } of snapshots) {
            for (const d of docs) {
              const data = d.data();
              if (collName === 'users') {
                const role = String(data.role || '').toUpperCase();
                if (!['STUDENT', 'SCHOLAR', 'CADET', 'INDIVIDUAL_STUDENT'].includes(role) && !data.isStudent) {
                  continue;
                }
              }
              const sId = String(data.schoolId || data.school_id || data.schoolDocId || '').trim();
              const sName = String(data.schoolName || data.school || '').trim().toLowerCase();
              const matchesSchool =
                (sId && validSchoolIds.has(sId)) ||
                (hasValidSchoolName && sName === cleanSchoolName.toLowerCase());
              if (!matchesSchool) continue;

              mergeRawRecord(d.id, collName, data);
            }
          }
        } catch (fsErr) {
          console.warn('Firestore school roster fetch error:', fsErr);
        }
      }

      // Deduplicate and build final student roster
      const list: Student[] = [];
      const seenKeys = new Set<string>();
      const defaultProg = schoolPrograms[0]?.name || 'Digital Literacy Junior';

      for (const { id: docId, collection: collName, data } of mergedByCanonicalId.values()) {
        const uname = String(data.username || '').toLowerCase().trim();
        const email = String(data.email || '').toLowerCase().trim();
        const uid = String(data.firebaseUid || data.userId || '').trim();
        const name = String(data.fullName || data.studentName || data.name || '').toLowerCase().trim();

        const isDup =
          (docId && seenKeys.has(`id:${docId}`)) ||
          (uid && seenKeys.has(`uid:${uid}`)) ||
          (uname && seenKeys.has(`u:${uname}`)) ||
          (email && !email.endsWith('.local') && seenKeys.has(`e:${email}`)) ||
          (name && name !== 'student' && seenKeys.has(`name:${name}`));

        if (isDup) continue;

        if (docId) seenKeys.add(`id:${docId}`);
        if (uid) seenKeys.add(`uid:${uid}`);
        if (uname) seenKeys.add(`u:${uname}`);
        if (email && !email.endsWith('.local')) seenKeys.add(`e:${email}`);
        if (name && name !== 'student') seenKeys.add(`name:${name}`);

        const resolvedClass = formatNormalizedClassDisplay(data.class || data.grade || data.classLevel, 'Grade 1');

        list.push({
          ...data,
          id: docId,
          collection: collName,
          fullName: data.fullName || data.studentName || data.name || 'Student',
          username: data.username || docId,
          email: data.email || null,
          class: resolvedClass,
          track: data.track || data.programName || data.plan || defaultProg,
          parentId: data.parentId || null,
          tutorId: data.tutorId || null,
          staffId: data.staffId || null,
          portalAccessEnabled: data.portalAccessEnabled !== false,
          accountStatus: data.accountStatus || data.status || 'ACTIVE',
          source: collName,
          enrolledPrograms: Array.isArray(data.enrolledPrograms) ? data.enrolledPrograms : [],
          subjects: Array.isArray(data.subjects) ? data.subjects : []
        });
      }

      list.sort((a, b) => String(a.fullName).localeCompare(String(b.fullName)));

      // Fetch strictly the programs assigned to this school
      try {
        const availableProgsMap = new Map<string, { id: string; name: string }>();

        const sd = matchedSchoolDoc?.data || (targetSchoolId ? (await getDoc(doc(db, 'schools', targetSchoolId)).catch(() => null))?.data() : null);
        if (sd) {
          if (Array.isArray(sd.programs) && sd.programs.length > 0) {
            sd.programs.forEach((p: any) => {
              const pName = p.name || p.title || 'Program Track';
              availableProgsMap.set(pName.toLowerCase().trim(), { id: p.id || pName, name: pName });
            });
          }
          if (Array.isArray(sd.assignedStaff)) {
            setSchoolTutors(sd.assignedStaff.map((s: any) => ({ id: s.id || s.uid || s.email, name: s.name || s.fullName || s.email })));
          }
        }

        setSchoolPrograms(Array.from(availableProgsMap.values()));
      } catch (pErr) {
        console.warn('School programs lookup error in roster:', pErr);
      }

      setStudents(list);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load roster.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  const openEditModal = (student: Student) => {
    setEditingStudent(student);
    const defaultProg = schoolPrograms[0]?.name || 'Digital Literacy Junior';
    const existingProgs = Array.isArray((student as any).enrolledPrograms) && (student as any).enrolledPrograms.length > 0
      ? (student as any).enrolledPrograms
      : Array.isArray(student.subjects) && student.subjects.length > 0
      ? student.subjects
      : student.track
      ? student.track.split(',').map((s: string) => s.trim()).filter(Boolean)
      : [defaultProg];

    setEditForm({
      fullName: student.fullName || '',
      class: normalizeClassName(student.class, 'Grade 1') || 'Grade 1',
      selectedPrograms: existingProgs,
      customProgram: '',
      email: student.email || '',
      tutorId: student.tutorId || '',
      tutorName: (student as any).tutorName || (student as any).assignedTutor || ''
    });
  };

  const saveStudentEdits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    setSavingStudent(true);
    try {
      const collectionName = editingStudent.collection || 'students';
      const targetDoc = doc(db, collectionName, editingStudent.id);

      const combinedSelected = Array.from(new Set([
        ...editForm.selectedPrograms,
        ...(editForm.customProgram ? [editForm.customProgram.trim()] : [])
      ])).filter(Boolean);

      const defaultProg = schoolPrograms[0]?.name || 'Digital Literacy Junior';
      const finalPrograms = combinedSelected.length > 0 ? combinedSelected : [defaultProg];
      const primaryProgram = finalPrograms[0];
      const trackString = finalPrograms.join(', ');

      const normalizedEditedClass = normalizeClassName(editForm.class, 'Grade 1') || editForm.class.trim();
      const payload: any = {
        fullName: editForm.fullName.trim(),
        name: editForm.fullName.trim(),
        class: normalizedEditedClass,
        grade: normalizedEditedClass,
        track: trackString,
        plan: primaryProgram,
        programName: primaryProgram,
        enrolledPrograms: finalPrograms,
        subjects: finalPrograms,
        plans: finalPrograms,
        programs: finalPrograms,
        email: editForm.email ? editForm.email.trim().toLowerCase() : null,
        tutorId: editForm.tutorId || null,
        tutorName: editForm.tutorName || null,
        assignedTutor: editForm.tutorName || null,
        updatedAt: new Date().toISOString()
      };

      await updateDoc(targetDoc, payload);

      toast.success(`Updated ${editForm.fullName} and assigned ${finalPrograms.length} program(s).`);
      setEditingStudent(null);
      await load(true);
    } catch (err) {
      console.error('Error saving student edits:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to save student details.');
    } finally {
      setSavingStudent(false);
    }
  };

  const updateAccess = async (student: Student, action: 'disable' | 'enable') => {
    try {
      if (!auth.currentUser) throw new Error('Your school session has expired.');
      const token = await auth.currentUser.getIdToken(true);
      const response = await fetch('/.netlify/functions/school-student-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ studentId: student.id, action })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Unable to update portal access.');
      toast.success(action === 'disable' ? 'Student portal access restricted.' : 'Student portal access restored.');
      await load(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update portal access.');
    }
  };

  const handleIssueCredentials = async (student: Student) => {
    setIssuingStudent(student);
    setIsIssuing(true);
    try {
      let username = String(student.username || '').trim().toLowerCase();
      if (!username) {
        const base = String(student.fullName || student.name || 'student').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'student';
        username = `${base}${Math.floor(100 + Math.random() * 900)}`;
      }

      // Generate access code in format JBS-XXXX-XXXX
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let p1 = '';
      let p2 = '';
      for (let i = 0; i < 4; i++) p1 += chars.charAt(Math.floor(Math.random() * chars.length));
      for (let i = 0; i < 4; i++) p2 += chars.charAt(Math.floor(Math.random() * chars.length));
      let generatedAccessCode = `JBS-${p1}-${p2}`;

      // 1. Try backend function first
      let serverSuccess = false;
      if (auth.currentUser) {
        try {
          const token = await auth.currentUser.getIdToken(true);
          const response = await fetch('/.netlify/functions/student-credential-issue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ studentId: student.id })
          });
          const result = await response.json().catch(() => ({}));
          if (response.ok && result.credentials?.accessCode) {
            generatedAccessCode = result.credentials.accessCode;
            username = result.credentials.username || username;
            serverSuccess = true;
          }
        } catch {
          // Fall through to Firestore
        }
      }

      // 2. Client-side Firestore write fallback
      let accessCodeHash = '';
      try {
        const msgBuffer = new TextEncoder().encode(generatedAccessCode.toUpperCase());
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        accessCodeHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
      } catch {
        accessCodeHash = generatedAccessCode.toLowerCase();
      }

      const now = new Date().toISOString();
      const payload = {
        username,
        accessCode: generatedAccessCode,
        passcode: generatedAccessCode,
        code: generatedAccessCode,
        accessCodeHash,
        portalAccessEnabled: true,
        accountStatus: 'ACTIVE',
        status: 'ACTIVE',
        credentialIssuedAt: now,
        credentialIssuedBy: auth.currentUser?.uid || 'school_admin',
        updatedAt: now
      };

      // Write to both individualStudents and students to keep sync
      await Promise.all([
        updateDoc(doc(db, 'individualStudents', student.id), payload).catch(async () => {
          await setDoc(doc(db, 'individualStudents', student.id), payload, { merge: true });
        }),
        updateDoc(doc(db, 'students', student.id), payload).catch(async () => {
          await setDoc(doc(db, 'students', student.id), payload, { merge: true });
        })
      ]);

      // If student has a linked firebaseUid, update users collection
      const linkedUid = String(student.firebaseUid || student.userId || '');
      if (linkedUid) {
        await setDoc(doc(db, 'users', linkedUid), {
          username,
          accessCode: generatedAccessCode,
          passcode: generatedAccessCode,
          code: generatedAccessCode,
          accessCodeHash,
          portalAccessEnabled: true,
          accountStatus: 'ACTIVE',
          status: 'ACTIVE',
          updatedAt: now
        }, { merge: true }).catch(() => null);
      }

      const cred: IssuedCredential = {
        studentId: student.id,
        studentName: student.fullName || student.name || 'Student',
        username,
        accessCode: generatedAccessCode,
        portal: `${window.location.origin}/portal`
      };
      setRevealedCredential(cred);
      toast.success(`Access code ${generatedAccessCode} issued for ${student.fullName}. Copy or download it now.`);
      await load(true);
    } catch (error) {
      console.error('Credential issuance error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to generate access credentials.');
    } finally {
      setIsIssuing(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Access code copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const exportTxt = (cred: IssuedCredential) => {
    const text = `====================================
JAYSTARBLISS STUDIOS
STUDENT PORTAL ACCESS PACK
====================================

Student Name: ${cred.studentName}
Portal Username: ${cred.username}
Access Code: ${cred.accessCode}
Login Portal: ${cred.portal}

Important Security Notice:
- Keep this access code secure.
- Use the username and access code to log in at ${cred.portal}
- Issued on: ${new Date().toLocaleString()}
====================================`;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${cred.studentName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-access-credentials.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = (cred: IssuedCredential) => {
    const pdf = new jsPDF();
    pdf.setFillColor(239, 68, 68);
    pdf.rect(0, 0, 210, 24, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(16);
    pdf.text('JAYSTARBLISS STUDIOS', 20, 16);
    
    pdf.setTextColor(30, 41, 59);
    pdf.setFontSize(18);
    pdf.text('Student Portal Access Pass', 20, 45);
    
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100, 116, 139);
    pdf.text('Official student authentication credential for the Jaystarbliss Learning Portal.', 20, 54);
    
    pdf.setDrawColor(226, 232, 240);
    pdf.setFillColor(248, 250, 252);
    pdf.roundedRect(20, 64, 170, 75, 4, 4, 'FD');
    
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(71, 85, 105);
    pdf.text('STUDENT NAME:', 30, 80);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(15, 23, 42);
    pdf.text(cred.studentName, 75, 80);
    
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(71, 85, 105);
    pdf.text('PORTAL USERNAME:', 30, 95);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(15, 23, 42);
    pdf.text(cred.username, 75, 95);
    
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(239, 68, 68);
    pdf.text('ACCESS CODE:', 30, 110);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(14);
    pdf.setTextColor(220, 38, 38);
    pdf.text(cred.accessCode, 75, 110);
    
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(71, 85, 105);
    pdf.text('LOGIN URL:', 30, 125);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(37, 99, 235);
    pdf.text(cred.portal, 75, 125);
    
    pdf.setFontSize(9);
    pdf.setTextColor(148, 163, 184);
    pdf.text(`Generated on ${new Date().toLocaleDateString('en-US', { dateStyle: 'full' })}. Keep this document secure.`, 20, 155);
    
    pdf.save(`${cred.studentName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-access-pass.pdf`);
  };

  useEffect(() => { void load(); }, [load]);

  const classGroups = useMemo(() => {
    const map = new Map<string, number>();
    students.forEach(s => {
      const key = formatNormalizedClassDisplay(s.class || s.grade, 'Grade 1');
      map.set(key, (map.get(key) || 0) + 1);
    });
    const ordered: readonly string[] = CANONICAL_CLASSES;
    return [...map.entries()].sort((a, b) => {
      const ia = ordered.indexOf(a[0]), ib = ordered.indexOf(b[0]);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ia < 0 && ib >= 0) return 1;
      return a[0].localeCompare(b[0], undefined, { numeric: true });
    });
  }, [students]);

  const trackGroups = useMemo(() => {
    const map = new Map<string, number>();
    students.forEach(s => {
      const defaultProg = schoolPrograms[0]?.name || 'Digital Literacy Junior';
      const progs = Array.isArray(s.enrolledPrograms) && s.enrolledPrograms.length > 0
        ? s.enrolledPrograms
        : Array.isArray(s.subjects) && s.subjects.length > 0
        ? s.subjects
        : s.track
        ? s.track.split(',').map((p: string) => p.trim()).filter(Boolean)
        : [defaultProg];
      progs.forEach((p: string) => {
        const cleanName = p.trim();
        if (cleanName) {
          map.set(cleanName, (map.get(cleanName) || 0) + 1);
        }
      });
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [students, schoolPrograms]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const defaultProg = schoolPrograms[0]?.name || 'Digital Literacy Junior';
    return students.filter(student => {
      // 1. Tab-based scoping
      if (filterTab === 'classes' && selectedClass !== 'All Classes') {
        const sClass = formatNormalizedClassDisplay(student.class || student.grade, 'Grade 1');
        if (sClass !== selectedClass) return false;
      }

      if (filterTab === 'tracks' && selectedTrack !== 'All Tracks') {
        const progs = Array.isArray(student.enrolledPrograms) && student.enrolledPrograms.length > 0
          ? student.enrolledPrograms
          : Array.isArray(student.subjects) && student.subjects.length > 0
          ? student.subjects
          : student.track
          ? student.track.split(',').map((p: string) => p.trim()).filter(Boolean)
          : [defaultProg];
        if (!progs.includes(selectedTrack)) return false;
      }

      // 2. Text Search
      if (term) {
        const match = [
          student.fullName,
          student.username,
          student.email,
          student.class,
          student.track,
          ...(Array.isArray(student.enrolledPrograms) ? student.enrolledPrograms : [])
        ].some(value => String(value || '').toLowerCase().includes(term));
        if (!match) return false;
      }

      return true;
    });
  }, [students, query, filterTab, selectedClass, selectedTrack]);

  return (
    <div className="space-y-6">
      <SEO title="Students Roster & Credentials | Jaystarbliss Studios" description="Secure school learner roster and portal access management." noindex />
      
      {/* Header Banner */}
      <div className="pro-surface rounded-3xl p-6 md:p-8 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="flex items-start gap-3.5">
            <div className="rounded-2xl bg-brand-red/10 p-3 text-brand-red shrink-0">
              <GraduationCap size={24}/>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-wider font-bold text-brand-red">School Administration</div>
              <h1 className="text-2xl md:text-3xl font-black mt-0.5 text-slate-900 dark:text-white">Students Roster &amp; Credentials</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
                Manage enrolled learners strictly registered under your school, assign academic curriculum tracks, and issue secure portal access credentials.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5 shrink-0">
            <button 
              type="button" 
              onClick={() => void load(true)} 
              disabled={loading || refreshing} 
              className="min-h-11 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 text-xs font-bold text-slate-700 dark:text-slate-300 inline-flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {refreshing ? <Loader2 size={15} className="animate-spin"/> : <RefreshCw size={15}/>} Refresh
            </button>
            <Link 
              to="/portal/school/onboard-student" 
              className="min-h-11 rounded-xl bg-brand-red hover:bg-red-700 text-white px-5 text-xs font-bold inline-flex items-center gap-2 shadow-xs transition-colors"
            >
              <Plus size={16}/> Onboard Student
            </Link>
          </div>
        </div>
      </div>

      {/* 3 Dedicated Filter Tabs */}
      <div className="pro-surface rounded-2xl p-4 md:p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
        {/* Main 3 Filter Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl w-full sm:w-fit">
          <button
            type="button"
            onClick={() => { setFilterTab('all'); setSelectedClass('All Classes'); setSelectedTrack('All Tracks'); }}
            className={`flex-1 sm:flex-initial px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              filterTab === 'all'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            All Students ({students.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('classes')}
            className={`flex-1 sm:flex-initial px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              filterTab === 'classes'
                ? 'bg-white dark:bg-slate-900 text-brand-red font-black shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Classes ({classGroups.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('tracks')}
            className={`flex-1 sm:flex-initial px-4 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              filterTab === 'tracks'
                ? 'bg-white dark:bg-slate-900 text-brand-red font-black shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Program Tracks ({trackGroups.length})
          </button>
        </div>

        {/* Tab Content: Classes Selector */}
        {filterTab === 'classes' && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Select School Class Cohort
              </span>
              <span className="text-[11px] text-slate-400">
                Showing students registered under your school only
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedClass('All Classes')}
                className={`min-h-9 px-3.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  selectedClass === 'All Classes'
                    ? 'bg-brand-red text-white border-brand-red shadow-xs'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                }`}
              >
                All Classes ({students.length})
              </button>
              {classGroups.map(([name, count]) => (
                <button
                  type="button"
                  key={name}
                  onClick={() => setSelectedClass(name)}
                  className={`min-h-9 px-3.5 rounded-xl text-xs font-bold border inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                    selectedClass === name
                      ? 'bg-brand-red text-white border-brand-red shadow-xs'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                  }`}
                >
                  <span>{name}</span>
                  <span className={`text-[10px] font-mono ${selectedClass === name ? 'text-white/80' : 'text-slate-400'}`}>
                    ({count})
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tab Content: Program Tracks Selector */}
        {filterTab === 'tracks' && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Filter by Assigned Curriculum Track
              </span>
              <span className="text-[11px] text-slate-400">
                Tracks configured for your school
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedTrack('All Tracks')}
                className={`min-h-9 px-3.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  selectedTrack === 'All Tracks'
                    ? 'bg-brand-red text-white border-brand-red shadow-xs'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                }`}
              >
                All Tracks ({students.length})
              </button>
              {trackGroups.map(([name, count]) => (
                <button
                  type="button"
                  key={name}
                  onClick={() => setSelectedTrack(name)}
                  className={`min-h-9 px-3.5 rounded-xl text-xs font-bold border inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                    selectedTrack === name
                      ? 'bg-brand-red text-white border-brand-red shadow-xs'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                  }`}
                >
                  <span>{name}</span>
                  <span className={`text-[10px] font-mono ${selectedTrack === name ? 'text-white/80' : 'text-slate-400'}`}>
                    ({count})
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Search Bar */}
      <div className="pro-surface rounded-2xl p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-xl">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input 
              value={query} 
              onChange={e => setQuery(e.target.value)} 
              placeholder="Search by student name, username, class cohort, or track..." 
              className="w-full min-h-10 rounded-xl border border-slate-200 dark:border-slate-800 pl-10 pr-3 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-red/30"
            />
          </div>
          <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
            Showing {filtered.length} of {students.length} students
          </div>
        </div>
      </div>

      {/* Main Student List / Table */}
      {loading ? (
        <div className="pro-surface rounded-2xl p-12 flex items-center justify-center gap-3 text-xs text-slate-500 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
          <Loader2 className="animate-spin text-brand-red" size={20}/> Loading student roster…
        </div>
      ) : students.length === 0 ? (
        <div className="pro-surface rounded-2xl p-12 text-center bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
            <UserRound size={28}/>
          </div>
          <h2 className="font-black text-base mt-4 text-slate-900 dark:text-white">No students onboarded in your school yet</h2>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Add learners to your institution's portal roster to generate login credentials and assign curriculum courses.
          </p>
          <Link 
            to="/portal/school/onboard-student" 
            className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl bg-brand-red px-5 text-xs font-bold text-white shadow-xs hover:bg-red-700 transition-colors"
          >
            <Plus size={15}/> Onboard First Student
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="pro-surface rounded-2xl p-12 text-center bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
          <Search size={26} className="mx-auto text-slate-400"/>
          <h2 className="font-bold text-sm mt-3 text-slate-900 dark:text-white">No matching students found</h2>
          <p className="text-xs text-slate-500 mt-1">Try a different keyword or switch the class filter tab above.</p>
        </div>
      ) : (
        <div className="pro-surface rounded-2xl overflow-hidden shadow-xs border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900">
          <div className="hidden md:grid grid-cols-[1.5fr_1fr_1.2fr_0.9fr_1.8fr] gap-4 px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 text-[11px] uppercase tracking-wider font-bold text-slate-400 bg-slate-50/70 dark:bg-slate-950">
            <span>Student &amp; Account</span>
            <span>Class Level</span>
            <span>Curriculum Track</span>
            <span>Portal Status</span>
            <span className="text-right">Actions</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {filtered.map(student => (
              <div 
                key={`${student.collection}-${student.id}`} 
                className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1.2fr_0.9fr_1.8fr] gap-3 md:gap-4 px-5 py-3.5 items-center hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
              >
                {/* Student Info */}
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-slate-900 text-white dark:bg-slate-800 flex items-center justify-center shrink-0 font-black text-xs">
                    {student.fullName ? student.fullName.charAt(0).toUpperCase() : <UserRound size={16}/>}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-xs sm:text-sm truncate text-slate-900 dark:text-white">
                      {student.fullName || 'Unnamed Student'}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate flex items-center gap-1.5 mt-0.5">
                      <span className="font-mono text-brand-red">@{student.username || 'pending'}</span>
                      {student.email && <span className="text-slate-400">• {student.email}</span>}
                    </div>
                  </div>
                </div>

                {/* Class */}
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  <span className="md:hidden text-[10px] uppercase text-slate-400 mr-2 font-normal">Class:</span>
                  {formatNormalizedClassDisplay(student.class || student.grade, 'Grade 1')}
                </div>

                {/* Track / Programs */}
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  <span className="md:hidden text-[10px] uppercase text-slate-400 mr-2 font-normal">Track:</span>
                  {(() => {
                    const progList = Array.isArray((student as any).enrolledPrograms) && (student as any).enrolledPrograms.length > 0
                      ? (student as any).enrolledPrograms
                      : Array.isArray(student.subjects) && student.subjects.length > 0
                      ? student.subjects
                      : student.track
                      ? student.track.split(',').map((s: string) => s.trim()).filter(Boolean)
                      : [schoolPrograms[0]?.name || 'Digital Literacy Junior'];

                    return (
                      <span className="font-medium truncate block max-w-xs" title={progList.join(', ')}>
                        {progList.join(' • ')}
                      </span>
                    );
                  })()}
                </div>

                {/* Status */}
                <div>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${
                    student.portalAccessEnabled && String(student.accountStatus).toUpperCase() === 'ACTIVE'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      student.portalAccessEnabled && String(student.accountStatus).toUpperCase() === 'ACTIVE'
                        ? 'bg-emerald-500'
                        : 'bg-amber-500'
                    }`} />
                    {student.portalAccessEnabled && String(student.accountStatus).toUpperCase() === 'ACTIVE' ? 'Active' : 'Restricted'}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-start md:justify-end gap-2 flex-wrap">
                  <button 
                    type="button" 
                    onClick={() => openEditModal(student)} 
                    className="min-h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 text-xs font-bold inline-flex items-center gap-1 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                    title="Edit student details & assign track"
                  >
                    <Edit3 size={12}/> Edit
                  </button>

                  <button 
                    type="button" 
                    onClick={() => void handleIssueCredentials(student)} 
                    disabled={isIssuing && issuingStudent?.id === student.id}
                    className="min-h-8 rounded-lg bg-brand-red text-white px-3 text-xs font-bold inline-flex items-center gap-1 hover:bg-red-700 disabled:opacity-50 transition-colors cursor-pointer"
                    title="Generate and issue new login access code"
                  >
                    {isIssuing && issuingStudent?.id === student.id ? (
                      <Loader2 size={12} className="animate-spin"/>
                    ) : (
                      <KeyRound size={12}/>
                    )}
                    Issue Code
                  </button>

                  <button 
                    type="button" 
                    onClick={() => void updateAccess(student, student.portalAccessEnabled ? 'disable' : 'enable')} 
                    className={`min-h-8 rounded-lg border px-2 text-xs font-bold inline-flex items-center gap-1 transition-colors cursor-pointer ${
                      student.portalAccessEnabled && String(student.accountStatus).toUpperCase() === 'ACTIVE'
                        ? 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-red-600'
                        : 'border-emerald-300 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                    }`}
                  >
                    {student.portalAccessEnabled && String(student.accountStatus).toUpperCase() === 'ACTIVE' ? (
                      <><UserX size={12}/> Disable</>
                    ) : (
                      <><UserCheck size={12}/> Enable</>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit Student & Assign Learning Track Modal */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-hidden animate-in fade-in duration-150">
          <form 
            onSubmit={saveStudentEdits}
            className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#161B26] border border-slate-200 dark:border-slate-800 shadow-2xl p-6 sm:p-7 space-y-4 text-slate-900 dark:text-white max-h-[85dvh] flex flex-col"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-red-50 dark:bg-red-950/40 text-brand-red">
                    <Edit3 size={16}/>
                  </span>
                  <h3 className="font-black text-base">Edit Student &amp; Assign Track</h3>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Update learner profile, class cohort, and assign curriculum track / faculty tutor.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X size={18}/>
              </button>
            </div>

            <div className="space-y-3.5 flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={editForm.fullName}
                  onChange={e => setEditForm({ ...editForm, fullName: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-red"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Class Cohort
                  </label>
                  <select
                    required
                    value={normalizeClassName(editForm.class) || editForm.class || 'Grade 7'}
                    onChange={e => setEditForm({ ...editForm, class: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-red"
                  >
                    {CANONICAL_CLASSES.map(cls => (
                      <option key={cls} value={cls}>{cls}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Student Email (Optional)
                  </label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                    placeholder="student@school.edu"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-red"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Assigned Learning Programs ({editForm.selectedPrograms.length} Selected)
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditForm(prev => ({ ...prev, selectedPrograms: schoolPrograms.map(p => p.name) }))}
                      className="text-[10px] font-bold text-brand-red hover:underline"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300 dark:text-slate-700">•</span>
                    <button
                      type="button"
                      onClick={() => setEditForm(prev => ({ ...prev, selectedPrograms: [] }))}
                      className="text-[10px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {schoolPrograms.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 custom-scrollbar">
                      {schoolPrograms.map(p => {
                        const isChecked = editForm.selectedPrograms.includes(p.name);
                        return (
                          <label 
                            key={p.id} 
                            className={`flex items-center gap-2 p-2 rounded-lg border text-xs font-bold cursor-pointer transition-all ${
                              isChecked 
                                ? 'border-brand-red bg-red-50/50 dark:bg-red-950/30 text-brand-red ring-1 ring-brand-red/30' 
                                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={e => {
                                setEditForm(prev => ({
                                  ...prev,
                                  selectedPrograms: e.target.checked
                                    ? Array.from(new Set([...prev.selectedPrograms, p.name]))
                                    : prev.selectedPrograms.filter(name => name !== p.name)
                                }));
                              }}
                              className="rounded border-slate-300 text-brand-red focus:ring-brand-red"
                            />
                            <span className="truncate">{p.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-3 text-xs text-slate-400 rounded-xl border border-dashed border-slate-200 dark:border-slate-800">
                      No active institutional programs found. Enter a custom track name below.
                    </div>
                  )}

                  <div>
                    <label className="text-[11px] font-bold text-slate-500 block mb-1">
                      + Add Custom Program Track (Optional)
                    </label>
                    <input
                      type="text"
                      value={editForm.customProgram}
                      onChange={e => setEditForm({ ...editForm, customProgram: e.target.value })}
                      placeholder="e.g. Robotics &amp; AI Engineering..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-red"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Assigned Faculty Mentor / Tutor (Optional)
                </label>
                {schoolTutors.length > 0 ? (
                  <select
                    value={editForm.tutorName}
                    onChange={e => {
                      const sel = schoolTutors.find(t => t.name === e.target.value);
                      setEditForm({ ...editForm, tutorName: e.target.value, tutorId: sel?.id || '' });
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none"
                  >
                    <option value="">-- Select faculty instructor --</option>
                    {schoolTutors.map(t => (
                      <option key={t.id} value={t.name}>{t.name}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={editForm.tutorName}
                    onChange={e => setEditForm({ ...editForm, tutorName: e.target.value })}
                    placeholder="e.g. Instructor John Doe"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-red"
                  />
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingStudent}
                className="px-5 py-2 rounded-xl bg-brand-red hover:bg-red-700 text-white text-xs font-black inline-flex items-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50"
              >
                {savingStudent ? <Loader2 size={13} className="animate-spin"/> : <Check size={13}/>}
                <span>Save Changes &amp; Assign</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Credential Modal Popup */}
      {revealedCredential && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#161B26] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-brand-red text-white p-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                  <KeyRound size={22} className="text-white"/>
                </div>
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-white/80">Security Credential</div>
                  <h3 className="text-lg font-black">{revealedCredential.studentName}</h3>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setRevealedCredential(null)} 
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors"
              >
                <X size={18}/>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20 p-4 text-xs text-amber-900 dark:text-amber-300 flex items-start gap-3">
                
                <div>
                  <strong>Write-Once Access Code:</strong> This fresh access code has been securely hashed and stored. Provide these credentials to the student now; the code is not visible again after closing this window.
                </div>
              </div>

              <div className="space-y-3 bg-slate-50 dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Portal Username</div>
                  <div className="font-mono text-sm font-bold text-slate-900 dark:text-white mt-0.5 select-all">
                    {revealedCredential.username}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Fresh Access Code</div>
                  <div className="flex items-center justify-between gap-3 mt-1">
                    <span className="font-mono text-xl font-black text-brand-red tracking-wider select-all">
                      {revealedCredential.accessCode}
                    </span>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(revealedCredential.accessCode)}
                      className="min-h-9 px-3 rounded-xl bg-slate-900 dark:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1.5 hover:bg-slate-800"
                    >
                      {copied ? <Check size={14} className="text-emerald-400"/> : <Copy size={14}/>}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Login Portal URL</div>
                  <div className="font-mono text-xs text-blue-600 dark:text-blue-400 mt-0.5 select-all">
                    {revealedCredential.portal}
                  </div>
                </div>
              </div>

              {/* Download Buttons */}
              <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => exportPdf(revealedCredential)}
                  className="flex-1 min-h-11 rounded-xl bg-slate-900 dark:bg-white dark:text-slate-900 text-white px-4 text-xs font-black inline-flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                >
                  <FileText size={15}/> Download PDF Pass
                </button>
                <button
                  type="button"
                  onClick={() => exportTxt(revealedCredential)}
                  className="flex-1 min-h-11 rounded-xl border border-slate-200 dark:border-slate-800 px-4 text-xs font-black inline-flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
                >
                  <Download size={15}/> Download TXT File
                </button>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200/60 dark:border-slate-800 flex items-center justify-between">
              <button
                type="button"
                disabled={isIssuing}
                onClick={() => {
                  const target = students.find(s => s.id === revealedCredential.studentId) || { id: revealedCredential.studentId, fullName: revealedCredential.studentName, username: revealedCredential.username, collection: 'individualStudents', class: 'General', track: '', parentId: null, tutorId: null, staffId: null, portalAccessEnabled: true, accountStatus: 'ACTIVE', source: 'individualStudents' };
                  void handleIssueCredentials(target as Student);
                }}
                className="min-h-10 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-bold inline-flex items-center gap-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isIssuing ? <Loader2 size={14} className="animate-spin text-brand-red"/> : <RefreshCw size={14} className="text-brand-red"/>}
                <span>Rotate Access Code</span>
              </button>

              <button
                type="button"
                onClick={() => setRevealedCredential(null)}
                className="min-h-10 px-6 rounded-xl bg-brand-red text-white text-xs font-black hover:bg-brand-red/90 cursor-pointer shadow-sm active:scale-95"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Safety Notice */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B26] p-5 text-xs text-slate-500 flex items-start gap-3">
        <AlertCircle size={18} className="shrink-0 mt-0.5 text-brand-red"/>
        <div>
          <strong className="text-slate-700 dark:text-slate-300">Institutional Credential Governance:</strong> When a student credential is re-issued or rotated, any previous access code is automatically invalidated. The student can also change their password independently once logged into their student portal.
        </div>
      </div>
    </div>
  );
};

export default SchoolRoster;
