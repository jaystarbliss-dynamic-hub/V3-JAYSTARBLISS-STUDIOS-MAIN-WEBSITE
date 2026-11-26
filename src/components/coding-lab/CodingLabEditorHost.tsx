import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Cloud,
  CloudOff,
  Code2,
  Download,
  FilePlus2,
  FolderOpen,
  HardDrive,
  Info,
  Loader2,
  Lock,
  Save,
  Send,
  AlertCircle,
  BookOpen,
  RotateCcw,
  Maximize2,
} from 'lucide-react';
import { CODING_LAB_CONFIG } from '../../config/codingLabConfig';
import type {
  CodingLabAssetManifestEntry,
  CodingLabAssessmentConfig,
  CodingLabMode,
  CodingLabSaveState,
  CodingLabSubmissionRecord,
} from '../../types/codingLab';
import {
  buildLocalDraftKey,
  clearLocalDraft,
  loadLocalDraft,
  saveLocalDraft,
} from '../../services/codingLab/CodingLabLocalStorage';
import {
  downloadSb3File,
  parseAndValidateSb3,
} from '../../services/codingLab/ScratchProjectAdapter';
import {
  buildAssessmentProjectId,
  loadAssessmentProjectFromFirestore,
  loadStarterProjectBuffer,
  saveAssessmentProjectToFirestore,
} from '../../services/codingLab/CodingLabProjectService';
import { submitCodingLabAssessment } from '../../services/codingLab/CodingLabSubmissionService';
import { sha256Hex } from '../../../api/_lib/coding-lab-sb3-security.js';
import { CodingLabComplianceModal } from './CodingLabComplianceModal';

export interface CodingLabAssessmentContext {
  assessmentId: string;
  attemptId: string;
  ownerUid: string;
  learnerName: string;
  schoolId?: string;
  tutorId?: string;
  title: string;
  subject?: string;
  instructions?: string;
  maxScore?: number;
  durationMinutes?: number | null;
  deadlineAt?: string | null;
  attemptNumber?: number;
  maxAttempts?: number;
  releaseGradesPolicy?: string;
  codingConfig?: CodingLabAssessmentConfig;
  initialProjectId?: string;
  initialSb3Buffer?: ArrayBuffer | null;
}

export interface CodingLabEditorHostProps {
  mode: CodingLabMode;
  readOnly?: boolean;
  initialTitle?: string;
  initialSb3Buffer?: ArrayBuffer | null;
  assessmentContext?: CodingLabAssessmentContext;
  onExit?: () => void;
  exitLabel?: string;
  fullscreenUrl?: string;
  onSubmitted?: (submission: CodingLabSubmissionRecord) => void;
  onProjectJsonSnapshot?: (projectJson: Record<string, any>) => void;
}

let mountedCodingLabInstances = 0;

interface PendingBridgeCall {
  resolve: (data: any) => void;
  reject: (err: Error) => void;
  timer: number;
}

export const CodingLabEditorHost: React.FC<CodingLabEditorHostProps> = ({
  mode,
  readOnly = false,
  initialTitle,
  initialSb3Buffer,
  assessmentContext,
  onExit,
  exitLabel,
  fullscreenUrl,
  onSubmitted,
  onProjectJsonSnapshot,
}) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingCallsRef = useRef<Map<string, PendingBridgeCall>>(new Map());
  const localDebounceRef = useRef<number | null>(null);
  const cloudDebounceRef = useRef<number | null>(null);
  const lastSavedCompositeHashRef = useRef<string | null>(null);
  const currentRevisionRef = useRef<number>(0);
  const currentManifestRef = useRef<CodingLabAssetManifestEntry[]>([]);
  const hydratedRef = useRef<boolean>(false);

  const [editorReady, setEditorReady] = useState(false);
  const [hydrating, setHydrating] = useState(true);
  const [projectTitle, setProjectTitle] = useState<string>(
    initialTitle || assessmentContext?.title || 'Untitled Coding Project'
  );
  const [saveState, setSaveState] = useState<CodingLabSaveState>('idle');
  const [saveMessage, setSaveMessage] = useState<string>('');
  const [errorBanner, setErrorBanner] = useState<string>('');
  const [recoveryBanner, setRecoveryBanner] = useState<string>('');
  const [showInstructionsPanel, setShowInstructionsPanel] = useState<boolean>(
    mode === 'assessment' && !readOnly
  );
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittedLocked, setSubmittedLocked] = useState<boolean>(readOnly);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  const effectiveReadOnly = readOnly || submittedLocked;

  const localDraftKey = buildLocalDraftKey({
    mode,
    ownerUid: assessmentContext?.ownerUid,
    assessmentId: assessmentContext?.assessmentId,
    attemptId: assessmentContext?.attemptId,
  });

  // Hide floating overlays (such as the floating WhatsApp widget) while Coding Lab is mounted
  useEffect(() => {
    mountedCodingLabInstances += 1;
    if (typeof document !== 'undefined') {
      document.body.dataset.codingLabActive = '1';
      window.dispatchEvent(new Event('jdi-coding-lab-visibility'));
    }
    return () => {
      mountedCodingLabInstances = Math.max(0, mountedCodingLabInstances - 1);
      if (typeof document !== 'undefined' && mountedCodingLabInstances === 0) {
        delete document.body.dataset.codingLabActive;
        window.dispatchEvent(new Event('jdi-coding-lab-visibility'));
      }
    };
  }, []);

  // Countdown timer when assessment has a deadline
  useEffect(() => {
    if (mode !== 'assessment' || !assessmentContext?.deadlineAt || effectiveReadOnly) {
      setRemainingSeconds(null);
      return;
    }
    const deadlineMs = Date.parse(assessmentContext.deadlineAt);
    if (!Number.isFinite(deadlineMs)) return;

    const tick = () => {
      const diff = Math.max(0, Math.floor((deadlineMs - Date.now()) / 1000));
      setRemainingSeconds(diff);
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [mode, assessmentContext?.deadlineAt, effectiveReadOnly]);

  const callEditorBridge = useCallback(
    <T = any>(
      type: string,
      payload: Record<string, any> = {},
      transfer: Transferable[] = [],
      timeoutMs = 20000
    ): Promise<T> => {
      return new Promise((resolve, reject) => {
        const win = iframeRef.current?.contentWindow;
        if (!win) {
          reject(new Error('Coding Lab editor frame is not ready yet.'));
          return;
        }
        const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const timer = window.setTimeout(() => {
          pendingCallsRef.current.delete(requestId);
          reject(new Error(`Coding Lab editor request timed out (${type}).`));
        }, timeoutMs);

        pendingCallsRef.current.set(requestId, { resolve, reject, timer });
        win.postMessage({ type, requestId, ...payload }, window.location.origin, transfer);
      });
    },
    []
  );

  const exportCurrentSb3 = useCallback(async (): Promise<{
    sb3Buffer: ArrayBuffer;
    projectJsonString: string;
  }> => {
    const res = await callEditorBridge<{
      sb3Buffer: ArrayBuffer;
      projectJsonString: string;
    }>('CODING_LAB_EXPORT_SB3');
    return {
      sb3Buffer: res.sb3Buffer,
      projectJsonString: res.projectJsonString,
    };
  }, [callEditorBridge]);

  const loadSb3IntoEditor = useCallback(
    async (buffer: ArrayBuffer): Promise<void> => {
      const copy = buffer.slice(0);
      await callEditorBridge('CODING_LAB_LOAD_SB3', { buffer: copy }, [copy]);
    },
    [callEditorBridge]
  );

  const hasValidStageInSb3 = useCallback(async (buffer: ArrayBuffer): Promise<boolean> => {
    try {
      const parsed = await parseAndValidateSb3(buffer, {
        mode,
        rebuildSanitizedZip: false,
      });
      const targets = Array.isArray(parsed.projectJson?.targets) ? parsed.projectJson.targets : [];
      return targets.some((t: any) => t && t.isStage === true);
    } catch {
      return false;
    }
  }, [mode]);

  // Save working copy to IndexedDB (device-local recovery only)
  const persistLocalRecovery = useCallback(async () => {
    if (!editorReady || effectiveReadOnly) return;
    try {
      setSaveState((prev) => (prev === 'uploading_assets' || prev === 'saving_lms' ? prev : 'saving_local'));
      const { sb3Buffer, projectJsonString } = await exportCurrentSb3();
      // Never persist a broken/empty project that lacks a Stage target
      let parsedSnapshot: Record<string, any> | null = null;
      try {
        parsedSnapshot = projectJsonString ? JSON.parse(projectJsonString) : null;
      } catch {
        parsedSnapshot = null;
      }
      const hasStage = Array.isArray(parsedSnapshot?.targets)
        ? parsedSnapshot.targets.some((t: any) => t && t.isStage === true)
        : false;
      if (!hasStage) {
        return;
      }

      const projectHash = await sha256Hex(new Uint8Array(sb3Buffer));
      await saveLocalDraft({
        key: localDraftKey,
        mode,
        title: projectTitle,
        sb3Buffer,
        projectHash,
        savedAt: new Date().toISOString(),
        assessmentId: assessmentContext?.assessmentId,
        attemptId: assessmentContext?.attemptId,
        ownerUid: assessmentContext?.ownerUid,
      });
      if (onProjectJsonSnapshot && parsedSnapshot) {
        onProjectJsonSnapshot(parsedSnapshot);
      }
      setSaveState((prev) =>
        prev === 'uploading_assets' || prev === 'saving_lms' || prev === 'saved_lms'
          ? prev
          : 'saved_local'
      );
    } catch {
      // Local recovery failure should not crash editing
    }
  }, [
    editorReady,
    effectiveReadOnly,
    exportCurrentSb3,
    localDraftKey,
    mode,
    projectTitle,
    assessmentContext?.assessmentId,
    assessmentContext?.attemptId,
    assessmentContext?.ownerUid,
    onProjectJsonSnapshot,
  ]);

  // Controlled Cloud Save (Assessment Mode ONLY — NEVER called in Playground Mode!)
  const saveToLmsCloud = useCallback(
    async (force = false): Promise<boolean> => {
      if (mode !== 'assessment' || !assessmentContext || effectiveReadOnly) {
        return false;
      }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setSaveState('offline_pending');
        setSaveMessage('Offline — changes saved on this device. Cloud sync pending.');
        return false;
      }

      setErrorBanner('');
      try {
        const { sb3Buffer } = await exportCurrentSb3();
        // Always update local IndexedDB copy first
        const localHash = await sha256Hex(new Uint8Array(sb3Buffer));
        await saveLocalDraft({
          key: localDraftKey,
          mode: 'assessment',
          title: projectTitle,
          sb3Buffer,
          projectHash: localHash,
          savedAt: new Date().toISOString(),
          assessmentId: assessmentContext.assessmentId,
          attemptId: assessmentContext.attemptId,
          ownerUid: assessmentContext.ownerUid,
        }).catch(() => undefined);

        const projectId =
          assessmentContext.initialProjectId ||
          buildAssessmentProjectId(assessmentContext.assessmentId, assessmentContext.attemptId);

        const result = await saveAssessmentProjectToFirestore({
          projectId,
          ownerUid: assessmentContext.ownerUid,
          assessmentId: assessmentContext.assessmentId,
          attemptId: assessmentContext.attemptId,
          schoolId: assessmentContext.schoolId,
          title: projectTitle,
          sb3Buffer,
          existingRevision: currentRevisionRef.current,
          lastSavedCompositeHash: force ? null : lastSavedCompositeHashRef.current,
          existingManifest: currentManifestRef.current,
          onStageChange: (stage) => {
            setSaveState(stage);
            setSaveMessage(
              stage === 'uploading_assets'
                ? 'Uploading custom images...'
                : 'Saving project to LMS...'
            );
          },
        });

        lastSavedCompositeHashRef.current = result.compositeHash;
        currentRevisionRef.current = result.revision;
        currentManifestRef.current = result.assetManifest;
        setSaveState('saved_lms');
        setSaveMessage(
          result.skipped
            ? 'All changes already saved to LMS'
            : `Saved to LMS (rev ${result.revision})`
        );
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Could not save to the LMS.';
        setSaveState('error');
        setSaveMessage('Save failed');
        setErrorBanner(msg);
        return false;
      }
    },
    [mode, assessmentContext, effectiveReadOnly, exportCurrentSb3, localDraftKey, projectTitle]
  );

  // Schedule local recovery + debounced 25s cloud autosave upon Scratch VM changes
  const handleEditorProjectChanged = useCallback(() => {
    if (effectiveReadOnly || !hydratedRef.current) return;

    // 1. Debounced local IndexedDB recovery (1.5s)
    if (localDebounceRef.current) window.clearTimeout(localDebounceRef.current);
    localDebounceRef.current = window.setTimeout(() => {
      void persistLocalRecovery();
    }, CODING_LAB_CONFIG.localRecoveryDebounceMs);

    // 2. Debounced cloud autosave (25s) in Assessment mode ONLY
    if (mode === 'assessment' && assessmentContext) {
      if (cloudDebounceRef.current) window.clearTimeout(cloudDebounceRef.current);
      cloudDebounceRef.current = window.setTimeout(() => {
        void saveToLmsCloud(false);
      }, CODING_LAB_CONFIG.cloudAutosaveDebounceMs);
    }
  }, [effectiveReadOnly, persistLocalRecovery, mode, assessmentContext, saveToLmsCloud]);

  // Listen to same-origin postMessage events from the self-hosted Scratch 3 frame
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const msg = event.data;
      if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return;

      if (msg.type === 'CODING_LAB_READY') {
        setEditorReady(true);
        return;
      }

      if (msg.type === 'CODING_LAB_PROJECT_CHANGED') {
        handleEditorProjectChanged();
        return;
      }

      if (msg.type === 'CODING_LAB_RESPONSE' && msg.requestId) {
        const pending = pendingCallsRef.current.get(msg.requestId);
        if (!pending) return;
        window.clearTimeout(pending.timer);
        pendingCallsRef.current.delete(msg.requestId);
        if (msg.ok) {
          pending.resolve(msg);
        } else {
          pending.reject(new Error(msg.error || 'Coding Lab editor operation failed.'));
        }
      }
    };

    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      if (localDebounceRef.current) window.clearTimeout(localDebounceRef.current);
      if (cloudDebounceRef.current) window.clearTimeout(cloudDebounceRef.current);
    };
  }, [handleEditorProjectChanged]);

  // Sync readOnly state into the editor frame
  useEffect(() => {
    if (!editorReady) return;
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'CODING_LAB_SET_READ_ONLY', readOnly: effectiveReadOnly },
      window.location.origin
    );
  }, [editorReady, effectiveReadOnly]);

  // Hydrate initial project once Scratch VM signals CODING_LAB_READY
  useEffect(() => {
    if (!editorReady || hydratedRef.current) return;
    let cancelled = false;

    const hydrate = async () => {
      setHydrating(true);
      setErrorBanner('');
      try {
        // Priority 1: Explicit initialSb3Buffer (e.g., Tutor Read-Only Review mode)
        const directBuffer = initialSb3Buffer || assessmentContext?.initialSb3Buffer || null;
        if (directBuffer) {
          await loadSb3IntoEditor(directBuffer);
          if (!cancelled) hydratedRef.current = true;
          return;
        }

        // Priority 2: Assessment mode -> Load cloud draft from Firestore, else starter project, else local IndexedDB recovery
        if (mode === 'assessment' && assessmentContext) {
          const projectId =
            assessmentContext.initialProjectId ||
            buildAssessmentProjectId(assessmentContext.assessmentId, assessmentContext.attemptId);

          const [cloudLoaded, localDraft] = await Promise.all([
            loadAssessmentProjectFromFirestore(projectId).catch(() => null),
            loadLocalDraft(localDraftKey).catch(() => null),
          ]);

          if (cancelled) return;

          if (cloudLoaded) {
            currentRevisionRef.current = cloudLoaded.record.revision;
            currentManifestRef.current = cloudLoaded.record.assetManifest;
            if (cloudLoaded.record.title) setProjectTitle(cloudLoaded.record.title);
            if (cloudLoaded.record.status === 'submitted') {
              setSubmittedLocked(true);
            }

            // If a newer un-synced local recovery copy exists on this device for an active draft, prefer it and notify learner
            if (
              !readOnly &&
              cloudLoaded.record.status !== 'submitted' &&
              localDraft?.sb3Buffer &&
              localDraft.projectHash
            ) {
              const cloudTime =
                typeof (cloudLoaded.record.updatedAt as any)?.toMillis === 'function'
                  ? (cloudLoaded.record.updatedAt as any).toMillis()
                  : 0;
              const localTime = Date.parse(localDraft.savedAt || '');
              if (Number.isFinite(localTime) && localTime > cloudTime + 3000) {
                await loadSb3IntoEditor(localDraft.sb3Buffer);
                setRecoveryBanner(
                  'Recovered newer unsaved changes from this device. Click Save Progress to sync to the LMS.'
                );
                setSaveState('saved_local');
                hydratedRef.current = true;
                return;
              }
            }

            await loadSb3IntoEditor(cloudLoaded.sb3Buffer);
            setSaveState('saved_lms');
            setSaveMessage(`Loaded from LMS (rev ${cloudLoaded.record.revision})`);
            hydratedRef.current = true;
            return;
          }

          if (localDraft?.sb3Buffer) {
            const draftHasStage = await hasValidStageInSb3(localDraft.sb3Buffer);
            if (!cancelled && draftHasStage) {
              await loadSb3IntoEditor(localDraft.sb3Buffer);
              setRecoveryBanner('Recovered your working copy from this device.');
              setSaveState('saved_local');
              hydratedRef.current = true;
              return;
            }
            // Discard corrupted/stageless local recovery draft
            await clearLocalDraft(localDraftKey).catch(() => undefined);
          }

          // Load optional tutor starter project (cloning into learner session without mutating starter)
          if (assessmentContext.codingConfig?.starterProject) {
            const starterBuf = await loadStarterProjectBuffer(
              assessmentContext.codingConfig.starterProject,
              assessmentContext.assessmentId
            );
            if (!cancelled && starterBuf) {
              await loadSb3IntoEditor(starterBuf);
            }
          }
          hydratedRef.current = true;
          return;
        }

        // Priority 3: Playground / Project Showcase mode -> Check local IndexedDB recovery only (ZERO Firestore calls)
        if (mode === 'playground') {
          const localDraft = await loadLocalDraft(localDraftKey).catch(() => null);
          if (!cancelled && localDraft?.sb3Buffer) {
            const draftHasStage = await hasValidStageInSb3(localDraft.sb3Buffer);
            if (draftHasStage) {
              await loadSb3IntoEditor(localDraft.sb3Buffer);
              if (localDraft.title) setProjectTitle(localDraft.title);
              setRecoveryBanner('Recovered your previous local working copy from this device.');
              setSaveState('saved_local');
            } else {
              // Discard corrupted/stageless local draft so default Stage + Robo loads cleanly
              await clearLocalDraft(localDraftKey).catch(() => undefined);
            }
          }
          hydratedRef.current = true;
        }
      } catch (err) {
        if (!cancelled) {
          setErrorBanner(
            err instanceof Error ? err.message : 'Failed to load initial Coding Lab project.'
          );
          hydratedRef.current = true;
        }
      } finally {
        if (!cancelled) setHydrating(false);
      }
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [editorReady, mode, readOnly, initialSb3Buffer, assessmentContext, localDraftKey, loadSb3IntoEditor, hasValidStageInSb3]);

  // Retry online sync if browser regains network in Assessment mode
  useEffect(() => {
    if (mode !== 'assessment' || effectiveReadOnly) return;
    const handleOnline = () => {
      if (saveState === 'offline_pending') {
        void saveToLmsCloud(false);
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [mode, effectiveReadOnly, saveState, saveToLmsCloud]);

  // Toolbar Actions
  const handleDownloadSb3 = async () => {
    setErrorBanner('');
    try {
      const { sb3Buffer } = await exportCurrentSb3();
      downloadSb3File(sb3Buffer, projectTitle || 'coding-lab-project');
      if (mode === 'playground') {
        setSaveState('saved_local');
        setSaveMessage('Downloaded .sb3 to your computer');
      }
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Could not export .sb3 file.');
    }
  };

  const handleImportSb3File = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || effectiveReadOnly) return;

    setErrorBanner('');
    try {
      const rawBuffer = await file.arrayBuffer();
      const parsed = await parseAndValidateSb3(rawBuffer, {
        mode,
        rebuildSanitizedZip: true,
      });
      await loadSb3IntoEditor(parsed.sanitizedSb3Buffer || rawBuffer);
      const cleanName = file.name.replace(/\.sb3$/i, '').trim();
      if (cleanName && mode === 'playground') {
        setProjectTitle(cleanName);
      }
      if (parsed.warnings.length > 0) {
        setRecoveryBanner(parsed.warnings[0]);
      }
      await persistLocalRecovery();
    } catch (err) {
      setErrorBanner(
        err instanceof Error ? err.message : 'Could not import the selected .sb3 file.'
      );
    }
  };

  const handleResetNewProject = async () => {
    if (effectiveReadOnly || mode !== 'playground') return;
    await clearLocalDraft(localDraftKey);
    hydratedRef.current = false;
    setProjectTitle('Untitled Coding Project');
    setRecoveryBanner('');
    setSaveState('idle');
    setSaveMessage('');
    if (iframeRef.current) {
      iframeRef.current.src = `${CODING_LAB_CONFIG.editorFrameUrl}?reset=${Date.now()}`;
      setEditorReady(false);
    }
  };

  const handleConfirmSubmit = async () => {
    if (mode !== 'assessment' || !assessmentContext || effectiveReadOnly || submitting) return;
    setSubmitting(true);
    setErrorBanner('');
    try {
      const { sb3Buffer } = await exportCurrentSb3();
      const submission = await submitCodingLabAssessment({
        assessmentId: assessmentContext.assessmentId,
        attemptId: assessmentContext.attemptId,
        ownerUid: assessmentContext.ownerUid,
        learnerName: assessmentContext.learnerName,
        schoolId: assessmentContext.schoolId,
        examTitle: assessmentContext.title,
        examSubject: assessmentContext.subject,
        tutorId: assessmentContext.tutorId,
        title: projectTitle,
        sb3Buffer,
        codingConfig: assessmentContext.codingConfig,
        maxScore: assessmentContext.maxScore,
        releaseGradesPolicy: assessmentContext.releaseGradesPolicy,
        existingRevision: currentRevisionRef.current,
        existingManifest: currentManifestRef.current,
        onStageChange: (stage) => {
          setSaveState(stage);
          setSaveMessage(
            stage === 'uploading_assets'
              ? 'Uploading custom images...'
              : 'Saving & locking submission...'
          );
        },
      });

      setSubmittedLocked(true);
      setShowSubmitConfirm(false);
      setSaveState('saved_lms');
      setSaveMessage('Submitted & locked');
      onSubmitted?.(submission);
    } catch (err) {
      setShowSubmitConfirm(false);
      setSaveState('error');
      setErrorBanner(
        err instanceof Error
          ? err.message
          : 'Submission failed because cloud save could not be verified. Please retry.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const formatTimer = (sec: number) => {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (hrs > 0) return `${hrs}:${String(mins).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(mins).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const renderSaveStatus = () => {
    if (effectiveReadOnly) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
          <Lock size={13} />
          {readOnly ? 'Read-Only Review' : 'Submitted (Locked)'}
        </span>
      );
    }

    switch (saveState) {
      case 'saving_local':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
            <Loader2 size={13} className="animate-spin" />
            Saving locally...
          </span>
        );
      case 'saved_local':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
            <HardDrive size={13} className="text-slate-500" />
            {mode === 'playground' ? 'Saved on this device' : 'Saved on this device (LMS sync pending)'}
          </span>
        );
      case 'uploading_assets':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400">
            <Loader2 size={13} className="animate-spin" />
            Uploading assets...
          </span>
        );
      case 'saving_lms':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400">
            <Loader2 size={13} className="animate-spin" />
            Saving to LMS...
          </span>
        );
      case 'saved_lms':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <Cloud size={13} />
            {saveMessage || 'Saved to LMS'}
          </span>
        );
      case 'offline_pending':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
            <CloudOff size={13} />
            Offline — cloud sync pending
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 dark:text-red-400">
            <AlertCircle size={13} />
            Save failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            {mode === 'playground' ? 'Local workspace' : 'Ready'}
          </span>
        );
    }
  };

  const rubricCriteria = assessmentContext?.codingConfig?.rubricCriteria || [];

  return (
    <div className="flex flex-col w-full h-full min-h-[640px] bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl sm:rounded-2xl overflow-hidden shadow-sm">
      {/* Compact Integrated Coding Lab Toolbar */}
      <header className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          {onExit && (
            <button
              type="button"
              onClick={onExit}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
            >
              <ArrowLeft size={14} />
              <span className="hidden sm:inline">{exitLabel || 'Back'}</span>
            </button>
          )}

          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-[#1E293B] dark:bg-white/10 text-white flex items-center justify-center shrink-0">
              <Code2 size={15} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold tracking-tight text-slate-900 dark:text-white uppercase">
                  Coding Lab
                </span>
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 hidden md:inline">
                  {mode === 'playground' ? '• Project Playground' : '• Assessment Workspace'}
                </span>
              </div>
              {mode === 'playground' && !effectiveReadOnly ? (
                <input
                  type="text"
                  value={projectTitle}
                  onChange={(e) => setProjectTitle(e.target.value)}
                  maxLength={120}
                  aria-label="Project title"
                  className="text-xs font-semibold text-slate-700 dark:text-slate-200 bg-transparent border-b border-transparent focus:border-slate-400 focus:outline-none w-44 sm:w-56 truncate"
                />
              ) : (
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[200px] sm:max-w-[300px]">
                  {projectTitle}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Center/Right Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="hidden lg:flex items-center px-2">{renderSaveStatus()}</div>

          {mode === 'assessment' && remainingSeconds !== null && !effectiveReadOnly && (
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold tabular-nums ${
                remainingSeconds < 300
                  ? 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300 border border-red-200 dark:border-red-800'
                  : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
              }`}
            >
              <Clock size={13} />
              {formatTimer(remainingSeconds)}
            </span>
          )}

          {/* Hidden .sb3 file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".sb3"
            className="hidden"
            onChange={handleImportSb3File}
          />

          {/* Playground Mode Actions (Strictly Local) */}
          {mode === 'playground' && !effectiveReadOnly && (
            <>
              <button
                type="button"
                onClick={handleResetNewProject}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Start a clean new project"
              >
                <FilePlus2 size={14} />
                <span className="hidden sm:inline">New</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <FolderOpen size={14} />
                <span className="hidden sm:inline">Open .sb3</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadSb3}
                disabled={!editorReady}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1E293B] hover:bg-slate-800 text-white text-xs font-semibold transition-colors disabled:opacity-50"
              >
                <Download size={14} />
                Save Project (.sb3)
              </button>
            </>
          )}

          {/* Assessment Mode Actions */}
          {mode === 'assessment' && (
            <>
              <button
                type="button"
                onClick={() => setShowInstructionsPanel((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                  showInstructionsPanel
                    ? 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200'
                    : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <BookOpen size={14} />
                <span className="hidden sm:inline">Task Brief</span>
                {showInstructionsPanel ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>

              {effectiveReadOnly ? (
                <button
                  type="button"
                  onClick={handleDownloadSb3}
                  disabled={!editorReady}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                >
                  <Download size={14} />
                  Download .sb3
                </button>
              ) : (
                <>
                  {assessmentContext?.codingConfig?.allowSb3Import !== false && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      title="Import a local .sb3 project"
                    >
                      <FolderOpen size={14} />
                      <span className="hidden md:inline">Import .sb3</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void saveToLmsCloud(true)}
                    disabled={!editorReady || saveState === 'saving_lms' || saveState === 'uploading_assets'}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-white transition-colors disabled:opacity-50"
                  >
                    <Save size={14} />
                    Save Progress
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSubmitConfirm(true)}
                    disabled={!editorReady || submitting}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    <Send size={14} />
                    Submit Assessment
                  </button>
                </>
              )}
            </>
          )}

          {/* Optional Fullscreen link when embedded inline */}
          {fullscreenUrl && (
            <a
              href={fullscreenUrl}
              title="Open Coding Lab in full screen"
              aria-label="Open Coding Lab in full screen"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Maximize2 size={14} />
              <span className="hidden md:inline">Full Screen</span>
            </a>
          )}

          {/* About / AGPL Compliance Button */}
          <button
            type="button"
            onClick={() => setShowAboutModal(true)}
            title="About Coding Lab & Open-Source Licences"
            aria-label="About Coding Lab & Open-Source Licences"
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Info size={16} />
          </button>
        </div>
      </header>

      {/* Mobile Save Status Bar */}
      <div className="flex lg:hidden items-center justify-between px-4 py-1.5 bg-slate-100/80 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800">
        {renderSaveStatus()}
        {mode === 'assessment' && assessmentContext?.maxScore ? (
          <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
            Max Marks: {assessmentContext.maxScore}
          </span>
        ) : null}
      </div>

      {/* Recovery / Error Notifications */}
      {recoveryBanner && (
        <div className="flex items-center justify-between gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200">
          <span className="inline-flex items-center gap-2">
            <RotateCcw size={13} className="shrink-0" />
            {recoveryBanner}
          </span>
          <button
            type="button"
            onClick={() => setRecoveryBanner('')}
            className="text-[11px] font-semibold underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {errorBanner && (
        <div className="flex items-center justify-between gap-2 px-4 py-2 bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-800/60 text-xs text-red-800 dark:text-red-200">
          <span className="inline-flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            {errorBanner}
          </span>
          <button
            type="button"
            onClick={() => setErrorBanner('')}
            className="text-[11px] font-semibold underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Collapsible Assessment Instructions & Criteria Panel */}
      {mode === 'assessment' && showInstructionsPanel && assessmentContext && (
        <section className="px-4 py-3 bg-white dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 max-h-56 overflow-y-auto shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
              {assessmentContext.subject && (
                <span className="font-semibold text-slate-900 dark:text-white">
                  {assessmentContext.subject}
                </span>
              )}
              {assessmentContext.maxScore ? (
                <span>Maximum Marks: <strong>{assessmentContext.maxScore}</strong></span>
              ) : null}
              {assessmentContext.attemptNumber ? (
                <span>
                  Attempt <strong>{assessmentContext.attemptNumber}</strong>
                  {assessmentContext.maxAttempts ? ` of ${assessmentContext.maxAttempts}` : ''}
                </span>
              ) : null}
              {assessmentContext.codingConfig?.gradingMethod && (
                <span className="capitalize">
                  Grading: <strong>{assessmentContext.codingConfig.gradingMethod}</strong>
                </span>
              )}
            </div>
          </div>

          {assessmentContext.instructions && (
            <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line mb-2.5">
              {assessmentContext.instructions}
            </p>
          )}

          {rubricCriteria.length > 0 && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                Task Checklist ({rubricCriteria.length} criteria)
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                {rubricCriteria.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-xs"
                  >
                    <span className="text-slate-700 dark:text-slate-200 truncate">{c.label}</span>
                    <span className="font-semibold text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">
                      {c.marks} mk{c.marks === 1 ? '' : 's'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Mobile & Tablet Pan/Scroll Tip */}
      <div className="flex xl:hidden items-center justify-between gap-2 px-3 py-1 bg-slate-100/90 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300 shrink-0">
        <span>Tip: Scroll left/right and up/down inside the workspace to reach Blocks, Stage, Sprites &amp; Backdrops.</span>
      </div>

      {/* Main Self-Hosted Scratch 3 Visual Programming Workspace */}
      <div
        className="relative flex-1 w-full min-h-[580px] bg-white dark:bg-slate-950 overflow-auto"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {(!editorReady || hydrating) && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-50/95 dark:bg-slate-950/95 text-slate-700 dark:text-slate-200 gap-3">
            <Loader2 size={28} className="animate-spin text-[#B91C1C]" />
            <div className="text-sm font-semibold">Loading Coding Lab Editor...</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Initializing self-hosted visual programming engine
            </div>
          </div>
        )}

        <iframe
          ref={iframeRef}
          src={`${CODING_LAB_CONFIG.editorFrameUrl}?v=20261126-2${effectiveReadOnly ? '&readonly=1' : ''}`}
          title="Coding Lab Visual Programming Workspace"
          className="w-full h-full min-w-[1024px] xl:min-w-full min-h-[640px] border-0 block"
          sandbox="allow-scripts allow-same-origin allow-downloads"
          onLoad={() => {
            iframeRef.current?.contentWindow?.postMessage(
              { type: 'CODING_LAB_PING' },
              window.location.origin
            );
          }}
        />
      </div>

      {/* Submit Assessment Confirmation Dialog */}
      {showSubmitConfirm && mode === 'assessment' && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/50 text-[#B91C1C] flex items-center justify-center shrink-0">
                <CheckCircle2 size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Submit Coding Assessment?
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                  Your latest project code and custom images will be saved to the LMS and locked as
                  your final immutable submission. You will not be able to edit this submitted
                  revision afterward.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setShowSubmitConfirm(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Continue Editing
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleConfirmSubmit()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-semibold disabled:opacity-60"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {submitting ? 'Saving & Submitting...' : 'Confirm Submission'}
              </button>
            </div>
          </div>
        </div>
      )}

      <CodingLabComplianceModal open={showAboutModal} onClose={() => setShowAboutModal(false)} />
    </div>
  );
};

export default CodingLabEditorHost;
