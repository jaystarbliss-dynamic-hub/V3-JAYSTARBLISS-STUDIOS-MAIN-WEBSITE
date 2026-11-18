import React, { useState, useMemo } from 'react';
import { 
  FileText, Download, Eye, ExternalLink, Calendar, Search, 
  Filter, X, Users, CheckCircle2, Bookmark, Trash2, 
  School, BookOpen, Clock, Tag, Mail, MailOpen,
  ArrowUpDown, SlidersHorizontal, Check, RefreshCw, Edit3
} from 'lucide-react';
import { useResourceReadTracker, matchesDateFilter, type DateFilterType } from '../../utils/resourceTracking';

export interface ResourceItem {
  id: string;
  title: string;
  description?: string;
  category?: string;
  subject?: string;
  docType?: string;
  classLevel?: string;
  assignedClasses?: string[];
  schoolId?: string;
  schoolName?: string;
  fileUrl?: string;
  url?: string;
  dateAdded?: string;
  timestamp?: any;
  createdAt?: any;
  author?: string;
  uploaderName?: string;
  fileSize?: string;
  downloadCount?: number;
  isFeatured?: boolean;
  tags?: string[];
  term?: string;
}

export interface ResourceListViewProps {
  resources: ResourceItem[];
  role?: 'student' | 'school' | 'staff' | 'admin' | 'parent' | 'all';
  studentClass?: string;
  onPreview?: (resource: ResourceItem) => void;
  onAssign?: (resource: ResourceItem) => void;
  onEdit?: (resource: ResourceItem) => void;
  onDelete?: (resource: ResourceItem) => void;
  onBookmark?: (resourceId: string, e?: React.MouseEvent) => void;
  bookmarkedIds?: string[];
  showAssignButton?: boolean;
  showEditButton?: boolean;
  showDeleteButton?: boolean;
  emptyMessage?: string;
  customUserId?: string;
  title?: string;
}

const DATE_FILTER_OPTIONS: { id: DateFilterType; label: string }[] = [
  { id: 'all', label: 'All Resources' },
  { id: 'recent', label: 'Most Recent' },
  { id: 'last_week', label: 'Added in the Last 7 Days' },
  { id: 'last_month', label: 'Added in the Last 30 Days' },
  { id: 'last_90_days', label: 'Added in the Last 90 Days' },
  { id: 'oldest', label: 'Oldest First' }
];

const STANDARD_CLASSES = [
  'All Classes',
  'Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5',
  'Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 5', 'Primary 6',
  'JSS 1', 'JSS 2', 'JSS 3',
  'SSS 1', 'SSS 2', 'SSS 3',
  'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6',
  'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'
];

export const ResourceListView: React.FC<ResourceListViewProps> = ({
  resources,
  role = 'all',
  studentClass,
  onPreview,
  onAssign,
  onEdit,
  onDelete,
  onBookmark,
  bookmarkedIds = [],
  showAssignButton = false,
  showEditButton = false,
  showDeleteButton = false,
  emptyMessage,
  customUserId,
  title
}) => {
  // Read state tracker
  const { isRead, markRead, markUnread, markAllRead } = useResourceReadTracker(customUserId);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDateFilter, setSelectedDateFilter] = useState<DateFilterType>('all');
  const [selectedClass, setSelectedClass] = useState<string>('All Classes');
  const [selectedSubject, setSelectedSubject] = useState<string>('All Subjects');
  const [selectedDocType, setSelectedDocType] = useState<string>('All Formats');
  const [readFilter, setReadFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

  // Extract unique subjects and docTypes from the current resource pool
  const availableSubjects = useMemo(() => {
    const set = new Set<string>();
    resources.forEach(r => {
      if (r.subject) set.add(r.subject);
    });
    return ['All Subjects', ...Array.from(set).sort()];
  }, [resources]);

  const availableDocTypes = useMemo(() => {
    const set = new Set<string>();
    resources.forEach(r => {
      if (r.docType) set.add(r.docType);
      else if (r.category) set.add(r.category);
    });
    return ['All Formats', ...Array.from(set).sort()];
  }, [resources]);

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedDateFilter !== 'all') count++;
    if (selectedClass !== 'All Classes') count++;
    if (selectedSubject !== 'All Subjects') count++;
    if (selectedDocType !== 'All Formats') count++;
    if (readFilter !== 'all') count++;
    return count;
  }, [selectedDateFilter, selectedClass, selectedSubject, selectedDocType, readFilter]);

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedDateFilter('all');
    setSelectedClass('All Classes');
    setSelectedSubject('All Subjects');
    setSelectedDocType('All Formats');
    setReadFilter('all');
  };

  // Helper to extract timestamp or date
  const getResourceTimestamp = (r: ResourceItem): number => {
    if (r.timestamp?.toDate) return r.timestamp.toDate().getTime();
    if (r.timestamp?.seconds) return r.timestamp.seconds * 1000;
    if (r.dateAdded) return new Date(r.dateAdded).getTime() || 0;
    if (r.createdAt) return new Date(r.createdAt).getTime() || 0;
    return 0;
  };

  const normalizeClass = (value?: string) => String(value || '')
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  const classMatches = (resource: ResourceItem, selected: string) => {
    const target = normalizeClass(selected);
    if (!target || target === 'all classes') return true;
    const values = [
      resource.classLevel,
      ...(Array.isArray(resource.assignedClasses) ? resource.assignedClasses : [])
    ].filter(Boolean).map(normalizeClass);
    return values.some(value => {
      if (!value || ['all classes', 'all', 'general', 'universal'].includes(value)) return true;
      if (value === target) return true;

      const targetMatch = target.match(/^(year|primary|grade|jss|sss)\s*(\d+)$/);
      const valueMatch = value.match(/^(year|primary|grade|jss|sss)\s*(\d+)$/);
      if (targetMatch && valueMatch && targetMatch[1] === valueMatch[1] && targetMatch[2] === valueMatch[2]) return true;

      // A resource may be assigned to a deliberate class range such as "Year 1 - Year 5".
      // Match a selected class only when it falls inside the same named range.
      const rangeMatch = value.match(/^(year|primary|grade|jss|sss)\s*(\d+)\s*-\s*(year|primary|grade|jss|sss)\s*(\d+)$/);
      if (targetMatch && rangeMatch && rangeMatch[1] === rangeMatch[3] && targetMatch[1] === rangeMatch[1]) {
        const targetNumber = Number(targetMatch[2]);
        const startNumber = Number(rangeMatch[2]);
        const endNumber = Number(rangeMatch[4]);
        return targetNumber >= Math.min(startNumber, endNumber) && targetNumber <= Math.max(startNumber, endNumber);
      }

      return false;
    });
  };

  // Filter & Sort Resources
  const filteredResources = useMemo(() => {
    let list = resources.filter(item => {
      const readStatus = isRead(item.id);

      // Read filter
      if (readFilter === 'unread' && readStatus) return false;
      if (readFilter === 'read' && !readStatus) return false;

      // Date Range Filter
      const dateVal = item.dateAdded || item.timestamp || item.createdAt;
      if (!matchesDateFilter(dateVal, selectedDateFilter)) return false;

      // Class / grade filter
      if (!classMatches(item, selectedClass)) return false;

      // Subject Filter
      if (selectedSubject !== 'All Subjects' && item.subject !== selectedSubject) {
        return false;
      }

      // Doc Type / Format Filter
      if (selectedDocType !== 'All Formats') {
        if (item.docType !== selectedDocType && item.category !== selectedDocType) {
          return false;
        }
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const titleMatch = item.title?.toLowerCase().includes(q);
        const descMatch = item.description?.toLowerCase().includes(q);
        const subjectMatch = item.subject?.toLowerCase().includes(q);
        const classMatch = item.classLevel?.toLowerCase().includes(q) || item.assignedClasses?.some(c => c.toLowerCase().includes(q));
        const tagMatch = item.tags?.some(t => t.toLowerCase().includes(q));
        const schoolMatch = item.schoolName?.toLowerCase().includes(q);
        if (!titleMatch && !descMatch && !subjectMatch && !classMatch && !tagMatch && !schoolMatch) {
          return false;
        }
      }

      return true;
    });

    // Sorting
    return list.sort((a, b) => {
      if (selectedDateFilter === 'oldest') {
        return getResourceTimestamp(a) - getResourceTimestamp(b);
      }
      // Default: Most recent uploads first
      return getResourceTimestamp(b) - getResourceTimestamp(a);
    });
  }, [resources, isRead, readFilter, selectedDateFilter, selectedClass, selectedSubject, selectedDocType, searchQuery]);

  const handleOpenResource = (item: ResourceItem) => {
    // Automatically mark as read when opened!
    markRead(item.id);
    if (onPreview) {
      onPreview(item);
    } else {
      const url = item.fileUrl || item.url;
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleMarkAllRead = () => {
    const ids = filteredResources.map(r => r.id);
    markAllRead(ids);
  };

  const formatResourceDate = (item: ResourceItem): string => {
    const ts = getResourceTimestamp(item);
    if (!ts) return 'Active';
    const date = new Date(ts);
    const now = Date.now();
    const diffHours = (now - ts) / (1000 * 60 * 60);

    if (diffHours < 24) {
      if (diffHours < 1) return 'Just now';
      return `${Math.floor(diffHours)}h ago`;
    }
    if (diffHours < 48) return 'Yesterday';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getFormatLabelClass = (type?: string) => {
    switch (type) {
      case 'Past Exam':
      case 'cbt':
        return 'text-[#B91C1C] dark:text-red-400';
      default:
        return 'text-[#1E293B] dark:text-slate-200';
    }
  };

  return (
    <div className={`space-y-4 resource-list-view role-${role}`}>
      {/* Optional Title & Context Header */}
      {title && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1">
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">
            {title}
          </h2>
          {studentClass && (
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 inline-flex items-center gap-1.5 self-start sm:self-auto">
              Class: <strong className="text-slate-700 dark:text-slate-200">{studentClass}</strong>
            </span>
          )}
        </div>
      )}
      {!title && studentClass && role === 'student' && (
        <div className="text-[11px] text-slate-500 dark:text-slate-400">
          Showing personalized materials for class: <span className="font-bold text-brand-red">{studentClass}</span>
        </div>
      )}

      {/* Search and Filter Control Bar */}
      <div className="bg-white dark:bg-[#161B26] p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search resources by title, subject, class grade, or topic..."
              className="w-full pl-10 pr-9 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-brand-red transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Quick Filter Buttons & Trigger */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Filter Toggle Button */}
            <button
              type="button"
              onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
              className={`min-h-10 px-3.5 rounded-xl border text-xs font-bold inline-flex items-center gap-2 transition-all cursor-pointer ${
                isFilterPanelOpen || activeFilterCount > 0
                  ? 'bg-brand-red/10 border-brand-red/30 text-brand-red'
                  : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <SlidersHorizontal size={14} />
              <span>Filter</span>
              {activeFilterCount > 0 && (
                <span className="w-5 h-5 rounded-md bg-brand-red text-white text-[10px] font-black flex items-center justify-center tabular-nums">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Read / Unread Quick Filter */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
              <button
                type="button"
                onClick={() => setReadFilter('all')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                  readFilter === 'all'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setReadFilter('unread')}
                className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 transition-colors ${
                  readFilter === 'unread'
                    ? 'bg-brand-red text-white shadow-2xs'
                    : 'text-slate-500 hover:text-brand-red'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                Unread
              </button>
              <button
                type="button"
                onClick={() => setReadFilter('read')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-colors ${
                  readFilter === 'read'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Read
              </button>
            </div>

            {/* Mark All Read Action */}
            <button
              type="button"
              onClick={handleMarkAllRead}
              title="Mark displayed resources as read"
              className="min-h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-brand-red dark:hover:text-brand-red text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <CheckCircle2 size={14} />
              <span className="hidden sm:inline">Mark All Read</span>
            </button>
          </div>
        </div>

        {/* Collapsible Filter Expansion Panel */}
        {isFilterPanelOpen && (
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 animate-fadeIn">
            {/* 1. Date Filter */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Date &amp; Recency
              </label>
              <select
                value={selectedDateFilter}
                onChange={(e) => setSelectedDateFilter(e.target.value as DateFilterType)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-200 outline-none focus:border-brand-red"
              >
                {DATE_FILTER_OPTIONS.map(opt => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* 2. Class / Grade Filter */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Class / Grade
              </label>
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-200 outline-none focus:border-brand-red"
              >
                {STANDARD_CLASSES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* 3. Subject Filter */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Subject
              </label>
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-200 outline-none focus:border-brand-red"
              >
                {availableSubjects.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* 4. Document Format Filter */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Resource Type
              </label>
              <select
                value={selectedDocType}
                onChange={(e) => setSelectedDocType(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-200 outline-none focus:border-brand-red"
              >
                {availableDocTypes.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            {/* Clear Filters Reset */}
            {activeFilterCount > 0 && (
              <div className="sm:col-span-2 lg:col-span-4 flex items-center justify-between pt-1">
                <span className="text-xs text-slate-500">
                  Showing <strong>{filteredResources.length}</strong> matching resources
                </span>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-xs font-bold text-brand-red hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw size={12} /> Clear all filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Summary Count and Status Header */}
      <div className="flex items-center justify-between px-1 text-xs text-slate-500 font-medium">
        <span>
          Showing <strong>{filteredResources.length}</strong> of {resources.length} resources
        </span>
        {filteredResources.length > 0 && (
          <span className="text-[11px] text-slate-400">
            Click row or Open to read · Bold indicates unread
          </span>
        )}
      </div>

      {/* Main List Layout Container */}
      {filteredResources.length === 0 ? (
        <div className="bg-white dark:bg-[#161B26] rounded-2xl border border-dashed border-slate-300 dark:border-slate-800 p-10 text-center">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto mb-3">
            <BookOpen size={22} />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            {resources.length === 0 ? (emptyMessage || 'No resources available yet') : 'No matching resources found'}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
            {resources.length === 0
              ? 'New syllabus documents, lesson plans, and assignments will appear here once published.'
              : 'Try clearing your search query, class grade, or date recency filter.'}
          </p>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={resetFilters}
              className="mt-3 px-3.5 py-1.5 bg-slate-900 dark:bg-slate-800 text-white text-xs font-bold rounded-xl hover:bg-slate-800 cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white dark:bg-[#161B26] rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-xs overflow-hidden">
          {/* Table-Like Column Header for Desktop */}
          <div className="hidden md:grid grid-cols-[2.2fr_1.1fr_1fr_0.9fr_1.4fr] gap-4 px-5 py-3 border-b border-slate-200/70 dark:border-slate-800 text-[11px] uppercase tracking-wider font-black text-slate-400 bg-slate-50/70 dark:bg-slate-900/60">
            <span>Document / Resource</span>
            <span>Target Class</span>
            <span>Type &amp; Subject</span>
            <span>Date Added</span>
            <span className="text-right">Actions</span>
          </div>

          {/* List Rows */}
          <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
            {filteredResources.map((item) => {
              const unread = !isRead(item.id);
              const isBookmarked = bookmarkedIds.includes(item.id);
              const formattedDate = formatResourceDate(item);
              const hasExternalLink = Boolean(item.fileUrl || item.url);

              return (
                <div
                  key={item.id}
                  className={`group grid grid-cols-1 md:grid-cols-[2.2fr_1.1fr_1fr_0.9fr_1.4fr] gap-3 md:gap-4 px-4 sm:px-5 py-3.5 items-center transition-all cursor-pointer ${
                    unread
                      ? 'bg-slate-50/90 dark:bg-slate-900/80 border-l-4 border-l-[#B91C1C] hover:bg-slate-100/80 dark:hover:bg-slate-800/70'
                      : 'bg-white dark:bg-[#161B26] hover:bg-slate-50/80 dark:hover:bg-slate-850/60'
                  }`}
                  onClick={() => handleOpenResource(item)}
                >
                  {/* Column 1: Document Details & Unread Indicator */}
                  <div className="flex items-start gap-3 min-w-0">
                    {/* Document Icon with Unread Dot */}
                    <div className="relative shrink-0 mt-0.5">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                        unread
                          ? 'bg-brand-red/10 text-brand-red dark:bg-brand-red/20'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                      }`}>
                        <FileText size={17} />
                      </div>
                      {unread && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-brand-red ring-2 ring-white dark:ring-slate-900" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      {(item.schoolName || item.isFeatured) && (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-0.5 text-[10px] font-bold">
                          {item.schoolName && (
                            <span className="text-[#1E293B] dark:text-slate-300 inline-flex items-center gap-1">
                              <School size={10} />
                              <span className="truncate max-w-[140px]">{item.schoolName}</span>
                            </span>
                          )}
                          {item.schoolName && item.isFeatured && <span className="text-slate-300 dark:text-slate-700">·</span>}
                          {item.isFeatured && (
                            <span className="text-[#B91C1C] dark:text-red-400 uppercase tracking-wider font-black">
                              Featured
                            </span>
                          )}
                        </div>
                      )}

                      {/* Title: Bold if unread, normal font if read */}
                      <h4 className={`text-xs sm:text-sm leading-snug line-clamp-1 ${
                        unread
                          ? 'font-black text-slate-900 dark:text-white'
                          : 'font-normal text-slate-600 dark:text-slate-400'
                      }`}>
                        {item.title}
                      </h4>

                      {/* Snippet / Description */}
                      {item.description && (
                        <p className={`text-[11px] line-clamp-1 mt-0.5 ${
                          unread ? 'font-medium text-slate-700 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'
                        }`}>
                          {item.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Column 2: Class Level / Assigned Classes */}
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    <span className="md:hidden text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-2">
                      Class:
                    </span>
                    {item.assignedClasses && item.assignedClasses.length > 0 ? (
                      <span className="text-[11px]">
                        {item.assignedClasses.slice(0, 2).join(', ')}
                        {item.assignedClasses.length > 2 ? ` (+${item.assignedClasses.length - 2})` : ''}
                      </span>
                    ) : (
                      <span className="text-[11px]">
                        {item.classLevel || 'All Classes'}
                      </span>
                    )}
                  </div>

                  {/* Column 3: Type & Subject Metadata */}
                  <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] font-bold">
                    <span className="md:hidden text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1">
                      Subject:
                    </span>
                    {item.subject && (
                      <>
                        <span className="text-slate-600 dark:text-slate-300">{item.subject}</span>
                        <span className="text-slate-300 dark:text-slate-700">·</span>
                      </>
                    )}
                    <span className={getFormatLabelClass(item.docType || item.category)}>
                      {item.docType || item.category || 'Document'}
                    </span>
                  </div>

                  {/* Column 4: Date Added */}
                  <div className="text-xs text-slate-500 font-medium">
                    <span className="md:hidden text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-2">
                      Date:
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock size={12} className="text-slate-400 shrink-0" />
                      <span>{formattedDate}</span>
                    </span>
                  </div>

                  {/* Column 5: Manage / Actions Row */}
                  <div 
                    className="flex items-center justify-end gap-1.5 pt-2 md:pt-0"
                    onClick={(e) => e.stopPropagation()} // Prevent row click
                  >
                    {/* Mark Read/Unread Toggle (Gmail style) */}
                    <button
                      type="button"
                      onClick={() => unread ? markRead(item.id) : markUnread(item.id)}
                      title={unread ? 'Mark as read' : 'Mark as unread'}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      {unread ? <Mail size={15} /> : <MailOpen size={15} />}
                    </button>

                    {/* Bookmark Toggle */}
                    {onBookmark && (
                      <button
                        type="button"
                        onClick={(e) => onBookmark(item.id, e)}
                        title={isBookmarked ? 'Remove bookmark' : 'Bookmark resource'}
                        className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                          isBookmarked 
                            ? 'text-brand-red bg-red-50 dark:bg-red-950/40' 
                            : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Bookmark size={15} fill={isBookmarked ? 'currentColor' : 'none'} />
                      </button>
                    )}

                    {/* Edit Resource Button */}
                    {(showEditButton || onEdit) && (
                      <button
                        type="button"
                        onClick={() => onEdit && onEdit(item)}
                        title="Edit resource links, details & classes"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-[#1E293B] hover:bg-slate-100 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      >
                        <Edit3 size={15} />
                      </button>
                    )}

                    {/* Class assignment is an administrator function only. Students can read/download resources but never manage assignments. */}
                    {role !== 'student' && (showAssignButton || onAssign) && (
                      <button
                        type="button"
                        onClick={() => onAssign && onAssign(item)}
                        title="Assign resource to classes"
                        className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:border-brand-red hover:text-brand-red text-xs font-bold inline-flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Users size={13} />
                        <span className="hidden xl:inline">Manage</span>
                      </button>
                    )}

                    {/* Direct Download/External Link */}
                    {hasExternalLink && (
                      <a
                        href={item.fileUrl || item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Read curriculum"
                        aria-label={`Read ${item.title}`}
                        className="px-2 py-1.5 rounded-lg text-slate-500 hover:text-brand-red hover:bg-slate-100 dark:text-slate-400 dark:hover:text-brand-red dark:hover:bg-slate-800 transition-colors cursor-pointer inline-flex items-center gap-1.5 text-[11px] font-bold"
                        onClick={() => markRead(item.id)}
                      >
                        <Eye size={15} />
                        <span>Read</span>
                      </a>
                    )}

                    {/* Read / Preview Primary Button */}
                    <button
                      type="button"
                      onClick={() => handleOpenResource(item)}
                      className="px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-brand-red dark:hover:bg-brand-red text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="Read resource document"
                    >
                      <BookOpen size={13} />
                      <span>Read</span>
                    </button>

                    {/* Delete button for Admin */}
                    {showDeleteButton && onDelete && (
                      <button
                        type="button"
                        onClick={() => onDelete(item)}
                        title="Delete resource"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-[#B91C1C] hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors cursor-pointer"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ResourceListView;
