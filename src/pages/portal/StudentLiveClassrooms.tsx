import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where, limit } from 'firebase/firestore';
import { ExternalLink, Video, Clock, Calendar, Radio, CheckCircle2, UserCheck, Search, Filter } from 'lucide-react';
import SEO from '../../components/ui/SEO';
import { auth, db } from '../../lib/firebase';
import { isStudentClassMatch } from '../../utils/classMatching';
import { getEffectiveAuth } from '../../utils/impersonation';

interface LiveSession {
  id: string;
  title: string;
  url: string;
  platform?: string;
  description?: string;
  meetingTime?: string;
  date?: string;
  formattedDate?: string;
  startTime?: string;
  endTime?: string;
  tutorName?: string;
  programName?: string;
  classLevel?: string;
  status: 'LIVE_NOW' | 'UPCOMING' | 'COMPLETED';
}

const StudentLiveClassrooms: React.FC = () => {
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<'ALL' | 'LIVE' | 'UPCOMING' | 'COMPLETED'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const uid = auth.currentUser?.uid || '';
        let studentId = sessionStorage.getItem('studentDocId') || '';
        let cachedClass = (sessionStorage.getItem('studentClass') || '').trim().toLowerCase();
        let cachedSchoolId = sessionStorage.getItem('studentSchoolId') || '';
        let cachedSchoolName = sessionStorage.getItem('studentSchoolName') || '';
        let cachedProgram = (sessionStorage.getItem('studentPlan') || sessionStorage.getItem('studentTrack') || '').trim().toLowerCase();

        // If student details aren't in session, lookup student record from Firestore
        if (uid && (!cachedSchoolId || !cachedClass)) {
          try {
            const [indivSnap, studSnap] = await Promise.all([
              getDocs(query(collection(db, 'individualStudents'), where('firebaseUid', '==', uid), limit(1))).catch(() => ({ docs: [] } as any)),
              getDocs(query(collection(db, 'students'), where('firebaseUid', '==', uid), limit(1))).catch(() => ({ docs: [] } as any)),
            ]);
            const sDoc = indivSnap.docs?.[0] || studSnap.docs?.[0];
            if (sDoc) {
              const sData = sDoc.data();
              studentId = studentId || sDoc.id;
              cachedClass = cachedClass || (sData.class || sData.grade || '').trim().toLowerCase();
              cachedSchoolId = cachedSchoolId || sData.schoolId || '';
              cachedSchoolName = cachedSchoolName || sData.schoolName || sData.school || '';
              cachedProgram = cachedProgram || String(sData.plan || sData.programName || sData.track || '').trim().toLowerCase();
            }
          } catch (e) {
            console.warn('Student identity lookup notice in LiveClassrooms:', e);
          }
        }

        // Fetch personal links, school links, and class schedules in parallel
        const [linkSnaps, schSnap, netlifySchedules] = await Promise.all([
          Promise.all([
            ...(studentId ? [getDocs(query(collection(db, 'personalLinks'), where('studentId', '==', studentId))).catch(() => ({ docs: [] } as any))] : []),
            ...(uid ? [getDocs(query(collection(db, 'personalLinks'), where('userId', '==', uid))).catch(() => ({ docs: [] } as any))] : [])
          ]),
          getDocs(collection(db, 'classSchedules')).catch(() => ({ docs: [] } as any)),
          auth.currentUser?.getIdToken().then(token => 
            fetch(`/.netlify/functions/class-schedules?schoolId=${encodeURIComponent(cachedSchoolId)}&studentId=${encodeURIComponent(studentId)}`, {
              headers: { Authorization: `Bearer ${token}` }
            }).then(r => r.ok ? r.json() : { schedules: [] }).catch(() => ({ schedules: [] }))
          ).catch(() => ({ schedules: [] }))
        ]);

        const sessionMap = new Map<string, LiveSession>();
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        // 1. Process personal links
        linkSnaps.forEach(snap => {
          snap.forEach((d: any) => {
            const x = d.data();
            if (!x.url) return;

            let status: LiveSession['status'] = 'UPCOMING';
            if (x.date) {
              if (x.date < todayStr) status = 'COMPLETED';
              else if (x.date > todayStr) status = 'UPCOMING';
              else {
                if (x.startTime && x.endTime) {
                  if (currentTimeStr < x.startTime) status = 'UPCOMING';
                  else if (currentTimeStr >= x.startTime && currentTimeStr <= x.endTime) status = 'LIVE_NOW';
                  else status = 'COMPLETED';
                } else {
                  status = 'UPCOMING';
                }
              }
            }

            sessionMap.set(`link-${d.id}`, {
              id: d.id,
              title: x.title || 'Live Classroom Session',
              url: x.url || '',
              platform: x.platform || 'Google Meet',
              description: x.description,
              meetingTime: x.meetingTime || (x.startTime && x.endTime ? `${x.startTime} - ${x.endTime}` : undefined),
              date: x.date,
              startTime: x.startTime,
              endTime: x.endTime,
              tutorName: x.tutorName,
              status
            });
          });
        });

        // 2. Process class schedules (combining Netlify API results & direct Firestore data)
        const combinedRaw = [
          ...(Array.isArray(netlifySchedules?.schedules) ? netlifySchedules.schedules : []),
          ...schSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }))
        ];

        const seenScheduleIds = new Set<string>();
        const studentSchedules = combinedRaw.filter((r: any) => {
          if (!r || !r.id || seenScheduleIds.has(r.id)) return false;
          if (!r.meetingLink && !r.url) return false;
          seenScheduleIds.add(r.id);

          if (r.studentId && (r.studentId === studentId || r.studentId === uid)) return true;

          const rSchId = (r.schoolId || '').trim();
          const rSchName = (r.schoolName || '').trim().toLowerCase();

          // 1. School check
          if (cachedSchoolId || cachedSchoolName) {
            const isSchoolMatch = (cachedSchoolId && rSchId === cachedSchoolId) ||
              (cachedSchoolName && rSchName && (rSchName === cachedSchoolName.toLowerCase() || rSchName.includes(cachedSchoolName.toLowerCase()) || cachedSchoolName.toLowerCase().includes(rSchName)));
            if (!isSchoolMatch) return false;
          }

          // 2. Class Level strict check
          const isClassMatch = isStudentClassMatch(cachedClass, r.classLevel, r.classLevels);
          if (!isClassMatch) return false;

          // 3. Program check
          if (cachedProgram) {
            const rProgName = String(r.programName || r.title || '').trim().toLowerCase();
            const isProgramMatch = !rProgName || rProgName === cachedProgram || rProgName.includes(cachedProgram) || cachedProgram.includes(rProgName);
            if (!isProgramMatch && r.targetType !== 'ALL') {
              return false;
            }
          }

          return true;
        });

        studentSchedules.forEach((r: any) => {
          const date = r.date || '';
          const startTime = r.startTime || '';
          const endTime = r.endTime || '';
          const explicitStatus = String(r.status || '').toUpperCase();

          let status: LiveSession['status'] = 'UPCOMING';

          if (explicitStatus === 'COMPLETED' || explicitStatus === 'ATTENDED' || explicitStatus === 'CANCELLED') {
            status = 'COMPLETED';
          } else if (date) {
            if (date < todayStr) {
              status = 'COMPLETED';
            } else if (date > todayStr) {
              // Strictly UPCOMING if date is in the future
              status = 'UPCOMING';
            } else {
              // Today: compare start and end times
              if (startTime && endTime) {
                if (currentTimeStr < startTime) {
                  status = 'UPCOMING';
                } else if (currentTimeStr >= startTime && currentTimeStr <= endTime) {
                  status = 'LIVE_NOW';
                } else {
                  status = 'COMPLETED';
                }
              } else if (explicitStatus === 'ONGOING') {
                status = 'LIVE_NOW';
              } else {
                status = 'UPCOMING';
              }
            }
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

          sessionMap.set(`sch-${r.id}`, {
            id: r.id,
            title: r.title || r.programName || 'Classroom Session',
            url: r.meetingLink || r.url || '',
            platform: r.platform || 'Virtual Classroom',
            description: r.description || (r.classLevel ? `Target Class: ${r.classLevel}` : undefined),
            meetingTime: startTime && endTime ? `${startTime} – ${endTime}` : r.meetingTime,
            date,
            formattedDate,
            startTime,
            endTime,
            tutorName: r.tutorName,
            programName: r.programName,
            classLevel: r.classLevel,
            status
          });
        });

        if (!cancelled) {
          setSessions(Array.from(sessionMap.values()));
        }
      } catch (err) {
        console.error('Failed to load student live sessions:', err);
        if (!cancelled) setSessions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredSessions = useMemo(() => {
    return sessions
      .filter(s => {
        if (filterTab === 'LIVE') return s.status === 'LIVE_NOW';
        if (filterTab === 'UPCOMING') return s.status === 'UPCOMING';
        if (filterTab === 'COMPLETED') return s.status === 'COMPLETED';
        return true;
      })
      .filter(s => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
          s.title.toLowerCase().includes(q) ||
          (s.tutorName && s.tutorName.toLowerCase().includes(q)) ||
          (s.formattedDate && s.formattedDate.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        // Live first, then upcoming by date, then completed
        if (a.status === 'LIVE_NOW' && b.status !== 'LIVE_NOW') return -1;
        if (b.status === 'LIVE_NOW' && a.status !== 'LIVE_NOW') return 1;
        if (a.status === 'UPCOMING' && b.status === 'COMPLETED') return -1;
        if (b.status === 'UPCOMING' && a.status === 'COMPLETED') return 1;
        return (a.date || '').localeCompare(b.date || '');
      });
  }, [sessions, filterTab, searchQuery]);

  const liveCount = useMemo(() => sessions.filter(s => s.status === 'LIVE_NOW').length, [sessions]);
  const upcomingCount = useMemo(() => sessions.filter(s => s.status === 'UPCOMING').length, [sessions]);

  return (
    <div className="space-y-6">
      <SEO
        title="Live Classrooms & Sessions | Jaystarbliss Studios"
        description="Join live lessons and sessions assigned to your student account."
        noindex
      />

      {/* Filter & Search Bar */}
      <section className="pro-surface rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {/* Tab Filters */}
          <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFilterTab('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              filterTab === 'ALL'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
            }`}
          >
            All Sessions ({sessions.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('LIVE')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5 ${
              filterTab === 'LIVE'
                ? 'bg-emerald-600 text-white'
                : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100'
            }`}
          >
            <Radio size={12} className={liveCount > 0 ? 'animate-pulse' : ''} /> Live Now ({liveCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('UPCOMING')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5 ${
              filterTab === 'UPCOMING'
                ? 'bg-brand-red text-white'
                : 'bg-red-50 dark:bg-red-950/40 text-brand-red hover:bg-red-100'
            }`}
          >
            <Calendar size={12} /> Upcoming ({upcomingCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('COMPLETED')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
              filterTab === 'COMPLETED'
                ? 'bg-slate-700 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200'
            }`}
          >
            Completed
          </button>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search sessions or tutors..."
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 pl-9 pr-3 py-2 text-xs font-semibold text-slate-800 dark:text-white outline-none focus:border-brand-red"
            />
          </div>
        </div>
      </section>

      {/* Loading state */}
      {loading ? (
        <div className="pro-surface rounded-2xl p-12 text-center text-sm text-slate-500">
          <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-brand-red border-t-transparent" />
          <p className="mt-3">Loading your live sessions and classroom schedule…</p>
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="pro-surface rounded-2xl border-dashed p-12 text-center">
          <Video className="mx-auto text-slate-300 dark:text-slate-700" size={36} />
          <h3 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">
            {filterTab === 'LIVE' ? 'No classes currently live in session' : 'No sessions match your filter'}
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            {filterTab === 'LIVE'
              ? 'Classes appear here when in session during their scheduled day and time window.'
              : 'Your instructors will publish upcoming live class schedules here.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredSessions.map(s => {
            const isLive = s.status === 'LIVE_NOW';
            const isUpcoming = s.status === 'UPCOMING';

            return (
              <article
                key={s.id}
                className={`pro-surface rounded-2xl p-5 border transition flex flex-col justify-between ${
                  isLive
                    ? 'border-emerald-500/60 bg-gradient-to-br from-emerald-950/20 via-slate-900/40 to-slate-900 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {isLive ? (
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1 text-[10px] font-black uppercase text-white shadow-xs">
                          <Radio size={12} className="animate-spin" /> LIVE NOW
                        </span>
                      ) : isUpcoming ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-brand-red/10 px-2.5 py-1 text-[10px] font-black uppercase text-brand-red">
                          <Calendar size={11} /> UPCOMING
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-slate-200 dark:bg-slate-800 px-2.5 py-1 text-[10px] font-black uppercase text-slate-600 dark:text-slate-400">
                          <CheckCircle2 size={11} /> COMPLETED
                        </span>
                      )}

                      <span className="rounded-lg bg-slate-100 dark:bg-slate-800 px-2 py-1 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                        {s.platform || 'Virtual Room'}
                      </span>
                    </div>

                    {s.meetingTime && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded-md">
                        <Clock size={11} />
                        {s.meetingTime}
                      </span>
                    )}
                  </div>

                  <h2 className="mt-3 text-base font-black text-slate-900 dark:text-white">
                    {s.title}
                  </h2>

                  {s.formattedDate && (
                    <p className="mt-1 text-xs font-bold text-brand-red dark:text-red-400 flex items-center gap-1">
                      <Calendar size={12} />
                      {s.formattedDate}
                    </p>
                  )}

                  {s.description && (
                    <p className="mt-1 text-xs text-slate-500 line-clamp-2">
                      {s.description}
                    </p>
                  )}

                  {s.tutorName && (
                    <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1">
                      <UserCheck size={12} className="text-brand-red" />
                      Assigned Faculty: <span className="font-bold text-slate-800 dark:text-slate-200">{s.tutorName}</span>
                    </p>
                  )}
                </div>

                <div className="mt-5 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 font-medium">
                    {isLive ? '🟢 Room is active right now' : isUpcoming ? '⏳ Scheduled session' : 'Completed session'}
                  </span>

                  {s.url ? (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl px-4 text-xs font-bold text-white transition ${
                        isLive
                          ? 'bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-900/30'
                          : 'bg-brand-red hover:bg-red-700'
                      }`}
                    >
                      {isLive ? 'Join Live Room Now' : 'Open Class Room'} <ExternalLink size={13} />
                    </a>
                  ) : (
                    <span className="text-xs text-slate-400">Link pending broadcast</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StudentLiveClassrooms;
