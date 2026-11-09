import type {
  ProgramRecord,
  ProgramNodeType,
  ProgramDeliveryOption,
  TutorProgramProposal,
} from '../../../lib/programHierarchy';

export type WorkspaceSectionId =
  | 'catalogue'
  | 'hierarchy'
  | 'curriculum'
  | 'proposals'
  | 'archive-tools'
  | 'overview'
  | 'editor'
  | 'unassigned';

export type ArchiveToolsTabId =
  | 'archived'
  | 'unassigned'
  | 'migration'
  | 'backup'
  | 'integrity';

export type UnassignedReasonCategory =
  | 'MISSING_PARENT'
  | 'UNCERTAIN_MATCH'
  | 'UNMAPPED_RECORD'
  | 'INVALID_REFERENCE';

export interface PreviewProgramRecord extends ProgramRecord {
  deliveryFormat: 'ONLINE' | 'PHYSICAL' | 'HYBRID';
  targetAudience: 'B2C' | 'B2B_SCHOOLS' | 'CORPORATE';
  isFeatured?: boolean;
  isSampleData?: boolean;
  enrolledCount?: number;
  // Archive metadata
  archivedAt?: string | null;
  archiveReason?: string;
  previousStatusBeforeArchive?: 'PUBLISHED' | 'DRAFT';
  // Unassigned diagnostics
  unassignedReasonType?: UnassignedReasonCategory;
  unassignedReasonDetail?: string;
  suggestedParentId?: string | null;
  suggestedParentNote?: string;
}

export interface PreviewProposalRecord extends TutorProgramProposal {
  categoryId: string;
  deliveryFormat: 'ONLINE' | 'PHYSICAL' | 'HYBRID';
  targetAudience: 'B2C' | 'B2B_SCHOOLS' | 'CORPORATE';
  submittedPublicGroupPrice: number;
  submittedPrivateMentorshipPrice: number;
  submittedAt: string;
  reviewHistory: Array<{
    id: string;
    action: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';
    actorName: string;
    timestamp: string;
    notes: string;
  }>;
}

export interface BackupSnapshot {
  id: string;
  label: string;
  createdAt: string;
  createdBy: string;
  recordCount: number;
  rootCount: number;
  unassignedCount: number;
  archivedCount: number;
  sizeBytes: number;
  jsonPayload: string;
}

export interface IntegrityFinding {
  id: string;
  severity: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  category:
    | 'HEALTHY_STRUCTURE'
    | 'MISSING_PARENT_REFERENCE'
    | 'INVALID_PARENT_REFERENCE'
    | 'CIRCULAR_DEPENDENCY'
    | 'UNEXPECTED_STRUCTURE';
  programId?: string;
  programTitle?: string;
  summary: string;
  detail: string;
  recommendedAction: string;
  canAutoIsolate?: boolean;
}

export const CATEGORY_OPTIONS: Array<{ value: string; label: string; shortLabel: string }> = [
  { value: 'DIGITAL_AND_TECHNOLOGY', label: 'Digital & Technology', shortLabel: 'Technology' },
  { value: 'CREATIVE', label: 'Creative & Design', shortLabel: 'Creative' },
  { value: 'MUSIC', label: 'Music & Performance', shortLabel: 'Music' },
  { value: 'ACADEMICS', label: 'Academics', shortLabel: 'Academics' },
  { value: 'EXAM_PREPARATION', label: 'Exam Preparation', shortLabel: 'Academics' },
  { value: 'PERSONALIZED_LEARNING', label: 'Personalised Learning', shortLabel: 'Academics' },
  { value: 'SCHOOL_PROGRAMS', label: 'School Programs', shortLabel: 'School Programs' },
];

export const TARGET_AUDIENCE_OPTIONS: Array<{
  value: 'B2C' | 'B2B_SCHOOLS' | 'CORPORATE';
  label: string;
}> = [
  { value: 'B2C', label: 'B2C (Direct Learners & Families)' },
  { value: 'B2B_SCHOOLS', label: 'B2B Schools (Partner Institutions)' },
  { value: 'CORPORATE', label: 'Corporate Training' },
];

export const DELIVERY_FORMAT_OPTIONS: Array<{
  value: 'ONLINE' | 'PHYSICAL' | 'HYBRID';
  label: string;
}> = [
  { value: 'ONLINE', label: 'Online' },
  { value: 'PHYSICAL', label: 'Physical' },
  { value: 'HYBRID', label: 'Hybrid' },
];

export const DELIVERY_OPTION_LABELS: Record<ProgramDeliveryOption, string> = {
  PUBLIC_GROUP: 'Public Group',
  PRIVATE_MENTORSHIP: 'Private Mentorship',
  SCHOOL_COHORT: 'School Cohort',
  SELF_PACED: 'Self-Paced',
};

export const NODE_TYPE_META: Record<
  ProgramNodeType,
  {
    label: string;
    shortLabel: string;
    badgeLabel: string;
    description: string;
    consequence: string;
  }
> = {
  CONTAINER: {
    label: 'Container Folder',
    shortLabel: 'CONTAINER',
    badgeLabel: 'Container',
    description:
      'Structural folder that organises other programmes. Not directly enrolable.',
    consequence:
      'Direct enrolment and standalone tuition fees are disabled. Used purely to group nested sub-programmes.',
  },
  ENROLLABLE: {
    label: 'Enrollable Unit',
    shortLabel: 'ENROLLABLE',
    badgeLabel: 'Enrollable',
    description:
      'Concrete learning unit with curriculum, delivery options, and direct student enrolment.',
    consequence:
      'Students can enrol directly in this unit and track lesson/module completion.',
  },
  HYBRID: {
    label: 'Hybrid Programme',
    shortLabel: 'HYBRID',
    badgeLabel: 'Hybrid',
    description:
      'Supports direct package enrolment while also containing nested child sub-programmes.',
    consequence:
      'Learners can enrol in the overall programme package or be placed into specific nested child units.',
  },
};

export function getCategoryLabel(categoryId: string): string {
  const found = CATEGORY_OPTIONS.find((c) => c.value === categoryId);
  return found ? found.label : categoryId || 'Technology';
}

export function getShortCategoryLabel(categoryId: string): string {
  const found = CATEGORY_OPTIONS.find((c) => c.value === categoryId);
  if (found) return found.shortLabel;
  const upper = String(categoryId || '').toUpperCase();
  if (upper.includes('TECH') || upper.includes('DIGITAL')) return 'Technology';
  if (upper.includes('CREAT') || upper.includes('DESIGN') || upper.includes('GRAPHIC')) return 'Creative';
  if (upper.includes('MUSIC')) return 'Music';
  if (upper.includes('ACADEM') || upper.includes('EXAM')) return 'Academics';
  return categoryId || 'Technology';
}

export function getDeliveryFormatLabel(format?: string): string {
  const norm = String(format || 'ONLINE').toUpperCase();
  if (norm === 'PHYSICAL') return 'Physical';
  if (norm === 'HYBRID' || norm.includes('HYBRID')) return 'Hybrid';
  return 'Online';
}

export function getTargetAudienceLabel(audience?: string): string {
  const norm = String(audience || 'B2C').toUpperCase();
  if (norm === 'B2B_SCHOOLS') return 'B2B Schools';
  if (norm === 'CORPORATE') return 'Corporate';
  return 'B2C';
}

export function formatNaira(amount?: number | null): string {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return '—';
  }
  return `₦${amount.toLocaleString('en-NG')}`;
}

export function formatPriceWithCycle(prog: Partial<PreviewProgramRecord>): string {
  if (prog.nodeType === 'CONTAINER') return 'Container';
  const amount =
    prog.publicGroupPricing?.amount ??
    (typeof prog.price === 'number' && prog.price > 0 ? prog.price : 35000);
  const rawCycle = (prog.publicGroupPricing?.billingCycle || 'term').toLowerCase();
  const shortCycle = rawCycle.includes('month')
    ? 'month'
    : rawCycle.includes('unit')
    ? 'unit'
    : 'term';
  return `₦${amount.toLocaleString('en-NG')}/${shortCycle}`;
}

const COVER_IMAGES = {
  webDev:
    'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=640&q=80',
  smartTechies:
    'https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=640&q=80',
  robotics:
    'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=640&q=80',
  python:
    'https://images.unsplash.com/photo-1526379095098-d400fd0bf935?auto=format&fit=crop&w=640&q=80',
  digitalLit:
    'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=640&q=80',
  design:
    'https://images.unsplash.com/photo-1626785774573-4b799315345d?auto=format&fit=crop&w=640&q=80',
  uiux:
    'https://images.unsplash.com/photo-1561070791-2526d30994b5?auto=format&fit=crop&w=640&q=80',
  music:
    'https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?auto=format&fit=crop&w=640&q=80',
  academics:
    'https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=640&q=80',
};

export function getProgramCoverImage(prog?: Partial<PreviewProgramRecord> | null): string {
  if (!prog) return COVER_IMAGES.webDev;
  if (prog.featuredImage && prog.featuredImage.trim().startsWith('http')) {
    return prog.featuredImage.trim();
  }
  const t = `${prog.title || ''} ${prog.slug || ''} ${prog.categoryId || ''}`.toLowerCase();
  if (t.includes('robot')) return COVER_IMAGES.robotics;
  if (t.includes('smart tech')) return COVER_IMAGES.smartTechies;
  if (t.includes('python') || t.includes('javascript')) return COVER_IMAGES.python;
  if (t.includes('digital literacy') || t.includes('office')) return COVER_IMAGES.digitalLit;
  if (t.includes('ui/ux') || t.includes('figma')) return COVER_IMAGES.uiux;
  if (t.includes('graphic') || t.includes('design') || t.includes('corel') || t.includes('creative'))
    return COVER_IMAGES.design;
  if (t.includes('piano') || t.includes('music') || t.includes('recorder') || t.includes('audio'))
    return COVER_IMAGES.music;
  if (
    t.includes('math') ||
    t.includes('waec') ||
    t.includes('jamb') ||
    t.includes('academic') ||
    t.includes('exam')
  )
    return COVER_IMAGES.academics;
  return COVER_IMAGES.webDev;
}
