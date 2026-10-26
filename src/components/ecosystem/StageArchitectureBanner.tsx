import React, { useState } from 'react';
import { motion, type PanInfo } from 'motion/react';
import {
  Compass,
  Hammer,
  Cpu,
  Rocket,
  Award,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';

interface StageItem {
  stage: number;
  name: string;
  tagline: string;
  summary: string;
  keyAction: string;
  deliverable: string;
  icon: React.ElementType;
  accentColor: string;
  glowClass: string;
  borderAccent: string;
}

const STAGES: StageItem[] = [
  {
    stage: 1,
    name: 'Discover',
    tagline: 'Curiosity & Core Foundations',
    summary: 'Explore core concepts through guided interactive sandboxes and build immediate creative confidence.',
    keyAction: 'Interactive concept labs & guided exploration',
    deliverable: 'First Working Prototype',
    icon: Compass,
    accentColor: 'text-sky-400',
    glowClass: 'from-sky-500/20 via-sky-500/5 to-transparent',
    borderAccent: 'border-sky-500/40',
  },
  {
    stage: 2,
    name: 'Build',
    tagline: 'Structured Skill Acquisition',
    summary: 'Master professional tools, syntax, and workflows by constructing real components step by step.',
    keyAction: 'Hands-on component & workflow sprints',
    deliverable: 'Multi-Part Functional Project',
    icon: Hammer,
    accentColor: 'text-indigo-400',
    glowClass: 'from-indigo-500/20 via-indigo-500/5 to-transparent',
    borderAccent: 'border-indigo-500/40',
  },
  {
    stage: 3,
    name: 'Apply',
    tagline: 'Real-World Problem Solving',
    summary: 'Connect multiple skills to solve realistic briefs, debug complex logic, and iterate with mentor feedback.',
    keyAction: 'Scenario challenges & peer code/design reviews',
    deliverable: 'Production-Style Case Study',
    icon: Cpu,
    accentColor: 'text-emerald-400',
    glowClass: 'from-emerald-500/20 via-emerald-500/5 to-transparent',
    borderAccent: 'border-emerald-500/40',
  },
  {
    stage: 4,
    name: 'Create',
    tagline: 'Independent Capstone Execution',
    summary: 'Design, architect, and ship an original flagship project from blank canvas to live deployment.',
    keyAction: 'End-to-end architecture & independent build',
    deliverable: 'Deployed Capstone Portfolio Piece',
    icon: Rocket,
    accentColor: 'text-amber-400',
    glowClass: 'from-amber-500/20 via-amber-500/5 to-transparent',
    borderAccent: 'border-amber-500/40',
  },
  {
    stage: 5,
    name: 'Master',
    tagline: 'Leadership & Industry Readiness',
    summary: 'Present your work, optimize for scale, and earn verified certification ready for university or career tracks.',
    keyAction: 'Live defense, optimization & certification',
    deliverable: 'Verified Jaystarbliss Diploma & Showcase',
    icon: Award,
    accentColor: 'text-rose-400',
    glowClass: 'from-rose-500/20 via-rose-500/5 to-transparent',
    borderAccent: 'border-rose-500/40',
  },
];

export default function StageArchitectureBanner(_props: { compact?: boolean } = {}) {
  const [activeIndex, setActiveIndex] = useState(0);

  const handlePrev = () => {
    setActiveIndex((prev) => (prev - 1 + STAGES.length) % STAGES.length);
  };

  const handleNext = () => {
    setActiveIndex((prev) => (prev + 1) % STAGES.length);
  };

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.x < -45) {
      handleNext();
    } else if (info.offset.x > 45) {
      handlePrev();
    }
  };

  // Compute relative circular offset (-2, -1, 0, 1, 2) for 5 items
  const getRelativeOffset = (index: number) => {
    let diff = index - activeIndex;
    if (diff > 2) diff -= STAGES.length;
    if (diff < -2) diff += STAGES.length;
    return diff;
  };

  return (
    <div className="bg-slate-950 text-white rounded-3xl p-6 sm:p-10 shadow-2xl border border-slate-800/90 relative overflow-hidden select-none">
      {/* Subtle ambient lighting */}
      <div className="absolute -top-28 left-1/2 -translate-x-1/2 w-[36rem] h-56 bg-brand-red/15 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10">
        {/* Top Header + Controls */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-red mb-2">
              5-Stage Mastery Architecture · Interactive Pathway
            </p>
            <h3 className="text-2xl sm:text-3xl font-extrabold font-display tracking-tight text-white">
              Every Program Follows One Proven Learning Flow
            </h3>
          </div>

          <div className="flex items-center gap-3 self-start md:self-auto">
            <span className="text-xs text-slate-400 font-medium hidden sm:inline">
              Drag or use arrows to roll through stages
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrev}
                aria-label="Previous learning stage"
                className="w-10 h-10 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 flex items-center justify-center text-white transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                aria-label="Next learning stage"
                className="w-10 h-10 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 flex items-center justify-center text-white transition-colors cursor-pointer"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Interactive Progress Stepper Line */}
        <div className="relative flex items-center justify-between max-w-2xl mx-auto mb-8 px-2">
          <div className="absolute left-4 right-4 top-1/2 -translate-y-1/2 h-[2px] bg-slate-800 pointer-events-none" />
          <div
            className="absolute left-4 top-1/2 -translate-y-1/2 h-[2px] bg-brand-red transition-all duration-500 pointer-events-none"
            style={{ width: `calc(${(activeIndex / (STAGES.length - 1)) * 100}% - 1rem)` }}
          />
          {STAGES.map((s, idx) => {
            const isCurrent = idx === activeIndex;
            const isPassed = idx < activeIndex;
            return (
              <button
                key={s.stage}
                type="button"
                onClick={() => setActiveIndex(idx)}
                className="relative z-10 flex flex-col items-center gap-1.5 group cursor-pointer focus:outline-none"
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-extrabold transition-all duration-300 border ${
                    isCurrent
                      ? 'bg-brand-red text-white border-brand-red scale-110 shadow-lg shadow-brand-red/30'
                      : isPassed
                      ? 'bg-slate-900 text-white border-brand-red/60'
                      : 'bg-slate-900 text-slate-500 border-slate-800 group-hover:border-slate-600 group-hover:text-slate-300'
                  }`}
                >
                  0{s.stage}
                </div>
                <span
                  className={`text-[11px] font-bold tracking-wide transition-colors ${
                    isCurrent ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'
                  }`}
                >
                  {s.name}
                </span>
              </button>
            );
          })}
        </div>

        {/* 3D Perspective Carousel Viewport */}
        <div
          className="relative h-[320px] sm:h-[290px] w-full flex items-center justify-center overflow-hidden"
          style={{ perspective: '1200px' }}
        >
          {STAGES.map((stage, idx) => {
            const offset = getRelativeOffset(idx);
            const isCenter = offset === 0;
            const absOffset = Math.abs(offset);
            const Icon = stage.icon;

            // Compute 3D transform states
            const translateX = offset * 260;
            const translateZ = isCenter ? 0 : -140 * absOffset;
            const rotateY = offset * -24;
            const scale = isCenter ? 1 : absOffset === 1 ? 0.84 : 0.68;
            const opacity = isCenter ? 1 : absOffset === 1 ? 0.45 : 0.15;
            const zIndex = 20 - absOffset * 5;

            return (
              <motion.div
                key={stage.stage}
                drag={isCenter ? 'x' : false}
                dragConstraints={{ left: 0, right: 0 }}
                onDragEnd={handleDragEnd}
                onClick={() => {
                  if (!isCenter) setActiveIndex(idx);
                }}
                animate={{
                  x: translateX,
                  z: translateZ,
                  rotateY,
                  scale,
                  opacity,
                }}
                transition={{
                  type: 'spring',
                  stiffness: 260,
                  damping: 26,
                }}
                style={{
                  zIndex,
                  transformStyle: 'preserve-3d',
                }}
                className={`absolute w-full max-w-xl rounded-2xl p-6 sm:p-8 bg-slate-900/95 border transition-colors ${
                  isCenter
                    ? `${stage.borderAccent} shadow-2xl cursor-grab active:cursor-grabbing`
                    : 'border-slate-800/80 cursor-pointer hover:border-slate-700'
                }`}
              >
                {/* Subtle stage gradient wash */}
                <div
                  className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${stage.glowClass} pointer-events-none`}
                />

                <div className="relative z-10">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.2em] text-slate-400 mb-1">
                        <span className={stage.accentColor}>Stage 0{stage.stage}</span>
                        <span>·</span>
                        <span>{stage.tagline}</span>
                      </div>
                      <h4 className="text-2xl sm:text-3xl font-extrabold font-display text-white tracking-tight">
                        {stage.name}
                      </h4>
                    </div>

                    <div className="w-12 h-12 rounded-xl bg-slate-950/90 border border-slate-800 flex items-center justify-center shrink-0">
                      <Icon className={`w-6 h-6 ${stage.accentColor}`} />
                    </div>
                  </div>

                  <p className="text-slate-300 text-sm sm:text-base leading-relaxed mb-6">
                    {stage.summary}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-slate-800/90">
                    <div className="flex items-start gap-2.5">
                      <Sparkles className={`w-4 h-4 ${stage.accentColor} shrink-0 mt-0.5`} />
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          How You Learn
                        </p>
                        <p className="text-xs font-semibold text-white mt-0.5">
                          {stage.keyAction}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Stage Outcome
                        </p>
                        <p className="text-xs font-semibold text-white mt-0.5">
                          {stage.deliverable}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
