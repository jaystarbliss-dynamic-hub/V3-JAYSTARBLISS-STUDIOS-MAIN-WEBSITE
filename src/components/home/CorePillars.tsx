import React from 'react';
import { BookOpen, Code, Palette, TrendingUp } from 'lucide-react';
import { stockImages } from '../../lib/stockImages';
import { StaggerGroup, Reveal } from '../ui/Reveal';
import { staggerItem } from '../ui/animationVariants';
import { motion } from 'motion/react';
import { usePageSection } from '../../lib/cms';

const CorePillars: React.FC = () => {
  const { data } = usePageSection('home', 'pillars', {
    title: 'WHAT WE DO AT JAYSTARBLISS STUDIOS',
    subtitle: 'Whether you are a parent looking for the right tech program for your child, a school seeking an educational partner, or a business needing a website or software solution, our work is built around four simple ideas.',
    pillar1Title: 'LEARN WITH US',
    pillar1Desc: 'Practical courses in coding, digital skills, creative subjects, music and academic support.',
    pillar2Title: 'BUILD WITH US',
    pillar2Desc: 'Websites, web applications, technical support and digital tools built for real-world use.',
    pillar3Title: 'CREATE WITH US',
    pillar3Desc: 'Design, branding, digital media and creative projects that help ideas stand out.',
    pillar4Title: 'GROW WITH US',
    pillar4Desc: 'Long-term skill development, mentorship, portfolio building and school partnerships.'
  });

  const pillars = [
    {
      title: data.pillar1Title || 'LEARN WITH US',
      description: data.pillar1Desc || 'Practical courses in coding, digital skills, creative subjects, music and academic support.',
      icon: <BookOpen size={24} />,
      image: stockImages.learn,
    },
    {
      title: data.pillar2Title || 'BUILD WITH US',
      description: data.pillar2Desc || 'Websites, web applications, technical support and digital tools built for real-world use.',
      icon: <Code size={24} />,
      image: stockImages.build,
    },
    {
      title: data.pillar3Title || 'CREATE WITH US',
      description: data.pillar3Desc || 'Design, branding, digital media and creative projects that help ideas stand out.',
      icon: <Palette size={24} />,
      image: stockImages.create,
    },
    {
      title: data.pillar4Title || 'GROW WITH US',
      description: data.pillar4Desc || 'Long-term skill development, mentorship, portfolio building and school partnerships.',
      icon: <TrendingUp size={24} />,
      image: stockImages.partner,
    },
  ];

  return (
    <section className="py-24 bg-gray-50 dark:bg-slate-950 border-b border-gray-100 dark:border-slate-800">
      <div className="container mx-auto px-4 md:px-8 max-w-7xl">
        <Reveal className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-brand-slate dark:text-white mb-6 tracking-tight">
            {data.title || 'WHAT WE DO AT JAYSTARBLISS STUDIOS'}
          </h2>
          <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-400 font-medium leading-relaxed">
            {data.subtitle}
          </p>
        </Reveal>

        <StaggerGroup className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {pillars.map((pillar, index) => (
            <motion.div
              key={index}
              variants={staggerItem}
              whileHover={{ y: -6, transition: { duration: 0.28, ease: 'easeOut' } }}
              className="group glass-card rounded-2xl overflow-hidden flex flex-col"
            >
              <div className="relative h-44 overflow-hidden">
                <img
                  src={pillar.image}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-brand-slate/80 via-brand-slate/20 to-transparent" />
                <div className="absolute bottom-4 left-6 w-12 h-12 rounded-xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-md text-brand-red flex items-center justify-center shadow-lg border border-white/50 dark:border-white/10">
                  {pillar.icon}
                </div>
              </div>
              <div className="p-6 sm:p-8 flex-grow flex flex-col">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3 tracking-tight">
                  {pillar.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-400 font-medium leading-relaxed text-sm sm:text-base flex-grow">
                  {pillar.description}
                </p>
              </div>
            </motion.div>
          ))}
        </StaggerGroup>
      </div>
    </section>
  );
};

export default CorePillars;
