import React, { useState } from 'react';
import {
  Search,
  FileText,
  Download,
  Eye,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  X,
  History,
  ShieldCheck,
} from 'lucide-react';
import {
  type AcademicPerformanceReportSnapshot,
  type AcademicReferenceLookupItem,
  type ReportAuthorityContext,
  createCorrectedReportVersion,
  generateOfficialPerformanceReportPdf,
  searchAcademicRecordsByReference,
} from '../../lib/academic-reporting';
import { generateExamReportPdf } from '../../lib/examReportPdfGenerator';

interface ReferenceLookupPanelProps {
  authority?: ReportAuthorityContext;
  compact?: boolean;
  onSelectReportForHistory?: (report: AcademicPerformanceReportSnapshot) => void;
  onReportUpdated?: () => void;
}

export const ReferenceLookupPanel: React.FC<ReferenceLookupPanelProps> = ({
  authority,
  compact = false,
  onSelectReportForHistory,
  onReportUpdated,
}) => {
  const [queryText, setQueryText] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [results, setResults] = useState<AcademicReferenceLookupItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<AcademicReferenceLookupItem | null>(null);

  // Correction modal state
  const [correctingReport, setCorrectingReport] = useState<AcademicPerformanceReportSnapshot | null>(
    null
  );
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionFeedback, setCorrectionFeedback] = useState('');
  const [submittingCorrection, setSubmittingCorrection] = useState(false);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    setHasSearched(true);
    try {
      const items = await searchAcademicRecordsByReference(queryText, authority);
      setResults(items);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unable to execute reference lookup.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPdf = async (item: AcademicReferenceLookupItem) => {
    try {
      if (item.reportSnapshot) {
        await generateOfficialPerformanceReportPdf(item.reportSnapshot);
        return;
      }
      if (item.recordType === 'ASSESSMENT_ATTEMPT_REPORT' && item.rawAttemptData) {
        const att = item.rawAttemptData;
        const ex = item.rawAssessmentData || {};
        await generateExamReportPdf({
          attemptId: item.refNo, // Pass stored reference so formatDocumentRefNo preserves it verbatim
          examId: item.examId,
          examTitle: item.title,
          subject: ex.subject || item.programName,
          workType: ex.workType || att.workType || 'EXAMINATION',
          schoolId: item.schoolId,
          schoolName: item.schoolName,
          className: item.className,
          programName: item.programName,
          studentName: item.studentName,
          score: att.totalScore ?? att.score ?? null,
          maxScore: Number(att.maxScore || ex.totalMarks || 100),
          percentage: item.percentage,
          grade: item.grade,
          status: item.status,
          submittedAt: item.generatedAt,
          resultReleased: true,
          callerRole: 'ADMIN',
          tutorFeedback: att.tutorFeedback || att.feedback || '',
          questions: Array.isArray(ex.questions) ? ex.questions : [],
          answers: att.answers || {},
          includeAnswerKey: true,
        });
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to download PDF document.');
    }
  };

  const handleIssueCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctingReport || !correctionReason.trim()) return;
    setSubmittingCorrection(true);
    setErrorMessage(null);
    try {
      const reissued = await createCorrectedReportVersion({
        previousReport: correctingReport,
        correctionReason: correctionReason.trim(),
        updatedTutorRemarks: correctionFeedback.trim()
          ? { generalFeedback: correctionFeedback.trim() }
          : undefined,
        authority,
      });
      setCorrectingReport(null);
      setCorrectionReason('');
      setCorrectionFeedback('');
      await handleSearch();
      if (onReportUpdated) onReportUpdated();
      await generateOfficialPerformanceReportPdf(reissued);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unable to issue corrected report version.');
    } finally {
      setSubmittingCorrection(false);
    }
  };

  return (
    <div className="bg-white dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-slate-800 rounded-xl p-5 shadow-xs">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-4 border-b border-[#E2E8F0] dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#B91C1C]" />
            <h3 className="text-base font-bold text-[#0F172A] dark:text-white tracking-tight">
              Academic Records Lookup
            </h3>
          </div>
          <p className="text-xs text-[#475569] dark:text-slate-400 mt-0.5">
            Search for an assessment or official learner report using its reference number (e.g.{' '}
            <span className="font-mono text-[#0F172A] dark:text-slate-200">JDI-BXI45EFVXW26</span>,{' '}
            <span className="font-mono text-[#0F172A] dark:text-slate-200">JDI-TRM-...</span>,{' '}
            <span className="font-mono text-[#0F172A] dark:text-slate-200">JDI-SES-...</span>,{' '}
            <span className="font-mono text-[#0F172A] dark:text-slate-200">JDI-PRG-...</span>,{' '}
            <span className="font-mono text-[#0F172A] dark:text-slate-200">JDI-ANN-...</span>)
          </p>
        </div>

        <form onSubmit={handleSearch} className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-80">
            <Search className="w-4 h-4 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="Enter JDI reference number or learner..."
              className="w-full pl-9 pr-3 py-2 text-xs font-mono bg-[#F8FAFC] dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded-lg text-[#0F172A] dark:text-white focus:outline-none focus:border-[#1E293B]"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-[#991B1B] rounded-lg transition-colors cursor-pointer disabled:opacity-50 shrink-0"
          >
            {loading ? 'Searching...' : 'Search Reference'}
          </button>
          {hasSearched && (
            <button
              type="button"
              onClick={() => {
                setQueryText('');
                setResults([]);
                setHasSearched(false);
                setErrorMessage(null);
              }}
              className="px-2.5 py-2 text-xs font-medium text-[#475569] dark:text-slate-400 hover:text-[#0F172A] dark:hover:text-white border border-[#E2E8F0] dark:border-slate-700 rounded-lg"
            >
              Clear
            </button>
          )}
        </form>
      </div>

      {errorMessage && (
        <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 flex items-center gap-2 text-xs text-red-700 dark:text-red-300">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {hasSearched && !loading && results.length === 0 && !errorMessage && (
        <div className="mt-4 p-6 text-center bg-[#F8FAFC] dark:bg-slate-900/50 rounded-lg border border-[#E2E8F0] dark:border-slate-800">
          <p className="text-sm font-semibold text-[#0F172A] dark:text-white">
            No matching assessment or report found for "{queryText.trim() || 'All'}"
          </p>
          <p className="text-xs text-[#64748B] dark:text-slate-400 mt-1">
            Verify the reference code printed in the top-right corner of the official PDF document, or check that the record belongs to your authorized school/learner scope.
          </p>
        </div>
      )}

      {results.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E2E8F0] dark:border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-slate-400">
                <th className="py-2.5 px-3">Reference No</th>
                <th className="py-2.5 px-3">Record Classification</th>
                <th className="py-2.5 px-3">Learner & Enrolment</th>
                <th className="py-2.5 px-3">Class / Programme</th>
                <th className="py-2.5 px-3">Academic Period</th>
                <th className="py-2.5 px-3">Score / Grade</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0] dark:divide-slate-800 text-xs">
              {results.slice(0, compact ? 10 : 50).map((item) => (
                <tr
                  key={`${item.sourceCollection}_${item.sourceId}`}
                  className="hover:bg-[#F8FAFC] dark:hover:bg-slate-900/50 transition-colors"
                >
                  <td className="py-3 px-3 font-mono font-semibold text-[#0F172A] dark:text-white whitespace-nowrap">
                    {item.refNo}
                    {item.version > 1 && (
                      <span className="ml-1.5 text-[10px] font-sans text-[#B91C1C]">
                        v{item.version}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    <div className="font-semibold text-[#0F172A] dark:text-white">
                      {item.recordTypeLabel}
                    </div>
                    <div className="text-[11px] text-[#64748B] dark:text-slate-400 truncate max-w-xs">
                      {item.title}
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <div className="font-semibold text-[#0F172A] dark:text-white">
                      {item.studentName}
                    </div>
                    <div className="text-[11px] text-[#64748B] dark:text-slate-400">
                      {item.schoolName ? `${item.schoolName} (School)` : item.enrolmentLabel}
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <div className="text-[#0F172A] dark:text-slate-200 font-medium">
                      {item.className}
                    </div>
                    <div className="text-[11px] text-[#64748B] dark:text-slate-400">
                      {item.programName}
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <div className="text-[#0F172A] dark:text-slate-200">{item.periodLabel}</div>
                    <div className="text-[11px] text-[#64748B] dark:text-slate-400 tabular-nums">
                      {item.generatedAt ? item.generatedAt.slice(0, 10) : '—'}
                    </div>
                  </td>
                  <td className="py-3 px-3 font-semibold tabular-nums text-[#0F172A] dark:text-white">
                    {item.scoreSummary}
                  </td>
                  <td className="py-3 px-3">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0F172A] dark:text-slate-200">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          item.status === 'ISSUED' || item.status === 'GRADED' || item.status === 'PUBLISHED'
                            ? 'bg-emerald-600'
                            : item.status === 'SUPERSEDED'
                            ? 'bg-amber-500'
                            : 'bg-slate-400'
                        }`}
                      />
                      {item.status}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedItem(item)}
                        className="px-2.5 py-1.5 text-xs font-medium text-[#0F172A] dark:text-slate-200 bg-[#F8FAFC] dark:bg-slate-800 hover:bg-[#E2E8F0] dark:hover:bg-slate-700 border border-[#CBD5E1] dark:border-slate-700 rounded-md inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Inspect
                      </button>

                      {(item.reportSnapshot || item.recordType === 'ASSESSMENT_ATTEMPT_REPORT') && (
                        <button
                          type="button"
                          onClick={() => handleDownloadPdf(item)}
                          className="px-2.5 py-1.5 text-xs font-semibold text-white bg-[#1E293B] hover:bg-[#0F172A] rounded-md inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          PDF
                        </button>
                      )}

                      {item.reportSnapshot && item.reportSnapshot.status === 'ISSUED' && (
                        <button
                          type="button"
                          onClick={() => {
                            setCorrectingReport(item.reportSnapshot!);
                            setCorrectionFeedback(
                              item.reportSnapshot!.tutorRemarks?.generalFeedback || ''
                            );
                          }}
                          className="px-2.5 py-1.5 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-[#991B1B] rounded-md inline-flex items-center gap-1 cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Reissue
                        </button>
                      )}

                      {item.reportSnapshot && onSelectReportForHistory && (
                        <button
                          type="button"
                          onClick={() => onSelectReportForHistory(item.reportSnapshot!)}
                          className="px-2 py-1.5 text-xs font-medium text-[#475569] dark:text-slate-300 hover:text-[#0F172A] border border-[#E2E8F0] dark:border-slate-700 rounded-md inline-flex items-center gap-1 cursor-pointer"
                          title="View Version History"
                        >
                          <History className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Record Inspection Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-slate-800 rounded-xl max-w-3xl w-full max-h-[88vh] overflow-y-auto p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#E2E8F0] dark:border-slate-800">
              <div>
                <div className="text-xs font-mono font-bold text-[#B91C1C]">
                  REF NO: {selectedItem.refNo}
                </div>
                <h4 className="text-lg font-bold text-[#0F172A] dark:text-white mt-0.5">
                  {selectedItem.title}
                </h4>
                <p className="text-xs text-[#64748B] dark:text-slate-400">
                  {selectedItem.recordTypeLabel} • {selectedItem.studentName} ({selectedItem.enrolmentLabel})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="p-1.5 text-[#64748B] hover:text-[#0F172A] dark:hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#F8FAFC] dark:bg-slate-900 p-3.5 rounded-lg border border-[#E2E8F0] dark:border-slate-800 text-xs">
              <div>
                <div className="text-[#64748B] dark:text-slate-400">Class / Track</div>
                <div className="font-semibold text-[#0F172A] dark:text-white mt-0.5">
                  {selectedItem.className}
                </div>
              </div>
              <div>
                <div className="text-[#64748B] dark:text-slate-400">Programme</div>
                <div className="font-semibold text-[#0F172A] dark:text-white mt-0.5">
                  {selectedItem.programName}
                </div>
              </div>
              <div>
                <div className="text-[#64748B] dark:text-slate-400">Score & Grade</div>
                <div className="font-bold tabular-nums text-[#0F172A] dark:text-white mt-0.5">
                  {selectedItem.scoreSummary}
                </div>
              </div>
              <div>
                <div className="text-[#64748B] dark:text-slate-400">Status & Version</div>
                <div className="font-semibold text-[#0F172A] dark:text-white mt-0.5">
                  {selectedItem.status} (v{selectedItem.version})
                </div>
              </div>
            </div>

            {selectedItem.reportSnapshot && (
              <div className="mt-5 space-y-4">
                <div>
                  <h5 className="text-xs font-bold uppercase tracking-wider text-[#475569] dark:text-slate-400 mb-2">
                    Calculation Audit & Category Breakdown (Profile:{' '}
                    {selectedItem.reportSnapshot.gradingProfileName} v
                    {selectedItem.reportSnapshot.gradingProfileVersion})
                  </h5>
                  <div className="border border-[#E2E8F0] dark:border-slate-800 rounded-lg overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#F8FAFC] dark:bg-slate-900 border-b border-[#E2E8F0] dark:border-slate-800 text-[#64748B]">
                        <tr>
                          <th className="py-2 px-3">Category</th>
                          <th className="py-2 px-3">Included Items</th>
                          <th className="py-2 px-3">Raw Marks</th>
                          <th className="py-2 px-3">Category %</th>
                          <th className="py-2 px-3">Effective Weight</th>
                          <th className="py-2 px-3">Weighted Contribution</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
                        {selectedItem.reportSnapshot.calculationBreakdown.categoryResults.map(
                          (cat) => (
                            <tr key={cat.categoryId}>
                              <td className="py-2 px-3 font-medium text-[#0F172A] dark:text-white">
                                {cat.categoryName}
                              </td>
                              <td className="py-2 px-3 tabular-nums">{cat.includedCount}</td>
                              <td className="py-2 px-3 tabular-nums">
                                {cat.rawEarnedTotal} / {cat.maxAvailableTotal}
                              </td>
                              <td className="py-2 px-3 tabular-nums font-semibold">
                                {cat.categoryPercentage !== null
                                  ? `${cat.categoryPercentage.toFixed(1)}%`
                                  : '—'}
                              </td>
                              <td className="py-2 px-3 tabular-nums">
                                {cat.effectiveWeight.toFixed(1)}%
                              </td>
                              <td className="py-2 px-3 tabular-nums font-bold text-[#0F172A] dark:text-white">
                                {cat.weightedContribution.toFixed(2)}%
                              </td>
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {selectedItem.reportSnapshot.tutorRemarks && (
                  <div className="p-3.5 rounded-lg bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-xs space-y-1">
                    <div className="font-bold text-amber-900 dark:text-amber-200">
                      Official Tutor Evaluation & Recommendation
                    </div>
                    <p className="text-amber-950 dark:text-amber-100">
                      {selectedItem.reportSnapshot.tutorRemarks.generalFeedback}
                    </p>
                    {selectedItem.reportSnapshot.tutorRemarks.nextStageRecommendation && (
                      <p className="text-amber-800 dark:text-amber-300 font-medium">
                        Next Stage: {selectedItem.reportSnapshot.tutorRemarks.nextStageRecommendation}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {selectedItem.rawAssessmentData && !selectedItem.reportSnapshot && (
              <div className="mt-5 space-y-2 text-xs">
                <div className="font-bold text-[#0F172A] dark:text-white">
                  Assessment Master Details
                </div>
                <p className="text-[#475569] dark:text-slate-300">
                  Total Questions:{' '}
                  {Array.isArray(selectedItem.rawAssessmentData.questions)
                    ? selectedItem.rawAssessmentData.questions.length
                    : 0}{' '}
                  • Work Type:{' '}
                  {selectedItem.rawAssessmentData.workType ||
                    selectedItem.rawAssessmentData.activityType ||
                    'EXAMINATION'}
                </p>
              </div>
            )}

            <div className="mt-6 pt-4 border-t border-[#E2E8F0] dark:border-slate-800 flex items-center justify-end gap-2">
              {(selectedItem.reportSnapshot ||
                selectedItem.recordType === 'ASSESSMENT_ATTEMPT_REPORT') && (
                <button
                  type="button"
                  onClick={() => handleDownloadPdf(selectedItem)}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-[#991B1B] rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  Download Official PDF ({selectedItem.refNo})
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="px-4 py-2 text-xs font-medium text-[#475569] dark:text-slate-300 border border-[#CBD5E1] dark:border-slate-700 rounded-lg cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reissue / Correction Modal */}
      {correctingReport && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <form
            onSubmit={handleIssueCorrection}
            className="bg-white dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-slate-800 rounded-xl max-w-lg w-full p-6 shadow-xl space-y-4"
          >
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-base font-bold text-[#0F172A] dark:text-white">
                  Issue Corrected Report Version (v{correctingReport.version + 1})
                </h4>
                <p className="text-xs text-[#64748B] dark:text-slate-400 mt-0.5">
                  Supersedes {correctingReport.reportRef} (v{correctingReport.version}) for{' '}
                  {correctingReport.studentName}. The historical snapshot will remain preserved in the audit trail.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCorrectingReport(null)}
                className="p-1 text-[#64748B] hover:text-[#0F172A]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                Mandatory Correction Reason *
              </label>
              <input
                type="text"
                required
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                placeholder="e.g. Late practical project graded and included in final calculation"
                className="w-full px-3 py-2 text-xs bg-[#F8FAFC] dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded-lg text-[#0F172A] dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0F172A] dark:text-slate-200 mb-1">
                Updated Tutor Summary Evaluation
              </label>
              <textarea
                rows={3}
                value={correctionFeedback}
                onChange={(e) => setCorrectionFeedback(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-[#F8FAFC] dark:bg-slate-900 border border-[#CBD5E1] dark:border-slate-700 rounded-lg text-[#0F172A] dark:text-white"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCorrectingReport(null)}
                className="px-3.5 py-2 text-xs font-medium text-[#475569] border border-[#CBD5E1] rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingCorrection || !correctionReason.trim()}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-[#991B1B] rounded-lg disabled:opacity-50 cursor-pointer"
              >
                {submittingCorrection
                  ? 'Recalculating & Reissuing...'
                  : `Recalculate & Issue v${correctingReport.version + 1}`}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
