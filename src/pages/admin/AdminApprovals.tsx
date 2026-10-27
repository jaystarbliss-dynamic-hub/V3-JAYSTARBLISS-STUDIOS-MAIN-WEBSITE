import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../../lib/firebase';
import { collection, doc, setDoc, addDoc, updateDoc, deleteDoc, getDocs, limit, serverTimestamp, query, where, onSnapshot } from 'firebase/firestore';
import { 
  CheckCircle2, XCircle, Clock, ExternalLink, Award, 
  Calendar, Phone, Mail, Eye, ChevronDown, Search, Loader2, X,
  Sparkles, UserCheck
} from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import SEO from '../../components/ui/SEO';
import { StudentEnrollmentApprovalModal } from '../../components/admin/StudentEnrollmentApprovalModal';
import { resolveRealName } from '../../utils/userNames';
import { formatNormalizedClassDisplay, normalizeClassName } from '../../lib/classes';

const AdminApprovals: React.FC = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'tutors' | 'subjects' | 'students' | 'enrollments'>('tutors');
  const [search, setSearch] = useState('');
  const [studentReqs, setStudentReqs] = useState<any[]>([]);
  const [tutorReqs, setTutorReqs] = useState<any[]>([]);
  const [subjectReqs, setSubjectReqs] = useState<any[]>([]);
  const [enrollmentReqs, setEnrollmentReqs] = useState<any[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [selectedTutorDetail, setSelectedTutorDetail] = useState<any | null>(null);
  const [selectedSubjectDetail, setSelectedSubjectDetail] = useState<any | null>(null);
  const [selectedRequestForModal, setSelectedRequestForModal] = useState<any | null>(null);

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

    return () => {
      unsubStudents();
      unsubTutors();
      unsubSubjects();
      unsubEnrollments();
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
      
      const canonicalStudentClass = normalizeClassName(req.class || req.grade, 'Grade 7');
      await addDoc(collection(db, 'students'), {
        fullName: req.name,
        username: makeUniqueUsername(req.name, req.email, req.id),
        email: (req.email || '').toLowerCase(),
        phone: req.phone || '',
        parentPhone: req.parentPhone || '',
        class: canonicalStudentClass,
        grade: canonicalStudentClass,
        accessCode,
        parentId: req.parentId || null,
        subjects,
        registeredAt: serverTimestamp()
      });

      await addDoc(collection(db, 'individualStudents'), {
        fullName: req.name,
        username: makeUniqueUsername(req.name, req.email, req.id),
        email: (req.email || '').toLowerCase(),
        accessCode,
        subjects,
        status: 'ACTIVE',
        parentId: req.parentId || null,
        parentEmail: req.parentEmail || req.email || '',
        createdAt: serverTimestamp()
      });

      await updateDoc(doc(db, 'student_requests', req.id), {
        status: 'approved',
        accessCode,
        approvedAt: serverTimestamp()
      });
      toast.success(`Student Approved! Access code: ${accessCode}`);
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
      const username = makeUniqueUsername(studentName, req.parentEmail || '', req.id);
      const studentRecordId = `enr_${req.id}`;
      const subjects = Array.isArray(req.subjects)
        ? req.subjects.filter((subject: unknown): subject is string => typeof subject === 'string' && Boolean(subject.trim()))
        : String(req.subjects || '').split(',').map((subject: string) => subject.trim()).filter(Boolean);
      const parentId = req.parentId || null;
      const parentEmail = req.parentEmail || '';

      const sharedStudentRecord = {
        fullName: studentName,
        username,
        email: req.studentEmail || '',
        parentId,
        parentEmail,
        parentName: req.parentName || '',
        subjects,
        plan: req.plan || '',
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
    if (!window.confirm(`Approve tutor ${tutorRealName} and grant instructor permissions?`)) return;
    setLoadingId(req.id);
    try {
      const cleanEmail = (req.email || '').toLowerCase().trim();
      const subjects = Array.isArray(req.subjects) ? req.subjects : (req.subjects || '').split(',').map((s: string) => s.trim()).filter(Boolean);
      
      const tutorPayload = {
        name: tutorRealName,
        fullName: tutorRealName,
        displayName: tutorRealName,
        email: cleanEmail,
        phone: req.phone || '',
        location: req.location || '',
        qualification: req.qualification || '',
        cvUrl: req.cvUrl || '',
        subjects,
        experienceYears: req.experienceYears || '1–3 Years',
        daysPerWeek: req.daysPerWeek || '',
        timeSlot: req.timeSlot || '',
        expectedSalary: req.expectedSalary || '',
        bio: req.bio || '',
        role: 'staff',
        status: 'ACTIVE',
        accountStatus: 'ACTIVE',
        updatedAt: serverTimestamp()
      };

      // 1. Write to tutors/{req.id}
      await setDoc(doc(db, 'tutors', req.id), {
        ...tutorPayload,
        createdAt: serverTimestamp()
      }, { merge: true });

      // 2. Look up existing user account by email to update role directly
      let matchedUserId = '';
      if (cleanEmail) {
        try {
          const userQuery = query(collection(db, 'users'), where('email', '==', cleanEmail), limit(1));
          const userSnap = await getDocs(userQuery);
          if (!userSnap.empty) {
            matchedUserId = userSnap.docs[0].id;
            await setDoc(doc(db, 'users', matchedUserId), {
              role: 'staff',
              name: tutorRealName,
              fullName: tutorRealName,
              accountStatus: 'ACTIVE',
              status: 'ACTIVE',
              updatedAt: serverTimestamp()
            }, { merge: true });

            // Also mirror tutor document under the user's primary UID
            await setDoc(doc(db, 'tutors', matchedUserId), {
              ...tutorPayload,
              userId: matchedUserId,
              firebaseUid: matchedUserId
            }, { merge: true });

            // Clean up any stale parent record to avoid role conflict
            await deleteDoc(doc(db, 'parents', matchedUserId)).catch(() => null);
          }
        } catch (uErr) {
          console.warn('User profile sync notice:', uErr);
        }
      }

      await updateDoc(doc(db, 'tutor_applications', req.id), {
        name: tutorRealName,
        status: 'approved',
        tutorId: matchedUserId || req.id,
        approvedAt: serverTimestamp()
      });

      if (selectedTutorDetail?.id === req.id) {
        setSelectedTutorDetail(null);
      }

      toast.success(`Tutor ${tutorRealName} approved into faculty!`);
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
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
          
          {/* Category Dropdown for Mobile / Compact selector */}
          <div className="sm:col-span-6">
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
              Approval Queue Type
            </label>
            <div className="relative">
              <select
                value={activeTab}
                onChange={e => setActiveTab(e.target.value as any)}
                className="w-full min-h-9 pl-3 pr-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs font-bold focus:ring-2 focus:ring-brand-red focus:border-brand-red outline-none appearance-none cursor-pointer"
              >
                <option value="tutors">Tutor Applications ({tutorReqs.length})</option>
                <option value="students">Student Requests ({studentReqs.length})</option>
                <option value="enrollments">Course Enrollments ({enrollmentReqs.length})</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
            </div>
          </div>

          {/* Instant Search Box */}
          <div className="sm:col-span-6">
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
              Search Applicants
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Name, email or contact..."
                className="w-full min-h-9 pl-8 pr-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs font-medium focus:ring-2 focus:ring-brand-red focus:border-brand-red outline-none"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

        </div>

        {/* Quick pill toggle row */}
        <div className="flex items-center gap-1.5 mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 text-[11px] overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('tutors')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'tutors'
                ? 'bg-brand-red text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            Tutor Applications <span className="text-[10px] opacity-80">({tutorReqs.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('students')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'students'
                ? 'bg-brand-red text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            Student Requests <span className="text-[10px] opacity-80">({studentReqs.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('enrollments')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
              activeTab === 'enrollments'
                ? 'bg-brand-red text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            Course Enrollments <span className="text-[10px] opacity-80">({enrollmentReqs.length})</span>
          </button>
        </div>
      </div>

      {/* Main Table / Directory List */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[760px]">
            <thead className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-black text-[10px]">
              <tr>
                <th className="py-3 px-3.5">Applicant / Name</th>
                <th className="py-3 px-3.5">Tracks & Details</th>
                {activeTab === 'tutors' && <th className="py-3 px-3.5">Availability & Rate</th>}
                <th className="py-3 px-3.5">Applied Date</th>
                <th className="py-3 px-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {/* TUTOR APPLICATIONS */}
              {activeTab === 'tutors' && filteredTutors.map(req => (
                <tr key={req.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-950/40 transition-colors">
                  <td className="py-3 px-3.5 max-w-[200px]">
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
              ))}

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

              {/* EMPTY STATE */}
              {((activeTab === 'students' && filteredStudents.length === 0) || 
                (activeTab === 'tutors' && filteredTutors.length === 0) || 
                (activeTab === 'enrollments' && filteredEnrollments.length === 0)) && (
                <tr>
                  <td colSpan={activeTab === 'tutors' ? 5 : 4} className="py-16 text-center text-xs text-slate-400">
                    <div className="flex flex-col items-center justify-center">
                      <CheckCircle2 size={24} className="text-emerald-500 mb-1.5" />
                      <p className="font-bold text-slate-800 dark:text-slate-200">No pending {activeTab} applications</p>
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
              <div>
                <h3 className="font-black text-sm text-slate-900 dark:text-white">
                  Tutor Profile: {selectedTutorDetail.name}
                </h3>
                <p className="text-[11px] text-slate-400">Credentials and instructional background</p>
              </div>
              <button 
                type="button" 
                onClick={() => setSelectedTutorDetail(null)} 
                className="min-h-8 min-w-8 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>

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
    </div>
  );
};

export default AdminApprovals;
