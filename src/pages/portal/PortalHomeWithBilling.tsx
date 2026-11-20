import React from 'react';
import ParentDashboard from './ParentDashboard';
import StaffDashboard from './StaffDashboard';
import StudentDashboard from './StudentDashboard';
import SchoolDashboard from './SchoolDashboard';
import ParentLearningTracks from '../../components/portal/ParentLearningTracks';
import EdClubLaunchBanner from '../../components/portal/EdClubLaunchBanner';
import { useSubscriptionEntitlement } from '../../contexts/SubscriptionEntitlementContext';
import { PortalLockdownView } from '../../components/portal/PortalLockdownView';

const PortalHomeWithBilling: React.FC<{ role: 'student' | 'parent' | 'staff' | 'school' }> = ({ role }) => {
  const { entitlement } = useSubscriptionEntitlement();

  // Locked students see the full-screen lockdown view without mounting academic widgets or Ed Club
  if (role === 'student' && entitlement?.isLocked) {
    return <PortalLockdownView entitlement={entitlement} />;
  }

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

  const hideParentTracks = role === 'parent' && Boolean(entitlement?.isLocked && entitlement?.allChildrenLocked);

  return (
    <div className="space-y-8">
      {dashboard}
      {role === 'parent' && !hideParentTracks && <ParentLearningTracks />}
      {role === 'student' && !entitlement?.isLocked && (
        <EdClubLaunchBanner studentName={studentName} studentClass={studentClass} schoolId={schoolId} />
      )}
    </div>
  );
};

export default PortalHomeWithBilling;
