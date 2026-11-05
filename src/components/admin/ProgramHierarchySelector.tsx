import React, { useState, useMemo } from 'react';
import {
  Folder,
  FolderOpen,
  BookOpen,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  Layers,
  GitBranch,
  Search,
  Users,
  UserCheck,
  Award,
  AlertCircle,
} from 'lucide-react';
import {
  type ProgramRecord,
  type ProgramTreeNode,
  type ProgramDeliveryOption,
  buildProgramTree,
  getProgramBreadcrumbs,
} from '../../lib/programHierarchy';
import { resolveEnrolmentScope } from '../../lib/learningPathwayEngine';

export interface ProgramHierarchySelectorProps {
  programsMap: Map<string, ProgramRecord>;
  selectedProgramIds: string[];
  onChangeSelectedProgramIds: (ids: string[]) => void;
  optionalProgramIds?: string[];
  onChangeOptionalProgramIds?: (ids: string[]) => void;
  priorRecognisedProgramIds?: string[];
  onChangePriorRecognisedProgramIds?: (ids: string[]) => void;
  deliveryType?: ProgramDeliveryOption;
  onChangeDeliveryType?: (delivery: ProgramDeliveryOption, suggestedAmount: number) => void;
  allowPriorLearningToggle?: boolean;
  allowOptionalToggle?: boolean;
  compact?: boolean;
  label?: string;
}

export const ProgramHierarchySelector: React.FC<ProgramHierarchySelectorProps> = ({
  programsMap,
  selectedProgramIds,
  onChangeSelectedProgramIds,
  optionalProgramIds = [],
  onChangeOptionalProgramIds,
  priorRecognisedProgramIds = [],
  onChangePriorRecognisedProgramIds,
  deliveryType = 'PUBLIC_GROUP',
  onChangeDeliveryType,
  allowPriorLearningToggle = false,
  allowOptionalToggle = false,
  compact = false,
  label = 'Select Programme Pathway (Root, Branch, or Specific Nested Sub-Programmes)',
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const init = new Set<string>();
    for (const p of programsMap.values()) {
      if (!p.parentProgramId || p.isPrimaryRoot) {
        init.add(p.id);
      }
    }
    return init;
  });

  const treeResult = useMemo(() => {
    return buildProgramTree(Array.from(programsMap.values()).filter((p) => !p.isArchived));
  }, [programsMap]);

  const resolvedScope = useMemo(() => {
    return resolveEnrolmentScope(selectedProgramIds, programsMap, {
      optionalProgramIds,
    });
  }, [selectedProgramIds, optionalProgramIds, programsMap]);

  const selectedSet = useMemo(() => new Set(selectedProgramIds), [selectedProgramIds]);
  const inScopeUnitsSet = useMemo(
    () => new Set(resolvedScope.assignedLearningUnits.map((u) => u.id)),
    [resolvedScope]
  );
  const optionalSet = useMemo(() => new Set(optionalProgramIds), [optionalProgramIds]);
  const priorSet = useMemo(() => new Set(priorRecognisedProgramIds), [priorRecognisedProgramIds]);

  const suggestedTotalAmount = useMemo(() => {
    if (selectedProgramIds.length === 0) return 0;
    let total = 0;
    for (const pid of selectedProgramIds) {
      const prog = programsMap.get(pid);
      if (!prog) continue;
      if (deliveryType === 'PRIVATE_MENTORSHIP') {
        total += prog.privateMentorshipPricing?.amount ?? Math.round((prog.price || 35000) * 1.6);
      } else {
        total += prog.publicGroupPricing?.amount ?? (prog.price || 35000);
      }
    }
    return total;
  }, [selectedProgramIds, deliveryType, programsMap]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectNode = (prog: ProgramRecord) => {
    const next = new Set(selectedProgramIds);
    if (next.has(prog.id)) {
      next.delete(prog.id);
    } else {
      next.add(prog.id);
    }
    const nextArr = Array.from(next);
    onChangeSelectedProgramIds(nextArr);

    if (onChangeDeliveryType) {
      let sum = 0;
      for (const pid of nextArr) {
        const p = programsMap.get(pid);
        if (!p) continue;
        sum +=
          deliveryType === 'PRIVATE_MENTORSHIP'
            ? p.privateMentorshipPricing?.amount ?? Math.round((p.price || 35000) * 1.6)
            : p.publicGroupPricing?.amount ?? (p.price || 35000);
      }
      onChangeDeliveryType(deliveryType, sum);
    }
  };

  const toggleOptionalUnit = (progId: string) => {
    if (!onChangeOptionalProgramIds) return;
    const next = new Set(optionalProgramIds);
    if (next.has(progId)) next.delete(progId);
    else next.add(progId);
    onChangeOptionalProgramIds(Array.from(next));
  };

  const togglePriorLearning = (progId: string) => {
    if (!onChangePriorRecognisedProgramIds) return;
    const next = new Set(priorRecognisedProgramIds);
    if (next.has(progId)) next.delete(progId);
    else next.add(progId);
    onChangePriorRecognisedProgramIds(Array.from(next));
  };

  const filterTree = (nodes: ProgramTreeNode[]): ProgramTreeNode[] => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return nodes;
    const filterRec = (list: ProgramTreeNode[]): ProgramTreeNode[] => {
      const out: ProgramTreeNode[] = [];
      for (const n of list) {
        const children = filterRec(n.children);
        const match =
          n.program.title.toLowerCase().includes(q) ||
          n.breadcrumbPath.toLowerCase().includes(q);
        if (match || children.length > 0) {
          out.push({ ...n, children });
        }
      }
      return out;
    };
    return filterRec(nodes);
  };

  const visibleRoots = useMemo(
    () => filterTree([...treeResult.roots, ...treeResult.unassigned]),
    [treeResult.roots, treeResult.unassigned, searchTerm]
  );

  const renderNode = (node: ProgramTreeNode) => {
    const p = node.program;
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedIds.has(p.id) || Boolean(searchTerm.trim());
    const isDirectlySelected = selectedSet.has(p.id);
    const isInheritedInScope = !isDirectlySelected && inScopeUnitsSet.has(p.id);
    const isPriorRecognised = priorSet.has(p.id);
    const isOptional = !p.isRequired || optionalSet.has(p.id);

    const priceDisplay =
      deliveryType === 'PRIVATE_MENTORSHIP'
        ? p.privateMentorshipPricing?.amount ?? Math.round((p.price || 35000) * 1.6)
        : p.publicGroupPricing?.amount ?? (p.price || 35000);

    return (
      <div key={p.id} className="select-none">
        <div
          className={`flex flex-wrap items-center justify-between gap-2 py-2 px-3 rounded-xl transition-colors ${
            isDirectlySelected
              ? 'bg-red-50/90 dark:bg-red-950/40 border border-red-200 dark:border-red-800/70'
              : isInheritedInScope
              ? 'bg-indigo-50/50 dark:bg-indigo-950/20'
              : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
          }`}
          style={{ marginLeft: `${Math.min(node.depth, 10) * 18}px` }}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggleExpand(p.id)}
                className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500"
              >
                {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              </button>
            ) : (
              <span className="w-4 text-center text-slate-300 text-xs">•</span>
            )}

            <input
              type="checkbox"
              checked={isDirectlySelected || isInheritedInScope}
              onChange={() => toggleSelectNode(p)}
              className="h-4 w-4 rounded border-slate-300 text-brand-red focus:ring-brand-red cursor-pointer"
            />

            <div
              onClick={() => toggleSelectNode(p)}
              className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer"
            >
              {hasChildren || p.nodeType === 'CONTAINER' ? (
                isExpanded ? (
                  <FolderOpen size={15} className="text-brand-red shrink-0" />
                ) : (
                  <Folder size={15} className="text-brand-red shrink-0" />
                )
              ) : (
                <BookOpen size={14} className="text-emerald-600 shrink-0" />
              )}

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {p.title}
                  </span>
                  {p.nodeType === 'CONTAINER' ? (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-amber-100 text-amber-900">
                      Branch Folder
                    </span>
                  ) : p.nodeType === 'HYBRID' ? (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-indigo-100 text-indigo-900">
                      Hybrid Package
                    </span>
                  ) : null}
                  {isInheritedInScope && (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-indigo-100 text-indigo-800">
                      Included via Parent Branch
                    </span>
                  )}
                  {isPriorRecognised && (
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-0.5">
                      <Award size={10} /> Prior-Learning Credit
                    </span>
                  )}
                </div>
                {node.depth > 0 && (
                  <div className="text-[10px] text-slate-400 truncate">
                    {node.breadcrumbPath}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {p.isEnrollable && priceDisplay > 0 && (
              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                ₦{priceDisplay.toLocaleString()}
              </span>
            )}

            {allowOptionalToggle &&
              (isDirectlySelected || isInheritedInScope) &&
              p.nodeType !== 'CONTAINER' && (
                <button
                  type="button"
                  onClick={() => toggleOptionalUnit(p.id)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                    isOptional
                      ? 'bg-slate-200 text-slate-800 border-slate-300'
                      : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100'
                  }`}
                  title="Toggle whether this unit is Required or Optional for this student"
                >
                  {isOptional ? 'Optional' : 'Required'}
                </button>
              )}

            {allowPriorLearningToggle &&
              (isDirectlySelected || isInheritedInScope) &&
              p.nodeType !== 'CONTAINER' && (
                <button
                  type="button"
                  onClick={() => togglePriorLearning(p.id)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                    isPriorRecognised
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                  }`}
                  title="Mark this unit as already completed via Prior-Learning Recognition"
                >
                  {isPriorRecognised ? '✓ Prior Credit' : '+ Prior Credit'}
                </button>
              )}
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="space-y-0.5 mt-0.5">
            {node.children.map((child) => renderNode(child))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="block text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
          {label}
        </label>

        {onChangeDeliveryType && (
          <div className="inline-flex rounded-xl p-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => onChangeDeliveryType('PUBLIC_GROUP', suggestedTotalAmount)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all ${
                deliveryType === 'PUBLIC_GROUP'
                  ? 'bg-white dark:bg-slate-900 text-emerald-700 shadow-2xs'
                  : 'text-slate-500'
              }`}
            >
              <Users size={12} /> Public Group
            </button>
            <button
              type="button"
              onClick={() => onChangeDeliveryType('PRIVATE_MENTORSHIP', suggestedTotalAmount)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all ${
                deliveryType === 'PRIVATE_MENTORSHIP'
                  ? 'bg-white dark:bg-slate-900 text-indigo-700 shadow-2xs'
                  : 'text-slate-500'
              }`}
            >
              <UserCheck size={12} /> Private 1-on-1
            </button>
          </div>
        )}
      </div>

      {/* Selected Breadcrumb Chips */}
      {selectedProgramIds.length === 0 ? (
        <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 text-xs flex items-center gap-2">
          <AlertCircle size={15} className="text-amber-600 shrink-0" />
          <span>
            No programme selected yet. If left unselected, the student will be marked as{' '}
            <strong>Pending Programme Confirmation</strong> (never assigned a generic fallback).
          </span>
        </div>
      ) : (
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 dark:text-slate-300">
            <span>
              Selected Pathway ({selectedProgramIds.length} node(s) →{' '}
              {resolvedScope.requiredLearningUnits.length} required learning unit(s) in scope)
            </span>
            {suggestedTotalAmount > 0 && (
              <span className="text-emerald-700 dark:text-emerald-400">
                Suggested Fee: ₦{suggestedTotalAmount.toLocaleString()}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {selectedProgramIds.map((pid) => {
              const crumbs = getProgramBreadcrumbs(pid, programsMap);
              const pathStr = crumbs.map((c) => c.title).join(' › ');
              return (
                <span
                  key={pid}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[11px] font-semibold"
                >
                  <span>{pathStr || pid}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const p = programsMap.get(pid);
                      if (p) toggleSelectNode(p);
                    }}
                    className="text-slate-300 hover:text-white font-bold"
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Search bar inside tree */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search any root, branch, or nested sub-programme (e.g. HTML, CSS, Piano, CorelDraw)..."
          className="w-full pl-8 pr-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-900 dark:text-white"
        />
      </div>

      {/* Tree container */}
      <div
        className={`${
          compact ? 'max-h-60' : 'max-h-80'
        } overflow-y-auto p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 space-y-0.5`}
      >
        {visibleRoots.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400">
            No programmes match your search.
          </div>
        ) : (
          visibleRoots.map((rootNode) => renderNode(rootNode))
        )}
      </div>
    </div>
  );
};

export default ProgramHierarchySelector;
