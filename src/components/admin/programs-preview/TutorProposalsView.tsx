import React, { useState, useMemo } from 'react';
import {
  Search,
  SlidersHorizontal,
  FileSearch,
  Eye,
  MoreVertical,
  X,
  CheckCircle2,
  XCircle,
  MessageSquareWarning,
  FileEdit,
  ArrowUpDown,
} from 'lucide-react';
import {
  getProgramBreadcrumbs,
  type ProgramNodeType,
  type ProgramRecord,
} from '../../../lib/programHierarchy';
import {
  NODE_TYPE_META,
  getShortCategoryLabel,
  type PreviewProgramRecord,
  type PreviewProposalRecord,
} from './types';

export interface ApprovedProposalEdits {
  title: string;
  description: string;
  parentProgramId: string;
  nodeType: ProgramNodeType;
  publicGroupPrice: number;
  privateMentorshipPrice: number;
  curriculum: string[];
  learningObjectives: string[];
  adminReviewNotes: string;
}

interface TutorProposalsViewProps {
  proposals: PreviewProposalRecord[];
  programs: PreviewProgramRecord[];
  onApproveProposal: (
    proposalId: string,
    publishImmediately: boolean,
    editedFields: ApprovedProposalEdits
  ) => void;
  onRequestChanges: (proposalId: string, notes: string) => void;
  onRejectProposal: (proposalId: string, reason: string) => void;
}

type StatusTab = 'ALL' | 'PENDING' | 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED';

export const TutorProposalsView: React.FC<TutorProposalsViewProps> = ({
  proposals,
  programs,
  onApproveProposal,
  onRequestChanges,
  onRejectProposal,
}) => {
  const [statusTab, setStatusTab] = useState<StatusTab>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [showFilterBar, setShowFilterBar] = useState(false);

  const [selectedProposal, setSelectedProposal] = useState<PreviewProposalRecord | null>(
    null
  );

  // Editable review state inside drawer
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editParentId, setEditParentId] = useState('');
  const [editNodeType, setEditNodeType] = useState<ProgramNodeType>('ENROLLABLE');
  const [editGroupPrice, setEditGroupPrice] = useState<number>(35000);
  const [editPrivatePrice, setEditPrivatePrice] = useState<number>(60000);
  const [editCurriculumText, setEditCurriculumText] = useState('');
  const [editObjectivesText, setEditObjectivesText] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [feedbackError, setFeedbackError] = useState('');

  const programsMap = useMemo(() => {
    const map = new Map<string, ProgramRecord>();
    programs.forEach((p) => map.set(p.id, p));
    return map;
  }, [programs]);

  const eligibleParents = useMemo(() => {
    return programs
      .filter((p) => !p.isArchived && p.canContainChildren)
      .map((p) => ({
        prog: p,
        path: getProgramBreadcrumbs(p.id, programsMap).path,
      }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }, [programs, programsMap]);

  const counts = useMemo(() => {
    return {
      ALL: proposals.length,
      PENDING: proposals.filter((p) => p.status === 'PENDING').length,
      APPROVED: proposals.filter((p) => p.status === 'APPROVED').length,
      CHANGES_REQUESTED: proposals.filter((p) => p.status === 'CHANGES_REQUESTED').length,
      REJECTED: proposals.filter((p) => p.status === 'REJECTED').length,
    };
  }, [proposals]);

  const filteredProposals = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return proposals.filter((p) => {
      if (statusTab !== 'ALL' && p.status !== statusTab) return false;
      if (categoryFilter !== 'ALL' && p.categoryId !== categoryFilter) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.proposedByName.toLowerCase().includes(q) ||
        (p.parentProgramTitle || '').toLowerCase().includes(q)
      );
    });
  }, [proposals, statusTab, categoryFilter, searchQuery]);

  const openDrawer = (prop: PreviewProposalRecord) => {
    setSelectedProposal(prop);
    setEditTitle(prop.title);
    setEditDescription(prop.description);
    setEditParentId(prop.parentProgramId || 'root-technology-programme');
    setEditNodeType(prop.proposedNodeType || 'ENROLLABLE');
    setEditGroupPrice(prop.submittedPublicGroupPrice || 35000);
    setEditPrivatePrice(prop.submittedPrivateMentorshipPrice || 60000);
    setEditCurriculumText((prop.curriculum || []).join('\n'));
    setEditObjectivesText((prop.learningObjectives || []).join('\n'));
    setReviewNotes(prop.adminReviewNotes || '');
    setFeedbackError('');
  };

  const formatDateShort = (iso?: string) => {
    if (!iso) return 'Apr 14, 2025';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleApprove = (publishImmediately: boolean) => {
    if (!selectedProposal) return;
    onApproveProposal(selectedProposal.id, publishImmediately, {
      title: editTitle.trim() || selectedProposal.title,
      description: editDescription.trim() || selectedProposal.description,
      parentProgramId: editParentId || 'root-technology-programme',
      nodeType: editNodeType,
      publicGroupPrice: Number(editGroupPrice) || 35000,
      privateMentorshipPrice: Number(editPrivatePrice) || 60000,
      curriculum: editCurriculumText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      learningObjectives: editObjectivesText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      adminReviewNotes:
        reviewNotes.trim() ||
        (publishImmediately
          ? 'Approved and published to live catalogue.'
          : 'Approved and saved as draft.'),
    });
    setSelectedProposal(null);
  };

  const handleRequestChanges = () => {
    if (!selectedProposal) return;
    if (!reviewNotes.trim()) {
      setFeedbackError('Please enter revision notes explaining what the tutor should update.');
      return;
    }
    onRequestChanges(selectedProposal.id, reviewNotes.trim());
    setSelectedProposal(null);
  };

  const handleReject = () => {
    if (!selectedProposal) return;
    if (!reviewNotes.trim()) {
      setFeedbackError('Please provide a rejection reason for the tutor.');
      return;
    }
    onRejectProposal(selectedProposal.id, reviewNotes.trim());
    setSelectedProposal(null);
  };

  return (
    <div className="space-y-4">
      {/* Main Card Container (Matches Image 2 Middle-Right & Image 3 Middle-Right) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
        {/* Top Header */}
        <div className="p-5 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">
              Tutor Programme Proposals
            </h2>
            <p className="text-xs text-slate-500">
              Review and approve proposed courses from our tutors
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="relative w-56 sm:w-64">
              <Search
                size={14}
                className="text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search proposals..."
                className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-slate-400"
              />
            </div>

            <button
              type="button"
              onClick={() => setShowFilterBar((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-bold transition-colors cursor-pointer ${
                showFilterBar || categoryFilter !== 'ALL'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <SlidersHorizontal size={13} />
              <span>Filter</span>
            </button>
          </div>
        </div>

        {/* Status Underline Tabs (Matches Image 2 Middle-Right: Pending (3) | Approved (12) | Changes Requested (1) | Rejected (2)) */}
        <div className="px-5 border-b border-slate-200 flex items-center gap-6 overflow-x-auto no-scrollbar">
          {(
            [
              { id: 'ALL', label: `All (${counts.ALL})` },
              { id: 'PENDING', label: `Pending (${counts.PENDING})` },
              { id: 'APPROVED', label: `Approved (${counts.APPROVED})` },
              {
                id: 'CHANGES_REQUESTED',
                label: `Changes Requested (${counts.CHANGES_REQUESTED})`,
              },
              { id: 'REJECTED', label: `Rejected (${counts.REJECTED})` },
            ] as Array<{ id: StatusTab; label: string }>
          ).map((tab) => {
            const active = statusTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusTab(tab.id)}
                className={`relative py-3 text-xs sm:text-[13px] font-bold whitespace-nowrap transition-colors cursor-pointer ${
                  active ? 'text-[#B91C1C]' : 'text-slate-500 hover:text-slate-900'
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

        {showFilterBar && (
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-3 text-xs">
            <span className="font-semibold text-slate-600">Category:</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 font-medium text-slate-800"
            >
              <option value="ALL">All Categories</option>
              <option value="DIGITAL_AND_TECHNOLOGY">Technology</option>
              <option value="CREATIVE">Design &amp; Graphics</option>
              <option value="MUSIC">Music</option>
              <option value="EXAM_PREPARATION">Academics &amp; Exam Prep</option>
            </select>
          </div>
        )}

        {/* Table (Matches Image 2 Middle-Right & Image 3 Middle-Right) */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/40 text-xs font-bold text-slate-700">
                <th className="py-3.5 pl-5 pr-3">
                  <span className="inline-flex items-center gap-1">
                    <span>Title</span>
                    <ArrowUpDown size={11} className="text-slate-400" />
                  </span>
                </th>
                <th className="py-3.5 px-3">
                  <span className="inline-flex items-center gap-1">
                    <span>Proposed By</span>
                    <ArrowUpDown size={11} className="text-slate-400" />
                  </span>
                </th>
                <th className="py-3.5 px-3">Parent Programme</th>
                <th className="py-3.5 px-3">Date</th>
                <th className="py-3.5 px-3">Status</th>
                <th className="py-3.5 pl-3 pr-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs sm:text-[13px]">
              {filteredProposals.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    No tutor proposals match your current filter.
                  </td>
                </tr>
              ) : (
                filteredProposals.map((prop) => {
                  const isPending = prop.status === 'PENDING';
                  return (
                    <tr
                      key={prop.id}
                      onClick={() => openDrawer(prop)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                    >
                      <td className="py-4 pl-5 pr-3 font-bold text-slate-900">
                        {prop.title}
                      </td>
                      <td className="py-4 px-3 text-slate-700 font-medium">
                        {prop.proposedByName}
                      </td>
                      <td className="py-4 px-3">
                        <span className="font-bold text-indigo-900 underline decoration-indigo-300 underline-offset-2">
                          {prop.parentProgramTitle ||
                            getShortCategoryLabel(prop.categoryId)}
                        </span>
                      </td>
                      <td className="py-4 px-3 text-slate-600 whitespace-nowrap">
                        {formatDateShort(prop.submittedAt)}
                      </td>
                      <td className="py-4 px-3 whitespace-nowrap">
                        {prop.status === 'PENDING' && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            Pending
                          </span>
                        )}
                        {prop.status === 'CHANGES_REQUESTED' && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            Changes Requested
                          </span>
                        )}
                        {prop.status === 'APPROVED' && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Approved
                          </span>
                        )}
                        {prop.status === 'REJECTED' && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-[#B91C1C] border border-red-200">
                            Rejected
                          </span>
                        )}
                      </td>
                      <td
                        className="py-4 pl-3 pr-5 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openDrawer(prop)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-800 hover:bg-slate-50 shadow-2xs cursor-pointer"
                          >
                            {isPending ? (
                              <>
                                <FileSearch size={13} className="text-slate-600" />
                                <span>Review</span>
                              </>
                            ) : (
                              <>
                                <Eye size={13} className="text-slate-600" />
                                <span>View</span>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => openDrawer(prop)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                            aria-label="More proposal options"
                          >
                            <MoreVertical size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Proposal Review & Edit Drawer */}
      {selectedProposal && (
        <div className="fixed inset-0 z-[70] flex justify-end bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white w-full max-w-2xl h-full shadow-2xl flex flex-col overflow-hidden">
            <div className="px-6 py-4 bg-[#141C2E] text-white flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">
                  Tutor Proposal Review
                </span>
                <h3 className="text-base font-bold mt-0.5">
                  {selectedProposal.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProposal(null)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <span className="text-slate-400 block text-[11px]">Proposed By</span>
                  <span className="font-bold text-slate-900">
                    {selectedProposal.proposedByName}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Submitted On</span>
                  <span className="font-bold text-slate-900">
                    {formatDateShort(selectedProposal.submittedAt)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Current Status</span>
                  <span className="font-bold text-slate-900">
                    {selectedProposal.status}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-800 mb-1">
                    Programme Title
                  </label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 font-semibold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-800 mb-1">
                    Target Parent Programme
                  </label>
                  <select
                    value={editParentId}
                    onChange={(e) => setEditParentId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 font-semibold"
                  >
                    {eligibleParents.map(({ prog, path }) => (
                      <option key={prog.id} value={prog.id}>
                        {path}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-bold text-slate-800 mb-1">
                    Node Type
                  </label>
                  <select
                    value={editNodeType}
                    onChange={(e) => setEditNodeType(e.target.value as ProgramNodeType)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 font-semibold"
                  >
                    <option value="ENROLLABLE">{NODE_TYPE_META.ENROLLABLE.label}</option>
                    <option value="HYBRID">{NODE_TYPE_META.HYBRID.label}</option>
                    <option value="CONTAINER">{NODE_TYPE_META.CONTAINER.label}</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-800 mb-1">
                    Public Group Fee (₦)
                  </label>
                  <input
                    type="number"
                    value={editGroupPrice}
                    onChange={(e) => setEditGroupPrice(Number(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-800 mb-1">
                    1-on-1 Mentorship (₦)
                  </label>
                  <input
                    type="number"
                    value={editPrivatePrice}
                    onChange={(e) => setEditPrivatePrice(Number(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-300 text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  Proposed Modules (One per line)
                </label>
                <textarea
                  rows={4}
                  value={editCurriculumText}
                  onChange={(e) => setEditCurriculumText(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-300 text-slate-900 font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  Admin Review Notes / Tutor Feedback
                </label>
                <textarea
                  rows={3}
                  value={reviewNotes}
                  onChange={(e) => {
                    setReviewNotes(e.target.value);
                    setFeedbackError('');
                  }}
                  placeholder="Enter feedback for the tutor or approval notes..."
                  className="w-full p-3 rounded-xl border border-slate-300 text-slate-900"
                />
                {feedbackError && (
                  <p className="text-[#B91C1C] font-semibold mt-1">{feedbackError}</p>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleReject}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-red-200 bg-red-50 text-[#B91C1C] text-xs font-bold hover:bg-red-100"
                >
                  <XCircle size={14} />
                  <span>Reject</span>
                </button>
                <button
                  type="button"
                  onClick={handleRequestChanges}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-blue-200 bg-blue-50 text-blue-800 text-xs font-bold hover:bg-blue-100"
                >
                  <MessageSquareWarning size={14} />
                  <span>Request Changes</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleApprove(false)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-800 text-xs font-bold hover:bg-slate-100"
                >
                  <FileEdit size={14} />
                  <span>Approve as Draft</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleApprove(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700"
                >
                  <CheckCircle2 size={14} />
                  <span>Approve &amp; Publish</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
