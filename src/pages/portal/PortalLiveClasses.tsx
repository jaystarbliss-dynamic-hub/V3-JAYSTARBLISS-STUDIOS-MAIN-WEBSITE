import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock, ExternalLink, Loader2, Users, Video, Plus } from 'lucide-react';
import { collection, getDocs, limit, query, where, addDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import SEO from '../../components/ui/SEO';
import { StaffClassSchedulesManager } from '../../components/portal/StaffClassSchedulesManager';
import { getEffectiveAuth } from '../../utils/impersonation';
import { useToast } from '../../contexts/ToastContext';

interface LiveLink {
  id: string;
  title: string;
  url: string;
  platform?: string;
  meetingTime?: string;
  studentId?: string;
  tutorId?: string;
  createdAt?: any;
}

interface AssignedStudent {
  id: string;
  fullName?: string;
  username?: string;
  email?: string;
  plan?: string;
  schedule?: string;
}

const PortalLiveClasses: React.FC = () => {
  const { toast } = useToast();
  const [links, setLinks] = useState<LiveLink[]>([]);
  const [students, setStudents] = useState<AssignedStudent[]>([]);
  const [assignedSchools, setAssignedSchools] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  
  // Link broadcast modal
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [targetStudentId, setTargetStudentId] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkPlatform, setLinkPlatform] = useState('Google Meet');
  const [meetingTime, setMeetingTime] = useState('');
  const [submittingLink, setSubmittingLink] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadLiveClasses = async () => {
      setLoading(true);
      setMessage('');
      const effective = getEffectiveAuth();
      const currentUser = auth.currentUser;
      if (!currentUser && !effective.isMasquerading) {
        setMessage('Your staff session is not available. Please sign in again.');
        setLoading(false);
        return;
      }

      const staffUid = effective.effectiveUid || currentUser?.uid;

      try {
        const [linkSnap, studentSnapshots, schoolsSnap] = await Promise.all([
          staffUid ? getDocs(query(collection(db, 'personalLinks'), where('tutorId', '==', staffUid), limit(50))).catch(() => ({ docs: [] } as any)) : { docs: [] } as any,
          Promise.all(
            ['tutorId', 'staffId', 'assignedTutorId', 'assignedStaffId', 'instructorId'].map(async (field) => {
              if (!staffUid) return [];
              const snapshots = await Promise.all(
                ['individualStudents', 'students'].map(async (collectionName) => {
                  try {
                    return await getDocs(query(collection(db, collectionName), where(field, '==', staffUid), limit(50)));
                  } catch {
                    return null;
                  }
                })
              );
              return snapshots;
            })
          ),
          getDocs(collection(db, 'schools')).catch(() => ({ docs: [] } as any))
        ]);

        if (cancelled) return;

        setLinks(
          linkSnap.docs
            .map((linkDoc: any) => ({ id: linkDoc.id, ...linkDoc.data() } as LiveLink))
            .sort((a: any, b: any) => String(b.createdAt?.seconds || 0).localeCompare(String(a.createdAt?.seconds || 0)))
        );

        const studentMap = new Map<string, AssignedStudent>();
        studentSnapshots.flat(2).filter(Boolean).forEach((snap: any) => {
          snap.docs.forEach((studentDoc: any) => {
            const data = studentDoc.data();
            studentMap.set(studentDoc.id, {
              id: studentDoc.id,
              fullName: data.fullName || data.studentName,
              username: data.username,
              email: data.email,
              plan: data.plan || data.track,
              schedule: data.schedule
            });
          });
        });
        setStudents(Array.from(studentMap.values()));

        const allSchools = schoolsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
        const mySchools = allSchools.filter((sch: any) => {
          if (!staffUid) return false;
          if (sch.tutorId === staffUid || sch.assignedTutorId === staffUid || sch.assignedStaffId === staffUid) return true;
          if (Array.isArray(sch.assignedTutors) && sch.assignedTutors.includes(staffUid)) return true;
          if (Array.isArray(sch.tutors) && sch.tutors.some((t: any) => t.id === staffUid || t.email === currentUser?.email)) return true;
          return false;
        });
        setAssignedSchools(mySchools);

      } catch (error) {
        console.error('Live class workspace loading failed:', error);
        if (!cancelled) setMessage('Live class data could not be loaded.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadLiveClasses();
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePostLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetStudentId || !linkUrl) {
      toast.error('Please select a student and provide a valid URL.');
      return;
    }
    setSubmittingLink(true);
    try {
      const user = auth.currentUser;
      const effective = getEffectiveAuth();
      const staffUid = effective.effectiveUid || user?.uid;
      const targetStudent = students.find(s => s.id === targetStudentId);

      const newDoc = {
        title: linkTitle || `${linkPlatform} Class Session`,
        url: linkUrl,
        platform: linkPlatform,
        meetingTime: meetingTime || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        studentId: targetStudentId,
        studentName: targetStudent?.fullName || targetStudent?.username || 'Student',
        tutorId: staffUid,
        tutorName: effective.effectiveName || user?.displayName || 'Faculty Member',
        createdAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'personalLinks'), newDoc);
      setLinks(prev => [{ id: docRef.id, ...newDoc }, ...prev]);
      toast.success('Live class link broadcast to student portal!');
      setShowLinkModal(false);
      setLinkTitle('');
      setLinkUrl('');
      setMeetingTime('');
      setTargetStudentId('');
    } catch (err) {
      console.error('Post link error:', err);
      toast.error('Failed to post live class link.');
    } finally {
      setSubmittingLink(false);
    }
  };

  const studentById = useMemo(() => new Map(students.map((student) => [student.id, student])), [students]);
  const effectiveAuth = getEffectiveAuth();
  const tutorId = effectiveAuth.effectiveUid || auth.currentUser?.uid;
  const tutorName = effectiveAuth.effectiveName || auth.currentUser?.displayName || 'Faculty Member';

  return (
    <div className="dashboard-interface space-y-6 md:space-y-8">
      <SEO 
        title="Teaching Rosters & Class Schedules | Faculty Portal" 
        description="Manage assigned teaching rosters, combined daily class schedules, and live virtual classroom links." 
        noindex={true} 
      />

      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => setShowLinkModal(true)}
          className="px-4 py-2.5 rounded-xl bg-brand-red hover:bg-red-700 text-white text-xs font-bold shadow-xs inline-flex items-center gap-1.5 transition-all cursor-pointer"
        >
          <Plus size={14} />
          <span>Broadcast Live Link</span>
        </button>
      </div>

      {message && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
          {message}
        </div>
      )}

      {/* SECTION 1: Class Schedules Manager (Chronological, Grouped by Day, Range Badges, Status Controls) */}
      <div className="pro-surface rounded-3xl p-6 md:p-8 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <StaffClassSchedulesManager
          tutorId={tutorId}
          tutorName={tutorName}
          assignedSchools={assignedSchools}
          assignedStudents={students}
        />
      </div>

      {/* SECTION 2: Published Live Meeting Links */}
      <section className="pro-surface rounded-3xl p-6 md:p-8 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <Video size={18} className="text-brand-red" />
              <span>Broadcast Live Classroom Links</span>
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Virtual meeting rooms (Google Meet, Zoom, MS Teams) sent directly to student dashboards.
            </p>
          </div>
          <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 self-start sm:self-auto">
            {links.length} Published
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-xs text-slate-500">
            <Loader2 className="mr-2 animate-spin" size={16} /> Loading live sessions…
          </div>
        ) : links.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
            <Video size={32} className="mx-auto text-slate-300 dark:text-slate-700 mb-2" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">No live links broadcast yet</h3>
            <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
              Click &quot;Broadcast Live Link&quot; above to publish a Google Meet, Zoom, or Scratch link to an assigned learner.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {links.map((link) => {
              const student = link.studentId ? studentById.get(link.studentId) : undefined;
              return (
                <article key={link.id} className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-950/60 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <span className="rounded-md bg-brand-red/10 px-2.5 py-1 text-[10px] font-black uppercase text-brand-red">
                        {link.platform || 'Class Session'}
                      </span>
                      {link.meetingTime && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 font-mono">
                          <Clock size={12} aria-hidden="true" />{link.meetingTime}
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white">{link.title || 'Classroom Session'}</h3>
                    <div className="mt-3 space-y-1 text-xs text-slate-500">
                      <div className="flex items-center gap-2">
                        <Users size={13} aria-hidden="true" />
                        <span className="font-bold text-slate-700 dark:text-slate-300">{student?.fullName || student?.username || link.studentId || 'Assigned Scholar'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CalendarDays size={13} aria-hidden="true" />
                        <span>{link.createdAt?.toDate?.().toLocaleDateString('en-NG') || 'Active session'}</span>
                      </div>
                    </div>
                  </div>
                  <a 
                    href={link.url} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-brand-red px-4 text-xs font-bold text-white hover:bg-red-700 transition-colors cursor-pointer"
                  >
                    Open Live Room <ExternalLink size={13} aria-hidden="true" />
                  </a>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Broadcast Live Class Link Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 shadow-2xl">
            <h3 className="text-base font-black text-slate-900 dark:text-white mb-1">
              Broadcast Live Class Link
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Send a direct Google Meet, Zoom, or Scratch link to a student.
            </p>
            <form onSubmit={handlePostLink} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Select Learner</label>
                <select 
                  required 
                  value={targetStudentId} 
                  onChange={e => setTargetStudentId(e.target.value)} 
                  className="w-full min-h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs outline-hidden"
                >
                  <option value="">-- Choose Learner --</option>
                  {students.map(s => (
                    <option key={s.id} value={s.id}>{s.fullName || s.username} ({s.plan || 'Active Track'})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Session Title</label>
                <input 
                  type="text" 
                  required 
                  placeholder="e.g. Practical Robotics Lab" 
                  value={linkTitle} 
                  onChange={e => setLinkTitle(e.target.value)} 
                  className="w-full min-h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Platform</label>
                  <select 
                    value={linkPlatform} 
                    onChange={e => setLinkPlatform(e.target.value)} 
                    className="w-full min-h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs outline-hidden"
                  >
                    <option value="Google Meet">Google Meet</option>
                    <option value="Zoom">Zoom</option>
                    <option value="Microsoft Teams">MS Teams</option>
                    <option value="Scratch Classroom">Scratch Studio</option>
                    <option value="Code.org">Code.org</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Time</label>
                  <input 
                    type="time" 
                    value={meetingTime} 
                    onChange={e => setMeetingTime(e.target.value)} 
                    className="w-full min-h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Room Link URL</label>
                <input 
                  type="url" 
                  required 
                  placeholder="https://meet.google.com/xyz-abcd-efg" 
                  value={linkUrl} 
                  onChange={e => setLinkUrl(e.target.value)} 
                  className="w-full min-h-11 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button 
                  type="button" 
                  onClick={() => setShowLinkModal(false)} 
                  className="min-h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={submittingLink} 
                  className="min-h-11 px-5 rounded-xl bg-brand-red hover:bg-red-700 font-bold text-white flex items-center gap-2 shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                >
                  {submittingLink ? 'Publishing...' : 'Broadcast Room'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PortalLiveClasses;
