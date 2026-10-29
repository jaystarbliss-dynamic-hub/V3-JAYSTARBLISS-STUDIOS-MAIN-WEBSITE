import React, { useEffect, useState, useMemo } from 'react';
import {
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  addDoc,
  serverTimestamp,
  query,
  limit,
  where,
} from 'firebase/firestore';
import {
  Download,
  FileText,
  Loader2,
  UserPlus,
  Printer,
  ShieldCheck,
  BookOpen,
  Check,
  Copy,
  Upload,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Users,
} from 'lucide-react';
import SEO from '../../components/ui/SEO';
import { auth, db, getStandbyFirestore } from '../../lib/firebase';
import { useToast } from '../../contexts/ToastContext';
import { getEffectiveAuth } from '../../utils/impersonation';
import { getFriendlyErrorMessage, logInternalDiagnostic } from '../../utils/friendlyErrors';
import {
  CANONICAL_CLASSES,
  normalizeClassName,
  parseBulkStudentText,
  validateBulkStudentRows,
  type ValidatedBulkStudentRow,
} from '../../lib/classes';

const generateAccessCode = (length = 8) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return 'JBS-' + Array.from(arr, (b) => chars[b % chars.length]).join('');
};

type BulkProvisionOutcome = {
  rowNumber: number;
  fullName: string;
  username: string;
  className: string;
  programName: string;
  accessCode?: string;
  portal?: string;
  status: 'CREATED' | 'SKIPPED_DUPLICATE' | 'FAILED' | 'INVALID';
  errors: string[];
};

const SchoolStudentOnboardingV2: React.FC = () => {
  const { toast } = useToast();
  const [onboardingTab, setOnboardingTab] = useState<'SINGLE' | 'BULK'>('SINGLE');
  const [programs, setPrograms] = useState<any[]>([]);
  const [existingUsernames, setExistingUsernames] = useState<string[]>([]);
  const [form, setForm] = useState({
    fullName: '',
    username: '',
    email: '',
    class: 'Grade 7',
    programId: '',
    parentId: '',
  });
  const [saving, setSaving] = useState(false);
  const [credentials, setCredentials] = useState<{
    username: string;
    accessCode: string;
    portal: string;
  } | null>(null);
  const [schoolInfo, setSchoolInfo] = useState<{ id: string; name: string }>({
    id: '',
    name: '',
  });
  const [copied, setCopied] = useState(false);

  // Bulk Onboarding State
  const [bulkInputMode, setBulkInputMode] = useState<'PASTE' | 'CSV'>('PASTE');
  const [bulkRawText, setBulkRawText] = useState('');
  const [previewRows, setPreviewRows] = useState<ValidatedBulkStudentRow[]>([]);
  const [excludedRowNumbers, setExcludedRowNumbers] = useState<number[]>([]);
  const [bulkProvisioning, setBulkProvisioning] = useState(false);
  const [bulkOutcomes, setBulkOutcomes] = useState<BulkProvisionOutcome[] | null>(null);

  const loadSchoolContext = async () => {
    try {
      const effective = getEffectiveAuth();
      const schoolId =
        effective.effectiveSchoolId ||
        sessionStorage.getItem('schoolId') ||
        sessionStorage.getItem('schoolDocId') ||
        localStorage.getItem('jaystar_cached_school_id') ||
        auth.currentUser?.uid ||
        '';
      let list: any[] = [];
      let detectedSchoolName = sessionStorage.getItem('schoolName') || '';

      if (schoolId) {
        const schSnap = await getDoc(doc(db, 'schools', schoolId)).catch(() => null);
        if (schSnap && schSnap.exists()) {
          const sd = schSnap.data();
          detectedSchoolName = sd.name || sd.schoolName || detectedSchoolName;
          const raw = sd.programs || sd.undergoingPrograms || sd.assignedPrograms || [];
          if (Array.isArray(raw) && raw.length > 0) {
            list = raw.map((p: any) => ({
              id: p.id || p.name || p.title,
              name: p.name || p.title || p.programName || 'Program Track',
            }));
          }
        }
      }

      if (list.length === 0 && auth.currentUser) {
        const schSnap = await getDocs(query(collection(db, 'schools'), limit(50))).catch(
          () => ({ docs: [] } as any)
        );
        for (const d of schSnap.docs) {
          const sd = d.data();
          if (
            d.id === schoolId ||
            sd.adminUid === auth.currentUser?.uid ||
            sd.email === auth.currentUser?.email ||
            sd.firebaseUid === auth.currentUser?.uid
          ) {
            detectedSchoolName = sd.name || sd.schoolName || detectedSchoolName;
            const raw = sd.programs || sd.undergoingPrograms || sd.assignedPrograms || [];
            if (Array.isArray(raw) && raw.length > 0) {
              list = raw.map((p: any) => ({
                id: p.id || p.name || p.title,
                name: p.name || p.title || p.programName || 'Program Track',
              }));
              break;
            }
          }
        }
      }

      // Fetch existing school usernames for duplicate detection in preview
      if (schoolId) {
        const rosterSnap = await getDocs(
          query(
            collection(db, 'individualStudents'),
            where('schoolId', '==', schoolId),
            limit(500)
          )
        ).catch(() => ({ docs: [] } as any));
        const unameList: string[] = [];
        rosterSnap.docs?.forEach((d: any) => {
          const u = String(d.data()?.username || '').trim().toLowerCase();
          if (u) unameList.push(u);
        });
        setExistingUsernames(unameList);
      }

      setSchoolInfo({ id: schoolId, name: detectedSchoolName || 'Partner School' });
      setPrograms(list);
    } catch {
      setPrograms([]);
    }
  };

  useEffect(() => {
    void loadSchoolContext();
  }, []);

  const update = (key: string, value: string) => setForm((p) => ({ ...p, [key]: value }));

  const onboard = async (e: React.FormEvent) => {
    e.preventDefault();
    const effective = getEffectiveAuth();
    if (!auth.currentUser && !effective.isMasquerading) {
      return toast.error('Your school session has expired.');
    }
    const trimmedName = form.fullName.trim();
    const cleanUsername = form.username.toLowerCase().replace(/\s+/g, '').trim();
    if (!trimmedName || !cleanUsername || !form.class) {
      return toast.error('Complete the required student fields.');
    }

    setSaving(true);
    try {
      const program = programs.find((p) => p.id === form.programId);
      const programName = program?.name || program?.title || 'General School Programme';
      let issuedCredentials: { username: string; accessCode: string; portal: string } | null =
        null;

      const canonicalClass = normalizeClassName(form.class, 'Grade 7') || 'Grade 7';
      // 1. Try Netlify function safely
      if (auth.currentUser && !effective.isMasquerading) {
        try {
          const token = await auth.currentUser.getIdToken();
          const response = await fetch('/.netlify/functions/school-student-onboard', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...form,
              class: canonicalClass,
              fullName: trimmedName,
              username: cleanUsername,
              programName,
            }),
          });
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const result = await response.json().catch(() => ({}));
            if (response.ok && result.credentials) {
              issuedCredentials = result.credentials;
            }
          }
        } catch (apiErr) {
          console.warn(
            'Netlify function onboard note (proceeding to direct Firestore fallback):',
            apiErr
          );
        }
      }

      // 2. Direct Firestore fallback
      if (!issuedCredentials) {
        const studentId = `sch_${cleanUsername}_${Date.now().toString(36)}`;
        const accessCode = generateAccessCode();
        const targetSchoolId =
          schoolInfo.id ||
          effective.effectiveSchoolId ||
          sessionStorage.getItem('schoolId') ||
          auth.currentUser?.uid ||
          '';
        const targetSchoolName =
          schoolInfo.name || sessionStorage.getItem('schoolName') || 'Partner School';

        let accessCodeHash = '';
        try {
          const msgBuffer = new TextEncoder().encode(accessCode.toUpperCase());
          const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
          accessCodeHash = Array.from(new Uint8Array(hashBuffer))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
        } catch {
          accessCodeHash = accessCode.toLowerCase();
        }

        const studentRecord = {
          fullName: trimmedName,
          studentName: trimmedName,
          name: trimmedName,
          username: cleanUsername,
          accessCode,
          passcode: accessCode,
          code: accessCode,
          accessCodeHash,
          schoolId: targetSchoolId,
          schoolName: targetSchoolName,
          class: canonicalClass,
          grade: canonicalClass,
          track: programName,
          programId: form.programId || null,
          programName: programName || null,
          email: form.email.trim().toLowerCase() || null,
          parentId: form.parentId.trim() || null,
          portalAccessEnabled: true,
          accountStatus: 'ACTIVE',
          status: 'ACTIVE',
          source: 'school_onboarding',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };

        const standbyDb = getStandbyFirestore();
        // Also check if an older record with the same username already exists in this school so its code is updated too
        const existingSameUserIds = new Set<string>([studentId]);
        try {
          const [existingIndSnap, existingStdSnap] = await Promise.all([
            getDocs(query(collection(db, 'individualStudents'), where('username', '==', cleanUsername), limit(5))),
            getDocs(query(collection(db, 'students'), where('username', '==', cleanUsername), limit(5))),
          ]);
          for (const d of [...existingIndSnap.docs, ...existingStdSnap.docs]) {
            const dData = d.data() || {};
            if (!targetSchoolId || !dData.schoolId || dData.schoolId === targetSchoolId) {
              existingSameUserIds.add(d.id);
            }
          }
        } catch {
          // Non-fatal lookup
        }

        const writeOps: Promise<any>[] = [];
        for (const targetDocId of existingSameUserIds) {
          writeOps.push(
            setDoc(doc(db, 'individualStudents', targetDocId), studentRecord, { merge: true }),
            setDoc(doc(db, 'students', targetDocId), studentRecord, { merge: true })
          );
          if (standbyDb) {
            writeOps.push(
              setDoc(doc(standbyDb, 'individualStudents', targetDocId), studentRecord, { merge: true }).catch(() => undefined),
              setDoc(doc(standbyDb, 'students', targetDocId), studentRecord, { merge: true }).catch(() => undefined)
            );
          }
        }
        await Promise.all(writeOps);

        await addDoc(collection(db, 'enrollments'), {
          studentId,
          studentName: trimmedName,
          schoolId: targetSchoolId,
          programId: form.programId || null,
          programName,
          status: 'ACTIVE',
          source: 'school_onboarding',
          enrolledAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        }).catch(() => undefined);

        await addDoc(collection(db, 'activityLogs'), {
          actorId: auth.currentUser?.uid || effective.effectiveUid || 'school_admin',
          action: 'SCHOOL_STUDENT_ONBOARDED',
          targetId: studentId,
          targetType: 'student',
          schoolId: targetSchoolId,
          timestamp: serverTimestamp(),
          metadata: { username: cleanUsername, class: form.class, programName },
        }).catch(() => undefined);

        issuedCredentials = {
          username: cleanUsername,
          accessCode,
          portal: '/portal/student',
        };
      }

      setCredentials(issuedCredentials);
      setForm({
        fullName: '',
        username: '',
        email: '',
        class: 'Grade 7',
        programId: '',
        parentId: '',
      });
      toast.success(`Student account created and enrolled in ${programName}!`);
      void loadSchoolContext();
    } catch (error: any) {
      logInternalDiagnostic('SchoolStudentOnboarding::Single', error);
      toast.error(getFriendlyErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  // BULK PARSING & PREVIEW HANDLERS
  const handleParseBulkPreview = (rawInput: string) => {
    const parsed = parseBulkStudentText(rawInput);
    if (!parsed.length) {
      toast.error('No student records found to preview.');
      setPreviewRows([]);
      return;
    }
    const validation = validateBulkStudentRows(parsed, { existingUsernames });
    setPreviewRows(validation.rows);
    setExcludedRowNumbers([]);
    setBulkOutcomes(null);
  };

  const handleInsertSampleBulkText = () => {
    const sample = [
      'Full Name | Class | Programme',
      'Ada Johnson | Grade 5 | Digital Literacy',
      'Samuel Bello | Grade 5 | Digital Literacy',
      'Grace Daniel | Grade 6 | Coding',
    ].join('\n');
    setBulkRawText(sample);
    handleParseBulkPreview(sample);
  };

  const handleDownloadSampleCsv = () => {
    const csv = [
      'Full Name,Class,Programme,Username,Email',
      'Ada Johnson,Grade 5,Digital Literacy,ada_johnson,ada@school.edu.ng',
      'Samuel Bello,Grade 5,Digital Literacy,samuel_bello,',
      'Grace Daniel,Grade 6,Coding,grace_daniel,',
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'jaystarbliss_bulk_students_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const activePreviewRows = useMemo(
    () =>
      previewRows.filter(
        (r) => r.valid && !excludedRowNumbers.includes(r.rowNumber)
      ),
    [previewRows, excludedRowNumbers]
  );

  const handleConfirmBulkProvision = async () => {
    if (!activePreviewRows.length) {
      return toast.error('There are no valid rows selected to provision.');
    }
    setBulkProvisioning(true);
    try {
      const effective = getEffectiveAuth();
      const targetSchoolId =
        schoolInfo.id ||
        effective.effectiveSchoolId ||
        sessionStorage.getItem('schoolId') ||
        auth.currentUser?.uid ||
        '';
      const targetSchoolName =
        schoolInfo.name || sessionStorage.getItem('schoolName') || 'Partner School';

      let serverOutcomes: BulkProvisionOutcome[] | null = null;
      if (auth.currentUser && !effective.isMasquerading) {
        try {
          const token = await auth.currentUser.getIdToken();
          const res = await fetch('/.netlify/functions/school-student-onboard', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'bulk',
              schoolId: targetSchoolId,
              rows: activePreviewRows,
            }),
          });
          if (res.ok) {
            const payload = await res.json().catch(() => ({}));
            if (Array.isArray(payload.results)) {
              serverOutcomes = payload.results;
            }
          }
        } catch (err) {
          console.warn('Server bulk onboard fallback engaged:', err);
        }
      }

      if (!serverOutcomes) {
        const localOutcomes: BulkProvisionOutcome[] = [];
        const seenU = new Set(existingUsernames.map((u) => u.toLowerCase()));

        for (const row of activePreviewRows) {
          if (seenU.has(row.username.toLowerCase())) {
            localOutcomes.push({
              rowNumber: row.rowNumber,
              fullName: row.fullName,
              username: row.username,
              className: row.className,
              programName: row.programName,
              status: 'SKIPPED_DUPLICATE',
              errors: [`Username "${row.username}" already exists.`],
            });
            continue;
          }
          try {
            const studentId = `sch_${row.username}_${Date.now().toString(36)}_${row.rowNumber}`;
            const suppliedCode = String((row as any).accessCode || '').trim().toUpperCase();
            const accessCode = suppliedCode || generateAccessCode();
            let accessCodeHash = '';
            try {
              const msgBuffer = new TextEncoder().encode(accessCode.toUpperCase());
              const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
              accessCodeHash = Array.from(new Uint8Array(hashBuffer))
                .map((b) => b.toString(16).padStart(2, '0'))
                .join('');
            } catch {
              accessCodeHash = accessCode.toLowerCase();
            }

            const studentRecord = {
              fullName: row.fullName,
              studentName: row.fullName,
              name: row.fullName,
              username: row.username,
              accessCode,
              passcode: accessCode,
              code: accessCode,
              accessCodeHash,
              schoolId: targetSchoolId,
              schoolName: targetSchoolName,
              class: row.className,
              grade: row.className,
              track: row.programName,
              programName: row.programName,
              email: row.email || null,
              portalAccessEnabled: true,
              accountStatus: 'ACTIVE',
              status: 'ACTIVE',
              source: 'school_bulk_onboarding',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            };

            const standbyDb = getStandbyFirestore();
            const rowWrites: Promise<any>[] = [
              setDoc(doc(db, 'individualStudents', studentId), studentRecord, { merge: true }),
              setDoc(doc(db, 'students', studentId), studentRecord, { merge: true }),
            ];
            if (standbyDb) {
              rowWrites.push(
                setDoc(doc(standbyDb, 'individualStudents', studentId), studentRecord, { merge: true }).catch(() => undefined),
                setDoc(doc(standbyDb, 'students', studentId), studentRecord, { merge: true }).catch(() => undefined)
              );
            }
            await Promise.all(rowWrites);

            seenU.add(row.username.toLowerCase());
            localOutcomes.push({
              rowNumber: row.rowNumber,
              fullName: row.fullName,
              username: row.username,
              className: row.className,
              programName: row.programName,
              accessCode,
              portal: '/portal/student',
              status: 'CREATED',
              errors: [],
            });
          } catch (rowErr: any) {
            localOutcomes.push({
              rowNumber: row.rowNumber,
              fullName: row.fullName,
              username: row.username,
              className: row.className,
              programName: row.programName,
              status: 'FAILED',
              errors: [rowErr?.message || 'Failed to create record'],
            });
          }
        }
        serverOutcomes = localOutcomes;
      }

      setBulkOutcomes(serverOutcomes);
      const createdCount = serverOutcomes.filter((r) => r.status === 'CREATED').length;
      toast.success(`Bulk onboarding complete: ${createdCount} student account(s) provisioned.`);
      void loadSchoolContext();
    } catch (err: any) {
      logInternalDiagnostic('SchoolStudentOnboarding::Bulk', err);
      toast.error(getFriendlyErrorMessage(err));
    } finally {
      setBulkProvisioning(false);
    }
  };

  const handleExportBulkCredentialsCsv = () => {
    if (!bulkOutcomes) return;
    const created = bulkOutcomes.filter((r) => r.status === 'CREATED');
    if (!created.length) return;
    const rows = [
      ['Full Name', 'Class', 'Programme', 'Username', 'Access Code', 'Portal URL'],
      ...created.map((r) => [
        `"${r.fullName.replace(/"/g, '""')}"`,
        `"${r.className}"`,
        `"${r.programName}"`,
        `"${r.username}"`,
        `"${r.accessCode || ''}"`,
        `"${window.location.origin}${r.portal || '/portal/student'}"`,
      ]),
    ];
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(schoolInfo.name || 'school')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')}_student_credentials.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyCredentials = () => {
    if (!credentials) return;
    const text = `Username: ${credentials.username}\nAccess Code: ${credentials.accessCode}\nStudent Portal: ${window.location.origin}${credentials.portal}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Credentials copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const text = credentials
    ? `JAYSTARBLISS STUDIOS — STUDENT ACCESS\n\nUsername: ${credentials.username}\nAccess Code: ${credentials.accessCode}\nStudent Portal: ${window.location.origin}${credentials.portal}\n\nKeep these credentials private.`
    : '';
  const downloadText = () => {
    if (!text) return;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${credentials?.username}-student-access.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const print = () => {
    if (!credentials) return;
    const w = window.open('', '_blank', 'noopener,noreferrer');
    if (!w) return toast.error('Allow pop-ups to print.');
    w.document.write(
      `<html><head><title>Student Access</title><style>body{font-family:Arial;padding:48px}.card{max-width:560px;border:2px solid #b91c1c;border-radius:20px;padding:32px}.label{font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.08em}.value{font-size:22px;font-weight:800;margin:6px 0 20px}</style></head><body><div class="card"><h1>Jaystarbliss Studios</h1><h2>Student Portal Access</h2><div class="label">Username</div><div class="value">${credentials.username}</div><div class="label">Access Code</div><div class="value">${credentials.accessCode}</div><div class="label">Portal</div><div class="value">${window.location.origin}${credentials.portal}</div></div><script>window.onload=()=>window.print()</script></body></html>`
    );
    w.document.close();
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <SEO
        title="Onboard School Student | Jaystarbliss Studios"
        description="Create secure student access and connect learners to programmes individually or in bulk."
        noindex
      />

      {/* Clean Horizontal Mode Switcher (Individual vs Bulk Onboard Students) */}
      <div className="flex items-center gap-6 border-b border-slate-200 dark:border-slate-800 overflow-x-auto no-scrollbar touch-pan-x">
        <button
          type="button"
          onClick={() => setOnboardingTab('SINGLE')}
          className={`relative pb-3 text-xs sm:text-sm font-bold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-2 ${
            onboardingTab === 'SINGLE'
              ? 'text-[#14284B] dark:text-white'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <UserPlus size={15} />
          <span>Individual Student Onboarding</span>
          {onboardingTab === 'SINGLE' && (
            <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#B91C1C] rounded-full" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setOnboardingTab('BULK')}
          className={`relative pb-3 text-xs sm:text-sm font-bold whitespace-nowrap transition-colors cursor-pointer flex items-center gap-2 ${
            onboardingTab === 'BULK'
              ? 'text-[#14284B] dark:text-white'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          <Users size={15} />
          <span>Bulk Onboard Students (Paste / CSV)</span>
          {onboardingTab === 'BULK' && (
            <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#B91C1C] rounded-full" />
          )}
        </button>
      </div>

      {onboardingTab === 'SINGLE' ? (
        <>
          <form
            onSubmit={onboard}
            className="pro-surface rounded-2xl p-6 bg-white dark:bg-[#161B26] border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field
                label="Student full name"
                value={form.fullName}
                onChange={(v) => update('fullName', v)}
                required
                placeholder="e.g. Joy Okafor"
              />
              <Field
                label="Username"
                value={form.username}
                onChange={(v) => update('username', v)}
                required
                placeholder="e.g. joy_okafor"
              />
              <Field
                label="Email (optional)"
                value={form.email}
                onChange={(v) => update('email', v)}
                type="email"
                placeholder="joy@school.edu.ng"
              />

              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Class
                <select
                  value={normalizeClassName(form.class) || form.class}
                  onChange={(e) => update('class', e.target.value)}
                  className="mt-1.5 w-full min-h-11 rounded-xl border border-slate-200 dark:border-slate-700 px-3 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-medium"
                >
                  {CANONICAL_CLASSES.map((cls) => (
                    <option key={cls} value={cls}>
                      {cls}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 md:col-span-2">
                <span className="flex items-center gap-2">
                  Programme <BookOpen size={14} className="text-brand-red" />
                </span>
                <select
                  value={form.programId}
                  onChange={(e) => update('programId', e.target.value)}
                  className="mt-1.5 w-full min-h-11 rounded-xl border border-slate-200 dark:border-slate-700 px-3 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-medium"
                >
                  <option value="">Select a programme (optional)</option>
                  {programs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name || p.title}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[11px] font-normal text-slate-500">
                  When selected, an active enrollment is created for this learner.
                </span>
              </label>

              <Field
                label="Parent account ID (optional)"
                value={form.parentId}
                onChange={(v) => update('parentId', v)}
                placeholder="Parent UID or email"
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="min-h-11 mt-3 rounded-xl bg-brand-red hover:bg-red-700 text-white px-5 text-xs font-bold inline-flex items-center gap-2 transition-all shadow-md disabled:opacity-50 cursor-pointer"
            >
              <ShieldCheck size={16} />
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Creating secure access…
                </>
              ) : (
                'Create Student & Enrollment'
              )}
            </button>
          </form>

          {credentials && (
            <div className="pro-surface rounded-2xl p-6 border-2 border-brand-red/30 bg-white dark:bg-[#161B26] shadow-lg space-y-4">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-brand-red/10 p-3 text-brand-red">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h2 className="font-bold text-lg text-slate-900 dark:text-white">
                    Credentials Created Successfully
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Save or distribute these credentials now.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Credential label="Username" value={credentials.username} />
                <Credential label="Access code" value={credentials.accessCode} />
              </div>

              <div className="flex flex-wrap gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={copyCredentials}
                  className="min-h-10 rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 text-xs font-bold inline-flex items-center gap-2 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-100"
                >
                  {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                  <span>{copied ? 'Copied!' : 'Copy Info'}</span>
                </button>
                <button
                  type="button"
                  onClick={downloadText}
                  className="min-h-10 rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 text-xs font-bold inline-flex items-center gap-2 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-100"
                >
                  <FileText size={14} /> TXT
                </button>
                <button
                  type="button"
                  onClick={print}
                  className="min-h-10 rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 text-xs font-bold inline-flex items-center gap-2 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-100"
                >
                  <Printer size={14} /> Print / PDF
                </button>
                <button
                  type="button"
                  onClick={() => setCredentials(null)}
                  className="min-h-10 rounded-xl border border-slate-200 dark:border-slate-700 px-3.5 text-xs font-bold bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        /* BULK ONBOARD STUDENTS WORKSPACE */
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#161B26] p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-black text-slate-900 dark:text-white">
                  Bulk Student Onboarding — {schoolInfo.name || 'Partner School'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Paste student records or upload a CSV spreadsheet. Preview and validate all rows
                  before accounts are created.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBulkInputMode('PASTE')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer ${
                    bulkInputMode === 'PASTE'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Paste Records
                </button>
                <button
                  type="button"
                  onClick={() => setBulkInputMode('CSV')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer ${
                    bulkInputMode === 'CSV'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  Import Spreadsheet (.CSV)
                </button>
              </div>
            </div>

            {bulkInputMode === 'PASTE' ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Format: Full Name | Class | Programme (or comma-separated)
                  </span>
                  <button
                    type="button"
                    onClick={handleInsertSampleBulkText}
                    className="text-xs font-bold text-blue-600 hover:underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles size={13} /> Insert Format Example
                  </button>
                </div>

                <textarea
                  rows={7}
                  value={bulkRawText}
                  onChange={(e) => setBulkRawText(e.target.value)}
                  placeholder={
                    'Full Name | Class | Programme\nAda Johnson | Grade 5 | Digital Literacy\nSamuel Bello | Grade 5 | Digital Literacy\nGrace Daniel | Grade 6 | Coding'
                  }
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-3.5 font-mono text-xs text-slate-900 dark:text-white focus:outline-none focus:border-blue-600"
                />

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleParseBulkPreview(bulkRawText)}
                    className="rounded-xl bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 text-white px-5 py-2.5 text-xs font-bold cursor-pointer"
                  >
                    Preview &amp; Validate Records
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-slate-500">
                    Upload a CSV spreadsheet with columns:{' '}
                    <strong>Full Name, Class, Programme, Username (optional), Email (optional)</strong>
                  </span>
                  <button
                    type="button"
                    onClick={handleDownloadSampleCsv}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:underline cursor-pointer"
                  >
                    <Download size={14} /> Download Sample CSV Template
                  </button>
                </div>

                <div className="p-6 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl text-center space-y-3">
                  <Upload size={28} className="mx-auto text-blue-600" />
                  <p className="text-xs font-bold text-slate-800 dark:text-white">
                    Choose a .CSV spreadsheet file to preview
                  </p>
                  <label className="inline-flex px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer">
                    <span>Select .CSV File</span>
                    <input
                      type="file"
                      accept=".csv,.txt"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          const content = String(ev.target?.result || '');
                          setBulkRawText(content);
                          handleParseBulkPreview(content);
                        };
                        reader.readAsText(file);
                      }}
                    />
                  </label>
                </div>
              </div>
            )}
          </section>

          {/* STEP 2: PREVIEW & VALIDATION TABLE */}
          {previewRows.length > 0 && (
            <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#161B26] p-5 sm:p-6 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                    Preview &amp; Validation ({activePreviewRows.length} ready of {previewRows.length}{' '}
                    rows)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Review validated classes, generated usernames, and any row-level errors before
                    confirming account creation.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={bulkProvisioning || activePreviewRows.length === 0}
                  onClick={() => void handleConfirmBulkProvision()}
                  className="rounded-xl bg-brand-red hover:bg-red-700 text-white px-5 py-2.5 text-xs font-bold inline-flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {bulkProvisioning ? (
                    <>
                      <Loader2 size={15} className="animate-spin" /> Provisioning Accounts…
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={15} /> Confirm &amp; Create {activePreviewRows.length}{' '}
                      Student(s)
                    </>
                  )}
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-[11px] uppercase font-bold text-slate-500 border-b border-slate-100 dark:border-slate-800">
                    <tr>
                      <th className="p-3">Include</th>
                      <th className="p-3">Row</th>
                      <th className="p-3">Full Name</th>
                      <th className="p-3">Canonical Class</th>
                      <th className="p-3">Programme</th>
                      <th className="p-3">Username</th>
                      <th className="p-3">Validation Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {previewRows.map((row) => {
                      const excluded = excludedRowNumbers.includes(row.rowNumber);
                      return (
                        <tr key={row.rowNumber} className={excluded ? 'opacity-50' : ''}>
                          <td className="p-3">
                            <input
                              type="checkbox"
                              disabled={!row.valid}
                              checked={row.valid && !excluded}
                              onChange={() =>
                                setExcludedRowNumbers((prev) =>
                                  prev.includes(row.rowNumber)
                                    ? prev.filter((n) => n !== row.rowNumber)
                                    : [...prev, row.rowNumber]
                                )
                              }
                            />
                          </td>
                          <td className="p-3 font-mono text-slate-400">#{row.rowNumber}</td>
                          <td className="p-3 font-bold text-slate-900 dark:text-white">
                            {row.fullName || '—'}
                          </td>
                          <td className="p-3 font-semibold text-blue-600 dark:text-blue-400">
                            {row.className || row.rawClass || '—'}
                          </td>
                          <td className="p-3 text-slate-600 dark:text-slate-300">
                            {row.programName}
                          </td>
                          <td className="p-3 font-mono text-slate-700 dark:text-slate-300">
                            {row.username || '—'}
                          </td>
                          <td className="p-3">
                            {row.valid ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                                <CheckCircle2 size={12} /> Ready
                              </span>
                            ) : (
                              <div className="space-y-0.5">
                                {row.errors.map((err: string, i: number) => (
                                  <p
                                    key={i}
                                    className="text-[11px] font-bold text-rose-600 flex items-center gap-1"
                                  >
                                    <AlertCircle size={12} /> {err}
                                  </p>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* STEP 3: PROVISIONING OUTCOMES & CREDENTIAL EXPORT */}
          {bulkOutcomes && (
            <section className="rounded-2xl border-2 border-emerald-500/30 bg-white dark:bg-[#161B26] p-5 sm:p-6 shadow-md space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    Bulk Onboarding Results
                  </h3>
                  <p className="text-xs text-slate-500">
                    {bulkOutcomes.filter((r) => r.status === 'CREATED').length} created ·{' '}
                    {bulkOutcomes.filter((r) => r.status === 'SKIPPED_DUPLICATE').length} skipped
                    duplicates ·{' '}
                    {
                      bulkOutcomes.filter((r) => ['FAILED', 'INVALID'].includes(r.status)).length
                    }{' '}
                    failed
                  </p>
                </div>

                {bulkOutcomes.some((r) => r.status === 'CREATED') && (
                  <button
                    type="button"
                    onClick={handleExportBulkCredentialsCsv}
                    className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 text-xs font-bold inline-flex items-center gap-2 cursor-pointer"
                  >
                    <Download size={14} /> Download Issued Credentials (.CSV)
                  </button>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-[11px] uppercase font-bold text-slate-500 border-b border-slate-100 dark:border-slate-800">
                    <tr>
                      <th className="p-3">Student</th>
                      <th className="p-3">Class</th>
                      <th className="p-3">Username</th>
                      <th className="p-3">Issued Access Code</th>
                      <th className="p-3">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {bulkOutcomes.map((out) => (
                      <tr key={out.rowNumber}>
                        <td className="p-3 font-bold text-slate-900 dark:text-white">
                          {out.fullName}
                        </td>
                        <td className="p-3">{out.className}</td>
                        <td className="p-3 font-mono">{out.username}</td>
                        <td className="p-3 font-mono font-bold text-slate-900 dark:text-white">
                          {out.accessCode || '—'}
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                              out.status === 'CREATED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : out.status === 'SKIPPED_DUPLICATE'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {out.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};

const Field = ({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  placeholder = '',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) => (
  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
    {label}
    <input
      required={required}
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="mt-1.5 w-full min-h-11 rounded-xl border border-slate-200 dark:border-slate-700 px-3 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-medium"
    />
  </label>
);

const Credential = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-800 p-4">
    <div className="text-[10px] uppercase tracking-widest text-slate-500 dark:text-slate-400 font-black">
      {label}
    </div>
    <div className="text-lg font-black mt-1 text-slate-900 dark:text-white font-mono break-all">
      {value}
    </div>
  </div>
);

export default SchoolStudentOnboardingV2;
