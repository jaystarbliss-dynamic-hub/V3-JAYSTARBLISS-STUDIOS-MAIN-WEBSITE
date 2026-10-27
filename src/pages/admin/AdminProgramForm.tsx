import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, addDoc, updateDoc, collection } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import PhotoUpload from '../../components/admin/PhotoUpload';
import RichTextEditor from '../../components/admin/RichTextEditor';

const AdminProgramForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditing = Boolean(id);

  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    categoryId: '',
    image: '',
    bannerUrl: '',
    shortDescription: '',
    longDescription: '',
    status: 'DRAFT',
    isFeatured: false,
    pricing: '',
    deliveryFormat: 'ONLINE',
    targetAudience: '',
    curriculum: [] as string[],
    hasEdclub: false,
    hasResources: true,
    hasAssessments: true,
    hasLiveClasses: true,
    isGeneralProgram: false,
    sessionsPerWeek: 2,
    sessionDuration: '1 hour',
    seriesName: '',
    stageNumber: 1,
    nextProgramTitle: '',
    curriculumPdfUrl: '',
    curriculumTitle: '',
    curriculumSummary: '',
  });

  useEffect(() => {
    if (isEditing && id) {
      const fetchProgram = async () => {
        try {
          const docRef = doc(db, 'programs', id);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            setFormData(prev => ({
              ...prev,
              ...data,
              sessionsPerWeek: data.sessionsPerWeek !== undefined ? data.sessionsPerWeek : 2,
              sessionDuration: data.sessionDuration || '1 hour',
              seriesName: data.seriesName || '',
              stageNumber: data.stageNumber || 1,
              nextProgramTitle: data.nextProgramTitle || '',
            }));
          } else {
            setError('Program not found');
          }
        } catch {
          setError('Failed to fetch program');
        } finally {
          setLoading(false);
        }
      };
      fetchProgram();
    }
  }, [id, isEditing]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const payload: any = {
        ...formData,
        updatedAt: new Date().toISOString(),
      };

      if (isEditing && id) {
        const docRef = doc(db, 'programs', id);
        await updateDoc(docRef, payload);
      } else {
        payload.createdAt = new Date().toISOString();
        await addDoc(collection(db, 'programs'), payload);
      }
      navigate('/admin/programs');
    } catch (err) {
      console.error(err);
      setError('Failed to save program');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-brand-red h-8 w-8" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link to="/admin/programs" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition-colors">
          <ArrowLeft size={16} />
          <span>Back to Programs &amp; Courses</span>
        </Link>
        <span className="text-xs text-slate-500">
          {isEditing ? `Program ID: ${id}` : 'Configure curriculum track, stages & delivery settings'}
        </span>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-600 rounded-lg">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-900 dark:border-slate-800 rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 md:p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Program Title</label>
              <input 
                type="text" 
                name="title" 
                required
                value={formData.title}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-red focus:border-brand-red dark:bg-slate-900 dark:border-slate-800 dark:text-white"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Slug (URL friendly)</label>
              <input 
                type="text" 
                name="slug" 
                required
                value={formData.slug}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-red focus:border-brand-red dark:bg-slate-900 dark:border-slate-800 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Category</label>
              <select
                name="categoryId"
                required
                value={formData.categoryId}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-red focus:border-brand-red bg-white dark:bg-slate-900 dark:border-slate-800 dark:text-white"
              >
                <option value="">Select Category...</option>
                <option value="ACADEMICS">Academics</option>
                <option value="DIGITAL_AND_TECHNOLOGY">Digital & Technology</option>
                <option value="CREATIVE">Creative</option>
                <option value="MUSIC">Music</option>
                <option value="EXAM_PREPARATION">Exam Preparation</option>
                <option value="PERSONALIZED_LEARNING">Personalized Learning</option>
                <option value="SCHOOL_PROGRAMS">School Programs & Clubs</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Format</label>
              <select
                name="deliveryFormat"
                value={formData.deliveryFormat}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-red focus:border-brand-red bg-white dark:bg-slate-900 dark:border-slate-800 dark:text-white"
              >
                <option value="ONLINE">Online</option>
                <option value="PHYSICAL">Physical</option>
                <option value="HYBRID">Hybrid</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Target Audience</label>
              <select 
                name="targetAudience" 
                value={formData.targetAudience || 'B2C'}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-red focus:border-brand-red dark:bg-slate-900 dark:border-slate-800 dark:text-white"
              >
                <option value="B2C">Direct to Consumer (B2C)</option>
                <option value="B2B_SCHOOLS">Schools (B2B)</option>
                <option value="CORPORATE">Corporate Training</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Pricing</label>
              <input 
                type="text" 
                name="pricing" 
                value={formData.pricing}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-red focus:border-brand-red dark:bg-slate-900 dark:border-slate-800 dark:text-white"
                placeholder="e.g. ₦50,000 or Contact Us"
              />
            </div>
          </div>

          {/* SESSIONS & SCHEDULE CONFIGURATION */}
          <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">
              📅 Delivery Schedule &amp; Session Frequency
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Configure how often sessions occur per week and the standard duration of each session for this curriculum track.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
                  Sessions Per Week
                </label>
                <select
                  name="sessionsPerWeek"
                  value={formData.sessionsPerWeek}
                  onChange={e => setFormData(prev => ({ ...prev, sessionsPerWeek: Number(e.target.value) || 1 }))}
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-red dark:bg-slate-900 dark:border-slate-800 dark:text-white text-sm"
                >
                  <option value={1}>1 Session / Week</option>
                  <option value={2}>2 Sessions / Week</option>
                  <option value={3}>3 Sessions / Week</option>
                  <option value={4}>4 Sessions / Week</option>
                  <option value={5}>5 Sessions / Week (Daily Intensive)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
                  Duration of Each Session
                </label>
                <input
                  type="text"
                  name="sessionDuration"
                  value={formData.sessionDuration}
                  onChange={handleChange}
                  placeholder="e.g. 45 minutes, 1 hour, 1 hr 30 mins, 2 hours"
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-red dark:bg-slate-900 dark:border-slate-800 dark:text-white text-sm"
                />
              </div>
            </div>
          </div>

          {/* PROGRAM SERIES & STAGES BRANCHING */}
          <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">
              🚀 Curriculum Series &amp; Stage Branching (Stage 1 → Stage 2 → Stage 3)
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Group related programs into continuous learning tracks or stages. When enrolled, the school and student dashboards will highlight the current milestone and the upcoming next stage in the series.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
                  Series / Track Name
                </label>
                <input
                  type="text"
                  name="seriesName"
                  value={formData.seriesName}
                  onChange={handleChange}
                  placeholder="e.g. Full-Stack Web Engineering Series"
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-red dark:bg-slate-900 dark:border-slate-800 dark:text-white text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
                  Current Stage Number
                </label>
                <select
                  name="stageNumber"
                  value={formData.stageNumber}
                  onChange={e => setFormData(prev => ({ ...prev, stageNumber: Number(e.target.value) || 1 }))}
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-red dark:bg-slate-900 dark:border-slate-800 dark:text-white text-sm"
                >
                  <option value={1}>Stage 1 (Beginner / Foundation)</option>
                  <option value={2}>Stage 2 (Intermediate / Core Concepts)</option>
                  <option value={3}>Stage 3 (Advanced / Specialization)</option>
                  <option value={4}>Stage 4 (Mastery / Capstone)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
                  Next / Upcoming Stage in Series
                </label>
                <input
                  type="text"
                  name="nextProgramTitle"
                  value={formData.nextProgramTitle}
                  onChange={handleChange}
                  placeholder="e.g. Stage 2: React &amp; Cloud Backend"
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-red dark:bg-slate-900 dark:border-slate-800 dark:text-white text-sm"
                />
              </div>
            </div>
          </div>

          <PhotoUpload
            label="Program Cover Photo"
            value={formData.image || ''}
            onChange={(url) => setFormData(prev => ({ ...prev, image: url }))}
            helpText="Upload a high-resolution banner photo for this program track."
          />

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Short Description (Outcome)</label>
            <input 
              type="text" 
              name="shortDescription" 
              value={formData.shortDescription}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-red focus:border-brand-red"
              placeholder="e.g. Master visual communication and branding."
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Long Description</label>
            <div className="bg-white rounded-xl overflow-hidden border border-gray-200 dark:border-slate-700">
              <RichTextEditor
                value={formData.longDescription}
                onChange={(value) => setFormData({ ...formData, longDescription: value })}
                placeholder="Write detailed program description..."
                minHeight="180px"
              />
            </div>
          </div>
          {/* CURRICULUM SYLLABUS & DOCUMENT ATTACHMENT */}
          <div className="p-5 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/60 space-y-4">
            <div>
              <h3 className="text-sm font-black text-indigo-950 dark:text-indigo-200 uppercase tracking-wider">
                📄 Program Curriculum &amp; Syllabus Document
              </h3>
              <p className="text-xs text-indigo-700 dark:text-indigo-300 mt-0.5">
                Attach an official PDF or Google Drive curriculum syllabus. Learners, tutors, and schools can preview or read the complete curriculum in their portal.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
                  Curriculum Document Title
                </label>
                <input
                  type="text"
                  name="curriculumTitle"
                  value={formData.curriculumTitle || ''}
                  onChange={handleChange}
                  placeholder="e.g. Weekend Coding 2026 Core Syllabus"
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-red dark:bg-slate-900 dark:border-slate-800 dark:text-white text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
                  Curriculum PDF / Google Drive Link
                </label>
                <input
                  type="url"
                  name="curriculumPdfUrl"
                  value={formData.curriculumPdfUrl || ''}
                  onChange={handleChange}
                  placeholder="https://drive.google.com/... or https://..."
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-red dark:bg-slate-900 dark:border-slate-800 dark:text-white text-sm font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
                Curriculum Short Overview / Notes
              </label>
              <textarea
                name="curriculumSummary"
                rows={2}
                value={formData.curriculumSummary || ''}
                onChange={handleChange}
                placeholder="Key competencies, term milestones, and project goals covered in this syllabus..."
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-red dark:bg-slate-900 dark:border-slate-800 dark:text-white text-xs resize-none"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Curriculum Topics (One item per line)</label>
            <textarea
              name="curriculum"
              rows={6}
              value={Array.isArray((formData as any).curriculum) ? (formData as any).curriculum.join('\n') : (formData as any).curriculum || ''}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                curriculum: e.target.value.split('\n').map(line => line.trim()).filter(Boolean)
              }))}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-red focus:border-brand-red dark:bg-slate-900 dark:border-slate-800 dark:text-white"
              placeholder="Module 1: Introduction to Programming\nModule 2: Variables & Data Types\nModule 3: Practical Project"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">These topics are displayed in the learner course portal. Leave empty only when the program has no published syllabus yet.</p>
          </div>

          {/* Program Features & Access Control */}
          <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">
              Program Modules & Feature Access Control
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Control which tools, portals, and materials are unlocked for students enrolled in this program. If a feature is disabled, it will be grayed out in their portal.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {/* EdClub Toggle */}
              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900/60 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-indigo-950 dark:text-indigo-200">
                    ⌨️ Assign EdClub to Program
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      name="hasEdclub"
                      checked={formData.hasEdclub}
                      onChange={handleChange}
                      className="sr-only peer" 
                    />
                    <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
                  When enabled, all students under this program can access the Typing Masters Academy & EdClub workspace. If disabled, the EdClub card will be locked.
                </p>
              </div>

              {/* General School Program Toggle */}
              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/60 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-amber-950 dark:text-amber-200">
                    🎓 General School Curriculum
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      name="isGeneralProgram"
                      checked={formData.isGeneralProgram}
                      onChange={handleChange}
                      className="sr-only peer" 
                    />
                    <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600"></div>
                  </label>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
                  If checked, all learners in a partner school offering this program will automatically inherit it by default unless assigned a specialized track.
                </p>
              </div>

              {/* Resources Toggle */}
              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-gray-900 dark:text-white">
                    📚 Learning Resources & Library
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      name="hasResources"
                      checked={formData.hasResources}
                      onChange={handleChange}
                      className="sr-only peer" 
                    />
                    <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-red"></div>
                  </label>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
                  Enables access to curriculum downloads, study guides, and worksheets assigned to this program track.
                </p>
              </div>

              {/* Assessments / Exams Toggle */}
              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-gray-900 dark:text-white">
                    📝 Examination & Assessment Center
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      name="hasAssessments"
                      checked={formData.hasAssessments}
                      onChange={handleChange}
                      className="sr-only peer" 
                    />
                    <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
                  Enables online tests, logic quizzes, and invigilated exams assigned to this program track.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-8 py-4 border-t border-gray-100">
            <div className="space-y-2 flex-1">
              <label className="block text-sm font-medium text-gray-700">Status</label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="w-full sm:w-48 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-red focus:border-brand-red bg-white dark:bg-slate-900 dark:border-slate-800"
              >
                <option value="DRAFT">Draft</option>
                <option value="PUBLISHED">Published</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </div>
            
            <div className="flex items-center h-full pt-6">
              <label className="relative flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  name="isFeatured"
                  checked={formData.isFeatured}
                  onChange={handleChange}
                  className="sr-only peer" 
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-red-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white dark:bg-slate-900 dark:border-slate-800 after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-red"></div>
                <span className="ml-3 text-sm font-medium text-gray-700">Featured Program</span>
              </label>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-slate-950 px-6 py-4 flex items-center justify-end gap-3 border-t border-gray-200">
          <Link 
            to="/admin/programs"
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 dark:text-white transition-colors"
          >
            Cancel
          </Link>
          <button 
            type="submit" 
            disabled={saving}
            className="flex items-center gap-2 bg-brand-red text-white px-6 py-2 rounded-lg text-sm font-bold hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save Program'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AdminProgramForm;
