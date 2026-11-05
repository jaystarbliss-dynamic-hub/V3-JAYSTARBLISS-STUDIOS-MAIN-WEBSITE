import React, { useState, useEffect, useMemo } from 'react';
import { auth } from '../../lib/firebase';
import {
  BookOpen,
  CheckCircle2,
  Clock,
  GraduationCap,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Award,
  Lock,
  AlertCircle,
  Send,
  X,
} from 'lucide-react';
import {
  type ProgramRecord,
  fetchAllProgramsMap,
} from '../../lib/programHierarchy';
import {
  type ComputedProgramNodeProgress,
  type StudentUnitProgressRecord,
  type PriorLearningRecognitionRecord,
  type PriorLearningRecognitionType,
  calculateStudentPathwayProgress,
  fetchStudentProgressRecords,
  fetchStudentPriorLearningRecognitions,
  submitPriorLearningRecognition,
} from '../../lib/learningPathwayEngine';

interface Props {
  students?: any[];
}

export const ParentLearningTracks: React.FC<Props> = ({ students = [] }) => {
  const [programsMap, setProgramsMap] = useState<Map<string, ProgramRecord>>(new Map());
  const [progressByStudent, setProgressByStudent] = useState<
    Record<string, StudentUnitProgressRecord[]>
  >({});
  const [priorByStudent, setPriorByStudent] = useState<
    Record<string, PriorLearningRecognitionRecord[]>
  >({});
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Parent Prior-Learning Request Modal State
  const [requestModalTarget, setRequestModalTarget] = useState<{
    student: any;
    node: ComputedProgramNodeProgress;
  } | null>(null);
  const [reqType, setReqType] = useState<PriorLearningRecognitionType>('PRIOR_COMPLETION');
  const [reqEvidence, setReqEvidence] = useState('');
  const [reqNotes, setReqNotes] = useState('');
  const [submittingReq, setSubmittingReq] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    try {
      const progMap = await fetchAllProgramsMap();
      setProgramsMap(progMap);

      const progMapByStudent: Record<string, StudentUnitProgressRecord[]> = {};
      const priorMapByStudent: Record<string, PriorLearningRecognitionRecord[]> = {};

      await Promise.all(
        students.map(async (s) => {
          if (!s?.id) return;
          const [pDocs, prDocs] = await Promise.all([
            fetchStudentProgressRecords(s.id),
            fetchStudentPriorLearningRecognitions(s.id),
          ]);
          progMapByStudent[s.id] = pDocs;
          priorMapByStudent[s.id] = prDocs;
        })
      );

      setProgressByStudent(progMapByStudent);
      setPriorByStudent(priorMapByStudent);

      // Default expand all nodes so parents can immediately inspect branches
      const allIds = new Set<string>();
      progMap.forEach((p) => allIds.add(p.id));
      setExpandedNodes(allIds);
    } catch (err) {
      console.error('Error loading parent learning tracks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (students.length > 0) {
      loadAll();
    } else {
      setLoading(false);
    }
  }, [students]);

  const toggleExpand = (key: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSubmitParentPriorRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestModalTarget) return;
    setSubmittingReq(true);
    try {
      const user = auth.currentUser;
      await submitPriorLearningRecognition({
        studentId: requestModalTarget.student.id,
        studentName:
          requestModalTarget.student.fullName ||
          requestModalTarget.student.studentName ||
          requestModalTarget.student.name,
        program: requestModalTarget.node.program,
        programsMap,
        recognitionType: reqType,
        evidenceReference: reqEvidence,
        verificationNotes: reqNotes,
        actorUid: user?.uid || 'parent',
        actorName: user?.displayName || user?.email || 'Parent',
        actorRole: 'PARENT',
        approveImmediately: false,
      });
      setFeedbackMsg(
        `Submitted Prior-Learning Recognition request for "${requestModalTarget.node.program.title}". It will be credited once verified by your child's tutor or administrator.`
      );
      setRequestModalTarget(null);
      setReqEvidence('');
      setReqNotes('');
      await loadAll();
    } catch (err: any) {
      setFeedbackMsg(err?.message || 'Failed to submit prior-learning request.');
    } finally {
      setSubmittingReq(false);
    }
  };

  const renderStatusPill = (node: ComputedProgramNodeProgress) => {
    const status = node.children.length > 0 && !node.isHybrid ? node.status : node.selfStatus;
    if (status === 'PRIOR_LEARNING_APPROVED') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
          <Award size={11} /> Prior Learning Approved
        </span>
      );
    }
    if (status === 'COMPLETED') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-green-100 text-green-800">
          <CheckCircle2 size={11} /> Completed
        </span>
      );
    }
    if (status === 'CURRENT') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-indigo-100 text-indigo-800">
          <Clock size={11} /> Currently Learning
        </span>
      );
    }
    if (status === 'LOCKED') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-800">
          <Lock size={11} /> Locked (Prerequisite Required)
        </span>
      );
    }
    if (status === 'OPTIONAL') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-600">
          Optional Unit
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-600">
        Upcoming
      </span>
    );
  };

  const renderChildBranch = (student: any, node: ComputedProgramNodeProgress) => {
    const p = node.program;
    const expandKey = `${student.id}_${p.id}`;
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedNodes.has(expandKey) || expandedNodes.has(p.id);
    const countsOwnUnit =
      node.isDirectlyEnrolledScope &&
      !node.isContainer &&
      (node.children.length === 0 || node.isHybrid);
    const pct = hasChildren && !countsOwnUnit ? node.aggregateProgress : node.selfProgress;

    return (
      <div key={p.id} className="select-none">
        <div
          className={`p-3.5 rounded-xl border mb-2 transition-all ${
            node.selfStatus === 'PRIOR_LEARNING_APPROVED' || node.status === 'COMPLETED'
              ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50'
              : node.status === 'CURRENT'
              ? 'bg-indigo-50/40 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
          }`}
          style={{ marginLeft: `${Math.min(node.depth, 8) * 18}px` }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              {hasChildren ? (
                <button
                  type="button"
                  onClick={() => toggleExpand(expandKey)}
                  className="mt-0.5 p-1 rounded hover:bg-slate-200/60 dark:hover:bg-slate-800 text-slate-600"
                >
                  {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                </button>
              ) : (
                <span className="w-4 text-center text-slate-300 mt-0.5">•</span>
              )}

              <div className="mt-0.5 shrink-0">
                {hasChildren || node.isContainer ? (
                  isExpanded ? (
                    <FolderOpen size={17} className="text-brand-red" />
                  ) : (
                    <Folder size={17} className="text-brand-red" />
                  )
                ) : (
                  <BookOpen size={16} className="text-indigo-600" />
                )}
              </div>

              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-sm text-slate-900 dark:text-white">
                    {p.title}
                  </span>
                  {hasChildren && (
                    <span className="text-xs font-black text-indigo-700 dark:text-indigo-300">
                      — {pct}% complete
                    </span>
                  )}
                  {renderStatusPill(node)}
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                      node.isRequiredForStudent
                        ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        : 'bg-amber-50 text-amber-800'
                    }`}
                  >
                    {node.isRequiredForStudent ? 'Required' : 'Optional'}
                  </span>
                </div>

                <div className="text-[11px] text-slate-500">
                  Path: {node.breadcrumbPath}
                </div>

                {node.tutorNotes && (
                  <div className="text-[11px] bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg text-slate-700 dark:text-slate-300">
                    <strong>Tutor Feedback:</strong> {node.tutorNotes}
                  </div>
                )}

                {node.priorLearningRecord?.status === 'PENDING' && (
                  <div className="text-[11px] text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg font-medium">
                    Prior-Learning Recognition Request Pending Tutor Verification
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="w-28">
                <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1">
                  <span>{hasChildren && !countsOwnUnit ? 'Branch' : 'Unit'}</span>
                  <span className="text-slate-900 dark:text-white">{pct}%</span>
                </div>
                <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      pct >= 100 ? 'bg-emerald-500' : 'bg-indigo-600'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {countsOwnUnit &&
                node.selfStatus !== 'COMPLETED' &&
                node.selfStatus !== 'PRIOR_LEARNING_APPROVED' &&
                node.priorLearningRecord?.status !== 'PENDING' && (
                  <button
                    type="button"
                    onClick={() => {
                      setRequestModalTarget({ student, node });
                      setReqEvidence('');
                      setReqNotes('');
                    }}
                    className="px-2.5 py-1 rounded-lg border border-emerald-200 bg-emerald-50/70 text-emerald-800 text-[10px] font-bold hover:bg-emerald-100"
                    title="Request Prior-Learning Recognition if your child already completed this module"
                  >
                    Request Prior Credit
                  </button>
                )}
            </div>
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="space-y-1">
            {node.children.map((child) => renderChildBranch(student, child))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-6 text-center text-slate-500">
        Loading your children&apos;s recursive learning pathways...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <GraduationCap className="w-6 h-6 text-indigo-600" />
          <h3 className="text-xl font-black text-slate-900 dark:text-white">
            Children&apos;s Enrolled Programmes &amp; Learning Progress
          </h3>
        </div>
        <p className="text-xs text-slate-500">
          Expand any programme folder to inspect nested modules, current focus, and verified prior-learning credits.
        </p>
      </div>

      {feedbackMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center justify-between">
          <span>{feedbackMsg}</span>
          <button onClick={() => setFeedbackMsg(null)} className="font-bold underline">
            Dismiss
          </button>
        </div>
      )}

      <div className="space-y-6">
        {students.map((student) => {
          const summary = calculateStudentPathwayProgress({
            studentRecord: student,
            programsMap,
            progressRecords: progressByStudent[student.id] || [],
            priorLearningRecords: priorByStudent[student.id] || [],
          });

          return (
            <div
              key={student.id}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-5"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-black text-lg text-slate-900 dark:text-white">
                      {student.fullName || student.studentName || student.name}
                    </h4>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300">
                      Overall Pathway: {summary.overallProgress}% Complete
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {summary.completedRequiredUnits} of {summary.totalRequiredUnits} required learning units completed
                    {summary.priorLearningApprovedUnits > 0
                      ? ` (${summary.priorLearningApprovedUnits} via verified Prior-Learning Recognition)`
                      : ''}
                  </p>
                </div>

                {/* Current Focus Highlights */}
                {summary.currentUnits.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-bold text-slate-400 uppercase">
                      Current Focus:
                    </span>
                    {summary.currentUnits.slice(0, 2).map((u) => (
                      <span
                        key={u.program.id}
                        className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-xs font-bold"
                      >
                        {u.program.title} ({u.selfProgress}%)
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {summary.rootBranches.length === 0 ? (
                <div className="p-6 rounded-xl bg-amber-50/50 border border-amber-200 text-center space-y-1">
                  <AlertCircle className="w-6 h-6 text-amber-600 mx-auto" />
                  <div className="text-xs font-bold text-slate-800">
                    Pending Programme Pathway Confirmation
                  </div>
                  <p className="text-xs text-slate-500">
                    Your child&apos;s specific programme branch is currently awaiting confirmation by the academic team.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {summary.rootBranches.map((rootNode) => renderChildBranch(student, rootNode))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal: Parent Request Prior-Learning Recognition */}
      {requestModalTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSubmitParentPriorRequest}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Award size={18} className="text-emerald-600" />
                  <span>Request Prior-Learning Recognition</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Child:{' '}
                  <strong>
                    {requestModalTarget.student.fullName ||
                      requestModalTarget.student.studentName ||
                      requestModalTarget.student.name}
                  </strong>{' '}
                  · Unit: <strong>{requestModalTarget.node.breadcrumbPath}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRequestModalTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Basis for Prior-Learning Recognition
              </label>
              <select
                value={reqType}
                onChange={(e) => setReqType(e.target.value as PriorLearningRecognitionType)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 dark:text-white"
              >
                <option value="PRIOR_COMPLETION">Completed Previously</option>
                <option value="PORTFOLIO_VERIFIED">Has Built Practical Project / Portfolio</option>
                <option value="ASSESSMENT_PASSED">Ready for Diagnostic Assessment</option>
                <option value="CREDIT_TRANSFER">Completed at Previous Academy / School</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Certificate / Project Link or Evidence Reference *
              </label>
              <input
                type="text"
                required
                value={reqEvidence}
                onChange={(e) => setReqEvidence(e.target.value)}
                placeholder="e.g. Link to previous project, certificate, or school report"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Notes for Tutor / Administrator *
              </label>
              <textarea
                rows={2}
                required
                value={reqNotes}
                onChange={(e) => setReqNotes(e.target.value)}
                placeholder="Briefly describe what your child has already covered in this topic..."
                className="w-full p-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-xs dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRequestModalTarget(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingReq}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50"
              >
                <Send size={13} />
                <span>{submittingReq ? 'Submitting...' : 'Submit Request for Verification'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default ParentLearningTracks;
