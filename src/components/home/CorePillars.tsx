import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Monitor, Palette, Users } from 'lucide-react';
import { stockImages } from '../../lib/stockImages';
import { StaggerGroup, Reveal } from '../ui/Reveal';
import { staggerItem } from '../ui/animationVariants';
import { motion } from 'motion/react';
import { usePageSection } from '../../lib/cms';

const defaultPillars = [
  {
    title: 'LEARN WITH US',
    description: 'Master academic subjects, learn programming, and build digital skills. We teach mathematics, sciences, web development, graphic design, and music in a practical and engaging way.',
    icon: <BookOpen size={22} />,
    ctaText: 'EXPLORE PROGRAMS',
    ctaLink: '/programs',
    image: stockImages.learn,
  },
  {
    title: 'BUILD WITH US',
    description: 'We design and build websites, web applications, and complete digital solutions for businesses, schools, organizations, and individuals who want a professional online presence.',
    icon: <Monitor size={22} />,
    ctaText: 'EXPLORE TECH SERVICES',
    ctaLink: '/services',
    image: stockImages.build,
  },
  {
    title: 'CREATE WITH US',
    description: 'From logos and brand identities to flyers, presentations, and digital graphics, we create professional visual work that helps you and your business communicate clearly.',
    icon: <Palette size={22} />,
    ctaText: 'EXPLORE CREATIVE SERVICES',
    ctaLink: '/services',
    image: stockImages.create,
  },
  {
    title: 'PARTNER WITH US',
    description: 'We partner with schools and organizations to run on-site Smart Tech Clubs, Coding Clubs, Music Clubs, and Digital Literacy programs customized for their students.',
    icon: <Users size={22} />,
    ctaText: 'EXPLORE SCHOOL PROGRAMS',
    ctaLink: '/programs#schools',
    image: stockImages.partner,
  }
];

const CorePillars: React.FC = () => {
  const { data: sectionInfo } = usePageSection('home', 'pillars', {
    title: 'OUR ECOSYSTEM',
    subtitle: 'Education. Technology. Creative Services. Digital Consulting.',
    pillar1Title: 'LEARN WITH US',
    pillar1Desc: '',
    pillar2Title: 'BUILD WITH US',
    pillar2Desc: '',
    pillar3Title: 'CREATE WITH US',
    pillar3Desc: ''
  });

  return (
    <section className="py-24 bg-white dark:bg-slate-900 dark:border-slate-800 border-t border-gray-100">
      <div className="container mx-auto px-4 md:px-8 max-w-7xl">
        <Reveal className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-5xl font-extrabold text-brand-slate dark:text-white mb-6 tracking-tight">
            {sectionInfo.title || 'OUR ECOSYSTEM'}
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-400 font-medium">
            {sectionInfo.subtitle || 'Education. Technology. Creative Services. Digital Consulting.'}
          </p>
        </Reveal>

        <StaggerGroup className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {defaultPillars.map((pillar, index) => (
            <motion.div key={index} variants={staggerItem}>
              <Link
                to={pillar.ctaLink}
                className="group relative flex flex-col justify-end h-[420px] rounded-[1.75rem] overflow-hidden shadow-lg shadow-black/5 hover:shadow-2xl hover:shadow-black/20 transition-shadow duration-500"
              >
                <img
                  src={pillar.image}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover scale-100 group-hover:scale-110 transition-transform duration-700 ease-out"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-brand-slate via-brand-slate/70 to-brand-slate/10 group-hover:from-brand-red/90 group-hover:via-brand-slate/70 transition-colors duration-500" />

                <div className="relative z-10 p-8 flex flex-col h-full justify-end">
                  <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white mb-auto">
                    {pillar.icon}
                  </div>
                  <h3 className="text-xl font-bold text-white mb-3">{pillar.title}</h3>
                  <p className="text-white/75 font-medium leading-relaxed text-sm mb-6 line-clamp-4">
                    {pillar.description}
                  </p>
                  <span className="inline-flex font-bold text-xs uppercase tracking-wider text-white items-center gap-2">
                    {pillar.ctaText}
                    <span className="transition-transform group-hover:translate-x-1">&rarr;</span>
                  </span>
                </div>
              </Link>
            </motion.div>
          ))}
        </StaggerGroup>
      </div>
    </section>
  );
};

export default CorePillars;
