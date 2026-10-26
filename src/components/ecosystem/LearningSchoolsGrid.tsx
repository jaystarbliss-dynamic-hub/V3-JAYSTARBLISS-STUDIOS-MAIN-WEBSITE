import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, type PanInfo } from 'motion/react';
import {
  Code,
  Monitor,
  Palette,
  Video,
  Gamepad2,
  BookOpen,
  Globe,
  Cpu,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Award,
  Sparkles,
  Layers,
} from 'lucide-react';
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

export interface LearningSchool {
  id: string;
  name: string;
  shortName: string;
  tagline: string;
  icon: React.ElementType;
  accentText: string;
  accentBorder: string;
  accentGradient: string;
  description: string;
  whoItIsFor: string;
  pathways: Pathway[];
}

export const LEARNING_SCHOOLS: LearningSchool[] = [
  {
    id: 'tech',
    name: 'School of Technology & Programming',
    shortName: 'Technology & Programming',
    tagline: 'Software Engineering, Web, Python & AI Systems',
    icon: Code,
    accentText: 'text-indigo-400',
    accentBorder: 'border-indigo-500/40',
    accentGradient: 'from-indigo-600/25 via-indigo-900/10 to-slate-950',
    description:
      'From visual block logic for young beginners to full-stack web engineering, Python automation, and AI systems for future software architects.',
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
          { level: 2, name: 'Build', focus: 'JavaScript ES6+, DOM & APIs', project: 'Live Weather & FinTech Dashboard' },
          { level: 3, name: 'Apply', focus: 'React, TypeScript & State Architecture', project: 'Multi-Page E-Commerce Storefront' },
          { level: 4, name: 'Create', focus: 'Node.js, Databases & Auth Systems', project: 'Full-Stack SaaS Web Application' },
          { level: 5, name: 'Master', focus: 'System Design, Testing & Cloud Deployment', project: 'Production Capstone App & Live Defense' },
        ],
        tools: ['VS Code', 'HTML5/CSS3', 'JavaScript', 'TypeScript', 'React', 'Node.js', 'Git & GitHub'],
        outcomes: ['Build & deploy full-stack web apps', 'Publish a professional GitHub portfolio', 'Earn Full-Stack Developer Certification'],
      },
      {
        id: 'python-ai',
        title: 'Python, Data Science & AI Pathway',
        ageGroup: 'Ages 12–18+ & Adults',
        overview:
          'Learn the world’s fastest-growing language for automation, data analysis, machine learning, and generative AI applications.',
        levels: [
          { level: 1, name: 'Discover', focus: 'Python Syntax, Logic & Algorithms', project: 'Automated CLI Quiz & Logic Engine' },
          { level: 2, name: 'Build', focus: 'Data Structures, OOP & File Automation', project: 'Smart Expense & Report Automation Bot' },
          { level: 3, name: 'Apply', focus: 'Data Analysis with Pandas & Visualization', project: 'Real-World Dataset Insights Dashboard' },
          { level: 4, name: 'Create', focus: 'Machine Learning & LLM API Integration', project: 'Custom AI Study Tutor Assistant' },
          { level: 5, name: 'Master', focus: 'End-to-End AI Product Engineering', project: 'Deployed AI Web Service & Technical Paper' },
        ],
        tools: ['Python 3', 'Jupyter', 'Pandas', 'Scikit-Learn', 'FastAPI', 'Gemini / OpenAI APIs'],
        outcomes: ['Automate complex data tasks', 'Build custom AI-powered applications', 'Prepare for AP CS & university computing'],
      },
      {
        id: 'junior-coders',
        title: 'Junior Coders & Computational Logic',
        ageGroup: 'Ages 6–11',
        overview:
          'A joyful, high-visual introduction to coding logic, loops, variables, and interactive storytelling before transitioning to text code.',
        levels: [
          { level: 1, name: 'Discover', focus: 'Sequencing, Patterns & Visual Blocks', project: 'Animated Interactive Storybook' },
          { level: 2, name: 'Build', focus: 'Loops, Events & Conditional Logic', project: 'Multi-Level Maze & Arcade Game' },
          { level: 3, name: 'Apply', focus: 'Variables, Physics & Game Mechanics', project: 'Custom Platformer with Score Engine' },
          { level: 4, name: 'Create', focus: 'Bridge to Python & Web Basics', project: 'Hybrid Turtle Graphics & Mini Webpage' },
          { level: 5, name: 'Master', focus: 'Junior Innovation Showcase', project: 'Original Game Published for Peers' },
        ],
        tools: ['Scratch 3.0', 'Blockly', 'Code.org', 'Python Turtle', 'Canva Kids'],
        outcomes: ['Strong algorithmic thinking', 'Smooth transition to text programming', 'High creative confidence with technology'],
      },
    ],
  },
  {
    id: 'digital-literacy',
    name: 'School of Digital Literacy & Computing',
    shortName: 'Digital Literacy',
    tagline: 'Computer Mastery, Productivity, Cyber Safety & Cloud',
    icon: Monitor,
    accentText: 'text-sky-400',
    accentBorder: 'border-sky-500/40',
    accentGradient: 'from-sky-600/25 via-sky-900/10 to-slate-950',
    description:
      'Essential computing fluency for modern learners and professionals—covering operating systems, touch typing, cloud collaboration, spreadsheets, and cybersecurity.',
    whoItIsFor: 'Young Learners, Students, Professionals & Adults',
    pathways: [
      {
        id: 'comp-fluency',
        title: 'Complete Computer Mastery & Cloud Productivity',
        ageGroup: 'All Ages (Kids, Teens & Adults)',
        overview:
          'Go from hesitant computer user to rapid, organized power user across Windows/macOS, Google Workspace, Microsoft 365, and modern cloud tools.',
        levels: [
          { level: 1, name: 'Discover', focus: 'OS Navigation, File Systems & Touch Typing', project: 'Organized Cloud Digital Workspace' },
          { level: 2, name: 'Build', focus: 'Document Publishing & Executive Presentations', project: 'Formatted Research Report & Pitch Deck' },
          { level: 3, name: 'Apply', focus: 'Spreadsheets, Formulas & Data Charts', project: 'Dynamic Budget & Analytics Workbook' },
          { level: 4, name: 'Create', focus: 'Cloud Collaboration, Notion & AI Workflows', project: 'Automated Team Project Hub' },
          { level: 5, name: 'Master', focus: 'Cybersecurity, Privacy & Digital Citizenship', project: 'Executive Digital Fluency Portfolio' },
        ],
        tools: ['Google Workspace', 'Microsoft Office 365', 'Notion', 'Windows / macOS', 'Cloud Drive'],
        outcomes: ['45+ WPM accurate touch typing', 'Mastery of Excel/Sheets & presentation design', 'Safe, confident digital citizenship'],
      },
    ],
  },
  {
    id: 'creative-design',
    name: 'School of Creative Design & Visual Arts',
    shortName: 'Creative Design',
    tagline: 'Graphic Design, Brand Identity & UI/UX Product Design',
    icon: Palette,
    accentText: 'text-rose-400',
    accentBorder: 'border-rose-500/40',
    accentGradient: 'from-rose-600/25 via-rose-900/10 to-slate-950',
    description:
      'Transform visual imagination into studio-grade brand identities, digital illustrations, and interactive mobile/web UI/UX prototypes.',
    whoItIsFor: 'Creative Kids, Teens, Aspiring Designers & Entrepreneurs',
    pathways: [
      {
        id: 'ui-ux-brand',
        title: 'Visual Communication, Branding & UI/UX Pathway',
        ageGroup: 'Ages 10–18+ & Adults',
        overview:
          'Learn layout composition, color theory, typography, vector illustration, and interactive product design in Figma and Adobe Creative Cloud.',
        levels: [
          { level: 1, name: 'Discover', focus: 'Visual Principles, Color & Typography', project: 'Event Poster & Social Media Campaign' },
          { level: 2, name: 'Build', focus: 'Vector Illustration & Brand Identity', project: 'Complete Brand Logo & Style Guide' },
          { level: 3, name: 'Apply', focus: 'UI Components, Wireframing & Figma Auto-Layout', project: 'Mobile App Design System' },
          { level: 4, name: 'Create', focus: 'Interactive UX Prototyping & User Testing', project: 'Clickable High-Fidelity App Prototype' },
          { level: 5, name: 'Master', focus: 'Client Briefs & Design Portfolio Curation', project: 'Published Behance / Dribbble Case Study' },
        ],
        tools: ['Figma', 'Adobe Photoshop', 'Adobe Illustrator', 'Canva Pro', 'Behance'],
        outcomes: ['Design complete brand guidelines', 'Build interactive Figma app prototypes', 'Graduate with a studio design portfolio'],
      },
    ],
  },
  {
    id: 'media-animation',
    name: 'School of Video, Animation & Media',
    shortName: 'Video & Animation',
    tagline: '2D/3D Animation, Motion Graphics & Cinema Editing',
    icon: Video,
    accentText: 'text-amber-400',
    accentBorder: 'border-amber-500/40',
    accentGradient: 'from-amber-600/25 via-amber-900/10 to-slate-950',
    description:
      'Master storytelling through frame-by-frame animation, rigging, cinematic video editing, sound design, and visual effects.',
    whoItIsFor: 'Storytellers, Animators, Content Creators & Filmmakers',
    pathways: [
      {
        id: 'motion-cinema',
        title: 'Animation, Motion Graphics & Video Production',
        ageGroup: 'Ages 9–18+ & Adults',
        overview:
          'From storyboarding and 12 principles of animation to professional non-linear video editing, color grading, and motion graphics.',
        levels: [
          { level: 1, name: 'Discover', focus: 'Storyboarding, Timing & 2D Keyframes', project: 'Character Walk Cycle & Short Loop' },
          { level: 2, name: 'Build', focus: 'Video Editing, Cuts, Pacing & Audio Mix', project: 'Cinematic Mini-Documentary Edit' },
          { level: 3, name: 'Apply', focus: 'Character Rigging & Motion Typography', project: 'Animated Explainer Video' },
          { level: 4, name: 'Create', focus: 'Visual Effects, Compositing & Color Grading', project: 'Original Animated Short Film' },
          { level: 5, name: 'Master', focus: 'Showreel Production & Studio Directing', project: '60-Second Industry Demo Reel' },
        ],
        tools: ['Premiere Pro', 'After Effects', 'CapCut Pro', 'Blender 2D/Grease Pencil', 'DaVinci Resolve'],
        outcomes: ['Direct & edit broadcast-quality video', 'Create rigged 2D/motion animations', 'Publish a professional creator showreel'],
      },
    ],
  },
  {
    id: 'game-3d',
    name: 'School of 3D Worlds & Game Development',
    shortName: '3D & Game Dev',
    tagline: '3D Modeling, Roblox Lua, Unity & Interactive Worlds',
    icon: Gamepad2,
    accentText: 'text-purple-400',
    accentBorder: 'border-purple-500/40',
    accentGradient: 'from-purple-600/25 via-purple-900/10 to-slate-950',
    description:
      'Turn game players into game creators. Learn 3D modeling, texturing, lighting, physics engines, and game scripting.',
    whoItIsFor: 'Gamers, 3D Artists, Builders & Aspiring Game Engineers (Ages 8+)',
    pathways: [
      {
        id: 'game-creator',
        title: '3D Modeling & Game Engineering Pathway',
        ageGroup: 'Ages 8–18+',
        overview:
          'Design 3D environments and script playable multiplayer and single-player games using Blender, Roblox Studio (Lua), and Unity.',
        levels: [
          { level: 1, name: 'Discover', focus: '3D Space, Environment Design & Level Layout', project: 'Playable 3D Obstacle World' },
          { level: 2, name: 'Build', focus: 'Lua / C# Scripting, Triggers & Game Physics', project: 'Custom Adventure Game with Inventory' },
          { level: 3, name: 'Apply', focus: '3D Modeling, Low-Poly Assets & Materials in Blender', project: 'Custom 3D Character & Vehicle Pack' },
          { level: 4, name: 'Create', focus: 'Game UI, Soundscapes & Multiplayer Mechanics', project: 'Full Multi-Level Published Game' },
          { level: 5, name: 'Master', focus: 'Optimization, Monetization & Game Jam Release', project: 'Published Studio Game Title' },
        ],
        tools: ['Blender 3D', 'Roblox Studio (Lua)', 'Unity Engine', 'C# Basics'],
        outcomes: ['Model & texture original 3D assets', 'Write game logic in Lua & C#', 'Publish playable games for real players'],
      },
    ],
  },
  {
    id: 'academics',
    name: 'School of Core Academics & STEM Excellence',
    shortName: 'Academics & STEM',
    tagline: 'Mathematics, Sciences, English & School Curriculum Mastery',
    icon: BookOpen,
    accentText: 'text-emerald-400',
    accentBorder: 'border-emerald-500/40',
    accentGradient: 'from-emerald-600/25 via-emerald-900/10 to-slate-950',
    description:
      'Personalized 1-on-1 and small-group academic mentorship across British (IGCSE/A-Level), American, Nigerian, IB, and Canadian curricula.',
    whoItIsFor: 'Primary, Secondary & Pre-University Students (Ages 5–18)',
    pathways: [
      {
        id: 'stem-english',
        title: 'Mathematics, Sciences & Academic Mastery Pathway',
        ageGroup: 'Ages 5–18 (Grades 1–12)',
        overview:
          'Eliminate learning gaps and build top-percentile mastery in Mathematics, Further Math, Physics, Chemistry, Biology, and English Literacy.',
        levels: [
          { level: 1, name: 'Discover', focus: 'Diagnostic Assessment & Core Concept Clarity', project: 'Personalized Mastery Action Plan' },
          { level: 2, name: 'Build', focus: 'Guided Problem Solving & Analytical Drills', project: 'Topic-by-Topic Mastery Portfolio' },
          { level: 3, name: 'Apply', focus: 'Multi-Step Word Problems & Lab Reasoning', project: 'Applied STEM Investigation Report' },
          { level: 4, name: 'Create', focus: 'Timed Past-Paper Simulations & Error Analysis', project: '90%+ Mock Examination Benchmark' },
          { level: 5, name: 'Master', focus: 'Distinction Readiness & Advanced Olympiad Prep', project: 'Top-Grade School & Board Distinction' },
        ],
        tools: ['Interactive Whiteboards', 'Desmos / GeoGebra', 'PhET Simulations', 'Past Paper Banks'],
        outcomes: ['Measurable grade jump within 8 weeks', 'Deep conceptual confidence in Math & Science', 'Strong academic writing & critical reading'],
      },
    ],
  },
  {
    id: 'exams-languages',
    name: 'School of Global Exams & Languages',
    shortName: 'Exams & Languages',
    tagline: 'SAT, IELTS, IGCSE, WAEC, Coding Olympiads & Global Languages',
    icon: Globe,
    accentText: 'text-cyan-400',
    accentBorder: 'border-cyan-500/40',
    accentGradient: 'from-cyan-600/25 via-cyan-900/10 to-slate-950',
    description:
      'Targeted, high-accountability preparation for international admissions exams and global languages (French, English, Mandarin, Diction).',
    whoItIsFor: 'Test Takers, College Applicants & Global Communicators',
    pathways: [
      {
        id: 'global-prep',
        title: 'International Exam Prep & Language Fluency',
        ageGroup: 'Ages 7–18+ & Adults',
        overview:
          'Structured score-maximizing prep for SAT, IELTS, TOEFL, IGCSE, Checkpoint, WAEC/JAMB, alongside conversational and academic language fluency.',
        levels: [
          { level: 1, name: 'Discover', focus: 'Baseline Mock Test & Score Gap Audit', project: 'Targeted Section Score Roadmap' },
          { level: 2, name: 'Build', focus: 'High-Yield Concepts, Vocabulary & Quantitative Rules', project: 'Core Strategy Drill Book' },
          { level: 3, name: 'Apply', focus: 'Pacing Strategies & Section Timing Mastery', project: 'Timed Section Sprint Benchmarks' },
          { level: 4, name: 'Create', focus: 'Full-Length Proctored CBT Mock Exams', project: '4 Complete Proctored Exam Analytics' },
          { level: 5, name: 'Master', focus: 'Final Peak Review & Test-Day Execution', project: 'Target Percentile / Band Score Achievement' },
        ],
        tools: ['CBT Exam Simulator', 'Official CollegeBoard / Cambridge Banks', 'Speech & Diction Labs'],
        outcomes: ['1450+ SAT / Band 8.0+ IELTS strategies', 'A*/Distinction in IGCSE & WAEC', 'Confident spoken & written language fluency'],
      },
    ],
  },
  {
    id: 'robotics-future',
    name: 'School of AI, Robotics & Future Tech',
    shortName: 'AI & Future Tech',
    tagline: 'Generative AI, Prompt Engineering, IoT & Hardware Logic',
    icon: Cpu,
    accentText: 'text-emerald-300',
    accentBorder: 'border-emerald-400/40',
    accentGradient: 'from-teal-600/25 via-teal-900/10 to-slate-950',
    description:
      'Equip learners for the next decade with hands-on Generative AI engineering, virtual robotics, smart sensors, and ethical innovation.',
    whoItIsFor: 'Innovators, Future Engineers & Forward-Thinking Teens/Adults',
    pathways: [
      {
        id: 'future-innovator',
        title: 'Applied AI, Virtual Robotics & Smart Systems',
        ageGroup: 'Ages 10–18+ & Adults',
        overview:
          'Combine software intelligence with virtual hardware simulations, Arduino/Micro:bit logic, and modern AI workflows.',
        levels: [
          { level: 1, name: 'Discover', focus: 'How AI, Sensors & Embedded Systems Work', project: 'Virtual Smart Home Circuit Simulation' },
          { level: 2, name: 'Build', focus: 'Microcontroller Logic & Prompt Engineering', project: 'Autonomous Obstacle-Avoiding Robot Sim' },
          { level: 3, name: 'Apply', focus: 'Computer Vision & Voice/Text AI Agents', project: 'AI Vision Classifier Prototype' },
          { level: 4, name: 'Create', focus: 'Smart IoT + AI Problem-Solving Capstone', project: 'Community Impact Tech Innovation' },
          { level: 5, name: 'Master', focus: 'Pitch Deck, Demo Day & Ethics Defense', project: 'Innovation Showcase & Certification' },
        ],
        tools: ['Tinkercad Circuits', 'Micro:bit / Arduino Sim', 'Teachable Machine', 'LLM Workflows'],
        outcomes: ['Understand hardware + software integration', 'Build responsible AI-powered tools', 'Pitch original tech inventions confidently'],
      },
    ],
  },
];

interface LearningSchoolsGridProps {
  selectedSchoolId?: string;
  onSelectSchool?: (schoolId: string) => void;
  onSchoolChange?: (schoolId: string) => void;
}

export default function LearningSchoolsGrid({
  selectedSchoolId: controlledSchoolId,
  onSelectSchool,
  onSchoolChange,
}: LearningSchoolsGridProps = {}) {
  const notifySchoolChange = (schoolId: string) => {
    onSelectSchool?.(schoolId);
    onSchoolChange?.(schoolId);
  };
  // Active index in the 3D Costume Slider
  const [sliderIndex, setSliderIndex] = useState<number>(() => {
    if (controlledSchoolId) {
      const idx = LEARNING_SCHOOLS.findIndex((s) => s.id === controlledSchoolId);
      return idx >= 0 ? idx : 0;
    }
    return 0;
  });

  // View state: 'slider' (3D carousel selector) vs 'detail' (dedicated page-like school view)
  const [viewMode, setViewMode] = useState<'slider' | 'detail'>('slider');
  const [activePathwayIndex, setActivePathwayIndex] = useState<number>(0);
  const [activeLevelIndex, setActiveLevelIndex] = useState<number>(0);

  // Sync when parent passes a specific controlledSchoolId via URL query
  useEffect(() => {
    if (controlledSchoolId) {
      const idx = LEARNING_SCHOOLS.findIndex((s) => s.id === controlledSchoolId);
      if (idx >= 0) {
        setSliderIndex(idx);
        setActivePathwayIndex(0);
        setActiveLevelIndex(0);
      }
    }
  }, [controlledSchoolId]);

  const currentSchool = LEARNING_SCHOOLS[sliderIndex] || LEARNING_SCHOOLS[0];
  const currentPathway =
    currentSchool.pathways[activePathwayIndex] || currentSchool.pathways[0];
  const currentLevel =
    currentPathway.levels[activeLevelIndex] || currentPathway.levels[0];

  const handlePrevSlide = () => {
    const nextIdx = (sliderIndex - 1 + LEARNING_SCHOOLS.length) % LEARNING_SCHOOLS.length;
    setSliderIndex(nextIdx);
    setActivePathwayIndex(0);
    setActiveLevelIndex(0);
    notifySchoolChange(LEARNING_SCHOOLS[nextIdx].id);
  };

  const handleNextSlide = () => {
    const nextIdx = (sliderIndex + 1) % LEARNING_SCHOOLS.length;
    setSliderIndex(nextIdx);
    setActivePathwayIndex(0);
    setActiveLevelIndex(0);
    notifySchoolChange(LEARNING_SCHOOLS[nextIdx].id);
  };

  const handleOpenSchool = (index: number) => {
    setSliderIndex(index);
    setActivePathwayIndex(0);
    setActiveLevelIndex(0);
    notifySchoolChange(LEARNING_SCHOOLS[index].id);
    setViewMode('detail');
  };

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.x < -50) {
      handleNextSlide();
    } else if (info.offset.x > 50) {
      handlePrevSlide();
    }
  };

  // Relative circular distance for 3D carousel (-4 to +4)
  const getCircularOffset = (index: number) => {
    const total = LEARNING_SCHOOLS.length;
    let diff = index - sliderIndex;
    if (diff > total / 2) diff -= total;
    if (diff < -total / 2) diff += total;
    return diff;
  };

  return (
    <div id="learning-schools-section" className="scroll-mt-28">
      <AnimatePresence mode="wait">
        {viewMode === 'slider' ? (
          /* =========================================================
             MODE 1: 3D COSTUME-SELECT STYLE PROGRAM SLIDER
             ========================================================= */
          <motion.div
            key="schools-3d-slider"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.35 }}
            className="bg-slate-950 rounded-3xl p-6 sm:p-10 lg:p-12 border border-slate-800/90 shadow-2xl relative overflow-hidden select-none"
          >
            {/* Ambient background glow */}
            <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[42rem] h-64 bg-brand-red/10 rounded-full blur-3xl pointer-events-none" />

            {/* Header & Navigation Bar */}
            <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-brand-red mb-2">
                  8 Specialized Academies · Interactive 3D Selector
                </p>
                <h2 className="text-3xl sm:text-4xl font-extrabold text-white font-display tracking-tight">
                  Explore Our Programs
                </h2>
                <p className="text-slate-400 text-sm sm:text-base mt-2 max-w-xl">
                  Switch dynamically through our academies below, then click the active school to open its dedicated curriculum experience.
                </p>
              </div>

              {/* Left / Right Controls + Counter */}
              <div className="flex items-center gap-4 self-start md:self-auto">
                <span className="text-xs font-extrabold uppercase tracking-[0.2em] text-slate-400">
                  0{sliderIndex + 1} / 0{LEARNING_SCHOOLS.length}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePrevSlide}
                    aria-label="Previous school"
                    className="w-12 h-12 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white flex items-center justify-center transition-all cursor-pointer active:scale-95"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button
                    type="button"
                    onClick={handleNextSlide}
                    aria-label="Next school"
                    className="w-12 h-12 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-white flex items-center justify-center transition-all cursor-pointer active:scale-95"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </div>
              </div>
            </div>

            {/* 3D Costume-Select Stage */}
            <div
              className="relative h-[430px] sm:h-[410px] w-full flex items-center justify-center overflow-hidden my-2"
              style={{ perspective: '1400px' }}
            >
              {/* Left & Right Floating Stage Arrows on Desktop */}
              <button
                type="button"
                onClick={handlePrevSlide}
                aria-label="Slide Left"
                className="hidden lg:flex absolute left-4 z-30 w-14 h-14 rounded-2xl bg-slate-900/90 hover:bg-brand-red text-white border border-slate-700/80 items-center justify-center shadow-2xl transition-all cursor-pointer"
              >
                <ChevronLeft className="w-7 h-7" />
              </button>

              <button
                type="button"
                onClick={handleNextSlide}
                aria-label="Slide Right"
                className="hidden lg:flex absolute right-4 z-30 w-14 h-14 rounded-2xl bg-slate-900/90 hover:bg-brand-red text-white border border-slate-700/80 items-center justify-center shadow-2xl transition-all cursor-pointer"
              >
                <ChevronRight className="w-7 h-7" />
              </button>

              {LEARNING_SCHOOLS.map((school, idx) => {
                const offset = getCircularOffset(idx);
                const absOffset = Math.abs(offset);
                const isCenter = offset === 0;
                const Icon = school.icon;

                // Hide cards too far around the back of the 3D cylinder
                if (absOffset > 2) return null;

                const translateX = offset * 310;
                const translateZ = isCenter ? 0 : -170 * absOffset;
                const rotateY = offset * -28;
                const scale = isCenter ? 1 : absOffset === 1 ? 0.82 : 0.66;
                const opacity = isCenter ? 1 : absOffset === 1 ? 0.48 : 0.16;
                const zIndex = 20 - absOffset * 5;

                return (
                  <motion.div
                    key={school.id}
                    drag={isCenter ? 'x' : false}
                    dragConstraints={{ left: 0, right: 0 }}
                    onDragEnd={handleDragEnd}
                    onClick={() => {
                      if (isCenter) {
                        handleOpenSchool(idx);
                      } else {
                        setSliderIndex(idx);
                        notifySchoolChange(school.id);
                      }
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
                      stiffness: 250,
                      damping: 26,
                    }}
                    style={{
                      zIndex,
                      transformStyle: 'preserve-3d',
                    }}
                    className={`absolute w-full max-w-2xl rounded-3xl p-7 sm:p-9 bg-gradient-to-br ${school.accentGradient} bg-slate-900 border transition-colors ${
                      isCenter
                        ? `${school.accentBorder} shadow-2xl cursor-pointer`
                        : 'border-slate-800/80 cursor-pointer hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4 mb-5">
                      <div>
                        <p className={`text-xs font-extrabold uppercase tracking-[0.2em] ${school.accentText} mb-2`}>
                          Academy 0{idx + 1} · {school.pathways.length}{' '}
                          {school.pathways.length === 1 ? 'Structured Pathway' : 'Structured Pathways'}
                        </p>
                        <h3 className="text-2xl sm:text-3xl font-extrabold text-white font-display tracking-tight leading-tight">
                          {school.name}
                        </h3>
                      </div>

                      <div className="w-14 h-14 rounded-2xl bg-slate-950/90 border border-slate-800 flex items-center justify-center shrink-0 shadow-inner">
                        <Icon className={`w-7 h-7 ${school.accentText}`} />
                      </div>
                    </div>

                    <p className="text-slate-300 text-sm sm:text-base leading-relaxed mb-6 line-clamp-3">
                      {school.description}
                    </p>

                    <div className="pt-5 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          Designed For
                        </p>
                        <p className="text-xs sm:text-sm font-semibold text-white mt-0.5">
                          {school.whoItIsFor}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenSchool(idx);
                        }}
                        className="inline-flex items-center justify-center gap-2.5 bg-brand-red hover:bg-rose-600 text-white font-bold px-6 py-3.5 rounded-xl shadow-lg shadow-brand-red/25 transition-all text-sm shrink-0 cursor-pointer"
                      >
                        Enter School Details
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Bottom Quick-Jump Selector Strip */}
            <div className="relative z-10 mt-6 pt-6 border-t border-slate-800/80 flex items-center justify-start sm:justify-center gap-2 overflow-x-auto no-scrollbar pb-1">
              {LEARNING_SCHOOLS.map((school, idx) => {
                const active = idx === sliderIndex;
                return (
                  <button
                    key={school.id}
                    type="button"
                    onClick={() => {
                      setSliderIndex(idx);
                      notifySchoolChange(school.id);
                    }}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer border ${
                      active
                        ? 'bg-white text-slate-950 border-white shadow-md'
                        : 'bg-slate-900/90 text-slate-400 border-slate-800 hover:text-white hover:border-slate-700'
                    }`}
                  >
                    {school.shortName}
                  </button>
                );
              })}
            </div>
          </motion.div>
        ) : (
          /* =========================================================
             MODE 2: DEDICATED SCHOOL PAGE VIEW (Replaces Slider In-Place)
             ========================================================= */
          <motion.div
            key={`school-detail-${currentSchool.id}`}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.35 }}
            className="bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden"
          >
            {/* Top Navigation Bar Inside Dedicated School View */}
            <div className="bg-slate-950 text-white px-6 sm:px-10 py-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => setViewMode('slider')}
                className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4 text-brand-red" />
                Back to Programs 3D Slider
              </button>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handlePrevSlide}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-300 hover:text-white transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Prev School
                </button>
                <span className="text-xs font-extrabold uppercase tracking-widest text-slate-500">
                  0{sliderIndex + 1} / 0{LEARNING_SCHOOLS.length}
                </span>
                <button
                  type="button"
                  onClick={handleNextSlide}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-300 hover:text-white transition-colors cursor-pointer"
                >
                  Next School
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Dedicated School Hero Header */}
            <div className="bg-slate-900 text-white p-6 sm:p-10 border-b border-slate-800">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                    {React.createElement(currentSchool.icon, {
                      className: `w-7 h-7 ${currentSchool.accentText}`,
                    })}
                  </div>
                  <div>
                    <p className={`text-xs font-extrabold uppercase tracking-[0.2em] ${currentSchool.accentText} mb-1`}>
                      {currentSchool.tagline}
                    </p>
                    <h3 className="text-2xl sm:text-4xl font-extrabold font-display tracking-tight">
                      {currentSchool.name}
                    </h3>
                    <p className="text-slate-300 text-sm sm:text-base mt-2 max-w-3xl leading-relaxed">
                      {currentSchool.description}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  <Link
                    to="/register"
                    className="inline-flex items-center gap-2 bg-brand-red hover:bg-rose-600 text-white font-bold px-6 py-3.5 rounded-xl transition-all shadow-lg text-sm"
                  >
                    Enroll in This School <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>

              {/* Pathway Selector Tabs (if school has multiple pathways) */}
              {currentSchool.pathways.length > 1 && (
                <div className="mt-8 pt-6 border-t border-slate-800 flex flex-wrap items-center gap-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400 mr-2 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-brand-red" /> Select Specialization Track:
                  </span>
                  {currentSchool.pathways.map((pathway, idx) => (
                    <button
                      key={pathway.id}
                      type="button"
                      onClick={() => {
                        setActivePathwayIndex(idx);
                        setActiveLevelIndex(0);
                      }}
                      className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                        activePathwayIndex === idx
                          ? 'bg-brand-red text-white shadow-md'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                      }`}
                    >
                      {pathway.title}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Active Pathway Interactive Flow */}
            <div className="p-6 sm:p-10">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8 pb-6 border-b border-slate-100">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-brand-red mb-1">
                    Structured Curriculum Pathway · {currentPathway.ageGroup}
                  </p>
                  <h4 className="text-2xl font-extrabold text-slate-900 font-display">
                    {currentPathway.title}
                  </h4>
                  <p className="text-slate-600 text-sm sm:text-base mt-1 max-w-3xl">
                    {currentPathway.overview}
                  </p>
                </div>

                {/* Interactive Level Stepper Controls */}
                <div className="flex items-center gap-2 self-start md:self-auto">
                  <button
                    type="button"
                    onClick={() =>
                      setActiveLevelIndex(
                        (prev) =>
                          (prev - 1 + currentPathway.levels.length) %
                          currentPathway.levels.length
                      )
                    }
                    className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
                    aria-label="Previous Level"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500 px-2">
                    Level 0{currentLevel.level} of 0{currentPathway.levels.length}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setActiveLevelIndex(
                        (prev) => (prev + 1) % currentPathway.levels.length
                      )
                    }
                    className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
                    aria-label="Next Level"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* 5-Stage Interactive Selector Bar */}
              <div className="grid grid-cols-5 gap-2 sm:gap-3 mb-8">
                {currentPathway.levels.map((lvl, idx) => {
                  const isSelected = idx === activeLevelIndex;
                  return (
                    <button
                      key={lvl.level}
                      type="button"
                      onClick={() => setActiveLevelIndex(idx)}
                      className={`p-3 sm:p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-slate-900 text-white border-slate-900 shadow-lg'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-white'
                      }`}
                    >
                      <p
                        className={`text-[10px] font-extrabold uppercase tracking-widest ${
                          isSelected ? 'text-brand-red' : 'text-slate-400'
                        }`}
                      >
                        Stage 0{lvl.level}
                      </p>
                      <p className="text-xs sm:text-base font-extrabold font-display mt-0.5 truncate">
                        {lvl.name}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Focused Single-Stage Spotlight Card */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${currentPathway.id}-level-${currentLevel.level}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.22 }}
                  className="bg-slate-950 text-white rounded-2xl p-6 sm:p-8 border border-slate-800 mb-8"
                >
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
                    <div className="lg:col-span-7">
                      <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-brand-red mb-2">
                        Stage 0{currentLevel.level} Spotlight · {currentLevel.name}
                      </p>
                      <h5 className="text-xl sm:text-2xl font-extrabold font-display text-white mb-2">
                        {currentLevel.focus}
                      </h5>
                      <p className="text-slate-400 text-sm">
                        Students master this stage through live mentor-guided lab sessions before building and defending their milestone deliverable.
                      </p>
                    </div>

                    <div className="lg:col-span-5 bg-slate-900 rounded-xl p-5 border border-slate-800">
                      <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-400 flex items-center gap-1.5 mb-1.5">
                        <Sparkles className="w-3.5 h-3.5" /> Milestone Project Deliverable
                      </p>
                      <p className="text-base sm:text-lg font-extrabold text-white">
                        {currentLevel.project}
                      </p>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Tools & Verified Outcomes Footer */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-slate-50 rounded-2xl p-6 border border-slate-200/80">
                <div className="lg:col-span-5">
                  <h5 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-3">
                    Industry Tools & Platforms Used
                  </h5>
                  <div className="flex flex-wrap gap-2">
                    {currentPathway.tools.map((tool) => (
                      <span
                        key={tool}
                        className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="lg:col-span-7">
                  <h5 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-brand-red" /> Verified Graduation Outcomes
                  </h5>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {currentPathway.outcomes.map((outcome) => (
                      <div
                        key={outcome}
                        className="flex items-start gap-2 bg-white p-3 rounded-xl border border-slate-200/70"
                      >
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <span className="text-xs font-semibold text-slate-700 leading-snug">
                          {outcome}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
