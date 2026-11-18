import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Search, X, Loader2, BookOpen, 
  Laptop, Briefcase, Newspaper, FolderOpen, 
  Compass, ChevronRight, CornerDownLeft
} from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useNavigate, useLocation } from 'react-router-dom';

export type SearchCategory = 'ALL' | 'PROGRAMS' | 'RESOURCES' | 'BLOG' | 'SERVICES' | 'PORTFOLIO' | 'PAGES';

export interface SearchItem {
  id: string;
  type: 'PROGRAM' | 'RESOURCE' | 'BLOG' | 'SERVICE' | 'PORTFOLIO' | 'PAGE';
  title: string;
  description: string;
  url: string;
  badge?: string;
  categoryName?: string;
  icon?: React.ReactNode;
}

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Built-in public pages & fast navigation shortcuts
const STATIC_NAV_PAGES: SearchItem[] = [
  {
    id: 'page-home',
    type: 'PAGE',
    title: 'Homepage',
    description: 'Learn, build, create, and grow with Jaystarbliss Studios.',
    url: '/',
    badge: 'Main',
    categoryName: 'Pages'
  },
  {
    id: 'page-about',
    type: 'PAGE',
    title: 'About Us & Mission',
    description: 'Our vision, story, mentors, and educational philosophy.',
    url: '/about',
    badge: 'Overview',
    categoryName: 'Pages'
  },
  {
    id: 'page-programs',
    type: 'PROGRAM',
    title: 'Programs & Curriculum Catalog',
    description: 'Explore all coding, robotics, digital literacy, and academic tracks.',
    url: '/programs',
    badge: 'Courses',
    categoryName: 'Programs'
  },
  {
    id: 'page-roadmap',
    type: 'PROGRAM',
    title: 'Visual Learning Roadmap (Ages 5-18+)',
    description: 'From Scratch & logic blocks to Python, AI, and professional web engineering.',
    url: '/programs?tab=roadmap#roadmap-section',
    badge: 'Curriculum',
    categoryName: 'Programs'
  },
  {
    id: 'page-resources',
    type: 'RESOURCE',
    title: 'Curriculum & Resource Library',
    description: 'Termly syllabi, lesson notes, code cheatsheets, worksheets, and CBT practice.',
    url: '/resources',
    badge: 'Library',
    categoryName: 'Resources'
  },
  {
    id: 'page-blog',
    type: 'BLOG',
    title: 'Tech Blog & Educational Guides',
    description: 'In-depth tutorials, parenting tips for young coders, and studio news.',
    url: '/blog',
    badge: 'Articles',
    categoryName: 'Blog'
  },
  {
    id: 'page-services',
    type: 'SERVICE',
    title: 'Digital Solutions & Enterprise Services',
    description: 'Custom web development, school coding lab setup, and corporate IT training.',
    url: '/services',
    badge: 'Services',
    categoryName: 'Services'
  },
  {
    id: 'page-school',
    type: 'SERVICE',
    title: 'Partner School Coding & Tech Clubs',
    description: 'Curriculum integration, teacher training, and weekly coding workshops.',
    url: '/school-partnership',
    badge: 'Schools',
    categoryName: 'Services'
  },
  {
    id: 'page-particles',
    type: 'PORTFOLIO',
    title: 'Magic 3D Particles & Gesture Lab',
    description: 'Interactive real-time Three.js 3D particles with MediaPipe hand tracking.',
    url: '/magic-particles',
    badge: '3D Lab',
    categoryName: 'Portfolio'
  },
  {
    id: 'page-portal-student',
    type: 'PAGE',
    title: 'Student Portal & Learning Hub',
    description: 'Access courses, class timetable, resources, and coding badges.',
    url: '/portal',
    badge: 'Portal',
    categoryName: 'Pages'
  },
  {
    id: 'page-portal-parent',
    type: 'PAGE',
    title: 'Parent Monitoring Dashboard',
    description: 'Monitor student progress, attendance reports, and tuition receipts.',
    url: '/portal',
    badge: 'Portal',
    categoryName: 'Pages'
  },
  {
    id: 'page-faq',
    type: 'PAGE',
    title: 'Frequently Asked Questions (FAQ)',
    description: 'Admissions, class options (physical/online), pricing, and schedules.',
    url: '/faq',
    badge: 'Support',
    categoryName: 'Pages'
  },
  {
    id: 'page-tutors',
    type: 'PAGE',
    title: 'Find Expert 1-on-1 Tutors',
    description: 'Book private coding, math, science, and music mentors in Lagos.',
    url: '/find-tutor',
    badge: 'Tutoring',
    categoryName: 'Pages'
  },
  {
    id: 'page-contact',
    type: 'PAGE',
    title: 'Contact Studio & Book Consultation',
    description: 'Studio address, phone numbers, WhatsApp, and inquiry form.',
    url: '/contact',
    badge: 'Contact',
    categoryName: 'Pages'
  }
];

const SearchModal: React.FC<SearchModalProps> = ({ isOpen, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<SearchCategory>('ALL');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dbItems, setDbItems] = useState<SearchItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedDb, setHasLoadedDb] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Determine OS for shortcut badge text
  const isMac = typeof window !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

  // Fetch published database documents
  const fetchDbDocuments = useCallback(async () => {
    if (hasLoadedDb) return;
    setIsLoading(true);
    try {
      const [programsSnap, servicesSnap, portfolioSnap, blogSnap, resourcesSnap] = await Promise.all([
        getDocs(query(collection(db, 'programs'), where('status', '==', 'PUBLISHED'))).catch(() => null),
        getDocs(query(collection(db, 'services'), where('status', '==', 'PUBLISHED'))).catch(() => null),
        getDocs(query(collection(db, 'portfolio'), where('status', '==', 'PUBLISHED'))).catch(() => null),
        getDocs(query(collection(db, 'blog'), where('status', '==', 'PUBLISHED'))).catch(() => null),
        getDocs(query(collection(db, 'resources'))).catch(() => null)
      ]);

      const items: SearchItem[] = [];

      if (programsSnap) {
        programsSnap.forEach(doc => {
          const d = doc.data();
          items.push({
            id: `db-prog-${doc.id}`,
            type: 'PROGRAM',
            title: d.title || 'Untitled Program',
            description: d.shortDescription || d.description || 'Comprehensive learning track.',
            url: `/programs/${d.slug || doc.id}`,
            badge: d.category || 'Program',
            categoryName: 'Programs'
          });
        });
      }

      if (servicesSnap) {
        servicesSnap.forEach(doc => {
          const d = doc.data();
          items.push({
            id: `db-srv-${doc.id}`,
            type: 'SERVICE',
            title: d.title || 'Untitled Service',
            description: d.shortDescription || d.description || 'Digital solution & engineering service.',
            url: `/services/${d.slug || doc.id}`,
            badge: 'Service',
            categoryName: 'Services'
          });
        });
      }

      if (portfolioSnap) {
        portfolioSnap.forEach(doc => {
          const d = doc.data();
          items.push({
            id: `db-port-${doc.id}`,
            type: 'PORTFOLIO',
            title: d.title || 'Untitled Project',
            description: d.description || d.shortDescription || 'Built by Jaystarbliss student engineers.',
            url: `/portfolio`,
            badge: d.category || 'Showcase',
            categoryName: 'Portfolio'
          });
        });
      }

      if (blogSnap) {
        blogSnap.forEach(doc => {
          const d = doc.data();
          items.push({
            id: `db-blog-${doc.id}`,
            type: 'BLOG',
            title: d.title || 'Untitled Article',
            description: d.excerpt || d.summary || 'Tech tutorial & insight.',
            url: `/blog/${d.slug || doc.id}`,
            badge: d.category || 'Article',
            categoryName: 'Blog'
          });
        });
      }

      if (resourcesSnap) {
        resourcesSnap.forEach(doc => {
          const d = doc.data();
          const directFile = d.fileUrl || d.downloadUrl || d.url;
          items.push({
            id: `db-res-${doc.id}`,
            type: 'RESOURCE',
            title: d.title || 'Curriculum Material',
            description: `${d.subject || 'Coding & Tech'} • ${d.classLevel || 'General'} — ${d.description || ''}`,
            url: directFile || '/resources',
            badge: d.docType || d.category || 'Resource',
            categoryName: 'Resources'
          });
        });
      }

      setDbItems(items);
      setHasLoadedDb(true);
    } catch (err) {
      console.warn('Search docs fallback to local catalog:', err);
    } finally {
      setIsLoading(false);
    }
  }, [hasLoadedDb]);

  // Handle open & focus
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      setTimeout(() => inputRef.current?.focus(), 50);
      fetchDbDocuments();
    } else {
      document.body.style.overflow = '';
      setSearchTerm('');
      setSelectedIndex(0);
      setActiveCategory('ALL');
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, fetchDbDocuments]);

  // Combine all searchable datasets
  const allSearchableItems = useMemo(() => {
    return [
      ...STATIC_NAV_PAGES,
      ...dbItems
    ];
  }, [dbItems]);

  // Filter items based on active search term and category
  const filteredResults = useMemo(() => {
    let items = allSearchableItems;

    // Filter by Category
    if (activeCategory === 'PROGRAMS') {
      items = items.filter(i => i.type === 'PROGRAM');
    } else if (activeCategory === 'RESOURCES') {
      items = items.filter(i => i.type === 'RESOURCE');
    } else if (activeCategory === 'BLOG') {
      items = items.filter(i => i.type === 'BLOG');
    } else if (activeCategory === 'SERVICES') {
      items = items.filter(i => i.type === 'SERVICE');
    } else if (activeCategory === 'PORTFOLIO') {
      items = items.filter(i => i.type === 'PORTFOLIO');
    } else if (activeCategory === 'PAGES') {
      items = items.filter(i => i.type === 'PAGE');
    }

    if (!searchTerm.trim()) {
      // Return top recommended results when input is empty
      return items.slice(0, 8);
    }

    const term = searchTerm.toLowerCase().trim();
    const tokens = term.split(/\s+/);

    return items
      .filter(item => {
        const titleLower = item.title.toLowerCase();
        const descLower = item.description.toLowerCase();
        const badgeLower = (item.badge || '').toLowerCase();
        
        // Must match all tokens in either title, description or badge
        return tokens.every(token => 
          titleLower.includes(token) || 
          descLower.includes(token) || 
          badgeLower.includes(token)
        );
      })
      .slice(0, 15);
  }, [allSearchableItems, activeCategory, searchTerm]);

  // Keyboard navigation within the modal
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < filteredResults.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : filteredResults.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredResults[selectedIndex]) {
        handleSelect(filteredResults[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const handleSelect = (item: SearchItem) => {
    onClose();
    if (item.type === 'RESOURCE') {
      const pathname = location.pathname;
      if (pathname.startsWith('/admin')) {
        navigate(`/admin/resources${item.title ? `?q=${encodeURIComponent(item.title)}` : ''}`);
        return;
      }
      if (pathname.startsWith('/portal/staff')) {
        navigate('/portal/staff/resources');
        return;
      }
      if (pathname.startsWith('/portal/school')) {
        navigate('/portal/school/resources');
        return;
      }
      if (pathname.startsWith('/portal/parent')) {
        navigate('/portal/parent/resources');
        return;
      }
      if (pathname.startsWith('/portal/student')) {
        navigate('/portal/student/resources');
        return;
      }
      if (item.url.startsWith('http')) {
        window.open(item.url, '_blank', 'noopener,noreferrer');
        return;
      }
      navigate(item.url || '/resources');
      return;
    }

    if (item.url.startsWith('http')) {
      window.open(item.url, '_blank', 'noopener,noreferrer');
    } else {
      navigate(item.url);
    }
  };

  const getItemIcon = (type: string) => {
    switch (type) {
      case 'PROGRAM':
        return <Laptop className="w-4 h-4 text-[#B91C1C] dark:text-red-400" />;
      case 'RESOURCE':
        return <BookOpen className="w-4 h-4 text-[#1E293B] dark:text-slate-200" />;
      case 'BLOG':
        return <Newspaper className="w-4 h-4 text-[#1E293B] dark:text-slate-200" />;
      case 'SERVICE':
        return <Briefcase className="w-4 h-4 text-[#B91C1C] dark:text-red-400" />;
      case 'PORTFOLIO':
        return <FolderOpen className="w-4 h-4 text-slate-600 dark:text-slate-300" />;
      default:
        return <Compass className="w-4 h-4 text-slate-400" />;
    }
  };

  const categories: { key: SearchCategory; label: string; count?: number }[] = [
    { key: 'ALL', label: 'All Items' },
    { key: 'PROGRAMS', label: 'Programs' },
    { key: 'RESOURCES', label: 'Resource Library' },
    { key: 'BLOG', label: 'Blog & News' },
    { key: 'SERVICES', label: 'Services' },
    { key: 'PORTFOLIO', label: 'Projects & Labs' },
    { key: 'PAGES', label: 'Pages' }
  ];

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-start justify-center pt-16 sm:pt-24 px-3 sm:px-6"
      onKeyDown={handleKeyDown}
    >
      {/* Dark Blur Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-md transition-opacity animate-in fade-in duration-150"
        onClick={onClose}
      />

      {/* Search Modal Card */}
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-2xl shadow-black/30 overflow-hidden flex flex-col max-h-[82vh] animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-150">
        
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-slate-100 dark:border-slate-800 gap-3 bg-slate-50/50 dark:bg-slate-900/80">
          <Search className="w-5 h-5 text-slate-400 dark:text-slate-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent border-0 focus:outline-none focus:ring-0 text-base sm:text-lg font-medium text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 w-full"
            placeholder="Search programs, curriculum, lesson notes, blog, services..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setSelectedIndex(0);
            }}
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              aria-label="Clear search input"
            >
              <X size={16} />
            </button>
          )}
          <div className="hidden sm:flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shadow-xs">
              ESC
            </kbd>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors sm:hidden"
            aria-label="Close search"
          >
            <X size={18} />
          </button>
        </div>

        {/* Category Filter Tabs */}
        <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800/80 bg-white dark:bg-slate-900/60 overflow-x-auto no-scrollbar flex items-center gap-1.5">
          {categories.map((cat) => (
            <button
              key={cat.key}
              onClick={() => {
                setActiveCategory(cat.key);
                setSelectedIndex(0);
              }}
              className={`px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all select-none ${
                activeCategory === cat.key
                  ? 'bg-[#1E293B] dark:bg-white text-white dark:text-[#1E293B] shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Search Results Area */}
        <div 
          ref={resultsContainerRef}
          className="overflow-y-auto flex-1 p-2 divide-y divide-slate-100 dark:divide-slate-800/40"
        >
          {isLoading && !hasLoadedDb ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-[#B91C1C]" />
              <span className="text-xs font-medium">Indexing knowledge base & syllabi...</span>
            </div>
          ) : filteredResults.length > 0 ? (
            <div className="flex flex-col gap-1">
              {!searchTerm && (
                <div className="px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {activeCategory === 'ALL' ? 'Recommended & Quick Shortcuts' : `Featured in ${activeCategory}`}
                </div>
              )}
              {filteredResults.map((result, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <button
                    key={`${result.type}-${result.id}-${idx}`}
                    onClick={() => handleSelect(result)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`w-full text-left px-3.5 py-2.5 rounded-xl transition-all group flex items-start gap-3 select-none ${
                      isSelected
                        ? 'bg-slate-100/90 dark:bg-slate-800/70 text-slate-900 dark:text-white ring-1 ring-[#1E293B]/20 dark:ring-white/20'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className={`p-2 rounded-lg shrink-0 mt-0.5 transition-colors ${
                      isSelected 
                        ? 'bg-white dark:bg-slate-900' 
                        : 'bg-slate-100 dark:bg-slate-800'
                    }`}>
                      {getItemIcon(result.type)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className={`text-[10px] font-black uppercase tracking-wider shrink-0 ${
                          isSelected
                            ? 'text-[#B91C1C] dark:text-red-400'
                            : 'text-slate-400 dark:text-slate-500'
                        }`}>
                          {result.badge || result.type}
                        </span>
                        <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                        <h4 className={`text-xs sm:text-sm font-bold truncate transition-colors ${
                          isSelected ? 'text-[#1E293B] dark:text-white' : 'text-slate-900 dark:text-white'
                        }`}>
                          {result.title}
                        </h4>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                        {result.description}
                      </p>
                    </div>

                    <div className="shrink-0 self-center">
                      {isSelected ? (
                        <div className="flex items-center gap-1 text-[11px] font-bold text-brand-red">
                          <span className="hidden sm:inline">Go</span>
                          <CornerDownLeft size={13} />
                        </div>
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="py-12 px-4 text-center">
              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto mb-3">
                <Search size={22} />
              </div>
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">No matching results found</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                We couldn't find anything matching "{searchTerm}". Try searching for terms like "Python", "Robotics", "Syllabus", "Scratch", or "Tuition".
              </p>
            </div>
          )}
        </div>

        {/* Footer Shortcut Hints */}
        <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[10px] font-bold">↑↓</kbd> Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[10px] font-bold">↵</kbd> Select
            </span>
            <span className="hidden sm:inline-flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[10px] font-bold">ESC</kbd> Close
            </span>
          </div>

          <div className="flex items-center gap-1 font-semibold text-slate-400">
            <span>Shortcut:</span>
            <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-[10px] font-bold text-slate-700 dark:text-slate-300">
              {isMac ? '⌘ + K' : 'Ctrl + K'}
            </kbd>
          </div>
        </div>

      </div>
    </div>
  );
};

export default SearchModal;
