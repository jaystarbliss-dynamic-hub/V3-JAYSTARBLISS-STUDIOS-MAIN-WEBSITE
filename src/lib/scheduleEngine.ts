import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { isStudentClassMatch } from '../utils/classMatching';
import { CANONICAL_CLASSES, normalizeClassList, normalizeClassName } from './classes';

export interface MeetingLinkValidation {
  valid: boolean;
  normalizedUrl: string;
  platform: string;
  error?: string;
}

export function validateMeetingLink(rawUrl?: string | null): MeetingLinkValidation {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) {
    return {
      valid: false,
      normalizedUrl: '',
      platform: 'Virtual Classroom',
    };
  }

  if (/\s/.test(trimmed)) {
    return {
      valid: false,
      normalizedUrl: trimmed,
      platform: 'Virtual Classroom',
      error: 'Meeting URL must not contain spaces.',
    };
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        valid: false,
        normalizedUrl: trimmed,
        platform: 'Virtual Classroom',
        error: 'Meeting link must use http:// or https://.',
      };
    }
    const host = parsed.hostname.toLowerCase();
    if (!host || !host.includes('.') || host.startsWith('.') || host.endsWith('.')) {
      return {
        valid: false,
        normalizedUrl: trimmed,
        platform: 'Virtual Classroom',
        error: 'Please enter a valid meeting domain (e.g., meet.google.com or zoom.us).',
      };
    }

    let platform = 'Online Classroom';
    if (host.includes('meet.google.com') || host.includes('google.com')) {
      platform = 'Google Meet';
    } else if (host.includes('zoom.us') || host.includes('zoom.com')) {
      platform = 'Zoom';
    } else if (host.includes('teams.microsoft.com') || host.includes('teams.live.com')) {
      platform = 'Microsoft Teams';
    } else if (host.includes('webex.com')) {
      platform = 'Cisco Webex';
    } else if (host.includes('meet.jit.si') || host.includes('jitsi')) {
      platform = 'Jitsi Meet';
    }

    return {
      valid: true,
      normalizedUrl: parsed.toString(),
      platform,
    };
  } catch {
    return {
      valid: false,
      normalizedUrl: trimmed,
      platform: 'Virtual Classroom',
      error: 'Please enter a valid meeting link URL (e.g., https://meet.google.com/...).',
    };
  }
}

export interface StudentEnrollmentContext {
  ids: Set<string>;
  emails: Set<string>;
  names: Set<string>;
  isSchoolStudent: boolean;
  schoolId: string;
  schoolName: string;
  className: string;
  programIds: Set<string>;
  programNames: Set<string>;
  parentIds: Set<string>;
  parentEmails: Set<string>;
}

const norm = (v: unknown): string => String(v || '').trim().toLowerCase();

/**
 * Normalizes program names so minor variations ("Coding for Kids" vs "Coding For Kids Program")
 * match reliably while distinct programs ("Coding for Kids" vs "Robotics & IoT") remain separate.
 */
export function programsMatch(
  studentProgramIds: Set<string> | string[],
  studentProgramNames: Set<string> | string[],
  scheduleProgramId?: string | null,
  scheduleProgramName?: string | null
): boolean {
  const sProgId = norm(scheduleProgramId);
  const sProgName = norm(scheduleProgramName);

  // If the schedule has no specific program restriction, it applies to the school/class cohort
  if (!sProgId && !sProgName) return true;

  const idSet = studentProgramIds instanceof Set ? studentProgramIds : new Set(studentProgramIds.map(norm).filter(Boolean));
  const nameSet = studentProgramNames instanceof Set ? studentProgramNames : new Set(studentProgramNames.map(norm).filter(Boolean));

  if (sProgId && idSet.has(sProgId)) return true;
  if (sProgName && nameSet.has(sProgName)) return true;

  for (const enrolledName of nameSet) {
    if (!enrolledName) continue;
    if (sProgName && (enrolledName === sProgName || enrolledName.includes(sProgName) || sProgName.includes(enrolledName))) {
      return true;
    }
    if (sProgId && enrolledName === sProgId) {
      return true;
    }
  }

  // If the student record does not specify any program yet (legacy school student), allow school-level match
  if (idSet.size === 0 && nameSet.size === 0) {
    return true;
  }

  return false;
}

/**
 * Authoritative visibility check determining whether a given schedule record belongs to a student.
 * Enforces strict separation between:
 * 1. School & Program-Based Schedules (shared by school + program + class enrollment)
 * 2. Individual Private-Student Schedules (isolated strictly to the selected private student)
 */
export function doesScheduleMatchStudent(
  schedule: Record<string, any>,
  studentCtx: StudentEnrollmentContext
): boolean {
  if (!schedule) return false;

  const targetType = norm(schedule.targetType);
  const schedSchoolId = String(schedule.schoolId || '').trim();
  const schedSchoolName = norm(schedule.schoolName);
  const schedStudentId = String(schedule.studentId || '').trim();
  const schedStudentEmail = norm(schedule.studentEmail);
  const schedParentId = String(schedule.parentId || '').trim();
  const schedParentEmail = norm(schedule.parentEmail);

  const isSchoolSchedule =
    targetType === 'school' ||
    Boolean(schedSchoolId) ||
    (Boolean(schedSchoolName) && targetType !== 'individual' && targetType !== 'private' && targetType !== 'parent' && !schedStudentId);

  const isPrivateSchedule =
    targetType === 'individual' ||
    targetType === 'private' ||
    targetType === 'student' ||
    targetType === 'parent' ||
    Boolean(schedStudentId) ||
    Boolean(schedParentId);

  // CASE 1: Individual Private-Student Schedule
  if (isPrivateSchedule && !isSchoolSchedule) {
    // A school-based student should NEVER see private student schedules unless explicitly matching their ID
    if (schedStudentId) {
      if (studentCtx.ids.has(schedStudentId)) return true;
      if (schedStudentEmail && studentCtx.emails.has(schedStudentEmail)) return true;
      return false;
    }
    if (schedStudentEmail) {
      return studentCtx.emails.has(schedStudentEmail);
    }
    // Family-wide parent schedule where no specific child studentId was set
    if (!studentCtx.isSchoolStudent) {
      if (schedParentId && studentCtx.parentIds.has(schedParentId)) return true;
      if (schedParentEmail && studentCtx.parentEmails.has(schedParentEmail)) return true;
    }
    return false;
  }

  // CASE 2: School & Program-Based Schedule
  if (isSchoolSchedule) {
    // Private students (without a school enrollment) must NEVER see school schedules
    if (!studentCtx.isSchoolStudent) return false;

    const studentSchoolId = String(studentCtx.schoolId || '').trim();
    const studentSchoolName = norm(studentCtx.schoolName);

    const schoolIdMatches = Boolean(schedSchoolId && studentSchoolId && norm(schedSchoolId) === norm(studentSchoolId));
    const schoolNameMatches = Boolean(
      schedSchoolName &&
        studentSchoolName &&
        (schedSchoolName === studentSchoolName ||
          schedSchoolName.includes(studentSchoolName) ||
          studentSchoolName.includes(schedSchoolName))
    );

    if (!schoolIdMatches && !schoolNameMatches) {
      return false;
    }

    // Check Program association
    const schedProgramId = schedule.programId || schedule.programmeId || '';
    const schedProgramName = schedule.programName || schedule.programmeName || '';
    if (!programsMatch(studentCtx.programIds, studentCtx.programNames, schedProgramId, schedProgramName)) {
      return false;
    }

    // Check Class Level association (if class levels are specified on the schedule and student has a class)
    const hasScheduleClasses =
      (Array.isArray(schedule.classLevels) && schedule.classLevels.length > 0) ||
      Boolean(schedule.classLevel);
    if (hasScheduleClasses && studentCtx.className) {
      if (!isStudentClassMatch(studentCtx.className, schedule.classLevel, schedule.classLevels)) {
        return false;
      }
    }

    return true;
  }

  return false;
}

/**
 * Resolves a complete StudentEnrollmentContext from Firestore & sessionStorage for the current student.
 */
export async function resolveFullStudentEnrollmentContext(
  uid?: string | null
): Promise<StudentEnrollmentContext> {
  const ids = new Set<string>();
  const emails = new Set<string>();
  const names = new Set<string>();
  const programIds = new Set<string>();
  const programNames = new Set<string>();
  const parentIds = new Set<string>();
  const parentEmails = new Set<string>();

  if (uid) ids.add(uid);

  const cachedDocId = sessionStorage.getItem('studentDocId') || localStorage.getItem('jaystar_cached_student_doc_id') || '';
  const cachedUserId = sessionStorage.getItem('userId') || localStorage.getItem('jaystar_cached_user_id') || '';
  const cachedEmail = sessionStorage.getItem('studentEmail') || '';
  let schoolId = sessionStorage.getItem('studentSchoolId') || '';
  let schoolName = sessionStorage.getItem('studentSchoolName') || '';
  let className = sessionStorage.getItem('studentClass') || '';
  const cachedProgramId = sessionStorage.getItem('studentProgramId') || '';
  const cachedProgramName = sessionStorage.getItem('studentProgramName') || sessionStorage.getItem('studentPlan') || sessionStorage.getItem('studentTrack') || '';
  const cachedParentId = sessionStorage.getItem('parentId') || sessionStorage.getItem('studentParentId') || '';

  if (cachedDocId) ids.add(cachedDocId);
  if (cachedUserId) ids.add(cachedUserId);
  if (cachedEmail) emails.add(norm(cachedEmail));
  if (cachedProgramId) programIds.add(norm(cachedProgramId));
  if (cachedProgramName) programNames.add(norm(cachedProgramName));
  if (cachedParentId) parentIds.add(cachedParentId);

  const absorbStudentData = (docId: string, d: Record<string, any>) => {
    if (!d) return;
    ids.add(docId);
    [d.id, d.uid, d.firebaseUid, d.studentId, d.studentDocId, d.linkedStudentId].forEach((v) => {
      if (v) ids.add(String(v).trim());
    });
    [d.email, d.studentEmail].forEach((v) => {
      if (v) emails.add(norm(v));
    });
    [d.fullName, d.studentName, d.name].forEach((v) => {
      if (v) names.add(norm(v));
    });
    if (d.schoolId && !schoolId) schoolId = String(d.schoolId).trim();
    if ((d.schoolName || d.school) && !schoolName) schoolName = String(d.schoolName || d.school).trim();
    if ((d.class || d.grade || d.classLevel || d.year) && !className) {
      className = String(d.class || d.grade || d.classLevel || d.year).trim();
    }
    [d.programId, d.assignedProgramId, d.programmeId].forEach((v) => {
      if (v) programIds.add(norm(v));
    });
    [d.programName, d.programmeName, d.program, d.programme, d.plan, d.track, d.programTitle].forEach((v) => {
      if (v) programNames.add(norm(v));
    });
    if (Array.isArray(d.programs)) {
      d.programs.forEach((p: any) => {
        if (typeof p === 'string') programNames.add(norm(p));
        else if (p && typeof p === 'object') {
          if (p.id) programIds.add(norm(p.id));
          if (p.name || p.title) programNames.add(norm(p.name || p.title));
        }
      });
    }
    if (Array.isArray(d.subjects)) {
      d.subjects.forEach((sub: any) => {
        if (typeof sub === 'string') programNames.add(norm(sub));
      });
    }
    [d.parentId, d.parentUid].forEach((v) => {
      if (v) parentIds.add(String(v).trim());
    });
    if (d.parentEmail) parentEmails.add(norm(d.parentEmail));
  };

  try {
    const lookupIds = Array.from(ids).filter(Boolean);
    for (const lid of lookupIds) {
      const [sDoc, iDoc] = await Promise.all([
        getDoc(doc(db, 'students', lid)).catch(() => null),
        getDoc(doc(db, 'individualStudents', lid)).catch(() => null),
      ]);
      if (sDoc?.exists()) absorbStudentData(sDoc.id, sDoc.data());
      if (iDoc?.exists()) absorbStudentData(iDoc.id, iDoc.data());
    }

    if (uid) {
      const [sByUid, iByUid] = await Promise.all([
        getDocs(query(collection(db, 'students'), where('firebaseUid', '==', uid))).catch(() => null),
        getDocs(query(collection(db, 'individualStudents'), where('firebaseUid', '==', uid))).catch(() => null),
      ]);
      sByUid?.docs.forEach((d) => absorbStudentData(d.id, d.data()));
      iByUid?.docs.forEach((d) => absorbStudentData(d.id, d.data()));
    }
  } catch (err) {
    console.warn('Student enrollment context lookup warning:', err);
  }

  const isSchoolStudent = Boolean(schoolId || schoolName);

  return {
    ids,
    emails,
    names,
    isSchoolStudent,
    schoolId,
    schoolName,
    className: normalizeClassName(className, className),
    programIds,
    programNames,
    parentIds,
    parentEmails,
  };
}

export interface PrivateStudentOption {
  id: string;
  name: string;
  email: string;
  username?: string;
  className: string;
  enrolledPrograms: string[];
  primaryProgram: string;
  parentId?: string;
  parentName?: string;
  parentEmail?: string;
  tutorId?: string;
  tutorName?: string;
  studentType: 'independent' | 'parent_enrolled';
}

export interface SchoolProgramOption {
  id: string;
  name: string;
  level?: string;
  assignedTutors?: Array<{ tutorId: string; tutorName: string }>;
}

export interface AuthorizedSchoolOption {
  id: string;
  name: string;
  code?: string;
  programs: SchoolProgramOption[];
}

export interface TutorSchedulingScope {
  tutorId: string;
  tutorName: string;
  tutorEmail: string;
  tutorIds: Set<string>;
  tutorNames: Set<string>;
  tutorEmails: Set<string>;
  authorizedSchools: AuthorizedSchoolOption[];
  assignedPrivateStudents: PrivateStudentOption[];
  allStudioPrograms: string[];
}

const DEFAULT_STUDIO_PROGRAMS = [
  'Coding for Kids',
  'Scratch Programming & Game Design',
  'Python & Data Science',
  'Full-Stack Web Development',
  'Robotics & Embedded IoT',
  'AI Responsibility & Digital Literacy',
  'Digital Literacy',
  'UI/UX & Product Design',
  'Graphic Design & Digital Art',
  'Mobile App Development',
  'Cybersecurity & Ethical Hacking',
  'Mathematics & Logic',
  'Music Theory & Piano',
];

/**
 * Loads all schools (with their programs), all private students (both independent and parent-enrolled),
 * and resolves what a Tutor or Admin is authorized to schedule.
 */
export async function loadSchedulingDirectory(options: {
  role: 'admin' | 'tutor';
  uid?: string | null;
  name?: string | null;
  email?: string | null;
}): Promise<{
  schools: AuthorizedSchoolOption[];
  privateStudents: PrivateStudentOption[];
  studioPrograms: string[];
  tutorScope: TutorSchedulingScope;
}> {
  const uid = String(options.uid || '').trim();
  const email = norm(options.email);
  const name = String(options.name || '').trim();

  const [
    schoolsSnap,
    indivSnap,
    studentsSnap,
    programsSnap,
    usersSnap,
    tutorsSnap,
    staffSnap,
    tutorSubjectsSnap,
  ] = await Promise.all([
    getDocs(collection(db, 'schools')).catch(() => ({ docs: [] } as any)),
    getDocs(collection(db, 'individualStudents')).catch(() => ({ docs: [] } as any)),
    getDocs(collection(db, 'students')).catch(() => ({ docs: [] } as any)),
    getDocs(collection(db, 'programs')).catch(() => ({ docs: [] } as any)),
    getDocs(collection(db, 'users')).catch(() => ({ docs: [] } as any)),
    getDocs(collection(db, 'tutors')).catch(() => ({ docs: [] } as any)),
    getDocs(collection(db, 'staff')).catch(() => ({ docs: [] } as any)),
    getDocs(collection(db, 'tutor_subjects')).catch(() => ({ docs: [] } as any)),
  ]);

  // 1. Collect Studio Programs
  const programNameSet = new Set<string>(DEFAULT_STUDIO_PROGRAMS);
  programsSnap.docs.forEach((d: any) => {
    const data = d.data() || {};
    const title = String(data.title || data.name || '').trim();
    if (title) programNameSet.add(title);
  });

  // 2. Resolve Tutor Identity Sets & Assigned IDs
  const tutorIds = new Set<string>();
  const tutorNames = new Set<string>();
  const tutorEmails = new Set<string>();
  const explicitSchoolIds = new Set<string>();
  const explicitStudentIds = new Set<string>();
  const approvedTutorSubjects = new Set<string>();

  if (uid) tutorIds.add(uid);
  if (email) tutorEmails.add(email);
  if (name) tutorNames.add(norm(name));

  const absorbTutorDoc = (docId: string, data: Record<string, any>) => {
    const dEmail = norm(data.email);
    const dUid = String(data.uid || data.firebaseUid || data.tutorId || data.staffId || '').trim();
    const isMatch =
      (uid && (docId === uid || dUid === uid)) ||
      (email && dEmail === email);
    if (!isMatch) return;

    tutorIds.add(docId);
    if (dUid) tutorIds.add(dUid);
    [data.name, data.fullName, data.displayName].forEach((n) => {
      if (n) tutorNames.add(norm(n));
    });
    if (dEmail) tutorEmails.add(dEmail);

    [data.schoolId, ...(Array.isArray(data.schoolIds) ? data.schoolIds : []), ...(Array.isArray(data.assignedSchoolIds) ? data.assignedSchoolIds : [])]
      .filter(Boolean)
      .forEach((sid) => explicitSchoolIds.add(String(sid).trim()));

    [data.studentId, ...(Array.isArray(data.assignedStudentIds) ? data.assignedStudentIds : []), ...(Array.isArray(data.studentIds) ? data.studentIds : [])]
      .filter(Boolean)
      .forEach((stid) => explicitStudentIds.add(String(stid).trim()));

    if (Array.isArray(data.subjects)) {
      data.subjects.forEach((s: any) => {
        if (typeof s === 'string' && s.trim()) {
          approvedTutorSubjects.add(s.trim());
          programNameSet.add(s.trim());
        }
      });
    }
  };

  usersSnap.docs.forEach((d: any) => absorbTutorDoc(d.id, d.data()));
  tutorsSnap.docs.forEach((d: any) => absorbTutorDoc(d.id, d.data()));
  staffSnap.docs.forEach((d: any) => absorbTutorDoc(d.id, d.data()));

  tutorSubjectsSnap.docs.forEach((d: any) => {
    const data = d.data() || {};
    const matchesTutor =
      (data.tutorId && tutorIds.has(String(data.tutorId))) ||
      (data.tutorEmail && tutorEmails.has(norm(data.tutorEmail))) ||
      (data.tutorName && tutorNames.has(norm(data.tutorName)));
    if (matchesTutor && String(data.status || 'APPROVED').toUpperCase() !== 'REJECTED') {
      const subj = String(data.subjectName || data.subject || data.programName || '').trim();
      if (subj) {
        approvedTutorSubjects.add(subj);
        programNameSet.add(subj);
      }
      if (data.schoolId) explicitSchoolIds.add(String(data.schoolId).trim());
    }
  });

  //Also map parents by ID/email for enriching private student records
  const parentInfoMap = new Map<string, { id: string; name: string; email: string }>();
  usersSnap.docs.forEach((d: any) => {
    const u = d.data() || {};
    if (norm(u.role) === 'parent' || u.isParent) {
      const info = {
        id: d.id,
        name: String(u.fullName || u.name || u.displayName || (u.email ? u.email.split('@')[0] : 'Parent')),
        email: String(u.email || ''),
      };
      parentInfoMap.set(d.id, info);
      if (info.email) parentInfoMap.set(norm(info.email), info);
    }
  });

  // 3. Process All Private Students (Independent + Parent-Enrolled) and School Student Program/Tutor links
  const privateStudentMap = new Map<string, PrivateStudentOption>();
  const schoolProgramsFromStudents = new Map<string, Set<string>>();

  const processStudentDoc = (docId: string, s: Record<string, any>) => {
    const sSchoolId = String(s.schoolId || '').trim();
    const sTutorId = String(s.tutorId || s.assignedTutorId || s.staffId || s.assignedStaffId || s.instructorId || '').trim();
    const sTutorName = String(s.tutorName || s.assignedTutorName || s.mentorName || '').trim();
    const sTutorEmail = norm(s.tutorEmail);

    const isAssignedToTutor =
      explicitStudentIds.has(docId) ||
      (sTutorId && tutorIds.has(sTutorId)) ||
      (sTutorName && tutorNames.has(norm(sTutorName))) ||
      (sTutorEmail && tutorEmails.has(sTutorEmail));

    // Extract student's enrolled programs
    const studentPrograms: string[] = [];
    [s.programName, s.programmeName, s.program, s.programme, s.plan, s.track, s.programTitle].forEach((p) => {
      if (p && typeof p === 'string' && p.trim()) {
        studentPrograms.push(p.trim());
        programNameSet.add(p.trim());
      }
    });
    if (Array.isArray(s.subjects)) {
      s.subjects.forEach((subj: any) => {
        if (typeof subj === 'string' && subj.trim()) {
          studentPrograms.push(subj.trim());
          programNameSet.add(subj.trim());
        }
      });
    }
    const uniqueStudentPrograms = Array.from(new Set(studentPrograms));

    if (sSchoolId) {
      if (!schoolProgramsFromStudents.has(sSchoolId)) {
        schoolProgramsFromStudents.set(sSchoolId, new Set());
      }
      uniqueStudentPrograms.forEach((p) => schoolProgramsFromStudents.get(sSchoolId)!.add(p));
      if (isAssignedToTutor) {
        explicitSchoolIds.add(sSchoolId);
      }
      return;
    }

    // It's a Private Student (no schoolId)
    if (options.role === 'tutor' && !isAssignedToTutor) {
      return;
    }

    const parentLookup =
      (s.parentId && parentInfoMap.get(String(s.parentId))) ||
      (s.parentEmail && parentInfoMap.get(norm(s.parentEmail)));

    const isParentEnrolled = Boolean(s.parentId || s.parentEmail || norm(s.registrationType) === 'parent');
    const canonicalId = String(s.linkedStudentId || s.studentDocId || docId).trim();

    const existing = privateStudentMap.get(canonicalId);
    const mergedPrograms = Array.from(
      new Set([
        ...(existing?.enrolledPrograms || []),
        ...uniqueStudentPrograms,
      ])
    );

    privateStudentMap.set(canonicalId, {
      id: canonicalId,
      name: String(s.fullName || s.studentName || s.name || existing?.name || s.username || 'Private Student').trim(),
      email: String(s.email || s.studentEmail || existing?.email || '').trim(),
      username: String(s.username || existing?.username || '').trim(),
      className: normalizeClassName(s.class || s.grade || s.classLevel || existing?.className || 'Grade 1', 'Grade 1'),
      enrolledPrograms: mergedPrograms.length > 0 ? mergedPrograms : ['Coding for Kids'],
      primaryProgram: mergedPrograms[0] || 'Coding for Kids',
      parentId: String(s.parentId || parentLookup?.id || existing?.parentId || '').trim(),
      parentName: String(s.parentName || parentLookup?.name || existing?.parentName || '').trim(),
      parentEmail: String(s.parentEmail || parentLookup?.email || existing?.parentEmail || '').trim(),
      tutorId: sTutorId || existing?.tutorId || '',
      tutorName: sTutorName || existing?.tutorName || '',
      studentType: isParentEnrolled ? 'parent_enrolled' : 'independent',
    });
  };

  indivSnap.docs.forEach((d: any) => processStudentDoc(d.id, d.data()));
  studentsSnap.docs.forEach((d: any) => processStudentDoc(d.id, d.data()));

  // 4. Process Schools and their Programs
  const allSchools: AuthorizedSchoolOption[] = [];
  const authorizedSchools: AuthorizedSchoolOption[] = [];

  schoolsSnap.docs.forEach((d: any) => {
    const data = d.data() || {};
    const schoolId = d.id;
    const schoolName = String(data.name || data.schoolName || data.institutionName || d.id).trim();
    const rawPrograms = Array.isArray(data.programs) ? data.programs : [];

    const normalizedPrograms: SchoolProgramOption[] = rawPrograms.map((p: any, idx: number) => {
      if (typeof p === 'string') {
        programNameSet.add(p.trim());
        return {
          id: `prog-${idx}-${norm(p).replace(/\s+/g, '-')}`,
          name: p.trim(),
          assignedTutors: [],
        };
      }
      const pName = String(p.name || p.title || p.programName || `Program ${idx + 1}`).trim();
      programNameSet.add(pName);
      return {
        id: String(p.id || `prog-${idx}-${norm(pName).replace(/\s+/g, '-')}`),
        name: pName,
        level: p.level,
        assignedTutors: Array.isArray(p.assignedTutors) ? p.assignedTutors : [],
      };
    });

    // Also include any programs discovered on enrolled students of this school
    const discoveredSet = schoolProgramsFromStudents.get(schoolId);
    if (discoveredSet) {
      discoveredSet.forEach((discProg) => {
        if (!normalizedPrograms.some((np) => norm(np.name) === norm(discProg))) {
          normalizedPrograms.push({
            id: `prog-${norm(discProg).replace(/\s+/g, '-')}`,
            name: discProg,
            assignedTutors: [],
          });
        }
      });
    }

    // Ensure every school has at least the default active program options selectable if none were explicitly array-stored yet
    if (normalizedPrograms.length === 0) {
      ['Coding for Kids', 'AI Responsibility & Digital Literacy', 'Robotics & Embedded IoT', 'Python & Data Science'].forEach((defName) => {
        normalizedPrograms.push({
          id: `prog-${norm(defName).replace(/\s+/g, '-')}`,
          name: defName,
          assignedTutors: [],
        });
      });
    }

    const schoolObj: AuthorizedSchoolOption = {
      id: schoolId,
      name: schoolName,
      code: data.code || data.schoolCode,
      programs: normalizedPrograms,
    };
    allSchools.push(schoolObj);

    // Check if Tutor is authorized for this school or any of its programs
    const isSchoolDirectTutor =
      explicitSchoolIds.has(schoolId) ||
      (data.tutorId && tutorIds.has(String(data.tutorId))) ||
      (data.assignedTutorId && tutorIds.has(String(data.assignedTutorId))) ||
      (data.assignedStaffId && tutorIds.has(String(data.assignedStaffId))) ||
      (Array.isArray(data.assignedTutors) &&
        data.assignedTutors.some((t: any) =>
          typeof t === 'string'
            ? tutorIds.has(t) || tutorNames.has(norm(t))
            : tutorIds.has(String(t?.id || t?.tutorId || t?.uid || '')) ||
              tutorEmails.has(norm(t?.email)) ||
              tutorNames.has(norm(t?.name || t?.tutorName))
        )) ||
      (Array.isArray(data.tutors) &&
        data.tutors.some((t: any) =>
          typeof t === 'string'
            ? tutorIds.has(t)
            : tutorIds.has(String(t?.id || t?.tutorId || t?.uid || '')) ||
              tutorEmails.has(norm(t?.email)) ||
              tutorNames.has(norm(t?.name || t?.tutorName))
        ));

    const matchingProgramsForTutor = normalizedPrograms.filter((prog) => {
      if (isSchoolDirectTutor) return true;
      if (
        Array.isArray(prog.assignedTutors) &&
        prog.assignedTutors.some(
          (at) =>
            tutorIds.has(String(at.tutorId || '')) ||
            tutorNames.has(norm(at.tutorName))
        )
      ) {
        return true;
      }
      return false;
    });

    if (options.role === 'admin') {
      authorizedSchools.push(schoolObj);
    } else if (isSchoolDirectTutor || matchingProgramsForTutor.length > 0) {
      authorizedSchools.push({
        ...schoolObj,
        programs: matchingProgramsForTutor.length > 0 ? matchingProgramsForTutor : schoolObj.programs,
      });
    }
  });

  allSchools.sort((a, b) => a.name.localeCompare(b.name));
  authorizedSchools.sort((a, b) => a.name.localeCompare(b.name));

  const sortedPrivateStudents = Array.from(privateStudentMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const sortedStudioPrograms = Array.from(programNameSet).sort((a, b) => a.localeCompare(b));

  const tutorScope: TutorSchedulingScope = {
    tutorId: uid,
    tutorName: name || 'Faculty Tutor',
    tutorEmail: email,
    tutorIds,
    tutorNames,
    tutorEmails,
    authorizedSchools,
    assignedPrivateStudents: sortedPrivateStudents,
    allStudioPrograms: sortedStudioPrograms,
  };

  return {
    schools: options.role === 'admin' ? allSchools : authorizedSchools,
    privateStudents: sortedPrivateStudents,
    studioPrograms: sortedStudioPrograms,
    tutorScope,
  };
}

/**
 * Checks whether a Tutor is permitted to manage (view/edit/update link/status) a given schedule.
 */
export function canTutorManageSchedule(
  schedule: Record<string, any>,
  scope: TutorSchedulingScope
): boolean {
  if (!schedule) return false;
  if (schedule.tutorId && scope.tutorIds.has(String(schedule.tutorId))) return true;
  if (schedule.createdByUid && scope.tutorIds.has(String(schedule.createdByUid))) return true;
  if (schedule.tutorName && scope.tutorNames.has(norm(schedule.tutorName))) return true;
  if (schedule.tutorEmail && scope.tutorEmails.has(norm(schedule.tutorEmail))) return true;

  const schedStudentId = String(schedule.studentId || '').trim();
  if (schedStudentId && scope.assignedPrivateStudents.some((s) => s.id === schedStudentId)) {
    return true;
  }

  const schedSchoolId = String(schedule.schoolId || '').trim();
  if (schedSchoolId) {
    const authSchool = scope.authorizedSchools.find((s) => s.id === schedSchoolId);
    if (authSchool) {
      const schedProgName = norm(schedule.programName || schedule.title);
      if (!schedProgName) return true;
      return authSchool.programs.some(
        (p) =>
          norm(p.name) === schedProgName ||
          norm(p.id) === norm(schedule.programId) ||
          schedProgName.includes(norm(p.name)) ||
          norm(p.name).includes(schedProgName)
      );
    }
  }

  return false;
}

export const SCHEDULE_DAYS_OF_WEEK = [
  { id: 'Monday', label: 'Mon', full: 'Monday', dayIndex: 1 },
  { id: 'Tuesday', label: 'Tue', full: 'Tuesday', dayIndex: 2 },
  { id: 'Wednesday', label: 'Wed', full: 'Wednesday', dayIndex: 3 },
  { id: 'Thursday', label: 'Thu', full: 'Thursday', dayIndex: 4 },
  { id: 'Friday', label: 'Fri', full: 'Friday', dayIndex: 5 },
  { id: 'Saturday', label: 'Sat', full: 'Saturday', dayIndex: 6 },
  { id: 'Sunday', label: 'Sun', full: 'Sunday', dayIndex: 0 },
] as const;

export function calculateDurationMinutes(startTime: string, endTime: string): number {
  if (!startTime || !endTime) return 60;
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  const startMins = (sh || 0) * 60 + (sm || 0);
  const endMins = (eh || 0) * 60 + (em || 0);
  return Math.max(0, endMins - startMins);
}

export function addMinutesToTime(startTime: string, durationMinutes: number): string {
  if (!startTime) return '15:00';
  const [sh, sm] = startTime.split(':').map(Number);
  const total = Math.min(23 * 60 + 59, Math.max(0, (sh || 0) * 60 + (sm || 0) + durationMinutes));
  const eh = Math.floor(total / 60);
  const em = total % 60;
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
}

/**
 * Updates the meeting link across an entire recurring schedule series (`scheduleGroupId`) or single session.
 */
export async function updateScheduleMeetingLink(params: {
  scheduleId: string;
  scheduleGroupId?: string;
  meetingLink: string;
  applyToSeries?: boolean;
  actorUid?: string;
  actorName?: string;
  actorRole?: 'ADMIN' | 'TUTOR';
}): Promise<number> {
  const linkCheck = validateMeetingLink(params.meetingLink);
  if (params.meetingLink.trim() && !linkCheck.valid) {
    throw new Error(linkCheck.error || 'Please enter a valid meeting URL.');
  }

  const cleanUrl = params.meetingLink.trim() ? linkCheck.normalizedUrl : '';
  const platform = linkCheck.platform;

  if (params.applyToSeries && params.scheduleGroupId) {
    const snap = await getDocs(
      query(collection(db, 'classSchedules'), where('scheduleGroupId', '==', params.scheduleGroupId))
    );
    if (!snap.empty) {
      const docs = snap.docs;
      for (let i = 0; i < docs.length; i += 300) {
        const chunk = docs.slice(i, i + 300);
        const batch = writeBatch(db);
        chunk.forEach((d) => {
          batch.update(doc(db, 'classSchedules', d.id), {
            meetingLink: cleanUrl,
            platform,
            updatedAt: serverTimestamp(),
            updatedByUid: params.actorUid || null,
            updatedByName: params.actorName || null,
            updatedByRole: params.actorRole || 'TUTOR',
          });
        });
        await batch.commit();
      }
      return docs.length;
    }
  }

  await updateDoc(doc(db, 'classSchedules', params.scheduleId), {
    meetingLink: cleanUrl,
    platform,
    updatedAt: serverTimestamp(),
    updatedByUid: params.actorUid || null,
    updatedByName: params.actorName || null,
    updatedByRole: params.actorRole || 'TUTOR',
  });
  return 1;
}

export const MeetingLinkValidation = {};
export const StudentEnrollmentContext = {};
export const SchoolProgramOption = {};
export const AuthorizedSchoolOption = {};
export const PrivateStudentOption = {};
export const TutorSchedulingScope = {};

export { CANONICAL_CLASSES, normalizeClassList, normalizeClassName };

