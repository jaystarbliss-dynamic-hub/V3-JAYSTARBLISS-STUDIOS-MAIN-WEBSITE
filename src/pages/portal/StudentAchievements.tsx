import React from 'react';
import SEO from '../../components/ui/SEO';
import { AchievementBadgeGrid } from '../../components/ecosystem/AchievementBadge';
import { Award } from 'lucide-react';

const StudentAchievements: React.FC = () => {
  const studentName = sessionStorage.getItem('userName') || 'Student';
  return (
    <div className="space-y-6">
      <SEO title="Achievements & Mastery Badges | Jaystarbliss Studios" description="View your earned achievement and mastery badges." noindex />
      <AchievementBadgeGrid studentName={studentName} title="My Achievement & Mastery Badges" subtitle="Earn verifiable badges as you complete milestones and projects." />
    </div>
  );
};
export default StudentAchievements;
