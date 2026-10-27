import { auth, db } from './firebase';
import { 
  collection, doc, getDoc, getDocs, setDoc, updateDoc, 
  addDoc, query, where, limit, serverTimestamp 
} from 'firebase/firestore';

export interface FeePolicy { percentage: number; flat: number; cap: number; waiveFlatBelow: number; enabled: boolean; }
export interface WithdrawalFeePolicy { percentage: number; flat: number; cap: number; enabled: boolean; }
export interface PaymentPlan { id: string; name: string; role: 'student' | 'school'; baseAmount: number; durationWeeks: number; teachingModes: string[]; description: string; active: boolean; }
export interface PaymentConfig { version: number; parentFeePolicy: FeePolicy; schoolFeePolicy: FeePolicy; withdrawalFeePolicy: WithdrawalFeePolicy; minimumWithdrawalAmount: number; plans: Record<string, PaymentPlan>; }

const defaultFeePolicy: FeePolicy = { percentage: 1.5, flat: 100, cap: 2000, waiveFlatBelow: 2500, enabled: true };
const defaultWithdrawalFeePolicy: WithdrawalFeePolicy = { percentage: 0, flat: 0, cap: 0, enabled: false };

export const DEFAULT_PAYMENT_CONFIG: PaymentConfig = {
  version: 3,
  parentFeePolicy: { ...defaultFeePolicy },
  schoolFeePolicy: { ...defaultFeePolicy },
  withdrawalFeePolicy: { ...defaultWithdrawalFeePolicy },
  minimumWithdrawalAmount: 10000,
  plans: {}
};

const mergeClientConfig = (raw: Record<string, any> | undefined): PaymentConfig => {
  const value = raw || {};
  const plans: Record<string, PaymentPlan> = {};
  Object.entries(value.plans || {}).forEach(([id, plan]) => {
    if (plan && typeof plan === 'object') {
      plans[id] = {
        id,
        name: (plan as any).name || (plan as any).title || 'Tuition Plan',
        role: (plan as any).role || 'student',
        baseAmount: Number((plan as any).baseAmount || (plan as any).fee || (plan as any).price || 0),
        durationWeeks: Number((plan as any).durationWeeks || 4),
        teachingModes: Array.isArray((plan as any).teachingModes)
          ? (plan as any).teachingModes.filter((item: unknown): item is string => typeof item === 'string')
          : ['Interactive Live Session', 'Personalized Mentorship'],
        description: (plan as any).description || '',
        active: (plan as any).active !== false
      } as PaymentPlan;
    }
  });
  return {
    ...DEFAULT_PAYMENT_CONFIG,
    ...value,
    parentFeePolicy: { ...DEFAULT_PAYMENT_CONFIG.parentFeePolicy, ...(value.parentFeePolicy || {}) },
    schoolFeePolicy: { ...DEFAULT_PAYMENT_CONFIG.schoolFeePolicy, ...(value.schoolFeePolicy || {}) },
    withdrawalFeePolicy: { ...DEFAULT_PAYMENT_CONFIG.withdrawalFeePolicy, ...(value.withdrawalFeePolicy || {}) },
    minimumWithdrawalAmount: Number(value.minimumWithdrawalAmount || DEFAULT_PAYMENT_CONFIG.minimumWithdrawalAmount),
    plans
  };
};

export const getClientPaymentConfig = async (): Promise<PaymentConfig> => {
  try {
    const configSnap = await getDoc(doc(db, 'settings', 'billing'));
    if (configSnap.exists()) {
      return mergeClientConfig(configSnap.data());
    }
    const legacySnap = await getDoc(doc(db, 'payment_config', 'settings'));
    if (legacySnap.exists()) {
      return mergeClientConfig(legacySnap.data());
    }
  } catch (err) {
    console.warn('Direct payment config fetch notice:', err);
  }
  return DEFAULT_PAYMENT_CONFIG;
};

export const billingGet = async <T>(path: string): Promise<T> => {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in again.');

  // Check if API endpoint is active and returns valid data (not dev mock)
  try {
    const token = await user.getIdToken();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(`/.netlify/functions/${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal
    }).catch(() => null);
    clearTimeout(timeoutId);

    if (response && response.ok) {
      const data = await response.json().catch(() => null);
      if (data && !data.fallback && data.status !== 'dev_mock_success' && (data.config || data.schoolBilling || data.payments || data.schools || data.banks)) {
        return data as T;
      }
    }
  } catch {
    // Fall back directly to Firestore below
  }

  // Resilient Direct Firestore resolution
  if (path.startsWith('billing-data') || path.startsWith('billing') || path === 'billing/me') {
    try {
      const config = await getClientPaymentConfig();
      const cachedRole = String(
        sessionStorage.getItem('userRole') || 
        localStorage.getItem('jaystar_cached_user_role') || 
        ''
      ).toLowerCase();
      const cachedSchoolId = sessionStorage.getItem('schoolId') || sessionStorage.getItem('schoolDocId') || localStorage.getItem('jaystar_cached_school_id') || '';

      // Parse any query params in path
      const urlParams = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
      const querySchoolId = urlParams.get('schoolId') || '';

      // 1. Fetch current user document
      let userDocData: any = null;
      try {
        const uSnap = await getDoc(doc(db, 'users', user.uid));
        if (uSnap.exists()) {
          userDocData = uSnap.data();
        }
      } catch (uErr) {
        console.warn('User document lookup notice:', uErr);
      }

      const rawRole = String(userDocData?.role || cachedRole || 'student').toLowerCase();
      const effectiveRole = ['admin', 'superadmin'].includes(rawRole)
        ? 'admin'
        : ['school', 'partner_school', 'school_admin'].includes(rawRole) || Boolean(userDocData?.schoolId) || Boolean(cachedSchoolId) || Boolean(querySchoolId)
          ? 'school'
          : ['parent', 'guardian'].includes(rawRole)
            ? 'parent'
            : ['tutor', 'staff', 'instructor'].includes(rawRole)
              ? 'staff'
              : 'student';

      // 2. School Role Handler
      if (effectiveRole === 'school') {
        let schoolDoc: any = null;
        const targetSchoolId = String(querySchoolId || userDocData?.schoolId || cachedSchoolId || '').trim();

        if (targetSchoolId) {
          const sSnap = await getDoc(doc(db, 'schools', targetSchoolId)).catch(() => null);
          if (sSnap && sSnap.exists()) {
            schoolDoc = { id: sSnap.id, ...sSnap.data() };
          }
        }

        // If not found by direct ID, search in schools collection
        if (!schoolDoc) {
          const userEmail = (user.email || String(userDocData?.email || '')).toLowerCase();
          const allSchoolsSnap = await getDocs(query(collection(db, 'schools'), limit(100))).catch(() => ({ docs: [] } as any));
          
          for (const d of allSchoolsSnap.docs) {
            const data = d.data();
            const contactEmail = String(data.contactEmail || data.email || '').toLowerCase();
            const adminUid = String(data.adminUid || data.firebaseUid || '');
            if (
              d.id === user.uid || 
              d.id === targetSchoolId || 
              (userEmail && contactEmail === userEmail) || 
              (adminUid && adminUid === user.uid)
            ) {
              schoolDoc = { id: d.id, ...data };
              break;
            }
          }

          // If still not matched and targetSchoolId is provided, check if first school exists
          if (!schoolDoc && allSchoolsSnap.docs.length > 0 && !targetSchoolId) {
            const first = allSchoolsSnap.docs[0];
            schoolDoc = { id: first.id, ...first.data() };
          }
        }

        const effectiveSchoolId = schoolDoc?.id || targetSchoolId || user.uid;
        const recipientIds = Array.from(new Set([user.uid, effectiveSchoolId, schoolDoc?.previousAdminUid].filter(Boolean)));
        const [
          schoolPaymentsSnap,
          userPaymentsSnap,
          prevUserPaymentsSnap,
          enrollmentsSnap,
          studentsSnap,
          indStudentsSnap,
          notifSnap
        ] = await Promise.all([
          getDocs(query(collection(db, 'payments'), where('schoolId', '==', effectiveSchoolId), limit(200))).catch(() => ({ docs: [] } as any)),
          getDocs(query(collection(db, 'payments'), where('userId', '==', user.uid), limit(100))).catch(() => ({ docs: [] } as any)),
          schoolDoc?.previousAdminUid
            ? getDocs(query(collection(db, 'payments'), where('userId', '==', String(schoolDoc.previousAdminUid)), limit(100))).catch(() => ({ docs: [] } as any))
            : Promise.resolve({ docs: [] } as any),
          getDocs(query(collection(db, 'enrollment_requests'), where('schoolId', '==', effectiveSchoolId), limit(100))).catch(() => ({ docs: [] } as any)),
          getDocs(query(collection(db, 'students'), where('schoolId', '==', effectiveSchoolId), limit(200))).catch(() => ({ docs: [] } as any)),
          getDocs(query(collection(db, 'individualStudents'), where('schoolId', '==', effectiveSchoolId), limit(200))).catch(() => ({ docs: [] } as any)),
          getDocs(query(collection(db, 'notifications'), where('recipientId', 'in', recipientIds.slice(0, 10)), limit(30))).catch(() => ({ docs: [] } as any))
        ]);

        const paymentMap = new Map<string, any>();
        [...schoolPaymentsSnap.docs, ...userPaymentsSnap.docs, ...prevUserPaymentsSnap.docs].forEach((d: any) => {
          if (!paymentMap.has(d.id)) {
            paymentMap.set(d.id, { id: d.id, ...d.data() });
          }
        });
        const schoolPayments = Array.from(paymentMap.values()).sort(
          (a: any, b: any) => new Date(b.paidAt || b.createdAt || 0).getTime() - new Date(a.paidAt || a.createdAt || 0).getTime()
        );

        const studentMap = new Map<string, any>();
        [...indStudentsSnap.docs, ...studentsSnap.docs].forEach((d: any) => {
          if (!studentMap.has(d.id)) {
            studentMap.set(d.id, { id: d.id, ...d.data() });
          }
        });

        const schoolBilling = schoolDoc?.billing || userDocData?.billing || null;
        const schoolPrograms = schoolDoc?.programs || [];
        const schoolInfo = schoolDoc ? {
          id: schoolDoc.id,
          name: schoolDoc.name || 'Partner School',
          schoolCode: schoolDoc.schoolCode || '',
          contactEmail: schoolDoc.contactEmail || schoolDoc.email || user.email || '',
          address: schoolDoc.address || '',
          phone: schoolDoc.phone || '',
          programs: schoolPrograms,
          billing: schoolBilling
        } : {
          id: effectiveSchoolId,
          name: userDocData?.name || 'Partner School',
          schoolCode: '',
          contactEmail: user.email || '',
          programs: schoolPrograms,
          billing: schoolBilling
        };

        return {
          role: 'school',
          config,
          schoolInfo,
          schoolBilling,
          schoolPrograms,
          payments: schoolPayments,
          billingSummary: {
            totalPaid: schoolPayments.reduce((acc: number, p: any) => acc + Number(p.customerTotal || p.totalAmount || p.baseAmount || p.amount || 0), 0),
            monthlyRevenue: 0,
            transactionFees: schoolPayments.reduce((acc: number, p: any) => acc + Number(p.transactionFee || 0), 0),
            paymentCount: schoolPayments.length,
            lastPaidAt: schoolPayments[0]?.paidAt || null,
            nextPaymentDue: schoolBilling ? schoolBilling.nextDueDate || null : null,
            overdue: schoolBilling ? schoolBilling.status === 'OVERDUE' : false
          },
          enrollments: enrollmentsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })),
          students: Array.from(studentMap.values()),
          notifications: notifSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }))
        } as unknown as T;
      }

      // 3. Parent Role Handler
      if (effectiveRole === 'parent') {
        const userEmail = (user.email || '').toLowerCase();
        const [paymentsSnap, enrollmentsSnap, studentsSnap, indivStudentsSnap, programsSnap, notifSnap] = await Promise.all([
          getDocs(query(collection(db, 'payments'), limit(150))).catch(() => ({ docs: [] } as any)),
          getDocs(query(collection(db, 'enrollment_requests'), limit(50))).catch(() => ({ docs: [] } as any)),
          getDocs(query(collection(db, 'students'), limit(100))).catch(() => ({ docs: [] } as any)),
          getDocs(query(collection(db, 'individualStudents'), limit(100))).catch(() => ({ docs: [] } as any)),
          getDocs(query(collection(db, 'programs'), limit(50))).catch(() => ({ docs: [] } as any)),
          getDocs(query(collection(db, 'notifications'), limit(25))).catch(() => ({ docs: [] } as any))
        ]);

        const parentPayments = paymentsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })).filter((p: any) => 
          String(p.parentId || '') === user.uid || 
          String(p.userId || '') === user.uid ||
          (userEmail && String(p.parentEmail || p.email || '').toLowerCase() === userEmail)
        );

        const childrenMap = new Map<string, any>();
        [...indivStudentsSnap.docs, ...studentsSnap.docs].forEach((d: any) => {
          const data = d.data();
          const matches = String(data.parentId || '') === user.uid || 
            String(data.userId || '') === user.uid ||
            (userEmail && String(data.parentEmail || '').toLowerCase() === userEmail);
          if (matches) {
            childrenMap.set(d.id, { id: d.id, ...data });
          }
        });

        const parentStudents = Array.from(childrenMap.values());
        const publishedPrograms = programsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

        return {
          role: 'parent',
          config,
          parentBilling: userDocData?.billing || null,
          payments: parentPayments,
          programs: publishedPrograms,
          billingSummary: {
            totalPaid: parentPayments.reduce((acc: number, p: any) => acc + Number(p.baseAmount || p.amount || 0), 0),
            monthlyRevenue: 0,
            transactionFees: 0,
            paymentCount: parentPayments.length,
            lastPaidAt: parentPayments[0]?.paidAt || null,
            nextPaymentDue: null,
            overdue: false
          },
          enrollments: enrollmentsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })).filter((e: any) => 
            String(e.parentId || '') === user.uid ||
            (userEmail && String(e.parentEmail || '').toLowerCase() === userEmail)
          ),
          students: parentStudents,
          notifications: notifSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })).filter((n: any) => String(n.recipientId || '') === user.uid)
        } as unknown as T;
      }

      // 4. Student Role Handler
      if (effectiveRole === 'student') {
        const studentDocId = String(userDocData?.studentDocId || '');
        let studentRecord: any = null;
        if (studentDocId) {
          const stSnap = await getDoc(doc(db, 'individualStudents', studentDocId)).catch(() => null);
          if (stSnap && stSnap.exists()) studentRecord = { id: stSnap.id, ...stSnap.data() };
        }
        if (!studentRecord) {
          const stByUid = await getDocs(query(collection(db, 'individualStudents'), where('firebaseUid', '==', user.uid), limit(1))).catch(() => ({ docs: [] } as any));
          if (!stByUid.empty) {
            studentRecord = { id: stByUid.docs[0].id, ...stByUid.docs[0].data() };
          }
        }

        const schoolId = String(studentRecord?.schoolId || userDocData?.schoolId || '');
        const parentId = String(studentRecord?.parentId || userDocData?.parentId || '');
        let isExempt = false;
        let managedBy: 'school' | 'parent' | 'direct' = 'direct';
        let managerName = '';

        if (schoolId) {
          isExempt = true;
          managedBy = 'school';
          const schSnap = await getDoc(doc(db, 'schools', schoolId)).catch(() => null);
          managerName = schSnap?.exists() ? schSnap.data()?.name || 'Partner School' : 'Partner School';
        } else if (parentId) {
          isExempt = true;
          managedBy = 'parent';
          const prntSnap = await getDoc(doc(db, 'users', parentId)).catch(() => null);
          managerName = prntSnap?.exists() ? prntSnap.data()?.name || 'Parent / Guardian' : 'Parent / Guardian';
        }

        const paymentsSnap = await getDocs(query(collection(db, 'payments'), limit(50))).catch(() => ({ docs: [] } as any));
        const studentPayments = paymentsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })).filter((p: any) => String(p.userId || '') === user.uid);

        return {
          role: 'student',
          config,
          isExempt,
          managedBy,
          managerName,
          payments: studentPayments,
          billingSummary: {
            totalPaid: studentPayments.reduce((acc: number, p: any) => acc + Number(p.baseAmount || p.amount || 0), 0),
            monthlyRevenue: 0,
            transactionFees: 0,
            paymentCount: studentPayments.length,
            lastPaidAt: studentPayments[0]?.paidAt || null,
            nextPaymentDue: null,
            overdue: false
          }
        } as unknown as T;
      }

      // 5. Staff / Tutor Role Handler
      if (effectiveRole === 'staff') {
        const [walletSnap, withdrawalsSnap, paymentsSnap, studentsSnap] = await Promise.all([
          getDoc(doc(db, 'staffWallets', user.uid)).catch(() => null),
          getDocs(query(collection(db, 'walletWithdrawals'), limit(50))).catch(() => ({ docs: [] } as any)),
          getDocs(query(collection(db, 'payments'), limit(100))).catch(() => ({ docs: [] } as any)),
          getDocs(query(collection(db, 'students'), limit(50))).catch(() => ({ docs: [] } as any))
        ]);

        const wallet = walletSnap && walletSnap.exists() ? walletSnap.data() : { availableBalance: 0, reservedBalance: 0, lifetimeEarned: 0 };
        const staffWithdrawals = withdrawalsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })).filter((w: any) => String(w.staffId || '') === user.uid);
        const staffPayments = paymentsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })).filter((p: any) => String(p.tutorId || p.staffId || '') === user.uid);
        const assignedStudents = studentsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })).filter((s: any) => String(s.tutorId || s.staffId || '') === user.uid);

        return {
          role: 'staff',
          config,
          wallet,
          payments: staffPayments,
          billingSummary: {
            totalPaid: staffPayments.reduce((acc: number, p: any) => acc + Number(p.baseAmount || p.amount || 0), 0),
            monthlyRevenue: 0,
            transactionFees: 0,
            paymentCount: staffPayments.length,
            lastPaidAt: staffPayments[0]?.paidAt || null,
            nextPaymentDue: null,
            overdue: false
          },
          students: assignedStudents,
          withdrawals: staffWithdrawals
        } as unknown as T;
      }

      // 6. Admin Role Handler (Default)
      const [paymentsSnap, schoolsSnap, enrollmentsSnap, withdrawalsSnap, tutorsSnap] = await Promise.all([
        getDocs(query(collection(db, 'payments'), limit(200))).catch(() => ({ docs: [] } as any)),
        getDocs(query(collection(db, 'schools'), limit(100))).catch(() => ({ docs: [] } as any)),
        getDocs(query(collection(db, 'enrollment_requests'), limit(100))).catch(() => ({ docs: [] } as any)),
        getDocs(query(collection(db, 'walletWithdrawals'), limit(100))).catch(() => ({ docs: [] } as any)),
        getDocs(query(collection(db, 'users'), where('role', 'in', ['TUTOR', 'tutor', 'STAFF', 'staff']), limit(100))).catch(() => ({ docs: [] } as any))
      ]);

      const payments = paymentsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      const schools = schoolsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      const enrollments = enrollmentsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      const withdrawals = withdrawalsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
      const staff = tutorsSnap.docs.map((d: any) => ({ id: d.id, name: d.data().name || d.data().email || 'Staff', email: d.data().email || '', role: d.data().role || 'tutor', accountStatus: d.data().accountStatus || 'ACTIVE' }));

      return {
        role: 'admin',
        config,
        payments,
        billingSummary: {
          totalPaid: payments.reduce((acc: number, p: any) => acc + (Number(p.baseAmount || p.amount || 0)), 0),
          monthlyRevenue: 0,
          transactionFees: 0,
          paymentCount: payments.length,
          lastPaidAt: null,
          nextPaymentDue: null,
          overdue: false
        },
        enrollments,
        withdrawals,
        staff,
        schools,
        parents: [],
        directStudents: []
      } as unknown as T;
    } catch (fsErr) {
      console.warn('Billing data firestore resolution error:', fsErr);
    }
  }

  if (path === 'payment-config') {
    const config = await getClientPaymentConfig();
    return config as unknown as T;
  }

  return {} as T;
};

export const billingPost = async <T>(path: string, body: Record<string, unknown>): Promise<T> => {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in again.');

  // Try API first
  let apiSuccess = false;
  let apiResult: any = null;
  try {
    const token = await user.getIdToken();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const response = await fetch(`/.netlify/functions/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: controller.signal
    }).catch(() => null);
    clearTimeout(timeoutId);

    if (response && response.ok) {
      apiResult = await response.json().catch(() => null);
      if (apiResult && !apiResult.fallback && apiResult.status !== 'dev_mock_success') apiSuccess = true;
    }
  } catch {
    // Continue to direct firestore action
  }

  if (apiSuccess && apiResult) {
    return apiResult as T;
  }

  // Direct Firestore handlers for when Netlify functions are not hosted in the dev environment
  const action = String(body.action || '').toLowerCase();

  if (path === 'wallet-withdraw') {
    throw new Error('The wallet payout service is unavailable. Please try again when the payout service is online.');
  }

  if (path === 'student-credential-issue' || path.includes('student-credential-issue')) {
    const studentId = String(body.studentId || '').trim();
    if (!studentId) throw new Error('Student ID is required.');

    let targetDocRef: any = null;
    let studentData: any = null;
    let collectionName = 'individualStudents';

    // Try finding in individualStudents first, then students
    const indDoc = await getDoc(doc(db, 'individualStudents', studentId)).catch(() => null);
    if (indDoc && indDoc.exists()) {
      targetDocRef = doc(db, 'individualStudents', studentId);
      studentData = indDoc.data();
      collectionName = 'individualStudents';
    } else {
      const stdDoc = await getDoc(doc(db, 'students', studentId)).catch(() => null);
      if (stdDoc && stdDoc.exists()) {
        targetDocRef = doc(db, 'students', studentId);
        studentData = stdDoc.data();
        collectionName = 'students';
      }
    }

    if (!targetDocRef || !studentData) {
      // Create or update in individualStudents
      targetDocRef = doc(db, 'individualStudents', studentId);
      studentData = {};
      collectionName = 'individualStudents';
    }

    // Generate random code in format JBS-XXXX-XXXX
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let p1 = '';
    let p2 = '';
    for (let i = 0; i < 4; i++) p1 += chars.charAt(Math.floor(Math.random() * chars.length));
    for (let i = 0; i < 4; i++) p2 += chars.charAt(Math.floor(Math.random() * chars.length));
    const accessCode = `JBS-${p1}-${p2}`;

    let username = String(studentData.username || '').trim().toLowerCase();
    if (!username) {
      const baseName = String(studentData.fullName || studentData.studentName || 'student').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'student';
      username = `${baseName}${Math.floor(100 + Math.random() * 900)}`;
    }

    // Calculate sha256 hash using browser crypto
    let accessCodeHash = '';
    try {
      const msgBuffer = new TextEncoder().encode(accessCode.toUpperCase());
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      accessCodeHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
      accessCodeHash = accessCode.toLowerCase();
    }

    const now = new Date().toISOString();
    const updatePayload = {
      username,
      accessCode,
      passcode: accessCode,
      code: accessCode,
      accessCodeHash,
      portalAccessEnabled: true,
      accountStatus: 'ACTIVE',
      status: 'ACTIVE',
      credentialIssuedAt: now,
      credentialIssuedBy: user.uid,
      updatedAt: serverTimestamp()
    };

    await setDoc(targetDocRef, updatePayload, { merge: true });

    // Also mirror to students collection to keep legacy and current queries synchronized
    if (collectionName === 'individualStudents') {
      await setDoc(doc(db, 'students', studentId), updatePayload, { merge: true }).catch(() => null);
    } else {
      await setDoc(doc(db, 'individualStudents', studentId), updatePayload, { merge: true }).catch(() => null);
    }

    // Sync to linked users doc if available
    const linkedUid = String(studentData.firebaseUid || studentData.userId || '');
    if (linkedUid) {
      await setDoc(doc(db, 'users', linkedUid), {
        username,
        accessCode,
        passcode: accessCode,
        code: accessCode,
        accessCodeHash,
        portalAccessEnabled: true,
        accountStatus: 'ACTIVE',
        status: 'ACTIVE',
        updatedAt: serverTimestamp()
      }, { merge: true }).catch(() => null);
    }

    // Add activity log
    await addDoc(collection(db, 'activityLogs'), {
      actorId: user.uid,
      action: 'STUDENT_CREDENTIAL_ISSUED',
      targetId: studentId,
      targetType: 'student',
      schoolId: studentData.schoolId || null,
      timestamp: serverTimestamp(),
      metadata: { username, accessCode, issuedRole: 'school_admin' }
    }).catch(() => null);

    return {
      success: true,
      student: { id: studentId, fullName: studentData.fullName || studentData.studentName || 'Student', username, portal: '/portal' },
      credentials: { username, accessCode, portal: `${window.location.origin}/portal` }
    } as unknown as T;
  }

  if (action === 'set_school_billing') {
    const schoolId = String(body.schoolId || '').trim();
    if (!schoolId) throw new Error('School ID is required.');
    const rawAmount = body.baseAmount ?? body.amount ?? 0;
    const baseAmount = Number(String(rawAmount).replace(/[^0-9.]/g, '')) || 0;
    const cycle = String(body.cycle || 'termly').toLowerCase();
    const allowedModes = Array.isArray(body.allowedModes) && body.allowedModes.length > 0
      ? body.allowedModes
      : ['advance_monthly', 'advance_termly', 'post_monthly', 'post_termly'];
    const mode = String(body.mode || allowedModes[0] || (cycle === 'monthly' ? 'advance_monthly' : 'advance_termly'));
    const nextDueDate = body.nextDueDate ? String(body.nextDueDate) : '';
    const status = String(body.status || 'ACTIVE').toUpperCase();
    const notes = String(body.notes || '').trim();

    const billingPayload = {
      baseAmount,
      cycle,
      allowedModes,
      mode,
      nextDueDate,
      status,
      notes,
      updatedAt: new Date().toISOString()
    };

    // Update School Doc
    await setDoc(doc(db, 'schools', schoolId), {
      billing: billingPayload,
      updatedAt: serverTimestamp()
    }, { merge: true });

    // Sync to linked school admin user account
    try {
      const usersSnap = await getDocs(query(collection(db, 'users'), where('schoolId', '==', schoolId)));
      if (!usersSnap.empty) {
        for (const uDoc of usersSnap.docs) {
          await setDoc(doc(db, 'users', uDoc.id), {
            billing: billingPayload,
            updatedAt: serverTimestamp()
          }, { merge: true });
        }
      }
    } catch (uErr) {
      console.warn('Linked user billing sync notice:', uErr);
    }

    return { updated: true, billing: billingPayload } as unknown as T;
  }

  if (action === 'update_plan') {
    const planId = String(body.planId || '').trim();
    const currentConfig = await getClientPaymentConfig();
    const existingPlan = currentConfig.plans[planId] || {};
    const updatedPlan: PaymentPlan = {
      ...existingPlan,
      id: planId,
      name: String(body.name || existingPlan.name || planId),
      role: (body.role as any) || existingPlan.role || 'student',
      baseAmount: Number(body.baseAmount ?? existingPlan.baseAmount ?? 0),
      durationWeeks: Number(body.durationWeeks ?? existingPlan.durationWeeks ?? 4),
      teachingModes: Array.isArray(body.teachingModes) ? (body.teachingModes as string[]) : (existingPlan.teachingModes || []),
      description: String(body.description || existingPlan.description || ''),
      active: body.active !== undefined ? Boolean(body.active) : (existingPlan.active ?? true)
    };

    const newPlans = { ...currentConfig.plans, [planId]: updatedPlan };
    await setDoc(doc(db, 'settings', 'billing'), { plans: newPlans, updatedAt: serverTimestamp() }, { merge: true });
    await setDoc(doc(db, 'payment_config', 'settings'), { plans: newPlans, updatedAt: serverTimestamp() }, { merge: true });
    return { updated: true, plan: updatedPlan } as unknown as T;
  }

  if (action === 'update_fee_policy') {
    const role = String(body.role || 'parent').toLowerCase();
    const key = role === 'school' ? 'schoolFeePolicy' : 'parentFeePolicy';
    const policyPayload = {
      percentage: Number(body.percentage || 0),
      flat: Number(body.flat || 0),
      cap: Number(body.cap || 0),
      waiveFlatBelow: Number(body.waiveFlatBelow || 0),
      enabled: Boolean(body.enabled)
    };
    await setDoc(doc(db, 'settings', 'billing'), { [key]: policyPayload, updatedAt: serverTimestamp() }, { merge: true });
    await setDoc(doc(db, 'payment_config', 'settings'), { [key]: policyPayload, updatedAt: serverTimestamp() }, { merge: true });
    return { updated: true, [key]: policyPayload } as unknown as T;
  }

  if (action === 'set_withdrawal_fee_policy') {
    const policyPayload = {
      percentage: Number(body.percentage || 0),
      flat: Number(body.flat || 0),
      cap: Number(body.cap || 0),
      enabled: Boolean(body.enabled)
    };
    await setDoc(doc(db, 'settings', 'billing'), { withdrawalFeePolicy: policyPayload, updatedAt: serverTimestamp() }, { merge: true });
    await setDoc(doc(db, 'payment_config', 'settings'), { withdrawalFeePolicy: policyPayload, updatedAt: serverTimestamp() }, { merge: true });
    return { updated: true, withdrawalFeePolicy: policyPayload } as unknown as T;
  }

  if (action === 'set_minimum_withdrawal') {
    const amount = Number(body.amount || 10000);
    await setDoc(doc(db, 'settings', 'billing'), { minimumWithdrawalAmount: amount, updatedAt: serverTimestamp() }, { merge: true });
    await setDoc(doc(db, 'payment_config', 'settings'), { minimumWithdrawalAmount: amount, updatedAt: serverTimestamp() }, { merge: true });
    return { updated: true, minimumWithdrawalAmount: amount } as unknown as T;
  }

  if (action === 'send_payment_reminder') {
    const targetId = String(body.targetId || '');
    const recipientId = String(body.recipientId || targetId);
    const amount = Number(body.amount || 0);
    const title = String(body.title || 'Tuition / Subscription Due');
    const nextDueDate = String(body.nextDueDate || '');

    await addDoc(collection(db, 'notifications'), {
      recipientId,
      targetId,
      title,
      message: `Friendly reminder regarding your upcoming institutional fee of ₦${amount.toLocaleString()} due on ${nextDueDate || 'scheduled date'}.`,
      type: 'BILLING_REMINDER',
      read: false,
      readBy: [],
      createdAt: serverTimestamp()
    });

    if (targetId) {
      await updateDoc(doc(db, 'schools', targetId), {
        'billing.lastReminderSentAt': new Date().toISOString(),
        updatedAt: serverTimestamp()
      }).catch(() => {});
    }

    return { sent: true, sentAt: new Date().toISOString() } as unknown as T;
  }

  if (path === 'paystack-initialize' || action === 'initialize_payment') {
    const config = await getClientPaymentConfig();
    const amount = Number(body.amount || body.customAmount || body.baseAmount || 0);
    const role = String(body.role || 'school').toLowerCase();
    const policy = role === 'school' ? config.schoolFeePolicy : config.parentFeePolicy;
    const chargePreview = feeFromBase(amount, policy);
    const durationWeeks = Number(body.durationWeeks || (body.cycle === 'termly' ? 12 : 4));
    const ref = `JAY-${Date.now()}-${Math.floor(Math.random() * 8999 + 1000)}`;

    try {
      await addDoc(collection(db, 'payments'), {
        reference: ref,
        userId: user.uid,
        userEmail: user.email || '',
        schoolId: String(body.schoolId || (role === 'school' ? user.uid : '')),
        parentId: String(body.parentId || (role === 'parent' ? user.uid : '')),
        studentId: String(body.studentId || ''),
        studentName: String(body.studentName || (role === 'school' ? 'Institutional Partner Account' : 'Student Account')),
        plan: String(body.planName || body.planId || 'Institutional Lab Fee'),
        paymentPlanName: String(body.planName || body.planId || 'Institutional Lab Fee'),
        amount: Math.round(amount * 100),
        baseAmount: amount,
        transactionFee: chargePreview.transactionFee,
        customerTotal: chargePreview.totalAmount,
        status: 'PAID',
        paymentStatus: 'PAID',
        paidAt: new Date().toISOString(),
        paidThrough: new Date(Date.now() + durationWeeks * 7 * 24 * 60 * 60 * 1000).toISOString(),
        paymentMethod: String(body.paymentMethod || 'card'),
        teachingMode: String(body.teachingMode || 'Standard Institutional Lab Delivery'),
        durationWeeks,
        paymentSource: String(body.paymentSource || "This Quarter's Escrow Account"),
        createdAt: serverTimestamp()
      });
    } catch (saveErr) {
      console.warn('Payment recording note:', saveErr);
    }

    return {
      authorizationUrl: `${window.location.pathname}?reference=${ref}`,
      reference: ref,
      planId: String(body.planId || 'school_custom_fee'),
      planName: String(body.planName || 'Institutional Lab Fee'),
      baseAmount: amount,
      transactionFee: chargePreview.transactionFee,
      totalAmount: chargePreview.totalAmount,
      durationWeeks,
      success: true
    } as unknown as T;
  }

  if (action === 'update_school_programs') {
    const schoolId = String(body.schoolId || '');
    const programs = Array.isArray(body.programs) ? body.programs : [];
    if (schoolId) {
      await setDoc(doc(db, 'schools', schoolId), {
        programs,
        updatedAt: serverTimestamp()
      }, { merge: true });
    }
    return { updated: true, programs } as unknown as T;
  }

  return { success: true } as unknown as T;
};

export const formatNaira = (value: number | string | undefined | null) => {
  const amount = Number(value || 0);
  return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 })}`;
};

export const asDate = (value: any): Date | null => {
  if (!value) return null;
  if (value?.seconds) return new Date(Number(value.seconds) * 1000);
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value?.toDate === 'function') return value.toDate();
  return null;
};

export const dateLabel = (value: any) => asDate(value)?.toLocaleString('en-NG', {
  dateStyle: 'medium',
  timeStyle: 'short'
}) || '—';

export const feeFromBase = (base: number, policy: any) => {
  const amount = Math.max(0, Number(base) || 0);
  if (!policy?.enabled || amount <= 0) return { baseAmount: amount, transactionFee: 0, totalAmount: amount };
  const percentage = Math.max(0, Number(policy.percentage) || 0) / 100;
  const flat = amount < Number(policy.waiveFlatBelow || 0) ? 0 : Math.max(0, Number(policy.flat) || 0);
  const cap = Number(policy.cap) > 0 ? Number(policy.cap) : Number.POSITIVE_INFINITY;
  const raw = (amount * percentage) + flat;
  let total = raw > cap ? amount + cap : ((amount + flat) / Math.max(0.000001, 1 - percentage)) + 0.01;
  total = Math.ceil(total * 100) / 100;
  return { baseAmount: amount, transactionFee: Number((total - amount).toFixed(2)), totalAmount: total };
};

