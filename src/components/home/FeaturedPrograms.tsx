import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { getAllClientDatabases } from '../../lib/firebase';
import { Link } from 'react-router-dom';
import { StaggerGroup, Reveal } from '../ui/Reveal';
import { staggerItem } from '../ui/animationVariants';
import { motion } from 'motion/react';
import { usePageSection } from '../../lib/cms';
import { GlassGridSkeleton } from '../ui/GlassCardSkeleton';
import { ArrowRight, Compass } from 'lucide-react';
import { matchPrimaryRootDefinition } from '../../lib/programHierarchy';

interface CoreProgramCardItem {
  id: string;
  key: 'technology' | 'music' | 'academics' | 'design-graphics';
  title: string;
  categoryLabel: string;
  targetAudience: string;
  shortDescription: string;
  deliveryFormat: string;
  image: string;
  link: string;
}

const DEFAULT_FOUR_CORE_PROGRAMS: CoreProgramCardItem[] = [
  {
    id: 'core-technology',
    key: 'technology',
    title: 'Technology',
    categoryLabel: 'TECHNOLOGY',
    targetAudience: 'ALL AGES',
    shortDescription:
      'Software engineering, web development, Python, artificial intelligence, robotics, and foundational digital literacy.',
    deliveryFormat: 'ONLINE / IN-PERSON',
    image:
      'https://images.pexels.com/photos/5473298/pexels-photo-5473298.jpeg?auto=compress&cs=tinysrgb&w=1400',
    link: '/programs?category=technology#programs-content',
  },
  {
    id: 'core-music',
    key: 'music',
    title: 'Music',
    categoryLabel: 'CREATIVE ARTS',
    targetAudience: 'ALL AGES',
    shortDescription:
      'Instrumental mastery across piano, keyboard, guitar, drums, and violin alongside vocal coaching, music theory, and audio production.',
    deliveryFormat: 'ONLINE / IN-PERSON',
    image:
      'https://images.pexels.com/photos/164743/pexels-photo-164743.jpeg?auto=compress&cs=tinysrgb&w=1400',
    link: '/programs?category=music#programs-content',
  },
  {
    id: 'core-academics',
    key: 'academics',
    title: 'Academics',
    categoryLabel: 'ACADEMICS & STEM',
    targetAudience: 'GRADES 1–12 & EXAM PREP',
    shortDescription:
      'Targeted academic mentorship in Mathematics, Sciences, and English alongside rigorous WAEC, JAMB, IGCSE, and SAT preparation.',
    deliveryFormat: 'ONLINE / IN-PERSON',
    image:
      'https://images.pexels.com/photos/5905709/pexels-photo-5905709.jpeg?auto=compress&cs=tinysrgb&w=1400',
    link: '/programs?category=academics#programs-content',
  },
  {
    id: 'core-design-graphics',
    key: 'design-graphics',
    title: 'Design and Graphics',
    categoryLabel: 'CREATIVE ARTS',
    targetAudience: 'ALL AGES',
    shortDescription:
      'Visual communication, graphic design, brand identity systems, UI/UX product design, and digital illustration.',
    deliveryFormat: 'ONLINE / IN-PERSON',
    image:
      'https://images.pexels.com/photos/7988079/pexels-photo-7988079.jpeg?auto=compress&cs=tinysrgb&w=1400',
    link: '/programs?category=design-graphics#programs-content',
  },
];

function resolveCoreCtaText(rawCtaText?: string): string {
  if (!rawCtaText) return 'EXPLORE ALL FOUR PROGRAMS';
  const normalized = rawCtaText.trim();
  if (
    !normalized ||
    /8\s*academies/i.test(normalized) ||
    /all\s*academies/i.test(normalized) ||
    /view\s*all\s*programs/i.test(normalized)
  ) {
    return 'EXPLORE ALL FOUR PROGRAMS';
  }
  return normalized;
}

const FeaturedPrograms: React.FC = () => {
  const [programs, setPrograms] = useState<CoreProgramCardItem[]>(DEFAULT_FOUR_CORE_PROGRAMS);
  const [loading, setLoading] = useState(true);

  const { data: sectionInfo } = usePageSection('home', 'programs_preview', {
    title: 'THE LEARNING ECOSYSTEM',
    ctaText: 'EXPLORE ALL FOUR PROGRAMS',
    ctaLink: '/programs',
  });

  useEffect(() => {
    const fetchCorePrograms = async () => {
      try {
        const dbs = getAllClientDatabases();
        const snaps = await Promise.all(
          dbs.map((clientDb) =>
            getDocs(
              query(collection(clientDb, 'programs'), where('status', '==', 'PUBLISHED'))
            ).catch(() => null)
          )
        );
        const byRootKey = new Map<string, any>();
        snaps.forEach((snap) => {
          if (!snap) return;
          snap.docs.forEach((docSnap) => {
            const data = docSnap.data();
            const matchedRoot = matchPrimaryRootDefinition(data, docSnap.id);
            if (matchedRoot && !data.parentProgramId && !byRootKey.has(matchedRoot.key)) {
              byRootKey.set(matchedRoot.key, { id: docSnap.id, ...data });
            }
          });
        });

        const mergedCore = DEFAULT_FOUR_CORE_PROGRAMS.map((coreItem) => {
          const customRoot = byRootKey.get(coreItem.key);
          if (!customRoot) return coreItem;
          return {
            ...coreItem,
            shortDescription: customRoot.shortDescription || coreItem.shortDescription,
            deliveryFormat:
              customRoot.deliveryFormat || customRoot.deliveryMode || coreItem.deliveryFormat,
            image:
              customRoot.image ||
              customRoot.coverImage ||
              customRoot.bannerImage ||
              customRoot.featuredImage ||
              coreItem.image,
          };
        });

        setPrograms(mergedCore);
      } catch (error) {
        console.error('Error fetching core programs:', error);
        setPrograms(DEFAULT_FOUR_CORE_PROGRAMS);
      } finally {
        setLoading(false);
      }
    };
    fetchCorePrograms();
  }, []);

  const ctaLabel = resolveCoreCtaText(sectionInfo.ctaText);

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
              <span>{ctaLabel}</span>
              <ArrowRight size={14} />
            </Link>

            <Link
              to="/programs?tab=pathfinder#pathfinder-section"
              className="inline-flex items-center gap-2 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700 px-6 py-3 rounded-xl font-bold transition-colors text-xs uppercase tracking-wider"
            >
              <Compass size={14} />
              <span>Build Child&apos;s Plan</span>
            </Link>
          </div>
        </Reveal>

        {loading ? (
          <GlassGridSkeleton count={4} variant="program" />
        ) : (
          <StaggerGroup className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {programs.map((program) => (
              <motion.div
                key={program.id}
                variants={staggerItem}
                whileHover={{ y: -6, transition: { duration: 0.28, ease: 'easeOut' } }}
                className="flex flex-col glass-card rounded-2xl sm:rounded-3xl overflow-hidden group border border-slate-200/80 dark:border-slate-800"
              >
                <div className="relative h-44 overflow-hidden">
                  <img
                    src={program.image}
                    alt={program.title}
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                  <div className="absolute bottom-4 left-4 flex gap-2 flex-wrap">
                    <span className="inline-block px-3 py-1 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm text-brand-slate dark:text-white text-[11px] font-bold uppercase tracking-wider rounded-full shadow-xs">
                      {program.categoryLabel}
                    </span>
                    {program.targetAudience && (
                      <span className="inline-block px-3 py-1 bg-brand-red text-white text-[11px] font-bold uppercase tracking-wider rounded-full shadow-xs">
                        {program.targetAudience}
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-6 flex-grow flex flex-col">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3 leading-tight group-hover:text-brand-red transition-colors">
                    {program.title}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-6 font-medium text-sm leading-relaxed flex-grow">
                    {program.shortDescription}
                  </p>
                  <div className="flex items-center text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    <span className="w-20 text-gray-700 dark:text-gray-300">Format:</span>
                    <span className="text-brand-red dark:text-red-400">
                      {program.deliveryFormat}
                    </span>
                  </div>
                </div>

                <div className="p-5 bg-white/40 dark:bg-slate-950/40 border-t border-slate-200/50 dark:border-white/10 flex items-center justify-between mt-auto">
                  <span className="font-extrabold text-gray-700 dark:text-gray-300 text-xs uppercase tracking-wider">
                    Core Programme
                  </span>
                  <Link
                    to={program.link}
                    className="bg-brand-slate text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-gray-800 transition-colors uppercase tracking-wider"
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
