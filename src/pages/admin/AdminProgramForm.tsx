import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { doc, getDoc, setDoc, collection } from 'firebase/firestore';
import { db, getAllClientDatabases } from '../../lib/firebase';
import {
  ArrowLeft,
  Save,
  Loader2,
  FolderTree,
  ChevronRight,
  Layers,
  BookOpen,
  GitBranch,
  CheckCircle2,
  AlertTriangle,
  Users,
  UserCheck,
  Lock,
} from 'lucide-react';
import PhotoUpload from '../../components/admin/PhotoUpload';
import RichTextEditor from '../../components/admin/RichTextEditor';
import {
  type ProgramRecord,
  type ProgramNodeType,
  type ProgramDeliveryOption,
  fetchAllProgramsMap,
  getAncestors,
  getAllDescendants,
  getDirectChildren,
  getProgramBreadcrumbs,
  executeBranchMove,
  slugifyTitle,
} from '../../lib/programHierarchy';

const AdminProgramForm: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const initialParentId = searchParams.get('parentId') || '';
  const initialNodeType = (searchParams.get('nodeType') as ProgramNodeType) || 'ENROLLABLE';
  const navigate = useNavigate();
  const isEditing = Boolean(id);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [programsMap, setProgramsMap] = useState<Map<string, ProgramRecord>>(new Map());
  const [prereqSearch, setPrereqSearch] = useState('');

  const [formData, setFormData] = useState({
    title: '',
    slug: '',
    categoryId: 'DIGITAL_AND_TECHNOLOGY',
    image: '',
    bannerUrl: '',
    shortDescription: '',
    longDescription: '',
    status: 'PUBLISHED' as 'DRAFT' | 'PUBLISHED' | 'ARCHIVED',
    isFeatured: false,
    pricing: '',
    deliveryFormat: 'ONLINE',
    targetAudience: 'B2C',
    curriculum: [] as string[],
    learningObjectives: [] as string[],
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
    // Phase 2 & 3 Recursive Hierarchy Fields
    parentProgramId: initialParentId || '',
    nodeType: initialNodeType as ProgramNodeType,
    canContainChildren: true,
    isEnrollable: initialNodeType !== 'CONTAINER',
    isRequired: true,
    sortOrder: 1,
    prerequisiteProgramIds: [] as string[],
    progressionRule: 'sequential' as 'sequential' | 'flexible',
    deliveryOptions: ['PUBLIC_GROUP', 'PRIVATE_MENTORSHIP'] as ProgramDeliveryOption[],
    publicGroupAmount: 35000,
    publicGroupBillingCycle: 'Per Term / Cohort',
    privateMentorshipAmount: 60000,
    privateMentorshipBillingCycle: 'Per Month / 1-on-1',
  });

  useEffect(() => {
    let mounted = true;
    const loadData = async () => {
      try {
        const allMap = await fetchAllProgramsMap();
        if (!mounted) return;
        setProgramsMap(allMap);

        if (isEditing && id) {
          const existing = allMap.get(id);
          const docRef = doc(db, 'programs', id);
          const docSnap = await getDoc(docRef);
          const rawData = docSnap.exists() ? docSnap.data() : existing;

          if (rawData) {
            const norm = existing;
            const nodeType: ProgramNodeType =
              norm?.nodeType || (rawData.nodeType as ProgramNodeType) || 'ENROLLABLE';
            const pubPrice =
              rawData.publicGroupPricing?.amount ??
              norm?.publicGroupPricing?.amount ??
              (typeof rawData.price === 'number' ? rawData.price : 35000);
            const privPrice =
              rawData.privateMentorshipPricing?.amount ??
              norm?.privateMentorshipPricing?.amount ??
              Math.round(pubPrice * 1.6);

            setFormData((prev) => ({
              ...prev,
              ...rawData,
              title: rawData.title || '',
              slug: rawData.slug || slugifyTitle(rawData.title || ''),
              categoryId: rawData.categoryId || 'DIGITAL_AND_TECHNOLOGY',
              shortDescription: rawData.shortDescription || rawData.description || '',
              longDescription: rawData.longDescription || rawData.fullDescription || '',
              status: rawData.status || (rawData.isPublished === false ? 'DRAFT' : 'PUBLISHED'),
              sessionsPerWeek: rawData.sessionsPerWeek !== undefined ? rawData.sessionsPerWeek : 2,
              sessionDuration: rawData.sessionDuration || '1 hour',
              seriesName: rawData.seriesName || '',
              stageNumber: rawData.stageNumber || 1,
              nextProgramTitle: rawData.nextProgramTitle || '',
              curriculum: Array.isArray(rawData.curriculum) ? rawData.curriculum : [],
              learningObjectives: Array.isArray(rawData.learningObjectives)
                ? rawData.learningObjectives
                : Array.isArray(rawData.outcomes)
                ? rawData.outcomes
                : [],
              parentProgramId:
                rawData.parentProgramId !== undefined
                  ? rawData.parentProgramId || ''
                  : norm?.parentProgramId || '',
              nodeType,
              canContainChildren:
                typeof rawData.canContainChildren === 'boolean'
                  ? rawData.canContainChildren
                  : true,
              isEnrollable:
                typeof rawData.isEnrollable === 'boolean'
                  ? rawData.isEnrollable
                  : nodeType !== 'CONTAINER',
              isRequired:
                typeof rawData.isRequired === 'boolean' ? rawData.isRequired : true,
              sortOrder:
                typeof rawData.sortOrder === 'number'
                  ? rawData.sortOrder
                  : rawData.order || rawData.stageNumber || 1,
              prerequisiteProgramIds: Array.isArray(rawData.prerequisiteProgramIds)
                ? rawData.prerequisiteProgramIds
                : [],
              progressionRule:
                (rawData.progressionRule as 'sequential' | 'flexible') ||
                norm?.progressionRule ||
                'sequential',
              deliveryOptions: Array.isArray(rawData.deliveryOptions)
                ? rawData.deliveryOptions
                : ['PUBLIC_GROUP', 'PRIVATE_MENTORSHIP'],
              publicGroupAmount: pubPrice,
              publicGroupBillingCycle:
                rawData.publicGroupPricing?.billingCycle || 'Per Term / Cohort',
              privateMentorshipAmount: privPrice,
              privateMentorshipBillingCycle:
                rawData.privateMentorshipPricing?.billingCycle || 'Per Month / 1-on-1',
            }));
          } else {
            setError('Programme not found');
          }
        } else if (initialParentId && allMap.has(initialParentId)) {
          const parentProg = allMap.get(initialParentId)!;
          const siblings = getDirectChildren(parentProg.id, allMap.values());
          setFormData((prev) => ({
            ...prev,
            parentProgramId: parentProg.id,
            categoryId: parentProg.categoryId || prev.categoryId,
            seriesName: parentProg.title,
            sortOrder: siblings.length + 1,
            stageNumber: siblings.length + 1,
          }));
        }
      } catch (err) {
        console.error(err);
        if (mounted) setError('Failed to load programme configuration');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    loadData();
    return () => {
      mounted = false;
    };
  }, [id, isEditing, initialParentId]);

  // Eligible parents: exclude self and all descendants of self to prevent circular loops
  const eligibleParentOptions = useMemo(() => {
    const excludedIds = new Set<string>();
    if (isEditing && id) {
      excludedIds.add(id);
      const descendants = getAllDescendants(id, programsMap.values());
      for (const d of descendants) {
        excludedIds.add(d.id);
      }
    }

    const list: Array<{ program: ProgramRecord; breadcrumbPath: string; depth: number }> = [];
    for (const prog of programsMap.values()) {
      if (excludedIds.has(prog.id)) continue;
      if (prog.isArchived) continue;
      if (!prog.canContainChildren) continue;
      const crumbs = getProgramBreadcrumbs(prog.id, programsMap);
      list.push({
        program: prog,
        breadcrumbPath: crumbs.map((c) => c.title).join(' › '),
        depth: Math.max(0, crumbs.length - 1),
      });
    }

    return list.sort((a, b) => a.breadcrumbPath.localeCompare(b.breadcrumbPath));
  }, [programsMap, isEditing, id]);

  // Live Breadcrumb Preview for current form state
  const liveBreadcrumbPreview = useMemo(() => {
    const titleLabel = formData.title.trim() || 'Untitled Programme';
    if (!formData.parentProgramId) {
      return [titleLabel];
    }
    const parentCrumbs = getProgramBreadcrumbs(formData.parentProgramId, programsMap);
    return [...parentCrumbs.map((c) => c.title), titleLabel];
  }, [formData.parentProgramId, formData.title, programsMap]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    setFormData((prev) => {
      const next: any = {
        ...prev,
        [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
      };
      if (name === 'title' && !isEditing && (!prev.slug || prev.slug === slugifyTitle(prev.title))) {
        next.slug = slugifyTitle(value);
      }
      if (name === 'nodeType') {
        if (value === 'CONTAINER') {
          next.isEnrollable = false;
          next.canContainChildren = true;
        } else if (value === 'HYBRID') {
          next.isEnrollable = true;
          next.canContainChildren = true;
        } else if (value === 'ENROLLABLE') {
          next.isEnrollable = true;
        }
      }
      return next;
    });
  };

  const toggleDeliveryOption = (option: ProgramDeliveryOption) => {
    setFormData((prev) => {
      const exists = prev.deliveryOptions.includes(option);
      const next = exists
        ? prev.deliveryOptions.filter((o) => o !== option)
        : [...prev.deliveryOptions, option];
      return {
        ...prev,
        deliveryOptions: next.length > 0 ? next : ['PUBLIC_GROUP'],
      };
    });
  };

  const togglePrerequisite = (prereqId: string) => {
    setFormData((prev) => {
      const exists = prev.prerequisiteProgramIds.includes(prereqId);
      return {
        ...prev,
        prerequisiteProgramIds: exists
          ? prev.prerequisiteProgramIds.filter((x) => x !== prereqId)
          : [...prev.prerequisiteProgramIds, prereqId],
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const parentId = formData.parentProgramId ? formData.parentProgramId : null;
      let ancestorIds: string[] = [];
      let rootProgramId: string | null = null;

      if (parentId && programsMap.has(parentId)) {
        const parentAncestors = getAncestors(parentId, programsMap);
        ancestorIds = [...parentAncestors.map((a) => a.id), parentId];
        rootProgramId = ancestorIds[0] || parentId;
      }

      const targetId = isEditing && id ? id : doc(collection(db, 'programs')).id;
      if (!parentId) {
        rootProgramId = targetId;
      }

      const isPublished = formData.status === 'PUBLISHED';
      const isArchived = formData.status === 'ARCHIVED';
      const parentProg = parentId ? programsMap.get(parentId) : null;

      const pubAmount = Number(formData.publicGroupAmount) || 0;
      const privAmount = Number(formData.privateMentorshipAmount) || 0;
      const formattedPrice =
        formData.pricing?.trim() ||
        (pubAmount > 0 ? `₦${pubAmount.toLocaleString()}` : 'Contact Us');

      const payload: any = {
        ...formData,
        slug: formData.slug.trim() || slugifyTitle(formData.title),
        shortDescription: formData.shortDescription,
        fullDescription: formData.longDescription,
        description: formData.shortDescription,
        featuredImage: formData.image || formData.bannerUrl || '',
        outcomes: formData.learningObjectives,
        learningObjectives: formData.learningObjectives,
        parentProgramId: parentId,
        rootProgramId,
        ancestorIds,
        sortOrder: Number(formData.sortOrder) || 1,
        order: Number(formData.sortOrder) || 1,
        stageNumber: Number(formData.sortOrder) || Number(formData.stageNumber) || 1,
        seriesName: parentProg ? parentProg.title : formData.seriesName || formData.title,
        programPack: parentProg ? parentProg.title : formData.seriesName || formData.title,
        nodeType: formData.nodeType,
        canContainChildren: Boolean(formData.canContainChildren),
        isEnrollable: formData.nodeType === 'CONTAINER' ? false : Boolean(formData.isEnrollable),
        isRequired: Boolean(formData.isRequired),
        isPublished,
        isArchived,
        isUnassigned: false,
        prerequisiteProgramIds: formData.prerequisiteProgramIds,
        progressionRule: formData.progressionRule,
        deliveryOptions: formData.deliveryOptions,
        pricing: formattedPrice,
        price: pubAmount,
        publicGroupPricing: {
          amount: pubAmount,
          currency: 'NGN',
          billingCycle: formData.publicGroupBillingCycle || 'Per Term / Cohort',
          label: 'Public Group Class',
        },
        privateMentorshipPricing: {
          amount: privAmount,
          currency: 'NGN',
          billingCycle: formData.privateMentorshipBillingCycle || 'Per Month / 1-on-1',
          label: 'Private 1-on-1 Mentorship',
        },
        updatedAt: new Date().toISOString(),
      };

      if (!isEditing) {
        payload.createdAt = new Date().toISOString();
      }

      const dbs = getAllClientDatabases();
      await Promise.all(
        dbs.map((database) =>
          setDoc(doc(database, 'programs', targetId), payload, { merge: true }).catch((err) => {
            if (database === db) throw err;
          })
        )
      );

      // If editing and the parentProgramId changed, also update all descendants' ancestorIds & rootProgramId
      if (isEditing && id) {
        const previousRecord = programsMap.get(id);
        if (previousRecord && previousRecord.parentProgramId !== parentId) {
          const updatedMap = new Map(programsMap);
          updatedMap.set(id, {
            ...previousRecord,
            ...payload,
            id,
          });
          await executeBranchMove(id, parentId, updatedMap);
        }
      }

      navigate('/admin/programs');
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Failed to save programme');
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
    <div className="max-w-5xl mx-auto">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/admin/programs"
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white transition-colors"
        >
          <ArrowLeft size={16} />
          <span>Back to Programme Hierarchy Manager</span>
        </Link>
        <span className="text-xs font-mono text-slate-500">
          {isEditing ? `Programme ID: ${id} (Preserved)` : 'Create Programme / Nested Sub-Programme'}
        </span>
      </div>

      {/* Live Hierarchy Breadcrumb Banner */}
      <div className="mb-6 p-4 rounded-2xl bg-slate-900 text-white border border-slate-800 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            <FolderTree size={14} className="text-brand-red" />
            <span>Hierarchy Placement Preview (Depth Level {liveBreadcrumbPreview.length - 1})</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-sm font-bold">
            {liveBreadcrumbPreview.map((crumb, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <ChevronRight size={14} className="text-slate-500 shrink-0" />}
                <span
                  className={
                    idx === liveBreadcrumbPreview.length - 1
                      ? 'px-2.5 py-0.5 rounded-md bg-brand-red text-white'
                      : 'text-slate-300'
                  }
                >
                  {crumb}
                </span>
              </React.Fragment>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-lg bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200">
            {formData.nodeType === 'CONTAINER'
              ? 'Structural Container (Folder)'
              : formData.nodeType === 'HYBRID'
              ? 'Hybrid (Enrollable + Has Sub-Programmes)'
              : 'Enrollable Programme'}
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl flex items-center gap-2 text-sm font-medium">
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-slate-900 dark:border-slate-800 rounded-2xl shadow-sm border border-gray-200 overflow-hidden"
      >
        <div className="p-6 md:p-8 space-y-8">
          {/* SECTION 1: HIERARCHY PLACEMENT & STRUCTURAL BEHAVIOUR */}
          <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <GitBranch size={16} className="text-brand-red" />
                  <span>1. Recursive Hierarchy Placement &amp; Node Behaviour</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Place this programme at the root level or nested beneath any existing programme or sub-programme at any depth.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Parent Programme (Folder / Branch Location)
                </label>
                <select
                  name="parentProgramId"
                  value={formData.parentProgramId}
                  onChange={handleChange}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-red bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-white text-sm font-medium"
                >
                  <option value="">— Top-Level Root Programme (No Parent) —</option>
                  {eligibleParentOptions.map((opt) => (
                    <option key={opt.program.id} value={opt.program.id}>
                      {'\u00A0\u00A0'.repeat(Math.min(opt.depth, 6))}
                      {opt.depth > 0 ? '↳ ' : '📁 '}
                      {opt.breadcrumbPath} ({opt.program.nodeType})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500">
                  Self and descendant programmes are automatically excluded to prevent circular hierarchy loops.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Sibling Sort Order
                </label>
                <input
                  type="number"
                  name="sortOrder"
                  min={1}
                  value={formData.sortOrder}
                  onChange={handleChange}
                  className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-red dark:bg-slate-900 dark:border-slate-700 dark:text-white text-sm"
                />
                <p className="text-[11px] text-slate-500">
                  Controls sequence order among sibling programmes under the same parent.
                </p>
              </div>
            </div>

            {/* 3 Node Types */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
              <button
                type="button"
                onClick={() =>
                  setFormData((prev) => ({
                    ...prev,
                    nodeType: 'CONTAINER',
                    isEnrollable: false,
                    canContainChildren: true,
                  }))
                }
                className={`p-4 rounded-xl border text-left transition-all ${
                  formData.nodeType === 'CONTAINER'
                    ? 'border-amber-500 bg-amber-50/70 dark:bg-amber-950/30 ring-2 ring-amber-500/20'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-black uppercase tracking-wider text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                    <Layers size={15} /> Structural Container
                  </span>
                  {formData.nodeType === 'CONTAINER' && (
                    <CheckCircle2 size={16} className="text-amber-600" />
                  )}
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                  Acts purely as a category/folder (e.g. Coding, Design). Organises child programmes; never counted as a standalone learning unit in progress denominators.
                </p>
              </button>

              <button
                type="button"
                onClick={() =>
                  setFormData((prev) => ({
                    ...prev,
                    nodeType: 'ENROLLABLE',
                    isEnrollable: true,
                  }))
                }
                className={`p-4 rounded-xl border text-left transition-all ${
                  formData.nodeType === 'ENROLLABLE'
                    ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/30 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-black uppercase tracking-wider text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5">
                    <BookOpen size={15} /> Enrollable Programme
                  </span>
                  {formData.nodeType === 'ENROLLABLE' && (
                    <CheckCircle2 size={16} className="text-emerald-600" />
                  )}
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                  A concrete learning unit (e.g. HTML, CSS, JavaScript, CorelDraw) with curriculum, assessments, and direct progress tracking.
                </p>
              </button>

              <button
                type="button"
                onClick={() =>
                  setFormData((prev) => ({
                    ...prev,
                    nodeType: 'HYBRID',
                    isEnrollable: true,
                    canContainChildren: true,
                  }))
                }
                className={`p-4 rounded-xl border text-left transition-all ${
                  formData.nodeType === 'HYBRID'
                    ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/30 ring-2 ring-indigo-500/20'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-black uppercase tracking-wider text-indigo-900 dark:text-indigo-300 flex items-center gap-1.5">
                    <FolderTree size={15} /> Hybrid Programme
                  </span>
                  {formData.nodeType === 'HYBRID' && (
                    <CheckCircle2 size={16} className="text-indigo-600" />
                  )}
                </div>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                  Both enrollable as a full package (e.g. Web Development) AND contains nested sub-programmes (HTML, CSS, JS) without double-counting progress.
                </p>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              <label className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 cursor-pointer">
                <div>
                  <span className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                    Can Contain Sub-Programmes
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Allow deeper child levels under this node
                  </span>
                </div>
                <input
                  type="checkbox"
                  name="canContainChildren"
                  checked={formData.canContainChildren}
                  onChange={handleChange}
                  className="h-4 w-4 text-brand-red rounded border-gray-300"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 cursor-pointer">
                <div>
                  <span className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                    Directly Enrollable
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Students can be enrolled in this node
                  </span>
                </div>
                <input
                  type="checkbox"
                  name="isEnrollable"
                  disabled={formData.nodeType === 'CONTAINER'}
                  checked={formData.nodeType === 'CONTAINER' ? false : formData.isEnrollable}
                  onChange={handleChange}
                  className="h-4 w-4 text-brand-red rounded border-gray-300 disabled:opacity-40"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 cursor-pointer">
                <div>
                  <span className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                    Required in Parent Branch
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Uncheck if this is an optional elective unit
                  </span>
                </div>
                <input
                  type="checkbox"
                  name="isRequired"
                  checked={formData.isRequired}
                  onChange={handleChange}
                  className="h-4 w-4 text-brand-red rounded border-gray-300"
                />
              </label>
            </div>

            {/* Progression Rule Configuration */}
            <div className="pt-2">
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">
                Progression Rule for Sub-Programmes &amp; Learning Units
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setFormData((prev) => ({ ...prev, progressionRule: 'sequential' }))
                  }
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    formData.progressionRule === 'sequential'
                      ? 'border-blue-600 bg-blue-50/60 dark:bg-blue-950/30 ring-2 ring-blue-500/20'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Lock size={13} className="text-blue-600" /> Sequential Progression
                    </span>
                    {formData.progressionRule === 'sequential' && (
                      <CheckCircle2 size={15} className="text-blue-600" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Units must be completed linearly. Students cannot access next units until prerequisites are completed or recognized.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setFormData((prev) => ({ ...prev, progressionRule: 'flexible' }))
                  }
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    formData.progressionRule === 'flexible'
                      ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/30 ring-2 ring-emerald-500/20'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <GitBranch size={13} className="text-emerald-600" /> Flexible Progression
                    </span>
                    {formData.progressionRule === 'flexible' && (
                      <CheckCircle2 size={15} className="text-emerald-600" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Learners can pick any unit or module under this branch freely in customizable order.
                  </p>
                </button>
              </div>
            </div>
          </div>

          {/* SECTION 2: CORE IDENTITY */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-200">
                Programme / Sub-Programme Title
              </label>
              <input
                type="text"
                name="title"
                required
                value={formData.title}
                onChange={handleChange}
                placeholder="e.g. Web Development, HTML Foundations, Piano Mastery"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-red focus:border-brand-red dark:bg-slate-900 dark:border-slate-700 dark:text-white"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-200">
                Slug (URL Identifier)
              </label>
              <input
                type="text"
                name="slug"
                required
                value={formData.slug}
                onChange={handleChange}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-red focus:border-brand-red dark:bg-slate-900 dark:border-slate-700 dark:text-white font-mono text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Category
              </label>
              <select
                name="categoryId"
                required
                value={formData.categoryId}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-red bg-white dark:bg-slate-900 dark:border-slate-800 dark:text-white"
              >
                <option value="">Select Category...</option>
                <option value="DIGITAL_AND_TECHNOLOGY">Digital &amp; Technology</option>
                <option value="CREATIVE">Creative &amp; Design</option>
                <option value="MUSIC">Music</option>
                <option value="ACADEMICS">Academics</option>
                <option value="EXAM_PREPARATION">Exam Preparation</option>
                <option value="PERSONALIZED_LEARNING">Personalized Learning</option>
                <option value="SCHOOL_PROGRAMS">School Programs &amp; Clubs</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Delivery Format
              </label>
              <select
                name="deliveryFormat"
                value={formData.deliveryFormat}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-red bg-white dark:bg-slate-900 dark:border-slate-800 dark:text-white"
              >
                <option value="ONLINE">Online</option>
                <option value="PHYSICAL">Physical</option>
                <option value="HYBRID">Hybrid</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Target Audience
              </label>
              <select
                name="targetAudience"
                value={formData.targetAudience || 'B2C'}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-red dark:bg-slate-900 dark:border-slate-800 dark:text-white"
              >
                <option value="B2C">Direct to Consumer (B2C)</option>
                <option value="B2B_SCHOOLS">Schools (B2B)</option>
                <option value="CORPORATE">Corporate Training</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Display Pricing Text
              </label>
              <input
                type="text"
                name="pricing"
                value={formData.pricing}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-red dark:bg-slate-900 dark:border-slate-800 dark:text-white"
                placeholder="e.g. ₦35,000 or Contact Us"
              />
            </div>
          </div>

          {/* SECTION 3: PUBLIC GROUP VS PRIVATE 1-ON-1 MENTORSHIP PRICING */}
          <div className="p-5 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 space-y-4">
            <div>
              <h3 className="text-sm font-black text-emerald-950 dark:text-emerald-200 uppercase tracking-wider flex items-center gap-2">
                <Users size={16} />
                <span>2. Delivery Options &amp; Tiered Enrolment Pricing</span>
              </h3>
              <p className="text-xs text-emerald-800 dark:text-emerald-300 mt-0.5">
                Configure independent pricing for Public Group Classes versus Private 1-on-1 Mentorship so student onboarding and parent enrolment calculate exact fees.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {(
                [
                  { key: 'PUBLIC_GROUP', label: 'Public Group Class' },
                  { key: 'PRIVATE_MENTORSHIP', label: 'Private 1-on-1 Mentorship' },
                  { key: 'SCHOOL_COHORT', label: 'Partner School Cohort' },
                  { key: 'SELF_PACED', label: 'Self-Paced Guided' },
                ] as Array<{ key: ProgramDeliveryOption; label: string }>
              ).map((item) => {
                const active = formData.deliveryOptions.includes(item.key);
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => toggleDeliveryOption(item.key)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 ${
                      active
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {active && <CheckCircle2 size={13} />}
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/50 space-y-3">
                <div className="flex items-center gap-2 text-xs font-black text-slate-900 dark:text-white uppercase">
                  <Users size={14} className="text-emerald-600" />
                  <span>Public Group Class Pricing (NGN)</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">
                      Amount (₦)
                    </label>
                    <input
                      type="number"
                      name="publicGroupAmount"
                      min={0}
                      value={formData.publicGroupAmount}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">
                      Billing Cycle
                    </label>
                    <input
                      type="text"
                      name="publicGroupBillingCycle"
                      value={formData.publicGroupBillingCycle}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900/50 space-y-3">
                <div className="flex items-center gap-2 text-xs font-black text-slate-900 dark:text-white uppercase">
                  <UserCheck size={14} className="text-indigo-600" />
                  <span>Private 1-on-1 Mentorship Pricing (NGN)</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">
                      Amount (₦)
                    </label>
                    <input
                      type="number"
                      name="privateMentorshipAmount"
                      min={0}
                      value={formData.privateMentorshipAmount}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 mb-1">
                      Billing Cycle
                    </label>
                    <input
                      type="text"
                      name="privateMentorshipBillingCycle"
                      value={formData.privateMentorshipBillingCycle}
                      onChange={handleChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 4: PREREQUISITES */}
          <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <Lock size={15} className="text-brand-red" />
                  <span>3. Prerequisite Programmes (Optional)</span>
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Select programmes that a student must complete (or have Prior-Learning Recognition approved for) before unlocking this unit.
                </p>
              </div>
              <input
                type="text"
                value={prereqSearch}
                onChange={(e) => setPrereqSearch(e.target.value)}
                placeholder="Filter prerequisites..."
                className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg dark:bg-slate-900 dark:border-slate-700 dark:text-white"
              />
            </div>

            {formData.prerequisiteProgramIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {formData.prerequisiteProgramIds.map((pid) => {
                  const p = programsMap.get(pid);
                  return (
                    <span
                      key={pid}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand-red/10 text-brand-red text-xs font-bold"
                    >
                      <span>{p?.title || pid}</span>
                      <button
                        type="button"
                        onClick={() => togglePrerequisite(pid)}
                        className="hover:text-red-900"
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            <div className="max-h-40 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-1.5 p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              {eligibleParentOptions
                .filter(
                  (opt) =>
                    opt.program.id !== id &&
                    (!prereqSearch.trim() ||
                      opt.breadcrumbPath.toLowerCase().includes(prereqSearch.toLowerCase()))
                )
                .map((opt) => {
                  const checked = formData.prerequisiteProgramIds.includes(opt.program.id);
                  return (
                    <label
                      key={opt.program.id}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                        checked
                          ? 'bg-red-50 dark:bg-red-950/30 text-brand-red font-bold'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePrerequisite(opt.program.id)}
                        className="rounded border-gray-300 text-brand-red"
                      />
                      <span className="truncate">{opt.breadcrumbPath}</span>
                    </label>
                  );
                })}
            </div>
          </div>

          {/* SESSIONS & SCHEDULE CONFIGURATION */}
          <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">
              Delivery Schedule &amp; Session Frequency
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
                  Sessions Per Week
                </label>
                <select
                  name="sessionsPerWeek"
                  value={formData.sessionsPerWeek}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      sessionsPerWeek: Number(e.target.value) || 1,
                    }))
                  }
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
                  placeholder="e.g. 45 minutes, 1 hour, 1 hr 30 mins"
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-red dark:bg-slate-900 dark:border-slate-800 dark:text-white text-sm"
                />
              </div>
            </div>
          </div>

          <PhotoUpload
            label="Programme Cover Photo"
            value={formData.image || ''}
            onChange={(url) => setFormData((prev) => ({ ...prev, image: url }))}
            helpText="Upload a high-resolution cover banner for this programme or sub-programme."
          />

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Short Summary
            </label>
            <input
              type="text"
              name="shortDescription"
              value={formData.shortDescription}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-red dark:bg-slate-900 dark:border-slate-800 dark:text-white"
              placeholder="e.g. Master semantic HTML5 document structure, forms, and accessibility."
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Detailed Description
            </label>
            <div className="bg-white rounded-xl overflow-hidden border border-gray-200 dark:border-slate-700">
              <RichTextEditor
                value={formData.longDescription}
                onChange={(value) => setFormData({ ...formData, longDescription: value })}
                placeholder="Write detailed programme description..."
                minHeight="160px"
              />
            </div>
          </div>

          {/* CURRICULUM SYLLABUS & DOCUMENT ATTACHMENT */}
          <div className="p-5 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/60 space-y-4">
            <div>
              <h3 className="text-sm font-black text-indigo-950 dark:text-indigo-200 uppercase tracking-wider">
                Programme Curriculum &amp; Syllabus Document
              </h3>
              <p className="text-xs text-indigo-700 dark:text-indigo-300 mt-0.5">
                Attach an official PDF or Google Drive curriculum syllabus.
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
                  placeholder="e.g. Web Development Core Syllabus"
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">
                Curriculum Modules / Lessons (One item per line)
              </label>
              <textarea
                name="curriculum"
                rows={6}
                value={
                  Array.isArray(formData.curriculum)
                    ? formData.curriculum.join('\n')
                    : ''
                }
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    curriculum: e.target.value
                      .split('\n')
                      .map((line) => line.trim())
                      .filter(Boolean),
                  }))
                }
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-red dark:bg-slate-900 dark:border-slate-800 dark:text-white text-sm"
                placeholder={'Module 1: Introduction & Setup\nModule 2: Core Principles\nModule 3: Capstone Project'}
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">
                Learning Objectives &amp; Outcomes (One item per line)
              </label>
              <textarea
                name="learningObjectives"
                rows={6}
                value={
                  Array.isArray(formData.learningObjectives)
                    ? formData.learningObjectives.join('\n')
                    : ''
                }
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    learningObjectives: e.target.value
                      .split('\n')
                      .map((line) => line.trim())
                      .filter(Boolean),
                  }))
                }
                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-brand-red dark:bg-slate-900 dark:border-slate-800 dark:text-white text-sm"
                placeholder={'Build semantic web layouts\nUnderstand responsive CSS Grid & Flexbox\nDeploy live projects'}
              />
            </div>
          </div>

          {/* Program Features & Access Control */}
          <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">
              Programme Modules &amp; Feature Access Control
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900/60 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-indigo-950 dark:text-indigo-200">
                    Assign EdClub to Programme
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      name="hasEdclub"
                      checked={formData.hasEdclub}
                      onChange={handleChange}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
                  Unlocks Typing Masters Academy &amp; EdClub workspace for students enrolled in this programme.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/60 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-amber-950 dark:text-amber-200">
                    General Partner School Curriculum
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      name="isGeneralProgram"
                      checked={formData.isGeneralProgram}
                      onChange={handleChange}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600"></div>
                  </label>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
                  Marks this programme as available to partner school cohorts.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-gray-900 dark:text-white">
                    Learning Resources &amp; Library
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      name="hasResources"
                      checked={formData.hasResources}
                      onChange={handleChange}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-brand-red"></div>
                  </label>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
                  Enables access to curriculum downloads, study guides, and worksheets.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 shadow-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-gray-900 dark:text-white">
                    Examination &amp; Assessment Center
                  </span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      name="hasAssessments"
                      checked={formData.hasAssessments}
                      onChange={handleChange}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
                  Enables online tests, logic quizzes, and invigilated exams assigned to this unit.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-8 py-4 border-t border-gray-100 dark:border-slate-800">
            <div className="space-y-2 flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Publication Status
              </label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="w-full sm:w-56 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-red bg-white dark:bg-slate-900 dark:border-slate-800 dark:text-white"
              >
                <option value="PUBLISHED">Published (Active)</option>
                <option value="DRAFT">Draft (Unpublished)</option>
                <option value="ARCHIVED">Archived (Historical Only)</option>
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
                <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-red"></div>
                <span className="ml-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                  Featured Programme
                </span>
              </label>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-slate-950 px-6 py-4 flex items-center justify-end gap-3 border-t border-gray-200 dark:border-slate-800">
          <Link
            to="/admin/programs"
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 dark:text-white transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-brand-red text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving Programme...' : 'Save Programme Configuration'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default AdminProgramForm;
