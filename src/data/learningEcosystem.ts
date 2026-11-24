export interface LearningStage {
  stage: number;
  name: 'DISCOVER' | 'BUILD' | 'APPLY' | 'CREATE' | 'MASTER';
  tagline: string;
  description: string;
  icon: string;
}

export const ECOSYSTEM_STAGES: LearningStage[] = [
  {
    stage: 1,
    name: 'DISCOVER',
    tagline: 'Foundations & Exploration',
    description: 'Understand core concepts, mental models, fundamentals, and computational or musical thinking before building.',
    icon: 'Compass'
  },
  {
    stage: 2,
    name: 'BUILD',
    tagline: 'Hands-on Skill Acquisition',
    description: 'Learn the syntax, tools, notation, software (HTML/CSS, Python, Blender, Keyboard scales, Word/Excel) through guided exercises.',
    icon: 'Hammer'
  },
  {
    stage: 3,
    name: 'APPLY',
    tagline: 'Real-World Problem Solving',
    description: 'Put skills to work on structured challenges, building websites, composing melodies, writing essays, or analyzing datasets.',
    icon: 'Cpu'
  },
  {
    stage: 4,
    name: 'CREATE',
    tagline: 'Original Projects & Artifacts',
    description: 'Architect independent portfolio projects, games, songs, brand identities, and research presentations from scratch.',
    icon: 'Rocket'
  },
  {
    stage: 5,
    name: 'MASTER',
    tagline: 'Advanced Craft & Mentorship',
    description: 'Deepen expertise with Git/APIs, advanced harmony, competitive chess, exam mastery, and career/freelance readiness.',
    icon: 'Crown'
  }
];

export interface SchoolPathway {
  id: string;
  title: string;
  ageRange: string;
  description: string;
  levels: {
    level: string;
    title: string;
    topics: string[];
    outcome?: string;
  }[];
}

export interface LearningSchool {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  iconName: string;
  accentColor: string;
  bgGradient: string;
  shortDescription: string;
  longDescription: string;
  disciplines: string[];
  stagesFramework: {
    discover: string[];
    build: string[];
    apply: string[];
    create: string[];
    master: string[];
  };
  pathways: SchoolPathway[];
}

export const LEARNING_SCHOOLS: LearningSchool[] = [
  {
    id: 'tech-programming',
    slug: 'technology-programming',
    name: 'School of Technology & Programming',
    tagline: 'From First Block of Code to Full-Stack & Artificial Intelligence',
    iconName: 'Laptop',
    accentColor: '#3B82F6',
    bgGradient: 'from-blue-600/20 to-cyan-500/10',
    shortDescription: 'Coding, Web Development, Python, Scratch, Artificial Intelligence, and Computer Science foundations.',
    longDescription: 'Our Technology & Programming Academy provides a progressive continuum from playful block-based logic for 4-year-olds to production-grade software engineering and generative AI development for teens and young adults.',
    disciplines: ['Coding', 'Web Development', 'Python', 'Scratch & ScratchJr', 'AI & Machine Learning', 'Computer Science'],
    stagesFramework: {
      discover: ['What is programming?', 'Computational thinking', 'Algorithms & sequencing', 'Decomposition & logic'],
      build: ['HTML & CSS basics', 'JavaScript fundamentals', 'Python syntax & data structures', 'Block-based coding in Scratch'],
      apply: ['Build responsive websites', 'Interactive 2D games', 'Data automation scripts', 'Problem solving algorithms'],
      create: ['Original Scratch games', 'Personal portfolio websites', 'Full-stack web applications', 'AI-powered productivity bots'],
      master: ['Git & GitHub workflow', 'REST APIs & Databases', 'Software architecture', 'Client projects & tech freelancing']
    },
    pathways: [
      {
        id: 'young-coders',
        title: 'Young Coders Pathway',
        ageRange: 'Ages 4–7',
        description: 'Screen-smart playful introduction to algorithms, sequencing, and creative problem solving.',
        levels: [
          { level: 'Level 1', title: 'Digital Play', topics: ['Mouse & keyboard orientation', 'Basic computer interaction', 'Digital safety', 'Creative computer activities'] },
          { level: 'Level 2', title: 'Computational Thinking', topics: ['Pattern recognition', 'Step-by-step sequences', 'Directional logic', 'Visual problem solving'] },
          { level: 'Level 3', title: 'ScratchJr Storytelling', topics: ['Character animation', 'Movement & events', 'Multi-scene stories', 'Simple mini-games'] },
          { level: 'Level 4', title: 'Creative Coding', topics: ['Intro to Scratch 3.0', 'Motion, looks & sound blocks', 'Broadcast events', 'Interactive stories'] },
          { level: 'Level 5', title: 'Young Creator', topics: ['Independent game project', 'Voiceover narration', 'Final project showcase', 'Peer presentations'] }
        ]
      },
      {
        id: 'junior-programming',
        title: 'Junior Programming Pathway',
        ageRange: 'Ages 7–11',
        description: 'Transition from visual block logic to real web code and Python fundamentals.',
        levels: [
          { level: 'Level 1', title: 'Foundations & Scratch', topics: ['Computational algorithms', 'Variables & operators', 'Game mechanics & physics', 'Score systems'] },
          { level: 'Level 2', title: 'Web Foundations', topics: ['HTML5 page structure', 'CSS3 styling & colors', 'Responsive layouts', 'Publishing web pages'] },
          { level: 'Level 3', title: 'Creative JavaScript', topics: ['JS syntax & data types', 'DOM manipulation', 'Event listeners', 'Interactive browser games'] },
          { level: 'Level 4', title: 'Python Foundations', topics: ['Variables, lists & loops', 'Functions & logic branches', 'Turtle graphics', 'Text-based adventure games'] },
          { level: 'Level 5', title: 'Junior Developer', topics: ['Multi-page web applications', 'Game development capstone', 'Mini utility tools', 'Junior developer portfolio'] }
        ]
      },
      {
        id: 'professional-programming',
        title: 'Professional Programming Pathway',
        ageRange: 'Teens & Adults (12+)',
        description: 'Career-ready full-stack software development, APIs, database engineering, and portfolio deployment.',
        levels: [
          { level: 'Level 1', title: 'Web Development Foundations', topics: ['Semantic HTML5', 'Modern Tailwind & CSS Flex/Grid', 'Responsive design & UX', 'Accessibility & Vercel hosting'] },
          { level: 'Level 2', title: 'JavaScript & TypeScript Mastery', topics: ['ES6+ features & async/await', 'Array methods & data flow', 'Fetch API & JSON handling', 'Interactive web apps'] },
          { level: 'Level 3', title: 'Python & Backend Logic', topics: ['Object-Oriented Programming (OOP)', 'File handling & automation', 'Data parsing & scraping', 'Algorithm optimization'] },
          { level: 'Level 4', title: 'Software Engineering & Cloud', topics: ['Git version control & GitHub', 'RESTful API creation', 'Relational & NoSQL databases', 'User authentication'] },
          { level: 'Level 5', title: 'Full-Stack Web Architecture', topics: ['React/Next.js frontend systems', 'Serverless APIs & backend microservices', 'Database schemas & migrations', 'Continuous Deployment'] },
          { level: 'Level 6', title: 'Portfolio, Freelancing & Career', topics: ['Real-world client capstones', 'Clean code repository showcase', 'Freelance client onboarding', 'Technical interview prep'] }
        ]
      },
      {
        id: 'ai-emerging-tech',
        title: 'AI & Emerging Technology Pathway',
        ageRange: 'Ages 9 to Adults',
        description: 'Dedicated roadmap covering AI literacy, generative prompting, and custom AI agent development.',
        levels: [
          { level: 'Level 1', title: 'AI Literacy', topics: ['What is Artificial Intelligence & ML?', 'Generative AI & LLM basics', 'Responsible & ethical AI use', 'Effective prompting for research & schoolwork'] },
          { level: 'Level 2', title: 'AI Creator', topics: ['AI-assisted visual design & art', 'AI-assisted code generation', 'Content creation & smart summaries', 'Automated presentation generation'] },
          { level: 'Level 3', title: 'AI Developer', topics: ['Integrating Gemini & OpenAI APIs', 'Custom AI chatbots & assistants', 'AI agent automation workflows', 'Building AI-powered web applications'] }
        ]
      }
    ]
  },
  {
    id: 'digital-literacy',
    slug: 'digital-literacy',
    name: 'School of Digital Literacy',
    tagline: 'Practical Computer Mastery, Office Suites & Smart Search for 21st Century Success',
    iconName: 'Brain',
    accentColor: '#10B981',
    bgGradient: 'from-emerald-600/20 to-teal-500/10',
    shortDescription: 'Computer Literacy, Microsoft Office (Word, Excel, PowerPoint), Smart Internet, and AI Productivity.',
    longDescription: 'Structured directly around our Junior Digital Explorers and Senior Digital Masters curricula, equipping learners with tactile typing speed, spreadsheet mastery, presentation design, digital safety, and modern AI schoolwork shortcuts.',
    disciplines: ['Touch Typing', 'Microsoft Word', 'PowerPoint Pro', 'Excel Essentials', 'Smart Search', 'Digital Safety', 'AI Playground'],
    stagesFramework: {
      discover: ['Hardware & operating systems', 'File organization & folders', 'Mouse & keyboard ergonomics', 'Internet safety principles'],
      build: ['Touch typing accuracy & WPM', 'Word document formatting', 'PowerPoint slides & transitions', 'Excel formulas & sheets'],
      apply: ['School research projects', 'Data organization with spreadsheets', 'Engaging class presentations', 'Digital email etiquette'],
      create: ['Interactive slide decks', 'Visual newsletters & reports', 'Automated budget calculators', 'AI-assisted study guides'],
      master: ['Keyboard shortcuts & productivity hacks', 'Advanced Excel lookup & charts', 'Cloud collaboration (Docs/Drive)', 'Digital workflow automation']
    },
    pathways: [
      {
        id: 'junior-digital-explorers',
        title: 'Junior Digital Explorers',
        ageRange: 'Ages 6–10',
        description: 'Essential foundational computer literacy based on our flagship introductory package.',
        levels: [
          { level: 'Level 1', title: 'Computer Explorer & Typing Made Fun', topics: ['Proper hand positioning & typing games', 'Desktop navigation & folder filing', 'Safe mouse control & shortcuts', 'Digital wellness'] },
          { level: 'Level 2', title: 'Digital Creator (Word & Paint)', topics: ['Creative digital drawing with Paint', 'Writing stories in Microsoft Word', 'Text styling, colors & font pairing', 'Inserting pictures & shapes'] },
          { level: 'Level 3', title: 'Smart Search & PowerPoint Kids', topics: ['Safe search engine techniques', 'Building multi-slide PowerPoint decks', 'Slide transitions & voice narration', 'Fact-checking online sources'] },
          { level: 'Level 4', title: 'AI Explorer & Playground', topics: ['Conversational AI playground', 'Prompting AI for creative ideas', 'Image generation for storybooks', 'Smart digital safety rules'] }
        ]
      },
      {
        id: 'senior-digital-masters',
        title: 'Senior Digital Masters',
        ageRange: 'Ages 11–17 & Adults',
        description: 'High-productivity office suites, spreadsheet analytics, and AI-powered academic workflows.',
        levels: [
          { level: 'Level 1', title: 'Computer Productivity & Tech Shortcuts', topics: ['System navigation & keyboard hacks', 'Cloud backup & Google Drive management', 'Digital file archiving', 'PDF editing & security'] },
          { level: 'Level 2', title: 'Word for Smart Work', topics: ['Academic document structuring', 'Automated Table of Contents & citations', 'Headers, footers & multi-column layouts', 'Collaborative commenting & track changes'] },
          { level: 'Level 3', title: 'PowerPoint Pro & Visual Presentations', topics: ['Executive layout principles', 'Infographics & custom animations', 'Embedded media & slide masters', 'Public speaking delivery techniques'] },
          { level: 'Level 4', title: 'Excel Essentials & Data Analytics', topics: ['Spreadsheet design & data formatting', 'Core formulas (SUM, AVERAGE, IF, VLOOKUP/XLOOKUP)', 'Dynamic charts & data visualization', 'Budgeting & grade trackers'] },
          { level: 'Level 5', title: 'AI for School Projects & Research', topics: ['AI research synthesis & citation', 'Generating structured study outlines', 'AI-assisted proofreading & drafting', 'Academic integrity guidelines'] },
          { level: 'Level 6', title: 'Advanced Digital Mastery', topics: ['Automating repetitive tasks', 'Digital portfolio compilation', 'Email communication & online professionalism', 'Certification capstone assessment'] }
        ]
      }
    ]
  },
  {
    id: 'creative-design',
    slug: 'creative-design',
    name: 'School of Creative Design',
    tagline: 'Visual Storytelling, Brand Identity, UI/UX & Digital Illustration',
    iconName: 'Palette',
    accentColor: '#EC4899',
    bgGradient: 'from-pink-600/20 to-rose-500/10',
    shortDescription: 'Graphic Design, Digital Art, Branding Systems, Visual Composition, and UI/UX Design.',
    longDescription: 'Turn creative imagination into professional visual assets. Learners master color theory, typography, branding identities, Canva, Adobe Creative Suite workflows, and UI design principles.',
    disciplines: ['Graphic Design', 'Branding & Logo Systems', 'Digital Illustration', 'UI/UX Interface Design', 'Canva & Figma', 'Social Media Creative'],
    stagesFramework: {
      discover: ['Design principles (Balance, Contrast, Hierarchy)', 'Color theory & psychology', 'Typography anatomy & pairing', 'Visual composition & grids'],
      build: ['Mastering Canva & vector tools', 'Photo editing & background manipulation', 'Drawing brushes & layers', 'Iconography & asset management'],
      apply: ['Creating marketing posters & flyers', 'Social media content kits', 'E-book & magazine layouts', 'Event banners & merchandise mockups'],
      create: ['Full brand identity systems (Logo + Guidelines)', 'Character illustration series', 'Mobile app UI design in Figma', 'Client pitch decks'],
      master: ['Client brief decomposition & workflows', 'Design system architecture', 'Print prep & resolution standards', 'Freelance pricing & portfolio building']
    },
    pathways: [
      {
        id: 'graphic-design',
        title: 'Graphic Design & Branding Pathway',
        ageRange: 'Ages 8 to Adults',
        description: 'Comprehensive pathway from visual design basics to professional branding identities.',
        levels: [
          { level: 'Beginner', title: 'Design Foundations & Canva', topics: ['Visual hierarchy & whitespace', 'Color palettes & contrast', 'Font selection & typographic scale', 'Canva design workflows'] },
          { level: 'Intermediate', title: 'Branding, Posters & Social Media', topics: ['Flyers & promotional posters', 'Social media carousel templates', 'Presentation deck styling', 'Vector shape creation'] },
          { level: 'Advanced', title: 'Brand Identity & UI Design', topics: ['Logo design principles & variations', 'Brand style guide creation', 'Mobile & web interface design', 'Figma layout grids & components'] },
          { level: 'Professional', title: 'Client Projects & Portfolio', topics: ['Responding to client briefs', 'Mockup presentation & storytelling', 'Design contracts & freelance pricing', 'Live portfolio website launch'] }
        ]
      },
      {
        id: 'digital-art',
        title: 'Digital Art & Illustration Pathway',
        ageRange: 'Ages 7 to Adults',
        description: 'Drawing fundamentals, digital tablets, character concepts, and visual storytelling.',
        levels: [
          { level: 'Foundation', title: 'Drawing & Anatomy Fundamentals', topics: ['Basic geometric shapes & forms', 'Light, shadows & shading', 'Perspective drawing', 'Digital stylus & layer basics'] },
          { level: 'Digital Creation', title: 'Digital Illustration & Characters', topics: ['Character creation & emotive poses', 'Digital inking & color rendering', 'Storybook illustration panels', 'Texture brushes & blending'] },
          { level: 'Advanced', title: 'Concept Art & Visual Portfolios', topics: ['Environment & scenery painting', 'Concept art for video games/books', 'Illustration collections', 'Curating an art exhibition portfolio'] }
        ]
      }
    ]
  },
  {
    id: 'music-performing-arts',
    slug: 'music-performing-arts',
    name: 'School of Music & Performing Arts',
    tagline: 'Instrumental Mastery, Sight-Reading, Music Theory & Stage Performance',
    iconName: 'Music',
    accentColor: '#8B5CF6',
    bgGradient: 'from-purple-600/20 to-indigo-500/10',
    shortDescription: 'Keyboard/Piano, Recorder, Violin, Music Theory, Vocal Coaching, and Stage Performance.',
    longDescription: 'A disciplined yet joyful musical conservatory experience. Students learn proper technique, ear training, sight-reading notation, harmony, improvisation, and ensemble performance.',
    disciplines: ['Piano / Keyboard', 'Recorder', 'Violin', 'Comprehensive Music Theory', 'Ear Training', 'Ensemble & Recitals'],
    stagesFramework: {
      discover: ['Instrument care & ergonomic posture', 'Staff notation, clefs & note values', 'Pulse, rhythm & tempo', 'Listening & pitch recognition'],
      build: ['Finger independence & bow control', 'Major & minor scales', 'Reading sheet music in real time', 'Basic chords & accompaniment patterns'],
      apply: ['Playing classical & contemporary repertoire', 'Ensemble synchronization', 'Harmonizing simple melodies', 'Transposing keys'],
      create: ['Original musical compositions', 'Improvisational solos', 'Arranging songs for multi-instrument play', 'Recording performance tracks'],
      master: ['Advanced harmonic analysis', 'Stage presence & concert performance', 'Exam preparation (ABRSM/Muson standards)', 'Mentoring junior musicians']
    },
    pathways: [
      {
        id: 'keyboard-piano',
        title: 'Keyboard & Piano Pathway',
        ageRange: 'Ages 5 to Adults',
        description: 'From first single-note melodies to two-handed accompaniment, classical sonatinas, and contemporary chords.',
        levels: [
          { level: 'Level 1', title: 'Keyboard Explorer', topics: ['Keyboard geography & black/white keys', 'Finger numbering (1 to 5)', 'Treble & Bass clef orientation', 'Simple 5-finger tunes'] },
          { level: 'Level 2', title: 'Junior Keyboardist', topics: ['Two-handed coordination', 'C, G, F Major scales', 'Basic triad chords (I, IV, V)', 'Simple song accompaniment'] },
          { level: 'Level 3', title: 'Intermediate Keyboard', topics: ['Arpeggios & dynamic control', 'Chord inversions & rhythm patterns', 'Sight-reading fluency', 'Classical pieces & contemporary covers'] },
          { level: 'Level 4', title: 'Advanced Keyboard & Harmony', topics: ['Extended chords (7ths, 9ths, sus4)', 'Lead sheet reading & improvisation', 'Ear-to-hand transcription', 'Pedaling techniques'] },
          { level: 'Level 5', title: 'Solo Performer & Accompanist', topics: ['Full recital repertoire', 'Ensemble accompaniment leadership', 'Stage poise & performance psychology', 'Concert recording'] }
        ]
      },
      {
        id: 'recorder',
        title: 'Recorder Pathway',
        ageRange: 'Ages 6 to 14',
        description: 'Ideal foundational wind instrument for breath control, pitch precision, and school musical bands.',
        levels: [
          { level: 'Beginner', title: 'Recorder Basics', topics: ['Instrument holding & embouchure', 'Tonguing & breath control', 'Notes B, A, G, E, D', 'Simple folk melodies'] },
          { level: 'Intermediate', title: 'Scales & Ensemble', topics: ['High notes & chromatic fingerings', 'Duet & trio playing', 'Rhythmic syncopation', 'Sight-reading grade 1-2 pieces'] },
          { level: 'Advanced', title: 'Performance Repertoire', topics: ['Baroque sonatas & classical pieces', 'Expressive vibrato & dynamic phrasing', 'Band leadership & conducting basics', 'Recital showcase'] }
        ]
      },
      {
        id: 'violin',
        title: 'Violin Pathway',
        ageRange: 'Ages 6 to Adults',
        description: 'Structured strings curriculum focusing on bow hold, intonation, fingerboard mastery, and expressive tone.',
        levels: [
          { level: 'Foundation', title: 'Violin Posture & Open Strings', topics: ['Violin hold & shoulder rest setup', 'Bow grip mechanics & bowing straight', 'Open string rhythm exercises', 'Tuning basics'] },
          { level: 'Beginner', title: 'First Position & Finger Tapes', topics: ['1st position finger placements', 'D & A major scales', 'Clean tone production', 'Simple Suzuki repertoire'] },
          { level: 'Intermediate', title: 'Intonation, Slurs & Dynamics', topics: ['Two-octave scales & arpeggios', 'Bowing techniques (staccato, legato, martelé)', 'Ear training for microtonal tuning', 'Duet performances'] },
          { level: 'Advanced', title: 'Shifting, Vibrato & Expression', topics: ['3rd position shifting', 'Developing continuous vibrato', 'Sight-reading Grade 3-5 standard repertoire', 'Concerto movements'] },
          { level: 'Performance', title: 'Master Performer', topics: ['Recital performance', 'Chamber ensemble coordination', 'Virtuosic bowing techniques', 'Audition & exam prep'] }
        ]
      },
      {
        id: 'music-theory',
        title: 'Comprehensive Music Theory',
        ageRange: 'All Ages & Instrumentalists',
        description: 'The universal language of music, empowering musicians to read, compose, and analyze any piece.',
        levels: [
          { level: 'Foundation', title: 'Notes, Time & Staff', topics: ['Pitches on treble & bass clefs', 'Time signatures & bar lines', 'Rest values & rhythm math', 'Accidentals (sharps, flats, naturals)'] },
          { level: 'Intermediate', title: 'Keys, Intervals & Chords', topics: ['Circle of fifths & key signatures', 'Interval measurement (Major/Minor/Perfect)', 'Triad construction & Roman numerals', 'Musical terms & Italian tempo markings'] },
          { level: 'Advanced', title: 'Harmony & Composition', topics: ['Four-part vocal harmony (SATB)', 'Cadences & chord progressions', 'Modulation to related keys', 'Composing 8-bar melodic themes'] }
        ]
      }
    ]
  },
  {
    id: 'academic-excellence',
    slug: 'academic-excellence',
    name: 'School of Academic Excellence',
    tagline: 'Deep Conceptual Mastery, Critical Thinking & High-Yield Exam Preparation',
    iconName: 'GraduationCap',
    accentColor: '#F59E0B',
    bgGradient: 'from-amber-600/20 to-orange-500/10',
    shortDescription: 'Mathematics, English Language, General & Advanced Sciences, WAEC/NECO/JAMB, and Checkpoint/IGCSE prep.',
    longDescription: 'We move beyond rote memorization into foundational understanding. Our academic mentors build reasoning ability, mathematical intuition, articulate writing, and robust exam confidence.',
    disciplines: ['Primary & Junior Mathematics', 'Advanced Mathematics / Further Maths', 'English Grammar, Comprehension & Creative Writing', 'Sciences (Physics, Chemistry, Biology)', 'National & International Exam Preparation'],
    stagesFramework: {
      discover: ['Diagnostic skill assessment', 'Identifying concept bottlenecks', 'Mathematical visualization & logic', 'Vocabulary & reading foundations'],
      build: ['Step-by-step formula derivation', 'Grammar rules & sentence structures', 'Scientific method & lab concepts', 'Active recall & memory indexing'],
      apply: ['Solving multi-step word problems', 'Critical essay writing & analysis', 'Scientific calculations & data interpretation', 'Weekly timed practice drills'],
      create: ['Original research reports & presentations', 'Student-authored essays & arguments', 'Peer-to-peer concept explanations', 'Study summaries & mind maps'],
      master: ['Past question speed & accuracy strategies', 'WAEC/NECO/JAMB mark scheme secrets', 'Checkpoint & IGCSE exam technique', 'Confidence & stress-free test execution']
    },
    pathways: [
      {
        id: 'mathematics',
        title: 'Mathematics Pathway',
        ageRange: 'Primary, Junior & Senior Secondary',
        description: 'From number sense and fractions to algebra, trigonometry, geometry, and calculus.',
        levels: [
          { level: 'Primary', title: 'Foundation & Number Sense', topics: ['Operations & place value', 'Fractions, decimals & percentages', 'Shapes, perimeter & area', 'Real-world math puzzles'] },
          { level: 'Junior Secondary', title: 'Pre-Algebra & Geometry', topics: ['Linear equations & algebraic expressions', 'Angles, triangles & circle theorems', 'Statistics & probability basics', 'Ratio, proportion & rate'] },
          { level: 'Senior Secondary', title: 'Advanced Algebra & Trigonometry', topics: ['Quadratic equations & polynomials', 'Trigonometric identities & sine/cosine rules', 'Logarithms & indices', 'Coordinate geometry & vectors'] },
          { level: 'Mastery', title: 'Exam Excellence & Further Maths', topics: ['Calculus (Differentiation & Integration)', 'Matrices & transformations', 'JAMB speed tricks & past question mastery', 'WAEC theory perfection'] }
        ]
      },
      {
        id: 'english-language',
        title: 'English Language & Literacy Pathway',
        ageRange: 'Primary, Junior & Senior',
        description: 'Phonics, reading fluency, grammar mechanics, comprehension strategies, and articulate creative writing.',
        levels: [
          { level: 'Foundation', title: 'Reading Fluency & Phonics', topics: ['Phonemic awareness & vocabulary', 'Sentence formation & capitalization', 'Story retelling & comprehension', 'Spelling & punctuation'] },
          { level: 'Intermediate', title: 'Grammar Mechanics & Essay Writing', topics: ['Parts of speech & active/passive voice', 'Narrative, descriptive & formal letter essays', 'Summary writing techniques', 'Vocabulary building'] },
          { level: 'Advanced', title: 'Critical Reading & Persuasive Writing', topics: ['Argumentative & expository writing', 'Figurative language & literary devices', 'Advanced comprehension inference', 'Public speaking & debate articulation'] }
        ]
      },
      {
        id: 'sciences',
        title: 'Sciences Pathway (Physics, Chem, Bio)',
        ageRange: 'Junior Secondary & Senior Secondary',
        description: 'Practical, conceptual science education linking theoretical principles to observable real-world phenomena.',
        levels: [
          { level: 'General Science', title: 'Basic Science & Technology', topics: ['Living things & ecosystems', 'Matter, energy & forces', 'Earth & space concepts', 'Human body systems'] },
          { level: 'Senior Biology', title: 'Cell Biology, Genetics & Physiology', topics: ['Cell structure & enzymes', 'Genetics, heredity & evolution', 'Plant & animal physiology', 'Ecology & conservation'] },
          { level: 'Senior Chemistry', title: 'Atomic Theory & Reactions', topics: ['Periodic table & chemical bonding', 'Stoichiometry & mole calculations', 'Acids, bases & salts', 'Organic chemistry fundamentals'] },
          { level: 'Senior Physics', title: 'Mechanics, Waves & Electricity', topics: ['Kinematics, Newton laws & energy', 'Waves, optics & sound', 'Current electricity & magnetism', 'Modern physics & nuclear energy'] }
        ]
      },
      {
        id: 'exam-prep',
        title: 'High-Yield Examination Preparation',
        ageRange: 'Primary 6, JSS3, SSS3 & Private Candidates',
        description: 'Targeted past-paper bootcamps, timed mock exams, and marking guide strategies.',
        levels: [
          { level: 'Primary 6', title: 'National Common Entrance & State Exams', topics: ['Quantitative & Verbal reasoning', 'Maths & English mock drills', 'Interview coaching & school entrance prep'] },
          { level: 'JSS 3', title: 'BECE & Junior Checkpoint', topics: ['Comprehensive syllabus review', 'Past question analysis', 'Time management in exam halls'] },
          { level: 'SSS 3', title: 'WAEC, NECO & JAMB / UTME', topics: ['JAMB computer-based test (CBT) speed drills', 'WAEC theory answer presentation rules', 'Predicted high-yield topic masterclasses'] },
          { level: 'International', title: 'Cambridge Checkpoint, IGCSE & SAT', topics: ['Past paper walkthroughs', 'Command word analysis (Discuss, Evaluate, State)', 'Mock tests with detailed examiner feedback'] }
        ]
      }
    ]
  },
  {
    id: 'strategy-games',
    slug: 'strategy-games',
    name: 'School of Strategy & Games',
    tagline: 'Chess, Scrabble, Tactical Calculation & Critical Decision Making',
    iconName: 'Gamepad2',
    accentColor: '#6366F1',
    bgGradient: 'from-indigo-600/20 to-purple-500/10',
    shortDescription: 'Chess Mastery, Competitive Scrabble, Logic Puzzles, and Strategic Thinking.',
    longDescription: 'Mind sports develop patience, foresight, risk assessment, and cognitive resilience. Students learn chess tactics, endgame precision, Scrabble vocabulary strategies, and tournament etiquette.',
    disciplines: ['Chess Tactics & Openings', 'Endgame Strategy', 'Scrabble Word Strategy & Probability', 'Logic & Spatial Reasoning', 'Tournament Play'],
    stagesFramework: {
      discover: ['Board coordinates & piece mechanics', 'Fundamental rules (Castling, En Passant, Checkmate)', 'Scrabble tile values & board bonus squares', 'Good sportsmanship'],
      build: ['Basic tactical motifs (Fork, Pin, Skewer, Discovery)', 'King & Pawn endgames', '2-letter & 3-letter Scrabble power words', 'Calculating 2-3 moves ahead'],
      apply: ['Opening principles (Control center, develop pieces, king safety)', 'Defending against threats', 'Scrabble rack management & anagramming', 'Playing timed blitz games'],
      create: ['Formulating deep multi-move tactical combinations', 'Analyzing student games on digital boards', 'Composing strategic board plans', 'Creating chess puzzle sets'],
      master: ['Mastering grandmaster games & positional motifs', 'Advanced pawn structures & rook endgames', 'Competitive tournament preparation', 'Rapid clock management']
    },
    pathways: [
      {
        id: 'chess-pathway',
        title: 'Chess Mastery Pathway',
        ageRange: 'Ages 5 to Adults',
        description: 'From first checkmate to rated tournament competitors.',
        levels: [
          { level: 'Beginner', title: 'Chess Explorer', topics: ['Board geometry & piece movements', 'Check, checkmate & stalemate', 'Value of pieces & basic captures', 'The scholar’s mate & defense'] },
          { level: 'Intermediate', title: 'Tactical Thinker', topics: ['Forks, pins, skewers & double attacks', 'Removing the defender & deflection', 'Fundamental checkmate patterns (Ladder, Queen, Rook)', 'Opening principles'] },
          { level: 'Advanced', title: 'Strategic Player', topics: ['Pawn structures & outposts', 'Open files & rook placement', 'King & pawn endgames', 'Transitioning from opening to middlegame'] },
          { level: 'Competitive', title: 'Tournament Competitor', topics: ['In-depth opening repertoires (Italian, Sicilian, Queen’s Gambit)', 'Complex endgame technique (Lucena, Philidor)', 'Time management & score notation', 'Psychology of competition'] }
        ]
      },
      {
        id: 'scrabble-pathway',
        title: 'Scrabble & Word Strategy Pathway',
        ageRange: 'Ages 7 to Adults',
        description: 'Vocabulary expansion, board geometry strategy, probability, and tournament rack balance.',
        levels: [
          { level: 'Level 1', title: 'Word Explorer', topics: ['Rules of Scrabble & tile values', 'Prefixes, suffixes & word stems', 'High-frequency 2-letter & 3-letter word lists', 'Board bonus navigation'] },
          { level: 'Level 2', title: 'Board Strategist', topics: ['Parallel word plays & hooks', 'Triple word score defense', 'Rack balancing (Vowels vs. Consonants)', 'Anagramming 7-letter bingo words'] },
          { level: 'Level 3', title: 'Competitive Scrabble Player', topics: ['Tile tracking & opponent deduction', 'Endgame tracking & lockouts', 'Probability of drawing key letters', 'Tournament clock management'] }
        ]
      }
    ]
  },
  {
    id: 'young-creators',
    slug: 'young-creators',
    name: 'School of Young Creators',
    tagline: 'Multi-Disciplinary Discovery for Young Inquisitive Minds (Ages 4–8)',
    iconName: 'Baby',
    accentColor: '#06B6D4',
    bgGradient: 'from-cyan-600/20 to-sky-500/10',
    shortDescription: 'Integrated rotations across Coding, Music, Art, Chess, AI, and Logic to discover individual passions.',
    longDescription: 'Rather than forcing young children into narrow specializations, the Young Creators Program provides an enriching guided rotation. Children explore coding stories, keyboard tunes, digital drawings, chess pieces, and mini science experiments to discover what truly lights them up.',
    disciplines: ['Creative Coding & ScratchJr', 'Piano & Rhythm Exploration', 'Digital Art & Painting', 'Chess Discovery & Logic', 'AI Story Playground', 'Junior Science & Logic Fun'],
    stagesFramework: {
      discover: ['Playful exploration of computer, keyboard, musical notes & chess pieces', 'Discovering shapes, colors, sounds, and patterns'],
      build: ['Creating simple digital animations', 'Playing 5-finger tunes on the piano', 'Drawing characters & story scenes', 'Moving chess pieces safely'],
      apply: ['Combining art and coding in interactive stories', 'Creating musical sound effects for games', 'Solving logic maze puzzles'],
      create: ['My First Showcase Project (Story, song, or mini-game)', 'Presenting creations to parents and peers with confidence'],
      master: ['Identifying student passion & recommending a personalized specialized academy track']
    },
    pathways: [
      {
        id: 'young-creator-rotation',
        title: 'Young Creator Multi-Track Experience',
        ageRange: 'Ages 4–8',
        description: 'A 4-part rotating discovery journey designed to nurture curiosity and identify natural strengths.',
        levels: [
          { level: 'Term 1', title: 'Logic, Coding & Play', topics: ['Mouse/Touch dexterity', 'Sequencing & ScratchJr animations', 'Directional mazes & logic puzzles', 'Digital storytelling'] },
          { level: 'Term 2', title: 'Music & Sound Adventures', topics: ['Keyboard geography & high/low pitches', 'Rhythm clapping & percussion games', 'Playing first familiar nursery tunes', 'Singing & pitch matching'] },
          { level: 'Term 3', title: 'Digital Art & Creativity', topics: ['Creative painting with digital brushes', 'Color mixing & character sketching', 'Designing greeting cards & storybooks', 'Pattern making'] },
          { level: 'Term 4', title: 'Strategy & Mini Tech Showcase', topics: ['Chess piece movements & treasure hunts', 'Simple science fun (density, magnets, light)', 'AI picture stories', 'End-of-Year Young Creator Showcase'] }
        ]
      }
    ]
  },
  {
    id: 'private-tutoring',
    slug: 'private-tutoring',
    name: 'Private Learning & Tutoring Ecosystem',
    tagline: 'Custom Subject Combinations, Dedicated 1-on-1 Mentorship & Flexible Schedules',
    iconName: 'Users',
    accentColor: '#EF4444',
    bgGradient: 'from-red-600/20 to-rose-500/10',
    shortDescription: 'Personalized multi-subject bundles, vetted top tutors, online & in-person home delivery.',
    longDescription: 'Design a bespoke curriculum tailored to your child’s unique timetable and learning pace. Combine mathematics with coding, violin with digital literacy, or exam prep with French—all coordinated under a single seamless learning plan.',
    disciplines: ['Custom Multi-Subject Bundles', '1-on-1 Intensive Mentorship', 'Micro-Group Learning (2-4 peers)', 'Home Physical & Live Interactive Online', 'Weekly Progress Analytics'],
    stagesFramework: {
      discover: ['In-depth diagnostic session with student & parent', 'Identifying learning styles, strengths & gaps', 'Matching with vetted subject mentor'],
      build: ['Customized weekly curriculum design', 'Targeted concept instruction', 'Interactive live whiteboard & practical tools'],
      apply: ['Homework assistance & school syllabus alignment', 'Practical drills & project milestones', 'Confidence-building feedback'],
      create: ['Student-led milestone projects', 'Portfolio artifacts & term presentations', 'Independent study habits'],
      master: ['Long-term academic excellence', 'Standardized test mastery', 'Continuous progress reporting to parents']
    },
    pathways: [
      {
        id: 'bespoke-plan',
        title: 'Bespoke Multi-Subject Learning Plan',
        ageRange: 'All Ages (4 to Adult)',
        description: 'Combine any subjects across our 8 academies with custom schedules and tutor matching.',
        levels: [
          { level: 'Model A', title: 'Academic + Tech Blend', topics: ['Example: 2x/wk Mathematics + 1x/wk Coding & Scratch', 'Balanced academic support with 21st-century digital skills'] },
          { level: 'Model B', title: 'Creative + Musical Blend', topics: ['Example: 1x/wk Piano Keyboard + 1x/wk Graphic Design / Art', 'Nurturing right-brain artistic expression and discipline'] },
          { level: 'Model C', title: 'Exam Focus + Digital Literacy', topics: ['Example: 2x/wk WAEC/JAMB Prep + 1x/wk Office Productivity & AI', 'High-yield academic scores combined with real-world tech readiness'] }
        ]
      }
    ]
  }
];

/**
 * Jaystarbliss Dynamic Institute's four core institutional programmes.
 * Authoritative source for School Partnership applications (never maintain separate hardcoded lists).
 */
export const CORE_PARTNERSHIP_PROGRAMME_IDS = [
  'tech-programming',
  'digital-literacy',
  'creative-design',
  'music-performing-arts',
] as const;

export type CorePartnershipProgrammeId = (typeof CORE_PARTNERSHIP_PROGRAMME_IDS)[number];

export const CORE_PARTNERSHIP_PROGRAMMES: LearningSchool[] = CORE_PARTNERSHIP_PROGRAMME_IDS
  .map((id) => LEARNING_SCHOOLS.find((school) => school.id === id))
  .filter((school): school is LearningSchool => Boolean(school));

export interface SchoolDeliveryTier {
  tier: number;
  id: string;
  name: string;
  badge: string;
  frequency: string;
  duration: string;
  maxDailyHours: string;
  targetAudience: string;
  description: string;
  idealFor: string[];
  sampleSchedule: {
    days: string[];
    structure: string;
  };
  features: string[];
}

export const SCHOOL_DELIVERY_TIERS: SchoolDeliveryTier[] = [
  {
    tier: 1,
    id: 'foundation',
    name: 'Foundation Tier',
    badge: '1 Day / Week',
    frequency: '1 day per week (4 sessions / month)',
    duration: '1–2 hours per session',
    maxDailyHours: '2 hours max',
    targetAudience: 'Schools introducing Coding, clubs, or enrichment activities',
    description: 'The ideal entry point for schools looking to establish high-impact weekly clubs in Coding, Music, Chess, Creative Arts, or Computer Literacy without disrupting regular timetables.',
    idealFor: [
      'After-school coding & robotics clubs',
      'Weekly music & keyboard classes',
      'Chess & strategic games clubs',
      'Introductory computer literacy'
    ],
    sampleSchedule: {
      days: ['Wednesday or Friday Afternoon'],
      structure: '1 session weekly (1.5 hrs) focusing on guided practical projects'
    },
    features: [
      'Certified Jaystarbliss instructor deployed on-site or live interactive online',
      'Curriculum tailored to school grade levels (Grades 1–12)',
      'Termly student project presentations',
      'Certificate of club completion for every participant',
      'No hidden software or equipment licensing fees'
    ]
  },
  {
    tier: 2,
    id: 'development',
    name: 'Development Tier',
    badge: '2 Days / Week',
    frequency: '2 days per week (8 sessions / month)',
    duration: '1–2 hours per session',
    maxDailyHours: '2 hours max',
    targetAudience: 'Schools aiming for structured curriculum progression across multiple disciplines',
    description: 'Designed for institutions wanting solid continuity and repetition. Allows schools to pair complementary disciplines (e.g. Coding on Monday + Digital Literacy on Wednesday, or Keyboard on Tuesday + Recorder on Thursday).',
    idealFor: [
      'Dual-track Coding & Digital Literacy curriculum',
      'Instrumental music ensembles (Keyboard + Violin/Recorder)',
      'Creative design & web development tracks',
      'Accelerated academic support clinics'
    ],
    sampleSchedule: {
      days: ['Monday & Wednesday' , 'or Tuesday & Thursday'],
      structure: 'Day 1: Theory & guided lab (1.5 hrs) | Day 2: Practical building & projects (1.5 hrs)'
    },
    features: [
      'Dedicated lead instructor and teaching assistant (based on cohort size)',
      'Dual-discipline curriculum integration (e.g. Coding + Digital Literacy)',
      'Individual student progress dashboard and termly parent reports',
      'School showcase event at the end of each academic term',
      'Continuous teacher coordination and syllabus alignment'
    ]
  },
  {
    tier: 3,
    id: 'intensive',
    name: 'Intensive Tier',
    badge: '3 Days / Week',
    frequency: '3 days per week (12 sessions / month)',
    duration: '2–4 hours per session',
    maxDailyHours: '4 hours max instructional time',
    targetAudience: 'Premier institutional partnerships, Tech labs, and whole-school tech transformation',
    description: 'Our most comprehensive institutional delivery model. Transforms your school into a regional hub for digital innovation, creative arts, and academic excellence with deep instructional immersion.',
    idealFor: [
      'Full school Computer & ICT curriculum handover',
      'Dedicated multi-school competitive coding & chess teams',
      'Music academy integration with orchestra & choir leadership',
      'Comprehensive exam preparation clinics'
    ],
    sampleSchedule: {
      days: ['Monday, Wednesday & Friday'],
      structure: 'Mon: Digital Literacy (2h) | Wed: Programming & Robotics (2h) | Fri: Creative Design & AI (2h)'
    },
    features: [
      'Full Jaystarbliss instructional team on-site with backup instructors',
      'Turnkey computer laboratory setup guidance & hardware recommendations',
      'Custom school branding on all learning materials and digital portals',
      'National & international competition coaching (Coding Olympiads, Hackathons, Chess Championships)',
      'School administrator analytics dashboard with real-time attendance and assessment scores'
    ]
  }
];

export interface VerifiedTutor {
  id: string;
  name: string;
  title: string;
  rating: number;
  reviewCount: number;
  avatarUrl: string;
  bio: string;
  specializations: string[];
  subjects: string[];
  ageGroups: string[];
  teachingModes: ('Online' | 'Physical')[];
  experienceYears: number;
  languages: string[];
  pathwaysOffered: string[];
  availability: string;
}

export const VERIFIED_TUTORS: VerifiedTutor[] = [
  {
    id: 'tutor-john-rufai',
    name: 'John Rufai',
    title: 'Lead Technology & Mathematics Mentor',
    rating: 4.98,
    reviewCount: 142,
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
    bio: 'Software engineer and experienced technology educator passionate about helping students move from passive screen consumers to active creators and algorithmic thinkers.',
    specializations: ['Primary & Junior Mathematics', 'Scratch & Python Programming', 'Digital Literacy & Office Suite', 'AI Playground'],
    subjects: ['Mathematics', 'Coding', 'Python', 'Scratch', 'Digital Literacy', 'AI Tools'],
    ageGroups: ['5–7 years', '8–11 years', '12–16 years'],
    teachingModes: ['Online', 'Physical'],
    experienceYears: 7,
    languages: ['English', 'Yoruba'],
    pathwaysOffered: [
      'Young Coders Pathway',
      'Junior Programming Pathway',
      'Junior Digital Explorers',
      'Junior Secondary Mathematics Development'
    ],
    availability: 'Weekdays (Afternoons) & Saturdays'
  },
  {
    id: 'tutor-amara-o',
    name: 'Amara Okonkwo',
    title: 'Senior Music & Performance Instructor',
    rating: 4.95,
    reviewCount: 98,
    avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80',
    bio: 'Conservatory-trained pianist and violin instructor specializing in early childhood musical ear training, notation reading, and classical/contemporary keyboard accompaniment.',
    specializations: ['Keyboard & Piano', 'Violin Technique', 'Comprehensive Music Theory', 'Vocal Coaching'],
    subjects: ['Keyboard', 'Violin', 'Recorder', 'Music Theory', 'Sight Reading'],
    ageGroups: ['4–7 years', '8–12 years', '13+ years & Adults'],
    teachingModes: ['Online', 'Physical'],
    experienceYears: 6,
    languages: ['English', 'Igbo'],
    pathwaysOffered: [
      'Keyboard Explorer to Performer',
      'Violin Strings Foundation',
      'Recorder Ensemble Pathway',
      'Music Theory Mastery'
    ],
    availability: 'Tuesdays, Thursdays & Saturday Mornings'
  },
  {
    id: 'tutor-david-k',
    name: 'David Kalu',
    title: 'Creative Design & Full-Stack Web Mentor',
    rating: 4.92,
    reviewCount: 84,
    avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
    bio: 'Product designer and frontend engineer teaching visual identity, Figma UI/UX, responsive web coding, and creative digital illustration for teenagers and aspiring creators.',
    specializations: ['Graphic Design & Branding', 'Figma & UI/UX', 'HTML/CSS & JavaScript', 'Digital Illustration'],
    subjects: ['Graphic Design', 'Web Development', 'Digital Art', 'Canva & Figma', 'UI/UX'],
    ageGroups: ['9–13 years', '14–18 years', 'Adults'],
    teachingModes: ['Online', 'Physical'],
    experienceYears: 5,
    languages: ['English'],
    pathwaysOffered: [
      'Graphic Design & Branding Pathway',
      'Web Development Foundations',
      'Digital Art & Illustration'
    ],
    availability: 'Mondays, Wednesdays & Friday Evenings'
  },
  {
    id: 'tutor-blessing-e',
    name: 'Blessing Emmanuel',
    title: 'Academic Excellence & Exam Prep Lead',
    rating: 4.97,
    reviewCount: 116,
    avatarUrl: 'https://images.unsplash.com/photo-1580894732444-8ecded7900cd?auto=format&fit=crop&w=400&q=80',
    bio: 'Dedicated educator specializing in English grammar, creative writing, and high-yield WAEC/JAMB/Checkpoint sciences with a track record of top percentile student outcomes.',
    specializations: ['English Grammar & Creative Writing', 'Physics & Chemistry', 'WAEC & JAMB Preparation', 'Common Entrance Drills'],
    subjects: ['English', 'Physics', 'Chemistry', 'General Science', 'Exam Prep'],
    ageGroups: ['7–11 years', '12–16 years', '17+ & Exam Candidates'],
    teachingModes: ['Online', 'Physical'],
    experienceYears: 8,
    languages: ['English'],
    pathwaysOffered: [
      'English Language & Literacy Pathway',
      'Senior Sciences (Physics & Chemistry)',
      'High-Yield WAEC/JAMB Bootcamp'
    ],
    availability: 'Weekdays (Morning & Evening) & Sundays'
  },
  {
    id: 'tutor-samuel-t',
    name: 'Coach Samuel Taiwo',
    title: 'National Chess & Scrabble Arbiter',
    rating: 4.94,
    reviewCount: 65,
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80',
    bio: 'Certified chess coach and tactical trainer. Has coached multiple inter-school champion teams, instilling strategic patience, tactical foresight, and sportsmanship.',
    specializations: ['Chess Tactics & Openings', 'Competitive Scrabble', 'Critical Thinking & Logic', 'Tournament Preparation'],
    subjects: ['Chess', 'Scrabble', 'Logic Games', 'Critical Thinking'],
    ageGroups: ['5–8 years', '9–14 years', 'Teens & Adults'],
    teachingModes: ['Online', 'Physical'],
    experienceYears: 9,
    languages: ['English', 'Yoruba'],
    pathwaysOffered: [
      'Chess Mastery Pathway (Beginner to Tournament)',
      'Scrabble Word Strategy Pathway',
      'Logic & Strategic Mindset'
    ],
    availability: 'Wednesdays, Fridays & Saturday Afternoons'
  }
];
