import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  X,
  ChevronRight,
  ArrowLeft,
  ArrowRight,
  Layers,
  Clock,
  CheckCircle2,
  CreditCard,
  Loader2,
  ShieldCheck,
  UserCheck,
  Sparkles,
  BookOpen,
} from 'lucide-react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../lib/firebase';
import { billingPost } from '../../lib/billing';
import { useToast } from '../../contexts/ToastContext';
import {
  type CanonicalRootKey,
  type ProgramDeliveryOption,
  type ProgramRecord,
  fetchAllProgramsMap,
  getProgramBreadcrumbs,
  getPublishedDirectChildren,
  getTopLevelCatalogEntries,
  countPublishedDiscoverableDescendants,
  isProgramCatalogDiscoverable,
  isProgramPubliclyEnrollable,
  resolveProgramCanonicalRoot,
} from '../../lib/programHierarchy';
import { resolveProgramBackgroundImage } from '../../lib/programMedia';
import { resolveProgramSlug } from '../../lib/sharing';
import {
  type ProgrammeEnrollmentRecord,
  PAYABLE_ENROLLMENT_STATUSES,
  submitStudentProgrammeApplication,
} from '../../lib/programmeEnrollments';

export interface LinkedChildSummary {
  id: string;
  name: string;
  className?: string;
}

interface PortalProgramExplorerProps {
  mode: 'student' | 'parent';
  initialProgramId?: string | null;
  initialProgramSlug?: string | null;
  /** Student mode context */
  studentContext?: {
    studentUid: string;
    studentDocId?: string | null;
    studentName: string;
    studentEmail?: string | null;
    studentOriginType: 'individual' | 'school';
    schoolId?: string | null;
    schoolName?: string | null;
    existingEnrollments: ProgrammeEnrollmentRecord[];
    onEnrollmentSubmitted?: () => void;
  };
  /** Parent mode context */
  parentContext?: {
    parentUid: string;
    parentEmail: string;
    parentName: string;
    linkedChildren: LinkedChildSummary[];
    onRequestSubmitted?: () => void;
  };
}

const ROOT_FILTERS: Array<{ key: 'ALL' | CanonicalRootKey; label: string }> = [
  { key: 'ALL', label: 'All Programmes' },
  { key: 'technology', label: 'Technology' },
  { key: 'design-graphics', label: 'Design & Graphics' },
  { key: 'music', label: 'Music' },
  { key: 'academics', label: 'Academics' },
];

const DELIVERY_OPTION_LABELS: Record<string, string> = {
  PUBLIC_GROUP: 'Public Group Cohort',
  PRIVATE_MENTORSHIP: '1-on-1 Private Mentorship',
};

const ENROLLMENT_STATUS_BADGE: Record<
  string,
  { label: string; className: string }
> = {
  PENDING_ADMIN_REVIEW: {
    label: 'Pending Admin Review',
    className:
      'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
  },
  APPROVED_AWAITING_PAYMENT: {
    label: 'Approved — Awaiting Payment',
    className:
      'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800',
  },
  PARTIALLY_PAID: {
    label: 'Partially Paid — Balance Due',
    className:
      'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
  },
  ACTIVE: {
    label: 'Active Enrolment',
    className:
      'bg-emerald-50 text-emerald-900 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-700',
  },
  RENEWAL_DUE: {
    label: 'Renewal Due',
    className:
      'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800',
  },
  REJECTED: {
    label: 'Application Declined',
    className:
      'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
  },
};

export const PortalProgramExplorer: React.FC<PortalProgramExplorerProps> = ({
  mode,
  initialProgramId,
  initialProgramSlug,
  studentContext,
  parentContext,
}) => {
  const { toast } = useToast();
  const [programsMap, setProgramsMap] = useState<Map<string, ProgramRecord>>(new Map());
  const [loading, setLoading] = useState(true);
  const [rootFilter, setRootFilter] = useState<'ALL' | CanonicalRootKey>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeParentId, setActiveParentId] = useState<string | null>(null);
  const [selectedProgram, setSelectedProgram] = useState<ProgramRecord | null>(null);
  const [deliveryOption, setDeliveryOption] = useState<ProgramDeliveryOption>('PUBLIC_GROUP');
  const [applicantNotes, setApplicantNotes] = useState('');
  const [selectedChildId, setSelectedChildId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const map = await fetchAllProgramsMap();
        if (!mounted) return;
        setProgramsMap(map);

        // Deep-link preselection from URL query params
        if (initialProgramId || initialProgramSlug) {
          const slugLower = String(initialProgramSlug || '').trim().toLowerCase();
          let target: ProgramRecord | undefined = initialProgramId
            ? map.get(initialProgramId)
            : undefined;
          if (!target && slugLower) {
            for (const p of map.values()) {
              if (p.slug.toLowerCase() === slugLower || p.id.toLowerCase() === slugLower) {
                target = p;
                break;
              }
            }
          }
          if (target && isProgramCatalogDiscoverable(target, map)) {
            const directKids = getPublishedDirectChildren(target.id, map);
            if (target.nodeType === 'CONTAINER' && !target.isEnrollable && directKids.length > 0) {
              setActiveParentId(target.id);
            } else {
              if (target.parentProgramId && map.has(target.parentProgramId)) {
                setActiveParentId(target.parentProgramId);
              }
              setSelectedProgram(target);
            }
          }
        }
      } catch (err) {
        console.error('Failed to load portal programmes:', err);
        toast.error('Unable to load available programmes right now.');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [initialProgramId, initialProgramSlug]);

  useEffect(() => {
    if (
      mode === 'parent' &&
      parentContext?.linkedChildren?.length &&
      !selectedChildId
    ) {
      setSelectedChildId(parentContext.linkedChildren[0].id);
    }
  }, [mode, parentContext?.linkedChildren, selectedChildId]);

  const enrollmentsByProgramId = useMemo(() => {
    const map = new Map<string, ProgrammeEnrollmentRecord>();
    for (const enr of studentContext?.existingEnrollments || []) {
      if (!map.has(enr.programId)) {
        map.set(enr.programId, enr);
      }
    }
    return map;
  }, [studentContext?.existingEnrollments]);

  const activeParent = activeParentId ? programsMap.get(activeParentId) || null : null;

  const activeBreadcrumbs = useMemo(() => {
    if (!activeParentId) return [];
    return getProgramBreadcrumbs(activeParentId, programsMap);
  }, [activeParentId, programsMap]);

  const visibleCards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (activeParentId && !q) {
      const children = getPublishedDirectChildren(activeParentId, programsMap).filter((c) =>
        isProgramCatalogDiscoverable(c, programsMap)
      );
      return children.map((program) => {
        const res = resolveProgramCanonicalRoot(program, programsMap);
        const directChildrenCount = getPublishedDirectChildren(program.id, programsMap).filter(
          (c) => isProgramCatalogDiscoverable(c, programsMap)
        ).length;
        const totalDescendantsCount = countPublishedDiscoverableDescendants(
          program.id,
          programsMap
        );
        return {
          program,
          rootKey: res.rootKey,
          rootTitle: res.rootDefinition?.title || 'Programme',
          directChildrenCount,
          totalDescendantsCount,
          isContainer: program.nodeType === 'CONTAINER' || directChildrenCount > 0,
        };
      });
    }

    const topEntries = getTopLevelCatalogEntries(programsMap, rootFilter);
    if (!q) return topEntries;

    return topEntries.filter(
      (entry) =>
        entry.program.title.toLowerCase().includes(q) ||
        entry.program.shortDescription.toLowerCase().includes(q) ||
        entry.rootTitle.toLowerCase().includes(q) ||
        entry.descendantSearchText.includes(q)
    );
  }, [activeParentId, programsMap, rootFilter, searchQuery]);

  const handleCardClick = (program: ProgramRecord, isContainer: boolean) => {
    const children = getPublishedDirectChildren(program.id, programsMap).filter((c) =>
      isProgramCatalogDiscoverable(c, programsMap)
    );
    if (isContainer && children.length > 0 && !isProgramPubliclyEnrollable(program)) {
      setActiveParentId(program.id);
      setSelectedProgram(null);
      return;
    }
    if (isContainer && children.length > 0 && program.isPrimaryRoot) {
      setActiveParentId(program.id);
      setSelectedProgram(null);
      return;
    }
    setSelectedProgram(program);
    const availableOpts = (program.deliveryOptions || []).filter(
      (o) => o === 'PUBLIC_GROUP' || o === 'PRIVATE_MENTORSHIP'
    );
    setDeliveryOption(availableOpts[0] || 'PUBLIC_GROUP');
    setApplicantNotes('');
  };

  const handleSubmitApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProgram) return;
    if (!isProgramPubliclyEnrollable(selectedProgram)) {
      toast.error('Please choose a specific enrollable track inside this container.');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'student') {
        if (!studentContext?.studentUid) {
          throw new Error('Please sign in again to submit your application.');
        }
        const crumbs = getProgramBreadcrumbs(selectedProgram.id, programsMap);
        const res = await submitStudentProgrammeApplication({
          studentUid: studentContext.studentUid,
          studentDocId: studentContext.studentDocId || studentContext.studentUid,
          studentName: studentContext.studentName,
          studentEmail: studentContext.studentEmail || auth.currentUser?.email || '',
          studentRegistrationType:
            studentContext.studentOriginType === 'school' ? 'school' : 'individual',
          schoolId: studentContext.schoolId || null,
          schoolName: studentContext.schoolName || null,
          programId: selectedProgram.id,
          programSlug: selectedProgram.slug || selectedProgram.id,
          programTitle: selectedProgram.title,
          parentProgramId: selectedProgram.parentProgramId || null,
          breadcrumbPath: crumbs.map((c) => c.title).join(' › '),
          deliveryOption,
          source: 'PORTAL_EXPLORE',
        });

        if (res.alreadyExists) {
          toast.info('You already have an active or pending application for this programme.');
        } else {
          toast.success(
            'Application submitted for admin review! Once approved, you will receive an email and payment prompt.'
          );
        }
        setSelectedProgram(null);
        studentContext.onEnrollmentSubmitted?.();
      } else {
        // Parent mode: require verified linked child selection
        if (!parentContext?.parentUid) {
          throw new Error('Parent session not verified.');
        }
        const targetChild = parentContext.linkedChildren.find((c) => c.id === selectedChildId);
        if (!targetChild) {
          toast.error('Please select which linked child you are enrolling.');
          setSubmitting(false);
          return;
        }
        const crumbs = getProgramBreadcrumbs(selectedProgram.id, programsMap);
        const breadcrumbStr = crumbs.map((c) => c.title).join(' › ');
        const payload = {
          studentId: targetChild.id,
          studentName: targetChild.name,
          studentClass: targetChild.className || '',
          studentAge: targetChild.className || 'Linked Learner',
          programId: selectedProgram.id,
          programSlug: resolveProgramSlug(selectedProgram),
          programTitle: selectedProgram.title,
          programBreadcrumb: breadcrumbStr,
          selectedProgramIds: [selectedProgram.id],
          programPaths: [breadcrumbStr],
          plan: selectedProgram.title,
          deliveryType: deliveryOption,
          notes: applicantNotes.trim(),
          source: 'parent_portal_explorer',
        };
        let alreadyExists = false;
        try {
          const apiRes = await billingPost<any>('parent-enrollment-request', payload);
          alreadyExists = Boolean(apiRes?.alreadyExists);
        } catch (serverErr: any) {
          const msg = String(serverErr?.message || '').toLowerCase();
          const isLocalPreviewMissingFn =
            msg.includes('404') || msg.includes('failed to fetch') || msg.includes('not found');
          if (!isLocalPreviewMissingFn) {
            throw serverErr;
          }
          await addDoc(collection(db, 'enrollment_requests'), {
            parentId: parentContext.parentUid,
            parentEmail: parentContext.parentEmail.toLowerCase(),
            parentName: parentContext.parentName,
            ...payload,
            billingResponsibility: 'PARENT_FUNDED',
            paymentStatus: 'UNPAID',
            status: 'pending',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
        if (alreadyExists) {
          toast.info(
            `${targetChild.name} already has an active or pending enrolment request for ${selectedProgram.title}.`
          );
        } else {
          toast.success(
            `Enrolment request submitted for ${targetChild.name}. Admin review is underway.`
          );
        }
        setSelectedProgram(null);
        parentContext.onRequestSubmitted?.();
      }
    } catch (err: any) {
      console.error('Programme enrolment submission failed:', err);
      toast.error(err?.message || 'Could not submit enrolment request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Contextual Notice Banner for School Students */}
      {mode === 'student' && studentContext?.studentOriginType === 'school' && (
        <div className="p-4 rounded-2xl bg-slate-900 text-white border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <ShieldCheck size={18} className="text-red-400 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed">
              <p className="font-extrabold text-white">
                Independent Additional Programme Enrolment (Student Self-Funded)
              </p>
              <p className="text-slate-300 mt-0.5">
                Any extra programme you apply for here is personally funded by you after admin
                approval. Your existing school-sponsored classes remain completely unchanged and
                your school will never be billed.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Search & Root Filter Bar */}
      <div className="bg-white dark:bg-[#0c1220] p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1 md:max-w-sm">
            <Search
              size={15}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search programmes, tracks, or skills..."
              className="w-full pl-9 pr-8 py-2 rounded-xl text-xs bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-brand-red"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            {ROOT_FILTERS.map((f) => {
              const active = !activeParentId && rootFilter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => {
                    setActiveParentId(null);
                    setRootFilter(f.key);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap border transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#B91C1C] text-white border-[#B91C1C]'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                  }`}
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Drill-down Breadcrumb Bar */}
        {activeParent && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-slate-100 dark:border-slate-800">
            <nav className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <button
                type="button"
                onClick={() => setActiveParentId(null)}
                className="inline-flex items-center gap-1 text-[#B91C1C] hover:underline font-bold cursor-pointer"
              >
                <ArrowLeft size={13} />
                <span>All Programmes</span>
              </button>
              {activeBreadcrumbs.map((crumb, idx) => {
                const isLast = idx === activeBreadcrumbs.length - 1;
                return (
                  <React.Fragment key={crumb.id}>
                    <ChevronRight size={13} className="text-slate-400" />
                    {isLast ? (
                      <span className="text-slate-900 dark:text-white font-bold">
                        {crumb.title}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setActiveParentId(crumb.id)}
                        className="hover:text-slate-900 dark:hover:text-white cursor-pointer"
                      >
                        {crumb.title}
                      </button>
                    )}
                  </React.Fragment>
                );
              })}
            </nav>

            {isProgramPubliclyEnrollable(activeParent) && (
              <button
                type="button"
                onClick={() => setSelectedProgram(activeParent)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#B91C1C] hover:bg-red-700 text-white text-[11px] font-bold cursor-pointer"
              >
                <Sparkles size={12} />
                <span>Apply for Full {activeParent.title}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Catalogue Grid */}
      {loading ? (
        <div className="py-16 flex items-center justify-center">
          <Loader2 className="w-7 h-7 animate-spin text-brand-red" />
        </div>
      ) : visibleCards.length === 0 ? (
        <div className="p-10 text-center rounded-2xl bg-white dark:bg-[#0c1220] border border-slate-200 dark:border-slate-800">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
            No matching programmes found.
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Try clearing your search or switching programme categories.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleCards.map(
            ({
              program,
              rootKey,
              rootTitle,
              directChildrenCount,
              totalDescendantsCount,
              isContainer,
            }) => {
              const bgImage = resolveProgramBackgroundImage(program, programsMap, rootKey);
              const existingEnr = enrollmentsByProgramId.get(program.id);
              const statusMeta = existingEnr
                ? ENROLLMENT_STATUS_BADGE[existingEnr.enrollmentStatus]
                : null;
              const canPayNow =
                existingEnr && PAYABLE_ENROLLMENT_STATUSES.has(existingEnr.enrollmentStatus);

              if (isContainer) {
                const count =
                  totalDescendantsCount > directChildrenCount
                    ? totalDescendantsCount
                    : directChildrenCount;
                return (
                  <div
                    key={program.id}
                    className="group relative flex flex-col justify-between min-h-[250px] rounded-2xl overflow-hidden border border-slate-200/80 dark:border-white/15 bg-slate-950 shadow-xs hover:shadow-lg transition-all"
                  >
                    <img
                      src={bgImage}
                      alt={program.title}
                      loading="lazy"
                      className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/65 to-slate-950/20" />

                    <div className="relative z-10 p-4 flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black uppercase tracking-[0.16em] text-red-400">
                        {rootTitle}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-200 tabular-nums">
                        {count} {count === 1 ? 'track' : 'tracks'}
                      </span>
                    </div>

                    <div className="relative z-10 p-4 pt-6 space-y-2">
                      <h3 className="text-lg font-extrabold text-white leading-snug">
                        {program.title}
                      </h3>
                      {program.shortDescription && (
                        <p className="text-xs text-slate-200/85 line-clamp-2 leading-relaxed">
                          {program.shortDescription}
                        </p>
                      )}
                      <div className="pt-2.5 border-t border-white/15 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => handleCardClick(program, true)}
                          className="inline-flex items-center gap-1.5 text-xs font-extrabold text-white hover:text-red-300 cursor-pointer"
                        >
                          <Layers size={13} />
                          <span>Explore Tracks</span>
                          <ArrowRight size={13} />
                        </button>
                        {isProgramPubliclyEnrollable(program) && !program.isPrimaryRoot && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedProgram(program);
                              setDeliveryOption('PUBLIC_GROUP');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-[#B91C1C] hover:bg-red-700 text-white text-[11px] font-bold cursor-pointer"
                          >
                            Apply
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={program.id}
                  className="flex flex-col justify-between rounded-2xl overflow-hidden bg-white dark:bg-[#0c1220] border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-all"
                >
                  <div>
                    <div className="relative h-32 bg-slate-900 overflow-hidden">
                      <img
                        src={bgImage}
                        alt={program.title}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-transparent to-transparent" />
                      <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wider text-white">
                        <span>{rootTitle}</span>
                        <span className="inline-flex items-center gap-1 text-slate-200">
                          <Clock size={11} /> {program.duration || '8 Weeks'}
                        </span>
                      </div>
                    </div>

                    <div className="p-4 space-y-2">
                      <h3 className="text-sm font-extrabold text-slate-900 dark:text-white leading-snug">
                        {program.title}
                      </h3>
                      {program.shortDescription && (
                        <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                          {program.shortDescription}
                        </p>
                      )}
                      {statusMeta && (
                        <div
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold ${statusMeta.className}`}
                        >
                          <CheckCircle2 size={11} />
                          <span>{statusMeta.label}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200 tabular-nums">
                      {program.publicGroupPricing?.amount
                        ? `₦${program.publicGroupPricing.amount.toLocaleString()}`
                        : program.pricing || 'Fee set on review'}
                    </span>

                    {mode === 'student' && canPayNow && existingEnr ? (
                      <Link
                        to={`/portal/student/payments?enrollmentId=${encodeURIComponent(
                          existingEnr.id
                        )}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold"
                      >
                        <CreditCard size={12} />
                        <span>Continue to Payment</span>
                      </Link>
                    ) : mode === 'student' && existingEnr?.enrollmentStatus === 'ACTIVE' ? (
                      <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
                        <CheckCircle2 size={13} /> Enrolled
                      </span>
                    ) : mode === 'student' &&
                      existingEnr?.enrollmentStatus === 'PENDING_ADMIN_REVIEW' ? (
                      <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400">
                        Under Review
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleCardClick(program, false)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#B91C1C] hover:bg-red-700 text-white text-[11px] font-bold cursor-pointer"
                      >
                        <span>{mode === 'parent' ? 'Enrol Child' : 'Request Enrolment'}</span>
                        <ArrowRight size={12} />
                      </button>
                    )}
                  </div>
                </div>
              );
            }
          )}
        </div>
      )}

      {/* Application / Enrolment Request Modal */}
      {selectedProgram && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="portal-enrol-modal-title"
        >
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-6">
            <div className="relative h-32 bg-slate-950 overflow-hidden">
              <img
                src={resolveProgramBackgroundImage(selectedProgram, programsMap)}
                alt={selectedProgram.title}
                className="w-full h-full object-cover opacity-55"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent" />
              <button
                type="button"
                onClick={() => setSelectedProgram(null)}
                aria-label="Close enrolment dialog"
                className="absolute top-3 right-3 p-1.5 rounded-lg bg-slate-950/70 text-white hover:bg-slate-900 cursor-pointer"
              >
                <X size={16} />
              </button>
              <div className="absolute bottom-3 left-5 right-5">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-red-400">
                  {mode === 'parent' ? 'Parent Enrolment Request' : 'Student Self-Funded Application'}
                </p>
                <h3
                  id="portal-enrol-modal-title"
                  className="text-lg font-extrabold text-white leading-snug"
                >
                  {selectedProgram.title}
                </h3>
              </div>
            </div>

            <form onSubmit={handleSubmitApplication} className="p-5 space-y-4">
              {selectedProgram.shortDescription && (
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {selectedProgram.shortDescription}
                </p>
              )}

              {/* Parent Mode: Mandatory Verified Linked Child Selector */}
              {mode === 'parent' && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                    Select Child to Enrol *
                  </label>
                  {!parentContext?.linkedChildren?.length ? (
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300">
                      No linked child profile found on your account yet. Add a child from your
                      Parent Dashboard first.
                    </div>
                  ) : (
                    <select
                      required
                      value={selectedChildId}
                      onChange={(e) => setSelectedChildId(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700"
                    >
                      {parentContext.linkedChildren.map((child) => (
                        <option key={child.id} value={child.id}>
                          {child.name}
                          {child.className ? ` (${child.className})` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Delivery Mode Picker */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                  Preferred Learning Format
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {(['PUBLIC_GROUP', 'PRIVATE_MENTORSHIP'] as ProgramDeliveryOption[]).map(
                    (opt) => {
                      const active = deliveryOption === opt;
                      const priceInfo =
                        opt === 'PRIVATE_MENTORSHIP'
                          ? selectedProgram.privateMentorshipPricing
                          : selectedProgram.publicGroupPricing;
                      return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setDeliveryOption(opt)}
                          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                            active
                              ? 'border-[#B91C1C] bg-red-50/50 dark:bg-red-950/25 ring-2 ring-[#B91C1C]/20'
                              : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                          }`}
                        >
                          <div className="text-xs font-extrabold text-slate-900 dark:text-white">
                            {DELIVERY_OPTION_LABELS[opt]}
                          </div>
                          <div className="text-[11px] font-bold text-slate-600 dark:text-slate-400 mt-0.5 tabular-nums">
                            {priceInfo?.amount
                              ? `₦${priceInfo.amount.toLocaleString()} · ${priceInfo.billingCycle}`
                              : 'Confirmed during admin review'}
                          </div>
                        </button>
                      );
                    }
                  )}
                </div>
              </div>

              {/* Optional Goals / Notes */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                  Learning Goals or Preferred Schedule (Optional)
                </label>
                <textarea
                  rows={2}
                  value={applicantNotes}
                  onChange={(e) => setApplicantNotes(e.target.value)}
                  placeholder="Share preferred days, prior experience, or questions for admissions..."
                  className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-brand-red"
                />
              </div>

              {/* Clear Policy Notice */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 text-[11px] text-slate-600 dark:text-slate-300 flex items-start gap-2">
                <BookOpen size={14} className="text-[#B91C1C] shrink-0 mt-0.5" />
                <span>
                  {mode === 'student'
                    ? 'Submitting this request places your application in Pending Admin Review. Once admissions confirms your fee and approves access, you will be notified by email and in-portal to pay and activate your programme.'
                    : 'Your enrolment request will be reviewed by admissions and billed to your parent account once approved.'}
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedProgram(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    submitting ||
                    (mode === 'parent' && !parentContext?.linkedChildren?.length)
                  }
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-[#B91C1C] hover:bg-red-700 text-white text-xs font-extrabold disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <UserCheck size={14} />
                  )}
                  <span>{submitting ? 'Submitting...' : 'Submit Enrolment Request'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PortalProgramExplorer;
