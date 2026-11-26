import React from 'react';
import { X, ExternalLink, ShieldCheck, FileText, AlertTriangle, Code2 } from 'lucide-react';
import { CODING_LAB_CONFIG } from '../../config/codingLabConfig';

interface CodingLabComplianceModalProps {
  open: boolean;
  onClose: () => void;
}

export const CodingLabComplianceModal: React.FC<CodingLabComplianceModalProps> = ({
  open,
  onClose,
}) => {
  if (!open) return null;

  const { compliance } = CODING_LAB_CONFIG;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="coding-lab-about-title"
    >
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-slate-900 dark:bg-slate-800 text-white flex items-center justify-center">
              <Code2 size={18} />
            </div>
            <div>
              <h2
                id="coding-lab-about-title"
                className="text-base font-bold text-slate-900 dark:text-white"
              >
                About Coding Lab &amp; Open-Source Attributions
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Jaystarbliss Dynamic Institute • Open-Source Licence &amp; Trademark Notice
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close attributions dialog"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          {/* Required Independent Product Notice */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-2">
            <p className="font-semibold text-slate-900 dark:text-white">
              {compliance.independentProductNotice}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {compliance.requiredScratchAttribution}
            </p>
          </div>

          {/* Upstream Source & Revision */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60">
              <div className="font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[10px] mb-1">
                Upstream Repository
              </div>
              <a
                href={compliance.upstreamRepositoryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 font-medium break-all"
              >
                scratchfoundation/scratch-editor
                <ExternalLink size={12} />
              </a>
            </div>
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60">
              <div className="font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[10px] mb-1">
                Pinned Revision
              </div>
              <div className="font-mono text-slate-900 dark:text-slate-100 break-all">
                v{compliance.upstreamVersion} • {compliance.upstreamCommitHash.slice(0, 12)}
              </div>
            </div>
          </div>

          {/* Licence & Modifications Links */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Licence &amp; Modification Documentation
            </h3>
            <div className="flex flex-wrap gap-2">
              <a
                href={compliance.licenseTextUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 transition-colors"
              >
                <ShieldCheck size={14} className="text-emerald-600" />
                AGPL-3.0 Licence Text
                <ExternalLink size={11} />
              </a>
              <a
                href={compliance.modificationsRecordUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 transition-colors"
              >
                <FileText size={14} className="text-blue-600" />
                Record of Editor Modifications
                <ExternalLink size={11} />
              </a>
              <a
                href={compliance.mediaLicensesUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 transition-colors"
              >
                <FileText size={14} className="text-amber-600" />
                Media &amp; Dependency Licences
                <ExternalLink size={11} />
              </a>
            </div>
          </div>

          {/* Corresponding Modified Source Offer (AGPL-3.0 Section 13) */}
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              Modified Editor Corresponding Source (AGPL-3.0 §13)
            </div>
            {compliance.modifiedSourceDistributionUrl ? (
              <p className="text-xs">
                The corresponding modified Scratch editor source code is publicly available at:{' '}
                <a
                  href={compliance.modifiedSourceDistributionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 font-medium break-all"
                >
                  {compliance.modifiedSourceDistributionUrl}
                  <ExternalLink size={11} />
                </a>
              </p>
            ) : (
              <div className="flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-lg p-3">
                <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Pre-release compliance requirement:</span>{' '}
                  All modified editor source files are tracked in{' '}
                  <code className="font-mono">vendor/coding-lab-scratch/</code>, but a public
                  source-code download URL (<code className="font-mono">VITE_CODING_LAB_SOURCE_REPO_URL</code>)
                  has not yet been configured for public network distribution under AGPL-3.0 Section 13.
                </div>
              </div>
            )}
          </div>

          <div className="text-xs text-slate-500 dark:text-slate-400">
            Audio Policy: Microphone recording and custom audio uploads are disabled in Coding Lab.
            Approved built-in library sounds are self-hosted directly by this application without
            runtime requests to external Scratch servers.
          </div>
        </div>

        <div className="px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 flex justify-end bg-slate-50/60 dark:bg-slate-900">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold hover:opacity-90 transition-opacity"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
