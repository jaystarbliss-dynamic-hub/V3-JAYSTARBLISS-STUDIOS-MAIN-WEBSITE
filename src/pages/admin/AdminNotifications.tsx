import React, { useState, useEffect, useCallback } from 'react';
import { 
  collection, getDocs, addDoc, deleteDoc, doc, 
  query, where, orderBy, serverTimestamp 
} from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { useToast } from '../../contexts/ToastContext';
import { 
  Bell, Send, Trash2, Clock,
  CheckCheck, ShieldAlert, ExternalLink
} from 'lucide-react';
import type { AppNotification, NotificationPriority, NotificationCategory } from '../../types/notifications';

const AdminNotifications: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // Form State
  const [recipientType, setRecipientType] = useState<string>('all');
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>('');
  const [specificId, setSpecificId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<NotificationPriority>('normal');
  const [category, setCategory] = useState<NotificationCategory>('broadcast');
  const [link, setLink] = useState('');
  const [linkText, setLinkText] = useState('');

  // Dropdown lists
  const [staffList, setStaffList] = useState<any[]>([]);
  const [studentList, setStudentList] = useState<any[]>([]);
  const [parentList, setParentList] = useState<any[]>([]);
  const [schoolList, setSchoolList] = useState<any[]>([]);

  // Sent notifications list
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [historyFilter, setHistoryFilter] = useState<string>('all');

  const fetchNotificationData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch staff
      const staffSnap = await getDocs(query(collection(db, 'users'), where('role', 'in', ['staff', 'tutor', 'STAFF', 'TUTOR', 'instructor', 'INSTRUCTOR']))).catch(() => ({ docs: [] }));
      setStaffList(staffSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      // 2. Fetch students
      const [studSnap, indivSnap] = await Promise.all([
        getDocs(collection(db, 'students')).catch(() => ({ docs: [] })),
        getDocs(collection(db, 'individualStudents')).catch(() => ({ docs: [] }))
      ]);
      const combinedStudents = new Map<string, any>();
      studSnap.docs.forEach(d => combinedStudents.set(d.id, { id: d.id, ...d.data() }));
      indivSnap.docs.forEach(d => combinedStudents.set(d.id, { id: d.id, ...d.data() }));
      setStudentList(Array.from(combinedStudents.values()));

      // 3. Fetch parents
      const [parentSnap, parentUsersSnap] = await Promise.all([
        getDocs(collection(db, 'parents')).catch(() => ({ docs: [] })),
        getDocs(query(collection(db, 'users'), where('role', 'in', ['parent', 'PARENT']))).catch(() => ({ docs: [] }))
      ]);
      const combinedParents = new Map<string, any>();
      parentSnap.docs.forEach(d => combinedParents.set(d.id, { id: d.id, ...d.data() }));
      parentUsersSnap.docs.forEach(d => combinedParents.set(d.id, { id: d.id, ...d.data() }));
      setParentList(Array.from(combinedParents.values()));

      // 4. Fetch schools
      const schoolSnap = await getDocs(collection(db, 'schools')).catch(() => ({ docs: [] }));
      setSchoolList(schoolSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      // 5. Fetch notifications history
      const notifSnap = await getDocs(query(collection(db, 'notifications'), orderBy('timestamp', 'desc'))).catch(() => getDocs(collection(db, 'notifications')));
      const list = notifSnap.docs.map(d => ({ id: d.id, ...d.data() } as AppNotification)).filter(n => Boolean((n as any).senderEmail) || String((n as any).senderRole || "").toLowerCase() === "super admin office" || String((n as any).senderName || "") === "Jaystar Administration");
      // Sort newest first
      list.sort((a, b) => {
        const timeA = (a.timestamp?.toMillis ? a.timestamp.toMillis() : new Date(a.timestamp || 0).getTime()) || 0;
        const timeB = (b.timestamp?.toMillis ? b.timestamp.toMillis() : new Date(b.timestamp || 0).getTime()) || 0;
        return timeB - timeA;
      });
      setNotifications(list);

    } catch (err: any) {
      console.error(err);
      toast.error('Failed to load notification system records.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchNotificationData();
  }, [fetchNotificationData]);

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      toast.error('Please enter a notification headline and message body.');
      return;
    }

    if ((recipientType === 'specific_staff' || recipientType === 'specific_student' || recipientType === 'specific_parent') && !specificId) {
      toast.error('Please select the specific targeted user.');
      return;
    }

    if ((recipientType === 'school' || recipientType === 'school_students') && !selectedSchoolId) {
      toast.error('Please select the partner school.');
      return;
    }

    setSending(true);
    try {
      let finalRecipientId = recipientType;
      let targetName = '';
      let targetEmail = '';
      let targetUid = '';
      let schoolIdVal = '';
      let schoolNameVal = '';

      if (recipientType === 'school') {
        finalRecipientId = selectedSchoolId;
        schoolIdVal = selectedSchoolId;
        const s = schoolList.find(item => item.id === selectedSchoolId);
        schoolNameVal = s?.name || s?.schoolName || 'School';
      } else if (recipientType === 'school_students') {
        finalRecipientId = `school_students_${selectedSchoolId}`;
        schoolIdVal = selectedSchoolId;
        const s = schoolList.find(item => item.id === selectedSchoolId);
        schoolNameVal = s?.name || s?.schoolName || 'School';
      } else if (recipientType === 'specific_student') {
        finalRecipientId = specificId;
        const st = studentList.find(item => item.id === specificId);
        targetName = st?.fullName || st?.studentName || st?.username || 'Cadet';
        targetEmail = st?.email || '';
        targetUid = st?.uid || specificId;
        if (st?.schoolId) schoolIdVal = st.schoolId;
      } else if (recipientType === 'specific_staff') {
        finalRecipientId = specificId;
        const sf = staffList.find(item => item.id === specificId);
        targetName = sf?.name || sf?.displayName || sf?.email || 'Instructor';
        targetEmail = sf?.email || '';
        targetUid = sf?.uid || specificId;
      } else if (recipientType === 'specific_parent') {
        finalRecipientId = specificId;
        const p = parentList.find(item => item.id === specificId);
        targetName = p?.fullName || p?.name || p?.email || 'Parent';
        targetEmail = p?.email || '';
        targetUid = p?.uid || specificId;
      }

      const adminUser = auth.currentUser;
      const adminEmail = adminUser?.email || 'admin@jaystar.com';

      const payload: any = {
        ...(recipientType === 'all' ? { targetRole: 'all' } : {}),
        title: title.trim(),
        message: message.trim(),
        type: category,
        priority: priority,
        recipientType: recipientType,
        recipientId: finalRecipientId,
        read: false,
        readBy: [],
        timestamp: serverTimestamp(),
        createdAt: new Date().toISOString(),
        senderName: 'Jaystar Administration',
        senderRole: 'Super Admin Office',
        senderEmail: adminEmail
      };

      if (schoolIdVal) payload.schoolId = schoolIdVal;
      if (schoolNameVal) payload.schoolName = schoolNameVal;
      if (targetName) payload.targetName = targetName;
      if (targetEmail) payload.targetEmail = targetEmail;
      if (targetUid) payload.targetUid = targetUid;
      if (link.trim()) {
        payload.link = link.trim();
        payload.linkText = linkText.trim() || 'Open Activity';
      }

      await addDoc(collection(db, 'notifications'), payload);

      toast.success('Notification broadcast dispatched successfully!');
      setTitle('');
      setMessage('');
      setLink('');
      setLinkText('');
      setPriority('normal');
      setCategory('broadcast');
      setRecipientType('all');
      setSelectedSchoolId('');
      setSpecificId('');
      fetchNotificationData();
    } catch (err: any) {
      toast.error('Error dispatching notification: ' + err.message);
    } finally {
      setSending(false);
    }
  };

  const handleDeleteNotification = async (id: string) => {
    if (!window.confirm('Delete this broadcast from history?')) return;
    try {
      await deleteDoc(doc(db, 'notifications', id));
      toast.success('Notification removed.');
      fetchNotificationData();
    } catch (err: any) {
      toast.error('Failed to delete notification: ' + err.message);
    }
  };

  const getRecipientLabel = (n: AppNotification) => {
    const id = n.recipientId || n.recipientType;
    if (id === 'all' || n.recipientType === 'all') return '🌐 Everyone (Universal)';
    if (id === 'all_staff' || n.recipientType === 'all_staff') return '👨‍🏫 All Faculty & Staff';
    if (id === 'all_students' || n.recipientType === 'all_students') return '👥 All Students';
    if (id === 'all_parents' || n.recipientType === 'all_parents') return '👪 All Parents';
    if (id === 'all_schools' || n.recipientType === 'all_schools') return '🏫 All Partner Schools';

    if (n.recipientType === 'school_students' || String(id).startsWith('school_students_')) {
      return `🎓 Students of ${n.schoolName || 'School'}`;
    }
    if (n.recipientType === 'school' || schoolList.some(s => s.id === id)) {
      const sch = schoolList.find(s => s.id === id);
      return `🏫 School: ${n.schoolName || sch?.name || id}`;
    }

    if (n.targetName) return `👤 ${n.targetName}`;

    const staffObj = staffList.find(s => s.id === id || s.uid === id);
    if (staffObj) return `👨‍🏫 Staff: ${staffObj.name || staffObj.email}`;

    const studObj = studentList.find(s => s.id === id || s.uid === id);
    if (studObj) return `👤 Cadet: ${studObj.fullName || studObj.username}`;

    const parObj = parentList.find(s => s.id === id || s.uid === id);
    if (parObj) return `👪 Parent: ${parObj.fullName || parObj.email}`;

    return `Target: ${id}`;
  };

  const filteredHistory = notifications.filter(n => {
    if (historyFilter === 'all') return true;
    if (historyFilter === 'urgent') return n.priority === 'urgent' || n.priority === 'high';
    if (historyFilter === 'broadcast') return n.recipientType === 'all' || n.recipientId === 'all';
    if (historyFilter === 'schools') return n.recipientType === 'school' || n.recipientType === 'school_students' || n.recipientType === 'all_schools';
    if (historyFilter === 'students') return n.recipientType === 'all_students' || n.recipientType === 'specific_student';
    if (historyFilter === 'parents') return n.recipientType === 'all_parents' || n.recipientType === 'specific_parent';
    return true;
  });

  return (
    <div className="space-y-8">

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Broadcast Form (5 cols) */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-gray-200 dark:border-slate-800 shadow-sm space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-slate-800">
            <h2 className="text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
              <Send size={18} className="text-brand-red" />
              Dispatch Notification
            </h2>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-red-50 dark:bg-red-950/40 text-brand-red">
              Live Delivery
            </span>
          </div>

          <form onSubmit={handleBroadcast} className="space-y-4">
            {/* Target Audience */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1.5">
                Recipient Audience *
              </label>
              <select
                value={recipientType}
                onChange={(e) => {
                  setRecipientType(e.target.value);
                  setSelectedSchoolId('');
                  setSpecificId('');
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-red"
              >
                <optgroup label="🌐 Global & Broad Groups">
                  <option value="all">🌐 Everyone (All Users &amp; Portals)</option>
                  <option value="all_students">👥 All Enrolled Students</option>
                  <option value="all_parents">👪 All Registered Parents</option>
                  <option value="all_staff">👨‍🏫 All Faculty, Tutors &amp; Mentors</option>
                  <option value="all_schools">🏫 All Partner School Administrations</option>
                </optgroup>

                <optgroup label="🏫 Institutional / School-Specific">
                  <option value="school">🏫 Specific School Administration</option>
                  <option value="school_students">🎓 Students under Specific School</option>
                </optgroup>

                <optgroup label="👤 Targeted Individuals">
                  <option value="specific_student">👤 Specific Student (Cadet)</option>
                  <option value="specific_parent">👪 Specific Parent / Guardian</option>
                  <option value="specific_staff">👨‍🏫 Specific Faculty Member / Tutor</option>
                </optgroup>
              </select>
            </div>

            {/* School Selector */}
            {(recipientType === 'school' || recipientType === 'school_students') && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1.5">
                  Select Partner School *
                </label>
                <select
                  required
                  value={selectedSchoolId}
                  onChange={(e) => setSelectedSchoolId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-red"
                >
                  <option value="">-- Choose Partner School --</option>
                  {schoolList.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name || s.schoolName || s.id}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Staff Selector */}
            {recipientType === 'specific_staff' && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1.5">
                  Select Faculty / Staff Member *
                </label>
                <select
                  required
                  value={specificId}
                  onChange={(e) => setSpecificId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-red"
                >
                  <option value="">-- Choose Staff Member --</option>
                  {staffList.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name || s.displayName || s.email} ({s.role || 'Staff'})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Student Selector */}
            {recipientType === 'specific_student' && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1.5">
                  Select Student (Cadet) *
                </label>
                <select
                  required
                  value={specificId}
                  onChange={(e) => setSpecificId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-red"
                >
                  <option value="">-- Choose Student --</option>
                  {studentList.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.fullName || s.studentName || s.username} (@{s.username || s.id})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Parent Selector */}
            {recipientType === 'specific_parent' && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1.5">
                  Select Parent *
                </label>
                <select
                  required
                  value={specificId}
                  onChange={(e) => setSpecificId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-red"
                >
                  <option value="">-- Choose Parent --</option>
                  {parentList.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.fullName || p.name || p.email} ({p.email || p.phone || 'Parent'})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Priority & Category Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1.5">
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as NotificationPriority)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-red"
                >
                  <option value="normal">🟢 Normal</option>
                  <option value="high">🟡 High Priority</option>
                  <option value="urgent">🔴 Urgent Alert</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1.5">
                  Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as NotificationCategory)}
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-red"
                >
                  <option value="broadcast">📢 Broadcast</option>
                  <option value="academic">📚 Academic &amp; Class</option>
                  <option value="billing">💳 Billing &amp; Finance</option>
                  <option value="exam">📝 Exam &amp; Quiz</option>
                  <option value="system">⚙️ System Alert</option>
                </select>
              </div>
            </div>

            {/* Headline */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1.5">
                Headline / Subject *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Schedule Update: Robotics & Coding Hackathon"
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-red"
              />
            </div>

            {/* Message */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1.5">
                Broadcast Body *
              </label>
              <textarea
                rows={4}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write your comprehensive message..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand-red leading-relaxed"
              ></textarea>
            </div>

            {/* Optional Action Link */}
            <div className="grid grid-cols-2 gap-3 pt-1 border-t border-gray-100 dark:border-slate-800/80">
              <div>
                <label className="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-1">
                  Action Link (Optional)
                </label>
                <input
                  type="text"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="e.g. /portal/student/calendar"
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-slate-700 bg-transparent text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-brand-red"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-600 dark:text-gray-400 mb-1">
                  Button Text (Optional)
                </label>
                <input
                  type="text"
                  value={linkText}
                  onChange={(e) => setLinkText(e.target.value)}
                  placeholder="e.g. View Schedule"
                  className="w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-slate-700 bg-transparent text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-brand-red"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={sending}
              className="w-full py-3.5 bg-brand-red hover:bg-red-700 text-white font-bold text-xs rounded-2xl transition-all flex items-center justify-center gap-2 shadow-md disabled:opacity-50 active:scale-98"
            >
              <Send size={15} />
              <span>{sending ? 'Dispatching...' : 'Transmit Broadcast to Selected Recipients'}</span>
            </button>
          </form>
        </div>

        {/* Sent History & Audit (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-gray-900 dark:text-white flex items-center gap-2">
                <span>Broadcast Dispatch History</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono">
                  {notifications.length}
                </span>
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Audit delivery status, targeted recipients, and individual user read rates.
              </p>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
              {[
                { id: 'all', label: 'All' },
                { id: 'urgent', label: 'Urgent' },
                { id: 'broadcast', label: 'Global' },
                { id: 'schools', label: 'Schools' },
                { id: 'students', label: 'Students' },
                { id: 'parents', label: 'Parents' }
              ].map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setHistoryFilter(f.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                    historyFilter === f.id
                      ? 'bg-brand-red text-white'
                      : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="py-16 text-center text-gray-400 font-mono text-xs">
              Loading broadcast audit logs...
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-3xl border border-gray-200 dark:border-slate-800 text-gray-400 text-xs">
              No notifications matching current filter.
            </div>
          ) : (
            <div className="space-y-3.5 max-h-[700px] overflow-y-auto pr-1">
              {filteredHistory.map((n) => {
                const readCount = Array.isArray(n.readBy) ? n.readBy.length : (n.read ? 1 : 0);
                return (
                  <div 
                    key={n.id} 
                    className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-gray-200/80 dark:border-slate-800 shadow-2xs hover:border-gray-300 dark:hover:border-slate-700 transition-all flex items-start justify-between gap-4 group"
                  >
                    <div className="space-y-2 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-lg bg-brand-red/10 text-brand-red">
                          {getRecipientLabel(n)}
                        </span>

                        {n.priority === 'urgent' && (
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-lg bg-red-500 text-white flex items-center gap-1">
                            <ShieldAlert size={10} /> Urgent
                          </span>
                        )}

                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-300 flex items-center gap-1">
                          <CheckCheck size={12} />
                          <span>Read by {readCount} user{readCount === 1 ? '' : 's'}</span>
                        </span>

                        <span className="text-xs text-gray-400 font-mono flex items-center gap-1 ml-auto">
                          <Clock size={11} />
                          {n.timestamp?.toDate ? n.timestamp.toDate().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recent'}
                        </span>
                      </div>

                      <h3 className="font-bold text-sm text-gray-900 dark:text-white leading-snug">
                        {n.title}
                      </h3>

                      <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-wrap">
                        {n.message}
                      </p>

                      {n.link && (
                        <div className="text-[11px] text-brand-red font-semibold flex items-center gap-1 pt-1">
                          <ExternalLink size={12} />
                          <span>Link: {n.linkText || n.link} ({n.link})</span>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => handleDeleteNotification(n.id)}
                      className="text-gray-400 hover:text-red-500 transition-colors p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-800 shrink-0 opacity-80 group-hover:opacity-100"
                      title="Delete Notification"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminNotifications;
