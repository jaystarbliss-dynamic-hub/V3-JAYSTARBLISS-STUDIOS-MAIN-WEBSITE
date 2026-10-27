import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { School, GraduationCap, Users, Mail, Lock, Eye, EyeOff, UserCheck, ShieldCheck } from 'lucide-react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithCustomToken, 
  browserPopupRedirectResolver, 
  signOut, 
  sendPasswordResetEmail 
} from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp, collection, query, where, limit, getDocs } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useTheme } from '../hooks/useTheme';
import SEO from '../components/ui/SEO';
import { useToast } from '../contexts/ToastContext';
import { JaystarblissIcon } from '../components/common/JaystarblissLogo';
import portalWallpaper from '../assets/jdi login bg.png';
import { getFriendlyErrorMessage, logInternalDiagnostic } from '../utils/friendlyErrors';
import './Portal.css';
import './SecurePortalTheme.css';

type PortalMode = 'institute' | 'client';
type InstituteRole = 'student' | 'school' | 'staff';
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
const blocked = (d: Record<string, any>) => ['DISABLED', 'SUSPENDED', 'BANNED'].includes(String(d.accountStatus || d.status || 'ACTIVE').toUpperCase());

const storeSession = (role: string, uid: string, name: string, extras: Record<string, string> = {}) => {
  sessionStorage.setItem('userRole', role); 
  sessionStorage.setItem('userId', uid); 
  sessionStorage.setItem('userName', name);
  Object.entries(extras).forEach(([k, v]) => sessionStorage.setItem(k, v || ''));
  localStorage.setItem('jaystar_cached_user_role', role); 
  localStorage.setItem('jaystar_cached_user_id', uid); 
  localStorage.setItem('jaystar_cached_user_name', name);
  if (extras.studentDocId) localStorage.setItem('jaystar_cached_student_doc_id', extras.studentDocId);
  if (extras.studentUsername) localStorage.setItem('jaystar_cached_student_username', extras.studentUsername);
};

async function computeSha256(message: string): Promise<string> {
  try {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return message.toLowerCase();
  }
}

const SecurePortalLogin: React.FC = () => {
  const navigate = useNavigate(); 
  const { theme } = useTheme(); 
  const { toast } = useToast();
  const [portalMode, setPortalMode] = useState<PortalMode>('institute');
  const [instituteTab, setInstituteTab] = useState<InstituteRole>('student');
  const [identifier, setIdentifier] = useState(''); 
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false); 
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false); 
  const [error, setError] = useState('');

  const resetFields = () => { setIdentifier(''); setPassword(''); setError(''); };

  const serverAccess = async () => {
    try {
      const response = await fetch('/.netlify/functions/portal-access-login', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ role: 'student', identifier: identifier.trim(), code: password.trim() }) 
      });
      if (!response.ok) return null;
      const data = await response.json().catch(() => ({}));
      if (!data.customToken) return null;
      const credential = await signInWithCustomToken(auth, data.customToken); 
      return { data, user: credential.user };
    } catch {
      return null;
    }
  };

  const routeManagedAccount = (data: any, user: any) => {
    const role = String(data.role || '').toUpperCase();
    if (role.includes('ADMIN')) { 
      storeSession('super_admin', user.uid, data.name || user.displayName || 'Admin', { userEmail: user.email || '' }); 
      navigate('/admin'); 
      return; 
    }
    if (role === 'SCHOOL') { 
      storeSession('school', user.uid, data.name || data.schoolName || user.displayName || 'School Partner', { 
        userEmail: user.email || '', 
        schoolId: data.schoolId || user.uid, 
        schoolName: data.schoolName || '' 
      }); 
      navigate('/portal/school'); 
      return; 
    }
    if (['STAFF', 'TUTOR', 'INSTRUCTOR', 'FACULTY'].includes(role)) { 
      storeSession('staff', user.uid, data.name || user.displayName || 'Faculty Member', { 
        userEmail: user.email || '', 
        schoolId: data.schoolId || '' 
      }); 
      navigate('/portal/staff'); 
      return; 
    }
    if (role === 'STUDENT') {
      const type = data.isIndependent === true || (!data.schoolId && !data.parentId) ? 'individual' : data.parentId ? 'parent' : 'school';
      storeSession('student', user.uid, data.name || user.displayName || 'Student', { 
        studentDocId: data.studentDocId || '', 
        schoolId: data.schoolId || '', 
        studentRegistrationType: type 
      }); 
      navigate('/portal/student'); 
      return;
    }
    storeSession('parent', user.uid, data.name || user.displayName || 'Parent', { 
      userEmail: user.email || '', 
      schoolId: data.schoolId || '' 
    }); 
    navigate('/portal/parent');
  };

  const loginStudentWithFallback = async () => {
    const rawInput = identifier.trim();
    const inputCode = password.trim();
    if (!rawInput || !inputCode) {
      throw new Error('Enter your Student Username / Email and Access Code.');
    }

    // 1. Try server function first
    try {
      const result = await serverAccess();
      if (result) {
        const name = result.data.name || rawInput;
        const type = result.data.isIndependent === true || (!result.data.schoolId && !result.data.parentId)
          ? 'individual'
          : result.data.parentId ? 'parent' : 'school';

        storeSession('student', result.user.uid, name, {
          studentDocId: result.data.studentDocId || '',
          studentUsername: result.data.username || '',
          studentClass: result.data.class || '',
          schoolId: result.data.schoolId || '',
          schoolName: result.data.schoolName || '',
          studentRegistrationType: type
        });
        toast.success(`Welcome ${String(name).split(' ')[0]}! Logged in successfully.`);
        navigate('/portal/student');
        return;
      }
    } catch {
      // Proceed directly to client resolver
    }

    // 2. Direct client Firestore lookup & authentication fallback
    const cleanUsername = rawInput.toLowerCase().replace(/^@/, '').replace(/\s+/g, '');
    const cleanEmail = rawInput.toLowerCase();
    const cleanCode = rawInput.toUpperCase().trim();
    const inputCodeClean = inputCode.trim();
    const inputCodeUpper = inputCodeClean.toUpperCase();
    const inputCodeLower = inputCodeClean.toLowerCase().replace(/^@/, '').replace(/\s+/g, '');
    const isRealEmail = rawInput.includes('@') && !rawInput.endsWith('.local');

    let studentDocId = '';
    let studentData: any = null;

    try {
      const queries = [
        query(collection(db, 'individualStudents'), where('username', '==', cleanUsername), limit(1)),
        query(collection(db, 'individualStudents'), where('username', '==', cleanUsername.toUpperCase()), limit(1)),
        query(collection(db, 'individualStudents'), where('username', '==', rawInput), limit(1)),
        query(collection(db, 'individualStudents'), where('username', '==', `@${cleanUsername}`), limit(1)),
        query(collection(db, 'individualStudents'), where('username', '==', `@${cleanUsername.toUpperCase()}`), limit(1)),
        query(collection(db, 'students'), where('username', '==', cleanUsername), limit(1)),
        query(collection(db, 'students'), where('username', '==', cleanUsername.toUpperCase()), limit(1)),
        query(collection(db, 'students'), where('username', '==', rawInput), limit(1)),
        query(collection(db, 'students'), where('username', '==', `@${cleanUsername}`), limit(1)),
        query(collection(db, 'students'), where('username', '==', `@${cleanUsername.toUpperCase()}`), limit(1)),

        query(collection(db, 'individualStudents'), where('accessCode', '==', cleanCode), limit(1)),
        query(collection(db, 'individualStudents'), where('accessCode', '==', inputCodeUpper), limit(1)),
        query(collection(db, 'individualStudents'), where('accessCode', '==', inputCodeClean), limit(1)),
        query(collection(db, 'students'), where('accessCode', '==', cleanCode), limit(1)),
        query(collection(db, 'students'), where('accessCode', '==', inputCodeUpper), limit(1)),
        query(collection(db, 'students'), where('accessCode', '==', inputCodeClean), limit(1)),
        query(collection(db, 'individualStudents'), where('passcode', '==', cleanCode), limit(1)),
        query(collection(db, 'individualStudents'), where('passcode', '==', inputCodeUpper), limit(1)),
        query(collection(db, 'students'), where('passcode', '==', cleanCode), limit(1)),
        query(collection(db, 'students'), where('passcode', '==', inputCodeUpper), limit(1)),
        query(collection(db, 'individualStudents'), where('code', '==', cleanCode), limit(1)),
        query(collection(db, 'individualStudents'), where('code', '==', inputCodeUpper), limit(1)),

        query(collection(db, 'users'), where('username', '==', cleanUsername), limit(1)),
        query(collection(db, 'users'), where('username', '==', cleanUsername.toUpperCase()), limit(1)),
        query(collection(db, 'users'), where('accessCode', '==', cleanCode), limit(1)),
        query(collection(db, 'users'), where('accessCode', '==', inputCodeUpper), limit(1))
      ];

      if (isRealEmail) {
        queries.push(
          query(collection(db, 'individualStudents'), where('email', '==', cleanEmail), limit(1)),
          query(collection(db, 'students'), where('email', '==', cleanEmail), limit(1)),
          query(collection(db, 'users'), where('email', '==', cleanEmail), limit(1))
        );
      }

      const results = await Promise.all(queries.map(q => getDocs(q).catch(() => null)));
      for (const snap of results) {
        if (snap && !snap.empty) {
          studentDocId = snap.docs[0].id;
          studentData = snap.docs[0].data();
          break;
        }
      }

      if (!studentData) {
        const [d1, d2] = await Promise.all([
          getDoc(doc(db, 'individualStudents', rawInput)).catch(() => null),
          getDoc(doc(db, 'students', rawInput)).catch(() => null)
        ]);
        if (d1 && d1.exists()) {
          studentDocId = d1.id;
          studentData = d1.data();
        } else if (d2 && d2.exists()) {
          studentDocId = d2.id;
          studentData = d2.data();
        }
      }

      // Broad scan fallback (in case username had unusual formatting, case differences, or hyphen variations)
      if (!studentData) {
        const [indSnap, stdSnap] = await Promise.all([
          getDocs(query(collection(db, 'individualStudents'), limit(300))).catch(() => ({ docs: [] } as any)),
          getDocs(query(collection(db, 'students'), limit(300))).catch(() => ({ docs: [] } as any))
        ]);

        const allDocs = [...indSnap.docs, ...stdSnap.docs];
        for (const d of allDocs) {
          const sd = d.data();
          const u = String(sd.username || sd.studentUsername || sd.loginUsername || '').toLowerCase().replace(/^@/, '').replace(/\s+/g, '');
          const e = String(sd.email || sd.studentEmail || '').toLowerCase().trim();
          const c = String(sd.accessCode || sd.passcode || sd.code || '').toUpperCase().trim();
          const cStripped = c.replace(/[\s-]/g, '');
          const n = String(sd.fullName || sd.studentName || sd.name || '').toLowerCase().trim();
          const cleanCodeStripped = cleanCode.replace(/[\s-]/g, '');
          const inputCodeStripped = inputCodeUpper.replace(/[\s-]/g, '');

          const identifierMatches =
            (cleanUsername && (u === cleanUsername || u === `@${cleanUsername}`)) ||
            (isRealEmail && e === cleanEmail) ||
            (cleanCode && (c === cleanCode || (cStripped && cStripped === cleanCodeStripped))) ||
            (cleanUsername.length > 2 && (n === cleanUsername || n.replace(/\s+/g, '') === cleanUsername)) ||
            (d.id.toLowerCase() === cleanUsername);

          const swappedMatches =
            (cleanCode && (c === cleanCode || (cStripped && cStripped === cleanCodeStripped))) &&
            (u === inputCodeLower || u === `@${inputCodeLower}`);

          const directPairMatches =
            (c && (c === inputCodeUpper || (cStripped && cStripped === inputCodeStripped))) &&
            (u === cleanUsername || cleanUsername === '');

          if (identifierMatches || swappedMatches || directPairMatches) {
            studentDocId = d.id;
            studentData = sd;
            break;
          }
        }
      }
    } catch (lookupErr) {
      console.warn('Student lookup info:', lookupErr);
    }

    if (!studentData) {
      throw new Error(`No student record found matching "${rawInput}". Please check the username or access code provided by your school.`);
    }

    if (blocked(studentData)) {
      throw new Error('This student account is currently suspended or disabled. Please contact your instructor.');
    }

    // Verify Access Code (or check if user inverted username/access code)
    const storedAccess = String(studentData.accessCode || studentData.passcode || studentData.code || '').trim();
    const storedHash = String(
      studentData.accessCodeHash ||
      studentData.passwordHash ||
      studentData.customPasswordHash ||
      studentData.passcodeHash ||
      studentData.codeHash ||
      ''
    ).trim().toLowerCase();
    const storedPassword = String(studentData.password || studentData.customPassword || '').trim();
    const storedUsername = String(studentData.username || studentData.studentUsername || '').toLowerCase().replace(/^@/, '').replace(/\s+/g, '');

    const inputStripped = inputCodeClean.replace(/[\s-]/g, '').toUpperCase();
    const inputJbsHyphenated = inputStripped.startsWith('JBS') && inputStripped.length > 3 ? `JBS-${inputStripped.slice(3)}` : '';
    const storedStripped = storedAccess.replace(/[\s-]/g, '').toUpperCase();
    const rawInputUpper = rawInput.toUpperCase();
    const rawInputStripped = rawInput.replace(/[\s-]/g, '').toUpperCase();

    const [inputHashExact, inputHashUpper, inputHashStripped, inputHashJbs, rawInputHashExact, rawInputHashUpper] = await Promise.all([
      computeSha256(inputCodeClean),
      computeSha256(inputCodeUpper),
      computeSha256(inputStripped),
      inputJbsHyphenated ? computeSha256(inputJbsHyphenated) : Promise.resolve(''),
      computeSha256(rawInput),
      computeSha256(rawInputUpper)
    ]);

    const isMatch =
      (storedAccess && (
        storedAccess.toUpperCase() === inputCodeUpper ||
        storedAccess === inputCodeClean ||
        (storedStripped && storedStripped === inputStripped)
      )) ||
      (storedHash && (
        storedHash === inputHashExact ||
        storedHash === inputHashUpper ||
        storedHash === inputHashStripped ||
        (!!inputHashJbs && storedHash === inputHashJbs)
      )) ||
      (storedPassword && (storedPassword === inputCodeClean || storedPassword === inputCodeUpper)) ||
      // Inverted input check: identifier was access code and password was username
      (storedAccess && (
        storedAccess.toUpperCase() === rawInputUpper ||
        storedAccess === rawInput ||
        (storedStripped && storedStripped === rawInputStripped)
      ) && inputCodeLower === storedUsername) ||
      (storedHash && (storedHash === rawInputHashExact || storedHash === rawInputHashUpper) && inputCodeLower === storedUsername);

    if (!isMatch) {
      throw new Error('Invalid access code for this student account. Please verify your access code with your school or administrator.');
    }

    // Establish Firebase Authentication session
    const resolvedUsername = String(studentData.username || cleanUsername).toLowerCase().replace(/^@/, '').replace(/\s+/g, '') || 'student';
    const cleanDocSuffix = String(studentDocId || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(-8) || 'std';
    const syntheticEmail = `student_${resolvedUsername}_${cleanDocSuffix}@jaystarbliss-studios.firebaseapp.com`;
    const effectiveAuthEmail = isRealEmail ? cleanEmail : syntheticEmail;
    const effectivePassword = inputCodeClean.length >= 6 ? inputCodeClean : `${inputCodeClean}123456`;

    let activeUser: any = null;

    try {
      const cred = await signInWithEmailAndPassword(auth, effectiveAuthEmail, effectivePassword);
      activeUser = cred.user;
    } catch (err1: any) {
      if (err1.code === 'auth/user-not-found' || err1.code === 'auth/invalid-credential' || err1.code === 'auth/invalid-login-credentials') {
        try {
          const cred2 = await createUserWithEmailAndPassword(auth, effectiveAuthEmail, effectivePassword);
          activeUser = cred2.user;
        } catch (err2: any) {
          if (err2.code === 'auth/email-already-in-use') {
            try {
              const cred3 = await signInWithEmailAndPassword(auth, effectiveAuthEmail, effectivePassword);
              activeUser = cred3.user;
            } catch {
              try {
                const uniqueEmail = `std_${resolvedUsername}_${Date.now().toString(36)}@jaystarbliss-studios.firebaseapp.com`;
                const cred4 = await createUserWithEmailAndPassword(auth, uniqueEmail, effectivePassword);
                activeUser = cred4.user;
              } catch {
                activeUser = auth.currentUser || { uid: studentData.firebaseUid || studentDocId, email: effectiveAuthEmail, displayName: resolvedUsername };
              }
            }
          } else {
            activeUser = auth.currentUser || { uid: studentData.firebaseUid || studentDocId, email: effectiveAuthEmail, displayName: resolvedUsername };
          }
        }
      } else if (err1.code === 'auth/email-already-in-use' || err1.code === 'auth/wrong-password') {
        try {
          const uniqueEmail = `std_${resolvedUsername}_${Date.now().toString(36)}@jaystarbliss-studios.firebaseapp.com`;
          const cred4 = await createUserWithEmailAndPassword(auth, uniqueEmail, effectivePassword);
          activeUser = cred4.user;
        } catch {
          activeUser = auth.currentUser || { uid: studentData.firebaseUid || studentDocId, email: effectiveAuthEmail, displayName: resolvedUsername };
        }
      } else {
        activeUser = auth.currentUser || { uid: studentData.firebaseUid || studentDocId, email: effectiveAuthEmail, displayName: resolvedUsername };
      }
    }

    if (!activeUser) {
      activeUser = { uid: studentData.firebaseUid || studentDocId, email: effectiveAuthEmail, displayName: resolvedUsername };
    }

    const studentName = studentData.fullName || studentData.studentName || studentData.name || resolvedUsername;
    const schoolId = studentData.schoolId || '';
    const schoolName = studentData.schoolName || '';
    const studentClass = studentData.class || studentData.grade || 'General';
    const regType = studentData.isIndependent === true || (!schoolId && !studentData.parentId) ? 'individual' : studentData.parentId ? 'parent' : 'school';

    // Store session first so ProtectedRoute has full student context immediately
    storeSession('student', activeUser.uid, studentName, {
      studentDocId: studentDocId || activeUser.uid,
      studentUsername: resolvedUsername,
      studentClass,
      schoolId,
      schoolName,
      studentRegistrationType: regType
    });

    // Update users/{uid} profile so ProtectedRoute & App authorizations succeed
    try {
      await setDoc(doc(db, 'users', activeUser.uid), {
        uid: activeUser.uid,
        name: studentName,
        fullName: studentName,
        email: effectiveAuthEmail,
        role: 'STUDENT',
        studentDocId: studentDocId || activeUser.uid,
        username: resolvedUsername,
        schoolId: schoolId || null,
        schoolName: schoolName || '',
        class: studentClass,
        accountStatus: 'ACTIVE',
        status: 'ACTIVE',
        portalAccessEnabled: true,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (uErr) {
      console.warn('User profile sync notice:', uErr);
    }

    // Link back to students / individualStudents
    if (studentDocId) {
      await Promise.all([
        setDoc(doc(db, 'students', studentDocId), { firebaseUid: activeUser.uid, userId: activeUser.uid, portalAccessEnabled: true }, { merge: true }).catch(() => null),
        setDoc(doc(db, 'individualStudents', studentDocId), { firebaseUid: activeUser.uid, userId: activeUser.uid, portalAccessEnabled: true }, { merge: true }).catch(() => null)
      ]);
    }

    toast.success(`Welcome ${String(studentName).split(' ')[0]}! Logged in successfully.`);
    navigate('/portal/student');
  };

  const loginManagedAccount = async (target: 'school' | 'staff' | 'client') => {
    const email = identifier.trim().toLowerCase(); 
    if (!email || !password) throw new Error('Enter your email address and password.');
    const credential = await signInWithEmailAndPassword(auth, email, password); 
    const user = credential.user;
    if (['johnrufai242@gmail.com', 'admin@jaystarbliss.com', 'admin@jaystarbliss-studios.name.ng'].includes(email)) {
      await setDoc(doc(db, 'users', user.uid), { 
        uid: user.uid, 
        name: user.displayName || 'Super Admin', 
        fullName: user.displayName || 'Super Admin', 
        email: user.email, 
        role: 'SUPER_ADMIN', 
        accountStatus: 'ACTIVE', 
        status: 'ACTIVE', 
        updatedAt: serverTimestamp() 
      }, { merge: true });
      storeSession('super_admin', user.uid, user.displayName || 'Administrator', { userEmail: user.email || '' }); 
      navigate('/admin'); 
      return;
    }
    let snap = await getDoc(doc(db, 'users', user.uid)); 
    let data: any = snap.exists() ? snap.data() || {} : {};

    if (target === 'school' && (!snap.exists() || !data.schoolId || String(data.role || '').toUpperCase() !== 'SCHOOL')) {
      const schoolSnap = await getDocs(query(collection(db, 'schools'), where('contactEmail', '==', email), limit(1))).catch(() => null);
      if (schoolSnap && !schoolSnap.empty) {
        const s = schoolSnap.docs[0]; 
        const sd = s.data();
        await setDoc(doc(db, 'users', user.uid), { 
          uid: user.uid, 
          name: user.displayName || sd.contactName || 'School Administrator', 
          fullName: user.displayName || sd.contactName || 'School Administrator', 
          email, 
          role: 'SCHOOL', 
          schoolId: s.id, 
          schoolName: sd.name || '', 
          accountStatus: 'ACTIVE', 
          status: 'ACTIVE', 
          updatedAt: serverTimestamp() 
        }, { merge: true });
        snap = await getDoc(doc(db, 'users', user.uid)); 
        data = snap.data() || {};
      }
    }
    // Check if account has approved tutor / staff profile in tutors, staff, or tutor_applications
    let isApprovedTutor = false;
    let tutorName = '';
    try {
      const tutorDoc = await getDoc(doc(db, 'tutors', user.uid)).catch(() => null);
      if (tutorDoc?.exists() && tutorDoc.data()?.status !== 'BANNED' && tutorDoc.data()?.status !== 'SUSPENDED') {
        isApprovedTutor = true;
        tutorName = tutorDoc.data()?.name || tutorDoc.data()?.fullName || '';
      }
      if (!isApprovedTutor) {
        const staffDoc = await getDoc(doc(db, 'staff', user.uid)).catch(() => null);
        if (staffDoc?.exists() && staffDoc.data()?.status !== 'BANNED' && staffDoc.data()?.status !== 'SUSPENDED') {
          isApprovedTutor = true;
          tutorName = staffDoc.data()?.name || staffDoc.data()?.fullName || '';
        }
      }
      if (!isApprovedTutor && email) {
        const tSnap = await getDocs(query(collection(db, 'tutors'), where('email', '==', email), limit(1))).catch(() => null);
        if (tSnap && !tSnap.empty && tSnap.docs[0].data()?.status !== 'BANNED' && tSnap.docs[0].data()?.status !== 'SUSPENDED') {
          isApprovedTutor = true;
          tutorName = tSnap.docs[0].data()?.name || tSnap.docs[0].data()?.fullName || '';
        }
      }
      if (!isApprovedTutor && email) {
        const sSnap = await getDocs(query(collection(db, 'staff'), where('email', '==', email), limit(1))).catch(() => null);
        if (sSnap && !sSnap.empty && sSnap.docs[0].data()?.status !== 'BANNED' && sSnap.docs[0].data()?.status !== 'SUSPENDED') {
          isApprovedTutor = true;
          tutorName = sSnap.docs[0].data()?.name || sSnap.docs[0].data()?.fullName || '';
        }
      }
      if (!isApprovedTutor && email) {
        const appSnap = await getDocs(query(collection(db, 'tutor_applications'), where('email', '==', email), where('status', '==', 'approved'), limit(1))).catch(() => null);
        if (appSnap && !appSnap.empty) {
          isApprovedTutor = true;
          tutorName = appSnap.docs[0].data()?.name || '';
        }
      }
    } catch (checkErr) {
      console.warn('Tutor verification warning:', checkErr);
    }

    if ((target === 'staff' || isApprovedTutor) && !String(data.role || '').toUpperCase().includes('ADMIN')) {
      const resolvedName = tutorName || data.name || user.displayName || email.split('@')[0];
      const staffProfile = {
        ...data,
        uid: user.uid,
        name: resolvedName,
        fullName: resolvedName,
        email,
        role: 'STAFF',
        accountStatus: data.accountStatus || 'ACTIVE',
        status: data.status || 'ACTIVE',
      };
      try {
        await setDoc(doc(db, 'users', user.uid), {
          ...staffProfile,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (err) {
        console.warn('Staff users sync warning:', err);
      }
      try {
        await setDoc(doc(db, 'tutors', user.uid), {
          role: 'staff',
          status: 'ACTIVE',
          email,
          name: resolvedName,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (err) {
        console.warn('Staff tutors sync warning:', err);
      }
      await deleteDoc(doc(db, 'parents', user.uid)).catch(() => null);

      snap = await getDoc(doc(db, 'users', user.uid)).catch(() => snap);
      data = snap?.exists() ? { ...staffProfile, ...(snap.data() || {}), role: 'STAFF' } : staffProfile;
    }

    if (!snap.exists() && !data.role) { 
      await signOut(auth).catch(() => undefined); 
      throw new Error('No active portal profile was found for this account.'); 
    }
    if (blocked(data)) { 
      await signOut(auth).catch(() => undefined); 
      throw new Error(`This account is ${String(data.accountStatus || data.status).toLowerCase()}. Please contact an administrator.`); 
    }
    const role = String(data.role || '').toUpperCase();
    if (target === 'school' && role !== 'SCHOOL' && !role.includes('ADMIN')) { 
      await signOut(auth).catch(() => undefined); 
      throw new Error('This account is not registered as an affiliated school administrator.'); 
    }
    routeManagedAccount(data, user);
  };

  const handleLogin = async (event?: React.FormEvent) => {
    event?.preventDefault(); 
    setError(''); 
    setLoading(true);
    try {
      if (!identifier.trim() || !password.trim()) {
        throw new Error(
          portalMode === 'client' 
            ? 'Enter your Client Email Address and Password.' 
            : instituteTab === 'student' 
            ? 'Enter your Student Username / Email and Access Code.' 
            : instituteTab === 'school' 
            ? 'Enter your School Administrator Email and Password.' 
            : 'Enter your Faculty / Staff Email and Password.'
        );
      }
      if (portalMode === 'client') { 
        await loginManagedAccount('client'); 
        toast.success('Signed in successfully.'); 
      }
      else if (instituteTab === 'student') { 
        await loginStudentWithFallback(); 
      }
      else if (instituteTab === 'school') { 
        await loginManagedAccount('school'); 
        toast.success('School administrator signed in successfully.'); 
      }
      else { 
        await loginManagedAccount('staff'); 
        toast.success('Faculty workspace signed in successfully.'); 
      }
    } catch (err: any) { 
      logInternalDiagnostic('SecurePortalLogin::submit', err, { instituteTab, portalMode });
      setError(getFriendlyErrorMessage(err, 'Sign in was unsuccessful. Please check your credentials and try again.')); 
    }
    finally { 
      setLoading(false); 
    }
  };

  const handlePasswordReset = async () => {
    const email = identifier.trim().toLowerCase();
    if (!email) {
      setError('Enter your registered email address first, then select “Forgot password?”.');
      return;
    }
    setError('');
    setLoading(true);
    let sent = false;
    try {
      const res = await fetch('/.netlify/functions/auth-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        sent = true;
        toast.success(data.message || 'Password reset link sent to your email.');
        setError('Check your email inbox (and spam folder) for the password reset link.');
        return;
      }
    } catch {
      // Netlify function unavailable in local dev preview, fall through to client Firebase
    }

    if (!sent) {
      try {
        await sendPasswordResetEmail(auth, email);
        toast.success('If an account exists for that email, a password reset link has been sent.');
        setError('Check your email inbox (and spam folder) for the password reset link.');
      } catch (e: any) {
        logInternalDiagnostic('SecurePortalLogin::passwordReset', e, { email });
        setError(getFriendlyErrorMessage(e, 'Unable to send password recovery email right now. Please try again shortly.'));
      } finally {
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError(''); 
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider, browserPopupRedirectResolver); 
      const user = result.user; 
      const email = (user.email || '').toLowerCase();
      if (['johnrufai242@gmail.com', 'admin@jaystarbliss.com', 'admin@jaystarbliss-studios.name.ng'].includes(email)) {
        await setDoc(doc(db, 'users', user.uid), { 
          uid: user.uid, 
          name: user.displayName || 'Super Admin', 
          fullName: user.displayName || 'Super Admin', 
          email: user.email, 
          role: 'SUPER_ADMIN', 
          accountStatus: 'ACTIVE', 
          status: 'ACTIVE', 
          updatedAt: serverTimestamp() 
        }, { merge: true });
        storeSession('super_admin', user.uid, user.displayName || 'Super Admin', { userEmail: user.email || '' });
        navigate('/admin');
        return;
      }
      let snap = await getDoc(doc(db, 'users', user.uid)); 
      let data: any = snap.exists() ? snap.data() || {} : {};
      if (portalMode === 'institute' && instituteTab === 'school' && (!snap.exists() || String(data.role || '').toUpperCase() !== 'SCHOOL')) {
        const schoolSnap = await getDocs(query(collection(db, 'schools'), where('contactEmail', '==', email), limit(1))).catch(() => null);
        if (schoolSnap && !schoolSnap.empty) {
          const s = schoolSnap.docs[0]; 
          const sd = s.data();
          await setDoc(doc(db, 'users', user.uid), { 
            uid: user.uid, 
            name: user.displayName || sd.contactName || 'School Administrator', 
            fullName: user.displayName || sd.contactName || 'School Administrator', 
            email: user.email || email, 
            role: 'SCHOOL', 
            schoolId: s.id, 
            schoolName: sd.name || '', 
            accountStatus: 'ACTIVE', 
            status: 'ACTIVE', 
            updatedAt: serverTimestamp() 
          }, { merge: true });
          snap = await getDoc(doc(db, 'users', user.uid)); 
          data = snap.data() || {};
        }
      }
      // Check if this Google account is an approved tutor in tutors, staff, or tutor_applications
      let googleIsApprovedTutor = false;
      let googleTutorName = '';
      try {
        const tDoc = await getDoc(doc(db, 'tutors', user.uid)).catch(() => null);
        if (tDoc?.exists() && tDoc.data()?.status !== 'BANNED' && tDoc.data()?.status !== 'SUSPENDED') {
          googleIsApprovedTutor = true;
          googleTutorName = tDoc.data()?.name || tDoc.data()?.fullName || '';
        }
        if (!googleIsApprovedTutor) {
          const sDoc = await getDoc(doc(db, 'staff', user.uid)).catch(() => null);
          if (sDoc?.exists() && sDoc.data()?.status !== 'BANNED' && sDoc.data()?.status !== 'SUSPENDED') {
            googleIsApprovedTutor = true;
            googleTutorName = sDoc.data()?.name || sDoc.data()?.fullName || '';
          }
        }
        if (!googleIsApprovedTutor && email) {
          const tSnap = await getDocs(query(collection(db, 'tutors'), where('email', '==', email), limit(1))).catch(() => null);
          if (tSnap && !tSnap.empty && tSnap.docs[0].data()?.status !== 'BANNED' && tSnap.docs[0].data()?.status !== 'SUSPENDED') {
            googleIsApprovedTutor = true;
            googleTutorName = tSnap.docs[0].data()?.name || tSnap.docs[0].data()?.fullName || '';
          }
        }
        if (!googleIsApprovedTutor && email) {
          const sSnap = await getDocs(query(collection(db, 'staff'), where('email', '==', email), limit(1))).catch(() => null);
          if (sSnap && !sSnap.empty && sSnap.docs[0].data()?.status !== 'BANNED' && sSnap.docs[0].data()?.status !== 'SUSPENDED') {
            googleIsApprovedTutor = true;
            googleTutorName = sSnap.docs[0].data()?.name || sSnap.docs[0].data()?.fullName || '';
          }
        }
        if (!googleIsApprovedTutor && email) {
          const appSnap = await getDocs(query(collection(db, 'tutor_applications'), where('email', '==', email), where('status', '==', 'approved'), limit(1))).catch(() => null);
          if (appSnap && !appSnap.empty) {
            googleIsApprovedTutor = true;
            googleTutorName = appSnap.docs[0].data()?.name || '';
          }
        }
      } catch (checkErr) {
        console.warn('Google tutor check notice:', checkErr);
      }

      if (((portalMode === 'institute' && instituteTab === 'staff') || googleIsApprovedTutor) && !String(data.role || '').toUpperCase().includes('ADMIN')) {
        const resolvedName = googleTutorName || data.name || user.displayName || email.split('@')[0];
        const staffProfile = {
          ...data,
          uid: user.uid,
          name: resolvedName,
          fullName: resolvedName,
          email: user.email || email,
          role: 'STAFF',
          accountStatus: data.accountStatus || 'ACTIVE',
          status: data.status || 'ACTIVE',
        };
        try {
          await setDoc(doc(db, 'users', user.uid), {
            ...staffProfile,
            updatedAt: serverTimestamp()
          }, { merge: true });
        } catch (err) {
          console.warn('Google staff users sync warning:', err);
        }
        try {
          await setDoc(doc(db, 'tutors', user.uid), {
            role: 'staff',
            status: 'ACTIVE',
            email: user.email || email,
            name: resolvedName,
            updatedAt: serverTimestamp()
          }, { merge: true });
        } catch (err) {
          console.warn('Google staff tutors sync warning:', err);
        }
        await deleteDoc(doc(db, 'parents', user.uid)).catch(() => null);

        snap = await getDoc(doc(db, 'users', user.uid)).catch(() => snap);
        data = snap?.exists() ? { ...staffProfile, ...(snap.data() || {}), role: 'STAFF' } : staffProfile;
      }
      if (!snap.exists() && !data.role) { 
        await signOut(auth).catch(() => undefined); 
        throw new Error('No active portal profile was found for this Google account.'); 
      }
      if (blocked(data)) { 
        await signOut(auth).catch(() => undefined); 
        throw new Error('This account is currently disabled. Please contact an administrator.'); 
      }
      const role = String(data.role || '').toUpperCase();
      if (portalMode === 'institute' && instituteTab === 'school' && role !== 'SCHOOL' && !role.includes('ADMIN')) { 
        await signOut(auth).catch(() => undefined); 
        throw new Error('This Google account is not registered as a school administrator.'); 
      }
      if (portalMode === 'institute' && instituteTab === 'staff' && !['STAFF', 'TUTOR', 'INSTRUCTOR', 'FACULTY'].includes(role) && !role.includes('ADMIN')) { 
        await signOut(auth).catch(() => undefined); 
        throw new Error('This Google account is not registered as staff.'); 
      }
      routeManagedAccount(data, user); 
      toast.success('Signed in with Google.');
    } catch (err: any) { 
      setError(err?.message || 'Google sign-in failed.'); 
    } finally { 
      setLoading(false); 
    }
  };

  const tabs: [InstituteRole, string, React.ReactNode][] = [
    ['student', 'Students', <GraduationCap size={14} key="std"/>],
    ['school', 'Schools', <School size={14} key="sch"/>],
    ['staff', 'Staff', <Users size={14} key="stf"/>]
  ];
  const googleAllowed = portalMode === 'client' || instituteTab === 'school' || instituteTab === 'staff';

  return (
    <div className={`jdh-portal ${theme === 'dark' ? 'dark' : 'light'}`}>
      <div className="jdh-portal-bg-viewport" aria-hidden="true">
        <img src={portalWallpaper} alt="" />
        <div className="bg-overlay" />
      </div>
      <SEO 
        title="Academy &amp; Client Portal — Jaystarbliss Studios" 
        description="Secure access to student dashboards, school portals, parent progress reports, staff workspaces, and administrative panels." 
      />
      <div className="scanlines" />

      <div className="card glass-modal-card">
        <div className="glass-header text-center pt-1 pb-2">
          <div className="flex items-center justify-center gap-2.5">
            <Link to="/" className="inline-flex items-center">
              <JaystarblissIcon className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg" />
            </Link>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight m-0">Welcome Back</h1>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3.5 p-1 bg-black/40 rounded-2xl border border-white/10 backdrop-blur-md">
          <button 
            type="button" 
            onClick={() => { setPortalMode('institute'); resetFields(); }} 
            className={`py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all ${
              portalMode === 'institute' ? 'bg-gradient-to-r from-brand-red to-red-600 text-white shadow-md' : 'text-slate-300 hover:bg-white/5'
            }`}
          >
            <School size={14} />Login to Institute
          </button>
          <button 
            type="button" 
            onClick={() => { setPortalMode('client'); resetFields(); }} 
            className={`py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all ${
              portalMode === 'client' ? 'bg-gradient-to-r from-brand-red to-red-600 text-white shadow-md' : 'text-slate-300 hover:bg-white/5'
            }`}
          >
            <UserCheck size={14} />Login as Client
          </button>
        </div>

        {portalMode === 'institute' && (
          <div className="glass-role-tabs mb-3.5">
            {tabs.map(([id, label, icon]) => (
              <button 
                key={id} 
                type="button" 
                className={`glass-role-tab ${instituteTab === id ? 'active' : ''}`} 
                onClick={() => { setInstituteTab(id); resetFields(); }}
              >
                {icon}
                <span className="text-[11px] font-bold">{label}</span>
              </button>
            ))}
          </div>
        )}

        {error && (
          <div className="msg msg-error show mb-3 text-xs py-2 px-3" role="alert">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} autoComplete="on" className="space-y-3">
          <div className="field mb-2.5">
            <label className="text-[11px] font-bold text-white uppercase tracking-wider block mb-1">
              {portalMode === 'client' 
                ? 'Client Email Address' 
                : instituteTab === 'student' 
                ? 'Student Username or Email' 
                : instituteTab === 'school' 
                ? 'School Administrator Email' 
                : 'Faculty / Staff Email'}
            </label>
            <div className="input-wrap relative">
              <span className="input-icon"><Mail size={14} /></span>
              <input 
                type={portalMode === 'institute' && instituteTab === 'student' ? 'text' : 'email'} 
                required 
                value={identifier} 
                onChange={e => setIdentifier(e.target.value)} 
                placeholder={
                  portalMode === 'client' 
                    ? 'client@example.com' 
                    : instituteTab === 'student' 
                    ? 'student@example.com or username' 
                    : instituteTab === 'school' 
                    ? 'school@example.com' 
                    : 'faculty@jaystarbliss-studios.name.ng'
                } 
                className="glass-input" 
              />
            </div>
          </div>

          <div className="field mb-2.5">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-bold text-white uppercase tracking-wider">
                {portalMode === 'institute' && instituteTab === 'student' ? 'Access Code' : 'Password'}
              </label>
              {(portalMode === 'client' || instituteTab === 'school' || instituteTab === 'staff') && (
                <button 
                  type="button" 
                  onClick={handlePasswordReset} 
                  disabled={loading} 
                  className="text-[11px] font-semibold text-sky-200 hover:text-white bg-transparent border-0 p-0"
                >
                  Forgot Password?
                </button>
              )}
            </div>
            <div className="input-wrap relative">
              <span className="input-icon"><Lock size={14} /></span>
              <input 
                type={showPassword ? 'text' : 'password'} 
                required 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
                placeholder={portalMode === 'institute' && instituteTab === 'student' ? 'e.g. JBS-XXXX-XXXX' : '••••••••••••'} 
                className="glass-input has-eye" 
              />
              <button 
                type="button" 
                className="pw-eye" 
                onClick={() => setShowPassword(v => !v)} 
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-0.5 pb-0.5">
            <label htmlFor="rememberMe" className="flex items-center gap-1.5 text-[11px] font-medium text-white cursor-pointer">
              <input 
                id="rememberMe" 
                type="checkbox" 
                checked={rememberMe} 
                onChange={e => setRememberMe(e.target.checked)} 
                className="rounded bg-white/10 border-white/40" 
              />
              Remember me
            </label>
            <span className="text-[10px] text-slate-200">
              {portalMode === 'client' 
                ? 'Parent & Independent Scholar' 
                : instituteTab === 'school' 
                ? 'Institutional Partner' 
                : instituteTab === 'staff' 
                ? 'Faculty & Tutor Portal' 
                : 'Enrolled Scholar'}
            </span>
          </div>

          <button 
            type="submit" 
            disabled={loading} 
            className="glass-submit-btn w-full mt-2 py-2.5 px-4 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2 cursor-pointer transition-all shadow-md active:scale-98"
          >
            {loading ? (
              <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            ) : (
              <span>
                {portalMode === 'client' 
                  ? 'Sign In as Client' 
                  : instituteTab === 'student' 
                  ? 'Access Student Portal' 
                  : instituteTab === 'school' 
                  ? 'Login as School Admin' 
                  : 'Login as Faculty Staff'}
              </span>
            )}
          </button>
        </form>

        {googleAllowed && (
          <div className="mt-3 pt-3 border-t border-white/15 text-center">
            <p className="text-[11px] font-medium text-slate-100/90 mb-2">
              {portalMode === 'client' 
                ? 'Quick client authentication' 
                : instituteTab === 'school' 
                ? 'School administrator Google sign-in' 
                : 'Staff Google sign-in'}
            </p>
            <button 
              type="button" 
              onClick={handleGoogle} 
              disabled={loading} 
              className="google-btn w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-white font-medium text-xs bg-white/10 border border-white/25 hover:bg-white/20 shadow-sm cursor-pointer"
            >
              <span aria-hidden="true" className="font-black text-sm text-amber-300">G</span>
              <span>Continue with Google</span>
            </button>
          </div>
        )}

        <div className="text-center pt-2.5 pb-0.5 text-xs text-slate-200">
          Are You New Member? <Link to="/register" className="text-white font-bold hover:underline ml-1">Sign UP</Link>
        </div>
        <div className="mt-3 flex items-center justify-center gap-1.5 text-[9px] text-slate-300/80">
          <ShieldCheck size={11} />Secure portal authentication
        </div>
      </div>
    </div>
  );
};

export default SecurePortalLogin;
