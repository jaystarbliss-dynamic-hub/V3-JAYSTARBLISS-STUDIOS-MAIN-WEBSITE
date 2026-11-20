import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  MapPin,
  Video,
  CheckCircle2,
  Award,
  BookOpen,
  Calendar,
  ShieldCheck,
  UserCheck,
  X,
  Send,
  GraduationCap,
  Users,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { collection, getDocs, addDoc } from 'firebase/firestore';
import { db, getAllClientDatabases } from '../lib/firebase';
import PageHeader from '../components/ui/PageHeader';
import SEO from '../components/ui/SEO';
import {
  reconcilePublicTutors,
  type PublicTutorCardRecord,
} from '../lib/tutorDirectory';

export default function FindTutor() {
  const [tutors, setTutors] = useState<PublicTutorCardRecord[]>([]);
  const [failedPhotoIds, setFailedPhotoIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState('All Specializations');
  const [selectedMode, setSelectedMode] = useState('All');

  // Booking Modal State
  const [bookingTutor, setBookingTutor] = useState<PublicTutorCardRecord | null>(null);
  const [studentName, setStudentName] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [preferredMode, setPreferredMode] = useState('Online 1-on-1');
  const [learningGoal, setLearningGoal] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const fetchPublishedTutors = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setFailedPhotoIds(new Set());
    try {
      const dbs = getAllClientDatabases();
      const rawTutorsById = new Map<string, { id: string } & Record<string, any>>();
      const approvedSubjectsByTutorId = new Map<string, Set<string>>();
      let succeededCount = 0;

      await Promise.all(
        dbs.map(async (clientDb) => {
          try {
            const [tutorsSnap, tutorSubjectsSnap] = await Promise.all([
              getDocs(collection(clientDb, 'tutors')),
              getDocs(collection(clientDb, 'tutorSubjects')).catch(() => null),
            ]);
            succeededCount += 1;

            if (tutorSubjectsSnap) {
              tutorSubjectsSnap.docs.forEach((docSnap) => {
                const data = docSnap.data();
                const tutorId = String(data.tutorId || '').trim();
                const subjectName = String(data.subjectName || data.subject || '').trim();
                if (tutorId && subjectName) {
                  if (!approvedSubjectsByTutorId.has(tutorId)) {
                    approvedSubjectsByTutorId.set(tutorId, new Set());
                  }
                  approvedSubjectsByTutorId.get(tutorId)!.add(subjectName);
                }
              });
            }

            tutorsSnap.docs.forEach((docSnap) => {
              if (!rawTutorsById.has(docSnap.id)) {
                rawTutorsById.set(docSnap.id, {
                  id: docSnap.id,
                  ...(docSnap.data() as Record<string, any>),
                });
              }
            });
          } catch {
            // Secondary database errors tolerated when primary succeeds
          }
        })
      );

      if (succeededCount === 0) {
        throw new Error('Could not connect to the tutor directory right now.');
      }

      // Enrich canonical `tutors` records with approved `tutorSubjects` without importing other collections
      const enrichedRaw = Array.from(rawTutorsById.values()).map((raw) => {
        const uid = String(raw.uid || raw.id || '').trim();
        const extraSubjects = [
          ...(approvedSubjectsByTutorId.get(uid) ? Array.from(approvedSubjectsByTutorId.get(uid)!) : []),
          ...(approvedSubjectsByTutorId.get(raw.id)
            ? Array.from(approvedSubjectsByTutorId.get(raw.id)!)
            : []),
        ];
        if (extraSubjects.length === 0) return raw;
        const baseSubjects = Array.isArray(raw.subjects)
          ? raw.subjects
          : typeof raw.subjects === 'string'
          ? raw.subjects.split(',').map((s) => s.trim())
          : [];
        return {
          ...raw,
          subjects: [...baseSubjects, ...extraSubjects],
        };
      });

      setTutors(reconcilePublicTutors(enrichedRaw));
    } catch (err: any) {
      console.error('Error fetching published tutors:', err);
      setTutors([]);
      setLoadError(
        err?.message || 'Unable to load published tutors at the moment. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPublishedTutors();
  }, [fetchPublishedTutors, retryToken]);

  // Exclude any tutor whose image fails to load at runtime (no initials fallback)
  const visibleTutors = useMemo(
    () => tutors.filter((t) => !failedPhotoIds.has(t.id)),
    [tutors, failedPhotoIds]
  );

  const subjectFilterOptions = useMemo(() => {
    const specSet = new Set<string>();
    visibleTutors.forEach((t) => {
      t.subjects.forEach((spec) => {
        if (spec) specSet.add(spec);
      });
    });
    return ['All Specializations', ...Array.from(specSet).slice(0, 12)];
  }, [visibleTutors]);

  const filteredTutors = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return visibleTutors.filter((tutor) => {
      const matchesSearch =
        !q ||
        tutor.name.toLowerCase().includes(q) ||
        tutor.headline.toLowerCase().includes(q) ||
        tutor.bio.toLowerCase().includes(q) ||
        tutor.subjects.some((s) => s.toLowerCase().includes(q));

      const matchesSubject =
        selectedSubjectFilter === 'All Specializations' ||
        tutor.subjects.some(
          (s) => s.toLowerCase() === selectedSubjectFilter.toLowerCase()
        );

      const matchesMode =
        selectedMode === 'All' ||
        tutor.deliveryMode.toLowerCase().includes(selectedMode.toLowerCase());

      return matchesSearch && matchesSubject && matchesMode;
    });
  }, [visibleTutors, searchQuery, selectedSubjectFilter, selectedMode]);

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingTutor || !studentName.trim() || !parentEmail.trim()) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const summaryMessage = [
        `Mentor Booking Request for ${bookingTutor.name} (${bookingTutor.headline})`,
        `Preferred Mode: ${preferredMode}`,
        `Learning Goals: ${learningGoal.trim() || 'General 1-on-1 mentorship'}`,
      ].join(' | ');

      await addDoc(collection(db, 'inquiries'), {
        name: studentName.trim(),
        email: parentEmail.trim(),
        phone: parentPhone.trim() || 'Not provided',
        type: 'tutor_booking_request',
        programsOfInterest: bookingTutor.subjects.slice(0, 5),
        message: summaryMessage,
        source: 'find_tutor_directory',
        createdAt: new Date().toISOString(),
      });
      setSubmitted(true);
    } catch (err) {
      console.error('Error submitting booking:', err);
      setSubmitError('Unable to send request right now. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 pb-20">
      <SEO
        title="Find a Verified Mentor | Published Tutors | Jaystarbliss Studios"
        description="Connect directly with verified, published Jaystarbliss Studios mentors across coding, digital literacy, creative design, music, and core academics."
      />

      <PageHeader
        eyebrow="VERIFIED & PUBLISHED FACULTY"
        title="Find a Dedicated Mentor"
        description="Connect directly with approved Jaystarbliss Studios tutors. Browse verified specializations and book a tailored 1-on-1 or small-group schedule."
        fallbackImage="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1600&q=80"
      >
        <div className="flex flex-wrap items-center gap-5 text-xs font-extrabold uppercase tracking-[0.16em] text-slate-300">
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" /> Admin-Verified Mentors
          </span>
          <span>·</span>
          <span className="inline-flex items-center gap-2">
            <Video className="w-4 h-4 text-sky-400" /> Online &amp; Hybrid Sessions
          </span>
          <span>·</span>
          <span className="inline-flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-400" /> 5-Stage Curriculum Certified
          </span>
        </div>
      </PageHeader>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 relative z-20">
        {/* Search & Filter Control Panel */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 shadow-lg border border-slate-200/90 dark:border-slate-800 mb-7">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
            <div className="lg:col-span-6 relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search verified tutors by name, subject, or bio..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-red text-slate-900 dark:text-white font-medium text-xs sm:text-sm"
              />
            </div>

            <div className="lg:col-span-3">
              <select
                value={selectedMode}
                onChange={(e) => setSelectedMode(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-bold text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-red"
              >
                <option value="All">All Delivery Modes</option>
                <option value="Online">Online 1-on-1</option>
                <option value="In-Person">In-Person / Hybrid</option>
              </select>
            </div>

            <div className="lg:col-span-3 flex items-center justify-end">
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 tabular-nums">
                {loading
                  ? 'Loading Tutors...'
                  : `${filteredTutors.length} Published ${
                      filteredTutors.length === 1 ? 'Mentor' : 'Mentors'
                    }`}
              </div>
            </div>
          </div>

          {subjectFilterOptions.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 mt-3.5 pt-3.5 border-t border-slate-100 dark:border-slate-800 no-scrollbar">
              {subjectFilterOptions.map((subject) => (
                <button
                  key={subject}
                  type="button"
                  onClick={() => setSelectedSubjectFilter(subject)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors shrink-0 cursor-pointer border ${
                    selectedSubjectFilter === subject
                      ? 'bg-[#B91C1C] text-white border-[#B91C1C]'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                  }`}
                >
                  {subject}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Published Tutors Grid (Compact Cards — ~40-50% smaller, Verified Photos Only) */}
        {loading ? (
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 sm:gap-4">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 animate-pulse space-y-3"
              >
                <div className="h-32 rounded-xl bg-slate-200 dark:bg-slate-800" />
                <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-2/3" />
                <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-full" />
                <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded-lg w-full" />
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 text-center border border-red-200 dark:border-red-900/50 max-w-xl mx-auto space-y-3">
            <div className="w-11 h-11 rounded-xl bg-red-50 dark:bg-red-950/50 text-[#B91C1C] flex items-center justify-center mx-auto">
              <AlertCircle className="w-5 h-5" />
            </div>
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
              Unable to Load Tutor Directory
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">{loadError}</p>
            <button
              type="button"
              onClick={() => setRetryToken((n) => n + 1)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#B91C1C] hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          </div>
        ) : filteredTutors.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-10 text-center border border-slate-200 dark:border-slate-800 max-w-xl mx-auto">
            <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center mx-auto mb-3">
              <Users className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-extrabold text-slate-900 dark:text-white mb-1.5 font-display">
              {visibleTutors.length === 0
                ? 'No Published Tutors Available Yet'
                : 'No Matching Tutors Found'}
            </h3>
            <p className="text-slate-600 dark:text-slate-400 text-xs sm:text-sm mb-5 leading-relaxed">
              {visibleTutors.length === 0
                ? 'Only approved tutors with verified profile photographs and published directory profiles appear here.'
                : 'Try clearing your search query or selecting a different specialization above.'}
            </p>
            {visibleTutors.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedSubjectFilter('All Specializations');
                  setSelectedMode('All');
                }}
                className="bg-[#B91C1C] text-white font-bold px-5 py-2.5 rounded-xl hover:bg-red-700 transition-colors text-xs uppercase tracking-wider cursor-pointer"
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5 sm:gap-4">
            {filteredTutors.map((tutor) => (
              <motion.div
                key={tutor.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs hover:shadow-md transition-all overflow-hidden flex flex-col justify-between"
              >
                <div>
                  {/* Verified Portrait — No Initials Fallback */}
                  <div className="relative h-36 sm:h-40 w-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <img
                      src={tutor.photoURL}
                      alt={tutor.name}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={() => {
                        setFailedPhotoIds((prev) => {
                          const next = new Set(prev);
                          next.add(tutor.id);
                          return next;
                        });
                      }}
                      className="w-full h-full object-cover object-top"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/65 via-transparent to-transparent" />
                    <span className="absolute bottom-2 left-2.5 inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-[0.14em] text-emerald-300">
                      <CheckCircle2 className="w-3 h-3 shrink-0" /> Verified Mentor
                    </span>
                  </div>

                  <div className="p-3.5 space-y-2">
                    <div>
                      <h3 className="text-sm font-extrabold text-slate-900 dark:text-white font-display leading-snug truncate">
                        {tutor.name}
                      </h3>
                      <p className="text-[11px] font-bold text-[#B91C1C] dark:text-red-400 truncate">
                        {tutor.headline}
                      </p>
                    </div>

                    {tutor.bio && (
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-2">
                        {tutor.bio}
                      </p>
                    )}

                    {tutor.subjects.length > 0 && (
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                        <p className="text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-400 mb-0.5 flex items-center gap-1">
                          <BookOpen className="w-3 h-3 text-[#B91C1C]" /> Specializations
                        </p>
                        <p className="text-[11px] font-semibold text-slate-800 dark:text-slate-200 line-clamp-2">
                          {tutor.subjects.slice(0, 4).join(' · ')}
                        </p>
                      </div>
                    )}

                    <div className="space-y-1 text-[11px] text-slate-500 dark:text-slate-400 pt-1">
                      {tutor.experienceYears && (
                        <div className="flex items-center gap-1.5 truncate">
                          <GraduationCap className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{tutor.experienceYears}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 truncate">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">
                          {tutor.location ? `${tutor.location} · ${tutor.deliveryMode}` : tutor.deliveryMode}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setBookingTutor(tutor);
                      setSubmitted(false);
                      setSubmitError('');
                    }}
                    className="w-full justify-center bg-slate-900 hover:bg-[#B91C1C] dark:bg-[#B91C1C] dark:hover:bg-red-700 text-white font-bold px-3 py-2 rounded-lg text-[11px] transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Request Mentor</span>
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Booking Modal */}
      <AnimatePresence>
        {bookingTutor && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 relative my-8"
            >
              <button
                type="button"
                onClick={() => setBookingTutor(null)}
                className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 flex items-center justify-center text-slate-600 dark:text-slate-300 absolute top-4 right-4 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              {submitted ? (
                <div className="text-center py-6">
                  <div className="w-14 h-14 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                    <UserCheck className="w-7 h-7" />
                  </div>
                  <h3 className="text-xl font-extrabold text-slate-900 dark:text-white font-display mb-2">
                    Mentor Request Received
                  </h3>
                  <p className="text-slate-600 dark:text-slate-400 text-xs sm:text-sm mb-6">
                    We have logged your request to study with <strong>{bookingTutor.name}</strong>.
                    Our academic coordinator will confirm your schedule within 24 hours.
                  </p>
                  <button
                    type="button"
                    onClick={() => setBookingTutor(null)}
                    className="bg-slate-900 text-white font-bold px-7 py-2.5 rounded-xl hover:bg-slate-800 cursor-pointer text-xs"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3.5 mb-5 pb-4 border-b border-slate-100 dark:border-slate-800 pr-10">
                    <img
                      src={bookingTutor.photoURL}
                      alt={bookingTutor.name}
                      referrerPolicy="no-referrer"
                      className="w-12 h-12 rounded-xl object-cover object-top border border-slate-200 dark:border-slate-700 shrink-0"
                    />
                    <div className="min-w-0">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#B91C1C]">
                        Request 1-on-1 or Pod Mentorship
                      </span>
                      <h3 className="text-lg font-extrabold text-slate-900 dark:text-white font-display truncate">
                        {bookingTutor.name}
                      </h3>
                      <p className="text-xs text-slate-500 truncate">{bookingTutor.headline}</p>
                    </div>
                  </div>

                  {submitError && (
                    <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-xl p-3 mb-4">
                      {submitError}
                    </p>
                  )}

                  <form onSubmit={handleBookingSubmit} className="space-y-3.5">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Parent / Student Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={studentName}
                        onChange={(e) => setStudentName(e.target.value)}
                        placeholder="Enter full name"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-red text-sm"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Email Address *
                        </label>
                        <input
                          type="email"
                          required
                          value={parentEmail}
                          onChange={(e) => setParentEmail(e.target.value)}
                          placeholder="you@example.com"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-red text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Phone / WhatsApp *
                        </label>
                        <input
                          type="tel"
                          required
                          value={parentPhone}
                          onChange={(e) => setParentPhone(e.target.value)}
                          placeholder="+234..."
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-red text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Preferred Learning Format
                      </label>
                      <select
                        value={preferredMode}
                        onChange={(e) => setPreferredMode(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-red text-sm font-medium"
                      >
                        <option value="Online 1-on-1">Online 1-on-1</option>
                        <option value="In-Person / Hybrid">In-Person / Hybrid</option>
                        <option value="Small Group Pod">Small Group Pod</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Subjects &amp; Learning Goals
                      </label>
                      <textarea
                        rows={3}
                        value={learningGoal}
                        onChange={(e) => setLearningGoal(e.target.value)}
                        placeholder="Tell us the learner's age, subjects of interest, and target goals..."
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-red text-sm"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full bg-[#B91C1C] hover:bg-red-700 text-white font-bold py-3 px-6 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer text-xs sm:text-sm"
                    >
                      <Send className="w-4 h-4" />
                      {submitting
                        ? 'Submitting Request...'
                        : `Confirm Request with ${bookingTutor.name}`}
                    </button>
                  </form>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
