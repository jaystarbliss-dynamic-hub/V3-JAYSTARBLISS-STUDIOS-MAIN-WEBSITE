import { auth } from '../lib/firebase';

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

export const startImpersonation = (
  target: ImpersonationTarget, 
  navigate: (path: string) => void
) => {
  let normRole = String(target.role || 'STUDENT').toUpperCase();
  if (normRole === 'TEACHER' || normRole === 'INSTRUCTOR') normRole = 'TUTOR';

  const masqueradeData = {
    isMasquerading: true,
    targetRole: normRole,
    targetUser: {
      ...target,
      name: target.name || target.fullName || target.email?.split('@')[0] || 'User'
    },
    startedAt: new Date().toISOString()
  };

  const targetUid = target.uid || target.id;
  const targetSchoolId = target.schoolId || (normRole === 'SCHOOL' ? targetUid : '');

  sessionStorage.setItem('admin_masquerade', JSON.stringify(masqueradeData));
  sessionStorage.setItem('userRole', normRole.toLowerCase());
  sessionStorage.setItem('userId', targetUid);
  sessionStorage.setItem('userEmail', target.email || '');
  sessionStorage.setItem('userName', target.name || target.fullName || 'User');
  if (targetSchoolId) sessionStorage.setItem('schoolId', targetSchoolId);
  if (target.studentDocId || target.id) sessionStorage.setItem('studentDocId', target.studentDocId || target.id);
  if (target.class || target.classLevel) sessionStorage.setItem('studentClass', target.class || target.classLevel || '');

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

export const stopImpersonation = (navigate: (path: string) => void) => {
  sessionStorage.removeItem('admin_masquerade');
  sessionStorage.setItem('userRole', 'admin');
  navigate('/admin');
};

export const getActiveImpersonation = () => {
  try {
    const raw = sessionStorage.getItem('admin_masquerade');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const isMasqueradingActive = (): boolean => {
  const imp = getActiveImpersonation();
  return Boolean(imp && imp.isMasquerading);
};

export const getEffectiveAuth = (): EffectiveAuthContext => {
  const imp = getActiveImpersonation();
  const currentAuthUser = auth.currentUser;

  if (imp && imp.isMasquerading) {
    const target = imp.targetUser || {};
    const normRole = String(imp.targetRole || 'STUDENT').toLowerCase();
    const effectiveUid = String(target.uid || target.id || sessionStorage.getItem('userId') || currentAuthUser?.uid || '');
    const effectiveSchoolId = String(
      target.schoolId || 
      (normRole === 'school' ? (target.id || target.uid || effectiveUid) : '') || 
      sessionStorage.getItem('schoolId') || 
      ''
    );
    const effectiveStudentDocId = String(target.studentDocId || target.id || sessionStorage.getItem('studentDocId') || '');
    const effectiveClass = String(target.class || target.classLevel || sessionStorage.getItem('studentClass') || '');
    const effectiveEmail = String(target.email || sessionStorage.getItem('userEmail') || currentAuthUser?.email || '');
    const effectiveName = String(target.name || target.fullName || sessionStorage.getItem('userName') || 'User');

    return {
      effectiveUid,
      effectiveEmail,
      effectiveName,
      effectiveRole: normRole,
      effectiveSchoolId,
      effectiveStudentDocId,
      effectiveClass,
      isMasquerading: true,
      canExecutePayments: false // Admins cannot make financial payments while impersonating
    };
  }

  const sessionRole = (sessionStorage.getItem('userRole') || 'student').toLowerCase();
  return {
    effectiveUid: sessionStorage.getItem('userId') || currentAuthUser?.uid || '',
    effectiveEmail: sessionStorage.getItem('userEmail') || currentAuthUser?.email || '',
    effectiveName: sessionStorage.getItem('userName') || currentAuthUser?.displayName || 'User',
    effectiveRole: sessionRole,
    effectiveSchoolId: sessionStorage.getItem('schoolId') || '',
    effectiveStudentDocId: sessionStorage.getItem('studentDocId') || '',
    effectiveClass: sessionStorage.getItem('studentClass') || '',
    isMasquerading: false,
    canExecutePayments: true
  };
};
