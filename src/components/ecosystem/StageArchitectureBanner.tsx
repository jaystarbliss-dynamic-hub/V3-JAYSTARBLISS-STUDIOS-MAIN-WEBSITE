import React, { useState } from 'react';

interface LearningStageItem {
  id: string;
  name: string;
  phrase: string;
}

const LEARNING_STAGES: LearningStageItem[] = [
  {
    id: 'discover',
    name: 'Discover',
    phrase: 'Explore core concepts through guided labs.',
  },
  {
    id: 'learn',
    name: 'Learn',
    phrase: 'Master industry tools and structured fundamentals.',
  },
  {
    id: 'build',
    name: 'Build',
    phrase: 'Construct real-world projects step by step.',
  },
  {
    id: 'launch',
    name: 'Launch',
    phrase: 'Publish original work and earn verified credentials.',
  },
];

interface SpotlightTrack {
  id: string;
  schoolId: string;
  title: string;
  summary: string;
  image: string;
}

const SPOTLIGHT_TRACKS: SpotlightTrack[] = [
  {
    id: 'ai-robotics',
    schoolId: 'robotics-future',
    title: 'AI & Robotics',
    summary: 'From intelligent systems to real-world robots.',
    image: 'https://images.pexels.com/photos/8386440/pexels-photo-8386440.jpeg?auto=compress&cs=tinysrgb&w=1200',
  },
  {
    id: 'creative-media',
    schoolId: 'creative-design',
    title: 'Creative Digital Media',
    summary: 'Design. Create. Tell better stories.',
    image: 'https://images.pexels.com/photos/7988086/pexels-photo-7988086.jpeg?auto=compress&cs=tinysrgb&w=1200',
  },
  {
    id: 'future-skills',
    schoolId: 'game-3d',
    title: 'Future Skills',
    summary: 'Adapt today. Lead tomorrow.',
    image: 'https://images.pexels.com/photos/8728380/pexels-photo-8728380.jpeg?auto=compress&cs=tinysrgb&w=1200',
  },
];

export interface StageArchitectureBannerProps {
  compact?: boolean;
  onSelectSchool?: (schoolId: string) => void;
}

export default function StageArchitectureBanner({
  compact = false,
  onSelectSchool,
}: StageArchitectureBannerProps = {}) {
  const [activeStageIndex, setActiveStageIndex] = useState<number>(0);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  const handleSpotlightClick = (schoolId: string) => {
    onSelectSchool?.(schoolId);
    const el = document.getElementById('learning-schools-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section
      aria-label="The Learning Flow"
      className="space-y-8 sm:space-y-10 select-none pt-4"
    >
      {/* Editorial Section Heading */}
      <div className="space-y-2">
        <p className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.22em] text-[#E11D48]">
          THE LEARNING FLOW
        </p>
        <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
          Every Program Follows One Proven Learning Flow
        </h2>
      </div>

      {/* Desktop & Tablet: Single Horizontal Line with Fine Connecting Rules */}
      <div className="hidden md:block space-y-4">
        <div
          role="tablist"
          aria-label="Learning flow stages"
          className="flex items-center justify-between w-full"
        >
          {LEARNING_STAGES.map((stage, idx) => {
            const isActive = idx === activeStageIndex;
            const isLast = idx === LEARNING_STAGES.length - 1;

            return (
              <React.Fragment key={stage.id}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveStageIndex(idx)}
                  className="group relative text-left py-2 shrink-0 cursor-pointer focus:outline-none"
                >
                  <span
                    className={`block text-sm lg:text-base transition-colors ${
                      isActive
                        ? 'font-bold text-slate-900 dark:text-white'
                        : 'font-medium text-slate-500 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white'
                    }`}
                  >
                    {stage.name}
                  </span>
                  <span
                    className={`block mt-2 h-[2.5px] rounded-full transition-all duration-300 ${
                      isActive
                        ? 'w-full bg-[#E11D48]'
                        : 'w-0 group-hover:w-1/2 bg-slate-300 dark:bg-white/25'
                    }`}
                  />
                </button>

                {!isLast && (
                  <div
                    className="h-px flex-1 mx-6 lg:mx-10 bg-slate-200 dark:bg-white/15"
                    aria-hidden="true"
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Short Supporting Phrase for Selected Stage */}
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
          <span className="font-bold text-slate-900 dark:text-white">
            0{activeStageIndex + 1} · {LEARNING_STAGES[activeStageIndex].name}:
          </span>{' '}
          {LEARNING_STAGES[activeStageIndex].phrase}
        </p>
      </div>

      {/* Mobile: Compact Vertical Sequence with Fine Dividers */}
      <div className="md:hidden divide-y divide-slate-200 dark:divide-white/10 border-b border-slate-200 dark:border-white/10">
        {LEARNING_STAGES.map((stage, idx) => {
          const isActive = idx === activeStageIndex;
          return (
            <button
              key={stage.id}
              type="button"
              onClick={() => setActiveStageIndex(idx)}
              className="w-full text-left py-3.5 transition-colors cursor-pointer focus:outline-none"
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-sm ${
                    isActive
                      ? 'font-bold text-slate-900 dark:text-white'
                      : 'font-medium text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {stage.name}
                </span>
                <span className="text-[11px] font-mono tabular-nums text-slate-400 dark:text-slate-500">
                  0{idx + 1}
                </span>
              </div>

              {isActive && (
                <div className="mt-2 space-y-2">
                  <div className="h-[2px] w-12 bg-[#E11D48] rounded-full" />
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {stage.phrase}
                  </p>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Secondary Horizontal Spotlight Showcase (Desktop 3-Col / Mobile Horizontal Snap) */}
      {!compact && (
        <div className="-mx-4 sm:-mx-6 lg:mx-0">
          <div className="flex lg:grid lg:grid-cols-3 gap-4 sm:gap-5 overflow-x-auto lg:overflow-visible snap-x snap-mandatory scroll-smooth no-scrollbar touch-pan-x overscroll-x-contain overscroll-y-none [-webkit-overflow-scrolling:touch] px-4 sm:px-6 lg:px-0">
            {SPOTLIGHT_TRACKS.map((track) => {
              const imgFailed = failedImages[track.id];

              return (
                <article
                  key={track.id}
                  onClick={() => handleSpotlightClick(track.schoolId)}
                  className="group relative w-[84vw] sm:w-[64vw] lg:w-auto shrink-0 snap-start overflow-hidden rounded-2xl h-[190px] sm:h-[210px] bg-slate-900 border border-slate-200/80 dark:border-white/10 cursor-pointer"
                >
                  {!imgFailed ? (
                    <img
                      src={track.image}
                      alt={track.title}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={() =>
                        setFailedImages((prev) => ({ ...prev, [track.id]: true }))
                      }
                      className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950" />
                  )}

                  <div
                    className="absolute inset-0 bg-gradient-to-r from-[#050811]/90 via-[#050811]/60 to-transparent"
                    aria-hidden="true"
                  />

                  <div className="relative z-10 h-full flex flex-col justify-end p-5 sm:p-6">
                    <h3 className="text-base sm:text-lg font-extrabold text-white tracking-tight">
                      {track.title}
                    </h3>
                    <p className="text-xs text-slate-300 mt-1 line-clamp-2 max-w-xs">
                      {track.summary}
                    </p>
                    <span className="mt-2.5 inline-block text-xs font-bold text-[#F43F5E] group-hover:text-white transition-colors">
                      Explore program
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
