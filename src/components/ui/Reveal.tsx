import React from 'react';

interface RevealProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  y?: number;
}

/** Renders content immediately visible with smooth layout stability across all iframe/viewport environments. */
export const Reveal: React.FC<RevealProps> = ({ children, className = '' }) => (
  <div className={className}>
    {children}
  </div>
);

interface StaggerProps {
  children: React.ReactNode;
  className?: string;
  staggerDelay?: number;
}

/** Wraps a grid/list of cards without trapping children at opacity 0 when IntersectionObserver is throttled in iframes. */
export const StaggerGroup: React.FC<StaggerProps> = ({ children, className = '' }) => (
  <div className={className}>
    {children}
  </div>
);
