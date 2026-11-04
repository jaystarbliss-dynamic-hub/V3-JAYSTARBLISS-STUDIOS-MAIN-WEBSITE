import React from 'react';
import MainLayout from '../components/layout/MainLayout';
import SEO from '../components/ui/SEO';
import { BookOpen, FileText, HelpCircle, PenTool, ArrowUpRight, Search, Layers3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';

const Resources: React.FC = () => {
  const resourceItems = [
    {
      title: "Curriculum & Resource Library",
      desc: "Browse and download termly syllabi, lesson notes, and hands-on coding worksheets for students, parents, and partner school educators.",
      link: "/portal",
      label: "OPEN RESOURCE PORTAL",
      icon: BookOpen,
      active: true
    },
    {
      title: "FAQ",
      desc: "Find answers to common questions about our educational programs, digital services, timelines, and how we collaborate.",
      link: "/faq",
      label: "VIEW FAQs",
      icon: HelpCircle,
      active: true
    },
    {
      title: "Blog",
      desc: "Articles, case studies, and insights on education, technology, and creativity. Read our thoughts on building better digital experiences.",
      link: "/blog",
      label: "VIEW POSTS",
      icon: PenTool,
      active: true
    },
    {
      title: "Privacy Policy",
      desc: "Learn how we collect, use, and protect your personal information when you use our services or enroll in our programs.",
      link: "#",
      label: "VIEW POLICY",
      icon: FileText,
      active: false
    }
  ];

  return (
    <MainLayout>
      <SEO 
        title="Resources & Insights" 
        description="Tools, articles, guidelines, and answers to help you learn, build, and grow with Jaystarbliss Studios." 
      />

      {/* Header Banner */}
      <div className="jb-public-banner bg-brand-slate text-white py-20 lg:py-28 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl relative z-10 text-center">
          <span className="inline-block text-xs font-black uppercase tracking-widest text-brand-red mb-3">
            Knowledge Base
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold mb-6 tracking-tight">
            RESOURCES & INSIGHTS
          </h1>
          <p className="text-base sm:text-lg text-white/80 leading-relaxed font-normal max-w-2xl mx-auto">
            Tools, articles, and answers to help you learn, build, and grow with Jaystarbliss Studios.
          </p>
        </div>
      </div>

      {/* Resources Editorial Index */}
      <div className="digital-canvas py-16 md:py-24 border-t border-slate-200 dark:border-slate-800">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="grid lg:grid-cols-[.78fr_1.22fr] gap-10 lg:gap-16">
            <aside className="lg:sticky lg:top-28 lg:self-start">
              <div className="pro-surface rounded-[2rem] p-7 sm:p-9 overflow-hidden relative">
                <div className="absolute -right-16 -top-16 w-44 h-44 rounded-full bg-brand-red/10 blur-2xl" />
                <Layers3 className="text-brand-red mb-7" size={30} />
                <p className="tech-label text-brand-red">Resource directory</p>
                <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-950 dark:text-white mt-3">Find the right answer faster.</h2>
                <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400 mt-5">Learning materials, practical guidance and studio thinking—organised by what you want to accomplish.</p>
                <div className="hairline my-7" />
                <div className="flex items-center gap-3 text-xs font-bold text-slate-500 dark:text-slate-400"><Search size={15}/> Select a destination to continue</div>
              </div>
            </aside>

          <div className="divide-y divide-slate-200 dark:divide-white/10 border-y border-slate-200 dark:border-white/10">
            
            {resourceItems.map((item, i) => {
              const Icon = item.icon;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 18 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: .4, delay: i * .06 }}
                >
                  <Link 
                    to={item.active ? item.link : '/contact'}
                    className={`group grid grid-cols-[auto_1fr_auto] gap-5 sm:gap-7 items-start py-8 sm:py-10 transition-all ${!item.active ? 'opacity-65' : ''}`}
                  >
                      <div className="w-12 h-12 rounded-2xl bg-brand-red/10 text-brand-red flex items-center justify-center group-hover:bg-brand-red group-hover:text-white transition-colors">
                        <Icon size={24} />
                      </div>
                    <div><span className="tech-label text-slate-400">0{i + 1} · {item.active ? 'Available' : 'On request'}</span><h2 className="text-xl sm:text-2xl font-extrabold text-brand-slate dark:text-white mt-2 group-hover:text-brand-red transition-colors">
                      {item.title}
                    </h2><p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mt-3 max-w-xl">
                      {item.desc}
                    </p></div>
                    <div className="w-9 h-9 rounded-full border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-400 group-hover:bg-brand-red group-hover:border-brand-red group-hover:text-white transition-all"><ArrowUpRight size={16}/></div>
                  </Link>
                </motion.div>
              );
            })}

          </div></div>
        </div>
      </div>
    </MainLayout>
  );
};

export default Resources;
