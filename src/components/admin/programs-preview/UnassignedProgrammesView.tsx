import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  Search,
  FolderTree,
  Edit3,
  CheckCircle2,
  ArrowRight,
  HelpCircle,
  Link2Off,
  FileWarning,
  X,
  Check,
} from 'lucide-react';
import { getProgramBreadcrumbs, type ProgramRecord } from '../../../lib/programHierarchy';
import {
  NODE_TYPE_META,
  getCategoryLabel,
  type PreviewProgramRecord,
  type UnassignedReasonCategory,
} from './types';

interface UnassignedProgrammesViewProps {
  programs: PreviewProgramRecord[];
  onAssignParent: (programId: string, newParentId: string) => void;
  onEditProgram: (programId: string) => void;
  onInspectProgram: (programId: string) => void;
}

const REASON_META: Record<
  UnassignedReasonCategory,
  { label: string; badgeClass: string; description: string }
> = {
  MISSING_PARENT: {
    label: 'Missing Parent Reference',
    badgeClass: 'bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]',
    description: 'No parentProgramId or legacy seriesName was recorded on this document.',
  },
  UNCERTAIN_MATCH: {
    label: 'Uncertain Legacy Series Match',
    badgeClass: 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]',
    description:
      'Legacy seriesName or programPack could not be matched with high confidence and requires manual verification.',
  },
  UNMAPPED_RECORD: {
    label: 'Unmapped Programme',
    badgeClass: 'bg-[#F1F5F9] text-[#334155] border-[#CBD5E1]',
    description: 'Non-root programme created prior to hierarchy enforcement.',
  },
  INVALID_REFERENCE: {
    label: 'Invalid Parent Reference',
    badgeClass: 'bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]',
    description:
      'References a deleted, non-existent, or self-referential parent ID.',
  },
};

export const UnassignedProgrammesView: React.FC<UnassignedProgrammesViewProps> = ({
  programs,
  onAssignParent,
  onEditProgram,
  onInspectProgram,
}) => {
  const [reasonFilter, setReasonFilter] = useState<'ALL' | UnassignedReasonCategory>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [reviewingProgram, setReviewingProgram] = useState<PreviewProgramRecord | null>(null);
  const [selectedParentId, setSelectedParentId] = useState<string>('');

  const programsMap = useMemo(() => {
    const map = new Map<string, ProgramRecord>();
    programs.forEach((p) => map.set(p.id, p));
    return map;
  }, [programs]);

  const unassignedPrograms = useMemo(() => {
    return programs.filter((p) => !p.isArchived && p.isUnassigned && !p.isPrimaryRoot);
  }, [programs]);

  const eligibleParents = useMemo(() => {
    return programs
      .filter(
        (p) =>
          !p.isArchived &&
          !p.isUnassigned &&
          p.canContainChildren &&
          (!reviewingProgram || p.id !== reviewingProgram.id)
      )
      .map((p) => ({
        prog: p,
        breadcrumbPath: getProgramBreadcrumbs(p.id, programsMap).path,
      }))
      .sort((a, b) => a.breadcrumbPath.localeCompare(b.breadcrumbPath));
  }, [programs, programsMap, reviewingProgram]);

  const filteredUnassigned = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return unassignedPrograms.filter((prog) => {
      const reason = prog.unassignedReasonType || 'MISSING_PARENT';
      if (reasonFilter !== 'ALL' && reason !== reasonFilter) return false;
      if (!q) return true;
      return (
        prog.title.toLowerCase().includes(q) ||
        getCategoryLabel(prog.categoryId).toLowerCase().includes(q) ||
        (prog.seriesName || '').toLowerCase().includes(q) ||
        (prog.unassignedReasonDetail || '').toLowerCase().includes(q)
      );
    });
  }, [unassignedPrograms, reasonFilter, searchQuery]);

  const handleOpenAssignModal = (prog: PreviewProgramRecord) => {
    setReviewingProgram(prog);
    setSelectedParentId(prog.suggestedParentId || 'root-technology-programme');
  };

  const handleConfirmPlacement = () => {
    if (!reviewingProgram || !selectedParentId) return;
    onAssignParent(reviewingProgram.id, selectedParentId);
    setReviewingProgram(null);
  };

  return (
    <div className="space-y-4">
      {/* Header & Diagnostic Strip */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-[#0F172A]">
                Unassigned Programmes Exception Queue
              </h2>
              <span className="px-2 py-0.5 text-xs font-bold rounded-sm bg-[#FFFBEB] text-[#B45309] border border-[#FDE68A] tabular-nums">
                {unassignedPrograms.length} Unassigned
              </span>
            </div>
            <p className="text-xs text-[#475569] mt-0.5">
              Programmes without a confirmed parent or with uncertain legacy mappings are held here safely until an administrator verifies their placement. They are never silently guessed.
            </p>
          </div>

          <div className="relative w-full lg:w-72">
            <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search unassigned records..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-md text-[#0F172A] placeholder:text-[#64748B] focus:outline-hidden focus:ring-2 focus:ring-[#1E293B]"
            />
          </div>
        </div>

        {/* Reason Filter Bar */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-[#E2E8F0]">
          {(
            [
              { id: 'ALL', label: 'All Unassigned' },
              { id: 'UNCERTAIN_MATCH', label: 'Uncertain Legacy Match' },
              { id: 'MISSING_PARENT', label: 'Missing Parent ID' },
              { id: 'INVALID_REFERENCE', label: 'Invalid / Orphaned Reference' },
              { id: 'UNMAPPED_RECORD', label: 'Unmapped Record' },
            ] as Array<{ id: 'ALL' | UnassignedReasonCategory; label: string }>
          ).map((tab) => {
            const active = reasonFilter === tab.id;
            const count =
              tab.id === 'ALL'
                ? unassignedPrograms.length
                : unassignedPrograms.filter(
                    (p) => (p.unassignedReasonType || 'MISSING_PARENT') === tab.id
                  ).length;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setReasonFilter(tab.id)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  active
                    ? 'bg-[#1E293B] text-white'
                    : 'bg-[#F8FAFC] text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-sm text-[11px] tabular-nums ${
                    active ? 'bg-white/20 text-white' : 'bg-[#E2E8F0] text-[#334155]'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#E2E8F0] rounded-lg overflow-hidden">
        {filteredUnassigned.length === 0 ? (
          <div className="p-10 text-center">
            <div className="w-10 h-10 rounded-full bg-[#F0FDF4] border border-[#BBF7D0] flex items-center justify-center mx-auto mb-3">
              <CheckCircle2 className="w-5 h-5 text-[#15803D]" />
            </div>
            <p className="text-sm font-bold text-[#0F172A]">
              {unassignedPrograms.length === 0
                ? 'All Active Programmes Have Confirmed Hierarchy Placement'
                : 'No Unassigned Programmes Match This Filter'}
            </p>
            <p className="text-xs text-[#64748B] mt-1">
              {unassignedPrograms.length === 0
                ? 'Every active non-root programme is properly linked to one of the four canonical root trees.'
                : 'Clear your search query or switch reason filters to view remaining unassigned records.'}
            </p>
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[11px] font-semibold uppercase tracking-wider text-[#475569]">
                    <th className="py-3 px-4">Programme Name</th>
                    <th className="py-3 px-4">Existing Category</th>
                    <th className="py-3 px-4">Current Parent / Legacy Info</th>
                    <th className="py-3 px-4">Reason Unassigned</th>
                    <th className="py-3 px-4">Suggested Placement</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0] text-xs">
                  {filteredUnassigned.map((prog) => {
                    const reasonKey = prog.unassignedReasonType || 'MISSING_PARENT';
                    const reasonMeta = REASON_META[reasonKey];
                    const suggestedParent = prog.suggestedParentId
                      ? programsMap.get(prog.suggestedParentId)
                      : null;

                    return (
                      <tr key={prog.id} className="hover:bg-[#F8FAFC] transition-colors">
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-[#0F172A]">{prog.title}</div>
                          <div className="text-[11px] text-[#64748B] mt-0.5 flex items-center gap-2">
                            <span className="font-mono">{prog.id}</span>
                            <span>•</span>
                            <span>{NODE_TYPE_META[prog.nodeType].shortLabel}</span>
                            <span>•</span>
                            <span>{prog.isPublished ? 'Published' : 'Draft'}</span>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-[#334155] font-medium">
                          {getCategoryLabel(prog.categoryId)}
                        </td>

                        <td className="py-3.5 px-4">
                          {prog.parentProgramId ? (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center gap-1 text-[11px] font-mono text-[#B91C1C]">
                                <Link2Off className="w-3 h-3" />
                                {prog.parentProgramId}
                              </span>
                              <div className="text-[11px] text-[#64748B]">Broken ID reference</div>
                            </div>
                          ) : prog.seriesName ? (
                            <div className="space-y-0.5">
                              <div className="font-medium text-[#0F172A]">
                                Series: &ldquo;{prog.seriesName}&rdquo;
                              </div>
                              <div className="text-[11px] text-[#64748B]">
                                Stage {prog.stageNumber || 1} (Unverified)
                              </div>
                            </div>
                          ) : (
                            <span className="text-[#64748B] italic">None recorded</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 max-w-xs">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[11px] font-semibold border ${reasonMeta.badgeClass}`}
                          >
                            {reasonKey === 'INVALID_REFERENCE' ? (
                              <FileWarning className="w-3 h-3" />
                            ) : reasonKey === 'UNCERTAIN_MATCH' ? (
                              <HelpCircle className="w-3 h-3" />
                            ) : (
                              <AlertTriangle className="w-3 h-3" />
                            )}
                            {reasonMeta.label}
                          </span>
                          <p className="text-[11px] text-[#475569] mt-1 leading-relaxed">
                            {prog.unassignedReasonDetail || reasonMeta.description}
                          </p>
                        </td>

                        <td className="py-3.5 px-4">
                          {suggestedParent ? (
                            <div className="space-y-0.5">
                              <div className="font-semibold text-[#1E293B]">
                                {suggestedParent.title}
                              </div>
                              <div className="text-[11px] text-[#64748B]">
                                {getProgramBreadcrumbs(suggestedParent.id, programsMap).path}
                              </div>
                            </div>
                          ) : (
                            <span className="text-[11px] text-[#64748B]">
                              Manual parent selection required
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenAssignModal(prog)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-[#B91C1C] rounded-md hover:bg-[#991B1B] transition-colors"
                            >
                              <FolderTree className="w-3.5 h-3.5" />
                              Review &amp; Assign Parent
                            </button>
                            <button
                              type="button"
                              onClick={() => onEditProgram(prog.id)}
                              title="Open in Full Editor"
                              className="p-1.5 text-[#475569] bg-white border border-[#CBD5E1] rounded-md hover:bg-[#F8FAFC]"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Structured List */}
            <div className="md:hidden divide-y divide-[#E2E8F0]">
              {filteredUnassigned.map((prog) => {
                const reasonKey = prog.unassignedReasonType || 'MISSING_PARENT';
                const reasonMeta = REASON_META[reasonKey];
                return (
                  <div key={prog.id} className="p-4 space-y-2.5 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-bold text-sm text-[#0F172A]">{prog.title}</div>
                        <div className="text-[11px] text-[#64748B] mt-0.5">
                          {getCategoryLabel(prog.categoryId)} • {NODE_TYPE_META[prog.nodeType].shortLabel}
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-[11px] font-semibold border shrink-0 ${reasonMeta.badgeClass}`}
                      >
                        {reasonMeta.label}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#475569] leading-relaxed">
                      {prog.unassignedReasonDetail || reasonMeta.description}
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleOpenAssignModal(prog)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#B91C1C] rounded-md"
                      >
                        <FolderTree className="w-3.5 h-3.5" />
                        Review &amp; Assign Parent
                      </button>
                      <button
                        type="button"
                        onClick={() => onEditProgram(prog.id)}
                        className="px-3 py-1.5 text-xs font-medium text-[#334155] bg-white border border-[#CBD5E1] rounded-md"
                      >
                        Edit Details
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Controlled Parent Assignment Modal */}
      {reviewingProgram && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-[#0F172A]/40 backdrop-blur-[1px]">
          <div className="bg-white border border-[#E2E8F0] rounded-lg shadow-xl w-full max-w-lg overflow-hidden">
            <div className="px-5 py-4 bg-[#1E293B] text-white flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#CBD5E1]">
                  Controlled Hierarchy Placement
                </span>
                <h3 className="text-base font-bold mt-0.5">
                  Assign Parent for &ldquo;{reviewingProgram.title}&rdquo;
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setReviewingProgram(null)}
                className="p-1 rounded-md text-[#CBD5E1] hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="p-3 rounded-md bg-[#F8FAFC] border border-[#E2E8F0] space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#0F172A]">Diagnostic Reason:</span>
                  <span className="font-medium text-[#B45309]">
                    {
                      REASON_META[
                        reviewingProgram.unassignedReasonType || 'MISSING_PARENT'
                      ].label
                    }
                  </span>
                </div>
                <p className="text-[#475569] leading-relaxed">
                  {reviewingProgram.unassignedReasonDetail}
                </p>
              </div>

              <div>
                <label className="block font-semibold text-[#0F172A] mb-1.5">
                  Select Confirmed Parent Programme
                </label>
                <select
                  value={selectedParentId}
                  onChange={(e) => setSelectedParentId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-[#CBD5E1] rounded-md text-[#0F172A] font-medium focus:outline-hidden focus:ring-2 focus:ring-[#1E293B]"
                >
                  {eligibleParents.map(({ prog, breadcrumbPath }) => (
                    <option key={prog.id} value={prog.id}>
                      {breadcrumbPath} [{NODE_TYPE_META[prog.nodeType].shortLabel}]
                    </option>
                  ))}
                </select>
              </div>

              {selectedParentId && programsMap.has(selectedParentId) && (
                <div className="p-3 rounded-md bg-[#F0FDF4] border border-[#BBF7D0] space-y-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[#15803D]">
                    Resulting Breadcrumb Path Preview
                  </span>
                  <div className="font-semibold text-[#0F172A] flex items-center gap-1.5 flex-wrap">
                    <span>
                      {getProgramBreadcrumbs(selectedParentId, programsMap).path}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-[#15803D]" />
                    <span className="text-[#15803D]">{reviewingProgram.title}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setReviewingProgram(null)}
                  className="px-3.5 py-2 text-xs font-medium text-[#475569] bg-white border border-[#CBD5E1] rounded-md hover:bg-[#F8FAFC]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onInspectProgram(reviewingProgram.id);
                    setReviewingProgram(null);
                  }}
                  className="px-3.5 py-2 text-xs font-medium text-[#334155] bg-white border border-[#CBD5E1] rounded-md hover:bg-[#F8FAFC]"
                >
                  Inspect First
                </button>
                <button
                  type="button"
                  onClick={handleConfirmPlacement}
                  disabled={!selectedParentId}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#B91C1C] rounded-md hover:bg-[#991B1B] disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  Confirm Parent Placement
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
