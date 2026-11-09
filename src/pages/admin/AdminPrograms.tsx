import React, { useState, useEffect, useCallback } from 'react';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { normalizeProgramRecord } from '../../lib/programHierarchy';
import {
  INITIAL_DEMO_PROGRAMS,
  INITIAL_DEMO_PROPOSALS,
  recalculateHierarchyMetadata,
} from '../../components/admin/programs-preview/mockData';
import type {
  PreviewProgramRecord,
  PreviewProposalRecord,
} from '../../components/admin/programs-preview/types';
import { ProgramsCoursesPreviewPage } from './ProgramsCoursesPreviewPage';

function toPreviewProgramRecord(id: string, raw: Record<string, any>): PreviewProgramRecord {
  const base = normalizeProgramRecord(id, raw);
  const deliveryUpper = (raw.deliveryFormat || base.deliveryMode || 'ONLINE')
    .toString()
    .toUpperCase();
  const deliveryFormat: 'ONLINE' | 'PHYSICAL' | 'HYBRID' = deliveryUpper.includes(
    'PHYSICAL'
  )
    ? 'PHYSICAL'
    : deliveryUpper.includes('HYBRID')
    ? 'HYBRID'
    : 'ONLINE';

  const audienceUpper = (raw.targetAudience || 'B2C').toString().toUpperCase();
  const targetAudience: 'B2C' | 'B2B_SCHOOLS' | 'CORPORATE' =
    audienceUpper === 'B2B_SCHOOLS'
      ? 'B2B_SCHOOLS'
      : audienceUpper === 'CORPORATE'
      ? 'CORPORATE'
      : 'B2C';

  return {
    ...base,
    id,
    deliveryFormat,
    targetAudience,
    featuredImage: raw.featuredImage || base.featuredImage || '',
    archivedAt: raw.archivedAt || null,
    archiveReason: raw.archiveReason || '',
    previousStatusBeforeArchive:
      raw.previousStatusBeforeArchive ||
      (base.status === 'DRAFT' ? 'DRAFT' : 'PUBLISHED'),
    unassignedReasonType: raw.unassignedReasonType,
    unassignedReasonDetail: raw.unassignedReasonDetail,
    suggestedParentId: raw.suggestedParentId || null,
    suggestedParentNote: raw.suggestedParentNote || '',
  };
}

function toPreviewProposalRecord(
  id: string,
  raw: Record<string, any>
): PreviewProposalRecord {
  return {
    id,
    title: raw.title || 'Untitled Proposal',
    slug: raw.slug || id,
    description: raw.description || '',
    categoryId: raw.categoryId || 'DIGITAL_AND_TECHNOLOGY',
    parentProgramId: raw.parentProgramId || 'root-technology-programme',
    parentProgramTitle: raw.parentProgramTitle || 'Technology Programme',
    parentBreadcrumbPath: raw.parentBreadcrumbPath || 'Technology Programme',
    rootProgramId: raw.rootProgramId || 'root-technology-programme',
    ancestorIds: Array.isArray(raw.ancestorIds) ? raw.ancestorIds : [],
    proposedNodeType: raw.proposedNodeType || 'ENROLLABLE',
    canContainChildren: Boolean(raw.canContainChildren),
    isEnrollable: raw.isEnrollable !== false,
    isRequired: Boolean(raw.isRequired),
    curriculum: Array.isArray(raw.curriculum) ? raw.curriculum : [],
    learningObjectives: Array.isArray(raw.learningObjectives)
      ? raw.learningObjectives
      : [],
    prerequisiteProgramIds: Array.isArray(raw.prerequisiteProgramIds)
      ? raw.prerequisiteProgramIds
      : [],
    deliveryFormat: raw.deliveryFormat || 'ONLINE',
    targetAudience: raw.targetAudience || 'B2C',
    deliveryOptions: Array.isArray(raw.deliveryOptions)
      ? raw.deliveryOptions
      : ['PUBLIC_GROUP', 'PRIVATE_MENTORSHIP'],
    duration: raw.duration || '8 Weeks',
    sessionsPerWeek: Number(raw.sessionsPerWeek) || 2,
    sessionDuration: raw.sessionDuration || '60 mins',
    submittedPublicGroupPrice: Number(raw.submittedPublicGroupPrice || raw.price || 35000),
    submittedPrivateMentorshipPrice: Number(
      raw.submittedPrivateMentorshipPrice || 60000
    ),
    proposedByUid: raw.proposedByUid || raw.tutorUid || '',
    proposedByName: raw.proposedByName || raw.tutorName || 'Tutor',
    proposedByEmail: raw.proposedByEmail || raw.tutorEmail || '',
    tutorUid: raw.tutorUid || raw.proposedByUid || '',
    tutorName: raw.tutorName || raw.proposedByName || 'Tutor',
    tutorEmail: raw.tutorEmail || raw.proposedByEmail || '',
    status: raw.status || 'PENDING',
    submittedAt: raw.submittedAt || raw.createdAt || new Date().toISOString(),
    adminReviewNotes: raw.adminReviewNotes || '',
    reviewedByName: raw.reviewedByName,
    reviewedAt: raw.reviewedAt,
    reviewHistory: Array.isArray(raw.reviewHistory) ? raw.reviewHistory : [],
  };
}

export const AdminPrograms: React.FC = () => {
  const [livePrograms, setLivePrograms] = useState<PreviewProgramRecord[] | null>(
    null
  );
  const [liveProposals, setLiveProposals] = useState<PreviewProposalRecord[] | null>(
    null
  );

  useEffect(() => {
    const unsubPrograms = onSnapshot(
      collection(db, 'programs'),
      (snap) => {
        if (snap.empty) {
          setLivePrograms(INITIAL_DEMO_PROGRAMS);
          return;
        }
        const docs = snap.docs.map((d) =>
          toPreviewProgramRecord(d.id, d.data() as Record<string, any>)
        );
        // Merge canonical roots if missing so hierarchy always has the 4 primary roots
        const existingIds = new Set(docs.map((d) => d.id));
        const merged = [
          ...INITIAL_DEMO_PROGRAMS.filter(
            (demo) => demo.isPrimaryRoot && !existingIds.has(demo.id)
          ),
          ...docs,
        ];
        setLivePrograms(recalculateHierarchyMetadata(merged));
      },
      () => {
        setLivePrograms(INITIAL_DEMO_PROGRAMS);
      }
    );

    const unsubProposals = onSnapshot(
      collection(db, 'tutor_program_proposals'),
      (snap) => {
        if (snap.empty) {
          setLiveProposals(INITIAL_DEMO_PROPOSALS);
          return;
        }
        const docs = snap.docs.map((d) =>
          toPreviewProposalRecord(d.id, d.data() as Record<string, any>)
        );
        setLiveProposals(docs);
      },
      () => {
        setLiveProposals(INITIAL_DEMO_PROPOSALS);
      }
    );

    return () => {
      unsubPrograms();
      unsubProposals();
    };
  }, []);

  const handlePersistProgram = useCallback(async (prog: PreviewProgramRecord) => {
    try {
      const cleanPayload = JSON.parse(JSON.stringify(prog));
      await setDoc(doc(db, 'programs', prog.id), cleanPayload, { merge: true });
    } catch (err) {
      console.warn('Could not persist program to Firestore:', err);
    }
  }, []);

  const handlePersistProposal = useCallback(async (prop: PreviewProposalRecord) => {
    try {
      const cleanPayload = JSON.parse(JSON.stringify(prop));
      await setDoc(doc(db, 'tutor_program_proposals', prop.id), cleanPayload, {
        merge: true,
      });
    } catch (err) {
      console.warn('Could not persist proposal to Firestore:', err);
    }
  }, []);

  const handlePersistBatchPrograms = useCallback(
    async (progs: PreviewProgramRecord[]) => {
      try {
        const batch = writeBatch(db);
        progs.slice(0, 400).forEach((p) => {
          const clean = JSON.parse(JSON.stringify(p));
          batch.set(doc(db, 'programs', p.id), clean, { merge: true });
        });
        await batch.commit();
      } catch (err) {
        console.warn('Could not batch-persist programs to Firestore:', err);
      }
    },
    []
  );

  return (
    <ProgramsCoursesPreviewPage
      embeddedInAdminLayout={true}
      externalPrograms={livePrograms}
      externalProposals={liveProposals}
      onPersistProgram={handlePersistProgram}
      onPersistProposal={handlePersistProposal}
      onPersistBatchPrograms={handlePersistBatchPrograms}
    />
  );
};

export default AdminPrograms;
