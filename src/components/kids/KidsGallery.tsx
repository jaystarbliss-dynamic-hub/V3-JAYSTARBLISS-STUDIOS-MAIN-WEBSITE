import React, { useState, useEffect } from 'react';
import { collection, query, getDocs } from 'firebase/firestore';
import { getAllClientDatabases } from '../../lib/firebase';
import { Link } from 'react-router-dom';
import { 
  Gamepad2, 
  Zap, 
  Play, 
  RotateCcw, 
  ExternalLink, 
  X, 
  Search, 
  Award,
  Maximize2,
  Share2,
  Rocket
} from 'lucide-react';
import DOMPurify from 'dompurify';
import { Card, CardContent } from '../ui/Card';
import { CardSkeleton } from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';

export interface KidsProjectItem {
  id: string;
  title: string;
  creator?: string;
  creatorName?: string;
  studentName?: string;
  studentAge?: string | number;
  creatorAge?: string | number;
  description?: string;
  category?: string;
  embedUrl?: string;
  imageUrl?: string;
  featuredImage?: string;
  liveUrl?: string;
  icon?: string;
  status?: string;
  isFeatured?: boolean;
  featured?: boolean;
  createdAt?: string;
}

interface KidsGalleryProps {
  showHeroBanner?: boolean;
}

function normalizeKidsProject(id: string, raw: Record<string, any>): KidsProjectItem {
  const baseCreator = String(raw.creator || raw.creatorName || raw.studentName || '').trim();
  const age = raw.studentAge || raw.creatorAge;
  const formattedCreator =
    baseCreator && age && !baseCreator.toLowerCase().includes('age')
      ? `${baseCreator} (Age ${age})`
      : baseCreator;

  return {
    id,
    ...raw,
    title: String(raw.title || 'Untitled Project'),
    creator: formattedCreator || baseCreator,
    studentName: baseCreator,
    imageUrl: raw.imageUrl || raw.featuredImage || '',
    isFeatured: Boolean(raw.isFeatured || raw.featured),
  };
}

const KidsGallery: React.FC<KidsGalleryProps> = ({ showHeroBanner = true }) => {
  const [projects, setProjects] = useState<KidsProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  
  // Active playable arcade cabinet project
  const [activeProject, setActiveProject] = useState<KidsProjectItem | null>(null);
  const [iframeKey, setIframeKey] = useState(0);

  // Fullscreen / Modal Viewer
  const [modalProject, setModalProject] = useState<KidsProjectItem | null>(null);

  useEffect(() => {
    const fetchKidsProjects = async () => {
      try {
        setLoading(true);
        const dbs = getAllClientDatabases();
        const [kidsSnaps, portfolioSnaps] = await Promise.all([
          Promise.all(
            dbs.map((clientDb) => getDocs(query(collection(clientDb, 'kidsProjects'))).catch(() => null))
          ),
          Promise.all(
            dbs.map((clientDb) => getDocs(query(collection(clientDb, 'portfolio'))).catch(() => null))
          ),
        ]);

        const byId = new Map<string, KidsProjectItem>();

        kidsSnaps.forEach((snap) => {
          if (!snap) return;
          snap.docs.forEach((d) => {
            if (!byId.has(d.id)) {
              byId.set(d.id, normalizeKidsProject(d.id, d.data()));
            }
          });
        });

        portfolioSnaps.forEach((snap) => {
          if (!snap) return;
          snap.docs.forEach((d) => {
            const data = d.data();
            if (data.portfolioType === 'STUDENT_WORK' || data.portfolioType === 'KIDS_CORNER') {
              if (!byId.has(d.id)) {
                byId.set(d.id, normalizeKidsProject(d.id, data));
              }
            }
          });
        });

        const fetched = Array.from(byId.values());

        if (fetched.length > 0) {
          setProjects(fetched);
          const firstPlayable = fetched.find(p => p.embedUrl) || fetched[0];
          setActiveProject(firstPlayable || null);
        } else {
          setProjects([]);
          setActiveProject(null);
        }
      } catch (err) {
        console.warn('Kids projects fetch error:', err);
        setProjects([]);
        setActiveProject(null);
      } finally {
        setLoading(false);
      }
    };

    fetchKidsProjects();
  }, []);

  const handleReloadIframe = () => {
    setIframeKey(k => k + 1);
  };

  const filteredProjects = projects.filter(p => {
    if (p.status === 'DRAFT') return false;
    const matchesCat = selectedCategory === 'ALL' || (p.category && p.category.toLowerCase().includes(selectedCategory.toLowerCase()));
    const creatorName = p.creator || p.creatorName || p.studentName || '';
    const matchesSearch = !searchQuery ||
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      creatorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCat && matchesSearch;
  });

  return (
    <div className="space-y-12">
      {/* Banner & Magic Particles Action */}
      {showHeroBanner && (
        <div className="bg-gradient-to-r from-amber-500/15 via-purple-500/10 to-cyan-500/15 border border-amber-400/30 rounded-3xl p-6 md:p-8 flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl">
          <div className="flex items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/20 text-amber-500 flex items-center justify-center shrink-0 shadow-inner">
              <Rocket size={32} />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-300 text-xs font-black uppercase tracking-wider mb-2">
                <Gamepad2 size={13} /> Young Coders Game Zone
              </div>
              <h2 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white">
                Kids Corner & Student Showcase
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1 max-w-2xl">
                Explore real playable games, interactive math engines, Scratch simulations, and games crafted by our talented junior creators.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <Link
              to="/magic-particles"
              id="magic-particles-gallery-btn"
              className="px-6 py-3.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-black text-sm rounded-xl shadow-lg shadow-cyan-500/20 flex items-center gap-2 transition-all transform hover:scale-105"
            >
              <Zap size={16} /> Play Magic 3D Particles
            </Link>
          </div>
        </div>
      )}

      {/* Interactive Arcade Cabinet Player (Spotlight) */}
      {activeProject && activeProject.embedUrl && (
        <div className="bg-slate-950 text-white rounded-3xl p-6 md:p-8 border border-amber-500/40 shadow-2xl overflow-hidden relative">
          <div className="flex flex-col lg:flex-row gap-8 items-stretch">
            
            {/* Left Column: Embed Player */}
            <div className="w-full lg:w-3/5 bg-black rounded-2xl overflow-hidden border border-slate-800 shadow-inner flex flex-col">
              <div className="bg-slate-900 px-4 py-3 border-b border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-amber-400 font-bold">
                  <Gamepad2 size={16} />
                  <span>ARCADE CONSOLE: {activeProject.title}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleReloadIframe}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                    title="Restart / Reload Game"
                  >
                    <RotateCcw size={14} />
                  </button>
                  <button
                    onClick={() => setModalProject(activeProject)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                    title="Fullscreen Modal"
                  >
                    <Maximize2 size={14} />
                  </button>
                  {(activeProject.liveUrl || activeProject.embedUrl) && (
                    <a
                      href={activeProject.liveUrl || activeProject.embedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors flex items-center gap-1 text-[11px]"
                    >
                      <ExternalLink size={14} /> Scratch
                    </a>
                  )}
                </div>
              </div>

              {/* Game Viewport */}
              <div className="relative w-full aspect-[4/3] bg-slate-900 flex items-center justify-center">
                <iframe
                  key={`${activeProject.id}-${iframeKey}`}
                  src={activeProject.embedUrl}
                  allowFullScreen
                  className="w-full h-full border-0 bg-transparent"
                  title={activeProject.title}
                />
              </div>
            </div>

            {/* Right Column: Game Details */}
            <div className="w-full lg:w-2/5 flex flex-col justify-between space-y-6">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-amber-500/20 text-amber-300 text-xs font-bold uppercase tracking-wider mb-3">
                  <Gamepad2 size={14} />
                  <span>{activeProject.category || 'Kids Project'}</span>
                </div>

                <h3 className="text-3xl font-black text-white mb-2">
                  {activeProject.title}
                </h3>

                <div className="flex items-center gap-2 text-sm text-amber-400 font-semibold mb-4">
                  <Award size={16} />
                  <span>Created by {activeProject.creator || activeProject.studentName || 'Academy Student'}</span>
                </div>

                <div 
                  className="text-slate-300 text-sm leading-relaxed mb-6 quill-content"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(activeProject.description || '') }}
                />

                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400 space-y-1.5">
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <Play size={12} className="text-amber-400" /> Controls & Play Info:
                  </div>
                  <p>Click the green flag in the game view to start. Use your keyboard arrow keys, space bar, or mouse to play!</p>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-4 border-t border-slate-800">
                <button
                  onClick={() => setModalProject(activeProject)}
                  className="flex-1 py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm text-center flex items-center justify-center gap-2 transition-colors shadow-lg shadow-amber-500/20"
                >
                  <Maximize2 size={16} /> Fullscreen Mode
                </button>
                <button
                  onClick={handleReloadIframe}
                  className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-sm flex items-center justify-center gap-2 transition-colors"
                >
                  <RotateCcw size={16} /> Restart
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white dark:bg-slate-950 p-4 md:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search games, student creators..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={16} />
            </button>
          )}
        </div>

        <div className="relative w-full md:w-56">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full pl-3.5 pr-8 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer appearance-none"
          >
            <option value="ALL">All Game Categories</option>
            <option value="Action">Action</option>
            <option value="Arcade">Arcade</option>
            <option value="Multi-Game">Multi-Game</option>
            <option value="Educational">Educational</option>
            <option value="Runner">Runner</option>
            <option value="Creative">Creative</option>
          </select>
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
            ▼
          </div>
        </div>
      </div>

      {/* Grid of Projects */}
      <div>
        <div className="flex items-center justify-between mb-8">
          <div>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
              Student Creations ({filteredProjects.length})
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Click "Play in Arcade" to play directly in the viewer above, or "Expand" for full screen.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3, 4, 5, 6].map(i => <CardSkeleton key={i} />)}
          </div>
        ) : filteredProjects.length === 0 ? (
          <EmptyState
            title="No Projects Found"
            description="No kids projects match your search criteria. Try a different keyword or category."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredProjects.map((project) => {
              const isPlaying = activeProject?.id === project.id;
              return (
                <Card 
                  key={project.id} 
                  hoverEffect 
                  className={`flex flex-col group overflow-hidden border transition-all ${
                    isPlaying 
                      ? 'ring-2 ring-amber-500 border-amber-500 bg-amber-50/20 dark:bg-amber-950/20' 
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950'
                  }`}
                >
                  {/* Card Thumbnail / Header */}
                  {project.imageUrl ? (
                    <div className="h-44 w-full relative overflow-hidden bg-slate-900">
                      <img 
                        src={project.imageUrl} 
                        alt={project.title} 
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                      />
                      <div className="absolute top-3 left-3">
                        <span className="px-3 py-1 rounded-full text-xs font-black bg-slate-950/80 text-amber-300 border border-amber-500/30 backdrop-blur-sm">
                          {project.category || 'Game'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="h-44 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 p-6 flex flex-col justify-between relative overflow-hidden">
                      <div className="absolute right-3 top-3 opacity-15 text-white">
                        <Gamepad2 size={64} />
                      </div>

                      <div className="flex justify-between items-start z-10">
                        <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          {project.category || 'Game'}
                        </span>
                        {project.isFeatured && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-red-500 text-white uppercase tracking-wider">
                            Featured
                          </span>
                        )}
                      </div>

                      <div className="z-10">
                        <h4 className="text-xl font-bold text-white group-hover:text-amber-400 transition-colors">
                          {project.title}
                        </h4>
                      </div>
                    </div>
                  )}

                  {/* Content */}
                  <CardContent className="p-6 flex-grow flex flex-col justify-between">
                    <div>
                      <div className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <Award size={14} />
                        <span>Created by {project.creator || project.studentName || 'Jaystarbliss Student'}</span>
                      </div>

                      <div 
                        className="text-slate-600 dark:text-slate-400 text-sm line-clamp-3 mb-6 quill-content"
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(project.description || '') }}
                      />
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 pt-4 border-t border-slate-100 dark:border-slate-800">
                      {project.embedUrl ? (
                        <button
                          onClick={() => {
                            setActiveProject(project);
                            window.scrollTo({ top: 350, behavior: 'smooth' });
                          }}
                          className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-colors ${
                            isPlaying
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-slate-900 dark:bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-white'
                          }`}
                        >
                          <Play size={14} /> {isPlaying ? 'Playing Now' : 'Play in Arcade'}
                        </button>
                      ) : (
                        <a
                          href={project.liveUrl || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 py-2.5 px-3 rounded-xl font-bold text-xs bg-slate-900 dark:bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-white flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <ExternalLink size={14} /> Open Project
                        </a>
                      )}

                      {project.embedUrl && (
                        <button
                          onClick={() => setModalProject(project)}
                          className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-amber-500 hover:text-slate-950 text-slate-600 dark:text-slate-400 flex items-center justify-center transition-colors shrink-0"
                          title="Open in Popup Modal"
                        >
                          <Maximize2 size={16} />
                        </button>
                      )}

                      {project.liveUrl && (
                        <a
                          href={project.liveUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-amber-500 hover:text-slate-950 text-slate-600 dark:text-slate-400 flex items-center justify-center transition-colors shrink-0"
                          title="External Link"
                        >
                          <ExternalLink size={16} />
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Fullscreen / Modal Game Viewer */}
      {modalProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-950 text-white rounded-3xl max-w-4xl w-full max-h-[95vh] overflow-hidden border border-slate-800 shadow-2xl flex flex-col">
            
            {/* Modal Header */}
            <div className="p-4 sm:px-6 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 font-bold">
                  <Gamepad2 size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">{modalProject.title}</h3>
                  <p className="text-xs text-slate-400">Created by {modalProject.creator || modalProject.studentName || 'Student'}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {modalProject.liveUrl && (
                  <a
                    href={modalProject.liveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
                    title="Open on Scratch"
                  >
                    <ExternalLink size={16} />
                  </a>
                )}
                <button
                  onClick={() => setModalProject(null)}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-red-500 hover:text-white text-slate-400 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Viewport */}
            <div className="relative w-full aspect-[4/3] sm:aspect-[16/10] bg-black">
              {modalProject.embedUrl ? (
                <iframe
                  src={modalProject.embedUrl}
                  allowFullScreen
                  className="w-full h-full border-0 bg-transparent"
                  title={modalProject.title}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center">
                  <p className="text-slate-400 mb-4">No embedded player available for this project.</p>
                  {modalProject.liveUrl && (
                    <a
                      href={modalProject.liveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-6 py-3 bg-amber-500 text-slate-950 font-bold text-sm rounded-xl"
                    >
                      Open in External Browser
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:px-6 bg-slate-900 border-t border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                Tip: Press Green Flag to Start. Use keyboard or tap controls.
              </span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(window.location.origin + '/portfolio');
                  alert('Portfolio link copied!');
                }}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400 hover:underline"
              >
                <Share2 size={14} /> Share
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default KidsGallery;
