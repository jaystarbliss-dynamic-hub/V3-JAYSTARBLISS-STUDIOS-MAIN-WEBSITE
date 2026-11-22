import React, { useState, useEffect, useMemo } from 'react';
import {
  Phone,
  Mail,
  MapPin,
  Send,
  HelpCircle,
  Clock,
  CheckCircle2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  ArrowUpRight,
  Copy,
  Check,
  Headphones,
  MessageSquare,
  ShieldCheck,
  User,
  Loader2,
  BookOpen,
  CreditCard,
  CalendarDays,
  Building2,
  KeyRound,
} from 'lucide-react';
import {
  collection,
  addDoc,
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
  query,
  where,
  onSnapshot,
  limit,
} from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { dispatchActionableAlert } from '../../lib/adminAlertDispatcher';
import { useToast } from '../../contexts/ToastContext';
import SEO from '../../components/ui/SEO';
import { getEffectiveAuth } from '../../utils/impersonation';
import supportHeroArt from '../../assets/images/support_center_editorial_3d_1795295814643.jpg';

interface SupportChannels {
  primaryPhone: string;
  secondaryPhone: string;
  supportWhatsapp: string;
  supportEmail: string;
  generalEmail: string;
  address: string;
  googleBusinessUrl: string;
}

interface TicketMessage {
  id: string;
  sender: 'user' | 'admin';
  senderName: string;
  text: string;
  timestamp?: string;
}

interface RecentTicket {
  id: string;
  subject: string;
  category: string;
  status: string;
  createdAt?: any;
  updatedAt?: any;
  unreadByUser?: boolean;
  lastReplyBy?: 'user' | 'admin';
  messages: TicketMessage[];
}

const DEFAULT_SUPPORT_CHANNELS: SupportChannels = {
  primaryPhone: '+234 913 651 8194',
  secondaryPhone: '+234 913 052 9010',
  supportWhatsapp: '+234 707 763 8925',
  supportEmail: 'support@jaystarblissstudios.com',
  generalEmail: 'jaystarblissstudios@gmail.com',
  address: 'Lagos, Nigeria',
  googleBusinessUrl: 'https://share.google/mqVU8pAgKEDjOfGHe',
};

const DESK_TOPICS = [
  { label: 'Portal Login & Access', icon: KeyRound },
  { label: 'Billing & Subscriptions', icon: CreditCard },
  { label: 'Live Classes & Schedule', icon: CalendarDays },
  { label: 'Resources & Assessments', icon: BookOpen },
  { label: 'School Partnership Support', icon: Building2 },
  { label: 'General Inquiry', icon: HelpCircle },
] as const;

const WhatsAppGlyph: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2zm.01 1.67c2.2 0 4.26.86 5.82 2.42a8.188 8.188 0 012.41 5.82c0 4.54-3.7 8.24-8.24 8.24-1.44 0-2.84-.38-4.08-1.1l-.29-.17-3.03.79.81-2.95-.19-.3a8.216 8.216 0 01-1.26-4.33c0-4.54 3.7-8.24 8.24-8.24l.02-.18zm4.51 11.59c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.02-1.25-.75-.67-1.25-1.5-1.4-1.75-.14-.25-.02-.39.11-.51.11-.11.25-.29.38-.44.13-.14.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.47c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1s.9 2.44 1.03 2.61c.13.17 1.78 2.72 4.31 3.81.6.26 1.07.41 1.44.53.61.19 1.16.17 1.6.1.49-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.15-1.18-.07-.12-.23-.19-.48-.31z" />
  </svg>
);

const digitsOnly = (value: string) => value.replace(/\D/g, '');

const normalizeSupportEmail = (raw: unknown): string => {
  const email = String(raw || '').trim().toLowerCase();
  if (!email || email.includes('jaystarbliss-studios.name.ng') || email === 'support@jaystarbliss.com') {
    return DEFAULT_SUPPORT_CHANNELS.supportEmail;
  }
  return email;
};

const toMillis = (value: any): number => {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  if (typeof value === 'string') {
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

const statusPillStyle = (status: string) => {
  const s = status.toUpperCase();
  if (s === 'RESOLVED') return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/50';
  if (s === 'IN_PROGRESS') return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/50';
  if (s === 'CLOSED') return 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700';
  return 'bg-red-50 text-[#B91C1C] border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900/50';
};

const PortalSupport: React.FC = () => {
  const { toast } = useToast();
  const effective = getEffectiveAuth();
  const user = auth.currentUser;

  const userEmail = (
    effective.effectiveEmail ||
    user?.email ||
    sessionStorage.getItem('userEmail') ||
    ''
  ).toLowerCase();
  const userName =
    effective.effectiveName ||
    sessionStorage.getItem('userName') ||
    user?.displayName ||
    userEmail.split('@')[0] ||
    'Portal User';
  const userUid = effective.effectiveUid || user?.uid || '';
  const userRole = (
    effective.effectiveRole ||
    sessionStorage.getItem('userRole') ||
    'student'
  ).toLowerCase();
  const schoolName = sessionStorage.getItem('schoolName') || '';

  // Official studio contact channels loaded from Firestore settings/global
  const [channels, setChannels] = useState<SupportChannels>(DEFAULT_SUPPORT_CHANNELS);

  // WhatsApp Support Desk composer state
  const [selectedTopic, setSelectedTopic] = useState<string>(DESK_TOPICS[0].label);
  const [whatsappMessage, setWhatsappMessage] = useState('');

  // Support Ticket form state
  const [category, setCategory] = useState('General Support');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [ticketSubmittedId, setTicketSubmittedId] = useState<string | null>(null);
  const [recentTickets, setRecentTickets] = useState<RecentTicket[]>([]);

  // Interactive ticket thread state
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null);
  const [followUpText, setFollowUpText] = useState<Record<string, string>>({});
  const [sendingFollowUpId, setSendingFollowUpId] = useState<string | null>(null);

  // Utility UI state
  const [activeFaq, setActiveFaq] = useState<number | null>(0);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadChannels = async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'global'));
        if (!snap.exists() || !active) return;
        const data = snap.data() || {};
        setChannels({
          primaryPhone: String(data.contactPhone || DEFAULT_SUPPORT_CHANNELS.primaryPhone).trim(),
          secondaryPhone: String(
            data.secondaryPhone || data.infoWhatsapp || DEFAULT_SUPPORT_CHANNELS.secondaryPhone
          ).trim(),
          supportWhatsapp: String(
            data.supportWhatsapp || DEFAULT_SUPPORT_CHANNELS.supportWhatsapp
          ).trim(),
          supportEmail: normalizeSupportEmail(data.supportEmail),
          generalEmail: String(data.contactEmail || DEFAULT_SUPPORT_CHANNELS.generalEmail).trim(),
          address: String(data.address || DEFAULT_SUPPORT_CHANNELS.address).trim(),
          googleBusinessUrl: String(
            data.googleBusinessUrl || DEFAULT_SUPPORT_CHANNELS.googleBusinessUrl
          ).trim(),
        });
      } catch (err) {
        console.warn('Could not load global support settings:', err);
      }
    };
    void loadChannels();
    return () => {
      active = false;
    };
  }, []);

  // Load user's support tickets in real-time (matches userId or userEmail)
  useEffect(() => {
    if (!userEmail && !userUid) return;
    const filterField = userUid ? 'userId' : 'userEmail';
    const filterVal = userUid || userEmail;
    const q = query(
      collection(db, 'supportTickets'),
      where(filterField, '==', filterVal),
      limit(15)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items: RecentTicket[] = snap.docs
          .map((d) => {
            const data = d.data() || {};
            const msgs: TicketMessage[] = Array.isArray(data.messages)
              ? data.messages.map((m: any, idx: number) => ({
                  id: String(m?.id || `msg_${idx}`),
                  sender: m?.sender === 'admin' ? 'admin' : 'user',
                  senderName: String(m?.senderName || (m?.sender === 'admin' ? 'Jaystarbliss Support' : userName)),
                  text: String(m?.text || ''),
                  timestamp: m?.timestamp || '',
                }))
              : [];
            return {
              id: d.id,
              subject: String(data.subject || 'Support Request'),
              category: String(data.category || 'General Support'),
              status: String(data.status || 'OPEN').toUpperCase(),
              createdAt: data.createdAt,
              updatedAt: data.updatedAt || data.createdAt,
              unreadByUser: data.unreadByUser === true,
              lastReplyBy: (data.lastReplyBy === 'admin' ? 'admin' : 'user') as 'admin' | 'user',
              messages: msgs,
            };
          })
          .sort((a, b) => Math.max(toMillis(b.updatedAt), toMillis(b.createdAt)) - Math.max(toMillis(a.updatedAt), toMillis(a.createdAt)));
        setRecentTickets(items);
      },
      (err) => {
        console.warn('Support tickets listener note:', err);
      }
    );
    return () => unsub();
  }, [userEmail, userUid, userName]);

  const supportWhatsappDigits = useMemo(
    () => digitsOnly(channels.supportWhatsapp) || '2347077638925',
    [channels.supportWhatsapp]
  );

  const quickWhatsappHref = useMemo(() => {
    const text = `Hello Support Desk, my name is ${userName} (${userRole} portal). I need assistance.`;
    return `https://wa.me/${supportWhatsappDigits}?text=${encodeURIComponent(text)}`;
  }, [supportWhatsappDigits, userName, userRole]);

  const composedWhatsappHref = useMemo(() => {
    const body = whatsappMessage.trim();
    const lines = [
      `Hello Support Desk,`,
      `Name: ${userName}`,
      userEmail ? `Email: ${userEmail}` : null,
      `Portal Role: ${userRole}`,
      `Topic: ${selectedTopic}`,
      '',
      body || `I need help regarding ${selectedTopic.toLowerCase()}.`,
    ].filter((line): line is string => line !== null);
    return `https://wa.me/${supportWhatsappDigits}?text=${encodeURIComponent(lines.join('\n'))}`;
  }, [supportWhatsappDigits, userName, userEmail, userRole, selectedTopic, whatsappMessage]);

  const handleCopy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      toast.success('Copied to clipboard.');
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      toast.error('Could not copy to clipboard.');
    }
  };

  const handleSubmitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      toast.error('Please enter a subject and details for your inquiry.');
      return;
    }

    setSubmitting(true);
    try {
      const ticketRef = await addDoc(collection(db, 'supportTickets'), {
        userId: userUid || null,
        userName,
        userEmail,
        userRole,
        schoolName: schoolName || null,
        category,
        subject: subject.trim(),
        status: 'OPEN',
        priority: 'NORMAL',
        unreadByAdmin: true,
        unreadByUser: false,
        lastReplyBy: 'user',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        messages: [
          {
            id: `msg_${Date.now()}`,
            sender: 'user',
            senderName: userName,
            text: message.trim(),
            timestamp: new Date().toISOString(),
          },
        ],
      });

      await addDoc(collection(db, 'contact_messages'), {
        name: userName,
        email: userEmail,
        subject: `[${category}] ${subject.trim()}`,
        message: message.trim(),
        role: userRole,
        source: 'portal_support_center',
        createdAt: serverTimestamp(),
      }).catch(() => undefined);

      const resolvedSchoolId =
        sessionStorage.getItem('schoolId') ||
        sessionStorage.getItem('schoolDocId') ||
        localStorage.getItem('jaystar_cached_school_id') ||
        null;

      void dispatchActionableAlert({
        category: 'support_ticket',
        categoryLabel: 'Portal Support Ticket',
        notificationType: 'support_ticket',
        priority: 'high',
        title: `New Support Ticket: ${subject.trim()}`,
        message: `${userName} (${userRole}${schoolName ? ` • ${schoolName}` : ''}) opened a ${category} support ticket: "${message.trim().slice(0, 180)}"`,
        actionPath: '/admin/support',
        schoolActionPath: '/portal/school/support',
        actionText: 'Open Support Center',
        schoolId: userRole === 'student' ? resolvedSchoolId : null,
        schoolName: schoolName || null,
        notifyPlatformAdmins: true,
        details: [
          { label: 'Submitted By', value: `${userName} (${userRole})` },
          { label: 'Email', value: userEmail || '—' },
          { label: 'Category', value: category },
          { label: 'Ticket Ref', value: `#${ticketRef.id.slice(0, 8).toUpperCase()}` },
        ],
        senderName: userName,
        senderRole: userRole,
        replyTo: userEmail || undefined,
        dedupeKey: `ticket_${ticketRef.id}`,
      });

      setTicketSubmittedId(ticketRef.id.slice(0, 8).toUpperCase());
      setExpandedTicketId(ticketRef.id);
      setSubject('');
      setMessage('');
      toast.success('Support ticket logged successfully.');
    } catch (error: any) {
      toast.error(error?.message || 'Could not submit support ticket.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleTicket = (ticket: RecentTicket) => {
    const nextOpen = expandedTicketId === ticket.id ? null : ticket.id;
    setExpandedTicketId(nextOpen);
    if (nextOpen && ticket.unreadByUser) {
      void updateDoc(doc(db, 'supportTickets', ticket.id), {
        unreadByUser: false,
      }).catch(() => undefined);
    }
  };

  const handleSendFollowUp = async (ticket: RecentTicket) => {
    const text = (followUpText[ticket.id] || '').trim();
    if (!text) return;
    setSendingFollowUpId(ticket.id);
    try {
      await updateDoc(doc(db, 'supportTickets', ticket.id), {
        messages: arrayUnion({
          id: `usr_${Date.now()}`,
          sender: 'user',
          senderName: userName,
          text,
          timestamp: new Date().toISOString(),
        }),
        lastReplyBy: 'user',
        unreadByAdmin: true,
        unreadByUser: false,
        updatedAt: serverTimestamp(),
      });
      setFollowUpText((prev) => ({ ...prev, [ticket.id]: '' }));
      toast.success('Follow-up sent to Support Team.');
    } catch (err: any) {
      toast.error(err?.message || 'Could not send follow-up.');
    } finally {
      setSendingFollowUpId(null);
    }
  };

  const faqs = [
    {
      q: 'How do I join my scheduled live classroom?',
      a: 'Open "Live Classrooms" from your portal sidebar to view your upcoming sessions. When a class is active, click the join button to enter your assigned classroom link.',
    },
    {
      q: 'How do school administrators onboard students and issue login codes?',
      a: 'Go to the Learners Roster in your School Portal, add a student with their class and programme track, and generate their portal access credentials directly from Student Access.',
    },
    {
      q: 'How do parents enroll another child or check billing status?',
      a: 'From the Parent Dashboard, select "Enroll New Child" to submit an enrollment request, or open the Payments & Fees tab to view active subscriptions and payment history.',
    },
    {
      q: 'Where can students access lesson notes, worksheets, and assessments?',
      a: 'Students can view and download study materials under "Lesson Resources" and complete scheduled quizzes or CBT exams under "Assessments & Work".',
    },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-7 pb-16">
      <SEO
        title="Support Center | Jaystarbliss Studios"
        description="Contact our Support Desk directly via WhatsApp, official phone lines, email, or submit a support ticket."
        noindex={true}
      />

      {/* Editorial 3D Hero Banner */}
      <header className="relative rounded-3xl overflow-hidden border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#111114] shadow-xs">
        <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">
          <img
            src={supportHeroArt}
            alt=""
            aria-hidden="true"
            className="absolute right-0 top-0 h-full w-full md:w-[58%] object-cover object-center opacity-35 md:opacity-95 dark:opacity-30 md:dark:opacity-45"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-white via-white/95 to-white/10 dark:from-[#111114] dark:via-[#111114]/92 dark:to-[#111114]/25" />
        </div>

        <div className="relative z-10 px-6 sm:px-8 py-8 sm:py-10 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="space-y-2.5 max-w-xl">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-[#B91C1C]">
              <Headphones size={13} />
              <span>Help &amp; Assistance</span>
            </span>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-[#14284B] dark:text-white">
              Support Center
            </h1>
            <p className="text-sm text-slate-600 dark:text-zinc-300 leading-relaxed">
              Reach our team directly on WhatsApp, by phone, or via email for help with accounts, classes, billing, and school portals.
            </p>
            <div className="w-12 h-1 rounded-full bg-[#B91C1C] pt-0.5" />
          </div>

          <a
            href={quickWhatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl bg-[#14284B] hover:bg-[#B91C1C] dark:bg-[#B91C1C] dark:hover:bg-[#991B1B] text-white text-sm font-semibold transition-colors shadow-md shrink-0 w-full sm:w-fit"
          >
            <WhatsAppGlyph className="w-4 h-4 shrink-0 text-[#25D366] dark:text-white" />
            <span>Chat with us on WhatsApp</span>
            <ArrowUpRight size={15} className="opacity-90" />
          </a>
        </div>
      </header>

      {/* Official Contact Channels Strip (4 Clean Cards) */}
      <section aria-label="Official contact channels" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Direct Phone Lines */}
        <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-5 flex flex-col justify-between gap-4 shadow-2xs">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-zinc-800 text-[#14284B] dark:text-zinc-200 flex items-center justify-center shrink-0">
              <Phone size={17} />
            </div>
            <div className="min-w-0 space-y-1">
              <h2 className="text-xs font-bold text-slate-900 dark:text-white">Direct Phone Lines</h2>
              <a
                href={`tel:${channels.primaryPhone.replace(/\s+/g, '')}`}
                className="block text-sm font-bold text-[#14284B] dark:text-zinc-100 hover:text-[#B91C1C] transition-colors tabular-nums"
              >
                {channels.primaryPhone}
              </a>
              <a
                href={`tel:${channels.secondaryPhone.replace(/\s+/g, '')}`}
                className="block text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:text-[#B91C1C] transition-colors tabular-nums"
              >
                {channels.secondaryPhone}
              </a>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-zinc-400 flex items-center gap-1.5 tabular-nums pt-2 border-t border-slate-100 dark:border-zinc-800/80">
            <Clock size={12} className="shrink-0" />
            <span>Mon–Fri: 9am–6pm · Sat: 10am–4pm</span>
          </p>
        </div>

        {/* Support Email */}
        <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-5 flex flex-col justify-between gap-4 shadow-2xs">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/40 text-[#B91C1C] dark:text-red-400 flex items-center justify-center shrink-0">
              <Mail size={17} />
            </div>
            <div className="min-w-0 space-y-1">
              <h2 className="text-xs font-bold text-slate-900 dark:text-white">Support Email</h2>
              <a
                href={`mailto:${channels.supportEmail}`}
                className="block text-xs sm:text-sm font-bold text-[#14284B] dark:text-zinc-100 hover:text-[#B91C1C] transition-colors break-all"
              >
                {channels.supportEmail}
              </a>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                We typically respond within 24 hours
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleCopy(channels.supportEmail, 'email')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:text-[#14284B] dark:hover:text-white transition-colors w-fit pt-2 border-t border-slate-100 dark:border-zinc-800/80 cursor-pointer"
          >
            {copiedKey === 'email' ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
            <span>{copiedKey === 'email' ? 'Email copied' : 'Copy support email'}</span>
          </button>
        </div>

        {/* WhatsApp Desk */}
        <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-5 flex flex-col justify-between gap-4 shadow-2xs">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-[#168A41] dark:text-[#25D366] flex items-center justify-center shrink-0">
              <WhatsAppGlyph className="w-5 h-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <h2 className="text-xs font-bold text-slate-900 dark:text-white">WhatsApp Desk</h2>
              <p className="text-sm font-bold text-[#14284B] dark:text-zinc-100 tabular-nums">
                {channels.supportWhatsapp}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                Quick help via WhatsApp
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-zinc-800/80">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Online
            </span>
            <a
              href={quickWhatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#14284B] dark:text-zinc-200 hover:text-[#B91C1C]"
            >
              <span>Open chat</span>
              <ExternalLink size={11} />
            </a>
          </div>
        </div>

        {/* Our Location */}
        <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-5 flex flex-col justify-between gap-4 shadow-2xs">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-zinc-800 text-[#14284B] dark:text-zinc-200 flex items-center justify-center shrink-0">
              <MapPin size={17} />
            </div>
            <div className="min-w-0 space-y-1">
              <h2 className="text-xs font-bold text-slate-900 dark:text-white">Our Location</h2>
              <p className="text-sm font-bold text-[#14284B] dark:text-zinc-100 leading-snug">
                {channels.address}
              </p>
            </div>
          </div>
          {channels.googleBusinessUrl && (
            <a
              href={channels.googleBusinessUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#14284B] dark:text-zinc-200 hover:text-[#B91C1C] transition-colors w-fit pt-2 border-t border-slate-100 dark:border-zinc-800/80"
            >
              <span>View Business Profile</span>
              <ArrowUpRight size={12} />
            </a>
          )}
        </div>
      </section>

      {/* Main 2-Column Workspace: Support Desk (WhatsApp) + Log a Support Ticket */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Support Desk via WhatsApp (7 Cols) */}
        <section className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#111114] overflow-hidden shadow-2xs">
          <div className="px-6 py-5 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-zinc-800 text-[#14284B] dark:text-white flex items-center justify-center shrink-0">
                <MessageSquare size={18} />
              </div>
              <div>
                <h2 className="text-base font-bold text-[#14284B] dark:text-white">Support Desk</h2>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  Have a question or need help? Send us a message directly from here.
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 text-[11px] font-bold shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Online
            </span>
          </div>

          <div className="p-6 space-y-5">
            {/* Topic selector */}
            <div className="space-y-2.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300">
                What do you need help with?
              </label>
              <div className="flex flex-wrap gap-2">
                {DESK_TOPICS.map(({ label, icon: Icon }) => {
                  const active = selectedTopic === label;
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setSelectedTopic(label)}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#14284B] text-white border-[#14284B] dark:bg-[#B91C1C] dark:border-[#B91C1C]'
                          : 'bg-white dark:bg-[#18181B] text-slate-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-800 hover:border-[#14284B]/50 dark:hover:border-zinc-600'
                      }`}
                    >
                      <Icon size={13} className={active ? 'text-white' : 'text-slate-400'} />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Message box */}
            <div className="space-y-2">
              <label
                htmlFor="support-desk-whatsapp-msg"
                className="block text-xs font-bold text-slate-700 dark:text-zinc-300"
              >
                Your Message
              </label>
              <textarea
                id="support-desk-whatsapp-msg"
                rows={5}
                value={whatsappMessage}
                onChange={(e) => setWhatsappMessage(e.target.value)}
                placeholder="Describe your question or issue here. Your name, portal role, and selected topic will be included automatically when WhatsApp opens."
                className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-[#18181B] px-3.5 py-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#14284B]/20 dark:focus:ring-[#B91C1C]/30 focus:border-[#14284B] dark:focus:border-[#B91C1C] resize-none"
              />
            </div>

            {/* Action bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Opens WhatsApp directly with your message pre-filled.
              </p>
              <a
                href={composedWhatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl bg-[#14284B] hover:bg-[#1E3A6D] dark:bg-[#B91C1C] dark:hover:bg-[#991B1B] text-white text-sm font-semibold transition-colors shadow-xs shrink-0"
              >
                <WhatsAppGlyph className="w-4 h-4 shrink-0 text-[#25D366] dark:text-white" />
                <span>Send Message on WhatsApp</span>
                <ArrowUpRight size={14} />
              </a>
            </div>
          </div>
        </section>

        {/* Right Column: Log a Support Ticket (5 Cols) */}
        <section className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#111114] overflow-hidden shadow-2xs">
          <div className="px-6 py-5 border-b border-slate-200 dark:border-zinc-800 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/40 text-[#B91C1C] dark:text-red-400 flex items-center justify-center shrink-0">
              <Send size={17} />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#14284B] dark:text-white">Log a Support Ticket</h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                Prefer a tracked request? Submit a ticket for our administrative team to follow up.
              </p>
            </div>
          </div>

          <div className="p-6 space-y-5">
            {ticketSubmittedId && (
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 p-3.5 flex items-start gap-2.5">
                <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-900 dark:text-emerald-200 space-y-0.5">
                  <p className="font-semibold">Ticket #{ticketSubmittedId} received</p>
                  <p className="text-emerald-700 dark:text-emerald-300/80">
                    Our admin team has received your ticket. Replies appear live below.
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmitTicket} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full h-10 rounded-xl border border-slate-200 dark:border-zinc-800 px-3 text-sm bg-white dark:bg-[#18181B] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/30 focus:border-[#B91C1C]"
                >
                  <option value="General Support">General Support</option>
                  <option value="Billing & Subscriptions">Billing &amp; Subscriptions</option>
                  <option value="Admissions & Enrollment">Admissions &amp; Enrollment</option>
                  <option value="Live Classrooms">Live Classrooms &amp; Schedules</option>
                  <option value="School Onboarding">School Partner Onboarding</option>
                  <option value="Technical Issue">Login or Technical Issue</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                  Subject
                </label>
                <input
                  type="text"
                  required
                  placeholder="Brief summary of your request"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full h-10 rounded-xl border border-slate-200 dark:border-zinc-800 px-3 text-sm bg-white dark:bg-[#18181B] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/30 focus:border-[#B91C1C]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-zinc-300 mb-1.5">
                  Details
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="Include any relevant student name, school, or class details..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 p-3 text-sm bg-white dark:bg-[#18181B] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/30 focus:border-[#B91C1C] resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-11 rounded-xl bg-[#B91C1C] hover:bg-[#991B1B] text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-xs"
              >
                {submitting ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                <span>{submitting ? 'Submitting Ticket...' : 'Submit Ticket'}</span>
              </button>
            </form>
          </div>
        </section>
      </div>

      {/* Live Tracked Tickets & Admin Replies */}
      {recentTickets.length > 0 && (
        <section className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#111114] overflow-hidden shadow-2xs">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-[#14284B] dark:text-white">
                My Support Tickets ({recentTickets.length})
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Click any ticket below to view replies from our Support Team or add a follow-up message.
              </p>
            </div>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-zinc-800">
            {recentTickets.map((ticket) => {
              const isOpen = expandedTicketId === ticket.id;
              return (
                <div key={ticket.id}>
                  <button
                    type="button"
                    onClick={() => handleToggleTicket(ticket)}
                    className="w-full px-6 py-4 text-left flex items-center justify-between gap-4 hover:bg-slate-50/70 dark:hover:bg-zinc-900/50 transition-colors cursor-pointer"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[11px] font-bold text-slate-400 dark:text-zinc-500">
                          #{ticket.id.slice(0, 8).toUpperCase()}
                        </span>
                        <span className="text-sm font-bold text-[#14284B] dark:text-white truncate">
                          {ticket.subject}
                        </span>
                        {ticket.unreadByUser && (
                          <span className="px-2 py-0.5 rounded-full bg-[#B91C1C] text-white text-[10px] font-bold">
                            New admin reply
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-zinc-400">
                        {ticket.category} · {ticket.messages.length} message{ticket.messages.length === 1 ? '' : 's'}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span
                        className={`px-2.5 py-0.5 rounded-md border text-[11px] font-bold ${statusPillStyle(
                          ticket.status
                        )}`}
                      >
                        {ticket.status.replace('_', ' ')}
                      </span>
                      {isOpen ? (
                        <ChevronUp size={16} className="text-slate-400" />
                      ) : (
                        <ChevronDown size={16} className="text-slate-400" />
                      )}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-6 pb-5 pt-2 bg-[#F7F9FC] dark:bg-[#09090B] border-t border-slate-100 dark:border-zinc-800/80 space-y-4">
                      <div className="space-y-3 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
                        {ticket.messages.map((msg) => {
                          const isAdmin = msg.sender === 'admin';
                          return (
                            <div
                              key={msg.id}
                              className={`flex flex-col ${isAdmin ? 'items-start' : 'items-end'}`}
                            >
                              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-zinc-400 mb-1 px-1">
                                {isAdmin ? (
                                  <ShieldCheck size={12} className="text-[#B91C1C]" />
                                ) : (
                                  <User size={12} className="text-[#14284B] dark:text-zinc-400" />
                                )}
                                <span>{isAdmin ? msg.senderName || 'Jaystarbliss Support' : 'You'}</span>
                              </div>
                              <div
                                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                                  isAdmin
                                    ? 'bg-white dark:bg-[#18181B] text-slate-800 dark:text-zinc-100 border border-slate-200 dark:border-zinc-800 rounded-tl-sm'
                                    : 'bg-[#14284B] dark:bg-[#B91C1C] text-white rounded-tr-sm'
                                }`}
                              >
                                {msg.text}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {ticket.status !== 'CLOSED' && (
                        <div className="flex items-center gap-2 pt-2 border-t border-slate-200/70 dark:border-zinc-800">
                          <input
                            type="text"
                            value={followUpText[ticket.id] || ''}
                            onChange={(e) =>
                              setFollowUpText((prev) => ({ ...prev, [ticket.id]: e.target.value }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                void handleSendFollowUp(ticket);
                              }
                            }}
                            placeholder="Write a follow-up message..."
                            className="flex-1 h-10 px-3.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#18181B] text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-[#B91C1C]"
                          />
                          <button
                            type="button"
                            disabled={sendingFollowUpId === ticket.id || !(followUpText[ticket.id] || '').trim()}
                            onClick={() => void handleSendFollowUp(ticket)}
                            className="h-10 px-4 rounded-xl bg-[#14284B] hover:bg-[#B91C1C] text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer shrink-0"
                          >
                            {sendingFollowUpId === ticket.id ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Send size={13} />
                            )}
                            <span>Send</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Frequently Asked Questions */}
      <section className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#111114] overflow-hidden shadow-2xs">
        <div className="px-6 py-5 border-b border-slate-200 dark:border-zinc-800 flex items-center gap-2.5">
          <HelpCircle size={18} className="text-[#B91C1C] shrink-0" />
          <div>
            <h2 className="text-base font-bold text-[#14284B] dark:text-white">
              Frequently Asked Questions
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Quick answers for students, parents, schools, and tutors.
            </p>
          </div>
        </div>

        <div className="divide-y divide-slate-200 dark:divide-zinc-800">
          {faqs.map((faq, index) => {
            const isOpen = activeFaq === index;
            return (
              <div key={faq.q}>
                <button
                  type="button"
                  onClick={() => setActiveFaq(isOpen ? null : index)}
                  className="w-full px-6 py-4 text-left flex items-center justify-between gap-4 text-sm font-semibold text-[#14284B] dark:text-white hover:bg-slate-50/70 dark:hover:bg-zinc-900/50 transition-colors cursor-pointer"
                >
                  <span>{faq.q}</span>
                  {isOpen ? (
                    <ChevronUp size={16} className="shrink-0 text-slate-400" />
                  ) : (
                    <ChevronDown size={16} className="shrink-0 text-slate-400" />
                  )}
                </button>
                {isOpen && (
                  <div className="px-6 pb-5 text-sm text-slate-600 dark:text-zinc-300 leading-relaxed">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default PortalSupport;
