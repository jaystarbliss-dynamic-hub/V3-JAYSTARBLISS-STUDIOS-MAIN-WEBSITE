import React, { useEffect, useMemo, useState } from 'react';
import {
  FileText,
  Plus,
  Send,
  Edit3,
  Eye,
  FileDown,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Search,
  RefreshCw,
} from 'lucide-react';
import { auth } from '../../lib/firebase';
import { getEffectiveAuth } from '../../utils/impersonation';
import { useToast } from '../../contexts/ToastContext';
import {
  buildPerformanceReportTemplate,
  sanitizeDocumentHtml,
} from '../../lib/documents/documentTemplates';
import {
  exportStudioDocumentAsPdf,
  type OfficialStudioExportInput,
} from '../../lib/documents/documentExporter';
import {
  listTutorProgressReportsForTutor,
  saveTutorProgressReportDraft,
  sendTutorProgressReportToParent,
  type TutorProgressReportRecord,
} from '../../lib/documents/tutorProgressReportsService';
import { DocumentStudio } from './DocumentStudio';
import { FullPagePreviewModal } from './FullPagePreviewModal';

export interface AuthorizedLearnerOption {
  id: string;
  uid?: string;
  name: string;
  className?: string;
  programmeName?: string;
  schoolId?: string;
  schoolName?: string;
  parentId?: string;
  parentUid?: string;
  parentEmail?: string;
  parentName?: string;
}

interface TutorProgressReportsWorkspaceProps {
  learners: AuthorizedLearnerOption[];
  isAdmin?: boolean;
  defaultTutorName?: string;
  autoCreateTrigger?: number;
  onEditingChange?: (editing: boolean) => void;
}

export const TutorProgressReportsWorkspace: React.FC<TutorProgressReportsWorkspaceProps> = ({
  learners,
  isAdmin = false,
  defaultTutorName,
  autoCreateTrigger = 0,
  onEditingChange,
}) => {
  const { toast } = useToast();
  const currentUser = auth.currentUser;
  const effectiveAuth = getEffectiveAuth();
  const tutorUid =
    effectiveAuth.effectiveUid || currentUser?.uid || sessionStorage.getItem('userId') || '';
  const tutorName =
    defaultTutorName ||
    effectiveAuth.effectiveName ||
    currentUser?.displayName ||
    sessionStorage.getItem('userName') ||
    currentUser?.email ||
    'Faculty Tutor';

  const [reports, setReports] = useState<TutorProgressReportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DRAFT' | 'SENT'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Editor state
  const [editing, setEditing] = useState(false);
  const [activeReportId, setActiveReportId] = useState<string | undefined>(undefined);
  const [activeStatus, setActiveStatus] = useState<'DRAFT' | 'SENT'>('DRAFT');
  const [activeVersion, setActiveVersion] = useState<number>(1);
  const [activeVersions, setActiveVersions] = useState<TutorProgressReportRecord['versions']>([]);
  const [selectedLearnerId, setSelectedLearnerId] = useState<string>('');
  const [customStudentName, setCustomStudentName] = useState<string>('');
  const [customStudentClass, setCustomStudentClass] = useState<string>('');
  const [customSchoolOrProgramme, setCustomSchoolOrProgramme] = useState<string>('');
  const [customParentName, setCustomParentName] = useState<string>('');
  const [reportingPeriod, setReportingPeriod] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [contentHtml, setContentHtml] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [showSendConfirm, setShowSendConfirm] = useState(false);
  const [amendmentNote, setAmendmentNote] = useState('');

  // Preview state from list
  const [previewDoc, setPreviewDoc] = useState<OfficialStudioExportInput | null>(null);

  useEffect(() => {
    onEditingChange?.(editing);
  }, [editing, onEditingChange]);

  const loadReports = async () => {
    if (!tutorUid && !isAdmin) return;
    setLoading(true);
    try {
      const list = await listTutorProgressReportsForTutor(tutorUid, isAdmin);
      setReports(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadReports();
  }, [tutorUid, isAdmin]);

  const selectedLearner = useMemo(
    () => learners.find((l) => l.id === selectedLearnerId) || null,
    [learners, selectedLearnerId]
  );

  const filteredReports = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return reports.filter((r) => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (q) {
        const hay = `${r.title} ${r.studentName} ${r.schoolName || ''} ${r.programmeName || ''} ${
          r.reportingPeriod || ''
        }`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [reports, statusFilter, searchQuery]);

  const startNewReport = (preselectedLearner?: AuthorizedLearnerOption) => {
    const learner = preselectedLearner || learners[0] || null;
    setActiveReportId(undefined);
    setActiveStatus('DRAFT');
    setActiveVersion(1);
    setActiveVersions([]);
    setSelectedLearnerId(learner?.id || '__custom__');
    setCustomStudentName(learner?.name || '');
    setCustomStudentClass(learner?.className || '');
    setCustomSchoolOrProgramme(learner?.schoolName || learner?.programmeName || '');
    setCustomParentName(learner?.parentName || '');
    const period = `Performance Report — ${new Date().toLocaleDateString('en-GB', {
      month: 'long',
      year: 'numeric',
    })}`;
    setReportingPeriod(period);
    setTitle(
      learner
        ? `${learner.name} — Performance & Progress Report`
        : 'Student Performance & Progress Report'
    );
    setContentHtml(
      buildPerformanceReportTemplate({
        studentName: learner?.name,
        studentClass: learner?.className,
        programmeName: learner?.programmeName,
        schoolName: learner?.schoolName,
        tutorName,
        parentName: learner?.parentName,
        reportingPeriod: period,
      })
    );
    setAmendmentNote('');
    setEditing(true);
  };

  useEffect(() => {
    if (autoCreateTrigger > 0) {
      startNewReport();
    }
  }, [autoCreateTrigger]);

  const openExistingReport = (report: TutorProgressReportRecord) => {
    setActiveReportId(report.id);
    setActiveStatus(report.status);
    setActiveVersion(report.versionNumber || 1);
    setActiveVersions(report.versions || []);
    const matched = learners.find((l) => l.id === report.studentId);
    setSelectedLearnerId(matched ? report.studentId : '__custom__');
    setCustomStudentName(report.studentName || '');
    setCustomStudentClass(report.studentClass || '');
    setCustomSchoolOrProgramme(report.schoolName || report.programmeName || '');
    setCustomParentName(report.parentName || report.parentEmail || '');
    setReportingPeriod(report.reportingPeriod || '');
    setTitle(report.title || 'Student Progress Report');
    setContentHtml(sanitizeDocumentHtml(report.contentHtml || ''));
    setAmendmentNote('');
    setEditing(true);
  };

  const buildDraftPayload = (html: string, saveSnapshot = false) => {
    const fallbackReport = activeReportId
      ? reports.find((r) => r.id === activeReportId)
      : undefined;
    const isCustom = selectedLearnerId === '__custom__' || !selectedLearner;
    const studentName =
      (isCustom ? customStudentName.trim() : selectedLearner?.name) ||
      fallbackReport?.studentName ||
      'Learner';
    const effectiveStudentId =
      !isCustom && selectedLearnerId
        ? selectedLearnerId
        : fallbackReport?.studentId ||
          `custom_${studentName.toLowerCase().replace(/[^a-z0-9]+/g, '_') || 'learner'}`;
    return {
      id: activeReportId,
      title: title.trim() || `${studentName} — Performance Report`,
      studentId: effectiveStudentId,
      studentUid: selectedLearner?.uid || fallbackReport?.studentUid || '',
      studentName,
      studentClass:
        (isCustom ? customStudentClass.trim() : selectedLearner?.className) ||
        fallbackReport?.studentClass ||
        '',
      programmeName:
        (isCustom ? customSchoolOrProgramme.trim() : selectedLearner?.programmeName) ||
        fallbackReport?.programmeName ||
        '',
      schoolId: selectedLearner?.schoolId || fallbackReport?.schoolId || '',
      schoolName:
        (isCustom ? customSchoolOrProgramme.trim() : selectedLearner?.schoolName) ||
        fallbackReport?.schoolName ||
        '',
      parentId: selectedLearner?.parentId || fallbackReport?.parentId || '',
      parentUid: selectedLearner?.parentUid || fallbackReport?.parentUid || '',
      parentEmail: selectedLearner?.parentEmail || fallbackReport?.parentEmail || '',
      parentName:
        (isCustom ? customParentName.trim() : selectedLearner?.parentName) ||
        fallbackReport?.parentName ||
        '',
      tutorUid,
      tutorName,
      reportingPeriod: reportingPeriod.trim(),
      contentHtml: html,
      saveVersionSnapshot: saveSnapshot,
    };
  };

  const handleSaveDraft = async (html: string, silent = false) => {
    if (!silent) setSaving(true);
    try {
      const saved = await saveTutorProgressReportDraft(buildDraftPayload(html, !silent));
      setActiveReportId(saved.id);
      setActiveVersion(saved.versionNumber);
      setActiveVersions(saved.versions || []);
      setReports((prev) => {
        const exists = prev.some((r) => r.id === saved.id);
        return exists ? prev.map((r) => (r.id === saved.id ? saved : r)) : [saved, ...prev];
      });
      if (!silent) toast.success('Performance report draft saved.');
    } catch (err: any) {
      if (!silent) toast.error(err?.message || 'Unable to save performance report draft.');
    } finally {
      if (!silent) setSaving(false);
    }
  };

  const handleConfirmSendToParent = async () => {
    setSaving(true);
    try {
      const sent = await sendTutorProgressReportToParent({
        ...buildDraftPayload(contentHtml, false),
        amendmentNote: amendmentNote.trim() || undefined,
      });
      setActiveReportId(sent.id);
      setActiveStatus('SENT');
      setActiveVersion(sent.versionNumber);
      setActiveVersions(sent.versions || []);
      setShowSendConfirm(false);
      setAmendmentNote('');
      setReports((prev) => {
        const exists = prev.some((r) => r.id === sent.id);
        return exists ? prev.map((r) => (r.id === sent.id ? sent : r)) : [sent, ...prev];
      });
      toast.success(
        activeStatus === 'SENT'
          ? `Amended performance report (v${sent.versionNumber}) published & delivered.`
          : `Official performance report published & sent to ${sent.parentName || sent.parentEmail || 'recipient'}.`
      );
    } catch (err: any) {
      toast.error(err?.message || 'Unable to publish performance report.');
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    const activeRecord = activeReportId ? reports.find((r) => r.id === activeReportId) : null;
    const isCustom = selectedLearnerId === '__custom__' || !selectedLearner;
    const learnerDisplayName =
      (isCustom ? customStudentName.trim() : selectedLearner?.name) ||
      activeRecord?.studentName ||
      'Learner';
    const parentDisplay =
      (isCustom ? customParentName.trim() : selectedLearner?.parentName || selectedLearner?.parentEmail) ||
      activeRecord?.parentName ||
      activeRecord?.parentEmail ||
      'Parent / Guardian';

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-[#111114] border border-slate-200 dark:border-zinc-800 rounded-2xl px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                void loadReports();
              }}
              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-200 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft size={14} />
              Back to Academic Reporting
            </button>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                Official Performance Report Studio
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                {activeStatus === 'SENT'
                  ? 'Published report — saving changes & sending creates a versioned amendment'
                  : 'Full-page A4 document workspace — draft, preview, download PDF, or send to parent'}
              </p>
            </div>
          </div>
        </div>

        <DocumentStudio
          documentId={activeReportId}
          title={title}
          onTitleChange={setTitle}
          contentHtml={contentHtml}
          onContentChange={setContentHtml}
          category="PERFORMANCE_REPORT"
          allowedCategories={['PERFORMANCE_REPORT']}
          versionNumber={activeVersion}
          versions={activeVersions}
          statusLabel={activeStatus}
          authorName={tutorName}
          recipientName={parentDisplay}
          studentName={learnerDisplayName}
          studentClass={
            (isCustom ? customStudentClass : selectedLearner?.className) || activeRecord?.studentClass
          }
          programmeName={
            (isCustom ? customSchoolOrProgramme : selectedLearner?.programmeName) ||
            activeRecord?.programmeName
          }
          schoolName={
            (isCustom ? customSchoolOrProgramme : selectedLearner?.schoolName) ||
            activeRecord?.schoolName
          }
          reportingPeriod={reportingPeriod}
          isBusy={saving}
          onSaveDraft={(html) => handleSaveDraft(html, false)}
          onAutosave={
            activeStatus === 'DRAFT' ? (html) => handleSaveDraft(html, true) : undefined
          }
          onPrimarySubmit={async (html) => {
            setContentHtml(html);
            setShowSendConfirm(true);
          }}
          primarySubmitLabel={
            activeStatus === 'SENT' ? 'Publish Amended Report' : 'Publish & Send Report'
          }
          saveDraftLabel={activeStatus === 'SENT' ? 'Save Revision' : 'Save Draft'}
          headerSlot={
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">
                    Select Learner or Manual Entry
                  </label>
                  <select
                    value={selectedLearnerId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setSelectedLearnerId(nextId);
                      const found = learners.find((l) => l.id === nextId);
                      if (found) {
                        setCustomStudentName(found.name);
                        setCustomStudentClass(found.className || '');
                        setCustomSchoolOrProgramme(found.schoolName || found.programmeName || '');
                        setCustomParentName(found.parentName || found.parentEmail || '');
                        if (!title.trim() || title.includes('Performance & Progress Report')) {
                          setTitle(`${found.name} — Performance & Progress Report`);
                        }
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-[#991B1B]"
                  >
                    <option value="__custom__">-- Type Learner / Recipient Manually --</option>
                    {learners.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                        {l.className ? ` (${l.className})` : ''}
                        {l.schoolName ? ` — ${l.schoolName}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">
                    Reporting Period
                  </label>
                  <input
                    type="text"
                    value={reportingPeriod}
                    onChange={(e) => setReportingPeriod(e.target.value)}
                    placeholder="e.g. Term 2 Progress Report, Week 6"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#991B1B]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">
                    Parent / Guardian Recipient
                  </label>
                  <input
                    type="text"
                    value={isCustom ? customParentName : parentDisplay}
                    onChange={(e) => setCustomParentName(e.target.value)}
                    readOnly={!isCustom}
                    placeholder="Parent or Guardian name"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#991B1B]"
                  />
                </div>
              </div>

              {isCustom && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">
                      Learner Full Name *
                    </label>
                    <input
                      type="text"
                      value={customStudentName}
                      onChange={(e) => {
                        setCustomStudentName(e.target.value);
                        if (!activeReportId && e.target.value.trim()) {
                          setTitle(`${e.target.value.trim()} — Performance & Progress Report`);
                        }
                      }}
                      placeholder="Enter learner full name"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#991B1B]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">
                      Class / Grade Level
                    </label>
                    <input
                      type="text"
                      value={customStudentClass}
                      onChange={(e) => setCustomStudentClass(e.target.value)}
                      placeholder="e.g. Grade 5 / JSS 2"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#991B1B]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">
                      School or Programme Name
                    </label>
                    <input
                      type="text"
                      value={customSchoolOrProgramme}
                      onChange={(e) => setCustomSchoolOrProgramme(e.target.value)}
                      placeholder="e.g. Coding & Robotics Track"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#991B1B]"
                    />
                  </div>
                </div>
              )}
            </div>
          }
        />

        {/* Send Confirmation Modal */}
        {showSendConfirm && (
          <div
            className="fixed inset-0 z-[85] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
          >
            <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#111114] border border-slate-200 dark:border-zinc-800 shadow-2xl p-6 space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {activeStatus === 'SENT'
                    ? 'Send Amended Progress Report?'
                    : 'Send Official Progress Report to Parent?'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-zinc-400 mt-1">
                  Learner: <strong>{learnerDisplayName || 'Unselected'}</strong> · Recipient:{' '}
                  <strong>{parentDisplay}</strong>
                </p>
              </div>

              <p className="text-xs text-slate-600 dark:text-zinc-300 leading-relaxed">
                This will publish the report immediately to the parent&rsquo;s portal in the
                official Jaystarbliss A4 format, save an immutable version snapshot (v
                {activeStatus === 'SENT' ? activeVersion + 1 : activeVersion}), and trigger an
                in-portal &amp; email notification.
              </p>

              {activeStatus === 'SENT' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                    Amendment Note (recorded in version history)
                  </label>
                  <input
                    type="text"
                    value={amendmentNote}
                    onChange={(e) => setAmendmentNote(e.target.value)}
                    placeholder="e.g. Updated project feedback after lab showcase"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#991B1B]"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setShowSendConfirm(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 text-xs font-semibold text-slate-700 dark:text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleConfirmSendToParent()}
                  className="px-4 py-2 rounded-xl bg-[#991B1B] hover:bg-[#7F1D1D] text-white text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-60"
                >
                  <Send size={13} />
                  {saving ? 'Delivering...' : 'Confirm & Send'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-zinc-800">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Manual Tutor Progress Reports
          </h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            Compose rich, structured progress updates anytime outside termly cycles and deliver them
            directly to parents in official Jaystarbliss A4 format.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void loadReports()}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800"
            title="Refresh reports"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={() => startNewReport()}
            className="px-4 py-2.5 rounded-xl bg-[#991B1B] hover:bg-[#7F1D1D] text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
          >
            <Plus size={15} />
            Create Tutor Progress Report
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
          {(['ALL', 'DRAFT', 'SENT'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                statusFilter === tab
                  ? 'bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab === 'ALL' ? `All (${reports.length})` : tab === 'DRAFT' ? 'Drafts' : 'Sent to Parents'}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by learner, title, period..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-[#991B1B]"
          />
        </div>
      </div>

      {/* Reports Table */}
      {loading ? (
        <div className="py-12 text-center text-xs text-slate-500 dark:text-zinc-400">
          Loading progress reports...
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="p-10 rounded-2xl border-2 border-dashed border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#111114] text-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-red-50 dark:bg-red-950/40 text-[#991B1B] dark:text-red-400 flex items-center justify-center mx-auto">
            <FileText size={22} />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            No manual tutor progress reports yet
          </h3>
          <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-md mx-auto">
            Use the Official A4 Document Studio to draft personalized progress updates with tables,
            skill observations, and action plans, then send directly to parents.
          </p>
          <button
            type="button"
            onClick={() => startNewReport()}
            className="px-4 py-2 rounded-xl bg-[#991B1B] hover:bg-[#7F1D1D] text-white text-xs font-bold inline-flex items-center gap-1.5"
          >
            <Plus size={14} /> Create First Progress Report
          </button>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#111114] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-900/70 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                  <th className="py-3 px-4">Report Title &amp; Period</th>
                  <th className="py-3 px-4">Learner</th>
                  <th className="py-3 px-4">Status &amp; Version</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                {filteredReports.map((rep) => (
                  <tr
                    key={rep.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-zinc-900/60 transition-colors"
                  >
                    <td className="py-3.5 px-4">
                      <p className="font-bold text-slate-900 dark:text-white">{rep.title}</p>
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                        {rep.reportingPeriod || 'Ad-hoc Progress Update'}
                      </p>
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-slate-800 dark:text-zinc-200">
                        {rep.studentName}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                        {[rep.studentClass, rep.schoolName].filter(Boolean).join(' · ') || 'JDI Learner'}
                      </p>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {rep.status === 'SENT' ? (
                          <CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Clock size={13} className="text-amber-600 dark:text-amber-400" />
                        )}
                        <span
                          className={`font-bold uppercase text-[11px] ${
                            rep.status === 'SENT'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {rep.status === 'SENT' ? 'Sent' : 'Draft'}
                        </span>
                        <span className="text-slate-400 dark:text-zinc-500 tabular-nums">
                          · v{rep.versionNumber || 1}
                        </span>
                      </div>
                      {rep.sentAt && (
                        <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5 tabular-nums">
                          {new Date(rep.sentAt).toLocaleDateString('en-GB')}
                        </p>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openExistingReport(rep)}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200 font-semibold inline-flex items-center gap-1"
                        >
                          <Edit3 size={12} />
                          <span>{rep.status === 'SENT' ? 'Amend' : 'Edit'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewDoc({
                              id: rep.id,
                              title: rep.title,
                              category: 'PERFORMANCE_REPORT',
                              contentHtml: rep.contentHtml,
                              versionNumber: rep.versionNumber,
                              status: rep.status,
                              authorName: rep.tutorName,
                              recipientName: rep.parentName || rep.parentEmail,
                              studentName: rep.studentName,
                              studentClass: rep.studentClass,
                              programmeName: rep.programmeName,
                              schoolName: rep.schoolName,
                              reportingPeriod: rep.reportingPeriod,
                            })
                          }
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300"
                          title="Preview Official A4"
                        >
                          <Eye size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void exportStudioDocumentAsPdf({
                              id: rep.id,
                              title: rep.title,
                              category: 'PERFORMANCE_REPORT',
                              contentHtml: rep.contentHtml,
                              versionNumber: rep.versionNumber,
                              status: rep.status,
                              authorName: rep.tutorName,
                              recipientName: rep.parentName || rep.parentEmail,
                              studentName: rep.studentName,
                              studentClass: rep.studentClass,
                              programmeName: rep.programmeName,
                              schoolName: rep.schoolName,
                              reportingPeriod: rep.reportingPeriod,
                            })
                          }
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-zinc-700 hover:bg-slate-100 dark:hover:bg-zinc-800 text-[#991B1B] dark:text-red-400"
                          title="Download Official PDF"
                        >
                          <FileDown size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {previewDoc && (
        <FullPagePreviewModal
          isOpen={Boolean(previewDoc)}
          onClose={() => setPreviewDoc(null)}
          documentData={previewDoc}
        />
      )}
    </div>
  );
};

export default TutorProgressReportsWorkspace;
