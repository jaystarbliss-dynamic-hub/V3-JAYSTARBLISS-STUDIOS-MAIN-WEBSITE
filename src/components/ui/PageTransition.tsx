import React from 'react';

interface PageTransitionProps {
  children: React.ReactNode;
  className?: string;
}

export const PageTransition: React.FC<PageTransitionProps> = ({ children, className = '' }) => {
  return (
    <div className={`w-full min-h-full flex-1 opacity-100 transition-opacity duration-200 ${className}`}>
      {children}
    </div>
  );
};

export default PageTransition;
