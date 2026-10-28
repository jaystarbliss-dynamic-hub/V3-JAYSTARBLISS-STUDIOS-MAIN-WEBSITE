import type { Handler } from '@netlify/functions';
import { adminAuth, adminDb } from '../../api/_lib/firebase-admin';

const json = (statusCode: number, body: Record<string, unknown>) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

const tokenFromEvent = (event: any) => {
  const value = event.headers?.authorization || event.headers?.Authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7) : '';
};

const normalize = (value: unknown) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '');

const blocked = (value: unknown) =>
  ['DISABLED', 'SUSPENDED', 'BANNED'].includes(String(value || '').toUpperCase());

const adminRoles = new Set(['ADMIN', 'SUPER_ADMIN', 'EDUCATION_ADMIN']);

const TARGETS = [
  {
    email: 'peniellilystudent@gmail.com',
    names: ['Peniel Lily', 'Peniel Lily Montessori School'],
    legacySchoolId: 'peniel',
  },
  {
    email: 'peniellily@gmail.com',
    names: ['Peniel Lily', 'Peniel Lily Montessori School'],
    legacySchoolId: 'peniel',
  },
  {
    email: 'studentseasystars@gmail.com',
    names: ['Easy Stars Early Years Academy'],
    legacySchoolId: 'easystars',
  },
  {
    email: 'southgold@gmail.com',
    names: ['South Gold Montessori', 'South Gold Montessori School'],
    legacySchoolId: 'southgold',
  },
  {
    email: 'sapphirestudent@gmail.com',
    names: ['Sapphire Explorer Montessori School', 'Sapphire Explorer School'],
    legacySchoolId: 'sapphire',
  },
  {
    email: 'sapphire@gmail.com',
    names: ['Sapphire Explorer Montessori School', 'Sapphire Explorer School'],
    legacySchoolId: 'sapphire',
  },
];

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  try {
    const token = tokenFromEvent(event);
    if (!token) return json(401, { error: 'Authentication required.' });

    const decoded = await adminAuth.verifyIdToken(token);
    const callerSnap = await adminDb.collection('users').doc(decoded.uid).get();
    const caller = callerSnap.data() || {};
    const callerRole = String(caller.role || '').toUpperCase();
    const callerEmail = String(decoded.email || caller.email || '').trim().toLowerCase();
    const isActiveAdmin = adminRoles.has(callerRole) && !blocked(caller.accountStatus || caller.status);

    // Admins may sync any mapping. An authenticated school administrator may also
    // self-heal their own missing school link after logging in.
    if (!isActiveAdmin && !callerEmail) {
      return json(403, { error: 'Only an authenticated administrator or approved school administrator can link a school account.' });
    }

    const schoolSnap = await adminDb.collection('schools').get();
    const schools = schoolSnap.docs.map((doc) => ({
      id: doc.id,
      data: doc.data() || {},
    }));

    const body = JSON.parse(event.body || '{}');
    const requestedEmail = String(body.email || '').trim().toLowerCase();
    const explicitSchoolId = String(body.schoolId || '').trim();
    const explicitSchoolName = String(body.schoolName || '').trim();

    if (!isActiveAdmin && body.scope === 'all') {
      return json(403, { error: 'Only an administrator can synchronize all school administrator mappings.' });
    }

    // Determine target list to process
    let targetsToProcess: Array<{
      email: string;
      names: string[];
      legacySchoolId?: string;
      explicitSchoolId?: string;
    }> = [];

    if (!isActiveAdmin) {
      // Non-admin can only self-heal their own account
      const selfEmail = callerEmail;
      const targetMatch = TARGETS.find((t) => t.email.toLowerCase() === selfEmail);
      if (targetMatch) {
        targetsToProcess = [targetMatch];
      } else {
        targetsToProcess = [
          {
            email: selfEmail,
            names: [caller.schoolName, caller.name, caller.fullName].filter(Boolean),
            explicitSchoolId: caller.schoolId || explicitSchoolId || undefined,
          },
        ];
      }
    } else {
      // Admin request
      if (requestedEmail) {
        const targetMatch = TARGETS.find((t) => t.email.toLowerCase() === requestedEmail);
        if (targetMatch) {
          targetsToProcess = [
            {
              ...targetMatch,
              explicitSchoolId: explicitSchoolId || targetMatch.legacySchoolId,
            },
          ];
        } else {
          targetsToProcess = [
            {
              email: requestedEmail,
              names: explicitSchoolName ? [explicitSchoolName] : [],
              explicitSchoolId: explicitSchoolId || undefined,
            },
          ];
        }
      } else {
        targetsToProcess = TARGETS;
      }
    }

    const results: any[] = [];

    for (const target of targetsToProcess) {
      try {
        let authUser: any;
        try {
          authUser = await adminAuth.getUserByEmail(target.email);
        } catch (authErr: any) {
          if (authErr?.code === 'auth/user-not-found' && target.email === callerEmail) {
            authUser = { uid: decoded.uid, email: callerEmail, displayName: caller.name || caller.fullName || 'School Administrator' };
          } else {
            throw authErr;
          }
        }

        const wantedNames = new Set(target.names.map(normalize));
        const targetEmail = target.email.toLowerCase();

        let school: { id: string; data: any } | null = null;

        // 1. If an explicit schoolId was requested
        if (target.explicitSchoolId) {
          const found = schools.find((s) => s.id === target.explicitSchoolId);
          if (found) {
            school = found;
          } else {
            const explicitRef = adminDb.collection('schools').doc(target.explicitSchoolId);
            const explicitSnap = await explicitRef.get();
            if (explicitSnap.exists) {
              school = { id: explicitSnap.id, data: explicitSnap.data() || {} };
            }
          }
        }

        // 2. Look for matching school by name or email or adminUid
        if (!school) {
          const matches = schools.filter(({ id, data }) => {
            const names = [
              data.name,
              data.schoolName,
              data.school_name,
              data.institutionName,
              data.institution,
            ]
              .filter(Boolean)
              .map(normalize);

            const contactEmails = [
              data.contactEmail,
              data.email,
              data.administratorEmail,
              data.adminEmail,
              data.schoolEmail,
              data.contact?.email,
              data.administrator?.email,
              data.admin?.email,
            ]
              .filter(Boolean)
              .map((value) => String(value).trim().toLowerCase());

            const adminUids = [
              data.adminUid,
              data.administratorUid,
              data.userId,
              data.adminId,
            ]
              .filter(Boolean)
              .map(String);

            const nameMatch = names.some((name) => wantedNames.has(name));
            const emailMatch = contactEmails.includes(targetEmail);
            const uidMatch = authUser?.uid && adminUids.includes(authUser.uid);

            const status = String(data.status || data.accountStatus || '').toUpperCase();
            const isBlocked = ['DISABLED', 'SUSPENDED', 'BANNED', 'DELETED', 'ARCHIVED', 'INACTIVE'].includes(status);

            return !isBlocked && (nameMatch || emailMatch || uidMatch);
          });

          if (matches.length === 1) {
            school = matches[0];
          } else if (matches.length > 1) {
            // Pick best match: UID match > email match > exact name match
            const uidMatch = matches.find((m) => authUser?.uid && (m.data.adminUid === authUser.uid || m.data.userId === authUser.uid));
            const emailMatch = matches.find((m) => {
              const emails = [m.data.contactEmail, m.data.email, m.data.administratorEmail].filter(Boolean).map((e) => String(e).toLowerCase());
              return emails.includes(targetEmail);
            });
            school = uidMatch || emailMatch || matches[0];
          }
        }

        // 3. Fallback to legacy school ID
        if (!school && target.legacySchoolId) {
          const legacyRef = adminDb.collection('schools').doc(target.legacySchoolId);
          const legacySnap = await legacyRef.get();
          if (legacySnap.exists) {
            const legacyData = legacySnap.data() || {};
            const legacyStatus = String(legacyData.status || legacyData.accountStatus || '').toUpperCase();
            if (!['DISABLED', 'SUSPENDED', 'BANNED', 'DELETED', 'ARCHIVED', 'INACTIVE'].includes(legacyStatus)) {
              school = { id: legacySnap.id, data: legacyData };
            }
          }
        }

        // 4. Restore canonical legacy school record if it was missing
        if (!school && target.legacySchoolId && target.names.length > 0) {
          const legacyRef = adminDb.collection('schools').doc(target.legacySchoolId);
          const restoredData = {
            name: target.names[0],
            schoolName: target.names[0],
            status: 'ACTIVE',
            onboardingStatus: 'APPROVED',
            contactEmail: target.email,
            adminUid: authUser.uid,
            restoredFromLegacyMapping: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          await legacyRef.set(restoredData, { merge: true });
          school = { id: target.legacySchoolId, data: restoredData };
        }

        // 5. If still not found, auto-provision an active school record for this school administrator
        if (!school) {
          const generatedName =
            explicitSchoolName ||
            caller.schoolName ||
            target.names[0] ||
            caller.name ||
            authUser.displayName ||
            `${targetEmail.split('@')[0].toUpperCase()} Academy`;

          const newSchoolRef = adminDb.collection('schools').doc();
          const newSchoolData = {
            name: generatedName,
            schoolName: generatedName,
            contactName: caller.name || caller.fullName || authUser.displayName || 'School Administrator',
            contactEmail: targetEmail,
            adminUid: authUser.uid,
            userId: authUser.uid,
            status: 'ACTIVE',
            onboardingStatus: 'APPROVED',
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          await newSchoolRef.set(newSchoolData, { merge: true });
          school = { id: newSchoolRef.id, data: newSchoolData };
        }

        const schoolId = school.id;
        const schoolName = school.data.name || school.data.schoolName || target.names[0] || 'Partner School';
        const userRef = adminDb.collection('users').doc(authUser.uid);
        const schoolRef = adminDb.collection('schools').doc(schoolId);
        const existingUserSnap = await userRef.get();
        const existingUser = existingUserSnap.data() || {};

        const isUserAdmin = String(existingUser.role || '').toUpperCase().includes('ADMIN') ||
          ['johnrufai242@gmail.com'].includes(String(authUser.email || target.email).toLowerCase());

        const userRoleToSave = isUserAdmin 
          ? (String(existingUser.role || '').toUpperCase().includes('ADMIN') ? existingUser.role : 'SUPER_ADMIN')
          : 'SCHOOL';

        await adminDb.runTransaction(async (transaction) => {
          transaction.set(
            userRef,
            {
              ...existingUser,
              uid: authUser.uid,
              email: authUser.email || target.email,
              name: existingUser.name || authUser.displayName || caller.name || (isUserAdmin ? 'Administrator' : 'School Administrator'),
              fullName: existingUser.fullName || existingUser.name || authUser.displayName || caller.name || (isUserAdmin ? 'Administrator' : 'School Administrator'),
              role: userRoleToSave,
              ...(isUserAdmin ? {} : { schoolId, schoolName }),
              accountStatus: 'ACTIVE',
              status: 'ACTIVE',
              portalAccessEnabled: true,
              updatedAt: new Date(),
            },
            { merge: true }
          );

          transaction.set(
            schoolRef,
            {
              adminUid: authUser.uid,
              userId: authUser.uid,
              contactEmail: authUser.email || target.email,
              status: 'ACTIVE',
              updatedAt: new Date(),
            },
            { merge: true }
          );

          transaction.set(adminDb.collection('activityLogs').doc(), {
            type: 'school_admin_linked',
            action: 'SCHOOL_ADMIN_LINKED_TO_EXISTING_SCHOOL',
            actorId: decoded.uid,
            targetId: authUser.uid,
            targetType: 'school_admin',
            schoolId,
            schoolName,
            userEmail: authUser.email || target.email,
            timestamp: new Date(),
          });
        });

        results.push({
          email: target.email,
          uid: authUser.uid,
          schoolId,
          schoolName,
          status: 'LINKED',
        });
      } catch (error: any) {
        results.push({
          email: target.email,
          status: error?.code === 'auth/user-not-found' ? 'AUTH_USER_NOT_FOUND' : 'FAILED',
          error: error?.code === 'auth/user-not-found'
            ? 'Firebase Authentication account does not exist.'
            : error?.message || 'Unable to complete this mapping.',
        });
      }
    }

    const linked = results.filter((item) => item.status === 'LINKED').length;
    const failed = results.length - linked;

    return json(failed && linked === 0 ? 400 : 200, {
      success: failed === 0,
      linked,
      failed,
      results,
    });
  } catch (error: any) {
    console.error('School administrator sync failed:', error);
    return json(500, { error: 'Unable to synchronize school administrator accounts.' });
  }
};
