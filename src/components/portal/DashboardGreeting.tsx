import React from 'react';

interface DashboardGreetingProps {
  name?: string;
  role: string;
  subtitle?: string;
  action?: React.ReactNode;
}

/**
 * Compact action slot for dashboard pages.
 * Greeting banners, role badges, explanatory subtitles, and date labels have been
 * removed so the standardised sticky route header serves as the single page title.
 */
export const DashboardGreeting: React.FC<DashboardGreetingProps> = ({ action }) => {
  if (!action) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2.5">
      {action}
    </div>
  );
};

export default DashboardGreeting;
