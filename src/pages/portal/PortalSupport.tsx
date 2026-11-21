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
} from 'lucide-react';
import {
  collection,
  addDoc,
  doc,
  getDoc,
  serverTimestamp,
  query,
  where,
  onSnapshot,
  limit,
} from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { useToast } from '../../contexts/ToastContext';
import SEO from '../../components/ui/SEO';
import { getEffectiveAuth } from '../../utils/impersonation';

interface SupportChannels {
  primaryPhone: string;
  secondaryPhone: string;
  supportWhatsapp: string;
  supportEmail: string;
  generalEmail: string;
  address: string;
  googleBusinessUrl: string;
}

interface RecentTicket {
  id: string;
  subject: string;
  category: string;
  status: string;
  createdAt?: any;
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
  'Portal Login & Access',
  'Billing & Subscriptions',
  'Live Classes & Schedule',
  'Resources & Assessments',
  'School Partnership Support',
  'General Inquiry',
] as const;

const WhatsAppGlyph: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2zm.01 1.67c2.2 0 4.26.86 5.82 2.42a8.188 8.188 0 012.41 5.82c0 4.54-3.7 8.24-8.24 8.24-1.44 0-2.84-.38-4.08-1.1l-.29-.17-3.03.79.81-2.95-.19-.3a8.216 8.216 0 01-1.26-4.33c0-4.54 3.7-8.24 8.24-8.24l.02-.18zm4.51 11.59c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.02-1.25-.75-.67-1.25-1.5-1.4-1.75-.14-.25-.02-.39.11-.51.11-.11.25-.29.38-.44.13-.14.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.47c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1s.9 2.44 1.03 2.61c.13.17 1.78 2.72 4.31 3.81.6.26 1.07.41 1.44.53.61.19 1.16.17 1.6.1.49-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.15-1.18-.07-.12-.23-.19-.48-.31z" />
  </svg>
);

const digitsOnly = (value: string) => value.replace(/\D/g, '');

const normalizeSupportEmail = (raw: unknown): string => {
  const email = String(raw || '').trim().toLowerCase();
  if (
    !email ||
    email.includes('jaystarbliss-studios.name.ng') ||
    email === 'support@jaystarbliss.com'
  ) {
    return DEFAULT_SUPPORT_CHANNELS.supportEmail;
  }
  return email;
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

  // Official studio contact channels loaded from Firestore settings/global
  const [channels, setChannels] = useState<SupportChannels>(DEFAULT_SUPPORT_CHANNELS);

  // WhatsApp Support Desk composer state
  const [selectedTopic, setSelectedTopic] = useState<string>(DESK_TOPICS[0]);
  const [whatsappMessage, setWhatsappMessage] = useState('');

  // Support Ticket form state
  const [category, setCategory] = useState('General Support');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [ticketSubmittedId, setTicketSubmittedId] = useState<string | null>(null);
  const [recentTickets, setRecentTickets] = useState<RecentTicket[]>([]);

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

  // Load user's recent support tickets
  useEffect(() => {
    if (!userEmail) return;
    const q = query(
      collection(db, 'supportTickets'),
      where('userEmail', '==', userEmail),
      limit(5)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items: RecentTicket[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            subject: data.subject || 'Support Request',
            category: data.category || 'General Support',
            status: String(data.status || 'OPEN').toUpperCase(),
            createdAt: data.createdAt,
          };
        });
        setRecentTickets(items);
      },
      (err) => {
        console.warn('Support tickets listener note:', err);
      }
    );
    return () => unsub();
  }, [userEmail]);

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
        category,
        subject: subject.trim(),
        status: 'OPEN',
        priority: 'NORMAL',
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

      setTicketSubmittedId(ticketRef.id.slice(0, 8).toUpperCase());
      setSubject('');
      setMessage('');
      toast.success('Support ticket logged successfully.');
    } catch (error: any) {
      toast.error(error?.message || 'Could not submit support ticket.');
    } finally {
      setSubmitting(false);
    }
  };

  const faqs = [
    {
      q: 'How do I join my scheduled live classroom?',
      a: 'Open "Live Classrooms" from your portal sidebar to view your upcoming sessions. When a class is active, click the join button to enter your assigned classroom link.',
    },
    {
      q: 'How do school administrators onboard students and issue login codes?',
      a: 'Go to the Learners Roster in your School Portal, add a student with their class and programme track, and generate their portal access credentials directly from the roster.',
    },
    {
      q: 'How do parents enroll another child or check billing status?',
      a: 'From the Parent Dashboard, select "Enroll New Child" to submit an enrollment request, or open the Billing tab to view active subscriptions and payment history.',
    },
    {
      q: 'Where can students access lesson notes, worksheets, and assessments?',
      a: 'Students can view and download study materials under "Resource Library" and complete scheduled quizzes or CBT exams under "Assessments".',
    },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-16">
      <SEO
        title="Support Center | Jaystarbliss Studios"
        description="Contact our Support Desk directly via WhatsApp, official phone lines, email, or submit a support ticket."
        noindex={true}
      />

      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-red">
            Help &amp; Assistance
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Support Center
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xl">
            Reach our team directly on WhatsApp, by phone, or via email for help with accounts, classes, billing, and school portals.
          </p>
        </div>

        <a
          href={quickWhatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2.5 px-5 py-2.5 rounded-xl bg-[#25D366] hover:bg-[#1DA851] text-white text-sm font-semibold transition-colors shadow-xs shrink-0"
        >
          <WhatsAppGlyph className="w-4 h-4 shrink-0" />
          <span>Chat with us on WhatsApp</span>
          <ArrowUpRight size={15} className="opacity-90" />
        </a>
      </header>

      {/* Official Contact Channels Strip */}
      <section
        aria-label="Official contact channels"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B26] overflow-hidden"
      >
        {/* Direct Phone Lines */}
        <div className="p-5 flex flex-col justify-between gap-3">
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
              <Phone size={15} />
              <span className="text-xs font-semibold uppercase tracking-wider">Direct Phone Lines</span>
            </div>
            <div className="space-y-1.5">
              <a
                href={`tel:${channels.primaryPhone.replace(/\s+/g, '')}`}
                className="block text-sm font-semibold text-slate-900 dark:text-white hover:text-brand-red transition-colors tabular-nums"
              >
                {channels.primaryPhone}
              </a>
              <a
                href={`tel:${channels.secondaryPhone.replace(/\s+/g, '')}`}
                className="block text-sm font-semibold text-slate-700 dark:text-slate-300 hover:text-brand-red transition-colors tabular-nums"
              >
                {channels.secondaryPhone}
              </a>
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 tabular-nums">
            <Clock size={12} className="shrink-0" />
            <span>Mon–Fri 9am–6pm · Sat 10am–4pm</span>
          </p>
        </div>

        {/* Support Email */}
        <div className="p-5 flex flex-col justify-between gap-3">
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
              <Mail size={15} />
              <span className="text-xs font-semibold uppercase tracking-wider">Support Email</span>
            </div>
            <div className="space-y-1">
              <a
                href={`mailto:${channels.supportEmail}`}
                className="block text-sm font-semibold text-slate-900 dark:text-white hover:text-brand-red transition-colors break-all"
              >
                {channels.supportEmail}
              </a>
              {channels.generalEmail &&
                channels.generalEmail.toLowerCase() !== channels.supportEmail.toLowerCase() && (
                  <a
                    href={`mailto:${channels.generalEmail}`}
                    className="block text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors break-all"
                  >
                    {channels.generalEmail}
                  </a>
                )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleCopy(channels.supportEmail, 'email')}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors w-fit cursor-pointer"
          >
            {copiedKey === 'email' ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
            <span>{copiedKey === 'email' ? 'Email copied' : 'Copy support email'}</span>
          </button>
        </div>

        {/* WhatsApp Support Line */}
        <div className="p-5 flex flex-col justify-between gap-3">
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-[#1DA851] dark:text-[#25D366]">
              <WhatsAppGlyph className="w-4 h-4" />
              <span className="text-xs font-semibold uppercase tracking-wider">WhatsApp Desk</span>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-white tabular-nums">
                {channels.supportWhatsapp}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Fastest channel for urgent portal, billing, and live class help.
              </p>
            </div>
          </div>
          <a
            href={quickWhatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1DA851] dark:text-[#25D366] hover:underline w-fit"
          >
            <span>Open WhatsApp</span>
            <ExternalLink size={12} />
          </a>
        </div>

        {/* Studio Location */}
        <div className="p-5 flex flex-col justify-between gap-3">
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
              <MapPin size={15} />
              <span className="text-xs font-semibold uppercase tracking-wider">Location</span>
            </div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white leading-snug">
              {channels.address}
            </p>
          </div>
          {channels.googleBusinessUrl && (
            <a
              href={channels.googleBusinessUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-brand-red transition-colors w-fit"
            >
              <span>View Business Profile</span>
              <ExternalLink size={12} />
            </a>
          )}
        </div>
      </section>

      {/* Main Workspace: Support Desk (WhatsApp) + Submit a Ticket */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Support Desk via WhatsApp (7 Cols) */}
        <section className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B26] overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#25D366]/12 text-[#1DA851] dark:text-[#25D366] flex items-center justify-center shrink-0">
                <WhatsAppGlyph className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Support Desk
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Write your message below and send it directly to our team on WhatsApp.
                </p>
              </div>
            </div>
            <span className="hidden sm:inline-block text-xs font-medium text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
              {channels.supportWhatsapp}
            </span>
          </div>

          <div className="p-6 space-y-5">
            {/* Topic selector */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                What do you need help with?
              </label>
              <div className="flex flex-wrap gap-2">
                {DESK_TOPICS.map((topic) => {
                  const active = selectedTopic === topic;
                  return (
                    <button
                      key={topic}
                      type="button"
                      onClick={() => setSelectedTopic(topic)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                        active
                          ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white'
                          : 'bg-white dark:bg-slate-900/60 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500'
                      }`}
                    >
                      {topic}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Message box */}
            <div className="space-y-2">
              <label
                htmlFor="support-desk-whatsapp-msg"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Your message
              </label>
              <textarea
                id="support-desk-whatsapp-msg"
                rows={5}
                value={whatsappMessage}
                onChange={(e) => setWhatsappMessage(e.target.value)}
                placeholder="Describe your question or issue here. Your name, portal role, and selected topic will be included automatically when WhatsApp opens."
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/70 px-3.5 py-3 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#25D366]/40 focus:border-[#25D366] resize-none"
              />
            </div>

            {/* Action bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Opens WhatsApp directly with your message pre-filled.
              </p>
              <a
                href={composedWhatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl bg-[#25D366] hover:bg-[#1DA851] text-white text-sm font-semibold transition-colors shadow-xs shrink-0"
              >
                <WhatsAppGlyph className="w-4 h-4 shrink-0" />
                <span>Send Message on WhatsApp</span>
              </a>
            </div>
          </div>
        </section>

        {/* Right Column: Email / Portal Ticket Form (5 Cols) */}
        <section className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B26] overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Log a Support Ticket
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Prefer a tracked request? Submit a ticket for our administrative team to follow up.
            </p>
          </div>

          <div className="p-6 space-y-5">
            {ticketSubmittedId && (
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 p-3.5 flex items-start gap-2.5">
                <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-xs text-emerald-900 dark:text-emerald-200 space-y-0.5">
                  <p className="font-semibold">Ticket #{ticketSubmittedId} received</p>
                  <p className="text-emerald-700 dark:text-emerald-300/80">
                    Our team has logged your request and will respond via email or your portal.
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmitTicket} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red"
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
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Subject
                </label>
                <input
                  type="text"
                  required
                  placeholder="Brief summary of your request"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full h-10 rounded-xl border border-slate-200 dark:border-slate-700 px-3 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Details
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="Include any relevant student name, school, or class details..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 p-3 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-red/30 focus:border-brand-red resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-11 rounded-xl bg-brand-red hover:bg-red-700 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Send size={15} />
                <span>{submitting ? 'Submitting Ticket...' : 'Submit Ticket'}</span>
              </button>
            </form>

            {recentTickets.length > 0 && (
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Your Recent Tickets
                </p>
                <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {recentTickets.slice(0, 3).map((ticket) => (
                    <div
                      key={ticket.id}
                      className="py-2 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                          {ticket.subject}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {ticket.category}
                        </p>
                      </div>
                      <span className="shrink-0 text-[11px] font-semibold text-slate-600 dark:text-slate-300 tabular-nums">
                        {ticket.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Frequently Asked Questions */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#161B26] overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2.5">
          <HelpCircle size={18} className="text-brand-red shrink-0" />
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Frequently Asked Questions
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Quick answers for students, parents, schools, and tutors.
            </p>
          </div>
        </div>

        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {faqs.map((faq, index) => {
            const isOpen = activeFaq === index;
            return (
              <div key={faq.q}>
                <button
                  type="button"
                  onClick={() => setActiveFaq(isOpen ? null : index)}
                  className="w-full px-6 py-4 text-left flex items-center justify-between gap-4 text-sm font-semibold text-slate-900 dark:text-white hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors cursor-pointer"
                >
                  <span>{faq.q}</span>
                  {isOpen ? (
                    <ChevronUp size={16} className="shrink-0 text-slate-400" />
                  ) : (
                    <ChevronDown size={16} className="shrink-0 text-slate-400" />
                  )}
                </button>
                {isOpen && (
                  <div className="px-6 pb-5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
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
