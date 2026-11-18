import React, { useState, useEffect } from 'react';
import { 
  Keyboard, 
  ExternalLink, 
  CheckCircle2, 
  ArrowUpRight,
  BookOpen,
  Copy,
  Check,
  Lock,
  ClipboardList,
  Loader2,
  Calendar
} from 'lucide-react';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';

interface DynamicEdclubAssignment {
  id: string;
  title: string;
  module?: string;
  instructions?: string;
  dueDate?: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SUBMITTED' | 'PUBLISHED';
  targetWpm?: number;
  accuracy?: string;
  wpm?: number | string;
  drillUrl?: string;
  tutorName?: string;
  createdAt?: string;
}

interface TypingMastersAcademyCardProps {
  studentName?: string;
  studentClass?: string;
  schoolId?: string;
  isAllowed?: boolean;
  enrolledProgramName?: string;
  onOpenEdClub?: () => void;
}

export const TypingMastersAcademyCard: React.FC<TypingMastersAcademyCardProps> = ({
  studentName = 'Student',
  studentClass,
  schoolId,
  isAllowed = true,
  enrolledProgramName = 'Digital Literacy Junior',
  onOpenEdClub
}) => {
  const [edclubUrl, setEdclubUrl] = useState('https://jaystarbliss-studios.edclub.com');
  const [bannerUrl, setBannerUrl] = useState('');
  const [cardTitle, setCardTitle] = useState('Keyboarding & Speed Typing Hub');
  const [cardSubtitle, setCardSubtitle] = useState('Touch Typing Foundations • Home Row, Punctuation & Speed Drills');
  const [copied, setCopied] = useState(false);
  const [dynamicAssignments, setDynamicAssignments] = useState<DynamicEdclubAssignment[]>([]);
  const [loadingAssignments, setLoadingAssignments] = useState(true);

  // Fetch EdClub portal configurations
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docKey = schoolId ? `edclub_${schoolId}` : 'edclub';
        const snap = await getDoc(doc(db, 'settings', docKey));
        if (snap.exists()) {
          const data = snap.data();
          if (data.portalUrl) {
            setEdclubUrl(data.portalUrl === 'https://www.edclub.com' ? 'https://jaystarbliss-studios.edclub.com' : data.portalUrl);
          }
          if (data.bannerUrl) setBannerUrl(data.bannerUrl);
          if (data.title) setCardTitle(data.title);
          if (data.subtitle) setCardSubtitle(data.subtitle);
        } else if (schoolId) {
          const globalSnap = await getDoc(doc(db, 'settings', 'edclub'));
          if (globalSnap.exists()) {
            const data = globalSnap.data();
            if (data.portalUrl) {
              setEdclubUrl(data.portalUrl === 'https://www.edclub.com' ? 'https://jaystarbliss-studios.edclub.com' : data.portalUrl);
            }
            if (data.bannerUrl) setBannerUrl(data.bannerUrl);
            if (data.title) setCardTitle(data.title);
            if (data.subtitle) setCardSubtitle(data.subtitle);
          }
        }
      } catch (err) {
        console.warn('EdClub settings fetch failed:', err);
      }
    };
    fetchSettings();
  }, [schoolId]);

  // Dynamically load real EdClub assignments from Firestore
  useEffect(() => {
    let active = true;

    const loadEdclubAssignments = async () => {
      setLoadingAssignments(true);
      try {
        const currentUid = auth.currentUser?.uid || '';
        const studentDocId = sessionStorage.getItem('studentDocId') || '';
        const cachedSchoolId = schoolId || sessionStorage.getItem('studentSchoolId') || '';
        const cachedClass = (studentClass || sessionStorage.getItem('studentClass') || '').trim().toLowerCase();

        const assignmentsList: DynamicEdclubAssignment[] = [];
        const seenIds = new Set<string>();

        // 1. Query Firestore academicAssignments & assignments
        const fetchQueries = [
          getDocs(query(collection(db, 'assignments'), where('type', '==', 'edclub'))).catch(() => ({ docs: [] } as any)),
          getDocs(query(collection(db, 'academicAssignments'), where('type', '==', 'edclub'))).catch(() => ({ docs: [] } as any)),
          getDocs(query(collection(db, 'assignments'), where('category', '==', 'edclub'))).catch(() => ({ docs: [] } as any)),
          getDocs(query(collection(db, 'schoolResources'), where('docType', '==', 'Practical Worksheet'))).catch(() => ({ docs: [] } as any))
        ];

        if (studentDocId) {
          fetchQueries.push(
            getDocs(query(collection(db, 'assignments'), where('studentId', '==', studentDocId))).catch(() => ({ docs: [] } as any))
          );
        }

        const results = await Promise.all(fetchQueries);

        results.forEach((snap: any) => {
          if (!snap?.docs) return;
          snap.docs.forEach((d: any) => {
            if (seenIds.has(d.id)) return;
            const data = d.data();
            
            // Check if this assignment belongs to EdClub or typing
            const isEdclub = data.type === 'edclub' || 
              data.category === 'edclub' || 
              data.isEdclub === true ||
              String(data.title || '').toLowerCase().includes('typing') ||
              String(data.title || '').toLowerCase().includes('edclub') ||
              String(data.subject || '').toLowerCase().includes('typing');

            if (!isEdclub) return;

            // Check if matches student, school, or class
            let matches = false;
            if (data.studentId && (data.studentId === studentDocId || data.studentId === currentUid)) {
              matches = true;
            } else if (data.schoolId && cachedSchoolId && data.schoolId === cachedSchoolId) {
              if (cachedClass && Array.isArray(data.assignedClasses) && data.assignedClasses.length > 0) {
                matches = data.assignedClasses.some((c: string) => {
                  const lc = String(c).toLowerCase().trim();
                  return lc === 'all classes' || lc === 'all' || lc === cachedClass || cachedClass.includes(lc) || lc.includes(cachedClass);
                });
              } else {
                matches = true;
              }
            } else if (!data.studentId && !data.schoolId) {
              // General EdClub assignment
              matches = true;
            }

            if (matches) {
              seenIds.add(d.id);
              assignmentsList.push({
                id: d.id,
                title: data.title || 'Speed Typing Practical Drill',
                module: data.module || data.lessonNumber || (data.targetWpm ? `Target: ${data.targetWpm} WPM` : 'EdClub Module'),
                instructions: data.instructions || data.description || 'Complete this typing drill on your EdClub account.',
                dueDate: data.dueDate ? (new Date(data.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })) : undefined,
                status: (data.status as any) || 'PUBLISHED',
                targetWpm: data.targetWpm,
                accuracy: data.accuracy || (data.targetAccuracy ? `${data.targetAccuracy}%` : undefined),
                wpm: data.wpm,
                drillUrl: data.drillUrl || data.url || data.resourceUrl || edclubUrl,
                tutorName: data.tutorName || data.assignedBy,
                createdAt: data.createdAt
              });
            }
          });
        });

        if (active) {
          setDynamicAssignments(assignmentsList);
        }
      } catch (err) {
        console.warn('Failed to load dynamic EdClub assignments:', err);
      } finally {
        if (active) setLoadingAssignments(false);
      }
    };

    void loadEdclubAssignments();
    return () => { active = false; };
  }, [studentClass, schoolId]);

  const handleLaunch = () => {
    if (onOpenEdClub) {
      onOpenEdClub();
    } else {
      window.open(edclubUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(edclubUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.warn('Copy failed', e);
    }
  };

  // LOCKED STATE (WHEN NOT IN ENROLLED EDCLUB PROGRAM TRACK)
  if (!isAllowed) {
    return (
      <section className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-slate-900 dark:bg-slate-950 text-slate-400 border border-slate-800 shadow-sm p-4 sm:p-6 space-y-3">
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 flex items-center justify-center shrink-0">
              <Lock size={18} className="text-[#F87171]" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-black uppercase tracking-wider text-[#F87171] inline-flex items-center gap-1">
                <Lock size={10} /> Locked Feature
              </span>
              <h3 className="text-sm sm:text-base font-bold text-slate-200 mt-0.5 truncate">
                {cardTitle}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5 truncate">
                Enrolled Track: <strong className="text-slate-300 font-semibold">{enrolledProgramName}</strong>
              </p>
            </div>
          </div>

          <div className="shrink-0">
            <button
              type="button"
              disabled
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 text-slate-400 text-xs font-bold cursor-not-allowed border border-slate-700/60"
            >
              <Lock size={12} />
              <span>EdClub Not Included</span>
            </button>
          </div>
        </div>

        <div className="relative z-10 p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 text-[11px] text-slate-400 flex items-start gap-2">
          <Lock size={13} className="text-[#F87171] shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            This student account is currently enrolled in <strong>{enrolledProgramName}</strong>. EdClub typing lessons are enabled for programs configured with EdClub access. Contact your school administrator or Jaystarbliss tutor for details.
          </p>
        </div>
      </section>
    );
  }

  // ACTIVE UNLOCKED BANNER
  return (
    <section className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-[#0F172A] text-white border border-slate-800 shadow-sm p-4 sm:p-6 lg:p-7 space-y-5">
      {/* Background Banner Image or Institutional Navy */}
      {bannerUrl ? (
        <>
          <img 
            src={bannerUrl} 
            alt="EdClub Banner" 
            className="absolute inset-0 w-full h-full object-cover object-center opacity-40 pointer-events-none"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0F172A] via-[#0F172A]/90 to-[#1E293B]/80 pointer-events-none" />
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#0F172A] pointer-events-none" />
      )}

      {/* Header Banner - Responsive on Mobile and Desktop */}
      <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#1E293B] border border-slate-700 flex items-center justify-center text-white shadow-sm shrink-0">
            <Keyboard size={24} className="text-white" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base sm:text-xl font-black text-white tracking-tight leading-snug">
              {cardTitle}
            </h3>
            <p className="text-xs text-slate-300 font-semibold mt-0.5 leading-normal">
              {cardSubtitle}
            </p>
            <p className="text-[11px] text-slate-300 mt-1 font-bold flex flex-wrap items-center gap-2">
              <span className="truncate max-w-[220px]">Roster: <strong className="text-white">{studentName}</strong></span>
              {studentClass && <span>· Class: <strong className="text-white">{studentClass}</strong></span>}
              {enrolledProgramName && <span className="text-[#F87171] font-bold">· {enrolledProgramName}</span>}
            </p>
          </div>
        </div>

        {/* Action Controls - Mobile Responsive */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1 md:pt-0">
          <div className="flex items-center justify-between gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white font-mono text-[11px] font-bold">
            <span className="truncate max-w-[180px] sm:max-w-[210px] text-slate-200">{edclubUrl.replace('https://', '')}</span>
            <button
              type="button"
              onClick={handleCopyLink}
              title="Copy EdClub Portal Link"
              aria-label="Copy EdClub Portal Link"
              className="p-1 hover:text-white transition-colors cursor-pointer text-slate-300"
            >
              {copied ? <Check size={13} className="text-white" /> : <Copy size={13} />}
            </button>
          </div>

          <button
            type="button"
            onClick={handleLaunch}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#B91C1C] hover:bg-red-700 active:bg-red-800 text-white text-xs sm:text-sm font-black transition-all shadow-sm cursor-pointer shrink-0"
          >
            <ExternalLink size={14} className="text-white" />
            <span className="text-white">Launch EdClub</span>
            <ArrowUpRight size={13} className="opacity-90 text-white" />
          </button>
        </div>
      </div>

      {/* Dynamic EdClub Assignments List from Firestore */}
      <div className="relative z-10 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-white">
            <ClipboardList size={14} className="text-[#B91C1C]" />
            <span className="text-white font-bold tabular-nums">EdClub Assigned Tasks ({dynamicAssignments.length})</span>
          </div>
          <span className="text-[11px] font-bold text-slate-300">
            Assigned by Tutor &amp; Academy
          </span>
        </div>

        {loadingAssignments ? (
          <div className="p-6 text-center text-xs text-white rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-center gap-2">
            <Loader2 size={16} className="animate-spin text-[#B91C1C]" />
            <span className="text-white font-medium">Checking active EdClub assignments...</span>
          </div>
        ) : dynamicAssignments.length === 0 ? (
          <div className="p-5 text-center rounded-2xl bg-slate-900/90 border border-dashed border-slate-700 space-y-2">
            <Keyboard size={24} className="mx-auto text-slate-400" />
            <p className="text-xs font-black text-white">No pending EdClub typing tasks</p>
            <p className="text-[11px] text-slate-300 max-w-md mx-auto leading-relaxed">
              When your assigned tutor or administrator issues an EdClub typing drill, it will appear here in real time. You can launch EdClub anytime to practice your speed drills!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {dynamicAssignments.map((item) => (
              <div 
                key={item.id}
                className="p-3.5 rounded-2xl bg-slate-900/95 border border-slate-800 hover:border-slate-600 transition-all flex flex-col justify-between gap-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                      item.status === 'COMPLETED' 
                        ? 'bg-[#B91C1C]/20 text-[#F87171] border border-[#B91C1C]/30' 
                        : 'bg-[#1E293B] text-slate-200 border border-slate-700'
                    }`}>
                      {item.status === 'COMPLETED' ? <CheckCircle2 size={16} /> : <BookOpen size={16} />}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs sm:text-sm font-bold text-white truncate">{item.title}</h4>
                      {item.instructions && (
                        <p className="text-[11px] text-slate-300 line-clamp-2 mt-0.5">{item.instructions}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-2 mt-1.5 text-[10px] text-slate-300 font-semibold">
                        {item.module && <span className="text-slate-200">{item.module}</span>}
                        {item.dueDate && (
                          <span className="flex items-center gap-1 text-slate-300 font-medium">
                            <Calendar size={10} className="text-[#F87171]" /> Due: {item.dueDate}
                          </span>
                        )}
                        {item.tutorName && <span className="text-slate-400">· By: {item.tutorName}</span>}
                      </div>
                    </div>
                  </div>

                  {item.targetWpm && (
                    <div className="text-right shrink-0">
                      <div className="text-xs font-black font-mono text-[#F87171] tabular-nums">{item.targetWpm} WPM</div>
                      <div className="text-[9px] uppercase font-bold text-slate-400">Target</div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end pt-1 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      if (item.drillUrl && item.drillUrl !== edclubUrl) {
                        window.open(item.drillUrl, '_blank', 'noopener,noreferrer');
                      } else {
                        handleLaunch();
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl bg-[#B91C1C] hover:bg-red-700 text-white text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer shadow-xs"
                  >
                    <span>Open Drill</span>
                    <ArrowUpRight size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default TypingMastersAcademyCard;
