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
import { recalculateHierarchyMetadata } from '../../components/admin/programs-preview/hierarchyUtils';
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
    parentProgramId: raw.parentProgramId || '',
    parentProgramTitle: raw.parentProgramTitle || '',
    parentBreadcrumbPath: raw.parentBreadcrumbPath || '',
    rootProgramId: raw.rootProgramId || null,
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
    submittedAt:
      typeof raw.submittedAt === 'string'
        ? raw.submittedAt
        : typeof raw.createdAt === 'string'
        ? raw.createdAt
        : raw.createdAt?.toDate
        ? raw.createdAt.toDate().toISOString()
        : new Date().toISOString(),
    adminReviewNotes: raw.adminReviewNotes || '',
    reviewedByUid: raw.reviewedByUid,
    reviewedByName: raw.reviewedByName,
    reviewedAt: raw.reviewedAt,
    createdProgramId: raw.createdProgramId,
    reviewHistory: Array.isArray(raw.reviewHistory) ? raw.reviewHistory : [],
  };
}

export const AdminPrograms: React.FC = () => {
  const [livePrograms, setLivePrograms] = useState<PreviewProgramRecord[] | null>(null);
  const [liveProposals, setLiveProposals] = useState<PreviewProposalRecord[] | null>(null);
  const [programsLoading, setProgramsLoading] = useState(true);
  const [proposalsLoading, setProposalsLoading] = useState(true);
  const [programsError, setProgramsError] = useState<string | null>(null);
  const [proposalsError, setProposalsError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    setProgramsLoading(true);
    setProposalsLoading(true);
    setProgramsError(null);
    setProposalsError(null);

    const unsubPrograms = onSnapshot(
      collection(db, 'programs'),
      (snap) => {
        const docs = snap.docs.map((d) =>
          toPreviewProgramRecord(d.id, d.data() as Record<string, any>)
        );
        setLivePrograms(recalculateHierarchyMetadata(docs));
        setProgramsError(null);
        setProgramsLoading(false);
      },
      (err) => {
        console.error('Failed to load live programmes from Firestore:', err);
        setLivePrograms([]);
        setProgramsError(
          err?.message || 'Unable to load programmes from Firestore. Please retry.'
        );
        setProgramsLoading(false);
      }
    );

    const unsubProposals = onSnapshot(
      collection(db, 'programProposals'),
      (snap) => {
        const docs = snap.docs.map((d) =>
          toPreviewProposalRecord(d.id, d.data() as Record<string, any>)
        );
        setLiveProposals(docs);
        setProposalsError(null);
        setProposalsLoading(false);
      },
      (err) => {
        console.error('Failed to load live tutor proposals from Firestore:', err);
        setLiveProposals([]);
        setProposalsError(
          err?.message || 'Unable to load tutor proposals from Firestore. Please retry.'
        );
        setProposalsLoading(false);
      }
    );

    return () => {
      unsubPrograms();
      unsubProposals();
    };
  }, [retryNonce]);

  const handleRetry = useCallback(() => {
    setRetryNonce((n) => n + 1);
  }, []);

  const handlePersistProgram = useCallback(async (prog: PreviewProgramRecord) => {
    const cleanPayload = JSON.parse(JSON.stringify(prog));
    await setDoc(doc(db, 'programs', prog.id), cleanPayload, { merge: true });
  }, []);

  const handlePersistProposal = useCallback(async (prop: PreviewProposalRecord) => {
    const cleanPayload = JSON.parse(JSON.stringify(prop));
    await setDoc(doc(db, 'programProposals', prop.id), cleanPayload, {
      merge: true,
    });
  }, []);

  const handlePersistBatchPrograms = useCallback(
    async (progs: PreviewProgramRecord[]) => {
      const batch = writeBatch(db);
      progs.slice(0, 400).forEach((p) => {
        const clean = JSON.parse(JSON.stringify(p));
        batch.set(doc(db, 'programs', p.id), clean, { merge: true });
      });
      await batch.commit();
    },
    []
  );

  return (
    <ProgramsCoursesPreviewPage
      embeddedInAdminLayout={true}
      externalPrograms={livePrograms}
      externalProposals={liveProposals}
      isLoading={programsLoading || proposalsLoading}
      loadError={programsError || proposalsError}
      onRetryLoad={handleRetry}
      onPersistProgram={handlePersistProgram}
      onPersistProposal={handlePersistProposal}
      onPersistBatchPrograms={handlePersistBatchPrograms}
    />
  );
};

export default AdminPrograms;
