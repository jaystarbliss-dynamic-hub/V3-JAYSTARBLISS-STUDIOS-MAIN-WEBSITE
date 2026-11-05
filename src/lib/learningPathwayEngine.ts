import {
  collection,
  doc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';
import { db, getAllClientDatabases } from './firebase';
import {
  type ProgramRecord,
  type ProgramDeliveryOption,
  getAncestors,
  getAllDescendants,
  getDirectChildren,
  getProgramBreadcrumbs,
  getRootProgram,
} from './programHierarchy';

export type LearningUnitStatus =
  | 'NOT_STARTED'
  | 'UPCOMING'
  | 'CURRENT'
  | 'COMPLETED'
  | 'LOCKED'
  | 'OPTIONAL'
  | 'PRIOR_LEARNING_APPROVED';

export type PriorLearningStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type PriorLearningRecognitionType =
  | 'PRIOR_COMPLETION'
  | 'PORTFOLIO_VERIFIED'
  | 'ASSESSMENT_PASSED'
  | 'CREDIT_TRANSFER'
  | 'EXEMPTION';

export interface PriorLearningRecognitionRecord {
  id: string;
  studentId: string;
  studentName?: string;
  enrolmentId?: string;
  programId: string;
  programTitle: string;
  programPath: string;
  status: PriorLearningStatus;
  recognitionType: PriorLearningRecognitionType;
  evidenceReference: string;
  verificationNotes: string;
  requestedByUid: string;
  requestedByName: string;
  requestedByRole: 'STUDENT' | 'PARENT' | 'TUTOR' | 'ADMIN';
  requestedAt?: any;
  verifiedByUid?: string;
  verifiedByName?: string;
  verifiedByRole?: 'TUTOR' | 'ADMIN';
  verifiedAt?: any;
  updatedAt?: any;
}

export interface StudentUnitProgressRecord {
  id: string;
  studentId: string;
  programId: string;
  programTitle: string;
  programPath: string;
  progress: number; // 0 to 100
  selfProgress?: number; // For HYBRID nodes that have both own curriculum and child programmes
  status: LearningUnitStatus;
  completedLessons: number;
  totalLessons: number;
  completedTopics: string[];
  tutorNotes: string;
  evidenceReference: string;
  assessmentIds: string[];
  lastUpdatedByUid?: string;
  lastUpdatedByName?: string;
  completedAt?: string | null;
  updatedAt?: any;
}

export interface StudentPathwayConfig {
  pathwayStatus: 'CONFIGURED' | 'PENDING_PROGRAMME_CONFIRMATION';
  enrolledRootProgramIds: string[];
  selectedProgramIds: string[]; // Exact nodes chosen by admin/student during enrolment
  assignedProgramIds: string[]; // Expanded leaf/hybrid learning unit IDs in scope
  optionalProgramIds: string[]; // Specific units marked optional for this student
  excludedProgramIds: string[]; // Units explicitly excluded from a branch enrolment
  currentFocusProgramIds: string[]; // Active learning units currently being taught
  deliveryType: ProgramDeliveryOption;
  pricingArrangement: {
    mode: 'PUBLIC_GROUP' | 'PRIVATE_MENTORSHIP' | 'SCHOOL_COHORT' | 'CUSTOM';
    amount: number;
    currency: string;
    billingCycle: string;
    notes?: string;
  };
  assignedTutorId?: string;
  assignedTutorName?: string;
}

export interface ResolvedEnrolmentScope {
  enrolledRootPrograms: ProgramRecord[];
  selectedNodes: ProgramRecord[];
  visibleTreeProgramIds: Set<string>; // Includes ancestors for context + selected nodes + in-scope descendants
  assignedLearningUnits: ProgramRecord[]; // Only ENROLLABLE or HYBRID nodes in scope (excludes CONTAINER)
  requiredLearningUnits: ProgramRecord[];
  optionalLearningUnits: ProgramRecord[];
  structuralContainersInScope: ProgramRecord[];
}

export interface ComputedProgramNodeProgress {
  program: ProgramRecord;
  breadcrumbPath: string;
  depth: number;
  isContainer: boolean;
  isHybrid: boolean;
  isEnrollableLeaf: boolean;
  isDirectlyEnrolledScope: boolean;
  isAncestorContextOnly: boolean;
  isRequiredForStudent: boolean;
  status: LearningUnitStatus;
  // Direct unit metrics (applicable to ENROLLABLE and HYBRID self-requirement)
  selfProgress: number; // 0 - 100
  selfStatus: LearningUnitStatus;
  completedLessons: number;
  totalLessons: number;
  completedTopics: string[];
  tutorNotes: string;
  evidenceReference: string;
  // Aggregate metrics (for CONTAINER, HYBRID, and Root/Branch parents)
  aggregateProgress: number; // 0 - 100 across required learning units in this branch
  completedRequiredUnitsCount: number;
  totalRequiredUnitsCount: number;
  completedOptionalUnitsCount: number;
  totalOptionalUnitsCount: number;
  // Prerequisites
  missingPrerequisites: ProgramRecord[];
  isLockedByPrerequisite: boolean;
  // Prior learning recognition
  priorLearningRecord: PriorLearningRecognitionRecord | null;
  children: ComputedProgramNodeProgress[];
}

export interface StudentPathwayProgressSummary {
  pathwayStatus: 'CONFIGURED' | 'PENDING_PROGRAMME_CONFIRMATION';
  overallProgress: number; // 0 - 100 across all required learning units in student's pathway
  totalRequiredUnits: number;
  completedRequiredUnits: number;
  priorLearningApprovedUnits: number;
  inProgressUnits: number;
  upcomingUnits: number;
  lockedUnits: number;
  optionalUnits: number;
  rootBranches: ComputedProgramNodeProgress[];
  flatUnitsMap: Map<string, ComputedProgramNodeProgress>;
  currentUnits: ComputedProgramNodeProgress[];
  nextRecommendedUnits: ComputedProgramNodeProgress[];
  completedUnitsList: ComputedProgramNodeProgress[];
}

/**
 * Resolves a student's existing record into a normalized list of selected programme IDs
 * without EVER inventing a default or choosing programs[0].
 * If the student has legacy track names or titles that match a known programme with high confidence,
 * it maps them; otherwise it returns an empty selection and `PENDING_PROGRAMME_CONFIRMATION`.
 */
export function extractStudentSelectedProgramIds(
  studentRecord: any,
  programsMap: Map<string, ProgramRecord>
): {
  selectedProgramIds: string[];
  optionalProgramIds: string[];
  excludedProgramIds: string[];
  currentFocusProgramIds: string[];
  hasExplicitConfiguration: boolean;
} {
  if (!studentRecord) {
    return {
      selectedProgramIds: [],
      optionalProgramIds: [],
      excludedProgramIds: [],
      currentFocusProgramIds: [],
      hasExplicitConfiguration: false,
    };
  }

  const validIds = new Set<string>();
  const optionalIds = new Set<string>();
  const excludedIds = new Set<string>();
  const currentFocusIds = new Set<string>();

  if (Array.isArray(studentRecord.excludedProgramIds)) {
    for (const id of studentRecord.excludedProgramIds) {
      if (typeof id === 'string' && programsMap.has(id)) {
        excludedIds.add(id);
      }
    }
  }

  if (Array.isArray(studentRecord.optionalProgramIds)) {
    for (const id of studentRecord.optionalProgramIds) {
      if (typeof id === 'string' && programsMap.has(id)) {
        optionalIds.add(id);
      }
    }
  }

  if (Array.isArray(studentRecord.currentFocusProgramIds)) {
    for (const id of studentRecord.currentFocusProgramIds) {
      if (typeof id === 'string' && programsMap.has(id)) {
        currentFocusIds.add(id);
      }
    }
  }

  // 1. Check explicit Phase 4 fields first
  const candidateArrays = [
    studentRecord.selectedProgramIds,
    studentRecord.assignedProgramIds,
    studentRecord.assignedTrackIds,
    studentRecord.enrolledProgramIds,
  ];

  for (const arr of candidateArrays) {
    if (Array.isArray(arr)) {
      for (const rawId of arr) {
        if (typeof rawId === 'string' && programsMap.has(rawId)) {
          validIds.add(rawId);
        }
      }
    }
  }

  if (typeof studentRecord.programId === 'string' && programsMap.has(studentRecord.programId)) {
    validIds.add(studentRecord.programId);
  }

  if (validIds.size > 0) {
    return {
      selectedProgramIds: Array.from(validIds),
      optionalProgramIds: Array.from(optionalIds),
      excludedProgramIds: Array.from(excludedIds),
      currentFocusProgramIds: Array.from(currentFocusIds),
      hasExplicitConfiguration: true,
    };
  }

  // 2. Check exact title match from enrolledPrograms or explicitly named program (excluding generic placeholders)
  const genericPlaceholders = new Set([
    'general track',
    'standard tech track',
    'general tech track',
    'technology & hardware & electronics foundation',
    'technology, hardware and electronics foundation',
    'unassigned',
    'pending',
    'none',
    'n/a',
  ]);

  const titleCandidates: string[] = [];
  if (Array.isArray(studentRecord.enrolledPrograms)) {
    for (const item of studentRecord.enrolledPrograms) {
      if (typeof item === 'string') titleCandidates.push(item);
      else if (item && typeof item.programId === 'string' && programsMap.has(item.programId)) {
        validIds.add(item.programId);
      } else if (item && typeof item.title === 'string') {
        titleCandidates.push(item.title);
      }
    }
  }
  if (typeof studentRecord.programName === 'string') titleCandidates.push(studentRecord.programName);
  if (typeof studentRecord.chosenProgram === 'string') titleCandidates.push(studentRecord.chosenProgram);
  if (typeof studentRecord.selectedPlan === 'string') titleCandidates.push(studentRecord.selectedPlan);
  if (typeof studentRecord.track === 'string') titleCandidates.push(studentRecord.track);

  const allPrograms = Array.from(programsMap.values());
  for (const rawTitle of titleCandidates) {
    const clean = rawTitle.trim().toLowerCase();
    if (!clean || genericPlaceholders.has(clean)) continue;
    const exactMatch = allPrograms.find(
      (p) =>
        !p.isArchived &&
        (p.title.trim().toLowerCase() === clean ||
          p.id.toLowerCase() === clean ||
          p.slug.toLowerCase() === clean)
    );
    if (exactMatch) {
      validIds.add(exactMatch.id);
    }
  }

  return {
    selectedProgramIds: Array.from(validIds),
    optionalProgramIds: Array.from(optionalIds),
    excludedProgramIds: Array.from(excludedIds),
    currentFocusProgramIds: Array.from(currentFocusIds),
    hasExplicitConfiguration: validIds.size > 0,
  };
}

/**
 * Resolves the exact enrolment scope for a student given their selected programme IDs.
 * - If a parent/root or sub-programme branch is selected, all non-archived descendants in that branch
 *   are included unless listed in `excludedProgramIds`.
 * - If a specific nested sub-programme is selected, ONLY that nested sub-programme (and its own descendants)
 *   are enrolled — sibling branches are NOT included.
 * - Ancestors of selected nested programmes are included in `visibleTreeProgramIds` as structural context
 *   so the full breadcrumb hierarchy is always visible.
 */
export function resolveEnrolmentScope(
  selectedProgramIds: string[],
  programsMap: Map<string, ProgramRecord>,
  options?: {
    optionalProgramIds?: string[];
    excludedProgramIds?: string[];
  }
): ResolvedEnrolmentScope {
  const optionalSet = new Set(options?.optionalProgramIds || []);
  const excludedSet = new Set(options?.excludedProgramIds || []);

  const selectedNodes: ProgramRecord[] = [];
  const inScopeIds = new Set<string>();
  const visibleTreeProgramIds = new Set<string>();
  const rootMap = new Map<string, ProgramRecord>();

  for (const id of selectedProgramIds) {
    const prog = programsMap.get(id);
    if (!prog || prog.isArchived || excludedSet.has(prog.id)) continue;
    selectedNodes.push(prog);
    inScopeIds.add(prog.id);
    visibleTreeProgramIds.add(prog.id);

    // Include ancestors in visibleTreeProgramIds for tree context
    const ancestors = getAncestors(prog.id, programsMap);
    for (const anc of ancestors) {
      visibleTreeProgramIds.add(anc.id);
    }

    const root = getRootProgram(prog.id, programsMap);
    if (root) {
      rootMap.set(root.id, root);
      visibleTreeProgramIds.add(root.id);
    }

    // Include non-archived descendants of the selected node (unless explicitly excluded)
    const descendants = getAllDescendants(prog.id, programsMap.values());
    for (const desc of descendants) {
      if (desc.isArchived || excludedSet.has(desc.id)) continue;
      // Also check if any ancestor between prog and desc was excluded
      const descAncestors = getAncestors(desc.id, programsMap);
      if (descAncestors.some((a) => excludedSet.has(a.id))) continue;

      inScopeIds.add(desc.id);
      visibleTreeProgramIds.add(desc.id);
    }
  }

  const assignedLearningUnits: ProgramRecord[] = [];
  const requiredLearningUnits: ProgramRecord[] = [];
  const optionalLearningUnits: ProgramRecord[] = [];
  const structuralContainersInScope: ProgramRecord[] = [];

  for (const id of inScopeIds) {
    const prog = programsMap.get(id);
    if (!prog) continue;

    if (prog.nodeType === 'CONTAINER' || !prog.isEnrollable) {
      structuralContainersInScope.push(prog);
      continue;
    }

    assignedLearningUnits.push(prog);
    const isOptional = !prog.isRequired || optionalSet.has(prog.id);
    if (isOptional) {
      optionalLearningUnits.push(prog);
    } else {
      requiredLearningUnits.push(prog);
    }
  }

  return {
    enrolledRootPrograms: Array.from(rootMap.values()).sort((a, b) => a.sortOrder - b.sortOrder),
    selectedNodes,
    visibleTreeProgramIds,
    assignedLearningUnits,
    requiredLearningUnits,
    optionalLearningUnits,
    structuralContainersInScope,
  };
}

/**
 * Computes the complete recursive learning progress tree and summary for a student.
 * Enforces all Phase 5 rules:
 * 1. Structural containers (`CONTAINER`) never count in the denominator; they show the aggregate of their required descendants.
 * 2. Leaf enrollable programmes (`ENROLLABLE`) count their own curriculum/lesson completion.
 * 3. Hybrid programmes (`HYBRID`) track their own direct requirement (`selfProgress`) + descendant units without double-counting.
 * 4. Optional programmes (`isRequired === false` or in `optionalProgramIds`) are marked `OPTIONAL` and do not block mandatory completion.
 * 5. Prior-Learning Approved (`PRIOR_LEARNING_APPROVED`) satisfies that exact unit (`100%`) and its prerequisite role without completing unrelated branches.
 * 6. Prerequisites (`prerequisiteProgramIds`) mark a unit as `LOCKED` if any prerequisite is not yet completed or prior-learning-approved.
 */
export function calculateStudentPathwayProgress(input: {
  studentRecord: any;
  programsMap: Map<string, ProgramRecord>;
  progressRecords: StudentUnitProgressRecord[];
  priorLearningRecords: PriorLearningRecognitionRecord[];
}): StudentPathwayProgressSummary {
  const { studentRecord, programsMap, progressRecords, priorLearningRecords } = input;

  const extracted = extractStudentSelectedProgramIds(studentRecord, programsMap);
  const scope = resolveEnrolmentScope(extracted.selectedProgramIds, programsMap, {
    optionalProgramIds: extracted.optionalProgramIds,
    excludedProgramIds: extracted.excludedProgramIds,
  });

  const currentFocusSet = new Set(extracted.currentFocusProgramIds);

  // Index progress records by programId (and fallback title match for legacy courseProgress docs)
  const progressByProgramId = new Map<string, StudentUnitProgressRecord>();
  for (const rec of progressRecords) {
    if (rec.programId && programsMap.has(rec.programId)) {
      progressByProgramId.set(rec.programId, rec);
    } else if (rec.programTitle) {
      const cleanTitle = rec.programTitle.trim().toLowerCase();
      for (const prog of programsMap.values()) {
        if (prog.title.trim().toLowerCase() === cleanTitle && !progressByProgramId.has(prog.id)) {
          progressByProgramId.set(prog.id, { ...rec, programId: prog.id });
        }
      }
    }
  }

  // Index prior learning records by programId (prefer APPROVED over PENDING over REJECTED)
  const priorLearningByProgramId = new Map<string, PriorLearningRecognitionRecord>();
  for (const rec of priorLearningRecords) {
    if (!rec.programId) continue;
    const existing = priorLearningByProgramId.get(rec.programId);
    if (!existing) {
      priorLearningByProgramId.set(rec.programId, rec);
    } else if (rec.status === 'APPROVED' && existing.status !== 'APPROVED') {
      priorLearningByProgramId.set(rec.programId, rec);
    }
  }

  const inScopeSet = new Set<string>([
    ...scope.assignedLearningUnits.map((u) => u.id),
    ...scope.structuralContainersInScope.map((c) => c.id),
  ]);
  const optionalSet = new Set<string>(scope.optionalLearningUnits.map((u) => u.id));

  // Helper to check if a single programme's direct requirement is satisfied (for prerequisite resolution)
  const isProgramRequirementSatisfied = (progId: string, visited = new Set<string>()): boolean => {
    if (visited.has(progId)) return false;
    visited.add(progId);

    const prior = priorLearningByProgramId.get(progId);
    if (prior && prior.status === 'APPROVED') return true;

    const prog = programsMap.get(progId);
    if (!prog) return false;

    const progRec = progressByProgramId.get(progId);
    if (prog.nodeType === 'CONTAINER') {
      const children = getDirectChildren(prog.id, programsMap.values()).filter((c) => !c.isArchived);
      const reqChildren = children.filter((c) => c.isRequired && !optionalSet.has(c.id));
      if (reqChildren.length === 0) return false;
      return reqChildren.every((c) => isProgramRequirementSatisfied(c.id, new Set(visited)));
    }

    const rawPct = progRec
      ? typeof progRec.selfProgress === 'number' && prog.nodeType === 'HYBRID'
        ? progRec.selfProgress
        : progRec.progress
      : 0;
    const selfDone = rawPct >= 100 || progRec?.status === 'COMPLETED';

    if (prog.nodeType === 'HYBRID') {
      const children = getDirectChildren(prog.id, programsMap.values()).filter(
        (c) => !c.isArchived && inScopeSet.has(c.id)
      );
      const reqChildren = children.filter((c) => c.isRequired && !optionalSet.has(c.id));
      if (reqChildren.length === 0) return selfDone;
      return (
        selfDone && reqChildren.every((c) => isProgramRequirementSatisfied(c.id, new Set(visited)))
      );
    }

    return selfDone;
  };

  const flatUnitsMap = new Map<string, ComputedProgramNodeProgress>();

  const buildComputedNode = (
    prog: ProgramRecord,
    depth: number,
    ancestorsVisited: Set<string>
  ): ComputedProgramNodeProgress => {
    const nextVisited = new Set(ancestorsVisited);
    nextVisited.add(prog.id);

    const breadcrumbs = getProgramBreadcrumbs(prog.id, programsMap);
    const breadcrumbPath = breadcrumbs.map((b) => b.title).join(' › ');

    const directChildren = getDirectChildren(prog.id, programsMap.values()).filter(
      (c) => !c.isArchived && scope.visibleTreeProgramIds.has(c.id) && !nextVisited.has(c.id)
    );

    const computedChildren = directChildren.map((child) =>
      buildComputedNode(child, depth + 1, nextVisited)
    );

    const isContainer = prog.nodeType === 'CONTAINER' || !prog.isEnrollable;
    const isHybrid = prog.nodeType === 'HYBRID' && prog.isEnrollable;
    const isEnrollableLeaf = prog.nodeType === 'ENROLLABLE' && prog.isEnrollable && computedChildren.length === 0;
    const isDirectlyEnrolledScope = inScopeSet.has(prog.id);
    const isAncestorContextOnly = !isDirectlyEnrolledScope && scope.visibleTreeProgramIds.has(prog.id);
    const isRequiredForStudent = prog.isRequired && !optionalSet.has(prog.id);

    const priorRec = priorLearningByProgramId.get(prog.id) || null;
    const isPriorApproved = priorRec?.status === 'APPROVED';

    // Check prerequisites
    const missingPrerequisites: ProgramRecord[] = [];
    for (const prereqId of prog.prerequisiteProgramIds || []) {
      const prereqProg = programsMap.get(prereqId);
      if (prereqProg && !isProgramRequirementSatisfied(prereqId)) {
        missingPrerequisites.push(prereqProg);
      }
    }
    const isLockedByPrerequisite = !isPriorApproved && missingPrerequisites.length > 0;

    // Direct unit progress (for ENROLLABLE or HYBRID)
    const progRec = progressByProgramId.get(prog.id);
    const totalLessons =
      progRec?.totalLessons ||
      prog.lessonsCount ||
      (Array.isArray(prog.curriculum) && prog.curriculum.length > 0 ? prog.curriculum.length : 8);

    let selfProgress = 0;
    let completedLessons = progRec?.completedLessons || 0;

    if (isPriorApproved) {
      selfProgress = 100;
      completedLessons = totalLessons;
    } else if (progRec) {
      if (isHybrid && typeof progRec.selfProgress === 'number') {
        selfProgress = Math.min(100, Math.max(0, Math.round(progRec.selfProgress)));
      } else {
        selfProgress = Math.min(100, Math.max(0, Math.round(progRec.progress || 0)));
      }
    }

    let selfStatus: LearningUnitStatus = 'NOT_STARTED';
    if (isPriorApproved) {
      selfStatus = 'PRIOR_LEARNING_APPROVED';
    } else if (isLockedByPrerequisite) {
      selfStatus = 'LOCKED';
    } else if (selfProgress >= 100 || progRec?.status === 'COMPLETED') {
      selfStatus = 'COMPLETED';
      selfProgress = 100;
    } else if (
      selfProgress > 0 ||
      progRec?.status === 'CURRENT' ||
      currentFocusSet.has(prog.id)
    ) {
      selfStatus = 'CURRENT';
    } else if (!isRequiredForStudent) {
      selfStatus = 'OPTIONAL';
    } else {
      selfStatus = 'UPCOMING';
    }

    // Aggregate calculation across this node and its descendants
    let completedRequiredUnitsCount = 0;
    let totalRequiredUnitsCount = 0;
    let completedOptionalUnitsCount = 0;
    let totalOptionalUnitsCount = 0;
    let weightedProgressSum = 0;

    // Does this node itself count as a learning unit?
    // Rule: CONTAINER never counts. ENROLLABLE or HYBRID counts as 1 unit if it is in the student's enrolled scope
    // AND (it has no children OR it is explicitly HYBRID).
    // Note: If an ENROLLABLE node has children assigned under it, we treat it as having its own unit only if it's a leaf or HYBRID,
    // preventing accidental double-counting when a parent was marked ENROLLABLE before children were added.
    const countsOwnRequirement =
      isDirectlyEnrolledScope &&
      !isContainer &&
      (computedChildren.length === 0 || prog.nodeType === 'HYBRID');

    if (countsOwnRequirement) {
      if (isRequiredForStudent) {
        totalRequiredUnitsCount += 1;
        weightedProgressSum += selfProgress;
        if (selfStatus === 'COMPLETED' || selfStatus === 'PRIOR_LEARNING_APPROVED') {
          completedRequiredUnitsCount += 1;
        }
      } else {
        totalOptionalUnitsCount += 1;
        if (selfStatus === 'COMPLETED' || selfStatus === 'PRIOR_LEARNING_APPROVED') {
          completedOptionalUnitsCount += 1;
        }
      }
    }

    for (const child of computedChildren) {
      completedRequiredUnitsCount += child.completedRequiredUnitsCount;
      totalRequiredUnitsCount += child.totalRequiredUnitsCount;
      completedOptionalUnitsCount += child.completedOptionalUnitsCount;
      totalOptionalUnitsCount += child.totalOptionalUnitsCount;
      weightedProgressSum += child.aggregateProgress * child.totalRequiredUnitsCount;
    }

    let aggregateProgress = 0;
    if (isPriorApproved && computedChildren.length === 0) {
      aggregateProgress = 100;
    } else if (totalRequiredUnitsCount > 0) {
      aggregateProgress = Math.min(100, Math.max(0, Math.round(weightedProgressSum / totalRequiredUnitsCount)));
    } else if (countsOwnRequirement) {
      aggregateProgress = selfProgress;
    } else if (computedChildren.length > 0) {
      // All children are optional
      const optAvg =
        computedChildren.reduce((acc, c) => acc + c.aggregateProgress, 0) / computedChildren.length;
      aggregateProgress = Math.round(optAvg);
    }

    // Determine overall node status
    let nodeStatus: LearningUnitStatus = selfStatus;
    if (isPriorApproved && computedChildren.length === 0) {
      nodeStatus = 'PRIOR_LEARNING_APPROVED';
    } else if (isLockedByPrerequisite) {
      nodeStatus = 'LOCKED';
    } else if (computedChildren.length > 0) {
      if (totalRequiredUnitsCount > 0 && completedRequiredUnitsCount === totalRequiredUnitsCount) {
        nodeStatus = 'COMPLETED';
      } else if (
        aggregateProgress > 0 ||
        computedChildren.some((c) => c.status === 'CURRENT' || c.status === 'COMPLETED')
      ) {
        nodeStatus = 'CURRENT';
      } else if (!isRequiredForStudent && totalRequiredUnitsCount === 0) {
        nodeStatus = 'OPTIONAL';
      } else {
        nodeStatus = 'UPCOMING';
      }
    }

    const computedNode: ComputedProgramNodeProgress = {
      program: prog,
      breadcrumbPath,
      depth,
      isContainer,
      isHybrid,
      isEnrollableLeaf,
      isDirectlyEnrolledScope,
      isAncestorContextOnly,
      isRequiredForStudent,
      status: nodeStatus,
      selfProgress,
      selfStatus,
      completedLessons,
      totalLessons,
      completedTopics: progRec?.completedTopics || [],
      tutorNotes: progRec?.tutorNotes || '',
      evidenceReference: progRec?.evidenceReference || priorRec?.evidenceReference || '',
      aggregateProgress,
      completedRequiredUnitsCount,
      totalRequiredUnitsCount,
      completedOptionalUnitsCount,
      totalOptionalUnitsCount,
      missingPrerequisites,
      isLockedByPrerequisite,
      priorLearningRecord: priorRec,
      children: computedChildren,
    };

    flatUnitsMap.set(prog.id, computedNode);
    return computedNode;
  };

  // Build root branches for all visible roots
  const rootNodes: ProgramRecord[] = [];
  for (const id of scope.visibleTreeProgramIds) {
    const p = programsMap.get(id);
    if (!p) continue;
    if (!p.parentProgramId || !scope.visibleTreeProgramIds.has(p.parentProgramId)) {
      rootNodes.push(p);
    }
  }
  rootNodes.sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));

  const rootBranches = rootNodes.map((r) => buildComputedNode(r, 0, new Set()));

  // Compute summary metrics across all learning units in scope
  let totalRequiredUnits = 0;
  let completedRequiredUnits = 0;
  let priorLearningApprovedUnits = 0;
  let inProgressUnits = 0;
  let upcomingUnits = 0;
  let lockedUnits = 0;
  let optionalUnits = 0;
  let requiredProgressSum = 0;

  const currentUnits: ComputedProgramNodeProgress[] = [];
  const nextRecommendedUnits: ComputedProgramNodeProgress[] = [];
  const completedUnitsList: ComputedProgramNodeProgress[] = [];

  for (const node of flatUnitsMap.values()) {
    const countsAsLearningUnit =
      node.isDirectlyEnrolledScope &&
      !node.isContainer &&
      (node.children.length === 0 || node.isHybrid);

    if (!countsAsLearningUnit) continue;

    if (node.selfStatus === 'PRIOR_LEARNING_APPROVED') {
      priorLearningApprovedUnits += 1;
    }

    if (node.isRequiredForStudent) {
      totalRequiredUnits += 1;
      requiredProgressSum += node.selfProgress;

      if (node.selfStatus === 'COMPLETED' || node.selfStatus === 'PRIOR_LEARNING_APPROVED') {
        completedRequiredUnits += 1;
        completedUnitsList.push(node);
      } else if (node.selfStatus === 'CURRENT') {
        inProgressUnits += 1;
        currentUnits.push(node);
      } else if (node.selfStatus === 'LOCKED') {
        lockedUnits += 1;
      } else {
        upcomingUnits += 1;
        nextRecommendedUnits.push(node);
      }
    } else {
      optionalUnits += 1;
      if (node.selfStatus === 'COMPLETED' || node.selfStatus === 'PRIOR_LEARNING_APPROVED') {
        completedUnitsList.push(node);
      } else if (node.selfStatus === 'CURRENT') {
        currentUnits.push(node);
      }
    }
  }

  // If no unit is explicitly CURRENT yet, promote the first unlocked UPCOMING required unit as recommended/active
  if (currentUnits.length === 0 && nextRecommendedUnits.length > 0) {
    const firstUnlocked = nextRecommendedUnits.find((u) => !u.isLockedByPrerequisite);
    if (firstUnlocked) {
      currentUnits.push(firstUnlocked);
    }
  }

  const overallProgress =
    totalRequiredUnits > 0 ? Math.min(100, Math.max(0, Math.round(requiredProgressSum / totalRequiredUnits))) : 0;

  return {
    pathwayStatus:
      extracted.selectedProgramIds.length > 0 ? 'CONFIGURED' : 'PENDING_PROGRAMME_CONFIRMATION',
    overallProgress,
    totalRequiredUnits,
    completedRequiredUnits,
    priorLearningApprovedUnits,
    inProgressUnits,
    upcomingUnits,
    lockedUnits,
    optionalUnits,
    rootBranches,
    flatUnitsMap,
    currentUnits,
    nextRecommendedUnits,
    completedUnitsList,
  };
}

/**
 * Fetches all courseProgress records for a given student across all configured client databases.
 */
export async function fetchStudentProgressRecords(
  studentId: string
): Promise<StudentUnitProgressRecord[]> {
  if (!studentId) return [];
  const dbs = getAllClientDatabases();
  const recordsMap = new Map<string, StudentUnitProgressRecord>();

  const snaps = await Promise.all(
    dbs.map((database: Firestore) =>
      getDocs(query(collection(database, 'courseProgress'), where('studentId', '==', studentId))).catch(
        () => null
      )
    )
  );

  for (const snap of snaps) {
    if (!snap) continue;
    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const programId = data.programId || data.courseId || docSnap.id.replace(`${studentId}_`, '');
      recordsMap.set(programId, {
        id: docSnap.id,
        studentId: data.studentId || studentId,
        programId,
        programTitle: data.programTitle || data.courseTitle || '',
        programPath: data.programPath || '',
        progress: typeof data.progress === 'number' ? data.progress : 0,
        selfProgress: typeof data.selfProgress === 'number' ? data.selfProgress : undefined,
        status: (data.status as LearningUnitStatus) || 'NOT_STARTED',
        completedLessons: typeof data.completedLessons === 'number' ? data.completedLessons : 0,
        totalLessons: typeof data.totalLessons === 'number' ? data.totalLessons : 8,
        completedTopics: Array.isArray(data.completedTopics) ? data.completedTopics : [],
        tutorNotes: data.tutorNotes || '',
        evidenceReference: data.evidenceReference || '',
        assessmentIds: Array.isArray(data.assessmentIds) ? data.assessmentIds : [],
        lastUpdatedByUid: data.lastUpdatedByUid,
        lastUpdatedByName: data.lastUpdatedByName,
        completedAt: data.completedAt || null,
        updatedAt: data.updatedAt,
      });
    }
  }

  return Array.from(recordsMap.values());
}

/**
 * Fetches all priorLearningRecognitions for a student across all client databases.
 */
export async function fetchStudentPriorLearningRecognitions(
  studentId?: string
): Promise<PriorLearningRecognitionRecord[]> {
  const dbs = getAllClientDatabases();
  const map = new Map<string, PriorLearningRecognitionRecord>();

  const snaps = await Promise.all(
    dbs.map((database: Firestore) => {
      const q = studentId
        ? query(collection(database, 'priorLearningRecognitions'), where('studentId', '==', studentId))
        : collection(database, 'priorLearningRecognitions');
      return getDocs(q).catch(() => null);
    })
  );

  for (const snap of snaps) {
    if (!snap) continue;
    for (const d of snap.docs) {
      const data = d.data();
      map.set(d.id, {
        id: d.id,
        studentId: data.studentId || '',
        studentName: data.studentName || '',
        enrolmentId: data.enrolmentId || '',
        programId: data.programId || '',
        programTitle: data.programTitle || '',
        programPath: data.programPath || '',
        status: (data.status as PriorLearningStatus) || 'PENDING',
        recognitionType:
          (data.recognitionType as PriorLearningRecognitionType) || 'PRIOR_COMPLETION',
        evidenceReference: data.evidenceReference || '',
        verificationNotes: data.verificationNotes || '',
        requestedByUid: data.requestedByUid || '',
        requestedByName: data.requestedByName || '',
        requestedByRole: data.requestedByRole || 'STUDENT',
        requestedAt: data.requestedAt,
        verifiedByUid: data.verifiedByUid,
        verifiedByName: data.verifiedByName,
        verifiedByRole: data.verifiedByRole,
        verifiedAt: data.verifiedAt,
        updatedAt: data.updatedAt,
      });
    }
  }

  return Array.from(map.values());
}

/**
 * Submits or records a Prior-Learning Recognition entry.
 * - Students and Parents create records with status = 'PENDING' (cannot self-approve).
 * - Tutors and Admins can either create with status = 'APPROVED' directly or verify a pending request.
 */
export async function submitPriorLearningRecognition(input: {
  studentId: string;
  studentName?: string;
  enrolmentId?: string;
  program: ProgramRecord;
  programsMap: Map<string, ProgramRecord>;
  recognitionType: PriorLearningRecognitionType;
  evidenceReference: string;
  verificationNotes: string;
  actorUid: string;
  actorName: string;
  actorRole: 'STUDENT' | 'PARENT' | 'TUTOR' | 'ADMIN';
  approveImmediately?: boolean;
}): Promise<PriorLearningRecognitionRecord> {
  const breadcrumbs = getProgramBreadcrumbs(input.program.id, input.programsMap);
  const programPath = breadcrumbs.map((b) => b.title).join(' › ');

  const canSelfVerify = input.actorRole === 'ADMIN' || input.actorRole === 'TUTOR';
  const status: PriorLearningStatus =
    canSelfVerify && input.approveImmediately !== false ? 'APPROVED' : 'PENDING';

  const recordId = `${input.studentId}_${input.program.id}`;
  const payload: any = {
    studentId: input.studentId,
    studentName: input.studentName || '',
    enrolmentId: input.enrolmentId || '',
    programId: input.program.id,
    programTitle: input.program.title,
    programPath,
    status,
    recognitionType: input.recognitionType,
    evidenceReference: input.evidenceReference.trim(),
    verificationNotes: input.verificationNotes.trim(),
    requestedByUid: input.actorUid,
    requestedByName: input.actorName,
    requestedByRole: input.actorRole,
    requestedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (status === 'APPROVED') {
    payload.verifiedByUid = input.actorUid;
    payload.verifiedByName = input.actorName;
    payload.verifiedByRole = input.actorRole === 'ADMIN' ? 'ADMIN' : 'TUTOR';
    payload.verifiedAt = serverTimestamp();
  }

  const dbs = getAllClientDatabases();
  await Promise.all(
    dbs.map((database: Firestore) =>
      setDoc(doc(database, 'priorLearningRecognitions', recordId), payload, { merge: true }).catch(
        (err) => {
          if (database === db) throw err;
        }
      )
    )
  );

  // If approved immediately, also reflect in courseProgress for this exact programId
  if (status === 'APPROVED') {
    await Promise.all(
      dbs.map((database: Firestore) =>
        setDoc(
          doc(database, 'courseProgress', recordId),
          {
            studentId: input.studentId,
            programId: input.program.id,
            courseId: input.program.id,
            programTitle: input.program.title,
            courseTitle: input.program.title,
            programPath,
            progress: 100,
            selfProgress: 100,
            status: 'PRIOR_LEARNING_APPROVED',
            evidenceReference: input.evidenceReference.trim(),
            tutorNotes: input.verificationNotes.trim(),
            lastUpdatedByUid: input.actorUid,
            lastUpdatedByName: input.actorName,
            completedAt: new Date().toISOString(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        ).catch(() => null)
      )
    );
  }

  return {
    id: recordId,
    ...payload,
  };
}

/**
 * Allows an authorised Tutor or Admin to approve or reject a Prior-Learning Recognition record.
 */
export async function reviewPriorLearningRecognition(input: {
  recordId: string;
  studentId: string;
  programId: string;
  programTitle: string;
  programPath: string;
  decision: 'APPROVED' | 'REJECTED';
  verificationNotes: string;
  evidenceReference?: string;
  verifierUid: string;
  verifierName: string;
  verifierRole: 'TUTOR' | 'ADMIN';
}): Promise<void> {
  const dbs = getAllClientDatabases();
  const updatePayload: any = {
    status: input.decision,
    verificationNotes: input.verificationNotes.trim(),
    verifiedByUid: input.verifierUid,
    verifiedByName: input.verifierName,
    verifiedByRole: input.verifierRole,
    verifiedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (input.evidenceReference !== undefined) {
    updatePayload.evidenceReference = input.evidenceReference.trim();
  }

  await Promise.all(
    dbs.map((database: Firestore) =>
      setDoc(doc(database, 'priorLearningRecognitions', input.recordId), updatePayload, {
        merge: true,
      }).catch((err) => {
        if (database === db) throw err;
      })
    )
  );

  const progressDocId = `${input.studentId}_${input.programId}`;
  if (input.decision === 'APPROVED') {
    await Promise.all(
      dbs.map((database: Firestore) =>
        setDoc(
          doc(database, 'courseProgress', progressDocId),
          {
            studentId: input.studentId,
            programId: input.programId,
            courseId: input.programId,
            programTitle: input.programTitle,
            courseTitle: input.programTitle,
            programPath: input.programPath,
            progress: 100,
            selfProgress: 100,
            status: 'PRIOR_LEARNING_APPROVED',
            tutorNotes: input.verificationNotes.trim(),
            evidenceReference: input.evidenceReference || '',
            lastUpdatedByUid: input.verifierUid,
            lastUpdatedByName: input.verifierName,
            completedAt: new Date().toISOString(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        ).catch(() => null)
      )
    );
  }
}

/**
 * Updates a student's learning unit progress in `courseProgress` and synchronises summary metrics.
 */
export async function updateStudentUnitProgress(input: {
  studentId: string;
  program: ProgramRecord;
  programsMap: Map<string, ProgramRecord>;
  progress: number;
  selfProgress?: number;
  status?: LearningUnitStatus;
  completedLessons?: number;
  totalLessons?: number;
  completedTopics?: string[];
  tutorNotes?: string;
  evidenceReference?: string;
  actorUid: string;
  actorName: string;
}): Promise<void> {
  const breadcrumbs = getProgramBreadcrumbs(input.program.id, input.programsMap);
  const programPath = breadcrumbs.map((b) => b.title).join(' › ');
  const docId = `${input.studentId}_${input.program.id}`;

  const clampedProgress = Math.min(100, Math.max(0, Math.round(input.progress)));
  const clampedSelf =
    typeof input.selfProgress === 'number'
      ? Math.min(100, Math.max(0, Math.round(input.selfProgress)))
      : clampedProgress;

  const status: LearningUnitStatus =
    input.status ||
    (clampedProgress >= 100 ? 'COMPLETED' : clampedProgress > 0 ? 'CURRENT' : 'UPCOMING');

  const payload: any = {
    studentId: input.studentId,
    programId: input.program.id,
    courseId: input.program.id,
    programTitle: input.program.title,
    courseTitle: input.program.title,
    programPath,
    progress: clampedProgress,
    selfProgress: clampedSelf,
    status,
    completedLessons:
      typeof input.completedLessons === 'number'
        ? input.completedLessons
        : Math.round((clampedProgress / 100) * (input.totalLessons || 8)),
    totalLessons: input.totalLessons || input.program.lessonsCount || 8,
    completedTopics: input.completedTopics || [],
    tutorNotes: input.tutorNotes ?? '',
    evidenceReference: input.evidenceReference ?? '',
    lastUpdatedByUid: input.actorUid,
    lastUpdatedByName: input.actorName,
    completedAt: status === 'COMPLETED' ? new Date().toISOString() : null,
    updatedAt: serverTimestamp(),
  };

  const dbs = getAllClientDatabases();
  await Promise.all(
    dbs.map((database: Firestore) =>
      setDoc(doc(database, 'courseProgress', docId), payload, { merge: true }).catch((err) => {
        if (database === db) throw err;
      })
    )
  );
}

/**
 * Persists a student's configured recursive programme pathway across `students`, `individualStudents`, and `users`.
 * Never invents fallback tracks — if `selectedProgramIds` is empty, marks the student as `PENDING_PROGRAMME_CONFIRMATION`.
 */
export async function saveStudentPathwayConfiguration(input: {
  studentId: string;
  studentUid?: string;
  studentName?: string;
  selectedProgramIds: string[];
  optionalProgramIds?: string[];
  priorRecognisedProgramIds?: string[];
  excludedProgramIds?: string[];
  currentFocusProgramIds?: string[];
  deliveryType: ProgramDeliveryOption;
  agreedFee?: number;
  pricingArrangement?: {
    mode: 'PUBLIC_GROUP' | 'PRIVATE_MENTORSHIP' | 'SCHOOL_COHORT' | 'CUSTOM';
    amount: number;
    currency: string;
    billingCycle: string;
    notes?: string;
  };
  assignedTutorId?: string;
  assignedTutorName?: string;
  actorUid?: string;
  actorName?: string;
  actorRole?: string;
  programsMap: Map<string, ProgramRecord>;
}): Promise<ResolvedEnrolmentScope> {
  const scope = resolveEnrolmentScope(input.selectedProgramIds, input.programsMap, {
    optionalProgramIds: input.optionalProgramIds,
    excludedProgramIds: input.excludedProgramIds,
  });

  const pathwayStatus =
    scope.selectedNodes.length > 0 ? 'CONFIGURED' : 'PENDING_PROGRAMME_CONFIRMATION';

  const rootIds = scope.enrolledRootPrograms.map((r) => r.id);
  const rootTitles = scope.enrolledRootPrograms.map((r) => r.title);
  const selectedTitles = scope.selectedNodes.map((n) => n.title);
  const assignedUnitIds = scope.assignedLearningUnits.map((u) => u.id);
  const assignedUnitTitles = scope.assignedLearningUnits.map((u) => u.title);

  // Primary display label derived strictly from actual selected nodes (never a hardcoded fallback)
  const primaryTrackLabel =
    selectedTitles.length > 0
      ? selectedTitles.join(', ')
      : 'Pending Programme Confirmation';

  const enrolledProgramsMetadata = scope.selectedNodes.map((node) => {
    const breadcrumbs = getProgramBreadcrumbs(node.id, input.programsMap);
    return {
      programId: node.id,
      title: node.title,
      breadcrumbPath: breadcrumbs.map((b) => b.title).join(' › '),
      nodeType: node.nodeType,
      rootProgramId: node.rootProgramId || node.id,
      deliveryType: input.deliveryType,
    };
  });

  const updatePayload: any = {
    pathwayStatus,
    enrolledRootProgramIds: rootIds,
    enrolledRootProgramTitles: rootTitles,
    selectedProgramIds: scope.selectedNodes.map((n) => n.id),
    assignedProgramIds: assignedUnitIds,
    assignedTrackIds: scope.selectedNodes.map((n) => n.id),
    optionalProgramIds: input.optionalProgramIds || [],
    excludedProgramIds: input.excludedProgramIds || [],
    currentFocusProgramIds: input.currentFocusProgramIds || [],
    enrolledPrograms: selectedTitles,
    enrolledProgramsMetadata,
    programId: scope.selectedNodes[0]?.id || null,
    programName: selectedTitles[0] || null,
    track: primaryTrackLabel,
    subjects: assignedUnitTitles.slice(0, 8).join(', '),
    deliveryType: input.deliveryType,
    updatedAt: serverTimestamp(),
  };

  if (input.pricingArrangement) {
    updatePayload.pricingArrangement = input.pricingArrangement;
    updatePayload.agreedFee = input.pricingArrangement.amount;
    updatePayload.billingModel = input.pricingArrangement.mode;
  }

  if (input.assignedTutorId !== undefined) {
    updatePayload.assignedTutorId = input.assignedTutorId;
    updatePayload.tutorId = input.assignedTutorId;
  }
  if (input.assignedTutorName !== undefined) {
    updatePayload.assignedTutorName = input.assignedTutorName;
    updatePayload.tutorName = input.assignedTutorName;
  }

  const dbs = getAllClientDatabases();
  const targetDocIds = Array.from(
    new Set([input.studentId, input.studentUid].filter((x): x is string => Boolean(x)))
  );

  for (const docId of targetDocIds) {
    await Promise.all(
      dbs.flatMap((database: Firestore) => [
        setDoc(doc(database, 'students', docId), updatePayload, { merge: true }).catch(() => null),
        setDoc(doc(database, 'individualStudents', docId), updatePayload, { merge: true }).catch(
          () => null
        ),
        updateDoc(doc(database, 'users', docId), updatePayload).catch(() => null),
      ])
    );
  }

  return scope;
}
