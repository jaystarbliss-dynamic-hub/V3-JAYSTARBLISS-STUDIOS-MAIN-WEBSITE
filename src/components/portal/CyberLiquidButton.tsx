import React from 'react';

interface CyberLiquidButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  children: React.ReactNode;
  variant?: 'red' | 'gold';
}

export const CyberLiquidButton: React.FC<CyberLiquidButtonProps> = ({
  loading = false,
  children,
  className = '',
  disabled,
  ...props
}) => {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`group relative w-full rounded-xl bg-[#B91C1C] hover:bg-[#991B1B] active:bg-[#7F1D1D] text-white border border-white/25 shadow-md transition-colors duration-150 disabled:opacity-55 disabled:cursor-not-allowed cursor-pointer ${className}`}
    >
      <div className="relative z-10 flex items-center justify-center gap-2.5 py-3.5 px-6 font-mono text-[0.78rem] font-extrabold uppercase tracking-[0.14em] text-white">
        {loading && (
          <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
        )}
        <span className="tracking-[0.16em]">
          {children}
        </span>
      </div>
    </button>
  );
};

export default CyberLiquidButton;
