import { addDoc, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';

export interface ImpersonationTarget {
  id: string;
  uid?: string;
  name?: string;
  fullName?: string;
  email?: string;
  role: 'STUDENT' | 'TUTOR' | 'STAFF' | 'SCHOOL' | 'PARENT' | 'USER' | string;
  schoolId?: string;
  studentDocId?: string;
  class?: string;
  classLevel?: string;
  phone?: string;
  schoolName?: string;
}

export interface SupportAccessOptions {
  reason?: string;
  durationMinutes?: number;
  reauthVerifiedAt?: string;
  isAuditedSupportSession?: boolean;
}

export interface ActiveImpersonationRecord {
  isMasquerading: boolean;
  targetRole: string;
  targetUser: ImpersonationTarget & { name: string };
  startedAt: string;
  expiresAt: string;
  durationMinutes: number;
  reason?: string;
  reauthVerifiedAt?: string;
  isAuditedSupportSession?: boolean;
  supportLogId?: string | null;
  actorUid?: string;
  actorEmail?: string;
}

export interface EffectiveAuthContext {
  effectiveUid: string;
  effectiveEmail: string;
  effectiveName: string;
  effectiveRole: string;
  effectiveSchoolId: string;
  effectiveStudentDocId: string;
  effectiveClass: string;
  isMasquerading: boolean;
  canExecutePayments: boolean;
}

const DEFAULT_SUPPORT_DURATION_MINUTES = 30;

export const clearRoleSpecificSessionKeys = () => {
  const sessionKeysToClear = [
    'studentClass',
    'studentUsername',
    'studentDocId',
    'studentName',
    'studentSchoolName',
    'studentRegistrationType',
    'studentRegistrationSource',
    'studentDeliveryMode',
    'studentEdClubEnabled',
    'studentParentId',
    'parentId',
    'schoolId',
    'schoolDocId',
    'schoolName',
    'institutionName',
    'forcePasswordReset',
    'mustResetPassword',
  ];
  for (const key of sessionKeysToClear) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // ignore storage errors
    }
  }
  try {
    localStorage.removeItem('jaystar_cached_student_doc_id');
    for (const storage of [sessionStorage, localStorage]) {
      const toRemove: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (
          k &&
          (k.startsWith('jaystar_portal_swr_v2::') ||
            k.startsWith('jaystar_entitlement_v2_') ||
            k.startsWith('jaystar_auth_guard_v2_'))
        ) {
          toRemove.push(k);
        }
      }
      toRemove.forEach((k) => storage.removeItem(k));
    }
  } catch {
    // ignore storage errors
  }
};

export const startImpersonation = (
  target: ImpersonationTarget,
  navigate: (path: string) => void,
  options?: SupportAccessOptions
) => {
  let normRole = String(target.role || 'STUDENT').toUpperCase();
  if (normRole === 'TEACHER' || normRole === 'INSTRUCTOR') normRole = 'TUTOR';
  if (normRole === 'SCHOOL_ADMIN' || normRole === 'PARTNER_SCHOOL' || normRole === 'INSTITUTION') {
    normRole = 'SCHOOL';
  }
  if (normRole === 'INDIVIDUAL_STUDENT') {
    normRole = 'STUDENT';
  }

  // Always wipe any stale role-specific keys from prior sessions before starting a new support/impersonation session
  clearRoleSpecificSessionKeys();

  const durationMinutes = Math.max(
    5,
    Math.min(120, Number(options?.durationMinutes || DEFAULT_SUPPORT_DURATION_MINUTES))
  );
  const now = new Date();
  const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000).toISOString();
  const actor = auth.currentUser;

  const cleanTarget: ImpersonationTarget & { name: string } = {
    id: target.id,
    uid: target.uid || target.id,
    name: target.name || target.fullName || target.email?.split('@')[0] || 'User',
    fullName: target.fullName || target.name || target.email?.split('@')[0] || 'User',
    email: target.email || '',
    role: normRole,
    phone: target.phone || '',
    ...(normRole === 'SCHOOL'
      ? {
          schoolId: target.schoolId || target.id || target.uid || '',
          schoolName: target.schoolName || target.name || target.fullName || '',
        }
      : {}),
    ...(normRole === 'STUDENT'
      ? {
          studentDocId: target.studentDocId || target.id || '',
          class: target.class || target.classLevel || '',
          classLevel: target.classLevel || target.class || '',
          schoolId: target.schoolId || '',
          schoolName: target.schoolName || '',
        }
      : {}),
  };

  const masqueradeData: ActiveImpersonationRecord = {
    isMasquerading: true,
    targetRole: normRole,
    targetUser: cleanTarget,
    startedAt: now.toISOString(),
    expiresAt,
    durationMinutes,
    reason: options?.reason?.trim() || undefined,
    reauthVerifiedAt: options?.reauthVerifiedAt || undefined,
    isAuditedSupportSession: Boolean(options?.isAuditedSupportSession || normRole === 'SCHOOL'),
    supportLogId: null,
    actorUid: actor?.uid || '',
    actorEmail: actor?.email || '',
  };

  const targetUid = cleanTarget.uid || cleanTarget.id;
  const targetSchoolId =
    normRole === 'SCHOOL'
      ? cleanTarget.schoolId || cleanTarget.id || targetUid
      : normRole === 'STUDENT'
      ? cleanTarget.schoolId || ''
      : '';

  sessionStorage.setItem('admin_masquerade', JSON.stringify(masqueradeData));
  sessionStorage.setItem('userRole', normRole.toLowerCase());
  sessionStorage.setItem('userId', targetUid);
  sessionStorage.setItem('userEmail', cleanTarget.email || '');
  sessionStorage.setItem('userName', cleanTarget.name);

  if (normRole === 'SCHOOL') {
    if (targetSchoolId) {
      sessionStorage.setItem('schoolId', targetSchoolId);
      sessionStorage.setItem('schoolDocId', targetSchoolId);
    }
    if (cleanTarget.schoolName || cleanTarget.name) {
      sessionStorage.setItem('schoolName', cleanTarget.schoolName || cleanTarget.name);
    }
  } else if (normRole === 'STUDENT') {
    if (targetSchoolId) sessionStorage.setItem('schoolId', targetSchoolId);
    if (cleanTarget.schoolName) sessionStorage.setItem('studentSchoolName', cleanTarget.schoolName);
    if (cleanTarget.studentDocId) {
      sessionStorage.setItem('studentDocId', cleanTarget.studentDocId);
    }
    if (cleanTarget.class) {
      sessionStorage.setItem('studentClass', cleanTarget.class);
    }
  }

  // Record immutable support-access audit entry asynchronously
  if (actor) {
    const auditPayload = {
      action: normRole === 'SCHOOL' ? 'SCHOOL_SUPPORT_ACCESS_STARTED' : 'PORTAL_IMPERSONATION_STARTED',
      actorUid: actor.uid,
      actorEmail: actor.email || '',
      targetRole: normRole,
      targetUid,
      targetName: masqueradeData.targetUser.name,
      targetEmail: cleanTarget.email || '',
      targetSchoolId: targetSchoolId || null,
      targetSchoolName: cleanTarget.schoolName || (normRole === 'SCHOOL' ? masqueradeData.targetUser.name : null),
      reason: masqueradeData.reason || 'Administrative portal review',
      reauthVerifiedAt: masqueradeData.reauthVerifiedAt || null,
      durationMinutes,
      startedAt: now.toISOString(),
      expiresAt,
      endedAt: null,
      status: 'ACTIVE',
      createdAt: serverTimestamp(),
    };

    void addDoc(collection(db, 'adminSupportAccessLogs'), auditPayload)
      .then((docRef) => {
        try {
          const latest = sessionStorage.getItem('admin_masquerade');
          if (latest) {
            const parsed = JSON.parse(latest);
            if (parsed?.startedAt === masqueradeData.startedAt) {
              parsed.supportLogId = docRef.id;
              sessionStorage.setItem('admin_masquerade', JSON.stringify(parsed));
            }
          }
        } catch {
          // ignore storage update errors
        }
      })
      .catch(() => {
        // Fallback audit record in adminAuditLogs if support collection rules aren't deployed yet
        void addDoc(collection(db, 'adminAuditLogs'), auditPayload).catch(() => undefined);
      });
  }

  // Route to the appropriate portal
  if (normRole.includes('ADMIN')) {
    navigate('/admin');
  } else if (normRole === 'STUDENT') {
    navigate('/portal/student');
  } else if (normRole === 'TUTOR' || normRole === 'STAFF') {
    navigate('/portal/staff');
  } else if (normRole === 'SCHOOL') {
    navigate('/portal/school');
  } else if (normRole === 'PARENT') {
    navigate('/portal/parent');
  } else {
    navigate('/portal/student');
  }
};

export const stopImpersonation = (navigate: (path: string) => void, endReason = 'MANUAL_EXIT') => {
  const existing = getActiveImpersonationRaw();
  if (existing?.supportLogId) {
    void updateDoc(doc(db, 'adminSupportAccessLogs', existing.supportLogId), {
      status: endReason === 'EXPIRED' ? 'EXPIRED' : 'ENDED',
      endedAt: new Date().toISOString(),
      endReason,
      updatedAt: serverTimestamp(),
    }).catch(() => undefined);
  }
  clearRoleSpecificSessionKeys();
  sessionStorage.removeItem('admin_masquerade');
  sessionStorage.setItem('userRole', 'admin');
  if (auth.currentUser) {
    sessionStorage.setItem('userId', auth.currentUser.uid);
    sessionStorage.setItem('userEmail', auth.currentUser.email || '');
    sessionStorage.setItem('userName', auth.currentUser.displayName || 'Super Admin');
  }
  navigate('/admin');
};

const getActiveImpersonationRaw = (): ActiveImpersonationRecord | null => {
  try {
    const raw = sessionStorage.getItem('admin_masquerade');
    if (!raw) return null;
    return JSON.parse(raw) as ActiveImpersonationRecord;
  } catch {
    return null;
  }
};

export const getActiveImpersonation = (): ActiveImpersonationRecord | null => {
  const parsed = getActiveImpersonationRaw();
  if (!parsed || !parsed.isMasquerading) return null;
  if (parsed.expiresAt) {
    const expiresMs = new Date(parsed.expiresAt).getTime();
    if (!Number.isNaN(expiresMs) && Date.now() > expiresMs) {
      if (parsed.supportLogId) {
        void updateDoc(doc(db, 'adminSupportAccessLogs', parsed.supportLogId), {
          status: 'EXPIRED',
          endedAt: new Date().toISOString(),
          endReason: 'TIME_LIMIT_EXPIRED',
          updatedAt: serverTimestamp(),
        }).catch(() => undefined);
      }
      clearRoleSpecificSessionKeys();
      sessionStorage.removeItem('admin_masquerade');
      sessionStorage.setItem('userRole', 'admin');
      return null;
    }
  }
  return parsed;
};

export const isMasqueradingActive = (): boolean => {
  const imp = getActiveImpersonation();
  return Boolean(imp && imp.isMasquerading);
};

export const getEffectiveAuth = (): EffectiveAuthContext => {
  const imp = getActiveImpersonation();
  const currentAuthUser = auth.currentUser;

  if (imp && imp.isMasquerading) {
    const target = imp.targetUser || ({} as ImpersonationTarget);
    const normRole = String(imp.targetRole || 'STUDENT').toLowerCase();
    const effectiveUid = String(target.uid || target.id || '');
    const effectiveSchoolId =
      normRole === 'school'
        ? String(target.schoolId || target.id || target.uid || '')
        : normRole === 'student'
        ? String(target.schoolId || '')
        : '';
    const effectiveStudentDocId =
      normRole === 'student' ? String(target.studentDocId || target.id || '') : '';
    const effectiveClass =
      normRole === 'student' ? String(target.class || target.classLevel || '') : '';
    const effectiveEmail = String(target.email || '');
    const effectiveName = String(target.name || target.fullName || 'User');

    return {
      effectiveUid,
      effectiveEmail,
      effectiveName,
      effectiveRole: normRole,
      effectiveSchoolId,
      effectiveStudentDocId,
      effectiveClass,
      isMasquerading: true,
      canExecutePayments: false,
    };
  }

  const sessionRole = (sessionStorage.getItem('userRole') || 'student').toLowerCase();
  const isStudentRole = sessionRole === 'student';
  const isSchoolRole = sessionRole === 'school';
  return {
    effectiveUid: sessionStorage.getItem('userId') || currentAuthUser?.uid || '',
    effectiveEmail: sessionStorage.getItem('userEmail') || currentAuthUser?.email || '',
    effectiveName: sessionStorage.getItem('userName') || currentAuthUser?.displayName || 'User',
    effectiveRole: sessionRole,
    effectiveSchoolId:
      isSchoolRole || isStudentRole ? sessionStorage.getItem('schoolId') || '' : '',
    effectiveStudentDocId: isStudentRole ? sessionStorage.getItem('studentDocId') || '' : '',
    effectiveClass: isStudentRole ? sessionStorage.getItem('studentClass') || '' : '',
    isMasquerading: false,
    canExecutePayments: true,
  };
};
