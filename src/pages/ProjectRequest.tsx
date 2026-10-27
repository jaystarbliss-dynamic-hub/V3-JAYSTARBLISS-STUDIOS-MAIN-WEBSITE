import React, { useState } from 'react';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import MainLayout from '../components/layout/MainLayout';
import SEO from '../components/ui/SEO';
import { CheckCircle2, ArrowRight, ArrowLeft, Send, User, Layers, Calendar } from 'lucide-react';
import Button from '../components/ui/Button';
import ProgressStepper from '../components/ui/ProgressStepper';
import { WizardActionFooter } from '../components/ui/WizardActionFooter';
import { useToast } from '../contexts/ToastContext';
import { getFriendlyErrorMessage, logInternalDiagnostic } from '../utils/friendlyErrors';

const steps = [
  { id: 'contact', title: 'Your Details', subtitle: 'Name & organization', icon: User },
  { id: 'scope', title: 'Project Scope', subtitle: 'Service & goals', icon: Layers },
  { id: 'logistics', title: 'Logistics & Budget', subtitle: 'Timeline & budget', icon: Calendar },
];

const ProjectRequest: React.FC = () => {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState({
    name: '',
    organization: '',
    email: '',
    phone: '',
    service: 'Web Development',
    description: '',
    goals: '',
    timeline: '',
    budget: '',
    existingWebsite: '',
    references: ''
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const validateStep = (stepIdx: number): boolean => {
    setError(null);
    if (stepIdx === 0) {
      if (!formData.name.trim()) {
        setError('Please enter your full name.');
        return false;
      }
      if (!formData.email.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(formData.email)) {
        setError('Please enter a valid email address.');
        return false;
      }
      return true;
    }

    if (stepIdx === 1) {
      if (!formData.description.trim()) {
        setError('Please briefly describe the project.');
        return false;
      }
      if (!formData.goals.trim()) {
        setError('Please provide the main goal or target outcome.');
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
      await addDoc(collection(db, 'inquiries'), {
        type: 'PROJECT_REQUEST',
        ...formData,
        status: 'NEW',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      setSuccess(true);
      toast.success('Project request submitted successfully! Our engineering team will review your scope and get in touch.');
    } catch (err) {
      logInternalDiagnostic('ProjectRequest::Submit', err);
      const friendly = getFriendlyErrorMessage(err);
      setError(friendly);
      toast.error(friendly);
    } finally {
      setLoading(false);
    }
  };

  return (
    <MainLayout>
      <SEO 
        title="Start a Project" 
        description="Tell us about what you want to build or design. Provide as much detail as you can, and we'll get back to you to discuss the next steps." 
      />

      {/* Header Banner */}
      <div className="bg-brand-slate text-white py-16 lg:py-24 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl relative z-10 text-center">
          <span className="inline-block text-xs font-black uppercase tracking-widest text-brand-red mb-3">
            Digital Services
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold mb-6 tracking-tight">
            Start a Project
          </h1>
          <p className="text-base sm:text-lg text-white/80 leading-relaxed font-normal max-w-2xl mx-auto">
            Tell us about what you want to build or design. Provide as much detail as you can, and we'll get back to you to discuss the next steps.
          </p>
        </div>
      </div>

      {/* Form Area */}
      <div className="py-16 md:py-24 bg-brand-neutral dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-3xl">
          
          <div className="bg-white/70 dark:bg-slate-900/60 backdrop-blur-md p-8 sm:p-12 rounded-2xl border border-white/60 dark:border-white/10 shadow-sm">
            {success ? (
              <div className="text-center py-12">
                <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-500 mx-auto mb-6">
                  <CheckCircle2 size={42} />
                </div>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-brand-slate dark:text-white mb-3">Request Received</h3>
                <p className="text-slate-600 dark:text-slate-400 mb-8 text-base max-w-md mx-auto leading-relaxed">
                  Thank you for telling us about your project. Our team will review your requirements and contact you shortly to schedule a consultation.
                </p>
                <Button to="/" variant="secondary" size="lg" rightIcon={<ArrowRight size={18} />}>
                  RETURN TO HOME
                </Button>
              </div>
            ) : (
              <div>
                {/* Visual Progress Stepper */}
                <div className="mb-10 pb-8 border-b border-slate-100 dark:border-slate-800">
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
                  <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 rounded-xl text-xs sm:text-sm font-semibold">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Step 1: Details */}
                  {currentStep === 0 && (
                    <div className="space-y-6 animate-in fade-in duration-200">
                      <div>
                        <h4 className="text-lg font-bold text-brand-slate dark:text-white mb-1">Your Details</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Tell us who you are and how we can reach you.</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="block text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
                            Full Name <span className="text-brand-red">*</span>
                          </label>
                          <input
                            type="text"
                            name="name"
                            required
                            placeholder="Alex Morgan"
                            value={formData.name}
                            onChange={handleChange}
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-red text-slate-900 dark:text-white text-sm"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="block text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
                            Organization / Business
                          </label>
                          <input
                            type="text"
                            name="organization"
                            placeholder="Company or Brand Name"
                            value={formData.organization}
                            onChange={handleChange}
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-red text-slate-900 dark:text-white text-sm"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="block text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
                            Email Address <span className="text-brand-red">*</span>
                          </label>
                          <input
                            type="email"
                            name="email"
                            required
                            placeholder="alex@company.com"
                            value={formData.email}
                            onChange={handleChange}
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-red text-slate-900 dark:text-white text-sm"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="block text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
                            Phone Number
                          </label>
                          <input
                            type="tel"
                            name="phone"
                            placeholder="+234..."
                            value={formData.phone}
                            onChange={handleChange}
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-red text-slate-900 dark:text-white text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 2: Scope */}
                  {currentStep === 1 && (
                    <div className="space-y-6 animate-in fade-in duration-200">
                      <div>
                        <h4 className="text-lg font-bold text-brand-slate dark:text-white mb-1">Project Scope</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Describe what you need built or designed.</p>
                      </div>

                      <div className="space-y-2">
                        <label className="block text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
                          Primary Service Needed
                        </label>
                        <select
                          name="service"
                          value={formData.service}
                          onChange={handleChange}
                          className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-red text-slate-900 dark:text-white text-sm"
                        >
                          <option value="Web Development">Web Development</option>
                          <option value="Mobile App Development">Mobile App Development</option>
                          <option value="UI/UX Design">UI/UX Design</option>
                          <option value="Brand Identity">Brand Identity & Graphics</option>
                          <option value="Digital Media Production">Digital Media Production</option>
                          <option value="Tech Consulting">Tech Consulting</option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="block text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
                          Project Description <span className="text-brand-red">*</span>
                        </label>
                        <textarea
                          name="description"
                          rows={4}
                          required
                          placeholder="What are the key features, purpose, and target users?"
                          value={formData.description}
                          onChange={handleChange}
                          className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-red text-slate-900 dark:text-white text-sm resize-none"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="block text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
                          Main Goal / Target Outcome <span className="text-brand-red">*</span>
                        </label>
                        <input
                          type="text"
                          name="goals"
                          required
                          placeholder="e.g., Increase online conversions, automate registrations"
                          value={formData.goals}
                          onChange={handleChange}
                          className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-red text-slate-900 dark:text-white text-sm"
                        />
                      </div>
                    </div>
                  )}

                  {/* Step 3: Logistics & Budget */}
                  {currentStep === 2 && (
                    <div className="space-y-6 animate-in fade-in duration-200">
                      <div>
                        <h4 className="text-lg font-bold text-brand-slate dark:text-white mb-1">Logistics & Budget</h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Help us understand your timeline and parameters.</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="block text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
                            Estimated Timeline
                          </label>
                          <input
                            type="text"
                            name="timeline"
                            placeholder="e.g., 4-6 weeks, Immediate"
                            value={formData.timeline}
                            onChange={handleChange}
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-red text-slate-900 dark:text-white text-sm"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="block text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
                            Budget Range (Optional)
                          </label>
                          <input
                            type="text"
                            name="budget"
                            placeholder="e.g., Flexible / $1,000 - $3,000"
                            value={formData.budget}
                            onChange={handleChange}
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-red text-slate-900 dark:text-white text-sm"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="block text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
                          Existing Website or Assets (if any)
                        </label>
                        <input
                          type="url"
                          name="existingWebsite"
                          placeholder="https://"
                          value={formData.existingWebsite}
                          onChange={handleChange}
                          className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-red text-slate-900 dark:text-white text-sm"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="block text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
                          Reference Links / Notes
                        </label>
                        <textarea
                          name="references"
                          rows={2}
                          placeholder="Links, inspirations, or additional details..."
                          value={formData.references}
                          onChange={handleChange}
                          className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-red text-slate-900 dark:text-white text-sm resize-none"
                        />
                      </div>
                    </div>
                  )}

                  {/* Nav Controls */}
                  <WizardActionFooter
                    currentStep={currentStep + 1}
                    totalSteps={steps.length}
                    stepLabel={steps[currentStep].title}
                    isFirstStep={currentStep === 0}
                    isLastStep={currentStep === steps.length - 1}
                    canProceed={!loading}
                    isSubmitting={loading}
                    primaryLabel={currentStep === steps.length - 1 ? 'Send Project Request' : `Continue to Step ${currentStep + 2}`}
                    onNext={currentStep < steps.length - 1 ? handleNext : undefined}
                    onBack={currentStep > 0 ? handleBack : undefined}
                    stickyMobile={true}
                  />
                </form>
              </div>
            )}
          </div>

        </div>
      </div>
    </MainLayout>
  );
};

export default ProjectRequest;
