import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import {
  BookOpen,
  Award,
  CheckCircle2,
  FolderTree,
  Plus,
  Send,
  Clock,
  AlertCircle,
  X,
} from 'lucide-react';
import {
  type ProgramRecord,
  type ProgramNodeType,
  type ProgramDeliveryOption,
  type TutorProgramProposal,
  fetchAllProgramsMap,
  getProgramBreadcrumbs,
  submitTutorProgramProposal,
  fetchTutorProgramProposals,
} from '../../lib/programHierarchy';

export default function TutorSubjects() {
  const [subjects, setSubjects] = useState<any[]>([]);
  const [programsMap, setProgramsMap] = useState<Map<string, ProgramRecord>>(new Map());
  const [myProposals, setMyProposals] = useState<TutorProgramProposal[]>([]);
  const [loading, setLoading] = useState(true);

  // Proposal Modal State
  const [showProposalModal, setShowProposalModal] = useState(false);
  const [proposalTitle, setProposalTitle] = useState('');
  const [parentProgramId, setParentProgramId] = useState('');
  const [proposedNodeType, setProposedNodeType] = useState<ProgramNodeType>('ENROLLABLE');
  const [description, setDescription] = useState('');
  const [objectivesText, setObjectivesText] = useState('');
  const [curriculumText, setCurriculumText] = useState('');
  const [prerequisiteIds, setPrerequisiteIds] = useState<string[]>([]);
  const [deliveryOptions, setDeliveryOptions] = useState<ProgramDeliveryOption[]>([
    'PUBLIC_GROUP',
    'PRIVATE_MENTORSHIP',
  ]);
  const [duration, setDuration] = useState('8 Weeks');
  const [submitting, setSubmitting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const loadData = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setLoading(false);
      return;
    }
    try {
      const [snap, progMap, proposals] = await Promise.all([
        getDocs(query(collection(db, 'tutorSubjects'), where('tutorId', '==', uid))).catch(
          () => null
        ),
        fetchAllProgramsMap().catch(() => new Map<string, ProgramRecord>()),
        fetchTutorProgramProposals(uid).catch(() => [] as TutorProgramProposal[]),
      ]);

      if (snap) {
        setSubjects(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }
      setProgramsMap(progMap);
      setMyProposals(proposals);
    } catch (error) {
      console.error('Error loading tutor subjects & proposals:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const parentOptions = useMemo(() => {
    const list: Array<{ program: ProgramRecord; breadcrumbPath: string }> = [];
    for (const p of programsMap.values()) {
      if (p.isArchived || !p.canContainChildren) continue;
      const crumbs = getProgramBreadcrumbs(p.id, programsMap);
      list.push({
        program: p,
        breadcrumbPath: crumbs.map((c) => c.title).join(' › '),
      });
    }
    return list.sort((a, b) => a.breadcrumbPath.localeCompare(b.breadcrumbPath));
  }, [programsMap]);

  const handleSubmitProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user || !proposalTitle.trim() || !parentProgramId) return;

    setSubmitting(true);
    setFeedbackMsg(null);
    try {
      await submitTutorProgramProposal({
        title: proposalTitle.trim(),
        parentProgramId,
        proposedNodeType,
        description: description.trim(),
        learningObjectives: objectivesText
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean),
        curriculum: curriculumText
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean),
        prerequisiteProgramIds: prerequisiteIds,
        deliveryOptions,
        duration,
        sessionsPerWeek: 2,
        sessionDuration: '60 mins',
        isRequired: true,
        tutorUid: user.uid,
        tutorName: user.displayName || user.email || 'Tutor',
        tutorEmail: user.email || '',
        programsMap,
      });

      setShowProposalModal(false);
      setProposalTitle('');
      setDescription('');
      setObjectivesText('');
      setCurriculumText('');
      setPrerequisiteIds([]);
      setFeedbackMsg(
        'Your nested sub-programme proposal has been submitted to the Administrator for review and official pricing approval.'
      );
      await loadData();
    } catch (err: any) {
      setFeedbackMsg(err?.message || 'Failed to submit sub-programme proposal.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-8 text-center">Loading your subjects...</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white">
            My Assigned Subjects &amp; Curriculum Proposals
          </h1>
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            View subjects you are approved to teach and propose new nested sub-programmes beneath existing programme branches.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (!parentProgramId && parentOptions.length > 0) {
              setParentProgramId(parentOptions[0].program.id);
            }
            setShowProposalModal(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-red text-white text-xs font-bold hover:bg-red-700 transition-colors shadow-sm"
        >
          <Plus size={15} />
          <span>Propose Nested Sub-Programme</span>
        </button>
      </div>

      {feedbackMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center justify-between">
          <span>{feedbackMsg}</span>
          <button onClick={() => setFeedbackMsg(null)} className="font-bold underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Assigned Subjects Grid */}
      {subjects.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl border border-slate-200 dark:border-slate-700 text-center">
          <BookOpen className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
            No Subjects Assigned Yet
          </h3>
          <p className="text-gray-500 text-sm mt-1">
            Contact the administrator to have subjects assigned to your profile, or propose a new nested sub-programme below.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {subjects.map((sub) => (
            <div
              key={sub.id}
              className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-xl">
                  <BookOpen className="w-6 h-6" />
                </div>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {sub.status || 'Active'}
                </span>
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                {sub.subjectName}
              </h3>
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                <Award className="w-4 h-4 text-amber-500" />
                <span>Proficiency: {sub.proficiencyLevel}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tutor Sub-Programme Proposals Section */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-xs">
        <div className="p-5 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <FolderTree size={16} className="text-brand-red" />
              <span>My Proposed Sub-Programmes ({myProposals.length})</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Track administrator approval status for nested sub-programmes you have proposed.
            </p>
          </div>
        </div>

        {myProposals.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            You have not submitted any sub-programme proposals yet. Click &quot;Propose Nested Sub-Programme&quot; above to suggest a new module or course branch.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {myProposals.map((prop) => (
              <div key={prop.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-900 dark:text-white">
                      {prop.title}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        prop.status === 'APPROVED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : prop.status === 'REJECTED'
                          ? 'bg-red-100 text-red-800'
                          : prop.status === 'CHANGES_REQUESTED'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-indigo-100 text-indigo-800'
                      }`}
                    >
                      {prop.status}
                    </span>
                  </div>
                  <div className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                    Parent Path: {prop.parentBreadcrumbPath} › {prop.title}
                  </div>
                  <p className="text-xs text-slate-500">{prop.description}</p>
                  {prop.adminReviewNotes && (
                    <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 rounded-lg mt-1">
                      <strong>Admin Feedback:</strong> {prop.adminReviewNotes}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Proposal Modal */}
      {showProposalModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitProposal}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-xl w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <FolderTree size={18} className="text-brand-red" />
                  <span>Propose Nested Sub-Programme</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Propose a new learning unit beneath any existing programme branch. Final pricing and publication are approved by an administrator.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowProposalModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Parent Programme Branch *
              </label>
              <select
                required
                value={parentProgramId}
                onChange={(e) => setParentProgramId(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium bg-white dark:bg-slate-800 dark:text-white"
              >
                <option value="">Select Parent Programme...</option>
                {parentOptions.map((opt) => (
                  <option key={opt.program.id} value={opt.program.id}>
                    {opt.breadcrumbPath}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Proposed Sub-Programme Title *
                </label>
                <input
                  type="text"
                  required
                  value={proposalTitle}
                  onChange={(e) => setProposalTitle(e.target.value)}
                  placeholder="e.g. TypeScript Fundamentals"
                  className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Suggested Duration
                </label>
                <input
                  type="text"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="e.g. 6 Weeks"
                  className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Description &amp; Rationale *
              </label>
              <textarea
                rows={2}
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Explain what this sub-programme covers and how it benefits learners..."
                className="w-full p-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-xs dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Learning Objectives (1 per line)
                </label>
                <textarea
                  rows={4}
                  value={objectivesText}
                  onChange={(e) => setObjectivesText(e.target.value)}
                  placeholder={'Understand static types\nBuild reusable interfaces'}
                  className="w-full p-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-xs dark:bg-slate-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Suggested Lesson Outline (1 per line)
                </label>
                <textarea
                  rows={4}
                  value={curriculumText}
                  onChange={(e) => setCurriculumText(e.target.value)}
                  placeholder={'Week 1: Type Annotations\nWeek 2: Generics & Utility Types'}
                  className="w-full p-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-xs dark:bg-slate-800 dark:text-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowProposalModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-brand-red text-white text-xs font-bold hover:bg-red-700 disabled:opacity-50"
              >
                <Send size={13} />
                <span>{submitting ? 'Submitting Proposal...' : 'Submit for Admin Approval'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
