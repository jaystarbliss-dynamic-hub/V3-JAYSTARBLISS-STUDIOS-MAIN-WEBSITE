import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { 
  Edit, ExternalLink, Layers, CheckCircle2, 
  Image as ImageIcon, BookOpen, Briefcase, FolderOpen, 
  Gamepad2, FileText, ArrowRight, Newspaper
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { CMS_PAGES } from '../../lib/cms';

const AdminPages: React.FC = () => {
  const [pages, setPages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pages' | 'cmsHub'>('pages');

  // Stats counters for CMS assets
  const [cmsStats, setCmsStats] = useState({
    programs: 0,
    services: 0,
    portfolio: 0,
    kidsProjects: 0,
    blog: 0
  });

  useEffect(() => {
    const fetchPagesAndStats = async () => {
      try {
        const [pagesSnap, progSnap, servSnap, portSnap, kidsSnap, blogSnap] = await Promise.all([
          getDocs(collection(db, 'pages')),
          getDocs(collection(db, 'programs')).catch(() => ({ size: 0 })),
          getDocs(collection(db, 'services')).catch(() => ({ size: 0 })),
          getDocs(collection(db, 'portfolio')).catch(() => ({ size: 0 })),
          getDocs(collection(db, 'kidsProjects')).catch(() => ({ size: 0 })),
          getDocs(collection(db, 'blog')).catch(() => ({ size: 0 })),
        ]);

        setCmsStats({
          programs: progSnap.size || 0,
          services: servSnap.size || 0,
          portfolio: portSnap.size || 0,
          kidsProjects: kidsSnap.size || 0,
          blog: blogSnap.size || 0
        });

        const dbPages = pagesSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as Record<string, any>) }));
        
        // Merge registered CMS pages with DB entries
        const merged = CMS_PAGES.map(cmsPage => {
          const matched = dbPages.find(p => p.id === cmsPage.id) as Record<string, any> | undefined;
          return {
            id: cmsPage.id,
            title: cmsPage.title,
            path: cmsPage.path,
            description: cmsPage.description,
            sectionsCount: cmsPage.sections.length,
            status: matched?.status || 'PUBLISHED',
            ...matched
          };
        });

        setPages(merged);
      } catch (error) {
        console.error('Error fetching pages:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchPagesAndStats();
  }, []);

  const CMS_MODULES = [
    {
      title: 'Programs & Learning Tracks',
      desc: 'Create, edit, and organize coding courses, syllabi, curriculum stages, and pricing tiers.',
      icon: BookOpen,
      count: `${cmsStats.programs} Programs`,
      link: '/admin/programs',
      actionText: 'Manage Programs',
      color: 'from-blue-600 to-indigo-600',
      badge: 'Curriculum'
    },
    {
      title: 'Services & Enterprise Offerings',
      desc: 'Manage custom software development, digital skills training, and institutional contracts.',
      icon: Briefcase,
      count: `${cmsStats.services} Offerings`,
      link: '/admin/services',
      actionText: 'Manage Services',
      color: 'from-amber-600 to-orange-600',
      badge: 'B2B & Solutions'
    },
    {
      title: 'Portfolio & Case Studies',
      desc: 'Showcase completed client builds, mobile apps, design systems, and software engineering deliverables.',
      icon: FolderOpen,
      count: `${cmsStats.portfolio} Projects`,
      link: '/admin/portfolio',
      actionText: 'Manage Portfolio',
      color: 'from-emerald-600 to-teal-600',
      badge: 'Showcase'
    },
    {
      title: 'Kids Zone & Student Creations',
      desc: 'Highlight games, animations, and robotics achievements built by young Jaystarbliss scholars.',
      icon: Gamepad2,
      count: `${cmsStats.kidsProjects} Builds`,
      link: '/admin/kids-projects',
      actionText: 'Manage Kids Projects',
      color: 'from-purple-600 to-pink-600',
      badge: 'Young Makers'
    },
    {
      title: 'News Corner & Blog Broadcasts',
      desc: 'Publish articles, holiday specials, competition results, and press announcements.',
      icon: Newspaper,
      count: `${cmsStats.blog} Articles`,
      link: '/admin/blog',
      actionText: 'Manage News Corner',
      color: 'from-red-600 to-rose-600',
      badge: 'Broadcasting'
    },
    {
      title: 'Global Branding & Cloud Assets',
      desc: 'Configure Cloudinary media keys, logos, SEO meta defaults, and contact credentials.',
      icon: ImageIcon,
      count: 'Settings',
      link: '/admin/settings',
      actionText: 'Configure Assets',
      color: 'from-slate-700 to-slate-900',
      badge: 'Settings'
    }
  ];

  return (
    <div className="space-y-8">
      {/* Action Bar */}
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-3">
          <Link
            to="/admin/settings"
            className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-4 py-2.5 rounded-xl text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors shadow-xs"
          >
            <ImageIcon size={16} className="text-brand-red" />
            Cloud Storage Settings
          </Link>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-gray-200 dark:border-slate-800 space-x-4">
        <button
          onClick={() => setActiveTab('pages')}
          className={`pb-3 px-2 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'pages'
              ? 'border-brand-red text-brand-red'
              : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <FileText size={17} />
          <span>Core Website Pages ({pages.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('cmsHub')}
          className={`pb-3 px-2 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'cmsHub'
              ? 'border-brand-red text-brand-red'
              : 'border-transparent text-gray-500 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <Layers size={17} />
          <span>All CMS Catalogs &amp; Sections</span>
        </button>
      </div>

      {/* ══ TAB 1: CORE WEBSITE PAGES ══ */}
      {activeTab === 'pages' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {loading ? (
              <div className="col-span-2 py-20 text-center text-slate-400 font-mono text-xs">Loading CMS Pages...</div>
            ) : (
              pages.map((page) => (
                <div
                  key={page.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group"
                >
                  <div>
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div>
                        <h2 className="text-xl font-black text-brand-slate dark:text-white group-hover:text-brand-red transition-colors flex items-center gap-2">
                          {page.title}
                        </h2>
                        <span className="text-xs font-mono text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                          {page.path}
                        </span>
                      </div>

                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        <CheckCircle2 size={12} />
                        {page.status || 'PUBLISHED'}
                      </span>
                    </div>

                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 line-clamp-2">
                      {page.description}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400 flex items-center gap-1">
                      <Layers size={14} className="text-brand-red" />
                      {page.sectionsCount} Sections Configurable
                    </span>

                    <div className="flex items-center gap-2">
                      <a
                        href={page.path}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                        title="View Live Page"
                      >
                        <ExternalLink size={16} />
                      </a>
                      <Link
                        to={`/admin/pages/${page.id}`}
                        className="flex items-center gap-1.5 bg-brand-red hover:bg-red-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors shadow-sm"
                      >
                        <Edit size={14} />
                        Edit Sections
                      </Link>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ══ TAB 2: CMS HUB MODULES ══ */}
      {activeTab === 'cmsHub' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {CMS_MODULES.map((mod, idx) => {
              const Icon = mod.icon;
              return (
                <div
                  key={idx}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs flex flex-col justify-between hover:shadow-md transition-all group"
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${mod.color} text-white flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform`}>
                        <Icon size={24} />
                      </div>
                      <span className="text-[11px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {mod.badge}
                      </span>
                    </div>

                    <h3 className="text-lg font-black text-gray-900 dark:text-white mb-2 leading-snug">
                      {mod.title}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-3 leading-relaxed mb-4">
                      {mod.desc}
                    </p>
                  </div>

                  <div className="pt-4 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-400 font-mono">
                      {mod.count}
                    </span>

                    <Link
                      to={mod.link}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-red hover:underline group-hover:translate-x-0.5 transition-transform"
                    >
                      {mod.actionText} <ArrowRight size={14} />
                    </Link>
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

export default AdminPages;
