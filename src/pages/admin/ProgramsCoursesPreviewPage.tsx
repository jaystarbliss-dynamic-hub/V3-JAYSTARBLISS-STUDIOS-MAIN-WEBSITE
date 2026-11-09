import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import {
  normalizeProgramRecord,
  getDirectChildren,
  generateHierarchyMigrationPreview,
  slugifyTitle,
} from '../../lib/programHierarchy';
import {
  INITIAL_DEMO_PROGRAMS,
  INITIAL_DEMO_PROPOSALS,
  createBackupSnapshot,
  runHierarchyIntegrityAudit,
  recalculateHierarchyMetadata,
} from '../../components/admin/programs-preview/mockData';
import type {
  WorkspaceSectionId,
  ArchiveToolsTabId,
  PreviewProgramRecord,
  PreviewProposalRecord,
  BackupSnapshot,
} from '../../components/admin/programs-preview/types';
import {
  formatNaira,
  getDeliveryFormatLabel,
} from '../../components/admin/programs-preview/types';
import { PreviewAdminShell } from '../../components/admin/programs-preview/PreviewAdminShell';
import { ProgrammeCatalogueView } from '../../components/admin/programs-preview/ProgrammeCatalogueView';
import { ProgrammeHierarchyView } from '../../components/admin/programs-preview/ProgrammeHierarchyView';
import { ProgrammeEditorView } from '../../components/admin/programs-preview/ProgrammeEditorView';
import { CurriculumWorkspaceView } from '../../components/admin/programs-preview/CurriculumWorkspaceView';
import {
  TutorProposalsView,
  type ApprovedProposalEdits,
} from '../../components/admin/programs-preview/TutorProposalsView';
import { UnassignedProgrammesView } from '../../components/admin/programs-preview/UnassignedProgrammesView';
import {
  MoveProgrammeModal,
  QuickRenameModal,
  ArchiveConfirmModal,
  CreateProgrammeModal,
} from '../../components/admin/programs-preview/MoveProgrammeModal';
import { ArchiveAndToolsView } from '../../components/admin/programs-preview/ArchiveAndToolsView';
import { ProgramsMasterOverviewView } from '../../components/admin/programs-preview/ProgramsMasterOverviewView';

export interface ProgramsCoursesWorkspaceProps {
  embeddedInAdminLayout?: boolean;
  externalPrograms?: PreviewProgramRecord[] | null;
  externalProposals?: PreviewProposalRecord[] | null;
  onPersistProgram?: (program: PreviewProgramRecord) => Promise<void> | void;
  onPersistProposal?: (proposal: PreviewProposalRecord) => Promise<void> | void;
  onPersistBatchPrograms?: (programs: PreviewProgramRecord[]) => Promise<void> | void;
}

export const ProgramsCoursesPreviewPage: React.FC<ProgramsCoursesWorkspaceProps> = ({
  embeddedInAdminLayout = false,
  externalPrograms = null,
  externalProposals = null,
  onPersistProgram,
  onPersistProposal,
  onPersistBatchPrograms,
}) => {
  const [programs, setPrograms] = useState<PreviewProgramRecord[]>(() =>
    recalculateHierarchyMetadata(
      externalPrograms && externalPrograms.length > 0
        ? externalPrograms
        : INITIAL_DEMO_PROGRAMS
    )
  );
  const [proposals, setProposals] = useState<PreviewProposalRecord[]>(() =>
    externalProposals && externalProposals.length > 0
      ? externalProposals
      : INITIAL_DEMO_PROPOSALS
  );

  // Sync external live Firestore records when provided
  useEffect(() => {
    if (externalPrograms && externalPrograms.length > 0) {
      setPrograms(recalculateHierarchyMetadata(externalPrograms));
    }
  }, [externalPrograms]);

  useEffect(() => {
    if (externalProposals && externalProposals.length > 0) {
      setProposals(externalProposals);
    }
  }, [externalProposals]);

  const [backups, setBackups] = useState<BackupSnapshot[]>(() => [
    createBackupSnapshot(
      INITIAL_DEMO_PROGRAMS,
      'Initial Pre-Migration Baseline Snapshot'
    ),
  ]);

  // Navigation & focus state
  const [activeSection, setActiveSection] = useState<WorkspaceSectionId>('catalogue');
  const [archiveSubTab, setArchiveSubTab] = useState<ArchiveToolsTabId>('archived');
  const [selectedHierarchyId, setSelectedHierarchyId] = useState<string | null>(
    'prog-smart-techies'
  );
  const [selectedCurriculumId, setSelectedCurriculumId] = useState<string | null>(
    'prog-web-development'
  );

  // Editor state
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null);
  const [editorInitialParentId, setEditorInitialParentId] = useState<string | null>(null);

  // Quick 5-Step Create Programme Modal state (Matches Image 3 Bottom-Left)
  const [quickCreateModalOpen, setQuickCreateModalOpen] = useState(false);
  const [quickCreateParentId, setQuickCreateParentId] = useState<string | null>(null);

  // Controlled Modal states
  const [movingProgramId, setMovingProgramId] = useState<string | null>(null);
  const [renamingProgramId, setRenamingProgramId] = useState<string | null>(null);
  const [archivingProgramId, setArchivingProgramId] = useState<string | null>(null);

  // Toast notification state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  const programsMap = useMemo(() => {
    const map = new Map<string, PreviewProgramRecord>();
    programs.forEach((p) => map.set(p.id, p));
    return map;
  }, [programs]);

  const counts = useMemo(() => {
    const activeTotal = programs.filter((p) => !p.isArchived).length;
    const rootsCount = programs.filter((p) => !p.isArchived && p.isPrimaryRoot).length;
    const pendingProposals = proposals.filter((p) => p.status === 'PENDING').length;
    const unassignedCount = programs.filter(
      (p) => !p.isArchived && p.isUnassigned && !p.isPrimaryRoot
    ).length;
    const archivedCount = programs.filter((p) => p.isArchived).length;
    return {
      activeTotal,
      rootsCount,
      pendingProposals,
      unassignedCount,
      archivedCount,
    };
  }, [programs, proposals]);

  const integrityFindings = useMemo(
    () => runHierarchyIntegrityAudit(programs),
    [programs]
  );

  const handleOpenCreateEditor = (parentId: string | null = null) => {
    setEditingProgramId(null);
    setEditorInitialParentId(parentId);
    setActiveSection('editor');
  };

  const handleOpenQuickCreateModal = (parentId: string | null = null) => {
    setQuickCreateParentId(parentId);
    setQuickCreateModalOpen(true);
  };

  const handleOpenEditEditor = (prog: PreviewProgramRecord) => {
    setEditingProgramId(prog.id);
    setEditorInitialParentId(prog.parentProgramId);
    setActiveSection('editor');
  };

  const handleInspectInHierarchy = (prog: PreviewProgramRecord) => {
    setSelectedHierarchyId(prog.id);
    setActiveSection('hierarchy');
  };

  const handleOpenCurriculum = (prog: PreviewProgramRecord) => {
    setSelectedCurriculumId(prog.id);
    setActiveSection('curriculum');
  };

  const handleSaveProgramme = (
    draftRecord: Partial<PreviewProgramRecord>,
    targetStatus: 'PUBLISHED' | 'DRAFT',
    existingId?: string
  ) => {
    const nowIso = new Date().toISOString();
    const id = existingId || `prog-${Date.now().toString(36)}`;
    let savedRecord: PreviewProgramRecord | null = null;

    setPrograms((prev) => {
      const existing = prev.find((p) => p.id === id);
      const baseNormalized = normalizeProgramRecord(id, {
        ...(existing || {}),
        ...draftRecord,
        isPublished: targetStatus === 'PUBLISHED',
        isArchived: false,
        status: targetStatus,
        updatedAt: nowIso,
      });

      const merged: PreviewProgramRecord = {
        ...baseNormalized,
        ...(existing || {}),
        ...draftRecord,
        id,
        deliveryFormat:
          draftRecord.deliveryFormat || existing?.deliveryFormat || 'ONLINE',
        targetAudience: draftRecord.targetAudience || existing?.targetAudience || 'B2C',
        isPublished: targetStatus === 'PUBLISHED',
        isArchived: false,
        status: targetStatus,
        previousStatusBeforeArchive: targetStatus,
        updatedAt: nowIso,
      };

      const nextList = existing
        ? prev.map((p) => (p.id === id ? merged : p))
        : [...prev, merged];

      const recalculated = recalculateHierarchyMetadata(nextList);
      savedRecord = recalculated.find((p) => p.id === id) || merged;
      if (savedRecord && onPersistProgram) {
        void onPersistProgram(savedRecord);
      }
      return recalculated;
    });

    setSelectedHierarchyId(id);
    setSelectedCurriculumId(id);
    setActiveSection('catalogue');
    showToast(
      existingId
        ? `Updated "${draftRecord.title}" (${targetStatus === 'PUBLISHED' ? 'Published' : 'Draft'}).`
        : `Created "${draftRecord.title}" (${targetStatus === 'PUBLISHED' ? 'Published' : 'Draft'}).`
    );
  };

  const handleTogglePublish = (prog: PreviewProgramRecord) => {
    const nextPublished = !prog.isPublished;
    const nextStatus: 'PUBLISHED' | 'DRAFT' = nextPublished ? 'PUBLISHED' : 'DRAFT';
    setPrograms((prev) =>
      prev.map((p) => {
        if (p.id !== prog.id) return p;
        const updated: PreviewProgramRecord = {
          ...p,
          isPublished: nextPublished,
          status: nextStatus,
          previousStatusBeforeArchive: nextStatus,
          updatedAt: new Date().toISOString(),
        };
        if (onPersistProgram) void onPersistProgram(updated);
        return updated;
      })
    );
    showToast(
      `"${prog.title}" is now ${nextPublished ? 'Published' : 'reverted to Draft'}.`
    );
  };

  const handleConfirmMove = (programId: string, newParentProgramId: string | null) => {
    setPrograms((prev) => {
      const targetSiblings = getDirectChildren(newParentProgramId, prev);
      const updated = prev.map((p) =>
        p.id === programId
          ? {
              ...p,
              parentProgramId: newParentProgramId,
              isUnassigned: !newParentProgramId && !p.isPrimaryRoot,
              sortOrder: targetSiblings.length + 1,
              updatedAt: new Date().toISOString(),
            }
          : p
      );
      const recalculated = recalculateHierarchyMetadata(updated);
      if (onPersistBatchPrograms) void onPersistBatchPrograms(recalculated);
      return recalculated;
    });

    const movedTitle = programsMap.get(programId)?.title || 'Programme';
    const destTitle = newParentProgramId
      ? programsMap.get(newParentProgramId)?.title || 'New Parent'
      : 'Top Level';
    showToast(`Moved "${movedTitle}" under "${destTitle}".`);
  };

  const handleConfirmRename = (programId: string, newTitle: string, newSlug: string) => {
    setPrograms((prev) => {
      const updated = prev.map((p) =>
        p.id === programId
          ? {
              ...p,
              title: newTitle,
              slug: newSlug,
              updatedAt: new Date().toISOString(),
            }
          : p
      );
      const recalculated = recalculateHierarchyMetadata(updated);
      const changed = recalculated.find((p) => p.id === programId);
      if (changed && onPersistProgram) void onPersistProgram(changed);
      return recalculated;
    });
    showToast(`Renamed programme to "${newTitle}".`);
  };

  const handleReorderSibling = (programId: string, direction: 'UP' | 'DOWN') => {
    const target = programsMap.get(programId);
    if (!target) return;

    setPrograms((prev) => {
      const siblings = getDirectChildren(target.parentProgramId, prev).filter(
        (s) => !s.isArchived
      );
      const currentIdx = siblings.findIndex((s) => s.id === programId);
      if (currentIdx === -1) return prev;
      const swapIdx = direction === 'UP' ? currentIdx - 1 : currentIdx + 1;
      if (swapIdx < 0 || swapIdx >= siblings.length) return prev;

      const reorderedIds = siblings.map((s) => s.id);
      const temp = reorderedIds[currentIdx];
      reorderedIds[currentIdx] = reorderedIds[swapIdx];
      reorderedIds[swapIdx] = temp;

      const orderMap = new Map<string, number>();
      reorderedIds.forEach((id, idx) => orderMap.set(id, idx + 1));

      const next = prev.map((p) =>
        orderMap.has(p.id) ? { ...p, sortOrder: orderMap.get(p.id)! } : p
      );
      if (onPersistBatchPrograms) void onPersistBatchPrograms(next);
      return next;
    });
  };

  const handleConfirmArchiveToggle = (programId: string, reason?: string) => {
    const target = programsMap.get(programId);
    if (!target) return;
    const isRestoring = target.isArchived;

    setPrograms((prev) =>
      prev.map((p) => {
        if (p.id !== programId) return p;
        if (isRestoring) {
          const priorState = p.previousStatusBeforeArchive || 'PUBLISHED';
          const updated: PreviewProgramRecord = {
            ...p,
            isArchived: false,
            isPublished: priorState === 'PUBLISHED',
            status: priorState,
            archivedAt: null,
            updatedAt: new Date().toISOString(),
          };
          if (onPersistProgram) void onPersistProgram(updated);
          return updated;
        } else {
          const priorState: 'PUBLISHED' | 'DRAFT' = p.isPublished ? 'PUBLISHED' : 'DRAFT';
          const updated: PreviewProgramRecord = {
            ...p,
            isArchived: true,
            isPublished: false,
            status: 'ARCHIVED',
            previousStatusBeforeArchive: priorState,
            archivedAt: new Date().toISOString(),
            archiveReason:
              reason || 'Superseded or retired from active term catalogue.',
            updatedAt: new Date().toISOString(),
          };
          if (onPersistProgram) void onPersistProgram(updated);
          return updated;
        }
      })
    );

    if (isRestoring) {
      const priorLabel =
        target.previousStatusBeforeArchive === 'DRAFT' ? 'Draft' : 'Published';
      showToast(`Restored "${target.title}" as ${priorLabel}.`);
    } else {
      showToast(`Archived "${target.title}".`);
    }
  };

  const handleSaveCurriculum = (
    programId: string,
    payload: {
      curriculumTitle: string;
      curriculumPdfUrl: string;
      curriculumSummary: string;
      curriculum: string[];
      learningObjectives: string[];
      prerequisiteProgramIds: string[];
      progressionRule: 'sequential' | 'flexible';
      isRequired: boolean;
    }
  ) => {
    setPrograms((prev) =>
      prev.map((p) => {
        if (p.id !== programId) return p;
        const updated: PreviewProgramRecord = {
          ...p,
          curriculumTitle: payload.curriculumTitle,
          curriculumPdfUrl: payload.curriculumPdfUrl,
          curriculumSummary: payload.curriculumSummary,
          curriculum: payload.curriculum,
          learningObjectives: payload.learningObjectives,
          outcomes: payload.learningObjectives,
          prerequisiteProgramIds: payload.prerequisiteProgramIds,
          progressionRule: payload.progressionRule,
          isRequired: payload.isRequired,
          updatedAt: new Date().toISOString(),
        };
        if (onPersistProgram) void onPersistProgram(updated);
        return updated;
      })
    );
    const progTitle = programsMap.get(programId)?.title || 'Programme';
    showToast(`Saved curriculum changes for "${progTitle}".`);
  };

  const handleApproveProposal = (
    proposalId: string,
    publishImmediately: boolean,
    edited: ApprovedProposalEdits
  ) => {
    const prop = proposals.find((p) => p.id === proposalId);
    if (!prop) return;

    const nowIso = new Date().toISOString();
    const newProgId = `prog-approved-${Date.now().toString(36)}`;
    const statusLabel: 'PUBLISHED' | 'DRAFT' = publishImmediately ? 'PUBLISHED' : 'DRAFT';

    setProposals((prev) =>
      prev.map((item) => {
        if (item.id !== proposalId) return item;
        const updatedProp: PreviewProposalRecord = {
          ...item,
          title: edited.title,
          description: edited.description,
          parentProgramId: edited.parentProgramId,
          proposedNodeType: edited.nodeType,
          submittedPublicGroupPrice: edited.publicGroupPrice,
          submittedPrivateMentorshipPrice: edited.privateMentorshipPrice,
          curriculum: edited.curriculum,
          learningObjectives: edited.learningObjectives,
          status: 'APPROVED',
          adminReviewNotes: edited.adminReviewNotes,
          reviewedByName: 'Super Admin',
          reviewedAt: nowIso,
          reviewHistory: [
            ...item.reviewHistory,
            {
              id: `hist-${Date.now()}`,
              action: 'APPROVED',
              actorName: 'Super Admin',
              timestamp: nowIso.slice(0, 16).replace('T', ' '),
              notes: edited.adminReviewNotes,
            },
          ],
        };
        if (onPersistProposal) void onPersistProposal(updatedProp);
        return updatedProp;
      })
    );

    setPrograms((prev) => {
      const siblings = getDirectChildren(edited.parentProgramId, prev);
      const base = normalizeProgramRecord(newProgId, {
        title: edited.title,
        slug: slugifyTitle(edited.title),
        categoryId: prop.categoryId,
        shortDescription: edited.description,
        fullDescription: edited.description,
        parentProgramId: edited.parentProgramId,
        sortOrder: siblings.length + 1,
        nodeType: edited.nodeType,
        canContainChildren: edited.nodeType !== 'ENROLLABLE',
        isEnrollable: edited.nodeType !== 'CONTAINER',
        isRequired: prop.isRequired,
        isPublished: publishImmediately,
        isArchived: false,
        status: statusLabel,
        deliveryMode: getDeliveryFormatLabel(prop.deliveryFormat),
        deliveryOptions: prop.deliveryOptions,
        duration: prop.duration || '8 Weeks',
        sessionsPerWeek: prop.sessionsPerWeek || 2,
        sessionDuration: prop.sessionDuration || '60 mins',
        publicGroupPricing:
          edited.nodeType === 'CONTAINER'
            ? null
            : {
                amount: edited.publicGroupPrice,
                currency: 'NGN',
                billingCycle: 'Per Term / Cohort',
                label: 'Public Group Class',
              },
        privateMentorshipPricing:
          edited.nodeType === 'CONTAINER'
            ? null
            : {
                amount: edited.privateMentorshipPrice,
                currency: 'NGN',
                billingCycle: 'Per Month / 1-on-1',
                label: 'Private 1-on-1 Mentorship',
              },
        pricing:
          edited.nodeType === 'CONTAINER'
            ? 'Branch Container'
            : formatNaira(edited.publicGroupPrice),
        price: edited.publicGroupPrice,
        curriculum: edited.curriculum,
        learningObjectives: edited.learningObjectives,
        outcomes: edited.learningObjectives,
        prerequisiteProgramIds: prop.prerequisiteProgramIds || [],
        updatedAt: nowIso,
      });

      const createdRecord: PreviewProgramRecord = {
        ...base,
        deliveryFormat: prop.deliveryFormat || 'ONLINE',
        targetAudience: prop.targetAudience || 'B2C',
        previousStatusBeforeArchive: statusLabel,
      };

      const recalculated = recalculateHierarchyMetadata([...prev, createdRecord]);
      const finalCreated = recalculated.find((p) => p.id === newProgId);
      if (finalCreated && onPersistProgram) void onPersistProgram(finalCreated);
      return recalculated;
    });

    showToast(
      `Approved proposal "${edited.title}" and created ${
        publishImmediately ? 'Published' : 'Draft'
      } programme record.`
    );
  };

  const handleRequestChangesProposal = (proposalId: string, notes: string) => {
    const nowIso = new Date().toISOString();
    setProposals((prev) =>
      prev.map((item) => {
        if (item.id !== proposalId) return item;
        const updatedProp: PreviewProposalRecord = {
          ...item,
          status: 'CHANGES_REQUESTED',
          adminReviewNotes: notes,
          reviewedByName: 'Super Admin',
          reviewedAt: nowIso,
          reviewHistory: [
            ...item.reviewHistory,
            {
              id: `hist-${Date.now()}`,
              action: 'CHANGES_REQUESTED',
              actorName: 'Super Admin',
              timestamp: nowIso.slice(0, 16).replace('T', ' '),
              notes,
            },
          ],
        };
        if (onPersistProposal) void onPersistProposal(updatedProp);
        return updatedProp;
      })
    );
    showToast('Requested revisions from tutor.');
  };

  const handleRejectProposal = (proposalId: string, reason: string) => {
    const nowIso = new Date().toISOString();
    setProposals((prev) =>
      prev.map((item) => {
        if (item.id !== proposalId) return item;
        const updatedProp: PreviewProposalRecord = {
          ...item,
          status: 'REJECTED',
          adminReviewNotes: reason,
          reviewedByName: 'Super Admin',
          reviewedAt: nowIso,
          reviewHistory: [
            ...item.reviewHistory,
            {
              id: `hist-${Date.now()}`,
              action: 'REJECTED',
              actorName: 'Super Admin',
              timestamp: nowIso.slice(0, 16).replace('T', ' '),
              notes: reason,
            },
          ],
        };
        if (onPersistProposal) void onPersistProposal(updatedProp);
        return updatedProp;
      })
    );
    showToast('Proposal marked as Rejected.');
  };

  const handleAssignUnassignedParent = (programId: string, newParentId: string) => {
    setPrograms((prev) => {
      const siblings = getDirectChildren(newParentId, prev);
      const updated = prev.map((p) =>
        p.id === programId
          ? {
              ...p,
              parentProgramId: newParentId,
              isUnassigned: false,
              unassignedReasonType: undefined,
              unassignedReasonDetail: undefined,
              sortOrder: siblings.length + 1,
              updatedAt: new Date().toISOString(),
            }
          : p
      );
      const recalculated = recalculateHierarchyMetadata(updated);
      const changed = recalculated.find((p) => p.id === programId);
      if (changed && onPersistProgram) void onPersistProgram(changed);
      return recalculated;
    });
    const progTitle = programsMap.get(programId)?.title || 'Programme';
    const parentTitle = programsMap.get(newParentId)?.title || 'Parent';
    showToast(`Assigned "${progTitle}" under "${parentTitle}".`);
  };

  const handleCreateBackup = (label?: string): BackupSnapshot => {
    const snap = createBackupSnapshot(programs, label);
    setBackups((prev) => [snap, ...prev]);
    showToast(`Created backup snapshot "${snap.label}".`);
    return snap;
  };

  const handleRunMigrationCommit = () => {
    const plan = generateHierarchyMigrationPreview(programs);
    setPrograms((prev) => {
      const planMap = new Map(
        plan.proposedMappings.map((item) => [item.programId, item])
      );
      const updated = prev.map((p) => {
        const mig = planMap.get(p.id);
        if (!mig || p.isArchived) return p;
        return {
          ...p,
          parentProgramId: mig.proposedParentId,
          rootProgramId: mig.proposedRootId,
          ancestorIds: mig.proposedAncestorIds,
          nodeType: mig.proposedNodeType,
          isUnassigned: mig.action === 'FLAG_UNASSIGNED',
          updatedAt: new Date().toISOString(),
        };
      });
      const recalculated = recalculateHierarchyMetadata(updated);
      if (onPersistBatchPrograms) void onPersistBatchPrograms(recalculated);
      return recalculated;
    });
    showToast('Committed hierarchy migration.');
  };

  const handleIsolateInvalidProgram = (programId: string, reason: string) => {
    setPrograms((prev) => {
      const updated = prev.map((p) =>
        p.id === programId
          ? {
              ...p,
              parentProgramId: null,
              rootProgramId: null,
              ancestorIds: [],
              isUnassigned: true,
              unassignedReasonType: 'INVALID_REFERENCE' as const,
              unassignedReasonDetail: reason,
              updatedAt: new Date().toISOString(),
            }
          : p
      );
      return recalculateHierarchyMetadata(updated);
    });
    showToast('Isolated record into Unassigned queue.');
  };

  const handleResetDemoData = () => {
    const fresh = recalculateHierarchyMetadata(INITIAL_DEMO_PROGRAMS);
    setPrograms(fresh);
    setProposals(INITIAL_DEMO_PROPOSALS);
    setBackups([
      createBackupSnapshot(fresh, 'Initial Pre-Migration Baseline Snapshot'),
    ]);
    setSelectedHierarchyId('prog-smart-techies');
    setSelectedCurriculumId('prog-web-development');
    setActiveSection('catalogue');
    showToast('Reset workspace to clean demonstration state.');
  };

  const shellMeta = useMemo(() => {
    switch (activeSection) {
      case 'catalogue':
        return {
          title: 'Programs & Courses',
          subtitle: 'Manage all learning programmes, courses and curriculum',
          breadcrumbs: undefined,
        };
      case 'hierarchy':
        return {
          title: 'Programs & Courses',
          subtitle: 'Explore and manage the full programme structure',
          breadcrumbs: [
            { label: 'Programs & Courses', onClick: () => setActiveSection('catalogue') },
            { label: 'Hierarchy Manager' },
          ],
        };
      case 'curriculum':
        return {
          title: 'Programs & Courses',
          subtitle: 'Manage modules, lessons and learning objectives',
          breadcrumbs: [
            { label: 'Programs & Courses', onClick: () => setActiveSection('catalogue') },
            { label: 'Curriculum Builder' },
          ],
        };
      case 'proposals':
        return {
          title: 'Programs & Courses',
          subtitle: 'Review and approve proposed courses from our tutors',
          breadcrumbs: [
            { label: 'Programs & Courses', onClick: () => setActiveSection('catalogue') },
            { label: 'Tutor Proposals' },
          ],
        };
      case 'archive-tools':
      case 'unassigned':
        return {
          title: 'Programs & Courses',
          subtitle: 'Manage archived records and advanced operations',
          breadcrumbs: [
            { label: 'Programs & Courses', onClick: () => setActiveSection('catalogue') },
            { label: 'Archive & Tools' },
          ],
        };
      case 'editor':
        return {
          title: 'Programs & Courses',
          subtitle: 'Add or update a programme in the learning ecosystem',
          breadcrumbs: [
            { label: 'Programs & Courses', onClick: () => setActiveSection('catalogue') },
            { label: editingProgramId ? 'Edit Programme' : 'Create Programme' },
          ],
        };
      case 'overview':
        return {
          title: 'Programs & Courses',
          subtitle: 'Manage academic programs and their associated courses.',
          breadcrumbs: [
            { label: 'Programs & Courses', onClick: () => setActiveSection('catalogue') },
            { label: 'Programs Overview' },
          ],
        };
    }
  }, [activeSection, editingProgramId]);

  const editingProgram = editingProgramId
    ? programsMap.get(editingProgramId) || null
    : null;
  const movingProgram = movingProgramId
    ? programsMap.get(movingProgramId) || null
    : null;
  const renamingProgram = renamingProgramId
    ? programsMap.get(renamingProgramId) || null
    : null;
  const archivingProgram = archivingProgramId
    ? programsMap.get(archivingProgramId) || null
    : null;

  return (
    <PreviewAdminShell
      activeSection={activeSection}
      onSelectSection={(sec) => {
        if (sec === 'unassigned') {
          setArchiveSubTab('unassigned');
          setActiveSection('archive-tools');
        } else {
          setActiveSection(sec);
        }
      }}
      counts={counts}
      onCreateProgramme={() => handleOpenCreateEditor(null)}
      onOpenQuickCreateModal={() => handleOpenQuickCreateModal(null)}
      onResetDemoData={embeddedInAdminLayout ? undefined : handleResetDemoData}
      breadcrumbs={shellMeta.breadcrumbs}
      headerTitle={shellMeta.title}
      headerSubtitle={shellMeta.subtitle}
      embeddedInAdminLayout={embeddedInAdminLayout}
    >
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-slate-900 text-white text-xs font-medium flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="p-1 text-slate-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* VIEW 1: CATALOGUE (Matches Image 3 Top-Left & Mobile View) */}
      {activeSection === 'catalogue' && (
        <ProgrammeCatalogueView
          programs={programs}
          programsMap={programsMap}
          onCreateNew={(parentId) => handleOpenQuickCreateModal(parentId || null)}
          onEditProgram={handleOpenEditEditor}
          onInspectInHierarchy={handleInspectInHierarchy}
          onOpenCurriculum={handleOpenCurriculum}
          onMoveProgram={(prog) => setMovingProgramId(prog.id)}
          onRenameProgram={(prog) => setRenamingProgramId(prog.id)}
          onTogglePublish={handleTogglePublish}
          onRequestArchiveToggle={(prog) => setArchivingProgramId(prog.id)}
          onNavigateToSection={(sec) => {
            if (sec === 'unassigned') {
              setArchiveSubTab('unassigned');
              setActiveSection('archive-tools');
            } else {
              setActiveSection(sec);
            }
          }}
          pendingProposalsCount={counts.pendingProposals}
        />
      )}

      {/* VIEW 2: HIERARCHY (Matches Image 2 Top-Left & Image 3 Top-Right) */}
      {activeSection === 'hierarchy' && (
        <ProgrammeHierarchyView
          programs={programs}
          programsMap={programsMap}
          selectedProgramId={selectedHierarchyId}
          onSelectProgram={(id) => setSelectedHierarchyId(id)}
          onCreateChild={(parentId) => handleOpenQuickCreateModal(parentId)}
          onEditProgram={handleOpenEditEditor}
          onOpenCurriculum={handleOpenCurriculum}
          onMoveProgram={(prog) => setMovingProgramId(prog.id)}
          onRenameProgram={(prog) => setRenamingProgramId(prog.id)}
          onReorderSibling={handleReorderSibling}
          onRequestArchiveToggle={(prog) => setArchivingProgramId(prog.id)}
        />
      )}

      {/* VIEW 3: FULL-PAGE PROGRAMME EDITOR (Matches Image 2 Middle-Left) */}
      {activeSection === 'editor' && (
        <ProgrammeEditorView
          editingProgram={editingProgram}
          initialParentId={editorInitialParentId}
          programsMap={programsMap}
          onSaveProgramme={handleSaveProgramme}
          onCancel={() => setActiveSection('catalogue')}
        />
      )}

      {/* VIEW 4: CURRICULUM BUILDER (Matches Image 2 Top-Right & Image 3 Middle-Left) */}
      {activeSection === 'curriculum' && (
        <CurriculumWorkspaceView
          programs={programs}
          programsMap={programsMap}
          selectedProgramId={selectedCurriculumId}
          onSelectProgram={(id) => setSelectedCurriculumId(id)}
          onSaveCurriculum={handleSaveCurriculum}
        />
      )}

      {/* VIEW 5: TUTOR PROPOSALS (Matches Image 2 Middle-Right & Image 3 Middle-Right) */}
      {activeSection === 'proposals' && (
        <TutorProposalsView
          proposals={proposals}
          programs={programs}
          onApproveProposal={handleApproveProposal}
          onRequestChanges={handleRequestChangesProposal}
          onRejectProposal={handleRejectProposal}
        />
      )}

      {/* VIEW 6: UNASSIGNED DIRECT */}
      {activeSection === 'unassigned' && (
        <UnassignedProgrammesView
          programs={programs}
          onAssignParent={handleAssignUnassignedParent}
          onEditProgram={(id) => {
            const p = programsMap.get(id);
            if (p) handleOpenEditEditor(p);
          }}
          onInspectProgram={(id) => {
            setSelectedHierarchyId(id);
            setActiveSection('hierarchy');
          }}
        />
      )}

      {/* VIEW 7: ARCHIVE & ADVANCED TOOLS (Matches Image 2 Bottom-Left & Image 3 Bottom-Right) */}
      {activeSection === 'archive-tools' && (
        <ArchiveAndToolsView
          programs={programs}
          activeTab={archiveSubTab}
          onSelectTab={setArchiveSubTab}
          backups={backups}
          integrityFindings={integrityFindings}
          onRestoreArchived={(id) => setArchivingProgramId(id)}
          onInspectProgram={(id) => {
            setSelectedHierarchyId(id);
            setActiveSection('hierarchy');
          }}
          onEditProgram={(id) => {
            const p = programsMap.get(id);
            if (p) handleOpenEditEditor(p);
          }}
          onAssignUnassignedParent={handleAssignUnassignedParent}
          onCreateBackup={handleCreateBackup}
          onRunMigrationCommit={handleRunMigrationCommit}
          onRunIntegrityCheck={() => showToast('Completed hierarchy integrity audit.')}
          onIsolateInvalidProgram={handleIsolateInvalidProgram}
        />
      )}

      {/* VIEW 8: MASTER PROGRAMS OVERVIEW (Matches Image 1) */}
      {activeSection === 'overview' && (
        <ProgramsMasterOverviewView
          programs={programs}
          programsMap={programsMap}
          onSelectProgramForEdit={handleOpenEditEditor}
          onInspectInHierarchy={handleInspectInHierarchy}
          onOpenCurriculum={handleOpenCurriculum}
          onAddCourseUnder={(parentId) => handleOpenQuickCreateModal(parentId)}
          onTogglePublish={handleTogglePublish}
          onOpenArchiveTools={(tab) => {
            setArchiveSubTab(tab);
            setActiveSection('archive-tools');
          }}
          onViewAllCatalogue={() => setActiveSection('catalogue')}
        />
      )}

      {/* CONTROLLED MODALS */}
      <CreateProgrammeModal
        isOpen={quickCreateModalOpen}
        initialParentId={quickCreateParentId}
        programsMap={programsMap}
        onClose={() => setQuickCreateModalOpen(false)}
        onExpandToFullEditor={(parentId) => handleOpenCreateEditor(parentId)}
        onSaveProgramme={(draft, status) => handleSaveProgramme(draft, status)}
      />

      <MoveProgrammeModal
        program={movingProgram}
        programs={programs}
        onClose={() => setMovingProgramId(null)}
        onConfirmMove={handleConfirmMove}
      />

      <QuickRenameModal
        program={renamingProgram}
        onClose={() => setRenamingProgramId(null)}
        onConfirmRename={handleConfirmRename}
      />

      <ArchiveConfirmModal
        program={archivingProgram}
        onClose={() => setArchivingProgramId(null)}
        onConfirmArchiveToggle={handleConfirmArchiveToggle}
      />
    </PreviewAdminShell>
  );
};

export default ProgramsCoursesPreviewPage;
