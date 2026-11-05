import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { X, CheckCircle, AlertTriangle, FolderTree } from 'lucide-react';
import {
  type ProgramRecord,
  type ProgramDeliveryOption,
  fetchAllProgramsMap,
  getProgramBreadcrumbs,
} from '../../lib/programHierarchy';
import {
  extractStudentSelectedProgramIds,
  resolveEnrolmentScope,
} from '../../lib/learningPathwayEngine';
import ProgramHierarchySelector from './ProgramHierarchySelector';

export interface EnrollmentApprovalPathwayPayload {
  selectedProgramIds: string[];
  optionalProgramIds: string[];
  priorRecognisedProgramIds: string[];
  deliveryType: ProgramDeliveryOption;
  pathwayStatus: 'CONFIGURED' | 'PENDING_PROGRAMME_CONFIRMATION';
  enrolledRootProgramIds: string[];
  assignedProgramIds: string[];
  selectedProgramTitles: string[];
}

interface Props {
  student?: any;
  request?: any;
  isOpen?: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  onApprove?: (
    studentId: string,
    programId: string,
    tutorId: string,
    agreedFee: number,
    customProgramName?: string,
    pathwayPayload?: EnrollmentApprovalPathwayPayload
  ) => Promise<void>;
}

export const StudentEnrollmentApprovalModal: React.FC<Props> = ({
  student: studentProp,
  request,
  isOpen = true,
  onClose,
  onSuccess,
  onApprove,
}) => {
  const student = studentProp || request;
  const [programsMap, setProgramsMap] = useState<Map<string, ProgramRecord>>(new Map());
  const [tutors, setTutors] = useState<any[]>([]);
  const [selectedProgramIds, setSelectedProgramIds] = useState<string[]>([]);
  const [optionalProgramIds, setOptionalProgramIds] = useState<string[]>([]);
  const [priorRecognisedProgramIds, setPriorRecognisedProgramIds] = useState<string[]>([]);
  const [deliveryType, setDeliveryType] = useState<ProgramDeliveryOption>('PUBLIC_GROUP');
  const [selectedTutor, setSelectedTutor] = useState(student?.assignedTutorId || '');
  const [fee, setFee] = useState<string>(
    student?.agreedFee !== undefined ? String(student.agreedFee) : ''
  );
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [progMap, tSnap] = await Promise.all([
          fetchAllProgramsMap(),
          getDocs(
            query(collection(db, 'users'), where('role', 'in', ['TUTOR', 'STAFF', 'ACADEMIC_STAFF']))
          ).catch(() => null),
        ]);

        setProgramsMap(progMap);

        // Extract student's requested or existing programme(s) WITHOUT falling back to programs[0]
        const extracted = extractStudentSelectedProgramIds(student, progMap);
        setSelectedProgramIds(extracted.selectedProgramIds);
        setOptionalProgramIds(extracted.optionalProgramIds);

        if (student?.deliveryType === 'PRIVATE_MENTORSHIP' || student?.billingModel === 'PRIVATE_MENTORSHIP') {
          setDeliveryType('PRIVATE_MENTORSHIP');
        }

        if (extracted.selectedProgramIds.length > 0 && !student?.agreedFee) {
          let suggested = 0;
          for (const pid of extracted.selectedProgramIds) {
            const p = progMap.get(pid);
            if (p) {
              suggested += p.publicGroupPricing?.amount ?? (p.price || 35000);
            }
          }
          if (suggested > 0) setFee(String(suggested));
        }

        if (tSnap) {
          setTutors(tSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        }
      } catch (err) {
        console.error('Error loading enrollment approval modal data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [student]);

  const resolvedScope = useMemo(() => {
    return resolveEnrolmentScope(selectedProgramIds, programsMap, {
      optionalProgramIds,
    });
  }, [selectedProgramIds, optionalProgramIds, programsMap]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const primaryProgramId = selectedProgramIds[0] || '';
      const selectedTitles = resolvedScope.selectedNodes.map((n) => {
        const crumbs = getProgramBreadcrumbs(n.id, programsMap);
        return crumbs.map((c) => c.title).join(' › ');
      });
      const displayProgramName =
        resolvedScope.selectedNodes.length > 0
          ? resolvedScope.selectedNodes.map((n) => n.title).join(', ')
          : 'Pending Programme Confirmation';

      const pathwayPayload: EnrollmentApprovalPathwayPayload = {
        selectedProgramIds,
        optionalProgramIds,
        priorRecognisedProgramIds,
        deliveryType,
        pathwayStatus:
          selectedProgramIds.length > 0 ? 'CONFIGURED' : 'PENDING_PROGRAMME_CONFIRMATION',
        enrolledRootProgramIds: resolvedScope.enrolledRootPrograms.map((r) => r.id),
        assignedProgramIds: resolvedScope.assignedLearningUnits.map((u) => u.id),
        selectedProgramTitles: selectedTitles,
      };

      if (onApprove) {
        await onApprove(
          student?.id,
          primaryProgramId,
          selectedTutor,
          Number(fee) || 0,
          displayProgramName,
          pathwayPayload
        );
      } else if (student?.id) {
        const { saveStudentPathwayConfiguration } = await import('../../lib/learningPathwayEngine');
        await saveStudentPathwayConfiguration({
          studentId: student.id,
          studentName: student.name || student.fullName || student.studentName || 'Student',
          selectedProgramIds,
          optionalProgramIds,
          priorRecognisedProgramIds,
          deliveryType,
          agreedFee: Number(fee) || 0,
          programsMap,
          actorUid: 'admin',
          actorName: 'Administrator',
          actorRole: 'ADMIN',
        });
      }
      if (onSuccess) onSuccess();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen || loading || !student) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-2xl w-full shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[92vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
              <FolderTree size={20} className="text-brand-red" />
              <span>Configure Programme Pathway &amp; Approve Enrolment</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Student:{' '}
              <strong className="text-slate-900 dark:text-white">
                {student?.name || student?.fullName || student?.studentName}
              </strong>
              {student?.chosenProgram || student?.selectedPlan || student?.programName ? (
                <span className="ml-2 text-indigo-600 dark:text-indigo-400 font-semibold">
                  (Requested: {student.chosenProgram || student.selectedPlan || student.programName})
                </span>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <ProgramHierarchySelector
            programsMap={programsMap}
            selectedProgramIds={selectedProgramIds}
            onChangeSelectedProgramIds={setSelectedProgramIds}
            optionalProgramIds={optionalProgramIds}
            onChangeOptionalProgramIds={setOptionalProgramIds}
            priorRecognisedProgramIds={priorRecognisedProgramIds}
            onChangePriorRecognisedProgramIds={setPriorRecognisedProgramIds}
            deliveryType={deliveryType}
            onChangeDeliveryType={(nextDelivery, suggestedAmount) => {
              setDeliveryType(nextDelivery);
              if (suggestedAmount > 0) {
                setFee(String(suggestedAmount));
              }
            }}
            allowOptionalToggle={true}
            allowPriorLearningToggle={true}
            compact={true}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Assign Tutor (Optional)
              </label>
              <select
                value={selectedTutor}
                onChange={(e) => setSelectedTutor(e.target.value)}
                className="w-full p-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 dark:text-white"
              >
                <option value="">-- Assign Later --</option>
                {tutors.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName || t.name || t.email}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Agreed Enrolment Fee (₦)
              </label>
              <input
                type="number"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                className="w-full p-2.5 border border-slate-300 dark:border-slate-700 rounded-xl text-xs bg-white dark:bg-slate-800 dark:text-white"
                placeholder="e.g. 35000"
                required
              />
            </div>
          </div>

          {selectedProgramIds.length === 0 && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0 text-amber-600" />
              <span>
                No specific programme is selected yet. Approving now will mark this student as{' '}
                <strong>Pending Programme Confirmation</strong> instead of assigning a random fallback.
              </span>
            </div>
          )}

          <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 flex items-center gap-2 text-xs font-bold disabled:opacity-50"
            >
              <CheckCircle className="w-4 h-4" />
              <span>
                {submitting
                  ? 'Saving Pathway & Approving...'
                  : 'Confirm Pathway & Approve Enrolment'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
