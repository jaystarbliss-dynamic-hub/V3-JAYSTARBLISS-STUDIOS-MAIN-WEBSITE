import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getAllClientDatabases } from '../../lib/firebase';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { StaggerGroup, Reveal } from '../ui/Reveal';
import { staggerItem } from '../ui/animationVariants';
import { motion } from 'motion/react';
import { usePageSection } from '../../lib/cms';
import { GlassGridSkeleton } from '../ui/GlassCardSkeleton';

const FeaturedPortfolio: React.FC = () => {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const { data: sectionInfo } = usePageSection('home', 'portfolio_preview', {
    title: 'PROVEN RESULTS. REAL IMPACT.',
    subtitle: 'Explore our latest software engineering deployments and young coder creations.',
    ctaText: 'VIEW ALL PROJECTS',
    ctaLink: '/portfolio'
  });

  useEffect(() => {
    const fetchFeaturedProjects = async () => {
      try {
        const dbs = getAllClientDatabases();
        const [portfolioSnaps, kidsSnaps] = await Promise.all([
          Promise.all(
            dbs.map((clientDb) =>
              getDocs(query(collection(clientDb, 'portfolio'), where('status', '==', 'PUBLISHED'))).catch(() => null)
            )
          ),
          Promise.all(
            dbs.map((clientDb) =>
              getDocs(query(collection(clientDb, 'kidsProjects'))).catch(() => null)
            )
          )
        ]);

        const byId = new Map<string, any>();
        portfolioSnaps.forEach((snap) => {
          if (!snap) return;
          snap.docs.forEach((docSnap) => {
            if (!byId.has(docSnap.id)) {
              byId.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
            }
          });
        });

        const kidsById = new Map<string, any>();
        kidsSnaps.forEach((snap) => {
          if (!snap) return;
          snap.docs.forEach((docSnap) => {
            const raw = docSnap.data();
            if (raw.status === 'DRAFT') return;
            if (!kidsById.has(docSnap.id)) {
              kidsById.set(docSnap.id, {
                id: docSnap.id,
                ...raw,
                portfolioType: 'STUDENT_WORK',
                studentName: raw.creator || raw.creatorName || raw.studentName || 'Academy Student',
                featuredImage: raw.imageUrl || raw.featuredImage || '',
                isFeatured: Boolean(raw.isFeatured || raw.featured)
              });
            }
          });
        });

        const orgList = Array.from(byId.values()).sort(
          (a, b) => Number(Boolean(b.isFeatured)) - Number(Boolean(a.isFeatured))
        );
        const kidsList = Array.from(kidsById.values()).sort(
          (a, b) => Number(Boolean(b.isFeatured)) - Number(Boolean(a.isFeatured))
        );

        const combined: any[] = [];
        if (orgList.length > 0) combined.push(orgList[0]);
        if (kidsList.length > 0) combined.push(kidsList[0]);
        for (const item of [...orgList.slice(1), ...kidsList.slice(1)]) {
          if (combined.length >= 2) break;
          combined.push(item);
        }

        setProjects(combined.slice(0, 2));
      } catch (error) {
        console.error('Error fetching featured portfolio:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchFeaturedProjects();
  }, []);

  return (
    <section className="py-24 bg-white dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800">
      <div className="container mx-auto px-4 md:px-8 max-w-7xl">
        <Reveal className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-brand-slate dark:text-white tracking-tight leading-[1.1]">
              {sectionInfo.title ? (
                sectionInfo.title.includes('.') ? (
                  <>
                    {sectionInfo.title.split('.')[0]}. <br className="hidden md:block" />
                    {sectionInfo.title.split('.').slice(1).join('.').trim()}
                  </>
                ) : (
                  sectionInfo.title
                )
              ) : (
                'PROVEN RESULTS. REAL IMPACT.'
              )}
            </h2>
          </div>
          <Link to={sectionInfo.ctaLink || '/portfolio'} className="inline-flex items-center gap-2 text-brand-red font-bold hover:text-red-700 transition-colors uppercase tracking-wider text-sm shrink-0">
            {sectionInfo.ctaText || 'VIEW ALL PROJECTS'} <ArrowRight size={20} />
          </Link>
        </Reveal>
        
        {loading ? (
          <GlassGridSkeleton count={2} columns="grid-cols-1 md:grid-cols-2" variant="portfolio" />
        ) : projects.length === 0 ? (
          <Reveal className="text-center py-20 bg-slate-50 dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 text-slate-500">
            <p>We are currently curating our featured portfolio cases. Check back soon.</p>
          </Reveal>
        ) : (
          <StaggerGroup className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {projects.map((project) => (
              <motion.div 
                key={project.id} 
                variants={staggerItem} 
                whileHover={{ y: -6, transition: { duration: 0.28, ease: 'easeOut' } }}
                className="group flex flex-col glass-card rounded-2xl sm:rounded-3xl overflow-hidden"
              >
                <div className="h-56 sm:h-64 bg-gradient-to-br from-brand-slate to-slate-700 flex items-center justify-center relative overflow-hidden">
                  {project.featuredImage || project.imageUrl ? (
                    <img
                      src={project.featuredImage || project.imageUrl}
                      alt={project.title}
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <>
                      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff0d_1px,transparent_1px),linear-gradient(to_bottom,#ffffff0d_1px,transparent_1px)] bg-[size:2.5rem_2.5rem]"></div>
                      <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-brand-red/20 rounded-full blur-3xl"></div>
                      <span className="font-bold text-white/25 text-5xl sm:text-6xl tracking-widest uppercase group-hover:scale-110 group-hover:text-white/35 transition-all duration-500 relative z-10">
                        {(project.title || 'JB').substring(0, 2)}
                      </span>
                    </>
                  )}
                </div>
                <div className="p-6 sm:p-10 flex flex-col flex-grow">
                  <div className="flex items-center gap-4 mb-6">
                    <span className="text-xs font-bold text-brand-red tracking-wider uppercase">
                      {project.category || 'Case Study'}
                    </span>
                    <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700"></span>
                    <span className="text-xs font-bold text-slate-500 tracking-wider uppercase">
                      {project.portfolioType === 'STUDENT_WORK' ? 'Academy' : 'Client Work'}
                    </span>
                  </div>
                  <h3 className="text-2xl font-bold text-brand-slate dark:text-white mb-4 line-clamp-2">{project.title}</h3>
                  
                  <div 
                    className="text-slate-600 dark:text-slate-400 mb-8 line-clamp-3 leading-relaxed quill-content"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(project.description || '') }} 
                  />
                  
                  <div className="mt-auto pt-6 border-t border-slate-200 dark:border-slate-800">
                    <div className="text-sm font-bold text-brand-slate dark:text-white">
                      {project.portfolioType === 'STUDENT_WORK' ? (
                        <>Student: <span className="text-slate-500">{project.studentName || project.creator || project.creatorName}</span></>
                      ) : (
                        <>Client: <span className="text-slate-500">{project.client}</span></>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </StaggerGroup>
        )}
      </div>
    </section>
  );
};

export default FeaturedPortfolio;
