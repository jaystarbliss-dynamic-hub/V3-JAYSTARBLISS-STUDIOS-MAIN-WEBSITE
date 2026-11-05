import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';
import { db, auth, getAllClientDatabases } from '../../lib/firebase';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  Edit2,
  Trash2,
  Search,
  Sparkles,
  BookOpen,
  Briefcase,
  Layers,
  GraduationCap,
  CheckCircle2,
  Folder,
  FolderOpen,
  FolderTree,
  ChevronRight,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  Move,
  Archive,
  RotateCcw,
  AlertTriangle,
  Download,
  ShieldCheck,
  GitBranch,
  FileCheck2,
  X,
  Eye,
  Users,
  UserCheck,
  Clock,
} from 'lucide-react';
import AdminTutorSubjects from './AdminTutorSubjects';

const SERVICES_ECOSYSTEM_TEMPLATES: Array<Record<string, any>> = [];
import {
  type ProgramRecord,
  type ProgramTreeNode,
  type ProgramNodeType,
  type HierarchyMigrationPreviewReport,
  type TutorProgramProposal,
  PRIMARY_PROGRAM_ROOTS,
  normalizeProgramRecord,
  buildProgramTree,
  getAllDescendants,
  getDirectChildren,
  getAncestors,
  getProgramBreadcrumbs,
  previewBranchMove,
  executeBranchMove,
  reorderSiblingPrograms,
  generateHierarchyMigrationPreview,
  exportProgramsBackupJson,
  executeAuthorisedHierarchyMigration,
  fetchTutorProgramProposals,
  reviewTutorProgramProposal,
  slugifyTitle,
} from '../../lib/programHierarchy';

type SubViewMode =
  | 'TREE'
  | 'UNASSIGNED'
  | 'PROPOSALS'
  | 'MIGRATION'
  | 'ARCHIVED'
  | 'FLAT';

const AdminPrograms: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'programs' | 'services' | 'tutor_subjects'>('programs');
  const [subViewMode, setSubViewMode] = useState<SubViewMode>('TREE');

  const [rawPrograms, setRawPrograms] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [proposals, setProposals] = useState<TutorProgramProposal[]>([]);
  const [activeEnrollmentsCountByProgram, setActiveEnrollmentsCountByProgram] = useState<
    Record<string, number>
  >({});

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRootFilter, setSelectedRootFilter] = useState<string>('ALL');
  const [nodeTypeFilter, setNodeTypeFilter] = useState<'ALL' | ProgramNodeType>('ALL');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Tree expansion state (stores expanded program IDs)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Drag & Drop state
  const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const [dragOverTargetId, setDragOverTargetId] = useState<string | null>(null);

  // Move Modal State
  const [moveModalNode, setMoveModalNode] = useState<ProgramRecord | null>(null);
  const [targetParentIdForMove, setTargetParentIdForMove] = useState<string>('');
  const [movingBranch, setMovingBranch] = useState(false);

  // Quick Add Sub-Programme Modal State
  const [quickAddParent, setQuickAddParent] = useState<ProgramRecord | null | 'ROOT'>(null);
  const [quickAddTitle, setQuickAddTitle] = useState('');
  const [quickAddNodeType, setQuickAddNodeType] = useState<ProgramNodeType>('ENROLLABLE');
  const [quickAddShortDesc, setQuickAddShortDesc] = useState('');
  const [quickAddIsRequired, setQuickAddIsRequired] = useState(true);
  const [quickAddPublicPrice, setQuickAddPublicPrice] = useState(35000);
  const [quickAddPrivatePrice, setQuickAddPrivatePrice] = useState(60000);
  const [quickAddSaving, setQuickAddSaving] = useState(false);

  // Quick Rename Modal State
  const [renameNode, setRenameNode] = useState<ProgramRecord | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renamingSaving, setRenamingSaving] = useState(false);

  // Archive / Delete Safety Modal State
  const [archiveConfirmNode, setArchiveConfirmNode] = useState<ProgramRecord | null>(null);
  const [archivingSaving, setArchivingSaving] = useState(false);

  // Migration Preview State
  const [migrationReport, setMigrationReport] = useState<HierarchyMigrationPreviewReport | null>(
    null
  );
  const [selectedMigrationProgramIds, setSelectedMigrationProgramIds] = useState<Set<string>>(
    new Set()
  );
  const [executingMigration, setExecutingMigration] = useState(false);

  // Tutor Proposal Review Modal State
  const [reviewingProposal, setReviewingProposal] = useState<TutorProgramProposal | null>(null);
  const [proposalReviewNotes, setProposalReviewNotes] = useState('');
  const [proposalPublicPrice, setProposalPublicPrice] = useState(35000);
  const [proposalPrivatePrice, setProposalPrivatePrice] = useState(60000);
  const [proposalPublishImmediately, setProposalPublishImmediately] = useState(true);
  const [savingProposalDecision, setSavingProposalDecision] = useState(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 5000);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const clientDbs = getAllClientDatabases();
      const [progSnapshots, servSnapshots, studentSnapshots, proposalList] = await Promise.all([
        Promise.all(
          clientDbs.map((database: Firestore) =>
            getDocs(collection(database, 'programs')).catch(() => null)
          )
        ),
        Promise.all(
          clientDbs.map((database: Firestore) =>
            getDocs(collection(database, 'services')).catch(() => null)
          )
        ),
        Promise.all(
          clientDbs.map((database: Firestore) =>
            getDocs(collection(database, 'students')).catch(() => null)
          )
        ),
        fetchTutorProgramProposals().catch(() => [] as TutorProgramProposal[]),
      ]);

      const progMap = new Map<string, any>();
      progSnapshots.forEach((snap: any) => {
        if (!snap) return;
        snap.docs.forEach((d: any) => {
          if (!progMap.has(d.id)) {
            progMap.set(d.id, { id: d.id, ...d.data() });
          } else {
            progMap.set(d.id, { ...progMap.get(d.id), ...d.data(), id: d.id });
          }
        });
      });

      const servMap = new Map<string, any>();
      servSnapshots.forEach((snap: any) => {
        if (!snap) return;
        snap.docs.forEach((d: any) => {
          if (!servMap.has(d.id)) {
            servMap.set(d.id, { id: d.id, ...d.data() });
          }
        });
      });

      // Count active student enrolments referencing each programme ID or title
      const enrollCount: Record<string, number> = {};
      const seenStudents = new Set<string>();
      studentSnapshots.forEach((snap: any) => {
        if (!snap) return;
        snap.docs.forEach((d: any) => {
          if (seenStudents.has(d.id)) return;
          seenStudents.add(d.id);
          const s = d.data();
          const ids = new Set<string>([
            ...(Array.isArray(s.selectedProgramIds) ? s.selectedProgramIds : []),
            ...(Array.isArray(s.assignedProgramIds) ? s.assignedProgramIds : []),
            ...(Array.isArray(s.assignedTrackIds) ? s.assignedTrackIds : []),
            ...(s.programId ? [s.programId] : []),
          ]);
          ids.forEach((pid) => {
            enrollCount[pid] = (enrollCount[pid] || 0) + 1;
          });
        });
      });

      const progArray = Array.from(progMap.values());
      setRawPrograms(progArray);
      setServices(Array.from(servMap.values()));
      setProposals(proposalList);
      setActiveEnrollmentsCountByProgram(enrollCount);

      // Default expand primary root nodes on first load
      setExpandedIds((prev) => {
        if (prev.size > 0) return prev;
        const initial = new Set<string>();
        progArray.forEach((p) => {
          const norm = normalizeProgramRecord(p.id, p);
          if (!norm.parentProgramId || norm.isPrimaryRoot) {
            initial.add(norm.id);
          }
        });
        return initial;
      });
    } catch (error) {
      console.error('Error fetching programme hierarchy:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Normalized records and Recursive Tree structure
  const normalizedPrograms = useMemo(() => {
    return rawPrograms.map((p) => normalizeProgramRecord(p.id, p));
  }, [rawPrograms]);

  const treeResult = useMemo(() => {
    return buildProgramTree(normalizedPrograms);
  }, [normalizedPrograms]);

  // Dry-run migration preview computed on demand or when rawPrograms changes
  useEffect(() => {
    const report = generateHierarchyMigrationPreview(rawPrograms);
    setMigrationReport(report);
    const highConfIds = new Set(
      report.items
        .filter((i) => i.confidence === 'HIGH' && i.action !== 'NO_CHANGE_NEEDED')
        .map((i) => i.programId)
    );
    setSelectedMigrationProgramIds(highConfIds);
  }, [rawPrograms]);

  // Filter tree nodes while keeping ancestors of matching descendants visible
  const filterTreeNodes = (nodes: ProgramTreeNode[]): ProgramTreeNode[] => {
    const q = searchTerm.trim().toLowerCase();
    const matchesNode = (node: ProgramTreeNode): boolean => {
      const p = node.program;
      if (nodeTypeFilter !== 'ALL' && p.nodeType !== nodeTypeFilter) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        node.breadcrumbPath.toLowerCase().includes(q) ||
        (p.shortDescription || '').toLowerCase().includes(q) ||
        (p.categoryId || '').toLowerCase().includes(q) ||
        p.curriculum.some((c) => c.toLowerCase().includes(q))
      );
    };

    const filterRecursive = (list: ProgramTreeNode[]): ProgramTreeNode[] => {
      const result: ProgramTreeNode[] = [];
      for (const node of list) {
        const filteredChildren = filterRecursive(node.children);
        if (matchesNode(node) || filteredChildren.length > 0) {
          result.push({
            ...node,
            children: filteredChildren,
          });
        }
      }
      return result;
    };

    let baseRoots = nodes;
    if (selectedRootFilter !== 'ALL') {
      baseRoots = nodes.filter(
        (n) =>
          n.program.id === selectedRootFilter ||
          n.program.primaryRootKey === selectedRootFilter ||
          n.program.title.toLowerCase() === selectedRootFilter.toLowerCase()
      );
    }

    return filterRecursive(baseRoots);
  };

  const displayedTreeRoots = useMemo(
    () => filterTreeNodes(treeResult.roots),
    [treeResult.roots, searchTerm, selectedRootFilter, nodeTypeFilter]
  );

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    const allIds = new Set<string>();
    for (const p of normalizedPrograms) {
      allIds.add(p.id);
    }
    setExpandedIds(allIds);
  };

  const collapseAll = () => {
    setExpandedIds(new Set());
  };

  // Live Preview for Move Modal
  const movePreview = useMemo(() => {
    if (!moveModalNode) return null;
    const newParentId = targetParentIdForMove === '__ROOT__' || !targetParentIdForMove ? null : targetParentIdForMove;
    return previewBranchMove(moveModalNode.id, newParentId, treeResult.programsMap);
  }, [moveModalNode, targetParentIdForMove, treeResult.programsMap]);

  const handleConfirmMoveBranch = async () => {
    if (!moveModalNode || !movePreview || !movePreview.isValid) return;
    setMovingBranch(true);
    try {
      const newParentId =
        targetParentIdForMove === '__ROOT__' || !targetParentIdForMove
          ? null
          : targetParentIdForMove;
      await executeBranchMove(moveModalNode.id, newParentId, treeResult.programsMap);
      showToast(
        `Moved "${moveModalNode.title}" (${movePreview.affectedNodeIds.length} node(s) updated) to "${movePreview.newBreadcrumbPath}".`
      );
      setMoveModalNode(null);
      await fetchData();
    } catch (err: any) {
      showToast(err?.message || 'Failed to move programme branch.');
    } finally {
      setMovingBranch(false);
    }
  };

  // Drag & Drop handlers
  const handleDropOnNode = async (targetNode: ProgramRecord) => {
    const sourceId = draggedNodeId;
    setDraggedNodeId(null);
    setDragOverTargetId(null);
    if (!sourceId || sourceId === targetNode.id) return;

    const sourceProg = treeResult.programsMap.get(sourceId);
    if (!sourceProg) return;

    // Open the Move Preview confirmation modal pre-populated with targetNode so admin sees impact before committing
    setMoveModalNode(sourceProg);
    setTargetParentIdForMove(targetNode.id);
  };

  // Sibling Up/Down Reordering
  const handleMoveSiblingOrder = async (program: ProgramRecord, direction: 'UP' | 'DOWN') => {
    const siblings = getDirectChildren(program.parentProgramId, treeResult.programsMap.values()).filter(
      (s) => !s.isArchived && s.isUnassigned === program.isUnassigned
    );
    const idx = siblings.findIndex((s) => s.id === program.id);
    if (idx === -1) return;
    const swapIdx = direction === 'UP' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= siblings.length) return;

    const orderedIds = siblings.map((s) => s.id);
    const temp = orderedIds[idx];
    orderedIds[idx] = orderedIds[swapIdx];
    orderedIds[swapIdx] = temp;

    try {
      await reorderSiblingPrograms(orderedIds);
      await fetchData();
    } catch (err) {
      console.error('Failed to reorder sibling programmes:', err);
    }
  };

  // Quick Add Sub-Programme
  const handleQuickAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickAddTitle.trim()) return;
    setQuickAddSaving(true);
    try {
      const isRoot = quickAddParent === 'ROOT' || !quickAddParent;
      const parentRecord = !isRoot && quickAddParent ? quickAddParent : null;

      let ancestorIds: string[] = [];
      let rootProgramId: string | null = null;
      if (parentRecord) {
        const parentAncestors = getAncestors(parentRecord.id, treeResult.programsMap);
        ancestorIds = [...parentAncestors.map((a) => a.id), parentRecord.id];
        rootProgramId = ancestorIds[0] || parentRecord.id;
      }

      const siblings = getDirectChildren(
        parentRecord ? parentRecord.id : null,
        treeResult.programsMap.values()
      );
      const sortOrder = siblings.length + 1;
      const newDocRef = doc(collection(db, 'programs'));
      if (!parentRecord) {
        rootProgramId = newDocRef.id;
      }

      const pubAmount = Number(quickAddPublicPrice) || 35000;
      const privAmount = Number(quickAddPrivatePrice) || 60000;

      const payload: any = {
        title: quickAddTitle.trim(),
        slug: slugifyTitle(quickAddTitle.trim()),
        categoryId: parentRecord?.categoryId || 'DIGITAL_AND_TECHNOLOGY',
        shortDescription:
          quickAddShortDesc.trim() ||
          `${quickAddTitle.trim()} learning pathway under ${parentRecord?.title || 'Jaystarbliss Studios'}.`,
        fullDescription: quickAddShortDesc.trim(),
        description: quickAddShortDesc.trim(),
        parentProgramId: parentRecord ? parentRecord.id : null,
        rootProgramId,
        ancestorIds,
        sortOrder,
        order: sortOrder,
        stageNumber: sortOrder,
        seriesName: parentRecord ? parentRecord.title : quickAddTitle.trim(),
        programPack: parentRecord ? parentRecord.title : quickAddTitle.trim(),
        nodeType: quickAddNodeType,
        canContainChildren: true,
        isEnrollable: quickAddNodeType !== 'CONTAINER',
        isRequired: quickAddIsRequired,
        progressionRule: 'sequential',
        isPublished: true,
        isArchived: false,
        isUnassigned: false,
        isPrimaryRoot: !parentRecord,
        status: 'PUBLISHED',
        deliveryOptions: ['PUBLIC_GROUP', 'PRIVATE_MENTORSHIP'],
        pricing: quickAddNodeType === 'CONTAINER' ? 'Branch Container' : `₦${pubAmount.toLocaleString()}`,
        price: pubAmount,
        publicGroupPricing: {
          amount: pubAmount,
          currency: 'NGN',
          billingCycle: 'Per Term / Cohort',
          label: 'Public Group Class',
        },
        privateMentorshipPricing: {
          amount: privAmount,
          currency: 'NGN',
          billingCycle: 'Per Month / 1-on-1',
          label: 'Private 1-on-1 Mentorship',
        },
        curriculum: [],
        learningObjectives: [],
        prerequisiteProgramIds: [],
        sessionsPerWeek: 2,
        sessionDuration: '1 hour',
        hasResources: true,
        hasAssessments: true,
        hasLiveClasses: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const dbs = getAllClientDatabases();
      await Promise.all(
        dbs.map((database: Firestore) =>
          setDoc(doc(database, 'programs', newDocRef.id), payload, { merge: true }).catch((err) => {
            if (database === db) throw err;
          })
        )
      );

      if (parentRecord) {
        setExpandedIds((prev) => new Set([...prev, parentRecord.id]));
      }
      setQuickAddParent(null);
      setQuickAddTitle('');
      setQuickAddShortDesc('');
      showToast(
        `Created "${payload.title}" ${
          parentRecord ? `under "${parentRecord.title}"` : 'as a root programme'
        }.`
      );
      await fetchData();
    } catch (err: any) {
      showToast(err?.message || 'Failed to create sub-programme.');
    } finally {
      setQuickAddSaving(false);
    }
  };

  // Quick Rename
  const handleQuickRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renameNode || !renameValue.trim()) return;
    setRenamingSaving(true);
    try {
      const dbs = getAllClientDatabases();
      const newTitle = renameValue.trim();
      await Promise.all(
        dbs.map((database: Firestore) =>
          setDoc(
            doc(database, 'programs', renameNode.id),
            {
              title: newTitle,
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          ).catch((err) => {
            if (database === db) throw err;
          })
        )
      );
      showToast(`Renamed "${renameNode.title}" to "${newTitle}" (ID ${renameNode.id} preserved).`);
      setRenameNode(null);
      await fetchData();
    } catch (err: any) {
      showToast(err?.message || 'Failed to rename programme.');
    } finally {
      setRenamingSaving(false);
    }
  };

  // Toggle Publish / Draft status
  const handleTogglePublish = async (prog: ProgramRecord) => {
    const nextPublished = !prog.isPublished;
    const nextStatus = nextPublished ? 'PUBLISHED' : 'DRAFT';
    try {
      const dbs = getAllClientDatabases();
      await Promise.all(
        dbs.map((database: Firestore) =>
          setDoc(
            doc(database, 'programs', prog.id),
            {
              isPublished: nextPublished,
              status: nextStatus,
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          ).catch((err) => {
            if (database === db) throw err;
          })
        )
      );
      showToast(`"${prog.title}" is now ${nextStatus}.`);
      await fetchData();
    } catch (err: any) {
      showToast(err?.message || 'Failed to update status.');
    }
  };

  // Safe Archive or Restore (Preserves all historical records and IDs)
  const handleConfirmArchiveToggle = async () => {
    if (!archiveConfirmNode) return;
    setArchivingSaving(true);
    try {
      const nextArchived = !archiveConfirmNode.isArchived;
      const nextStatus = nextArchived ? 'ARCHIVED' : 'PUBLISHED';
      const dbs = getAllClientDatabases();
      await Promise.all(
        dbs.map((database: Firestore) =>
          setDoc(
            doc(database, 'programs', archiveConfirmNode.id),
            {
              isArchived: nextArchived,
              isPublished: !nextArchived,
              status: nextStatus,
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          ).catch((err) => {
            if (database === db) throw err;
          })
        )
      );
      showToast(
        nextArchived
          ? `Archived "${archiveConfirmNode.title}". Existing student records and historical progress remain intact.`
          : `Restored "${archiveConfirmNode.title}" to active catalogue.`
      );
      setArchiveConfirmNode(null);
      await fetchData();
    } catch (err: any) {
      showToast(err?.message || 'Failed to update archive status.');
    } finally {
      setArchivingSaving(false);
    }
  };

  // Export JSON Backup before migration
  const handleDownloadBackupJson = () => {
    const json = exportProgramsBackupJson(rawPrograms);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jaystarbliss-programs-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Downloaded JSON backup of all existing programme documents.');
  };

  // Execute Authorised Hierarchy Migration
  const handleExecuteMigration = async () => {
    if (!migrationReport) return;
    setExecutingMigration(true);
    try {
      const result = await executeAuthorisedHierarchyMigration(migrationReport, {
        ensureFourPrimaryRoots: true,
        approvedProgramIds: Array.from(selectedMigrationProgramIds),
        actorUid: auth.currentUser?.uid || 'admin',
        actorEmail: auth.currentUser?.email || 'admin@jaystarbliss.com',
      });
      showToast(
        `Migration complete: ${result.rootsCreatedOrUpdated} Primary Roots verified, ${result.programsUpdated} programmes linked, ${result.unassignedFlagged} uncertain programmes placed in Unassigned Review.`
      );
      await fetchData();
      setSubViewMode('TREE');
    } catch (err: any) {
      showToast(err?.message || 'Migration failed.');
    } finally {
      setExecutingMigration(false);
    }
  };

  // Review Tutor Proposal
  const handleProposalDecision = async (
    decision: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED'
  ) => {
    if (!reviewingProposal) return;
    setSavingProposalDecision(true);
    try {
      await reviewTutorProgramProposal({
        proposal: reviewingProposal,
        decision,
        adminReviewNotes: proposalReviewNotes,
        reviewerUid: auth.currentUser?.uid || 'admin',
        reviewerName: auth.currentUser?.displayName || auth.currentUser?.email || 'Administrator',
        publicGroupPrice: Number(proposalPublicPrice) || 35000,
        privateMentorshipPrice: Number(proposalPrivatePrice) || 60000,
        publishImmediately: proposalPublishImmediately,
        programsMap: treeResult.programsMap,
      });
      showToast(
        decision === 'APPROVED'
          ? `Approved and created sub-programme "${reviewingProposal.title}".`
          : `Updated proposal status to ${decision}.`
      );
      setReviewingProposal(null);
      setProposalReviewNotes('');
      await fetchData();
    } catch (err: any) {
      showToast(err?.message || 'Failed to process tutor proposal.');
    } finally {
      setSavingProposalDecision(false);
    }
  };

  const handleSyncServices = async () => {
    setSyncing(true);
    try {
      const existingSlugs = new Set(
        services.map((s) => (s.slug || '').toLowerCase().trim()).filter(Boolean)
      );
      let addedCount = 0;
      const clientDbs = getAllClientDatabases();
      for (const template of SERVICES_ECOSYSTEM_TEMPLATES) {
        const slugKey = template.slug.toLowerCase().trim();
        if (existingSlugs.has(slugKey)) continue;
        const payload = {
          ...template,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const newRef = doc(collection(db, 'services'));
        await Promise.all(
          clientDbs.map((database: Firestore) =>
            setDoc(doc(database, 'services', newRef.id), payload, { merge: true }).catch(() => null)
          )
        );
        addedCount++;
      }
      await fetchData();
      showToast(
        addedCount > 0
          ? `Synchronized ${addedCount} Services.`
          : 'All Services are already synchronized.'
      );
    } catch (err) {
      console.error('Error syncing services:', err);
    } finally {
      setSyncing(false);
    }
  };

  const handleDeleteService = async (id: string, title: string) => {
    try {
      const clientDbs = getAllClientDatabases();
      await Promise.all(
        clientDbs.map((database: Firestore) =>
          deleteDoc(doc(database, 'services', id)).catch(() => null)
        )
      );
      setServices((prev) => prev.filter((s) => s.id !== id));
      showToast(`Removed service "${title}".`);
    } catch (error) {
      console.error('Error deleting service:', error);
    }
  };

  // Eligible target parents for Move Modal (excludes self and all descendants of moveModalNode)
  const eligibleTargetParentsForMove = useMemo(() => {
    if (!moveModalNode) return [];
    const excluded = new Set<string>([moveModalNode.id]);
    const descendants = getAllDescendants(moveModalNode.id, treeResult.programsMap.values());
    descendants.forEach((d) => excluded.add(d.id));

    const list: Array<{ program: ProgramRecord; breadcrumbPath: string }> = [];
    for (const prog of treeResult.programsMap.values()) {
      if (excluded.has(prog.id)) continue;
      if (prog.isArchived) continue;
      if (!prog.canContainChildren) continue;
      const crumbs = getProgramBreadcrumbs(prog.id, treeResult.programsMap);
      list.push({
        program: prog,
        breadcrumbPath: crumbs.map((c) => c.title).join(' › '),
      });
    }
    return list.sort((a, b) => a.breadcrumbPath.localeCompare(b.breadcrumbPath));
  }, [moveModalNode, treeResult.programsMap]);

  // Recursive Tree Node Renderer (supports unlimited depth)
  const renderTreeNode = (node: ProgramTreeNode, siblingIndex: number, siblingCount: number) => {
    const p = node.program;
    const isExpanded = expandedIds.has(p.id) || Boolean(searchTerm.trim());
    const hasChildren = node.children.length > 0;
    const isDragOver = dragOverTargetId === p.id;
    const enrolledCount = activeEnrollmentsCountByProgram[p.id] || 0;

    const getNodeBadge = () => {
      if (p.isPrimaryRoot) {
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-brand-red text-white">
            <FolderTree size={11} /> Primary Root
          </span>
        );
      }
      if (p.nodeType === 'CONTAINER') {
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            <Layers size={11} /> Container Folder
          </span>
        );
      }
      if (p.nodeType === 'HYBRID') {
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-indigo-100 text-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
            <GitBranch size={11} /> Hybrid (Enrollable + Parent)
          </span>
        );
      }
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
          <BookOpen size={11} /> Enrollable Unit
        </span>
      );
    };

    return (
      <div key={p.id} className="select-none">
        <div
          draggable
          onDragStart={(e) => {
            e.stopPropagation();
            setDraggedNodeId(p.id);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (draggedNodeId && draggedNodeId !== p.id && p.canContainChildren) {
              setDragOverTargetId(p.id);
            }
          }}
          onDragLeave={(e) => {
            e.stopPropagation();
            if (dragOverTargetId === p.id) setDragOverTargetId(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleDropOnNode(p);
          }}
          className={`group flex flex-wrap items-center justify-between gap-3 py-3 px-4 border-b border-slate-100 dark:border-slate-800/80 transition-colors ${
            isDragOver
              ? 'bg-indigo-50 dark:bg-indigo-950/40 ring-2 ring-indigo-500'
              : p.isPrimaryRoot
              ? 'bg-slate-50/90 dark:bg-slate-800/60 hover:bg-slate-100/80 dark:hover:bg-slate-800'
              : 'bg-white dark:bg-slate-900 hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
          }`}
          style={{ paddingLeft: `${Math.min(node.depth, 12) * 24 + 16}px` }}
        >
          {/* Left: Expand toggle, Folder/Unit Icon, Title, Breadcrumb & Badges */}
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <button
              type="button"
              onClick={() => toggleExpand(p.id)}
              className={`mt-0.5 p-1 rounded-md transition-colors ${
                hasChildren
                  ? 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700'
                  : 'text-slate-300 dark:text-slate-700 cursor-default'
              }`}
              title={hasChildren ? (isExpanded ? 'Collapse branch' : 'Expand branch') : 'Leaf node'}
            >
              {hasChildren ? (
                isExpanded ? (
                  <ChevronDown size={16} />
                ) : (
                  <ChevronRight size={16} />
                )
              ) : (
                <span className="inline-block w-4 h-4 text-center text-[10px] leading-4">•</span>
              )}
            </button>

            <div className="mt-0.5 shrink-0">
              {hasChildren || p.nodeType === 'CONTAINER' || p.isPrimaryRoot ? (
                isExpanded ? (
                  <FolderOpen
                    size={18}
                    className={
                      p.isPrimaryRoot
                        ? 'text-brand-red'
                        : p.nodeType === 'CONTAINER'
                        ? 'text-amber-500'
                        : 'text-indigo-500'
                    }
                  />
                ) : (
                  <Folder
                    size={18}
                    className={
                      p.isPrimaryRoot
                        ? 'text-brand-red'
                        : p.nodeType === 'CONTAINER'
                        ? 'text-amber-500'
                        : 'text-indigo-500'
                    }
                  />
                )
              ) : (
                <BookOpen size={17} className="text-emerald-600 dark:text-emerald-400" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-sm text-slate-900 dark:text-white truncate">
                  {p.title}
                </span>
                {getNodeBadge()}
                {!p.isRequired && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    Optional Unit
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleTogglePublish(p)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-colors ${
                    p.isPublished
                      ? 'bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-300 hover:bg-green-200'
                      : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 hover:bg-amber-200'
                  }`}
                  title="Click to toggle Published / Draft status"
                >
                  {p.isPublished ? 'Published' : 'Draft'}
                </button>
                {node.directChildCount > 0 && (
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    ({node.directChildCount} sub-programme{node.directChildCount === 1 ? '' : 's'}
                    {node.totalDescendantCount > node.directChildCount
                      ? `, ${node.totalDescendantCount} total nested`
                      : ''}
                    )
                  </span>
                )}
                {enrolledCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                    <Users size={10} /> {enrolledCount} enrolled
                  </span>
                )}
              </div>

              {/* Breadcrumb path & pricing metadata */}
              <div className="flex flex-wrap items-center gap-3 mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                <span className="font-mono text-[10px] text-slate-400">Depth {node.depth}</span>
                {node.depth > 0 && (
                  <span className="truncate max-w-md" title={node.breadcrumbPath}>
                    Path: {node.breadcrumbPath}
                  </span>
                )}
                {p.isEnrollable && (
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Group: ₦{(p.publicGroupPricing?.amount ?? p.price ?? 0).toLocaleString()}
                    {p.privateMentorshipPricing?.amount
                      ? ` · 1-on-1: ₦${p.privateMentorshipPricing.amount.toLocaleString()}`
                      : ''}
                  </span>
                )}
                {p.prerequisiteProgramIds && p.prerequisiteProgramIds.length > 0 && (
                  <span className="text-amber-700 dark:text-amber-400 font-medium">
                    Prerequisites:{' '}
                    {p.prerequisiteProgramIds
                      .map((id) => treeResult.programsMap.get(id)?.title || id)
                      .join(', ')}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right: Hierarchy Operations */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Sibling Reorder Up/Down */}
            <button
              type="button"
              disabled={siblingIndex === 0}
              onClick={() => handleMoveSiblingOrder(p, 'UP')}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-25"
              title="Move up among siblings"
            >
              <ArrowUp size={14} />
            </button>
            <button
              type="button"
              disabled={siblingIndex >= siblingCount - 1}
              onClick={() => handleMoveSiblingOrder(p, 'DOWN')}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-25"
              title="Move down among siblings"
            >
              <ArrowDown size={14} />
            </button>

            {/* Add Nested Sub-Programme beneath this node */}
            {p.canContainChildren && (
              <button
                type="button"
                onClick={() => {
                  setQuickAddParent(p);
                  setQuickAddTitle('');
                  setQuickAddShortDesc('');
                  setQuickAddNodeType('ENROLLABLE');
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-300 transition-colors"
                title={`Add a sub-programme inside "${p.title}"`}
              >
                <Plus size={13} />
                <span className="hidden sm:inline">Sub-Programme</span>
              </button>
            )}

            {/* Move Branch to another Parent */}
            <button
              type="button"
              onClick={() => {
                setMoveModalNode(p);
                setTargetParentIdForMove(p.parentProgramId || '__ROOT__');
              }}
              className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-800 transition-colors"
              title="Move programme or branch to another parent"
            >
              <Move size={15} />
            </button>

            {/* Quick Rename */}
            <button
              type="button"
              onClick={() => {
                setRenameNode(p);
                setRenameValue(p.title);
              }}
              className="px-2 py-1 rounded-lg text-[11px] font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              title="Quick rename programme"
            >
              Rename
            </button>

            {/* Full Edit Form */}
            <Link
              to={`/admin/programs/edit/${p.id}`}
              className="p-1.5 rounded-lg text-slate-500 hover:text-brand-red hover:bg-red-50 dark:hover:bg-slate-800 transition-colors"
              title="Open full programme configuration"
            >
              <Edit2 size={15} />
            </Link>

            {/* Safe Archive */}
            <button
              type="button"
              onClick={() => setArchiveConfirmNode(p)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-slate-800 transition-colors"
              title={p.isArchived ? 'Restore programme' : 'Archive programme safely'}
            >
              {p.isArchived ? <RotateCcw size={15} /> : <Archive size={15} />}
            </button>
          </div>
        </div>

        {/* Render Children Recursively */}
        {hasChildren && isExpanded && (
          <div className="border-l border-slate-200/70 dark:border-slate-800 ml-4">
            {node.children.map((child, idx) =>
              renderTreeNode(child, idx, node.children.length)
            )}
          </div>
        )}
      </div>
    );
  };

  const pendingProposalsCount = proposals.filter((p) => p.status === 'PENDING').length;
  const unassignedCount = treeResult.unassigned.length;
  const migrationUpdatesCount =
    migrationReport?.items.filter((i) => i.action !== 'NO_CHANGE_NEEDED').length || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <FolderTree className="text-brand-red" size={26} />
            <span>Recursive Programme Hierarchy &amp; Learning Ecosystem</span>
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Organise root programmes, structural folders, and unlimited-depth nested sub-programmes without losing existing records.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {activeTab === 'programs' ? (
            <>
              <button
                type="button"
                onClick={() => setSubViewMode('MIGRATION')}
                className="flex items-center gap-2 bg-amber-50 text-amber-900 border border-amber-200 px-3.5 py-2.5 rounded-xl text-xs font-bold hover:bg-amber-100 transition-colors"
              >
                <ShieldCheck className="w-4 h-4 text-amber-600" />
                <span>Hierarchy Migration &amp; Backup</span>
                {migrationUpdatesCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-amber-600 text-white text-[10px]">
                    {migrationUpdatesCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setQuickAddParent('ROOT');
                  setQuickAddTitle('');
                  setQuickAddShortDesc('');
                  setQuickAddNodeType('HYBRID');
                }}
                className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2.5 rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Quick Add Root / Branch</span>
              </button>
              <Link
                to="/admin/programs/new"
                className="flex items-center gap-2 bg-brand-red text-white px-4 py-2.5 rounded-xl text-xs font-bold hover:bg-red-700 transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Full Programme Creator</span>
              </Link>
            </>
          ) : activeTab === 'services' ? (
            <>
              <button
                onClick={handleSyncServices}
                disabled={syncing}
                className="flex items-center gap-2 bg-indigo-50 text-indigo-700 border border-indigo-200 px-4 py-2.5 rounded-xl text-xs font-bold hover:bg-indigo-100 transition-colors disabled:opacity-50"
              >
                <Sparkles className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                <span>{syncing ? 'Syncing Services...' : 'Sync Website Services'}</span>
              </button>
              <Link
                to="/admin/services/new"
                className="flex items-center gap-2 bg-brand-red text-white px-4 py-2.5 rounded-xl text-xs font-bold hover:bg-red-700 transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Add New Service</span>
              </Link>
            </>
          ) : null}
        </div>
      </div>

      {/* Primary Top Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 dark:border-slate-800 pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveTab('programs')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'programs'
                ? 'bg-slate-900 text-white dark:bg-brand-red shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            <FolderTree className="w-4 h-4" />
            <span>Programme Hierarchy ({normalizedPrograms.filter((p) => !p.isArchived).length})</span>
          </button>
          <button
            onClick={() => setActiveTab('tutor_subjects')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'tutor_subjects'
                ? 'bg-slate-900 text-white dark:bg-brand-red shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            <span>Assigned Tutor Subjects</span>
          </button>
          <button
            onClick={() => setActiveTab('services')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'services'
                ? 'bg-slate-900 text-white dark:bg-brand-red shadow-sm'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            <span>Public Website Services ({services.length})</span>
          </button>
        </div>
      </div>

      {toastMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between gap-3 text-sm font-semibold">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-xs font-bold text-emerald-700 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {activeTab === 'tutor_subjects' ? (
        <AdminTutorSubjects />
      ) : activeTab === 'services' ? (
        /* SERVICES TAB */
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 overflow-hidden">
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {services.map((service) => (
              <div
                key={service.id}
                className="group bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="relative h-44 bg-slate-100 overflow-hidden">
                    {service.featuredImage || service.image ? (
                      <img
                        src={service.featuredImage || service.image}
                        alt={service.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-slate-800 text-white font-bold">
                        {service.title}
                      </div>
                    )}
                  </div>
                  <div className="p-5 space-y-2">
                    <h3 className="font-black text-gray-900 dark:text-white text-base">
                      {service.title}
                    </h3>
                    <p className="text-xs text-gray-500 line-clamp-2">
                      {service.shortDescription || service.description}
                    </p>
                  </div>
                </div>
                <div className="px-5 py-3.5 bg-gray-50 dark:bg-slate-800/60 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-600">
                    {service.pricing || 'Custom Quote'}
                  </span>
                  <div className="flex items-center gap-1">
                    <Link
                      to={`/admin/services/edit/${service.id}`}
                      className="p-1.5 text-gray-500 hover:text-brand-red rounded-lg"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Link>
                    <button
                      onClick={() => handleDeleteService(service.id, service.title)}
                      className="p-1.5 text-gray-500 hover:text-red-600 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* PROGRAMMES HIERARCHY MANAGEMENT SYSTEM */
        <div className="space-y-4">
          {/* 4 Primary Programme Roots Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {PRIMARY_PROGRAM_ROOTS.map((rootDef) => {
              const matchingRoot = treeResult.roots.find(
                (r) =>
                  r.program.primaryRootKey === rootDef.key ||
                  r.program.id === rootDef.canonicalId ||
                  r.program.title.toLowerCase() === rootDef.title.toLowerCase()
              );
              const isSelected =
                selectedRootFilter === (matchingRoot?.program.id || rootDef.key);
              return (
                <div
                  key={rootDef.key}
                  onClick={() => {
                    setSubViewMode('TREE');
                    if (isSelected) {
                      setSelectedRootFilter('ALL');
                    } else if (matchingRoot) {
                      setSelectedRootFilter(matchingRoot.program.id);
                    }
                  }}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'border-brand-red bg-red-50/40 dark:bg-red-950/20 ring-2 ring-brand-red/20'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-brand-red">
                      Primary Root #{rootDef.sortOrder}
                    </span>
                    {matchingRoot ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                        {matchingRoot.totalDescendantCount} nested units
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                        Ready to Initialize
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    {rootDef.title}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                    {rootDef.shortDescription}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Sub-Navigation & Filter Bar */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-4 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Sub-view mode switcher */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSubViewMode('TREE')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                    subViewMode === 'TREE'
                      ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  <FolderTree size={14} />
                  <span>Hierarchy Explorer ({treeResult.roots.length} Roots)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSubViewMode('UNASSIGNED')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                    subViewMode === 'UNASSIGNED'
                      ? 'bg-amber-600 text-white'
                      : 'bg-amber-50 text-amber-900 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300'
                  }`}
                >
                  <AlertTriangle size={14} />
                  <span>Unassigned Programmes ({unassignedCount})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSubViewMode('PROPOSALS')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                    subViewMode === 'PROPOSALS'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-indigo-50 text-indigo-900 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300'
                  }`}
                >
                  <FileCheck2 size={14} />
                  <span>Tutor Proposals ({proposals.length})</span>
                  {pendingProposalsCount > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-brand-red text-white text-[10px]">
                      {pendingProposalsCount} new
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setSubViewMode('MIGRATION')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                    subViewMode === 'MIGRATION'
                      ? 'bg-emerald-700 text-white'
                      : 'bg-emerald-50 text-emerald-900 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300'
                  }`}
                >
                  <ShieldCheck size={14} />
                  <span>Migration Preview &amp; Backup</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSubViewMode('ARCHIVED')}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                    subViewMode === 'ARCHIVED'
                      ? 'bg-slate-700 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  <Archive size={14} />
                  <span>Archived ({treeResult.archived.length})</span>
                </button>
              </div>

              {/* Search & Expand/Collapse Controls */}
              {subViewMode === 'TREE' && (
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative w-64">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search programme or path..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 border border-gray-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl text-xs focus:ring-2 focus:ring-brand-red"
                    />
                  </div>
                  <select
                    value={nodeTypeFilter}
                    onChange={(e) => setNodeTypeFilter(e.target.value as any)}
                    className="px-2.5 py-1.5 border border-gray-300 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-xl text-xs font-semibold"
                  >
                    <option value="ALL">All Node Types</option>
                    <option value="CONTAINER">Structural Containers</option>
                    <option value="ENROLLABLE">Enrollable Units</option>
                    <option value="HYBRID">Hybrid Programmes</option>
                  </select>
                  <button
                    type="button"
                    onClick={expandAll}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                  >
                    Expand All
                  </button>
                  <button
                    type="button"
                    onClick={collapseAll}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                  >
                    Collapse All
                  </button>
                </div>
              )}
            </div>

            {/* Circular / Integrity Warning if any detected */}
            {(treeResult.circularIds.length > 0 || treeResult.invalidParentIds.length > 0) && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between">
                <span>
                  Hierarchy Integrity Notice: {treeResult.circularIds.length} circular reference(s) and{' '}
                  {treeResult.invalidParentIds.length} detached parent link(s) were safely isolated in the Unassigned Programmes queue.
                </span>
                <button
                  type="button"
                  onClick={() => setSubViewMode('UNASSIGNED')}
                  className="font-bold underline"
                >
                  Review Unassigned Queue
                </button>
              </div>
            )}
          </div>

          {/* MAIN CONTENT AREA BY SUB-VIEW MODE */}
          {loading ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-500 text-sm">
              Loading recursive programme hierarchy...
            </div>
          ) : subViewMode === 'TREE' ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
              <div className="px-4 py-3 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 font-bold">
                  <FolderTree size={15} className="text-brand-red" />
                  <span>
                    Recursive Folder &amp; Sub-Programme Explorer (Drag any row onto another folder, or click Move / + Sub-Programme)
                  </span>
                </div>
                {selectedRootFilter !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => setSelectedRootFilter('ALL')}
                    className="text-xs font-bold text-amber-300 hover:underline"
                  >
                    Clear Root Filter (Show All Roots)
                  </button>
                )}
              </div>

              {displayedTreeRoots.length === 0 ? (
                <div className="p-12 text-center space-y-3">
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                    No hierarchy branches match your current filter, or the 4 Primary Roots have not been initialized yet.
                  </p>
                  <p className="text-xs text-slate-500 max-w-lg mx-auto">
                    Open the Migration Preview &amp; Backup tab to initialize the 4 Primary Programme Roots (Smart Techies, Digital Literacy, Graphic Design, Music) and safely map existing records.
                  </p>
                  <button
                    type="button"
                    onClick={() => setSubViewMode('MIGRATION')}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-red text-white text-xs font-bold"
                  >
                    <ShieldCheck size={15} />
                    <span>Open Safe Hierarchy Migration Preview</span>
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {displayedTreeRoots.map((rootNode, idx) =>
                    renderTreeNode(rootNode, idx, displayedTreeRoots.length)
                  )}
                </div>
              )}
            </div>
          ) : subViewMode === 'UNASSIGNED' ? (
            /* UNASSIGNED LEGACY PROGRAMMES REVIEW QUEUE */
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-amber-200 dark:border-amber-900/50 overflow-hidden shadow-xs">
              <div className="p-5 bg-amber-50/70 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900/50">
                <h3 className="text-sm font-black text-amber-950 dark:text-amber-200 uppercase tracking-wider flex items-center gap-2">
                  <AlertTriangle size={16} className="text-amber-600" />
                  <span>Unassigned Programmes Review Area ({treeResult.unassigned.length})</span>
                </h3>
                <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
                  These existing or legacy programmes do not yet have a confirmed parent branch. Per safety rules, uncertain programmes are never guessed automatically — click &quot;Assign to Parent Branch&quot; to place each programme under its exact root or sub-programme while keeping its original Document ID intact.
                </p>
              </div>

              {treeResult.unassigned.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500">
                  All active programmes are cleanly assigned to a root or parent branch.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {treeResult.unassigned.map((node) => {
                    const p = node.program;
                    return (
                      <div
                        key={p.id}
                        className="p-4 flex flex-wrap items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-slate-900 dark:text-white">
                              {p.title}
                            </span>
                            <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">
                              ID: {p.id}
                            </span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900">
                              {p.categoryId || 'Uncategorized'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500">
                            {p.shortDescription || 'No description'}
                            {p.seriesName ? ` · Legacy Series: ${p.seriesName}` : ''}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setMoveModalNode(p);
                              setTargetParentIdForMove('');
                            }}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-brand-red transition-colors"
                          >
                            <Move size={14} />
                            <span>Assign to Parent Branch...</span>
                          </button>
                          <Link
                            to={`/admin/programs/edit/${p.id}`}
                            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300"
                          >
                            Edit Details
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : subViewMode === 'PROPOSALS' ? (
            /* TUTOR PROGRAMME PROPOSALS QUEUE */
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
              <div className="p-5 bg-indigo-50/60 dark:bg-indigo-950/30 border-b border-indigo-100 dark:border-indigo-900/50">
                <h3 className="text-sm font-black text-indigo-950 dark:text-indigo-200 uppercase tracking-wider flex items-center gap-2">
                  <FileCheck2 size={16} className="text-indigo-600" />
                  <span>Tutor Sub-Programme &amp; Curriculum Proposals ({proposals.length})</span>
                </h3>
                <p className="text-xs text-indigo-800 dark:text-indigo-300 mt-1">
                  Tutors can propose new nested sub-programmes beneath existing branches. Only administrators can approve proposals, set official Public Group &amp; Private 1-on-1 prices, and publish them into the catalogue.
                </p>
              </div>

              {proposals.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500">
                  No tutor programme proposals have been submitted yet.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {proposals.map((prop) => (
                    <div
                      key={prop.id}
                      className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-black text-base text-slate-900 dark:text-white">
                            {prop.title}
                          </span>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                              prop.status === 'APPROVED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : prop.status === 'REJECTED'
                                ? 'bg-red-100 text-red-800'
                                : prop.status === 'CHANGES_REQUESTED'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-indigo-100 text-indigo-800'
                            }`}
                          >
                            {prop.status}
                          </span>
                          <span className="text-xs text-slate-500">
                            Proposed by <strong>{prop.proposedByName}</strong> ({prop.proposedByEmail})
                          </span>
                        </div>
                        <div className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                          Target Parent Path: {prop.parentBreadcrumbPath} › {prop.title}
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          {prop.description}
                        </p>
                        {prop.curriculum.length > 0 && (
                          <div className="text-[11px] text-slate-500">
                            <strong>Modules ({prop.curriculum.length}):</strong>{' '}
                            {prop.curriculum.slice(0, 5).join(' · ')}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setReviewingProposal(prop);
                            setProposalReviewNotes(prop.adminReviewNotes || '');
                            setProposalPublicPrice(35000);
                            setProposalPrivatePrice(60000);
                          }}
                          className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-brand-red transition-colors"
                        >
                          Review &amp; Decide
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : subViewMode === 'MIGRATION' ? (
            /* SAFE HIERARCHY MIGRATION PREVIEW & BACKUP CENTER */
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs space-y-6 p-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <ShieldCheck className="text-emerald-600" size={20} />
                    <span>Safe Non-Destructive Programme Hierarchy Migration</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Preview how existing programme records map to the 4 Primary Programme Roots. Original Document IDs are 100% preserved. Uncertain records are never guessed — they are placed in Unassigned Review for manual placement.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleDownloadBackupJson}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50"
                  >
                    <Download size={15} />
                    <span>1. Export JSON Backup ({rawPrograms.length} docs)</span>
                  </button>

                  <button
                    type="button"
                    disabled={executingMigration}
                    onClick={handleExecuteMigration}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 shadow-sm"
                  >
                    <ShieldCheck size={15} />
                    <span>
                      {executingMigration
                        ? 'Executing Safe Migration...'
                        : `2. Run Authorised Migration (${selectedMigrationProgramIds.size} selected + 4 Roots)`}
                    </span>
                  </button>
                </div>
              </div>

              {migrationReport && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                      <div className="text-[11px] font-bold text-slate-500 uppercase">
                        Total Existing Docs
                      </div>
                      <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                        {migrationReport.totalExistingPrograms}
                      </div>
                      <div className="text-[11px] text-emerald-600 font-semibold mt-0.5">
                        Zero documents will be deleted
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50">
                      <div className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 uppercase">
                        High-Confidence Matches
                      </div>
                      <div className="text-2xl font-black text-emerald-900 dark:text-emerald-200 mt-1">
                        {migrationReport.highConfidenceMatches}
                      </div>
                      <div className="text-[11px] text-emerald-700 mt-0.5">
                        Explicit series / primary root match
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50">
                      <div className="text-[11px] font-bold text-amber-800 dark:text-amber-300 uppercase">
                        Uncertain → Unassigned Queue
                      </div>
                      <div className="text-2xl font-black text-amber-900 dark:text-amber-200 mt-1">
                        {migrationReport.unassignedForReviewCount}
                      </div>
                      <div className="text-[11px] text-amber-700 mt-0.5">
                        Held for manual admin placement
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/50">
                      <div className="text-[11px] font-bold text-indigo-800 dark:text-indigo-300 uppercase">
                        Already Configured
                      </div>
                      <div className="text-2xl font-black text-indigo-900 dark:text-indigo-200 mt-1">
                        {migrationReport.alreadyConfiguredCount}
                      </div>
                      <div className="text-[11px] text-indigo-700 mt-0.5">
                        Already have valid hierarchy links
                      </div>
                    </div>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold">
                          <th className="p-3 w-10">Apply</th>
                          <th className="p-3">Existing Programme (ID Preserved)</th>
                          <th className="p-3">Confidence</th>
                          <th className="p-3">Proposed Action &amp; Target Parent</th>
                          <th className="p-3">Audit Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {migrationReport.items.map((item) => {
                          const checked = selectedMigrationProgramIds.has(item.programId);
                          return (
                            <tr key={item.programId} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                              <td className="p-3">
                                <input
                                  type="checkbox"
                                  disabled={item.action === 'NO_CHANGE_NEEDED'}
                                  checked={checked}
                                  onChange={() => {
                                    setSelectedMigrationProgramIds((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(item.programId)) next.delete(item.programId);
                                      else next.add(item.programId);
                                      return next;
                                    });
                                  }}
                                  className="rounded border-gray-300 text-brand-red"
                                />
                              </td>
                              <td className="p-3">
                                <div className="font-bold text-slate-900 dark:text-white">
                                  {item.title}
                                </div>
                                <div className="font-mono text-[10px] text-slate-400">
                                  ID: {item.programId}
                                </div>
                              </td>
                              <td className="p-3">
                                <span
                                  className={`px-2 py-0.5 rounded font-bold text-[10px] uppercase ${
                                    item.confidence === 'HIGH'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  {item.confidence}
                                </span>
                              </td>
                              <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">
                                {item.action === 'NO_CHANGE_NEEDED'
                                  ? 'Already Configured'
                                  : item.action === 'PROMOTE_TO_PRIMARY_ROOT'
                                  ? 'Mark as Primary Programme Root'
                                  : item.action === 'ASSIGN_TO_ROOT'
                                  ? `Link under ${item.proposedParentTitle}`
                                  : 'Place in Unassigned Review Queue'}
                              </td>
                              <td className="p-3 text-slate-500">{item.reason}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          ) : (
            /* ARCHIVED PROGRAMMES VIEW */
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
              <div className="p-4 bg-slate-100 dark:bg-slate-800 font-bold text-xs text-slate-700 dark:text-slate-300">
                Archived Programmes (Hidden from new public enrolments; historical student progress &amp; records remain preserved)
              </div>
              {treeResult.archived.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500">
                  No archived programmes.
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {treeResult.archived.map((node) => (
                    <div
                      key={node.program.id}
                      className="p-4 flex items-center justify-between gap-4"
                    >
                      <div>
                        <div className="font-bold text-sm text-slate-800 dark:text-slate-200">
                          {node.program.title}
                        </div>
                        <div className="text-xs text-slate-500">
                          ID: {node.program.id} · Path: {node.breadcrumbPath}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setArchiveConfirmNode(node.program)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold"
                      >
                        <RotateCcw size={13} />
                        <span>Restore Programme</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: MOVE PROGRAMME OR BRANCH WITH LIVE HIERARCHY PREVIEW */}
      {moveModalNode && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-xl w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Move size={18} className="text-brand-red" />
                  <span>Move Programme / Branch in Hierarchy</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Moving <strong>{moveModalNode.title}</strong> preserves its Document ID ({moveModalNode.id}) and automatically updates all nested descendants.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMoveModalNode(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Select Destination Parent Programme (or Top-Level Root)
              </label>
              <select
                value={targetParentIdForMove}
                onChange={(e) => setTargetParentIdForMove(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-medium bg-white dark:bg-slate-800 dark:text-white"
              >
                <option value="__ROOT__">— Top-Level Root Programme (No Parent) —</option>
                {eligibleTargetParentsForMove.map((opt) => (
                  <option key={opt.program.id} value={opt.program.id}>
                    {opt.breadcrumbPath} ({opt.program.nodeType})
                  </option>
                ))}
              </select>
            </div>

            {movePreview && (
              <div
                className={`p-4 rounded-xl border text-xs space-y-2 ${
                  movePreview.isValid
                    ? 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700'
                    : 'bg-red-50 border-red-200 text-red-700'
                }`}
              >
                {!movePreview.isValid ? (
                  <div className="font-bold flex items-center gap-2">
                    <AlertTriangle size={15} />
                    <span>{movePreview.error}</span>
                  </div>
                ) : (
                  <>
                    <div className="font-bold text-slate-900 dark:text-white">
                      Hierarchy Move Preview ({movePreview.affectedNodeIds.length} programme node(s) will be updated):
                    </div>
                    <div className="text-slate-600 dark:text-slate-300">
                      <span className="text-slate-400">From:</span> {movePreview.oldBreadcrumbPath}
                    </div>
                    <div className="text-emerald-700 dark:text-emerald-400 font-bold">
                      <span>To:</span> {movePreview.newBreadcrumbPath}
                    </div>
                    {movePreview.descendantUpdates.length > 1 && (
                      <div className="pt-2 border-t border-slate-200 dark:border-slate-700 max-h-32 overflow-y-auto space-y-1">
                        <div className="text-[11px] font-bold text-slate-500">
                          Nested Descendants Moving Along With Branch:
                        </div>
                        {movePreview.descendantUpdates.slice(1).map((d) => (
                          <div key={d.id} className="text-[11px] text-slate-600 dark:text-slate-400">
                            • {d.title} → Depth {d.newAncestorIds.length}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setMoveModalNode(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!movePreview?.isValid || movingBranch}
                onClick={handleConfirmMoveBranch}
                className="px-5 py-2 rounded-xl bg-brand-red text-white text-xs font-bold hover:bg-red-700 disabled:opacity-40"
              >
                {movingBranch ? 'Moving Branch...' : 'Confirm Hierarchy Move'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: QUICK ADD ROOT OR NESTED SUB-PROGRAMME */}
      {quickAddParent !== null && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleQuickAddSubmit}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Plus size={18} className="text-brand-red" />
                  <span>
                    {quickAddParent === 'ROOT'
                      ? 'Create Top-Level Root Programme'
                      : `Add Nested Sub-Programme under "${quickAddParent.title}"`}
                  </span>
                </h3>
                {quickAddParent !== 'ROOT' && (
                  <p className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold mt-0.5">
                    Parent Path:{' '}
                    {getProgramBreadcrumbs(quickAddParent.id, treeResult.programsMap)
                      .map((b) => b.title)
                      .join(' › ')}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setQuickAddParent(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Programme / Sub-Programme Title *
              </label>
              <input
                type="text"
                required
                value={quickAddTitle}
                onChange={(e) => setQuickAddTitle(e.target.value)}
                placeholder="e.g. Web Development, HTML, CSS, Piano, CorelDraw"
                className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-sm dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Structural Node Behaviour
              </label>
              <select
                value={quickAddNodeType}
                onChange={(e) => setQuickAddNodeType(e.target.value as ProgramNodeType)}
                className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 dark:text-white"
              >
                <option value="ENROLLABLE">
                  Enrollable Programme (Leaf / Learning Unit — can also contain deeper sub-programmes later)
                </option>
                <option value="HYBRID">
                  Hybrid Programme (Both Enrollable as a Package AND a Parent Container)
                </option>
                <option value="CONTAINER">
                  Structural Container Only (Folder for grouping child programmes; not directly enrollable)
                </option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Short Description / Learning Outcome
              </label>
              <input
                type="text"
                value={quickAddShortDesc}
                onChange={(e) => setQuickAddShortDesc(e.target.value)}
                placeholder="Brief summary of what learners master in this unit..."
                className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs dark:bg-slate-800 dark:text-white"
              />
            </div>

            {quickAddNodeType !== 'CONTAINER' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Public Group Fee (₦)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={quickAddPublicPrice}
                    onChange={(e) => setQuickAddPublicPrice(Number(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Private 1-on-1 Fee (₦)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={quickAddPrivatePrice}
                    onChange={(e) => setQuickAddPrivatePrice(Number(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>
            )}

            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={quickAddIsRequired}
                onChange={(e) => setQuickAddIsRequired(e.target.checked)}
                className="rounded border-gray-300 text-brand-red"
              />
              <span>Required unit when a student enrols in the parent branch</span>
            </label>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  const pId = quickAddParent !== 'ROOT' ? quickAddParent.id : '';
                  setQuickAddParent(null);
                  navigate(
                    `/admin/programs/new${pId ? `?parentId=${encodeURIComponent(pId)}` : ''}`
                  );
                }}
                className="text-xs font-bold text-indigo-600 hover:underline"
              >
                Open Full Editor Instead →
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQuickAddParent(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={quickAddSaving}
                  className="px-5 py-2 rounded-xl bg-brand-red text-white text-xs font-bold hover:bg-red-700 disabled:opacity-50"
                >
                  {quickAddSaving ? 'Creating...' : 'Create Programme'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 3: QUICK RENAME */}
      {renameNode && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleQuickRenameSubmit}
            className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 space-y-4 shadow-2xl"
          >
            <h3 className="text-sm font-black text-slate-900 dark:text-white">
              Rename Programme (Preserves Document ID: {renameNode.id})
            </h3>
            <input
              type="text"
              required
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-sm dark:bg-slate-800 dark:text-white"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRenameNode(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={renamingSaving}
                className="px-4 py-2 rounded-xl bg-brand-red text-white text-xs font-bold"
              >
                {renamingSaving ? 'Saving...' : 'Save Name'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL 4: SAFE ARCHIVE / RESTORE CONFIRMATION */}
      {archiveConfirmNode && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5 text-amber-600">
              <AlertTriangle size={22} />
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                {archiveConfirmNode.isArchived
                  ? `Restore "${archiveConfirmNode.title}"?`
                  : `Safely Archive "${archiveConfirmNode.title}"?`}
              </h3>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {archiveConfirmNode.isArchived ? (
                'Restoring this programme will make it active and selectable again in the hierarchy explorer and enrolment selectors.'
              ) : (
                <>
                  Archiving hides <strong>{archiveConfirmNode.title}</strong> from new public enrolments while keeping its Document ID (<code>{archiveConfirmNode.id}</code>),{' '}
                  <strong>
                    {getAllDescendants(archiveConfirmNode.id, treeResult.programsMap.values()).length}
                  </strong>{' '}
                  nested descendant(s), and{' '}
                  <strong>{activeEnrollmentsCountByProgram[archiveConfirmNode.id] || 0}</strong>{' '}
                  existing student enrolment record(s) completely intact.
                </>
              )}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setArchiveConfirmNode(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={archivingSaving}
                onClick={handleConfirmArchiveToggle}
                className="px-5 py-2 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700"
              >
                {archivingSaving
                  ? 'Updating...'
                  : archiveConfirmNode.isArchived
                  ? 'Restore Programme'
                  : 'Archive Safely'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: TUTOR PROPOSAL ADMIN REVIEW & APPROVAL */}
      {reviewingProposal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  Review Tutor Sub-Programme Proposal
                </h3>
                <p className="text-xs text-slate-500">
                  Submitted by {reviewingProposal.proposedByName} ({reviewingProposal.proposedByEmail})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReviewingProposal(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800 space-y-1.5 text-xs">
              <div>
                <span className="font-bold text-slate-500">Proposed Title:</span>{' '}
                <span className="font-black text-slate-900 dark:text-white">
                  {reviewingProposal.title}
                </span>
              </div>
              <div>
                <span className="font-bold text-slate-500">Target Hierarchy Path:</span>{' '}
                <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                  {reviewingProposal.parentBreadcrumbPath} › {reviewingProposal.title}
                </span>
              </div>
              <div>
                <span className="font-bold text-slate-500">Description:</span>{' '}
                <span>{reviewingProposal.description}</span>
              </div>
              {reviewingProposal.learningObjectives.length > 0 && (
                <div>
                  <span className="font-bold text-slate-500">Objectives:</span>{' '}
                  <span>{reviewingProposal.learningObjectives.join(' · ')}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Official Public Group Price (₦)
                </label>
                <input
                  type="number"
                  value={proposalPublicPrice}
                  onChange={(e) => setProposalPublicPrice(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Official Private 1-on-1 Price (₦)
                </label>
                <input
                  type="number"
                  value={proposalPrivatePrice}
                  onChange={(e) => setProposalPrivatePrice(Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={proposalPublishImmediately}
                onChange={(e) => setProposalPublishImmediately(e.target.checked)}
                className="rounded border-gray-300 text-brand-red"
              />
              <span>Publish immediately into active programme hierarchy upon approval</span>
            </label>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Admin Review Notes / Feedback for Tutor
              </label>
              <textarea
                rows={2}
                value={proposalReviewNotes}
                onChange={(e) => setProposalReviewNotes(e.target.value)}
                placeholder="Optional feedback or approval notes..."
                className="w-full p-2.5 border border-slate-300 rounded-xl text-xs"
              />
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={savingProposalDecision}
                onClick={() => handleProposalDecision('REJECTED')}
                className="px-3.5 py-2 rounded-xl bg-red-50 text-red-700 text-xs font-bold hover:bg-red-100"
              >
                Reject
              </button>
              <button
                type="button"
                disabled={savingProposalDecision}
                onClick={() => handleProposalDecision('CHANGES_REQUESTED')}
                className="px-3.5 py-2 rounded-xl bg-amber-50 text-amber-800 text-xs font-bold hover:bg-amber-100"
              >
                Request Changes
              </button>
              <button
                type="button"
                disabled={savingProposalDecision}
                onClick={() => handleProposalDecision('APPROVED')}
                className="px-5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700"
              >
                {savingProposalDecision ? 'Processing...' : 'Approve & Create Sub-Programme'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPrograms;
