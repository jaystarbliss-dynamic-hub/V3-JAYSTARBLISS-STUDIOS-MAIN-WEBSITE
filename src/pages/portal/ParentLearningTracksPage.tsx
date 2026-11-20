import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookOpen, Compass, Loader2 } from 'lucide-react';
import { auth } from '../../lib/firebase';
import SEO from '../../components/ui/SEO';
import { ParentLearningTracks } from '../../components/portal/ParentLearningTracks';
import {
  PortalProgramExplorer,
  type LinkedChildSummary,
} from '../../components/portal/PortalProgramExplorer';
import { resolveParentLinkedChildren } from '../../lib/academicSyncEngine';
import { getEffectiveAuth } from '../../utils/impersonation';

const ParentLearningTracksPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab =
    searchParams.get('tab') === 'explore' ||
    searchParams.get('programId') ||
    searchParams.get('programSlug')
      ? 'explore'
      : 'tracks';

  const [activeTab, setActiveTab] = useState<'tracks' | 'explore'>(initialTab);
  const [children, setChildren] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadChildren = useCallback(async () => {
    setLoading(true);
    try {
      const effective = getEffectiveAuth();
      const uid = effective.effectiveUid || auth.currentUser?.uid || '';
      const email =
        effective.effectiveEmail ||
        auth.currentUser?.email ||
        sessionStorage.getItem('userEmail') ||
        undefined;
      if (!uid && !email) {
        setChildren([]);
        return;
      }
      const linked = await resolveParentLinkedChildren(uid, email);
      setChildren(Array.isArray(linked) ? linked : []);
    } catch (err) {
      console.error('Failed to resolve linked children:', err);
      setChildren([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadChildren();
  }, [loadChildren]);

  useEffect(() => {
    if (
      searchParams.get('tab') === 'explore' ||
      searchParams.get('programId') ||
      searchParams.get('programSlug')
    ) {
      setActiveTab('explore');
    }
  }, [searchParams]);

  const linkedSummaries: LinkedChildSummary[] = children.map((c: any) => ({
    id: String(c.id || c.studentId || ''),
    name: String(c.fullName || c.name || c.studentName || 'Student'),
    className: c.class || c.grade || c.classLevel || '',
  })).filter((c) => Boolean(c.id));

  const switchTab = (next: 'tracks' | 'explore') => {
    setActiveTab(next);
    const params = new URLSearchParams(searchParams);
    if (next === 'explore') {
      params.set('tab', 'explore');
    } else {
      params.delete('tab');
      params.delete('programId');
      params.delete('programSlug');
    }
    setSearchParams(params, { replace: true });
  };

  const effective = getEffectiveAuth();
  const parentUid = effective.effectiveUid || auth.currentUser?.uid || '';
  const parentEmail =
    effective.effectiveEmail ||
    auth.currentUser?.email ||
    sessionStorage.getItem('userEmail') ||
    '';
  const parentName =
    sessionStorage.getItem('userName') || auth.currentUser?.displayName || 'Parent';

  return (
    <div className="space-y-6">
      <SEO title="Learning & Tracks | Parent Portal" noindex />

      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#B91C1C]">
            Parent Academic Hub
          </p>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
            Learning &amp; Tracks
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Monitor your children&apos;s active pathways or explore additional programmes to enrol a
            child.
          </p>
        </div>

        <div
          className="inline-flex rounded-xl p-1 bg-slate-100 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 self-start"
          role="tablist"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'tracks'}
            onClick={() => switchTab('tracks')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              activeTab === 'tracks'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <BookOpen size={14} />
            <span>Children&apos;s Tracks</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'explore'}
            onClick={() => switchTab('explore')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              activeTab === 'explore'
                ? 'bg-[#B91C1C] text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Compass size={14} />
            <span>Explore Programmes</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-16 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-brand-red" />
        </div>
      ) : activeTab === 'tracks' ? (
        <ParentLearningTracks students={children} />
      ) : (
        <PortalProgramExplorer
          mode="parent"
          initialProgramId={searchParams.get('programId')}
          initialProgramSlug={searchParams.get('programSlug')}
          parentContext={{
            parentUid,
            parentEmail,
            parentName,
            linkedChildren: linkedSummaries,
            onRequestSubmitted: () => {
              void loadChildren();
            },
          }}
        />
      )}
    </div>
  );
};

export default ParentLearningTracksPage;
