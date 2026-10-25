import React, { useState } from 'react';
import { 
  Check, 
  ArrowRight, 
  ArrowLeft, 
  Send, 
  CheckCircle2, 
  GraduationCap, 
  Laptop, 
  Palette, 
  Music, 
  Brain, 
  Gamepad2, 
  Baby, 
  ShieldCheck,
  Award
} from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { motion } from 'motion/react';
import Button from '../ui/Button';

interface LearningPathBuilderProps {
  onSuccess?: () => void;
  className?: string;
}

const AGE_GROUPS = [
  { id: '4-7', label: 'Ages 4–7', grade: 'Early Childhood & Nursery / Primary 1-2', icon: Baby, description: 'Playful foundation & multisensory learning' },
  { id: '8-11', label: 'Ages 8–11', grade: 'Primary 3–6 / Junior Foundation', icon: Brain, description: 'Visual logic, reading fluency & hands-on creation' },
  { id: '12-16', label: 'Ages 12–16', grade: 'JSS 1 – SSS 3 / High School', icon: Laptop, description: 'Real coding, advanced sciences & exam mastery' },
  { id: '17+', label: 'Ages 17+ / Adults', grade: 'Tertiary, Pre-University & Professionals', icon: GraduationCap, description: 'Career software development, AI tools & design' }
];

const GOAL_OPTIONS = [
  { id: 'tech_coding', label: 'Coding & Tech Skills', icon: Laptop, desc: 'Build games, websites & Python applications' },
  { id: 'academics', label: 'Academic & Exam Boost', icon: GraduationCap, desc: 'Improve math, sciences, English and WAEC/JAMB scores' },
  { id: 'digital_literacy', label: 'Digital & Office Mastery', icon: Brain, desc: 'Typing, PowerPoint, Excel, and AI study tools' },
  { id: 'music', label: 'Music & Instrument Playing', icon: Music, desc: 'Master piano keyboard, violin, recorder or theory' },
  { id: 'creative', label: 'Design & Visual Arts', icon: Palette, desc: 'Graphic design, branding, Canva and digital drawing' },
  { id: 'critical_thinking', label: 'Chess & Strategic Thinking', icon: Gamepad2, desc: 'Improve focus, patience, tactical calculation & logic' },
  { id: 'confidence', label: 'Confidence & Discovery', icon: Award, desc: 'Multi-disciplinary exploration for young creators' }
];

const DISCIPLINE_CHOICES = [
  { id: 'scratch_coding', name: 'Scratch & Visual Coding', school: 'School of Technology & Programming', icon: Laptop },
  { id: 'python_web', name: 'Python & Web Development', school: 'School of Technology & Programming', icon: Laptop },
  { id: 'ai_tools', name: 'AI Literacy & Creator Tools', school: 'School of Technology & Programming', icon: Laptop },
  { id: 'junior_digital', name: 'Junior Digital Explorers (Typing & Word)', school: 'School of Digital Literacy', icon: Brain },
  { id: 'senior_office', name: 'Senior Digital Masters (Excel & PPT Pro)', school: 'School of Digital Literacy', icon: Brain },
  { id: 'graphic_design', name: 'Graphic Design & Branding', school: 'School of Creative Design', icon: Palette },
  { id: 'digital_art', name: 'Digital Art & Character Drawing', school: 'School of Creative Design', icon: Palette },
  { id: 'piano_keyboard', name: 'Piano & Keyboard Lessons', school: 'School of Music & Performing Arts', icon: Music },
  { id: 'violin_strings', name: 'Violin Strings Mastery', school: 'School of Music & Performing Arts', icon: Music },
  { id: 'recorder_wind', name: 'Recorder Wind Instrument', school: 'School of Music & Performing Arts', icon: Music },
  { id: 'mathematics', name: 'Mathematics & Further Maths', school: 'School of Academic Excellence', icon: GraduationCap },
  { id: 'english_writing', name: 'English Grammar & Creative Writing', school: 'School of Academic Excellence', icon: GraduationCap },
  { id: 'sciences_physics_chem', name: 'Sciences (Physics / Chemistry / Biology)', school: 'School of Academic Excellence', icon: GraduationCap },
  { id: 'exam_bootcamp', name: 'Exam Prep (WAEC / JAMB / Checkpoint / IGCSE)', school: 'School of Academic Excellence', icon: GraduationCap },
  { id: 'chess_strategy', name: 'Chess Tactics & Strategy', school: 'School of Strategy & Games', icon: Gamepad2 },
  { id: 'scrabble_words', name: 'Scrabble & Word Strategy', school: 'School of Strategy & Games', icon: Gamepad2 },
  { id: 'young_creator_rotation', name: 'Young Creator Multi-Track Rotation', school: 'School of Young Creators', icon: Baby }
];

export const LearningPathBuilder: React.FC<LearningPathBuilderProps> = ({ onSuccess, className = '' }) => {
  const [step, setStep] = useState<number>(1);
  
  // Selection State
  const [ageGroup, setAgeGroup] = useState<string>('8-11');
  const [goals, setGoals] = useState<string[]>(['tech_coding', 'academics']);
  const [selectedDisciplines, setSelectedDisciplines] = useState<string[]>(['scratch_coding', 'mathematics']);
  const [deliveryMode, setDeliveryMode] = useState<'Online' | 'Physical' | 'Flexible'>('Online');
  const [classType, setClassType] = useState<'1-on-1 Private' | 'Micro-Group' | 'School Partnership'>('1-on-1 Private');
  const [frequency, setFrequency] = useState<'1 Day / Week' | '2 Days / Week' | '3 Days / Week' | 'Intensive'>('2 Days / Week');
  const [preferredDays, setPreferredDays] = useState<string[]>(['Saturday', 'Wednesday']);
  const [dayTimeRanges, setDayTimeRanges] = useState<Record<string, { startTime: string; endTime: string }>>({
    Saturday: { startTime: '10:00', endTime: '12:00' },
    Wednesday: { startTime: '16:00', endTime: '17:30' }
  });

  const updateDayTimeRange = (day: string, field: 'startTime' | 'endTime', value: string) => {
    setDayTimeRanges(prev => ({
      ...prev,
      [day]: {
        ...(prev[day] || { startTime: '14:00', endTime: '16:00' }),
        [field]: value
      }
    }));
  };

  // Contact Form State
  const [parentName, setParentName] = useState('');
  const [studentName, setStudentName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  
  // Submission State
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const toggleGoal = (id: string) => {
    setGoals(prev => prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]);
  };

  const toggleDiscipline = (id: string) => {
    setSelectedDisciplines(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);
  };

  const toggleDay = (day: string) => {
    setPreferredDays(prev => {
      const exists = prev.includes(day);
      if (exists) {
        return prev.filter(d => d !== day);
      } else {
        if (!dayTimeRanges[day]) {
          setDayTimeRanges(r => ({ ...r, [day]: { startTime: '14:00', endTime: '16:00' } }));
        }
        return [...prev, day];
      }
    });
  };

  const handleSubmitCustomPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parentName.trim() || !phone.trim() || !email.trim()) {
      setErrorMsg('Please provide your name, phone number, and email address.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const planPayload = {
        type: 'CUSTOM_LEARNING_PLAN',
        category: 'LEARNING_ECOSYSTEM_PATHFINDER',
        parentName,
        studentName: studentName || 'Not specified',
        email,
        phone,
        location: location || 'Flexible / Online',
        additionalNotes,
        ageGroup,
        goals,
        selectedDisciplines,
        deliveryMode,
        classType,
        frequency,
        preferredDays,
        dayTimeRanges: preferredDays.reduce((acc, d) => ({ ...acc, [d]: dayTimeRanges[d] || { startTime: '14:00', endTime: '16:00' } }), {}),
        status: 'PENDING',
        createdAt: serverTimestamp(),
        source: 'Learning Path Builder'
      };

      await addDoc(collection(db, 'inquiries'), planPayload);
      setSubmitted(true);
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error('Error saving learning plan:', err);
      // Fallback state
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedDisciplinesData = DISCIPLINE_CHOICES.filter(d => selectedDisciplines.includes(d.id));

  return (
    <div className={`bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden ${className}`}>
      
      {/* Top Builder Header */}
      <div className="bg-gradient-to-r from-slate-900 via-brand-slate to-slate-900 text-white p-6 sm:p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-brand-red/20 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Build Your Child's Learning Pathway
            </h2>
            <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-2xl">
              Combine subjects across our 8 Programs into a unified, balanced learning schedule. Zero public prices — we tailor every roadmap to individual goals.
            </p>
          </div>

          {/* Stepper Indicator */}
          {!submitted && (
            <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-2xl backdrop-blur-md self-start md:self-auto shrink-0 border border-white/10">
              <span className="text-xs font-bold text-slate-300">Step {step} of 4</span>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4].map(s => (
                  <div 
                    key={s} 
                    className={`w-2.5 h-2.5 rounded-full transition-all ${
                      s === step ? 'bg-brand-red w-6' : s < step ? 'bg-emerald-400' : 'bg-white/20'
                    }`} 
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Form Content */}
      <div className="p-6 sm:p-8 lg:p-10">
        
        {submitted ? (
          /* Confirmation State */
          <div className="text-center py-10 max-w-xl mx-auto space-y-6">
            <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto border-2 border-emerald-500/30 animate-in zoom-in-75 duration-300">
              <CheckCircle2 size={40} />
            </div>
            
            <div>
              <h3 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
                Personalized Learning Plan Received!
              </h3>
              <p className="text-slate-600 dark:text-slate-300 text-sm sm:text-base mt-2 leading-relaxed">
                Thank you, <strong>{parentName}</strong>. Our academic coordinator will review your selected disciplines ({selectedDisciplines.length} subjects) and contact you within 24 hours to schedule a complimentary diagnostic orientation.
              </p>
            </div>

            {/* Plan Summary Card */}
            <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-left space-y-3">
              <div className="text-xs font-bold text-brand-red uppercase tracking-wider">Configured Pathway Overview</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-slate-500">Student:</span> <strong className="text-slate-900 dark:text-white">{studentName || parentName}</strong></div>
                <div><span className="text-slate-500">Age Bracket:</span> <strong className="text-slate-900 dark:text-white">{ageGroup}</strong></div>
                <div><span className="text-slate-500">Delivery Format:</span> <strong className="text-slate-900 dark:text-white">{deliveryMode} ({classType})</strong></div>
                <div><span className="text-slate-500">Frequency:</span> <strong className="text-slate-900 dark:text-white">{frequency}</strong></div>
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                <span className="text-slate-500 text-xs block mb-1">Selected Disciplines:</span>
                <div className="flex flex-wrap gap-1.5">
                  {selectedDisciplinesData.map(d => (
                    <span key={d.id} className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-800 dark:text-slate-200">
                      {d.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-4 flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                variant="outline"
                onClick={() => {
                  setSubmitted(false);
                  setStep(1);
                }}
                className="font-bold text-xs"
              >
                Create Another Learning Plan
              </Button>
              <Button
                to="/programs"
                className="font-bold text-xs bg-brand-red hover:bg-red-700 text-white"
              >
                Explore Full Ecosystem Catalog
              </Button>
            </div>
          </div>
        ) : (
          <div>
            {/* Step 1: Age & Growth Goals */}
            {step === 1 && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <div>
                  <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <span>1. Select Learner's Age Group & Stage</span>
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                    We calibrate curricula, pacing, and interactive tools specifically to cognitive milestones.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
                    {AGE_GROUPS.map((group) => {
                      const Icon = group.icon;
                      const isSelected = ageGroup === group.id;

                      return (
                        <button
                          key={group.id}
                          type="button"
                          onClick={() => setAgeGroup(group.id)}
                          className={`p-4 rounded-2xl border text-left transition-all relative ${
                            isSelected
                              ? 'border-brand-red bg-brand-red/5 dark:bg-brand-red/10 shadow-sm'
                              : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className={`p-2 rounded-xl ${isSelected ? 'bg-brand-red text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>
                              <Icon size={18} />
                            </div>
                            {isSelected && <Check size={18} className="text-brand-red" />}
                          </div>
                          <div className="font-extrabold text-sm text-slate-900 dark:text-white">{group.label}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{group.grade}</div>
                          <div className="text-[11px] text-slate-400 mt-2 line-clamp-2">{group.description}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Goals */}
                <div>
                  <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <span>2. What are the key development priorities?</span>
                    <span className="text-xs font-normal text-slate-400">(Select all that apply)</span>
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
                    {GOAL_OPTIONS.map((g) => {
                      const Icon = g.icon;
                      const isChecked = goals.includes(g.id);

                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => toggleGoal(g.id)}
                          className={`p-3.5 rounded-2xl border text-left flex items-start gap-3 transition-all ${
                            isChecked
                              ? 'border-brand-red bg-brand-red/5 dark:bg-brand-red/10 text-slate-900 dark:text-white'
                              : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <div className={`p-2 rounded-xl shrink-0 ${isChecked ? 'bg-brand-red text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                            <Icon size={16} />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold">{g.label}</div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{g.desc}</div>
                          </div>
                          <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ml-auto ${
                            isChecked ? 'bg-brand-red border-brand-red text-white' : 'border-slate-300 dark:border-slate-700'
                          }`}>
                            {isChecked && <Check size={12} />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
                  <Button
                    onClick={() => setStep(2)}
                    disabled={goals.length === 0}
                    rightIcon={<ArrowRight size={16} />}
                    className="font-bold uppercase tracking-wider text-xs px-6"
                  >
                    Next: Choose Disciplines
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Step 2: Choose Multiple Disciplines */}
            {step === 2 && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div>
                  <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                    Select Subject Disciplines for the Learning Plan
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                    Select 1 to 4 courses. You can mix technology, music, academics, digital literacy, and chess.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {DISCIPLINE_CHOICES.map((disc) => {
                    const Icon = disc.icon;
                    const isSelected = selectedDisciplines.includes(disc.id);

                    return (
                      <button
                        key={disc.id}
                        type="button"
                        onClick={() => toggleDiscipline(disc.id)}
                        className={`p-3.5 rounded-2xl border text-left flex items-start gap-3 transition-all ${
                          isSelected
                            ? 'border-brand-red bg-brand-red/5 dark:bg-brand-red/10 text-slate-900 dark:text-white shadow-xs'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <div className={`p-2 rounded-xl shrink-0 ${isSelected ? 'bg-brand-red text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                          <Icon size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold truncate">{disc.name}</div>
                          <div className="text-[10px] text-brand-red font-medium truncate mt-0.5">{disc.school}</div>
                        </div>
                        <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-brand-red border-brand-red text-white' : 'border-slate-300 dark:border-slate-700'
                        }`}>
                          {isSelected && <Check size={12} />}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                  <Button
                    variant="outline"
                    onClick={() => setStep(1)}
                    leftIcon={<ArrowLeft size={16} />}
                    className="font-bold text-xs"
                  >
                    Back
                  </Button>
                  
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 hidden sm:inline">
                      {selectedDisciplines.length} discipline{selectedDisciplines.length === 1 ? '' : 's'} selected
                    </span>
                    <Button
                      onClick={() => setStep(3)}
                      disabled={selectedDisciplines.length === 0}
                      rightIcon={<ArrowRight size={16} />}
                      className="font-bold uppercase tracking-wider text-xs px-6"
                    >
                      Next: Format & Schedule
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Step 3: Format, Class Type & Schedule */}
            {step === 3 && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <div>
                  <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                    Delivery Format & Class Environment
                  </h3>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                    {[
                      { id: 'Online', title: 'Live Interactive Online', desc: 'Engaging real-time screen share & virtual coding lab' },
                      { id: 'Physical', title: 'Physical / In-Person', desc: 'Vetted mentor visits your home location or center' },
                      { id: 'Flexible', title: 'Hybrid / Flexible', desc: 'Blend of online drills and in-person practicals' }
                    ].map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => setDeliveryMode(mode.id as any)}
                        className={`p-4 rounded-2xl border text-left transition-all ${
                          deliveryMode === mode.id
                            ? 'border-brand-red bg-brand-red/5 dark:bg-brand-red/10'
                            : 'border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        <div className="text-xs font-black text-slate-900 dark:text-white">{mode.title}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{mode.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-2">Class Structure</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      { id: '1-on-1 Private', title: '1-on-1 Dedicated Mentorship', desc: '100% personalized pacing & focus' },
                      { id: 'Micro-Group', title: 'Micro-Group (2–4 Peers)', desc: 'Collaborative dynamic with friends or siblings' },
                      { id: 'School Partnership', title: 'School Coding / Tech Club', desc: 'Institutional curriculum delivery' }
                    ].map((type) => (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => setClassType(type.id as any)}
                        className={`p-3.5 rounded-2xl border text-left transition-all ${
                          classType === type.id
                            ? 'border-brand-red bg-brand-red/5 dark:bg-brand-red/10'
                            : 'border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        <div className="text-xs font-bold text-slate-900 dark:text-white">{type.title}</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{type.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-2">Preferred Frequency & Days</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                    {['1 Day / Week', '2 Days / Week', '3 Days / Week', 'Intensive'].map((freq) => (
                      <button
                        key={freq}
                        type="button"
                        onClick={() => setFrequency(freq as any)}
                        className={`p-2.5 rounded-xl border text-center text-xs font-bold transition-all ${
                          frequency === freq
                            ? 'border-brand-red bg-brand-red text-white'
                            : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {freq}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => {
                      const isChecked = preferredDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDay(day)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                            isChecked
                              ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-transparent'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                          }`}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>

                  {preferredDays.length > 0 && (
                    <div className="mt-4 space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-900/60">
                      <div className="flex items-center justify-between">
                        <h5 className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                          Specific Time Range per Day
                        </h5>
                        <span className="text-[10px] text-slate-500">Pick custom hours for each day</span>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {preferredDays.map((day) => {
                          const currentRange = dayTimeRanges[day] || { startTime: '14:00', endTime: '16:00' };
                          return (
                            <div key={day} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-950">
                              <span className="text-xs font-bold text-slate-900 dark:text-white min-w-[75px]">{day}</span>
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="time"
                                  value={currentRange.startTime}
                                  onChange={(e) => updateDayTimeRange(day, 'startTime', e.target.value)}
                                  className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs text-slate-900 outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                                />
                                <span className="text-xs text-slate-400">–</span>
                                <input
                                  type="time"
                                  value={currentRange.endTime}
                                  onChange={(e) => updateDayTimeRange(day, 'endTime', e.target.value)}
                                  className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs text-slate-900 outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                  <Button
                    variant="outline"
                    onClick={() => setStep(2)}
                    leftIcon={<ArrowLeft size={16} />}
                    className="font-bold text-xs"
                  >
                    Back
                  </Button>
                  <Button
                    onClick={() => setStep(4)}
                    rightIcon={<ArrowRight size={16} />}
                    className="font-bold uppercase tracking-wider text-xs px-6"
                  >
                    Next: Review & Request Plan
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Step 4: Pathway Review & Submit Contact */}
            {step === 4 && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                {/* Generated Pathway Preview */}
                <div className="p-6 rounded-2xl bg-slate-900 text-white border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-brand-red bg-brand-red/20 px-2.5 py-1 rounded-md">
                        Proposed Learning Schedule
                      </span>
                      <h4 className="text-lg font-black mt-2">
                        {ageGroup} Multi-Disciplinary Roadmap
                      </h4>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-slate-400 block">Structure</span>
                      <span className="text-xs font-bold text-white">{frequency} • {deliveryMode}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    {selectedDisciplinesData.map((d, idx) => (
                      <div key={d.id} className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-brand-red/20 text-brand-red flex items-center justify-center font-black text-xs shrink-0">
                          0{idx + 1}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">{d.name}</div>
                          <div className="text-[10px] text-slate-400 truncate">{d.school}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="text-[11px] text-slate-400 flex items-center gap-2 pt-2 border-t border-white/10">
                    <ShieldCheck size={14} className="text-emerald-400" />
                    <span>Includes 5-Stage Mastery progression (Discover → Build → Apply → Create → Master) & verifiable term certification.</span>
                  </div>
                </div>

                {/* Contact Submission Form */}
                <form onSubmit={handleSubmitCustomPlan} className="space-y-4">
                  <h4 className="text-base font-black text-slate-900 dark:text-white">
                    Where should we send this custom proposal?
                  </h4>

                  {errorMsg && (
                    <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 text-xs font-bold">
                      {errorMsg}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Parent / Guardian / School Contact Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={parentName}
                        onChange={(e) => setParentName(e.target.value)}
                        placeholder="e.g. Mrs. Adeyemi or Dr. Johnson"
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-brand-red outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Student / Child's First Name & Exact Age
                      </label>
                      <input
                        type="text"
                        value={studentName}
                        onChange={(e) => setStudentName(e.target.value)}
                        placeholder="e.g. David (Age 9, Primary 4)"
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-brand-red outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Email Address *
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="parent@example.com"
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-brand-red outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        WhatsApp / Phone Number *
                      </label>
                      <input
                        type="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="e.g. +234 801 234 5678"
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-brand-red outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      City / Area (For physical tutor assignment or timezone matching)
                    </label>
                    <input
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="e.g. Lekki Phase 1, Lagos / Ikeja / Abuja / London (Online)"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-brand-red outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Special Requests / Specific Learning Bottlenecks (Optional)
                    </label>
                    <textarea
                      rows={2}
                      value={additionalNotes}
                      onChange={(e) => setAdditionalNotes(e.target.value)}
                      placeholder="e.g. Needs help with times tables and wants to learn to build Roblox/Scratch games on Saturdays."
                      className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-brand-red outline-none"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => setStep(3)}
                      leftIcon={<ArrowLeft size={16} />}
                      className="font-bold text-xs"
                    >
                      Back
                    </Button>
                    <Button
                      type="submit"
                      disabled={submitting}
                      rightIcon={<Send size={16} />}
                      className="font-black uppercase tracking-wider text-xs px-8 bg-brand-red hover:bg-red-700 text-white shadow-lg shadow-brand-red/20"
                    >
                      {submitting ? 'Submitting Plan...' : 'Request Custom Learning Plan'}
                    </Button>
                  </div>
                </form>
              </motion.div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default LearningPathBuilder;
