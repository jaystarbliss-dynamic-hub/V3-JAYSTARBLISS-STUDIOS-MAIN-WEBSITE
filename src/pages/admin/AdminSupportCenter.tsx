import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  arrayUnion,
} from 'firebase/firestore';
import {
  Search,
  Send,
  Mail,
  Trash2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Inbox,
  User,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  Filter,
  MessageSquare,
  X,
  Loader2,
  Tag,
} from 'lucide-react';
import { auth, db } from '../../lib/firebase';
import { useToast } from '../../contexts/ToastContext';
import SEO from '../../components/ui/SEO';

type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

interface TicketMessage {
  id: string;
  sender: 'user' | 'admin';
  senderName: string;
  text: string;
  timestamp?: string;
}

interface SupportTicket {
  id: string;
  userId?: string | null;
  userName: string;
  userEmail: string;
  userRole: string;
  userPhone?: string;
  schoolName?: string;
  category: string;
  subject: string;
  status: TicketStatus;
  priority?: string;
  createdAt?: any;
  updatedAt?: any;
  unreadByAdmin?: boolean;
  unreadByUser?: boolean;
  lastReplyBy?: 'user' | 'admin';
  messages: TicketMessage[];
}

const STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
];

const WhatsAppIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2zm.01 1.67c2.2 0 4.26.86 5.82 2.42a8.188 8.188 0 012.41 5.82c0 4.54-3.7 8.24-8.24 8.24-1.44 0-2.84-.38-4.08-1.1l-.29-.17-3.03.79.81-2.95-.19-.3a8.216 8.216 0 01-1.26-4.33c0-4.54 3.7-8.24 8.24-8.24l.02-.18zm4.51 11.59c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.02-1.25-.75-.67-1.25-1.5-1.4-1.75-.14-.25-.02-.39.11-.51.11-.11.25-.29.38-.44.13-.14.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.47c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1s.9 2.44 1.03 2.61c.13.17 1.78 2.72 4.31 3.81.6.26 1.07.41 1.44.53.61.19 1.16.17 1.6.1.49-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.15-1.18-.07-.12-.23-.19-.48-.31z" />
  </svg>
);

const toMillis = (value: any): number => {
  if (!value) return 0;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

const formatRelativeTime = (value: any): string => {
  const ms = toMillis(value);
  if (!ms) return 'Just now';
  const diffMin = Math.floor((Date.now() - ms) / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const formatDateTime = (value: any): string => {
  const ms = toMillis(value);
  if (!ms) return '';
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const normalizeStatus = (raw: any): TicketStatus => {
  const s = String(raw || 'OPEN').trim().toUpperCase().replace(/\s+/g, '_');
  if (s === 'IN_PROGRESS' || s === 'RESOLVED' || s === 'CLOSED') return s;
  return 'OPEN';
};

const statusBadgeClasses = (status: TicketStatus) => {
  switch (status) {
    case 'OPEN':
      return 'bg-red-50 text-[#B91C1C] border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-900/50';
    case 'IN_PROGRESS':
      return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/50';
    case 'RESOLVED':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/50';
    case 'CLOSED':
      return 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700';
  }
};

const statusLabel = (status: TicketStatus) => {
  switch (status) {
    case 'IN_PROGRESS':
      return 'In Progress';
    case 'RESOLVED':
      return 'Resolved';
    case 'CLOSED':
      return 'Closed';
    default:
      return 'Open';
  }
};

const roleLabel = (role: string) => {
  const r = String(role || 'member').toLowerCase();
  if (r === 'staff' || r === 'tutor') return 'Tutor';
  if (r === 'school' || r === 'school_admin') return 'School';
  if (r === 'parent') return 'Parent';
  if (r === 'student' || r === 'individual_student') return 'Student';
  return r.charAt(0).toUpperCase() + r.slice(1);
};

const AdminSupportCenter: React.FC = () => {
  const { toast } = useToast();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | TicketStatus>('ALL');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'student' | 'parent' | 'school' | 'staff'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  // Reply & Actions state
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [deleteConfirmTicket, setDeleteConfirmTicket] = useState<SupportTicket | null>(null);
  const [deletingTicket, setDeletingTicket] = useState(false);

  const threadEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'supportTickets'),
      (snap) => {
        const list: SupportTicket[] = snap.docs
          .map((d) => {
            const data = d.data() || {};
            const msgs: TicketMessage[] = Array.isArray(data.messages)
              ? data.messages.map((m: any, idx: number) => ({
                  id: String(m?.id || `m_${idx}`),
                  sender: m?.sender === 'admin' ? 'admin' : 'user',
                  senderName: String(m?.senderName || (m?.sender === 'admin' ? 'Support Team' : data.userName || 'User')),
                  text: String(m?.text || ''),
                  timestamp: m?.timestamp || '',
                }))
              : data.message
              ? [
                  {
                    id: 'initial',
                    sender: 'user' as const,
                    senderName: String(data.userName || 'User'),
                    text: String(data.message),
                    timestamp: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : '',
                  },
                ]
              : [];

            return {
              id: d.id,
              userId: data.userId || null,
              userName: String(data.userName || data.name || 'Portal User'),
              userEmail: String(data.userEmail || data.email || '').toLowerCase(),
              userRole: String(data.userRole || data.role || 'student').toLowerCase(),
              userPhone: data.userPhone || data.phone || '',
              schoolName: data.schoolName || '',
              category: String(data.category || 'General Support'),
              subject: String(data.subject || 'Support Request'),
              status: normalizeStatus(data.status),
              priority: String(data.priority || 'NORMAL'),
              createdAt: data.createdAt,
              updatedAt: data.updatedAt || data.createdAt,
              unreadByAdmin: data.unreadByAdmin === true || (data.unreadByAdmin === undefined && normalizeStatus(data.status) === 'OPEN'),
              unreadByUser: data.unreadByUser === true,
              lastReplyBy: (data.lastReplyBy === 'admin' ? 'admin' : 'user') as 'admin' | 'user',
              messages: msgs,
            };
          })
          .sort((a, b) => Math.max(toMillis(b.updatedAt), toMillis(b.createdAt)) - Math.max(toMillis(a.updatedAt), toMillis(a.createdAt)));

        setTickets(list);
        setLoading(false);
      },
      (err) => {
        console.error('AdminSupportCenter listener error:', err);
        toast.error('Could not load support tickets. Check your admin permissions.');
        setLoading(false);
      }
    );
    return () => unsub();
  }, [toast]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    tickets.forEach((t) => {
      if (t.category) set.add(t.category);
    });
    return ['ALL', ...Array.from(set).sort()];
  }, [tickets]);

  const metrics = useMemo(() => {
    let open = 0;
    let inProgress = 0;
    let resolved = 0;
    let unread = 0;
    tickets.forEach((t) => {
      if (t.status === 'OPEN') open++;
      else if (t.status === 'IN_PROGRESS') inProgress++;
      else if (t.status === 'RESOLVED' || t.status === 'CLOSED') resolved++;
      if (t.unreadByAdmin) unread++;
    });
    return { total: tickets.length, open, inProgress, resolved, unread };
  }, [tickets]);

  const filteredTickets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return tickets.filter((t) => {
      if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
      if (roleFilter !== 'ALL') {
        const r = t.userRole;
        if (roleFilter === 'student' && !['student', 'individual_student', 'individualstudent'].includes(r)) return false;
        if (roleFilter === 'school' && !['school', 'school_admin'].includes(r)) return false;
        if (roleFilter === 'staff' && !['staff', 'tutor', 'instructor'].includes(r)) return false;
        if (roleFilter === 'parent' && r !== 'parent') return false;
      }
      if (categoryFilter !== 'ALL' && t.category !== categoryFilter) return false;
      if (q) {
        const hay = `${t.id} ${t.subject} ${t.userName} ${t.userEmail} ${t.category} ${t.schoolName || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tickets, searchQuery, statusFilter, roleFilter, categoryFilter]);

  const selectedTicket = useMemo(
    () => tickets.find((t) => t.id === selectedTicketId) || null,
    [tickets, selectedTicketId]
  );

  // Auto-select first visible ticket on desktop when none is selected
  useEffect(() => {
    if (!selectedTicketId && filteredTickets.length > 0) {
      setSelectedTicketId(filteredTickets[0].id);
    }
  }, [filteredTickets, selectedTicketId]);

  // Mark ticket as read by admin when opened
  useEffect(() => {
    if (!selectedTicket || !selectedTicket.unreadByAdmin) return;
    void updateDoc(doc(db, 'supportTickets', selectedTicket.id), {
      unreadByAdmin: false,
    }).catch(() => undefined);
  }, [selectedTicket]);

  // Scroll thread to bottom on new messages
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedTicket?.id, selectedTicket?.messages.length]);

  const handleStatusChange = async (nextStatus: TicketStatus) => {
    if (!selectedTicket || selectedTicket.status === nextStatus) return;
    setUpdatingStatus(true);
    try {
      await updateDoc(doc(db, 'supportTickets', selectedTicket.id), {
        status: nextStatus,
        unreadByAdmin: false,
        updatedAt: serverTimestamp(),
      });
      toast.success(`Ticket marked as ${statusLabel(nextStatus)}.`);
    } catch (err: any) {
      toast.error(err?.message || 'Unable to update ticket status.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !replyText.trim()) return;
    setSendingReply(true);
    try {
      const adminName =
        auth.currentUser?.displayName ||
        sessionStorage.getItem('userName') ||
        'Jaystarbliss Support Team';
      const newMsg: TicketMessage = {
        id: `adm_${Date.now()}`,
        sender: 'admin',
        senderName: adminName,
        text: replyText.trim(),
        timestamp: new Date().toISOString(),
      };

      const updates: Record<string, any> = {
        messages: arrayUnion(newMsg),
        lastReplyBy: 'admin',
        unreadByAdmin: false,
        unreadByUser: true,
        assignedAdminUid: auth.currentUser?.uid || null,
        assignedAdminName: adminName,
        updatedAt: serverTimestamp(),
      };

      if (selectedTicket.status === 'OPEN') {
        updates.status = 'IN_PROGRESS';
      }

      await updateDoc(doc(db, 'supportTickets', selectedTicket.id), updates);
      setReplyText('');
      toast.success('Reply sent to user portal.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send reply.');
    } finally {
      setSendingReply(false);
    }
  };

  const handleDeleteTicket = async () => {
    if (!deleteConfirmTicket) return;
    setDeletingTicket(true);
    try {
      await deleteDoc(doc(db, 'supportTickets', deleteConfirmTicket.id));
      toast.success(`Ticket "${deleteConfirmTicket.subject}" deleted.`);
      if (selectedTicketId === deleteConfirmTicket.id) {
        setSelectedTicketId(null);
      }
      setDeleteConfirmTicket(null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete ticket.');
    } finally {
      setDeletingTicket(false);
    }
  };

  const buildWhatsappHandoffUrl = (ticket: SupportTicket) => {
    const phoneDigits = String(ticket.userPhone || '').replace(/\D/g, '');
    const text = `Hello ${ticket.userName}, this is Jaystarbliss Studios Support following up on your ticket #${ticket.id.slice(0, 8).toUpperCase()} ("${ticket.subject}").`;
    if (phoneDigits.length >= 10) {
      return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`;
    }
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  };

  const buildEmailHandoffUrl = (ticket: SupportTicket) => {
    const subjectLine = `Re: [Ticket #${ticket.id.slice(0, 8).toUpperCase()}] ${ticket.subject}`;
    const body = `Hello ${ticket.userName},\n\nThank you for reaching out to Jaystarbliss Studios Support regarding "${ticket.subject}".\n\n`;
    return `mailto:${encodeURIComponent(ticket.userEmail)}?subject=${encodeURIComponent(subjectLine)}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="space-y-6 pb-8">
      <SEO
        title="Admin Support Center | Jaystarbliss Studios"
        description="Manage, track, and reply to incoming user support tickets across all portals."
        noindex
      />

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#B91C1C]">
            Administrative Help Desk
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-[#14284B] dark:text-white mt-0.5">
            Support Center Inbox
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mt-1">
            Review incoming tickets from students, parents, partner schools, and tutors. Reply directly inside their portal or hand off to WhatsApp and email.
          </p>
        </div>
        {metrics.unread > 0 && (
          <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-xs font-bold text-[#B91C1C] dark:text-red-400 self-start sm:self-auto tabular-nums">
            <span className="w-2 h-2 rounded-full bg-[#B91C1C] animate-pulse" />
            <span>{metrics.unread} unread ticket{metrics.unread === 1 ? '' : 's'}</span>
          </div>
        )}
      </div>

      {/* KPI Metrics Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="rounded-2xl bg-white dark:bg-[#111114] border border-slate-200 dark:border-zinc-800 p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              Total Tickets
            </p>
            <p className="text-2xl font-black text-[#14284B] dark:text-white mt-1 tabular-nums">
              {metrics.total}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-zinc-800 text-[#14284B] dark:text-zinc-200 flex items-center justify-center">
            <Inbox size={18} />
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#111114] border border-slate-200 dark:border-zinc-800 p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              Open
            </p>
            <p className="text-2xl font-black text-[#B91C1C] dark:text-red-400 mt-1 tabular-nums">
              {metrics.open}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/40 text-[#B91C1C] dark:text-red-400 flex items-center justify-center">
            <AlertCircle size={18} />
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#111114] border border-slate-200 dark:border-zinc-800 p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              In Progress
            </p>
            <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1 tabular-nums">
              {metrics.inProgress}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Clock size={18} />
          </div>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#111114] border border-slate-200 dark:border-zinc-800 p-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              Resolved
            </p>
            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
              {metrics.resolved}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <CheckCircle2 size={18} />
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="rounded-2xl bg-white dark:bg-[#111114] border border-slate-200 dark:border-zinc-800 p-4 flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tickets by subject, user name, email, or ticket ID..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#18181B] text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/30 focus:border-[#B91C1C]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-zinc-400 mr-1">
            <Filter size={13} />
            <span className="hidden sm:inline">Filter:</span>
          </div>

          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="h-10 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#18181B] text-xs font-semibold text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-[#B91C1C]"
          >
            <option value="ALL">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </select>

          <select
            aria-label="Filter by portal role"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as any)}
            className="h-10 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#18181B] text-xs font-semibold text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-[#B91C1C]"
          >
            <option value="ALL">All Portals</option>
            <option value="student">Students</option>
            <option value="parent">Parents</option>
            <option value="school">Partner Schools</option>
            <option value="staff">Tutors / Staff</option>
          </select>

          <select
            aria-label="Filter by category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-10 px-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#18181B] text-xs font-semibold text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-[#B91C1C]"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat === 'ALL' ? 'All Categories' : cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Split-Pane Master-Detail Inbox */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Pane: Ticket List (5 cols) */}
        <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#111114] border border-slate-200 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[720px]">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-[#18181B] flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
              Incoming Queue ({filteredTickets.length})
            </span>
            {(searchQuery || statusFilter !== 'ALL' || roleFilter !== 'ALL' || categoryFilter !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('ALL');
                  setRoleFilter('ALL');
                  setCategoryFilter('ALL');
                }}
                className="text-[11px] font-bold text-[#B91C1C] hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw size={11} /> Reset
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-zinc-800/80 custom-scrollbar">
            {loading ? (
              <div className="p-10 flex flex-col items-center justify-center gap-2.5 text-xs text-slate-500 dark:text-zinc-400">
                <Loader2 size={20} className="animate-spin text-[#B91C1C]" />
                <span>Connecting to live ticket queue…</span>
              </div>
            ) : filteredTickets.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <MessageSquare size={28} className="mx-auto text-slate-300 dark:text-zinc-700" />
                <p className="text-sm font-bold text-slate-800 dark:text-white">No tickets found</p>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  {tickets.length === 0
                    ? 'When users submit support requests from any portal, they will appear here in real time.'
                    : 'Adjust your search or status filter to view other tickets.'}
                </p>
              </div>
            ) : (
              filteredTickets.map((ticket) => {
                const isSelected = ticket.id === selectedTicketId;
                const latestMessage = ticket.messages[ticket.messages.length - 1];
                return (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => setSelectedTicketId(ticket.id)}
                    className={`w-full text-left p-4 transition-colors cursor-pointer relative ${
                      isSelected
                        ? 'bg-slate-50 dark:bg-[#18181B] border-l-4 border-l-[#B91C1C]'
                        : 'hover:bg-slate-50/70 dark:hover:bg-zinc-900/50 border-l-4 border-l-transparent'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        {ticket.unreadByAdmin && (
                          <span className="w-2 h-2 rounded-full bg-[#B91C1C] shrink-0" title="Unread" />
                        )}
                        <span className="text-xs font-bold text-[#14284B] dark:text-white truncate">
                          {ticket.userName}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-zinc-800 text-[10px] font-bold text-slate-600 dark:text-zinc-300 shrink-0">
                          {roleLabel(ticket.userRole)}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 dark:text-zinc-500 shrink-0 tabular-nums">
                        {formatRelativeTime(ticket.updatedAt || ticket.createdAt)}
                      </span>
                    </div>

                    <p className="text-sm font-bold text-slate-900 dark:text-zinc-100 line-clamp-1">
                      {ticket.subject}
                    </p>

                    {latestMessage && (
                      <p className="text-xs text-slate-500 dark:text-zinc-400 line-clamp-1 mt-0.5">
                        {latestMessage.sender === 'admin' ? 'You: ' : ''}
                        {latestMessage.text}
                      </p>
                    )}

                    <div className="flex items-center justify-between gap-2 mt-2.5">
                      <span className="text-[11px] font-medium text-slate-500 dark:text-zinc-400 inline-flex items-center gap-1 truncate">
                        <Tag size={11} className="shrink-0" />
                        <span className="truncate">{ticket.category}</span>
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold border shrink-0 ${statusBadgeClasses(
                          ticket.status
                        )}`}
                      >
                        {statusLabel(ticket.status)}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Pane: Conversation Thread & Admin Actions (7 cols) */}
        <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#111114] border border-slate-200 dark:border-zinc-800 overflow-hidden flex flex-col min-h-[560px] max-h-[720px]">
          {!selectedTicket ? (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-zinc-800 text-slate-400 flex items-center justify-center">
                <Inbox size={22} />
              </div>
              <h2 className="text-base font-bold text-[#14284B] dark:text-white">
                Select a ticket to inspect
              </h2>
              <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-sm">
                Choose any user inquiry from the inbox queue to view its full thread, update status, or send an in-portal reply.
              </p>
            </div>
          ) : (
            <>
              {/* Ticket Detail Header */}
              <div className="px-5 py-4 border-b border-slate-200 dark:border-zinc-800 bg-slate-50/60 dark:bg-[#18181B] space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-500 dark:text-zinc-400">
                      <span className="font-mono uppercase text-[#14284B] dark:text-zinc-200">
                        #{selectedTicket.id.slice(0, 8).toUpperCase()}
                      </span>
                      <span>·</span>
                      <span>{selectedTicket.category}</span>
                      <span>·</span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200">
                        {roleLabel(selectedTicket.userRole)} Portal
                      </span>
                    </div>
                    <h2 className="text-base sm:text-lg font-bold text-[#14284B] dark:text-white mt-1 leading-snug">
                      {selectedTicket.subject}
                    </h2>
                  </div>

                  {/* Status Switcher + Delete */}
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      aria-label="Update ticket status"
                      disabled={updatingStatus}
                      value={selectedTicket.status}
                      onChange={(e) => void handleStatusChange(e.target.value as TicketStatus)}
                      className={`h-9 px-3 rounded-xl border text-xs font-bold cursor-pointer focus:outline-none ${statusBadgeClasses(
                        selectedTicket.status
                      )}`}
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value} className="bg-white dark:bg-[#111114] text-slate-900 dark:text-white">
                          {opt.label}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() => setDeleteConfirmTicket(selectedTicket)}
                      title="Delete ticket"
                      aria-label="Delete ticket"
                      className="h-9 w-9 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-[#111114] text-slate-500 hover:text-[#B91C1C] hover:border-red-200 dark:hover:border-red-900/50 flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Sender Metadata + External Handoff Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/70 dark:border-zinc-800">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-zinc-300">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-[#14284B] dark:text-white">
                      <User size={13} className="text-slate-400" />
                      {selectedTicket.userName}
                    </span>
                    {selectedTicket.userEmail && (
                      <span className="text-slate-500 dark:text-zinc-400">{selectedTicket.userEmail}</span>
                    )}
                    {selectedTicket.schoolName && (
                      <span className="text-slate-500 dark:text-zinc-400">· {selectedTicket.schoolName}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href={buildWhatsappHandoffUrl(selectedTicket)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#25D366]/12 hover:bg-[#25D366]/20 text-[#168A41] dark:text-[#25D366] text-xs font-bold transition-colors"
                    >
                      <WhatsAppIcon className="w-3.5 h-3.5" />
                      <span>WhatsApp</span>
                      <ExternalLink size={11} />
                    </a>
                    {selectedTicket.userEmail && (
                      <a
                        href={buildEmailHandoffUrl(selectedTicket)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-[#111114] hover:border-[#14284B] dark:hover:border-zinc-500 text-slate-700 dark:text-zinc-200 text-xs font-bold transition-colors"
                      >
                        <Mail size={13} />
                        <span>Email User</span>
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Conversation Thread */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-[#F7F9FC] dark:bg-[#09090B] custom-scrollbar">
                {selectedTicket.messages.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-zinc-400 text-center py-8">
                    No messages recorded in this ticket thread.
                  </p>
                ) : (
                  selectedTicket.messages.map((msg) => {
                    const isAdmin = msg.sender === 'admin';
                    return (
                      <div
                        key={msg.id}
                        className={`flex flex-col ${isAdmin ? 'items-end' : 'items-start'}`}
                      >
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-zinc-400 mb-1 px-1">
                          {isAdmin ? (
                            <ShieldCheck size={12} className="text-[#B91C1C]" />
                          ) : (
                            <User size={12} className="text-[#14284B] dark:text-zinc-400" />
                          )}
                          <span>{msg.senderName}</span>
                          {msg.timestamp && (
                            <>
                              <span>·</span>
                              <span className="tabular-nums">{formatDateTime(msg.timestamp)}</span>
                            </>
                          )}
                        </div>
                        <div
                          className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap shadow-2xs ${
                            isAdmin
                              ? 'bg-[#14284B] dark:bg-[#B91C1C] text-white rounded-tr-sm'
                              : 'bg-white dark:bg-[#18181B] text-slate-800 dark:text-zinc-100 border border-slate-200 dark:border-zinc-800 rounded-tl-sm'
                          }`}
                        >
                          {msg.text}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={threadEndRef} />
              </div>

              {/* Reply Composer */}
              <form
                onSubmit={handleSendReply}
                className="p-4 border-t border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#111114] space-y-3"
              >
                <textarea
                  rows={3}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={`Write an in-portal reply to ${selectedTicket.userName}...`}
                  className="w-full rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-[#18181B] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#B91C1C]/30 focus:border-[#B91C1C] resize-none"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500 dark:text-zinc-400">
                    Visible immediately inside the user&apos;s Support Center ticket thread.
                  </span>
                  <div className="flex items-center gap-2">
                    {selectedTicket.status !== 'RESOLVED' && (
                      <button
                        type="button"
                        disabled={updatingStatus}
                        onClick={() => void handleStatusChange('RESOLVED')}
                        className="px-3.5 py-2 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <CheckCircle2 size={14} />
                        <span>Mark Resolved</span>
                      </button>
                    )}
                    <button
                      type="submit"
                      disabled={sendingReply || !replyText.trim()}
                      className="px-4 py-2 rounded-xl bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-bold inline-flex items-center gap-2 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                    >
                      {sendingReply ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                      <span>Send Reply</span>
                    </button>
                  </div>
                </div>
              </form>
            </>
          )}
        </div>
      </div>

      {/* Delete Ticket Confirmation Modal */}
      {deleteConfirmTicket && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#111114] border border-slate-200 dark:border-zinc-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/40 text-[#B91C1C] dark:text-red-400 flex items-center justify-center shrink-0">
                  <Trash2 size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#14284B] dark:text-white">
                    Delete Support Ticket?
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-zinc-400">
                    This permanently removes the ticket and conversation history.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeleteConfirmTicket(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="rounded-xl bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-zinc-800 p-3 text-xs space-y-1">
              <p className="font-bold text-slate-900 dark:text-white">{deleteConfirmTicket.subject}</p>
              <p className="text-slate-500 dark:text-zinc-400">
                From {deleteConfirmTicket.userName} ({deleteConfirmTicket.userEmail || roleLabel(deleteConfirmTicket.userRole)})
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={deletingTicket}
                onClick={() => setDeleteConfirmTicket(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-bold text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingTicket}
                onClick={() => void handleDeleteTicket()}
                className="px-4 py-2 rounded-xl bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {deletingTicket ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                <span>Delete Permanently</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminSupportCenter;
