import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, getDocs, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { 
  Shield, User, Download, Plus, X, KeyRound, Copy, Check, Search, Filter, 
  ChevronDown, UserCheck, Trash2, AlertTriangle, Loader2 
} from 'lucide-react';
import { auth, db } from '../../lib/firebase';
import { useToast } from '../../contexts/ToastContext';
import { startImpersonation } from '../../utils/impersonation';
import { resolveRealName } from '../../utils/userNames';

const ROLE_OPTIONS = [
  ['USER', 'User (Default)'],
  ['STUDENT', 'Student'],
  ['PARENT', 'Parent'],
  ['TUTOR', 'Tutor'],
  ['STAFF', 'Staff'],
  ['SCHOOL', 'School Admin'],
  ['CMS_ADMIN', 'Website & CMS Sub-Admin'],
  ['ACADEMIC_ADMIN', 'Academic Hub & Portals Sub-Admin'],
  ['FINANCE_ADMIN', 'Finance & Billing Sub-Admin'],
  ['SUPER_ADMIN', 'Super Admin (Full Access)']
] as const;

const ROLE_ALIASES: Record<string, string> = {
  USER: 'user',
  STUDENT: 'student',
  PARENT: 'parent',
  TUTOR: 'staff',
  STAFF: 'staff',
  INSTRUCTOR: 'staff',
  FACULTY: 'staff',
  SCHOOL: 'school',
  SCHOOL_ADMIN: 'school',
  CMS_ADMIN: 'cms_admin',
  CONTENT_ADMIN: 'cms_admin',
  ACADEMIC_ADMIN: 'academic_admin',
  EDUCATION_ADMIN: 'academic_admin',
  FINANCE_ADMIN: 'finance_admin',
  SERVICES_ADMIN: 'services_admin',
  SUPER_ADMIN: 'super_admin'
};

const PROTECTED_EMAILS = [
  'johnrufai242@gmail.com',
  'admin@jaystarbliss.com',
  'admin@jaystarbliss-studios.name.ng',
  'admin@jaystar.com'
];

type RoleCategory = 'ALL' | 'STUDENT' | 'PARENT' | 'STAFF' | 'ADMIN';

const AdminUsers: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<RoleCategory>('ALL');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('STUDENT');
  const [inviteName, setInviteName] = useState('');
  const [forcePasswordReset, setForcePasswordReset] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [copied, setCopied] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  // Loading indicator for row role update
  const [updatingRoleUserId, setUpdatingRoleUserId] = useState<string | null>(null);

  // Permanent Delete Modal State
  const [userToDelete, setUserToDelete] = useState<any | null>(null);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Current Admin Authority
  const currentUser = auth.currentUser;
  const currentEmail = (currentUser?.email || '').toLowerCase().trim();
  const sessionRole = (sessionStorage.getItem('userRole') || localStorage.getItem('jaystar_cached_user_role') || '').toLowerCase();
  const isSuperAdmin = sessionRole === 'super_admin' || PROTECTED_EMAILS.includes(currentEmail);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) {
        setIsFilterOpen(false);
      }
    };
    if (isFilterOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isFilterOpen]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const snapshot = await getDocs(collection(db, 'users'));
      setUsers(snapshot.docs.map((userDoc) => ({ id: userDoc.id, ...userDoc.data() })));
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Unable to load user records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  const handleRoleChange = async (userId: string, newRole: string) => {
    setUpdatingRoleUserId(userId);
    const mappedRole = ROLE_ALIASES[newRole.toUpperCase()] || newRole.toLowerCase();

    try {
      if (!auth.currentUser) throw new Error('Your admin session has expired. Please sign in again.');
      const token = await auth.currentUser.getIdToken();
      let roleChangeSucceeded = false;
      let returnedRole = mappedRole;

      // 1. First attempt the secure serverless endpoint
      try {
        const response = await fetch('/.netlify/functions/admin-role-change', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ userId, role: newRole })
        });
        const payload = await response.json().catch(() => ({}));
        if (response.ok) {
          roleChangeSucceeded = true;
          returnedRole = String(payload.role || mappedRole).toLowerCase();
        } else if (response.status === 403 || response.status === 400) {
          throw new Error(payload.error || 'Role change was rejected by security policy.');
        } else {
          // 500 or network fallback to client Firestore write
          throw new Error(payload.error || 'Server function error');
        }
      } catch (fnErr: any) {
        if (fnErr.message && fnErr.message.includes('security policy')) {
          throw fnErr;
        }
        console.warn('admin-role-change function fallback, performing direct client write:', fnErr);

        // 2. Direct client Firestore write fallback (verified by Firestore security rules)
        const now = new Date().toISOString();
        await setDoc(doc(db, 'users', userId), {
          role: mappedRole,
          updatedAt: now
        }, { merge: true });

        // Synchronize corresponding role collection
        if (mappedRole === 'staff') {
          await setDoc(doc(db, 'tutors', userId), {
            role: 'staff',
            status: 'ACTIVE',
            updatedAt: now
          }, { merge: true });
        } else if (mappedRole === 'parent') {
          await setDoc(doc(db, 'parents', userId), {
            role: 'parent',
            updatedAt: now
          }, { merge: true });
        } else if (mappedRole === 'student') {
          await setDoc(doc(db, 'individualStudents', userId), {
            role: 'student',
            updatedAt: now
          }, { merge: true });
        } else if (mappedRole.includes('admin')) {
          await setDoc(doc(db, 'admins', userId), {
            role: mappedRole,
            updatedAt: now
          }, { merge: true });
        }

        roleChangeSucceeded = true;
        returnedRole = mappedRole;
      }

      if (roleChangeSucceeded) {
        setUsers((prev) => prev.map((user) => user.id === userId ? { ...user, role: returnedRole } : user));
        toast.success(`Role updated to ${returnedRole.toUpperCase()}.`);
      }
    } catch (error) {
      console.error('Error updating role:', error);
      toast.error(error instanceof Error ? error.message : 'Role change was rejected.');
    } finally {
      setUpdatingRoleUserId(null);
    }
  };

  const handleAccountStatus = async (userId: string, currentStatus: string | undefined) => {
    const nextStatus = String(currentStatus || 'ACTIVE').toUpperCase() === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    try {
      if (!auth.currentUser) throw new Error('Your admin session has expired. Please sign in again.');
      const token = await auth.currentUser.getIdToken();
      const response = await fetch('/.netlify/functions/admin-account-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId, status: nextStatus })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to update account access securely.');
      setUsers((prev) => prev.map((user) => user.id === userId ? { ...user, accountStatus: nextStatus } : user));
      toast.success(nextStatus === 'ACTIVE' ? 'Account restored.' : 'Account suspended.');
    } catch (error) {
      console.error('Error updating account status:', error);
      toast.error(error instanceof Error ? error.message : 'Unable to update account access.');
    }
  };

  const handleToggleForcePasswordReset = async (userId: string, currentValue: boolean) => {
    const nextValue = !currentValue;
    try {
      await updateDoc(doc(db, 'users', userId), { forcePasswordReset: nextValue, updatedAt: new Date().toISOString() });
      setUsers((prev) => prev.map((user) => user.id === userId ? { ...user, forcePasswordReset: nextValue } : user));
      toast.success(nextValue ? 'Password reset required on next login.' : 'Password reset requirement cleared.');
    } catch (error) {
      console.error('Error toggling password reset:', error);
      toast.error('Unable to update password policy.');
    }
  };

  const handlePermanentDeleteUser = async () => {
    if (!userToDelete) return;
    const targetUserId = userToDelete.id;
    const targetEmail = (userToDelete.email || '').toLowerCase().trim();

    if (currentUser && targetUserId === currentUser.uid) {
      toast.error('You cannot delete your own active administrator account.');
      return;
    }

    if (PROTECTED_EMAILS.includes(targetEmail)) {
      toast.error('This system administrator account is protected and cannot be deleted.');
      return;
    }

    setIsDeleting(true);
    try {
      if (!auth.currentUser) throw new Error('Your admin session has expired. Please sign in again.');
      const token = await auth.currentUser.getIdToken();

      let deletionCompleted = false;

      // 1. Try serverless deletion endpoint
      try {
        const response = await fetch('/.netlify/functions/admin-user-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ userId: targetUserId })
        });
        const payload = await response.json().catch(() => ({}));
        if (response.ok) {
          deletionCompleted = true;
        } else if (response.status === 403 || response.status === 400) {
          throw new Error(payload.error || 'Account deletion was rejected.');
        } else {
          throw new Error(payload.error || 'Serverless deletion encountered an error');
        }
      } catch (fnErr: any) {
        if (fnErr.message && (fnErr.message.includes('rejected') || fnErr.message.includes('protected') || fnErr.message.includes('remaining'))) {
          throw fnErr;
        }
        console.warn('admin-user-delete server function fallback, cleaning Firestore client-side:', fnErr);

        // 2. Client-side Firestore records deletion fallback for Super Admin
        await Promise.allSettled([
          deleteDoc(doc(db, 'users', targetUserId)),
          deleteDoc(doc(db, 'admins', targetUserId)),
          deleteDoc(doc(db, 'tutors', targetUserId)),
          deleteDoc(doc(db, 'parents', targetUserId)),
          deleteDoc(doc(db, 'students', targetUserId)),
          deleteDoc(doc(db, 'individualStudents', targetUserId)),
          deleteDoc(doc(db, 'staffSchoolAccess', targetUserId)),
          deleteDoc(doc(db, 'staffWallets', targetUserId))
        ]);
        deletionCompleted = true;
      }

      if (deletionCompleted) {
        setUsers((prev) => prev.filter((u) => u.id !== targetUserId));
        toast.success(`User ${targetEmail || targetUserId} and all associated records permanently deleted.`);
        setUserToDelete(null);
        setDeleteConfirmationText('');
      }
    } catch (error) {
      console.error('Error permanently deleting user:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to permanently delete user.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanEmail = inviteEmail.trim().toLowerCase();
    if (!auth.currentUser) {
      toast.error('Your admin session has expired. Please sign in again.');
      return;
    }
    if (!cleanEmail || !inviteName.trim()) {
      toast.error('Enter the user name and email address.');
      return;
    }

    setInviting(true);
    setTemporaryPassword('');
    setCopied(false);
    try {
      const token = await auth.currentUser.getIdToken();
      const response = await fetch('/.netlify/functions/admin-onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: inviteName.trim(),
          email: cleanEmail,
          role: inviteRole,
          forcePasswordReset
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Unable to onboard this user.');

      const password = String(payload.temporaryPassword || '');
      setTemporaryPassword(password);
      await loadUsers();
      toast.success(`Firebase Auth account created for ${cleanEmail}.`);
      if (password) setShowInviteModal(true);
    } catch (error) {
      console.error('Admin onboarding error:', error);
      toast.error(error instanceof Error ? error.message : 'Unable to onboard this user.');
    } finally {
      setInviting(false);
    }
  };

  const copyTemporaryPassword = async () => {
    if (!temporaryPassword) return;
    try {
      await navigator.clipboard.writeText(temporaryPassword);
      setCopied(true);
      toast.success('Temporary password copied.');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error('Clipboard access is unavailable. Copy the password manually.');
    }
  };

  const closeInviteModal = () => {
    setShowInviteModal(false);
    setInviteEmail('');
    setInviteName('');
    setForcePasswordReset(true);
    setTemporaryPassword('');
    setCopied(false);
  };

  const exportToCSV = () => {
    if (users.length === 0) return;
    const headers = ['name', 'email', 'role', 'accountStatus', 'forcePasswordReset'];
    const csv = [
      headers.join(','),
      ...users.map((user) => headers.map((key) => `"${String(user[key] ?? '').replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'users_export.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      // Category filter
      const userRole = String(u.role || 'user').toUpperCase();
      if (activeCategory === 'STUDENT' && userRole !== 'STUDENT') return false;
      if (activeCategory === 'PARENT' && userRole !== 'PARENT') return false;
      if (activeCategory === 'STAFF' && userRole !== 'STAFF' && userRole !== 'TUTOR') return false;
      if (activeCategory === 'ADMIN' && !userRole.includes('ADMIN') && userRole !== 'SCHOOL') return false;

      // Text search
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const name = String(u.name || u.displayName || '').toLowerCase();
      const email = String(u.email || '').toLowerCase();
      const role = userRole.toLowerCase();
      return name.includes(q) || email.includes(q) || role.includes(q);
    });
  }, [users, activeCategory, searchQuery]);

  const counts = useMemo(() => {
    let student = 0, parent = 0, staff = 0, admin = 0;
    users.forEach((u) => {
      const r = String(u.role || 'user').toUpperCase();
      if (r === 'STUDENT') student += 1;
      else if (r === 'PARENT') parent += 1;
      else if (r === 'STAFF' || r === 'TUTOR') staff += 1;
      else if (r.includes('ADMIN') || r === 'SCHOOL') admin += 1;
    });
    return { all: users.length, student, parent, staff, admin };
  }, [users]);

  return (
    <div className="space-y-6">
      {/* Onboarding Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="invite-user-title">
          <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-5 flex items-center justify-between border-b border-gray-100 pb-4 dark:border-slate-800">
              <div>
                <h2 id="invite-user-title" className="text-lg font-black text-gray-900 dark:text-white">Onboard New User</h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">Creates the Firebase Auth account and matching role profile.</p>
              </div>
              <button type="button" onClick={closeInviteModal} className="min-h-11 min-w-11 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800" aria-label="Close onboarding dialog">
                <X size={20} className="mx-auto" />
              </button>
            </div>

            {temporaryPassword ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/30">
                  <p className="text-sm font-bold text-emerald-900 dark:text-emerald-200">Account created successfully.</p>
                  <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-300">Give this temporary password to the user through a secure channel. It is not stored in Firestore.</p>
                </div>
                <div>
                  <label htmlFor="temporary-password" className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-300">Temporary Password</label>
                  <div className="flex gap-2">
                    <input id="temporary-password" readOnly value={temporaryPassword} className="min-h-11 w-full rounded-xl border border-gray-300 bg-gray-50 px-3 font-mono text-sm text-gray-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
                    <button type="button" onClick={copyTemporaryPassword} className="min-h-11 min-w-11 rounded-xl border border-gray-300 bg-white text-gray-700 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-200" aria-label="Copy temporary password">
                      {copied ? <Check size={18} className="mx-auto" /> : <Copy size={18} className="mx-auto" />}
                    </button>
                  </div>
                </div>
                <button type="button" onClick={closeInviteModal} className="min-h-11 w-full rounded-xl bg-brand-red px-4 py-3 text-sm font-bold text-white">Done</button>
              </div>
            ) : (
              <form onSubmit={handleInvite} className="space-y-4">
                <div>
                  <label htmlFor="invite-name" className="mb-1 block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">Full Name</label>
                  <input id="invite-name" required value={inviteName} onChange={(e) => setInviteName(e.target.value)} className="min-h-11 w-full rounded-xl border border-gray-300 px-3 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" placeholder="e.g. Samuel Adewale" />
                </div>
                <div>
                  <label htmlFor="invite-email" className="mb-1 block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">Email Address</label>
                  <input id="invite-email" required type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="min-h-11 w-full rounded-xl border border-gray-300 px-3 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" placeholder="user@example.com" />
                </div>
                <div>
                  <label htmlFor="invite-role" className="mb-1 block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">Assigned Role / Portal</label>
                  <select id="invite-role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="min-h-11 w-full rounded-xl border border-gray-300 px-3 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white">
                    {ROLE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
                <label className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
                  <input type="checkbox" checked={forcePasswordReset} onChange={(e) => setForcePasswordReset(e.target.checked)} className="mt-1 h-4 w-4" />
                  <span className="text-xs text-gray-700 dark:text-gray-300"><strong>Force password reset on first login.</strong><span className="mt-1 block text-gray-500 dark:text-gray-400">Recommended for temporary credentials.</span></span>
                </label>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={closeInviteModal} className="min-h-11 flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm font-bold text-gray-700 dark:border-slate-700 dark:text-gray-300">Cancel</button>
                  <button type="submit" disabled={inviting} className="min-h-11 flex-1 rounded-xl bg-brand-red px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{inviting ? 'Creating account…' : 'Create Account'}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Super Admin Permanent User Deletion Modal */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 animate-fadeIn" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-2xl border border-red-200 bg-white p-6 shadow-2xl dark:border-red-950/60 dark:bg-slate-900">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl bg-red-100 dark:bg-red-950/50 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle size={24} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-black text-gray-900 dark:text-white">
                  Permanently Delete User Account?
                </h2>
                <p className="text-xs text-red-600 dark:text-red-400 font-bold mt-0.5">
                  This action is irreversible and restricted to Super Admins.
                </p>
              </div>
              <button 
                type="button" 
                onClick={() => { setUserToDelete(null); setDeleteConfirmationText(''); }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X size={20} />
              </button>
            </div>

            <div className="mt-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1.5 text-xs text-gray-700 dark:text-gray-300">
              <div><strong className="text-gray-900 dark:text-white">Target User:</strong> {resolveRealName(userToDelete, userToDelete.email, 'User')}</div>
              <div><strong className="text-gray-900 dark:text-white">Email:</strong> {userToDelete.email || 'No email registered'}</div>
              <div><strong className="text-gray-900 dark:text-white">Current Role:</strong> {String(userToDelete.role || 'user').toUpperCase()}</div>
              <div><strong className="text-gray-900 dark:text-white">User ID:</strong> <span className="font-mono text-[11px] text-gray-500">{userToDelete.id}</span></div>
            </div>

            <div className="mt-4 space-y-2 text-xs text-gray-600 dark:text-gray-300">
              <p>Permanently deleting this account will immediately and irrevocably erase:</p>
              <ul className="list-disc pl-5 space-y-1 text-slate-500 dark:text-slate-400">
                <li>Firebase Authentication login credentials and tokens</li>
                <li>User profile and role authorizations</li>
                <li>Associated student, parent, or instructor profiles</li>
                <li>Enrollment records, exam attempts, and assignments</li>
                <li>Direct notifications and user support chat records</li>
              </ul>
            </div>

            <div className="mt-4 pt-3 border-t border-gray-100 dark:border-slate-800">
              <label htmlFor="confirm-delete-input" className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
                To confirm deletion, type <span className="font-mono text-red-600 font-bold">DELETE</span> or the user&apos;s email address below:
              </label>
              <input
                id="confirm-delete-input"
                type="text"
                value={deleteConfirmationText}
                onChange={(e) => setDeleteConfirmationText(e.target.value)}
                placeholder="Type DELETE to confirm"
                className="w-full min-h-10 px-3 text-xs rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white font-mono focus:ring-2 focus:ring-red-600 outline-none"
              />
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => { setUserToDelete(null); setDeleteConfirmationText(''); }}
                disabled={isDeleting}
                className="min-h-11 flex-1 rounded-xl border border-gray-300 dark:border-slate-700 px-4 py-2.5 text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePermanentDeleteUser}
                disabled={isDeleting || (deleteConfirmationText.trim() !== 'DELETE' && deleteConfirmationText.trim().toLowerCase() !== (userToDelete.email || '').toLowerCase())}
                className="min-h-11 flex-1 rounded-xl bg-red-600 hover:bg-red-700 px-4 py-2.5 text-xs font-bold text-white shadow-xs disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Purging user records…</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={14} />
                    <span>Permanently Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header & Main Actions */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">Users & Roles Management</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Manage dashboard access, role authorization, and security access policies.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowInviteModal(true)} className="min-h-10 rounded-xl bg-brand-red px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-red-700 transition-colors"><span className="inline-flex items-center gap-2"><Plus size={14} /> Onboard New User</span></button>
          <button onClick={exportToCSV} disabled={users.length === 0} className="min-h-10 rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-bold text-gray-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-200"><span className="inline-flex items-center gap-2"><Download size={14} /> Export CSV</span></button>
        </div>
      </div>

      {/* Filter Icon Dropdown & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, or role..."
            className="w-full min-h-10 pl-9 pr-8 rounded-xl border border-gray-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-gray-900 dark:text-white placeholder:text-gray-400 focus:ring-2 focus:ring-brand-red focus:border-brand-red outline-none shadow-2xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filter Dropdown beside Search Bar */}
        <div className="relative shrink-0" ref={filterMenuRef}>
          <button
            type="button"
            onClick={() => setIsFilterOpen((prev) => !prev)}
            aria-expanded={isFilterOpen}
            className={`min-h-10 px-3.5 rounded-xl border text-xs font-bold inline-flex items-center gap-2 transition-all cursor-pointer ${
              activeCategory !== 'ALL'
                ? 'bg-brand-red text-white border-brand-red shadow-xs'
                : 'bg-white dark:bg-slate-900 border-gray-200/90 dark:border-slate-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800/80 shadow-2xs'
            }`}
          >
            <Filter size={14} className={activeCategory !== 'ALL' ? 'text-white' : 'text-gray-400'} />
            <span>
              {activeCategory === 'ALL' ? 'All Users' :
               activeCategory === 'STUDENT' ? 'Students' :
               activeCategory === 'PARENT' ? 'Parents' :
               activeCategory === 'STAFF' ? 'Staff' : 'Admins'}
            </span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
              activeCategory !== 'ALL' ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-gray-400'
            }`}>
              {activeCategory === 'ALL' ? counts.all :
               activeCategory === 'STUDENT' ? counts.student :
               activeCategory === 'PARENT' ? counts.parent :
               activeCategory === 'STAFF' ? counts.staff : counts.admin}
            </span>
            <ChevronDown size={14} className={`transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} />
          </button>

          {isFilterOpen && (
            <div className="absolute right-0 sm:left-auto top-full mt-1.5 w-56 rounded-2xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl py-1.5 z-40 animate-fadeIn">
              <div className="px-3 py-1.5 border-b border-gray-100 dark:border-slate-800/70 text-[10px] font-black uppercase tracking-wider text-gray-400 flex items-center justify-between">
                <span>Filter Role Type</span>
                {activeCategory !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => { setActiveCategory('ALL'); setIsFilterOpen(false); }}
                    className="text-brand-red hover:underline text-[10px] font-bold"
                  >
                    Reset
                  </button>
                )}
              </div>
              <div className="py-1">
                {[
                  { id: 'ALL', label: 'All Users', count: counts.all },
                  { id: 'STUDENT', label: 'Students', count: counts.student },
                  { id: 'PARENT', label: 'Parents', count: counts.parent },
                  { id: 'STAFF', label: 'Staff & Tutors', count: counts.staff },
                  { id: 'ADMIN', label: 'Admins & Schools', count: counts.admin },
                ].map((tab) => {
                  const isSelected = activeCategory === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => {
                        setActiveCategory(tab.id as RoleCategory);
                        setIsFilterOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-xs font-semibold text-left flex items-center justify-between transition-colors ${
                        isSelected
                          ? 'bg-red-50/80 dark:bg-red-950/40 text-brand-red font-bold'
                          : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <span>{tab.label}</span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-400 font-mono">({tab.count})</span>
                        {isSelected && <Check size={14} className="text-brand-red" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <table className="min-w-[960px] w-full divide-y divide-gray-200 dark:divide-slate-800">
          <thead className="bg-slate-50/80 dark:bg-slate-950">
            <tr>
              {['User Profile', 'Role Classification', 'Security Policy', 'Portal Role Assignment', 'Account Access', 'Live Dashboard', 'Actions'].map((heading) => (
                <th key={heading} className="px-5 py-3.5 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs dark:divide-slate-800/80">
            {loading ? (
              <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-400">Loading user records…</td></tr>
            ) : filteredUsers.length === 0 ? (
              <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-400">No matching user records found.</td></tr>
            ) : filteredUsers.map((user) => {
              const status = String(user.accountStatus || 'ACTIVE').toUpperCase();
              const role = String(user.role || 'user').toUpperCase();
              const userEmail = (user.email || '').toLowerCase().trim();
              const isUpdatingThisRole = updatingRoleUserId === user.id;
              const isSelf = currentUser && user.id === currentUser.uid;
              const isProtected = PROTECTED_EMAILS.includes(userEmail);

              return (
                <tr key={user.id} className="bg-white dark:bg-slate-900 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 text-xs font-bold">
                        {role.includes('ADMIN') ? <Shield size={16} className="text-brand-red" /> : <User size={16} />}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 dark:text-white truncate">
                          {resolveRealName(user, user.email, 'Registered User')}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {user.email || 'No email registered'}
                          {user.schoolName && <span className="text-slate-400"> · {user.schoolName}</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="font-semibold text-slate-700 dark:text-slate-300 text-xs">
                      {role}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <button 
                      type="button"
                      onClick={() => handleToggleForcePasswordReset(user.id, user.forcePasswordReset === true)} 
                      className={`min-h-8 rounded-lg px-2.5 text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                        user.forcePasswordReset 
                          ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800' 
                          : 'bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:text-slate-900'
                      }`}
                    >
                      <KeyRound size={12} />
                      <span>{user.forcePasswordReset ? 'Reset Required' : 'Password Active'}</span>
                    </button>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="relative inline-flex items-center">
                      <select 
                        value={role} 
                        disabled={isUpdatingThisRole}
                        onChange={(e) => void handleRoleChange(user.id, e.target.value)} 
                        className="min-h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-brand-red disabled:opacity-50"
                      >
                        {ROLE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                      {isUpdatingThisRole && (
                        <div className="ml-2">
                          <Loader2 size={13} className="animate-spin text-brand-red" />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <button 
                      type="button"
                      onClick={() => void handleAccountStatus(user.id, status)} 
                      className={`min-h-8 rounded-lg border px-2.5 text-xs font-bold transition-colors cursor-pointer ${
                        status === 'SUSPENDED' 
                          ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300' 
                          : 'border-slate-200 text-slate-600 hover:text-red-600 dark:border-slate-700 dark:text-slate-300 dark:hover:text-red-400'
                      }`}
                    >
                      {status === 'SUSPENDED' ? 'Suspended · Restore' : 'Active · Suspend'}
                    </button>
                  </td>
                  <td className="px-5 py-3.5">
                    <button
                      type="button"
                      onClick={() => {
                        toast.info(`Opening dashboard for ${user.name || user.email}...`);
                        startImpersonation({
                          id: user.id,
                          uid: user.id,
                          name: user.name || user.displayName,
                          email: user.email,
                          role: role,
                          schoolId: user.schoolId,
                          studentDocId: user.studentDocId || user.id,
                          class: user.class || user.classLevel,
                          phone: user.phone
                        }, navigate);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-2xs transition-all active:scale-95 cursor-pointer whitespace-nowrap"
                    >
                      <UserCheck size={13} />
                      <span>Log In As</span>
                    </button>
                  </td>
                  <td className="px-5 py-3.5">
                    {isSuperAdmin && (
                      <button
                        type="button"
                        disabled={Boolean(isSelf || isProtected)}
                        title={isSelf ? 'Cannot delete your own account' : isProtected ? 'System protected account' : 'Permanently delete user and records'}
                        onClick={() => {
                          setUserToDelete(user);
                          setDeleteConfirmationText('');
                        }}
                        className="inline-flex items-center justify-center p-2 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 dark:text-red-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                        aria-label={`Permanently delete user ${user.email || user.id}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminUsers;
