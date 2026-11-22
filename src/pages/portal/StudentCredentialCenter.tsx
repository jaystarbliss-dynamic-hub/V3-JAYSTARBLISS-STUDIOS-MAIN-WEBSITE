import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  FileText,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Search,
  Check,
  Copy,
  AlertCircle,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  Eye,
} from 'lucide-react';
import { billingPost } from '../../lib/billing';
import { generateAccessPassPdf } from '../../lib/pdf/accessPassPdfGenerator';
import { useToast } from '../../contexts/ToastContext';
import SEO from '../../components/ui/SEO';
import { auth, db, getStandbyFirestore } from '../../lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { CANONICAL_CLASSES, formatNormalizedClassDisplay } from '../../lib/classes';
import { migrateAllFirestoreClasses } from '../../lib/classMigration';
import { fetchAcademicStudentsFallback } from '../../lib/academicFallback';
import { getEffectiveAuth } from '../../utils/impersonation';
import { claimGlobalUsername, ensureUniqueGeneratedUsername } from '../../lib/usernameRegistry';

type Props = { role: 'staff' | 'school' };
type Student = {
  id: string;
  fullName?: string;
  studentName?: string;
  name?: string;
  username?: string;
  class?: string;
  classLevel?: string;
  grade?: string;
  schoolName?: string;
  schoolId?: string;
  parentName?: string;
  assignmentCategory?: 'school' | 'private';
  track?: string;
  programName?: string;
  accessCode?: string;
  portalAccessEnabled?: boolean;
  accountStatus?: string;
  updatedAt?: string;
};

const PAGE_SIZE = 10;

const StudentCredentialCenter: React.FC<Props> = ({ role }) => {
  const { toast } = useToast();
  const isSchool = role === 'school';
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [issued, setIssued] = useState<Record<string, { username: string; accessCode: string; portal: string }>>({});
  // Track codes explicitly generated/rotated in this session so they display in plaintext immediately
  const [sessionRevealedIds, setSessionRevealedIds] = useState<Record<string, boolean>>({});
  const [filterTab, setFilterTab] = useState<'all' | 'school' | 'private' | 'classes' | 'tracks'>('all');
  const [selectedClass, setSelectedClass] = useState('All Classes');
  const [selectedTrack, setSelectedTrack] = useState('All Tracks');
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'name' | 'class'>('name');
  const [currentPage, setCurrentPage] = useState(1);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const load = async () => {
    setLoading(true);
    const combinedMap = new Map<string, Student>();

    try {
      await migrateAllFirestoreClasses().catch(() => null);
      const effective = getEffectiveAuth();
      const currentUser = auth.currentUser;
      const targetSchoolId =
        effective.effectiveSchoolId ||
        sessionStorage.getItem('schoolId') ||
        localStorage.getItem('jaystar_cached_school_id') ||
        (isSchool ? effective.effectiveUid || currentUser?.uid : '') ||
        '';

      // For staff/tutors, always load all assigned students (both school-assigned and private learners)
      if (!isSchool) {
        const tutorStudents = await fetchAcademicStudentsFallback().catch(() => []);
        tutorStudents.forEach((s) => {
          combinedMap.set(s.id, {
            id: s.id,
            fullName: s.fullName,
            studentName: s.fullName,
            username: s.username || s.id,
            class: formatNormalizedClassDisplay(s.class || s.grade, 'Grade 1'),
            schoolName: s.schoolName || '',
            schoolId: s.schoolId || '',
            parentName: s.parentName || '',
            assignmentCategory: s.assignmentCategory,
            track: s.track || s.plan || 'Digital Literacy Junior',
            accessCode: s.accessCode,
            portalAccessEnabled: s.portalAccessEnabled !== false,
            accountStatus: s.accountStatus || 'ACTIVE',
          });
        });
      }

      if (currentUser && isSchool) {
        try {
          const token = await currentUser.getIdToken();
          const url =
            '/.netlify/functions/school-students' +
            (targetSchoolId ? `?schoolId=${encodeURIComponent(targetSchoolId)}` : '');
          const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
          const resJson = await res.json();
          if (res.ok && Array.isArray(resJson?.students)) {
            resJson.students.forEach((s: any) => {
              if (s && s.id) {
                if (isSchool && targetSchoolId && s.schoolId !== targetSchoolId) return;
                const existingCode = String(s.accessCode || s.passcode || s.code || '').trim();
                combinedMap.set(s.id, {
                  id: s.id,
                  fullName: s.fullName || s.studentName || s.name || 'Student',
                  studentName: s.fullName || s.studentName || s.name || 'Student',
                  username: s.username || s.id,
                  class: formatNormalizedClassDisplay(s.class || s.classLevel || s.grade, 'Grade 1'),
                  schoolName: s.schoolName || '',
                  schoolId: s.schoolId || targetSchoolId,
                  assignmentCategory: 'school',
                  track: s.track || s.programName || s.plan || 'Digital Literacy Junior',
                  accessCode: existingCode || undefined,
                  portalAccessEnabled: s.portalAccessEnabled !== false,
                  accountStatus: s.accountStatus || 'ACTIVE',
                });
              }
            });
          }
        } catch (err) {
          console.warn('school-students fetch in CredentialCenter:', err);
        }

        if (combinedMap.size === 0 && isSchool && targetSchoolId) {
          try {
            const queries = [
              query(collection(db, 'students'), where('schoolId', '==', targetSchoolId)),
              query(collection(db, 'individualStudents'), where('schoolId', '==', targetSchoolId)),
              query(collection(db, 'users'), where('schoolId', '==', targetSchoolId)),
            ];
            const snapshots = await Promise.all(queries.map((q) => getDocs(q).catch(() => null)));
            const seenKeys = new Set<string>();

            const isDuplicate = (d: any, docId: string): boolean => {
              const uname = String(d.username || '').toLowerCase().trim();
              const email = String(d.email || '').toLowerCase().trim();
              const uid = String(d.firebaseUid || d.userId || '').trim();
              const sDocId = String(d.studentDocId || docId).trim();
              const name = String(d.fullName || d.studentName || d.name || '').toLowerCase().trim();

              if (docId && seenKeys.has(`id:${docId}`)) return true;
              if (sDocId && seenKeys.has(`docId:${sDocId}`)) return true;
              if (uid && seenKeys.has(`uid:${uid}`)) return true;
              if (uname && seenKeys.has(`u:${uname}`)) return true;
              if (email && !email.endsWith('.local') && seenKeys.has(`e:${email}`)) return true;
              if (name && seenKeys.has(`name:${name}`)) return true;
              return false;
            };

            const recordSeen = (d: any, docId: string) => {
              const uname = String(d.username || '').toLowerCase().trim();
              const email = String(d.email || '').toLowerCase().trim();
              const uid = String(d.firebaseUid || d.userId || '').trim();
              const sDocId = String(d.studentDocId || docId).trim();
              const name = String(d.fullName || d.studentName || d.name || '').toLowerCase().trim();

              if (docId) seenKeys.add(`id:${docId}`);
              if (sDocId) seenKeys.add(`docId:${sDocId}`);
              if (uid) seenKeys.add(`uid:${uid}`);
              if (uname) seenKeys.add(`u:${uname}`);
              if (email && !email.endsWith('.local')) seenKeys.add(`e:${email}`);
              if (name) seenKeys.add(`name:${name}`);
            };

            snapshots.forEach((snap) => {
              if (!snap) return;
              snap.docs.forEach((d) => {
                const data = d.data();
                const key = String(data.studentDocId || d.id);
                const sId = String(data.schoolId || data.school_id || '').trim();
                if (sId !== targetSchoolId) return;
                if (isDuplicate(data, d.id)) return;
                recordSeen(data, d.id);

                const existingCode = String(data.accessCode || data.passcode || data.code || '').trim();
                combinedMap.set(key, {
                  id: key,
                  fullName: data.fullName || data.studentName || data.name || 'Student',
                  studentName: data.fullName || data.studentName || data.name || 'Student',
                  username: data.username || key,
                  class: formatNormalizedClassDisplay(data.class || data.classLevel || data.grade, 'Grade 1'),
                  schoolName: data.schoolName || '',
                  schoolId: targetSchoolId,
                  assignmentCategory: 'school',
                  track: data.track || data.programName || data.plan || 'Digital Literacy Junior',
                  accessCode: existingCode || undefined,
                  portalAccessEnabled: data.portalAccessEnabled !== false,
                  accountStatus: data.accountStatus || 'ACTIVE',
                });
              });
            });
          } catch (fsErr) {
            console.warn('Direct Firestore fallback error in CredentialCenter:', fsErr);
          }
        }
      }

      const loadedList = Array.from(combinedMap.values());
      setStudents(loadedList);
      setIssued((prev) => {
        const next = { ...prev };
        loadedList.forEach((st) => {
          if (st.accessCode && !next[st.id]) {
            next[st.id] = {
              username: st.username || st.id,
              accessCode: st.accessCode,
              portal: `${window.location.origin}/portal`,
            };
          }
        });
        return next;
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load students.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const classGroups = useMemo(() => {
    const map = new Map<string, number>();
    students.forEach((student) => {
      const key = formatNormalizedClassDisplay(student.class || student.classLevel || student.grade, 'Grade 1');
      map.set(key, (map.get(key) || 0) + 1);
    });
    const ordered: readonly string[] = CANONICAL_CLASSES;
    return Array.from(map.entries()).sort((a, b) => {
      const ia = ordered.indexOf(a[0]);
      const ib = ordered.indexOf(b[0]);
      if (ia >= 0 && ib >= 0) return ia - ib;
      if (ia >= 0) return -1;
      if (ia < 0 && ib >= 0) return 1;
      return a[0].localeCompare(b[0], undefined, { numeric: true });
    });
  }, [students]);

  const trackGroups = useMemo(() => {
    const map = new Map<string, number>();
    students.forEach((student) => {
      const t = (student.track || student.programName || 'Digital Literacy Junior').trim();
      const parts = t
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const list = parts.length > 0 ? parts : ['Digital Literacy Junior'];
      list.forEach((p) => map.set(p, (map.get(p) || 0) + 1));
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [students]);

  const visibleStudents = useMemo(() => {
    const filtered = students.filter((student) => {
      const studentClass = formatNormalizedClassDisplay(
        student.class || student.classLevel || student.grade,
        'Grade 1'
      );
      const studentTrack = (student.track || student.programName || 'Digital Literacy Junior').trim();
      const isSchoolStudent =
        student.assignmentCategory === 'school' ||
        Boolean(student.schoolId && student.schoolId !== 'private');

      if (filterTab === 'school' && !isSchoolStudent) return false;
      if (filterTab === 'private' && isSchoolStudent) return false;
      if (filterTab === 'classes' && selectedClass !== 'All Classes' && studentClass !== selectedClass) {
        return false;
      }
      if (filterTab === 'tracks' && selectedTrack !== 'All Tracks' && !studentTrack.includes(selectedTrack)) {
        return false;
      }

      if (searchTerm.trim()) {
        const queryStr = searchTerm.toLowerCase();
        const name = String(student.fullName || student.studentName || student.name || '').toLowerCase();
        const user = String(student.username || '').toLowerCase();
        const cl = String(studentClass).toLowerCase();
        const tr = String(studentTrack).toLowerCase();
        const sch = String(student.schoolName || '').toLowerCase();
        const par = String(student.parentName || '').toLowerCase();
        if (
          !name.includes(queryStr) &&
          !user.includes(queryStr) &&
          !cl.includes(queryStr) &&
          !tr.includes(queryStr) &&
          !sch.includes(queryStr) &&
          !par.includes(queryStr)
        ) {
          return false;
        }
      }
      return true;
    });

    return filtered.sort((a, b) => {
      if (sortBy === 'class') {
        const ca = formatNormalizedClassDisplay(a.class || a.classLevel || a.grade, 'Grade 1');
        const cb = formatNormalizedClassDisplay(b.class || b.classLevel || b.grade, 'Grade 1');
        const cmp = ca.localeCompare(cb, undefined, { numeric: true });
        if (cmp !== 0) return cmp;
      }
      const na = String(a.fullName || a.studentName || a.name || '');
      const nb = String(b.fullName || b.studentName || b.name || '');
      return na.localeCompare(nb);
    });
  }, [students, filterTab, selectedClass, selectedTrack, searchTerm, sortBy]);

  // Reset pagination whenever filters or search change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterTab, selectedClass, selectedTrack, searchTerm, sortBy]);

  const totalPages = Math.max(1, Math.ceil(visibleStudents.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safePage - 1) * PAGE_SIZE;
  const paginatedStudents = visibleStudents.slice(pageStartIndex, pageStartIndex + PAGE_SIZE);

  const issue = async (student: Student) => {
    setBusyId(student.id);
    try {
      let credentials: { username: string; accessCode: string; portal: string } | null = null;
      try {
        const result = await billingPost<any>('student-credential-issue', { studentId: student.id });
        if (result && result.credentials?.accessCode) {
          credentials = result.credentials;
        }
      } catch {
        // Fallback to direct Firestore
      }

      if (!credentials) {
        const linkedUid = String((student as any).firebaseUid || (student as any).userId || '').trim();
        const rawCandidate =
          String(student.username || '').trim().toLowerCase() ||
          `${String(student.fullName || student.studentName || 'student')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .slice(0, 10) || 'student'}${Math.floor(100 + Math.random() * 900)}`;
        const username = await ensureUniqueGeneratedUsername(rawCandidate, [student.id, linkedUid]);

        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let p1 = '';
        let p2 = '';
        for (let i = 0; i < 4; i++) p1 += chars.charAt(Math.floor(Math.random() * chars.length));
        for (let i = 0; i < 4; i++) p2 += chars.charAt(Math.floor(Math.random() * chars.length));
        const generatedCode = `JBS-${p1}-${p2}`;

        let accessCodeHash = '';
        try {
          const msgBuffer = new TextEncoder().encode(generatedCode.toUpperCase());
          const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
          accessCodeHash = Array.from(new Uint8Array(hashBuffer))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
        } catch {
          accessCodeHash = generatedCode.toLowerCase();
        }

        const now = new Date().toISOString();
        const updatePayload = {
          username,
          accessCode: generatedCode,
          passcode: generatedCode,
          code: generatedCode,
          accessCodeHash,
          portalAccessEnabled: true,
          accountStatus: 'ACTIVE',
          status: 'ACTIVE',
          credentialIssuedAt: now,
          credentialIssuedBy: auth.currentUser?.uid || 'school_admin',
          updatedAt: now,
        };

        const { setDoc, doc, addDoc, collection: fsCollection } = await import('firebase/firestore');
        const standbyDb = getStandbyFirestore();
        await Promise.all([
          setDoc(doc(db, 'individualStudents', student.id), updatePayload, { merge: true }),
          setDoc(doc(db, 'students', student.id), updatePayload, { merge: true }),
          ...(linkedUid ? [setDoc(doc(db, 'users', linkedUid), updatePayload, { merge: true }).catch(() => null)] : []),
          setDoc(doc(standbyDb, 'individualStudents', student.id), updatePayload, { merge: true }).catch(() => null),
          setDoc(doc(standbyDb, 'students', student.id), updatePayload, { merge: true }).catch(() => null),
          ...(linkedUid ? [setDoc(doc(standbyDb, 'users', linkedUid), updatePayload, { merge: true }).catch(() => null)] : []),
          claimGlobalUsername(username, {
            uid: linkedUid || student.id,
            docId: student.id,
            role: 'STUDENT',
            name: String(student.fullName || student.studentName || 'Student'),
          }),
        ]);

        await addDoc(fsCollection(db, 'activityLogs'), {
          actorId: auth.currentUser?.uid || 'school_admin',
          action: 'STUDENT_CREDENTIAL_ROTATED',
          targetId: student.id,
          targetType: 'student',
          schoolId: student.schoolId || null,
          timestamp: new Date(),
          metadata: { username, accessCode: generatedCode },
        }).catch(() => null);

        credentials = {
          username,
          accessCode: generatedCode,
          portal: `${window.location.origin}/portal`,
        };
      }

      setIssued((prev) => ({ ...prev, [student.id]: credentials! }));
      setSessionRevealedIds((prev) => ({ ...prev, [student.id]: true }));
      toast.success(
        `Access code ${credentials.accessCode} generated for ${student.fullName || student.studentName || 'student'}. Copy or download it now.`
      );
    } catch (error) {
      console.error('Credential generation error:', error);
      toast.error(error instanceof Error ? error.message : 'Unable to issue credentials.');
    } finally {
      setBusyId(null);
    }
  };

  const copyCredential = (student: Student) => {
    const credentials = issued[student.id];
    if (!credentials) {
      toast.error('Issue a code first before copying credentials.');
      return;
    }
    const name = String(student.fullName || student.studentName || 'Student');
    const text = `JAYSTARBLISS STUDIOS PORTAL ACCESS\nStudent: ${name}\nUsername: ${credentials.username}\nAccess Code: ${credentials.accessCode}\nLogin URL: ${window.location.origin}/portal`;
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopiedId(student.id);
        toast.success('Credentials copied to clipboard.');
        setTimeout(() => setCopiedId(null), 2500);
      })
      .catch(() => {
        toast.error('Could not copy to clipboard.');
      });
  };

  const exportPack = (student: Student) => {
    const credentials = issued[student.id];
    if (!credentials) {
      toast.error('Issue a fresh access code before exporting the access pack.');
      return;
    }
    const name = String(student.fullName || student.studentName || 'Student');
    const text = `========================================\nJAYSTARBLISS STUDIOS — STUDENT ACCESS PACK\n========================================\n\nStudent Name: ${name}\nClass: ${student.class || student.classLevel || student.grade || 'General'}\nSchool: ${student.schoolName || 'Partner School'}\n\nPORTAL LOGIN CREDENTIALS:\n-------------------------\nUsername:    ${credentials.username}\nAccess Code: ${credentials.accessCode}\nLogin Portal: ${window.location.origin}/portal\n\n* Keep these credentials private and confidential.\n* Issued on: ${new Date().toLocaleDateString('en-NG', { dateStyle: 'full' })}\n========================================`;
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-student-access.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportPdf = (student: Student) => {
    const credentials = issued[student.id];
    if (!credentials) {
      toast.error('Issue a fresh access code before exporting the PDF pass.');
      return;
    }
    const name = String(student.fullName || student.studentName || 'Student');
    const studentClass = String(student.class || student.classLevel || student.grade || 'General');
    const isPrivate = student.assignmentCategory === 'private';

    void generateAccessPassPdf({
      studentId: student.id,
      studentName: name,
      username: credentials.username,
      accessCode: credentials.accessCode,
      portalUrl: `${window.location.origin}/portal`,
      className: studentClass,
      schoolId: isPrivate ? 'private' : student.schoolId,
      schoolName: isPrivate ? '' : student.schoolName,
      enrolmentType: isPrivate ? 'private' : undefined,
      parentName: student.parentName,
    });
  };

  const handleExportCsv = () => {
    const rowsWithCode = visibleStudents.filter((s) => issued[s.id]?.accessCode || s.accessCode);
    if (rowsWithCode.length === 0) {
      toast.error('Issue or load student access codes first before exporting CSV.');
      return;
    }
    const csvRows = [
      ['Full Name', 'Class', 'Programme', 'Username', 'Access Code', 'Portal URL'],
      ...rowsWithCode.map((s) => {
        const cred = issued[s.id];
        const uname = cred?.username || s.username || s.id;
        const code = cred?.accessCode || s.accessCode || '';
        return [
          `"${String(s.fullName || s.studentName || 'Student').replace(/"/g, '""')}"`,
          `"${String(s.class || 'Grade 1')}"`,
          `"${String(s.track || s.programName || 'Digital Literacy')}"`,
          `"${uname}"`,
          `"${code}"`,
          `"${window.location.origin}/portal"`,
        ];
      }),
    ];
    const blob = new Blob([csvRows.map((r) => r.join(',')).join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'student_credentials_export.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <section className="space-y-5 pb-10" aria-label="Student credential center" ref={menuContainerRef}>
      <SEO
        title="Student Access | Jaystarbliss Studios"
        description="Manage student sign-in credentials and one-time access codes."
        noindex={true}
      />

      {/* Top Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#14284B] dark:text-white">
            Student Access
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mt-1">
            Manage student sign-in credentials and one-time access codes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleExportCsv}
            className="h-10 px-4 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-[#111114] text-xs font-semibold text-[#14284B] dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800 inline-flex items-center gap-2 shadow-2xs transition-colors cursor-pointer"
          >
            <Download size={14} />
            <span>Export credentials</span>
          </button>

          <button
            type="button"
            onClick={() => void load()}
            className="h-10 px-4 rounded-xl bg-[#14284B] hover:bg-[#1E3A6D] dark:bg-[#B91C1C] dark:hover:bg-[#991B1B] text-white text-xs font-semibold inline-flex items-center gap-2 shadow-2xs transition-colors cursor-pointer"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Refresh records</span>
          </button>
        </div>
      </div>

      {/* Compact Zero-Knowledge Security Strip */}
      <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/90 dark:bg-[#111114] px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white dark:bg-[#18181B] border border-slate-200 dark:border-zinc-700 text-[#14284B] dark:text-zinc-200 flex items-center justify-center shrink-0">
            <ShieldCheck size={16} />
          </div>
          <div className="text-xs">
            <p className="font-bold uppercase tracking-wider text-[10px] text-[#14284B] dark:text-zinc-200">
              Zero-Knowledge Security
            </p>
            <p className="text-slate-600 dark:text-zinc-400 mt-0.5">
              Passcodes are securely hashed. A new code is revealed only when issued or rotated.
            </p>
          </div>
        </div>
        <span className="px-3 py-1 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-[#18181B] text-[11px] font-medium text-slate-600 dark:text-zinc-300 shrink-0 self-start sm:self-center">
          Codes are visible for this session only
        </span>
      </div>

      {/* Unified Search & Filter Toolbar */}
      <div className="rounded-2xl bg-white dark:bg-[#111114] border border-slate-200 dark:border-zinc-800 p-3.5 sm:p-4 space-y-3 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 flex-1">
            {/* Search Input */}
            <div className="relative w-full sm:max-w-xs">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search name, username, class or track..."
                className="w-full h-9 pl-9 pr-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-[#18181B] text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/25 focus:border-[#B91C1C]"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setFilterTab('all');
                  setSelectedClass('All Classes');
                  setSelectedTrack('All Tracks');
                }}
                className={`h-9 px-3.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer tabular-nums ${
                  filterTab === 'all'
                    ? 'bg-[#14284B] dark:bg-[#B91C1C] text-white shadow-2xs'
                    : 'border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] text-slate-600 dark:text-zinc-300 hover:border-slate-300 dark:hover:border-zinc-700'
                }`}
              >
                All students <span className="opacity-80 ml-1">{students.length}</span>
              </button>

              {!isSchool && (
                <>
                  <button
                    type="button"
                    onClick={() => setFilterTab('school')}
                    className={`h-9 px-3.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer tabular-nums ${
                      filterTab === 'school'
                        ? 'bg-[#14284B] dark:bg-[#B91C1C] text-white shadow-2xs'
                        : 'border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] text-slate-600 dark:text-zinc-300 hover:border-slate-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    School{' '}
                    <span className="opacity-80 ml-1">
                      {students.filter((s) => s.assignmentCategory === 'school' || Boolean(s.schoolId)).length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterTab('private')}
                    className={`h-9 px-3.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer tabular-nums ${
                      filterTab === 'private'
                        ? 'bg-[#14284B] dark:bg-[#B91C1C] text-white shadow-2xs'
                        : 'border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] text-slate-600 dark:text-zinc-300 hover:border-slate-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    Private{' '}
                    <span className="opacity-80 ml-1">
                      {students.filter((s) => s.assignmentCategory === 'private' || (!s.schoolId && s.assignmentCategory !== 'school')).length}
                    </span>
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => setFilterTab('classes')}
                className={`h-9 px-3.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer tabular-nums ${
                  filterTab === 'classes'
                    ? 'bg-[#14284B] dark:bg-[#B91C1C] text-white shadow-2xs'
                    : 'border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] text-slate-600 dark:text-zinc-300 hover:border-slate-300 dark:hover:border-zinc-700'
                }`}
              >
                Classes <span className="opacity-80 ml-1">{classGroups.length}</span>
              </button>

              <button
                type="button"
                onClick={() => setFilterTab('tracks')}
                className={`h-9 px-3.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer tabular-nums ${
                  filterTab === 'tracks'
                    ? 'bg-[#14284B] dark:bg-[#B91C1C] text-white shadow-2xs'
                    : 'border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] text-slate-600 dark:text-zinc-300 hover:border-slate-300 dark:hover:border-zinc-700'
                }`}
              >
                Program tracks <span className="opacity-80 ml-1">{trackGroups.length}</span>
              </button>
            </div>
          </div>

          {/* Live Count Indicator */}
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-zinc-300 tabular-nums shrink-0">
            <span className="w-2 h-2 rounded-full bg-[#B91C1C]" />
            <span>
              {visibleStudents.length} of {students.length} student{students.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        {/* Sub-filter chips for Classes */}
        {filterTab === 'classes' && (
          <div className="pt-2.5 border-t border-slate-100 dark:border-zinc-800 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedClass('All Classes')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                selectedClass === 'All Classes'
                  ? 'bg-[#B91C1C] text-white'
                  : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700'
              }`}
            >
              All Classes ({students.length})
            </button>
            {classGroups.map(([cls, count]) => (
              <button
                key={cls}
                type="button"
                onClick={() => setSelectedClass(cls)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  selectedClass === cls
                    ? 'bg-[#B91C1C] text-white'
                    : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700'
                }`}
              >
                {cls} <span className="opacity-75 font-mono text-[10px]">({count})</span>
              </button>
            ))}
          </div>
        )}

        {/* Sub-filter chips for Program Tracks */}
        {filterTab === 'tracks' && (
          <div className="pt-2.5 border-t border-slate-100 dark:border-zinc-800 flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedTrack('All Tracks')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                selectedTrack === 'All Tracks'
                  ? 'bg-[#B91C1C] text-white'
                  : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700'
              }`}
            >
              All Tracks ({students.length})
            </button>
            {trackGroups.map(([tr, count]) => (
              <button
                key={tr}
                type="button"
                onClick={() => setSelectedTrack(tr)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                  selectedTrack === tr
                    ? 'bg-[#B91C1C] text-white'
                    : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700'
                }`}
              >
                {tr} <span className="opacity-75 font-mono text-[10px]">({count})</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Single Tabular Student Directory */}
      {loading ? (
        <div className="rounded-2xl bg-white dark:bg-[#111114] border border-slate-200 dark:border-zinc-800 p-16 text-center text-sm text-slate-500 dark:text-zinc-400 flex flex-col items-center justify-center gap-3">
          <Loader2 size={24} className="animate-spin text-[#B91C1C]" />
          <span>Loading student directory and access records…</span>
        </div>
      ) : students.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-[#111114] border border-slate-200 dark:border-zinc-800 p-12 text-center space-y-3">
          <AlertCircle size={32} className="mx-auto text-[#B91C1C]" />
          <h3 className="font-bold text-base text-[#14284B] dark:text-white">No students currently enrolled</h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-md mx-auto">
            Enrolled learners will automatically appear here once onboarded or added to the roster.
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-xl bg-[#14284B] hover:bg-[#1E3A6D] px-5 py-2.5 text-xs font-semibold text-white inline-flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw size={14} /> Refresh Records
          </button>
        </div>
      ) : visibleStudents.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-[#111114] border border-slate-200 dark:border-zinc-800 p-10 text-center text-sm text-slate-500 dark:text-zinc-400">
          No students match the selected filter <strong>&ldquo;{searchTerm || selectedClass || selectedTrack}&rdquo;</strong>.
        </div>
      ) : (
        <div className="rounded-2xl bg-white dark:bg-[#111114] border border-slate-200 dark:border-zinc-800 shadow-2xs overflow-visible">
          {/* Directory Header Bar */}
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              Student Directory
            </span>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-zinc-400">
              <span>Sort:</span>
              <select
                aria-label="Sort students"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'name' | 'class')}
                className="bg-transparent font-semibold text-[#14284B] dark:text-zinc-200 focus:outline-none cursor-pointer"
              >
                <option value="name" className="bg-white dark:bg-[#111114]">Name (A–Z)</option>
                <option value="class" className="bg-white dark:bg-[#111114]">Class / Grade</option>
              </select>
            </div>
          </div>

          {/* Responsive Table Wrapper */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[780px]">
              <thead>
                <tr className="border-b border-slate-200/80 dark:border-zinc-800 bg-slate-50/60 dark:bg-[#18181B] text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                  <th className="py-3 pl-5 pr-3">Student</th>
                  <th className="py-3 px-3">Class / Learning Track</th>
                  <th className="py-3 px-3">Username</th>
                  <th className="py-3 px-3">Access Code</th>
                  <th className="py-3 px-3">Student Status</th>
                  <th className="py-3 pl-3 pr-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/80 text-xs">
                {paginatedStudents.map((student) => {
                  const credential = issued[student.id];
                  const isRevealed = Boolean(sessionRevealedIds[student.id]);
                  const hasCode = Boolean(credential?.accessCode);
                  const name = student.fullName || student.studentName || student.name || 'Student';
                  const studentClass = formatNormalizedClassDisplay(
                    student.class || student.classLevel || student.grade,
                    'Grade 1'
                  );
                  const track = (student.track || student.programName || 'Digital Literacy Junior').trim();
                  const isPrivate =
                    student.assignmentCategory === 'private' ||
                    (!student.schoolId && student.assignmentCategory !== 'school');
                  const isActive = student.portalAccessEnabled !== false;
                  const menuOpen = openMenuId === student.id;

                  return (
                    <tr
                      key={student.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-zinc-900/50 transition-colors"
                    >
                      {/* Col 1: Student */}
                      <td className="py-3.5 pl-5 pr-3">
                        <div className="flex items-center gap-3 min-w-[180px]">
                          <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 text-[#14284B] dark:text-zinc-200 flex items-center justify-center text-[11px] font-bold shrink-0">
                            {getInitials(name)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-[#14284B] dark:text-white truncate">{name}</p>
                            <p className="text-[11px] text-slate-500 dark:text-zinc-400 truncate">
                              {isPrivate
                                ? `Private learner${student.parentName ? ` · ${student.parentName}` : ''}`
                                : `School-assigned${student.schoolName ? ` · ${student.schoolName}` : ''}`}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Col 2: Class / Learning Track */}
                      <td className="py-3.5 px-3">
                        <p className="font-bold text-slate-800 dark:text-zinc-100">{studentClass}</p>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400 line-clamp-1 max-w-[220px]">
                          {track}
                        </p>
                      </td>

                      {/* Col 3: Username */}
                      <td className="py-3.5 px-3 font-mono text-slate-700 dark:text-zinc-300">
                        {credential?.username || student.username || 'pending'}
                      </td>

                      {/* Col 4: Access Code */}
                      <td className="py-3.5 px-3">
                        {hasCode && isRevealed ? (
                          <div className="inline-flex items-center gap-1.5">
                            <span className="font-mono font-bold text-[#B91C1C] dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded-md border border-red-200/70 dark:border-red-900/50 tabular-nums">
                              {credential.accessCode}
                            </span>
                            <button
                              type="button"
                              onClick={() => copyCredential(student)}
                              title="Copy credentials"
                              className="p-1 rounded-md text-slate-400 hover:text-[#14284B] dark:hover:text-white cursor-pointer"
                            >
                              {copiedId === student.id ? (
                                <Check size={13} className="text-emerald-600" />
                              ) : (
                                <Copy size={13} />
                              )}
                            </button>
                          </div>
                        ) : hasCode ? (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono tracking-widest text-slate-600 dark:text-zinc-400">
                                •••• ••••
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setSessionRevealedIds((prev) => ({ ...prev, [student.id]: true }))
                                }
                                title="Reveal code for this session"
                                className="text-slate-400 hover:text-[#14284B] dark:hover:text-zinc-200 cursor-pointer"
                              >
                                <Eye size={12} />
                              </button>
                            </div>
                            <p className="text-[10px] text-slate-400 dark:text-zinc-500">
                              Hidden for security
                            </p>
                          </div>
                        ) : (
                          <span className="text-slate-400 dark:text-zinc-500">Not generated</span>
                        )}
                      </td>

                      {/* Col 5: Student Status */}
                      <td className="py-3.5 px-3">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                            isActive
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                              : 'bg-red-50 text-[#B91C1C] dark:bg-red-950/40 dark:text-red-400'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isActive ? 'bg-emerald-500' : 'bg-[#B91C1C]'
                            }`}
                          />
                          {isActive ? 'Active' : 'Disabled'}
                        </span>
                      </td>

                      {/* Col 6: Actions */}
                      <td className="py-3.5 pl-3 pr-5">
                        <div className="flex items-center justify-end gap-2 relative">
                          <button
                            type="button"
                            disabled={busyId === student.id}
                            onClick={() => void issue(student)}
                            className={`h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer shrink-0 ${
                              hasCode
                                ? 'border border-red-200 dark:border-red-900/60 bg-white dark:bg-[#18181B] text-[#B91C1C] dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30'
                                : 'bg-[#B91C1C] hover:bg-[#991B1B] text-white shadow-2xs'
                            }`}
                          >
                            {busyId === student.id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : hasCode ? (
                              <RotateCw size={12} />
                            ) : (
                              <KeyRound size={12} />
                            )}
                            <span>{hasCode ? 'Rotate code' : 'Issue code'}</span>
                          </button>

                          {/* More Actions Dropdown Trigger */}
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setOpenMenuId(menuOpen ? null : student.id)}
                              aria-label={`More actions for ${name}`}
                              className="h-8 px-2 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-[#18181B] text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 inline-flex items-center gap-1 text-[11px] font-medium transition-colors cursor-pointer"
                            >
                              <MoreVertical size={13} />
                              <span className="hidden xl:inline">More actions</span>
                            </button>

                            {menuOpen && (
                              <div className="absolute right-0 mt-1.5 w-48 rounded-xl bg-white dark:bg-[#18181B] border border-slate-200 dark:border-zinc-700 shadow-xl py-1.5 z-30 text-xs">
                                <button
                                  type="button"
                                  disabled={!hasCode}
                                  onClick={() => {
                                    copyCredential(student);
                                    setOpenMenuId(null);
                                  }}
                                  className="w-full px-3.5 py-2 text-left flex items-center gap-2 text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                >
                                  <Copy size={13} />
                                  <span>Copy Credentials</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={!hasCode}
                                  onClick={() => {
                                    exportPack(student);
                                    setOpenMenuId(null);
                                  }}
                                  className="w-full px-3.5 py-2 text-left flex items-center gap-2 text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                >
                                  <Download size={13} />
                                  <span>Download TXT Pass</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={!hasCode}
                                  onClick={() => {
                                    exportPdf(student);
                                    setOpenMenuId(null);
                                  }}
                                  className="w-full px-3.5 py-2 text-left flex items-center gap-2 text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                >
                                  <FileText size={13} />
                                  <span>Download PDF Pass</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="px-5 py-3.5 border-t border-slate-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500 dark:text-zinc-400">
            <span>
              Showing{' '}
              <strong className="text-slate-800 dark:text-zinc-200 tabular-nums">
                {pageStartIndex + 1}–{Math.min(pageStartIndex + PAGE_SIZE, visibleStudents.length)}
              </strong>{' '}
              of <strong className="text-slate-800 dark:text-zinc-200 tabular-nums">{visibleStudents.length}</strong> students · More actions include copy, TXT and PDF pass
            </span>

            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous page"
                  className="w-8 h-8 rounded-lg border border-slate-200 dark:border-zinc-700 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-zinc-800 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft size={14} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .slice(Math.max(0, safePage - 3), Math.min(totalPages, safePage + 2))
                  .map((pageNum) => (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setCurrentPage(pageNum)}
                      className={`w-8 h-8 rounded-lg text-xs font-bold tabular-nums transition-colors cursor-pointer ${
                        pageNum === safePage
                          ? 'bg-[#14284B] dark:bg-[#B91C1C] text-white'
                          : 'border border-slate-200 dark:border-zinc-700 text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {pageNum}
                    </button>
                  ))}
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  aria-label="Next page"
                  className="w-8 h-8 rounded-lg border border-slate-200 dark:border-zinc-700 flex items-center justify-center hover:bg-slate-50 dark:hover:bg-zinc-800 disabled:opacity-40 cursor-pointer"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default StudentCredentialCenter;
