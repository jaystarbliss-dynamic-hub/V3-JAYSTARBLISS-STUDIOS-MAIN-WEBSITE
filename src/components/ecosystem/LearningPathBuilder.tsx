import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  User,
  Target,
  Clock,
  Sparkles,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Calendar,
  Send,
  Layers,
  Award,
  Sliders,
} from 'lucide-react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Link } from 'react-router-dom';

const AGE_GROUPS = [
  { id: 'kids-6-9', label: 'Junior Explorers', ageRange: 'Ages 6–9', desc: 'Visual block coding, digital literacy, creative art & foundational math/English' },
  { id: 'preteens-10-13', label: 'Middle Builders', ageRange: 'Ages 10–13', desc: 'Python, web development, 3D game creation, animation & school STEM' },
  { id: 'teens-14-18', label: 'Senior Innovators', ageRange: 'Ages 14–18', desc: 'Full-stack engineering, AI, UI/UX design, SAT/IGCSE/WAEC & university prep' },
  { id: 'adults', label: 'University & Adults', ageRange: 'Ages 18+', desc: 'Career-track software engineering, data science, product design & executive tech' },
];

const INTEREST_AREAS = [
  { id: 'coding-ai', label: 'Coding, Web & AI Engineering', school: 'School of Technology & Programming' },
  { id: 'digital-lit', label: 'Computer Fluency & Cloud Productivity', school: 'School of Digital Literacy & Computing' },
  { id: 'design-uiux', label: 'Graphic Design, Branding & UI/UX', school: 'School of Creative Design & Visual Arts' },
  { id: 'video-anim', label: '2D/3D Animation & Video Production', school: 'School of Video, Animation & Media' },
  { id: 'game-dev', label: '3D Modeling, Roblox & Game Dev', school: 'School of 3D Worlds & Game Development' },
  { id: 'stem-academics', label: 'Mathematics, Sciences & English Tutoring', school: 'School of Core Academics & STEM Excellence' },
  { id: 'exam-prep', label: 'Global Exam Prep (SAT, IGCSE, IELTS) & Languages', school: 'School of Global Exams & Languages' },
  { id: 'robotics-iot', label: 'Applied AI, Virtual Robotics & Smart Tech', school: 'School of AI, Robotics & Future Tech' },
];

const LEARNING_GOALS = [
  { id: 'portfolio', label: 'Build Real Projects & Creator Portfolio', detail: 'Ship tangible apps, games, designs, and creative work' },
  { id: 'grades', label: 'Boost School Grades & Exam Distinctions', detail: 'Achieve top-percentile scores in school & board exams' },
  { id: 'career', label: 'Future-Proof Tech & Career Readiness', detail: 'Acquire industry-grade engineering and digital skills early' },
  { id: 'confidence', label: 'Develop Problem-Solving & Creative Confidence', detail: 'Turn passive screen time into structured creation' },
];

const PACING_OPTIONS = [
  { id: 'standard', label: 'Balanced Weekly Pace', sessions: '2 Live Sessions / Week', format: '1-on-1 or Small Pod (Online / Hybrid)' },
  { id: 'intensive', label: 'Accelerated Mastery Pace', sessions: '3–4 Live Sessions / Week', format: 'Dedicated 1-on-1 Mentorship' },
  { id: 'weekend', label: 'Weekend Creator Studio', sessions: 'Saturday & Sunday Deep Dives', format: 'Flexible Weekend Schedule' },
];

const STEPS = [
  { number: 1, title: 'Learner Profile', subtitle: 'Age & Stage', icon: User },
  { number: 2, title: 'Focus & Goals', subtitle: 'Disciplines', icon: Target },
  { number: 3, title: 'Study Cadence', subtitle: 'Schedule', icon: Clock },
  { number: 4, title: 'Custom Blueprint', subtitle: 'Your Roadmap', icon: Sparkles },
];

export default function LearningPathBuilder() {
  const [step, setStep] = useState(1);
  const [selectedAge, setSelectedAge] = useState<string>('preteens-10-13');
  const [selectedInterests, setSelectedInterests] = useState<string[]>(['coding-ai']);
  const [selectedGoal, setSelectedGoal] = useState<string>('portfolio');
  const [selectedPace, setSelectedPace] = useState<string>('standard');

  // Lead capture state
  const [parentName, setParentName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const toggleInterest = (id: string) => {
    setSelectedInterests((prev) =>
      prev.includes(id)
        ? prev.length > 1
          ? prev.filter((item) => item !== id)
          : prev
        : prev.length < 3
        ? [...prev, id]
        : prev
    );
  };

  const ageObj = AGE_GROUPS.find((a) => a.id === selectedAge) || AGE_GROUPS[1];
  const interestObjs = INTEREST_AREAS.filter((i) => selectedInterests.includes(i.id));
  const goalObj = LEARNING_GOALS.find((g) => g.id === selectedGoal) || LEARNING_GOALS[0];
  const paceObj = PACING_OPTIONS.find((p) => p.id === selectedPace) || PACING_OPTIONS[0];

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parentName.trim() || !email.trim()) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const selectedTrackTitles = interestObjs.map((i) => i.label);
      const summaryMessage = [
        `Custom Pathfinder Blueprint`,
        `Learner Profile: ${ageObj.label} (${ageObj.ageRange})`,
        `Primary Goal: ${goalObj.label}`,
        `Study Cadence: ${paceObj.label} (${paceObj.sessions})`,
        `Selected Tracks: ${selectedTrackTitles.join(', ')}`,
      ].join(' | ');

      // Uses exact allowed keys from firestore.rules for 'inquiries'
      await addDoc(collection(db, 'inquiries'), {
        name: parentName.trim(),
        email: email.trim(),
        phone: phone.trim() || 'Not provided',
        type: 'custom_learning_path',
        programsOfInterest: selectedTrackTitles,
        message: summaryMessage,
        source: 'programs_pathfinder_wizard',
        createdAt: new Date().toISOString(),
      });
      setSubmitted(true);
    } catch (err) {
      console.error('Failed to save custom learning path:', err);
      setSubmitError('Unable to submit right now. Please try again or proceed to registration.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div id="path-builder-section" className="scroll-mt-28">
      <div className="bg-slate-950 text-white rounded-3xl border border-slate-800 shadow-2xl overflow-hidden">
        {/* Top Portal-Style Wizard Header */}
        <div className="bg-slate-900/90 px-6 sm:px-10 py-8 border-b border-slate-800 relative overflow-hidden">
          <div className="absolute -top-24 right-0 w-96 h-64 bg-brand-red/15 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.22em] text-brand-red mb-2">
                Interactive Curriculum Configurator · 4-Step Portal Flow
              </p>
              <h2 className="text-2xl sm:text-4xl font-extrabold font-display tracking-tight text-white">
                Configure Your Custom Learning Path
              </h2>
              <p className="text-slate-400 text-sm sm:text-base mt-1.5 max-w-2xl">
                Answer three quick questions to generate a tailored 5-stage syllabus and mentorship schedule.
              </p>
            </div>

            <div className="text-xs font-extrabold uppercase tracking-[0.2em] text-slate-400">
              Step 0{step} of 04
            </div>
          </div>

          {/* Interactive Registration-Style Progress Stepper */}
          <div className="relative z-10 mt-8 pt-6 border-t border-slate-800/80">
            <div className="grid grid-cols-4 gap-2 sm:gap-4">
              {STEPS.map((s) => {
                const Icon = s.icon;
                const isActive = step === s.number;
                const isCompleted = step > s.number;

                return (
                  <button
                    key={s.number}
                    type="button"
                    onClick={() => setStep(s.number)}
                    className={`group text-left p-3 sm:p-4 rounded-2xl border transition-all cursor-pointer ${
                      isActive
                        ? 'bg-brand-red text-white border-brand-red shadow-lg shadow-brand-red/25'
                        : isCompleted
                        ? 'bg-slate-950 text-white border-brand-red/50 hover:border-brand-red'
                        : 'bg-slate-950/60 text-slate-500 border-slate-800 hover:border-slate-700 hover:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-extrabold uppercase tracking-widest">
                        0{s.number} · {s.subtitle}
                      </span>
                      {isCompleted ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <Icon className="w-4 h-4 shrink-0 opacity-80" />
                      )}
                    </div>
                    <p className="text-xs sm:text-sm font-extrabold font-display truncate">
                      {s.title}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Interactive Step Workspace */}
        <div className="p-6 sm:p-10 lg:p-12">
          <AnimatePresence mode="wait">
            {/* STEP 1: LEARNER PROFILE */}
            {step === 1 && (
              <motion.div
                key="wizard-step-1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="max-w-4xl mx-auto"
              >
                <div className="mb-6">
                  <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-brand-red mb-1">
                    Step 01 · Learner Stage
                  </p>
                  <h3 className="text-xl sm:text-2xl font-extrabold text-white font-display">
                    Who are we designing this pathway for?
                  </h3>
                </div>

                {/* Interactive Selection Rows (Registration Portal Style) */}
                <div className="divide-y divide-slate-800/90 border border-slate-800 rounded-2xl overflow-hidden bg-slate-900/60">
                  {AGE_GROUPS.map((group) => {
                    const active = selectedAge === group.id;
                    return (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => setSelectedAge(group.id)}
                        className={`w-full p-5 sm:p-6 text-left transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer ${
                          active
                            ? 'bg-brand-red/15 border-l-4 border-l-brand-red'
                            : 'hover:bg-slate-900/90'
                        }`}
                      >
                        <div className="flex items-start sm:items-center gap-4">
                          <div
                            className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 mt-0.5 sm:mt-0 transition-colors ${
                              active
                                ? 'bg-brand-red border-brand-red text-white'
                                : 'border-slate-700 bg-slate-950 text-transparent'
                            }`}
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-base sm:text-lg font-extrabold text-white font-display">
                                {group.label}
                              </span>
                              <span className="text-xs font-extrabold uppercase tracking-wider text-brand-red">
                                · {group.ageRange}
                              </span>
                            </div>
                            <p className="text-xs sm:text-sm text-slate-400 mt-1">
                              {group.desc}
                            </p>
                          </div>
                        </div>

                        <span
                          className={`text-xs font-extrabold uppercase tracking-wider shrink-0 ${
                            active ? 'text-white' : 'text-slate-500'
                          }`}
                        >
                          {active ? 'Selected' : 'Select →'}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-8 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="inline-flex items-center gap-2 bg-brand-red hover:bg-rose-600 text-white font-bold px-8 py-4 rounded-xl transition-all shadow-lg shadow-brand-red/25 cursor-pointer text-sm"
                  >
                    Continue to Focus & Goals <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP 2: INTERESTS & PRIMARY GOAL */}
            {step === 2 && (
              <motion.div
                key="wizard-step-2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="max-w-4xl mx-auto space-y-8"
              >
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-4">
                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-brand-red mb-1">
                        Step 02 · Disciplines & Objectives
                      </p>
                      <h3 className="text-xl sm:text-2xl font-extrabold text-white font-display">
                        Select up to 3 core disciplines to combine
                      </h3>
                    </div>
                    <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                      {selectedInterests.length} / 3 Selected
                    </span>
                  </div>

                  {/* Sleek Interactive Toggle List */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {INTEREST_AREAS.map((item) => {
                      const active = selectedInterests.includes(item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => toggleInterest(item.id)}
                          className={`p-4 rounded-xl border text-left transition-all flex items-center justify-between gap-3 cursor-pointer ${
                            active
                              ? 'bg-brand-red/15 border-brand-red text-white shadow-md'
                              : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:border-slate-700 hover:text-white'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-bold truncate">{item.label}</p>
                            <p className="text-[11px] text-slate-400 truncate mt-0.5">
                              {item.school}
                            </p>
                          </div>
                          <div
                            className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                              active
                                ? 'bg-brand-red border-brand-red text-white'
                                : 'border-slate-700 bg-slate-950 text-transparent'
                            }`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Primary Outcome Selector */}
                <div className="pt-6 border-t border-slate-800">
                  <h4 className="text-sm font-extrabold uppercase tracking-wider text-slate-300 mb-4 flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-brand-red" /> Primary Outcome Priority
                  </h4>
                  <div className="divide-y divide-slate-800 border border-slate-800 rounded-2xl overflow-hidden bg-slate-900/60">
                    {LEARNING_GOALS.map((goal) => {
                      const active = selectedGoal === goal.id;
                      return (
                        <button
                          key={goal.id}
                          type="button"
                          onClick={() => setSelectedGoal(goal.id)}
                          className={`w-full p-4 sm:p-5 text-left transition-all flex items-center justify-between gap-4 cursor-pointer ${
                            active ? 'bg-brand-red/15 border-l-4 border-l-brand-red' : 'hover:bg-slate-900'
                          }`}
                        >
                          <div>
                            <p className="text-sm sm:text-base font-bold text-white">
                              {goal.label}
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5">{goal.detail}</p>
                          </div>
                          <div
                            className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                              active
                                ? 'bg-brand-red border-brand-red text-white'
                                : 'border-slate-700 bg-slate-950 text-transparent'
                            }`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="inline-flex items-center gap-2 text-slate-400 hover:text-white font-bold px-4 py-3 cursor-pointer text-sm"
                  >
                    <ArrowLeft className="w-4 h-4" /> Previous Step
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="inline-flex items-center gap-2 bg-brand-red hover:bg-rose-600 text-white font-bold px-8 py-4 rounded-xl transition-all shadow-lg shadow-brand-red/25 cursor-pointer text-sm"
                  >
                    Continue to Study Cadence <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP 3: STUDY CADENCE */}
            {step === 3 && (
              <motion.div
                key="wizard-step-3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
                className="max-w-4xl mx-auto"
              >
                <div className="mb-6">
                  <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-brand-red mb-1">
                    Step 03 · Weekly Cadence
                  </p>
                  <h3 className="text-xl sm:text-2xl font-extrabold text-white font-display">
                    Choose your preferred weekly mentorship rhythm
                  </h3>
                </div>

                <div className="divide-y divide-slate-800 border border-slate-800 rounded-2xl overflow-hidden bg-slate-900/60 mb-8">
                  {PACING_OPTIONS.map((pace) => {
                    const active = selectedPace === pace.id;
                    return (
                      <button
                        key={pace.id}
                        type="button"
                        onClick={() => setSelectedPace(pace.id)}
                        className={`w-full p-5 sm:p-6 text-left transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer ${
                          active
                            ? 'bg-brand-red/15 border-l-4 border-l-brand-red'
                            : 'hover:bg-slate-900'
                        }`}
                      >
                        <div className="flex items-start sm:items-center gap-4">
                          <div
                            className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 mt-0.5 sm:mt-0 ${
                              active
                                ? 'bg-brand-red border-brand-red text-white'
                                : 'border-slate-700 bg-slate-950 text-transparent'
                            }`}
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-base sm:text-lg font-extrabold text-white font-display">
                                {pace.label}
                              </span>
                              <span className="text-xs font-extrabold uppercase tracking-wider text-brand-red">
                                · {pace.sessions}
                              </span>
                            </div>
                            <p className="text-xs sm:text-sm text-slate-400 mt-1">
                              {pace.format}
                            </p>
                          </div>
                        </div>

                        <Calendar className={`w-5 h-5 shrink-0 ${active ? 'text-brand-red' : 'text-slate-600'}`} />
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="inline-flex items-center gap-2 text-slate-400 hover:text-white font-bold px-4 py-3 cursor-pointer text-sm"
                  >
                    <ArrowLeft className="w-4 h-4" /> Previous Step
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(4)}
                    className="inline-flex items-center gap-2 bg-brand-red hover:bg-rose-600 text-white font-bold px-8 py-4 rounded-xl transition-all shadow-lg shadow-brand-red/25 cursor-pointer text-sm"
                  >
                    Generate Custom Blueprint <Sparkles className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* STEP 4: GENERATED BLUEPRINT & PORTAL SUBMISSION */}
            {step === 4 && (
              <motion.div
                key="wizard-step-4"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-8"
              >
                {/* Left 7 Cols: Configured Blueprint Summary */}
                <div className="lg:col-span-7 bg-slate-900 rounded-2xl p-6 sm:p-8 border border-slate-800 space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-5 border-b border-slate-800">
                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-brand-red mb-1">
                        Personalized Syllabus Blueprint
                      </p>
                      <h3 className="text-2xl font-extrabold font-display text-white">
                        {ageObj.label} Pathway ({ageObj.ageRange})
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="text-xs font-bold text-slate-400 hover:text-white underline cursor-pointer"
                    >
                      Reconfigure
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-brand-red" /> Selected Core Disciplines
                      </p>
                      <div className="space-y-2">
                        {interestObjs.map((interest, idx) => (
                          <div
                            key={interest.id}
                            className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950 border border-slate-800"
                          >
                            <div>
                              <p className="text-sm font-bold text-white">{interest.label}</p>
                              <p className="text-xs text-slate-400">{interest.school}</p>
                            </div>
                            <span className="text-xs font-extrabold uppercase tracking-wider text-brand-red">
                              Module 0{idx + 1}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Target Outcome
                        </p>
                        <p className="text-sm font-bold text-white mt-1">{goalObj.label}</p>
                      </div>
                      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Recommended Cadence
                        </p>
                        <p className="text-sm font-bold text-white mt-1">
                          {paceObj.label} ({paceObj.sessions})
                        </p>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/30 flex items-start gap-3">
                      <Award className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-emerald-200 leading-relaxed">
                        Follows our 5-stage progression (Discover → Build → Apply → Create → Master) with live mentor feedback and verified portfolio certification.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Right 5 Cols: Save Blueprint / Direct Registration */}
                <div className="lg:col-span-5 bg-slate-900 rounded-2xl p-6 sm:p-8 border border-slate-800 flex flex-col justify-between">
                  {submitted ? (
                    <div className="text-center py-8 my-auto">
                      <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto mb-4">
                        <CheckCircle2 className="w-8 h-8" />
                      </div>
                      <h4 className="text-xl font-extrabold text-white font-display mb-2">
                        Blueprint Saved Successfully
                      </h4>
                      <p className="text-sm text-slate-400 mb-6">
                        Our academic advisors have received your custom curriculum blueprint and will reach out to schedule your diagnostic session.
                      </p>
                      <Link
                        to="/register"
                        className="inline-flex items-center justify-center gap-2 w-full bg-brand-red hover:bg-rose-600 text-white font-bold py-3.5 px-6 rounded-xl transition-all text-sm"
                      >
                        Complete Student Registration <ArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                  ) : (
                    <form onSubmit={handleSavePlan} className="space-y-4">
                      <div>
                        <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-brand-red mb-1">
                          Save & Activate
                        </p>
                        <h4 className="text-xl font-extrabold text-white font-display">
                          Send This Blueprint to an Advisor
                        </h4>
                        <p className="text-xs text-slate-400 mt-1">
                          Save your custom plan and book a free placement session, or proceed straight to enrollment.
                        </p>
                      </div>

                      {submitError && (
                        <p className="text-xs text-rose-400 bg-rose-950/50 border border-rose-800 rounded-lg p-3">
                          {submitError}
                        </p>
                      )}

                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1">
                          Parent or Learner Name *
                        </label>
                        <input
                          type="text"
                          required
                          value={parentName}
                          onChange={(e) => setParentName(e.target.value)}
                          placeholder="Enter full name"
                          className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-brand-red text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1">
                          Email Address *
                        </label>
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@example.com"
                          className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-brand-red text-sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-300 mb-1">
                          WhatsApp / Phone Number
                        </label>
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="+234 or international number"
                          className="w-full px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-brand-red text-sm"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={submitting}
                        className="w-full inline-flex items-center justify-center gap-2 bg-brand-red hover:bg-rose-600 disabled:opacity-50 text-white font-bold py-3.5 px-6 rounded-xl transition-all shadow-lg shadow-brand-red/25 cursor-pointer text-sm"
                      >
                        <Send className="w-4 h-4" />
                        {submitting ? 'Saving Blueprint...' : 'Save My Custom Blueprint'}
                      </button>

                      <div className="pt-3 border-t border-slate-800 text-center">
                        <Link
                          to="/register"
                          className="inline-flex items-center justify-center gap-1.5 text-xs font-bold text-slate-300 hover:text-white transition-colors"
                        >
                          Or skip and enroll directly now <ArrowRight className="w-3.5 h-3.5 text-brand-red" />
                        </Link>
                      </div>
                    </form>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
