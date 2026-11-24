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
  Camera,
  Upload,
  Settings,
  Palette,
  ShieldCheck,
  Mail,
  Phone,
  ArrowRight,
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
import { uploadImageToCloudinary } from '../../lib/cloudinary';
import { isValidTutorPhotoUrl } from '../../lib/tutorDirectory';
import {
  type ProgramRecord,
  type ProgramNodeType,
  type ProgramDeliveryOption,
  type TutorProgramProposal,
  PRIMARY_PROGRAM_ROOTS,
  fetchAllProgramsMap,
  getProgramBreadcrumbs,
  resolveProgramCanonicalRoot,
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
  const [photoURL, setPhotoURL] = useState('');
  const [isSchoolOnboardedStudent, setIsSchoolOnboardedStudent] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
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
        : (effectiveAuth.effectiveRole || sessionStorage.getItem('userRole') || 'student').toLowerCase();
    setRole(resolvedRole);

    const isMasquerading = effectiveAuth.isMasquerading;
    const targetUid = isMasquerading
      ? effectiveAuth.effectiveUid
      : effectiveAuth.effectiveUid || user?.uid || sessionStorage.getItem('userId') || '';
    if (!targetUid && !user) return;

    // Reset role-specific profile state before hydrating target identity
    setUsername('');
    setPhone('');
    setWhatsapp('');
    setPhotoURL('');

    setEmail(
      isMasquerading
        ? effectiveAuth.effectiveEmail || ''
        : effectiveAuth.effectiveEmail || user?.email || ''
    );
    setEmailVerified(isMasquerading ? true : Boolean(user?.emailVerified));
    setFullName(
      isMasquerading
        ? effectiveAuth.effectiveName || ''
        : effectiveAuth.effectiveName || user?.displayName || sessionStorage.getItem('userName') || ''
    );

    if (resolvedRole === 'student' && !isMasquerading) {
      const cachedUsername = sessionStorage.getItem('studentUsername') || '';
      if (cachedUsername) setUsername(normalizeUsername(cachedUsername));
    }

    const loadUserDoc = async () => {
      try {
        // Reset role-specific profile state before hydrating target identity
        setIsSchoolOnboardedStudent(false);
        let detectedStudentSchoolId = '';
        let detectedPersonalPhoto = '';

        // 1. Load from users/{targetUid} ONLY if not masquerading as Super Admin's own UID
        if (targetUid && (!isMasquerading || targetUid !== user?.uid)) {
          const snap = await getDoc(doc(db, 'users', targetUid)).catch(() => null);
          if (snap?.exists()) {
            const data = snap.data();
            if (data.name || data.fullName) setFullName(String(data.name || data.fullName));
            if (resolvedRole === 'student' && data.username) {
              setUsername(normalizeUsername(String(data.username)));
            }
            if (data.email) setEmail(String(data.email));
            if (data.phone) setPhone(String(data.phone));
            if (data.whatsapp || data.whatsappContact) {
              setWhatsapp(String(data.whatsapp || data.whatsappContact));
            }
            if (data.schoolId) {
              detectedStudentSchoolId = String(data.schoolId).trim();
            }
            if (data.photoURL || data.photoUrl) {
              detectedPersonalPhoto = String(data.photoURL || data.photoUrl);
              if (resolvedRole !== 'student') {
                setPhotoURL(detectedPersonalPhoto);
              }
            } else if (!isMasquerading && user?.photoURL && resolvedRole !== 'student') {
              setPhotoURL(user.photoURL);
            }
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
          }
        }

        // 2. When role === 'school', load authoritative school record from schools/{schoolId}
        if (resolvedRole === 'school') {
          const lookupSchoolId =
            effectiveAuth.effectiveSchoolId ||
            (!isMasquerading ? sessionStorage.getItem('schoolId') || '' : '') ||
            targetUid;
          if (lookupSchoolId) {
            const schoolSnap = await getDoc(doc(db, 'schools', lookupSchoolId)).catch(() => null);
            if (schoolSnap?.exists()) {
              const sData = schoolSnap.data();
              if (sData.name || sData.schoolName || sData.contactName) {
                setFullName(String(sData.name || sData.schoolName || sData.contactName));
              }
              if (sData.contactEmail || sData.email) {
                setEmail(String(sData.contactEmail || sData.email));
              }
              if (sData.phone || sData.contactPhone) {
                setPhone(String(sData.phone || sData.contactPhone));
              }
              if (sData.whatsapp || sData.whatsappContact) {
                setWhatsapp(String(sData.whatsapp || sData.whatsappContact));
              }
              if (sData.logoUrl || sData.photoURL || sData.avatarUrl) {
                setPhotoURL(String(sData.logoUrl || sData.photoURL || sData.avatarUrl));
              }
            }
          }
        }

        // 3. When role === 'student', load authoritative student record from individualStudents / students
        if (resolvedRole === 'student') {
          const lookupStudentId =
            effectiveAuth.effectiveStudentDocId ||
            (!isMasquerading
              ? sessionStorage.getItem('studentDocId') ||
                localStorage.getItem('jaystar_cached_student_doc_id') ||
                ''
              : '') ||
            targetUid;
          let foundInStudentsCol = false;
          if (lookupStudentId) {
            for (const colName of ['students', 'individualStudents'] as const) {
              const sSnap = await getDoc(doc(db, colName, lookupStudentId)).catch(() => null);
              if (sSnap?.exists()) {
                const sData = sSnap.data();
                if (colName === 'students') foundInStudentsCol = true;
                if (sData.fullName || sData.name) {
                  setFullName(String(sData.fullName || sData.name));
                }
                if (sData.username) {
                  setUsername(normalizeUsername(String(sData.username)));
                }
                if (sData.email) {
                  setEmail(String(sData.email));
                }
                if (sData.phone) {
                  setPhone(String(sData.phone));
                }
                if (sData.whatsapp || sData.whatsappContact) {
                  setWhatsapp(String(sData.whatsapp || sData.whatsappContact));
                }
                if (sData.schoolId) {
                  detectedStudentSchoolId = String(sData.schoolId).trim();
                }
                if (sData.photoURL || sData.avatarUrl) {
                  detectedPersonalPhoto = String(sData.photoURL || sData.avatarUrl);
                }
                break;
              }
            }
          }

          const resolvedStudentSchoolId =
            detectedStudentSchoolId ||
            effectiveAuth.effectiveSchoolId ||
            (!isMasquerading ? sessionStorage.getItem('schoolId') || '' : '');
          const regType = !isMasquerading ? sessionStorage.getItem('studentRegistrationType') || '' : '';
          const schoolOnboarded =
            foundInStudentsCol ||
            regType === 'school' ||
            (Boolean(resolvedStudentSchoolId) &&
              resolvedStudentSchoolId.toLowerCase() !== 'private');

          setIsSchoolOnboardedStudent(schoolOnboarded);

          if (schoolOnboarded) {
            if (resolvedStudentSchoolId && resolvedStudentSchoolId.toLowerCase() !== 'private') {
              const schoolSnap = await getDoc(doc(db, 'schools', resolvedStudentSchoolId)).catch(
                () => null
              );
              if (schoolSnap?.exists()) {
                const scData = schoolSnap.data();
                const schoolAvatar = String(
                  scData.logoUrl || scData.photoURL || scData.avatarUrl || ''
                ).trim();
                setPhotoURL(schoolAvatar);
              } else {
                setPhotoURL('');
              }
            } else {
              setPhotoURL('');
            }
          } else {
            setPhotoURL(detectedPersonalPhoto || (!isMasquerading && user?.photoURL ? user.photoURL : ''));
          }
        }

        // 4. When role === 'staff', also check tutors/{targetUid}
        if (resolvedRole === 'staff' && targetUid) {
          const tutorSnap = await getDoc(doc(db, 'tutors', targetUid)).catch(() => null);
          if (tutorSnap && tutorSnap.exists()) {
            const tData = tutorSnap.data();
            if (tData.name || tData.fullName) {
              setFullName(String(tData.name || tData.fullName));
            }
            if (tData.email) {
              setEmail(String(tData.email));
            }
            if (tData.phone) {
              setPhone(String(tData.phone));
            }
            if (tData.photoURL && isValidTutorPhotoUrl(tData.photoURL)) {
              setPhotoURL(String(tData.photoURL));
            }
          }
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
  }, [
    pathRole,
    effectiveAuth.isMasquerading,
    effectiveAuth.effectiveRole,
    effectiveAuth.effectiveUid,
    effectiveAuth.effectiveSchoolId,
    effectiveAuth.effectiveStudentDocId,
    effectiveAuth.effectiveEmail,
    effectiveAuth.effectiveName,
  ]);

  // Build dynamic programme & teaching fields catalog strictly from real Firestore records
  const programmeCatalog = useMemo<TeachingProgrammeOption[]>(() => {
    const activePrograms = Array.from(programsMap.values()).filter((p) => !p.isArchived);
    if (activePrograms.length === 0) {
      return [];
    }

    const groupedByRoot = new Map<
      string,
      {
        id: string;
        title: string;
        description: string;
        fields: Array<{ id: string; title: string; parentId: string }>;
      }
    >();

    // Register real Firestore root documents first
    for (const rootDef of PRIMARY_PROGRAM_ROOTS) {
      const firestoreRoot = activePrograms.find(
        (p) =>
          p.id === rootDef.canonicalId ||
          p.primaryRootKey === rootDef.key ||
          (p.isPrimaryRoot &&
            p.title.trim().toLowerCase() === rootDef.title.toLowerCase())
      );
      if (firestoreRoot) {
        groupedByRoot.set(rootDef.key, {
          id: firestoreRoot.id,
          title: firestoreRoot.title,
          description: firestoreRoot.shortDescription || rootDef.shortDescription,
          fields: [],
        });
      }
    }

    // Attach every non-root active Firestore programme to its resolved canonical root
    for (const prog of activePrograms) {
      const resolution = resolveProgramCanonicalRoot(prog, programsMap);
      if (!resolution.rootKey || !resolution.rootDefinition) continue;
      const rootDef = resolution.rootDefinition;
      const isRootItself =
        prog.isPrimaryRoot ||
        prog.id === rootDef.canonicalId ||
        (!prog.parentProgramId && prog.primaryRootKey === rootDef.key);

      if (!groupedByRoot.has(rootDef.key)) {
        groupedByRoot.set(rootDef.key, {
          id: resolution.rootProgram?.id || rootDef.canonicalId,
          title: resolution.rootProgram?.title || rootDef.title,
          description:
            resolution.rootProgram?.shortDescription || rootDef.shortDescription,
          fields: [],
        });
      }

      if (!isRootItself) {
        const entry = groupedByRoot.get(rootDef.key)!;
        if (!entry.fields.some((f) => f.id === prog.id)) {
          entry.fields.push({
            id: prog.id,
            title: prog.title,
            parentId: entry.id,
          });
        }
      }
    }

    return PRIMARY_PROGRAM_ROOTS.map((r) => groupedByRoot.get(r.key))
      .filter((item): item is TeachingProgrammeOption => Boolean(item))
      .map((group) => ({
        ...group,
        fields: group.fields.sort((a, b) => a.title.localeCompare(b.title)),
      }));
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

  const handleTutorPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (role === 'student' && isSchoolOnboardedStudent) {
      toast.info('School-onboarded student profiles automatically use your school profile picture or your name initial.');
      e.target.value = '';
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload a valid image file (JPG, PNG, or WEBP).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Profile photograph must be smaller than 5 MB.');
      return;
    }
    setUploadingPhoto(true);
    try {
      const uploaded = await uploadImageToCloudinary(file);
      const secureUrl = uploaded.secureUrl || uploaded.url;
      setPhotoURL(secureUrl);

      const user = auth.currentUser;
      const isMasquerading = effectiveAuth.isMasquerading;
      const targetUid = isMasquerading ? effectiveAuth.effectiveUid : user?.uid || '';

      if (user && !isMasquerading) {
        await updateProfile(user, { photoURL: secureUrl }).catch(() => undefined);
      }
      if (targetUid && (!isMasquerading || targetUid !== user?.uid)) {
        await setDoc(
          doc(db, 'users', targetUid),
          { photoURL: secureUrl, updatedAt: new Date().toISOString() },
          { merge: true }
        ).catch(() => undefined);
      }
      if (role === 'staff' && targetUid) {
        await setDoc(
          doc(db, 'tutors', targetUid),
          { photoURL: secureUrl, updatedAt: new Date().toISOString() },
          { merge: true }
        ).catch(() => undefined);
      }
      if (role === 'school' && effectiveAuth.effectiveSchoolId) {
        await setDoc(
          doc(db, 'schools', effectiveAuth.effectiveSchoolId),
          { logoUrl: secureUrl, photoURL: secureUrl, updatedAt: new Date().toISOString() },
          { merge: true }
        ).catch(() => undefined);
      }
      toast.success('Profile photograph updated successfully.');
    } catch (err: any) {
      console.error('Tutor photo upload failed:', err);
      toast.error(err?.message || 'Unable to upload profile photograph. Please try again.');
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const handleSaveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    const user = auth.currentUser;
    if (!user) return;
    setSavingProfile(true);
    try {
      const isMasquerading = effectiveAuth.isMasquerading;
      const targetUid = isMasquerading ? effectiveAuth.effectiveUid : user.uid;
      const cleanName = fullName.trim();
      const cleanUsername = role === 'student' ? normalizeUsername(username) : '';
      const cleanEmail = email.trim().toLowerCase();
      const cleanPhone = phone.trim();
      const cleanWhatsapp = whatsapp.trim();
      const cleanPhoto = photoURL.trim();
      if (!cleanName || !cleanEmail) throw new Error('Full name and email are required.');
      if (role === 'student' && (cleanUsername.length < 3 || cleanUsername.length > 30)) {
        throw new Error('Student username must be 3–30 characters.');
      }

      const studentDocId =
        role === 'student'
          ? isMasquerading
            ? effectiveAuth.effectiveStudentDocId
            : effectiveAuth.effectiveStudentDocId ||
              sessionStorage.getItem('studentDocId') ||
              localStorage.getItem('jaystar_cached_student_doc_id') ||
              ''
          : '';
      const schoolId =
        role === 'school'
          ? isMasquerading
            ? effectiveAuth.effectiveSchoolId || targetUid
            : effectiveAuth.effectiveSchoolId ||
              sessionStorage.getItem('schoolId') ||
              sessionStorage.getItem('schoolDocId') ||
              user.uid
          : '';

      if (role === 'student' && cleanUsername) {
        const check = await checkUsernameAvailability(
          cleanUsername,
          [targetUid, studentDocId, schoolId].filter(Boolean)
        );
        if (!check.available) {
          throw new Error(check.reason || `The username "${cleanUsername}" is already taken. Please pick another username.`);
        }
      }

      // Only mutate Firebase Auth user profile when NOT masquerading
      if (!isMasquerading) {
        await updateProfile(user, {
          displayName: cleanName,
          ...(!(role === 'student' && isSchoolOnboardedStudent) && isValidTutorPhotoUrl(cleanPhoto)
            ? { photoURL: cleanPhoto }
            : {}),
        });

        if (cleanEmail !== (user.email || '').toLowerCase()) {
          try {
            await updateEmail(user, cleanEmail);
          } catch (authError: any) {
            if (authError?.code === 'auth/requires-recent-login') {
              toast.info('Your profile email was saved, but changing the Firebase login email requires a recent sign-in.');
            } else throw authError;
          }
        }
      }
      sessionStorage.setItem('userName', cleanName);

      if (role === 'student' && cleanUsername) {
        if (studentDocId) {
          await updateDoc(doc(db, 'individualStudents', studentDocId), {
            name: cleanName,
            fullName: cleanName,
            username: cleanUsername,
            phone: cleanPhone,
            whatsapp: cleanWhatsapp,
            updatedAt: new Date().toISOString(),
          }).catch(() => undefined);
          await updateDoc(doc(db, 'students', studentDocId), {
            name: cleanName,
            fullName: cleanName,
            username: cleanUsername,
            phone: cleanPhone,
            whatsapp: cleanWhatsapp,
            updatedAt: new Date().toISOString(),
          }).catch(() => undefined);
        }
        sessionStorage.setItem('studentUsername', cleanUsername);
      }

      // Never write to users/{user.uid} when masquerading as another account
      if (targetUid && (!isMasquerading || targetUid !== user.uid)) {
        const uRef = doc(db, 'users', targetUid);
        const uSnap = await getDoc(uRef).catch(() => null);
        if (!isMasquerading || uSnap?.exists()) {
          await setDoc(
            uRef,
            {
              name: cleanName,
              ...(role === 'student' && cleanUsername ? { username: cleanUsername } : {}),
              ...(!(role === 'student' && isSchoolOnboardedStudent) && isValidTutorPhotoUrl(cleanPhoto)
                ? { photoURL: cleanPhoto }
                : {}),
              email: cleanEmail,
              phone: cleanPhone,
              whatsapp: cleanWhatsapp,
              whatsappContact: cleanWhatsapp,
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
        }
      }

      if (role === 'staff' && targetUid) {
        await setDoc(
          doc(db, 'tutors', targetUid),
          {
            name: cleanName,
            fullName: cleanName,
            phone: cleanPhone,
            whatsapp: cleanWhatsapp,
            ...(isValidTutorPhotoUrl(cleanPhoto) ? { photoURL: cleanPhoto } : {}),
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        ).catch((error) => console.warn('Tutor profile sync skipped:', error));
      }

      if (role === 'student' && cleanUsername) {
        await claimGlobalUsername(cleanUsername, {
          uid: targetUid || studentDocId,
          docId: studentDocId || targetUid,
          role: 'STUDENT',
          email: cleanEmail,
          name: cleanName,
        });
      }

      if (role === 'school' && schoolId) {
        await updateDoc(doc(db, 'schools', schoolId), {
          contactEmail: cleanEmail,
          email: cleanEmail,
          contactName: cleanName,
          phone: cleanPhone,
          whatsapp: cleanWhatsapp,
          updatedAt: new Date().toISOString(),
        }).catch((error) => console.warn('School profile sync skipped:', error));
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
    if (!user || effectiveAuth.isMasquerading) return;
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
    const uid = effectiveAuth.effectiveUid || auth.currentUser?.uid;
    if (uid) localStorage.setItem(`jbs_${key}_${uid}`, String(value));
  };

  return (
    <div className="max-w-5xl mx-auto pb-12 space-y-6">
      <SEO
        title="Account Preferences & Settings | Jaystarbliss Studios"
        description="Manage your portal profile, teaching programmes, appearance, security and notifications."
        noindex
      />

      {/* Top Settings Header with subtle geometric crimson accent */}
      <header className="relative overflow-hidden rounded-2xl bg-white dark:bg-[#111114] border border-slate-200/80 dark:border-zinc-800 px-6 py-6 sm:px-8 sm:py-7">
        {/* Decorative concentric arcs matching the Settings header design */}
        <svg
          aria-hidden="true"
          viewBox="0 0 420 180"
          fill="none"
          className="pointer-events-none select-none absolute -right-4 -top-6 h-[190px] w-[360px] sm:w-[420px] opacity-80 dark:opacity-35"
        >
          <path
            d="M110 195C130 92 215 18 335 -10L430 -10L430 195H110Z"
            fill="#FCE7F3"
            className="dark:fill-rose-950/50"
            fillOpacity="0.55"
          />
          <path
            d="M190 195C214 115 288 52 430 22V195H190Z"
            fill="#FBCFE8"
            className="dark:fill-rose-900/45"
            fillOpacity="0.6"
          />
          <path
            d="M278 195C302 138 354 96 430 76V195H278Z"
            fill="#F9A8D4"
            className="dark:fill-rose-800/45"
            fillOpacity="0.45"
          />
        </svg>

        <div className="relative z-10 flex items-center gap-4">
          <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-100 dark:border-rose-900/60 flex items-center justify-center shrink-0">
            <Settings size={26} className="text-[#991B1B] dark:text-rose-400" strokeWidth={1.9} />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-zinc-100">
              Settings
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mt-0.5">
              Manage your account and preferences
            </p>
          </div>
        </div>
      </header>

      {/* Horizontal Category Tab Bar */}
      <nav
        aria-label="Settings sections"
        className="flex items-center gap-2.5 overflow-x-auto scrollbar-none pb-1"
      >
        {(
          [
            ['profile', 'Profile & Account', User],
            ['appearance', 'Appearance', Palette],
            ['security', 'Security', ShieldCheck],
            ['notifications', 'Notifications', Bell],
          ] as const
        ).map(([id, label, Icon]) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`px-4 py-2.5 rounded-full text-xs sm:text-[13px] font-semibold whitespace-nowrap inline-flex items-center gap-2 transition-all cursor-pointer ${
                isActive
                  ? 'bg-[#991B1B] text-white shadow-sm'
                  : 'bg-white dark:bg-[#111114] text-slate-700 dark:text-zinc-300 border border-slate-200/90 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon size={15} className={isActive ? 'text-white' : 'text-slate-500 dark:text-zinc-400'} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      {/* TAB 1: PROFILE & ACCOUNT */}
      {activeTab === 'profile' && (
        <div className="space-y-5">
          <form onSubmit={handleSaveProfile} className="space-y-5">
            <section className="bg-white dark:bg-[#111114] rounded-2xl border border-slate-200/80 dark:border-zinc-800 p-6 sm:p-8 shadow-2xs space-y-6">
              <div className="flex flex-col lg:flex-row lg:items-start gap-6 lg:gap-8">
                {/* Left Column: Title + 2-column form inputs */}
                <div className="flex-1 space-y-6 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-zinc-100">
                        Profile Details
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                        Your information as it appears on the portal
                      </p>
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                      {role === 'staff' ? 'Tutor' : role}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
                    <label className="block space-y-1.5">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-zinc-300">
                        <User size={13} className="text-slate-400 dark:text-zinc-500" />
                        <span>Full Name</span>
                      </span>
                      <input
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Your full name"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-[#09090B] text-sm text-slate-900 dark:text-zinc-100 outline-none transition-colors focus:border-[#991B1B] focus:bg-white dark:focus:bg-[#09090B] focus:ring-2 focus:ring-[#991B1B]/15"
                      />
                    </label>

                    <label className="block space-y-1.5">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-zinc-300">
                        <Mail size={13} className="text-slate-400 dark:text-zinc-500" />
                        <span>Email Address</span>
                      </span>
                      <input
                        required
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="name@example.com"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-[#09090B] text-sm text-slate-900 dark:text-zinc-100 outline-none transition-colors focus:border-[#991B1B] focus:bg-white dark:focus:bg-[#09090B] focus:ring-2 focus:ring-[#991B1B]/15"
                      />
                    </label>

                    <label className="block space-y-1.5">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-zinc-300">
                        <Phone size={13} className="text-slate-400 dark:text-zinc-500" />
                        <span>Phone Number</span>
                      </span>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+234 800 000 0000"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-[#09090B] text-sm text-slate-900 dark:text-zinc-100 outline-none transition-colors focus:border-[#991B1B] focus:bg-white dark:focus:bg-[#09090B] focus:ring-2 focus:ring-[#991B1B]/15"
                      />
                    </label>

                    <label className="block space-y-1.5">
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-zinc-300">
                        <MessageCircle size={13} className="text-slate-400 dark:text-zinc-500" />
                        <span>WhatsApp Contact</span>
                      </span>
                      <input
                        type="tel"
                        value={whatsapp}
                        onChange={(e) => setWhatsapp(e.target.value)}
                        placeholder="+234 800 000 0000"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-[#09090B] text-sm text-slate-900 dark:text-zinc-100 outline-none transition-colors focus:border-[#991B1B] focus:bg-white dark:focus:bg-[#09090B] focus:ring-2 focus:ring-[#991B1B]/15"
                      />
                    </label>

                    {role === 'student' && (
                      <label className="block space-y-1.5 sm:col-span-2">
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-zinc-300">
                          <Smartphone size={13} className="text-slate-400 dark:text-zinc-500" />
                          <span>Student Username</span>
                        </span>
                        <input
                          required
                          minLength={3}
                          maxLength={30}
                          value={username}
                          onChange={(e) =>
                            setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))
                          }
                          placeholder="your_username"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-[#09090B] text-sm text-slate-900 dark:text-zinc-100 outline-none transition-colors focus:border-[#991B1B] focus:bg-white dark:focus:bg-[#09090B] focus:ring-2 focus:ring-[#991B1B]/15"
                        />
                        <span className="block text-[11px] text-slate-500 dark:text-zinc-400">
                          Use this username together with your student access code to sign in.
                        </span>
                      </label>
                    )}
                  </div>
                </div>

                {/* Right Column: Circular Profile Avatar + Upload Control */}
                <div className="lg:w-44 lg:border-l lg:border-slate-100 dark:lg:border-zinc-800/80 lg:pl-8 flex flex-row lg:flex-col items-center justify-start lg:justify-center gap-4 pt-2 lg:pt-4 shrink-0">
                  <div className="relative group">
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden bg-rose-100 dark:bg-rose-950/60 border border-rose-200/80 dark:border-rose-900/60 flex items-center justify-center shrink-0">
                      {isValidTutorPhotoUrl(photoURL) ? (
                        <img
                          src={photoURL}
                          alt={fullName || 'Profile photograph'}
                          className="w-full h-full object-cover"
                        />
                      ) : role === 'student' ? (
                        <span className="text-2xl sm:text-3xl font-extrabold text-[#991B1B] dark:text-rose-400 select-none">
                          {(fullName || 'S').trim().charAt(0).toUpperCase()}
                        </span>
                      ) : (
                        <svg
                          viewBox="0 0 80 80"
                          className="w-full h-full text-[#991B1B] dark:text-rose-400"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <circle cx="40" cy="30" r="13" />
                          <path d="M16 72c2-15 12-23 24-23s22 8 24 23H16z" />
                        </svg>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-start lg:items-center text-left lg:text-center gap-1.5">
                    {role === 'student' && isSchoolOnboardedStudent ? (
                      <p className="text-[11px] leading-snug text-slate-500 dark:text-zinc-400 max-w-[165px]">
                        {isValidTutorPhotoUrl(photoURL)
                          ? 'Displays your school’s official profile emblem.'
                          : 'Uses your school emblem when set, or your name initial by default.'}
                      </p>
                    ) : (
                      <>
                        <label className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-slate-300 dark:hover:border-zinc-600 text-[11px] font-semibold text-slate-700 dark:text-zinc-200 cursor-pointer transition-colors">
                          {uploadingPhoto ? (
                            <>
                              <RefreshCw size={12} className="animate-spin" />
                              <span>Uploading...</span>
                            </>
                          ) : (
                            <>
                              {isValidTutorPhotoUrl(photoURL) ? <Camera size={12} /> : <Upload size={12} />}
                              <span>{isValidTutorPhotoUrl(photoURL) ? 'Change Photo' : 'Upload Photo'}</span>
                            </>
                          )}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            disabled={uploadingPhoto}
                            onChange={handleTutorPhotoUpload}
                            className="hidden"
                          />
                        </label>
                        {role === 'staff' && (
                          <p className="text-[10px] leading-snug text-slate-500 dark:text-zinc-400 max-w-[160px]">
                            {isValidTutorPhotoUrl(photoURL)
                              ? 'Linked to your Find a Tutor profile.'
                              : 'Required for public Find a Tutor listing.'}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Bottom Verification Strip + Primary Save CTA */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <div className="flex-1 rounded-xl bg-slate-50 dark:bg-zinc-900/70 border border-slate-200/70 dark:border-zinc-800 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    {emailVerified ? (
                      <span className="w-5 h-5 rounded-full bg-[#991B1B] text-white inline-flex items-center justify-center shrink-0">
                        <Check size={12} strokeWidth={3} />
                      </span>
                    ) : (
                      <AlertCircle size={18} className="text-[#991B1B] dark:text-rose-400 shrink-0" />
                    )}
                    <span className="text-xs sm:text-[13px] font-medium text-slate-700 dark:text-zinc-200">
                      {emailVerified
                        ? 'Your email address is verified'
                        : 'Verify your email address to keep account recovery enabled'}
                    </span>
                  </div>

                  {!emailVerified && (
                    <button
                      type="button"
                      disabled={sendingVerification}
                      onClick={() => void sendVerification()}
                      className="px-3.5 py-1.5 rounded-lg bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-slate-800 dark:hover:bg-white text-xs font-semibold disabled:opacity-50 cursor-pointer transition-colors"
                    >
                      {sendingVerification ? 'Sending...' : 'Send Verification'}
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={savingProfile}
                  className="px-6 py-3 rounded-full bg-[#991B1B] hover:bg-[#7F1D1D] text-white font-semibold text-xs sm:text-[13px] shadow-xs inline-flex items-center justify-center gap-2 disabled:opacity-50 transition-colors cursor-pointer shrink-0"
                >
                  {savingProfile ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save size={14} />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </section>
          </form>

          {/* Standalone Change Password Bar (Directly matching the mockup) */}
          <section className="bg-white dark:bg-[#111114] rounded-2xl border border-slate-200/80 dark:border-zinc-800 px-6 py-5 sm:px-8 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 flex items-center justify-center shrink-0">
                <Lock size={19} className="text-slate-700 dark:text-zinc-300" />
              </div>
              <div>
                <h3 className="text-sm sm:text-[15px] font-bold text-slate-900 dark:text-zinc-100">
                  Change Password
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                  Update your password for better security
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowPasswordModal(true)}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-800 dark:text-zinc-100 text-xs sm:text-[13px] font-semibold transition-colors cursor-pointer shrink-0"
            >
              <span>Change Password</span>
              <ArrowRight size={14} />
            </button>
          </section>

          {/* TUTOR PROFILE: SUBJECTS I TEACH — PROGRAMMES & TEACHING FIELDS CONFIGURATION */}
          {role === 'staff' && (
            <section
              id="subjects-i-teach"
              className="bg-white dark:bg-[#111114] rounded-2xl border border-slate-200/80 dark:border-zinc-800 p-6 sm:p-8 shadow-2xs space-y-6"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-zinc-800 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <BookOpen size={18} className="text-[#991B1B] dark:text-rose-400" />
                    <h2 className="text-base font-bold text-slate-900 dark:text-zinc-100">
                      Subjects I Teach — Programmes &amp; Teaching Fields
                    </h2>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
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
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-800 dark:text-zinc-100 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>Propose Sub-Programme</span>
                  </button>
                  <button
                    type="button"
                    disabled={savingTeachingConfig}
                    onClick={() => void handleSaveTeachingConfiguration()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#991B1B] hover:bg-[#7F1D1D] text-white text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
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
                <div className="py-8 text-center text-xs text-slate-500 dark:text-zinc-400">
                  Loading programmes and teaching fields…
                </div>
              ) : (
                <>
                  {/* Step 1: Select One or More Programmes */}
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-zinc-200 tabular-nums">
                          1. Select Programmes You Teach Under ({selectedProgramIds.length} Selected)
                        </h3>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                          Click one or more programmes below to enable and configure their teaching fields.
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <label className="text-[11px] font-semibold text-slate-600 dark:text-zinc-400">
                          Proficiency Level:
                        </label>
                        <select
                          value={proficiencyLevel}
                          onChange={(e) => setProficiencyLevel(e.target.value as any)}
                          className="h-8 rounded-lg border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 px-2.5 text-xs font-semibold text-slate-800 dark:text-zinc-200"
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
                                ? 'border-[#991B1B] dark:border-rose-500/70 bg-rose-50/40 dark:bg-rose-950/20'
                                : 'border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 bg-white dark:bg-[#09090B]'
                            }`}
                          >
                            <div className="space-y-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`w-5 h-5 rounded-md flex items-center justify-center text-xs font-bold shrink-0 ${
                                    isSelected
                                      ? 'bg-[#991B1B] text-white'
                                      : 'border border-slate-300 dark:border-zinc-700 text-transparent'
                                  }`}
                                >
                                  <Check size={12} />
                                </span>
                                <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-zinc-100 truncate">
                                  {prog.title}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-zinc-400 line-clamp-2 pl-7">
                                {prog.description}
                              </p>
                            </div>
                            <span
                              className={`shrink-0 text-[11px] font-semibold tabular-nums ${
                                activeFieldsInProg > 0
                                  ? 'text-[#991B1B] dark:text-rose-400'
                                  : 'text-slate-500 dark:text-zinc-400'
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
                  <div className="space-y-4 pt-3 border-t border-slate-100 dark:border-zinc-800">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-zinc-200 tabular-nums">
                        2. Configure Specific Teaching Fields &amp; Subjects ({selectedFieldNames.length} Active)
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400">
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
                          className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-900/40 p-4 space-y-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                              <Award size={14} className="text-[#991B1B] dark:text-rose-400" />
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
                              className="text-[11px] font-semibold text-[#991B1B] dark:text-rose-400 hover:underline cursor-pointer"
                            >
                              Toggle All in Programme
                            </button>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {prog.fields.length === 0 ? (
                              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                                No sub-programmes have been published under {prog.title} yet. You can add a custom teaching field below or propose a sub-programme.
                              </p>
                            ) : (
                              prog.fields.map((field) => {
                                const active = selectedFieldNames.includes(field.title);
                                return (
                                  <button
                                    key={field.id}
                                    type="button"
                                    onClick={() => toggleFieldSelection(field.title, prog.id)}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                                      active
                                        ? 'bg-[#991B1B] text-white border-[#991B1B] shadow-2xs'
                                        : 'bg-white dark:bg-zinc-900 text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-700 hover:border-slate-400'
                                    }`}
                                  >
                                    {active && <Check size={12} />}
                                    <span>{field.title}</span>
                                  </button>
                                );
                              })
                            )}
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
                        className="flex-1 h-10 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#09090B] px-3.5 text-xs text-slate-900 dark:text-zinc-100 outline-none focus:border-[#991B1B]"
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomField}
                        className="h-10 px-4 rounded-xl bg-slate-900 dark:bg-zinc-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-zinc-900 text-xs font-semibold inline-flex items-center justify-center gap-1.5 shrink-0 cursor-pointer transition-colors"
                      >
                        <Plus size={14} /> Add Teaching Field
                      </button>
                    </div>

                    {/* Active Configured Fields Summary */}
                    {selectedFieldNames.length > 0 && (
                      <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-900/40 p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-800 dark:text-zinc-200 tabular-nums">
                            Active Teaching Fields on Your Profile ({selectedFieldNames.length})
                          </span>
                          <span className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">
                            Proficiency: {proficiencyLevel}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedFieldNames.map((fieldName) => (
                            <span
                              key={fieldName}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs font-medium text-slate-800 dark:text-zinc-200"
                            >
                              <span>{fieldName}</span>
                              <button
                                type="button"
                                onClick={() => toggleFieldSelection(fieldName)}
                                className="text-slate-400 hover:text-[#991B1B] cursor-pointer"
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
                    <div className="space-y-2.5 pt-3 border-t border-slate-100 dark:border-zinc-800">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-zinc-200 flex items-center gap-1.5 tabular-nums">
                        <FolderTree size={14} className="text-[#991B1B] dark:text-rose-400" />
                        <span>Submitted Sub-Programme Proposals ({myProposals.length})</span>
                      </h3>
                      <div className="divide-y divide-slate-100 dark:divide-zinc-800 rounded-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
                        {myProposals.map((prop) => (
                          <div
                            key={prop.id}
                            className="p-3.5 bg-white dark:bg-[#09090B] flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-900 dark:text-zinc-100">
                                  {prop.title}
                                </span>
                                <span
                                  className={`text-[11px] font-semibold uppercase ${
                                    prop.status === 'APPROVED'
                                      ? 'text-emerald-700 dark:text-emerald-400'
                                      : prop.status === 'REJECTED'
                                      ? 'text-[#991B1B] dark:text-rose-400'
                                      : 'text-slate-500 dark:text-zinc-400'
                                  }`}
                                >
                                  · {prop.status}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
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

      {/* TAB 2: APPEARANCE */}
      {activeTab === 'appearance' && (
        <section className="bg-white dark:bg-[#111114] rounded-2xl border border-slate-200/80 dark:border-zinc-800 p-6 sm:p-8 shadow-2xs space-y-6">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-zinc-100">
              Appearance &amp; Display
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              Customize theme contrast and workspace density for your portal session.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
            <button
              type="button"
              onClick={() => {
                if (theme === 'dark') toggleTheme();
              }}
              className={`p-5 rounded-2xl border text-left flex items-center justify-between gap-4 cursor-pointer transition-all ${
                theme === 'light'
                  ? 'border-[#991B1B] bg-rose-50/40 dark:bg-rose-950/20'
                  : 'border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Sun size={18} />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-zinc-100">Light Mode</p>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">Bright, crisp daylight workspace</p>
                </div>
              </div>
              {theme === 'light' && (
                <span className="w-5 h-5 rounded-full bg-[#991B1B] text-white inline-flex items-center justify-center shrink-0">
                  <Check size={12} strokeWidth={3} />
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                if (theme === 'light') toggleTheme();
              }}
              className={`p-5 rounded-2xl border text-left flex items-center justify-between gap-4 cursor-pointer transition-all ${
                theme === 'dark'
                  ? 'border-[#991B1B] bg-rose-50/40 dark:bg-rose-950/25'
                  : 'border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-zinc-900 text-slate-700 dark:text-zinc-200 flex items-center justify-center shrink-0">
                  <Moon size={18} />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-zinc-100">Dark Mode</p>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">Matte low-glare dark workspace</p>
                </div>
              </div>
              {theme === 'dark' && (
                <span className="w-5 h-5 rounded-full bg-[#991B1B] text-white inline-flex items-center justify-center shrink-0">
                  <Check size={12} strokeWidth={3} />
                </span>
              )}
            </button>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-zinc-800/80 rounded-2xl border border-slate-200/80 dark:border-zinc-800 max-w-2xl overflow-hidden">
            <button
              type="button"
              onClick={toggleHighContrast}
              className="w-full px-5 py-4 bg-white dark:bg-[#111114] hover:bg-slate-50/70 dark:hover:bg-zinc-900/50 text-left flex items-center justify-between gap-4 cursor-pointer transition-colors"
            >
              <span className="flex items-center gap-3">
                <Contrast size={17} className="text-slate-500 dark:text-zinc-400" />
                <span>
                  <span className="block text-sm font-semibold text-slate-900 dark:text-zinc-100">
                    Enhanced Contrast
                  </span>
                  <span className="block text-xs text-slate-500 dark:text-zinc-400">
                    Strengthen text and surface borders across portal screens.
                  </span>
                </span>
              </span>
              <span
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
                  isHighContrast ? 'bg-[#991B1B]' : 'bg-slate-200 dark:bg-zinc-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    isHighContrast ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </span>
            </button>

            <label className="w-full px-5 py-4 bg-white dark:bg-[#111114] hover:bg-slate-50/70 dark:hover:bg-zinc-900/50 flex items-center justify-between gap-4 cursor-pointer transition-colors">
              <span>
                <span className="block text-sm font-semibold text-slate-900 dark:text-zinc-100">
                  Compact Layout
                </span>
                <span className="block text-xs text-slate-500 dark:text-zinc-400">
                  Reduce vertical padding in dense tables and lists.
                </span>
              </span>
              <input
                type="checkbox"
                checked={compactMode}
                onChange={(e) => setCompactMode(e.target.checked)}
                className="sr-only"
              />
              <span
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
                  compactMode ? 'bg-[#991B1B]' : 'bg-slate-200 dark:bg-zinc-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    compactMode ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </span>
            </label>

            <label className="w-full px-5 py-4 bg-white dark:bg-[#111114] hover:bg-slate-50/70 dark:hover:bg-zinc-900/50 flex items-center justify-between gap-4 cursor-pointer transition-colors">
              <span>
                <span className="block text-sm font-semibold text-slate-900 dark:text-zinc-100">
                  Smooth Animations
                </span>
                <span className="block text-xs text-slate-500 dark:text-zinc-400">
                  Keep sidebar transitions and subtle hover motion active.
                </span>
              </span>
              <input
                type="checkbox"
                checked={smoothAnimations}
                onChange={(e) => setSmoothAnimations(e.target.checked)}
                className="sr-only"
              />
              <span
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
                  smoothAnimations ? 'bg-[#991B1B]' : 'bg-slate-200 dark:bg-zinc-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    smoothAnimations ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </span>
            </label>
          </div>
        </section>
      )}

      {/* TAB 3: SECURITY */}
      {activeTab === 'security' && (
        <div className="space-y-5">
          <section className="bg-white dark:bg-[#111114] rounded-2xl border border-slate-200/80 dark:border-zinc-800 p-6 sm:p-8 shadow-2xs space-y-6">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-zinc-100">
                Security &amp; Credentials
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                Keep your account password strong and verify your recovery email.
              </p>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-zinc-800/80 rounded-2xl border border-slate-200/80 dark:border-zinc-800 overflow-hidden">
              <div className="p-5 bg-white dark:bg-[#111114] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 flex items-center justify-center shrink-0">
                    <KeyRound size={18} className="text-[#991B1B] dark:text-rose-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-zinc-100">
                      Portal Password
                    </p>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                      Change your sign-in password anytime to keep your account protected.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(true)}
                  className="px-5 py-2.5 rounded-full bg-[#991B1B] hover:bg-[#7F1D1D] text-white text-xs font-semibold inline-flex items-center justify-center gap-2 cursor-pointer transition-colors shrink-0"
                >
                  <span>Change Password</span>
                  <ArrowRight size={14} />
                </button>
              </div>

              <div className="p-5 bg-white dark:bg-[#111114] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200/80 dark:border-zinc-800 flex items-center justify-center shrink-0">
                    {emailVerified ? (
                      <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <AlertCircle size={18} className="text-[#991B1B] dark:text-rose-400" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-zinc-100">
                      Authentication Email
                    </p>
                    <p className="text-xs text-slate-600 dark:text-zinc-300 mt-0.5">
                      {email || 'Not available'}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                      {emailVerified
                        ? 'Verified and active for password recovery.'
                        : 'Not yet verified. Send a verification email to secure recovery.'}
                    </p>
                  </div>
                </div>
                {!emailVerified && (
                  <button
                    type="button"
                    disabled={sendingVerification}
                    onClick={() => void sendVerification()}
                    className="px-4 py-2 rounded-full border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800 text-xs font-semibold text-slate-800 dark:text-zinc-100 disabled:opacity-50 cursor-pointer shrink-0 transition-colors"
                  >
                    {sendingVerification ? 'Sending...' : 'Send Verification'}
                  </button>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* TAB 4: NOTIFICATIONS */}
      {activeTab === 'notifications' && (
        <section className="bg-white dark:bg-[#111114] rounded-2xl border border-slate-200/80 dark:border-zinc-800 p-6 sm:p-8 shadow-2xs space-y-6">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-zinc-100">
              Notification Preferences
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              Choose which categories of portal alerts and updates you want to receive.
            </p>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-zinc-800/80 rounded-2xl border border-slate-200/80 dark:border-zinc-800 max-w-2xl overflow-hidden">
            {(
              [
                [
                  'Schedules & Classes',
                  'Timetable updates, live classroom reminders, and tutor reschedules.',
                  'jbs_notif_schedules',
                  notifSchedules,
                  setNotifSchedules,
                ],
                [
                  'Announcements & Reports',
                  'Official communiqués, progress reports, and academic notices.',
                  'jbs_notif_announcements',
                  notifAnnouncements,
                  setNotifAnnouncements,
                ],
                [
                  'Billing & Payments',
                  'Tuition receipts, Paystack confirmations, and renewal reminders.',
                  'jbs_notif_billing',
                  notifBilling,
                  setNotifBilling,
                ],
              ] as const
            ).map(([label, desc, key, value, setter]) => (
              <label
                key={key}
                className="flex items-center justify-between gap-4 px-5 py-4 bg-white dark:bg-[#111114] hover:bg-slate-50/70 dark:hover:bg-zinc-900/50 cursor-pointer transition-colors"
              >
                <div>
                  <span className="block text-sm font-semibold text-slate-900 dark:text-zinc-100">
                    {label}
                  </span>
                  <span className="block text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                    {desc}
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={value}
                  onChange={(e) => savePreference(key.replace(/^jbs_/, ''), e.target.checked, setter)}
                  className="sr-only"
                />
                <span
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
                    value ? 'bg-[#991B1B]' : 'bg-slate-200 dark:bg-zinc-700'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      value ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </span>
              </label>
            ))}
          </div>
        </section>
      )}

      {/* Proposal Modal for Nested Sub-Programme */}
      {showProposalModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitProposal}
            className="bg-white dark:bg-[#111114] rounded-2xl border border-slate-200 dark:border-zinc-800 max-w-xl w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                  <FolderTree size={18} className="text-[#991B1B] dark:text-rose-400" />
                  <span>Propose Nested Sub-Programme</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                  Propose a new learning unit beneath any existing programme branch for administrator approval.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowProposalModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300">
                Parent Programme Branch *
              </label>
              <select
                required
                value={parentProgramId}
                onChange={(e) => setParentProgramId(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-300 dark:border-zinc-700 rounded-xl text-xs font-medium bg-white dark:bg-[#09090B] dark:text-zinc-100"
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
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Proposed Sub-Programme Title *
                </label>
                <input
                  type="text"
                  required
                  value={proposalTitle}
                  onChange={(e) => setProposalTitle(e.target.value)}
                  placeholder="e.g. TypeScript Fundamentals"
                  className="w-full px-3.5 py-2 border border-slate-300 dark:border-zinc-700 rounded-xl text-xs bg-white dark:bg-[#09090B] dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Suggested Duration
                </label>
                <input
                  type="text"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="e.g. 6 Weeks"
                  className="w-full px-3.5 py-2 border border-slate-300 dark:border-zinc-700 rounded-xl text-xs bg-white dark:bg-[#09090B] dark:text-zinc-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                Description &amp; Rationale *
              </label>
              <textarea
                rows={2}
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Explain what this sub-programme covers and how it benefits learners..."
                className="w-full p-2.5 border border-slate-300 dark:border-zinc-700 rounded-xl text-xs bg-white dark:bg-[#09090B] dark:text-zinc-100"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Learning Objectives (1 per line)
                </label>
                <textarea
                  rows={3}
                  value={objectivesText}
                  onChange={(e) => setObjectivesText(e.target.value)}
                  placeholder={'Understand static types\nBuild reusable interfaces'}
                  className="w-full p-2.5 border border-slate-300 dark:border-zinc-700 rounded-xl text-xs bg-white dark:bg-[#09090B] dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                  Suggested Lesson Outline (1 per line)
                </label>
                <textarea
                  rows={3}
                  value={curriculumText}
                  onChange={(e) => setCurriculumText(e.target.value)}
                  placeholder={'Week 1: Type Annotations\nWeek 2: Generics & Utility Types'}
                  className="w-full p-2.5 border border-slate-300 dark:border-zinc-700 rounded-xl text-xs bg-white dark:bg-[#09090B] dark:text-zinc-100"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowProposalModal(false)}
                className="px-4 py-2 rounded-full border border-slate-200 dark:border-zinc-700 text-xs font-semibold text-slate-600 dark:text-zinc-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingProposal}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full bg-[#991B1B] text-white text-xs font-semibold hover:bg-[#7F1D1D] disabled:opacity-50 cursor-pointer"
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
