import React from 'react';
import ParentDashboard from './ParentDashboard';
import StaffDashboard from './StaffDashboard';
import StudentDashboard from './StudentDashboard';
import SchoolDashboard from './SchoolDashboard';
import ParentLearningTracks from '../../components/portal/ParentLearningTracks';
import EdClubLaunchBanner from '../../components/portal/EdClubLaunchBanner';
import WorkspaceDashboardIntro from '../../components/portal/WorkspaceDashboardIntro';

const PortalHomeWithBilling: React.FC<{ role: 'student' | 'parent' | 'staff' | 'school' }> = ({ role }) => {
  const dashboard = role === 'parent'
    ? <ParentDashboard />
    : role === 'staff'
      ? <StaffDashboard />
      : role === 'school'
        ? <SchoolDashboard initialTab="overview" />
        : <StudentDashboard />;

  const studentName = sessionStorage.getItem('studentName') || sessionStorage.getItem('userName') || 'Student';
  const studentClass = sessionStorage.getItem('studentClass') || '';
  const schoolId = sessionStorage.getItem('studentSchoolId') || sessionStorage.getItem('schoolId') || '';
  const workspaceName = role === 'student'
    ? studentName
    : role === 'school'
      ? sessionStorage.getItem('schoolName') || sessionStorage.getItem('institutionName') || sessionStorage.getItem('userName') || 'Partner School'
      : sessionStorage.getItem('userName') || (role === 'parent' ? 'Parent' : 'Tutor');

  return (
    <div className="space-y-8">
      <WorkspaceDashboardIntro name={workspaceName} role={role} />
      {dashboard}
      {role === 'parent' && <ParentLearningTracks />}
      {role === 'student' && <EdClubLaunchBanner studentName={studentName} studentClass={studentClass} schoolId={schoolId} />}
    </div>
  );
};

export default PortalHomeWithBilling;
