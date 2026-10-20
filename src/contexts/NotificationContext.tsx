import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { 
  collection, query, where, orderBy, limit, onSnapshot, 
  doc, getDoc, updateDoc, getDocs, Timestamp 
} from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { onAuthStateChanged, type User } from 'firebase/auth';
import type { AppNotification, NotificationFilter } from '../types/notifications';
import { useToast } from './ToastContext';

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  isDrawerOpen: boolean;
  selectedNotification: AppNotification | null;
  activeFilter: NotificationFilter;
  searchQuery: string;
  setActiveFilter: (filter: NotificationFilter) => void;
  setSearchQuery: (query: string) => void;
  openDrawer: (notificationId?: string) => void;
  closeDrawer: () => void;
  selectNotification: (notification: AppNotification | null) => void;
  markAsRead: (id: string, e?: React.MouseEvent) => Promise<void>;
  markAsUnread: (id: string, e?: React.MouseEvent) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  isNotificationRead: (notification: AppNotification) => boolean;
  refreshNotifications: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<User | null>(auth.currentUser);
  const [userRole, setUserRole] = useState<string>('');
  const [schoolId, setSchoolId] = useState<string>('');
  const [studentDocId, setStudentDocId] = useState<string>('');
  
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<AppNotification | null>(null);
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Local storage read state keyed strictly by user UID
  const [localReadIds, setLocalReadIds] = useState<Set<string>>(new Set());

  // Watch Auth State and Session Role
  useEffect(() => {
    let authSequence = 0;
    const unsub = onAuthStateChanged(auth, async (user) => {
      const sequence = ++authSequence;
      setCurrentUser(user);
      setNotifications([]);
      setLoading(true);
      setSelectedNotification(null);
      if (user) {
        setUserRole('');
        setSchoolId('');
        setStudentDocId('');
        // Resolve the role from the authenticated user's Firestore profile.
        // Cached session roles are not an authorization source for notifications.
        try {
          const profile = await getDoc(doc(db, 'users', user.uid));
          if (sequence !== authSequence) return;
          const data = profile.exists() ? profile.data() : {};
          const profileRole = String(data.role || '').trim().toLowerCase();
          setUserRole(['school_admin', 'schooladmin'].includes(profileRole) ? 'school' : profileRole);
          setSchoolId(String(data.schoolId || data.school_id || sessionStorage.getItem('schoolId') || sessionStorage.getItem('schoolDocId') || ''));
          setStudentDocId(String(data.studentDocId || data.studentId || sessionStorage.getItem('studentDocId') || ''));
        } catch (error) {
          if (sequence !== authSequence) return;
          console.warn('Could not resolve notification audience from user profile:', error);
          setUserRole('');
          setSchoolId('');
          setStudentDocId('');
        }

        try {
          const stored = localStorage.getItem(`jaystar_notif_read_${user.uid}`);
          setLocalReadIds(stored ? new Set(JSON.parse(stored)) : new Set());
        } catch {
          setLocalReadIds(new Set());
        }
      } else {
        setUserRole('');
        setSchoolId('');
        setStudentDocId('');
        setNotifications([]);
        setLocalReadIds(new Set());
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  // Save to user-scoped local storage
  const saveLocalReadState = useCallback((uid: string, newSet: Set<string>) => {
    setLocalReadIds(newSet);
    try {
      localStorage.setItem(`jaystar_notif_read_${uid}`, JSON.stringify(Array.from(newSet)));
    } catch (e) {
      console.warn('Could not save read notifications to localStorage:', e);
    }
  }, []);

  // Check if a notification is considered read
  const isNotificationRead = useCallback((notification: AppNotification): boolean => {
    if (!currentUser) return false;
    const uid = currentUser.uid;

    // 1. Direct match on local memory/storage
    if (localReadIds.has(notification.id)) return true;

    // 2. Firestore readBy array includes user's UID
    if (Array.isArray(notification.readBy) && notification.readBy.includes(uid)) {
      return true;
    }

    // 3. Direct targeted 1-to-1 notification with read === true
    if (notification.recipientId === uid && notification.read === true) {
      return true;
    }

    return false;
  }, [currentUser, localReadIds]);

  // Real-time Firestore query listener
  useEffect(() => {
    if (!currentUser) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    const uid = currentUser.uid;
    const email = currentUser.email?.toLowerCase() || '';
    const role = userRole;
    const currentSchoolId = schoolId;
    const currentStudentDocId = studentDocId;

    const isAdmin = ['super_admin', 'superadmin', 'admin'].includes(role);

    setLoading(true);
    const unsubs: (() => void)[] = [];
    const notificationMap = new Map<string, AppNotification>();

    const updateFromDocs = (docs: any[]) => {
      docs.forEach(docSnap => {
        const data = docSnap.data();
        const notif: AppNotification = {
          id: docSnap.ref.parent.id === "jdiNotifications" ? "jdi:" + docSnap.id : docSnap.id,
          title: data.title || 'System Notification',
          message: data.message || '',
          type: data.type || 'broadcast',
          priority: data.priority || 'normal',
          recipientType: data.recipientType || (data.recipientId === 'all' ? 'all' : undefined),
          recipientId: data.recipientId || data.recipientUid || uid,
          schoolId: data.schoolId,
          schoolName: data.schoolName,
          targetRole: data.targetRole,
          targetName: data.targetName,
          targetEmail: data.targetEmail,
          targetUid: data.targetUid,
          link: data.link,
          linkText: data.linkText,
          read: data.isRead === true || data.read,
          readBy: Array.isArray(data.readBy) ? data.readBy : (data.isRead === true ? [uid] : []),
          timestamp: data.timestamp || data.createdAt || Date.now(),
          createdAt: data.createdAt,
          senderName: data.senderName || 'Jaystar Central',
          senderRole: data.senderRole || 'Administration'
        };

        // Strict Audience Filtering: private notices are visible only to their actual recipient.
        let isRelevant = false;
        if (notif.id.startsWith("jdi:")) {
          isRelevant = data.recipientUid === uid;
        } else if (notif.recipientId === 'all' || notif.recipientType === 'all') {
          const targetRole = String(notif.targetRole || '').trim().toLowerCase();
          const roleMatches = !targetRole || targetRole === 'all' || targetRole === role ||
            (targetRole === 'super_admin' && ['super_admin', 'superadmin'].includes(role)) ||
            (targetRole === 'admin' && ['admin', 'super_admin', 'superadmin'].includes(role));
          isRelevant = roleMatches;
        } else if (notif.recipientId === uid || notif.targetUid === uid) {
          isRelevant = true;
        } else if (role !== 'parent' && notif.targetEmail && email && notif.targetEmail.toLowerCase() === email) {
          // Parent payment and account notices must be addressed to a specific UID;
          // shared/contact email addresses are not a private account identifier.
          isRelevant = true;
        } else if (isAdmin) {
          isRelevant = false;
        } else if (role === 'student') {
          if (notif.recipientId === 'all_students' || notif.recipientType === 'all_students') isRelevant = true;
          if (currentStudentDocId && notif.recipientId === currentStudentDocId) isRelevant = true;
          if (currentSchoolId && (notif.recipientId === `school_students_${currentSchoolId}` || (notif.schoolId === currentSchoolId && notif.recipientType === 'school_students'))) isRelevant = true;
        } else if (role === 'parent') {
          if (notif.recipientId === 'all_parents' || notif.recipientType === 'all_parents') isRelevant = true;
        } else if (['staff', 'tutor', 'instructor'].includes(role)) {
          if (notif.recipientId === 'all_staff' || notif.recipientType === 'all_staff') isRelevant = true;
        } else if (role === 'school') {
          if (notif.recipientId === 'all_schools' || notif.recipientType === 'all_schools') isRelevant = true;
          if (currentSchoolId && (notif.recipientId === currentSchoolId || notif.recipientId === `school_${currentSchoolId}` || notif.schoolId === currentSchoolId)) isRelevant = true;
        }

        if (isRelevant) {
          notificationMap.set(notif.id, notif);
        }
      });

      // Sort newest first
      const sortedList = Array.from(notificationMap.values()).sort((a, b) => {
        const timeA = a.timestamp instanceof Timestamp ? a.timestamp.toMillis() : new Date(a.timestamp || 0).getTime() || 0;
        const timeB = b.timestamp instanceof Timestamp ? b.timestamp.toMillis() : new Date(b.timestamp || 0).getTime() || 0;
        return timeB - timeA;
      });

      setNotifications(sortedList);
      setLoading(false);
    };

    try {
      if (isAdmin) {
        // Admins receive the global legacy feed, but JDI exam/payment notices remain recipient-private.
        const adminQ = query(collection(db, 'notifications'), orderBy('timestamp', 'desc'), limit(100));
        const unsub = onSnapshot(adminQ, (snap) => {
          updateFromDocs(snap.docs);
        }, (err) => {
          console.warn('Admin notifications stream warning:', err);
          getDocs(collection(db, 'notifications')).then(snap => updateFromDocs(snap.docs)).catch(() => {});
        });
        const jdiAdminQ = query(collection(db, 'jdiNotifications'), where('recipientUid', '==', uid), limit(100));
        const unsubJdi = onSnapshot(jdiAdminQ, snap => updateFromDocs(snap.docs), err => {
          console.warn('Admin JDI notifications stream warning:', err.message);
        });
        unsubs.push(unsub, unsubJdi);
      } else {
        // Build specific targeted listeners
        const queryList = [
          query(collection(db, 'notifications'), where('recipientType', '==', 'all'), where('targetRole', '==', 'all'), limit(30)),
          query(collection(db, 'notifications'), where('recipientId', '==', uid), limit(30)),
          query(collection(db, 'notifications'), where('targetUid', '==', uid), limit(30))
        ];

        if (role === 'student') {
          queryList.push(query(collection(db, 'notifications'), where('recipientId', '==', 'all_students'), limit(30)));
          if (currentStudentDocId) {
            queryList.push(query(collection(db, 'notifications'), where('recipientId', '==', currentStudentDocId), limit(30)));
          }
          if (currentSchoolId) {
            queryList.push(query(collection(db, 'notifications'), where('recipientId', '==', `school_students_${currentSchoolId}`), limit(30)));
          }
        } else if (role === 'parent') {
          queryList.push(query(collection(db, 'notifications'), where('recipientId', '==', 'all_parents'), limit(30)));
        } else if (['staff', 'tutor', 'instructor'].includes(role)) {
          queryList.push(query(collection(db, 'notifications'), where('recipientId', '==', 'all_staff'), limit(30)));
        } else if (role === 'school') {
          queryList.push(query(collection(db, 'notifications'), where('recipientId', '==', 'all_schools'), limit(30)));
          if (currentSchoolId) {
            queryList.push(query(collection(db, 'notifications'), where('recipientId', '==', currentSchoolId), limit(30)));
            queryList.push(query(collection(db, 'notifications'), where('recipientId', '==', `school_${currentSchoolId}`), limit(30)));
          }
        }

        queryList.push(query(collection(db, "jdiNotifications"), where("recipientUid", "==", uid), limit(50)));

        queryList.forEach(q => {
          const unsub = onSnapshot(q, (snap) => {
            updateFromDocs(snap.docs);
          }, (err) => {
            console.warn('Targeted notification stream note:', err.message);
          });
          unsubs.push(unsub);
        });
      }
    } catch (e) {
      console.warn('Notification listener initialization error:', e);
      setLoading(false);
    }

    return () => {
      unsubs.forEach(u => u());
    };
  }, [currentUser, userRole, schoolId, studentDocId]);

  // Unread Count
  const unreadCount = useMemo(() => {
    return notifications.filter(n => !isNotificationRead(n)).length;
  }, [notifications, isNotificationRead]);

  // Mark a single notification as read
  const markAsRead = useCallback(async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!currentUser) return;
    const uid = currentUser.uid;

    // 1. Instant optimistic local update
    const nextSet = new Set(localReadIds);
    nextSet.add(id);
    saveLocalReadState(uid, nextSet);

    // Update in-memory state
    setNotifications(prev => prev.map(item => {
      if (item.id === id) {
        const readBy = Array.isArray(item.readBy) ? item.readBy : [];
        return {
          ...item,
          read: true,
          readBy: readBy.includes(uid) ? readBy : [...readBy, uid]
        };
      }
      return item;
    }));

    if (selectedNotification && selectedNotification.id === id) {
      setSelectedNotification(prev => prev ? { ...prev, read: true, readBy: [...(prev.readBy || []), uid] } : null);
    }

    // Admins may inspect the global feed, but only the actual JDI recipient
    // can persist read state. General notifications use UID-scoped local state
    // so one viewer cannot change the shared document for everyone.
    const selectedItem = notifications.find(item => item.id === id);
    if (!id.startsWith("jdi:") || selectedItem?.recipientId !== uid) return;

    try {
      await updateDoc(doc(db, "jdiNotifications", id.slice(4)), { isRead: true, readAt: Timestamp.now() });
    } catch (err: any) {
      console.warn('JDI notification read-state update note:', err.message);
    }
  }, [currentUser, localReadIds, saveLocalReadState, selectedNotification, notifications]);

  // Mark a single notification as unread
  const markAsUnread = useCallback(async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!currentUser) return;
    const uid = currentUser.uid;

    // 1. Instant optimistic local update
    const nextSet = new Set(localReadIds);
    nextSet.delete(id);
    saveLocalReadState(uid, nextSet);

    // Update in-memory state
    setNotifications(prev => prev.map(item => {
      if (item.id === id) {
        const readBy = (item.readBy || []).filter(u => u !== uid);
        return {
          ...item,
          read: false,
          readBy
        };
      }
      return item;
    }));

    if (selectedNotification && selectedNotification.id === id) {
      setSelectedNotification(prev => prev ? { ...prev, read: false, readBy: (prev.readBy || []).filter(u => u !== uid) } : null);
    }

    // General notification read state is local to this UID. Only the JDI
    // recipient may persist changes to its private notification document.
    const selectedItem = notifications.find(item => item.id === id);
    if (!id.startsWith('jdi:') || selectedItem?.recipientId !== uid) {
      toast.info('Marked as unread');
      return;
    }

    try {
      await updateDoc(doc(db, 'jdiNotifications', id.slice(4)), { isRead: false, readAt: null });
      toast.info('Marked as unread');
    } catch (err: any) {
      console.warn('JDI notification unread-state update note:', err.message);
    }
  }, [currentUser, localReadIds, saveLocalReadState, selectedNotification, toast, notifications]);

  // Mark all currently visible notifications as read
  const markAllAsRead = useCallback(async () => {
    if (!currentUser || notifications.length === 0) return;
    const uid = currentUser.uid;

    // 1. Instant optimistic update
    const nextSet = new Set(localReadIds);
    notifications.forEach(n => nextSet.add(n.id));
    saveLocalReadState(uid, nextSet);

    setNotifications(prev => prev.map(item => ({
      ...item,
      read: true,
      readBy: Array.isArray(item.readBy) && item.readBy.includes(uid) ? item.readBy : [...(item.readBy || []), uid]
    })));

    toast.success('All notifications marked as read.');

    // 2. Batch Firestore updates asynchronously
    try {
      await Promise.allSettled(
        notifications
          .filter(n => n.id.startsWith('jdi:') && n.recipientId === uid)
          .map(n => updateDoc(doc(db, 'jdiNotifications', n.id.slice(4)), { isRead: true, readAt: Timestamp.now() }))
      );
    } catch (err) {
      console.warn('Batch mark all read note:', err);
    }
  }, [currentUser, notifications, localReadIds, saveLocalReadState, toast]);

  // Open Drawer and optionally pick a notification
  const openDrawer = useCallback((notificationId?: string) => {
    setIsDrawerOpen(true);
    if (notificationId) {
      const found = notifications.find(n => n.id === notificationId);
      if (found) {
        setSelectedNotification(found);
        markAsRead(found.id);
      }
    }
  }, [notifications, markAsRead]);

  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false);
  }, []);

  const selectNotification = useCallback((notification: AppNotification | null) => {
    setSelectedNotification(notification);
    if (notification) {
      markAsRead(notification.id);
    }
  }, [markAsRead]);

  const refreshNotifications = useCallback(async () => {
    if (!currentUser) return;
    // Refresh only recipient-scoped records. Broad collection reads here would
    // bypass the audience filtering used by the live listeners.
    setLoading(true);
    try {
      const uid = currentUser.uid;
      const role = userRole;
      const isAdmin = ['super_admin', 'admin', 'content_admin', 'education_admin', 'services_admin', 'marketing_admin', 'support_admin'].includes(role);
      const [direct, jdi, broadcasts] = await Promise.all([
        isAdmin
          ? getDocs(query(collection(db, 'notifications'), orderBy('timestamp', 'desc'), limit(100)))
          : getDocs(query(collection(db, 'notifications'), where('recipientId', '==', uid), limit(50))),
        isAdmin
          ? getDocs(query(collection(db, 'jdiNotifications'), orderBy('createdAt', 'desc'), limit(100)))
          : getDocs(query(collection(db, 'jdiNotifications'), where('recipientUid', '==', uid), limit(50))),
        isAdmin
          ? Promise.resolve(null)
          : getDocs(query(collection(db, 'notifications'), where('recipientType', '==', 'all'), where('targetRole', '==', 'all'), limit(50)))
      ]);
      const toNotification = (d: any, isJdi = false): AppNotification => {
        const data = d.data();
        return {
          id: isJdi ? `jdi:${d.id}` : d.id,
          title: data.title || 'System Notification',
          message: data.message || '',
          type: data.type || 'system',
          priority: data.priority || 'normal',
          recipientType: data.recipientType,
          recipientId: data.recipientId || data.recipientUid || uid,
          schoolId: data.schoolId,
          schoolName: data.schoolName,
          targetRole: data.targetRole,
          targetName: data.targetName,
          targetEmail: data.targetEmail,
          targetUid: data.targetUid,
          link: data.link,
          linkText: data.linkText,
          read: data.isRead === true || data.read === true,
          readBy: Array.isArray(data.readBy) ? data.readBy : [],
          timestamp: data.timestamp || data.createdAt || Date.now(),
          createdAt: data.createdAt,
          senderName: data.senderName || 'Jaystar Central',
          senderRole: data.senderRole || 'Administration'
        };
      };
      const refreshed = [...direct.docs.map(d => toNotification(d)), ...jdi.docs.map(d => toNotification(d, true)), ...(broadcasts?.docs || []).map(d => toNotification(d))];
      const byId = new Map(notifications.map(n => [n.id, n]));
      refreshed.forEach(n => byId.set(n.id, n));
      setNotifications(Array.from(byId.values()).sort((a, b) => {
        const time = (value: any) => value instanceof Timestamp ? value.toMillis() : new Date(value || 0).getTime() || 0;
        return time(b.timestamp) - time(a.timestamp);
      }));
    } catch (e) {
      console.warn('Refresh notifications note:', e);
    } finally {
      setLoading(false);
    }
  }, [currentUser, userRole, notifications]);

  const handleSetActiveFilter = useCallback((filter: NotificationFilter) => {
    setActiveFilter(filter);
  }, []);

  const handleSetSearchQuery = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const contextValue = useMemo(() => ({
    notifications,
    unreadCount,
    loading,
    isDrawerOpen,
    selectedNotification,
    activeFilter,
    searchQuery,
    setActiveFilter: handleSetActiveFilter,
    setSearchQuery: handleSetSearchQuery,
    openDrawer,
    closeDrawer,
    selectNotification,
    markAsRead,
    markAsUnread,
    markAllAsRead,
    isNotificationRead,
    refreshNotifications
  }), [
    notifications,
    unreadCount,
    loading,
    isDrawerOpen,
    selectedNotification,
    activeFilter,
    searchQuery,
    handleSetActiveFilter,
    handleSetSearchQuery,
    openDrawer,
    closeDrawer,
    selectNotification,
    markAsRead,
    markAsUnread,
    markAllAsRead,
    isNotificationRead,
    refreshNotifications
  ]);

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
