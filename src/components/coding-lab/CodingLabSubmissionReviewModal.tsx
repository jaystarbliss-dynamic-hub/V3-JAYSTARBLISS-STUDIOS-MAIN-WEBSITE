import React, { useEffect, useState } from 'react';
import {
  X,
  CheckCircle2,
  XCircle,
  Loader2,
  Download,
  Save,
  Send,
  History,
  AlertCircle,
  Code2,
} from 'lucide-react';
import CodingLabEditorHost from './CodingLabEditorHost';
import type { CodingLabSubmissionRecord } from '../../types/codingLab';
import {
  downloadSubmittedCodingLabSb3,
  loadCodingLabSubmissionForReview,
  saveCodingLabTutorGrade,
} from '../../services/codingLab/CodingLabSubmissionService';

interface CodingLabSubmissionReviewModalProps {
  open: boolean;
  assessmentId: string;
  assessmentTitle: string;
  attempt: any;
  maxScore: number;
  canGrade?: boolean;
  actorName?: string;
  actorRole?: string;
  onClose: () => void;
  onGraded?: () => void;
}

export const CodingLabSubmissionReviewModal: React.FC<CodingLabSubmissionReviewModalProps> = ({
  open,
  assessmentId,
  assessmentTitle,
  attempt,
  maxScore,
  canGrade = true,
  actorName,
  actorRole,
  onClose,
  onGraded,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submission, setSubmission] = useState<CodingLabSubmissionRecord | null>(null);
  const [sb3Buffer, setSb3Buffer] = useState<ArrayBuffer | null>(null);

  const [manualScoreInput, setManualScoreInput] = useState<string>('');
  const [finalScoreInput, setFinalScoreInput] = useState<string>('');
  const [overrideReason, setOverrideReason] = useState<string>('');
  const [tutorFeedback, setTutorFeedback] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [saveNotice, setSaveNotice] = useState('');

  useEffect(() => {
    if (!open || !attempt) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');
      setSaveNotice('');
      try {
        const res = await loadCodingLabSubmissionForReview({
          submissionId: attempt.codingLabSubmissionId || `clsub_${attempt.id}`,
          attemptId: attempt.id,
          projectId: attempt.codingLabProjectId,
        });
        if (cancelled) return;
        setSubmission(res.submission);
        setSb3Buffer(res.sb3Buffer);
        const sub = res.submission;
        const initFinal =
          sub?.finalScore ?? attempt.score ?? sub?.automaticScore ?? '';
        setManualScoreInput(
          sub?.manualScore !== null && sub?.manualScore !== undefined
            ? String(sub.manualScore)
            : initFinal !== ''
            ? String(initFinal)
            : ''
        );
        setFinalScoreInput(initFinal !== '' ? String(initFinal) : '');
        setTutorFeedback(sub?.tutorFeedback || attempt.tutorFeedback || attempt.feedback || '');
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load submitted Coding Lab project.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [open, attempt]);

  if (!open || !attempt) return null;

  const effectiveMax = Number(submission?.maxScore || maxScore || attempt.maxScore || 100);
  const criteriaResults = submission?.criterionResults || attempt.codingLabCriterionResults || [];

  const handleSaveGrade = async (releaseResult: boolean) => {
    const parsedFinal = Number(finalScoreInput);
    if (!Number.isFinite(parsedFinal) || parsedFinal < 0 || parsedFinal > effectiveMax) {
      setError(`Enter a valid final score between 0 and ${effectiveMax}.`);
      return;
    }

    setSaving(true);
    setError('');
    setSaveNotice('');
    try {
      const parsedManual =
        manualScoreInput.trim() !== '' && Number.isFinite(Number(manualScoreInput))
          ? Number(manualScoreInput)
          : parsedFinal;

      await saveCodingLabTutorGrade({
        submissionId: submission?.id || attempt.codingLabSubmissionId || `clsub_${attempt.id}`,
        assessmentId,
        attemptId: attempt.id,
        manualScore: parsedManual,
        finalScore: parsedFinal,
        maxScore: effectiveMax,
        tutorFeedback,
        overrideReason: overrideReason.trim(),
        releaseResult,
        actorName,
        actorRole,
      });

      setSaveNotice(
        releaseResult
          ? 'Grade saved and released to learner.'
          : 'Grade saved (pending release).'
      );
      setOverrideReason('');
      onGraded?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save Coding Lab grade.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[105] bg-slate-100 dark:bg-slate-950 flex flex-col overflow-hidden"
      role="dialog"
      aria-modal="true"
    >
      {/* Top Review Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[#1E293B] text-white flex items-center justify-center shrink-0">
            <Code2 size={18} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
              Coding Lab Review — {attempt.studentName || submission?.learnerName || 'Learner'}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {assessmentTitle} • Immutable Submission Snapshot (Read-Only)
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {sb3Buffer && (
            <button
              type="button"
              onClick={() =>
                void downloadSubmittedCodingLabSb3({
                  sb3Buffer,
                  learnerName: attempt.studentName || submission?.learnerName,
                  assessmentTitle,
                })
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Download size={14} />
              Download .sb3
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold"
          >
            <X size={14} />
            Close Review
          </button>
        </div>
      </header>

      {/* Main Split Workspace: Read-Only Coding Lab Editor + Grading Panel */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        {/* Left: Read-Only Interactive Scratch 3 Editor */}
        <div className="lg:col-span-8 xl:col-span-9 min-h-[420px] h-full p-2 overflow-hidden flex">
          {loading ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 gap-3">
              <Loader2 size={28} className="animate-spin text-[#B91C1C]" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Reconstructing submitted Scratch project...
              </p>
            </div>
          ) : sb3Buffer ? (
            <CodingLabEditorHost
              mode="assessment"
              readOnly
              initialTitle={`${attempt.studentName || 'Learner'} — ${assessmentTitle}`}
              initialSb3Buffer={sb3Buffer}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 text-center gap-2">
              <AlertCircle size={26} className="text-amber-500" />
              <p className="text-sm font-semibold text-slate-800 dark:text-white">
                Project Snapshot Unavailable
              </p>
              <p className="text-xs text-slate-500 max-w-md">
                {error || 'No saved Coding Lab project payload was found for this attempt.'}
              </p>
            </div>
          )}
        </div>

        {/* Right: Automatic Structural Breakdown + Manual Grading / Override Panel */}
        <aside className="lg:col-span-4 xl:col-span-3 h-full overflow-y-auto bg-white dark:bg-slate-900 border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-slate-800 p-4 space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-800 dark:text-red-200">
              {error}
            </div>
          )}
          {saveNotice && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 font-medium">
              {saveNotice}
            </div>
          )}

          {/* Structural Metrics */}
          {submission?.summaryMetrics && (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div className="text-base font-bold text-slate-900 dark:text-white tabular-nums">
                  {submission.summaryMetrics.totalBlocks}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Blocks</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div className="text-base font-bold text-slate-900 dark:text-white tabular-nums">
                  {submission.summaryMetrics.spriteCount}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Sprites</div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                <div className="text-base font-bold text-slate-900 dark:text-white tabular-nums">
                  {submission.summaryMetrics.variableCount}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Variables</div>
              </div>
            </div>
          )}

          {/* Automatic Structural Grading Breakdown */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Structural Auto-Grading
              </h3>
              {submission?.automaticScore !== null && submission?.automaticScore !== undefined && (
                <span className="text-xs font-bold text-slate-900 dark:text-white tabular-nums">
                  {submission.automaticScore} / {submission.maxAutomaticScore || effectiveMax}
                </span>
              )}
            </div>

            {criteriaResults.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No automatic structural criteria were configured for this task (manual grading).
              </p>
            ) : (
              <div className="space-y-2">
                {criteriaResults.map((r: any, idx: number) => (
                  <div
                    key={r.criterionId || idx}
                    className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-1"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="inline-flex items-start gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100">
                        {r.passed ? (
                          <CheckCircle2 size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                        )}
                        {r.label}
                      </span>
                      <span className="text-xs font-bold tabular-nums text-slate-700 dark:text-slate-200 shrink-0">
                        {r.awardedMarks}/{r.maxMarks}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 pl-5">
                      {r.feedback}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Manual Grading & Override Form */}
          {canGrade && (
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Tutor Grading &amp; Override
              </h3>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Manual Marks
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={effectiveMax}
                    step={0.5}
                    value={manualScoreInput}
                    onChange={(e) => {
                      setManualScoreInput(e.target.value);
                      if (submission?.gradingMethod === 'manual') {
                        setFinalScoreInput(e.target.value);
                      } else if (
                        submission?.gradingMethod === 'hybrid' &&
                        submission.automaticScore !== null
                      ) {
                        const combined = Math.min(
                          effectiveMax,
                          Number(submission.automaticScore || 0) + (Number(e.target.value) || 0)
                        );
                        setFinalScoreInput(String(Number(combined.toFixed(2))));
                      }
                    }}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm font-semibold text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Final Score (/{effectiveMax})
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={effectiveMax}
                    step={0.5}
                    value={finalScoreInput}
                    onChange={(e) => setFinalScoreInput(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm font-bold text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Override / Grading Note (stored in audit history)
                </label>
                <input
                  type="text"
                  placeholder="Optional reason for manual adjustment"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Tutor Feedback for Learner
                </label>
                <textarea
                  rows={3}
                  value={tutorFeedback}
                  onChange={(e) => setTutorFeedback(e.target.value)}
                  placeholder="Write constructive feedback about the learner's blocks, logic, and creativity..."
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-2 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSaveGrade(false)}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Save Grade (Draft)
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSaveGrade(true)}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-semibold disabled:opacity-50"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Save &amp; Release Result
                </button>
              </div>
            </div>
          )}

          {/* Grade Override Audit Trail */}
          {Array.isArray(submission?.gradeOverrides) && submission.gradeOverrides.length > 0 && (
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <History size={13} />
                Grading Audit History
              </div>
              <div className="space-y-1.5">
                {submission.gradeOverrides.map((ov, idx) => (
                  <div
                    key={idx}
                    className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-[11px] text-slate-600 dark:text-slate-300"
                  >
                    <div className="font-semibold text-slate-800 dark:text-slate-100">
                      {ov.actorName} ({ov.actorRole}): {ov.previousScore ?? '—'} → {ov.newScore}
                    </div>
                    {ov.reason && <div className="text-slate-500 dark:text-slate-400">{ov.reason}</div>}
                    <div className="text-[10px] text-slate-400">
                      {new Date(ov.timestamp).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
};

export default CodingLabSubmissionReviewModal;
