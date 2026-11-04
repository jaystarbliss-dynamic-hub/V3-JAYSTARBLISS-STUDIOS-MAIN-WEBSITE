import React from 'react';
import { CalendarDays } from 'lucide-react';

interface WorkspaceDashboardIntroProps {
  name: string;
  role: string;
}

const ROLE_DESCRIPTIONS: Record<string, { label: string; description: string }> = {
  student: {
    label: 'Student workspace',
    description: 'Pick up where you left off, keep track of your learning, and stay on top of what is coming next.',
  },
  parent: {
    label: 'Parent workspace',
    description: 'Keep an eye on your children’s learning, schedules, progress, and important account updates.',
  },
  staff: {
    label: 'Tutor & staff workspace',
    description: 'Plan lessons, support your assigned learners, and keep teaching tasks moving.',
  },
  school: {
    label: 'School workspace',
    description: 'Manage your school’s learning activity, learner records, schedules, and assessment progress.',
  },
};

const WorkspaceDashboardIntro: React.FC<WorkspaceDashboardIntroProps> = ({ name, role }) => {
  const details = ROLE_DESCRIPTIONS[role] || {
    label: 'Jaystarbliss workspace',
    description: 'Your workspace, tools, and latest activity in one place.',
  };
  const firstName = name.trim().split(/\s+/)[0] || 'there';
  const today = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date());

  return (
    <section className="workspace-dashboard-intro" aria-labelledby="workspace-dashboard-title">
      <div className="min-w-0">
        <p className="workspace-dashboard-intro__eyebrow">{details.label}</p>
        <h1 id="workspace-dashboard-title" className="workspace-dashboard-intro__title">
          Welcome back, {firstName}.
        </h1>
        <p className="workspace-dashboard-intro__description">{details.description}</p>
      </div>

      <div className="workspace-dashboard-intro__date" aria-label={`Today, ${today}`}>
        <span className="workspace-dashboard-intro__date-icon" aria-hidden="true">
          <CalendarDays size={18} />
        </span>
        <span>
          <span className="workspace-dashboard-intro__date-label">Today</span>
          <span className="workspace-dashboard-intro__date-value">{today}</span>
        </span>
      </div>
    </section>
  );
};

export default WorkspaceDashboardIntro;
