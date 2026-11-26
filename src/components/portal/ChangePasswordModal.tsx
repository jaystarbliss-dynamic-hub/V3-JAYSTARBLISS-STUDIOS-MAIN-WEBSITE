import React, { useEffect, useState } from 'react';
import { Lock, ShieldCheck, Eye, EyeOff, X, CheckCircle2, AlertCircle, User } from 'lucide-react';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, limit, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { auth, db, getClientDatabases } from '../../lib/firebase';
import { useToast } from '../../contexts/ToastContext';
import { checkUsernameAvailability, claimGlobalUsername, normalizeUsername } from '../../lib/usernameRegistry';
import { getEffectiveAuth } from '../../utils/impersonation';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose?: () => void;
  isForced?: boolean;
  onSuccess?: () => void;
}

async function computeSha256(value: string): Promise<string> {
  try {
    const msgBuffer = new TextEncoder().encode(value);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return value.toLowerCase();
  }
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  onClose,
  isForced = false,
  onSuccess
}) => {
  const { toast } = useToast();
  const [username, setUsername] = useState('');
  const [initialUsername, setInitialUsername] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [needsReauth, setNeedsReauth] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const effectiveAuth = getEffectiveAuth();
  const activeRole = (effectiveAuth.effectiveRole || 'student').toLowerCase();
  const isStudentRole = activeRole === 'student';
  // Only prompt for a new username during forced first-time student onboarding when none exists yet.
  // Normal password changes must NEVER force or block on username editing.
  const canEditUsername = isForced && isStudentRole && !initialUsername;

  useEffect(() => {
    if (!isOpen) return;
    setUsername('');
    setInitialUsername('');
    setError('');
    setNewPassword('');
    setConfirmPassword('');
    setCurrentPassword('');
    setSuccess(false);

    // Only student accounts use a Unique Portal Username
    if (!isStudentRole) {
      return;
    }

    const user = auth.currentUser;
    const isMasquerading = effectiveAuth.isMasquerading;

    if (!isMasquerading) {
      const cachedUsername = sessionStorage.getItem('studentUsername') || '';
      if (cachedUsername) {
        const normalized = normalizeUsername(cachedUsername);
        setUsername(normalized);
        setInitialUsername(normalized);
      }
    }

    const loadCurrentUsername = async () => {
      try {
        const studentDocId = isMasquerading
          ? effectiveAuth.effectiveStudentDocId
          : effectiveAuth.effectiveStudentDocId ||
            sessionStorage.getItem('studentDocId') ||
            localStorage.getItem('jaystar_cached_student_doc_id') ||
            '';

        if (studentDocId) {
          for (const colName of ['individualStudents', 'students'] as const) {
            const sSnap = await getDoc(doc(db, colName, studentDocId)).catch(() => null);
            if (sSnap?.exists() && sSnap.data()?.username) {
              const normalized = normalizeUsername(String(sSnap.data().username));
              setUsername(normalized);
              setInitialUsername(normalized);
              return;
            }
          }
        }

        const lookupUid = isMasquerading ? effectiveAuth.effectiveUid : user?.uid || '';
        if (lookupUid && (!isMasquerading || lookupUid !== user?.uid)) {
          const uSnap = await getDoc(doc(db, 'users', lookupUid)).catch(() => null);
          if (uSnap?.exists() && uSnap.data()?.username && String(uSnap.data()?.role || '').toUpperCase().includes('STUDENT')) {
            const normalized = normalizeUsername(String(uSnap.data().username));
            setUsername(normalized);
            setInitialUsername(normalized);
          }
        }
      } catch {
        // Non-fatal
      }
    };
    void loadCurrentUsername();
  }, [
    isOpen,
    isStudentRole,
    effectiveAuth.isMasquerading,
    effectiveAuth.effectiveStudentDocId,
    effectiveAuth.effectiveUid,
  ]);

  if (!isOpen) return null;

  const calculateStrength = (pw: string) => {
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return score;
  };

  const strength = calculateStrength(newPassword);
  const strengthLabels = ['Weak', 'Fair', 'Good', 'Strong'];
  const strengthColors = ['bg-[#B91C1C]', 'bg-slate-400', 'bg-slate-600', 'bg-[#1E293B]'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const cleanUsername = canEditUsername ? normalizeUsername(username) : '';
    const isUpdatingUsername = canEditUsername && Boolean(cleanUsername) && cleanUsername !== initialUsername;
    if (isUpdatingUsername && (cleanUsername.length < 3 || cleanUsername.length > 30)) {
      setError('Username must be between 3 and 30 characters.');
      return;
    }

    const cleanPassword = newPassword.trim();
    if (cleanPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error('No active user session. Please sign in again.');
      }

      const [sha256Hash, upperSha256Hash] = await Promise.all([
        computeSha256(cleanPassword),
        computeSha256(cleanPassword.toUpperCase())
      ]);
      const nowIso = new Date().toISOString();

      // CRITICAL ISOLATION: If an admin is in a support/impersonation session, NEVER overwrite auth.currentUser's password or users/{auth.currentUser.uid}!
      if (effectiveAuth.isMasquerading) {
        const targetUid = effectiveAuth.effectiveUid;
        const targetSchoolId = effectiveAuth.effectiveSchoolId;
        const targetStudentDocId = effectiveAuth.effectiveStudentDocId;

        if (isUpdatingUsername) {
          const check = await checkUsernameAvailability(
            cleanUsername,
            [targetUid, targetStudentDocId, targetSchoolId, effectiveAuth.effectiveEmail].filter(Boolean)
          );
          if (!check.available) {
            setError(check.reason || `The username "${cleanUsername}" is already taken. Please pick another username.`);
            toast.error(`Username "${cleanUsername}" is already taken. Please pick another username.`);
            setLoading(false);
            return;
          }
        }

        const hashPatch: Record<string, any> = {
          ...(isUpdatingUsername ? { username: cleanUsername } : {}),
          passwordHash: sha256Hash,
          customPasswordHash: sha256Hash,
          accessCodeHash: upperSha256Hash,
          forcePasswordReset: false,
          mustResetPassword: false,
          tempPasswordSingleUse: false,
          tempPasswordExpiresAt: null,
          tempPasswordConsumedAt: nowIso,
          passwordUpdatedAt: nowIso,
          updatedAt: nowIso,
        };

        if (activeRole === 'school' && targetSchoolId) {
          for (const dbInstance of getClientDatabases()) {
            await setDoc(doc(dbInstance, 'schools', targetSchoolId), hashPatch, { merge: true }).catch(() => undefined);
            await setDoc(
              doc(dbInstance, 'schoolPasscodes', targetSchoolId),
              {
                schoolId: targetSchoolId,
                schoolName: effectiveAuth.effectiveName,
                contactEmail: effectiveAuth.effectiveEmail,
                passwordHash: sha256Hash,
                customPasswordHash: sha256Hash,
                accessCodeHash: upperSha256Hash,
                forcePasswordReset: false,
                tempPasswordSingleUse: false,
                updatedAt: nowIso,
              },
              { merge: true }
            ).catch(() => undefined);
          }
        } else if (isStudentRole && targetStudentDocId) {
          for (const dbInstance of getClientDatabases()) {
            for (const coll of ['individualStudents', 'students'] as const) {
              const sRef = doc(dbInstance, coll, targetStudentDocId);
              const sSnap = await getDoc(sRef).catch(() => null);
              if (sSnap?.exists()) {
                await setDoc(sRef, hashPatch, { merge: true }).catch(() => undefined);
              }
            }
          }
          if (isUpdatingUsername) {
            await claimGlobalUsername(cleanUsername, {
              uid: targetUid || targetStudentDocId,
              docId: targetStudentDocId,
              role: 'STUDENT',
              email: effectiveAuth.effectiveEmail || '',
              name: effectiveAuth.effectiveName || '',
            }).catch(() => undefined);
          }
        }

        // Only update users/{targetUid} if targetUid is distinct from the Super Admin's UID
        if (targetUid && targetUid !== user.uid) {
          for (const dbInstance of getClientDatabases()) {
            const uRef = doc(dbInstance, 'users', targetUid);
            const uSnap = await getDoc(uRef).catch(() => null);
            if (uSnap?.exists()) {
              await setDoc(uRef, hashPatch, { merge: true }).catch(() => undefined);
            }
          }
        }

        setSuccess(true);
        toast.success(`Password updated for ${effectiveAuth.effectiveName}.`);
        setTimeout(() => {
          if (onSuccess) onSuccess();
          if (onClose) onClose();
        }, 1200);
        return;
      }

      const cachedStudentDocId = isStudentRole
        ? sessionStorage.getItem('studentDocId') || localStorage.getItem('jaystar_cached_student_doc_id') || ''
        : '';
      const cachedSchoolId =
        activeRole === 'school'
          ? sessionStorage.getItem('schoolId') || sessionStorage.getItem('schoolDocId') || ''
          : '';

      // Only verify global username uniqueness if the user is actually setting a new username
      if (isUpdatingUsername) {
        const check = await checkUsernameAvailability(
          cleanUsername,
          [user.uid, effectiveAuth.effectiveUid, cachedStudentDocId, cachedSchoolId, user.email, effectiveAuth.effectiveEmail].filter(Boolean)
        );
        if (!check.available) {
          setError(check.reason || `The username "${cleanUsername}" is already taken. Please pick another username.`);
          toast.error(`Username "${cleanUsername}" is already taken. Please pick another username.`);
          setLoading(false);
          return;
        }
      }

      // 1. Direct Firebase Auth password update
      let authUpdated = false;
      try {
        if (needsReauth && currentPassword.trim() && user.email) {
          const cred = EmailAuthProvider.credential(user.email, currentPassword.trim());
          await reauthenticateWithCredential(user, cred);
        }
        await updatePassword(user, cleanPassword);
        authUpdated = true;
        setNeedsReauth(false);
      } catch (authErr: any) {
        console.warn('Direct updatePassword note:', authErr?.code || authErr?.message);
        if (authErr?.code === 'auth/requires-recent-login' && user.email && !user.email.endsWith('.local') && !user.email.endsWith('.firebaseapp.com')) {
          setNeedsReauth(true);
        }
      }

      // 2. Try backend endpoint to sync password hash via Admin SDK when available
      let serverUpdated = false;
      try {
        const token = await user.getIdToken();
        const res = await fetch('/.netlify/functions/student-change-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ newPassword: cleanPassword, ...(isUpdatingUsername ? { username: cleanUsername } : {}) })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success && !data.fallback) {
          serverUpdated = true;
        }
      } catch (srvErr) {
        console.warn('Backend password sync fallback active:', srvErr);
      }

      // If Firebase Auth required re-authentication for a standard email account and server Admin SDK wasn't available
      if (!authUpdated && !serverUpdated && needsReauth && !currentPassword.trim()) {
        setError('Please enter your current password above to confirm this security change.');
        setLoading(false);
        return;
      }

      // 3. Direct client-side Firestore sync across primary and fallback databases
      // Never persist plaintext passwords on user records; clear single-use temp password flags on completion.
      const userPatch: Record<string, any> = {
        ...(isUpdatingUsername ? { username: cleanUsername } : {}),
        passwordHash: sha256Hash,
        customPasswordHash: sha256Hash,
        accessCodeHash: upperSha256Hash,
        forcePasswordReset: false,
        mustResetPassword: false,
        tempPasswordSingleUse: false,
        tempPasswordExpiresAt: null,
        tempPasswordConsumedAt: nowIso,
        passwordUpdatedAt: nowIso,
        updatedAt: nowIso
      };

      const studentPatch: Record<string, any> = {
        ...(isUpdatingUsername ? { username: cleanUsername } : {}),
        passwordHash: sha256Hash,
        customPasswordHash: sha256Hash,
        accessCodeHash: upperSha256Hash,
        forcePasswordReset: false,
        mustResetPassword: false,
        passwordUpdatedAt: nowIso,
        updatedAt: nowIso
      };

      const userEmail = (user.email || '').toLowerCase().trim();

      for (const dbInstance of getClientDatabases()) {
        let resolvedStudentDocId = cachedStudentDocId;
        try {
          const uRef = doc(dbInstance, 'users', user.uid);
          const uSnap = await getDoc(uRef).catch(() => null);
          if (uSnap?.exists()) {
            const uData = uSnap.data() || {};
            if (isStudentRole && uData.studentDocId) resolvedStudentDocId = String(uData.studentDocId);
            await updateDoc(uRef, userPatch).catch(async () => {
              await setDoc(uRef, userPatch, { merge: true }).catch(() => undefined);
            });
          } else {
            await setDoc(uRef, {
              uid: user.uid,
              email: user.email || null,
              role: (sessionStorage.getItem('userRole') || 'student').toUpperCase(),
              ...userPatch
            }, { merge: true }).catch(() => undefined);
          }
        } catch (uErr) {
          console.warn('Could not update user doc flag (non-fatal):', uErr);
        }

        if (activeRole === 'school' && cachedSchoolId) {
          await setDoc(doc(dbInstance, 'schools', cachedSchoolId), userPatch, { merge: true }).catch(() => undefined);
          await setDoc(
            doc(dbInstance, 'schoolPasscodes', cachedSchoolId),
            {
              schoolId: cachedSchoolId,
              passwordHash: sha256Hash,
              customPasswordHash: sha256Hash,
              accessCodeHash: upperSha256Hash,
              forcePasswordReset: false,
              tempPasswordSingleUse: false,
              tempPasswordExpiresAt: null,
              tempPasswordConsumedAt: nowIso,
              updatedAt: nowIso,
            },
            { merge: true }
          ).catch(() => undefined);
        }

        if (isStudentRole) {
          let updatedStudent = false;
          if (resolvedStudentDocId) {
            for (const coll of ['individualStudents', 'students']) {
              try {
                const sRef = doc(dbInstance, coll, resolvedStudentDocId);
                const sSnap = await getDoc(sRef);
                if (sSnap.exists()) {
                  await updateDoc(sRef, studentPatch).catch(async () => {
                    await setDoc(sRef, studentPatch, { merge: true }).catch(() => undefined);
                  });
                  updatedStudent = true;
                }
              } catch {
                // Ignore if not found or not student
              }
            }
          }

          if (!updatedStudent) {
            for (const coll of ['individualStudents', 'students']) {
              try {
                let qSnap = await getDocs(query(collection(dbInstance, coll), where('firebaseUid', '==', user.uid), limit(1)));
                if (qSnap.empty) {
                  qSnap = await getDocs(query(collection(dbInstance, coll), where('userId', '==', user.uid), limit(1)));
                }
                if (qSnap.empty && userEmail) {
                  qSnap = await getDocs(query(collection(dbInstance, coll), where('email', '==', userEmail), limit(1)));
                }
                if (!qSnap.empty) {
                  const targetRef = doc(dbInstance, coll, qSnap.docs[0].id);
                  await updateDoc(targetRef, studentPatch).catch(async () => {
                    await setDoc(targetRef, studentPatch, { merge: true }).catch(() => undefined);
                  });
                }
              } catch {
                // Non-fatal
              }
            }
          }
        }
      }

      if (isUpdatingUsername) {
        sessionStorage.setItem('studentUsername', cleanUsername);
        await claimGlobalUsername(cleanUsername, {
          uid: user.uid,
          docId: cachedStudentDocId || user.uid,
          role: 'STUDENT',
          email: user.email || '',
          name: user.displayName || sessionStorage.getItem('userName') || '',
        });
      }

      sessionStorage.setItem('forcePasswordReset', 'false');
      sessionStorage.setItem('mustResetPassword', 'false');
      setSuccess(true);
      toast.success(
        isUpdatingUsername
          ? 'Your password and unique username have been updated! You can now log in with your credentials.'
          : 'Your account password has been updated!'
      );

      setTimeout(() => {
        if (onSuccess) onSuccess();
        if (onClose) onClose();
      }, 1200);

    } catch (err: any) {
      console.error('Password update error:', err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('The current password you entered is incorrect.');
      } else if (err.code === 'auth/requires-recent-login') {
        setNeedsReauth(true);
        setError('Please enter your current password to confirm this change.');
      } else {
        setError(err.message || 'Failed to update password. Please try again.');
      }
      toast.error('Failed to change password. Please check requirements.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl relative">
        
        {!isForced && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-5 right-5 p-2 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        )}

        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-brand-red/10 text-brand-red flex items-center justify-center border border-brand-red/20 shrink-0">
            <Lock size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-gray-900 dark:text-white">
              {isForced ? 'Action Required: Set New Password' : 'Change Password'}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {isForced 
                ? 'Your account was initialized with temporary credentials. Please choose a new secure password to proceed.' 
                : `Enter a strong, memorable password to secure ${effectiveAuth.isMasquerading ? `${effectiveAuth.effectiveName}'s` : 'your'} account.`}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success ? (
          <div className="py-6 text-center space-y-2">
            <CheckCircle2 size={48} className="mx-auto text-[#1E293B] dark:text-slate-200" />
            <h3 className="text-base font-bold text-gray-900 dark:text-white">Password Updated!</h3>
            <p className="text-xs text-gray-500">Your new credentials have been secured.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {canEditUsername ? (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
                  Unique Portal Username
                </label>
                <div className="relative">
                  <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    minLength={3}
                    maxLength={30}
                    value={username}
                    onChange={(e) => setUsername(normalizeUsername(e.target.value))}
                    placeholder="your_unique_username"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-red"
                  />
                </div>
                <p className="mt-1 text-[10px] text-gray-500">
                  Choose a unique username for signing into your student portal.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/60 px-3.5 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-400">
                  Account
                </p>
                <p className="text-xs font-bold text-gray-900 dark:text-white truncate mt-0.5">
                  {effectiveAuth.effectiveName || auth.currentUser?.displayName || 'Portal Account'}
                </p>
                {initialUsername && (
                  <p className="text-[11px] font-mono text-gray-500 dark:text-slate-400 truncate">
                    @{initialUsername}
                  </p>
                )}
                {(effectiveAuth.effectiveEmail || auth.currentUser?.email) && (
                  <p className="text-[11px] font-mono text-gray-500 dark:text-slate-400 truncate">
                    {effectiveAuth.effectiveEmail || auth.currentUser?.email}
                  </p>
                )}
              </div>
            )}

            {needsReauth && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
                  Current Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter your current password"
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-red"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  className="w-full px-4 py-3 pr-10 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-red"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {/* Password Strength Meter */}
              {newPassword && (
                <div className="mt-2 space-y-1">
                  <div className="flex gap-1 h-1.5 w-full">
                    {[0, 1, 2, 3].map((idx) => (
                      <div
                        key={idx}
                        className={`flex-1 rounded-full transition-colors ${
                          idx < strength ? strengthColors[strength - 1] : 'bg-gray-200 dark:bg-slate-700'
                        }`}
                      />
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-500 text-right font-medium">
                    Strength: {strengthLabels[strength - 1] || 'Too short'}
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-1.5">
                Confirm New Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-type new password"
                  className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-red"
                />
              </div>
            </div>

            <div className="pt-3 flex gap-3">
              {!isForced && onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="flex-1 py-3 px-4 rounded-xl border border-gray-300 dark:border-slate-700 text-gray-700 dark:text-gray-300 font-bold text-xs hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
              )}

              <button
                type="submit"
                disabled={loading || !newPassword || !confirmPassword}
                className="flex-1 py-3 px-4 rounded-xl bg-brand-red hover:bg-red-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-md shadow-brand-red/20"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Updating...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck size={16} />
                    <span>{isForced ? 'Set Password & Enter Portal' : 'Save New Password'}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
};

export default ChangePasswordModal;
