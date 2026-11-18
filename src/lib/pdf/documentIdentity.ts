import { classifyStudentEnrolment, resolvePartnerSchoolName } from '../classes';
import { JDI_INSTITUTION_NAME } from './documentBranding';

export type DocumentIdentityType = 'school' | 'private_parent' | 'private_individual';

export interface DocumentIdentityInput {
  schoolId?: unknown;
  schoolName?: unknown;
  schoolDirectory?: Record<string, string> | Map<string, string> | null;
  studentRecord?: Record<string, any> | null;
  parentId?: unknown;
  parentName?: unknown;
  parentEmail?: unknown;
  enrolmentType?: unknown;
}

export interface ResolvedDocumentIdentity {
  identityType: DocumentIdentityType;
  isSchoolDocument: boolean;
  headerTitle: string;
  schoolName: string;
  enrolmentLabel: string;
  subtitleClassification: string;
}

const PRIVATE_OR_GENERIC_IDS = new Set([
  '',
  'private',
  'private_parent',
  'private_individual',
  'individual',
  'none',
  'null',
  'undefined',
  'all',
  'default',
]);

function isExplicitlyPrivateOrGenericText(raw: unknown): boolean {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return true;
  if (PRIVATE_OR_GENERIC_IDS.has(s)) return true;
  return (
    s.includes('private learner') ||
    s.includes('private mentorship') ||
    s.includes('parent-enrolled') ||
    s.includes('parent enrolled') ||
    s.includes('direct individual') ||
    s.includes('assigned partner school') ||
    s === 'partner school' ||
    s === 'jaystarbliss' ||
    s.includes('jaystarbliss')
  );
}

function lookupSchoolInDirectory(
  schoolId: string,
  directory?: Record<string, string> | Map<string, string> | null
): string {
  if (!schoolId || !directory) return '';
  if (directory instanceof Map) {
    return (
      directory.get(schoolId) ||
      directory.get(schoolId.toLowerCase()) ||
      ''
    );
  }
  return directory[schoolId] || directory[schoolId.toLowerCase()] || '';
}

/**
 * Authoritatively resolves whether a learner / document belongs to a partner school
 * or is a Private Learner (Parent-Enrolled or Individual).
 *
 * Strictly enforces:
 * - School documents display the authoritative partner school's name as main heading
 *   and "OFFICIAL ASSESSMENT REPORT".
 * - Private learner documents display "JAYSTARBLISS DYNAMIC INSTITUTE" as main heading
 *   and "ASSESSMENT REPORT", never attaching a false partner school name.
 */
export function resolveDocumentIdentity(input: DocumentIdentityInput = {}): ResolvedDocumentIdentity {
  const studentRec = input.studentRecord || {};
  const classification = classifyStudentEnrolment({
    ...studentRec,
    schoolId: input.schoolId ?? studentRec.schoolId,
    schoolName: input.schoolName ?? studentRec.schoolName,
    parentId: input.parentId ?? studentRec.parentId,
    parentName: input.parentName ?? studentRec.parentName,
    parentEmail: input.parentEmail ?? studentRec.parentEmail,
    enrolmentType: input.enrolmentType ?? studentRec.enrolmentType,
  });

  const rawSchoolId = String(input.schoolId ?? studentRec.schoolId ?? '').trim();
  const normalizedSchoolId = rawSchoolId.toLowerCase();
  const hasRealSchoolId = Boolean(normalizedSchoolId && !PRIVATE_OR_GENERIC_IDS.has(normalizedSchoolId));

  const directoryMatch = hasRealSchoolId
    ? lookupSchoolInDirectory(rawSchoolId, input.schoolDirectory)
    : '';

  const rawSchoolName = String(
    directoryMatch || input.schoolName || studentRec.schoolName || ''
  ).trim();

  const resolvedPartner = resolvePartnerSchoolName(
    directoryMatch,
    isExplicitlyPrivateOrGenericText(rawSchoolName) ? '' : rawSchoolName,
    ''
  );

  const hasValidSchoolName = Boolean(
    resolvedPartner && !isExplicitlyPrivateOrGenericText(resolvedPartner)
  );

  const hasExplicitPrivateMarker =
    normalizedSchoolId === 'private' ||
    normalizedSchoolId === 'private_parent' ||
    normalizedSchoolId === 'private_individual' ||
    normalizedSchoolId === 'individual' ||
    String(input.schoolName || '').toLowerCase().includes('private') ||
    classification.isPrivate;

  // Partner school identity requires non-private classification (or an explicit valid schoolId + valid school name without a private-school marker)
  const isSchoolDocument =
    !hasExplicitPrivateMarker &&
    (hasValidSchoolName || (hasRealSchoolId && Boolean(directoryMatch)));

  if (isSchoolDocument && hasValidSchoolName) {
    return {
      identityType: 'school',
      isSchoolDocument: true,
      headerTitle: resolvedPartner.toUpperCase(),
      schoolName: resolvedPartner,
      enrolmentLabel: resolvedPartner,
      subtitleClassification: 'OFFICIAL ASSESSMENT REPORT',
    };
  }

  // Fallback for private parent-enrolled vs private individual
  const hasParentIndicator =
    classification.privateSubType === 'parent' ||
    classification.category === 'private_parent' ||
    normalizedSchoolId === 'private_parent' ||
    Boolean(
      String(input.parentId || studentRec.parentId || '').trim() ||
        String(input.parentName || studentRec.parentName || '').trim() ||
        String(input.parentEmail || studentRec.parentEmail || '').trim()
    ) ||
    String(input.schoolName || '').toLowerCase().includes('parent');

  if (hasParentIndicator) {
    return {
      identityType: 'private_parent',
      isSchoolDocument: false,
      headerTitle: JDI_INSTITUTION_NAME,
      schoolName: '',
      enrolmentLabel: 'Private Learner (Parent-Enrolled)',
      subtitleClassification: 'ASSESSMENT REPORT',
    };
  }

  return {
    identityType: 'private_individual',
    isSchoolDocument: false,
    headerTitle: JDI_INSTITUTION_NAME,
    schoolName: '',
    enrolmentLabel: 'Private Learner (Individual)',
    subtitleClassification: 'ASSESSMENT REPORT',
  };
}
