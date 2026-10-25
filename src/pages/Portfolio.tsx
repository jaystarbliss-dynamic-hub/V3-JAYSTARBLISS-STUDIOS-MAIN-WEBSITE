import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import MainLayout from '../components/layout/MainLayout';
import SEO from '../components/ui/SEO';
import { motion } from 'motion/react';
import { 
  ExternalLink, 
  X, 
  Search,
  ArrowRight
} from 'lucide-react';
import DOMPurify from 'dompurify';
import Badge from '../components/ui/Badge';
import { CardSkeleton } from '../components/ui/Skeleton';
import { pageHeaderImages } from '../lib/stockImages';
import EmptyState from '../components/ui/EmptyState';
import { Link } from 'react-router-dom';
import KidsGallery from '../components/kids/KidsGallery';

type ShowcaseTabId = 'KIDS_CORNER' | 'ORGANISATION' | 'MAGIC_PARTICLES';

const SHOWCASE_PROJECTS: Array<{
  id: ShowcaseTabId;
  title: string;
  description: string;
  image: string;
  ctaLabel: string;
}> = [
  {
    id: 'KIDS_CORNER',
    title: 'Kids Corner & Arcade',
    description: 'Play real Scratch & web games created by our young tech students with full arcade controls.',
    image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1000&q=80',
    ctaLabel: 'Explore'
  },
  {
    id: 'ORGANISATION',
    title: 'Organisation Solutions',
    description: 'Enterprise EdTech portals, assessment suites, and hardware workshop toolkits built for institutions.',
    image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1000&q=80',
    ctaLabel: 'Explore'
  },
  {
    id: 'MAGIC_PARTICLES',
    title: 'Magic 3D Particles',
    description: 'Control 5,500+ glowing 3D particles with real-time mouse, touch, and webcam gesture physics.',
    image: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1000&q=80',
    ctaLabel: 'Explore'
  }
];

const Portfolio: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ShowcaseTabId>('KIDS_CORNER');
  const [orgProjects, setOrgProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgSearchQuery, setOrgSearchQuery] = useState('');

  useEffect(() => {
    const fetchOrgProjects = async () => {
      try {
        const q = query(collection(db, 'portfolio'), where('status', '==', 'PUBLISHED'));
        const snapshot = await getDocs(q);
        const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const orgList = docs.filter((p: any) => p.portfolioType === 'CLIENT_WORK' || p.portfolioType === 'ORGANISATION' || !p.portfolioType);
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

  // Filter org projects
  const filteredOrgProjects = orgProjects.filter(p => {
    const matchesSearch = !orgSearchQuery || 
      p.title?.toLowerCase().includes(orgSearchQuery.toLowerCase()) || 
      p.client?.toLowerCase().includes(orgSearchQuery.toLowerCase()) ||
      p.description?.toLowerCase().includes(orgSearchQuery.toLowerCase());
    return matchesSearch;
  });

  return (
    <MainLayout>
      <SEO 
        title="Portfolio & Kids Corner" 
        description="Explore client platforms, enterprise solutions, and our vibrant Kids Game Zone showcasing young coders' interactive Scratch & web projects." 
      />

      {/* Cinematic Portfolio Showcase Hero */}
      <div className="bg-[#080b14] text-white pt-24 pb-16 lg:pt-28 lg:pb-24 relative overflow-hidden">
        <img
          src={pageHeaderImages.portfolio}
          alt=""
          loading="eager"
          className="absolute inset-0 w-full h-full object-cover opacity-35 object-right"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#080b14] via-[#080b14]/90 to-[#080b14]/55" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080b14] via-transparent to-[#080b14]/40" />
        <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#a855f7_1px,transparent_1px)] [background-size:28px_28px] pointer-events-none" />

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl relative z-10">
          
          {/* Header Block */}
          <div className="max-w-3xl mb-12 lg:mb-14">
            <div className="flex items-center gap-3 mb-4">
              <span className="w-8 h-[2px] bg-[#a855f7]" />
              <span className="text-xs font-extrabold uppercase tracking-[0.22em] text-[#c084fc]">
                Showcase &amp; Interactive Works
              </span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold mb-5 tracking-tight leading-[1.08]">
              <span className="text-white">Our Work &amp; </span>
              <span className="bg-gradient-to-r from-[#a855f7] via-[#c084fc] to-[#d8b4fe] bg-clip-text text-transparent">
                Showcase
              </span>
            </h1>
            <p className="text-base sm:text-lg text-white/75 leading-relaxed font-normal max-w-2xl">
              Explore custom digital platforms built for organizations alongside interactive arcade games engineered by our junior student coders.
            </p>
          </div>

          {/* Continuous 3-Project Interactive Horizontal Showcase */}
          <div className="relative">
            {/* Subtle top ambient wave line */}
            <div className="hidden lg:block absolute -top-4 left-6 right-6 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" />

            <div className="flex flex-col lg:flex-row items-stretch gap-4 lg:gap-3 min-h-[290px]">
              {SHOWCASE_PROJECTS.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <motion.div
                    key={item.id}
                    layout
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    onClick={() => setActiveTab(item.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setActiveTab(item.id);
                      }
                    }}
                    aria-pressed={isActive}
                    className={`group relative text-left cursor-pointer select-none transition-all duration-500 ${
                      isActive
                        ? 'lg:flex-[1.55] z-20 lg:-my-2 p-[1.5px] rounded-[1.75rem] bg-gradient-to-r from-[#f97316] via-[#ec4899] to-[#a855f7] shadow-[0_22px_60px_-15px_rgba(168,85,247,0.45)]'
                        : 'lg:flex-1 z-10 p-[1px] rounded-[1.5rem] bg-white/10 hover:bg-white/25 opacity-85 hover:opacity-100'
                    }`}
                  >
                    <div
                      className={`relative h-full w-full overflow-hidden flex items-center justify-between ${
                        isActive
                          ? 'rounded-[calc(1.75rem-1.5px)] bg-[#0d111e] min-h-[280px] sm:min-h-[300px]'
                          : 'rounded-[calc(1.5rem-1px)] bg-[#0f1422]/90 min-h-[230px] sm:min-h-[260px]'
                      }`}
                    >
                      {/* Right-hand large visual preview */}
                      <div
                        className={`absolute inset-y-0 right-0 transition-all duration-500 overflow-hidden ${
                          isActive ? 'w-[62%] sm:w-[58%]' : 'w-[58%] sm:w-[55%]'
                        }`}
                      >
                        <img
                          src={item.image}
                          alt={item.title}
                          className={`w-full h-full object-cover object-center transition-all duration-700 ${
                            isActive
                              ? 'scale-105 brightness-105 saturate-125'
                              : 'scale-100 brightness-75 saturate-50 group-hover:brightness-90 group-hover:scale-105'
                          }`}
                        />
                        {/* Smooth blend gradient into dark left text area */}
                        <div
                          className={`absolute inset-0 bg-gradient-to-r ${
                            isActive
                              ? 'from-[#0d111e] via-[#0d111e]/65 to-transparent'
                              : 'from-[#0f1422] via-[#0f1422]/75 to-[#0f1422]/25'
                          }`}
                        />
                        {isActive && (
                          <div className="absolute inset-0 bg-gradient-to-tr from-[#f97316]/15 via-transparent to-[#a855f7]/30 mix-blend-screen pointer-events-none" />
                        )}
                      </div>

                      {/* Left-hand minimal editorial text */}
                      <div className={`relative z-10 flex flex-col justify-center ${
                        isActive ? 'p-6 sm:p-8 max-w-[62%]' : 'p-6 sm:p-7 max-w-[58%]'
                      }`}>
                        {isActive && (
                          <motion.div
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex items-center gap-2.5 mb-3"
                          >
                            <span className="w-5 h-[1.5px] bg-[#f97316]" />
                            <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[#f97316]">
                              Featured
                            </span>
                          </motion.div>
                        )}

                        <h3
                          className={`font-extrabold tracking-tight leading-snug transition-colors ${
                            isActive
                              ? 'text-2xl sm:text-3xl text-white mb-3'
                              : 'text-lg sm:text-xl text-white/90 group-hover:text-white'
                          }`}
                        >
                          {item.title}
                        </h3>

                        {isActive ? (
                          <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.25 }}
                            className="text-xs sm:text-sm text-white/75 leading-relaxed mb-5"
                          >
                            {item.description}
                          </motion.p>
                        ) : (
                          <div className="w-7 h-px bg-white/25 my-3.5" />
                        )}

                        <div className="mt-auto">
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveTab(item.id);
                              const contentEl = document.getElementById('portfolio-showcase-content');
                              if (contentEl) contentEl.scrollIntoView({ behavior: 'smooth' });
                            }}
                            className={`inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold transition-all ${
                              isActive
                                ? 'text-[#f97316] hover:text-[#fb923c]'
                                : 'text-white/75 group-hover:text-white'
                            }`}
                          >
                            <span>{item.ctaLabel}</span>
                            <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
                          </span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Slim Progress / Active-State Indicators */}
            <div className="flex items-center justify-center gap-3 sm:gap-4 mt-8" role="tablist" aria-label="Showcase project indicators">
              {SHOWCASE_PROJECTS.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-label={`Show ${item.title}`}
                    onClick={() => setActiveTab(item.id)}
                    className={`h-1 rounded-full transition-all duration-300 cursor-pointer ${
                      isActive
                        ? 'w-28 sm:w-40 bg-gradient-to-r from-[#f97316] via-[#ec4899] to-[#a855f7] shadow-[0_0_14px_rgba(249,115,22,0.65)]'
                        : 'w-24 sm:w-36 bg-white/15 hover:bg-white/30'
                    }`}
                  />
                );
              })}
            </div>
          </div>

        </div>
      </div>

      {/* Main Content Area */}
      <div id="portfolio-showcase-content" className="digital-canvas py-16 md:py-24 min-h-[60vh] scroll-mt-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">

          {/* TAB 1: KIDS CORNER & INTERACTIVE GAME ZONE */}
          {activeTab === 'KIDS_CORNER' && (
            <KidsGallery showHeroBanner={true} />
          )}

          {/* TAB 3: MAGIC 3D PARTICLES SHOWCASE */}
          {activeTab === 'MAGIC_PARTICLES' && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="rounded-[2rem] overflow-hidden bg-[#0b0f1c] border border-purple-500/30 shadow-2xl text-white grid grid-cols-1 lg:grid-cols-12"
            >
              <div className="lg:col-span-6 p-8 sm:p-12 flex flex-col justify-center space-y-5">
                <div className="flex items-center gap-2.5">
                  <span className="w-6 h-[1.5px] bg-[#f97316]" />
                  <span className="text-xs font-extrabold uppercase tracking-[0.2em] text-[#f97316]">
                    Interactive WebGL Experience
                  </span>
                </div>
                <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
                  Magic 3D Particles Playground
                </h2>
                <p className="text-sm sm:text-base text-white/75 leading-relaxed">
                  Experience our real-time Three.js simulation featuring over 5,500 dynamic glowing particles. Morph between cosmic formations, galaxies, and mathematical geometries using mouse physics, touch controls, or live webcam hand-tracking gestures.
                </p>
                <div className="pt-2">
                  <Link
                    to="/magic-particles"
                    className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-gradient-to-r from-[#f97316] to-[#a855f7] text-white text-xs sm:text-sm font-extrabold uppercase tracking-wider shadow-lg shadow-purple-500/25 hover:opacity-95 transition-all"
                  >
                    <span>Launch Fullscreen 3D Lab</span>
                    <ArrowRight size={16} />
                  </Link>
                </div>
              </div>
              <div className="lg:col-span-6 relative min-h-[280px] sm:min-h-[360px]">
                <img
                  src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=1200&q=80"
                  alt="Magic 3D Particles Preview"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-[#0b0f1c] via-[#0b0f1c]/40 to-transparent" />
              </div>
            </motion.div>
          )}

          {/* TAB 2: ORGANISATION FEATURED PROJECTS */}
          {activeTab === 'ORGANISATION' && (
            <div className="space-y-12">
              
              {/* Search Bar for Organisation Projects */}
              <div className="pro-surface flex flex-col sm:flex-row items-center justify-between gap-4 p-4 sm:p-5 rounded-2xl">
                <div className="relative w-full sm:w-96">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="text"
                    placeholder="Search organisation projects..."
                    value={orgSearchQuery}
                    onChange={(e) => setOrgSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-red"
                  />
                  {orgSearchQuery && (
                    <button onClick={() => setOrgSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <X size={16} />
                    </button>
                  )}
                </div>

                <div className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                  Showing {filteredOrgProjects.length} client & institutional platforms
                </div>
              </div>

              <div>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-brand-slate dark:text-white tracking-tight">
                  Organisation & Client Projects ({filteredOrgProjects.length})
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Enterprise web platforms, school digital systems, and tech consulting solutions.
                </p>
              </div>

              {loading ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-7">
                  {[1, 2, 3, 4].map(i => <CardSkeleton key={i} />)}
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
                      transition={{ duration: 0.5, delay: idx * 0.08, ease: [0.21, 0.47, 0.32, 0.98] }}
                      className={`${idx % 3 === 0 ? 'lg:col-span-7' : 'lg:col-span-5'} group flex flex-col rounded-[2rem] overflow-hidden pro-surface pro-interactive`}
                    >
                      {project.featuredImage ? (
                        <div className={`${idx % 3 === 0 ? 'h-80' : 'h-64'} w-full relative border-b border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-100 dark:bg-slate-900`}>
                          <img 
                            src={project.featuredImage} 
                            alt={project.title} 
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                          />
                        </div>
                      ) : (
                        <div className="h-56 bg-brand-slate flex items-center justify-center border-b border-slate-200 dark:border-slate-800 relative p-8">
                          <div className="text-center">
                            <span className="font-extrabold text-white/20 text-5xl tracking-widest uppercase block mb-2 font-mono">
                              {project.title.substring(0, 3)}
                            </span>
                            <span className="text-xs font-mono text-cyan-400 uppercase tracking-widest">
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
                          dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(project.description || '') }} 
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
