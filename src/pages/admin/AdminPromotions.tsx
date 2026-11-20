import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Megaphone,
  Plus,
  Edit2,
  Trash2,
  Pause,
  Play,
  Archive,
  ArrowUp,
  ArrowDown,
  Monitor,
  Smartphone,
  ExternalLink,
  AlertCircle,
  RefreshCw,
  Loader2,
  X,
  Save,
  Calendar,
  Share2,
} from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { useToast } from '../../contexts/ToastContext';
import CloudinaryImageUpload from '../../components/common/CloudinaryImageUpload';
import {
  PRIMARY_PROGRAM_ROOTS,
  fetchAllProgramsMap,
  isProgramCatalogDiscoverable,
  getProgramBreadcrumbs,
  type CanonicalRootKey,
  type ProgramRecord,
} from '../../lib/programHierarchy';
import { buildCampaignShareUrl, copyTextToClipboard } from '../../lib/sharing';
import {
  fetchAllPromotions,
  savePromotionCampaign,
  updatePromotionStatus,
  reorderPromotions,
  deletePromotionCampaign,
  resolvePromotionCtaDestination,
  isPromotionCurrentlyEligible,
  isValidExternalHttpsUrl,
  isValidInternalPath,
  type PromotionCampaign,
  type PromotionPlacement,
  type PromotionStatus,
  type PromotionCtaTargetType,
  type PopupFrequency,
} from '../../lib/promotions';
import { logBannerDiagnostic } from '../../lib/bannerDiagnostics';

const INTERNAL_PAGE_OPTIONS = [
  { value: '/programs', label: 'Programs Overview (/programs)' },
  { value: '/programs?tab=catalog#catalog-section', label: 'All Programme Catalogue' },
  { value: '/tutors', label: 'Find a Tutor (/tutors)' },
  { value: '/school-partnership', label: 'School Partnerships (/school-partnership)' },
  { value: '/register', label: 'Register / Enrol (/register)' },
  { value: '/contact', label: 'Contact Us (/contact)' },
  { value: '/about', label: 'About Jaystarbliss (/about)' },
];

const STATUS_STYLE: Record<PromotionStatus, string> = {
  ACTIVE:
    'border-emerald-600/35 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  SCHEDULED:
    'border-blue-600/35 bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
  PAUSED:
    'border-amber-600/35 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  DRAFT:
    'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
  ARCHIVED:
    'border-slate-300 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400',
};

function toDateInputValue(raw: any): string {
  if (!raw) return '';
  if (typeof raw === 'string') return raw.slice(0, 10);
  if (typeof raw?.toDate === 'function') {
    const d = raw.toDate();
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  }
  return '';
}

interface EditorDraft {
  id?: string;
  title: string;
  subtitle: string;
  placement: PromotionPlacement;
  status: PromotionStatus;
  desktopImageUrl: string;
  mobileImageUrl: string;
  imageAlt: string;
  ctaLabel: string;
  ctaTargetType: PromotionCtaTargetType;
  programRootKey: CanonicalRootKey;
  programId: string;
  programSlug: string;
  internalPath: string;
  externalUrl: string;
  sortOrder: number;
  startAt: string;
  endAt: string;
  popupFrequency: PopupFrequency;
  popupIntervalDays: number;
  popupDelayMs: number;
}

const createEmptyDraft = (
  placement: PromotionPlacement,
  nextSortOrder: number
): EditorDraft => ({
  title: '',
  subtitle: '',
  placement,
  status: 'ACTIVE',
  desktopImageUrl: '',
  mobileImageUrl: '',
  imageAlt: '',
  ctaLabel: 'Explore Programmes',
  ctaTargetType: 'PROGRAM_CATALOG',
  programRootKey: 'technology',
  programId: '',
  programSlug: '',
  internalPath: '/programs?tab=catalog#catalog-section',
  externalUrl: '',
  sortOrder: nextSortOrder,
  startAt: '',
  endAt: '',
  popupFrequency: 'ONCE_PER_BROWSER',
  popupIntervalDays: 7,
  popupDelayMs: 2200,
});

export const AdminPromotions: React.FC = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<PromotionPlacement>('HOME_CAROUSEL');
  const [campaigns, setCampaigns] = useState<PromotionCampaign[]>([]);
  const [programs, setPrograms] = useState<ProgramRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [draft, setDraft] = useState<EditorDraft>(() => createEmptyDraft('HOME_CAROUSEL', 1));
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [programsMap, setProgramsMap] = useState<Map<string, ProgramRecord>>(new Map());

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [promoList, progMap] = await Promise.all([
        fetchAllPromotions(),
        fetchAllProgramsMap().catch(() => new Map<string, ProgramRecord>()),
      ]);
      setCampaigns(promoList);
      setProgramsMap(progMap);
      const discoverableProgs = Array.from(progMap.values())
        .filter((p) => isProgramCatalogDiscoverable(p, progMap))
        .sort((a, b) => {
          const pathA = getProgramBreadcrumbs(a.id, progMap)
            .map((c) => c.title)
            .join(' › ');
          const pathB = getProgramBreadcrumbs(b.id, progMap)
            .map((c) => c.title)
            .join(' › ');
          return pathA.localeCompare(pathB);
        });
      setPrograms(discoverableProgs);
    } catch (err: any) {
      console.error('Failed to load promotions:', err);
      setLoadError(err?.message || 'Unable to load promotions from Firestore.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        void loadData();
      } else {
        setLoading(false);
        setLoadError('Please sign in with an administrator account to manage promotions.');
      }
    });
    return () => unsubscribe();
  }, [loadData]);

  const tabCampaigns = useMemo(
    () =>
      campaigns
        .filter((c) => c.placement === activeTab)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [campaigns, activeTab]
  );

  const openCreateModal = () => {
    setDraft(createEmptyDraft(activeTab, tabCampaigns.length + 1));
    setPreviewDevice('desktop');
    setEditorOpen(true);
  };

  const openEditModal = (promo: PromotionCampaign) => {
    setDraft({
      id: promo.id,
      title: promo.title,
      subtitle: promo.subtitle || '',
      placement: promo.placement,
      status: promo.status,
      desktopImageUrl: promo.desktopImageUrl,
      mobileImageUrl: promo.mobileImageUrl || '',
      imageAlt: promo.imageAlt || promo.title,
      ctaLabel: promo.ctaLabel || 'Learn More',
      ctaTargetType: promo.ctaTargetType,
      programRootKey: promo.programRootKey || 'technology',
      programId: promo.programId || '',
      programSlug: promo.programSlug || '',
      internalPath: promo.internalPath || '/programs',
      externalUrl: promo.externalUrl || '',
      sortOrder: promo.sortOrder || 1,
      startAt: toDateInputValue(promo.startAt),
      endAt: toDateInputValue(promo.endAt),
      popupFrequency: promo.popupFrequency || 'ONCE_PER_BROWSER',
      popupIntervalDays: promo.popupIntervalDays || 7,
      popupDelayMs: promo.popupDelayMs ?? 2200,
    });
    setPreviewDevice('desktop');
    setEditorOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.title.trim()) {
      toast.error('Campaign title is required.');
      return;
    }
    if (!draft.desktopImageUrl.trim()) {
      toast.error('Please upload a desktop banner image via Cloudinary.');
      return;
    }
    if (draft.ctaTargetType === 'EXTERNAL_URL' && !isValidExternalHttpsUrl(draft.externalUrl)) {
      toast.error('External destination URL must be a valid https:// address.');
      return;
    }
    if (draft.ctaTargetType === 'INTERNAL_PAGE' && !isValidInternalPath(draft.internalPath)) {
      toast.error('Internal page path must start with "/".');
      return;
    }
    if (draft.ctaTargetType === 'INDIVIDUAL_PROGRAM' && !draft.programId && !draft.programSlug) {
      toast.error('Please choose a target programme.');
      return;
    }

    setSaving(true);
    try {
      const savedId = await savePromotionCampaign(
        {
          id: draft.id,
          title: draft.title.trim(),
          subtitle: draft.subtitle.trim(),
          placement: draft.placement,
          status: draft.status,
          desktopImageUrl: draft.desktopImageUrl.trim(),
          mobileImageUrl: draft.mobileImageUrl.trim(),
          imageAlt: draft.imageAlt.trim() || draft.title.trim(),
          ctaLabel: draft.ctaLabel.trim() || 'Learn More',
          ctaTargetType: draft.ctaTargetType,
          programRootKey: draft.programRootKey,
          programId: draft.programId || null,
          programSlug: draft.programSlug || null,
          internalPath: draft.internalPath.trim() || null,
          externalUrl: draft.externalUrl.trim() || null,
          sortOrder: Number(draft.sortOrder) || 1,
          startAt: draft.startAt ? new Date(`${draft.startAt}T00:00:00`).toISOString() : null,
          endAt: draft.endAt ? new Date(`${draft.endAt}T23:59:59.999`).toISOString() : null,
          popupFrequency: draft.popupFrequency,
          popupIntervalDays: Number(draft.popupIntervalDays) || 7,
          popupDelayMs: Number(draft.popupDelayMs) || 2200,
        },
        auth.currentUser?.uid
      );
      logBannerDiagnostic('AdminPromotions', 'campaign_saved', {
        id: savedId,
        title: draft.title.trim(),
        placement: draft.placement,
        status: draft.status,
        startAt: draft.startAt || null,
        endAt: draft.endAt || null,
        hasDesktopImage: Boolean(draft.desktopImageUrl.trim()),
      });
      if (draft.status === 'ACTIVE') {
        toast.success(
          draft.id
            ? 'Promotion updated and live on the website.'
            : 'Promotion created and published live!'
        );
      } else if (draft.status === 'DRAFT') {
        toast.info(
          'Saved as Draft (not visible on the homepage yet). Click the Play icon to publish it live.'
        );
      } else {
        toast.success(`Promotion saved with status ${draft.status}.`);
      }
      setEditorOpen(false);
      await loadData();
    } catch (err: any) {
      console.error('Failed to save promotion:', err);
      toast.error(err?.message || 'Could not save promotion campaign.');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (promo: PromotionCampaign, nextStatus: PromotionStatus) => {
    try {
      await updatePromotionStatus(promo.id, nextStatus, auth.currentUser?.uid);
      logBannerDiagnostic('AdminPromotions', 'campaign_status_changed', {
        id: promo.id,
        title: promo.title,
        placement: promo.placement,
        previousStatus: promo.status,
        nextStatus,
      });
      toast.success(`"${promo.title}" marked as ${nextStatus}.`);
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Unable to update campaign status.');
    }
  };

  const handleReorder = async (index: number, direction: -1 | 1) => {
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= tabCampaigns.length) return;
    const reordered = [...tabCampaigns];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(swapIndex, 0, moved);
    try {
      await reorderPromotions(
        reordered.map((c) => c.id),
        auth.currentUser?.uid
      );
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Unable to reorder campaigns.');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deletePromotionCampaign(id);
      toast.success('Promotion campaign deleted.');
      setConfirmDeleteId(null);
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Unable to delete campaign.');
    }
  };

  const previewDestination = useMemo(() => resolvePromotionCtaDestination(draft), [draft]);
  const previewImage =
    previewDevice === 'mobile' && draft.mobileImageUrl.trim()
      ? draft.mobileImageUrl.trim()
      : draft.desktopImageUrl.trim();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <Megaphone className="w-6 h-6 text-[#B91C1C]" />
            <span>Promotions &amp; Popup Campaigns</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Manage homepage promotional banners and first-visit announcement popups using Cloudinary media.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#B91C1C] hover:bg-red-700 text-white text-xs sm:text-sm font-bold shadow-xs transition-colors cursor-pointer shrink-0"
        >
          <Plus size={16} />
          <span>
            {activeTab === 'HOME_CAROUSEL' ? 'New Carousel Banner' : 'New Popup Campaign'}
          </span>
        </button>
      </div>

      {/* Placement Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800 flex items-center gap-6">
        {(
          [
            {
              id: 'HOME_CAROUSEL' as PromotionPlacement,
              label: 'Homepage Carousel',
              count: campaigns.filter((c) => c.placement === 'HOME_CAROUSEL').length,
            },
            {
              id: 'FIRST_VISIT_POPUP' as PromotionPlacement,
              label: 'First-Visit Popups',
              count: campaigns.filter((c) => c.placement === 'FIRST_VISIT_POPUP').length,
            },
          ] as const
        ).map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`relative py-3 text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer transition-colors ${
                isActive
                  ? 'text-[#B91C1C] dark:text-red-400'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>{tab.label}</span>
              <span className="text-[11px] font-mono tabular-nums text-slate-400">
                ({tab.count})
              </span>
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#B91C1C]" />
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-16 flex items-center justify-center gap-2.5 text-xs font-semibold text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin text-[#B91C1C]" />
          <span>Loading promotion campaigns...</span>
        </div>
      ) : loadError ? (
        <div className="p-6 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-2.5 text-xs text-red-900 dark:text-red-200">
            <AlertCircle className="w-4 h-4 text-[#B91C1C] shrink-0 mt-0.5" />
            <div>
              <div className="font-bold">Could not load promotion campaigns</div>
              <p className="mt-0.5">{loadError}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void loadData()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#B91C1C] text-white text-xs font-bold cursor-pointer shrink-0"
          >
            <RefreshCw size={13} />
            <span>Retry</span>
          </button>
        </div>
      ) : tabCampaigns.length === 0 ? (
        <div className="p-10 rounded-2xl bg-white dark:bg-[#161B26] border border-slate-200 dark:border-slate-800 text-center space-y-3">
          <Megaphone className="w-8 h-8 mx-auto text-slate-400" />
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
            No {activeTab === 'HOME_CAROUSEL' ? 'Homepage Carousel' : 'First-Visit Popup'} Campaigns Yet
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {activeTab === 'HOME_CAROUSEL'
              ? 'When no active homepage banners exist, the homepage renders cleanly without an empty promotional box.'
              : 'Create a scheduled or active popup announcement with browser or session frequency controls.'}
          </p>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#B91C1C] hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
          >
            <Plus size={14} />
            <span>Create Campaign</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {tabCampaigns.map((promo, index) => {
            const dest = resolvePromotionCtaDestination(promo);
            const liveNow = isPromotionCurrentlyEligible(promo);
            return (
              <div
                key={promo.id}
                className="p-4 rounded-2xl bg-white dark:bg-[#161B26] border border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="flex items-start gap-4 min-w-0">
                  <div className="w-28 sm:w-36 aspect-[16/9] rounded-xl overflow-hidden bg-slate-900 border border-slate-200 dark:border-slate-700 shrink-0">
                    {promo.desktopImageUrl ? (
                      <img
                        src={promo.desktopImageUrl}
                        alt={promo.imageAlt || promo.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-400">
                        No Image
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-wider border rounded-sm ${STATUS_STYLE[promo.status]}`}
                      >
                        {promo.status}
                      </span>
                      {liveNow ? (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                          • Live on Site
                        </span>
                      ) : promo.status === 'SCHEDULED' && promo.startAt ? (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                          • Scheduled for {toDateInputValue(promo.startAt)}
                        </span>
                      ) : promo.status === 'ACTIVE' && promo.endAt ? (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                          • Ended {toDateInputValue(promo.endAt)}
                        </span>
                      ) : null}
                      {promo.placement === 'FIRST_VISIT_POPUP' && (
                        <span className="text-[10px] font-semibold text-slate-500">
                          {promo.popupFrequency === 'EVERY_N_DAYS'
                            ? `Every ${promo.popupIntervalDays || 7} days`
                            : promo.popupFrequency === 'ONCE_PER_SESSION'
                            ? 'Once per session'
                            : 'Once per browser'}
                        </span>
                      )}
                    </div>

                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white truncate">
                      {promo.title}
                    </h3>
                    {promo.subtitle && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                        {promo.subtitle}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        CTA: &ldquo;{promo.ctaLabel}&rdquo;
                      </span>
                      {dest && (
                        <span className="font-mono text-[10px] truncate max-w-xs">
                          → {dest.href}
                        </span>
                      )}
                      {(promo.startAt || promo.endAt) && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar size={11} />
                          {toDateInputValue(promo.startAt) || 'Now'} to{' '}
                          {toDateInputValue(promo.endAt) || 'Ongoing'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Controls */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {activeTab === 'HOME_CAROUSEL' && tabCampaigns.length > 1 && (
                    <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => void handleReorder(index, -1)}
                        title="Move slide up"
                        className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowUp size={13} />
                      </button>
                      <button
                        type="button"
                        disabled={index === tabCampaigns.length - 1}
                        onClick={() => void handleReorder(index, 1)}
                        title="Move slide down"
                        className="p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer border-l border-slate-200 dark:border-slate-700"
                      >
                        <ArrowDown size={13} />
                      </button>
                    </div>
                  )}

                  {promo.status === 'ACTIVE' ? (
                    <button
                      type="button"
                      onClick={() => void handleStatusChange(promo, 'PAUSED')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-xs font-bold hover:bg-amber-100 cursor-pointer"
                    >
                      <Pause size={12} /> Pause
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleStatusChange(promo, 'ACTIVE')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-900 text-xs font-bold hover:bg-emerald-100 cursor-pointer"
                    >
                      <Play size={12} /> Activate
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={async () => {
                      const shareUrl = buildCampaignShareUrl({
                        id: promo.id,
                        ctaTargetType: promo.ctaTargetType,
                        programSlug: promo.programSlug,
                        programId: promo.programId,
                        programRootKey: promo.programRootKey,
                        internalPath: promo.internalPath,
                        externalUrl: promo.externalUrl,
                      });
                      const ok = await copyTextToClipboard(shareUrl);
                      if (ok) {
                        toast.success(`Share link copied: ${shareUrl}`);
                      } else {
                        toast.error('Could not copy share link.');
                      }
                    }}
                    title="Copy campaign share link"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <Share2 size={12} /> Copy Share Link
                  </button>

                  <button
                    type="button"
                    onClick={() => openEditModal(promo)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                  >
                    <Edit2 size={12} /> Edit
                  </button>

                  {promo.status !== 'ARCHIVED' && (
                    <button
                      type="button"
                      onClick={() => void handleStatusChange(promo, 'ARCHIVED')}
                      title="Archive campaign"
                      className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                    >
                      <Archive size={13} />
                    </button>
                  )}

                  {confirmDeleteId === promo.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void handleDelete(promo.id)}
                        className="px-2.5 py-1.5 rounded-lg bg-[#B91C1C] text-white text-xs font-bold cursor-pointer"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(promo.id)}
                      title="Delete campaign"
                      className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-[#B91C1C] cursor-pointer"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Campaign Modal */}
      {editorOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-4xl bg-white dark:bg-[#111827] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden my-8">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h2 className="text-base font-black text-slate-900 dark:text-white">
                  {draft.id ? 'Edit Promotion Campaign' : 'Create Promotion Campaign'}
                </h2>
                <p className="text-xs text-slate-500">
                  Configure artwork, schedule, and independent CTA routing before publishing.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
              {/* Basics */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Campaign Title *
                  </label>
                  <input
                    required
                    value={draft.title}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    placeholder="e.g., Summer Coding & Robotics Intensive"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Placement
                  </label>
                  <select
                    value={draft.placement}
                    onChange={(e) =>
                      setDraft({ ...draft, placement: e.target.value as PromotionPlacement })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold"
                  >
                    <option value="HOME_CAROUSEL">Homepage Carousel</option>
                    <option value="FIRST_VISIT_POPUP">First-Visit Popup</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Subtitle / Supporting Copy
                  </label>
                  <input
                    value={draft.subtitle}
                    onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })}
                    placeholder="Concise message displayed under the headline"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Status
                  </label>
                  <select
                    value={draft.status}
                    onChange={(e) =>
                      setDraft({ ...draft, status: e.target.value as PromotionStatus })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold"
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="SCHEDULED">Scheduled</option>
                    <option value="ACTIVE">Active (Live)</option>
                    <option value="PAUSED">Paused</option>
                    <option value="ARCHIVED">Archived</option>
                  </select>
                </div>
              </div>

              {/* Cloudinary Artwork Uploads */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/50 space-y-2">
                  <CloudinaryImageUpload
                    label="Desktop Banner Image *"
                    value={draft.desktopImageUrl}
                    onChange={(url) => setDraft({ ...draft, desktopImageUrl: url })}
                    helpText="Recommended: 1600 × 600 px (landscape 8:3)"
                  />
                </div>
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/50 space-y-2">
                  <CloudinaryImageUpload
                    label="Mobile Banner Image (Optional)"
                    value={draft.mobileImageUrl}
                    onChange={(url) => setDraft({ ...draft, mobileImageUrl: url })}
                    helpText="Recommended: 1080 × 720 px (falls back to desktop if omitted)"
                  />
                </div>
              </div>

              {/* Independent CTA Configuration */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
                <h3 className="font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Call-to-Action &amp; Destination Link
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      CTA Button Label *
                    </label>
                    <input
                      required
                      value={draft.ctaLabel}
                      onChange={(e) => setDraft({ ...draft, ctaLabel: e.target.value })}
                      placeholder="e.g., Enrol Now"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Destination Type
                    </label>
                    <select
                      value={draft.ctaTargetType}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          ctaTargetType: e.target.value as PromotionCtaTargetType,
                        })
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold"
                    >
                      <option value="PROGRAM_CATALOG">Programme Catalogue Category</option>
                      <option value="INDIVIDUAL_PROGRAM">Individual Programme</option>
                      <option value="INTERNAL_PAGE">Internal Website Page</option>
                      <option value="EXTERNAL_URL">External HTTPS URL</option>
                    </select>
                  </div>
                </div>

                {draft.ctaTargetType === 'PROGRAM_CATALOG' && (
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Canonical Programme Root
                    </label>
                    <select
                      value={draft.programRootKey}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          programRootKey: e.target.value as CanonicalRootKey,
                        })
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold"
                    >
                      {PRIMARY_PROGRAM_ROOTS.map((r) => (
                        <option key={r.key} value={r.key}>
                          {r.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {draft.ctaTargetType === 'INDIVIDUAL_PROGRAM' && (
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Target Published Programme
                    </label>
                    <select
                      value={draft.programId}
                      onChange={(e) => {
                        const found = programs.find((p) => p.id === e.target.value);
                        setDraft({
                          ...draft,
                          programId: e.target.value,
                          programSlug: found?.slug || e.target.value,
                        });
                      }}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold"
                    >
                      <option value="">Select a programme...</option>
                      {programs.map((p) => {
                        const crumbs = getProgramBreadcrumbs(p.id, programsMap);
                        const label =
                          crumbs.length > 1 ? crumbs.map((c) => c.title).join(' › ') : p.title;
                        return (
                          <option key={p.id} value={p.id}>
                            {label}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}

                {draft.ctaTargetType === 'INTERNAL_PAGE' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Quick Select Page
                      </label>
                      <select
                        value={
                          INTERNAL_PAGE_OPTIONS.some((o) => o.value === draft.internalPath)
                            ? draft.internalPath
                            : ''
                        }
                        onChange={(e) => {
                          if (e.target.value) {
                            setDraft({ ...draft, internalPath: e.target.value });
                          }
                        }}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                      >
                        <option value="">Custom path...</option>
                        {INTERNAL_PAGE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Internal Path (starts with /)
                      </label>
                      <input
                        value={draft.internalPath}
                        onChange={(e) => setDraft({ ...draft, internalPath: e.target.value })}
                        placeholder="/programs"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
                      />
                    </div>
                  </div>
                )}

                {draft.ctaTargetType === 'EXTERNAL_URL' && (
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      External HTTPS URL
                    </label>
                    <input
                      type="url"
                      value={draft.externalUrl}
                      onChange={(e) => setDraft({ ...draft, externalUrl: e.target.value })}
                      placeholder="https://example.org/event"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono"
                    />
                  </div>
                )}

                {previewDestination && (
                  <p className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400">
                    Resolved destination: {previewDestination.href}
                    {previewDestination.isExternal ? ' (opens in new tab)' : ''}
                  </p>
                )}
              </div>

              {/* Schedule & Popup Frequency */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Scheduled Launch Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={draft.startAt}
                    onChange={(e) => setDraft({ ...draft, startAt: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                  <p className="mt-1 text-[10px] text-slate-500">
                    Delays display when status is Scheduled. Active banners go live immediately.
                  </p>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Auto-Expire Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={draft.endAt}
                    onChange={(e) => setDraft({ ...draft, endAt: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                  <p className="mt-1 text-[10px] text-slate-500">
                    Automatically hides the banner after this date.
                  </p>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Accessible Image Alt Text
                  </label>
                  <input
                    value={draft.imageAlt}
                    onChange={(e) => setDraft({ ...draft, imageAlt: e.target.value })}
                    placeholder="Describe the promotion artwork"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {draft.placement === 'FIRST_VISIT_POPUP' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Display Frequency
                    </label>
                    <select
                      value={draft.popupFrequency}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          popupFrequency: e.target.value as PopupFrequency,
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold"
                    >
                      <option value="ONCE_PER_BROWSER">Once per browser</option>
                      <option value="ONCE_PER_SESSION">Once per session</option>
                      <option value="EVERY_N_DAYS">Every N days</option>
                    </select>
                  </div>
                  {draft.popupFrequency === 'EVERY_N_DAYS' && (
                    <div>
                      <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Repeat Interval (Days)
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={draft.popupIntervalDays}
                        onChange={(e) =>
                          setDraft({ ...draft, popupIntervalDays: Number(e.target.value) || 7 })
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Appearance Delay (ms)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={250}
                      value={draft.popupDelayMs}
                      onChange={(e) =>
                        setDraft({ ...draft, popupDelayMs: Number(e.target.value) || 0 })
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              )}

              {/* Live Desktop & Mobile Preview */}
              <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
                    Live Responsive Preview
                  </span>
                  <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-xs">
                    <button
                      type="button"
                      onClick={() => setPreviewDevice('desktop')}
                      className={`px-3 py-1.5 flex items-center gap-1.5 font-bold cursor-pointer ${
                        previewDevice === 'desktop'
                          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <Monitor size={13} /> Desktop
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewDevice('mobile')}
                      className={`px-3 py-1.5 flex items-center gap-1.5 font-bold cursor-pointer ${
                        previewDevice === 'mobile'
                          ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                          : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <Smartphone size={13} /> Mobile
                    </button>
                  </div>
                </div>

                <div
                  className={`mx-auto rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-950 relative ${
                    previewDevice === 'mobile' ? 'max-w-xs aspect-[3/2]' : 'w-full aspect-[8/3]'
                  }`}
                >
                  {previewImage ? (
                    <img
                      src={previewImage}
                      alt={draft.imageAlt || draft.title || 'Preview'}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
                      Upload a banner image to preview
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/35 to-transparent flex flex-col justify-end p-4 sm:p-6">
                    <div className="text-sm sm:text-lg font-black text-white leading-tight">
                      {draft.title || 'Campaign Headline Preview'}
                    </div>
                    {draft.subtitle && (
                      <div className="text-[11px] sm:text-xs text-slate-200 mt-1 line-clamp-2">
                        {draft.subtitle}
                      </div>
                    )}
                    <div className="mt-2.5">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#B91C1C] text-white text-[11px] font-bold">
                        {draft.ctaLabel || 'Learn More'}
                        {previewDestination?.isExternal && <ExternalLink size={11} />}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditorOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#B91C1C] hover:bg-red-700 text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  <span>{saving ? 'Saving...' : 'Save Campaign'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPromotions;
