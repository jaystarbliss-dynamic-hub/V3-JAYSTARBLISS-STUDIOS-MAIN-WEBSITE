import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { 
  Sun, Moon, CheckCircle2, Users, GraduationCap, 
  User, Phone, Mail, Lock, BookOpen, 
  ArrowLeft, ArrowRight, Award, Calendar,
  Clock, MapPin, Eye, EyeOff, Check,
  ShieldCheck, AlertCircle, HelpCircle
} from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { collection, addDoc, doc, setDoc, serverTimestamp, getDoc, deleteDoc } from 'firebase/firestore';
import { useTheme } from '../hooks/useTheme';
import SEO from '../components/ui/SEO';
import { JaystarblissIcon } from '../components/common/JaystarblissLogo';
import { useToast } from '../contexts/ToastContext';
import CyberLiquidButton from '../components/portal/CyberLiquidButton';
import portalWallpaper from '../assets/jdi login bg.png';
import './Portal.css';
import './SecurePortalTheme.css';

type RegisterMode = 'parent' | 'student' | 'tutor';
type StepKey = 'role' | 'basic' | 'details' | 'security';

const SUBJECTS = [
  'Coding & Scratch (Kids & Beginners)', 'Python & Data Science', 'Full-Stack Web Dev (React & Node)',
  'Robotics & Embedded IoT', 'Artificial Intelligence & Machine Learning', 'UI/UX & Product Design',
  'Graphic Design & Digital Art', 'Mobile App Development (Flutter/React Native)', 'Cybersecurity & Ethical Hacking',
  'Mathematics & Logic', 'English & Creative Writing', 'Physics & Electronics',
  'WAEC / NECO / IGCSE Prep', 'JAMB / UTME Masterclass', 'Music Theory & Piano',
  'Chess Strategy & Cognitive Logic'
];

import { CANONICAL_CLASSES, normalizeClassName } from '../lib/classes';

const STUDENT_CLASSES: string[] = [...CANONICAL_CLASSES];

const QUALIFICATIONS = [
  'B.Sc / B.Eng in Computer Science / Engineering',
  'B.Ed / Certified Education Specialist',
  'M.Sc / Postgraduate Degree',
  'HND / Higher National Diploma',
  'Professional Coding & Technology Instructor',
  'Undergraduate / Student Mentor',
  'Self-Taught Senior Software Engineer'
];

const DAYS_OPTIONS = [
  '1–2 Days per Week (Part-time / Weekday Evenings)',
  '3–4 Days per Week (Standard Cohort)',
  '5 Days per Week (Full-Time Academic Instructor)',
  'Weekends Only (Saturday & Sunday Intensive)'
];

const TIME_SLOTS = [
  'Morning Slots (8:00 AM – 12:00 PM)',
  'Afternoon Slots (12:00 PM – 4:00 PM)',
  'Evening Slots (4:00 PM – 8:00 PM)',
  'Flexible / Open Availability'
];

const Register: React.FC = () => {
  const { toast } = useToast();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const [mode, setMode] = useState<RegisterMode>('parent');
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [slideDirection, setSlideDirection] = useState<'forward' | 'backward'>('forward');
  
  // Passwords visibility
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Common Fields
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  
  // Security
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  
  // Parent Fields
  const [childrenCount, setChildrenCount] = useState('1 Child');
  const [parentNotes, setParentNotes] = useState('');
  
  // Student Fields
  const [studentClass, setStudentClass] = useState<string>('Grade 7');
  const [isAdultOrIndependent, setIsAdultOrIndependent] = useState(true);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([
    'Coding & Scratch (Kids & Beginners)', 
    'Python & Data Science'
  ]);
  const [studentGoals, setStudentGoals] = useState('');

  // Age calculation helper
  const calculateAge = (dobString: string): number => {
    if (!dobString) return 0;
    const birthDate = new Date(dobString);
    if (isNaN(birthDate.getTime())) return 0;
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  // Tutor Specific Fields
  const [location, setLocation] = useState('');
  const [qualification, setQualification] = useState(QUALIFICATIONS[0]);
  const [cvUrl, setCvUrl] = useState('');
  const [experienceYears, setExperienceYears] = useState('1–3 Years');
  const [daysPerWeek, setDaysPerWeek] = useState(DAYS_OPTIONS[1]);
  const [timeSlot, setTimeSlot] = useState(TIME_SLOTS[2]);
  const [expectedSalary, setExpectedSalary] = useState('');
  const [tutorBio, setTutorBio] = useState('');

  // URL mode initialization
  useEffect(() => {
    const urlMode = searchParams.get('mode');
    if (urlMode === 'tutor' || urlMode === 'student' || urlMode === 'parent') {
      setMode(urlMode);
      setCurrentStepIndex(1); // Skip to basic details if mode is in URL
    }
  }, [searchParams]);

  // Steps definition
  const steps: { key: StepKey; title: string; subtitle: string }[] = [
    { key: 'role', title: 'Account Type', subtitle: 'Choose profile' },
    { key: 'basic', title: 'Basic Info', subtitle: 'Contact details' },
    { key: 'details', title: mode === 'parent' ? 'Cadet Details' : mode === 'student' ? 'Learning Track' : 'Specialization', subtitle: 'Preferences' },
    { key: 'security', title: 'Password & Finish', subtitle: 'Final setup' },
  ];

  // Subject toggling
  const handleSubjectToggle = (subj: string) => {
    setSelectedSubjects(prev => {
      if (prev.includes(subj)) {
        if (prev.length === 1) return prev; // At least one
        return prev.filter(s => s !== subj);
      } else {
        return [...prev, subj];
      }
    });
  };

  // Password strength
  const getPasswordStrength = (pw: string) => {
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return score;
  };
  const pwScore = getPasswordStrength(password);
  const pwLabels = ['Too Weak', 'Fair', 'Good', 'Strong'];
  const pwColors = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981'];

  // Role selector click
  const handleSelectRole = (selectedRole: RegisterMode) => {
    setMode(selectedRole);
    setSlideDirection('forward');
    setError('');
    setCurrentStepIndex(1);
  };

  // Step validation
  const validateCurrentStep = (): boolean => {
    setError('');
    const stepKey = steps[currentStepIndex].key;

    if (stepKey === 'role') {
      return true;
    }

    if (stepKey === 'basic') {
      if (!fullName.trim()) {
        setError('Please enter your full name.');
        return false;
      }
      if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) {
        setError('Please enter a valid email address.');
        return false;
      }
      if (!phone.trim() || phone.replace(/[^0-9]/g, '').length < 8) {
        setError('Please enter a valid phone number (at least 8 digits).');
        return false;
      }
      if (mode === 'student') {
        if (!dateOfBirth) {
          setError('Please provide your date of birth.');
          return false;
        }
        const age = calculateAge(dateOfBirth);
        if (age < 18) {
          setError('Access denied: You must be at least 18 years old to create an Independent Student account. Students under 18 must be registered through a Parent or Guardian account.');
          return false;
        }
      }
      return true;
    }

    if (stepKey === 'details') {
      if (mode === 'student') {
        if (!selectedSubjects.length) {
          setError('Please select at least one learning track or subject.');
          return false;
        }
      }
      if (mode === 'tutor') {
        if (!selectedSubjects.length) {
          setError('Please select at least one track you can teach.');
          return false;
        }
        if (!expectedSalary.trim()) {
          setError('Please specify your expected remuneration or rate.');
          return false;
        }
      }
      return true;
    }

    if (stepKey === 'security') {
      if (password.length < 8) {
        setError('Password must be at least 8 characters long.');
        return false;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match. Please verify.');
        return false;
      }
      if (!agreeTerms) {
        setError('Please accept the terms and conditions to proceed.');
        return false;
      }
      return true;
    }

    return true;
  };

  const handleNext = () => {
    if (!validateCurrentStep()) return;
    setSlideDirection('forward');
    setCurrentStepIndex(prev => Math.min(prev + 1, steps.length - 1));
  };

  const handleBack = () => {
    setError('');
    setSlideDirection('backward');
    setCurrentStepIndex(prev => Math.max(prev - 1, 0));
  };

  const notifyAdminsOfRegistration = async (user: import('firebase/auth').User) => {
    try {
      const token = await user.getIdToken();
      const response = await fetch('/.netlify/functions/admin-registration-notification', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (!response.ok) console.warn('Admin registration notification was not dispatched.');
    } catch (error) {
      // Registration must succeed even if the notification service is temporarily unavailable.
      console.warn('Admin registration notification unavailable:', error);
    }
  };

  // Form submission
  const handleSubmit = async () => {
    if (!validateCurrentStep()) return;
    setLoading(true);
    setError('');
    setSuccess('');

    if (mode === 'parent') {
      try {
        const cred = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
        await sendEmailVerification(cred.user).catch(() => undefined);
        
        let finalRole = email.trim().toLowerCase() === 'johnrufai242@gmail.com' ? 'super_admin' : 'parent';
        try {
          const inviteDocRef = doc(db, 'invites', email.trim().toLowerCase());
          const inviteSnap = await getDoc(inviteDocRef);
          if (inviteSnap.exists()) {
             finalRole = inviteSnap.data().role.toLowerCase();
             await deleteDoc(inviteDocRef);
          }
        } catch (err) {
          console.error('Invite lookup error:', err);
        }
        
        const data = {
          name: fullName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          role: finalRole,
          childrenCount,
          preferredTracks: selectedSubjects,
          notes: parentNotes.trim(),
          children: [],
          emailVerified: false,
          createdAt: serverTimestamp()
        };
        
        await setDoc(doc(db, 'parents', cred.user.uid), data);
        await setDoc(doc(db, 'users', cred.user.uid), data);
        await notifyAdminsOfRegistration(cred.user);
        
        sessionStorage.setItem('userId', cred.user.uid);
        sessionStorage.setItem('userRole', 'parent');
        sessionStorage.setItem('userEmail', email.trim().toLowerCase());
        sessionStorage.setItem('userName', fullName.trim());
        
        setSuccess('Account created successfully! A verification email has been sent.');
        toast.success('Account created! Welcome to Jaystarbliss Studios.');
        
        setTimeout(() => {
          navigate('/portal/parent');
        }, 1200);
      } catch (err: any) {
        let msg = 'Registration failed. Please try again.';
        if (err.code === 'auth/email-already-in-use') msg = 'This email is already registered. Try logging in instead.';
        if (err.code === 'auth/weak-password') msg = 'Password is too weak — use at least 8 characters.';
        if (err.code === 'auth/invalid-email') msg = 'Please enter a valid email address.';
        if (err.code === 'auth/network-request-failed') msg = 'Network error. Please check your internet connection.';
        setError(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    } else if (mode === 'student') {
      try {
        // Create direct auth account for independent student
        const cred = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
        await sendEmailVerification(cred.user).catch(() => undefined);

        const normalizedStudentClass = normalizeClassName(studentClass, 'Grade 7');
        const data = {
          name: fullName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          dateOfBirth,
          age: calculateAge(dateOfBirth),
          role: 'student',
          class: normalizedStudentClass,
          grade: normalizedStudentClass,
          isIndependent: true,
          subjects: selectedSubjects,
          goals: studentGoals.trim(),
          status: 'active',
          emailVerified: false,
          createdAt: serverTimestamp()
        };

        await setDoc(doc(db, 'students', cred.user.uid), data);
        await setDoc(doc(db, 'users', cred.user.uid), data);
        await notifyAdminsOfRegistration(cred.user);

        // Also add reference request for admin audit
        await addDoc(collection(db, 'student_requests'), {
          studentId: cred.user.uid,
          ...data
        });

        sessionStorage.setItem('userId', cred.user.uid);
        sessionStorage.setItem('userRole', 'student');
        sessionStorage.setItem('userEmail', email.trim().toLowerCase());
        sessionStorage.setItem('userName', fullName.trim());

        setSuccess('Student account created successfully! Welcome to your learning portal.');
        toast.success('Student account created! Redirecting to student hub...');
        
        setTimeout(() => {
          navigate('/portal/student');
        }, 1200);
      } catch (err: any) {
        let msg = 'Registration failed. Please try again.';
        if (err.code === 'auth/email-already-in-use') msg = 'This email is already registered. Try logging in instead.';
        if (err.code === 'auth/weak-password') msg = 'Password is too weak — use at least 8 characters.';
        if (err.code === 'auth/invalid-email') msg = 'Please enter a valid email address.';
        if (err.code === 'auth/network-request-failed') msg = 'Network error. Please check your internet connection.';
        setError(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    } else if (mode === 'tutor') {
      try {
        // Submit tutor application for admin review
        await addDoc(collection(db, 'tutor_applications'), {
          name: fullName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          location: location.trim(),
          qualification: qualification.trim(),
          cvUrl: cvUrl.trim(),
          subjects: selectedSubjects,
          experienceYears,
          daysPerWeek,
          timeSlot,
          expectedSalary: expectedSalary.trim(),
          bio: tutorBio.trim(),
          status: 'pending',
          createdAt: serverTimestamp()
        });
        
        setSuccess('Instructor Application submitted! Our Academic Directorate will review your curriculum credentials and schedule your onboarding consultation.');
        toast.success('Instructor application received! Our team will contact you soon.');
        
        // Reset form
        setTimeout(() => {
          navigate('/portal');
        }, 3000);
      } catch (err: any) {
        setError('Error submitting tutor application. Please try again or contact us.');
        toast.error('Error submitting tutor application. Please try again.');
        console.error('Tutor application error:', err);
      } finally {
        setLoading(false);
      }
    }
  };

  const currentStep = steps[currentStepIndex];

  return (
    <div className={`jdh-portal ${theme === 'dark' ? 'dark' : 'light'}`}>
      <div className="jdh-portal-bg-viewport" aria-hidden="true">
        <img src={portalWallpaper} alt="" />
        <div className="bg-overlay" />
      </div>
      
      <SEO 
        title="Account Registration | Jaystarbliss Studios" 
        description="Register for coding programs, software engineering tracks, robotics courses, and academic curricula at Jaystarbliss Studios." 
      />
      <div className="scanlines" />
      
      <div className="card glass-modal-card register-modal-card max-w-xl mx-auto">
        {/* TOP BRAND HEADER - Clean without 'JAYSTARBLISS' text, logo beside 'Create your account' */}
        <div className="glass-header text-center pt-3 pb-4">
          <div className="flex items-center justify-center gap-3 select-none mx-auto mb-2">
            <JaystarblissIcon className="w-8 h-8 rounded-xl shrink-0 shadow-md" />
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Create your account
            </h1>
          </div>
          <p className="text-xs text-slate-300 font-medium max-w-md mx-auto">
            {currentStep.key === 'role' && 'Select your profile below to start your personalized technology journey.'}
            {currentStep.key === 'basic' && `Fill in your basic information to set up your ${mode === 'parent' ? 'parent' : mode === 'student' ? 'independent student' : 'instructor'} account.`}
            {currentStep.key === 'details' && `Customize your learning tracks and curriculum preferences.`}
            {currentStep.key === 'security' && `Set your secure credentials and finish account creation.`}
          </p>
        </div>

        {/* STEP PROGRESS INDICATOR */}
        {currentStepIndex > 0 && (
          <div className="px-6 py-2 border-b border-white/10 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleBack}
                className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-white transition flex items-center gap-1 text-[11px] font-bold"
              >
                <ArrowLeft size={13} /> Back
              </button>
              <span className="text-[11px] font-bold text-brand-red uppercase tracking-wider">
                Step 0{currentStepIndex + 1} of 0{steps.length}
              </span>
            </div>
            <span className="text-xs font-semibold text-slate-300">
              {currentStep.title} ({mode.toUpperCase()})
            </span>
          </div>
        )}

        {/* FEEDBACK BANNERS */}
        {error && (
          <div className="mx-6 mt-4 p-3.5 rounded-2xl bg-red-950/80 border border-red-500/50 text-red-200 text-xs flex items-center gap-2.5 animate-in fade-in">
            <AlertCircle size={16} className="text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="mx-6 mt-4 p-3.5 rounded-2xl bg-emerald-950/80 border border-emerald-500/50 text-emerald-200 text-xs flex items-center gap-2.5 animate-in fade-in">
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* INTERACTIVE FORM BODY */}
        <div className="p-6">
          {/* STEP 1: INTERACTIVE ROLE SELECTION */}
          {currentStep.key === 'role' && (
            <div className="space-y-3 animate-in fade-in slide-in-from-right duration-300">
              <div className="text-center mb-4">
                <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
                  Step 1 • Choose Your Role
                </span>
                <h2 className="text-lg font-bold text-white mt-1">
                  How will you be using the portal?
                </h2>
              </div>

              {/* Parent Card */}
              <button
                type="button"
                onClick={() => handleSelectRole('parent')}
                className="w-full text-left p-4 sm:p-4.5 rounded-2xl border border-white/15 bg-white/5 hover:bg-white/10 hover:border-brand-red transition-all group relative overflow-hidden flex items-center justify-between gap-4 shadow-sm"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-xl bg-red-500/20 text-brand-red border border-red-500/30 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Users size={22} />
                  </div>
                  <h3 className="font-bold text-sm sm:text-base text-white group-hover:text-red-400 transition-colors">
                    Parent or guardian account
                  </h3>
                </div>
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-slate-300 group-hover:bg-brand-red group-hover:text-white transition-all shrink-0">
                  <ArrowRight size={15} />
                </div>
              </button>

              {/* Student Card */}
              <button
                type="button"
                onClick={() => handleSelectRole('student')}
                className="w-full text-left p-4 sm:p-4.5 rounded-2xl border border-white/15 bg-white/5 hover:bg-white/10 hover:border-brand-red transition-all group relative overflow-hidden flex items-center justify-between gap-4 shadow-sm"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <GraduationCap size={22} />
                  </div>
                  <h3 className="font-bold text-sm sm:text-base text-white group-hover:text-blue-400 transition-colors">
                    Independent student
                  </h3>
                </div>
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-slate-300 group-hover:bg-brand-red group-hover:text-white transition-all shrink-0">
                  <ArrowRight size={15} />
                </div>
              </button>

              {/* Tutor Card */}
              <button
                type="button"
                onClick={() => handleSelectRole('tutor')}
                className="w-full text-left p-4 sm:p-4.5 rounded-2xl border border-white/15 bg-white/5 hover:bg-white/10 hover:border-brand-red transition-all group relative overflow-hidden flex items-center justify-between gap-4 shadow-sm"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Award size={22} />
                  </div>
                  <h3 className="font-bold text-sm sm:text-base text-white group-hover:text-purple-400 transition-colors">
                    Tutor application
                  </h3>
                </div>
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-slate-300 group-hover:bg-brand-red group-hover:text-white transition-all shrink-0">
                  <ArrowRight size={15} />
                </div>
              </button>
            </div>
          )}

          {/* STEP 2: BASIC INFO (NAME, EMAIL, PHONE, DOB) */}
          {currentStep.key === 'basic' && (
            <div className={`space-y-4 animate-in fade-in ${slideDirection === 'forward' ? 'slide-in-from-right' : 'slide-in-from-left'} duration-300`}>
              <div className="mb-2">
                <h2 className="text-base font-bold text-white">Basic Information</h2>
                <p className="text-xs text-slate-300 mt-0.5">
                  Enter your official name and contact information.
                </p>
              </div>

              <div className="field">
                <label className="text-xs font-bold text-slate-300 block mb-1.5">
                  {mode === 'parent' ? 'Parent / Guardian Full Name' : mode === 'student' ? 'Student Full Name' : 'Instructor Full Name'}
                </label>
                <div className="input-wrap relative flex items-center">
                  <span className="input-icon absolute left-3 text-slate-400"><User size={15} /></span>
                  <input 
                    type="text" 
                    required 
                    value={fullName} 
                    onChange={e => setFullName(e.target.value)} 
                    placeholder="e.g. Adebayo Ogunlesi" 
                    className="w-full bg-white/10 border border-white/20 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-brand-red"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="field">
                  <label className="text-xs font-bold text-slate-300 block mb-1.5">Email Address</label>
                  <div className="input-wrap relative flex items-center">
                    <span className="input-icon absolute left-3 text-slate-400"><Mail size={15} /></span>
                    <input 
                      type="email" 
                      required 
                      value={email} 
                      onChange={e => setEmail(e.target.value)} 
                      placeholder="you@example.com" 
                      className="w-full bg-white/10 border border-white/20 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-brand-red"
                    />
                  </div>
                </div>

                <div className="field">
                  <label className="text-xs font-bold text-slate-300 block mb-1.5">Phone Number</label>
                  <div className="input-wrap relative flex items-center">
                    <span className="input-icon absolute left-3 text-slate-400"><Phone size={15} /></span>
                    <input 
                      type="tel" 
                      required 
                      value={phone} 
                      onChange={e => setPhone(e.target.value)} 
                      placeholder="+234 800 000 0000" 
                      className="w-full bg-white/10 border border-white/20 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-brand-red"
                    />
                  </div>
                </div>
              </div>

              {mode === 'student' && (
                <div className="field">
                  <label className="text-xs font-bold text-slate-300 block mb-1.5">
                    Date of Birth
                  </label>
                  <div className="input-wrap relative flex items-center">
                    <span className="input-icon absolute left-3 text-slate-400"><Calendar size={15} /></span>
                    <input 
                      type="date" 
                      required 
                      value={dateOfBirth} 
                      max={new Date().toISOString().split('T')[0]}
                      onChange={e => setDateOfBirth(e.target.value)} 
                      className="w-full bg-white/10 border border-white/20 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-brand-red dark:[color-scheme:dark]"
                    />
                  </div>
                </div>
              )}

              {mode === 'tutor' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="field">
                    <label className="text-xs font-bold text-slate-300 block mb-1.5">City / Location</label>
                    <div className="input-wrap relative flex items-center">
                      <span className="input-icon absolute left-3 text-slate-400"><MapPin size={15} /></span>
                      <input 
                        type="text" 
                        value={location} 
                        onChange={e => setLocation(e.target.value)} 
                        placeholder="e.g. Lagos, Abuja, or Remote" 
                        className="w-full bg-white/10 border border-white/20 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-brand-red"
                      />
                    </div>
                  </div>

                  <div className="field">
                    <label className="text-xs font-bold text-slate-300 block mb-1.5">Teaching Experience</label>
                    <div className="input-wrap relative flex items-center">
                      <span className="input-icon absolute left-3 text-slate-400"><Clock size={15} /></span>
                      <select 
                        value={experienceYears} 
                        onChange={e => setExperienceYears(e.target.value)}
                        className="w-full bg-slate-900 border border-white/20 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand-red"
                      >
                        <option value="Less than 1 Year">Less than 1 Year</option>
                        <option value="1–3 Years">1–3 Years</option>
                        <option value="3–5 Years">3–5 Years</option>
                        <option value="5+ Years">5+ Years Senior Instructor</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Continue Button */}
              <div className="pt-3">
                <button
                  type="button"
                  onClick={handleNext}
                  className="w-full inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-red text-white text-xs font-black uppercase tracking-wider hover:bg-red-700 shadow-md transition-all"
                >
                  Continue to Step 03 <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: DETAILS (ROLE-SPECIFIC CUSTOMIZATION) */}
          {currentStep.key === 'details' && (
            <div className={`space-y-4 animate-in fade-in ${slideDirection === 'forward' ? 'slide-in-from-right' : 'slide-in-from-left'} duration-300`}>
              {/* PARENT DETAILS */}
              {mode === 'parent' && (
                <>
                  <div className="mb-2">
                    <h2 className="text-base font-bold text-white">Cadet &amp; Curriculum Scope</h2>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Tell us about the learners you are enrolling and preferred subjects.
                    </p>
                  </div>

                  <div className="field">
                    <label className="text-xs font-bold text-slate-300 block mb-1.5">Number of Cadets to Enroll</label>
                    <div className="grid grid-cols-4 gap-2">
                      {['1 Child', '2 Children', '3 Children', '4+ Children'].map(c => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setChildrenCount(c)}
                          className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                            childrenCount === c 
                              ? 'bg-brand-red text-white border-brand-red' 
                              : 'bg-white/5 border-white/15 text-slate-300 hover:bg-white/10'
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="field">
                    <label className="text-xs font-bold text-slate-300 block mb-1.5">
                      Target Learning Tracks of Interest
                    </label>
                    <div className="subject-grid max-h-48 overflow-y-auto pr-1">
                      {SUBJECTS.map(subj => {
                        const selected = selectedSubjects.includes(subj);
                        return (
                          <button
                            key={subj}
                            type="button"
                            onClick={() => handleSubjectToggle(subj)}
                            className={`subject-chip ${selected ? 'selected' : ''}`}
                          >
                            <span>{subj}</span>
                            {selected && <CheckCircle2 size={13} className="shrink-0 text-emerald-400" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="field">
                    <label className="text-xs font-bold text-slate-300 block mb-1.5">Special Goals or Schedule Notes (Optional)</label>
                    <textarea 
                      rows={2} 
                      value={parentNotes} 
                      onChange={e => setParentNotes(e.target.value)} 
                      placeholder="e.g. My child wants to learn Python and robotics on weekends..." 
                      className="w-full bg-white/10 border border-white/20 rounded-xl p-3 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-brand-red"
                    />
                  </div>
                </>
              )}

              {/* STUDENT DETAILS */}
              {mode === 'student' && (
                <>
                  <div className="mb-2">
                    <h2 className="text-base font-bold text-white">Academic Stage &amp; Learning Goals</h2>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Select your class or educational level and desired coding/technology tracks.
                    </p>
                  </div>

                  <div className="field">
                    <label className="text-xs font-bold text-slate-300 block mb-1.5">
                      Class / Educational Level
                    </label>
                    <div className="input-wrap relative flex items-center">
                      <span className="input-icon absolute left-3 text-slate-400"><BookOpen size={15} /></span>
                      <select 
                        value={studentClass} 
                        onChange={e => setStudentClass(e.target.value)}
                        className="w-full bg-slate-900 border border-white/20 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand-red"
                      >
                        {STUDENT_CLASSES.map(cls => (
                          <option key={cls} value={cls}>{cls}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="field">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-300 block">
                        Select Tracks You Want to Master
                      </label>
                      <span className="text-[10px] font-mono text-slate-400">
                        {selectedSubjects.length} selected
                      </span>
                    </div>
                    <div className="subject-grid max-h-48 overflow-y-auto pr-1">
                      {SUBJECTS.map(subj => {
                        const selected = selectedSubjects.includes(subj);
                        return (
                          <button
                            key={subj}
                            type="button"
                            onClick={() => handleSubjectToggle(subj)}
                            className={`subject-chip ${selected ? 'selected' : ''}`}
                          >
                            <span>{subj}</span>
                            {selected && <CheckCircle2 size={13} className="shrink-0 text-emerald-400" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="field">
                    <label className="text-xs font-bold text-slate-300 block mb-1.5">What is your primary tech goal?</label>
                    <textarea 
                      rows={2} 
                      value={studentGoals} 
                      onChange={e => setStudentGoals(e.target.value)} 
                      placeholder="e.g. Build interactive web applications, master Python, prepare for tech certifications..." 
                      className="w-full bg-white/10 border border-white/20 rounded-xl p-3 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-brand-red"
                    />
                  </div>
                </>
              )}

              {/* TUTOR DETAILS */}
              {mode === 'tutor' && (
                <>
                  <div className="mb-2">
                    <h2 className="text-base font-bold text-white">Teaching Specialization &amp; Availability</h2>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Select the tracks you can teach and your weekly availability.
                    </p>
                  </div>

                  <div className="field">
                    <label className="text-xs font-bold text-slate-300 block mb-1.5">Academic Qualification</label>
                    <div className="input-wrap relative flex items-center">
                      <span className="input-icon absolute left-3 text-slate-400"><Award size={15} /></span>
                      <select 
                        value={qualification} 
                        onChange={e => setQualification(e.target.value)}
                        className="w-full bg-slate-900 border border-white/20 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand-red"
                      >
                        {QUALIFICATIONS.map(q => (
                          <option key={q} value={q}>{q}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="field">
                    <label className="text-xs font-bold text-slate-300 block mb-1.5">
                      Teaching Tracks (Select all that apply)
                    </label>
                    <div className="subject-grid max-h-40 overflow-y-auto pr-1">
                      {SUBJECTS.map(subj => {
                        const selected = selectedSubjects.includes(subj);
                        return (
                          <button
                            key={subj}
                            type="button"
                            onClick={() => handleSubjectToggle(subj)}
                            className={`subject-chip ${selected ? 'selected' : ''}`}
                          >
                            <span>{subj}</span>
                            {selected && <CheckCircle2 size={13} className="shrink-0 text-emerald-400" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="field">
                      <label className="text-xs font-bold text-slate-300 block mb-1.5">Availability</label>
                      <select 
                        value={daysPerWeek} 
                        onChange={e => setDaysPerWeek(e.target.value)}
                        className="w-full bg-slate-900 border border-white/20 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-brand-red"
                      >
                        {DAYS_OPTIONS.map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    </div>

                    <div className="field">
                      <label className="text-xs font-bold text-slate-300 block mb-1.5">Expected Monthly / Hourly Rate</label>
                      <input 
                        type="text" 
                        required 
                        value={expectedSalary} 
                        onChange={e => setExpectedSalary(e.target.value)} 
                        placeholder="e.g. ₦150,000 / month" 
                        className="w-full bg-white/10 border border-white/20 rounded-xl p-2.5 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-brand-red"
                      />
                    </div>
                  </div>

                  <div className="field">
                    <label className="text-xs font-bold text-slate-300 block mb-1.5">CV / Portfolio Link (Optional)</label>
                    <input 
                      type="url" 
                      value={cvUrl} 
                      onChange={e => setCvUrl(e.target.value)} 
                      placeholder="https://linkedin.com/in/... or Google Drive URL" 
                      className="w-full bg-white/10 border border-white/20 rounded-xl p-2.5 text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-brand-red"
                    />
                  </div>
                </>
              )}

              {/* Continue to Step 4 */}
              <div className="pt-3">
                <button
                  type="button"
                  onClick={handleNext}
                  className="w-full inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-red text-white text-xs font-black uppercase tracking-wider hover:bg-red-700 shadow-md transition-all"
                >
                  Continue to Step 04 <ArrowRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: SECURITY & FINAL ACCOUNT CREATION */}
          {currentStep.key === 'security' && (
            <div className={`space-y-4 animate-in fade-in ${slideDirection === 'forward' ? 'slide-in-from-right' : 'slide-in-from-left'} duration-300`}>
              <div className="mb-2">
                <h2 className="text-base font-bold text-white">
                  {mode === 'tutor' ? 'Review & Set Password' : 'Set Portal Password'}
                </h2>
                <p className="text-xs text-slate-300 mt-0.5">
                  Create a strong password for your secure portal access.
                </p>
              </div>

              {/* Account Summary review box */}
              <div className="p-3.5 rounded-2xl bg-white/5 border border-white/10 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-white/10 mb-2 font-mono text-[10px] uppercase text-slate-400">
                  <span>Profile Overview</span>
                  <span className="text-brand-red font-bold">{mode.toUpperCase()}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Name</span>
                    <strong className="text-white">{fullName}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Email</span>
                    <strong className="text-white truncate block">{email}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Phone</span>
                    <strong className="text-white">{phone}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">Selected Tracks</span>
                    <strong className="text-white">{selectedSubjects.length} tracks</strong>
                  </div>
                </div>
              </div>

              {/* Password Fields */}
              <div className="field">
                <label className="text-xs font-bold text-slate-300 block mb-1.5">Create Password</label>
                <div className="input-wrap relative flex items-center">
                  <span className="input-icon absolute left-3 text-slate-400"><Lock size={15} /></span>
                  <input 
                    type={showPassword ? 'text' : 'password'} 
                    required 
                    value={password} 
                    onChange={e => setPassword(e.target.value)} 
                    placeholder="At least 8 characters" 
                    className="w-full bg-white/10 border border-white/20 rounded-xl pl-9 pr-10 py-2.5 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-brand-red"
                  />
                  <button 
                    type="button" 
                    className="absolute right-3 text-slate-400 hover:text-white" 
                    onClick={() => setShowPassword(v => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {password && (
                  <div className="pw-strength-wrap mt-2">
                    <div className="pw-strength-bar bg-white/10 h-1.5 rounded-full overflow-hidden">
                      <div 
                        className="h-full transition-all" 
                        style={{ 
                          width: `${(pwScore / 4) * 100}%`, 
                          backgroundColor: pwColors[Math.max(0, pwScore - 1)] || '#ef4444' 
                        }} 
                      />
                    </div>
                    <span style={{ fontSize: '0.65rem', color: pwColors[Math.max(0, pwScore - 1)] || '#ef4444' }} className="font-mono mt-1 block">
                      Strength: {pwLabels[Math.max(0, pwScore - 1)] || 'Too Weak'}
                    </span>
                  </div>
                )}
              </div>

              <div className="field">
                <label className="text-xs font-bold text-slate-300 block mb-1.5">Confirm Password</label>
                <div className="input-wrap relative flex items-center">
                  <span className="input-icon absolute left-3 text-slate-400"><Lock size={15} /></span>
                  <input 
                    type={showConfirmPassword ? 'text' : 'password'} 
                    required 
                    value={confirmPassword} 
                    onChange={e => setConfirmPassword(e.target.value)} 
                    placeholder="Repeat password" 
                    className="w-full bg-white/10 border border-white/20 rounded-xl pl-9 pr-10 py-2.5 text-sm text-white placeholder:text-slate-400 focus:outline-none focus:border-brand-red"
                  />
                  <button 
                    type="button" 
                    className="absolute right-3 text-slate-400 hover:text-white" 
                    onClick={() => setShowConfirmPassword(v => !v)}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Terms Checkbox */}
              <label className="flex items-start gap-2.5 cursor-pointer pt-1 text-xs text-slate-300 select-none">
                <input
                  type="checkbox"
                  checked={agreeTerms}
                  onChange={e => setAgreeTerms(e.target.checked)}
                  className="mt-0.5 rounded border-white/20 bg-white/10 text-brand-red focus:ring-brand-red"
                />
                <span>
                  I agree to the Jaystarbliss Studios{' '}
                  <Link to="/legal" target="_blank" className="text-white underline hover:text-brand-red">
                    Terms of Service
                  </Link>{' '}
                  and Privacy Policy.
                </span>
              </label>

              {/* Submit Button */}
              <div className="pt-2">
                <CyberLiquidButton 
                  type="button" 
                  onClick={handleSubmit} 
                  loading={loading}
                >
                  {mode === 'parent' ? 'CREATE PARENT ACCOUNT →' : mode === 'student' ? 'CREATE STUDENT ACCOUNT →' : 'SUBMIT INSTRUCTOR APPLICATION →'}
                </CyberLiquidButton>
              </div>
            </div>
          )}

          {/* SIGN IN LINK (HIGH CONTRAST & CLEAR READABILITY) */}
          <div className="mt-6 pt-4 border-t border-white/15 text-center text-xs text-slate-200">
            Already registered?{' '}
            <Link to="/portal" className="font-bold text-white underline hover:text-red-400 transition-colors ml-1">
              Sign In to Portal Hub →
            </Link>
          </div>
        </div>

        {/* FOOTER */}
        <div className="glass-footer flex items-center justify-between px-6 py-4 border-t border-white/10 text-xs text-slate-400">
          <Link to="/" className="back-link inline-flex items-center gap-1.5 text-slate-300 hover:text-white transition-colors">
            <ArrowLeft size={14} /> Main Site
          </Link>
          
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
              Secure 256-bit Portal
            </span>
            <button 
              type="button" 
              className="theme-btn p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all" 
              onClick={toggleTheme} 
              title="Toggle theme"
            >
              {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;
