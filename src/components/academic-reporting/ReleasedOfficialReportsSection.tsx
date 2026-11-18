import React, { useEffect, useState } from 'react';
import { FileText, Download, Archive, Eye, X, ShieldCheck } from 'lucide-react';
import {
  type AcademicPerformanceReportSnapshot,
  downloadBulkOfficialReportsZip,
  fetchAcademicReports,
  generateOfficialPerformanceReportPdf,
  getReportTypeLabel,
  resolveReportAuthorityContext,
} from '../../lib/academic-reporting';

interface ReleasedOfficialReportsSectionProps {
  viewerRole: 'SCHOOL_ADMIN' | 'PARENT' | 'STUDENT';
  schoolId?: string;
  studentId?: string;
  title?: string;
  subtitle?: string;
}

export const ReleasedOfficialReportsSection: React.FC<ReleasedOfficialReportsSectionProps> = ({
  viewerRole,
  schoolId,
  studentId,
  title = 'Official Released Academic Performance Reports',
  subtitle = 'Verified End-of-Term, End-of-Session, End-of-Programme, and Annual Academic Reports officially issued by Jaystarbliss Dynamic Institute.',
}) => {
  const [reports, setReports] = useState<AcademicPerformanceReportSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState<AcademicPerformanceReportSnapshot | null>(
    null
  );
  const [downloadingZip, setDownloadingZip] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const authCtx = await resolveReportAuthorityContext(viewerRole);
        const list = await fetchAcademicReports({
          includeDraftsAndSuperseded: false,
          schoolId,
          studentId,
          authority: authCtx,
        });
        if (mounted) {
          setReports(list.filter((r) => r.status === 'ISSUED'));
        }
      } catch {
        if (mounted) setReports([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [viewerRole, schoolId, studentId]);

  const handleBulkZip = async () => {
    if (reports.length === 0) return;
    setDownloadingZip(true);
    try {
      await downloadBulkOfficialReportsZip(reports, 'Released_Official_Academic_Reports');
    } finally {
      setDownloadingZip(false);
    }
  };

  return (
    <div className="bg-white dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-slate-800 rounded-xl p-5 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-[#E2E8F0] dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#B91C1C]" />
            <h3 className="text-base font-bold text-[#0F172A] dark:text-white tracking-tight">
              {title}
            </h3>
          </div>
          <p className="text-xs text-[#64748B] dark:text-slate-400 mt-0.5">{subtitle}</p>
        </div>

        {viewerRole === 'SCHOOL_ADMIN' && reports.length > 1 && (
          <button
            type="button"
            onClick={handleBulkZip}
            disabled={downloadingZip}
            className="px-3.5 py-2 text-xs font-semibold text-white bg-[#1E293B] hover:bg-[#0F172A] rounded-lg inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
          >
            <Archive className="w-3.5 h-3.5" />
            {downloadingZip ? 'Packaging ZIP...' : `Download All (${reports.length} PDFs)`}
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-8 text-center text-xs text-[#64748B] dark:text-slate-400">
          Loading officially released academic reports...
        </div>
      ) : reports.length === 0 ? (
        <div className="mt-4 p-6 text-center bg-[#F8FAFC] dark:bg-slate-900/40 rounded-lg border border-[#E2E8F0] dark:border-slate-800">
          <FileText className="w-6 h-6 text-[#64748B] mx-auto mb-2" />
          <p className="text-sm font-semibold text-[#0F172A] dark:text-white">
            No Official Performance Reports Released Yet
          </p>
          <p className="text-xs text-[#64748B] dark:text-slate-400 mt-1 max-w-md mx-auto">
            End-of-Term, End-of-Session, End-of-Programme, and End-of-Year reports appear here automatically once calculated, reviewed, and officially issued by Jaystarbliss Academic Administration or your assigned Tutor.
          </p>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#E2E8F0] dark:border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-[#64748B] dark:text-slate-400">
                <th className="py-2.5 px-3">Ref No</th>
                <th className="py-2.5 px-3">Report Type</th>
                <th className="py-2.5 px-3">Learner</th>
                <th className="py-2.5 px-3">Class / Programme</th>
                <th className="py-2.5 px-3">Academic Period</th>
                <th className="py-2.5 px-3">Overall Score & Grade</th>
                <th className="py-2.5 px-3">Release Date</th>
                <th className="py-2.5 px-3 text-right">Official Document</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0] dark:divide-slate-800 text-xs">
              {reports.map((rpt) => (
                <tr
                  key={rpt.id}
                  className="hover:bg-[#F8FAFC] dark:hover:bg-slate-900/50 transition-colors"
                >
                  <td className="py-3 px-3 font-mono font-semibold text-[#0F172A] dark:text-white whitespace-nowrap">
                    {rpt.reportRef}
                    {rpt.version > 1 && (
                      <span className="ml-1 text-[10px] text-[#B91C1C]">v{rpt.version}</span>
                    )}
                  </td>
                  <td className="py-3 px-3 font-semibold text-[#0F172A] dark:text-white">
                    {getReportTypeLabel(rpt.reportType)}
                  </td>
                  <td className="py-3 px-3 font-medium text-[#0F172A] dark:text-slate-200">
                    {rpt.studentName}
                  </td>
                  <td className="py-3 px-3 text-[#475569] dark:text-slate-300">
                    <div>{rpt.className}</div>
                    <div className="text-[11px] text-[#64748B]">{rpt.programName}</div>
                  </td>
                  <td className="py-3 px-3 text-[#0F172A] dark:text-slate-200">
                    {rpt.periodLabel}
                  </td>
                  <td className="py-3 px-3 font-bold tabular-nums text-[#0F172A] dark:text-white">
                    {rpt.overallPercentage !== null
                      ? `${rpt.overallPercentage.toFixed(1)}% (Grade ${rpt.overallGrade} • ${rpt.classification})`
                      : 'Incomplete'}
                  </td>
                  <td className="py-3 px-3 tabular-nums text-[#64748B] dark:text-slate-400">
                    {(rpt.issuedAt || rpt.generatedAt).slice(0, 10)}
                  </td>
                  <td className="py-3 px-3 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedReport(rpt)}
                        className="px-2.5 py-1.5 text-xs font-medium text-[#0F172A] dark:text-slate-200 bg-[#F8FAFC] dark:bg-slate-800 border border-[#CBD5E1] dark:border-slate-700 rounded-md inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        View
                      </button>
                      <button
                        type="button"
                        onClick={() => generateOfficialPerformanceReportPdf(rpt)}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-[#991B1B] rounded-md inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download PDF
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedReport && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0F172A] border border-[#E2E8F0] dark:border-slate-800 rounded-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#E2E8F0] dark:border-slate-800">
              <div>
                <div className="text-xs font-mono font-bold text-[#B91C1C]">
                  REF NO: {selectedReport.reportRef}
                </div>
                <h4 className="text-base font-bold text-[#0F172A] dark:text-white mt-0.5">
                  {getReportTypeLabel(selectedReport.reportType)}
                </h4>
                <p className="text-xs text-[#64748B] dark:text-slate-400">
                  {selectedReport.studentName} • {selectedReport.periodLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReport(null)}
                className="p-1 text-[#64748B] hover:text-[#0F172A]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3 bg-[#F8FAFC] dark:bg-slate-900 p-3.5 rounded-lg border border-[#E2E8F0] dark:border-slate-800 text-xs">
              <div>
                <div className="text-[#64748B]">Overall Score</div>
                <div className="text-base font-bold tabular-nums text-[#0F172A] dark:text-white mt-0.5">
                  {selectedReport.overallPercentage !== null
                    ? `${selectedReport.overallPercentage.toFixed(1)}%`
                    : '—'}
                </div>
              </div>
              <div>
                <div className="text-[#64748B]">Grade & Standing</div>
                <div className="text-base font-bold text-[#0F172A] dark:text-white mt-0.5">
                  {selectedReport.overallGrade} ({selectedReport.classification})
                </div>
              </div>
              <div>
                <div className="text-[#64748B]">Attendance</div>
                <div className="text-base font-bold tabular-nums text-[#0F172A] dark:text-white mt-0.5">
                  {selectedReport.attendanceSummary.attendanceRate !== null
                    ? `${selectedReport.attendanceSummary.attendanceRate.toFixed(0)}%`
                    : '—'}
                </div>
              </div>
            </div>

            <div className="mt-4">
              <div className="text-xs font-bold uppercase tracking-wider text-[#64748B] mb-2">
                Category Performance Summary
              </div>
              <div className="border border-[#E2E8F0] dark:border-slate-800 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F8FAFC] dark:bg-slate-900 border-b border-[#E2E8F0] dark:border-slate-800 text-[#64748B]">
                    <tr>
                      <th className="py-2 px-3">Category</th>
                      <th className="py-2 px-3">Score %</th>
                      <th className="py-2 px-3">Weight</th>
                      <th className="py-2 px-3">Contribution</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0] dark:divide-slate-800">
                    {selectedReport.calculationBreakdown.categoryResults.map((c) => (
                      <tr key={c.categoryId}>
                        <td className="py-2 px-3 font-medium text-[#0F172A] dark:text-white">
                          {c.categoryName}
                        </td>
                        <td className="py-2 px-3 tabular-nums">
                          {c.categoryPercentage !== null ? `${c.categoryPercentage.toFixed(1)}%` : '—'}
                        </td>
                        <td className="py-2 px-3 tabular-nums">{c.effectiveWeight.toFixed(1)}%</td>
                        <td className="py-2 px-3 tabular-nums font-bold">
                          {c.weightedContribution.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {selectedReport.tutorRemarks && (
              <div className="mt-4 p-3.5 rounded-lg bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-xs space-y-1">
                <div className="font-bold text-amber-900 dark:text-amber-200">
                  Official Tutor Remarks & Recommendation
                </div>
                <p className="text-amber-950 dark:text-amber-100">
                  {selectedReport.tutorRemarks.generalFeedback}
                </p>
                {selectedReport.tutorRemarks.nextStageRecommendation && (
                  <p className="text-amber-800 dark:text-amber-300 font-medium">
                    Recommendation: {selectedReport.tutorRemarks.nextStageRecommendation}
                  </p>
                )}
              </div>
            )}

            <div className="mt-5 pt-4 border-t border-[#E2E8F0] dark:border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => generateOfficialPerformanceReportPdf(selectedReport)}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#B91C1C] hover:bg-[#991B1B] rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Download Official PDF ({selectedReport.reportRef})
              </button>
              <button
                type="button"
                onClick={() => setSelectedReport(null)}
                className="px-4 py-2 text-xs font-medium text-[#475569] border border-[#CBD5E1] rounded-lg cursor-pointer"
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
