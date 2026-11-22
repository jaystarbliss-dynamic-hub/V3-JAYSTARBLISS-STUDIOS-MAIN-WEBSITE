import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import MainLayout from '../components/layout/MainLayout';
import SEO from '../components/ui/SEO';
import {
  CheckCircle2,
  ArrowRight,
  User,
  Briefcase,
  FileText,
  Camera,
  Upload,
  Loader2,
} from 'lucide-react';
import Button from '../components/ui/Button';
import ProgressStepper from '../components/ui/ProgressStepper';
import { WizardActionFooter } from '../components/ui/WizardActionFooter';
import { useToast } from '../contexts/ToastContext';
import { getFriendlyErrorMessage, logInternalDiagnostic } from '../utils/friendlyErrors';
import { uploadImageToCloudinary } from '../lib/cloudinary';
import {
  buildCanonicalTutorApplicationPayload,
  isValidTutorPhotoUrl,
} from '../lib/tutorDirectory';
import { dispatchActionableAlert } from '../lib/adminAlertDispatcher';

const steps = [
  { id: 'personal', title: 'Personal Info', subtitle: 'Photo & contact details', icon: User },
  { id: 'expertise', title: 'Expertise', subtitle: 'Skills & experience', icon: Briefcase },
  { id: 'background', title: 'Bio & Portfolio', subtitle: 'Review & submit', icon: FileText },
];

const TutorApplication: React.FC = () => {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    location: '',
    photoURL: '',
    expertise: '',
    experience: '',
    ageGroup: '',
    subjects: '',
    availability: '',
    introduction: '',
    portfolioLink: '',
  });
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please upload a valid JPG, PNG, or WEBP photograph.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Profile photograph must be smaller than 5 MB.');
      return;
    }
    setUploadingPhoto(true);
    setError(null);
    try {
      const uploaded = await uploadImageToCloudinary(file);
      const secureUrl = uploaded.secureUrl || uploaded.url;
      setFormData((prev) => ({ ...prev, photoURL: secureUrl }));
      toast.success('Profile photograph uploaded.');
    } catch (err) {
      logInternalDiagnostic('TutorApplication::PhotoUpload', err);
      const msg = getFriendlyErrorMessage(err);
      setError(msg);
      toast.error(msg);
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const validateStep = (stepIdx: number): boolean => {
    setError(null);
    if (stepIdx === 0) {
      if (!formData.name.trim()) {
        setError('Please provide your full name.');
        return false;
      }
      if (!formData.email.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(formData.email)) {
        setError('Please provide a valid email address.');
        return false;
      }
      if (!formData.phone.trim()) {
        setError('Please provide a contact phone number.');
        return false;
      }
      if (!isValidTutorPhotoUrl(formData.photoURL)) {
        setError(
          'A clear uploaded profile photograph is mandatory before continuing your tutor application.'
        );
        return false;
      }
      return true;
    }

    if (stepIdx === 1) {
      if (!formData.expertise.trim()) {
        setError('Please indicate your primary area of expertise.');
        return false;
      }
      if (!formData.subjects.trim()) {
        setError('Please specify the subjects or skills you can teach.');
        return false;
      }
      return true;
    }

    if (stepIdx === 2) {
      if (!isValidTutorPhotoUrl(formData.photoURL)) {
        setError('A clear uploaded profile photograph is mandatory to submit your application.');
        return false;
      }
      if (!formData.introduction.trim()) {
        setError('Please write a brief introduction or teaching statement.');
        return false;
      }
      return true;
    }

    return true;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setError(null);
      setCurrentStep((prev) => Math.min(steps.length - 1, prev + 1));
    }
  };

  const handleBack = () => {
    setError(null);
    setCurrentStep((prev) => Math.max(0, prev - 1));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateStep(currentStep)) return;

    setLoading(true);
    setError(null);

    try {
      const subjectList = [
        ...formData.subjects
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        ...(formData.expertise.trim() ? [formData.expertise.trim()] : []),
      ];

      const canonicalPayload = buildCanonicalTutorApplicationPayload({
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        location: formData.location,
        photoURL: formData.photoURL,
        subjects: subjectList,
        qualification: formData.expertise,
        experienceYears: formData.experience,
        timeSlot: formData.availability,
        cvUrl: formData.portfolioLink,
        bio: formData.introduction,
        source: 'TUTOR_APPLICATION_PAGE',
      });

      const appRef = await addDoc(collection(db, 'tutor_applications'), {
        ...canonicalPayload,
        preferredAgeGroup: formData.ageGroup,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const applicantName = formData.name.trim() || 'Tutor Applicant';
      void dispatchActionableAlert({
        category: 'tutor_application',
        categoryLabel: 'New Tutor Application',
        notificationType: 'registration',
        priority: 'high',
        title: `New Tutor Application: ${applicantName}`,
        message: `${applicantName} submitted a tutor application (${subjectList.slice(0, 3).join(', ') || 'General'}) and is awaiting approval.`,
        actionPath: '/admin/approvals?tab=tutors',
        actionText: 'Review Tutor Application',
        notifyPlatformAdmins: true,
        details: [
          { label: 'Applicant', value: applicantName },
          { label: 'Email', value: formData.email.trim().toLowerCase() },
          { label: 'Location', value: formData.location || '—' },
          { label: 'Subjects', value: subjectList.join(', ') || '—' },
        ],
        senderName: applicantName,
        senderRole: 'Tutor Applicant',
        replyTo: formData.email.trim().toLowerCase(),
        dedupeKey: `tut_app_${appRef.id}`,
      });

      setSuccess(true);
      toast.success(
        'Your tutor application has been submitted for administrative review.'
      );
    } catch (err) {
      logInternalDiagnostic('TutorApplication::Submit', err);
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
        title="Become a Tutor"
        description="Join our network of skilled instructors and mentors teaching coding, robotics, digital skills, and creative media at Jaystarbliss Studios."
      />

      {/* Header Banner */}
      <div className="bg-brand-slate text-white py-16 lg:py-24 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:24px_24px] pointer-events-none" />
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl relative z-10 text-center">
          <span className="inline-block text-xs font-black uppercase tracking-widest text-brand-red mb-3">
            Mentorship Network
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold mb-6 tracking-tight">
            Become a Tutor
          </h1>
          <p className="text-base sm:text-lg text-white/80 leading-relaxed font-normal max-w-2xl mx-auto">
            Join our network of skilled professionals who are passionate about teaching, mentoring,
            and helping others grow.
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
                <h3 className="text-2xl sm:text-3xl font-extrabold text-brand-slate dark:text-white mb-3">
                  Application Submitted!
                </h3>
                <p className="text-slate-600 dark:text-slate-400 mb-8 text-base max-w-md mx-auto leading-relaxed">
                  Thank you for applying. Our academic team will review your credentials and
                  photograph before publishing your profile to the tutor directory.
                </p>
                <Button to="/" variant="secondary" size="lg" rightIcon={<ArrowRight size={18} />}>
                  RETURN TO HOME
                </Button>
              </div>
            ) : (
              <div>
                {/* Visual Stepper */}
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
                  {/* Step 1: Personal Information & Mandatory Profile Photo */}
                  {currentStep === 0 && (
                    <div className="space-y-6 animate-in fade-in duration-200">
                      <div>
                        <h4 className="text-lg font-bold text-brand-slate dark:text-white mb-1">
                          Personal Information &amp; Profile Photograph
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          A clear headshot photograph is mandatory for all tutor applications.
                        </p>
                      </div>

                      {/* Mandatory Cloudinary Profile Photo Upload */}
                      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className="w-16 h-16 rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center shrink-0">
                            {isValidTutorPhotoUrl(formData.photoURL) ? (
                              <img
                                src={formData.photoURL}
                                alt="Applicant portrait preview"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Camera size={22} className="text-slate-400" />
                            )}
                          </div>
                          <div>
                            <div className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                              Profile Photograph <span className="text-brand-red">*</span>
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              {isValidTutorPhotoUrl(formData.photoURL)
                                ? 'Photograph uploaded and ready for review.'
                                : 'Upload a clear portrait (JPG, PNG, or WEBP, max 5 MB).'}
                            </p>
                          </div>
                        </div>

                        <label className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand-slate hover:bg-slate-800 text-white text-xs font-bold cursor-pointer shrink-0 transition-colors">
                          {uploadingPhoto ? (
                            <>
                              <Loader2 size={14} className="animate-spin" />
                              <span>Uploading...</span>
                            </>
                          ) : (
                            <>
                              <Upload size={14} />
                              <span>
                                {isValidTutorPhotoUrl(formData.photoURL)
                                  ? 'Replace Photo'
                                  : 'Upload Photo'}
                              </span>
                            </>
                          )}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            disabled={uploadingPhoto}
                            onChange={handlePhotoUpload}
                            className="hidden"
                          />
                        </label>
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
                            Email Address <span className="text-brand-red">*</span>
                          </label>
                          <input
                            type="email"
                            name="email"
                            required
                            placeholder="alex@example.com"
                            value={formData.email}
                            onChange={handleChange}
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-red text-slate-900 dark:text-white text-sm"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="block text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
                            Phone Number <span className="text-brand-red">*</span>
                          </label>
                          <input
                            type="tel"
                            name="phone"
                            required
                            placeholder="+234..."
                            value={formData.phone}
                            onChange={handleChange}
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-red text-slate-900 dark:text-white text-sm"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="block text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
                            City / Location
                          </label>
                          <input
                            type="text"
                            name="location"
                            placeholder="e.g., Lagos, Nigeria"
                            value={formData.location}
                            onChange={handleChange}
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-red text-slate-900 dark:text-white text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 2: Professional Details */}
                  {currentStep === 1 && (
                    <div className="space-y-6 animate-in fade-in duration-200">
                      <div>
                        <h4 className="text-lg font-bold text-brand-slate dark:text-white mb-1">
                          Professional Details
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Share your teaching skills and subject mastery.
                        </p>
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="block text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
                            Primary Area of Expertise <span className="text-brand-red">*</span>
                          </label>
                          <input
                            type="text"
                            name="expertise"
                            required
                            placeholder="e.g. Web Development, Robotics, Graphic Design"
                            value={formData.expertise}
                            onChange={handleChange}
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-red text-slate-900 dark:text-white text-sm"
                          />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="block text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
                              Years of Experience
                            </label>
                            <select
                              name="experience"
                              value={formData.experience}
                              onChange={handleChange}
                              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-red text-slate-900 dark:text-white text-sm"
                            >
                              <option value="">Select experience...</option>
                              <option value="Less than 1 year">Less than 1 year</option>
                              <option value="1 - 3 years">1 - 3 years</option>
                              <option value="3 - 5 years">3 - 5 years</option>
                              <option value="5+ years">5+ years</option>
                            </select>
                          </div>

                          <div className="space-y-2">
                            <label className="block text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
                              Preferred Age Group
                            </label>
                            <select
                              name="ageGroup"
                              value={formData.ageGroup}
                              onChange={handleChange}
                              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-red text-slate-900 dark:text-white text-sm"
                            >
                              <option value="">Select age group...</option>
                              <option value="Children (7-12)">Children (7-12)</option>
                              <option value="Teens (13-17)">Teens (13-17)</option>
                              <option value="Adults (18+)">Adults (18+)</option>
                              <option value="Any Age Group">Any Age Group</option>
                            </select>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="block text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
                            Specific Subjects/Skills You Teach <span className="text-brand-red">*</span>
                          </label>
                          <textarea
                            name="subjects"
                            required
                            rows={2}
                            placeholder="e.g. Python, Scratch, React, UI/UX, Blender..."
                            value={formData.subjects}
                            onChange={handleChange}
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-red text-slate-900 dark:text-white text-sm resize-none"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="block text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
                            Teaching Availability
                          </label>
                          <select
                            name="availability"
                            value={formData.availability}
                            onChange={handleChange}
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-red text-slate-900 dark:text-white text-sm"
                          >
                            <option value="">Select availability...</option>
                            <option value="Online Only">Online Only</option>
                            <option value="Physical Only">Physical Only</option>
                            <option value="Both Online and Physical">Both Online and Physical</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 3: Bio & Review */}
                  {currentStep === 2 && (
                    <div className="space-y-6 animate-in fade-in duration-200">
                      <div>
                        <h4 className="text-lg font-bold text-brand-slate dark:text-white mb-1">
                          Introduction &amp; Review
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Tell us about your teaching philosophy and experience.
                        </p>
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="block text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
                            Short Introduction <span className="text-brand-red">*</span>
                          </label>
                          <textarea
                            name="introduction"
                            required
                            rows={4}
                            placeholder="Write a brief overview of your teaching approach and experience..."
                            value={formData.introduction}
                            onChange={handleChange}
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-red text-slate-900 dark:text-white text-sm resize-none"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="block text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
                            Portfolio / LinkedIn / CV Link (Optional)
                          </label>
                          <input
                            type="url"
                            name="portfolioLink"
                            placeholder="https://linkedin.com/in/... or https://github.com/..."
                            value={formData.portfolioLink}
                            onChange={handleChange}
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:ring-2 focus:ring-brand-red text-slate-900 dark:text-white text-sm"
                          />
                        </div>

                        {/* Summary */}
                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center gap-4 text-xs">
                          {isValidTutorPhotoUrl(formData.photoURL) && (
                            <img
                              src={formData.photoURL}
                              alt={formData.name || 'Applicant'}
                              className="w-12 h-12 rounded-lg object-cover shrink-0 border border-slate-200 dark:border-slate-700"
                            />
                          )}
                          <div className="space-y-1">
                            <div className="font-bold text-brand-slate dark:text-white uppercase tracking-wider">
                              Application Summary
                            </div>
                            <div>
                              <span className="text-slate-500">Applicant:</span>{' '}
                              <strong className="text-slate-900 dark:text-white">
                                {formData.name}
                              </strong>
                            </div>
                            <div>
                              <span className="text-slate-500">Expertise:</span>{' '}
                              <strong className="text-slate-900 dark:text-white">
                                {formData.expertise}
                              </strong>
                            </div>
                            <div>
                              <span className="text-slate-500">Subjects:</span>{' '}
                              <strong className="text-slate-900 dark:text-white">
                                {formData.subjects}
                              </strong>
                            </div>
                          </div>
                        </div>
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
                    canProceed={!loading && !uploadingPhoto}
                    isSubmitting={loading}
                    primaryLabel={
                      currentStep === steps.length - 1
                        ? 'Submit Application'
                        : `Continue to Step ${currentStep + 2}`
                    }
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

export default TutorApplication;
