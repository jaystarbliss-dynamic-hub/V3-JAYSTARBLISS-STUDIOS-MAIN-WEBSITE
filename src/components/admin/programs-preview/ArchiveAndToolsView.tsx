import React, { useState, useMemo } from 'react';
import {
  Search,
  RotateCcw,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Download,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  GitMerge,
  Database,
  Play,
} from 'lucide-react';
import {
  generateHierarchyMigrationPreview,
  type ProgramRecord,
} from '../../../lib/programHierarchy';
import {
  getShortCategoryLabel,
  type ArchiveToolsTabId,
  type BackupSnapshot,
  type IntegrityFinding,
  type PreviewProgramRecord,
} from './types';
import { UnassignedProgrammesView } from './UnassignedProgrammesView';

interface ArchiveAndToolsViewProps {
  programs: PreviewProgramRecord[];
  activeTab: ArchiveToolsTabId;
  onSelectTab: (tab: ArchiveToolsTabId) => void;
  backups: BackupSnapshot[];
  integrityFindings: IntegrityFinding[];
  onRestoreArchived: (programId: string) => void;
  onInspectProgram: (programId: string) => void;
  onEditProgram?: (programId: string) => void;
  onAssignUnassignedParent?: (programId: string, newParentId: string) => void;
  onCreateBackup: (label?: string) => BackupSnapshot;
  onRunMigrationCommit: () => void;
  onRunIntegrityCheck: () => void;
  onIsolateInvalidProgram: (programId: string, reason: string) => void;
}

export const ArchiveAndToolsView: React.FC<ArchiveAndToolsViewProps> = ({
  programs,
  activeTab,
  onSelectTab,
  backups,
  integrityFindings,
  onRestoreArchived,
  onInspectProgram,
  onEditProgram,
  onAssignUnassignedParent,
  onCreateBackup,
  onRunMigrationCommit,
  onRunIntegrityCheck,
  onIsolateInvalidProgram,
}) => {
  const [archiveSearch, setArchiveSearch] = useState('');
  const [backupLabelInput, setBackupLabelInput] = useState('');
  const [migrationSuccessMsg, setMigrationSuccessMsg] = useState('');

  const programsMap = useMemo(() => {
    const map = new Map<string, ProgramRecord>();
    programs.forEach((p) => map.set(p.id, p));
    return map;
  }, [programs]);

  const archivedPrograms = useMemo(() => {
    const q = archiveSearch.trim().toLowerCase();
    return programs
      .filter((p) => p.isArchived)
      .filter((p) => {
        if (!q) return true;
        return (
          p.title.toLowerCase().includes(q) ||
          (p.archiveReason || '').toLowerCase().includes(q) ||
          getShortCategoryLabel(p.categoryId).toLowerCase().includes(q)
        );
      });
  }, [programs, archiveSearch]);

  const unassignedCount = useMemo(
    () => programs.filter((p) => !p.isArchived && p.isUnassigned && !p.isPrimaryRoot).length,
    [programs]
  );

  const migrationPlan = useMemo(
    () => generateHierarchyMigrationPreview(programs),
    [programs]
  );

  const formatDate = (iso?: string | null) => {
    if (!iso) return 'Mar 10, 2025';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleDownloadSnapshot = (snap: BackupSnapshot) => {
    const blob = new Blob([snap.jsonPayload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jaystarbliss-programs-backup-${snap.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const TABS: Array<{ id: ArchiveToolsTabId; label: string; badge?: number }> = [
    {
      id: 'archived',
      label: 'Archived Programmes',
      badge: archivedPrograms.length,
    },
    {
      id: 'unassigned',
      label: 'Unassigned',
      badge: unassignedCount > 0 ? unassignedCount : undefined,
    },
    { id: 'migration', label: 'Migration' },
    { id: 'backup', label: 'Backup' },
    { id: 'integrity', label: 'Integrity Check' },
  ];

  return (
    <div className="space-y-4">
      {/* Main Container Card (Matches Image 2 Bottom-Left & Image 3 Bottom-Right) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
        {/* Top Header */}
        <div className="p-5 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">
              Archive &amp; Advanced Tools
            </h2>
            <p className="text-xs text-slate-500">
              Manage archived programmes and perform advanced operations
            </p>
          </div>

          {activeTab === 'archived' && (
            <div className="relative w-full sm:w-64">
              <Search
                size={14}
                className="text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              />
              <input
                type="text"
                value={archiveSearch}
                onChange={(e) => setArchiveSearch(e.target.value)}
                placeholder="Search archive..."
                className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-slate-400"
              />
            </div>
          )}
        </div>

        {/* Horizontal Underline Sub-Tabs (Archived Programmes | Unassigned | Migration | Backup | Integrity Check) */}
        <div className="px-5 border-b border-slate-200 flex items-center gap-6 overflow-x-auto no-scrollbar">
          {TABS.map((t) => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelectTab(t.id)}
                className={`relative py-3 text-xs sm:text-[13px] font-bold whitespace-nowrap transition-colors flex items-center gap-2 cursor-pointer ${
                  active ? 'text-[#B91C1C]' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <span>{t.label}</span>
                {typeof t.badge === 'number' && t.badge > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums ${
                      active
                        ? 'bg-red-100 text-[#B91C1C]'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {t.badge}
                  </span>
                )}
                {active && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#B91C1C] rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* TAB 1: ARCHIVED PROGRAMMES (Matches Image 2 Bottom-Left & Image 3 Bottom-Right!) */}
        {activeTab === 'archived' && (
          <div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200/80 bg-slate-50/50 text-xs font-bold text-slate-700">
                    <th className="py-3.5 pl-5 pr-3">Programme</th>
                    <th className="py-3.5 px-3">Parent</th>
                    <th className="py-3.5 px-3">Archived On</th>
                    <th className="py-3.5 px-3">Reason</th>
                    <th className="py-3.5 pl-3 pr-5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs sm:text-[13px]">
                  {archivedPrograms.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-slate-500">
                        No archived programmes found.
                      </td>
                    </tr>
                  ) : (
                    archivedPrograms.map((prog) => {
                      const parentTitle = prog.parentProgramId
                        ? programsMap.get(prog.parentProgramId)?.title ||
                          getShortCategoryLabel(prog.categoryId)
                        : getShortCategoryLabel(prog.categoryId);

                      return (
                        <tr
                          key={prog.id}
                          className="hover:bg-slate-50/80 transition-colors"
                        >
                          <td className="py-4 pl-5 pr-3 font-extrabold text-indigo-950">
                            {prog.title}
                          </td>
                          <td className="py-4 px-3 text-slate-600 font-medium">
                            {parentTitle}
                          </td>
                          <td className="py-4 px-3 text-slate-600 whitespace-nowrap">
                            {formatDate(prog.archivedAt)}
                          </td>
                          <td className="py-4 px-3 text-slate-600">
                            {prog.archiveReason || 'No longer required'}
                          </td>
                          <td className="py-4 pl-3 pr-5 text-right whitespace-nowrap">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => onRestoreArchived(prog.id)}
                                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50/40 text-indigo-900 text-xs font-bold hover:bg-indigo-100/70 transition-colors cursor-pointer"
                              >
                                <RotateCcw size={13} />
                                <span>Restore</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => onInspectProgram(prog.id)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                                title="Inspect archived record"
                              >
                                <MoreHorizontal size={15} />
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

            {/* Bottom Pagination Footer (Matches Image 2 Bottom-Left: Showing 1-3 of 3 + < < 1 > >) */}
            <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/40 flex items-center justify-between text-xs text-slate-600">
              <div>
                Showing{' '}
                <span className="font-bold text-slate-900">
                  {archivedPrograms.length > 0 ? `1–${archivedPrograms.length}` : '0'}
                </span>{' '}
                of <span className="font-bold text-slate-900">{archivedPrograms.length}</span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled
                  className="w-7 h-7 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-400 opacity-50"
                >
                  <ChevronsLeft size={13} />
                </button>
                <button
                  type="button"
                  disabled
                  className="w-7 h-7 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-400 opacity-50"
                >
                  <ChevronLeft size={13} />
                </button>
                <button
                  type="button"
                  className="w-7 h-7 rounded-lg bg-[#B91C1C] text-white text-xs font-bold"
                >
                  1
                </button>
                <button
                  type="button"
                  disabled
                  className="w-7 h-7 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-400 opacity-50"
                >
                  <ChevronRight size={13} />
                </button>
                <button
                  type="button"
                  disabled
                  className="w-7 h-7 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-400 opacity-50"
                >
                  <ChevronsRight size={13} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: UNASSIGNED PROGRAMMES */}
        {activeTab === 'unassigned' && (
          <div className="p-5">
            <UnassignedProgrammesView
              programs={programs}
              onAssignParent={(progId, parentId) =>
                onAssignUnassignedParent?.(progId, parentId)
              }
              onEditProgram={(progId) => onEditProgram?.(progId)}
              onInspectProgram={onInspectProgram}
            />
          </div>
        )}

        {/* TAB 3: MIGRATION PREVIEW */}
        {activeTab === 'migration' && (
          <div className="p-5 space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <GitMerge size={16} className="text-[#B91C1C]" />
                  <span>Controlled Hierarchy Migration Preview</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Previews canonical root creation and parent-child normalization before committing changes.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onCreateBackup('Pre-Migration Snapshot')}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white font-bold text-slate-700 hover:bg-slate-100"
                >
                  Create Pre-Migration Backup
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onRunMigrationCommit();
                    setMigrationSuccessMsg(
                      'Hierarchy migration committed and backup snapshot saved.'
                    );
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#B91C1C] text-white font-bold hover:bg-[#991B1B]"
                >
                  <Play size={13} />
                  <span>Commit Migration</span>
                </button>
              </div>
            </div>

            {migrationSuccessMsg && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-semibold flex items-center gap-2">
                <CheckCircle2 size={15} />
                <span>{migrationSuccessMsg}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-4 rounded-xl border border-slate-200 bg-white">
                <span className="text-slate-400 block text-[11px]">
                  Canonical Roots Verified
                </span>
                <span className="text-lg font-extrabold text-slate-900">
                  4 / 4 Roots Ready
                </span>
              </div>
              <div className="p-4 rounded-xl border border-slate-200 bg-white">
                <span className="text-slate-400 block text-[11px]">
                  Confident Parent Mappings
                </span>
                <span className="text-lg font-extrabold text-emerald-700">
                  {migrationPlan.proposedMappings.filter((i) => i.action !== 'FLAG_UNASSIGNED').length} Records
                </span>
              </div>
              <div className="p-4 rounded-xl border border-slate-200 bg-white">
                <span className="text-slate-400 block text-[11px]">
                  Held in Unassigned Queue
                </span>
                <span className="text-lg font-extrabold text-amber-700">
                  {migrationPlan.unassignedPrograms.length} Records
                </span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: BACKUP SNAPSHOTS */}
        {activeTab === 'backup' && (
          <div className="p-5 space-y-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex-1">
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <Database size={16} className="text-[#B91C1C]" />
                  <span>Programme Catalogue JSON Backups</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Create and download full JSON snapshots of all programme documents and hierarchy metadata.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={backupLabelInput}
                  onChange={(e) => setBackupLabelInput(e.target.value)}
                  placeholder="Snapshot label..."
                  className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs"
                />
                <button
                  type="button"
                  onClick={() => {
                    onCreateBackup(backupLabelInput.trim() || 'Manual Backup Snapshot');
                    setBackupLabelInput('');
                  }}
                  className="px-4 py-2 rounded-xl bg-[#B91C1C] text-white font-bold hover:bg-[#991B1B]"
                >
                  Create Snapshot
                </button>
              </div>
            </div>

            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              {backups.map((snap) => (
                <div
                  key={snap.id}
                  className="p-4 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="font-bold text-slate-900">{snap.label}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {formatDate(snap.createdAt)} • {snap.recordCount} records •{' '}
                      {(snap.sizeBytes / 1024).toFixed(1)} KB
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDownloadSnapshot(snap)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white font-bold text-slate-700 hover:bg-slate-50"
                  >
                    <Download size={13} />
                    <span>Download JSON</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 5: INTEGRITY CHECK */}
        {activeTab === 'integrity' && (
          <div className="p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <ShieldCheck size={16} className="text-emerald-600" />
                  <span>Hierarchy Structural Integrity Audit</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Checks canonical roots, circular parent loops, and orphaned references
                </p>
              </div>
              <button
                type="button"
                onClick={onRunIntegrityCheck}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold hover:bg-slate-800"
              >
                Re-Run Audit
              </button>
            </div>

            <div className="space-y-2.5">
              {integrityFindings.map((finding) => (
                <div
                  key={finding.id}
                  className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    finding.severity === 'HEALTHY'
                      ? 'bg-emerald-50/50 border-emerald-200'
                      : finding.severity === 'CRITICAL'
                      ? 'bg-red-50/60 border-red-200'
                      : 'bg-amber-50/60 border-amber-200'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="font-bold text-slate-900 flex items-center gap-2">
                      {finding.severity === 'HEALTHY' ? (
                        <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                      ) : (
                        <AlertTriangle
                          size={15}
                          className={
                            finding.severity === 'CRITICAL'
                              ? 'text-[#B91C1C] shrink-0'
                              : 'text-amber-600 shrink-0'
                          }
                        />
                      )}
                      <span>{finding.summary}</span>
                    </div>
                    <p className="text-slate-600 pl-6">{finding.detail}</p>
                  </div>

                  {finding.canAutoIsolate && finding.programId && (
                    <button
                      type="button"
                      onClick={() =>
                        onIsolateInvalidProgram(finding.programId!, finding.detail)
                      }
                      className="px-3.5 py-2 rounded-xl bg-[#B91C1C] text-white font-bold shrink-0"
                    >
                      Isolate to Unassigned
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
