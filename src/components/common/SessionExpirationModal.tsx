import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Clock, ShieldAlert, LogOut, RefreshCw, CheckCircle2 } from 'lucide-react';

interface SessionExpirationModalProps {
  isOpen: boolean;
  secondsRemaining: number;
  totalWarningSeconds?: number;
  onExtend: () => void;
  onLogout: () => void;
  userRole?: string;
  userName?: string;
}

export const SessionExpirationModal: React.FC<SessionExpirationModalProps> = ({
  isOpen,
  secondsRemaining,
  totalWarningSeconds = 120,
  onExtend,
  onLogout,
  userRole,
  userName
}) => {
  const [isExtending, setIsExtending] = useState(false);

  // Format seconds into MM:SS
  const formatTime = (secs: number) => {
    const clamped = Math.max(0, secs);
    const m = Math.floor(clamped / 60);
    const s = clamped % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Progress percentage (100% at start of warning, 0% at 0s)
  const progressPercent = Math.max(0, Math.min(100, (secondsRemaining / totalWarningSeconds) * 100));

  // Determine urgency color
  const isUrgent = secondsRemaining <= 30;

  // Handle Extend Click
  const handleExtendClick = () => {
    setIsExtending(true);
    setTimeout(() => {
      onExtend();
      setIsExtending(false);
    }, 150);
  };

  // Keyboard shortcut: pressing Enter or Space extends session
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onExtend();
      } else if (e.key === 'Escape') {
        onExtend();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onExtend]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div 
          id="session-expiration-modal-container"
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="session-modal-title"
        >
          {/* Backdrop with frosted glass */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-slate-950/75 backdrop-blur-md"
          />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 15 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="relative w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-gray-200/90 dark:border-slate-800 shadow-2xl overflow-hidden z-10"
          >
            {/* Top Accent Strip with dynamic progress */}
            <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800">
              <div 
                className={`h-full transition-all duration-1000 ease-linear ${
                  isUrgent ? 'bg-[#B91C1C] animate-pulse' : 'bg-[#1E293B] dark:bg-white'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="p-6 sm:p-8 text-center space-y-6">
              {/* Animated Icon & Timer Ring */}
              <div className="relative mx-auto w-24 h-24 flex items-center justify-center">
                {/* SVG Progress Ring */}
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    className="stroke-slate-100 dark:stroke-slate-800"
                    strokeWidth="6"
                    fill="transparent"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    className={`transition-all duration-1000 ease-linear ${
                      isUrgent ? 'stroke-[#B91C1C]' : 'stroke-[#1E293B] dark:stroke-white'
                    }`}
                    strokeWidth="6"
                    strokeDasharray={264}
                    strokeDashoffset={264 - (264 * progressPercent) / 100}
                    strokeLinecap="round"
                    fill="transparent"
                  />
                </svg>

                {/* Center Content */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <Clock className={`w-5 h-5 mb-0.5 ${isUrgent ? 'text-[#B91C1C] animate-bounce' : 'text-[#B91C1C] dark:text-red-400'}`} />
                  <span className={`text-sm font-black font-mono tracking-tight tabular-nums ${isUrgent ? 'text-[#B91C1C]' : 'text-slate-900 dark:text-white'}`}>
                    {formatTime(secondsRemaining)}
                  </span>
                </div>
              </div>

              {/* Text Header & Warning details */}
              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-[#B91C1C] dark:text-red-400">
                  <ShieldAlert size={13} />
                  <span>Session Inactivity Notice</span>
                </div>

                <h3 
                  id="session-modal-title"
                  className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight"
                >
                  Are you still there{userName ? `, ${userName}` : ''}?
                </h3>

                <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-xs mx-auto">
                  For your institutional account security, you will be automatically logged out in{' '}
                  <span className="font-bold text-[#B91C1C] dark:text-red-400 underline decoration-[#B91C1C]/30 tabular-nums">
                    {formatTime(secondsRemaining)}
                  </span>{' '}
                  due to inactivity.
                </p>

                {userRole && (
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">
                    Active Profile: <span className="font-semibold text-slate-600 dark:text-slate-400 uppercase">{userRole}</span>
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="space-y-2.5 pt-2">
                <button
                  id="btn-extend-session"
                  type="button"
                  onClick={handleExtendClick}
                  disabled={isExtending}
                  className="w-full py-3.5 px-5 rounded-2xl bg-[#B91C1C] hover:bg-red-800 active:scale-[0.99] text-white text-sm font-black tracking-wide shadow-lg shadow-red-900/15 transition-all flex items-center justify-center gap-2 focus:outline-none focus:ring-4 focus:ring-red-500/20"
                >
                  {isExtending ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      <span>Extending Session...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      <span>Stay Signed In (Extend Session)</span>
                    </>
                  )}
                </button>

                <button
                  id="btn-logout-session"
                  type="button"
                  onClick={onLogout}
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-1.5 focus:outline-none"
                >
                  <LogOut size={14} />
                  <span>Sign Out Now</span>
                </button>
              </div>

              <div className="text-[10px] text-gray-400 dark:text-slate-500">
                Tip: Press <kbd className="px-1.5 py-0.5 text-[9px] font-mono bg-gray-100 dark:bg-slate-800 rounded-sm border border-gray-200 dark:border-slate-700">Enter</kbd> or click Stay Signed In to resume work immediately.
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default SessionExpirationModal;
