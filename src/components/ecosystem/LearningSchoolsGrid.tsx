import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';

export interface Pathway {
  id: string;
  title: string;
  ageGroup: string;
  overview: string;
  levels: {
    level: number;
    name: string;
    focus: string;
    project: string;
  }[];
  tools: string[];
  outcomes: string[];
}

export type CoreCategoryFilterId =
  | 'all'
  | 'technology'
  | 'creative'
  | 'music'
  | 'academics'
  | 'design-graphics';

export interface LearningSchool {
  id: string;
  aliases?: string[];
  categoryLabel: string;
  filterGroup: 'technology' | 'creative' | 'academics';
  name: string;
  shortName: string;
  tagline: string;
  cardSummary: string;
  image: string;
  accentText: string;
  accentBorder: string;
  accentGradient: string;
  description: string;
  whoItIsFor: string;
  pathways: Pathway[];
}

export const LEARNING_SCHOOLS: LearningSchool[] = [
  {
    id: 'technology',
    aliases: [
      'tech',
      'tech-programming',
      'technology-programming',
      'technology-programme',
      'coding',
      'digital_and_technology',
      'digital-technology',
      'digital-literacy',
      'literacy',
      'robotics-future',
      'ai-robotics',
      'robotics',
      'future-skills',
      'game-3d',
      'young-creators',
      'strategy-games',
    ],
    categoryLabel: 'TECHNOLOGY',
    filterGroup: 'technology',
    name: 'Technology',
    shortName: 'Technology',
    tagline: 'Software Engineering, Web, Python, AI, Robotics & Digital Literacy',
    cardSummary:
      'Build real-world skills in software development, Python, AI, robotics, and modern digital fluency.',
    image:
      'https://images.pexels.com/photos/5473298/pexels-photo-5473298.jpeg?auto=compress&cs=tinysrgb&w=1400',
    accentText: 'text-red-500',
    accentBorder: 'border-red-500/40',
    accentGradient: 'from-slate-900 via-slate-900 to-slate-950',
    description:
      'From visual block logic and foundational computer literacy for beginners to full-stack web engineering, Python automation, AI systems, and robotics.',
    whoItIsFor: 'Kids (6+), Teens, University Students & Adult Career Switchers',
    pathways: [
      {
        id: 'web-eng',
        title: 'Full-Stack Web Engineering Pathway',
        ageGroup: 'Ages 11–18+ & Adults',
        overview:
          'Master modern web development from responsive HTML/CSS interfaces to full-stack React, Node.js, and cloud database architectures.',
        levels: [
          { level: 1, name: 'Discover', focus: 'HTML5, CSS3 & Responsive Layouts', project: 'Personal Interactive Portfolio Site' },
          { level: 2, name: 'Learn', focus: 'JavaScript ES6+, DOM & Web APIs', project: 'Live Weather & FinTech Dashboard' },
          { level: 3, name: 'Build', focus: 'React, TypeScript & State Architecture', project: 'Multi-Page E-Commerce Storefront' },
          { level: 4, name: 'Launch', focus: 'Node.js, Databases & Cloud Deployment', project: 'Production Full-Stack SaaS Application' },
        ],
        tools: ['VS Code', 'HTML5/CSS3', 'JavaScript', 'TypeScript', 'React', 'Node.js', 'Git & GitHub'],
        outcomes: ['Build and deploy full-stack web apps', 'Publish a professional GitHub portfolio', 'Earn Full-Stack Developer Certification'],
      },
      {
        id: 'python-ai',
        title: 'Python, Data Science, AI & Robotics Pathway',
        ageGroup: 'Ages 10–18+ & Adults',
        overview:
          'Learn Python for automation, data analysis, machine learning, generative AI applications, and intelligent robotics.',
        levels: [
          { level: 1, name: 'Discover', focus: 'Python Syntax, Logic & Algorithms', project: 'Automated CLI Quiz & Logic Engine' },
          { level: 2, name: 'Learn', focus: 'Data Structures, OOP & File Automation', project: 'Smart Expense & Report Automation Bot' },
          { level: 3, name: 'Build', focus: 'Data Analysis with Pandas & Visualization', project: 'Real-World Dataset Insights Dashboard' },
          { level: 4, name: 'Launch', focus: 'Machine Learning, AI Agents & Robotics', project: 'Deployed AI Web Service & Portfolio Defense' },
        ],
        tools: ['Python 3', 'Jupyter', 'Pandas', 'Scikit-Learn', 'FastAPI', 'Modern LLM APIs'],
        outcomes: ['Automate complex data workflows', 'Build custom AI-powered applications', 'Prepare for advanced university computing'],
      },
      {
        id: 'comp-fluency',
        title: 'Digital Literacy, Computing & Junior Coders',
        ageGroup: 'Ages 6–18+ & All Learners',
        overview:
          'Foundational computer mastery, touch typing, cloud productivity suites, cyber safety, and Scratch computational logic.',
        levels: [
          { level: 1, name: 'Discover', focus: 'OS Navigation, File Systems & Touch Typing', project: 'Organized Cloud Digital Workspace' },
          { level: 2, name: 'Learn', focus: 'Document Publishing & Executive Presentations', project: 'Formatted Research Report & Pitch Deck' },
          { level: 3, name: 'Build', focus: 'Spreadsheets, Formulas & Interactive Coding Blocks', project: 'Dynamic Analytics Workbook & Arcade Game' },
          { level: 4, name: 'Launch', focus: 'Cloud Collaboration, Cyber Safety & Fluency Portfolio', project: 'Executive Digital Fluency Portfolio' },
        ],
        tools: ['Google Workspace', 'Microsoft Office 365', 'Scratch 3.0', 'Windows / macOS', 'Cloud Drive'],
        outcomes: ['45+ WPM accurate touch typing', 'Mastery of spreadsheets and presentation design', 'Strong algorithmic thinking'],
      },
    ],
  },
  {
    id: 'music',
    aliases: [
      'music-programme',
      'music-performing-arts',
      'instruments',
      'music-arts',
      'performing-arts',
    ],
    categoryLabel: 'CREATIVE ARTS · MUSIC',
    filterGroup: 'creative',
    name: 'Music',
    shortName: 'Music',
    tagline: 'Instrumental Mastery, Piano, Guitar, Vocals, Music Theory & Audio Production',
    cardSummary:
      'Master piano, keyboard, guitar, drums, violin, vocal performance, sight-reading, and digital music production.',
    image:
      'https://images.pexels.com/photos/164743/pexels-photo-164743.jpeg?auto=compress&cs=tinysrgb&w=1400',
    accentText: 'text-red-500',
    accentBorder: 'border-red-500/40',
    accentGradient: 'from-slate-900 via-slate-900 to-slate-950',
    description:
      'Progressive musical training covering piano/keyboard, guitar, violin, drums, vocal coaching, sight-reading, ear training, harmony, and digital audio production.',
    whoItIsFor: 'Kids (5+), Teens, Aspiring Musicians, Vocalists & Music Producers',
    pathways: [
      {
        id: 'piano-instrumental',
        title: 'Instrumental Mastery (Piano, Keyboard, Guitar, Violin & Drums)',
        ageGroup: 'Ages 5–18+ & Adults',
        overview:
          'Structured practical and theoretical instrumental mastery from foundational rhythm and posture to two-hand repertoire and ABRSM/MUSON grade exams.',
        levels: [
          { level: 1, name: 'Discover', focus: 'Instrument Geography, Posture & Rhythm Fundamentals', project: '3 Foundational Melody Recital Pieces' },
          { level: 2, name: 'Learn', focus: 'Staff Notation, Sight-Reading & Dynamic Expression', project: 'Classical & Contemporary Sheet Music Performance' },
          { level: 3, name: 'Build', focus: 'Chord Progressions, Two-Hand Coordination & Scales', project: 'Full Multi-Section Recital Performance' },
          { level: 4, name: 'Launch', focus: 'Improvisation, Exam Prep (ABRSM/Trinity) & Stage Recital', project: 'Live Studio Showcase & Grade Portfolio' },
        ],
        tools: ['Acoustic / Digital Piano', 'Guitar / Violin / Drums', 'Metronome', 'ABRSM / Trinity Syllabi'],
        outcomes: ['Fluent grand-staff sight-reading', 'Confident two-hand & ensemble coordination', 'Readiness for international music board exams'],
      },
      {
        id: 'vocals-audio-production',
        title: 'Vocal Coaching, Songwriting & Digital Audio Production',
        ageGroup: 'Ages 8–18+ & Adults',
        overview:
          'Develop pitch control, breath support, harmonic ear training, songwriting, and studio music production.',
        levels: [
          { level: 1, name: 'Discover', focus: 'Breath Control, Pitch Accuracy & Vocal Warmups', project: 'Solo Vocal Melody Recording' },
          { level: 2, name: 'Learn', focus: 'Ear Training, Intervals & Harmonic Blending', project: 'Multi-Part Harmony Arrangement' },
          { level: 3, name: 'Build', focus: 'Songwriting, Beat Arrangement & DAW Recording', project: 'Original Recorded Demo Track' },
          { level: 4, name: 'Launch', focus: 'Mixing, Mastering & Live Stage Performance', project: 'Released Studio Single & Live Performance' },
        ],
        tools: ['Studio Condenser Mics', 'Logic Pro / FL Studio / BandLab', 'Ear Training Labs'],
        outcomes: ['Strong vocal range and pitch control', 'Compose and arrange original music', 'Produce studio-quality audio recordings'],
      },
    ],
  },
  {
    id: 'academics',
    aliases: [
      'academics-programme',
      'academic-excellence',
      'academic',
      'exams-languages',
      'private-tutoring',
      'tutoring',
    ],
    categoryLabel: 'ACADEMICS',
    filterGroup: 'academics',
    name: 'Academics',
    shortName: 'Academics',
    tagline: 'Mathematics, Sciences, English, STEM & Exam Mastery (WAEC, JAMB, IGCSE, SAT)',
    cardSummary:
      'Achieve top-percentile mastery in Mathematics, Sciences, English, and national/international examinations.',
    image:
      'https://images.pexels.com/photos/5905709/pexels-photo-5905709.jpeg?auto=compress&cs=tinysrgb&w=1400',
    accentText: 'text-red-500',
    accentBorder: 'border-red-500/40',
    accentGradient: 'from-slate-900 via-slate-900 to-slate-950',
    description:
      'Personalized 1-on-1 and small-group academic mentorship across Nigerian, British (IGCSE/A-Level), and American curricula alongside intensive WAEC, JAMB, SAT, and IELTS preparation.',
    whoItIsFor: 'Primary, Secondary & Pre-University Students (Ages 5–18+)',
    pathways: [
      {
        id: 'stem-english',
        title: 'Core Mathematics, Sciences & English Mastery Pathway',
        ageGroup: 'Ages 5–18 (Grades 1–12)',
        overview:
          'Eliminate learning gaps and build top-percentile mastery in Mathematics, Further Math, Physics, Chemistry, Biology, and English Literacy.',
        levels: [
          { level: 1, name: 'Discover', focus: 'Diagnostic Assessment & Core Concept Clarity', project: 'Personalized Mastery Action Plan' },
          { level: 2, name: 'Learn', focus: 'Guided Problem Solving & Analytical Drills', project: 'Topic-by-Topic Mastery Portfolio' },
          { level: 3, name: 'Build', focus: 'Multi-Step Word Problems & Scientific Reasoning', project: 'Applied STEM Investigation Report' },
          { level: 4, name: 'Launch', focus: 'Timed Past-Paper Simulations & Distinction Prep', project: 'Top-Grade School & Board Distinction' },
        ],
        tools: ['Interactive Whiteboards', 'Desmos / GeoGebra', 'PhET Simulations', 'Past Paper Banks'],
        outcomes: ['Measurable grade improvement within 8 weeks', 'Deep conceptual confidence in Math and Science', 'Strong academic writing and critical reading'],
      },
      {
        id: 'global-prep',
        title: 'WAEC, JAMB, IGCSE, SAT & Global Exams Track',
        ageGroup: 'Ages 10–18+ & Pre-University',
        overview:
          'Structured score-maximizing preparation for WAEC, NECO, JAMB UTME, Cambridge Checkpoint, IGCSE, SAT, and IELTS.',
        levels: [
          { level: 1, name: 'Discover', focus: 'Baseline Mock Test & Syllabus Gap Audit', project: 'Targeted Section Score Roadmap' },
          { level: 2, name: 'Learn', focus: 'High-Yield Concepts, Formulas & Examiner Rubrics', project: 'Core Strategy Drill Book' },
          { level: 3, name: 'Build', focus: 'CBT Speed Drills & Past Question Dissection', project: 'Timed Section Sprint Benchmarks' },
          { level: 4, name: 'Launch', focus: 'Full-Length Proctored Mock Exams & Peak Review', project: 'Distinction / 300+ JAMB / 1450+ SAT Readiness' },
        ],
        tools: ['Jaystarbliss CBT Simulator', 'Official WAEC/JAMB/Cambridge Banks', 'Speed Drill Timers'],
        outcomes: ['Distinction readiness in WAEC, JAMB, and IGCSE', '1450+ SAT and Band 8.0+ IELTS strategies', 'High-speed exam accuracy under timed conditions'],
      },
    ],
  },
  {
    id: 'design-graphics',
    aliases: [
      'design-graphics-programme',
      'creative-design',
      'creative',
      'design',
      'creative-arts',
      'graphic-design',
      'media-animation',
    ],
    categoryLabel: 'CREATIVE ARTS · DESIGN & GRAPHICS',
    filterGroup: 'creative',
    name: 'Design and Graphics',
    shortName: 'Design & Graphics',
    tagline: 'Graphic Design, Brand Identity, UI/UX Design, Illustration & Motion Media',
    cardSummary:
      'Turn creative ideas into studio-grade visual brand systems, digital illustrations, and interactive UI/UX prototypes.',
    image:
      'https://images.pexels.com/photos/7988079/pexels-photo-7988079.jpeg?auto=compress&cs=tinysrgb&w=1400',
    accentText: 'text-red-500',
    accentBorder: 'border-red-500/40',
    accentGradient: 'from-slate-900 via-slate-900 to-slate-950',
    description:
      'Transform visual imagination into studio-grade brand identities, vector illustrations, print and social media visuals, motion graphics, and interactive mobile/web UI/UX prototypes.',
    whoItIsFor: 'Creative Kids, Teens, Aspiring Designers & Visual Storytellers',
    pathways: [
      {
        id: 'ui-ux-brand',
        title: 'Graphic Design, Visual Branding & UI/UX Pathway',
        ageGroup: 'Ages 8–18+ & Adults',
        overview:
          'Learn layout composition, color theory, typography, vector illustration, brand identity systems, and interactive product design in Figma, Canva, and Adobe tools.',
        levels: [
          { level: 1, name: 'Discover', focus: 'Visual Principles, Color Theory & Typography', project: 'Event Poster & Social Media Campaign' },
          { level: 2, name: 'Learn', focus: 'Vector Illustration, Logo Marks & Brand Identity', project: 'Complete Brand Logo & Style Guide' },
          { level: 3, name: 'Build', focus: 'UI Components, Wireframing & Figma Auto-Layout', project: 'Mobile App Design System' },
          { level: 4, name: 'Launch', focus: 'Interactive UX Prototyping & Case Study Curation', project: 'Published High-Fidelity App Prototype' },
        ],
        tools: ['Figma', 'Adobe Photoshop', 'Adobe Illustrator', 'Canva Pro', 'Behance'],
        outcomes: ['Design complete brand guidelines', 'Build interactive Figma app prototypes', 'Graduate with a studio design portfolio'],
      },
      {
        id: 'motion-cinema',
        title: 'Digital Illustration, Animation & Motion Graphics',
        ageGroup: 'Ages 9–18+ & Adults',
        overview:
          'Master visual storytelling through digital illustration, storyboarding, 2D/3D animation keyframes, and motion graphics.',
        levels: [
          { level: 1, name: 'Discover', focus: 'Storyboarding, Digital Sketching & Keyframes', project: 'Character Concept Art & Animated Loop' },
          { level: 2, name: 'Learn', focus: 'Motion Typography, Cuts & Visual Pacing', project: 'Cinematic Brand Promo Edit' },
          { level: 3, name: 'Build', focus: 'Character Rigging & Explainer Animation', project: 'Animated Product Explainer Video' },
          { level: 4, name: 'Launch', focus: 'Visual Effects, Color Grading & Showreel', project: '60-Second Creative Studio Showreel' },
        ],
        tools: ['Figma', 'After Effects', 'Premiere Pro', 'CapCut Pro', 'Blender 2D/3D'],
        outcomes: ['Create custom digital illustrations and motion graphics', 'Direct and edit broadcast-quality visual media', 'Publish a professional creator showreel'],
      },
    ],
  },
];

const CATEGORY_TABS: { id: CoreCategoryFilterId; label: string }[] = [
  { id: 'all', label: 'All programs' },
  { id: 'technology', label: 'Technology' },
  { id: 'creative', label: 'Creative Arts' },
  { id: 'music', label: 'Music' },
  { id: 'academics', label: 'Academics' },
  { id: 'design-graphics', label: 'Design and Graphics' },
];

interface LearningSchoolsGridProps {
  selectedSchoolId?: string;
  onSelectSchool?: (schoolId: string) => void;
  onSchoolChange?: (schoolId: string) => void;
}

function findSchoolByAnyId(candidate?: string): LearningSchool | undefined {
  if (!candidate) return undefined;
  const norm = candidate.toLowerCase().trim();
  return LEARNING_SCHOOLS.find(
    (s) => s.id === norm || (s.aliases && s.aliases.includes(norm))
  );
}

export default function LearningSchoolsGrid({
  selectedSchoolId: controlledSchoolId,
  onSelectSchool,
  onSchoolChange,
}: LearningSchoolsGridProps = {}) {
  const [activeCategory, setActiveCategory] = useState<CoreCategoryFilterId>('all');
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'slider' | 'detail'>('slider');
  const [selectedDetailSchool, setSelectedDetailSchool] = useState<LearningSchool>(() => {
    return findSchoolByAnyId(controlledSchoolId) || LEARNING_SCHOOLS[0];
  });
  const [activePathwayIndex, setActivePathwayIndex] = useState<number>(0);
  const [activeLevelIndex, setActiveLevelIndex] = useState<number>(0);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  const trackRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);
  const isProgrammaticScroll = useRef<boolean>(false);

  const visibleSchools = useMemo(() => {
    if (activeCategory === 'all') return LEARNING_SCHOOLS;
    if (activeCategory === 'music' || activeCategory === 'design-graphics') {
      return LEARNING_SCHOOLS.filter((s) => s.id === activeCategory);
    }
    return LEARNING_SCHOOLS.filter((s) => s.filterGroup === activeCategory);
  }, [activeCategory]);

  const notifySchoolChange = useCallback(
    (schoolId: string) => {
      onSelectSchool?.(schoolId);
      onSchoolChange?.(schoolId);
    },
    [onSelectSchool, onSchoolChange]
  );

  const scrollToCardIndex = useCallback((index: number, smooth = true) => {
    const track = trackRef.current;
    const card = cardRefs.current[index];
    if (!track || !card) return;

    isProgrammaticScroll.current = true;
    const trackRect = track.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const currentScroll = track.scrollLeft;

    // On mobile (<768px), align card to the left padding; on tablet/desktop, align comfortably
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const targetLeft = isMobile
      ? currentScroll + (cardRect.left - trackRect.left) - 16
      : currentScroll + (cardRect.left - trackRect.left) - Math.max(24, (trackRect.width - cardRect.width) * 0.22);

    track.scrollTo({
      left: Math.max(0, targetLeft),
      behavior: smooth ? 'smooth' : 'auto',
    });

    window.setTimeout(() => {
      isProgrammaticScroll.current = false;
    }, 420);
  }, []);

  // Sync external controlledSchoolId when passed via URL query or hash
  useEffect(() => {
    if (!controlledSchoolId) return;
    const matched = findSchoolByAnyId(controlledSchoolId);
    if (!matched) return;
    setSelectedDetailSchool(matched);
    const idxInVisible = visibleSchools.findIndex((s) => s.id === matched.id);
    if (idxInVisible >= 0) {
      setActiveIndex(idxInVisible);
      scrollToCardIndex(idxInVisible, true);
    }
  }, [controlledSchoolId, visibleSchools, scrollToCardIndex]);

  // Mouse pointer drag-to-scroll on desktop
  const dragState = useRef<{ isDown: boolean; startX: number; scrollLeft: number; dragged: boolean }>({
    isDown: false,
    startX: 0,
    scrollLeft: 0,
    dragged: false,
  });

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    if (!track) return;
    dragState.current = {
      isDown: true,
      startX: e.pageX - track.offsetLeft,
      scrollLeft: track.scrollLeft,
      dragged: false,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragState.current.isDown) return;
    const track = trackRef.current;
    if (!track) return;
    const x = e.pageX - track.offsetLeft;
    const walk = (x - dragState.current.startX) * 1.25;
    if (Math.abs(walk) > 8) {
      dragState.current.dragged = true;
    }
    track.scrollLeft = dragState.current.scrollLeft - walk;
  };

  const handleMouseUpOrLeave = () => {
    dragState.current.isDown = false;
  };

  // Update activeIndex on native horizontal scroll
  const handleTrackScroll = () => {
    if (isProgrammaticScroll.current) return;
    const track = trackRef.current;
    if (!track) return;

    const trackRect = track.getBoundingClientRect();
    const isMobile = window.innerWidth < 768;
    const referenceX = isMobile ? trackRect.left + trackRect.width * 0.35 : trackRect.left + trackRect.width * 0.42;

    let closestIdx = 0;
    let minDistance = Number.POSITIVE_INFINITY;

    cardRefs.current.forEach((card, idx) => {
      if (!card || idx >= visibleSchools.length) return;
      const rect = card.getBoundingClientRect();
      const cardCenter = rect.left + rect.width / 2;
      const dist = Math.abs(cardCenter - referenceX);
      if (dist < minDistance) {
        minDistance = dist;
        closestIdx = idx;
      }
    });

    if (closestIdx !== activeIndex && visibleSchools[closestIdx]) {
      setActiveIndex(closestIdx);
      notifySchoolChange(visibleSchools[closestIdx].id);
    }
  };

  const handleSelectIndex = (nextIdx: number) => {
    const clamped = Math.max(0, Math.min(visibleSchools.length - 1, nextIdx));
    setActiveIndex(clamped);
    const targetSchool = visibleSchools[clamped];
    if (targetSchool) {
      notifySchoolChange(targetSchool.id);
    }
    scrollToCardIndex(clamped, true);
  };

  const handlePrev = () => {
    if (visibleSchools.length === 0) return;
    const prevIdx = activeIndex > 0 ? activeIndex - 1 : visibleSchools.length - 1;
    handleSelectIndex(prevIdx);
  };

  const handleNext = () => {
    if (visibleSchools.length === 0) return;
    const nextIdx = activeIndex < visibleSchools.length - 1 ? activeIndex + 1 : 0;
    handleSelectIndex(nextIdx);
  };

  const handleCategoryChange = (catId: CoreCategoryFilterId) => {
    setActiveCategory(catId);
    setActiveIndex(0);
    if (trackRef.current) {
      trackRef.current.scrollTo({ left: 0, behavior: 'smooth' });
    }
  };

  const handleOpenSchoolDetails = (school: LearningSchool, idx?: number) => {
    if (typeof idx === 'number') {
      setActiveIndex(idx);
    }
    setSelectedDetailSchool(school);
    setActivePathwayIndex(0);
    setActiveLevelIndex(0);
    notifySchoolChange(school.id);
    setViewMode('detail');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      handleNext();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      handlePrev();
    }
  };

  const totalVisible = visibleSchools.length;
  const safeActiveIndex = Math.min(activeIndex, Math.max(0, totalVisible - 1));
  const progressPercent = totalVisible > 0 ? ((safeActiveIndex + 1) / totalVisible) * 100 : 100;

  const wheelCooldownRef = useRef<number>(0);

  useEffect(() => {
    const el = trackRef.current;
    if (!el || viewMode !== 'slider') return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      if (Math.abs(e.deltaY) < 4) return;

      const goingRight = e.deltaY > 0;
      const canGoRight = safeActiveIndex < visibleSchools.length - 1;
      const canGoLeft = safeActiveIndex > 0;

      if ((goingRight && canGoRight) || (!goingRight && canGoLeft)) {
        e.preventDefault();
        const now = Date.now();
        if (now - wheelCooldownRef.current < 240) return;
        wheelCooldownRef.current = now;
        const targetIdx = goingRight ? safeActiveIndex + 1 : safeActiveIndex - 1;
        const clamped = Math.max(0, Math.min(visibleSchools.length - 1, targetIdx));
        setActiveIndex(clamped);
        const targetSchool = visibleSchools[clamped];
        if (targetSchool) {
          notifySchoolChange(targetSchool.id);
        }
        scrollToCardIndex(clamped, true);
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [viewMode, safeActiveIndex, visibleSchools, notifySchoolChange, scrollToCardIndex]);

  // Detail view helpers
  const detailSchoolIndex = LEARNING_SCHOOLS.findIndex((s) => s.id === selectedDetailSchool.id);
  const currentPathway = selectedDetailSchool.pathways[activePathwayIndex] || selectedDetailSchool.pathways[0];
  const currentLevel = currentPathway.levels[activeLevelIndex] || currentPathway.levels[0];

  const handlePrevDetailSchool = () => {
    const nextIdx = (detailSchoolIndex - 1 + LEARNING_SCHOOLS.length) % LEARNING_SCHOOLS.length;
    const nextSchool = LEARNING_SCHOOLS[nextIdx];
    setSelectedDetailSchool(nextSchool);
    setActivePathwayIndex(0);
    setActiveLevelIndex(0);
    notifySchoolChange(nextSchool.id);
  };

  const handleNextDetailSchool = () => {
    const nextIdx = (detailSchoolIndex + 1) % LEARNING_SCHOOLS.length;
    const nextSchool = LEARNING_SCHOOLS[nextIdx];
    setSelectedDetailSchool(nextSchool);
    setActivePathwayIndex(0);
    setActiveLevelIndex(0);
    notifySchoolChange(nextSchool.id);
  };

  return (
    <section
      id="learning-schools-section"
      aria-label="Explore Our Programs"
      className="scroll-mt-24 select-none"
      onKeyDown={viewMode === 'slider' ? handleKeyDown : undefined}
    >
      {viewMode === 'slider' ? (
        <div className="space-y-7 sm:space-y-9">
          {/* Editorial Section Header */}
          <div className="space-y-6">
            <div className="space-y-2">
              <p className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.22em] text-[#E11D48]">
                PROGRAMS
              </p>
              <h2 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-extrabold tracking-tight text-slate-900 dark:text-white leading-[1.1]">
                Explore Our Programs
              </h2>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-xl">
                Choose the path you want to build.
              </p>
            </div>

            {/* Category Tabs + Position Indicator & Text Controls */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-white/10 pb-0">
              {/* Filter Tabs */}
              <div
                role="tablist"
                aria-label="Program categories"
                className="flex items-center gap-6 sm:gap-8 overflow-x-auto no-scrollbar -mb-px"
              >
                {CATEGORY_TABS.map((tab) => {
                  const isActive = activeCategory === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => handleCategoryChange(tab.id)}
                      className={`relative pb-3.5 text-xs sm:text-sm whitespace-nowrap shrink-0 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E11D48] ${
                        isActive
                          ? 'font-bold text-slate-900 dark:text-white'
                          : 'font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {tab.label}
                      {isActive && (
                        <span className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[#E11D48] rounded-full" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Desktop / Tablet Progress Counter & Text Navigation */}
              <div className="hidden md:flex items-center gap-5 pb-3 shrink-0">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono tabular-nums tracking-wider text-slate-900 dark:text-white font-bold">
                    {String(safeActiveIndex + 1).padStart(2, '0')}{' '}
                    <span className="text-slate-400 dark:text-slate-500 font-normal">
                      / {String(totalVisible).padStart(2, '0')}
                    </span>
                  </span>
                  <div
                    className="w-24 lg:w-32 h-[2px] bg-slate-200 dark:bg-white/15 overflow-hidden rounded-full"
                    aria-hidden="true"
                  >
                    <div
                      className="h-full bg-[#E11D48] transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={handlePrev}
                    className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer py-1 focus:outline-none focus-visible:underline"
                  >
                    Previous
                  </button>
                  <span className="text-slate-300 dark:text-white/15" aria-hidden="true">
                    /
                  </span>
                  <button
                    type="button"
                    onClick={handleNext}
                    className="text-slate-700 dark:text-slate-200 hover:text-[#E11D48] dark:hover:text-[#E11D48] transition-colors cursor-pointer py-1 focus:outline-none focus-visible:underline"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Horizontal Bleed Carousel Track — No Outer Box */}
          <div className="relative -mx-4 sm:-mx-6 lg:-mx-8">
            <div
              ref={trackRef}
              data-custom-wheel-carousel="true"
              onScroll={handleTrackScroll}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUpOrLeave}
              onMouseLeave={handleMouseUpOrLeave}
              tabIndex={0}
              role="region"
              aria-label="Programs horizontal carousel"
              className="flex items-stretch gap-4 sm:gap-5 lg:gap-6 overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar touch-pan-x overscroll-x-contain overscroll-y-none [-webkit-overflow-scrolling:touch] px-4 sm:px-6 lg:px-8 py-1 focus:outline-none cursor-grab active:cursor-grabbing"
            >
              {visibleSchools.map((school, idx) => {
                const isActive = idx === safeActiveIndex;
                const imgFailed = failedImages[school.id];

                return (
                  <article
                    key={school.id}
                    ref={(el) => {
                      cardRefs.current[idx] = el;
                    }}
                    onClick={() => {
                      if (dragState.current.dragged) return;
                      if (!isActive && window.innerWidth >= 768) {
                        handleSelectIndex(idx);
                      } else {
                        handleOpenSchoolDetails(school, idx);
                      }
                    }}
                    className={`group relative shrink-0 snap-start md:snap-center overflow-hidden rounded-2xl transition-all duration-300 cursor-pointer border ${
                      isActive
                        ? 'w-[86vw] sm:w-[74vw] md:w-[540px] lg:w-[620px] xl:w-[660px] border-slate-200/80 dark:border-white/15 opacity-100'
                        : 'w-[86vw] sm:w-[74vw] md:w-[380px] lg:w-[400px] xl:w-[430px] border-slate-200/60 dark:border-white/10 md:opacity-80 hover:opacity-100'
                    } h-[370px] sm:h-[400px] lg:h-[430px] bg-slate-900`}
                  >
                    {/* Card Image */}
                    {!imgFailed ? (
                      <img
                        src={school.image}
                        alt={school.name}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setFailedImages((prev) => ({ ...prev, [school.id]: true }))
                        }
                        className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-700 ease-out group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950" />
                    )}

                    {/* Restrained Contrast Scrim for Text Legibility */}
                    <div
                      className="absolute inset-0 bg-gradient-to-t from-[#050811] via-[#050811]/65 to-transparent"
                      aria-hidden="true"
                    />

                    {/* Editorial Card Copy */}
                    <div className="relative z-10 h-full flex flex-col justify-end p-6 sm:p-8 lg:p-9">
                      <div className="max-w-lg space-y-2.5">
                        <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.22em] text-[#E11D48]">
                          {school.categoryLabel}
                        </p>

                        <h3 className="text-xl sm:text-2xl lg:text-[1.75rem] font-extrabold text-white tracking-tight leading-snug">
                          {school.name}
                        </h3>

                        <p className="text-xs sm:text-sm text-slate-200/90 leading-relaxed line-clamp-2">
                          {school.cardSummary}
                        </p>

                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenSchoolDetails(school, idx);
                            }}
                            className="inline-block text-xs sm:text-sm font-bold text-[#F43F5E] hover:text-white transition-colors cursor-pointer focus:outline-none focus-visible:underline"
                          >
                            Explore program
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          {/* Bottom Progress & Controls Bar */}
          <div className="flex items-center justify-between md:justify-center pt-1">
            {/* Mobile Counter + Progress Bar */}
            <div className="flex md:hidden items-center gap-3">
              <span className="text-xs font-mono tabular-nums tracking-wider text-slate-900 dark:text-white font-bold">
                {String(safeActiveIndex + 1).padStart(2, '0')}{' '}
                <span className="text-slate-400 dark:text-slate-500 font-normal">
                  / {String(totalVisible).padStart(2, '0')}
                </span>
              </span>
              <div
                className="w-28 sm:w-36 h-[2px] bg-slate-200 dark:bg-white/15 overflow-hidden rounded-full"
                aria-hidden="true"
              >
                <div
                  className="h-full bg-[#E11D48] transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Mobile Text Navigation */}
            <div className="flex md:hidden items-center gap-4 text-xs font-semibold">
              <button
                type="button"
                onClick={handlePrev}
                className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors py-1.5 px-1 cursor-pointer"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="text-slate-900 dark:text-white hover:text-[#E11D48] transition-colors py-1.5 px-1 cursor-pointer"
              >
                Next
              </button>
            </div>

            {/* Desktop Thin Segmented Progress Indicator */}
            <div className="hidden md:flex items-center gap-1.5" role="tablist" aria-label="Slide position">
              {visibleSchools.map((school, idx) => {
                const active = idx === safeActiveIndex;
                return (
                  <button
                    key={school.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    aria-label={`Show ${school.name}`}
                    onClick={() => handleSelectIndex(idx)}
                    className={`h-[2.5px] transition-all duration-300 rounded-full cursor-pointer ${
                      active
                        ? 'w-10 bg-[#E11D48]'
                        : 'w-6 bg-slate-300 dark:bg-white/15 hover:bg-slate-400 dark:hover:bg-white/30'
                    }`}
                  />
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* =========================================================
           MODE 2: EDITORIAL SCHOOL DETAIL VIEW (In-Place)
           ========================================================= */
        <div className="space-y-8 pt-2 border-t border-slate-200 dark:border-white/10">
          {/* Top Bar: Back + School Switcher (Text-Only, Zero Icons) */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-white/10">
            <button
              type="button"
              onClick={() => setViewMode('slider')}
              className="text-xs sm:text-sm font-bold text-[#E11D48] hover:underline cursor-pointer py-1"
            >
              Back to all programs
            </button>

            <div className="flex items-center gap-4 text-xs font-semibold">
              <button
                type="button"
                onClick={handlePrevDetailSchool}
                className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer py-1"
              >
                Previous
              </button>
              <span className="font-mono tabular-nums text-slate-900 dark:text-white font-bold">
                {String(detailSchoolIndex + 1).padStart(2, '0')}{' '}
                <span className="text-slate-400 dark:text-slate-500 font-normal">
                  / {String(LEARNING_SCHOOLS.length).padStart(2, '0')}
                </span>
              </span>
              <button
                type="button"
                onClick={handleNextDetailSchool}
                className="text-slate-700 dark:text-slate-200 hover:text-[#E11D48] transition-colors cursor-pointer py-1"
              >
                Next
              </button>
            </div>
          </div>

          {/* Editorial Hero Split for Selected School */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
              <div className="space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#E11D48]">
                  {selectedDetailSchool.categoryLabel}
                </p>
                <h3 className="text-2xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight">
                  {selectedDetailSchool.name}
                </h3>
                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                  {selectedDetailSchool.description}
                </p>
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Designed For
                  </p>
                  <p className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                    {selectedDetailSchool.whoItIsFor}
                  </p>
                </div>

                <Link
                  to="/register"
                  className="inline-flex items-center justify-center bg-[#E11D48] hover:bg-red-700 text-white font-bold px-6 py-3 rounded-xl transition-colors text-xs sm:text-sm whitespace-nowrap shrink-0"
                >
                  Enroll in this program
                </Link>
              </div>
            </div>

            <div className="lg:col-span-5 relative min-h-[240px] sm:min-h-[280px] rounded-2xl overflow-hidden bg-slate-900 border border-slate-200 dark:border-white/10">
              {!failedImages[selectedDetailSchool.id] && (
                <img
                  src={selectedDetailSchool.image}
                  alt={selectedDetailSchool.name}
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent" />
            </div>
          </div>

          {/* Pathway Tabs (if school has multiple pathways) */}
          {selectedDetailSchool.pathways.length > 1 && (
            <div className="border-b border-slate-200 dark:border-white/10 flex items-center gap-6 overflow-x-auto no-scrollbar">
              {selectedDetailSchool.pathways.map((pathway, idx) => {
                const isSelected = activePathwayIndex === idx;
                return (
                  <button
                    key={pathway.id}
                    type="button"
                    onClick={() => {
                      setActivePathwayIndex(idx);
                      setActiveLevelIndex(0);
                    }}
                    className={`relative pb-3 text-xs sm:text-sm whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                      isSelected
                        ? 'font-bold text-slate-900 dark:text-white'
                        : 'font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {pathway.title}
                    {isSelected && (
                      <span className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[#E11D48] rounded-full" />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Pathway Progression Breakdown */}
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#E11D48]">
                  CURRICULUM PATHWAY · {currentPathway.ageGroup}
                </p>
                <h4 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
                  {currentPathway.title}
                </h4>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-2xl">
                  {currentPathway.overview}
                </p>
              </div>
            </div>

            {/* Horizontal 4-Stage Selector */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 border-y border-slate-200 dark:border-white/10 py-5">
              {currentPathway.levels.map((lvl, idx) => {
                const isSelected = idx === activeLevelIndex;
                return (
                  <button
                    key={lvl.level}
                    type="button"
                    onClick={() => setActiveLevelIndex(idx)}
                    className="text-left group cursor-pointer focus:outline-none py-1"
                  >
                    <p
                      className={`text-[10px] font-mono tabular-nums uppercase tracking-widest ${
                        isSelected ? 'text-[#E11D48] font-bold' : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      0{lvl.level} · {lvl.name}
                    </p>
                    <p
                      className={`text-xs sm:text-sm mt-1 transition-colors ${
                        isSelected
                          ? 'font-bold text-slate-900 dark:text-white'
                          : 'font-medium text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white'
                      }`}
                    >
                      {lvl.focus}
                    </p>
                    <div
                      className={`mt-2.5 h-[2px] transition-all ${
                        isSelected ? 'w-12 bg-[#E11D48]' : 'w-full bg-slate-200 dark:bg-white/10'
                      }`}
                    />
                  </button>
                );
              })}
            </div>

            {/* Selected Stage Detail & Outcomes */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
              <div className="lg:col-span-5 space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-widest text-[#E11D48]">
                  Stage 0{currentLevel.level} Milestone Project
                </p>
                <p className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white">
                  {currentLevel.project}
                </p>
                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Focus area: {currentLevel.focus}. Learners complete this milestone with mentor feedback and portfolio review.
                </p>
              </div>

              <div className="lg:col-span-4 space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                  Tools & Technologies
                </p>
                <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                  {currentPathway.tools.join(' · ')}
                </p>
              </div>

              <div className="lg:col-span-3 space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                  Key Outcomes
                </p>
                <ul className="space-y-1.5 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
                  {currentPathway.outcomes.map((outcome) => (
                    <li key={outcome} className="leading-snug">
                      {outcome}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
