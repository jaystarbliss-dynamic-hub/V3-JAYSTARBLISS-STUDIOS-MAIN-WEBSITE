import React, { useState, useMemo } from 'react';
import {
  Search,
  SlidersHorizontal,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Edit3,
  FolderTree,
  BookOpen,
  Move,
  Archive,
  RotateCcw,
  Eye,
  Plus,
  ArrowRight,
  CheckCircle2,
  X,
} from 'lucide-react';
import {
  PRIMARY_PROGRAM_ROOTS,
  getDirectChildren,
  type ProgramNodeType,
} from '../../../lib/programHierarchy';
import {
  CATEGORY_OPTIONS,
  DELIVERY_FORMAT_OPTIONS,
  TARGET_AUDIENCE_OPTIONS,
  NODE_TYPE_META,
  getShortCategoryLabel,
  getDeliveryFormatLabel,
  formatPriceWithCycle,
  getProgramCoverImage,
  type PreviewProgramRecord,
} from './types';

interface ProgrammeCatalogueViewProps {
  programs: PreviewProgramRecord[];
  programsMap: Map<string, PreviewProgramRecord>;
  onCreateNew: (parentId?: string | null) => void;
  onEditProgram: (program: PreviewProgramRecord) => void;
  onInspectInHierarchy: (program: PreviewProgramRecord) => void;
  onOpenCurriculum: (program: PreviewProgramRecord) => void;
  onMoveProgram: (program: PreviewProgramRecord) => void;
  onRenameProgram: (program: PreviewProgramRecord) => void;
  onTogglePublish: (program: PreviewProgramRecord) => void;
  onRequestArchiveToggle: (program: PreviewProgramRecord) => void;
  onNavigateToSection: (
    section: 'hierarchy' | 'proposals' | 'unassigned' | 'archive-tools'
  ) => void;
  pendingProposalsCount: number;
}

export const ProgrammeCatalogueView: React.FC<ProgrammeCatalogueViewProps> = ({
  programs,
  programsMap,
  onCreateNew,
  onEditProgram,
  onInspectInHierarchy,
  onOpenCurriculum,
  onMoveProgram,
  onRenameProgram,
  onTogglePublish,
  onRequestArchiveToggle,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [rootFilter, setRootFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PUBLISHED' | 'DRAFT' | 'ARCHIVED'>('ALL');
  const [nodeTypeFilter, setNodeTypeFilter] = useState<'ALL' | ProgramNodeType>('ALL');
  const [deliveryFilter, setDeliveryFilter] = useState<string>('ALL');
  const [audienceFilter, setAudienceFilter] = useState<string>('ALL');
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 8;

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [quickInspectProgram, setQuickInspectProgram] = useState<PreviewProgramRecord | null>(null);

  const filteredPrograms = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return programs
      .filter((prog) => {
        if (statusFilter === 'ARCHIVED') {
          if (!prog.isArchived) return false;
        } else {
          if (prog.isArchived) return false;
          if (statusFilter === 'PUBLISHED' && !prog.isPublished) return false;
          if (statusFilter === 'DRAFT' && prog.isPublished) return false;
        }

        if (categoryFilter !== 'ALL') {
          const shortCat = getShortCategoryLabel(prog.categoryId).toUpperCase();
          if (prog.categoryId !== categoryFilter && shortCat !== categoryFilter) {
            return false;
          }
        }

        if (rootFilter !== 'ALL') {
          if (rootFilter === 'UNASSIGNED') {
            if (!prog.isUnassigned) return false;
          } else if (prog.rootProgramId !== rootFilter && prog.id !== rootFilter) {
            return false;
          }
        }

        if (nodeTypeFilter !== 'ALL' && prog.nodeType !== nodeTypeFilter) {
          return false;
        }

        if (deliveryFilter !== 'ALL' && prog.deliveryFormat !== deliveryFilter) {
          return false;
        }

        if (audienceFilter !== 'ALL' && prog.targetAudience !== audienceFilter) {
          return false;
        }

        if (q) {
          const parentTitle = prog.parentProgramId
            ? programsMap.get(prog.parentProgramId)?.title || ''
            : '';
          const haystack = [
            prog.title,
            prog.slug,
            prog.shortDescription,
            getShortCategoryLabel(prog.categoryId),
            parentTitle,
          ]
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(q)) return false;
        }

        return true;
      })
      .sort((a, b) => {
        // Put concrete enrollable/hybrid courses first so the default catalogue view matches Image 3 (Web Development, Graphic Design, Piano Lessons, Mathematics)
        if (a.isPrimaryRoot !== b.isPrimaryRoot) return a.isPrimaryRoot ? 1 : -1;
        return a.sortOrder - b.sortOrder || a.title.localeCompare(b.title);
      });
  }, [
    programs,
    programsMap,
    searchQuery,
    categoryFilter,
    rootFilter,
    statusFilter,
    nodeTypeFilter,
    deliveryFilter,
    audienceFilter,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredPrograms.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedPrograms = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredPrograms.slice(start, start + pageSize);
  }, [filteredPrograms, safePage, pageSize]);

  const resetFilters = () => {
    setSearchQuery('');
    setCategoryFilter('ALL');
    setRootFilter('ALL');
    setStatusFilter('ALL');
    setNodeTypeFilter('ALL');
    setDeliveryFilter('ALL');
    setAudienceFilter('ALL');
    setCurrentPage(1);
  };

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    categoryFilter !== 'ALL' ||
    rootFilter !== 'ALL' ||
    statusFilter !== 'ALL' ||
    nodeTypeFilter !== 'ALL' ||
    deliveryFilter !== 'ALL' ||
    audienceFilter !== 'ALL';

  return (
    <div className="space-y-5">
      {/* ===================================================================== */}
      {/* MOBILE RESPONSIVE VIEW HEADER & PILLS (Matches Image 2/3 Mobile Mock) */}
      {/* ===================================================================== */}
      <div className="md:hidden space-y-3.5">
        {/* Search Input */}
        <div className="relative">
          <Search
            size={16}
            className="text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Search programmes..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 shadow-2xs focus:outline-none focus:border-slate-400"
          />
        </div>

        {/* Horizontal Category Pills (All in red, Technology, Creative, Music, Academics) */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
          {[
            { id: 'ALL', label: 'All' },
            { id: 'TECHNOLOGY', label: 'Technology' },
            { id: 'CREATIVE', label: 'Creative' },
            { id: 'MUSIC', label: 'Music' },
            { id: 'ACADEMICS', label: 'Academics' },
          ].map((pill) => {
            const active = categoryFilter === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => {
                  setCategoryFilter(pill.id);
                  setCurrentPage(1);
                }}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-[#B91C1C] text-white shadow-2xs'
                    : 'bg-blue-50/80 text-blue-700 border border-blue-100 hover:bg-blue-100/70'
                }`}
              >
                {pill.label}
              </button>
            );
          })}
        </div>

        {/* Status sub-tabs on Mobile */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 text-[11px] font-semibold">
            {(
              [
                { id: 'ALL', label: 'All' },
                { id: 'PUBLISHED', label: 'Published' },
                { id: 'DRAFT', label: 'Draft' },
                { id: 'ARCHIVED', label: 'Archived' },
              ] as const
            ).map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => {
                  setStatusFilter(st.id);
                  setCurrentPage(1);
                }}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  statusFilter === st.id
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => onCreateNew(null)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#B91C1C] text-white text-xs font-bold shadow-xs"
          >
            <Plus size={14} />
            <span>Add Programme</span>
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* DESKTOP CATALOGUE CONTAINER (Matches Image 3 Top-Left Pixel-for-Pixel)*/}
      {/* ===================================================================== */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
        {/* Single-Row Filter Bar (Desktop) */}
        <div className="hidden md:flex items-center justify-between gap-3 p-4 border-b border-slate-100 bg-slate-50/50">
          {/* Search Input */}
          <div className="relative flex-1 max-w-xs">
            <Search
              size={15}
              className="text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search programmes..."
              className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-white border border-slate-200/90 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 transition-colors"
            />
          </div>

          {/* Right Filter Dropdowns */}
          <div className="flex items-center flex-wrap gap-2">
            {/* Category */}
            <select
              aria-label="Filter by category"
              value={categoryFilter}
              onChange={(e) => {
                setCategoryFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 rounded-xl bg-white border border-slate-200/90 text-xs font-semibold text-slate-700 focus:outline-none focus:border-slate-400 cursor-pointer"
            >
              <option value="ALL">All Categories</option>
              {CATEGORY_OPTIONS.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>

            {/* Root */}
            <select
              aria-label="Filter by root programme"
              value={rootFilter}
              onChange={(e) => {
                setRootFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 rounded-xl bg-white border border-slate-200/90 text-xs font-semibold text-slate-700 focus:outline-none focus:border-slate-400 cursor-pointer"
            >
              <option value="ALL">All Roots</option>
              {PRIMARY_PROGRAM_ROOTS.map((r) => (
                <option key={r.canonicalId} value={r.canonicalId}>
                  {r.title}
                </option>
              ))}
              <option value="UNASSIGNED">Unassigned Only</option>
            </select>

            {/* Status */}
            <select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as any);
                setCurrentPage(1);
              }}
              className="px-3 py-2 rounded-xl bg-white border border-slate-200/90 text-xs font-semibold text-slate-700 focus:outline-none focus:border-slate-400 cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value="PUBLISHED">Published</option>
              <option value="DRAFT">Draft</option>
              <option value="ARCHIVED">Archived</option>
            </select>

            {/* Node Type */}
            <select
              aria-label="Filter by node type"
              value={nodeTypeFilter}
              onChange={(e) => {
                setNodeTypeFilter(e.target.value as any);
                setCurrentPage(1);
              }}
              className="px-3 py-2 rounded-xl bg-white border border-slate-200/90 text-xs font-semibold text-slate-700 focus:outline-none focus:border-slate-400 cursor-pointer"
            >
              <option value="ALL">All Types</option>
              <option value="ENROLLABLE">Enrollable</option>
              <option value="HYBRID">Hybrid</option>
              <option value="CONTAINER">Container</option>
            </select>

            {/* Filter Toggle Button */}
            <button
              type="button"
              onClick={() => setShowMoreFilters((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                showMoreFilters || deliveryFilter !== 'ALL' || audienceFilter !== 'ALL'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200/90 hover:bg-slate-50'
              }`}
            >
              <SlidersHorizontal size={13} />
              <span>Filter</span>
            </button>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="px-2.5 py-2 text-xs font-semibold text-[#B91C1C] hover:underline cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Collapsible Secondary Filter Bar (Delivery & Target Audience) */}
        {showMoreFilters && (
          <div className="hidden md:flex items-center gap-4 px-4 py-3 bg-slate-50 border-b border-slate-200/80 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-600">Delivery Format:</span>
              <select
                value={deliveryFilter}
                onChange={(e) => {
                  setDeliveryFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-800"
              >
                <option value="ALL">All Delivery Formats</option>
                {DELIVERY_FORMAT_OPTIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-600">Target Audience:</span>
              <select
                value={audienceFilter}
                onChange={(e) => {
                  setAudienceFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-medium text-slate-800"
              >
                <option value="ALL">All Audiences</option>
                {TARGET_AUDIENCE_OPTIONS.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Empty State */}
        {filteredPrograms.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <p className="text-sm font-bold text-slate-900">
              No programmes match your current filters
            </p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Try clearing your search query or resetting the category, root, or status filters.
            </p>
            <button
              type="button"
              onClick={resetFilters}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
            >
              Reset All Filters
            </button>
          </div>
        ) : (
          <>
            {/* Desktop Table (Matches Image 3 Top-Left with Cover Thumbnails!) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200/80 text-xs font-bold text-slate-700 bg-white">
                    <th className="py-3.5 pl-5 pr-3">Programme</th>
                    <th className="py-3.5 px-3">Category</th>
                    <th className="py-3.5 px-3">Parent</th>
                    <th className="py-3.5 px-3">Type</th>
                    <th className="py-3.5 px-3">Delivery</th>
                    <th className="py-3.5 px-3">Price</th>
                    <th className="py-3.5 px-3">Status</th>
                    <th className="py-3.5 pl-3 pr-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs sm:text-[13px]">
                  {paginatedPrograms.map((prog) => {
                    const parentProg = prog.parentProgramId
                      ? programsMap.get(prog.parentProgramId)
                      : null;
                    const parentLabel = prog.isPrimaryRoot
                      ? 'Primary Root'
                      : prog.isUnassigned
                      ? 'Unassigned'
                      : parentProg?.title || 'Technology Programme';
                    const coverUrl = getProgramCoverImage(prog);
                    const isMenuOpen = openMenuId === prog.id;

                    return (
                      <tr
                        key={prog.id}
                        onClick={() => setQuickInspectProgram(prog)}
                        className="hover:bg-slate-50/90 transition-colors cursor-pointer group"
                      >
                        {/* Programme with 48x36px Rounded Cover Thumbnail */}
                        <td className="py-3.5 pl-5 pr-3">
                          <div className="flex items-center gap-3.5">
                            <div className="w-12 h-9 rounded-lg overflow-hidden bg-slate-100 border border-slate-200/80 shrink-0 shadow-2xs">
                              <img
                                src={coverUrl}
                                alt={prog.title}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 group-hover:text-[#B91C1C] transition-colors truncate">
                                {prog.title}
                              </div>
                              <div className="text-[11px] text-slate-400 truncate max-w-[240px]">
                                {prog.duration || '12 Weeks'} •{' '}
                                {getDirectChildren(prog.id, programs).length > 0
                                  ? `${getDirectChildren(prog.id, programs).length} sub-programmes`
                                  : `${prog.curriculum?.length || 4} modules`}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Category */}
                        <td className="py-3.5 px-3 text-slate-600 font-medium whitespace-nowrap">
                          {getShortCategoryLabel(prog.categoryId)}
                        </td>

                        {/* Parent */}
                        <td className="py-3.5 px-3 text-slate-700 font-medium whitespace-nowrap">
                          {prog.isUnassigned ? (
                            <span className="text-amber-700 font-semibold">Unassigned</span>
                          ) : (
                            parentLabel
                          )}
                        </td>

                        {/* Type */}
                        <td className="py-3.5 px-3 text-slate-600 font-medium whitespace-nowrap">
                          {NODE_TYPE_META[prog.nodeType]?.badgeLabel || 'Enrollable'}
                        </td>

                        {/* Delivery */}
                        <td className="py-3.5 px-3 text-slate-600 font-medium whitespace-nowrap">
                          {getDeliveryFormatLabel(prog.deliveryFormat)}
                        </td>

                        {/* Price */}
                        <td className="py-3.5 px-3 font-bold text-slate-900 font-mono tabular-nums whitespace-nowrap">
                          {formatPriceWithCycle(prog)}
                        </td>

                        {/* Status Pill */}
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          {prog.isArchived ? (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                              Archived
                            </span>
                          ) : prog.isPublished ? (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Published
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                              Draft
                            </span>
                          )}
                        </td>

                        {/* Actions (3-dots menu) */}
                        <td
                          className="py-3.5 pl-3 pr-5 text-right whitespace-nowrap relative"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setOpenMenuId((prev) => (prev === prog.id ? null : prog.id))
                            }
                            aria-label={`Actions for ${prog.title}`}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                          >
                            <MoreVertical size={16} />
                          </button>

                          {isMenuOpen && (
                            <>
                              <div
                                className="fixed inset-0 z-30"
                                onClick={() => setOpenMenuId(null)}
                              />
                              <div className="absolute right-5 top-11 z-40 w-48 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 text-left text-xs font-medium text-slate-700">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    onInspectInHierarchy(prog);
                                  }}
                                  className="w-full px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2.5 text-slate-800"
                                >
                                  <FolderTree size={14} className="text-slate-400" />
                                  <span>Inspect in Hierarchy</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    onEditProgram(prog);
                                  }}
                                  className="w-full px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2.5 text-slate-800"
                                >
                                  <Edit3 size={14} className="text-slate-400" />
                                  <span>Edit Programme</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    onOpenCurriculum(prog);
                                  }}
                                  className="w-full px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2.5 text-slate-800"
                                >
                                  <BookOpen size={14} className="text-slate-400" />
                                  <span>Curriculum Builder</span>
                                </button>
                                {prog.canContainChildren && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      onCreateNew(prog.id);
                                    }}
                                    className="w-full px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2.5 text-slate-800"
                                  >
                                    <Plus size={14} className="text-slate-400" />
                                    <span>Add Child Programme</span>
                                  </button>
                                )}
                                {!prog.isPrimaryRoot && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      onMoveProgram(prog);
                                    }}
                                    className="w-full px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2.5 text-slate-800"
                                  >
                                    <Move size={14} className="text-slate-400" />
                                    <span>Move Branch</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    onRenameProgram(prog);
                                  }}
                                  className="w-full px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2.5 text-slate-800"
                                >
                                  <Edit3 size={14} className="text-slate-400" />
                                  <span>Quick Rename</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenMenuId(null);
                                    onTogglePublish(prog);
                                  }}
                                  className="w-full px-3.5 py-2 hover:bg-slate-50 flex items-center gap-2.5 text-slate-800"
                                >
                                  <CheckCircle2 size={14} className="text-slate-400" />
                                  <span>
                                    {prog.isPublished ? 'Revert to Draft' : 'Publish Now'}
                                  </span>
                                </button>
                                {!prog.isPrimaryRoot && (
                                  <div className="border-t border-slate-100 mt-1 pt-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenMenuId(null);
                                        onRequestArchiveToggle(prog);
                                      }}
                                      className={`w-full px-3.5 py-2 hover:bg-red-50 flex items-center gap-2.5 ${
                                        prog.isArchived ? 'text-emerald-700' : 'text-[#B91C1C]'
                                      }`}
                                    >
                                      {prog.isArchived ? (
                                        <>
                                          <RotateCcw size={14} />
                                          <span>Restore Programme</span>
                                        </>
                                      ) : (
                                        <>
                                          <Archive size={14} />
                                          <span>Archive Programme</span>
                                        </>
                                      )}
                                    </button>
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Programme Cards (Matches Image 2 & Image 3 Mobile Mockup!) */}
            <div className="md:hidden divide-y divide-slate-100">
              {paginatedPrograms.map((prog) => {
                const coverUrl = getProgramCoverImage(prog);
                return (
                  <div
                    key={prog.id}
                    className="p-4 flex flex-col gap-3 hover:bg-slate-50/70 transition-colors"
                  >
                    <div className="flex items-start gap-3.5">
                      <img
                        src={coverUrl}
                        alt={prog.title}
                        className="w-20 h-16 rounded-xl object-cover border border-slate-200 shrink-0"
                        loading="lazy"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-bold text-sm text-slate-900 leading-snug">
                            {prog.title}
                          </h3>
                          {prog.isPublished ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                              Published
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                              Draft
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                          {prog.shortDescription ||
                            `${getShortCategoryLabel(prog.categoryId)} • ${prog.duration || '8 weeks'}`}
                        </p>
                        <div className="font-extrabold text-xs text-slate-900 mt-1.5 font-mono">
                          {formatPriceWithCycle(prog)}
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[11px] font-medium text-slate-500">
                        {getShortCategoryLabel(prog.categoryId)} • {prog.duration || '8 weeks'}
                      </span>
                      <button
                        type="button"
                        onClick={() => onInspectInHierarchy(prog)}
                        className="inline-flex items-center gap-1 text-xs font-bold text-[#B91C1C] hover:underline"
                      >
                        <span>View Details</span>
                        <ArrowRight size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Pagination Footer (Matches Image 3 Top-Left `< < 1 2 3 ... > >`) */}
            <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600">
              <div>
                Showing{' '}
                <span className="font-bold text-slate-900">
                  {(safePage - 1) * pageSize + 1}–
                  {Math.min(safePage * pageSize, filteredPrograms.length)}
                </span>{' '}
                of <span className="font-bold text-slate-900">{filteredPrograms.length}</span>{' '}
                programmes
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage(1)}
                  className="w-7 h-7 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                  aria-label="First page"
                >
                  <ChevronsLeft size={13} />
                </button>
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="w-7 h-7 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={13} />
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => setCurrentPage(pageNum)}
                    className={`w-7 h-7 rounded-lg text-xs font-bold tabular-nums transition-colors cursor-pointer ${
                      pageNum === safePage
                        ? 'bg-[#B91C1C] text-white shadow-2xs'
                        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {pageNum}
                  </button>
                ))}

                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="w-7 h-7 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                  aria-label="Next page"
                >
                  <ChevronRight size={13} />
                </button>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  className="w-7 h-7 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
                  aria-label="Last page"
                >
                  <ChevronsRight size={13} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Quick Programme Details Modal when clicking a row */}
      {quickInspectProgram && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <img
                  src={getProgramCoverImage(quickInspectProgram)}
                  alt={quickInspectProgram.title}
                  className="w-16 h-12 rounded-xl object-cover border border-slate-200"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">
                      {quickInspectProgram.title}
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {quickInspectProgram.isPublished ? 'Published' : 'Draft'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {getShortCategoryLabel(quickInspectProgram.categoryId)} •{' '}
                    {NODE_TYPE_META[quickInspectProgram.nodeType]?.label}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQuickInspectProgram(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <p className="text-slate-600 leading-relaxed">
                {quickInspectProgram.fullDescription || quickInspectProgram.shortDescription}
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                <div>
                  <span className="text-slate-400 block text-[11px]">Price</span>
                  <span className="font-bold text-slate-900">
                    {formatPriceWithCycle(quickInspectProgram)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Delivery</span>
                  <span className="font-bold text-slate-900">
                    {getDeliveryFormatLabel(quickInspectProgram.deliveryFormat)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Duration</span>
                  <span className="font-bold text-slate-900">
                    {quickInspectProgram.duration || '12 Weeks'}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    const target = quickInspectProgram;
                    setQuickInspectProgram(null);
                    onInspectInHierarchy(target);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50"
                >
                  <Eye size={14} />
                  <span>Open in Hierarchy</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const target = quickInspectProgram;
                    setQuickInspectProgram(null);
                    onOpenCurriculum(target);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50"
                >
                  <BookOpen size={14} />
                  <span>Curriculum Builder</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const target = quickInspectProgram;
                    setQuickInspectProgram(null);
                    onEditProgram(target);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#B91C1C] text-white font-semibold hover:bg-[#991B1B]"
                >
                  <Edit3 size={14} />
                  <span>Edit Programme</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
