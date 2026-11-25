import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, deleteField, serverTimestamp, collection, query, where, limit, getDocs } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import BrandLoader from '../ui/BrandLoader';
import ChangePasswordModal from '../portal/ChangePasswordModal';
import { reconcileParentAndChildrenAccount } from '../../lib/usernameRegistry';
import { clearRoleSpecificSessionKeys, getActiveImpersonation } from '../../utils/impersonation';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
  redirectPath?: string;
}

import { ADMIN_ROLE_LIST, isSubAdminAllowedForPath } from '../../utils/adminRbac';

const blockedStatuses = ['banned', 'suspended', 'disabled'];
const adminRoles: readonly string[] = ADMIN_ROLE_LIST;

interface VerifiedSessionIdentity {
  uid: string;
  role: string;
  mustResetPassword: boolean;
  masqueradeKey: string;
  verifiedAt: number;
}

let inMemoryVerifiedIdentity: VerifiedSessionIdentity | null = null;

function buildMasqueradeKey(): string {
  const imp = getActiveImpersonation();
  if (!imp || !imp.isMasquerading) return 'self';
  const target = imp.targetUser || ({} as any);
  return `masq_${String(imp.targetRole || '').toUpperCase()}_${String(target.uid || target.id || '')}_${String(target.schoolId || '')}`;
}

function getCachedSessionIdentity(uid: string): VerifiedSessionIdentity | null {
  if (!uid) return null;
  const masqKey = buildMasqueradeKey();
  if (
    inMemoryVerifiedIdentity &&
    inMemoryVerifiedIdentity.uid === uid &&
    inMemoryVerifiedIdentity.masqueradeKey === masqKey
  ) {
    return inMemoryVerifiedIdentity;
  }
  try {
    const raw = sessionStorage.getItem(`jaystar_auth_guard_v2_${uid}_${masqKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as VerifiedSessionIdentity;
    if (parsed && parsed.uid === uid && parsed.role && parsed.masqueradeKey === masqKey) {
      inMemoryVerifiedIdentity = parsed;
      return parsed;
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

function setCachedSessionIdentity(identity: VerifiedSessionIdentity): void {
  inMemoryVerifiedIdentity = identity;
  try {
    sessionStorage.setItem(
      `jaystar_auth_guard_v2_${identity.uid}_${identity.masqueradeKey}`,
      JSON.stringify(identity)
    );
  } catch {
    // ignore storage errors
  }
}

function checkRoleAllowedForRoute(
  role: string,
  allowedRoles: string[] | undefined,
  pathname: string
): boolean {
  const upperRole = String(role || '').toUpperCase();
  if (!upperRole) return false;
  if (allowedRoles && allowedRoles.length > 0) {
    return allowedRoles.some((candidate) => candidate.toUpperCase() === upperRole);
  }
  if (pathname.startsWith('/admin')) {
    return adminRoles.includes(upperRole) && isSubAdminAllowedForPath(upperRole, pathname);
  }
  return true;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles, redirectPath = '/portal' }) => {
  const location = useLocation();
  const rolesKey = allowedRoles ? allowedRoles.slice().sort().join(',') : '';

  const initialCached = auth.currentUser ? getCachedSessionIdentity(auth.currentUser.uid) : null;
  const initialAllowed = initialCached
    ? checkRoleAllowedForRoute(initialCached.role, allowedRoles, location.pathname)
    : false;

  const [loading, setLoading] = useState<boolean>(() => !initialCached);
  const [verifiedRole, setVerifiedRole] = useState<string>(() => initialCached?.role || '');
  const [isAuthorized, setIsAuthorized] = useState<boolean>(() => initialAllowed);
  const [mustResetPassword, setMustResetPassword] = useState<boolean>(
    () => Boolean(initialCached?.mustResetPassword)
  );
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [unauthorizedRedirect, setUnauthorizedRedirect] = useState<string>(redirectPath);

  // Synchronously evaluate route & role changes when identity is already verified in this session
  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    const cached = getCachedSessionIdentity(currentUser.uid);
    if (!cached) return;

    const allowed = checkRoleAllowedForRoute(cached.role, allowedRoles, location.pathname);
    setVerifiedRole(cached.role);
    setMustResetPassword(cached.mustResetPassword);

    if (!allowed) {
      if (
        location.pathname.startsWith('/admin') &&
        location.pathname !== '/admin' &&
        adminRoles.includes(cached.role)
      ) {
        setUnauthorizedRedirect('/admin');
      } else {
        setUnauthorizedRedirect(redirectPath);
      }
      setIsAuthorized(false);
    } else {
      setIsAuthorized(true);
    }
    setLoading(false);
  }, [rolesKey, location.pathname, redirectPath, verifiedRole]);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | null = null;

    const init = async () => {
      try {
        if (typeof (auth as any).authStateReady === 'function') {
          await (auth as any).authStateReady();
        }
      } catch {
        // Proceed with onAuthStateChanged
      }
      if (!mounted) return;
      unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
        if (!mounted) return;
        if (!currentUser) {
          inMemoryVerifiedIdentity = null;
          setVerifiedRole('');
          setIsAuthorized(false);
          setLoading(false);
          return;
        }

        // Fast-path: If this user + masquerade state has already been verified during the current session,
        // evaluate authorization synchronously without flashing BrandLoader or unmounting PortalLayout.
        const existingIdentity = getCachedSessionIdentity(currentUser.uid);
        if (existingIdentity) {
          const allowed = checkRoleAllowedForRoute(
            existingIdentity.role,
            allowedRoles,
            location.pathname
          );
          if (mounted) {
            setVerifiedRole(existingIdentity.role);
            setMustResetPassword(existingIdentity.mustResetPassword);
            if (!allowed) {
              if (
                location.pathname.startsWith('/admin') &&
                location.pathname !== '/admin' &&
                adminRoles.includes(existingIdentity.role)
              ) {
                setUnauthorizedRedirect('/admin');
              } else {
                setUnauthorizedRedirect(redirectPath);
              }
              setIsAuthorized(false);
            } else {
              setIsAuthorized(true);
            }
            setLoading(false);
          }
          return;
        }

        setLoading(true);
        setBlockedMessage(null);
        setIsAuthorized(false);
        try {
          let userSnap = await getDoc(doc(db, 'users', currentUser.uid));

          // Direct self-heal & contamination scrubber for known super admins / admin accounts
          const isSuperAdminEmail =
            currentUser.email === 'johnrufai242@gmail.com' ||
            currentUser.email === 'admin@jaystarbliss.com' ||
            currentUser.email === 'admin@jaystarbliss-studios.name.ng';
          const currentDocData = userSnap.exists() ? userSnap.data() || {} : {};
          const isDocAdminRole = adminRoles.includes(String(currentDocData.role || '').toUpperCase());
          const hasContaminatedAdminFields = Boolean(
            currentDocData.studentDocId ||
              currentDocData.class ||
              currentDocData.classLevel ||
              currentDocData.username ||
              currentDocData.schoolId ||
              currentDocData.schoolName
          );

          if (
            isSuperAdminEmail &&
            (!userSnap.exists() || !isDocAdminRole || hasContaminatedAdminFields)
          ) {
            try {
              const pollutedStudentId = String(currentDocData.studentDocId || '').trim();
              await setDoc(
                doc(db, 'users', currentUser.uid),
                {
                  uid: currentUser.uid,
                  name: currentUser.displayName || 'Super Admin',
                  fullName: currentUser.displayName || 'Super Admin',
                  email: currentUser.email,
                  role: 'SUPER_ADMIN',
                  accountStatus: 'ACTIVE',
                  status: 'ACTIVE',
                  studentDocId: deleteField(),
                  class: deleteField(),
                  classLevel: deleteField(),
                  username: deleteField(),
                  schoolId: deleteField(),
                  schoolName: deleteField(),
                  updatedAt: serverTimestamp(),
                },
                { merge: true }
              );
              localStorage.removeItem('jaystar_cached_student_doc_id');

              if (pollutedStudentId) {
                for (const colName of ['individualStudents', 'students'] as const) {
                  const sRef = doc(db, colName, pollutedStudentId);
                  const sSnap = await getDoc(sRef).catch(() => null);
                  if (sSnap?.exists() && sSnap.data()?.firebaseUid === currentUser.uid) {
                    await setDoc(
                      sRef,
                      {
                        firebaseUid: deleteField(),
                        userId: deleteField(),
                      },
                      { merge: true }
                    ).catch(() => undefined);
                  }
                }
              }

              userSnap = await getDoc(doc(db, 'users', currentUser.uid));
            } catch (createErr) {
              console.warn('Super admin direct init error:', createErr);
            }
          }

          // CRITICAL: Check active Admin Support / Impersonation Session BEFORE any self-heal logic!
          const activeMasquerade = getActiveImpersonation();
          const isAuthenticatedAdmin =
            isSuperAdminEmail ||
            adminRoles.includes(String(userSnap.data()?.role || '').toUpperCase());

          if (isAuthenticatedAdmin && activeMasquerade && activeMasquerade.isMasquerading) {
            const targetRole = String(activeMasquerade.targetRole || 'STUDENT').toUpperCase();
            const targetUser = activeMasquerade.targetUser || ({} as any);
            const isAllowedForTarget = checkRoleAllowedForRoute(
              targetRole,
              allowedRoles,
              location.pathname
            );

            sessionStorage.setItem('userRole', targetRole.toLowerCase());
            sessionStorage.setItem('userId', String(targetUser.uid || targetUser.id || ''));
            sessionStorage.setItem('userEmail', String(targetUser.email || ''));
            if (targetUser.name || targetUser.fullName) {
              sessionStorage.setItem('userName', String(targetUser.name || targetUser.fullName));
            }
            if (targetRole === 'SCHOOL') {
              const sId = String(targetUser.schoolId || targetUser.id || targetUser.uid || '');
              if (sId) {
                sessionStorage.setItem('schoolId', sId);
                sessionStorage.setItem('schoolDocId', sId);
              }
              if (targetUser.schoolName || targetUser.name) {
                sessionStorage.setItem('schoolName', String(targetUser.schoolName || targetUser.name));
              }
            } else if (targetRole === 'STUDENT') {
              if (targetUser.schoolId) {
                sessionStorage.setItem('schoolId', String(targetUser.schoolId));
              }
              if (targetUser.schoolName) {
                sessionStorage.setItem('studentSchoolName', String(targetUser.schoolName));
              }
              if (targetUser.studentDocId || targetUser.id) {
                sessionStorage.setItem('studentDocId', String(targetUser.studentDocId || targetUser.id));
              }
              if (targetUser.class || targetUser.classLevel) {
                sessionStorage.setItem('studentClass', String(targetUser.class || targetUser.classLevel));
              }
            }

            setCachedSessionIdentity({
              uid: currentUser.uid,
              role: targetRole,
              mustResetPassword: false,
              masqueradeKey: buildMasqueradeKey(),
              verifiedAt: Date.now(),
            });

            if (mounted) {
              setVerifiedRole(targetRole);
              setMustResetPassword(false);
              if (!isAllowedForTarget && location.pathname.startsWith('/admin') && adminRoles.includes(targetRole)) {
                setUnauthorizedRedirect('/admin');
                setIsAuthorized(false);
              } else {
                setIsAuthorized(isAllowedForTarget);
              }
              setLoading(false);
            }
            return;
          }

          // Direct self-heal for school administrators if schoolId is missing (ONLY for non-admin accounts)
          if (
            !isAuthenticatedAdmin &&
            (location.pathname.startsWith('/portal/school') || userSnap.data()?.role === 'SCHOOL') &&
            (!userSnap.exists() || !userSnap.data()?.schoolId)
          ) {
            try {
              const email = (currentUser.email || '').toLowerCase();
              const schoolQuery = query(collection(db, 'schools'), where('contactEmail', '==', email), limit(1));
              const schoolSnap = await getDocs(schoolQuery);
              if (!schoolSnap.empty) {
                const schDoc = schoolSnap.docs[0];
                await setDoc(
                  doc(db, 'users', currentUser.uid),
                  {
                    uid: currentUser.uid,
                    name: currentUser.displayName || schDoc.data().contactName || 'School Administrator',
                    fullName: currentUser.displayName || schDoc.data().contactName || 'School Administrator',
                    email,
                    role: 'SCHOOL',
                    schoolId: schDoc.id,
                    schoolName: schDoc.data().name || '',
                    accountStatus: 'ACTIVE',
                    status: 'ACTIVE',
                    updatedAt: serverTimestamp(),
                  },
                  { merge: true }
                );
                userSnap = await getDoc(doc(db, 'users', currentUser.uid));
              }
            } catch (schErr) {
              console.warn('School admin direct link error:', schErr);
            }
          }

          // Direct self-heal for Parent accounts & parent-child links
          const cachedRole = (
            sessionStorage.getItem('userRole') ||
            localStorage.getItem('jaystar_cached_user_role') ||
            ''
          ).toLowerCase();
          let existingRoleUpper = String(userSnap.data()?.role || '').toUpperCase();

          if (
            !adminRoles.includes(existingRoleUpper) &&
            !['SCHOOL', 'SCHOOL_ADMIN', 'STUDENT', 'INDIVIDUAL_STUDENT'].includes(existingRoleUpper)
          ) {
            try {
              const parentReconcile = await reconcileParentAndChildrenAccount(
                currentUser.uid,
                currentUser.email,
                userSnap.data()?.fullName || userSnap.data()?.name || currentUser.displayName
              );
              if (parentReconcile.isParent) {
                existingRoleUpper = 'PARENT';
                sessionStorage.setItem('userRole', 'parent');
                localStorage.setItem('jaystar_cached_user_role', 'parent');
                userSnap = await getDoc(doc(db, 'users', currentUser.uid)).catch(() => userSnap);
              }
            } catch (pErr) {
              console.warn('Parent reconciliation check notice:', pErr);
            }
          }

          // Direct self-heal for staff / tutor accounts ONLY if user is not already a Parent, Student, School, or Admin
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
                if (
                  tutorDocSnap?.exists() &&
                  tutorDocSnap.data()?.status !== 'BANNED' &&
                  tutorDocSnap.data()?.status !== 'SUSPENDED'
                ) {
                  isApprovedTutor = true;
                  tutorName = tutorDocSnap.data()?.name || tutorDocSnap.data()?.fullName || '';
                }

                if (!isApprovedTutor) {
                  const staffDocSnap = await getDoc(doc(db, 'staff', currentUser.uid)).catch(() => null);
                  if (
                    staffDocSnap?.exists() &&
                    staffDocSnap.data()?.status !== 'BANNED' &&
                    staffDocSnap.data()?.status !== 'SUSPENDED'
                  ) {
                    isApprovedTutor = true;
                    tutorName = staffDocSnap.data()?.name || staffDocSnap.data()?.fullName || '';
                  }
                }

                if (!isApprovedTutor && userEmail) {
                  const tQuery = query(collection(db, 'tutors'), where('email', '==', userEmail), limit(1));
                  const tSnap = await getDocs(tQuery).catch(() => null);
                  if (
                    tSnap &&
                    !tSnap.empty &&
                    tSnap.docs[0].data()?.status !== 'BANNED' &&
                    tSnap.docs[0].data()?.status !== 'SUSPENDED'
                  ) {
                    isApprovedTutor = true;
                    tutorName = tSnap.docs[0].data()?.name || tSnap.docs[0].data()?.fullName || '';
                  }
                }

                if (!isApprovedTutor && userEmail) {
                  const sQuery = query(collection(db, 'staff'), where('email', '==', userEmail), limit(1));
                  const sSnap = await getDocs(sQuery).catch(() => null);
                  if (
                    sSnap &&
                    !sSnap.empty &&
                    sSnap.docs[0].data()?.status !== 'BANNED' &&
                    sSnap.docs[0].data()?.status !== 'SUSPENDED'
                  ) {
                    isApprovedTutor = true;
                    tutorName = sSnap.docs[0].data()?.name || sSnap.docs[0].data()?.fullName || '';
                  }
                }

                if (!isApprovedTutor && userEmail) {
                  const appQuery = query(
                    collection(db, 'tutor_applications'),
                    where('email', '==', userEmail),
                    where('status', '==', 'approved'),
                    limit(1)
                  );
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
                await setDoc(
                  doc(db, 'users', currentUser.uid),
                  {
                    ...fallbackProfileData,
                    updatedAt: serverTimestamp(),
                  },
                  { merge: true }
                );
                await setDoc(
                  doc(db, 'tutors', currentUser.uid),
                  {
                    role: 'staff',
                    status: 'ACTIVE',
                    email: userEmail,
                    name: resolvedName,
                    updatedAt: serverTimestamp(),
                  },
                  { merge: true }
                );
                userSnap = await getDoc(doc(db, 'users', currentUser.uid)).catch(() => userSnap);
              } catch (healErr) {
                console.warn('Staff tutor self-heal write notice:', healErr);
              }
            }
          }

          // Direct self-heal for student accounts if user profile is missing or incomplete
          const isStudentContext =
            !isAuthenticatedAdmin &&
            (location.pathname.startsWith('/portal/student') ||
              cachedRole === 'student' ||
              (currentUser.email || '').toLowerCase().startsWith('student_') ||
              String(userSnap.data()?.role || '').toUpperCase() === 'STUDENT' ||
              String(userSnap.data()?.role || '').toUpperCase() === 'INDIVIDUAL_STUDENT');

          if (
            !isAuthenticatedAdmin &&
            (!userSnap.exists() || !userSnap.data()?.role || (isStudentContext && !userSnap.data()?.studentDocId))
          ) {
            try {
              let matchedStudentDoc: {
                id: string;
                collectionName: 'individualStudents' | 'students';
                data: Record<string, any>;
              } | null = null;
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
                      matchedStudentDoc = {
                        id: snap.docs[0].id,
                        collectionName: colName,
                        data: snap.docs[0].data(),
                      };
                      break;
                    }
                  }
                  if (matchedStudentDoc) break;
                }
              }

              if (!matchedStudentDoc) {
                const candidateUsername = String(
                  userSnap.data()?.username || sessionStorage.getItem('studentUsername') || ''
                ).trim();
                if (candidateUsername) {
                  const usernameVariants = Array.from(
                    new Set([
                      candidateUsername,
                      candidateUsername.toUpperCase(),
                      candidateUsername.toLowerCase(),
                    ])
                  );
                  for (const colName of ['individualStudents', 'students'] as const) {
                    for (const variant of usernameVariants) {
                      const q = query(collection(db, colName), where('username', '==', variant), limit(5));
                      const snap = await getDocs(q);
                      if (!snap.empty) {
                        const safeDoc = snap.docs.find((d) => {
                          const dUid = String(d.data()?.firebaseUid || d.data()?.userId || '').trim();
                          return !dUid || dUid === currentUser.uid;
                        });
                        if (safeDoc) {
                          matchedStudentDoc = {
                            id: safeDoc.id,
                            collectionName: colName,
                            data: safeDoc.data(),
                          };
                          break;
                        }
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
                const resolvedStudentDocId = String(matchedStudentDoc?.id || candidateDocId || '');
                const resolvedUsername = String(
                  sData.username || userSnap.data()?.username || sessionStorage.getItem('studentUsername') || ''
                );

                const healedStudentProfile: Record<string, any> = {
                  uid: currentUser.uid,
                  name: resolvedName,
                  fullName: resolvedName,
                  email: currentUser.email || sData.email || sessionStorage.getItem('userEmail') || '',
                  username: resolvedUsername,
                  role: 'STUDENT',
                  accountStatus: String(
                    sData.accountStatus || sData.status || userSnap.data()?.accountStatus || 'ACTIVE'
                  ).toUpperCase(),
                  status: String(
                    sData.status || sData.accountStatus || userSnap.data()?.status || 'ACTIVE'
                  ).toUpperCase(),
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
                    await setDoc(
                      doc(db, matchedStudentDoc.collectionName, matchedStudentDoc.id),
                      {
                        firebaseUid: currentUser.uid,
                        userId: currentUser.uid,
                        portalAccessEnabled: true,
                        lastLoginAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                      },
                      { merge: true }
                    );
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
            : fallbackProfileData || {};
          const accountStatus = String(data.accountStatus || data.status || 'ACTIVE').toUpperCase();
          if (blockedStatuses.includes(accountStatus.toLowerCase())) {
            if (mounted)
              setBlockedMessage(
                `Your account is currently ${accountStatus.toLowerCase()}. Please contact Jaystarbliss Studios support.`
              );
            await signOut(auth).catch(() => undefined);
            return;
          }

          let role = String(data.role || fallbackProfileData?.role || '')
            .trim()
            .toUpperCase();
          if (role === 'INDIVIDUAL_STUDENT') {
            role = 'STUDENT';
          }
          if (role === 'SCHOOL_ADMIN' || role === 'INSTITUTION') {
            role = 'SCHOOL';
          }

          // Direct fallback check if schoolId is still not populated
          if (
            !isAuthenticatedAdmin &&
            (role === 'SCHOOL' || location.pathname.startsWith('/portal/school')) &&
            !String(data.schoolId || '').trim()
          ) {
            try {
              const email = (currentUser.email || data.email || '').toLowerCase();
              const schoolQuery = query(collection(db, 'schools'), where('contactEmail', '==', email), limit(1));
              const schoolSnap = await getDocs(schoolQuery);
              if (!schoolSnap.empty) {
                const schDoc = schoolSnap.docs[0];
                await setDoc(
                  doc(db, 'users', currentUser.uid),
                  {
                    role: 'SCHOOL',
                    schoolId: schDoc.id,
                    schoolName: schDoc.data().name || '',
                    updatedAt: serverTimestamp(),
                  },
                  { merge: true }
                );
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

          sessionStorage.setItem('userRole', role.toLowerCase());
          sessionStorage.setItem('userId', currentUser.uid);
          sessionStorage.setItem('userEmail', currentUser.email || String(data.email || ''));
          if (data.name) sessionStorage.setItem('userName', String(data.name));
          if ((role === 'SCHOOL' || role === 'STUDENT') && data.schoolId) {
            sessionStorage.setItem('schoolId', String(data.schoolId));
          } else {
            sessionStorage.removeItem('schoolId');
            sessionStorage.removeItem('schoolDocId');
            sessionStorage.removeItem('schoolName');
          }
          if (role === 'STUDENT') {
            if (data.studentDocId) {
              sessionStorage.setItem('studentDocId', String(data.studentDocId));
              localStorage.setItem('jaystar_cached_student_doc_id', String(data.studentDocId));
            }
            if (data.class) sessionStorage.setItem('studentClass', String(data.class));
            if (data.username) sessionStorage.setItem('studentUsername', String(data.username));
          } else {
            sessionStorage.removeItem('studentDocId');
            sessionStorage.removeItem('studentClass');
            sessionStorage.removeItem('studentUsername');
            localStorage.removeItem('jaystar_cached_student_doc_id');
          }
          localStorage.setItem('jaystar_cached_user_role', role.toLowerCase());
          localStorage.setItem('jaystar_cached_user_id', currentUser.uid);
          if (data.name) localStorage.setItem('jaystar_cached_user_name', String(data.name));

          // Check temporary password expiration for school administrators before allowing normal portal access
          if (data.forcePasswordReset === true && data.tempPasswordExpiresAt) {
            const expiresDate =
              typeof data.tempPasswordExpiresAt?.toDate === 'function'
                ? data.tempPasswordExpiresAt.toDate()
                : new Date(data.tempPasswordExpiresAt);
            if (!Number.isNaN(expiresDate.getTime()) && Date.now() > expiresDate.getTime()) {
              if (mounted) {
                setBlockedMessage(
                  'Your temporary activation password has expired. Please contact Jaystarbliss Studios administration to issue a fresh temporary password or use Forgot Password on the login page.'
                );
              }
              await signOut(auth).catch(() => undefined);
              return;
            }
          }

          const forceReset = data.forcePasswordReset === true;
          setCachedSessionIdentity({
            uid: currentUser.uid,
            role,
            mustResetPassword: forceReset,
            masqueradeKey: buildMasqueradeKey(),
            verifiedAt: Date.now(),
          });

          const allowed = checkRoleAllowedForRoute(role, allowedRoles, location.pathname);
          if (mounted) {
            setVerifiedRole(role);
            setMustResetPassword(forceReset);
            if (!allowed) {
              if (
                location.pathname.startsWith('/admin') &&
                location.pathname !== '/admin' &&
                adminRoles.includes(role)
              ) {
                setUnauthorizedRedirect('/admin');
              } else {
                setUnauthorizedRedirect(redirectPath);
              }
              setIsAuthorized(false);
            } else {
              setIsAuthorized(true);
            }
          }
        } catch (error) {
          console.error('Protected portal authorization failed:', error);
          if (mounted) setIsAuthorized(false);
        } finally {
          if (mounted) setLoading(false);
        }
      });
    };
    void init();
    return () => {
      mounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  if (loading) return <BrandLoader fullScreen />;

  if (!isAuthorized) {
    if (blockedMessage)
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-950 p-6">
          <div className="max-w-md w-full rounded-2xl border border-red-200 dark:border-red-900/50 bg-white dark:bg-slate-900 p-7 text-center shadow-xl">
            <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/50 text-red-600 flex items-center justify-center font-black text-lg">
              !
            </div>
            <h1 className="text-xl font-black text-gray-900 dark:text-white">Account access restricted</h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{blockedMessage}</p>
          </div>
        </div>
      );
    const requestedFull = `${location.pathname}${location.search || ''}`;
    const shouldPreserveReturn =
      unauthorizedRedirect === '/portal' &&
      location.pathname.startsWith('/portal/') &&
      location.pathname !== '/portal';
    const targetRedirect = shouldPreserveReturn
      ? `/portal?returnTo=${encodeURIComponent(requestedFull)}`
      : unauthorizedRedirect;
    return <Navigate to={targetRedirect} replace />;
  }

  return (
    <>
      {mustResetPassword && (
        <ChangePasswordModal
          isOpen={true}
          isForced={true}
          onSuccess={() => {
            setMustResetPassword(false);
            if (auth.currentUser && inMemoryVerifiedIdentity) {
              setCachedSessionIdentity({
                ...inMemoryVerifiedIdentity,
                mustResetPassword: false,
              });
            }
          }}
        />
      )}
      {children}
    </>
  );
};

export default ProtectedRoute;
