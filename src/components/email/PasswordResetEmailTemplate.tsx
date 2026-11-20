import React from 'react';
import { Lock, ShieldCheck, ExternalLink, Mail, Clock, ArrowRight } from 'lucide-react';

export interface PasswordResetEmailProps {
  recipientName?: string;
  recipientEmail: string;
  resetUrl: string;
  expiresIn?: string;
  logoUrl?: string;
  websiteUrl?: string;
  portalUrl?: string;
  supportEmail?: string;
  supportWhatsapp?: string;
}

/**
 * Reusable React component template for Password Reset Emails.
 * Designed with Tailwind CSS following Jaystarbliss Studios design system.
 */
export const PasswordResetEmailTemplate: React.FC<PasswordResetEmailProps> = ({
  recipientName = 'Member',
  recipientEmail,
  resetUrl,
  expiresIn = '1 Hour (Single Use)',
  logoUrl = 'https://jaystarblissstudios.com/logo.png',
  websiteUrl = 'https://jaystarblissstudios.com',
  portalUrl = 'https://jaystarblissstudios.com/portal',
  supportEmail = 'jaystarblissstudios@gmail.com',
  supportWhatsapp = '+234 707 763 8925'
}) => {
  return (
    <div className="w-full max-w-[600px] mx-auto bg-slate-100 dark:bg-slate-950 p-4 sm:p-8 font-sans text-slate-800 dark:text-slate-200">
      {/* Main Email Card */}
      <div className="w-full bg-white dark:bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800">
        
        {/* Brand Header Banner */}
        <div className="bg-gradient-to-r from-[#090d16] via-[#111827] to-[#1e293b] p-6 sm:p-8 border-b-4 border-rose-600 text-left">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/10 p-1 border border-white/20 shadow-inner shrink-0 overflow-hidden flex items-center justify-center">
              <img
                src={logoUrl}
                alt="Jaystarbliss Studios Logo"
                className="w-full h-full object-contain rounded-xl"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/logo.png';
                }}
              />
            </div>
            <div>
              <div className="text-[10px] sm:text-xs font-black tracking-[0.2em] text-rose-400 uppercase">
                Jaystarbliss Studios & Academy
              </div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight mt-0.5">
                Password Reset Request
              </h1>
            </div>
          </div>
        </div>

        {/* Email Body Content */}
        <div className="p-6 sm:p-8 space-y-6">
          <div className="space-y-3">
            <p className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              Hello {recipientName},
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              We received an official request to reset the password for your Jaystarbliss account associated with{' '}
              <strong className="text-slate-900 dark:text-white font-bold">{recipientEmail}</strong>.
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              To proceed securely, click the button below to choose a new password. For your security, this link can only be used once:
            </p>
          </div>

          {/* Primary Action Button */}
          <div className="py-2 text-center">
            <a
              href={resetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-rose-600 via-rose-500 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-black text-sm tracking-wide shadow-lg shadow-rose-600/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Lock size={16} className="text-rose-100" />
              <span>Reset Your Password</span>
              <ArrowRight size={16} className="text-rose-100" />
            </a>
          </div>

          {/* Security & Authentication Breakdown Card */}
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70 overflow-hidden text-xs">
            <div className="bg-slate-900 dark:bg-black/50 px-4 py-2.5 flex items-center gap-2 text-white font-bold tracking-wider uppercase text-[11px]">
              <ShieldCheck size={14} className="text-emerald-400" />
              <span>Security & Session Information</span>
            </div>
            <div className="divide-y divide-slate-200 dark:divide-slate-700/60 p-1">
              <div className="flex justify-between items-center py-2 px-3">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Target Account</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{recipientEmail}</span>
              </div>
              <div className="flex justify-between items-center py-2 px-3">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Validity Window</span>
                <span className="font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                  <Clock size={12} />
                  {expiresIn}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 px-3">
                <span className="text-slate-500 dark:text-slate-400 font-medium">Origin Authority</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">Jaystarbliss Portal Auth</span>
              </div>
            </div>
          </div>

          {/* Fallback Direct URL Box */}
          <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800/40 border border-dashed border-slate-300 dark:border-slate-700 space-y-1.5">
            <p className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
              Having trouble with the button? Copy and paste this URL into your browser:
            </p>
            <div className="font-mono text-[10px] text-slate-500 dark:text-slate-400 break-all select-all leading-relaxed bg-white dark:bg-slate-900/80 p-2 rounded-lg border border-slate-200 dark:border-slate-800">
              {resetUrl}
            </div>
          </div>

          {/* Ignore Notice */}
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed border-t border-slate-200 dark:border-slate-800 pt-4">
            <strong className="text-slate-700 dark:text-slate-300">Didn't make this request?</strong> You can safely disregard this email. Your password remains unchanged and your account is secure.
          </p>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 dark:bg-slate-950 p-6 sm:p-8 text-center border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
            Jaystarbliss Studios • Tech Education & Creative Innovation
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Lagos, Nigeria • Direct Phone / WhatsApp: <a href={`https://wa.me/${supportWhatsapp.replace(/[^0-9]/g, '')}`} className="text-rose-600 dark:text-rose-400 font-semibold underline">{supportWhatsapp}</a>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-semibold text-rose-600 dark:text-rose-400 pt-1">
            <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-1">
              <span>Official Website</span>
              <ExternalLink size={10} />
            </a>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <a href={portalUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
              Student & School Portal
            </a>
            <span className="text-slate-300 dark:text-slate-700">•</span>
            <a href={`mailto:${supportEmail}`} className="hover:underline flex items-center gap-1">
              <Mail size={11} />
              <span>Support Desk</span>
            </a>
          </div>
          <div className="text-[10px] text-slate-400 dark:text-slate-500 pt-2">
            &copy; {new Date().getFullYear()} Jaystarbliss Studios. All rights reserved.
          </div>
        </div>

      </div>
    </div>
  );
};

export default PasswordResetEmailTemplate;
