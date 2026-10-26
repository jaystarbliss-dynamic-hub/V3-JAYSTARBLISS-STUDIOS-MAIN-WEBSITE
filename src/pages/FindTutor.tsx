import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Search,
  MapPin,
  Video,
  CheckCircle2,
  Award,
  BookOpen,
  Calendar,
  Clock,
  ShieldCheck,
  UserCheck,
  X,
  Send,
  GraduationCap,
  Users,
} from 'lucide-react';
import { collection, getDocs, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import PageHeader from '../components/ui/PageHeader';
import SEO from '../components/ui/SEO';

export interface PortalTutorProfile {
  id: string;
  uid: string;
  email: string;
  name: string;
  title: string;
  photoURL: string;
  specializations: string[];
  ageGroups: string[];
  teachingModes: string[];
  experience: string;
  bio: string;
  availability: string;
  qualification: string;
}

const TUTOR_ROLE_SET = new Set([
  'staff',
  'tutor',
  'instructor',
  'faculty',
  'teacher',
]);

const INACTIVE_STATUS_SET = new Set([
  'disabled',
  'suspended',
  'banned',
  'rejected',
  'deleted',
]);

function normalizeStringArray(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }
  if (typeof val === 'string') {
    return val
      .split(/[,;|]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function extractPhotoUrl(record: Record<string, any>): string {
  const candidates = [
    record.photoURL,
    record.avatarUrl,
    record.photo,
    record.picture,
    record.image,
    record.profilePicture,
    record.googlePhotoURL,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return '';
}

function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'JB';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function TutorAvatar({
  photoURL,
  name,
  className = 'w-16 h-16 rounded-2xl',
}: {
  photoURL: string;
  name: string;
  className?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);

  if (photoURL && !imgFailed) {
    return (
      <img
        src={photoURL}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className={`${className} object-cover border border-slate-200 bg-slate-100 shrink-0`}
      />
    );
  }

  return (
    <div
      className={`${className} bg-slate-900 text-white border border-slate-800 flex items-center justify-center font-extrabold font-display text-lg shrink-0 select-none`}
      aria-label={name}
    >
      {getInitials(name)}
    </div>
  );
}

export default function FindTutor() {
  const [tutors, setTutors] = useState<PortalTutorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState('All Specializations');
  const [selectedMode, setSelectedMode] = useState('All');

  // Booking Modal State
  const [bookingTutor, setBookingTutor] = useState<PortalTutorProfile | null>(null);
  const [studentName, setStudentName] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [preferredMode, setPreferredMode] = useState('Online 1-on-1');
  const [learningGoal, setLearningGoal] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    let isMounted = true;

    const fetchRegisteredPortalTutors = async () => {
      setLoading(true);
      try {
        const [usersSnap, tutorsSnap, staffSnap, tutorSubjectsSnap] = await Promise.all([
          getDocs(collection(db, 'users')).catch(() => null),
          getDocs(collection(db, 'tutors')).catch(() => null),
          getDocs(collection(db, 'staff')).catch(() => null),
          getDocs(collection(db, 'tutorSubjects')).catch(() => null),
        ]);

        // Map approved subjects by tutorId
        const approvedSubjectsByTutorId = new Map<string, Set<string>>();
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

        // Accumulate merged records keyed by uid or lowercase email
        const mergedByKey = new Map<string, Record<string, any>>();
        const emailToKey = new Map<string, string>();

        const upsertRecord = (docId: string, raw: Record<string, any>, source: 'users' | 'tutors' | 'staff') => {
          const status = String(raw.accountStatus || raw.status || '').trim().toLowerCase();
          if (INACTIVE_STATUS_SET.has(status)) return;

          if (source === 'users') {
            const role = String(raw.role || raw.portalRole || raw.userType || '').trim().toLowerCase();
            if (!TUTOR_ROLE_SET.has(role)) return;
          }

          const uid = String(raw.uid || raw.userId || docId || '').trim();
          const email = String(raw.email || '').trim().toLowerCase();
          const existingKey = (email && emailToKey.get(email)) || (mergedByKey.has(uid) ? uid : '');
          const key = existingKey || uid || email || docId;

          if (email) {
            emailToKey.set(email, key);
          }

          const prev = mergedByKey.get(key) || { _id: docId, _uid: uid, _email: email, _sources: [] };
          mergedByKey.set(key, {
            ...prev,
            ...raw,
            // Preserve non-empty photoURL and bio across collections
            photoURL: extractPhotoUrl(raw) || extractPhotoUrl(prev),
            name:
              raw.name ||
              raw.fullName ||
              raw.displayName ||
              prev.name ||
              prev.fullName ||
              prev.displayName ||
              '',
            bio:
              raw.bio ||
              raw.introduction ||
              raw.about ||
              raw.summary ||
              prev.bio ||
              prev.introduction ||
              prev.about ||
              '',
            qualification: raw.qualification || raw.degree || prev.qualification || '',
            specializations: [
              ...normalizeStringArray(prev.specializations),
              ...normalizeStringArray(prev.subjects),
              ...normalizeStringArray(prev.specialization),
              ...normalizeStringArray(prev.courses),
              ...normalizeStringArray(raw.specializations),
              ...normalizeStringArray(raw.subjects),
              ...normalizeStringArray(raw.specialization),
              ...normalizeStringArray(raw.courses),
            ],
            _id: prev._id || docId,
            _uid: uid || prev._uid || docId,
            _email: email || prev._email,
          });
        };

        if (usersSnap) {
          usersSnap.docs.forEach((d) => upsertRecord(d.id, d.data(), 'users'));
        }
        if (tutorsSnap) {
          tutorsSnap.docs.forEach((d) => upsertRecord(d.id, d.data(), 'tutors'));
        }
        if (staffSnap) {
          staffSnap.docs.forEach((d) => upsertRecord(d.id, d.data(), 'staff'));
        }

        const results: PortalTutorProfile[] = [];

        mergedByKey.forEach((rec, key) => {
          const displayName = String(
            rec.name || rec.fullName || rec.displayName || ''
          ).trim();
          // Skip nameless/incomplete ghost records
          if (!displayName) return;

          const uid = String(rec._uid || rec._id || key);
          const approvedSubjects = approvedSubjectsByTutorId.get(uid)
            ? Array.from(approvedSubjectsByTutorId.get(uid)!)
            : [];
          const approvedByDocId = approvedSubjectsByTutorId.get(String(rec._id))
            ? Array.from(approvedSubjectsByTutorId.get(String(rec._id))!)
            : [];

          const allSpecs = Array.from(
            new Set([
              ...normalizeStringArray(rec.specializations),
              ...approvedSubjects,
              ...approvedByDocId,
            ])
          );

          const rawModes = [
            ...normalizeStringArray(rec.teachingModes),
            ...normalizeStringArray(rec.deliveryMode),
            ...normalizeStringArray(rec.modes),
          ];
          const teachingModes =
            rawModes.length > 0
              ? Array.from(new Set(rawModes))
              : rec.location
              ? ['Online 1-on-1', `In-Person (${rec.location})`]
              : ['Online 1-on-1', 'Small Group Pod'];

          const rawAges = [
            ...normalizeStringArray(rec.ageGroups),
            ...normalizeStringArray(rec.targetAgeGroups),
          ];
          const ageGroups =
            rawAges.length > 0 ? Array.from(new Set(rawAges)) : ['Kids (6–11)', 'Teens (12–18)', 'Adults'];

          const expYears = rec.experienceYears || rec.yearsOfExperience || rec.experience;
          const experienceLabel = expYears
            ? typeof expYears === 'number' || /^\d+$/.test(String(expYears).trim())
              ? `${expYears}+ Years Experience`
              : String(expYears)
            : 'Verified Portal Staff';

          const scheduleParts = [rec.daysPerWeek, rec.timeSlot, rec.availability]
            .map((s) => (typeof s === 'string' ? s.trim() : ''))
            .filter(Boolean);

          const title =
            rec.title ||
            rec.headline ||
            rec.roleTitle ||
            (rec.qualification ? `${rec.qualification} · Certified Mentor` : 'Verified Portal Tutor & Staff');

          const bio =
            rec.bio ||
            (allSpecs.length > 0
              ? `Dedicated Jaystarbliss portal mentor specializing in ${allSpecs.slice(0, 4).join(', ')}. Committed to structured 5-stage mastery and personalized student growth.`
              : 'Dedicated Jaystarbliss portal mentor committed to structured 1-on-1 and small-group mastery across technology, creative arts, and core academics.');

          results.push({
            id: String(rec._id || key),
            uid,
            email: String(rec._email || ''),
            name: displayName,
            title: String(title),
            photoURL: extractPhotoUrl(rec),
            specializations:
              allSpecs.length > 0 ? allSpecs : ['Core Programs & Mentorship'],
            ageGroups,
            teachingModes,
            experience: experienceLabel,
            bio: String(bio),
            availability:
              scheduleParts.length > 0
                ? scheduleParts.join(' · ')
                : 'Flexible Weekday & Weekend Slots',
            qualification: String(rec.qualification || ''),
          });
        });

        if (isMounted) {
          setTutors(results);
        }
      } catch (err) {
        console.error('Error fetching registered portal tutors:', err);
        if (isMounted) {
          setTutors([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchRegisteredPortalTutors();
    return () => {
      isMounted = false;
    };
  }, []);

  // Dynamically derive unique specializations from registered tutors
  const subjectFilterOptions = useMemo(() => {
    const specSet = new Set<string>();
    tutors.forEach((t) => {
      t.specializations.forEach((spec) => {
        if (spec) specSet.add(spec);
      });
    });
    return ['All Specializations', ...Array.from(specSet).slice(0, 12)];
  }, [tutors]);

  const filteredTutors = useMemo(() => {
    return tutors.filter((tutor) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        tutor.name.toLowerCase().includes(q) ||
        tutor.title.toLowerCase().includes(q) ||
        tutor.bio.toLowerCase().includes(q) ||
        tutor.specializations.some((s) => s.toLowerCase().includes(q));

      const matchesSubject =
        selectedSubjectFilter === 'All Specializations' ||
        tutor.specializations.some(
          (s) => s.toLowerCase() === selectedSubjectFilter.toLowerCase()
        );

      const matchesMode =
        selectedMode === 'All' ||
        tutor.teachingModes.some((m) =>
          m.toLowerCase().includes(selectedMode.toLowerCase())
        );

      return matchesSearch && matchesSubject && matchesMode;
    });
  }, [tutors, searchQuery, selectedSubjectFilter, selectedMode]);

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingTutor || !studentName.trim() || !parentEmail.trim()) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const summaryMessage = [
        `Mentor Booking Request for ${bookingTutor.name} (${bookingTutor.title})`,
        `Preferred Mode: ${preferredMode}`,
        `Learning Goals: ${learningGoal.trim() || 'General 1-on-1 mentorship'}`,
      ].join(' | ');

      // Uses exact allowed keys from firestore.rules for 'inquiries'
      await addDoc(collection(db, 'inquiries'), {
        name: studentName.trim(),
        email: parentEmail.trim(),
        phone: parentPhone.trim() || 'Not provided',
        type: 'tutor_booking_request',
        programsOfInterest: bookingTutor.specializations.slice(0, 5),
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
    <div className="min-h-screen bg-slate-50 pb-24">
      <SEO
        title="Find a Verified Mentor | Registered Portal Staff & Tutors | Jaystarbliss Studios"
        description="Connect directly with registered Jaystarbliss Studios staff and mentors across coding, digital literacy, creative design, animation, and core academics."
      />

      <PageHeader
        eyebrow="REGISTERED PORTAL STAFF & MENTORS"
        title="Find a Dedicated Mentor"
        description="Connect directly with our registered portal tutors and academic staff. Review their specializations, background, and book a tailored 1-on-1 or small-group learning schedule."
        fallbackImage="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1600&q=80"
      >
        <div className="flex flex-wrap items-center gap-6 text-xs font-extrabold uppercase tracking-[0.18em] text-slate-300">
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" /> Verified Portal Staff
          </span>
          <span>·</span>
          <span className="inline-flex items-center gap-2">
            <Video className="w-4 h-4 text-sky-400" /> Live Online & Hybrid Sessions
          </span>
          <span>·</span>
          <span className="inline-flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-400" /> 5-Stage Curriculum Certified
          </span>
        </div>
      </PageHeader>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 relative z-20">
        {/* Search & Filter Control Panel */}
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-200/90 mb-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
            <div className="lg:col-span-6 relative">
              <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search registered tutors by name, specialization, or bio..."
                className="w-full pl-12 pr-4 py-3.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-red text-slate-900 font-medium text-sm"
              />
            </div>

            <div className="lg:col-span-3">
              <select
                value={selectedMode}
                onChange={(e) => setSelectedMode(e.target.value)}
                className="w-full px-4 py-3.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-slate-800 font-bold text-sm focus:outline-none focus:ring-2 focus:ring-brand-red"
              >
                <option value="All">All Delivery Modes</option>
                <option value="Online">Online 1-on-1</option>
                <option value="In-Person">In-Person / Hybrid</option>
                <option value="Group">Small Group Pod</option>
              </select>
            </div>

            <div className="lg:col-span-3 flex items-center justify-end">
              <div className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                {loading
                  ? 'Loading Portal Staff...'
                  : `${filteredTutors.length} Registered ${
                      filteredTutors.length === 1 ? 'Mentor' : 'Mentors'
                    }`}
              </div>
            </div>
          </div>

          {/* Specialization Filter Strip — Rectangular Buttons, Zero Pill Capsules */}
          {subjectFilterOptions.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 mt-5 pt-5 border-t border-slate-100 no-scrollbar">
              {subjectFilterOptions.map((subject) => (
                <button
                  key={subject}
                  type="button"
                  onClick={() => setSelectedSubjectFilter(subject)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 cursor-pointer border ${
                    selectedSubjectFilter === subject
                      ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {subject}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Registered Portal Tutors Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="bg-white rounded-3xl border border-slate-200 p-7 shadow-sm animate-pulse space-y-5"
              >
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-slate-200 shrink-0" />
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-slate-200 rounded w-2/3" />
                    <div className="h-3 bg-slate-100 rounded w-1/2" />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="h-3 bg-slate-100 rounded w-full" />
                  <div className="h-3 bg-slate-100 rounded w-5/6" />
                </div>
                <div className="h-10 bg-slate-200 rounded-xl w-full" />
              </div>
            ))}
          </div>
        ) : filteredTutors.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-sm max-w-2xl mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-700 flex items-center justify-center mx-auto mb-4">
              <Users className="w-7 h-7" />
            </div>
            <h3 className="text-xl font-extrabold text-slate-900 mb-2 font-display">
              {tutors.length === 0
                ? 'No Portal Mentors Published Yet'
                : 'No Matching Mentors Found'}
            </h3>
            <p className="text-slate-600 text-sm mb-6 leading-relaxed">
              {tutors.length === 0
                ? 'Only verified staff and tutors who have registered on the Jaystarbliss portal appear here. Once tutors register and are approved on the portal, their profiles and specializations will appear automatically.'
                : 'Try clearing your search query or switching the specialization filter above.'}
            </p>
            {tutors.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedSubjectFilter('All Specializations');
                  setSelectedMode('All');
                }}
                className="bg-brand-red text-white font-bold px-6 py-3 rounded-xl hover:bg-rose-700 transition-colors text-xs uppercase tracking-wider cursor-pointer"
              >
                Reset All Filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredTutors.map((tutor) => (
              <motion.div
                key={tutor.id}
                layout
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white rounded-3xl border border-slate-200/90 shadow-sm hover:shadow-xl transition-all overflow-hidden flex flex-col justify-between"
              >
                <div className="p-6 sm:p-7">
                  {/* Profile Header with Google Account Image or Clean Initials Avatar */}
                  <div className="flex items-start gap-4 mb-5">
                    <TutorAvatar
                      photoURL={tutor.photoURL}
                      name={tutor.name}
                      className="w-16 h-16 rounded-2xl"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-emerald-600 flex items-center gap-1 mb-1">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Registered Portal Staff
                      </p>
                      <h3 className="text-lg font-extrabold text-slate-900 font-display leading-snug truncate">
                        {tutor.name}
                      </h3>
                      <p className="text-xs font-bold text-brand-red mt-0.5 line-clamp-1">
                        {tutor.title}
                      </p>
                    </div>
                  </div>

                  {/* Bio / Intro */}
                  <p className="text-slate-600 text-sm leading-relaxed mb-5 line-clamp-3">
                    {tutor.bio}
                  </p>

                  {/* Registered Specializations */}
                  <div className="mb-5 pt-4 border-t border-slate-100">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-400 mb-2 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-brand-red" /> Registered Specializations
                    </p>
                    <p className="text-xs font-bold text-slate-800 leading-relaxed">
                      {tutor.specializations.join(' · ')}
                    </p>
                  </div>

                  {/* Experience & Schedule Metadata */}
                  <div className="space-y-2 text-xs text-slate-600 pt-4 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                      <GraduationCap className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="font-semibold text-slate-700">{tutor.experience}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                      <span>{tutor.teachingModes.join(' · ')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                      <span>{tutor.availability}</span>
                    </div>
                  </div>
                </div>

                {/* Action Footer */}
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
                  <span className="text-[11px] font-bold text-slate-500 truncate">
                    {tutor.ageGroups.join(' · ')}
                  </span>

                  <button
                    type="button"
                    onClick={() => {
                      setBookingTutor(tutor);
                      setSubmitted(false);
                      setSubmitError('');
                    }}
                    className="bg-slate-900 hover:bg-brand-red text-white font-bold px-4 py-2.5 rounded-xl text-xs transition-colors flex items-center gap-2 shrink-0 cursor-pointer"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    Request Mentor
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
              className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-200 relative my-8"
            >
              <button
                type="button"
                onClick={() => setBookingTutor(null)}
                className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 absolute top-5 right-5 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              {submitted ? (
                <div className="text-center py-6">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-4">
                    <UserCheck className="w-8 h-8" />
                  </div>
                  <h3 className="text-2xl font-extrabold text-slate-900 font-display mb-2">
                    Mentor Request Received
                  </h3>
                  <p className="text-slate-600 text-sm mb-6">
                    We have logged your request to study with <strong>{bookingTutor.name}</strong>. Our academic coordinator will confirm your schedule within 24 hours.
                  </p>
                  <button
                    type="button"
                    onClick={() => setBookingTutor(null)}
                    className="bg-slate-900 text-white font-bold px-8 py-3 rounded-xl hover:bg-slate-800 cursor-pointer text-sm"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-4 mb-6 pb-4 border-b border-slate-100 pr-10">
                    <TutorAvatar
                      photoURL={bookingTutor.photoURL}
                      name={bookingTutor.name}
                      className="w-14 h-14 rounded-2xl"
                    />
                    <div className="min-w-0">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-brand-red">
                        Request 1-on-1 or Pod Mentorship
                      </span>
                      <h3 className="text-xl font-extrabold text-slate-900 font-display truncate">
                        {bookingTutor.name}
                      </h3>
                      <p className="text-xs text-slate-500 truncate">{bookingTutor.title}</p>
                    </div>
                  </div>

                  {submitError && (
                    <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-xl p-3 mb-4">
                      {submitError}
                    </p>
                  )}

                  <form onSubmit={handleBookingSubmit} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Parent / Student Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={studentName}
                        onChange={(e) => setStudentName(e.target.value)}
                        placeholder="Enter full name"
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-red text-sm"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Email Address *
                        </label>
                        <input
                          type="email"
                          required
                          value={parentEmail}
                          onChange={(e) => setParentEmail(e.target.value)}
                          placeholder="you@example.com"
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-red text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Phone / WhatsApp *
                        </label>
                        <input
                          type="tel"
                          required
                          value={parentPhone}
                          onChange={(e) => setParentPhone(e.target.value)}
                          placeholder="+234..."
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-red text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Preferred Learning Format
                      </label>
                      <select
                        value={preferredMode}
                        onChange={(e) => setPreferredMode(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-brand-red text-sm font-medium"
                      >
                        {bookingTutor.teachingModes.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Subjects & Learning Goals
                      </label>
                      <textarea
                        rows={3}
                        value={learningGoal}
                        onChange={(e) => setLearningGoal(e.target.value)}
                        placeholder="Tell us the learner's age, subjects of interest, and target goals..."
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-red text-sm"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full bg-brand-red hover:bg-rose-700 text-white font-bold py-3.5 px-6 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer text-sm"
                    >
                      <Send className="w-4 h-4" />
                      {submitting ? 'Submitting Request...' : `Confirm Request with ${bookingTutor.name}`}
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
