import React, { useState, useMemo } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileCode2,
  Code2,
  Palette,
  Music,
  GraduationCap,
  Plus,
  Edit3,
  Move,
  Tag,
  Archive,
  RotateCcw,
  Eye,
  BookOpen,
  ChevronsDownUp,
  ChevronsUpDown,
  Search,
  CheckCircle2,
  ArrowUp,
  ArrowDown,
  MoreHorizontal,
} from 'lucide-react';
import {
  buildProgramTree,
  getAllDescendants,
  getDirectChildren,
  getProgramBreadcrumbs,
  type ProgramTreeNode,
} from '../../../lib/programHierarchy';
import {
  NODE_TYPE_META,
  getCategoryLabel,
  getDeliveryFormatLabel,
  getProgramCoverImage,
  type PreviewProgramRecord,
} from './types';

interface ProgrammeHierarchyViewProps {
  programs: PreviewProgramRecord[];
  programsMap: Map<string, PreviewProgramRecord>;
  selectedProgramId: string | null;
  onSelectProgram: (programId: string) => void;
  onCreateChild: (parentProgramId: string | null) => void;
  onEditProgram: (program: PreviewProgramRecord) => void;
  onOpenCurriculum: (program: PreviewProgramRecord) => void;
  onMoveProgram: (program: PreviewProgramRecord) => void;
  onRenameProgram: (program: PreviewProgramRecord) => void;
  onReorderSibling: (programId: string, direction: 'UP' | 'DOWN') => void;
  onRequestArchiveToggle: (program: PreviewProgramRecord) => void;
}

type InspectorTabId = 'overview' | 'children' | 'settings' | 'progression';

export const ProgrammeHierarchyView: React.FC<ProgrammeHierarchyViewProps> = ({
  programs,
  programsMap,
  selectedProgramId,
  onSelectProgram,
  onCreateChild,
  onEditProgram,
  onOpenCurriculum,
  onMoveProgram,
  onRenameProgram,
  onReorderSibling,
  onRequestArchiveToggle,
}) => {
  const [treeSearch, setTreeSearch] = useState('');
  const [inspectorTab, setInspectorTab] = useState<InspectorTabId>('overview');

  // Default expanded nodes so the hierarchy immediately shows Technology Programme -> Smart Techies -> Web Development -> HTML/CSS/JS like Image 2 & Image 3
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    () =>
      new Set([
        'root-technology-programme',
        'prog-smart-techies',
        'prog-web-development',
        'root-design-graphics-programme',
      ])
  );

  const activePrograms = useMemo(
    () => programs.filter((p) => !p.isArchived && !p.isUnassigned),
    [programs]
  );

  const treeRoots = useMemo(() => buildProgramTree(activePrograms).roots, [activePrograms]);

  const selectedProgram = useMemo(() => {
    if (selectedProgramId && programsMap.has(selectedProgramId)) {
      return programsMap.get(selectedProgramId)!;
    }
    return (
      programsMap.get('prog-smart-techies') ||
      programsMap.get('prog-web-development') ||
      activePrograms[0] ||
      null
    );
  }, [selectedProgramId, programsMap, activePrograms]);

  const directChildren = useMemo(() => {
    if (!selectedProgram) return [];
    return getDirectChildren(selectedProgram.id, activePrograms);
  }, [selectedProgram, activePrograms]);

  const toggleExpand = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExpandAll = () => {
    const all = new Set<string>();
    activePrograms.forEach((p) => {
      if (getDirectChildren(p.id, activePrograms).length > 0) {
        all.add(p.id);
      }
    });
    setExpandedIds(all);
  };

  const handleCollapseAll = () => {
    setExpandedIds(new Set());
  };

  const getRootIcon = (prog: PreviewProgramRecord) => {
    const cat = (prog.categoryId || '').toUpperCase();
    if (cat.includes('TECH') || cat.includes('DIGITAL')) {
      return <Code2 size={15} className="text-blue-600 shrink-0" />;
    }
    if (cat.includes('CREAT')) {
      return <Palette size={15} className="text-indigo-600 shrink-0" />;
    }
    if (cat.includes('MUSIC')) {
      return <Music size={15} className="text-purple-600 shrink-0" />;
    }
    return <GraduationCap size={15} className="text-slate-700 shrink-0" />;
  };

  // Recursive Tree Node Renderer matching Image 2 Top-Left & Image 3 Top-Right
  const renderTreeNode = (node: ProgramTreeNode, depth = 0): React.ReactNode => {
    const prog = programsMap.get(node.program.id);
    if (!prog) return null;

    const q = treeSearch.trim().toLowerCase();
    const descendants = getAllDescendants(prog.id, activePrograms);
    const matchesSelf = !q || prog.title.toLowerCase().includes(q);
    const matchesDescendant =
      !q || descendants.some((d) => d.title.toLowerCase().includes(q));

    if (q && !matchesSelf && !matchesDescendant) {
      return null;
    }

    const hasChildren = node.children.length > 0;
    const isExpanded = Boolean(q) || expandedIds.has(prog.id);
    const isSelected = selectedProgram?.id === prog.id;
    const countValue = prog.isPrimaryRoot
      ? descendants.length
      : node.children.length;

    return (
      <div key={prog.id} className="select-none">
        <div
          onClick={() => onSelectProgram(prog.id)}
          style={{ paddingLeft: `${depth * 18 + 10}px` }}
          className={`group flex items-center justify-between gap-2 py-2 pr-3 rounded-lg cursor-pointer transition-colors text-xs sm:text-[13px] ${
            isSelected
              ? 'bg-indigo-50/90 text-slate-950 font-bold border-l-[3px] border-indigo-600'
              : 'text-slate-700 hover:bg-slate-100/80 font-medium'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => toggleExpand(prog.id, e)}
                className="p-0.5 rounded hover:bg-slate-200/70 text-slate-500 shrink-0"
                aria-label={isExpanded ? `Collapse ${prog.title}` : `Expand ${prog.title}`}
              >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : (
              <span className="w-4 shrink-0" />
            )}

            {prog.isPrimaryRoot ? (
              <span className="w-5 h-5 rounded-md bg-slate-900/5 flex items-center justify-center shrink-0">
                {getRootIcon(prog)}
              </span>
            ) : hasChildren ? (
              isExpanded ? (
                <FolderOpen size={15} className="text-amber-500 shrink-0 fill-amber-100" />
              ) : (
                <Folder size={15} className="text-amber-500 shrink-0 fill-amber-100" />
              )
            ) : (
              <FileCode2 size={14} className="text-slate-400 shrink-0" />
            )}

            <span className="truncate">{prog.title}</span>

            {countValue > 0 && (
              <span className="text-xs font-semibold text-blue-600 tabular-nums shrink-0">
                ({countValue})
              </span>
            )}
          </div>
        </div>

        {/* Render Nested Children with vertical tree guide line */}
        {hasChildren && isExpanded && (
          <div className="relative ml-4 pl-2 border-l border-slate-200/90 space-y-0.5 my-0.5">
            {node.children.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const parentProgram = selectedProgram?.parentProgramId
    ? programsMap.get(selectedProgram.parentProgramId) || null
    : null;

  const prerequisiteTitles = useMemo(() => {
    if (!selectedProgram?.prerequisiteProgramIds?.length) return 'None';
    return selectedProgram.prerequisiteProgramIds
      .map((id) => programsMap.get(id)?.title || id)
      .join(', ');
  }, [selectedProgram, programsMap]);

  return (
    <div className="space-y-4">
      {/* Sub-header Bar with Expand All / Collapse All / + Add Child (Matches Image 2 Top-Left & Image 3 Top-Right) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-slate-200/90 rounded-2xl px-5 py-3.5 shadow-2xs">
        <div>
          <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
            Programme Hierarchy
          </h2>
          <p className="text-xs text-slate-500">
            Explore and manage the complete learning structure
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <button
            type="button"
            onClick={handleExpandAll}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <ChevronsUpDown size={14} className="text-slate-500" />
            <span>Expand All</span>
          </button>
          <button
            type="button"
            onClick={handleCollapseAll}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <ChevronsDownUp size={14} className="text-slate-500" />
            <span>Collapse All</span>
          </button>
          <button
            type="button"
            onClick={() =>
              onCreateChild(
                selectedProgram?.canContainChildren ? selectedProgram.id : null
              )
            }
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-bold shadow-2xs transition-colors cursor-pointer"
          >
            <Plus size={15} />
            <span>Add Child</span>
          </button>
        </div>
      </div>

      {/* Two-Panel Split Workspace (Matches Image 2 Top-Left & Image 3 Top-Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT PANEL: Programme Roots & Tree (~4.5 cols) */}
        <div className="lg:col-span-5 bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-900">Programme Roots</h3>
            <div className="relative w-44">
              <Search
                size={13}
                className="text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              />
              <input
                type="text"
                value={treeSearch}
                onChange={(e) => setTreeSearch(e.target.value)}
                placeholder="Filter tree..."
                className="w-full pl-7 pr-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-slate-300"
              />
            </div>
          </div>

          <div className="p-3 max-h-[600px] overflow-y-auto space-y-1">
            {treeRoots.map((rootNode) => renderTreeNode(rootNode, 0))}
          </div>
        </div>

        {/* RIGHT PANEL: Selected Programme Inspector + Vertical Action Stack (~7.5 cols) */}
        <div className="lg:col-span-7">
          {selectedProgram ? (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
              {/* Main Inspector Card (9 cols on XL) */}
              <div className="xl:col-span-9 bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
                {/* Top Programme Header */}
                <div className="p-5 pb-4 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center font-mono font-bold text-base shrink-0 shadow-xs">
                      &lt;/&gt;
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-extrabold text-slate-900">
                          {selectedProgram.title}
                        </h3>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {selectedProgram.isPublished ? 'Published' : 'Draft'}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">
                          {NODE_TYPE_META[selectedProgram.nodeType]?.badgeLabel}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        {selectedProgram.shortDescription}
                      </p>
                    </div>
                  </div>

                  {/* Compact Header Buttons (Move / Rename / ...) shown on smaller desktop viewports */}
                  <div className="flex xl:hidden items-center gap-1.5 shrink-0">
                    {!selectedProgram.isPrimaryRoot && (
                      <button
                        type="button"
                        onClick={() => onMoveProgram(selectedProgram)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Move
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onRenameProgram(selectedProgram)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => onEditProgram(selectedProgram)}
                      className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                      aria-label="Edit programme"
                    >
                      <MoreHorizontal size={15} />
                    </button>
                  </div>
                </div>

                {/* Inspector Sub-Tabs (Overview | Child Programmes | Settings | Progression) */}
                <div className="px-5 border-b border-slate-200 flex items-center gap-6 overflow-x-auto no-scrollbar">
                  {(
                    [
                      { id: 'overview', label: 'Overview' },
                      {
                        id: 'children',
                        label: `Child Programmes (${directChildren.length})`,
                      },
                      { id: 'settings', label: 'Settings' },
                      { id: 'progression', label: 'Progression' },
                    ] as Array<{ id: InspectorTabId; label: string }>
                  ).map((tab) => {
                    const active = inspectorTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setInspectorTab(tab.id)}
                        className={`relative py-2.5 text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                          active
                            ? 'text-[#B91C1C]'
                            : 'text-slate-500 hover:text-slate-900'
                        }`}
                      >
                        <span>{tab.label}</span>
                        {active && (
                          <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#B91C1C] rounded-full" />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Tab Content */}
                <div className="p-5">
                  {inspectorTab === 'overview' && (
                    <div className="space-y-5">
                      {/* 2-Column Split: Cover Image on Left + Key/Value Metadata on Right (Matches Image 3 Top-Right!) */}
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-start">
                        <div className="sm:col-span-5">
                          <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-100 aspect-[4/3] shadow-2xs">
                            <img
                              src={getProgramCoverImage(selectedProgram)}
                              alt={selectedProgram.title}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        </div>

                        <div className="sm:col-span-7 divide-y divide-slate-100 text-xs">
                          <div className="py-2 flex items-center justify-between gap-3">
                            <span className="text-slate-500 font-medium">Parent:</span>
                            <span className="font-bold text-slate-900 text-right">
                              {parentProgram ? parentProgram.title : 'Primary Root (Depth 0)'}
                            </span>
                          </div>
                          <div className="py-2 flex items-center justify-between gap-3">
                            <span className="text-slate-500 font-medium">Category:</span>
                            <span className="font-bold text-slate-900 text-right">
                              {getCategoryLabel(selectedProgram.categoryId)}
                            </span>
                          </div>
                          <div className="py-2 flex items-center justify-between gap-3">
                            <span className="text-slate-500 font-medium">Type:</span>
                            <span className="font-bold text-slate-900 text-right">
                              {NODE_TYPE_META[selectedProgram.nodeType]?.badgeLabel || 'Hybrid'}
                            </span>
                          </div>
                          <div className="py-2 flex items-center justify-between gap-3">
                            <span className="text-slate-500 font-medium">Delivery:</span>
                            <span className="font-bold text-slate-900 text-right">
                              {selectedProgram.deliveryFormat === 'HYBRID'
                                ? 'Online & Physical'
                                : getDeliveryFormatLabel(selectedProgram.deliveryFormat)}
                            </span>
                          </div>
                          <div className="py-2 flex items-center justify-between gap-3">
                            <span className="text-slate-500 font-medium">Price:</span>
                            <span className="font-extrabold text-indigo-950 font-mono text-right">
                              {selectedProgram.nodeType === 'CONTAINER'
                                ? 'Branch Container'
                                : `₦${(
                                    selectedProgram.publicGroupPricing?.amount ??
                                    selectedProgram.price ??
                                    35000
                                  ).toLocaleString('en-NG')} / Term`}
                            </span>
                          </div>
                          <div className="py-2 flex items-center justify-between gap-3">
                            <span className="text-slate-500 font-medium">Progression:</span>
                            <span className="font-bold text-slate-900 capitalize text-right">
                              {selectedProgram.progressionRule || 'Sequential'}
                            </span>
                          </div>
                          <div className="py-2 flex items-center justify-between gap-3">
                            <span className="text-slate-500 font-medium">Prerequisites:</span>
                            <span className="font-bold text-slate-900 text-right">
                              {prerequisiteTitles}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Description Block */}
                      <div className="pt-3 border-t border-slate-100">
                        <h4 className="text-xs font-extrabold text-slate-900 mb-1">
                          Description
                        </h4>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          {selectedProgram.fullDescription || selectedProgram.shortDescription}
                        </p>
                      </div>
                    </div>
                  )}

                  {inspectorTab === 'children' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">
                          Direct Sub-Programmes ({directChildren.length})
                        </span>
                        {selectedProgram.canContainChildren && (
                          <button
                            type="button"
                            onClick={() => onCreateChild(selectedProgram.id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#B91C1C] text-white text-xs font-semibold hover:bg-[#991B1B]"
                          >
                            <Plus size={13} />
                            <span>Add Child Here</span>
                          </button>
                        )}
                      </div>

                      {directChildren.length === 0 ? (
                        <div className="p-6 rounded-xl bg-slate-50 border border-slate-100 text-center text-xs text-slate-500">
                          No child sub-programmes nested directly under{' '}
                          <strong className="text-slate-800">{selectedProgram.title}</strong>.
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                          {directChildren.map((child, idx) => (
                            <div
                              key={child.id}
                              className="p-3 bg-white hover:bg-slate-50 flex items-center justify-between gap-3 text-xs"
                            >
                              <div
                                onClick={() => onSelectProgram(child.id)}
                                className="flex items-center gap-2.5 cursor-pointer min-w-0"
                              >
                                <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center shrink-0 tabular-nums">
                                  {idx + 1}
                                </span>
                                <div className="min-w-0">
                                  <div className="font-bold text-slate-900 truncate hover:text-[#B91C1C]">
                                    {child.title}
                                  </div>
                                  <div className="text-[11px] text-slate-500">
                                    {NODE_TYPE_META[child.nodeType]?.badgeLabel} •{' '}
                                    {child.duration || '4 Weeks'}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  disabled={idx === 0}
                                  onClick={() => onReorderSibling(child.id, 'UP')}
                                  className="p-1 rounded border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                                  title="Move up"
                                >
                                  <ArrowUp size={12} />
                                </button>
                                <button
                                  type="button"
                                  disabled={idx === directChildren.length - 1}
                                  onClick={() => onReorderSibling(child.id, 'DOWN')}
                                  className="p-1 rounded border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                                  title="Move down"
                                >
                                  <ArrowDown size={12} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onSelectProgram(child.id)}
                                  className="px-2.5 py-1 rounded-lg border border-slate-200 font-semibold text-slate-700 hover:bg-slate-100"
                                >
                                  Inspect
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {inspectorTab === 'settings' && (
                    <div className="space-y-3 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                          <span className="text-slate-400 block text-[11px]">Document ID</span>
                          <span className="font-mono font-bold text-slate-900">
                            {selectedProgram.id}
                          </span>
                        </div>
                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                          <span className="text-slate-400 block text-[11px]">URL Slug</span>
                          <span className="font-mono font-bold text-slate-900">
                            {selectedProgram.slug}
                          </span>
                        </div>
                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                          <span className="text-slate-400 block text-[11px]">
                            Can Contain Children
                          </span>
                          <span className="font-bold text-slate-900">
                            {selectedProgram.canContainChildren ? 'Yes' : 'No (Leaf Unit)'}
                          </span>
                        </div>
                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                          <span className="text-slate-400 block text-[11px]">
                            Directly Enrollable
                          </span>
                          <span className="font-bold text-slate-900">
                            {selectedProgram.isEnrollable ? 'Yes' : 'No (Container Only)'}
                          </span>
                        </div>
                      </div>
                      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                        <span className="text-slate-400 block text-[11px] mb-1">
                          Full Hierarchy Breadcrumb
                        </span>
                        <span className="font-semibold text-slate-800">
                          {getProgramBreadcrumbs(selectedProgram.id, programsMap).path}
                        </span>
                      </div>
                    </div>
                  )}

                  {inspectorTab === 'progression' && (
                    <div className="space-y-3 text-xs">
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">Progression Mode</span>
                          <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold capitalize">
                            {selectedProgram.progressionRule || 'sequential'}
                          </span>
                        </div>
                        <p className="text-slate-600 leading-relaxed">
                          {selectedProgram.progressionRule === 'flexible'
                            ? 'Learners may complete child units in any order.'
                            : 'Learners complete required units sequentially (e.g. HTML -> CSS -> JavaScript) unless Prior-Learning Credit is granted.'}
                        </p>
                      </div>

                      <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-1.5">
                        <span className="font-bold text-slate-900 block">
                          Required Prerequisites
                        </span>
                        <p className="text-slate-600">{prerequisiteTitles}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right-Side Vertical Action Stack (Matches Image 3 Top-Right: Edit, Move, Rename, Archive, View Details) */}
              <div className="xl:col-span-3 bg-white border border-slate-200/90 rounded-2xl p-2.5 shadow-2xs flex xl:flex-col flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => onEditProgram(selectedProgram)}
                  className="flex-1 xl:w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 hover:text-slate-950 transition-colors cursor-pointer"
                >
                  <Edit3 size={15} className="text-slate-500 shrink-0" />
                  <span>Edit</span>
                </button>

                <button
                  type="button"
                  disabled={selectedProgram.isPrimaryRoot}
                  onClick={() => onMoveProgram(selectedProgram)}
                  className="flex-1 xl:w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 hover:text-slate-950 disabled:opacity-40 transition-colors cursor-pointer"
                >
                  <Move size={15} className="text-slate-500 shrink-0" />
                  <span>Move</span>
                </button>

                <button
                  type="button"
                  onClick={() => onRenameProgram(selectedProgram)}
                  className="flex-1 xl:w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 hover:text-slate-950 transition-colors cursor-pointer"
                >
                  <Tag size={15} className="text-slate-500 shrink-0" />
                  <span>Rename</span>
                </button>

                <button
                  type="button"
                  disabled={selectedProgram.isPrimaryRoot}
                  onClick={() => onRequestArchiveToggle(selectedProgram)}
                  className="flex-1 xl:w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-red-50 hover:text-[#B91C1C] disabled:opacity-40 transition-colors cursor-pointer"
                >
                  {selectedProgram.isArchived ? (
                    <>
                      <RotateCcw size={15} className="text-emerald-600 shrink-0" />
                      <span>Restore</span>
                    </>
                  ) : (
                    <>
                      <Archive size={15} className="text-slate-500 shrink-0" />
                      <span>Archive</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => onOpenCurriculum(selectedProgram)}
                  className="flex-1 xl:w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 hover:text-slate-950 transition-colors cursor-pointer"
                >
                  <Eye size={15} className="text-slate-500 shrink-0" />
                  <span>View Details</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-xs text-slate-500">
              Select a programme from the left hierarchy tree to inspect its details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
