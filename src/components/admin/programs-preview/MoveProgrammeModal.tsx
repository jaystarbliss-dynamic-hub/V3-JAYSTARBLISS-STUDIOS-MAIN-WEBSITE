import React, { useState, useMemo, useEffect } from 'react';
import {
  FolderTree,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  X,
  Check,
  Edit3,
  RotateCcw,
  Maximize2,
} from 'lucide-react';
import {
  previewBranchMove,
  getProgramBreadcrumbs,
  getAllDescendants,
  slugifyTitle,
  type ProgramRecord,
  type ProgramNodeType,
} from '../../../lib/programHierarchy';
import {
  CATEGORY_OPTIONS,
  DELIVERY_FORMAT_OPTIONS,
  NODE_TYPE_META,
  getDeliveryFormatLabel,
  formatNaira,
  type PreviewProgramRecord,
} from './types';

// ============================================================================
// 1. MOVE & RESTRUCTURE PROGRAMME MODAL
// ============================================================================
interface MoveProgrammeModalProps {
  program: PreviewProgramRecord | null;
  programs: PreviewProgramRecord[];
  onClose: () => void;
  onConfirmMove: (programId: string, newParentProgramId: string | null) => void;
}

export const MoveProgrammeModal: React.FC<MoveProgrammeModalProps> = ({
  program,
  programs,
  onClose,
  onConfirmMove,
}) => {
  const programsMap = useMemo(() => {
    const map = new Map<string, ProgramRecord>();
    programs.forEach((p) => map.set(p.id, p));
    return map;
  }, [programs]);

  const [destinationParentId, setDestinationParentId] = useState<string>('');

  useEffect(() => {
    if (!program) return;
    setDestinationParentId(program.parentProgramId || 'root-technology-programme');
  }, [program]);

  if (!program) return null;

  const currentParent = program.parentProgramId
    ? programsMap.get(program.parentProgramId) || null
    : null;
  const currentBreadcrumbs = getProgramBreadcrumbs(program.id, programsMap);
  const allDescendants = getAllDescendants(program.id, programsMap.values());

  const candidateTargets = programs
    .filter((p) => !p.isArchived)
    .map((p) => ({
      prog: p,
      path: getProgramBreadcrumbs(p.id, programsMap).path,
      isSelf: p.id === program.id,
      isDescendant: allDescendants.some((d) => d.id === p.id),
      disallowsChildren: !p.canContainChildren,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

  const movePreview = previewBranchMove(
    program.id,
    destinationParentId || null,
    programsMap
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
        <div className="px-5 py-4 bg-[#141C2E] text-white flex items-center justify-between">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
              Controlled Branch Move &amp; Restructure
            </span>
            <h3 className="text-base font-bold mt-0.5">
              Move &ldquo;{program.title}&rdquo;
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-300 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          {program.isPrimaryRoot ? (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-[#B91C1C] flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Canonical Primary Root Locked at Depth 0</p>
                <p className="mt-0.5 leading-relaxed">
                  <strong>{program.title}</strong> is one of the four canonical root programmes and cannot be nested inside another programme.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <span className="text-[11px] text-slate-500 block">Current Programme</span>
                  <span className="font-bold text-slate-900">{program.title}</span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-500 block">Current Parent</span>
                  <span className="font-bold text-slate-900">
                    {currentParent ? currentParent.title : 'Unassigned / None'}
                  </span>
                </div>
                <div className="sm:col-span-2 pt-2 border-t border-slate-200">
                  <span className="text-[11px] text-slate-500 block">Current Path</span>
                  <span className="font-semibold text-slate-800">
                    {currentBreadcrumbs.path}
                  </span>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-900 mb-1.5">
                  Destination Parent Programme
                </label>
                <select
                  value={destinationParentId}
                  onChange={(e) => setDestinationParentId(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 font-semibold"
                >
                  {candidateTargets.map(
                    ({ prog, path, isSelf, isDescendant, disallowsChildren }) => {
                      let suffix = `[${NODE_TYPE_META[prog.nodeType].badgeLabel}]`;
                      if (isSelf) suffix = '[INVALID: Self]';
                      else if (isDescendant) suffix = '[INVALID: Own Descendant]';
                      else if (disallowsChildren) suffix = '[INVALID: Disallows Children]';

                      return (
                        <option key={prog.id} value={prog.id}>
                          {path} {suffix}
                        </option>
                      );
                    }
                  )}
                </select>
              </div>

              {!movePreview.valid ? (
                <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-[#B91C1C] flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Move Blocked by Hierarchy Safeguard</p>
                    <p className="mt-0.5">{movePreview.error}</p>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 font-bold text-emerald-800">
                      <CheckCircle2 className="w-4 h-4" />
                      Valid Hierarchy Move
                    </span>
                    <span className="text-[11px] font-semibold text-emerald-700">
                      {Math.max(0, movePreview.affectedItems.length - 1)} descendant(s) updated
                    </span>
                  </div>
                  <div className="font-bold text-slate-900">
                    {movePreview.newBreadcrumbPath}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200"
            >
              Cancel
            </button>
            {!program.isPrimaryRoot && (
              <button
                type="button"
                disabled={
                  !movePreview.valid || destinationParentId === program.parentProgramId
                }
                onClick={() => {
                  onConfirmMove(program.id, destinationParentId || null);
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#B91C1C] rounded-xl hover:bg-[#991B1B] disabled:opacity-50"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>Confirm Move</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 2. QUICK RENAME PROGRAMME MODAL
// ============================================================================
interface QuickRenameModalProps {
  program: PreviewProgramRecord | null;
  onClose: () => void;
  onConfirmRename: (programId: string, newTitle: string, newSlug: string) => void;
}

export const QuickRenameModal: React.FC<QuickRenameModalProps> = ({
  program,
  onClose,
  onConfirmRename,
}) => {
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');

  useEffect(() => {
    if (!program) return;
    setTitle(program.title);
    setSlug(program.slug);
  }, [program]);

  if (!program) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Edit3 className="w-4 h-4 text-[#B91C1C]" />
            <h3 className="text-sm font-extrabold text-slate-900">Rename Programme</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-800 mb-1">
              Programme Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setSlug(slugifyTitle(e.target.value));
              }}
              className="w-full px-3.5 py-2 text-xs bg-white border border-slate-300 rounded-xl text-slate-900 font-semibold"
              autoFocus
            />
          </div>

          <div>
            <label className="block font-bold text-slate-800 mb-1">
              URL Slug
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(slugifyTitle(e.target.value))}
              className="w-full px-3.5 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl text-slate-700"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!title.trim()}
              onClick={() => {
                onConfirmRename(
                  program.id,
                  title.trim(),
                  slug.trim() || slugifyTitle(title)
                );
                onClose();
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#B91C1C] rounded-xl hover:bg-[#991B1B] disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Save Name</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 3. ARCHIVE / RESTORE CONFIRMATION MODAL (Matches Image 3 Bottom-Right!)
// ============================================================================
interface ArchiveConfirmModalProps {
  program: PreviewProgramRecord | null;
  onClose: () => void;
  onConfirmArchiveToggle: (programId: string, reason?: string) => void;
}

export const ArchiveConfirmModal: React.FC<ArchiveConfirmModalProps> = ({
  program,
  onClose,
  onConfirmArchiveToggle,
}) => {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!program) return;
    setReason(program.archiveReason || 'Superseded or retired from active catalogue');
  }, [program]);

  if (!program) return null;

  const isRestoring = program.isArchived;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-sm p-6 sm:p-7 text-center space-y-5">
        {/* Large Centered Warning / Restore Icon (Matches Image 3 Bottom-Right) */}
        <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center">
          {isRestoring ? (
            <RotateCcw className="w-9 h-9 text-emerald-600" />
          ) : (
            <AlertTriangle className="w-10 h-10 text-amber-500 stroke-[2.2]" />
          )}
        </div>

        <div className="space-y-2">
          <h3 className="text-lg font-extrabold text-slate-900">
            {isRestoring ? 'Restore Programme?' : 'Archive Programme?'}
          </h3>
          {program.isPrimaryRoot && !isRestoring ? (
            <p className="text-xs text-[#B91C1C] font-semibold leading-relaxed">
              {program.title} is one of the four primary root programmes and cannot be archived.
            </p>
          ) : isRestoring ? (
            <p className="text-xs text-slate-500 leading-relaxed">
              This will restore <strong className="text-slate-800">{program.title}</strong> to its previous status ({program.previousStatusBeforeArchive || 'Published'}).
            </p>
          ) : (
            <p className="text-xs text-slate-500 leading-relaxed">
              This will hide <strong className="text-slate-800">{program.title}</strong> from new enrolments.
              <br />
              You can restore it later.
            </p>
          )}
        </div>

        {!isRestoring && !program.isPrimaryRoot && (
          <div className="text-left">
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              Archive Reason (Optional)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Outdated content"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-slate-400"
            />
          </div>
        )}

        {/* Two Side-by-Side Action Buttons (Cancel & Archive) */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs sm:text-sm font-bold transition-colors cursor-pointer"
          >
            Cancel
          </button>

          {(!program.isPrimaryRoot || isRestoring) && (
            <button
              type="button"
              onClick={() => {
                onConfirmArchiveToggle(program.id, reason.trim());
                onClose();
              }}
              className={`w-full py-2.5 px-4 rounded-xl text-white text-xs sm:text-sm font-bold shadow-xs transition-colors cursor-pointer ${
                isRestoring
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-[#B91C1C] hover:bg-[#991B1B]'
              }`}
            >
              {isRestoring ? 'Restore' : 'Archive'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 4. CREATE NEW PROGRAMME 5-STEP MODAL (Matches Image 3 Bottom-Left!)
// ============================================================================
interface CreateProgrammeModalProps {
  isOpen: boolean;
  initialParentId: string | null;
  programsMap: Map<string, PreviewProgramRecord>;
  onClose: () => void;
  onExpandToFullEditor: (parentId: string | null) => void;
  onSaveProgramme: (
    draftRecord: Partial<PreviewProgramRecord>,
    targetStatus: 'PUBLISHED' | 'DRAFT'
  ) => void;
}

const MODAL_STEPS = [
  { id: 1, label: 'Basic Information' },
  { id: 2, label: 'Structure & Settings' },
  { id: 3, label: 'Curriculum' },
  { id: 4, label: 'Delivery & Pricing' },
  { id: 5, label: 'Features & Access' },
] as const;

export const CreateProgrammeModal: React.FC<CreateProgrammeModalProps> = ({
  isOpen,
  initialParentId,
  programsMap,
  onClose,
  onExpandToFullEditor,
  onSaveProgramme,
}) => {
  const [step, setStep] = useState<number>(1);
  const [title, setTitle] = useState('Robotics Fundamentals');
  const [categoryId, setCategoryId] = useState('DIGITAL_AND_TECHNOLOGY');
  const [parentProgramId, setParentProgramId] = useState(
    initialParentId || 'prog-smart-techies'
  );
  const [shortDescription, setShortDescription] = useState(
    'Hands-on robotics, sensors, and embedded programming for young innovators.'
  );
  const [nodeType, setNodeType] = useState<ProgramNodeType>('ENROLLABLE');
  const [deliveryFormat, setDeliveryFormat] = useState<'ONLINE' | 'PHYSICAL' | 'HYBRID'>(
    'HYBRID'
  );
  const [duration, setDuration] = useState('8 weeks');
  const [priceAmount, setPriceAmount] = useState<number>(35000);
  const [modulesText, setModulesText] = useState(
    'Introduction to Robotics & Sensors\nMicrocontroller Logic & Actuators\nAutonomous Robot Build'
  );
  const [hasAssessments, setHasAssessments] = useState(true);
  const [hasResources, setHasResources] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setParentProgramId(initialParentId || 'prog-smart-techies');
    }
  }, [isOpen, initialParentId]);

  const eligibleParents = useMemo(() => {
    const list: Array<{ id: string; title: string }> = [];
    for (const p of programsMap.values()) {
      if (!p.isArchived && p.canContainChildren) {
        list.push({ id: p.id, title: p.title });
      }
    }
    return list;
  }, [programsMap]);

  if (!isOpen) return null;

  const handleComplete = () => {
    if (!title.trim()) {
      setStep(1);
      return;
    }
    onSaveProgramme(
      {
        title: title.trim(),
        slug: slugifyTitle(title.trim()),
        categoryId,
        parentProgramId: parentProgramId || null,
        shortDescription: shortDescription.trim(),
        fullDescription: shortDescription.trim(),
        nodeType,
        canContainChildren: nodeType !== 'ENROLLABLE',
        isEnrollable: nodeType !== 'CONTAINER',
        deliveryFormat,
        deliveryMode: getDeliveryFormatLabel(deliveryFormat),
        duration,
        price: priceAmount,
        pricing: formatNaira(priceAmount),
        publicGroupPricing: {
          amount: priceAmount,
          currency: 'NGN',
          billingCycle: 'Per Term',
          label: 'Public Group',
        },
        curriculum: modulesText
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
        hasAssessments,
        hasResources,
      },
      'PUBLISHED'
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden">
        {/* Top Modal Header (Matches Image 3 Bottom-Left) */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
            Create New Programme
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onExpandToFullEditor(parentProgramId || null);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-500 hover:text-slate-900 hover:bg-slate-100"
              title="Open in full-page workspace editor"
            >
              <Maximize2 size={12} />
              <span>Full Editor</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* 2-Column Stepper + Form Body (Matches Image 3 Bottom-Left!) */}
        <div className="grid grid-cols-1 sm:grid-cols-12 min-h-[320px]">
          {/* Left Vertical Step Rail (5 cols) */}
          <div className="sm:col-span-5 bg-slate-50/70 border-b sm:border-b-0 sm:border-r border-slate-100 p-5 space-y-3">
            {MODAL_STEPS.map((s) => {
              const active = step === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStep(s.id)}
                  className="w-full flex items-center gap-3 text-left py-1.5 cursor-pointer group"
                >
                  <span
                    className={`w-6 h-6 rounded-full text-xs font-extrabold flex items-center justify-center shrink-0 tabular-nums transition-colors ${
                      active
                        ? 'bg-[#B91C1C] text-white shadow-2xs'
                        : 'bg-slate-200/80 text-slate-700 group-hover:bg-slate-300'
                    }`}
                  >
                    {s.id}
                  </span>
                  <span
                    className={`text-xs sm:text-[13px] transition-colors ${
                      active
                        ? 'font-extrabold text-[#B91C1C]'
                        : 'font-semibold text-slate-700 group-hover:text-slate-950'
                    }`}
                  >
                    {s.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Right Form Fields (7 cols) */}
          <div className="sm:col-span-7 p-6 space-y-4 text-xs">
            {step === 1 && (
              <>
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">
                    Programme Title <span className="text-[#B91C1C]">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Robotics Fundamentals"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:border-slate-400"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">
                    Category
                  </label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:border-slate-400"
                  >
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.shortLabel}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">
                    Parent Programme
                  </label>
                  <select
                    value={parentProgramId}
                    onChange={(e) => setParentProgramId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:border-slate-400"
                  >
                    {eligibleParents.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">
                    Node Type
                  </label>
                  <select
                    value={nodeType}
                    onChange={(e) => setNodeType(e.target.value as ProgramNodeType)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-900"
                  >
                    <option value="ENROLLABLE">Enrollable Unit</option>
                    <option value="HYBRID">Hybrid Programme</option>
                    <option value="CONTAINER">Container Folder</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">
                    Short Description
                  </label>
                  <textarea
                    rows={3}
                    value={shortDescription}
                    onChange={(e) => setShortDescription(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-200 text-xs text-slate-900"
                  />
                </div>
              </>
            )}

            {step === 3 && (
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  Curriculum Modules (One per line)
                </label>
                <textarea
                  rows={5}
                  value={modulesText}
                  onChange={(e) => setModulesText(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-200 text-xs text-slate-900"
                />
              </div>
            )}

            {step === 4 && (
              <>
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">
                    Delivery Format
                  </label>
                  <select
                    value={deliveryFormat}
                    onChange={(e) => setDeliveryFormat(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-900"
                  >
                    {DELIVERY_FORMAT_OPTIONS.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1.5">
                      Duration
                    </label>
                    <input
                      type="text"
                      value={duration}
                      onChange={(e) => setDuration(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1.5">
                      Tuition Fee (₦)
                    </label>
                    <input
                      type="number"
                      value={priceAmount}
                      onChange={(e) => setPriceAmount(Number(e.target.value) || 0)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono font-bold"
                    />
                  </div>
                </div>
              </>
            )}

            {step === 5 && (
              <div className="space-y-3 pt-1">
                <label className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 cursor-pointer">
                  <span className="font-bold text-slate-800">
                    Enable CBT Assessments &amp; Grading
                  </span>
                  <input
                    type="checkbox"
                    checked={hasAssessments}
                    onChange={(e) => setHasAssessments(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-[#B91C1C]"
                  />
                </label>
                <label className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 cursor-pointer">
                  <span className="font-bold text-slate-800">
                    Enable Learning Resources
                  </span>
                  <input
                    type="checkbox"
                    checked={hasResources}
                    onChange={(e) => setHasResources(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-[#B91C1C]"
                  />
                </label>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Footer (Cancel + Red Next Step -> button matching Image 3 Bottom-Left!) */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/40 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            Cancel
          </button>

          {step < 5 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer"
            >
              <span>Next Step</span>
              <ArrowRight size={13} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleComplete}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer"
            >
              <Check size={14} />
              <span>Create Programme</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
