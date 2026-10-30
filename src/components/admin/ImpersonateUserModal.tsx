import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useToast } from '../../contexts/ToastContext';
import { 
  Search, X, UserCheck, Shield, GraduationCap, 
  Briefcase, School, Users, ArrowRight, 
  AlertCircle, RefreshCw
} from 'lucide-react';
import { startImpersonation, type ImpersonationTarget } from '../../utils/impersonation';

interface ImpersonateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultRole?: string;
}

export const ImpersonateUserModal: React.FC<ImpersonateUserModalProps> = ({
  isOpen,
  onClose,
  defaultRole = 'ALL'
}) => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>(defaultRole);
  const [allUsers, setAllUsers] = useState<ImpersonationTarget[]>([]);

  useEffect(() => {
    if (!isOpen) return;

    const fetchAllAccounts = async () => {
      setLoading(true);
      try {
        const usersList: ImpersonationTarget[] = [];
        const seenIds = new Set<string>();

        // 1. Fetch from 'users' & 'parents' collections
        try {
          const [userSnaps, parentSnaps] = await Promise.all([
            getDocs(collection(db, 'users')),
            getDocs(collection(db, 'parents')).catch(() => ({ docs: [] } as any))
          ]);
          const parentIds = new Set<string>();
          const parentEmails = new Set<string>();
          parentSnaps.docs.forEach((pDoc: any) => {
            parentIds.add(pDoc.id);
            const pd = pDoc.data() || {};
            if (pd.uid) parentIds.add(String(pd.uid));
            if (pd.email) parentEmails.add(String(pd.email).toLowerCase().trim());
          });

          userSnaps.forEach(docSnap => {
            const d = docSnap.data();
            if (d.isDuplicate) return;
            const id = docSnap.id;
            const emailKey = (d.email || '').toLowerCase().trim();
            if (emailKey && seenIds.has(emailKey)) return;
            seenIds.add(id);
            if (d.userId) seenIds.add(d.userId);
            if (d.studentDocId) seenIds.add(d.studentDocId);
            if (emailKey) seenIds.add(emailKey);

            let role = String(d.role || 'STUDENT').toUpperCase();
            if (parentIds.has(id) || (emailKey && parentEmails.has(emailKey)) || d.isParent === true) {
              role = 'PARENT';
            }
            usersList.push({
              id: id,
              uid: id,
              name: d.name || d.fullName || d.displayName || d.email?.split('@')[0] || 'User',
              email: d.email || '',
              role: role,
              schoolId: d.schoolId || '',
              schoolName: d.schoolName || '',
              studentDocId: d.studentDocId || id,
              class: d.class || d.classLevel || d.grade || '',
              classLevel: d.class || d.classLevel || d.grade || '',
              phone: d.phone || ''
            });
          });
        } catch (e) {
          console.warn('Error fetching users:', e);
        }

        // 2. Fetch from 'students' & 'individualStudents'
        try {
          const [schoolStudents, indivStudents] = await Promise.all([
            getDocs(collection(db, 'students')).catch(() => ({ docs: [] })),
            getDocs(collection(db, 'individualStudents')).catch(() => ({ docs: [] }))
          ]);

          schoolStudents.docs.forEach(docSnap => {
            const d = docSnap.data();
            const id = docSnap.id;
            const emailKey = (d.email || d.parentEmail || '').toLowerCase().trim();
            if (!seenIds.has(id) && (!emailKey || !seenIds.has(emailKey))) {
              seenIds.add(id);
              if (d.userId) seenIds.add(d.userId);
              if (emailKey) seenIds.add(emailKey);
              usersList.push({
                id: id,
                uid: d.userId || id,
                name: d.name || d.studentName || d.fullName || 'School Student',
                email: d.email || d.parentEmail || '',
                role: 'STUDENT',
                schoolId: d.schoolId || '',
                schoolName: d.schoolName || '',
                studentDocId: id,
                class: d.classLevel || d.class || d.grade || 'Primary 1',
                classLevel: d.classLevel || d.class || d.grade || 'Primary 1',
                phone: d.parentPhone || d.phone || ''
              });
            }
          });

          indivStudents.docs.forEach(docSnap => {
            const d = docSnap.data();
            const id = docSnap.id;
            const emailKey = (d.email || d.parentEmail || '').toLowerCase().trim();
            if (!seenIds.has(id) && (!emailKey || !seenIds.has(emailKey))) {
              seenIds.add(id);
              if (d.userId) seenIds.add(d.userId);
              if (emailKey) seenIds.add(emailKey);
              usersList.push({
                id: id,
                uid: d.userId || id,
                name: d.name || d.studentName || d.fullName || 'Private Student',
                email: d.email || d.parentEmail || '',
                role: 'STUDENT',
                studentDocId: id,
                class: d.classLevel || d.class || d.grade || 'Grade 1',
                classLevel: d.classLevel || d.class || d.grade || 'Grade 1',
                phone: d.parentPhone || d.phone || ''
              });
            }
          });
        } catch (e) {
          console.warn('Error fetching student collections:', e);
        }

        // 3. Fetch from 'schools'
        try {
          const schoolSnaps = await getDocs(collection(db, 'schools'));
          schoolSnaps.forEach(docSnap => {
            const d = docSnap.data();
            const id = docSnap.id;
            const emailKey = (d.email || d.adminEmail || d.contactEmail || '').toLowerCase().trim();
            if (!seenIds.has(id) && (!emailKey || !seenIds.has(emailKey))) {
              seenIds.add(id);
              if (d.adminUid) seenIds.add(d.adminUid);
              if (d.userId) seenIds.add(d.userId);
              if (emailKey) seenIds.add(emailKey);
              usersList.push({
                id: id,
                uid: d.adminUid || d.userId || id,
                name: d.name || d.schoolName || 'School Administrator',
                email: d.email || d.adminEmail || d.contactEmail || '',
                role: 'SCHOOL',
                schoolId: id,
                schoolName: d.name || d.schoolName || '',
                phone: d.phone || ''
              });
            }
          });
        } catch (e) {
          console.warn('Error fetching schools:', e);
        }

        // 4. Fetch from 'staff'
        try {
          const staffSnaps = await getDocs(collection(db, 'staff'));
          staffSnaps.forEach(docSnap => {
            const d = docSnap.data();
            const id = docSnap.id;
            const emailKey = (d.email || '').toLowerCase().trim();
            if (!seenIds.has(id) && (!emailKey || !seenIds.has(emailKey))) {
              seenIds.add(id);
              if (d.userId) seenIds.add(d.userId);
              if (emailKey) seenIds.add(emailKey);
              usersList.push({
                id: id,
                uid: d.userId || id,
                name: d.name || d.fullName || 'Instructor',
                email: d.email || '',
                role: 'TUTOR',
                phone: d.phone || ''
              });
            }
          });
        } catch (e) {
          console.warn('Error fetching staff:', e);
        }

        setAllUsers(usersList);
      } catch (err) {
        console.error('Error fetching impersonation directory:', err);
        toast.error('Unable to fetch all user accounts.');
      } finally {
        setLoading(false);
      }
    };

    fetchAllAccounts();
  }, [isOpen]);

  const filteredUsers = useMemo(() => {
    return allUsers.filter(u => {
      // Role filter
      if (roleFilter !== 'ALL') {
        const uRole = String(u.role).toUpperCase();
        if (roleFilter === 'STUDENT' && uRole !== 'STUDENT') return false;
        if (roleFilter === 'TUTOR' && !['TUTOR', 'STAFF', 'TEACHER', 'INSTRUCTOR'].includes(uRole)) return false;
        if (roleFilter === 'SCHOOL' && uRole !== 'SCHOOL') return false;
        if (roleFilter === 'PARENT' && uRole !== 'PARENT') return false;
      }

      // Search Query
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.schoolName && u.schoolName.toLowerCase().includes(q)) ||
        (u.class && u.class.toLowerCase().includes(q)) ||
        (u.id && u.id.toLowerCase().includes(q)) ||
        (u.phone && u.phone.toLowerCase().includes(q))
      );
    });
  }, [allUsers, searchQuery, roleFilter]);

  const handleSelectUser = (target: ImpersonationTarget) => {
    toast.info(`Logging in directly as ${target.name} (${target.role})...`);
    onClose();
    startImpersonation(target, navigate);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200 overflow-hidden">
      {/* Modal Container with strict max height to prevent mobile screen pass-through */}
      <div className="bg-white dark:bg-[#0c1220] border border-slate-200 dark:border-slate-800 rounded-3xl max-w-2xl w-full mx-auto p-4 sm:p-6 shadow-2xl relative max-h-[85dvh] sm:max-h-[88vh] flex flex-col overflow-hidden text-slate-900 dark:text-white">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-500/30 shrink-0">
              <UserCheck size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2 truncate">
                <span>Direct Dashboard Impersonation</span>
                <span className="hidden sm:inline-block px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                  Instant View-As
                </span>
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Log into any student, tutor, or school account without passwords.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 ml-2"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search & Filter Controls */}
        <div className="py-3 space-y-2.5 shrink-0">
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search student, tutor, school, email, or class..."
              className="w-full pl-9 pr-9 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-amber-500 placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Role Filter Badges */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {[
              { id: 'ALL', label: `All Users (${allUsers.length})`, icon: Users },
              { id: 'STUDENT', label: 'Students', icon: GraduationCap },
              { id: 'TUTOR', label: 'Tutors & Staff', icon: Briefcase },
              { id: 'SCHOOL', label: 'School Admins', icon: School },
              { id: 'PARENT', label: 'Parents', icon: Shield },
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setRoleFilter(tab.id)}
                  className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                    roleFilter === tab.id
                      ? 'bg-amber-500 text-white shadow-xs font-black'
                      : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-200/60 dark:border-slate-800'
                  }`}
                >
                  <Icon size={12} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Directory List Area - Scrollable */}
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-2 pr-1">
          {loading ? (
            <div className="py-12 text-center space-y-2">
              <RefreshCw size={22} className="mx-auto text-amber-500 animate-spin" />
              <p className="text-xs text-slate-400 font-mono">Scanning user directory &amp; rosters...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-10 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-5">
              <AlertCircle size={24} className="mx-auto text-slate-400 mb-1.5" />
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">No matching accounts found</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Try searching with a different name or role category.</p>
            </div>
          ) : (
            filteredUsers.map((item, idx) => {
              const uRole = String(item.role).toUpperCase();
              return (
                <div
                  key={`${item.role}-${item.id}-${idx}`}
                  className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#111726] hover:border-amber-500/60 dark:hover:border-amber-500/60 transition-all flex items-center justify-between gap-2.5 group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                      uRole === 'STUDENT'
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                        : uRole === 'SCHOOL'
                        ? 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
                        : uRole === 'TUTOR' || uRole === 'STAFF'
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}>
                      {uRole === 'STUDENT' ? '🎓' : uRole === 'SCHOOL' ? '🏫' : uRole === 'TUTOR' ? '👨‍🏫' : '👤'}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h4 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                          {item.name}
                        </h4>
                        <span className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase shrink-0 ${
                          uRole === 'STUDENT'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300'
                            : uRole === 'SCHOOL'
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-300'
                            : uRole === 'TUTOR' || uRole === 'STAFF'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                            : 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-300'
                        }`}>
                          {uRole}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-500 dark:text-slate-300 mt-0.5">
                        <span className="truncate max-w-[170px] sm:max-w-xs">{item.email || 'No email registered'}</span>
                        {item.class && <span className="font-medium text-slate-600 dark:text-slate-300 font-mono">Class: {item.class}</span>}
                        {item.schoolName && <span className="font-semibold text-purple-600 dark:text-purple-400 truncate max-w-[120px]">{item.schoolName}</span>}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSelectUser(item)}
                    className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black text-xs inline-flex items-center gap-1 shadow-xs transition-transform active:scale-95 shrink-0"
                    title={`Log in directly as ${item.name}`}
                  >
                    <span>Log In</span>
                    <ArrowRight size={12} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-400 shrink-0">
          <span className="truncate mr-2">Admin View-As Tool • Renders top exit banner</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-slate-700 dark:text-slate-200 transition-colors shrink-0"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};

export default ImpersonateUserModal;
