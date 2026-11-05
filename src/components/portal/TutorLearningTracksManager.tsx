import React, { useState, useEffect, useMemo } from 'react';
import { auth } from '../../lib/firebase';
import {
  BookOpen,
  CheckCircle2,
  Plus,
  Sparkles,
  User,
  Folder,
  FolderOpen,
  FolderTree,
  ChevronRight,
  ChevronDown,
  Award,
  Lock,
  Clock,
  FileText,
  Save,
  AlertCircle,
  Check,
  X,
  Layers,
  GitBranch,
} from 'lucide-react';
import {
  type ProgramRecord,
  fetchAllProgramsMap,
  getProgramBreadcrumbs,
} from '../../lib/programHierarchy';
import {
  type ComputedProgramNodeProgress,
  type StudentUnitProgressRecord,
  type PriorLearningRecognitionRecord,
  type PriorLearningRecognitionType,
  calculateStudentPathwayProgress,
  fetchStudentProgressRecords,
  fetchStudentPriorLearningRecognitions,
  updateStudentUnitProgress,
  saveStudentPathwayConfiguration,
  submitPriorLearningRecognition,
  reviewPriorLearningRecognition,
  extractStudentSelectedProgramIds,
} from '../../lib/learningPathwayEngine';
import ProgramHierarchySelector from '../admin/ProgramHierarchySelector';

import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';

interface Props {
  students?: any[];
  studentId?: string;
  onRefresh?: () => void;
}

export const TutorLearningTracksManager: React.FC<Props> = ({
  students: studentsProp = [],
  studentId,
  onRefresh,
}) => {
  const [fetchedStudent, setFetchedStudent] = useState<any | null>(null);
  const students = useMemo(() => {
    if (studentsProp.length > 0) return studentsProp;
    if (fetchedStudent) return [fetchedStudent];
    return [];
  }, [studentsProp, fetchedStudent]);

  const [programsMap, setProgramsMap] = useState<Map<string, ProgramRecord>>(new Map());
  const [selectedStudentId, setSelectedStudentId] = useState<string>(
    studentId || studentsProp[0]?.id || ''
  );
  const [progressRecords, setProgressRecords] = useState<StudentUnitProgressRecord[]>([]);
  const [priorLearningRecords, setPriorLearningRecords] = useState<
    PriorLearningRecognitionRecord[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [savingUnitId, setSavingUnitId] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  // Tree expansion state
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(new Set());

  // Active unit editor drawer/modal state
  const [editingNode, setEditingNode] = useState<ComputedProgramNodeProgress | null>(null);
  const [unitProgressVal, setUnitProgressVal] = useState<number>(0);
  const [unitNotes, setUnitNotes] = useState<string>('');
  const [unitEvidence, setUnitEvidence] = useState<string>('');

  // Prior Learning Verification Modal
  const [priorModalNode, setPriorModalNode] = useState<ComputedProgramNodeProgress | null>(null);
  const [priorType, setPriorType] = useState<PriorLearningRecognitionType>('PRIOR_COMPLETION');
  const [priorEvidence, setPriorEvidence] = useState('');
  const [priorNotes, setPriorNotes] = useState('');
  const [savingPrior, setSavingPrior] = useState(false);

  // Pathway Assignment Editor Toggle
  const [showPathwayConfigurator, setShowPathwayConfigurator] = useState(false);
  const [draftSelectedProgramIds, setDraftSelectedProgramIds] = useState<string[]>([]);
  const [draftOptionalProgramIds, setDraftOptionalProgramIds] = useState<string[]>([]);
  const [savingPathwayConfig, setSavingPathwayConfig] = useState(false);

  useEffect(() => {
    if (studentId && studentsProp.length === 0) {
      getDoc(doc(db, 'students', studentId))
        .then((snap) => {
          if (snap.exists()) {
            setFetchedStudent({ id: snap.id, ...snap.data() });
            setSelectedStudentId(snap.id);
          }
        })
        .catch(() => null);
    }
  }, [studentId, studentsProp.length]);

  useEffect(() => {
    if (!selectedStudentId && students.length > 0) {
      setSelectedStudentId(students[0].id);
    }
  }, [students, selectedStudentId]);

  const currentStudent = useMemo(
    () => students.find((s) => s.id === selectedStudentId) || null,
    [students, selectedStudentId]
  );

  const loadStudentLearningState = async (studentObj: any) => {
    setLoading(true);
    try {
      const [progMap, progDocs, priorDocs] = await Promise.all([
        fetchAllProgramsMap(),
        studentObj?.id ? fetchStudentProgressRecords(studentObj.id) : Promise.resolve([]),
        studentObj?.id
          ? fetchStudentPriorLearningRecognitions(studentObj.id)
          : Promise.resolve([]),
      ]);
      setProgramsMap(progMap);
      setProgressRecords(progDocs);
      setPriorLearningRecords(priorDocs);

      if (studentObj) {
        const ext = extractStudentSelectedProgramIds(studentObj, progMap);
        setDraftSelectedProgramIds(ext.selectedProgramIds);
        setDraftOptionalProgramIds(ext.optionalProgramIds);

        // Expand all nodes in the student's visible pathway by default
        const allIds = new Set<string>();
        progMap.forEach((p) => allIds.add(p.id));
        setExpandedNodeIds(allIds);
      }
    } catch (err) {
      console.error('Error loading tutor learning tracks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudentLearningState(currentStudent);
  }, [selectedStudentId, currentStudent?.id]);

  const pathwaySummary = useMemo(() => {
    return calculateStudentPathwayProgress({
      studentRecord: currentStudent,
      programsMap,
      progressRecords,
      priorLearningRecords,
    });
  }, [currentStudent, programsMap, progressRecords, priorLearningRecords]);

  const pendingPriorRequests = useMemo(
    () => priorLearningRecords.filter((r) => r.status === 'PENDING'),
    [priorLearningRecords]
  );

  const toggleExpand = (id: string) => {
    setExpandedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSavePathwayAssignment = async () => {
    if (!currentStudent) return;
    setSavingPathwayConfig(true);
    try {
      await saveStudentPathwayConfiguration({
        studentId: currentStudent.id,
        studentUid: currentStudent.firebaseUid,
        selectedProgramIds: draftSelectedProgramIds,
        optionalProgramIds: draftOptionalProgramIds,
        deliveryType: currentStudent.deliveryType || 'PUBLIC_GROUP',
        programsMap,
      });
      // Update in-memory student object so UI reflects immediately
      currentStudent.selectedProgramIds = draftSelectedProgramIds;
      currentStudent.assignedTrackIds = draftSelectedProgramIds;
      currentStudent.optionalProgramIds = draftOptionalProgramIds;

      setShowPathwayConfigurator(false);
      setFeedbackBanner('Updated student recursive programme pathway.');
      await loadStudentLearningState(currentStudent);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setFeedbackBanner(err?.message || 'Failed to update pathway.');
    } finally {
      setSavingPathwayConfig(false);
    }
  };

  const handleQuickProgressUpdate = async (
    node: ComputedProgramNodeProgress,
    nextProgress: number,
    explicitNotes?: string,
    explicitEvidence?: string
  ) => {
    if (!currentStudent) return;
    setSavingUnitId(node.program.id);
    try {
      const user = auth.currentUser;
      await updateStudentUnitProgress({
        studentId: currentStudent.id,
        program: node.program,
        programsMap,
        progress: nextProgress,
        selfProgress: nextProgress,
        tutorNotes: explicitNotes !== undefined ? explicitNotes : node.tutorNotes,
        evidenceReference:
          explicitEvidence !== undefined ? explicitEvidence : node.evidenceReference,
        actorUid: user?.uid || 'tutor',
        actorName: user?.displayName || user?.email || 'Tutor',
      });
      await loadStudentLearningState(currentStudent);
      setEditingNode(null);
      setFeedbackBanner(`Updated progress for "${node.program.title}" to ${nextProgress}%.`);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setFeedbackBanner(err?.message || 'Failed to update unit progress.');
    } finally {
      setSavingUnitId(null);
    }
  };

  const handleVerifyPriorLearning = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentStudent || !priorModalNode) return;
    setSavingPrior(true);
    try {
      const user = auth.currentUser;
      await submitPriorLearningRecognition({
        studentId: currentStudent.id,
        studentName: currentStudent.fullName || currentStudent.name,
        program: priorModalNode.program,
        programsMap,
        recognitionType: priorType,
        evidenceReference: priorEvidence,
        verificationNotes: priorNotes,
        actorUid: user?.uid || 'tutor',
        actorName: user?.displayName || user?.email || 'Tutor',
        actorRole: 'TUTOR',
        approveImmediately: true,
      });
      setPriorModalNode(null);
      setPriorEvidence('');
      setPriorNotes('');
      setFeedbackBanner(
        `Verified Prior-Learning Recognition for "${priorModalNode.program.title}".`
      );
      await loadStudentLearningState(currentStudent);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setFeedbackBanner(err?.message || 'Failed to verify prior learning.');
    } finally {
      setSavingPrior(false);
    }
  };

  const handleReviewPendingPrior = async (
    rec: PriorLearningRecognitionRecord,
    decision: 'APPROVED' | 'REJECTED'
  ) => {
    if (!currentStudent) return;
    try {
      const user = auth.currentUser;
      await reviewPriorLearningRecognition({
        recordId: rec.id,
        studentId: currentStudent.id,
        programId: rec.programId,
        programTitle: rec.programTitle,
        programPath: rec.programPath,
        decision,
        verificationNotes:
          decision === 'APPROVED'
            ? 'Verified and approved by assigned tutor.'
            : 'Requires live module completion.',
        evidenceReference: rec.evidenceReference,
        verifierUid: user?.uid || 'tutor',
        verifierName: user?.displayName || user?.email || 'Tutor',
        verifierRole: 'TUTOR',
      });
      setFeedbackBanner(
        `${decision === 'APPROVED' ? 'Approved' : 'Declined'} prior-learning request for "${
          rec.programTitle
        }".`
      );
      await loadStudentLearningState(currentStudent);
    } catch (err: any) {
      setFeedbackBanner(err?.message || 'Failed to review request.');
    }
  };

  const renderStatusBadge = (node: ComputedProgramNodeProgress) => {
    const status = node.children.length > 0 && !node.isHybrid ? node.status : node.selfStatus;
    switch (status) {
      case 'PRIOR_LEARNING_APPROVED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
            <Award size={11} /> Prior Learning Approved
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-green-100 text-green-800">
            <CheckCircle2 size={11} /> Completed
          </span>
        );
      case 'CURRENT':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-indigo-100 text-indigo-800">
            <Clock size={11} /> Currently Learning
          </span>
        );
      case 'LOCKED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-900">
            <Lock size={11} /> Prerequisite Locked
          </span>
        );
      case 'OPTIONAL':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-600">
            Optional Elective
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 text-slate-600">
            Upcoming
          </span>
        );
    }
  };

  const renderPathwayNode = (node: ComputedProgramNodeProgress) => {
    const p = node.program;
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedNodeIds.has(p.id);
    const isUpdating = savingUnitId === p.id;
    const countsOwnUnit =
      node.isDirectlyEnrolledScope &&
      !node.isContainer &&
      (node.children.length === 0 || node.isHybrid);

    return (
      <div key={p.id} className="select-none">
        <div
          className={`p-3.5 rounded-xl border transition-all mb-2 ${
            node.selfStatus === 'PRIOR_LEARNING_APPROVED' || node.status === 'COMPLETED'
              ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-900/50'
              : node.status === 'CURRENT'
              ? 'bg-indigo-50/40 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
          }`}
          style={{ marginLeft: `${Math.min(node.depth, 8) * 20}px` }}
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            {/* Left: Node identity, breadcrumb, objectives */}
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              {hasChildren ? (
                <button
                  type="button"
                  onClick={() => toggleExpand(p.id)}
                  className="mt-0.5 p-1 rounded-md hover:bg-slate-200/60 dark:hover:bg-slate-800 text-slate-600"
                >
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
              ) : (
                <span className="w-5 text-center text-slate-300 mt-0.5">•</span>
              )}

              <div className="mt-0.5 shrink-0">
                {hasChildren || node.isContainer ? (
                  isExpanded ? (
                    <FolderOpen size={18} className="text-brand-red" />
                  ) : (
                    <Folder size={18} className="text-brand-red" />
                  )
                ) : (
                  <BookOpen size={17} className="text-indigo-600 dark:text-indigo-400" />
                )}
              </div>

              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-black text-sm text-slate-900 dark:text-white">
                    {p.title}
                  </span>
                  {renderStatusBadge(node)}
                  {node.isContainer && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                      Branch Container ({node.completedRequiredUnitsCount}/
                      {node.totalRequiredUnitsCount} units done)
                    </span>
                  )}
                  {node.isHybrid && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                      Hybrid Branch
                    </span>
                  )}
                  {node.isAncestorContextOnly && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-500">
                      Parent Context
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Path: {node.breadcrumbPath}
                </div>

                {node.isLockedByPrerequisite && (
                  <div className="text-[11px] font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1">
                    <Lock size={12} />
                    <span>
                      Requires completion of:{' '}
                      {node.missingPrerequisites.map((m) => m.title).join(', ')}
                    </span>
                  </div>
                )}

                {p.learningObjectives && p.learningObjectives.length > 0 && (
                  <div className="text-[11px] text-slate-600 dark:text-slate-400 pt-0.5">
                    <strong>Objectives:</strong> {p.learningObjectives.slice(0, 3).join(' · ')}
                  </div>
                )}

                {node.tutorNotes && (
                  <div className="text-[11px] bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg text-slate-700 dark:text-slate-300">
                    <strong>Tutor Note:</strong> {node.tutorNotes}
                  </div>
                )}

                {node.priorLearningRecord?.status === 'APPROVED' && (
                  <div className="text-[11px] bg-emerald-100/70 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200 px-2.5 py-1 rounded-lg">
                    <strong>Prior-Learning Credit ({node.priorLearningRecord.recognitionType}):</strong>{' '}
                    {node.priorLearningRecord.verificationNotes ||
                      node.priorLearningRecord.evidenceReference}{' '}
                    {node.priorLearningRecord.verifiedByName
                      ? `— Verified by ${node.priorLearningRecord.verifiedByName}`
                      : ''}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Progress Bar & Tutor Controls */}
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              {/* Branch or Unit Progress Display */}
              <div className="w-36">
                <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                  <span className="text-slate-500">
                    {hasChildren && !countsOwnUnit ? 'Branch Aggregate' : 'Unit Progress'}
                  </span>
                  <span className="text-slate-900 dark:text-white">
                    {hasChildren && !countsOwnUnit ? node.aggregateProgress : node.selfProgress}%
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      (hasChildren && !countsOwnUnit
                        ? node.aggregateProgress
                        : node.selfProgress) >= 100
                        ? 'bg-emerald-500'
                        : 'bg-indigo-600'
                    }`}
                    style={{
                      width: `${
                        hasChildren && !countsOwnUnit
                          ? node.aggregateProgress
                          : node.selfProgress
                      }%`,
                    }}
                  />
                </div>
              </div>

              {/* Direct Tutor Controls for Enrollable / Hybrid Learning Units */}
              {countsOwnUnit && (
                <div className="flex items-center gap-1.5">
                  <select
                    disabled={isUpdating || node.isLockedByPrerequisite}
                    value={node.selfProgress}
                    onChange={(e) => handleQuickProgressUpdate(node, Number(e.target.value))}
                    className="px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold bg-white dark:bg-slate-800 dark:text-white disabled:opacity-40"
                    title="Update learning unit completion percentage"
                  >
                    <option value={0}>0% (Not Started)</option>
                    <option value={25}>25% (Started)</option>
                    <option value={50}>50% (Midway)</option>
                    <option value={75}>75% (Project Stage)</option>
                    <option value={100}>100% (Completed)</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => {
                      setEditingNode(node);
                      setUnitProgressVal(node.selfProgress);
                      setUnitNotes(node.tutorNotes || '');
                      setUnitEvidence(node.evidenceReference || '');
                    }}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50"
                    title="Add progress notes or assessment evidence"
                  >
                    <FileText size={13} />
                  </button>

                  {node.selfStatus !== 'PRIOR_LEARNING_APPROVED' && (
                    <button
                      type="button"
                      onClick={() => {
                        setPriorModalNode(node);
                        setPriorEvidence('');
                        setPriorNotes('');
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold hover:bg-emerald-100"
                      title="Verify Prior-Learning Recognition for this unit"
                    >
                      Prior Credit
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {hasChildren && isExpanded && (
          <div className="space-y-1">
            {node.children.map((child) => renderPathwayNode(child))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-6 text-center text-slate-500">
        Loading recursive programme hierarchy &amp; student progress...
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-6">
      {/* Header & Student Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
        <div>
          <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-600" />
            <span>Recursive Programme Pathway &amp; Progress Manager</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Track exact nested sub-programmes, update unit completion, record assessment notes, and verify prior-learning recognition.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-slate-400" />
            <select
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
              className="p-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold bg-slate-50 dark:bg-slate-800 dark:text-white"
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName || s.name || s.studentName || s.email}
                </option>
              ))}
            </select>
          </div>

          {currentStudent && (
            <button
              type="button"
              onClick={() => setShowPathwayConfigurator((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-brand-red transition-colors"
            >
              <FolderTree size={14} />
              <span>
                {showPathwayConfigurator
                  ? 'Close Pathway Selector'
                  : 'Configure Enrolled Sub-Programmes'}
              </span>
            </button>
          )}
        </div>
      </div>

      {feedbackBanner && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold flex items-center justify-between">
          <span>{feedbackBanner}</span>
          <button onClick={() => setFeedbackBanner(null)} className="font-bold underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Pending Student/Parent Prior-Learning Requests Alert */}
      {pendingPriorRequests.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 space-y-3">
          <div className="text-xs font-black uppercase tracking-wider text-amber-900 dark:text-amber-200 flex items-center gap-2">
            <Award size={16} className="text-amber-600" />
            <span>
              Pending Prior-Learning Recognition Requests ({pendingPriorRequests.length})
            </span>
          </div>
          <div className="space-y-2">
            {pendingPriorRequests.map((req) => (
              <div
                key={req.id}
                className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-amber-200/80 flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">
                    {req.programPath || req.programTitle}
                  </div>
                  <div className="text-slate-500">
                    Type: {req.recognitionType} · Evidence: {req.evidenceReference || 'None'} ·
                    Notes: {req.verificationNotes || 'None'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleReviewPendingPrior(req, 'APPROVED')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700"
                  >
                    <Check size={13} /> Verify &amp; Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => handleReviewPendingPrior(req, 'REJECTED')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 text-red-700 font-bold hover:bg-red-100"
                  >
                    <X size={13} /> Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Optional Pathway Configurator Drawer */}
      {showPathwayConfigurator && currentStudent && (
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-4">
          <ProgramHierarchySelector
            programsMap={programsMap}
            selectedProgramIds={draftSelectedProgramIds}
            onChangeSelectedProgramIds={setDraftSelectedProgramIds}
            optionalProgramIds={draftOptionalProgramIds}
            onChangeOptionalProgramIds={setDraftOptionalProgramIds}
            allowOptionalToggle={true}
            compact={true}
            label={`Assign Roots, Branches, or Nested Sub-Programmes for ${
              currentStudent.fullName || currentStudent.name || 'Student'
            }`}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowPathwayConfigurator(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={savingPathwayConfig}
              onClick={handleSavePathwayAssignment}
              className="px-5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 disabled:opacity-50"
            >
              {savingPathwayConfig ? 'Saving Pathway...' : 'Save Student Pathway'}
            </button>
          </div>
        </div>
      )}

      {/* Overall Pathway Summary Metrics */}
      {currentStudent && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <div className="text-[10px] font-bold uppercase text-slate-400">Overall Completion</div>
            <div className="text-xl font-black text-slate-900 dark:text-white mt-0.5">
              {pathwaySummary.overallProgress}%
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40">
            <div className="text-[10px] font-bold uppercase text-emerald-700">Required Units Done</div>
            <div className="text-xl font-black text-emerald-900 dark:text-emerald-300 mt-0.5">
              {pathwaySummary.completedRequiredUnits} / {pathwaySummary.totalRequiredUnits}
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/40">
            <div className="text-[10px] font-bold uppercase text-indigo-700">Currently Learning</div>
            <div className="text-xl font-black text-indigo-900 dark:text-indigo-300 mt-0.5">
              {pathwaySummary.inProgressUnits}
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40">
            <div className="text-[10px] font-bold uppercase text-amber-700">Prior-Learning Credits</div>
            <div className="text-xl font-black text-amber-900 dark:text-amber-300 mt-0.5">
              {pathwaySummary.priorLearningApprovedUnits}
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
            <div className="text-[10px] font-bold uppercase text-slate-400">Upcoming / Optional</div>
            <div className="text-xl font-black text-slate-900 dark:text-white mt-0.5">
              {pathwaySummary.upcomingUnits} / {pathwaySummary.optionalUnits}
            </div>
          </div>
        </div>
      )}

      {/* Recursive Programme Tree for Student */}
      {!currentStudent ? (
        <div className="p-8 text-center text-sm text-slate-500">
          Select a student above to view and manage their recursive programme pathway.
        </div>
      ) : pathwaySummary.rootBranches.length === 0 ? (
        <div className="p-8 rounded-2xl bg-amber-50/50 border border-amber-200 text-center space-y-3">
          <AlertCircle className="w-8 h-8 text-amber-600 mx-auto" />
          <div className="text-sm font-bold text-slate-900">
            Pending Programme Confirmation for {currentStudent.fullName || currentStudent.name}
          </div>
          <p className="text-xs text-slate-600 max-w-md mx-auto">
            This student has not been assigned a confirmed programme branch yet. Click &quot;Configure Enrolled Sub-Programmes&quot; above to select their exact root, branch, or nested learning units.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {pathwaySummary.rootBranches.map((rootNode) => renderPathwayNode(rootNode))}
        </div>
      )}

      {/* MODAL 1: Detailed Unit Progress & Assessment Notes */}
      {editingNode && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  Update Unit Progress &amp; Notes
                </h3>
                <p className="text-xs text-indigo-600 font-semibold mt-0.5">
                  {editingNode.breadcrumbPath}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingNode(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Completion Percentage ({unitProgressVal}%)
              </label>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={unitProgressVal}
                onChange={(e) => setUnitProgressVal(Number(e.target.value))}
                className="w-full accent-brand-red"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Tutor Progress Notes &amp; Milestone Feedback
              </label>
              <textarea
                rows={3}
                value={unitNotes}
                onChange={(e) => setUnitNotes(e.target.value)}
                placeholder="Record topics mastered, practical project feedback, or areas for next session..."
                className="w-full p-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-xs dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Assessment / Project Evidence Reference (Optional)
              </label>
              <input
                type="text"
                value={unitEvidence}
                onChange={(e) => setUnitEvidence(e.target.value)}
                placeholder="e.g. Portfolio URL, Assessment Score 92%, GitHub Repo Link"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingNode(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  handleQuickProgressUpdate(editingNode, unitProgressVal, unitNotes, unitEvidence)
                }
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-brand-red text-white text-xs font-bold hover:bg-red-700"
              >
                <Save size={14} />
                <span>Save Progress &amp; Notes</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Verify Prior-Learning Recognition */}
      {priorModalNode && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleVerifyPriorLearning}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Award size={18} className="text-emerald-600" />
                  <span>Verify Prior-Learning Recognition</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Unit: <strong>{priorModalNode.breadcrumbPath}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPriorModalNode(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Recognition Method
              </label>
              <select
                value={priorType}
                onChange={(e) => setPriorType(e.target.value as PriorLearningRecognitionType)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 dark:text-white"
              >
                <option value="PRIOR_COMPLETION">Prior Course / Module Completion</option>
                <option value="PORTFOLIO_VERIFIED">Practical Portfolio / Project Verified</option>
                <option value="ASSESSMENT_PASSED">Placement / Diagnostic Assessment Passed</option>
                <option value="CREDIT_TRANSFER">External Credit Transfer</option>
                <option value="EXEMPTION">Approved Curriculum Exemption</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Evidence / Assessment Reference *
              </label>
              <input
                type="text"
                required
                value={priorEvidence}
                onChange={(e) => setPriorEvidence(e.target.value)}
                placeholder="e.g. Diagnostic HTML/CSS Test 95%, Live project demo verified"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Verification Notes *
              </label>
              <textarea
                rows={2}
                required
                value={priorNotes}
                onChange={(e) => setPriorNotes(e.target.value)}
                placeholder="Explain why this unit is satisfied so parents, students, and admins have a clear audit trail..."
                className="w-full p-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-xs dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setPriorModalNode(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingPrior}
                className="px-5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50"
              >
                {savingPrior ? 'Verifying...' : 'Approve Prior-Learning Credit'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default TutorLearningTracksManager;
