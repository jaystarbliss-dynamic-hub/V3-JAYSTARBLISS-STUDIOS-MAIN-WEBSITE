import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, limit, getDocs } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { Loader2 } from 'lucide-react';
import ChangePasswordModal from '../portal/ChangePasswordModal';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
  redirectPath?: string;
}

const blockedStatuses = ['banned', 'suspended', 'disabled'];
const adminRoles = [
  'SUPER_ADMIN', 
  'ADMIN', 
  'CMS_ADMIN', 
  'ACADEMIC_ADMIN', 
  'FINANCE_ADMIN', 
  'CONTENT_ADMIN', 
  'EDUCATION_ADMIN', 
  'SERVICES_ADMIN', 
  'MARKETING_ADMIN', 
  'SUPPORT_ADMIN'
];

const isSubAdminAllowedForPath = (role: string, pathname: string): boolean => {
  const norm = role.toUpperCase();
  if (norm === 'SUPER_ADMIN' || norm === 'ADMIN') return true;

  if (norm === 'CMS_ADMIN' || norm === 'CONTENT_ADMIN') {
    const cmsAllowed = ['/admin', '/admin/pages', '/admin/programs', '/admin/services', '/admin/portfolio', '/admin/kids-projects', '/admin/blog', '/admin/inquiries', '/admin/notifications'];
    return cmsAllowed.some(p => pathname === p || (pathname.startsWith(p) && p !== '/admin'));
  }

  if (norm === 'ACADEMIC_ADMIN' || norm === 'EDUCATION_ADMIN') {
    if (pathname.startsWith('/admin/billing') || pathname.startsWith('/admin/users') || pathname.startsWith('/admin/settings')) {
      return false;
    }
    const academicAllowed = ['/admin', '/admin/inquiries', '/admin/approvals', '/admin/students', '/admin/staff', '/admin/tutor-subjects', '/admin/schools', '/admin/schedules', '/admin/resources', '/admin/programs', '/admin/notifications'];
    return academicAllowed.some(p => pathname === p || (pathname.startsWith(p) && p !== '/admin'));
  }

  if (norm === 'FINANCE_ADMIN') {
    const financeAllowed = ['/admin', '/admin/billing', '/admin/approvals', '/admin/activity', '/admin/notifications'];
    return financeAllowed.some(p => pathname === p || (pathname.startsWith(p) && p !== '/admin'));
  }

  return true;
};

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles, redirectPath = '/portal' }) => {
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [mustResetPassword, setMustResetPassword] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const location = useLocation();
  const rolesKey = allowedRoles ? allowedRoles.slice().sort().join(',') : '';

  useEffect(() => {
    let mounted = true;
    const unsubscribe = onAuthStateChanged(auth, async currentUser => {
      if (!mounted) return;
      setLoading(true);
      setBlockedMessage(null);
      setIsAuthorized(false);
      try {
        if (!currentUser) return;
        let userSnap = await getDoc(doc(db, 'users', currentUser.uid));
        
        // Direct self-heal for known super admins / admin emails if user record is missing or not admin
        const isSuperAdminEmail = currentUser.email === 'johnrufai242@gmail.com' || currentUser.email === 'admin@jaystarbliss.com' || currentUser.email === 'admin@jaystarbliss-studios.name.ng';
        if (isSuperAdminEmail && (!userSnap.exists() || !adminRoles.includes(String(userSnap.data()?.role || '').toUpperCase()))) {
          try {
            await setDoc(doc(db, 'users', currentUser.uid), {
              uid: currentUser.uid,
              name: currentUser.displayName || 'Super Admin',
              fullName: currentUser.displayName || 'Super Admin',
              email: currentUser.email,
              role: 'SUPER_ADMIN',
              accountStatus: 'ACTIVE',
              status: 'ACTIVE',
              updatedAt: serverTimestamp()
            }, { merge: true });
            userSnap = await getDoc(doc(db, 'users', currentUser.uid));
          } catch (createErr) {
            console.warn('Super admin direct init error:', createErr);
          }
        }

        // Direct self-heal for school administrators if schoolId is missing
        if ((location.pathname.startsWith('/portal/school') || userSnap.data()?.role === 'SCHOOL') && (!userSnap.exists() || !userSnap.data()?.schoolId)) {
          try {
            const email = (currentUser.email || '').toLowerCase();
            const schoolQuery = query(collection(db, 'schools'), where('contactEmail', '==', email), limit(1));
            const schoolSnap = await getDocs(schoolQuery);
            if (!schoolSnap.empty) {
              const schDoc = schoolSnap.docs[0];
              await setDoc(doc(db, 'users', currentUser.uid), {
                uid: currentUser.uid,
                name: currentUser.displayName || schDoc.data().contactName || 'School Administrator',
                fullName: currentUser.displayName || schDoc.data().contactName || 'School Administrator',
                email,
                role: 'SCHOOL',
                schoolId: schDoc.id,
                schoolName: schDoc.data().name || '',
                accountStatus: 'ACTIVE',
                status: 'ACTIVE',
                updatedAt: serverTimestamp()
              }, { merge: true });
              userSnap = await getDoc(doc(db, 'users', currentUser.uid));
            }
          } catch (schErr) {
            console.warn('School admin direct link error:', schErr);
          }
        }

        // Direct self-heal for staff / tutor accounts ONLY if user is not already a Parent, Student, School, or Admin
        const cachedRole = (sessionStorage.getItem('userRole') || localStorage.getItem('jaystar_cached_user_role') || '').toLowerCase();
        const existingRoleUpper = String(userSnap.data()?.role || '').toUpperCase();
        const isProtectedNonStaffRole =
          adminRoles.includes(existingRoleUpper) ||
          ['PARENT', 'STUDENT', 'INDIVIDUAL_STUDENT', 'SCHOOL', 'SCHOOL_ADMIN'].includes(existingRoleUpper);

        let fallbackProfileData: Record<string, any> | null = null;

        if (!isProtectedNonStaffRole) {
          const userEmail = (currentUser.email || '').toLowerCase().trim();
          let isParentAccount = false;
          try {
            const parentDocSnap = await getDoc(doc(db, 'parents', currentUser.uid)).catch(() => null);
            if (parentDocSnap?.exists()) {
              isParentAccount = true;
            }
          } catch {}

          let isApprovedTutor = false;
          let tutorName = '';

          if (!isParentAccount) {
            try {
              const tutorDocSnap = await getDoc(doc(db, 'tutors', currentUser.uid)).catch(() => null);
              if (tutorDocSnap?.exists() && tutorDocSnap.data()?.status !== 'BANNED' && tutorDocSnap.data()?.status !== 'SUSPENDED') {
                isApprovedTutor = true;
                tutorName = tutorDocSnap.data()?.name || tutorDocSnap.data()?.fullName || '';
              }

              if (!isApprovedTutor) {
                const staffDocSnap = await getDoc(doc(db, 'staff', currentUser.uid)).catch(() => null);
                if (staffDocSnap?.exists() && staffDocSnap.data()?.status !== 'BANNED' && staffDocSnap.data()?.status !== 'SUSPENDED') {
                  isApprovedTutor = true;
                  tutorName = staffDocSnap.data()?.name || staffDocSnap.data()?.fullName || '';
                }
              }

              if (!isApprovedTutor && userEmail) {
                const tQuery = query(collection(db, 'tutors'), where('email', '==', userEmail), limit(1));
                const tSnap = await getDocs(tQuery).catch(() => null);
                if (tSnap && !tSnap.empty && tSnap.docs[0].data()?.status !== 'BANNED' && tSnap.docs[0].data()?.status !== 'SUSPENDED') {
                  isApprovedTutor = true;
                  tutorName = tSnap.docs[0].data()?.name || tSnap.docs[0].data()?.fullName || '';
                }
              }

              if (!isApprovedTutor && userEmail) {
                const sQuery = query(collection(db, 'staff'), where('email', '==', userEmail), limit(1));
                const sSnap = await getDocs(sQuery).catch(() => null);
                if (sSnap && !sSnap.empty && sSnap.docs[0].data()?.status !== 'BANNED' && sSnap.docs[0].data()?.status !== 'SUSPENDED') {
                  isApprovedTutor = true;
                  tutorName = sSnap.docs[0].data()?.name || sSnap.docs[0].data()?.fullName || '';
                }
              }

              if (!isApprovedTutor && userEmail) {
                const appQuery = query(collection(db, 'tutor_applications'), where('email', '==', userEmail), where('status', '==', 'approved'), limit(1));
                const appSnap = await getDocs(appQuery).catch(() => null);
                if (appSnap && !appSnap.empty) {
                  isApprovedTutor = true;
                  tutorName = appSnap.docs[0].data()?.name || '';
                }
              }
            } catch (tErr) {
              console.warn('Tutor self-heal verification notice:', tErr);
            }
          }

          if (isApprovedTutor && !isParentAccount) {
            const resolvedName = tutorName || userSnap.data()?.name || currentUser.displayName || 'Tutor';
            fallbackProfileData = {
              uid: currentUser.uid,
              name: resolvedName,
              fullName: resolvedName,
              email: userEmail,
              role: 'STAFF',
              accountStatus: 'ACTIVE',
              status: 'ACTIVE',
            };
            try {
              await setDoc(doc(db, 'users', currentUser.uid), {
                ...fallbackProfileData,
                updatedAt: serverTimestamp()
              }, { merge: true });
              await setDoc(doc(db, 'tutors', currentUser.uid), {
                role: 'staff',
                status: 'ACTIVE',
                email: userEmail,
                name: resolvedName,
                updatedAt: serverTimestamp()
              }, { merge: true });
              userSnap = await getDoc(doc(db, 'users', currentUser.uid)).catch(() => userSnap);
            } catch (healErr) {
              console.warn('Staff tutor self-heal write notice:', healErr);
            }
          }
        }

        // Direct self-heal for student accounts if user profile is missing or incomplete
        const isStudentContext =
          location.pathname.startsWith('/portal/student') ||
          cachedRole === 'student' ||
          (currentUser.email || '').toLowerCase().startsWith('student_') ||
          String(userSnap.data()?.role || '').toUpperCase() === 'STUDENT' ||
          String(userSnap.data()?.role || '').toUpperCase() === 'INDIVIDUAL_STUDENT';

        if (!userSnap.exists() || !userSnap.data()?.role || (isStudentContext && !userSnap.data()?.studentDocId)) {
          try {
            let matchedStudentDoc: { id: string; collectionName: 'individualStudents' | 'students'; data: Record<string, any> } | null = null;
            const candidateDocId = String(
              userSnap.data()?.studentDocId ||
              sessionStorage.getItem('studentDocId') ||
              localStorage.getItem('jaystar_cached_student_doc_id') ||
              ''
            ).trim();

            if (candidateDocId) {
              for (const colName of ['individualStudents', 'students'] as const) {
                const snap = await getDoc(doc(db, colName, candidateDocId));
                if (snap.exists()) {
                  matchedStudentDoc = { id: snap.id, collectionName: colName, data: snap.data() };
                  break;
                }
              }
            }

            if (!matchedStudentDoc) {
              for (const colName of ['individualStudents', 'students'] as const) {
                for (const uidField of ['firebaseUid', 'userId'] as const) {
                  const q = query(collection(db, colName), where(uidField, '==', currentUser.uid), limit(1));
                  const snap = await getDocs(q);
                  if (!snap.empty) {
                    matchedStudentDoc = { id: snap.docs[0].id, collectionName: colName, data: snap.docs[0].data() };
                    break;
                  }
                }
                if (matchedStudentDoc) break;
              }
            }

            if (!matchedStudentDoc) {
              const candidateUsername = String(
                userSnap.data()?.username ||
                sessionStorage.getItem('studentUsername') ||
                ''
              ).trim();
              if (candidateUsername) {
                const usernameVariants = Array.from(new Set([
                  candidateUsername,
                  candidateUsername.toUpperCase(),
                  candidateUsername.toLowerCase(),
                ]));
                for (const colName of ['individualStudents', 'students'] as const) {
                  for (const variant of usernameVariants) {
                    const q = query(collection(db, colName), where('username', '==', variant), limit(1));
                    const snap = await getDocs(q);
                    if (!snap.empty) {
                      matchedStudentDoc = { id: snap.docs[0].id, collectionName: colName, data: snap.docs[0].data() };
                      break;
                    }
                  }
                  if (matchedStudentDoc) break;
                }
              }
            }

            if (matchedStudentDoc || (isStudentContext && !userSnap.exists())) {
              const sData = matchedStudentDoc?.data || {};
              const resolvedName = String(
                sData.name ||
                sData.fullName ||
                userSnap.data()?.name ||
                currentUser.displayName ||
                sessionStorage.getItem('userName') ||
                localStorage.getItem('jaystar_cached_user_name') ||
                'Student'
              );
              const resolvedSchoolId = String(
                sData.schoolId ||
                sData.school_id ||
                userSnap.data()?.schoolId ||
                sessionStorage.getItem('schoolId') ||
                ''
              );
              const resolvedClass = String(
                sData.class ||
                sData.classLevel ||
                userSnap.data()?.class ||
                sessionStorage.getItem('studentClass') ||
                ''
              );
              const resolvedStudentDocId = String(
                matchedStudentDoc?.id ||
                candidateDocId ||
                ''
              );
              const resolvedUsername = String(
                sData.username ||
                userSnap.data()?.username ||
                sessionStorage.getItem('studentUsername') ||
                ''
              );

              const healedStudentProfile: Record<string, any> = {
                uid: currentUser.uid,
                name: resolvedName,
                fullName: resolvedName,
                email: currentUser.email || sData.email || sessionStorage.getItem('userEmail') || '',
                username: resolvedUsername,
                role: 'STUDENT',
                accountStatus: String(sData.accountStatus || sData.status || userSnap.data()?.accountStatus || 'ACTIVE').toUpperCase(),
                status: String(sData.status || sData.accountStatus || userSnap.data()?.status || 'ACTIVE').toUpperCase(),
                schoolId: resolvedSchoolId,
                schoolName: String(sData.schoolName || sData.school || userSnap.data()?.schoolName || ''),
                class: resolvedClass,
                studentDocId: resolvedStudentDocId,
                updatedAt: serverTimestamp(),
              };

              fallbackProfileData = healedStudentProfile;

              try {
                await setDoc(doc(db, 'users', currentUser.uid), healedStudentProfile, { merge: true });
                userSnap = await getDoc(doc(db, 'users', currentUser.uid));
              } catch (userHealErr) {
                console.warn('Student user profile self-heal write warning:', userHealErr);
              }

              if (matchedStudentDoc && matchedStudentDoc.data.firebaseUid !== currentUser.uid) {
                try {
                  await setDoc(doc(db, matchedStudentDoc.collectionName, matchedStudentDoc.id), {
                    firebaseUid: currentUser.uid,
                    userId: currentUser.uid,
                    portalAccessEnabled: true,
                    lastLoginAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                  }, { merge: true });
                } catch (studentLinkErr) {
                  console.warn('Student record UID link warning:', studentLinkErr);
                }
              }
            }
          } catch (studentHealErr) {
            console.warn('Student self-heal lookup warning:', studentHealErr);
          }
        }

        if (!userSnap.exists() && !fallbackProfileData) {
          await signOut(auth).catch(() => undefined);
          throw new Error('Authenticated user has no authoritative portal profile.');
        }

        let data: Record<string, any> = userSnap.exists()
          ? { ...(fallbackProfileData || {}), ...(userSnap.data() || {}) }
          : (fallbackProfileData || {});
        const accountStatus = String(data.accountStatus || data.status || 'ACTIVE').toUpperCase();
        if (blockedStatuses.includes(accountStatus.toLowerCase())) {
          if (mounted) setBlockedMessage(`Your account is currently ${accountStatus.toLowerCase()}. Please contact Jaystarbliss Studios support.`);
          await signOut(auth).catch(() => undefined);
          return;
        }

        let role = String(data.role || fallbackProfileData?.role || '').trim().toUpperCase();
        if (role === 'INDIVIDUAL_STUDENT') {
          role = 'STUDENT';
        }
        if (role === 'SCHOOL_ADMIN' || role === 'INSTITUTION') {
          role = 'SCHOOL';
        }

        // Check if active user is an Admin impersonating another role
        const isUserAdmin = adminRoles.includes(role) || currentUser.email === 'johnrufai242@gmail.com';
        const masqueradeRaw = sessionStorage.getItem('admin_masquerade');
        let masquerade: any = null;
        if (masqueradeRaw) {
          try {
            masquerade = JSON.parse(masqueradeRaw);
          } catch {
            masquerade = null;
          }
        }

        if (isUserAdmin && masquerade && masquerade.isMasquerading) {
          const targetRole = String(masquerade.targetRole || 'STUDENT').toUpperCase();
          const targetUser = masquerade.targetUser || {};
          const isAllowedForTarget = allowedRoles?.length
            ? allowedRoles.some(candidate => candidate.toUpperCase() === targetRole)
            : true;

          if (isAllowedForTarget) {
            sessionStorage.setItem('userRole', targetRole.toLowerCase());
            sessionStorage.setItem('userId', targetUser.uid || targetUser.id || currentUser.uid);
            sessionStorage.setItem('userEmail', targetUser.email || '');
            if (targetUser.name || targetUser.fullName) {
              sessionStorage.setItem('userName', String(targetUser.name || targetUser.fullName));
            }
            if (targetUser.schoolId) {
              sessionStorage.setItem('schoolId', String(targetUser.schoolId));
            }
            if (targetUser.studentDocId || targetUser.id) {
              sessionStorage.setItem('studentDocId', String(targetUser.studentDocId || targetUser.id));
            }
            if (targetUser.class || targetUser.classLevel) {
              sessionStorage.setItem('studentClass', String(targetUser.class || targetUser.classLevel));
            }
            if (mounted) {
              setIsAuthorized(true);
              setLoading(false);
            }
            return;
          }
        }

        // Direct fallback check if schoolId is still not populated
        if ((role === 'SCHOOL' || location.pathname.startsWith('/portal/school')) && !String(data.schoolId || '').trim()) {
          try {
            const email = (currentUser.email || data.email || '').toLowerCase();
            const schoolQuery = query(collection(db, 'schools'), where('contactEmail', '==', email), limit(1));
            const schoolSnap = await getDocs(schoolQuery);
            if (!schoolSnap.empty) {
              const schDoc = schoolSnap.docs[0];
              await setDoc(doc(db, 'users', currentUser.uid), {
                role: 'SCHOOL',
                schoolId: schDoc.id,
                schoolName: schDoc.data().name || '',
                updatedAt: serverTimestamp()
              }, { merge: true });
              data = { ...data, schoolId: schDoc.id, schoolName: schDoc.data().name || '' };
              role = 'SCHOOL';
            }
          } catch (repairError) {
            console.warn('School administrator link check:', repairError);
          }
        }

        if (!role) {
          await signOut(auth).catch(() => undefined);
          throw new Error('Authenticated user has no authoritative portal role.');
        }

        const allowed = allowedRoles?.length
          ? allowedRoles.some(candidate => candidate.toUpperCase() === role)
          : location.pathname.startsWith('/admin')
            ? (adminRoles.includes(role) && isSubAdminAllowedForPath(role, location.pathname))
            : true;

        if (!allowed) {
          if (mounted) setIsAuthorized(false);
          return;
        }

        sessionStorage.setItem('userRole', role.toLowerCase());
        sessionStorage.setItem('userId', currentUser.uid);
        sessionStorage.setItem('userEmail', currentUser.email || String(data.email || ''));
        if (data.name) sessionStorage.setItem('userName', String(data.name));
        if (data.schoolId) sessionStorage.setItem('schoolId', String(data.schoolId));
        if (data.studentDocId) {
          sessionStorage.setItem('studentDocId', String(data.studentDocId));
          localStorage.setItem('jaystar_cached_student_doc_id', String(data.studentDocId));
        }
        if (data.class) sessionStorage.setItem('studentClass', String(data.class));
        if (data.username) sessionStorage.setItem('studentUsername', String(data.username));
        localStorage.setItem('jaystar_cached_user_role', role.toLowerCase());
        localStorage.setItem('jaystar_cached_user_id', currentUser.uid);
        if (data.name) localStorage.setItem('jaystar_cached_user_name', String(data.name));

        if (data.forcePasswordReset === true && mounted) setMustResetPassword(true);
        if (mounted) setIsAuthorized(true);
      } catch (error) {
        console.error('Protected portal authorization failed:', error);
        if (mounted) setIsAuthorized(false);
      } finally {
        if (mounted) setLoading(false);
      }
    });
    return () => { mounted = false; unsubscribe(); };
  }, [rolesKey, location.pathname]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900"><Loader2 className="w-10 h-10 animate-spin text-brand-red" /></div>;

  if (!isAuthorized) {
    if (blockedMessage) return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950 p-6"><div className="max-w-md w-full rounded-2xl border border-red-200 dark:border-red-900/50 bg-white dark:bg-slate-900 p-7 text-center shadow-xl"><div className="mx-auto mb-4 w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/50 text-red-600 flex items-center justify-center font-black text-lg">!</div><h1 className="text-xl font-black text-gray-900 dark:text-white">Account access restricted</h1><p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{blockedMessage}</p></div></div>;
    return <Navigate to={redirectPath} replace />;
  }

  return <>{mustResetPassword && <ChangePasswordModal isOpen={true} isForced={true} onSuccess={() => setMustResetPassword(false)} />}{children}</>;
};

export default ProtectedRoute;
