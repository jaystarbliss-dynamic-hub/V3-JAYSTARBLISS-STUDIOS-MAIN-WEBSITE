import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  collection, getDocs, addDoc, deleteDoc, doc, setDoc,
  query, where, orderBy, serverTimestamp 
} from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { useToast } from '../../contexts/ToastContext';
import { startImpersonation } from '../../utils/impersonation';
import { resolveRealName, isValidHumanName } from '../../utils/userNames';
import StaffSchoolAssignments from './StaffSchoolAssignments';
import { 
  UserCheck, Users, Key, Plus, Trash2, 
  ExternalLink, BookOpen, 
  Briefcase, Mail, Phone, ShieldBan, ShieldCheck,
  Settings, X, Copy, School, GraduationCap,
  Search, Filter, AlertTriangle, ArrowRight,
  ShieldAlert, RefreshCw, Award, BookMarked,
  Layers, RotateCcw
} from 'lucide-react';

export interface EnrichedStaff {
  id: string;
  name?: string;
  fullName: string;
  email: string;
  phone: string;
  role: string;
  accountStatus: string;
  specialization: string;
  department?: string;
  track?: string;
  subjects: string[];
  qualification?: string;
  experienceYears?: string;
  bio?: string;
  daysPerWeek?: string;
  timeSlot?: string;
  location?: string;
  createdAt?: any;
  assignedStudents: Array<{
    id: string;
    fullName: string;
    username?: string;
    class?: string;
    track?: string;
    studentType?: string;
    schoolName?: string;
    parentName?: string;
  }>;
  assignedSchools: Array<{
    id: string;
    name?: string;
    schoolCode?: string;
  }>;
}

// Normalize subjects into array
const normalizeSubjects = (raw: any): string[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map(s => String(s).trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw.split(/[,/|;]+/).map(s => s.trim()).filter(Boolean);
  }
  return [];
};

const AdminStaff: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'manage' | 'resources' | 'schoolAccess'>('manage');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Staff members & enriched data
  const [staffList, setStaffList] = useState<EnrichedStaff[]>([]);
  const [searchQuery, setSearchQuery] = useState(() => new URLSearchParams(window.location.search).get('tutorId') || '');

  // Filter Popover States
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED' | 'BANNED'>('ALL');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'TUTOR' | 'STAFF' | 'INSTRUCTOR'>('ALL');
  const [subjectFilter, setSubjectFilter] = useState<string>(() => new URLSearchParams(window.location.search).get('subject') || 'ALL');
  const [studentAssignmentFilter, setStudentAssignmentFilter] = useState<'ALL' | 'ASSIGNED' | 'UNASSIGNED'>('ALL');
  const [schoolAssignmentFilter, setSchoolAssignmentFilter] = useState<'ALL' | 'ASSIGNED' | 'UNASSIGNED'>('ALL');
  const filterRef = useRef<HTMLDivElement>(null);

  // Modal State
  const [managingStaff, setManagingStaff] = useState<EnrichedStaff | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [deleteConfirmStaff, setDeleteConfirmStaff] = useState<EnrichedStaff | null>(null);

  // Staff Resources
  const [staffResources, setStaffResources] = useState<any[]>([]);
  const [resForm, setResForm] = useState({
    title: '',
    url: '',
    description: ''
  });
  const [postingResource, setPostingResource] = useState(false);

  // Close filter popover on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false);
      }
    };
    if (isFilterOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isFilterOpen]);

  // Fetch and enrich all staff data without circular dependency
  const fetchStaffData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Concurrently fetch users, parents, tutors, staff, applications, schools, access, students
      const [
        usersSnap,
        parentsSnap,
        tutorsSnap,
        staffCollSnap,
        tutorAppsSnap,
        tutorSubjectsSnap,
        schoolsSnap,
        staffSchoolAccessSnap,
        schoolStudentsSnap,
        indStudentsSnap,
        resSnap
      ] = await Promise.all([
        getDocs(query(collection(db, 'users'), where('role', 'in', ['staff', 'tutor', 'STAFF', 'TUTOR', 'instructor', 'faculty', 'teacher']))).catch(() => ({ docs: [] } as any)),
        getDocs(collection(db, 'parents')).catch(() => ({ docs: [] } as any)),
        getDocs(collection(db, 'tutors')).catch(() => ({ docs: [] } as any)),
        getDocs(collection(db, 'staff')).catch(() => ({ docs: [] } as any)),
        getDocs(collection(db, 'tutor_applications')).catch(() => ({ docs: [] } as any)),
        getDocs(collection(db, 'tutorSubjects')).catch(() => ({ docs: [] } as any)),
        getDocs(collection(db, 'schools')).catch(() => ({ docs: [] } as any)),
        getDocs(collection(db, 'staffSchoolAccess')).catch(() => ({ docs: [] } as any)),
        getDocs(collection(db, 'students')).catch(() => ({ docs: [] } as any)),
        getDocs(collection(db, 'individualStudents')).catch(() => ({ docs: [] } as any)),
        getDocs(query(collection(db, 'staffGeneralResources'), orderBy('timestamp', 'desc'))).catch(() => getDocs(collection(db, 'staffGeneralResources')).catch(() => ({ docs: [] } as any)))
      ]);

      // Build strict parent exclusion sets so parents never leak into Staff/Faculty
      const parentIdSet = new Set<string>();
      const parentEmailSet = new Set<string>();
      parentsSnap.docs.forEach((d: any) => {
        parentIdSet.add(d.id);
        const pd = d.data() || {};
        if (pd.uid) parentIdSet.add(String(pd.uid));
        if (pd.email) parentEmailSet.add(String(pd.email).toLowerCase().trim());
      });

      // Map schools
      const schoolsMap = new Map<string, { id: string; name?: string; schoolCode?: string }>();
      schoolsSnap.docs.forEach((d: any) => {
        const sdata = d.data();
        schoolsMap.set(d.id, {
          id: d.id,
          name: sdata.name || sdata.schoolName || 'School',
          schoolCode: sdata.schoolCode || sdata.code || ''
        });
      });

      // Map staff school access
      const staffSchoolsMap = new Map<string, string[]>();
      staffSchoolAccessSnap.docs.forEach((d: any) => {
        const data = d.data();
        const ids = Array.isArray(data.schoolIds) ? data.schoolIds : data.schoolId ? [data.schoolId] : [];
        staffSchoolsMap.set(d.id, ids.map(String));
      });

      // Map tutor applications by email and ID
      const tutorAppsByEmail = new Map<string, any>();
      const tutorAppsById = new Map<string, any>();
      tutorAppsSnap.docs.forEach((d: any) => {
        const data = d.data();
        tutorAppsById.set(d.id, data);
        if (data.email) {
          tutorAppsByEmail.set(String(data.email).toLowerCase().trim(), data);
        }
      });

      // Map approved teaching subjects
      const approvedSubjectsByTutor = new Map<string, string[]>();
      tutorSubjectsSnap.docs.forEach((d: any) => {
        const data = d.data();
        if (!data.tutorId || !data.subjectName) return;
        const current = approvedSubjectsByTutor.get(data.tutorId) || [];
        current.push(String(data.subjectName));
        approvedSubjectsByTutor.set(data.tutorId, current);
      });

      // Map tutors collection documents
      const tutorsByEmail = new Map<string, any>();
      const tutorsById = new Map<string, any>();
      tutorsSnap.docs.forEach((d: any) => {
        const data = d.data();
        tutorsById.set(d.id, { id: d.id, ...data });
        if (data.email) {
          tutorsByEmail.set(String(data.email).toLowerCase().trim(), { id: d.id, ...data });
        }
      });

      // All students deduplicated
      const allStudentsMap = new Map<string, any>();
      schoolStudentsSnap.docs.forEach((d: any) => {
        const sd = d.data();
        allStudentsMap.set(d.id, {
          id: d.id,
          studentType: sd.schoolId ? 'school' : (sd.studentType || 'school'),
          ...sd
        });
      });
      indStudentsSnap.docs.forEach((d: any) => {
        const sd = d.data();
        if (!allStudentsMap.has(d.id)) {
          allStudentsMap.set(d.id, { id: d.id, studentType: 'individual', ...sd });
        } else {
          const existing = allStudentsMap.get(d.id);
          allStudentsMap.set(d.id, { ...existing, ...sd, studentType: sd.schoolId ? 'school' : 'individual' });
        }
      });
      const allStudentDocs: any[] = Array.from(allStudentsMap.values());

      // Combine user profiles with tutors & staff collections, excluding parents and duplicates
      const rawUsersMap = new Map<string, any>();
      const seenEmails = new Map<string, string>();

      const addCandidate = (id: string, data: any, defaultRole: string) => {
        if (!data || data.isDuplicate || data.isParent === true) return;
        const emailLower = String(data.email || '').toLowerCase().trim();
        const roleLower = String(data.role || defaultRole).toLowerCase().trim();
        if (roleLower === 'parent' || roleLower === 'student' || roleLower === 'school') return;
        if (parentIdSet.has(id) || (emailLower && parentEmailSet.has(emailLower))) return;

        if (emailLower && seenEmails.has(emailLower)) {
          const existingId = seenEmails.get(emailLower)!;
          const existing = rawUsersMap.get(existingId);
          rawUsersMap.set(existingId, {
            ...data,
            ...existing,
            aliasTutorIds: Array.from(new Set([
              existingId,
              id,
              ...(Array.isArray(existing?.aliasTutorIds) ? existing.aliasTutorIds : []),
              ...(Array.isArray(data?.aliasTutorIds) ? data.aliasTutorIds : []),
            ])),
          });
          return;
        }

        rawUsersMap.set(id, { id, role: defaultRole, ...data });
        if (emailLower) seenEmails.set(emailLower, id);
      };

      usersSnap.docs.forEach((d: any) => addCandidate(d.id, d.data(), 'staff'));
      tutorsSnap.docs.forEach((d: any) => addCandidate(d.id, d.data(), 'tutor'));
      staffCollSnap.docs.forEach((d: any) => addCandidate(d.id, d.data(), 'staff'));

      const rawStaffList = Array.from(rawUsersMap.values());

      const enriched: EnrichedStaff[] = rawStaffList.map((st: any) => {
        const staffId = st.id;
        const staffEmail = (st.email || '').toLowerCase().trim();
        const tutorData = tutorsById.get(staffId) || tutorsByEmail.get(staffEmail) || {};
        const appData = tutorAppsById.get(staffId) || tutorAppsByEmail.get(staffEmail) || {};

        // Build alias IDs for this tutor (including legacy tutor doc IDs with same email)
        const aliasIds = new Set<string>([
          staffId,
          ...(Array.isArray(st.aliasTutorIds) ? st.aliasTutorIds.map(String) : []),
          ...(Array.isArray(tutorData.aliasTutorIds) ? tutorData.aliasTutorIds.map(String) : []),
        ]);
        if (tutorData.id) aliasIds.add(String(tutorData.id));

        // Resolve Real Name across user, tutor, and application documents
        const mergedProfile = { ...appData, ...tutorData, ...st };
        const fullName = resolveRealName(mergedProfile, staffEmail);

        // Resolve Subjects & Specialization
        const userSubjects = normalizeSubjects(st.subjects || st.specialization || st.courses || st.track || st.teachingSubjects);
        const tutorSubjects = normalizeSubjects(tutorData.subjects || tutorData.specialization);
        const appSubjects = normalizeSubjects(appData.subjects);
        const approvedSubjects = approvedSubjectsByTutor.get(staffId) || [];
        const mergedSubjects = Array.from(new Set([...userSubjects, ...tutorSubjects, ...appSubjects, ...approvedSubjects]));

        const specialization = st.specialization || tutorData.specialization || appData.specialization || 
                               st.track || st.department || (mergedSubjects.length > 0 ? mergedSubjects.join(', ') : 'Academic & Creative Track');

        // Matched Schools (resolved first so school-assigned students are also linked)
        const schoolIdsFromAccess: string[] = [];
        aliasIds.forEach(aid => {
          const sids = staffSchoolsMap.get(aid) || [];
          schoolIdsFromAccess.push(...sids);
        });
        const schoolIds = [
          ...schoolIdsFromAccess,
          ...(Array.isArray(st.schoolIds) ? st.schoolIds : st.schoolId ? [st.schoolId] : []),
          ...(Array.isArray(tutorData.schoolIds) ? tutorData.schoolIds : tutorData.schoolId ? [tutorData.schoolId] : []),
        ];
        const uniqueSchoolIds = Array.from(new Set(schoolIds.map(String).filter(Boolean)));
        const matchedSchools = uniqueSchoolIds
          .map(sid => schoolsMap.get(sid) || { id: sid, name: `School (${sid.slice(0, 6)})`, schoolCode: '' })
          .filter(Boolean);
        const matchedSchoolIdSet = new Set(uniqueSchoolIds);

        // Matched Students (direct tutor assignment + aliasTutorIds + assigned schools)
        const staffNameLower = fullName.toLowerCase();
        const matchedStudents = allStudentDocs.filter(stu => {
          if (aliasIds.has(String(stu.tutorId || '')) || aliasIds.has(String(stu.assignedTutorId || '')) || aliasIds.has(String(stu.staffId || ''))) return true;
          if (Array.isArray(stu.assignedTutors) && stu.assignedTutors.length > 0) {
            const matchedInArr = stu.assignedTutors.some((at: any) => 
              aliasIds.has(String(at?.tutorId || at?.id || at || '')) || 
              (at?.tutorEmail && at.tutorEmail.toLowerCase().trim() === staffEmail) ||
              (at?.tutorName && at.tutorName.toLowerCase().trim() === staffNameLower)
            );
            if (matchedInArr) return true;
          }
          if (stu.tutorEmail && stu.tutorEmail.toLowerCase().trim() === staffEmail) return true;
          if (stu.tutorName && stu.tutorName.toLowerCase().trim() === staffNameLower) return true;
          if (stu.schoolId && matchedSchoolIdSet.has(String(stu.schoolId))) return true;
          return false;
        }).map(stu => {
          const isSchoolLearner = Boolean(stu.schoolId);
          const resolvedSchoolName = stu.schoolName || stu.school || (stu.schoolId ? schoolsMap.get(String(stu.schoolId))?.name : '');
          return {
            id: stu.id,
            fullName: stu.fullName || stu.name || stu.studentName || 'Student Cadet',
            username: stu.username,
            class: stu.class || stu.grade,
            track: stu.track || stu.learningTrack,
            studentType: isSchoolLearner ? 'school' : 'individual',
            schoolName: resolvedSchoolName,
            parentName: stu.parentName
          };
        });

        const accountStatus = String(st.accountStatus || st.status || tutorData.status || 'ACTIVE').toUpperCase();

        return {
          id: staffId,
          name: fullName,
          fullName: fullName,
          email: staffEmail,
          phone: st.phone || st.phoneNumber || tutorData.phone || appData.phone || '',
          role: String(st.role || tutorData.role || 'STAFF').toUpperCase(),
          accountStatus: ['SUSPENDED', 'BANNED', 'DISABLED'].includes(accountStatus) ? accountStatus : 'ACTIVE',
          specialization,
          department: st.department || tutorData.department || '',
          track: st.track || tutorData.track || '',
          subjects: mergedSubjects.length > 0 ? mergedSubjects : [specialization],
          qualification: st.qualification || tutorData.qualification || appData.qualification || '',
          experienceYears: st.experienceYears || tutorData.experienceYears || appData.experienceYears || '',
          bio: st.bio || tutorData.bio || appData.bio || '',
          daysPerWeek: st.daysPerWeek || tutorData.daysPerWeek || appData.daysPerWeek || '',
          timeSlot: st.timeSlot || tutorData.timeSlot || appData.timeSlot || '',
          location: st.location || tutorData.location || appData.location || '',
          createdAt: st.createdAt || tutorData.createdAt,
          assignedStudents: matchedStudents,
          assignedSchools: matchedSchools
        };
      });

      setStaffList(enriched);
      setStaffResources(resSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
    } catch (err: any) {
      console.error('Error fetching faculty data:', err);
      toast.error('Failed to load staff operations data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  // Run on initial mount
  useEffect(() => {
    void fetchStaffData();
  }, [fetchStaffData]);

  // Copy helper
  const copyToClipboard = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`);
  };

  // Update staff status (Active, Suspended, Banned)
  const handleUpdateStatus = async (staffMember: EnrichedStaff, nextStatus: 'ACTIVE' | 'SUSPENDED' | 'BANNED') => {
    const actionLabel = nextStatus === 'ACTIVE' ? 'Reactivate' : nextStatus === 'SUSPENDED' ? 'Suspend' : 'Ban';
    if (!window.confirm(`Are you sure you want to ${actionLabel} account access for "${staffMember.fullName}"?`)) {
      return;
    }

    setActionLoading(true);
    try {
      // 1. Direct Firestore user record update
      await setDoc(doc(db, 'users', staffMember.id), {
        accountStatus: nextStatus,
        status: nextStatus === 'ACTIVE' ? 'active' : 'suspended',
        portalAccessEnabled: nextStatus === 'ACTIVE',
        updatedAt: serverTimestamp()
      }, { merge: true });

      // Also update tutors collection doc if exists
      await setDoc(doc(db, 'tutors', staffMember.id), {
        status: nextStatus,
        updatedAt: serverTimestamp()
      }, { merge: true }).catch(() => {});

      // 2. Netlify admin account function if available
      try {
        if (auth.currentUser) {
          const token = await auth.currentUser.getIdToken();
          await fetch('/.netlify/functions/admin-account-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ userId: staffMember.id, status: nextStatus })
          });
        }
      } catch (fnErr) {
        console.warn('Netlify function sync warning (Firestore updated directly):', fnErr);
      }

      // Update local state without triggering full re-fetch loops
      setStaffList(prev => prev.map(s => s.id === staffMember.id ? { ...s, accountStatus: nextStatus } : s));
      setManagingStaff(prev => prev && prev.id === staffMember.id ? { ...prev, accountStatus: nextStatus } : prev);

      toast.success(`${staffMember.fullName} status updated to ${nextStatus}.`);
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to update account status: ' + (err?.message || 'Unknown error'));
    } finally {
      setActionLoading(false);
    }
  };

  // Permanently delete staff record
  const handlePermanentDelete = async (staffMember: EnrichedStaff) => {
    setActionLoading(true);
    try {
      await deleteDoc(doc(db, 'users', staffMember.id));
      await deleteDoc(doc(db, 'tutors', staffMember.id)).catch(() => {});
      await deleteDoc(doc(db, 'staff', staffMember.id)).catch(() => {});
      await deleteDoc(doc(db, 'staffSchoolAccess', staffMember.id)).catch(() => {});

      // Update local state
      setStaffList(prev => prev.filter(s => s.id !== staffMember.id));
      setDeleteConfirmStaff(null);
      setManagingStaff(null);

      toast.success(`Staff member "${staffMember.fullName}" deleted permanently.`);
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to delete staff record: ' + (err?.message || 'Unknown error'));
    } finally {
      setActionLoading(false);
    }
  };

  // Post Staff Resource
  const handlePostStaffResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resForm.title.trim() || !resForm.url.trim()) {
      toast.error('Please enter a resource title and URL.');
      return;
    }
    setPostingResource(true);
    try {
      await addDoc(collection(db, 'staffGeneralResources'), {
        title: resForm.title.trim(),
        url: resForm.url.trim(),
        description: resForm.description.trim(),
        timestamp: serverTimestamp()
      });

      toast.success(`Staff guide "${resForm.title}" published!`);
      setResForm({ title: '', url: '', description: '' });
      void fetchStaffData();
    } catch (err: any) {
      toast.error('Error posting resource: ' + err.message);
    } finally {
      setPostingResource(false);
    }
  };

  // Delete Staff Resource
  const handleDeleteStaffResource = async (id: string, title: string) => {
    if (!window.confirm(`Delete staff resource "${title}"?`)) return;
    try {
      await deleteDoc(doc(db, 'staffGeneralResources', id));
      toast.success(`Deleted "${title}".`);
      void fetchStaffData();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    }
  };

  // Extract all unique subjects from all staff members for the subject filter
  const allAvailableSubjects = useMemo(() => {
    const set = new Set<string>();
    // Pre-seed core curriculum subjects
    ['Music', 'Mathematics', 'Hardware & Electronics & AI', 'Coding & Python', 'Web Development', 'Science & Technology', 'English & Phonics', 'Chess', 'Game Development'].forEach(s => set.add(s));
    staffList.forEach(st => {
      st.subjects.forEach(sub => {
        if (sub && sub.length > 1) set.add(sub);
      });
    });
    return Array.from(set).sort();
  }, [staffList]);

  // Count active filters for badge
  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (statusFilter !== 'ALL') count++;
    if (roleFilter !== 'ALL') count++;
    if (subjectFilter !== 'ALL') count++;
    if (studentAssignmentFilter !== 'ALL') count++;
    if (schoolAssignmentFilter !== 'ALL') count++;
    return count;
  }, [statusFilter, roleFilter, subjectFilter, studentAssignmentFilter, schoolAssignmentFilter]);

  // Reset all filters
  const resetFilters = () => {
    setStatusFilter('ALL');
    setRoleFilter('ALL');
    setSubjectFilter('ALL');
    setStudentAssignmentFilter('ALL');
    setSchoolAssignmentFilter('ALL');
    setSearchQuery('');
  };

  // Filtered staff computation
  const filteredStaff = useMemo(() => {
    return staffList.filter(staff => {
      // Query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = (staff.fullName || '').toLowerCase().includes(q);
        const matchesEmail = (staff.email || '').toLowerCase().includes(q);
        const matchesPhone = (staff.phone || '').toLowerCase().includes(q);
        const matchesRole = (staff.role || '').toLowerCase().includes(q);
        const matchesSpec = (staff.specialization || '').toLowerCase().includes(q);
        const matchesSubject = staff.subjects.some(sub => sub.toLowerCase().includes(q));
        const matchesStudent = staff.assignedStudents.some(s => s.fullName.toLowerCase().includes(q));
        const matchesSchool = staff.assignedSchools.some(s => (s.name || '').toLowerCase().includes(q));
        if (!matchesName && !matchesEmail && !matchesPhone && !matchesRole && !matchesSpec && !matchesSubject && !matchesStudent && !matchesSchool) {
          return false;
        }
      }

      // Status filter
      if (statusFilter !== 'ALL') {
        if (staff.accountStatus !== statusFilter) return false;
      }

      // Role filter
      if (roleFilter !== 'ALL') {
        const r = (staff.role || '').toUpperCase();
        if (roleFilter === 'TUTOR' && !r.includes('TUTOR') && !r.includes('INSTRUCTOR')) return false;
        if (roleFilter === 'STAFF' && !r.includes('STAFF')) return false;
        if (roleFilter === 'INSTRUCTOR' && !r.includes('INSTRUCTOR') && !r.includes('TEACHER')) return false;
      }

      // Subject filter
      if (subjectFilter !== 'ALL') {
        const subLower = subjectFilter.toLowerCase();
        const hasSubject = staff.subjects.some(s => s.toLowerCase().includes(subLower)) ||
                           (staff.specialization && staff.specialization.toLowerCase().includes(subLower));
        if (!hasSubject) return false;
      }

      // Student assignment filter
      if (studentAssignmentFilter === 'ASSIGNED' && staff.assignedStudents.length === 0) return false;
      if (studentAssignmentFilter === 'UNASSIGNED' && staff.assignedStudents.length > 0) return false;

      // School assignment filter
      if (schoolAssignmentFilter === 'ASSIGNED' && staff.assignedSchools.length === 0) return false;
      if (schoolAssignmentFilter === 'UNASSIGNED' && staff.assignedSchools.length > 0) return false;

      return true;
    });
  }, [staffList, searchQuery, statusFilter, roleFilter, subjectFilter, studentAssignmentFilter, schoolAssignmentFilter]);

  return (
    <div className="space-y-8">
      {/* Action Toolbar */}
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => { setRefreshing(true); void fetchStaffData(); }}
          disabled={loading || refreshing}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-50 shadow-2xs"
          title="Refresh faculty directory"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin text-brand-red' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-slate-800 space-x-4">
        <button
          onClick={() => setActiveTab('manage')}
          className={`pb-3 px-2 text-sm font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'manage'
              ? 'border-brand-red text-brand-red'
              : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <UserCheck size={17} />
          <span>Staff Directory ({staffList.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('resources')}
          className={`pb-3 px-2 text-sm font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'resources'
              ? 'border-brand-red text-brand-red'
              : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <BookOpen size={17} />
          <span>Staff Resources &amp; Guides ({staffResources.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('schoolAccess')}
          className={`pb-3 px-2 text-sm font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'schoolAccess'
              ? 'border-brand-red text-brand-red'
              : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <Key size={17} />
          <span>Staff School Access Code</span>
        </button>
      </div>

      {/* ══ TAB 1: MANAGE STAFF & DIRECTORY ══ */}
      {activeTab === 'manage' && (
        <div className="space-y-6">
          
          {/* Top Banner: Perfectly Fitted Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            {/* Card 1: Total Faculty */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all hover:border-slate-300 dark:hover:border-slate-700">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Registered Faculty
                </span>
                <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <Users size={18} />
                </div>
              </div>
              <div className="mt-3">
                <p className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight font-mono">
                  {staffList.length}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Active tutors &amp; instructors
                </p>
              </div>
            </div>

            {/* Card 2: Active Mentors */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all hover:border-slate-300 dark:hover:border-slate-700">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Active Mentors
                </span>
                <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <ShieldCheck size={18} />
                </div>
              </div>
              <div className="mt-3">
                <p className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 tracking-tight font-mono">
                  {staffList.filter(s => s.accountStatus === 'ACTIVE').length}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Authorized for portal teaching
                </p>
              </div>
            </div>

            {/* Card 3: Assigned Students */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 transition-all hover:border-slate-300 dark:hover:border-slate-700">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Assigned Cadets
                </span>
                <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                  <GraduationCap size={18} />
                </div>
              </div>
              <div className="mt-3">
                <p className="text-3xl font-extrabold text-purple-600 dark:text-purple-400 tracking-tight font-mono">
                  {staffList.reduce((acc, s) => acc + s.assignedStudents.length, 0)}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Actively mentored students
                </p>
              </div>
            </div>

            {/* Card 4: Staff Onboarding */}
            <div className="rounded-2xl border border-brand-red/20 bg-gradient-to-br from-brand-red/[0.04] to-transparent p-5 shadow-sm dark:border-brand-red/30 dark:bg-slate-900 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-brand-red">
                    Staff Onboarding
                  </span>
                  <div className="w-9 h-9 rounded-xl bg-red-100/60 dark:bg-brand-red/20 text-brand-red flex items-center justify-center shrink-0">
                    <Plus size={18} />
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                  Create new instructors &amp; configure credentials.
                </p>
              </div>
              <div className="mt-4 pt-2 border-t border-red-100/80 dark:border-slate-800">
                <a
                  href="/admin/users"
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-red hover:text-red-700 dark:hover:text-red-400 transition-colors"
                >
                  <span>Add / Invite Staff</span>
                  <ArrowRight size={13} />
                </a>
              </div>
            </div>
          </div>

          {/* Search Bar & Dropdown Filter Control */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by faculty name, subject (e.g. Music, Math), email, student or school..."
                className="w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:border-brand-red focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Filter Popover Button & Container */}
            <div className="relative" ref={filterRef}>
              <button
                type="button"
                onClick={() => setIsFilterOpen(prev => !prev)}
                className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border px-4 py-2 text-xs font-bold transition-all cursor-pointer shadow-2xs ${
                  activeFiltersCount > 0 || isFilterOpen
                    ? 'border-brand-red bg-brand-red/5 text-brand-red dark:bg-brand-red/10'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                }`}
              >
                <Filter size={15} />
                <span>Filters</span>
                {activeFiltersCount > 0 && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-red text-[10px] font-black text-white">
                    {activeFiltersCount}
                  </span>
                )}
              </button>

              {/* Popover Menu */}
              {isFilterOpen && (
                <div className="absolute right-0 top-full z-40 mt-2 w-80 sm:w-96 rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-slate-900 space-y-4">
                  
                  {/* Popover Header */}
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <Filter size={16} className="text-brand-red" />
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                        Filter Directory
                      </h3>
                    </div>
                    {activeFiltersCount > 0 && (
                      <button
                        type="button"
                        onClick={resetFilters}
                        className="text-[11px] font-bold text-brand-red hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw size={11} />
                        <span>Reset All</span>
                      </button>
                    )}
                  </div>

                  {/* 1. Account Status Filter */}
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
                      Account Status
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(['ALL', 'ACTIVE', 'SUSPENDED', 'BANNED'] as const).map(status => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => setStatusFilter(status)}
                          className={`rounded-xl px-2.5 py-1.5 text-xs font-bold transition-all cursor-pointer text-center ${
                            statusFilter === status
                              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-2xs'
                              : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400'
                          }`}
                        >
                          {status === 'ALL' ? 'All Status' : status.charAt(0) + status.slice(1).toLowerCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 2. Core Subject / Specialization Filter */}
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
                      Teaching Subject / Specialization
                    </label>
                    <select
                      value={subjectFilter}
                      onChange={(e) => setSubjectFilter(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-800 focus:border-brand-red focus:outline-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200 cursor-pointer"
                    >
                      <option value="ALL">All Subjects &amp; Specializations</option>
                      {allAvailableSubjects.map(sub => (
                        <option key={sub} value={sub}>{sub}</option>
                      ))}
                    </select>
                  </div>

                  {/* 3. Role Filter */}
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
                      Faculty Role
                    </label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(['ALL', 'TUTOR', 'STAFF', 'INSTRUCTOR'] as const).map(role => (
                        <button
                          key={role}
                          type="button"
                          onClick={() => setRoleFilter(role)}
                          className={`rounded-xl px-2.5 py-1.5 text-xs font-bold transition-all cursor-pointer text-center ${
                            roleFilter === role
                              ? 'bg-purple-600 text-white shadow-2xs'
                              : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400'
                          }`}
                        >
                          {role === 'ALL' ? 'All Roles' : role === 'TUTOR' ? 'Tutors / Mentors' : role === 'STAFF' ? 'Staff' : 'Instructors'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 4. Student & School Assignment Filters */}
                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                        Cadet Allocation
                      </label>
                      <select
                        value={studentAssignmentFilter}
                        onChange={(e) => setStudentAssignmentFilter(e.target.value as any)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                      >
                        <option value="ALL">All Cadets</option>
                        <option value="ASSIGNED">With Cadets</option>
                        <option value="UNASSIGNED">No Cadets</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                        School Assignment
                      </label>
                      <select
                        value={schoolAssignmentFilter}
                        onChange={(e) => setSchoolAssignmentFilter(e.target.value as any)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"
                      >
                        <option value="ALL">All Schools</option>
                        <option value="ASSIGNED">With Schools</option>
                        <option value="UNASSIGNED">No Schools</option>
                      </select>
                    </div>
                  </div>

                  {/* Popover Done Button */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setIsFilterOpen(false)}
                      className="rounded-xl bg-slate-900 px-4 py-1.5 text-xs font-bold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-900 cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Active Filter Chips (if any active) */}
          {activeFiltersCount > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[11px] font-bold text-slate-400">Active filters:</span>
              
              {statusFilter !== 'ALL' && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                  Status: {statusFilter}
                  <button type="button" onClick={() => setStatusFilter('ALL')} className="hover:text-brand-red cursor-pointer"><X size={12} /></button>
                </span>
              )}

              {subjectFilter !== 'ALL' && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-purple-50 px-2.5 py-1 text-xs font-bold text-purple-800 dark:bg-purple-950/40 dark:text-purple-300">
                  Subject: {subjectFilter}
                  <button type="button" onClick={() => setSubjectFilter('ALL')} className="hover:text-brand-red cursor-pointer"><X size={12} /></button>
                </span>
              )}

              {roleFilter !== 'ALL' && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
                  Role: {roleFilter}
                  <button type="button" onClick={() => setRoleFilter('ALL')} className="hover:text-brand-red cursor-pointer"><X size={12} /></button>
                </span>
              )}

              {studentAssignmentFilter !== 'ALL' && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                  Cadets: {studentAssignmentFilter}
                  <button type="button" onClick={() => setStudentAssignmentFilter('ALL')} className="hover:text-brand-red cursor-pointer"><X size={12} /></button>
                </span>
              )}

              {schoolAssignmentFilter !== 'ALL' && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  Schools: {schoolAssignmentFilter}
                  <button type="button" onClick={() => setSchoolAssignmentFilter('ALL')} className="hover:text-brand-red cursor-pointer"><X size={12} /></button>
                </span>
              )}

              <button
                type="button"
                onClick={resetFilters}
                className="text-xs font-bold text-brand-red hover:underline ml-1 cursor-pointer"
              >
                Clear all
              </button>
            </div>
          )}

          {/* Staff List View (Streamlined List Layout with Gear Manage Button) */}
          <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
            {loading ? (
              <div className="p-12 text-center text-xs font-mono text-slate-400">
                Loading registered faculty &amp; staff...
              </div>
            ) : filteredStaff.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-sm space-y-2">
                <p className="font-bold text-slate-600 dark:text-slate-300">No faculty members found.</p>
                <p className="text-xs">
                  {searchQuery || activeFiltersCount > 0
                    ? 'Try adjusting your search terms or filters.'
                    : 'Provision instructors in the Users & Roles module to populate this directory.'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filteredStaff.map((staff) => {
                  const isSuspended = staff.accountStatus === 'SUSPENDED';
                  const isBanned = staff.accountStatus === 'BANNED';

                  return (
                    <div 
                      key={staff.id} 
                      className="flex items-center justify-between gap-4 p-4 sm:p-5 transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                    >
                      {/* Left: Avatar & Core Summary Info */}
                      <div className="flex min-w-0 items-center gap-3.5 sm:gap-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-700 text-sm font-black text-white shadow-xs">
                          {(staff.fullName || 'F').charAt(0).toUpperCase()}
                        </div>

                        <div className="min-w-0 space-y-1">
                          {/* Name & Badges */}
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-black text-slate-900 dark:text-white">
                              {staff.fullName}
                            </p>

                            {/* Role Badge */}
                            <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-[10px] font-extrabold text-purple-700 dark:bg-purple-950/40 dark:text-purple-300">
                              <UserCheck size={11} />
                              {staff.role}
                            </span>

                            {/* Account Status Badge */}
                            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase ${
                              isBanned
                                ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300'
                                : isSuspended
                                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'
                                  : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                            }`}>
                              {isBanned ? (
                                <ShieldAlert size={11} />
                              ) : isSuspended ? (
                                <ShieldBan size={11} />
                              ) : (
                                <ShieldCheck size={11} />
                              )}
                              {staff.accountStatus}
                            </span>
                          </div>

                          {/* Teaching Subjects / Specialization Chips */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            {staff.subjects.length > 0 ? (
                              staff.subjects.slice(0, 3).map((sub, idx) => (
                                <span
                                  key={idx}
                                  className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                >
                                  <BookOpen size={9} className="text-purple-500" />
                                  {sub}
                                </span>
                              ))
                            ) : (
                              <span className="text-[10px] text-slate-400 italic">General Technology</span>
                            )}
                            {staff.subjects.length > 3 && (
                              <span className="text-[10px] font-bold text-slate-400">
                                +{staff.subjects.length - 3} more
                              </span>
                            )}
                          </div>

                          {/* Email, Phone & Assignment Counts */}
                          <p className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                            {staff.email && <span className="font-mono text-slate-700 dark:text-slate-300">{staff.email}</span>}
                            {staff.phone && <span className="hidden sm:inline">· {staff.phone}</span>}
                            
                            {/* Assigned Students Summary Badge */}
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-600 dark:text-purple-400">
                              · <GraduationCap size={12} />
                              {staff.assignedStudents.length} {staff.assignedStudents.length === 1 ? 'Cadet' : 'Cadets'}
                            </span>

                            {/* Assigned Schools Summary Badge */}
                            {staff.assignedSchools.length > 0 && (
                              <span className="hidden md:inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                                · <School size={12} />
                                {staff.assignedSchools.length} {staff.assignedSchools.length === 1 ? 'School' : 'Schools'}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="shrink-0 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            toast.info(`Directly opening instructor portal for ${staff.fullName}...`);
                            startImpersonation({
                              id: staff.id,
                              uid: staff.id,
                              name: staff.fullName,
                              email: staff.email,
                              role: staff.role || 'TUTOR',
                              phone: staff.phone
                            }, navigate);
                          }}
                          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 px-3 py-2 text-xs font-bold text-white shadow-2xs transition-all active:scale-95 cursor-pointer whitespace-nowrap"
                          title={`Directly log into ${staff.fullName}'s tutor portal`}
                        >
                          <UserCheck size={14} />
                          <span className="hidden sm:inline">Log In As</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setManagingStaff(staff)}
                          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-2xs transition-all hover:border-brand-red hover:bg-brand-red/5 hover:text-brand-red dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-brand-red dark:hover:bg-brand-red/10 cursor-pointer"
                          title={`Manage ${staff.fullName}`}
                        >
                          <Settings size={15} className="text-slate-500 hover:text-brand-red dark:text-slate-400" />
                          <span>Manage</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ MODAL: MANAGE STAFF & FACULTY OPERATIONS ══ */}
      {managingStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 md:p-8 space-y-6">
            
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-5">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-700 text-lg font-black text-white shadow-xs">
                  {(managingStaff.fullName || 'F').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-black text-slate-900 dark:text-white truncate">
                      {managingStaff.fullName}
                    </h2>
                    <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-[10px] font-extrabold text-purple-700 dark:bg-purple-950/40 dark:text-purple-300">
                      <UserCheck size={11} />
                      {managingStaff.role}
                    </span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase ${
                      managingStaff.accountStatus === 'BANNED'
                        ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300' 
                        : managingStaff.accountStatus === 'SUSPENDED'
                          ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'
                          : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
                    }`}>
                      {managingStaff.accountStatus === 'BANNED' ? (
                        <ShieldAlert size={11} />
                      ) : managingStaff.accountStatus === 'SUSPENDED' ? (
                        <ShieldBan size={11} />
                      ) : (
                        <ShieldCheck size={11} />
                      )}
                      {managingStaff.accountStatus}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500 font-mono">
                    {managingStaff.email || 'No email registered'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setManagingStaff(null)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                title="Close settings"
              >
                <X size={18} />
              </button>
            </div>

            {/* Core Teaching Subjects & Specializations */}
            <div className="rounded-2xl border border-purple-200/80 bg-purple-50/40 p-4 dark:border-purple-900/40 dark:bg-purple-950/20 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Award size={16} className="text-purple-600 dark:text-purple-400" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-purple-900 dark:text-purple-200">
                    Teaching Subjects &amp; Specializations ({managingStaff.subjects.length})
                  </h3>
                </div>
                {managingStaff.qualification && (
                  <span className="text-[11px] font-bold text-purple-700 dark:text-purple-300">
                    {managingStaff.qualification}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {managingStaff.subjects.length > 0 ? (
                  managingStaff.subjects.map((sub, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-extrabold text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-800 shadow-2xs"
                    >
                      <BookOpen size={11} className="text-purple-500" />
                      {sub}
                    </span>
                  ))
                ) : (
                  <p className="text-xs text-slate-500 italic">No specific subjects listed.</p>
                )}
              </div>

              {managingStaff.bio && (
                <p className="text-xs text-slate-600 dark:text-slate-300 italic pt-1 leading-relaxed border-t border-purple-100 dark:border-purple-900/50 mt-2">
                  "{managingStaff.bio}"
                </p>
              )}
            </div>

            {/* Profile & Faculty Details Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Email Address */}
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/50">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Email Address</span>
                  {managingStaff.email && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(managingStaff.email, 'Email')}
                      className="text-slate-400 hover:text-brand-red p-1 rounded-md cursor-pointer"
                      title="Copy email"
                    >
                      <Copy size={13} />
                    </button>
                  )}
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-900 dark:text-white truncate">
                  {managingStaff.email || <span className="text-slate-400 italic font-normal">Not provided</span>}
                </p>
              </div>

              {/* Phone */}
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/50">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Phone Contact</span>
                  {managingStaff.phone && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(managingStaff.phone, 'Phone')}
                      className="text-slate-400 hover:text-brand-red p-1 rounded-md cursor-pointer"
                      title="Copy phone"
                    >
                      <Copy size={13} />
                    </button>
                  )}
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-900 dark:text-white font-mono truncate">
                  {managingStaff.phone || <span className="text-slate-400 font-sans italic font-normal">Not provided</span>}
                </p>
              </div>

              {/* Experience / Schedule */}
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/50">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Experience &amp; Availability</span>
                <p className="mt-1 text-xs font-semibold text-slate-900 dark:text-white truncate">
                  {managingStaff.experienceYears ? `${managingStaff.experienceYears} Experience` : 'Experienced Instructor'}
                  {managingStaff.daysPerWeek ? ` · ${managingStaff.daysPerWeek}` : ''}
                </p>
              </div>

              {/* Onboarding Date */}
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-950/50">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Onboarding Date</span>
                <p className="mt-1 text-xs font-semibold text-slate-900 dark:text-white truncate font-mono">
                  {managingStaff.createdAt?.toDate ? managingStaff.createdAt.toDate().toLocaleDateString() : 'Active Faculty'}
                </p>
              </div>
            </div>

            {/* Assigned Schools Section */}
            <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/30 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <School size={16} className="text-emerald-600 dark:text-emerald-400" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-emerald-900 dark:text-emerald-200">
                    Assigned Schools ({managingStaff.assignedSchools.length})
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setManagingStaff(null);
                    setActiveTab('schoolAccess');
                  }}
                  className="text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <span>Manage School Access</span>
                  <ArrowRight size={13} />
                </button>
              </div>

              {managingStaff.assignedSchools.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {managingStaff.assignedSchools.map((sch, idx) => (
                    <div key={idx} className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-100 dark:border-emerald-900/50 shadow-2xs">
                      <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center justify-center font-bold text-xs shrink-0">
                        <School size={14} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {sch.name}
                        </p>
                        {sch.schoolCode && (
                          <p className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 truncate">
                            Code: {sch.schoolCode}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                  No schools currently assigned to this faculty member. Use the "Staff School Access Code" tab to assign schools.
                </p>
              )}
            </div>

            {/* Assigned Students Section */}
            <div className="rounded-2xl border border-purple-200/70 bg-purple-50/30 p-4 dark:border-purple-900/40 dark:bg-purple-950/20 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <GraduationCap size={16} className="text-purple-600 dark:text-purple-400" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-purple-900 dark:text-purple-200">
                    Assigned Students ({managingStaff.assignedStudents.length})
                  </h3>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                    School: {managingStaff.assignedStudents.filter(s => s.studentType === 'school').length}
                  </span>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
                    Private: {managingStaff.assignedStudents.filter(s => s.studentType !== 'school').length}
                  </span>
                </div>
                <a
                  href="/admin/students"
                  className="text-xs font-bold text-purple-700 dark:text-purple-300 hover:underline inline-flex items-center gap-1"
                >
                  <span>Assign in Students</span>
                  <ArrowRight size={13} />
                </a>
              </div>

              {managingStaff.assignedStudents.length > 0 ? (
                <div className="max-h-64 overflow-y-auto divide-y divide-purple-100 dark:divide-purple-900/40 rounded-xl border border-purple-100 dark:border-purple-900/50 bg-white dark:bg-slate-900">
                  {managingStaff.assignedStudents.map((stu, idx) => {
                    const isSchool = stu.studentType === 'school';
                    return (
                      <div key={idx} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`h-8 w-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                            isSchool
                              ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                              : 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300'
                          }`}>
                            {stu.fullName.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {stu.fullName}
                            </p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                              {stu.class || 'Cadet'} {stu.track ? `• ${stu.track}` : ''} {stu.schoolName ? `• ${stu.schoolName}` : ''} {stu.parentName ? `• Parent: ${stu.parentName}` : ''}
                            </p>
                          </div>
                        </div>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase shrink-0 ${
                          isSchool
                            ? 'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800'
                            : 'bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800'
                        }`}>
                          {isSchool ? 'School-Assigned' : 'Private Learner'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                  No students currently assigned to this mentor. You can assign students to faculty in the Students directory.
                </p>
              )}
            </div>

            {/* Account Status & Operations Grid */}
            <div className="space-y-2.5">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Account Access &amp; Operations</span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                
                {/* Reactivate / Activate */}
                <button
                  type="button"
                  disabled={actionLoading || managingStaff.accountStatus === 'ACTIVE'}
                  onClick={() => handleUpdateStatus(managingStaff, 'ACTIVE')}
                  className={`flex flex-col p-3 rounded-2xl border text-left transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    managingStaff.accountStatus === 'ACTIVE'
                      ? 'border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/30'
                      : 'border-slate-200 bg-white hover:border-emerald-500 hover:bg-emerald-50/30 dark:border-slate-800 dark:bg-slate-950/70'
                  }`}
                >
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                    <ShieldCheck size={16} />
                    <span className="text-xs font-bold">Active Access</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1 leading-tight">
                    {managingStaff.accountStatus === 'ACTIVE' ? 'Currently Active' : 'Grant full portal access'}
                  </p>
                </button>

                {/* Suspend */}
                <button
                  type="button"
                  disabled={actionLoading || managingStaff.accountStatus === 'SUSPENDED'}
                  onClick={() => handleUpdateStatus(managingStaff, 'SUSPENDED')}
                  className={`flex flex-col p-3 rounded-2xl border text-left transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    managingStaff.accountStatus === 'SUSPENDED'
                      ? 'border-amber-300 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/30'
                      : 'border-slate-200 bg-white hover:border-amber-500 hover:bg-amber-50/30 dark:border-slate-800 dark:bg-slate-950/70'
                  }`}
                >
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                    <ShieldBan size={16} />
                    <span className="text-xs font-bold">Suspend</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1 leading-tight">
                    {managingStaff.accountStatus === 'SUSPENDED' ? 'Currently Suspended' : 'Temporarily pause login'}
                  </p>
                </button>

                {/* Ban */}
                <button
                  type="button"
                  disabled={actionLoading || managingStaff.accountStatus === 'BANNED'}
                  onClick={() => handleUpdateStatus(managingStaff, 'BANNED')}
                  className={`flex flex-col p-3 rounded-2xl border text-left transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    managingStaff.accountStatus === 'BANNED'
                      ? 'border-red-300 bg-red-50/50 dark:border-red-800 dark:bg-red-950/30'
                      : 'border-slate-200 bg-white hover:border-red-500 hover:bg-red-50/30 dark:border-slate-800 dark:bg-slate-950/70'
                  }`}
                >
                  <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                    <ShieldAlert size={16} />
                    <span className="text-xs font-bold">Ban</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1 leading-tight">
                    {managingStaff.accountStatus === 'BANNED' ? 'Currently Banned' : 'Revoke all staff rights'}
                  </p>
                </button>
              </div>

              {/* Danger Action: Permanent Deletion */}
              <div className="pt-2">
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={() => setDeleteConfirmStaff(managingStaff)}
                  className="w-full flex items-center justify-between p-3.5 rounded-2xl border border-red-200/80 bg-red-50/50 hover:bg-red-100/70 text-red-700 dark:border-red-900/40 dark:bg-red-950/20 dark:hover:bg-red-950/40 transition-all cursor-pointer disabled:opacity-50"
                >
                  <div className="flex items-center gap-2.5">
                    <Trash2 size={16} />
                    <div className="text-left">
                      <p className="text-xs font-bold">Delete Staff Record Permanently</p>
                      <p className="text-[10px] text-red-600/80 dark:text-red-400">Completely erase profile, school bindings &amp; credentials</p>
                    </div>
                  </div>
                  <span className="text-[11px] font-black uppercase tracking-wider text-red-700 dark:text-red-400">Delete</span>
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setManagingStaff(null)}
                className="min-h-10 px-5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
              >
                Close Settings
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ══ MODAL: CONFIRM PERMANENT DELETION ══ */}
      {deleteConfirmStaff && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-red-200 bg-white p-6 shadow-2xl dark:border-red-900/60 dark:bg-slate-900 space-y-4">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-100 dark:bg-red-950/60">
                <AlertTriangle size={22} />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">Permanently Delete Staff?</h3>
                <p className="text-xs text-red-600 dark:text-red-400">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Are you sure you want to permanently erase the staff record for <strong className="text-slate-900 dark:text-white">{deleteConfirmStaff.fullName}</strong> ({deleteConfirmStaff.email})?
              All portal access rights, school bindings, and mentorship records will be removed immediately.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => setDeleteConfirmStaff(null)}
                className="min-h-10 px-4 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={() => handlePermanentDelete(deleteConfirmStaff)}
                className="min-h-10 px-4 rounded-xl bg-red-600 text-xs font-black text-white hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? 'Deleting...' : 'Yes, Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ TAB 2: STAFF RESOURCES ══ */}
      {activeTab === 'resources' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Post Form */}
          <div className="lg:col-span-1 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-sm">
            <h2 className="text-lg font-black text-gray-900 dark:text-white flex items-center gap-2 mb-2">
              <Plus size={18} className="text-brand-red" />
              Add Staff Guide &amp; Curriculum
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-5 leading-relaxed">
              Upload teaching lesson plans, grading rubrics, and faculty training documents visible across all staff terminals.
            </p>

            <form onSubmit={handlePostStaffResource} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1.5">
                  Resource Title *
                </label>
                <input
                  type="text"
                  required
                  value={resForm.title}
                  onChange={(e) => setResForm({ ...resForm, title: e.target.value })}
                  placeholder="e.g. 2026 Coding Curriculum Master Guide"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-red"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1.5">
                  File URL / Google Drive Link *
                </label>
                <input
                  type="url"
                  required
                  value={resForm.url}
                  onChange={(e) => setResForm({ ...resForm, url: e.target.value })}
                  placeholder="https://drive.google.com/..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-red"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1.5">
                  Description &amp; Guidelines
                </label>
                <textarea
                  rows={3}
                  value={resForm.description}
                  onChange={(e) => setResForm({ ...resForm, description: e.target.value })}
                  placeholder="Faculty guidelines, grading criteria, and instructions..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-red"
                ></textarea>
              </div>

              <button
                type="submit"
                disabled={postingResource}
                className="w-full py-3 bg-brand-red hover:bg-red-700 text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {postingResource ? 'Publishing...' : 'Publish to Faculty Hub'}
              </button>
            </form>
          </div>

          {/* List */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-lg font-black text-gray-900 dark:text-white">
              Faculty Resources ({staffResources.length})
            </h2>

            {loading ? (
              <div className="py-12 text-center text-gray-400 font-mono text-xs">Loading guides...</div>
            ) : staffResources.length === 0 ? (
              <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 text-gray-400 text-sm">
                No staff resources posted yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {staffResources.map((item) => (
                  <div 
                    key={item.id} 
                    className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 shadow-xs flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                          FACULTY GUIDE
                        </span>
                        <button
                          onClick={() => handleDeleteStaffResource(item.id, item.title)}
                          className="text-gray-400 hover:text-red-500 transition-colors p-1 cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>

                      <h3 className="font-black text-gray-900 dark:text-white text-base leading-snug mb-1">
                        {item.title}
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-3 mb-4 leading-relaxed">
                        {item.description || 'No description provided.'}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between">
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-red hover:underline"
                      >
                        <ExternalLink size={14} /> Open Guide
                      </a>
                      <span className="text-[11px] text-gray-400 font-mono">
                        {item.timestamp?.toDate ? item.timestamp.toDate().toLocaleDateString() : 'Active'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ TAB 3: STAFF SCHOOL ACCESS ══ */}
      {activeTab === 'schoolAccess' && (
        <StaffSchoolAssignments />
      )}
    </div>
  );
};

export default AdminStaff;
