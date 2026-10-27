import React, { useEffect, useMemo, useState, useRef } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { 
  Activity, Search, Clock, UserCheck, Send, School, LogIn, 
  ChevronDown, Database, Filter, Check, X, ShieldAlert, CreditCard,
  Layers, MousePointer
} from 'lucide-react';
import SEO from '../../components/ui/SEO';

interface ActivityLogItem {
  id: string;
  type?: string;
  userType?: string;
  userEmail?: string;
  staffEmail?: string;
  resourceTitle?: string;
  studentUsername?: string;
  studentId?: string;
  studentName?: string;
  message?: string;
  description?: string;
  action?: string;
  route?: string;
  method?: string;
  actorId?: string;
  details?: Record<string, any>;
  timestamp?: any;
}

const FILTERS = [
  { key: 'all', label: 'All Activities', icon: Activity },
  { key: 'login', label: 'Authentication', icon: LogIn },
  { key: 'page_view', label: 'Page Views', icon: Layers },
  { key: 'ui_action', label: 'UI Actions', icon: MousePointer },
  { key: 'form_submit', label: 'Form Submissions', icon: Send },
  { key: 'payment', label: 'Payments', icon: CreditCard },
  { key: 'school', label: 'Schools', icon: School },
  { key: 'inquiry', label: 'Inquiries', icon: UserCheck }
];

const AdminActivityLogs: React.FC = () => {
  const [logs, setLogs] = useState<ActivityLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'activityLogs'), orderBy('timestamp', 'desc'), limit(250));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() } as ActivityLogItem)));
        setLoading(false);
      },
      (err) => {
        console.error('Activity logs stream error:', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // Close filter dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) {
        setIsFilterOpen(false);
      }
    };
    if (isFilterOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isFilterOpen]);

  const getLogIcon = (type?: string) => {
    if (!type) return <Activity size={15} className="text-slate-400" />;
    if (type.includes('login') || type.includes('auth')) return <LogIn size={15} className="text-emerald-500" />;
    if (type.includes('approval') || type.includes('approved')) return <UserCheck size={15} className="text-sky-500" />;
    if (type.includes('resource') || type.includes('submit')) return <Send size={15} className="text-brand-red" />;
    if (type.includes('payment')) return <CreditCard size={15} className="text-indigo-500" />;
    if (type.includes('school')) return <School size={15} className="text-amber-500" />;
    if (type.includes('error') || type.includes('alert')) return <ShieldAlert size={15} className="text-red-500" />;
    return <Activity size={15} className="text-slate-400" />;
  };

  const formatLogDescription = (item: ActivityLogItem) => {
    if (item.type === 'login' || item.type === 'login_session') return `${item.userType || 'User'} signed in: ${item.userEmail || ''}`;
    if (item.type === 'logout') return `${item.userType || 'User'} signed out: ${item.userEmail || ''}`;
    if (item.type === 'staff_resource_sent') return `Staff ${item.staffEmail || 'member'} dispatched "${item.resourceTitle || 'Resource'}" to student`;
    if (item.type === 'staff_school_resource_sent') return `Staff ${item.staffEmail || 'member'} dispatched "${item.resourceTitle || 'Resource'}" to school`;
    if (item.type === 'student_added') return `Staff ${item.staffEmail || 'member'} registered student: ${item.studentUsername || ''}`;
    if (item.type === 'student_request_approved') return `Approved student application (ID: ${item.studentId || ''})`;
    if (item.type === 'enrollment_approved') return `Approved family enrollment for ${item.studentName || 'Student'} (ID: ${item.studentId || ''})`;
    if (item.message) return item.message;
    if (item.description) return item.description;
    if (item.action) return String(item.action).replace(/_/g, ' ');
    return item.type || 'System transaction recorded.';
  };

  const timestamp = (item: ActivityLogItem) => {
    if (item.timestamp?.toDate) return item.timestamp.toDate().toLocaleString('en-NG');
    if (item.timestamp) return new Date(item.timestamp).toLocaleString('en-NG');
    return 'Just now';
  };

  // Pre-calculate count for each category
  const filterCounts = useMemo(() => {
    const counts: Record<string, number> = { all: logs.length };
    FILTERS.forEach(f => {
      if (f.key !== 'all') {
        counts[f.key] = logs.filter(l => l.type?.includes(f.key)).length;
      }
    });
    return counts;
  }, [logs]);

  const filteredLogs = useMemo(() => {
    return logs.filter(l => {
      const matchesFilter = filterType === 'all' || (l.type && l.type.includes(filterType));
      if (!matchesFilter) return false;
      if (!searchQuery.trim()) return true;
      const haystack = `${formatLogDescription(l)} ${l.userEmail || ''} ${l.route || ''} ${l.action || ''} ${JSON.stringify(l.details || {})}`.toLowerCase();
      return haystack.includes(searchQuery.trim().toLowerCase());
    });
  }, [logs, filterType, searchQuery]);

  const currentFilterObj = FILTERS.find(f => f.key === filterType) || FILTERS[0];

  return (
    <div className="space-y-5 max-w-7xl mx-auto pb-12">
      <SEO title="System & Activity Audit Logs | Admin" description="Real-time portal audit and telemetry." noindex={true} />

      {/* Search Bar + Filter Icon Dropdown Row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
        {/* Search Input Box */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={15} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search user, route, action or payload…"
            className="w-full min-h-10 pl-9 pr-9 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-red shadow-2xs"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Filter Dropdown Popover Beside Search Bar */}
        <div className="relative shrink-0" ref={filterMenuRef}>
          <button
            type="button"
            onClick={() => setIsFilterOpen(prev => !prev)}
            aria-expanded={isFilterOpen}
            className={`min-h-10 px-3.5 rounded-xl border text-xs font-bold inline-flex items-center gap-2 transition-all cursor-pointer ${
              filterType !== 'all'
                ? 'bg-brand-red text-white border-brand-red shadow-xs'
                : 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80 shadow-2xs'
            }`}
          >
            <Filter size={14} className={filterType !== 'all' ? 'text-white' : 'text-slate-500 dark:text-slate-400'} />
            <span>{currentFilterObj.label}</span>
            {filterType !== 'all' && (
              <span className="px-1.5 py-0.2 bg-white/20 rounded-full text-[10px] font-mono">
                {filterCounts[filterType] || 0}
              </span>
            )}
            <ChevronDown size={14} className={`transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Filter Options Menu */}
          {isFilterOpen && (
            <div className="absolute right-0 sm:left-0 top-full mt-1.5 w-64 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl py-1.5 z-40 animate-fadeIn">
              <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800/70 text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span>Filter by Category</span>
                {filterType !== 'all' && (
                  <button
                    type="button"
                    onClick={() => { setFilterType('all'); setIsFilterOpen(false); }}
                    className="text-brand-red hover:underline text-[10px] font-bold"
                  >
                    Reset
                  </button>
                )}
              </div>
              <div className="py-1 max-h-72 overflow-y-auto custom-scrollbar">
                {FILTERS.map(f => {
                  const Icon = f.icon;
                  const isSelected = filterType === f.key;
                  const count = filterCounts[f.key] ?? 0;
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => {
                        setFilterType(f.key);
                        setIsFilterOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-xs font-semibold text-left flex items-center justify-between transition-colors ${
                        isSelected
                          ? 'bg-red-50/80 dark:bg-red-950/40 text-brand-red font-bold'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <span className="inline-flex items-center gap-2">
                        <Icon size={14} className={isSelected ? 'text-brand-red' : 'text-slate-400'} />
                        <span>{f.label}</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-400 font-mono">({count})</span>
                        {isSelected && <Check size={14} className="text-brand-red" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Logs Directory / Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span className="font-semibold">
            {filteredLogs.length} events {filterType !== 'all' ? `(${currentFilterObj.label})` : ''} · {logs.length} total
          </span>
          <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">
            Ordered by newest
          </span>
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-400 font-mono text-xs">
            Loading telemetry events...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            No activity records found matching current criteria.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
            {filteredLogs.map(item => {
              const isOpen = expanded === item.id;
              return (
                <div key={item.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : item.id)}
                    className="w-full text-left p-3.5 sm:p-4 flex items-start gap-3"
                  >
                    <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 shrink-0 mt-0.5">
                      {getLogIcon(item.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white leading-snug">
                        {formatLogDescription(item)}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="inline-flex items-center gap-1">
                          <Clock size={11} /> {timestamp(item)}
                        </span>
                        {item.userEmail && <span>• {item.userEmail}</span>}
                        {item.route && <span>• {item.route}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500">
                        {item.type || 'EVENT'}
                      </span>
                      <ChevronDown size={14} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  {isOpen && (
                    <div className="mx-4 mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-950">
                      <div className="grid gap-2.5 sm:grid-cols-2 mb-3">
                        <div>
                          <span className="text-[9px] uppercase font-black tracking-wider text-slate-400">Actor</span>
                          <p className="text-xs font-semibold mt-0.5 text-slate-700 dark:text-slate-200 truncate">
                            {item.userEmail || item.actorId || 'System'}
                          </p>
                        </div>
                        <div>
                          <span className="text-[9px] uppercase font-black tracking-wider text-slate-400">Action</span>
                          <p className="text-xs font-semibold mt-0.5 text-slate-700 dark:text-slate-200">
                            {item.action || item.type || '—'}
                          </p>
                        </div>
                        <div>
                          <span className="text-[9px] uppercase font-black tracking-wider text-slate-400">Route</span>
                          <p className="text-xs font-mono mt-0.5 text-slate-700 dark:text-slate-200 truncate">
                            {item.route || '—'}
                          </p>
                        </div>
                        <div>
                          <span className="text-[9px] uppercase font-black tracking-wider text-slate-400">Method</span>
                          <p className="text-xs font-mono mt-0.5 text-slate-700 dark:text-slate-200">
                            {item.method || '—'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1.5">
                        <Database size={12} /> Event Payload
                      </div>
                      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-slate-900 p-3 text-[10px] leading-4 text-slate-200 font-mono">
                        {JSON.stringify(item, (_key, value) => value && typeof value.toDate === 'function' ? value.toDate().toISOString() : value, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminActivityLogs;
