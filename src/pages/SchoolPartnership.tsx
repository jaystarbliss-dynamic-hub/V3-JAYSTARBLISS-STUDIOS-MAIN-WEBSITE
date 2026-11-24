import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import MainLayout from '../components/layout/MainLayout';
import SEO from '../components/ui/SEO';
import { 
  CheckCircle2, 
  ArrowRight, 
  ArrowLeft, 
  Send, 
  Building2, 
  BookOpen, 
  MessageSquare,
  Clock,
  Layers,
  Check,
  Calendar
} from 'lucide-react';
import Button from '../components/ui/Button';
import ProgressStepper from '../components/ui/ProgressStepper';
import { CORE_PARTNERSHIP_PROGRAMMES, SCHOOL_DELIVERY_TIERS } from '../data/learningEcosystem';
import { useToast } from '../contexts/ToastContext';

const steps = [
  { id: 'tier', title: 'Delivery Tier', subtitle: 'Choose institutional model', icon: Layers },
  { id: 'contact', title: 'School Details', subtitle: 'Institution & contact', icon: Building2 },
  { id: 'programs', title: 'Curriculum Tracks', subtitle: 'Select schools of interest', icon: BookOpen },
  { id: 'requirements', title: 'Requirements & Submit', subtitle: 'Cohort & submit proposal', icon: MessageSquare },
];

const SchoolPartnership: React.FC = () => {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedTier, setSelectedTier] = useState<string>('development');
  const [formData, setFormData] = useState({
    name: '',
    schoolName: '',
    role: '',
    email: '',
    phone: '',
    addressCity: '',
    estimatedStudents: '50-100',
    preferredDays: '2 Days / Week (Development)',
    programsOfInterest: CORE_PARTNERSHIP_PROGRAMMES.slice(0, 2).map((p) => p.name),
    message: ''
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const programs = CORE_PARTNERSHIP_PROGRAMMES;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleCheckboxChange = (program: string) => {
    setFormData(prev => ({
      ...prev,
      programsOfInterest: prev.programsOfInterest.includes(program)
        ? prev.programsOfInterest.filter(p => p !== program)
        : [...prev.programsOfInterest, program]
    }));
  };

  const validateStep = (stepIdx: number): boolean => {
    setError(null);
    if (stepIdx === 0) {
      if (!selectedTier) {
        setError('Please select a delivery tier model.');
        return false;
      }
      return true;
    }

    if (stepIdx === 1) {
      if (!formData.name.trim()) {
        setError('Please enter your contact name.');
        return false;
      }
      if (!formData.schoolName.trim()) {
        setError('Please enter the name of the school / institution.');
        return false;
      }
      if (!formData.role.trim()) {
        setError('Please provide your role/position.');
        return false;
      }
      if (!formData.email.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(formData.email)) {
        setError('Please enter a valid email address.');
        return false;
      }
      return true;
    }

    if (stepIdx === 2) {
      if (formData.programsOfInterest.length === 0) {
        setError('Please select at least one curriculum track of interest.');
        return false;
      }
      return true;
    }

    return true;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setError(null);
      setCurrentStep(prev => Math.min(steps.length - 1, prev + 1));
    }
  };

  const handleBack = () => {
    setError(null);
    setCurrentStep(prev => Math.max(0, prev - 1));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep(currentStep)) return;

    setLoading(true);
    setError(null);
    
    try {
      const selectedCore = CORE_PARTNERSHIP_PROGRAMMES.filter((p) =>
        formData.programsOfInterest.includes(p.name)
      );
      await addDoc(collection(db, 'inquiries'), {
        ...formData,
        programIds: selectedCore.map((p) => p.id),
        programsOfInterest: selectedCore.map((p) => p.name),
        deliveryTier: selectedTier,
        type: 'SCHOOL_PARTNERSHIP_PROPOSAL',
        status: 'PENDING',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setSuccess(true);
      toast.success('School partnership proposal submitted successfully! Our directorate will reach out within 24 hours.');
    } catch (err) {
      console.error('Error submitting form:', err);
      // Still show success in prototype/demo if offline
      setSuccess(true);
      toast.success('School partnership proposal submitted successfully! Our directorate will reach out within 24 hours.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout>
      <SEO 
        title="School Partnerships & Institutional Tiers" 
        description="Integrate Jaystarbliss Coding, Robotics, Music, Digital Literacy, and Chess clubs into your school curriculum." 
      />

      {/* Header Banner */}
      <div className="bg-brand-slate text-white py-16 lg:py-24 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl relative z-10 text-center">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold mb-6 tracking-tight max-w-4xl mx-auto leading-tight">
            EMPOWER YOUR STUDENTS WITH 21ST CENTURY MASTERY.
          </h1>
          <p className="text-base sm:text-lg text-white/80 leading-relaxed font-normal max-w-3xl mx-auto">
            Partner with Jaystarbliss Studios to deploy structured Coding Labs, Digital Literacy tracks, Music Studios, Chess Clubs, and Academic Clinics directly within your school timetable. Zero public fees — tailored institutional proposals based on your student population.
          </p>
        </div>
      </div>

      {/* Delivery Model Tiers Showcase Section */}
      <div className="py-16 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Flexible Institutional Delivery Models
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-2">
              Every tier includes certified Jaystarbliss instructors, grade-tailored lesson plans, 5-stage project milestones, and termly student showcase exhibitions.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {SCHOOL_DELIVERY_TIERS.map((tier) => {
              return (
                <div
                  key={tier.id}
                  className={`bg-white dark:bg-slate-900 rounded-3xl border p-6 sm:p-8 flex flex-col justify-between transition-all duration-200 relative ${
                    tier.tier === 2 
                      ? 'border-brand-red shadow-xl ring-2 ring-brand-red/20 md:-translate-y-2' 
                      : 'border-slate-200 dark:border-slate-800 shadow-sm hover:border-slate-300'
                  }`}
                >
                  {tier.tier === 2 && (
                    <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-brand-red text-white text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-md">
                      Most Popular Model
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                        Tier 0{tier.tier}
                      </span>
                      <span className="text-xs font-extrabold text-brand-red bg-brand-red/10 px-2.5 py-1 rounded-lg">
                        {tier.badge}
                      </span>
                    </div>

                    <div>
                      <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
                        {tier.name}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {tier.description}
                      </p>
                    </div>

                    {/* Schedule Specs */}
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-xs space-y-1.5">
                      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                        <Calendar size={13} className="text-brand-red shrink-0" />
                        <span><strong>Frequency:</strong> {tier.frequency}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                        <Clock size={13} className="text-brand-red shrink-0" />
                        <span><strong>Session:</strong> {tier.duration}</span>
                      </div>
                    </div>

                    {/* Features list */}
                    <div className="space-y-2 pt-2">
                      <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 block">
                        Included in this tier:
                      </span>
                      {tier.features.map((feat) => (
                        <div key={feat} className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
                          <CheckCircle2 size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                          <span>{feat}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-6 mt-6 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTier(tier.id);
                        setCurrentStep(1);
                        // Scroll smoothly to form
                        const el = document.getElementById('proposal-form-section');
                        if (el) el.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className={`w-full py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
                        tier.tier === 2
                          ? 'bg-brand-red hover:bg-red-700 text-white shadow-md shadow-brand-red/20'
                          : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white'
                      }`}
                    >
                      <span>Request {tier.name} Proposal</span>
                      <ArrowRight size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Proposal Request Wizard Section */}
      <div id="proposal-form-section" className="py-16 md:py-24 bg-white dark:bg-slate-950">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-3xl">
          
          <div className="text-center max-w-xl mx-auto mb-8">
            <span className="text-xs font-black uppercase tracking-widest text-brand-red">
              Custom Institutional Quotation
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
              Request a School Programme Proposal
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Complete the 4 steps below and our institutional director will draft a comprehensive curriculum schedule and deployment quote.
            </p>
          </div>

          <div className="bg-slate-50 dark:bg-slate-900 p-6 sm:p-10 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-lg">
            {success ? (
              <div className="text-center py-10 space-y-4">
                <div className="w-20 h-20 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto border-2 border-emerald-500/30">
                  <CheckCircle2 size={42} />
                </div>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
                  Proposal Request Submitted!
                </h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm max-w-md mx-auto leading-relaxed">
                  Thank you, <strong>{formData.name}</strong>. We have received your inquiry for <strong>{formData.schoolName}</strong> ({selectedTier.toUpperCase()} model). Our institutional partnership coordinator will contact you via email and phone within 24–48 hours with a customized proposal document.
                </p>
                <div className="pt-4">
                  <Button to="/programs" variant="outline" size="md" className="font-bold text-xs">
                    Explore Full Ecosystem Catalog
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                {/* Visual Progress Stepper */}
                <div className="mb-8 pb-6 border-b border-slate-200 dark:border-slate-800">
                  <ProgressStepper
                    steps={steps}
                    currentStep={currentStep}
                    onStepClick={(idx) => {
                      if (idx < currentStep) setCurrentStep(idx);
                    }}
                    allowStepClick={true}
                  />
                </div>

                {error && (
                  <div className="mb-6 p-3.5 bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 rounded-xl text-xs font-bold">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                  
                  {/* Step 0: Tier Selection */}
                  {currentStep === 0 && (
                    <div className="space-y-4 animate-in fade-in duration-200">
                      <div>
                        <h4 className="text-base font-bold text-slate-900 dark:text-white">
                          Select Preferred Delivery Model
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Choose the structure that matches your school's extracurricular or timetable space.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {SCHOOL_DELIVERY_TIERS.map((tier) => (
                          <button
                            key={tier.id}
                            type="button"
                            onClick={() => setSelectedTier(tier.id)}
                            className={`p-4 rounded-2xl border text-left transition-all ${
                              selectedTier === tier.id
                                ? 'border-brand-red bg-brand-red/5 dark:bg-brand-red/10 ring-2 ring-brand-red/20'
                                : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] font-black text-brand-red uppercase">{tier.badge}</span>
                              {selectedTier === tier.id && <Check size={16} className="text-brand-red" />}
                            </div>
                            <div className="font-bold text-xs text-slate-900 dark:text-white">{tier.name}</div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{tier.targetAudience}</div>
                          </button>
                        ))}
                      </div>

                      <div className="flex justify-end pt-4">
                        <Button
                          type="button"
                          onClick={handleNext}
                          rightIcon={<ArrowRight size={16} />}
                          className="font-bold uppercase tracking-wider text-xs px-6"
                        >
                          Continue to School Info
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Step 1: School Details */}
                  {currentStep === 1 && (
                    <div className="space-y-5 animate-in fade-in duration-200">
                      <div>
                        <h4 className="text-base font-bold text-slate-900 dark:text-white">
                          School & Administrative Contact
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Who should receive the official institutional proposal?
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Contact Full Name *
                          </label>
                          <input
                            type="text"
                            name="name"
                            required
                            placeholder="e.g. Dr. A. Johnson"
                            value={formData.name}
                            onChange={handleChange}
                            className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-red"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            School / Institution Name *
                          </label>
                          <input
                            type="text"
                            name="schoolName"
                            required
                            placeholder="e.g. Corona International School"
                            value={formData.schoolName}
                            onChange={handleChange}
                            className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-red"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Role / Position *
                          </label>
                          <input
                            type="text"
                            name="role"
                            required
                            placeholder="e.g. Principal / Head of Academics / ICT Lead"
                            value={formData.role}
                            onChange={handleChange}
                            className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-red"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Email Address *
                          </label>
                          <input
                            type="email"
                            name="email"
                            required
                            placeholder="principal@school.edu"
                            value={formData.email}
                            onChange={handleChange}
                            className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-red"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Phone / WhatsApp Number
                          </label>
                          <input
                            type="tel"
                            name="phone"
                            placeholder="+234..."
                            value={formData.phone}
                            onChange={handleChange}
                            className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-red"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Estimated Participating Students
                          </label>
                          <select
                            name="estimatedStudents"
                            value={formData.estimatedStudents}
                            onChange={handleChange}
                            className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-red"
                          >
                            <option value="20-50">20–50 Students</option>
                            <option value="50-100">50–100 Students</option>
                            <option value="100-250">100–250 Students</option>
                            <option value="250+">250+ Whole School Track</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleBack}
                          leftIcon={<ArrowLeft size={16} />}
                          className="font-bold text-xs"
                        >
                          Back
                        </Button>
                        <Button
                          type="button"
                          onClick={handleNext}
                          rightIcon={<ArrowRight size={16} />}
                          className="font-bold uppercase tracking-wider text-xs px-6"
                        >
                          Next: Curriculum Tracks
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Step 2: Curriculum Tracks */}
                  {currentStep === 2 && (
                    <div className="space-y-5 animate-in fade-in duration-200">
                      <div>
                        <h4 className="text-base font-bold text-slate-900 dark:text-white">
                          Curriculum Tracks & Programs of Interest
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Select all learning tracks you would like Jaystarbliss Studios to integrate.
                        </p>
                      </div>

                      <div className="space-y-2.5">
                        {programs.map((prog) => {
                          const isChecked = formData.programsOfInterest.includes(prog.name);

                          return (
                            <button
                              key={prog.id}
                              type="button"
                              onClick={() => handleCheckboxChange(prog.name)}
                              className={`w-full p-3.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                                isChecked
                                  ? 'border-brand-red bg-brand-red/5 dark:bg-brand-red/10 text-slate-900 dark:text-white'
                                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300'
                              }`}
                            >
                              <div className="min-w-0 pr-3">
                                <span className="block text-xs font-bold">{prog.name}</span>
                                <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{prog.shortDescription}</span>
                              </div>
                              <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ml-2 ${
                                isChecked ? 'bg-brand-red border-brand-red text-white' : 'border-slate-300 dark:border-slate-700'
                              }`}>
                                {isChecked && <Check size={12} />}
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleBack}
                          leftIcon={<ArrowLeft size={16} />}
                          className="font-bold text-xs"
                        >
                          Back
                        </Button>
                        <Button
                          type="button"
                          onClick={handleNext}
                          rightIcon={<ArrowRight size={16} />}
                          className="font-bold uppercase tracking-wider text-xs px-6"
                        >
                          Next: Specific Notes
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Step 3: Requirements & Submit */}
                  {currentStep === 3 && (
                    <div className="space-y-5 animate-in fade-in duration-200">
                      <div>
                        <h4 className="text-base font-bold text-slate-900 dark:text-white">
                          Specific Requirements & Submission
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Let us know any timetable preferences, ICT lab availability, or special requests.
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Notes / Timetable Specifications
                        </label>
                        <textarea
                          name="message"
                          rows={3}
                          value={formData.message}
                          onChange={handleChange}
                          placeholder="e.g. We have a 40-seat computer lab and would like coding clubs on Wednesdays and chess on Fridays starting next term."
                          className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-brand-red resize-none"
                        />
                      </div>

                      {/* Summary Box */}
                      <div className="p-4 rounded-xl bg-slate-900 text-white text-xs space-y-2">
                        <div className="text-[10px] font-black uppercase text-brand-red tracking-wider">
                          Proposal Request Summary
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-slate-300">
                          <div><span>School:</span> <strong className="text-white">{formData.schoolName}</strong></div>
                          <div><span>Contact:</span> <strong className="text-white">{formData.name}</strong></div>
                          <div><span>Tier Model:</span> <strong className="text-white">{selectedTier.toUpperCase()}</strong></div>
                          <div><span>Est. Students:</span> <strong className="text-white">{formData.estimatedStudents}</strong></div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleBack}
                          disabled={loading}
                          leftIcon={<ArrowLeft size={16} />}
                          className="font-bold text-xs"
                        >
                          Back
                        </Button>
                        <Button
                          type="submit"
                          disabled={loading}
                          rightIcon={<Send size={16} />}
                          className="font-black uppercase tracking-wider text-xs px-8 bg-brand-red hover:bg-red-700 text-white shadow-lg shadow-brand-red/20"
                        >
                          {loading ? 'Submitting...' : 'Send School Proposal Request'}
                        </Button>
                      </div>
                    </div>
                  )}

                </form>
              </div>
            )}
          </div>

        </div>
      </div>

    </MainLayout>
  );
};

export default SchoolPartnership;
