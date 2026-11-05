import React, { useState, useEffect, useMemo } from 'react';
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Search,
  CheckCircle2,
  Layers,
  FolderTree,
  BookOpen,
  Sparkles,
  X,
  ArrowRight,
  Tag,
} from 'lucide-react';
import {
  type ProgramRecord,
  type ProgramTreeNode,
  PRIMARY_PROGRAM_ROOTS,
  fetchAllProgramsMap,
  buildProgramTree,
  getProgramBreadcrumbs,
} from '../../lib/programHierarchy';

export interface SelectedProgramPathway {
  programId: string;
  programTitle: string;
  breadcrumbPath: string;
  primaryCategory: string;
  nodeType?: string;
}

interface AssessmentProgramPickerProps {
  selectedProgramId?: string;
  selectedProgramTitle?: string;
  selectedBreadcrumbPath?: string;
  onSelectProgram: (pathway: SelectedProgramPathway) => void;
  className?: string;
  buttonLabel?: string;
  compact?: boolean;
}

export const AssessmentProgramPicker: React.FC<AssessmentProgramPickerProps> = ({
  selectedProgramId = '',
  selectedProgramTitle = '',
  selectedBreadcrumbPath = '',
  onSelectProgram,
  className = '',
  buttonLabel = 'Select Learning Pathway',
  compact = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [programsMap, setProgramsMap] = useState<Map<string, ProgramRecord>>(new Map());
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRootKey, setSelectedRootKey] = useState<string>('ALL');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Fetch full canonical programme tree when modal opens
  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setLoading(true);
    fetchAllProgramsMap()
      .then((map) => {
        if (!active) return;
        setProgramsMap(map);
        // Default expand the 4 roots
        const initExpanded = new Set<string>();
        for (const root of PRIMARY_PROGRAM_ROOTS) {
          initExpanded.add(root.canonicalId);
        }
        for (const p of map.values()) {
          if (p.isPrimaryRoot) initExpanded.add(p.id);
        }
        setExpandedIds(initExpanded);
      })
      .catch((err) => {
        console.error('Failed to load programs map for assessment picker:', err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isOpen]);

  const treeResult = useMemo(() => {
    const list = Array.from(programsMap.values()).filter((p) => !p.isArchived);
    return buildProgramTree(list);
  }, [programsMap]);

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleChooseNode = (node: ProgramTreeNode) => {
    const rootTitle = node.breadcrumbTitles[0] || node.program.title;
    onSelectProgram({
      programId: node.program.id,
      programTitle: node.program.title,
      breadcrumbPath: node.breadcrumbPath,
      primaryCategory: rootTitle,
      nodeType: node.program.nodeType,
    });
    setIsOpen(false);
  };

  // Filtered flat list for search
  const searchResults = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return [];
    const results: ProgramTreeNode[] = [];
    treeResult.allNodesMap.forEach((node) => {
      if (
        node.program.title.toLowerCase().includes(q) ||
        node.breadcrumbPath.toLowerCase().includes(q) ||
        node.program.shortDescription.toLowerCase().includes(q)
      ) {
        results.push(node);
      }
    });
    return results.sort((a, b) => a.depth - b.depth);
  }, [searchTerm, treeResult.allNodesMap]);

  // Filtered tree roots based on selected category tab
  const displayedRoots = useMemo(() => {
    if (selectedRootKey === 'ALL') return treeResult.roots;
    return treeResult.roots.filter((r) => {
      const rootDef = PRIMARY_PROGRAM_ROOTS.find((def) => def.key === selectedRootKey);
      if (!rootDef) return true;
      return (
        r.program.primaryRootKey === selectedRootKey ||
        r.program.id === rootDef.canonicalId ||
        r.program.title.toLowerCase() === rootDef.title.toLowerCase()
      );
    });
  }, [treeResult.roots, selectedRootKey]);

  // Recursive Tree Node Renderer supporting unlimited depth
  const renderTreeNode = (node: ProgramTreeNode) => {
    const isExpanded = expandedIds.has(node.program.id);
    const hasChildren = node.children && node.children.length > 0;
    const isSelected =
      selectedProgramId === node.program.id ||
      (!selectedProgramId && selectedProgramTitle === node.program.title);

    return (
      <div key={node.program.id} className="select-none">
        <div
          onClick={() => handleChooseNode(node)}
          className={`group flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${
            isSelected
              ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100 ring-2 ring-blue-500/20'
              : 'border-slate-100 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900/60 text-slate-800 dark:text-slate-200'
          }`}
          style={{ marginLeft: `${node.depth * 16}px` }}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => toggleExpand(node.program.id, e)}
                className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors shrink-0"
              >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : (
              <span className="w-5 shrink-0" />
            )}

            {node.depth === 0 ? (
              <FolderOpen size={16} className="text-red-600 shrink-0" />
            ) : hasChildren ? (
              <Folder size={15} className="text-amber-500 shrink-0" />
            ) : (
              <BookOpen size={14} className="text-blue-500 shrink-0" />
            )}

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-xs truncate">{node.program.title}</span>
                {node.depth > 0 && (
                  <span className="text-[10px] text-slate-400 truncate hidden sm:inline">
                    ({node.breadcrumbTitles.slice(0, -1).join(' › ')})
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {node.program.nodeType && (
              <span
                className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                  node.program.nodeType === 'CONTAINER'
                    ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    : node.program.nodeType === 'HYBRID'
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                    : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                }`}
              >
                {node.program.nodeType}
              </span>
            )}

            {isSelected ? (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-600 text-white text-[10px] font-bold">
                <CheckCircle2 size={12} /> Selected
              </span>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleChooseNode(node);
                }}
                className="opacity-80 group-hover:opacity-100 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-blue-600 hover:text-white hover:border-blue-600 text-[10px] font-bold transition-all"
              >
                Select
              </button>
            )}
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="mt-1 space-y-1">
            {node.children.map((child) => renderTreeNode(child))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`relative ${className}`}>
      {/* Trigger Button & Current Display */}
      <div
        onClick={() => setIsOpen(true)}
        className={`w-full mt-1 ${compact ? 'p-1.5' : 'p-2.5'} rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/60 hover:bg-white dark:hover:bg-slate-900 hover:border-blue-500 cursor-pointer transition-all flex items-center justify-between gap-2`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FolderTree size={compact ? 13 : 15} className="text-blue-600 shrink-0" />
          <div className="min-w-0 flex-1">
            <span className={`font-bold ${compact ? 'text-[11px]' : 'text-xs'} text-slate-900 dark:text-white truncate block`}>
              {selectedProgramTitle || buttonLabel}
            </span>
            {selectedBreadcrumbPath && (
              <span className="text-[10px] text-slate-400 truncate block">
                {selectedBreadcrumbPath}
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(true);
          }}
          className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 text-[10px] font-bold whitespace-nowrap shrink-0 transition-colors"
        >
          {selectedProgramTitle ? 'Change' : 'Browse'}
        </button>
      </div>

      {/* Hierarchical Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-[#121620] border border-slate-200 dark:border-slate-800 rounded-3xl max-w-3xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[88dvh] animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950 flex items-center justify-center text-blue-600">
                  <FolderTree size={18} />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                    Select Programme &amp; Learning Pathway
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Associate this assessment with a canonical category, sub-programme, or nested track.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Search Input & Category Filter Tabs */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 space-y-3 bg-white dark:bg-slate-900/30">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search programmes or nested tracks (e.g. JavaScript, WAEC, Piano, Python, HTML)..."
                  className="w-full h-10 pl-9 pr-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:border-blue-600 transition-colors"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* 4 Primary Categories Filter Tabs */}
              {!searchTerm && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setSelectedRootKey('ALL')}
                    className={`px-3 py-1.5 rounded-xl whitespace-nowrap shrink-0 transition-colors ${
                      selectedRootKey === 'ALL'
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    All 4 Categories
                  </button>
                  {PRIMARY_PROGRAM_ROOTS.map((root) => (
                    <button
                      key={root.key}
                      type="button"
                      onClick={() => setSelectedRootKey(root.key)}
                      className={`px-3 py-1.5 rounded-xl whitespace-nowrap shrink-0 transition-colors ${
                        selectedRootKey === root.key
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                      }`}
                    >
                      {root.title}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Body: Tree or Search Results */}
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-2">
              {loading ? (
                <div className="py-12 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  <span>Loading programme catalogue hierarchy...</span>
                </div>
              ) : searchTerm ? (
                /* Search Results */
                searchResults.length === 0 ? (
                  <div className="py-12 text-center text-xs text-slate-500">
                    No programmes or nested tracks match &ldquo;{searchTerm}&rdquo;.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-bold text-slate-400 mb-2">
                      Found {searchResults.length} matching learning pathway(s):
                    </p>
                    {searchResults.map((node) => {
                      const isSelected = selectedProgramId === node.program.id;
                      return (
                        <div
                          key={node.program.id}
                          onClick={() => handleChooseNode(node)}
                          className={`p-3 rounded-xl border cursor-pointer flex items-center justify-between gap-3 transition-all ${
                            isSelected
                              ? 'border-blue-600 bg-blue-50/70 dark:bg-blue-950/40 text-blue-900 dark:text-blue-100 ring-2 ring-blue-500/20'
                              : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900/60'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <span className="font-bold text-xs text-slate-900 dark:text-white block">
                              {node.program.title}
                            </span>
                            <span className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5 truncate">
                              <Tag size={10} className="shrink-0" />
                              {node.breadcrumbPath}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {isSelected ? (
                              <span className="px-2 py-1 rounded-lg bg-blue-600 text-white text-[10px] font-bold">
                                Selected
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[10px] font-bold text-slate-700 dark:text-slate-300"
                              >
                                Select
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )
              ) : (
                /* Recursive Tree with Unlimited Nesting */
                <div className="space-y-1.5">
                  {displayedRoots.map((rootNode) => renderTreeNode(rootNode))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 sm:p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 flex items-center justify-between gap-3 text-xs">
              <span className="text-slate-500 text-[11px] truncate">
                {selectedProgramTitle
                  ? `Active Selection: ${selectedProgramTitle}`
                  : 'Click on any programme or nested unit to select'}
              </span>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold hover:opacity-90 transition-opacity"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
