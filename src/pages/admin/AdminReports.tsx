import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, getDocs } from 'firebase/firestore';
import { 
  BarChart3, Download, RefreshCw, Users, School, 
  CreditCard, ClipboardList, Activity, FileSpreadsheet,
  ChevronDown, TrendingUp
} from 'lucide-react';
import { db, auth } from '../../lib/firebase';
import SEO from '../../components/ui/SEO';

const money = (value: number) => `₦${Math.round(value || 0).toLocaleString('en-NG')}`;
const dateValue = (value: any) => value?.toDate ? value.toDate() : value ? new Date(value) : null;
const csv = (rows: string[][]) => rows.map(row => row.map(value => `"${String(value ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`).join(',')).join('\n');

const AdminReports: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]); 
  const [schools, setSchools] = useState<any[]>([]); 
  const [students, setStudents] = useState<any[]>([]); 
  const [payments, setPayments] = useState<any[]>([]); 
  const [inquiries, setInquiries] = useState<any[]>([]); 
  const [activity, setActivity] = useState<any[]>([]); 
  const [loading, setLoading] = useState(true); 
  const [range, setRange] = useState('all');

  useEffect(() => {
    setLoading(true);
    const unsubs = [
      ['users', setUsers], 
      ['schools', setSchools], 
      ['payments', setPayments], 
      ['inquiries', setInquiries], 
      ['activityLogs', setActivity]
    ].map(([name, setter]) => onSnapshot(
      collection(db, name as string), 
      snap => (setter as React.Dispatch<React.SetStateAction<any[]>>)(snap.docs.map(d => ({ id: d.id, ...d.data() }))), 
      error => console.error(`Reports ${name}`, error)
    ));

    const loadStudents = async () => {
      try {
        const [studentsSnap, indStudentsSnap, usersSnap] = await Promise.all([
          getDocs(collection(db, 'students')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'individualStudents')).catch(() => ({ docs: [] })),
          getDocs(collection(db, 'users')).catch(() => ({ docs: [] }))
        ]);

        const map = new Map<string, any>();
        studentsSnap.docs.forEach((d: any) => map.set(d.id, { id: d.id, ...d.data() }));
        indStudentsSnap.docs.forEach((d: any) => {
          if (!map.has(d.id)) map.set(d.id, { id: d.id, ...d.data() });
        });
        usersSnap.docs.forEach((d: any) => {
          const data = d.data();
          const role = String(data.role || '').toUpperCase();
          if (role === 'STUDENT' || role === 'CADET' || data.isStudent) {
            if (!map.has(d.id)) map.set(d.id, { id: d.id, ...data });
          }
        });
        setStudents(Array.from(map.values()));
      } catch (error) { 
        console.error('Reports students load error', error); 
      }
    };

    void loadStudents();
    const timer = window.setTimeout(() => setLoading(false), 900);
    return () => { 
      unsubs.forEach(unsub => unsub()); 
      window.clearTimeout(timer); 
    };
  }, []);

  const cutoff = useMemo(() => { 
    if (range === 'all') return null; 
    const days = Number(range); 
    const value = new Date(); 
    value.setDate(value.getDate() - days); 
    return value; 
  }, [range]);

  const within = (item: any) => !cutoff || !dateValue(item.createdAt || item.timestamp || item.paidAt || item.updatedAt) || (dateValue(item.createdAt || item.timestamp || item.paidAt || item.updatedAt) as Date) >= cutoff;
  const scoped = (items: any[]) => items.filter(within);

  const data = useMemo(() => {
    const u = scoped(users), s = scoped(schools), st = scoped(students), p = scoped(payments), i = scoped(inquiries), a = scoped(activity);
    const successfulPayments = p.filter(x => ['success','successful','paid','confirmed','completed'].includes(String(x.status || x.paymentStatus || '').toLowerCase()));
    const revenue = successfulPayments.reduce((sum, x) => sum + Number(x.baseAmount ?? x.amount ?? x.total ?? 0), 0);
    return { 
      users: u, 
      schools: s, 
      students: st, 
      payments: p, 
      inquiries: i, 
      activity: a, 
      successfulPayments, 
      revenue, 
      tutors: u.filter(x => ['TUTOR','STAFF','INSTRUCTOR'].includes(String(x.role || '').toUpperCase())), 
      parents: u.filter(x => String(x.role || '').toUpperCase() === 'PARENT'), 
      schoolUsers: u.filter(x => String(x.role || '').toUpperCase() === 'SCHOOL') 
    };
  }, [users, schools, students, payments, inquiries, activity, cutoff]);

  const exportReport = (name: string, rows: string[][]) => { 
    const blob = new Blob([csv(rows)], { type: 'text/csv;charset=utf-8;' }); 
    const url = URL.createObjectURL(blob); 
    const a = document.createElement('a'); 
    a.href = url; 
    a.download = `jaystarbliss-${name}-${new Date().toISOString().slice(0, 10)}.csv`; 
    a.click(); 
    URL.revokeObjectURL(url); 
  };

  const exportAll = () => exportReport('admin-report', [
    ['Metric','Value'],
    ['Users',String(data.users.length)],
    ['Schools',String(data.schools.length)],
    ['Students',String(data.students.length)],
    ['Parents',String(data.parents.length)],
    ['Tutors / Staff',String(data.tutors.length)],
    ['School Accounts',String(data.schoolUsers.length)],
    ['Inquiries',String(data.inquiries.length)],
    ['Successful Payments',String(data.successfulPayments.length)],
    ['Recorded Revenue',String(data.revenue)],
    ['Audit Events',String(data.activity.length)]
  ]);

  const metrics = [
    { label: 'Active Partner Schools', value: data.schools.filter(x => String(x.status || '').toUpperCase() === 'ACTIVE').length, icon: School },
    { label: 'Enrolled Students', value: data.students.length, icon: Users },
    { label: 'Successful Payments', value: data.successfulPayments.length, icon: CreditCard },
    { label: 'System Audit Events', value: data.activity.length, icon: Activity },
  ];

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-12">
      <SEO title="Reports & Analytics | Admin" description="Executive intelligence, financial statistics, institutional figures, and CRM performance." noindex={true} />

      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
        <span className="text-xs text-slate-500">Real-time aggregated figures for institutional, academic, and financial KPIs</span>
        <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <select 
                value={range} 
                onChange={e => setRange(e.target.value)} 
                className="min-h-9 pl-3 pr-7 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-red appearance-none cursor-pointer"
              >
                <option value="all">All Time</option>
                <option value="30">Last 30 Days</option>
                <option value="90">Last 90 Days</option>
                <option value="365">Last 12 Months</option>
              </select>
              <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>

            <button 
              type="button" 
              onClick={exportAll} 
              className="min-h-9 px-3.5 rounded-xl bg-brand-red hover:bg-red-700 text-white text-xs font-black inline-flex items-center gap-1.5 shadow-sm transition-all"
            >
              <Download size={13} /> Export Summary
            </button>
          </div>
      </div>

      {/* Top 4 KPI Metrics (Scaled down) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {metrics.map(card => { 
          const Icon = card.icon; 
          return (
            <div key={card.label} className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 truncate">{card.label}</span>
                <Icon size={14} className="text-brand-red shrink-0" />
              </div>
              <strong className="mt-2 block text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                {loading ? '—' : card.value.toLocaleString()}
              </strong>
            </div>
          ); 
        })}
      </div>

      {/* Analytics Sections */}
      <div className="grid gap-3 lg:grid-cols-2">
        {/* Institutional Section */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-black text-slate-900 dark:text-white">Institutional Population</h2>
              <p className="text-[11px] text-slate-500">Partner schools, administrators, and student totals.</p>
            </div>
            <button 
              type="button" 
              onClick={() => exportReport('institutional', [
                ['Metric','Value'],
                ['Schools',String(data.schools.length)],
                ['Active schools',String(data.schools.filter(x => String(x.status || '').toUpperCase() === 'ACTIVE').length)],
                ['School administrators',String(data.schoolUsers.length)],
                ['Students',String(data.students.length)]
              ])} 
              className="min-h-7 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-600 dark:text-slate-300 inline-flex items-center gap-1 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <FileSpreadsheet size={12} /> CSV
            </button>
          </div>
          
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[
              ['Total Schools', data.schools.length],
              ['Active Partner Schools', data.schools.filter(x => String(x.status || '').toUpperCase() === 'ACTIVE').length],
              ['School Portal Logins', data.schoolUsers.length],
              ['Total Cadets', data.students.length]
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800/60">
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">{label}</span>
                <strong className="mt-0.5 block text-base font-black text-slate-900 dark:text-white">{Number(value).toLocaleString()}</strong>
              </div>
            ))}
          </div>
        </section>

        {/* Financial Section */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-black text-slate-900 dark:text-white">Financial & Payments</h2>
              <p className="text-[11px] text-slate-500">Gateway-confirmed settlements and transaction volume.</p>
            </div>
            <button 
              type="button" 
              onClick={() => exportReport('financial', [
                ['Metric','Value'],
                ['Successful payments',String(data.successfulPayments.length)],
                ['Recorded base revenue',String(data.revenue)],
                ['Pending payments',String(data.payments.length - data.successfulPayments.length)]
              ])} 
              className="min-h-7 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-600 dark:text-slate-300 inline-flex items-center gap-1 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <FileSpreadsheet size={12} /> CSV
            </button>
          </div>

          <div className="mt-3 space-y-2">
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
              <div>
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">Recorded Successful Revenue</span>
                <strong className="text-lg font-black text-brand-red">{money(data.revenue)}</strong>
              </div>
              <TrendingUp size={18} className="text-emerald-500" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800/60">
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">Confirmed Invoices</span>
                <strong className="mt-0.5 block text-base font-black text-slate-900 dark:text-white">{data.successfulPayments.length}</strong>
              </div>
              <div className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-950/60 border border-slate-100 dark:border-slate-800/60">
                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">Pending Invoices</span>
                <strong className="mt-0.5 block text-base font-black text-slate-900 dark:text-white">{Math.max(0, data.payments.length - data.successfulPayments.length)}</strong>
              </div>
            </div>
          </div>
        </section>

        {/* Academic / Users Breakdown */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-black text-slate-900 dark:text-white">Academic Community</h2>
              <p className="text-[11px] text-slate-500">Cadets, parents, and certified faculty mentors.</p>
            </div>
            <ClipboardList size={14} className="text-brand-red" />
          </div>

          <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {[
              ['Students & Cadets', data.students.length],
              ['Registered Parents', data.parents.length],
              ['Certified Tutors & Staff', data.tutors.length],
              ['School Administrator Accounts', data.schoolUsers.length]
            ].map(([label, value]) => (
              <div key={String(label)} className="py-2 flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400 text-xs">{label}</span>
                <strong className="font-mono font-bold text-slate-900 dark:text-white">{Number(value).toLocaleString()}</strong>
              </div>
            ))}
          </div>
        </section>

        {/* CRM & Operations */}
        <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-black text-slate-900 dark:text-white">CRM & Operational Volume</h2>
              <p className="text-[11px] text-slate-500">Pipeline throughput and logged system actions.</p>
            </div>
            <button 
              type="button" 
              onClick={() => exportReport('operations', [
                ['Metric','Value'],
                ['Inquiries',String(data.inquiries.length)],
                ['Converted',String(data.inquiries.filter(x => String(x.status || '').toUpperCase() === 'CONVERTED').length)],
                ['Audit events',String(data.activity.length)]
              ])} 
              className="min-h-7 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-600 dark:text-slate-300 inline-flex items-center gap-1 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <FileSpreadsheet size={12} /> CSV
            </button>
          </div>

          <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {[
              ['Total Inquiries & Leads', data.inquiries.length],
              ['Converted Partnerships & Admissions', data.inquiries.filter(x => String(x.status || '').toUpperCase() === 'CONVERTED').length],
              ['Active Open Leads', data.inquiries.filter(x => !['CLOSED','LOST'].includes(String(x.status || '').toUpperCase())).length],
              ['Logged Audit Trail Events', data.activity.length]
            ].map(([label, value]) => (
              <div key={String(label)} className="py-2 flex items-center justify-between">
                <span className="text-slate-600 dark:text-slate-400 text-xs">{label}</span>
                <strong className="font-mono font-bold text-slate-900 dark:text-white">{Number(value).toLocaleString()}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-slate-400">
        <RefreshCw size={11} className="animate-spin" /> Live aggregated figures sync automatically with Firestore.
      </div>
    </div>
  );
};

export default AdminReports;
