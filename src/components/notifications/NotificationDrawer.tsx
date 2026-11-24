import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  X, Bell, CheckCheck, Clock, Search, ExternalLink, 
  ShieldAlert, BookOpen, CreditCard, ArrowLeft,
  ChevronRight, Check, Copy, User,
  Radio, RotateCcw
} from 'lucide-react';
import { useNotifications } from '../../contexts/NotificationContext';
import type { AppNotification, NotificationFilter } from '../../types/notifications';
import { Timestamp } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';

export const NotificationDrawer: React.FC = () => {
  const {
    notifications,
    unreadCount,
    loading,
    isDrawerOpen,
    selectedNotification,
    activeFilter,
    searchQuery,
    setActiveFilter,
    setSearchQuery,
    closeDrawer,
    selectNotification,
    markAsRead,
    markAsUnread,
    markAllAsRead,
    isNotificationRead
  } = useNotifications();

  const navigate = useNavigate();
  const { toast } = useToast();
  const drawerRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDrawerOpen) {
        if (selectedNotification) {
          selectNotification(null);
        } else {
          closeDrawer();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawerOpen, selectedNotification, selectNotification, closeDrawer]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (isDrawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isDrawerOpen]);

  // Filter and search notifications
  const filteredNotifications = useMemo(() => {
    return notifications.filter(n => {
      const isRead = isNotificationRead(n);

      const normType = String(n.type || '').toLowerCase();
      if (activeFilter === 'unread' && isRead) return false;
      if (activeFilter === 'urgent' && n.priority !== 'urgent' && n.priority !== 'high') return false;
      if (
        activeFilter === 'academic' &&
        !['academic', 'exam', 'resource', 'exam_submitted', 'exam_expired', 'exam_closed', 'exam_available', 'exam_deadline_summary'].includes(normType)
      ) return false;
      if (
        activeFilter === 'billing' &&
        !['billing', 'programme_admission_approved', 'payment'].includes(normType)
      ) return false;
      if (
        activeFilter === 'system' &&
        !['system', 'broadcast', 'announcement', 'registration', 'client_inquiry', 'support_ticket', 'new_school_partnership'].includes(normType)
      ) return false;

      // Text search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const titleMatch = n.title?.toLowerCase().includes(query);
        const bodyMatch = n.message?.toLowerCase().includes(query);
        const senderMatch = n.senderName?.toLowerCase().includes(query);
        const schoolMatch = n.schoolName?.toLowerCase().includes(query);
        return titleMatch || bodyMatch || senderMatch || schoolMatch;
      }

      return true;
    });
  }, [notifications, activeFilter, searchQuery, isNotificationRead]);

  // Formatter for timestamp
  const formatTimestamp = (ts: any, detailed: boolean = false) => {
    if (!ts) return 'Just now';
    let millis = 0;
    if (ts instanceof Timestamp) millis = ts.toMillis();
    else if (typeof ts === 'number') millis = ts;
    else if (ts instanceof Date) millis = ts.getTime();
    else {
      const parsed = new Date(ts).getTime();
      millis = isNaN(parsed) ? Date.now() : parsed;
    }

    const dateObj = new Date(millis);
    if (detailed) {
      return dateObj.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    }

    const diffSec = Math.max(0, Math.floor((Date.now() - millis) / 1000));
    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
    return dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const getNotificationIcon = (type?: string, priority?: string) => {
    const norm = String(type || '').toLowerCase();
    if (priority === 'urgent') return <ShieldAlert size={16} className="text-[#B91C1C] dark:text-red-400" />;
    switch (norm) {
      case 'academic':
      case 'exam':
      case 'exam_submitted':
      case 'exam_expired':
      case 'exam_closed':
      case 'exam_available':
      case 'exam_deadline_summary':
      case 'resource':
        return <BookOpen size={16} className="text-[#1E293B] dark:text-slate-200" />;
      case 'billing':
      case 'programme_admission_approved':
      case 'payment':
        return <CreditCard size={16} className="text-[#B91C1C] dark:text-red-400" />;
      case 'announcement':
      case 'broadcast':
        return <Radio size={16} className="text-[#B91C1C] dark:text-red-400" />;
      default:
        return <Bell size={16} className="text-[#B91C1C] dark:text-red-400" />;
    }
  };

  const getRecipientBadge = (n: AppNotification) => {
    if (n.recipientType === 'all' || n.recipientId === 'all') {
      return { label: 'Universal Broadcast', bg: 'text-[#B91C1C] dark:text-red-400' };
    }
    if (n.recipientType === 'all_students' || n.recipientId === 'all_students') {
      return { label: 'All Students', bg: 'text-[#1E293B] dark:text-slate-200' };
    }
    if (n.recipientType === 'all_parents' || n.recipientId === 'all_parents') {
      return { label: 'All Parents', bg: 'text-[#1E293B] dark:text-slate-200' };
    }
    if (n.recipientType === 'all_staff' || n.recipientId === 'all_staff') {
      return { label: 'Faculty & Staff', bg: 'text-[#1E293B] dark:text-slate-200' };
    }
    if (n.recipientType === 'all_schools' || n.recipientId === 'all_schools') {
      return { label: 'School Admins', bg: 'text-[#1E293B] dark:text-slate-200' };
    }
    if (n.schoolName || n.recipientType === 'school_students') {
      return { label: n.schoolName ? `School: ${n.schoolName}` : 'Partner School Cadets', bg: 'text-[#1E293B] dark:text-slate-200' };
    }
    return { label: 'Personal Message', bg: 'text-slate-500 dark:text-slate-400' };
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Notification text copied');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNavigateLink = (link?: string) => {
    if (!link) return;
    closeDrawer();
    if (link.startsWith('http://') || link.startsWith('https://')) {
      window.open(link, '_blank', 'noopener,noreferrer');
    } else {
      navigate(link);
    }
  };

  if (!isDrawerOpen) return null;

  return (
    <div
      ref={drawerRef}
      className="fixed inset-0 z-50 bg-[#F8FAFC] dark:bg-[#09090B] flex flex-col overflow-hidden animate-in fade-in duration-150"
    >
      {/* Top Page Bar */}
      <header className="h-14 sm:h-16 px-4 sm:px-8 border-b border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-[#111114] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (selectedNotification && window.innerWidth < 1024) {
                selectNotification(null);
              } else {
                closeDrawer();
              }
            }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <ArrowLeft size={16} />
            <span>{selectedNotification && window.innerWidth < 1024 ? 'Back to List' : 'Back'}</span>
          </button>

          <div className="h-4 w-px bg-slate-200 dark:bg-zinc-800" />

          <div className="flex items-center gap-2.5">
            <h1 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight">
              Notifications
            </h1>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 rounded-md bg-red-50 dark:bg-red-950/40 text-[#B91C1C] dark:text-red-400 text-[11px] font-bold tabular-nums">
                {unreadCount} unread
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllAsRead}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCheck size={14} />
              <span>Mark all read</span>
            </button>
          )}
          <button
            type="button"
            onClick={closeDrawer}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            aria-label="Close notifications page"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 max-w-6xl w-full mx-auto flex flex-col lg:grid lg:grid-cols-12 overflow-hidden">
        {/* Left Column: Search, Filters & Message List */}
        <div
          className={`lg:col-span-5 border-r border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-[#111114] flex flex-col overflow-hidden ${
            selectedNotification ? 'hidden lg:flex' : 'flex flex-1'
          }`}
        >
          {/* Search & Minimalist Filter Bar */}
          <div className="p-4 border-b border-slate-100 dark:border-zinc-800/80 space-y-3 shrink-0">
            <div className="relative">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search notifications..."
                className="w-full pl-9 pr-8 py-2 text-xs rounded-xl bg-slate-50 dark:bg-[#09090B] border border-slate-200/80 dark:border-zinc-800 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-500 focus:outline-none focus:border-slate-400 dark:focus:border-zinc-600 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 cursor-pointer"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              {[
                { id: 'all', label: 'All', count: notifications.length },
                { id: 'unread', label: 'Unread', count: unreadCount },
                { id: 'urgent', label: 'Urgent' },
                { id: 'academic', label: 'Academic' },
                { id: 'billing', label: 'Billing' },
                { id: 'system', label: 'Broadcasts' }
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveFilter(tab.id as NotificationFilter)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap tabular-nums cursor-pointer ${
                    activeFilter === tab.id
                      ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                      : 'text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800/70'
                  }`}
                >
                  {tab.label}
                  {typeof tab.count === 'number' && tab.count > 0 ? ` (${tab.count})` : ''}
                </button>
              ))}
            </div>
          </div>

          {/* Notification List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-zinc-800/60">
            {loading ? (
              <div className="p-10 text-center text-xs text-slate-400 dark:text-zinc-500">
                Loading notifications...
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-[#18181B] text-slate-400 dark:text-zinc-500 mx-auto flex items-center justify-center">
                  <Bell size={18} />
                </div>
                <p className="text-xs font-medium text-slate-500 dark:text-zinc-400">
                  No notifications match your filter
                </p>
              </div>
            ) : (
              filteredNotifications.map((item) => {
                const isRead = isNotificationRead(item);
                const isSelected = selectedNotification?.id === item.id;

                return (
                  <div
                    key={item.id}
                    onClick={() => selectNotification(item)}
                    className={`px-4 py-3.5 transition-colors cursor-pointer flex items-start gap-3 ${
                      isSelected
                        ? 'bg-slate-100/90 dark:bg-zinc-800/80'
                        : !isRead
                        ? 'bg-slate-50/60 dark:bg-[#18181B]/60 hover:bg-slate-100/60 dark:hover:bg-zinc-900'
                        : 'hover:bg-slate-50 dark:hover:bg-zinc-900/50'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-[#09090B] flex items-center justify-center shrink-0 mt-0.5 border border-slate-200/60 dark:border-zinc-800">
                      {getNotificationIcon(item.type, item.priority)}
                    </div>

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className={`text-xs font-semibold truncate ${
                          !isRead ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-zinc-300'
                        }`}>
                          {item.title}
                        </h3>
                        <span className="text-[10px] text-slate-400 dark:text-zinc-500 shrink-0 tabular-nums">
                          {formatTimestamp(item.timestamp)}
                        </span>
                      </div>

                      <p className="text-xs text-slate-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                        {item.message}
                      </p>

                      <div className="flex items-center justify-between pt-0.5 text-[10px] text-slate-400 dark:text-zinc-500">
                        <span className="truncate">
                          {item.senderName || 'Jaystar Office'}
                        </span>
                        {item.priority === 'urgent' && (
                          <span className="text-[#B91C1C] dark:text-red-400 font-bold uppercase tracking-wider">
                            Urgent
                          </span>
                        )}
                      </div>
                    </div>

                    {!isRead && (
                      <span className="w-2 h-2 rounded-full bg-[#B91C1C] shrink-0 mt-2" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Minimalist Reading Pane */}
        <div
          className={`lg:col-span-7 bg-[#F8FAFC] dark:bg-[#09090B] flex flex-col overflow-y-auto ${
            selectedNotification ? 'flex flex-1' : 'hidden lg:flex'
          }`}
        >
          {selectedNotification ? (
            <div className="max-w-2xl w-full mx-auto p-5 sm:p-8 space-y-6">
              {/* Mobile back link */}
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => selectNotification(null)}
                  className="lg:hidden inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                >
                  <ArrowLeft size={14} />
                  <span>All Notifications</span>
                </button>

                <span className={`text-[11px] font-semibold uppercase tracking-wider ${getRecipientBadge(selectedNotification).bg}`}>
                  {getRecipientBadge(selectedNotification).label}
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleCopyText(`${selectedNotification.title}\n\n${selectedNotification.message}`)}
                    className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 hover:bg-white dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                    title="Copy message"
                  >
                    {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      if (isNotificationRead(selectedNotification)) {
                        markAsUnread(selectedNotification.id, e);
                      } else {
                        markAsRead(selectedNotification.id, e);
                      }
                    }}
                    className="text-xs font-medium px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#111114] border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800 transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw size={12} />
                    <span>{isNotificationRead(selectedNotification) ? 'Mark unread' : 'Mark read'}</span>
                  </button>
                </div>
              </div>

              {/* Message Card */}
              <div className="bg-white dark:bg-[#111114] border border-slate-200/80 dark:border-zinc-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xs">
                <div className="space-y-3 border-b border-slate-100 dark:border-zinc-800 pb-5">
                  <h2 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white leading-snug">
                    {selectedNotification.title}
                  </h2>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-zinc-400">
                    <div className="flex items-center gap-1.5">
                      <User size={13} className="text-slate-400" />
                      <span className="font-medium text-slate-700 dark:text-zinc-300">
                        {selectedNotification.senderName || 'Jaystar Central'}
                      </span>
                      {selectedNotification.senderRole && (
                        <span className="text-slate-400">· {selectedNotification.senderRole}</span>
                      )}
                    </div>
                    <span>·</span>
                    <div className="flex items-center gap-1">
                      <Clock size={12} />
                      <span>{formatTimestamp(selectedNotification.timestamp, true)}</span>
                    </div>
                  </div>
                </div>

                <div className="text-sm text-slate-700 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed">
                  {selectedNotification.message}
                </div>

                {selectedNotification.link && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => handleNavigateLink(selectedNotification.link)}
                      className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-[#B91C1C] hover:bg-red-800 text-white font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                    >
                      <span>{selectedNotification.linkText || 'Open Linked Activity'}</span>
                      <ExternalLink size={13} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-white dark:bg-[#111114] border border-slate-200/80 dark:border-zinc-800 text-slate-400 dark:text-zinc-500 flex items-center justify-center mb-3">
                <Bell size={20} />
              </div>
              <p className="text-sm font-semibold text-slate-700 dark:text-zinc-300">
                Select a notification to read
              </p>
              <p className="text-xs text-slate-400 dark:text-zinc-500 mt-1">
                Choose any message from your inbox list on the left.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NotificationDrawer;
