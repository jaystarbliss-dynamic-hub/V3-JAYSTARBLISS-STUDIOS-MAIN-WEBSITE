import React from 'react';

export const PaystackLogo: React.FC<{ className?: string }> = ({ className = 'h-6' }) => (
  <span className={`inline-flex items-center gap-2 select-none ${className}`} aria-label="Paystack">
    <svg
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="h-full w-auto shrink-0"
      aria-hidden="true"
    >
      <rect x="2" y="3" width="24" height="3.8" rx="1.6" fill="#00C3F7" />
      <rect x="2" y="9.2" width="24" height="3.8" rx="1.6" fill="#00C3F7" />
      <rect x="2" y="15.4" width="24" height="3.8" rx="1.6" fill="#00C3F7" />
      <rect x="2" y="21.6" width="13.5" height="3.8" rx="1.6" fill="#00C3F7" />
    </svg>
    <span className="font-extrabold tracking-tight text-lg text-[#011B33] dark:text-white leading-none">
      paystack
    </span>
  </span>
);

export const FlutterwaveLogo: React.FC<{ className?: string }> = ({ className = 'h-6' }) => (
  <span className={`inline-flex items-center gap-2 select-none ${className}`} aria-label="Flutterwave">
    <svg
      viewBox="0 0 32 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="h-full w-auto shrink-0"
      aria-hidden="true"
    >
      <path
        d="M16.4 13.8C12.2 6.8 6.5 3.1 3.1 4.8C-0.3 6.5 1.8 14.3 6.8 17.6C10.5 20.1 14.2 18.6 16.4 13.8Z"
        fill="#F5A623"
      />
      <path
        d="M15.6 14.4C19.8 7.2 25.4 3.4 28.8 5.1C32.1 6.8 29.8 14.7 24.8 18.1C21.1 20.6 17.6 19.0 15.6 14.4Z"
        fill="#2B9E6D"
      />
      <path
        d="M16.1 14.3C13.6 18.7 13.5 23.8 16.3 24.6C19.1 25.4 22.1 21.8 20.8 17.5C19.9 14.6 17.6 13.6 16.1 14.3Z"
        fill="#F26B3A"
      />
      <path
        d="M15.7 14.2C18.3 18.5 17.4 23.6 14.4 24.4C11.4 25.2 8.7 21.6 10.3 17.4C11.4 14.4 14.1 13.4 15.7 14.2Z"
        fill="#35A1F2"
      />
    </svg>
    <span className="font-extrabold tracking-tight text-lg text-[#0B1E3C] dark:text-zinc-200 leading-none">
      flutterwave
    </span>
  </span>
);

export const StripeLogo: React.FC<{ className?: string }> = ({ className = 'h-6' }) => (
  <span className={`inline-flex items-center select-none ${className}`} aria-label="Stripe">
    <svg
      viewBox="0 0 76 30"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="h-full w-auto"
      aria-hidden="true"
    >
      <text
        x="0"
        y="23"
        fill="currentColor"
        className="text-[#635BFF] dark:text-zinc-300"
        style={{
          fontFamily: "'Inter', 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif",
          fontWeight: 900,
          fontSize: '25px',
          letterSpacing: '-0.05em',
        }}
      >
        stripe
      </text>
    </svg>
  </span>
);
