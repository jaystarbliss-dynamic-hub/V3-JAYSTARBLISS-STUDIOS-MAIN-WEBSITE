import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Layers,
  LayoutGrid,
  FileText,
  Users,
  GraduationCap,
  ShieldCheck,
  Maximize2,
  Minimize2,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';

interface WireframeBoard {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  routesCovered: string[];
  oldPainPoints: string[];
  newSolutions: string[];
  tabsMapped: { tabName: string; layoutPattern: string; description: string }[];
}

const WIREFRAME_BOARDS: WireframeBoard[] = [
  {
    id: 'sitemap',
    number: 'Board 01',
    title: 'Complete Portal Information Architecture & 38-Page Tab Map',
    subtitle:
      'Master blueprint mapping all 5 ecosystems: Tutor/Staff Portal, Scholar/Student Portal, Partner School Portal, Parent Portal, and Super Admin Command Center.',
    imageUrl: '/assets/wireframes/01-portal-sitemap-architecture.svg',
    routesCovered: [
      '/portal/staff/*',
      '/portal/student/*',
      '/portal/school/*',
      '/portal/parent/*',
      '/admin/*',
    ],
    oldPainPoints: [
      'Pages mixed creation forms, historical records, and live monitoring into single 4,000+ line vertical scrolls.',
      'Available students were rendered as cramped checkbox pills without distinguishing School-Assigned vs. Private Learners.',
      'RBAC role filters were hidden in closed dropdowns and contaminated by duplicate/legacy records.',
    ],
    newSolutions: [
      'Zero-Scroll Split Workspaces across all complex tabs (Assessments, Assignments, Scholars, Staff).',
      'Master-Detail tables paired with a docked 360° Inspector Drawer on the right.',
      'Universal [All Available | School-Assigned | Private Learners] segmented switcher on every learner list.',
    ],
    tabsMapped: [
      {
        tabName: '1. Tutor & Staff Portal (11 Tabs)',
        layoutPattern: 'Left Navigation + Split Studio Canvas',
        description:
          'Dashboard, Assigned Learners, Assessments Studio, Assessment History, Assignments & Review, Milestone Roadmap, Live Classes, Calendar, Subjects, Student Access, Lesson Resources, Billing, Agreements, Support, Settings.',
      },
      {
        tabName: '2. Scholar / Student Portal (10 Tabs)',
        layoutPattern: 'Focused Learning Canvas + 3-State Exam Hub',
        description:
          'Dashboard, Learning Tracks, Assessments & Work (Available Now vs. Submitted vs. Released Results), Assignments, Milestones, Live Classrooms, Schedules, Achievements, Ed Club, Resources.',
      },
      {
        tabName: '3. Partner School Portal (10 Tabs)',
        layoutPattern: 'Grade Cohort Bar + Broadsheet Matrix',
        description:
          'School Dashboard, Class Schedules, Assessment Overview, Assessment History, Learner Progress, Learners Roster, Student Access, Fees & Payments, Agreements, Institutional Resources.',
      },
      {
        tabName: '4. Parent & Guardian Portal (8 Tabs)',
        layoutPattern: 'Persistent Multi-Child Switcher Bar + Report Cards',
        description:
          'Parent Dashboard, Linked Children Switcher, Class Schedules, Assignments, Assessments & Quizzes, Released Assessment Results, Payments & Fees, Agreements.',
      },
      {
        tabName: '5. Admin Command Center (18 Tabs)',
        layoutPattern: 'Segmented RBAC Bars + Master-Detail Drawers',
        description:
          'Overview, Inquiries, Activity Logs, Pages CMS, Programs, Services, Portfolio, Kids Zone, Blog, Approvals, Scholars & Students, Billings, Agreements, Faculty & Staff, Tutor Subjects, Affiliated Schools, Schedules, CBT Assessments, Users & RBAC.',
      },
    ],
  },
  {
    id: 'assessments',
    number: 'Board 02',
    title: 'Tutor & Admin Assessment Studio (Zero-Scroll Split Workspace)',
    subtitle:
      'Eliminates scrolling down 4,900 lines to see Assessment History or Monitor Responses by placing the Assessment Directory on a pinned left rail and a 4-Mode Studio Switcher on the right.',
    imageUrl: '/assets/wireframes/02-tutor-assessment-studio.svg',
    routesCovered: [
      '/portal/staff/assessments',
      '/portal/staff/exams',
      '/portal/staff/exam-history',
      '/admin/examinations',
      '/admin/examination-history',
    ],
    oldPainPoints: [
      'To see existing assessments or monitor student responses, tutors had to scroll all the way past the entire question builder to line 4,450.',
      'Switching between creating questions, checking who submitted, and releasing results required constant up-and-down page scrolling.',
      'Recipient selection used tiny checkboxes in a 128px box.',
    ],
    newSolutions: [
      'Pinned Left Column (32% width): Searchable Assessment Directory & History is ALWAYS visible alongside the editor with 1-click "Monitor & Release" and "Edit" buttons.',
      'Top 4-Mode Studio Bar (68% width): Switch instantaneously between [1. Audience & Setup] · [2. Question Builder] · [3. Live Proctor & Release Results] · [4. Timing, Rules & Header] with zero page scroll.',
      '1-Click Batch Result Release bar directly inside Tab 3 (Live Proctor & Grading Queue).',
    ],
    tabsMapped: [
      {
        tabName: 'Left Rail: Assessment Directory & History',
        layoutPattern: 'Pinned Searchable List + Work-Type Filter (All / Exams / Tests / Assignments / Activities)',
        description:
          'Displays every assessment card with status badges (Published, Draft, X Awaiting Release), Access Code (JDI-XXXXXX), and 1-click buttons to Monitor Responses or Edit.',
      },
      {
        tabName: 'Studio Mode 1: Audience & Setup',
        layoutPattern: 'Work-Type Bar + Categorized Learner List',
        description:
          'Choose School & Class or Private Learners using the open structured list with [All Available | School-Assigned | Private Learners] tabs.',
      },
      {
        tabName: 'Studio Mode 2: Question Builder & Smart Import',
        layoutPattern: 'Question Index Rail + Focused Question Editor + Text/CSV Importer',
        description:
          'Author multiple-choice or theory questions, paste formatted scripts, or upload CSVs without cluttering the screen.',
      },
      {
        tabName: 'Studio Mode 3: Live Proctor & Release Results',
        layoutPattern: 'KPI Strip + Submissions Table + Slide-Over Script Grader',
        description:
          'Monitor live student attempts in real time, inspect individual question scripts, add tutor feedback presets, and click "Release Result" (single or batch).',
      },
      {
        tabName: 'Studio Mode 4: Timing, Rules & Official Header',
        layoutPattern: 'Clean 2-Column Configuration Grid',
        description:
          'Duration timer, availability window, passcode generator, shuffle toggles, and Official School Document Header Customizer.',
      },
    ],
  },
  {
    id: 'scholars',
    number: 'Board 03',
    title: 'Scholars & Students Command Center (Master-Detail + 360° Inspector Drawer)',
    subtitle:
      'De-clutters the "choking" Scholar & Student tabs by separating the scannable roster table from a docked right-hand 360° Scholar Inspector Drawer.',
    imageUrl: '/assets/wireframes/03-scholars-students-directory.svg',
    routesCovered: [
      '/admin/students',
      '/portal/staff/students',
      '/portal/staff/student/:studentId',
      '/portal/staff/credentials',
      '/portal/school/roster',
    ],
    oldPainPoints: [
      'The Scholars page stacked huge resource dispatch forms, school cards, filter dropdowns, and 8 action buttons per row—making the interface feel cramped and overwhelming.',
      'Hard to tell at a glance whether a student was School-Assigned or a Private/Parent-Enrolled learner.',
      'Assigning tutors, linking parents, and copying access codes opened separate disconnected modals.',
    ],
    newSolutions: [
      'Open Top Segmented Bar: Instant 1-click filtering between [All Scholars] · [School-Assigned] · [Private / Parent-Enrolled] · [By Partner School].',
      'Clean Left Master Table (65% width): Shows Scholar Name, Category Badge (Blue for School-Assigned, Purple for Private/Parent), Grade, Assigned Tutor, and 1-Click Copy Access Code.',
      'Docked Right 360° Inspector Drawer (35% width): Clicking any scholar opens their complete profile with 3 sub-tabs: [1. Profile & Access] · [2. Tutors & Parent Link] · [3. Direct Dispatch].',
    ],
    tabsMapped: [
      {
        tabName: 'Inspector Sub-Tab 1: Profile & Access Credentials',
        layoutPattern: 'Passcode Card + 1-Click View-As Impersonation',
        description:
          'Displays @username, JDI-XXXXXX passcode with 1-click copy/regenerate, portal access toggle, and "View As Scholar" button.',
      },
      {
        tabName: 'Inspector Sub-Tab 2: Assigned Tutors & Parent Link',
        layoutPattern: 'Unified Mentor & Guardian Linker',
        description:
          'Link or change the student’s Parent account (syncing across users, parents, students, and individualStudents) and assign Lead/Support Tutors.',
      },
      {
        tabName: 'Inspector Sub-Tab 3: Direct Work & Link Dispatch',
        layoutPattern: 'Compact Slide-Over Form + Dispatch History',
        description:
          'Send a personal Google Meet class link or study resource directly to the selected scholar without cluttering the main directory.',
      },
    ],
  },
  {
    id: 'tutor-workspace',
    number: 'Board 04',
    title: 'Tutor Teaching Workspace (Dashboard, Assignments, Milestones & Resources)',
    subtitle:
      'Streamlines daily teaching workflows so tutors can see all School-Assigned and Private learners, grade homework side-by-side, track curriculum milestones, and distribute resources.',
    imageUrl: '/assets/wireframes/04-tutor-teaching-workspace.svg',
    routesCovered: [
      '/portal/staff',
      '/portal/staff/assignments',
      '/portal/staff/milestones',
      '/portal/staff/classes',
      '/portal/staff/resources',
    ],
    oldPainPoints: [
      'Tutors could not easily switch between their School-Assigned cohorts and Private Learners across Assignments, Milestones, and Resources.',
      'Grading student assignments required opening and closing separate views instead of a side-by-side review queue.',
    ],
    newSolutions: [
      'Tutor Dashboard (/portal/staff): 3-KPI summary strip (Assigned Schools, School-Assigned Scholars, Private Learners) + categorized learner directory.',
      'Assignments & Review (/portal/staff/assignments): Left submission queue (Needs Grading / Active / Graded) + Right side-by-side grading pane with remark presets.',
      'Milestone Roadmap & Resource Library: Unified target selector supporting both School Grade Cohorts and Individual Private Learners.',
    ],
    tabsMapped: [
      {
        tabName: 'Tab A: Tutor Dashboard & Assigned Learners',
        layoutPattern: '3-KPI Strip + Segmented Learner Roster',
        description:
          'Immediate visibility into every assigned student with 1-click links to Open Workspace, Assignments, Milestones, and Access Codes.',
      },
      {
        tabName: 'Tab B: Assignments & Coursework Review',
        layoutPattern: 'Split Queue (Left Submissions + Right Grading Pane)',
        description:
          'Click any submitted deliverable to preview the link/file, enter a score out of 100, insert a remark preset, and notify the scholar and parent.',
      },
      {
        tabName: 'Tab C: Curriculum Milestone Roadmap',
        layoutPattern: 'Cohort/Learner Selector + Module Checklists',
        description:
          'Track module mastery across partner school classes or individual private learners.',
      },
      {
        tabName: 'Tab D: Live Classes & Lesson Resource Library',
        layoutPattern: 'Session Roll-Call Bar + Categorized Resource Uploader',
        description:
          'Launch virtual classes, record attendance, and distribute lesson notes to School Classes or Private Learners.',
      },
    ],
  },
  {
    id: 'student-parent-school',
    number: 'Board 05',
    title: 'Scholar Portal, Parent Portal & Partner School Portal Architecture',
    subtitle:
      'Clean, accessible interfaces for Scholars taking assessments, Parents monitoring multiple linked children, and Partner Schools managing class rosters and results.',
    imageUrl: '/assets/wireframes/05-student-parent-school-portals.svg',
    routesCovered: [
      '/portal/student/*',
      '/portal/parent/*',
      '/portal/school/*',
    ],
    oldPainPoints: [
      'Published tests could appear confusingly mixed with completed items on the student end instead of clearly separating Available Now vs. Submitted vs. Released Results.',
      'Parents with multiple children (e.g., Eno Torru with Jayden, Shawn & Emmanuella; Aniebiet Udofia with Zoe & Joanna) needed a persistent child switcher bar across all tabs.',
      'School admins needed a single grade-filtered broadsheet to view scores and export access codes.',
    ],
    newSolutions: [
      'Scholar Assessment Hub: 3 explicit tabs — [1. Available to Take Now (Passcode Entry)] · [2. Submitted · Awaiting Release] · [3. Official Released Results & Report Cards].',
      'Parent Multi-Child Switcher Bar: Pinned at the top of the Parent Portal so parents can switch between their linked children in one click and download official PDF report cards.',
      'Partner School Portal: Horizontal Grade Filter bar (Grade 1–12), 1-click Passcode CSV export, and School Result Broadsheet.',
    ],
    tabsMapped: [
      {
        tabName: 'Panel A: Scholar / Student Portal (/portal/student)',
        layoutPattern: '3-State Assessment Hub + Next Live Class Banner',
        description:
          'Eliminates exam lockout confusion by separating active passcode-ready tests from completed attempts and released report cards.',
      },
      {
        tabName: 'Panel B: Parent & Guardian Portal (/portal/parent)',
        layoutPattern: 'Persistent Child Switcher + Released Results Archive',
        description:
          'Displays each linked child’s assigned tutor, student passcode, attendance, homework status, and printable exam report cards.',
      },
      {
        tabName: 'Panel C: Partner School Portal (/portal/school)',
        layoutPattern: 'Grade Filter Bar + Roster & Assessment Broadsheet',
        description:
          'Gives school administrators full visibility into their enrolled grades, student access codes, and assessment performance.',
      },
    ],
  },
];

export default function PortalWireframesShowcase() {
  const [activeBoardId, setActiveBoardId] = useState<string>(WIREFRAME_BOARDS[0].id);
  const [isFullscreenImage, setIsFullscreenImage] = useState<boolean>(false);

  const activeBoard =
    WIREFRAME_BOARDS.find((b) => b.id === activeBoardId) || WIREFRAME_BOARDS[0];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Top Sticky Architecture Bar */}
      <header className="sticky top-0 z-40 bg-slate-900 text-white border-b border-slate-800 px-4 sm:px-8 py-3.5">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-600 flex items-center justify-center font-black text-sm shrink-0">
              JB
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-black tracking-tight">
                Jaystarbliss Portal Redesign — Interactive Wireframe &amp; Architecture Studio
              </h1>
              <p className="text-[11px] text-slate-400">
                Complete visual blueprint mapping every portal, page, and sub-tab before full UI implementation
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              to="/portal/staff/assessments"
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 inline-flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeft size={14} /> Tutor Portal
            </Link>
            <Link
              to="/admin"
              className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white inline-flex items-center gap-1.5 transition-colors"
            >
              <ShieldCheck size={14} /> Admin Console
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto px-4 sm:px-8 py-6 space-y-6">
        {/* 5-Board Selector Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {WIREFRAME_BOARDS.map((board) => {
            const selected = board.id === activeBoard.id;
            return (
              <button
                key={board.id}
                type="button"
                onClick={() => setActiveBoardId(board.id)}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                  selected
                    ? 'bg-slate-900 text-white border-slate-900 dark:bg-blue-950/80 dark:border-blue-500 shadow-md'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                      selected
                        ? 'bg-red-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {board.number}
                  </span>
                  <span className="text-[10px] font-mono opacity-75">
                    {board.tabsMapped.length} Sections
                  </span>
                </div>
                <p className="text-xs font-black leading-snug line-clamp-2">{board.title}</p>
              </button>
            );
          })}
        </div>

        {/* Active Wireframe Visual Canvas */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
          <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-md bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300 text-xs font-black uppercase">
                  {activeBoard.number}
                </span>
                <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                  {activeBoard.title}
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-4xl">
                {activeBoard.subtitle}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {activeBoard.routesCovered.map((rt) => (
                <code
                  key={rt}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300"
                >
                  {rt}
                </code>
              ))}
              <button
                type="button"
                onClick={() => setIsFullscreenImage((prev) => !prev)}
                className="px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-blue-600 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
              >
                {isFullscreenImage ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                <span>{isFullscreenImage ? 'Exit Full Width' : 'Expand Wireframe'}</span>
              </button>
            </div>
          </div>

          {/* High-Resolution Wireframe Image Render */}
          <div className="bg-slate-100 dark:bg-slate-950 p-3 sm:p-6 flex items-center justify-center overflow-x-auto">
            <img
              src={activeBoard.imageUrl}
              alt={activeBoard.title}
              referrerPolicy="no-referrer"
              className={`w-full rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm bg-white ${
                isFullscreenImage ? 'max-w-none' : 'max-w-[1400px]'
              }`}
            />
          </div>

          {/* Before vs. After & Tab-by-Tab Architectural Breakdown */}
          <div className="p-4 sm:p-6 border-t border-slate-100 dark:border-slate-800 space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Old Pain Points */}
              <div className="p-4 rounded-xl bg-red-50/60 dark:bg-red-950/20 border border-red-200/80 dark:border-red-900/50 space-y-2.5">
                <div className="flex items-center gap-2 text-red-800 dark:text-red-300 font-black text-xs uppercase tracking-wider">
                  <AlertTriangle size={15} />
                  <span>What Was Choking &amp; Cluttered Before</span>
                </div>
                <ul className="space-y-2 text-xs text-red-900/90 dark:text-red-200/90">
                  {activeBoard.oldPainPoints.map((pt, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="font-bold">•</span>
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* New Redesign Solutions */}
              <div className="p-4 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/50 space-y-2.5">
                <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-black text-xs uppercase tracking-wider">
                  <CheckCircle2 size={15} />
                  <span>How the New Wireframe Solves It</span>
                </div>
                <ul className="space-y-2 text-xs text-emerald-900/90 dark:text-emerald-200/90">
                  {activeBoard.newSolutions.map((sol, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="font-bold">✓</span>
                      <span>{sol}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Detailed Tab-by-Tab Specification Table */}
            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-2">
                <Layers size={14} className="text-blue-600" />
                <span>Every Tab &amp; Sub-Panel Mapped in {activeBoard.number}</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {activeBoard.tabsMapped.map((tab, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/50 space-y-1.5"
                  >
                    <p className="text-xs font-black text-slate-900 dark:text-white">
                      {tab.tabName}
                    </p>
                    <p className="text-[11px] font-bold text-blue-600 dark:text-blue-400">
                      Layout: {tab.layoutPattern}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      {tab.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* All 5 Wireframe Boards Overview Strip at Bottom */}
        <section className="space-y-3 pt-2">
          <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Sparkles size={16} className="text-red-600" />
            <span>All 5 Wireframe Boards at a Glance (Click Any Board to Inspect)</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {WIREFRAME_BOARDS.map((board) => (
              <div
                key={board.id}
                onClick={() => {
                  setActiveBoardId(board.id);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="group rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-xs hover:border-blue-500 transition-all cursor-pointer space-y-2"
              >
                <div className="flex items-center justify-between gap-2 px-1">
                  <span className="text-xs font-black text-slate-900 dark:text-white group-hover:text-blue-600">
                    {board.number}: {board.title}
                  </span>
                  <span className="text-[11px] font-bold text-blue-600">Inspect →</span>
                </div>
                <img
                  src={board.imageUrl}
                  alt={board.title}
                  referrerPolicy="no-referrer"
                  className="w-full rounded-xl border border-slate-100 dark:border-slate-800"
                />
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
