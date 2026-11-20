export const PORTAL_TOUR_VERSION = 'v1';

export type PortalTourRole = 'student' | 'parent' | 'school' | 'staff';

export interface PortalTourStep {
  id: string;
  targetId: string;
  title: string;
  body: string;
  routeHint?: string;
}

export interface BuildPortalTourOptions {
  role: PortalTourRole;
  studentOriginType?: 'individual' | 'school' | 'parent';
  canAccessStudentBilling?: boolean;
}

export function buildPortalTourSteps(options: BuildPortalTourOptions): PortalTourStep[] {
  const { role, studentOriginType = 'individual', canAccessStudentBilling = false } = options;

  if (role === 'student') {
    const isParentChild = studentOriginType === 'parent';
    const isSchoolStudent = studentOriginType === 'school';

    const steps: PortalTourStep[] = [
      {
        id: 'student-dashboard',
        targetId: 'nav-dashboard',
        title: 'Your Learning Dashboard',
        body: 'Track upcoming live sessions, recent progress, and announcements at a glance every time you sign in.',
      },
      {
        id: 'student-courses',
        targetId: 'nav-courses',
        title: isParentChild ? 'My Learning Tracks' : 'Learning Tracks & Programme Discovery',
        body: isParentChild
          ? 'Open My Learning Tracks to review your assigned curriculum modules and track completion.'
          : isSchoolStudent
          ? 'View your school-assigned learning tracks and switch to Explore Programmes to apply for optional self-funded studio tracks.'
          : 'Review your active learning tracks and switch to Explore Programmes whenever you want to apply for additional courses.',
      },
      {
        id: 'student-assessments',
        targetId: 'nav-assessments',
        title: 'Assessments, Activities & Tests',
        body: 'Complete assignments, timed assessments, and practical milestones right from your workspace.',
      },
      {
        id: 'student-resources',
        targetId: 'nav-resources',
        title: 'Lesson Resources & Materials',
        body: 'Download study notes, project files, and reference guides curated by your instructors.',
      },
    ];

    if (canAccessStudentBilling && !isParentChild) {
      steps.push({
        id: 'student-payments',
        targetId: 'nav-payments',
        title: 'Personal Payments & Receipts',
        body: isSchoolStudent
          ? 'Manage tuition only for your approved self-funded programmes. Your school-sponsored tracks remain completely separate.'
          : 'Review approved tuition fees, settle payments securely via Paystack, and download verified receipts.',
      });
    }

    steps.push({
      id: 'student-support',
      targetId: 'nav-support',
      title: 'Need Help Anytime?',
      body: 'Check notifications in the top bar or reach the academy support desk whenever you need guidance.',
    });

    return steps;
  }

  if (role === 'parent') {
    return [
      {
        id: 'parent-dashboard',
        targetId: 'nav-dashboard',
        title: 'Family Portal Overview',
        body: 'Monitor all linked children, upcoming lessons, and academy updates from one unified space.',
      },
      {
        id: 'parent-tracks',
        targetId: 'nav-learning-tracks',
        title: 'Learning Tracks & Enrolment',
        body: 'Review each child’s active curriculum or open Explore Programmes to enrol a specific linked child into a new track.',
      },
      {
        id: 'parent-results',
        targetId: 'nav-examinations',
        title: 'Assessment Results & Progress',
        body: 'View released test scores, teacher feedback, and performance milestones for every linked child.',
      },
      {
        id: 'parent-payments',
        targetId: 'nav-payments',
        title: 'Tuition & Family Billing',
        body: 'Select programmes per child, settle fees online via Paystack, and keep every verified receipt organised.',
      },
      {
        id: 'parent-notifications',
        targetId: 'header-notifications',
        title: 'Admissions & Class Alerts',
        body: 'Check the notification bell for enrolment approvals, schedule reminders, and released results.',
      },
    ];
  }

  if (role === 'school') {
    return [
      {
        id: 'school-dashboard',
        targetId: 'nav-dashboard',
        title: 'Partner School Workspace',
        body: 'Oversee institutional programmes, cohort schedules, and academy updates from your command centre.',
      },
      {
        id: 'school-roster',
        targetId: 'nav-roster',
        title: 'Learners Roster & Access',
        body: 'Manage enrolled cohorts, class assignments, and learner portal passcodes from People.',
      },
      {
        id: 'school-exams',
        targetId: 'nav-exams',
        title: 'Assessment Overview & Reports',
        body: 'Review school-wide examination performance, learner insights, and historical submissions.',
      },
      {
        id: 'school-payments',
        targetId: 'nav-payments',
        title: 'Institutional Billing & Agreements',
        body: 'Track partner school invoices, contract documents, and institutional payment statements.',
      },
    ];
  }

  // staff / tutor
  return [
    {
      id: 'staff-dashboard',
      targetId: 'nav-dashboard',
      title: 'Faculty Teaching Hub',
      body: 'See your assigned cohorts, partner schools, and upcoming live classes as soon as you sign in.',
    },
    {
      id: 'staff-assessments',
      targetId: 'nav-assessments',
      title: 'Assessments & Academic Reporting',
      body: 'Author quizzes, review submissions, and issue official performance reports for learners.',
    },
    {
      id: 'staff-resources',
      targetId: 'nav-resources',
      title: 'Lesson Resources & Credentials',
      body: 'Share curated course materials and manage learner access credentials smoothly.',
    },
    {
      id: 'staff-payments',
      targetId: 'nav-payments',
      title: 'Faculty Ledger & Payouts',
      body: 'Track verified teaching settlements, payout history, and linked bank accounts.',
    },
  ];
}

const NEW_ACCOUNT_TOUR_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

function extractTimestampMs(raw: unknown): number | null {
  if (!raw) return null;
  if (raw instanceof Date) {
    const t = raw.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return raw > 1e12 ? raw : raw * 1000;
  }
  if (typeof raw === 'string') {
    const t = Date.parse(raw);
    return Number.isFinite(t) ? t : null;
  }
  if (typeof raw === 'object') {
    const obj = raw as { toMillis?: () => number; toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof obj.toMillis === 'function') {
      const t = obj.toMillis();
      return Number.isFinite(t) ? t : null;
    }
    if (typeof obj.toDate === 'function') {
      const t = obj.toDate().getTime();
      return Number.isFinite(t) ? t : null;
    }
    const secs = typeof obj.seconds === 'number' ? obj.seconds : typeof obj._seconds === 'number' ? obj._seconds : null;
    if (secs !== null && Number.isFinite(secs)) {
      return secs * 1000;
    }
  }
  return null;
}

export function shouldShowPortalTour(params: {
  userDoc?: Record<string, any> | null;
  localCompletedVersion?: string | null;
  isImpersonating?: boolean;
  currentVersion?: string;
  nowMs?: number;
}): boolean {
  const version = params.currentVersion || PORTAL_TOUR_VERSION;
  if (params.isImpersonating) return false;
  const serverVersion = String(params.userDoc?.portalTourVersion || '').trim();
  if (serverVersion === version) return false;
  if (String(params.localCompletedVersion || '').trim() === version) return false;
  if (params.userDoc?.onboardingTourEligible === false) return false;
  if (params.userDoc?.onboardingTourEligible === true) return true;

  // Treat accounts created within the last 14 days as newly registered accounts.
  // Existing/legacy accounts without onboardingTourEligible or older than 14 days
  // will not be auto-prompted, though they can still replay the tour manually.
  const createdMs = extractTimestampMs(params.userDoc?.createdAt);
  if (createdMs === null) return false;
  const nowMs = typeof params.nowMs === 'number' && Number.isFinite(params.nowMs) ? params.nowMs : Date.now();
  const ageMs = nowMs - createdMs;
  return ageMs >= -60_000 && ageMs <= NEW_ACCOUNT_TOUR_WINDOW_MS;
}

export function getLocalTourStorageKey(uid: string, role: string): string {
  return `jaystar_portal_tour_${role}_${uid || 'anon'}`;
}
