import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { db } from '../../lib/firebase';
import { collection, doc, setDoc, addDoc, updateDoc, getDocs, limit, serverTimestamp, query, where, onSnapshot } from 'firebase/firestore';
import { 
  CheckCircle2, XCircle, Clock, ExternalLink, Award, 
  Calendar, Phone, Mail, Eye, ChevronDown, Search, Loader2, X,
  Sparkles, UserCheck, AlertTriangle, ImageOff
} from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import SEO from '../../components/ui/SEO';
import { StudentEnrollmentApprovalModal } from '../../components/admin/StudentEnrollmentApprovalModal';
import { resolveRealName } from '../../utils/userNames';
import { formatNormalizedClassDisplay, normalizeClassName } from '../../lib/classes';
import { claimGlobalUsername, ensureUniqueGeneratedUsername } from '../../lib/usernameRegistry';
import { isValidTutorPhotoUrl, type TutorPublicProfileStatus } from '../../lib/tutorDirectory';
import {
  type ProgrammeEnrollmentRecord,
  normalizeProgrammeEnrollmentDoc,
  approveProgrammeEnrollmentAsAdmin,
  rejectProgrammeEnrollmentAsAdmin,
  retryProgrammeAdmissionEmail,
} from '../../lib/programmeEnrollments';

const AdminApprovals: React.FC = () => {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const resolveTabParam = (val: string | null): 'tutors' | 'subjects' | 'students' | 'enrollments' | 'programme_apps' => {
    if (val === 'students' || val === 'enrollments' || val === 'programme_apps' || val === 'tutors' || val === 'subjects') {
      return val;
    }
    return 'tutors';
  };
  const [activeTab, setActiveTab] = useState<
    'tutors' | 'subjects' | 'students' | 'enrollments' | 'programme_apps'
  >(() => resolveTabParam(searchParams.get('tab')));

  useEffect(() => {
    const paramTab = searchParams.get('tab');
    if (paramTab) {
      setActiveTab(resolveTabParam(paramTab));
    }
  }, [searchParams]);
  const [search, setSearch] = useState('');
  const [studentReqs, setStudentReqs] = useState<any[]>([]);
  const [tutorReqs, setTutorReqs] = useState<any[]>([]);
  const [subjectReqs, setSubjectReqs] = useState<any[]>([]);
  const [enrollmentReqs, setEnrollmentReqs] = useState<any[]>([]);
  const [programmeApps, setProgrammeApps] = useState<ProgrammeEnrollmentRecord[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [selectedTutorDetail, setSelectedTutorDetail] = useState<any | null>(null);
  const [selectedSubjectDetail, setSelectedSubjectDetail] = useState<any | null>(null);
  const [selectedRequestForModal, setSelectedRequestForModal] = useState<any | null>(null);
  const [approvalTargetApp, setApprovalTargetApp] = useState<ProgrammeEnrollmentRecord | null>(null);
  const [approveFeeAmount, setApproveFeeAmount] = useState<string>('35000');
  const [approveBillingCycle, setApproveBillingCycle] = useState<string>('Per Term / Cohort');
  const [approveDurationWeeks, setApproveDurationWeeks] = useState<string>('8');
  const [approveAllowDeposit, setApproveAllowDeposit] = useState<boolean>(false);
  const [approveDepositAmount, setApproveDepositAmount] = useState<string>('15000');
  const [approveAdminNotes, setApproveAdminNotes] = useState<string>('');
  const [approvingApp, setApprovingApp] = useState<boolean>(false);

  useEffect(() => {
    const qStudents = query(collection(db, 'student_requests'), where('status', '==', 'pending'));
    const unsubStudents = onSnapshot(qStudents, (snap) => {
      setStudentReqs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.warn('student_requests listener warning:', err);
    });

    const qTutors = query(collection(db, 'tutor_applications'), where('status', '==', 'pending'));
    const unsubTutors = onSnapshot(qTutors, (snap) => {
      setTutorReqs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.warn('tutor_applications listener warning:', err);
    });

    const qSubjects = query(collection(db, 'tutor_subject_applications'), where('status', '==', 'pending'));
    const unsubSubjects = onSnapshot(qSubjects, (snap) => {
      setSubjectReqs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.warn('tutor_subject_applications listener warning:', err);
    });

    const qEnrollments = query(collection(db, 'enrollment_requests'), where('status', '==', 'pending'));
    const unsubEnrollments = onSnapshot(qEnrollments, (snap) => {
      setEnrollmentReqs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => {
      console.warn('enrollment_requests listener warning:', err);
    });

    const unsubProgApps = onSnapshot(
      collection(db, 'programme_enrollments'),
      (snap) => {
        const list = snap.docs
          .map((d) => normalizeProgrammeEnrollmentDoc(d.id, d.data() as Record<string, any>))
          .sort((a, b) => {
            const rank = (s: string) =>
              s === 'PENDING_ADMIN_REVIEW' ? 0 : s === 'APPROVED_AWAITING_PAYMENT' ? 1 : 2;
            return rank(a.enrollmentStatus) - rank(b.enrollmentStatus);
          });
        setProgrammeApps(list);
      },
      (err) => {
        console.warn('programme_enrollments listener warning:', err);
      }
    );

    return () => {
      unsubStudents();
      unsubTutors();
      unsubSubjects();
      unsubEnrollments();
      unsubProgApps();
    };
  }, []);

  const generateAccessCode = (length = 7) => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const arr = new Uint8Array(length);
    crypto.getRandomValues(arr);
    return Array.from(arr, b => chars[b % chars.length]).join('');
  };

  const makeUniqueUsername = (name: string, email: string, requestId: string) => {
    const source = email?.split('@')[0] || name || 'cadet';
    const base = source
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9]+/g, '')
      .toLowerCase()
      .slice(0, 20) || 'cadet';
    return `${base}_${requestId.slice(-6).toLowerCase()}`;
  };

  const approveStudent = async (req: any) => {
    if (!window.confirm(`Approve student ${req.name}?`)) return;
    setLoadingId(req.id);
    try {
      const accessCode = generateAccessCode();
      const subjects = Array.isArray(req.subjects) ? req.subjects : (req.subjects || '').split(',').map((s: string) => s.trim()).filter(Boolean);
      const uniqueUsername = await ensureUniqueGeneratedUsername(makeUniqueUsername(req.name, req.email, req.id));
      
      const canonicalStudentClass = normalizeClassName(req.class || req.grade, 'Grade 7');
      const reqSelectedIds = Array.isArray(req.selectedProgramIds)
        ? req.selectedProgramIds
        : Array.isArray(req.assignedTrackIds)
        ? req.assignedTrackIds
        : req.programId
        ? [req.programId]
        : [];
      const reqPathwayStatus =
        reqSelectedIds.length > 0 ? 'CONFIGURED' : 'PENDING_PROGRAMME_CONFIRMATION';
      const reqTrack =
        reqSelectedIds.length > 0
          ? req.plan || req.programName || req.track || subjects.join(', ')
          : 'Pending Programme Confirmation';

      const stdDoc = await addDoc(collection(db, 'students'), {
        fullName: req.name,
        username: uniqueUsername,
        email: (req.email || '').toLowerCase(),
        phone: req.phone || '',
        parentPhone: req.parentPhone || '',
        class: canonicalStudentClass,
        grade: canonicalStudentClass,
        accessCode,
        parentId: req.parentId || null,
        isIndependent: !req.parentId,
        registrationType: req.parentId ? 'parent' : 'individual',
        subjects,
        selectedProgramIds: reqSelectedIds,
        assignedProgramIds: reqSelectedIds,
        assignedTrackIds: reqSelectedIds,
        pathwayStatus: reqPathwayStatus,
        track: reqTrack,
        deliveryType: req.deliveryType || 'PUBLIC_GROUP',
        registeredAt: serverTimestamp()
      });

      await setDoc(doc(db, 'individualStudents', stdDoc.id), {
        fullName: req.name,
        username: uniqueUsername,
        email: (req.email || '').toLowerCase(),
        class: canonicalStudentClass,
        grade: canonicalStudentClass,
        accessCode,
        subjects,
        selectedProgramIds: reqSelectedIds,
        assignedProgramIds: reqSelectedIds,
        assignedTrackIds: reqSelectedIds,
        pathwayStatus: reqPathwayStatus,
        track: reqTrack,
        deliveryType: req.deliveryType || 'PUBLIC_GROUP',
        status: 'ACTIVE',
        parentId: req.parentId || null,
        parentEmail: req.parentEmail || req.email || '',
        isIndependent: !req.parentId,
        registrationType: req.parentId ? 'parent' : 'individual',
        createdAt: serverTimestamp()
      }, { merge: true });

      await claimGlobalUsername(uniqueUsername, {
        uid: stdDoc.id,
        docId: stdDoc.id,
        role: 'STUDENT',
        email: (req.email || '').toLowerCase(),
        name: req.name,
      });

      await updateDoc(doc(db, 'student_requests', req.id), {
        status: 'approved',
        username: uniqueUsername,
        accessCode,
        approvedAt: serverTimestamp()
      });
      toast.success(`Student Approved! Username: ${uniqueUsername} | Access code: ${accessCode}`);
    } catch (e: any) {
      toast.error('Error: ' + e.message);
    } finally {
      setLoadingId(null);
    }
  };

  const approveEnrollment = async (req: any) => {
    const studentName = String(req.studentName || 'this student').trim();
    if (!window.confirm(`Approve enrollment for ${studentName} and create the student's portal access?`)) return;
    setLoadingId(req.id);

    try {
      const accessCode = generateAccessCode();
      const studentRecordId = `enr_${req.id}`;
      const username = await ensureUniqueGeneratedUsername(makeUniqueUsername(studentName, req.parentEmail || '', req.id), [studentRecordId]);
      const subjects = Array.isArray(req.subjects)
        ? req.subjects.filter((subject: unknown): subject is string => typeof subject === 'string' && Boolean(subject.trim()))
        : String(req.subjects || '').split(',').map((subject: string) => subject.trim()).filter(Boolean);
      const parentId = req.parentId || null;
      const parentEmail = req.parentEmail || '';
      const selectedProgramIds = Array.isArray(req.selectedProgramIds)
        ? req.selectedProgramIds
        : Array.isArray(req.assignedTrackIds)
        ? req.assignedTrackIds
        : [];
      const pathwayStatus =
        selectedProgramIds.length > 0 || Boolean(req.plan && req.plan !== 'Pending Programme Confirmation')
          ? 'CONFIGURED'
          : 'PENDING_PROGRAMME_CONFIRMATION';

      const sharedStudentRecord = {
        fullName: studentName,
        username,
        email: req.studentEmail || '',
        parentId,
        parentEmail,
        parentName: req.parentName || '',
        isIndependent: false,
        registrationType: 'parent',
        subjects,
        plan: req.plan || '',
        track: req.plan || 'Pending Programme Confirmation',
        selectedProgramIds,
        assignedProgramIds: selectedProgramIds,
        assignedTrackIds: selectedProgramIds,
        pathwayStatus,
        deliveryType: req.deliveryType || 'PUBLIC_GROUP',
        grade: normalizeClassName(req.class || req.grade || req.studentClass || req.studentAge, 'Grade 1'),
        class: normalizeClassName(req.class || req.grade || req.studentClass || req.studentAge, 'Grade 1'),
        accessCode,
        status: 'ACTIVE',
        registrationSource: 'parent-enrollment',
        enrollmentRequestId: req.id,
        createdAt: serverTimestamp(),
      };

      await Promise.all([
        setDoc(doc(db, 'students', studentRecordId), sharedStudentRecord, { merge: true }),
        setDoc(doc(db, 'individualStudents', studentRecordId), {
          ...sharedStudentRecord,
          firebaseUid: null,
        }, { merge: true }),
        claimGlobalUsername(username, {
          uid: studentRecordId,
          docId: studentRecordId,
          role: 'STUDENT',
          email: req.studentEmail || parentEmail,
          name: studentName,
        }),
      ]);

      await updateDoc(doc(db, 'enrollment_requests', req.id), {
        status: 'approved',
        studentId: studentRecordId,
        username,
        accessCode,
        approvedAt: serverTimestamp(),
      });

      toast.success(`Enrollment approved for ${studentName}. Code: ${accessCode}`);
    } catch (e: any) {
      toast.error('Error approving enrollment: ' + e.message);
    } finally {
      setLoadingId(null);
    }
  };

  const approveTutor = async (req: any) => {
    const tutorRealName = resolveRealName(req, req.email);
    const candidatePhotoUrl = String(req.photoURL || req.photoUrl || req.profilePhotoUrl || '').trim();
    const hasValidPhoto = isValidTutorPhotoUrl(candidatePhotoUrl);
    const confirmMsg = hasValidPhoto
      ? `Approve tutor ${tutorRealName}, grant instructor permissions, and publish to Find a Tutor?`
      : `Approve tutor ${tutorRealName}? Note: This applicant has no verified portrait photograph, so they will remain hidden from Find a Tutor until a photo is uploaded.`;
    if (!window.confirm(confirmMsg)) return;
    setLoadingId(req.id);
    try {
      const cleanEmail = (req.email || '').toLowerCase().trim();
      const subjects = Array.isArray(req.subjects) ? req.subjects : (req.subjects || '').split(',').map((s: string) => s.trim()).filter(Boolean);
      const nextPublicStatus: TutorPublicProfileStatus = hasValidPhoto ? 'PUBLISHED' : 'PENDING_REVIEW';

      const tutorPayload = {
        name: tutorRealName,
        fullName: tutorRealName,
        displayName: tutorRealName,
        email: cleanEmail,
        phone: req.phone || '',
        location: req.location || '',
        qualification: req.qualification || '',
        cvUrl: req.cvUrl || '',
        ...(hasValidPhoto ? { photoURL: candidatePhotoUrl } : {}),
        subjects,
        experienceYears: req.experienceYears || '1–3 Years',
        daysPerWeek: req.daysPerWeek || '',
        timeSlot: req.timeSlot || '',
        expectedSalary: req.expectedSalary || '',
        bio: req.bio || '',
        role: 'staff',
        status: 'ACTIVE',
        accountStatus: 'ACTIVE',
        approvalStatus: 'approved',
        publicProfileStatus: nextPublicStatus,
        verified: true,
        updatedAt: serverTimestamp()
      };

      // 1. Write to tutors/{req.uid || req.id}
      const primaryTutorDocId = String(req.uid || req.userId || req.id).trim() || req.id;
      await setDoc(doc(db, 'tutors', primaryTutorDocId), {
        ...tutorPayload,
        createdAt: serverTimestamp()
      }, { merge: true });

      // 2. Look up existing user account by email to update role ONLY if not already a PARENT or SCHOOL
      let matchedUserId = String(req.uid || req.userId || '').trim();
      if (cleanEmail) {
        try {
          const userQuery = query(collection(db, 'users'), where('email', '==', cleanEmail), limit(1));
          const userSnap = await getDocs(userQuery);
          if (!userSnap.empty) {
            const existingUserDoc = userSnap.docs[0];
            const existingRoleUpper = String(existingUserDoc.data()?.role || '').toUpperCase();
            if (existingRoleUpper !== 'PARENT' && existingRoleUpper !== 'SCHOOL') {
              matchedUserId = existingUserDoc.id;
              await setDoc(doc(db, 'users', matchedUserId), {
                role: 'staff',
                name: tutorRealName,
                fullName: tutorRealName,
                ...(hasValidPhoto ? { photoURL: candidatePhotoUrl } : {}),
                accountStatus: 'ACTIVE',
                status: 'ACTIVE',
                approvalStatus: 'approved',
                publicProfileStatus: nextPublicStatus,
                updatedAt: serverTimestamp()
              }, { merge: true });

              await setDoc(doc(db, 'tutors', matchedUserId), {
                ...tutorPayload,
                uid: matchedUserId,
                userId: matchedUserId,
                firebaseUid: matchedUserId
              }, { merge: true });
            }
          }
        } catch (uErr) {
          console.warn('User profile sync notice:', uErr);
        }
      }

      await updateDoc(doc(db, 'tutor_applications', req.id), {
        name: tutorRealName,
        status: 'approved',
        publicProfileStatus: nextPublicStatus,
        tutorId: matchedUserId || primaryTutorDocId,
        approvedAt: serverTimestamp()
      });

      if (selectedTutorDetail?.id === req.id) {
        setSelectedTutorDetail(null);
      }

      if (hasValidPhoto) {
        toast.success(`Tutor ${tutorRealName} approved into faculty and published to Find a Tutor!`);
      } else {
        toast.info(`Tutor ${tutorRealName} approved for portal access, but kept hidden from Find a Tutor until a verified portrait photo is uploaded.`);
      }
    } catch (e: any) {
      toast.error('Error: ' + e.message);
    } finally {
      setLoadingId(null);
    }
  };

  const rejectRequest = async (collectionName: string, id: string) => {
    if (!window.confirm('Are you sure you want to reject this request?')) return;
    setLoadingId(id);
    try {
      await updateDoc(doc(db, collectionName, id), {
        status: 'rejected',
        rejectedAt: serverTimestamp()
      });
      if (selectedTutorDetail?.id === id) {
        setSelectedTutorDetail(null);
      }
      toast.info('Request has been marked as rejected.');
    } catch (e: any) {
      toast.error('Error: ' + e.message);
    } finally {
      setLoadingId(null);
    }
  };

  const filteredTutors = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tutorReqs;
    return tutorReqs.filter(r => 
      (r.name && r.name.toLowerCase().includes(q)) || 
      (r.email && r.email.toLowerCase().includes(q)) ||
      (r.phone && r.phone.toLowerCase().includes(q))
    );
  }, [tutorReqs, search]);

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return studentReqs;
    return studentReqs.filter(r => 
      (r.name && r.name.toLowerCase().includes(q)) || 
      (r.email && r.email.toLowerCase().includes(q)) ||
      (r.phone && r.phone.toLowerCase().includes(q))
    );
  }, [studentReqs, search]);

  const filteredEnrollments = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return enrollmentReqs;
    return enrollmentReqs.filter(r => 
      (r.studentName && r.studentName.toLowerCase().includes(q)) || 
      (r.parentEmail && r.parentEmail.toLowerCase().includes(q))
    );
  }, [enrollmentReqs, search]);

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-12">
      <SEO title="Approvals & Onboarding | Admin" description="Review and approve incoming tutor applications, student enrollment requests, and program leads." noindex={true} />

      {/* Responsive Filter / Dropdown Bar */}
      <div className="bg-white dark:bg-[#111114] border border-slate-200/80 dark:border-zinc-800 rounded-2xl p-3.5 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
          
          {/* Approval Queue Type Selector */}
          <div className="sm:col-span-6">
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-zinc-400 mb-1">
              Approval Queue Type
            </label>
            <div className="relative">
              <select
                value={activeTab}
                onChange={e => {
                  const next = e.target.value as any;
                  setActiveTab(next);
                  setSearchParams({ tab: next }, { replace: true });
                }}
                className="w-full min-h-10 pl-3 pr-8 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] text-slate-900 dark:text-white text-xs font-bold focus:ring-2 focus:ring-brand-red focus:border-brand-red outline-none appearance-none cursor-pointer"
              >
                <option value="tutors">Tutor Applications ({tutorReqs.length})</option>
                <option value="students">Student Requests ({studentReqs.length})</option>
                <option value="enrollments">Parent Course Requests ({enrollmentReqs.length})</option>
                <option value="programme_apps">
                  Student Programme Applications (
                  {programmeApps.filter((a) => a.enrollmentStatus === 'PENDING_ADMIN_REVIEW').length}{' '}
                  pending / {programmeApps.length})
                </option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
            </div>
          </div>

          {/* Instant Search Box */}
          <div className="sm:col-span-6">
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-zinc-400 mb-1">
              Search Applicants
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Name, email or contact..."
                className="w-full min-h-10 pl-8 pr-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] text-slate-900 dark:text-white text-xs font-medium focus:ring-2 focus:ring-brand-red focus:border-brand-red outline-none"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Main Table / Directory List */}
      <div className="bg-white dark:bg-[#111114] border border-slate-200/80 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[760px]">
            <thead className="bg-slate-50 dark:bg-[#18181B] border-b border-slate-200 dark:border-zinc-800 text-slate-400 dark:text-zinc-400 uppercase font-black text-[10px]">
              <tr>
                <th className="py-3 px-3.5">Applicant / Name</th>
                <th className="py-3 px-3.5">Tracks & Details</th>
                {activeTab === 'tutors' && <th className="py-3 px-3.5">Availability & Rate</th>}
                <th className="py-3 px-3.5">Applied Date</th>
                <th className="py-3 px-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/70">
              {/* TUTOR APPLICATIONS */}
              {activeTab === 'tutors' && filteredTutors.map(req => {
                const candidatePhoto = String(req.photoURL || req.photoUrl || req.profilePhotoUrl || '').trim();
                const hasPhoto = isValidTutorPhotoUrl(candidatePhoto);
                return (
                <tr key={req.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-950/40 transition-colors">
                  <td className="py-3 px-3.5 max-w-[240px]">
                    <div className="flex items-start gap-2.5">
                      {hasPhoto ? (
                        <img
                          src={candidatePhoto}
                          alt={resolveRealName(req, req.email)}
                          className="h-10 w-10 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0" title="Missing portrait photograph">
                          <ImageOff size={15} />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 dark:text-white truncate">
                          {resolveRealName(req, req.email)}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate flex items-center gap-1 mt-0.5">
                          <Mail size={11} /> {req.email}
                        </div>
                        {req.phone && (
                          <div className="text-[10px] font-mono text-slate-400 flex items-center gap-1 mt-0.5">
                            <Phone size={10} /> {req.phone}
                          </div>
                        )}
                        {req.qualification && (
                          <div className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1 mt-1">
                            <Award size={10} /> {req.qualification}
                          </div>
                        )}
                        {!hasPhoto && (
                          <div className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-700 dark:text-amber-300 text-[9px] font-bold">
                            <AlertTriangle size={9} /> Missing Photo — Cannot Publish Publicly
                          </div>
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="py-3 px-3.5 max-w-[240px]">
                    <div className="flex flex-wrap gap-1 mb-1">
                      {Array.isArray(req.subjects) ? req.subjects.map((s: string, i: number) => (
                        <span key={i} className="px-2 py-0.5 bg-brand-red/10 text-brand-red text-[10px] font-bold rounded-md">
                          {s}
                        </span>
                      )) : req.subjects}
                    </div>
                    {req.bio && <div className="text-[10px] text-slate-500 line-clamp-2">{req.bio}</div>}
                    {req.cvUrl && (
                      <a href={req.cvUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] text-brand-red font-bold hover:underline mt-1">
                        <ExternalLink size={10} /> CV Document
                      </a>
                    )}
                  </td>

                  <td className="py-3 px-3.5 text-[11px]">
                    <div className="text-slate-700 dark:text-slate-300 font-semibold flex items-center gap-1">
                      <Calendar size={11} className="text-slate-400" /> {req.daysPerWeek || 'Not specified'}
                    </div>
                    {req.timeSlot && (
                      <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                        <Clock size={10} /> {req.timeSlot}
                      </div>
                    )}
                    {req.expectedSalary && (
                      <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                        {req.expectedSalary}
                      </div>
                    )}
                  </td>

                  <td className="py-3 px-3.5 whitespace-nowrap text-[11px] text-slate-400">
                    {req.createdAt?.toDate?.().toLocaleDateString() || 'Recently'}
                  </td>

                  <td className="py-3 px-3.5 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      <button 
                        type="button" 
                        onClick={() => setSelectedTutorDetail(req)} 
                        className="min-h-7 px-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 text-[10px] font-bold inline-flex items-center gap-1"
                        title="View Full Profile"
                      >
                        <Eye size={11} /> Profile
                      </button>
                      <button 
                        type="button" 
                        onClick={() => void approveTutor(req)} 
                        disabled={loadingId === req.id} 
                        className="min-h-7 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold shadow-sm transition-all disabled:opacity-50 inline-flex items-center gap-1"
                      >
                        {loadingId === req.id ? <Loader2 className="animate-spin" size={11} /> : <CheckCircle2 size={11} />} Approve
                      </button>
                      <button 
                        type="button" 
                        onClick={() => void rejectRequest('tutor_applications', req.id)} 
                        disabled={loadingId === req.id} 
                        className="min-h-7 px-2 bg-red-50 dark:bg-red-950/40 text-red-600 hover:bg-red-100 rounded-lg text-[10px] font-bold transition-all disabled:opacity-50 inline-flex items-center gap-1"
                      >
                        <XCircle size={11} /> Reject
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}

              {/* STUDENT REQUESTS */}
              {activeTab === 'students' && filteredStudents.map(req => (
                <tr key={req.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-950/40 transition-colors">
                  <td className="py-3 px-3.5">
                    <div className="font-bold text-slate-900 dark:text-white">{req.name}</div>
                    <div className="text-[11px] text-slate-400">{req.email}</div>
                    {req.phone && <div className="text-[10px] text-slate-400">Phone: {req.phone}</div>}
                    {req.parentPhone && <div className="text-[10px] text-slate-400">Parent: {req.parentPhone}</div>}
                  </td>
                  <td className="py-3 px-3.5">
                    <div className="text-[11px] font-bold text-brand-red mb-0.5">Class: {formatNormalizedClassDisplay(req.class || req.grade, 'Grade 7')}</div>
                    <div className="text-[11px] text-slate-700 dark:text-slate-300">{Array.isArray(req.subjects) ? req.subjects.join(', ') : req.subjects}</div>
                    {req.notes && <div className="text-[10px] text-slate-400 mt-0.5 italic">"{req.notes}"</div>}
                  </td>
                  <td className="py-3 px-3.5 whitespace-nowrap text-[11px] text-slate-400">
                    {req.createdAt?.toDate?.().toLocaleDateString() || 'Recently'}
                  </td>
                  <td className="py-3 px-3.5 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      <button 
                        type="button" 
                        onClick={() => setSelectedRequestForModal(req)} 
                        disabled={loadingId === req.id} 
                        className="min-h-7 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold disabled:opacity-50 inline-flex items-center gap-1 shadow-sm cursor-pointer"
                      >
                        <UserCheck size={11} /> Approve &amp; Configure Access
                      </button>
                      <button 
                        type="button" 
                        onClick={() => void rejectRequest('student_requests', req.id)} 
                        disabled={loadingId === req.id} 
                        className="min-h-7 px-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-[10px] font-bold disabled:opacity-50 inline-flex items-center gap-1"
                      >
                        <XCircle size={11} /> Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {/* COURSE ENROLLMENTS */}
              {activeTab === 'enrollments' && filteredEnrollments.map(req => (
                <tr key={req.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-950/40 transition-colors">
                  <td className="py-3 px-3.5">
                    <div className="font-bold text-slate-900 dark:text-white">{req.studentName}</div>
                    <div className="text-[11px] text-slate-400">{req.parentEmail || req.email || 'Parent account'}</div>
                  </td>
                  <td className="py-3 px-3.5">
                    <div className="text-[11px] font-bold text-brand-red mb-0.5">Plan: {req.plan || '—'}</div>
                    <div className="text-[10px] text-slate-500">Class / Grade: {formatNormalizedClassDisplay(req.class || req.grade || req.studentClass || req.studentAge, 'Grade 1')}</div>
                    <div className="text-[10px] text-slate-500">Subjects: {Array.isArray(req.subjects) ? req.subjects.join(', ') : req.subjects || '—'}</div>
                  </td>
                  <td className="py-3 px-3.5 whitespace-nowrap text-[11px] text-slate-400">
                    {req.createdAt?.toDate?.().toLocaleDateString() || 'Recently'}
                  </td>
                  <td className="py-3 px-3.5 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      <button 
                        type="button" 
                        onClick={() => setSelectedRequestForModal(req)} 
                        disabled={loadingId === req.id} 
                        className="min-h-7 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold shadow-sm transition-all disabled:opacity-50 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <UserCheck size={11} /> Approve &amp; Configure Access
                      </button>
                      <button 
                        type="button" 
                        onClick={() => void rejectRequest('enrollment_requests', req.id)} 
                        disabled={loadingId === req.id} 
                        className="min-h-7 px-2 bg-red-50 dark:bg-red-950/40 text-red-600 hover:bg-red-100 rounded-lg text-[10px] font-bold transition-all disabled:opacity-50 inline-flex items-center gap-1"
                      >
                        <XCircle size={11} /> Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {/* STUDENT PROGRAMME APPLICATIONS (SELF-FUNDED) */}
              {activeTab === 'programme_apps' &&
                programmeApps
                  .filter((app) => {
                    const q = search.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      app.studentName.toLowerCase().includes(q) ||
                      String(app.studentEmail || '').toLowerCase().includes(q) ||
                      app.programTitle.toLowerCase().includes(q) ||
                      String(app.schoolName || '').toLowerCase().includes(q)
                    );
                  })
                  .map((app) => (
                    <tr
                      key={app.id}
                      className="hover:bg-slate-50/60 dark:hover:bg-slate-950/40 transition-colors"
                    >
                      <td className="py-3 px-3.5 max-w-[240px]">
                        <div className="font-bold text-slate-900 dark:text-white truncate">
                          {app.studentName}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate flex items-center gap-1 mt-0.5">
                          <Mail size={11} /> {app.studentEmail || 'No email on profile'}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                              app.studentRegistrationType === 'school'
                                ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            {app.studentRegistrationType === 'school'
                              ? `School Student · Self-Funded${app.schoolName ? ` (${app.schoolName})` : ''}`
                              : 'Individual Student · Self-Funded'}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-3.5 max-w-[280px]">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {app.programTitle}
                        </div>
                        {app.breadcrumbPath && (
                          <div className="text-[10px] text-slate-500 truncate">
                            {app.breadcrumbPath}
                          </div>
                        )}
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                          <span className="font-semibold">
                            {app.deliveryOption === 'PRIVATE_MENTORSHIP'
                              ? '1-on-1 Private'
                              : 'Public Group'}
                          </span>
                          <span>·</span>
                          <span className="font-bold text-slate-700 dark:text-slate-200">
                            {app.enrollmentStatus.replace(/_/g, ' ')}
                          </span>
                          {app.approvedFee > 0 && (
                            <>
                              <span>·</span>
                              <span className="font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                                ₦{app.approvedFee.toLocaleString()} (Paid: ₦
                                {app.amountPaid.toLocaleString()})
                              </span>
                            </>
                          )}
                        </div>
                        {app.emailDeliveryStatus && (
                          <div className="mt-1 text-[10px] font-semibold text-slate-500">
                            Email:{' '}
                            <span
                              className={
                                app.emailDeliveryStatus === 'SENT'
                                  ? 'text-emerald-600'
                                  : app.emailDeliveryStatus === 'FAILED'
                                  ? 'text-red-600'
                                  : 'text-amber-600'
                              }
                            >
                              {app.emailDeliveryStatus}
                            </span>
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-3.5 text-[11px] text-slate-500">
                        {app.createdAt?.toDate
                          ? app.createdAt.toDate().toLocaleDateString()
                          : 'Recent'}
                      </td>

                      <td className="py-3 px-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {app.enrollmentStatus === 'PENDING_ADMIN_REVIEW' && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setApprovalTargetApp(app);
                                  setApproveFeeAmount(
                                    String(app.approvedFee > 0 ? app.approvedFee : 35000)
                                  );
                                  setApproveBillingCycle(app.billingCycle || 'Per Term / Cohort');
                                  setApproveDurationWeeks(String(app.durationWeeks || 8));
                                  setApproveAllowDeposit(false);
                                  setApproveDepositAmount('15000');
                                  setApproveAdminNotes('');
                                }}
                                className="min-h-7 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold shadow-sm inline-flex items-center gap-1 cursor-pointer"
                              >
                                <UserCheck size={11} /> Approve &amp; Set Fee
                              </button>
                              <button
                                type="button"
                                disabled={loadingId === app.id}
                                onClick={async () => {
                                  setLoadingId(app.id);
                                  try {
                                    await rejectProgrammeEnrollmentAsAdmin({
                                      enrollmentId: app.id,
                                      rejectionReason: 'Application declined during admissions review.',
                                    });
                                    toast.info('Programme application rejected.');
                                  } catch (err: any) {
                                    toast.error(err?.message || 'Failed to reject application.');
                                  } finally {
                                    setLoadingId(null);
                                  }
                                }}
                                className="min-h-7 px-2 bg-red-50 dark:bg-red-950/40 text-red-600 hover:bg-red-100 rounded-lg text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer"
                              >
                                <XCircle size={11} /> Reject
                              </button>
                            </>
                          )}

                          {app.enrollmentStatus !== 'PENDING_ADMIN_REVIEW' &&
                            app.enrollmentStatus !== 'REJECTED' &&
                            app.studentEmail && (
                              <button
                                type="button"
                                disabled={loadingId === app.id}
                                onClick={async () => {
                                  setLoadingId(app.id);
                                  try {
                                    const res = await retryProgrammeAdmissionEmail(app.id);
                                    if (res.emailSent) {
                                      toast.success('Admission email sent successfully.');
                                    } else {
                                      toast.error(
                                        res.emailError || 'Email delivery failed.'
                                      );
                                    }
                                  } catch (err: any) {
                                    toast.error(err?.message || 'Failed to resend email.');
                                  } finally {
                                    setLoadingId(null);
                                  }
                                }}
                                className="min-h-7 px-2.5 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer"
                              >
                                <Mail size={11} /> Retry Email
                              </button>
                            )}
                        </div>
                      </td>
                    </tr>
                  ))}

              {/* EMPTY STATE */}
              {((activeTab === 'students' && filteredStudents.length === 0) || 
                (activeTab === 'tutors' && filteredTutors.length === 0) || 
                (activeTab === 'enrollments' && filteredEnrollments.length === 0) ||
                (activeTab === 'programme_apps' && programmeApps.length === 0)) && (
                <tr>
                  <td colSpan={activeTab === 'tutors' ? 5 : 4} className="py-16 text-center text-xs text-slate-400">
                    <div className="flex flex-col items-center justify-center">
                      <CheckCircle2 size={24} className="text-emerald-500 mb-1.5" />
                      <p className="font-bold text-slate-800 dark:text-slate-200">No pending {activeTab.replace(/_/g, ' ')} applications</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">All incoming requests have been reviewed.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tutor Detail Modal */}
      {selectedTutorDetail && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full p-5 space-y-4 border border-slate-200 dark:border-slate-800 max-h-[92vh] overflow-y-auto text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-3 min-w-0">
                {isValidTutorPhotoUrl(selectedTutorDetail.photoURL || selectedTutorDetail.photoUrl) ? (
                  <img
                    src={selectedTutorDetail.photoURL || selectedTutorDetail.photoUrl}
                    alt={selectedTutorDetail.name}
                    className="h-12 w-12 rounded-2xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <ImageOff size={18} />
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="font-black text-sm text-slate-900 dark:text-white truncate">
                    Tutor Profile: {selectedTutorDetail.name}
                  </h3>
                  <p className="text-[11px] text-slate-400">Credentials and instructional background</p>
                </div>
              </div>
              <button 
                type="button" 
                onClick={() => setSelectedTutorDetail(null)} 
                className="min-h-8 min-w-8 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>

            {!isValidTutorPhotoUrl(selectedTutorDetail.photoURL || selectedTutorDetail.photoUrl) && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-200 text-[11px] flex items-start gap-2">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>
                  This applicant does not have a verified portrait photograph yet. Approving will grant staff portal access, but their profile will stay <strong>hidden from the public Find a Tutor directory</strong> until a verified photograph is uploaded.
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="p-2.5 bg-slate-50 dark:bg-slate-950/60 rounded-xl">
                <span className="text-slate-400 font-bold block text-[9px] uppercase">Email</span>
                <p className="font-bold text-slate-900 dark:text-white break-all">{selectedTutorDetail.email}</p>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-950/60 rounded-xl">
                <span className="text-slate-400 font-bold block text-[9px] uppercase">Phone</span>
                <p className="font-bold text-slate-900 dark:text-white">{selectedTutorDetail.phone || 'N/A'}</p>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-950/60 rounded-xl">
                <span className="text-slate-400 font-bold block text-[9px] uppercase">Location</span>
                <p className="font-bold text-slate-900 dark:text-white">{selectedTutorDetail.location || 'N/A'}</p>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-950/60 rounded-xl">
                <span className="text-slate-400 font-bold block text-[9px] uppercase">Qualification</span>
                <p className="font-bold text-amber-600 dark:text-amber-400">{selectedTutorDetail.qualification || 'N/A'}</p>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-950/60 rounded-xl">
                <span className="text-slate-400 font-bold block text-[9px] uppercase">Availability</span>
                <p className="font-bold text-slate-900 dark:text-white">{selectedTutorDetail.daysPerWeek || 'N/A'}</p>
              </div>
              <div className="p-2.5 bg-slate-50 dark:bg-slate-950/60 rounded-xl">
                <span className="text-slate-400 font-bold block text-[9px] uppercase">Expected Rate</span>
                <p className="font-bold text-emerald-600 dark:text-emerald-400">{selectedTutorDetail.expectedSalary || 'N/A'}</p>
              </div>
            </div>

            <div>
              <span className="text-[10px] font-black uppercase text-slate-400 block mb-1">Instructional Tracks</span>
              <div className="flex flex-wrap gap-1">
                {Array.isArray(selectedTutorDetail.subjects) && selectedTutorDetail.subjects.map((s: string, i: number) => (
                  <span key={i} className="px-2 py-0.5 bg-brand-red/10 text-brand-red text-[10px] font-bold rounded-md">
                    {s}
                  </span>
                ))}
              </div>
            </div>

            {selectedTutorDetail.bio && (
              <div>
                <span className="text-[10px] font-black uppercase text-slate-400 block mb-1">Teaching Philosophy</span>
                <p className="p-3 bg-slate-50 dark:bg-slate-950/60 rounded-xl text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">
                  {selectedTutorDetail.bio}
                </p>
              </div>
            )}

            {selectedTutorDetail.cvUrl && (
              <a 
                href={selectedTutorDetail.cvUrl} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="w-full py-2 px-3 rounded-xl bg-red-50 dark:bg-red-950/40 text-brand-red font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-red-100 transition-all"
              >
                <ExternalLink size={13} /> Open Resume / Portfolio Document
              </a>
            )}

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
              <button 
                type="button" 
                onClick={() => setSelectedTutorDetail(null)} 
                className="min-h-9 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300"
              >
                Close
              </button>
              <button 
                type="button" 
                onClick={() => void approveTutor(selectedTutorDetail)} 
                disabled={loadingId === selectedTutorDetail.id} 
                className="min-h-9 px-4 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50"
              >
                Approve Tutor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Student Enrollment & Access Approval Modal */}
      {selectedRequestForModal && (
        <StudentEnrollmentApprovalModal
          request={selectedRequestForModal}
          isOpen={Boolean(selectedRequestForModal)}
          onClose={() => setSelectedRequestForModal(null)}
          onSuccess={() => {
            setSelectedRequestForModal(null);
          }}
        />
      )}

      {/* Self-Funded Student Programme Approval & Fee Configuration Modal */}
      {approvalTargetApp && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-5 space-y-4 border border-slate-200 dark:border-slate-800 text-xs shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="font-black text-sm text-slate-900 dark:text-white">
                  Approve &amp; Configure Programme Fee
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {approvalTargetApp.studentName} — {approvalTargetApp.programTitle}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setApprovalTargetApp(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {approvalTargetApp.studentRegistrationType === 'school' && (
              <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-[#18181B] border border-slate-200 dark:border-zinc-800 text-slate-800 dark:text-zinc-200 text-[11px]">
                <strong>School Student (Self-Funded):</strong> Approving this unlocks personal
                student payment only and notifies the student in their portal inbox. School-funded tracks and school invoices remain untouched.
              </div>
            )}

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setApprovingApp(true);
                try {
                  const normCycle = approveBillingCycle.toLowerCase();
                  const mappedCycle: 'monthly' | 'termly' | 'cohort' | 'one_time' =
                    normCycle.includes('month')
                      ? 'monthly'
                      : normCycle.includes('term')
                      ? 'termly'
                      : normCycle.includes('one')
                      ? 'one_time'
                      : 'cohort';
                  const res = await approveProgrammeEnrollmentAsAdmin({
                    enrollmentId: approvalTargetApp.id,
                    approvedFee: Number(approveFeeAmount),
                    billingCycle: mappedCycle,
                    durationWeeks: Number(approveDurationWeeks) || 8,
                    allowDepositAccess: approveAllowDeposit,
                    depositAmount: approveAllowDeposit ? Number(approveDepositAmount) : 0,
                    adminNotes: approveAdminNotes,
                    studentContext: {
                      studentUid: approvalTargetApp.studentUid,
                      studentDocId: approvalTargetApp.studentDocId,
                      studentName: approvalTargetApp.studentName,
                      studentEmail: approvalTargetApp.studentEmail,
                      programId: approvalTargetApp.programId,
                      programTitle: approvalTargetApp.programTitle,
                      schoolId: approvalTargetApp.schoolId,
                      schoolName: approvalTargetApp.schoolName,
                    },
                  });
                  if (res.emailSent) {
                    toast.success('Approved! Student notified in-app and via branded admission email.');
                  } else {
                    toast.success(
                      'Approved! Student inbox notification sent with a direct link to Billing & Fees.'
                    );
                  }
                  setApprovalTargetApp(null);
                } catch (err: any) {
                  toast.error(err?.message || 'Failed to approve programme application.');
                } finally {
                  setApprovingApp(false);
                }
              }}
              className="space-y-3"
            >
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Approved Tuition Fee (NGN) *
                </label>
                <input
                  type="number"
                  min={100}
                  required
                  value={approveFeeAmount}
                  onChange={(e) => setApproveFeeAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-bold tabular-nums"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Billing Cycle
                  </label>
                  <select
                    value={approveBillingCycle}
                    onChange={(e) => setApproveBillingCycle(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-semibold"
                  >
                    <option value="Per Term / Cohort">Per Term / Cohort</option>
                    <option value="Monthly">Monthly</option>
                    <option value="One-Time Full Programme">One-Time Full Programme</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Cycle Duration (Weeks)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={52}
                    value={approveDurationWeeks}
                    onChange={(e) => setApproveDurationWeeks(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-bold tabular-nums"
                  />
                </div>
              </div>

              <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 cursor-pointer">
                <span className="font-bold text-slate-700 dark:text-slate-200">
                  Allow Partial Deposit to Start
                </span>
                <input
                  type="checkbox"
                  checked={approveAllowDeposit}
                  onChange={(e) => setApproveAllowDeposit(e.target.checked)}
                  className="h-4 w-4 text-brand-red rounded"
                />
              </label>

              {approveAllowDeposit && (
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Minimum Deposit Amount (NGN) *
                  </label>
                  <input
                    type="number"
                    min={100}
                    required
                    value={approveDepositAmount}
                    onChange={(e) => setApproveDepositAmount(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-bold tabular-nums"
                  />
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Admissions Note (Included in Email)
                </label>
                <textarea
                  rows={2}
                  value={approveAdminNotes}
                  onChange={(e) => setApproveAdminNotes(e.target.value)}
                  placeholder="Optional welcome message or cohort start instructions..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setApprovalTargetApp(null)}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={approvingApp}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold disabled:opacity-50 cursor-pointer"
                >
                  {approvingApp && <Loader2 size={13} className="animate-spin" />}
                  <span>Approve &amp; Send Email</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminApprovals;
