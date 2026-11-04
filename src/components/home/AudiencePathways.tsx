import React from 'react';
import { Link } from 'react-router-dom';
import { GraduationCap, Users, School, Building2, UserCircle } from 'lucide-react';
import { stockImages } from '../../lib/stockImages';
import { StaggerGroup, Reveal } from '../ui/Reveal';
import { staggerItem } from '../ui/animationVariants';
import { motion } from 'motion/react';

const pathways = [
  {
    title: 'STUDENTS',
    description: 'Learn useful skills, build projects and develop work you can actually show.',
    icon: <GraduationCap size={26} />,
    ctaText: 'LEARN WITH US',
    ctaLink: '/programs',
    image: stockImages.students,
  },
  {
    title: 'PARENTS',
    description: 'Find practical academic, digital and creative programs designed to help your child grow.',
    icon: <Users size={26} />,
    ctaText: 'EXPLORE PROGRAMS',
    ctaLink: '/programs',
    image: stockImages.parents,
  },
  {
    title: 'SCHOOLS',
    description: 'Bring digital literacy, coding, creative education, music and technology programs into your school.',
    icon: <School size={26} />,
    ctaText: 'PARTNER WITH US',
    ctaLink: '/contact',
    image: stockImages.schools,
  },
  {
    title: 'BUSINESSES',
    description: 'Get the websites, applications, designs and digital support your business needs.',
    icon: <Building2 size={26} />,
    ctaText: 'START A PROJECT',
    ctaLink: '/services',
    image: stockImages.businesses,
  },
  {
    title: 'TUTORS',
    description: 'Join a learning environment where teaching, practical skills and student development come together.',
    icon: <UserCircle size={26} />,
    ctaText: 'BECOME A TUTOR',
    ctaLink: '/register',
    image: stockImages.tutors,
  }
];

const AudiencePathways: React.FC = () => {
  return (
    <section className="jb-home-section jb-home-audience py-24 bg-gray-50 dark:bg-slate-950 border-t border-gray-100">
      <div className="container mx-auto px-4 md:px-8 max-w-7xl">
        <Reveal className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl md:text-5xl font-extrabold text-brand-slate dark:text-white mb-6 tracking-tight">
            BUILT AROUND PEOPLE, NOT JUST PRODUCTS.
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-400 font-medium">
            Different people come to Jaystarbliss Studios for different reasons. Our services and programs are designed to meet them where they are.
          </p>
        </Reveal>

        <StaggerGroup className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pathways.map((pathway, index) => (
            <motion.div 
              key={index} 
              variants={staggerItem} 
              whileHover={{ y: -6, transition: { duration: 0.28, ease: 'easeOut' } }}
              className="h-full"
            >
              <div className="group relative rounded-2xl overflow-hidden glass-card flex flex-col h-full">
                <div className="relative h-40 overflow-hidden">
                  <img
                    src={pathway.image}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-brand-slate/80 via-brand-slate/10 to-transparent" />
                  <div className="absolute bottom-4 left-6 w-12 h-12 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-xl flex items-center justify-center text-brand-red shadow-lg border border-white/50 dark:border-white/10">
                    {pathway.icon}
                  </div>
                </div>
                <div className="p-6 sm:p-8 flex flex-col flex-grow">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">{pathway.title}</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-8 flex-grow font-medium leading-relaxed text-sm sm:text-base">
                    {pathway.description}
                  </p>
                  <Link
                    to={pathway.ctaLink}
                    className="w-full text-center bg-slate-100/80 dark:bg-slate-800/80 backdrop-blur-sm text-brand-slate dark:text-white font-bold py-3 rounded-lg hover:bg-brand-red hover:text-white transition-colors uppercase tracking-wide text-sm border border-slate-200/50 dark:border-white/10"
                  >
                    {pathway.ctaText}
                  </Link>
                </div>
              </div>
            </motion.div>
          ))}
        </StaggerGroup>
      </div>
    </section>
  );
};

export default AudiencePathways;
