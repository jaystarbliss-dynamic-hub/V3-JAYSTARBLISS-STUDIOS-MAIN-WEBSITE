import React, { useState } from 'react';
import { Building2, CheckCircle2, ChevronRight, ChevronLeft, Layers, BookOpen, Send, Loader2, ShieldCheck } from 'lucide-react';
import MainLayout from '../components/layout/MainLayout';
import SEO from '../components/ui/SEO';
import Button from '../components/ui/Button';
import { WizardActionFooter } from '../components/ui/WizardActionFooter';
import { useToast } from '../contexts/ToastContext';
import { getFriendlyErrorMessage, logInternalDiagnostic } from '../utils/friendlyErrors';
import { SCHOOL_DELIVERY_TIERS } from '../data/learningEcosystem';

const programs = ['School of Technology & Programming','School of Digital Literacy','School of Creative Design','School of Music & Performing Arts','School of Academic Excellence','School of Strategy & Games','School of Young Creators','School ICT Lab Transformation & Teacher Professional Development'];
const fields = [
  { key: 'name', label: 'Contact name', placeholder: 'Your full name' }, { key: 'schoolName', label: 'School / institution', placeholder: 'School name' }, { key: 'role', label: 'Role / position', placeholder: 'Principal, proprietor, administrator…' }, { key: 'email', label: 'Email address', placeholder: 'you@school.com', type: 'email' }, { key: 'phone', label: 'Phone number', placeholder: '+234…' }, { key: 'addressCity', label: 'City / location', placeholder: 'Lagos, Nigeria' },
];

const SchoolPartnershipV2: React.FC = () => {
  const { toast } = useToast();
  const [step, setStep] = useState(0); const [loading, setLoading] = useState(false); const [success, setSuccess] = useState(false); const [error, setError] = useState('');
  const [tier, setTier] = useState(SCHOOL_DELIVERY_TIERS[1]?.id || SCHOOL_DELIVERY_TIERS[0]?.id || 'development');
  const [form, setForm] = useState({ name:'', schoolName:'', role:'', email:'', phone:'', addressCity:'', estimatedStudents:'50-100', preferredDays:'2 Days / Week', programsOfInterest:[programs[0], programs[1]], message:'' });
  const set = (key: string, value: string) => setForm(current => ({ ...current, [key]: value }));
  const valid = () => {
    setError('');
    if (step === 0 && !tier) {
      setError('Select a delivery model.');
      return false;
    }
    if (step === 1 && fields.some(f => !String((form as any)[f.key] || '').trim())) {
      setError('Please complete all contact and school details.');
      return false;
    }
    if (step === 2 && !form.programsOfInterest.length) {
      setError('Select at least one programme.');
      return false;
    }
    return true;
  };
  const submit = async () => {
    if (!valid()) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/.netlify/functions/school-partnership-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, deliveryTier: tier })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Submission failed.');
      setSuccess(true);
      toast.success('Partnership proposal received.');
    } catch (e: any) {
      logInternalDiagnostic('SchoolPartnership::Submit', e);
      const friendly = getFriendlyErrorMessage(e);
      setError(friendly);
      toast.error(friendly);
    } finally {
      setLoading(false);
    }
  };
  const steps = [{ label:'Model', icon:Layers }, { label:'Institution', icon:Building2 }, { label:'Programmes', icon:BookOpen }, { label:'Submit', icon:Send }];
  return <MainLayout><SEO title="School Partnerships" description="Request a structured Jaystarbliss Studios school partnership proposal." />
    <section className="bg-brand-slate px-4 py-16 text-white sm:px-6 lg:px-8 lg:py-24"><div className="mx-auto max-w-5xl text-center"><span className="text-xs font-black uppercase tracking-[0.2em] text-red-300">Institutional Partnerships</span><h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Build a connected learning programme inside your school.</h1><p className="mx-auto mt-5 max-w-3xl text-sm leading-7 text-white/75 sm:text-base">Tell us what your institution needs. Your proposal is reviewed by our team before any school portal account is created.</p></div></section>
    <section className="bg-slate-50 px-4 py-10 dark:bg-slate-950 sm:px-6 lg:px-8"><div className="mx-auto max-w-5xl"><div className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:grid-cols-4">{steps.map((item,index)=>{const Icon=item.icon;return <button key={item.label} type="button" onClick={()=>index<step&&setStep(index)} className={`flex items-center gap-2 rounded-xl px-3 py-3 text-left ${step===index?'bg-brand-red text-white':'text-slate-500'}`}><Icon size={15}/><span className="text-xs font-black">0{index+1}. {item.label}</span></button>})}</div></div></section>
    <section className="bg-white px-4 pb-20 dark:bg-slate-950 sm:px-6 lg:px-8"><div className="mx-auto max-w-5xl">
      {success ? <div className="mx-auto max-w-2xl rounded-3xl border border-emerald-200 bg-emerald-50 p-10 text-center dark:border-emerald-900 dark:bg-emerald-950/30"><CheckCircle2 className="mx-auto text-emerald-600" size={54}/><h2 className="mt-5 text-2xl font-black text-slate-900 dark:text-white">Proposal received.</h2><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-600 dark:text-slate-300">Thank you, {form.name}. Our team will review {form.schoolName}'s proposal and contact you using the details submitted. No school account is created until an administrator approves the partnership.</p><div className="mt-6"><Button to="/programs" variant="outline">Explore programmes</Button></div></div> : <div className="mt-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        {error && <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
        {step===0 && <div><h2 className="text-xl font-black text-slate-900 dark:text-white">Choose a delivery model</h2><p className="mt-1 text-sm text-slate-500">This is a preference for proposal design, not an automatic commitment.</p><div className="mt-6 grid gap-4 md:grid-cols-3">{SCHOOL_DELIVERY_TIERS.map(item=><button type="button" key={item.id} onClick={()=>setTier(item.id)} className={`rounded-2xl border p-5 text-left transition ${tier===item.id?'border-brand-red bg-red-50 ring-2 ring-brand-red/10 dark:bg-red-950/20':'border-slate-200 hover:border-slate-300 dark:border-slate-800'}`}><span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Tier 0{item.tier}</span><h3 className="mt-2 font-black text-slate-900 dark:text-white">{item.name}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p><div className="mt-4 text-xs font-bold text-brand-red">{item.frequency} · {item.duration}</div></button>)}</div></div>}
        {step===1 && <div><h2 className="text-xl font-black text-slate-900 dark:text-white">Tell us about the institution</h2><div className="mt-6 grid gap-4 sm:grid-cols-2">{fields.map(field=><label key={field.key} className="block"><span className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-500">{field.label}</span><input type={field.type||'text'} value={(form as any)[field.key]} onChange={e=>set(field.key,e.target.value)} placeholder={field.placeholder} className="min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-brand-red focus:ring-2 focus:ring-brand-red/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label>)}</div><div className="mt-4 grid gap-4 sm:grid-cols-2"><label><span className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-500">Estimated students</span><select value={form.estimatedStudents} onChange={e=>set('estimatedStudents',e.target.value)} className="min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"><option>Under 50</option><option>50-100</option><option>101-250</option><option>251-500</option><option>500+</option></select></label><label><span className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-500">Preferred frequency</span><input value={form.preferredDays} onChange={e=>set('preferredDays',e.target.value)} className="min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white" /></label></div></div>}
        {step===2 && <div><h2 className="text-xl font-black text-slate-900 dark:text-white">Select programmes of interest</h2><p className="mt-1 text-sm text-slate-500">Choose everything you want the proposal team to consider.</p><div className="mt-6 grid gap-3 sm:grid-cols-2">{programs.map(item=>{const checked=form.programsOfInterest.includes(item);return <button type="button" key={item} onClick={()=>setForm(current=>({...current,programsOfInterest:checked?current.programsOfInterest.filter(x=>x!==item):[...current.programsOfInterest,item]}))} className={`flex items-start gap-3 rounded-2xl border p-4 text-left ${checked?'border-brand-red bg-red-50 dark:bg-red-950/20':'border-slate-200 dark:border-slate-800'}`}><span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${checked?'border-brand-red bg-brand-red text-white':'border-slate-300'}`}>{checked&&<CheckCircle2 size={14}/>}</span><span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{item}</span></button>})}</div><label className="mt-5 block"><span className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-500">Additional requirements</span><textarea value={form.message} onChange={e=>set('message',e.target.value)} rows={5} placeholder="Timetable constraints, age groups, facilities, special goals…" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-950 dark:text-white"/></label></div>}
        {step===3 && <div><h2 className="text-xl font-black text-slate-900 dark:text-white">Review & submit</h2><div className="mt-6 grid gap-3 sm:grid-cols-2">{[['Institution',form.schoolName],['Contact',form.name],['Email',form.email],['Model',tier],['Students',form.estimatedStudents],['Programmes',String(form.programsOfInterest.length)]].map(([label,value])=><div key={label} className="rounded-xl bg-slate-50 p-4 dark:bg-slate-950"><span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</span><div className="mt-1 text-sm font-bold text-slate-800 dark:text-white">{value}</div></div>)}</div><div className="mt-5 flex items-start gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800"><ShieldCheck size={18} className="mt-0.5 text-emerald-600"/><p className="text-xs leading-5 text-slate-500">Your proposal is stored as a lead for administrator review. Approval is required before a school account is created.</p></div></div>}
        <WizardActionFooter
          currentStep={step + 1}
          totalSteps={4}
          stepLabel={steps[step].label}
          isFirstStep={step === 0}
          isLastStep={step === 3}
          canProceed={!loading}
          isSubmitting={loading}
          primaryLabel={step === 3 ? 'Submit proposal' : 'Continue'}
          onNext={() => {
            if (step < 3) {
              if (valid()) setStep(s => Math.min(3, s + 1));
            } else {
              void submit();
            }
          }}
          onBack={() => setStep(s => Math.max(0, s - 1))}
          stickyMobile={true}
        />
      </div>}
    </div></section>
  </MainLayout>;
};
export default SchoolPartnershipV2;
