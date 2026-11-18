import React, { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { usePWAInstall } from '../../utils/pwa';
import { Tooltip } from './Tooltip';

interface PWAInstallButtonProps {
  variant?: 'portal-auth' | 'sidebar';
  expanded?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'portal-auth',
  expanded = true,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (!isInstallable && !isIOS) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
    } else if (isIOS) {
      setShowIOSGuide(true);
    }
  };

  const iosModal = showIOSGuide && (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Install Portal App on iOS"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl text-left">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Install Jaystarbliss Portal
          </h3>
          <button
            type="button"
            onClick={() => setShowIOSGuide(false)}
            aria-label="Close instructions"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed space-y-2">
          <span className="block">
            1. Tap the <Share size={13} className="inline-block mx-0.5 text-blue-600" />{' '}
            <strong>Share</strong> button in your Safari toolbar.
          </span>
          <span className="block">
            2. Scroll down and tap <strong>Add to Home Screen</strong> to launch directly into the Portal.
          </span>
        </p>
        <button
          type="button"
          onClick={() => setShowIOSGuide(false)}
          className="mt-5 w-full rounded-xl bg-blue-600 hover:bg-blue-700 py-2.5 text-xs font-bold text-white transition-colors cursor-pointer"
        >
          Got it
        </button>
      </div>
    </div>
  );

  if (variant === 'sidebar') {
    return (
      <>
        <Tooltip content="Install Portal App" placement="right">
          <button
            type="button"
            onClick={handleClick}
            className={`w-full flex items-center h-10 shrink-0 px-3 rounded-xl hover:bg-[#E8F0FF] dark:hover:bg-white/10 text-[#2563EB] dark:text-blue-400 text-xs font-semibold overflow-hidden transition-colors cursor-pointer ${
              !expanded ? 'justify-center px-0' : ''
            }`}
          >
            <span className="w-8 h-8 flex items-center justify-center shrink-0">
              <Download size={17} />
            </span>
            {expanded && <span className="pl-2 whitespace-nowrap truncate">Install Portal App</span>}
          </button>
        </Tooltip>
        {iosModal}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="w-full mt-2.5 inline-flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-semibold transition-all cursor-pointer"
      >
        <Download size={14} className="shrink-0 text-sky-300" />
        <span>Install Portal App</span>
      </button>
      {iosModal}
    </>
  );
};

export default PWAInstallButton;
