import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  ArrowUp,
  ArrowDown,
  Layers,
  BookOpen,
  GitBranch,
  UploadCloud,
  Search,
  Plus,
  X,
} from 'lucide-react';
import {
  getAllDescendants,
  getDirectChildren,
  getProgramBreadcrumbs,
  slugifyTitle,
  type ProgramNodeType,
  type ProgramDeliveryOption,
} from '../../../lib/programHierarchy';
import {
  CATEGORY_OPTIONS,
  DELIVERY_FORMAT_OPTIONS,
  TARGET_AUDIENCE_OPTIONS,
  DELIVERY_OPTION_LABELS,
  NODE_TYPE_META,
  getDeliveryFormatLabel,
  formatNaira,
  getProgramCoverImage,
  type PreviewProgramRecord,
} from './types';

interface ProgrammeEditorViewProps {
  editingProgram: PreviewProgramRecord | null;
  initialParentId: string | null;
  programsMap: Map<string, PreviewProgramRecord>;
  onSaveProgramme: (
    draftRecord: Partial<PreviewProgramRecord>,
    targetStatus: 'PUBLISHED' | 'DRAFT',
    existingId?: string
  ) => void;
  onCancel: () => void;
}

type EditorStepId = 1 | 2 | 3 | 4 | 5;

const EDITOR_STEPS: Array<{ id: EditorStepId; title: string }> = [
  { id: 1, title: 'Overview' },
  { id: 2, title: 'Structure' },
  { id: 3, title: 'Curriculum' },
  { id: 4, title: 'Delivery' },
  { id: 5, title: 'Features' },
];

export const ProgrammeEditorView: React.FC<ProgrammeEditorViewProps> = ({
  editingProgram,
  initialParentId,
  programsMap,
  onSaveProgramme,
  onCancel,
}) => {
  const isEditing = Boolean(editingProgram);
  const [activeStep, setActiveStep] = useState<EditorStepId>(1);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Step 1: Overview
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [categoryId, setCategoryId] = useState('DIGITAL_AND_TECHNOLOGY');
  const [shortDescription, setShortDescription] = useState('');
  const [fullDescription, setFullDescription] = useState('');
  const [featuredImage, setFeaturedImage] = useState('');
  const [targetAudience, setTargetAudience] = useState<'B2C' | 'B2B_SCHOOLS' | 'CORPORATE'>('B2C');

  // Step 2: Structure & Hierarchy
  const [parentProgramId, setParentProgramId] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<number>(1);
  const [nodeType, setNodeType] = useState<ProgramNodeType>('ENROLLABLE');
  const [canContainChildren, setCanContainChildren] = useState<boolean>(true);
  const [isEnrollable, setIsEnrollable] = useState<boolean>(true);
  const [isRequired, setIsRequired] = useState<boolean>(true);
  const [progressionRule, setProgressionRule] = useState<'sequential' | 'flexible'>('sequential');
  const [prerequisiteProgramIds, setPrerequisiteProgramIds] = useState<string[]>([]);
  const [prereqSearch, setPrereqSearch] = useState('');

  // Step 3: Curriculum
  const [curriculumTitle, setCurriculumTitle] = useState('');
  const [curriculumPdfUrl, setCurriculumPdfUrl] = useState('');
  const [curriculumSummary, setCurriculumSummary] = useState('');
  const [curriculumModules, setCurriculumModules] = useState<string[]>([]);
  const [newModuleInput, setNewModuleInput] = useState('');
  const [learningObjectives, setLearningObjectives] = useState<string[]>([]);
  const [newObjectiveInput, setNewObjectiveInput] = useState('');

  // Step 4: Delivery & Pricing
  const [deliveryFormat, setDeliveryFormat] = useState<'ONLINE' | 'PHYSICAL' | 'HYBRID'>('ONLINE');
  const [deliveryOptions, setDeliveryOptions] = useState<ProgramDeliveryOption[]>([
    'PUBLIC_GROUP',
    'PRIVATE_MENTORSHIP',
  ]);
  const [duration, setDuration] = useState('8 Weeks');
  const [sessionsPerWeek, setSessionsPerWeek] = useState<number>(2);
  const [sessionDuration, setSessionDuration] = useState('60 mins');
  const [hasLiveClasses, setHasLiveClasses] = useState<boolean>(true);
  const [publicGroupAmount, setPublicGroupAmount] = useState<number>(35000);
  const [publicGroupBillingCycle, setPublicGroupBillingCycle] = useState('Per Term / Cohort');
  const [privateMentorshipAmount, setPrivateMentorshipAmount] = useState<number>(60000);
  const [privateMentorshipBillingCycle, setPrivateMentorshipBillingCycle] = useState(
    'Per Month / 1-on-1'
  );
  const [displayPricingText, setDisplayPricingText] = useState('');

  // Step 5: Features & Access
  const [hasEdclub, setHasEdclub] = useState<boolean>(false);
  const [isGeneralProgram, setIsGeneralProgram] = useState<boolean>(false);
  const [hasResources, setHasResources] = useState<boolean>(true);
  const [hasAssessments, setHasAssessments] = useState<boolean>(true);

  const [validationAttempted, setValidationAttempted] = useState(false);

  useEffect(() => {
    if (editingProgram) {
      setTitle(editingProgram.title);
      setSlug(editingProgram.slug);
      setCategoryId(editingProgram.categoryId || 'DIGITAL_AND_TECHNOLOGY');
      setShortDescription(editingProgram.shortDescription || '');
      setFullDescription(editingProgram.fullDescription || editingProgram.shortDescription || '');
      setFeaturedImage(editingProgram.featuredImage || '');
      setTargetAudience(editingProgram.targetAudience || 'B2C');
      setParentProgramId(editingProgram.parentProgramId || '');
      setSortOrder(editingProgram.sortOrder || 1);
      setNodeType(editingProgram.nodeType || 'ENROLLABLE');
      setCanContainChildren(editingProgram.canContainChildren);
      setIsEnrollable(
        editingProgram.nodeType === 'CONTAINER' ? false : editingProgram.isEnrollable
      );
      setIsRequired(editingProgram.isRequired);
      setProgressionRule(editingProgram.progressionRule || 'sequential');
      setPrerequisiteProgramIds(editingProgram.prerequisiteProgramIds || []);
      setDeliveryFormat(editingProgram.deliveryFormat || 'ONLINE');
      setDeliveryOptions(
        editingProgram.deliveryOptions?.length
          ? editingProgram.deliveryOptions
          : ['PUBLIC_GROUP', 'PRIVATE_MENTORSHIP']
      );
      setDuration(editingProgram.duration || '8 Weeks');
      setSessionsPerWeek(editingProgram.sessionsPerWeek || 2);
      setSessionDuration(editingProgram.sessionDuration || '60 mins');
      setHasLiveClasses(editingProgram.hasLiveClasses !== false);
      setPublicGroupAmount(
        editingProgram.publicGroupPricing?.amount ?? editingProgram.price ?? 35000
      );
      setPublicGroupBillingCycle(
        editingProgram.publicGroupPricing?.billingCycle || 'Per Term / Cohort'
      );
      setPrivateMentorshipAmount(editingProgram.privateMentorshipPricing?.amount ?? 60000);
      setPrivateMentorshipBillingCycle(
        editingProgram.privateMentorshipPricing?.billingCycle || 'Per Month / 1-on-1'
      );
      setDisplayPricingText(editingProgram.pricing || '');
      setCurriculumTitle(editingProgram.curriculumTitle || '');
      setCurriculumPdfUrl(editingProgram.curriculumPdfUrl || '');
      setCurriculumSummary(editingProgram.curriculumSummary || '');
      setCurriculumModules([...(editingProgram.curriculum || [])]);
      setLearningObjectives([...(editingProgram.learningObjectives || [])]);
      setHasEdclub(Boolean(editingProgram.hasEdclub));
      setIsGeneralProgram(Boolean(editingProgram.isGeneralProgram));
      setHasResources(editingProgram.hasResources !== false);
      setHasAssessments(editingProgram.hasAssessments !== false);
    } else {
      const parent = initialParentId ? programsMap.get(initialParentId) : null;
      const siblings = getDirectChildren(initialParentId || null, programsMap.values());
      setTitle('');
      setSlug('');
      setCategoryId(parent?.categoryId || 'DIGITAL_AND_TECHNOLOGY');
      setShortDescription('');
      setFullDescription('');
      setFeaturedImage('');
      setTargetAudience(parent?.targetAudience || 'B2C');
      setParentProgramId(initialParentId || 'root-technology-programme');
      setSortOrder(siblings.length + 1);
      setNodeType('ENROLLABLE');
      setCanContainChildren(true);
      setIsEnrollable(true);
      setIsRequired(true);
      setProgressionRule('sequential');
      setPrerequisiteProgramIds([]);
      setDeliveryFormat(parent?.deliveryFormat || 'ONLINE');
      setDeliveryOptions(['PUBLIC_GROUP', 'PRIVATE_MENTORSHIP']);
      setDuration('8 Weeks');
      setSessionsPerWeek(2);
      setSessionDuration('60 mins');
      setHasLiveClasses(true);
      setPublicGroupAmount(35000);
      setPublicGroupBillingCycle('Per Term / Cohort');
      setPrivateMentorshipAmount(60000);
      setPrivateMentorshipBillingCycle('Per Month / 1-on-1');
      setDisplayPricingText('');
      setCurriculumTitle('');
      setCurriculumPdfUrl('');
      setCurriculumSummary('');
      setCurriculumModules([]);
      setLearningObjectives([]);
      setHasEdclub(false);
      setIsGeneralProgram(false);
      setHasResources(true);
      setHasAssessments(true);
    }
    setActiveStep(1);
    setValidationAttempted(false);
  }, [editingProgram, initialParentId, programsMap]);

  const eligibleParents = useMemo(() => {
    const excluded = new Set<string>();
    if (editingProgram) {
      excluded.add(editingProgram.id);
      const descendants = getAllDescendants(editingProgram.id, programsMap.values());
      descendants.forEach((d) => excluded.add(d.id));
    }

    const list: Array<{ program: PreviewProgramRecord; path: string }> = [];
    for (const prog of programsMap.values()) {
      if (excluded.has(prog.id)) continue;
      if (prog.isArchived) continue;
      if (!prog.canContainChildren) continue;
      const crumbs = getProgramBreadcrumbs(prog.id, programsMap);
      list.push({
        program: prog,
        path: crumbs.titles.join(' › '),
      });
    }
    return list.sort((a, b) => a.path.localeCompare(b.path));
  }, [editingProgram, programsMap]);

  const validationErrors = useMemo(() => {
    const errors: Array<{ step: EditorStepId; message: string }> = [];
    if (!title.trim()) {
      errors.push({ step: 1, message: 'Programme title is required.' });
    }
    if (!slug.trim()) {
      errors.push({ step: 1, message: 'Slug is required.' });
    }
    if (!shortDescription.trim()) {
      errors.push({ step: 1, message: 'Short description is required.' });
    }
    return errors;
  }, [title, slug, shortDescription]);

  const handleImageFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setFeaturedImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleNodeTypeSelect = (nextType: ProgramNodeType) => {
    setNodeType(nextType);
    if (nextType === 'CONTAINER') {
      setIsEnrollable(false);
      setCanContainChildren(true);
    } else if (nextType === 'HYBRID') {
      setIsEnrollable(true);
      setCanContainChildren(true);
    } else {
      setIsEnrollable(true);
    }
  };

  const toggleDeliveryOption = (opt: ProgramDeliveryOption) => {
    setDeliveryOptions((prev) =>
      prev.includes(opt) ? prev.filter((item) => item !== opt) : [...prev, opt]
    );
  };

  const handleCommit = (targetStatus: 'PUBLISHED' | 'DRAFT') => {
    setValidationAttempted(true);
    if (validationErrors.length > 0) {
      setActiveStep(validationErrors[0].step);
      return;
    }

    const effectiveEnrollable = nodeType === 'CONTAINER' ? false : isEnrollable;

    onSaveProgramme(
      {
        title: title.trim(),
        slug: slug.trim() || slugifyTitle(title.trim()),
        categoryId,
        shortDescription: shortDescription.trim(),
        fullDescription: fullDescription.trim() || shortDescription.trim(),
        description: shortDescription.trim(),
        featuredImage: featuredImage.trim(),
        targetAudience,
        parentProgramId: parentProgramId || null,
        sortOrder: Number(sortOrder) || 1,
        nodeType,
        canContainChildren,
        isEnrollable: effectiveEnrollable,
        isRequired,
        progressionRule,
        prerequisiteProgramIds,
        deliveryFormat,
        deliveryMode: getDeliveryFormatLabel(deliveryFormat),
        deliveryOptions,
        duration: duration.trim() || '8 Weeks',
        sessionsPerWeek: Number(sessionsPerWeek) || 2,
        sessionDuration: sessionDuration.trim() || '60 mins',
        hasLiveClasses,
        publicGroupPricing: effectiveEnrollable
          ? {
              amount: Number(publicGroupAmount) || 35000,
              currency: 'NGN',
              billingCycle: publicGroupBillingCycle.trim() || 'Per Term / Cohort',
              label: 'Public Group Class',
            }
          : null,
        privateMentorshipPricing: effectiveEnrollable
          ? {
              amount: Number(privateMentorshipAmount) || 60000,
              currency: 'NGN',
              billingCycle:
                privateMentorshipBillingCycle.trim() || 'Per Month / 1-on-1',
              label: 'Private 1-on-1 Mentorship',
            }
          : null,
        price: effectiveEnrollable ? Number(publicGroupAmount) || 35000 : undefined,
        pricing:
          nodeType === 'CONTAINER'
            ? 'Branch Container'
            : displayPricingText.trim() ||
              formatNaira(Number(publicGroupAmount) || 35000),
        curriculumTitle: curriculumTitle.trim(),
        curriculumPdfUrl: curriculumPdfUrl.trim(),
        curriculumSummary: curriculumSummary.trim(),
        curriculum: curriculumModules,
        learningObjectives,
        outcomes: learningObjectives,
        hasEdclub,
        isGeneralProgram,
        hasResources,
        hasAssessments,
      },
      targetStatus,
      editingProgram?.id
    );
  };

  return (
    <div className="space-y-5">
      {/* Main Card Container (Matches Image 2 Middle-Left Pixel-for-Pixel!) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
        {/* Top Header Bar: Title + Save Draft / Publish Programme buttons */}
        <div className="p-5 sm:px-6 sm:py-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">
              {isEditing ? `Edit Programme: ${editingProgram?.title}` : 'Create New Programme'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Add a new programme to the learning ecosystem
            </p>
          </div>

          <div className="flex items-center flex-wrap gap-2.5">
            <button
              type="button"
              onClick={onCancel}
              className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleCommit('DRAFT')}
              className="px-4 py-2 rounded-xl border border-indigo-200 bg-indigo-50/50 text-xs font-bold text-indigo-900 hover:bg-indigo-100/70 transition-colors cursor-pointer"
            >
              Save Draft
            </button>
            <button
              type="button"
              onClick={() => handleCommit('PUBLISHED')}
              className="px-4 py-2 rounded-xl bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer"
            >
              Publish Programme
            </button>
          </div>
        </div>

        {/* 5-Step Horizontal Stepper Bar (Matches Image 2 Middle-Left: 1 Overview — 2 Structure — 3 Curriculum — 4 Delivery — 5 Features) */}
        <div className="px-6 py-4 bg-slate-50/60 border-b border-slate-200/80 overflow-x-auto no-scrollbar">
          <div className="flex items-center justify-between min-w-[540px] max-w-4xl mx-auto">
            {EDITOR_STEPS.map((step, index) => {
              const isActive = activeStep === step.id;
              const isCompleted = activeStep > step.id;
              return (
                <React.Fragment key={step.id}>
                  <button
                    type="button"
                    onClick={() => setActiveStep(step.id)}
                    className="flex items-center gap-2.5 group cursor-pointer shrink-0"
                  >
                    <span
                      className={`w-7 h-7 rounded-full text-xs font-extrabold flex items-center justify-center transition-all tabular-nums ${
                        isActive
                          ? 'bg-[#B91C1C] text-white shadow-xs'
                          : isCompleted
                          ? 'bg-slate-900 text-white'
                          : 'bg-white border border-slate-300 text-slate-600 group-hover:border-slate-400'
                      }`}
                    >
                      {step.id}
                    </span>
                    <span
                      className={`text-xs sm:text-sm transition-colors ${
                        isActive
                          ? 'font-extrabold text-slate-900'
                          : 'font-semibold text-slate-500 group-hover:text-slate-800'
                      }`}
                    >
                      {step.title}
                    </span>
                  </button>

                  {index < EDITOR_STEPS.length - 1 && (
                    <div className="flex-1 h-px bg-slate-200 mx-4" />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Validation Alert */}
        {validationAttempted && validationErrors.length > 0 && (
          <div className="mx-6 mt-5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-[#B91C1C] flex items-center gap-2.5">
            <AlertTriangle size={15} className="shrink-0" />
            <span className="font-semibold">
              {validationErrors.map((e) => e.message).join(' ')}
            </span>
          </div>
        )}

        {/* Step Content Area */}
        <div className="p-6 sm:p-8">
          {/* STEP 1: PROGRAMME OVERVIEW + COVER IMAGE UPLOAD BOX (Matches Image 2 Middle-Left!) */}
          {activeStep === 1 && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left 7 Columns: Programme Overview Fields */}
              <div className="lg:col-span-7 space-y-5">
                <h3 className="text-base font-extrabold text-slate-900">
                  Programme Overview
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1.5">
                      Programme Title <span className="text-[#B91C1C]">*</span>
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTitle(val);
                        if (!isEditing && (!slug || slug === slugifyTitle(title))) {
                          setSlug(slugifyTitle(val));
                        }
                      }}
                      placeholder="Python Programming"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/40 text-xs sm:text-sm font-semibold text-slate-900 focus:bg-white focus:outline-none focus:border-slate-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1.5">
                      Slug <span className="text-[#B91C1C]">*</span>
                    </label>
                    <input
                      type="text"
                      value={slug}
                      onChange={(e) => setSlug(slugifyTitle(e.target.value))}
                      placeholder="python-programming"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/40 text-xs sm:text-sm font-mono text-slate-800 focus:bg-white focus:outline-none focus:border-slate-400"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1.5">
                      Category <span className="text-[#B91C1C]">*</span>
                    </label>
                    <select
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:border-slate-400"
                    >
                      {CATEGORY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1.5">
                      Target Audience
                    </label>
                    <select
                      value={targetAudience}
                      onChange={(e) => setTargetAudience(e.target.value as any)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:border-slate-400"
                    >
                      {TARGET_AUDIENCE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    Short Description <span className="text-[#B91C1C]">*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={shortDescription}
                    onChange={(e) => setShortDescription(e.target.value)}
                    placeholder="Learn Python programming from basics to advanced concepts."
                    className="w-full p-3.5 rounded-xl border border-slate-200 bg-slate-50/40 text-xs sm:text-sm text-slate-900 focus:bg-white focus:outline-none focus:border-slate-400"
                  />
                </div>
              </div>

              {/* Right 5 Columns: Cover Image Upload Dropzone (Matches Image 2 Middle-Left!) */}
              <div className="lg:col-span-5 space-y-3">
                <h3 className="text-base font-extrabold text-slate-900">
                  Cover Image
                </h3>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageFileSelect}
                  className="hidden"
                />

                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/30 rounded-2xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[210px] relative overflow-hidden"
                >
                  {featuredImage ? (
                    <div className="w-full space-y-2">
                      <img
                        src={featuredImage}
                        alt="Programme cover preview"
                        className="w-full h-36 object-cover rounded-xl border border-slate-200 mx-auto"
                      />
                      <span className="inline-block text-xs font-bold text-indigo-700 hover:underline">
                        Click to change cover image
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="w-12 h-12 rounded-full bg-indigo-100/80 text-indigo-700 flex items-center justify-center mb-3">
                        <UploadCloud size={24} />
                      </div>
                      <div className="text-sm font-extrabold text-indigo-950">
                        Click to upload
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        or drag and drop
                      </div>
                      <div className="text-[11px] text-slate-400 mt-2">
                        Recommended: 1200 x 600px
                      </div>
                    </>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    Or paste Cover Image URL:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={featuredImage}
                      onChange={(e) => setFeaturedImage(e.target.value)}
                      placeholder="https://images.unsplash.com/..."
                      className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-mono text-slate-800"
                    />
                    {featuredImage && (
                      <button
                        type="button"
                        onClick={() => setFeaturedImage('')}
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800"
                        title="Clear image"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: STRUCTURE & HIERARCHY */}
          {activeStep === 2 && (
            <div className="space-y-6 max-w-4xl">
              <h3 className="text-base font-extrabold text-slate-900">
                Structure &amp; Hierarchy Placement
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    Parent Programme
                  </label>
                  <select
                    value={parentProgramId}
                    onChange={(e) => setParentProgramId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm font-semibold text-slate-900"
                  >
                    <option value="">Top-Level Root Programme (No Parent)</option>
                    {eligibleParents.map((opt) => (
                      <option key={opt.program.id} value={opt.program.id}>
                        {opt.path} ({opt.program.nodeType})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    Sort Order
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={sortOrder}
                    onChange={(e) => setSortOrder(Number(e.target.value) || 1)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-mono text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {(['CONTAINER', 'ENROLLABLE', 'HYBRID'] as ProgramNodeType[]).map((t) => {
                  const meta = NODE_TYPE_META[t];
                  const selected = nodeType === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => handleNodeTypeSelect(t)}
                      className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                        selected
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold flex items-center gap-1.5">
                          {t === 'CONTAINER' ? (
                            <Layers size={14} />
                          ) : t === 'HYBRID' ? (
                            <GitBranch size={14} />
                          ) : (
                            <BookOpen size={14} />
                          )}
                          <span>{meta.label}</span>
                        </span>
                        {selected && <CheckCircle2 size={14} />}
                      </div>
                      <p
                        className={`text-[11px] leading-relaxed ${
                          selected ? 'text-slate-300' : 'text-slate-500'
                        }`}
                      >
                        {meta.description}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    Progression Mode
                  </label>
                  <select
                    value={progressionRule}
                    onChange={(e) =>
                      setProgressionRule(e.target.value as 'sequential' | 'flexible')
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-900"
                  >
                    <option value="sequential">Sequential Progression</option>
                    <option value="flexible">Flexible Progression</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    Filter Prerequisites ({prerequisiteProgramIds.length} selected)
                  </label>
                  <div className="relative">
                    <Search
                      size={13}
                      className="text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                    />
                    <input
                      type="text"
                      value={prereqSearch}
                      onChange={(e) => setPrereqSearch(e.target.value)}
                      placeholder="Search prerequisites..."
                      className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: CURRICULUM */}
          {activeStep === 3 && (
            <div className="space-y-5 max-w-4xl">
              <h3 className="text-base font-extrabold text-slate-900">
                Curriculum &amp; Modules
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    Syllabus Title
                  </label>
                  <input
                    type="text"
                    value={curriculumTitle}
                    onChange={(e) => setCurriculumTitle(e.target.value)}
                    placeholder="e.g. Python Core Engineering Syllabus"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    Syllabus PDF Link
                  </label>
                  <input
                    type="url"
                    value={curriculumPdfUrl}
                    onChange={(e) => setCurriculumPdfUrl(e.target.value)}
                    placeholder="https://drive.google.com/..."
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Modules ({curriculumModules.length})
                </label>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={newModuleInput}
                    onChange={(e) => setNewModuleInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newModuleInput.trim()) {
                        e.preventDefault();
                        setCurriculumModules((prev) => [...prev, newModuleInput.trim()]);
                        setNewModuleInput('');
                      }
                    }}
                    placeholder="Add a module (e.g. Module 1: Python Syntax & Variables)..."
                    className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!newModuleInput.trim()) return;
                      setCurriculumModules((prev) => [...prev, newModuleInput.trim()]);
                      setNewModuleInput('');
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#B91C1C] text-white text-xs font-bold"
                  >
                    <Plus size={14} />
                    <span>Add Module</span>
                  </button>
                </div>

                <div className="space-y-2">
                  {curriculumModules.map((mod, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="font-bold text-slate-800">
                        {idx + 1}. {mod}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => {
                            setCurriculumModules((prev) => {
                              const next = [...prev];
                              const tmp = next[idx];
                              next[idx] = next[idx - 1];
                              next[idx - 1] = tmp;
                              return next;
                            });
                          }}
                          className="p-1 text-slate-400 hover:text-slate-800 disabled:opacity-30"
                        >
                          <ArrowUp size={13} />
                        </button>
                        <button
                          type="button"
                          disabled={idx === curriculumModules.length - 1}
                          onClick={() => {
                            setCurriculumModules((prev) => {
                              const next = [...prev];
                              const tmp = next[idx];
                              next[idx] = next[idx + 1];
                              next[idx + 1] = tmp;
                              return next;
                            });
                          }}
                          className="p-1 text-slate-400 hover:text-slate-800 disabled:opacity-30"
                        >
                          <ArrowDown size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setCurriculumModules((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="p-1 text-slate-400 hover:text-[#B91C1C]"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Learning Objectives ({learningObjectives.length})
                </label>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={newObjectiveInput}
                    onChange={(e) => setNewObjectiveInput(e.target.value)}
                    placeholder="Add a learning objective..."
                    className="flex-1 px-3.5 py-2 rounded-xl border border-slate-200 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!newObjectiveInput.trim()) return;
                      setLearningObjectives((prev) => [...prev, newObjectiveInput.trim()]);
                      setNewObjectiveInput('');
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold"
                  >
                    Add Objective
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: DELIVERY & PRICING */}
          {activeStep === 4 && (
            <div className="space-y-6 max-w-4xl">
              <h3 className="text-base font-extrabold text-slate-900">
                Delivery Format &amp; Tuition Pricing
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    Delivery Format
                  </label>
                  <select
                    value={deliveryFormat}
                    onChange={(e) => setDeliveryFormat(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-900"
                  >
                    {DELIVERY_FORMAT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    Duration
                  </label>
                  <input
                    type="text"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    placeholder="12 Weeks"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    Sessions / Week
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={sessionsPerWeek}
                    onChange={(e) => setSessionsPerWeek(Number(e.target.value) || 1)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-mono text-slate-900"
                  />
                </div>
              </div>

              {nodeType !== 'CONTAINER' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <span className="text-xs font-extrabold text-slate-900 block">
                      Public Group Tuition (₦)
                    </span>
                    <input
                      type="number"
                      value={publicGroupAmount}
                      onChange={(e) => setPublicGroupAmount(Number(e.target.value) || 0)}
                      className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-sm font-mono font-bold text-slate-900"
                    />
                    <input
                      type="text"
                      value={publicGroupBillingCycle}
                      onChange={(e) => setPublicGroupBillingCycle(e.target.value)}
                      placeholder="Per Term / Cohort"
                      className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-700"
                    />
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <span className="text-xs font-extrabold text-slate-900 block">
                      Private 1-on-1 Mentorship (₦)
                    </span>
                    <input
                      type="number"
                      value={privateMentorshipAmount}
                      onChange={(e) =>
                        setPrivateMentorshipAmount(Number(e.target.value) || 0)
                      }
                      className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-sm font-mono font-bold text-slate-900"
                    />
                    <input
                      type="text"
                      value={privateMentorshipBillingCycle}
                      onChange={(e) => setPrivateMentorshipBillingCycle(e.target.value)}
                      placeholder="Per Month / 1-on-1"
                      className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-700"
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {(Object.keys(DELIVERY_OPTION_LABELS) as ProgramDeliveryOption[]).map(
                  (opt) => {
                    const active = deliveryOptions.includes(opt);
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => toggleDeliveryOption(opt)}
                        className={`px-3.5 py-2 rounded-xl border text-xs font-bold transition-colors ${
                          active
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-600 border-slate-200'
                        }`}
                      >
                        {DELIVERY_OPTION_LABELS[opt]}
                      </button>
                    );
                  }
                )}
              </div>
            </div>
          )}

          {/* STEP 5: FEATURES & ACCESS */}
          {activeStep === 5 && (
            <div className="space-y-5 max-w-4xl">
              <h3 className="text-base font-extrabold text-slate-900">
                Platform Features &amp; Access
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                {[
                  {
                    label: 'EdClub Keyboarding & Practice Integration',
                    desc: 'Enable EdClub practice portal access for enrolled learners',
                    checked: hasEdclub,
                    onChange: setHasEdclub,
                  },
                  {
                    label: 'Downloadable Learning Resources',
                    desc: 'Enable worksheets, slides, and reference downloads',
                    checked: hasResources,
                    onChange: setHasResources,
                  },
                  {
                    label: 'CBT Assessments & Grading',
                    desc: 'Enable native assessments and progress grading',
                    checked: hasAssessments,
                    onChange: setHasAssessments,
                  },
                  {
                    label: 'Live Virtual Classroom Links',
                    desc: 'Enable scheduled live class links for cohorts',
                    checked: hasLiveClasses,
                    onChange: setHasLiveClasses,
                  },
                ].map((feat, i) => (
                  <label
                    key={i}
                    className="p-4 rounded-xl border border-slate-200 flex items-start justify-between gap-3 cursor-pointer hover:bg-slate-50"
                  >
                    <div>
                      <span className="font-bold text-slate-900 block">
                        {feat.label}
                      </span>
                      <span className="text-[11px] text-slate-500 mt-0.5 block">
                        {feat.desc}
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={feat.checked}
                      onChange={(e) => feat.onChange(e.target.checked)}
                      className="w-4 h-4 mt-0.5 rounded border-slate-300 text-[#B91C1C]"
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Step Navigation Footer */}
        <div className="px-6 py-4 bg-slate-50/70 border-t border-slate-200/80 flex items-center justify-between">
          <button
            type="button"
            disabled={activeStep === 1}
            onClick={() => setActiveStep((s) => Math.max(1, s - 1) as EditorStepId)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
          >
            <ChevronLeft size={14} />
            <span>Previous Step</span>
          </button>

          <div className="flex items-center gap-2.5">
            {activeStep < 5 ? (
              <button
                type="button"
                onClick={() => setActiveStep((s) => Math.min(5, s + 1) as EditorStepId)}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-bold shadow-2xs cursor-pointer"
              >
                <span>Next Step</span>
                <ChevronRight size={14} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleCommit('PUBLISHED')}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-bold shadow-2xs cursor-pointer"
              >
                <CheckCircle2 size={14} />
                <span>Publish Programme</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
