export type TutorPublicProfileStatus = 'PENDING_REVIEW' | 'PUBLISHED' | 'HIDDEN';

export interface PublicTutorCardRecord {
  id: string;
  uid: string;
  name: string;
  photoURL: string;
  headline: string;
  bio: string;
  subjects: string[];
  specialization: string;
  qualification: string;
  experienceYears: string;
  location: string;
  deliveryMode: string;
  rating: number | null;
  verified: boolean;
  publicProfileStatus: TutorPublicProfileStatus;
}

const DISALLOWED_IMAGE_PATTERNS = [
  /^data:/i,
  /^blob:/i,
  /ui-avatars\.com/i,
  /dicebear\.com/i,
  /gravatar\.com\/avatar\/000000/i,
  /placeholder\.(com|svg|png|jpg)/i,
  /via\.placeholder/i,
  /default-avatar/i,
];

const GENERIC_NON_HUMAN_NAMES = new Set([
  'tutor',
  'staff',
  'admin',
  'super admin',
  'test',
  'test tutor',
  'demo tutor',
  'unknown',
  'unnamed',
  'user',
  'placeholder',
  'n/a',
]);

/**
 * Validates that a tutor photograph URL is a genuine HTTPS image URL
 * (e.g., Cloudinary secure_url) and not an empty string, data URI, or placeholder avatar.
 */
export function isValidTutorPhotoUrl(url?: unknown): boolean {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (!trimmed.startsWith('https://')) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' || !parsed.hostname) return false;
  } catch {
    return false;
  }
  for (const pattern of DISALLOWED_IMAGE_PATTERNS) {
    if (pattern.test(trimmed)) return false;
  }
  return true;
}

export function normalizeTutorPublicProfileStatus(raw: unknown): TutorPublicProfileStatus {
  const upper = String(raw || '').trim().toUpperCase();
  if (upper === 'PUBLISHED' || upper === 'PUBLIC' || upper === 'APPROVED_PUBLIC') {
    return 'PUBLISHED';
  }
  if (upper === 'HIDDEN' || upper === 'UNLISTED' || upper === 'DISABLED') {
    return 'HIDDEN';
  }
  return 'PENDING_REVIEW';
}

function normalizeSubjectsList(raw: Record<string, any>): string[] {
  const collected: string[] = [];
  const pushItem = (v: unknown) => {
    if (typeof v === 'string') {
      v.split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((s) => collected.push(s));
    }
  };

  if (Array.isArray(raw.subjects)) raw.subjects.forEach(pushItem);
  else if (typeof raw.subjects === 'string') pushItem(raw.subjects);

  if (Array.isArray(raw.teachingFields)) raw.teachingFields.forEach(pushItem);
  if (Array.isArray(raw.specializations)) raw.specializations.forEach(pushItem);
  if (typeof raw.specialization === 'string') pushItem(raw.specialization);
  if (typeof raw.subject === 'string') pushItem(raw.subject);

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const item of collected) {
    const key = item.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(item);
    }
  }
  return deduped;
}

function hasIdentifiableHumanName(name: string): boolean {
  const clean = name.trim();
  if (clean.length < 2) return false;
  if (GENERIC_NON_HUMAN_NAMES.has(clean.toLowerCase())) return false;
  if (/^[^\p{L}]+$/u.test(clean)) return false;
  return true;
}

/**
 * Determines whether a raw `tutors` document qualifies for display on the public Find a Tutor directory.
 * Rules:
 * - Must NOT be pending, rejected, suspended, banned, inactive, or archived
 * - Must have `publicProfileStatus === 'PUBLISHED'` (or legacy approved/active record without pending/hidden flag)
 * - Must have a valid HTTPS photograph URL (`photoURL`)
 * - Must have an identifiable human display name
 * - Must have sufficient public profile information (subjects, specialization, bio, or qualification)
 */
export function isTutorEligibleForPublicDirectory(raw: Record<string, any>): boolean {
  if (!raw || typeof raw !== 'object') return false;

  const statusUpper = String(raw.status || '').trim().toUpperCase();
  const approvalUpper = String(raw.approvalStatus || '').trim().toUpperCase();
  const explicitPubStatus = raw.publicProfileStatus
    ? normalizeTutorPublicProfileStatus(raw.publicProfileStatus)
    : null;

  if (
    raw.isDeleted === true ||
    raw.isArchived === true ||
    raw.isSampleData === true ||
    statusUpper === 'PENDING' ||
    statusUpper === 'REJECTED' ||
    statusUpper === 'SUSPENDED' ||
    statusUpper === 'BANNED' ||
    statusUpper === 'INACTIVE' ||
    statusUpper === 'ARCHIVED' ||
    approvalUpper === 'PENDING' ||
    approvalUpper === 'REJECTED'
  ) {
    return false;
  }

  // Separate account creation from public publication
  if (explicitPubStatus !== null) {
    if (explicitPubStatus !== 'PUBLISHED') return false;
  } else {
    // Legacy approved records without publicProfileStatus must be explicitly ACTIVE/APPROVED
    const legacyApproved =
      statusUpper === 'ACTIVE' ||
      statusUpper === 'APPROVED' ||
      approvalUpper === 'APPROVED';
    if (!legacyApproved) return false;
  }

  const photo = raw.photoURL || raw.photoUrl || raw.profilePhotoUrl || '';
  if (!isValidTutorPhotoUrl(photo)) return false;

  const name = String(raw.fullName || raw.name || raw.displayName || '').trim();
  if (!hasIdentifiableHumanName(name)) return false;

  const subjects = normalizeSubjectsList(raw);
  const bio = String(raw.bio || raw.about || '').trim();
  const qualification = String(raw.qualification || '').trim();
  const specialization = String(raw.specialization || '').trim();

  if (subjects.length === 0 && !bio && !qualification && !specialization) {
    return false;
  }

  return true;
}

/**
 * Reconciles canonical `tutors` records into clean, deduplicated public directory cards.
 * - Filters strictly via `isTutorEligibleForPublicDirectory`
 * - Deduplicates by UID, doc ID, and normalized lowercase email
 * - Strips private contact/application fields (email, phone, whatsapp, expectedSalary, cvUrl)
 */
export function reconcilePublicTutors(
  rawDocs: Array<{ id: string } & Record<string, any>>
): PublicTutorCardRecord[] {
  const byUid = new Map<string, PublicTutorCardRecord>();
  const seenEmails = new Set<string>();

  for (const raw of rawDocs) {
    if (!isTutorEligibleForPublicDirectory(raw)) continue;

    const uid = String(raw.uid || raw.userId || raw.id || '').trim();
    const emailKey = String(raw.email || '').trim().toLowerCase();

    if (uid && byUid.has(uid)) continue;
    if (emailKey && seenEmails.has(emailKey)) continue;

    const name = String(raw.fullName || raw.name || raw.displayName || '').trim();
    const photoURL = String(raw.photoURL || raw.photoUrl || raw.profilePhotoUrl || '').trim();
    const subjects = normalizeSubjectsList(raw);
    const specialization =
      String(raw.specialization || '').trim() || subjects[0] || 'Specialist Tutor';
    const qualification = String(raw.qualification || '').trim();
    const bio = String(raw.bio || raw.about || '').trim();
    const experienceYears =
      raw.experienceYears !== undefined && raw.experienceYears !== null && String(raw.experienceYears).trim() !== ''
        ? String(raw.experienceYears).trim()
        : '';
    const location = String(raw.location || raw.city || '').trim();
    const deliveryMode = String(raw.deliveryMode || 'Online & In-Person').trim();
    const numericRating = Number(raw.rating);
    const rating =
      Number.isFinite(numericRating) && numericRating > 0 && numericRating <= 5
        ? numericRating
        : null;

    const card: PublicTutorCardRecord = {
      id: raw.id,
      uid: uid || raw.id,
      name,
      photoURL,
      headline: String(raw.headline || qualification || specialization).trim(),
      bio,
      subjects,
      specialization,
      qualification,
      experienceYears,
      location,
      deliveryMode,
      rating,
      verified: raw.verified !== false,
      publicProfileStatus: 'PUBLISHED',
    };

    if (uid) byUid.set(uid, card);
    else byUid.set(raw.id, card);
    if (emailKey) seenEmails.add(emailKey);
  }

  return Array.from(byUid.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export interface CanonicalTutorApplicationInput {
  uid?: string | null;
  name: string;
  email: string;
  phone: string;
  whatsapp?: string;
  location?: string;
  photoURL: string;
  subjects: string[];
  qualification?: string;
  experienceYears?: string | number;
  daysPerWeek?: string | number;
  timeSlot?: string;
  expectedSalary?: string;
  cvUrl?: string;
  bio?: string;
  source?: 'REGISTER_FORM' | 'TUTOR_APPLICATION_PAGE';
}

/**
 * Shared canonical payload builder for `tutor_applications` used by both
 * Register.tsx and TutorApplication.tsx. Enforces a valid HTTPS photoURL and
 * initializes `status: 'pending'` and `publicProfileStatus: 'PENDING_REVIEW'`.
 */
export function buildCanonicalTutorApplicationPayload(
  input: CanonicalTutorApplicationInput
): Record<string, any> {
  const cleanName = String(input.name || '').trim();
  const cleanEmail = String(input.email || '').trim().toLowerCase();
  const cleanPhone = String(input.phone || '').trim();
  const cleanPhoto = String(input.photoURL || '').trim();

  if (!cleanName) {
    throw new Error('Full name is required for tutor applications.');
  }
  if (!cleanEmail) {
    throw new Error('Email address is required for tutor applications.');
  }
  if (!isValidTutorPhotoUrl(cleanPhoto)) {
    throw new Error(
      'A valid uploaded tutor profile photograph is mandatory before submitting your application.'
    );
  }

  const normalizedSubjects = Array.from(
    new Set(
      (input.subjects || [])
        .map((s) => String(s || '').trim())
        .filter(Boolean)
    )
  );

  return {
    ...(input.uid ? { uid: input.uid } : {}),
    name: cleanName,
    fullName: cleanName,
    email: cleanEmail,
    phone: cleanPhone,
    whatsapp: String(input.whatsapp || cleanPhone).trim(),
    location: String(input.location || '').trim(),
    photoURL: cleanPhoto,
    subjects: normalizedSubjects,
    specialization: normalizedSubjects[0] || '',
    qualification: String(input.qualification || '').trim(),
    experienceYears:
      input.experienceYears !== undefined && input.experienceYears !== null
        ? String(input.experienceYears).trim()
        : '',
    daysPerWeek:
      input.daysPerWeek !== undefined && input.daysPerWeek !== null
        ? String(input.daysPerWeek).trim()
        : '',
    timeSlot: String(input.timeSlot || '').trim(),
    expectedSalary: String(input.expectedSalary || '').trim(),
    cvUrl: String(input.cvUrl || '').trim(),
    bio: String(input.bio || '').trim(),
    source: input.source || 'TUTOR_APPLICATION_PAGE',
    status: 'pending',
    publicProfileStatus: 'PENDING_REVIEW' as TutorPublicProfileStatus,
  };
}
