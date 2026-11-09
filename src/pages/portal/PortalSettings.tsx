import React, { useEffect, useMemo, useState } from 'react';
import {
  User,
  Lock,
  Moon,
  Sun,
  Bell,
  Save,
  Contrast,
  KeyRound,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  MessageCircle,
  BookOpen,
  Award,
  FolderTree,
  Plus,
  Send,
  X,
  Check,
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { auth, db } from '../../lib/firebase';
import { sendEmailVerification, updateProfile, updateEmail } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import ChangePasswordModal from '../../components/portal/ChangePasswordModal';
import SEO from '../../components/ui/SEO';
import { checkUsernameAvailability, claimGlobalUsername, normalizeUsername } from '../../lib/usernameRegistry';
import { getEffectiveAuth } from '../../utils/impersonation';
import {
  type ProgramRecord,
  type ProgramNodeType,
  type ProgramDeliveryOption,
  type TutorProgramProposal,
  fetchAllProgramsMap,
  getProgramBreadcrumbs,
  submitTutorProgramProposal,
  fetchTutorProgramProposals,
} from '../../lib/programHierarchy';

type SettingsTab = 'profile' | 'appearance' | 'security' | 'notifications';

interface TeachingProgrammeOption {
  id: string;
  title: string;
  description: string;
  fields: Array<{ id: string; title: string; parentId: string }>;
}

const DEFAULT_PROGRAMME_CATALOG: TeachingProgrammeOption[] = [
  {
    id: 'prog-tech',
    title: 'Technology & Engineering Programme',
    description: 'Software development, robotics, data science, and digital literacy tracks.',
    fields: [
      { id: 'field-web-dev', title: 'Web Development (HTML, CSS, JavaScript & React)', parentId: 'prog-tech' },
      { id: 'field-python-ai', title: 'Python Programming & Artificial Intelligence', parentId: 'prog-tech' },
      { id: 'field-scratch-kids', title: 'Coding for Kids (Scratch & Block Programming)', parentId: 'prog-tech' },
      { id: 'field-robotics-iot', title: 'Robotics, Arduino & Physical Computing', parentId: 'prog-tech' },
      { id: 'field-digital-lit', title: 'Digital Literacy & Computer Fundamentals', parentId: 'prog-tech' },
      { id: 'field-game-dev', title: 'Game Design & Development', parentId: 'prog-tech' },
      { id: 'field-cybersecurity', title: 'Cybersecurity & Online Safety', parentId: 'prog-tech' },
    ],
  },
  {
    id: 'prog-creative',
    title: 'Creative & Design Programme',
    description: 'Visual communication, UI/UX product design, animation, and multimedia.',
    fields: [
      { id: 'field-ui-ux', title: 'UI/UX & Digital Product Design (Figma)', parentId: 'prog-creative' },
      { id: 'field-graphics', title: 'Graphic Design & Visual Branding', parentId: 'prog-creative' },
      { id: 'field-animation', title: '2D/3D Animation & Motion Graphics', parentId: 'prog-creative' },
      { id: 'field-media-prod', title: 'Video Editing & Digital Media Production', parentId: 'prog-creative' },
    ],
  },
  {
    id: 'prog-academics',
    title: 'Core Academics & STEM Programme',
    description: 'Mathematics, sciences, language arts, and examination preparation.',
    fields: [
      { id: 'field-math', title: 'Mathematics & Quantitative Reasoning', parentId: 'prog-academics' },
      { id: 'field-sciences', title: 'Integrated Science, Physics & Chemistry', parentId: 'prog-academics' },
      { id: 'field-english', title: 'English Language, Literacy & Public Speaking', parentId: 'prog-academics' },
      { id: 'field-exam-prep', title: 'STEM Competition & Examination Prep', parentId: 'prog-academics' },
    ],
  },
  {
    id: 'prog-music-arts',
    title: 'Music & Performing Arts Programme',
    description: 'Instrumental training, music theory, vocal coaching, and audio production.',
    fields: [
      { id: 'field-piano-keys', title: 'Piano & Keyboard Performance', parentId: 'prog-music-arts' },
      { id: 'field-guitar-strings', title: 'Guitar, Violin & String Instruments', parentId: 'prog-music-arts' },
      { id: 'field-music-theory', title: 'Music Theory, Ear Training & Composition', parentId: 'prog-music-arts' },
      { id: 'field-audio-prod', title: 'Digital Audio Production & Sound Engineering', parentId: 'prog-music-arts' },
    ],
  },
];

export const PortalSettings: React.FC = () => {
  const location = useLocation();
  const { theme, toggleTheme, isHighContrast, toggleHighContrast } = useTheme();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [role, setRole] = useState('student');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const [smoothAnimations, setSmoothAnimations] = useState(true);
  const [notifSchedules, setNotifSchedules] = useState(true);
  const [notifAnnouncements, setNotifAnnouncements] = useState(true);
  const [notifBilling, setNotifBilling] = useState(true);

  // Tutor "Subjects I Teach" (Programmes & Teaching Fields) State
  const [programsMap, setProgramsMap] = useState<Map<string, ProgramRecord>>(new Map());
  const [selectedProgramIds, setSelectedProgramIds] = useState<string[]>([]);
  const [selectedFieldNames, setSelectedFieldNames] = useState<string[]>([]);
  const [customFieldInput, setCustomFieldInput] = useState('');
  const [proficiencyLevel, setProficiencyLevel] = useState<'Intermediate' | 'Advanced' | 'Expert / Lead'>('Expert / Lead');
  const [savingTeachingConfig, setSavingTeachingConfig] = useState(false);
  const [myProposals, setMyProposals] = useState<TutorProgramProposal[]>([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);

  // Sub-programme Proposal Modal State
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [proposalTitle, setProposalTitle] = useState('');
  const [parentProgramId, setParentProgramId] = useState('');
  const [proposedNodeType] = useState<ProgramNodeType>('ENROLLABLE');
  const [description, setDescription] = useState('');
  const [objectivesText, setObjectivesText] = useState('');
  const [curriculumText, setCurriculumText] = useState('');
  const [prerequisiteIds, setPrerequisiteIds] = useState<string[]>([]);
  const [deliveryOptions] = useState<ProgramDeliveryOption[]>([
    'PUBLIC_GROUP',
    'PRIVATE_MENTORSHIP',
  ]);
  const [duration, setDuration] = useState('8 Weeks');
  const [submittingProposal, setSubmittingProposal] = useState(false);

  const effectiveAuth = getEffectiveAuth();
  const pathRole = location.pathname.split('/')[2] || '';

  useEffect(() => {
    const user = auth.currentUser;
    const resolvedRole =
      pathRole === 'staff' || pathRole === 'school' || pathRole === 'parent' || pathRole === 'student'
        ? pathRole
        : sessionStorage.getItem('userRole') || 'student';
    setRole(resolvedRole);

    const targetUid = effectiveAuth.effectiveUid || user?.uid || sessionStorage.getItem('userId') || '';
    if (!targetUid && !user) return;

    setEmail(effectiveAuth.effectiveEmail || user?.email || '');
    setEmailVerified(Boolean(user?.emailVerified));
    setFullName(effectiveAuth.effectiveName || user?.displayName || sessionStorage.getItem('userName') || '');
    const cachedUsername = sessionStorage.getItem('studentUsername') || '';
    if (cachedUsername) setUsername(normalizeUsername(cachedUsername));

    const loadUserDoc = async () => {
      try {
        if (!targetUid) return;
        const snap = await getDoc(doc(db, 'users', targetUid));
        if (!snap.exists()) return;
        const data = snap.data();
        if (data.name || data.fullName) setFullName(String(data.name || data.fullName));
        if (data.username) setUsername(normalizeUsername(String(data.username)));
        if (data.phone) setPhone(String(data.phone));
        if (data.whatsapp || data.whatsappContact) setWhatsapp(String(data.whatsapp || data.whatsappContact));
        if (Array.isArray(data.teachingProgramIds)) {
          setSelectedProgramIds(data.teachingProgramIds.map(String));
        }
        if (Array.isArray(data.teachingFields)) {
          setSelectedFieldNames(data.teachingFields.map(String));
        } else if (Array.isArray(data.subjects)) {
          setSelectedFieldNames(data.subjects.map(String));
        }
        if (data.proficiencyLevel) {
          setProficiencyLevel(data.proficiencyLevel);
        }
      } catch (error) {
        console.warn('Could not load user profile settings:', error);
      }
    };
    void loadUserDoc();

    if (resolvedRole === 'staff' && targetUid) {
      setLoadingSubjects(true);
      Promise.all([
        getDocs(query(collection(db, 'tutorSubjects'), where('tutorId', '==', targetUid))).catch(() => null),
        fetchAllProgramsMap().catch(() => new Map<string, ProgramRecord>()),
        fetchTutorProgramProposals(targetUid).catch(() => [] as TutorProgramProposal[]),
      ])
        .then(([subSnap, progMap, proposals]) => {
          setProgramsMap(progMap);
          setMyProposals(proposals);
          if (subSnap && subSnap.docs.length > 0) {
            const dbSubjects = subSnap.docs
              .map((d) => d.data())
              .map((d: any) => String(d.subjectName || '').trim())
              .filter(Boolean);
            const dbProgIds = subSnap.docs
              .map((d) => d.data())
              .map((d: any) => String(d.programId || '').trim())
              .filter(Boolean);
            setSelectedFieldNames((prev) => Array.from(new Set([...prev, ...dbSubjects])));
            if (dbProgIds.length > 0) {
              setSelectedProgramIds((prev) => Array.from(new Set([...prev, ...dbProgIds])));
            }
          }
        })
        .finally(() => setLoadingSubjects(false));
    }

    try {
      if (targetUid) {
        setNotifSchedules(localStorage.getItem(`jbs_notif_schedules_${targetUid}`) !== 'false');
        setNotifAnnouncements(localStorage.getItem(`jbs_notif_announcements_${targetUid}`) !== 'false');
        setNotifBilling(localStorage.getItem(`jbs_notif_billing_${targetUid}`) !== 'false');
      }
    } catch {}
  }, [pathRole, effectiveAuth.effectiveUid, effectiveAuth.effectiveEmail, effectiveAuth.effectiveName]);

  // Build dynamic programme & teaching fields catalog combining Firestore hierarchy + default tracks
  const programmeCatalog = useMemo<TeachingProgrammeOption[]>(() => {
    const roots: ProgramRecord[] = [];
    const childrenByParent = new Map<string, ProgramRecord[]>();

    for (const prog of programsMap.values()) {
      if (prog.isArchived) continue;
      if (!prog.parentProgramId) {
        roots.push(prog);
      } else {
        const list = childrenByParent.get(prog.parentProgramId) || [];
        list.push(prog);
        childrenByParent.set(prog.parentProgramId, list);
      }
    }

    if (roots.length === 0) {
      return DEFAULT_PROGRAMME_CATALOG;
    }

    const mappedRoots: TeachingProgrammeOption[] = roots.map((root) => {
      const directChildren = childrenByParent.get(root.id) || [];
      const allDescendants: Array<{ id: string; title: string; parentId: string }> = [];

      const collectDescendants = (parentId: string) => {
        const kids = childrenByParent.get(parentId) || [];
        for (const k of kids) {
          allDescendants.push({ id: k.id, title: k.title, parentId: root.id });
          collectDescendants(k.id);
        }
      };
      collectDescendants(root.id);

      // If a root has no children in Firestore yet, match default fields by title keyword
      if (allDescendants.length === 0 && directChildren.length === 0) {
        const lowerTitle = root.title.toLowerCase();
        const fallbackMatch =
          DEFAULT_PROGRAMME_CATALOG.find(
            (d) =>
              lowerTitle.includes('tech') || lowerTitle.includes('coding')
                ? d.id === 'prog-tech'
                : lowerTitle.includes('creative') || lowerTitle.includes('design')
                ? d.id === 'prog-creative'
                : lowerTitle.includes('music')
                ? d.id === 'prog-music-arts'
                : lowerTitle.includes('academic')
                ? d.id === 'prog-academics'
                : false
          ) || DEFAULT_PROGRAMME_CATALOG[0];

        return {
          id: root.id,
          title: root.title,
          description: root.description || fallbackMatch.description,
          fields: fallbackMatch.fields.map((f) => ({ ...f, parentId: root.id })),
        };
      }

      return {
        id: root.id,
        title: root.title,
        description: root.description || 'Configure the specific fields and courses you teach under this programme.',
        fields: allDescendants,
      };
    });

    // Ensure standard studio programmes are also available if not already represented
    for (const defProg of DEFAULT_PROGRAMME_CATALOG) {
      const alreadyExists = mappedRoots.some(
        (r) =>
          r.id === defProg.id ||
          r.title.toLowerCase() === defProg.title.toLowerCase()
      );
      if (!alreadyExists) {
        mappedRoots.push(defProg);
      }
    }

    return mappedRoots;
  }, [programsMap]);

  const parentOptions = useMemo(() => {
    const list: Array<{ program: ProgramRecord; breadcrumbPath: string }> = [];
    for (const p of programsMap.values()) {
      if (p.isArchived || !p.canContainChildren) continue;
      const crumbs = getProgramBreadcrumbs(p.id, programsMap);
      list.push({
        program: p,
        breadcrumbPath: crumbs.map((c) => c.title).join(' › '),
      });
    }
    return list.sort((a, b) => a.breadcrumbPath.localeCompare(b.breadcrumbPath));
  }, [programsMap]);

  const toggleProgrammeSelection = (progId: string) => {
    setSelectedProgramIds((prev) =>
      prev.includes(progId) ? prev.filter((id) => id !== progId) : [...prev, progId]
    );
  };

  const toggleFieldSelection = (fieldTitle: string, parentProgId?: string) => {
    setSelectedFieldNames((prev) => {
      const exists = prev.includes(fieldTitle);
      const next = exists ? prev.filter((f) => f !== fieldTitle) : [...prev, fieldTitle];
      if (!exists && parentProgId && !selectedProgramIds.includes(parentProgId)) {
        setSelectedProgramIds((p) => [...p, parentProgId]);
      }
      return next;
    });
  };

  const handleAddCustomField = () => {
    const clean = customFieldInput.trim();
    if (!clean) return;
    if (!selectedFieldNames.includes(clean)) {
      setSelectedFieldNames((prev) => [...prev, clean]);
    }
    setCustomFieldInput('');
  };

  const handleSaveTeachingConfiguration = async () => {
    const user = auth.currentUser;
    const targetUid = effectiveAuth.effectiveUid || user?.uid || sessionStorage.getItem('userId') || '';
    if (!targetUid) {
      toast.error('Your tutor session could not be verified.');
      return;
    }

    setSavingTeachingConfig(true);
    try {
      const selectedProgrammeTitles = programmeCatalog
        .filter((p) => selectedProgramIds.includes(p.id))
        .map((p) => p.title);

      // 1. Update tutor's user profile document directly
      await setDoc(
        doc(db, 'users', targetUid),
        {
          teachingProgramIds: selectedProgramIds,
          teachingPrograms: selectedProgrammeTitles,
          teachingFields: selectedFieldNames,
          subjects: selectedFieldNames,
          proficiencyLevel,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      // 2. Sync tutorSubjects collection for compatibility with schedule & curriculum engines
      const existingSnap = await getDocs(
        query(collection(db, 'tutorSubjects'), where('tutorId', '==', targetUid))
      ).catch(() => null);

      if (existingSnap) {
        const existingByName = new Map<string, string>();
        for (const d of existingSnap.docs) {
          const data = d.data() as any;
          const sName = String(data.subjectName || '').trim();
          if (sName) existingByName.set(sName, d.id);
          if (!selectedFieldNames.includes(sName)) {
            await deleteDoc(doc(db, 'tutorSubjects', d.id)).catch(() => undefined);
          }
        }

        for (const fieldName of selectedFieldNames) {
          const parentProg = programmeCatalog.find((p) =>
            p.fields.some((f) => f.title === fieldName)
          );
          const docId =
            existingByName.get(fieldName) ||
            `ts_${targetUid}_${fieldName.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40)}`;
          await setDoc(
            doc(db, 'tutorSubjects', docId),
            {
              tutorId: targetUid,
              tutorName: fullName || user?.displayName || 'Tutor',
              subjectName: fieldName,
              programId: parentProg?.id || selectedProgramIds[0] || '',
              programName: parentProg?.title || selectedProgrammeTitles[0] || 'Academic Programme',
              proficiencyLevel,
              status: 'Active',
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
        }
      }

      toast.success('Your teaching programmes and subject fields have been saved to your profile.');
    } catch (err: any) {
      console.error('Error saving teaching configuration:', err);
      toast.error(err?.message || 'Unable to save teaching programmes and fields.');
    } finally {
      setSavingTeachingConfig(false);
    }
  };

  const handleSubmitProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = auth.currentUser;
    const targetUid = effectiveAuth.effectiveUid || user?.uid || '';
    if (!targetUid || !proposalTitle.trim() || !parentProgramId) return;

    setSubmittingProposal(true);
    try {
      await submitTutorProgramProposal({
        title: proposalTitle.trim(),
        parentProgramId,
        proposedNodeType,
        description: description.trim(),
        learningObjectives: objectivesText
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean),
        curriculum: curriculumText
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean),
        prerequisiteProgramIds: prerequisiteIds,
        deliveryOptions,
        duration,
        sessionsPerWeek: 2,
        sessionDuration: '60 mins',
        isRequired: true,
        tutorUid: targetUid,
        tutorName: fullName || user?.displayName || user?.email || 'Tutor',
        tutorEmail: email || user?.email || '',
        programsMap,
      });

      setShowProposalModal(false);
      setProposalTitle('');
      setDescription('');
      setObjectivesText('');
      setCurriculumText('');
      setPrerequisiteIds([]);
      toast.success(
        'Your nested sub-programme proposal has been submitted to the Administrator for review.'
      );
      const updatedProposals = await fetchTutorProgramProposals(targetUid).catch(() => []);
      setMyProposals(updatedProposals);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to submit sub-programme proposal.');
    } finally {
      setSubmittingProposal(false);
    }
  };

  const handleSaveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    const user = auth.currentUser;
    if (!user) return;
    setSavingProfile(true);
    try {
      const cleanName = fullName.trim();
      const cleanUsername = normalizeUsername(username);
      const cleanEmail = email.trim().toLowerCase();
      const cleanPhone = phone.trim();
      const cleanWhatsapp = whatsapp.trim();
      if (!cleanName || !cleanEmail) throw new Error('Full name and email are required.');
      if (role === 'student' && (cleanUsername.length < 3 || cleanUsername.length > 30)) {
        throw new Error('Student username must be 3–30 characters.');
      }

      const studentDocId = sessionStorage.getItem('studentDocId') || localStorage.getItem('jaystar_cached_student_doc_id') || '';
      const schoolId = sessionStorage.getItem('schoolId') || sessionStorage.getItem('schoolDocId') || (role === 'school' ? user.uid : '');

      if (cleanUsername) {
        const check = await checkUsernameAvailability(cleanUsername, [user.uid, studentDocId, schoolId]);
        if (!check.available) {
          throw new Error(check.reason || `The username "${cleanUsername}" is already taken. Please pick another username.`);
        }
      }

      await updateProfile(user, { displayName: cleanName });
      sessionStorage.setItem('userName', cleanName);

      if (cleanEmail !== (user.email || '').toLowerCase()) {
        try {
          await updateEmail(user, cleanEmail);
        } catch (authError: any) {
          if (authError?.code === 'auth/requires-recent-login') {
            toast.info('Your profile email was saved, but changing the Firebase login email requires a recent sign-in.');
          } else throw authError;
        }
      }

      if (role === 'student' && cleanUsername) {
        if (studentDocId) {
          await updateDoc(doc(db, 'individualStudents', studentDocId), { username: cleanUsername, updatedAt: new Date().toISOString() }).catch(() => undefined);
          await updateDoc(doc(db, 'students', studentDocId), { username: cleanUsername, updatedAt: new Date().toISOString() }).catch(() => undefined);
        }
        sessionStorage.setItem('studentUsername', cleanUsername);
      }

      await updateDoc(doc(db, 'users', user.uid), {
        name: cleanName,
        ...(cleanUsername ? { username: cleanUsername } : {}),
        email: cleanEmail,
        phone: cleanPhone,
        whatsapp: cleanWhatsapp,
        whatsappContact: cleanWhatsapp,
        updatedAt: new Date().toISOString()
      });

      if (cleanUsername) {
        await claimGlobalUsername(cleanUsername, {
          uid: user.uid,
          docId: studentDocId || schoolId || user.uid,
          role: role.toUpperCase(),
          email: cleanEmail,
          name: cleanName,
        });
      }

      if (schoolId) {
        await updateDoc(doc(db, 'schools', schoolId), {
          contactEmail: cleanEmail,
          email: cleanEmail,
          contactName: cleanName,
          ...(cleanUsername ? { username: cleanUsername } : {}),
          phone: cleanPhone,
          whatsapp: cleanWhatsapp,
          updatedAt: new Date().toISOString()
        }).catch(error => console.warn('School profile sync skipped:', error));
      }

      toast.success('Profile details saved successfully.');
    } catch (error: any) {
      console.error('Profile save failed:', error);
      toast.error(error?.message || 'Unable to save profile details.');
    } finally {
      setSavingProfile(false);
    }
  };

  const sendVerification = async () => {
    const user = auth.currentUser;
    if (!user) return;
    setSendingVerification(true);
    try {
      await sendEmailVerification(user);
      toast.success(`Verification email sent to ${user.email}.`);
    } catch (error: any) {
      toast.error(error?.code === 'auth/too-many-requests' ? 'Please wait before requesting another verification email.' : 'Unable to send verification email.');
    } finally {
      setSendingVerification(false);
    }
  };

  const savePreference = (key: string, value: boolean, setter: (value: boolean) => void) => {
    setter(value);
    const uid = auth.currentUser?.uid;
    if (uid) localStorage.setItem(`jbs_${key}_${uid}`, String(value));
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">
      <SEO title="Account Preferences & Settings | Jaystarbliss Studios" description="Manage your portal profile, teaching programmes, appearance, security and notifications." noindex />

      <div className="flex items-center gap-1.5 border-b border-slate-200/80 dark:border-slate-800 pb-3 overflow-x-auto scrollbar-none">
        {([
          ['profile', role === 'staff' ? 'Tutor Profile & Subjects I Teach' : 'Profile & Account', User],
          ['appearance', 'Appearance & Theme', Sun],
          ['security', 'Security & Password', Lock],
          ['notifications', 'Notifications', Bell]
        ] as const).map(([id, label, Icon]) => (
          <button key={id} type="button" onClick={() => setActiveTab(id)} className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-2 transition-all cursor-pointer ${activeTab === id ? 'bg-brand-red text-white shadow-xs' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-800 hover:border-brand-red/40'}`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {activeTab === 'profile' && (
        <div className="space-y-6">
          <form onSubmit={handleSaveProfile} className="space-y-6">
            <section className="bg-white dark:bg-[#161B26] rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-6 shadow-xs space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 gap-4">
                <div><h2 className="text-base font-bold text-slate-900 dark:text-white">Profile Details</h2><p className="text-xs text-slate-500">Your contact information used across the portal.</p></div>
                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 capitalize">{role === 'staff' ? 'Tutor' : role}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <label className="block"><span className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider">Full Name</span><input required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-red" /></label>
                {role === 'student' && <label className="block"><span className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider">Student Username</span><input required minLength={3} maxLength={30} value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))} placeholder="your_username" className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-red" /><span className="block mt-1 text-[10px] text-slate-500">Use this username with your student access code.</span></label>}
                <label className="block"><span className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider">Email Address</span><input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-red" /></label>
                <label className="block"><span className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider flex items-center gap-1.5"><Smartphone size={13} /> Phone Number</span><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+234 800 000 0000" className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-red" /></label>
                <label className="block"><span className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider flex items-center gap-1.5"><MessageCircle size={13} /> WhatsApp Contact</span><input type="tel" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="+234 800 000 0000" className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-red" /></label>
              </div>

              <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3"><div className={`mt-0.5 ${emailVerified ? 'text-blue-600' : 'text-amber-500'}`}>{emailVerified ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}</div><div><p className="text-xs font-black text-slate-900 dark:text-white">Email verification</p><p className="text-[11px] text-slate-500">{emailVerified ? 'Your authentication email is verified.' : 'Verify your email to keep account recovery available.'}</p></div></div>
                {!emailVerified && <button type="button" disabled={sendingVerification} onClick={() => void sendVerification()} className="min-h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black disabled:opacity-50 cursor-pointer">{sendingVerification ? 'Sending...' : 'Send Verification'}</button>}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button type="button" onClick={() => setShowPasswordModal(true)} className="px-4 py-2.5 bg-brand-red hover:bg-red-700 text-white font-bold text-xs rounded-xl flex items-center gap-2 cursor-pointer transition-colors"><KeyRound size={13} /> Change Password</button>
                <button type="submit" disabled={savingProfile} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-xs flex items-center gap-2 disabled:opacity-50 transition-colors cursor-pointer">{savingProfile ? <><RefreshCw size={13} className="animate-spin" /> Saving...</> : <><Save size={13} /> Save Profile Details</>}</button>
              </div>
            </section>
          </form>

          {/* TUTOR PROFILE: SUBJECTS I TEACH — PROGRAMMES & TEACHING FIELDS CONFIGURATION */}
          {role === 'staff' && (
            <section
              id="subjects-i-teach"
              className="bg-white dark:bg-[#161B26] rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-6 shadow-xs space-y-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <BookOpen size={18} className="text-brand-red" />
                    <h2 className="text-base font-black text-slate-900 dark:text-white">
                      Subjects I Teach — Programmes &amp; Teaching Fields
                    </h2>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Select one or more programmes you teach under and configure the specific subject fields and tracks for your tutor profile.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      if (!parentProgramId && parentOptions.length > 0) {
                        setParentProgramId(parentOptions[0].program.id);
                      }
                      setShowProposalModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-brand-red hover:bg-red-700 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>Propose Sub-Programme</span>
                  </button>
                  <button
                    type="button"
                    disabled={savingTeachingConfig}
                    onClick={() => void handleSaveTeachingConfiguration()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {savingTeachingConfig ? (
                      <>
                        <RefreshCw size={13} className="animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Save size={13} />
                        <span>Save Programmes &amp; Fields</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {loadingSubjects ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  Loading programmes and teaching fields…
                </div>
              ) : (
                <>
                  {/* Step 1: Select One or More Programmes */}
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                          1. Select Programmes You Teach Under ({selectedProgramIds.length} Selected)
                        </h3>
                        <p className="text-[11px] text-slate-500">
                          Click one or more programmes below to enable and configure their teaching fields.
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                          Proficiency Level:
                        </label>
                        <select
                          value={proficiencyLevel}
                          onChange={(e) => setProficiencyLevel(e.target.value as any)}
                          className="h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 text-xs font-bold text-slate-800 dark:text-slate-200"
                        >
                          <option value="Intermediate">Intermediate</option>
                          <option value="Advanced">Advanced</option>
                          <option value="Expert / Lead">Expert / Lead</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {programmeCatalog.map((prog) => {
                        const isSelected = selectedProgramIds.includes(prog.id);
                        const activeFieldsInProg = prog.fields.filter((f) =>
                          selectedFieldNames.includes(f.title)
                        ).length;

                        return (
                          <button
                            key={prog.id}
                            type="button"
                            onClick={() => toggleProgrammeSelection(prog.id)}
                            className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex items-start justify-between gap-3 ${
                              isSelected
                                ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30 ring-2 ring-blue-500/15'
                                : 'border-slate-200 dark:border-slate-800 hover:border-blue-400 bg-white dark:bg-slate-900'
                            }`}
                          >
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`w-5 h-5 rounded-md flex items-center justify-center text-xs font-bold shrink-0 ${
                                    isSelected
                                      ? 'bg-blue-600 text-white'
                                      : 'border border-slate-300 dark:border-slate-700 text-transparent'
                                  }`}
                                >
                                  <Check size={12} />
                                </span>
                                <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-white truncate">
                                  {prog.title}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 line-clamp-2 pl-7">
                                {prog.description}
                              </p>
                            </div>
                            <span
                              className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-black ${
                                activeFieldsInProg > 0
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              {activeFieldsInProg}/{prog.fields.length} fields
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Step 2: Configure Specific Teaching Fields Under Selected Programmes */}
                  <div className="space-y-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <div>
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                        2. Configure Specific Teaching Fields &amp; Subjects ({selectedFieldNames.length} Active)
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Select the specific fields, courses, or modules you teach under your chosen programmes.
                      </p>
                    </div>

                    {programmeCatalog
                      .filter(
                        (prog) =>
                          selectedProgramIds.length === 0 || selectedProgramIds.includes(prog.id)
                      )
                      .map((prog) => (
                        <div
                          key={prog.id}
                          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/50 p-4 space-y-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                              <Award size={14} className="text-blue-600" />
                              {prog.title}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                const allTitles = prog.fields.map((f) => f.title);
                                const allSelected = allTitles.every((t) =>
                                  selectedFieldNames.includes(t)
                                );
                                if (allSelected) {
                                  setSelectedFieldNames((prev) =>
                                    prev.filter((f) => !allTitles.includes(f))
                                  );
                                } else {
                                  setSelectedFieldNames((prev) =>
                                    Array.from(new Set([...prev, ...allTitles]))
                                  );
                                  if (!selectedProgramIds.includes(prog.id)) {
                                    setSelectedProgramIds((prev) => [...prev, prog.id]);
                                  }
                                }
                              }}
                              className="text-[11px] font-bold text-blue-600 hover:underline cursor-pointer"
                            >
                              Toggle All in Programme
                            </button>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {prog.fields.map((field) => {
                              const active = selectedFieldNames.includes(field.title);
                              return (
                                <button
                                  key={field.id}
                                  type="button"
                                  onClick={() => toggleFieldSelection(field.title, prog.id)}
                                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                                    active
                                      ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-blue-400'
                                  }`}
                                >
                                  {active && <Check size={12} />}
                                  <span>{field.title}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}

                    {/* Add Custom Specialty Field */}
                    <div className="flex flex-col sm:flex-row gap-2 pt-1">
                      <input
                        type="text"
                        value={customFieldInput}
                        onChange={(e) => setCustomFieldInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCustomField();
                          }
                        }}
                        placeholder="Add another teaching field or specialization (e.g. Data Analysis with PowerBI)..."
                        className="flex-1 h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 text-xs text-slate-900 dark:text-white outline-none focus:border-blue-600"
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomField}
                        className="h-10 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 shrink-0 cursor-pointer transition-colors"
                      >
                        <Plus size={14} /> Add Teaching Field
                      </button>
                    </div>

                    {/* Active Configured Fields Summary */}
                    {selectedFieldNames.length > 0 && (
                      <div className="rounded-2xl border border-blue-200/70 dark:border-blue-900/50 bg-blue-50/40 dark:bg-blue-950/20 p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-black uppercase tracking-wider text-blue-800 dark:text-blue-300">
                            Active Teaching Fields on Your Profile ({selectedFieldNames.length})
                          </span>
                          <span className="text-[11px] font-bold text-slate-500">
                            Proficiency: {proficiencyLevel}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedFieldNames.map((fieldName) => (
                            <span
                              key={fieldName}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-800 text-xs font-bold text-slate-800 dark:text-slate-200"
                            >
                              <span>{fieldName}</span>
                              <button
                                type="button"
                                onClick={() => toggleFieldSelection(fieldName)}
                                className="text-slate-400 hover:text-brand-red cursor-pointer"
                                title="Remove field"
                              >
                                <X size={12} />
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Step 3: My Proposed Nested Sub-Programmes */}
                  {myProposals.length > 0 && (
                    <div className="space-y-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <FolderTree size={14} className="text-brand-red" />
                        <span>Submitted Sub-Programme Proposals ({myProposals.length})</span>
                      </h3>
                      <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                        {myProposals.map((prop) => (
                          <div
                            key={prop.id}
                            className="p-3.5 bg-white dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-black text-slate-900 dark:text-white">
                                  {prop.title}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                                    prop.status === 'APPROVED'
                                      ? 'bg-blue-100 text-blue-800'
                                      : prop.status === 'REJECTED'
                                      ? 'bg-red-100 text-red-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  {prop.status}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                {prop.parentBreadcrumbPath} › {prop.title}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          )}
        </div>
      )}

      {activeTab === 'appearance' && (
        <section className="bg-white dark:bg-[#161B26] rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-6 shadow-xs space-y-6">
          <div><h2 className="text-base font-bold text-slate-900 dark:text-white">Interface &amp; Visual Theme</h2><p className="text-xs text-slate-500">Choose the portal appearance that is easiest for you to use.</p></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
            <button type="button" onClick={() => { if (theme === 'dark') toggleTheme(); }} className={`p-4 rounded-2xl border text-left flex items-center gap-3 cursor-pointer ${theme === 'light' ? 'border-brand-red bg-brand-red/5' : 'border-slate-200 dark:border-slate-800'}`}><Sun size={18} /><div><p className="text-xs font-black">Light Mode</p><p className="text-[10px] text-slate-500">Bright, high-clarity workspace</p></div></button>
            <button type="button" onClick={() => { if (theme === 'light') toggleTheme(); }} className={`p-4 rounded-2xl border text-left flex items-center gap-3 cursor-pointer ${theme === 'dark' ? 'border-brand-red bg-brand-red/5' : 'border-slate-200 dark:border-slate-800'}`}><Moon size={18} /><div><p className="text-xs font-black">Dark Mode</p><p className="text-[10px] text-slate-500">Low-glare workspace</p></div></button>
          </div>
          <button type="button" onClick={toggleHighContrast} className={`w-full max-w-xl p-4 rounded-2xl border text-left flex items-center justify-between gap-4 cursor-pointer ${isHighContrast ? 'border-brand-red bg-brand-red/5' : 'border-slate-200 dark:border-slate-800'}`}><span className="flex items-center gap-3"><Contrast size={18} /><span><span className="block text-xs font-black">Enhanced Contrast</span><span className="block text-[10px] text-slate-500">Strengthen text and surface separation.</span></span></span><span className="text-[10px] font-black uppercase">{isHighContrast ? 'On' : 'Off'}</span></button>
          <label className="flex items-center justify-between gap-4 max-w-xl p-4 rounded-2xl border border-slate-200 dark:border-slate-800"><span><span className="block text-xs font-black">Compact layout</span><span className="block text-[10px] text-slate-500">Reduce spacing in dense portal views.</span></span><input type="checkbox" checked={compactMode} onChange={e => setCompactMode(e.target.checked)} /></label>
          <label className="flex items-center justify-between gap-4 max-w-xl p-4 rounded-2xl border border-slate-200 dark:border-slate-800"><span><span className="block text-xs font-black">Smooth animations</span><span className="block text-[10px] text-slate-500">Keep sidebar and page transitions enabled.</span></span><input type="checkbox" checked={smoothAnimations} onChange={e => setSmoothAnimations(e.target.checked)} /></label>
        </section>
      )}

      {activeTab === 'security' && (
        <section className="bg-white dark:bg-[#161B26] rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-6 shadow-xs space-y-5">
          <div><h2 className="text-base font-bold text-slate-900 dark:text-white">Security &amp; Password</h2><p className="text-xs text-slate-500">Manage the credentials used to access your portal.</p></div>
          <button type="button" onClick={() => setShowPasswordModal(true)} className="w-full sm:w-auto px-5 py-3 rounded-xl bg-brand-red hover:bg-red-700 text-white text-xs font-black inline-flex items-center justify-center gap-2 cursor-pointer"><KeyRound size={14} /> Change Account Password</button>
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40"><p className="text-xs font-black">Account email</p><p className="text-xs text-slate-500 mt-1">{email || 'Not available'}</p></div>
        </section>
      )}

      {activeTab === 'notifications' && (
        <section className="bg-white dark:bg-[#161B26] rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-6 shadow-xs space-y-3">
          <div className="mb-4"><h2 className="text-base font-bold text-slate-900 dark:text-white">Notification Preferences</h2><p className="text-xs text-slate-500">Choose the categories of portal notifications you want to receive.</p></div>
          {([
            ['Schedules & Classes', 'jbs_notif_schedules', notifSchedules, setNotifSchedules],
            ['Announcements', 'jbs_notif_announcements', notifAnnouncements, setNotifAnnouncements],
            ['Billing & Payments', 'jbs_notif_billing', notifBilling, setNotifBilling]
          ] as const).map(([label, key, value, setter]) => <label key={key} className="flex items-center justify-between gap-4 p-4 rounded-2xl border border-slate-200 dark:border-slate-800"><span className="text-xs font-black">{label}</span><input type="checkbox" checked={value} onChange={e => savePreference(key.replace(/^jbs_/, ''), e.target.checked, setter)} /></label>)}
        </section>
      )}

      {/* Proposal Modal for Nested Sub-Programme */}
      {showProposalModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitProposal}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-xl w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <FolderTree size={18} className="text-brand-red" />
                  <span>Propose Nested Sub-Programme</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Propose a new learning unit beneath any existing programme branch for administrator approval.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowProposalModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Parent Programme Branch *
              </label>
              <select
                required
                value={parentProgramId}
                onChange={(e) => setParentProgramId(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium bg-white dark:bg-slate-800 dark:text-white"
              >
                <option value="">Select Parent Programme...</option>
                {parentOptions.map((opt) => (
                  <option key={opt.program.id} value={opt.program.id}>
                    {opt.breadcrumbPath}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Proposed Sub-Programme Title *
                </label>
                <input
                  type="text"
                  required
                  value={proposalTitle}
                  onChange={(e) => setProposalTitle(e.target.value)}
                  placeholder="e.g. TypeScript Fundamentals"
                  className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Suggested Duration
                </label>
                <input
                  type="text"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="e.g. 6 Weeks"
                  className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Description &amp; Rationale *
              </label>
              <textarea
                rows={2}
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Explain what this sub-programme covers and how it benefits learners..."
                className="w-full p-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-xs dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Learning Objectives (1 per line)
                </label>
                <textarea
                  rows={3}
                  value={objectivesText}
                  onChange={(e) => setObjectivesText(e.target.value)}
                  placeholder={'Understand static types\nBuild reusable interfaces'}
                  className="w-full p-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-xs dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Suggested Lesson Outline (1 per line)
                </label>
                <textarea
                  rows={3}
                  value={curriculumText}
                  onChange={(e) => setCurriculumText(e.target.value)}
                  placeholder={'Week 1: Type Annotations\nWeek 2: Generics & Utility Types'}
                  className="w-full p-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-xs dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowProposalModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingProposal}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-brand-red text-white text-xs font-bold hover:bg-red-700 disabled:opacity-50 cursor-pointer"
              >
                <Send size={13} />
                <span>{submittingProposal ? 'Submitting...' : 'Submit for Approval'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      <ChangePasswordModal isOpen={showPasswordModal} onClose={() => setShowPasswordModal(false)} />
    </div>
  );
};

export default PortalSettings;
