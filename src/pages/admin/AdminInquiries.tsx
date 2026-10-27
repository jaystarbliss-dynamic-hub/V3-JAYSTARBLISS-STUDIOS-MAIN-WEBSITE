import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, updateDoc, serverTimestamp, addDoc } from 'firebase/firestore';
import { 
  Download, X, Search, Filter, Save, Database, 
  Copy, CheckCircle2, Building2, Loader2,
  GraduationCap, Briefcase, MessageSquare, ChevronDown, 
  ChevronRight, Check, Lightbulb, ExternalLink,
  Mail, Send
} from 'lucide-react';
import { db, auth } from '../../lib/firebase';
import { useToast } from '../../contexts/ToastContext';
import SEO from '../../components/ui/SEO';

export type LeadStage = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'CONVERTED' | 'LOST' | 'CLOSED';

const STAGES: { value: LeadStage; label: string; color: string }[] = [
  { value: 'NEW', label: 'New', color: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' },
  { value: 'CONTACTED', label: 'Contacted', color: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
  { value: 'QUALIFIED', label: 'Qualified', color: 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300' },
  { value: 'CONVERTED', label: 'Converted', color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
  { value: 'LOST', label: 'Lost', color: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300' },
  { value: 'CLOSED', label: 'Closed', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' }
];

const CATEGORIES = [
  { id: 'ALL', label: 'All Lead Categories', icon: MessageSquare },
  { id: 'SCHOOL_PARTNERSHIP_PROPOSAL', label: 'School Partnerships', icon: Building2 },
  { id: 'PARENT_ENQUIRY', label: 'Parent Admissions', icon: GraduationCap },
  { id: 'TUTOR_APPLICATION', label: 'Tutor Applications', icon: Briefcase },
  { id: 'PROJECT_REQUEST', label: 'Project Requests', icon: Lightbulb },
  { id: 'GENERAL', label: 'General Inquiries', icon: MessageSquare }
];

const toDate = (value: any) => value?.toDate ? value.toDate() : value ? new Date(value) : null;
const formatDate = (value: any, time = false) => { 
  const date = toDate(value); 
  return date && !Number.isNaN(date.getTime()) 
    ? date.toLocaleString('en-NG', time ? { dateStyle: 'medium', timeStyle: 'short' } : { year: 'numeric', month: 'short', day: 'numeric' }) 
    : '—'; 
};

const escapeCsv = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
const displayKey = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const serialise = (value: unknown): string => { 
  if (value == null) return '—'; 
  if (value && typeof (value as any).toDate === 'function') return formatDate(value, true); 
  if (value instanceof Date) return value.toLocaleString('en-NG'); 
  if (Array.isArray(value)) return value.map(serialise).join(', '); 
  if (typeof value === 'object') return JSON.stringify(value, null, 2); 
  return String(value); 
};

const inputClass = 'w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand-red focus:border-brand-red transition-all';

const AdminInquiries: React.FC = () => {
  const { toast } = useToast();
  const [inquiries, setInquiries] = useState<any[]>([]); 
  const [loading, setLoading] = useState(true); 
  const [selected, setSelected] = useState<any | null>(null); 
  const [search, setSearch] = useState(''); 
  const [stageFilter, setStageFilter] = useState<'ALL' | LeadStage>('ALL'); 
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [saving, setSaving] = useState(false); 
  const [approvingId, setApprovingId] = useState<string | null>(null); 
  const [copied, setCopied] = useState(false);
  
  // Accordion state inside lead drawer
  const [openSection, setOpenSection] = useState<'details' | 'crm' | 'email' | 'raw'>('details');

  const [draft, setDraft] = useState({ 
    status: 'NEW' as LeadStage, 
    assignedTo: '', 
    nextFollowUp: '', 
    internalNotes: '' 
  });

  // Resend Email Composer State
  const [emailDraft, setEmailDraft] = useState({
    subject: '',
    message: '',
    actionUrl: '',
    actionText: ''
  });
  const [sendingEmail, setSendingEmail] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'inquiries'), snap => { 
      setInquiries(snap.docs.map(item => ({ id: item.id, ...item.data() }))); 
      setLoading(false); 
    }, error => { 
      console.error(error); 
      setLoading(false); 
      toast.error('Could not load the inquiries pipeline.'); 
    });
    return () => unsub();
  }, [toast]);

  useEffect(() => { 
    if (selected) {
      setDraft({ 
        status: String(selected.status || 'NEW').toUpperCase() as LeadStage, 
        assignedTo: selected.assignedTo || '', 
        nextFollowUp: selected.nextFollowUp || '', 
        internalNotes: selected.internalNotes || '' 
      }); 

      const subjectName = selected.inquirySubject || selected.subject || selected.type || 'Inquiry';
      setEmailDraft({
        subject: `Re: ${subjectName} — Jaystarbliss Studios`,
        message: `Hello ${selected.name || selected.contactName || 'there'},\n\nThank you for reaching out to Jaystarbliss Studios. We have reviewed your request regarding "${subjectName}" and would love to assist you.\n\nPlease feel free to reply directly to this email if you have any additional questions or specific scheduling requirements.\n\nWarm regards,\nJaystarbliss Admissions & Academic Team\nhttps://jaystarbliss-studios.name.ng`,
        actionUrl: 'https://jaystarbliss-studios.name.ng/portal',
        actionText: 'Access Student/Staff Portal'
      });
    }
  }, [selected]);

  const handleSendClientEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected?.email) {
      toast.error('This lead does not have a valid email address.');
      return;
    }
    if (!emailDraft.subject.trim() || !emailDraft.message.trim()) {
      toast.error('Please provide both subject and message body.');
      return;
    }

    setSendingEmail(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/.netlify/functions/send-client-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          action: 'direct_email',
          to: selected.email,
          recipientName: selected.name || selected.contactName || 'Valued Client',
          subject: emailDraft.subject.trim(),
          message: emailDraft.message.trim(),
          actionUrl: emailDraft.actionUrl.trim() || undefined,
          actionText: emailDraft.actionText.trim() || undefined
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to deliver email.');

      // Update lead stage to CONTACTED if it was NEW
      if (selected.status === 'NEW') {
        const docRef = doc(db, 'inquiries', selected.id);
        await updateDoc(docRef, {
          status: 'CONTACTED',
          updatedAt: serverTimestamp()
        }).catch(() => undefined);
        setSelected((prev: any) => ({ ...prev, status: 'CONTACTED' }));
      }

      toast.success(`Email dispatched successfully to ${selected.email} via Resend!`);
    } catch (err: any) {
      console.error('Email sending error:', err);
      toast.error(err.message || 'Could not send email.');
    } finally {
      setSendingEmail(false);
    }
  };

  // Counts by stage
  const stageCounts = useMemo(() => {
    return inquiries.reduce<Record<string, number>>((acc, item) => { 
      const key = String(item.status || 'NEW').toUpperCase(); 
      acc.ALL = (acc.ALL || 0) + 1; 
      acc[key] = (acc[key] || 0) + 1; 
      return acc; 
    }, {});
  }, [inquiries]);

  // Counts by category
  const categoryCounts = useMemo(() => {
    return inquiries.reduce<Record<string, number>>((acc, item) => {
      const type = String(item.type || item.inquirySubject || 'GENERAL').toUpperCase();
      acc.ALL = (acc.ALL || 0) + 1;
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});
  }, [inquiries]);

  // Filtered leads
  const filtered = useMemo(() => { 
    const q = search.trim().toLowerCase(); 
    return [...inquiries]
      .sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0))
      .filter(item => { 
        const itemStage = String(item.status || 'NEW').toUpperCase(); 
        if (stageFilter !== 'ALL' && itemStage !== stageFilter) return false; 

        const itemType = String(item.type || item.inquirySubject || 'GENERAL').toUpperCase();
        if (categoryFilter !== 'ALL' && !itemType.includes(categoryFilter) && categoryFilter !== itemType) {
          return false;
        }

        if (!q) return true;
        return Object.values(item).some(val => serialise(val).toLowerCase().includes(q));
      }); 
  }, [inquiries, search, stageFilter, categoryFilter]);

  const quickStage = async (item: any, next: LeadStage) => { 
    try { 
      await updateDoc(doc(db, 'inquiries', item.id), { 
        status: next, 
        updatedBy: auth.currentUser?.uid || null, 
        updatedAt: serverTimestamp() 
      }); 
      await addDoc(collection(db, 'activityLogs'), { 
        type: 'inquiry_stage_changed', 
        action: 'INQUIRY_STAGE_CHANGED', 
        inquiryId: item.id, 
        actorId: auth.currentUser?.uid || null, 
        previousStatus: item.status || 'NEW', 
        nextStatus: next, 
        leadSnapshot: item, 
        timestamp: serverTimestamp() 
      }).catch(() => undefined); 
      toast.success(`Stage updated to ${next}`);
    } catch (error: any) { 
      toast.error(error?.message || 'Could not update lead stage.'); 
    } 
  };

  const approveSchool = async (item: any) => { 
    if (String(item.type || '').toUpperCase() !== 'SCHOOL_PARTNERSHIP_PROPOSAL') return; 
    if (!window.confirm(`Approve ${item.schoolName || item.name || 'this institution'} and create its official school portal account?`)) return; 
    
    setApprovingId(item.id); 
    try { 
      const token = await auth.currentUser?.getIdToken(); 
      if (!token) throw new Error('Your admin session has expired. Please sign in again.'); 
      
      const response = await fetch('/.netlify/functions/admin-approve-school-partnership', { 
        method: 'POST', 
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ inquiryId: item.id }) 
      }); 
      const payload = await response.json().catch(() => ({})); 
      if (!response.ok) throw new Error(payload.error || 'School onboarding failed.'); 
      
      if (payload.passwordSetupLink) {
        await navigator.clipboard?.writeText(payload.passwordSetupLink).catch(() => undefined); 
      }
      toast.success(`${payload.school?.name || 'School'} approved and onboarded. Setup credentials ready.`); 
      setSelected(null); 
    } catch (error: any) { 
      toast.error(error?.message || 'Could not approve school partnership.'); 
    } finally { 
      setApprovingId(null); 
    } 
  };

  const saveDrawerDraft = async () => { 
    if (!selected) return; 
    setSaving(true); 
    try { 
      const previousStatus = String(selected.status || 'NEW').toUpperCase(); 
      await updateDoc(doc(db, 'inquiries', selected.id), { 
        status: draft.status, 
        assignedTo: draft.assignedTo.trim(), 
        nextFollowUp: draft.nextFollowUp || null, 
        internalNotes: draft.internalNotes.trim(), 
        updatedBy: auth.currentUser?.uid || null, 
        updatedAt: serverTimestamp() 
      }); 

      await addDoc(collection(db, 'activityLogs'), { 
        type: 'inquiry_updated', 
        action: 'INQUIRY_UPDATED', 
        inquiryId: selected.id, 
        actorId: auth.currentUser?.uid || null, 
        previousStatus, 
        nextStatus: draft.status, 
        leadSnapshot: selected, 
        changes: draft, 
        timestamp: serverTimestamp() 
      }).catch(() => undefined); 

      setSelected((prev: any) => ({ ...prev, ...draft })); 
      toast.success('Lead pipeline record updated.'); 
    } catch (error: any) { 
      toast.error(error?.message || 'Could not update lead.'); 
    } finally { 
      setSaving(false); 
    } 
  };

  const exportCsv = () => { 
    const keySet = new Set<string>(); 
    filtered.forEach(item => Object.keys(item).forEach(key => keySet.add(key))); 
    const headers = Array.from(keySet); 
    const rows = filtered.map(item => headers.map(key => serialise(item[key]))); 
    const blob = new Blob([[headers.map(escapeCsv).join(','), ...rows.map(row => row.map(escapeCsv).join(','))].join('\n')], { type: 'text/csv;charset=utf-8;' }); 
    const url = URL.createObjectURL(blob); 
    const link = document.createElement('a'); 
    link.href = url; 
    link.download = `jaystarbliss_leads_${new Date().toISOString().slice(0, 10)}.csv`; 
    link.click(); 
    URL.revokeObjectURL(url); 
    toast.success(`Exported ${filtered.length} lead records.`); 
  };

  const copyAllJson = async () => { 
    if (!selected) return; 
    await navigator.clipboard.writeText(JSON.stringify(selected, (_key, value) => value && typeof value.toDate === 'function' ? value.toDate().toISOString() : value, 2)); 
    setCopied(true); 
    setTimeout(() => setCopied(false), 1800); 
    toast.success('Full lead payload copied to clipboard.'); 
  };

  const getCategoryBadge = (item: any) => {
    const type = String(item.type || item.inquirySubject || 'GENERAL').toUpperCase();
    if (type.includes('SCHOOL') || type.includes('PARTNERSHIP')) {
      return { label: 'School Partnership', color: 'bg-red-50 text-brand-red dark:bg-red-950/40 dark:text-red-300', icon: Building2 };
    }
    if (type.includes('PARENT') || type.includes('ADMISSION')) {
      return { label: 'Parent Admission', color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300', icon: GraduationCap };
    }
    if (type.includes('TUTOR') || type.includes('STAFF')) {
      return { label: 'Tutor Application', color: 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300', icon: Briefcase };
    }
    if (type.includes('PROJECT')) {
      return { label: 'Project Request', color: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300', icon: Lightbulb };
    }
    return { label: 'General Inquiry', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', icon: MessageSquare };
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-12">
      <SEO title="Inquiries & Lead Pipeline | Admin" description="Manage captured leads, school proposals, and admissions." noindex={true} />

      {/* Action Bar */}
      <div className="flex items-center justify-end">
        <button 
          type="button" 
          onClick={exportCsv} 
          className="min-h-9 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-bold inline-flex items-center gap-1.5 shadow-xs transition-all"
        >
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* Control Bar with Dropdown Selectors & Search */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
          
          {/* Category Dropdown List Box */}
          <div className="sm:col-span-4">
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
              Filter Category
            </label>
            <div className="relative">
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="w-full min-h-9 pl-3 pr-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs font-bold focus:ring-2 focus:ring-brand-red focus:border-brand-red outline-none appearance-none cursor-pointer"
              >
                {CATEGORIES.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {cat.label} {categoryCounts[cat.id] ? `(${categoryCounts[cat.id]})` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
            </div>
          </div>

          {/* Stage Dropdown List Box */}
          <div className="sm:col-span-4">
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
              Pipeline Stage
            </label>
            <div className="relative">
              <select
                value={stageFilter}
                onChange={e => setStageFilter(e.target.value as any)}
                className="w-full min-h-9 pl-3 pr-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs font-bold focus:ring-2 focus:ring-brand-red focus:border-brand-red outline-none appearance-none cursor-pointer"
              >
                <option value="ALL">All Stages ({stageCounts.ALL || 0})</option>
                {STAGES.map(stg => (
                  <option key={stg.value} value={stg.value}>
                    {stg.label} ({stageCounts[stg.value] || 0})
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
            </div>
          </div>

          {/* Search Box */}
          <div className="sm:col-span-4">
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
              Instant Search
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Name, email, phone, details…"
                className="w-full min-h-9 pl-8 pr-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-900 dark:text-white text-xs font-medium focus:ring-2 focus:ring-brand-red focus:border-brand-red outline-none"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

        </div>

        {/* Quick count chips row */}
        <div className="flex items-center gap-1.5 mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 overflow-x-auto text-[11px]">
          <span className="text-slate-400 font-bold uppercase text-[9px] mr-1">Stages:</span>
          {STAGES.map(stg => {
            const count = stageCounts[stg.value] || 0;
            const isSelected = stageFilter === stg.value;
            return (
              <button
                key={stg.value}
                type="button"
                onClick={() => setStageFilter(isSelected ? 'ALL' : stg.value)}
                className={`px-2.5 py-0.5 rounded-full font-bold whitespace-nowrap transition-all text-[10px] flex items-center gap-1 ${
                  isSelected 
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm' 
                    : `${stg.color} hover:opacity-80`
                }`}
              >
                <span>{stg.label}</span>
                <span className="opacity-70 font-mono">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Table / Directory List */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
            <Loader2 className="animate-spin" size={16} /> Loading lead records…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-400">
            No inquiries or leads match the selected criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[860px]">
              <thead className="bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase font-black text-[10px]">
                <tr>
                  <th className="py-3 px-3.5">Lead / Contact</th>
                  <th className="py-3 px-3.5">Category & Subject</th>
                  <th className="py-3 px-3.5">Stage</th>
                  <th className="py-3 px-3.5">Owner & Follow-up</th>
                  <th className="py-3 px-3.5">Received</th>
                  <th className="py-3 px-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filtered.map(item => {
                  const currentStage = String(item.status || 'NEW').toUpperCase() as LeadStage;
                  const isSchoolProposal = String(item.type || '').toUpperCase() === 'SCHOOL_PARTNERSHIP_PROPOSAL';
                  const isConverted = Boolean(item.schoolId);
                  const badge = getCategoryBadge(item);
                  const Icon = badge.icon;

                  return (
                    <tr 
                      key={item.id} 
                      className={`hover:bg-slate-50/60 dark:hover:bg-slate-950/40 transition-colors cursor-pointer ${
                        selected?.id === item.id ? 'bg-red-50/30 dark:bg-red-950/10' : ''
                      }`}
                      onClick={() => setSelected(item)}
                    >
                      {/* Lead Contact Info */}
                      <td className="py-3 px-3.5 max-w-[220px]">
                        <div className="font-bold text-slate-900 dark:text-white truncate">
                          {item.name || item.fullName || 'Unnamed Contact'}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate flex items-center gap-1 mt-0.5">
                          {item.email && <span className="truncate">{item.email}</span>}
                        </div>
                        {item.phone && (
                          <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                            {item.phone}
                          </div>
                        )}
                      </td>

                      {/* Category & Subject */}
                      <td className="py-3 px-3.5 max-w-[200px]">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${badge.color}`}>
                          <Icon size={11} /> {badge.label}
                        </span>
                        {item.schoolName && (
                          <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 mt-1 truncate">
                            {item.schoolName}
                          </div>
                        )}
                        {item.message && (
                          <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                            "{item.message}"
                          </div>
                        )}
                      </td>

                      {/* Pipeline Stage Selector */}
                      <td className="py-3 px-3.5" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5">
                          <select
                            value={currentStage}
                            onChange={e => void quickStage(item, e.target.value as LeadStage)}
                            className="min-h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-brand-red"
                          >
                            {STAGES.map(stg => (
                              <option key={stg.value} value={stg.value}>{stg.label}</option>
                            ))}
                          </select>
                          {isConverted && (
                            <span className="text-emerald-600" title="School account created">
                              <CheckCircle2 size={14} />
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Assigned Owner & Next Follow up */}
                      <td className="py-3 px-3.5 text-slate-600 dark:text-slate-400 text-[11px]">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          {item.assignedTo || '—'}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {item.nextFollowUp ? `Due ${item.nextFollowUp}` : 'No date set'}
                        </div>
                      </td>

                      {/* Received Date */}
                      <td className="py-3 px-3.5 text-slate-400 text-[11px] whitespace-nowrap">
                        {formatDate(item.createdAt)}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3.5 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {isSchoolProposal && !isConverted && (
                            <button
                              type="button"
                              disabled={approvingId === item.id}
                              onClick={() => void approveSchool(item)}
                              className="min-h-7 px-2.5 rounded-lg bg-brand-red hover:bg-red-700 text-white text-[10px] font-black inline-flex items-center gap-1 shadow-sm transition-all"
                            >
                              {approvingId === item.id ? <Loader2 className="animate-spin" size={11} /> : <Building2 size={11} />}
                              Approve
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setSelected(item)}
                            className="min-h-7 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-[10px] font-bold inline-flex items-center gap-1"
                          >
                            Details <ChevronRight size={11} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Slide-over / Modal Lead Workspace */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-xs p-0 sm:p-4 animate-fadeIn">
          <div className="h-full sm:h-auto sm:max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-none sm:rounded-3xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col">
            
            {/* Drawer Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3 sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur z-10">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-brand-red">
                  <Database size={12} /> Lead Record #{selected.id?.slice(0, 8)}
                </div>
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white truncate mt-0.5">
                  {selected.name || selected.fullName || 'Unnamed Lead'}
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Received {formatDate(selected.createdAt, true)}
                </p>
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={copyAllJson}
                  className="min-h-8 px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1"
                >
                  {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                  {copied ? 'Copied' : 'JSON'}
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="min-h-8 min-w-8 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Drawer Content */}
            <div className="p-4 sm:p-6 space-y-4 text-xs flex-1">
              
              {/* Quick Contact Ribbon */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-0.5">Email Address</span>
                  {selected.email ? (
                    <a href={`mailto:${selected.email}`} className="font-bold text-brand-red hover:underline break-all">
                      {selected.email}
                    </a>
                  ) : (
                    <span className="text-slate-400 font-medium">Not provided</span>
                  )}
                </div>

                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-0.5">Phone Contact</span>
                  {selected.phone ? (
                    <a href={`tel:${selected.phone}`} className="font-bold text-slate-800 dark:text-slate-200 hover:underline">
                      {selected.phone}
                    </a>
                  ) : (
                    <span className="text-slate-400 font-medium">Not provided</span>
                  )}
                </div>
              </div>

              {/* School Proposal 1-Click Action if relevant */}
              {String(selected.type || '').toUpperCase() === 'SCHOOL_PARTNERSHIP_PROPOSAL' && !selected.schoolId && (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/30 dark:to-orange-950/20 border border-red-200 dark:border-red-900/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h3 className="font-black text-slate-900 dark:text-white text-xs">
                      Partner School Onboarding Ready
                    </h3>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                      Create school record and generate access credentials.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={approvingId === selected.id}
                    onClick={() => void approveSchool(selected)}
                    className="min-h-9 px-3.5 rounded-xl bg-brand-red hover:bg-red-700 text-white font-black text-xs inline-flex items-center justify-center gap-1.5 shadow-sm transition-all flex-shrink-0"
                  >
                    {approvingId === selected.id ? <Loader2 className="animate-spin" size={13} /> : <Building2 size={13} />}
                    Approve & Onboard School
                  </button>
                </div>
              )}

              {/* Navigation Tabs inside Drawer */}
              <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 pb-2 overflow-x-auto">
                {[
                  { id: 'details', label: 'Captured Data' },
                  { id: 'email', label: '✉️ Send Email (Resend)' },
                  { id: 'crm', label: 'Pipeline & Notes' },
                  { id: 'raw', label: 'All Fields' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setOpenSection(tab.id as any)}
                    className={`min-h-8 px-3 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                      openSection === tab.id
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* TAB 1: Captured Data */}
              {openSection === 'details' && (
                <div className="space-y-3">
                  <div className="rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                    {selected.message && (
                      <div className="p-3.5 bg-slate-50/50 dark:bg-slate-950/30">
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block mb-1">Message / Request</span>
                        <p className="text-xs leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                          {selected.message}
                        </p>
                      </div>
                    )}

                    {selected.schoolName && (
                      <div className="p-3 flex justify-between">
                        <span className="text-slate-400">Institution Name:</span>
                        <span className="font-bold text-slate-900 dark:text-white">{selected.schoolName}</span>
                      </div>
                    )}

                    {selected.program && (
                      <div className="p-3 flex justify-between">
                        <span className="text-slate-400">Program Track:</span>
                        <span className="font-bold text-brand-red">{selected.program}</span>
                      </div>
                    )}

                    {selected.experience && (
                      <div className="p-3 flex justify-between">
                        <span className="text-slate-400">Experience / Level:</span>
                        <span className="font-medium text-slate-700 dark:text-slate-300">{selected.experience}</span>
                      </div>
                    )}

                    {selected.cvLink && (
                      <div className="p-3 flex justify-between items-center">
                        <span className="text-slate-400">CV / Portfolio Link:</span>
                        <a href={selected.cvLink} target="_blank" rel="noopener noreferrer" className="text-brand-red font-bold inline-flex items-center gap-1 hover:underline">
                          View File <ExternalLink size={11} />
                        </a>
                      </div>
                    )}

                    <div className="p-3 flex justify-between">
                      <span className="text-slate-400">Ingestion Source:</span>
                      <span className="font-mono text-[11px] text-slate-500">{selected.source || selected.type || 'Web Form'}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB: Send Email via Resend */}
              {openSection === 'email' && (
                <form onSubmit={handleSendClientEmail} className="space-y-3">
                  <div className="p-3.5 rounded-2xl bg-slate-900 text-white border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Mail size={15} className="text-rose-400" />
                        <span className="font-bold text-xs">Direct Email to Client</span>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded-md border border-emerald-500/30">
                        Resend API
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                      <span>Recipient:</span>
                      <span className="font-mono text-white font-bold">{selected.email || 'No email on file'}</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                      Email Subject
                    </label>
                    <input
                      type="text"
                      required
                      value={emailDraft.subject}
                      onChange={e => setEmailDraft({ ...emailDraft, subject: e.target.value })}
                      placeholder="e.g. Follow up on your Coding & Tech Inquiry"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                      Message Body (Branded HTML Template)
                    </label>
                    <textarea
                      rows={6}
                      required
                      value={emailDraft.message}
                      onChange={e => setEmailDraft({ ...emailDraft, message: e.target.value })}
                      placeholder="Type your message to the client..."
                      className={`${inputClass} leading-relaxed`}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                        Action Button URL (Optional)
                      </label>
                      <input
                        type="url"
                        value={emailDraft.actionUrl}
                        onChange={e => setEmailDraft({ ...emailDraft, actionUrl: e.target.value })}
                        placeholder="https://jaystarbliss-studios.name.ng/..."
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                        Button Label (Optional)
                      </label>
                      <input
                        type="text"
                        value={emailDraft.actionText}
                        onChange={e => setEmailDraft({ ...emailDraft, actionText: e.target.value })}
                        placeholder="e.g. View Portal / Schedule Call"
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={sendingEmail || !selected.email}
                    className="w-full min-h-10 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-black text-xs inline-flex items-center justify-center gap-2 shadow-sm transition-all"
                  >
                    {sendingEmail ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
                    <span>{sendingEmail ? 'Dispatching Email via Resend...' : `Send Email to ${selected.name || 'Client'}`}</span>
                  </button>
                </form>
              )}

              {/* TAB 2: CRM & Notes */}
              {openSection === 'crm' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Pipeline Stage</label>
                      <select
                        value={draft.status}
                        onChange={e => setDraft({ ...draft, status: e.target.value as LeadStage })}
                        className={inputClass}
                      >
                        {STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Assigned Staff Owner</label>
                      <input
                        value={draft.assignedTo}
                        onChange={e => setDraft({ ...draft, assignedTo: e.target.value })}
                        placeholder="e.g. Admissions Team"
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Scheduled Next Follow-Up</label>
                    <input
                      type="date"
                      value={draft.nextFollowUp}
                      onChange={e => setDraft({ ...draft, nextFollowUp: e.target.value })}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Internal Confidential Notes</label>
                    <textarea
                      rows={5}
                      value={draft.internalNotes}
                      onChange={e => setDraft({ ...draft, internalNotes: e.target.value })}
                      placeholder="Add follow-up notes, call logs, requirements..."
                      className={`${inputClass} leading-relaxed`}
                    />
                  </div>

                  <button
                    type="button"
                    disabled={saving}
                    onClick={saveDrawerDraft}
                    className="w-full min-h-10 rounded-xl bg-brand-red hover:bg-red-700 text-white font-black text-xs inline-flex items-center justify-center gap-1.5 shadow-sm transition-all"
                  >
                    {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                    Save Pipeline Changes
                  </button>
                </div>
              )}

              {/* TAB 3: All raw key-values */}
              {openSection === 'raw' && (
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden text-[11px]">
                  {Object.entries(selected).filter(([k]) => k !== 'id').map(([k, val]) => (
                    <div key={k} className="p-2.5 grid grid-cols-3 gap-2">
                      <span className="text-slate-400 font-bold uppercase text-[9px]">{displayKey(k)}</span>
                      <pre className="col-span-2 whitespace-pre-wrap break-words font-mono text-[10px] text-slate-700 dark:text-slate-300">
                        {serialise(val)}
                      </pre>
                    </div>
                  ))}
                </div>
              )}

            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminInquiries;
