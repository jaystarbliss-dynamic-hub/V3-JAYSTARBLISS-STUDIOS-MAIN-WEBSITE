import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db, getAllClientDatabases } from './firebase';

export function normalizeUsername(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 32);
}

export interface UsernameCheckResult {
  available: boolean;
  cleanUsername: string;
  reason?: string;
  suggestion?: string;
}

const USERNAME_COLLECTIONS = [
  'users',
  'individualStudents',
  'students',
  'parents',
  'tutors',
  'staff',
  'schools',
] as const;

/**
 * Checks across the entire system (all account collections + global `usernames` registry)
 * whether a username is already taken by another user.
 */
export async function checkUsernameAvailability(
  rawUsername: string,
  excludeIds: (string | null | undefined)[] = []
): Promise<UsernameCheckResult> {
  const cleanUsername = normalizeUsername(rawUsername);

  if (!cleanUsername || cleanUsername.length < 3) {
    return {
      available: false,
      cleanUsername,
      reason: 'Username must be at least 3 characters (letters, numbers, underscores, dots, or hyphens).',
    };
  }

  const excludedSet = new Set(
    excludeIds
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  );

  const isExcludedDoc = (docId: string, data: Record<string, any> = {}): boolean => {
    if (excludedSet.has(docId)) return true;
    const candidateIds = [
      data.uid,
      data.userId,
      data.firebaseUid,
      data.studentDocId,
      data.studentId,
      data.ownerId,
      data.id,
    ]
      .map((v) => String(v || '').trim())
      .filter(Boolean);
    return candidateIds.some((cid) => excludedSet.has(cid));
  };

  const variants = Array.from(
    new Set([cleanUsername, cleanUsername.toUpperCase(), String(rawUsername || '').trim()])
  ).filter(Boolean);

  const allDbs = getAllClientDatabases();

  try {
    // 1. Check canonical `usernames/{cleanUsername}` index first
    for (const dbInst of allDbs) {
      const regSnap = await getDoc(doc(dbInst, 'usernames', cleanUsername)).catch(() => null);
      if (regSnap?.exists()) {
        const regData = regSnap.data() || {};
        if (!isExcludedDoc(regSnap.id, regData) && regData.ownerId && !excludedSet.has(String(regData.ownerId))) {
          const suggestion = `${cleanUsername}_${Math.floor(100 + Math.random() * 900)}`;
          return {
            available: false,
            cleanUsername,
            suggestion,
            reason: `The username "@${cleanUsername}" is already taken. Please pick another username (for example: ${suggestion}).`,
          };
        }
      }
    }

    // 2. Check all user/student/parent/staff/school collections across all client databases
    for (const dbInst of allDbs) {
      const queries = USERNAME_COLLECTIONS.flatMap((colName) =>
        variants.map((variant) =>
          getDocs(query(collection(dbInst, colName), where('username', '==', variant), limit(5))).catch(
            () => null
          )
        )
      );

      const snapshots = await Promise.all(queries);
      for (const snap of snapshots) {
        if (!snap || snap.empty) continue;
        for (const matchedDoc of snap.docs) {
          const data = matchedDoc.data() || {};
          if (!isExcludedDoc(matchedDoc.id, data)) {
            const suggestion = `${cleanUsername}_${Math.floor(100 + Math.random() * 900)}`;
            return {
              available: false,
              cleanUsername,
              suggestion,
              reason: `The username "@${cleanUsername}" is already taken by another account. Please pick another username (e.g., ${suggestion}).`,
            };
          }
        }
      }
    }
  } catch (err) {
    console.warn('Username availability check warning:', err);
  }

  return {
    available: true,
    cleanUsername,
  };
}

/**
 * Reserves a username in the global `usernames/{cleanUsername}` registry across databases.
 */
export async function claimGlobalUsername(
  rawUsername: string,
  ownerInfo: {
    ownerId?: string;
    uid?: string;
    docId?: string;
    role: string;
    fullName?: string;
    name?: string;
    email?: string | null;
  }
): Promise<void> {
  const cleanUsername = normalizeUsername(rawUsername);
  const resolvedOwnerId = String(ownerInfo.ownerId || ownerInfo.uid || ownerInfo.docId || '').trim();
  if (!cleanUsername || cleanUsername.length < 3 || !resolvedOwnerId) return;

  const payload = {
    username: cleanUsername,
    ownerId: resolvedOwnerId,
    uid: ownerInfo.uid || resolvedOwnerId,
    docId: ownerInfo.docId || resolvedOwnerId,
    role: String(ownerInfo.role || 'USER').toUpperCase(),
    fullName: ownerInfo.fullName || ownerInfo.name || '',
    email: ownerInfo.email ? String(ownerInfo.email).toLowerCase().trim() : null,
    updatedAt: serverTimestamp(),
  };

  await Promise.all(
    getAllClientDatabases().map((dbInst) =>
      setDoc(doc(dbInst, 'usernames', cleanUsername), payload, { merge: true }).catch(() => null)
    )
  );
}

/**
 * Generates a guaranteed globally-unique username based on a base candidate.
 */
export async function ensureUniqueGeneratedUsername(
  baseCandidate: string,
  excludeIds: (string | null | undefined)[] = []
): Promise<string> {
  const base = normalizeUsername(baseCandidate) || 'scholar';
  const firstCheck = await checkUsernameAvailability(base, excludeIds);
  if (firstCheck.available) {
    return firstCheck.cleanUsername;
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    const suffix =
      attempt < 4
        ? String(Math.floor(100 + Math.random() * 900))
        : `${Date.now().toString(36).slice(-3)}${Math.floor(10 + Math.random() * 89)}`;
    const candidate = `${base.slice(0, 24)}_${suffix}`;
    const check = await checkUsernameAvailability(candidate, excludeIds);
    if (check.available) {
      return check.cleanUsername;
    }
  }

  return `${base.slice(0, 20)}_${Date.now().toString(36).slice(-5)}`;
}

const KNOWN_PARENT_FAMILIES: Array<{
  emails: string[];
  nameMatch: string[];
  canonicalParentName: string;
  childrenNames: string[];
}> = [
  {
    emails: ['gifttorru@gmail.com'],
    nameMatch: ['eno torru'],
    canonicalParentName: 'Eno Torru',
    childrenNames: ['jayden torru', 'shawn torru'],
  },
  {
    emails: [],
    nameMatch: ['aniebiet udofia'],
    canonicalParentName: 'Aniebiet Udofia',
    childrenNames: ['zoe udofia', 'joanna udofia', 'zoe', 'joanna'],
  },
];

/**
 * Authoritatively verifies whether an authenticated user is a Parent, repairs their role
 * so they are never redirected to a Tutor/Staff account, and ensures their children remain
 * linked to their parent account (`isIndependent: false`, `registrationType: 'parent'`).
 */
export async function reconcileParentAndChildrenAccount(
  userUid: string,
  userEmailRaw?: string | null,
  fallbackName?: string | null
): Promise<{ isParent: boolean; parentName: string }> {
  const email = String(userEmailRaw || '').trim().toLowerCase();
  const initialName = String(fallbackName || '').trim();
  const initialNameLower = initialName.toLowerCase();

  let isParent = false;
  let resolvedParentName = initialName;

  try {
    // 1. Check known parent families (Eno Torru / Aniebiet Udofia)
    const matchedFamily = KNOWN_PARENT_FAMILIES.find(
      (f) =>
        (email && f.emails.includes(email)) ||
        (initialNameLower && f.nameMatch.some((nm) => initialNameLower.includes(nm)))
    );
    if (matchedFamily) {
      isParent = true;
      resolvedParentName = resolvedParentName || matchedFamily.canonicalParentName;
    }

    // 2. Check `parents/{userUid}`
    const parentDoc = await getDoc(doc(db, 'parents', userUid)).catch(() => null);
    if (parentDoc?.exists()) {
      isParent = true;
      const pd = parentDoc.data() || {};
      resolvedParentName = resolvedParentName || pd.fullName || pd.name || '';
    }

    // 3. Check `parents` by email
    if (!isParent && email) {
      const pByEmail = await getDocs(
        query(collection(db, 'parents'), where('email', '==', email), limit(3))
      ).catch(() => null);
      if (pByEmail && !pByEmail.empty) {
        isParent = true;
        const pd = pByEmail.docs[0].data() || {};
        resolvedParentName = resolvedParentName || pd.fullName || pd.name || '';
      }
    }

    // 4. Check `users` by email for role == PARENT or isParent == true
    if (!isParent && email) {
      const uByEmail = await getDocs(
        query(collection(db, 'users'), where('email', '==', email), limit(5))
      ).catch(() => null);
      if (uByEmail && !uByEmail.empty) {
        const pUser = uByEmail.docs.find((d) => {
          const ud = d.data() || {};
          return (
            String(ud.role || '').toUpperCase() === 'PARENT' ||
            ud.isParent === true ||
            (Array.isArray(ud.children) && ud.children.length > 0)
          );
        });
        if (pUser) {
          isParent = true;
          const ud = pUser.data() || {};
          resolvedParentName = resolvedParentName || ud.fullName || ud.name || '';
        }
      }
    }

    // 5. Check `individualStudents`, `students`, and `enrollment_requests` for children linked to this parent
    if (!isParent && (email || userUid)) {
      const childChecks = await Promise.all([
        email
          ? getDocs(query(collection(db, 'individualStudents'), where('parentEmail', '==', email), limit(3))).catch(() => null)
          : Promise.resolve(null),
        email
          ? getDocs(query(collection(db, 'students'), where('parentEmail', '==', email), limit(3))).catch(() => null)
          : Promise.resolve(null),
        userUid
          ? getDocs(query(collection(db, 'individualStudents'), where('parentId', '==', userUid), limit(3))).catch(() => null)
          : Promise.resolve(null),
        userUid
          ? getDocs(query(collection(db, 'students'), where('parentId', '==', userUid), limit(3))).catch(() => null)
          : Promise.resolve(null),
        email
          ? getDocs(query(collection(db, 'enrollment_requests'), where('parentEmail', '==', email), limit(3))).catch(() => null)
          : Promise.resolve(null),
      ]);

      const matchedChildSnap = childChecks.find((snap) => snap && !snap.empty);
      if (matchedChildSnap && !matchedChildSnap.empty) {
        isParent = true;
        const cd = matchedChildSnap.docs[0].data() || {};
        resolvedParentName = resolvedParentName || cd.parentName || cd.guardianName || '';
      }
    }

    if (!isParent) {
      return { isParent: false, parentName: resolvedParentName };
    }

    const finalParentName = resolvedParentName || (email ? email.split('@')[0] : 'Parent');

    // Enforce PARENT role in `users/{userUid}` and `parents/{userUid}` and remove any conflicting tutor/staff docs
    await Promise.all([
      setDoc(
        doc(db, 'users', userUid),
        {
          uid: userUid,
          name: finalParentName,
          fullName: finalParentName,
          ...(email ? { email } : {}),
          role: 'PARENT',
          isParent: true,
          accountStatus: 'ACTIVE',
          status: 'ACTIVE',
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ).catch(() => null),
      setDoc(
        doc(db, 'parents', userUid),
        {
          uid: userUid,
          name: finalParentName,
          fullName: finalParentName,
          ...(email ? { email } : {}),
          role: 'parent',
          accountStatus: 'ACTIVE',
          status: 'ACTIVE',
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ).catch(() => null),
      deleteDoc(doc(db, 'tutors', userUid)).catch(() => null),
      deleteDoc(doc(db, 'staff', userUid)).catch(() => null),
    ]);

    // Ensure children belonging to this parent are properly linked and marked as parent-enrolled (not self-registered)
    const linkChildDoc = async (colName: 'individualStudents' | 'students', dId: string, existingData: any) => {
      await setDoc(
        doc(db, colName, dId),
        {
          parentId: userUid,
          parentUid: userUid,
          ...(email ? { parentEmail: email } : {}),
          parentName: existingData.parentName || finalParentName,
          isIndependent: false,
          registrationType: 'parent',
          studentType: 'parent',
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      ).catch(() => null);
    };

    if (email) {
      for (const colName of ['individualStudents', 'students'] as const) {
        const snap = await getDocs(
          query(collection(db, colName), where('parentEmail', '==', email), limit(25))
        ).catch(() => null);
        if (snap && !snap.empty) {
          await Promise.all(snap.docs.map((d) => linkChildDoc(colName, d.id, d.data())));
        }
      }
    }
  } catch (err) {
    console.warn('Parent/children reconciliation notice:', err);
  }

  return {
    isParent,
    parentName: resolvedParentName || (email ? email.split('@')[0] : 'Parent'),
  };
}
