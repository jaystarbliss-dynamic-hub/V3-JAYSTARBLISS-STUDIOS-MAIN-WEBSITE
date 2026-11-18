import React, { useEffect, useState } from 'react';
import { ExternalLink, Keyboard, Loader2 } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';

interface Props { studentName?: string; studentClass?: string; schoolId?: string; enabled?: boolean; }

const EdClubLaunchBanner: React.FC<Props> = ({ studentName = 'Student', studentClass = '', schoolId = '', enabled = false }) => {
  const [allowed, setAllowed] = useState(enabled);
  const [loading, setLoading] = useState(true);
  const [portalUrl, setPortalUrl] = useState('https://jaystarbliss-studios.edclub.com');
  const [bannerUrl, setBannerUrl] = useState('');
  const [title, setTitle] = useState('Typing Masters Academy');
  const [subtitle, setSubtitle] = useState('In collaboration with Edclub • Keyboarding & Speed Typing Club');

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const studentId = sessionStorage.getItem('studentDocId') || auth.currentUser?.uid || '';
        let student: any = null;
        if (studentId) {
          const [studentSnap, individualSnap] = await Promise.all([
            getDoc(doc(db, 'students', studentId)).catch(() => null),
            getDoc(doc(db, 'individualStudents', studentId)).catch(() => null)
          ]);
          student = studentSnap?.exists() ? studentSnap.data() : individualSnap?.exists() ? individualSnap.data() : null;
        }

        const feature = student?.featureAccess || {};
        let featureAllowed = enabled || feature.edClub === true;
        let effectiveSchoolId = schoolId || student?.schoolId || sessionStorage.getItem('studentSchoolId') || '';
        let program: any = null;

        if (effectiveSchoolId) {
          const schoolSnap = await getDoc(doc(db, 'schools', effectiveSchoolId)).catch(() => null);
          if (schoolSnap?.exists()) {
            const school = schoolSnap.data();
            const programs = Array.isArray(school.programs) ? school.programs : [];
            const assignedProgramId = student?.programId || student?.assignedProgramId;
            const assignedNames = [student?.programName, student?.programTitle, student?.plan, student?.track].filter(Boolean).map((v: any) => String(v).toLowerCase());
            program = programs.find((item: any) => assignedProgramId && item.id === assignedProgramId) || programs.find((item: any) => {
              const name = String(item.name || item.title || '').toLowerCase();
              return assignedNames.some(value => name === value || name.includes(value) || value.includes(name));
            });
            if (program?.hasEdclub === true || program?.hasEdClub === true) featureAllowed = true;
          }
        }

        const settingsKeys = effectiveSchoolId ? [`edclub_${effectiveSchoolId}`, 'edclub'] : ['edclub'];
        let settings: any = null;
        for (const key of settingsKeys) {
          const snap = await getDoc(doc(db, 'settings', key)).catch(() => null);
          if (snap?.exists()) { settings = snap.data(); break; }
        }

        if (!active) return;
        if (settings) {
          const configuredEnabled = settings.enabled ?? settings.isEnabled;
          if (configuredEnabled === false) featureAllowed = false;
          if (settings.portalUrl) setPortalUrl(settings.portalUrl === 'https://www.edclub.com' ? 'https://jaystarbliss-studios.edclub.com' : settings.portalUrl);
          if (settings.bannerUrl) setBannerUrl(settings.bannerUrl);
          if (settings.title) setTitle(settings.title);
          if (settings.subtitle) setSubtitle(settings.subtitle);
        }
        if (program?.edclubUrl || program?.edClubUrl || program?.portalUrl) setPortalUrl(program.edclubUrl || program.edClubUrl || program.portalUrl);
        if (program?.edclubBannerUrl || program?.edClubBannerUrl) setBannerUrl(program.edclubBannerUrl || program.edClubBannerUrl);
        setAllowed(featureAllowed);
      } catch (error) {
        console.warn('Ed Club banner settings lookup failed:', error);
        setAllowed(enabled);
      } finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [enabled, schoolId]);

  if (loading) return <div className="rounded-3xl border border-slate-800 bg-slate-950 p-5 text-xs text-slate-500"><Loader2 className="animate-spin inline mr-2" size={15}/>Loading Ed Club access…</div>;
  if (!allowed) return null;

  return (
    <section className="relative overflow-hidden rounded-3xl border border-slate-800 bg-[#0F172A] text-white shadow-sm p-5 sm:p-6">
      {bannerUrl && <img src={bannerUrl} alt="Ed Club" className="absolute inset-0 h-full w-full object-cover opacity-35 pointer-events-none" />}
      <div className="absolute inset-0 bg-gradient-to-r from-[#0F172A] via-[#0F172A]/90 to-[#1E293B]/80 pointer-events-none" />
      <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-5">
        <div className="flex items-start gap-3.5 min-w-0">
          <div className="w-12 h-12 shrink-0 rounded-2xl bg-[#1E293B] border border-slate-700 text-white flex items-center justify-center"><Keyboard size={23}/></div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-widest font-black text-[#F87171]">Ed Club</p>
            <h2 className="mt-1 text-lg sm:text-xl font-black">{title}</h2>
            <p className="mt-1 text-xs sm:text-sm text-slate-300 font-semibold">{subtitle}</p>
            <p className="mt-2 text-[11px] text-slate-300">Student: <strong className="text-white">{studentName}</strong>{studentClass ? <> <span className="mx-1">·</span> Class: <strong className="text-white">{studentClass}</strong></> : null}</p>
          </div>
        </div>
        <a href={portalUrl} target="_blank" rel="noreferrer" className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-[#B91C1C] px-4 py-3 text-xs font-black text-white hover:bg-red-700 transition-colors">
          Launch Ed Club Digital Institute <ExternalLink size={14}/>
        </a>
      </div>
    </section>
  );
};

export default EdClubLaunchBanner;
