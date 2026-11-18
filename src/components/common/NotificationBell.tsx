import React, { useState, useRef, useEffect } from 'react';
import { 
  Bell, CheckCheck, Clock, ShieldAlert,
  BookOpen, CreditCard, Radio, ChevronRight,
  Inbox
} from 'lucide-react';
import { useNotifications } from '../../contexts/NotificationContext';
import type { AppNotification } from '../../types/notifications';
import { Timestamp } from 'firebase/firestore';

interface NotificationBellProps {
  className?: string;
  role?: string;
  userId?: string;
  studentId?: string;
  schoolId?: string;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  className = ''
}) => {
  const {
    notifications,
    unreadCount,
    openDrawer,
    selectNotification,
    markAsRead,
    markAllAsRead,
    isNotificationRead
  } = useNotifications();

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click or Escape key
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) setIsOpen(false);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const formatRelativeTime = (ts: any) => {
    if (!ts) return 'Just now';
    let millis = 0;
    if (ts instanceof Timestamp) millis = ts.toMillis();
    else if (typeof ts === 'number') millis = ts;
    else if (ts instanceof Date) millis = ts.getTime();
    else {
      const parsed = new Date(ts).getTime();
      millis = isNaN(parsed) ? Date.now() : parsed;
    }

    const diffSec = Math.max(0, Math.floor((Date.now() - millis) / 1000));
    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
    return new Date(millis).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const getNotificationIcon = (type?: string, priority?: string) => {
    if (priority === 'urgent') return <ShieldAlert className="text-[#B91C1C] dark:text-red-400" size={15} />;
    switch (type) {
      case 'academic':
      case 'exam':
      case 'resource':
        return <BookOpen className="text-[#1E293B] dark:text-slate-200" size={15} />;
      case 'billing':
        return <CreditCard className="text-[#1E293B] dark:text-slate-200" size={15} />;
      case 'announcement':
      case 'broadcast':
        return <Radio className="text-[#B91C1C] dark:text-red-400" size={15} />;
      default:
        return <Bell className="text-[#B91C1C] dark:text-red-400" size={15} />;
    }
  };

  const handleOpenItem = (item: AppNotification) => {
    setIsOpen(false);
    selectNotification(item);
    openDrawer(item.id);
  };

  const handleOpenFullInbox = () => {
    setIsOpen(false);
    openDrawer();
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Bell Trigger Button */}
      <button
        id="header-notification-bell"
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        className="relative p-2.5 rounded-xl text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-[#B91C1C]"
        aria-label="View notifications"
        title="Notifications & Alerts"
      >
        <Bell size={19} className="transition-transform active:scale-95" />
        
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-[#B91C1C] text-[10px] font-black text-white shadow-xs animate-in zoom-in-50 tabular-nums">
            {unreadCount > 9 ? '9+' : unreadCount}
            <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping -z-10" />
          </span>
        )}
      </button>

      {/* Notification Dropdown Popover */}
      {isOpen && (
        <div 
          id="notification-popover-dropdown"
          className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
        >
          {/* Header */}
          <div className="px-4 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-900/90 backdrop-blur-xs">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-slate-200/70 dark:bg-slate-800 text-[#B91C1C] dark:text-red-400 flex items-center justify-center font-bold">
                <Bell size={14} />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                  Notifications &amp; Alerts
                </h3>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                  {unreadCount === 0 ? 'All caught up' : `${unreadCount} unread update${unreadCount > 1 ? 's' : ''}`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllAsRead}
                  className="text-[11px] font-bold text-[#B91C1C] dark:text-red-400 hover:text-red-800 flex items-center gap-1 transition-colors px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30"
                  title="Mark all notifications as read"
                >
                  <CheckCheck size={13} />
                  <span>Mark read</span>
                </button>
              )}
            </div>
          </div>

          {/* Quick List */}
          <div className="max-h-[340px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
            {notifications.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 mx-auto flex items-center justify-center">
                  <Bell size={18} />
                </div>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  No notifications yet
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  Broadcasts, personal messages, and curriculum updates will appear here.
                </p>
              </div>
            ) : (
              notifications.slice(0, 6).map((item) => {
                const isRead = isNotificationRead(item);
                return (
                  <div
                    key={item.id}
                    onClick={() => handleOpenItem(item)}
                    className={`p-3.5 flex items-start gap-3 transition-colors cursor-pointer group ${
                      !isRead 
                        ? 'bg-slate-50/90 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800/70' 
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    {/* Icon */}
                    <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 mt-0.5 shadow-2xs border border-slate-200/50 dark:border-slate-700/50">
                      {getNotificationIcon(item.type, item.priority)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className={`text-xs font-bold truncate ${
                          !isRead ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300'
                        }`}>
                          {item.title}
                        </h4>
                        {!isRead && (
                          <span className="text-[9px] font-black uppercase tracking-wider text-[#B91C1C] dark:text-red-400 shrink-0">
                            New
                          </span>
                        )}
                      </div>

                      <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                        {item.message}
                      </p>

                      <div className="flex items-center justify-between pt-1 text-[10px] text-slate-400 dark:text-slate-500">
                        <span className="flex items-center gap-1 tabular-nums">
                          <Clock size={10} />
                          {formatRelativeTime(item.timestamp)}
                        </span>

                        <div className="flex items-center gap-1.5 opacity-90 group-hover:opacity-100">
                          <span className="text-[#B91C1C] dark:text-red-400 font-bold flex items-center gap-0.5">
                            Read <ChevronRight size={10} />
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer - Open Full Inbox Drawer */}
          <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-900 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400 text-[11px] tabular-nums">
              {notifications.length} message{notifications.length === 1 ? '' : 's'} total
            </span>
            <button
              type="button"
              onClick={handleOpenFullInbox}
              className="text-xs font-bold text-[#B91C1C] dark:text-red-400 hover:text-red-800 flex items-center gap-1.5 transition-colors"
            >
              <Inbox size={13} />
              <span>Open Full Inbox Drawer</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
