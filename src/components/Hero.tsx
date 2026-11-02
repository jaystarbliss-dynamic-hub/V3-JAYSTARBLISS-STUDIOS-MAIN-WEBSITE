import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import GalaxyOrbit from './home/GalaxyOrbit';
import { usePageSection } from '../lib/cms';
import { Reveal } from './ui/Reveal';

const Hero: React.FC = () => {
  const { data } = usePageSection('home', 'hero', {
    title: 'LEARN. BUILD. CREATE. GROW.',
    subtitle: 'Jaystarbliss Studios is a multi-service digital, creative and educational hub offering tech programs, creative learning, school partnerships and practical digital solutions for kids, teens, schools and businesses.',
    primaryBtnText: 'START LEARNING',
    primaryBtnLink: '/programs',
    secondaryBtnText: 'START A PROJECT',
    secondaryBtnLink: '/services',
    backgroundImage: ''
  });

  return (
    <section className="relative bg-slate-950 text-white py-20 lg:py-28 overflow-hidden border-b border-slate-800/80 min-h-[90vh] flex items-center">
      {/* 3D Interactive Background */}
      <GalaxyOrbit />

      <div className="container mx-auto px-4 md:px-8 max-w-7xl relative z-10 pointer-events-none">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          <Reveal className="lg:col-span-6 text-left pointer-events-auto">
            <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight leading-[1.08] mb-6 drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)]">
              {data.title || 'LEARN. BUILD. CREATE. GROW.'}
            </h1>
            <p className="text-lg sm:text-xl md:text-2xl text-slate-200 mb-10 leading-relaxed font-medium drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">
              {data.subtitle}
            </p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
              <Link 
                to={data.primaryBtnLink || '/programs'} 
                className="relative inline-flex overflow-hidden rounded-xl p-[2px] focus:outline-none hover:-translate-y-1 transition-transform shadow-xl shadow-brand-red/20 group"
              >
                <span className="absolute inset-[-1000%] animate-[spin_3s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#B91C1C_0%,#F8FAFC_50%,#B91C1C_100%)]" />
                <span className="inline-flex h-full w-full items-center justify-center gap-2 rounded-xl bg-brand-red px-8 py-4 font-bold text-white backdrop-blur-3xl transition-colors group-hover:bg-red-700 text-sm uppercase tracking-wider">
                  {data.primaryBtnText || 'START LEARNING'}
                  <ArrowRight size={18} />
                </span>
              </Link>
              <Link 
                to={data.secondaryBtnLink || '/services'} 
                className="relative inline-flex overflow-hidden rounded-xl p-[2px] focus:outline-none hover:-translate-y-1 transition-transform shadow-xl group"
              >
                <span className="absolute inset-[-1000%] animate-[spin_3s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#38BDF8_0%,#1E293B_50%,#38BDF8_100%)]" />
                <span className="inline-flex h-full w-full items-center justify-center gap-2 rounded-xl bg-slate-900/90 px-8 py-4 font-bold text-white backdrop-blur-3xl transition-colors group-hover:bg-slate-800 text-sm uppercase tracking-wider">
                  {data.secondaryBtnText || 'START A PROJECT'}
                </span>
              </Link>
            </div>
          </Reveal>
          <div className="lg:col-span-6 hidden lg:block h-[500px]" />
        </div>
      </div>
    </section>
  );
};

export default Hero;
