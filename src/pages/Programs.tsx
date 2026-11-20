import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { getAllClientDatabases } from '../lib/firebase';
import MainLayout from '../components/layout/MainLayout';
import SEO from '../components/ui/SEO';
import { motion, AnimatePresence } from 'motion/react';
import { Card, CardContent, CardFooter } from '../components/ui/Card';
import Button from '../components/ui/Button';
import { CardSkeleton } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import {
  GraduationCap,
  Laptop,
  Palette,
  Music,
  Search,
  X,
  Layers,
  ArrowRight,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import StageArchitectureBanner from '../components/ecosystem/StageArchitectureBanner';
import LearningSchoolsGrid from '../components/ecosystem/LearningSchoolsGrid';
import LearningPathBuilder from '../components/ecosystem/LearningPathBuilder';
import InteractiveTrackRoadmap from '../components/ecosystem/InteractiveTrackRoadmap';
import PageHeader from '../components/ui/PageHeader';
import { pageHeaderImages } from '../lib/stockImages';
import { resolveProgramBackgroundImage } from '../lib/programMedia';
import { usePageSection } from '../lib/cms';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import {
  type CanonicalRootKey,
  type ProgramRecord,
  type ProgramIndicatorLabel,
  normalizeProgramRecord,
  normalizeCanonicalRootKey,
  getTopLevelCatalogEntries,
} from '../lib/programHierarchy';

function resolveProgramRouteSlug(program: ProgramRecord): string {
  const rawSlug = String(program?.slug || '').trim();
  if (
    rawSlug &&
    !rawSlug.startsWith('http://') &&
    !rawSlug.startsWith('https://') &&
    !rawSlug.includes('/')
  ) {
    return rawSlug;
  }
  return String(program?.id || '');
}

type CatalogFilterKey = 'ALL' | CanonicalRootKey;

const CANONICAL_ROOT_FILTERS: Array<{
  key: CatalogFilterKey;
  label: string;
  shortLabel: string;
  icon: React.FC<{ size?: number; className?: string }>;
}> = [
  { key: 'ALL', label: 'All Four Programmes', shortLabel: 'All Programmes', icon: Layers },
  { key: 'technology', label: 'Technology', shortLabel: 'Technology', icon: Laptop },
  { key: 'music', label: 'Music', shortLabel: 'Music', icon: Music },
  { key: 'academics', label: 'Academics', shortLabel: 'Academics', icon: GraduationCap },
  {
    key: 'design-graphics',
    label: 'Design and Graphics',
    shortLabel: 'Design & Graphics',
    icon: Palette,
  },
];

const INDICATOR_STYLE_MAP: Record<ProgramIndicatorLabel, string> = {
  HOT: 'bg-[#B91C1C]/10 text-[#B91C1C] dark:bg-red-500/15 dark:text-red-300 border-[#B91C1C]/35 dark:border-red-400/35',
  'IN SESSION':
    'bg-emerald-600/10 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300 border-emerald-600/30 dark:border-emerald-400/35',
  'LIMITED TIME':
    'bg-amber-600/10 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300 border-amber-600/35 dark:border-amber-400/35',
};

const ROOT_LABEL_MAP: Record<CanonicalRootKey, string> = {
  technology: 'Technology',
  music: 'Music',
  academics: 'Academics',
  'design-graphics': 'Design & Graphics',
};

const Programs: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const { data: heroData } = usePageSection('programs', 'hero', {
    title: 'One Ecosystem',
    subtitle: 'find a specialised learning pathway',
    bannerImage: '',
  });
  const [activeView, setActiveView] = useState<'ecosystem' | 'roadmap' | 'pathfinder' | 'catalog'>(
    'ecosystem'
  );
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>('technology');
  const [allPrograms, setAllPrograms] = useState<ProgramRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);
  const [selectedRootFilter, setSelectedRootFilter] = useState<CatalogFilterKey>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Handle URL hashes and query parameters (e.g. /programs?tab=catalog&category=technology#catalog-section)
  useEffect(() => {
    const rawSchool = searchParams.get('school') || searchParams.get('category');
    const rawTab = (searchParams.get('tab') || searchParams.get('view') || '').toLowerCase();
    const rawHash = location.hash.replace(/^#/, '').toLowerCase();

    const resolvedFromParam = normalizeCanonicalRootKey(rawSchool);
    const resolvedFromHash = normalizeCanonicalRootKey(rawHash);
    const resolvedRootKey = resolvedFromParam || resolvedFromHash;

    if (rawTab === 'roadmap' || rawHash === 'roadmap' || rawHash === 'visual-roadmap') {
      setActiveView('roadmap');
      setTimeout(() => {
        const el =
          document.getElementById('roadmap-section') || document.getElementById('visual-roadmap');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 100);
      return;
    }

    if (
      rawTab === 'catalog' ||
      rawHash === 'catalog' ||
      rawHash === 'catalog-section' ||
      rawHash === 'courses'
    ) {
      setActiveView('catalog');
      setSelectedRootFilter(resolvedRootKey ?? 'ALL');
      if (resolvedRootKey) {
        setSelectedSchoolId(resolvedRootKey);
      }
      setTimeout(() => {
        const el = document.getElementById('catalog-section');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 120);
      return;
    }

    if (rawTab === 'pathfinder' || rawHash === 'pathfinder') {
      setActiveView('pathfinder');
      setTimeout(() => {
        const el = document.getElementById('pathfinder-section');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 100);
      return;
    }

    if (resolvedRootKey) {
      setActiveView('ecosystem');
      setSelectedSchoolId(resolvedRootKey);
      setSelectedRootFilter(resolvedRootKey);

      setTimeout(() => {
        const el =
          document.getElementById('school-hub') || document.getElementById('programs-content');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        }
      }, 150);
    } else if (
      rawHash === 'ecosystem' ||
      rawHash === 'academies' ||
      rawHash === 'programs' ||
      rawHash === 'programs-content' ||
      rawHash === 'programs-section'
    ) {
      setActiveView('ecosystem');
      setTimeout(() => {
        const el = document.getElementById('programs-content');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [location.pathname, location.search, location.hash, searchParams]);

  const fetchPrograms = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const dbs = getAllClientDatabases();
      const merged = new Map<string, ProgramRecord>();
      let succeededCount = 0;

      await Promise.all(
        dbs.map(async (clientDb) => {
          try {
            const snapshot = await getDocs(collection(clientDb, 'programs'));
            succeededCount += 1;
            snapshot.docs.forEach((docSnap) => {
              if (!merged.has(docSnap.id)) {
                merged.set(
                  docSnap.id,
                  normalizeProgramRecord(docSnap.id, docSnap.data() as Record<string, any>)
                );
              }
            });
          } catch {
            // ignore secondary db error; tracked by succeededCount
          }
        })
      );

      if (succeededCount === 0) {
        throw new Error('Could not reach the programme catalogue right now.');
      }

      setAllPrograms(Array.from(merged.values()));
    } catch (error: any) {
      console.error('Error fetching programs:', error);
      setAllPrograms([]);
      setLoadError(
        error?.message || 'Unable to load programmes at the moment. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPrograms();
  }, [fetchPrograms, retryToken]);

  const programsMap = useMemo(() => {
    const map = new Map<string, ProgramRecord>();
    allPrograms.forEach((p) => map.set(p.id, p));
    return map;
  }, [allPrograms]);

  // Hierarchy-aware top-level catalogue entries (children stay nested unless showAsStandalone is true)
  const catalogEntries = useMemo(() => {
    return getTopLevelCatalogEntries(programsMap, selectedRootFilter);
  }, [programsMap, selectedRootFilter]);

  const totalTopLevelCount = useMemo(() => {
    return getTopLevelCatalogEntries(programsMap, 'ALL').length;
  }, [programsMap]);

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return catalogEntries;
    return catalogEntries.filter(({ program, rootTitle, descendantSearchText }) => {
      return (
        program.title.toLowerCase().includes(q) ||
        program.shortDescription.toLowerCase().includes(q) ||
        program.fullDescription.toLowerCase().includes(q) ||
        program.whoIsItFor.toLowerCase().includes(q) ||
        rootTitle.toLowerCase().includes(q) ||
        descendantSearchText.includes(q)
      );
    });
  }, [catalogEntries, searchQuery]);

  const handleSelectFilter = (nextFilter: CatalogFilterKey) => {
    setSelectedRootFilter(nextFilter);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('tab', 'catalog');
    if (nextFilter === 'ALL') {
      nextParams.delete('category');
      nextParams.delete('school');
    } else {
      nextParams.set('category', nextFilter);
      nextParams.delete('school');
    }
    setSearchParams(nextParams, { replace: true });
  };

  return (
    <MainLayout>
      <SEO
        title="Our Learning Ecosystem | 4 Primary Programmes & Specialised Tracks"
        description="Explore the recursive learning ecosystem: Technology Programme, Design & Graphics Programme, Music Programme, and Academics Programme."
      />

      {/* Hero Header */}
      <PageHeader
        eyebrow=""
        title={heroData.title ? heroData.title.replace(/\.$/, '') : 'One Ecosystem'}
        description={heroData.subtitle || 'find a specialised learning pathway'}
        image={heroData.bannerImage}
        fallbackImage={pageHeaderImages.programs}
        size="lg"
      >
        {/* Two Main Calls to Action */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 mb-12">
          <button
            type="button"
            onClick={() => {
              setActiveView('pathfinder');
              setTimeout(() => {
                const el =
                  document.getElementById('pathfinder-section') ||
                  document.getElementById('programs-content');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }, 60);
            }}
            className="bg-[#e11d48] hover:bg-red-700 text-white px-7 py-3.5 rounded-xl font-extrabold text-xs uppercase tracking-wider flex items-center justify-center shadow-[0_10px_30px_-6px_rgba(225,29,72,0.55)] transition-all text-center cursor-pointer"
          >
            <span>Build My Child&apos;s Pathway</span>
          </button>

          <Link
            to="/tutors"
            className="bg-white/[0.04] hover:bg-white/[0.1] text-white border border-white/20 px-7 py-3.5 rounded-xl font-extrabold text-xs uppercase tracking-wider flex items-center justify-center transition-all text-center"
          >
            <span>Find a Dedicated Mentor</span>
          </Link>
        </div>

        {/* Minimal Editorial Horizontal Tab System */}
        {(() => {
          const heroTabs: Array<{
            id: 'ecosystem' | 'roadmap' | 'pathfinder' | 'catalog';
            label: string;
            number: string;
            title: string;
            description: string;
            actionLabel: string;
            targetSectionId: string;
          }> = [
            {
              id: 'ecosystem',
              label: 'Core Programmes',
              number: '04',
              title: 'Core Programmes',
              description: 'Explore the 4 primary programme pillars and nested pathways.',
              actionLabel: 'Explore programmes',
              targetSectionId: 'programs-content',
            },
            {
              id: 'roadmap',
              label: 'Visual Roadmap',
              number: '05',
              title: 'Visual Roadmap',
              description:
                'Interactive step-by-step milestone progression across all 5 mastery stages.',
              actionLabel: 'Explore roadmap',
              targetSectionId: 'roadmap-section',
            },
            {
              id: 'pathfinder',
              label: 'Custom Pathfinder',
              number: '01',
              title: 'Custom Pathfinder',
              description: 'Answer a few quick questions to build a tailored learning schedule.',
              actionLabel: 'Start pathfinder',
              targetSectionId: 'pathfinder-section',
            },
            {
              id: 'catalog',
              label: 'Program Catalog',
              number: String(totalTopLevelCount).padStart(2, '0'),
              title: 'Program Catalog',
              description:
                'Search and filter every published course, track, and workshop directly.',
              actionLabel: 'Browse catalog',
              targetSectionId: 'catalog-section',
            },
          ];

          const selectedTab = heroTabs.find((t) => t.id === activeView) || heroTabs[0];

          return (
            <div className="max-w-3xl">
              {/* Horizontal Text Selector with Animated Red Active Underline */}
              <div
                className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-4 sm:gap-8 border-b border-white/15"
                role="tablist"
                aria-label="Ecosystem section selector"
              >
                {heroTabs.map((tab) => {
                  const isActive = activeView === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setActiveView(tab.id)}
                      className={`relative pb-3.5 pt-1 text-sm sm:text-base transition-colors cursor-pointer whitespace-nowrap select-none ${
                        isActive
                          ? 'text-white font-extrabold'
                          : 'text-white/65 hover:text-white font-medium'
                      }`}
                    >
                      <span>{tab.label}</span>
                      {isActive && (
                        <motion.div
                          layoutId="programsHeroActiveUnderline"
                          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                          className="absolute bottom-[-1.5px] left-0 right-0 h-[3px] rounded-full bg-[#ef4444] shadow-[0_0_16px_rgba(239,68,68,0.85)]"
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Focused Content Area with Large Numerical Accent */}
              <div className="pt-8 sm:pt-10 min-h-[140px]">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={selectedTab.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                    className="flex flex-col sm:flex-row sm:items-center gap-6 sm:gap-8"
                  >
                    <div className="flex items-center gap-6 sm:gap-8">
                      <span
                        className="text-6xl sm:text-7xl lg:text-[5.25rem] font-black tracking-tight leading-none bg-gradient-to-r from-[#ef4444] via-[#dc2626] to-white/25 bg-clip-text text-transparent drop-shadow-[0_0_28px_rgba(239,68,68,0.4)] select-none tabular-nums"
                        aria-hidden="true"
                      >
                        {selectedTab.number}
                      </span>
                      <div className="h-16 sm:h-20 w-px bg-white/15 shrink-0" />
                    </div>

                    <div className="space-y-1.5">
                      <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                        {selectedTab.title}
                      </h2>
                      <p className="text-sm sm:text-base text-white/75 leading-relaxed max-w-lg">
                        {selectedTab.description}
                      </p>
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            const targetEl =
                              document.getElementById(selectedTab.targetSectionId) ||
                              document.getElementById('programs-content');
                            if (targetEl) targetEl.scrollIntoView({ behavior: 'smooth' });
                          }}
                          className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-[#ef4444] hover:text-red-400 transition-colors cursor-pointer group"
                        >
                          <span>{selectedTab.actionLabel}</span>
                          <ArrowRight
                            size={15}
                            className="transition-transform group-hover:translate-x-1"
                          />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          );
        })()}
      </PageHeader>

      {/* Main Section Content based on active view */}
      <div
        id="programs-content"
        className="digital-canvas py-12 sm:py-16 lg:py-20 scroll-mt-24 overflow-x-clip"
      >
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl space-y-14 lg:space-y-20">
          {/* View 1: Core Programs & Deep Dive */}
          {activeView === 'ecosystem' && (
            <div
              id="ecosystem-section"
              className="space-y-12 sm:space-y-16 lg:space-y-20 scroll-mt-24"
            >
              <LearningSchoolsGrid
                selectedSchoolId={selectedSchoolId}
                onSchoolChange={(id) => {
                  setSelectedSchoolId(id);
                  const root = normalizeCanonicalRootKey(id);
                  if (root) setSelectedRootFilter(root);
                }}
              />

              <hr
                className="border-t border-slate-200/80 dark:border-white/10"
                aria-hidden="true"
              />

              <StageArchitectureBanner
                onSelectSchool={(id) => {
                  setSelectedSchoolId(id);
                }}
              />
            </div>
          )}

          {/* View 2: Interactive Visual Roadmap */}
          {activeView === 'roadmap' && (
            <div id="roadmap-section" className="space-y-8 scroll-mt-24">
              <InteractiveTrackRoadmap />
            </div>
          )}

          {/* View 3: Pathfinder */}
          {activeView === 'pathfinder' && (
            <div id="pathfinder-section" className="space-y-8 scroll-mt-24">
              <LearningPathBuilder />
            </div>
          )}

          {/* View 4: Program Catalog & Compact Course Cards */}
          {activeView === 'catalog' && (
            <div id="catalog-section" className="space-y-8 scroll-mt-28">
              {/* Filter & Search Bar */}
              <div className="pro-surface relative z-10 p-3.5 sm:p-4 rounded-2xl flex flex-col gap-3">
                <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                  {/* Search Input */}
                  <div className="relative flex-1 md:max-w-sm">
                    <Search
                      size={15}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search courses by title, topic, or track..."
                      className="w-full pl-9 pr-8 py-2 rounded-xl text-xs bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-brand-red transition-all"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        aria-label="Clear search"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Canonical Root Quick Filter Bar */}
                  <div
                    className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 md:pb-0"
                    role="group"
                    aria-label="Filter programmes by primary root"
                  >
                    {CANONICAL_ROOT_FILTERS.map((item) => {
                      const Icon = item.icon;
                      const isActive = selectedRootFilter === item.key;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => handleSelectFilter(item.key)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap border transition-colors cursor-pointer ${
                            isActive
                              ? 'bg-[#B91C1C] text-white border-[#B91C1C]'
                              : 'bg-slate-100/90 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500'
                          }`}
                        >
                          <Icon size={13} />
                          <span>{item.shortLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {!loading && !loadError && (
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-200/70 dark:border-slate-800 pt-2">
                    <span className="tabular-nums font-medium">
                      Showing <strong className="text-slate-900 dark:text-white">{filteredEntries.length}</strong>{' '}
                      {filteredEntries.length === 1 ? 'programme' : 'programmes'}
                      {selectedRootFilter !== 'ALL' ? ` under ${ROOT_LABEL_MAP[selectedRootFilter]}` : ''}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                      Sorted: Newest First
                    </span>
                  </div>
                )}
              </div>

              {/* Published Courses Grid */}
              {loading ? (
                <div className="grid grid-cols-1 min-[380px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5 sm:gap-4">
                  <CardSkeleton />
                  <CardSkeleton />
                  <CardSkeleton />
                  <CardSkeleton />
                </div>
              ) : loadError ? (
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 text-center border border-red-200 dark:border-red-900/50 space-y-3">
                  <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/50 text-[#B91C1C]">
                    <AlertCircle size={20} />
                  </div>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                    Unable to Load Programme Catalogue
                  </h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                    {loadError}
                  </p>
                  <button
                    type="button"
                    onClick={() => setRetryToken((n) => n + 1)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#B91C1C] hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
                  >
                    <RefreshCw size={13} />
                    <span>Retry</span>
                  </button>
                </div>
              ) : filteredEntries.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-10 text-center border border-slate-200 dark:border-slate-800 space-y-4">
                  <EmptyState
                    title="No Programmes Found"
                    description={
                      selectedRootFilter !== 'ALL' || searchQuery
                        ? 'No published programmes match your current filter. Try switching categories or clearing your search.'
                        : 'No published programmes are available in the catalogue yet.'
                    }
                  />
                  {(selectedRootFilter !== 'ALL' || searchQuery) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        handleSelectFilter('ALL');
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      Show All Programmes
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 min-[380px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5 sm:gap-4">
                  {filteredEntries.map(
                    ({
                      program,
                      rootKey,
                      rootTitle,
                      indicators,
                      directChildrenCount,
                      totalDescendantsCount,
                      isContainer,
                    }) => {
                      const bgImage = resolveProgramBackgroundImage(program, programsMap, rootKey);
                      const routeHref = `/programs/${resolveProgramRouteSlug(program)}`;

                      if (isContainer) {
                        const trackCount =
                          totalDescendantsCount > directChildrenCount
                            ? totalDescendantsCount
                            : directChildrenCount;
                        return (
                          <Link
                            key={program.id}
                            to={routeHref}
                            className="group relative flex flex-col justify-between min-h-[268px] sm:min-h-[288px] rounded-2xl overflow-hidden border border-slate-200/80 dark:border-white/15 bg-slate-950 shadow-sm hover:shadow-xl transition-all duration-300"
                          >
                            <img
                              src={bgImage}
                              alt={program.title || 'Programme container cover'}
                              loading="lazy"
                              className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                            />
                            <div
                              className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/60 to-slate-950/20"
                              aria-hidden="true"
                            />

                            {/* Top meta row */}
                            <div className="relative z-10 p-3.5 flex items-start justify-between gap-2">
                              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-red-400">
                                {rootTitle}
                              </span>
                              {indicators.length > 0 && (
                                <div className="flex flex-wrap justify-end gap-1">
                                  {indicators.map((label) => (
                                    <span
                                      key={label}
                                      className={`px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] border rounded-sm bg-slate-950/80 text-white border-white/20`}
                                    >
                                      {label}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Bottom Editorial Copy */}
                            <div className="relative z-10 p-4 pt-8 space-y-2">
                              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-300/90 tabular-nums">
                                {trackCount > 0
                                  ? `${trackCount} ${trackCount === 1 ? 'Sub-Programme' : 'Sub-Programmes'}`
                                  : 'Programme Pathway'}
                              </div>
                              <h3 className="text-base sm:text-lg font-extrabold text-white leading-snug line-clamp-2 tracking-tight">
                                {program.title}
                              </h3>
                              {program.shortDescription && (
                                <p className="text-[11px] text-slate-200/85 line-clamp-2 leading-relaxed">
                                  {program.shortDescription}
                                </p>
                              )}
                              <div className="pt-2 flex items-center justify-between gap-2 border-t border-white/15">
                                <span className="text-[11px] font-semibold text-slate-300 truncate">
                                  {program.nodeType === 'CONTAINER'
                                    ? 'Browse Pathway'
                                    : program.duration || 'Flexible Schedule'}
                                </span>
                                <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-white group-hover:text-red-300 transition-colors shrink-0">
                                  <span>
                                    {program.nodeType === 'CONTAINER' ? 'Explore' : 'View'}
                                  </span>
                                  <ArrowRight
                                    size={12}
                                    className="transition-transform group-hover:translate-x-0.5"
                                  />
                                </span>
                              </div>
                            </div>
                          </Link>
                        );
                      }

                      return (
                        <Card
                          key={program.id}
                          hoverEffect
                          className="pro-surface pro-interactive flex flex-col justify-between overflow-hidden !rounded-2xl"
                        >
                          <div>
                            <div className="relative h-28 sm:h-32 overflow-hidden bg-slate-900">
                              <img
                                src={bgImage}
                                alt={program.title || 'Programme cover'}
                                loading="lazy"
                                className="absolute inset-0 w-full h-full object-cover"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-950/15 to-transparent" />
                              {indicators.length > 0 && (
                                <div className="absolute top-2 left-2 right-2 flex flex-wrap gap-1">
                                  {indicators.map((label) => (
                                    <span
                                      key={label}
                                      className={`px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] border rounded-sm backdrop-blur-xs bg-white/90 dark:bg-slate-950/90 ${INDICATOR_STYLE_MAP[label]}`}
                                    >
                                      {label}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>

                            <CardContent className="!p-3 sm:!p-3.5 space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#B91C1C] dark:text-red-400 truncate">
                                  {rootTitle}
                                </span>
                                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 shrink-0">
                                  {program.deliveryMode || 'Online / Physical'}
                                </span>
                              </div>

                              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white leading-snug line-clamp-2">
                                {program.title}
                              </h3>

                              {program.shortDescription && (
                                <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                                  {program.shortDescription}
                                </p>
                              )}
                            </CardContent>
                          </div>

                          <CardFooter className="!px-3 sm:!px-3.5 !py-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">
                              {program.duration || 'Flexible Schedule'}
                            </span>
                            <Button
                              to={routeHref}
                              size="sm"
                              className="!px-2.5 !py-1.5 font-bold text-[11px] bg-[#B91C1C] hover:bg-red-700 text-white shrink-0"
                              rightIcon={<ArrowRight size={12} />}
                            >
                              View
                            </Button>
                          </CardFooter>
                        </Card>
                      );
                    }
                  )}
                </div>
              )}
            </div>
          )}

          {/* Quick Institutional / School Bar */}
          <div className="relative overflow-hidden p-7 sm:p-9 rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-red-950 text-white flex flex-col md:flex-row items-center justify-between gap-6 border border-white/10 shadow-xl">
            <div className="space-y-1 text-center md:text-left">
              <div className="text-xs font-black uppercase tracking-widest text-brand-red">
                Institutional Partnerships
              </div>
              <h3 className="text-xl sm:text-2xl font-black">
                Bringing the Ecosystem to Your School?
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 max-w-xl">
                Explore our Tier 1 (1 day/wk), Tier 2 (2 days/wk), and Tier 3 (3 days/wk) school
                Coding, Robotics, Music, and Chess delivery models.
              </p>
            </div>
            <Button
              to="/school-partnership"
              className="shrink-0 bg-brand-red hover:bg-red-700 text-white font-extrabold uppercase tracking-wider text-xs px-6 py-3 shadow-lg shadow-brand-red/20"
              rightIcon={<ArrowRight size={14} />}
            >
              School Delivery Tiers
            </Button>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default Programs;
