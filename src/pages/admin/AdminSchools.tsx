import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  collection, getDocs, getDoc, addDoc, deleteDoc, doc, 
  setDoc, query, serverTimestamp, updateDoc, where, limit
} from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth';
import { db, auth } from '../../lib/firebase';
import { useToast } from '../../contexts/ToastContext';
import { startImpersonation } from '../../utils/impersonation';
import { 
  School, BookOpen, Plus, Trash2, ExternalLink, 
  FileText, RefreshCw, Loader2, 
  Key, Copy, 
  X, Search,
  KeyRound, ArrowLeft,
  CreditCard, Bell, ShieldCheck, Check,
  Users, Code, ChevronRight, Edit3, Send, UserCheck, AlertTriangle,
  Calendar, CheckCircle2, History as HistoryIcon
} from 'lucide-react';
import { formatNaira, billingPost } from '../../lib/billing';
import { CANONICAL_CLASSES, formatNormalizedClassDisplay, normalizeClassName } from '../../lib/classes';

export interface AssignedTutorAllocation {
  tutorId: string;
  tutorName: string;
  tutorEmail?: string;
  payoutRate: number; // in NGN
  payoutType: 'per_student' | 'per_term' | 'per_month' | 'fixed_stipend';
  role?: 'lead' | 'co_tutor' | 'assistant' | 'technical_facilitator';
  notes?: string;
}

export interface SchoolProgram {
  id: string;
  name: string;
  description: string;
  level?: string;
  schedule?: string;
  status: 'ACTIVE' | 'UPCOMING' | 'COMPLETED' | 'PAUSED' | 'HISTORICAL';
  startDate?: string;
  endDate?: string;
  durationMode?: 'fixed_dates' | 'admin_controlled';
  completedAt?: string;
  isHistorical?: boolean;
  notes?: string;
  assignedTutors?: AssignedTutorAllocation[];
  
  // Independent Multi-Model Program Billing Configuration
  billingModel?: 'package' | 'per_head'; // package = fixed fee, per_head = amountPerHead * student count
  baseFee?: number; // package fixed fee (e.g. 180,000 NGN)
  amountPerHead?: number; // per student rate (e.g. 3,500 NGN)
  classRange?: string; // target class range (e.g. "Primary 1 - Primary 6" or "All Cadets")
  studentAdjustment?: number; // student count offset / subtraction (e.g. -2 for withdrawn students)
  billingFrequency?: 'termly' | 'monthly' | 'per_session' | 'annual';
  defaultPaymentMode?: 'advance_termly' | 'advance_monthly' | 'post_termly' | 'post_monthly' | 'bank_transfer' | 'paystack_card';
  nextBillingDueDate?: string;
  billingTermsAndNotes?: string;

  costPerStudent?: number;
  hasEdclub?: boolean;
  hasResources?: boolean;
  hasAssessments?: boolean;
  hasLiveClasses?: boolean;
  isGeneralProgram?: boolean;
  sessionsPerWeek?: number;
  sessionDuration?: string;
  seriesName?: string;
  nextProgramTitle?: string;
  stageNumber?: number;
  historicalMilestones?: Array<{
    id: string;
    title: string;
    date: string;
    description?: string;
  }>;
}

export interface SchoolBillingConfig {
  baseAmount: number;
  cycle: 'monthly' | 'termly'; // monthly = 4 weeks, termly = 12 weeks
  allowedModes: ('advance_monthly' | 'advance_termly' | 'post_monthly' | 'post_termly')[];
  mode: 'advance_monthly' | 'advance_termly' | 'post_monthly' | 'post_termly';
  nextDueDate?: string;
  status?: 'ACTIVE' | 'PAID' | 'DUE' | 'OVERDUE';
  notes?: string;
  lastReminderSentAt?: string;
}

export interface SchoolData {
  id: string;
  name: string;
  schoolCode?: string;
  contactName?: string;
  contactEmail?: string;
  email?: string;
  phone?: string;
  address?: string;
  state?: string;
  notes?: string;
  status?: string;
  accountStatus?: string;
  icon?: string;
  studentCount?: number;
  programs?: SchoolProgram[];
  assignedTutors?: AssignedTutorAllocation[];
  billing?: SchoolBillingConfig;
  createdAt?: any;
  updatedAt?: any;
  createdBy?: string;
  createdByEmail?: string;
  adminUid?: string;
}

interface ExamPasscode {
  id: string;
  schoolId: string;
  schoolName?: string;
  examTitle: string;
  subject?: string;
  classLevel?: string;
  passcode: string;
  isActive: boolean;
  validUntil?: string;
  invigilatorName?: string;
  allocatedCadetsCount?: number;
  createdAt?: any;
}

interface SchoolResource {
  id: string;
  schoolId: string;
  title: string;
  url: string;
  category?: string;
  description?: string;
  createdAt?: any;
}

interface CadetRecord {
  id: string;
  fullName?: string;
  studentName?: string;
  username?: string;
  email?: string;
  class?: string;
  grade?: string;
  status?: string;
  schoolId?: string;
}

const DEFAULT_PROGRAMS: SchoolProgram[] = [];

const DEFAULT_SCHOOLS: SchoolData[] = [];

const inputClass = 'w-full px-3.5 py-2.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 text-slate-900 dark:text-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-brand-red transition-all';
const labelClass = 'block text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5';

const AdminSchools: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // State
  const [schools, setSchools] = useState<SchoolData[]>(DEFAULT_SCHOOLS);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedSchoolId, setSelectedSchoolId] = useState<string | null>(null);
  const [activeSchoolTab, setActiveSchoolTab] = useState<'profile' | 'programs' | 'tutors' | 'billing' | 'passcodes' | 'resources' | 'cadets' | 'raw'>('profile');

  // Sub-stores for selected school
  const [passcodes, setPasscodes] = useState<ExamPasscode[]>([]);
  const [resources, setResources] = useState<SchoolResource[]>([]);
  const [cadets, setCadets] = useState<CadetRecord[]>([]);
  const [payments, setPayments] = useState<any[]>([]);

  // Modals & Forms
  const [showOnboardModal, setShowOnboardModal] = useState(false);
  const [onboardingSaving, setOnboardingSaving] = useState(false);
  const [onboardForm, setOnboardForm] = useState({
    name: '',
    schoolCode: '',
    contactName: '',
    contactEmail: '',
    phone: '',
    state: 'Lagos',
    address: '',
    initialFee: '',
    cycle: 'termly' as 'monthly' | 'termly',
    mode: 'advance_termly' as any,
    initialProgramName: '',
    initialProgramDesc: ''
  });

  // Selected school edit forms
  const [profileForm, setProfileForm] = useState<Partial<SchoolData>>({});
  const [billingForm, setBillingForm] = useState<SchoolBillingConfig>({
    baseAmount: 0,
    cycle: 'termly',
    allowedModes: ['advance_termly', 'advance_monthly', 'post_monthly', 'post_termly'],
    mode: 'advance_termly',
    nextDueDate: '',
    status: 'ACTIVE',
    notes: ''
  });
  const [programsList, setProgramsList] = useState<SchoolProgram[]>([]);
  const [editingProgram, setEditingProgram] = useState<SchoolProgram | null>(null);
  const [isNewProgram, setIsNewProgram] = useState(false);
  const [staffList, setStaffList] = useState<{ id: string; name: string; email: string; role?: string }[]>([]);
  const [catalogPrograms, setCatalogPrograms] = useState<{ id: string; name: string; description: string; level?: string }[]>([]);

  // New Passcode Form
  const [passcodeForm, setPasscodeForm] = useState({
    examTitle: '',
    subject: '',
    classLevel: '',
    passcode: '',
    invigilatorName: '',
    validUntil: ''
  });
  const [showPasscodeModal, setShowPasscodeModal] = useState(false);

  // New Resource Form
  const [resourceForm, setResourceForm] = useState({
    title: '',
    url: '',
    category: 'Curriculum & workspace Manual',
    description: ''
  });
  const [showResourceModal, setShowResourceModal] = useState(false);

  const [savingAction, setSavingAction] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showDeleteSchoolModal, setShowDeleteSchoolModal] = useState(false);
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState('');
  const [deletingSchool, setDeletingSchool] = useState(false);

  // Load all schools and faculty/catalog
  const loadSchools = useCallback(async () => {
    setLoading(true);
    try {
      const [snap, usersSnap, progsSnap] = await Promise.all([
        getDocs(collection(db, 'schools')),
        getDocs(collection(db, 'users')).catch(() => null),
        getDocs(collection(db, 'programs')).catch(() => null)
      ]);

      if (usersSnap && !usersSnap.empty) {
        const staffUsers: { id: string; name: string; email: string; role?: string }[] = [];
        usersSnap.docs.forEach(d => {
          const u = d.data();
          const r = String(u.role || '').toLowerCase();
          if (['tutor', 'staff', 'instructor', 'faculty'].includes(r)) {
            staffUsers.push({
              id: d.id,
              name: u.name || u.displayName || u.fullName || u.email || 'Faculty Instructor',
              email: u.email || '',
              role: r
            });
          }
        });
        if (staffUsers.length > 0) setStaffList(staffUsers);
      }

      if (progsSnap && !progsSnap.empty) {
        const catProgs = progsSnap.docs.map(d => {
          const p = d.data();
          return {
            id: d.id,
            name: p.title || p.name || 'Technology Programme',
            description: p.shortDescription || p.description || '',
            level: p.targetAudience || p.level || p.grade || 'All Grades'
          };
        });
        setCatalogPrograms(catProgs);
      } else {
        setCatalogPrograms([]);
      }

      if (!snap.empty) {
        const firestoreSchools = snap.docs.map(d => ({
          id: d.id,
          programs: [],
          ...(d.data() as Omit<SchoolData, 'id'>)
        }));
        setSchools(firestoreSchools);
      } else {
        setSchools([]);
      }
    } catch (err) {
      console.warn('Unable to load schools from firestore:', err);
      setSchools([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSchools();
  }, [loadSchools]);

  // Selected school object
  const selectedSchool = useMemo(() => {
    if (!selectedSchoolId) return null;
    return schools.find(s => s.id === selectedSchoolId) || null;
  }, [selectedSchoolId, schools]);

  // Load school specific data when a school is opened
  useEffect(() => {
    if (!selectedSchool) return;

    // Populate local edit forms
    setProfileForm({
      name: selectedSchool.name || '',
      schoolCode: selectedSchool.schoolCode || '',
      contactName: selectedSchool.contactName || '',
      contactEmail: selectedSchool.contactEmail || selectedSchool.email || '',
      phone: selectedSchool.phone || '',
      state: selectedSchool.state || 'Lagos',
      address: selectedSchool.address || '',
      status: selectedSchool.status || 'ACTIVE',
      notes: selectedSchool.notes || ''
    });

    setBillingForm({
      baseAmount: selectedSchool.billing?.baseAmount ?? 0,
      cycle: selectedSchool.billing?.cycle || 'termly',
      allowedModes: selectedSchool.billing?.allowedModes || ['advance_termly', 'advance_monthly', 'post_monthly', 'post_termly'],
      mode: selectedSchool.billing?.mode || 'advance_termly',
      nextDueDate: selectedSchool.billing?.nextDueDate || '',
      status: selectedSchool.billing?.status || 'ACTIVE',
      notes: selectedSchool.billing?.notes || '',
      lastReminderSentAt: selectedSchool.billing?.lastReminderSentAt || ''
    });

    setProgramsList(Array.isArray(selectedSchool.programs) ? selectedSchool.programs : []);

    // Fetch related records: passcodes, resources, cadets, payments
    const fetchSchoolDetails = async () => {
      try {
        const [passSnap, resSnap, studSnap, indivSnap, paySnap] = await Promise.all([
          getDocs(query(collection(db, 'schoolPasscodes'), where('schoolId', '==', selectedSchool.id))),
          getDocs(query(collection(db, 'schoolLinks'), where('schoolId', '==', selectedSchool.id))),
          getDocs(query(collection(db, 'students'), where('schoolId', '==', selectedSchool.id))),
          getDocs(query(collection(db, 'individualStudents'), where('schoolId', '==', selectedSchool.id))),
          getDocs(query(collection(db, 'payments'), where('schoolId', '==', selectedSchool.id)))
        ]);

        setPasscodes(passSnap.docs.map(d => ({ id: d.id, ...d.data() } as ExamPasscode)));
        setResources(resSnap.docs.map(d => ({ id: d.id, ...d.data() } as SchoolResource)));
        
        const cadetMap = new Map<string, CadetRecord>();
        studSnap.docs.forEach(d => cadetMap.set(d.id, { id: d.id, ...d.data() } as CadetRecord));
        indivSnap.docs.forEach(d => {
          if (!cadetMap.has(d.id)) {
            cadetMap.set(d.id, { id: d.id, ...d.data() } as CadetRecord);
          }
        });
        setCadets(Array.from(cadetMap.values()));
        setPayments(paySnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.warn('Error fetching school sub-records:', err);
      }
    };

    void fetchSchoolDetails();
  }, [selectedSchool]);

  // Copy helper
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filtered Schools list
  const filteredSchools = useMemo(() => {
    return schools.filter(s => {
      const q = search.toLowerCase();
      return (
        s.name?.toLowerCase().includes(q) ||
        s.schoolCode?.toLowerCase().includes(q) ||
        s.contactEmail?.toLowerCase().includes(q) ||
        s.contactName?.toLowerCase().includes(q) ||
        s.state?.toLowerCase().includes(q)
      );
    });
  }, [schools, search]);

  // Save Profile Changes
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSchool) return;
    setSavingAction(true);
    try {
      if (!profileForm.name?.trim() || !profileForm.contactEmail?.trim()) {
        toast.error('School name and administrator email are required.');
        return;
      }

      // Direct Firestore update on school document
      await setDoc(doc(db, 'schools', selectedSchool.id), {
        ...profileForm,
        name: profileForm.name.trim(),
        contactEmail: profileForm.contactEmail.trim().toLowerCase(),
        updatedAt: serverTimestamp()
      }, { merge: true });

      // Sync to local state
      setSchools(prev => prev.map(s => s.id === selectedSchool.id ? { ...s, ...profileForm } : s));
      toast.success('School profile updated successfully.');
    } catch (err) {
      console.error('Save profile failed:', err);
      toast.error(err instanceof Error ? err.message : 'Unable to save school profile.');
    } finally {
      setSavingAction(false);
    }
  };

  // Delete a school and its linked portal data through the super-admin backend.
  const handleDeleteSchool = async () => {
    if (!selectedSchool) return;
    if (deleteConfirmationInput.trim() !== selectedSchool.name.trim()) {
      toast.error('Type the exact school name to confirm deletion.');
      return;
    }

    setDeletingSchool(true);
    try {
      // Cascade the school's Firestore portal records before deleting the school document.
      // Firebase Auth accounts are intentionally not deleted from the client; their portal profile is removed.
      const linkedCollections = ['students', 'individualStudents', 'users', 'schoolPasscodes', 'schoolLinks', 'schoolExams', 'schoolResources', 'schoolOnboarding', 'classSchedules', 'payments', 'schoolPrograms'];
      for (const collectionName of linkedCollections) {
        const snap = await getDocs(query(collection(db, collectionName), where('schoolId', '==', selectedSchool.id))).catch(() => ({ docs: [] } as any));
        for (const item of snap.docs) await deleteDoc(doc(db, collectionName, item.id));
      }
      await deleteDoc(doc(db, 'schools', selectedSchool.id));

      const deletedName = selectedSchool.name;
      setSchools(prev => prev.filter(s => s.id !== selectedSchool.id));
      setSelectedSchoolId(null);
      setShowDeleteSchoolModal(false);
      setDeleteConfirmationInput('');
      toast.success(`${deletedName} and its linked school portal records were deleted.`);
    } catch (err) {
      console.error('Delete school failed:', err);
      toast.error(err instanceof Error ? err.message : 'Unable to delete school.');
    } finally {
      setDeletingSchool(false);
    }
  };

  // Save Billing Changes
  const handleSaveBilling = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSchool) return;
    setSavingAction(true);
    try {
      const cleanBaseAmount = Number(String(billingForm.baseAmount || 0).replace(/[^0-9.]/g, '')) || 0;
      const updatedBilling = {
        ...billingForm,
        baseAmount: cleanBaseAmount
      };

      // 1. Direct Firestore update on school document
      await setDoc(doc(db, 'schools', selectedSchool.id), {
        billing: updatedBilling,
        updatedAt: serverTimestamp()
      }, { merge: true });

      // 2. Sync to linked school administrator user record in Firestore
      try {
        const uidsToSync = new Set<string>();
        if (selectedSchool.adminUid) uidsToSync.add(selectedSchool.adminUid);
        if ((selectedSchool as any).firebaseUid) uidsToSync.add((selectedSchool as any).firebaseUid);

        const usersSnap = await getDocs(query(collection(db, 'users'), where('schoolId', '==', selectedSchool.id))).catch(() => ({ docs: [] } as any));
        usersSnap.docs.forEach((uDoc: any) => uidsToSync.add(uDoc.id));

        const schoolEmail = selectedSchool.contactEmail || selectedSchool.email;
        if (schoolEmail) {
          const emailSnap = await getDocs(query(collection(db, 'users'), where('email', '==', schoolEmail))).catch(() => ({ docs: [] } as any));
          emailSnap.docs.forEach((uDoc: any) => uidsToSync.add(uDoc.id));
        }

        for (const uid of uidsToSync) {
          await setDoc(doc(db, 'users', uid), {
            schoolId: selectedSchool.id,
            billing: updatedBilling,
            updatedAt: serverTimestamp()
          }, { merge: true }).catch(() => undefined);
        }
      } catch (uErr) {
        console.warn('School user billing sync notice:', uErr);
      }

      // 3. Billing post helper for backend / notifications
      try {
        await billingPost('billing-admin', {
          action: 'set_school_billing',
          schoolId: selectedSchool.id,
          baseAmount: cleanBaseAmount,
          cycle: billingForm.cycle,
          allowedModes: billingForm.allowedModes,
          mode: billingForm.mode,
          nextDueDate: billingForm.nextDueDate || '',
          status: billingForm.status,
          notes: billingForm.notes || ''
        });
      } catch (postErr) {
        console.debug('Background billing post notice:', postErr);
      }

      setBillingForm(updatedBilling);
      setSchools(prev => prev.map(s => s.id === selectedSchool.id ? { ...s, billing: updatedBilling } : s));
      toast.success(`Institutional billing configuration saved for ${selectedSchool.name}.`);
    } catch (err) {
      console.error('Save billing failed:', err);
      toast.error(err instanceof Error ? err.message : 'Unable to update billing configuration.');
    } finally {
      setSavingAction(false);
    }
  };

  // Send Payment Reminder
  const handleSendReminder = async () => {
    if (!selectedSchool) return;
    setSendingReminder(true);
    try {
      const nowIso = new Date().toISOString();
      await billingPost('billing-admin', {
        action: 'send_payment_reminder',
        targetType: 'SCHOOL',
        targetId: selectedSchool.id,
        recipientId: selectedSchool.adminUid || selectedSchool.id,
        email: selectedSchool.contactEmail || selectedSchool.email,
        amount: billingForm.baseAmount,
        nextDueDate: billingForm.nextDueDate,
        title: `Tuition & workspace Subscription Due - ${selectedSchool.name}`
      });

      setBillingForm(prev => ({ ...prev, lastReminderSentAt: nowIso }));
      setSchools(prev => prev.map(s => s.id === selectedSchool.id ? {
        ...s,
        billing: { ...(s.billing || billingForm), lastReminderSentAt: nowIso }
      } : s));

      toast.success(`Payment reminder issued to ${selectedSchool.name}.`);
    } catch (err) {
      console.error('Send reminder failed:', err);
      toast.error(err instanceof Error ? err.message : 'Unable to dispatch payment reminder.');
    } finally {
      setSendingReminder(false);
    }
  };

  // Declare Programme Completed (Moves from active to historical record)
  const handleDeclareCompleted = (prog: SchoolProgram) => {
    const defaultDate = new Date().toISOString().slice(0, 10);
    const dateInput = window.prompt(`Declare "${prog.name}" as completed.\n\nEnter completion date (YYYY-MM-DD):`, defaultDate);
    if (!dateInput) return;
    const updated = programsList.map(p => p.id === prog.id ? {
      ...p,
      status: 'COMPLETED' as const,
      completedAt: dateInput
    } : p);
    void handleSavePrograms(updated);
    toast.success(`Programme "${prog.name}" declared completed and moved to historical records.`);
  };

  // Open Historical Record Form
  const handleOpenHistoricalRecord = () => {
    setEditingProgram({
      id: `hist-${Date.now()}`,
      name: '',
      description: '',
      level: 'All Classes',
      schedule: 'Completed Cohort',
      status: 'COMPLETED',
      isHistorical: true,
      startDate: '',
      endDate: '',
      completedAt: '2026-06-30',
      durationMode: 'fixed_dates',
      baseFee: 0,
      assignedTutors: [],
      historicalMilestones: []
    });
    setIsNewProgram(true);
  };

  // Save Programs List
  const handleSavePrograms = async (updatedPrograms: SchoolProgram[]) => {
    if (!selectedSchool) return;
    setSavingAction(true);
    try {
      await setDoc(doc(db, 'schools', selectedSchool.id), {
        programs: updatedPrograms,
        updatedAt: serverTimestamp()
      }, { merge: true });

      try {
        await billingPost('billing-admin', {
          action: 'update_school_programs',
          schoolId: selectedSchool.id,
          programs: updatedPrograms
        });
      } catch (postErr) {
        console.debug('Background programs sync notice:', postErr);
      }

      setProgramsList(updatedPrograms);
      setSchools(prev => prev.map(s => s.id === selectedSchool.id ? { ...s, programs: updatedPrograms } : s));
      toast.success('Programmes list updated.');
      setEditingProgram(null);
      setIsNewProgram(false);
    } catch (err) {
      console.error('Save programs failed:', err);
      toast.error('Unable to update programmes.');
    } finally {
      setSavingAction(false);
    }
  };

  // Add / Edit Program Submit
  const handleProgramSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProgram || !editingProgram.name.trim()) {
      toast.error('Programme name is required.');
      return;
    }

    let updated: SchoolProgram[];
    if (isNewProgram) {
      const newEntry: SchoolProgram = {
        ...editingProgram,
        id: editingProgram.id || `prog-${Date.now()}`
      };
      updated = [...programsList, newEntry];
    } else {
      updated = programsList.map(p => p.id === editingProgram.id ? editingProgram : p);
    }

    void handleSavePrograms(updated);
  };

  // Delete Program
  const handleDeleteProgram = (progId: string) => {
    if (!window.confirm('Are you sure you want to delete this programme? It will be removed from this school.')) {
      return;
    }
    const updated = programsList.filter(p => p.id !== progId);
    void handleSavePrograms(updated);
  };

  // Create Passcode
  const handleCreatePasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSchool) return;
    if (!passcodeForm.examTitle.trim() || !passcodeForm.passcode.trim()) {
      toast.error('Exam title and passcode are required.');
      return;
    }
    setSavingAction(true);
    try {
      const passcodeData = {
        schoolId: selectedSchool.id,
        schoolName: selectedSchool.name,
        examTitle: passcodeForm.examTitle.trim(),
        subject: passcodeForm.subject.trim(),
        classLevel: passcodeForm.classLevel.trim(),
        passcode: passcodeForm.passcode.trim().toUpperCase(),
        invigilatorName: passcodeForm.invigilatorName.trim(),
        validUntil: passcodeForm.validUntil || '',
        isActive: true,
        createdAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'schoolPasscodes'), passcodeData);
      setPasscodes(prev => [{ id: docRef.id, ...passcodeData }, ...prev]);
      setShowPasscodeModal(false);
      setPasscodeForm({ examTitle: '', subject: '', classLevel: '', passcode: '', invigilatorName: '', validUntil: '' });
      toast.success('Exam passcode generated.');
    } catch (err) {
      console.error('Create passcode failed:', err);
      toast.error('Unable to generate passcode.');
    } finally {
      setSavingAction(false);
    }
  };

  // Delete Passcode
  const handleDeletePasscode = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'schoolPasscodes', id));
      setPasscodes(prev => prev.filter(p => p.id !== id));
      toast.success('Passcode removed.');
    } catch {
      toast.error('Unable to remove passcode.');
    }
  };

  // Toggle Passcode Status
  const handleTogglePasscode = async (id: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, 'schoolPasscodes', id), { isActive: !currentStatus });
      setPasscodes(prev => prev.map(p => p.id === id ? { ...p, isActive: !currentStatus } : p));
      toast.success(`Passcode ${!currentStatus ? 'activated' : 'deactivated'}.`);
    } catch {
      toast.error('Unable to update passcode status.');
    }
  };

  // Create Resource Link
  const handleCreateResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSchool) return;
    if (!resourceForm.title.trim() || !resourceForm.url.trim()) {
      toast.error('Resource title and URL are required.');
      return;
    }
    setSavingAction(true);
    try {
      const resData = {
        schoolId: selectedSchool.id,
        title: resourceForm.title.trim(),
        url: resourceForm.url.trim(),
        category: resourceForm.category.trim(),
        description: resourceForm.description.trim(),
        createdAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'schoolLinks'), resData);
      setResources(prev => [{ id: docRef.id, ...resData }, ...prev]);
      setShowResourceModal(false);
      setResourceForm({ title: '', url: '', category: 'Curriculum & workspace Manual', description: '' });
      toast.success('Resource link published for school.');
    } catch (err) {
      console.error('Create resource failed:', err);
      toast.error('Unable to add resource.');
    } finally {
      setSavingAction(false);
    }
  };

  // Delete Resource
  const handleDeleteResource = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'schoolLinks', id));
      setResources(prev => prev.filter(r => r.id !== id));
      toast.success('Resource removed.');
    } catch {
      toast.error('Unable to delete resource.');
    }
  };

  // Send Password Reset Link
  const handleSendPasswordReset = async (email: string) => {
    if (!email) {
      toast.error('No contact email configured for this school.');
      return;
    }
    const cleanEmail = email.trim().toLowerCase();
    try {
      // 1. Try sending branded email via Resend
      const res = await fetch('/.netlify/functions/auth-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail })
      });
      if (res.ok) {
        toast.success(`Password reset link dispatched to ${cleanEmail} via Resend.`);
        return;
      }
    } catch {
      // Fallback
    }

    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      toast.success(`Password reset email sent to ${cleanEmail}`);
    } catch (err: any) {
      console.error('Password reset failed:', err);
      toast.error(err?.message || 'Unable to send password reset email.');
    }
  };

  // Onboard New School
  const handleOnboardSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = onboardForm.name.trim();
    const contactEmail = onboardForm.contactEmail.trim().toLowerCase();
    if (!name || !contactEmail) {
      toast.error('School name and administrator email are required.');
      return;
    }

    setOnboardingSaving(true);
    try {
      const requestedCode = onboardForm.schoolCode.trim().toUpperCase();
      const baseId = (requestedCode || name).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 15);
      const initialId = baseId || `school-${Date.now()}`;

      // Check if doc already exists in Firestore
      let finalSchoolId = initialId;
      try {
        const existingSnap = await getDoc(doc(db, 'schools', initialId));
        if (existingSnap.exists()) {
          finalSchoolId = `${baseId}-${Date.now().toString().slice(-4)}`;
        }
      } catch {
        // Continue with initialId if check fails
      }

      const generatedCode = requestedCode || `${name.slice(0, 4).toUpperCase()}-${new Date().getFullYear()}`;
      const initialFee = Number(String(onboardForm.initialFee || 0).replace(/[^0-9.]/g, '')) || 0;
      const initialProgramName = onboardForm.initialProgramName.trim();
      const initialProgramDesc = onboardForm.initialProgramDesc.trim();

      const newSchoolRecord: SchoolData = {
        id: finalSchoolId,
        name,
        schoolCode: generatedCode,
        contactName: onboardForm.contactName.trim() || 'School Administrator',
        contactEmail,
        phone: onboardForm.phone.trim(),
        state: onboardForm.state.trim() || 'Lagos',
        address: onboardForm.address.trim(),
        status: 'ACTIVE',
        programs: initialProgramName ? [{
          id: `prog-${Date.now()}`,
          name: initialProgramName,
          description: initialProgramDesc,
          status: 'ACTIVE'
        }] : [],
        billing: {
          baseAmount: initialFee,
          cycle: (onboardForm.cycle === 'monthly' ? 'monthly' : 'termly') as 'termly' | 'monthly',
          allowedModes: [onboardForm.mode || 'advance_termly', 'advance_termly', 'advance_monthly'],
          mode: onboardForm.mode || 'advance_termly',
          nextDueDate: initialFee > 0 ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) : '',
          status: initialFee > 0 ? 'ACTIVE' : undefined,
          notes: ''
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: auth.currentUser?.uid || 'admin',
        createdByEmail: auth.currentUser?.email || ''
      };

      // 1. Direct Firestore write for the new school
      await setDoc(doc(db, 'schools', finalSchoolId), newSchoolRecord);

      // 2. Set up invitation for school administrator
      try {
        await setDoc(doc(db, 'invites', contactEmail), {
          email: contactEmail,
          name: onboardForm.contactName.trim() || 'School Administrator',
          role: 'SCHOOL',
          schoolId: finalSchoolId,
          schoolName: name,
          status: 'PENDING',
          createdAt: serverTimestamp(),
          createdBy: auth.currentUser?.uid || 'admin',
          createdByEmail: auth.currentUser?.email || ''
        }, { merge: true });
      } catch (inviteErr) {
        console.warn('Invite creation non-fatal warning:', inviteErr);
      }

      // 3. Link existing user account if already registered with this email
      try {
        const userQuery = query(collection(db, 'users'), where('email', '==', contactEmail), limit(1));
        const userSnap = await getDocs(userQuery);
        if (!userSnap.empty) {
          const userDoc = userSnap.docs[0];
          await setDoc(doc(db, 'users', userDoc.id), {
            role: 'SCHOOL',
            schoolId: finalSchoolId,
            schoolName: name,
            accountStatus: 'ACTIVE',
            billing: newSchoolRecord.billing,
            updatedAt: serverTimestamp()
          }, { merge: true });
        }
      } catch (syncErr) {
        console.warn('User link sync non-fatal warning:', syncErr);
      }

      // 4. Log audit activity
      try {
        await addDoc(collection(db, 'activityLogs'), {
          action: 'school_onboarded',
          schoolId: finalSchoolId,
          schoolName: name,
          contactEmail,
          actorId: auth.currentUser?.uid || 'admin',
          userEmail: auth.currentUser?.email || '',
          createdAt: serverTimestamp(),
          timestamp: new Date().toISOString()
        });
      } catch (actErr) {
        console.warn('Activity log non-fatal warning:', actErr);
      }

      // 5. Create notification
      try {
        await addDoc(collection(db, 'notifications'), {
          title: `New School Onboarded: ${name}`,
          message: `${name} (${generatedCode}) has been successfully onboarded.`,
          type: 'school_onboarded',
          recipientId: 'all',
          schoolId: finalSchoolId,
          createdAt: serverTimestamp()
        });
      } catch (notifErr) {
        console.warn('Notification non-fatal warning:', notifErr);
      }

      // 6. Update local state and reset modal
      setSchools(prev => [newSchoolRecord, ...prev]);
      setShowOnboardModal(false);
      setSelectedSchoolId(finalSchoolId);
      setOnboardForm({
        name: '',
        schoolCode: '',
        contactName: '',
        contactEmail: '',
        phone: '',
        state: 'Lagos',
        address: '',
        initialProgramName: 'Kids Coding & AI Essentials',
        initialProgramDesc: 'Comprehensive coding, robotics, and creative tech curriculum for students.',
        initialFee: '',
        cycle: 'termly',
        mode: 'advance_termly'
      });
      toast.success(`${name} onboarded successfully!`);
    } catch (err) {
      console.error('Onboarding failed:', err);
      toast.error(err instanceof Error ? err.message : 'Unable to onboard new school.');
    } finally {
      setOnboardingSaving(false);
    }
  };

  // Quick stats
  const totalSchoolsCount = schools.length;
  const activeSchoolsCount = schools.filter(s => s.status !== 'SUSPENDED').length;
  const totalProgramsCount = schools.reduce((acc, s) => acc + (s.programs?.length || 0), 0);

  return (
    <div className="space-y-6">
      {/* View 1: Detailed Single School Workspace */}
      {selectedSchool ? (
        <div className="space-y-6 animate-fadeIn">
          {/* Top Bar with Back Button */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white/80 dark:bg-slate-900/80 backdrop-blur border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 md:p-6 shadow-sm">
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setSelectedSchoolId(null)}
                className="min-h-11 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center gap-2 transition-all"
              >
                <ArrowLeft size={16} /> Back to Schools
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white">
                    {selectedSchool.name}
                  </h1>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    selectedSchool.status === 'SUSPENDED' 
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400' 
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400'
                  }`}>
                    {selectedSchool.status || 'ACTIVE'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-1">
                  <span className="font-mono font-bold text-brand-red bg-red-50 dark:bg-red-950/30 px-2 py-0.5 rounded-md">
                    {selectedSchool.schoolCode || selectedSchool.id.toUpperCase()}
                  </span>
                  <span>•</span>
                  <span>{selectedSchool.contactEmail || selectedSchool.email || 'No email registered'}</span>
                  <span>•</span>
                  <span>{selectedSchool.state || 'Lagos'}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteSchoolModal(true)}
                className="min-h-10 px-3.5 rounded-xl border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Trash2 size={14} /> Delete School
              </button>

              <button
                type="button"
                onClick={() => {
                  toast.info(`Directly logging into school admin portal for ${selectedSchool.name}...`);
                  startImpersonation({
                    id: selectedSchool.id,
                    uid: selectedSchool.id,
                    name: selectedSchool.name,
                    email: selectedSchool.contactEmail || selectedSchool.email,
                    role: 'SCHOOL',
                    schoolId: selectedSchool.id,
                    schoolName: selectedSchool.name,
                    phone: selectedSchool.phone
                  }, navigate);
                }}
                className="min-h-10 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-2xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
              >
                <UserCheck size={14} /> Log In As School Admin
              </button>

              <button
                type="button"
                onClick={() => handleSendPasswordReset(selectedSchool.contactEmail || selectedSchool.email || '')}
                className="min-h-10 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <KeyRound size={14} /> Send Password Reset
              </button>
            </div>
          </div>

          {/* School Workspace Scoped Tabs */}
          <div className="flex items-center gap-2 border-b border-slate-200/80 dark:border-slate-800 pb-2 overflow-x-auto">
            {[
              { id: 'profile', label: 'Overview & Profile', icon: <School size={15} /> },
              { id: 'programs', label: `Undergoing Programmes (${programsList.length})`, icon: <BookOpen size={15} /> },
              { id: 'tutors', label: `Assigned Tutors & Payouts`, icon: <Users size={15} /> },
              { id: 'billing', label: 'Billing & Custom Fees', icon: <CreditCard size={15} /> },
              { id: 'passcodes', label: `Exam Passcodes (${passcodes.length})`, icon: <Key size={15} /> },
              { id: 'resources', label: `Curriculum & Links (${resources.length})`, icon: <FileText size={15} /> },
              { id: 'cadets', label: `Enrolled Students (${cadets.length})`, icon: <Users size={15} /> },
              { id: 'raw', label: 'Firestore Data', icon: <Code size={15} /> }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSchoolTab(tab.id as any)}
                className={`min-h-10 px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap flex items-center gap-2 transition-all ${
                  activeSchoolTab === tab.id
                    ? 'bg-brand-red text-white shadow-sm shadow-red-500/20'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {showDeleteSchoolModal && selectedSchool && (
            <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
              <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl border border-red-200 dark:border-red-900/50 shadow-2xl p-6 md:p-7">
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-2xl bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-400 flex items-center justify-center shrink-0">
                    <AlertTriangle size={22} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-black text-slate-900 dark:text-white">Delete school permanently?</h2>
                    <p className="text-xs leading-5 text-slate-500 dark:text-slate-400 mt-1">
                      This removes <strong className="text-slate-900 dark:text-white">{selectedSchool.name}</strong>, its onboarded students, linked school users, school resources, sessions, payments and other school-scoped portal records. Linked Firebase login accounts are also removed.
                    </p>
                  </div>
                </div>

                <div className="mt-5 p-4 rounded-2xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50">
                  <p className="text-[11px] font-black uppercase tracking-wider text-red-700 dark:text-red-400">Permanent action</p>
                  <p className="text-xs text-red-800 dark:text-red-300 mt-1">
                    This cannot be undone from the admin portal.
                  </p>
                </div>

                <div className="mt-5">
                  <label className={labelClass}>
                    Type <span className="text-red-600 dark:text-red-400 normal-case tracking-normal">{selectedSchool.name}</span> to confirm
                  </label>
                  <input
                    autoFocus
                    value={deleteConfirmationInput}
                    onChange={e => setDeleteConfirmationInput(e.target.value)}
                    placeholder={selectedSchool.name}
                    className={inputClass}
                    disabled={deletingSchool}
                  />
                </div>

                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeleteSchoolModal(false);
                      setDeleteConfirmationInput('');
                    }}
                    disabled={deletingSchool}
                    className="min-h-11 px-5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteSchool()}
                    disabled={deletingSchool || deleteConfirmationInput.trim() !== selectedSchool.name.trim()}
                    className="min-h-11 px-5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-black inline-flex items-center justify-center gap-2"
                  >
                    {deletingSchool ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                    {deletingSchool ? 'Deleting School…' : 'Delete School Permanently'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 1: Profile & Overview */}
          {activeSchoolTab === 'profile' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="text-base font-black text-slate-900 dark:text-white">School Profile & Institutional Details</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Primary administrative credentials, coordinator contacts, and location data.</p>
                  </div>
                  <School className="text-brand-red" size={20} />
                </div>

                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>School Name</label>
                      <input
                        required
                        value={profileForm.name || ''}
                        onChange={e => setProfileForm(p => ({ ...p, name: e.target.value }))}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Institutional School Code</label>
                      <input
                        required
                        value={profileForm.schoolCode || ''}
                        onChange={e => setProfileForm(p => ({ ...p, schoolCode: e.target.value.toUpperCase() }))}
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Administrator / Coordinator Name</label>
                      <input
                        value={profileForm.contactName || ''}
                        onChange={e => setProfileForm(p => ({ ...p, contactName: e.target.value }))}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Administrator Email Address</label>
                      <input
                        type="email"
                        required
                        value={profileForm.contactEmail || ''}
                        onChange={e => setProfileForm(p => ({ ...p, contactEmail: e.target.value }))}
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Phone Number</label>
                      <input
                        value={profileForm.phone || ''}
                        onChange={e => setProfileForm(p => ({ ...p, phone: e.target.value }))}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>State / Region</label>
                      <input
                        value={profileForm.state || ''}
                        onChange={e => setProfileForm(p => ({ ...p, state: e.target.value }))}
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={labelClass}>Campus Physical Address</label>
                    <input
                      value={profileForm.address || ''}
                      onChange={e => setProfileForm(p => ({ ...p, address: e.target.value }))}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>Administrative Notes & Partnership Context</label>
                    <textarea
                      rows={3}
                      value={profileForm.notes || ''}
                      onChange={e => setProfileForm(p => ({ ...p, notes: e.target.value }))}
                      className={inputClass}
                      placeholder="Special curriculum requests, equipment notes, or partnership terms..."
                    />
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={savingAction}
                      className="min-h-11 px-6 rounded-xl bg-brand-red hover:bg-red-700 text-white font-black text-xs inline-flex items-center gap-2 shadow-sm transition-all"
                    >
                      {savingAction ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
                      Save Profile Changes
                    </button>
                  </div>
                </form>
              </div>

              {/* Quick Summary Card */}
              <div className="space-y-6">
                <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
                  <h3 className="text-sm font-black text-slate-900 dark:text-white mb-4">Quick Institutional Snapshot</h3>
                  <div className="space-y-3.5 text-xs">
                    <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-slate-500">School ID:</span>
                      <span className="font-mono font-bold">{selectedSchool.id}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-slate-500">Active Programmes:</span>
                      <span className="font-bold text-brand-red">{programsList.length} Active</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-slate-500">Enrolled Students:</span>
                      <span className="font-bold text-emerald-600">{cadets.length} Students</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-slate-500">Configured Fee:</span>
                      <span className="font-black">{formatNaira(billingForm.baseAmount)} / {billingForm.cycle}</span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-slate-500">Active Passcodes:</span>
                      <span className="font-bold">{passcodes.filter(p => p.isActive).length} Valid</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Undergoing Programmes (Lifecycle, Multi-Tutor Deployment, Historical Records) */}
          {activeSchoolTab === 'programs' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
                <div>
                  <h2 className="text-base font-black text-slate-900 dark:text-white">Programmes &amp; Lifecycle Management</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Configure active curriculum tracks, start/end dates, duration modes (fixed vs admin-controlled), faculty assignments, and historical completion records for {selectedSchool.name}.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleOpenHistoricalRecord}
                    className="min-h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs inline-flex items-center gap-1.5 transition-all shadow-xs"
                  >
                    <HistoryIcon size={15} className="text-slate-500" /> + Add Historical Record
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingProgram({
                        id: '',
                        name: '',
                        description: '',
                        level: 'Primary 1 - JSS 3',
                        schedule: 'Weekly Tech Lab (2 Sessions / Week)',
                        status: 'ACTIVE',
                        durationMode: 'admin_controlled',
                        startDate: '',
                        billingModel: 'package',
                        baseFee: 180000,
                        amountPerHead: 3500,
                        classRange: 'All Enrolled Cadets',
                        studentAdjustment: 0,
                        billingFrequency: 'termly',
                        defaultPaymentMode: 'advance_termly',
                        nextBillingDueDate: '',
                        billingTermsAndNotes: '',
                        hasEdclub: true,
                        hasResources: true,
                        hasAssessments: true,
                        hasLiveClasses: true,
                        isGeneralProgram: programsList.length === 0,
                        assignedTutors: [],
                        historicalMilestones: []
                      });
                      setIsNewProgram(true);
                    }}
                    className="min-h-11 px-4 rounded-xl bg-brand-red hover:bg-red-700 text-white font-black text-xs inline-flex items-center gap-2 shadow-sm transition-all"
                  >
                    <Plus size={16} /> Deploy New Programme
                  </button>
                </div>
              </div>

              {/* Edit/Add Program Modal / Form */}
              {editingProgram && (
                <div className="bg-slate-50 dark:bg-slate-950/60 border-2 border-brand-red/30 rounded-3xl p-6 animate-fadeIn space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-brand-red text-white">
                        {editingProgram.isHistorical ? 'Historical Archive Entry' : isNewProgram ? 'New Programme Lifecycle Setup' : 'Edit Programme Lifecycle'}
                      </span>
                      <h3 className="text-base font-black text-slate-900 dark:text-white mt-1">
                        {editingProgram.isHistorical ? 'Add Manually Documented Historical Record' : isNewProgram ? 'Deploy New Programme & Assign Instructors' : 'Edit Programme & Tutor Allocations'}
                      </h3>
                      <p className="text-[11px] text-slate-500">Configure duration mode, lifecycle dates, module entitlements, and instructor payment allocations.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingProgram(null)}
                      className="min-h-9 min-w-9 rounded-lg text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 flex items-center justify-center"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Preset catalog picker */}
                  {isNewProgram && catalogPrograms.length > 0 && !editingProgram.isHistorical && (
                    <div className="p-3.5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800">
                      <label className="block text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">
                        Quick Select From Technology Catalog:
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {catalogPrograms.map(cat => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => {
                              setEditingProgram(prev => prev ? {
                                ...prev,
                                name: cat.name,
                                description: cat.description,
                                level: cat.level || 'All Grades'
                              } : null);
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                              editingProgram.name === cat.name
                                ? 'bg-brand-red text-white border-brand-red'
                                : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-brand-red'
                            }`}
                          >
                            {cat.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <form onSubmit={handleProgramSubmit} className="space-y-5">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="md:col-span-2">
                        <label className={labelClass}>Programme Title</label>
                        <input
                          required
                          value={editingProgram.name}
                          onChange={e => setEditingProgram(p => p ? { ...p, name: e.target.value } : null)}
                          placeholder="e.g. Digital Literacy & Smart Web Engineering"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Target Grade / Cohort</label>
                        <input
                          value={editingProgram.level || ''}
                          onChange={e => setEditingProgram(p => p ? { ...p, level: e.target.value } : null)}
                          placeholder="e.g. Year 1 - Year 6, JSS 1-3"
                          className={inputClass}
                        />
                      </div>
                    </div>

                    {/* Programme Lifecycle & Duration Configuration */}
                    <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-4">
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
                        <Calendar size={14} className="text-brand-red" />
                        Programme Lifecycle &amp; Duration Mode
                      </h4>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className={labelClass}>Duration Mode</label>
                          <select
                            value={editingProgram.durationMode || 'admin_controlled'}
                            onChange={e => setEditingProgram(p => p ? { ...p, durationMode: e.target.value as any } : null)}
                            className={inputClass}
                          >
                            <option value="admin_controlled">Admin-Controlled (Ends when declared completed)</option>
                            <option value="fixed_dates">Fixed Start &amp; End Dates</option>
                          </select>
                        </div>

                        <div>
                          <label className={labelClass}>Programme Start Date</label>
                          <input
                            type="date"
                            value={editingProgram.startDate || ''}
                            onChange={e => setEditingProgram(p => p ? { ...p, startDate: e.target.value } : null)}
                            className={inputClass}
                          />
                        </div>

                        {editingProgram.durationMode === 'fixed_dates' ? (
                          <div>
                            <label className={labelClass}>Expected End Date</label>
                            <input
                              type="date"
                              value={editingProgram.endDate || ''}
                              onChange={e => setEditingProgram(p => p ? { ...p, endDate: e.target.value } : null)}
                              className={inputClass}
                            />
                          </div>
                        ) : (
                          <div>
                            <label className={labelClass}>Lifecycle Status</label>
                            <select
                              value={editingProgram.status}
                              onChange={e => setEditingProgram(p => p ? { ...p, status: e.target.value as any } : null)}
                              className={inputClass}
                            >
                              <option value="ACTIVE">Active (Ongoing)</option>
                              <option value="UPCOMING">Upcoming / Next Term</option>
                              <option value="PAUSED">Paused</option>
                              <option value="COMPLETED">Completed</option>
                              <option value="HISTORICAL">Historical Record</option>
                            </select>
                          </div>
                        )}
                      </div>

                      {(editingProgram.status === 'COMPLETED' || editingProgram.status === 'HISTORICAL' || editingProgram.isHistorical) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
                          <div>
                            <label className={labelClass}>Recorded Completion Date</label>
                            <input
                              type="date"
                              value={editingProgram.completedAt || editingProgram.endDate || ''}
                              onChange={e => setEditingProgram(p => p ? { ...p, completedAt: e.target.value } : null)}
                              className={inputClass}
                            />
                          </div>
                          <div>
                            <label className={labelClass}>Archive / Historical Notes</label>
                            <input
                              type="text"
                              value={editingProgram.notes || ''}
                              onChange={e => setEditingProgram(p => p ? { ...p, notes: e.target.value } : null)}
                              placeholder="e.g. Completed with 98% pass rate across 45 scholars"
                              className={inputClass}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className={labelClass}>Lab Days &amp; Timetable Schedule</label>
                        <input
                          value={editingProgram.schedule || ''}
                          onChange={e => setEditingProgram(p => p ? { ...p, schedule: e.target.value } : null)}
                          placeholder="e.g. Tuesdays & Thursdays, 10am - 12pm"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Default School Programme?</label>
                        <select
                          value={editingProgram.isGeneralProgram ? 'yes' : 'no'}
                          onChange={e => setEditingProgram(p => p ? { ...p, isGeneralProgram: e.target.value === 'yes' } : null)}
                          className={inputClass}
                        >
                          <option value="yes">Yes (General track inherited by default)</option>
                          <option value="no">No (Specialized stream track)</option>
                        </select>
                      </div>
                    </div>

                    {/* 💳 INDEPENDENT PROGRAMME PRICING & BILLING CONFIGURATION */}
                    <div className="p-5 rounded-3xl bg-slate-900 text-white border border-slate-800 shadow-md space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-3">
                        <div>
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-brand-red text-white">
                            Programme Billing Engine
                          </span>
                          <h4 className="text-sm font-black text-white mt-1 flex items-center gap-2">
                            <CreditCard size={15} className="text-brand-red" />
                            Tuition Pricing &amp; Billing Model
                          </h4>
                          <p className="text-[11px] text-slate-400">
                            Configure whether this specific programme is billed as a Fixed Package or automatically calculated Per-Head based on onboarded school learners.
                          </p>
                        </div>

                        {/* Model Switcher */}
                        <div className="flex items-center p-1 rounded-xl bg-slate-950 border border-slate-800 shrink-0">
                          <button
                            type="button"
                            onClick={() => setEditingProgram(p => p ? { ...p, billingModel: 'package' } : null)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                              (editingProgram.billingModel || 'package') === 'package'
                                ? 'bg-brand-red text-white shadow-xs'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            📦 Fixed Package Fee
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingProgram(p => p ? { ...p, billingModel: 'per_head' } : null)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                              editingProgram.billingModel === 'per_head'
                                ? 'bg-brand-red text-white shadow-xs'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            👥 Per-Head (Per Student)
                          </button>
                        </div>
                      </div>

                      {/* Package Fee Model Inputs */}
                      {(editingProgram.billingModel || 'package') === 'package' ? (
                        <div className="space-y-3 bg-slate-950/70 p-4 rounded-2xl border border-slate-800">
                          <div>
                            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                              Fixed Programme Fee (₦ NGN)
                            </label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">₦</span>
                              <input
                                type="number"
                                min="0"
                                step="1000"
                                value={editingProgram.baseFee || ''}
                                onChange={e => setEditingProgram(p => p ? { ...p, baseFee: Number(e.target.value) || 0 } : null)}
                                placeholder="e.g. 180000"
                                className="w-full pl-8 pr-3.5 py-2.5 rounded-xl border border-slate-700 bg-slate-900 text-white text-xs font-bold font-mono focus:outline-none focus:ring-2 focus:ring-brand-red"
                              />
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1">
                              Standard lump-sum package tuition charged specifically for this curriculum track.
                            </p>
                          </div>
                        </div>
                      ) : (
                        /* Per-Head Calculation Model Inputs */
                        <div className="space-y-4 bg-slate-950/70 p-4 rounded-2xl border border-slate-800">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                                Amount Per Head (₦ / Learner)
                              </label>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">₦</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="500"
                                  value={editingProgram.amountPerHead || ''}
                                  onChange={e => setEditingProgram(p => p ? { ...p, amountPerHead: Number(e.target.value) || 0 } : null)}
                                  placeholder="e.g. 3500"
                                  className="w-full pl-8 pr-3.5 py-2.5 rounded-xl border border-slate-700 bg-slate-900 text-white text-xs font-bold font-mono focus:outline-none focus:ring-2 focus:ring-brand-red"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                                Target Class Range
                              </label>
                              <input
                                type="text"
                                value={editingProgram.classRange || ''}
                                onChange={e => setEditingProgram(p => p ? { ...p, classRange: e.target.value } : null)}
                                placeholder="e.g. Primary 1 - Primary 6 or All"
                                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-700 bg-slate-900 text-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand-red"
                              />
                            </div>

                            <div>
                              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                                Student Count Adjustment (±)
                              </label>
                              <input
                                type="number"
                                value={editingProgram.studentAdjustment || 0}
                                onChange={e => setEditingProgram(p => p ? { ...p, studentAdjustment: Number(e.target.value) || 0 } : null)}
                                placeholder="e.g. -2 for withdrawn students"
                                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-700 bg-slate-900 text-white text-xs font-bold font-mono focus:outline-none focus:ring-2 focus:ring-brand-red"
                              />
                            </div>
                          </div>

                          {/* Live Dynamic Calculation Banner */}
                          {(() => {
                            const rawCount = cadets.length;
                            const adj = Number(editingProgram.studentAdjustment || 0);
                            const netCount = Math.max(0, rawCount + adj);
                            const rate = Number(editingProgram.amountPerHead || 0);
                            const calculatedFee = netCount * rate;

                            return (
                              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                                <div>
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                                    Live Automated Fee Computation:
                                  </span>
                                  <div className="mt-0.5 text-slate-300 font-mono text-[11px]">
                                    {rawCount} Enrolled Cadets {adj !== 0 ? `(${adj > 0 ? `+${adj}` : adj} adjustment)` : ''} = <strong className="text-white">{netCount} billable learners</strong> × ₦{rate.toLocaleString()}
                                  </div>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className="text-[10px] text-emerald-400 uppercase font-black block">Computed Total</span>
                                  <span className="text-base font-black text-emerald-400 font-mono">
                                    ₦{calculatedFee.toLocaleString()}
                                  </span>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      {/* Billing frequency, mode, due date, terms */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                        <div>
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                            Billing Frequency / Cycle
                          </label>
                          <select
                            value={editingProgram.billingFrequency || 'termly'}
                            onChange={e => setEditingProgram(p => p ? { ...p, billingFrequency: e.target.value as any } : null)}
                            className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-900 text-white text-xs font-medium"
                          >
                            <option value="termly">Termly (12 Weeks Full Term)</option>
                            <option value="monthly">Monthly (4 Weeks Cycle)</option>
                            <option value="per_session">Per Academic Session (Annual)</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                            Default Payment Mode
                          </label>
                          <select
                            value={editingProgram.defaultPaymentMode || 'advance_termly'}
                            onChange={e => setEditingProgram(p => p ? { ...p, defaultPaymentMode: e.target.value as any } : null)}
                            className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-900 text-white text-xs font-medium"
                          >
                            <option value="advance_termly">Advance Termly (Upfront)</option>
                            <option value="advance_monthly">Advance Monthly (Upfront)</option>
                            <option value="post_termly">Post Termly (End of Term Invoice)</option>
                            <option value="post_monthly">Post Monthly (End of Month Invoice)</option>
                            <option value="bank_transfer">Direct Institutional Remittance</option>
                            <option value="paystack_card">Online Card / Paystack</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                            Next Billing Due Date
                          </label>
                          <input
                            type="date"
                            value={editingProgram.nextBillingDueDate || ''}
                            onChange={e => setEditingProgram(p => p ? { ...p, nextBillingDueDate: e.target.value } : null)}
                            className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-900 text-white text-xs font-medium"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                          Programme Billing Terms &amp; Special Notes
                        </label>
                        <input
                          type="text"
                          value={editingProgram.billingTermsAndNotes || ''}
                          onChange={e => setEditingProgram(p => p ? { ...p, billingTermsAndNotes: e.target.value } : null)}
                          placeholder="e.g. Includes physical robotics hardware kit and EdClub typing lab access."
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-700 bg-slate-900 text-white text-xs"
                        />
                      </div>
                    </div>

                    {/* Sessions per week & Session Duration */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                          Sessions / Week
                        </label>
                        <select
                          value={editingProgram.sessionsPerWeek || 2}
                          onChange={e => setEditingProgram(p => p ? { ...p, sessionsPerWeek: Number(e.target.value) || 1 } : null)}
                          className={inputClass}
                        >
                          <option value={1}>1 Session / Week</option>
                          <option value={2}>2 Sessions / Week</option>
                          <option value={3}>3 Sessions / Week</option>
                          <option value={4}>4 Sessions / Week</option>
                          <option value={5}>5 Sessions / Week</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                          Session Duration
                        </label>
                        <input
                          value={editingProgram.sessionDuration || '1 hour'}
                          onChange={e => setEditingProgram(p => p ? { ...p, sessionDuration: e.target.value } : null)}
                          placeholder="e.g. 45 mins, 1 hour"
                          className={inputClass}
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                          Series / Track Name
                        </label>
                        <input
                          value={editingProgram.seriesName || ''}
                          onChange={e => setEditingProgram(p => p ? { ...p, seriesName: e.target.value } : null)}
                          placeholder="e.g. Primary Coding Track"
                          className={inputClass}
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">
                          Next Stage in Series
                        </label>
                        <input
                          value={editingProgram.nextProgramTitle || ''}
                          onChange={e => setEditingProgram(p => p ? { ...p, nextProgramTitle: e.target.value } : null)}
                          placeholder="e.g. Stage 2: Web Dev"
                          className={inputClass}
                        />
                      </div>
                    </div>

                    {/* Feature Entitlements */}
                    <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-2.5">
                      <label className="text-[11px] font-black uppercase tracking-wider text-slate-500 block">
                        Entitlements &amp; Module Permissions for this Track
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(editingProgram.hasEdclub)}
                            onChange={e => setEditingProgram(p => p ? { ...p, hasEdclub: e.target.checked } : null)}
                            className="rounded text-brand-red focus:ring-brand-red"
                          />
                          <span>⌨️ EdClub Typing</span>
                        </label>
                        <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editingProgram.hasResources !== false}
                            onChange={e => setEditingProgram(p => p ? { ...p, hasResources: e.target.checked } : null)}
                            className="rounded text-brand-red focus:ring-brand-red"
                          />
                          <span>📚 Resource Library</span>
                        </label>
                        <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editingProgram.hasAssessments !== false}
                            onChange={e => setEditingProgram(p => p ? { ...p, hasAssessments: e.target.checked } : null)}
                            className="rounded text-brand-red focus:ring-brand-red"
                          />
                          <span>📝 CBT Exams</span>
                        </label>
                        <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                          <input
                            type="checkbox"
                            checked={editingProgram.hasLiveClasses !== false}
                            onChange={e => setEditingProgram(p => p ? { ...p, hasLiveClasses: e.target.checked } : null)}
                            className="rounded text-brand-red focus:ring-brand-red"
                          />
                          <span>🎥 Live Classes</span>
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className={labelClass}>Programme Description &amp; Curriculum Scope</label>
                      <textarea
                        rows={3}
                        required
                        value={editingProgram.description}
                        onChange={e => setEditingProgram(p => p ? { ...p, description: e.target.value } : null)}
                        placeholder="Comprehensive details on curriculum goals, technologies taught, and practical milestones..."
                        className={inputClass}
                      />
                    </div>

                    {/* ASSIGNED TUTORS & MULTI-TUTOR ALLOCATION SECTION */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
                            <Users size={14} className="text-brand-red" />
                            Assigned Instructors &amp; Tutors (Multi-Tutor Assignment)
                          </h4>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            Assign lead instructors, assistant tutors, and define their payment allocations.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const defaultTutor = staffList[0] || { id: `staff-${Date.now()}`, name: '', email: '' };
                            const newAlloc: AssignedTutorAllocation = {
                              tutorId: defaultTutor.id,
                              tutorName: defaultTutor.name,
                              tutorEmail: defaultTutor.email,
                              payoutRate: 0,
                              payoutType: 'per_term',
                              role: (editingProgram.assignedTutors?.length || 0) === 0 ? 'lead' : 'co_tutor',
                              notes: ''
                            };
                            setEditingProgram(p => p ? {
                              ...p,
                              assignedTutors: [...(p.assignedTutors || []), newAlloc]
                            } : null);
                          }}
                          className="min-h-8 px-3 rounded-lg bg-red-50 hover:bg-red-100 text-brand-red dark:bg-red-950/40 text-xs font-black inline-flex items-center gap-1.5 transition-all"
                        >
                          <Plus size={13} /> + Add Another Tutor
                        </button>
                      </div>

                      {(!editingProgram.assignedTutors || editingProgram.assignedTutors.length === 0) ? (
                        <div className="p-4 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-500">
                          No tutors assigned yet to this program. Click <strong>"+ Add Another Tutor"</strong> above to assign instructors and set their payment rates.
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {editingProgram.assignedTutors.map((alloc, idx) => (
                            <div
                              key={idx}
                              className="p-3.5 bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 rounded-xl grid grid-cols-1 md:grid-cols-12 gap-3 items-center"
                            >
                              <div className="md:col-span-4">
                                <label className="block text-[10px] font-bold text-slate-500 mb-1">Tutor / Instructor</label>
                                {staffList.length > 0 ? (
                                  <select
                                    value={alloc.tutorId}
                                    onChange={e => {
                                      const selected = staffList.find(s => s.id === e.target.value);
                                      const updatedAlloc = [...(editingProgram.assignedTutors || [])];
                                      updatedAlloc[idx] = {
                                        ...alloc,
                                        tutorId: e.target.value,
                                        tutorName: selected?.name || alloc.tutorName,
                                        tutorEmail: selected?.email || alloc.tutorEmail
                                      };
                                      setEditingProgram(p => p ? { ...p, assignedTutors: updatedAlloc } : null);
                                    }}
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium"
                                  >
                                    {staffList.map(s => (
                                      <option key={s.id} value={s.id}>{s.name} ({s.email})</option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    value={alloc.tutorName}
                                    onChange={e => {
                                      const updatedAlloc = [...(editingProgram.assignedTutors || [])];
                                      updatedAlloc[idx] = { ...alloc, tutorName: e.target.value };
                                      setEditingProgram(p => p ? { ...p, assignedTutors: updatedAlloc } : null);
                                    }}
                                    placeholder="Tutor Full Name"
                                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium"
                                  />
                                )}
                              </div>

                              <div className="md:col-span-2">
                                <label className="block text-[10px] font-bold text-slate-500 mb-1">Role</label>
                                <select
                                  value={alloc.role || 'lead'}
                                  onChange={e => {
                                    const updatedAlloc = [...(editingProgram.assignedTutors || [])];
                                    updatedAlloc[idx] = { ...alloc, role: e.target.value as any };
                                    setEditingProgram(p => p ? { ...p, assignedTutors: updatedAlloc } : null);
                                  }}
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium"
                                >
                                  <option value="lead">Lead Instructor</option>
                                  <option value="co_tutor">Co-Tutor / Assistant</option>
                                  <option value="technical_facilitator">Lab Facilitator</option>
                                  <option value="assistant">Teaching Assistant</option>
                                </select>
                              </div>

                              <div className="md:col-span-3">
                                <label className="block text-[10px] font-bold text-slate-500 mb-1">Tutor Payment (₦ NGN)</label>
                                <input
                                  type="number"
                                  min="0"
                                  step="1000"
                                  value={alloc.payoutRate}
                                  onChange={e => {
                                    const updatedAlloc = [...(editingProgram.assignedTutors || [])];
                                    updatedAlloc[idx] = { ...alloc, payoutRate: Number(e.target.value) || 0 };
                                    setEditingProgram(p => p ? { ...p, assignedTutors: updatedAlloc } : null);
                                  }}
                                  placeholder="e.g. 50000"
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-black text-emerald-600"
                                />
                              </div>

                              <div className="md:col-span-2">
                                <label className="block text-[10px] font-bold text-slate-500 mb-1">Payment Type</label>
                                <select
                                  value={alloc.payoutType || 'per_term'}
                                  onChange={e => {
                                    const updatedAlloc = [...(editingProgram.assignedTutors || [])];
                                    updatedAlloc[idx] = { ...alloc, payoutType: e.target.value as any };
                                    setEditingProgram(p => p ? { ...p, assignedTutors: updatedAlloc } : null);
                                  }}
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium"
                                >
                                  <option value="per_term">Per Term</option>
                                  <option value="per_month">Per Month</option>
                                  <option value="per_student">Per Student</option>
                                  <option value="fixed_stipend">Fixed Stipend</option>
                                </select>
                              </div>

                              <div className="md:col-span-1 flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updatedAlloc = (editingProgram.assignedTutors || []).filter((_, i) => i !== idx);
                                    setEditingProgram(p => p ? { ...p, assignedTutors: updatedAlloc } : null);
                                  }}
                                  className="min-h-8 min-w-8 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg flex items-center justify-center transition-all"
                                  title="Remove Tutor"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => setEditingProgram(null)}
                        className="min-h-10 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={savingAction}
                        className="min-h-10 px-5 rounded-xl bg-brand-red text-white text-xs font-black inline-flex items-center gap-2"
                      >
                        {savingAction ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
                        Save Programme Configuration
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* SECTIONS: ACTIVE PROGRAMMES vs HISTORICAL RECORDS */}
              {(() => {
                const activeList = programsList.filter(p => p.status !== 'COMPLETED' && p.status !== 'HISTORICAL');
                const historyList = programsList.filter(p => p.status === 'COMPLETED' || p.status === 'HISTORICAL');

                return (
                  <div className="space-y-8">
                    {/* 1. ACTIVE PROGRAMMES */}
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <BookOpen size={18} className="text-brand-red" />
                          <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                            Current &amp; Active Programmes ({activeList.length})
                          </h3>
                        </div>
                        <span className="text-xs text-slate-500 font-medium">
                          Active classroom tracks currently undergoing instruction
                        </span>
                      </div>

                      {activeList.length === 0 ? (
                        <div className="text-center py-12 px-6 bg-white dark:bg-slate-900 border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl space-y-2">
                          <BookOpen size={28} className="mx-auto text-slate-300 dark:text-slate-600" />
                          <h4 className="font-bold text-xs text-slate-800 dark:text-slate-200">No active programmes currently assigned</h4>
                          <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                            Deploy a technology programme track to begin scheduling live classes for this institution.
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {activeList.map(prog => (
                            <div
                              key={prog.id}
                              className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col justify-between"
                            >
                              <div>
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-50 text-brand-red dark:bg-red-950/40">
                                        {prog.status}
                                      </span>
                                      {prog.isGeneralProgram && (
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/40">
                                          🎓 General School Track
                                        </span>
                                      )}
                                      {prog.durationMode === 'admin_controlled' ? (
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40">
                                          Admin-Controlled Duration
                                        </span>
                                      ) : null}
                                    </div>
                                    <h3 className="text-base font-black text-slate-900 dark:text-white mt-2">
                                      {prog.name}
                                    </h3>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingProgram(prog);
                                        setIsNewProgram(false);
                                      }}
                                      className="min-h-8 min-w-8 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-all"
                                      title="Edit Programme"
                                    >
                                      <Edit3 size={15} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteProgram(prog.id)}
                                      className="min-h-8 min-w-8 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center transition-all"
                                      title="Delete Programme"
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  </div>
                                </div>

                                <p className="text-xs text-slate-600 dark:text-slate-400 mt-2.5 leading-relaxed">
                                  {prog.description}
                                </p>

                                {/* Lifecycle Date Indicators */}
                                <div className="mt-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800 text-[11px] flex justify-between items-center">
                                  <span className="text-slate-500">
                                    Start: <strong>{prog.startDate ? new Date(prog.startDate).toLocaleDateString('en-NG', { dateStyle: 'medium' }) : 'Ongoing'}</strong>
                                  </span>
                                  <span className="text-slate-500">
                                    End: <strong>{prog.durationMode === 'admin_controlled' ? 'Admin Controlled' : prog.endDate ? new Date(prog.endDate).toLocaleDateString('en-NG', { dateStyle: 'medium' }) : 'Active'}</strong>
                                  </span>
                                </div>

                                {/* Render Assigned Tutors */}
                                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                                  <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[11px] font-black text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                      <Users size={12} className="text-brand-red" />
                                      Assigned Instructors ({prog.assignedTutors?.length || 0}):
                                    </span>
                                  </div>
                                  {(!prog.assignedTutors || prog.assignedTutors.length === 0) ? (
                                    <p className="text-[11px] text-slate-400 italic">No tutors assigned yet.</p>
                                  ) : (
                                    <div className="flex flex-wrap gap-1.5">
                                      {prog.assignedTutors.map((t, idx) => (
                                        <div
                                          key={idx}
                                          className="px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 text-[10px] flex items-center gap-1.5"
                                        >
                                          <span className="font-bold text-slate-900 dark:text-white">{t.tutorName}</span>
                                          <span className="px-1 py-0.2 rounded text-[8px] font-black uppercase bg-red-100 text-brand-red dark:bg-red-950/60">
                                            {t.role || 'Tutor'}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
                                <div className="text-[11px] text-slate-500">
                                  Cohort: <strong className="text-slate-700 dark:text-slate-300">{prog.level || 'All Cohorts'}</strong>
                                </div>

                                {/* Section 2 Requirement: Declare Completed button */}
                                <button
                                  type="button"
                                  onClick={() => handleDeclareCompleted(prog)}
                                  className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-black dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-[11px] font-black inline-flex items-center gap-1.5 transition-all shadow-xs"
                                >
                                  <CheckCircle2 size={13} className="text-emerald-400" />
                                  <span>Declare Completed</span>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 2. PROGRAMME HISTORY & HISTORICAL RECORDS */}
                    <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <HistoryIcon size={18} className="text-slate-400" />
                          <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                            Programme History &amp; Completed Records ({historyList.length})
                          </h3>
                        </div>
                        <span className="text-xs text-slate-500 font-medium">
                          Completed and legacy archived programmes (retained permanently)
                        </span>
                      </div>

                      {historyList.length === 0 ? (
                        <div className="text-center py-10 px-6 bg-slate-50/50 dark:bg-slate-900/40 border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl">
                          <HistoryIcon size={24} className="mx-auto text-slate-300 dark:text-slate-600 mb-1" />
                          <p className="text-xs font-bold text-slate-700 dark:text-slate-300">No programme history yet.</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            When an active programme is declared completed or legacy records are entered, they will appear here.
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {historyList.map(prog => (
                            <div
                              key={prog.id}
                              className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-xs flex flex-col justify-between opacity-90"
                            >
                              <div>
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                                      Completed Record
                                    </span>
                                    <h4 className="text-sm font-black text-slate-900 dark:text-white mt-1.5">
                                      {prog.name}
                                    </h4>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingProgram(prog);
                                        setIsNewProgram(false);
                                      }}
                                      className="min-h-7 min-w-7 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-all"
                                      title="Edit Record"
                                    >
                                      <Edit3 size={13} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteProgram(prog.id)}
                                      className="min-h-7 min-w-7 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center transition-all"
                                      title="Delete Record"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </div>

                                {prog.description && (
                                  <p className="text-[11px] text-slate-500 mt-2 line-clamp-2">
                                    {prog.description}
                                  </p>
                                )}

                                {prog.notes && (
                                  <div className="mt-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-[10px] text-slate-600 dark:text-slate-300">
                                    <strong>Archive note:</strong> {prog.notes}
                                  </div>
                                )}
                              </div>

                              <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 flex justify-between items-center">
                                <span>Cohort: {prog.level || 'All Cohorts'}</span>
                                {prog.completedAt && (
                                  <span>Completed: {new Date(prog.completedAt).toLocaleDateString('en-NG', { dateStyle: 'medium' })}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* TAB: Assigned Tutors & Institutional Payout Overview */}
          {activeSchoolTab === 'tutors' && (
            <div className="space-y-6">
              {/* Financial Commitment & Payout Margin Metrics */}
              {(() => {
                const allAssigned = programsList.flatMap(p => (p.assignedTutors || []).map(t => ({ ...t, programName: p.name })));
                const totalTutorCommitment = allAssigned.reduce((sum, t) => sum + (Number(t.payoutRate) || 0), 0);
                const schoolFee = Number(billingForm.baseAmount || 0);
                const netMargin = Math.max(0, schoolFee - totalTutorCommitment);

                return (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
                        <span className="text-[11px] font-bold text-slate-400 uppercase">Assigned Instructors</span>
                        <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                          {allAssigned.length}
                        </div>
                        <span className="text-[11px] text-slate-500">Across {programsList.length} programs</span>
                      </div>

                      <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
                        <span className="text-[11px] font-bold text-slate-400 uppercase">Total Faculty Payout</span>
                        <div className="text-2xl font-black text-red-600 dark:text-red-400 mt-1 font-mono">
                          ₦{totalTutorCommitment.toLocaleString()}
                        </div>
                        <span className="text-[11px] text-slate-500">Per billing cycle</span>
                      </div>

                      <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
                        <span className="text-[11px] font-bold text-slate-400 uppercase">School Invoiced Fee</span>
                        <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
                          ₦{schoolFee.toLocaleString()}
                        </div>
                        <span className="text-[11px] text-slate-500">{billingForm.cycle} cycle</span>
                      </div>

                      <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
                        <span className="text-[11px] font-bold text-slate-400 uppercase">Net Institutional Margin</span>
                        <div className="text-2xl font-black text-brand-red mt-1 font-mono">
                          ₦{netMargin.toLocaleString()}
                        </div>
                        <span className="text-[11px] text-slate-500">Platform operational surplus</span>
                      </div>
                    </div>

                    <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
                        <div>
                          <h3 className="text-base font-black text-slate-900 dark:text-white">Assigned Faculty Directory & Payment Rates</h3>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Instructors actively assigned to {selectedSchool.name} programmes and their contractual compensation.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveSchoolTab('programs')}
                          className="min-h-10 px-4 rounded-xl bg-brand-red hover:bg-red-700 text-white font-bold text-xs inline-flex items-center gap-1.5 transition-all"
                        >
                          <Edit3 size={14} /> Manage Programmes & Tutor Allocations
                        </button>
                      </div>

                      {allAssigned.length === 0 ? (
                        <div className="p-8 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-xs text-slate-500">
                          No faculty assigned to {selectedSchool.name} yet. Switch to the <strong>Undergoing Programmes</strong> tab to assign tutors and define their payout rates.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="border-b border-slate-200/80 dark:border-slate-800 text-[11px] font-black uppercase text-slate-400">
                                <th className="py-3 px-4">Faculty / Tutor</th>
                                <th className="py-3 px-4">Assigned Programme</th>
                                <th className="py-3 px-4">Role</th>
                                <th className="py-3 px-4">Assigned Payout Rate</th>
                                <th className="py-3 px-4">Frequency</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                              {allAssigned.map((item, idx) => (
                                <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                                  <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                                    <div>{item.tutorName}</div>
                                    {item.tutorEmail && <div className="text-[10px] text-slate-400 font-normal">{item.tutorEmail}</div>}
                                  </td>
                                  <td className="py-3 px-4 font-medium text-slate-700 dark:text-slate-300">
                                    {item.programName}
                                  </td>
                                  <td className="py-3 px-4">
                                    <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-red-50 text-brand-red dark:bg-red-950/40">
                                      {item.role || 'Tutor'}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 font-mono font-black text-emerald-600 dark:text-emerald-400 text-sm">
                                    ₦{Number(item.payoutRate || 0).toLocaleString()}
                                  </td>
                                  <td className="py-3 px-4 text-slate-500 capitalize">
                                    {item.payoutType?.replace('per_', '') || 'Termly'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* TAB 3: Multi-Program Institutional Invoicing & Payment Operations */}
          {activeSchoolTab === 'billing' && (() => {
            const activePrograms = programsList.filter(p => p.status !== 'COMPLETED' && p.status !== 'HISTORICAL');
            
            // Calculate program fees independently without sharing or overriding
            const programBillingItems = activePrograms.map(p => {
              let computedFee = 0;
              let details = '';
              let billableCount = 0;

              if (p.billingModel === 'per_head') {
                const rawCount = cadets.length;
                const adj = Number(p.studentAdjustment || 0);
                billableCount = Math.max(0, rawCount + adj);
                const rate = Number(p.amountPerHead || 0);
                computedFee = billableCount * rate;
                details = `${billableCount} students (${rawCount} onboarded ${adj !== 0 ? (adj > 0 ? `+${adj}` : adj) : ''}) × ₦${rate.toLocaleString()}`;
              } else {
                computedFee = Number(p.baseFee || 0);
                details = 'Fixed Curriculum Package Fee';
              }

              return {
                ...p,
                computedFee,
                details,
                billableCount
              };
            });

            const totalInstitutionalFee = programBillingItems.reduce((sum, item) => sum + item.computedFee, 0);
            
            // Find earliest due date
            const nearestDueDate = programBillingItems.find(p => p.nextBillingDueDate)?.nextBillingDueDate || billingForm.nextDueDate || '';

            return (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  {/* Multi-Program Invoicing Card */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                      <div>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-brand-red text-white">
                          Multi-Track Invoicing
                        </span>
                        <h2 className="text-base font-black text-slate-900 dark:text-white mt-1 flex items-center gap-2">
                          <CreditCard className="text-brand-red" size={18} />
                          Active Programmes &amp; Institutional Fee Breakdown
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Each undergoing programme is calculated independently. Package fees and Per-Head student totals are never blended or overridden.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setActiveSchoolTab('programs')}
                        className="min-h-9 px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs inline-flex items-center gap-1.5 transition-all self-start sm:self-auto"
                      >
                        <Edit3 size={13} /> Edit Program Fees in Lifecycle Tab
                      </button>
                    </div>

                    {programBillingItems.length === 0 ? (
                      <div className="p-8 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-xs text-slate-500">
                        No active programmes configured for {selectedSchool.name}. Switch to the <strong>Undergoing Programmes</strong> tab to deploy curriculum tracks and set their billing.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {programBillingItems.map((item, idx) => (
                          <div 
                            key={item.id || idx}
                            className="p-4 rounded-2xl bg-slate-50/80 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${
                                  item.billingModel === 'per_head' 
                                    ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20' 
                                    : 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                                }`}>
                                  {item.billingModel === 'per_head' ? 'Per-Head Rate' : 'Package Fee'}
                                </span>
                                <h4 className="text-xs font-black text-slate-900 dark:text-white">
                                  {item.name}
                                </h4>
                              </div>
                              <p className="text-[11px] text-slate-500 font-mono">
                                {item.details} {item.classRange ? `• Cohort: ${item.classRange}` : ''}
                              </p>
                              <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-400 pt-0.5">
                                <span>Cycle: <strong className="text-slate-600 dark:text-slate-300 capitalize">{item.billingFrequency || 'Termly'}</strong></span>
                                <span>Mode: <strong className="text-slate-600 dark:text-slate-300 capitalize">{(item.defaultPaymentMode || 'advance_termly').replace(/_/g, ' ')}</strong></span>
                                {item.nextBillingDueDate && (
                                  <span>Due: <strong className="text-brand-red">{new Date(item.nextBillingDueDate).toLocaleDateString('en-NG', { dateStyle: 'medium' })}</strong></span>
                                )}
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <span className="text-[10px] font-bold text-slate-400 uppercase block">Programme Tuition</span>
                              <span className="text-lg font-black text-slate-900 dark:text-white font-mono">
                                ₦{item.computedFee.toLocaleString()}
                              </span>
                            </div>
                          </div>
                        ))}

                        {/* Grand Total Institutional Invoiced Summary */}
                        <div className="p-5 rounded-2xl bg-slate-900 text-white border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 mt-4 shadow-md">
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                              Consolidated Institutional Invoiced Total:
                            </span>
                            <p className="text-xs text-slate-300 mt-0.5">
                              Grand total payable by {selectedSchool.name} across all {programBillingItems.length} active programme tracks.
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-[10px] uppercase font-black text-emerald-400 block">Total Due</span>
                            <span className="text-2xl sm:text-3xl font-black text-white font-mono tracking-tight">
                              ₦{totalInstitutionalFee.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Reminders & Invoice Status */}
                <div className="space-y-6">
                  <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
                    <div className="flex items-center gap-2 text-brand-red font-black text-xs uppercase tracking-wider mb-2">
                      <Bell size={14} /> Due Date & Reminders
                    </div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white">Issue Payment Reminder</h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Dispatches a prominent renewal notification banner to this school's billing center and sends an email notification.
                    </p>

                    <div className="mt-4 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 text-xs space-y-2">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Calculated Invoice:</span>
                        <strong className="text-slate-900 dark:text-white font-mono font-black">
                          ₦{totalInstitutionalFee.toLocaleString()}
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Scheduled Due Date:</span>
                        <strong className="text-slate-800 dark:text-slate-200">
                          {nearestDueDate ? new Date(nearestDueDate).toLocaleDateString('en-NG', { dateStyle: 'medium' }) : 'Not Scheduled'}
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Last Reminder Sent:</span>
                        <strong className="text-slate-800 dark:text-slate-200">
                          {billingForm.lastReminderSentAt ? new Date(billingForm.lastReminderSentAt).toLocaleString('en-NG', { dateStyle: 'short', timeStyle: 'short' }) : 'Never'}
                        </strong>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={sendingReminder}
                      onClick={async () => {
                        if (!selectedSchool) return;
                        setSendingReminder(true);
                        try {
                          const nowIso = new Date().toISOString();
                          await billingPost('billing-admin', {
                            action: 'send_payment_reminder',
                            targetType: 'SCHOOL',
                            targetId: selectedSchool.id,
                            recipientId: selectedSchool.adminUid || selectedSchool.id,
                            email: selectedSchool.contactEmail || selectedSchool.email,
                            amount: totalInstitutionalFee,
                            nextDueDate: nearestDueDate,
                            title: `Tuition & Workspace Subscription Due - ${selectedSchool.name}`
                          });

                          setBillingForm(prev => ({ ...prev, lastReminderSentAt: nowIso }));
                          setSchools(prev => prev.map(s => s.id === selectedSchool.id ? {
                            ...s,
                            billing: { ...(s.billing || billingForm), lastReminderSentAt: nowIso }
                          } : s));

                          toast.success(`Payment reminder for ₦${totalInstitutionalFee.toLocaleString()} issued to ${selectedSchool.name}.`);
                        } catch (err) {
                          console.error('Send reminder failed:', err);
                          toast.error(err instanceof Error ? err.message : 'Unable to dispatch payment reminder.');
                        } finally {
                          setSendingReminder(false);
                        }
                      }}
                      className="mt-4 w-full min-h-11 rounded-xl bg-slate-900 hover:bg-black dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-black text-xs inline-flex items-center justify-center gap-2 transition-all shadow-sm"
                    >
                      {sendingReminder ? <Loader2 className="animate-spin" size={16} /> : <Send size={15} />}
                      Issue / Send Payment Reminder (₦{totalInstitutionalFee.toLocaleString()})
                    </button>
                  </div>

                  {/* Verified Transactions */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
                    <h3 className="text-sm font-black text-slate-900 dark:text-white mb-3">Recorded Payment Invoices</h3>
                    {payments.length ? (
                      <div className="space-y-2.5 max-h-60 overflow-y-auto">
                        {payments.map(p => (
                          <div key={p.id} className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 text-xs">
                            <div className="flex justify-between font-bold">
                              <span>{formatNaira(p.customerTotal || p.baseAmount || 0)}</span>
                              <span className="text-emerald-600 font-mono text-[10px] uppercase">{p.status || 'PAID'}</span>
                            </div>
                            <div className="text-[11px] text-slate-400 mt-1">
                              {p.paidAt ? new Date(p.paidAt).toLocaleDateString('en-NG') : 'Recent'} • {p.reference || p.id}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400 text-center py-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                        No recorded payment invoices for this school yet.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* TAB 4: Exam Unlock Passcodes for this School */}
          {activeSchoolTab === 'passcodes' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
                <div>
                  <h2 className="text-base font-black text-slate-900 dark:text-white">Exam Unlock Passcodes</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Generate and manage secure CBT practical exam passcodes specifically for {selectedSchool.name}.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPasscodeModal(true)}
                  className="min-h-11 px-4 rounded-xl bg-brand-red hover:bg-red-700 text-white font-black text-xs inline-flex items-center gap-2 shadow-sm transition-all"
                >
                  <Plus size={16} /> Generate Exam Passcode
                </button>
              </div>

              {/* Passcode Modal */}
              {showPasscodeModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
                  <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-base font-black text-slate-900 dark:text-white">
                        Generate Exam Unlock Passcode
                      </h3>
                      <button
                        type="button"
                        onClick={() => setShowPasscodeModal(false)}
                        className="min-h-9 min-w-9 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
                      >
                        <X size={18} />
                      </button>
                    </div>

                    <form onSubmit={handleCreatePasscode} className="space-y-4">
                      <div>
                        <label className={labelClass}>Exam / Assessment Title</label>
                        <input
                          required
                          value={passcodeForm.examTitle}
                          onChange={e => setPasscodeForm(p => ({ ...p, examTitle: e.target.value }))}
                          placeholder="e.g. Mid-Term Hardware & Electronics Practical Examination"
                          className={inputClass}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={labelClass}>Subject / Track</label>
                          <input
                            value={passcodeForm.subject}
                            onChange={e => setPasscodeForm(p => ({ ...p, subject: e.target.value }))}
                            placeholder="e.g. Hardware & Electronics & IoT"
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>Class / Level</label>
                          <select
                            value={normalizeClassName(passcodeForm.classLevel, 'Grade 7')}
                            onChange={e => setPasscodeForm(p => ({ ...p, classLevel: e.target.value }))}
                            className={inputClass}
                          >
                            {CANONICAL_CLASSES.map(cls => (
                              <option key={cls} value={cls}>{cls}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={labelClass}>Unlock Passcode</label>
                          <div className="flex gap-2">
                            <input
                              required
                              value={passcodeForm.passcode}
                              onChange={e => setPasscodeForm(p => ({ ...p, passcode: e.target.value.toUpperCase() }))}
                              placeholder="e.g. ROBOT-892"
                              className={inputClass}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const generated = `EXAM-${Math.floor(1000 + Math.random() * 9000)}`;
                                setPasscodeForm(p => ({ ...p, passcode: generated }));
                              }}
                              className="px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-[10px] font-black uppercase hover:bg-slate-100"
                            >
                              Auto
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className={labelClass}>Invigilator Name</label>
                          <input
                            value={passcodeForm.invigilatorName}
                            onChange={e => setPasscodeForm(p => ({ ...p, invigilatorName: e.target.value }))}
                            placeholder="e.g. Lead Instructor"
                            className={inputClass}
                          />
                        </div>
                      </div>

                      <div className="flex justify-end gap-3 pt-3">
                        <button
                          type="button"
                          onClick={() => setShowPasscodeModal(false)}
                          className="min-h-10 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={savingAction}
                          className="min-h-10 px-5 rounded-xl bg-brand-red text-white text-xs font-black inline-flex items-center gap-2"
                        >
                          {savingAction ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
                          Create Passcode
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Passcodes Table */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs min-w-[700px]">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-black tracking-wider text-[10px]">
                        <th className="py-3 px-3">Exam Title</th>
                        <th className="py-3 px-3">Subject / Level</th>
                        <th className="py-3 px-3">Passcode</th>
                        <th className="py-3 px-3">Invigilator</th>
                        <th className="py-3 px-3">Status</th>
                        <th className="py-3 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                      {passcodes.length ? (
                        passcodes.map(p => (
                          <tr key={p.id}>
                            <td className="py-3.5 px-3 font-bold text-slate-900 dark:text-white">
                              {p.examTitle}
                            </td>
                            <td className="py-3.5 px-3 text-slate-500">
                              {p.subject || 'Technology'} • {p.classLevel || 'All Levels'}
                            </td>
                            <td className="py-3.5 px-3 font-mono font-black text-brand-red">
                              <span className="bg-red-50 dark:bg-red-950/40 px-2 py-1 rounded-md">
                                {p.passcode}
                              </span>
                            </td>
                            <td className="py-3.5 px-3 text-slate-600 dark:text-slate-400">
                              {p.invigilatorName || 'Assigned Staff'}
                            </td>
                            <td className="py-3.5 px-3">
                              <button
                                type="button"
                                onClick={() => handleTogglePasscode(p.id, p.isActive)}
                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                  p.isActive
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400'
                                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800'
                                }`}
                              >
                                {p.isActive ? 'Active' : 'Inactive'}
                              </button>
                            </td>
                            <td className="py-3.5 px-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleCopy(p.passcode, p.id)}
                                  className="min-h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-bold flex items-center gap-1"
                                >
                                  {copiedId === p.id ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                                  {copiedId === p.id ? 'Copied' : 'Copy'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeletePasscode(p.id)}
                                  className="min-h-8 min-w-8 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-400">
                            No exam passcodes generated for {selectedSchool.name} yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: School Resources & Practical Links */}
          {activeSchoolTab === 'resources' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm">
                <div>
                  <h2 className="text-base font-black text-slate-900 dark:text-white">Curriculum Resources & External Practical Links</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Attach workspace manuals, Google Drive kits, PDF curriculums, and CBT exam interfaces to this school.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowResourceModal(true)}
                  className="min-h-11 px-4 rounded-xl bg-brand-red hover:bg-red-700 text-white font-black text-xs inline-flex items-center gap-2 shadow-sm transition-all"
                >
                  <Plus size={16} /> Add Resource Link
                </button>
              </div>

              {/* Resource Modal */}
              {showResourceModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
                  <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-base font-black text-slate-900 dark:text-white">
                        Add Curriculum Resource Link
                      </h3>
                      <button
                        type="button"
                        onClick={() => setShowResourceModal(false)}
                        className="min-h-9 min-w-9 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
                      >
                        <X size={18} />
                      </button>
                    </div>

                    <form onSubmit={handleCreateResource} className="space-y-4">
                      <div>
                        <label className={labelClass}>Resource Title</label>
                        <input
                          required
                          value={resourceForm.title}
                          onChange={e => setResourceForm(r => ({ ...r, title: e.target.value }))}
                          placeholder="e.g. Primary 5 Hardware & Electronics workspace Guide (Term 2)"
                          className={inputClass}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={labelClass}>Category</label>
                          <select
                            value={resourceForm.category}
                            onChange={e => setResourceForm(r => ({ ...r, category: e.target.value }))}
                            className={inputClass}
                          >
                            <option value="Curriculum & workspace Manual">Curriculum & workspace Manual</option>
                            <option value="CBT Examination Link">CBT Examination Link</option>
                            <option value="Project Assessment Sheet">Project Assessment Sheet</option>
                            <option value="Tutor workspace Presentation">Tutor workspace Presentation</option>
                          </select>
                        </div>
                        <div>
                          <label className={labelClass}>URL Link</label>
                          <input
                            required
                            type="url"
                            value={resourceForm.url}
                            onChange={e => setResourceForm(r => ({ ...r, url: e.target.value }))}
                            placeholder="https://drive.google.com/..."
                            className={inputClass}
                          />
                        </div>
                      </div>

                      <div>
                        <label className={labelClass}>Resource Description</label>
                        <textarea
                          rows={2}
                          value={resourceForm.description}
                          onChange={e => setResourceForm(r => ({ ...r, description: e.target.value }))}
                          placeholder="Short instructional note for students and school staff..."
                          className={inputClass}
                        />
                      </div>

                      <div className="flex justify-end gap-3 pt-3">
                        <button
                          type="button"
                          onClick={() => setShowResourceModal(false)}
                          className="min-h-10 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={savingAction}
                          className="min-h-10 px-5 rounded-xl bg-brand-red text-white text-xs font-black inline-flex items-center gap-2"
                        >
                          {savingAction ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} />}
                          Save Resource
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Resource Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {resources.length ? (
                  resources.map(res => (
                    <div
                      key={res.id}
                      className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-5 shadow-sm flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {res.category || 'Resource'}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteResource(res.id)}
                            className="min-h-8 min-w-8 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <h3 className="font-black text-sm text-slate-900 dark:text-white mt-2">
                          {res.title}
                        </h3>
                        {res.description && (
                          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                            {res.description}
                          </p>
                        )}
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
                        <a
                          href={res.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-black text-brand-red inline-flex items-center gap-1 hover:underline"
                        >
                          Open Resource <ExternalLink size={13} />
                        </a>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-2 py-10 text-center text-slate-400 bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800">
                    No curriculum resources or exam links attached to this school yet.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 6: Enrolled Students Roster */}
          {activeSchoolTab === 'cadets' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h2 className="text-base font-black text-slate-900 dark:text-white">
                    Enrolled Students ({cadets.length})
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Students enrolled under {selectedSchool.name}. These students do not see individual payment fees in their student portals.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[600px]">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-black tracking-wider text-[10px]">
                      <th className="py-3 px-3">Student Name</th>
                      <th className="py-3 px-3">Username / Identifier</th>
                      <th className="py-3 px-3">Class / Level</th>
                      <th className="py-3 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {cadets.length ? (
                      cadets.map(c => (
                        <tr key={c.id}>
                          <td className="py-3.5 px-3 font-bold text-slate-900 dark:text-white">
                            {c.fullName || c.studentName || 'Student'}
                          </td>
                          <td className="py-3.5 px-3 font-mono text-slate-500">
                            {c.username || c.email || c.id}
                          </td>
                          <td className="py-3.5 px-3 text-slate-600 dark:text-slate-400">
                            {formatNormalizedClassDisplay(c.class || c.grade, 'Grade 1')}
                          </td>
                          <td className="py-3.5 px-3">
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40">
                              Active Student
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-400">
                          No students currently enrolled in the roster for this school.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 7: Firestore Live Document Raw Data */}
          {activeSchoolTab === 'raw' && (
            <div className="bg-slate-950 text-slate-200 rounded-3xl p-6 border border-slate-800 font-mono text-xs overflow-x-auto shadow-sm">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                <span className="text-emerald-400 font-bold">Firestore Document: schools/{selectedSchool.id}</span>
                <button
                  type="button"
                  onClick={() => handleCopy(JSON.stringify(selectedSchool, null, 2), 'raw-json')}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 rounded-lg text-[11px] text-white flex items-center gap-1.5"
                >
                  {copiedId === 'raw-json' ? <Check size={12} /> : <Copy size={12} />}
                  Copy JSON
                </button>
              </div>
              <pre className="whitespace-pre-wrap leading-relaxed text-[11px]">
                {JSON.stringify(selectedSchool, null, 2)}
              </pre>
            </div>
          )}
        </div>
      ) : (
        /* View 2: Clean School Directory List View */
        <div className="space-y-6 animate-fadeIn">
          {/* Header & Stats */}
          <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur border border-slate-200/80 dark:border-slate-800 rounded-3xl p-6 md:p-8 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white">
                  Partner Schools
                </h1>
                <p className="text-xs md:text-sm text-slate-500 mt-1 max-w-2xl">
                  Click any affiliated school to manage its undergoing programmes, custom billing fees, payment plans, passcodes, and student roster.
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => void loadSchools()}
                  className="min-h-11 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2 transition-all"
                >
                  <RefreshCw size={14} /> Refresh
                </button>
                <button
                  type="button"
                  onClick={() => setShowOnboardModal(true)}
                  className="min-h-11 px-5 rounded-xl bg-brand-red hover:bg-red-700 text-white font-black text-xs inline-flex items-center gap-2 shadow-sm transition-all"
                >
                  <Plus size={16} /> Onboard New School
                </button>
              </div>
            </div>

            {/* Metric counters */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-100 dark:border-slate-800">
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200/60 dark:border-slate-800">
                <span className="text-slate-500 text-xs block">Total Partner Schools</span>
                <span className="text-2xl font-black text-slate-900 dark:text-white mt-1 block">
                  {totalSchoolsCount}
                </span>
              </div>
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200/60 dark:border-slate-800">
                <span className="text-slate-500 text-xs block">Active Institutional Labs</span>
                <span className="text-2xl font-black text-emerald-600 mt-1 block">
                  {activeSchoolsCount}
                </span>
              </div>
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200/60 dark:border-slate-800">
                <span className="text-slate-500 text-xs block">Total Undergoing Programmes</span>
                <span className="text-2xl font-black text-brand-red mt-1 block">
                  {totalProgramsCount}
                </span>
              </div>
            </div>
          </div>

          {/* Search bar */}
          <div className="flex items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl px-4 py-3 shadow-sm">
            <Search size={18} className="text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search partner schools by name, code, administrator email, or state..."
              className="w-full bg-transparent text-xs font-medium focus:outline-none text-slate-900 dark:text-white"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="text-xs font-bold text-slate-400 hover:text-slate-600"
              >
                Clear
              </button>
            )}
          </div>

          {/* List of Schools */}
          {loading ? (
            <div className="py-16 text-center text-slate-500 text-xs flex items-center justify-center gap-2">
              <Loader2 className="animate-spin" size={18} /> Loading affiliated schools directory...
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSchools.map(school => {
                const programsCount = school.programs?.length || 0;
                const feeAmount = school.billing?.baseAmount;
                const feeCycle = school.billing?.cycle || 'termly';
                const feeMode = school.billing?.mode?.replace('_', ' ') || 'advance termly';

                return (
                  <div
                    key={school.id}
                    onClick={() => setSelectedSchoolId(school.id)}
                    className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-brand-red/50 dark:hover:border-brand-red/50 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-10 min-h-10 rounded-2xl bg-red-50 dark:bg-red-950/40 text-brand-red flex items-center justify-center text-lg">
                          {school.icon || <School size={20} />}
                        </div>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          school.status === 'SUSPENDED'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400'
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400'
                        }`}>
                          {school.status || 'ACTIVE'}
                        </span>
                      </div>

                      <h3 className="text-base font-black text-slate-900 dark:text-white mt-3 group-hover:text-brand-red transition-colors">
                        {school.name}
                      </h3>

                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                        <span className="font-mono font-bold text-brand-red">
                          {school.schoolCode || school.id.toUpperCase()}
                        </span>
                        <span>•</span>
                        <span>{school.state || 'Lagos'}</span>
                      </div>

                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-3 line-clamp-1">
                        Admin: {school.contactEmail || school.email || 'No email set'}
                      </p>
                    </div>

                    <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs">
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                        <span>Undergoing Programmes:</span>
                        <strong className="text-brand-red">{programsCount} Active</strong>
                      </div>
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                        <span>Configured Fee:</span>
                        <strong className="font-black text-slate-900 dark:text-white capitalize">
                          {feeAmount ? `${formatNaira(feeAmount)} / ${feeCycle} (${feeMode})` : 'Default Plan'}
                        </strong>
                      </div>

                      <div className="pt-2 flex items-center justify-between text-xs">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toast.info(`Directly logging into school admin portal for ${school.name}...`);
                            startImpersonation({
                              id: school.id,
                              uid: school.id,
                              name: school.name,
                              email: school.contactEmail || school.email,
                              role: 'SCHOOL',
                              schoolId: school.id,
                              schoolName: school.name,
                              phone: school.phone
                            }, navigate);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-2xs transition-all active:scale-95 cursor-pointer"
                        >
                          <UserCheck size={13} />
                          <span>Log In As</span>
                        </button>

                        <div className="flex items-center font-black text-brand-red group-hover:translate-x-1 transition-transform">
                          Manage Workspace <ChevronRight size={16} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Onboard School Modal */}
          {showOnboardModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
              <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-3xl p-6 md:p-8 shadow-2xl border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="text-lg font-black text-slate-900 dark:text-white">Onboard New Partner School</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Register a new institution, assign its initial programme, and set billing.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowOnboardModal(false)}
                    className="min-h-9 min-w-9 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
                  >
                    <X size={18} />
                  </button>
                </div>

                <form onSubmit={handleOnboardSchool} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>School Name</label>
                      <input
                        required
                        value={onboardForm.name}
                        onChange={e => setOnboardForm(o => ({ ...o, name: e.target.value }))}
                        placeholder="e.g. Apex International School"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>School Code (Optional)</label>
                      <input
                        value={onboardForm.schoolCode}
                        onChange={e => setOnboardForm(o => ({ ...o, schoolCode: e.target.value.toUpperCase() }))}
                        placeholder="e.g. APEX-2026"
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Coordinator / Admin Name</label>
                      <input
                        value={onboardForm.contactName}
                        onChange={e => setOnboardForm(o => ({ ...o, contactName: e.target.value }))}
                        placeholder="e.g. Mrs. Adeleke"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Admin Email</label>
                      <input
                        type="email"
                        required
                        value={onboardForm.contactEmail}
                        onChange={e => setOnboardForm(o => ({ ...o, contactEmail: e.target.value }))}
                        placeholder="admin@apexschool.com"
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Phone</label>
                      <input
                        value={onboardForm.phone}
                        onChange={e => setOnboardForm(o => ({ ...o, phone: e.target.value }))}
                        placeholder="+234..."
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>State</label>
                      <input
                        value={onboardForm.state}
                        onChange={e => setOnboardForm(o => ({ ...o, state: e.target.value }))}
                        placeholder="Lagos"
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800 space-y-3">
                    <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                      Initial Programme & Description
                    </h3>
                    <div>
                      <label className={labelClass}>Programme Title</label>
                      <input
                        value={onboardForm.initialProgramName}
                        onChange={e => setOnboardForm(o => ({ ...o, initialProgramName: e.target.value }))}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Curriculum Scope & Description</label>
                      <textarea
                        rows={2}
                        value={onboardForm.initialProgramDesc}
                        onChange={e => setOnboardForm(o => ({ ...o, initialProgramDesc: e.target.value }))}
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className={labelClass}>Fee Amount (₦)</label>
                      <input
                        type="number"
                        min="0"
                        value={onboardForm.initialFee}
                        onChange={e => setOnboardForm(o => ({ ...o, initialFee: e.target.value }))}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Billing Frequency</label>
                      <select
                        value={onboardForm.cycle}
                        onChange={e => setOnboardForm(o => ({ ...o, cycle: e.target.value as any }))}
                        className={inputClass}
                      >
                        <option value="termly">Termly (12 Weeks)</option>
                        <option value="monthly">Monthly (4 Weeks)</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Payment Mode</label>
                      <select
                        value={onboardForm.mode}
                        onChange={e => setOnboardForm(o => ({ ...o, mode: e.target.value as any }))}
                        className={inputClass}
                      >
                        <option value="advance_termly">Advance Termly</option>
                        <option value="advance_monthly">Advance Monthly</option>
                        <option value="post_termly">Post Termly</option>
                        <option value="post_monthly">Post Monthly</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setShowOnboardModal(false)}
                      className="min-h-11 px-5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={onboardingSaving}
                      className="min-h-11 px-6 rounded-xl bg-brand-red text-white text-xs font-black inline-flex items-center gap-2 shadow-sm"
                    >
                      {onboardingSaving ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
                      Onboard School
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AdminSchools;
