import React, { useState, useRef, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';

export interface RoadmapMilestone {
  stage: number;
  stageName: string;
  levelTitle: string;
  duration: string;
  badge: string;
  badgeColor: string;
  description: string;
  topics: string[];
  capstoneProject: string;
  skillsUnlocked: string[];
  toolsUsed: string[];
}

export interface LearningTrack {
  id: string;
  title: string;
  category: string;
  categoryLabel: string;
  filterGroup: 'technology' | 'creative' | 'academics' | 'young';
  ageRange: string;
  icon?: React.FC<{ size?: number; className?: string }>;
  accentColor: string;
  lightBg: string;
  darkBg: string;
  cardSummary: string;
  image: string;
  summary: string;
  careerPath: string;
  prerequisites: string;
  milestones: RoadmapMilestone[];
}

export const ROADMAP_TRACKS: LearningTrack[] = [
  {
    id: 'web-dev',
    title: 'Full-Stack Web & Software Engineering',
    category: 'Technology & Coding',
    categoryLabel: 'TECHNOLOGY & CODING',
    filterGroup: 'technology',
    ageRange: 'Ages 10–18+ & Teens',
    accentColor: '#2563EB',
    lightBg: 'bg-blue-50 border-blue-200 text-blue-900',
    darkBg: 'dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-200',
    cardSummary: 'Progress from semantic HTML interfaces to full-stack React apps and cloud databases.',
    image: 'https://images.pexels.com/photos/5473298/pexels-photo-5473298.jpeg?auto=compress&cs=tinysrgb&w=1400',
    summary:
      'A comprehensive journey from the very first HTML markup to interactive React apps, server APIs, cloud databases, and production hosting.',
    careerPath: 'Junior Frontend/Full-Stack Engineer, Web Designer, Technical Founder',
    prerequisites: 'Basic keyboard navigation and enthusiasm to build.',
    milestones: [
      {
        stage: 1,
        stageName: 'Stage 1: Discover',
        levelTitle: 'Web Anatomy & Semantic HTML5',
        duration: '4–6 Weeks',
        badge: 'Web Explorer',
        badgeColor: 'bg-blue-500',
        description:
          'Understand how the Internet works, client-server models, semantic tags, forms, tables, and page hierarchy.',
        topics: [
          'How browsers render websites & HTTP basics',
          'Semantic HTML elements (header, nav, main, article, footer)',
          'Accessible markup, images, links, and forms',
          'Setting up VS Code, browser DevTools & Live Server',
        ],
        capstoneProject:
          'A personal multi-page biographical or hobby website with working navigation and contact form.',
        skillsUnlocked: ['Code editor fluency', 'Semantic structuring', 'Browser debugging'],
        toolsUsed: ['VS Code', 'Chrome DevTools', 'HTML5'],
      },
      {
        stage: 2,
        stageName: 'Stage 2: Build',
        levelTitle: 'Modern CSS3, Flexbox & Responsive Layouts',
        duration: '6–8 Weeks',
        badge: 'CSS Architect',
        badgeColor: 'bg-indigo-500',
        description:
          'Master the box model, Flexbox, CSS Grid, animations, media queries, and modern Tailwind CSS utility frameworks.',
        topics: [
          'CSS Box Model (margin, border, padding, content)',
          'Responsive design with Flexbox & CSS Grid',
          'Mobile-first layout strategies & media queries',
          'CSS variables, transitions, hover states, and Tailwind CSS',
        ],
        capstoneProject:
          'A responsive digital restaurant menu or product showcase landing page that adapts seamlessly to phones, tablets, and desktops.',
        skillsUnlocked: ['Responsive UI design', 'CSS Layout mastery', 'Tailwind CSS utility workflows'],
        toolsUsed: ['Tailwind CSS', 'Figma Inspect', 'CSS3'],
      },
      {
        stage: 3,
        stageName: 'Stage 3: Apply',
        levelTitle: 'JavaScript Programming & DOM Manipulation',
        duration: '8–10 Weeks',
        badge: 'Logic Engineer',
        badgeColor: 'bg-amber-500',
        description:
          'Bring websites to life with real logic, event listeners, functions, arrays, objects, local storage, and dynamic DOM rendering.',
        topics: [
          'Variables (const, let), types, conditionals, and loops',
          'Functions, arrow syntax, scope, and callbacks',
          'DOM event handling (click, submit, keydown)',
          'Array methods (.map, .filter, .reduce) & LocalStorage persistence',
        ],
        capstoneProject:
          'An interactive Task & Goal Tracker with local data persistence, search filtering, and dark mode toggles.',
        skillsUnlocked: ['Algorithmic thinking', 'DOM manipulation', 'State handling in vanilla JS'],
        toolsUsed: ['JavaScript ES6+', 'Browser Storage', 'JSON'],
      },
      {
        stage: 4,
        stageName: 'Stage 4: Create',
        levelTitle: 'React Component Architecture & Single Page Apps',
        duration: '8–10 Weeks',
        badge: 'React Developer',
        badgeColor: 'bg-cyan-500',
        description:
          'Modern frontend development with React: JSX, props, state hooks, component reusability, routing, and asynchronous API calls.',
        topics: [
          'Component-driven architecture and unidirectional data flow',
          'React Hooks (useState, useEffect, useMemo, custom hooks)',
          'Consuming REST APIs (async/await, fetch, loading/error states)',
          'Client-side routing with React Router',
        ],
        capstoneProject:
          'A live Movie Explorer & Streaming Dashboard that fetches real-time movie data, manages user favorites, and renders animated cards.',
        skillsUnlocked: ['Modern SPA architecture', 'API integration', 'Component lifecycle & hooks'],
        toolsUsed: ['React', 'Vite', 'REST APIs', 'TypeScript'],
      },
      {
        stage: 5,
        stageName: 'Stage 5: Master',
        levelTitle: 'Full-Stack Integration, Databases & Deployment',
        duration: '8–12 Weeks',
        badge: 'Full-Stack Craftsman',
        badgeColor: 'bg-emerald-500',
        description:
          'Connect frontend interfaces to backend servers (Node/Express or Firebase), user authentication, real-time database queries, and CI/CD hosting.',
        topics: [
          'Node.js & Express RESTful API endpoints',
          'Database schemas, CRUD operations, and Firestore security rules',
          'User authentication (Email/Password & Social OAuth)',
          'Git version control, GitHub collaboration, and Vercel cloud deployment',
        ],
        capstoneProject:
          'A complete full-stack SaaS application with user accounts, database persistence, responsive dashboard, and live production URL.',
        skillsUnlocked: ['Full-stack system design', 'Authentication security', 'Production cloud deployment'],
        toolsUsed: ['Node.js', 'Express', 'Firebase / Firestore', 'Git / GitHub', 'Vercel'],
      },
    ],
  },
  {
    id: 'python-ai',
    title: 'Python, Artificial Intelligence & Data Science',
    category: 'Technology & Coding',
    categoryLabel: 'ARTIFICIAL INTELLIGENCE',
    filterGroup: 'technology',
    ageRange: 'Ages 11–18+ & Advanced Students',
    accentColor: '#10B981',
    lightBg: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    darkBg: 'dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-200',
    cardSummary: 'Master Python programming, data visualization, machine learning models, and generative AI.',
    image: 'https://images.pexels.com/photos/8566472/pexels-photo-8566472.jpeg?auto=compress&cs=tinysrgb&w=1400',
    summary:
      'From fundamental syntax and computational problem solving to data analysis, machine learning models, and building generative AI applications.',
    careerPath: 'Data Scientist, AI Prompt Engineer, Python Developer, Machine Learning Specialist',
    prerequisites: 'Basic math and logical reasoning.',
    milestones: [
      {
        stage: 1,
        stageName: 'Stage 1: Discover',
        levelTitle: 'Python Foundations & Algorithmic Logic',
        duration: '4–6 Weeks',
        badge: 'Python Pioneer',
        badgeColor: 'bg-emerald-500',
        description:
          'Learn clean Python syntax, variables, user inputs, mathematical operators, and fundamental control flow.',
        topics: [
          'Python environment, IDLE, and Jupyter Notebook setup',
          'Data types: strings, integers, floats, booleans',
          'Conditional logic (if/elif/else) & truth tables',
          'Loops (for, while) and range-based iterations',
        ],
        capstoneProject:
          'Text-based Adventure Quest game and an automated Unit Conversion & Financial Math assistant.',
        skillsUnlocked: ['Syntax precision', 'Logical decision branching', 'Console application design'],
        toolsUsed: ['Python 3', 'Jupyter Notebooks', 'VS Code'],
      },
      {
        stage: 2,
        stageName: 'Stage 2: Build',
        levelTitle: 'Data Structures, Functions & File Automation',
        duration: '6–8 Weeks',
        badge: 'Automation Builder',
        badgeColor: 'bg-teal-500',
        description:
          'Organize data using Python lists, tuples, sets, and dictionaries, and write modular functions with file I/O.',
        topics: [
          'Functions, parameters, default values, and return statements',
          'Complex data structures: Lists, Dictionaries, Sets, Tuples',
          'Reading/writing CSV, JSON, and text files',
          'Error handling with try/except blocks and custom exceptions',
        ],
        capstoneProject:
          'An automated Student Gradebook & Report Card Generator that reads class CSVs, calculates statistics, and generates summaries.',
        skillsUnlocked: ['Data manipulation', 'Modular code design', 'Automated file processing'],
        toolsUsed: ['Python File I/O', 'CSV & JSON modules'],
      },
      {
        stage: 3,
        stageName: 'Stage 3: Apply',
        levelTitle: 'Data Analysis & Visual Dashboards',
        duration: '8–10 Weeks',
        badge: 'Data Analyst',
        badgeColor: 'bg-cyan-500',
        description:
          'Harness Python scientific libraries to clean messy datasets, compute statistical metrics, and create publication-ready charts.',
        topics: [
          'NumPy arrays, vector operations, and matrix math',
          'Pandas DataFrames, data cleaning, filtering, and grouping',
          'Data visualization with Matplotlib & Seaborn',
          'Exploratory Data Analysis (EDA) on real-world datasets',
        ],
        capstoneProject:
          'Global Climate & Tech Industry Trends Analysis dashboard with interactive graphs and key statistical insights.',
        skillsUnlocked: ['Data cleaning & aggregation', 'Statistical visualization', 'Trend forecasting'],
        toolsUsed: ['NumPy', 'Pandas', 'Matplotlib', 'Seaborn'],
      },
      {
        stage: 4,
        stageName: 'Stage 4: Create',
        levelTitle: 'Machine Learning Models & Predictive Analytics',
        duration: '8–10 Weeks',
        badge: 'ML Practitioner',
        badgeColor: 'bg-violet-500',
        description:
          'Understand core machine learning algorithms (regression, classification, clustering) using Scikit-Learn.',
        topics: [
          'Supervised vs. Unsupervised learning fundamentals',
          'Linear Regression & Logistic Regression classifiers',
          'Decision Trees, Random Forests & model evaluation metrics (Accuracy, Precision, Recall)',
          'Feature scaling, train-test splits, and overfitting prevention',
        ],
        capstoneProject:
          'A predictive House Price or Student Exam Score Estimator trained on historical data with precision reporting.',
        skillsUnlocked: ['Model training & tuning', 'Feature engineering', 'Prediction accuracy evaluation'],
        toolsUsed: ['Scikit-Learn', 'SciPy', 'Google Colab'],
      },
      {
        stage: 5,
        stageName: 'Stage 5: Master',
        levelTitle: 'Generative AI, Large Language Models & AI Bots',
        duration: '8–12 Weeks',
        badge: 'AI Architect',
        badgeColor: 'bg-brand-red',
        description:
          'Build modern AI applications integrating LLM APIs (Gemini, OpenAI), prompt engineering, embeddings, and web deployment.',
        topics: [
          'Working with Gemini API & LLM parameter tuning',
          'Prompt engineering, system instructions, and JSON mode outputs',
          'Retrieval-Augmented Generation (RAG) concepts and vector search',
          'Building full interactive AI web apps with Streamlit or FastAPI',
        ],
        capstoneProject:
          'An AI-powered Study Tutor & Homework Assistant with smart document analysis and conversational memory.',
        skillsUnlocked: ['LLM integration', 'Prompt engineering', 'AI application deployment'],
        toolsUsed: ['Gemini API', 'Streamlit', 'FastAPI', 'LangChain basics'],
      },
    ],
  },
  {
    id: 'creative-design',
    title: 'Creative Design, UI/UX & Visual Branding',
    category: 'Creative Arts & Media',
    categoryLabel: 'CREATIVE DESIGN',
    filterGroup: 'creative',
    ageRange: 'Ages 8–18+ & Aspiring Designers',
    accentColor: '#EC4899',
    lightBg: 'bg-pink-50 border-pink-200 text-pink-900',
    darkBg: 'dark:bg-pink-950/30 dark:border-pink-800 dark:text-pink-200',
    cardSummary: 'Craft brand identity systems, vector illustrations, and interactive Figma UI prototypes.',
    image: 'https://images.pexels.com/photos/7988079/pexels-photo-7988079.jpeg?auto=compress&cs=tinysrgb&w=1400',
    summary:
      'Develop visual composition, color theory, brand identity guidelines, vector illustration in Figma, and interactive mobile/web UI/UX prototypes.',
    careerPath: 'UI/UX Product Designer, Graphic Designer, Brand Strategist, Creative Director',
    prerequisites: 'Creativity, curiosity, and an eye for aesthetics.',
    milestones: [
      {
        stage: 1,
        stageName: 'Stage 1: Discover',
        levelTitle: 'Visual Foundations & Typography Principles',
        duration: '4–6 Weeks',
        badge: 'Visual Explorer',
        badgeColor: 'bg-pink-500',
        description:
          'Understand the fundamentals of graphic design: color harmonies, font pairings, visual hierarchy, and negative space.',
        topics: [
          'Color psychology, 60-30-10 rule, and contrast ratios',
          'Typography anatomy: Serif vs. Sans-serif, tracking, leading',
          'Alignment, proximity, balance, and visual focal points',
          'Introduction to Canva & beginner Figma canvas controls',
        ],
        capstoneProject:
          'A set of 3 curated typographic quote posters and social media banner templates with high aesthetic standards.',
        skillsUnlocked: ['Color harmony selection', 'Typography pairing', 'Visual balance'],
        toolsUsed: ['Canva', 'Figma', 'Coolors.co', 'Google Fonts'],
      },
      {
        stage: 2,
        stageName: 'Stage 2: Build',
        levelTitle: 'Vector Illustration & Icon Systems',
        duration: '6–8 Weeks',
        badge: 'Vector Artist',
        badgeColor: 'bg-rose-500',
        description:
          'Master the Pen tool, Boolean shape operations, gradients, masking, and creating clean custom icon sets in Figma.',
        topics: [
          'Vector Bézier curves and the Pen tool mastery',
          'Boolean operations (Union, Subtract, Intersect, Exclude)',
          'Layer masks, drop shadows, and subtle inner glow effects',
          'Designing consistent 24px icon sets with unified stroke weights',
        ],
        capstoneProject:
          'A custom themed 12-icon vector icon pack (e.g. Space Odyssey, Gaming, or Nature) exported in SVG and PNG formats.',
        skillsUnlocked: ['Vector shape crafting', 'Iconography systems', 'Asset exporting'],
        toolsUsed: ['Figma Vector Tools', 'SVG Optimizers'],
      },
      {
        stage: 3,
        stageName: 'Stage 3: Apply',
        levelTitle: 'Brand Identity Systems & Style Guides',
        duration: '8–10 Weeks',
        badge: 'Brand Strategist',
        badgeColor: 'bg-purple-500',
        description:
          'Construct cohesive branding systems: logo design, primary & secondary color palettes, stationery mockups, and brand guidelines.',
        topics: [
          'Logo mark conceptualization, sketching, and digital vectorization',
          'Brand voice, brand pillars, and mood board curation',
          'Packaging, business card, and merchandise mockup rendering',
          'Compiling a comprehensive Brand Style Guide PDF',
        ],
        capstoneProject:
          'A complete Brand Identity Package for an innovative startup (logo, typography guide, color system, and business collateral).',
        skillsUnlocked: ['Brand architecture', 'Mockup generation', 'Professional style guide creation'],
        toolsUsed: ['Figma', 'Photoshop Mockups', 'Canva Pro'],
      },
      {
        stage: 4,
        stageName: 'Stage 4: Create',
        levelTitle: 'UI/UX Mobile App & Web Design',
        duration: '8–10 Weeks',
        badge: 'Product Designer',
        badgeColor: 'bg-fuchsia-500',
        description:
          'Design mobile and desktop user interfaces from wireframes and user personas to high-fidelity clickable Figma prototypes.',
        topics: [
          'User research, empathy maps, and user journey mapping',
          'Low-fidelity wireframing & information architecture',
          'Auto-Layout, components, variants, and Figma design tokens',
          'High-fidelity screen layouts adhering to iOS/Material design standards',
        ],
        capstoneProject:
          'A 10-screen high-fidelity mobile banking or fitness app UI complete with onboarding, dashboard, and interactive states.',
        skillsUnlocked: ['Wireframing & UX research', 'Figma Auto-Layout mastery', 'Mobile/Web interface design'],
        toolsUsed: ['Figma Auto-Layout', 'Design Systems', 'Whimsical'],
      },
      {
        stage: 5,
        stageName: 'Stage 5: Master',
        levelTitle: 'Interactive Micro-Animations & Portfolio Case Study',
        duration: '8–12 Weeks',
        badge: 'Senior UI/UX Master',
        badgeColor: 'bg-brand-red',
        description:
          'Add advanced smart-animate micro-interactions, conduct usability testing, and write an in-depth Behance/Dribbble case study.',
        topics: [
          'Figma Smart Animate, interactive components & delay transitions',
          'Usability testing protocols and UX heuristic evaluations',
          'Design-to-code handoff documentation for developers',
          'Writing comprehensive Behance & Notion UX case studies',
        ],
        capstoneProject:
          'A published UX Case Study showcasing research, iterations, interactive prototype video, and usability metrics.',
        skillsUnlocked: ['Interactive prototyping', 'Design handoff', 'Portfolio presentation'],
        toolsUsed: ['Figma Smart Animate', 'Notion', 'Behance / Dribbble'],
      },
    ],
  },
  {
    id: 'music-arts',
    title: 'Music Theory, Keyboard & Piano Performance',
    category: 'Music & Performing Arts',
    categoryLabel: 'MUSIC & PERFORMING ARTS',
    filterGroup: 'creative',
    ageRange: 'Ages 5–18+ (All Skill Levels)',
    accentColor: '#8B5CF6',
    lightBg: 'bg-purple-50 border-purple-200 text-purple-900',
    darkBg: 'dark:bg-purple-950/30 dark:border-purple-800 dark:text-purple-200',
    cardSummary: 'Master sight-reading, ear training, dual-hand piano performance, and original composition.',
    image: 'https://images.pexels.com/photos/164743/pexels-photo-164743.jpeg?auto=compress&cs=tinysrgb&w=1400',
    summary:
      'Progressive musical training covering keyboard orientation, note reading, ear training, rhythm dynamics, dual-hand performance, and music composition.',
    careerPath: 'Pianist, Accompanist, Music Producer, Sound Designer, Certified Music Scholar',
    prerequisites: 'Access to a keyboard/piano (acoustic or digital).',
    milestones: [
      {
        stage: 1,
        stageName: 'Stage 1: Discover',
        levelTitle: 'Keyboard Geography & Rhythm Fundamentals',
        duration: '4–6 Weeks',
        badge: 'Rhythm Explorer',
        badgeColor: 'bg-purple-500',
        description:
          'Get familiar with white and black key groupings, finger numbering (1–5), proper posture, and quarter/half/whole note values.',
        topics: [
          'Keyboard layout (C-D-E-F-G-A-B) and middle C orientation',
          'Hand posture, curved fingers, and arm relaxation',
          'Rhythm counting: 4/4 time signature, bar lines, and tempo',
          'Right hand finger exercises and five-finger patterns',
        ],
        capstoneProject:
          'Performance of 3 foundational single-hand melody pieces with steady pulse and correct finger numbers.',
        skillsUnlocked: ['Keyboard navigation', 'Finger agility', 'Metronome rhythm timing'],
        toolsUsed: ['Keyboard/Piano', 'Metronome', 'Beginner Method Books'],
      },
      {
        stage: 2,
        stageName: 'Stage 2: Build',
        levelTitle: 'Staff Notation, Treble & Bass Clef Reading',
        duration: '6–8 Weeks',
        badge: 'Sight Reader',
        badgeColor: 'bg-violet-500',
        description:
          'Read the grand staff fluently: treble clef for right hand, bass clef for left hand, key signatures, and dynamic marks (p, f, mf).',
        topics: [
          'Grand Staff notes (Every Good Boy Does Fine, FACE, All Cows Eat Grass)',
          'Left-hand bass clef foundational exercises',
          'Accidentals: Sharps (#), Flats (b), and Naturals',
          'Dynamics (piano, forte, crescendo, decrescendo) and articulation (legato, staccato)',
        ],
        capstoneProject:
          'Sight-reading and performing 2 standard classical or contemporary pieces from printed sheet music.',
        skillsUnlocked: ['Grand staff sight-reading', 'Dynamic expression', 'Dual-hand note literacy'],
        toolsUsed: ['Sheet Music Library', 'Ear Training Apps', 'Flashcards'],
      },
      {
        stage: 3,
        stageName: 'Stage 3: Apply',
        levelTitle: 'Two-Hand Coordination & Triad Chords',
        duration: '8–10 Weeks',
        badge: 'Harmonic Player',
        badgeColor: 'bg-indigo-500',
        description:
          'Coordinate both hands simultaneously: playing melody in the right hand while executing chords or basslines in the left hand.',
        topics: [
          'Major and minor triads (root, third, fifth) and inversions',
          'Left-hand accompaniment patterns (Alberti bass, broken chords)',
          'Dual-hand independence and contrapuntal exercises',
          'Pedaling technique (damper/sustain pedal synchronization)',
        ],
        capstoneProject:
          'Flawless recital performance of a multi-section piece (e.g. Beethoven’s Ode to Joy or modern hymn/ballad) with two hands.',
        skillsUnlocked: ['Bimanual coordination', 'Chord vocabulary', 'Pedal technique'],
        toolsUsed: ['Sustain Pedal', 'Acoustic/Digital Piano', 'Repertoire Anthologies'],
      },
      {
        stage: 4,
        stageName: 'Stage 4: Create',
        levelTitle: 'Chord Progressions, Lead Sheets & Improvisation',
        duration: '8–10 Weeks',
        badge: 'Creative Improviser',
        badgeColor: 'bg-fuchsia-500',
        description:
          'Play popular songs by ear and from lead sheets (I–IV–V–vi progressions), harmonize melodies, and improvise using pentatonic scales.',
        topics: [
          'Common harmonic progressions (I-V-vi-IV and ii-V-I)',
          'Major and minor pentatonic & blues scale improvisation',
          'Interpreting lead sheets with chord symbols',
          'Arranging pop, gospel, jazz, and cinematic themes',
        ],
        capstoneProject:
          'Arranging and recording an original 2-minute piano rendition of a favorite song with custom intro, verse, and outro.',
        skillsUnlocked: ['Ear training & harmonization', 'Lead sheet fluency', 'Spontaneous improvisation'],
        toolsUsed: ['Lead Sheets', 'Audio Recorder', 'DAW (GarageBand/BandLab)'],
      },
      {
        stage: 5,
        stageName: 'Stage 5: Master',
        levelTitle: 'Virtuoso Repertoire, Exam Prep & Composition',
        duration: '8–12 Weeks',
        badge: 'Concert Virtuoso',
        badgeColor: 'bg-brand-red',
        description:
          'Prepare for international music board examinations (ABRSM / Trinity / MUSON Grade 1–5+) or compose original polyphonic pieces.',
        topics: [
          'Advanced classical repertoire (Bach, Mozart, Chopin, Clementi Sonatinas)',
          'Scales, arpeggios, and technical velocity drills at speed',
          'Aural tests, sight-singing, and music theory analysis',
          'Stage presence, recital confidence, and performance etiquette',
        ],
        capstoneProject:
          'Live Studio Showcase Recital and submission-ready ABRSM / Trinity exam repertoire portfolio.',
        skillsUnlocked: ['Stage recital mastery', 'Formal exam certification', 'Compositional harmony'],
        toolsUsed: ['ABRSM / Trinity Exam Syllabi', 'Performance Hall/Studio'],
      },
    ],
  },
  {
    id: 'chess-strategy',
    title: 'Cognitive Chess, Logic & Strategic Thinking',
    category: 'Strategy & Mental Games',
    categoryLabel: 'STRATEGY & LOGIC',
    filterGroup: 'academics',
    ageRange: 'Ages 6–18+ (Beginner to Rated Player)',
    accentColor: '#D97706',
    lightBg: 'bg-amber-50 border-amber-200 text-amber-900',
    darkBg: 'dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-200',
    cardSummary: 'Sharpen pattern recognition, deep tactical calculation, and tournament endgame strategy.',
    image: 'https://images.pexels.com/photos/260024/pexels-photo-260024.jpeg?auto=compress&cs=tinysrgb&w=1400',
    summary:
      'Develop supreme mental concentration, pattern recognition, calculation depth, tactical motifs, and tournament endgame strategies.',
    careerPath: 'Competitive Chess Player, Strategic Analyst, Executive Decision Maker, Game Theorist',
    prerequisites: 'Interest in puzzles and cognitive strategy.',
    milestones: [
      {
        stage: 1,
        stageName: 'Stage 1: Discover',
        levelTitle: 'Board Geometry & Piece Movements',
        duration: '4–6 Weeks',
        badge: 'Board Explorer',
        badgeColor: 'bg-amber-500',
        description:
          'Learn the algebraic notation, special moves (Castling, En Passant, Pawn Promotion), and the golden rules of opening play.',
        topics: [
          'The 64 squares: Ranks, files, diagonals, and coordinates',
          'Piece values and movement mechanics (Rook, Knight, Bishop, Queen, King, Pawn)',
          'Special moves: King-side & Queen-side castling, En Passant',
          'Check, Checkmate, and Stalemate differentiation',
        ],
        capstoneProject:
          'Solve 20 fundamental Mate-in-1 puzzle challenges and demonstrate all piece movements in a live drill.',
        skillsUnlocked: ['Board visualization', 'Coordinate notation', 'Rule precision'],
        toolsUsed: ['Lichess.org', 'Physical Chessboard', 'Puzzle Tactics Vault'],
      },
      {
        stage: 2,
        stageName: 'Stage 2: Build',
        levelTitle: 'Tactical Weapons & Combinations',
        duration: '6–8 Weeks',
        badge: 'Tactical Striker',
        badgeColor: 'bg-orange-500',
        description:
          'Master the core tactical motifs that win material: forks, pins, skewers, discovered attacks, and removing the defender.',
        topics: [
          'Knight forks and royal Queen-King double attacks',
          'Absolute and relative pins along files and diagonals',
          'Skewers and x-ray attacks',
          'Discovered checks and double checks',
        ],
        capstoneProject: 'Achieve 85%+ accuracy on a timed 50-puzzle Tactical Motifs Exam.',
        skillsUnlocked: ['Pattern recognition', 'Tactical calculation', 'Material evaluation'],
        toolsUsed: ['Chess.com Tactics', 'Lichess Study', 'Tactics Trainer'],
      },
      {
        stage: 3,
        stageName: 'Stage 3: Apply',
        levelTitle: 'Opening Principles & Center Control',
        duration: '8–10 Weeks',
        badge: 'Strategic Commander',
        badgeColor: 'bg-yellow-600',
        description:
          'Build a solid opening repertoire for White and Black (Italian Game, Queen’s Gambit, Sicilian Defense basics) and piece development.',
        topics: [
          'The 3 Opening Golden Rules (Control center, develop minor pieces, castle early)',
          'White Opening Repertoire: Italian Game, Ruy Lopez, London System',
          'Black Defense Repertoire: e5 responses, French Defense & Sicilian basics',
          'Identifying and punishing premature Queen excursions and opening blunders',
        ],
        capstoneProject:
          'Annotate 3 complete personal games, identifying opening inaccuracies and development tempos.',
        skillsUnlocked: ['Opening repertoire mastery', 'Center control logic', 'Game annotation'],
        toolsUsed: ['Opening Book Explorer', 'Stockfish Engine Analysis'],
      },
      {
        stage: 4,
        stageName: 'Stage 4: Create',
        levelTitle: 'Endgame Mastery & King Activity',
        duration: '8–10 Weeks',
        badge: 'Endgame Specialist',
        badgeColor: 'bg-red-500',
        description:
          'Convert winning positions in the endgame: King and Pawn endings, opposition, key squares, Lucena & Philidor positions.',
        topics: [
          'Basic checkmates: Queen & King, Two Rooks, Single Rook checkmate',
          'The Rule of the Square in Pawn endgames and King opposition',
          'Rook Endgames: Lucena Position (bridge building) and Philidor Defense',
          'Pawn breakthroughs and creating passed pawns',
        ],
        capstoneProject:
          'Demonstrate live checkmate conversions against computer engines under time pressure (10+0 and 5+3 clock).',
        skillsUnlocked: ['Endgame precision', 'Opposition calculation', 'Conversion under time constraints'],
        toolsUsed: ['Endgame Tablebases', 'Clock Simulation'],
      },
      {
        stage: 5,
        stageName: 'Stage 5: Master',
        levelTitle: 'Deep Calculation, Candidate Moves & Tournament Play',
        duration: '8–12 Weeks',
        badge: 'Tournament Master',
        badgeColor: 'bg-brand-red',
        description:
          'Think like a Master: Kotov’s calculation trees, candidate moves, positional pawn structures, time management, and tournament psychology.',
        topics: [
          'Candidate moves methodology and deep calculation trees',
          'Pawn structures (isolated pawns, doubled pawns, backward pawns)',
          'Prophylaxis (anticipating opponent threats before they happen)',
          'Tournament clock psychology, touch-move discipline, and rating advancement',
        ],
        capstoneProject:
          'Compete in an organized Jaystarbliss Rapid/Blitz Tournament with a verified performance rating above 1200+ Elo.',
        skillsUnlocked: ['Positional intuition', 'Prophylactic thinking', 'Competitive tournament readiness'],
        toolsUsed: ['FIDE Rating Standards', 'Competitive Swiss Pairings'],
      },
    ],
  },
  {
    id: 'academic-excellence',
    title: 'Academic Excellence & Exam Masterclass',
    category: 'Academics & Tutoring',
    categoryLabel: 'ACADEMICS & STEM',
    filterGroup: 'academics',
    ageRange: 'Primary, JSS1–3, SSS1–3, WAEC / IGCSE / JAMB / SAT',
    accentColor: '#DC2626',
    lightBg: 'bg-red-50 border-red-200 text-red-900',
    darkBg: 'dark:bg-red-950/30 dark:border-red-800 dark:text-red-200',
    cardSummary: 'Targeted diagnostic tutoring in Mathematics, Sciences, and English for top-percentile exam distinction.',
    image: 'https://images.pexels.com/photos/5905709/pexels-photo-5905709.jpeg?auto=compress&cs=tinysrgb&w=1400',
    summary:
      'Targeted diagnostic tutoring in Mathematics, Physics, Chemistry, Biology, and English with past-question mastery and speed drills.',
    careerPath: 'Medicine, Engineering, Law, Computer Science, Top University Scholar',
    prerequisites: 'Current school syllabus curriculum level.',
    milestones: [
      {
        stage: 1,
        stageName: 'Stage 1: Discover',
        levelTitle: 'Diagnostic Assessment & Knowledge Gap Mapping',
        duration: '2–3 Weeks',
        badge: 'Curriculum Scholar',
        badgeColor: 'bg-red-500',
        description:
          'Comprehensive diagnostic testing across core subjects to isolate misconceptions, weak foundational topics, and learning styles.',
        topics: [
          'Comprehensive diagnostic test across selected subjects',
          'Isolating foundational arithmetic/algebra and grammatical bottlenecks',
          'Constructing a personalized weekly revision roadmap',
          'Active recall and spaced repetition study habit orientation',
        ],
        capstoneProject: 'Personalized Diagnostic Analysis Report and 90-Day Target Score Roadmap.',
        skillsUnlocked: ['Self-awareness of academic gaps', 'Targeted study planning', 'Active recall methods'],
        toolsUsed: ['Jaystarbliss Diagnostic Test Suite', 'Syllabus Breakdown Matrices'],
      },
      {
        stage: 2,
        stageName: 'Stage 2: Build',
        levelTitle: 'Concept Mastery & Formula Vault',
        duration: '6–8 Weeks',
        badge: 'Formula Master',
        badgeColor: 'bg-amber-600',
        description:
          'Master step-by-step topic fundamentals without rote memorization: algebraic derivation, chemical equations, physical laws, and grammar mechanics.',
        topics: [
          'Mathematics: Quadratic equations, trigonometry, calculus, and statistics',
          'Sciences: Mechanics, stoichiometry, electricity, genetics, and cell biology',
          'English: Essay structure, comprehension passage analysis, summary writing, and lexis',
          'Creating topic summary cheat sheets and formula flashcards',
        ],
        capstoneProject:
          'Complete a 100-Question Concept Mastery Benchmark with score exceeding 80%+ across all modules.',
        skillsUnlocked: ['Conceptual clarity', 'Equation derivation', 'Rigorous analytical problem solving'],
        toolsUsed: ['Curriculum Question Banks', 'Digital Flashcards'],
      },
      {
        stage: 3,
        stageName: 'Stage 3: Apply',
        levelTitle: 'Structured Past Question Dissection',
        duration: '6–8 Weeks',
        badge: 'Exam Strategist',
        badgeColor: 'bg-blue-600',
        description:
          'Analyze 10+ years of official WAEC, IGCSE, JAMB, or BECE past questions to uncover repeating question patterns and examiner marking schemes.',
        topics: [
          'Deconstructing past question structures by exam boards (WAEC / NECO / IGCSE / JAMB)',
          'Understanding mark allocation rubrics (Working marks vs. Accuracy marks)',
          'Common traps, distractor options in multiple choice, and elimination tactics',
          'Written theory response formatting to maximize points',
        ],
        capstoneProject:
          'Solve and annotate 5 full past examination papers under open-book review with full examiner rubric marking.',
        skillsUnlocked: ['Examiner marking scheme fluency', 'Error pattern avoidance', 'Multiple-choice elimination'],
        toolsUsed: ['Official Past Question Vaults', 'Marking Scheme Rubrics'],
      },
      {
        stage: 4,
        stageName: 'Stage 4: Create',
        levelTitle: 'Timed Speed Drills & High-Pressure Simulation',
        duration: '4–6 Weeks',
        badge: 'High-Speed Achiever',
        badgeColor: 'bg-emerald-600',
        description:
          'Build exam stamina and velocity with strictly timed mock CBT (Computer-Based Test) exams and handwritten essay speed trials.',
        topics: [
          'JAMB CBT speed drills: Answering 60 questions in 45 minutes with high accuracy',
          'Maths & Science calculation speed hacks and mental arithmetic shortcuts',
          'Essay writing under time constraints (300 words in 35 minutes)',
          'Exam hall time-budgeting and question prioritization strategy',
        ],
        capstoneProject:
          'Three consecutive Full-Length Mock Exams under exact exam conditions with real-time CBT timer.',
        skillsUnlocked: ['Time allocation mastery', 'Exam stamina under pressure', 'High-speed accuracy'],
        toolsUsed: ['Jaystarbliss CBT Simulator', 'Countdown Timers'],
      },
      {
        stage: 5,
        stageName: 'Stage 5: Master',
        levelTitle: 'Top Percentile Outcome & Distinction Readiness',
        duration: '4–6 Weeks',
        badge: 'Distinction Scholar',
        badgeColor: 'bg-brand-red',
        description:
          'Final polishing, high-yield topic blitz, psychological confidence coaching, and final exam day preparation for straight A1s / 300+ JAMB.',
        topics: [
          'High-yield topic predictions and intensive revision blitz',
          'Stress reduction, mental clarity, and memory consolidation techniques',
          'Pre-exam day checklist and optimal breakfast/sleep guidelines',
          'Post-exam university entrance and scholarship advisory',
        ],
        capstoneProject: 'Final Mock Score of 85%+ / 300+ with readiness certificate and Distinction guarantee.',
        skillsUnlocked: ['Peak academic confidence', 'A1 / Distinction readiness', 'University scholarship qualification'],
        toolsUsed: ['Final High-Yield Packs', 'One-on-One Master Mentorship'],
      },
    ],
  },
  {
    id: 'digital-literacy',
    title: 'Digital Literacy, Cloud Tools & Workplace Tech',
    category: 'Digital Literacy',
    categoryLabel: 'DIGITAL LITERACY',
    filterGroup: 'technology',
    ageRange: 'Ages 7–18+ & Young Professionals',
    accentColor: '#0284C7',
    lightBg: 'bg-sky-50 border-sky-200 text-sky-900',
    darkBg: 'dark:bg-sky-950/30 dark:border-sky-800 dark:text-sky-200',
    cardSummary: 'Build rapid touch typing, cloud productivity workflows, spreadsheet analysis, and cyber safety.',
    image: 'https://images.pexels.com/photos/3861958/pexels-photo-3861958.jpeg?auto=compress&cs=tinysrgb&w=1400',
    summary:
      'Essential computer literacy: touch typing 50+ WPM, Microsoft Office (Word, Excel, PowerPoint), Google Workspace, internet research, and cybersecurity safety.',
    careerPath: 'Administrative Lead, Data Entry Specialist, Office Productivity Consultant, Executive Assistant',
    prerequisites: 'No prior computer experience required.',
    milestones: [
      {
        stage: 1,
        stageName: 'Stage 1: Discover',
        levelTitle: 'Touch Typing Mastery & Computer Hardware Basics',
        duration: '4–6 Weeks',
        badge: 'Speed Typist',
        badgeColor: 'bg-sky-500',
        description:
          'Learn home-row muscle memory typing without looking at the keyboard, file system navigation (folders, drives), and digital safety.',
        topics: [
          'Home-row touch typing technique (ASDF JKL;)',
          'Speed and accuracy drills aiming for 30+ WPM baseline',
          'Operating System navigation (Windows & macOS shortcuts)',
          'File management: hierarchical folders, file extensions, compression (.zip)',
        ],
        capstoneProject: 'Achieve 35+ WPM on a certified 5-minute typing test with 95%+ accuracy.',
        skillsUnlocked: ['Touch typing without looking', 'OS keyboard shortcuts', 'File organization'],
        toolsUsed: ['TypingClub', 'Typing.com', 'OS File Manager'],
      },
      {
        stage: 2,
        stageName: 'Stage 2: Build',
        levelTitle: 'Document Crafting & Microsoft Word Mastery',
        duration: '6–8 Weeks',
        badge: 'Document Pro',
        badgeColor: 'bg-blue-500',
        description:
          'Format professional documents, newsletters, reports, letters, tables, headers, footers, and table of contents in Microsoft Word & Google Docs.',
        topics: [
          'Typography styling, paragraph spacing, line heights, and margins',
          'Inserting tables, shapes, charts, and formatted callouts',
          'Headers, footers, page numbering, and automated Table of Contents',
          'Track changes, comments, and collaborative cloud editing',
        ],
        capstoneProject:
          'A 5-page formatted Research Report or Magazine Newsletter with automated Table of Contents, footnotes, and custom cover page.',
        skillsUnlocked: ['Executive document formatting', 'Collaborative editing', 'Typography styling'],
        toolsUsed: ['Microsoft Word', 'Google Docs'],
      },
      {
        stage: 3,
        stageName: 'Stage 3: Apply',
        levelTitle: 'Spreadsheet Fundamentals & Excel Formulas',
        duration: '8–10 Weeks',
        badge: 'Spreadsheet Analyst',
        badgeColor: 'bg-emerald-500',
        description:
          'Calculate and organize data in Microsoft Excel and Google Sheets using formulas (SUM, AVERAGE, IF, VLOOKUP, COUNTIF) and conditional formatting.',
        topics: [
          'Grid navigation, cell references (relative vs. absolute $A$1)',
          'Core mathematical and statistical formulas (SUM, AVERAGE, MIN, MAX)',
          'Logical and lookup functions (IF, AND, OR, VLOOKUP, XLOOKUP)',
          'Data sorting, multi-criteria filtering, and conditional formatting rules',
        ],
        capstoneProject:
          'A dynamic Household / Small Business Budget Sheet with automated revenue calculations and interactive charts.',
        skillsUnlocked: ['Formula writing', 'Conditional formatting', 'Data aggregation'],
        toolsUsed: ['Microsoft Excel', 'Google Sheets'],
      },
      {
        stage: 4,
        stageName: 'Stage 4: Create',
        levelTitle: 'Presentation Design & Storytelling in PowerPoint',
        duration: '6–8 Weeks',
        badge: 'Slide Presenter',
        badgeColor: 'bg-amber-500',
        description:
          'Build compelling slide decks in PowerPoint and Google Slides that communicate ideas with visual clarity instead of walls of text.',
        topics: [
          'Slide layout architecture (1 idea per slide, visual hierarchy)',
          'High-impact data charts, infographics, and icon visuals',
          'Smooth slide transitions, build animations, and presenter notes',
          'Delivering presentations with confidence and audience engagement',
        ],
        capstoneProject:
          'A 10-slide Pitch Deck or Educational Showcase presented live with custom animations and polished visuals.',
        skillsUnlocked: ['Visual storytelling', 'Presentation design', 'Public speaking delivery'],
        toolsUsed: ['Microsoft PowerPoint', 'Google Slides', 'Canva Presentations'],
      },
      {
        stage: 5,
        stageName: 'Stage 5: Master',
        levelTitle: 'Cybersecurity Hygiene, Cloud Collaboration & Smart Search',
        duration: '6–8 Weeks',
        badge: 'Digital Champion',
        badgeColor: 'bg-brand-red',
        description:
          'Advanced web literacy: boolean search techniques, verifying online sources, password managers, 2FA security, and cloud storage management.',
        topics: [
          'Advanced search operators (site:, filetype:, quotes, AND/OR/NOT)',
          'Identifying phishing scams, malicious links, and fake news verification',
          'Two-Factor Authentication (2FA), password managers, and cloud backup',
          'Cloud drive permissions, shared folders, and remote workflow etiquette',
        ],
        capstoneProject:
          'A complete Digital Workplace Portfolio featuring polished docs, financial spreadsheets, presentation deck, and security audit.',
        skillsUnlocked: ['Workplace productivity suite', 'Cybersecurity hygiene', 'Advanced research techniques'],
        toolsUsed: ['Google Drive', 'OneDrive', 'Bitwarden', 'Search Operators'],
      },
    ],
  },
  {
    id: 'young-creators',
    title: 'Early Explorers & Young Creators (Ages 4–7)',
    category: 'Early Childhood Coding & Logic',
    categoryLabel: 'YOUNG CREATORS',
    filterGroup: 'young',
    ageRange: 'Ages 4–7 (Kindergarten & Early Primary)',
    accentColor: '#F59E0B',
    lightBg: 'bg-yellow-50 border-yellow-200 text-yellow-900',
    darkBg: 'dark:bg-yellow-950/30 dark:border-yellow-800 dark:text-yellow-200',
    cardSummary: 'Playful, screen-balanced ScratchJr animations, pattern sequencing, and creative digital storytelling.',
    image: 'https://images.pexels.com/photos/8613089/pexels-photo-8613089.jpeg?auto=compress&cs=tinysrgb&w=1400',
    summary:
      'A playful, screen-balanced introduction to computational thinking, ScratchJr animations, pattern recognition, digital art, and cognitive puzzles.',
    careerPath: 'Future Coder, Creative Innovator, Inquisitive Young Thinker',
    prerequisites: 'No prior reading or computer skills required.',
    milestones: [
      {
        stage: 1,
        stageName: 'Stage 1: Discover',
        levelTitle: 'Playful Device Orientation & Motor Skills',
        duration: '4–6 Weeks',
        badge: 'Playful Explorer',
        badgeColor: 'bg-yellow-500',
        description:
          'Build gentle hand-eye coordination with mouse clicks, trackpad gestures, keyboard letter finding, and digital coloring.',
        topics: [
          'Holding a mouse, single click, double click, and drag-and-drop',
          'Keyboard letter recognition and spacebar timing games',
          'Digital drawing, brush tools, and color filling',
          'Screen time balance and healthy digital habits',
        ],
        capstoneProject: 'A colorful digital storybook illustration with personal character drawing.',
        skillsUnlocked: ['Mouse & trackpad dexterity', 'Visual navigation', 'Creative confidence'],
        toolsUsed: ['Tux Paint', 'Mouse Dexterity Games', 'Tablet Drawing'],
      },
      {
        stage: 2,
        stageName: 'Stage 2: Build',
        levelTitle: 'Pattern Recognition & Sequencing Puzzles',
        duration: '6–8 Weeks',
        badge: 'Pattern Solver',
        badgeColor: 'bg-amber-500',
        description:
          'Understand step-by-step instructions (algorithms), directional arrows (up, down, left, right), and logic loops through games.',
        topics: [
          'Sequencing: First, Next, Then, Last instructions',
          'Directional navigation through maze puzzles',
          'Spotting patterns, shapes, and color repetitions',
          'Unplugged coding games and robot movement roleplay',
        ],
        capstoneProject: 'Solving a 20-stage robot maze puzzle with custom step-by-step command cards.',
        skillsUnlocked: ['Algorithmic sequencing', 'Directional awareness', 'Logic problem solving'],
        toolsUsed: ['Code.org Pre-reader', 'LightBot Junior', 'Unplugged Cards'],
      },
      {
        stage: 3,
        stageName: 'Stage 3: Apply',
        levelTitle: 'ScratchJr Block Coding & Animated Characters',
        duration: '8–10 Weeks',
        badge: 'Junior Coder',
        badgeColor: 'bg-emerald-500',
        description:
          'Snap visual color blocks together to make characters walk, jump, talk with speech bubbles, and react to finger taps in ScratchJr.',
        topics: [
          'Yellow Trigger blocks (Start on Green Flag, Start on Tap)',
          'Blue Motion blocks (Move right, left, up, down, turn, hop)',
          'Purple Looks blocks (Grow, shrink, hide, show, speech text)',
          'Adding custom backgrounds and recording personalized voiceovers',
        ],
        capstoneProject: 'An interactive animated Animal Safari story with 3 distinct scenes and sound effects.',
        skillsUnlocked: ['Block coding logic', 'Event triggers', 'Creative character animation'],
        toolsUsed: ['ScratchJr (Tablet / Desktop)', 'Voice Recorder'],
      },
      {
        stage: 4,
        stageName: 'Stage 4: Create',
        levelTitle: 'Interactive Mini-Games in ScratchJr',
        duration: '8–10 Weeks',
        badge: 'Game Creator',
        badgeColor: 'bg-purple-500',
        description:
          'Combine message broadcasts and collisions to build real playable games like Tag, Catch the Falling Stars, and Race Track.',
        topics: [
          'Orange Control blocks (Wait, Speed, Repeat loops)',
          'Collision triggers (When character touches another character)',
          'Send and Receive colored message broadcasts',
          'Multi-character game choreography and score counters',
        ],
        capstoneProject: 'A playable "Space Rocket Treasure Hunt" mini-game with custom obstacles and winning fanfare.',
        skillsUnlocked: ['Game mechanics', 'Broadcast communication', 'Creative game design'],
        toolsUsed: ['ScratchJr Multi-scene', 'Custom Sprite Editor'],
      },
      {
        stage: 5,
        stageName: 'Stage 5: Master',
        levelTitle: 'Young Creator Showcase & Transition to Scratch 3.0',
        duration: '8–10 Weeks',
        badge: 'Little Master',
        badgeColor: 'bg-brand-red',
        description:
          'Celebrate young achievements with a live family presentation and preview introductory Scratch 3.0 blocks on computers.',
        topics: [
          'Presenting original projects proudly to parents and friends',
          'Explaining how code blocks work in simple words',
          'Introduction to Scratch 3.0 interface (Sprites, Stage, Blocks palette)',
          'Transitioning from tablet drag-and-drop to desktop mouse control',
        ],
        capstoneProject:
          'Graduation Project Presentation with Certificate of Young Creator Brilliant Achievement.',
        skillsUnlocked: ['Presentation confidence', 'Scratch 3.0 readiness', 'Young Creator milestone celebration'],
        toolsUsed: ['Scratch 3.0 Web', 'Digital Certificate Vault'],
      },
    ],
  },
];

const CATEGORY_TABS: { id: 'all' | 'technology' | 'creative' | 'academics' | 'young'; label: string }[] = [
  { id: 'all', label: 'All tracks' },
  { id: 'technology', label: 'Technology' },
  { id: 'creative', label: 'Creative & Music' },
  { id: 'academics', label: 'Academics & Strategy' },
  { id: 'young', label: 'Young Creators' },
];

const InteractiveTrackRoadmap: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<'all' | 'technology' | 'creative' | 'academics' | 'young'>('all');
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'carousel' | 'details'>('carousel');
  const [selectedDetailTrack, setSelectedDetailTrack] = useState<LearningTrack>(ROADMAP_TRACKS[0]);
  const [activeStageNumber, setActiveStageNumber] = useState<number>(1);
  const [activeDetailTab, setActiveDetailTab] = useState<'topics' | 'capstone' | 'skills'>('topics');
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  const trackRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);
  const isProgrammaticScroll = useRef<boolean>(false);

  const visibleTracks = useMemo(() => {
    if (activeCategory === 'all') return ROADMAP_TRACKS;
    return ROADMAP_TRACKS.filter((t) => t.filterGroup === activeCategory);
  }, [activeCategory]);

  const scrollToCardIndex = useCallback((index: number, smooth = true) => {
    const trackEl = trackRef.current;
    const cardEl = cardRefs.current[index];
    if (!trackEl || !cardEl) return;

    isProgrammaticScroll.current = true;
    const trackRect = trackEl.getBoundingClientRect();
    const cardRect = cardEl.getBoundingClientRect();
    const currentScroll = trackEl.scrollLeft;

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const targetLeft = isMobile
      ? currentScroll + (cardRect.left - trackRect.left) - 16
      : currentScroll + (cardRect.left - trackRect.left) - Math.max(24, (trackRect.width - cardRect.width) * 0.22);

    trackEl.scrollTo({
      left: Math.max(0, targetLeft),
      behavior: smooth ? 'smooth' : 'auto',
    });

    window.setTimeout(() => {
      isProgrammaticScroll.current = false;
    }, 420);
  }, []);

  // Mouse pointer drag-to-scroll on desktop
  const dragState = useRef<{ isDown: boolean; startX: number; scrollLeft: number; dragged: boolean }>({
    isDown: false,
    startX: 0,
    scrollLeft: 0,
    dragged: false,
  });

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const trackEl = trackRef.current;
    if (!trackEl) return;
    dragState.current = {
      isDown: true,
      startX: e.pageX - trackEl.offsetLeft,
      scrollLeft: trackEl.scrollLeft,
      dragged: false,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragState.current.isDown) return;
    const trackEl = trackRef.current;
    if (!trackEl) return;
    const x = e.pageX - trackEl.offsetLeft;
    const walk = (x - dragState.current.startX) * 1.25;
    if (Math.abs(walk) > 8) {
      dragState.current.dragged = true;
    }
    trackEl.scrollLeft = dragState.current.scrollLeft - walk;
  };

  const handleMouseUpOrLeave = () => {
    dragState.current.isDown = false;
  };

  // Update activeIndex on native horizontal scroll
  const handleTrackScroll = () => {
    if (isProgrammaticScroll.current) return;
    const trackEl = trackRef.current;
    if (!trackEl) return;

    const trackRect = trackEl.getBoundingClientRect();
    const isMobile = window.innerWidth < 768;
    const referenceX = isMobile ? trackRect.left + trackRect.width * 0.35 : trackRect.left + trackRect.width * 0.42;

    let closestIdx = 0;
    let minDistance = Number.POSITIVE_INFINITY;

    cardRefs.current.forEach((card, idx) => {
      if (!card || idx >= visibleTracks.length) return;
      const rect = card.getBoundingClientRect();
      const cardCenter = rect.left + rect.width / 2;
      const dist = Math.abs(cardCenter - referenceX);
      if (dist < minDistance) {
        minDistance = dist;
        closestIdx = idx;
      }
    });

    if (closestIdx !== activeIndex && visibleTracks[closestIdx]) {
      setActiveIndex(closestIdx);
    }
  };

  const handleSelectIndex = (nextIdx: number) => {
    const clamped = Math.max(0, Math.min(visibleTracks.length - 1, nextIdx));
    setActiveIndex(clamped);
    scrollToCardIndex(clamped, true);
  };

  const handlePrev = () => {
    if (visibleTracks.length === 0) return;
    const prevIdx = activeIndex > 0 ? activeIndex - 1 : visibleTracks.length - 1;
    handleSelectIndex(prevIdx);
  };

  const handleNext = () => {
    if (visibleTracks.length === 0) return;
    const nextIdx = activeIndex < visibleTracks.length - 1 ? activeIndex + 1 : 0;
    handleSelectIndex(nextIdx);
  };

  const handleCategoryChange = (catId: 'all' | 'technology' | 'creative' | 'academics' | 'young') => {
    setActiveCategory(catId);
    setActiveIndex(0);
    if (trackRef.current) {
      trackRef.current.scrollTo({ left: 0, behavior: 'smooth' });
    }
  };

  const handleOpenTrackDetails = (track: LearningTrack, idx?: number) => {
    if (typeof idx === 'number') {
      setActiveIndex(idx);
    }
    setSelectedDetailTrack(track);
    setActiveStageNumber(1);
    setActiveDetailTab('topics');
    setViewMode('details');
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

  const totalVisible = visibleTracks.length;
  const safeActiveIndex = Math.min(activeIndex, Math.max(0, totalVisible - 1));
  const progressPercent = totalVisible > 0 ? ((safeActiveIndex + 1) / totalVisible) * 100 : 100;

  // Detail mode helpers
  const detailTrackIndex = ROADMAP_TRACKS.findIndex((t) => t.id === selectedDetailTrack.id);
  const currentMilestone =
    selectedDetailTrack.milestones.find((m) => m.stage === activeStageNumber) ||
    selectedDetailTrack.milestones[0];

  const handlePrevDetailTrack = () => {
    const nextIdx = (detailTrackIndex - 1 + ROADMAP_TRACKS.length) % ROADMAP_TRACKS.length;
    setSelectedDetailTrack(ROADMAP_TRACKS[nextIdx]);
    setActiveStageNumber(1);
    setActiveDetailTab('topics');
  };

  const handleNextDetailTrack = () => {
    const nextIdx = (detailTrackIndex + 1) % ROADMAP_TRACKS.length;
    setSelectedDetailTrack(ROADMAP_TRACKS[nextIdx]);
    setActiveStageNumber(1);
    setActiveDetailTab('topics');
  };

  return (
    <section
      id="visual-roadmap"
      aria-label="Student Milestone Roadmap"
      className="scroll-mt-24 select-none"
      onKeyDown={viewMode === 'carousel' ? handleKeyDown : undefined}
    >
      {viewMode === 'carousel' ? (
        <div className="space-y-7 sm:space-y-9">
          {/* Editorial Section Header — Unboxed */}
          <div className="space-y-6">
            <div className="space-y-2">
              <p className="text-[11px] sm:text-xs font-bold uppercase tracking-[0.22em] text-[#E11D48]">
                PROGRESSION BLUEPRINT
              </p>
              <h2 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-extrabold tracking-tight text-slate-900 dark:text-white leading-[1.1]">
                Student Milestone Roadmap
              </h2>
              <p className="text-sm sm:text-base text-slate-600 dark:text-slate-400 max-w-xl">
                Explore how learners advance through five structured mastery stages in every track.
              </p>
            </div>

            {/* Category Tabs + Position Indicator & Text Controls */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-white/10 pb-0">
              <div
                role="tablist"
                aria-label="Roadmap track categories"
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

          {/* Horizontal Bleed Carousel Track — No Enclosing Box */}
          <div className="relative -mx-4 sm:-mx-6 lg:-mx-8">
            <div
              ref={trackRef}
              onScroll={handleTrackScroll}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUpOrLeave}
              onMouseLeave={handleMouseUpOrLeave}
              tabIndex={0}
              role="region"
              aria-label="Student milestone roadmap carousel"
              className="flex items-stretch gap-4 sm:gap-5 lg:gap-6 overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar touch-pan-x overscroll-x-contain overscroll-y-none [-webkit-overflow-scrolling:touch] px-4 sm:px-6 lg:px-8 py-1 focus:outline-none cursor-grab active:cursor-grabbing"
            >
              {visibleTracks.map((track, idx) => {
                const isActive = idx === safeActiveIndex;
                const imgFailed = failedImages[track.id];

                return (
                  <article
                    key={track.id}
                    ref={(el) => {
                      cardRefs.current[idx] = el;
                    }}
                    onClick={() => {
                      if (dragState.current.dragged) return;
                      if (!isActive && window.innerWidth >= 768) {
                        handleSelectIndex(idx);
                      } else {
                        handleOpenTrackDetails(track, idx);
                      }
                    }}
                    className={`group relative shrink-0 snap-start md:snap-center overflow-hidden rounded-2xl transition-all duration-300 cursor-pointer border ${
                      isActive
                        ? 'w-[86vw] sm:w-[74vw] md:w-[540px] lg:w-[620px] xl:w-[660px] border-slate-200/80 dark:border-white/15 opacity-100'
                        : 'w-[86vw] sm:w-[74vw] md:w-[380px] lg:w-[400px] xl:w-[430px] border-slate-200/60 dark:border-white/10 md:opacity-80 hover:opacity-100'
                    } h-[370px] sm:h-[400px] lg:h-[430px] bg-slate-900`}
                  >
                    {/* Card Photograph */}
                    {!imgFailed ? (
                      <img
                        src={track.image}
                        alt={track.title}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setFailedImages((prev) => ({ ...prev, [track.id]: true }))
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

                    {/* Editorial Card Copy — Strictly 4 Elements: Category, Title, 1 Short Sentence, Text Link */}
                    <div className="relative z-10 h-full flex flex-col justify-end p-6 sm:p-8 lg:p-9">
                      <div className="max-w-lg space-y-2.5">
                        <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.22em] text-[#E11D48]">
                          {track.categoryLabel}
                        </p>

                        <h3 className="text-xl sm:text-2xl lg:text-[1.75rem] font-extrabold text-white tracking-tight leading-snug">
                          {track.title}
                        </h3>

                        <p className="text-xs sm:text-sm text-slate-200/90 leading-relaxed line-clamp-2">
                          {track.cardSummary}
                        </p>

                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenTrackDetails(track, idx);
                            }}
                            className="inline-block text-xs sm:text-sm font-bold text-[#F43F5E] hover:text-white transition-colors cursor-pointer focus:outline-none focus-visible:underline"
                          >
                            Explore roadmap
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
            <div className="hidden md:flex items-center gap-1.5" role="tablist" aria-label="Track position">
              {visibleTracks.map((track, idx) => {
                const active = idx === safeActiveIndex;
                return (
                  <button
                    key={track.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    aria-label={`Show ${track.title}`}
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
           MODE 2: EDITORIAL MILESTONE DETAIL VIEW (In-Place, Unboxed)
           ========================================================= */
        <div className="space-y-8 pt-2 border-t border-slate-200 dark:border-white/10">
          {/* Top Navigation Bar — Text-Only, Zero Icons */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-white/10">
            <button
              type="button"
              onClick={() => setViewMode('carousel')}
              className="text-xs sm:text-sm font-bold text-[#E11D48] hover:underline cursor-pointer py-1"
            >
              Back to all tracks
            </button>

            <div className="flex items-center gap-4 text-xs font-semibold">
              <button
                type="button"
                onClick={handlePrevDetailTrack}
                className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer py-1"
              >
                Previous
              </button>
              <span className="font-mono tabular-nums text-slate-900 dark:text-white font-bold">
                {String(detailTrackIndex + 1).padStart(2, '0')}{' '}
                <span className="text-slate-400 dark:text-slate-500 font-normal">
                  / {String(ROADMAP_TRACKS.length).padStart(2, '0')}
                </span>
              </span>
              <button
                type="button"
                onClick={handleNextDetailTrack}
                className="text-slate-700 dark:text-slate-200 hover:text-[#E11D48] transition-colors cursor-pointer py-1"
              >
                Next
              </button>
            </div>
          </div>

          {/* Editorial Hero Split for Selected Track */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
              <div className="space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#E11D48]">
                  {selectedDetailTrack.categoryLabel} · {selectedDetailTrack.ageRange}
                </p>
                <h3 className="text-2xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight leading-tight">
                  {selectedDetailTrack.title}
                </h3>
                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
                  {selectedDetailTrack.summary}
                </p>
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Career & Mastery Outcome
                  </p>
                  <p className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200">
                    {selectedDetailTrack.careerPath}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3 shrink-0">
                  <Link
                    to="/register"
                    className="inline-flex items-center justify-center bg-[#E11D48] hover:bg-red-700 text-white font-bold px-6 py-3 rounded-xl transition-colors text-xs sm:text-sm whitespace-nowrap"
                  >
                    Enroll in this track
                  </Link>
                  <Link
                    to="/tutors"
                    className="inline-flex items-center justify-center border border-slate-300 dark:border-white/15 text-slate-700 dark:text-slate-200 hover:border-slate-900 dark:hover:border-white font-bold px-5 py-3 rounded-xl transition-colors text-xs sm:text-sm whitespace-nowrap"
                  >
                    Book 1-on-1 mentor
                  </Link>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 relative min-h-[240px] sm:min-h-[280px] rounded-2xl overflow-hidden bg-slate-900 border border-slate-200 dark:border-white/10">
              {!failedImages[selectedDetailTrack.id] && (
                <img
                  src={selectedDetailTrack.image}
                  alt={selectedDetailTrack.title}
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent" />
            </div>
          </div>

          {/* 5-Stage Progression Bar — Desktop Horizontal with Connecting Lines / Mobile Vertical List */}
          <div className="space-y-4 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#E11D48]">
                FIVE PROGRESSIVE MILESTONES
              </p>
              <div className="flex items-center gap-4 text-xs font-semibold">
                <button
                  type="button"
                  disabled={activeStageNumber === 1}
                  onClick={() => setActiveStageNumber((prev) => Math.max(1, prev - 1))}
                  className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-40 transition-colors cursor-pointer py-1"
                >
                  Previous stage
                </button>
                <span className="font-mono tabular-nums text-slate-900 dark:text-white font-bold">
                  0{activeStageNumber}{' '}
                  <span className="text-slate-400 dark:text-slate-500 font-normal">/ 05</span>
                </span>
                <button
                  type="button"
                  disabled={activeStageNumber === 5}
                  onClick={() => setActiveStageNumber((prev) => Math.min(5, prev + 1))}
                  className="text-slate-700 dark:text-slate-200 hover:text-[#E11D48] disabled:opacity-40 transition-colors cursor-pointer py-1"
                >
                  Next stage
                </button>
              </div>
            </div>

            {/* Desktop Horizontal Stage Progression */}
            <div
              role="tablist"
              aria-label="Milestone stages"
              className="hidden md:flex items-center justify-between gap-4 py-3 border-y border-slate-200 dark:border-white/10"
            >
              {selectedDetailTrack.milestones.map((m, idx) => {
                const isActive = m.stage === activeStageNumber;
                const shortStageLabel = m.stageName.split(':')[1]?.trim() || m.stageName;
                return (
                  <React.Fragment key={m.stage}>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setActiveStageNumber(m.stage)}
                      className="group relative py-2 text-left shrink-0 cursor-pointer focus:outline-none"
                    >
                      <span
                        className={`block text-[10px] font-mono tabular-nums uppercase tracking-widest ${
                          isActive ? 'text-[#E11D48] font-bold' : 'text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        0{m.stage} · {m.duration}
                      </span>
                      <span
                        className={`block text-sm sm:text-base mt-0.5 transition-colors ${
                          isActive
                            ? 'font-bold text-slate-900 dark:text-white'
                            : 'font-medium text-slate-500 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white'
                        }`}
                      >
                        {shortStageLabel}
                      </span>
                      {isActive && (
                        <span className="absolute bottom-0 left-0 w-10 h-[2.5px] bg-[#E11D48] rounded-full" />
                      )}
                    </button>

                    {idx < selectedDetailTrack.milestones.length - 1 && (
                      <div
                        className="flex-1 h-px bg-slate-200 dark:bg-white/15 min-w-[20px]"
                        aria-hidden="true"
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {/* Mobile Vertical Stage List */}
            <div
              role="tablist"
              aria-label="Milestone stages mobile"
              className="flex md:hidden flex-col divide-y divide-slate-200 dark:divide-white/10 border-y border-slate-200 dark:border-white/10"
            >
              {selectedDetailTrack.milestones.map((m) => {
                const isActive = m.stage === activeStageNumber;
                const shortStageLabel = m.stageName.split(':')[1]?.trim() || m.stageName;
                return (
                  <button
                    key={m.stage}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveStageNumber(m.stage)}
                    className="relative py-3 text-left flex items-center justify-between cursor-pointer focus:outline-none"
                  >
                    <div>
                      <span
                        className={`text-sm transition-colors ${
                          isActive
                            ? 'font-bold text-slate-900 dark:text-white'
                            : 'font-medium text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        0{m.stage} · {shortStageLabel}
                      </span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {m.levelTitle}
                      </span>
                    </div>
                    <span className="text-[11px] font-mono tabular-nums text-slate-400 dark:text-slate-500 shrink-0 ml-3">
                      {m.duration}
                    </span>
                    {isActive && (
                      <span className="absolute bottom-0 left-0 w-12 h-[2.5px] bg-[#E11D48] rounded-full" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Stage Details — Editorial Layout */}
          <div className="space-y-6 pt-2">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-6 border-b border-slate-200 dark:border-white/10">
              <div className="space-y-2 max-w-3xl">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#E11D48]">
                  {currentMilestone.stageName} · {currentMilestone.duration} · Credential: {currentMilestone.badge}
                </p>
                <h4 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                  {currentMilestone.levelTitle}
                </h4>
                <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
                  {currentMilestone.description}
                </p>
              </div>

              {/* Clean Sub-Tab Selector */}
              <div
                role="tablist"
                aria-label="Milestone detail view"
                className="flex items-center gap-6 border-b lg:border-b-0 border-slate-200 dark:border-white/10 shrink-0"
              >
                {[
                  { id: 'topics' as const, label: 'Core syllabus' },
                  { id: 'capstone' as const, label: 'Capstone project' },
                  { id: 'skills' as const, label: 'Skills & credential' },
                ].map((tab) => {
                  const isSelected = activeDetailTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      onClick={() => setActiveDetailTab(tab.id)}
                      className={`relative pb-2.5 text-xs sm:text-sm whitespace-nowrap transition-colors cursor-pointer ${
                        isSelected
                          ? 'font-bold text-slate-900 dark:text-white'
                          : 'font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {tab.label}
                      {isSelected && (
                        <span className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[#E11D48] rounded-full" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {activeDetailTab === 'topics' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                {currentMilestone.topics.map((topic, i) => (
                  <div
                    key={i}
                    className="pb-4 border-b border-slate-200/80 dark:border-white/10 flex items-baseline gap-4"
                  >
                    <span className="text-xs font-mono tabular-nums font-bold text-[#E11D48] shrink-0">
                      0{i + 1}
                    </span>
                    <p className="text-sm sm:text-base font-medium text-slate-800 dark:text-slate-200 leading-relaxed">
                      {topic}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {activeDetailTab === 'capstone' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-2">
                <div className="lg:col-span-7 space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-[#E11D48]">
                    Stage 0{currentMilestone.stage} Real-World Deliverable
                  </p>
                  <h5 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white leading-snug">
                    {currentMilestone.capstoneProject}
                  </h5>
                </div>
                <div className="lg:col-span-5 space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                    Tools & Stack Utilized
                  </p>
                  <p className="text-sm sm:text-base font-medium text-slate-700 dark:text-slate-300 leading-relaxed">
                    {currentMilestone.toolsUsed.join(' · ')}
                  </p>
                </div>
              </div>
            )}

            {activeDetailTab === 'skills' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-2 items-start">
                <div className="lg:col-span-7 space-y-3">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                    Competencies Unlocked
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {currentMilestone.skillsUnlocked.map((skill, i) => (
                      <div
                        key={i}
                        className="pb-3 border-b border-slate-200/80 dark:border-white/10 text-sm font-semibold text-slate-800 dark:text-slate-200"
                      >
                        {skill}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="lg:col-span-5 space-y-4 pt-4 lg:pt-0 lg:pl-8 lg:border-l border-slate-200 dark:border-white/10">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-[#E11D48]">
                      Verified Milestone Credential
                    </p>
                    <h5 className="text-xl font-extrabold text-slate-900 dark:text-white mt-1">
                      {currentMilestone.badge}
                    </h5>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1">
                      Prerequisites: {selectedDetailTrack.prerequisites}
                    </p>
                  </div>

                  <Link
                    to="/register"
                    className="inline-flex items-center justify-center bg-[#E11D48] hover:bg-red-700 text-white font-bold px-6 py-3 rounded-xl transition-colors text-xs sm:text-sm"
                  >
                    Start at Stage 0{currentMilestone.stage}
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default InteractiveTrackRoadmap;
