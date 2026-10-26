import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
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
  Brain,
  Gamepad2,
  Baby,
  Users,
  BookOpen, 
  Search, 
  X,
  Layers,
  ArrowRight,
  Compass,
  UserCheck
} from 'lucide-react';
import StageArchitectureBanner from '../components/ecosystem/StageArchitectureBanner';
import LearningSchoolsGrid from '../components/ecosystem/LearningSchoolsGrid';
import LearningPathBuilder from '../components/ecosystem/LearningPathBuilder';
import InteractiveTrackRoadmap from '../components/ecosystem/InteractiveTrackRoadmap';
import PageHeader from '../components/ui/PageHeader';
import { pageHeaderImages, getProgramImage } from '../lib/stockImages';
import { usePageSection } from '../lib/cms';
import { Link, useLocation, useSearchParams } from 'react-router-dom';

const SCHOOL_FILTER_MAP: Record<string, { label: string; icon: React.FC<{ size?: number; className?: string }> }> = {
  ALL: { label: 'All 8 Programs', icon: Layers },
  'technology-programming': { label: 'Tech & Coding', icon: Laptop },
  'digital-literacy': { label: 'Digital Literacy', icon: Brain },
  'creative-design': { label: 'Creative Design', icon: Palette },
  'music-performing-arts': { label: 'Music & Instruments', icon: Music },
  'academic-excellence': { label: 'Academic Excellence', icon: GraduationCap },
  'strategy-games': { label: 'Chess & Strategy', icon: Gamepad2 },
  'young-creators': { label: 'Young Creators', icon: Baby },
  'private-tutoring': { label: 'Private Mentorship', icon: Users }
};

const CANONICAL_SCHOOL_MAP: Record<string, { schoolId: string; filterKey: string }> = {
  'tech-programming': { schoolId: 'tech-programming', filterKey: 'technology-programming' },
  'technology-programming': { schoolId: 'tech-programming', filterKey: 'technology-programming' },
  'tech': { schoolId: 'tech-programming', filterKey: 'technology-programming' },
  'coding': { schoolId: 'tech-programming', filterKey: 'technology-programming' },
  'digital_and_technology': { schoolId: 'tech-programming', filterKey: 'technology-programming' },
  'digital-technology': { schoolId: 'tech-programming', filterKey: 'technology-programming' },
  'digital-literacy': { schoolId: 'digital-literacy', filterKey: 'digital-literacy' },
  'literacy': { schoolId: 'digital-literacy', filterKey: 'digital-literacy' },
  'creative-design': { schoolId: 'creative-design', filterKey: 'creative-design' },
  'creative': { schoolId: 'creative-design', filterKey: 'creative-design' },
  'design': { schoolId: 'creative-design', filterKey: 'creative-design' },
  'music-performing-arts': { schoolId: 'music-performing-arts', filterKey: 'music-performing-arts' },
  'music': { schoolId: 'music-performing-arts', filterKey: 'music-performing-arts' },
  'instruments': { schoolId: 'music-performing-arts', filterKey: 'music-performing-arts' },
  'academic-excellence': { schoolId: 'academic-excellence', filterKey: 'academic-excellence' },
  'academics': { schoolId: 'academic-excellence', filterKey: 'academic-excellence' },
  'academic': { schoolId: 'academic-excellence', filterKey: 'academic-excellence' },
  'strategy-games': { schoolId: 'strategy-games', filterKey: 'strategy-games' },
  'strategy': { schoolId: 'strategy-games', filterKey: 'strategy-games' },
  'chess': { schoolId: 'strategy-games', filterKey: 'strategy-games' },
  'young-creators': { schoolId: 'young-creators', filterKey: 'young-creators' },
  'young': { schoolId: 'young-creators', filterKey: 'young-creators' },
  'early-learners': { schoolId: 'young-creators', filterKey: 'young-creators' },
  'private-tutoring': { schoolId: 'private-tutoring', filterKey: 'private-tutoring' },
  'tutoring': { schoolId: 'private-tutoring', filterKey: 'private-tutoring' },
  'school-partnership': { schoolId: 'tech-programming', filterKey: 'ALL' },
  'school_programs': { schoolId: 'tech-programming', filterKey: 'ALL' },
  'school-programs': { schoolId: 'tech-programming', filterKey: 'ALL' }
};

const Programs: React.FC = () => {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const { data: heroData } = usePageSection('programs', 'hero', {
    title: "One Ecosystem",
    subtitle: "find a specialised learning pathway",
    bannerImage: ''
  });
  const [activeView, setActiveView] = useState<'ecosystem' | 'roadmap' | 'pathfinder' | 'catalog'>('ecosystem');
  const [selectedSchoolId, setSelectedSchoolId] = useState<string>('tech-programming');
  const [programs, setPrograms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSchoolFilter, setSelectedSchoolFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Handle URL hashes and query parameters (e.g. /programs?tab=roadmap or /programs#roadmap)
  useEffect(() => {
    const rawSchool = searchParams.get('school') || searchParams.get('category');
    const rawTab = searchParams.get('tab') || searchParams.get('view');
    const rawHash = location.hash.replace(/^#/, '').toLowerCase();

    let targetSchoolKey = rawSchool?.toLowerCase() || (rawHash && CANONICAL_SCHOOL_MAP[rawHash] ? rawHash : null);

    if (rawTab === 'roadmap' || rawHash === 'roadmap' || rawHash === 'visual-roadmap') {
      setActiveView('roadmap');
      setTimeout(() => {
        const el = document.getElementById('roadmap-section') || document.getElementById('visual-roadmap');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 100);
      return;
    }

    if (rawTab === 'catalog' || rawHash === 'catalog' || rawHash === 'courses') {
      setActiveView('catalog');
      if (targetSchoolKey && CANONICAL_SCHOOL_MAP[targetSchoolKey]) {
        setSelectedSchoolFilter(CANONICAL_SCHOOL_MAP[targetSchoolKey].filterKey);
      }
      setTimeout(() => {
        const el = document.getElementById('catalog-section');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 100);
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

    if (targetSchoolKey && CANONICAL_SCHOOL_MAP[targetSchoolKey]) {
      const match = CANONICAL_SCHOOL_MAP[targetSchoolKey];
      setActiveView('ecosystem');
      setSelectedSchoolId(match.schoolId);
      setSelectedSchoolFilter(match.filterKey);

      setTimeout(() => {
        const el = document.getElementById('school-hub') || document.getElementById('programs-content');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
        }
      }, 150);
    } else if (rawHash === 'ecosystem' || rawHash === 'academies' || rawHash === 'programs' || rawHash === 'programs-content' || rawHash === 'programs-section') {
      setActiveView('ecosystem');
      setTimeout(() => {
        const el = document.getElementById('programs-content');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [location.pathname, location.search, location.hash, searchParams]);

  useEffect(() => {
    const fetchPrograms = async () => {
      try {
        const q = query(collection(db, 'programs'), where('status', '==', 'PUBLISHED'));
        const snapshot = await getDocs(q);
        setPrograms(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (error) {
        console.error('Error fetching programs:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchPrograms();
  }, []);

  const filteredPrograms = programs.filter(p => {
    const matchesCategory = selectedSchoolFilter === 'ALL' || (p.categoryId || '').toLowerCase().includes(selectedSchoolFilter.replace('-', '_')) || (p.schoolId || '') === selectedSchoolFilter;
    const matchesSearch = !searchQuery || 
      p.title?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      p.shortDescription?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.targetAudience?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <MainLayout>
      <SEO 
        title="Our Learning Ecosystem | 8 Progressive Pathways" 
        description="Explore the multi-disciplinary learning ecosystem: Technology & Coding, Digital Literacy, Creative Design, Music, Academic Excellence, Chess, and Young Creators." 
      />

      {/* Hero Header */}
      <PageHeader
        eyebrow=""
        title={heroData.title ? heroData.title.replace(/\.$/, '') : "One Ecosystem"}
        description={heroData.subtitle || "find a specialised learning pathway"}
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
                const el = document.getElementById('pathfinder-section') || document.getElementById('programs-content');
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
              label: 'Core Programs',
              number: '08',
              title: 'Core Programs',
              description: 'Explore every learning pathway in one place.',
              actionLabel: 'Explore programs',
              targetSectionId: 'programs-content'
            },
            {
              id: 'roadmap',
              label: 'Visual Roadmap',
              number: '05',
              title: 'Visual Roadmap',
              description: 'Interactive step-by-step milestone progression across all 5 mastery stages.',
              actionLabel: 'Explore roadmap',
              targetSectionId: 'roadmap-section'
            },
            {
              id: 'pathfinder',
              label: 'Custom Pathfinder',
              number: '01',
              title: 'Custom Pathfinder',
              description: 'Answer a few quick questions to build a tailored learning schedule.',
              actionLabel: 'Start pathfinder',
              targetSectionId: 'pathfinder-section'
            },
            {
              id: 'catalog',
              label: 'Program Catalog',
              number: String(programs.length || 24).padStart(2, '0'),
              title: 'Program Catalog',
              description: 'Search and filter every specialized course, track, and workshop directly.',
              actionLabel: 'Browse catalog',
              targetSectionId: 'catalog-section'
            }
          ];

          const selectedTab = heroTabs.find(t => t.id === activeView) || heroTabs[0];

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
                        className="text-6xl sm:text-7xl lg:text-[5.25rem] font-black tracking-tight leading-none bg-gradient-to-r from-[#ef4444] via-[#dc2626] to-white/25 bg-clip-text text-transparent drop-shadow-[0_0_28px_rgba(239,68,68,0.4)] select-none"
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
                          <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
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
      <div id="programs-content" className="digital-canvas py-16 lg:py-24 scroll-mt-20 overflow-hidden">
        <div className="container mx-auto px-4 max-w-7xl space-y-14">
          
          {/* View 1: 8 Core Programs & Deep Dive (StageArchitectureBanner ONLY appears here) */}
          {activeView === 'ecosystem' && (
            <div id="ecosystem-section" className="space-y-12 scroll-mt-24">
              <LearningSchoolsGrid 
                selectedSchoolId={selectedSchoolId}
                onSchoolChange={(id) => {
                  setSelectedSchoolId(id);
                  const matching = Object.values(CANONICAL_SCHOOL_MAP).find(c => c.schoolId === id);
                  if (matching) setSelectedSchoolFilter(matching.filterKey);
                }}
              />

              <StageArchitectureBanner />
            </div>
          )}

          {/* View 2: Interactive Visual Roadmap for Learning Tracks */}
          {activeView === 'roadmap' && (
            <div id="roadmap-section" className="space-y-8 scroll-mt-24">
              <InteractiveTrackRoadmap />
            </div>
          )}

          {/* View 3: Pathfinder / Custom Program Builder */}
          {activeView === 'pathfinder' && (
            <div id="pathfinder-section" className="space-y-8 scroll-mt-24">
              <LearningPathBuilder />
            </div>
          )}

          {/* View 3: Program Catalog & Course Cards */}
          {activeView === 'catalog' && (
            <div id="catalog-section" className="space-y-8 scroll-mt-24">
              
              {/* Filter & Search Bar */}
              <div className="pro-surface sticky top-20 z-20 p-4 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4">
                
                {/* Search Input */}
                <div className="relative w-full md:w-80">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search courses by keyword..."
                    className="w-full pl-9 pr-8 py-2.5 rounded-xl text-xs bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-brand-red transition-all"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Program Filter Dropdown */}
                <div className="relative w-full md:w-64">
                  <select
                    value={selectedSchoolFilter}
                    onChange={(e) => setSelectedSchoolFilter(e.target.value)}
                    className="w-full pl-4 pr-9 py-2.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-brand-red cursor-pointer appearance-none transition-all"
                  >
                    {Object.entries(SCHOOL_FILTER_MAP).map(([key, meta]) => (
                      <option key={key} value={key}>
                        {meta.label}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                    ▼
                  </div>
                </div>
              </div>

              {/* Published Courses Grid */}
              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <CardSkeleton />
                  <CardSkeleton />
                  <CardSkeleton />
                </div>
              ) : filteredPrograms.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-12 text-center border border-slate-200 dark:border-slate-800">
                  <EmptyState 
                    title="No Courses Found" 
                    description="No courses match your filter. You can still use the Pathfinder tool above to generate a bespoke learning plan!"
                  />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredPrograms.map((program) => (
                    <Card key={program.id} hoverEffect className="pro-surface pro-interactive flex flex-col justify-between overflow-hidden !rounded-3xl">
                      <div className="relative h-44 overflow-hidden -m-px">
                        <img
                          src={program.image || program.coverImage || program.bannerImage || getProgramImage(program.categoryId)}
                          alt={program.title || "Program image"}
                          loading="lazy"
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      </div>
                      <CardContent className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-brand-red">
                            {program.categoryId ? program.categoryId.replace(/_/g, ' ') : 'Program Course'}
                          </span>
                          <span className="text-[11px] font-bold text-slate-500">
                            {program.deliveryFormat || 'Online / Physical'}
                          </span>
                        </div>

                        <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                          {program.title}
                        </h3>

                        <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-3 leading-relaxed">
                          {program.shortDescription}
                        </p>

                        {program.targetAudience && (
                          <div className="text-[11px] text-slate-500">
                            <strong>For:</strong> {program.targetAudience}
                          </div>
                        )}
                      </CardContent>

                      <CardFooter className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                        <div className="text-xs font-bold text-slate-500">
                          Flexible Schedule
                        </div>
                        <Button
                          to={`/programs/${program.slug || program.id}`}
                          size="sm"
                          className="font-bold text-xs bg-brand-red hover:bg-red-700 text-white"
                          rightIcon={<ArrowRight size={13} />}
                        >
                          View Pathway
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              )}

            </div>
          )}

          {/* Quick Institutional / School Bar */}
          <div className="relative overflow-hidden p-8 sm:p-10 rounded-[2rem] bg-gradient-to-br from-slate-950 via-slate-900 to-red-950 text-white flex flex-col md:flex-row items-center justify-between gap-8 border border-white/10 shadow-2xl">
            <div className="space-y-1 text-center md:text-left">
              <div className="text-xs font-black uppercase tracking-widest text-brand-red">
                Institutional Partnerships
              </div>
              <h3 className="text-xl sm:text-2xl font-black">
                Bringing the Ecosystem to Your School?
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 max-w-xl">
                Explore our Tier 1 (1 day/wk), Tier 2 (2 days/wk), and Tier 3 (3 days/wk) school Coding, Robotics, Music, and Chess delivery models.
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
