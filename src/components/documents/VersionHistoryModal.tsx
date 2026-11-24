import React, { useState } from 'react';
import { X, History, RotateCcw, Clock } from 'lucide-react';
import {
  sanitizeDocumentHtml,
  type DocumentVersionSnapshot,
} from '../../lib/documents/documentTemplates';

interface VersionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  versions: DocumentVersionSnapshot[];
  onRestoreVersion: (snapshot: DocumentVersionSnapshot) => void;
}

export const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({
  isOpen,
  onClose,
  versions,
  onRestoreVersion,
}) => {
  const ordered = [...(versions || [])].sort((a, b) => b.versionNumber - a.versionNumber);
  const [selected, setSelected] = useState<DocumentVersionSnapshot | null>(ordered[0] || null);

  if (!isOpen) return null;

  const activeSnap = selected || ordered[0] || null;

  return (
    <div
      className="fixed inset-0 z-[80] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Document version history"
    >
      <div className="w-full max-w-4xl max-h-[85vh] rounded-2xl bg-white dark:bg-[#111114] border border-slate-200 dark:border-zinc-800 shadow-2xl flex flex-col overflow-hidden text-slate-900 dark:text-zinc-100">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-red-50 dark:bg-red-950/40 text-[#991B1B] dark:text-red-400 flex items-center justify-center">
              <History size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Document Version History
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400">
                Inspect saved snapshots or restore a previous version into the editor
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-zinc-800 overflow-hidden">
          {/* Version List */}
          <div className="overflow-y-auto p-3 space-y-2 bg-slate-50/70 dark:bg-[#0D0D10]">
            {ordered.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-zinc-400 p-4 text-center">
                No saved version snapshots yet. Save a draft or send the document to create one.
              </p>
            ) : (
              ordered.map((v) => {
                const isSelected = activeSnap?.versionNumber === v.versionNumber && activeSnap?.savedAt === v.savedAt;
                return (
                  <button
                    key={`${v.versionNumber}-${v.savedAt}`}
                    type="button"
                    onClick={() => setSelected(v)}
                    className={`w-full text-left p-3 rounded-xl border transition-colors ${
                      isSelected
                        ? 'border-[#991B1B] bg-white dark:bg-zinc-900'
                        : 'border-slate-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/50 hover:bg-white dark:hover:bg-zinc-900'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-900 dark:text-white tabular-nums">
                        Version v{v.versionNumber}
                      </span>
                      <span className="text-[10px] text-slate-500 dark:text-zinc-400 inline-flex items-center gap-1 tabular-nums">
                        <Clock size={10} />
                        {new Date(v.savedAt).toLocaleDateString('en-GB')}
                      </span>
                    </div>
                    <p className="text-[11px] font-medium text-slate-700 dark:text-zinc-300 mt-1 truncate">
                      {v.note || v.title}
                    </p>
                    <p className="text-[10px] text-slate-400 dark:text-zinc-500 mt-0.5 truncate">
                      By {v.savedByName} · {new Date(v.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </button>
                );
              })
            )}
          </div>

          {/* Snapshot Preview */}
          <div className="md:col-span-2 flex flex-col min-h-0 overflow-hidden">
            {activeSnap ? (
              <>
                <div className="px-5 py-3 border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {activeSnap.title} (v{activeSnap.versionNumber})
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400">
                      Saved by {activeSnap.savedByName} on {new Date(activeSnap.savedAt).toLocaleString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onRestoreVersion(activeSnap);
                      onClose();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-[#991B1B] hover:bg-[#7F1D1D] text-white text-xs font-bold inline-flex items-center gap-1.5 shrink-0"
                  >
                    <RotateCcw size={13} />
                    Restore Version
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 bg-white text-slate-900">
                  <div
                    className="text-sm leading-relaxed [&_h1]:text-lg [&_h1]:font-bold [&_h2]:text-sm [&_h2]:font-bold [&_h2]:text-[#991B1B] [&_h2]:mt-4 [&_p]:mb-2 [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-100 [&_th]:p-1.5 [&_td]:border [&_td]:border-slate-300 [&_td]:p-1.5 [&_ul]:list-disc [&_ul]:pl-5"
                    dangerouslySetInnerHTML={{ __html: sanitizeDocumentHtml(activeSnap.contentHtml) }}
                  />
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-xs text-slate-400">
                Select a version to inspect its content.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VersionHistoryModal;
