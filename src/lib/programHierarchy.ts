import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  writeBatch,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import { db, getAllClientDatabases } from './firebase';

export type ProgramNodeType = 'CONTAINER' | 'ENROLLABLE' | 'HYBRID';

export type ProgramDeliveryOption =
  | 'PUBLIC_GROUP'
  | 'PRIVATE_MENTORSHIP'
  | 'SCHOOL_COHORT'
  | 'SELF_PACED';

export interface ProgramPriceConfig {
  amount: number;
  currency: string;
  billingCycle: string;
  label?: string;
}

export interface ProgramRecord {
  id: string;
  title: string;
  slug: string;
  categoryId: string;
  shortDescription: string;
  fullDescription: string;
  longDescription?: string;
  description?: string;
  duration: string;
  deliveryMode: string;
  pricing: string;
  price?: number;
  featuredImage: string;
  curriculum: string[];
  curriculumPdfUrl: string;
  curriculumTitle: string;
  curriculumSummary: string;
  outcomes: string[];
  learningObjectives: string[];
  whoIsItFor: string;
  tools: string[];
  hasEdclub: boolean;
  isGeneralProgram: boolean;
  hasResources: boolean;
  hasAssessments: boolean;
  hasLiveClasses: boolean;
  sessionsPerWeek: number;
  sessionDuration: string;
  // Legacy series / stage fields (preserved for backwards compatibility)
  seriesName: string;
  programPack: string;
  stageNumber: number;
  stageName: string;
  nextProgramTitle: string;
  order: number;
  status: 'PUBLISHED' | 'DRAFT' | 'ARCHIVED';
  // New Phase 2 Recursive Hierarchy Fields
  parentProgramId: string | null;
  rootProgramId: string | null;
  ancestorIds: string[];
  sortOrder: number;
  nodeType: ProgramNodeType;
  canContainChildren: boolean;
  isEnrollable: boolean;
  isPublished: boolean;
  isArchived: boolean;
  isUnassigned: boolean;
  isPrimaryRoot: boolean;
  primaryRootKey?:
    | 'technology'
    | 'design-graphics'
    | 'music'
    | 'academics'
    | 'smart-techies'
    | 'digital-literacy'
    | 'graphic-design'
    | null;
  prerequisiteProgramIds: string[];
  progressionRule: 'sequential' | 'flexible';
  isRequired: boolean;
  deliveryOptions: ProgramDeliveryOption[];
  publicGroupPricing: ProgramPriceConfig | null;
  privateMentorshipPricing: ProgramPriceConfig | null;
  lessonsCount?: number;
  createdAt?: any;
  updatedAt?: any;
}

export interface ProgramTreeNode {
  program: ProgramRecord;
  children: ProgramTreeNode[];
  depth: number;
  breadcrumbIds: string[];
  breadcrumbTitles: string[];
  breadcrumbPath: string;
  directChildCount: number;
  totalDescendantCount: number;
}

export interface ProgramTreeResult {
  roots: ProgramTreeNode[];
  unassigned: ProgramTreeNode[];
  archived: ProgramTreeNode[];
  allNodesMap: Map<string, ProgramTreeNode>;
  programsMap: Map<string, ProgramRecord>;
  circularIds: string[];
  invalidParentIds: string[];
}

export interface PrimaryRootDefinition {
  key: 'technology' | 'design-graphics' | 'music' | 'academics';
  canonicalId: string;
  title: string;
  slug: string;
  categoryId: string;
  shortDescription: string;
  matchAliases: string[];
  sortOrder: number;
}

export interface KnownSubProgrammeDefinition {
  title: string;
  slug: string;
  parentRootKey: 'technology' | 'design-graphics' | 'music' | 'academics';
  parentRootCanonicalId: string;
  matchAliases: string[];
  shortDescription: string;
}

export const PRIMARY_PROGRAM_ROOTS: PrimaryRootDefinition[] = [
  {
    key: 'technology',
    canonicalId: 'root-technology-programme',
    title: 'Technology Programme',
    slug: 'technology-programme',
    categoryId: 'DIGITAL_AND_TECHNOLOGY',
    shortDescription:
      'Comprehensive software engineering, coding, web development, digital literacy, cybersecurity, AI, and robotics pathways.',
    matchAliases: [
      'technology programme',
      'technology program',
      'technology',
      'tech & coding',
      'tech and coding',
      'school of technology & programming',
      'tech-programming',
      'digital and technology',
      'digital & technology',
    ],
    sortOrder: 1,
  },
  {
    key: 'design-graphics',
    canonicalId: 'root-design-graphics-programme',
    title: 'Design & Graphics Programme',
    slug: 'design-graphics-programme',
    categoryId: 'CREATIVE',
    shortDescription:
      'Primary category for creative visual arts, graphic design, branding, UI/UX architecture, digital illustration, motion design, and print media.',
    matchAliases: [
      'design & graphics programme',
      'design and graphics programme',
      'design & graphics program',
      'design and graphics program',
      'design & graphics',
      'design and graphics',
      'creative design',
      'creative arts & design',
      'graphic design and branding',
    ],
    sortOrder: 2,
  },
  {
    key: 'music',
    canonicalId: 'root-music-programme',
    title: 'Music Programme',
    slug: 'music-programme',
    categoryId: 'MUSIC',
    shortDescription:
      'Instrumental mastery (piano, keyboard, guitar, drums, violin, recorder), vocal coaching, music theory, sight reading, and digital audio production.',
    matchAliases: [
      'music programme',
      'music program',
      'music & performing arts',
      'music and performing arts',
      'music',
      'performing arts',
    ],
    sortOrder: 3,
  },
  {
    key: 'academics',
    canonicalId: 'root-academics-programme',
    title: 'Academics Programme',
    slug: 'academics-programme',
    categoryId: 'ACADEMICS',
    shortDescription:
      'Formal academic education, STEM foundations, WAEC preparation, JAMB preparation, and subject-specific tutoring across sciences, arts, and commercial tracks.',
    matchAliases: [
      'academics programme',
      'academics program',
      'academic excellence',
      'school of academic excellence',
      'academics',
      'academic tutoring',
      'waec and jamb prep',
    ],
    sortOrder: 4,
  },
];

export const KNOWN_SUB_PROGRAMMES: KnownSubProgrammeDefinition[] = [
  {
    title: 'Smart Techies Programme',
    slug: 'smart-techies-programme',
    parentRootKey: 'technology',
    parentRootCanonicalId: 'root-technology-programme',
    shortDescription:
      'Software engineering, web development, Python, artificial intelligence, cybersecurity, game development, and robotics.',
    matchAliases: [
      'smart techies programme',
      'smart techies program',
      'smart techies',
      'smart techie programme',
    ],
  },
  {
    title: 'Digital Literacy Programme',
    slug: 'digital-literacy-programme',
    parentRootKey: 'technology',
    parentRootCanonicalId: 'root-technology-programme',
    shortDescription:
      'Foundational computer operations, keyboarding mastery, productivity suites, internet safety, and cloud workspace skills.',
    matchAliases: [
      'digital literacy programme',
      'digital literacy program',
      'digital literacy',
    ],
  },
  {
    title: 'Graphic Design Programme',
    slug: 'graphic-design-programme',
    parentRootKey: 'design-graphics',
    parentRootCanonicalId: 'root-design-graphics-programme',
    shortDescription:
      'Visual branding & identity, UI/UX design, digital illustration, motion graphics, and print media layout.',
    matchAliases: [
      'graphic design programme',
      'graphic design program',
      'graphic design',
    ],
  },
  {
    title: 'WAEC Preparation Track',
    slug: 'waec-prep-track',
    parentRootKey: 'academics',
    parentRootCanonicalId: 'root-academics-programme',
    shortDescription:
      'Rigorous West African Senior School Certificate Examination preparation with syllabus coverage, past questions, and practicals.',
    matchAliases: [
      'waec preparation track',
      'waec prep',
      'waec preparation',
      'waec',
    ],
  },
  {
    title: 'JAMB Preparation Track',
    slug: 'jamb-prep-track',
    parentRootKey: 'academics',
    parentRootCanonicalId: 'root-academics-programme',
    shortDescription:
      'Joint Admissions and Matriculation Board CBT training, speed problem solving, and scoring mastery.',
    matchAliases: [
      'jamb preparation track',
      'jamb prep',
      'jamb preparation',
      'jamb',
      'utme',
    ],
  },
];

export interface TutorProgramProposal {
  id: string;
  title: string;
  slug: string;
  description: string;
  parentProgramId: string;
  parentProgramTitle: string;
  parentBreadcrumbPath?: string;
  rootProgramId: string | null;
  ancestorIds: string[];
  proposedNodeType: ProgramNodeType;
  canContainChildren: boolean;
  isEnrollable: boolean;
  isRequired: boolean;
  curriculum: string[];
  learningObjectives: string[];
  prerequisiteProgramIds: string[];
  deliveryOptions: ProgramDeliveryOption[];
  duration: string;
  sessionsPerWeek: number;
  sessionDuration: string;
  proposedByUid: string;
  proposedByName: string;
  proposedByEmail: string;
  tutorUid?: string;
  tutorName?: string;
  tutorEmail?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';
  adminReviewNotes?: string;
  reviewedByUid?: string;
  reviewedByName?: string;
  reviewedAt?: any;
  createdProgramId?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface MigrationProposedMapping {
  programId: string;
  title: string;
  currentParentId: string | null;
  proposedParentId: string | null;
  proposedParentTitle: string;
  proposedRootId: string | null;
  proposedRootTitle: string;
  proposedAncestorIds: string[];
  proposedNodeType: ProgramNodeType;
  proposedSortOrder: number;
  confidence: 'HIGH' | 'UNCERTAIN' | 'EXACT_EXISTING' | 'PRIMARY_ROOT_MATCH' | 'SERIES_PACK_GROUP' | 'UNASSIGNED';
  action: 'NO_CHANGE_NEEDED' | 'PROMOTE_TO_PRIMARY_ROOT' | 'ASSIGN_TO_ROOT' | 'FLAG_UNASSIGNED';
  reason: string;
  legacyFields: {
    seriesName: string;
    programPack: string;
    stageNumber: number;
    stageName: string;
    categoryId: string;
  };
}

export interface MigrationPreviewReport {
  generatedAt: string;
  totalProgramsInspected: number;
  totalExistingPrograms: number;
  highConfidenceMatches: number;
  unassignedForReviewCount: number;
  alreadyConfiguredCount: number;
  existingRootsFound: { rootKey: string; programId: string; title: string }[];
  missingRootsToCreate: PrimaryRootDefinition[];
  proposedMappings: MigrationProposedMapping[];
  items: MigrationProposedMapping[];
  unassignedPrograms: MigrationProposedMapping[];
  alreadyMigratedCount: number;
  invalidParentReferences: { programId: string; title: string; invalidParentId: string }[];
  circularRelationships: string[][];
  exportBackupJson: string;
}

export type HierarchyMigrationPreviewReport = MigrationPreviewReport;

export interface BranchMovePreviewItem {
  id: string;
  programId: string;
  title: string;
  oldParentId: string | null;
  newParentId: string | null;
  oldRootId: string | null;
  newRootId: string | null;
  oldAncestorIds: string[];
  newAncestorIds: string[];
  oldPath: string;
  newPath: string;
  newSortOrder: number;
  isUnassigned: boolean;
}

export interface BranchMoveValidationResult {
  valid: boolean;
  isValid: boolean;
  error?: string;
  affectedItems: BranchMovePreviewItem[];
  affectedNodeIds: string[];
  oldBreadcrumbPath: string;
  newBreadcrumbPath: string;
  descendantUpdates: BranchMovePreviewItem[];
}

export const normalizeText = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

export const slugifyTitle = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

export function parseNumericPrice(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return raw;
  if (typeof raw === 'string') {
    const cleaned = raw.replace(/[^0-9.]/g, '');
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
}

export function matchPrimaryRootDefinition(
  raw: Record<string, any>,
  id: string
): PrimaryRootDefinition | null {
  if (raw.primaryRootKey) {
    const byKey = PRIMARY_PROGRAM_ROOTS.find((r) => r.key === raw.primaryRootKey);
    if (byKey) return byKey;
  }
  const normId = normalizeText(id);
  const normSlug = normalizeText(raw.slug);
  const normTitle = normalizeText(raw.title || raw.name);

  for (const root of PRIMARY_PROGRAM_ROOTS) {
    if (normId === normalizeText(root.canonicalId) || normSlug === normalizeText(root.slug)) {
      return root;
    }
    if (root.matchAliases.some((alias) => normTitle === alias)) {
      return root;
    }
  }
  return null;
}

export function normalizeProgramRecord(id: string, raw: Record<string, any> = {}): ProgramRecord {
  const title = String(raw.title || raw.name || 'Untitled Programme').trim();
  const slug = String(raw.slug || slugifyTitle(title)).trim();
  const matchedRoot = matchPrimaryRootDefinition(raw, id);
  const isPrimaryRoot = Boolean(
    raw.isPrimaryRoot === true || (matchedRoot && !raw.parentProgramId)
  );

  const statusRaw = String(raw.status || 'PUBLISHED').toUpperCase();
  const status: 'PUBLISHED' | 'DRAFT' | 'ARCHIVED' =
    statusRaw === 'ARCHIVED' || raw.isArchived === true
      ? 'ARCHIVED'
      : statusRaw === 'DRAFT' || raw.isPublished === false
      ? 'DRAFT'
      : 'PUBLISHED';

  const nodeTypeRaw = String(raw.nodeType || '').toUpperCase();
  let nodeType: ProgramNodeType = 'ENROLLABLE';
  if (nodeTypeRaw === 'CONTAINER' || nodeTypeRaw === 'FOLDER') {
    nodeType = 'CONTAINER';
  } else if (nodeTypeRaw === 'HYBRID') {
    nodeType = 'HYBRID';
  } else if (nodeTypeRaw === 'ENROLLABLE' || nodeTypeRaw === 'PROGRAMME') {
    nodeType = 'ENROLLABLE';
  } else if (isPrimaryRoot) {
    nodeType = 'HYBRID';
  }

  const canContainChildren =
    typeof raw.canContainChildren === 'boolean'
      ? raw.canContainChildren
      : nodeType === 'CONTAINER' || nodeType === 'HYBRID' || true;

  const isEnrollable =
    nodeType === 'CONTAINER'
      ? false
      : typeof raw.isEnrollable === 'boolean'
      ? raw.isEnrollable
      : true;

  const parentProgramId =
    raw.parentProgramId && String(raw.parentProgramId).trim()
      ? String(raw.parentProgramId).trim()
      : null;

  const rootProgramId =
    isPrimaryRoot && !parentProgramId
      ? id
      : raw.rootProgramId && String(raw.rootProgramId).trim()
      ? String(raw.rootProgramId).trim()
      : null;

  const ancestorIds = Array.isArray(raw.ancestorIds)
    ? raw.ancestorIds.map((a: unknown) => String(a).trim()).filter(Boolean)
    : parentProgramId
    ? [parentProgramId]
    : [];

  const isUnassigned =
    typeof raw.isUnassigned === 'boolean'
      ? raw.isUnassigned && !parentProgramId && !isPrimaryRoot
      : !parentProgramId && !isPrimaryRoot;

  const stageNumber = Number(raw.stageNumber ?? raw.stage ?? 1) || 1;
  const order = Number(raw.order ?? raw.sortOrder ?? stageNumber ?? 0) || 0;
  const sortOrder =
    typeof raw.sortOrder === 'number' && Number.isFinite(raw.sortOrder)
      ? raw.sortOrder
      : matchedRoot
      ? matchedRoot.sortOrder
      : order;

  const curriculum = Array.isArray(raw.curriculum)
    ? raw.curriculum.map((c: unknown) => String(c).trim()).filter(Boolean)
    : Array.isArray(raw.topics)
    ? raw.topics.map((c: unknown) => String(c).trim()).filter(Boolean)
    : [];

  const outcomes = Array.isArray(raw.outcomes)
    ? raw.outcomes.map((o: unknown) => String(o).trim()).filter(Boolean)
    : [];

  const learningObjectives = Array.isArray(raw.learningObjectives)
    ? raw.learningObjectives.map((o: unknown) => String(o).trim()).filter(Boolean)
    : outcomes;

  const prerequisiteProgramIds = Array.isArray(raw.prerequisiteProgramIds)
    ? raw.prerequisiteProgramIds.map((p: unknown) => String(p).trim()).filter(Boolean)
    : [];

  const deliveryOptions: ProgramDeliveryOption[] = Array.isArray(raw.deliveryOptions) &&
    raw.deliveryOptions.length > 0
    ? raw.deliveryOptions
    : ['PUBLIC_GROUP', 'PRIVATE_MENTORSHIP', 'SCHOOL_COHORT'];

  const legacyNumericPrice =
    parseNumericPrice(raw.price) ??
    parseNumericPrice(raw.tuition) ??
    parseNumericPrice(raw.fee) ??
    parseNumericPrice(raw.pricing);

  const publicGroupPricing: ProgramPriceConfig | null =
    raw.publicGroupPricing && typeof raw.publicGroupPricing === 'object'
      ? {
          amount: Number(raw.publicGroupPricing.amount ?? legacyNumericPrice ?? 35000),
          currency: String(raw.publicGroupPricing.currency || 'NGN'),
          billingCycle: String(raw.publicGroupPricing.billingCycle || 'Per Term / Cohort'),
          label: String(raw.publicGroupPricing.label || 'Public Group Class'),
        }
      : legacyNumericPrice !== null
      ? {
          amount: legacyNumericPrice,
          currency: 'NGN',
          billingCycle: 'Per Term / Cohort',
          label: 'Public Group Class',
        }
      : null;

  const privateMentorshipPricing: ProgramPriceConfig | null =
    raw.privateMentorshipPricing && typeof raw.privateMentorshipPricing === 'object'
      ? {
          amount: Number(raw.privateMentorshipPricing.amount ?? 0),
          currency: String(raw.privateMentorshipPricing.currency || 'NGN'),
          billingCycle: String(raw.privateMentorshipPricing.billingCycle || 'Per Month / Private 1-on-1'),
          label: String(raw.privateMentorshipPricing.label || 'Private 1-on-1 Mentorship'),
        }
      : typeof raw.privatePrice === 'number'
      ? {
          amount: raw.privatePrice,
          currency: 'NGN',
          billingCycle: 'Per Month / Private 1-on-1',
          label: 'Private 1-on-1 Mentorship',
        }
      : null;

  return {
    id,
    title,
    slug,
    categoryId: String(
      raw.categoryId || (matchedRoot ? matchedRoot.categoryId : 'DIGITAL_AND_TECHNOLOGY')
    ),
    shortDescription: String(raw.shortDescription || raw.description || ''),
    fullDescription: String(raw.fullDescription || raw.longDescription || raw.description || ''),
    longDescription: String(raw.longDescription || raw.fullDescription || raw.description || ''),
    description: String(raw.description || raw.shortDescription || ''),
    duration: String(raw.duration || '8 Weeks'),
    deliveryMode: String(raw.deliveryMode || 'Online / Hybrid'),
    pricing: String(
      raw.pricing ||
        (publicGroupPricing ? `₦${publicGroupPricing.amount.toLocaleString()}` : 'Contact Us')
    ),
    price: publicGroupPricing?.amount ?? legacyNumericPrice ?? undefined,
    featuredImage: String(raw.featuredImage || ''),
    curriculum,
    curriculumPdfUrl: String(raw.curriculumPdfUrl || ''),
    curriculumTitle: String(raw.curriculumTitle || ''),
    curriculumSummary: String(raw.curriculumSummary || ''),
    outcomes,
    learningObjectives,
    whoIsItFor: String(raw.whoIsItFor || ''),
    tools: Array.isArray(raw.tools)
      ? raw.tools.map((t: unknown) => String(t).trim()).filter(Boolean)
      : [],
    hasEdclub: Boolean(raw.hasEdclub ?? raw.hasEdClub ?? false),
    isGeneralProgram: Boolean(raw.isGeneralProgram ?? false),
    hasResources: raw.hasResources !== false,
    hasAssessments: raw.hasAssessments !== false,
    hasLiveClasses: raw.hasLiveClasses !== false,
    sessionsPerWeek: Number(raw.sessionsPerWeek || 2),
    sessionDuration: String(raw.sessionDuration || '60 mins'),
    seriesName: String(raw.seriesName || ''),
    programPack: String(raw.programPack || raw.seriesName || ''),
    stageNumber,
    stageName: String(raw.stageName || ''),
    nextProgramTitle: String(raw.nextProgramTitle || ''),
    order,
    status,
    parentProgramId,
    rootProgramId,
    ancestorIds,
    sortOrder,
    nodeType,
    canContainChildren,
    isEnrollable,
    isPublished: status === 'PUBLISHED',
    isArchived: status === 'ARCHIVED',
    isUnassigned,
    isPrimaryRoot,
    primaryRootKey: matchedRoot?.key ?? raw.primaryRootKey ?? null,
    prerequisiteProgramIds,
    progressionRule:
      String(raw.progressionRule || '').toLowerCase() === 'flexible'
        ? 'flexible'
        : 'sequential',
    isRequired: raw.isRequired !== false,
    deliveryOptions,
    publicGroupPricing,
    privateMentorshipPricing,
    lessonsCount: Number(raw.lessonsCount || curriculum.length || 0),
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null,
  };
}

/**
 * Fetches all programmes across configured client Firestore instances, deduplicating by ID.
 */
export async function fetchAllProgramsMap(): Promise<Map<string, ProgramRecord>> {
  const map = new Map<string, ProgramRecord>();
  const dbs = getAllClientDatabases();
  const snaps = await Promise.all(
    dbs.map((database) =>
      getDocs(collection(database, 'programs')).catch(() => ({ docs: [] } as any))
    )
  );
  // Process standby first, primary `db` last so primary wins on conflict
  for (let i = snaps.length - 1; i >= 0; i--) {
    snaps[i].docs.forEach((d: any) => {
      map.set(d.id, normalizeProgramRecord(d.id, d.data()));
    });
  }
  return map;
}

/**
 * Hierarchy traversal helpers with cycle protection.
 */
export function getDirectParent(
  programId: string,
  programsMap: Map<string, ProgramRecord>
): ProgramRecord | null {
  const prog = programsMap.get(programId);
  if (!prog || !prog.parentProgramId) return null;
  if (prog.parentProgramId === programId) return null;
  return programsMap.get(prog.parentProgramId) || null;
}

export function getAncestors(
  programId: string,
  programsMap: Map<string, ProgramRecord>
): ProgramRecord[] {
  const ancestors: ProgramRecord[] = [];
  const visited = new Set<string>([programId]);
  let current = programsMap.get(programId);

  while (current && current.parentProgramId) {
    const parentId = current.parentProgramId;
    if (visited.has(parentId)) {
      break; // Prevent infinite loop on circular data
    }
    const parent = programsMap.get(parentId);
    if (!parent) break;
    visited.add(parentId);
    ancestors.unshift(parent); // Root first, direct parent last
    current = parent;
  }
  return ancestors;
}

export function getRootProgram(
  programId: string,
  programsMap: Map<string, ProgramRecord>
): ProgramRecord | null {
  const ancestors = getAncestors(programId, programsMap);
  if (ancestors.length > 0) return ancestors[0];
  return programsMap.get(programId) || null;
}

export function getDirectChildren(
  parentProgramId: string | null,
  programs: Iterable<ProgramRecord>
): ProgramRecord[] {
  const list: ProgramRecord[] = [];
  for (const p of programs) {
    if (p.parentProgramId === parentProgramId) {
      list.push(p);
    }
  }
  return list.sort(
    (a, b) =>
      a.sortOrder - b.sortOrder ||
      a.stageNumber - b.stageNumber ||
      a.title.localeCompare(b.title)
  );
}

export function getAllDescendants(
  programId: string,
  programs: Iterable<ProgramRecord>
): ProgramRecord[] {
  const all = Array.from(programs);
  const childrenByParent = new Map<string, ProgramRecord[]>();
  for (const p of all) {
    if (p.parentProgramId) {
      const group = childrenByParent.get(p.parentProgramId) || [];
      group.push(p);
      childrenByParent.set(p.parentProgramId, group);
    }
  }

  const descendants: ProgramRecord[] = [];
  const visited = new Set<string>([programId]);
  const queue: string[] = [programId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const children = (childrenByParent.get(currentId) || []).sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        a.stageNumber - b.stageNumber ||
        a.title.localeCompare(b.title)
    );
    for (const child of children) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      descendants.push(child);
      queue.push(child.id);
    }
  }

  return descendants;
}

export type ProgramBreadcrumbsResult = ProgramRecord[] & {
  ids: string[];
  titles: string[];
  path: string;
  nodes: ProgramRecord[];
};

export function getProgramBreadcrumbs(
  programId: string,
  programsMap: Map<string, ProgramRecord>
): ProgramBreadcrumbsResult {
  const self = programsMap.get(programId);
  if (!self) {
    return Object.assign([] as ProgramRecord[], {
      ids: [] as string[],
      titles: [] as string[],
      path: '',
      nodes: [] as ProgramRecord[],
    });
  }
  const ancestors = getAncestors(programId, programsMap);
  const nodes = [...ancestors, self];
  const ids = nodes.map((n) => n.id);
  const titles = nodes.map((n) => n.title);
  return Object.assign([...nodes], {
    ids,
    titles,
    path: titles.join(' → '),
    nodes,
  });
}

/**
 * Detects any circular parent references in a set of programmes.
 */
export function detectCircularRelationships(
  programsMap: Map<string, ProgramRecord>
): string[][] {
  const cycles: string[][] = [];
  const globallyChecked = new Set<string>();

  for (const prog of programsMap.values()) {
    if (globallyChecked.has(prog.id)) continue;
    const pathIds: string[] = [];
    const pathSet = new Set<string>();
    let curr: ProgramRecord | undefined = prog;

    while (curr && curr.parentProgramId) {
      pathIds.push(curr.id);
      pathSet.add(curr.id);
      globallyChecked.add(curr.id);
      const nextId = curr.parentProgramId;
      if (pathSet.has(nextId)) {
        const cycleStart = pathIds.indexOf(nextId);
        cycles.push([...pathIds.slice(cycleStart), nextId]);
        break;
      }
      curr = programsMap.get(nextId);
    }
  }
  return cycles;
}

/**
 * Constructs a complete recursive tree from flat programme records.
 */
export function buildProgramTree(programsInput: Iterable<ProgramRecord>): ProgramTreeResult {
  const programsMap = new Map<string, ProgramRecord>();
  for (const p of programsInput) {
    programsMap.set(p.id, p);
  }

  const cycles = detectCircularRelationships(programsMap);
  const circularIds = Array.from(new Set(cycles.flat()));
  const invalidParentIds: string[] = [];

  const childrenMap = new Map<string, ProgramRecord[]>();
  const topLevelCandidates: ProgramRecord[] = [];

  for (const prog of programsMap.values()) {
    if (prog.parentProgramId) {
      if (
        !programsMap.has(prog.parentProgramId) ||
        prog.parentProgramId === prog.id ||
        circularIds.includes(prog.id)
      ) {
        invalidParentIds.push(prog.id);
        topLevelCandidates.push(prog);
      } else {
        const list = childrenMap.get(prog.parentProgramId) || [];
        list.push(prog);
        childrenMap.set(prog.parentProgramId, list);
      }
    } else {
      topLevelCandidates.push(prog);
    }
  }

  const allNodesMap = new Map<string, ProgramTreeNode>();
  const visitedBuild = new Set<string>();

  const buildNode = (
    prog: ProgramRecord,
    depth: number,
    ancestorIds: string[],
    ancestorTitles: string[]
  ): ProgramTreeNode => {
    visitedBuild.add(prog.id);
    const breadcrumbIds = [...ancestorIds, prog.id];
    const breadcrumbTitles = [...ancestorTitles, prog.title];
    const rawChildren = (childrenMap.get(prog.id) || []).sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        a.stageNumber - b.stageNumber ||
        a.title.localeCompare(b.title)
    );

    const childNodes: ProgramTreeNode[] = [];
    for (const child of rawChildren) {
      if (visitedBuild.has(child.id)) continue;
      childNodes.push(buildNode(child, depth + 1, breadcrumbIds, breadcrumbTitles));
    }

    const totalDescendantCount = childNodes.reduce(
      (sum, c) => sum + 1 + c.totalDescendantCount,
      0
    );

    const node: ProgramTreeNode = {
      program: {
        ...prog,
        ancestorIds,
        rootProgramId: breadcrumbIds[0] || prog.id,
      },
      children: childNodes,
      depth,
      breadcrumbIds,
      breadcrumbTitles,
      breadcrumbPath: breadcrumbTitles.join(' → '),
      directChildCount: childNodes.length,
      totalDescendantCount,
    };

    allNodesMap.set(prog.id, node);
    return node;
  };

  const roots: ProgramTreeNode[] = [];
  const unassigned: ProgramTreeNode[] = [];
  const archived: ProgramTreeNode[] = [];

  const sortedTopLevel = [...topLevelCandidates].sort((a, b) => {
    const aRootIdx = PRIMARY_PROGRAM_ROOTS.findIndex((r) => r.key === a.primaryRootKey);
    const bRootIdx = PRIMARY_PROGRAM_ROOTS.findIndex((r) => r.key === b.primaryRootKey);
    if (aRootIdx !== -1 && bRootIdx !== -1) return aRootIdx - bRootIdx;
    if (aRootIdx !== -1) return -1;
    if (bRootIdx !== -1) return 1;
    return (
      a.sortOrder - b.sortOrder ||
      a.stageNumber - b.stageNumber ||
      a.title.localeCompare(b.title)
    );
  });

  for (const top of sortedTopLevel) {
    if (visitedBuild.has(top.id)) continue;
    const treeNode = buildNode(top, 0, [], []);
    if (top.isArchived) {
      archived.push(treeNode);
    } else if (top.isPrimaryRoot || (!top.isUnassigned && !invalidParentIds.includes(top.id))) {
      roots.push(treeNode);
    } else {
      unassigned.push(treeNode);
    }
  }

  return {
    roots,
    unassigned,
    archived,
    allNodesMap,
    programsMap,
    circularIds,
    invalidParentIds,
  };
}

/**
 * Validates and previews moving a programme (and all its descendants) to a new parent or to Unassigned.
 */
export function previewBranchMove(
  programId: string,
  targetParentId: string | null,
  arg3: boolean | Map<string, ProgramRecord>,
  arg4?: number | undefined,
  arg5?: Map<string, ProgramRecord>
): BranchMoveValidationResult {
  const isShortOverload = arg3 instanceof Map;
  const moveToUnassigned = isShortOverload ? false : Boolean(arg3);
  const newSortOrder = isShortOverload ? undefined : arg4;
  const programsMap = (isShortOverload ? arg3 : arg5) || new Map<string, ProgramRecord>();

  const makeInvalid = (error: string): BranchMoveValidationResult => ({
    valid: false,
    isValid: false,
    error,
    affectedItems: [],
    affectedNodeIds: [],
    oldBreadcrumbPath: '',
    newBreadcrumbPath: '',
    descendantUpdates: [],
  });

  const subject = programsMap.get(programId);
  if (!subject) {
    return makeInvalid('Selected programme record was not found.');
  }

  if (targetParentId === programId) {
    return makeInvalid('Invalid move: A programme cannot be assigned as its own parent.');
  }

  const descendants = getAllDescendants(programId, programsMap.values());
  const descendantIds = new Set(descendants.map((d) => d.id));

  if (targetParentId && descendantIds.has(targetParentId)) {
    const target = programsMap.get(targetParentId);
    return makeInvalid(
      `Circular hierarchy prevented: Cannot move "${subject.title}" beneath its own descendant "${target?.title || targetParentId}".`
    );
  }

  let newParentAncestors: ProgramRecord[] = [];
  let targetParent: ProgramRecord | null = null;
  if (targetParentId) {
    targetParent = programsMap.get(targetParentId) || null;
    if (!targetParent) {
      return makeInvalid('Target parent programme does not exist.');
    }
    if (!targetParent.canContainChildren) {
      return makeInvalid(
        `"${targetParent.title}" is configured to not contain child programmes. Enable "Can contain children" or change its node behaviour first.`
      );
    }
    newParentAncestors = [...getAncestors(targetParentId, programsMap), targetParent];
  }

  const siblings = getDirectChildren(targetParentId, programsMap.values()).filter(
    (s) => s.id !== programId
  );
  const resolvedSortOrder =
    typeof newSortOrder === 'number' ? newSortOrder : siblings.length + 1;

  // Simulate updated map to compute accurate descendant paths
  const simulatedMap = new Map<string, ProgramRecord>(programsMap);
  const newSubjectAncestorIds = newParentAncestors.map((a) => a.id);
  const newSubjectRootId =
    newSubjectAncestorIds.length > 0
      ? newSubjectAncestorIds[0]
      : moveToUnassigned
      ? null
      : subject.id;

  simulatedMap.set(programId, {
    ...subject,
    parentProgramId: targetParentId,
    rootProgramId: newSubjectRootId,
    ancestorIds: newSubjectAncestorIds,
    sortOrder: resolvedSortOrder,
    isUnassigned: moveToUnassigned && !targetParentId,
  });

  const affectedItems: BranchMovePreviewItem[] = [];
  const allBranchNodes = [subject, ...descendants];

  for (const node of allBranchNodes) {
    const oldBc = getProgramBreadcrumbs(node.id, programsMap);
    const updatedParentId = node.id === programId ? targetParentId : node.parentProgramId;
    const currentSim = simulatedMap.get(node.id)!;
    const simAncestors = getAncestors(node.id, simulatedMap);
    const simAncestorIds = simAncestors.map((a) => a.id);
    const simRootId =
      simAncestorIds.length > 0
        ? simAncestorIds[0]
        : currentSim.isUnassigned
        ? null
        : node.id;

    simulatedMap.set(node.id, {
      ...currentSim,
      parentProgramId: updatedParentId,
      ancestorIds: simAncestorIds,
      rootProgramId: simRootId,
    });

    const newBc = getProgramBreadcrumbs(node.id, simulatedMap);

    affectedItems.push({
      id: node.id,
      programId: node.id,
      title: node.title,
      oldParentId: node.parentProgramId,
      newParentId: updatedParentId,
      oldRootId: node.rootProgramId,
      newRootId: simRootId,
      oldAncestorIds: node.ancestorIds,
      newAncestorIds: simAncestorIds,
      oldPath: oldBc.path,
      newPath: newBc.path,
      newSortOrder: node.id === programId ? resolvedSortOrder : node.sortOrder,
      isUnassigned: node.id === programId ? Boolean(moveToUnassigned && !targetParentId) : false,
    });
  }

  return {
    valid: true,
    isValid: true,
    affectedItems,
    affectedNodeIds: affectedItems.map((i) => i.programId),
    oldBreadcrumbPath: affectedItems[0]?.oldPath || subject.title,
    newBreadcrumbPath: affectedItems[0]?.newPath || subject.title,
    descendantUpdates: affectedItems,
  };
}

/**
 * Executes a validated branch move across all client databases without deleting or recreating any records.
 */
export async function executeBranchMove(
  previewOrProgramId: BranchMoveValidationResult | string,
  actorUidOrTargetParentId?: string | null,
  programsMap?: Map<string, ProgramRecord>,
  actorUid?: string | null
): Promise<void> {
  const preview: BranchMoveValidationResult =
    typeof previewOrProgramId === 'string'
      ? previewBranchMove(
          previewOrProgramId,
          actorUidOrTargetParentId ?? null,
          programsMap || new Map()
        )
      : previewOrProgramId;

  const resolvedActor =
    typeof previewOrProgramId === 'string' ? actorUid : actorUidOrTargetParentId;

  if (!preview.valid || preview.affectedItems.length === 0) {
    throw new Error(preview.error || 'No valid hierarchy changes to apply.');
  }

  const dbs = getAllClientDatabases();
  for (const database of dbs) {
    try {
      const batch = writeBatch(database);
      for (const item of preview.affectedItems) {
        const ref = doc(database, 'programs', item.programId);
        batch.set(
          ref,
          {
            parentProgramId: item.newParentId,
            rootProgramId: item.newRootId,
            ancestorIds: item.newAncestorIds,
            sortOrder: item.newSortOrder,
            order: item.newSortOrder,
            isUnassigned: item.isUnassigned,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
      await batch.commit();
    } catch (err) {
      if (database === db) throw err;
      console.warn('Secondary database branch move sync notice:', err);
    }
  }

  const rootItem = preview.affectedItems[0];
  await addDoc(collection(db, 'activityLogs'), {
    actorId: resolvedActor || 'admin',
    action: 'PROGRAM_HIERARCHY_BRANCH_MOVED',
    targetId: rootItem.programId,
    targetType: 'program',
    timestamp: serverTimestamp(),
    metadata: {
      title: rootItem.title,
      oldPath: rootItem.oldPath,
      newPath: rootItem.newPath,
      affectedDescendantsCount: preview.affectedItems.length - 1,
    },
  }).catch(() => undefined);
}

/**
 * Reorders sibling programmes beneath the same parent.
 */
export async function reorderSiblingPrograms(
  orderedProgramIds: string[],
  actorUid?: string | null
): Promise<void> {
  const dbs = getAllClientDatabases();
  for (const database of dbs) {
    try {
      const batch = writeBatch(database);
      orderedProgramIds.forEach((id, index) => {
        const nextOrder = index + 1;
        batch.set(
          doc(database, 'programs', id),
          {
            sortOrder: nextOrder,
            order: nextOrder,
            stageNumber: nextOrder,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      });
      await batch.commit();
    } catch (err) {
      if (database === db) throw err;
    }
  }

  await addDoc(collection(db, 'activityLogs'), {
    actorId: actorUid || 'admin',
    action: 'PROGRAM_SIBLINGS_REORDERED',
    targetId: orderedProgramIds[0] || 'programs',
    targetType: 'program',
    timestamp: serverTimestamp(),
    metadata: { orderedProgramIds },
  }).catch(() => undefined);
}

export function exportProgramsBackupJson(programsInput: Iterable<any>): string {
  const list = Array.from(programsInput);
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      version: 'JDI-PROGRAM-HIERARCHY-BACKUP-V1',
      count: list.length,
      programs: list,
    },
    null,
    2
  );
}

/**
 * Generates a non-destructive dry-run migration preview for existing flat programmes.
 * Never guesses uncertain parents from partial names; places uncertain records into Unassigned Programmes.
 */
export function generateHierarchyMigrationPreview(
  programsInput: Iterable<any>
): MigrationPreviewReport {
  const list = Array.from(programsInput).map((raw) =>
    raw && typeof raw.nodeType === 'string' && Array.isArray(raw.ancestorIds)
      ? (raw as ProgramRecord)
      : normalizeProgramRecord(String(raw?.id || ''), raw || {})
  );
  const programsMap = new Map<string, ProgramRecord>(list.map((p) => [p.id, p]));

  const existingRootsFound: { rootKey: string; programId: string; title: string }[] = [];
  const missingRootsToCreate: PrimaryRootDefinition[] = [];
  const rootIdByKey = new Map<string, { id: string; title: string }>();

  for (const rootDef of PRIMARY_PROGRAM_ROOTS) {
    const existing = list.find((p) => {
      const matched = matchPrimaryRootDefinition(p, p.id);
      return matched?.key === rootDef.key;
    });
    if (existing) {
      existingRootsFound.push({
        rootKey: rootDef.key,
        programId: existing.id,
        title: existing.title,
      });
      rootIdByKey.set(rootDef.key, { id: existing.id, title: existing.title });
    } else {
      missingRootsToCreate.push(rootDef);
      rootIdByKey.set(rootDef.key, { id: rootDef.canonicalId, title: rootDef.title });
    }
  }

  const circularRelationships = detectCircularRelationships(programsMap);
  const circularSet = new Set(circularRelationships.flat());
  const invalidParentReferences: {
    programId: string;
    title: string;
    invalidParentId: string;
  }[] = [];

  for (const prog of list) {
    if (prog.parentProgramId && !programsMap.has(prog.parentProgramId)) {
      invalidParentReferences.push({
        programId: prog.id,
        title: prog.title,
        invalidParentId: prog.parentProgramId,
      });
    }
  }

  const proposedMappings: MigrationProposedMapping[] = [];
  const unassignedPrograms: MigrationProposedMapping[] = [];
  let alreadyMigratedCount = 0;
  let highConfidenceMatches = 0;

  const byExactTitle = new Map<string, ProgramRecord>();
  list.forEach((p) => byExactTitle.set(normalizeText(p.title), p));

  for (const prog of list) {
    const legacyFields = {
      seriesName: prog.seriesName || '',
      programPack: prog.programPack || '',
      stageNumber: prog.stageNumber || 1,
      stageName: prog.stageName || '',
      categoryId: prog.categoryId || '',
    };

    const rootMatch = matchPrimaryRootDefinition(prog, prog.id);
    if (rootMatch && !prog.parentProgramId) {
      const alreadyMarkedRoot = prog.isPrimaryRoot && prog.rootProgramId === prog.id;
      if (alreadyMarkedRoot) alreadyMigratedCount++;
      else highConfidenceMatches++;
      proposedMappings.push({
        programId: prog.id,
        title: prog.title,
        currentParentId: null,
        proposedParentId: null,
        proposedParentTitle: 'Top-Level Primary Root',
        proposedRootId: prog.id,
        proposedRootTitle: prog.title,
        proposedAncestorIds: [],
        proposedNodeType: prog.nodeType === 'CONTAINER' ? 'CONTAINER' : 'HYBRID',
        proposedSortOrder: rootMatch.sortOrder,
        confidence: 'HIGH',
        action: alreadyMarkedRoot ? 'NO_CHANGE_NEEDED' : 'PROMOTE_TO_PRIMARY_ROOT',
        reason: `Matches primary catalogue root "${rootMatch.title}". Preserves existing document ID (${prog.id}).`,
        legacyFields,
      });
      continue;
    }

    if (
      prog.parentProgramId &&
      programsMap.has(prog.parentProgramId) &&
      !circularSet.has(prog.id)
    ) {
      alreadyMigratedCount++;
      const ancestors = getAncestors(prog.id, programsMap);
      const parent = programsMap.get(prog.parentProgramId)!;
      const root = ancestors[0] || parent;
      proposedMappings.push({
        programId: prog.id,
        title: prog.title,
        currentParentId: prog.parentProgramId,
        proposedParentId: prog.parentProgramId,
        proposedParentTitle: parent.title,
        proposedRootId: root.id,
        proposedRootTitle: root.title,
        proposedAncestorIds: ancestors.map((a) => a.id),
        proposedNodeType: prog.nodeType,
        proposedSortOrder: prog.sortOrder,
        confidence: 'HIGH',
        action: 'NO_CHANGE_NEEDED',
        reason: `Already linked to valid parent "${parent.title}" (${parent.id}).`,
        legacyFields,
      });
      continue;
    }

    const seriesKey = normalizeText(prog.seriesName || prog.programPack);
    const exactSeriesParent =
      seriesKey && byExactTitle.get(seriesKey)?.id !== prog.id
        ? byExactTitle.get(seriesKey)
        : undefined;

    if (exactSeriesParent && !circularSet.has(exactSeriesParent.id)) {
      highConfidenceMatches++;
      const parentAncestors = getAncestors(exactSeriesParent.id, programsMap);
      const ancestorIds = [...parentAncestors.map((a) => a.id), exactSeriesParent.id];
      const rootId = ancestorIds[0] || exactSeriesParent.id;
      const rootProg = programsMap.get(rootId) || exactSeriesParent;
      const mapping: MigrationProposedMapping = {
        programId: prog.id,
        title: prog.title,
        currentParentId: prog.parentProgramId,
        proposedParentId: exactSeriesParent.id,
        proposedParentTitle: exactSeriesParent.title,
        proposedRootId: rootId,
        proposedRootTitle: rootProg.title,
        proposedAncestorIds: ancestorIds,
        proposedNodeType: prog.nodeType,
        proposedSortOrder: prog.stageNumber || prog.sortOrder || 1,
        confidence: 'HIGH',
        action: 'ASSIGN_TO_ROOT',
        reason: `Explicit seriesName/programPack "${prog.seriesName || prog.programPack}" matches programme "${exactSeriesParent.title}".`,
        legacyFields,
      };
      proposedMappings.push(mapping);
      continue;
    }

    const normTitle = normalizeText(prog.title);
    const subMatch = KNOWN_SUB_PROGRAMMES.find((s) =>
      s.matchAliases.includes(normTitle) || normalizeText(s.title) === normTitle
    );

    if (subMatch) {
      highConfidenceMatches++;
      const targetRootInfo = rootIdByKey.get(subMatch.parentRootKey) || {
        id: subMatch.parentRootCanonicalId,
        title:
          PRIMARY_PROGRAM_ROOTS.find((r) => r.key === subMatch.parentRootKey)?.title ||
          'Primary Root',
      };
      const mapping: MigrationProposedMapping = {
        programId: prog.id,
        title: prog.title,
        currentParentId: prog.parentProgramId,
        proposedParentId: targetRootInfo.id,
        proposedParentTitle: targetRootInfo.title,
        proposedRootId: targetRootInfo.id,
        proposedRootTitle: targetRootInfo.title,
        proposedAncestorIds: [targetRootInfo.id],
        proposedNodeType: prog.nodeType === 'CONTAINER' ? 'CONTAINER' : 'HYBRID',
        proposedSortOrder: prog.sortOrder || 1,
        confidence: 'HIGH',
        action: 'ASSIGN_TO_ROOT',
        reason: `Canonical sub-programme belonging under primary category "${targetRootInfo.title}". Preserves existing document ID (${prog.id}).`,
        legacyFields,
      };
      proposedMappings.push(mapping);
      continue;
    }

    const unassignedEntry: MigrationProposedMapping = {
      programId: prog.id,
      title: prog.title,
      currentParentId: prog.parentProgramId,
      proposedParentId: null,
      proposedParentTitle: 'Unassigned Programmes (Awaiting Admin Placement)',
      proposedRootId: null,
      proposedRootTitle: 'Unassigned',
      proposedAncestorIds: [],
      proposedNodeType: prog.nodeType,
      proposedSortOrder: prog.stageNumber || prog.sortOrder || 1,
      confidence: 'UNCERTAIN',
      action: 'FLAG_UNASSIGNED',
      reason: prog.seriesName
        ? `Has legacy series "${prog.seriesName}" (Stage ${prog.stageNumber}), but no confirmed parent container ID yet. Placed in Unassigned Programmes for safe review.`
        : 'No explicit parentProgramId or verified series parent container. Preserved in Unassigned Programmes without guessing.',
      legacyFields,
    };
    proposedMappings.push(unassignedEntry);
    unassignedPrograms.push(unassignedEntry);
  }

  const exportBackupJson = exportProgramsBackupJson(list);

  return {
    generatedAt: new Date().toISOString(),
    totalProgramsInspected: list.length,
    totalExistingPrograms: list.length,
    highConfidenceMatches,
    unassignedForReviewCount: unassignedPrograms.length,
    alreadyConfiguredCount: alreadyMigratedCount,
    existingRootsFound,
    missingRootsToCreate,
    proposedMappings,
    items: proposedMappings,
    unassignedPrograms,
    alreadyMigratedCount,
    invalidParentReferences,
    circularRelationships,
    exportBackupJson,
  };
}

/**
 * Executes the authorised, idempotent hierarchy migration after administrator review.
 */
export async function executeAuthorisedHierarchyMigration(
  preview: MigrationPreviewReport,
  arg2:
    | string[]
    | {
        ensureFourPrimaryRoots?: boolean;
        approvedProgramIds: string[];
        actorUid?: string | null;
        actorEmail?: string | null;
      },
  arg3?: boolean,
  arg4?: string | null
): Promise<{
  rootsCreated: number;
  rootsCreatedOrUpdated: number;
  programsUpdated: number;
  unassignedFlagged: number;
  migrationId: string;
}> {
  const isOptionsObj = !Array.isArray(arg2);
  const approvedProgramIds = isOptionsObj ? arg2.approvedProgramIds : arg2;
  const createMissingPrimaryRoots = isOptionsObj
    ? arg2.ensureFourPrimaryRoots !== false
    : arg3 !== false;
  const actorUid = isOptionsObj ? arg2.actorUid : arg4;

  const approvedSet = new Set(approvedProgramIds);
  const dbs = getAllClientDatabases();
  let rootsCreated = 0;
  let programsUpdated = 0;
  let unassignedFlagged = 0;

  for (const database of dbs) {
    try {
      const batch = writeBatch(database);

      if (createMissingPrimaryRoots) {
        for (const rootDef of preview.missingRootsToCreate) {
          const ref = doc(database, 'programs', rootDef.canonicalId);
          batch.set(
            ref,
            {
              title: rootDef.title,
              slug: rootDef.slug,
              categoryId: rootDef.categoryId,
              shortDescription: rootDef.shortDescription,
              fullDescription: rootDef.shortDescription,
              parentProgramId: null,
              rootProgramId: rootDef.canonicalId,
              ancestorIds: [],
              sortOrder: rootDef.sortOrder,
              order: rootDef.sortOrder,
              nodeType: 'HYBRID',
              canContainChildren: true,
              isEnrollable: true,
              isPublished: true,
              isArchived: false,
              isUnassigned: false,
              isPrimaryRoot: true,
              primaryRootKey: rootDef.key,
              status: 'PUBLISHED',
              isRequired: true,
              deliveryOptions: ['PUBLIC_GROUP', 'PRIVATE_MENTORSHIP', 'SCHOOL_COHORT'],
              updatedAt: serverTimestamp(),
              createdAt: serverTimestamp(),
            },
            { merge: true }
          );
          if (database === db) rootsCreated++;
        }
      }

      for (const mapping of preview.proposedMappings) {
        const isPrimaryRoot =
          mapping.action === 'PROMOTE_TO_PRIMARY_ROOT' ||
          mapping.confidence === 'PRIMARY_ROOT_MATCH';
        const isUnassigned =
          mapping.action === 'FLAG_UNASSIGNED' ||
          (mapping.confidence === 'UNCERTAIN' && !mapping.proposedParentId);

        if (!approvedSet.has(mapping.programId) && !isUnassigned) continue;

        const ref = doc(database, 'programs', mapping.programId);
        const matchedRootDef = PRIMARY_PROGRAM_ROOTS.find(
          (r) =>
            r.canonicalId === mapping.programId ||
            r.matchAliases.includes(normalizeText(mapping.title))
        );

        batch.set(
          ref,
          {
            parentProgramId: approvedSet.has(mapping.programId)
              ? mapping.proposedParentId
              : mapping.currentParentId,
            rootProgramId: approvedSet.has(mapping.programId) ? mapping.proposedRootId : null,
            ancestorIds: approvedSet.has(mapping.programId) ? mapping.proposedAncestorIds : [],
            sortOrder: mapping.proposedSortOrder,
            nodeType: mapping.proposedNodeType,
            canContainChildren: true,
            isEnrollable: mapping.proposedNodeType !== 'CONTAINER',
            isUnassigned,
            isPrimaryRoot,
            ...(isPrimaryRoot && matchedRootDef ? { primaryRootKey: matchedRootDef.key } : {}),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        if (database === db) {
          if (isUnassigned) unassignedFlagged++;
          else programsUpdated++;
        }
      }

      await batch.commit();
    } catch (err) {
      if (database === db) throw err;
      console.warn('Secondary database migration sync notice:', err);
    }
  }

  const migrationRecord = await addDoc(collection(db, 'programHierarchyMigrations'), {
    executedBy: actorUid || 'admin',
    executedAt: serverTimestamp(),
    rootsCreated,
    programsUpdated,
    unassignedPreservedCount: preview.unassignedPrograms.length,
    totalInspected: preview.totalProgramsInspected,
    existingRootsFound: preview.existingRootsFound,
    missingRootsCreated: createMissingPrimaryRoots
      ? preview.missingRootsToCreate.map((r) => r.canonicalId)
      : [],
  });

  await addDoc(collection(db, 'activityLogs'), {
    actorId: actorUid || 'admin',
    action: 'PROGRAM_HIERARCHY_MIGRATION_EXECUTED',
    targetId: migrationRecord.id,
    targetType: 'programHierarchyMigration',
    timestamp: serverTimestamp(),
    metadata: {
      rootsCreated,
      programsUpdated,
      unassignedCount: preview.unassignedPrograms.length,
    },
  }).catch(() => undefined);

  return {
    rootsCreated,
    rootsCreatedOrUpdated: rootsCreated + preview.existingRootsFound.length,
    programsUpdated,
    unassignedFlagged,
    migrationId: migrationRecord.id,
  };
}

export async function fetchTutorProgramProposals(
  tutorUid?: string
): Promise<TutorProgramProposal[]> {
  const snap = await getDocs(collection(db, 'programProposals')).catch(() => ({ docs: [] } as any));
  const list: TutorProgramProposal[] = snap.docs.map((d: any) => {
    const raw = d.data() || {};
    return {
      id: d.id,
      title: String(raw.title || ''),
      slug: String(raw.slug || ''),
      description: String(raw.description || ''),
      parentProgramId: String(raw.parentProgramId || ''),
      parentProgramTitle: String(raw.parentProgramTitle || ''),
      parentBreadcrumbPath: String(
        raw.parentBreadcrumbPath || raw.parentProgramTitle || ''
      ),
      rootProgramId: raw.rootProgramId || null,
      ancestorIds: Array.isArray(raw.ancestorIds) ? raw.ancestorIds : [],
      proposedNodeType: (raw.proposedNodeType as ProgramNodeType) || 'ENROLLABLE',
      canContainChildren: raw.canContainChildren !== false,
      isEnrollable: raw.isEnrollable !== false,
      isRequired: raw.isRequired !== false,
      curriculum: Array.isArray(raw.curriculum) ? raw.curriculum : [],
      learningObjectives: Array.isArray(raw.learningObjectives) ? raw.learningObjectives : [],
      prerequisiteProgramIds: Array.isArray(raw.prerequisiteProgramIds)
        ? raw.prerequisiteProgramIds
        : [],
      deliveryOptions: Array.isArray(raw.deliveryOptions)
        ? raw.deliveryOptions
        : ['PUBLIC_GROUP', 'PRIVATE_MENTORSHIP'],
      duration: String(raw.duration || '8 Weeks'),
      sessionsPerWeek: Number(raw.sessionsPerWeek || 2),
      sessionDuration: String(raw.sessionDuration || '60 mins'),
      proposedByUid: String(raw.proposedByUid || raw.tutorUid || ''),
      proposedByName: String(raw.proposedByName || raw.tutorName || 'Tutor'),
      proposedByEmail: String(raw.proposedByEmail || raw.tutorEmail || ''),
      tutorUid: String(raw.tutorUid || raw.proposedByUid || ''),
      tutorName: String(raw.tutorName || raw.proposedByName || 'Tutor'),
      tutorEmail: String(raw.tutorEmail || raw.proposedByEmail || ''),
      status: raw.status || 'PENDING',
      adminReviewNotes: raw.adminReviewNotes || '',
      reviewedByUid: raw.reviewedByUid || '',
      reviewedByName: raw.reviewedByName || '',
      reviewedAt: raw.reviewedAt || null,
      createdProgramId: raw.createdProgramId || undefined,
      createdAt: raw.createdAt || null,
      updatedAt: raw.updatedAt || null,
    };
  });

  if (tutorUid) {
    return list.filter(
      (item) => item.proposedByUid === tutorUid || item.tutorUid === tutorUid
    );
  }
  return list;
}

/**
 * Tutor Programme Proposal Services (Phase 3 Section 7)
 */
export async function submitTutorProgramProposal(input: {
  title: string;
  description: string;
  parentProgramId: string;
  proposedNodeType: ProgramNodeType;
  isRequired: boolean;
  curriculum: string[];
  learningObjectives: string[];
  prerequisiteProgramIds: string[];
  deliveryOptions: ProgramDeliveryOption[];
  duration: string;
  sessionsPerWeek: number;
  sessionDuration: string;
  proposedByUid?: string;
  proposedByName?: string;
  proposedByEmail?: string;
  tutorUid?: string;
  tutorName?: string;
  tutorEmail?: string;
  programsMap: Map<string, ProgramRecord>;
}): Promise<string> {
  if (!input.title.trim()) {
    throw new Error('Proposed sub-programme title is required.');
  }
  if (!input.parentProgramId) {
    throw new Error(
      'Tutors must select an existing parent programme. Only administrators can create top-level root programmes.'
    );
  }
  const parent = input.programsMap.get(input.parentProgramId);
  if (!parent) {
    throw new Error('Selected parent programme could not be found.');
  }
  if (!parent.canContainChildren) {
    throw new Error(`"${parent.title}" is not configured to contain nested sub-programmes.`);
  }

  const parentAncestors = getAncestors(parent.id, input.programsMap);
  const ancestorIds = [...parentAncestors.map((a) => a.id), parent.id];
  const rootProgramId = ancestorIds[0] || parent.id;
  const parentBreadcrumbPath = [...parentAncestors.map((a) => a.title), parent.title].join(' › ');
  const resolvedUid = input.proposedByUid || input.tutorUid || '';
  const resolvedName = input.proposedByName || input.tutorName || 'Tutor';
  const resolvedEmail = input.proposedByEmail || input.tutorEmail || '';

  const payload = {
    title: input.title.trim(),
    slug: slugifyTitle(input.title),
    description: input.description.trim(),
    parentProgramId: parent.id,
    parentProgramTitle: parent.title,
    parentBreadcrumbPath,
    rootProgramId,
    ancestorIds,
    proposedNodeType: input.proposedNodeType,
    canContainChildren: true,
    isEnrollable: input.proposedNodeType !== 'CONTAINER',
    isRequired: input.isRequired,
    curriculum: input.curriculum.filter(Boolean),
    learningObjectives: input.learningObjectives.filter(Boolean),
    prerequisiteProgramIds: input.prerequisiteProgramIds.filter(Boolean),
    deliveryOptions: input.deliveryOptions,
    duration: input.duration || '8 Weeks',
    sessionsPerWeek: Number(input.sessionsPerWeek || 2),
    sessionDuration: input.sessionDuration || '60 mins',
    proposedByUid: resolvedUid,
    proposedByName: resolvedName,
    proposedByEmail: resolvedEmail,
    tutorUid: resolvedUid,
    tutorName: resolvedName,
    tutorEmail: resolvedEmail,
    status: 'PENDING' as const,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const docRef = await addDoc(collection(db, 'programProposals'), payload);
  await addDoc(collection(db, 'activityLogs'), {
    actorId: resolvedUid,
    action: 'TUTOR_PROGRAM_PROPOSAL_SUBMITTED',
    targetId: docRef.id,
    targetType: 'programProposal',
    timestamp: serverTimestamp(),
    metadata: {
      title: payload.title,
      parentProgramId: parent.id,
      parentProgramTitle: parent.title,
    },
  }).catch(() => undefined);

  return docRef.id;
}

export async function reviewTutorProgramProposal(input: {
  proposal: TutorProgramProposal;
  decision: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED';
  adminReviewNotes: string;
  reviewerUid: string;
  reviewerName: string;
  publicGroupPrice?: number;
  privateMentorshipPrice?: number;
  publishImmediately?: boolean;
  programsMap: Map<string, ProgramRecord>;
}): Promise<{ createdProgramId?: string }> {
  const { proposal, decision, adminReviewNotes, reviewerUid, reviewerName, programsMap } = input;

  if (decision === 'REJECTED' || decision === 'CHANGES_REQUESTED') {
    await updateDoc(doc(db, 'programProposals', proposal.id), {
      status: decision,
      adminReviewNotes: adminReviewNotes.trim(),
      reviewedByUid: reviewerUid,
      reviewedByName: reviewerName,
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return {};
  }

  const parent = programsMap.get(proposal.parentProgramId);
  if (!parent) {
    throw new Error('Cannot approve proposal: The target parent programme no longer exists.');
  }
  const siblings = getDirectChildren(parent.id, programsMap.values());
  const parentAncestors = getAncestors(parent.id, programsMap);
  const ancestorIds = [...parentAncestors.map((a) => a.id), parent.id];
  const rootProgramId = ancestorIds[0] || parent.id;
  const sortOrder = siblings.length + 1;

  const newProgRef = doc(collection(db, 'programs'));
  const pubPrice = typeof input.publicGroupPrice === 'number' ? input.publicGroupPrice : 35000;
  const privPrice =
    typeof input.privateMentorshipPrice === 'number' ? input.privateMentorshipPrice : 60000;
  const isPublished = input.publishImmediately !== false;

  const programData = {
    title: proposal.title,
    slug: proposal.slug || slugifyTitle(proposal.title),
    categoryId: parent.categoryId || 'DIGITAL_AND_TECHNOLOGY',
    shortDescription: proposal.description,
    fullDescription: proposal.description,
    description: proposal.description,
    parentProgramId: parent.id,
    rootProgramId,
    ancestorIds,
    sortOrder,
    order: sortOrder,
    stageNumber: sortOrder,
    stageName: `Stage ${sortOrder}: ${proposal.title}`,
    seriesName: parent.title,
    programPack: parent.title,
    nodeType: proposal.proposedNodeType || 'ENROLLABLE',
    canContainChildren: true,
    isEnrollable: proposal.proposedNodeType !== 'CONTAINER',
    isPublished,
    isArchived: false,
    isUnassigned: false,
    isPrimaryRoot: false,
    status: isPublished ? 'PUBLISHED' : 'DRAFT',
    isRequired: proposal.isRequired !== false,
    curriculum: proposal.curriculum || [],
    outcomes: proposal.learningObjectives || [],
    learningObjectives: proposal.learningObjectives || [],
    prerequisiteProgramIds: proposal.prerequisiteProgramIds || [],
    deliveryOptions: proposal.deliveryOptions || ['PUBLIC_GROUP', 'PRIVATE_MENTORSHIP'],
    duration: proposal.duration || '8 Weeks',
    deliveryMode: 'Online / Hybrid',
    sessionsPerWeek: proposal.sessionsPerWeek || 2,
    sessionDuration: proposal.sessionDuration || '60 mins',
    pricing: `₦${pubPrice.toLocaleString()}`,
    price: pubPrice,
    publicGroupPricing: {
      amount: pubPrice,
      currency: 'NGN',
      billingCycle: 'Per Term / Cohort',
      label: 'Public Group Class',
    },
    privateMentorshipPricing: {
      amount: privPrice,
      currency: 'NGN',
      billingCycle: 'Per Month / Private 1-on-1',
      label: 'Private 1-on-1 Mentorship',
    },
    proposedByTutorUid: proposal.proposedByUid,
    proposedByTutorName: proposal.proposedByName,
    approvedFromProposalId: proposal.id,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const dbs = getAllClientDatabases();
  await Promise.all(
    dbs.map((database: Firestore) =>
      setDoc(doc(database, 'programs', newProgRef.id), programData, { merge: true }).catch(
        (err) => {
          if (database === db) throw err;
        }
      )
    )
  );

  await updateDoc(doc(db, 'programProposals', proposal.id), {
    status: 'APPROVED',
    adminReviewNotes: adminReviewNotes.trim(),
    reviewedByUid: reviewerUid,
    reviewedByName: reviewerName,
    reviewedAt: serverTimestamp(),
    createdProgramId: newProgRef.id,
    updatedAt: serverTimestamp(),
  });

  return { createdProgramId: newProgRef.id };
}
