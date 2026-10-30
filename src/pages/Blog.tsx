import React, { useState, useEffect } from 'react';
import MainLayout from '../components/layout/MainLayout';
import SEO from '../components/ui/SEO';
import { collection, query, where, getDocs, doc, updateDoc, increment } from 'firebase/firestore';
import { db, getAllClientDatabases } from '../lib/firebase';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { 
  Calendar, 
  User, 
  Eye, 
  Newspaper, 
  BookOpen, 
  Search, 
  X, 
  Share2, 
  Terminal, 
  Radio, 
  ArrowRight,
  Trophy,
  Megaphone,
  Bell,
  CalendarDays,
  FileText
} from 'lucide-react';
import { CardSkeleton } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import DOMPurify from 'dompurify';

const categoryColors: Record<string, { bg: string; text: string; label: string; Icon: React.FC<{ size?: number; className?: string }> }> = {
  news: { bg: 'bg-cyan-500/10 border-cyan-500/30', text: 'text-cyan-600 dark:text-cyan-400', label: 'Breaking News', Icon: Newspaper },
  announcement: { bg: 'bg-blue-500/10 border-blue-500/30', text: 'text-blue-600 dark:text-blue-400', label: 'Announcement', Icon: Megaphone },
  event: { bg: 'bg-purple-500/10 border-purple-500/30', text: 'text-purple-600 dark:text-purple-400', label: 'Event', Icon: CalendarDays },
  achievement: { bg: 'bg-amber-500/10 border-amber-500/30', text: 'text-amber-600 dark:text-amber-400', label: 'Achievement', Icon: Trophy },
  update: { bg: 'bg-emerald-500/10 border-emerald-500/30', text: 'text-emerald-600 dark:text-emerald-400', label: 'System Update', Icon: Bell },
  holiday: { bg: 'bg-red-500/10 border-red-500/30', text: 'text-red-600 dark:text-red-400', label: 'Notice', Icon: FileText }
};

const Blog: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'NEWS' | 'BLOG'>('NEWS');
  const [posts, setPosts] = useState<any[]>([]);
  const [news, setNews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNewsCategory, setSelectedNewsCategory] = useState('ALL');
  const [selectedBlogCategory, setSelectedBlogCategory] = useState('ALL');
  
  // Quick Reader Modal for News Corner
  const [selectedNewsModal, setSelectedNewsModal] = useState<any | null>(null);

  useEffect(() => {
    const fetchContent = async () => {
      try {
        const dbs = getAllClientDatabases();
        const mergedPosts = new Map<string, any>();
        const mergedNews = new Map<string, any>();

        await Promise.all(
          dbs.map(async (clientDb) => {
            try {
              const blogQ = query(
                collection(clientDb, 'blog'),
                where('status', '==', 'PUBLISHED')
              );
              const blogSnap = await getDocs(blogQ);
              blogSnap.docs.forEach((docSnap) => {
                if (!mergedPosts.has(docSnap.id)) {
                  mergedPosts.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
                }
              });
            } catch {
              // ignore secondary db error
            }

            try {
              const newsSnap = await getDocs(collection(clientDb, 'newsCorner'));
              newsSnap.docs.forEach((docSnap) => {
                if (!mergedNews.has(docSnap.id)) {
                  mergedNews.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
                }
              });
            } catch {
              // ignore secondary db error
            }
          })
        );

        setPosts(Array.from(mergedPosts.values()));
        setNews(Array.from(mergedNews.values()));
      } catch (error) {
        console.error("Error fetching content:", error);
        setPosts([]);
        setNews([]);
      } finally {
        setLoading(false);
      }
    };
    fetchContent();
  }, []);

  // Handle opening news item & increment view count
  const handleOpenNewsModal = async (item: any) => {
    setSelectedNewsModal(item);
    
    // Update local state count
    setNews(prev => prev.map(n => n.id === item.id ? { ...n, views: (n.views || 0) + 1 } : n));
    
    // Increment in Firestore if not default mockup
    if (item.id && !item.id.startsWith('news-')) {
      try {
        await updateDoc(doc(db, 'newsCorner', item.id), {
          views: increment(1)
        });
      } catch (err) {
        console.warn("Could not increment news view:", err);
      }
    }
  };

  const filteredNews = news.filter(item => {
    const matchesCategory = selectedNewsCategory === 'ALL' || item.category?.toLowerCase() === selectedNewsCategory.toLowerCase();
    const matchesSearch = !searchQuery || 
      item.title?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      item.excerpt?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.content?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const filteredPosts = posts.filter(post => {
    const matchesCategory = selectedBlogCategory === 'ALL' || (post.category && post.category.toLowerCase().includes(selectedBlogCategory.toLowerCase()));
    const matchesSearch = !searchQuery || 
      post.title?.toLowerCase().includes(searchQuery.toLowerCase()) || 
      post.excerpt?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.author?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.category?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <MainLayout>
      <SEO 
        title="News Corner & Blog Insights" 
        description="Latest tech news, academy announcements, coding tutorials, and insights from Jaystarbliss Studios." 
      />

      {/* Header */}
      <div className="bg-brand-slate text-white py-16 lg:py-24 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />
        
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl relative z-10">
          <div className="max-w-3xl mb-10">
            <span className="inline-block text-xs font-black uppercase tracking-widest text-brand-red mb-3">
              Broadcasts & Articles
            </span>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold mb-4 tracking-tight">
              News Corner & Blog
            </h1>
            <p className="text-base sm:text-lg text-white/80 leading-relaxed font-normal">
              Real-time academy bulletins, competition highlights, student achievements, and technical deep dives.
            </p>
          </div>

          {/* Tab Switcher */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setActiveTab('NEWS')}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all ${
                activeTab === 'NEWS'
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                  : 'bg-white/10 text-white/80 hover:bg-white/20 hover:text-white'
              }`}
            >
              <Newspaper size={16} />
              News Corner & Bulletins
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('BLOG')}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all ${
                activeTab === 'BLOG'
                  ? 'bg-brand-red text-white shadow-md shadow-brand-red/20'
                  : 'bg-white/10 text-white/80 hover:bg-white/20 hover:text-white'
              }`}
            >
              <BookOpen size={16} />
              Blog & Tutorials
            </button>
          </div>
        </div>
      </div>

      {/* Main Body */}
      <div className="digital-canvas py-16 md:py-24 min-h-[60vh]">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">

          {/* Search & Category Filter */}
          <div className="pro-surface flex flex-col md:flex-row items-center justify-between gap-4 mb-12 p-4 sm:p-5 rounded-2xl sticky top-20 z-20">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                type="text"
                placeholder={activeTab === 'NEWS' ? "Search news, bulletins..." : "Search articles, topics..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-brand-red"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X size={14} />
                </button>
              )}
            </div>

            {activeTab === 'NEWS' && (
              <div className="relative w-full md:w-56">
                <select
                  value={selectedNewsCategory}
                  onChange={(e) => setSelectedNewsCategory(e.target.value)}
                  className="w-full pl-3.5 pr-8 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-bold uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-cyan-500 cursor-pointer appearance-none"
                >
                  <option value="ALL">All Bulletin Categories</option>
                  <option value="news">News</option>
                  <option value="announcement">Announcements</option>
                  <option value="event">Events</option>
                  <option value="achievement">Student Achievements</option>
                  <option value="update">Platform Updates</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                  ▼
                </div>
              </div>
            )}

            {activeTab === 'BLOG' && (
              <div className="relative w-full md:w-56">
                <select
                  value={selectedBlogCategory}
                  onChange={(e) => setSelectedBlogCategory(e.target.value)}
                  className="w-full pl-3.5 pr-8 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-bold uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-brand-red cursor-pointer appearance-none"
                >
                  <option value="ALL">All Article Topics</option>
                  <option value="news">News & Insights</option>
                  <option value="coding">Coding & Software</option>
                  <option value="tutorials">Tutorials & Guides</option>
                  <option value="robotics">Robotics & AI</option>
                  <option value="announcement">Announcements</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                  ▼
                </div>
              </div>
            )}
          </div>

          {/* TAB 1: NEWS CORNER */}
          {activeTab === 'NEWS' && (
            <div className="space-y-10">
              
              {/* Broadcast Hub Header */}
              <div className="bg-brand-slate rounded-2xl border border-slate-800 p-6 sm:p-8 relative overflow-hidden text-white">
                <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-6">
                  <div className="flex items-center gap-2.5 text-xs font-mono text-cyan-400 font-bold">
                    <Terminal size={15} />
                    <span>BROADCAST HUB // LIVE UPDATES</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-mono text-emerald-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    <span>STREAM ACTIVE</span>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                  <div>
                    <h3 className="text-2xl sm:text-3xl font-extrabold text-white mb-2 tracking-tight">
                      Jaystarbliss News Corner
                    </h3>
                    <p className="text-slate-400 text-xs sm:text-sm max-w-2xl leading-relaxed">
                      Stay updated with the latest happenings at our Lagos hub, student hackathons, bootcamp milestones, and practical technology workshops.
                    </p>
                  </div>

                  <Link
                    to="/portfolio"
                    className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold shrink-0 border border-slate-700 flex items-center gap-2 transition-colors uppercase tracking-wider"
                  >
                    Explore Showcase <ArrowRight size={14} />
                  </Link>
                </div>
              </div>

              {/* News Grid */}
              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6">
                  {[1, 2, 3].map(i => <CardSkeleton key={i} />)}
                </div>
              ) : filteredNews.length === 0 ? (
                <EmptyState
                  title="No News Bulletins Found"
                  description="No news items match your current filter. Please check back later."
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredNews.map((item, idx) => {
                    const catStyle = categoryColors[item.category?.toLowerCase()] || {
                      bg: 'bg-slate-100 dark:bg-slate-800',
                      text: 'text-slate-600 dark:text-slate-300',
                      label: item.category || 'News',
                      Icon: Newspaper
                    };
                    const IconComponent = catStyle.Icon;

                    return (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 28 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: '-30px' }}
                        transition={{ duration: 0.5, delay: idx * 0.07, ease: [0.21, 0.47, 0.32, 0.98] }}
                        whileHover={{ y: -6, transition: { duration: 0.28, ease: 'easeOut' } }}
                        onClick={() => handleOpenNewsModal(item)}
                        className={`${idx % 4 === 0 ? 'lg:col-span-7' : 'lg:col-span-5'} group flex flex-col rounded-[2rem] overflow-hidden pro-surface pro-interactive cursor-pointer`}
                      >
                        {item.featuredImage ? (
                          <div className="aspect-[16/9] w-full overflow-hidden relative bg-slate-100 dark:bg-slate-900">
                            <img
                              src={item.featuredImage}
                              alt={item.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                            <div className="absolute top-3 left-3">
                              <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${catStyle.bg} ${catStyle.text} bg-slate-900/90 flex items-center gap-1.5`}>
                                <IconComponent size={12} />
                                {catStyle.label}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="aspect-[16/9] w-full bg-brand-slate flex items-center justify-center p-6 relative">
                            <Newspaper size={36} className="text-white/20" />
                            <div className="absolute top-3 left-3">
                              <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${catStyle.bg} ${catStyle.text} bg-slate-900/90 flex items-center gap-1.5`}>
                                <IconComponent size={12} />
                                {catStyle.label}
                              </span>
                            </div>
                          </div>
                        )}

                        <div className="p-6 flex flex-col flex-grow justify-between">
                          <div>
                            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400 mb-3">
                              <div className="flex items-center gap-1.5">
                                <Calendar size={13} />
                                <span>{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'Recent'}</span>
                              </div>
                              <div className="flex items-center gap-1 text-slate-400">
                                <Eye size={13} />
                                <span>{item.views || 0} views</span>
                              </div>
                            </div>

                            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2 group-hover:text-cyan-500 transition-colors line-clamp-2 leading-snug">
                              {item.title}
                            </h3>

                            <p className="text-slate-600 dark:text-slate-400 text-xs sm:text-sm font-normal line-clamp-3 mb-4 leading-relaxed">
                              {item.excerpt}
                            </p>
                          </div>

                          <div className="pt-3 border-t border-slate-200/50 dark:border-white/10 flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                              <User size={13} /> {item.author || 'Jaystarbliss Studios'}
                            </span>
                            <span className="text-xs font-bold text-cyan-600 dark:text-cyan-400 group-hover:underline flex items-center gap-1">
                              Read Bulletin <ArrowRight size={13} />
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: BLOG & ARTICLES */}
          {activeTab === 'BLOG' && (
            <div className="space-y-10">
              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6">
                  {[1, 2, 3, 4, 5, 6].map(i => <CardSkeleton key={i} />)}
                </div>
              ) : filteredPosts.length === 0 ? (
                <EmptyState
                  title="No Blog Posts Found"
                  description="Check back later for new insights, articles, and coding tutorials from our team."
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredPosts.map((post, idx) => {
                    const isNews = post.category?.toLowerCase().includes('news');
                    return (
                      <motion.div
                        key={post.id}
                        initial={{ opacity: 0, y: 28 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: '-30px' }}
                        transition={{ duration: 0.5, delay: idx * 0.07, ease: [0.21, 0.47, 0.32, 0.98] }}
                        whileHover={{ y: -6, transition: { duration: 0.28, ease: 'easeOut' } }}
                        className={`${idx % 4 === 0 ? 'lg:col-span-7' : 'lg:col-span-5'} h-full`}
                      >
                        <Link to={`/blog/${post.slug}`} className="group block h-full">
                          <div 
                            className={`h-full flex flex-col rounded-[2rem] overflow-hidden pro-surface pro-interactive transition-all duration-300 ${
                              isNews 
                                ? 'border-cyan-500/60 ring-1 ring-cyan-500/30' 
                                : 'hover:border-brand-red/40'
                            }`}
                          >
                            {post.featuredImage ? (
                              <div className="aspect-[16/9] w-full overflow-hidden relative bg-slate-100 dark:bg-slate-900">
                                <img
                                  src={post.featuredImage}
                                  alt={post.title}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                />
                                {post.category && (
                                  <div className="absolute top-3 left-3">
                                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider backdrop-blur-md flex items-center gap-1 ${
                                      isNews
                                        ? 'bg-cyan-500 text-slate-950'
                                        : 'bg-slate-950/80 text-white border border-white/20'
                                    }`}>
                                      {isNews && <Radio size={11} />}
                                      {post.category}
                                    </span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="aspect-[16/9] w-full bg-slate-100 dark:bg-slate-900 flex flex-col items-center justify-center relative p-6">
                                {post.category && (
                                  <span className={`mb-2 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                    isNews
                                      ? 'bg-cyan-500 text-slate-950'
                                      : 'bg-brand-red/10 text-brand-red'
                                  }`}>
                                    {post.category}
                                  </span>
                                )}
                                <span className="text-slate-400 font-bold uppercase tracking-widest text-xs">Jaystarbliss Studios</span>
                              </div>
                            )}
                            <div className="p-6 sm:p-7 flex flex-col flex-grow">
                              <div className="flex items-center gap-3 text-xs font-bold text-slate-500 dark:text-slate-400 mb-3 tracking-wider uppercase flex-wrap">
                                {post.createdAt && (
                                  <div className="flex items-center gap-1.5">
                                    <Calendar size={13} />
                                    {new Date(post.createdAt).toLocaleDateString()}
                                  </div>
                                )}
                                {post.author && (
                                  <div className="flex items-center gap-1.5">
                                    <User size={13} />
                                    {post.author}
                                  </div>
                                )}
                              </div>
                              <h3 className="text-lg font-bold text-brand-slate dark:text-white mb-3 group-hover:text-brand-red transition-colors line-clamp-2 leading-snug">
                                {post.title}
                              </h3>
                              <p className="text-slate-600 dark:text-slate-400 text-xs sm:text-sm font-normal line-clamp-3 mb-6 flex-grow leading-relaxed">
                                {post.excerpt}
                              </p>
                              <span className="text-brand-red font-bold text-xs uppercase tracking-wider group-hover:text-red-700 dark:group-hover:text-red-400 transition-colors mt-auto flex items-center gap-1">
                                Read Article <ArrowRight size={13} />
                              </span>
                            </div>
                          </div>
                        </Link>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* Quick News Reader Modal */}
      {selectedNewsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full max-h-[85vh] overflow-y-auto border border-slate-200 dark:border-slate-800 shadow-2xl p-6 md:p-8 relative">
            <button
              onClick={() => setSelectedNewsModal(null)}
              className="absolute top-5 right-5 p-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              <X size={20} />
            </button>

            {selectedNewsModal.featuredImage && (
              <div className="w-full aspect-[21/9] rounded-2xl overflow-hidden mb-6">
                <img
                  src={selectedNewsModal.featuredImage}
                  alt={selectedNewsModal.title}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            <div className="flex items-center gap-3 text-xs font-bold text-slate-500 dark:text-slate-400 mb-3">
              <span className="px-2.5 py-1 rounded-full bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 uppercase tracking-wider">
                {selectedNewsModal.category || 'News'}
              </span>
              <span>{selectedNewsModal.createdAt ? new Date(selectedNewsModal.createdAt).toLocaleDateString() : ''}</span>
              <span>&bull; {selectedNewsModal.views || 0} views</span>
            </div>

            <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white mb-4 leading-tight">
              {selectedNewsModal.title}
            </h2>

            <div className="text-xs text-slate-500 dark:text-slate-400 mb-6 flex items-center gap-2">
              <User size={14} /> Reported by <strong className="text-slate-700 dark:text-slate-300">{selectedNewsModal.author || 'Jaystarbliss Studios'}</strong>
            </div>

            <div 
              className="text-slate-700 dark:text-slate-300 leading-relaxed text-base prose dark:prose-invert max-w-none mb-8 quill-content"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedNewsModal.content || selectedNewsModal.excerpt || '') }}
            />

            <div className="flex items-center justify-between pt-6 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  alert("Link copied to clipboard!");
                }}
                className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-cyan-500 transition-colors"
              >
                <Share2 size={15} /> Share Bulletin
              </button>

              <button
                onClick={() => setSelectedNewsModal(null)}
                className="px-6 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-800 text-white font-bold text-xs hover:bg-cyan-500 hover:text-slate-950 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
};

export default Blog;
