import React, { useState, useEffect, lazy, Suspense } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getAllClientDatabases } from '../lib/firebase';
import MainLayout from '../components/layout/MainLayout';
import SEO from '../components/ui/SEO';
import { motion } from 'motion/react';
import {
  ExternalLink,
  X,
  Search,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import DOMPurify from 'dompurify';
import Badge from '../components/ui/Badge';
import { CardSkeleton } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import { Link, useSearchParams } from 'react-router-dom';
import KidsGallery from '../components/kids/KidsGallery';
import { CODING_LAB_CONFIG } from '../config/codingLabConfig';
import { pageHeaderImages, stockImages } from '../lib/stockImages';

const CodingLabEditorHost = lazy(() => import('../components/coding-lab/CodingLabEditorHost'));

type ShowcaseTabId = 'KIDS_CORNER' | 'CODING_LAB' | 'ORGANISATION' | 'MAGIC_PARTICLES';

interface ShowcaseCardItem {
  id: ShowcaseTabId;
  kicker: string;
  title: string;
  description: string;
  ctaLabel: string;
  image: string;
}

const SHOWCASE_CARDS: ShowcaseCardItem[] = [
  {
    id: 'KIDS_CORNER',
    kicker: 'Featured',
    title: 'Kids Corner & Arcade',
    description:
      'Play real interactive games and web creations engineered by our young tech students with full arcade controls.',
    ctaLabel: 'Explore',
    image: stockImages.create,
  },
  ...(CODING_LAB_CONFIG.enabled
    ? [
        {
          id: 'CODING_LAB' as ShowcaseTabId,
          kicker: 'Interactive Sandbox',
          title: 'Coding Lab',
          description:
            'Build, animate, and test visual block-coding games directly in your browser with our self-hosted studio.',
          ctaLabel: 'Open Workspace',
          image: stockImages.build,
        },
      ]
    : []),
  {
    id: 'ORGANISATION',
    kicker: 'Client Platforms',
    title: 'Organisation Solutions',
    description:
      'Custom digital platforms, institutional school systems, and enterprise web engineering built for growth.',
    ctaLabel: 'Explore',
    image: stockImages.businesses,
  },
  {
    id: 'MAGIC_PARTICLES',
    kicker: 'WebGL Lab',
    title: 'Magic 3D Particles',
    description:
      'Experience real-time 3D particle physics and gesture-driven mathematical formations in the browser.',
    ctaLabel: 'Explore',
    image: stockImages.tech,
  },
];

const Portfolio: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTabParam = (searchParams.get('tab') || '').toUpperCase();
  const resolveInitialTab = (): ShowcaseTabId => {
    if (initialTabParam === 'CODING_LAB' || initialTabParam === 'CODING-LAB') {
      return CODING_LAB_CONFIG.enabled ? 'CODING_LAB' : 'KIDS_CORNER';
    }
    if (initialTabParam === 'ORGANISATION') return 'ORGANISATION';
    if (initialTabParam === 'MAGIC_PARTICLES') return 'MAGIC_PARTICLES';
    return 'KIDS_CORNER';
  };
  const [activeTab, setActiveTabState] = useState<ShowcaseTabId>(resolveInitialTab);
  const [orgProjects, setOrgProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgSearchQuery, setOrgSearchQuery] = useState('');

  const setActiveTab = (tab: ShowcaseTabId, shouldScroll = false) => {
    setActiveTabState(tab);
    const next = new URLSearchParams(searchParams);
    if (tab === 'KIDS_CORNER') {
      next.delete('tab');
    } else {
      next.set('tab', tab.toLowerCase());
    }
    setSearchParams(next, { replace: true });

    if (shouldScroll) {
      window.requestAnimationFrame(() => {
        const el = document.getElementById('portfolio-showcase-content');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    }
  };

  useEffect(() => {
    const fetchOrgProjects = async () => {
      try {
        const dbs = getAllClientDatabases();
        const snaps = await Promise.all(
          dbs.map((clientDb) =>
            getDocs(
              query(collection(clientDb, 'portfolio'), where('status', '==', 'PUBLISHED'))
            ).catch(() => null)
          )
        );
        const byId = new Map<string, any>();
        snaps.forEach((snap) => {
          if (!snap) return;
          snap.docs.forEach((docSnap) => {
            if (!byId.has(docSnap.id)) {
              byId.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
            }
          });
        });
        const docs = Array.from(byId.values());

        const orgList = docs.filter(
          (p: any) =>
            p.portfolioType === 'CLIENT_WORK' ||
            p.portfolioType === 'ORGANISATION' ||
            !p.portfolioType
        );
        setOrgProjects(orgList);
      } catch (error) {
        console.error('Error fetching organisation portfolio:', error);
        setOrgProjects([]);
      } finally {
        setLoading(false);
      }
    };
    fetchOrgProjects();
  }, []);

  const filteredOrgProjects = orgProjects.filter((p) => {
    const matchesSearch =
      !orgSearchQuery ||
      p.title?.toLowerCase().includes(orgSearchQuery.toLowerCase()) ||
      p.client?.toLowerCase().includes(orgSearchQuery.toLowerCase()) ||
      p.description?.toLowerCase().includes(orgSearchQuery.toLowerCase());
    return matchesSearch;
  });

  return (
    <MainLayout>
      <SEO
        title="Portfolio & Kids Corner"
        description="Explore client platforms, enterprise solutions, our Coding Lab sandbox, and our Kids Game Zone showcasing young coders' interactive projects."
      />

      {/* Editorial Brand Hero & Expandable Showcase Cards — Strict Jaystarbliss Brand Palette (Deep Slate + Brand Red) */}
      <section className="relative overflow-hidden bg-[#0B1120] text-white pt-24 pb-10 border-b border-slate-800/80">
        {/* Subtle Architectural Background Photo & Neutral Dot Grid */}
        <div className="absolute inset-0 pointer-events-none">
          <img
            src={pageHeaderImages.portfolio}
            alt=""
            aria-hidden="true"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover opacity-[0.14] grayscale"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0B1120]/90 via-[#0B1120]/85 to-[#0B1120]" />
          <div
            className="absolute inset-0 opacity-[0.18]"
            style={{
              backgroundImage: 'radial-gradient(rgba(148, 163, 184, 0.35) 1px, transparent 1px)',
              backgroundSize: '26px 26px',
            }}
          />
        </div>

        <div className="relative z-10 container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          {/* Editorial Eyebrow + Headline */}
          <div className="max-w-3xl mb-8">
            <div className="flex items-center gap-3 mb-3">
              <span className="w-7 h-[2px] bg-[#DC2626]" aria-hidden="true" />
              <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-red-400">
                Showcase &amp; Interactive Works
              </span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-[1.08] mb-3.5 text-balance">
              Our Work &amp; <span className="text-[#DC2626]">Showcase</span>
            </h1>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl">
              Explore custom digital platforms built for organizations alongside interactive arcade games and our browser-based Coding Lab engineered for young coders.
            </p>
          </div>

          {/* Expandable Horizontal Showcase Cards */}
          <div
            className="flex flex-col lg:flex-row gap-4"
            role="tablist"
            aria-label="Portfolio showcase categories"
          >
            {SHOWCASE_CARDS.map((card) => {
              const isActive = activeTab === card.id;
              return (
                <button
                  key={card.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(card.id, true)}
                  className={`group relative text-left rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1120] ${
                    isActive
                      ? 'lg:flex-[2.2] min-h-[220px] sm:min-h-[250px] bg-[#111827] border border-[#DC2626]/80 shadow-xl shadow-black/40'
                      : 'lg:flex-1 min-h-[140px] sm:min-h-[250px] bg-[#111827]/90 border border-slate-800 hover:border-slate-600'
                  }`}
                >
                  {/* Right-Side Photography with Measured Contrast Scrim */}
                  <div className="absolute inset-0 overflow-hidden">
                    <img
                      src={card.image}
                      alt={card.title}
                      referrerPolicy="no-referrer"
                      className={`w-full h-full object-cover transition-transform duration-500 ${
                        isActive
                          ? 'opacity-45 scale-105'
                          : 'opacity-25 grayscale group-hover:opacity-35 group-hover:scale-105'
                      }`}
                    />
                    <div
                      className={`absolute inset-0 ${
                        isActive
                          ? 'bg-gradient-to-r from-[#0B1120] via-[#0B1120]/90 to-[#0B1120]/25'
                          : 'bg-gradient-to-r from-[#0B1120]/95 via-[#0B1120]/80 to-[#0B1120]/45'
                      }`}
                    />
                  </div>

                  {/* Card Content */}
                  <div className="relative z-10 h-full p-6 sm:p-7 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <span
                          className={`h-[1.5px] transition-all ${
                            isActive ? 'w-5 bg-[#DC2626]' : 'w-4 bg-slate-500 group-hover:bg-slate-300'
                          }`}
                          aria-hidden="true"
                        />
                        <span
                          className={`text-[10px] font-bold uppercase tracking-[0.2em] ${
                            isActive ? 'text-red-400' : 'text-slate-400'
                          }`}
                        >
                          {card.kicker}
                        </span>
                      </div>

                      <h2
                        className={`font-extrabold tracking-tight text-white leading-tight ${
                          isActive ? 'text-2xl sm:text-[1.75rem]' : 'text-lg sm:text-xl'
                        }`}
                      >
                        {card.title}
                      </h2>

                      {isActive && (
                        <p className="mt-3 text-xs sm:text-sm text-slate-300 leading-relaxed max-w-sm">
                          {card.description}
                        </p>
                      )}
                    </div>

                    <div className="pt-4">
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-bold tracking-wide transition-colors ${
                          isActive
                            ? 'text-red-400 group-hover:text-red-300'
                            : 'text-slate-200 group-hover:text-white'
                        }`}
                      >
                        <span>{card.ctaLabel}</span>
                        <ArrowRight
                          size={14}
                          className="transition-transform group-hover:translate-x-0.5"
                        />
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Minimal Brand-Red Progress Indicators */}
          <div className="flex items-center justify-center gap-2 mt-6" aria-hidden="true">
            {SHOWCASE_CARDS.map((card) => {
              const isActive = activeTab === card.id;
              return (
                <button
                  key={`dot-${card.id}`}
                  type="button"
                  tabIndex={-1}
                  onClick={() => setActiveTab(card.id, true)}
                  className={`h-1.5 rounded-full transition-all cursor-pointer ${
                    isActive
                      ? 'w-8 bg-[#DC2626]'
                      : 'w-2 bg-slate-700 hover:bg-slate-500'
                  }`}
                />
              );
            })}
          </div>
        </div>
      </section>

      {/* Main Content Area — Renders Directly Inline on the Same Page */}
      <div
        id="portfolio-showcase-content"
        className={`digital-canvas scroll-mt-20 ${
          activeTab === 'CODING_LAB' ? 'py-4 sm:py-6' : 'py-10 md:py-14'
        } min-h-[70vh]`}
      >
        <div
          className={`mx-auto ${
            activeTab === 'CODING_LAB'
              ? 'px-2 sm:px-4 max-w-[1600px]'
              : 'container px-4 sm:px-6 lg:px-8 max-w-7xl'
          }`}
        >
          {/* TAB 1: KIDS CORNER & INTERACTIVE GAME ZONE */}
          {activeTab === 'KIDS_CORNER' && (
            <KidsGallery
              showHeroBanner={false}
              onOpenCodingLab={
                CODING_LAB_CONFIG.enabled ? () => setActiveTab('CODING_LAB', true) : undefined
              }
            />
          )}

          {/* TAB 2: INLINE CODING LAB PLAYGROUND (Directly Embedded — No Page Hop) */}
          {activeTab === 'CODING_LAB' && CODING_LAB_CONFIG.enabled && (
            <div className="w-full h-[calc(100vh-120px)] min-h-[680px] flex">
              <Suspense
                fallback={
                  <div className="w-full h-full min-h-[640px] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col items-center justify-center gap-3 text-slate-600 dark:text-slate-300">
                    <Loader2 size={28} className="animate-spin text-[#B91C1C]" />
                    <span className="text-sm font-semibold">Loading Coding Lab...</span>
                  </div>
                }
              >
                <CodingLabEditorHost
                  mode="playground"
                  fullscreenUrl="/coding-lab"
                />
              </Suspense>
            </div>
          )}

          {/* TAB 3: MAGIC 3D PARTICLES SHOWCASE — Jaystarbliss Brand Slate & Crimson */}
          {activeTab === 'MAGIC_PARTICLES' && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="rounded-2xl overflow-hidden bg-[#0B1120] border border-slate-800 shadow-xl text-white grid grid-cols-1 lg:grid-cols-12"
            >
              <div className="lg:col-span-6 p-8 sm:p-12 flex flex-col justify-center space-y-5">
                <div className="flex items-center gap-2.5">
                  <span className="w-6 h-[1.5px] bg-[#DC2626]" aria-hidden="true" />
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-red-400">
                    Interactive WebGL Experience
                  </span>
                </div>
                <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                  Magic 3D Particles Playground
                </h2>
                <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                  Experience our real-time Three.js simulation featuring over 5,500 dynamic particles. Morph between cosmic formations, galaxies, and mathematical geometries using mouse physics, touch controls, or live webcam hand-tracking gestures.
                </p>
                <div className="pt-2">
                  <Link
                    to="/magic-particles"
                    className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs sm:text-sm font-bold tracking-wide shadow-lg shadow-black/30 transition-colors"
                  >
                    <span>Launch Fullscreen 3D Lab</span>
                    <ArrowRight size={16} />
                  </Link>
                </div>
              </div>
              <div className="lg:col-span-6 relative min-h-[280px] sm:min-h-[360px] bg-slate-900">
                <img
                  src={stockImages.tech}
                  alt="Magic 3D Particles Preview"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover opacity-80"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-[#0B1120] via-[#0B1120]/45 to-transparent" />
              </div>
            </motion.div>
          )}

          {/* TAB 4: ORGANISATION FEATURED PROJECTS */}
          {activeTab === 'ORGANISATION' && (
            <div className="space-y-12">
              {/* Search Bar for Organisation Projects */}
              <div className="pro-surface flex flex-col sm:flex-row items-center justify-between gap-4 p-4 sm:p-5 rounded-2xl">
                <div className="relative w-full sm:w-96">
                  <Search
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    size={18}
                  />
                  <input
                    type="text"
                    placeholder="Search organisation projects..."
                    value={orgSearchQuery}
                    onChange={(e) => setOrgSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-red"
                  />
                  {orgSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setOrgSearchQuery('')}
                      aria-label="Clear search"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                <div className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                  Showing {filteredOrgProjects.length} client &amp; institutional platforms
                </div>
              </div>

              <div>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-brand-slate dark:text-white tracking-tight">
                  Organisation &amp; Client Projects ({filteredOrgProjects.length})
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Enterprise web platforms, school digital systems, and tech consulting solutions.
                </p>
              </div>

              {loading ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-7">
                  {[1, 2, 3, 4].map((i) => (
                    <CardSkeleton key={i} />
                  ))}
                </div>
              ) : filteredOrgProjects.length === 0 ? (
                <EmptyState
                  title="No Organisation Projects Found"
                  description="We are currently curating our case studies. Check back soon or contact us for a demo."
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {filteredOrgProjects.map((project, idx) => (
                    <motion.div
                      key={project.id}
                      initial={{ opacity: 0, y: 28 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, margin: '-30px' }}
                      transition={{
                        duration: 0.5,
                        delay: idx * 0.08,
                        ease: [0.21, 0.47, 0.32, 0.98],
                      }}
                      className={`${
                        idx % 3 === 0 ? 'lg:col-span-7' : 'lg:col-span-5'
                      } group flex flex-col rounded-[2rem] overflow-hidden pro-surface pro-interactive`}
                    >
                      {project.featuredImage ? (
                        <div
                          className={`${
                            idx % 3 === 0 ? 'h-80' : 'h-64'
                          } w-full relative border-b border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-100 dark:bg-slate-900`}
                        >
                          <img
                            src={project.featuredImage}
                            alt={project.title}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                        </div>
                      ) : (
                        <div className="h-56 bg-brand-slate flex items-center justify-center border-b border-slate-200 dark:border-slate-800 relative p-8">
                          <div className="text-center">
                            <span className="font-extrabold text-white/20 text-5xl tracking-widest uppercase block mb-2 font-mono">
                              {project.title.substring(0, 3)}
                            </span>
                            <span className="text-xs font-mono text-red-400 uppercase tracking-widest">
                              {project.category || 'Enterprise Solution'}
                            </span>
                          </div>
                        </div>
                      )}

                      <div className="p-6 sm:p-8 flex-grow flex flex-col">
                        <div className="flex justify-between items-start gap-4 mb-4">
                          <div>
                            <Badge variant="brand" className="mb-2.5">
                              {project.category || 'Client Project'}
                            </Badge>
                            <h3 className="text-xl sm:text-2xl font-extrabold text-brand-slate dark:text-white leading-tight">
                              {project.title}
                            </h3>
                          </div>
                          {project.liveUrl && (
                            <a
                              href={project.liveUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-slate-500 dark:text-gray-400 hover:bg-brand-red hover:text-white transition-colors shrink-0 border border-slate-200 dark:border-slate-800"
                              title="Visit live system"
                            >
                              <ExternalLink size={16} />
                            </a>
                          )}
                        </div>

                        {project.client && (
                          <div className="text-xs text-slate-500 dark:text-slate-400 mb-4 font-bold uppercase tracking-wider">
                            Client: {project.client}
                          </div>
                        )}

                        <div
                          className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed font-normal quill-content mb-6 flex-grow"
                          dangerouslySetInnerHTML={{
                            __html: DOMPurify.sanitize(project.description || ''),
                          }}
                        />

                        {project.liveUrl && (
                          <div className="pt-4 border-t border-slate-200/50 dark:border-white/10">
                            <a
                              href={project.liveUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 text-brand-red font-bold text-xs uppercase tracking-wider hover:text-red-700 dark:hover:text-red-400"
                            >
                              View Live System <ExternalLink size={14} />
                            </a>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
};

export default Portfolio;
