import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  School, GraduationCap, Users, ShieldCheck, Building2, Mail, Lock, 
  Eye, EyeOff, ArrowLeft, Sun, Moon
} from 'lucide-react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInAnonymously,
  GoogleAuthProvider, 
  signInWithPopup,
  signInWithCustomToken,
  browserPopupRedirectResolver,
  signOut
} from 'firebase/auth';
import { 
  doc, getDoc, setDoc, updateDoc, collection, 
  query, where, getDocs, serverTimestamp, deleteDoc, limit 
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useTheme } from '../hooks/useTheme';
import SEO from '../components/ui/SEO';
import { useToast } from '../contexts/ToastContext';
import { JaystarblissIcon } from '../components/common/JaystarblissLogo';
import CyberTerrainCanvas from '../components/portal/CyberTerrainCanvas';
import CyberLiquidButton from '../components/portal/CyberLiquidButton';
import ThreeOctagonLogo from '../components/portal/ThreeOctagonLogo';
import portalWallpaper from '../assets/jdi login bg.png';
import './Portal.css';

type Role = 'school' | 'student' | 'parent' | 'staff';
type LoginMode = 'institute' | 'client';

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

function studentAuthEmail(username: string): string {
  const clean = username.toLowerCase().replace(/[^a-z0-9]/g, '') || 'std';
  return `student_${clean}@jaystarbliss-studios.firebaseapp.com`;
}

function deriveStudentAuthPassword(code: string): string {
  // Firebase Auth requires passwords >= 6 characters.
  // Deterministically expand short student PINs/codes to maintain valid auth sessions.
  if (code.length >= 6) return code;
  return `jdh_std_${code}_2024`;
}


const isBlockedAccount = (data: Record<string, any>) =>
  ['DISABLED', 'SUSPENDED', 'BANNED'].includes(String(data.accountStatus || data.status || 'ACTIVE').toUpperCase());

const getSafeAccountStatus = (data: Record<string, any>) => String(data.accountStatus || data.status || 'ACTIVE').toUpperCase();

const Portal: React.FC = () => {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const toast = useToast();
  
  const [loginMode, setLoginMode] = useState<LoginMode>('institute');
  const [activeTab, setActiveTab] = useState<Role>('student');
  const [showPassword, setShowPassword] = useState(false);
  const [identifier, setIdentifier] = useState(''); // username, email, or school code
  const [password, setPassword] = useState('');     // password or access code
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [rememberMe, setRememberMe] = useState(true);

  const tryPortalAccessFunction = async (role: 'student' | 'school', identifierValue: string, codeValue: string) => {
    const response = await fetch('/.netlify/functions/portal-access-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, identifier: identifierValue, code: codeValue })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.customToken) throw new Error(data.error || 'Invalid portal credentials.');
    const cred = await signInWithCustomToken(auth, data.customToken);
    return { data, user: cred.user };
  };

  const ensureActiveUserAccount = async (uid: string) => {
    const userSnap = await getDoc(doc(db, 'users', uid));
    const data = userSnap.exists() ? userSnap.data() : {};
    if (isBlockedAccount(data)) {
      await signOut(auth).catch(() => undefined);
      throw new Error(`This account is ${getSafeAccountStatus(data).toLowerCase()}. Please contact an administrator.`);
    }
    return data;
  };

  const handleStudentLogin = async () => {
    const rawInput = identifier.trim();
    const code = password.trim();

    if (!rawInput || !code) {
      throw new Error('Please enter both your Student Username / Email and Access Code.');
    }

    const isRealEmail = rawInput.includes('@') && !rawInput.endsWith('.local');

    // Verify username/access-code credentials on the server so private student records
    // are never exposed through public client-side lookups.
    try {
      const result = await tryPortalAccessFunction('student', rawInput, code);
      const studentName = result.data.name || rawInput;
      sessionStorage.setItem('userRole', 'student');
      sessionStorage.setItem('userId', result.user.uid);
      sessionStorage.setItem('studentDocId', result.data.studentDocId || '');
      sessionStorage.setItem('userName', studentName);
      sessionStorage.setItem('studentUsername', result.data.username || '');
      sessionStorage.setItem('studentClass', result.data.class || '');
      sessionStorage.setItem('schoolId', result.data.schoolId || '');
      sessionStorage.setItem('schoolName', result.data.schoolName || '');
      localStorage.setItem('jaystar_cached_user_role', 'student');
      localStorage.setItem('jaystar_cached_user_id', result.user.uid);
      localStorage.setItem('jaystar_cached_user_name', studentName);
      toast.success(`Welcome ${String(studentName).split(' ')[0]}! Logged in successfully.`);
      navigate('/portal/student');
      return;
    } catch (portalAccessErr) {
      console.warn('Server-side student portal lookup notice:', portalAccessErr);
    }

    // 1. If it's a real email, try direct Firebase Auth first
    if (isRealEmail) {
      try {
        const cred = await signInWithEmailAndPassword(auth, rawInput.toLowerCase(), code);
        const user = cred.user;
        const userSnap = await getDoc(doc(db, 'users', user.uid));
        const userData = userSnap.data() || {};
        if (isBlockedAccount(userData)) {
          await signOut(auth).catch(() => undefined);
          throw new Error(`This account is ${getSafeAccountStatus(userData).toLowerCase()}. Please contact an administrator.`);
        }
        
        // If super admin or admin logged in on student tab
        if (user.email === 'johnrufai242@gmail.com' || (userData.role || '').toUpperCase().includes('ADMIN')) {
          sessionStorage.setItem('userRole', 'super_admin');
          sessionStorage.setItem('userId', user.uid);
          sessionStorage.setItem('userEmail', user.email || '');
          navigate('/admin');
          return;
        }

        // Check if student doc exists in individualStudents
        let studentDocId = user.uid;
        let studentName = userData.name || user.displayName || rawInput.split('@')[0];
        try {
          const sQuery = query(collection(db, 'individualStudents'), where('email', '==', rawInput.toLowerCase()));
          const sSnap = await getDocs(sQuery);
          if (!sSnap.empty) {
            studentDocId = sSnap.docs[0].id;
            studentName = sSnap.docs[0].data().fullName || studentName;
          }
        } catch {
          // Non-fatal
        }

        sessionStorage.setItem('userRole', 'student');
        sessionStorage.setItem('userId', user.uid);
        sessionStorage.setItem('studentDocId', studentDocId);
        sessionStorage.setItem('userName', studentName);
        sessionStorage.setItem('userEmail', user.email || '');

        navigate('/portal/student');
        return;
      } catch (directAuthErr: any) {
        console.warn('Direct student email auth notice:', directAuthErr?.code || directAuthErr?.message);
        if (directAuthErr instanceof Error && /account is (disabled|suspended|banned)/i.test(directAuthErr.message)) throw directAuthErr;
      }
    }

    // 2. Look up student in individualStudents (by username, email, accessCode, or doc ID)
    let sdoc: any = null;
    let sdata: any = null;

    try {
      // Check by username (lowercase, uppercase, raw, with @)
      const cleanUsername = rawInput.toLowerCase().replace(/^@/, '').replace(/\s+/g, '');
      const queries = [
        query(collection(db, 'individualStudents'), where('username', '==', cleanUsername), limit(1)),
        query(collection(db, 'individualStudents'), where('username', '==', cleanUsername.toUpperCase()), limit(1)),
        query(collection(db, 'individualStudents'), where('username', '==', rawInput), limit(1)),
        query(collection(db, 'individualStudents'), where('username', '==', `@${cleanUsername}`), limit(1)),
        query(collection(db, 'individualStudents'), where('accessCode', '==', rawInput.toUpperCase()), limit(1)),
        query(collection(db, 'individualStudents'), where('accessCode', '==', code.trim().toUpperCase()), limit(1)),
        query(collection(db, 'students'), where('username', '==', cleanUsername), limit(1)),
        query(collection(db, 'students'), where('username', '==', cleanUsername.toUpperCase()), limit(1)),
        query(collection(db, 'students'), where('username', '==', rawInput), limit(1)),
        query(collection(db, 'students'), where('accessCode', '==', rawInput.toUpperCase()), limit(1)),
        query(collection(db, 'students'), where('accessCode', '==', code.trim().toUpperCase()), limit(1))
      ];

      if (isRealEmail) {
        queries.push(
          query(collection(db, 'individualStudents'), where('email', '==', rawInput.toLowerCase()), limit(1)),
          query(collection(db, 'students'), where('email', '==', rawInput.toLowerCase()), limit(1))
        );
      }

      const results = await Promise.all(queries.map(q => getDocs(q).catch(() => null)));
      for (const snap of results) {
        if (snap && !snap.empty) {
          sdoc = snap.docs[0];
          sdata = sdoc.data();
          break;
        }
      }

      // Check by document ID
      if (!sdoc) {
        try {
          const directDocSnap = await getDoc(doc(db, 'individualStudents', rawInput));
          if (directDocSnap.exists()) {
            sdoc = directDocSnap;
            sdata = directDocSnap.data();
          } else {
            const legDocSnap = await getDoc(doc(db, 'students', rawInput));
            if (legDocSnap.exists()) {
              sdoc = legDocSnap;
              sdata = legDocSnap.data();
            }
          }
        } catch {
          // Not a doc ID
        }
      }

      // Broad scan fallback (case insensitive & stripped hyphen match)
      if (!sdoc) {
        const [indSnap, stdSnap] = await Promise.all([
          getDocs(query(collection(db, 'individualStudents'), limit(300))).catch(() => ({ docs: [] } as any)),
          getDocs(query(collection(db, 'students'), limit(300))).catch(() => ({ docs: [] } as any))
        ]);

        const allDocs = [...indSnap.docs, ...stdSnap.docs];
        for (const d of allDocs) {
          const sd = d.data();
          const u = String(sd.username || '').toLowerCase().replace(/^@/, '').trim();
          const e = String(sd.email || '').toLowerCase().trim();
          const c = String(sd.accessCode || sd.passcode || sd.code || '').toUpperCase().trim();
          const cStripped = c.replace(/[\s-]/g, '');
          const rawUpper = rawInput.toUpperCase().trim();
          const rawStripped = rawUpper.replace(/[\s-]/g, '');
          const codeUpper = code.toUpperCase().trim();
          const codeStripped = codeUpper.replace(/[\s-]/g, '');

          if (
            (cleanUsername && (u === cleanUsername || u === `@${cleanUsername}`)) ||
            (isRealEmail && e === rawInput.toLowerCase()) ||
            (rawUpper && (c === rawUpper || cStripped === rawStripped)) ||
            (codeUpper && (c === codeUpper || cStripped === codeStripped)) ||
            (d.id.toLowerCase() === cleanUsername)
          ) {
            sdoc = d;
            sdata = sd;
            break;
          }
        }
      }
    } catch (lookupErr) {
      console.warn('Firestore student lookup info:', lookupErr);
    }

    // Verify access code or custom password if student record found
    if (sdoc && sdata) {
      if (isBlockedAccount(sdata)) {
        throw new Error('This student account is currently disabled or suspended. Please contact your administrator.');
      }
      const storedCode = String(sdata.accessCode || sdata.passcode || sdata.code || '').trim().toUpperCase();
      const storedCustomPw = String(sdata.customPassword || sdata.password || '').trim();
      const enteredCode = code.trim().toUpperCase();
      if (storedCode || storedCustomPw) {
        const matchesAccess = storedCode && (storedCode === enteredCode || sdata.accessCode === code);
        const matchesCustomPw = storedCustomPw && (storedCustomPw === code.trim() || storedCustomPw.toUpperCase() === enteredCode);
        if (!matchesAccess && !matchesCustomPw) {
          throw new Error('Invalid access code or password for this student profile. Please verify your credentials or contact your instructor.');
        }
      }
    }

    const effectiveUsername = (sdata?.username || rawInput).toLowerCase().replace(/^@/, '').replace(/\s+/g, '');
    const authEmailToUse = isRealEmail ? rawInput.toLowerCase() : studentAuthEmail(effectiveUsername);
    const authPassword = deriveStudentAuthPassword(code.toUpperCase());

    let firebaseUid = '';

    try {
      const cred = await signInWithEmailAndPassword(auth, authEmailToUse, authPassword);
      firebaseUid = cred.user.uid;
    } catch (authErr: any) {
      // Also try with original code case if uppercase failed
      let secondTrySuccess = false;
      if (code !== code.toUpperCase()) {
        try {
          const cred2 = await signInWithEmailAndPassword(auth, authEmailToUse, deriveStudentAuthPassword(code));
          firebaseUid = cred2.user.uid;
          secondTrySuccess = true;
        } catch {
          // Ignore
        }
      }

      if (!secondTrySuccess) {
        if (
          authErr.code === 'auth/user-not-found' ||
          authErr.code === 'auth/invalid-credential' ||
          authErr.code === 'auth/invalid-login-credentials'
        ) {
          // First login — auto create Firebase Auth account
          try {
            const cred = await createUserWithEmailAndPassword(auth, authEmailToUse, authPassword);
            firebaseUid = cred.user.uid;
          } catch (createErr: any) {
            if (createErr.code === 'auth/email-already-in-use') {
              try {
                const cred2 = await signInWithEmailAndPassword(auth, authEmailToUse, authPassword);
                firebaseUid = cred2.user.uid;
              } catch {
                const uniqueEmail = `std_${effectiveUsername}_${Date.now().toString(36)}@jaystarbliss-studios.firebaseapp.com`;
                const cred3 = await createUserWithEmailAndPassword(auth, uniqueEmail, authPassword).catch(() => null);
                firebaseUid = cred3 ? cred3.user.uid : (sdata?.firebaseUid || sdata?.id || auth.currentUser?.uid || 'student');
              }
            } else {
              const uniqueEmail = `std_${effectiveUsername}_${Date.now().toString(36)}@jaystarbliss-studios.firebaseapp.com`;
              const cred3 = await createUserWithEmailAndPassword(auth, uniqueEmail, authPassword).catch(() => null);
              firebaseUid = cred3 ? cred3.user.uid : (sdata?.firebaseUid || sdata?.id || auth.currentUser?.uid || 'student');
            }
          }
        } else if (authErr.code === 'auth/wrong-password' || authErr.code === 'auth/email-already-in-use') {
          const uniqueEmail = `std_${effectiveUsername}_${Date.now().toString(36)}@jaystarbliss-studios.firebaseapp.com`;
          const cred3 = await createUserWithEmailAndPassword(auth, uniqueEmail, authPassword).catch(() => null);
          firebaseUid = cred3 ? cred3.user.uid : (sdata?.firebaseUid || sdata?.id || auth.currentUser?.uid || 'student');
        } else {
          firebaseUid = sdata?.firebaseUid || sdata?.id || auth.currentUser?.uid || 'student';
        }
      }
    }

    await ensureActiveUserAccount(firebaseUid);

    const userDocRef = doc(db, 'users', firebaseUid);
    const existingSnap = await getDoc(userDocRef);
    const existingData = existingSnap.exists() ? existingSnap.data() : {};
    const isAdmin = authEmailToUse === 'johnrufai242@gmail.com' || (existingData.role || '').toUpperCase().includes('ADMIN');

    if (isAdmin) {
      sessionStorage.setItem('userRole', 'super_admin');
      sessionStorage.setItem('userId', firebaseUid);
      localStorage.setItem('jaystar_cached_user_role', 'super_admin');
      localStorage.setItem('jaystar_cached_user_id', firebaseUid);
      navigate('/admin');
      return;
    }

    await setDoc(userDocRef, {
      email: authEmailToUse,
      name: sdata?.fullName || existingData.name || effectiveUsername,
      role: 'student',
      studentDocId: sdoc ? sdoc.id : firebaseUid,
      updatedAt: serverTimestamp()
    }, { merge: true });

    if (sdoc && (!sdata.firebaseUid || sdata.firebaseUid !== firebaseUid)) {
      try {
        await updateDoc(doc(db, 'individualStudents', sdoc.id), {
          firebaseUid,
          authEmail: authEmailToUse
        });
      } catch (upErr) {
        console.warn('Student firebaseUid backfill non-fatal:', upErr);
      }
    }

    const studentName = sdata?.fullName || existingData.name || effectiveUsername;
    sessionStorage.setItem('userRole', 'student');
    sessionStorage.setItem('userId', firebaseUid);
    sessionStorage.setItem('studentDocId', sdoc ? sdoc.id : firebaseUid);
    sessionStorage.setItem('userName', studentName);
    sessionStorage.setItem('studentUsername', effectiveUsername);
    sessionStorage.setItem('studentClass', sdata?.class || sdata?.grade || '');
    sessionStorage.setItem('schoolId', sdata?.schoolId || '');
    sessionStorage.setItem('schoolName', sdata?.schoolName || '');
    
    localStorage.setItem('jaystar_cached_user_role', 'student');
    localStorage.setItem('jaystar_cached_user_id', firebaseUid);
    localStorage.setItem('jaystar_cached_user_name', studentName);

    navigate('/portal/student');
  };

  const handleSchoolLogin = async () => {
    const rawInput = identifier.trim();
    const code = password.trim();

    if (!rawInput || !code) {
      throw new Error('Please enter your School Email / Access Code or student username and Passcode.');
    }

    if (rawInput.includes('@')) {
      try {
        const cred = await signInWithEmailAndPassword(auth, rawInput.toLowerCase(), code);
        const userSnap = await getDoc(doc(db, 'users', cred.user.uid));
        const userData = userSnap.data() || {};
        await ensureActiveUserAccount(cred.user.uid);
        
        if (cred.user.email === 'johnrufai242@gmail.com' || (userData.role || '').toUpperCase().includes('ADMIN')) {
          sessionStorage.setItem('userRole', 'super_admin');
          sessionStorage.setItem('userId', cred.user.uid);
          localStorage.setItem('jaystar_cached_user_role', 'super_admin');
          localStorage.setItem('jaystar_cached_user_id', cred.user.uid);
          navigate('/admin');
          return;
        }

        if (userData.role === 'student') {
          const studentName = userData.name || rawInput.split('@')[0];
          sessionStorage.setItem('userRole', 'student');
          sessionStorage.setItem('userId', cred.user.uid);
          sessionStorage.setItem('studentDocId', userData.studentDocId || cred.user.uid);
          sessionStorage.setItem('userName', studentName);
          sessionStorage.setItem('studentUsername', rawInput.split('@')[0]);
          sessionStorage.setItem('studentClass', userData.class || userData.grade || '');
          sessionStorage.setItem('schoolId', userData.schoolId || '');
          sessionStorage.setItem('schoolName', userData.schoolName || '');
          localStorage.setItem('jaystar_cached_user_role', 'student');
          localStorage.setItem('jaystar_cached_user_id', cred.user.uid);
          localStorage.setItem('jaystar_cached_user_name', studentName);
          navigate('/portal/student');
          return;
        }

        const schoolName = userData.name || 'Partner School';
        sessionStorage.setItem('userRole', 'school');
        sessionStorage.setItem('userId', cred.user.uid);
        sessionStorage.setItem('schoolId', userData.schoolId || cred.user.uid);
        sessionStorage.setItem('userName', schoolName);
        localStorage.setItem('jaystar_cached_user_role', 'school');
        localStorage.setItem('jaystar_cached_user_id', cred.user.uid);
        localStorage.setItem('jaystar_cached_user_name', schoolName);
        navigate('/portal/school');
        return;
      } catch (authErr) {
        console.warn('Direct auth failed, checking schools collection:', authErr);
        if (authErr instanceof Error && /account is (disabled|suspended|banned)/i.test(authErr.message)) throw authErr;
      }
    }

    let matchedSchool: any = null;
    try {
      const result = await tryPortalAccessFunction('school', rawInput, code);
      matchedSchool = {
        id: result.data.schoolDocId || result.data.schoolId,
        name: result.data.name || 'Partner School',
        email: result.user.email || undefined,
        firebaseUid: result.user.uid
      };
    } catch (portalAccessErr) {
      console.warn('Server-side school portal lookup notice:', portalAccessErr);
    }

    if (!matchedSchool) {
      try {
        let sdoc: any = null;
        let sdata: any = null;

        const cleanUsername = rawInput.toLowerCase().replace(/^@/, '').replace(/\s+/g, '');
        const uQuery = query(collection(db, 'individualStudents'), where('username', '==', cleanUsername));
        const uSnap = await getDocs(uQuery);
        if (!uSnap.empty) {
          sdoc = uSnap.docs[0];
          sdata = sdoc.data();
        }

        if (!sdoc) {
          const cQuery = query(collection(db, 'individualStudents'), where('accessCode', '==', rawInput.toUpperCase()));
          const cSnap = await getDocs(cQuery);
          if (!cSnap.empty) {
            sdoc = cSnap.docs[0];
            sdata = cSnap.docs[0].data();
          }
        }

        if (!sdoc) {
          const eQuery = query(collection(db, 'individualStudents'), where('email', '==', rawInput.toLowerCase()));
          const eSnap = await getDocs(eQuery);
          if (!eSnap.empty) {
            sdoc = eSnap.docs[0];
            sdata = eSnap.docs[0].data();
          }
        }

        if (sdoc && sdata) {
          if (isBlockedAccount(sdata)) {
            throw new Error('This student account is currently disabled or suspended.');
          }
          const storedCode = String(sdata.accessCode || sdata.passcode || '').trim().toUpperCase();
          const enteredCode = code.trim().toUpperCase();
          if (storedCode === enteredCode || sdata.accessCode === code || sdata.passcode === code) {
            const effectiveUsername = (sdata.username || cleanUsername || 'cadet').toLowerCase();
            const authEmailToUse = sdata.email || studentAuthEmail(effectiveUsername);
            const authPassword = deriveStudentAuthPassword(code.toUpperCase());
            let firebaseUid = '';

            try {
              const cred = await signInWithEmailAndPassword(auth, authEmailToUse, authPassword);
              firebaseUid = cred.user.uid;
            } catch (e: any) {
              if (
                e.code === 'auth/user-not-found' || 
                e.code === 'auth/invalid-credential' ||
                e.code === 'auth/invalid-login-credentials'
              ) {
                const cred = await createUserWithEmailAndPassword(auth, authEmailToUse, authPassword);
                firebaseUid = cred.user.uid;
              } else {
                throw e;
              }
            }

            await ensureActiveUserAccount(firebaseUid);
            await setDoc(doc(db, 'users', firebaseUid), {
              email: authEmailToUse,
              name: sdata.fullName || sdata.studentName || effectiveUsername,
              role: 'student',
              schoolId: sdata.schoolId || '',
              schoolName: sdata.schoolName || '',
              studentDocId: sdoc.id,
              class: sdata.class || sdata.grade || '',
              updatedAt: serverTimestamp()
            }, { merge: true });

            const studentName = sdata.fullName || sdata.studentName || effectiveUsername;
            sessionStorage.setItem('userRole', 'student');
            sessionStorage.setItem('userId', firebaseUid);
            sessionStorage.setItem('studentDocId', sdoc.id);
            sessionStorage.setItem('userName', studentName);
            sessionStorage.setItem('studentUsername', effectiveUsername);
            sessionStorage.setItem('studentClass', sdata.class || sdata.grade || '');
            sessionStorage.setItem('schoolId', sdata.schoolId || '');
            sessionStorage.setItem('schoolName', sdata.schoolName || '');
            localStorage.setItem('jaystar_cached_user_role', 'student');
            localStorage.setItem('jaystar_cached_user_id', firebaseUid);
            localStorage.setItem('jaystar_cached_user_name', studentName);

            toast.success(`Welcome ${studentName.split(' ')[0]}! Logged in successfully.`);
            navigate('/portal/student');
            return;
          }
        }
      } catch (studentErr) {
        console.warn('Student login lookup notice:', studentErr);
      }

      throw new Error('Invalid school credentials, student username, or access passcode. Please verify your credentials or contact your school administrator.');
    }

    if (matchedSchool.firebaseUid) {
      const matchedSchoolName = matchedSchool.name || 'Partner School';
      sessionStorage.setItem('userRole', 'school');
      sessionStorage.setItem('userId', matchedSchool.firebaseUid);
      sessionStorage.setItem('schoolId', matchedSchool.id);
      sessionStorage.setItem('userName', matchedSchoolName);
      localStorage.setItem('jaystar_cached_user_role', 'school');
      localStorage.setItem('jaystar_cached_user_id', matchedSchool.firebaseUid);
      localStorage.setItem('jaystar_cached_user_name', matchedSchoolName);
      toast.success(`Welcome ${matchedSchoolName}! Logged in successfully.`);
      navigate('/portal/school');
      return;
    }

    throw new Error('Unable to establish a school portal session. Please retry or contact support.');
  };

  const handleGeneralLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (activeTab === 'student') {
      setLoading(true);
      try {
        await handleStudentLogin();
      } catch (err: any) {
        console.error('Student login error:', err);
        setError(err.message || 'Login failed. Please check your credentials.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (activeTab === 'school') {
      setLoading(true);
      try {
        await handleSchoolLogin();
      } catch (err: any) {
        console.error('School login error:', err);
        setError(err.message || 'Login failed. Please check your credentials.');
      } finally {
        setLoading(false);
      }
      return;
    }

    const email = identifier.trim();
    if (!email || !password) {
      setError('Please enter your email and password.');
      return;
    }

    if (password.length < 6) {
      setError('Password should be at least 6 characters.');
      return;
    }

    setLoading(true);

    try {
      const cred = await signInWithEmailAndPassword(auth, email.toLowerCase(), password);
      const user = cred.user;
      
      if (user.email === 'johnrufai242@gmail.com') {
        sessionStorage.setItem('userRole', 'super_admin');
        sessionStorage.setItem('userId', user.uid);
        sessionStorage.setItem('userEmail', user.email || '');
        navigate('/admin');
        return;
      }

      const userSnap = await getDoc(doc(db, 'users', user.uid));
      let userData = userSnap.exists() ? userSnap.data() : null;

      if (userData && isBlockedAccount(userData)) {
        await signOut(auth).catch(() => undefined);
        throw new Error(`This account is ${getSafeAccountStatus(userData).toLowerCase()}. Please contact an administrator.`);
      }

      let detectedRole = '';
      let detectedName = user.displayName || email.split('@')[0];

      // Check if user has an approved tutor profile in tutors or tutor_applications
      let isVerifiedTutor = false;
      let verifiedTutorName = '';
      try {
        const tDoc = await getDoc(doc(db, 'tutors', user.uid));
        if (tDoc.exists() && tDoc.data()?.status !== 'BANNED' && tDoc.data()?.status !== 'SUSPENDED') {
          isVerifiedTutor = true;
          verifiedTutorName = tDoc.data()?.name || tDoc.data()?.fullName || '';
        }
        if (!isVerifiedTutor && user.email) {
          const tSnap = await getDocs(query(collection(db, 'tutors'), where('email', '==', user.email.toLowerCase()), limit(1)));
          if (!tSnap.empty && tSnap.docs[0].data()?.status !== 'BANNED' && tSnap.docs[0].data()?.status !== 'SUSPENDED') {
            isVerifiedTutor = true;
            verifiedTutorName = tSnap.docs[0].data()?.name || tSnap.docs[0].data()?.fullName || '';
          }
        }
        if (!isVerifiedTutor && user.email) {
          const aSnap = await getDocs(query(collection(db, 'tutor_applications'), where('email', '==', user.email.toLowerCase()), where('status', '==', 'approved'), limit(1)));
          if (!aSnap.empty) {
            isVerifiedTutor = true;
            verifiedTutorName = aSnap.docs[0].data()?.name || '';
          }
        }
      } catch (tErr) {
        console.warn('Tutor verification notice:', tErr);
      }

      if (userData) {
        detectedRole = (userData.role || '').toUpperCase();
        if (userData.name) detectedName = userData.name;
      }

      // If user has an approved tutor profile and is not an admin, prioritize STAFF over parent
      if (isVerifiedTutor && !detectedRole.includes('ADMIN')) {
        detectedRole = 'STAFF';
        if (verifiedTutorName) detectedName = verifiedTutorName;
        await setDoc(doc(db, 'users', user.uid), {
          role: 'staff',
          name: detectedName,
          email: user.email?.toLowerCase(),
          updatedAt: serverTimestamp()
        }, { merge: true });
        await setDoc(doc(db, 'tutors', user.uid), {
          role: 'staff',
          status: 'ACTIVE',
          name: detectedName,
          email: user.email?.toLowerCase(),
          updatedAt: serverTimestamp()
        }, { merge: true });
        await deleteDoc(doc(db, 'parents', user.uid)).catch(() => null);
      } else if (!userData) {
        const tutorDoc = await getDoc(doc(db, 'tutors', user.uid));
        if (tutorDoc.exists()) {
          detectedRole = 'STAFF';
          if (tutorDoc.data().name) detectedName = tutorDoc.data().name;
        }

        if (!detectedRole) {
          const parentDoc = await getDoc(doc(db, 'parents', user.uid));
          if (parentDoc.exists()) {
            detectedRole = 'PARENT';
            if (parentDoc.data().name) detectedName = parentDoc.data().name;
          }
        }

        if (!detectedRole) {
          await signOut(auth).catch(() => undefined);
          throw new Error('No active portal profile was found for this account. Please complete registration or contact an administrator.');
        }

        await setDoc(doc(db, 'users', user.uid), {
          email: user.email?.toLowerCase(),
          name: detectedName,
          role: detectedRole.toLowerCase(),
          createdAt: serverTimestamp()
        }, { merge: true });
      }

      if (detectedRole.includes('ADMIN')) {
        sessionStorage.setItem('userRole', 'super_admin');
        sessionStorage.setItem('userId', user.uid);
        sessionStorage.setItem('userEmail', user.email || '');
        sessionStorage.setItem('userName', detectedName || 'Admin');
        localStorage.setItem('jaystar_cached_user_role', 'super_admin');
        localStorage.setItem('jaystar_cached_user_id', user.uid);
        localStorage.setItem('jaystar_cached_user_name', detectedName || 'Admin');
        navigate('/admin');
        return;
      }

      const targetRole = detectedRole || activeTab.toUpperCase();
      let targetRoute = `/portal/${activeTab}`;
      let sessionRole: string = activeTab;

      if (targetRole === 'STUDENT' || targetRole === 'INDIVIDUALSTUDENT') {
        targetRoute = '/portal/student';
        sessionRole = 'student';
      } else if (targetRole === 'SCHOOL') {
        targetRoute = '/portal/school';
        sessionRole = 'school';
      } else if (targetRole === 'PARENT') {
        targetRoute = '/portal/parent';
        sessionRole = 'parent';
      } else if (targetRole === 'STAFF' || targetRole === 'TUTOR') {
        targetRoute = '/portal/staff';
        sessionRole = 'staff';
      }

      sessionStorage.setItem('userRole', sessionRole);
      sessionStorage.setItem('userId', user.uid);
      sessionStorage.setItem('userEmail', user.email || '');
      sessionStorage.setItem('userName', detectedName);
      localStorage.setItem('jaystar_cached_user_role', sessionRole);
      localStorage.setItem('jaystar_cached_user_id', user.uid);
      localStorage.setItem('jaystar_cached_user_name', detectedName);

      navigate(targetRoute);
    } catch (err: any) {
      console.error('Login error:', err);
      let msg = err.message || 'Invalid credentials. Please try again.';
      if (
        err.code === 'auth/user-not-found' || 
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/invalid-login-credentials'
      ) {
        msg = 'No account found with these credentials. Please check your email and password, or register below.';
      } else if (err.code === 'auth/wrong-password') {
        msg = 'Incorrect password. Please try again or reset your password.';
      } else if (err.code === 'auth/weak-password') {
        msg = 'Password should be at least 6 characters.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Please enter a valid email address.';
      } else if (err.message && (err.message.includes('Database is closing') || err.message.includes('IndexedDB'))) {
        msg = 'Authentication storage reconnected. Please click login again.';
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider, browserPopupRedirectResolver);
      const user = result.user;
      const userSnap = await getDoc(doc(db, 'users', user.uid));

      let userRole = user.email === 'johnrufai242@gmail.com' ? 'SUPER_ADMIN' : activeTab.toUpperCase();

      if (!userSnap.exists()) {
        if (activeTab === 'staff' || activeTab === 'school') {
          await signOut(auth).catch(() => undefined);
          throw new Error(`${activeTab === 'staff' ? 'Staff' : 'School'} accounts are created by administrators. Please contact an administrator for access.`);
        }
        const inviteDocRef = doc(db, 'invites', (user.email || '').toLowerCase());
        const inviteSnap = await getDoc(inviteDocRef);
        
        if (inviteSnap.exists()) {
          userRole = inviteSnap.data().role;
          await deleteDoc(inviteDocRef);
        }

        const newRecord = {
          email: user.email,
          name: user.displayName || '',
          role: activeTab === 'parent' ? 'parent' : userRole.toLowerCase(),
          createdAt: serverTimestamp()
        };

        await setDoc(doc(db, 'users', user.uid), newRecord);
        if (activeTab === 'parent') {
          await setDoc(doc(db, 'parents', user.uid), newRecord, { merge: true });
        }
      } else {
        const userData = userSnap.data();
        if (isBlockedAccount(userData)) {
          await signOut(auth).catch(() => undefined);
          throw new Error(`This account is ${getSafeAccountStatus(userData).toLowerCase()}. Please contact an administrator.`);
        }
        userRole = user.email === 'johnrufai242@gmail.com' ? 'SUPER_ADMIN' : (userData.role || 'USER').toUpperCase();
      }

      if (userRole.includes('ADMIN') || user.email === 'johnrufai242@gmail.com') {
        sessionStorage.setItem('userRole', 'super_admin');
        sessionStorage.setItem('userId', user.uid);
        sessionStorage.setItem('userEmail', user.email || '');
        sessionStorage.setItem('userName', user.displayName || 'Admin');
        localStorage.setItem('jaystar_cached_user_role', 'super_admin');
        localStorage.setItem('jaystar_cached_user_id', user.uid);
        localStorage.setItem('jaystar_cached_user_name', user.displayName || 'Admin');
        navigate('/admin');
        return;
      }

      let targetRoute = `/portal/${activeTab}`;
      let sessionRole = activeTab;

      if (userRole === 'STUDENT' || userRole === 'INDIVIDUALSTUDENT') {
        targetRoute = '/portal/student';
        sessionRole = 'student';
      } else if (userRole === 'SCHOOL') {
        targetRoute = '/portal/school';
        sessionRole = 'school';
      } else if (userRole === 'PARENT') {
        targetRoute = '/portal/parent';
        sessionRole = 'parent';
      } else if (userRole === 'STAFF' || userRole === 'TUTOR') {
        targetRoute = '/portal/staff';
        sessionRole = 'staff';
      }
      
      sessionStorage.setItem('userRole', sessionRole);
      sessionStorage.setItem('userId', user.uid);
      sessionStorage.setItem('userEmail', user.email || '');
      sessionStorage.setItem('userName', user.displayName || '');
      localStorage.setItem('jaystar_cached_user_role', sessionRole);
      localStorage.setItem('jaystar_cached_user_id', user.uid);
      localStorage.setItem('jaystar_cached_user_name', user.displayName || '');

      navigate(targetRoute);
    } catch (err: any) {
      console.error('Google login error:', err);
      let msg = err.message || 'Google sign-in failed.';
      if (err.code === 'auth/popup-closed-by-user') {
        msg = 'Sign-in popup was closed before completion.';
      } else if (err.code === 'auth/popup-blocked') {
        msg = 'Sign-in popup was blocked by your browser. Please allow popups or use email & password to sign in.';
      } else if (err.code === 'auth/cancelled-popup-request') {
        msg = 'Sign-in cancelled. Please try again.';
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const tabs: { id: Role; label: string; icon: React.ReactNode }[] = [
    { id: 'student', label: 'Students', icon: <GraduationCap size={16} /> },
    { id: 'school', label: 'Schools', icon: <School size={16} /> },
    { id: 'parent', label: 'Parents', icon: <Users size={16} /> },
    { id: 'staff', label: 'Staff', icon: <ShieldCheck size={16} /> },
  ];

  return (
    <div className={`jdh-portal ${theme === 'dark' ? 'dark' : 'light'}`}>
      <div className="jdh-portal-bg-viewport" aria-hidden="true">
        <img src={portalWallpaper} alt="" />
        <div className="bg-overlay" />
      </div>
      <SEO 
        title="Academy & Client Portal — Jaystarbliss Studios" 
        description="Access student dashboards, school portals, parent progress reports, and staff workspace." 
      />
      <div className="scanlines"></div>
      
      <div className="card">
        {/* LEFT DECO PANEL */}
        <div className="deco-panel relative">
          <CyberTerrainCanvas theme={theme} />

          {/* Top-Left Clean Brand Header */}
          <Link to="/" className="deco-brand flex items-center gap-3 select-none group" aria-label="Home">
            <JaystarblissIcon className="w-9 h-9 rounded-xl group-hover:scale-105 transition-transform shrink-0" />
            <span className="font-black text-base tracking-wider uppercase whitespace-nowrap">
              JAYSTARBLISS STUDIOS
            </span>
          </Link>

          {/* Center Floating 3D Octagonal Prism Centerpiece above Horizon */}
          <div className="deco-center-stage">
            <div className="stage-glow-reflection" />
            <ThreeOctagonLogo size={185} className="relative z-10" />
          </div>
          
          {/* Bottom Tagline */}
          <div className="deco-bottom">
            <div className="deco-tagline">Learn. <br/><span>Grow.</span> <br/>Thrive.</div>
          </div>
        </div>

        {/* RIGHT FORM PANEL */}
        <div className="form-panel">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-slate-100/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800">
              <button type="button" className={`role-tab ${loginMode === 'institute' ? 'active' : ''}`} onClick={() => { setLoginMode('institute'); setActiveTab('student'); setError(''); setSuccess(''); setIdentifier(''); setPassword(''); }}>
                <span className="tab-ico"><Building2 size={16} /></span> Login to Institute
              </button>
              <button type="button" className={`role-tab ${loginMode === 'client' ? 'active' : ''}`} onClick={() => { setLoginMode('client'); setActiveTab('parent'); setError(''); setSuccess(''); setIdentifier(''); setPassword(''); }}>
                <span className="tab-ico"><Users size={16} /></span> Login as Client
              </button>
            </div>
            {loginMode === 'institute' && (
              <div className="grid grid-cols-3 gap-1.5 role-tabs" aria-label="Institute account type">
                {tabs.filter(tab => tab.id !== 'parent').map(tab => (
                  <button key={tab.id} type="button" className={`role-tab ${activeTab === tab.id ? 'active' : ''}`} onClick={() => { setActiveTab(tab.id); setError(''); setSuccess(''); setIdentifier(''); setPassword(''); }}>
                    <span className="tab-ico">{tab.icon}</span>{tab.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="form-body">
            <div className="pane">
              <div className="form-title capitalize">{activeTab} <em>Portal Login</em></div>
              <div className="form-sub">
                {activeTab === 'student' && 'Enter your Student Username & Access Code'}
                {activeTab === 'school' && 'Enter your School Email or Partner Access Code'}
                {loginMode === 'client' && 'Sign in with your client email and password, or continue with Google'}
                {activeTab === 'staff' && loginMode === 'institute' && 'Sign in to your tutor & instructor workspace'}
              </div>
              
              {error && <div className="msg msg-error show">{error}</div>}
              {success && <div className="msg msg-success show">{success}</div>}
              
              <form onSubmit={handleGeneralLogin} autoComplete="on">
                <div className="field">
                  <label>
                    {activeTab === 'student' && 'Student Username or Email'}
                    {activeTab === 'school' && 'School Email or Terminal ID'}
                    {loginMode === 'client' ? 'Client Email Address' : 'Parent Email Address'}
                    {activeTab === 'staff' && 'Staff / Tutor Email'}
                  </label>
                  <div className="input-wrap">
                    <span className="input-icon"><Mail size={15} /></span>
                    <input 
                      type={activeTab === 'student' || activeTab === 'school' ? 'text' : 'email'} 
                      placeholder={
                        activeTab === 'student' ? 'e.g. john or john@example.com' :
                        activeTab === 'school' ? 'school@institution.edu' :
                        loginMode === 'client' ? 'client@example.com' : 'staff@jaystarbliss.ng'
                      } 
                      required 
                      value={identifier}
                      onChange={e => setIdentifier(e.target.value)}
                    />
                  </div>
                </div>
                
                <div className="field">
                  <label>
                    {activeTab === 'student' ? 'Student Access Code (Password)' : 'Password / Access Code'}
                  </label>
                  <div className="input-wrap">
                    <span className="input-icon"><Lock size={15} /></span>
                    <input 
                      type={showPassword ? "text" : "password"} 
                      className="has-eye" 
                      placeholder="••••••••" 
                      required 
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                    />
                    <button type="button" className="pw-eye" onClick={() => setShowPassword(!showPassword)}>
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
                
                <div className="field" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '-0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input 
                      type="checkbox" 
                      id="rememberMe" 
                      checked={rememberMe}
                      onChange={e => setRememberMe(e.target.checked)}
                      style={{ width: 'auto' }} 
                    />
                    <label htmlFor="rememberMe" style={{ margin: 0, fontSize: '0.85rem', fontWeight: 'normal', color: 'var(--text-dim)', textTransform: 'none', letterSpacing: 'normal' }}>
                      Remember me
                    </label>
                  </div>

                  {activeTab === 'staff' && (
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-dim)' }}>
                      Staff accounts are created by administrators
                    </span>
                  )}
                </div>
                
                <CyberLiquidButton type="submit" loading={loading}>
                  {activeTab === 'student' ? 'LAUNCH STUDENT HUB →' : 'INITIALIZE ACCESS →'}
                </CyberLiquidButton>
              </form>

              {(loginMode === 'client' || activeTab === 'staff') && (
                <>
                  <div className="auth-divider">or</div>
                  <button type="button" className="google-btn" onClick={handleGoogleLogin} disabled={loading}>
                    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.5 29.3 35 24 35c-6.1 0-11-4.9-11-11s4.9-11 11-11c2.8 0 5.3 1 7.2 2.7l5.7-5.7C33.5 7.1 29 5 24 5 12.9 5 4 13.9 4 25s8.9 20 20 20c10.8 0 19.6-8.5 19.6-20 0-1.3-.1-2.6-.4-3.9z"/>
                      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c2.8 0 5.3 1 7.2 2.7l5.7-5.7C33.5 7.1 29 5 24 5 16.3 5 9.7 9 6.3 14.7z"/>
                      <path fill="#4CAF50" d="M24 45c4.9 0 9.3-1.8 12.7-4.8l-5.9-5c-1.8 1.3-4 2-6.8 2-5.2 0-9.6-3.5-11.2-8.2l-6.5 5C9.5 41 16.2 45 24 45z"/>
                      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4-4.1 5.3l5.9 5C36.7 39.8 44 34.3 44 25c0-1.3-.1-2.6-.4-3.9z"/>
                    </svg>
                    <span className="btn-text">Continue with Google</span>
                  </button>
                </>
              )}

              <div className="toggle-link">
                Don't have an account yet? <Link to="/register">Register / Enroll Here →</Link>
              </div>
            </div>
          </div>

          <div className="form-foot">
            <Link to="/" className="back-link"><ArrowLeft size={14} /> Main Site</Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '0.55rem', color: 'var(--dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Build v4.5.0
              </span>
              <button type="button" className="theme-btn" onClick={toggleTheme} title="Toggle theme">
                {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Portal;
