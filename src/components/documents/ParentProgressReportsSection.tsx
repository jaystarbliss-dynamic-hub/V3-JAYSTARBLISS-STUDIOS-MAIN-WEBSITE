import React, { useEffect, useState } from 'react';
import { FileText, Eye, FileDown, Calendar, UserCheck } from 'lucide-react';
import {
  listSentTutorProgressReportsForParent,
  type TutorProgressReportRecord,
} from '../../lib/documents/tutorProgressReportsService';
import {
  exportStudioDocumentAsPdf,
  type OfficialStudioExportInput,
} from '../../lib/documents/documentExporter';
import { FullPagePreviewModal } from './FullPagePreviewModal';

interface ParentProgressReportsSectionProps {
  parentUid: string;
  parentEmail: string;
  linkedStudentIds: string[];
}

export const ParentProgressReportsSection: React.FC<ParentProgressReportsSectionProps> = ({
  parentUid,
  parentEmail,
  linkedStudentIds,
}) => {
  const [reports, setReports] = useState<TutorProgressReportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewDoc, setPreviewDoc] = useState<OfficialStudioExportInput | null>(null);

  const studentIdsKey = linkedStudentIds.slice().sort().join(',');

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!parentUid && !parentEmail && linkedStudentIds.length === 0) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const list = await listSentTutorProgressReportsForParent(
          parentUid,
          parentEmail,
          linkedStudentIds
        );
        if (active) setReports(list);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [parentUid, parentEmail, studentIdsKey]);

  const toExportPayload = (rep: TutorProgressReportRecord): OfficialStudioExportInput => ({
    id: rep.id,
    title: rep.title,
    category: 'PERFORMANCE_REPORT',
    contentHtml: rep.contentHtml,
    versionNumber: rep.versionNumber,
    status: 'ISSUED',
    authorName: rep.tutorName,
    recipientName: rep.parentName || rep.parentEmail || 'Parent / Guardian',
    studentName: rep.studentName,
    studentClass: rep.studentClass,
    programmeName: rep.programmeName,
    schoolName: rep.schoolName,
    reportingPeriod: rep.reportingPeriod,
  });

  if (loading && reports.length === 0) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#111114] p-5 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/40 text-[#991B1B] dark:text-red-400 flex items-center justify-center shrink-0">
            <FileText size={19} />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Tutor Progress Reports
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              Official individualized progress updates shared by your child&rsquo;s tutors
            </p>
          </div>
        </div>
        <span className="text-xs font-semibold text-slate-500 dark:text-zinc-400 tabular-nums">
          {reports.length} Report{reports.length === 1 ? '' : 's'}
        </span>
      </div>

      {reports.length === 0 ? (
        <div className="p-5 rounded-xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200/80 dark:border-zinc-800 text-xs text-slate-500 dark:text-zinc-400">
          No individualized tutor progress updates have been issued yet. When your child&rsquo;s
          tutor sends a manual progress report, it will appear here alongside official termly
          reports.
        </div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-zinc-800 border border-slate-200/80 dark:border-zinc-800 rounded-xl overflow-hidden">
          {reports.map((rep) => (
            <div
              key={rep.id}
              className="p-4 bg-white dark:bg-[#111114] hover:bg-slate-50/70 dark:hover:bg-zinc-900/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {rep.title}
                  </p>
                  <span className="text-[11px] font-semibold text-[#991B1B] dark:text-red-400">
                    · {rep.studentName}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-zinc-400">
                  <span className="inline-flex items-center gap-1">
                    <UserCheck size={12} />
                    {rep.tutorName}
                  </span>
                  {rep.reportingPeriod && <span>{rep.reportingPeriod}</span>}
                  {rep.sentAt && (
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Calendar size={12} />
                      {new Date(rep.sentAt).toLocaleDateString('en-GB', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  )}
                  {rep.versionNumber > 1 && (
                    <span className="tabular-nums font-medium">Updated (v{rep.versionNumber})</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setPreviewDoc(toExportPayload(rep))}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800 text-xs font-semibold text-slate-700 dark:text-zinc-200 inline-flex items-center gap-1.5"
                >
                  <Eye size={13} />
                  <span>Read Report</span>
                </button>
                <button
                  type="button"
                  onClick={() => void exportStudioDocumentAsPdf(toExportPayload(rep))}
                  className="px-3 py-1.5 rounded-lg bg-[#991B1B] hover:bg-[#7F1D1D] text-white text-xs font-bold inline-flex items-center gap-1.5"
                >
                  <FileDown size={13} />
                  <span>PDF</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {previewDoc && (
        <FullPagePreviewModal
          isOpen={Boolean(previewDoc)}
          onClose={() => setPreviewDoc(null)}
          documentData={previewDoc}
        />
      )}
    </section>
  );
};

export default ParentProgressReportsSection;
