import {
  PRIMARY_PROGRAM_ROOTS,
  detectCircularRelationships,
  exportProgramsBackupJson,
  getAncestors,
  getProgramBreadcrumbs,
  resolveProgramCanonicalRoot,
  type ProgramRecord,
} from '../../../lib/programHierarchy';
import type {
  BackupSnapshot,
  IntegrityFinding,
  PreviewProgramRecord,
  PreviewProposalRecord,
} from './types';

export interface SyntheticAuditFinding {
  id: string;
  collection: 'programs' | 'programProposals';
  title: string;
  reasons: string[];
}

const KNOWN_SYNTHETIC_PROGRAM_IDS = new Set([
  'prog-smart-techies',
  'prog-coding',
  'prog-web-development',
  'prog-html',
  'prog-css',
  'prog-javascript',
  'prog-python-programming',
  'prog-robotics',
  'prog-digital-literacy',
  'prog-microsoft-office',
  'prog-graphic-design',
  'prog-coreldraw',
  'prog-ui-ux-design',
  'prog-piano-keyboard',
  'prog-music-theory',
  'prog-waec-prep',
  'prog-mathematics-foundations',
  'prog-unassigned-robotics-club',
  'prog-archived-legacy-scratch',
]);

const KNOWN_SYNTHETIC_PROPOSAL_IDS = new Set([
  'prop-101',
  'prop-102',
  'prop-103',
  'prop-104',
  'prop-105',
]);

export function createBackupSnapshot(
  programs: PreviewProgramRecord[],
  label = 'Manual Workspace Snapshot',
  createdBy = 'Admin Session'
): BackupSnapshot {
  const jsonPayload = exportProgramsBackupJson(programs);
  const rootCount = programs.filter((p) => p.isPrimaryRoot && !p.isArchived).length;
  const unassignedCount = programs.filter((p) => p.isUnassigned && !p.isArchived).length;
  const archivedCount = programs.filter((p) => p.isArchived).length;

  return {
    id: `bkp-${Date.now().toString(36)}`,
    label,
    createdAt: new Date().toISOString(),
    createdBy,
    recordCount: programs.length,
    rootCount,
    unassignedCount,
    archivedCount,
    sizeBytes: new Blob([jsonPayload]).size,
    jsonPayload,
  };
}

export function runHierarchyIntegrityAudit(
  programs: PreviewProgramRecord[]
): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];
  const programsMap = new Map<string, ProgramRecord>();
  programs.forEach((p) => programsMap.set(p.id, p));

  // 1. Check canonical primary roots
  for (const rootDef of PRIMARY_PROGRAM_ROOTS) {
    const found = programs.find(
      (p) =>
        !p.isArchived &&
        (p.id === rootDef.canonicalId || p.primaryRootKey === rootDef.key)
    );
    if (found) {
      findings.push({
        id: `root-ok-${rootDef.key}`,
        severity: 'HEALTHY',
        category: 'HEALTHY_STRUCTURE',
        programId: found.id,
        programTitle: found.title,
        summary: `Canonical Root Verified: ${found.title}`,
        detail: `Root document (${found.id}) is active at depth 0 with valid root configuration.`,
        recommendedAction: 'No action required.',
      });
    } else {
      findings.push({
        id: `root-missing-${rootDef.key}`,
        severity: 'CRITICAL',
        category: 'MISSING_PARENT_REFERENCE',
        summary: `Missing Primary Root: ${rootDef.title}`,
        detail: `Canonical root "${rootDef.title}" (${rootDef.canonicalId}) is missing or archived.`,
        recommendedAction:
          'Create the canonical root programme or run the Migration Preview tool to initialise missing roots.',
      });
    }
  }

  // 2. Check circular relationships
  const cycles = detectCircularRelationships(programsMap);
  cycles.forEach((cycle, idx) => {
    const firstId = cycle[0];
    const prog = programsMap.get(firstId);
    findings.push({
      id: `cycle-${idx}-${firstId}`,
      severity: 'CRITICAL',
      category: 'CIRCULAR_DEPENDENCY',
      programId: firstId,
      programTitle: prog?.title || firstId,
      summary: `Circular Parent Loop Detected (${cycle.join(' → ')})`,
      detail:
        'A programme in this chain references one of its own descendants as a parent.',
      recommendedAction:
        'Isolate the affected node into Unassigned Programmes or assign a valid ancestor.',
      canAutoIsolate: true,
    });
  });

  // 3. Check each active programme for broken/missing parent references or unexpected container flags
  for (const prog of programs) {
    if (prog.isArchived) continue;

    if (prog.parentProgramId) {
      if (prog.parentProgramId === prog.id) {
        findings.push({
          id: `self-parent-${prog.id}`,
          severity: 'CRITICAL',
          category: 'INVALID_PARENT_REFERENCE',
          programId: prog.id,
          programTitle: prog.title,
          summary: `Self-Parent Reference on "${prog.title}"`,
          detail: `Programme (${prog.id}) lists itself as its own parentProgramId.`,
          recommendedAction: 'Reset parent reference and place in Unassigned Programmes.',
          canAutoIsolate: true,
        });
      } else if (!programsMap.has(prog.parentProgramId)) {
        findings.push({
          id: `missing-parent-doc-${prog.id}`,
          severity: 'WARNING',
          category: 'INVALID_PARENT_REFERENCE',
          programId: prog.id,
          programTitle: prog.title,
          summary: `Orphaned Parent ID on "${prog.title}"`,
          detail: `References parentProgramId "${prog.parentProgramId}", which does not exist in the catalogue.`,
          recommendedAction:
            'Open Unassigned Programmes to assign this record to a valid parent branch.',
          canAutoIsolate: !prog.isUnassigned,
        });
      } else {
        const parent = programsMap.get(prog.parentProgramId)!;
        if (!parent.canContainChildren) {
          findings.push({
            id: `parent-disallow-children-${prog.id}`,
            severity: 'WARNING',
            category: 'UNEXPECTED_STRUCTURE',
            programId: prog.id,
            programTitle: prog.title,
            summary: `Parent "${parent.title}" Disallows Child Programmes`,
            detail: `"${prog.title}" is nested under "${parent.title}", which currently has canContainChildren set to false.`,
            recommendedAction:
              'Enable "Can contain sub-programmes" on the parent or move this child to another branch.',
          });
        }
      }
    } else if (!prog.isPrimaryRoot) {
      findings.push({
        id: `unassigned-node-${prog.id}`,
        severity: 'WARNING',
        category: 'MISSING_PARENT_REFERENCE',
        programId: prog.id,
        programTitle: prog.title,
        summary: `Unassigned Non-Root Programme: "${prog.title}"`,
        detail:
          prog.unassignedReasonDetail ||
          'This programme is not one of the four primary roots and does not yet have a confirmed parentProgramId.',
        recommendedAction:
          'Review in Unassigned Programmes and assign to an appropriate parent branch.',
      });
    }

    if (prog.nodeType === 'CONTAINER' && prog.isEnrollable) {
      findings.push({
        id: `container-enrollable-${prog.id}`,
        severity: 'WARNING',
        category: 'UNEXPECTED_STRUCTURE',
        programId: prog.id,
        programTitle: prog.title,
        summary: `Structural Container Marked Enrollable: "${prog.title}"`,
        detail:
          'CONTAINER nodes are structural folders and should have isEnrollable set to false.',
        recommendedAction: 'Edit node settings to disable direct enrolment on this container.',
      });
    }
  }

  return findings;
}

export function recalculateHierarchyMetadata(
  programs: PreviewProgramRecord[]
): PreviewProgramRecord[] {
  const map = new Map<string, PreviewProgramRecord>();
  programs.forEach((p) => map.set(p.id, { ...p }));

  return programs.map((prog) => {
    const canonical = resolveProgramCanonicalRoot(prog, map);

    if (!prog.parentProgramId) {
      const isRoot = Boolean(prog.isPrimaryRoot);
      return {
        ...prog,
        rootProgramId: isRoot ? prog.id : null,
        ancestorIds: [],
        primaryRootKey: canonical.rootKey ?? prog.primaryRootKey ?? null,
        categoryId: canonical.rootDefinition?.categoryId || prog.categoryId,
        isUnassigned: !isRoot,
      };
    }

    if (
      canonical.hasCycle ||
      canonical.hasInvalidParent ||
      !map.has(prog.parentProgramId) ||
      prog.parentProgramId === prog.id
    ) {
      return {
        ...prog,
        rootProgramId: null,
        ancestorIds: [prog.parentProgramId],
        primaryRootKey: null,
        isUnassigned: true,
        unassignedReasonType: prog.unassignedReasonType || 'INVALID_REFERENCE',
        unassignedReasonDetail:
          prog.unassignedReasonDetail ||
          (canonical.hasCycle
            ? 'Circular parent reference detected in hierarchy chain.'
            : `Parent reference "${prog.parentProgramId}" could not be resolved in the catalogue.`),
      };
    }

    const ancestors = getAncestors(prog.id, map);
    const ancestorIds = ancestors.map((a) => a.id);
    const rootProgramId = ancestorIds[0] || prog.parentProgramId;
    const crumbs = getProgramBreadcrumbs(prog.id, map);

    return {
      ...prog,
      ancestorIds,
      rootProgramId,
      primaryRootKey: canonical.rootKey ?? prog.primaryRootKey ?? null,
      categoryId: canonical.rootDefinition?.categoryId || prog.categoryId,
      isUnassigned: false,
      seriesName: ancestors[ancestors.length - 1]?.title || prog.seriesName,
      stageName: crumbs.map((c) => c.title).join(' › '),
    };
  });
}

/**
 * Report-only synthetic/demo data audit helper.
 * Flags suspected test/demo records for manual admin review without deleting any data.
 */
export function auditSyntheticProgramRecords(
  programs: PreviewProgramRecord[],
  proposals: PreviewProposalRecord[] = []
): SyntheticAuditFinding[] {
  const flagged: SyntheticAuditFinding[] = [];

  for (const prog of programs) {
    const reasons: string[] = [];
    if (prog.isSampleData) {
      reasons.push('Marked with isSampleData=true');
    }
    if (KNOWN_SYNTHETIC_PROGRAM_IDS.has(prog.id)) {
      reasons.push(`Document ID "${prog.id}" matches legacy demo seed identifier`);
    }
    const lowerTitle = String(prog.title || '').toLowerCase();
    if (/\b(demo|test|sample|placeholder|lorem)\b/.test(lowerTitle)) {
      reasons.push('Title contains synthetic/test keyword');
    }
    if (reasons.length > 0) {
      flagged.push({
        id: prog.id,
        collection: 'programs',
        title: prog.title || prog.id,
        reasons,
      });
    }
  }

  for (const prop of proposals) {
    const reasons: string[] = [];
    if (KNOWN_SYNTHETIC_PROPOSAL_IDS.has(prop.id)) {
      reasons.push(`Proposal ID "${prop.id}" matches legacy demo seed identifier`);
    }
    const lowerEmail = String(prop.tutorEmail || prop.proposedByEmail || '').toLowerCase();
    if (lowerEmail.endsWith('@example.com') || lowerEmail.includes('demo')) {
      reasons.push(`Proposer email "${lowerEmail}" appears synthetic`);
    }
    const lowerPropTitle = String((prop as any).proposedTitle || prop.title || '').toLowerCase();
    if (/\b(demo|test|sample|placeholder|lorem)\b/.test(lowerPropTitle)) {
      reasons.push('Proposal title contains synthetic/test keyword');
    }
    if (reasons.length > 0) {
      flagged.push({
        id: prop.id,
        collection: 'programProposals',
        title: (prop as any).proposedTitle || prop.title || prop.id,
        reasons,
      });
    }
  }

  return flagged;
}
