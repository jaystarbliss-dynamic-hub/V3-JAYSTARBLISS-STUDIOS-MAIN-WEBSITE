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

      // Tab filter
      if (activeFilter === 'unread' && isRead) return false;
      if (activeFilter === 'urgent' && n.priority !== 'urgent' && n.priority !== 'high') return false;
      if (activeFilter === 'academic' && n.type !== 'academic' && n.type !== 'exam' && n.type !== 'resource') return false;
      if (activeFilter === 'billing' && n.type !== 'billing') return false;
      if (activeFilter === 'system' && n.type !== 'system' && n.type !== 'broadcast' && n.type !== 'announcement') return false;

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
    if (priority === 'urgent') return <ShieldAlert size={16} className="text-[#B91C1C] dark:text-red-400" />;
    switch (type) {
      case 'academic':
      case 'exam':
      case 'resource':
        return <BookOpen size={16} className="text-[#1E293B] dark:text-slate-200" />;
      case 'billing':
        return <CreditCard size={16} className="text-[#1E293B] dark:text-slate-200" />;
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
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div 
        onClick={closeDrawer}
        className="fixed inset-0 bg-slate-950/50 dark:bg-black/70 backdrop-blur-xs transition-opacity duration-300 animate-in fade-in"
      />

      {/* Slide-over Panel */}
      <div 
        ref={drawerRef}
        className="fixed inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10 z-50"
      >
        <div className="w-screen max-w-md md:max-w-lg bg-white dark:bg-slate-900 border-l border-slate-200/80 dark:border-slate-800 shadow-2xl flex flex-col transition-all transform duration-300 ease-in-out animate-in slide-in-from-right">
          
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-900/90 backdrop-blur-xs shrink-0">
            <div className="flex items-center gap-3">
              {selectedNotification ? (
                <button
                  type="button"
                  onClick={() => selectNotification(null)}
                  className="p-1.5 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
                  aria-label="Back to notifications list"
                  title="Back to Inbox"
                >
                  <ArrowLeft size={18} />
                </button>
              ) : (
                <div className="w-9 h-9 rounded-xl bg-slate-200/70 dark:bg-slate-800 text-[#B91C1C] dark:text-red-400 flex items-center justify-center font-bold shrink-0">
                  <Bell size={18} />
                </div>
              )}

              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    {selectedNotification ? 'Notification Details' : 'Notification Inbox'}
                  </h2>
                  {!selectedNotification && unreadCount > 0 && (
                    <span className="text-xs font-black text-[#B91C1C] dark:text-red-400 tabular-nums">
                      · {unreadCount} Unread
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {selectedNotification 
                    ? `Received ${formatTimestamp(selectedNotification.timestamp)}`
                    : 'Personal messages, curriculum alerts & announcements'
                  }
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {!selectedNotification && unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllAsRead}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-[#B91C1C] dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors flex items-center gap-1.5"
                  title="Mark all notifications as read"
                >
                  <CheckCheck size={14} />
                  <span className="hidden sm:inline">Mark all read</span>
                </button>
              )}

              <button
                type="button"
                onClick={closeDrawer}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Close notification panel"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* MAIN CONTENT AREA */}
          {selectedNotification ? (
            /* DETAIL / READING VIEW */
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
              {/* Target & priority info */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider">
                  <span className={getRecipientBadge(selectedNotification).bg}>
                    {getRecipientBadge(selectedNotification).label}
                  </span>
                  {selectedNotification.priority === 'urgent' && (
                    <>
                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                      <span className="text-[#B91C1C] dark:text-red-400 inline-flex items-center gap-1">
                        <ShieldAlert size={12} /> Urgent Priority
                      </span>
                    </>
                  )}
                  {selectedNotification.priority === 'high' && (
                    <>
                      <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                      <span className="text-[#B91C1C] dark:text-red-400">
                        High Priority
                      </span>
                    </>
                  )}
                </div>

                {/* Read toggle & Copy */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopyText(`${selectedNotification.title}\n\n${selectedNotification.message}`)}
                    className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    title="Copy message"
                  >
                    {copied ? <Check size={15} className="text-[#1E293B] dark:text-white" /> : <Copy size={15} />}
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
                    className="text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5"
                  >
                    <RotateCcw size={12} />
                    <span>{isNotificationRead(selectedNotification) ? 'Mark as unread' : 'Mark as read'}</span>
                  </button>
                </div>
              </div>

              {/* Title */}
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white leading-tight">
                  {selectedNotification.title}
                </h1>
                
                {/* Meta details */}
                <div className="flex items-center gap-3 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-500 dark:text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <User size={13} className="text-slate-400" />
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {selectedNotification.senderName || 'Jaystar Central'}
                    </span>
                    <span className="text-slate-400">({selectedNotification.senderRole || 'Office'})</span>
                  </div>
                  <span>•</span>
                  <div className="flex items-center gap-1">
                    <Clock size={12} />
                    <span>{formatTimestamp(selectedNotification.timestamp, true)}</span>
                  </div>
                </div>
              </div>

              {/* Message Body */}
              <div className="p-5 rounded-2xl bg-slate-50/80 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800/70 text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                {selectedNotification.message}
              </div>

              {/* Action Link Button if present */}
              {selectedNotification.link && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => handleNavigateLink(selectedNotification.link)}
                    className="w-full py-3.5 px-5 bg-brand-red hover:bg-red-700 text-white font-bold text-xs rounded-2xl transition-all shadow-md flex items-center justify-center gap-2 active:scale-98"
                  >
                    <span>{selectedNotification.linkText || 'Open Linked Activity'}</span>
                    <ExternalLink size={14} />
                  </button>
                </div>
              )}

              {/* Back to Inbox */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-400">
                <button
                  type="button"
                  onClick={() => selectNotification(null)}
                  className="font-bold text-brand-red hover:underline flex items-center gap-1"
                >
                  <ArrowLeft size={13} />
                  <span>Return to all messages</span>
                </button>
                <span className="font-mono text-[11px]">ID: {selectedNotification.id.slice(0, 8)}...</span>
              </div>
            </div>
          ) : (
            /* LIST / INBOX VIEW */
            <div className="flex-1 flex flex-col overflow-hidden">
              
              {/* Search Box */}
              <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search notifications, announcements..."
                    className="w-full pl-8 pr-8 py-2 text-xs rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-brand-red transition-all"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>

                {/* Filter Tabs */}
                <div className="flex items-center gap-1.5 mt-2.5 overflow-x-auto no-scrollbar pb-1">
                  {[
                    { id: 'all', label: `All (${notifications.length})` },
                    { id: 'unread', label: `Unread (${unreadCount})` },
                    { id: 'urgent', label: 'Urgent' },
                    { id: 'academic', label: 'Academic' },
                    { id: 'billing', label: 'Billing' },
                    { id: 'system', label: 'Broadcasts' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveFilter(tab.id as NotificationFilter)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap tabular-nums ${
                        activeFilter === tab.id
                          ? 'bg-[#1E293B] dark:bg-white text-white dark:text-[#1E293B] shadow-xs'
                          : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notification List Items */}
              <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
                {loading ? (
                  <div className="p-8 text-center text-xs text-slate-400 font-mono">
                    Loading your notifications...
                  </div>
                ) : filteredNotifications.length === 0 ? (
                  <div className="p-10 text-center space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 mx-auto flex items-center justify-center">
                      <Bell size={20} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                        No notifications found
                      </h4>
                      <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-xs mx-auto">
                        {searchQuery 
                          ? 'No notifications match your current search query.' 
                          : 'You are all caught up! New updates, grades, schedules, and alerts will appear here.'
                        }
                      </p>
                    </div>
                  </div>
                ) : (
                  filteredNotifications.map((item) => {
                    const isRead = isNotificationRead(item);
                    const badge = getRecipientBadge(item);

                    return (
                      <div
                        key={item.id}
                        onClick={() => selectNotification(item)}
                        className={`p-4 transition-all cursor-pointer group flex items-start gap-3.5 relative ${
                          !isRead 
                            ? 'bg-slate-50/90 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800/70' 
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }`}
                      >
                        {/* Icon */}
                        <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 mt-0.5 border border-slate-200/50 dark:border-slate-700/50">
                          {getNotificationIcon(item.type, item.priority)}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1.5 overflow-hidden text-[10px] font-black uppercase tracking-wider">
                              <span className={`${badge.bg} truncate max-w-[140px]`}>
                                {badge.label}
                              </span>
                              {!isRead && (
                                <>
                                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                                  <span className="text-[#B91C1C] dark:text-red-400">New</span>
                                </>
                              )}
                              {item.priority === 'urgent' && (
                                <>
                                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                                  <span className="text-[#B91C1C] dark:text-red-400">URGENT</span>
                                </>
                              )}
                            </div>

                            <span className="text-[10px] font-medium text-slate-400 shrink-0 tabular-nums">
                              {formatTimestamp(item.timestamp)}
                            </span>
                          </div>

                          <h3 className={`text-xs font-bold leading-snug line-clamp-1 ${
                            !isRead ? 'text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-300'
                          }`}>
                            {item.title}
                          </h3>

                          <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                            {item.message}
                          </p>

                          <div className="flex items-center justify-between pt-1.5 text-[10px] text-slate-400">
                            <span className="truncate max-w-[150px]">
                              From: <strong className="text-slate-600 dark:text-slate-300">{item.senderName || 'Jaystar Office'}</strong>
                            </span>

                            <div className="flex items-center gap-2 opacity-80 group-hover:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isRead) {
                                    markAsUnread(item.id, e);
                                  } else {
                                    markAsRead(item.id, e);
                                  }
                                }}
                                className="text-slate-400 hover:text-[#B91C1C] font-medium transition-colors"
                                title={isRead ? 'Mark as unread' : 'Mark as read'}
                              >
                                {isRead ? 'Mark unread' : 'Mark read'}
                              </button>

                              <span className="text-[#B91C1C] dark:text-red-400 font-bold flex items-center gap-0.5">
                                Read <ChevronRight size={11} />
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/80 flex items-center justify-between text-xs text-slate-500 shrink-0">
                <span className="tabular-nums">
                  {notifications.length} total message{notifications.length === 1 ? '' : 's'}
                </span>
                <span className="text-[11px] text-slate-400">
                  Jaystarbliss Institutional Inbox
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NotificationDrawer;
