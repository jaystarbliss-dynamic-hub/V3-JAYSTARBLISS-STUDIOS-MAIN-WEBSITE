import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import GalaxyOrbit from "./home/GalaxyOrbit";
import { usePageSection } from "../lib/cms";

const Hero: React.FC = () => {
  const { data } = usePageSection('home', 'hero', {
    headingLine1: 'LEARN. BUILD.',
    headingLine2: 'CREATE. GROW.',
    primaryCtaText: 'START LEARNING',
    primaryCtaLink: '/register',
    secondaryCtaText: 'HIRE US',
    secondaryCtaLink: '/services'
  });

  return (
    <div className="relative min-h-[90vh] bg-brand-slate overflow-hidden w-full max-w-full flex items-center justify-center pt-20 pb-12 lg:pb-0">
      {/* Background Grid & Glow */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff0a_1px,transparent_1px),linear-gradient(to_bottom,#ffffff0a_1px,transparent_1px)] bg-[size:4rem_4rem] pointer-events-none"></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-[800px] h-[90vw] max-h-[800px] bg-brand-red/10 rounded-full blur-[100px] opacity-50 pointer-events-none"></div>

      <div className="container mx-auto px-4 sm:px-6 relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-8 items-center max-w-7xl">
        {/* Left Content Area */}
        <div className="text-center lg:text-left max-w-2xl mx-auto lg:mx-0 w-full">
          <h1 className="mt-0 text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold text-white leading-[1.1] mb-6 tracking-tight break-words">
            {data.headingLine1 || 'LEARN. BUILD.'}
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-red to-red-400">
              {data.headingLine2 ? data.headingLine2.split(' ')[0] || 'CREATE.' : 'CREATE.'}
            </span>
            <br />
            {data.headingLine2 ? data.headingLine2.split(' ').slice(1).join(' ') || 'GROW.' : 'GROW.'}
          </h1>
          <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 sm:gap-6 mt-8 w-full max-w-full">
            <Link
              to={data.primaryCtaLink || '/register'}
              className="relative inline-flex overflow-hidden rounded-xl p-[2px] focus:outline-none hover:-translate-y-1 transition-transform shadow-[0_10px_20px_rgba(223,70,39,0.3)] group"
            >
              <span className="absolute inset-[-1000%] animate-[spin_3s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#df4627_0%,#F8FAFC_50%,#df4627_100%)]" />
              <span className="inline-flex h-full w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#df4627] to-[#b3290e] px-6 sm:px-7 py-3 sm:py-3.5 text-xs sm:text-sm font-bold tracking-widest font-mono uppercase text-white backdrop-blur-3xl transition-colors group-hover:opacity-95 border border-transparent whitespace-nowrap">
                {data.primaryCtaText || 'START LEARNING'}
              </span>
            </Link>

            <Link
              to={data.secondaryCtaLink || '/services'}
              className="relative inline-flex overflow-hidden rounded-xl p-[2px] focus:outline-none hover:-translate-y-1 transition-transform shadow-lg group"
            >
              <span className="absolute inset-[-1000%] animate-[spin_3s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,#ffffff_0%,#475569_50%,#ffffff_100%)] opacity-30" />
              <span className="inline-flex h-full w-full items-center justify-center gap-2 rounded-xl bg-brand-slate px-6 sm:px-7 py-3 sm:py-3.5 text-xs sm:text-sm font-bold tracking-widest font-mono uppercase text-white backdrop-blur-3xl transition-colors group-hover:bg-slate-800 border border-white/10 whitespace-nowrap">
                {data.secondaryCtaText || 'HIRE US'}
              </span>
            </Link>

            <Link
              to="/portfolio"
              className="text-white/60 font-semibold hover:text-white transition-colors px-3 py-3 flex items-center gap-2 text-xs sm:text-sm whitespace-nowrap"
            >
              SEE OUR WORK <ArrowRight size={16} />
            </Link>
          </div>
        </div>

        {/* Right Animated Orb/Solar System Area (CRITICAL HERO REQUIREMENT) */}
        <div className="w-full max-w-[600px] mx-auto lg:-translate-y-8 mt-4 lg:mt-0 overflow-hidden">
          <GalaxyOrbit />
        </div>
      </div>
    </div>
  );
};

export default Hero;
