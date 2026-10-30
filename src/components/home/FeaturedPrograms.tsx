import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getAllClientDatabases } from '../../lib/firebase';
import { Link } from 'react-router-dom';
import { getProgramImage } from '../../lib/stockImages';
import { StaggerGroup, Reveal } from '../ui/Reveal';
import { staggerItem } from '../ui/animationVariants';
import { motion } from 'motion/react';
import { usePageSection } from '../../lib/cms';
import { GlassGridSkeleton } from '../ui/GlassCardSkeleton';
import { ArrowRight, Compass } from 'lucide-react';

function resolveProgramRouteSlug(program: any): string {
  const rawSlug = typeof program?.slug === 'string' ? program.slug.trim() : '';
  if (rawSlug && !rawSlug.includes('/') && !rawSlug.startsWith('http')) {
    return rawSlug;
  }
  return program.id;
}

const FeaturedPrograms: React.FC = () => {
  const [programs, setPrograms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const { data: sectionInfo } = usePageSection('home', 'programs_preview', {
    title: 'THE LEARNING ECOSYSTEM',
    ctaText: 'EXPLORE ALL 8 ACADEMIES',
    ctaLink: '/programs'
  });

  useEffect(() => {
    const fetchFeaturedPrograms = async () => {
      try {
        const dbs = getAllClientDatabases();
        const snaps = await Promise.all(
          dbs.map((clientDb) =>
            getDocs(
              query(collection(clientDb, 'programs'), where('status', '==', 'PUBLISHED'))
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
        const allPublished = Array.from(byId.values());
        allPublished.sort((a, b) => Number(Boolean(b.isFeatured)) - Number(Boolean(a.isFeatured)));
        setPrograms(allPublished.slice(0, 3));
      } catch (error) {
        console.error('Error fetching featured programs:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchFeaturedPrograms();
  }, []);

  return (
    <section className="py-24 bg-white dark:bg-slate-900 dark:border-slate-800 border-t border-gray-100">
      <div className="container mx-auto px-4 md:px-8 max-w-7xl">
        {/* Header */}
        <Reveal className="text-center max-w-4xl mx-auto mb-12">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-[42px] font-extrabold text-brand-slate dark:text-white mb-8 tracking-tight">
            {sectionInfo.title || 'THE LEARNING ECOSYSTEM'}
          </h2>

          <div className="flex flex-wrap justify-center gap-3">
            <Link
              to={sectionInfo.ctaLink || '/programs'}
              className="inline-flex items-center gap-2 bg-brand-red text-white px-7 py-3 rounded-xl font-bold hover:bg-red-700 transition-colors shadow-lg shadow-brand-red/20 text-xs uppercase tracking-wider"
            >
              <span>{sectionInfo.ctaText || 'EXPLORE ALL 8 ACADEMIES'}</span>
              <ArrowRight size={14} />
            </Link>

            <Link
              to="/programs"
              className="inline-flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700 px-6 py-3 rounded-xl font-bold transition-colors text-xs uppercase tracking-wider"
            >
              <Compass size={14} />
              <span>Build Child's Plan</span>
            </Link>
          </div>
        </Reveal>

        {loading ? (
          <GlassGridSkeleton count={3} variant="program" />
        ) : programs.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            <p>Explore all 8 Learning Schools in our comprehensive curriculum catalog.</p>
          </div>
        ) : (
          <StaggerGroup className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {programs.map((program) => (
              <motion.div
                key={program.id}
                variants={staggerItem}
                whileHover={{ y: -6, transition: { duration: 0.28, ease: 'easeOut' } }}
                className="flex flex-col glass-card rounded-2xl sm:rounded-3xl overflow-hidden group border border-slate-200/80 dark:border-slate-800"
              >
                <div className="relative h-44 overflow-hidden">
                  <img
                    src={program.image || program.coverImage || program.bannerImage || getProgramImage(program.categoryId)}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                  <div className="absolute bottom-4 left-4 flex gap-2 flex-wrap">
                    <span className="inline-block px-3 py-1 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm text-brand-slate dark:text-white text-xs font-bold uppercase tracking-wider rounded-full shadow-xs">
                      {program.categoryId ? program.categoryId.replace(/_/g, ' ') : 'Academy'}
                    </span>
                    {program.targetAudience && (
                      <span className="inline-block px-3 py-1 bg-brand-red text-white text-xs font-bold uppercase tracking-wider rounded-full shadow-xs">
                        {program.targetAudience.replace('_', ' ')}
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-6 sm:p-8 flex-grow flex flex-col">
                  <h3 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-3 leading-tight group-hover:text-brand-red transition-colors">
                    {program.title}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-6 font-medium text-sm leading-relaxed flex-grow">
                    {program.shortDescription}
                  </p>
                  <div className="flex items-center text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    <span className="w-20 text-gray-700 dark:text-gray-300">
                      Format:
                    </span>
                    <span className="text-brand-red dark:text-red-400">{program.deliveryFormat || 'ONLINE / IN-PERSON'}</span>
                  </div>
                </div>

                <div className="p-5 sm:p-6 bg-white/40 dark:bg-slate-950/40 border-t border-slate-200/50 dark:border-white/10 flex items-center justify-between mt-auto">
                  <span className="font-extrabold text-gray-700 dark:text-gray-300 text-xs uppercase tracking-wider">
                    Custom Learning Plan
                  </span>
                  <Link
                    to={`/programs/${resolveProgramRouteSlug(program)}`}
                    className="bg-brand-slate text-white px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs font-bold hover:bg-gray-800 transition-colors uppercase tracking-wider"
                  >
                    VIEW PATHWAY
                  </Link>
                </div>
              </motion.div>
            ))}
          </StaggerGroup>
        )}
      </div>
    </section>
  );
};

export default FeaturedPrograms;
