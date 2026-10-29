import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';
import {
  db,
  auth,
  DEFAULT_DATABASE_ID,
  LEGACY_NAMED_DATABASE_ID,
  ACTIVE_DATABASE_ID,
  setActiveDatabaseId,
  getFirestoreById
} from '../../lib/firebase';
import { useTheme } from '../../contexts/ThemeContext';
import { 
  Loader2, Save, AlertCircle, CheckCircle2, 
  Radio, Mail, Send, Check, ShieldCheck, Sun, Moon, Eye, X, Database, RefreshCw 
} from 'lucide-react';
import { PasswordResetEmailTemplate } from '../../components/email/PasswordResetEmailTemplate';

const AdminSettings: React.FC = () => {
  const { theme, toggleTheme, isHighContrast, toggleHighContrast } = useTheme();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Resend Email Test State
  const [testEmailRecipient, setTestEmailRecipient] = useState('');
  const [sendingTestEmail, setSendingTestEmail] = useState(false);
  const [testEmailResult, setTestEmailResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  const [syncingLegacyDb, setSyncingLegacyDb] = useState(false);
  const [legacySyncResult, setLegacySyncResult] = useState<{ success: boolean; message: string } | null>(null);
  
  const [settings, setSettings] = useState({
    companyName: 'Jaystarbliss Studios',
    contactEmail: 'jaystarblissstudios@gmail.com',
    contactPhone: '+234 913 651 8194',
    secondaryPhone: '+234 913 052 9010',
    infoEmail: 'info@jaystarbliss-studios.name.ng',
    infoWhatsapp: '+234 913 052 9010',
    supportEmail: 'support@jaystarbliss-studios.name.ng',
    supportWhatsapp: '+234 707 763 8925',
    whatsappNumber: '+234 913 651 8194',
    googleBusinessUrl: 'https://share.google/mqVU8pAgKEDjOfGHe',
    address: 'Lagos, Nigeria',
    heroHeading: 'LEARN. CREATE. INNOVATE.',
    heroSubheading: 'Empowering learners of all ages and building scalable modern tech solutions.',
    twitter: '',
    linkedin: '',
    instagram: '',
    cloudinaryCloudName: 'jaystarbliss',
    cloudinaryUploadPreset: 'jaystarbliss_cms',
    cloudinaryApiKey: '',
    cloudinaryApiSecret: ''
  });

  // Banner State
  const [banner, setBanner] = useState({
    enabled: true,
    message: '⚡ Live System Notice: The website is currently undergoing active maintenance and progressive feature rollouts. Some modules, links, and resources may be dynamically updated in real-time. Thank you for learning and building with Jaystarbliss Studios!',
    badgeText: 'MAINTENANCE NOTICE',
    variant: 'maintenance',
    speed: 'normal',
    linkUrl: '/portal',
    linkLabel: 'Access Portal',
    showDismiss: true
  });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const docRef = doc(db, 'settings', 'global');
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          setSettings(prev => ({ ...prev, ...data }));
        }

        // Fetch banner settings
        const bannerRef = doc(db, 'settings', 'banner');
        const bannerSnap = await getDoc(bannerRef);
        if (bannerSnap.exists()) {
          const bData = bannerSnap.data();
          setBanner(prev => ({ ...prev, ...bData }));
        }

        if (auth.currentUser?.email) {
          setTestEmailRecipient(auth.currentUser.email);
        }

        // Also check if cloudinary specific settings exist
        const cloudRef = doc(db, 'settings', 'cloudinary');
        const cloudSnap = await getDoc(cloudRef);
        if (cloudSnap.exists()) {
          const cData = cloudSnap.data();
          setSettings(prev => ({
            ...prev,
            cloudinaryCloudName: cData.cloudName || prev.cloudinaryCloudName,
            cloudinaryUploadPreset: cData.uploadPreset || prev.cloudinaryUploadPreset,
            cloudinaryApiKey: cData.apiKey || prev.cloudinaryApiKey,
            cloudinaryApiSecret: cData.apiSecret || prev.cloudinaryApiSecret
          }));
        }
      } catch (error) {
        console.error("Error fetching settings:", error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchSettings();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setSettings(prev => ({ ...prev, [name]: checked }));
    } else {
      setSettings(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleBannerChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setBanner(prev => ({ ...prev, [name]: checked }));
    } else {
      setBanner(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ type: '', text: '' });
    
    try {
      const user = auth.currentUser;
      const settingsRef = doc(db, 'settings', 'global');
      
      await setDoc(settingsRef, {
        ...settings,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid || 'unknown'
      }, { merge: true });

      // Save Banner configuration to settings/banner
      const bannerRef = doc(db, 'settings', 'banner');
      await setDoc(bannerRef, {
        ...banner,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid || 'unknown'
      }, { merge: true });

      // Save Cloudinary configuration specifically
      const cloudinaryRef = doc(db, 'settings', 'cloudinary');
      await setDoc(cloudinaryRef, {
        cloudName: settings.cloudinaryCloudName || 'jaystarbliss',
        uploadPreset: settings.cloudinaryUploadPreset || 'jaystarbliss_cms',
        apiKey: settings.cloudinaryApiKey || '',
        apiSecret: settings.cloudinaryApiSecret || '',
        updatedAt: serverTimestamp()
      }, { merge: true });

      localStorage.setItem('cloudinary_cloud_name', settings.cloudinaryCloudName);
      localStorage.setItem('cloudinary_upload_preset', settings.cloudinaryUploadPreset);
      if (settings.cloudinaryApiKey) localStorage.setItem('cloudinary_api_key', settings.cloudinaryApiKey);
      
      setMessage({ type: 'success', text: 'Global settings and Sticky Marquee Banner saved successfully!' });
    } catch (error) {
      console.error("Error saving settings:", error);
      setMessage({ type: 'error', text: 'Failed to save settings. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const handleSendTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testEmailRecipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmailRecipient)) {
      setTestEmailResult({ success: false, message: 'Please enter a valid recipient email address for testing.' });
      return;
    }
    setSendingTestEmail(true);
    setTestEmailResult(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/.netlify/functions/send-client-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          action: 'test_email',
          to: testEmailRecipient
        })
      });

      const text = await res.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = null;
      }

      if (!res.ok) {
        const errorMsg = data?.error || (res.status === 404 ? 'Email backend endpoint not active in local preview. RESEND_API_KEY is configured for production.' : `Test email delivery failed (Status: ${res.status}).`);
        throw new Error(errorMsg);
      }

      setTestEmailResult({
        success: true,
        message: data?.message || `Test email successfully dispatched to ${testEmailRecipient} via Resend!`
      });
    } catch (err: any) {
      setTestEmailResult({
        success: false,
        message: err.message || 'Unable to dispatch test email.'
      });
    } finally {
      setSendingTestEmail(false);
    }
  };

  const handleDownloadStudentCredentialsCsv = async () => {
    try {
      const [indSnap, stdSnap] = await Promise.all([
        getDocs(collection(db, 'individualStudents')).catch(() => ({ docs: [] } as any)),
        getDocs(collection(db, 'students')).catch(() => ({ docs: [] } as any))
      ]);
      const studentMap = new Map<string, any>();
      const aliasMap = new Map<string, string>();
      [...stdSnap.docs, ...indSnap.docs].forEach((d: any) => {
        const data = d.data() || {};
        const fullName = String(data.fullName || data.studentName || data.name || '').trim().replace(/\s+/g, ' ');
        const uname = String(data.username || '').trim().toLowerCase();
        if (!fullName && !uname) return;
        const schoolKey = String(data.schoolId || 'individual').trim().toLowerCase();
        const nameKey = fullName ? `${fullName.toLowerCase()}|${schoolKey}` : '';
        const existingId =
          (studentMap.has(d.id) ? d.id : '') ||
          (uname && aliasMap.get(`u:${uname}`)) ||
          (nameKey && aliasMap.get(`n:${nameKey}`)) ||
          d.id;
        studentMap.set(existingId, { id: existingId, ...studentMap.get(existingId), ...data, fullName: fullName || uname });
        if (uname) aliasMap.set(`u:${uname}`, existingId);
        if (nameKey) aliasMap.set(`n:${nameKey}`, existingId);
      });

      const list = Array.from(studentMap.values()).sort((a, b) =>
        String(a.fullName || '').localeCompare(String(b.fullName || ''))
      );
      if (list.length === 0) {
        setLegacySyncResult({ success: false, message: 'No student records found to export.' });
        return;
      }

      const csvRows = [
        ['Full Name', 'Class', 'Programme', 'Username', 'Access Code', 'School ID', 'Portal URL'],
        ...list.map((s: any) => [
          `"${String(s.fullName || s.studentName || s.name || 'Student').replace(/"/g, '""')}"`,
          `"${String(s.class || s.grade || 'Grade 1').replace(/"/g, '""')}"`,
          `"${String(s.track || s.programName || 'Digital Literacy').replace(/"/g, '""')}"`,
          `"${String(s.username || s.id).replace(/"/g, '""')}"`,
          `"${String(s.accessCode || s.passcode || s.code || '').replace(/"/g, '""')}"`,
          `"${String(s.schoolId || 'individual').replace(/"/g, '""')}"`,
          `"${window.location.origin}/portal"`
        ])
      ];
      const blob = new Blob([csvRows.map(r => r.join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `jaystarbliss_student_credentials_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setLegacySyncResult({
        success: true,
        message: `Downloaded CSV with ${list.length} student credential record(s) from (default).`
      });
    } catch (err: any) {
      setLegacySyncResult({
        success: false,
        message: err?.message || 'Unable to download student credentials CSV.'
      });
    }
  };

  const extractDocMillis = (data: Record<string, any> | undefined): number => {
    if (!data) return 0;
    const fields = ['updatedAt', 'submittedAt', 'releasedAt', 'gradedAt', 'startedAt', 'createdAt'];
    for (const key of fields) {
      const val = data[key];
      if (!val) continue;
      if (typeof val?.toMillis === 'function') return val.toMillis();
      if (typeof val?.seconds === 'number') return val.seconds * 1000;
      if (typeof val === 'number') return val;
      if (typeof val === 'string') {
        const parsed = Date.parse(val);
        if (!Number.isNaN(parsed)) return parsed;
      }
    }
    return 0;
  };

  const handleMirrorSyncDatabases = async (direction: 'both' | 'legacy-to-default' | 'default-to-legacy' = 'both') => {
    setSyncingLegacyDb(true);
    setLegacySyncResult(null);
    try {
      let recoveredFromAuth = 0;
      if (auth.currentUser) {
        try {
          const token = await auth.currentUser.getIdToken();
          const res = await fetch('/.netlify/functions/admin-students-directory', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
          });
          if (res.ok) {
            const payload = await res.json().catch(() => ({}));
            recoveredFromAuth = Number(payload.recoveredCount || 0);
          }
        } catch {
          // ignore if Netlify function unavailable in preview
        }
      }

      const { getDocsFromCache } = await import('firebase/firestore');
      const defaultFirestore = getFirestoreById(DEFAULT_DATABASE_ID);
      const legacyFirestore = getFirestoreById(LEGACY_NAMED_DATABASE_ID);

      const collectionsToSync = [
        'jdiExams',
        'schoolExams',
        'jdiExamAttempts',
        'jdiQuestionBank',
        'users',
        'schools',
        'students',
        'individualStudents',
        'documentHeaderConfigs',
        'settings',
        'classSchedules',
        'notifications',
        'jdiNotifications'
      ];

      let copiedToDefault = 0;
      let copiedToLegacy = 0;
      let skippedIdentical = 0;
      const summaryParts: string[] = [];

      const readCollectionSafe = async (targetDb: any, colName: string, isCritical: boolean) => {
        try {
          return await getDocs(collection(targetDb, colName));
        } catch (err) {
          try {
            const cached = await getDocsFromCache(collection(targetDb, colName));
            if (cached && !cached.empty) return cached;
          } catch {
            // ignore cache fallback error
          }
          if (isCritical) throw err;
          return null;
        }
      };

      for (const colName of collectionsToSync) {
        const isCritical = colName === 'students' || colName === 'individualStudents';
        const [defaultSnap, legacySnap] = await Promise.all([
          readCollectionSafe(defaultFirestore, colName, isCritical),
          readCollectionSafe(legacyFirestore, colName, isCritical)
        ]);

        const defaultMap = new Map<string, Record<string, any>>();
        defaultSnap?.docs.forEach((d: any) => defaultMap.set(d.id, d.data() || {}));

        const legacyMap = new Map<string, Record<string, any>>();
        legacySnap?.docs.forEach((d: any) => legacyMap.set(d.id, d.data() || {}));

        const allIds = new Set<string>([...defaultMap.keys(), ...legacyMap.keys()]);
        let colUpdates = 0;

        for (const docId of allIds) {
          const defData = defaultMap.get(docId);
          const legData = legacyMap.get(docId);

          if (legData && !defData && (direction === 'both' || direction === 'legacy-to-default')) {
            await setDoc(doc(defaultFirestore, colName, docId), legData, { merge: true });
            copiedToDefault++;
            colUpdates++;
          } else if (defData && !legData && (direction === 'both' || direction === 'default-to-legacy')) {
            await setDoc(doc(legacyFirestore, colName, docId), defData, { merge: true });
            copiedToLegacy++;
            colUpdates++;
          } else if (defData && legData) {
            const defTime = extractDocMillis(defData);
            const legTime = extractDocMillis(legData);
            if (legTime > defTime && (direction === 'both' || direction === 'legacy-to-default')) {
              await setDoc(doc(defaultFirestore, colName, docId), legData, { merge: true });
              copiedToDefault++;
              colUpdates++;
            } else if (defTime > legTime && (direction === 'both' || direction === 'default-to-legacy')) {
              await setDoc(doc(legacyFirestore, colName, docId), defData, { merge: true });
              copiedToLegacy++;
              colUpdates++;
            } else {
              skippedIdentical++;
            }
          }
        }

        if (colUpdates > 0) {
          summaryParts.push(`${colName}: ${colUpdates}`);
        }
      }

      setLegacySyncResult({
        success: true,
        message:
          copiedToDefault > 0 || copiedToLegacy > 0 || recoveredFromAuth > 0
            ? `Two-Way Mirror Complete! Copied ${copiedToDefault} doc(s) → (default), ${copiedToLegacy} doc(s) → AI Shared Quota [${summaryParts.join(', ')}], skipped ${skippedIdentical} already-identical doc(s), and verified ${recoveredFromAuth} Auth student account(s).`
            : `Both databases are 100% identical across all ${skippedIdentical} checked documents!`
      });
    } catch (err: any) {
      const msg = String(err?.message || err || '');
      const isQuota = msg.toLowerCase().includes('quota') || err?.code === 'resource-exhausted';
      setLegacySyncResult({
        success: false,
        message: isQuota
          ? 'The AI Shared Quota database (ai-studio-jaystarblissdyna-...) is currently in daily 50,000-read cooldown until midnight Pacific Time (00:00 PT / 8:00 AM WAT). As soon as the timer resets at midnight PT, click "Two-Way Mirror Sync" once and both databases will be 100% identical.'
          : `Database sync warning: ${msg}`
      });
    } finally {
      setSyncingLegacyDb(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-brand-red" /></div>;
  }

  return (
    <div className="max-w-4xl space-y-6">
      
      {message.text && (
        <div className={`p-4 rounded-xl flex items-center gap-3 ${
          message.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300' : 'bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
        }`}>
          {message.type === 'success' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
          <p className="font-semibold text-sm">{message.text}</p>
        </div>
      )}

      {/* Theme Appearance Mode Toggle */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 p-6 md:p-7 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>Theme Appearance</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Switch your administrative interface between light and dark modes.</p>
          </div>
          <span className="px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider bg-sky-500/10 text-sky-600 dark:text-sky-400">
            {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
          </span>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
            Color Theme Mode
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
            <button
              type="button"
              onClick={() => { if (theme === 'dark') toggleTheme(); }}
              className={`p-3.5 rounded-xl border flex items-center gap-3 transition-all cursor-pointer ${
                theme === 'light'
                  ? 'border-brand-red bg-brand-red/5 ring-1 ring-brand-red/20 shadow-xs'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-amber-500 shadow-xs">
                <Sun size={18} />
              </div>
              <div className="text-left">
                <div className="text-xs font-bold text-slate-900 dark:text-white">Light Mode</div>
                <div className="text-[10px] text-slate-500">Crisp daylight contrast</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => { if (theme === 'light') toggleTheme(); }}
              className={`p-3.5 rounded-xl border flex items-center gap-3 transition-all cursor-pointer ${
                theme === 'dark'
                  ? 'border-brand-red bg-brand-red/5 ring-1 ring-brand-red/20 shadow-xs'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center text-sky-400 shadow-xs">
                <Moon size={18} />
              </div>
              <div className="text-left">
                <div className="text-xs font-bold text-slate-900 dark:text-white">Dark Mode</div>
                <div className="text-[10px] text-slate-500">Eye-safe slate atmosphere</div>
              </div>
            </button>
          </div>
        </div>

        {/* Accessibility High Contrast */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-xs text-slate-900 dark:text-white">High Contrast Mode</h4>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-brand-red/10 text-brand-red">WCAG AAA</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">Increases text density and sharpens borders across all admin views.</p>
          </div>

          <button
            type="button"
            onClick={toggleHighContrast}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              isHighContrast
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            {isHighContrast ? 'Contrast: Enhanced' : 'Contrast: Standard'}
          </button>
        </div>
      </section>
      
      <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 p-6 md:p-8 space-y-8">
        
        {/* Sticky Maintenance & Announcement Marquee Banner Section */}
        <section className="bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl p-6 border border-slate-700 shadow-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-700 pb-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Radio size={20} className="animate-pulse" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>Global Sticky Marquee Maintenance Banner</span>
                </h2>
                <p className="text-xs text-slate-400">Sticky viewport banner displayed across the website & portal</p>
              </div>
            </div>
            
            {/* Toggle ON/OFF */}
            <label className="relative inline-flex items-center cursor-pointer select-none">
              <input
                type="checkbox"
                name="enabled"
                checked={banner.enabled}
                onChange={handleBannerChange}
                className="sr-only peer"
              />
              <div className="w-12 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
              <span className="ml-3 text-sm font-bold text-white">
                {banner.enabled ? 'ACTIVE ON SITE' : 'DISABLED'}
              </span>
            </label>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                Banner Announcement Text
              </label>
              <textarea
                name="message"
                value={banner.message}
                onChange={handleBannerChange}
                rows={3}
                placeholder="Enter formal or friendly maintenance announcement text..."
                className="w-full px-4 py-3 rounded-xl bg-slate-950/80 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm leading-relaxed"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                  Badge Label
                </label>
                <input
                  type="text"
                  name="badgeText"
                  value={banner.badgeText || ''}
                  onChange={handleBannerChange}
                  placeholder="e.g. MAINTENANCE NOTICE"
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-950/80 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                  Visual Theme
                </label>
                <select
                  name="variant"
                  value={banner.variant || 'maintenance'}
                  onChange={handleBannerChange}
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-950/80 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-amber-500"
                >
                  <option value="maintenance">Dark Slate & Amber (Maintenance)</option>
                  <option value="warning">Bright Warning Amber</option>
                  <option value="crimson">Crimson Alert (Urgent)</option>
                  <option value="info">Ocean Blue (Update)</option>
                  <option value="emerald">Emerald Green (Feature Rollout)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                  Scroll Speed
                </label>
                <select
                  name="speed"
                  value={banner.speed || 'normal'}
                  onChange={handleBannerChange}
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-950/80 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-amber-500"
                >
                  <option value="slow">Slow (45s loop)</option>
                  <option value="normal">Normal (30s loop)</option>
                  <option value="fast">Fast (20s loop)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                  Action Button Link (Optional)
                </label>
                <input
                  type="text"
                  name="linkUrl"
                  value={banner.linkUrl || ''}
                  onChange={handleBannerChange}
                  placeholder="/portal or https://..."
                  className="w-full px-3 py-2.5 rounded-lg bg-slate-950/80 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            {/* Live Preview Box */}
            <div className="mt-4 pt-3 border-t border-slate-700">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">
                Live Banner Preview:
              </span>
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center gap-3 overflow-hidden text-xs text-amber-300">
                <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 font-bold text-[10px] uppercase border border-amber-500/30 shrink-0">
                  {banner.badgeText || 'NOTICE'}
                </span>
                <span className="truncate">{banner.message}</span>
              </div>
            </div>
          </div>
        </section>
        
        {/* Company Info */}
        <section>
          <h2 className="text-xl font-bold text-brand-slate border-b pb-2 mb-6">Company Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Company Name</label>
              <input
                type="text"
                name="companyName"
                value={settings.companyName}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-red"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Contact Email</label>
              <input
                type="email"
                name="contactEmail"
                value={settings.contactEmail}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-red"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Primary Contact Phone</label>
              <input
                type="text"
                name="contactPhone"
                value={settings.contactPhone}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-red"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Secondary Contact Phone</label>
              <input
                type="text"
                name="secondaryPhone"
                value={settings.secondaryPhone}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-red"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Google Business Profile URL</label>
              <input
                type="text"
                name="googleBusinessUrl"
                value={settings.googleBusinessUrl}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-red"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Office Address</label>
              <input
                type="text"
                name="address"
                value={settings.address}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-red"
              />
            </div>
          </div>
        </section>

        {/* Official Channels, WhatsApp & Desk Contacts CMS */}
        <section className="bg-slate-50 dark:bg-slate-900/60 p-6 rounded-2xl border border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 pb-3 mb-6">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold text-sm">
              WA
            </div>
            <div>
              <h2 className="text-lg font-bold text-brand-slate dark:text-white">Official Communication & WhatsApp Desks</h2>
              <p className="text-xs text-slate-500">Configure public enquiry, service info, support helpdesk, and floating WhatsApp contacts.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Main Floating WhatsApp Number
              </label>
              <p className="text-xs text-slate-500 mb-2">Used by the website floating pulse button (default: +234 913 651 8194)</p>
              <input
                type="text"
                name="whatsappNumber"
                value={settings.whatsappNumber}
                onChange={handleChange}
                placeholder="+234 913 651 8194"
                className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Admissions / Services Info WhatsApp
              </label>
              <p className="text-xs text-slate-500 mb-2">Service catalog & admission inquiries desk (default: +234 913 052 9010)</p>
              <input
                type="text"
                name="infoWhatsapp"
                value={settings.infoWhatsapp}
                onChange={handleChange}
                placeholder="+234 913 052 9010"
                className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Info Desk Email Address
              </label>
              <p className="text-xs text-slate-500 mb-2">Public inquiries & services info desk email</p>
              <input
                type="email"
                name="infoEmail"
                value={settings.infoEmail}
                onChange={handleChange}
                placeholder="info@jaystarbliss-studios.name.ng"
                className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Technical & Portal Support WhatsApp
              </label>
              <p className="text-xs text-slate-500 mb-2">Direct assistance for portal, student credentials, or system errors (default: +234 707 763 8925)</p>
              <input
                type="text"
                name="supportWhatsapp"
                value={settings.supportWhatsapp}
                onChange={handleChange}
                placeholder="+234 707 763 8925"
                className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1">
                Technical & Support Desk Email
              </label>
              <p className="text-xs text-slate-500 mb-2">Portal troubleshooting, credentials & billing desk email</p>
              <input
                type="email"
                name="supportEmail"
                value={settings.supportEmail}
                onChange={handleChange}
                placeholder="support@jaystarbliss-studios.name.ng"
                className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
          </div>
        </section>

        {/* Hero Content */}
        <section>
          <h2 className="text-xl font-bold text-brand-slate border-b pb-2 mb-6">Homepage Hero Content</h2>
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Main Heading</label>
              <input
                type="text"
                name="heroHeading"
                value={settings.heroHeading}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-red font-bold text-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Subheading</label>
              <textarea
                name="heroSubheading"
                value={settings.heroSubheading}
                onChange={handleChange}
                rows={2}
                className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-red"
              />
            </div>
          </div>
        </section>

        {/* Cloudinary Integration */}
        <section>
          <div className="flex items-center justify-between border-b pb-2 mb-6">
            <div>
              <h2 className="text-xl font-bold text-brand-slate dark:text-white">Cloudinary Image Storage & CDN</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Configure your Cloudinary credentials to upload and manage high-resolution images across all CMS pages.</p>
            </div>
            <span className="text-xs font-bold uppercase tracking-wider bg-brand-red/10 text-brand-red px-2.5 py-1 rounded-full">
              Active Storage
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Cloudinary Cloud Name</label>
              <input
                type="text"
                name="cloudinaryCloudName"
                value={settings.cloudinaryCloudName}
                onChange={handleChange}
                placeholder="e.g. jaystarbliss"
                className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-red font-mono text-sm"
              />
              <p className="text-[11px] text-slate-400 mt-1">Your Cloudinary account cloud name identifier.</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Unsigned Upload Preset</label>
              <input
                type="text"
                name="cloudinaryUploadPreset"
                value={settings.cloudinaryUploadPreset}
                onChange={handleChange}
                placeholder="e.g. jaystarbliss_cms or ml_default"
                className="w-full px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-red font-mono text-sm"
              />
              <p className="text-[11px] text-slate-400 mt-1">Created in Cloudinary Settings &gt; Upload &gt; Upload Presets (set to Unsigned).</p>
            </div>
          </div>
        </section>

        {/* Resend Email Configuration & Client Communication Gateway */}
        <section className="bg-slate-900 text-white p-6 sm:p-7 rounded-2xl border border-slate-800 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center">
                <Mail size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-white">Resend Email Gateway & Client Communications</h2>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-black border border-emerald-500/30 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    LIVE & CONFIGURED
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Transactional client communications, inquiry auto-responders, admissions confirmations & billing receipts.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
              <ShieldCheck size={14} className="text-emerald-400" />
              <span>Resend API Integration</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Default Sender Identity</span>
              <div className="font-mono text-sm font-bold text-white bg-slate-900 px-3 py-2 rounded-lg border border-slate-800 truncate">
                Jaystarbliss Studios &lt;onboarding@resend.dev&gt;
              </div>
              <p className="text-[11px] text-slate-400">
                All client emails, parent receipts, and partnership notices are dispatched through this verified sender.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Active Capabilities</span>
              <div className="space-y-1.5 text-slate-300">
                <div className="flex items-center gap-2">
                  <Check size={13} className="text-emerald-400 shrink-0" />
                  <span>Website Contact & Inquiry Auto-Responders</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check size={13} className="text-emerald-400 shrink-0" />
                  <span>Student Tuition & Paystack Payment Receipts</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check size={13} className="text-emerald-400 shrink-0" />
                  <span>School Partnership Portal Credentials & Approvals</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check size={13} className="text-emerald-400 shrink-0" />
                  <span>Direct Admin-to-Client Communications</span>
                </div>
              </div>
            </div>
          </div>

          {/* Test Email Dispatcher & Template Preview */}
          <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Mail size={16} className="text-amber-400" />
                <span>Send Live Test Email via Resend</span>
              </div>
              <button
                type="button"
                onClick={() => setShowEmailPreview(true)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors border border-slate-700"
              >
                <Eye size={13} className="text-rose-400" />
                <span>Preview Password Reset Template</span>
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Verify your Resend email deliverability by sending a test message to any email address.
            </p>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="email"
                value={testEmailRecipient}
                onChange={(e) => setTestEmailRecipient(e.target.value)}
                placeholder="Enter recipient email (e.g. your email)..."
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono"
              />
              <button
                type="button"
                onClick={handleSendTestEmail}
                disabled={sendingTestEmail || !testEmailRecipient}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-black flex items-center justify-center gap-2 transition-all shrink-0 shadow-md shadow-rose-600/20"
              >
                {sendingTestEmail ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                <span>{sendingTestEmail ? 'Sending...' : 'Dispatch Test Email'}</span>
              </button>
            </div>

            {testEmailResult && (
              <div className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                testEmailResult.success 
                  ? 'bg-emerald-950/60 border border-emerald-500/30 text-emerald-300' 
                  : 'bg-rose-950/60 border border-rose-500/30 text-rose-300'
              }`}>
                {testEmailResult.success ? <CheckCircle2 size={16} className="shrink-0 text-emerald-400 mt-0.5" /> : <AlertCircle size={16} className="shrink-0 text-rose-400 mt-0.5" />}
                <div>
                  <p className="font-bold">{testEmailResult.success ? 'Delivery Success' : 'Delivery Notice'}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed opacity-90">{testEmailResult.message}</p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Modal: Interactive Password Reset Template Preview */}
        {showEmailPreview && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
            <div className="relative w-full max-w-3xl bg-slate-950 rounded-3xl border border-slate-800 overflow-hidden shadow-2xl my-8">
              <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/80">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center">
                    <Mail size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Password Reset Email Template Preview</h3>
                    <p className="text-[11px] text-slate-400">Branded with official logo, security parameters & high-contrast CTA button</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowEmailPreview(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  aria-label="Close preview"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-4 sm:p-6 max-h-[75vh] overflow-y-auto bg-slate-900/40">
                <PasswordResetEmailTemplate
                  recipientName="Administrator"
                  recipientEmail={testEmailRecipient || 'admin@jaystarbliss-studios.name.ng'}
                  resetUrl="https://jaystarbliss-studios.name.ng/portal?mode=resetPassword&token=demo_auth_action_code_preview"
                  expiresIn="1 Hour (Single Use)"
                  supportWhatsapp={settings.supportWhatsapp || '+234 707 763 8925'}
                  supportEmail={settings.supportEmail || 'support@jaystarbliss-studios.name.ng'}
                />
              </div>

              <div className="px-6 py-3 border-t border-slate-800 bg-slate-900/60 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowEmailPreview(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-colors"
                >
                  Close Preview
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Social Links */}
        <section>
          <h2 className="text-xl font-bold text-brand-slate border-b pb-2 mb-6">Social Media Links</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Twitter / X URL</label>
              <input
                type="url"
                name="twitter"
                value={settings.twitter}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-red"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">LinkedIn URL</label>
              <input
                type="url"
                name="linkedin"
                value={settings.linkedin}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-red"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Instagram URL</label>
              <input
                type="url"
                name="instagram"
                value={settings.instagram}
                onChange={handleChange}
                className="w-full px-4 py-3 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-red"
              />
            </div>
          </div>
        </section>

        <div className="flex justify-end pt-6 border-t border-slate-100">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-brand-red text-white px-8 py-3 rounded-lg font-bold hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>

      {/* Dual-Database Failover Switcher & Two-Way Smart Mirror Sync */}
      <section className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 p-6 md:p-7 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Database size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Dual-Database Failover &amp; Two-Way Mirror Sync
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Active Primary Database:{' '}
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {ACTIVE_DATABASE_ID === DEFAULT_DATABASE_ID ? '(default) — Standard Edition (nam5)' : 'AI Shared Quota (us-west1)'}
                </span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadStudentCredentialsCsv}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Check size={14} />
              <span>Download Student Credentials CSV</span>
            </button>
            <button
              type="button"
              onClick={() => handleMirrorSyncDatabases('both')}
              disabled={syncingLegacyDb}
              className="px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {syncingLegacyDb ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              <span>{syncingLegacyDb ? 'Mirroring Databases...' : 'Two-Way Mirror Sync ((default) ⇄ AI Shared)'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <div
            className={`p-4 rounded-xl border transition-all flex flex-col justify-between gap-3 ${
              ACTIVE_DATABASE_ID === DEFAULT_DATABASE_ID
                ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20 ring-1 ring-emerald-500/20'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50'
            }`}
          >
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white font-mono">
                  (default)
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    ACTIVE_DATABASE_ID === DEFAULT_DATABASE_ID
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {ACTIVE_DATABASE_ID === DEFAULT_DATABASE_ID ? 'Active Now' : 'Standby'}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                Standard Edition (`nam5`) • Independent 50,000 daily reads / 20,000 writes.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                disabled={ACTIVE_DATABASE_ID === DEFAULT_DATABASE_ID}
                onClick={() => setActiveDatabaseId(DEFAULT_DATABASE_ID, true)}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-[11px] font-bold transition-colors cursor-pointer"
              >
                {ACTIVE_DATABASE_ID === DEFAULT_DATABASE_ID ? 'Currently Active' : 'Switch to (default)'}
              </button>
              <button
                type="button"
                disabled={syncingLegacyDb}
                onClick={() => handleMirrorSyncDatabases('legacy-to-default')}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-semibold transition-colors cursor-pointer"
              >
                Pull from AI Shared → (default)
              </button>
            </div>
          </div>

          <div
            className={`p-4 rounded-xl border transition-all flex flex-col justify-between gap-3 ${
              ACTIVE_DATABASE_ID === LEGACY_NAMED_DATABASE_ID
                ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20 ring-1 ring-emerald-500/20'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50'
            }`}
          >
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white font-mono truncate">
                  AI Shared Quota (us-west1)
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                    ACTIVE_DATABASE_ID === LEGACY_NAMED_DATABASE_ID
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {ACTIVE_DATABASE_ID === LEGACY_NAMED_DATABASE_ID ? 'Active Now' : 'Standby'}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                Enterprise Edition (`ai-studio-jaystarblissdyna-...`) • Resets daily at Midnight PT (8:00 AM WAT).
              </p>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                disabled={ACTIVE_DATABASE_ID === LEGACY_NAMED_DATABASE_ID}
                onClick={() => setActiveDatabaseId(LEGACY_NAMED_DATABASE_ID, true)}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-[11px] font-bold transition-colors cursor-pointer"
              >
                {ACTIVE_DATABASE_ID === LEGACY_NAMED_DATABASE_ID ? 'Currently Active' : 'Switch to AI Shared Quota'}
              </button>
              <button
                type="button"
                disabled={syncingLegacyDb}
                onClick={() => handleMirrorSyncDatabases('default-to-legacy')}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-semibold transition-colors cursor-pointer"
              >
                Push (default) → AI Shared
              </button>
            </div>
          </div>
        </div>

        {legacySyncResult && (
          <div
            className={`p-3.5 rounded-xl text-xs flex items-start gap-2.5 ${
              legacySyncResult.success
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300'
                : 'bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
            }`}
          >
            {legacySyncResult.success ? (
              <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertCircle size={16} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            )}
            <p className="leading-relaxed font-medium">{legacySyncResult.message}</p>
          </div>
        )}
      </section>
    </div>
  );
};

export default AdminSettings;
