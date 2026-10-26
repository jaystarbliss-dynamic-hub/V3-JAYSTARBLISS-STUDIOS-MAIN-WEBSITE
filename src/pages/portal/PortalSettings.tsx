import React, { useEffect, useState } from 'react';
import { User, Lock, Moon, Sun, Bell, Save, Contrast, KeyRound, RefreshCw, CheckCircle2, AlertCircle, Smartphone, MessageCircle } from 'lucide-react';
import { auth, db } from '../../lib/firebase';
import { sendEmailVerification, updateProfile, updateEmail } from 'firebase/auth';
import { collection, doc, getDocs, getDoc, limit, query, updateDoc, where } from 'firebase/firestore';
import { useTheme } from '../../contexts/ThemeContext';
import { useToast } from '../../contexts/ToastContext';
import ChangePasswordModal from '../../components/portal/ChangePasswordModal';
import SEO from '../../components/ui/SEO';

type SettingsTab = 'profile' | 'appearance' | 'security' | 'notifications';

export const PortalSettings: React.FC = () => {
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

  useEffect(() => {
    const user = auth.currentUser;
    const userRole = sessionStorage.getItem('userRole') || 'student';
    setRole(userRole);
    if (!user) return;

    setEmail(user.email || '');
    setEmailVerified(user.emailVerified);
    setFullName(user.displayName || sessionStorage.getItem('userName') || '');

    const loadUserDoc = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (!snap.exists()) return;
        const data = snap.data();
        if (data.name) setFullName(String(data.name));
        if (data.username) setUsername(String(data.username));
        if (data.phone) setPhone(String(data.phone));
        if (data.whatsapp || data.whatsappContact) setWhatsapp(String(data.whatsapp || data.whatsappContact));
      } catch (error) {
        console.warn('Could not load user profile settings:', error);
      }
    };
    void loadUserDoc();

    try {
      setNotifSchedules(localStorage.getItem(`jbs_notif_schedules_${user.uid}`) !== 'false');
      setNotifAnnouncements(localStorage.getItem(`jbs_notif_announcements_${user.uid}`) !== 'false');
      setNotifBilling(localStorage.getItem(`jbs_notif_billing_${user.uid}`) !== 'false');
    } catch {}
  }, []);

  const handleSaveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    const user = auth.currentUser;
    if (!user) return;
    setSavingProfile(true);
    try {
      const cleanName = fullName.trim();
      const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
      const cleanEmail = email.trim().toLowerCase();
      const cleanPhone = phone.trim();
      const cleanWhatsapp = whatsapp.trim();
      if (!cleanName || !cleanEmail) throw new Error('Full name and email are required.');
      if (role === 'student' && (cleanUsername.length < 3 || cleanUsername.length > 30)) throw new Error('Student username must be 3–30 characters.');

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

      if (role === 'student') {
        const studentDocId = sessionStorage.getItem('studentDocId') || '';
        if (studentDocId) {
          const duplicate = await getDocs(query(collection(db, 'individualStudents'), where('username', '==', cleanUsername), limit(1)));
          if (!duplicate.empty && duplicate.docs[0].id !== studentDocId) throw new Error('That username is already in use. Please choose another.');
          await updateDoc(doc(db, 'individualStudents', studentDocId), { username: cleanUsername, updatedAt: new Date().toISOString() }).catch(() => undefined);
          await updateDoc(doc(db, 'students', studentDocId), { username: cleanUsername, updatedAt: new Date().toISOString() }).catch(() => undefined);
          sessionStorage.setItem('studentUsername', cleanUsername);
        }
      }

      await updateDoc(doc(db, 'users', user.uid), {
        name: cleanName,
        username: role === 'student' ? cleanUsername : undefined,
        email: cleanEmail,
        phone: cleanPhone,
        whatsapp: cleanWhatsapp,
        whatsappContact: cleanWhatsapp,
        updatedAt: new Date().toISOString()
      });

      const schoolId = sessionStorage.getItem('schoolId') || sessionStorage.getItem('schoolDocId') || (role === 'school' ? user.uid : '');
      if (schoolId) {
        await updateDoc(doc(db, 'schools', schoolId), {
          contactEmail: cleanEmail,
          email: cleanEmail,
          contactName: cleanName,
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
    <div className="space-y-6 max-w-4xl mx-auto pb-10">
      <SEO title="Account Preferences & Settings | Jaystarbliss Studios" description="Manage your portal profile, appearance, security and notifications." noindex />
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">Account &amp; Preferences</h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">Manage your personal details, interface preferences and account security.</p>
      </div>

      <div className="flex items-center gap-1.5 border-b border-slate-200/80 dark:border-slate-800 pb-3 overflow-x-auto scrollbar-none">
        {([
          ['profile', 'Profile & Account', User],
          ['appearance', 'Appearance & Theme', Sun],
          ['security', 'Security & Password', Lock],
          ['notifications', 'Notifications', Bell]
        ] as const).map(([id, label, Icon]) => (
          <button key={id} type="button" onClick={() => setActiveTab(id)} className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-2 transition-all ${activeTab === id ? 'bg-brand-red text-white shadow-xs' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-800 hover:border-brand-red/40'}`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {activeTab === 'profile' && (
        <form onSubmit={handleSaveProfile} className="space-y-6">
          <section className="bg-white dark:bg-[#161B26] rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-6 shadow-xs space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 gap-4">
              <div><h2 className="text-base font-bold text-slate-900 dark:text-white">Profile Details</h2><p className="text-xs text-slate-500">Your contact information used across the portal.</p></div>
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 capitalize">{role}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <label className="block"><span className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider">Full Name</span><input required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Your full name" className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-red" /></label>
              {role === 'student' && <label className="block"><span className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider">Student Username</span><input required minLength={3} maxLength={30} value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))} placeholder="your_username" className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-red" /><span className="block mt-1 text-[10px] text-slate-500">Use this username with your student access code.</span></label>}
              <label className="block"><span className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider">Email Address</span><input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-red" /></label>
              <label className="block"><span className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider flex items-center gap-1.5"><Smartphone size={13} /> Phone Number</span><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+234 800 000 0000" className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-red" /></label>
              <label className="block"><span className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5 uppercase tracking-wider flex items-center gap-1.5"><MessageCircle size={13} /> WhatsApp Contact</span><input type="tel" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} placeholder="+234 800 000 0000" className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-red" /></label>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3"><div className={`mt-0.5 ${emailVerified ? 'text-emerald-500' : 'text-amber-500'}`}>{emailVerified ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}</div><div><p className="text-xs font-black text-slate-900 dark:text-white">Email verification</p><p className="text-[11px] text-slate-500">{emailVerified ? 'Your authentication email is verified.' : 'Verify your email to keep account recovery available.'}</p></div></div>
              {!emailVerified && <button type="button" disabled={sendingVerification} onClick={() => void sendVerification()} className="min-h-10 px-4 rounded-xl bg-slate-900 dark:bg-slate-700 text-white text-xs font-black disabled:opacity-50">{sendingVerification ? 'Sending...' : 'Send Verification'}</button>}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button type="button" onClick={() => setShowPasswordModal(true)} className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs rounded-xl flex items-center gap-2"><KeyRound size={13} className="text-brand-red" /> Change Password</button>
              <button type="submit" disabled={savingProfile} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-xs flex items-center gap-2 disabled:opacity-50 transition-colors cursor-pointer">{savingProfile ? <><RefreshCw size={13} className="animate-spin" /> Saving...</> : <><Save size={13} /> Save Changes</>}</button>
            </div>
          </section>
        </form>
      )}

      {activeTab === 'appearance' && (
        <section className="bg-white dark:bg-[#161B26] rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-6 shadow-xs space-y-6">
          <div><h2 className="text-base font-bold text-slate-900 dark:text-white">Interface &amp; Visual Theme</h2><p className="text-xs text-slate-500">Choose the portal appearance that is easiest for you to use.</p></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
            <button type="button" onClick={() => { if (theme === 'dark') toggleTheme(); }} className={`p-4 rounded-2xl border text-left flex items-center gap-3 ${theme === 'light' ? 'border-brand-red bg-brand-red/5' : 'border-slate-200 dark:border-slate-800'}`}><Sun size={18} /><div><p className="text-xs font-black">Light Mode</p><p className="text-[10px] text-slate-500">Bright, high-clarity workspace</p></div></button>
            <button type="button" onClick={() => { if (theme === 'light') toggleTheme(); }} className={`p-4 rounded-2xl border text-left flex items-center gap-3 ${theme === 'dark' ? 'border-brand-red bg-brand-red/5' : 'border-slate-200 dark:border-slate-800'}`}><Moon size={18} /><div><p className="text-xs font-black">Dark Mode</p><p className="text-[10px] text-slate-500">Low-glare workspace</p></div></button>
          </div>
          <button type="button" onClick={toggleHighContrast} className={`w-full max-w-xl p-4 rounded-2xl border text-left flex items-center justify-between gap-4 ${isHighContrast ? 'border-brand-red bg-brand-red/5' : 'border-slate-200 dark:border-slate-800'}`}><span className="flex items-center gap-3"><Contrast size={18} /><span><span className="block text-xs font-black">Enhanced Contrast</span><span className="block text-[10px] text-slate-500">Strengthen text and surface separation.</span></span></span><span className="text-[10px] font-black uppercase">{isHighContrast ? 'On' : 'Off'}</span></button>
          <label className="flex items-center justify-between gap-4 max-w-xl p-4 rounded-2xl border border-slate-200 dark:border-slate-800"><span><span className="block text-xs font-black">Compact layout</span><span className="block text-[10px] text-slate-500">Reduce spacing in dense portal views.</span></span><input type="checkbox" checked={compactMode} onChange={e => setCompactMode(e.target.checked)} /></label>
          <label className="flex items-center justify-between gap-4 max-w-xl p-4 rounded-2xl border border-slate-200 dark:border-slate-800"><span><span className="block text-xs font-black">Smooth animations</span><span className="block text-[10px] text-slate-500">Keep sidebar and page transitions enabled.</span></span><input type="checkbox" checked={smoothAnimations} onChange={e => setSmoothAnimations(e.target.checked)} /></label>
        </section>
      )}

      {activeTab === 'security' && (
        <section className="bg-white dark:bg-[#161B26] rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-6 shadow-xs space-y-5">
          <div><h2 className="text-base font-bold text-slate-900 dark:text-white">Security &amp; Password</h2><p className="text-xs text-slate-500">Manage the credentials used to access your portal.</p></div>
          <button type="button" onClick={() => setShowPasswordModal(true)} className="w-full sm:w-auto px-5 py-3 rounded-xl bg-brand-red text-white text-xs font-black inline-flex items-center justify-center gap-2"><KeyRound size={14} /> Change Account Password</button>
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

      <ChangePasswordModal isOpen={showPasswordModal} onClose={() => setShowPasswordModal(false)} />
    </div>
  );
};

export default PortalSettings;
